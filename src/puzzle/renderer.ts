/**
 * Canvas 2D renderer. One <canvas>, zero per-piece DOM nodes.
 *
 * Performance strategy:
 *  - The artwork is rasterised once per layout at board-scale × DPR.
 *  - Every piece is pre-baked into two small sprites (flat + lifted with a
 *    baked drop shadow), so a frame is just a handful of drawImage calls.
 *  - Placed pieces are composited into a static "board layer" canvas.
 *  - Frames are only drawn on demand (see controller), never in an idle loop.
 */
import type { PieceShape, PuzzleLayout } from './generator';
import type { PuzzleEngine } from './engine';
import { traySlot, type ScreenLayout } from './layout';

export interface FrameState {
  engine: PuzzleEngine;
  drag: { id: number; x: number; y: number } | null;
  trayScroll: number;
  /** Pieces flying into their slot: world top-left position. */
  flying: Map<number, { x: number; y: number }>;
  /** Horizontal wiggle offset (screen px) for "wrong spot" feedback. */
  wiggle: Map<number, number>;
  /** Piece whose target outline should glow (drag proximity feedback). */
  hint: number | null;
  ghost: boolean;
  kbd: { selected: number | null; cell: { row: number; col: number } | null; holding: boolean };
  /** 0..1 completion reveal progress, or null. */
  completion: number | null;
  focusVisible: boolean;
}

interface Sprites {
  flat: HTMLCanvasElement;
  lifted: HTMLCanvasElement;
}

const COLORS = {
  boardBg: '#efe6d6',
  boardDot: 'rgba(91, 42, 134, 0.10)',
  frame: '#3d2358',
  frameInner: '#e9b949',
  trayBg: 'rgba(61, 35, 88, 0.07)',
  trayEdge: 'rgba(61, 35, 88, 0.16)',
  hint: '#f2b632',
  focus: '#5b2a86',
  cursor: '#e2533d',
};

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function outlineToPath(shape: PieceShape): Path2D {
  const p = new Path2D();
  const o = shape.outline;
  p.moveTo(o.start.x, o.start.y);
  for (const s of o.segments) p.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p.x, s.p.y);
  p.closePath();
  return p;
}

export class PuzzleRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private layout!: ScreenLayout;
  private art: HTMLCanvasElement | null = null;
  private paths: Path2D[] = [];
  private sprites: Sprites[] = [];
  private boardLayer: HTMLCanvasElement | null = null;
  private shadowPad = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly puzzle: PuzzleLayout,
    private source: CanvasImageSource,
  ) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.paths = puzzle.pieces.map(outlineToPath);
  }

  get screen(): ScreenLayout {
    return this.layout;
  }

  /** Rebuild all cached rasters for a new viewport size. */
  resize(layout: ScreenLayout, dpr: number, engine: PuzzleEngine, ghost: boolean): void {
    this.layout = layout;
    this.dpr = dpr;
    this.canvas.width = Math.round(layout.width * dpr);
    this.canvas.height = Math.round(layout.height * dpr);
    this.canvas.style.width = `${layout.width}px`;
    this.canvas.style.height = `${layout.height}px`;
    this.rasterizeArt();
    this.bakeSprites();
    this.rebuildBoardLayer(engine, ghost, new Set());
  }

  setSource(source: CanvasImageSource, engine: PuzzleEngine, ghost: boolean): void {
    this.source = source;
    if (this.layout) this.resize(this.layout, this.dpr, engine, ghost);
  }

  private get k(): number {
    return this.layout.board.scale * this.dpr;
  }

  private rasterizeArt(): void {
    const { width, height } = this.puzzle;
    const k = this.k;
    const art = makeCanvas(width * k, height * k);
    const actx = art.getContext('2d')!;
    actx.imageSmoothingQuality = 'high';
    try {
      actx.drawImage(this.source, 0, 0, art.width, art.height);
    } catch {
      actx.fillStyle = '#c9b8e8';
      actx.fillRect(0, 0, art.width, art.height);
    }
    this.art = art;
  }

  private bakeSprites(): void {
    const k = this.k;
    const m = this.puzzle.margin;
    const sp = Math.ceil(10 * this.dpr);
    this.shadowPad = sp;
    const art = this.art!;
    const lineW = Math.max(1, 1.1 * this.dpr);
    const bevel = Math.max(1, 1.4 * this.dpr);
    this.sprites = this.puzzle.pieces.map((shape, i) => {
      const w = (shape.w + m * 2) * k;
      const h = (shape.h + m * 2) * k;
      const flat = makeCanvas(w, h);
      const c = flat.getContext('2d')!;
      const path = this.paths[i];
      // world → sprite pixels
      c.setTransform(k, 0, 0, k, (m - shape.x) * k, (m - shape.y) * k);
      c.save();
      c.clip(path);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(art, (shape.x - m) * k, (shape.y - m) * k, w, h, 0, 0, w, h);
      // Bevel: light top-left, shade bottom-right (drawn inside the clip).
      c.lineWidth = (bevel * 2) / k;
      c.setTransform(k, 0, 0, k, (m - shape.x) * k + bevel, (m - shape.y) * k + bevel);
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.stroke(path);
      c.setTransform(k, 0, 0, k, (m - shape.x) * k - bevel, (m - shape.y) * k - bevel);
      c.strokeStyle = 'rgba(30,16,48,0.30)';
      c.stroke(path);
      c.restore();
      c.setTransform(k, 0, 0, k, (m - shape.x) * k, (m - shape.y) * k);
      c.lineWidth = lineW / k;
      c.strokeStyle = 'rgba(30,16,48,0.35)';
      c.stroke(path);

      const lifted = makeCanvas(w + sp * 2, h + sp * 2);
      const lc = lifted.getContext('2d')!;
      lc.shadowColor = 'rgba(30, 16, 48, 0.38)';
      lc.shadowBlur = 8 * this.dpr;
      lc.shadowOffsetY = 4 * this.dpr;
      lc.drawImage(flat, sp, sp);
      return { flat, lifted };
    });
  }

  /** Redraw the static board layer (frame, ghost, placed pieces). */
  rebuildBoardLayer(engine: PuzzleEngine, ghost: boolean, exclude: Set<number>): void {
    const { board } = this.layout;
    const dpr = this.dpr;
    const pad = 14;
    const layer = makeCanvas((board.w + pad * 2) * dpr, (board.h + pad * 2) * dpr);
    const c = layer.getContext('2d')!;
    c.scale(dpr, dpr);
    // Card frame
    c.save();
    c.shadowColor = 'rgba(40, 20, 60, 0.22)';
    c.shadowBlur = 12;
    c.shadowOffsetY = 4;
    roundRectPath(c, pad - 8, pad - 8, board.w + 16, board.h + 16, 14);
    c.fillStyle = COLORS.frame;
    c.fill();
    c.restore();
    roundRectPath(c, pad - 3, pad - 3, board.w + 6, board.h + 6, 9);
    c.strokeStyle = COLORS.frameInner;
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = COLORS.boardBg;
    c.fillRect(pad, pad, board.w, board.h);
    // Subtle dot grid marking the cell corners (shape, not colour, carries meaning).
    c.fillStyle = COLORS.boardDot;
    const { rows, cols, pieceW, pieceH } = this.puzzle;
    const s = board.scale;
    for (let r = 1; r < rows; r++)
      for (let q = 1; q < cols; q++) {
        c.beginPath();
        c.arc(pad + q * pieceW * s, pad + r * pieceH * s, Math.max(1.5, 2.2), 0, Math.PI * 2);
        c.fill();
      }
    if (ghost && this.art) {
      c.globalAlpha = 0.2;
      c.drawImage(this.art, pad, pad, board.w, board.h);
      c.globalAlpha = 1;
    }
    this.boardLayer = layer;
    for (const p of engine.pieces) if (p.loc === 'placed' && !exclude.has(p.id)) this.commitPlaced(p.id);
  }

  /** Stamp a placed piece permanently into the board layer. */
  commitPlaced(id: number): void {
    if (!this.boardLayer) return;
    const c = this.boardLayer.getContext('2d')!;
    const shape = this.puzzle.pieces[id];
    const m = this.puzzle.margin;
    const s = this.layout.board.scale;
    const sprite = this.sprites[id].flat;
    const pad = 14;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.drawImage(sprite, pad + (shape.x - m) * s, pad + (shape.y - m) * s, sprite.width / this.dpr, sprite.height / this.dpr);
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const { board } = this.layout;
    return { x: board.x + x * board.scale, y: board.y + y * board.scale };
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    const { board } = this.layout;
    return { x: (x - board.x) / board.scale, y: (y - board.y) / board.scale };
  }

  /** Scale factor used to fit a piece into a tray cell. */
  trayPieceScale(): number {
    const m = this.puzzle.margin;
    const maxDim = Math.max(this.puzzle.pieceW, this.puzzle.pieceH) + m * 2;
    return (this.layout.tray.cell * 0.92) / maxDim;
  }

  draw(f: FrameState): void {
    const ctx = this.ctx;
    const L = this.layout;
    const dpr = this.dpr;
    const { board, tray } = L;
    const s = board.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Board layer
    if (this.boardLayer) ctx.drawImage(this.boardLayer, board.x - 14, board.y - 14, this.boardLayer.width / dpr, this.boardLayer.height / dpr);

    // 2. Completion reveal: full artwork fades over the seams.
    if (f.completion !== null && this.art) {
      ctx.globalAlpha = Math.min(1, f.completion * 1.4);
      ctx.drawImage(this.art, board.x, board.y, board.w, board.h);
      ctx.globalAlpha = 1;
      const t = f.completion;
      if (t > 0 && t < 1) {
        const gx = board.x - board.w + t * board.w * 3;
        const g = ctx.createLinearGradient(gx - 60, board.y, gx + 60, board.y + board.h);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,245,210,0.45)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.beginPath();
        ctx.rect(board.x, board.y, board.w, board.h);
        ctx.clip();
        ctx.fillStyle = g;
        ctx.fillRect(board.x, board.y, board.w, board.h);
        ctx.restore();
      }
    }

    // 3. Proximity hint outline at the correct slot.
    if (f.hint !== null) {
      const shape = this.puzzle.pieces[f.hint];
      ctx.save();
      ctx.setTransform(dpr * s, 0, 0, dpr * s, board.x * dpr, board.y * dpr);
      ctx.lineWidth = 3 / s;
      ctx.strokeStyle = COLORS.hint;
      ctx.setLineDash([8 / s, 6 / s]);
      ctx.stroke(this.paths[shape.id]);
      ctx.restore();
    }

    // 4. Flying (snapping) pieces.
    f.flying.forEach((pos, id) => this.drawPiece(id, pos.x, pos.y, false, 0));

    // 5. Free pieces.
    for (const id of f.engine.zOrder) {
      if (f.drag && f.drag.id === id) continue;
      const p = f.engine.pieces[id];
      this.drawPiece(id, p.x, p.y, true, f.wiggle.get(id) ?? 0);
      if (f.kbd.selected === id && f.focusVisible) this.focusRingWorld(id, p.x, p.y);
    }

    // 6. Tray.
    ctx.save();
    roundRectPath(ctx, tray.x + 4, tray.y + 4, tray.w - 8, tray.h - 8, 16);
    ctx.fillStyle = COLORS.trayBg;
    ctx.fill();
    ctx.strokeStyle = COLORS.trayEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.clip();
    const ts = this.trayPieceScale();
    const order = f.engine.tray;
    const scroll = f.trayScroll;
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const slot = traySlot(tray, i);
      const sx = tray.axis === 'x' ? slot.x - scroll : slot.x;
      const sy = tray.axis === 'y' ? slot.y - scroll : slot.y;
      if (sx + tray.cell < tray.x || sx > tray.x + tray.w || sy + tray.cell < tray.y || sy > tray.y + tray.h) continue;
      const sprite = this.sprites[id].flat;
      const sw = (sprite.width / this.k) * ts;
      const sh = (sprite.height / this.k) * ts;
      ctx.drawImage(sprite, sx + (tray.cell - sw) / 2, sy + (tray.cell - sh) / 2, sw, sh);
      if (f.kbd.selected === id && f.focusVisible) {
        roundRectPath(ctx, sx + 3, sy + 3, tray.cell - 6, tray.cell - 6, 10);
        ctx.lineWidth = 3;
        ctx.strokeStyle = COLORS.focus;
        ctx.stroke();
        roundRectPath(ctx, sx + 6, sy + 6, tray.cell - 12, tray.cell - 12, 8);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
    ctx.restore();
    this.drawTrayFades(f.trayScroll, order.length);

    // 7. Keyboard target cell.
    if (f.kbd.holding && f.kbd.cell) {
      const { row, col } = f.kbd.cell;
      const x = board.x + col * this.puzzle.pieceW * s;
      const y = board.y + row * this.puzzle.pieceH * s;
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.cursor;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x + 2, y + 2, this.puzzle.pieceW * s - 4, this.puzzle.pieceH * s - 4);
      ctx.restore();
    }

    // 8. Dragged piece on top, slightly enlarged.
    if (f.drag) this.drawPiece(f.drag.id, f.drag.x, f.drag.y, true, 0, 1.04);
  }

  private drawTrayFades(scroll: number, count: number): void {
    const ctx = this.ctx;
    const t = this.layout.tray;
    const content = Math.ceil(count / t.lines) * t.cell + t.pad * 2;
    const visible = t.axis === 'x' ? t.w : t.h;
    const arrow = (x: number, y: number, dir: 'l' | 'r' | 'u' | 'd') => {
      ctx.save();
      ctx.fillStyle = 'rgba(61,35,88,0.55)';
      ctx.beginPath();
      const a = 7;
      if (dir === 'l') { ctx.moveTo(x - a, y); ctx.lineTo(x + a, y - a); ctx.lineTo(x + a, y + a); }
      if (dir === 'r') { ctx.moveTo(x + a, y); ctx.lineTo(x - a, y - a); ctx.lineTo(x - a, y + a); }
      if (dir === 'u') { ctx.moveTo(x, y - a); ctx.lineTo(x - a, y + a); ctx.lineTo(x + a, y + a); }
      if (dir === 'd') { ctx.moveTo(x, y + a); ctx.lineTo(x - a, y - a); ctx.lineTo(x + a, y - a); }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    if (t.axis === 'x') {
      if (scroll > 2) arrow(t.x + 14, t.y + t.h / 2, 'l');
      if (scroll < content - visible - 2) arrow(t.x + t.w - 14, t.y + t.h / 2, 'r');
    } else {
      if (scroll > 2) arrow(t.x + t.w / 2, t.y + 14, 'u');
      if (scroll < content - visible - 2) arrow(t.x + t.w / 2, t.y + t.h - 14, 'd');
    }
  }

  private drawPiece(id: number, wx: number, wy: number, lifted: boolean, dx: number, scaleUp = 1): void {
    const ctx = this.ctx;
    const { board } = this.layout;
    const s = board.scale;
    const m = this.puzzle.margin;
    const sprite = lifted ? this.sprites[id].lifted : this.sprites[id].flat;
    const pad = lifted ? this.shadowPad : 0;
    const w = sprite.width / this.dpr;
    const h = sprite.height / this.dpr;
    let x = board.x + (wx - m) * s - pad / this.dpr + dx;
    let y = board.y + (wy - m) * s - pad / this.dpr;
    if (scaleUp !== 1) {
      x -= (w * (scaleUp - 1)) / 2;
      y -= (h * (scaleUp - 1)) / 2;
    }
    ctx.drawImage(sprite, x, y, w * scaleUp, h * scaleUp);
  }

  private focusRingWorld(id: number, wx: number, wy: number): void {
    const ctx = this.ctx;
    const { board } = this.layout;
    const shape = this.puzzle.pieces[id];
    const s = board.scale;
    ctx.save();
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, (board.x + (wx - shape.x) * s) * this.dpr, (board.y + (wy - shape.y) * s) * this.dpr);
    ctx.lineWidth = 4 / s;
    ctx.strokeStyle = COLORS.focus;
    ctx.stroke(this.paths[id]);
    ctx.lineWidth = 1.5 / s;
    ctx.strokeStyle = '#fff';
    ctx.stroke(this.paths[id]);
    ctx.restore();
  }

  /** Release cached canvases (helps GC on low-memory devices). */
  dispose(): void {
    for (const s of this.sprites) {
      s.flat.width = s.flat.height = 0;
      s.lifted.width = s.lifted.height = 0;
    }
    this.sprites = [];
    if (this.boardLayer) this.boardLayer.width = this.boardLayer.height = 0;
    if (this.art) this.art.width = this.art.height = 0;
    this.boardLayer = null;
    this.art = null;
  }
}
