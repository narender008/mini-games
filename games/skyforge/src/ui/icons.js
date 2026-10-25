// Painted medallion icons (concepts 2, 3, 5 and 6): a brass-rimmed disc with a
// hand-painted glyph, for every resource, building, research topic, ability,
// ship and UI glyph. All Canvas 2D, cached per id/size/style/dpr.
//
//   icon(id, size = 40, opts) -> <canvas> (a fresh copy, CSS size `size` px)
//   iconURL(id, size = 40, opts) -> cached data: URL (for <img> and CSS)
//   glyph(g, id, x, y, scale) paints the bare glyph into any context (~24 units wide at scale 1)
//   hasGlyph(id), GLYPH_IDS
// opts.style: 'navy' (default: HUD and build bar), 'parchment' (research and cards),
//   'gold' (selected), 'grey' (locked), 'plain' (glyph only, no disc).
// opts.ring: a colour for an inner ring; opts.badge: 'check' | 'lock' | 'warn'.
import { TAU, BRASS, BRASS_D, rgba, mix, shade, pathPts, rr, ell, circ, glow, vgrad, face, puff, layer, DPR, SERIF } from './panelkit.js';

const OUTL = 'rgba(30,16,24,0.85)';
let lw = 1.4; // outline width in glyph units (bumped for tiny sizes)
const o = (g) => { g.strokeStyle = OUTL; g.lineWidth = lw; g.stroke(); };
const fillO = (g, f) => { g.fillStyle = f; g.fill(); o(g); };
const metal = (g, y0, y1, c = ['#eef2f6', '#9aa6b4', '#5a6474']) => vgrad(g, y0, y1, [[0, c[0]], [0.55, c[1]], [1, c[2]]]);
const brassG = (g, y0, y1) => vgrad(g, y0, y1, [[0, '#fbe3a0'], [0.5, '#e0a948'], [1, '#9a6420']]);
const woodG = (g, y0, y1) => vgrad(g, y0, y1, [[0, '#d39a62'], [1, '#7a4a2a']]);

function gear(g, x, y, r, teeth = 8, hole = 0.32, fill) {
  g.beginPath();
  const n = teeth * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, R = i % 2 ? r * 0.74 : r, w = (Math.PI / n) * 0.62;
    g.lineTo(x + Math.cos(a - w) * R, y + Math.sin(a - w) * R); g.lineTo(x + Math.cos(a + w) * R, y + Math.sin(a + w) * R);
  }
  g.closePath(); g.fillStyle = fill || brassG(g, y - r, y + r); g.fill(); o(g);
  circ(g, x, y, r * hole); g.fillStyle = '#2c2a58'; g.fill(); o(g);
}
function boltShape(g, s = 1, x = 0, y = 0) { pathPts(g, [[x + 2 * s, y - 12 * s], [x - 7 * s, y + 2 * s], [x - 1 * s, y + 2 * s], [x - 3 * s, y + 12 * s], [x + 7 * s, y - 3 * s], [x + 1 * s, y - 3 * s]]); }
function balloon(g, x, y, s, env = ['#f8ecd2', '#c09070'], band) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = '#4a3428'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, 2); g.lineTo(-4, 8); g.moveTo(6, 2); g.lineTo(4, 8); g.stroke();
  g.beginPath(); g.moveTo(-10, -4); g.bezierCurveTo(-10, -16, 10, -16, 10, -4); g.quadraticCurveTo(8, 2, 0, 3); g.quadraticCurveTo(-8, 2, -10, -4); g.closePath();
  g.fillStyle = vgrad(g, -14, 3, [[0, shade(env[0], 0.2)], [0.5, env[0]], [1, env[1]]]); g.fill(); o(g);
  if (band) { g.save(); g.clip(); g.fillStyle = band; g.fillRect(-12, -6, 24, 3.4); g.restore(); }
  g.strokeStyle = rgba('#6a4a3a', 0.45); g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 2.5); g.moveTo(-5, -11); g.quadraticCurveTo(-7, -4, -4, 2); g.moveTo(5, -11); g.quadraticCurveTo(7, -4, 4, 2); g.stroke();
  rr(g, -5, 8, 10, 5, 1.5); fillO(g, wood(g, 8, 13));
  g.restore();
}
const wood = (g, a, b) => vgrad(g, a, b, [[0, '#c48a55'], [1, '#7a4a2a']]);
function airshipG(g, s = 1, o2 = {}) {
  g.save(); g.scale(s, s);
  face(g, [[-11, -6], [-15, -11], [-14, -3]], o2.fin || '#b98d6b');
  ell(g, 0, -4, 12, 6.2); g.fillStyle = vgrad(g, -10, 2, [[0, o2.env?.[0] || '#f8ecd2'], [1, o2.env?.[1] || '#c09070']]); g.fill();
  if (o2.band) { g.save(); ell(g, 0, -4, 12, 6.2); g.clip(); g.fillStyle = o2.band; g.fillRect(-13, -5, 26, 2.6); g.restore(); }
  g.fillStyle = rgba('#ffffff', 0.4); ell(g, -3, -7.5, 6, 1.6); g.fill();
  ell(g, 0, -4, 12, 6.2); o(g);
  g.strokeStyle = '#3a2a2a'; g.lineWidth = 1; g.beginPath(); g.moveTo(-5, 1.5); g.lineTo(-4, 6); g.moveTo(5, 1.5); g.lineTo(4, 6); g.stroke();
  face(g, [[-7, 6], [7, 6], [5, 10], [-5, 10]], o2.hull || '#9a6a42'); pathPts(g, [[-7, 6], [7, 6], [5, 10], [-5, 10]]); o(g);
  if (o2.cargo) { for (const [cx, cy] of [[-2, 3.4], [2.6, 3.4]]) { g.fillStyle = '#d8a050'; g.fillRect(cx - 2, cy - 2, 4, 3); g.strokeStyle = OUTL; g.lineWidth = 0.8; g.strokeRect(cx - 2, cy - 2, 4, 3); } }
  if (o2.cannons) { g.fillStyle = '#2a2a30'; g.fillRect(6, 7, 6, 2.4); g.fillRect(-12, 7, 6, 2.4); }
  if (o2.skull) { circ(g, 2, -4, 2.6); g.fillStyle = '#f2ead8'; g.fill(); g.fillStyle = '#2a1a22'; g.fillRect(0.8, -4.6, 0.9, 0.9); g.fillRect(2.4, -4.6, 0.9, 0.9); }
  g.restore();
}
function house(g, x, y, s, wall = '#f1e2c2', roof = '#c4553b') {
  g.save(); g.translate(x, y); g.scale(s, s);
  pathPts(g, [[-8, 10], [8, 10], [8, -1], [-8, -1]]); fillO(g, vgrad(g, -1, 10, [[0, wall], [1, shade(wall, -0.12)]]));
  pathPts(g, [[-11, 0], [0, -10], [11, 0]]); fillO(g, vgrad(g, -10, 0, [[0, shade(roof, 0.15)], [1, shade(roof, -0.15)]]));
  g.fillStyle = '#6b4230'; rr(g, -2.4, 3.5, 4.8, 6.5, 1.5); g.fill();
  g.restore();
}
function windowLit(g, x, y, w, h, c = '#ffd27a') { g.fillStyle = '#2a1a22'; g.fillRect(x - 0.6, y - 0.6, w + 1.2, h + 1.2); g.fillStyle = c; g.fillRect(x, y, w, h); }
function crystalG(g, x, y, s, cols = ['#e9feff', '#5fd8ee', '#2a62a8']) {
  g.save(); g.translate(x, y); g.scale(s, s);
  pathPts(g, [[0, -12], [7, -4], [5, 8], [0, 12], [-5, 8], [-7, -4]]); g.fillStyle = vgrad(g, -12, 12, [[0, cols[0]], [0.5, cols[1]], [1, cols[2]]]); g.fill(); o(g);
  g.fillStyle = rgba('#ffffff', 0.6); pathPts(g, [[0, -10], [-5, -3], [-3, 6], [-1, -2]]); g.fill();
  g.strokeStyle = rgba('#ffffff', 0.5); g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -12); g.lineTo(1, 12); g.stroke();
  g.restore();
}
function flaskG(g, liquid = '#7ce0b0') {
  g.beginPath(); g.moveTo(-3, -11); g.lineTo(-3, -3); g.lineTo(-10, 9); g.quadraticCurveTo(-10, 11, -7, 11); g.lineTo(7, 11); g.quadraticCurveTo(10, 11, 10, 9); g.lineTo(3, -3); g.lineTo(3, -11); g.closePath();
  g.fillStyle = rgba('#e8f6ff', 0.9); g.fill();
  g.save(); g.clip(); g.fillStyle = vgrad(g, 2, 12, [[0, shade(liquid, 0.2)], [1, shade(liquid, -0.2)]]); g.fillRect(-12, 2, 24, 10);
  g.fillStyle = rgba('#ffffff', 0.7); circ(g, -3, 6, 1.4); g.fill(); circ(g, 2, 8, 1); g.fill(); g.restore();
  o(g);
  g.fillStyle = '#c9a050'; g.fillRect(-4.2, -12.5, 8.4, 2.6); g.strokeStyle = OUTL; g.lineWidth = 1; g.strokeRect(-4.2, -12.5, 8.4, 2.6);
  g.fillStyle = rgba('#ffffff', 0.55); g.fillRect(-1.6, -9, 1.3, 7);
}
function shieldG(g, s = 1, fill = ['#9fc4f0', '#3a5a9a'], cross = true) {
  g.save(); g.scale(s, s);
  g.beginPath(); g.moveTo(0, -11); g.lineTo(10, -7); g.quadraticCurveTo(10, 6, 0, 12); g.quadraticCurveTo(-10, 6, -10, -7); g.closePath();
  g.fillStyle = vgrad(g, -11, 12, [[0, fill[0]], [1, fill[1]]]); g.fill(); o(g);
  g.beginPath(); g.moveTo(0, -8.5); g.lineTo(7.6, -5.4); g.quadraticCurveTo(7.6, 4.5, 0, 9.4); g.quadraticCurveTo(-7.6, 4.5, -7.6, -5.4); g.closePath(); g.strokeStyle = rgba('#ffffff', 0.35); g.lineWidth = 1; g.stroke();
  if (cross) { g.strokeStyle = BRASS; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -8); g.lineTo(0, 9); g.moveTo(-7, -2); g.lineTo(7, -2); g.stroke(); }
  g.restore();
}
function cloudG(g, x, y, s, lit = '#e2e6f4', dark = '#7a809e') {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath(); for (const [cx, cy, r] of [[-5, 1, 5.5], [0, -3, 7], [6, 1, 5], [1, 3, 5]]) { g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, TAU); }
  g.fillStyle = dark; g.fill();
  g.beginPath(); for (const [cx, cy, r] of [[-5.6, 0, 4.4], [-0.6, -4, 5.8], [5.4, 0, 4]]) { g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, TAU); }
  g.fillStyle = lit; g.fill();
  g.restore();
}
function anvilG(g, s = 1, y = 0) {
  g.save(); g.translate(0, y); g.scale(s, s);
  pathPts(g, [[-12, -5], [9, -5], [9, -1], [4, 1], [4, 5], [8, 9], [-8, 9], [-4, 5], [-4, 1], [-8, -1]]); g.fillStyle = metal(g, -5, 9, ['#c4ccd6', '#7a8696', '#3e4654']); g.fill(); o(g);
  g.fillStyle = rgba('#ffffff', 0.45); g.fillRect(-9, -4.2, 16, 1.4);
  g.restore();
}
function furnaceG(g) {
  rr(g, -10, -5, 20, 15, 3); fillO(g, vgrad(g, -5, 10, [[0, '#c87a5a'], [1, '#8a3a2a']]));
  g.strokeStyle = rgba('#5a2a1a', 0.5); g.lineWidth = 0.8; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-10, -1 + i * 4); g.lineTo(10, -1 + i * 4); g.stroke(); }
  g.fillStyle = '#7a3a2a'; g.fillRect(4, -12, 5, 8); g.strokeStyle = OUTL; g.lineWidth = 1; g.strokeRect(4, -12, 5, 8);
  rr(g, -5, 1, 10, 9, 4); g.fillStyle = vgrad(g, 1, 10, [[0, '#ffe07a'], [1, '#ff7a2a']]); g.fill(); o(g);
  glow(g, 0, 5, 12, '#ff8a2a', 0.55);
}
function turretG(g, fire = false) {
  pathPts(g, [[-9, 10], [9, 10], [6, 3], [-6, 3]]); fillO(g, metal(g, 3, 10, ['#a4adb9', '#7f8a99', '#4e5662']));
  g.save(); g.translate(0, 1); g.rotate(-0.7);
  g.fillStyle = '#4f5562'; g.fillRect(-3, -3, 15, 6); g.strokeStyle = OUTL; g.lineWidth = 1.2; g.strokeRect(-3, -3, 15, 6);
  g.fillStyle = '#d8dde4'; pathPts(g, [[12, -3.6], [17, 0], [12, 3.6]]); g.fill(); o(g);
  g.restore();
  circ(g, 0, 2, 3.4); fillO(g, '#c9a050');
  if (fire) { glow(g, 13, -10, 10, '#ffd27a', 0.9); g.strokeStyle = '#ffe9a0'; g.lineWidth = 1.2; for (let i = 0; i < 5; i++) { const a = -1.4 + i * 0.5; g.beginPath(); g.moveTo(13 + Math.cos(a) * 3, -10 + Math.sin(a) * 3); g.lineTo(13 + Math.cos(a) * 7, -10 + Math.sin(a) * 7); g.stroke(); } }
}
function rodG(g) {
  g.strokeStyle = '#6a5a58'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, 11); g.lineTo(0, -5); g.lineTo(6, 11); g.moveTo(-3.6, 4.6); g.lineTo(3.6, 4.6); g.stroke();
  g.strokeStyle = '#d08a4a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, -5); g.lineTo(0, -12); g.stroke();
  circ(g, 0, -12, 1.8); g.fillStyle = '#fff6c0'; g.fill();
  glow(g, 0, -12, 9, '#9fe8ff', 0.8);
}
function skullG(g) {
  circ(g, 0, -2, 9); fillO(g, vgrad(g, -11, 7, [[0, '#fbf4e6'], [1, '#d8ccb6']]));
  rr(g, -5, 4, 10, 6, 1.5); fillO(g, '#e6dcc8');
  g.fillStyle = '#2a1a22'; ell(g, -3.6, -2, 2.6, 2.9); g.fill(); ell(g, 3.6, -2, 2.6, 2.9); g.fill();
  pathPts(g, [[0, 1.4], [-1.2, 3.6], [1.2, 3.6]]); g.fill();
  g.strokeStyle = '#2a1a22'; g.lineWidth = 0.9; for (const x of [-2.4, 0, 2.4]) { g.beginPath(); g.moveTo(x, 5.5); g.lineTo(x, 9.2); g.stroke(); }
}
function coinG(g, s = 1, x = 0, y = 0) {
  g.save(); g.translate(x, y); g.scale(s, s);
  circ(g, 0, 0, 10); const r = g.createRadialGradient(-3, -3, 1, 0, 0, 11); r.addColorStop(0, '#fff3b8'); r.addColorStop(0.6, '#e8b448'); r.addColorStop(1, '#9a6a1a'); g.fillStyle = r; g.fill(); o(g);
  circ(g, 0, 0, 6.8); g.strokeStyle = rgba('#8a5a10', 0.7); g.lineWidth = 1.2; g.stroke();
  g.font = `bold 11px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#7a4a10'; g.fillText('S', 0, 0.8);
  g.restore();
}
function settlerG(g, x = 0, y = 0, s = 1, shirt = '#5b8ad0') {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.moveTo(-9, 11); g.quadraticCurveTo(-9, 1, 0, 1); g.quadraticCurveTo(9, 1, 9, 11); g.closePath(); fillO(g, vgrad(g, 1, 11, [[0, shade(shirt, 0.15)], [1, shade(shirt, -0.2)]]));
  circ(g, 0, -5, 5.2); fillO(g, '#f1c9a0');
  g.beginPath(); g.arc(0, -6, 5.4, Math.PI, 0); g.fillStyle = '#6b4230'; g.fill();
  g.restore();
}
function sunG(g, x = 0, y = 0, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#ffcf4a'; for (let i = 0; i < 8; i++) { g.save(); g.rotate((i * TAU) / 8); pathPts(g, [[-2.2, -7.5], [0, -12], [2.2, -7.5]]); g.fill(); g.restore(); }
  circ(g, 0, 0, 6.6); fillO(g, vgrad(g, -7, 7, [[0, '#fff2a8'], [1, '#f0a030']]));
  g.restore();
}
function moonG(g) {
  // crescent: the lit rim of disc A outside disc B
  const ax = -1, ay = 0, ra = 10, bx = 4.6, by = -3.2, rb = 8.4;
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), a = (ra * ra - rb * rb + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, ra * ra - a * a));
  const px = ax + (a * dx) / d, py = ay + (a * dy) / d, i1 = [px + (hh * -dy) / d, py + (hh * dx) / d], i2 = [px - (hh * -dy) / d, py - (hh * dx) / d];
  const A1 = Math.atan2(i1[1] - ay, i1[0] - ax), A2 = Math.atan2(i2[1] - ay, i2[0] - ax), B1 = Math.atan2(i1[1] - by, i1[0] - bx), B2 = Math.atan2(i2[1] - by, i2[0] - bx);
  g.beginPath(); g.arc(ax, ay, ra, A1, A2, false); g.arc(bx, by, rb, B2, B1, true); g.closePath();
  g.fillStyle = vgrad(g, -10, 10, [[0, '#fff6d0'], [1, '#d8b860']]); g.fill(); o(g);
  g.fillStyle = rgba('#b89a50', 0.5); circ(g, -6, 3, 1.5); g.fill(); circ(g, -3, 7, 1); g.fill();
  g.fillStyle = '#fff6d0'; for (const [x, y, r] of [[9, 6, 1.2], [6, 10, 0.8], [11, -9, 0.9]]) { circ(g, x, y, r); g.fill(); }
}
function bookG(g, cover = '#5d6fa6') {
  pathPts(g, [[-11, -7], [0, -5], [11, -7], [11, 8], [0, 10], [-11, 8]]); fillO(g, cover);
  pathPts(g, [[-10, -8], [0, -6], [0, 8], [-10, 6]]); fillO(g, '#fbf3e2');
  pathPts(g, [[10, -8], [0, -6], [0, 8], [10, 6]]); fillO(g, '#f0e4c8');
  g.strokeStyle = rgba('#6a5a48', 0.6); g.lineWidth = 0.8; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-8, -3 + i * 3); g.lineTo(-2, -2 + i * 3); g.moveTo(2, -2 + i * 3); g.lineTo(8, -3 + i * 3); g.stroke(); }
}
function scrollG(g, seal = '#c84a3a') {
  rr(g, -9, -10, 16, 19, 2); fillO(g, vgrad(g, -10, 9, [[0, '#fbf3e2'], [1, '#e6d2a8']]));
  ell(g, -1, -10, 9, 2.4); fillO(g, '#e6d2a8'); ell(g, -1, 9, 9, 2.4); fillO(g, '#d8c094');
  g.strokeStyle = rgba('#6a5a48', 0.6); g.lineWidth = 0.9; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-6, -5 + i * 3); g.lineTo(4 - (i === 3 ? 4 : 0), -5 + i * 3); g.stroke(); }
  circ(g, 6, 6, 4); fillO(g, seal); g.strokeStyle = rgba('#ffffff', 0.4); g.lineWidth = 0.8; circ(g, 6, 6, 2.2); g.stroke();
}
function hammerG(g, rot = -0.6) {
  g.save(); g.rotate(rot);
  rr(g, -1.6, -5, 3.2, 17, 1.2); fillO(g, wood(g, -5, 12));
  rr(g, -8, -10, 16, 6.4, 1.5); fillO(g, metal(g, -10, -3.6));
  g.restore();
}
function pickG(g) {
  g.strokeStyle = '#6a4220'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-8, 10); g.lineTo(5, -5); g.stroke();
  g.strokeStyle = '#b07a48'; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.moveTo(-6, -11); g.quadraticCurveTo(4, -10, 12, 0); g.strokeStyle = OUTL; g.lineWidth = 4.6; g.stroke(); g.strokeStyle = '#c9d2dc'; g.lineWidth = 3; g.stroke();
}
function axeG(g) {
  g.save(); g.rotate(0.6);
  rr(g, -1.6, -10, 3.2, 21, 1.2); fillO(g, wood(g, -10, 11));
  pathPts(g, [[0, -10], [9, -13], [10, -2], [1, -4]]); fillO(g, metal(g, -13, -2));
  g.restore();
}
function sacksG(g, col = '#efe2c4') {
  g.beginPath(); g.moveTo(-8, 11); g.quadraticCurveTo(-11, 2, -5, -4); g.lineTo(-3, -8); g.lineTo(3, -8); g.lineTo(5, -4); g.quadraticCurveTo(11, 2, 8, 11); g.closePath();
  fillO(g, vgrad(g, -8, 11, [[0, col], [1, shade(col, -0.2)]]));
  g.strokeStyle = '#8a5a30'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-4, -5); g.lineTo(4, -5); g.stroke();
  pathPts(g, [[-3, -8], [-5, -12], [0, -9.5], [5, -12], [3, -8]]); fillO(g, shade(col, -0.05));
}
function breadG(g) {
  g.beginPath(); g.moveTo(-11, 5); g.bezierCurveTo(-12, -8, 12, -8, 11, 5); g.quadraticCurveTo(0, 9, -11, 5); g.closePath();
  fillO(g, vgrad(g, -7, 7, [[0, '#f0b860'], [0.6, '#c87a30'], [1, '#8a4a1a']]));
  g.strokeStyle = '#f8dca0'; g.lineWidth = 1.5; for (const x of [-5, 0, 5]) { g.beginPath(); g.moveTo(x - 2, -3); g.quadraticCurveTo(x, -1, x + 2, 1); g.stroke(); }
}
function wheatG(g, s = 1) {
  g.save(); g.scale(s, s);
  g.strokeStyle = '#8a6a20'; g.lineWidth = 1.6;
  for (const a of [-0.35, 0, 0.35]) {
    g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, 11); g.lineTo(0, -4); g.stroke();
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#f2c84a' : '#e8b83a'; ell(g, -2.2, -4 - k * 3 + 2, 2, 3, -0.5); g.fill(); ell(g, 2.2, -4 - k * 3 + 2, 2, 3, 0.5); g.fill(); }
    g.fillStyle = '#f8dc70'; ell(g, 0, -13, 1.6, 2.6); g.fill();
    g.restore();
  }
  g.fillStyle = '#c0552a'; g.fillRect(-4, 4, 8, 3);
  g.restore();
}
function planksG(g) {
  for (const [y, c] of [[3, '#b07a48'], [-3, '#d3a06a']]) {
    g.save(); g.translate(0, y); g.rotate(-0.12);
    rr(g, -11, -3, 22, 6, 1); fillO(g, vgrad(g, -3, 3, [[0, shade(c, 0.15)], [1, shade(c, -0.15)]]));
    g.strokeStyle = rgba('#5a3418', 0.45); g.lineWidth = 0.7; g.beginPath(); g.moveTo(-8, -0.6); g.quadraticCurveTo(0, 1, 8, -1); g.stroke();
    g.restore();
  }
}
function stoneG(g) {
  pathPts(g, [[-11, 6], [-9, -3], [-2, -9], [7, -7], [11, 2], [8, 7]]); g.fillStyle = vgrad(g, -9, 7, [[0, '#e2dbd2'], [1, '#8a8090']]); g.fill(); o(g);
  g.fillStyle = rgba('#3a2a40', 0.25); pathPts(g, [[1, -8], [7, -7], [11, 2], [8, 7], [2, 7]]); g.fill();
  g.strokeStyle = rgba('#4a3a48', 0.5); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-4, -4); g.lineTo(-1, 2); g.lineTo(4, 3); g.stroke();
}
function oreG(g) {
  pathPts(g, [[-10, 6], [-9, -4], [-1, -9], [8, -6], [11, 3], [6, 8]]); g.fillStyle = vgrad(g, -9, 8, [[0, '#a89890'], [1, '#5c4a52']]); g.fill(); o(g);
  for (const [a, b] of [[-4, -2], [3, 1], [-1, 4], [5, -4]]) { g.fillStyle = '#ff9a3a'; pathPts(g, [[a, b - 2.6], [a + 2.6, b], [a, b + 2.6], [a - 2.6, b]]); g.fill(); g.fillStyle = '#ffd08a'; circ(g, a - 0.6, b - 0.6, 0.8); g.fill(); }
}
function coalG(g) {
  for (const [x, y, r, sd] of [[-4, 3, 7, 1], [5, 4, 6, 2], [1, -4, 6.4, 3]]) {
    g.beginPath(); for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + sd, R = r * (0.82 + ((i * 37 + sd * 13) % 7) / 30); g.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R); } g.closePath();
    fillO(g, vgrad(g, y - r, y + r, [[0, '#6a6a7c'], [1, '#202028']]));
    g.fillStyle = rgba('#c8d8ff', 0.7); pathPts(g, [[x - r * 0.5, y - r * 0.3], [x - r * 0.1, y - r * 0.6], [x, y - r * 0.2]]); g.fill();
  }
}
function ingotG(g, c) {
  face(g, [[-11, 5], [9, 5], [12, 0], [-8, 0]], c[2], false); face(g, [[-8, 0], [12, 0], [8, -6], [-5, -6]], c[0], false); face(g, [[-11, 5], [-8, 0], [-5, -6], [-9, -1]], c[1], false);
  pathPts(g, [[-11, 5], [9, 5], [12, 0], [8, -6], [-5, -6], [-9, -1]]); o(g);
  g.strokeStyle = rgba('#ffffff', 0.6); g.lineWidth = 0.9; g.beginPath(); g.moveTo(-4, -4.6); g.lineTo(6, -4.6); g.stroke();
}
function aetherG(g) {
  glow(g, 0, 0, 15, '#c08aff', 0.5);
  circ(g, 0, 0, 8); const r = g.createRadialGradient(-2.5, -3, 0.5, 0, 0, 9); r.addColorStop(0, '#ffffff'); r.addColorStop(0.35, '#e0c8ff'); r.addColorStop(0.75, '#9a6ae8'); r.addColorStop(1, '#4a2a90'); g.fillStyle = r; g.fill(); o(g);
  g.strokeStyle = '#7ff0ff'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, 0, 12, 4, -0.4, 0, TAU); g.stroke();
  g.strokeStyle = rgba('#ffffff', 0.7); g.lineWidth = 0.8; g.beginPath(); g.ellipse(0, 0, 12, 4, -0.4, 3.6, 5.8); g.stroke();
  g.fillStyle = '#fff'; for (const [x, y] of [[9, -8], [-10, 7]]) { pathPts(g, [[x, y - 2.4], [x + 0.7, y - 0.7], [x + 2.4, y], [x + 0.7, y + 0.7], [x, y + 2.4], [x - 0.7, y + 0.7], [x - 2.4, y], [x - 0.7, y - 0.7]]); g.fill(); }
}
function islandG(g) {
  pathPts(g, [[-12, -2], [12, -2], [6, 6], [1, 12], [-4, 7]]); g.fillStyle = vgrad(g, -2, 12, [[0, '#c08a70'], [1, '#6a4050']]); g.fill(); o(g);
  g.fillStyle = '#6fe0f0'; pathPts(g, [[-1, 8], [1, 14], [3, 8]]); g.fill();
  ell(g, 0, -3, 13, 4.5); g.fillStyle = '#8fc860'; g.fill(); o(g);
  g.fillStyle = '#6b4a35'; g.fillRect(4, -9, 2, 5); puff(g, 5, -11, 5, '#a8e070', '#3f7d3e');
  g.fillStyle = '#f1e2c2'; g.fillRect(-8, -8, 7, 5); g.fillStyle = '#c4553b'; pathPts(g, [[-9, -8], [-4.5, -12], [0, -8]]); g.fill();
}
function compassG(g, s = 1) {
  g.save(); g.scale(s, s);
  circ(g, 0, 0, 10.5); fillO(g, vgrad(g, -10, 10, [[0, '#fff8e6'], [1, '#e8d4a8']]));
  circ(g, 0, 0, 10.5); g.strokeStyle = BRASS_D; g.lineWidth = 2; g.stroke();
  g.strokeStyle = rgba('#8a6a4a', 0.6); g.lineWidth = 0.8; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 7.6, Math.sin(a) * 7.6); g.lineTo(Math.cos(a) * 9.4, Math.sin(a) * 9.4); g.stroke(); }
  pathPts(g, [[0, -8.5], [3, 0], [0, 0]]); g.fillStyle = '#e8604a'; g.fill(); pathPts(g, [[0, -8.5], [-3, 0], [0, 0]]); g.fillStyle = '#a83020'; g.fill();
  pathPts(g, [[0, 8.5], [3, 0], [0, 0]]); g.fillStyle = '#5a5a7a'; g.fill(); pathPts(g, [[0, 8.5], [-3, 0], [0, 0]]); g.fillStyle = '#3a3a5a'; g.fill();
  circ(g, 0, 0, 1.6); g.fillStyle = BRASS; g.fill();
  g.restore();
}
function starG(g, s = 1, col = '#ffd56a') { g.save(); g.scale(s, s); g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4.8 : 11.5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); fillO(g, vgrad(g, -11, 9, [[0, shade(col, 0.4)], [1, shade(col, -0.2)]])); g.restore(); }
function cogSettings(g) {
  gear(g, 0, 0, 11, 8, 0.36, metal(g, -11, 11, ['#e4e8f0', '#9aa4b4', '#5a6272']));
}
function propellerG(g) {
  for (let i = 0; i < 3; i++) { g.save(); g.rotate((i * TAU) / 3 + 0.3); ell(g, 6.5, 0, 7, 3.2); fillO(g, brassG(g, -3, 3)); g.restore(); }
  circ(g, 0, 0, 3.2); fillO(g, '#5a4a48');
}
function lockG(g) {
  g.strokeStyle = OUTL; g.lineWidth = 4.2; g.beginPath(); g.arc(0, -3, 5, Math.PI, 0); g.stroke();
  g.strokeStyle = '#b4aab8'; g.lineWidth = 2.4; g.beginPath(); g.arc(0, -3, 5, Math.PI, 0); g.stroke();
  rr(g, -7.5, -3, 15, 12, 2); fillO(g, metal(g, -3, 9, ['#e8dcc0', '#c09a50', '#7a5a20']));
  circ(g, 0, 2, 1.8); g.fillStyle = '#2a1a22'; g.fill(); g.fillRect(-0.7, 2, 1.4, 4);
}
function checkG(g) { circ(g, 0, 0, 10); fillO(g, vgrad(g, -10, 10, [[0, '#7ad88a'], [1, '#3a9a52']])); g.strokeStyle = '#fff'; g.lineWidth = 2.8; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-5, 0.4); g.lineTo(-1.2, 4.4); g.lineTo(5.4, -4); g.stroke(); }
function warnG(g) { g.lineJoin = 'round'; pathPts(g, [[0, -12], [12, 10], [-12, 10]]); fillO(g, vgrad(g, -12, 10, [[0, '#ffe07a'], [1, '#f0a830']])); g.fillStyle = '#3a2208'; rr(g, -1.6, -4, 3.2, 8.4, 1.4); g.fill(); circ(g, 0, 7, 1.8); g.fill(); }
function closeG(g) { g.lineCap = 'round'; g.strokeStyle = OUTL; g.lineWidth = 5.4; g.beginPath(); g.moveTo(-7, -7); g.lineTo(7, 7); g.moveTo(7, -7); g.lineTo(-7, 7); g.stroke(); g.strokeStyle = '#fbf1da'; g.lineWidth = 3; g.stroke(); }
function stormG(g) {
  cloudG(g, 0, -3, 1.05, '#d8dcef', '#6a7090');
  boltShape(g, 0.62, 1, 7); g.fillStyle = '#ffe27a'; g.fill(); o(g);
}
function happyG(g) {
  circ(g, 0, 0, 10.5); fillO(g, vgrad(g, -10, 10, [[0, '#ffe88a'], [1, '#f0a838']]));
  g.fillStyle = '#4a2a10'; ell(g, -3.6, -2.6, 1.4, 2); g.fill(); ell(g, 3.6, -2.6, 1.4, 2); g.fill();
  g.strokeStyle = '#4a2a10'; g.lineWidth = 1.7; g.lineCap = 'round'; g.beginPath(); g.arc(0, 1, 5.6, 0.35, Math.PI - 0.35); g.stroke();
  g.fillStyle = rgba('#ff7a6a', 0.45); circ(g, -6.4, 2.4, 1.8); g.fill(); circ(g, 6.4, 2.4, 1.8); g.fill();
}
function playG(g) { pathPts(g, [[-6, -9], [9, 0], [-6, 9]]); g.lineJoin = 'round'; fillO(g, '#fbf1da'); }
function fastG(g) { g.lineJoin = 'round'; pathPts(g, [[-11, -8], [1, 0], [-11, 8]]); fillO(g, '#fbf1da'); pathPts(g, [[-1, -8], [11, 0], [-1, 8]]); fillO(g, '#fbf1da'); }
function pauseG(g) { rr(g, -7, -8.5, 5, 17, 1.2); fillO(g, '#fbf1da'); rr(g, 2, -8.5, 5, 17, 1.2); fillO(g, '#fbf1da'); }
function clockG(g) {
  circ(g, 0, 0, 10.5); fillO(g, vgrad(g, -10, 10, [[0, '#fff8e6'], [1, '#e2cfa4']]));
  circ(g, 0, 0, 10.5); g.strokeStyle = BRASS_D; g.lineWidth = 2; g.stroke();
  g.strokeStyle = '#3b2a22'; g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -6.5); g.moveTo(0, 0); g.lineTo(4.6, 2.4); g.stroke();
  circ(g, 0, 0, 1.4); g.fillStyle = '#c84a3a'; g.fill();
}
function trophyG(g) {
  g.beginPath(); g.moveTo(-7, -10); g.lineTo(7, -10); g.quadraticCurveTo(7, 3, 0, 4); g.quadraticCurveTo(-7, 3, -7, -10); g.closePath(); fillO(g, brassG(g, -10, 4));
  g.strokeStyle = OUTL; g.lineWidth = 1.2; g.beginPath(); g.arc(-7, -5, 3.6, Math.PI * 0.5, Math.PI * 1.5); g.moveTo(7, -8.6); g.arc(7, -5, 3.6, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
  g.fillStyle = '#c9a050'; g.fillRect(-1.6, 4, 3.2, 3); rr(g, -6, 7, 12, 4, 1); fillO(g, '#7a4a2a');
  g.fillStyle = rgba('#ffffff', 0.55); g.fillRect(-4, -8.4, 1.6, 7);
}
function routeG(g) {
  g.save(); g.setLineDash([2.6, 2.6]); g.lineCap = 'round'; g.strokeStyle = '#ffe6a0'; g.lineWidth = 2; g.beginPath(); g.moveTo(-9, 8); g.bezierCurveTo(-9, -4, 9, 6, 8, -7); g.stroke(); g.restore();
  circ(g, -9, 8, 3); fillO(g, '#5cbf6a'); circ(g, 8, -7, 3); fillO(g, '#e8604a');
}
function crateG(g, x = 0, y = 0, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  rr(g, -9, -8, 18, 17, 1.5); fillO(g, vgrad(g, -8, 9, [[0, '#d8a060'], [1, '#9a6430']]));
  g.strokeStyle = rgba('#5a3418', 0.75); g.lineWidth = 1.4; g.strokeRect(-6.5, -5.5, 13, 12); g.beginPath(); g.moveTo(-6.5, -5.5); g.lineTo(6.5, 6.5); g.moveTo(6.5, -5.5); g.lineTo(-6.5, 6.5); g.stroke();
  g.restore();
}
function graphG(g) {
  rr(g, -11, -10, 22, 20, 2); fillO(g, '#fbf3e2');
  g.strokeStyle = rgba('#8a6a4a', 0.4); g.lineWidth = 0.7; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-9, -5 + i * 5); g.lineTo(9, -5 + i * 5); g.stroke(); }
  g.lineJoin = 'round'; g.strokeStyle = '#2e8a4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-8, 6); g.lineTo(-3, 1); g.lineTo(1, 3); g.lineTo(7, -6); g.stroke();
  g.strokeStyle = '#c84a3a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-8, 2); g.lineTo(-2, -3); g.lineTo(3, 0); g.lineTo(8, -1); g.stroke();
}
function arrowG(g, up = true) {
  g.save(); if (!up) g.rotate(Math.PI);
  pathPts(g, [[0, -10], [9, 0], [3.4, 0], [3.4, 10], [-3.4, 10], [-3.4, 0], [-9, 0]]); g.lineJoin = 'round'; fillO(g, up ? '#5cbf6a' : '#e0604a');
  g.restore();
}
function plusG(g) { g.lineCap = 'round'; g.strokeStyle = OUTL; g.lineWidth = 5.4; g.beginPath(); g.moveTo(0, -8); g.lineTo(0, 8); g.moveTo(-8, 0); g.lineTo(8, 0); g.stroke(); g.strokeStyle = '#fbf1da'; g.lineWidth = 3; g.stroke(); }
function trashG(g) {
  rr(g, -7, -5, 14, 15, 2); fillO(g, metal(g, -5, 10, ['#d8dce4', '#9aa4b4', '#5a6272']));
  g.strokeStyle = rgba('#3a3a48', 0.7); g.lineWidth = 1; for (const x of [-3, 0, 3]) { g.beginPath(); g.moveTo(x, -2); g.lineTo(x, 7); g.stroke(); }
  rr(g, -9, -8.5, 18, 3.4, 1); fillO(g, '#9aa4b4'); rr(g, -3, -11, 6, 2.6, 1); fillO(g, '#9aa4b4');
}
function eyeG(g) {
  g.beginPath(); g.moveTo(-12, 0); g.quadraticCurveTo(0, -11, 12, 0); g.quadraticCurveTo(0, 11, -12, 0); g.closePath(); fillO(g, '#fbf8ee');
  circ(g, 0, 0, 5); fillO(g, vgrad(g, -5, 5, [[0, '#6ab0e8'], [1, '#2a5aa0']])); circ(g, 0, 0, 2.2); g.fillStyle = '#10142a'; g.fill(); circ(g, -1.6, -1.6, 1.1); g.fillStyle = '#fff'; g.fill();
}
function flagG(g, col = '#c84a3a') {
  g.strokeStyle = '#5a3a20'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-7, 12); g.lineTo(-7, -11); g.stroke();
  g.beginPath(); g.moveTo(-6, -10); g.quadraticCurveTo(0, -13, 4, -9); g.quadraticCurveTo(8, -6, 11, -8); g.lineTo(11, 1); g.quadraticCurveTo(8, 3, 4, 0); g.quadraticCurveTo(0, -3, -6, -1); g.closePath(); fillO(g, vgrad(g, -12, 2, [[0, shade(col, 0.2)], [1, shade(col, -0.2)]]));
}
function anchorG(g) {
  g.strokeStyle = OUTL; g.lineCap = 'round'; g.lineWidth = 4.4;
  const p = () => { g.beginPath(); circ(g, 0, -8, 2.6); g.moveTo(0, -5.4); g.lineTo(0, 10); g.moveTo(-5, -2); g.lineTo(5, -2); g.moveTo(-9, 3); g.quadraticCurveTo(-8, 10, 0, 10); g.quadraticCurveTo(8, 10, 9, 3); };
  p(); g.stroke(); g.strokeStyle = metal(g, -10, 10); g.lineWidth = 2.4; p(); g.stroke();
}
function heartG(g) { g.beginPath(); g.moveTo(0, 10); g.bezierCurveTo(-14, 0, -8, -12, 0, -5); g.bezierCurveTo(8, -12, 14, 0, 0, 10); g.closePath(); fillO(g, vgrad(g, -10, 10, [[0, '#ff8a7a'], [1, '#c83a3a']])); g.fillStyle = rgba('#fff', 0.5); ell(g, -5, -4, 2.4, 1.6, -0.6); g.fill(); }
function popG(g) { settlerG(g, -5, 2, 0.75, '#c4553b'); settlerG(g, 5, 2, 0.75, '#5d9a52'); settlerG(g, 0, 0, 0.9, '#5b8ad0'); }

// ---------- buildings
function townhallG(g) {
  pathPts(g, [[-11, 10], [11, 10], [11, 0], [-11, 0]]); fillO(g, vgrad(g, 0, 10, [[0, '#f1e2c2'], [1, '#d4c09a']]));
  pathPts(g, [[-12.5, 0.5], [0, -5], [12.5, 0.5]]); fillO(g, '#5d6fa6');
  rr(g, -4, -12, 8, 12, 1); fillO(g, '#efe2c4'); pathPts(g, [[-5, -11], [0, -16], [5, -11]]); fillO(g, '#c4553b');
  circ(g, 0, -7, 2.4); fillO(g, '#fff8e6'); g.strokeStyle = '#3b2a22'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -7); g.lineTo(0, -8.8); g.moveTo(0, -7); g.lineTo(1.4, -7); g.stroke();
  g.fillStyle = '#6b4230'; rr(g, -2, 4, 4, 6, 1.6); g.fill();
  for (const x of [-9, 5.4]) windowLit(g, x, 3, 3.6, 3.4, '#9cc8e8');
}
function townhouseG(g) {
  pathPts(g, [[-9, 11], [9, 11], [9, -5], [-9, -5]]); fillO(g, vgrad(g, -5, 11, [[0, '#f4e6c8'], [1, '#d4c09a']]));
  pathPts(g, [[-11, -4], [0, -13], [11, -4]]); fillO(g, '#5d6fa6');
  g.fillStyle = '#8a6a5c'; g.fillRect(4, -13, 3, 5);
  for (const [x, y] of [[-6.6, -2], [3, -2], [-6.6, 3.6]]) windowLit(g, x, y, 3.6, 3.4, '#9cc8e8');
  g.fillStyle = '#6b4230'; rr(g, 2.4, 4.6, 4.4, 6.4, 1.6); g.fill();
}
function wellG(g) {
  ell(g, 0, 6, 9, 3.2); fillO(g, '#3a5a8a');
  pathPts(g, [[-9, 6], [-9, 11], [9, 11], [9, 6]]); fillO(g, vgrad(g, 6, 11, [[0, '#c8c0b4'], [1, '#8a8090']]));
  ell(g, 0, 6, 9, 3.2); g.strokeStyle = OUTL; g.lineWidth = lw; g.stroke();
  g.strokeStyle = '#6b4a35'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-7, 6); g.lineTo(-7, -6); g.moveTo(7, 6); g.lineTo(7, -6); g.stroke();
  pathPts(g, [[-10.5, -5], [0, -12], [10.5, -5]]); fillO(g, '#c4553b');
  g.strokeStyle = '#3a2a2a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, -5); g.lineTo(0, 0); g.stroke();
  rr(g, -2, 0, 4, 3.4, 0.8); fillO(g, '#9a6a42');
}
function tavernG(g) {
  rr(g, -8, -6, 13, 17, 2.4); fillO(g, vgrad(g, -6, 11, [[0, '#e0a858'], [1, '#9a6020']]));
  g.strokeStyle = OUTL; g.lineWidth = 2.6; g.beginPath(); g.arc(5.5, 2.5, 4.4, -1.2, 1.2); g.stroke(); g.strokeStyle = '#c08840'; g.lineWidth = 1.4; g.stroke();
  g.strokeStyle = rgba('#5a3410', 0.6); g.lineWidth = 0.9; for (const x of [-4.5, -1.5, 1.5]) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x, 9); g.stroke(); }
  g.beginPath(); g.moveTo(-9, -5); for (const [x, y, r] of [[-6.5, -7, 3.4], [-1.5, -9, 4], [3.6, -7, 3.2]]) g.arc(x, y, r, Math.PI, 0); g.lineTo(6.5, -5); g.closePath(); fillO(g, '#fffaf0');
}
function warehouseG(g) {
  pathPts(g, [[-11, 10], [11, 10], [11, -2], [0, -9], [-11, -2]]); fillO(g, vgrad(g, -9, 10, [[0, '#d0703a'], [1, '#8a3a20']]));
  pathPts(g, [[-12, -1.4], [0, -10], [12, -1.4]], false); g.strokeStyle = '#f1e2c2'; g.lineWidth = 1.8; g.stroke();
  rr(g, -5, 1, 10, 9, 0.5); fillO(g, '#f1e2c2'); g.strokeStyle = '#8a3a20'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-5, 1); g.lineTo(5, 10); g.moveTo(5, 1); g.lineTo(-5, 10); g.stroke();
  windowLit(g, -1.6, -5.6, 3.2, 2.6, '#9cc8e8');
}
function sawG(g) {
  g.beginPath(); const n = 24; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = i % 2 ? 8.6 : 11; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
  fillO(g, metal(g, -11, 11, ['#f0f4f8', '#b4bcc8', '#6a7484']));
  circ(g, 0, 0, 5.6); g.strokeStyle = rgba('#5a6474', 0.6); g.lineWidth = 1; g.stroke();
  circ(g, 0, 0, 2.6); fillO(g, '#c9a050');
  g.fillStyle = rgba('#ffffff', 0.6); g.beginPath(); g.arc(0, 0, 8, -2.6, -1.6); g.lineTo(0, 0); g.fill();
}
function mineG(g) {
  g.beginPath(); g.moveTo(-11, 10); g.lineTo(-11, -1); g.quadraticCurveTo(-11, -11, 0, -11); g.quadraticCurveTo(11, -11, 11, -1); g.lineTo(11, 10); g.closePath(); fillO(g, vgrad(g, -11, 10, [[0, '#b0a4a0'], [1, '#6a5a60']]));
  g.beginPath(); g.moveTo(-6, 10); g.lineTo(-6, -1); g.quadraticCurveTo(-6, -6, 0, -6); g.quadraticCurveTo(6, -6, 6, -1); g.lineTo(6, 10); g.closePath(); g.fillStyle = '#1a1018'; g.fill();
  g.strokeStyle = '#8a5a30'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-6, 10); g.lineTo(-6, -2); g.lineTo(6, -2); g.lineTo(6, 10); g.stroke();
  pathPts(g, [[-5, 5], [5, 5], [3.6, 10], [-3.6, 10]]); fillO(g, '#6a6a78');
  for (const [x, y] of [[-2, 4], [1.6, 3.4]]) { circ(g, x, y, 1.8); g.fillStyle = '#ff9a3a'; g.fill(); }
}
function coalpitG(g) {
  coalG(g);
  g.save(); g.translate(5, -4); g.rotate(0.55);
  rr(g, -1.2, -12, 2.4, 13, 1); fillO(g, wood(g, -12, 1));
  g.beginPath(); g.moveTo(-3.6, 0); g.lineTo(3.6, 0); g.lineTo(3, 6); g.quadraticCurveTo(0, 8.4, -3, 6); g.closePath(); fillO(g, metal(g, 0, 8));
  g.restore();
}
function workshopG(g) {
  gear(g, -2, 2, 8.6, 8, 0.34);
  g.save(); g.translate(5, -4); g.rotate(-0.8);
  rr(g, -1.6, -2, 3.2, 14, 1.2); fillO(g, metal(g, -2, 12));
  g.beginPath(); g.arc(0, -4, 4.6, 0.6, Math.PI * 2 - 0.6 + Math.PI * 0.0); g.lineTo(1.4, -4); g.closePath(); fillO(g, metal(g, -9, 1));
  g.restore();
}
function drillG(g) {
  crystalG(g, -5, 4, 0.55);
  g.save(); g.translate(4, -2); g.rotate(0.5);
  rr(g, -3.6, -12, 7.2, 7, 1.5); fillO(g, brassG(g, -12, -5));
  pathPts(g, [[-3, -5], [3, -5], [0, 9]]); fillO(g, metal(g, -5, 9));
  g.strokeStyle = rgba('#3a3a48', 0.7); g.lineWidth = 0.9; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-2.6 + i * 0.6, -3 + i * 3); g.lineTo(2.4 - i * 0.6, -1.6 + i * 3); g.stroke(); }
  g.restore();
}
function refineryG(g) {
  glow(g, -2, 4, 13, '#c08aff', 0.45);
  circ(g, -2, 4, 7.4); const r = g.createRadialGradient(-4, 2, 1, -2, 4, 8); r.addColorStop(0, '#f4e8ff'); r.addColorStop(0.5, '#b08ae8'); r.addColorStop(1, '#5a3aa0'); g.fillStyle = r; g.fill(); o(g);
  g.strokeStyle = OUTL; g.lineWidth = 4.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(1, -2); g.quadraticCurveTo(4, -12, 11, -5); g.stroke();
  g.strokeStyle = brassG(g, -12, 0); g.lineWidth = 2.4; g.stroke();
  rr(g, -5, -6.6, 6, 3.6, 1); fillO(g, '#c9a050');
  g.fillStyle = '#7ff0ff'; circ(g, 11, -2, 1.6); g.fill();
}
function farmG(g) {
  pathPts(g, [[-12, 10], [10, 10], [12, 0], [-8, 0]]); fillO(g, '#9a6a42');
  g.save(); pathPts(g, [[-12, 10], [10, 10], [12, 0], [-8, 0]]); g.clip();
  for (let i = 0; i < 4; i++) { g.strokeStyle = i % 2 ? '#e8c35a' : '#c8a040'; g.lineWidth = 2; g.beginPath(); g.moveTo(-12 + i * 2, 9 - i * 2.4); g.lineTo(12 + i * 0.4, 9 - i * 2.4); g.stroke(); }
  g.restore();
  g.save(); g.translate(2, -3); wheatG(g, 0.62); g.restore();
}
function bakeryG(g) {
  g.beginPath(); g.moveTo(-11, 9); g.lineTo(-11, 0); g.quadraticCurveTo(-11, -10, 0, -10); g.quadraticCurveTo(11, -10, 11, 0); g.lineTo(11, 9); g.closePath(); fillO(g, vgrad(g, -10, 9, [[0, '#d88a5a'], [1, '#9a4a2a']]));
  g.strokeStyle = rgba('#5a2a1a', 0.45); g.lineWidth = 0.8; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-10, -3 + i * 4); g.lineTo(10, -3 + i * 4); g.stroke(); }
  g.beginPath(); g.moveTo(-6, 9); g.lineTo(-6, 3); g.quadraticCurveTo(-6, -2, 0, -2); g.quadraticCurveTo(6, -2, 6, 3); g.lineTo(6, 9); g.closePath(); g.fillStyle = vgrad(g, -2, 9, [[0, '#ffd27a'], [1, '#ff7a2a']]); g.fill(); o(g);
  glow(g, 0, 5, 10, '#ff9a3a', 0.4);
  g.save(); g.translate(0, 6); g.scale(0.42, 0.42); breadG(g); g.restore();
}
function mooringG(g) {
  g.strokeStyle = '#5a3a20'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-8, 12); g.lineTo(-4, -2); g.lineTo(0, 12); g.moveTo(-6.6, 6); g.lineTo(-1.6, 6); g.stroke();
  circ(g, -4, -3, 1.6); g.fillStyle = '#ffd27a'; g.fill();
  g.save(); g.translate(4, -1); airshipG(g, 0.62); g.restore();
  g.strokeStyle = rgba('#3a2a2a', 0.8); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-4, -3); g.lineTo(-3.4, -4.4); g.stroke();
}
function cablestationG(g) {
  g.strokeStyle = '#3a2a2a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-12, -9); g.quadraticCurveTo(0, -4, 12, -10); g.stroke();
  g.strokeStyle = '#5a4a48'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -6.6); g.lineTo(0, -2); g.stroke();
  rr(g, -6, -2, 12, 9, 2); fillO(g, vgrad(g, -2, 7, [[0, '#e8c070'], [1, '#a8702a']]));
  windowLit(g, -4, 0, 3.4, 3, '#9cc8e8'); windowLit(g, 0.6, 0, 3.4, 3, '#9cc8e8');
  g.fillStyle = '#5a4a48'; g.fillRect(-7, 7, 14, 1.6);
  g.fillStyle = '#e8963a'; circ(g, 0, 10.6, 1.8); g.fill();
}
function bridgeG(g) {
  g.strokeStyle = '#5a3a20'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-12, -4); g.quadraticCurveTo(0, 6, 12, -4); g.stroke();
  for (let i = 0; i < 8; i++) { const t = i / 7, x = -11 + t * 22, y = 2 + Math.sin(t * Math.PI) * 4; g.save(); g.translate(x, y); rr(g, -1.4, -1.8, 2.8, 4.6, 0.6); fillO(g, i % 2 ? '#c48a55' : '#a8703a'); g.restore(); }
  g.strokeStyle = '#5a3a20'; g.lineWidth = 0.8; for (let i = 0; i < 5; i++) { const t = i / 4, x = -11 + t * 22; g.beginPath(); g.moveTo(x, -4 + Math.sin(t * Math.PI) * 9 - 1); g.lineTo(x, 2 + Math.sin(t * Math.PI) * 4); g.stroke(); }
  for (const x of [-12, 12]) { rr(g, x - 1.6, -7, 3.2, 14, 1); fillO(g, wood(g, -7, 7)); }
}
function shipyardG(g) {
  g.strokeStyle = '#8a6a4a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-11, 11); g.lineTo(-11, -9); g.lineTo(11, -9); g.lineTo(11, 11); g.moveTo(-11, -2); g.lineTo(11, -2); g.stroke();
  g.save(); g.translate(0, 4); airshipG(g, 0.72); g.restore();
  g.save(); g.translate(7, -6); g.scale(0.5, 0.5); hammerG(g, 0.5); g.restore();
}
function academyG(g) {
  bookG(g, '#2a7a8a');
  g.save(); g.translate(5, -6); g.scale(0.5, 0.5); flaskG(g, '#7ce0b0'); g.restore();
}
function observatoryG(g) {
  pathPts(g, [[-9, 11], [9, 11], [9, 2], [-9, 2]]); fillO(g, '#efe2c4');
  g.beginPath(); g.moveTo(-10, 2.6); g.arc(0, 2.6, 10, Math.PI, 0); g.closePath(); fillO(g, vgrad(g, -8, 3, [[0, '#7a9ad8'], [1, '#3a5a9a']]));
  g.save(); g.translate(1, -3); g.rotate(-0.75); rr(g, -2, -3, 15, 5.6, 1.5); fillO(g, brassG(g, -3, 3)); g.restore();
  g.fillStyle = '#6b4230'; rr(g, -2, 5, 4, 6, 1.6); g.fill();
}
function marketG(g) {
  g.fillStyle = '#6b4a35'; g.fillRect(-10, -3, 2, 14); g.fillRect(8, -3, 2, 14);
  pathPts(g, [[-11, 4], [11, 4], [11, 10], [-11, 10]]); fillO(g, wood(g, 4, 10));
  for (const [x, c] of [[-6, '#e8604a'], [-1, '#f2c84a'], [4.4, '#7ac860']]) { circ(g, x, 2.4, 2.4); fillO(g, c); }
  g.beginPath(); g.moveTo(-12, -2); g.lineTo(-9, -10); g.lineTo(9, -10); g.lineTo(12, -2); g.closePath(); g.fillStyle = '#fbf1da'; g.fill();
  g.save(); g.clip(); g.fillStyle = '#c84a3a'; for (let i = -3; i < 3; i++) { g.beginPath(); g.moveTo(i * 4.4, -11); g.lineTo(i * 4.4 + 2.2, -11); g.lineTo(i * 5.6 + 2.6, -1); g.lineTo(i * 5.6, -1); g.fill(); } g.restore();
  pathPts(g, [[-12, -2], [-9, -10], [9, -10], [12, -2]]); o(g);
  g.beginPath(); for (let i = 0; i < 6; i++) { const x = -12 + i * 4.8; g.moveTo(x, -2); g.arc(x + 2.4, -2, 2.4, Math.PI, 0, true); } g.fillStyle = '#c84a3a'; g.fill();
}
function shieldgenG(g) {
  glow(g, 0, -2, 14, '#7fd8ff', 0.35);
  g.beginPath(); g.arc(0, 8, 12, Math.PI, 0); g.fillStyle = rgba('#9fe0ff', 0.35); g.fill(); g.strokeStyle = '#7fd8ff'; g.lineWidth = 1.6; g.stroke();
  g.strokeStyle = rgba('#ffffff', 0.6); g.lineWidth = 0.9; g.beginPath(); g.arc(0, 8, 9, Math.PI + 0.3, Math.PI + 1.2); g.stroke();
  pathPts(g, [[-3, 9], [3, 9], [2, -1], [-2, -1]]); fillO(g, metal(g, -1, 9, ['#e8dcc0', '#c09a50', '#7a5a20']));
  crystalG(g, 0, -3, 0.42);
  g.fillStyle = '#5a4a48'; g.fillRect(-11, 8.6, 22, 2.6);
}
function bastionG(g) {
  pathPts(g, [[-9, 11], [9, 11], [7, -4], [-7, -4]]); fillO(g, vgrad(g, -4, 11, [[0, '#c8c0b4'], [1, '#7a7080']]));
  g.strokeStyle = rgba('#3a3040', 0.5); g.lineWidth = 0.8; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-8.4, 7 - i * 4); g.lineTo(8.4, 7 - i * 4); g.stroke(); }
  for (let i = 0; i < 4; i++) { rr(g, -8 + i * 4.6, -8, 3, 4.4, 0.4); fillO(g, '#b0a8a0'); }
  g.save(); g.translate(1, -5); g.rotate(-0.6); rr(g, 0, -2, 12, 4, 1.4); fillO(g, '#3a3a44'); g.restore();
  g.fillStyle = '#1a1018'; rr(g, -2.4, 4, 4.8, 7, 2); g.fill();
  flagLittle(g, -6, -8);
}
function flagLittle(g, x, y) { g.strokeStyle = '#3a2a2a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 6); g.stroke(); pathPts(g, [[x, y - 6], [x + 5, y - 5], [x, y - 3.6]]); g.fillStyle = '#c84a3a'; g.fill(); }
function skyforgeG(g) {
  glow(g, 0, -4, 16, '#ffcf6a', 0.6);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; g.strokeStyle = rgba('#ffe6a0', 0.85); g.lineWidth = 1.2; g.beginPath(); g.moveTo(Math.cos(a) * 7, -5 + Math.sin(a) * 7); g.lineTo(Math.cos(a) * 12, -5 + Math.sin(a) * 12); g.stroke(); }
  g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(6, -6, 2, -1); g.quadraticCurveTo(0, -4, -2, -1); g.quadraticCurveTo(-6, -6, 0, -14); g.fillStyle = vgrad(g, -14, 0, [[0, '#fff8d0'], [0.5, '#9ff0ff'], [1, '#c08aff']]); g.fill(); o(g);
  anvilG(g, 0.78, 4);
}
function automatonG(g) {
  rr(g, -6, -11, 12, 9, 2.6); fillO(g, brassG(g, -11, -2));
  circ(g, -2.6, -7, 1.8); g.fillStyle = '#7ff0ff'; g.fill(); circ(g, 2.6, -7, 1.8); g.fill();
  g.strokeStyle = '#5a3a10'; g.lineWidth = 1; g.beginPath(); g.moveTo(-2.6, -3.8); g.lineTo(2.6, -3.8); g.stroke();
  g.strokeStyle = OUTL; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -11); g.lineTo(0, -14); g.stroke(); circ(g, 0, -14, 1.3); g.fillStyle = '#e8604a'; g.fill();
  rr(g, -8, -1, 16, 11, 3); fillO(g, metal(g, -1, 10, ['#e8dcc0', '#c09a50', '#7a5a20']));
  gear(g, 0, 4.4, 3.8, 6, 0.38);
  for (const x of [-11, 11]) { circ(g, x, 2, 2.4); fillO(g, '#c09a50'); }
}
function foundryG(g) {
  for (const [x, h] of [[-8, 12], [-2, 15]]) { rr(g, x - 2, -h, 4, h, 0.6); fillO(g, '#9a4a3a'); }
  pathPts(g, [[-11, 11], [11, 11], [11, -2], [-11, -2]]); fillO(g, vgrad(g, -2, 11, [[0, '#7a6a68'], [1, '#4a3a40']]));
  g.save(); g.translate(5, 1); g.rotate(0.5);
  g.beginPath(); g.moveTo(-5, -4); g.lineTo(5, -4); g.lineTo(4, 3); g.quadraticCurveTo(0, 5, -4, 3); g.closePath(); fillO(g, metal(g, -4, 4));
  g.fillStyle = '#ffb040'; ell(g, 0, -4, 5, 1.6); g.fill();
  g.restore();
  g.beginPath(); g.moveTo(-1, 6); g.quadraticCurveTo(-4, 9, -3, 11); g.strokeStyle = '#ffb040'; g.lineWidth = 2.4; g.stroke();
  glow(g, 2, 4, 12, '#ff8a2a', 0.55);
  crystalG(g, -7, 5, 0.3);
}
function turbinesG(g) { gear(g, -3.4, 2.6, 8.6, 9, 0.34); gear(g, 6.4, -5.6, 5.6, 7, 0.36, metal(g, -11, 0, ['#e8dcc0', '#c09a50', '#7a5a20'])); }
function levitationG(g) {
  islandG(g);
  for (const sx of [-1, 1]) { const x = sx * 9.6; rr(g, x - 2.2, -1, 4.4, 5, 1); fillO(g, '#c9a050'); glow(g, x, 6, 6, '#6fe8ff', 0.8); }
}
function driftG(g) {
  g.save(); g.translate(-2, 0); g.scale(0.82, 0.82); islandG(g); g.restore();
  g.strokeStyle = '#7ff0ff'; g.lineWidth = 1.6; g.lineCap = 'round';
  for (const y of [-6, 0, 6]) { g.beginPath(); g.moveTo(-13, y); g.lineTo(-17 + (y === 0 ? -1 : 1), y); g.stroke(); }
  pathPts(g, [[9, -3], [14, 0], [9, 3]]); g.fillStyle = '#7ff0ff'; g.fill(); o(g);
}
function stormtamingG(g) {
  cloudG(g, 0, -5, 1, '#d8dcef', '#6a7090');
  g.strokeStyle = brassG(g, -2, 12); g.lineWidth = 2.2; g.beginPath(); g.moveTo(-6, 12); g.lineTo(-6, 0); g.stroke();
  g.strokeStyle = '#c9a050'; g.lineWidth = 1.2; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(-6, 3 + i * 2.4, 3, 1, 0, 0, TAU); g.stroke(); }
  boltShape(g, 0.5, 4, 5); g.fillStyle = '#ffe27a'; g.fill(); o(g);
  glow(g, 4, 5, 9, '#ffe27a', 0.5);
}
function beaconG(g) {
  glow(g, 0, -8, 15, '#c08aff', 0.55);
  g.fillStyle = rgba('#e8d8ff', 0.5); pathPts(g, [[-2, -10], [2, -10], [7, -16], [-7, -16]]); g.fill();
  pathPts(g, [[-5, 11], [5, 11], [3, -4], [-3, -4]]); fillO(g, vgrad(g, -4, 11, [[0, '#c8c0b4'], [1, '#7a7080']]));
  rr(g, -4.6, -6, 9.2, 3, 0.8); fillO(g, '#c9a050');
  circ(g, 0, -9, 3.6); const r = g.createRadialGradient(-1, -10, 0.4, 0, -9, 4); r.addColorStop(0, '#fff'); r.addColorStop(1, '#9a6ae8'); g.fillStyle = r; g.fill(); o(g);
}
function militiaG(g) {
  g.save(); g.translate(0, 1); airshipG(g, 1, { env: ['#e0ecf8', '#7a90b0'], band: '#3e74c0', cannons: true, hull: '#6a5a50' }); g.restore();
  g.save(); g.translate(8, -11); g.scale(0.36, 0.36); shieldG(g, 1); g.restore();
}
function lashG(g) { glow(g, 0, 0, 14, '#9ff0ff', 0.55); boltShape(g, 1); fillO(g, vgrad(g, -12, 12, [[0, '#ffffff'], [0.5, '#ffe27a'], [1, '#f0a830']])); }
function cannonG(g) {
  g.save(); g.rotate(-0.3); rr(g, -10, -4, 20, 8, 3); fillO(g, metal(g, -4, 4, ['#6a6a78', '#3a3a44', '#1a1a22'])); g.fillStyle = '#1a1018'; ell(g, 10, 0, 1.6, 3.2); g.fill(); g.restore();
  circ(g, -2, 6, 4.4); fillO(g, '#7a5236'); circ(g, -2, 6, 1.4); g.fillStyle = '#c9a050'; g.fill();
}
function bellowsG(g) {
  anvilG(g, 0.9, 3);
  g.fillStyle = '#ffd27a'; for (const [x, y, r] of [[-6, -9, 1.4], [-1, -12, 1.1], [4, -9.6, 1.5], [8, -12, 1]]) { circ(g, x, y, r); g.fill(); }
  glow(g, -1, -7, 9, '#ffb040', 0.5);
}
function chartsG(g) { coinG(g, 0.78, 3, 3); g.save(); g.translate(-5, -4); g.scale(0.55, 0.55); scrollG(g); g.restore(); }
function cargoG(g) { g.save(); g.translate(0, -2); airshipG(g, 0.95); g.restore(); crateG(g, -6, 7.4, 0.36); crateG(g, 0, 7.4, 0.36); crateG(g, 6, 7.4, 0.36); }
function galleonG(g) {
  g.save(); g.translate(0, 0); g.scale(1.05, 1.05);
  face(g, [[-11, -6], [-15, -12], [-14, -3]], '#8a5a8a');
  ell(g, 0, -7, 12, 5); fillO(g, vgrad(g, -12, -2, [[0, '#f4e0f4'], [1, '#a07aa8']]));
  ell(g, 0, 0, 11.4, 4.2); fillO(g, vgrad(g, -4, 4, [[0, '#f8ecd2'], [1, '#c09070']]));
  g.strokeStyle = '#3a2a2a'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-6, 3.6); g.lineTo(-5, 7); g.moveTo(6, 3.6); g.lineTo(5, 7); g.stroke();
  pathPts(g, [[-10, 7], [10, 7], [8, 11], [-7, 11]]); fillO(g, '#7a4a2a');
  g.fillStyle = '#ffd27a'; for (const x of [-5, -1, 3]) g.fillRect(x, 8.2, 1.8, 1.6);
  glow(g, -12, -2, 5, '#c08aff', 0.6);
  g.restore();
}


function fireG(g) {
  glow(g, 0, 2, 15, '#ff8a2a', 0.5);
  g.beginPath(); g.moveTo(0, 11); g.bezierCurveTo(-11, 10, -10, -1, -4, -6); g.quadraticCurveTo(-4, -1, -1, 0); g.quadraticCurveTo(-3, -8, 3, -13); g.quadraticCurveTo(2, -5, 7, -3); g.bezierCurveTo(11, 2, 9, 10, 0, 11); g.closePath();
  fillO(g, vgrad(g, -13, 11, [[0, '#ffd27a'], [0.5, '#ff8a2a'], [1, '#c83a1a']]));
  g.beginPath(); g.moveTo(0, 10); g.bezierCurveTo(-5, 9, -5, 3, -1, -1); g.quadraticCurveTo(0, 3, 2, 3); g.bezierCurveTo(5, 5, 4, 10, 0, 10); g.closePath(); g.fillStyle = '#fff2a0'; g.fill();
}
function windG(g) {
  g.lineCap = 'round';
  const p = () => { g.beginPath(); g.moveTo(-11, -4); g.lineTo(4, -4); g.arc(4, -7.5, 3.5, Math.PI / 2, -Math.PI * 0.9, true); g.moveTo(-11, 1); g.lineTo(7, 1); g.arc(7, 5, 4, -Math.PI / 2, Math.PI * 0.9); g.moveTo(-8, 6); g.lineTo(-1, 6); };
  p(); g.strokeStyle = OUTL; g.lineWidth = 4.4; g.stroke(); p(); g.strokeStyle = '#e8f4ff'; g.lineWidth = 2.4; g.stroke();
}
function rainG(g) {
  cloudG(g, 0, -4, 1.05, '#e2e6f4', '#7a809e');
  g.strokeStyle = '#7ad0ff'; g.lineWidth = 1.8; g.lineCap = 'round'; for (const x of [-6, -1, 4, 9]) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x - 2, 10); g.stroke(); }
}
function fogG(g) {
  cloudG(g, 0, -5, 0.9, '#eef0f8', '#9aa0b8');
  g.lineCap = 'round'; for (const [y, x0, x1] of [[3, -11, 9], [7, -8, 11], [11, -11, 5]]) { g.strokeStyle = OUTL; g.lineWidth = 3.8; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.strokeStyle = '#dfe4f0'; g.lineWidth = 2; g.stroke(); }
}
function unhappyG(g) {
  circ(g, 0, 0, 10.5); fillO(g, vgrad(g, -10, 10, [[0, '#d8e0f0'], [1, '#8a9ab8']]));
  g.fillStyle = '#2a2a40'; ell(g, -3.6, -2.4, 1.4, 2); g.fill(); ell(g, 3.6, -2.4, 1.4, 2); g.fill();
  g.strokeStyle = '#2a2a40'; g.lineWidth = 1.7; g.lineCap = 'round'; g.beginPath(); g.arc(0, 8, 5, -Math.PI + 0.5, -0.5); g.stroke();
  g.fillStyle = '#7ad0ff'; g.beginPath(); g.moveTo(5.6, 0); g.quadraticCurveTo(7.6, 3.6, 5.6, 4.6); g.quadraticCurveTo(3.6, 3.6, 5.6, 0); g.fill();
}
function quillG(g) {
  g.save(); g.rotate(0.6);
  g.beginPath(); g.moveTo(0, 12); g.quadraticCurveTo(-7, 0, -1, -13); g.quadraticCurveTo(6, -2, 0, 12); g.closePath(); fillO(g, vgrad(g, -13, 12, [[0, '#ffffff'], [1, '#c8c0d8']]));
  g.strokeStyle = rgba('#6a5a7a', 0.7); g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, 12); g.quadraticCurveTo(-1.6, 0, -1, -12); g.stroke();
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-1.2, 5 - i * 4); g.lineTo(-4.6, 2 - i * 4); g.stroke(); }
  g.restore();
  g.fillStyle = '#2a1a22'; circ(g, -7.6, 9.6, 1.4); g.fill();
}

// id -> painter. Aliases cover alternate ids other areas may pick.
const P = {
  // resources
  wood: (g) => { g.save(); g.rotate(-0.35); rr(g, -11, -5, 20, 10, 4); fillO(g, wood(g, -5, 5)); ell(g, 9, 0, 4, 5); fillO(g, '#f0c88a'); ell(g, 9, 0, 1.8, 2.4); g.strokeStyle = '#a8703a'; g.lineWidth = 1; g.stroke(); g.strokeStyle = rgba('#4a2a10', 0.5); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-8, -1.6); g.lineTo(3, -1.6); g.moveTo(-6, 2); g.lineTo(4, 2); g.stroke(); g.restore(); },
  planks: planksG, stone: stoneG, grain: (g) => wheatG(g), flour: (g) => sacksG(g), bread: breadG, ore: oreG, coal: coalG,
  iron: (g) => ingotG(g, ['#eef2f6', '#9aa6b4', '#5a6474']), brass: (g) => ingotG(g, ['#fff0b0', '#e0a948', '#8a5a1a']),
  parts: (g) => gear(g, 0, 0, 11, 8, 0.34), skystone: (g) => { glow(g, 0, 0, 15, '#6fe8ff', 0.35); crystalG(g, 0, 0, 1); }, aether: aetherG,
  coin: (g) => coinG(g), insight: (g) => flaskG(g),
  // buildings
  townhall: townhallG, cottage: (g) => house(g, 0, 0, 1), townhouse: townhouseG, house: (g) => house(g, 0, 0, 1), tent: (g) => { face(g, [[-11, 9], [0, -10], [11, 9]], '#e9dcc0'); g.fillStyle = '#4b3328'; pathPts(g, [[-3, 9], [0, 0], [3, 9]]); g.fill(); },
  well: wellG, tavern: tavernG, warehouse: warehouseG, lumber: axeG, quarry: pickG, mine: mineG, coalpit: coalpitG, sawmill: sawG, smelter: furnaceG,
  workshop: workshopG, drill: drillG, refinery: refineryG, farm: farmG, windmill: (g) => { g.fillStyle = '#efe6d4'; pathPts(g, [[-5, 11], [5, 11], [3, -4], [-3, -4]]); fillO(g, vgrad(g, -4, 11, [[0, '#fbf3e2'], [1, '#d8c8a8']])); pathPts(g, [[-4.4, -4], [4.4, -4], [0, -8.4]]); fillO(g, '#5d6fa6'); for (let i = 0; i < 4; i++) { g.save(); g.translate(0, -5); g.rotate(0.5 + (i * Math.PI) / 2); g.fillStyle = '#fbf3e2'; g.fillRect(2, -2.2, 10, 4.4); g.strokeStyle = OUTL; g.lineWidth = 1; g.strokeRect(2, -2.2, 10, 4.4); g.beginPath(); g.moveTo(7, -2.2); g.lineTo(7, 2.2); g.stroke(); g.restore(); } circ(g, 0, -5, 1.6); g.fillStyle = '#6b4230'; g.fill(); },
  bakery: bakeryG, mooring: mooringG, cablestation: cablestationG, shipyard: shipyardG, academy: academyG, observatory: observatoryG, market: marketG,
  harpoon: (g) => turretG(g), rod: rodG, shieldgen: shieldgenG, bastion: bastionG, skyforge: skyforgeG, bridge: bridgeG, cable: cablestationG,
  // research
  bellows: bellowsG, turbines: turbinesG, assembly: (g) => { gear(g, 0, 0, 11, 10, 0.3); g.strokeStyle = rgba('#5a3a10', 0.5); g.lineWidth = 0.8; circ(g, 0, 0, 6.6); g.stroke(); }, automatons: automatonG, foundry: foundryG,
  skiffs: (g) => balloon(g, 0, 0, 1), cargoholds: cargoG, propellers: propellerG, charters: chartsG, galleons: galleonG,
  crystallore: (g) => { glow(g, 0, 0, 14, '#6fe8ff', 0.3); crystalG(g, 0, 0, 1); }, levitation: levitationG, drift: driftG, stormtaming: stormtamingG, beacon: beaconG,
  harpoons: (g) => turretG(g), rods: rodG, shields: (g) => shieldG(g), militia: militiaG,
  // abilities
  volley: (g) => turretG(g, true), lash: lashG, shield: (g) => shieldG(g),
  // ships
  airship: (g) => airshipG(g), skiff: (g) => balloon(g, 0, 0, 1), scout: (g) => balloon(g, 0, 0, 1, ['#e8f4f8', '#8ab0c0'], '#2a9eb4'),
  freighter: (g) => airshipG(g, 1, { cargo: true }), trader: (g) => airshipG(g, 1, { cargo: true }), clipper: (g) => airshipG(g, 1, { band: '#3e74c0' }),
  galleon: galleonG, gunship: (g) => airshipG(g, 1, { env: ['#e0ecf8', '#7a90b0'], band: '#3e74c0', cannons: true }), frigate: (g) => airshipG(g, 1, { env: ['#c85a50', '#5a1a20'], cannons: true, skull: true, hull: '#4a3030' }),
  corsair: (g) => airshipG(g, 0.9, { env: ['#c85a50', '#5a1a20'], skull: true, hull: '#4a3030' }), raider: (g) => airshipG(g, 1, { env: ['#a84a48', '#4a1418'], skull: true, cannons: true, hull: '#3a2a2a' }),
  dreadnought: (g) => { airshipG(g, 1.08, { env: ['#8a2a30', '#2a0a10'], skull: true, cannons: true, hull: '#2a1a1a', band: '#1a1018' }); },
  // UI glyphs
  fleet: (g) => airshipG(g), chart: (g) => compassG(g), research: (g) => flaskG(g), build: (g) => hammerG(g), pause: pauseG, play: playG, fast: fastG,
  settings: cogSettings, close: closeG, warning: warnG, warn: warnG, skull: skullG, settler: (g) => settlerG(g), settlers: popG, pop: popG, happiness: happyG,
  storm: stormG, sun: (g) => sunG(g), moon: moonG, check: checkG, lock: lockG, star: (g) => starG(g), trophy: trophyG, scroll: (g) => scrollG(g), contract: (g) => scrollG(g),
  clock: clockG, time: clockG, route: routeG, crate: (g) => crateG(g), cargo: (g) => airshipG(g, 1, { cargo: true }), graph: graphG, stats: graphG, codex: (g) => bookG(g, '#7a3a2a'), book: (g) => bookG(g),
  up: (g) => arrowG(g, true), down: (g) => arrowG(g, false), plus: plusG, trash: trashG, eye: eyeG, scout: eyeG, flag: (g) => flagG(g), anchor: anchorG, heart: heartG,
  compass: (g) => compassG(g), island: islandG, gear: (g) => gear(g, 0, 0, 11, 8, 0.34), hammer: (g) => hammerG(g), anvil: (g) => anvilG(g), furnace: furnaceG, cannon: cannonG,
  crystal: (g) => crystalG(g, 0, 0, 1), flask: (g) => flaskG(g), bolt: lashG, tempest: stormG, vent: (g) => { furnaceG(g); }, ruin: (g) => { pathPts(g, [[-11, 10], [11, 10], [9, 4], [-9, 4]]); fillO(g, '#9a8a8a'); for (const [x, h] of [[-7, 14], [-1, 9], [5, 12]]) { rr(g, x - 2, 4 - h, 4, h, 0.6); fillO(g, '#c8c0b4'); } crystalG(g, 8, -2, 0.36); },
  food: (g) => breadG(g), settings2: cogSettings, info: (g) => { circ(g, 0, 0, 10.5); fillO(g, vgrad(g, -10, 10, [[0, '#7aa8f0'], [1, '#3a5aa8']])); g.fillStyle = '#fff'; circ(g, 0, -5.4, 1.8); g.fill(); rr(g, -1.6, -2, 3.2, 9, 1.2); g.fill(); },
  bad: skullG, good: checkG, fire: fireG, flames: fireG, wind: windG, breeze: windG, rain: rainG, fog: fogG, happy: happyG, unhappy: unhappyG, quill: quillG,
};
// alias research/building variants
const ALIAS = { propeller: 'propellers', engine: 'turbines', dock: 'mooring', clear: 'sun', firstlight: 'sun', village: 'cottage', town: 'townhouse', city: 'townhall', archipelago: 'island', allislands: 'compass', scholar: 'academy', allresearch: 'flask', year: 'sun', month: 'moon', nofire: 'well', merchant: 'coin', contracts: 'scroll', raids: 'harpoon', storms: 'rod', routes: 'route', builder: 'hammer', roost: 'skull', events: 'quill', beloved: 'heart', hoard: 'crate', forgelit: 'skyforge', swift: 'fast', vents: 'vent', fertile: 'farm', forest: 'lumber', water: 'well', harpoonbattery: 'harpoon', lightningrod: 'rod', rods2: 'rod', battery: 'harpoon', flak: 'bastion', shields2: 'shieldgen', bridges: 'bridge', cablecar: 'cable', ingot: 'iron', gold: 'coin', coins: 'coin', crystal_: 'skystone', grainfield: 'farm', insight_: 'insight', scholars: 'academy', ship: 'airship', expedition: 'compass', lightning: 'lash' };
export const GLYPH_IDS = Object.keys(P);
export const hasGlyph = (id) => !!(P[id] || P[ALIAS[id]]);

// paint a bare glyph centred at (x, y); scale 1 = about 24 px wide
export function glyph(g, id, x = 0, y = 0, s = 1) {
  const fn = P[id] || P[ALIAS[id]] || fallback(id);
  g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  const prev = lw; lw = s < 0.6 ? 1.4 * (0.6 / s) * 0.9 : 1.4;
  try { fn(g); } catch (e) { /* a glyph must never break a frame */ }
  lw = prev;
  g.restore();
}
function fallback(id) {
  const s = String(id || '?');
  if (/ship|skiff|boat|craft/.test(s)) return P.airship;
  if (/research|lore|tech/.test(s)) return P.flask;
  return (g) => { circ(g, 0, 0, 10); fillO(g, vgrad(g, -10, 10, [[0, '#fbe3a0'], [1, '#c08a32']])); g.font = `bold 13px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3a2208'; g.fillText(s[0].toUpperCase(), 0, 1); };
}

// the brass-rimmed disc behind a glyph
export function medallion(g, cx, cy, r, style = 'navy', o2 = {}) {
  const rim = Math.max(1.6, r * 0.12);
  g.save();
  if (o2.shadow !== false && r > 14) { g.shadowColor = 'rgba(10,6,24,0.45)'; g.shadowBlur = r * 0.25; g.shadowOffsetY = r * 0.07; }
  circ(g, cx, cy, r);
  g.fillStyle = style === 'grey' ? vgrad(g, cy - r, cy + r, [[0, '#d8ccb8'], [1, '#8a7e70']]) : vgrad(g, cy - r, cy + r, [[0, '#fbe3a0'], [0.45, '#e0b25a'], [1, '#8a5a1e']]);
  g.fill();
  g.restore();
  circ(g, cx, cy, r); g.strokeStyle = 'rgba(50,30,16,0.85)'; g.lineWidth = Math.max(1, r * 0.04); g.stroke();
  const ri = r - rim;
  circ(g, cx, cy, ri);
  if (style === 'parchment') g.fillStyle = vgrad(g, cy - ri, cy + ri, [[0, '#fff8e6'], [1, '#ecd8ae']]);
  else if (style === 'gold') g.fillStyle = vgrad(g, cy - ri, cy + ri, [[0, '#ffe9a8'], [1, '#c98a32']]);
  else if (style === 'grey') g.fillStyle = vgrad(g, cy - ri, cy + ri, [[0, '#ddd4c4'], [1, '#a89c8c']]);
  else if (style === 'done' && o2.color) g.fillStyle = vgrad(g, cy - ri, cy + ri, [[0, shade(o2.color, 0.25)], [1, shade(o2.color, -0.3)]]);
  else { const gr = g.createRadialGradient(cx - ri * 0.3, cy - ri * 0.4, ri * 0.1, cx, cy, ri * 1.05); gr.addColorStop(0, '#4e4a92'); gr.addColorStop(1, '#1d1a46'); g.fillStyle = gr; }
  g.fill();
  circ(g, cx, cy, ri); g.strokeStyle = 'rgba(40,24,12,0.7)'; g.lineWidth = Math.max(0.8, r * 0.035); g.stroke();
  if (o2.ring) { circ(g, cx, cy, ri - Math.max(1.2, r * 0.06)); g.strokeStyle = o2.ring; g.lineWidth = Math.max(1.5, r * 0.09); g.stroke(); }
  // glass sheen
  g.save(); circ(g, cx, cy, ri); g.clip();
  g.fillStyle = rgba('#ffffff', style === 'navy' ? 0.08 : 0.22); ell(g, cx, cy - ri * 0.55, ri * 0.85, ri * 0.45); g.fill();
  g.restore();
}

function badge(g, kind, x, y, r) {
  if (kind === 'check') { g.save(); g.translate(x, y); g.scale(r / 10, r / 10); checkG(g); g.restore(); return; }
  circ(g, x, y, r); g.fillStyle = kind === 'warn' ? '#c84a3a' : '#5a4a48'; g.fill(); g.strokeStyle = '#fbf1da'; g.lineWidth = Math.max(1, r * 0.14); g.stroke();
  if (kind === 'lock') glyph(g, 'lock', x, y + r * 0.05, (r * 0.62) / 10);
  else if (kind === 'warn') { g.fillStyle = '#fff'; g.font = `bold ${Math.round(r * 1.4)}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', x, y + r * 0.08); }
}

// paint a full icon (disc + glyph + badge) of CSS size `size` at (x, y) top-left
export function paintIcon(g, id, x, y, size, opts = {}) {
  const style = opts.style || 'navy', r = size / 2, cx = x + r, cy = y + r;
  if (style === 'plain') { glyph(g, id, cx, cy, (size * 0.92) / 26); }
  else {
    const rr2 = r * (opts.badge ? 0.9 : 0.96);
    medallion(g, cx, cy, rr2, style, opts);
    g.save(); if (style === 'grey') g.globalAlpha = 0.55;
    glyph(g, id, cx, cy, (rr2 * 1.18) / 24 * (opts.glyphScale || 1));
    g.restore();
  }
  if (opts.badge) badge(g, opts.badge, x + size * 0.8, y + size * 0.8, Math.max(5, size * 0.2));
}

const cache = new Map();
function key(id, size, opts) { return `${id}|${size}|${opts.style || 'navy'}|${opts.ring || ''}|${opts.badge || ''}|${opts.color || ''}|${opts.glyphScale || ''}|${DPR()}`; }
function render(id, size, opts) {
  const k = key(id, size, opts);
  let c = cache.get(k);
  if (!c) {
    const d = DPR(); c = layer(size * d, size * d);
    const g = c.getContext('2d'); g.scale(d, d);
    paintIcon(g, id, 0, 0, size, opts);
    if (cache.size > 900) cache.clear();
    cache.set(k, c);
  }
  return c;
}
// a fresh <canvas> (copied from the cache) that can be placed in the DOM
export function icon(id, size = 40, opts = {}) {
  const src = render(id, size, opts), c = document.createElement('canvas');
  c.width = src.width; c.height = src.height; c.style.width = size + 'px'; c.style.height = size + 'px';
  c.className = 'sf-icon'; c.setAttribute('aria-hidden', 'true');
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
const urls = new Map();
export function iconURL(id, size = 40, opts = {}) {
  const k = key(id, size, opts);
  let u = urls.get(k);
  if (!u) { u = render(id, size, opts).toDataURL('image/png'); urls.set(k, u); }
  return u;
}
// an <img> using the cached data URL (cheap to create many)
export function iconImg(id, size = 40, opts = {}) {
  const im = new Image(); im.src = iconURL(id, size, opts); im.width = size; im.height = size; im.alt = ''; im.className = 'sf-icon'; im.draggable = false; return im;
}
// the cached source canvas (for drawImage in other painters)
export const iconCanvas = render;
