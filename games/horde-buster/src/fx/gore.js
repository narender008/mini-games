// Gibs: heads, limbs, torsos and chunks that fly, spin, bounce and bleed, then
// settle and are stamped into the ground's paint layer (so the road keeps
// every one of them at no cost per frame). Death effects choose which parts
// come off and how much blood flies.
import { SPRITE_STRIDE } from '../gl/renderer.js';
import { rnd, rand, TAU } from '../config.js';
import { TYPES } from '../game/enemies.js';

const G = 1250;

export class Gore {
  constructor(cap, particles, atlas) {
    this.cap = cap;
    this.fx = particles;
    this.atlas = atlas;
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
    this.rot = F();
    this.vrot = F();
    this.prot = F();
    this.scale = F();
    this.t = F(); // time since settling
    this.age = F();
    this.bleed = F();
    this.ice = F();
    this.flip = new Int8Array(cap);
    this.frame = new Uint16Array(cap);
    this.blood = new Uint8Array(cap); // blood colour index into `colors`
    this.n = 0;
    this.frames = [];
    this.ids = {};
    this.colors = [];
    this.arrays = [this.x, this.y, this.z, this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.rot, this.vrot, this.prot, this.scale, this.t, this.age, this.bleed, this.ice, this.flip, this.frame, this.blood];
    this.chunks = ['gib_meat_0', 'gib_meat_1', 'gib_meat_2', 'gib_meat_3'];
    this.bones = ['gib_bone_0', 'gib_bone_1', 'gib_bone_2'];
    // charred meat from the flamethrower (falls back to plain meat until those frames exist)
    this.char = ['gib_char_0', 'gib_char_1', 'gib_char_2'].map((n, k) => (atlas.frames[n] ? n : this.chunks[k]));
  }

  reset() {
    this.n = 0;
  }

  id(name) {
    let k = this.ids[name];
    if (k !== undefined) return k;
    const f = this.atlas.frames[name]; // a creature without that part (spiders have no arms) just skips it
    if (!f) return -1;
    k = this.frames.length;
    this.frames.push(f);
    this.ids[name] = k;
    return k;
  }

  color(c) {
    let k = this.colors.indexOf(c);
    if (k < 0) {
      k = this.colors.length;
      this.colors.push(c);
    }
    return k;
  }

  // throw one gib
  add(name, x, y, z, vx, vy, vz, blood, bleed = 0.6, scale = 1, ice = 0) {
    const f = this.id(name);
    if (f < 0) return -1;
    let i;
    if (this.n < this.cap) i = this.n++;
    else {
      // full: stamp the oldest straight into the road and reuse its slot
      i = 0;
      let best = -1;
      for (let k = 0; k < this.n; k += 7) if (this.age[k] > best) (best = this.age[k]), (i = k);
      this.stamp(i);
    }
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.z[i] = this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.rot[i] = this.prot[i] = rnd() * TAU;
    this.vrot[i] = rand(-14, 14);
    this.scale[i] = scale;
    this.t[i] = 0;
    this.age[i] = 0;
    this.bleed[i] = bleed;
    this.ice[i] = ice;
    this.flip[i] = rnd() < 0.5 ? -1 : 1;
    this.frame[i] = f;
    this.blood[i] = this.color(blood);
    return i;
  }

  // burst parts outward from (x, y, z): speed scales the throw
  burst(names, x, y, z, speed, blood, dirx = 0, diry = 0, ice = 0) {
    for (let k = 0; k < names.length; k++) {
      const a = rnd() * TAU;
      const s = speed * (0.4 + rnd() * 0.8);
      // loose meat, bone and ice are drawn a little smaller than the body parts
      const sc = names[k].startsWith('gib_') || names[k].startsWith('ice_') ? 0.72 : 1;
      this.add(names[k], x + rand(-6, 6), y + rand(-4, 4), z + rand(-8, 8), Math.cos(a) * s + dirx * speed * 0.6, Math.sin(a) * s * 0.7 + diry * speed * 0.6, rand(220, 520) * (speed / 300), blood, ice ? 0 : 0.7, sc, ice);
    }
  }

  update(dt) {
    const fx = this.fx;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];
      this.pz[i] = this.z[i];
      this.prot[i] = this.rot[i];
      this.age[i] += dt;
      const air = this.z[i] > 0 || this.vz[i] > 0;
      if (air) {
        this.vz[i] -= G * dt;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.z[i] += this.vz[i] * dt;
        this.rot[i] += this.vrot[i] * dt;
        // a bleeding part leaves a trail of drops
        if (this.bleed[i] > 0 && rnd() < dt * 22) {
          const c = this.colors[this.blood[i]];
          fx.add(0, 1, this.x[i], this.y[i], this.z[i], this.vx[i] * 0.2 + rand(-30, 30), this.vy[i] * 0.2, 0, 2, 2.2, 2.2, c[0], c[1], c[2], 1, 1 | 2, 0);
        }
        if (this.z[i] <= 0) {
          this.z[i] = 0;
          const impact = -this.vz[i];
          if (impact > 120) {
            // bounce: a splat where it hits, then a smaller hop
            if (this.bleed[i] > 0) {
              const c = this.colors[this.blood[i]];
              fx.splat(this.x[i], this.y[i], 7 + impact * 0.012, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0.9, 0);
              this.bleed[i] *= 0.6;
            }
            this.vz[i] = impact * 0.32;
            this.vx[i] *= 0.55;
            this.vy[i] *= 0.55;
            this.vrot[i] *= 0.5;
          } else {
            this.vz[i] = 0;
          }
        }
      } else {
        // sliding to a stop on the road
        const k = Math.exp(-7 * dt);
        this.vx[i] *= k;
        this.vy[i] *= k;
        this.vrot[i] *= k;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.rot[i] += this.vrot[i] * dt;
        this.t[i] += dt;
        if (this.t[i] > 0.35 && this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i] < 400) {
          this.stamp(i);
          n--;
          if (i !== n) this.move(n, i);
          i--;
          continue;
        }
      }
      if (this.age[i] > 7) this.vz[i] = 0;
    }
    this.n = n;
  }

  move(from, to) {
    const A = this.arrays;
    for (let k = 0; k < A.length; k++) A[k][to] = A[k][from];
  }

  // the gib becomes part of the road
  stamp(i) {
    const f = this.frames[this.frame[i]];
    const L = this.fx.stamps;
    const k = L.alloc();
    const D = L.data;
    const s = this.scale[i];
    D[k] = this.x[i];
    D[k + 1] = this.y[i];
    D[k + 2] = f.w * s * this.flip[i];
    D[k + 3] = f.h * s;
    D[k + 4] = f.u0;
    D[k + 5] = f.v0;
    D[k + 6] = f.u1;
    D[k + 7] = f.v1;
    // centred on its pivot (gibs pivot at the middle already)
    D[k + 8] = f.ox * s;
    D[k + 9] = f.oy * s;
    D[k + 10] = this.rot[i];
    D[k + 11] = f.layer;
    D[k + 12] = 0;
    D[k + 13] = this.ice[i];
    D[k + 14] = 1;
    D[k + 15] = 0;
  }

  draw(sprites, shadows, alpha) {
    for (let i = 0; i < this.n; i++) {
      const f = this.frames[this.frame[i]];
      const x = this.px[i] + (this.x[i] - this.px[i]) * alpha;
      const y = this.py[i] + (this.y[i] - this.py[i]) * alpha;
      const z = this.pz[i] + (this.z[i] - this.pz[i]) * alpha;
      const r = this.prot[i] + (this.rot[i] - this.prot[i]) * alpha;
      sprites.put(f, x, y - z, y + 2, this.scale[i], r, this.flip[i], 0, this.ice[i]);
      const sh = shadows.alloc();
      const S = shadows.data;
      S[sh] = x;
      S[sh + 1] = y;
      S[sh + 2] = Math.max(f.w, f.h) * 0.45 * this.scale[i];
      S[sh + 3] = 0.35 / (1 + z * 0.01);
    }
  }

  // ---------------------------------------------------------------- deaths

  // How a creature dies. cause: 'hit' | 'crit' | 'blast' | 'ice' | 'shock' | 'fire' | 'collapse'.
  // (x, y) its feet, scale its size; dx, dy the direction of the killing blow.
  death(type, x, y, scale, cause, dx, dy, headless) {
    const T0 = TYPES[type];
    const g = T0.gib;
    const fx = this.fx;
    const col = T0.blood;
    const h = T0.hitY * scale;
    const big = T0.big ? 1.6 : T0.small ? 0.5 : 1;
    if (cause === 'ice') {
      // shatter: frozen chunks, no blood
      const parts = T0.parts ? [...T0.parts, 'ice_chunk_0', 'ice_chunk_1', 'ice_chunk_2'] : [`${g}_head`, `${g}_arm`, `${g}_leg`, 'ice_chunk_0', 'ice_chunk_1', 'ice_chunk_2', 'ice_chunk_3'];
      this.burst(parts, x, y, h, 330 * Math.sqrt(big), col, dx, dy, 1);
      fx.ice(x, y, h, 22 * big);
      return;
    }
    if (cause === 'fire') {
      // burnt up: charred chunks and smoking limbs burst out of a fireball, blood boils onto the road
      const busy = this.n > this.cap * 0.6;
      const parts = T0.parts ? T0.parts.slice(0, 2) : [`${g}_torso`];
      if (!headless && !T0.parts) parts.push(`${g}_head`);
      if (!T0.small && !T0.parts) parts.push(`${g}_arm`, rnd() < 0.5 ? `${g}_leg` : `${g}_arm`);
      for (let k = 0; k < (busy ? 1 : 3) * big; k++) parts.push(this.char[(k + Math.floor(rnd() * 3)) % 3]);
      this.burst(parts, x, y, h, 300 * Math.sqrt(big), col, dx * 0.4, dy * 0.4 - 0.3);
      fx.blood(x, y, h, dx, dy, 12 * big, 300, col, 1.6);
      fx.mist(x, y, h, col, 16 * big, 2);
      for (let k = 0; k < 3 * big; k++) fx.add(3, 2, x + rand(-14, 14) * big, y + rand(-8, 8), h * rand(0.3, 1), rand(-40, 40), rand(-30, 10), rand(40, 120), rand(0.35, 0.7), 18 * big, 34 * big, 1, 1, 1, 1, 0, rnd());
      fx.smoke(x, y, h, 26 * Math.sqrt(big), busy ? 1 : 2, 0.12);
      fx.splat(x, y, 26 * big * scale, 0.05, 0.025, 0.02, 0.9, 0);
      fx.splat(x + rand(-8, 8), y + rand(-6, 6), 16 * big * scale, col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 0.9, 0);
      return;
    }
    const blast = cause === 'blast';
    const crit = cause === 'crit';
    const parts = [];
    if (T0.parts) {
      // a creature with its own set of pieces (imps, hounds): all of them on a blast, most otherwise
      for (let k = 0; k < T0.parts.length; k++) if (blast || k === 0 || rnd() < 0.7) parts.push(T0.parts[k]);
    } else {
      if (!headless) parts.push(`${g}_head`);
      if (T0.small) {
        parts.push(`${g}_leg`, `${g}_leg`, `${g}_body`);
      } else {
        if (blast || rnd() < 0.7) parts.push(`${g}_arm`);
        if (blast || rnd() < 0.45) parts.push(`${g}_arm`);
        if (blast || rnd() < 0.5) parts.push(`${g}_leg`);
        if (blast) parts.push(`${g}_leg`);
        parts.push(`${g}_torso`);
      }
    }
    if (T0.extra) for (let k = 0; k < T0.extra.length; k++) if (blast || rnd() < 0.5) parts.push(T0.extra[k]);
    // fewer loose chunks when the road is already full of them
    const busy = this.n > this.cap * 0.6;
    const nChunks = busy ? (blast ? 1 : 0) : blast ? 4 : crit ? 2 : 1;
    for (let k = 0; k < nChunks * big; k++) parts.push(this.chunks[(k + Math.floor(rnd() * 4)) & 3]);
    if (!busy && (blast || rnd() < 0.3)) parts.push(this.bones[Math.floor(rnd() * 3)]);
    if (!busy && blast && rnd() < 0.5) parts.push('gib_guts_0');
    const speed = (blast ? 420 : crit ? 300 : 230) * Math.sqrt(big);
    this.burst(parts, x, y, h, speed, col, dx * 0.6, dy * 0.6);
    // the blood
    fx.blood(x, y, h, dx, dy, (blast ? 34 : 18) * big, blast ? 520 : 360, col, blast ? 3.2 : 1.1);
    fx.blood(x, y, h, -dx, -dy, (blast ? 14 : 6) * big, 220, col, 1.6);
    fx.mist(x, y, h, col, (blast ? 34 : 22) * big, blast ? 4 : 2);
    fx.splat(x, y, (blast ? 34 : 22) * big * scale, col[0] * 0.75, col[1] * 0.75, col[2] * 0.75, 0.95, 0);
  }

  // A head blown off a body that keeps walking: skull bits fly, the head pops up and away.
  headPop(type, x, y, scale, dx, dy) {
    const T0 = TYPES[type];
    const g = T0.gib;
    const h = T0.hitY * scale * 1.6;
    const fx = this.fx;
    const col = T0.blood;
    if (rnd() < 0.5) this.add(`${g}_head`, x, y, h, dx * 180 + rand(-120, 120), dy * 120 - rand(40, 140), rand(380, 620), col, 1);
    else {
      // the whole head bursts
      this.burst(['gib_skull_shard', 'gib_brain', 'gib_eye', this.chunks[0], this.chunks[2]], x, y, h, 260, col, dx, dy);
    }
    fx.blood(x, y, h, dx, dy - 0.5, 16, 380, col, 1.4, 1.3);
    fx.mist(x, y, h, col, 20, 2);
  }
}
