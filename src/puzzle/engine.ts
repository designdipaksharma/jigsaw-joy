/**
 * Pure puzzle rules: piece locations, z-order, snapping and completion.
 * No rendering or DOM here — fully unit-tested.
 */
import { mulberry32, shuffled } from '../utils/rng';
import type { PuzzleLayout } from './generator';

export type PieceLocation = 'tray' | 'free' | 'placed';

export interface PieceState {
  id: number;
  loc: PieceLocation;
  /** Top-left of the piece body in world coordinates (valid for free/placed). */
  x: number;
  y: number;
}

export type DropResult =
  | { type: 'snapped'; id: number; complete: boolean }
  | { type: 'free'; id: number; onBoard: boolean; near: boolean }
  | { type: 'tray'; id: number };

/** Compact, versioned progress snapshot used by the save system. */
export interface EngineSnapshot {
  /** [loc code (0 tray,1 free,2 placed), x, y] per piece id, rounded. */
  p: Array<[number, number, number]>;
  /** Tray order (piece ids). */
  t: number[];
}

const LOC_CODES: PieceLocation[] = ['tray', 'free', 'placed'];

export class PuzzleEngine {
  readonly pieces: PieceState[];
  /** Ids of pieces waiting in the tray, in display order. */
  tray: number[];
  /** Ids of free pieces from bottom to top. */
  zOrder: number[] = [];
  readonly snapDistance: number;

  constructor(
    readonly layout: PuzzleLayout,
    snapRatio = 0.3,
  ) {
    this.snapDistance = snapRatio * Math.min(layout.pieceW, layout.pieceH);
    this.pieces = layout.pieces.map((p) => ({ id: p.id, loc: 'tray' as PieceLocation, x: p.x, y: p.y }));
    this.tray = shuffled(
      layout.pieces.map((p) => p.id),
      mulberry32(layout.seed ^ 0x9e3779b9),
    );
  }

  get total(): number {
    return this.pieces.length;
  }

  get placedCount(): number {
    let n = 0;
    for (const p of this.pieces) if (p.loc === 'placed') n++;
    return n;
  }

  get remaining(): number {
    return this.total - this.placedCount;
  }

  isComplete(): boolean {
    return this.placedCount === this.total;
  }

  /** Distance between a piece's current and correct position. */
  distanceToTarget(id: number, x = this.pieces[id].x, y = this.pieces[id].y): number {
    const shape = this.layout.pieces[id];
    return Math.hypot(x - shape.x, y - shape.y);
  }

  isNearTarget(id: number, x: number, y: number, factor = 1): boolean {
    return this.distanceToTarget(id, x, y) <= this.snapDistance * factor;
  }

  /** Topmost free piece whose body (plus a little tab tolerance) contains the point. */
  pieceAt(wx: number, wy: number): number | null {
    const tol = this.layout.margin * 0.45;
    const { pieceW: w, pieceH: h } = this.layout;
    for (let i = this.zOrder.length - 1; i >= 0; i--) {
      const p = this.pieces[this.zOrder[i]];
      if (wx >= p.x - tol && wx <= p.x + w + tol && wy >= p.y - tol && wy <= p.y + h + tol) return p.id;
    }
    return null;
  }

  /** Lift a piece out of the tray or the free pile so it can be dragged. */
  pickUp(id: number): boolean {
    const p = this.pieces[id];
    if (!p || p.loc === 'placed') return false;
    if (p.loc === 'tray') {
      this.tray = this.tray.filter((t) => t !== id);
      p.loc = 'free';
    }
    this.bringToFront(id);
    return true;
  }

  bringToFront(id: number): void {
    this.zOrder = this.zOrder.filter((z) => z !== id);
    this.zOrder.push(id);
  }

  moveTo(id: number, x: number, y: number): void {
    const p = this.pieces[id];
    if (!p || p.loc === 'placed') return;
    p.x = x;
    p.y = y;
  }

  /**
   * Drop a held piece.
   * @param overTray the pointer is over the tray → return piece to tray.
   * @param trayIndex position to insert into the tray.
   */
  drop(id: number, x: number, y: number, overTray = false, trayIndex = 0): DropResult {
    const p = this.pieces[id];
    if (!p || p.loc === 'placed') return { type: 'free', id, onBoard: false, near: false };
    if (overTray) {
      this.zOrder = this.zOrder.filter((z) => z !== id);
      p.loc = 'tray';
      const idx = Math.max(0, Math.min(this.tray.length, trayIndex));
      this.tray.splice(idx, 0, id);
      return { type: 'tray', id };
    }
    if (this.isNearTarget(id, x, y)) {
      this.place(id);
      return { type: 'snapped', id, complete: this.isComplete() };
    }
    p.x = x;
    p.y = y;
    const { width, height, pieceW, pieceH } = this.layout;
    const cx = x + pieceW / 2;
    const cy = y + pieceH / 2;
    const onBoard = cx >= 0 && cx <= width && cy >= 0 && cy <= height;
    return { type: 'free', id, onBoard, near: this.isNearTarget(id, x, y, 2) };
  }

  /** Force a piece into its correct slot. */
  place(id: number): void {
    const p = this.pieces[id];
    const shape = this.layout.pieces[id];
    p.loc = 'placed';
    p.x = shape.x;
    p.y = shape.y;
    this.zOrder = this.zOrder.filter((z) => z !== id);
    this.tray = this.tray.filter((t) => t !== id);
  }

  /** Board cell (row, col) whose correct slot is under a world point, or null. */
  cellAt(wx: number, wy: number): { row: number; col: number } | null {
    const { width, height, pieceW, pieceH } = this.layout;
    if (wx < 0 || wy < 0 || wx >= width || wy >= height) return null;
    return { row: Math.floor(wy / pieceH), col: Math.floor(wx / pieceW) };
  }

  snapshot(): EngineSnapshot {
    return {
      p: this.pieces.map((p) => [LOC_CODES.indexOf(p.loc), Math.round(p.x), Math.round(p.y)]),
      t: this.tray.slice(),
    };
  }

  /** Restore a snapshot. Returns false (and leaves a fresh state) if it doesn't fit this layout. */
  restore(snap: EngineSnapshot | undefined | null): boolean {
    if (!snap || !Array.isArray(snap.p) || snap.p.length !== this.total || !Array.isArray(snap.t)) return false;
    const pieces: PieceState[] = [];
    for (let id = 0; id < snap.p.length; id++) {
      const e = snap.p[id];
      if (!Array.isArray(e) || e.length !== 3) return false;
      const loc = LOC_CODES[e[0]];
      if (!loc || !Number.isFinite(e[1]) || !Number.isFinite(e[2])) return false;
      pieces.push({ id, loc, x: e[1], y: e[2] });
    }
    const trayIds = new Set(pieces.filter((p) => p.loc === 'tray').map((p) => p.id));
    const tray = snap.t.filter((id) => trayIds.has(id));
    if (tray.length !== trayIds.size) return false;
    for (const p of pieces) {
      this.pieces[p.id].loc = p.loc;
      if (p.loc === 'placed') {
        this.pieces[p.id].x = this.layout.pieces[p.id].x;
        this.pieces[p.id].y = this.layout.pieces[p.id].y;
      } else {
        this.pieces[p.id].x = p.x;
        this.pieces[p.id].y = p.y;
      }
    }
    this.tray = tray;
    this.zOrder = pieces.filter((p) => p.loc === 'free').map((p) => p.id);
    return true;
  }
}
