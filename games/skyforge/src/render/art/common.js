// Shared painting kit for every Skyforge art module (ART owns render/art/*).
// Ported from the approved concept prototype (lib.js / world.js) and extended.
//
// Look rules (the concept's): flat cel-shaded faces with ink outlines (OUT),
// warm light from the upper left, so a box's front face takes the base colour,
// its top is lighter and its right-hand side face darker. Oblique 3/4 boxes:
// depth goes up-right by (DX, DY) per pixel of depth, exactly the camera's
// projection (render/camera.js: sx = (x + y*0.55)*T, sy = (-y*0.36 - z)*T).
//
// Everything here is deterministic: randomness only through rng(seed).
// Painters draw in unzoomed world pixels (T = 48 px per tile at zoom 1).
import { T } from '../../config.js';

export { T };
export const TAU = Math.PI * 2;
export const DX = 0.55, DY = -0.36;                 // screen offset per px of depth
export const OUT = 'rgba(42,24,34,0.82)';            // ink outline
export const OUTW = 1.35;                            // ink weight at zoom 1
export const INK = '#2a1822';
export const LIGHT = { x: -0.6, y: -0.8 };           // light comes from the upper left

// ---------------------------------------------------------------- numbers
export function rng(seed = 1) {
  let a = (seed | 0) || 1;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) { const s = String(p); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h = Math.imul(h ^ 0x9e37, 16777619) >>> 0; }
  return h >>> 0;
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const sat = (v) => clamp(v, 0, 1);
export const smoothstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const pick = (R, arr) => arr[Math.floor(R() * arr.length) % arr.length];
export function makeNoise(seed) {
  const r = rng(seed), v = Array.from({ length: 256 }, r);
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return v[i & 255] + (v[(i + 1) & 255] - v[i & 255]) * u; };
}

// ---------------------------------------------------------------- colour
const HEX = new Map();
export function hex(c) {
  let v = HEX.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; HEX.set(c, v); }
  return v;
}
const MIX = new Map();
export function mix(a, b, t) {
  t = Math.round(sat(t) * 100) / 100;
  const k = a + b + t; let v = MIX.get(k);
  if (!v) {
    const A = hex(a), B = hex(b);
    v = '#' + A.map((x, i) => Math.round(lerp(x, B[i], t)).toString(16).padStart(2, '0')).join('');
    if (MIX.size > 20000) MIX.clear();
    MIX.set(k, v);
  }
  return v;
}
export function rgba(c, a) { const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${Math.round(a * 1000) / 1000})`; }
export const shade = (c, t) => (t > 0 ? mix(c, '#ffffff', t) : mix(c, '#1a1028', -t));
// soot/char tint used by damage, fire and ruins
export const char = (c, t) => mix(c, '#2a1c1c', t);

// ---------------------------------------------------------------- paths
export function pathPts(g, pts, close = true) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}
export function smooth(g, pts, close = true) {
  const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  g.beginPath();
  if (close) {
    const s = m(pts[n - 1], pts[0]); g.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = m(p, pts[(i + 1) % n]); g.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
    g.closePath();
  } else {
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) { const q = m(pts[i], pts[i + 1]); g.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
    g.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
}
export function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, Math.abs(rx)), Math.max(0.1, Math.abs(ry)), rot, 0, TAU); }
export function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
export function vgrad(g, y0, y1, stops) { const gr = g.createLinearGradient(0, y0, 0, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
export function hgrad(g, x0, x1, stops) { const gr = g.createLinearGradient(x0, 0, x1, 0); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
export function ink(g, w = OUTW) { g.strokeStyle = OUT; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
export function line(g, x1, y1, x2, y2, col, w = 1) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
export function poly(g, pts, fill, stroke = true, w = OUTW) { pathPts(g, pts); g.fillStyle = fill; g.fill(); if (stroke) ink(g, w); }

// additive light halo (used for lamps, furnaces, crystals)
export function glow(g, x, y, r, col, a = 1) {
  if (r <= 0 || a <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, Math.min(1, a))); gr.addColorStop(0.35, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, 0));
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
// soft, non-additive dark blob (contact shadow); falls to the lower right, away from the light
export function shadowBlob(g, x, y, rx, ry = rx * 0.3, a = 0.22) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, `rgba(20,30,15,${a})`); gr.addColorStop(0.7, `rgba(20,30,15,${a * 0.8})`); gr.addColorStop(1, 'rgba(20,30,15,0)');
  g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.fillStyle = gr; circ(g, x, y, rx); g.fill(); g.restore();
}

// ---------------------------------------------------------------- oblique kit
// point d px into the depth from (x, y)
export const back = (x, y, d) => [x + d * DX, y + d * DY];
// a face with ink outline
export function face(g, pts, fill, stroke = true) { pathPts(g, pts); g.fillStyle = fill; g.fill(); if (stroke) ink(g); }
// a box: x, y = front-bottom-left; w wide, h tall, d deep. Returns key points.
export function box(g, x, y, w, h, d, col, o = {}) {
  const ox = d * DX, oy = d * DY;
  face(g, [[x + w, y], [x + w + ox, y + oy], [x + w + ox, y - h + oy], [x + w, y - h]], o.side || shade(col, -0.32));
  if (o.top !== false) face(g, [[x, y - h], [x + w, y - h], [x + w + ox, y - h + oy], [x + ox, y - h + oy]], o.topCol || shade(col, 0.18));
  face(g, [[x, y], [x + w, y], [x + w, y - h], [x, y - h]], col);
  if (o.ao !== false && h > 6) { // ambient occlusion at the foot of the walls
    g.fillStyle = vgrad(g, y - Math.min(h, 10), y, [[0, 'rgba(30,15,30,0)'], [1, 'rgba(30,15,30,0.18)']]);
    g.fillRect(x + 0.6, y - Math.min(h, 10), w - 1.2, Math.min(h, 10) - 0.6);
  }
  return { ox, oy, x, y, w, h, d, top: y - h + oy };
}
// a cylinder standing at (cx, y) (front-bottom of the ellipse), radius r, height h
export function cylinder(g, cx, y, r, h, col, o = {}) {
  const ry = r * (o.squash ?? 0.42);
  g.beginPath(); g.moveTo(cx - r, y - h); g.lineTo(cx - r, y); g.ellipse(cx, y, r, ry, 0, Math.PI, 0, true); g.lineTo(cx + r, y - h); g.closePath();
  g.fillStyle = hgrad(g, cx - r, cx + r, [[0, shade(col, 0.16)], [0.35, col], [1, shade(col, -0.36)]]); g.fill(); ink(g);
  if (o.top !== false) { ell(g, cx, y - h, r, ry); g.fillStyle = o.topCol || shade(col, 0.2); g.fill(); ink(g); }
  return { top: y - h, ry };
}
// gable roof over a wall box: x, y = front-left of the eaves line, w wide, d deep, rh tall, o = overhang
export function gable(g, x, y, w, d, rh, col, o = 4) {
  const ox = d * DX, oy = d * DY, A = [x - o, y], B = [x + w + o, y], P = [x + w / 2, y - rh];
  face(g, [A, P, [P[0] + ox, P[1] + oy], [A[0] + ox, A[1] + oy]], shade(col, 0.12));
  face(g, [P, B, [B[0] + ox, B[1] + oy], [P[0] + ox, P[1] + oy]], shade(col, -0.3));
  return P;
}
export function gableFront(g, x, y, w, rh, wall) { face(g, [[x, y], [x + w, y], [x + w / 2, y - rh + 3]], shade(wall, -0.05)); }
// tile courses on the dark (right) slope of a gable
export function roofTiles(g, x, y, w, d, rh, col, n = 5) {
  const ox = d * DX, oy = d * DY; g.strokeStyle = rgba(shade(col, -0.5), 0.5); g.lineWidth = 1;
  for (let i = 1; i < n; i++) { const t = i / n; g.beginPath(); g.moveTo(lerp(x + w / 2, x + w + 4, t), lerp(y - rh, y, t)); g.lineTo(lerp(x + w / 2, x + w + 4, t) + ox, lerp(y - rh, y, t) + oy); g.stroke(); }
  // and shingle rows on the lit slope
  g.strokeStyle = rgba(shade(col, -0.35), 0.35);
  for (let i = 1; i < n; i++) { const t = i / n; g.beginPath(); g.moveTo(lerp(x + w / 2, x - 4, t), lerp(y - rh, y, t)); g.lineTo(lerp(x + w / 2, x - 4, t) + ox, lerp(y - rh, y, t) + oy); g.stroke(); }
}
// a hipped roof (four slopes) over a box footprint x, y (front-left of eaves), w x d, rh tall
export function hipRoof(g, x, y, w, d, rh, col, o = 4) {
  const ox = d * DX, oy = d * DY, inset = Math.min(w, d * 0.9) * 0.42;
  const A = [x - o, y + o * 0.3], B = [x + w + o, y + o * 0.3], C = [x + w + o + ox, y + oy - o * 0.3], D = [x - o + ox, y + oy - o * 0.3];
  const r0 = [x + inset + ox * 0.5, y - rh + oy * 0.5], r1 = [x + w - inset + ox * 0.5, y - rh + oy * 0.5];
  face(g, [D, C, r1, r0], shade(col, 0.22));
  face(g, [B, C, r1], shade(col, -0.32));
  face(g, [A, D, r0], shade(col, 0.08));
  face(g, [A, B, r1, r0], col);
  return { ridge: [r0, r1] };
}
// window: x, y = top-left. lit 0..1 = night lamp light behind it. P.light adds the halo.
export function win(g, x, y, w, h, lit = 0, arch = false) {
  g.fillStyle = OUT; if (arch) { rr(g, x - 1, y - 1, w + 2, h + 2, w / 2 + 1); g.fill(); } else g.fillRect(x - 1, y - 1, w + 2, h + 2);
  const clip = () => { if (arch) { rr(g, x, y, w, h, w / 2); g.fill(); } else g.fillRect(x, y, w, h); };
  if (lit > 0.15) { g.fillStyle = mix('#5a6a8c', '#ffd27a', lit); clip(); g.fillStyle = rgba('#fff4c0', 0.5 * lit); g.fillRect(x + 1, y + h * 0.5, w - 2, h * 0.45); }
  else { g.fillStyle = vgrad(g, y, y + h, [[0, '#a6d0ee'], [1, '#3e5a86']]); clip(); g.fillStyle = rgba('#ffffff', 0.55); g.fillRect(x + 1, y + 1 + (arch ? w * 0.3 : 0), w * 0.35, h * 0.35); }
  g.fillStyle = OUT; g.fillRect(x + w / 2 - 0.5, y + (arch ? w * 0.3 : 0), 1, h - (arch ? w * 0.3 : 0)); g.fillRect(x, y + h * 0.55 - 0.5, w, 1);
}
export function winGlow(g, x, y, w, h, lit) { if (lit > 0.15) glow(g, x + w / 2, y + h / 2, Math.max(w, h) * 2.6, '#ffb347', 0.38 * lit); }
export function door(g, x, y, w, h, col = '#6b4230') {
  g.fillStyle = col; rr(g, x, y - h, w, h, w * 0.45); g.fill(); ink(g, 1.2);
  g.strokeStyle = rgba(shade(col, -0.4), 0.6); g.lineWidth = 0.8;
  for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x + w * i / 3, y - h + w * 0.25); g.lineTo(x + w * i / 3, y - 1); g.stroke(); }
  g.fillStyle = '#e8c070'; circ(g, x + w * 0.78, y - h * 0.45, Math.max(0.7, w * 0.07)); g.fill();
}
// timber half-framing on a wall face (x, y front-bottom-left)
export function timbers(g, x, y, w, h, col = '#6b4a35', diag = true) {
  g.strokeStyle = rgba(col, 0.85); g.lineWidth = 1.8; g.lineCap = 'butt';
  g.strokeRect(x + 1, y - h + 1, w - 2, h - 2);
  g.beginPath(); g.moveTo(x + 1, y - h * 0.5); g.lineTo(x + w - 1, y - h * 0.5);
  if (diag) { g.moveTo(x + 1, y - 1); g.lineTo(x + w * 0.22, y - h * 0.5); g.moveTo(x + w - 1, y - 1); g.lineTo(x + w * 0.78, y - h * 0.5); }
  g.stroke(); g.lineCap = 'round';
}
// bricks / stone courses on a face
export function courses(g, x, y, w, h, step, col, a = 0.3, bond = true) {
  g.strokeStyle = rgba(col, a); g.lineWidth = 1;
  for (let r = 1; r * step < h; r++) {
    g.beginPath(); g.moveTo(x, y - r * step); g.lineTo(x + w, y - r * step); g.stroke();
    if (bond) for (let c = 0; c < w / (step * 2); c++) { const bx = x + (c + (r % 2) * 0.5) * step * 2; if (bx > x && bx < x + w) { g.beginPath(); g.moveTo(bx, y - r * step); g.lineTo(bx, y - (r - 1) * step); g.stroke(); } }
  }
}
export function planks(g, x, y, w, h, step, col, a = 0.3) {
  g.strokeStyle = rgba(col, a); g.lineWidth = 1;
  for (let i = 1; i * step < w; i++) { g.beginPath(); g.moveTo(x + i * step, y); g.lineTo(x + i * step, y - h); g.stroke(); }
}
export function crystal(g, x, y, len, rot, cols = ['#c9fbff', '#5fd3e8', '#2c6fa8']) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const w = len * 0.28;
  const pts = [[-w, 0], [-w * 0.8, len * 0.7], [0, len * 1.15], [w * 0.8, len * 0.7], [w, 0], [0, -len * 0.15]];
  pathPts(g, pts); g.fillStyle = vgrad(g, -len * 0.2, len * 1.1, [[0, cols[2]], [0.5, cols[1]], [1, cols[0]]]); g.fill();
  g.strokeStyle = rgba('#15304e', 0.7); g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.moveTo(-w * 0.8, len * 0.7); g.lineTo(0, len * 0.55); g.lineTo(w * 0.8, len * 0.7); g.moveTo(0, len * 0.55); g.lineTo(0, -len * 0.1);
  g.strokeStyle = rgba(cols[0], 0.7); g.lineWidth = 1; g.stroke();
  g.fillStyle = rgba('#ffffff', 0.55); pathPts(g, [[-w * 0.7, len * 0.1], [-w * 0.45, len * 0.6], [-w * 0.15, len * 0.5], [-w * 0.35, len * 0.05]]); g.fill();
  g.restore();
}
// an upright crystal (point up) standing at (x, y)
export function crystalUp(g, x, y, len, lean = 0, cols) { crystal(g, x, y, -len, Math.PI + lean, cols); }

// puffs of smoke rising from (x, y). t (seconds) animates the column; s scales it.
export function smoke(g, x, y, s, col = '#e8e2dc', o = {}) {
  if (!FXFLAGS.smoke && !o.force) return;
  const n = o.n ?? 7, drift = o.drift ?? 1, rise = o.rise ?? 90, t = o.t ?? 0, seed = o.seed ?? 1, a0 = o.a ?? 0.75;
  const R = rng(seed), speed = o.speed ?? 0.35;
  for (let i = n - 1; i >= 0; i--) {
    const jitter = R(), ph = ((i / n) + t * speed + jitter * 0.07) % 1;
    const X = x + drift * ph * ph * 70 * s + Math.sin(t * 1.3 + i * 2.1) * 3 * s * ph, Y = y - ph * rise * s, r = (6 + ph * 18) * s;
    const a = a0 * (1 - ph) * Math.min(1, ph * 8) + 0.02;
    const gr = g.createRadialGradient(X + LIGHT.x * r * 0.3, Y - r * 0.3, 0, X, Y, r);
    gr.addColorStop(0, rgba(shade(col, 0.15), a)); gr.addColorStop(0.6, rgba(col, a * 0.8)); gr.addColorStop(1, rgba(shade(col, -0.2), 0));
    g.fillStyle = gr; circ(g, X, Y, r); g.fill();
  }
}
// rising steam: lighter, faster, quicker to fade
export function steam(g, x, y, s, t, seed = 1) { smoke(g, x, y, s * 0.7, '#ffffff', { n: 5, t, seed, rise: 60, a: 0.55, speed: 0.6, drift: 0.6 }); }
// licking flames standing on (x, y); s scales, t animates
export function flames(g, x, y, s, t = 0, seed = 1, n = 6) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const ph = R() * TAU, sp = 6 + R() * 5, fl = 0.75 + 0.25 * Math.sin(t * sp + ph);
    const X = x + (R() - 0.5) * 22 * s, h = (14 + R() * 20) * s * fl, w = (5 + R() * 4) * s, sway = Math.sin(t * 4 + ph) * 3 * s;
    g.fillStyle = R() < 0.5 ? '#ff6a2a' : '#ff8f34';
    g.beginPath(); g.moveTo(X - w, y); g.quadraticCurveTo(X - w * 0.7, y - h * 0.6, X + sway, y - h); g.quadraticCurveTo(X + w * 0.7, y - h * 0.6, X + w, y); g.fill();
    g.fillStyle = '#ffe27a'; g.beginPath(); g.moveTo(X - w * 0.5, y); g.quadraticCurveTo(X - w * 0.2, y - h * 0.5, X + sway * 0.5, y - h * 0.6); g.quadraticCurveTo(X + w * 0.3, y - h * 0.4, X + w * 0.5, y); g.fill();
  }
  for (let i = 0; i < 6; i++) { const ph = (t * (0.8 + R()) + R()) % 1; g.fillStyle = rgba('#ffcf6a', 0.9 * (1 - ph)); circ(g, x + (R() - 0.5) * 30 * s + Math.sin(t * 3 + i) * 4, y - ph * 50 * s, (1 + R()) * s); g.fill(); }
}
// catenary between two points with sag (px at the middle), n segments
export function catenary(x1, y1, x2, y2, sag, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([lerp(x1, x2, t), lerp(y1, y2, t) + sag * 4 * t * (1 - t)]); }
  return pts;
}
export function catPoint(x1, y1, x2, y2, sag, t) { return [lerp(x1, x2, t), lerp(y1, y2, t) + sag * 4 * t * (1 - t)]; }

// a brass/iron gear centred at (x, y), radius r, n teeth, angle a
export function gear(g, x, y, r, n, a, col = '#c9a050') {
  g.save(); g.translate(x, y); g.rotate(a);
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const ang = i / (n * 2) * TAU, rr2 = i % 2 ? r * 0.78 : r; const a0 = ang - TAU / (n * 4) * 0.7, a1 = ang + TAU / (n * 4) * 0.7; g.lineTo(Math.cos(a0) * rr2, Math.sin(a0) * rr2); g.lineTo(Math.cos(a1) * rr2, Math.sin(a1) * rr2); }
  g.closePath(); g.fillStyle = col; g.fill(); ink(g, 1);
  circ(g, 0, 0, r * 0.45); g.fillStyle = shade(col, -0.25); g.fill(); ink(g, 1);
  circ(g, 0, 0, r * 0.16); g.fillStyle = shade(col, 0.3); g.fill();
  g.restore();
}
// little pennant/flag on a pole top at (x, y), waving with t
export function pennant(g, x, y, len, col, t = 0, seed = 0) {
  const w = Math.sin(t * 5 + seed) * 0.12;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * 0.5, y + len * (0.05 + w), x + len, y + len * 0.18 + w * len * 0.5);
  g.quadraticCurveTo(x + len * 0.5, y + len * (0.32 - w * 0.5), x, y + len * 0.4); g.closePath(); g.fillStyle = col; g.fill(); ink(g, 1);
}
// warm hanging lantern at (x, y): body in the base pass, halo with P.light
export function lantern(g, x, y, s = 1) {
  g.fillStyle = '#3a2a2a'; g.fillRect(x - 2.4 * s, y - 1 * s, 4.8 * s, 1.4 * s);
  g.fillStyle = '#ffd27a'; rr(g, x - 2 * s, y, 4 * s, 5 * s, 1.2 * s); g.fill(); ink(g, 0.8);
  g.fillStyle = '#3a2a2a'; g.fillRect(x - 2.4 * s, y + 5 * s, 4.8 * s, 1.2 * s);
}
// No-op 2D context: run a painter against it to collect anchor points without drawing.
const noop = () => {};
const fakeGrad = { addColorStop: noop };
export const NULLG = new Proxy({}, {
  get(t, k) { if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' || k === 'createConicGradient') return () => fakeGrad; if (k === 'measureText') return () => ({ width: 0 }); return noop; },
  set(t, k, v) { t[k] = v; return true; },
});

// ---------------------------------------------------------------- painter helpers (q = resolved opts)
// how lit one window is: most windows glow at night, a few stay dim (deterministic per position)
export function litOf(q, x, y) { if (!q.lit) return 0; const h = hash(q.seed, Math.round(x), Math.round(y)) % 100; return h < 78 ? q.lit : q.lit * 0.2; }
// a window whose night glow is queued on q.L for the light pass
export function wnd(g, q, x, y, w, h, arch = false) {
  const lit = litOf(q, x, y); win(g, x, y, w, h, lit, arch);
  if (lit > 0.15) q.L.push([x + w / 2, y + h / 2, Math.max(w, h) * 2.8, '#ffb347', 0.42 * lit]);
}
// queue a light halo: x, y, radius, colour, alpha
export function halo(q, x, y, r, col, a) { if (a > 0.01) q.L.push([x, y, r, col, a]); }
// a lamp post at (x, y) ground; its lamp halo is queued when it is night
export function lampPost(g, q, x, y, s = 1) {
  line(g, x, y, x, y - 22 * s, OUT, 2.6 * s); line(g, x, y, x, y - 22 * s, '#4a4048', 1.5 * s);
  g.fillStyle = '#4a4048'; g.fillRect(x - 2.5 * s, y - 1.5 * s, 5 * s, 2 * s);
  lantern(g, x, y - 27 * s, s);
  if (q.night > 0.1) halo(q, x, y - 24 * s, 34 * s, '#ffb347', 0.55 * q.night);
}
// scale factor for a footprint against the one a painter was designed for
export const fit = (W, D, w0, d0) => clamp(Math.min(W / w0, D / d0), 0.7, 1.35);
// smoke columns on/off (the renderer may draw its own wind-aware smoke from the anchors)
export const FXFLAGS = { smoke: true };
// front-left corner of an inset body: u px along the front, v px into the depth
export const at = (u, v) => [u + v * DX, v * DY];
// a roof whose ridge runs along the front (long side to the viewer), with the
// gable end on the right-hand side. x, y = front-left of the eaves line.
export function ridgeRoof(g, x, y, w, d, rh, col, wall, o = 4) {
  const hx = d / 2 * DX, hy = d / 2 * DY;
  const FL = [x - o, y + 1], FR = [x + w + o, y + 1], RL = [x - o + hx, y + hy - rh], RR = [x + w + o + hx, y + hy - rh];
  const BL = [x - o + d * DX, y + d * DY - 1], BR = [x + w + o + d * DX, y + d * DY - 1];
  face(g, [BL, BR, RR, RL], shade(col, 0.2));
  face(g, [[x + w, y], [x + w + d * DX, y + d * DY], [x + w + hx, y + hy - rh + 2]], shade(wall, -0.3));
  face(g, [FR, BR, RR], shade(col, -0.38));
  face(g, [FL, FR, RR, RL], col);
  g.strokeStyle = rgba(shade(col, -0.45), 0.45); g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const t = i / 4; g.beginPath(); g.moveTo(lerp(FL[0], RL[0], t), lerp(FL[1], RL[1], t)); g.lineTo(lerp(FR[0], RR[0], t), lerp(FR[1], RR[1], t)); g.stroke(); }
  g.strokeStyle = rgba('#fff4dc', 0.35); g.beginPath(); g.moveTo(RL[0] + 1, RL[1] + 1); g.lineTo(RR[0] - 1, RR[1] + 1); g.stroke();
  return { RL, RR, top: Math.min(RL[1], BL[1]) };
}
// a dome (half ellipse) on top of a point: cx, cy = centre of its base
export function dome(g, cx, cy, r, col, h = r) {
  g.beginPath(); g.ellipse(cx, cy, r, h, 0, Math.PI, 0); g.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI); g.closePath();
  const dg = g.createRadialGradient(cx - r * 0.4, cy - h * 0.6, 1, cx, cy, r * 1.15);
  dg.addColorStop(0, shade(col, 0.55)); dg.addColorStop(0.35, col); dg.addColorStop(1, shade(col, -0.45));
  g.fillStyle = dg; g.fill(); ink(g);
}
