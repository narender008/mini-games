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

// Paint a volume: fill, form shading from the key light (upper left), soft inner edge shadow, a highlight,
// a rim of coloured back light on the right, and an optional painterly stroke texture.
function part(ctx, build, o) {
  const base = o.base, b = o.box ?? [0, 0, D, D];
  ctx.save();
  ctx.beginPath(); build(ctx); ctx.fillStyle = base; ctx.fill();
  ctx.clip();
  // form: darker away from the light
  const [x0, y0, x1, y1] = b;
  const fx = Math.min(0, x0) - 60, fy = Math.min(0, y0) - 60, fw = Math.max(D, x1) - fx + 60, fh = Math.max(D, y1) - fy + 60;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, hexA(tint(base, 0.25), o.lightA ?? 0.55)); g.addColorStop(0.5, hexA(base, 0)); g.addColorStop(1, hexA(shade(base, 0.55), o.shadeA ?? 0.75));
  ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh);
  // inner edge shadow (roundness)
  if (o.edge !== 0) { ctx.beginPath(); build(ctx); const e = o.edge ?? 22; for (const [w, a] of [[e * 2.2, 0.16], [e * 1.2, 0.18], [e * 0.5, 0.22]]) { ctx.strokeStyle = hexA(shade(base, 0.7), a); ctx.lineWidth = w; ctx.stroke(); } }
  // highlight
  if (o.hl) { const [hx, hy, hr] = o.hl; const h = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr); h.addColorStop(0, hexA(tint(base, 0.6), o.hlA ?? 0.5)); h.addColorStop(1, hexA(tint(base, 0.6), 0)); ctx.fillStyle = h; ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2); }
  // texture strokes
  if (o.tex) o.tex(ctx);
  // rim light: the same outline, shifted toward the back light, seen only inside the shape
  if (o.rim) { ctx.translate(-(o.rimW ?? 6) * 0.8, (o.rimW ?? 6) * 0.25); ctx.beginPath(); build(ctx); ctx.strokeStyle = hexA(o.rim, o.rimA ?? 0.75); ctx.lineWidth = o.rimW ?? 6; ctx.stroke(); }
  ctx.restore();
  if (o.line) { ctx.save(); ctx.beginPath(); build(ctx); ctx.strokeStyle = o.line; ctx.lineWidth = o.lineW ?? 2; ctx.stroke(); ctx.restore(); }
}
function blob(ctx, x, y, r, color, a = 1, op = 'source-over') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
  const o = ctx.globalCompositeOperation; ctx.globalCompositeOperation = op; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalCompositeOperation = o;
}
const glow = (ctx, x, y, r, color, a = 1) => blob(ctx, x, y, r, color, a, 'lighter');
function strands(ctx, pts, n, spread, color, w, seed, a = 0.5) { // painterly hair or fibre strokes along a guide
  const r = prng(seed);
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const off = (r() - 0.5) * spread, off2 = (r() - 0.5) * spread;
    ctx.strokeStyle = hexA(color, a * (0.4 + r() * 0.6)); ctx.lineWidth = w * (0.5 + r());
    ctx.beginPath(); curve(ctx, pts.map(([x, y], j) => [x + off + (off2 - off) * (j / pts.length), y + (r() - 0.5) * 4]), false); ctx.stroke();
  }
  ctx.restore();
}
function thread(ctx, pts, color, w = 3, a = 1) {
  ctx.save(); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
  for (const [k, al] of [[5, 0.12], [2.2, 0.35], [1, 1]]) { ctx.strokeStyle = hexA(color, al * a); ctx.lineWidth = w * k; ctx.beginPath(); curve(ctx, pts, false); ctx.stroke(); }
  ctx.restore();
}

// ------------------------------------------------------------------ expressions
const EXPR = {
  neutral: { brow: 0, lift: 0, eye: 1, smile: 0.05, open: 0, smirk: 0, look: [0, 0] },
  happy: { brow: -0.15, lift: 0.12, eye: 0.62, smile: 0.95, open: 0.4, smirk: 0, look: [0, 0], cheek: 1 },
  warm: { brow: -0.25, lift: 0.06, eye: 0.82, smile: 0.55, open: 0.05, smirk: 0, look: [0, 0], cheek: 0.6 },
  wry: { brow: 0.15, lift: 0.1, eye: 0.84, smile: 0.35, open: 0, smirk: 1, look: [0.25, 0], browUp: 1 },
  sad: { brow: -0.9, lift: 0.12, eye: 0.68, smile: -0.5, open: 0, smirk: 0, look: [0, 0.3] },
  grave: { brow: 0.45, lift: -0.05, eye: 0.82, smile: -0.2, open: 0, smirk: 0, look: [0, 0.05] },
  angry: { brow: 1, lift: -0.1, eye: 0.88, smile: -0.6, open: 0.35, smirk: 0, look: [0, 0], teeth: 1 },
  surprised: { brow: -0.35, lift: 0.6, eye: 1.28, smile: 0, open: 0.75, smirk: 0, look: [0, 0] },
  afraid: { brow: -1, lift: 0.4, eye: 1.18, smile: -0.4, open: 0.3, smirk: 0, look: [-0.25, 0.1] },
};
export const MOODS = Object.keys(EXPR);
const exprFor = (mood) => EXPR[mood] ?? EXPR.neutral;

// ------------------------------------------------------------------ face kit (human-ish faces)
// eye at (x, y): w half width, h half height, side -1 left / +1 right of the face
function eye(ctx, x, y, w, h, side, ex, o) {
  const open = Math.max(0.08, ex.eye) * h;
  const tilt = (o.tilt ?? 0.08) * side + (ex.brow < -0.5 ? -0.1 * side : 0);
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  // socket shadow
  blob(ctx, 0, -h * 0.4, w * 1.5, shade(o.skin, 0.45), 0.35);
  const lower = ex.smile > 0.6 ? open * 0.25 : open * 0.75;
  const almond = (c) => { c.moveTo(-w, 0); c.bezierCurveTo(-w * 0.5, -open * 1.25, w * 0.5, -open * 1.25, w, -open * 0.1); c.bezierCurveTo(w * 0.5, lower * 1.1, -w * 0.5, lower * 1.1, -w, 0); c.closePath(); };
  if (ex.eye < 0.2 || o.closed) { // closed lids
    ctx.strokeStyle = o.lash ?? '#2a1620'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, h * 0.55, w, -h * 0.05); ctx.stroke();
    ctx.restore(); return;
  }
  ctx.save(); ctx.beginPath(); almond(ctx); ctx.fillStyle = o.white ?? '#f4ece6'; ctx.fill(); ctx.clip();
  // iris
  const ir = h * (o.iris ?? 0.95), lx = (ex.look?.[0] ?? 0) * w * 0.35, ly = (ex.look?.[1] ?? 0) * h * 0.4;
  const ig = ctx.createRadialGradient(lx, ly - ir * 0.3, ir * 0.1, lx, ly, ir);
  ig.addColorStop(0, tint(o.iris_c, 0.35)); ig.addColorStop(0.65, o.iris_c); ig.addColorStop(1, shade(o.iris_c, 0.6));
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(lx, ly, ir, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0c0610'; ctx.beginPath(); ctx.arc(lx, ly, ir * (ex.eye > 1.1 ? 0.32 : 0.42), 0, TAU); ctx.fill();
  if (o.glowEye) glow(ctx, lx, ly, ir * 2.2, o.glowEye, 0.6);
  // lid shadow across the top of the eye
  const ls = ctx.createLinearGradient(0, -open, 0, open * 0.2); ls.addColorStop(0, 'rgba(30,10,20,0.55)'); ls.addColorStop(1, 'rgba(30,10,20,0)');
  ctx.fillStyle = ls; ctx.fillRect(-w, -open * 1.3, w * 2, open * 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(lx - ir * 0.35, ly - ir * 0.4, ir * 0.22, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(lx + ir * 0.35, ly + ir * 0.3, ir * 0.1, 0, TAU); ctx.fill();
  ctx.restore();
  // upper lid line and lashes
  ctx.strokeStyle = o.lash ?? '#2a1620'; ctx.lineCap = 'round'; ctx.lineWidth = o.lashW ?? 4;
  ctx.beginPath(); ctx.moveTo(-w * 1.05, 0.5); ctx.bezierCurveTo(-w * 0.5, -open * 1.28, w * 0.5, -open * 1.28, w * 1.08, -open * 0.12); ctx.stroke();
  if (o.lashes) { ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const t = 0.55 + i * 0.2; const px = w * (t * 2 - 1) * 0.9 + w * 0.15, py = -open * (1.1 - Math.abs(t - 0.6)); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + side * 6 + 4, py - 6); ctx.stroke(); } }
  // crease
  ctx.strokeStyle = hexA(shade(o.skin, 0.5), 0.5); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-w * 0.8, -open * 1.2 - 5); ctx.quadraticCurveTo(0, -open * 1.55 - 7, w * 0.85, -open * 0.6 - 6); ctx.stroke();
  // lower lid
  ctx.strokeStyle = hexA(shade(o.skin, 0.45), 0.55); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-w * 0.85, 2); ctx.quadraticCurveTo(0, lower * 1.15 + 2, w * 0.9, 0); ctx.stroke();
  ctx.restore();
}
function brow(ctx, x, y, w, side, ex, o) {
  const up = (ex.lift + (ex.browUp && side > 0 ? 0.35 : 0)) * 14;
  const inner = ex.brow * 9, outer = -ex.brow * 3;
  ctx.save(); ctx.strokeStyle = o.brow ?? '#3a2018'; ctx.lineCap = 'round';
  const pts = [[x - side * w, y - up + inner], [x, y - up - 5 + inner * 0.3], [x + side * w, y - up + 2 + outer]];
  for (let i = 0; i < 3; i++) { ctx.lineWidth = (o.browW ?? 6) - i * 1.6; ctx.globalAlpha = 0.6 + i * 0.2; ctx.beginPath(); curve(ctx, pts.map(([px, py]) => [px, py - i]), false); ctx.stroke(); }
  ctx.restore();
}
function mouth(ctx, x, y, w, ex, o) {
  const sm = ex.smile, op = ex.open, sk = ex.smirk ?? 0;
  const ly = y - sm * 9 - sk * 2, ry = y - sm * 9 - sk * 9;
  const lip = o.lip ?? shade(mix(o.skin, '#c04050', 0.45), 0.1);
  ctx.save(); ctx.lineCap = 'round';
  if (op > 0.05) {
    const h = op * 26;
    ctx.beginPath(); ctx.moveTo(x - w, ly); ctx.quadraticCurveTo(x, y + sm * 7 - 2, x + w, ry); ctx.quadraticCurveTo(x, y + h + sm * 10, x - w, ly); ctx.closePath();
    ctx.fillStyle = '#3a1220'; ctx.fill();
    ctx.save(); ctx.clip();
    if (sm > 0.3 || ex.teeth) { ctx.fillStyle = '#f6ece4'; ctx.fillRect(x - w, y - 12, w * 2, 8 + (ex.teeth ? 2 : 0) + sm * 4); }
    ctx.fillStyle = '#c0505a'; ctx.beginPath(); ctx.ellipse(x, y + h + sm * 6, w * 0.6, h * 0.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = lip; ctx.lineWidth = 2.5; ctx.stroke();
  } else {
    ctx.strokeStyle = shade(lip, 0.35); ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(x - w, ly); ctx.quadraticCurveTo(x, y + sm * 9, x + w, ry); ctx.stroke();
  }
  // lower lip light and corner shadows
  blob(ctx, x, y + 7 + op * 22 + Math.max(0, sm) * 6, w * 0.55, lip, 0.35);
  blob(ctx, x - 2, y + 6 + op * 22 + Math.max(0, sm) * 6, w * 0.22, '#fff0e8', 0.22);
  blob(ctx, x, y + 17 + op * 22 + Math.max(0, sm) * 6, w * 0.45, shade(o.skin, 0.5), 0.18);
  if (sm > 0.3) { ctx.strokeStyle = hexA(shade(o.skin, 0.45), 0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x - w - 4, ly - 4, 7, 0.8, 2.2); ctx.stroke(); ctx.beginPath(); ctx.arc(x + w + 4, ry - 4, 7, 0.9, 2.3); ctx.stroke(); }
  ctx.restore();
}
// a whole face. o: { cx, cy, w, h, skin, iris_c, brow, hairline?, jaw, nose, cheek, freckles, ... }
function face(ctx, o, ex) {
  const { cx, cy, w, h } = o;
  const jaw = o.jaw ?? 0.82;
  const build = (c) => curve(c, [[cx, cy - h], [cx + w * 0.82, cy - h * 0.78], [cx + w, cy - h * 0.2], [cx + w * 0.92, cy + h * 0.35], [cx + w * 0.55 * jaw, cy + h * 0.82], [cx, cy + h], [cx - w * 0.55 * jaw, cy + h * 0.82], [cx - w * 0.92, cy + h * 0.35], [cx - w, cy - h * 0.2], [cx - w * 0.82, cy - h * 0.78]]);
  part(ctx, build, { base: o.skin, box: [cx - w, cy - h, cx + w * 1.2, cy + h * 1.1], edge: w * 0.18, hl: [cx - w * 0.35, cy - h * 0.35, w * 0.9], hlA: 0.4, rim: o.rim, rimW: 5, rimA: 0.6 });
  // cheeks
  const ck = 0.18 + (ex.cheek ?? 0) * 0.22 + (o.blush ?? 0);
  blob(ctx, cx - w * 0.55, cy + h * 0.22, w * 0.38, o.cheek ?? '#e07070', ck);
  blob(ctx, cx + w * 0.55, cy + h * 0.22, w * 0.38, o.cheek ?? '#e07070', ck * 0.8);
  if (o.freckles) { const r = prng(5); ctx.fillStyle = hexA(shade(o.skin, 0.35), 0.5); for (let i = 0; i < 18; i++) { const sx = (r() < 0.5 ? -1 : 1); ctx.beginPath(); ctx.arc(cx + sx * w * (0.3 + r() * 0.35), cy + h * (0.05 + r() * 0.25), 1.3 + r(), 0, TAU); ctx.fill(); } }
  // nose: a soft shadow down the far side, a lit bridge, nostrils
  const ny = cy + h * 0.3;
  blob(ctx, cx + w * 0.1, ny - h * 0.1, w * 0.16, shade(o.skin, 0.4), 0.28);
  ctx.strokeStyle = hexA(shade(o.skin, 0.5), 0.32); ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx + w * 0.08, cy + h * 0.06); ctx.quadraticCurveTo(cx + w * 0.13, ny - 2, cx + w * 0.06, ny + 4); ctx.stroke();
  blob(ctx, cx - w * 0.04, ny - h * 0.06, w * 0.1, tint(o.skin, 0.7), 0.45);
  ctx.strokeStyle = hexA(shade(o.skin, 0.55), 0.45); ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(cx - w * 0.12, ny + 4); ctx.quadraticCurveTo(cx - w * 0.02, ny + 9, cx + w * 0.12, ny + 4); ctx.stroke();
  // shade under the brow ridge and along the far cheek
  blob(ctx, cx + w * 0.75, cy + h * 0.1, w * 0.5, shade(o.skin, 0.5), 0.18);
  // eyes and brows
  const ey = cy - h * 0.08, ew = w * (o.eyeW ?? 0.28), eh = w * (o.eyeH ?? 0.185), ex0 = w * (o.eyeX ?? 0.43);
  const eo = { skin: o.skin, iris_c: o.iris_c ?? '#5a3a2a', lash: o.lash, lashes: o.lashes, white: o.white, glowEye: o.glowEye, closed: o.closed, iris: o.iris, tilt: o.tilt };
  eye(ctx, cx - ex0, ey, ew, eh, -1, ex, eo); eye(ctx, cx + ex0, ey, ew, eh, 1, ex, eo);
  if (o.brows !== false) { brow(ctx, cx - ex0, ey - eh * 2.3, ew * 1.05, -1, ex, o); brow(ctx, cx + ex0, ey - eh * 2.3, ew * 1.05, 1, ex, o); }
  mouth(ctx, cx + w * 0.02, cy + h * 0.56, w * (o.mouthW ?? 0.26), ex, o);
  return build;
}

// ------------------------------------------------------------------ backgrounds and finishing
function backdrop(ctx, color, o = {}) {
  const g = ctx.createRadialGradient(256, 210, 20, 256, 256, 330);
  g.addColorStop(0, hexA(tint(color, 0.15), o.a ?? 0.55)); g.addColorStop(0.45, hexA(shade(color, 0.55), 0.55)); g.addColorStop(0.8, hexA(shade(color, 0.85), 0.35)); g.addColorStop(1, hexA(shade(color, 0.9), 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, D, D);
  const r = prng(o.seed ?? 1);
  for (let i = 0; i < (o.motes ?? 14); i++) glow(ctx, r() * D, r() * D * 0.8, 6 + r() * 16, tint(color, 0.4), 0.18 + r() * 0.2);
}
let grain = null;
function finish(ctx, color) {
  if (!grain) { grain = mk(256, 256); const g = grain.getContext('2d'); const r = prng(9); for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,240,220,0.05)' : 'rgba(0,0,0,0.07)'; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1); } }
  ctx.save(); ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(grain, 0, 0, D, D);
  // warm key light wash and coloured bounce from below-right
  const k = ctx.createLinearGradient(0, 0, D, D); k.addColorStop(0, 'rgba(255,220,170,0.10)'); k.addColorStop(1, hexA(color, 0.12)); ctx.fillStyle = k; ctx.fillRect(0, 0, D, D);
  // fade to transparent at the edges (bottom fades into the dialogue plate)
  ctx.globalCompositeOperation = 'destination-in';
  const m = ctx.createRadialGradient(256, 230, 200, 256, 256, 365); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = m; ctx.fillRect(0, 0, D, D);
  ctx.restore();
}

// shoulders/bust silhouette helpers
const bust = (w, top, cx = 256) => (c) => curve(c, [[cx - w, D + 40], [cx - w * 0.98, top + 90], [cx - w * 0.7, top + 20], [cx - w * 0.3, top], [cx + w * 0.3, top], [cx + w * 0.7, top + 20], [cx + w * 0.98, top + 90], [cx + w, D + 40]]);
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
  part(ctx, (c) => curve(c, [[170, 190], [200, 140], [256, 128], [318, 140], [346, 196], [320, 176], [292, 186], [262, 168], [236, 186], [206, 176]]), { base: '#6a2a1a', edge: 8, hl: [230, 150, 50], tex: (c) => strands(c, [[180, 180], [230, 140], [300, 150], [340, 190]], 26, 30, '#c07040', 1.5, 3, 0.5) });
  // golden scarf around the neck, trailing
  part(ctx, (c) => curve(c, [[150, 360], [256, 400], [362, 362], [372, 400], [256, 450], [140, 404]]), { base: '#f2a93b', rim: '#fff0b0', edge: 14, hl: [210, 380, 80], hlA: 0.7 });
  part(ctx, (c) => curve(c, [[330, 400], [380, 420], [440, 470], [470, 520], [420, 520], [370, 470], [320, 440]]), { base: '#ff9a3a', rim: '#fff0b0', edge: 12 });
  thread(ctx, [[150, 380], [256, 422], [362, 382]], '#ffe19a', 2, 0.7);
  thread(ctx, [[340, 420], [400, 450], [455, 510]], '#ffe19a', 1.6, 0.6);
  // gold trim on the hood edge
  ctx.save(); ctx.strokeStyle = '#f2c46b'; ctx.lineWidth = 4; ctx.beginPath(); curve(ctx, [[256, 118], [330, 140], [358, 220], [350, 310]], false); ctx.stroke(); ctx.restore();
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
  ctx.save(); ctx.strokeStyle = '#2a1a30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(330, 470); ctx.lineTo(420, 330); ctx.stroke(); part(ctx, (c) => curve(c, [[420, 330], [440, 300], [446, 360], [408, 350]]), { base: '#f6f0e0', edge: 4 }); ctx.restore();
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
  // the veil over everything
  ctx.save(); for (let i = 0; i < 7; i++) { const x = 40 + i * 72; const g = ctx.createLinearGradient(x, 0, x + 60, 0); g.addColorStop(0, 'rgba(255,248,230,0)'); g.addColorStop(0.5, 'rgba(255,248,230,0.13)'); g.addColorStop(1, 'rgba(255,248,230,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 40, 256, x + 10, D); ctx.lineTo(x + 70, D); ctx.quadraticCurveTo(x + 100, 256, x + 60, 0); ctx.fill(); } ctx.restore();
};

// ---------------------------------------------------------------- Sable (masked) and Sable (unmasked)
function sableCloak(ctx) {
  const r = prng(51);
  for (let i = 0; i < 40; i++) { const x = 60 + r() * 400; thread(ctx, [[x, 330 + r() * 60], [x + (r() - 0.5) * 80, 430], [x + (r() - 0.5) * 140, 540]], '#6a5aaa', 1, 0.35); }
  part(ctx, bust(200, 330), { base: '#120c20', rim: '#a898ff', edge: 30, hl: [170, 380, 120], hlA: 0.25 });
  part(ctx, (c) => curve(c, [[256, 70], [356, 104], [396, 210], [392, 330], [350, 410], [256, 430], [162, 410], [120, 330], [116, 210], [156, 104]]), { base: '#16102a', rim: '#a898ff', edge: 36, hl: [190, 140, 130], hlA: 0.2, rimW: 8, tex: (c) => strands(c, [[150, 120], [256, 80], [360, 120]], 40, 300, '#3a2a6a', 1.5, 52, 0.5) });
  part(ctx, (c) => curve(c, [[256, 116], [332, 140], [360, 222], [352, 312], [256, 362], [160, 312], [152, 222], [180, 140]]), { base: '#05030a', edge: 30, rim: null, lightA: 0 });
}
P.sable = (ctx, ex) => {
  backdrop(ctx, '#8a7cff', { seed: 8 });
  sableCloak(ctx);
  // porcelain mask, tilted by mood
  const tilt = ex.brow * 0.05 + (ex.smirk ? -0.08 : 0) + (ex.brow < -0.5 ? 0.06 : 0);
  ctx.save(); ctx.translate(256, 236); ctx.rotate(tilt); ctx.translate(-256, -236);
  const mask = (c) => curve(c, [[256, 142], [318, 160], [338, 226], [326, 290], [292, 330], [256, 342], [220, 330], [186, 290], [174, 226], [194, 160]]);
  part(ctx, mask, { base: '#e4e0f0', edge: 18, hl: [225, 190, 70], hlA: 0.8, rim: '#c0b0ff', box: [174, 142, 338, 342] });
  // a hairline crack
  ctx.strokeStyle = 'rgba(40,30,70,0.6)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(300, 160); ctx.lineTo(288, 196); ctx.lineTo(296, 214); ctx.lineTo(282, 250); ctx.stroke();
  // eye slits glowing violet; shape carries the mood
  for (const s of [-1, 1]) {
    const x = 256 + s * 38, y = 228, w = 26, h = 6 * Math.min(1.4, Math.max(0.5, ex.eye)), slope = ex.brow * 0.25 * -s;
    ctx.save(); ctx.translate(x, y); ctx.rotate(slope);
    ctx.fillStyle = '#05030a'; ctx.beginPath(); ctx.ellipse(0, 0, w, h + 2, 0, 0, TAU); ctx.fill();
    glow(ctx, 0, 0, 30, '#9a7cff', 0.9); ctx.fillStyle = '#e0d4ff'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.55, h * 0.45, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // mouth line, barely there
  ctx.strokeStyle = 'rgba(60,40,90,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(236, 300); ctx.quadraticCurveTo(256, 302 + ex.smile * 4, 276, 300 - (ex.smirk ?? 0) * 4); ctx.stroke();
  ctx.restore();
};
P.sable_bare = (ctx, ex) => {
  backdrop(ctx, '#b3a8ff', { seed: 9 });
  sableCloak(ctx);
  const skin = '#d8cce0';
  neck(ctx, skin, 256, 330, 30, '#c0b0ff');
  face(ctx, { cx: 256, cy: 238, w: 82, h: 100, skin, iris_c: '#8a6aff', glowEye: '#8a7cff', brow: '#1a1028', lash: '#0a0612', lashes: true, rim: '#c0b0ff', cheek: '#a080c0', jaw: 0.7, tilt: 0.14 }, ex);
  // the scar of the cut, a thin line across the face
  ctx.save(); ctx.strokeStyle = 'rgba(120,90,200,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(196, 180); ctx.quadraticCurveTo(250, 236, 318, 300); ctx.stroke(); glow(ctx, 256, 240, 40, '#8a7cff', 0.15); ctx.restore();
  // black thread hair
  part(ctx, (c) => curve(c, [[160, 236], [164, 156], [220, 120], [304, 122], [354, 166], [352, 238], [328, 186], [292, 172], [258, 190], [222, 168], [190, 188]]), { base: '#0e0a1a', edge: 10, hl: [230, 140, 60], hlA: 0.2, rim: '#a898ff', tex: (c) => strands(c, [[170, 200], [240, 130], [340, 170]], 40, 40, '#5a4a9a', 1.2, 53, 0.6) });
  // black scarf, mirror of Iri's
  part(ctx, (c) => curve(c, [[150, 362], [256, 402], [362, 364], [372, 402], [256, 452], [140, 406]]), { base: '#1a1030', rim: '#a898ff', edge: 14, hl: [210, 380, 80], hlA: 0.3 });
  part(ctx, (c) => curve(c, [[182, 400], [132, 420], [72, 470], [42, 520], [92, 520], [142, 470], [192, 440]]), { base: '#140c26', rim: '#a898ff', edge: 12 });
  thread(ctx, [[150, 382], [256, 424], [362, 384]], '#8a7cff', 1.6, 0.6);
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
}
P.solenne = (ctx, ex) => patronBase(ctx, ex, { color: '#ffc35a', seed: 11, robe: '#c08a2a', skin: '#f6dcb0', hair: '#f0c060', iris: '#c07a10', jaw: 0.72, lashes: true,
  behind: (c) => { for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; c.save(); c.translate(256, 200); c.rotate(a); const g = c.createLinearGradient(0, 0, 230, 0); g.addColorStop(0, 'rgba(255,220,120,0.6)'); g.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(90, -6); c.lineTo(230 + (i % 2) * 40, 0); c.lineTo(90, 6); c.fill(); c.restore(); } glow(c, 256, 200, 160, '#ffd27a', 0.5); },
  hairBack: (c) => curve(c, [[256, 106], [336, 124], [362, 210], [350, 320], [320, 360], [300, 300], [212, 300], [192, 360], [162, 320], [150, 210], [176, 124]]),
  front: (c) => { part(c, (k) => curve(k, [[176, 156], [216, 112], [256, 100], [296, 112], [336, 156], [300, 142], [256, 134], [212, 142]]), { base: '#ffe080', edge: 6, rim: '#ffffff', hl: [240, 116, 40], hlA: 0.8 }); glow(c, 256, 116, 30, '#ffffff', 0.8); } });
P.maru = (ctx, ex) => patronBase(ctx, ex, { color: '#5ec8ff', seed: 12, robe: '#1a5a8a', skin: '#a8d8f0', hair: '#2a7ac0', iris: '#0a4a8a', jaw: 0.9, cheek: '#80a0e0',
  hairBack: (c) => curve(c, [[256, 104], [350, 130], [392, 230], [400, 360], [360, 420], [330, 340], [182, 340], [152, 420], [112, 360], [120, 230], [162, 130]]),
  robeTex: (c) => { c.strokeStyle = 'rgba(200,240,255,0.35)'; c.lineWidth = 3; for (let i = 0; i < 5; i++) { c.beginPath(); for (let x = 60; x <= 460; x += 20) { const y = 380 + i * 26 + Math.sin(x * 0.05 + i) * 7; x === 60 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); } },
  front: (c) => { part(c, (k) => curve(k, [[170, 210], [176, 150], [222, 118], [300, 120], [344, 160], [350, 210], [326, 176], [290, 164], [256, 180], [222, 164], [190, 178]]), { base: '#3a90d8', edge: 8, rim: '#c0f0ff', hl: [230, 130, 50], tex: (k) => { k.strokeStyle = 'rgba(220,250,255,0.5)'; k.lineWidth = 2.5; for (let i = 0; i < 4; i++) { k.beginPath(); k.arc(200 + i * 40, 160, 16, Math.PI, 0); k.stroke(); } } }); glow(c, 256, 330, 16, '#ffffff', 0.9); c.fillStyle = '#f0f8ff'; c.beginPath(); c.arc(256, 330, 7, 0, TAU); c.fill(); } });
P.veyra = (ctx, ex) => patronBase(ctx, ex, { color: '#a6f6ff', seed: 13, robe: '#2a3a6a', skin: '#e0e8f8', hair: '#60d8f0', iris: '#2ab0d0', jaw: 0.78, lashes: true, tilt: 0.12,
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
  ctx.save(); ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(214, 330 - ex.smile * 8); ctx.lineTo(240, 334 + ex.smile * 3); ctx.lineTo(272, 332 + ex.smile * 3); ctx.lineTo(298, 330 - ex.smile * 8 - (ex.smirk ?? 0) * 6); ctx.stroke(); if (ex.open > 0.2) glow(ctx, 256, 336, 30, '#ffb040', 0.5); ctx.restore();
};
P.ilu = (ctx, ex) => patronBase(ctx, ex, { color: '#b07cff', seed: 16, robe: '#2a1a4a', skin: '#c8b8e8', hair: '#3a2060', iris: '#7a40d0', jaw: 0.74, lashes: true, cheek: '#b080d0', tilt: 0.16,
  behind: (c) => { c.save(); c.fillStyle = 'rgba(230,220,255,0.75)'; c.beginPath(); c.arc(340, 110, 60, 0, TAU); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(362, 96, 56, 0, TAU); c.fill(); c.restore(); glow(c, 330, 120, 90, '#c0a0ff', 0.4); },
  hairBack: (c) => curve(c, [[256, 100], [346, 120], [380, 230], [376, 400], [330, 380], [300, 300], [212, 300], [182, 380], [136, 400], [132, 230], [166, 120]]),
  front: (c) => { part(c, (k) => curve(k, [[168, 260], [164, 160], [220, 116], [300, 116], [348, 160], [354, 214], [320, 170], [270, 150], [230, 168], [200, 210]]), { base: '#3a2060', edge: 10, rim: '#d0b0ff', hl: [250, 130, 50], hlA: 0.3 });
    // half the face in shadow
    c.save(); const g = c.createLinearGradient(200, 0, 300, 0); g.addColorStop(0, 'rgba(20,8,40,0.55)'); g.addColorStop(1, 'rgba(20,8,40,0)'); c.fillStyle = g; c.beginPath(); curve(c, [[256, 136], [256, 340], [176, 300], [170, 200]]); c.fill(); c.restore(); } });
P.kestrel = (ctx, ex) => patronBase(ctx, ex, { color: '#8ff5b0', seed: 17, robe: '#2a6a4a', skin: '#e8e0c8', hair: '#4a8a5a', iris: '#2a9a5a', jaw: 0.74, lashes: true, tilt: 0.16,
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
  glow(ctx, 430, 360, 70, '#ffd27a', 0.6);
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
};
P.ash = (ctx, ex) => {
  backdrop(ctx, '#c9c9d6', { seed: 37, motes: 6, a: 0.4 });
  const lay = mk(D, D), g = lay.getContext('2d');
  neck(g, '#b0b0bc', 256, 330, 26, '#ffffff');
  part(g, bust(150, 340), { base: '#7a7a88', rim: '#ffffff', edge: 24, hl: [180, 380, 100] });
  face(g, { cx: 256, cy: 236, w: 78, h: 96, skin: '#b0b0bc', iris_c: '#8a8a98', brow: '#6a6a78', lash: '#4a4a58', rim: '#ffffff', cheek: '#a0a0b0', jaw: 0.78 }, ex);
  part(g, (c) => curve(c, [[170, 230], [176, 160], [226, 130], [292, 130], [340, 166], [344, 230], [318, 180], [256, 170], [196, 182]]), { base: '#8a8a96', edge: 8, rim: '#ffffff' });
  // smudged into the void like chalk in rain
  g.save(); g.globalCompositeOperation = 'destination-out'; const r = prng(38);
  for (let i = 0; i < 70; i++) { const x = r() * D, y = (i < 12 ? 120 : 320) + r() * 200; const gr = g.createLinearGradient(x, y, x, y + 80); gr.addColorStop(0, i < 12 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 6, 80); }
  g.restore();
  ctx.globalAlpha = 0.9; ctx.drawImage(lay, 0, 0); ctx.globalAlpha = 1;
};

// ------------------------------------------------------------------ public API
const cache = new Map();
const base = new Map(); // 512 design renders per speaker+mood, downscaled per size
export function hasPortrait(speaker) { return !!P[speaker]; }
export const PORTRAIT_SPEAKERS = Object.keys(P);

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
    try { painter(ctx, exprFor(m)); finish(ctx, SPEAKERS[speaker]?.color ?? '#f2c46b'); } catch (e) { console.error('portrait', speaker, e); }
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
export const PAINT = { part, curve, blob, glow, strands, thread, hexA, mix, shade, tint, prng, mk, face, EXPR };

// warm the cache for a list of speakers (e.g. the hub cast) so the first line never hitches
export function preloadPortraits(speakers, moods = ['neutral'], size = 256) { for (const s of speakers) for (const m of moods) getPortrait(s, m, size); }
