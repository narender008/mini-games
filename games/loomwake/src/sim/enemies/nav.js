// Foe navigation: a coarse grid per chamber and a flow field toward Iri.
//
// The grid (CELL px) is built once per chamber from chamber.shape, obstacles
// and hazards. Each cell has a flag byte:
//   WALL  outside the floor polygon or inside an obstacle (blocks sight and feet)
//   NEAR  within a body's clearance of a wall or obstacle (walkable, avoided)
//   PIT   a pit or void (blocks walkers, not flyers or sight)
//   EDGE  close to a pit's lip (walkable, avoided by walkers)
//   HAZ   a lasting floor hazard (molten, thorns, spikes: walkable, avoided)
// Two flow fields (ground and fly) hold each cell's path cost to Iri. They are
// Dijkstra fills from her cell, rebuilt lazily at most every REFRESH seconds
// and only when she has moved to another cell. Deterministic: no randomness.
//
// Foes use it through brain.js: e.los (sight to Iri, refreshed ~10 Hz) gates
// every attack choice; goTo follows the field whenever Iri is out of sight or
// the straight walk to the wanted point is blocked by a wall or a pit.

export const CELL = 24;
const WALL = 1, NEAR = 2, PIT = 4, EDGE = 8, HAZ = 16;
const REFRESH = 0.25;
const CLEAR = 18;          // body clearance from walls for NEAR
const INF = 1e9;

const grids = new WeakMap();

function segD2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px, y = ay + dy * t - py;
  return x * x + y * y;
}

function build(ch) {
  const S = ch.shape, n = S.length;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of S) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  x0 -= CELL; y0 -= CELL;
  const cols = Math.ceil((x1 - x0) / CELL) + 3, rows = Math.ceil((y1 - y0) / CELL) + 3;
  const f = new Uint8Array(cols * rows);
  const c2 = CLEAR * CLEAR, xs = [];
  // inside/outside by scanline (even-odd crossings of each row), NEAR from the edges close to the row
  for (let j = 0; j < rows; j++) {
    const y = y0 + j * CELL, row = j * cols;
    xs.length = 0;
    const near = [];
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const ax = S[b][0], ay = S[b][1], bx = S[a][0], by = S[a][1];
      if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      if (Math.min(ay, by) - CLEAR <= y && Math.max(ay, by) + CLEAR >= y) near.push(ax, ay, bx, by);
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i < cols; i++) f[row + i] = WALL;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / CELL)), i1 = Math.min(cols - 1, Math.floor((xs[k + 1] - x0) / CELL));
      for (let i = i0; i <= i1; i++) f[row + i] = 0;
    }
    for (let k = 0; k < near.length; k += 4) {
      const ax = near[k], ay = near[k + 1], bx = near[k + 2], by = near[k + 3];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - CLEAR - x0) / CELL)), i1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx) + CLEAR - x0) / CELL));
      for (let i = i0; i <= i1; i++) if (!(f[row + i] & (WALL | NEAR)) && segD2(x0 + i * CELL, y, ax, ay, bx, by) < c2) f[row + i] |= NEAR;
    }
  }
  // stamp a disc's flags over the cells it covers: inner radius gets `fin`, the rim out to `out` gets `fout`
  const stamp = (x, y, rin, fin, rout, fout) => {
    const i0 = Math.max(0, Math.floor((x - rout - x0) / CELL)), i1 = Math.min(cols - 1, Math.ceil((x + rout - x0) / CELL));
    const j0 = Math.max(0, Math.floor((y - rout - y0) / CELL)), j1 = Math.min(rows - 1, Math.ceil((y + rout - y0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(x0 + i * CELL - x, y0 + j * CELL - y);
      if (d < rin) f[j * cols + i] |= fin; else if (d < rout) f[j * cols + i] |= fout;
    }
  };
  const obs = ch.obstacles || [];
  for (const o of obs) stamp(o.x, o.y, o.r || 0, WALL, (o.r || 0) + CLEAR, NEAR);
  for (const z of ch.hazards || []) {
    if (!(z.r > 0)) continue;
    if (z.type === 'pit' || z.type === 'void') stamp(z.x, z.y, z.r + 6, PIT, z.r + 34, EDGE);
    else stamp(z.x, z.y, z.r + 10, HAZ, 0, 0);
  }
  const N = cols * rows;
  return { ch, shape: S, nobs: obs.length, nhz: (ch.hazards || []).length, x0, y0, cols, rows, f, flow: { ground: null, fly: null },
    buf: { done: new Uint8Array(N), hk: new Int32Array(N * 8 + 16), hp: new Float32Array(N * 8 + 16) } };
}

// The chamber's grid (rebuilt if the chamber's geometry was swapped).
export function navOf(G) {
  const ch = G.chamber;
  if (!ch || !ch.shape || ch.shape.length < 3) return null;
  let g = grids.get(ch);
  if (!g || g.shape !== ch.shape || g.nobs !== (ch.obstacles || []).length || g.nhz !== (ch.hazards || []).length) { g = build(ch); grids.set(ch, g); }
  return g;
}

function idx(g, x, y) {
  const i = Math.round((x - g.x0) / CELL), j = Math.round((y - g.y0) / CELL);
  return i < 0 || j < 0 || i >= g.cols || j >= g.rows ? -1 : j * g.cols + i;
}
const cx = (g, k) => g.x0 + (k % g.cols) * CELL;
const cy = (g, k) => g.y0 + Math.floor(k / g.cols) * CELL;

// cost to step onto a cell (INF = impassable)
function cost(v, fly) {
  if (v & WALL) return INF;
  if (!fly && (v & PIT)) return INF;
  let c = 1;
  if (v & NEAR) c += 2;
  if (!fly && (v & EDGE)) c += 3;
  if (!fly && (v & HAZ)) c += 5;
  return c;
}

// Clear sight between two points: only walls and obstacles block it (needles fly over pits).
// The ends skip `skip` px so a body standing close to a wall still sees out.
export function sight(g, ax, ay, bx, by, skip = 14) {
  if (!g) return true;
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < skip * 2) return true;
  const step = CELL * 0.5, n = Math.ceil((d - skip * 2) / step);
  for (let s = 0; s <= n; s++) {
    const t = (skip + Math.min(d - skip * 2, s * step)) / d;
    const k = idx(g, ax + dx * t, ay + dy * t);
    if (k < 0 || (g.f[k] & WALL)) return false;
  }
  return true;
}

// Can a body walk the straight line? Walls always block; pits block walkers.
export function walkable(g, ax, ay, bx, by, fly = false) {
  if (!g) return true;
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const step = CELL * 0.5, n = Math.ceil(d / step);
  const bad = fly ? WALL : WALL | PIT;
  for (let s = 1; s <= n; s++) {
    const t = Math.min(1, (s * step) / d);
    const k = idx(g, ax + dx * t, ay + dy * t);
    if (k < 0 || (g.f[k] & bad)) return false;
  }
  return true;
}

// ---------- the flow field: a binary-heap Dijkstra from Iri's cell ----------
function fill(g, fly, hx, hy) {
  const N = g.cols * g.rows, f = g.f, C = g.cols, B = g.buf;
  const dist = new Float32Array(N).fill(INF);
  // lazy-deletion heap: (cell, priority) pairs; stale pairs are skipped on pop
  const hk = B.hk, hp = B.hp, M = hk.length; let hn = 0;
  const push = (k, p) => {
    let i = hn++;
    while (i > 0) { const q = (i - 1) >> 1; if (hp[q] <= p) break; hk[i] = hk[q]; hp[i] = hp[q]; i = q; }
    hk[i] = k; hp[i] = p;
  };
  const pop = () => {
    const top = hk[0], lk = hk[--hn], lp = hp[hn];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1; if (c >= hn) break;
      if (c + 1 < hn && hp[c + 1] < hp[c]) c++;
      if (hp[c] >= lp) break;
      hk[i] = hk[c]; hp[i] = hp[c]; i = c;
    }
    hk[i] = lk; hp[i] = lp;
    return top;
  };
  // seed: Iri's cell, or the open cells around her when she stands on a blocked one
  const k0 = idx(g, hx, hy);
  if (k0 >= 0) {
    if (cost(f[k0], fly) < INF) { dist[k0] = 0; push(k0, 0); }
    else {
      const i0 = k0 % C, j0 = (k0 / C) | 0;
      for (let r = 1; r <= 3 && !hn; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= C || j >= g.rows) continue;
        const k = j * C + i; if (cost(f[k], fly) < INF) { dist[k] = Math.hypot(i - i0, j - j0); push(k, dist[k]); }
      }
    }
  }
  const done = B.done; done.fill(0);
  while (hn) {
    const k = pop();
    if (done[k]) continue; done[k] = 1;
    const i = k % C, j = (k / C) | 0, dk = dist[k];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= C || nj >= g.rows) continue;
      const nk = nj * C + ni;
      if (done[nk]) continue;
      const c = cost(f[nk], fly); if (c >= INF) continue;
      // no cutting a wall's corner on a diagonal
      if (di && dj && (cost(f[j * C + ni], fly) >= INF || cost(f[nj * C + i], fly) >= INF)) continue;
      const nd = dk + c * (di && dj ? 1.4142 : 1);
      if (nd < dist[nk] && hn < M - 1) { dist[nk] = nd; push(nk, nd); }
    }
  }
  return dist;
}

function field(G, g, fly) {
  const h = G.hero; if (!h) return null;
  const key = fly ? 'fly' : 'ground';
  const F = g.flow[key];
  const hk = idx(g, h.x, h.y);
  const t = G.t || 0;
  if (F && (F.hk === hk || t - F.t < REFRESH) && t >= F.t) return F.dist;
  g.flow[key] = { hk, t, dist: fill(g, fly, h.x, h.y) };
  return g.flow[key].dist;
}

// The point a foe should head for to reach Iri around walls (null when no path).
// It walks the field downhill a few cells and keeps the farthest one it can walk
// to in a straight line, so foes cut smooth corners rather than zig-zag.
export function flowPoint(G, e) {
  const g = navOf(G); if (!g) return null;
  const fly = !!e.flying;
  const dist = field(G, g, fly); if (!dist) return null;
  let k = idx(g, e.x, e.y);
  if (k < 0) return null;
  const C = g.cols;
  // standing on a blocked cell (pressed into a wall): use the best neighbour
  if (dist[k] >= INF) {
    let best = -1, bd = INF;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const nk = k + dj * C + di; if (nk >= 0 && nk < dist.length && dist[nk] < bd) { bd = dist[nk]; best = nk; } }
    if (best < 0) return null;
    return [cx(g, best), cy(g, best)];
  }
  let px = null, py = null, cur = k;
  for (let s = 0; s < 6; s++) {
    const i = cur % C, j = (cur / C) | 0;
    let best = -1, bd = dist[cur];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= C || nj >= g.rows) continue;
      const nk = nj * C + ni;
      if (dist[nk] < bd) { bd = dist[nk]; best = nk; }
    }
    if (best < 0) break;
    cur = best;
    const x = cx(g, cur), y = cy(g, cur);
    if (s === 0 || walkable(g, e.x, e.y, x, y, fly)) { px = x; py = y; } else break;
  }
  return px === null ? null : [px, py];
}

// Push a walker away from pit lips it is about to step over (returns [vx, vy] to add, unit-ish).
export function pitPush(G, e) {
  if (e.flying) return [0, 0];
  const hz = G.chamber && G.chamber.hazards; if (!hz) return [0, 0];
  let sx = 0, sy = 0;
  for (const z of hz) {
    if (z.type !== 'pit' && z.type !== 'void') continue;
    const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy), m = z.r + e.r + 26;
    if (d > 0.01 && d < m) { const k = (m - d) / 26; sx += (dx / d) * k; sy += (dy / d) * k; }
  }
  return [sx, sy];
}

// Sight from a foe to Iri (eye height ignored; walls are full height).
export function seesHero(G, e) {
  const h = G.hero; if (!h) return false;
  return sight(navOf(G), e.x, e.y, h.x, h.y);
}

// debug: { cols, rows, cell flags, last fields }
export function navDebug(G) { const g = navOf(G); return g && { cols: g.cols, rows: g.rows, x0: g.x0, y0: g.y0, cell: CELL, flags: g.f, flow: g.flow }; }
