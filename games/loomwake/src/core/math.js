export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const len = (x, y) => Math.hypot(x, y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const wrapAng = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const angDiff = (a, b) => wrapAng(b - a);
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
export const damp = (v, target, rate, dt) => lerp(v, target, 1 - Math.exp(-rate * dt));
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;
export function norm(x, y) { const l = Math.hypot(x, y); return l > 1e-9 ? [x / l, y / l] : [0, 0]; }
// Distance from point p to segment ab.
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
// (hot: every mover, every step. Index access, not `const [x, y] = p`: array destructuring runs the
// iterator protocol, ~15x slower here and an iterator result per vertex for the GC.)
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i], pj = poly[j], xi = pi[0], yi = pi[1], xj = pj[0], yj = pj[1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
export function mixHex(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(lerp((x >> s) & 255, (y >> s) & 255, t));
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}
