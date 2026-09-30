/**
 * One puzzle play-through: wires engine + controller + timer + HUD + saves.
 * Created when a puzzle starts, destroyed when leaving it (no leaks: all
 * listeners/intervals are removed and cached canvases are released).
 */
import { ART_HEIGHT, ART_WIDTH, DIFFICULTIES, SNAP_RATIO_MOUSE, SNAP_RATIO_TOUCH, type DifficultyId } from '../core/config';
import { GameTimer } from '../core/timer';
import { PuzzleEngine } from '../puzzle/engine';
import { generatePuzzle, type PuzzleLayout } from '../puzzle/generator';
import { PuzzleController } from '../puzzle/controller';
import type { ProgressRecord, SaveManager } from '../storage/save';
import type { Sfx } from '../audio/sfx';
import { vibrate } from '../audio/haptics';
import { loadArt } from './artLoader';
import { h, icon } from '../ui/dom';
import { ICONS } from '../ui/icons';
import { formatDuration, padNumber } from '../utils/format';

export interface PuzzleSpec {
  mode: 'daily' | 'practice';
  /** Daily: UTC date key. Practice: art slug. */
  key: string;
  slug: string;
  title: string;
  category: string;
  art: string;
  accent: string;
  difficulty: DifficultyId;
  rows: number;
  cols: number;
  seed: number;
  number: number;
  dateKey?: string;
}

export interface CompletionResult {
  spec: PuzzleSpec;
  ms: number;
  best: number;
  newBest: boolean;
}

export interface SessionContext {
  canvas: HTMLCanvasElement;
  hud: HTMLElement;
  save: SaveManager;
  sfx: Sfx;
  reducedMotion(): boolean;
  haptics(): boolean;
  ghost(): boolean;
  setGhost(on: boolean): void;
  soundToggleVisible: boolean;
  soundOn(): boolean;
  toggleSound(): void;
  announce(msg: string): void;
  toast(msg: string): void;
  requestPause(): void;
  onComplete(r: CompletionResult): void;
}

export class PuzzleSession {
  private layout!: PuzzleLayout;
  private engine!: PuzzleEngine;
  private controller: PuzzleController | null = null;
  readonly timer = new GameTimer();
  private tick: ReturnType<typeof setInterval> | null = null;
  private interacted = false;
  private paused = false;
  private finished = false;
  private destroyed = false;
  private els!: { time: HTMLElement; left: HTMLElement; ghost: HTMLButtonElement; sound?: HTMLButtonElement };
  private source: CanvasImageSource | null = null;

  constructor(
    readonly spec: PuzzleSpec,
    private readonly ctx: SessionContext,
  ) {}

  get isFinished(): boolean {
    return this.finished;
  }

  async start(restore?: ProgressRecord): Promise<void> {
    this.buildHud();
    this.ctx.canvas.hidden = false;
    this.ctx.canvas.setAttribute('aria-busy', 'true');
    const art = await loadArt(this.spec.art, this.spec.seed);
    if (this.destroyed) return;
    if (art.fallback) this.ctx.toast('This artwork could not load, so a backup design is being used.');
    this.source = art.source;
    this.setup(restore);
    this.ctx.canvas.removeAttribute('aria-busy');
  }

  private setup(restore?: ProgressRecord): void {
    this.layout = generatePuzzle({ width: ART_WIDTH, height: ART_HEIGHT, rows: this.spec.rows, cols: this.spec.cols, seed: this.spec.seed });
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.engine = new PuzzleEngine(this.layout, coarse ? SNAP_RATIO_TOUCH : SNAP_RATIO_MOUSE);
    this.timer.reset(0);
    this.interacted = false;
    if (restore && restore.key === this.spec.key && restore.seed === this.spec.seed && restore.d === this.spec.difficulty) {
      if (this.engine.restore(restore.s)) {
        this.timer.reset(restore.e);
        this.interacted = this.engine.placedCount > 0 || this.engine.zOrder.length > 0;
      }
    }
    this.controller?.destroy();
    this.controller = new PuzzleController(
      this.ctx.canvas,
      this.layout,
      this.engine,
      this.source!,
      {
        onInteract: () => {
          this.interacted = true;
          if (!this.paused) this.startClock();
        },
        onPickup: () => {
          this.ctx.sfx.unlock();
          this.ctx.sfx.pickup();
        },
        onSnap: (_id, complete) => {
          this.ctx.sfx.snap();
          vibrate(this.ctx.haptics(), 14);
          this.updateHud();
          if (complete) this.complete();
          else {
            const left = this.engine.remaining;
            this.ctx.announce(`Piece placed. ${left} ${left === 1 ? 'piece' : 'pieces'} left.`);
          }
        },
        onDrop: (r) => {
          if (r.type === 'free' && r.onBoard) this.ctx.sfx.drop();
        },
        onChange: () => this.saveProgress(false),
        onAnnounce: (m) => this.ctx.announce(m),
      },
      { reducedMotion: () => this.ctx.reducedMotion(), ghost: this.ctx.ghost() },
    );
    this.resize();
    this.updateHud();
    if (import.meta.env.DEV) {
      (window as unknown as { __jj?: unknown }).__jj = { engine: this.engine, controller: this.controller, layout: this.layout };
    }
    if (this.interacted && !this.paused) this.startClock();
    if (this.engine.isComplete()) this.complete();
  }

  resize(): void {
    if (!this.controller) return;
    const parent = this.ctx.canvas.parentElement!;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    this.controller.resize(parent.clientWidth, parent.clientHeight, dpr);
  }

  focus(): void {
    this.ctx.canvas.focus({ preventScroll: true });
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.timer.pause();
    this.stopClock();
    this.controller?.pause();
    if (!this.finished) this.saveProgress(true);
  }

  resume(): void {
    if (!this.paused || this.destroyed) return;
    this.paused = false;
    this.controller?.resume();
    if (this.interacted && !this.finished) this.startClock();
    this.updateHud();
  }

  restart(): void {
    this.ctx.save.update((d) => {
      delete d.progress[this.spec.mode];
    }, true);
    this.finished = false;
    this.paused = false;
    this.stopClock();
    this.setup();
    this.ctx.announce('Puzzle restarted.');
  }

  setGhost(on: boolean): void {
    this.controller?.setGhost(on);
    this.els.ghost.setAttribute('aria-pressed', String(on));
    this.els.ghost.replaceChildren(icon(on ? ICONS.eye : ICONS.eyeOff));
  }

  refreshSoundButton(): void {
    if (!this.els.sound) return;
    const on = this.ctx.soundOn();
    this.els.sound.setAttribute('aria-pressed', String(on));
    this.els.sound.setAttribute('aria-label', on ? 'Sound effects on' : 'Sound effects off');
    this.els.sound.replaceChildren(icon(on ? ICONS.soundOn : ICONS.soundOff));
  }

  destroy(): void {
    this.destroyed = true;
    this.stopClock();
    this.controller?.destroy();
    this.controller = null;
    this.ctx.hud.replaceChildren();
    this.ctx.hud.hidden = true;
    const c = this.ctx.canvas;
    c.hidden = true;
    c.width = c.height = 1;
  }

  // ---------- internals ----------
  private startClock(): void {
    if (this.finished) return;
    this.timer.start();
    if (!this.tick) this.tick = setInterval(() => this.updateTime(), 500);
    this.updateTime();
  }

  private stopClock(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }

  private saveProgress(immediate: boolean): void {
    if (this.finished || !this.engine) return;
    const rec: ProgressRecord = {
      key: this.spec.key,
      d: this.spec.difficulty,
      seed: this.spec.seed,
      e: this.timer.elapsed(),
      s: this.engine.snapshot(),
    };
    this.ctx.save.update((d) => {
      d.progress[this.spec.mode] = rec;
    }, immediate);
  }

  private complete(): void {
    if (this.finished) return;
    this.finished = true;
    const ms = this.timer.stop();
    this.stopClock();
    this.updateHud();
    const bestKey = `${this.spec.slug}:${this.spec.difficulty}`;
    const prev = this.ctx.save.data.best[bestKey];
    const newBest = prev === undefined || ms < prev;
    const best = newBest ? ms : prev;
    const spec = this.spec;
    this.ctx.save.update((d) => {
      delete d.progress[spec.mode];
      d.best[bestKey] = best;
      if (spec.mode === 'daily' && spec.dateKey && !d.cards[spec.dateKey]) {
        d.cards[spec.dateKey] = { n: spec.number, a: spec.slug, t: spec.title, c: spec.category, d: spec.difficulty, ms };
      }
      if (spec.mode === 'practice') d.practiceSolved += 1;
    }, true);
    this.ctx.sfx.complete();
    vibrate(this.ctx.haptics(), [20, 60, 30]);
    this.ctx.announce(`Puzzle complete in ${formatDuration(ms)}!`);
    this.controller?.playCompletion(() => {
      if (!this.destroyed) this.ctx.onComplete({ spec, ms, best, newBest });
    });
  }

  private buildHud(): void {
    const hud = this.ctx.hud;
    const d = DIFFICULTIES[this.spec.difficulty];
    const kicker =
      this.spec.mode === 'daily' ? (this.spec.number > 0 ? `Daily #${padNumber(this.spec.number)}` : 'Preview puzzle') : 'Practice';
    const name = this.spec.mode === 'daily' ? `${d.label} · ${this.spec.rows * this.spec.cols} pieces` : `${this.spec.title} · ${d.label}`;
    const time = h('span', { class: 'hud-time-val' }, '00:00');
    const left = h('span', { class: 'hud-left-val' }, String(this.spec.rows * this.spec.cols));
    const ghostOn = this.ctx.ghost();
    const ghost = h('button', { type: 'button', class: 'hud-btn', 'aria-label': 'Show faint preview image on the board', 'aria-pressed': String(ghostOn), title: 'Preview image (G)' });
    ghost.append(icon(ghostOn ? ICONS.eye : ICONS.eyeOff));
    ghost.addEventListener('click', () => this.ctx.setGhost(!this.ctx.ghost()));
    const pause = h('button', { type: 'button', class: 'hud-btn hud-pause', 'aria-label': 'Pause', title: 'Pause (P)' });
    pause.append(icon(ICONS.pause));
    pause.addEventListener('click', () => this.ctx.requestPause());
    let sound: HTMLButtonElement | undefined;
    if (this.ctx.soundToggleVisible) {
      sound = h('button', { type: 'button', class: 'hud-btn', 'aria-pressed': 'true', title: 'Sound effects' });
      sound.addEventListener('click', () => {
        this.ctx.toggleSound();
        this.refreshSoundButton();
      });
    }
    hud.replaceChildren(
      pause,
      h('div', { class: 'hud-title' }, h('div', { class: 'hud-kicker' }, kicker), h('div', { class: 'hud-name' }, name)),
      h('div', { class: 'hud-stats' },
        h('div', { class: 'hud-stat', role: 'timer', 'aria-label': 'Elapsed time' }, h('span', { class: 'hud-stat-label' }, 'Time'), time),
        h('div', { class: 'hud-stat', 'aria-live': 'off' }, h('span', { class: 'hud-stat-label' }, 'Left'), left),
      ),
      h('div', { class: 'hud-actions' }, ghost, sound ?? null),
    );
    hud.hidden = false;
    this.els = { time, left, ghost, sound };
    this.refreshSoundButton();
  }

  private updateTime(): void {
    this.els.time.textContent = formatDuration(this.timer.elapsed());
  }

  private updateHud(): void {
    if (!this.els) return;
    this.updateTime();
    if (this.engine) this.els.left.textContent = String(this.engine.remaining);
  }
}
