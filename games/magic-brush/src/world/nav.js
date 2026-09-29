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
    this.heap = [];
  }

  cellOf(x, z) {
    return [clamp(Math.floor((x - this.x0) / this.cell), 0, this.w - 1), clamp(Math.floor((z - this.z0) / this.cell), 0, this.h - 1)];
  }

  center(i, j) {
    return { x: this.x0 + (i + 0.5) * this.cell, z: this.z0 + (j + 0.5) * this.cell };
  }

  // is the point at least `clear` metres inside the walkable area?
  free(x, z, clear = 0) {
    const [i, j] = this.cellOf(x, z);
    return this.sdf[j * this.w + i] < -clear;
  }

  // the nearest free cell centre to a point (a friend that was pushed out of the area)
  nearestFree(x, z, clear = 0) {
    const [ci, cj] = this.cellOf(x, z);
    if (this.sdf[cj * this.w + ci] < -clear) return { x, z };
    let best = null;
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
          best = this.center(i, j);
        }
      }
    return best;
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
    const [si, sj] = this.cellOf(start.x, start.z);
    const [gi, gj] = this.cellOf(goal.x, goal.z);
    const W = this.w;
    const stamp = ++this.stamp;
    const heap = this.heap;
    heap.length = 0;
    const push = (f, id) => {
      heap.push([f, id]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const octile = (i, j) => {
      const dx = Math.abs(i - gi);
      const dz = Math.abs(j - gj);
      return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
    };
    const sid = sj * W + si;
    this.g[sid] = 0;
    this.mark[sid] = stamp;
    this.from[sid] = -1;
    push(octile(si, sj), sid);
    let found = false;
    while (heap.length) {
      const [, id] = pop();
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
            push(g + octile(ni, nj), nid);
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
