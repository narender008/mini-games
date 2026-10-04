// Every particle lives in flat typed arrays (no objects, no garbage). Kinds:
// smoke and dust, clods of earth, blood droplets (lit, alpha-blended), fire,
// sparks, flashes and embers (hot, added), shock rings and heat shimmer
// (distortion only).
import { InstanceList, PARTICLE_STRIDE } from '../gl/renderer.js';

export const K = {
  SMOKE: 0,
  DIRT: 1,
  BLOOD: 2,
  FIRE: 3,
  SPARK: 4,
  FLASH: 5,
  EMBER: 6,
  SHOCK: 7,
  HEAT: 8,
};

const HOT_KIND = [0, 0, 0, 3, 4, 5, 6, 0, 1];

export class Particles {
  constructor(cap) {
    this.cap = cap;
    this.n = 0;
    const F = () => new Float32Array(cap);
    this.x = F();
    this.y = F();
    this.vx = F();
    this.vy = F();
    this.size = F();
    this.grow = F(); // size change, metres per second, easing off with age
    this.rot = F();
    this.spin = F();
    this.age = F();
    this.life = F();
    this.r = F();
    this.g = F();
    this.b = F();
    this.a = F();
    this.drag = F();
    this.grav = F(); // multiple of gravity (negative rises)
    this.wind = F(); // how much the wind carries it
    this.seed = F();
    this.kind = new Uint8Array(cap);
    this.back = new Uint8Array(cap); // drawn behind the ground (distant smoke)
    this.hit = new Uint8Array(cap); // stops (and maybe stains) on the ground
    this.lists = {
      litBack: new InstanceList(PARTICLE_STRIDE, 1024),
      lit: new InstanceList(PARTICLE_STRIDE, 2048),
      hot: new InstanceList(PARTICLE_STRIDE, 2048),
      distort: new InstanceList(PARTICLE_STRIDE, 256),
    };
    this.onLand = null; // (kind, x, y, size) callback, for blood stains
  }

  // Adds one particle and returns its slot (or -1 when full: the oldest
  // smoke is cheaper to lose than a new blast).
  spawn(kind, x, y, vx, vy, size, life, r, g, b, a) {
    let i = this.n;
    if (i >= this.cap) {
      i = (Math.random() * this.cap) | 0;
      if (this.kind[i] === K.FLASH) return -1;
    } else this.n++;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.size[i] = size;
    this.grow[i] = 0;
    this.rot[i] = Math.random() * 6.283;
    this.spin[i] = 0;
    this.age[i] = 0;
    this.life[i] = life;
    this.r[i] = r;
    this.g[i] = g;
    this.b[i] = b;
    this.a[i] = a;
    this.drag[i] = 0;
    this.grav[i] = 0;
    this.wind[i] = 0;
    this.seed[i] = Math.random();
    this.back[i] = 0;
    this.hit[i] = 0;
    return i;
  }

  clear() {
    this.n = 0;
  }

  update(dt, gravity, wind, terrain) {
    const n = this.n;
    let w = 0;
    for (let i = 0; i < n; i++) {
      let age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      const k = this.kind[i];
      let vx = this.vx[i];
      let vy = this.vy[i];
      const d = this.drag[i];
      if (d > 0) {
        const f = Math.exp(-d * dt);
        vx *= f;
        vy *= f;
      }
      vy -= gravity * this.grav[i] * dt;
      vx += wind * this.wind[i] * dt;
      let x = this.x[i] + vx * dt;
      let y = this.y[i] + vy * dt;
      if (this.hit[i] && vy < 0 && terrain.solid(x, y)) {
        if (this.onLand) this.onLand(k, x, y, this.size[i], i);
        if (k === K.DIRT && Math.abs(vy) > 6 && Math.random() < 0.5) {
          // a clod bounces once and breaks up
          vy = -vy * 0.25;
          vx *= 0.5;
          y = this.y[i];
          this.size[i] *= 0.7;
        } else continue;
      }
      // compact the arrays as we go
      if (w !== i) this.copy(i, w);
      this.age[w] = age;
      this.x[w] = x;
      this.y[w] = y;
      this.vx[w] = vx;
      this.vy[w] = vy;
      const g = this.grow[w];
      if (g !== 0) this.size[w] += g * dt * (1.6 - age / this.life[w]);
      this.rot[w] += this.spin[w] * dt;
      w++;
    }
    this.n = w;
  }

  copy(i, w) {
    this.kind[w] = this.kind[i];
    this.size[w] = this.size[i];
    this.grow[w] = this.grow[i];
    this.rot[w] = this.rot[i];
    this.spin[w] = this.spin[i];
    this.life[w] = this.life[i];
    this.r[w] = this.r[i];
    this.g[w] = this.g[i];
    this.b[w] = this.b[i];
    this.a[w] = this.a[i];
    this.drag[w] = this.drag[i];
    this.grav[w] = this.grav[i];
    this.wind[w] = this.wind[i];
    this.seed[w] = this.seed[i];
    this.back[w] = this.back[i];
    this.hit[w] = this.hit[i];
  }

  // Writes this frame's instances. Opacity follows each kind's life curve.
  build() {
    const L = this.lists;
    L.litBack.clear();
    L.lit.clear();
    L.hot.clear();
    L.distort.clear();
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i];
      const t = this.age[i] / this.life[i];
      let a = this.a[i];
      let list;
      let kind = 0;
      let stretch = 0;
      let rot = this.rot[i];
      if (k === K.SMOKE) {
        a *= Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
        list = this.back[i] ? L.litBack : L.lit;
      } else if (k === K.DIRT) {
        list = L.lit;
        kind = 1;
        a *= t > 0.85 ? (1 - t) / 0.15 : 1;
      } else if (k === K.BLOOD) {
        list = L.lit;
        kind = 2;
        const sp = Math.hypot(this.vx[i], this.vy[i]);
        stretch = Math.min(2.5, sp * 0.06);
        rot = Math.atan2(this.vy[i], this.vx[i]);
      } else if (k === K.SPARK) {
        list = L.hot;
        kind = 4;
        const sp = Math.hypot(this.vx[i], this.vy[i]);
        stretch = Math.min(8, sp * 0.12);
        rot = Math.atan2(this.vy[i], this.vx[i]);
        a *= 1 - t;
      } else if (k === K.FIRE) {
        list = L.hot;
        kind = 3;
        a *= Math.min(1, t * 12) * (1 - t * t);
      } else if (k === K.FLASH) {
        list = L.hot;
        kind = 5;
        a *= (1 - t) * (1 - t);
      } else if (k === K.EMBER) {
        list = L.hot;
        kind = 6;
        a *= Math.min(1, t * 6) * (1 - t);
      } else if (k === K.SHOCK) {
        list = L.distort;
        kind = 0;
        stretch = 0;
        a *= 1 - t;
      } else {
        list = L.distort;
        kind = 1;
        a *= Math.sin(t * Math.PI);
      }
      if (a <= 0.002) continue;
      const o = list.alloc();
      const D = list.data;
      D[o] = this.x[i];
      D[o + 1] = this.y[i];
      D[o + 2] = this.size[i];
      D[o + 3] = rot;
      D[o + 4] = this.r[i];
      D[o + 5] = this.g[i];
      D[o + 6] = this.b[i];
      D[o + 7] = a;
      D[o + 8] = kind;
      D[o + 9] = t;
      D[o + 10] = this.seed[i];
      D[o + 11] = stretch;
    }
    return L;
  }
}

export { HOT_KIND };
