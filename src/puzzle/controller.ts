/**
 * Puzzle controller: Pointer Events (mouse + touch + pen share one path),
 * keyboard play, short tweens, and on-demand rendering.
 */
import type { PuzzleEngine, DropResult } from './engine';
import type { PuzzleLayout } from './generator';
import { PuzzleRenderer, type FrameState } from './renderer';
import { clamp, computeLayout, inRect, trayIndexAt, trayMaxScroll, traySlot } from './layout';

export interface ControllerCallbacks {
  onPickup(id: number): void;
  onSnap(id: number, complete: boolean): void;
  onDrop(result: DropResult): void;
  /** Any change worth persisting (piece moved, placed, returned). */
  onChange(): void;
  /** First meaningful interaction (starts the timer). */
  onInteract(): void;
  onAnnounce(message: string): void;
}

export interface ControllerOptions {
  reducedMotion: () => boolean;
  ghost: boolean;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'tray-pending'; pointerId: number; sx: number; sy: number; id: number | null; scroll0: number }
  | { kind: 'tray-scroll'; pointerId: number; sx: number; sy: number; scroll0: number }
  | { kind: 'drag'; pointerId: number; id: number; gx: number; gy: number; touch: boolean };

interface Fly {
  id: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  start: number;
  dur: number;
}

const DRAG_THRESHOLD = 8;

export class PuzzleController {
  readonly renderer: PuzzleRenderer;
  private mode: Mode = { kind: 'idle' };
  private trayScroll = 0;
  private dragPos: { x: number; y: number } | null = null;
  private hint: number | null = null;
  private flies: Fly[] = [];
  private wiggles = new Map<number, number>();
  private completionStart: number | null = null;
  private completionValue: number | null = null;
  private raf = 0;
  private paused = false;
  private ghost: boolean;
  private kbdSelected: number | null = null;
  private kbdHolding = false;
  private kbdCell: { row: number; col: number } | null = null;
  private focusVisible = false;
  private interacted = false;
  private disposers: Array<() => void> = [];
  private onCompleteAnim: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly puzzle: PuzzleLayout,
    private readonly engine: PuzzleEngine,
    source: CanvasImageSource,
    private readonly cb: ControllerCallbacks,
    private readonly opts: ControllerOptions,
  ) {
    this.ghost = opts.ghost;
    this.renderer = new PuzzleRenderer(canvas, puzzle, source);
    if (engine.placedCount > 0 || engine.zOrder.length > 0) this.interacted = true;
    this.attach();
  }

  /** Read-only snapshot for automated QA in development builds. */
  debugState(): { trayScroll: number; selected: number | null; holding: boolean } {
    return { trayScroll: this.trayScroll, selected: this.kbdSelected, holding: this.kbdHolding };
  }

  // ---------- lifecycle ----------
  resize(width: number, height: number, dpr: number): void {
    const layout = computeLayout(width, height, this.puzzle.width, this.puzzle.height, this.puzzle.margin);
    this.finishAnimations();
    this.renderer.resize(layout, dpr, this.engine, this.ghost);
    this.trayScroll = clamp(this.trayScroll, 0, trayMaxScroll(layout.tray, this.engine.tray.length));
    for (const id of this.engine.zOrder) {
      const p = this.engine.pieces[id];
      const c = this.clampWorld(p.x, p.y);
      p.x = c.x;
      p.y = c.y;
    }
    this.requestFrame();
  }

  setSource(source: CanvasImageSource): void {
    this.renderer.setSource(source, this.engine, this.ghost);
    this.requestFrame();
  }

  setGhost(on: boolean): void {
    this.ghost = on;
    this.finishAnimations();
    this.renderer.rebuildBoardLayer(this.engine, on, new Set());
    this.requestFrame();
  }

  pause(): void {
    this.paused = true;
    this.cancelDrag();
    this.finishAnimations();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resume(): void {
    this.paused = false;
    this.requestFrame();
  }

  /** Plays the completion reveal, then calls `done`. */
  playCompletion(done: () => void): void {
    this.hint = null;
    if (this.opts.reducedMotion()) {
      this.completionValue = 1;
      this.requestFrame();
      setTimeout(done, 250);
      return;
    }
    this.onCompleteAnim = done;
    this.completionStart = -1; // set on next frame
    this.requestFrame();
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.renderer.dispose();
  }

  // ---------- rendering ----------
  requestFrame(): void {
    if (this.paused || this.raf) return;
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(now: number): void {
    this.raf = 0;
    let active = false;
    // Flights into place
    const flying = new Map<number, { x: number; y: number }>();
    this.flies = this.flies.filter((f) => {
      const t = f.dur <= 0 ? 1 : Math.min(1, (now - f.start) / f.dur);
      if (t >= 1) {
        this.renderer.commitPlaced(f.id);
        return false;
      }
      const e = 1 - Math.pow(1 - t, 3);
      flying.set(f.id, { x: f.fx + (f.tx - f.fx) * e, y: f.fy + (f.ty - f.fy) * e });
      active = true;
      return true;
    });
    // Wiggles store their start time; convert to an offset.
    const wiggleOffsets = new Map<number, number>();
    this.wiggles.forEach((start, id) => {
      const t = (now - start) / 320;
      if (t >= 1) this.wiggles.delete(id);
      else {
        wiggleOffsets.set(id, Math.sin(t * Math.PI * 5) * 5 * (1 - t));
        active = true;
      }
    });
    if (this.completionStart !== null) {
      if (this.completionStart < 0) this.completionStart = now;
      const t = Math.min(1, (now - this.completionStart) / 1100);
      this.completionValue = t;
      if (t >= 1) {
        this.completionStart = null;
        const done = this.onCompleteAnim;
        this.onCompleteAnim = null;
        if (done) setTimeout(done, 120);
      } else active = true;
    }
    const drag = this.mode.kind === 'drag' && this.dragPos ? { id: this.mode.id, x: this.dragPos.x, y: this.dragPos.y } : null;
    const frame: FrameState = {
      engine: this.engine,
      drag,
      trayScroll: this.trayScroll,
      flying,
      wiggle: wiggleOffsets,
      hint: this.hint,
      ghost: this.ghost,
      kbd: { selected: this.kbdSelected, cell: this.kbdCell, holding: this.kbdHolding },
      completion: this.completionValue,
      focusVisible: this.focusVisible,
    };
    this.renderer.draw(frame);
    if (active) this.requestFrame();
  }

  private finishAnimations(): void {
    for (const f of this.flies) this.renderer.commitPlaced(f.id);
    this.flies = [];
    this.wiggles.clear();
  }

  // ---------- input ----------
  private attach(): void {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => c.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', (e) => this.onPointerDown(e));
    on('pointermove', (e) => this.onPointerMove(e));
    on('pointerup', (e) => this.onPointerUp(e));
    on('pointercancel', (e) => this.onPointerCancel(e));
    on('lostpointercapture', (e) => this.onPointerCancel(e));
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('keydown', (e) => this.onKeyDown(e));
    on('contextmenu', (e) => e.preventDefault());
    on('blur', () => {
      this.focusVisible = false;
      this.requestFrame();
    });
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private markInteracted(): void {
    if (!this.interacted) {
      this.interacted = true;
      this.cb.onInteract();
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.paused || this.mode.kind !== 'idle' || this.completionValue !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.focusVisible = false;
    this.kbdHolding = false;
    const p = this.local(e);
    const L = this.renderer.screen;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    if (inRect(L.tray, p.x, p.y)) {
      const idx = this.trayItemAt(p.x, p.y);
      const id = idx === null ? null : this.engine.tray[idx];
      if (id !== null && e.pointerType === 'mouse') {
        this.beginDragFromTray(e.pointerId, id, p.x, p.y, false);
        return;
      }
      this.mode = { kind: 'tray-pending', pointerId: e.pointerId, sx: p.x, sy: p.y, id, scroll0: this.trayScroll };
      return;
    }
    const w = this.renderer.screenToWorld(p.x, p.y);
    const id = this.engine.pieceAt(w.x, w.y);
    if (id !== null) {
      const piece = this.engine.pieces[id];
      this.engine.pickUp(id);
      this.mode = { kind: 'drag', pointerId: e.pointerId, id, gx: w.x - piece.x, gy: w.y - piece.y, touch: e.pointerType !== 'mouse' };
      this.dragPos = { x: piece.x, y: piece.y };
      this.kbdSelected = id;
      this.markInteracted();
      this.cb.onPickup(id);
      this.requestFrame();
    }
  }

  private beginDragFromTray(pointerId: number, id: number, sx: number, sy: number, touch: boolean): void {
    this.engine.pickUp(id);
    const w = this.renderer.screenToWorld(sx, sy);
    const lift = touch ? this.puzzle.pieceH * 0.35 : 0;
    const gx = this.puzzle.pieceW / 2;
    const gy = this.puzzle.pieceH / 2 + lift;
    this.mode = { kind: 'drag', pointerId, id, gx, gy, touch };
    this.dragPos = { x: w.x - gx, y: w.y - gy };
    this.kbdSelected = id;
    this.markInteracted();
    this.cb.onPickup(id);
    this.requestFrame();
  }

  private onPointerMove(e: PointerEvent): void {
    const m = this.mode;
    if (m.kind === 'idle' || e.pointerId !== m.pointerId) return;
    const p = this.local(e);
    const L = this.renderer.screen;
    if (m.kind === 'tray-pending') {
      const dx = p.x - m.sx;
      const dy = p.y - m.sy;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      const along = L.tray.axis === 'x' ? dx : dy;
      const across = L.tray.axis === 'x' ? dy : dx;
      if (m.id === null || Math.abs(along) > Math.abs(across) * 1.2) {
        this.mode = { kind: 'tray-scroll', pointerId: m.pointerId, sx: m.sx, sy: m.sy, scroll0: m.scroll0 };
      } else {
        this.beginDragFromTray(m.pointerId, m.id, p.x, p.y, e.pointerType !== 'mouse');
        return;
      }
    }
    const mm = this.mode;
    if (mm.kind === 'tray-scroll') {
      const delta = L.tray.axis === 'x' ? p.x - mm.sx : p.y - mm.sy;
      this.trayScroll = clamp(mm.scroll0 - delta, 0, trayMaxScroll(L.tray, this.engine.tray.length));
      this.requestFrame();
    } else if (mm.kind === 'drag') {
      const w = this.renderer.screenToWorld(p.x, p.y);
      this.dragPos = { x: w.x - mm.gx, y: w.y - mm.gy };
      const near = this.engine.isNearTarget(mm.id, this.dragPos.x, this.dragPos.y, 1.9);
      this.hint = near ? mm.id : null;
      this.requestFrame();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const m = this.mode;
    if (m.kind === 'idle' || e.pointerId !== m.pointerId) return;
    this.mode = { kind: 'idle' };
    this.hint = null;
    if (m.kind === 'drag' && this.dragPos) {
      const p = this.local(e);
      this.finishDrop(m.id, this.dragPos.x, this.dragPos.y, inRect(this.renderer.screen.tray, p.x, p.y), p.x, p.y);
    }
    this.dragPos = null;
    this.requestFrame();
  }

  private onPointerCancel(e: PointerEvent): void {
    const m = this.mode;
    if (m.kind === 'idle' || e.pointerId !== m.pointerId) return;
    this.cancelDrag();
  }

  /** Abort an in-flight drag, leaving the piece where it was last seen. */
  private cancelDrag(): void {
    const m = this.mode;
    if (m.kind === 'drag' && this.dragPos) {
      const c = this.clampWorld(this.dragPos.x, this.dragPos.y);
      this.engine.moveTo(m.id, c.x, c.y);
      this.cb.onChange();
    }
    this.mode = { kind: 'idle' };
    this.dragPos = null;
    this.hint = null;
    this.requestFrame();
  }

  private finishDrop(id: number, x: number, y: number, overTray: boolean, sx: number, sy: number): void {
    const L = this.renderer.screen;
    const idx = overTray ? trayIndexAt(L.tray, sx, sy, this.trayScroll, this.engine.tray.length) : 0;
    const target = overTray ? { x, y } : this.clampWorld(x, y);
    // Snap check uses the un-clamped position so edge pieces snap reliably.
    const near = !overTray && this.engine.isNearTarget(id, x, y);
    const result = this.engine.drop(id, near ? x : target.x, near ? y : target.y, overTray, idx);
    if (result.type === 'snapped') {
      const shape = this.puzzle.pieces[id];
      const dur = this.opts.reducedMotion() ? 0 : 140;
      this.flies.push({ id, fx: x, fy: y, tx: shape.x, ty: shape.y, start: performance.now(), dur });
      this.cb.onSnap(id, result.complete);
      this.advanceSelection();
    } else if (result.type === 'free') {
      if (result.onBoard && !this.opts.reducedMotion()) this.wiggles.set(id, performance.now());
      this.cb.onDrop(result);
    } else {
      this.trayScroll = clamp(this.trayScroll, 0, trayMaxScroll(L.tray, this.engine.tray.length));
      this.cb.onDrop(result);
    }
    this.cb.onChange();
    this.requestFrame();
  }

  private onWheel(e: WheelEvent): void {
    if (this.paused) return;
    const p = this.local(e);
    const L = this.renderer.screen;
    if (!inRect(L.tray, p.x, p.y)) return;
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    this.trayScroll = clamp(this.trayScroll + delta, 0, trayMaxScroll(L.tray, this.engine.tray.length));
    this.requestFrame();
  }

  private trayItemAt(sx: number, sy: number): number | null {
    const t = this.renderer.screen.tray;
    for (let i = 0; i < this.engine.tray.length; i++) {
      const slot = traySlot(t, i);
      const x = t.axis === 'x' ? slot.x - this.trayScroll : slot.x;
      const y = t.axis === 'y' ? slot.y - this.trayScroll : slot.y;
      if (sx >= x && sx <= x + t.cell && sy >= y && sy <= y + t.cell) return i;
    }
    return null;
  }

  /** Keep loose pieces inside the play area (never under the tray or HUD). */
  private clampWorld(x: number, y: number): { x: number; y: number } {
    const L = this.renderer.screen;
    const { pieceW, pieceH, margin } = this.puzzle;
    const tl = this.renderer.screenToWorld(L.play.x, L.play.y);
    const br = this.renderer.screenToWorld(L.play.x + L.play.w, L.play.y + L.play.h);
    const slack = margin * 0.2;
    return {
      x: clamp(x, tl.x - slack, Math.max(tl.x, br.x - pieceW + slack)),
      y: clamp(y, tl.y - slack, Math.max(tl.y, br.y - pieceH + slack)),
    };
  }

  // ---------- keyboard ----------
  private selectable(): number[] {
    return [...this.engine.tray, ...this.engine.zOrder];
  }

  private advanceSelection(): void {
    const list = this.selectable();
    this.kbdSelected = list.length ? list[0] : null;
    this.ensureSelectionVisible();
  }

  private ensureSelectionVisible(): void {
    if (this.kbdSelected === null) return;
    const idx = this.engine.tray.indexOf(this.kbdSelected);
    if (idx < 0) return;
    const t = this.renderer.screen.tray;
    const slot = traySlot(t, idx);
    const pos = t.axis === 'x' ? slot.x - t.x : slot.y - t.y;
    const visible = t.axis === 'x' ? t.w : t.h;
    if (pos - this.trayScroll < 0) this.trayScroll = pos - t.pad;
    else if (pos + t.cell - this.trayScroll > visible) this.trayScroll = pos + t.cell - visible + t.pad;
    this.trayScroll = clamp(this.trayScroll, 0, trayMaxScroll(t, this.engine.tray.length));
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.paused || this.completionValue !== null) return;
    const key = e.key;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    if (key === 'Escape') {
      // Never preventDefault on Esc (YouTube Playables requirement).
      if (this.kbdHolding) {
        this.kbdHolding = false;
        this.cb.onAnnounce('Placement cancelled.');
        this.requestFrame();
      }
      return;
    }
    const list = this.selectable();
    if (!list.length) return;
    this.focusVisible = true;
    if (arrows[key]) {
      e.preventDefault();
      const [dr, dc] = arrows[key];
      if (this.kbdHolding && this.kbdCell) {
        this.kbdCell = {
          row: clamp(this.kbdCell.row + dr, 0, this.puzzle.rows - 1),
          col: clamp(this.kbdCell.col + dc, 0, this.puzzle.cols - 1),
        };
        this.cb.onAnnounce(`Row ${this.kbdCell.row + 1}, column ${this.kbdCell.col + 1}`);
      } else {
        const cur = this.kbdSelected === null ? -1 : list.indexOf(this.kbdSelected);
        const step = dr + dc;
        const next = cur < 0 ? 0 : (cur + step + list.length) % list.length;
        this.kbdSelected = list[next];
        this.ensureSelectionVisible();
        this.cb.onAnnounce(`Piece ${next + 1} of ${list.length} selected. Press Enter to pick it up.`);
      }
      this.requestFrame();
      return;
    }
    if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      if (this.kbdSelected === null || !list.includes(this.kbdSelected)) {
        this.kbdSelected = list[0];
        this.ensureSelectionVisible();
        this.requestFrame();
        return;
      }
      if (!this.kbdHolding) {
        this.kbdHolding = true;
        const p = this.engine.pieces[this.kbdSelected];
        const cell =
          p.loc === 'free' ? this.engine.cellAt(p.x + this.puzzle.pieceW / 2, p.y + this.puzzle.pieceH / 2) : null;
        this.kbdCell = cell ?? { row: Math.floor(this.puzzle.rows / 2), col: Math.floor(this.puzzle.cols / 2) };
        this.cb.onAnnounce('Piece picked up. Use arrow keys to choose a board cell, Enter to place, Escape to cancel.');
      } else if (this.kbdCell) {
        const id = this.kbdSelected;
        this.kbdHolding = false;
        const wasInTray = this.engine.pieces[id].loc === 'tray';
        this.engine.pickUp(id);
        this.markInteracted();
        this.cb.onPickup(id);
        const x = this.kbdCell.col * this.puzzle.pieceW;
        const y = this.kbdCell.row * this.puzzle.pieceH;
        const from = this.engine.pieces[id];
        const fx = wasInTray ? x : from.x;
        const fy = wasInTray ? y - this.puzzle.pieceH * 0.3 : from.y;
        const result = this.engine.drop(id, x, y, false);
        if (result.type === 'snapped') {
          const dur = this.opts.reducedMotion() ? 0 : 140;
          this.flies.push({ id, fx, fy, tx: x, ty: y, start: performance.now(), dur });
          this.cb.onSnap(id, result.complete);
          this.advanceSelection();
        } else {
          if (!this.opts.reducedMotion()) this.wiggles.set(id, performance.now());
          this.cb.onDrop(result);
          this.cb.onAnnounce('Not quite — the piece is resting on the board. Try another cell.');
        }
        this.cb.onChange();
      }
      this.requestFrame();
    }
  }
}
