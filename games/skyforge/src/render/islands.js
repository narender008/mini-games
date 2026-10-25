// Island terrain: the outline traced from the cell grid, the painted top
// (grass, fertile soil, forest floor, outcrops, ore/coal/crystal deposits, heat
// vents, ponds, the Skyforge ruin, dirt paths) and the rocky underside (strata,
// facets, cracks, hanging roots, skystone crystals at the tip). Each island is
// cached to one offscreen canvas per zoom bucket and repainted only when
// invalidated. Tall props (trees, rocks, crystals, pillars) are separate cached
// sprites so they depth-sort with buildings. Waterfalls are drawn live.
//
// Local frame: pixels at zoom 1 relative to wpx(ox, oy, alt); cell (u, v) has its
// front-left corner at ((u + v*DX) * T, -v * DY * T). Cells are row-major,
// index v * w + u, v = 0 the front (south) row.
import { T, DX, DY } from './camera.js';
import {
  rng, makeNoise, hashStr, mix, rgba, shade, lerp, clamp, layer, pathPts, smooth, ell, circ, vgrad, hgrad,
  crystal, crystalUp, tree, bush, rockLump, wisp, glow, TAU, ENV,
} from './kit.js';

export const PAL = {
  meadow: { grass: ['#a6d36a', '#5f9a48'], rock: ['#d9a77c', '#9a6a62', '#4c3550'], dirt: ['#b27b4f', '#6b4234'], trees: 0.3, tree: ['#9ed36a', '#4f8f45', '#2c5a3c'] },
  pine: { grass: ['#9fcf6c', '#4f8a4a'], rock: ['#cfa48a', '#8a6468', '#3f3150'], dirt: ['#a8754f', '#5f3c32'], trees: 0.75, tree: ['#90cc6a', '#43874c', '#24503a'] },
  rocky: { grass: ['#b9c97a', '#6f8a52'], rock: ['#d8c0a6', '#92807a', '#4a3c4c'], dirt: ['#a88a62', '#5e4a3a'], trees: 0.6, tree: ['#a8c870', '#5a8a4a', '#2e5038'] },
  volcanic: { grass: ['#a9b46a', '#5f6a42'], rock: ['#a86a58', '#643c44', '#2a1a28'], dirt: ['#7a4a3a', '#3e2228'], trees: 0.5, tree: ['#9cb862', '#4f7a40', '#2a4430'] },
  crystal: { grass: ['#9fd8a8', '#4f9a80'], rock: ['#b8acdc', '#6c5c9c', '#2e2650'], dirt: ['#8a76a8', '#4a3a68'], trees: 0.4, tree: ['#a0dcb0', '#4a9a7c', '#285a50'] },
  pirate: { grass: ['#a0a070', '#5c5c3c'], rock: ['#8a6460', '#4c3038', '#22141e'], dirt: ['#6a4a3a', '#3a2422'], trees: 0.8, tree: ['#8aa860', '#4a6a3e', '#28402c'] },
};
const CRYS = ['#c9fbff', '#5fd3e8', '#2c6fa8'];
const CRYS_V = ['#f2e0ff', '#b48aff', '#5a3aa8'];
export const pal = (I) => PAL[I.biome] || PAL.meadow;
export const cellAt = (I, u, v) => (u < 0 || v < 0 || u >= I.w || v >= I.h ? ' ' : (I.cells[v * I.w + u] || ' '));
export const local = (u, v) => [(u + v * DX) * T, -v * DY * T];

// ---------- the decorative island (prototype island(), for distant islands and the title) ----------
export function paintDecorIsland(g, o) {
  const R = rng(o.seed), n = makeNoise(o.seed * 13 + 7), n2 = makeNoise(o.seed * 7 + 3);
  const hz = o.hz || 0, c = (col) => (hz ? mix(col, o.haze || '#cfe3f5', hz) : col);
  const P = PAL[o.biome] || PAL.meadow;
  const grass = o.grass || P.grass, rock = o.rock || P.rock, dirt = o.dirt || P.dirt;
  const N = 120, top = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, k = 1 + 0.08 * (n(a * 1.6 + 2) - 0.5) * 2 + 0.03 * (n2(a * 6) - 0.5) * 2;
    top.push([o.x + Math.cos(a) * o.rx * k, o.y + Math.sin(a) * o.ry * k]);
  }
  const front = top.slice(0, N / 2 + 1).reverse(); // left -> right
  const rimY = (x) => { let best = front[0]; for (const p of front) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best[1]; };
  const geo = { top, env: front, rimY, cx: o.x, rx: o.rx, ry: o.ry, y0: o.y - o.ry, lip: o.lip ?? o.ry * 0.3, depth: o.depth, spikes: o.spikes ?? 4 };
  paintUnderside(g, geo, { seed: o.seed, rock: rock.map(c), dirt: dirt.map(c), grass: grass.map(c), roots: o.roots ?? 18, hz, crystals: o.crystals !== false, cs: o.cs || 1, glowC: c(CRYS[1]), live: false });
  // grass top
  smooth(g, top);
  const gg = g.createLinearGradient(o.x - o.rx * 0.6, o.y - o.ry, o.x + o.rx * 0.5, o.y + o.ry);
  gg.addColorStop(0, c(shade(grass[0], 0.12))); gg.addColorStop(0.55, c(grass[0])); gg.addColorStop(1, c(grass[1]));
  g.fillStyle = gg; g.fill();
  g.save(); smooth(g, top); g.clip();
  for (let k = 0; k < 40; k++) {
    const a = R() * TAU, d = Math.sqrt(R()), X = o.x + Math.cos(a) * o.rx * d, Y = o.y + Math.sin(a) * o.ry * d;
    g.fillStyle = R() < 0.5 ? rgba(c(grass[1]), 0.25) : rgba(c(shade(grass[0], 0.25)), 0.22);
    ell(g, X, Y, 20 + R() * 60, 8 + R() * 18, 0); g.fill();
  }
  if (hz < 0.5) for (let k = 0; k < 500 * (o.rx / 300); k++) {
    const a = R() * TAU, d = Math.sqrt(R()), X = o.x + Math.cos(a) * o.rx * d, Y = o.y + Math.sin(a) * o.ry * d;
    g.strokeStyle = R() < 0.6 ? rgba(c(grass[1]), 0.5) : rgba(c(shade(grass[0], 0.35)), 0.6);
    g.lineWidth = 1.2; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + (R() - 0.5) * 3, Y - 3 - R() * 4); g.stroke();
  }
  g.lineWidth = 10; g.strokeStyle = rgba(c(grass[1]), 0.35); smooth(g, top); g.stroke();
  g.restore();
  tufts(g, front, o.rx / 5, R, (col) => c(col), grass);
  if (o.trees) for (let k = 0; k < o.trees; k++) {
    const a = R() * TAU, d = Math.sqrt(R()) * 0.75;
    tree(g, o.x + Math.cos(a) * o.rx * d, o.y + Math.sin(a) * o.ry * d, o.rx / 110, { c, kind: R() < 0.4 ? 'pine' : 'round', seed: k + o.seed, pal: R() < 0.4 ? ['#7cc06a', '#3b7a4c', '#24503a'] : undefined });
  }
  geo.at = (u, v) => [o.x + u * o.rx, o.y + v * o.ry];
  geo.tip = geo.tipPt;
  return geo;
}

function tufts(g, front, n, R, c, grass) {
  for (let k = 0; k < n; k++) {
    const p = front[Math.floor(R() * front.length)];
    g.fillStyle = c(R() < 0.5 ? grass[1] : shade(grass[1], -0.15));
    g.beginPath(); g.moveTo(p[0] - 5, p[1] - 1); g.lineTo(p[0] + (R() - 0.5) * 4, p[1] + 4 + R() * 9); g.lineTo(p[0] + 5, p[1] - 1); g.fill();
  }
}

// rocky underside, roots, dirt band; geo: { env: [[x, rimY]...] left->right, rimY(x), cx, rx, lip, depth, spikes }
function paintUnderside(g, geo, o) {
  const R = rng(o.seed * 3 + 1), n = makeNoise(o.seed * 13 + 7), n2 = makeNoise(o.seed * 7 + 3);
  const { env, rimY, cx, rx, lip, depth } = geo;
  const rock = o.rock, dirt = o.dirt, grass = o.grass;
  const spikes = []; for (let i = 0; i < (geo.spikes ?? 3); i++) spikes.push([R() * 1.6 - 0.8, 0.06 + R() * 0.12, (0.15 + R() * 0.35) * depth]);
  const bottom = [], M = 90;
  for (let j = 0; j <= M; j++) {
    const t = -1 + 2 * j / M, X = cx + t * rx * 0.985;
    let D = depth * Math.pow(Math.max(0, 1 - t * t), 1.25) * (0.72 + 0.5 * n(t * 2.4 + 4));
    for (const [st, sw, sh] of spikes) D += sh * Math.exp(-(((t - st) / sw) ** 2)) * (1 - t * t);
    D += (n2(t * 30 + 1) - 0.5) * depth * 0.1 * (1 - t * t);
    bottom.push([X, rimY(X) + lip + D * 0.98]);
  }
  const und = env.slice().reverse().map((p) => [p[0], p[1] + lip]).concat(bottom);
  let tip = bottom[0]; for (const p of bottom) if (p[1] > tip[1]) tip = p;
  geo.tipPt = tip; geo.bottom = bottom;
  const yTop = geo.y0;
  g.save();
  pathPts(g, und); g.fillStyle = vgrad(g, yTop, tip[1], [[0, rock[0]], [0.35, rock[1]], [1, rock[2]]]); g.fill();
  g.clip();
  g.fillStyle = hgrad(g, cx - rx, cx + rx, [[0, rgba('#fff3dc', 0.22)], [0.45, 'rgba(0,0,0,0)'], [1, rgba('#160a26', 0.42)]]);
  g.fillRect(cx - rx - 10, yTop, rx * 2 + 20, tip[1] - yTop + 10);
  for (let k = 0; k < 70 * Math.max(0.5, rx / 300); k++) {
    const t = R() * 2 - 1, x = cx + t * rx * 0.95, y0 = rimY(x) + lip + R() * depth * 0.6;
    const w = rx * (0.04 + R() * 0.1), h = depth * (0.15 + R() * 0.45), lit = t < 0 ? R() < 0.7 : R() < 0.25;
    g.fillStyle = lit ? rgba(rock[0], 0.12 + R() * 0.2) : rgba('#1b0f2a', 0.05 + R() * 0.1);
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x + w, y0 + h * 0.1); g.lineTo(x + w * 0.6, y0 + h); g.lineTo(x - w * 0.1, y0 + h * 0.6); g.fill();
  }
  g.lineCap = 'round';
  for (let s = 0; s < 6; s++) {
    const off = lip + 6 + s * (depth * 0.09) + R() * 6;
    g.beginPath();
    for (let j = 0; j <= 60; j++) { const t = -1 + 2 * j / 60, X = cx + t * rx; const Y = rimY(X) + off + (n2(t * 8 + s * 3) - 0.5) * 8; j ? g.lineTo(X, Y) : g.moveTo(X, Y); }
    g.strokeStyle = rgba('#1c0f26', 0.2); g.lineWidth = 2.2; g.stroke();
    g.translate(0, -2.5); g.strokeStyle = rgba(rock[0], 0.28); g.lineWidth = 1.4; g.stroke(); g.translate(0, 2.5);
  }
  for (let k = 0; k < 14 * Math.max(0.5, rx / 300); k++) {
    let x = cx + (R() * 2 - 1) * rx * 0.8, y = rimY(x) + lip + R() * depth * 0.3;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (R() - 0.5) * 14; y += 8 + R() * 18; g.lineTo(x, y); }
    g.strokeStyle = rgba('#1c0f26', 0.3); g.lineWidth = 1.5; g.stroke();
  }
  g.fillStyle = 'rgba(20,8,30,0.3)';
  g.beginPath(); env.forEach(([x, y], i) => (i ? g.lineTo(x, y + lip) : g.moveTo(x, y + lip)));
  for (let i = env.length - 1; i >= 0; i--) g.lineTo(env[i][0], env[i][1] + lip + 22);
  g.fill();
  g.restore();
  // skystone crystals at the tip (what keeps the island aloft)
  if (o.crystals) {
    const cs = o.cs, cols = o.crystalCol || CRYS;
    if (!o.live) glow(g, tip[0], tip[1] - 10 * cs, 120 * cs, o.glowC || cols[1], 0.5 * (1 - o.hz * 0.6));
    const list = [];
    for (let k = 0; k < 9; k++) list.push([tip[0] + (R() - 0.5) * 70 * cs, tip[1] - 30 * cs - R() * 40 * cs, (12 + R() * 26) * cs, (R() - 0.5) * 1.1]);
    list.sort((a, b) => b[2] - a[2]);
    const cc = o.hz ? cols.map((c) => mix(c, o.hazeC || '#cfe3f5', o.hz * 0.6)) : cols;
    for (const [x, y, len, rot] of list) crystal(g, x, y, len, rot, cc);
  }
  for (let k = 0; k < (o.roots ?? 18); k++) {
    const t = R() * 1.8 - 0.9, x = cx + t * rx, y = rimY(x) + lip * 0.8, len = 20 + R() * 60 * (1 - t * t);
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 6, y + len * 0.4, x - 6, y + len * 0.7, x + (R() - 0.5) * 10, y + len);
    g.strokeStyle = R() < 0.5 ? mix('#4f6b3a', rock[1], o.hz * 0.6) : mix('#5a3b2e', rock[1], o.hz * 0.6); g.lineWidth = 1.4 + R() * 1.6; g.stroke();
    for (let l = 0; l < 3; l++) { g.fillStyle = grass[1]; ell(g, x + (R() - 0.5) * 6, y + len * (0.3 + l * 0.25), 3, 1.8, R()); g.fill(); }
  }
  // dirt band
  g.beginPath(); env.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  for (let i = env.length - 1; i >= 0; i--) g.lineTo(env[i][0], env[i][1] + lip);
  g.closePath();
  g.fillStyle = vgrad(g, yTop + geo.ry * 0.3, geo.y0 + geo.ry * 2 + lip, [[0, dirt[0]], [1, dirt[1]]]); g.fill();
  g.save(); g.clip();
  for (let k = 0; k < 120 * Math.max(0.5, rx / 300); k++) {
    const t = R() * 2 - 1, X = cx + t * rx, Y = rimY(X) + R() * lip;
    g.fillStyle = R() < 0.5 ? rgba('#2a1420', 0.25) : rgba(dirt[0], 0.5);
    ell(g, X, Y, 2 + R() * 5, 1 + R() * 1.5, 0); g.fill();
  }
  g.restore();
}

// ---------- cell islands ----------
// trace the island outline from the cells: blurred mask + noise, marching squares
export function islandGeometry(I) {
  const key = I.id + '|' + I.w + 'x' + I.h + '|' + hashStr(I.cells || '');
  if (I.__geo && I.__geo.key === key) return I.__geo;
  const S = 4, pad = 2, w = I.w, h = I.h;
  const GW = (w + pad * 2) * S, GH = (h + pad * 2) * S;
  const solid = (u, v) => cellAt(I, u, v) !== ' ';
  let F = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const u = Math.floor(i / S) - pad, v = Math.floor(j / S) - pad;
    F[j * GW + i] = solid(u, v) ? 1 : 0;
  }
  const blur = (A, r) => {
    const B = new Float32Array(A.length), C = new Float32Array(A.length), k = 1 / (2 * r + 1);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let s = 0; for (let d = -r; d <= r; d++) { const x = clamp(i + d, 0, GW - 1); s += A[j * GW + x]; } B[j * GW + i] = s * k; }
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { let s = 0; for (let d = -r; d <= r; d++) { const y = clamp(j + d, 0, GH - 1); s += B[y * GW + i]; } C[j * GW + i] = s * k; }
    return C;
  };
  F = blur(blur(F, 2), 2);
  const n = makeNoise((I.seed || hashStr(I.id)) % 9973 + 11), n2 = makeNoise((I.seed || 7) % 7919 + 5);
  const TH = 0.36;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = i / S, y = j / S;
    F[j * GW + i] += (n(x * 0.45 + y * 0.31) - 0.5) * 0.16 + (n2(x * 1.3 - y * 0.9 + 40) - 0.5) * 0.06;
  }
  // marching squares -> segments in sample coords
  const segs = [];
  const val = (i, j) => (i < 0 || j < 0 || i >= GW || j >= GH ? 0 : F[j * GW + i]);
  const interp = (x0, y0, v0, x1, y1, v1) => { const t = (TH - v0) / (v1 - v0 || 1e-6); return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; };
  for (let j = -1; j < GH; j++) for (let i = -1; i < GW; i++) {
    const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1);
    const idx = (a > TH ? 8 : 0) | (b > TH ? 4 : 0) | (c > TH ? 2 : 0) | (d > TH ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const top = () => interp(i, j, a, i + 1, j, b), right = () => interp(i + 1, j, b, i + 1, j + 1, c);
    const bot = () => interp(i, j + 1, d, i + 1, j + 1, c), left = () => interp(i, j, a, i, j + 1, d);
    switch (idx) {
      case 1: case 14: segs.push([left(), bot()]); break;
      case 2: case 13: segs.push([bot(), right()]); break;
      case 3: case 12: segs.push([left(), right()]); break;
      case 4: case 11: segs.push([top(), right()]); break;
      case 6: case 9: segs.push([top(), bot()]); break;
      case 7: case 8: segs.push([left(), top()]); break;
      case 5: segs.push([left(), top()], [bot(), right()]); break;
      case 10: segs.push([top(), right()], [left(), bot()]); break;
    }
  }
  // chain segments into loops
  const kf = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);
  const adj = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = kf(p); if (!adj.has(k)) adj.set(k, []); adj.get(k).push(i); } });
  const used = new Uint8Array(segs.length), loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1; const loop = [segs[s0][0], segs[s0][1]];
    let cur = segs[s0][1];
    for (let guard = 0; guard < segs.length; guard++) {
      const list = adj.get(kf(cur)) || []; let nxt = -1;
      for (const si of list) if (!used[si]) { nxt = si; break; }
      if (nxt < 0) break;
      used[nxt] = 1; const s = segs[nxt];
      cur = kf(s[0]) === kf(cur) ? s[1] : s[0];
      loop.push(cur);
    }
    loops.push(loop);
  }
  loops.sort((a, b) => b.length - a.length);
  let outline = (loops[0] || []).map(([i, j]) => local(i / S - pad, j / S - pad));
  if (outline.length < 8) { outline = [local(0, 0), local(w, 0), local(w, h), local(0, h)]; }
  // decimate a little and relax for smoothness
  outline = outline.filter((_, i) => i % 2 === 0);
  for (let it = 0; it < 2; it++) outline = outline.map((p, i) => { const a = outline[(i - 1 + outline.length) % outline.length], b = outline[(i + 1) % outline.length]; return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4]; });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of outline) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  // front envelope (largest screen y per column)
  const step = 3, env = [];
  for (let x = minX + 0.5; x <= maxX - 0.5; x += step) {
    let best = -Infinity;
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i], q = outline[(i + 1) % outline.length];
      if ((p[0] - x) * (q[0] - x) > 0 || p[0] === q[0]) continue;
      const t = (x - p[0]) / (q[0] - p[0]), y = p[1] + (q[1] - p[1]) * t;
      if (y > best) best = y;
    }
    if (best > -Infinity) env.push([x, best]);
  }
  const rimY = (x) => { if (!env.length) return maxY; const i = clamp(Math.round((x - env[0][0]) / step), 0, env.length - 1); return env[i][1]; };
  const rx = (maxX - minX) / 2, cx = (minX + maxX) / 2;
  const geo = {
    key, outline, env, rimY, minX, maxX, minY, maxY, cx, rx, ry: (maxY - minY) / 2, y0: minY,
    lip: clamp(rx * 0.085, 16, 36), depth: clamp(70 + rx * 0.5, 100, 330), spikes: rx > 250 ? 3 : 2,
  };
  // precompute the underside so bounds are known
  geo.bounds = [minX - 24, minY - 30, maxX + 24, maxY + geo.lip + geo.depth * 1.8 + 50];
  Object.defineProperty(I, '__geo', { value: geo, enumerable: false, configurable: true, writable: true });
  return geo;
}

// paths: dirt lanes joining the buildings on an island (minimum spanning tree of doors)
export function pathGraph(I, buildings, sizeOf) {
  const pts = buildings.filter((b) => b.island === I.id && b.state !== 'ruin').map((b) => { const [w, d] = sizeOf(b.type); return [b.u + w / 2, b.v - 0.35, b]; })
    .filter((p) => p[1] >= -0.2);
  if (pts.length < 2) return [];
  const inT = [0], edges = [], left = new Set(pts.map((_, i) => i).slice(1));
  while (left.size) {
    let best = null;
    for (const i of inT) for (const j of left) { const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (!best || d < best[2]) best = [i, j, d]; }
    if (best[2] > 9) { const j = best[1]; left.delete(j); inT.push(j); continue; }
    edges.push([pts[best[0]], pts[best[1]]]); left.delete(best[1]); inT.push(best[1]);
  }
  return edges;
}

// paint one island top + underside into a canvas at scale s. ctx: { buildings, sizeOf, owned, haze }
export function paintIsland(I, s, ctx) {
  const geo = islandGeometry(I), P = pal(I);
  const [bx0, by0, bx1, by1] = geo.bounds;
  const cv = layer((bx1 - bx0) * s, (by1 - by0) * s), g = cv.getContext('2d');
  const hz = ctx.hz || 0, haze = ctx.haze || '#cfe3f5';
  const c = (col) => (hz ? mix(col, haze, hz) : col);
  const seed = (I.seed || hashStr(I.id)) >>> 0;
  g.setTransform(s, 0, 0, s, -bx0 * s, -by0 * s);
  const savedL = [ENV.lx, ENV.ly]; ENV.lx = -0.6; ENV.ly = -0.8;
  paintUnderside(g, geo, { seed: seed % 100000, rock: P.rock.map(c), dirt: P.dirt.map(c), grass: P.grass.map(c), roots: Math.round(6 + geo.rx / 18), hz, crystals: true, cs: clamp(geo.rx / 260, 0.55, 1.5), live: true, crystalCol: I.biome === 'crystal' ? CRYS_V : CRYS, hazeC: haze });
  const R = rng(seed % 100000 + 17);
  const top = geo.outline, grass = P.grass;
  // grass top
  smooth(g, top);
  const gg = g.createLinearGradient(geo.cx - geo.rx * 0.6, geo.minY, geo.cx + geo.rx * 0.5, geo.maxY);
  gg.addColorStop(0, c(shade(grass[0], 0.12))); gg.addColorStop(0.55, c(grass[0])); gg.addColorStop(1, c(grass[1]));
  g.fillStyle = gg; g.fill();
  g.save(); smooth(g, top); g.clip();
  const area = geo.rx * geo.ry;
  for (let k = 0; k < Math.min(160, 20 + area / 900); k++) {
    const X = lerp(geo.minX, geo.maxX, R()), Y = lerp(geo.minY, geo.maxY, R());
    g.fillStyle = R() < 0.5 ? rgba(c(grass[1]), 0.22) : rgba(c(shade(grass[0], 0.25)), 0.2);
    ell(g, X, Y, 20 + R() * 60, 7 + R() * 16, 0); g.fill();
  }
  // ground by cell, painted on the ground plane (tile-space transform)
  const M = [s * T, 0, s * T * DX, -s * T * DY, -bx0 * s, -by0 * s];
  g.setTransform(...M);
  const W = I.w, H = I.h;
  const cr = (u, v) => rng(seed + u * 73856093 + v * 19349663);
  // soft blobs per cell type
  const blob = (u, v, col, a, rad = 0.62, r = cr(u, v)) => {
    g.fillStyle = rgba(c(col), a);
    for (let i = 0; i < 3; i++) { ell(g, u + 0.5 + (r() - 0.5) * 0.4, v + 0.5 + (r() - 0.5) * 0.4, rad * (0.7 + r() * 0.5), rad * (0.6 + r() * 0.4), r() * 3); g.fill(); }
  };
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const ch = cellAt(I, u, v), r = cr(u, v);
    switch (ch) {
      case 'f': blob(u, v, '#6fae46', 0.5, 0.7, r); blob(u, v, '#8a6a3c', 0.28, 0.42, r);
        g.strokeStyle = rgba(c('#6b4a2c'), 0.35); g.lineWidth = 0.035; g.beginPath();
        for (let i = 0; i < 3; i++) { const yy = v + 0.25 + i * 0.25 + (r() - 0.5) * 0.05; g.moveTo(u + 0.2, yy); g.lineTo(u + 0.8, yy); } g.stroke(); break;
      case 't': blob(u, v, '#3f7a3c', 0.42, 0.75, r); break;
      case 's': blob(u, v, '#b9ae9e', 0.62, 0.55, r); blob(u, v, '#8f857c', 0.3, 0.32, r); break;
      case 'o': blob(u, v, '#ad8a70', 0.62, 0.55, r); blob(u, v, '#d27a3a', 0.35, 0.28, r); break;
      case 'c': blob(u, v, '#4e464c', 0.62, 0.55, r); blob(u, v, '#262026', 0.45, 0.3, r); break;
      case 'k': blob(u, v, '#8fd8e8', 0.32, 0.65, r); blob(u, v, '#b8a0f0', 0.22, 0.4, r); break;
      case 'h': blob(u, v, '#5c4440', 0.7, 0.6, r); blob(u, v, '#2e1e22', 0.6, 0.3, r);
        g.strokeStyle = rgba('#ff8a3a', 0.85); g.lineWidth = 0.045; g.beginPath();
        for (let i = 0; i < 4; i++) { let x = u + 0.5, y = v + 0.5; g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (r() - 0.5) * 0.3; y += (r() - 0.5) * 0.3; g.lineTo(x, y); } }
        g.stroke(); break;
      case 'r': blob(u, v, '#9a8f8c', 0.6, 0.6, r); break;
      case 'x': {
        g.fillStyle = rgba(c('#c8bca8'), 0.85); g.fillRect(u + 0.04, v + 0.04, 0.92, 0.92);
        g.fillStyle = rgba(c('#8a7e74'), 0.6);
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if (r() < 0.8) g.fillRect(u + 0.08 + a * 0.46, v + 0.08 + b * 0.46, 0.4, 0.4);
        g.fillStyle = rgba(c('#6a9a4a'), 0.5); ell(g, u + r(), v + r(), 0.2, 0.1, 0); g.fill();
        g.strokeStyle = rgba('#7fe8ff', 0.5); g.lineWidth = 0.03; g.beginPath(); g.arc(u + 0.5, v + 0.5, 0.22, 0, TAU); g.stroke();
        break;
      }
    }
  }
  // flowers on grass
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const ch = cellAt(I, u, v); if (ch !== 'g' && ch !== 'f') continue;
    const r = cr(u + 999, v);
    if (r() < 0.35) { g.fillStyle = rgba(c(['#ffd0e0', '#fff2a0', '#d0b0ff', '#ffffff'][(r() * 4) | 0]), 0.9); for (let i = 0; i < 4; i++) { ell(g, u + r(), v + r(), 0.035, 0.05, 0); g.fill(); } }
  }
  // ponds: shore then water, merged circles
  const ponds = []; for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) if (cellAt(I, u, v) === 'w') ponds.push([u + 0.5, v + 0.5]);
  if (ponds.length) {
    // water cells joined to their neighbours, so streams read as one ribbon and ponds as one pool
    const wet = new Set(ponds.map(([x, y]) => x + ',' + y));
    const links = [];
    for (const [x, y] of ponds) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) if (wet.has((x + dx) + ',' + (y + dy))) links.push([x, y, x + dx, y + dy]);
    const water = (r, col) => {
      g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = r * 2;
      g.beginPath(); for (const [x, y] of ponds) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.fill();
      g.beginPath(); for (const [a, b, c2, d] of links) { g.moveTo(a, b); g.lineTo(c2, d); } g.stroke();
    };
    water(0.6, c('#d8c48e')); water(0.47, c('#4aa8d8')); g.save(); g.translate(0.04, 0.1); water(0.3, rgba(c('#8fd8f4'), 0.85)); g.restore();
    g.strokeStyle = rgba('#ffffff', 0.6); g.lineWidth = 0.04; g.beginPath();
    for (const [x, y] of ponds) { g.moveTo(x - 0.25, y + 0.25); g.lineTo(x + 0.05, y + 0.25); } g.stroke();
  }
  // dirt paths between buildings
  const edges = ctx.buildings ? pathGraph(I, ctx.buildings, ctx.sizeOf) : [];
  if (edges.length) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const lane = (a, b) => { const mx = (a[0] + b[0]) / 2 + (a[1] - b[1]) * 0.12, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.12; g.moveTo(a[0], a[1]); g.quadraticCurveTo(mx, my, b[0], b[1]); };
    for (const [w0, col, a] of [[0.36, '#8a6a4a', 0.45], [0.28, '#d9b98a', 1], [0.09, '#fff4dc', 0.3]]) {
      g.beginPath(); for (const [a1, b1] of edges) lane(a1, b1); g.strokeStyle = rgba(c(col), a); g.lineWidth = w0; g.stroke();
    }
  }
  // the colony plaza in front of the townhall
  const th = ctx.buildings && ctx.buildings.find((b) => b.island === I.id && b.type === 'townhall');
  if (th) {
    const [w] = ctx.sizeOf('townhall'); const x = th.u + w / 2, y = th.v - 1.1;
    if (y > 0) { g.fillStyle = c('#e2c79a'); ell(g, x, y, 1.6, 0.9, 0); g.fill(); g.strokeStyle = rgba(c('#8a6a4a'), 0.6); g.lineWidth = 0.05; g.stroke(); g.fillStyle = c('#7fc8e8'); ell(g, x, y, 0.35, 0.22, 0); g.fill(); g.stroke(); }
  }
  g.setTransform(s, 0, 0, s, -bx0 * s, -by0 * s);
  // grass blades (screen space, vertical)
  const blades = Math.min(2600, area / 70);
  if (hz < 0.5) for (let k = 0; k < blades; k++) {
    const X = lerp(geo.minX, geo.maxX, R()), Y = lerp(geo.minY, geo.maxY, R());
    g.strokeStyle = R() < 0.6 ? rgba(c(grass[1]), 0.5) : rgba(c(shade(grass[0], 0.35)), 0.6);
    g.lineWidth = 1.2; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + (R() - 0.5) * 3, Y - 3 - R() * 4); g.stroke();
  }
  g.lineWidth = 10; g.strokeStyle = rgba(c(grass[1]), 0.35); smooth(g, top); g.stroke();
  g.lineWidth = 3; g.strokeStyle = rgba(c(shade(grass[0], 0.3)), 0.35); g.save(); g.translate(0, 2); smooth(g, top); g.restore(); g.stroke();
  g.restore();
  tufts(g, geo.env, geo.rx / 5, R, c, grass);
  // waterfall streams across the grass (the fall itself is live)
  for (const f of waterfalls(I)) {
    const [sx, sy] = f.from, x = f.x, y = geo.rimY(x);
    g.strokeStyle = c('#6cc4e6'); g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(lerp(sx, x, 0.5) - 8, lerp(sy, y, 0.6), x, y - 2); g.stroke();
    g.strokeStyle = rgba('#e8fbff', 0.7); g.lineWidth = 2; g.stroke();
  }
  ENV.lx = savedL[0]; ENV.ly = savedL[1];
  if (hz > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = rgba(haze, hz * 0.35); g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over'; }
  return { canvas: cv, s, bounds: geo.bounds };
}

// where water spills over the front rim: from ponds touching the front, else a spring on home islands
export function waterfalls(I) {
  if (I.__falls && I.__falls.key === I.cells) return I.__falls.list;
  const geo = islandGeometry(I), list = [];
  const ponds = []; for (let v = 0; v < I.h; v++) for (let u = 0; u < I.w; u++) if (cellAt(I, u, v) === 'w') ponds.push([u, v]);
  // each water cell's run down to the front rim; the shortest runs spill over
  const runs = [];
  for (const [u, v] of ponds) {
    let fv = v; while (fv > 0 && cellAt(I, u, fv - 1) !== ' ') fv--;
    if (cellAt(I, u, fv - 1) !== ' ' && fv > 0) continue;
    runs.push([v - fv, u, v, fv]);
  }
  runs.sort((a, b) => a[0] - b[0]);
  for (const [dist, u, v, fv] of runs) {
    if (list.length >= 2 || (list.length && dist > 3)) break;
    const [px, py] = local(u + 0.5, v + 0.5), [fx] = local(u + 0.5 + 0.3, fv);
    const x = clamp(fx, geo.minX + 30, geo.maxX - 30);
    if (list.some((f) => Math.abs(f.x - x) < 260)) continue;
    list.push({ x, from: [px, py], w: 10 + geo.rx * 0.02 });
  }
  if (!list.length && (I.kind === 'home' || I.id === 'hearthrock')) {
    const x = geo.cx - geo.rx * 0.45; list.push({ x, from: [x + 30, geo.rimY(x) - 40], w: 10 + geo.rx * 0.02 });
  }
  Object.defineProperty(I, '__falls', { value: { key: I.cells, list }, enumerable: false, configurable: true, writable: true });
  return list;
}

// live waterfall (animated streaks), in island-local px (caller translated to the island origin)
export function drawWaterfall(g, I, f, t, c = (x) => x) { drawFall(g, islandGeometry(I), f.x, f.w, t, c); }
export function drawFall(g, geo, x, w, t, c = (x) => x) {
  const y = geo.rimY(x), lip = geo.lip;
  const tipY = geo.tipPt ? geo.tipPt[1] : y + geo.depth;
  const len = (tipY - y) * 1.5;
  g.fillStyle = vgrad(g, y, y + len, [[0, rgba(c('#e9fbff'), 0.95)], [0.4, rgba(c('#9fdcf2'), 0.75)], [1, rgba(c('#9fdcf2'), 0)]]);
  g.beginPath(); g.moveTo(x - w / 2, y); g.bezierCurveTo(x - w / 2 + 2, y + lip, x - w * 0.8, y + len * 0.5, x - w * 1.4, y + len);
  g.lineTo(x + w * 1.4, y + len); g.bezierCurveTo(x + w * 0.8, y + len * 0.5, x + w / 2 - 2, y + lip, x + w / 2, y); g.fill();
  const R = rng(17);
  g.strokeStyle = rgba('#ffffff', 0.55); g.lineWidth = 1.2; g.beginPath();
  for (let k = 0; k < 9; k++) {
    const xx = x + (R() - 0.5) * w, ph = (t * (0.5 + R() * 0.4) + R()) % 1, y0 = y + ph * len * 0.7, l = 18 + R() * 30;
    g.moveTo(xx + (xx - x) * ph * 0.6, y0); g.lineTo(xx + (xx - x) * (ph + 0.1) * 0.6, y0 + l);
  }
  g.stroke();
  g.fillStyle = rgba('#ffffff', 0.85);
  for (let k = 0; k < 5; k++) { circ(g, x + (R() - 0.5) * w, y + 2 + Math.sin(t * 6 + k) * 1.2, 2.5 + R() * 3); g.fill(); }
  wisp(g, x, y + len * 0.85, 70, 30, '#ffffff', 0.3 + 0.05 * Math.sin(t * 2));
}

// ---------- terrain props (sprites) ----------
// returns [{ kind, key, x, y (local px anchor), v (depth), paint(g, s) }] for the island
export function islandProps(I, occupied) {
  const P = pal(I), list = [], seed = (I.seed || hashStr(I.id)) >>> 0;
  for (let v = 0; v < I.h; v++) for (let u = 0; u < I.w; u++) {
    const ch = cellAt(I, u, v); if (ch === ' ' || ch === 'w' || ch === 'h') continue;
    if (occupied && occupied.has(u + v * I.w)) continue;
    const r = rng(seed + u * 92837111 + v * 689287499);
    const at = (du, dv) => { const [x, y] = local(u + du, v + dv); return { x, y, v: v + dv, u: u + du }; };
    if (ch === 't') {
      const n = 2 + (r() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const p = at(0.2 + r() * 0.6, 0.15 + r() * 0.7), pine = r() < P.trees, vi = (r() * 5) | 0;
        list.push({ ...p, key: `${pine ? 'pine' : 'tree'}|${I.biome}|${vi}`, kind: 'tree' });
      }
    } else if (ch === 's' || ch === 'o' || ch === 'c' || ch === 'r') {
      // outcrops: a boulder on about half the cells, pebbles painted on the ground
      if (ch === 'r' || r() < 0.42) list.push({ ...at(0.3 + r() * 0.4, 0.3 + r() * 0.4), key: `rock|${ch}|${(r() * 4) | 0}|${I.biome}`, kind: 'rock' });
    } else if (ch === 'k') {
      list.push({ ...at(0.5 + (r() - 0.5) * 0.3, 0.5 + (r() - 0.5) * 0.3), key: `crys|${I.biome}|${(r() * 4) | 0}`, kind: 'crystal', glow: true });
    } else if (ch === 'x') {
      if (r() < 0.3) list.push({ ...at(0.3 + r() * 0.4, 0.3 + r() * 0.4), key: `pillar|${(r() * 3) | 0}`, kind: 'pillar' });
    } else if (ch === 'g' || ch === 'f') {
      const q = r();
      if (q < 0.07) list.push({ ...at(0.3 + r() * 0.4, 0.3 + r() * 0.4), key: `bush|${(r() * 4) | 0}`, kind: 'bush' });
      else if (q < 0.085 && ch === 'g') list.push({ ...at(0.3 + r() * 0.4, 0.3 + r() * 0.4), key: `tree|${I.biome}|${(r() * 5) | 0}`, kind: 'tree' });
    }
  }
  return list;
}

// sprite painters keyed by prop key; each paints around (0, 0) = anchor; returns bounds
export const PROP_BOUNDS = { tree: [-26, -62, 30, 8], pine: [-20, -66, 22, 8], rock: [-26, -30, 28, 6], crys: [-22, -46, 22, 8], pillar: [-14, -52, 16, 6], bush: [-18, -20, 18, 4] };
export function paintProp(g, key, c = (x) => x) {
  const parts = key.split('|'), kind = parts[0];
  const vi = +parts[parts.length - 1] || 0;
  if (kind === 'tree' || kind === 'pine') {
    const P = PAL[parts[1]] || PAL.meadow, pine = kind === 'pine';
    const pals = pine ? [['#7cc06a', '#3b7a4c', '#24503a'], ['#8ccc72', '#4a8a52', '#2a5a3e']] : [P.tree, ['#a8d870', '#5a9a48', '#2e5c3a'], ['#b8d86a', '#6a9a40', '#3a5a30'], P.tree, ['#9ed36a', '#4f8f45', '#2c5a3c']];
    tree(g, 0, 0, 0.78 + (vi % 3) * 0.08, { kind: pine ? 'pine' : 'round', seed: vi * 31 + 7, pal: pals[vi % pals.length], c, fruit: !pine && vi === 3 ? '#ff7a5a' : null });
  } else if (kind === 'rock') {
    const ch = parts[1], s = ch === 'r' ? 1.15 : 0.85 + (vi % 3) * 0.12;
    const cols = ch === 'c' ? ['#6a6068', '#3a3238', '#1c161c'] : ch === 'o' ? ['#d8c6b4', '#9c8478', '#5f4c58'] : ch === 'r' ? ['#c8bcb0', '#8a7e7c', '#4f4450'] : ['#e0d4c4', '#a4948a', '#5f4c58'];
    rockLump(g, 0, 0, s, cols.map(c), { seed: vi + 3, flecks: ch === 'o' ? c('#e8963a') : ch === 'c' ? c('#141014') : null, nf: 6 });
    if (ch === 'r') rockLump(g, 14, 4, 0.6, cols.map(c), { seed: vi + 9 });
  } else if (kind === 'crys') {
    const cols = (parts[1] === 'crystal' ? CRYS_V : CRYS).map(c), R = rng(vi + 5);
    const n = 3 + (vi % 2);
    for (let i = 0; i < n; i++) crystalUp(g, (i - (n - 1) / 2) * 8 + (R() - 0.5) * 4, 2 - R() * 3, (14 + R() * 18) * (i === 1 ? 1.25 : 1), (i - (n - 1) / 2) * 0.35 + (R() - 0.5) * 0.2, cols);
  } else if (kind === 'pillar') {
    const h = 26 + vi * 9;
    g.fillStyle = c('#d8ccb8'); g.fillRect(-7, -h, 14, h); g.fillStyle = c('#a8987e'); g.fillRect(3, -h, 4, h);
    g.strokeStyle = 'rgba(42,24,34,0.8)'; g.lineWidth = 1.2; g.strokeRect(-7, -h, 14, h);
    g.fillStyle = c('#c2b49c'); g.beginPath(); g.moveTo(-9, -h); g.lineTo(9, -h); g.lineTo(5, -h - 6 + vi * 2); g.lineTo(-2, -h - 3); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = c('#6a9a4a'); ell(g, -3, -h * 0.4, 4, 2.5, 0.4); g.fill();
  } else if (kind === 'bush') {
    bush(g, 0, 0, 0.9, [c('#9ed36a'), c('#4f8f45')], c(['#ffd0e0', '#fff2a0', '#d0b0ff', '#ffffff'][vi % 4]));
  }
}
