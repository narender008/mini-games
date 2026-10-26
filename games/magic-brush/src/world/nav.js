// Path finding for friends on the lawn and the studio deck. The walkable
// area (world.js `walkable`, a signed distance: < 0 is inside) is sampled
// once on a grid; a path is found with A* over the cells whose distance to
// any obstacle is at least the friend's clearance, then pulled straight
// (string pulling) so friends take clean lines around the easel, the worktable,
// tree trunks, lantern posts and the pond instead of grid staircases.
import { clamp } from '../config.js';

const SQRT2 = Math.SQRT2;

export class Nav {
  // walkable(x, z) -> signed distance (< 0 inside). bounds: { x0, x1, z0, z1 }
  constructor(walkable, { x0 = -5, x1 = 5, z0 = -7, z1 = 3.4, cell = 0.1 } = {}) {
    this.walkable = walkable;
    this.x0 = x0;
    this.z0 = z0;
    this.cell = cell;
    this.w = Math.ceil((x1 - x0) / cell);
    this.h = Math.ceil((z1 - z0) / cell);
    // the signed distance at every cell centre, sampled once
    this.sdf = new Float32Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) this.sdf[j * this.w + i] = walkable(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
    this.g = new Float32Array(this.w * this.h);
    this.from = new Int32Array(this.w * this.h);
    this.mark = new Int32Array(this.w * this.h);
    this.stamp = 0;
    // the open list: a binary heap of (f, cell) pairs
    this.hf = new Float32Array(this.w * this.h);
    this.hid = new Int32Array(this.w * this.h);
    this.hn = 0;
  }

  // the grid cell under a point, as an index (j * w + i)
  cellAt(x, z) {
    return clamp(Math.floor((z - this.z0) / this.cell), 0, this.h - 1) * this.w + clamp(Math.floor((x - this.x0) / this.cell), 0, this.w - 1);
  }

  center(i, j) {
    return { x: this.x0 + (i + 0.5) * this.cell, z: this.z0 + (j + 0.5) * this.cell };
  }

  // is the point at least `clear` metres inside the walkable area?
  free(x, z, clear = 0) {
    return this.sdf[this.cellAt(x, z)] < -clear;
  }

  // the nearest free cell centre to a point (a friend that was pushed out of the area)
  nearestFree(x, z, clear = 0) {
    const c = this.cellAt(x, z);
    if (this.sdf[c] < -clear) return { x, z };
    const ci = c % this.w;
    const cj = (c / this.w) | 0;
    let bi = -1;
    let bj = -1;
    let bestD = Infinity;
    const R = Math.ceil(2.5 / this.cell);
    for (let dj = -R; dj <= R; dj++)
      for (let di = -R; di <= R; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        if (this.sdf[j * this.w + i] >= -clear) continue;
        const d = di * di + dj * dj;
        if (d < bestD) {
          bestD = d;
          bi = i;
          bj = j;
        }
      }
    return bi < 0 ? null : this.center(bi, bj);
  }

  // a straight walk between two points that stays inside (sampled at half a cell)
  clearLine(ax, az, bx, bz, clear) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t, clear)) return false;
    }
    return true;
  }

  // A* from (ax, az) to (bx, bz): an array of {x, z} points (the start is
  // not included), or null when there is no way through
  find(ax, az, bx, bz, clear = 0.1) {
    const start = this.nearestFree(ax, az, clear * 0.5);
    const goal = this.nearestFree(bx, bz, clear);
    if (!start || !goal) return null;
    if (this.clearLine(start.x, start.z, goal.x, goal.z, clear)) return [{ x: goal.x, z: goal.z }];
    const W = this.w;
    const sid = this.cellAt(start.x, start.z);
    const gid = this.cellAt(goal.x, goal.z);
    const si = sid % W;
    const sj = (sid / W) | 0;
    const gi = gid % W;
    const gj = (gid / W) | 0;
    const stamp = ++this.stamp;
    this.hn = 0;
    this.g[sid] = 0;
    this.mark[sid] = stamp;
    this.from[sid] = -1;
    this.push(octile(si, sj, gi, gj), sid);
    let found = false;
    while (this.hn) {
      const id = this.pop();
      const i = id % W;
      const j = (id / W) | 0;
      if (i === gi && j === gj) {
        found = true;
        break;
      }
      const gCur = this.g[id];
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
          const nid = nj * W + ni;
          const s = this.sdf[nid];
          if (s >= -clear) continue;
          // diagonals may not cut a blocked corner
          if (di && dj && (this.sdf[j * W + ni] >= -clear || this.sdf[nj * W + i] >= -clear)) continue;
          // hug the middle of the free space a little: cells close to an obstacle cost more
          const cost = (di && dj ? SQRT2 : 1) * (1 + Math.max(0, 0.35 + s) * 3);
          const g = gCur + cost;
          if (this.mark[nid] !== stamp || g < this.g[nid]) {
            this.mark[nid] = stamp;
            this.g[nid] = g;
            this.from[nid] = id;
            this.push(g + octile(ni, nj, gi, gj), nid);
          }
        }
    }
    if (!found) return null;
    const cells = [];
    for (let id = gj * W + gi; id >= 0; id = this.from[id]) cells.push(this.center(id % W, (id / W) | 0));
    cells.reverse();
    // string pulling: from each anchor, jump to the farthest point still in clear view
    const out = [];
    let a = { x: start.x, z: start.z };
    let k = 0;
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = cells.length - 1; m > k; m--) {
        if (this.clearLine(a.x, a.z, cells[m].x, cells[m].z, clear)) {
          far = m;
          break;
        }
      }
      out.push({ x: cells[far].x, z: cells[far].z });
      a = cells[far];
      k = far;
    }
    if (!out.length) out.push({ x: goal.x, z: goal.z });
    out[out.length - 1] = { x: goal.x, z: goal.z };
    return out;
  }

  push(f, id) {
    if (this.hn === this.hf.length) {
      const hf = new Float32Array(this.hn * 2);
      const hid = new Int32Array(this.hn * 2);
      hf.set(this.hf);
      hid.set(this.hid);
      this.hf = hf;
      this.hid = hid;
    }
    const { hf, hid } = this;
    let k = this.hn++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hf[k] = hf[p];
      hid[k] = hid[p];
      k = p;
    }
    hf[k] = f;
    hid[k] = id;
  }

  // the cell with the lowest f, taken off the heap
  pop() {
    const { hf, hid } = this;
    const top = hid[0];
    const n = --this.hn;
    if (n) {
      const f = hf[n];
      const id = hid[n];
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        if (l >= n) break;
        const m = l + 1 < n && hf[l + 1] < hf[l] ? l + 1 : l;
        if (hf[m] >= f) break;
        hf[k] = hf[m];
        hid[k] = hid[m];
        k = m;
      }
      hf[k] = f;
      hid[k] = id;
    }
    return top;
  }
}

// the octile distance between two cells (the A* estimate)
function octile(i, j, gi, gj) {
  const dx = Math.abs(i - gi);
  const dz = Math.abs(j - gj);
  return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
}

// Total length of a path that starts at (x, z).
export function pathLength(x, z, path) {
  let d = 0;
  let px = x;
  let pz = z;
  for (const p of path) {
    d += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  return d;
}
