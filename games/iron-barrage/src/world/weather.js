// Weather that drifts across the view: falling ash and rising embers, rain,
// snow or blowing sand. A fixed set of particles wraps around the camera, so
// the cost never grows. Drawn in front of everything, lit by the sky. Each
// kind is a few populations (near and far snow, sand grains and dust veils)
// so the depth reads. Shapes are those of the WEATHER shader: 0 rain streak,
// 1 snow flake, 2 ash flake, 3 ember, 4 dust veil, 5 sand grain.
import { InstanceList, PARTICLE_STRIDE } from '../gl/renderer.js';

// n: count at full quality; size and fall are [min, max] (fall in m/s, negative rises);
// wind: how strongly the wind carries it; soft: 0 crisp .. 1 blurred (snow near the lens)
const KINDS = {
  none: null,
  ash: [
    { n: 190, shape: 2, size: [0.04, 0.11], fall: [0.5, 1.5], wind: 1.6, col: [0.3, 0.28, 0.27], a: 0.8, sway: 0.9 },
    { n: 16, shape: 3, size: [0.035, 0.065], fall: [-1.4, -0.5], wind: 2.2, col: [3.2, 1.05, 0.25], a: 0.9, sway: 0.7 },
  ],
  rain: [
    { n: 330, shape: 0, size: [0.012, 0.018], fall: [20, 26], wind: 2.2, col: [0.4, 0.43, 0.48], a: 0.3, streak: 16 },
    { n: 260, shape: 0, size: [0.022, 0.034], fall: [27, 34], wind: 2.8, col: [0.5, 0.53, 0.58], a: 0.5, streak: 22 },
  ],
  snow: [
    { n: 300, shape: 1, size: [0.035, 0.07], fall: [0.9, 1.6], wind: 1.8, col: [0.95, 0.96, 1.0], a: 0.85, sway: 0.8, soft: 0.1 },
    { n: 150, shape: 1, size: [0.08, 0.14], fall: [1.6, 2.4], wind: 2.4, col: [0.95, 0.96, 1.0], a: 0.85, sway: 1.2, soft: 0.35 },
    { n: 28, shape: 1, size: [0.22, 0.36], fall: [2.6, 3.6], wind: 3.0, col: [0.95, 0.96, 1.0], a: 0.5, sway: 1.6, soft: 0.95 },
  ],
  dust: [
    { n: 26, shape: 4, size: [3.5, 8], fall: [-0.1, 0.2], wind: 3.2, col: [0.6, 0.45, 0.31], a: 0.09, sway: 0.3 },
    { n: 150, shape: 5, size: [0.03, 0.05], fall: [0.1, 0.5], wind: 9, col: [0.42, 0.3, 0.19], a: 0.3, streak: 8, sway: 0.2 },
  ],
};

export class Weather {
  constructor(quality) {
    this.q = quality;
    this.list = new InstanceList(PARTICLE_STRIDE, 800);
    this.set('none');
  }

  set(kind) {
    this.pops = KINDS[kind] || null;
    this.n = 0;
    if (!this.pops) return;
    const scale = 0.4 + 0.6 * this.q.particleScale;
    let n = 0;
    for (const p of this.pops) n += Math.round(p.n * scale);
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.s = new Float32Array(n);
    this.v = new Float32Array(n);
    this.ph = new Float32Array(n);
    this.pi = new Uint8Array(n);
    this.d = new Float32Array(n);
    let i = 0;
    this.pops.forEach((K, k) => {
      const c = Math.round(K.n * scale);
      for (let j = 0; j < c; j++, i++) {
        const d = Math.random();
        this.x[i] = Math.random();
        this.y[i] = Math.random();
        this.d[i] = d;
        this.s[i] = K.size[0] + d * (K.size[1] - K.size[0]);
        this.v[i] = K.fall[0] + (0.6 * d + 0.4 * Math.random()) * (K.fall[1] - K.fall[0]);
        this.ph[i] = Math.random() * 6.28;
        this.pi[i] = k;
      }
    });
    this.t = 0;
  }

  // Positions live in view-relative units (0..1 of a box a bit larger than
  // the view), moved in metres per second scaled to the box.
  update(dt, cam, aspect, wind) {
    const L = this.list;
    L.clear();
    if (!this.pops) return L;
    this.t += dt;
    const bw = cam.viewW * 1.2;
    const bh = bw / aspect + 6;
    const x0 = cam.x - bw / 2;
    const y0 = cam.y - bh / 2;
    const D = L.data;
    for (let i = 0; i < this.n; i++) {
      const K = this.pops[this.pi[i]];
      const wx = wind * K.wind * (0.6 + 0.8 * this.d[i]);
      let x = this.x[i] + (((K.sway ? Math.sin(this.t * 1.3 + this.ph[i]) * K.sway : 0) + wx) * dt) / bw;
      let y = this.y[i] - (this.v[i] * dt) / bh;
      x -= Math.floor(x);
      y -= Math.floor(y);
      this.x[i] = x;
      this.y[i] = y;
      const o = L.alloc();
      D[o] = x0 + x * bw;
      D[o + 1] = y0 + y * bh;
      D[o + 2] = this.s[i];
      D[o + 3] = K.streak ? Math.atan2(-this.v[i], wx) : K.shape === 2 || K.shape === 4 ? this.ph[i] + this.t * 0.8 : this.ph[i];
      D[o + 4] = K.col[0];
      D[o + 5] = K.col[1];
      D[o + 6] = K.col[2];
      D[o + 7] = K.a;
      D[o + 8] = K.shape;
      D[o + 9] = K.soft ? K.soft * (0.5 + 0.5 * this.d[i]) : 0;
      D[o + 10] = this.ph[i];
      D[o + 11] = K.streak || 0;
    }
    return L;
  }
}
