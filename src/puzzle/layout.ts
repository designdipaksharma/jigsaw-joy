/**
 * Responsive screen layout for the puzzle view (CSS pixels).
 * Portrait-ish viewports put the piece tray under the board; wide viewports
 * put it on the right. Works for every aspect ratio from 9:32 to 32:9.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrayLayout extends Rect {
  axis: 'x' | 'y';
  /** Number of parallel lines of pieces (rows when axis=x, columns when axis=y). */
  lines: number;
  cell: number;
  pad: number;
}

export interface ScreenLayout {
  width: number;
  height: number;
  hud: number;
  /** Where the board (world 0..W × 0..H) is drawn. */
  board: Rect & { scale: number };
  tray: TrayLayout;
  /** Area in which loose pieces may rest (excludes HUD and tray). */
  play: Rect;
}

export function computeLayout(
  width: number,
  height: number,
  worldW: number,
  worldH: number,
  marginWorld: number,
  hud = 56,
): ScreenLayout {
  const w = Math.max(200, width);
  const h = Math.max(200, height);
  const portrait = h >= w * 0.95;
  const pad = 8;
  let tray: TrayLayout;
  let play: Rect;

  if (portrait) {
    // Give the tray whatever height the (width-limited) board doesn't need.
    const scaleW = (w - 24) / (worldW + marginWorld * 2);
    const boardNeed = (worldH + marginWorld * 2) * scaleW + 24;
    const trayH = Math.round(clamp(h - hud - boardNeed, 96, Math.max(96, h * 0.36)));
    const lines = trayH >= 186 ? 2 : 1;
    tray = { x: 0, y: h - trayH, w, h: trayH, axis: 'x', lines, cell: (trayH - pad * 2) / lines, pad };
    play = { x: 0, y: hud, w, h: h - hud - trayH };
  } else {
    const trayW = Math.round(clamp(w * 0.27, 120, 400));
    const inner = trayW - pad * 2;
    const lines = Math.max(1, Math.min(4, Math.floor(inner / 96)));
    tray = { x: w - trayW, y: hud, w: trayW, h: h - hud, axis: 'y', lines, cell: inner / lines, pad };
    play = { x: 0, y: hud, w: w - trayW, h: h - hud };
  }

  // Fit the board inside the play area, leaving room for protruding tabs.
  const gap = 12;
  const availW = play.w - gap * 2;
  const availH = play.h - gap * 2;
  let scale = Math.min(availW / (worldW + marginWorld * 2), availH / (worldH + marginWorld * 2));
  scale = Math.max(0.05, scale);
  const bw = worldW * scale;
  const bh = worldH * scale;
  const board = {
    x: Math.round(play.x + (play.w - bw) / 2),
    y: Math.round(play.y + (play.h - bh) / 2),
    w: bw,
    h: bh,
    scale,
  };
  return { width: w, height: h, hud, board, tray, play };
}

/** Screen position (top-left of the cell) of the i-th tray item before scrolling. */
export function traySlot(t: TrayLayout, index: number): { x: number; y: number } {
  const line = index % t.lines;
  const slot = Math.floor(index / t.lines);
  if (t.axis === 'x') return { x: t.x + t.pad + slot * t.cell, y: t.y + t.pad + line * t.cell };
  return { x: t.x + t.pad + line * t.cell, y: t.y + t.pad + slot * t.cell };
}

export function trayContentLength(t: TrayLayout, count: number): number {
  return Math.ceil(count / t.lines) * t.cell + t.pad * 2;
}

export function trayMaxScroll(t: TrayLayout, count: number): number {
  const visible = t.axis === 'x' ? t.w : t.h;
  return Math.max(0, trayContentLength(t, count) - visible);
}

/** Tray index under a screen point (for inserting pieces back), given scroll. */
export function trayIndexAt(t: TrayLayout, sx: number, sy: number, scroll: number, count: number): number {
  const along = t.axis === 'x' ? sx - t.x - t.pad + scroll : sy - t.y - t.pad + scroll;
  const across = t.axis === 'x' ? sy - t.y - t.pad : sx - t.x - t.pad;
  const slot = Math.max(0, Math.floor(along / t.cell));
  const line = Math.max(0, Math.min(t.lines - 1, Math.floor(across / t.cell)));
  return Math.max(0, Math.min(count, slot * t.lines + line));
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
