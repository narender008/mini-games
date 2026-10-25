// Props: vegetation, rocks and deposits, heat vents, ponds, fields, fences, crates,
// carts, lamps, banners, camp bits and the Skyforge ruins.
//
//   drawProp(g, kind, x, y, { seed, s, t, night, part, w, d, growth, col })
//
// (x, y) is the GROUND CENTRE of the prop in unzoomed world px. For a cell feature
// (ore/coal/crystal/vent/stone/pond on island cell u, v) pass the cell centre:
// wpx(ox + u + 0.5, oy + v + 0.5, alt). Area props (pond, field) take w, d in tiles
// (default 1) centred on (x, y). s scales (1 = sized for one 48 px tile). seed picks
// the variation deterministically. part 'base'|'anim'|'light'|'all' as for buildings:
// only vents, lamps, campfires, banners and crystals have anim/light parts.
// propTop(kind, s) gives the height above the anchor for depth sorting and labels.
import {
  T, DX, DY, OUT, TAU, rng, hash, lerp, clamp, sat, mix, rgba, shade, pick, pathPts, smooth, rr, ell, circ, vgrad, hgrad,
  glow, shadowBlob, face, box, cylinder, crystal, crystalUp, smoke, steam, flames, pennant, lantern, ink, line,
} from './common.js';
import { cropField } from './farming.js';
import { brokenPillar, fallenColumn, brokenArch, toppledAnvil, shards } from './skyforge.js';

export const PROP_KINDS = ['pine', 'tree', 'bush', 'flowers', 'rock', 'stone', 'ore', 'coal', 'crystal', 'vent', 'pond', 'field', 'fence', 'crates', 'barrels', 'sacks', 'logs', 'stump', 'cart', 'lamp', 'banner', 'signpost', 'haybale', 'tent', 'campfire', 'ruinPillar', 'ruinArch', 'ruinColumn', 'ruinAnvil', 'ruinShards'];
const TOP = { pine: 64, tree: 52, bush: 14, flowers: 6, rock: 22, stone: 26, ore: 22, coal: 18, crystal: 34, vent: 10, pond: 4, field: 10, fence: 9, crates: 22, barrels: 12, sacks: 10, logs: 26, stump: 8, cart: 18, lamp: 30, banner: 40, signpost: 22, haybale: 12, tent: 32, campfire: 12, ruinPillar: 34, ruinArch: 50, ruinColumn: 12, ruinAnvil: 18, ruinShards: 22 };
export const propTop = (kind, s = 1) => (TOP[kind] || 20) * s;

const PINES = [['#7cc06a', '#3b7a4c', '#24503a'], ['#8ccc6a', '#4a8a4a', '#2a5a3a'], ['#6aae6a', '#2f6a4a', '#1e4434']];
const ROUNDS = [['#9ed36a', '#4f8f45', '#2c5a3c'], ['#b4dc6a', '#6aa048', '#3a6a3a'], ['#8ac866', '#3f7f45', '#244e36'], ['#c8d86a', '#8aa848', '#4a6a34']];

// ---------------------------------------------------------------- vegetation
export function tree(g, x, y, s = 1, o = {}) {
  const R = rng(hash('tree', o.seed ?? 1)), kind = o.kind || 'round';
  const k = s * (0.85 + R() * 0.35);
  shadowBlob(g, x + 7 * k, y, 15 * k, 5 * k, 0.24);
  g.fillStyle = '#6b4a35'; g.fillRect(x - 2.2 * k, y - 14 * k, 4.4 * k, 14 * k); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(x - 2.2 * k, y - 14 * k, 4.4 * k, 14 * k);
  if (kind === 'pine') {
    const pal = PINES[Math.floor(R() * PINES.length)], tiers = 3 + (R() < 0.5 ? 1 : 0), lean = (R() - 0.5) * 2 * k;
    for (let i = 0; i < tiers; i++) {
      const yy = y - 10 * k - i * 11 * k, w = (17 - i * 3.6) * k, tx = x + lean * i / tiers;
      g.fillStyle = pal[1]; g.beginPath(); g.moveTo(x - w, yy); g.lineTo(tx, yy - 20 * k); g.lineTo(x + w, yy); g.quadraticCurveTo(x, yy + 3 * k, x - w, yy); g.closePath(); g.fill();
      g.fillStyle = pal[0]; g.beginPath(); g.moveTo(x - w, yy); g.lineTo(tx, yy - 20 * k); g.lineTo(x - w * 0.1, yy + 1); g.closePath(); g.fill();
      g.fillStyle = rgba(pal[2], 0.5); g.beginPath(); g.moveTo(x + w * 0.3, yy + 1); g.lineTo(tx, yy - 20 * k); g.lineTo(x + w, yy); g.closePath(); g.fill();
      g.strokeStyle = rgba('#1c2a20', 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(x - w, yy); g.lineTo(tx, yy - 20 * k); g.lineTo(x + w, yy); g.quadraticCurveTo(x, yy + 3 * k, x - w, yy); g.stroke();
    }
    return;
  }
  const pal = o.pal || ROUNDS[Math.floor(R() * ROUNDS.length)];
  const blobs = [[0, -30, 16], [-11, -22, 12], [11, -21, 12], [-4, -42, 12], [7, -37, 10]].map(([a, b, r]) => [a + (R() - 0.5) * 3, b + (R() - 0.5) * 3, r * (0.9 + R() * 0.2)]);
  for (const [bx, by, br] of blobs) { g.fillStyle = OUT; circ(g, x + bx * k, y + by * k, br * k + 1.3); g.fill(); }
  for (const [bx, by, br] of blobs) { g.fillStyle = pal[2]; circ(g, x + bx * k, y + by * k, br * k); g.fill(); }
  for (const [bx, by, br] of blobs) {
    const X = x + bx * k, Y = y + by * k, r = br * k;
    const gr = g.createRadialGradient(X - r * 0.4, Y - r * 0.5, r * 0.1, X, Y, r);
    gr.addColorStop(0, shade(pal[0], 0.15)); gr.addColorStop(0.6, pal[1]); gr.addColorStop(1, pal[2]);
    g.fillStyle = gr; circ(g, X - 0.6 * k, Y - 0.6 * k, r * 0.94); g.fill();
  }
  const fruit = o.fruit ?? (R() < 0.25 ? pick(R, ['#ff7a5a', '#ffd25a', '#ffb0c8']) : null);
  if (fruit) for (let i = 0; i < 6; i++) { g.fillStyle = fruit; circ(g, x + (R() - 0.5) * 30 * k, y - (20 + R() * 24) * k, 1.9 * k); g.fill(); }
}
function bush(g, x, y, s, R, flower) {
  shadowBlob(g, x + 4 * s, y, 11 * s, 3.5 * s, 0.2);
  for (let i = 0; i < 3; i++) {
    const X = x + (i - 1) * 6 * s, Y = y - 5 * s - (i === 1 ? 2.5 * s : 0), r = 6.5 * s;
    g.fillStyle = OUT; circ(g, X, Y, r + 1); g.fill();
  }
  for (let i = 0; i < 3; i++) {
    const X = x + (i - 1) * 6 * s, Y = y - 5 * s - (i === 1 ? 2.5 * s : 0), r = 6.5 * s;
    const gr = g.createRadialGradient(X - r * 0.4, Y - r * 0.5, r * 0.1, X, Y, r); gr.addColorStop(0, '#b4e07a'); gr.addColorStop(0.6, '#5f9a48'); gr.addColorStop(1, '#3a6a3a');
    g.fillStyle = gr; circ(g, X, Y, r); g.fill();
  }
  if (flower) for (let i = 0; i < 5; i++) { g.fillStyle = flower; circ(g, x + (i - 2) * 4.5 * s + (R() - 0.5) * 2, y - 7 * s - (i % 2) * 4 * s, 1.6 * s); g.fill(); }
}
function flowers(g, x, y, s, R) {
  const cols = ['#ff8aa0', '#ffd25a', '#ffffff', '#c890ff', '#ff9a5a'];
  for (let i = 0; i < 9; i++) { const px = x + (R() - 0.5) * 22 * s, py = y + (R() - 0.5) * 8 * s; line(g, px, py, px, py - 4 * s, '#4f8f45', 1); g.fillStyle = cols[Math.floor(R() * cols.length)]; circ(g, px, py - 4.5 * s, 1.5 * s); g.fill(); }
}

// ---------------------------------------------------------------- rocks and deposits
export function rockLump(g, x, y, s, cols = ['#ddd0c0', '#9c8a83', '#5f4c58'], R = rng(1)) {
  const j = () => (R() - 0.5) * 3;
  const pts = [[-20 + j(), 0], [-18 + j(), -12 + j()], [-6 + j(), -22 + j()], [8 + j(), -20 + j()], [19 + j(), -9 + j()], [21, 0]].map(([a, b]) => [x + a * s, y + b * s]);
  shadowBlob(g, x + 6 * s, y + 1, 22 * s, 5 * s, 0.2);
  pathPts(g, pts); g.fillStyle = vgrad(g, y - 22 * s, y, [[0, cols[0]], [1, cols[1]]]); g.fill();
  g.fillStyle = rgba(cols[2], 0.45); pathPts(g, [pts[2], pts[3], pts[4], pts[5], [x + 4 * s, y]]); g.fill();
  g.fillStyle = rgba('#ffffff', 0.25); pathPts(g, [pts[1], pts[2], [x - 4 * s, y - 14 * s]]); g.fill();
  pathPts(g, pts); ink(g, 1.3);
  return pts;
}
function deposit(g, x, y, s, R, col, hi) {
  // a rocky outcrop studded with chunks of the resource
  const pts = rockLump(g, x, y, s * 0.95, ['#c8bcb0', '#8a7a78', '#4f3c48'], R);
  g.save(); pathPts(g, pts); g.clip();
  for (let i = 0; i < 7; i++) { const X = x + (R() - 0.5) * 30 * s, Y = y - R() * 16 * s - 2; g.fillStyle = col; pathPts(g, [[X, Y], [X + 5 * s, Y - 3 * s], [X + 7 * s, Y + 2 * s], [X + 2 * s, Y + 4 * s]]); g.fill(); g.fillStyle = hi; g.fillRect(X + 1.5 * s, Y - 0.6 * s, 2 * s, 1 * s); }
  g.restore();
  for (let i = 0; i < 3; i++) { const X = x + (R() - 0.2) * 30 * s, Y = y + 2 + R() * 3 * s; g.fillStyle = col; pathPts(g, [[X, Y], [X + 3 * s, Y - 2.5 * s], [X + 5 * s, Y + 0.5 * s]]); g.fill(); ink(g, 0.8); }
}
function crystalCluster(g, x, y, s, R) {
  shadowBlob(g, x + 4 * s, y + 1, 18 * s, 5 * s, 0.25);
  g.fillStyle = rgba('#3a3a6a', 0.35); ell(g, x, y, 16 * s, 5 * s); g.fill();
  const list = []; for (let i = 0; i < 6; i++) list.push([x + (R() - 0.5) * 24 * s, y + (R() - 0.5) * 5 * s, (8 + R() * 18) * s, (R() - 0.5) * 0.9]);
  list.sort((a, b) => a[1] - b[1]);
  for (const [px, py, l, r] of list) crystalUp(g, px, py, l, r, ['#e9feff', '#64e0f0', '#2a6ab0']);
}
function vent(g, x, y, s, R, q, P) {
  if (P.base) {
    // a cracked basalt crust around a glowing fissure
    g.fillStyle = '#4a3a40'; smooth(g, Array.from({ length: 9 }, (_, i) => { const a = i / 9 * TAU; return [x + Math.cos(a) * 18 * s * (0.8 + R() * 0.3), y + Math.sin(a) * 7 * s * (0.8 + R() * 0.3)]; })); g.fill(); ink(g, 1.1);
    g.fillStyle = '#2a1a20'; ell(g, x, y, 11 * s, 3.6 * s); g.fill();
    g.fillStyle = vgrad(g, y - 3 * s, y + 3 * s, [[0, '#ffe08a'], [0.5, '#ff8a2a'], [1, '#c83a1a']]);
    g.beginPath(); g.moveTo(x - 10 * s, y); g.lineTo(x - 4 * s, y - 1.5 * s); g.lineTo(x + 1 * s, y + 0.5 * s); g.lineTo(x + 6 * s, y - 1.6 * s); g.lineTo(x + 10 * s, y); g.lineTo(x + 5 * s, y + 1.8 * s); g.lineTo(x - 2 * s, y + 0.8 * s); g.lineTo(x - 7 * s, y + 2 * s); g.closePath(); g.fill();
    for (let i = 0; i < 5; i++) { const a = R() * TAU; line(g, x + Math.cos(a) * 9 * s, y + Math.sin(a) * 3 * s, x + Math.cos(a) * 16 * s, y + Math.sin(a) * 6 * s, rgba('#ff7a2a', 0.6), 1); }
  }
  if (P.anim) {
    // heat shimmer: wavering translucent ribbons, plus a puff of steam now and then
    for (let i = 0; i < 4; i++) {
      const ph = (q.t * 0.6 + i / 4) % 1, yy = y - 4 * s - ph * 34 * s, w = (6 + ph * 8) * s;
      g.strokeStyle = rgba('#fff0d0', 0.22 * (1 - ph)); g.lineWidth = 1.6;
      g.beginPath(); for (let k = 0; k <= 8; k++) { const px = x - w + k * w / 4; const py = yy + Math.sin(k * 1.4 + q.t * 6 + i) * 1.6 * s; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
    }
    steam(g, x + 2 * s, y - 4 * s, 0.7 * s, q.t * 0.7, q.seed);
  }
  if (P.light) glow(g, x, y - 2 * s, 30 * s, '#ff7a2a', 0.35 + 0.35 * q.night);
}
function pond(g, x, y, s, R, w = 1, d = 1) {
  const rx = (w * T * 0.42 + d * T * 0.14) * s, ry = d * T * 0.2 * s;
  const pts = Array.from({ length: 12 }, (_, i) => { const a = i / 12 * TAU; return [x + Math.cos(a) * rx * (0.85 + R() * 0.2), y + Math.sin(a) * ry * (0.85 + R() * 0.2)]; });
  smooth(g, pts.map(([a, b]) => [a + (a - x) * 0.12, b + (b - y) * 0.2 + 1])); g.fillStyle = '#d8c09a'; g.fill();
  smooth(g, pts); g.fillStyle = vgrad(g, y - ry, y + ry, [[0, '#4a86c0'], [1, '#7cc8e8']]); g.fill(); ink(g, 1);
  g.fillStyle = rgba('#ffffff', 0.5); ell(g, x - rx * 0.3, y - ry * 0.3, rx * 0.25, ry * 0.12); g.fill(); ell(g, x + rx * 0.25, y + ry * 0.2, rx * 0.15, ry * 0.08); g.fill();
  // lily pads and reeds
  for (let i = 0; i < 3; i++) { g.fillStyle = '#5f9a48'; ell(g, x + (R() - 0.5) * rx, y + (R() - 0.3) * ry * 0.8, 3 * s, 1.4 * s); g.fill(); }
  for (let i = 0; i < 5; i++) { const px = x - rx + R() * rx * 0.5, py = y + (R() - 0.5) * ry; line(g, px, py, px + (R() - 0.5) * 2, py - 7 * s, '#4f7a3a', 1.2); }
}

// ---------------------------------------------------------------- built bits
function fence(g, x, y, s, R, len = 1) {
  const L = T * 0.9 * len * s, x0 = x - L / 2, n = Math.max(2, Math.round(4 * len));
  for (let i = 0; i <= n; i++) { const px = x0 + i * L / n; line(g, px, y + 1, px, y - 8 * s, OUT, 2.8); line(g, px, y + 1, px, y - 8 * s, '#a07a50', 1.7); }
  for (const h of [3, 6.5]) { line(g, x0, y - h * s, x0 + L, y - h * s, OUT, 2.2); line(g, x0, y - h * s, x0 + L, y - h * s, '#c09a6a', 1.2); }
}
function crates(g, x, y, s, R, n = 4, col) {
  col = col || pick(R, ['#c08a4e', '#b07a44', '#a87a4e', '#9aa6b4']);
  const pos = [[0, 0], [12, 0], [5, -11], [24, 0], [17, -11]];
  for (let i = 0; i < n; i++) { const [a, b] = pos[i]; const cx = x - 14 * s + a * s, cy = y + 3 + b * s; box(g, cx, cy, 11 * s, 10 * s, 8 * s, i % 2 ? shade(col, -0.08) : col, { ao: false }); line(g, cx, cy, cx + 11 * s, cy - 10 * s, rgba('#5a3a20', 0.8), 1); }
}
function barrels(g, x, y, s) {
  for (const [a, b] of [[-5, -2], [5, 0], [0, 4]]) { const bx = x + a * s, by = y + b * s; cylinder(g, bx, by, 4.5 * s, 10 * s, '#9a6a42', { topCol: '#b88858' }); line(g, bx - 4.5 * s, by - 3 * s, bx + 4.5 * s, by - 3 * s, '#4a4048', 1); line(g, bx - 4.5 * s, by - 7 * s, bx + 4.5 * s, by - 7 * s, '#4a4048', 1); }
}
function sacks(g, x, y, s) {
  for (const [a, b, c] of [[-6, 0, '#e2cfa0'], [2, 1, '#d8c090'], [-2, -5, '#ecdcb0'], [8, 3, '#e2cfa0']]) { g.fillStyle = c; ell(g, x + a * s, y + b * s - 4 * s, 4.4 * s, 5 * s); g.fill(); ink(g, 0.9); g.fillStyle = '#a8803a'; g.fillRect(x + a * s - 1.5 * s, y + b * s - 9.5 * s, 3 * s, 1.4 * s); }
}
function logs(g, x, y, s) {
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
    const X = x - 14 * s + (i * 9 + r * 4.5) * s, Y = y - (5 + r * 8) * s;
    g.fillStyle = '#8a5a3a'; g.beginPath(); g.moveTo(X, Y - 4.6 * s); g.lineTo(X + 14 * s * DX, Y - 4.6 * s + 14 * s * DY); g.lineTo(X + 14 * s * DX, Y + 4.6 * s + 14 * s * DY); g.lineTo(X, Y + 4.6 * s); g.closePath(); g.fill(); ink(g, 1);
    g.fillStyle = '#e2b77d'; circ(g, X, Y, 4.6 * s); g.fill(); ink(g, 1); g.strokeStyle = rgba('#8a5a3a', 0.8); g.lineWidth = 0.8; circ(g, X, Y, 2.2 * s); g.stroke();
  }
}
function stump(g, x, y, s) { cylinder(g, x, y, 5 * s, 5 * s, '#8a5a3a', { topCol: '#e2b77d' }); g.strokeStyle = rgba('#8a5a3a', 0.8); g.lineWidth = 0.8; ell(g, x, y - 5 * s, 2.6 * s, 1.1 * s); g.stroke(); line(g, x - 5 * s, y - 1, x - 8 * s, y + 1, '#6b4a35', 1.6); }
export function cart(g, x, y, s, load = '#e8963a', R = rng(1)) {
  shadowBlob(g, x + 4 * s, y + 1, 16 * s, 4 * s, 0.22);
  line(g, x + 10 * s, y - 6 * s, x + 22 * s, y - 2 * s, '#6b4a35', 1.8 * s);
  box(g, x - 12 * s, y - 3 * s, 22 * s, 8 * s, 10 * s, '#a87a4e', { ao: false });
  for (let i = 0; i < 6; i++) { g.fillStyle = shade(load, (R() - 0.5) * 0.3); circ(g, x - 7 * s + i * 3.4 * s + 5 * s * DX, y - 12 * s + 5 * s * DY + (i % 2) * -1.5 * s, 2.6 * s); g.fill(); }
  for (const wx of [-7, 6]) { g.fillStyle = '#5a3a2a'; circ(g, x + wx * s, y - 1 * s, 4 * s); g.fill(); ink(g, 1); g.fillStyle = '#c9a050'; circ(g, x + wx * s, y - 1 * s, 1.2 * s); g.fill(); }
}
function lamp(g, x, y, s, q, P) {
  if (P.base) { line(g, x, y, x, y - 24 * s, OUT, 2.8 * s); line(g, x, y, x, y - 24 * s, '#4a4048', 1.6 * s); g.fillStyle = '#4a4048'; g.fillRect(x - 3 * s, y - 2 * s, 6 * s, 2.5 * s); line(g, x, y - 24 * s, x + 5 * s, y - 24 * s, '#4a4048', 1.4 * s); lantern(g, x + 5 * s, y - 23 * s, s); }
  if (P.light && q.night > 0.05) glow(g, x + 5 * s, y - 20 * s, 34 * s, '#ffb347', 0.6 * q.night);
}
function banner(g, x, y, s, q, P, col) {
  if (P.base) { line(g, x, y, x, y - 40 * s, OUT, 2.8 * s); line(g, x, y, x, y - 40 * s, '#6b4a35', 1.6 * s); g.fillStyle = '#c9a050'; circ(g, x, y - 41 * s, 2 * s); g.fill(); }
  if (P.anim) {
    const w = Math.sin(q.t * 3 + q.seed) * 2 * s;
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y - 38 * s); g.quadraticCurveTo(x + 7 * s, y - 39 * s + w, x + 14 * s, y - 38 * s + w); g.lineTo(x + 14 * s, y - 20 * s + w); g.lineTo(x + 7 * s, y - 24 * s + w * 0.5); g.lineTo(x, y - 20 * s); g.closePath(); g.fill(); ink(g, 1);
    g.fillStyle = '#e8b448'; circ(g, x + 7 * s, y - 31 * s + w * 0.6, 2.4 * s); g.fill();
  }
}
function signpost(g, x, y, s) {
  line(g, x, y, x, y - 20 * s, OUT, 3 * s); line(g, x, y, x, y - 20 * s, '#7a5236', 1.8 * s);
  for (const [dy, dir] of [[-17, 1], [-11, -1]]) { const yy = y + dy * s; g.fillStyle = '#c09a6a'; pathPts(g, [[x, yy - 2.4 * s], [x + dir * 11 * s, yy - 2.4 * s], [x + dir * 14 * s, yy], [x + dir * 11 * s, yy + 2.4 * s], [x, yy + 2.4 * s]]); g.fill(); ink(g, 0.9); }
}
function haybale(g, x, y, s) { cylinder(g, x, y, 6 * s, 8 * s, '#e8c870', { topCol: '#f4dc90' }); line(g, x - 6 * s, y - 4 * s, x + 6 * s, y - 4 * s, rgba('#a88838', 0.7), 1); }
function tent(g, x, y, s, col = '#e9dcc0') {
  shadowBlob(g, x + 6 * s, y, 22 * s, 6 * s, 0.22);
  face(g, [[x - 18 * s, y], [x, y - 24 * s], [x + 14 * s, y - 32 * s], [x + 30 * s, y - 8 * s], [x + 12 * s, y]], shade(col, -0.25));
  face(g, [[x - 18 * s, y], [x, y - 24 * s], [x + 12 * s, y]], col);
  g.fillStyle = '#4b3328'; pathPts(g, [[x - 3 * s, y], [x, y - 14 * s], [x + 3 * s, y]]); g.fill();
}
function campfire(g, x, y, s, q, P) {
  if (P.base) { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.fillStyle = '#8a8090'; ell(g, x + Math.cos(a) * 8 * s, y + Math.sin(a) * 3 * s, 3 * s, 2 * s); g.fill(); ink(g, 0.6); } line(g, x - 5 * s, y + 1, x + 5 * s, y - 2 * s, '#6b4a35', 2 * s); line(g, x - 5 * s, y - 2 * s, x + 5 * s, y + 1, '#5a3a2a', 2 * s); }
  if (P.anim) { flames(g, x, y, 0.42 * s, q.t, q.seed, 4); smoke(g, x, y - 18 * s, 0.4 * s, '#e8e2dc', { t: q.t, seed: q.seed, n: 5, a: 0.4 }); }
  if (P.light) glow(g, x, y - 5 * s, 44 * s, '#ff9a3a', 0.35 + 0.35 * q.night);
}

// ---------------------------------------------------------------- the entry point
export function drawProp(g, kind, x, y, o = {}) {
  const seed = o.seed ?? 1, R = rng(hash(kind, seed)), s = o.s ?? 1;
  const part = o.part || 'all', P = { base: part === 'all' || part === 'base', anim: part === 'all' || part === 'anim', light: part === 'all' || part === 'light' };
  const q = { t: o.t ?? 0, night: sat(o.night ?? 0), seed };
  if (P.base) switch (kind) {
    case 'pine': tree(g, x, y, s, { kind: 'pine', seed }); break;
    case 'tree': tree(g, x, y, s, { seed, fruit: o.fruit }); break;
    case 'bush': bush(g, x, y, s, R, o.flower ?? pick(R, [null, '#ffd0e0', '#fff2a0', '#d0b0ff', '#ffb0a0'])); break;
    case 'flowers': flowers(g, x, y, s, R); break;
    case 'rock': rockLump(g, x, y, s * (0.6 + R() * 0.4), undefined, R); break;
    case 'stone': { rockLump(g, x - 6 * s, y + 2 * s, s * 0.8, ['#e4d8c4', '#a89a8c', '#5f4c58'], R); rockLump(g, x + 9 * s, y - 2 * s, s * 0.6, ['#e4d8c4', '#a89a8c', '#5f4c58'], R); break; }
    case 'ore': deposit(g, x, y, s, R, '#e8963a', '#ffd8a0'); break;
    case 'coal': deposit(g, x, y, s, R, '#1e1a24', '#6a6478'); break;
    case 'crystal': crystalCluster(g, x, y, s, R); break;
    case 'pond': pond(g, x, y, s, R, o.w ?? 1, o.d ?? 1); break;
    case 'field': { const w = (o.w ?? 1) * T * s, d = (o.d ?? 1) * T * s; cropField(g, x - w / 2 - d * DX / 2, y - d * DY / 2, w * 0.92, d * 0.92, o.growth ?? 0.8, seed, Math.max(3, Math.round(d / 12))); break; }
    case 'fence': fence(g, x, y, s, R, o.len ?? 1); break;
    case 'crates': crates(g, x, y, s, R, o.n ?? 4, o.col); break;
    case 'barrels': barrels(g, x, y, s); break;
    case 'sacks': sacks(g, x, y, s); break;
    case 'logs': logs(g, x, y, s); break;
    case 'stump': stump(g, x, y, s); break;
    case 'cart': cart(g, x, y, s, o.load ?? '#e8963a', R); break;
    case 'signpost': signpost(g, x, y, s); break;
    case 'haybale': haybale(g, x, y, s); break;
    case 'tent': tent(g, x, y, s, o.col); break;
    case 'ruinPillar': brokenPillar(g, x, y, s, 20 + R() * 14, seed); break;
    case 'ruinArch': brokenArch(g, x - 15 * s, y, s); break;
    case 'ruinColumn': fallenColumn(g, x - 16 * s, y + 2, s, 30, (R() - 0.5) * 0.4); break;
    case 'ruinAnvil': toppledAnvil(g, x, y, s); break;
    case 'ruinShards': shards(g, x, y, s, o.lit ?? 0, seed); break;
  }
  switch (kind) {
    case 'vent': vent(g, x, y, s, R, q, P); break;
    case 'lamp': lamp(g, x, y, s, q, P); break;
    case 'banner': banner(g, x, y, s, q, P, o.col || '#a83a40'); break;
    case 'campfire': campfire(g, x, y, s, q, P); break;
    case 'crystal': if (P.light) glow(g, x, y - 12 * s, 30 * s, '#5fe3ff', 0.2 + 0.35 * q.night); break;
    case 'ruinShards': if (P.light && (o.lit ?? 0) > 0.5) glow(g, x, y - 8 * s, 30 * s, '#5fe3ff', 0.4); break;
  }
}

// ---------------------------------------------------------------- renderer shorthands
export const pine = (g, x, y, s = 1, o = {}) => tree(g, x, y, s, { ...o, kind: 'pine' });
export const rock = (g, x, y, s = 1, o = {}) => drawProp(g, 'rock', x, y, { ...o, s });
export const bushProp = (g, x, y, s = 1, o = {}) => drawProp(g, 'bush', x, y, { ...o, s });
export { bushProp as bush, crystal };
