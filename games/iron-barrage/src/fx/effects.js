// Explosions and everything they leave behind: flash, fireball, shock ring,
// flying dirt and sparks, smoke, embers, scorch and hot glow on the ground,
// debris and gore with simple physics, burning wrecks, short-lived lights,
// camera shake and screen flash. The blasts themselves are recipes in
// blasts.js; this file holds the building blocks they share (particle makers,
// timed procedures, decals, lights), the muzzle blast, a tank's death, gore,
// debris and wreck fires.
import { Particles, K } from './particles.js';
import { InstanceList, DECAL_STRIDE, SPRITE_STRIDE } from '../gl/renderer.js';
import { rand, pick, clamp, PREFS } from '../config.js';
import { blast, coreFlash } from './blasts.js';

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
    this.procs = [];
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
    this.dustBudget = 0;
    this.p.onLand = (kind, x, y, size) => {
      if (kind === K.BLOOD) {
        if (Math.random() < 0.3) this.decal(1, x, y - 0.1, rand(0.25, 0.6) + size, 0, 0.85, 1, 0, rand(0, TAU), rand(1, 1.8));
      } else if (kind === K.DIRT && size > 0.3 && this.dustBudget > 0) {
        // a big clod lands with a puff of dust
        this.dustBudget--;
        this.dust(x, y + 0.2, rand(-1.5, 1.5), rand(0.5, 1.8), size * 2.2 + 0.4, rand(0.8, 1.6), 0.45);
      }
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
    this.procs.length = 0;
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

  // A light that fades out (quick flash for a small life, slow glow for a
  // long one). Returns the light so a procedure can move it or keep it lit.
  glow(x, y, z, radius, r, g, b, life, flicker = 0) {
    const l = { x, y, z, radius, r, g, b, life, age: 0, flicker };
    this.glows.push(l);
    return l;
  }

  shake(amount) {
    this.trauma = Math.min(1.2, this.trauma + amount * (PREFS.calm ? 0.35 : 1));
  }

  screenFlash(amount, r = 1, g = 0.85, b = 0.7) {
    const a = amount * (PREFS.calm ? 0.25 : 1);
    if (a > this.flash) {
      this.flash = a;
      this.flashCol[0] = r;
      this.flashCol[1] = g;
      this.flashCol[2] = b;
    }
  }

  // Chromatic aberration kick (softened in calm mode).
  aberrate(v) {
    this.chroma = Math.max(this.chroma, v * (PREFS.calm ? 0.3 : 1));
  }

  // Calls fn(fx) once after `delay` seconds of game time.
  later(delay, fn) {
    this.procs.push({ t: -delay, life: 0, fn, once: true });
  }

  // Calls fn(fx, proc, dt) every update for `life` seconds (proc.t is its
  // age), after `delay`. fn may return false to stop early.
  proc(life, fn, delay = 0) {
    const p = { t: -delay, life, fn, once: false, acc: 0, a: 0, b: 0, c: 0 };
    this.procs.push(p);
    return p;
  }

  updateProcs(dt) {
    for (let i = this.procs.length - 1; i >= 0; i--) {
      const p = this.procs[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.once) {
        this.procs.splice(i, 1);
        p.fn(this);
        continue;
      }
      if (p.t >= p.life || p.fn(this, p, dt) === false) this.procs.splice(i, 1);
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

  // Smoke of any colour; the caller trims drag, growth and rise afterwards.
  puff(x, y, vx, vy, size, life, r, g, b, alpha, grow = 0.5, drag = 1, rise = 0.05) {
    const P = this.p;
    const i = P.spawn(K.SMOKE, x, y, vx, vy, size, life, r, g, b, alpha);
    if (i < 0) return i;
    P.grow[i] = grow * (0.6 + size * 0.25);
    P.drag[i] = drag;
    P.grav[i] = -rise;
    P.wind[i] = 0.55;
    P.spin[i] = rand(-0.3, 0.3);
    return i;
  }

  // Stretches a particle along the ground (a dust wave) and stops it turning.
  flat(i, str) {
    this.p.str[i] = str;
    this.p.rot[i] = 0;
    this.p.spin[i] = 0;
  }

  // Dust the colour of the local soil.
  dust(x, y, vx, vy, size, life, alpha = 0.5, drag = 1.8) {
    const s = this.soil;
    const i = this.puff(x, y, vx, vy, size, life, s[0] * 1.5 + 0.04, s[1] * 1.5 + 0.035, s[2] * 1.5 + 0.03, alpha, 0.6, drag, 0.02);
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

  // A fireball billow: white-hot when young, orange, then sooty smoke.
  // heat 0 makes a puff of black smoke that rolls over the flames behind it.
  ball(x, y, vx, vy, size, life, heat = 1, soot = 0.5, a = 1, grow = 0.9, drag = 1.7, rise = 0.25) {
    const P = this.p;
    const i = P.spawn(K.BALL, x, y, vx, vy, size, life, heat, soot, 0, a);
    if (i < 0) return i;
    P.rot[i] = 0;
    P.grow[i] = grow * size;
    P.drag[i] = drag;
    P.grav[i] = -rise;
    P.wind[i] = 0.25;
    return i;
  }

  flashAt(x, y, size, life, r, g, b, a = 1, str = 0, rot = 0) {
    const i = this.p.spawn(K.FLASH, x, y, 0, 0, size, life, r, g, b, a);
    if (i >= 0) {
      this.p.str[i] = str;
      this.p.rot[i] = rot;
    }
    return i;
  }

  // The air-pressure ring: bends the picture (distortion) as it spreads out
  // to radius R in `life` seconds. `half` keeps it above its centre.
  shock(x, y, R, life, a, half = false) {
    const P = this.p;
    const i = P.spawn(K.SHOCK, x, y, 1.5, 0, 1.5, life, 0, 0, 0, a);
    if (i < 0) return i;
    P.grow[i] = (R - 1.5) / (1.1 * life);
    P.back[i] = half ? 1 : 0;
    return i;
  }

  // The same front, drawn as a thin bright ring of dust and vapour.
  ring(x, y, R, life, a, r = 1.1, g = 0.95, b = 0.8, half = false) {
    const P = this.p;
    const i = P.spawn(K.RING, x, y, 1.5, 0, 1.5, life, r, g, b, a);
    if (i < 0) return i;
    P.grow[i] = (R - 1.5) / (1.1 * life);
    P.back[i] = half ? 1 : 0;
    return i;
  }

  spark(x, y, vx, vy, size, life, r = 6, g = 3, b = 1.1, grav = 0.6, drag = 1.2, bounces = 0) {
    const P = this.p;
    const i = P.spawn(K.SPARK, x, y, vx, vy, size, life, r, g, b, 1);
    if (i < 0) return i;
    P.grav[i] = grav;
    P.drag[i] = drag;
    P.hit[i] = bounces;
    return i;
  }

  ember(x, y, vx, vy, size, life, grav = 0.08, drag = 0.9) {
    const P = this.p;
    const i = P.spawn(K.EMBER, x, y, vx, vy, size, life, 5, 1.9, 0.45, 1);
    if (i < 0) return i;
    P.grav[i] = grav;
    P.drag[i] = drag;
    P.wind[i] = 0.9;
    return i;
  }

  // A clod of the local earth. A positive `trail` leaves dust behind it.
  clod(x, y, vx, vy, size, life, trail = 0, stone = false) {
    const P = this.p;
    const s = this.soil;
    const k = stone ? 0.9 : 1.55;
    const i = P.spawn(K.DIRT, x, y, vx, vy, size, life, (stone ? 0.2 : s[0] * rand(0.7, 1.3)) * k, (stone ? 0.19 : s[1] * rand(0.7, 1.2)) * k, (stone ? 0.18 : s[2] * rand(0.7, 1.2)) * k, 1);
    if (i < 0) return i;
    P.grav[i] = 1;
    P.drag[i] = 0.25;
    P.hit[i] = 1;
    P.spin[i] = rand(-12, 12);
    P.trail[i] = trail;
    return i;
  }

  // The ground's own darkening: scorch with a glowing rim of hot earth.
  scorch(x, y, r, glow = 0.9) {
    this.decal(0, x, y, r * 1.55 + 1, 0.95, 0, 0, 0, rand(0, TAU), 1);
    this.decal(0, x, y, r * 1.75, 0, 0, 0, glow, rand(0, TAU), 1);
  }

  // Which way is the ground? Returns the y of the surface under (x, y).
  groundY(x, y) {
    return this.terrain ? this.terrain.groundBelow(x, y + 1) : y - 2.4;
  }

  // ---- the blasts
  // A tank gun's muzzle blast: flash down the bore, flame and smoke from the
  // brake's side ports, a ring of dust kicked off the ground under the gun
  // and a big grey cloud of propellant smoke.
  muzzle(x, y, angle, size = 1) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const q = this.q.particleScale;
    const sc = size;
    // flash, and a cone of flame down the bore
    this.flashAt(x + ca * 0.5, y + sa * 0.5, 2.4 * sc, 0.08, 4.8, 3.2, 1.6, 1);
    this.flashAt(x + ca * 2.6 * sc, y + sa * 2.6 * sc, 1.35 * sc, 0.075, 5.5, 3.1, 1.3, 0.9, 3.4, angle);
    const nJet = Math.max(3, Math.round(6 * q));
    for (let k = 0; k < nJet; k++) {
      const sp = rand(24, 52) * sc;
      const a = angle + rand(-0.09, 0.09);
      const i = this.fire(x + ca * 0.5, y + sa * 0.5, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.4, 0.8) * sc, rand(0.09, 0.17), 1);
      if (i >= 0) {
        this.p.drag[i] = 8;
        this.p.rot[i] = a;
        this.p.spin[i] = 0;
        this.p.str[i] = 1.7;
      }
    }
    // side blast from the brake: two jets across the bore, a little forward
    for (let s = -1; s <= 1; s += 2) {
      const a = angle + s * rand(1.25, 1.5);
      const px = x - ca * 0.2;
      const py = y - sa * 0.2;
      const sp = rand(15, 26) * sc;
      const i = this.fire(px, py, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.35, 0.6) * sc, rand(0.07, 0.13), 1);
      if (i >= 0) {
        this.p.drag[i] = 8;
        this.p.rot[i] = a;
        this.p.spin[i] = 0;
        this.p.str[i] = 1.3;
      }
      const nSide = Math.max(2, Math.round(3 * q));
      for (let k = 0; k < nSide; k++) {
        const b = angle + s * rand(0.9, 1.5);
        const v = rand(5, 13) * sc;
        const j = this.puff(px, py, Math.cos(b) * v, Math.sin(b) * v, rand(0.6, 1.1) * sc, rand(1.8, 3), 0.3, 0.28, 0.25, 0.5, 0.7, 2.2, 0.04);
        if (j >= 0) this.p.env[j] = 0.2;
      }
    }
    for (let k = 0; k < Math.round(5 * q); k++) {
      const a = angle + rand(-0.5, 0.5);
      const sp = rand(14, 40) * sc;
      this.spark(x + ca * 0.8, y + sa * 0.8, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.05, 0.09), rand(0.2, 0.5), 6, rand(2.2, 3.2), 1, 0.5, 1.4);
    }
    // the propellant cloud: big, grey, drifting forward then hanging
    const nCloud = Math.max(4, Math.round(8 * q));
    for (let k = 0; k < nCloud; k++) {
      const d = rand(0.6, 3.6) * sc;
      const sp = rand(4, 17) * sc;
      const a = angle + rand(-0.25, 0.25);
      const i = this.puff(x + ca * d, y + sa * d, Math.cos(a) * sp, Math.sin(a) * sp + rand(0, 1.2), rand(0.9, 2.1) * sc, rand(2.8, 5), 0.34, 0.325, 0.3, rand(0.42, 0.62), 0.7, 2.4, 0.04);
      if (i >= 0) this.p.env[i] = 0.25;
    }
    // dust kicked up under the gun by the blast
    const gy = this.groundY(x, y);
    const h = y - gy;
    if (h < 10) {
      const k = clamp(1.25 - h * 0.08, 0.3, 1.2);
      const nDust = Math.max(4, Math.round(12 * q * k));
      for (let n = 0; n < nDust; n++) {
        const s = n % 2 ? 1 : -1;
        const fwd = ca >= 0 ? 1 : -1;
        const sp = rand(4, 13) * sc * (s === fwd ? 1.2 : 0.8);
        const px = x - ca * rand(0, 3) + rand(-1, 1);
        const i = this.dust(px, this.groundY(px, gy) + rand(0.1, 0.5), s * sp, rand(0.3, 1.6), rand(0.7, 1.5) * sc, rand(1.5, 3), 0.5, 1.5);
        if (i >= 0) this.flat(i, 0.5);
      }
      this.ring(x, gy + 0.2, 16 * sc, 0.34, 0.1, 1.0, 0.92, 0.8, true);
      this.shock(x, gy + 0.2, 20 * sc, 0.3, 0.3 * sc, true);
    }
    this.glow(x + ca, y + sa, 3, 26 * sc, 7, 4.5, 2.2, 0.12);
    this.shake(0.12 * sc);
  }

  // A weapon's own blast (see blasts.js).
  blast(kind, x, y, o) {
    blast(this, kind, x, y, o);
  }

  // Standard high-explosive blast (older callers). `r` is the crater radius
  // in metres; `power` scales the show.
  explode(x, y, r, power = 1, opts = {}) {
    blast(this, opts.inGround === false ? 'air' : 'he', x, y, { r, power, nx: opts.nx ?? 0, ny: opts.ny ?? 1, inGround: opts.inGround !== false, weapon: null, hitTank: null });
  }

  // A tank's ammunition cooks off: a huge blast, then secondary pops for a
  // second or two, the turret thrown into the air, parts flying, the crew
  // blasted apart, and the wreck burns with a column of smoke.
  tankKill(tank, dir) {
    const t = tank;
    const x = t.x;
    const y = t.y + 1.2;
    const q = this.q.particleScale;
    blast(this, 'tankkill', x, y, { r: 3, power: 1.8, nx: 0, ny: 1, inGround: false, hitTank: tank });
    const A = this.atlas;
    const sk = t.skin;
    // the turret goes up, spinning, trailing smoke and fire
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
    // the ammunition cooks off: pops, jets of flame from the hatches and
    // flaming rounds thrown out in arcs
    this.proc(
      2.3,
      (fx, p, dt) => {
        p.acc -= dt;
        if (p.acc > 0) return;
        p.acc = rand(0.07, 0.26) * (1 + p.t * 0.45);
        const px = x + rand(-2.6, 2.6);
        const py = t.y + rand(0.8, 2.7);
        coreFlash(fx, px, py, rand(1.3, 2.2), 0.8, 3);
        fx.ball(px, py, rand(-2, 2), rand(1, 5), rand(0.8, 1.4), rand(0.5, 0.9), 1.1, 0.3, 1, 0.9, 1.6, 0.3);
        for (let k = 0; k < Math.max(2, Math.round(4 * q)); k++) {
          const a = rand(0, TAU);
          const sp = rand(10, 34);
          fx.spark(px, py, Math.cos(a) * sp, Math.sin(a) * sp + 6, rand(0.05, 0.1), rand(0.3, 0.8), 6, 2.6, 0.9, 0.6, 1.2, 1);
        }
        fx.smoke(px, py + 0.5, rand(-2, 2), rand(3, 8), rand(0.9, 1.6), rand(2.5, 5), rand(0.03, 0.07), 0.8);
        fx.glow(px, py, 3, 16, 4.2, 2.2, 0.7, 0.14);
        fx.shake(0.06);
        if (Math.random() < 0.45) {
          // a jet of flame out of a hatch
          const hx = Math.random() < 0.5 ? t.hatchX : px;
          const hy = Math.random() < 0.5 ? t.hatchY : py + 0.4;
          for (let k = 0; k < 3; k++) {
            const a = Math.PI / 2 + rand(-0.3, 0.3);
            const sp = rand(16, 30);
            const i = fx.fire(hx, hy, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.7, 1.3), rand(0.3, 0.55), 1);
            if (i >= 0) {
              fx.p.rot[i] = a;
              fx.p.spin[i] = 0;
              fx.p.str[i] = 1.3;
              fx.p.drag[i] = 2.4;
            }
          }
        }
        if (Math.random() < 0.4) {
          // a round thrown out burning, with a little smoke trail
          const a = rand(0.3, Math.PI - 0.3);
          const sp = rand(18, 34);
          const vx = Math.cos(a) * sp;
          const vy = Math.sin(a) * sp;
          fx.spark(px, py, vx, vy, rand(0.1, 0.16), rand(1, 1.8), 6, 2.4, 0.7, 1, 0.1, 2);
          for (let k = 1; k < 8; k++) {
            const tt = k * 0.07;
            fx.later(tt, (f) => f.smoke(px + vx * tt, py + vy * tt - 12 * tt * tt, rand(-0.5, 0.5), rand(0.2, 1), rand(0.3, 0.6), rand(1.2, 2.2), 0.12, 0.4));
          }
        }
      },
      0.12,
    );
    // the last big pop
    this.later(1.7, (fx) => {
      blast(fx, 'cookoff', x, t.y + 1.6, { r: 2, power: 0.9, nx: 0, ny: 1, inGround: false });
      fx.shake(0.2);
    });
    this.addBurner(x, t.y + 1.5, 1.4, 90, tank);
    this.shake(0.7);
    this.screenFlash(0.27, 1, 0.82, 0.58);
    this.aberrate(0.02);
    this.sound.boom('cookoff', x, 1.4);
  }

  // The crew: blood spray, a red mist and pieces that stick where they land.
  // Blood is dark and stays: droplets stain the ground as decals that fade
  // over about a minute, and the pieces rest where they fall.
  gore(x, y, dir, amount = 1) {
    const P = this.p;
    const q = this.q.particleScale;
    if (!PREFS.gore) {
      // no blood: the crew's end is only smoke and dust
      for (let k = 0; k < 7; k++) this.smoke(x + rand(-0.6, 0.6), y + rand(-0.3, 0.6), rand(-4, 4) + dir * 3, rand(0, 5), rand(0.6, 1.2), rand(1, 2), 0.1, 0.55);
      for (let k = 0; k < 4; k++) this.dust(x + rand(-1, 1), y + rand(0, 0.6), rand(-4, 4) + dir * 3, rand(1, 4), rand(0.8, 1.5), rand(1.2, 2.2), 0.45);
      this.sound.hit('thud', x, 0.8);
      return;
    }
    const n = Math.round(80 * amount * q);
    for (let k = 0; k < n; k++) {
      const a = rand(0.1, Math.PI - 0.1) + dir * 0.3;
      const sp = rand(4, 24);
      const i = P.spawn(K.BLOOD, x + rand(-0.4, 0.4), y + rand(-0.2, 0.3), Math.cos(a) * sp + dir * rand(0, 8), Math.sin(a) * sp, rand(0.09, 0.2), rand(1.5, 3), rand(0.055, 0.1), 0.004, 0.003, 1);
      if (i < 0) continue;
      P.grav[i] = 1;
      P.drag[i] = 0.4;
      P.hit[i] = 1;
    }
    // heavy jets
    const nJet = Math.max(3, Math.round(9 * amount * q));
    for (let k = 0; k < nJet; k++) {
      const a = rand(0.35, Math.PI - 0.35) + dir * 0.25;
      const sp = rand(9, 21);
      const i = P.spawn(K.BLOOD, x, y, Math.cos(a) * sp + dir * rand(0, 6), Math.sin(a) * sp, rand(0.2, 0.36), rand(1.4, 2.4), rand(0.05, 0.085), 0.003, 0.003, 1);
      if (i < 0) continue;
      P.grav[i] = 1;
      P.drag[i] = 0.2;
      P.hit[i] = 1;
    }
    for (let k = 0; k < 12; k++) {
      const i = this.smoke(x + rand(-0.6, 0.6), y + rand(-0.3, 0.6), rand(-5, 5) + dir * 3, rand(0, 6), rand(0.8, 1.7), rand(0.7, 1.5), 0, 0.62);
      if (i < 0) continue;
      P.r[i] = 0.16;
      P.g[i] = 0.012;
      P.b[i] = 0.01;
      P.drag[i] = 3;
      P.grav[i] = 0.05;
    }
    // pools and streaks where it came down
    const T = this.terrain;
    if (T) {
      for (let k = 0; k < 8; k++) {
        const px = x + dir * rand(0, 8) + rand(-3.5, 3.5);
        const gy = T.groundBelow(px, y + 2);
        this.decal(1, px, gy, rand(0.6, 1.6), 0, 0.9, 1, 0, rand(0, TAU), rand(1.5, 3));
      }
    }
    const bits = ['gore_helmet', 'gore_boot', 'gore_chunk_0', 'gore_chunk_1', 'gore_chunk_2', 'gore_chunk_3', 'gore_chunk_1', 'gore_chunk_3', 'gore_chunk_0', 'gore_chunk_2'];
    for (const b of bits) {
      const a = rand(0.4, 2.7);
      const sp = rand(7, 22);
      this.addDebris(b, x, y, Math.cos(a) * sp + dir * rand(2, 9), Math.sin(a) * sp, rand(-16, 16), { sticky: b !== 'gore_helmet', blood: b.startsWith('gore_chunk') ? 0 : 0.6, life: rand(40, 70), gore: true, size: b.startsWith('gore_chunk') ? 2 : 1.5, trailBlood: true });
    }
    this.sound.hit('splat', x, 1);
  }

  // Blood and gore switched off: none of it stays in the scene.
  clearGore() {
    const P = this.p;
    for (let i = 0; i < P.n; i++) if (P.kind[i] === K.BLOOD) P.life[i] = 0;
    const D = this.debris;
    for (let i = D.length - 1; i >= 0; i--) if (D[i].gore) D.splice(i, 1);
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
      trailBlood: !!o.trailBlood,
      trail2: 0,
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

  // A heavy piece comes down: dust, earth thrown up, the ground shakes.
  thud(x, y, mass, speed) {
    const k = clamp(speed / 22, 0.3, 1.2) * Math.sqrt(mass);
    const q = this.q.particleScale;
    const n = Math.max(3, Math.round(8 * q * k));
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      this.dust(x + rand(-1, 1), y + rand(0, 0.4), s * rand(3, 11) * k, rand(0.5, 3), rand(1, 2.2) * k, rand(1.6, 3.2), 0.5, 1.4);
    }
    for (let i = 0; i < Math.round(8 * q * k); i++) {
      const a = rand(0.5, Math.PI - 0.5);
      const sp = rand(4, 13) * k;
      this.clod(x, y + 0.3, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.12, 0.3), rand(1, 2));
    }
    this.ring(x, y + 0.2, 10 * k, 0.3, 0.1, 1.0, 0.9, 0.8, true);
    this.shake(0.12 * k);
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
          const big = d.mass > 2 ? 2 : 1;
          d.trail = d.rest ? 0.18 : 0.03;
          this.smoke(d.x, d.y, rand(-0.5, 0.5), rand(0.5, 2), rand(0.3, 0.7) * big, rand(1.2, 2.6) * (big > 1 ? 1.8 : 1), 0.05, 0.7);
          if (!d.rest || Math.random() < 0.5) this.fire(d.x, d.y, rand(-0.5, 0.5), rand(0.5, 2), rand(0.25, 0.6) * big, rand(0.2, 0.45), 0.8);
          if (!d.rest && big > 1) this.ball(d.x, d.y, rand(-1, 1), rand(0, 2), rand(0.5, 0.9), rand(0.5, 0.8), 0.8, 0.5, 0.9, 0.8, 1.5, 0.4);
        }
        d.burn = Math.max(0, d.burn - dt * (d.keep ? 0.01 : 0.03));
      }
      if (d.trailBlood && !d.rest && PREFS.gore) {
        // flying gore leaves a thin trail of blood droplets behind it
        d.trail2 -= dt;
        if (d.trail2 <= 0) {
          d.trail2 = 0.026;
          const P = this.p;
          const j = P.spawn(K.BLOOD, d.x, d.y, rand(-1, 1) + d.vx * 0.05, rand(-1, 1), rand(0.08, 0.15), rand(0.8, 1.6), rand(0.05, 0.09), 0.003, 0.003, 1);
          if (j >= 0) {
            P.grav[j] = 1;
            P.drag[j] = 0.5;
            P.hit[j] = 1;
          }
        }
      }
      if (d.rest) continue;
      d.vy -= g * dt;
      d.vx *= Math.exp(-0.15 * dt);
      const nx = d.x + d.vx * dt;
      const ny = d.y + d.vy * dt;
      if (T.solid(nx, ny - d.r)) {
        const speed = Math.hypot(d.vx, d.vy);
        if (d.sticky) {
          if (d.gore) this.decal(1, nx, ny - d.r, rand(0.6, 1.2), 0, 0.9, 1, 0, rand(0, TAU), rand(1, 2));
          d.rest = true;
          d.y = T.groundBelow(nx, ny + 1) + d.r * 0.6;
          d.x = nx;
          continue;
        }
        if (speed > 6 && d.mass > 0.5) this.sound.hit(d.gore ? 'splat' : 'debris', nx, Math.min(1, speed / 25) * d.mass * 0.5);
        if (d.mass > 2 && speed > 8) this.thud(nx, ny - d.r, d.mass, speed);
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
      b.acc += dt * (28 * k * this.q.particleScale + 4);
      while (b.acc > 1) {
        b.acc -= 1;
        const r = Math.random();
        if (r < 0.4) this.fire(b.x + rand(-1.8, 1.8) * k, b.y + rand(-0.3, 0.6), rand(-0.6, 0.6), rand(2, 5) * k, rand(0.5, 1.3) * k, rand(0.35, 0.8), 0.95);
        else if (r < 0.5) this.ball(b.x + rand(-1.3, 1.3) * k, b.y + rand(-0.2, 0.5), rand(-0.5, 0.5), rand(1.5, 3.5) * k, rand(0.7, 1.1) * k, rand(0.7, 1.1), 0.85, 0.5, 0.9, 0.6, 1.2, 0.5);
        else if (r < 0.86) {
          const j = this.smoke(b.x + rand(-1.2, 1.2), b.y + 1.5 * k, rand(-0.8, 0.8), rand(3, 6), rand(1.3, 2.4) * k, rand(6, 10), rand(0.025, 0.055), 0.85);
          if (j >= 0) P.env[j] = 0.3;
        } else {
          const j = this.ember(b.x + rand(-1.5, 1.5), b.y + rand(0, 1.5), rand(-1.5, 1.5), rand(3, 8), rand(0.04, 0.09), rand(1.5, 3.5), 0.03, 0.7);
          if (j >= 0) P.wind[j] = 1;
        }
      }
      if (Math.random() < dt * 2) {
        P.spawn(K.HEAT, b.x, b.y + 2 * k, 0, 2.5, 4 * k, 1.8, 0, 0, 0, 0.6);
      }
      if (b.voice) b.voice.update(b.x, k);
    }
  }

  // ---- per frame
  update(dt, gravity, wind) {
    this.time += dt;
    this.wind = wind;
    this.dustBudget = 6;
    this.updateProcs(dt);
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
      lights.add(b.x, b.y + 1.2, 2.5, 15 * k + 5, 1.9 * k * f, 1.2 * k * f, 0.5 * k * f, 0.4);
    }
    const A = this.atlas;
    if (A) {
      for (const d of this.debris) {
        const fade = d.life < 1e8 ? clamp((d.life - d.age) / 6, 0, 1) : 1;
        A.put(sprites, d.frame, d.x, d.y, d.rot, d.flip, d.size, d.tint[0], d.tint[1], d.tint[2], d.paint, fade, d.char, d.blood, d.burn * 0.25);
        // a burning piece in the air lights up the smoke around it
        if (d.burn > 0.3 && d.mass > 2 && !d.rest) lights.add(d.x, d.y, 2.5, 12, 2.2, 1.3, 0.5, 0.4);
      }
    }
    return this.p.build();
  }
}

export { pick };
