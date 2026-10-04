// Weather that drifts across the view: falling ash, rain, snow or blowing
// dust. A fixed set of particles wraps around the camera, so the cost never
// grows. Drawn in front of everything, lit by the sky.
import { InstanceList, PARTICLE_STRIDE } from '../gl/renderer.js';

const KINDS = {
  none: null,
  ash: { n: 220, size: [0.05, 0.12], fall: [0.6, 1.6], wind: 1.6, col: [0.32, 0.3, 0.29], a: 0.75, streak: false, sway: 0.8 },
  rain: { n: 520, size: [0.018, 0.03], fall: [22, 30], wind: 2.5, col: [0.42, 0.45, 0.5], a: 0.45, streak: true, sway: 0 },
  snow: { n: 420, size: [0.05, 0.13], fall: [1.2, 2.6], wind: 2.2, col: [0.95, 0.96, 1.0], a: 0.9, streak: false, sway: 1.2 },
  dust: { n: 160, size: [0.25, 0.7], fall: [-0.2, 0.3], wind: 4, col: [0.62, 0.48, 0.33], a: 0.16, streak: false, sway: 0.4 },
};

export class Weather {
  constructor(quality) {
    this.q = quality;
    this.list = new InstanceList(PARTICLE_STRIDE, 600);
    this.set('none');
  }

  set(kind) {
    this.kind = KINDS[kind] || null;
    if (!this.kind) return;
    const n = Math.round(this.kind.n * (0.4 + 0.6 * this.q.particleScale));
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.s = new Float32Array(n);
    this.v = new Float32Array(n);
    this.ph = new Float32Array(n);
    const K = this.kind;
    for (let i = 0; i < n; i++) {
      this.x[i] = Math.random();
      this.y[i] = Math.random();
      this.s[i] = K.size[0] + Math.random() * (K.size[1] - K.size[0]);
      this.v[i] = K.fall[0] + Math.random() * (K.fall[1] - K.fall[0]);
      this.ph[i] = Math.random() * 6.28;
    }
    this.t = 0;
  }

  // Positions live in view-relative units (0..1 of a box a bit larger than
  // the view), moved in metres per second scaled to the box.
  update(dt, cam, aspect, wind) {
    const L = this.list;
    L.clear();
    const K = this.kind;
    if (!K) return L;
    this.t += dt;
    const bw = cam.viewW * 1.2;
    const bh = bw / aspect + 6;
    const x0 = cam.x - bw / 2;
    const y0 = cam.y - bh / 2;
    const wx = wind * K.wind;
    const D = L.data;
    for (let i = 0; i < this.n; i++) {
      let x = this.x[i] + ((wx + Math.sin(this.t * 1.3 + this.ph[i]) * K.sway) * dt) / bw;
      let y = this.y[i] - (this.v[i] * dt) / bh;
      x -= Math.floor(x);
      y -= Math.floor(y);
      this.x[i] = x;
      this.y[i] = y;
      const o = L.alloc();
      D[o] = x0 + x * bw;
      D[o + 1] = y0 + y * bh;
      const sz = this.s[i];
      D[o + 2] = K.streak ? sz * 1.0 : sz;
      D[o + 3] = K.streak ? Math.atan2(-this.v[i], wx) : this.ph[i];
      D[o + 4] = K.col[0];
      D[o + 5] = K.col[1];
      D[o + 6] = K.col[2];
      D[o + 7] = K.a;
      D[o + 8] = K.streak ? 0 : 1;
      D[o + 9] = 0;
      D[o + 10] = 0;
      D[o + 11] = K.streak ? 18 : 0;
    }
    return L;
  }
}
