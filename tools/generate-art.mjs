#!/usr/bin/env node
/**
 * Jigsaw Joy — original artwork generator.
 *
 * Every illustration in public/assets/art is produced by THIS script from
 * simple geometric primitives and a seeded random generator. No third-party
 * images, fonts, traces or references are used, so the output is original
 * work owned by the project (see LICENSE / docs/ART_CREDITS in README).
 *
 * Usage: npm run art   (rewrites public/assets/art/*.svg deterministically)
 *
 * Canvas: 800 x 1000 (4:5 portrait "card" ratio).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 800;
const H = 1000;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'art');
mkdirSync(OUT, { recursive: true });

// ---------- deterministic helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let R = mulberry32(1);
const rnd = (a = 0, b = 1) => a + (b - a) * R();
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const f = (n) => (Math.round(n * 10) / 10).toString();

// ---------- primitive builders ----------
const linGrad = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
    .join('')}</linearGradient>`;
const radGrad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`)
    .join('')}</radialGradient>`;
const rect = (x, y, w, h, fill, extra = '') =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" ${extra}/>`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" ${extra}/>`;
const ellipse = (x, y, rx, ry, fill, extra = '') =>
  `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" ${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const poly = (pts, fill, extra = '') =>
  `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${fill}" ${extra}/>`;

/** Midpoint-displacement ridge from x=0..W, closed to the bottom. */
function ridgePoints(baseY, amp, rough = 0.55, n = 6) {
  let pts = [
    [0, baseY + rnd(-amp, amp) * 0.5],
    [W, baseY + rnd(-amp, amp) * 0.5],
  ];
  let a = amp;
  for (let i = 0; i < n; i++) {
    const next = [pts[0]];
    for (let j = 1; j < pts.length; j++) {
      const [x0, y0] = pts[j - 1];
      const [x1, y1] = pts[j];
      next.push([(x0 + x1) / 2, (y0 + y1) / 2 + rnd(-a, a)], pts[j]);
    }
    pts = next;
    a *= rough;
  }
  return pts;
}
function ridge(baseY, amp, fill, rough, n, bottom = H, extra = '') {
  const pts = ridgePoints(baseY, amp, rough, n);
  return path(`M0,${bottom} ${pts.map(([x, y]) => `L${f(x)},${f(y)}`).join(' ')} L${W},${bottom} Z`, fill, extra);
}
/** Smooth rolling hill using cubic curves. */
function hill(baseY, amp, fill, waves = 2, phase = 0, extra = '') {
  let d = `M0,${H} L0,${f(baseY)}`;
  const seg = W / (waves * 2);
  for (let i = 0; i < waves * 2; i++) {
    const x0 = i * seg;
    const up = (i + phase) % 2 === 0 ? -1 : 1;
    const a = amp * rnd(0.6, 1.1);
    d += ` C${f(x0 + seg * 0.35)},${f(baseY + up * a)} ${f(x0 + seg * 0.65)},${f(baseY + up * a)} ${f(x0 + seg)},${f(baseY)}`;
  }
  return path(d + ` L${W},${H} Z`, fill, extra);
}
function stars(n, yMax, color = '#fff8e1', rMax = 2.2) {
  let s = '';
  for (let i = 0; i < n; i++) s += circle(rnd(0, W), rnd(0, yMax), rnd(0.6, rMax), color, `opacity="${f(rnd(0.4, 1))}"`);
  return s;
}
function cloud(x, y, s, fill, op = 0.9) {
  let g = `<g opacity="${op}">`;
  const parts = rint(4, 6);
  for (let i = 0; i < parts; i++) g += ellipse(x + (i - parts / 2) * 34 * s, y + rnd(-10, 6) * s, rnd(40, 60) * s, rnd(22, 34) * s, fill);
  g += ellipse(x, y + 14 * s, parts * 30 * s, 18 * s, fill);
  return g + '</g>';
}
function pine(x, y, h, fill, trunk = '#3b2a22') {
  const w = h * 0.42;
  let g = rect(x - h * 0.04, y - h * 0.12, h * 0.08, h * 0.14, trunk);
  for (let i = 0; i < 3; i++) {
    const ty = y - h * 0.1 - i * h * 0.26;
    const tw = w * (1 - i * 0.24);
    g += poly([[x - tw / 2, ty], [x + tw / 2, ty], [x, ty - h * 0.42]], fill);
  }
  return g;
}
function roundTree(x, y, h, fill, shade, trunk = '#5a3d2b') {
  let g = rect(x - h * 0.05, y - h * 0.45, h * 0.1, h * 0.45, trunk);
  g += circle(x, y - h * 0.62, h * 0.33, fill);
  g += circle(x - h * 0.18, y - h * 0.5, h * 0.2, fill);
  g += circle(x + h * 0.2, y - h * 0.52, h * 0.22, fill);
  g += circle(x + h * 0.08, y - h * 0.72, h * 0.16, shade, 'opacity="0.55"');
  return g;
}
function flower(x, y, r, petals, petalFill, centerFill, rot = 0, petalLen = 1) {
  let g = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">`;
  for (let i = 0; i < petals; i++) {
    const a = (360 / petals) * i;
    g += `<ellipse cx="0" cy="${f(-r * 0.9 * petalLen)}" rx="${f(r * 0.42)}" ry="${f(r * 0.9 * petalLen)}" fill="${petalFill}" transform="rotate(${f(a)})"/>`;
  }
  g += circle(0, 0, r * 0.45, centerFill);
  return g + '</g>';
}
function stem(x0, y0, x1, y1, color, w = 5) {
  const cx = (x0 + x1) / 2 + rnd(-30, 30);
  return `<path d="M${f(x0)},${f(y0)} Q${f(cx)},${f((y0 + y1) / 2)} ${f(x1)},${f(y1)}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
}
function leaf(x, y, len, ang, fill) {
  return `<path d="M0,0 Q${f(len * 0.5)},${f(-len * 0.35)} ${f(len)},0 Q${f(len * 0.5)},${f(len * 0.35)} 0,0 Z" fill="${fill}" transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"/>`;
}
function waves(y0, y1, color, gap = 22, amp = 6, sw = 3, op = 0.5) {
  let g = '';
  for (let y = y0; y < y1; y += gap) {
    let d = `M${f(rnd(-40, 0))},${f(y)}`;
    const len = rnd(40, 70);
    for (let x = 0; x < W + 80; x += len) d += ` q${f(len / 4)},${f(-amp)} ${f(len / 2)},0 t${f(len / 2)},0`;
    g += `<path d="${d}" stroke="${color}" stroke-width="${sw}" fill="none" opacity="${op}" stroke-linecap="round"/>`;
  }
  return g;
}
function building(x, baseY, w, h, fill, win, roof = null, lit = 0.5) {
  let g = rect(x, baseY - h, w, h, fill);
  if (roof === 'gable') g += poly([[x - 6, baseY - h], [x + w + 6, baseY - h], [x + w / 2, baseY - h - w * 0.5]], '#8c4b3a');
  const cols = Math.max(1, Math.floor(w / 26));
  const rows = Math.max(1, Math.floor(h / 34));
  const cw = w / cols;
  const rh = h / rows;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows - (h > 80 ? 0 : 0); r++)
      if (R() < lit) g += rect(x + c * cw + cw * 0.28, baseY - h + r * rh + rh * 0.25, cw * 0.44, rh * 0.45, win);
  return g;
}
function grass(y0, y1, color, n = 140, hMax = 26, sw = 2.5) {
  let g = '';
  for (let i = 0; i < n; i++) {
    const x = rnd(0, W);
    const y = rnd(y0, y1);
    const h = rnd(8, hMax);
    g += `<path d="M${f(x)},${f(y)} q${f(rnd(-6, 6))},${f(-h / 2)} ${f(rnd(-8, 8))},${f(-h)}" stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round" opacity="${f(rnd(0.5, 1))}"/>`;
  }
  return g;
}
function speckle(n, x0, y0, x1, y1, colors, rMin = 2, rMax = 6, op = [0.6, 1]) {
  let g = '';
  for (let i = 0; i < n; i++) g += circle(rnd(x0, x1), rnd(y0, y1), rnd(rMin, rMax), pick(colors), `opacity="${f(rnd(op[0], op[1]))}"`);
  return g;
}
function sun(x, y, r, core, glow) {
  return circle(x, y, r * 2.2, glow, 'opacity="0.25"') + circle(x, y, r * 1.5, glow, 'opacity="0.35"') + circle(x, y, r, core);
}
function svg(id, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>${id}</title><defs>${defs}</defs>${body}</svg>`;
}

// ---------- scenes ----------
const scenes = [];
const scene = (slug, title, category, seed, fn) => scenes.push({ slug, title, category, seed, fn });

scene('moonlit-garden', 'Moonlit Garden', 'Nature', 101, () => {
  const d = linGrad('s', [[0, '#1d1640'], [0.55, '#3d2a6b'], [1, '#6b4a8c']]) + radGrad('m', [[0, '#fff6d6'], [1, '#fff6d6', 0]]);
  let b = rect(0, 0, W, H, 'url(#s)') + stars(120, 520) + circle(560, 220, 190, 'url(#m)') + circle(560, 220, 78, '#fff3cf') + circle(532, 200, 14, '#efe0b0') + circle(585, 245, 9, '#efe0b0');
  b += hill(640, 50, '#2b2150', 2) + hill(720, 40, '#221a40', 3, 1);
  for (let i = 0; i < 5; i++) b += roundTree(60 + i * 180 + rnd(-30, 30), 700 + rnd(-10, 20), rnd(160, 230), '#1a3b3a', '#2f6360', '#1b1330');
  b += rect(0, 800, W, 200, '#151030');
  for (let i = 0; i < 26; i++) {
    const x = rnd(20, 780), y = rnd(780, 990);
    b += stem(x, y + 30, x + rnd(-10, 10), y, '#2e5a4f', 4) + flower(x, y, rnd(10, 18), rint(5, 8), pick(['#f3c6e8', '#f7e3a1', '#c9b8ff', '#ffffff']), '#f7b54a', rnd(0, 60));
  }
  for (let i = 0; i < 30; i++) b += circle(rnd(0, W), rnd(560, 960), rnd(1.5, 3.5), '#fff3a0', `opacity="${f(rnd(0.5, 1))}"`);
  return svg('Moonlit Garden', d, b);
});

scene('fern-hollow', 'Fern Hollow', 'Nature', 102, () => {
  const d = linGrad('s', [[0, '#d9efd2'], [1, '#6fae7d']]);
  let b = rect(0, 0, W, H, 'url(#s)');
  for (let i = 0; i < 9; i++) b += rect(i * 95 + rnd(-10, 10), 0, rnd(26, 44), H, pick(['#6b5646', '#7d6552', '#5b4a3c']), `opacity="${f(rnd(0.35, 0.7))}"`);
  b += speckle(90, 0, 0, W, 450, ['#f4fbd0', '#e3f5b9'], 3, 9, [0.3, 0.7]);
  const fern = (x, y, len, ang, c) => {
    let g = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><path d="M0,0 Q${f(len * 0.1)},${f(-len * 0.5)} 0,${f(-len)}" stroke="${c}" stroke-width="4" fill="none"/>`;
    for (let t = 0.1; t < 0.95; t += 0.07) {
      const l = len * 0.32 * (1 - t);
      g += leaf(len * 0.05 * Math.sin(t * 3), -len * t, l, -150 + t * 30, c) + leaf(len * 0.05 * Math.sin(t * 3), -len * t, l, -30 - t * 30, c);
    }
    return g + '</g>';
  };
  const greens = ['#2f7a4a', '#3f8f55', '#256b43', '#4ea463', '#1f5c3a'];
  for (let i = 0; i < 26; i++) b += fern(rnd(-40, 840), rnd(620, 1060), rnd(260, 460), rnd(-45, 45), pick(greens));
  for (let i = 0; i < 14; i++) b += flower(rnd(40, 760), rnd(760, 980), rnd(7, 11), 5, '#fff7e8', '#f2b233', rnd(0, 70));
  b += ellipse(400, 1000, 500, 80, '#1c4a31', 'opacity="0.5"');
  return svg('Fern Hollow', d, b);
});

scene('koi-pond', 'Koi Pond', 'Nature', 103, () => {
  const d = radGrad('p', [[0, '#5fb6b3'], [1, '#1d5e6a']], 0.5, 0.45, 0.7);
  let b = rect(0, 0, W, H, 'url(#p)');
  for (let i = 0; i < 12; i++) b += circle(rnd(0, W), rnd(0, H), rnd(40, 120), 'none', `stroke="#bfe8e1" stroke-width="2" opacity="${f(rnd(0.2, 0.45))}"`);
  const koi = (x, y, s, ang, body, spot) => {
    let g = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)}) scale(${f(s)})">`;
    g += path('M-70,0 C-40,-30 30,-26 60,0 C30,26 -40,30 -70,0 Z', body);
    g += path('M-66,0 L-110,-26 L-98,0 L-110,26 Z', body, 'opacity="0.85"');
    g += ellipse(-10, -22, 16, 8, body, 'opacity="0.8"') + ellipse(-10, 22, 16, 8, body, 'opacity="0.8"');
    g += circle(8, -6, 12, spot) + circle(-24, 6, 10, spot) + circle(40, -4, 3, '#1b1b1b');
    return g + '</g>';
  };
  for (let i = 0; i < 9; i++) b += koi(rnd(80, 720), rnd(80, 920), rnd(0.8, 1.3), rnd(0, 360), pick(['#f47a3a', '#fff4ea', '#f2b53a', '#e85a4f']), pick(['#ffffff', '#e8412f', '#2d2a32']));
  const pad = (x, y, r, c) => path(`M${f(x)},${f(y)} L${f(x + r)},${f(y - r * 0.18)} A${f(r)},${f(r)} 0 1 1 ${f(x + r)},${f(y + r * 0.18)} Z`, c) + `<path d="M${f(x)},${f(y)} L${f(x - r * 0.7)},${f(y - r * 0.5)} M${f(x)},${f(y)} L${f(x - r * 0.6)},${f(y + r * 0.6)}" stroke="#2c6e3d" stroke-width="2" opacity="0.5"/>`;
  for (let i = 0; i < 11; i++) b += pad(rnd(0, W), rnd(0, H), rnd(40, 85), pick(['#4f9a4a', '#62ad55', '#3e8a44']));
  for (let i = 0; i < 4; i++) b += flower(rnd(80, 720), rnd(80, 920), rnd(18, 26), 8, '#f6c3d8', '#f8e27a', rnd(0, 40));
  return svg('Koi Pond', d, b);
});

scene('birch-grove', 'Birch Grove', 'Nature', 104, () => {
  const d = linGrad('s', [[0, '#fbe7c6'], [0.6, '#f4b98a'], [1, '#d9795a']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(560, 330, 80, '#fff1c9', '#ffd89a');
  b += hill(760, 40, '#c8683f', 2) + hill(820, 30, '#a9523a', 3, 1);
  const trunks = [];
  for (let i = 0; i < 11; i++) trunks.push([rnd(-20, 800), rnd(22, 46)]);
  trunks.sort((a, c) => a[1] - c[1]);
  for (const [x, w] of trunks) {
    b += rect(x, 0, w, H, '#f6f1e8');
    for (let y = 0; y < H; y += rnd(30, 70)) b += rect(x + rnd(0, w * 0.4), y, rnd(w * 0.3, w * 0.7), rnd(4, 10), '#2e2a2a', `rx="3" opacity="${f(rnd(0.6, 0.95))}"`);
    b += rect(x + w * 0.7, 0, w * 0.3, H, '#c9bfae', 'opacity="0.5"');
  }
  b += speckle(260, 0, 0, W, 520, ['#f2a23a', '#e8742e', '#f7c948', '#d95a2b'], 4, 11, [0.7, 1]);
  b += speckle(160, 0, 860, W, H, ['#f2a23a', '#e8742e', '#b8462b'], 4, 9);
  return svg('Birch Grove', d, b);
});

scene('alpine-dawn', 'Alpine Dawn', 'Landscapes', 201, () => {
  const d = linGrad('s', [[0, '#5a4f9e'], [0.45, '#e88f8a'], [0.75, '#ffd29a'], [1, '#fff0d2']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(250, 470, 60, '#fff4d8', '#ffcf87') + cloud(560, 180, 1, '#ffd9d2', 0.7) + cloud(200, 260, 0.8, '#ffe5d6', 0.6);
  b += ridge(420, 180, '#8a7bb8', 0.55, 7) + ridge(520, 140, '#6d5ea3', 0.55, 7);
  // snow caps
  const pts = ridgePoints(560, 150, 0.55, 7);
  b += path(`M0,${H} ${pts.map(([x, y]) => `L${f(x)},${f(y)}`).join(' ')} L${W},${H} Z`, '#4e4287');
  b += path(`M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' L')} ${pts.slice().reverse().map(([x, y]) => `L${f(x)},${f(y + 26 + Math.sin(x) * 10)}`).join(' ')} Z`, '#f7efff', 'opacity="0.85"');
  b += ridge(740, 60, '#2d5a4f', 0.5, 6);
  for (let i = 0; i < 34; i++) b += pine(rnd(0, W), rnd(780, 1000), rnd(80, 160), pick(['#1f4a40', '#245447', '#193d35']));
  return svg('Alpine Dawn', d, b);
});

scene('desert-mesa', 'Desert Mesa', 'Landscapes', 202, () => {
  const d = linGrad('s', [[0, '#2f6fa8'], [0.6, '#8cc7e0'], [1, '#f9dfb4']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(640, 160, 55, '#fffbe6', '#fff2b0');
  b += cloud(220, 180, 0.9, '#ffffff', 0.85) + cloud(480, 300, 0.6, '#ffffff', 0.7);
  const mesa = (x, w, top, c, c2) => path(`M${f(x)},${H} L${f(x + w * 0.1)},${f(top + 40)} L${f(x + w * 0.2)},${f(top)} L${f(x + w * 0.8)},${f(top)} L${f(x + w * 0.9)},${f(top + 40)} L${f(x + w)},${H} Z`, c) + rect(x + w * 0.2, top + 60, w * 0.6, 14, c2, 'opacity="0.5"') + rect(x + w * 0.15, top + 120, w * 0.7, 10, c2, 'opacity="0.4"');
  b += mesa(-60, 420, 430, '#d98b5f', '#b8603e') + mesa(380, 480, 380, '#c96f47', '#9e4a31') + mesa(160, 300, 520, '#e7a172', '#c0714a');
  b += hill(700, 30, '#e9b98a', 2) + hill(780, 25, '#dca274', 3, 1);
  const cactus = (x, y, h) => {
    let g = rect(x - 12, y - h, 24, h, '#3f7d4f', 'rx="12"');
    g += rect(x - 46, y - h * 0.6, 20, h * 0.3, '#3f7d4f', 'rx="10"') + rect(x - 46, y - h * 0.45, 40, 18, '#3f7d4f', 'rx="9"');
    g += rect(x + 26, y - h * 0.75, 20, h * 0.35, '#3f7d4f', 'rx="10"') + rect(x + 6, y - h * 0.5, 40, 18, '#3f7d4f', 'rx="9"');
    return g + rect(x - 3, y - h + 10, 4, h - 20, '#2e6040', 'opacity="0.5"');
  };
  for (let i = 0; i < 6; i++) b += cactus(rnd(60, 740), rnd(840, 980), rnd(110, 200));
  b += speckle(140, 0, 780, W, H, ['#c98b5c', '#f1c79b', '#b87a4c'], 2, 5);
  return svg('Desert Mesa', d, b);
});

scene('lavender-fields', 'Lavender Fields', 'Landscapes', 203, () => {
  const d = linGrad('s', [[0, '#9cc7ea'], [0.5, '#f5d2e2'], [1, '#fbe9c9']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(400, 330, 70, '#fff7e0', '#ffe2a8') + cloud(170, 150, 0.9, '#fff', 0.8) + cloud(620, 110, 1.1, '#fff', 0.8);
  b += hill(380, 40, '#9fb7cf', 2) + hill(420, 30, '#89a3c2', 3, 1);
  b += roundTree(640, 440, 110, '#557a4c', '#6e9a5e');
  b += building(120, 440, 70, 44, '#e9d9c2', '#b9764a', 'gable', 0.8);
  // rows converging
  for (let i = -8; i <= 8; i++) {
    const x2 = 400 + i * 130;
    b += poly([[400 + i * 10, 440], [400 + i * 10 + 6, 440], [x2 + 60, H], [x2 - 10, H]], i % 2 ? '#8b5fbf' : '#7a4fb0');
  }
  for (let i = 0; i < 520; i++) {
    const y = rnd(450, H);
    const x = rnd(0, W);
    b += ellipse(x, y, 2 + (y - 440) / 90, 5 + (y - 440) / 40, pick(['#b58be0', '#9b6fd3', '#c9a4ef', '#7d4fb9']), 'opacity="0.9"');
  }
  return svg('Lavender Fields', d, b);
});

scene('misty-fjord', 'Misty Fjord', 'Landscapes', 204, () => {
  const d = linGrad('s', [[0, '#cfe3ea'], [1, '#8fb4c2']]) + linGrad('w', [[0, '#6b97a8'], [1, '#2b5566']]);
  let b = rect(0, 0, W, H, 'url(#s)');
  b += ridge(330, 160, '#a7c3cd', 0.55, 7, 620) + ridge(380, 170, '#7fa3b1', 0.55, 7, 620) + ridge(460, 120, '#56808f', 0.5, 7, 620);
  b += rect(0, 600, W, 400, 'url(#w)');
  b += ridge(560, 90, '#3f6574', 0.5, 6, 620, 'opacity="0.35" transform="translate(0 1240) scale(1 -1)"');
  b += waves(620, 1000, '#d6eaf0', 26, 4, 2.5, 0.45);
  for (let i = 0; i < 5; i++) b += cloud(rnd(0, W), rnd(360, 560), rnd(1.2, 1.8), '#eef6f8', 0.5);
  const boat = (x, y, s) => `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})">${path('M-60,0 L60,0 L40,22 L-40,22 Z', '#b3413a')}${rect(-2, -90, 4, 90, '#3a2b25')}${poly([[2, -88], [2, -8], [52, -8]], '#f7f1e3')}${poly([[-2, -80], [-2, -10], [-40, -10]], '#f0d9a6')}</g>`;
  b += boat(300, 760, 1) + boat(590, 690, 0.55);
  for (let i = 0; i < 18; i++) b += ellipse(rnd(0, W), rnd(40, 300), rnd(2, 4), 1.5, '#384b55', 'opacity="0.7"');
  return svg('Misty Fjord', d, b);
});

scene('rolling-hills', 'Rolling Hills', 'Landscapes', 205, () => {
  const d = linGrad('s', [[0, '#7fc4f0'], [1, '#e5f6ff']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(660, 140, 50, '#fffbe0', '#fff1a8') + cloud(200, 160, 1, '#fff') + cloud(470, 250, 0.7, '#fff');
  const cols = ['#a6d46a', '#7fbf5a', '#c7de7a', '#5fa653', '#92c96a', '#4c9150'];
  for (let i = 0; i < 6; i++) {
    b += hill(360 + i * 110, 60 - i * 5, cols[i], 2, i % 2);
    b += `<g opacity="0.25">${waves(380 + i * 110, 430 + i * 110, '#2f6b3a', 14, 3, 2, 0.6)}</g>`;
  }
  for (let i = 0; i < 16; i++) b += roundTree(rnd(20, 780), rnd(460, 980), rnd(50, 110), pick(['#2f7a3f', '#3b8a47', '#276a37']), '#61b060');
  b += building(560, 520, 80, 50, '#f4e6cf', '#8a5a3c', 'gable', 0.7) + rect(620, 440, 20, 30, '#b84c3a');
  for (let i = 0; i < 9; i++) {
    const x = rnd(40, 760), y = rnd(700, 980);
    b += ellipse(x, y, 18, 11, '#ffffff') + circle(x + 16, y - 6, 8, '#2f2f2f') + rect(x - 12, y + 6, 4, 10, '#2f2f2f') + rect(x + 8, y + 6, 4, 10, '#2f2f2f');
  }
  return svg('Rolling Hills', d, b);
});

scene('harbor-lighthouse', 'Harbor Lighthouse', 'Architecture', 301, () => {
  const d = linGrad('s', [[0, '#f6b88c'], [0.5, '#f6d7a8'], [1, '#bfe0e6']]) + linGrad('w', [[0, '#3c86a0'], [1, '#1d4b66']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(200, 380, 60, '#fff3d6', '#ffcf8c') + cloud(600, 170, 1, '#fff2e2', 0.8);
  b += rect(0, 560, W, 440, 'url(#w)') + waves(575, 1000, '#bfe4ee', 24, 5, 3, 0.5);
  b += path('M380,560 C420,500 560,480 640,500 C720,520 800,540 800,560 Z', '#6d5a4b');
  b += path('M300,600 L800,560 L800,700 C700,690 520,680 300,600 Z', '#57473b');
  // lighthouse
  const lx = 600;
  for (let i = 0; i < 6; i++) b += poly([[lx - 44 + i * 4, 560 - i * 55], [lx + 44 - i * 4, 560 - i * 55], [lx + 40 - i * 4, 505 - i * 55], [lx - 40 + i * 4, 505 - i * 55]], i % 2 ? '#f5efe4' : '#d8433b');
  b += rect(lx - 30, 200, 60, 32, '#2e3a4a') + rect(lx - 22, 206, 44, 22, '#ffe79a') + poly([[lx - 36, 200], [lx + 36, 200], [lx, 162]], '#2e3a4a');
  b += poly([[lx, 216], [0, 110], [0, 330]], '#fff3b0', 'opacity="0.35"');
  b += building(380, 590, 70, 50, '#f2e3c9', '#e2a25a', 'gable', 0.8);
  for (let i = 0; i < 9; i++) {
    const x = rnd(40, 760), y = rnd(640, 950);
    b += `<path d="M${f(x)},${f(y)} q10,-8 20,0 q10,-8 20,0" stroke="#fdfdfd" stroke-width="3" fill="none"/>`;
  }
  b += `<g transform="translate(160 820)">${path('M-80,0 L80,0 L56,30 L-56,30 Z', '#f0c24a')}${rect(-3, -110, 6, 110, '#3a2b25')}${poly([[3, -106], [3, -6], [70, -6]], '#fff')}</g>`;
  return svg('Harbor Lighthouse', d, b);
});

scene('hillside-village', 'Hillside Village', 'Architecture', 302, () => {
  const d = linGrad('s', [[0, '#8fd0f2'], [1, '#f2f7ee']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(120, 120, 46, '#fffbe6', '#fff0a6') + cloud(520, 150, 1, '#fff');
  b += hill(420, 60, '#9ccb7a', 2) + hill(520, 40, '#7db866', 2, 1);
  const walls = ['#f6efe3', '#f3dcc0', '#fbe8d4', '#e8d8f0', '#fff4d6', '#d7ebf3'];
  const roofs = ['#d0583f', '#c4472f', '#e0763f', '#8e4b8f', '#3e6c9c'];
  for (let row = 0; row < 7; row++) {
    for (let i = 0; i < 6; i++) {
      const w = rnd(70, 120), h = rnd(60, 110);
      const x = i * 140 + rnd(-30, 20) + (row % 2) * 60 - 40;
      const y = 470 + row * 85;
      b += rect(x, y - h, w, h, pick(walls));
      b += poly([[x - 8, y - h], [x + w + 8, y - h], [x + w / 2, y - h - w * 0.45]], pick(roofs));
      b += rect(x + w * 0.2, y - h * 0.65, w * 0.2, h * 0.28, '#4f7fa8') + rect(x + w * 0.6, y - h * 0.65, w * 0.2, h * 0.28, '#4f7fa8');
      b += rect(x + w * 0.42, y - h * 0.3, w * 0.18, h * 0.3, '#7a4a33');
      if (R() < 0.4) b += circle(x + w * 0.8, y - h * 0.1, 10, pick(['#e0578a', '#f09b3a', '#b76ad6']));
    }
  }
  b += roundTree(740, 1000, 180, '#3e8a4a', '#6cb35e');
  return svg('Hillside Village', d, b);
});

scene('night-city', 'Night City', 'Architecture', 303, () => {
  const d = linGrad('s', [[0, '#120e2c'], [0.6, '#3b2466'], [1, '#c2567a']]) + linGrad('w', [[0, '#2b1f4a'], [1, '#0d0a1e']]);
  let b = rect(0, 0, W, H, 'url(#s)') + stars(90, 380) + circle(150, 150, 40, '#fbe9c3');
  let x = -20;
  while (x < W) {
    const w = rnd(50, 110);
    b += building(x, 700, w, rnd(180, 440), pick(['#241a44', '#2c2052', '#1d1638']), pick(['#ffd479', '#ffe9a8', '#ff9fb3']), null, 0.55);
    x += w + rnd(0, 8);
  }
  x = -30;
  while (x < W) {
    const w = rnd(60, 130);
    b += building(x, 720, w, rnd(100, 280), pick(['#1a1330', '#140f28']), pick(['#ffc85a', '#8fe0ff']), null, 0.45);
    x += w + rnd(4, 14);
  }
  b += rect(0, 720, W, 280, 'url(#w)');
  for (let i = 0; i < 70; i++) b += rect(rnd(0, W), rnd(730, 990), rnd(6, 30), 3, pick(['#ffd479', '#ff9fb3', '#8fe0ff']), `opacity="${f(rnd(0.3, 0.8))}"`);
  b += path('M0,760 C200,740 600,740 800,760', 'none', 'stroke="#f4a1c0" stroke-width="3" opacity="0.6"');
  for (let i = 0; i < 14; i++) b += circle(i * 60 + 20, 752, 4, '#ffe9a8');
  return svg('Night City', d, b);
});

scene('old-bridge', 'Old Stone Bridge', 'Architecture', 304, () => {
  const d = linGrad('s', [[0, '#b6d9e8'], [1, '#f3ead3']]) + linGrad('w', [[0, '#4f8f8c'], [1, '#2b5a5c']]);
  let b = rect(0, 0, W, H, 'url(#s)') + cloud(180, 130, 1, '#fff') + cloud(600, 200, 0.8, '#fff');
  b += hill(420, 40, '#8dbb7e', 2) + rect(0, 600, W, 400, 'url(#w)');
  for (let i = 0; i < 18; i++) b += roundTree(rnd(0, W), rnd(430, 560), rnd(80, 140), pick(['#3f7a47', '#4f8b52', '#2e6a3c']), '#79b36a');
  // bridge with arches
  b += rect(0, 470, W, 160, '#b9a58c');
  for (let r = 0; r < 6; r++) for (let c = 0; c < 22; c++) b += rect(c * 38 + (r % 2) * 19 - 19, 470 + r * 26, 36, 24, pick(['#c8b59b', '#a9947a', '#bba68a', '#d2c1a8']), 'rx="3"');
  for (let i = 0; i < 3; i++) {
    const cx = 140 + i * 260;
    b += path(`M${cx - 100},630 L${cx - 100},580 A100,90 0 0 1 ${cx + 100},580 L${cx + 100},630 Z`, '#2d4a47');
    b += path(`M${cx - 100},640 L${cx - 100},690 A100,90 0 0 0 ${cx + 100},690 L${cx + 100},640 Z`, '#1f3d3c', 'opacity="0.55"');
  }
  b += rect(0, 452, W, 20, '#8f7b63');
  for (let i = 0; i < 20; i++) b += rect(i * 42, 432, 10, 22, '#8f7b63');
  b += waves(660, 1000, '#cfeae3', 28, 4, 2.5, 0.45);
  for (let i = 0; i < 8; i++) b += ellipse(rnd(0, W), rnd(700, 980), 16, 7, '#ffffff', 'opacity="0.7"');
  return svg('Old Stone Bridge', d, b);
});

scene('windmill-meadow', 'Windmill Meadow', 'Architecture', 305, () => {
  const d = linGrad('s', [[0, '#6fb1e6'], [1, '#d7eefa']]);
  let b = rect(0, 0, W, H, 'url(#s)') + cloud(160, 170, 1.1, '#fff') + cloud(560, 110, 0.8, '#fff');
  b += hill(520, 30, '#9bcf6b', 2);
  const mill = (x, base, s) => {
    let g = `<g transform="translate(${f(x)} ${f(base)}) scale(${f(s)})">`;
    g += poly([[-50, 0], [50, 0], [30, -220], [-30, -220]], '#e9ddc9') + poly([[-40, -220], [40, -220], [0, -270]], '#6a3e2f');
    g += rect(-14, -50, 28, 50, '#6a3e2f') + circle(0, -150, 12, '#39414f');
    for (let k = 0; k < 4; k++) g += `<g transform="translate(0 -230) rotate(${k * 90 + 20})">${rect(-6, 0, 12, 170, '#5b4638')}${rect(6, 20, 34, 140, '#fff8ea', 'opacity="0.95"')}</g>`;
    return g + '</g>';
  };
  b += mill(250, 560, 1) + mill(620, 540, 0.6);
  const rows = ['#e7414d', '#f4c542', '#f07fa3', '#9a5bd1', '#f58b3d', '#ffffff'];
  for (let r = 0; r < 8; r++) {
    const y0 = 580 + r * 55;
    b += rect(0, y0, W, 50, '#5d9b4c');
    for (let i = 0; i < 80; i++) b += circle(rnd(0, W), y0 + rnd(4, 40), rnd(4, 7 + r), rows[r % rows.length], 'opacity="0.95"');
  }
  return svg('Windmill Meadow', d, b);
});

scene('sunflower-row', 'Sunflower Row', 'Flowers', 401, () => {
  const d = linGrad('s', [[0, '#4f9fd8'], [1, '#bfe6f5']]);
  let b = rect(0, 0, W, H, 'url(#s)') + cloud(620, 140, 1, '#fff') + cloud(180, 90, 0.7, '#fff');
  b += hill(620, 20, '#6e9d3a', 2);
  const sf = (x, y, r) => stem(x, H, x + rnd(-10, 10), y, '#4b7c2c', r * 0.18) + leaf(x, y + r * 3, r * 1.4, -20, '#5a8f34') + leaf(x, y + r * 4, r * 1.3, 200, '#5a8f34') + flower(x, y, r, 16, '#f7c327', '#6b3f1f', rnd(0, 30), 1.1) + speckle(Math.round(r / 2), x - r * 0.35, y - r * 0.35, x + r * 0.35, y + r * 0.35, ['#3d2412'], 1.5, 3);
  const items = [];
  for (let i = 0; i < 16; i++) items.push([rnd(20, 780), rnd(300, 900), 0]);
  items.sort((a, c) => a[1] - c[1]);
  for (const [x, y] of items) b += sf(x, y, 22 + (y - 300) / 12);
  return svg('Sunflower Row', d, b);
});

scene('tulip-parade', 'Tulip Parade', 'Flowers', 402, () => {
  const d = linGrad('s', [[0, '#fff1e4'], [1, '#ffd9c4']]);
  let b = rect(0, 0, W, H, 'url(#s)');
  const colors = ['#e8414f', '#f58b3d', '#f4c542', '#f07fa3', '#9a5bd1', '#ffffff', '#d63384'];
  for (let r = 0; r < 6; r++) {
    for (let i = 0; i < 8; i++) {
      const x = i * 105 + (r % 2) * 52 + rnd(-10, 10) - 10;
      const y = 150 + r * 160 + rnd(-15, 15);
      const c = pick(colors);
      b += stem(x, y + 150, x, y, '#3f8a45', 6) + leaf(x, y + 120, 60, -70, '#4f9a4e') + leaf(x, y + 130, 55, -110, '#3f8a45');
      b += path(`M${f(x - 30)},${f(y - 10)} Q${f(x - 32)},${f(y + 40)} ${f(x)},${f(y + 40)} Q${f(x + 32)},${f(y + 40)} ${f(x + 30)},${f(y - 10)} L${f(x + 16)},${f(y + 6)} L${f(x)},${f(y - 20)} L${f(x - 16)},${f(y + 6)} Z`, c);
      b += path(`M${f(x - 10)},${f(y + 2)} Q${f(x)},${f(y + 36)} ${f(x + 10)},${f(y + 2)}`, 'none', 'stroke="#000" stroke-opacity="0.12" stroke-width="3"');
    }
  }
  return svg('Tulip Parade', d, b);
});

scene('poppy-breeze', 'Poppy Breeze', 'Flowers', 403, () => {
  const d = linGrad('s', [[0, '#f9e7b4'], [0.5, '#f7d9a6'], [1, '#a9c97a']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(620, 180, 70, '#fff7e0', '#ffe0a0');
  b += hill(420, 30, '#b8d487', 2) + hill(500, 30, '#98bf6a', 3, 1);
  b += grass(480, 1000, '#6e9b45', 260, 40, 3);
  const poppy = (x, y, r) => {
    let g = stem(x, y + r * 6, x, y, '#5f8a3c', 3);
    for (let k = 0; k < 4; k++) g += `<ellipse cx="${f(x + Math.cos(k * 1.57 + 0.4) * r * 0.55)}" cy="${f(y + Math.sin(k * 1.57 + 0.4) * r * 0.55)}" rx="${f(r * 0.72)}" ry="${f(r * 0.62)}" fill="${pick(['#e63b2e', '#f04e37', '#d7301f'])}"/>`;
    return g + circle(x, y, r * 0.28, '#2a1b1b') + speckle(5, x - r * 0.3, y - r * 0.3, x + r * 0.3, y + r * 0.3, ['#3b2a2a'], 1, 2);
  };
  const items = [];
  for (let i = 0; i < 40; i++) items.push([rnd(0, W), rnd(460, 980)]);
  items.sort((a, c) => a[1] - c[1]);
  for (const [x, y] of items) b += poppy(x, y, 8 + (y - 440) / 18);
  for (let i = 0; i < 20; i++) b += flower(rnd(0, W), rnd(520, 990), rnd(6, 9), 6, '#ffffff', '#f2c230', rnd(0, 60));
  return svg('Poppy Breeze', d, b);
});

scene('wild-bouquet', 'Wild Bouquet', 'Flowers', 404, () => {
  const d = linGrad('s', [[0, '#3a2b5c'], [1, '#6a4a86']]);
  let b = rect(0, 0, W, H, 'url(#s)');
  for (let i = 0; i < 16; i++) b += rect(0, i * 64, W, 32, '#ffffff', 'opacity="0.03"');
  // vase
  b += path('M300,980 C250,860 270,760 330,720 L470,720 C530,760 550,860 500,980 Z', '#e3a857') + rect(300, 700, 200, 30, '#c98c3e', 'rx="10"');
  for (let i = 0; i < 6; i++) b += path(`M${280 + i * 45},760 C${280 + i * 45},840 ${300 + i * 40},920 ${300 + i * 40},980`, 'none', 'stroke="#b87a31" stroke-width="3" opacity="0.5"');
  const heads = [];
  for (let i = 0; i < 34; i++) {
    const a = rnd(-2.6, -0.5);
    const len = rnd(250, 560);
    heads.push([400 + Math.cos(a) * len, 720 + Math.sin(a) * len, rnd(20, 48)]);
  }
  for (const [x, y] of heads) b += stem(400 + rnd(-40, 40), 720, x, y, '#5b8f4e', 4) + leaf(x + rnd(-20, 20), y + rnd(40, 100), rnd(30, 60), rnd(0, 360), '#6aa35b');
  for (const [x, y, r] of heads) {
    const t = rint(0, 2);
    if (t === 0) b += flower(x, y, r, rint(5, 9), pick(['#f6a5c0', '#ffd166', '#ef476f', '#ffffff', '#c3a6ff']), pick(['#f79d1e', '#5a3a1a']), rnd(0, 60));
    else if (t === 1) for (let k = 0; k < 7; k++) b += circle(x + rnd(-r * 0.4, r * 0.4), y + k * r * 0.25 - r, r * 0.22, pick(['#8f6ad6', '#b28ff0', '#5e8be0']));
    else b += circle(x, y, r * 0.8, pick(['#ff8fab', '#fb6f92', '#ffb3c6'])) + circle(x, y, r * 0.5, '#ff5d8f', 'opacity="0.6"') + circle(x, y, r * 0.2, '#c9184a', 'opacity="0.5"');
  }
  return svg('Wild Bouquet', d, b);
});

scene('bauhaus-blocks', 'Bauhaus Blocks', 'Geometric', 501, () => {
  const pal = ['#2c2a4a', '#e2533d', '#f2b632', '#3a7ca5', '#f4ecdc', '#6c4c8c', '#e98a73'];
  let b = rect(0, 0, W, H, '#f4ecdc');
  const s = 100;
  for (let y = 0; y < H; y += s) {
    for (let x = 0; x < W; x += s) {
      const bg = pick(pal);
      let fg = pick(pal);
      while (fg === bg) fg = pick(pal);
      b += rect(x, y, s, s, bg);
      const t = rint(0, 5);
      if (t === 0) b += circle(x + s / 2, y + s / 2, s * 0.38, fg);
      else if (t === 1) b += path(`M${x},${y} A${s},${s} 0 0 1 ${x + s},${y + s} L${x},${y + s} Z`, fg);
      else if (t === 2) b += poly([[x, y + s], [x + s, y + s], [x + s / 2, y]], fg);
      else if (t === 3) b += rect(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.6, fg) + circle(x + s / 2, y + s / 2, s * 0.15, bg);
      else if (t === 4) b += path(`M${x},${y + s / 2} A${s / 2},${s / 2} 0 0 1 ${x + s},${y + s / 2} Z`, fg);
      else for (let k = 0; k < 4; k++) b += rect(x, y + k * 25 + 6, s, 12, fg);
    }
  }
  return svg('Bauhaus Blocks', '', b);
});

scene('mosaic-tiles', 'Mosaic Tiles', 'Geometric', 502, () => {
  const pal = ['#1f5f8b', '#3f9dd0', '#f2f5f7', '#e4b363', '#c0513a', '#2a3d57'];
  let b = rect(0, 0, W, H, '#e9e2d0');
  const s = 80;
  for (let y = 0; y < H; y += s) {
    for (let x = 0; x < W; x += s) {
      const cx = x + s / 2, cy = y + s / 2;
      const a = pick(pal), c = pick(pal);
      b += rect(x + 2, y + 2, s - 4, s - 4, a, 'rx="6"');
      const t = ((x / s) + (y / s)) % 3;
      if (t === 0) b += poly([[cx, y + 10], [x + s - 10, cy], [cx, y + s - 10], [x + 10, cy]], c) + circle(cx, cy, 8, a);
      else if (t === 1) for (let k = 0; k < 8; k++) b += `<ellipse cx="${cx}" cy="${cy - 18}" rx="7" ry="16" fill="${c}" transform="rotate(${k * 45} ${cx} ${cy})"/>`;
      else b += circle(cx, cy, 26, c) + circle(cx, cy, 14, a) + circle(cx, cy, 5, c);
    }
  }
  return svg('Mosaic Tiles', '', b);
});

scene('hexagon-hive', 'Honey Hexagons', 'Geometric', 503, () => {
  const pal = ['#f6c343', '#f2a900', '#ffd966', '#e89f1d', '#fbe29a', '#c97c10'];
  let b = rect(0, 0, W, H, '#3a2a1a');
  const r = 46;
  const hw = Math.sqrt(3) * r;
  for (let row = -1; row < H / (r * 1.5) + 1; row++) {
    for (let col = -1; col < W / hw + 1; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0);
      const cy = row * r * 1.5;
      const pts = [];
      for (let k = 0; k < 6; k++) pts.push([cx + (r - 3) * Math.cos(Math.PI / 6 + (k * Math.PI) / 3), cy + (r - 3) * Math.sin(Math.PI / 6 + (k * Math.PI) / 3)]);
      const c = R() < 0.12 ? '#6b4a2b' : pick(pal);
      b += poly(pts, c);
      if (R() < 0.45) b += circle(cx - 10, cy - 12, rnd(4, 9), '#fff6d0', 'opacity="0.55"');
    }
  }
  const bee = (x, y, a) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})">${ellipse(-8, -14, 14, 9, '#eaf6ff', 'opacity="0.85"')}${ellipse(8, -14, 14, 9, '#eaf6ff', 'opacity="0.85"')}${ellipse(0, 0, 22, 14, '#f7c325')}${rect(-8, -14, 6, 28, '#2a1f14')}${rect(6, -13, 6, 26, '#2a1f14')}${circle(22, 0, 8, '#2a1f14')}</g>`;
  for (let i = 0; i < 7; i++) b += bee(rnd(60, 740), rnd(60, 940), rnd(0, 360));
  return svg('Honey Hexagons', '', b);
});

scene('crystal-garden', 'Crystal Garden', 'Geometric', 504, () => {
  const d = linGrad('s', [[0, '#f7efff'], [0.6, '#e6f4f1'], [1, '#d7ecd9']]);
  let b = rect(0, 0, W, H, 'url(#s)');
  const pal = [['#7b5ea7', '#a88bd6', '#d8c8f5'], ['#2f8f9d', '#5fc0c8', '#bfeaea'], ['#d0587e', '#f08aa8', '#ffd0dd'], ['#e0a030', '#f5c95c', '#fff0c0'], ['#3f6fb5', '#6f9be0', '#cfe0ff']];
  const crystal = (x, y, h, w, ang, [c0, c1, c2]) => {
    let g = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})">`;
    g += poly([[-w, 0], [-w, -h * 0.7], [0, -h], [0, 0]], c0);
    g += poly([[0, 0], [0, -h], [w, -h * 0.7], [w, 0]], c1);
    g += poly([[-w * 0.4, -h * 0.55], [0, -h * 0.9], [w * 0.3, -h * 0.6], [0, -h * 0.35]], c2, 'opacity="0.7"');
    return g + '</g>';
  };
  const items = [];
  for (let i = 0; i < 44; i++) items.push([rnd(0, W), rnd(160, 1060)]);
  items.sort((a, c) => a[1] - c[1]);
  for (const [x, y] of items) {
    const s = 0.4 + (y / H) * 0.9;
    const p = pick(pal);
    b += crystal(x, y, rnd(90, 200) * s, rnd(14, 30) * s, rnd(-25, 25), p) + crystal(x + 20 * s, y, rnd(60, 130) * s, rnd(10, 22) * s, rnd(10, 40), p);
  }
  b += speckle(120, 0, 0, W, H, ['#ffffff', '#fff4c2'], 1.5, 4, [0.5, 1]);
  for (let i = 0; i < 16; i++) {
    const x = rnd(0, W), y = rnd(0, 700), s = rnd(6, 14);
    b += poly([[x, y - s], [x + s * 0.3, y - s * 0.3], [x + s, y], [x + s * 0.3, y + s * 0.3], [x, y + s], [x - s * 0.3, y + s * 0.3], [x - s, y], [x - s * 0.3, y - s * 0.3]], '#ffffff', 'opacity="0.85"');
  }
  return svg('Crystal Garden', d, b);
});

scene('ocean-waves', 'Ocean Swirl', 'Abstract', 601, () => {
  const d = linGrad('s', [[0, '#fdf1dc'], [1, '#f6d8b4']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(620, 170, 70, '#f26b4a', '#f7a072');
  const blues = ['#0b3c5d', '#1d6a96', '#2f8fbf', '#5fb3d9', '#9ad0ea', '#e8f5fa'];
  for (let layer = 0; layer < 9; layer++) {
    const y = 330 + layer * 80;
    let d2 = `M0,${H} L0,${y}`;
    for (let x = 0; x <= W; x += 100) d2 += ` Q${x + 50},${f(y - rnd(30, 80))} ${x + 100},${y}`;
    b += path(d2 + ` L${W},${H} Z`, blues[layer % blues.length]);
    for (let x = 0; x < W; x += 100) b += `<path d="M${x + 60},${y - 30} q18,-26 36,-6 q-12,6 -8,18" stroke="#ffffff" stroke-width="4" fill="none" opacity="0.8" stroke-linecap="round"/>`;
  }
  for (let i = 0; i < 6; i++) b += `<path d="M${f(rnd(0, 700))},${f(rnd(60, 300))} q14,-12 28,0 q14,-12 28,0" stroke="#3a2b2b" stroke-width="3" fill="none"/>`;
  return svg('Ocean Swirl', d, b);
});

scene('paper-circles', 'Paper Circles', 'Abstract', 602, () => {
  let b = rect(0, 0, W, H, '#f3ede3');
  const pal = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#b56576', '#6d597a'];
  for (let i = 0; i < 26; i++) {
    const x = rnd(-60, 860), y = rnd(-60, 1060), r = rnd(50, 170);
    b += circle(x + 8, y + 10, r, '#000', 'opacity="0.12"') + circle(x, y, r, pick(pal));
    for (let k = 1; k < 4; k++) b += circle(x, y, r * (1 - k * 0.22), 'none', `stroke="#fff" stroke-opacity="0.35" stroke-width="3"`);
  }
  return svg('Paper Circles', '', b);
});

scene('ribbon-dance', 'Ribbon Dance', 'Abstract', 603, () => {
  let b = rect(0, 0, W, H, '#fbf4ea');
  const pal = ['#5b2a86', '#9a4dc9', '#e45a84', '#f59e5b', '#f7c948', '#3fb5a8', '#2b4c8c'];
  for (let i = 0; i < 16; i++) {
    const y = rnd(-100, 1100), a = rnd(80, 220), w = rnd(30, 70);
    let d = `M-50,${f(y)}`;
    for (let x = -50; x < W + 100; x += 200) d += ` C${x + 70},${f(y - a)} ${x + 130},${f(y + a)} ${x + 200},${f(y)}`;
    b += `<path d="${d}" stroke="${pick(pal)}" stroke-width="${f(w)}" fill="none" stroke-linecap="round" opacity="0.92"/>`;
    b += `<path d="${d}" stroke="#ffffff" stroke-width="${f(w * 0.12)}" fill="none" opacity="0.45" transform="translate(0 ${f(-w * 0.25)})"/>`;
  }
  b += speckle(80, 0, 0, W, H, ['#ffffff', '#f7c948'], 2, 5, [0.5, 0.9]);
  return svg('Ribbon Dance', '', b);
});

scene('lantern-evening', 'Lantern Evening', 'Peaceful', 701, () => {
  const d = linGrad('s', [[0, '#1f2350'], [0.6, '#5a3b78'], [1, '#e2867a']]) + radGrad('g', [[0, '#ffd27a'], [1, '#ffd27a', 0]]);
  let b = rect(0, 0, W, H, 'url(#s)') + stars(70, 400);
  b += ridge(640, 70, '#2a2446', 0.5, 6) + rect(0, 760, W, 240, '#1a1631');
  b += waves(780, 1000, '#ffcf8a', 30, 4, 2, 0.25);
  const lantern = (x, y, s) => circle(x, y, 60 * s, 'url(#g)') + `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})">${path('M-18,-26 L18,-26 L24,20 L-24,20 Z', '#f7a24a')}${rect(-20, -30, 40, 6, '#8c3b2c')}${rect(-22, 20, 44, 6, '#8c3b2c')}${ellipse(0, 0, 10, 16, '#fff0c2', 'opacity="0.8"')}</g>`;
  for (let i = 0; i < 26; i++) b += lantern(rnd(20, 780), rnd(60, 740), rnd(0.4, 1.3));
  const r = (x) => lantern(x, 900 + rnd(-10, 10), 0.8);
  for (let i = 0; i < 4; i++) b += r(rnd(80, 720));
  return svg('Lantern Evening', d, b);
});

scene('balloon-sky', 'Balloon Morning', 'Peaceful', 702, () => {
  const d = linGrad('s', [[0, '#8ecae6'], [0.7, '#fde2c4'], [1, '#fbc4a6']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(400, 780, 90, '#fff4d6', '#ffd49a');
  for (let i = 0; i < 6; i++) b += cloud(rnd(0, W), rnd(100, 700), rnd(0.6, 1.2), '#ffffff', 0.75);
  b += ridge(820, 50, '#a3b18a', 0.5, 6) + ridge(880, 40, '#588157', 0.5, 6);
  const balloon = (x, y, s, c1, c2) => {
    let g = `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})">`;
    g += path('M0,-80 C60,-80 70,-10 30,40 L-30,40 C-70,-10 -60,-80 0,-80 Z', c1);
    g += path('M0,-80 C22,-80 26,-10 12,40 L-12,40 C-26,-10 -22,-80 0,-80 Z', c2);
    g += `<path d="M-28,40 L-12,70 M28,40 L12,70" stroke="#5a4636" stroke-width="2"/>` + rect(-14, 70, 28, 22, '#8a5a3c', 'rx="4"');
    return g + '</g>';
  };
  const pals = [['#e63946', '#f1faee'], ['#f4a261', '#264653'], ['#2a9d8f', '#e9c46a'], ['#9b5de5', '#fee440'], ['#ef476f', '#ffd166'], ['#118ab2', '#ffffff']];
  for (let i = 0; i < 11; i++) {
    const [c1, c2] = pick(pals);
    b += balloon(rnd(60, 740), rnd(120, 760), rnd(0.5, 1.5), c1, c2);
  }
  return svg('Balloon Morning', d, b);
});

scene('starry-campsite', 'Starry Campsite', 'Peaceful', 703, () => {
  const d = linGrad('s', [[0, '#0b1026'], [0.7, '#1f3160'], [1, '#2d4d7a']]) + radGrad('fire', [[0, '#ffb347'], [1, '#ffb347', 0]]);
  let b = rect(0, 0, W, H, 'url(#s)') + stars(260, 640, '#fdf7e3', 2.6);
  b += `<path d="M0,420 C200,300 500,240 800,120" stroke="#c9d6ff" stroke-width="80" opacity="0.08" fill="none"/>`;
  b += ridge(600, 80, '#1b2a4a', 0.5, 6);
  for (let i = 0; i < 26; i++) b += pine(rnd(0, W), rnd(640, 760), rnd(90, 200), pick(['#0f1d2e', '#132538']));
  b += rect(0, 760, W, 240, '#16233a');
  b += poly([[180, 900], [360, 900], [270, 740]], '#e07a3f') + poly([[270, 740], [270, 900], [300, 900]], '#b25a2c') + poly([[250, 900], [290, 900], [270, 830]], '#3a1d10');
  b += circle(520, 900, 140, 'url(#fire)') + poly([[490, 910], [550, 910], [520, 830]], '#ffb347') + poly([[505, 910], [535, 910], [520, 860]], '#fff1a6');
  b += rect(470, 905, 100, 12, '#5a3a24', 'rx="5" transform="rotate(12 520 911)"') + rect(470, 905, 100, 12, '#6b4a2b', 'rx="5" transform="rotate(-12 520 911)"');
  b += speckle(24, 440, 700, 600, 860, ['#ffcf6b'], 1.5, 3);
  return svg('Starry Campsite', d, b);
});

scene('autumn-path', 'Autumn Path', 'Seasonal', 801, () => {
  const d = linGrad('s', [[0, '#f9d8a8'], [1, '#f6b27a']]);
  let b = rect(0, 0, W, H, 'url(#s)');
  b += path('M340,420 C360,600 200,800 120,1000 L680,1000 C560,820 440,620 460,420 Z', '#c89b6d');
  b += path('M380,420 C400,600 330,800 320,1000 L480,1000 C470,820 440,620 420,420 Z', '#d9b184', 'opacity="0.6"');
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 7; i++) {
      const x = side ? rnd(520, 820) : rnd(-20, 280);
      const y = 460 + i * 80;
      b += rect(x - 10, y - 380, 20, 380, '#5a3d2b');
      b += circle(x, y - 380, rnd(80, 130), pick(['#d9481f', '#e8742e', '#f2a23a', '#b8341b', '#f7c948']));
    }
  }
  b += speckle(420, 0, 0, W, 700, ['#d9481f', '#e8742e', '#f2a23a', '#f7c948', '#b8341b'], 5, 14, [0.75, 1]);
  b += speckle(260, 0, 700, W, H, ['#d9481f', '#e8742e', '#f2a23a', '#a0522d'], 4, 10);
  return svg('Autumn Path', d, b);
});

scene('winter-cabin', 'Winter Cabin', 'Seasonal', 802, () => {
  const d = linGrad('s', [[0, '#5a6fa8'], [0.6, '#a9b8e0'], [1, '#e7ecf8']]);
  let b = rect(0, 0, W, H, 'url(#s)') + circle(640, 150, 46, '#fdf6e3', 'opacity="0.9"');
  b += ridge(460, 90, '#c7d2ee', 0.55, 6) + hill(620, 40, '#eef2fb', 2) + rect(0, 700, W, 300, '#f5f7fc');
  for (let i = 0; i < 20; i++) b += pine(rnd(0, W), rnd(620, 760), rnd(100, 200), pick(['#2f5d62', '#1f4a50', '#3b6e6e']));
  // cabin
  b += rect(260, 660, 280, 170, '#8a4f36') + poly([[240, 670], [560, 670], [400, 540]], '#f6f8ff') + poly([[252, 672], [548, 672], [400, 556]], '#5b3325');
  for (let k = 0; k < 6; k++) b += rect(260, 670 + k * 28, 280, 3, '#6d3b28');
  b += rect(300, 710, 60, 50, '#ffd77a') + rect(440, 710, 60, 50, '#ffd77a') + rect(380, 740, 44, 90, '#4a2a1d');
  b += rect(470, 560, 34, 80, '#6d5a52') + cloud(510, 520, 0.5, '#e9edf5', 0.7);
  b += ellipse(400, 830, 190, 20, '#ffffff');
  for (let i = 0; i < 140; i++) b += circle(rnd(0, W), rnd(0, H), rnd(1.5, 4.5), '#ffffff', `opacity="${f(rnd(0.5, 1))}"`);
  return svg('Winter Cabin', d, b);
});

scene('cherry-spring', 'Cherry Blossom Spring', 'Seasonal', 803, () => {
  const d = linGrad('s', [[0, '#cfe8ff'], [1, '#fff3f7']]);
  let b = rect(0, 0, W, H, 'url(#s)') + hill(760, 40, '#b7dca0', 2) + rect(0, 820, W, 180, '#9fd08a');
  const branch = (x0, y0, x1, y1, w) => `<path d="M${f(x0)},${f(y0)} Q${f((x0 + x1) / 2 + rnd(-60, 60))},${f((y0 + y1) / 2 + rnd(-60, 60))} ${f(x1)},${f(y1)}" stroke="#4a2f2a" stroke-width="${f(w)}" fill="none" stroke-linecap="round"/>`;
  b += branch(420, 1000, 380, 560, 46);
  const tips = [];
  for (let i = 0; i < 12; i++) {
    const tx = rnd(-40, 840), ty = rnd(60, 500);
    b += branch(390, rnd(560, 700), tx, ty, rnd(8, 22));
    tips.push([tx, ty]);
  }
  for (const [tx, ty] of tips) for (let k = 0; k < 16; k++) b += flower(tx + rnd(-90, 90), ty + rnd(-70, 90), rnd(9, 16), 5, pick(['#ffc2d6', '#ffb0c9', '#ffd6e5', '#ff9ebb']), '#e05785', rnd(0, 72));
  b += speckle(100, 0, 0, W, H, ['#ffc2d6', '#ffd6e5'], 3, 6, [0.6, 0.95]);
  return svg('Cherry Blossom Spring', d, b);
});

scene('summer-shore', 'Summer Shore', 'Seasonal', 804, () => {
  const d = linGrad('s', [[0, '#41b6e6'], [1, '#bde9f7']]) + linGrad('w', [[0, '#1ca3c4'], [1, '#63d1d6']]);
  let b = rect(0, 0, W, H, 'url(#s)') + sun(150, 140, 55, '#fffbe0', '#fff2a8') + cloud(560, 160, 1, '#fff');
  b += rect(0, 420, W, 260, 'url(#w)') + waves(440, 680, '#ffffff', 30, 5, 3, 0.5);
  b += path('M0,640 C200,610 500,700 800,630 L800,1000 L0,1000 Z', '#f6dca6') + path('M0,640 C200,610 500,700 800,630', 'none', 'stroke="#ffffff" stroke-width="10" opacity="0.8"');
  const umbrella = (x, y, c1, c2) => {
    let g = rect(x - 3, y - 150, 6, 170, '#6b4a2b');
    for (let k = 0; k < 6; k++) g += path(`M${x},${y - 170} L${f(x - 110 + k * 36.6)},${y - 120} L${f(x - 110 + (k + 1) * 36.6)},${y - 120} Z`, k % 2 ? c1 : c2);
    return g;
  };
  b += umbrella(260, 860, '#e63946', '#ffffff') + umbrella(600, 790, '#f4a261', '#2a9d8f');
  b += rect(180, 860, 150, 60, '#3a86ff', 'rx="8"') + rect(180, 860, 150, 14, '#ffbe0b', 'rx="6"');
  b += circle(470, 900, 30, '#ffbe0b') + path('M440,900 A30,30 0 0 1 500,900 Z', '#fb5607');
  for (let i = 0; i < 10; i++) {
    const x = rnd(40, 760), y = rnd(700, 980);
    b += `<path d="M${f(x)},${f(y)} l8,-14 l8,14 l-8,-4 Z" fill="${pick(['#ff8fa3', '#ffd6a5', '#caffbf'])}"/>`;
  }
  b += speckle(120, 0, 660, W, H, ['#e7c07e', '#fbe7c0'], 1.5, 3.5);
  return svg('Summer Shore', d, b);
});

// ---------- write ----------
const manifest = [];
for (const s of scenes) {
  R = mulberry32(s.seed);
  const out = s.fn();
  writeFileSync(join(OUT, `${s.slug}.svg`), out);
  manifest.push({ slug: s.slug, title: s.title, category: s.category, bytes: Buffer.byteLength(out) });
}
console.log(`Generated ${manifest.length} artworks`);
for (const m of manifest) console.log(`  ${m.slug.padEnd(20)} ${(m.bytes / 1024).toFixed(1)} KiB  ${m.category}`);
