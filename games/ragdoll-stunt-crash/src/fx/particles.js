// Particles: blood drops, sparks, glass shards, smoke, fire, dust, debris,
// teeth and splashes, in flat typed arrays (a fixed pool, the oldest reused
// when it is full), moved in world metres. Blood drops that reach the ground
// or a prop leave a splat painted there for good (decals.js); shards and
// debris bounce once or twice and fade. Spawning and stepping allocate
// nothing.
import { clamp, rand, rnd } from '../config.js';

export const P = { BLOOD: 0, SPARK: 1, SHARD: 2, SMOKE: 3, FIRE: 4, DEBRIS: 5, DUST: 6, TOOTH: 7, SPLASH: 8, EMBER: 9, BONE: 10, STEAM: 11 };
const GRAV = [-14, -9, -11, 0.9, 1.6, -11, 0.3, -12, -10, 0.6, -12, 1.2]; // m/s² per type (smoke and fire rise)
const DRAG = [0.4, 1.2, 0.6, 1.6, 2.2, 0.5, 2.5, 0.4, 0.8, 1.5, 0.4, 1.8];
const ADD = [false, true, false, false, true, false, false, false, false, true, false, false];

export class Particles {
  constructor(n) {
    this.max = n;
    this.n = 0;
    this.next = 0;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.life = new Float32Array(n); // seconds left
    this.span = new Float32Array(n); // seconds it started with
    this.size = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.vr = new Float32Array(n);
    this.type = new Uint8Array(n);
    this.v = new Uint8Array(n); // sprite variant
    this.bounce = new Uint8Array(n);
    this.alive = new Uint8Array(n);
    this.paint = 1; // blood may paint splats (off during the replay)
    this.goreScale = 1;
    this.terrain = null;
    this.props = null; // props blood can land on
    this.onSplat = null; // (x, y, size, prop or null, nx, ny)
    this.water = null;
  }

  clear() {
    this.alive.fill(0);
    this.n = 0;
  }

  spawn(type, x, y, vx, vy, life, size, v = 0) {
    let i = this.next;
    // find a free slot from the cursor; if none, take the cursor's
    for (let k = 0; k < 8 && this.alive[i]; k++) i = (i + 1) % this.max;
    this.next = (i + 1) % this.max;
    if (!this.alive[i]) this.n++;
    this.alive[i] = 1;
    this.type[i] = type;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.span[i] = life;
    this.size[i] = size;
    this.rot[i] = rnd() * 6.283;
    this.vr[i] = rand(-12, 12);
    this.v[i] = v;
    this.bounce[i] = 0;
    return i;
  }

  // a fan of blood out of a surface (nx, ny), amount 0..1+
  blood(x, y, nx, ny, amount, speed = 6) {
    const n = Math.round(clamp(amount, 0, 2) * 26 * this.goreScale) + 2;
    for (let k = 0; k < n; k++) {
      const s = speed * rand(0.3, 1.25);
      const a = Math.atan2(ny, nx) + rand(-0.9, 0.9);
      this.spawn(P.BLOOD, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.8, 1.6), rand(0.035, 0.09) * (1 + amount * 0.4), k & 1);
    }
  }

  sparks(x, y, nx, ny, amount, hot = 0) {
    const n = Math.round(amount * 22) + 3;
    for (let k = 0; k < n; k++) {
      const s = rand(4, 15) * (0.6 + amount * 0.6);
      const a = Math.atan2(ny, nx) + rand(-1.2, 1.2);
      this.spawn(P.SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.18, 0.5), rand(0.6, 1.2), hot);
    }
  }

  glass(x, y, dir, n, spread = 1) {
    for (let k = 0; k < n; k++) {
      const s = rand(2, 9);
      const a = (dir >= 0 ? 0 : Math.PI) + rand(-0.9, 0.9) * spread + 0.3;
      this.spawn(P.SHARD, x + rand(-0.1, 0.1), y + rand(-0.6, 0.6), Math.cos(a) * s, Math.sin(a) * s + rand(0, 3), rand(1, 2.2), rand(0.6, 1.4), k & 7);
    }
  }

  smoke(x, y, n, size = 1, dark = 0) {
    for (let k = 0; k < n; k++) this.spawn(P.SMOKE, x + rand(-0.4, 0.4) * size, y + rand(-0.3, 0.3) * size, rand(-1, 1), rand(0.5, 2), rand(1.2, 2.6), rand(0.6, 1.3) * size, dark);
  }

  fire(x, y, n, size = 1) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, 6.283);
      const s = rand(1, 7) * size;
      this.spawn(P.FIRE, x, y, Math.cos(a) * s, Math.sin(a) * s * 0.7 + 1, rand(0.25, 0.7), rand(0.9, 2.2) * size, 0);
    }
  }

  dust(x, y, n, size = 1, v = 0) {
    for (let k = 0; k < n; k++) this.spawn(P.DUST, x + rand(-0.3, 0.3), y, rand(-2.5, 2.5), rand(0.3, 2), rand(0.5, 1.1), rand(0.4, 0.9) * size, v);
  }

  debris(x, y, n, mat, speed = 6) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, 3.1416);
      const s = rand(0.3, 1) * speed;
      this.spawn(P.DEBRIS, x + rand(-0.3, 0.3), y + rand(-0.3, 0.3), Math.cos(a) * s, Math.sin(a) * s, rand(1.4, 2.8), rand(0.7, 1.3), (mat * 4 + (k & 3)) & 255);
    }
  }

  update(dt) {
    const T = this.terrain;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      let life = this.life[i] - dt;
      const t = this.type[i];
      if (life <= 0) {
        this.alive[i] = 0;
        this.n--;
        continue;
      }
      const d = Math.exp(-DRAG[t] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + GRAV[t] * dt;
      const x = this.x[i] + this.vx[i] * dt;
      const y = this.y[i] + this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
      if (t === P.SMOKE || t === P.DUST || t === P.STEAM) this.size[i] += dt * 0.9;
      if (T && (t === P.BLOOD || t === P.SHARD || t === P.DEBRIS || t === P.TOOTH || t === P.BONE || t === P.SPLASH || t === P.SPARK)) {
        const g = T.at(x);
        if (y < g && this.y[i] >= g - 0.4) {
          if (t === P.BLOOD) {
            if (this.paint && this.onSplat) this.onSplat(x, g, this.size[i], null, 0, 1);
            this.alive[i] = 0;
            this.n--;
            continue;
          }
          if (t === P.SPLASH) {
            this.alive[i] = 0;
            this.n--;
            continue;
          }
          // bounce, losing most of the speed; settle after a couple
          this.vy[i] = Math.abs(this.vy[i]) * (t === P.SPARK ? 0.4 : 0.3);
          this.vx[i] *= 0.55;
          this.vr[i] *= 0.5;
          if (++this.bounce[i] > 2) {
            this.vy[i] = 0;
            this.vx[i] *= 0.6;
          }
          this.x[i] = x;
          this.y[i] = g + 0.01;
          if (t === P.SPARK) life = Math.min(life, 0.15);
          this.life[i] = life;
          continue;
        }
        if (t === P.BLOOD && this.props && this.hitProp(i, x, y)) continue;
      }
      if (this.water && t === P.BLOOD && x > this.water.x0 && x < this.water.x1 && y < this.water.y) {
        this.alive[i] = 0;
        this.n--;
        continue;
      }
      this.x[i] = x;
      this.y[i] = y;
      this.life[i] = life;
    }
  }

  // blood landing on a prop: test the drop against each prop's box in its own frame
  hitProp(i, x, y) {
    const list = this.props;
    for (let k = 0; k < list.length; k++) {
      const pr = list[k];
      const it = pr.item;
      if (!it.vis) continue;
      const dx = x - it.x;
      const dy = y - it.y;
      const r = pr.reach;
      if (dx > r || dx < -r || dy > r || dy < -r) continue;
      const c = Math.cos(it.a);
      const s = Math.sin(it.a);
      const u = dx * c + dy * s;
      const v = -dx * s + dy * c;
      if (u > -pr.w / 2 && u < pr.w / 2 && v > -pr.h / 2 && v < pr.h / 2) {
        if (this.paint && this.onSplat) this.onSplat(x, y, this.size[i], pr, u, v);
        this.alive[i] = 0;
        this.n--;
        return true;
      }
    }
    return false;
  }

  static additive(t) {
    return ADD[t];
  }
}
