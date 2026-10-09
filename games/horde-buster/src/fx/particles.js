// Particles in one pool of typed arrays: blood droplets that fall and paint
// the road where they land, blood mist, smoke, fire, sparks, flashes, shock
// rings, beams, ice shards. Plus short-lived point lights and the queue of
// splats painted into the ground layer this frame.
import { InstanceList, PARTICLE_STRIDE, SPRITE_STRIDE } from '../gl/renderer.js';
import { rnd, rand, TAU } from '../config.js';

// kinds (match the PARTICLE shader)
export const DROP = 0;
export const MIST = 1;
export const SMOKE = 2;
export const FIRE = 3;
export const SPARK = 4;
export const GLOW = 5;
export const RING = 6;
export const BOLT = 7;
export const ORB = 8;
export const BEAM = 9;
export const HERO_RING = 10;
export const BUBBLE = 11;
export const RETICLE = 12;
export const CHIP = 13;
export const PICK = 14;
export const SHARD = 15;

// draw layers
export const UNDER = 0;
export const ALPHA = 1;
export const HOT = 2;

// flags
const GRAV = 1; // falls (z)
const PAINT = 2; // paints a splat where it lands
const SPIN = 4;
const FACE = 8; // rotation follows velocity
const GROW = 16; // size eases from size0 to size1

const G = 1500; // gravity for droplets and chips, u/s^2 (cartoon: fast and snappy)

export class Particles {
  constructor(cap) {
    this.cap = cap;
    const F = () => new Float32Array(cap);
    this.x = F();
    this.y = F();
    this.z = F();
    this.px = F();
    this.py = F();
    this.pz = F();
    this.vx = F();
    this.vy = F();
    this.vz = F();
    this.life = F();
    this.max = F();
    this.s0 = F();
    this.s1 = F();
    this.rot = F();
    this.vrot = F();
    this.r = F();
    this.g = F();
    this.b = F();
    this.a = F();
    this.drag = F();
    this.seed = F();
    this.str = F();
    this.kind = new Uint8Array(cap);
    this.layer = new Uint8Array(cap);
    this.flags = new Uint8Array(cap);
    this.n = 0;
    this.splats = new InstanceList(PARTICLE_STRIDE, 512);
    this.stamps = new InstanceList(SPRITE_STRIDE, 128);
    // lights: x, y, z, radius, r, g, b, life, max
    this.L = new Float32Array(64 * 9);
    this.nL = 0;
    this.goreScale = 1;
    this.arrays = [this.x, this.y, this.z, this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.max, this.s0, this.s1, this.rot, this.vrot, this.r, this.g, this.b, this.a, this.drag, this.seed, this.str, this.kind, this.layer, this.flags];
  }

  reset() {
    this.n = 0;
    this.nL = 0;
    this.splats.clear();
    this.stamps.clear();
  }

  // the slot for a new particle; when full the oldest are overwritten in turn
  slot() {
    if (this.n < this.cap) return this.n++;
    this.over = ((this.over || 0) + 1) % this.cap;
    return this.over;
  }

  add(kind, layer, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, flags = 0, drag = 0, stretch = 0) {
    const i = this.slot();
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.z[i] = this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = 0;
    this.max[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.rot[i] = rnd() * TAU;
    this.vrot[i] = flags & SPIN ? rand(-8, 8) : 0;
    this.r[i] = r;
    this.g[i] = g;
    this.b[i] = b;
    this.a[i] = a;
    this.drag[i] = drag;
    this.seed[i] = rnd();
    this.str[i] = stretch;
    this.kind[i] = kind;
    this.layer[i] = layer;
    this.flags[i] = flags | (s0 !== s1 ? GROW : 0);
    return i;
  }

  light(x, y, z, radius, r, g, b, life) {
    if (this.nL >= 64) return;
    const k = this.nL++ * 9;
    const L = this.L;
    L[k] = x;
    L[k + 1] = y;
    L[k + 2] = z;
    L[k + 3] = radius;
    L[k + 4] = r;
    L[k + 5] = g;
    L[k + 6] = b;
    L[k + 7] = 0;
    L[k + 8] = life;
  }

  splat(x, y, size, r, g, b, a, kind = 0, stretch = 0, rot = rnd() * TAU) {
    this.splats.p(x, y, size, rot, r, g, b, a, kind, rnd() * 7, stretch, 0);
  }

  update(dt) {
    const { x, y, z, vx, vy, vz, life, max, flags } = this;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.px[i] = x[i];
      this.py[i] = y[i];
      this.pz[i] = z[i];
      life[i] += dt;
      const f = flags[i];
      let dead = life[i] >= max[i];
      if (!dead) {
        if (this.drag[i]) {
          const k = Math.exp(-this.drag[i] * dt);
          vx[i] *= k;
          vy[i] *= k;
          if (!(f & GRAV)) vz[i] *= k;
        }
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
        z[i] += vz[i] * dt;
        if (f & GRAV) {
          vz[i] -= G * dt;
          if (z[i] <= 0) {
            z[i] = 0;
            if (f & PAINT) {
              // a droplet lands: a splat, stretched a little along its travel
              const sp = Math.hypot(vx[i], vy[i]);
              this.splat(x[i], y[i], this.s0[i] * (1.3 + rnd() * 1.4), this.r[i] * 0.75, this.g[i] * 0.75, this.b[i] * 0.75, 0.8, sp > 260 ? 4 : 1, sp > 260 ? Math.min(2.5, sp / 300) : 0, Math.atan2(vy[i], vx[i]));
              dead = true;
            } else {
              vz[i] = -vz[i] * 0.3;
              vx[i] *= 0.5;
              vy[i] *= 0.5;
              if (Math.abs(vz[i]) < 40) {
                vz[i] = 0;
                flags[i] &= ~GRAV;
                this.drag[i] = 6;
              }
            }
          }
        }
        this.rot[i] += this.vrot[i] * dt;
      }
      if (dead) {
        // swap-remove: copy the last particle into this slot
        n--;
        if (i !== n) this.move(n, i);
        i--;
      }
    }
    this.n = n;
    if (this.over >= n) this.over = 0;
    // lights fade
    const L = this.L;
    let m = this.nL;
    for (let k = 0; k < m; k++) {
      const o = k * 9;
      L[o + 7] += dt;
      if (L[o + 7] >= L[o + 8]) {
        m--;
        if (k !== m) for (let q = 0; q < 9; q++) L[o + q] = L[m * 9 + q];
        k--;
      }
    }
    this.nL = m;
  }

  move(from, to) {
    const A = this.arrays;
    for (let k = 0; k < A.length; k++) A[k][to] = A[k][from];
  }

  // Writes every particle into its layer's instance list, interpolated by alpha.
  draw(lists, alpha, lights) {
    const { x, y, z, px, py, pz, life, max } = this;
    for (let i = 0; i < this.n; i++) {
      const t = life[i] / max[i];
      const f = this.flags[i];
      const size = f & GROW ? this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - t) * (1 - t)) : this.s0[i];
      const k = this.kind[i];
      // fade: fire and glows by the shader/age, others fade out over the last third
      let a = this.a[i];
      if (k !== FIRE) a *= t > 0.66 ? (1 - t) * 3 : 1;
      const ix = px[i] + (x[i] - px[i]) * alpha;
      const iy = py[i] + (y[i] - py[i]) * alpha;
      const iz = pz[i] + (z[i] - pz[i]) * alpha;
      const rot = f & FACE ? Math.atan2(this.vy[i] - this.vz[i] * 0.7, this.vx[i]) : this.rot[i];
      lists[this.layer[i]].p(ix, iy - iz, size, rot, this.r[i], this.g[i], this.b[i], a, k, t, this.seed[i], this.str[i]);
    }
    const L = this.L;
    for (let k = 0; k < this.nL; k++) {
      const o = k * 9;
      const t = L[o + 7] / L[o + 8];
      const fade = (1 - t) * (1 - t);
      lights.add(L[o], L[o + 1], L[o + 2], L[o + 3] * (0.7 + 0.3 * fade), L[o + 4] * fade, L[o + 5] * fade, L[o + 6] * fade);
    }
  }

  // ---------------------------------------------------------------- emitters

  // a fan of blood droplets from (x, y, z) heading (dx, dy), painting where they land
  blood(x, y, z, dx, dy, n, speed, col, spread = 1.2, up = 1) {
    n = Math.round(n * this.goreScale);
    const base = Math.atan2(dy, dx);
    for (let k = 0; k < n; k++) {
      const a = base + (rnd() - 0.5) * spread * 2;
      const s = speed * (0.3 + rnd() * 0.9);
      const sz = 1.6 + rnd() * 3.2;
      const shade = 0.75 + rnd() * 0.5;
      this.add(DROP, ALPHA, x + rand(-4, 4), y + rand(-3, 3), z, Math.cos(a) * s, Math.sin(a) * s * 0.75, (120 + rnd() * 380) * up, 3, sz, sz, col[0] * shade, col[1] * shade, col[2] * shade, 1, GRAV | PAINT, 0.6);
    }
  }

  mist(x, y, z, col, size, n = 3) {
    for (let k = 0; k < n; k++) {
      const s = size * (0.6 + rnd() * 0.6);
      this.add(MIST, ALPHA, x + rand(-size, size) * 0.4, y + rand(-size, size) * 0.3, z + rand(-6, 6), rand(-30, 30), rand(-30, 30), rand(10, 60), rand(0.35, 0.6), s * 0.5, s * 1.4, col[0] * 1.3, col[1] * 1.3, col[2] * 1.3, 0.7, 0, 3);
    }
  }

  sparks(x, y, z, n, r, g, b, speed = 500, dx = 0, dy = -1, spread = 3.2) {
    const base = Math.atan2(dy, dx);
    for (let k = 0; k < n; k++) {
      const a = base + (rnd() - 0.5) * spread;
      const s = speed * (0.4 + rnd() * 0.8);
      this.add(SPARK, HOT, x, y, z, Math.cos(a) * s, Math.sin(a) * s, rand(0, 200), rand(0.12, 0.3), rand(3, 6), 1, r, g, b, 1, FACE, 4, 2.5);
    }
  }

  flash(x, y, z, size, r, g, b, life = 0.12) {
    this.add(GLOW, HOT, x, y, z, 0, 0, 0, life, size, size * 1.2, r, g, b, 1);
  }

  ring(x, y, r0, r1, r, g, b, life = 0.35, layer = HOT) {
    this.add(RING, layer, x, y, 0, 0, 0, 0, life, r0, r1, r, g, b, 1);
  }

  // a fireball: billowing fire, smoke, sparks, a flash, a shock ring, a light and a scorch mark
  explosion(x, y, radius, big = 1) {
    const n = Math.round(6 + radius / 14);
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU;
      const d = rnd() * radius * 0.45;
      const s = rand(40, 160) * big;
      this.add(FIRE, HOT, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, rand(5, 30), Math.cos(a) * s, Math.sin(a) * s * 0.6, rand(30, 120), rand(0.35, 0.7), radius * rand(0.25, 0.4), radius * rand(0.5, 0.8), 1, 1, 1, 1, 0, 3);
    }
    for (let k = 0; k < n * 0.7; k++) {
      const a = rnd() * TAU;
      this.add(SMOKE, ALPHA, x + Math.cos(a) * radius * 0.3, y + Math.sin(a) * radius * 0.2, rand(10, 40), Math.cos(a) * 60, Math.sin(a) * 40, rand(40, 90), rand(0.9, 1.6), radius * 0.3, radius * 0.9, 0.16, 0.14, 0.13, 0.75, 0, 1.5);
    }
    this.sparks(x, y, 20, Math.round(10 + radius / 6), 3, 1.6, 0.5, 700 * big, 0, -1, TAU);
    for (let k = 0; k < 6; k++) {
      const a = rnd() * TAU;
      const s = rand(150, 420);
      this.add(CHIP, ALPHA, x, y, 10, Math.cos(a) * s, Math.sin(a) * s, rand(200, 500), 1.5, rand(2, 4), 1, 0.12, 0.11, 0.1, 1, GRAV | SPIN, 0.5);
    }
    this.flash(x, y, 30, radius * 1.6, 4, 2.4, 1, 0.16);
    this.ring(x, y, radius * 0.2, radius * 1.25, 2.2, 1.6, 1, 0.3);
    this.light(x, y, 90, radius * 4.5, 5 * big, 2.6 * big, 0.9 * big, 0.45);
    this.splat(x, y, radius * 0.75, 0.05, 0.045, 0.04, 0.55, 2);
  }

  // a frozen creature shatters: shards, cold mist, frost on the road
  ice(x, y, z, size) {
    for (let k = 0; k < 10; k++) {
      const a = rnd() * TAU;
      const s = rand(120, 380);
      this.add(SHARD, ALPHA, x, y, z, Math.cos(a) * s, Math.sin(a) * s * 0.7, rand(150, 450), rand(0.5, 1.1), rand(3, 7), 1, 0.75, 0.92, 1.1, 1, GRAV | SPIN, 0.4);
    }
    this.mist(x, y, z, [0.5, 0.7, 0.9], size * 1.2, 2);
    this.flash(x, y, z, size * 2, 0.6, 1.1, 2, 0.15);
    this.splat(x, y, size * 1.4, 0.55, 0.75, 0.9, 0.55, 3);
  }

  beam(x0, y0, x1, y1, width, r, g, b, life, jitter = 0) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    // size = half width, stretch makes the quad as long as the beam
    const i = this.add(BEAM, HOT, (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, 0, life, width, width, r, g, b, 1, 0, 0, len / (2 * width) - 1);
    this.rot[i] = Math.atan2(dy, dx);
    this.seed[i] = jitter ? 0.5 + rnd() * 0.5 : 0;
  }

  smoke(x, y, z, size, n = 1, dark = 0.2) {
    for (let k = 0; k < n; k++)
      this.add(SMOKE, ALPHA, x + rand(-6, 6), y + rand(-4, 4), z, rand(-20, 20), rand(-30, -5), rand(20, 50), rand(0.8, 1.5), size * 0.5, size * 1.5, dark, dark * 0.95, dark * 0.9, 0.55, 0, 1);
  }
}
