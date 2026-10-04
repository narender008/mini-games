// Explosions and everything they leave behind: flash, fireball, shock ring,
// flying dirt and sparks, smoke, embers, scorch and hot glow on the ground,
// debris and gore with simple physics, burning wrecks, short-lived lights,
// camera shake and screen flash.
import { Particles, K } from './particles.js';
import { InstanceList, DECAL_STRIDE, SPRITE_STRIDE } from '../gl/renderer.js';
import { rand, pick, clamp, REDUCED_MOTION } from '../config.js';
import { blast } from './blasts.js';

const TAU = Math.PI * 2;

export class Effects {
  constructor(quality, sound) {
    this.q = quality;
    this.sound = sound;
    this.p = new Particles(quality.particles);
    this.decals = new InstanceList(DECAL_STRIDE, 256);
    this.debris = [];
    this.glows = [];
    this.burners = [];
    this.trauma = 0;
    this.flash = 0;
    this.flashCol = [1, 0.85, 0.7];
    this.chroma = 0;
    this.terrain = null;
    this.atlas = null;
    this.soil = [0.16, 0.1, 0.06];
    this.top = [0.13, 0.12, 0.05];
    this.wind = 0;
    this.time = 0;
    this.p.onLand = (kind, x, y, size) => {
      if (kind === K.BLOOD && Math.random() < 0.5) this.decal(1, x, y - 0.1, rand(0.25, 0.7) + size, 0, 0.85, 1, 0, rand(0, TAU), rand(1, 1.8));
    };
    this.debrisList = new InstanceList(SPRITE_STRIDE, 128);
  }

  setWorld(terrain, bf, atlas) {
    this.terrain = terrain;
    this.atlas = atlas;
    this.soil = bf.ground_.soil.slice(0, 3);
    this.top = bf.ground_.top.slice(0, 3);
    this.p.clear();
    this.debris.length = 0;
    this.glows.length = 0;
    for (const b of this.burners) if (b.voice) b.voice.stop();
    this.burners.length = 0;
    this.decals.clear();
    this.trauma = 0;
    this.flash = 0;
  }

  // ---- building blocks
  decal(kind, x, y, r, sr, sg, sb, sa, angle = 0, stretch = 1) {
    const k = this.decals.alloc();
    const D = this.decals.data;
    D[k] = x;
    D[k + 1] = y;
    D[k + 2] = r;
    D[k + 3] = kind;
    D[k + 4] = sr;
    D[k + 5] = sg;
    D[k + 6] = sb;
    D[k + 7] = sa;
    D[k + 8] = Math.random();
    D[k + 9] = angle;
    D[k + 10] = stretch;
    D[k + 11] = 0;
  }

  // A light that fades out: curve 0 = quick flash, 1 = slow fireball glow.
  glow(x, y, z, radius, r, g, b, life, flicker = 0) {
    this.glows.push({ x, y, z, radius, r, g, b, life, age: 0, flicker });
  }

  shake(amount) {
    this.trauma = Math.min(1.2, this.trauma + amount * (REDUCED_MOTION ? 0.35 : 1));
  }

  screenFlash(amount, r = 1, g = 0.85, b = 0.7) {
    const a = amount * (REDUCED_MOTION ? 0.25 : 1);
    if (a > this.flash) {
      this.flash = a;
      this.flashCol[0] = r;
      this.flashCol[1] = g;
      this.flashCol[2] = b;
    }
  }

  smoke(x, y, vx, vy, size, life, shade = 0.06, alpha = 0.85, back = false) {
    const P = this.p;
    const i = P.spawn(K.SMOKE, x, y, vx, vy, size, life, shade, shade * 0.93, shade * 0.86, alpha);
    if (i < 0) return i;
    P.grow[i] = rand(0.35, 0.8) * (0.6 + size * 0.25);
    P.drag[i] = 0.9;
    P.grav[i] = -0.05;
    P.wind[i] = 0.55;
    P.spin[i] = rand(-0.3, 0.3);
    P.back[i] = back ? 1 : 0;
    return i;
  }

  fire(x, y, vx, vy, size, life, heat = 1) {
    const P = this.p;
    const i = P.spawn(K.FIRE, x, y, vx, vy, size, life, 1, 1, 1, heat);
    if (i < 0) return i;
    P.grow[i] = rand(0.5, 1.3) * size;
    P.drag[i] = 3.2;
    P.grav[i] = -0.18;
    P.wind[i] = 0.3;
    P.spin[i] = rand(-1, 1);
    return i;
  }

  // ---- the blasts
  muzzle(x, y, angle, size = 1) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const P = this.p;
    let i = P.spawn(K.FLASH, x + ca * 0.6, y + sa * 0.6, 0, 0, 2.6 * size, 0.09, 6, 4.2, 2.4, 1);
    for (let k = 0; k < 7; k++) {
      const sp = rand(14, 40) * size;
      const a = angle + rand(-0.18, 0.18);
      i = this.fire(x + ca * 0.4, y + sa * 0.4, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.35, 0.8) * size, rand(0.08, 0.16), 1);
      if (i >= 0) this.p.drag[i] = 9;
    }
    // side blast from the muzzle brake and the big grey cloud
    for (let k = 0; k < 10; k++) {
      const a = angle + rand(-0.5, 0.5) + (k % 2 ? 1.4 : -1.4) * (k < 4 ? 1 : 0);
      const sp = rand(4, 16) * size;
      i = this.smoke(x + ca, y + sa, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.6, 1.3) * size, rand(1.4, 3), 0.22, 0.55);
      if (i >= 0) this.p.drag[i] = 2.5;
    }
    this.glow(x + ca, y + sa, 3, 26 * size, 7, 4.5, 2.2, 0.12);
    this.shake(0.12 * size);
  }

  // A weapon's own blast (see blasts.js).
  blast(kind, x, y, o) {
    blast(this, kind, x, y, o);
  }

  // Standard high-explosive blast. `r` is the crater radius in metres;
  // `power` scales the show. `dir` is the surface normal (for the dirt cone).
  explode(x, y, r, power = 1, opts = {}) {
    const P = this.p;
    const q = this.q.particleScale;
    const nx = opts.nx ?? 0;
    const ny = opts.ny ?? 1;
    const inGround = opts.inGround !== false;
    const soil = this.soil;
    // flash and light
    P.spawn(K.FLASH, x, y, 0, 0, 5 * power + r, 0.1, 3.2, 2.6, 1.9, 1);
    P.spawn(K.FLASH, x, y, 0, 0, 12 * power + r * 2, 0.3, 0.9, 0.45, 0.16, 0.6);
    this.glow(x, y, 4, 20 * power + r * 2.5, 4.5, 3.2, 2, 0.16);
    this.glow(x, y + r * 0.6, 5, 16 * power + r * 2, 2.6, 1.15, 0.32, 0.9 + power * 0.4, 0.3);
    // fireball: a hot core and tongues of flame that roll upwards
    const nFire = Math.round((10 + 10 * power) * q);
    for (let k = 0; k < nFire; k++) {
      const a = rand(0, TAU);
      const sp = rand(2, 13) * power + 2;
      const up = rand(2, 9) * power;
      this.fire(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.25, Math.cos(a) * sp + nx * up, Math.sin(a) * sp * 0.7 + ny * up, rand(1.0, 2.4) * (0.7 + power * 0.5), rand(0.45, 0.95) * (0.8 + power * 0.25), 1);
    }
    for (let k = 0; k < 3; k++) this.fire(x, y, rand(-2, 2), rand(1, 4), (2.4 + r * 0.4) * (0.6 + power * 0.5), 0.22, 1);
    // shock ring
    let i = P.spawn(K.SHOCK, x, y, 0, 0, 1.2, 0.38 + power * 0.1, 0, 0, 0, 0.9 * Math.min(1.5, power));
    if (i >= 0) P.grow[i] = 55 * Math.min(1.6, 0.6 + power * 0.4);
    // the ground erupts
    if (inGround) {
      const nDirt = Math.round((26 + 30 * power) * q);
      for (let k = 0; k < nDirt; k++) {
        const a = Math.atan2(ny, nx) + rand(-1.0, 1.0) * (k % 3 === 0 ? 1.4 : 0.8);
        const sp = rand(8, 30) * Math.sqrt(power);
        i = P.spawn(K.DIRT, x + rand(-r, r) * 0.4, y + rand(-r, r) * 0.3, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.08, 0.32) * (k % 7 === 0 ? 2.2 : 1), rand(2.2, 4), soil[0] * rand(0.7, 1.3), soil[1] * rand(0.7, 1.2), soil[2] * rand(0.7, 1.2), 1);
        if (i < 0) continue;
        P.grav[i] = 1;
        P.drag[i] = 0.25;
        P.hit[i] = 1;
        P.spin[i] = rand(-12, 12);
      }
      // dust thrown out low along the ground
      const nDust = Math.round(9 * q * Math.sqrt(power));
      for (let k = 0; k < nDust; k++) {
        const s = k % 2 ? 1 : -1;
        i = this.smoke(x + s * rand(0, r), y + rand(-0.5, 1), s * rand(5, 16) * power, rand(0.5, 3), rand(1.2, 2.6) * Math.sqrt(power), rand(2.5, 4.5), 0, 0.5);
        if (i < 0) continue;
        P.r[i] = soil[0] * 1.5 + 0.04;
        P.g[i] = soil[1] * 1.5 + 0.035;
        P.b[i] = soil[2] * 1.5 + 0.03;
        P.drag[i] = 1.8;
        P.grav[i] = -0.02;
      }
    }
    // sparks
    const nSpark = Math.round((14 + 14 * power) * q);
    for (let k = 0; k < nSpark; k++) {
      const a = Math.atan2(ny, nx) + rand(-1.4, 1.4);
      const sp = rand(18, 55);
      i = P.spawn(K.SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.05, 0.1), rand(0.25, 0.8), 6, 3.0, 1.1, 1);
      if (i < 0) continue;
      P.grav[i] = 0.6;
      P.drag[i] = 1.2;
    }
    // the smoke column: dark, oily, rising and drifting with the wind
    const nSmoke = Math.round((7 + 9 * power) * q);
    for (let k = 0; k < nSmoke; k++) {
      const h = k / nSmoke;
      i = this.smoke(x + rand(-r, r) * 0.6, y + rand(0, r) + h * 2, rand(-2, 2) + nx * 3, rand(2, 7) * (0.6 + h) * Math.sqrt(power), rand(1.8, 3.4) * (0.7 + power * 0.4), rand(4, 8) * (0.8 + power * 0.25), rand(0.035, 0.08), 0.9);
    }
    // embers
    const nEmber = Math.round((10 + 12 * power) * q);
    for (let k = 0; k < nEmber; k++) {
      i = P.spawn(K.EMBER, x + rand(-r, r) * 0.5, y + rand(0, r) * 0.5, rand(-6, 6), rand(3, 13), rand(0.05, 0.11), rand(1.2, 3.6), 5, 1.9, 0.45, 1);
      if (i < 0) continue;
      P.grav[i] = 0.08;
      P.drag[i] = 0.9;
      P.wind[i] = 0.9;
    }
    // heat shimmer
    i = P.spawn(K.HEAT, x, y + r, 0, 2, 5 + r * 1.2, 1.6, 0, 0, 0, 0.8);
    // scorch and glowing ground
    this.decal(0, x, y, r * 1.55 + 1, 0.95, 0, 0, 0, rand(0, TAU), 1);
    this.decal(0, x, y, r * 1.05, 0, 0, 0, 0.9, rand(0, TAU), 1);
    this.shake(0.28 * power + r * 0.02);
    this.screenFlash(0.05 * power);
    this.chroma = Math.max(this.chroma, 0.008 * power);
  }

  // A tank's ammunition cooks off: a huge blast, the turret thrown into the
  // air, parts flying, the crew blasted apart, then the wreck burns.
  tankKill(tank, dir) {
    const t = tank;
    const x = t.x;
    const y = t.y + 1.2;
    this.explode(x, y, 3, 1.8, { inGround: false, nx: 0, ny: 1 });
    // a second, taller fireball from the ammunition
    for (let k = 0; k < 18; k++) {
      this.fire(x + rand(-2.5, 2.5), y + rand(0, 2), rand(-5, 5), rand(8, 26), rand(1.6, 3.2), rand(0.7, 1.3), 1);
    }
    this.glow(x, y + 3, 6, 70, 10, 5, 1.6, 1.6, 0.4);
    const A = this.atlas;
    const sk = t.skin;
    // the turret goes up, spinning
    this.addDebris(`${t.type}_wreck_turret`, t.turretX, t.turretY, dir * rand(2, 7), rand(16, 24), rand(-5, 5), { char: 1, burn: 1, paint: 0.2, tint: sk.tint, size: 1, keep: true, mass: 3 });
    t.turretGone = true;
    const parts = ['debris_wheel', 'debris_wheel', 'debris_sprocket', 'debris_hatch', 'debris_plate_0', 'debris_plate_1', 'debris_plate_2', 'debris_track', 'debris_jerrycan', 'debris_toolbox', 'debris_mg'];
    for (const part of parts) {
      if (A && !A.has(part)) continue;
      const a = rand(0.25, 2.9);
      const sp = rand(8, 26);
      this.addDebris(part, x + rand(-3, 3), y + rand(-0.5, 1.5), Math.cos(a) * sp + dir * 4, Math.sin(a) * sp, rand(-14, 14), { char: rand(0.3, 1), paint: 1, tint: sk.tint, burn: Math.random() < 0.4 ? 1 : 0, life: rand(30, 60) });
    }
    this.gore(t.hatchX, t.hatchY, dir, 1);
    this.addBurner(x, t.y + 1.5, 1.4, 90, tank);
    this.shake(0.7);
    this.screenFlash(0.35, 1, 0.75, 0.5);
    this.chroma = Math.max(this.chroma, 0.02);
    this.sound.boom('cookoff', x, 1.4);
  }

  // The crew: blood spray, mist and pieces that stick where they land.
  gore(x, y, dir, amount = 1) {
    const P = this.p;
    const n = Math.round(70 * amount * this.q.particleScale);
    for (let k = 0; k < n; k++) {
      const a = rand(0.1, Math.PI - 0.1) + dir * 0.3;
      const sp = rand(4, 24);
      const i = P.spawn(K.BLOOD, x, y, Math.cos(a) * sp + dir * rand(0, 8), Math.sin(a) * sp, rand(0.05, 0.13), rand(1.5, 3), rand(0.17, 0.26), 0.01, 0.008, 1);
      if (i < 0) continue;
      P.grav[i] = 1;
      P.drag[i] = 0.4;
      P.hit[i] = 1;
    }
    for (let k = 0; k < 8; k++) {
      const i = this.smoke(x + rand(-0.6, 0.6), y + rand(-0.3, 0.6), rand(-4, 4) + dir * 3, rand(0, 5), rand(0.5, 1.1), rand(0.6, 1.3), 0, 0.55);
      if (i < 0) continue;
      P.r[i] = 0.22;
      P.g[i] = 0.015;
      P.b[i] = 0.012;
      P.drag[i] = 3;
      P.grav[i] = 0.05;
    }
    const bits = ['gore_helmet', 'gore_boot', 'gore_chunk_0', 'gore_chunk_1', 'gore_chunk_2', 'gore_chunk_3', 'gore_chunk_1', 'gore_chunk_3'];
    for (const b of bits) {
      const a = rand(0.4, 2.7);
      const sp = rand(7, 22);
      this.addDebris(b, x, y, Math.cos(a) * sp + dir * rand(2, 9), Math.sin(a) * sp, rand(-16, 16), { sticky: b !== 'gore_helmet', blood: b.startsWith('gore_chunk') ? 0 : 0.6, life: rand(40, 70), gore: true });
    }
    this.sound.hit('splat', x, 1);
  }

  // ---- debris with physics
  addDebris(frame, x, y, vx, vy, spin, o = {}) {
    const d = {
      frame,
      x,
      y,
      vx,
      vy,
      rot: rand(0, TAU),
      spin,
      flip: Math.random() < 0.5 ? -1 : 1,
      size: o.size ?? 1,
      tint: o.tint || [1, 1, 1],
      paint: o.paint ?? 0,
      char: o.char ?? 0,
      blood: o.blood ?? 0,
      burn: o.burn ?? 0,
      sticky: !!o.sticky,
      gore: !!o.gore,
      keep: !!o.keep,
      mass: o.mass ?? 1,
      life: o.life ?? 1e9,
      age: 0,
      rest: false,
      trail: 0,
      r: 0.25,
    };
    if (this.atlas && this.atlas.frames[frame]) {
      const f = this.atlas.frames[frame];
      d.r = Math.min(f.w, f.h) * 0.4 * d.size;
    }
    this.debris.push(d);
    return d;
  }

  updateDebris(dt, g) {
    const T = this.terrain;
    const D = this.debris;
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.age += dt;
      if (d.age > d.life) {
        D.splice(i, 1);
        continue;
      }
      if (d.burn > 0) {
        d.trail -= dt;
        if (d.trail <= 0) {
          d.trail = d.rest ? 0.18 : 0.035;
          this.smoke(d.x, d.y, rand(-0.5, 0.5), rand(0.5, 2), rand(0.3, 0.7) * (d.mass > 2 ? 2 : 1), rand(1.2, 2.6), 0.05, 0.7);
          if (!d.rest || Math.random() < 0.5) this.fire(d.x, d.y, rand(-0.5, 0.5), rand(0.5, 2), rand(0.25, 0.6) * (d.mass > 2 ? 2 : 1), rand(0.2, 0.45), 0.8);
        }
        d.burn = Math.max(0, d.burn - dt * (d.keep ? 0.01 : 0.03));
      }
      if (d.rest) continue;
      d.vy -= g * dt;
      d.vx *= Math.exp(-0.15 * dt);
      const nx = d.x + d.vx * dt;
      const ny = d.y + d.vy * dt;
      if (T.solid(nx, ny - d.r)) {
        const speed = Math.hypot(d.vx, d.vy);
        if (d.sticky) {
          if (d.gore) this.decal(1, nx, ny - d.r, rand(0.35, 0.8), 0, 0.9, 1, 0, rand(0, TAU), rand(1, 2));
          d.rest = true;
          d.y = T.groundBelow(nx, ny + 1) + d.r * 0.6;
          d.x = nx;
          continue;
        }
        if (speed > 6 && d.mass > 0.5) this.sound.hit(d.gore ? 'splat' : 'debris', nx, Math.min(1, speed / 25) * d.mass * 0.5);
        if (d.gore && speed > 4) this.decal(1, nx, ny - d.r, rand(0.3, 0.6), 0, 0.8, 1, 0, rand(0, TAU), 1.4);
        // bounce, losing most of the energy
        d.vy = Math.abs(d.vy) * 0.28;
        d.vx *= 0.55;
        d.spin *= 0.5;
        if (speed < 3) {
          d.rest = true;
          d.y = T.groundBelow(nx, ny + 1) + d.r * 0.55;
          d.x = nx;
          // settle flat-ish
          d.rot = Math.round(d.rot / Math.PI) * Math.PI + rand(-0.2, 0.2);
          continue;
        }
      } else {
        d.x = nx;
        d.y = ny;
      }
      d.rot += d.spin * dt;
      if (d.y < -20 || d.x < -100 || d.x > 420) D.splice(i, 1);
    }
  }

  // A fire that keeps burning (a wreck): flames, a smoke column, embers, a
  // flickering light, shimmer and the roar of it.
  addBurner(x, y, size, life, owner = null) {
    const b = { x, y, size, life, age: 0, acc: 0, owner, voice: null };
    if (this.sound) b.voice = this.sound.burn(x, size);
    this.burners.push(b);
    return b;
  }

  updateBurners(dt) {
    const P = this.p;
    for (let i = this.burners.length - 1; i >= 0; i--) {
      const b = this.burners[i];
      b.age += dt;
      const k = clamp(1 - b.age / b.life, 0.18, 1) * b.size;
      if (b.owner && b.owner.wreckX !== undefined) {
        b.x = b.owner.x;
        b.y = b.owner.y + 1.5;
      }
      b.acc += dt * (30 * k * this.q.particleScale + 4);
      while (b.acc > 1) {
        b.acc -= 1;
        const r = Math.random();
        if (r < 0.55) this.fire(b.x + rand(-1.8, 1.8) * k, b.y + rand(-0.3, 0.6), rand(-0.6, 0.6), rand(2, 5) * k, rand(0.5, 1.3) * k, rand(0.35, 0.8), 0.95);
        else if (r < 0.88) this.smoke(b.x + rand(-1.2, 1.2), b.y + 1.5 * k, rand(-0.8, 0.8), rand(3, 6), rand(1, 2) * k, rand(5, 9), rand(0.025, 0.05), 0.85);
        else {
          const j = P.spawn(K.EMBER, b.x + rand(-1.5, 1.5), b.y + rand(0, 1.5), rand(-1.5, 1.5), rand(3, 8), rand(0.04, 0.09), rand(1.5, 3.5), 5, 1.8, 0.4, 1);
          if (j >= 0) {
            P.grav[j] = 0.03;
            P.drag[j] = 0.7;
            P.wind[j] = 1;
          }
        }
      }
      if (Math.random() < dt * 2) {
        const j = P.spawn(K.HEAT, b.x, b.y + 2 * k, 0, 2.5, 4 * k, 1.8, 0, 0, 0, 0.6);
      }
      if (b.voice) b.voice.update(b.x, k);
    }
  }

  // ---- per frame
  update(dt, gravity, wind) {
    this.time += dt;
    this.wind = wind;
    this.p.update(dt, gravity, wind, this.terrain);
    this.updateDebris(dt, gravity);
    this.updateBurners(dt);
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const g = this.glows[i];
      g.age += dt;
      if (g.age >= g.life) this.glows.splice(i, 1);
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.chroma = Math.max(0, this.chroma - dt * 0.12);
  }

  // Fills the renderer's light list and returns the particle lists.
  build(lights, sprites) {
    for (const g of this.glows) {
      const t = g.age / g.life;
      let k = (1 - t) * (1 - t);
      if (g.flicker) k *= 1 - g.flicker * Math.random();
      lights.add(g.x, g.y, g.z, g.radius * (0.7 + 0.3 * (1 - t)), g.r * k, g.g * k, g.b * k, 0.4);
    }
    for (const b of this.burners) {
      const k = clamp(1 - b.age / b.life, 0.18, 1) * b.size;
      const f = 0.75 + 0.25 * Math.sin(this.time * 17 + b.x) * Math.sin(this.time * 7.3);
      lights.add(b.x, b.y + 1.2, 2.5, 22 * k + 6, 3.2 * k * f, 1.35 * k * f, 0.35 * k * f, 0.4);
    }
    const A = this.atlas;
    if (A) {
      for (const d of this.debris) {
        const fade = d.life < 1e8 ? clamp((d.life - d.age) / 6, 0, 1) : 1;
        A.put(sprites, d.frame, d.x, d.y, d.rot, d.flip, d.size, d.tint[0], d.tint[1], d.tint[2], d.paint, fade, d.char, d.blood, d.burn * 0.25);
      }
    }
    return this.p.build();
  }
}

export { pick };
