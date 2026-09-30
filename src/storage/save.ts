/**
 * Versioned save data + save manager.
 *
 * Storage backend is supplied by the platform adapter:
 *  - YouTube Playables → ytgame.game.loadData / saveData (cloud save)
 *  - Web → localStorage (with in-memory fallback)
 * Rules honoured (Playables integration requirements):
 *  - loadData is awaited before any saveData call.
 *  - Saves happen on material progress (piece placed / puzzle completed / settings).
 *  - Old save versions are migrated forward, never discarded.
 */
import type { EngineSnapshot } from '../puzzle/engine';
import { isDifficultyId, type DifficultyId } from '../core/config';
import { GameTimer } from '../core/timer';
import { isDateKey } from '../utils/date';

export const SAVE_VERSION = 1;

export interface Settings {
  sound: boolean;
  haptics: boolean;
  /** null = follow the system "reduce motion" preference. */
  reducedMotion: boolean | null;
  ghost: boolean;
}

export interface CardRecord {
  /** Puzzle number (0 = preview). */
  n: number;
  /** Artwork slug. */
  a: string;
  /** Title */
  t: string;
  /** Category */
  c: string;
  d: DifficultyId;
  /** Completion time (ms). */
  ms: number;
}

export interface ProgressRecord {
  /** Daily date key, or practice art slug. */
  key: string;
  d: DifficultyId;
  seed: number;
  /** Elapsed ms. */
  e: number;
  s: EngineSnapshot;
}

export interface SaveData {
  v: number;
  settings: Settings;
  /** Daily cards keyed by UTC date. */
  cards: Record<string, CardRecord>;
  /** Best times keyed "artSlug:difficulty". */
  best: Record<string, number>;
  /** Practice completions. */
  practiceSolved: number;
  progress: { daily?: ProgressRecord; practice?: ProgressRecord };
}

export function defaultSettings(): Settings {
  return { sound: true, haptics: true, reducedMotion: null, ghost: false };
}

export function defaultSave(): SaveData {
  return { v: SAVE_VERSION, settings: defaultSettings(), cards: {}, best: {}, practiceSolved: 0, progress: {} };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseProgress(v: unknown): ProgressRecord | undefined {
  if (!isObj(v) || typeof v.key !== 'string' || !isDifficultyId(v.d) || !isObj(v.s)) return undefined;
  const s = v.s as unknown as EngineSnapshot;
  if (!Array.isArray(s.p) || !Array.isArray(s.t)) return undefined;
  return { key: v.key, d: v.d, seed: Number(v.seed) >>> 0, e: GameTimer.sanitize(v.e), s };
}

/** Parse any stored string into valid SaveData. Never throws. */
export function parseSave(raw: string | null | undefined): SaveData {
  const out = defaultSave();
  if (!raw) return out;
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!isObj(doc)) return out;
  const migrated = migrate(doc);
  const st = isObj(migrated.settings) ? migrated.settings : {};
  out.settings = {
    sound: typeof st.sound === 'boolean' ? st.sound : true,
    haptics: typeof st.haptics === 'boolean' ? st.haptics : true,
    reducedMotion: typeof st.reducedMotion === 'boolean' ? st.reducedMotion : null,
    ghost: typeof st.ghost === 'boolean' ? st.ghost : false,
  };
  if (isObj(migrated.cards)) {
    for (const [k, c] of Object.entries(migrated.cards)) {
      if (!isDateKey(k) || !isObj(c) || !isDifficultyId(c.d)) continue;
      out.cards[k] = {
        n: Math.max(0, Math.floor(Number(c.n) || 0)),
        a: String(c.a ?? ''),
        t: String(c.t ?? ''),
        c: String(c.c ?? ''),
        d: c.d,
        ms: GameTimer.sanitize(c.ms),
      };
    }
  }
  if (isObj(migrated.best)) {
    for (const [k, v] of Object.entries(migrated.best)) {
      const ms = GameTimer.sanitize(v);
      if (ms > 0) out.best[k] = ms;
    }
  }
  out.practiceSolved = Math.max(0, Math.floor(Number(migrated.practiceSolved) || 0));
  if (isObj(migrated.progress)) {
    out.progress.daily = parseProgress(migrated.progress.daily);
    out.progress.practice = parseProgress(migrated.progress.practice);
  }
  return out;
}

/**
 * Forward migrations. Each step upgrades one version. Future versions add a
 * case here — cloud saves from every previous release must keep working.
 */
export function migrate(doc: Record<string, unknown>): Record<string, unknown> {
  let d = { ...doc };
  const v = typeof d.v === 'number' ? d.v : 0;
  if (v < 1) {
    // v0 (pre-release) stored `completed` instead of `cards`.
    if (isObj(d.completed) && !d.cards) d.cards = d.completed;
    d = { ...d, v: 1 };
  }
  return d;
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}

export interface SaveBackend {
  loadData(): Promise<string>;
  saveData(data: string): Promise<void>;
}

export class SaveManager {
  private _data: SaveData = defaultSave();
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private failures = 0;

  constructor(
    private readonly backend: SaveBackend,
    private readonly onError: (err: unknown, consecutive: number) => void = () => undefined,
    private readonly debounceMs = 1200,
  ) {}

  get data(): SaveData {
    return this._data;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  async load(): Promise<SaveData> {
    let raw = '';
    try {
      raw = await this.backend.loadData();
    } catch (err) {
      this.onError(err, ++this.failures);
    }
    this._data = parseSave(raw);
    this.loaded = true;
    return this._data;
  }

  /** Mutate and schedule a debounced save. */
  update(mutator: (d: SaveData) => void, immediate = false): void {
    mutator(this._data);
    if (immediate) void this.flush();
    else this.schedule();
  }

  private schedule(): void {
    if (!this.loaded) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Write now. Saves are serialised so they never race each other. */
  flush(): Promise<void> {
    if (!this.loaded) return Promise.resolve();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const payload = serializeSave(this._data);
    this.saving = this.saving.then(async () => {
      try {
        await this.backend.saveData(payload);
        this.failures = 0;
      } catch (err) {
        this.onError(err, ++this.failures);
      }
    });
    return this.saving;
  }

  reset(): Promise<void> {
    const settings = this._data.settings;
    this._data = defaultSave();
    this._data.settings = settings;
    return this.flush();
  }
}
