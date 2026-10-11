// The instant replay. While a run plays, every other physics step writes the
// pose of everything drawn (x, y, angle, shown) into one preallocated ring of
// frames, about ten seconds deep, plus the run's few changing looks (the
// stuntman's face, the car's crumple). The effects that went off (blood,
// sparks, glass, blasts) are logged with their time. Playing back copies two
// neighbouring frames into the items' last/current poses, so the renderer
// draws a replay exactly as it draws the live run, interpolation included.
const FRAMES = 640; // at 60 per second
const STRIDE = 4; // x, y, angle, shown
const MAX_FX = 768;

export class Replay {
  constructor() {
    this.cap = 0;
    this.data = null;
    this.times = new Float32Array(FRAMES);
    this.look = new Float32Array(FRAMES * 2); // face code, crush
    this.n = 0; // frames written (ever)
    this.items = null;
    this.fx = [];
    for (let i = 0; i < MAX_FX; i++) this.fx.push({ t: 0, type: '', x: 0, y: 0, nx: 0, ny: 0, s: 0, mat: '', ref: null });
    this.fxN = 0;
  }

  begin(items) {
    this.items = items;
    const need = items.length * STRIDE * FRAMES;
    if (need > this.cap) {
      this.cap = Math.ceil(need * 1.25);
      this.data = new Float32Array(this.cap);
    }
    this.n = 0;
    this.fxN = 0;
  }

  // Items added after begin() (none normally) are simply not replayed.
  record(t, face, crush) {
    const items = this.items;
    const f = this.n % FRAMES;
    const base = f * items.length * STRIDE;
    const D = this.data;
    const m = Math.min(items.length, this.cap / (STRIDE * FRAMES));
    for (let i = 0; i < m; i++) {
      const it = items[i];
      const k = base + i * STRIDE;
      D[k] = it.x;
      D[k + 1] = it.y;
      D[k + 2] = it.a;
      D[k + 3] = it.vis ? 1 : 0;
    }
    this.times[f] = t;
    this.look[f * 2] = face;
    this.look[f * 2 + 1] = crush;
    this.n++;
  }

  log(t, type, x, y, nx, ny, s, mat, ref) {
    if (this.fxN >= MAX_FX) return;
    const e = this.fx[this.fxN++];
    e.t = t;
    e.type = type;
    e.x = x;
    e.y = y;
    e.nx = nx;
    e.ny = ny;
    e.s = s;
    e.mat = mat;
    e.ref = ref;
  }

  get first() {
    return this.n > FRAMES ? this.times[this.n % FRAMES] : this.times[0];
  }

  get last() {
    return this.n ? this.times[(this.n - 1) % FRAMES] : 0;
  }

  // The frame index at or before time t (searching the ring backwards).
  frameAt(t) {
    const lo = Math.max(0, this.n - FRAMES);
    for (let i = this.n - 1; i > lo; i--) if (this.times[i % FRAMES] <= t) return i;
    return lo;
  }

  // Poses the items at time t: last pose = the frame before, current = the
  // frame after; returns the blend between them and fills out.look.
  apply(t, out) {
    const items = this.items;
    const i0 = this.frameAt(t);
    const i1 = Math.min(this.n - 1, i0 + 1);
    const f0 = i0 % FRAMES;
    const f1 = i1 % FRAMES;
    const t0 = this.times[f0];
    const t1 = this.times[f1];
    const D = this.data;
    const m = Math.min(items.length, this.cap / (STRIDE * FRAMES));
    const b0 = f0 * items.length * STRIDE;
    const b1 = f1 * items.length * STRIDE;
    for (let i = 0; i < m; i++) {
      const it = items[i];
      const k0 = b0 + i * STRIDE;
      const k1 = b1 + i * STRIDE;
      it.px = D[k0];
      it.py = D[k0 + 1];
      it.pa = D[k0 + 2];
      it.pvis = D[k0 + 3] > 0.5;
      it.x = D[k1];
      it.y = D[k1 + 1];
      it.a = D[k1 + 2];
      it.vis = D[k1 + 3] > 0.5;
    }
    out.face = this.look[f1 * 2];
    out.crush = this.look[f1 * 2 + 1];
    return t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
  }
}
