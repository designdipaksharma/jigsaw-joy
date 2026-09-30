/**
 * Deterministic jigsaw generator.
 *
 * Given (width, height, rows, cols, seed) it produces pieces with classic
 * interlocking tab/blank edges. Every internal edge is generated ONCE in
 * world coordinates and shared by the two neighbouring pieces (one traverses
 * it forwards, the other backwards), so neighbouring shapes always match
 * perfectly. Border edges are straight.
 *
 * The output is pure data (no DOM / canvas), so it is unit-testable and can
 * be converted to a Path2D by the renderer.
 */
import { MAX_GRID, MIN_GRID } from '../core/config';
import { mulberry32, randRange, type Rng } from '../utils/rng';

export interface Point {
  x: number;
  y: number;
}

/** One cubic Bézier segment: control 1, control 2, end point. */
export interface Cubic {
  c1: Point;
  c2: Point;
  p: Point;
}

/** An edge from `start` through a list of cubic segments. */
export interface Edge {
  start: Point;
  segments: Cubic[];
  /** 0 = straight border edge. */
  kind: 'flat' | 'curved';
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface PieceShape {
  id: number;
  row: number;
  col: number;
  /** Correct top-left of the piece body in world coords. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** +1 tab (sticks out), -1 blank (cut in), 0 flat. */
  sides: Record<Side, -1 | 0 | 1>;
  /** Closed outline as a start point + cubic segments, clockwise, world coords. */
  outline: { start: Point; segments: Cubic[] };
  neighbors: Partial<Record<Side, number>>;
}

export interface PuzzleLayout {
  rows: number;
  cols: number;
  width: number;
  height: number;
  pieceW: number;
  pieceH: number;
  /** Maximum distance a tab can protrude beyond the body, world units. */
  margin: number;
  pieces: PieceShape[];
  seed: number;
}

export interface GenerateOptions {
  width: number;
  height: number;
  rows: number;
  cols: number;
  seed: number;
}

/** Tab height as a fraction of the smaller piece dimension. */
const TAB_HEIGHT = 0.2;

export function clampGrid(n: number): number {
  if (!Number.isFinite(n)) return MIN_GRID;
  return Math.max(MIN_GRID, Math.min(MAX_GRID, Math.round(n)));
}

/** Per-edge random parameters keep every tab slightly unique. */
interface TabParams {
  dir: 1 | -1;
  offset: number;
  size: number;
  neck: number;
  lean: number;
}

function tabParams(rng: Rng): TabParams {
  return {
    dir: rng() < 0.5 ? 1 : -1,
    offset: randRange(rng, -0.06, 0.06),
    size: randRange(rng, 0.9, 1.1),
    neck: randRange(rng, 0.9, 1.1),
    lean: randRange(rng, -0.025, 0.025),
  };
}

/**
 * Build a curved edge from a to b. The tab bulges along `normal * dir`.
 * Coordinates: t runs along the edge (0..1 of its length), s is the bulge
 * (in units of `amp`, i.e. the smaller piece dimension).
 */
function curvedEdge(a: Point, b: Point, normal: Point, amp: number, p: TabParams): Edge {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = 0.5 + p.offset;
  const nw = 0.075 * p.neck; // neck half-width (fraction of edge length)
  const hw = 0.14 * p.size; // head half-width
  const hh = TAB_HEIGHT * p.size; // head height (fraction of amp)
  const nh = 0.075; // neck height (fraction of amp)
  const L = p.lean;
  const at = (t: number, s: number): Point => ({
    x: a.x + dx * t + normal.x * s * amp * p.dir,
    y: a.y + dy * t + normal.y * s * amp * p.dir,
  });
  const segments: Cubic[] = [
    { c1: at(c - nw - 0.16, 0), c2: at(c - nw + 0.03, nh * 0.2), p: at(c - nw, nh) },
    { c1: at(c - nw - 0.05, nh + 0.07), c2: at(c - hw + L, hh), p: at(c + L, hh) },
    { c1: at(c + hw + L, hh), c2: at(c + nw + 0.05, nh + 0.07), p: at(c + nw, nh) },
    { c1: at(c + nw - 0.03, nh * 0.2), c2: at(c + nw + 0.16, 0), p: at(1, 0) },
  ];
  return { start: at(0, 0), segments, kind: 'curved' };
}

function flatEdge(a: Point, b: Point): Edge {
  const third = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return { start: a, segments: [{ c1: third(1 / 3), c2: third(2 / 3), p: b }], kind: 'flat' };
}

/** Reverse an edge so it can be traversed from its end back to its start. */
export function reverseEdge(e: Edge): Edge {
  const segs = e.segments;
  const out: Cubic[] = [];
  for (let i = segs.length - 1; i >= 0; i--) {
    const end = i === 0 ? e.start : segs[i - 1].p;
    out.push({ c1: segs[i].c2, c2: segs[i].c1, p: end });
  }
  return { start: segs[segs.length - 1].p, segments: out, kind: e.kind };
}

export function generatePuzzle(opts: GenerateOptions): PuzzleLayout {
  const rows = clampGrid(opts.rows);
  const cols = clampGrid(opts.cols);
  const { width, height } = opts;
  if (!(width > 0 && height > 0)) throw new Error('Puzzle dimensions must be positive');
  const seed = opts.seed >>> 0;
  const rng = mulberry32(seed);
  const pw = width / cols;
  const ph = height / rows;
  const amp = Math.min(pw, ph);
  const pt = (c: number, r: number): Point => ({ x: c * pw, y: r * ph });

  // Horizontal edges: hEdges[r][c] is the edge on line y=r*ph from column c to c+1.
  // Canonical direction left→right; positive bulge points UP (towards row r-1).
  const hEdges: Edge[][] = [];
  const hDir: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    hEdges[r] = [];
    hDir[r] = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows) {
        hEdges[r][c] = flatEdge(pt(c, r), pt(c + 1, r));
        hDir[r][c] = 0;
      } else {
        const p = tabParams(rng);
        hEdges[r][c] = curvedEdge(pt(c, r), pt(c + 1, r), { x: 0, y: -1 }, amp, p);
        hDir[r][c] = p.dir;
      }
    }
  }
  // Vertical edges: vEdges[r][c] on line x=c*pw from row r to r+1.
  // Canonical direction top→bottom; positive bulge points RIGHT (towards col c).
  const vEdges: Edge[][] = [];
  const vDir: number[][] = [];
  for (let r = 0; r < rows; r++) {
    vEdges[r] = [];
    vDir[r] = [];
    for (let c = 0; c <= cols; c++) {
      if (c === 0 || c === cols) {
        vEdges[r][c] = flatEdge(pt(c, r), pt(c, r + 1));
        vDir[r][c] = 0;
      } else {
        const p = tabParams(rng);
        vEdges[r][c] = curvedEdge(pt(c, r), pt(c, r + 1), { x: 1, y: 0 }, amp, p);
        vDir[r][c] = p.dir;
      }
    }
  }

  const pieces: PieceShape[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c;
      // Clockwise: top (L→R), right (T→B), bottom (R→L), left (B→T).
      const top = hEdges[r][c];
      const right = vEdges[r][c + 1];
      const bottom = reverseEdge(hEdges[r + 1][c]);
      const left = reverseEdge(vEdges[r][c]);
      const segments = [...top.segments, ...right.segments, ...bottom.segments, ...left.segments];
      const sign = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0);
      // A positive h-edge bulge points up: it is a TAB for the piece below's
      // top side, and a BLANK for the piece above's bottom side.
      const sides = {
        top: sign(hDir[r][c]),
        bottom: sign(-hDir[r + 1][c]),
        right: sign(vDir[r][c + 1]),
        left: sign(-vDir[r][c]),
      } as Record<Side, -1 | 0 | 1>;
      const neighbors: Partial<Record<Side, number>> = {};
      if (r > 0) neighbors.top = id - cols;
      if (r < rows - 1) neighbors.bottom = id + cols;
      if (c > 0) neighbors.left = id - 1;
      if (c < cols - 1) neighbors.right = id + 1;
      pieces.push({
        id,
        row: r,
        col: c,
        x: c * pw,
        y: r * ph,
        w: pw,
        h: ph,
        sides,
        outline: { start: top.start, segments },
        neighbors,
      });
    }
  }

  return {
    rows,
    cols,
    width,
    height,
    pieceW: pw,
    pieceH: ph,
    margin: amp * TAB_HEIGHT * 1.15 + 1,
    pieces,
    seed,
  };
}

/** Axis-aligned bounds of an outline (control points included — conservative). */
export function outlineBounds(o: PieceShape['outline']): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = o.start.x;
  let maxX = o.start.x;
  let minY = o.start.y;
  let maxY = o.start.y;
  for (const s of o.segments) {
    for (const q of [s.c1, s.c2, s.p]) {
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
    }
  }
  return { minX, minY, maxX, maxY };
}
