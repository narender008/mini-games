// Seeded chamber generation from the hand-authored templates in content/regions.js.
//
//   makeChamber(regionId, index, kind, seed, opts) -> chamber (format in the build brief)
//     index: chamber index within the region (0-based depth); kind: 'entry'|'combat'|'elite'|
//     'miniboss'|'shop'|'fountain'|'memory'|'boss'; seed: uint32 (from G.rng.run).
//     opts: { template (force an id), doors (count, default by kind), rewards ([...] one per door),
//             waves (force count), budget (points multiplier), buildWave(rng, ctx) (optional
//             override returning [{ kind, elite, delay }]), exclude (template ids to avoid) }
//   doorSlots(chamber, n) -> up to n door slots { i, x, y, angle, ex, ey } spread across the edge
//   pickTemplate(regionId, kind, rng, exclude) -> template id
//   shapeOf(template, seed) -> outline polygon (cached per template+seed)
//
// Pure and deterministic: the same (region, index, kind, seed, opts) gives the same chamber.
// The outline is traced from signed distance fields with marching squares, then simplified;
// it is clockwise on screen (positive shoelace area in y-down coordinates).

import { rng as makeRng, hashSeed } from '../core/rng.js';
import { pointInPoly, segDist, clamp } from '../core/math.js';
import { REGIONS, TEMPLATES, RHYTHM, templatesFor } from '../content/regions.js';
import { KINDS, ELITE } from '../content/enemies.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- signed distance shapes
function sdEllipse(x, y, rx, ry) {
  // cheap, well-behaved approximation: exact on axes, good enough for outlines
  const k0 = Math.hypot(x / rx, y / ry);
  if (k0 < 1e-6) return -Math.min(rx, ry);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry));
  return (k0 * (k0 - 1)) / k1;
}
function sdBox(x, y, x0, y0, x1, y1, rr) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 - rr, hy = (y1 - y0) / 2 - rr;
  const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
}
function sdPoly(x, y, pts) {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, segDist(x, y, pts[j][0], pts[j][1], pts[i][0], pts[i][1]));
  return pointInPoly(x, y, pts) ? -d : d;
}
function ngon(cx, cy, R, n, rotDeg) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = rotDeg * D2R + (i / n) * TAU; p.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  return p;
}
function compileShape(s) {
  const [t] = s;
  if (t === 'e') { const [, cx, cy, rx, ry] = s; return { f: (x, y) => sdEllipse(x - cx, y - cy, rx, ry), bb: [cx - rx, cy - ry, cx + rx, cy + ry] }; }
  if (t === 'c') { const [, cx, cy, r] = s; return { f: (x, y) => Math.hypot(x - cx, y - cy) - r, bb: [cx - r, cy - r, cx + r, cy + r] }; }
  if (t === 'r') { const [, x0, y0, x1, y1, rr = 0] = s; return { f: (x, y) => sdBox(x, y, x0, y0, x1, y1, rr), bb: [x0, y0, x1, y1] }; }
  if (t === 'l') { const [, x0, y0, x1, y1, w] = s; return { f: (x, y) => segDist(x, y, x0, y0, x1, y1) - w / 2, bb: [Math.min(x0, x1) - w, Math.min(y0, y1) - w, Math.max(x0, x1) + w, Math.max(y0, y1) + w] }; }
  if (t === 'n' || t === 'p') {
    const pts = t === 'n' ? ngon(s[1], s[2], s[3], s[4], s[5] || 0) : s[1];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { f: (x, y) => sdPoly(x, y, pts), bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  }
  throw new Error('unknown shape ' + t);
}
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}
// value noise, seeded
function makeNoise(seed) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
  };
}

// ---------------------------------------------------------------- outline tracing
const shapeCache = new Map();
export function shapeOf(tpl, seed = 0) {
  const key = tpl.id + ':' + (tpl.noise ? seed : 0);
  if (shapeCache.has(key)) return shapeCache.get(key);
  const adds = tpl.add.map(compileShape), subs = (tpl.sub || []).map(compileShape);
  const blend = tpl.blend || 0, amp = tpl.noise || 0, ns = tpl.noiseScale || 200;
  const n1 = makeNoise(hashSeed(tpl.id, seed, 'n1')), n2 = makeNoise(hashSeed(tpl.id, seed, 'n2'));
  const sdf = (x, y) => {
    let d = adds[0].f(x, y);
    for (let i = 1; i < adds.length; i++) d = smin(d, adds[i].f(x, y), blend);
    for (const s of subs) d = Math.max(d, -s.f(x, y));
    if (amp) d += ((n1(x / ns, y / ns) - 0.5) * 1.4 + (n2(x / (ns * 0.37), y / (ns * 0.37)) - 0.5) * 0.6) * amp;
    return d;
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of adds) { x0 = Math.min(x0, s.bb[0]); y0 = Math.min(y0, s.bb[1]); x1 = Math.max(x1, s.bb[2]); y1 = Math.max(y1, s.bb[3]); }
  const pad = amp + blend + 40, cell = 14;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
  const F = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) F[j * (nx + 1) + i] = sdf(x0 + i * cell, y0 + j * cell);
  const loops = marching(F, nx, ny, x0, y0, cell);
  let best = null, bestA = 0;
  for (const L of loops) { const a = Math.abs(area(L)); if (a > bestA) { bestA = a; best = L; } }
  let poly = simplify(best, tpl.noise ? 2.2 : 1.2);
  if (area(poly) < 0) poly.reverse();
  poly = poly.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  shapeCache.set(key, poly);
  if (shapeCache.size > 200) shapeCache.delete(shapeCache.keys().next().value);
  return poly;
}
function area(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return a / 2; }

// Marching squares with linear interpolation; returns closed loops of points.
function marching(F, nx, ny, x0, y0, cell) {
  const W = nx + 1;
  const v = (i, j) => F[j * W + i];
  // edge ids: horizontal edge (i,j)->(i+1,j): 2*(j*W+i); vertical (i,j)->(i,j+1): 2*(j*W+i)+1
  const pt = new Map();
  const ep = (id) => {
    let p = pt.get(id);
    if (p) return p;
    const k = id >> 1, i = k % W, j = (k - i) / W;
    if (id & 1) { const a = v(i, j), b = v(i, j + 1), t = a / (a - b); p = [x0 + i * cell, y0 + (j + t) * cell]; }
    else { const a = v(i, j), b = v(i + 1, j), t = a / (a - b); p = [x0 + (i + t) * cell, y0 + j * cell]; }
    pt.set(id, p);
    return p;
  };
  const next = new Map(); // directed segments: from edge -> to edge, keeping inside on one side
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = v(i, j) < 0, b = v(i + 1, j) < 0, c = v(i + 1, j + 1) < 0, d = v(i, j + 1) < 0;
    const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = 2 * (j * W + i), B = 2 * ((j + 1) * W + i), L = 2 * (j * W + i) + 1, R = 2 * (j * W + i + 1) + 1;
    const segs = {
      1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[R, T]], 5: [[L, T], [R, B]], 6: [[B, T]], 7: [[L, T]],
      8: [[T, L]], 9: [[T, B]], 10: [[T, R], [B, L]], 11: [[T, R]], 12: [[R, L]], 13: [[R, B]], 14: [[B, L]],
    }[code];
    for (const [s, e] of segs) next.set(s, e);
  }
  const loops = [];
  const used = new Set();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const L = [];
    let e = start, guard = 0;
    while (!used.has(e) && next.has(e) && guard++ < 1e6) { used.add(e); L.push(ep(e)); e = next.get(e); }
    if (L.length > 8) loops.push(L);
  }
  return loops;
}
// Douglas-Peucker on a closed loop
function simplify(pts, tol) {
  const n = pts.length;
  // split at the two farthest-apart points
  let far = 0, fd = 0;
  for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const dp = (a) => {
    if (a.length < 3) return a.slice();
    let idx = 0, md = 0;
    const s = a[0], e = a[a.length - 1];
    for (let i = 1; i < a.length - 1; i++) { const d = segDist(a[i][0], a[i][1], s[0], s[1], e[0], e[1]); if (d > md) { md = d; idx = i; } }
    if (md <= tol) return [s, e];
    const l = dp(a.slice(0, idx + 1)), r = dp(a.slice(idx));
    return l.slice(0, -1).concat(r);
  };
  const A = dp(pts.slice(0, far + 1)), B = dp(pts.slice(far).concat([pts[0]]));
  return A.slice(0, -1).concat(B.slice(0, -1));
}

// ---------------------------------------------------------------- geometry helpers
// Nearest edge hit of a ray from (ox, oy) at angle a. Returns { x, y, nx, ny } (outward normal).
export function rayEdge(shape, ox, oy, a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = Infinity, hit = null;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const [x1, y1] = shape[j], [x2, y2] = shape[i];
    const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((x1 - ox) * ey - (y1 - oy) * ex) / den, u = ((x1 - ox) * dy - (y1 - oy) * dx) / den;
    if (t > 1 && u >= 0 && u <= 1 && t < best) {
      best = t;
      const l = Math.hypot(ex, ey);
      hit = { x: ox + dx * t, y: oy + dy * t, nx: ey / l, ny: -ex / l };
    }
  }
  if (hit && hit.nx * dx + hit.ny * dy < 0) { hit.nx = -hit.nx; hit.ny = -hit.ny; }
  return hit;
}
export function edgeDist(shape, x, y) {
  let d = Infinity;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) d = Math.min(d, segDist(x, y, shape[j][0], shape[j][1], shape[i][0], shape[i][1]));
  return d;
}
export function insideShape(shape, x, y, margin = 0) {
  return pointInPoly(x, y, shape) && (margin <= 0 || edgeDist(shape, x, y) >= margin);
}
export function bounds(shape) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of shape) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}
// Points along the outline every `step` units: [{ x, y, nx, ny, i }] (outward normals)
export function walkEdge(shape, step) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < shape.length; i++) {
    const [x1, y1] = shape[i], [x2, y2] = shape[(i + 1) % shape.length];
    const l = Math.hypot(x2 - x1, y2 - y1);
    if (l < 1e-6) continue;
    const nx = (y2 - y1) / l, ny = -(x2 - x1) / l; // positive shoelace area: (dy, -dx) points out
    let s = step - carry;
    while (s <= l) { out.push({ x: x1 + ((x2 - x1) * s) / l, y: y1 + ((y2 - y1) * s) / l, nx, ny, i }); s += step; }
    carry = l - (s - step);
  }
  return out;
}

// ---------------------------------------------------------------- template pick
export function pickTemplate(regionId, kind, r, exclude = []) {
  let ids = templatesFor(regionId, kind === 'entry' ? 'entry' : kind);
  const left = ids.filter((id) => !exclude.includes(id));
  if (left.length) ids = left;
  return r.pick(ids);
}

// ---------------------------------------------------------------- doors
// Hazards (void, pits, molten, thorns) never swallow the entry or a door: +40 px of clear floor.
const HAZ_PAD = 40;
const inHazard = (hz, x, y, pad = HAZ_PAD) => hz.some((h) => Math.hypot(h.x - x, h.y - y) < h.r + pad);
// Nearest safe floor point to (x, y): inside the shape, 60 px from the edge, clear of hazards.
function safeSpot(shape, hz, x, y) {
  const ok = (px, py) => pointInPoly(px, py, shape) && edgeDist(shape, px, py) >= 60 && !inHazard(hz, px, py);
  if (ok(x, y)) return null;
  for (let rr = 20; rr <= 600; rr += 20) {
    const n = Math.max(8, Math.round(rr / 12));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / 2, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (ok(px, py)) return { x: Math.round(px), y: Math.round(py) }; }
  }
  return null;
}
function computeDoorSlots(tpl, shape, hz = []) {
  const slots = [];
  for (const spec of tpl.doors || []) {
    const [deg, ox = 0, oy = 0] = Array.isArray(spec) ? spec : [spec];
    const a = deg * D2R;
    const h = rayEdge(shape, ox, oy, a);
    if (!h) continue;
    const inset = 46;
    const x = h.x - Math.cos(a) * inset, y = h.y - Math.sin(a) * inset;
    if (inHazard(hz, x, y) || inHazard(hz, h.x, h.y)) continue; // a door never opens onto a hazard
    slots.push({ x, y, angle: a, ex: h.x, ey: h.y, deg });
  }
  return slots;
}
// Pick n slots spread out; the first authored slot (usually the back centre) is favoured.
export function doorSlots(chamber, n) {
  const all = chamber.doorSlots || [];
  if (n >= all.length) return all.map((s, i) => ({ i, ...s }));
  const picked = [all[0]];
  while (picked.length < n) {
    let best = null, bd = -1;
    for (const s of all) {
      if (picked.includes(s)) continue;
      const d = Math.min(...picked.map((p) => Math.hypot(p.ex - s.ex, p.ey - s.ey)));
      if (d > bd) { bd = d; best = s; }
    }
    picked.push(best);
  }
  // order left to right along the back so door indices read naturally
  picked.sort((a, b) => a.ex - b.ex);
  return picked.map((s, i) => ({ i, ...s }));
}

// ---------------------------------------------------------------- hazards from channels
function channelCircles(type, w, pts, id) {
  const out = [];
  const r = w / 2;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
    const l = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(l / (r * 1.1)));
    for (let s = k ? 1 : 0; s <= n; s++) out.push({ type, x: x1 + ((x2 - x1) * s) / n, y: y1 + ((y2 - y1) * s) / n, r, chan: id });
  }
  return out;
}

// ---------------------------------------------------------------- spawn points
function spawnPointsFor(shape, blockers, entry, r) {
  const b = bounds(shape), pts = [];
  const step = 120;
  for (let y = b.y0 + 60; y < b.y1; y += step) for (let x = b.x0 + 60; x < b.x1; x += step) {
    const px = x + r.range(-36, 36), py = y + r.range(-30, 30);
    if (!pointInPoly(px, py, shape) || edgeDist(shape, px, py) < 80) continue;
    if (Math.hypot(px - entry.x, py - entry.y) < 420) continue;
    if (blockers.some((o) => Math.hypot(px - o.x, py - o.y) < o.r + 60)) continue;
    pts.push({ x: Math.round(px), y: Math.round(py) });
  }
  return pts;
}

// ---------------------------------------------------------------- waves
function defaultWave(r, { region, depth, budget, wave, elites }) {
  const pool = Object.keys(KINDS).filter((k) => KINDS[k].regions.includes(region) && (KINDS[k].minDepth || 0) <= depth && KINDS[k].tier !== 'elite');
  const out = [];
  let left = budget;
  if (elites) {
    const big = Object.keys(KINDS).filter((k) => KINDS[k].regions.includes(region) && KINDS[k].tier === 'elite');
    const mids = pool.filter((k) => KINDS[k].tier === 'mid');
    for (let i = 0; i < elites; i++) {
      const k = big.length && (wave >= 1 || depth >= 4) ? r.pick(big) : mids.length ? r.pick(mids) : pool[0];
      out.push({ kind: k, elite: true });
      left -= (KINDS[k].points || 2) * (KINDS[k].tier === 'elite' ? 1 : ELITE.points);
    }
  }
  let guard = 0;
  while (left > 0.6 && guard++ < 40) {
    const fit = pool.filter((k) => (KINDS[k].points || 1) <= left + 0.5);
    if (!fit.length) break;
    const k = r.weighted(fit, (k) => KINDS[k].weight || 1);
    out.push({ kind: k, elite: false });
    left -= KINDS[k].points || 1;
  }
  return out;
}
export function waveBudget(regionId, depth, wave, kind) {
  const ri = Math.max(0, REGIONS[regionId].index);
  let b = 3.4 + depth * 0.55 + ri * 1.6 + wave * 1.1;
  if (kind === 'entry') b *= 0.7;
  if (kind === 'elite') b *= 1.1;
  return b;
}
function placeWave(list, spawns, r, hero) {
  // farther points first, shuffled within distance bands, then spread
  const pts = spawns.slice().sort((a, b) => Math.hypot(b.x - hero.x, b.y - hero.y) - Math.hypot(a.x - hero.x, a.y - hero.y));
  const top = pts.slice(0, Math.max(list.length * 2, Math.ceil(pts.length * 0.7)));
  r.shuffle(top);
  return list.map((e, i) => {
    const p = top[i % top.length] || { x: 0, y: 0 };
    return { kind: e.kind, elite: !!e.elite, x: p.x + (i >= top.length ? r.range(-40, 40) : 0), y: p.y + (i >= top.length ? r.range(-30, 30) : 0), delay: e.delay ?? Math.round(i * 0.12 * 100) / 100 };
  });
}

// ---------------------------------------------------------------- props and lights
const PROP_RULES = {
  glasswood: (c, r, add) => {
    for (const p of walkEdge(c.shape, 150)) {
      const back = p.ny < -0.35, front = p.ny > 0.45;
      if (back && r() < 0.6) add('tree', p.x + p.nx * 30, p.y + p.ny * 10, r.range(0.75, 1.1));
      else if (r() < (front ? 0.45 : 0.7)) add(front ? 'shard' : 'crystal', p.x + p.nx * 18, p.y + p.ny * 8, front ? r.range(0.4, 0.6) : r.range(0.6, 1.15));
      if (!front && r() < 0.12) add('lantern', p.x - p.nx * 30, p.y - p.ny * 30, 1);
    }
  },
  choir: (c, r, add) => {
    for (const p of walkEdge(c.shape, 170)) {
      if (p.ny > 0.45) { if (r() < 0.55) add('balustrade', p.x, p.y, 1); }
      else if (r() < 0.35) add('candles', p.x - p.nx * 40, p.y - p.ny * 40, r.range(0.8, 1.1));
    }
  },
  forge: (c, r, add) => {
    for (const p of walkEdge(c.shape, 160)) {
      if (p.ny > 0.45) { if (r() < 0.5) add('rail', p.x, p.y, 1); }
      else if (r() < 0.3) add('brazier', p.x - p.nx * 44, p.y - p.ny * 44, r.range(0.85, 1.1));
    }
  },
  unwoven: (c, r, add) => {
    for (const p of walkEdge(c.shape, 140)) {
      if (p.ny < -0.3 && r() < 0.35) add('loompost', p.x + p.nx * 20, p.y + p.ny * 6, r.range(0.7, 1.1));
      else if (r() < 0.25) add('needle', p.x + p.nx * 16, p.y + p.ny * 6, r.range(0.6, 1.0));
    }
  },
};
const LIGHT_RULES = {
  crystal: (o, P) => ({ x: o.x, y: o.y - 50, r: 150 + o.r * 1.5, color: P.crystalLight, i: 0.75 }),
  tree: (o, P) => ({ x: o.x, y: o.y - 160, r: 260, color: P.light[o.seed % 2], i: 0.75 }),
  column: () => null,
  statue: (o, P) => ({ x: o.x, y: o.y - 70, r: 110, color: P.light[0], i: 0.4 }),
  anvil: (o, P) => ({ x: o.x, y: o.y - 30, r: 120, color: P.light[0], i: 0.45 }),
  chimney: (o, P) => ({ x: o.x, y: o.y - 150, r: 220, color: P.light[0], i: 0.7, flicker: 0.15 }),
  chorister: (o) => ({ x: o.x, y: o.y - 120, r: 150, color: '#bfe0ff', i: 0.35 }),
  pew: () => null,
  spindle: (o, P) => ({ x: o.x, y: o.y - 90, r: 140, color: P.light[o.seed % P.light.length], i: 0.55 }),
};

// ---------------------------------------------------------------- main
export function makeChamber(regionId, index, kind = 'combat', seed = 1, opts = {}) {
  const R = REGIONS[regionId];
  if (!R) throw new Error('unknown region ' + regionId);
  const r = makeRng(hashSeed('chamber', regionId, index, kind, seed));
  const tplId = opts.template || pickTemplate(regionId, kind, r, opts.exclude || []);
  const tpl = TEMPLATES[tplId];
  const shape = shapeOf(tpl, seed);
  const P = R.palette;

  const obstacles = (tpl.obstacles || []).map(([type, x, y, rr], i) => ({ type, x, y, r: rr, seed: hashSeed(tplId, i, seed) % 100000 }));
  const features = (tpl.features || []).map(([type, x, y, rr]) => ({ type, x, y, r: rr }));
  for (const f of features) if (f.r > 0) obstacles.push({ type: f.type, x: f.x, y: f.y, r: f.r, feature: true, seed: 0 });
  const hazards = (tpl.hazards || []).map(([type, x, y, rr]) => ({ type, x, y, r: rr }));
  (tpl.channels || []).forEach(([type, w, pts], ci) => hazards.push(...channelCircles(type, w, pts, ci)));
  const channels = (tpl.channels || []).map(([type, w, pts]) => ({ type, w, pts }));

  // entry
  const ea = (tpl.entry ?? 90) * D2R;
  const eh = rayEdge(shape, 0, 0, ea) || { x: 0, y: 400 };
  const entry = { x: Math.round(eh.x - Math.cos(ea) * 120), y: Math.round(eh.y - Math.sin(ea) * 120), ex: eh.x, ey: eh.y, angle: ea };
  const es = safeSpot(shape, hazards, entry.x, entry.y);
  if (es) { entry.x = es.x; entry.y = es.y; entry.moved = true; }

  const chamber = {
    id: `${regionId}:${index}:${kind}:${tplId}:${seed >>> 0}`,
    region: regionId, template: tplId, name: tpl.name, kind, index, seed: seed >>> 0,
    shape, obstacles, hazards, channels, features, props: [],
    entry, doors: [], doorSlots: computeDoorSlots(tpl, shape, hazards),
    waves: [], spawnPoints: [], lights: [], ambient: regionId, edge: R.edge,
  };
  if (tpl.bossAt) chamber.bossAt = { x: tpl.bossAt[0], y: tpl.bossAt[1] };
  if (tpl.shopSlots) chamber.shopSlots = tpl.shopSlots.map(([x, y]) => ({ x, y }));
  const stations = [];
  for (const f of features) {
    if (f.type === 'shop') stations.push({ id: 'shop', kind: 'station', x: f.x, y: f.y + f.r + 60, r: 110, prompt: 'Trade' });
    if (f.type === 'fountain') stations.push({ id: 'fountain', kind: 'station', x: f.x, y: f.y + f.r + 40, r: 130, prompt: 'Drink' });
    if (f.type === 'memory') stations.push({ id: 'memory', kind: 'station', x: f.x, y: f.y + f.r + 40, r: 120, prompt: 'Remember' });
  }
  chamber.stations = stations;

  // doors
  const nd = opts.doors ?? (kind === 'boss' ? 1 : opts.rewards ? opts.rewards.length : kind === 'entry' ? 2 : r() < 0.45 ? 3 : 2);
  chamber.doors = doorSlots(chamber, Math.min(nd, chamber.doorSlots.length)).map((s, i) => ({
    i, x: Math.round(s.x), y: Math.round(s.y), angle: s.angle, ex: s.ex, ey: s.ey, reward: opts.rewards ? opts.rewards[i] ?? null : null, open: false,
    side: Math.abs(Math.sin(s.angle)) < 0.55,
  }));

  // spawn points and waves
  const blockers = obstacles.concat(hazards);
  chamber.spawnPoints = spawnPointsFor(shape, blockers, entry, r);
  const combatKinds = ['entry', 'combat', 'elite', 'miniboss'];
  if (combatKinds.includes(kind) && chamber.spawnPoints.length) {
    const W = RHYTHM.waves;
    let nw = opts.waves ?? (kind === 'entry' ? W.entry : kind === 'miniboss' ? W.miniboss : r.int(...(kind === 'elite' ? W.elite : W.combat)));
    const build = opts.buildWave || defaultWave;
    for (let w = 0; w < nw; w++) {
      let list;
      if (kind === 'miniboss') {
        const big = Object.keys(KINDS).filter((k) => KINDS[k].tier === 'elite' && KINDS[k].regions.includes(regionId));
        list = [{ kind: big.length ? r.pick(big) : 'loomhulk', elite: true, miniboss: true }];
        list.push(...defaultWave(r, { region: regionId, depth: index, budget: waveBudget(regionId, index, 0) * 0.5, wave: 0, elites: 0 }));
      } else {
        const elites = kind === 'elite' && w === nw - 1 ? 1 : 0;
        const budget = waveBudget(regionId, index, w, kind) * (opts.budget ?? 1);
        list = build(r, { region: regionId, depth: index, budget, wave: w, elites });
      }
      const placed = placeWave(list, chamber.spawnPoints, r, entry);
      if (kind === 'miniboss') {
        // the miniboss stands centre-back, so its entrance reads
        const mx = 0, my = Math.round(bounds(shape).y0 * 0.45), ms = safeSpot(shape, hazards, mx, my);
        placed[0].x = ms ? ms.x : mx; placed[0].y = ms ? ms.y : my; placed[0].miniboss = true;
      }
      chamber.waves.push(placed);
    }
  }

  // decorative props (painters only)
  const pr = makeRng(hashSeed('props', tplId, seed));
  const add = (type, x, y, s) => chamber.props.push({ type, x: Math.round(x), y: Math.round(y), s: Math.round(s * 100) / 100, seed: (pr() * 1e6) | 0 });
  (PROP_RULES[regionId] || (() => {}))(chamber, pr, add);
  // keep decorations clear of doors and the entry
  chamber.props = chamber.props.filter((p) => chamber.doors.every((d) => Math.hypot(p.x - d.ex, p.y - d.ey) > 150) && Math.hypot(p.x - entry.ex, p.y - entry.ey) > 140);

  // lights
  const LP = { light: P.light, crystalLight: P.light[0] };
  for (const o of obstacles) {
    const f = LIGHT_RULES[o.type];
    const l = f ? f({ ...o, seed: o.seed || 0 }, { ...LP, crystalLight: P.light[(o.seed || 0) % P.light.length] }) : null;
    if (l) chamber.lights.push(l);
  }
  for (const p of chamber.props) {
    if (p.type === 'tree' && pr() < 0.6) chamber.lights.push({ x: p.x, y: p.y - 150 * p.s, r: 240 * p.s, color: P.light[p.seed % 2], i: 0.6 });
    if (p.type === 'crystal' && pr() < 0.35) chamber.lights.push({ x: p.x, y: p.y - 50 * p.s, r: 150 * p.s, color: P.light[p.seed % P.light.length], i: 0.45 });
    if (p.type === 'lantern') chamber.lights.push({ x: p.x, y: p.y - 90, r: 230, color: P.light[p.seed % P.light.length], i: 0.8, flicker: 0.08 });
    if (p.type === 'candles') chamber.lights.push({ x: p.x, y: p.y - 40, r: 170, color: '#ffc870', i: 0.6, flicker: 0.12 });
    if (p.type === 'brazier') chamber.lights.push({ x: p.x, y: p.y - 70, r: 230, color: '#ff9a3a', i: 0.8, flicker: 0.2 });
    if (p.type === 'loompost' && pr() < 0.5) chamber.lights.push({ x: p.x, y: p.y - 120, r: 160, color: P.light[p.seed % P.light.length], i: 0.4 });
  }
  // the Forge: furnace mouths along the back walls, each a warm light the painter puts a fire behind
  if (regionId === 'forge' && kind !== 'boss') {
    chamber.furnaces = [];
    for (const p of walkEdge(shape, 330)) {
      if (p.ny > -0.6) continue;
      if (chamber.doors.some((d) => Math.hypot(d.ex - p.x, d.ey - p.y) < 220) || Math.hypot(entry.ex - p.x, entry.ey - p.y) < 200) continue;
      chamber.furnaces.push({ x: Math.round(p.x), y: Math.round(p.y) });
      chamber.lights.push({ x: Math.round(p.x), y: Math.round(p.y + 50), r: 340, color: '#ff7a2a', i: 0.85, flicker: 0.15, furnace: true });
    }
  }
  const haz = { molten: ['#ff7a2a', 0.85, 1.9], pit: [regionId === 'choir' ? '#3a9aff' : '#6a5aff', 0.45, 1.3], thorns: [P.danger, 0.5, 1.6], void: ['#b04aff', 0.35, 1.2] };
  const seen = new Set();
  for (const h of hazards) {
    const [color, i, k] = haz[h.type] || ['#ffffff', 0.3, 1];
    if (h.chan != null) { const key = h.chan + ':' + Math.round(h.x / 160) + ':' + Math.round(h.y / 160); if (seen.has(key)) continue; seen.add(key); }
    chamber.lights.push({ x: h.x, y: h.y, r: Math.max(120, h.r * k), color, i, flicker: h.type === 'molten' ? 0.12 : 0 });
  }
  for (const f of features) {
    const L = {
      fountain: [0, -60, 360, '#9ff0ff', 0.95], shop: [0, -90, 320, '#ffcf7a', 0.9], memory: [0, -80, 300, '#ffd27a', 0.9],
      throne: [0, -120, 420, P.light[2] || P.light[0], 0.8], organ: [0, -160, 520, '#ffd27a', 0.6], furnace: [0, -60, 620, '#ff8a2a', 0.9],
      crucible: [0, -50, 340, '#ffb040', 0.95], gear: [0, 0, 220, '#ff9a3a', 0.4], altar: [0, -60, 260, '#ffd27a', 0.8],
      rose: [0, 0, 320, '#7fd0ff', 0.4], sigil: [0, 0, 280, '#ffd27a', 0.35], loomframe: [0, -80, 420, '#e8e0ff', 0.5], scissors: [0, -100, 460, '#ff4a8a', 0.6],
    }[f.type];
    if (L) chamber.lights.push({ x: f.x + L[0], y: f.y + L[1], r: L[2], color: L[3], i: L[4], flicker: f.type === 'furnace' || f.type === 'crucible' ? 0.1 : 0 });
  }
  for (const d of chamber.doors) chamber.lights.push({ x: d.ex, y: d.ey - 70, r: 220, color: '#ffd27a', i: 0.55, door: d.i });
  chamber.lights.push({ x: entry.x, y: entry.y, r: 200, color: '#ffd27a', i: 0.25 });
  return chamber;
}

// Assign rewards after generation (run.js may call this when it decides offers later).
export function setDoorRewards(chamber, rewards) {
  chamber.doors.forEach((d, i) => { d.reward = rewards[i] ?? null; });
  return chamber;
}
