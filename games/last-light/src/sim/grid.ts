// Tile grid for one room: collision for circles, line of sight, and a flow field toward the player.
import { TILE } from '../config';

export const enum T {
  FLOOR = 0,
  WALL = 1, // blocks movement and shots, tall
  FOLIAGE = 2, // blocks movement and shots, tall
  WATER = 3, // deep pool: blocks movement, not shots
  SHALLOW = 4, // walkable, slows
  PIT = 5, // blocks movement, not shots
  PROP = 6, // solid object: blocks movement and shots
  LOW = 7, // low rubble or rim: blocks movement, not shots
}

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly t: Uint8Array;
  /** Flow-field distances (in tiles*10) to the target tile; 0xffff = unreachable. */
  readonly flow: Uint16Array;
  flowTarget = -1;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.t = new Uint8Array(w * h);
    this.flow = new Uint16Array(w * h).fill(0xffff);
  }

  get(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return T.WALL;
    return this.t[ty * this.w + tx];
  }
  set(tx: number, ty: number, v: number) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.t[ty * this.w + tx] = v;
  }
  blocksMove(tx: number, ty: number): boolean {
    const v = this.get(tx, ty);
    return v !== T.FLOOR && v !== T.SHALLOW;
  }
  blocksShot(tx: number, ty: number): boolean {
    const v = this.get(tx, ty);
    return v === T.WALL || v === T.FOLIAGE || v === T.PROP;
  }
  walkableAt(x: number, y: number) { return !this.blocksMove(Math.floor(x / TILE), Math.floor(y / TILE)); }
  shotBlockedAt(x: number, y: number) { return this.blocksShot(Math.floor(x / TILE), Math.floor(y / TILE)); }
  isShallow(x: number, y: number) { return this.get(Math.floor(x / TILE), Math.floor(y / TILE)) === T.SHALLOW; }

  /**
   * Push a circle out of solid tiles. Returns true if it touched anything. `o` is mutated in place.
   * Two passes resolve corners cleanly.
   */
  collideCircle(o: { x: number; y: number }, r: number): boolean {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const x0 = Math.floor((o.x - r) / TILE), x1 = Math.floor((o.x + r) / TILE);
      const y0 = Math.floor((o.y - r) / TILE), y1 = Math.floor((o.y + r) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!this.blocksMove(tx, ty)) continue;
          const cx = Math.max(tx * TILE, Math.min(o.x, tx * TILE + TILE));
          const cy = Math.max(ty * TILE, Math.min(o.y, ty * TILE + TILE));
          let dx = o.x - cx, dy = o.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          hit = true;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            o.x += (dx / d) * (r - d);
            o.y += (dy / d) * (r - d);
          } else {
            // Centre is inside the tile: push out along the shortest axis.
            const left = o.x - tx * TILE, right = tx * TILE + TILE - o.x;
            const up = o.y - ty * TILE, down = ty * TILE + TILE - o.y;
            const m = Math.min(left, right, up, down);
            if (m === left) o.x = tx * TILE - r;
            else if (m === right) o.x = tx * TILE + TILE + r;
            else if (m === up) o.y = ty * TILE - r;
            else o.y = ty * TILE + TILE + r;
          }
        }
      }
    }
    return hit;
  }

  /** True if a straight segment is free of shot-blocking tiles (sampled every 4 px). */
  lineOfSight(ax: number, ay: number, bx: number, by: number, moveBlock = false): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(d / 4));
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (moveBlock ? this.blocksMove(tx, ty) : this.blocksShot(tx, ty)) return false;
    }
    return true;
  }

  /** Distance a ray travels before hitting a shot-blocking tile (max `max`). */
  rayLength(x: number, y: number, ang: number, max: number, moveBlock = false): number {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let d = 0; d < max; d += 2) {
      const tx = Math.floor((x + c * d) / TILE), ty = Math.floor((y + s * d) / TILE);
      if (moveBlock ? this.blocksMove(tx, ty) : this.blocksShot(tx, ty)) return d;
    }
    return max;
  }

  /** Breadth-first distances from (tx,ty) over walkable tiles; 8-way without corner cutting. */
  computeFlow(tx: number, ty: number) {
    const idx = ty * this.w + tx;
    if (idx === this.flowTarget) return;
    this.flowTarget = idx;
    const f = this.flow;
    f.fill(0xffff);
    if (this.blocksMove(tx, ty)) return;
    // Dijkstra-lite with two costs (10 straight, 14 diagonal) using a bucket queue.
    const buckets: number[][] = [[idx]];
    f[idx] = 0;
    for (let cost = 0; cost < buckets.length; cost++) {
      const b = buckets[cost];
      if (!b) continue;
      for (let k = 0; k < b.length; k++) {
        const cur = b[k];
        if (f[cur] !== cost) continue;
        const cx = cur % this.w, cy = (cur / this.w) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (this.blocksMove(nx, ny)) continue;
            if (dx && dy && (this.blocksMove(cx + dx, cy) || this.blocksMove(cx, cy + dy))) continue;
            const nc = cost + (dx && dy ? 14 : 10);
            const ni = ny * this.w + nx;
            if (nc < f[ni]) {
              f[ni] = nc;
              (buckets[nc] ||= []).push(ni);
            }
          }
        }
      }
    }
  }

  /** Direction (unit vector) to step from world point toward the flow target, or null. */
  flowDir(x: number, y: number): { x: number; y: number } | null {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const here = this.flow[ty * this.w + tx] ?? 0xffff;
    let best = here, bx = 0, by = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        if (dx && dy && (this.blocksMove(tx + dx, ty) || this.blocksMove(tx, ty + dy))) continue;
        const v = this.flow[ny * this.w + nx];
        if (v < best) { best = v; bx = nx; by = ny; }
      }
    }
    if (best >= here) return null;
    const gx = (bx + 0.5) * TILE - x, gy = (by + 0.5) * TILE - y;
    const d = Math.hypot(gx, gy) || 1;
    return { x: gx / d, y: gy / d };
  }

  /** Flood fill of walkable tiles from a start tile; returns the visited mask. */
  reachable(tx: number, ty: number): Uint8Array {
    const seen = new Uint8Array(this.w * this.h);
    if (this.blocksMove(tx, ty)) return seen;
    const stack = [ty * this.w + tx];
    seen[stack[0]] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      const cx = cur % this.w, cy = (cur / this.w) | 0;
      const n = [cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1];
      for (let i = 0; i < 8; i += 2) {
        const nx = n[i], ny = n[i + 1];
        if (this.blocksMove(nx, ny)) continue;
        const ni = ny * this.w + nx;
        if (!seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    return seen;
  }
}
