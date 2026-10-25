// Scenery on the horizon: a tiling strip of far ridges (with the volcano in
// the sunset sea) and island set pieces (palms, fortresses, lighthouses, sea
// stacks) built once per biome as sprites and placed procedurally along an
// endless coast. Ported from the concept renderer's ridge(), palm(),
// fortress() and lighthouse().
import { W } from '../config.js';
import { rng, lerp, rgba } from '../util.js';
import { canvasK } from './sky.js';
import { drawGlow, drawPuff } from './sprites.js';

export const FAR_TW = 2600;          // far strip repeat width
export const FAR_SPEED = 0.18, MID_SPEED = 0.42, MID_SP = 640;

export function hash(k, salt = 0) {
  let h = Math.imul((k | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function ridge(g, x0, x1, base, height, seed, rough = 0.5) {
  const r = rng(seed), pts = [], n = 40, ph = [r() * 9, r() * 9, r() * 9];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = lerp(x0, x1, u), env = Math.pow(Math.sin(u * Math.PI), 0.7);
    const h = height * env * (0.75 + rough * 0.25 * (Math.sin(u * 9 + ph[0]) + 0.6 * Math.sin(u * 23 + ph[1]) + 0.3 * Math.sin(u * 51 + ph[2])));
    pts.push([x, base - h]);
  }
  g.beginPath(); g.moveTo(x0, base + 2);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineTo(x1, base + 2); g.closePath();
  return pts;
}
function palm(g, x, y, h, col, lean = 0.3) {
  g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round';
  g.lineWidth = h * 0.06;
  const tx = x + h * lean, ty = y - h;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + h * lean * 0.2, y - h * 0.6, tx, ty); g.stroke();
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.55 + (i % 2 ? 0.1 : -0.1), L = h * (0.45 + (i % 3) * 0.08);
    const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.6 + L * 0.35;
    g.lineWidth = h * 0.05;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo((tx + ex) / 2, ty - L * 0.25, ex, ey); g.stroke();
  }
}
const WINDOWS = [[-1.1, 0.6], [0, 1.0], [0, 0.7], [1.1, 0.55], [-0.5, 0.3], [0.5, 0.3]];
function fortress(g, x, y, s, col, out) {
  g.fillStyle = col;
  const tower = (tx, w, h) => {
    g.fillRect(tx - w / 2, y - h, w, h);
    for (let k = 0; k < 3; k++) g.fillRect(tx - w / 2 + k * w / 2.5, y - h - s * 0.08, w / 5, s * 0.08);
  };
  g.fillRect(x - s * 1.2, y - s * 0.5, s * 2.4, s * 0.5);
  tower(x - s * 1.1, s * 0.4, s * 0.95); tower(x + s * 1.1, s * 0.4, s * 0.85); tower(x, s * 0.55, s * 1.45);
  g.beginPath(); g.moveTo(x - s * 0.33, y - s * 1.45); g.lineTo(x, y - s * 1.95); g.lineTo(x + s * 0.33, y - s * 1.45); g.fill();
  // flag on the keep
  g.fillRect(x - 1, y - s * 2.25, 2, s * 0.32);
  g.beginPath(); g.moveTo(x + 1, y - s * 2.25); g.lineTo(x + s * 0.3, y - s * 2.15); g.lineTo(x + 1, y - s * 2.05); g.fill();
  for (const [wx, wy] of WINDOWS) out.push([x + wx * s, y - wy * s - 1]);
}
function lighthouse(g, x, y, s, col) {
  g.fillStyle = col;
  g.beginPath(); g.moveTo(x - s * 0.22, y); g.lineTo(x - s * 0.13, y - s * 1.3); g.lineTo(x + s * 0.13, y - s * 1.3); g.lineTo(x + s * 0.22, y); g.fill();
  g.fillRect(x - s * 0.18, y - s * 1.36, s * 0.36, s * 0.08);
  g.fillRect(x - s * 0.1, y - s * 1.6, s * 0.2, s * 0.24);
  g.beginPath(); g.moveTo(x - s * 0.13, y - s * 1.6); g.lineTo(x, y - s * 1.74); g.lineTo(x + s * 0.13, y - s * 1.6); g.fill();
  return [x, y - s * 1.48];
}
function stack(g, x, base, w, h) {
  g.beginPath(); g.moveTo(x - w, base + 20); g.lineTo(x - w * 0.6, base - h);
  g.quadraticCurveTo(x, base - h - 20, x + w * 0.5, base - h + 10); g.lineTo(x + w, base + 20); g.fill();
}

// ------------------------------------------------------------ far strip
export function buildFar(B, K) {
  const F = B.far, hz = B.hz, top = hz - 190, TW = FAR_TW;
  const { c, g } = canvasK(TW, hz + 4 - top, K);
  g.translate(0, -top);
  const r = rng(F.seed), vents = [];
  // two rows of ridges; each ridge also drawn one tile over so the strip wraps
  for (let row = 0; row < 2; row++) {
    g.fillStyle = F.cols[row];
    let x = r() * 200 - 200 + row * 260;
    while (x < TW) {
      const w = 260 + r() * 360, h = lerp(F.h[0], F.h[1], r()) * (row ? 0.8 : 1), seed = (r() * 1e6) | 0;
      if (r() < 0.78) for (const ox of [0, -TW, TW]) { ridge(g, x + ox, x + w + ox, hz, h, seed, F.rough); g.fill(); }
      x += w * (0.7 + r() * 0.9);
    }
  }
  if (F.volcano) { // one volcano per tile, smoke and glow drawn live
    const vx = 1050 + r() * 300;
    g.fillStyle = F.volcano;
    for (const ox of [0, -TW, TW]) { g.beginPath(); g.moveTo(vx - 130 + ox, hz); g.lineTo(vx - 20 + ox, hz - 120); g.lineTo(vx + 10 + ox, hz - 116); g.lineTo(vx + 130 + ox, hz); g.fill(); }
    vents.push([vx - 5, hz - 120]);
  }
  return { c, ty: top, th: hz + 4 - top, TW, vents };
}
export function drawFar(g, strip, off, t, glowCol) {
  const TW = strip.TW, x0 = -(((off % TW) + TW) % TW);
  for (let x = x0; x < W; x += TW) {
    g.drawImage(strip.c, x, strip.ty, TW, strip.th);
    for (const [vx, vy] of strip.vents) {
      const sx = x + vx;
      if (sx < -200 || sx > W + 200) continue;
      // smoke column rising and drifting left, glow in the crater
      for (let i = 0; i < 11; i++) {
        const u = ((i / 11) + t * 0.025) % 1;
        drawPuff(g, sx - u * 80 + Math.sin(u * 5 + i) * 6, vy - 6 - u * 120, 14 + u * 38, '#6a2a5a', 0.55 * Math.min(1, u * 5) * (1 - u));
      }
      drawGlow(g, sx, vy + 2, 40 + Math.sin(t * 2.3) * 4, glowCol, 0.8);
    }
  }
}

// ------------------------------------------------------------ set pieces
const PH = 240; // sprite height above the base line
export function buildPiece(B, kind, v, K) {
  const M = B.mid, r = rng(1000 + v * 77 + kind.length * 13 + B.hz);
  const lights = [], beams = [];
  let w = 0;
  const pad = 30, base = PH;
  const make = (width) => { w = width; const o = canvasK(width + pad * 2, PH + 24, K); o.g.translate(pad, 0); o.g.fillStyle = M.col; return o; };
  let o;
  if (kind === 'isle') {
    const width = 240 + v * 70; o = make(width); const { g } = o;
    ridge(g, 0, width, base + 12, 60 + r() * 40, 300 + v, 0.8); g.fill();
    palm(g, width * 0.2, base - 20, 55 + r() * 12, M.col, 0.35); palm(g, width * 0.3, base - 8, 44, M.col, 0.15);
    if (v !== 1) palm(g, width * 0.78, base - 14, 52, M.col, -0.3);
  } else if (kind === 'fort') {
    const width = 430; o = make(width); const { g } = o;
    ridge(g, 0, width, base + 12, 95, 9 + v, 0.8); g.fill();
    fortress(g, 210 + (v - 1) * 20, base - 60, 46, M.col, lights);
    palm(g, 50, base - 20, 60, M.col, 0.4); palm(g, 80, base - 10, 48, M.col, 0.2); palm(g, 380, base - 15, 55, M.col, -0.35);
  } else if (kind === 'light') {
    const width = 320; o = make(width); const { g } = o;
    ridge(g, 0, width, base + 6, 110, 82 + v, 0.8); g.fill();
    palm(g, 40, base - 30, 70, M.col, 0.4); palm(g, 250, base - 10, 50, M.col, -0.3);
    beams.push(lighthouse(g, 140, base - 92, 70, M.col));
  } else if (kind === 'stacks') {
    const width = 260; o = make(width); const { g } = o;
    const n = 2 + (v % 2);
    for (let i = 0; i < n; i++) stack(g, 50 + i * 70 + r() * 30, base, lerp(26, 60, r()) * (i ? 0.7 : 1), lerp(80, 170, r()) * (i ? 0.6 : 1));
    if (v === 2) { g.strokeStyle = M.col; g.lineWidth = 3; g.beginPath(); g.moveTo(180, base + 4); g.lineTo(196, base - 70); g.stroke(); } // a wrecked mast
  } else return null;
  return { c: o.c, w: w + pad * 2, h: PH + 24, ox: -pad, lights, beams };
}

// Beam: a wedge of light from the lamp, sweeping slowly.
export function drawBeam(g, x, y, col, t, a = 1, seed = 0) {
  const ang = Math.sin(t * 0.6 + seed * 1.7) * 0.32 + 0.24;
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, 700);
  gr.addColorStop(0, rgba(col, 0.5 * a)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x, y);
  g.lineTo(x + Math.cos(ang - 0.06) * 700, y + Math.sin(ang - 0.06) * 700);
  g.lineTo(x + Math.cos(ang + 0.06) * 700, y + Math.sin(ang + 0.06) * 700); g.fill();
  g.restore();
  drawGlow(g, x, y, 40, col, 0.9 * a);
}

// Pieces visible at this scroll: [{ p (sprite), x (screen left of origin), y (base line), k }].
export function visiblePieces(B, cache, scroll, K) {
  const off = scroll * MID_SPEED, out = [];
  const k0 = Math.floor((off - 700) / MID_SP), k1 = Math.floor((off + W + 100) / MID_SP);
  for (let k = k0; k <= k1; k++) {
    const kinds = B.mid.kinds;
    const kind = k === 0 ? B.mid.first : kinds[(hash(k, 1) * kinds.length) | 0];
    if (kind === 'none' || (k !== 0 && hash(k, 2) < 0.18)) continue;
    const v = (hash(k, 3) * 3) | 0, key = kind + v;
    let p = cache.get(key);
    if (p === undefined) { p = buildPiece(B, kind, v, K); cache.set(key, p); }
    if (!p) continue;
    const x = k * MID_SP + hash(k, 4) * 180 - off;
    out.push({ p, x, k });
  }
  return out;
}
export function drawPieces(g, list, baseY, B, t, lightsA) {
  const sc = B.mid.scale || 1;
  for (const { p, x } of list) g.drawImage(p.c, x + p.ox * sc, baseY - PH * sc, p.w * sc, p.h * sc);
  if (sc !== 1) return;
  if (lightsA <= 0.02) return;
  const M = B.mid;
  for (const { p, x, k } of list) {
    for (const [lx, ly] of p.lights) {
      const fl = 0.85 + 0.15 * Math.sin(t * 3 + lx);
      g.fillStyle = rgba(M.lit, Math.min(1, lightsA * 1.2)); g.fillRect(x + lx - 2, baseY - PH + ly - 3, 4, 6);
      drawGlow(g, x + lx, baseY - PH + ly, 14, M.lit, 0.5 * lightsA * fl);
    }
    for (const [bx, by] of p.beams) drawBeam(g, x + bx, baseY - PH + by, M.beam, t, Math.min(1, 0.35 + lightsA), k);
  }
}
// Light reflections of lit windows in the sea below a fortress.
export function pieceReflections(g, list, baseY, B, t, lightsA) {
  if (lightsA <= 0.05) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const { p, x } of list) {
    if (!p.lights.length) continue;
    const cx = x + p.lights[1][0];
    for (let i = 0; i < 10; i++) {
      const ww = 80 * (1 - i / 12) * (0.6 + 0.4 * Math.sin(i * 2.1 + t * 5));
      g.fillStyle = rgba(B.mid.lit, 0.22 * lightsA * (1 - i / 10));
      g.fillRect(cx - ww / 2 + Math.sin(i * 1.3 + t * 3) * 6, baseY + 6 + i * 4, ww, 2.2);
    }
  }
  g.restore();
}
