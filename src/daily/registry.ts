/**
 * Puzzle registry + deterministic daily selection.
 *
 * Content lives in puzzles.json (bundled, ~6 KB). Artwork files are loaded
 * lazily only when a puzzle is opened.
 *
 * Daily rules (all UTC):
 *  1. If an entry is pinned to the date → use it verbatim.
 *  2. Otherwise the puzzle number is (days since launch + 1). The catalogue is
 *     cycled in a seeded shuffled order per cycle, the difficulty follows the
 *     weekly schedule and the layout seed is a hash of the date.
 *  3. Dates before launch return a "preview" puzzle numbered 0.
 * Same date → same puzzle for every player, with no server.
 */
import data from './puzzles.json';
import { DIFFICULTIES, isDifficultyId, type DifficultyId } from '../core/config';
import { daysBetween, isDateKey, weekdayOf } from '../utils/date';
import { hashString, mulberry32, shuffled } from '../utils/rng';

export interface PuzzleDef {
  id: string;
  date?: string;
  title: string;
  category: string;
  difficulty: DifficultyId;
  rows: number;
  columns: number;
  art: string;
  seed: number;
  accent: string;
}

export interface ArtInfo {
  slug: string;
  title: string;
  category: string;
  art: string;
  accent: string;
}

export interface DailyPuzzle extends PuzzleDef {
  /** UTC date key this puzzle belongs to. */
  dateKey: string;
  /** Puzzle number (#001 = launch day). 0 = pre-launch preview. */
  number: number;
  preview: boolean;
}

interface RawDoc {
  launchDate: string;
  weeklyDifficulty: string[];
  puzzles: Array<Record<string, unknown>>;
}

export class RegistryError extends Error {}

/** Validates and normalises raw JSON. Invalid entries are skipped, not fatal. */
export function parseRegistry(raw: RawDoc): { launchDate: string; weekly: DifficultyId[]; puzzles: PuzzleDef[] } {
  if (!isDateKey(raw.launchDate)) throw new RegistryError('launchDate must be YYYY-MM-DD');
  const weekly = raw.weeklyDifficulty.map((d) => (isDifficultyId(d) ? d : 'medium'));
  if (weekly.length !== 7) throw new RegistryError('weeklyDifficulty must list 7 days (Sun..Sat)');
  const puzzles: PuzzleDef[] = [];
  const seen = new Set<string>();
  for (const p of raw.puzzles) {
    const id = String(p.id ?? '');
    const art = String(p.art ?? '');
    const difficulty = isDifficultyId(p.difficulty) ? p.difficulty : 'medium';
    if (!id || !art || seen.has(id)) continue;
    if (art.startsWith('/') || /^[a-z]+:/i.test(art)) continue; // relative, local paths only
    seen.add(id);
    const diff = DIFFICULTIES[difficulty];
    puzzles.push({
      id,
      date: typeof p.date === 'string' && isDateKey(p.date) ? p.date : undefined,
      title: String(p.title ?? 'Untitled'),
      category: String(p.category ?? 'Art'),
      difficulty,
      rows: clampGrid(p.rows, diff.rows),
      columns: clampGrid(p.columns, diff.cols),
      art,
      seed: typeof p.seed === 'number' ? p.seed >>> 0 : hashString(id),
      accent: typeof p.accent === 'string' ? p.accent : '#5b2a86',
    });
  }
  if (!puzzles.length) throw new RegistryError('registry has no valid puzzles');
  return { launchDate: raw.launchDate, weekly, puzzles };
}

function clampGrid(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(2, Math.min(10, n));
}

export function artSlug(artPath: string): string {
  const file = artPath.split('/').pop() ?? artPath;
  return file.replace(/\.svg$/i, '');
}

export class PuzzleRegistry {
  readonly launchDate: string;
  readonly weekly: DifficultyId[];
  readonly puzzles: PuzzleDef[];
  private byDate = new Map<string, PuzzleDef>();

  constructor(raw: RawDoc = data as RawDoc) {
    const parsed = parseRegistry(raw);
    this.launchDate = parsed.launchDate;
    this.weekly = parsed.weekly;
    this.puzzles = parsed.puzzles;
    for (const p of this.puzzles) if (p.date) this.byDate.set(p.date, p);
  }

  puzzleNumber(dateKey: string): number {
    return daysBetween(this.launchDate, dateKey) + 1;
  }

  daily(dateKey: string): DailyPuzzle {
    if (!isDateKey(dateKey)) throw new RegistryError(`bad date ${dateKey}`);
    const number = this.puzzleNumber(dateKey);
    const pinned = this.byDate.get(dateKey);
    if (pinned) return { ...pinned, dateKey, number: Math.max(0, number), preview: number < 1 };

    const n = this.puzzles.length;
    const index = number - 1;
    const cycle = Math.floor(index / n);
    const order = shuffled(
      this.puzzles.map((_, i) => i),
      mulberry32(hashString(`jigsaw-joy:cycle:${cycle}`)),
    );
    const base = this.puzzles[order[((index % n) + n) % n]];
    const difficulty = this.weekly[weekdayOf(dateKey)];
    const diff = DIFFICULTIES[difficulty];
    return {
      ...base,
      id: number >= 1 ? `daily-${String(number).padStart(3, '0')}` : `preview-${dateKey}`,
      date: dateKey,
      difficulty,
      rows: diff.rows,
      columns: diff.cols,
      seed: hashString(`jigsaw-joy:daily:${dateKey}`),
      dateKey,
      number: Math.max(0, number),
      preview: number < 1,
    };
  }

  /** Unique artworks in schedule order. */
  artCatalog(): ArtInfo[] {
    const out: ArtInfo[] = [];
    const seen = new Set<string>();
    for (const p of this.puzzles) {
      const slug = artSlug(p.art);
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, title: p.title, category: p.category, art: p.art, accent: p.accent });
    }
    return out;
  }

  art(slug: string): ArtInfo | undefined {
    return this.artCatalog().find((a) => a.slug === slug);
  }
}
