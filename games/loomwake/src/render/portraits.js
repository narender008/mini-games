// Painted dialogue portraits for every speaking character, drawn in code into cached canvases.
//   getPortrait(speaker, mood, size)  or  getPortrait(speaker, { mood, size })  -> canvas (size x size) | null
// Every portrait is painted in a 512 x 512 design space (bust, head about a third of the frame), lit from the
// upper left with a coloured rim light from the right, over a soft vignette in the character's colour that fades
// to transparent at the corners. Moods map onto face parameters (brows, lids, mouth), so every mood in the script
// reads on every face: neutral, happy, warm, wry, sad, grave, angry, surprised, afraid.
// Canvases are CPU-backed (willReadFrequently) and cached per speaker, mood and size.
import { SPEAKERS } from '../content/dialogue/speakers.js';

const TAU = Math.PI * 2;
const D = 512;

// ------------------------------------------------------------------ helpers
function mk(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d', { willReadFrequently: true }); return c;
}
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); const c = A.map((v, i) => Math.round(v + (B[i] - v) * t)); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); }
const shade = (hex, t) => mix(hex, '#0a0612', t);
const tint = (hex, t) => mix(hex, '#fff6e6', t);
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// closed or open Catmull-Rom curve through points
function curve(ctx, pts, closed = true, k = 1) {
  const n = pts.length; const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k / 6, p1[1] + (p2[1] - p0[1]) * k / 6, p2[0] - (p3[0] - p1[0]) * k / 6, p2[1] - (p3[1] - p1[1]) * k / 6, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}
const mirror = (half, cx = 256) => { const r = half.map(([x, y]) => [x, y]); for (let i = half.length - 1; i >= 0; i--) r.push([2 * cx - half[i][0], half[i][1]]); return r; };

// the element colour of the speaker being painted: it tints rim light and the bounce light in every shadow
let ELEM = '#f2c46b';

// Paint a volume like a painter would: flat fill, a lit side from the key light (upper left), a soft core
// shadow past the terminator, reflected bounce light in the speaker's element colour at the far edge, an inner
// edge shadow for roundness, a highlight, cloth folds on busts, texture, and a glowing rim of element light.
function part(ctx, build, o) {
  const base = o.base, b = o.box ?? [0, 0, D, D];
  ctx.save();
  ctx.beginPath(); build(ctx); ctx.fillStyle = base; ctx.fill();
  ctx.clip();
  const [x0, y0, x1, y1] = b;
  const fx = Math.min(0, x0) - 60, fy = Math.min(0, y0) - 60, fw = Math.max(D, x1) - fx + 60, fh = Math.max(D, y1) - fy + 60;
  const sA = o.shadeA ?? 0.75;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, hexA(tint(base, 0.3), o.lightA ?? 0.6)); g.addColorStop(0.4, hexA(base, 0));
  g.addColorStop(0.68, hexA(shade(base, 0.62), sA * 0.95)); g.addColorStop(0.86, hexA(shade(base, 0.5), sA * 0.6));
  g.addColorStop(1, hexA(mix(shade(base, 0.2), ELEM, 0.55), o.bounceA ?? 0.5));
  ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh);
  if (o.edge !== 0) { ctx.beginPath(); build(ctx); const e = o.edge ?? 22; for (const [w, a] of [[e * 2.2, 0.16], [e * 1.2, 0.18], [e * 0.5, 0.22]]) { ctx.strokeStyle = hexA(shade(base, 0.7), a); ctx.lineWidth = w; ctx.stroke(); } }
  if (o.hl) { const [hx, hy, hr] = o.hl; const h = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr); h.addColorStop(0, hexA(tint(base, 0.6), o.hlA ?? 0.5)); h.addColorStop(1, hexA(tint(base, 0.6), 0)); ctx.fillStyle = h; ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2); }
  if (build.fold && o.folds !== false) folds(ctx, build.fold, base);
  if (o.tex) o.tex(ctx);
  if (o.rim) {
    const rw = o.rimW ?? 6, rc = mix(o.rim, ELEM, 0.45);
    ctx.translate(-rw * 0.8, rw * 0.25); ctx.beginPath(); build(ctx);
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hexA(rc, (o.rimA ?? 0.75) * 0.25); ctx.lineWidth = rw * 2.6; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = hexA(rc, o.rimA ?? 0.75); ctx.lineWidth = rw; ctx.stroke();
  }
  ctx.restore();
  if (o.line) { ctx.save(); ctx.beginPath(); build(ctx); ctx.strokeStyle = o.line; ctx.lineWidth = o.lineW ?? 2; ctx.stroke(); ctx.restore(); }
}
// soft cloth folds hanging from the shoulders: a shadow trough with a lit ridge beside it
function folds(ctx, f, base) {
  const { w, top, cx } = f; const r = prng((w * 7 + top) | 0);
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1, x = cx + s * (24 + r() * w * 0.8), y = top + 30 + r() * 50, L = 110 + r() * 140, bend = (r() - 0.5) * 50;
    const pts = [[x, y], [x + bend * 0.5 + s * 8, y + L * 0.5], [x + bend + s * 14, y + L]];
    ctx.strokeStyle = hexA(shade(base, 0.72), 0.3); ctx.lineWidth = 12 + r() * 16; ctx.beginPath(); curve(ctx, pts, false); ctx.stroke();
    ctx.strokeStyle = hexA(tint(base, 0.5), 0.2); ctx.lineWidth = 3 + r() * 4; ctx.beginPath(); curve(ctx, pts.map(([a, b2]) => [a - 11, b2]), false); ctx.stroke();
  }
  // shadow cast by the head and collar onto the chest
  const sh = ctx.createRadialGradient(cx + 14, top + 20, 10, cx + 14, top + 30, w * 0.55); sh.addColorStop(0, hexA(shade(base, 0.85), 0.45)); sh.addColorStop(1, hexA(shade(base, 0.85), 0));
  ctx.fillStyle = sh; ctx.fillRect(cx - w, top - 40, w * 2, w);
  ctx.restore();
}
function blob(ctx, x, y, r, color, a = 1, op = 'source-over') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
  const o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = op; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalCompositeOperation = o;
}
const glow = (ctx, x, y, r, color, a = 1) => blob(ctx, x, y, r, color, a, 'lighter');
function strands(ctx, pts, n, spread, color, w, seed, a = 0.5) { // painterly hair or fibre strokes along a guide, light and dark
  const r = prng(seed);
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const off = (r() - 0.5) * spread, off2 = (r() - 0.5) * spread, dark = r() < 0.35;
    ctx.strokeStyle = hexA(dark ? shade(color, 0.6) : color, a * (0.4 + r() * 0.6)); ctx.lineWidth = w * (0.5 + r()) * (dark ? 1.4 : 1);
    ctx.beginPath(); curve(ctx, pts.map(([x, y], j) => [x + off + (off2 - off) * (j / pts.length), y + (r() - 0.5) * 4]), false); ctx.stroke();
  }
  ctx.restore();
}
function thread(ctx, pts, color, w = 3, a = 1) {
  ctx.save(); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
  for (const [k, al] of [[5, 0.12], [2.2, 0.35], [1, 1]]) { ctx.strokeStyle = hexA(color, al * a); ctx.lineWidth = w * k; ctx.beginPath(); curve(ctx, pts, false); ctx.stroke(); }
  ctx.restore();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ expressions
// brow: + lowers the inner ends (anger), - raises them (sorrow). lid: how far the upper lids fall (lidIn and
// lidOut add at the inner and outer corners, lidR on the right eye only). squint: lower lids pushed up.
// shape: the mouth. pose: [lean radians, dx, dy, scale] for the whole bust. light: the mood's colour.
const EXPR = {
  neutral: { brow: 0, lift: 0, eye: 1, smile: 0.05, open: 0, smirk: 0, look: [0, 0], lid: 0.14, squint: 0.05, shape: 'flat', pose: [0, 0, 0, 1] },
  happy: { brow: -0.2, lift: 0.25, eye: 0.85, smile: 1, open: 0.5, smirk: 0, look: [0, 0], cheek: 1, lid: 0.04, squint: 0.62, shape: 'grin', pose: [-0.04, 0, -8, 1.01], light: '#ffd27a' },
  warm: { brow: -0.35, lift: 0.1, eye: 0.85, smile: 0.6, open: 0.05, smirk: 0, look: [0, 0.08], cheek: 0.7, lid: 0.34, squint: 0.3, shape: 'smile', pose: [0.065, 4, 2, 1], light: '#ffb070' },
  wry: { brow: 0.2, lift: 0.1, eye: 0.9, smile: 0.35, open: 0, smirk: 1, look: [0.4, 0], browUp: 1, lid: 0.34, lidR: -0.28, squint: 0.18, shape: 'smirk', pose: [-0.075, -6, 0, 1], light: '#c8a0ff' },
  sad: { brow: -1.1, lift: 0.18, eye: 0.85, smile: -0.6, open: 0, smirk: 0, look: [0, 0.5], lid: 0.22, lidOut: 0.38, squint: 0, shape: 'frown', tear: 1, pose: [0.08, 0, 18, 0.97], light: '#5a7ad0' },
  grave: { brow: 0.6, lift: -0.1, eye: 0.85, smile: -0.25, open: 0, smirk: 0, look: [0, 0.12], lid: 0.44, squint: 0.1, shape: 'pressed', pose: [0, 0, 6, 1.03], light: '#2a2850' },
  angry: { brow: 1.3, lift: -0.15, eye: 0.95, smile: -0.7, open: 0.45, smirk: 0, look: [0, 0], teeth: 1, lid: 0.22, lidIn: 0.48, squint: 0.32, shape: 'snarl', irisS: 0.88, pose: [-0.03, 0, 14, 1.08], light: '#ff3020' },
  surprised: { brow: -0.4, lift: 0.9, eye: 1.3, smile: 0, open: 0.8, smirk: 0, look: [0, 0], lid: 0, squint: 0, shape: 'o', irisS: 0.72, pose: [0, 0, -16, 0.96], light: '#ffffff' },
  afraid: { brow: -1.2, lift: 0.6, eye: 1.25, smile: -0.45, open: 0.4, smirk: 0, look: [-0.4, 0.1], lid: 0, squint: 0, shape: 'grimace', irisS: 0.64, sweat: 1, pose: [0.075, -14, 8, 0.94], light: '#70c0a0' },
};
export const MOODS = Object.keys(EXPR);
const exprFor = (mood) => EXPR[mood] ?? EXPR.neutral;

// ------------------------------------------------------------------ face kit (human-ish faces)
// eye at (x, y): w half width, h half height, side -1 left / +1 right of the face. Drawn in a mirrored local
// space where +x points to the nose, so lids and tilt read the same on both eyes.
function eye(ctx, x, y, w, h, side, ex, o) {
  const open = clamp(ex.eye, 0.08, 1.4) * h;
  ctx.save(); ctx.translate(x, y); ctx.scale(-side, 1); ctx.rotate(o.tilt ?? 0.08);
  blob(ctx, 0, -h * 0.4, w * 1.5, shade(o.skin, 0.45), 0.35);
  if (ex.eye < 0.2 || o.closed) {
    ctx.strokeStyle = o.lash ?? '#2a1620'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, h * 0.55, w, -h * 0.05); ctx.stroke();
    ctx.strokeStyle = hexA(shade(o.skin, 0.4), 0.5); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-w * 0.8, -h * 0.5); ctx.quadraticCurveTo(0, -h * 0.9, w * 0.8, -h * 0.5); ctx.stroke();
    ctx.restore(); return;
  }
  const N = 14, U = [], L = [], LID = [], SQ = [];
  const dOut = clamp((ex.lid ?? 0.12) + (ex.lidOut ?? 0) + (side > 0 ? ex.lidR ?? 0 : 0), 0, 0.92);
  const dIn = clamp((ex.lid ?? 0.12) + (ex.lidIn ?? 0) + (side > 0 ? ex.lidR ?? 0 : 0), 0, 0.92);
  const sq = ex.squint ?? 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N, px = -w + 2 * w * t, bump = Math.pow(4 * t * (1 - t), 0.8);
    const yU = -open * 1.02 * bump, yL = open * 0.72 * bump;
    U.push([px, yU]); L.push([px, yL]); LID.push([px, yU * (1 - lerp(dOut, dIn, t))]); SQ.push([px, yL * (1 - sq * 2.1)]);
  }
  const poly = (c, pts) => { c.moveTo(pts[0][0], pts[0][1]); for (const q of pts) c.lineTo(q[0], q[1]); };
  ctx.save(); ctx.beginPath(); poly(ctx, U); for (let i = N; i >= 0; i--) ctx.lineTo(L[i][0], L[i][1]); ctx.closePath();
  ctx.fillStyle = o.white ?? '#f4ece6'; ctx.fill(); ctx.clip();
  // the white is shaded round, darker at the corners
  const wg = ctx.createRadialGradient(0, 0, w * 0.2, 0, 0, w * 1.1); wg.addColorStop(0, 'rgba(0,0,0,0)'); wg.addColorStop(1, hexA(shade(o.skin, 0.6), 0.45)); ctx.fillStyle = wg; ctx.fillRect(-w, -h * 2, w * 2, h * 4);
  const ir = h * (o.iris ?? 0.95) * (ex.irisS ?? 1), lx = (ex.look?.[0] ?? 0) * w * 0.35 * -side, ly = (ex.look?.[1] ?? 0) * h * 0.4;
  const ig = ctx.createRadialGradient(lx, ly - ir * 0.3, ir * 0.1, lx, ly, ir);
  ig.addColorStop(0, tint(o.iris_c, 0.4)); ig.addColorStop(0.6, o.iris_c); ig.addColorStop(1, shade(o.iris_c, 0.65));
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(lx, ly, ir, 0, TAU); ctx.fill();
  ctx.strokeStyle = hexA(shade(o.iris_c, 0.7), 0.8); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#0c0610'; ctx.beginPath(); ctx.arc(lx, ly, ir * (ex.eye > 1.1 ? 0.3 : 0.42), 0, TAU); ctx.fill();
  if (o.glowEye) glow(ctx, lx, ly, ir * 2.2, o.glowEye, 0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(lx + ir * 0.35 * side, ly - ir * 0.4, ir * 0.22, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(lx - ir * 0.35 * side, ly + ir * 0.3, ir * 0.1, 0, TAU); ctx.fill();
  // the upper lid falls over the eye and casts a shadow on it
  const lidSkin = shade(o.skin, 0.06);
  ctx.beginPath(); ctx.moveTo(-w - 4, -h * 3); ctx.lineTo(w + 4, -h * 3); for (let i = N; i >= 0; i--) ctx.lineTo(LID[i][0], LID[i][1]); ctx.closePath();
  const lg = ctx.createLinearGradient(0, -open, 0, 0); lg.addColorStop(0, tint(lidSkin, 0.12)); lg.addColorStop(1, lidSkin); ctx.fillStyle = lg; ctx.fill();
  ctx.strokeStyle = 'rgba(30,10,20,0.35)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.save(); ctx.translate(0, 3); poly(ctx, LID); ctx.restore(); ctx.stroke();
  // the lower lid pushes up when the cheeks do
  if (sq > 0.02) { ctx.beginPath(); ctx.moveTo(-w - 4, h * 3); ctx.lineTo(w + 4, h * 3); for (let i = N; i >= 0; i--) ctx.lineTo(SQ[i][0], SQ[i][1]); ctx.closePath(); ctx.fillStyle = tint(o.skin, 0.05); ctx.fill(); }
  ctx.restore();
  // lash line along the lid, heavier at the outer corner
  ctx.strokeStyle = o.lash ?? '#2a1620'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = o.lashW ?? 4;
  ctx.beginPath(); poly(ctx, LID); ctx.stroke();
  if (o.lashes) { ctx.fillStyle = o.lash ?? '#2a1620'; ctx.beginPath(); ctx.moveTo(-w * 0.55, LID[3][1] - 1); ctx.quadraticCurveTo(-w * 1.05, LID[1][1] - 2, -w * 1.32, -open * 0.45 - 4); ctx.quadraticCurveTo(-w * 1.0, 1, -w * 0.6, LID[3][1] + 2.5); ctx.fill(); }
  // crease stays at the fold, so a heavy lid shows a wide band of skin
  ctx.strokeStyle = hexA(shade(o.skin, 0.5), 0.5); ctx.lineWidth = 1.8; ctx.beginPath(); poly(ctx, U.slice(2, N - 1).map(([a, b2]) => [a, b2 * 1.06 - 7 - open * 0.15])); ctx.stroke();
  ctx.strokeStyle = hexA(shade(o.skin, 0.45), 0.55); ctx.lineWidth = 1.5; ctx.beginPath(); poly(ctx, SQ.map(([a, b2]) => [a, b2 + 1.5])); ctx.stroke();
  if (sq > 0.4) { ctx.strokeStyle = hexA(shade(o.skin, 0.45), 0.35); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-w * 0.6, open * 0.9 + 6); ctx.quadraticCurveTo(0, open * 1.1 + 10, w * 0.5, open * 0.9 + 6); ctx.stroke(); }
  ctx.restore();
}
// a brow: a tapered stroke of hair, thick at the inner end
function brow(ctx, x, y, w, side, ex, o) {
  const up = (ex.lift + (ex.browUp && side > 0 ? 0.4 : 0)) * 18;
  const inner = ex.brow * 13, outer = -ex.brow * 4;
  const p0 = [x - side * w, y - up + inner], p1 = [x - side * w * 0.05, y - up - 7 + inner * 0.35], p2 = [x + side * w * 1.05, y - up + 3 + outer];
  const q = (t) => { const a = (1 - t) * (1 - t), b2 = 2 * (1 - t) * t, c = t * t; return [a * p0[0] + b2 * p1[0] + c * p2[0], a * p0[1] + b2 * p1[1] + c * p2[1]]; };
  const th = o.browW ?? 7, top = [], bot = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, [px, py] = q(t), k = th * (1 - t * 0.7); top.push([px, py - k * 0.55]); bot.push([px, py + k * 0.45]); }
  ctx.save(); ctx.fillStyle = o.brow ?? '#3a2018'; ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]); for (const p of top) ctx.lineTo(p[0], p[1]); for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = hexA(tint(o.brow ?? '#3a2018', 0.35), 0.5); ctx.lineWidth = 1; ctx.lineCap = 'round';
  for (let i = 1; i < 9; i += 2) { const [px, py] = q(i / 10); ctx.beginPath(); ctx.moveTo(px - side * 3, py + 2); ctx.lineTo(px + side * 5, py - 2); ctx.stroke(); }
  ctx.restore();
}
// mouth shapes, in units of the mouth's half width: corner heights, upper and lower lip curves, and whether it opens
const MOUTH = {
  flat: { cw: 1, cl: 0, cr: 0, top: 0.02, bot: 0.06 },
  smile: { cw: 1.08, cl: -0.3, cr: -0.3, top: 0.12, bot: 0.25 },
  grin: { cw: 1.2, cl: -0.42, cr: -0.42, top: 0.06, bot: 1.1, open: 1, tt: 1, tongue: 1 },
  smirk: { cw: 1.0, cl: 0.0, cr: -0.42, top: 0.1, bot: 0.18, dimple: 1 },
  frown: { cw: 0.92, cl: 0.34, cr: 0.3, top: -0.2, bot: -0.08, pout: 1 },
  pressed: { cw: 0.88, cl: 0.12, cr: 0.12, top: 0, bot: 0, thin: 1 },
  snarl: { cw: 1.12, cl: 0.2, cr: 0.24, top: -0.34, bot: 0.78, open: 1, tt: 1, tb: 1, crease: 1 },
  o: { cw: 0.5, cl: 0, cr: 0, top: -0.5, bot: 0.95, open: 1, round: 1 },
  grimace: { cw: 1.25, cl: 0.24, cr: 0.12, top: -0.12, bot: 0.5, open: 1, tt: 1, tb: 1, gaps: 1 },
};
function mouth(ctx, x, y, w, ex, o) {
  const m = MOUTH[ex.shape] ?? MOUTH.flat, W = w * m.cw;
  const L = [x - W, y + m.cl * w], R = [x + W, y + m.cr * w], ty = y + m.top * w, by = y + m.bot * w;
  const lip = o.lip ?? shade(mix(o.skin, '#c04050', 0.45), 0.1);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (m.open) {
    const path = (c) => { c.beginPath(); if (m.round) c.ellipse(x, (ty + by) / 2, W, (by - ty) / 2, 0, 0, TAU); else { c.moveTo(L[0], L[1]); c.quadraticCurveTo(x, 2 * ty - (L[1] + R[1]) / 2, R[0], R[1]); c.quadraticCurveTo(x, 2 * by - (L[1] + R[1]) / 2, L[0], L[1]); c.closePath(); } };
    path(ctx); ctx.fillStyle = '#2a0c16'; ctx.fill();
    ctx.save(); ctx.clip();
    if (m.tongue) { ctx.fillStyle = '#c0505a'; ctx.beginPath(); ctx.ellipse(x, by + 2, W * 0.6, (by - ty) * 0.35, 0, 0, TAU); ctx.fill(); }
    if (m.tt) { ctx.fillStyle = '#f6ece4'; ctx.fillRect(x - W, ty - w, W * 2, w + w * 0.3); }
    if (m.tb) { ctx.fillStyle = '#e8dcd4'; ctx.fillRect(x - W, by - w * 0.28, W * 2, w); }
    if (m.gaps || m.tb) { ctx.strokeStyle = 'rgba(60,30,40,0.35)'; ctx.lineWidth = 1.2; for (let i = -2; i <= 2; i++) { const gx = x + i * W * 0.32; ctx.beginPath(); ctx.moveTo(gx, ty - 4); ctx.lineTo(gx, by + 4); ctx.stroke(); } }
    const sh = ctx.createLinearGradient(0, ty - 4, 0, by); sh.addColorStop(0, 'rgba(20,0,10,0.45)'); sh.addColorStop(0.5, 'rgba(20,0,10,0)'); ctx.fillStyle = sh; ctx.fillRect(x - W, ty - 10, W * 2, by - ty + 20);
    ctx.restore();
    path(ctx); ctx.strokeStyle = shade(lip, 0.15); ctx.lineWidth = 2.6; ctx.stroke();
    blob(ctx, x, by + w * 0.32, W * 0.55, lip, 0.4); blob(ctx, x - 3, by + w * 0.26, W * 0.2, '#fff0e8', 0.22);
    if (m.crease) { ctx.strokeStyle = hexA(shade(o.skin, 0.5), 0.45); ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * W * 0.55, ty - w * 0.9); ctx.quadraticCurveTo(x + s * W * 1.15, ty - w * 0.2, x + s * W * 1.12, y + w * 0.5); ctx.stroke(); } }
  } else {
    const cy = 2 * ((ty + by) / 2) - (L[1] + R[1]) / 2;
    ctx.strokeStyle = shade(lip, 0.4); ctx.lineWidth = m.thin ? 2.6 : 3.4;
    ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.quadraticCurveTo(x, cy, R[0], R[1]); ctx.stroke();
    // lips as soft colour above and below the line
    blob(ctx, x, (ty + by) / 2 - w * 0.18, W * 0.6, lip, m.thin ? 0.15 : 0.28);
    blob(ctx, x, (ty + by) / 2 + w * (m.pout ? 0.42 : 0.32), W * (m.pout ? 0.62 : 0.5), lip, m.thin ? 0.2 : m.pout ? 0.55 : 0.38);
    blob(ctx, x - 3, (ty + by) / 2 + w * 0.3, W * 0.18, '#fff0e8', 0.2);
    if (m.pout) blob(ctx, x, (ty + by) / 2 + w * 0.95, W * 0.4, shade(o.skin, 0.5), 0.3);
  }
  // corners: creases when smiling, a dimple on a smirk
  if (m.cl < -0.2) { ctx.strokeStyle = hexA(shade(o.skin, 0.45), 0.45); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(L[0] - 5, L[1] - 4, 8, 0.9, 2.3); ctx.stroke(); }
  if (m.cr < -0.2) { ctx.strokeStyle = hexA(shade(o.skin, 0.45), 0.45); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(R[0] + 5, R[1] - 4, 8, 0.85, 2.25); ctx.stroke(); }
  if (m.cl > 0.2) { ctx.strokeStyle = hexA(shade(o.skin, 0.5), 0.35); ctx.lineWidth = 1.6; for (const [cx2, cy2, s] of [[L[0], L[1], -1], [R[0], R[1], 1]]) { ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2 + s * 4, cy2 + 8); ctx.stroke(); } }
  ctx.restore();
}
// a whole face. o: { cx, cy, w, h, skin, iris_c, brow, hairline?, jaw, nose, cheek, freckles, ... }
function face(ctx, o, ex) {
  const { cx, cy, w, h } = o;
  const jaw = o.jaw ?? 0.82;
  const build = (c) => curve(c, [[cx, cy - h], [cx + w * 0.82, cy - h * 0.78], [cx + w, cy - h * 0.2], [cx + w * 0.92, cy + h * 0.35], [cx + w * 0.55 * jaw, cy + h * 0.82], [cx, cy + h], [cx - w * 0.55 * jaw, cy + h * 0.82], [cx - w * 0.92, cy + h * 0.35], [cx - w, cy - h * 0.2], [cx - w * 0.82, cy - h * 0.78]]);
  part(ctx, build, { base: o.skin, box: [cx - w, cy - h, cx + w * 1.2, cy + h * 1.1], edge: w * 0.18, hl: [cx - w * 0.35, cy - h * 0.35, w * 0.9], hlA: 0.4, rim: o.rim, rimW: 4, rimA: 0.5, bounceA: 0.35 });
  // planes of the face: temple and cheekbone shadow on the far side, a lit forehead and cheek on the near side
  ctx.save(); ctx.beginPath(); build(ctx); ctx.clip();
  blob(ctx, cx + w * 0.82, cy - h * 0.1, w * 0.55, shade(o.skin, 0.55), 0.3);
  blob(ctx, cx + w * 0.55, cy + h * 0.5, w * 0.45, shade(o.skin, 0.5), 0.22);
  blob(ctx, cx - w * 0.5, cy + h * 0.12, w * 0.3, tint(o.skin, 0.5), 0.3);
  blob(ctx, cx, cy + h * 0.95, w * 0.5, mix(o.skin, ELEM, 0.6), 0.35);
  ctx.restore();
  const ck = 0.18 + (ex.cheek ?? 0) * 0.3 + (o.blush ?? 0);
  blob(ctx, cx - w * 0.55, cy + h * 0.22 - (ex.squint ?? 0) * 8, w * 0.4, o.cheek ?? '#e07070', ck);
  blob(ctx, cx + w * 0.55, cy + h * 0.22 - (ex.squint ?? 0) * 8, w * 0.4, o.cheek ?? '#e07070', ck * 0.8);
  if (o.freckles) { const r = prng(5); ctx.fillStyle = hexA(shade(o.skin, 0.35), 0.5); for (let i = 0; i < 18; i++) { const sx = (r() < 0.5 ? -1 : 1); ctx.beginPath(); ctx.arc(cx + sx * w * (0.3 + r() * 0.35), cy + h * (0.05 + r() * 0.25), 1.3 + r(), 0, TAU); ctx.fill(); } }
  // nose: a soft shadow down the far side, a lit bridge, nostrils
  const ny = cy + h * 0.3;
  blob(ctx, cx + w * 0.1, ny - h * 0.1, w * 0.16, shade(o.skin, 0.4), 0.28);
  ctx.strokeStyle = hexA(shade(o.skin, 0.5), 0.32); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx + w * 0.08, cy + h * 0.06); ctx.quadraticCurveTo(cx + w * 0.13, ny - 2, cx + w * 0.06, ny + 4); ctx.stroke();
  blob(ctx, cx - w * 0.04, ny - h * 0.06, w * 0.1, tint(o.skin, 0.7), 0.45);
  ctx.strokeStyle = hexA(shade(o.skin, 0.55), 0.45); ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(cx - w * 0.12, ny + 4); ctx.quadraticCurveTo(cx - w * 0.02, ny + 9, cx + w * 0.12, ny + 4); ctx.stroke();
  // eyes and brows
  const ey = cy - h * 0.08, ew = w * (o.eyeW ?? 0.28), eh = w * (o.eyeH ?? 0.185), ex0 = w * (o.eyeX ?? 0.43);
  const eo = { skin: o.skin, iris_c: o.iris_c ?? '#5a3a2a', lash: o.lash, lashes: o.lashes, white: o.white, glowEye: o.glowEye, closed: o.closed, iris: o.iris, tilt: o.tilt };
  eye(ctx, cx - ex0, ey, ew, eh, -1, ex, eo); eye(ctx, cx + ex0, ey, ew, eh, 1, ex, eo);
  if (o.brows !== false) {
    brow(ctx, cx - ex0, ey - eh * 2.3, ew * 1.05, -1, ex, o); brow(ctx, cx + ex0, ey - eh * 2.3, ew * 1.05, 1, ex, o);
    // a knit between the brows in anger, worry lines across the forehead in fear and sorrow
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = hexA(shade(o.skin, 0.5), 0.4); ctx.lineWidth = 2;
    if (ex.brow > 0.8) for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 7, ey - eh * 2.2); ctx.quadraticCurveTo(cx + s * 4, ey - eh * 3, cx + s * 8, ey - eh * 3.8); ctx.stroke(); }
    if (ex.brow < -0.8 && !o.noWorry) for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(cx - w * 0.3, ey - eh * (3.6 + i * 0.8)); ctx.quadraticCurveTo(cx, ey - eh * (4.3 + i * 0.8), cx + w * 0.3, ey - eh * (3.6 + i * 0.8)); ctx.stroke(); }
    ctx.restore();
  }
  mouth(ctx, cx + w * 0.02, cy + h * 0.56, w * (o.mouthW ?? 0.26), ex, o);
  // a tear on the near cheek; a bead of sweat at the temple
  if (ex.tear && !o.closed) { const tx = cx - ex0 - ew * 0.6, ty = ey + eh * 1.4; ctx.save(); ctx.strokeStyle = 'rgba(220,240,255,0.55)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx - 4, ty + 20, tx - 2, ty + 34); ctx.stroke(); ctx.fillStyle = 'rgba(230,246,255,0.9)'; ctx.beginPath(); ctx.ellipse(tx - 2, ty + 38, 4.5, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(tx - 3.5, ty + 36, 1.6, 0, TAU); ctx.fill(); ctx.restore(); }
  if (ex.sweat) { const tx = cx + w * 0.78, ty = cy - h * 0.45; ctx.save(); ctx.fillStyle = 'rgba(220,240,255,0.85)'; ctx.beginPath(); ctx.moveTo(tx, ty - 10); ctx.quadraticCurveTo(tx + 7, ty + 2, tx, ty + 7); ctx.quadraticCurveTo(tx - 7, ty + 2, tx, ty - 10); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx - 2, ty, 1.5, 0, TAU); ctx.fill(); ctx.restore(); }
  return build;
}

// ------------------------------------------------------------------ hands and props
// A painted hand in local space (palm about 60 across, wrist toward +y). pose: 'fist' grips a vertical shaft
// through x = 0, 'open' is palm up and cupped with something resting above at (0, -46), 'pinch' holds a thread
// between thumb and finger at (-4, -66). o: { color, rim, cuff, cuffRim, flip, nails }
function capsule(c, x0, y0, x1, y1, r0, r1 = r0) {
  const a = Math.atan2(y1 - y0, x1 - x0), q = Math.PI / 2;
  c.moveTo(x0 + Math.cos(a + q) * r0, y0 + Math.sin(a + q) * r0); c.arc(x1, y1, r1, a + q, a - q, true); c.arc(x0, y0, r0, a - q, a + q, true); c.closePath();
}
function hand(ctx, x, y, s, rot, pose, o) {
  const col = o.color, rim = o.rim ?? '#ffffff';
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s * (o.flip ? -1 : 1), s);
  const P0 = { base: col, edge: 6, rim, rimW: 3, rimA: 0.6, box: [-40, -70, 40, 40] };
  if (o.cuff) part(ctx, (c) => curve(c, [[-34, 26], [-30, 90], [30, 90], [34, 26], [0, 18]]), { base: o.cuff, edge: 8, rim: o.cuffRim ?? rim, rimW: 4, box: [-34, 18, 34, 90] });
  else part(ctx, (c) => capsule(c, 0, 30, 0, 80, 20, 22), { ...P0, box: [-22, 20, 22, 80] });
  if (pose === 'fist') {
    part(ctx, (c) => { c.roundRect ? c.roundRect(-28, -32, 56, 64, 16) : c.rect(-28, -32, 56, 64); }, P0);
    for (let i = 0; i < 4; i++) { const fy = -22 + i * 14.5; part(ctx, (c) => capsule(c, -24, fy, 22, fy + 1, 7.6, 7), { ...P0, edge: 3, hl: [10, fy - 3, 10], hlA: 0.6, box: [-24, fy - 8, 26, fy + 8] }); }
    part(ctx, (c) => capsule(c, -30, -16, 4, -36, 9, 7.5), { ...P0, edge: 3, hl: [-10, -30, 12], hlA: 0.6, box: [-34, -44, 8, -8] });
  } else if (pose === 'open') {
    part(ctx, (c) => c.ellipse(0, 0, 32, 26, 0, 0, TAU), P0);
    const F = [[-22, -14, -30, -48], [-8, -20, -10, -58], [7, -20, 9, -58], [21, -14, 30, -46]];
    for (const [ax, ay, bx, by] of F) part(ctx, (c) => capsule(c, ax, ay, bx, by, 8, 6.5), { ...P0, edge: 3, hl: [bx - 2, by + 6, 10], hlA: 0.5 });
    part(ctx, (c) => capsule(c, -28, 6, -50, -18, 9, 7), { ...P0, edge: 3 });
    // palm crease
    ctx.strokeStyle = hexA(shade(col, 0.5), 0.5); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-18, -2); ctx.quadraticCurveTo(0, 6, 22, -6); ctx.stroke();
  } else if (pose === 'pinch') {
    part(ctx, (c) => { c.roundRect ? c.roundRect(-26, -26, 52, 56, 16) : c.rect(-26, -26, 52, 56); }, P0);
    for (let i = 1; i < 4; i++) { const fy = -20 + i * 14; part(ctx, (c) => capsule(c, -20, fy, 22, fy + 1, 7, 6.5), { ...P0, edge: 3, box: [-24, fy - 8, 26, fy + 8] }); }
    part(ctx, (c) => capsule(c, 0, -22, -2, -64, 7.5, 6), { ...P0, edge: 3, hl: [-4, -56, 8], hlA: 0.6 });
    part(ctx, (c) => capsule(c, -28, -8, -10, -62, 9, 6.5), { ...P0, edge: 3, hl: [-20, -40, 10], hlA: 0.5 });
  }
  ctx.restore();
}
// where the held point of a pose lands in design space
function handPoint(x, y, s, rot, pose, flip) {
  const [lx, ly] = pose === 'open' ? [0, -78] : pose === 'pinch' ? [-6, -70] : [0, 0];
  const fx = lx * (flip ? -1 : 1) * s, fy = ly * s;
  return [x + fx * Math.cos(rot) - fy * Math.sin(rot), y + fx * Math.sin(rot) + fy * Math.cos(rot)];
}

// ------------------------------------------------------------------ backgrounds and finishing
function backdrop(ctx, color, o = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); // the backdrop never leans with the figure
  const g = ctx.createRadialGradient(256, 210, 20, 256, 256, 330);
  g.addColorStop(0, hexA(tint(color, 0.15), o.a ?? 0.55)); g.addColorStop(0.45, hexA(shade(color, 0.55), 0.55)); g.addColorStop(0.8, hexA(shade(color, 0.85), 0.35)); g.addColorStop(1, hexA(shade(color, 0.9), 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, D, D);
  const r = prng(o.seed ?? 1);
  for (let i = 0; i < (o.motes ?? 14); i++) glow(ctx, r() * D, r() * D * 0.8, 6 + r() * 16, tint(color, 0.4), 0.18 + r() * 0.2);
  ctx.restore();
}
let grain = null;
function finish(ctx, color) {
  if (!grain) { grain = mk(256, 256); const g = grain.getContext('2d'); const r = prng(9); for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,220,0.05)' : 'rgba(0,0,0,0.07)'; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1); } }
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(grain, 0, 0, D, D);
  // warm key light wash and coloured bounce from below-right
  const k = ctx.createLinearGradient(0, 0, D, D); k.addColorStop(0, 'rgba(255,220,170,0.10)'); k.addColorStop(1, hexA(color, 0.12)); ctx.fillStyle = k; ctx.fillRect(0, 0, D, D);
  // fade to transparent at the edges (an oval wider than tall, so hands and props at the lower corners stay)
  ctx.globalCompositeOperation = 'destination-in';
  ctx.translate(256, 250); ctx.scale(1.28, 1.12); ctx.translate(-256, -250);
  const m = ctx.createRadialGradient(256, 250, 215, 256, 262, 345); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = m; ctx.fillRect(-120, -60, D + 240, D + 120);
  ctx.restore();
}

// shoulders/bust silhouette helpers
const bust = (w, top, cx = 256) => { const f = (c) => curve(c, [[cx - w, D + 40], [cx - w * 0.98, top + 90], [cx - w * 0.7, top + 20], [cx - w * 0.3, top], [cx + w * 0.3, top], [cx + w * 0.7, top + 20], [cx + w * 0.98, top + 90], [cx + w, D + 40]]); f.fold = { w, top, cx }; return f; };
const neck = (ctx, skin, cx = 256, y0 = 300, w = 34, rim) => {
  part(ctx, (c) => { c.moveTo(cx - w * 0.85, y0 - 60); c.quadraticCurveTo(cx - w * 0.9, y0 + 10, cx - w * 1.35, y0 + 34); c.lineTo(cx + w * 1.35, y0 + 34); c.quadraticCurveTo(cx + w * 0.9, y0 + 10, cx + w * 0.85, y0 - 60); c.closePath(); }, { base: shade(skin, 0.1), edge: 10, rim, rimA: 0.35, box: [cx - w, y0 - 60, cx + w * 1.5, y0 + 40] });
  // shadow under the jaw and where the neck meets the collar
  const g = ctx.createLinearGradient(0, y0 - 60, 0, y0 + 34); g.addColorStop(0, hexA(shade(skin, 0.6), 0.55)); g.addColorStop(0.45, hexA(shade(skin, 0.6), 0)); g.addColorStop(1, hexA(shade(skin, 0.7), 0.5));
  ctx.save(); ctx.beginPath(); ctx.moveTo(cx - w * 0.85, y0 - 60); ctx.quadraticCurveTo(cx - w * 0.9, y0 + 10, cx - w * 1.35, y0 + 34); ctx.lineTo(cx + w * 1.35, y0 + 34); ctx.quadraticCurveTo(cx + w * 0.9, y0 + 10, cx + w * 0.85, y0 - 60); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
};

// ------------------------------------------------------------------ the cast
const P = {};

// ---------------------------------------------------------------- Iri
P.iri = (ctx, ex) => {
  const skin = '#f3cfae', cloak = '#9b2244';
  backdrop(ctx, '#f2c46b', { seed: 2 });
  // hood back and cloak
  part(ctx, bust(200, 330), { base: cloak, rim: '#ffb0a0', edge: 30, hl: [170, 380, 120] });
  part(ctx, (c) => curve(c, [[256, 70], [350, 100], [392, 200], [390, 320], [350, 400], [256, 420], [162, 400], [122, 320], [120, 200], [162, 100]]), { base: cloak, rim: '#ffb0a0', edge: 34, hl: [190, 140, 130], rimW: 8 });
  // hood opening (dark inside)
  part(ctx, (c) => curve(c, [[256, 118], [330, 140], [358, 220], [350, 310], [256, 360], [162, 310], [154, 220], [182, 140]]), { base: '#2a0d1c', edge: 30, rim: null, lightA: 0.1 });
  // hair fringe
  neck(ctx, skin, 256, 330, 30);
  const fb = face(ctx, { cx: 256, cy: 238, w: 84, h: 98, skin, iris_c: '#7a4a2a', brow: '#5a2a1a', lash: '#2a1018', lashes: true, freckles: true, rim: '#ffd27a', cheek: '#f08070' }, ex);
  part(ctx, (c) => curve(c, [[170, 190], [200, 140], [256, 128], [318, 140], [346, 196], [320, 176], [292, 186], [262, 168], [236, 186], [206, 176]]), { base: '#6a2a1a', edge: 8, hl: [230, 150, 50], rim: '#ffd27a', rimW: 3, tex: (c) => { strands(c, [[180, 180], [230, 140], [300, 150], [340, 190]], 70, 34, '#c07040', 1.5, 3, 0.55); strands(c, [[196, 160], [246, 142], [300, 150]], 18, 10, '#ffc890', 1.2, 4, 0.6); } });
  // golden scarf around the neck, trailing
  part(ctx, (c) => curve(c, [[150, 360], [256, 400], [362, 362], [372, 400], [256, 450], [140, 404]]), { base: '#f2a93b', rim: '#fff0b0', edge: 14, hl: [210, 380, 80], hlA: 0.7 });
  part(ctx, (c) => curve(c, [[330, 400], [380, 420], [440, 470], [470, 520], [420, 520], [370, 470], [320, 440]]), { base: '#ff9a3a', rim: '#fff0b0', edge: 12 });
  thread(ctx, [[150, 380], [256, 422], [362, 382]], '#ffe19a', 2, 0.7);
  thread(ctx, [[340, 420], [400, 450], [455, 510]], '#ffe19a', 1.6, 0.6);
  // gold trim on the hood edge
  ctx.save(); ctx.strokeStyle = '#f2c46b'; ctx.lineWidth = 4; ctx.beginPath(); curve(ctx, [[256, 118], [330, 140], [358, 220], [350, 310]], false); ctx.stroke(); ctx.restore();
  // her hand, holding up the golden thread she follows home
  const [px, py] = handPoint(132, 448, 1.05, -0.22, 'pinch');
  thread(ctx, [[px + 6, py + 90], [px, py], [px - 16, py - 60], [px + 12, py - 120], [px - 14, py - 190], [px - 44, py - 250]], '#ffd27a', 2.4, 0.95);
  hand(ctx, 132, 448, 1.05, -0.22, 'pinch', { color: skin, rim: '#ffd27a', cuff: cloak, cuffRim: '#ffb0a0' });
  glow(ctx, px, py, 30, '#fff0b0', 0.85);
  return fb;
};

// ---------------------------------------------------------------- Orrin, the Moth Archivist
P.orrin = (ctx, ex) => {
  backdrop(ctx, '#c9a76a', { seed: 3 });
  const fur = '#d9c49a', robe = '#5a3a24';
  // huge soft wings behind
  const wing = (s) => (c) => { c.save(); c.translate(256, 0); c.scale(s, 1); c.translate(-256, 0); curve(c, [[262, 230], [330, 120], [440, 60], [520, 90], [520, 230], [470, 300], [500, 400], [440, 470], [330, 420], [270, 330]]); c.restore(); };
  for (const s of [1, -1]) {
    part(ctx, wing(s), { base: '#8a6a48', rim: '#f2d8a0', edge: 40, hl: [256 + s * 150, 150, 120], hlA: 0.35, tex: (c) => {
      for (let i = 0; i < 6; i++) { c.strokeStyle = hexA('#3a2414', 0.25); c.lineWidth = 3; c.beginPath(); c.moveTo(256 + s * 20, 250); c.quadraticCurveTo(256 + s * (100 + i * 30), 140 + i * 30, 256 + s * (200 + i * 30), 90 + i * 60); c.stroke(); }
      // eye spot
      const x = 256 + s * 175, y = 175; c.fillStyle = '#3a2414'; c.beginPath(); c.ellipse(x, y, 34, 28, 0, 0, TAU); c.fill(); c.fillStyle = '#e8b860'; c.beginPath(); c.ellipse(x, y, 24, 19, 0, 0, TAU); c.fill(); c.fillStyle = '#2a1408'; c.beginPath(); c.ellipse(x + s * 3, y, 11, 10, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,250,230,0.8)'; c.beginPath(); c.arc(x - 4, y - 5, 4, 0, TAU); c.fill();
      const x2 = 256 + s * 160, y2 = 370; c.fillStyle = hexA('#3a2414', 0.6); c.beginPath(); c.ellipse(x2, y2, 22, 18, 0, 0, TAU); c.fill(); c.fillStyle = hexA('#d8a860', 0.8); c.beginPath(); c.ellipse(x2, y2, 12, 10, 0, 0, TAU); c.fill();
      strands(c, [[256 + s * 260, 80], [256 + s * 250, 300], [256 + s * 220, 460]], 30, 30, '#f0dcb0', 1.2, 4 + s, 0.25);
    } });
  }
  // robe, ink-stained
  part(ctx, bust(170, 330), { base: robe, rim: '#e8c890', edge: 26, hl: [180, 380, 120], tex: (c) => { c.fillStyle = 'rgba(20,14,40,0.55)'; for (const [x, y, r] of [[300, 430, 14], [318, 450, 7], [200, 470, 10], [330, 400, 5]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); } strands(c, [[150, 360], [160, 512]], 10, 60, '#2a1a10', 2, 6, 0.3); } });
  // fluffy ruff
  const ruff = (c) => { const pts = []; for (let i = 0; i <= 16; i++) { const a = Math.PI * (0.05 + 0.9 * (i / 16)); const r = 140 + (i % 2) * 18; pts.push([256 + Math.cos(a) * r, 300 + Math.sin(a) * r * 0.45]); } curve(c, [[110, 300], ...pts.reverse(), [402, 300], [256, 260]]); };
  part(ctx, ruff, { base: '#efe2c4', edge: 18, hl: [210, 330, 90], rim: '#fff4d8', tex: (c) => strands(c, [[150, 320], [256, 350], [362, 320]], 60, 50, '#ffffff', 1.4, 8, 0.35) });
  // head: fuzzy, broad
  const head = (c) => curve(c, [[256, 120], [330, 140], [360, 210], [345, 285], [300, 320], [256, 328], [212, 320], [167, 285], [152, 210], [182, 140]]);
  part(ctx, head, { base: fur, edge: 26, hl: [215, 170, 90], rim: '#fff0c8', tex: (c) => strands(c, [[180, 150], [256, 130], [330, 150]], 50, 120, '#fff4dc', 1.2, 10, 0.3) });
  // antennae (feathery)
  for (const s of [-1, 1]) {
    ctx.save(); ctx.strokeStyle = '#6a4a28'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const pts = [[256 + s * 30, 130], [256 + s * 60, 70], [256 + s * 110, 34], [256 + s * 150, 30]];
    ctx.beginPath(); curve(ctx, pts, false); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = hexA('#8a6a48', 0.8);
    for (let i = 1; i < 12; i++) { const t = i / 12; const x = 256 + s * (30 + t * 120), y = 130 - t * 95 + t * t * 0; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 10, y - 14); ctx.moveTo(x, y); ctx.lineTo(x - s * 4, y - 16); ctx.stroke(); }
    ctx.restore();
  }
  // brow tufts (move with mood)
  for (const s of [-1, 1]) {
    const up = ex.lift * 14 + (ex.browUp && s > 0 ? 6 : 0), inn = ex.brow * 10;
    part(ctx, (c) => curve(c, [[256 + s * 22, 178 + inn - up], [256 + s * 60, 160 - up], [256 + s * 98, 168 - up - ex.brow * 3], [256 + s * 70, 182 - up], [256 + s * 30, 190 + inn - up]]), { base: '#f6ecd0', edge: 4, rim: null });
  }
  // big round black eyes (lids drop with mood)
  for (const s of [-1, 1]) {
    const x = 256 + s * 56, y = 222, r = 34;
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    const g = ctx.createRadialGradient(x - 10, y - 12, 4, x, y, r); g.addColorStop(0, '#3a3048'); g.addColorStop(1, '#06040a'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    glow(ctx, x - 12, y - 12, 16, '#fff8e0', 0.9); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x - 12 + ex.look[0] * 6, y - 13, 6, 0, TAU); ctx.fill();
    // lid: fur colour from the top
    const lid = (1 - Math.min(1.2, ex.eye)) * r * 1.6;
    const tilt = ex.brow * 0.25 * -s;
    if (lid > 0) { ctx.translate(x, y); ctx.rotate(tilt); ctx.fillStyle = shade(fur, 0.15); ctx.fillRect(-r, -r - 2, r * 2, lid + 2); ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r, -r + lid); ctx.lineTo(r, -r + lid); ctx.stroke(); }
    if (ex.smile > 0.6) { ctx.setTransform(1, 0, 0, 1, 0, 0); }
    ctx.restore();
    if (ex.smile > 0.6) { ctx.save(); ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(x, y + r + 6, r * 1.1, r * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  }
  // round spectacles
  ctx.save(); ctx.strokeStyle = '#c9a050'; ctx.lineWidth = 4;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(256 + s * 56, 222, 42, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(240, 214); ctx.quadraticCurveTo(256, 204, 272, 214); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,250,220,0.5)'; ctx.lineWidth = 3; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(256 + s * 56, 222, 36, 3.6, 4.4); ctx.stroke(); }
  ctx.restore();
  // small mouth (proboscis curl)
  ctx.save(); ctx.strokeStyle = '#5a4028'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(240, 290 - ex.smile * 4); ctx.quadraticCurveTo(256, 292 + ex.smile * 8 + ex.open * 8, 272, 290 - ex.smile * 4 - (ex.smirk ?? 0) * 6); ctx.stroke(); ctx.restore();
  // quill in hand and an open book at the bottom edge
  part(ctx, (c) => { c.moveTo(120, 512); c.lineTo(160, 440); c.lineTo(256, 462); c.lineTo(352, 440); c.lineTo(392, 512); c.closePath(); }, { base: '#efe4c8', edge: 6, rim: null, tex: (c) => { c.strokeStyle = 'rgba(60,40,30,0.35)'; c.lineWidth = 1.5; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(180, 470 + i * 7); c.lineTo(245, 480 + i * 7); c.moveTo(267, 480 + i * 7); c.lineTo(335, 470 + i * 7); c.stroke(); } } });
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#2a1a30'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(350, 486); ctx.lineTo(436, 300); ctx.stroke(); ctx.restore();
  blob(ctx, 350, 488, 8, '#1a0e2a', 0.9);
  part(ctx, (c) => curve(c, [[430, 312], [450, 250], [480, 196], [476, 240], [452, 300]]), { base: '#f6f0e0', edge: 4, rim: '#ffffff', rimW: 3, box: [420, 190, 482, 320], tex: (c) => { strands(c, [[436, 306], [462, 240], [478, 200]], 16, 18, '#c8b890', 1, 61, 0.6); } });
  hand(ctx, 372, 440, 0.95, 0.43, 'fist', { color: '#cdb486', rim: '#fff0c8', cuff: '#5a3a24', cuffRim: '#e8c890' });
};

// ---------------------------------------------------------------- Sir Thimbleby
P.thimbleby = (ctx, ex) => {
  backdrop(ctx, '#d9dde6', { seed: 4 });
  const silver = '#b8c0cc';
  const dimples = (cx, cy, w, h) => (c) => { const r = prng(cx + cy); for (let y = cy - h; y < cy + h; y += 11) for (let x = cx - w; x < cx + w; x += 11) { const o = ((y / 11) | 0) % 2 ? 5.5 : 0; c.fillStyle = 'rgba(40,46,60,0.32)'; c.beginPath(); c.arc(x + o, y, 3, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(x + o - 1, y - 1, 1.2, 0, TAU); c.fill(); } };
  // body: stacked thimbles
  for (let i = 0; i < 2; i++) { const y = 420 + i * 70, w = 150 + i * 20; part(ctx, (c) => { c.moveTo(256 - w, y + 80); c.lineTo(256 - w + 20, y - 10); c.quadraticCurveTo(256, y - 30, 256 + w - 20, y - 10); c.lineTo(256 + w, y + 80); c.closePath(); }, { base: silver, rim: '#ffffff', edge: 16, hl: [190, y + 10, 80], hlA: 0.7, tex: dimples(256, y + 30, w - 20, 40) }); }
  // button shield at the side
  part(ctx, (c) => { c.arc(110, 440, 70, 0, TAU); }, { base: '#c03040', rim: '#ffb0b0', edge: 14, hl: [90, 415, 40], hlA: 0.6, tex: (c) => { c.fillStyle = '#5a1018'; for (const [x, y] of [[95, 425], [125, 425], [95, 455], [125, 455]]) { c.beginPath(); c.arc(x, y, 7, 0, TAU); c.fill(); } c.strokeStyle = 'rgba(255,200,200,0.5)'; c.lineWidth = 3; c.beginPath(); c.arc(110, 440, 56, 0, TAU); c.stroke(); } });
  // needle lance
  ctx.save(); const lg = ctx.createLinearGradient(420, 520, 470, 40); lg.addColorStop(0, '#8090a0'); lg.addColorStop(1, '#ffffff'); ctx.strokeStyle = lg; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(410, 520); ctx.lineTo(470, 40); ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(406, 520); ctx.lineTo(466, 44); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.strokeStyle = '#2a3040'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(462, 110, 4, 12, 0.12, 0, TAU); ctx.stroke(); ctx.restore(); glow(ctx, 470, 44, 30, '#ffffff', 0.7);
  hand(ctx, 425, 400, 0.95, 0.124, 'fist', { color: '#c8d0dc', rim: '#ffffff', cuff: '#a8b0bc' });
  // head: a big thimble helm
  const helm = (c) => { c.moveTo(150, 360); c.lineTo(166, 150); c.quadraticCurveTo(170, 96, 256, 92); c.quadraticCurveTo(342, 96, 346, 150); c.lineTo(362, 360); c.quadraticCurveTo(256, 384, 150, 360); c.closePath(); };
  part(ctx, helm, { base: silver, rim: '#ffffff', edge: 22, hl: [205, 170, 100], hlA: 0.75, tex: dimples(256, 220, 92, 130) });
  // rolled rim
  part(ctx, (c) => { c.ellipse(256, 352, 112, 22, 0, 0, TAU); }, { base: '#a8b0bc', edge: 8, hl: [210, 344, 60], hlA: 0.8, rim: '#ffffff' });
  // plume
  part(ctx, (c) => curve(c, [[250, 96], [230, 50], [270, 14], [340, 20], [380, 60], [340, 46], [300, 52], [280, 80]]), { base: '#c0283a', edge: 10, hl: [280, 36, 50], rim: '#ffb0a0', tex: (c) => strands(c, [[250, 90], [270, 30], [360, 40]], 30, 26, '#ff8090', 1.4, 12, 0.5) });
  // visor opening with face: two bright button eyes and a thread moustache
  part(ctx, (c) => { c.roundRect ? c.roundRect(176, 196, 160, 96, 30) : c.rect(176, 196, 160, 96); }, { base: '#1a1c2a', edge: 14, rim: null, lightA: 0 });
  for (const s of [-1, 1]) {
    const x = 256 + s * 40, y = 234 - ex.lift * 4;
    const open = Math.min(1.25, ex.eye);
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, 18, 18 * open, 0, 0, TAU); ctx.fillStyle = '#f4f0e6'; ctx.fill(); ctx.clip();
    ctx.fillStyle = '#2a3a70'; ctx.beginPath(); ctx.arc(x + ex.look[0] * 5, y + 2, 10, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - 3, y - 3, 3.4, 0, TAU); ctx.fill();
    if (ex.smile > 0.6) { ctx.fillStyle = '#1a1c2a'; ctx.beginPath(); ctx.ellipse(x, y + 16, 20, 10, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    // brow plate
    ctx.save(); ctx.strokeStyle = '#d0d6e0'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - s * 22, y - 24 + ex.brow * 8 - ex.lift * 8); ctx.lineTo(x + s * 20, y - 28 - ex.brow * 3 - ex.lift * 8 - (ex.browUp && s > 0 ? 6 : 0)); ctx.stroke(); ctx.restore();
  }
  // moustache of red thread
  const my = 270 - ex.smile * 6;
  for (const s of [-1, 1]) part(ctx, (c) => curve(c, [[256, my - 4], [256 + s * 30, my - 10 - ex.smile * 6], [256 + s * 60, my - 6 - ex.smile * 10 + ex.brow * (s > 0 ? 0 : 0)], [256 + s * 68, my - 16 - ex.smile * 12], [256 + s * 54, my + 6], [256 + s * 26, my + 6]]), { base: '#d8d0c0', edge: 4, rim: null, tex: (c) => strands(c, [[256, my], [256 + s * 60, my - 6]], 10, 8, '#ffffff', 1, 13 + s, 0.4) });
  if (ex.open > 0.2) { ctx.fillStyle = '#3a1220'; ctx.beginPath(); ctx.ellipse(256, my + 14, 14, 8 * ex.open + 2, 0, 0, TAU); ctx.fill(); }
};

// ---------------------------------------------------------------- Pell, the Button Fox
P.pell = (ctx, ex) => {
  backdrop(ctx, '#e0773a', { seed: 5 });
  const fur = '#c8622a', cream = '#f6e4c8', coat = '#5a2a6a';
  // pack straps and coat with glowing buttons
  part(ctx, bust(190, 330), { base: coat, rim: '#d0a0ff', edge: 28, hl: [170, 380, 110], tex: (c) => {
    c.strokeStyle = 'rgba(30,10,40,0.5)'; c.lineWidth = 16; c.beginPath(); c.moveTo(150, 340); c.lineTo(200, 512); c.moveTo(362, 340); c.lineTo(312, 512); c.stroke();
    const r = prng(7); const cols = ['#ffd27a', '#8ff5b0', '#5ec8ff', '#ff8ad8', '#ffffff', '#ffb347'];
    for (let i = 0; i < 16; i++) { const x = 90 + r() * 330, y = 370 + r() * 140; const col = cols[i % cols.length]; c.fillStyle = shade(col, 0.2); c.beginPath(); c.arc(x, y, 9 + r() * 5, 0, TAU); c.fill(); c.fillStyle = 'rgba(0,0,0,0.4)'; for (const [dx, dy] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) { c.beginPath(); c.arc(x + dx, y + dy, 1.3, 0, TAU); c.fill(); } glow(c, x, y, 24, col, 0.35); }
  } });
  // chest ruff
  part(ctx, (c) => curve(c, [[200, 300], [256, 290], [312, 300], [330, 360], [290, 420], [256, 440], [222, 420], [182, 360]]), { base: cream, edge: 14, hl: [230, 330, 60], rim: '#ffffff', tex: (c) => strands(c, [[210, 320], [256, 400], [300, 320]], 30, 40, '#ffffff', 1.2, 15, 0.4) });
  // ears (droop when sad)
  const droop = ex.brow < -0.5 ? 0.5 : ex.brow > 0.6 ? -0.15 : 0;
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(256 + s * 78, 140); ctx.rotate(s * (0.2 + droop));
    part(ctx, (c) => curve(c, [[-34, 20], [-12, -90], [6, -110], [34, 20]]), { base: fur, edge: 10, rim: '#ffd0a0', box: [-40, -110, 40, 20] });
    part(ctx, (c) => curve(c, [[-20, 12], [-6, -70], [4, -84], [20, 12]]), { base: '#3a1a20', edge: 6, rim: null, box: [-40, -110, 40, 20] });
    ctx.restore();
  }
  // head
  const head = (c) => curve(c, [[256, 118], [320, 132], [356, 186], [370, 250], [330, 288], [290, 318], [256, 340], [222, 318], [182, 288], [142, 250], [156, 186], [192, 132]]);
  part(ctx, head, { base: fur, edge: 24, hl: [210, 170, 90], rim: '#ffd0a0', tex: (c) => strands(c, [[180, 160], [256, 130], [330, 160]], 40, 100, '#f09050', 1.3, 16, 0.35) });
  // cream mask and muzzle
  part(ctx, (c) => curve(c, [[256, 210], [300, 230], [350, 262], [320, 300], [256, 340], [192, 300], [162, 262], [212, 230]]), { base: cream, edge: 12, hl: [240, 260, 60], rim: null });
  // nose
  part(ctx, (c) => curve(c, [[256, 262], [276, 268], [266, 284], [256, 288], [246, 284], [236, 268]]), { base: '#2a1418', edge: 3, hl: [250, 268, 8], hlA: 0.9, rim: null });
  // mouth
  ctx.save(); ctx.strokeStyle = '#3a1a20'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const sm = ex.smile, sk = ex.smirk ?? 0;
  ctx.beginPath(); ctx.moveTo(256, 288); ctx.lineTo(256, 300); ctx.moveTo(226, 300 - sm * 10); ctx.quadraticCurveTo(242, 312 + sm * 6, 256, 300); ctx.quadraticCurveTo(270, 312 + sm * 6, 288, 300 - sm * 10 - sk * 8); ctx.stroke();
  if (ex.open > 0.1) { ctx.fillStyle = '#3a1220'; ctx.beginPath(); ctx.ellipse(256, 312, 16, 6 + ex.open * 10, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e06070'; ctx.beginPath(); ctx.ellipse(256, 316 + ex.open * 4, 9, 4, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  // whisker dots
  ctx.fillStyle = 'rgba(60,30,30,0.5)'; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(256 + s * (26 + i * 8), 282 + i * 4, 1.6, 0, TAU); ctx.fill(); }
  // button eyes: one green, one blue, stitched on
  for (const s of [-1, 1]) {
    const x = 256 + s * 52, y = 212 - ex.lift * 4, col = s < 0 ? '#3aa05a' : '#3a70d0';
    const sq = ex.eye < 0.75 ? 0.75 : Math.min(1.2, ex.eye);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, sq);
    part(ctx, (c) => c.arc(0, 0, 22, 0, TAU), { base: col, edge: 6, hl: [-7, -8, 14], hlA: 0.8, rim: tint(col, 0.6), rimW: 3, box: [-22, -22, 22, 22] });
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { ctx.beginPath(); ctx.arc(dx, dy, 3, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#e8d8b0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke();
    ctx.restore();
    // fur brow above each button
    ctx.save(); ctx.strokeStyle = '#8a3a14'; ctx.lineWidth = 6; ctx.lineCap = 'round'; const up = ex.lift * 12 + (ex.browUp && s > 0 ? 8 : 0);
    ctx.beginPath(); ctx.moveTo(x - s * 22, y - 30 + ex.brow * 8 - up); ctx.quadraticCurveTo(x, y - 40 - up, x + s * 24, y - 34 - ex.brow * 4 - up); ctx.stroke(); ctx.restore();
  }
  // a paw held up with a button in it, to show you
  hand(ctx, 104, 452, 1, -0.12, 'open', { color: '#d07038', rim: '#ffd0a0', cuff: coat, cuffRim: '#d0a0ff' });
  const [bx, by] = handPoint(104, 452, 1, -0.12, 'open');
  glow(ctx, bx, by, 44, '#8ff5b0', 0.6);
  part(ctx, (c) => c.arc(bx, by, 22, 0, TAU), { base: '#3ab070', edge: 5, hl: [bx - 7, by - 8, 14], hlA: 0.9, rim: '#d0ffe0', rimW: 3, box: [bx - 22, by - 22, bx + 22, by + 22] });
  ctx.fillStyle = 'rgba(0,30,10,0.55)'; for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { ctx.beginPath(); ctx.arc(bx + dx, by + dy, 3, 0, TAU); ctx.fill(); }
};

// ---------------------------------------------------------------- Nell Halfspun
P.nell = (ctx, ex) => {
  backdrop(ctx, '#9fd8e8', { seed: 6 });
  const skin = '#f0d8c8';
  const lay = mk(D, D), g = lay.getContext('2d');
  // painted on a layer so it can fray and fade
  neck(g, skin, 256, 330, 26, '#d0f4ff');
  part(g, bust(150, 340), { base: '#6a8aa0', rim: '#d0f4ff', edge: 24, hl: [180, 380, 100], tex: (c) => { c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 3; c.beginPath(); c.moveTo(200, 360); c.quadraticCurveTo(256, 400, 312, 360); c.stroke(); } });
  // hair back
  part(g, (c) => curve(c, [[256, 100], [340, 120], [372, 200], [370, 300], [340, 340], [300, 300], [212, 300], [172, 340], [142, 300], [140, 200], [172, 120]]), { base: '#7a4a30', edge: 20, rim: '#d0f4ff', hl: [210, 150, 80] });
  face(g, { cx: 256, cy: 236, w: 80, h: 94, skin, iris_c: '#4a7a9a', brow: '#5a3020', lash: '#2a1818', lashes: true, freckles: true, rim: '#d0f4ff', cheek: '#e88080' }, ex);
  // bob fringe
  part(g, (c) => curve(c, [[166, 230], [170, 160], [220, 128], [300, 128], [346, 168], [350, 232], [330, 190], [300, 176], [262, 186], [230, 172], [196, 190]]), { base: '#7a4a30', edge: 10, hl: [230, 146, 60], rim: '#d0f4ff', tex: (c) => strands(c, [[180, 200], [240, 140], [330, 170]], 30, 30, '#c08060', 1.4, 18, 0.5) });
  // fray: erase the lower right into threads
  g.save(); g.globalCompositeOperation = 'destination-out';
  const fr = g.createLinearGradient(290, 300, 470, 500); fr.addColorStop(0, 'rgba(0,0,0,0)'); fr.addColorStop(0.35, 'rgba(0,0,0,0.45)'); fr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fr; g.fillRect(0, 0, D, D);
  const r = prng(31); g.lineCap = 'round'; for (let i = 0; i < 46; i++) { const x = 300 + r() * 200, y = 330 + r() * 180; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1 + r() * 2.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 30, y + 4, x + 60 + r() * 40, y + 14 + r() * 20); g.stroke(); }
  g.restore();
  ctx.drawImage(lay, 0, 0);
  // her hand, holding her ribbon: the one thing she brought from the waking world
  const [rx, ry] = handPoint(156, 446, 0.95, -0.15, 'pinch');
  part(ctx, (c) => curve(c, [[rx - 4, ry], [rx - 30, ry + 40], [rx - 10, ry + 90], [rx - 40, ry + 150], [rx - 22, ry + 150], [rx + 8, ry + 92], [rx - 12, ry + 40], [rx + 6, ry]]), { base: '#d04060', edge: 5, rim: '#ffd0e0', rimW: 3, hl: [rx - 20, ry + 50, 30], hlA: 0.6, box: [rx - 40, ry, rx + 10, ry + 150] });
  hand(ctx, 156, 446, 0.95, -0.15, 'pinch', { color: skin, rim: '#d0f4ff', cuff: '#6a8aa0', cuffRim: '#d0f4ff' });
  // loose threads trailing away
  const rr = prng(32);
  for (let i = 0; i < 16; i++) { const x = 290 + rr() * 110, y = 260 + rr() * 200; thread(ctx, [[x, y], [x + 40 + rr() * 30, y + 10 + rr() * 30], [x + 90 + rr() * 60, y + 30 + rr() * 50]], '#bff0ff', 1, 0.5); }
};

// ---------------------------------------------------------------- the Weaver
P.weaver = (ctx, ex) => {
  backdrop(ctx, '#f6e7c1', { seed: 7, motes: 26 });
  const skin = '#f2e4d4';
  // hair of every coloured thread, flowing out
  const cols = ['#ffc35a', '#5ec8ff', '#a6f6ff', '#c8a27a', '#b07cff', '#8ff5b0', '#ff8aa0'];
  const r = prng(41);
  for (let i = 0; i < 60; i++) { const a = Math.PI * (0.85 + r() * 1.3), L = 200 + r() * 120; const x0 = 256 + Math.cos(a) * 80, y0 = 210 + Math.sin(a) * 90; thread(ctx, [[x0, y0], [256 + Math.cos(a) * (L * 0.6), 210 + Math.sin(a) * L * 0.4 + 60], [256 + Math.cos(a) * L, 260 + Math.sin(a) * L * 0.3 + 200]], cols[i % cols.length], 1.1, 0.45); }
  neck(ctx, skin, 256, 330, 30, '#ffffff');
  part(ctx, bust(190, 340), { base: '#e8dcc8', rim: '#ffffff', edge: 30, hl: [190, 380, 140], hlA: 0.6, tex: (c) => strands(c, [[120, 360], [256, 420], [392, 360]], 30, 120, '#ffffff', 1.4, 42, 0.3) });
  const awake = ex.smile > 0.3 || ex.eye > 1.1;
  face(ctx, { cx: 256, cy: 230, w: 84, h: 102, skin, iris_c: '#c09040', brow: '#b09070', lash: '#6a4a40', rim: '#ffffff', cheek: '#e8a0a0', closed: !awake, glowEye: awake ? '#ffd27a' : null, jaw: 0.75, eyeH: 0.14 }, { ...ex, eye: awake ? Math.min(ex.eye, 0.8) : 0 });
  // circlet of starlight
  for (let i = 0; i < 9; i++) { const a = Math.PI * (1.15 + i * 0.0875); const x = 256 + Math.cos(a) * 100, y = 240 + Math.sin(a) * 120; glow(ctx, x, y, 18, '#fff4d0', 0.8); }
  // hair crown
  part(ctx, (c) => curve(c, [[256, 118], [330, 130], [356, 200], [340, 180], [300, 150], [256, 146], [212, 150], [172, 180], [156, 200], [182, 130]]), { base: '#d8c8a8', edge: 10, rim: '#ffffff', hl: [230, 130, 60] });
  // a ball of every thread, glowing on her open palm
  hand(ctx, 122, 446, 1, -0.1, 'open', { color: skin, rim: '#ffffff', cuff: '#e8dcc8' });
  { const [bx, by] = handPoint(122, 446, 1, -0.1, 'open'); glow(ctx, bx, by, 60, '#fff2c8', 0.8); const rb = prng(44); for (let i = 0; i < 16; i++) { const a0 = rb() * TAU; ctx.save(); ctx.translate(bx, by); ctx.rotate(a0); thread(ctx, [[-22, -6], [0, -24 + rb() * 10], [22, -4]], cols[i % cols.length], 1.2, 0.8); ctx.restore(); } }
  // the veil over everything
  ctx.save(); for (let i = 0; i < 7; i++) { const x = 40 + i * 72; const g = ctx.createLinearGradient(x, 0, x + 60, 0); g.addColorStop(0, 'rgba(255,248,230,0)'); g.addColorStop(0.5, 'rgba(255,248,230,0.13)'); g.addColorStop(1, 'rgba(255,248,230,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 40, 256, x + 10, D); ctx.lineTo(x + 70, D); ctx.quadraticCurveTo(x + 100, 256, x + 60, 0); ctx.fill(); } ctx.restore();
};

// ---------------------------------------------------------------- Sable (masked) and Sable (unmasked)
// Matches render/actors/bosses/sable.js: a porcelain mask split by one red slit, stitched across; black thread
// for hair; a narrow cuirass of black thread; a long needle with a red thread through its eye. Unmasked he is
// Iri's dark mirror: a black hood lined with violet, magenta eyes, thread tear-tracks and a black scarf.
const SC = { ink: '#07040c', coat: '#161021', coat2: '#221a33', hi: '#3a2f55', edge: '#5a4688', thread: '#8a4dff', threadHi: '#c9a6ff', magenta: '#ff4fd8', red: '#ff3d5e', redHi: '#ffd0d8', porcelain: '#f1ebf4', porcelain2: '#b9aeca', faceSh: '#6e6088', lining: '#3b1d6e' };
function sableBody(ctx, seed) {
  const r = prng(seed);
  // black thread hair, falling behind the shoulders
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < 80; i++) { const x = 168 + r() * 176, L = 220 + r() * 170, sw = (r() - 0.5) * 120; ctx.strokeStyle = r() < 0.7 ? SC.ink : SC.hi; ctx.lineWidth = 2 + r() * 4; ctx.beginPath(); curve(ctx, [[x, 130 + r() * 30], [x + sw * 0.3 + (x - 256) * 0.45, 270], [x + sw + (x - 256) * 1.0, 140 + L]], false); ctx.stroke(); }
  ctx.restore();
  for (let i = 0; i < 14; i++) { const x = 60 + r() * 400; thread(ctx, [[x, 350 + r() * 60], [x + (r() - 0.5) * 80, 440], [x + (r() - 0.5) * 140, 540]], SC.thread, 0.9, 0.3); }
  part(ctx, bust(196, 340), { base: SC.coat, rim: SC.thread, edge: 30, hl: [170, 390, 120], hlA: 0.25, tex: (c) => { c.strokeStyle = 'rgba(138,77,255,0.4)'; c.lineWidth = 2; for (let y = 392; y < 520; y += 22) for (let x = 110 + ((y / 22) % 2) * 13; x < 410; x += 26) { c.beginPath(); c.moveTo(x - 5, y - 5); c.lineTo(x + 5, y + 5); c.moveTo(x + 5, y - 5); c.lineTo(x - 5, y + 5); c.stroke(); } } });
}
function sableNeedle(ctx, gx, gy, top, ex) {
  // a long tapered needle held upright before him; a red thread runs through its eye below the grip
  const nb = ctx.createLinearGradient(gx - 9, 0, gx + 9, 0); nb.addColorStop(0, '#ffffff'); nb.addColorStop(0.45, '#d9d6ee'); nb.addColorStop(1, '#5d5878');
  ctx.save(); ctx.fillStyle = nb; ctx.beginPath(); ctx.moveTo(gx - 8, gy + 70); ctx.lineTo(gx - 6, gy - 20); ctx.lineTo(gx - 1, top); ctx.lineTo(gx + 1, top); ctx.lineTo(gx + 6, gy - 20); ctx.lineTo(gx + 8, gy + 70); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = SC.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(93,88,120,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gx, gy - 30); ctx.lineTo(gx, top + 60); ctx.stroke();
  ctx.fillStyle = SC.ink; ctx.beginPath(); ctx.ellipse(gx, gy + 52, 3, 10, 0, 0, TAU); ctx.fill();
  ctx.restore();
  glow(ctx, gx, top + 4, 22, '#ffffff', 0.6);
  thread(ctx, [[gx, gy + 52], [gx - 30, gy + 70], [gx - 50, gy + 40], [gx - 90, gy + 60 + (ex.brow < -0.5 ? 30 : 0)], [gx - 130, gy + 110]], SC.red, 1.8, 0.85);
}
P.sable = (ctx, ex) => {
  backdrop(ctx, SC.thread, { seed: 8, a: 0.45 });
  sableBody(ctx, 51);
  // the high collar
  part(ctx, (c) => curve(c, [[178, 404], [174, 320], [204, 286], [256, 298], [308, 286], [338, 320], [334, 404], [256, 376]]), { base: SC.coat2, rim: SC.threadHi, edge: 16, hl: [210, 320, 50], hlA: 0.3 });
  // the head in shadow behind the mask
  part(ctx, (c) => c.ellipse(256, 222, 100, 118, 0, 0, TAU), { base: SC.ink, edge: 0, rim: SC.edge, rimW: 5, lightA: 0.12, box: [156, 104, 356, 340] });
  const heat = ex.tear ? 0.5 : ex.brow > 1 ? 1.45 : ex.lift > 0.5 ? 1.15 : 1;
  const tilt = ex.brow * 0.035 + (ex.smirk ? -0.08 : 0);
  ctx.save(); ctx.translate(256, 236); ctx.rotate(tilt); ctx.scale(0.86, 0.86); ctx.translate(-256, -232);
  const mask = (c) => { c.moveTo(256, 116); c.bezierCurveTo(320, 116, 342, 180, 338, 236); c.bezierCurveTo(334, 292, 302, 336, 262, 344); c.bezierCurveTo(212, 338, 180, 292, 174, 240); c.bezierCurveTo(170, 176, 198, 116, 256, 116); c.closePath(); };
  part(ctx, mask, { base: '#e6dfec', edge: 22, hl: [222, 168, 70], hlA: 0.85, rim: SC.threadHi, rimW: 5, box: [174, 116, 338, 344], shadeA: 0.9, bounceA: 0.3 });
  ctx.save(); ctx.beginPath(); mask(ctx); ctx.clip();
  // shallow sockets under a brow ridge: no eyes, but the shadows set like a frown or a sorrow
  for (const s of [-1, 1]) { const x = 256 + s * 42, y = 212 - ex.lift * 10; ctx.save(); ctx.translate(x, y); ctx.rotate(ex.brow * 0.38 * -s); ctx.scale(1.4, 0.75); blob(ctx, 0, 0, 30, SC.faceSh, 0.45 + Math.max(0, ex.brow) * 0.2); ctx.restore(); }
  ctx.fillStyle = hexA(SC.porcelain2, 0.6); ctx.beginPath(); ctx.moveTo(178, 246); ctx.quadraticCurveTo(198, 314, 262, 344); ctx.quadraticCurveTo(222, 300, 214, 248); ctx.closePath(); ctx.fill();
  ctx.restore();
  // the slit: one long cut from brow to chin, set to his right, burning red
  const sw = 7 + Math.max(0, ex.brow) * 3 + (ex.open ?? 0) * 3;
  ctx.fillStyle = SC.ink; ctx.beginPath(); ctx.moveTo(282, 138); ctx.lineTo(282 + sw, 140); ctx.lineTo(280 + sw * 0.75, 328); ctx.lineTo(276, 326); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(283, 232); ctx.scale(0.32, 1); glow(ctx, 0, 0, 110 * Math.min(1.2, heat), SC.red, 0.55 * heat); ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hexA(SC.red, Math.min(1, 0.95 * heat)); ctx.beginPath(); ctx.moveTo(283, 148); ctx.lineTo(281 + sw * 0.8, 150); ctx.lineTo(279 + sw * 0.6, 318); ctx.lineTo(278, 316); ctx.closePath(); ctx.fill(); ctx.fillStyle = hexA(SC.redHi, 0.75 * heat); ctx.fillRect(282, 176, 1.8, 110); ctx.restore();
  // stitched across, as if it had once been sewn shut
  ctx.strokeStyle = 'rgba(7,4,12,0.85)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; for (let y = 158; y <= 312; y += 22) { ctx.beginPath(); ctx.moveTo(266, y - 6); ctx.lineTo(298 + sw, y + 6); ctx.stroke(); }
  // a hairline crack across the other cheek
  ctx.strokeStyle = hexA(SC.faceSh, 0.95); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(212, 136); ctx.lineTo(222, 176); ctx.lineTo(208, 198); ctx.lineTo(218, 238); ctx.lineTo(206, 262); ctx.stroke();
  // in sorrow a black thread runs from the slit like a tear; in mirth the slit's glow rises
  if (ex.tear) { ctx.strokeStyle = SC.ink; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(279, 326); ctx.quadraticCurveTo(286, 360, 274, 400); ctx.stroke(); }
  if (ex.smile > 0.5) glow(ctx, 283, 160, 40, SC.redHi, 0.4);
  // black thread hair falling over the top of the mask, shadowing the brow
  { const sh = ctx.createLinearGradient(0, 110, 0, 210); sh.addColorStop(0, 'rgba(7,4,12,0.85)'); sh.addColorStop(1, 'rgba(7,4,12,0)'); ctx.save(); ctx.beginPath(); mask(ctx); ctx.clip(); ctx.fillStyle = sh; ctx.fillRect(160, 100, 200, 120); ctx.restore();
    const r = prng(57); ctx.save(); ctx.lineCap = 'round'; for (let i = 0; i < 26; i++) { const x = 176 + r() * 160, L = 40 + r() * 90; ctx.strokeStyle = r() < 0.75 ? SC.ink : SC.hi; ctx.lineWidth = 2 + r() * 3.5; ctx.beginPath(); curve(ctx, [[x + (x - 256) * 0.1, 100], [x + (r() - 0.5) * 16, 100 + L * 0.5], [x + (x - 256) * 0.25 + (r() - 0.5) * 20, 100 + L]], false); ctx.stroke(); } ctx.restore(); }
  ctx.restore();
  glow(ctx, 256, 470, 120, SC.red, 0.18 * heat);
  // the needle, held upright before the slit in a black-gloved hand
  sableNeedle(ctx, 392, 420, 70, ex);
  hand(ctx, 392, 420, 1, 0, 'fist', { color: '#1c1430', rim: SC.thread, cuff: SC.coat, cuffRim: SC.threadHi });
};
P.sable_bare = (ctx, ex) => {
  backdrop(ctx, '#b38aff', { seed: 9 });
  sableBody(ctx, 52);
  // Iri's hood, inverted: black, violet-lined, its point trailing behind
  part(ctx, (c) => curve(c, [[256, 70], [356, 104], [396, 210], [392, 330], [350, 410], [256, 430], [162, 410], [120, 330], [116, 210], [140, 120], [90, 80], [170, 86]]), { base: SC.coat, rim: SC.threadHi, edge: 36, hl: [190, 140, 130], hlA: 0.2, rimW: 8, tex: (c) => strands(c, [[150, 120], [256, 80], [360, 120]], 40, 300, SC.hi, 1.5, 52, 0.5) });
  part(ctx, (c) => curve(c, [[256, 116], [332, 140], [360, 222], [352, 312], [256, 362], [160, 312], [152, 222], [180, 140]]), { base: SC.lining, edge: 30, rim: null, lightA: 0.1 });
  const skin = '#cfc4dc';
  neck(ctx, skin, 256, 330, 30, SC.threadHi);
  const e2 = { ...ex, shape: ex.shape === 'flat' ? 'smirk' : ex.shape };
  face(ctx, { cx: 256, cy: 238, w: 82, h: 100, skin, iris_c: SC.magenta, glowEye: SC.magenta, brow: '#1a1028', lash: SC.ink, lashes: true, freckles: true, rim: SC.threadHi, cheek: '#a080c0', lip: '#5a3a70', tilt: 0.12 }, e2);
  // dark thread tear-tracks under both eyes
  ctx.save(); ctx.strokeStyle = 'rgba(7,4,12,0.7)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { const x = 256 + s * 35, y = 246; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s * 3, y + 26, x - s * 2, y + 52); ctx.stroke(); }
  ctx.restore();
  // black thread hair under the hood
  part(ctx, (c) => curve(c, [[166, 232], [170, 160], [220, 128], [300, 128], [346, 168], [350, 232], [330, 190], [300, 176], [262, 186], [230, 172], [196, 190]]), { base: '#0e0a1a', edge: 10, hl: [230, 146, 60], hlA: 0.25, rim: SC.threadHi, rimW: 3, tex: (c) => { strands(c, [[180, 200], [240, 140], [330, 170]], 60, 34, '#5a4a9a', 1.3, 53, 0.6); } });
  // the black scarf, mirror of Iri's gold, trailing the other way
  part(ctx, (c) => curve(c, [[150, 362], [256, 402], [362, 364], [372, 402], [256, 452], [140, 406]]), { base: '#1a1030', rim: SC.magenta, edge: 14, hl: [210, 380, 80], hlA: 0.3 });
  part(ctx, (c) => curve(c, [[182, 400], [132, 420], [72, 470], [42, 520], [92, 520], [142, 470], [192, 440]]), { base: '#140c26', rim: SC.magenta, edge: 12 });
  thread(ctx, [[150, 382], [256, 424], [362, 384]], SC.magenta, 1.6, 0.6);
  // a gloved hand, open, black thread unravelling from the fingers
  hand(ctx, 396, 456, 1, 0.12, 'open', { color: '#1c1430', rim: SC.magenta, cuff: SC.coat, cuffRim: SC.threadHi });
  const [hx, hy] = handPoint(396, 456, 1, 0.12, 'open');
  for (let i = 0; i < 5; i++) thread(ctx, [[hx - 20 + i * 10, hy + 20], [hx - 30 + i * 16, hy - 30 - i * 6], [hx - 10 + i * 22, hy - 90 - i * 10]], i % 2 ? SC.magenta : SC.thread, 1.2, 0.7);
};

// ---------------------------------------------------------------- patrons (luminous, each in their element)
function patronBase(ctx, ex, o) {
  backdrop(ctx, o.color, { seed: o.seed, motes: 22, a: 0.7 });
  if (o.behind) o.behind(ctx);
  neck(ctx, o.skin, 256, 330, 28, tint(o.color, 0.5));
  part(ctx, bust(170, 340), { base: o.robe, rim: tint(o.color, 0.5), edge: 28, hl: [180, 380, 110], hlA: 0.5, tex: o.robeTex });
  if (o.hairBack) part(ctx, o.hairBack, { base: o.hair, edge: 18, rim: tint(o.color, 0.6), hl: [210, 150, 80] });
  face(ctx, { cx: 256, cy: 232, w: 80, h: 98, skin: o.skin, iris_c: o.iris, glowEye: o.color, brow: o.brow ?? shade(o.hair, 0.3), lash: shade(o.hair, 0.6), lashes: o.lashes, rim: tint(o.color, 0.5), cheek: o.cheek ?? '#e08080', jaw: o.jaw, tilt: o.tilt }, ex);
  if (o.front) o.front(ctx);
  if (o.hold) {
    const pose = o.pose ?? 'open', hx = o.hx ?? 392, hy = o.hy ?? 454, rot = o.hrot ?? 0.1;
    if (o.under) o.under(ctx, ...handPoint(hx, hy, 1, rot, pose));
    hand(ctx, hx, hy, 1, rot, pose, { color: o.handC ?? o.skin, rim: tint(o.color, 0.5), cuff: o.robe, cuffRim: tint(o.color, 0.5) });
    o.hold(ctx, ...handPoint(hx, hy, 1, rot, pose));
  }
}
P.solenne = (ctx, ex) => patronBase(ctx, ex, { color: '#ffc35a', seed: 11,
  hold: (c, x, y) => { glow(c, x, y - 6, 70, '#ffd27a', 0.9); part(c, (k) => k.arc(x, y - 6, 20, 0, TAU), { base: '#fff0b0', edge: 4, hl: [x - 6, y - 12, 14], hlA: 1, rim: '#ffffff', box: [x - 20, y - 26, x + 20, y + 14] }); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; thread(c, [[x + Math.cos(a) * 26, y - 6 + Math.sin(a) * 26], [x + Math.cos(a) * 44, y - 6 + Math.sin(a) * 44]], '#ffd27a', 1.4, 0.8); } }, robe: '#c08a2a', skin: '#f6dcb0', hair: '#f0c060', iris: '#c07a10', jaw: 0.72, lashes: true,
  behind: (c) => { for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; c.save(); c.translate(256, 200); c.rotate(a); const g = c.createLinearGradient(0, 0, 230, 0); g.addColorStop(0, 'rgba(255,220,120,0.6)'); g.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(90, -6); c.lineTo(230 + (i % 2) * 40, 0); c.lineTo(90, 6); c.fill(); c.restore(); } glow(c, 256, 200, 160, '#ffd27a', 0.5); },
  hairBack: (c) => curve(c, [[256, 106], [336, 124], [362, 210], [350, 320], [320, 360], [300, 300], [212, 300], [192, 360], [162, 320], [150, 210], [176, 124]]),
  front: (c) => { part(c, (k) => curve(k, [[176, 156], [216, 112], [256, 100], [296, 112], [336, 156], [300, 142], [256, 134], [212, 142]]), { base: '#ffe080', edge: 6, rim: '#ffffff', hl: [240, 116, 40], hlA: 0.8 }); glow(c, 256, 116, 30, '#ffffff', 0.8); } });
P.maru = (ctx, ex) => patronBase(ctx, ex, { color: '#5ec8ff', seed: 12,
  hold: (c, x, y) => { glow(c, x, y - 8, 56, '#5ec8ff', 0.5); part(c, (k) => k.arc(x, y - 8, 26, 0, TAU), { base: '#3aa0e0', edge: 8, hl: [x - 8, y - 18, 16], hlA: 1, rim: '#d0f4ff', box: [x - 26, y - 34, x + 26, y + 18], tex: (k) => { k.strokeStyle = 'rgba(220,250,255,0.6)'; k.lineWidth = 2; k.beginPath(); k.arc(x, y - 2, 18, 0.2, Math.PI - 0.2); k.stroke(); } }); }, robe: '#1a5a8a', skin: '#a8d8f0', hair: '#2a7ac0', iris: '#0a4a8a', jaw: 0.9, cheek: '#80a0e0',
  hairBack: (c) => curve(c, [[256, 104], [350, 130], [392, 230], [400, 360], [360, 420], [330, 340], [182, 340], [152, 420], [112, 360], [120, 230], [162, 130]]),
  robeTex: (c) => { c.strokeStyle = 'rgba(200,240,255,0.35)'; c.lineWidth = 3; for (let i = 0; i < 5; i++) { c.beginPath(); for (let x = 60; x <= 460; x += 20) { const y = 380 + i * 26 + Math.sin(x * 0.05 + i) * 7; x === 60 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); } },
  front: (c) => { part(c, (k) => curve(k, [[170, 210], [176, 150], [222, 118], [300, 120], [344, 160], [350, 210], [326, 176], [290, 164], [256, 180], [222, 164], [190, 178]]), { base: '#3a90d8', edge: 8, rim: '#c0f0ff', hl: [230, 130, 50], tex: (k) => { k.strokeStyle = 'rgba(220,250,255,0.5)'; k.lineWidth = 2.5; for (let i = 0; i < 4; i++) { k.beginPath(); k.arc(200 + i * 40, 160, 16, Math.PI, 0); k.stroke(); } } }); glow(c, 256, 330, 16, '#ffffff', 0.9); c.fillStyle = '#f0f8ff'; c.beginPath(); c.arc(256, 330, 7, 0, TAU); c.fill(); } });
P.veyra = (ctx, ex) => patronBase(ctx, ex, { color: '#a6f6ff', seed: 13, hrot: -0.18,
  hold: (c, x, y) => { glow(c, x, y, 60, '#a6f6ff', 0.7); c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(230,255,255,0.95)'; c.lineWidth = 2.4; const r = prng(19); for (let b = 0; b < 5; b++) { let px = x, py = y + 10; c.beginPath(); c.moveTo(px, py); for (let i = 0; i < 5; i++) { px += (r() - 0.5) * 40; py -= 16 + r() * 10; c.lineTo(px, py); } c.stroke(); } c.restore(); }, robe: '#2a3a6a', skin: '#e0e8f8', hair: '#60d8f0', iris: '#2ab0d0', jaw: 0.78, lashes: true, tilt: 0.12,
  hairBack: (c) => curve(c, [[256, 80], [330, 70], [400, 120], [420, 220], [380, 300], [330, 280], [182, 280], [132, 300], [92, 220], [112, 120], [182, 70]]),
  front: (c) => { part(c, (k) => curve(k, [[160, 220], [150, 150], [196, 96], [256, 84], [330, 96], [366, 160], [356, 220], [330, 170], [296, 150], [256, 168], [222, 150], [186, 172]]), { base: '#80e8ff', edge: 8, rim: '#ffffff', hl: [230, 110, 60], hlA: 0.7 });
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(220,255,255,0.9)'; c.lineWidth = 2.5; const r = prng(14); for (let b = 0; b < 4; b++) { let x = 120 + r() * 280, y = 60 + r() * 40; c.beginPath(); c.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 50; y += 24; c.lineTo(x, y); } c.stroke(); } c.restore(); glow(c, 140, 120, 60, '#a6f6ff', 0.5); glow(c, 390, 160, 60, '#a6f6ff', 0.5); } });
P.ossian = (ctx, ex) => {
  backdrop(ctx, '#c8a27a', { seed: 15, motes: 10 });
  const stone = '#8a7a6a';
  part(ctx, bust(210, 320), { base: '#5a4a3a', rim: '#f0d0a0', edge: 30, hl: [170, 380, 120], tex: (c) => { c.strokeStyle = 'rgba(30,20,10,0.45)'; c.lineWidth = 3; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(80 + i * 50, 360); c.lineTo(100 + i * 46, 512); c.stroke(); } c.fillStyle = 'rgba(90,140,60,0.55)'; for (let i = 0; i < 10; i++) { c.beginPath(); c.ellipse(90 + i * 36, 350 + (i % 3) * 8, 18, 7, 0, 0, TAU); c.fill(); } } });
  // a heavy, slab-like stone face
  const head = (c) => curve(c, [[256, 100], [340, 112], [372, 190], [366, 290], [330, 350], [256, 370], [182, 350], [146, 290], [140, 190], [172, 112]], true, 0.6);
  part(ctx, head, { base: stone, edge: 26, hl: [205, 170, 110], hlA: 0.5, rim: '#f0d0a0', tex: (c) => { c.strokeStyle = 'rgba(30,24,20,0.45)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(200, 120); c.lineTo(214, 170); c.lineTo(198, 200); c.moveTo(330, 140); c.lineTo(318, 196); c.moveTo(180, 300); c.lineTo(214, 330); c.stroke(); c.fillStyle = 'rgba(100,150,70,0.6)'; c.beginPath(); c.ellipse(190, 118, 40, 14, -0.2, 0, TAU); c.ellipse(320, 112, 30, 10, 0.2, 0, TAU); c.fill(); } });
  // heavy brow ridge moves with mood
  for (const s of [-1, 1]) part(ctx, (c) => { const inn = ex.brow * 10 - ex.lift * 10; c.moveTo(256 + s * 10, 190 + inn); c.lineTo(256 + s * 104, 180 - ex.lift * 10 - ex.brow * 4); c.lineTo(256 + s * 100, 204 - ex.lift * 6); c.lineTo(256 + s * 12, 212 + inn); c.closePath(); }, { base: shade(stone, 0.15), edge: 6, rim: '#f0d0a0', hl: [256 + s * 50, 186, 30] });
  // amber eyes glowing in cracks
  for (const s of [-1, 1]) { const x = 256 + s * 54, y = 226, h = 7 * Math.max(0.3, Math.min(1.4, ex.eye)); ctx.fillStyle = '#1a1208'; ctx.beginPath(); ctx.ellipse(x, y, 24, h + 3, 0, 0, TAU); ctx.fill(); glow(ctx, x, y, 34, '#ffb040', 0.9); ctx.fillStyle = '#ffd890'; ctx.beginPath(); ctx.ellipse(x, y, 12, h * 0.7, 0, 0, TAU); ctx.fill(); }
  // nose slab and mouth crack
  part(ctx, (c) => { c.moveTo(256, 216); c.lineTo(282, 290); c.lineTo(256, 300); c.lineTo(234, 290); c.closePath(); }, { base: shade(stone, 0.05), edge: 6, hl: [248, 250, 30], rim: null });
  hand(ctx, 120, 452, 1.15, -0.1, 'fist', { color: '#8a7a6a', rim: '#f0d0a0', cuff: '#5a4a3a' }); glow(ctx, 120, 440, 40, '#ffb040', 0.25);
  ctx.save(); ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(214, 330 - ex.smile * 8); ctx.lineTo(240, 334 + ex.smile * 3); ctx.lineTo(272, 332 + ex.smile * 3); ctx.lineTo(298, 330 - ex.smile * 8 - (ex.smirk ?? 0) * 6); ctx.stroke(); if (ex.open > 0.2) glow(ctx, 256, 336, 30, '#ffb040', 0.5); ctx.restore();
};
P.ilu = (ctx, ex) => patronBase(ctx, ex, { color: '#b07cff', seed: 16, pose: 'pinch',
  hold: (c, x, y) => { glow(c, x, y - 18, 50, '#c0a0ff', 0.6); c.save(); c.fillStyle = 'rgba(240,232,255,0.97)'; c.beginPath(); c.arc(x, y - 24, 22, 0.75, 0.75 + 4.6, false); c.arc(x + 10, y - 30, 19, 0.75 + 4.25, 0.95, true); c.closePath(); c.fill(); c.restore(); }, robe: '#2a1a4a', skin: '#c8b8e8', hair: '#3a2060', iris: '#7a40d0', jaw: 0.74, lashes: true, cheek: '#b080d0', tilt: 0.16,
  behind: (c) => { c.save(); c.fillStyle = 'rgba(230,220,255,0.75)'; c.beginPath(); c.arc(340, 110, 60, 0, TAU); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(362, 96, 56, 0, TAU); c.fill(); c.restore(); glow(c, 330, 120, 90, '#c0a0ff', 0.4); },
  hairBack: (c) => curve(c, [[256, 100], [346, 120], [380, 230], [376, 400], [330, 380], [300, 300], [212, 300], [182, 380], [136, 400], [132, 230], [166, 120]]),
  front: (c) => { part(c, (k) => curve(k, [[168, 260], [164, 160], [220, 116], [300, 116], [348, 160], [354, 214], [320, 170], [270, 150], [230, 168], [200, 210]]), { base: '#3a2060', edge: 10, rim: '#d0b0ff', hl: [250, 130, 50], hlA: 0.3 });
    // half the face in shadow
    c.save(); const g = c.createLinearGradient(200, 0, 300, 0); g.addColorStop(0, 'rgba(20,8,40,0.55)'); g.addColorStop(1, 'rgba(20,8,40,0)'); c.fillStyle = g; c.beginPath(); curve(c, [[256, 136], [256, 340], [176, 300], [170, 200]]); c.fill(); c.restore(); } });
P.kestrel = (ctx, ex) => patronBase(ctx, ex, { color: '#8ff5b0', seed: 17, pose: 'pinch', hrot: 0.15,
  hold: (c, x, y) => { glow(c, x + 10, y - 50, 50, '#8ff5b0', 0.5); part(c, (k) => curve(k, [[x, y], [x - 12, y - 50], [x + 4, y - 110], [x + 22, y - 60]]), { base: '#a8f0c0', edge: 5, rim: '#ffffff', rimW: 3, box: [x - 14, y - 110, x + 22, y], tex: (k) => { k.strokeStyle = 'rgba(20,60,30,0.5)'; k.lineWidth = 1.4; k.beginPath(); k.moveTo(x, y); k.lineTo(x + 2, y - 104); k.stroke(); strands(k, [[x - 8, y - 30], [x + 4, y - 90]], 12, 20, '#ffffff', 1, 9, 0.4); } }); }, robe: '#2a6a4a', skin: '#e8e0c8', hair: '#4a8a5a', iris: '#2a9a5a', jaw: 0.74, lashes: true, tilt: 0.16,
  behind: (c) => { const r = prng(18); c.save(); for (let i = 0; i < 9; i++) { c.strokeStyle = `rgba(200,255,220,${0.2 + r() * 0.3})`; c.lineWidth = 2 + r() * 3; c.beginPath(); const y = 80 + i * 40; c.moveTo(0, y); c.bezierCurveTo(160, y - 40, 340, y + 40, 512, y - 10); c.stroke(); } c.restore(); },
  hairBack: (c) => curve(c, [[256, 100], [336, 110], [366, 190], [356, 280], [320, 300], [192, 300], [156, 280], [146, 190], [176, 110]]),
  front: (c) => { // feathered crest
    for (let i = 0; i < 6; i++) { c.save(); c.translate(236 + i * 16, 132 + Math.abs(i - 2) * 4); c.rotate(0.5 + i * 0.22); part(c, (k) => curve(k, [[0, 0], [-14, -50], [-6, -120 - (i % 2) * 24], [12, -60]]), { base: i % 2 ? '#5ab07a' : '#a8f0c0', edge: 6, rim: '#ffffff', box: [-14, -150, 14, 0], tex: (k) => { k.strokeStyle = 'rgba(20,60,30,0.5)'; k.lineWidth = 1.2; k.beginPath(); k.moveTo(0, 0); k.lineTo(-4, -110); k.stroke(); } }); c.restore(); }
    part(c, (k) => curve(k, [[168, 218], [178, 150], [230, 120], [300, 124], [344, 160], [350, 218], [320, 170], [256, 160], [200, 176]]), { base: '#4a8a5a', edge: 8, rim: '#c0ffd8', hl: [230, 134, 50] }); } });

// ---------------------------------------------------------------- bosses
P.veyl = (ctx, ex) => {
  backdrop(ctx, '#9ff0e0', { seed: 21 });
  const glass = '#7fd8c8';
  // gown of crystal shards
  neck(ctx, '#c8ece4', 256, 330, 26, '#ffffff');
  part(ctx, bust(200, 330), { base: '#1a4a50', rim: '#d0fff4', edge: 26, hl: [170, 380, 120], tex: (c) => { const r = prng(22); for (let i = 0; i < 26; i++) { const x = 60 + r() * 400, y = 340 + r() * 170; c.fillStyle = hexA(r() < 0.5 ? '#bff8ee' : '#4aa8a0', 0.45); c.beginPath(); c.moveTo(x, y - 30); c.lineTo(x + 14, y); c.lineTo(x, y + 26); c.lineTo(x - 14, y); c.fill(); } } });
  glow(ctx, 256, 420, 60, '#bff8ee', 0.7);
  // antler crown of glass branches
  for (const s of [-1, 1]) { ctx.save(); ctx.lineCap = 'round'; const br = (x, y, a, L, d) => { if (d > 3) return; const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L; ctx.strokeStyle = hexA('#bff8ee', 0.9 - d * 0.15); ctx.lineWidth = 9 - d * 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); glow(ctx, x2, y2, 12, '#e0fff8', 0.5); br(x2, y2, a - s * 0.5, L * 0.7, d + 1); br(x2, y2, a + s * 0.3, L * 0.6, d + 1); }; br(256 + s * 50, 140, -Math.PI / 2 + s * 0.5, 80, 0); ctx.restore(); }
  face(ctx, { cx: 256, cy: 236, w: 78, h: 100, skin: '#c8ece4', iris_c: '#2a9a8a', glowEye: '#9ff0e0', brow: '#2a6a60', lash: '#0a2a28', lashes: true, rim: '#ffffff', cheek: '#80c8c0', jaw: 0.66, tilt: 0.14 }, ex);
  // glass hair
  part(ctx, (c) => curve(c, [[160, 260], [164, 160], [216, 120], [300, 120], [350, 160], [354, 260], [330, 200], [300, 168], [256, 160], [212, 168], [184, 200]]), { base: glass, edge: 8, rim: '#ffffff', hl: [230, 136, 60], hlA: 0.8, tex: (c) => { c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(180 + i * 22, 140); c.lineTo(170 + i * 24, 240); c.stroke(); } } });
  // thorns at the collar
  for (let i = 0; i < 7; i++) { const x = 170 + i * 29; ctx.fillStyle = '#bff8ee'; ctx.beginPath(); ctx.moveTo(x - 6, 350); ctx.lineTo(x, 316 - (i % 2) * 10); ctx.lineTo(x + 6, 350); ctx.fill(); }
  // a glass rose on a thorned stem, held up like a verdict
  const [rx, ry] = handPoint(118, 458, 1, -0.2, 'pinch');
  ctx.save(); ctx.strokeStyle = '#4aa8a0'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(rx + 6, ry + 70); ctx.quadraticCurveTo(rx - 6, ry, rx + 4, ry - 50); ctx.stroke();
  ctx.fillStyle = '#bff8ee'; for (const t of [0.2, 0.5, 0.8]) { const yy = ry + 70 - t * 120, xx = rx + (t < 0.5 ? 2 : 0); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 10, yy - 4); ctx.lineTo(xx, yy - 6); ctx.fill(); } ctx.restore();
  glow(ctx, rx + 4, ry - 66, 50, '#9ff0e0', 0.7);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; part(ctx, (c) => curve(c, [[rx + 4, ry - 62], [rx + 4 + Math.cos(a) * 22, ry - 66 + Math.sin(a) * 18], [rx + 4 + Math.cos(a + 0.5) * 18, ry - 70 + Math.sin(a + 0.5) * 16]]), { base: i % 2 ? '#9ff0e0' : '#d0fff4', edge: 3, rim: '#ffffff', rimW: 2, box: [rx - 20, ry - 90, rx + 28, ry - 44] }); }
  hand(ctx, 118, 458, 1, -0.2, 'pinch', { color: '#c8ece4', rim: '#ffffff', cuff: '#1a4a50', cuffRim: '#d0fff4' });
};
P.morrow = (ctx, ex) => {
  backdrop(ctx, '#7fb0ff', { seed: 23 });
  neck(ctx, '#b8c8d8', 256, 330, 28, '#a0c8ff');
  part(ctx, bust(190, 330), { base: '#1a2440', rim: '#a0c8ff', edge: 26, hl: [170, 380, 120], tex: (c) => { c.fillStyle = 'rgba(220,232,255,0.85)'; c.beginPath(); c.ellipse(256, 352, 64, 14, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(160,40,60,0.6)'; c.fillRect(196, 366, 22, 150); c.fillRect(294, 366, 22, 150); c.fillStyle = 'rgba(80,120,160,0.6)'; const r = prng(24); for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(80 + r() * 350, 380 + r() * 130, 4 + r() * 6, 0, TAU); c.fill(); } } });
  face(ctx, { cx: 256, cy: 236, w: 82, h: 104, skin: '#b8c8d8', iris_c: '#e8e4c8', white: '#d8dce0', glowEye: '#e8f0ff', brow: '#4a5a6a', lash: '#1a2a3a', rim: '#a0c8ff', cheek: '#7090b0', jaw: 0.8, iris: 1.05 }, ex);
  // wet, plastered hair and a drip or two
  part(ctx, (c) => curve(c, [[166, 250], [168, 160], [220, 124], [300, 124], [346, 160], [350, 250], [330, 190], [300, 170], [256, 180], [212, 170], [186, 190]]), { base: '#3a4a5a', edge: 8, rim: '#c0e0ff', hl: [230, 140, 50], tex: (c) => strands(c, [[180, 160], [256, 140], [330, 160], [340, 240]], 30, 30, '#8aa0c0', 1.2, 25, 0.5) });
  for (const [x, y] of [[196, 270], [322, 300]]) { ctx.fillStyle = 'rgba(200,230,255,0.8)'; ctx.beginPath(); ctx.ellipse(x, y, 3, 5, 0, 0, TAU); ctx.fill(); }
  // lantern glow beside him
  glow(ctx, 430, 300, 90, '#bfe0ff', 0.7); ctx.strokeStyle = '#1a2440'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(440, 520); ctx.lineTo(430, 330); ctx.stroke(); part(ctx, (c) => { c.rect(410, 260, 40, 60); }, { base: '#e8f4ff', edge: 8, rim: null });
  hand(ctx, 435, 430, 0.95, -0.05, 'fist', { color: '#b8c8d8', rim: '#a0c8ff', cuff: '#1a2440', cuffRim: '#a0c8ff' });
};
P.aurum = (ctx, ex) => {
  backdrop(ctx, '#ffb347', { seed: 26 });
  const gold = '#d8a040';
  part(ctx, bust(240, 300), { base: '#7a4a18', rim: '#ffe0a0', edge: 30, hl: [170, 360, 140], hlA: 0.6, tex: (c) => { c.strokeStyle = 'rgba(255,160,40,0.9)'; c.lineWidth = 3; c.beginPath(); c.moveTo(120, 360); c.lineTo(160, 440); c.lineTo(140, 512); c.moveTo(380, 340); c.lineTo(350, 420); c.stroke(); glow(c, 160, 440, 30, '#ff9030', 0.6); glow(c, 350, 420, 30, '#ff9030', 0.6); } });
  // helm-face of molten gold
  const head = (c) => curve(c, [[256, 90], [346, 110], [380, 200], [370, 300], [330, 362], [256, 384], [182, 362], [142, 300], [132, 200], [166, 110]], true, 0.7);
  part(ctx, head, { base: gold, edge: 28, hl: [205, 160, 110], hlA: 0.85, rim: '#fff0c0', tex: (c) => { c.strokeStyle = 'rgba(255,120,30,0.85)'; c.lineWidth = 3; c.beginPath(); c.moveTo(180, 130); c.lineTo(196, 190); c.lineTo(184, 230); c.moveTo(330, 140); c.lineTo(318, 200); c.stroke(); glow(c, 190, 190, 20, '#ff9030', 0.5); } });
  // brow plate (mood) and eye slots of fire
  for (const s of [-1, 1]) part(ctx, (c) => { const inn = ex.brow * 10 - ex.lift * 10; c.moveTo(256 + s * 8, 192 + inn); c.lineTo(256 + s * 110, 178 - ex.lift * 10 - ex.brow * 4); c.lineTo(256 + s * 106, 200 - ex.lift * 6); c.lineTo(256 + s * 10, 214 + inn); c.closePath(); }, { base: shade(gold, 0.2), edge: 6, rim: '#fff0c0', hl: [256 + s * 50, 186, 30] });
  for (const s of [-1, 1]) { const x = 256 + s * 56, y = 230, h = 8 * Math.max(0.3, Math.min(1.4, ex.eye)); ctx.fillStyle = '#2a1004'; ctx.beginPath(); ctx.ellipse(x, y, 26, h + 3, 0, 0, TAU); ctx.fill(); glow(ctx, x, y, 40, '#ff8020', 1); ctx.fillStyle = '#fff0a0'; ctx.beginPath(); ctx.ellipse(x, y, 12, h * 0.6, 0, 0, TAU); ctx.fill(); }
  // beard of gold bars
  part(ctx, (c) => curve(c, [[180, 290], [256, 300], [332, 290], [340, 360], [300, 430], [256, 446], [212, 430], [172, 360]]), { base: '#e8b050', edge: 12, hl: [230, 320, 60], hlA: 0.8, rim: '#fff0c0', tex: (c) => { c.strokeStyle = 'rgba(120,60,10,0.5)'; c.lineWidth = 3; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(190 + i * 22, 300); c.lineTo(200 + i * 18, 440); c.stroke(); } } });
  hand(ctx, 112, 450, 1.2, 0.12, 'fist', { color: '#d8a040', rim: '#fff0c0', cuff: '#7a4a18', cuffRim: '#ffe0a0' }); glow(ctx, 112, 430, 46, '#ff8020', 0.55);
  ctx.save(); ctx.strokeStyle = '#2a1004'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(220, 300 - ex.smile * 8); ctx.quadraticCurveTo(256, 308 + ex.smile * 6 + ex.open * 12, 292, 300 - ex.smile * 8 - (ex.smirk ?? 0) * 6); ctx.stroke(); if (ex.open > 0.2) glow(ctx, 256, 306, 30, '#ff9030', 0.7); ctx.restore();
};

// ---------------------------------------------------------------- wanderers
P.hob = (ctx, ex) => {
  backdrop(ctx, '#b8d46a', { seed: 31 });
  part(ctx, bust(170, 340), { base: '#6a5a30', rim: '#e8f0b0', edge: 26, hl: [170, 380, 110], tex: (c) => strands(c, [[100, 360], [256, 380], [412, 360]], 80, 140, '#c8b070', 1.6, 32, 0.45) });
  // willow-weave head
  const head = (c) => curve(c, [[256, 120], [326, 134], [356, 210], [340, 290], [290, 330], [256, 336], [222, 330], [172, 290], [156, 210], [186, 134]]);
  part(ctx, head, { base: '#b8985a', edge: 22, hl: [210, 170, 90], rim: '#f0f8c0', tex: (c) => { c.strokeStyle = 'rgba(90,60,20,0.45)'; c.lineWidth = 3; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(150, 120 + i * 20); c.bezierCurveTo(220, 110 + i * 22, 300, 140 + i * 18, 370, 120 + i * 20); c.stroke(); } } });
  // straw hat
  part(ctx, (c) => { c.ellipse(256, 140, 150, 34, -0.05, 0, TAU); }, { base: '#d8b860', edge: 8, rim: '#fff0b0', hl: [210, 130, 70] });
  part(ctx, (c) => curve(c, [[186, 140], [200, 70], [256, 50], [312, 70], [326, 140]]), { base: '#c8a850', edge: 10, rim: '#fff0b0', hl: [230, 80, 50] });
  // knothole eyes with a warm glow
  for (const s of [-1, 1]) { const x = 256 + s * 46, y = 216, h = 14 * Math.max(0.3, Math.min(1.3, ex.eye)); ctx.fillStyle = '#2a1a08'; ctx.beginPath(); ctx.ellipse(x, y, 16, h, s * ex.brow * 0.2, 0, TAU); ctx.fill(); glow(ctx, x, y, 22, '#ffd27a', 0.7); ctx.strokeStyle = '#6a4a20'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - s * 20, y - 26 + ex.brow * 8 - ex.lift * 10); ctx.lineTo(x + s * 18, y - 30 - ex.lift * 10 - ex.brow * 3); ctx.stroke(); }
  ctx.save(); ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(220, 284 - ex.smile * 10); ctx.quadraticCurveTo(256, 296 + ex.smile * 10 + ex.open * 10, 292, 284 - ex.smile * 10); ctx.stroke();
  ctx.lineWidth = 1.5; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(226 + i * 12, 280 + Math.abs(i - 2.5) * 2); ctx.lineTo(226 + i * 12, 296 + Math.abs(i - 2.5) * 2); ctx.stroke(); } ctx.restore();
  ctx.save(); ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(422, 430); ctx.lineTo(420, 352); ctx.stroke(); ctx.restore();
  glow(ctx, 420, 320, 80, '#ffd27a', 0.8);
  part(ctx, (c) => { c.roundRect ? c.roundRect(398, 296, 44, 56, 8) : c.rect(398, 296, 44, 56); }, { base: '#ffe6a0', edge: 8, rim: '#ffffff', hl: [412, 310, 20], hlA: 1, box: [398, 296, 442, 352] });
  ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 3; ctx.strokeRect(398, 296, 44, 56); ctx.beginPath(); ctx.moveTo(420, 296); ctx.lineTo(420, 352); ctx.stroke();
  hand(ctx, 422, 452, 0.95, 0, 'fist', { color: '#8a6a3a', rim: '#f0f8c0', cuff: '#6a5a30' });
};
P.lisle = (ctx, ex) => {
  backdrop(ctx, '#8fd0ff', { seed: 33 });
  neck(ctx, '#c8d8e8', 256, 340, 24, '#ffffff');
  part(ctx, bust(140, 350), { base: '#d8e4f0', rim: '#ffffff', edge: 22, hl: [190, 390, 100], tex: (c) => { c.fillStyle = 'rgba(120,150,190,0.5)'; c.fillRect(150, 350, 212, 16); } });
  face(ctx, { cx: 256, cy: 246, w: 72, h: 88, skin: '#c8d8e8', iris_c: '#5a8ab0', brow: '#4a5a6a', lash: '#1a2a3a', lashes: true, rim: '#ffffff', cheek: '#a0b8e0', jaw: 0.8 }, ex);
  part(ctx, (c) => curve(c, [[180, 260], [182, 170], [226, 140], [290, 140], [332, 170], [334, 260], [314, 200], [256, 186], [198, 200]]), { base: '#5a6a80', edge: 8, rim: '#e0f0ff', hl: [230, 150, 50] });
  // halo and bubbles
  ctx.save(); ctx.strokeStyle = 'rgba(255,248,220,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(256, 128, 80, 18, 0, 0, TAU); ctx.stroke(); ctx.restore(); glow(ctx, 256, 128, 90, '#fff4d0', 0.4);
  const r = prng(34); for (let i = 0; i < 10; i++) { const x = 230 + r() * 120, y = 300 - i * 26, rr = 4 + r() * 8; ctx.strokeStyle = 'rgba(230,248,255,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.25, 0, TAU); ctx.fill(); }
  hand(ctx, 390, 458, 0.95, 0.1, 'open', { color: '#c8d8e8', rim: '#ffffff', cuff: '#d8e4f0' });
  const [bx, by] = handPoint(390, 458, 0.95, 0.1, 'open');
  ctx.strokeStyle = 'rgba(230,248,255,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by - 8, 26, 0, TAU); ctx.stroke(); glow(ctx, bx, by - 8, 40, '#d0f0ff', 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(bx - 9, by - 18, 6, 4, -0.6, 0, TAU); ctx.fill();
};
P.gilt = (ctx, ex) => {
  backdrop(ctx, '#ffcf6a', { seed: 35 });
  // brass wire body: coils
  part(ctx, bust(150, 350), { base: '#8a6020', rim: '#fff0b0', edge: 22, hl: [180, 390, 100], tex: (c) => { c.strokeStyle = 'rgba(255,220,130,0.6)'; c.lineWidth = 3; for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse(256, 360 + i * 18, 150 - i * 2, 8, 0, 0, Math.PI); c.stroke(); } } });
  const head = (c) => curve(c, [[256, 130], [322, 146], [348, 220], [334, 290], [290, 326], [256, 332], [222, 326], [178, 290], [164, 220], [190, 146]]);
  part(ctx, head, { base: '#c89040', edge: 20, hl: [215, 180, 80], hlA: 0.8, rim: '#fff4c0', tex: (c) => { c.strokeStyle = 'rgba(120,70,10,0.45)'; c.lineWidth = 2.5; for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(256, 130 + i * 15, 92 - Math.abs(i - 6) * 6, 5, 0, 0, Math.PI); c.stroke(); } } });
  // springy wire curl on top
  ctx.save(); ctx.strokeStyle = '#e8c060'; ctx.lineWidth = 4; ctx.beginPath(); for (let i = 0; i <= 60; i++) { const t = i / 60; const x = 256 + Math.cos(t * TAU * 4) * 14 + t * 10, y = 130 - t * 70 + Math.sin(t * TAU * 4) * 6; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
  // soot smudge and bright round eyes
  blob(ctx, 300, 260, 40, '#3a2a20', 0.35);
  for (const s of [-1, 1]) { const x = 256 + s * 42, y = 222; const h = 18 * Math.max(0.35, Math.min(1.3, ex.eye)); ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.ellipse(x, y, 18, h, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a2a10'; ctx.beginPath(); ctx.arc(x + ex.look[0] * 4, y + 2, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, TAU); ctx.fill(); ctx.strokeStyle = '#7a4a10'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - s * 18, y - 28 + ex.brow * 8 - ex.lift * 10); ctx.lineTo(x + s * 18, y - 32 - ex.lift * 10 - ex.brow * 3 - (ex.browUp && s > 0 ? 6 : 0)); ctx.stroke(); }
  mouth(ctx, 256, 290, 24, ex, { skin: '#c89040', lip: '#7a4a10' });
  ctx.save(); ctx.strokeStyle = '#5a3a18'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(394, 500); ctx.lineTo(394, 372); ctx.stroke(); ctx.restore();
  part(ctx, (c) => { c.rect(364, 344, 62, 30); }, { base: '#7a7a88', edge: 6, rim: '#fff0b0', hl: [376, 350, 20], hlA: 0.8, box: [364, 344, 426, 374] });
  glow(ctx, 426, 360, 20, '#ffb040', 0.6);
  hand(ctx, 394, 446, 0.95, 0, 'fist', { color: '#c89040', rim: '#fff4c0', cuff: '#8a6020' });
};
P.ash = (ctx, ex) => {
  backdrop(ctx, '#c9c9d6', { seed: 37, motes: 6, a: 0.4 });
  const lay = mk(D, D), g = lay.getContext('2d');
  neck(g, '#b0b0bc', 256, 330, 26, '#ffffff');
  part(g, bust(150, 340), { base: '#7a7a88', rim: '#ffffff', edge: 24, hl: [180, 380, 100] });
  face(g, { cx: 256, cy: 236, w: 78, h: 96, skin: '#b0b0bc', iris_c: '#8a8a98', brow: '#6a6a78', lash: '#4a4a58', rim: '#ffffff', cheek: '#a0a0b0', jaw: 0.78 }, ex);
  part(g, (c) => curve(c, [[170, 230], [176, 160], [226, 130], [292, 130], [340, 166], [344, 230], [318, 180], [256, 170], [196, 182]]), { base: '#8a8a96', edge: 8, rim: '#ffffff' });
  hand(g, 384, 458, 0.95, 0.1, 'pinch', { color: '#b0b0bc', rim: '#ffffff', cuff: '#7a7a88' });
  { const [cx2, cy2] = handPoint(384, 458, 0.95, 0.1, 'pinch'); g.save(); g.translate(cx2, cy2); g.rotate(0.5); g.fillStyle = '#f4f4f8'; g.fillRect(-5, -30, 10, 34); g.restore(); }
  // smudged into the void like chalk in rain
  g.save(); g.globalCompositeOperation = 'destination-out'; const r = prng(38);
  for (let i = 0; i < 70; i++) { const x = r() * D, y = (i < 12 ? 120 : 320) + r() * 200; const gr = g.createLinearGradient(x, y, x, y + 80); gr.addColorStop(0, i < 12 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 6, 80); }
  g.restore();
  ctx.globalAlpha = 0.9; ctx.drawImage(lay, 0, 0); ctx.globalAlpha = 1;
};

// ------------------------------------------------------------------ staging: mood light, pose and menace
const MENACE = new Set(['veyl', 'morrow', 'aurum', 'sable']);
function paint(ctx, speaker, painter, ex) {
  const color = SPEAKERS[speaker]?.color ?? '#f2c46b';
  ELEM = color;
  const menace = MENACE.has(speaker);
  if (menace && ex === EXPR.neutral) ex = { ...ex, brow: 0.45, lid: 0.4, squint: 0.15, shape: 'pressed', look: [0, 0] };
  else if (menace && ex === EXPR.happy) ex = { ...EXPR.wry, brow: 0.5, lid: 0.38, lidR: -0.1, squint: 0.3, shape: 'smirk', light: '#ff9040' };
  const ml = ex.light ?? color;
  // an aura behind the figure, in the element colour pulled toward the mood
  const auraC = mix(color, ml, ex.light ? 0.55 : 0);
  const ag = ctx.createRadialGradient(256, 230, 30, 256, 250, 300);
  ag.addColorStop(0, hexA(tint(auraC, 0.2), menace ? 0.35 : 0.45)); ag.addColorStop(0.55, hexA(auraC, menace ? 0.16 : 0.2)); ag.addColorStop(1, hexA(auraC, 0));
  ctx.fillStyle = ag; ctx.fillRect(0, 0, D, D);
  // the whole bust leans with the mood: drooping in sorrow, pressing forward in anger, pulling back in fright
  const [lean, dx, dy, sc] = ex.pose ?? [0, 0, 0, 1];
  ctx.save(); ctx.translate(256 + dx, 470 + dy); ctx.rotate(lean); ctx.scale(sc, sc); ctx.translate(-256, -470);
  painter(ctx, ex);
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  if (menace) {
    // lit from below by their own fire, the brow in shadow
    const u = ctx.createLinearGradient(0, D, 0, 0); u.addColorStop(0, hexA(color, 0.3)); u.addColorStop(0.45, hexA(color, 0)); ctx.fillStyle = u; ctx.fillRect(0, 0, D, D);
    const t = ctx.createLinearGradient(0, 0, 0, 260); t.addColorStop(0, 'rgba(6,2,12,0.5)'); t.addColorStop(1, 'rgba(6,2,12,0)'); ctx.fillStyle = t; ctx.fillRect(0, 0, D, D);
  }
  if (ex.light) {
    const k = { happy: 0.14, warm: 0.14, wry: 0.1, sad: 0.24, grave: 0.32, angry: 0.2, surprised: 0.12, afraid: 0.22 };
    const a = k[Object.keys(EXPR).find((n) => EXPR[n].light === ex.light)] ?? 0.12;
    let g;
    if (ex.light === EXPR.angry.light) { g = ctx.createLinearGradient(0, D, 0, 120); g.addColorStop(0, hexA(ml, a * 1.6)); g.addColorStop(1, hexA(ml, 0)); }
    else if (ex.light === EXPR.sad.light || ex.light === EXPR.grave.light) { g = ctx.createLinearGradient(0, 0, 0, D); g.addColorStop(0, hexA(ml, a * 1.4)); g.addColorStop(1, hexA(ml, a * 0.5)); }
    else { g = ctx.createLinearGradient(0, 0, D, D); g.addColorStop(0, hexA(ml, a * 1.3)); g.addColorStop(1, hexA(ml, 0)); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, D, D);
  }
  ctx.restore();
  finish(ctx, color);
}

// ------------------------------------------------------------------ public API
const cache = new Map();
const base = new Map(); // 512 design renders per speaker+mood, downscaled per size
export function hasPortrait(speaker) { return !!P[speaker]; }
export const PORTRAIT_SPEAKERS = Object.keys(P);

// every speaker with a painted portrait (the UI warms the dialogue size up in idle time)
export function portraitIds() { return Object.keys(P); }
export function getPortrait(speaker, mood = 'neutral', size = 256) {
  if (mood && typeof mood === 'object') { size = mood.size ?? 256; mood = mood.mood ?? 'neutral'; }
  if (typeof document === 'undefined') return null;
  const painter = P[speaker];
  if (!painter) return null;
  const m = EXPR[mood] ? mood : 'neutral';
  size = Math.max(16, Math.round(size));
  const key = `${speaker}|${m}|${size}`;
  let c = cache.get(key); if (c) return c;
  const bk = `${speaker}|${m}`;
  let full = base.get(bk);
  if (!full) {
    full = mk(D, D); const ctx = full.getContext('2d');
    try { paint(ctx, speaker, painter, exprFor(m)); } catch (e) { console.error('portrait', speaker, e); }
    base.set(bk, full);
  }
  if (size === D) c = full;
  else { // downscale in halving steps for a clean, soft result
    let src = full, s = D;
    while (s / 2 >= size * 1.01) { const h = mk(s / 2, s / 2); const hc = h.getContext('2d'); hc.imageSmoothingQuality = 'high'; hc.drawImage(src, 0, 0, s / 2, s / 2); src = h; s /= 2; }
    c = mk(size, size); const cc = c.getContext('2d'); cc.imageSmoothingQuality = 'high'; cc.drawImage(src, 0, 0, size, size);
  }
  cache.set(key, c);
  return c;
}
// painting kit shared with the world sprites (render/actors/npcs.js)
export const PAINT = { part: (ctx, b, o) => { const e = ELEM; ELEM = o.elem ?? "#e8d8c0"; part(ctx, b, o); ELEM = e; }, curve, blob, glow, strands, thread, hexA, mix, shade, tint, prng, mk, face, EXPR };

// warm the cache for a list of speakers (e.g. the hub cast) so the first line never hitches
export function preloadPortraits(speakers, moods = ['neutral'], size = 256) { for (const s of speakers) for (const m of moods) getPortrait(s, m, size); }
