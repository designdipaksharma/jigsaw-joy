/**
 * Central tunables. Change difficulty grids here — the puzzle engine supports
 * any grid from 2x2 to 10x10.
 */
export type DifficultyId = 'easy' | 'medium' | 'hard' | 'expert';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  rows: number;
  cols: number;
  /** Number of pips shown on cards — difficulty is never conveyed by colour alone. */
  pips: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: { id: 'easy', label: 'Easy', rows: 3, cols: 3, pips: 1 },
  medium: { id: 'medium', label: 'Medium', rows: 4, cols: 4, pips: 2 },
  hard: { id: 'hard', label: 'Hard', rows: 5, cols: 5, pips: 3 },
  expert: { id: 'expert', label: 'Expert', rows: 6, cols: 6, pips: 4 },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'medium', 'hard', 'expert'];

export function isDifficultyId(v: unknown): v is DifficultyId {
  return typeof v === 'string' && v in DIFFICULTIES;
}

/** Artwork canvas size in "world units" (all art is authored at 4:5). */
export const ART_WIDTH = 800;
export const ART_HEIGHT = 1000;

/** Grid bounds accepted by the generator. */
export const MIN_GRID = 2;
export const MAX_GRID = 10;

/** Snap distance as a fraction of the smaller piece dimension. */
export const SNAP_RATIO_MOUSE = 0.26;
export const SNAP_RATIO_TOUCH = 0.34;

/** Artworks always available in Practice before any daily puzzle is solved. */
export const STARTER_ART = [
  'rolling-hills',
  'tulip-parade',
  'koi-pond',
  'bauhaus-blocks',
  'balloon-sky',
  'hillside-village',
];
