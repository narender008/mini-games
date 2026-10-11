// A flow field over the room's grid toward the heroine: foes that cannot walk
// straight to her follow it round walls, pillars and gaps. Rebuilt when she
// moves into another cell (a breadth-first fill over at most a thousand
// cells), never per foe.
export class Flow {
  constructor() {
    this.room = null;
    this.dist = null;
    this.queue = null;
    this.cx = -1;
    this.cy = -1;
    this.blocked = null;
  }

  setRoom(room) {
    this.room = room;
    const n = room.w * room.h;
    this.dist = new Float32Array(n);
    this.queue = new Int32Array(n);
    this.blocked = new Uint8Array(n);
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        const v = room.at(x, y);
        this.blocked[y * room.w + x] = v === 1 || v === 2 ? 0 : 1;
      }
    }
    // big props block their cells
    for (const p of room.props) {
      if (!p.r || p.r < 0.45 || p.kind === 'wall' || p.kind === 'decor') continue;
      const x0 = Math.floor(p.x - p.r * 0.7);
      const x1 = Math.floor(p.x + p.r * 0.7);
      const y0 = Math.floor(p.y - p.r * 0.7);
      const y1 = Math.floor(p.y + p.r * 0.7);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < room.w && y < room.h) this.blocked[y * room.w + x] = 1;
    }
    this.cx = this.cy = -1;
  }

  update(tx, ty) {
    const r = this.room;
    if (!r) return;
    const cx = Math.floor(tx);
    const cy = Math.floor(ty);
    if (cx === this.cx && cy === this.cy) return;
    this.cx = cx;
    this.cy = cy;
    const W = r.w;
    const H = r.h;
    const d = this.dist;
    d.fill(1e9);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
    const q = this.queue;
    let head = 0;
    let tail = 0;
    d[cy * W + cx] = 0;
    q[tail++] = cy * W + cx;
    while (head < tail) {
      const k = q[head++];
      const x = k % W;
      const y = (k / W) | 0;
      const base = d[k];
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          if (!i && !j) continue;
          const nx = x + i;
          const ny = y + j;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (this.blocked[nk]) continue;
          // no corner cutting
          if (i && j && (this.blocked[y * W + nx] || this.blocked[ny * W + x])) continue;
          const nd = base + (i && j ? 1.414 : 1);
          if (nd < d[nk]) {
            d[nk] = nd;
            q[tail++] = nk;
          }
        }
      }
    }
  }

  // direction from (x, y) toward the target: straight if the line is clear, else down the field
  dir(x, y, tx, ty, out) {
    const r = this.room;
    const dx = tx - x;
    const dy = ty - y;
    const l = Math.hypot(dx, dy) || 1;
    if (l < 1.5 || this.clear(x, y, tx, ty)) {
      out.x = dx / l;
      out.y = dy / l;
      return out;
    }
    const W = r.w;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let best = 1e9;
    let bx = 0;
    let by = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const nx = cx + i;
        const ny = cy + j;
        if (nx < 0 || ny < 0 || nx >= W || ny >= r.h) continue;
        if (i && j && (this.blocked[cy * W + nx] || this.blocked[ny * W + cx])) continue;
        const v = this.dist[ny * W + nx];
        if (v < best) {
          best = v;
          bx = nx + 0.5 - x;
          by = ny + 0.5 - y;
        }
      }
    }
    if (best >= 1e9) {
      out.x = dx / l;
      out.y = dy / l;
      return out;
    }
    const bl = Math.hypot(bx, by) || 1;
    out.x = bx / bl;
    out.y = by / bl;
    return out;
  }

  // is the straight path clear of blocked cells? (sampled every half metre)
  clear(x0, y0, x1, y1) {
    const r = this.room;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const n = Math.ceil(Math.hypot(dx, dy) / 0.45);
    for (let i = 1; i < n; i++) {
      const x = Math.floor(x0 + (dx * i) / n);
      const y = Math.floor(y0 + (dy * i) / n);
      if (x < 0 || y < 0 || x >= r.w || y >= r.h || this.blocked[y * r.w + x]) return false;
    }
    return true;
  }
}
