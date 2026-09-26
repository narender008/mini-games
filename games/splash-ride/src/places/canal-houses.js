// Canal Town's houses: rows of tall, narrow town houses along every quay,
// each one different. Three neighbourhoods set the mix: Nyhavn-style
// painted houses with tiled roofs and dormers round the harbour, brick and
// plaster Amsterdam gables (stepped, bell and spout gables, cornices) along
// the wide outer canal, and brightly painted Burano-style houses with
// shutters on the inner canals. Windows sit in real recesses with sills,
// surrounds and flower boxes; doors have steps; alleys open between some
// houses with a house behind to close the view.
import { rng, clamp } from '../config.js';
import { T, F, col, WHITE } from './canal-kit.js';
import { quayLines, streetWidth } from './canal-quays.js';
import { allWaterD, nearBridge, CZ } from './canal-layout.js';

const PAINT = {
  nyhavn: ['#e3a94a', '#c65a3e', '#e2854c', '#557ea8', '#efd27e', '#d99a92', '#94bba9', '#efe3cb', '#b9483c', '#7fa9cc', '#d8b86a', '#e6c29a'],
  burano: ['#d65e6e', '#4a93c9', '#ecc050', '#86b878', '#e79258', '#9f82c4', '#5cb0a8', '#eeaab2', '#f0dfb8', '#d8744a'],
  gracht: ['#efe9dc', '#e9dfc8', '#d9d4cb', '#cbc6bd', '#e7d6b0', '#dfe3e0'],
};
const BRICK = [WHITE, col('#efe4dc'), col('#d9ccc4'), col('#c4b8b0'), col('#a89c96')];
const TRIM = [col('#f4f2ec'), col('#efe7d4'), col('#e8e5de')];
const DOORS = ['#2e4a3a', '#2c4a70', '#8a2a24', '#262626', '#2a6a6a', '#b88a3a', '#5a2a3a', '#3a5a2a'];
const BOXES = ['#2f4a34', '#efece4', '#7a3a26', '#34485a', '#5a3a26'];
const SHUTTERS = ['#2f5a3a', '#2f4a6a', '#f0ece2', '#6a2a24', '#3a6a5a'];
const ROOFS = [WHITE, WHITE, col('#d8b8a8'), col('#b09a90'), col('#7a7470'), col('#8a9098')];

const pick = (r, list) => list[Math.floor(r() * list.length)];

// local -> world helpers for the cards (the geometry builder does the rest)
const wp = (g, x, y, z) => [g.ox + x * g.rx - z * g.rz, g.oy + y, g.oz + x * g.rz + z * g.rx];
const wd = (g, x, y, z) => [x * g.rx - z * g.rz, y, x * g.rz + z * g.rx];

function region(p) {
  if (p.z > CZ - 8) return 'nyhavn';
  return Math.hypot(p.x, p.z - CZ) > 195 ? 'gracht' : 'burano';
}

// ------------------------------------------------------------ one house

// Build a house in the builder's current frame: its facade runs from x = 0
// to x = w in the plane z = 0 (the street side is +z), the ground at y = 0.
export function house(g, d, cards, w, D, o) {
  const r = o.r;
  const H0 = o.ground;
  const Hf = o.floorH;
  const nF = o.floors;
  const Hw = H0 + nF * Hf;
  const wallT = o.brick ? T.BRICK : T.PLASTER;
  const wallC = o.wallC;
  const trimC = o.trimC;
  const style = o.style;

  // ---- the top of the facade (gable outline from (w, Hw) round to (0, Hw))
  let top = [[w, Hw], [0, Hw]];
  let G = 0;
  if (style === 'step') {
    G = clamp(w * 0.95, 3.5, 6.5);
    const nS = w > 6 ? 4 : 3;
    const tw = Math.max(1.3, w * 0.28);
    const d = (w - tw) / 2 / nS;
    const h = G / (nS + 1);
    const right = [[w, Hw]];
    for (let k = 0; k < nS; k++) {
      right.push([w - k * d, Hw + (k + 1) * h], [w - (k + 1) * d, Hw + (k + 1) * h]);
    }
    right.push([w - nS * d, Hw + G]);
    const left = right.map(([x, y]) => [w - x, y]).reverse();
    top = [...right, ...left];
  } else if (style === 'bell' || style === 'spout') {
    G = clamp(w * 0.9, 3.4, 6);
    const nw = style === 'bell' ? w * 0.42 : w * 0.22;
    const right = [[w, Hw], [w, Hw + (style === 'bell' ? 0.5 : 0.05)]];
    const n = style === 'bell' ? 8 : 1;
    const y0 = right[1][1];
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const e = style === 'bell' ? t * t * (3 - 2 * t) : t;
      right.push([w - (w / 2 - nw / 2) * e, y0 + (Hw + G - y0) * t]);
    }
    const arc = [];
    if (style === 'bell') {
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        arc.push([w / 2 + nw / 2 - nw * t, Hw + G + Math.sin(t * Math.PI) * 0.55]);
      }
    }
    const left = right.map(([x, y]) => [w - x, y]).reverse();
    top = [...right, ...arc, ...left];
  }

  // ---- openings
  const nb = clamp(Math.round(w / 1.85), 2, 5);
  const bw = w / nb;
  const ww = Math.min(1.2, bw * 0.56);
  const holes = [];
  const opens = [];
  const winT = o.winT;
  for (let f = 1; f <= nF; f++) {
    const base = H0 + (f - 1) * Hf;
    const wh = f === nF ? 1.5 : 1.8;
    const sill = base + (f === nF ? 0.95 : 0.8);
    for (let b = 0; b < nb; b++) {
      const cx = bw * (b + 0.5);
      opens.push({ x0: cx - ww / 2, x1: cx + ww / 2, y0: sill, y1: sill + wh, tile: winT, rec: 0.2, sill: true, box: f <= 2 && r() < o.boxes, shutter: o.shutters, surround: o.surround });
    }
  }
  // the ground floor: a door, and windows or a shop window
  const di = o.doorAt === 'none' ? -1 : o.doorAt === 'right' ? nb - 1 : o.doorAt === 'mid' ? Math.floor(nb / 2) : 0;
  for (let b = 0; b < nb; b++) {
    const cx = bw * (b + 0.5);
    if (b === di) {
      const dw = Math.min(1.2, bw * 0.62);
      opens.push({ x0: cx - dw / 2, x1: cx + dw / 2, y0: 0.18, y1: 2.95, tile: o.doorT, rec: 0.28, door: true, surround: o.surround });
    } else if (o.shop) {
      const sw = bw * 0.78;
      opens.push({ x0: cx - sw / 2, x1: cx + sw / 2, y0: 0.45, y1: H0 - 0.55, tile: T.WIN_SHOP, rec: 0.16, shop: true });
    } else {
      opens.push({ x0: cx - ww / 2, x1: cx + ww / 2, y0: 0.95, y1: 2.95, tile: winT, rec: 0.2, sill: true, surround: o.surround });
    }
  }
  // a loft window in a tall gable
  if (G > 3.2) opens.push({ x0: w / 2 - 0.42, x1: w / 2 + 0.42, y0: Hw + 0.55, y1: Hw + 1.75, tile: T.WIN_B, rec: 0.16, sill: true });
  for (const q of opens) holes.push([[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]]);

  // ---- the facade wall with its holes
  const outline = [[0, -0.3], [w, -0.3], ...top];
  g.poly(outline, holes, 0, wallT, wallC);

  const frameC = o.frameC;
  for (const q of opens) {
    const { x0, x1, y0, y1, rec } = q;
    const rc = o.brick ? wallC : wallC;
    g.quad([x0, y0, 0], [x0, y0, -rec], [x0, y1, -rec], [x0, y1, 0], wallT, rc);
    g.quad([x1, y0, -rec], [x1, y0, 0], [x1, y1, 0], [x1, y1, -rec], wallT, rc);
    g.quad([x0, y1, -rec], [x1, y1, -rec], [x1, y1, 0], [x0, y1, 0], wallT, rc.map((v) => v * 0.8));
    if (y0 < 4) g.quad([x0, y0, 0], [x1, y0, 0], [x1, y0, -rec], [x0, y0, -rec], wallT, rc);
    g.panel(x0, x1, y0, y1, -rec, q.tile, q.door ? o.doorC : q.shop ? o.shopC : frameC);
    if (q.door) {
      // a stone step
      d.box(x0 - 0.15, x1 + 0.15, -0.3, 0.18, -rec, 0.35, T.SAND, col('#cfc9bd'), 'kb');
    }
    if (q.sill) d.box(x0 - 0.08, x1 + 0.08, y0 - 0.1, y0 + 0.005, -0.02, 0.13, T.SAND, trimC, 'k');
    if (q.surround) {
      const s = 0.15;
      d.box(x0 - s, x0, q.sill ? y0 : 0, y1, 0, 0.05, T.PLAIN, trimC, 'kbtr');
      d.box(x1, x1 + s, q.sill ? y0 : 0, y1, 0, 0.05, T.PLAIN, trimC, 'kbtl');
      d.box(x0 - s - 0.04, x1 + s + 0.04, y1, y1 + 0.2, 0, 0.08, T.PLAIN, trimC, 'k');
    }
    if (q.shutter && !q.door && !q.shop) {
      const sw = (x1 - x0) / 2;
      d.box(x0 - sw - 0.06, x0 - 0.06, y0 + 0.02, y1 - 0.02, 0.03, 0.07, T.PLANK, o.shutterC, 'k');
      d.box(x1 + 0.06, x1 + sw + 0.06, y0 + 0.02, y1 - 0.02, 0.03, 0.07, T.PLANK, o.shutterC, 'k');
    }
    if (q.box) flowerBox(d, cards, x0, x1, y0, r, o);
  }

  // ---- bands, cornice, plinth
  d.box(-0.01, w + 0.01, -0.3, 0.4, 0, 0.04, T.STONE, col('#b8b2a8'), 'kb');
  if (!o.brick && o.bands) {
    for (let f = 1; f <= nF; f++) {
      const y = H0 + (f - 1) * Hf - 0.05;
      d.box(-0.01, w + 0.01, y, y + 0.16, 0, 0.06, T.PLAIN, trimC, 'k');
    }
  }
  if (style === 'eave' || style === 'flat' || style === 'cornice') {
    const ch = style === 'cornice' ? 0.55 : 0.35;
    g.box(-0.02, w + 0.02, Hw - 0.12, Hw + ch * 0.4, 0, 0.12, T.PLAIN, trimC, 'k');
    g.box(-0.04, w + 0.04, Hw + ch * 0.4, Hw + ch, 0, 0.32, T.PLAIN, trimC, 'k');
    if (style === 'cornice') {
      // a raised middle with a little pediment
      const pw = Math.min(w * 0.5, 2.6);
      g.poly([[w / 2 - pw / 2, Hw + ch], [w / 2 + pw / 2, Hw + ch], [w / 2, Hw + ch + 0.9]], [], 0.1, wallT, wallC);
      g.quad([w / 2 + pw / 2 + 0.1, Hw + ch, 0.14], [w / 2, Hw + ch + 1.0, 0.14], [w / 2, Hw + ch + 1.0, -0.2], [w / 2 + pw / 2 + 0.1, Hw + ch, -0.2], T.PLAIN, trimC);
      g.quad([w / 2, Hw + ch + 1.0, 0.14], [w / 2 - pw / 2 - 0.1, Hw + ch, 0.14], [w / 2 - pw / 2 - 0.1, Hw + ch, -0.2], [w / 2, Hw + ch + 1.0, -0.2], T.PLAIN, trimC);
    }
  } else {
    gableTrim(g, top, trimC, style);
    // the hoist beam at the top of the gable
    const ty = Hw + G - (style === 'bell' ? 0.3 : 0.6);
    d.box(w / 2 - 0.09, w / 2 + 0.09, ty - 0.18, ty, 0, 0.9, T.PLANK, col('#4a3a2c'), 'k');
  }

  // ---- side and back walls (with a few windows, seen over lower neighbours)
  const sideTop = Hw;
  g.quad([0, -0.3, -D], [0, -0.3, 0], [0, sideTop, 0], [0, sideTop, -D], wallT, wallC.map((v) => v * 0.92));
  g.quad([w, -0.3, 0], [w, -0.3, -D], [w, sideTop, -D], [w, sideTop, 0], wallT, wallC.map((v) => v * 0.92));
  for (let f = 1; f <= nF; f++) {
    const y0 = H0 + (f - 1) * Hf + 0.9;
    const y1 = y0 + 1.5;
    for (const zc of [-D * 0.3, -D * 0.72]) {
      g.quad([-0.01, y0, zc - 0.5], [-0.01, y0, zc + 0.5], [-0.01, y1, zc + 0.5], [-0.01, y1, zc - 0.5], winT, frameC, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      g.quad([w + 0.01, y0, zc + 0.5], [w + 0.01, y0, zc - 0.5], [w + 0.01, y1, zc - 0.5], [w + 0.01, y1, zc + 0.5], winT, frameC, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }
  g.quad([w, -0.3, -D], [0, -0.3, -D], [0, sideTop, -D], [w, sideTop, -D], wallT, wallC.map((v) => v * 0.85));

  // ---- roof
  const roofC = o.roofC;
  if (style === 'eave' || style === 'flat') {
    const pitch = style === 'eave' ? 0.72 : 0.3;
    const Hr = Hw + (D / 2) * Math.tan(pitch);
    const y0 = Hw + (style === 'flat' ? 0.3 : 0.05);
    const zf = style === 'flat' ? -0.25 : 0.32;
    g.quad([-0.02, y0, zf], [w + 0.02, y0, zf], [w + 0.02, Hr, -D / 2], [-0.02, Hr, -D / 2], T.ROOF, roofC);
    g.quad([w + 0.02, y0, -D - 0.3], [-0.02, y0, -D - 0.3], [-0.02, Hr, -D / 2], [w + 0.02, Hr, -D / 2], T.ROOF, roofC);
    g.tri3([0, Hw, 0], [0, Hw, -D], [0, Hr, -D / 2], wallT, wallC.map((v) => v * 0.9));
    g.tri3([w, Hw, -D], [w, Hw, 0], [w, Hr, -D / 2], wallT, wallC.map((v) => v * 0.9));
    // the ridge
    g.box(-0.02, w + 0.02, Hr - 0.06, Hr + 0.1, -D / 2 - 0.12, -D / 2 + 0.12, T.ROOF, roofC.map((v) => v * 0.8), 'b');
    if (style === 'eave' && w > 4.5) {
      const nd = w > 7.5 ? 2 : 1;
      for (let k = 0; k < nd; k++) dormer(g, (w * (k + 0.5)) / nd, Hw, pitch, wallC, trimC, roofC, frameC);
    }
    if (r() < 0.6) chimney(g, w * (0.2 + r() * 0.6), Hr, -D / 2 - 1.2, style === 'flat', o);
  } else {
    // a steep roof running back from behind the gable or cornice
    const Gr = style === 'cornice' ? Math.min(w / 2 * 1.2, 4) : Math.min(G * 0.82, (w / 2) * 1.6);
    const zf = style === 'cornice' ? -0.4 : -0.25;
    g.quad([0, Hw, -D], [0, Hw, zf], [w / 2, Hw + Gr, zf], [w / 2, Hw + Gr, -D], T.ROOF, roofC);
    g.quad([w, Hw, zf], [w, Hw, -D], [w / 2, Hw + Gr, -D], [w / 2, Hw + Gr, zf], T.ROOF, roofC);
    g.tri3([w, Hw, -D], [0, Hw, -D], [w / 2, Hw + Gr, -D], wallT, wallC.map((v) => v * 0.85));
    if (G > 0) {
      // the back of the gable where it stands above the roof
      g.poly(top.slice().reverse().map(([x, y]) => [x, y]), [], -0.25, wallT, wallC.map((v) => v * 0.8), true);
    } else {
      g.tri3([0, Hw, zf], [w, Hw, zf], [w / 2, Hw + Gr, zf], wallT, wallC.map((v) => v * 0.8));
    }
    if (r() < 0.45) chimney(g, r() < 0.5 ? 0.5 : w - 1.1, Hw + Gr * 0.5, -D * (0.3 + r() * 0.4), false, o);
  }
  return Hw + G;
}

// white stone copings and edges round a gable
function gableTrim(g, top, c, style) {
  const n = top.length;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = top[i];
    const [x1, y1] = top[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    if (style === 'step' && Math.abs(dy) < 0.01) {
      // a coping stone on each step
      const a = Math.min(x0, x1);
      const b = Math.max(x0, x1);
      g.box(a - 0.06, b + 0.06, y0, y0 + 0.14, -0.3, 0.1, T.SAND, c, 'b');
      continue;
    }
    if (style === 'step') continue;
    // an edge band along the slope, standing proud of the wall
    const nx = dy / len;
    const ny = -dx / len;
    const t = 0.17;
    g.quad([x1, y1, 0.07], [x0, y0, 0.07], [x0 + nx * t, y0 + ny * t, 0.07], [x1 + nx * t, y1 + ny * t, 0.07], T.SAND, c);
    g.quad([x0 + nx * t, y0 + ny * t, 0.07], [x0 + nx * t, y0 + ny * t, -0.3], [x1 + nx * t, y1 + ny * t, -0.3], [x1 + nx * t, y1 + ny * t, 0.07], T.SAND, c.map((v) => v * 0.9));
  }
}

function flowerBox(g, cards, x0, x1, y0, r, o) {
  const bc = col(pick(r, BOXES));
  g.box(x0 - 0.04, x1 + 0.04, y0 + 0.005, y0 + 0.22, 0.04, 0.27, T.PLANK, bc, 'k');
  const xm = (x0 + x1) / 2;
  const hw = (x1 - x0) / 2 + 0.1;
  const cell = r() < 0.55 ? F.GERANIUM : F.PETUNIA;
  const c = wp(g, xm, y0 + 0.4, 0.17);
  const a = wd(g, hw, 0, 0);
  const b = wd(g, 0, 0.24, 0);
  const n = wd(g, 0, 0.35, 0.94);
  cards.card(cell, c[0], c[1], c[2], a[0], a[1], a[2], b[0], b[1], b[2], n);
  const c2 = wp(g, xm, y0 + 0.34, 0.1);
  cards.card(cell === F.GERANIUM ? F.PETUNIA : F.GERANIUM, c2[0], c2[1], c2[2], a[0] * 0.9, a[1], a[2] * 0.9, b[0], b[1] * 1.1, b[2], n);
  if (r() < 0.6) {
    // trailing flowers hanging over the front
    const c3 = wp(g, xm, y0 + 0.02, 0.29);
    const b3 = wd(g, 0, 0.26, 0.03);
    cards.card(F.PETUNIA, c3[0], c3[1], c3[2], a[0], a[1], a[2], b3[0], b3[1], b3[2], n);
  }
}

function dormer(g, cx, Hw, pitch, wallC, trimC, roofC, frameC) {
  const dw = 1.5;
  const x0 = cx - dw / 2;
  const x1 = cx + dw / 2;
  const zf = -0.9; // front face of the dormer, set back on the slope
  const yb = Hw + (0.32 - zf) * Math.tan(pitch);
  const yt = yb + 1.55;
  const back = zf - (yt - yb) / Math.tan(pitch) - 0.2;
  g.quad([x0, yb, zf], [x1, yb, zf], [x1, yt, zf], [x0, yt, zf], T.PLAIN, trimC);
  g.panel(x0 + 0.18, x1 - 0.18, yb + 0.12, yt - 0.15, zf + 0.02, T.WIN_B, frameC);
  g.quad([x0, yb, back], [x0, yb, zf], [x0, yt, zf], [x0, yt, back], T.PLAIN, trimC.map((v) => v * 0.85));
  g.quad([x1, yb, zf], [x1, yb, back], [x1, yt, back], [x1, yt, zf], T.PLAIN, trimC.map((v) => v * 0.85));
  // its own little pitched roof
  const ry = yt + 0.7;
  g.quad([x0 - 0.12, yt - 0.05, zf + 0.15], [x0 - 0.12, yt - 0.05, back], [cx, ry, back], [cx, ry, zf + 0.15], T.ROOF, roofC);
  g.quad([x1 + 0.12, yt - 0.05, back], [x1 + 0.12, yt - 0.05, zf + 0.15], [cx, ry, zf + 0.15], [cx, ry, back], T.ROOF, roofC);
  g.tri3([x0, yt, zf], [x1, yt, zf], [cx, ry - 0.05, zf], T.PLAIN, trimC);
}

function chimney(g, x, y, z, funnel, o) {
  const c = col('#c9bfb2');
  g.box(x - 0.3, x + 0.3, y - 1.2, y + 1.1, z - 0.3, z + 0.3, T.BRICK, o.brick ? WHITE : c, 'b');
  g.box(x - 0.36, x + 0.36, y + 1.1, y + 1.22, z - 0.36, z + 0.36, T.SAND, c, 'b');
  if (funnel) {
    // a Burano chimney: a flared pot on top
    const p = [g.ox + x * g.rx - z * g.rz, g.oz + x * g.rz + z * g.rx];
    const ox = g.ox;
    const oz = g.oz;
    const rx = g.rx;
    const rz = g.rz;
    g.identity();
    g.lathe(p[0], p[1], [[0.18, g.oy + y + 1.22], [0.22, g.oy + y + 1.6], [0.45, g.oy + y + 2.2], [0.42, g.oy + y + 2.3]], 8, T.PLASTER, o.wallC);
    g.frame(ox, g.oy, oz, rx, rz);
  }
}

// a plain house behind an alley, closing the view through it
function backHouse(g, w, D, c, roofC, winT, frameC) {
  const H = 9.6;
  g.box(0, w, -0.3, H, -D, 0, T.PLASTER, c, 'b');
  for (let f = 0; f < 3; f++) {
    for (let x = 0.8; x < w - 1; x += 2) g.panel(x, x + 1, 1 + f * 3, 2.7 + f * 3, 0.01, winT, frameC);
  }
  g.quad([-0.2, H, 0.3], [w + 0.2, H, 0.3], [w + 0.2, H + D * 0.35, -D / 2], [-0.2, H + D * 0.35, -D / 2], T.ROOF, roofC);
  g.quad([w + 0.2, H, -D - 0.3], [-0.2, H, -D - 0.3], [-0.2, H + D * 0.35, -D / 2], [w + 0.2, H + D * 0.35, -D / 2], T.ROOF, roofC);
}

// ------------------------------------------------------------ the rows

export function houseOptions(reg, r, prev) {
  let style;
  let brick = false;
  const u = r();
  if (reg === 'nyhavn') style = u < 0.58 ? 'eave' : u < 0.74 ? 'bell' : u < 0.86 ? 'flat' : 'spout';
  else if (reg === 'gracht') {
    style = u < 0.26 ? 'step' : u < 0.54 ? 'bell' : u < 0.7 ? 'spout' : 'cornice';
    brick = style === 'step' ? r() < 0.9 : r() < 0.55;
  } else style = u < 0.55 ? 'flat' : u < 0.78 ? 'eave' : u < 0.9 ? 'bell' : 'spout';
  if (prev && prev.style === style && r() < 0.6) return houseOptions(reg, r, null);
  let paint = pick(r, PAINT[reg]);
  if (prev && prev.paint === paint) paint = pick(r, PAINT[reg]);
  const floors = reg === 'gracht' ? (r() < 0.2 ? 2 : r() < 0.85 ? 3 : 4) : reg === 'nyhavn' ? (r() < 0.45 ? 2 : 3) : (r() < 0.5 ? 2 : 3);
  const wallC = brick ? pick(r, BRICK) : col(paint);
  return {
    r,
    style,
    brick,
    paint,
    wallC,
    trimC: brick || r() < 0.7 ? pick(r, TRIM) : col(paint, 0.82),
    frameC: r() < 0.82 ? WHITE : col(pick(r, ['#2f4a3a', '#5a2a22', '#e8e0c8', '#2c3e5a'])),
    doorC: col(pick(r, DOORS)),
    shopC: col(pick(r, ['#2f4a3a', '#262626', '#6a2a24', '#f0ece2', '#2c4a70'])),
    shutterC: col(pick(r, SHUTTERS)),
    roofC: reg === 'gracht' && r() < 0.5 ? pick(r, ROOFS.slice(3)) : pick(r, ROOFS.slice(0, 4)),
    winT: reg === 'nyhavn' ? (r() < 0.5 ? T.WIN_A : T.WIN_B) : reg === 'gracht' ? (r() < 0.75 ? T.WIN_A : T.WIN_B) : r() < 0.6 ? T.WIN_B : T.WIN_A,
    doorT: r() < 0.75 ? T.DOOR_A : T.DOOR_B,
    ground: 3.6 + r() * 0.5,
    floorH: 2.9 + r() * 0.35,
    floors,
    boxes: reg === 'gracht' ? 0.25 : 0.55,
    shutters: reg === 'burano' ? r() < 0.55 : reg === 'nyhavn' ? r() < 0.15 : false,
    surround: !brick && r() < (reg === 'burano' ? 0.8 : 0.6),
    bands: r() < 0.6,
    shop: r() < (reg === 'nyhavn' ? 0.45 : 0.2),
    doorAt: r() < 0.45 ? 'left' : r() < 0.8 ? 'right' : 'mid',
  };
}

// Place and build the houses along every quay. `skip(x, z)` marks spots
// kept free (the café, the church square...).
export function buildHouses(sectors, quality, skip = () => false) {
  const r = rng(314);
  const lines = quayLines();
  let count = 0;
  for (const line of lines) {
    const P = line.pts;
    // the facade line: a street's width in from the water, every half metre
    const fl = [];
    const segs = line.closed ? P.length : P.length - 1;
    for (let k = 0; k < segs; k++) {
      const p = P[k];
      const q = P[(k + 1) % P.length];
      for (let t = 0; t < 1; t += 0.25) {
        const nx = p.nx + (q.nx - p.nx) * t;
        const nz = p.nz + (q.nz - p.nz) * t;
        const px = p.x + (q.x - p.x) * t;
        const pz = p.z + (q.z - p.z) * t;
        const sw = streetWidth(p);
        const x = px + nx * sw;
        const z = pz + nz * sw;
        const ok = !p.sea && !q.sea && pz < 245 && Math.abs(x) < 400 && allWaterD(x, z) > sw * 0.85 && !nearBridge(x, z, 3) && !skip(x, z);
        fl.push({ x, z, ok, reg: region(p) });
      }
    }
    const n = fl.length;
    let i = 0;
    let prev = null;
    let prevDir = null;
    let run = 0;
    while (i < n - 2) {
      if (!fl[i].ok) {
        i++;
        prevDir = null;
        continue;
      }
      const reg = fl[i].reg;
      const wide = r() < 0.08;
      const w = wide ? 8.5 + r() * 2.5 : reg === 'gracht' ? 4.6 + r() * 2.4 : 5 + r() * 2.8;
      // walk along until the chord is long enough
      let j = i + 1;
      let bad = false;
      while (j < n && Math.hypot(fl[j].x - fl[i].x, fl[j].z - fl[i].z) < w) {
        if (!fl[j].ok) {
          bad = true;
          break;
        }
        j++;
      }
      if (bad || j >= n) {
        i = j + 1;
        prevDir = null;
        continue;
      }
      const a = fl[i];
      const b = fl[j];
      const cw = Math.hypot(b.x - a.x, b.z - a.z);
      const rx = (b.x - a.x) / cw;
      const rz = (b.z - a.z) / cw;
      // keep to fairly straight stretches, and do not fold into the neighbour
      let dev = 0;
      for (let k = i + 1; k < j; k++) dev = Math.max(dev, Math.abs((fl[k].x - a.x) * -rz + (fl[k].z - a.z) * rx));
      const turn = prevDir ? Math.abs(Math.atan2(prevDir[0] * rz - prevDir[1] * rx, prevDir[0] * rx + prevDir[1] * rz)) : 0;
      if (dev > 0.9 || turn > 0.45) {
        i += 2;
        prevDir = null;
        continue;
      }
      // depth: as deep as the land allows
      let D = 10.5 + r() * 2;
      const bx = (a.x + b.x) / 2 + rz * D;
      const bz = (a.z + b.z) / 2 - rx * D;
      if (allWaterD(bx, bz) < 4) D = 7;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const g = sectors.geo(mx, mz);
      const d = sectors.det(mx, mz);
      const o = houseOptions(reg, r, prev);
      g.frame(a.x, 1.41, a.z, rx, rz);
      d.frame(a.x, 1.41, a.z, rx, rz);
      house(g, d, sectors.flowers(mx, mz), cw, D, o);
      count++;
      prev = o;
      prevDir = [rx, rz];
      run++;
      i = j;
      // now and then an alley, with a house further back closing it off
      if (run > 3 && r() < 0.22) {
        run = 0;
        const gap = 2.4 + r() * 1.4;
        let k = i;
        while (k < n - 1 && Math.hypot(fl[k].x - b.x, fl[k].z - b.z) < gap) k++;
        const c = fl[Math.min(k, n - 1)];
        const gx = (c.x - b.x) / (Math.hypot(c.x - b.x, c.z - b.z) || 1);
        const gz = (c.z - b.z) / (Math.hypot(c.x - b.x, c.z - b.z) || 1);
        const ox = b.x + rz * 14 - gx * 2;
        const oz = b.z - rx * 14 - gz * 2;
        if (allWaterD(ox, oz) > 10) {
          g.frame(ox, 1.35, oz, gx, gz);
          backHouse(g, gap + 4, 8, col(pick(r, PAINT.gracht), 0.92), pick(r, ROOFS), o.winT, WHITE);
        }
        i = k;
        prevDir = null;
      }
    }
  }
  for (const s of sectors.map.values()) s.geo.identity();
  for (const s of sectors.detail.values()) s.geo.identity();
  return count;
}
