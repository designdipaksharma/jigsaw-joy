import { describe, expect, it } from 'vitest';
import { generatePuzzle, outlineBounds, reverseEdge, type Cubic } from '../src/puzzle/generator';
import { PuzzleEngine } from '../src/puzzle/engine';
import { computeLayout, trayIndexAt, traySlot } from '../src/puzzle/layout';

const opts = { width: 800, height: 1000, rows: 4, cols: 4, seed: 1234 };

describe('generator', () => {
  it('creates rows×cols pieces with correct positions', () => {
    const p = generatePuzzle(opts);
    expect(p.pieces).toHaveLength(16);
    expect(p.pieces[5]).toMatchObject({ row: 1, col: 1, x: 200, y: 250, w: 200, h: 250 });
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a = generatePuzzle(opts);
    const b = generatePuzzle(opts);
    const c = generatePuzzle({ ...opts, seed: 99 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('border sides are flat, interior sides interlock', () => {
    const p = generatePuzzle({ ...opts, rows: 5, cols: 6 });
    for (const pc of p.pieces) {
      expect(pc.sides.top === 0).toBe(pc.row === 0);
      expect(pc.sides.left === 0).toBe(pc.col === 0);
      expect(pc.sides.bottom === 0).toBe(pc.row === 4);
      expect(pc.sides.right === 0).toBe(pc.col === 5);
      if (pc.neighbors.right !== undefined) expect(p.pieces[pc.neighbors.right].sides.left).toBe(-pc.sides.right as number);
      if (pc.neighbors.bottom !== undefined) expect(p.pieces[pc.neighbors.bottom].sides.top).toBe(-pc.sides.bottom as number);
    }
  });

  it('neighbouring pieces share identical edge geometry', () => {
    const p = generatePuzzle(opts);
    // piece 0 right edge = segments 4..7 (top edge is 1 flat segment)
    const a = p.pieces[0];
    const b = p.pieces[1];
    const aRight = a.outline.segments.slice(1, 5);
    // piece 1 left edge is the last 4 segments, reversed
    const bLeft = b.outline.segments.slice(-4);
    const bStart = b.outline.segments[b.outline.segments.length - 5].p;
    const reversed = reverseEdge({ start: bStart, segments: bLeft, kind: 'curved' });
    const round = (c: Cubic[]) => c.map((s) => [s.c1, s.c2, s.p].map((q) => [q.x.toFixed(6), q.y.toFixed(6)]));
    expect(round(reversed.segments)).toEqual(round(aRight));
  });

  it('outlines are closed and tabs stay within the margin', () => {
    const p = generatePuzzle({ ...opts, rows: 6, cols: 6, seed: 7 });
    for (const pc of p.pieces) {
      const last = pc.outline.segments[pc.outline.segments.length - 1].p;
      expect(last.x).toBeCloseTo(pc.outline.start.x, 6);
      expect(last.y).toBeCloseTo(pc.outline.start.y, 6);
      const b = outlineBounds(pc.outline);
      expect(b.minX).toBeGreaterThanOrEqual(pc.x - p.margin);
      expect(b.maxX).toBeLessThanOrEqual(pc.x + pc.w + p.margin);
      expect(b.minY).toBeGreaterThanOrEqual(pc.y - p.margin);
      expect(b.maxY).toBeLessThanOrEqual(pc.y + pc.h + p.margin);
    }
  });

  it('clamps unreasonable grid sizes', () => {
    expect(generatePuzzle({ ...opts, rows: 1, cols: 99 }).pieces).toHaveLength(2 * 10);
  });

  it('can create and discard many puzzles (no shared state)', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePuzzle({ ...opts, rows: 2 + (i % 9), cols: 2 + ((i * 7) % 9), seed: i });
      expect(p.pieces.length).toBe(p.rows * p.cols);
    }
  });
});

describe('engine', () => {
  const make = () => new PuzzleEngine(generatePuzzle(opts), 0.3);

  it('starts with every piece in a shuffled tray', () => {
    const e = make();
    expect(e.tray).toHaveLength(16);
    expect(new Set(e.tray).size).toBe(16);
    expect(e.tray).not.toEqual([...Array(16).keys()]);
    expect(e.remaining).toBe(16);
  });

  it('snaps when dropped within the snap distance', () => {
    const e = make();
    e.pickUp(5);
    const r = e.drop(5, 200 + 30, 250 - 30);
    expect(r.type).toBe('snapped');
    expect(e.pieces[5]).toMatchObject({ loc: 'placed', x: 200, y: 250 });
  });

  it('does not snap when too far and reports on-board', () => {
    const e = make();
    e.pickUp(5);
    const r = e.drop(5, 500, 600);
    expect(r).toMatchObject({ type: 'free', onBoard: true });
    expect(e.pieces[5].loc).toBe('free');
    expect(e.pieceAt(520, 620)).toBe(5);
  });

  it('returns a piece to the tray at the requested index', () => {
    const e = make();
    const id = e.tray[3];
    e.pickUp(id);
    e.drop(id, 0, 0, true, 0);
    expect(e.tray[0]).toBe(id);
    expect(e.pieces[id].loc).toBe('tray');
  });

  it('placed pieces cannot be picked up again', () => {
    const e = make();
    e.pickUp(0);
    e.drop(0, 0, 0);
    expect(e.pickUp(0)).toBe(false);
    expect(e.pieceAt(10, 10)).toBeNull();
  });

  it('detects completion exactly when the last piece is placed', () => {
    const e = make();
    const L = e.layout;
    let last;
    for (const p of L.pieces) {
      expect(e.isComplete()).toBe(false);
      e.pickUp(p.id);
      last = e.drop(p.id, p.x + 5, p.y - 5);
    }
    expect(last).toMatchObject({ type: 'snapped', complete: true });
    expect(e.isComplete()).toBe(true);
    expect(e.tray).toHaveLength(0);
  });

  it('top-most piece wins hit tests', () => {
    const e = make();
    e.pickUp(1);
    e.drop(1, 400, 500);
    e.pickUp(2);
    e.drop(2, 410, 510);
    expect(e.pieceAt(450, 550)).toBe(2);
    e.bringToFront(1);
    expect(e.pieceAt(450, 550)).toBe(1);
  });

  it('snapshot → restore round-trips', () => {
    const a = make();
    a.pickUp(3);
    a.drop(3, 600, 90);
    a.pickUp(0);
    a.drop(0, 0, 0);
    const snap = JSON.parse(JSON.stringify(a.snapshot()));
    const b = make();
    expect(b.restore(snap)).toBe(true);
    expect(b.pieces).toEqual(a.pieces.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) })));
    expect(b.tray).toEqual(a.tray);
    expect(b.placedCount).toBe(1);
  });

  it('rejects snapshots that do not fit', () => {
    const e = make();
    expect(e.restore({ p: [[0, 0, 0]], t: [] })).toBe(false);
    expect(e.restore(null)).toBe(false);
    expect(e.tray).toHaveLength(16);
  });
});

describe('screen layout', () => {
  const sizes: Array<[number, number]> = [[320, 568], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1920, 1080], [844, 390], [360, 1280], [2560, 720]];
  it.each(sizes)('board and tray fit without overlap at %ix%i', (w, h) => {
    const L = computeLayout(w, h, 800, 1000, 60);
    const b = L.board;
    expect(b.w).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(L.hud);
    expect(b.x + b.w).toBeLessThanOrEqual(w + 0.5);
    const t = L.tray;
    if (t.axis === 'x') expect(b.y + b.h).toBeLessThanOrEqual(t.y);
    else expect(b.x + b.w).toBeLessThanOrEqual(t.x);
    expect(t.cell).toBeGreaterThanOrEqual(40); // comfortably touchable
  });

  it('tray index mapping round-trips', () => {
    const L = computeLayout(390, 844, 800, 1000, 60);
    for (let i = 0; i < 12; i++) {
      const s = traySlot(L.tray, i);
      expect(trayIndexAt(L.tray, s.x + 5, s.y + 5, 0, 99)).toBe(i);
    }
  });
});
