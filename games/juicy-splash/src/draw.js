// Shared drawing helpers. Everything in Juicy Splash is painted with Canvas
// 2D paths at runtime; there are no image files. Drawing functions paint
// into the context set with use(), so the same code fills sprites and the
// screen.
export let ctx = null;
export const use = g => { ctx = g; };
export const TAU = Math.PI * 2;

export function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hexCache = new Map();
export function hex(c) { let v = hexCache.get(c); if (!v) { const n = parseInt(c.slice(1), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; hexCache.set(c, v); } return v; }
export function rgba(c, a) { const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); }
export function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// Soft round glow. Baked once per colour into a small sprite, since a fresh
// radial gradient every frame is slow on software-rendered canvases.
const glowCache = new Map();
function glowSprite(c) {
  let cv = glowCache.get(c);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const gg = cv.getContext('2d'), gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.35, rgba(c, 0.35)); gr.addColorStop(1, rgba(c, 0));
    gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128); glowCache.set(c, cv);
  }
  return cv;
}
export function glow(x, y, r, c, a = 1, g = ctx) {
  if (r <= 0 || a <= 0) return;
  const was = g.globalAlpha; g.globalAlpha = was * Math.min(1, a);
  g.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2);
  g.globalAlpha = was;
}
export function additive(fn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(); ctx.restore(); }
// Irregular round blob (juice, clouds, bushes).
export function blob(g, x, y, r, seed, lobes = 7, amp = 0.18, sy = 1) {
  const R = rng(seed), ph = Array.from({ length: 3 }, () => R() * TAU), k = [lobes, lobes * 2 + 1, lobes * 3 + 2];
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * TAU;
    const m = 1 + amp * (Math.sin(a * k[0] + ph[0]) * 0.6 + Math.sin(a * k[1] + ph[1]) * 0.3 + Math.sin(a * k[2] + ph[2]) * 0.1);
    const px = x + Math.cos(a) * r * m, py = y + Math.sin(a) * r * m * sy;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}
// Symmetric shape from its right half: segs are cubic beziers [c1x,c1y,c2x,c2y,x,y].
export function sym(g, top, segs) {
  g.beginPath(); g.moveTo(top[0], top[1]);
  for (const s of segs) g.bezierCurveTo(...s);
  const pts = [top, ...segs.map(s => [s[4], s[5]])];
  for (let k = segs.length - 1; k >= 0; k--) { const s = segs[k], p = pts[k]; g.bezierCurveTo(-s[2], s[3], -s[0], s[1], -p[0], p[1]); }
  g.closePath();
}
export function starPath(g, x, y, r, rot = 0, pts = 5, inner = 0.48) {
  g.beginPath();
  for (let i = 0; i < pts * 2; i++) { const a = rot - Math.PI / 2 + i * Math.PI / pts, rr2 = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  g.closePath();
}
export function heartPath(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.3, y, x - r * 0.9, y - r * 1.0, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.9, y - r * 1.0, x + r * 1.3, y, x, y + r * 0.9); g.closePath();
}
// A chunky sticker star or heart with outline and gloss.
export function sticker(kind, x, y, r, rot = 0, col) {
  const g = ctx; g.save();
  if (kind === 'star') starPath(g, x, y, r, rot, 5, 0.5); else heartPath(g, x, y, r);
  g.lineJoin = 'round'; g.lineWidth = r * 0.32; g.strokeStyle = kind === 'star' ? '#b85a00' : '#a01848'; g.stroke();
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  if (kind === 'star') { gr.addColorStop(0, '#fffbd0'); gr.addColorStop(0.4, col || '#ffd93a'); gr.addColorStop(1, '#ff9e00'); }
  else { gr.addColorStop(0, '#ffd0e4'); gr.addColorStop(0.4, col || '#ff5c9a'); gr.addColorStop(1, '#e0206a'); }
  g.fillStyle = gr; g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(x - r * 0.28, y - r * 0.3, r * 0.2, r * 0.11, -0.6, 0, TAU); g.fill();
  g.restore();
}
export function sparkle(x, y, r, a = 1, col = '#ffffff') {
  const g = ctx; g.save(); g.globalAlpha = a; g.fillStyle = col;
  g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
  g.restore();
}
