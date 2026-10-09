// Every creature on the road lives in one pool of typed arrays (no objects per
// enemy, no allocation per frame). A slot's (x, y) is the ground under its
// feet; bullets hit a circle `hitY` above that. The type table holds the
// numbers and the art names; behaviour is in `update`.
import { ARENA, BAND, clamp, rnd, rand, TAU } from '../config.js';

// blood colours (linear-ish rgb) by creature
const RED = [0.42, 0.015, 0.02];
const DARK = [0.3, 0.01, 0.015];
const PURPLE = [0.13, 0.02, 0.16];
const BLUE = [0.05, 0.22, 0.42];
const TOXIC = [0.2, 0.42, 0.02];
const ORANGE = [0.5, 0.08, 0.01];
const GOLD = [0.55, 0.36, 0.04];
const VILE = [0.3, 0.03, 0.1];

export const TYPES = [
  // 0
  { key: 'shambler', hp: 32, speed: 43, r: 20, hitY: 40, hr: 26, mass: 1, dmg: 12, reach: 29, wind: 0.42, cool: 0.9, xp: 3,
    anim: 'shambler_walk', fps: 7, headless: 'shambler_nohead', attack: 'shambler_attack', gib: 'shambler', blood: RED, shadow: 30 },
  // 1
  { key: 'runner', hp: 20, speed: 112, r: 18, hitY: 35, hr: 22, mass: 0.8, dmg: 9, reach: 23, wind: 0.22, cool: 0.7, xp: 3,
    anim: 'runner_walk', fps: 13, headless: 'runner_nohead', attack: 'runner_attack', gib: 'runner', blood: RED, shadow: 26, fallback: 'shambler' },
  // 2
  { key: 'brute', hp: 240, speed: 36, r: 35, hitY: 59, hr: 43, mass: 4, dmg: 20, reach: 39, wind: 0.6, cool: 1.2, xp: 16,
    anim: 'brute_walk', fps: 6, headless: 'brute_nohead', attack: 'brute_attack', gib: 'brute', blood: DARK, shadow: 49, fallback: 'shambler', big: true, crate: 0.3, surge: 0.14, extra: ['brute_horn'] },
  // 3
  { key: 'spider', hp: 8, speed: 80, r: 15, hitY: 14, hr: 18, mass: 0.35, dmg: 5, reach: 18, wind: 0.18, cool: 0.6, xp: 1,
    anim: 'spider_walk', fps: 16, gib: 'spider', blood: PURPLE, shadow: 22, fallback: 'shambler', small: true },
  // 4
  { key: 'spitter', hp: 60, speed: 36, r: 23, hitY: 38, hr: 28, mass: 1.4, dmg: 10, reach: 26, wind: 0.5, cool: 1.0, xp: 7,
    anim: 'spitter_walk', fps: 7, attack: 'spitter_attack', gib: 'spitter', blood: BLUE, shadow: 32, fallback: 'shambler', ranged: true, extra: ['spitter_eye'] },
  // 5: the chapter 1 boss; its behaviour is in boss.js
  { key: 'ogre', hp: 110000, speed: 48, r: 108, hitY: 230, hr: 150, mass: 60, dmg: 30, reach: 78, wind: 0.6, cool: 1, xp: 300,
    anim: 'ogre_walk', fps: 5, gib: 'ogre', blood: RED, shadow: 190, fallback: 'shambler', boss: true },
  // 6: bloated with toxic boils: swells up and bursts beside the hero, and bursts when killed (`burst` = blast radius),
  // so a pack of them goes up in a chain
  { key: 'exploder', hp: 46, speed: 58, r: 24, hitY: 46, hr: 30, mass: 1.6, dmg: 20, reach: 30, wind: 0.6, cool: 0.5, xp: 5,
    anim: 'exploder_walk', fps: 8, attack: 'exploder_attack', gib: 'exploder', blood: TOXIC, shadow: 46, fallback: 'shambler', burst: 96, extra: ['exploder_boil'] },
  // 7: a tower shield soaks bullets until it breaks (`armor`); fire gets round it, blasts half round it
  { key: 'knight', hp: 70, armor: 170, speed: 33, r: 24, hitY: 40, hr: 32, mass: 2.6, dmg: 17, reach: 32, wind: 0.5, cool: 1.0, xp: 9,
    anim: 'knight_walk', bare: 'knight_bare', bareAttack: 'knight_bare_attack', fps: 6, attack: 'knight_attack', gib: 'knight', blood: DARK, shadow: 34, fallback: 'shambler', extra: ['knight_plate'], surge: 0.03 },
  // 8: flies over the wrecks and the horde, weaving
  { key: 'imp', hp: 18, speed: 92, r: 16, hitY: 58, hr: 24, mass: 0.4, dmg: 8, reach: 26, wind: 0.3, cool: 0.8, xp: 3,
    anim: 'imp_fly', fps: 12, attack: 'imp_attack', gib: 'imp', blood: ORANGE, shadow: 18, fallback: 'spider', fly: true, parts: ['imp_head', 'imp_wing', 'imp_wing', 'imp_torso'] },
  // 9: gallops in and pounces from a few strides out
  { key: 'hound', hp: 58, speed: 136, r: 24, hitY: 60, hr: 34, mass: 1.5, dmg: 14, reach: 30, wind: 0.24, cool: 0.8, xp: 6,
    anim: 'hound_run', fps: 12, attack: 'hound_attack', gib: 'hound', blood: DARK, shadow: 40, fallback: 'runner', parts: ['hound_head', 'hound_leg', 'hound_leg', 'hound_torso'] },
  // 10, 11: the chapter 2 and 3 bosses (bosses/demon.js, bosses/abomination.js)
  { key: 'demon', hp: 90000, speed: 50, r: 90, hitY: 215, hr: 150, mass: 60, dmg: 26, reach: 70, wind: 0.6, cool: 1, xp: 400,
    anim: 'demon_float', fps: 6, gib: 'demon', blood: GOLD, shadow: 150, fallback: 'ogre', boss: true, fly: true },
  { key: 'abom', hp: 120000, speed: 40, r: 115, hitY: 240, hr: 160, mass: 80, dmg: 34, reach: 86, wind: 0.6, cool: 1, xp: 500,
    anim: 'abom_walk', fps: 4, gib: 'abom', blood: VILE, shadow: 200, fallback: 'ogre', boss: true },
];
// how hard each kind homes in on the hero (far up the road, and the extra close by), and how it weaves
const STEER = { runner: [0.25, 1], spider: [0.35, 0.8, 0.8, 6], exploder: [0.15, 1], imp: [0.3, 0.9, 0.9, 2.6], hound: [0.4, 1] };
for (const t of TYPES) {
  const [home, homeNear, weave, weaveF] = STEER[t.key] || [0.08, 0.9];
  Object.assign(t, { home, homeNear, weave: weave || 0, weaveF: weaveF || 0 });
}
export const T = Object.fromEntries(TYPES.map((t, i) => [t.key, i]));

// states
export const WALK = 0;
export const WIND = 1;
export const RECOVER = 2;
export const HEADLESS = 3;
export const HOLD = 4;
export const SPIT = 5;
export const BOSS = 6;

export class Enemies {
  constructor(cap) {
    this.cap = cap;
    const F = () => new Float32Array(cap);
    this.x = F();
    this.y = F();
    this.px = F();
    this.py = F();
    this.kx = F(); // knockback velocity
    this.ky = F();
    this.hp = F();
    this.maxHp = F();
    this.t = F(); // state timer
    this.anim = F(); // walk phase in frames
    this.flash = F();
    this.frozen = F();
    this.slow = F();
    this.burn = F(); // seconds left on fire (the flamethrower)
    this.burnT = F(); // time to the next burn tick
    this.burnDps = F(); // how hot it burns
    this.armor = F(); // what is left of a knight's shield
    this.aux = F(); // a behaviour timer of its own (a hound's pounce)
    this.holdY = F();
    this.seed = F();
    this.scale = F();
    this.spd = F(); // own speed multiplier
    this.type = new Uint8Array(cap);
    this.state = new Uint8Array(cap);
    this.alive = new Uint8Array(cap);
    this.flip = new Int8Array(cap);
    this.elite = new Uint8Array(cap);
    this.dying = new Uint8Array(cap); // headless bodies: drawn and moving, not hittable
    this.gen = new Int32Array(cap);
    this.list = new Int32Array(cap); // active slots
    this.at = new Int32Array(cap); // position of a slot in `list`
    this.n = 0;
    this.free = new Int32Array(cap);
    this.nFree = cap;
    for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i;
  }

  reset() {
    for (let k = 0; k < this.n; k++) this.alive[this.list[k]] = 0;
    this.n = 0;
    this.nFree = this.cap;
    for (let i = 0; i < this.cap; i++) this.free[i] = this.cap - 1 - i;
  }

  spawn(type, x, y, hpMul = 1, elite = 0, spdMul = 1) {
    if (!this.nFree) return -1;
    const i = this.free[--this.nFree];
    const T0 = TYPES[type];
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.kx[i] = this.ky[i] = 0;
    this.maxHp[i] = this.hp[i] = T0.hp * hpMul * (elite ? 4 : 1);
    this.t[i] = 0;
    this.anim[i] = rnd() * 8;
    this.flash[i] = 0;
    this.frozen[i] = 0;
    this.slow[i] = 0;
    this.burn[i] = 0;
    this.burnT[i] = 0;
    this.burnDps[i] = 0;
    this.armor[i] = (T0.armor || 0) * hpMul * (elite ? 3 : 1);
    this.aux[i] = rand(0.5, 1.5);
    this.seed[i] = rnd();
    this.scale[i] = (elite ? 1.3 : 1) * (0.93 + rnd() * 0.14);
    this.spd[i] = (0.88 + rnd() * 0.24) * spdMul;
    this.holdY[i] = T0.ranged ? rand(250, 600) : 0;
    this.type[i] = type;
    this.state[i] = T0.boss ? BOSS : WALK;
    this.alive[i] = 1;
    this.flip[i] = rnd() < 0.5 ? -1 : 1;
    this.elite[i] = elite;
    this.dying[i] = 0;
    this.gen[i]++;
    this.at[i] = this.n;
    this.list[this.n++] = i;
    return i;
  }

  remove(i) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    const k = this.at[i];
    const last = this.list[--this.n];
    this.list[k] = last;
    this.at[last] = k;
    this.free[this.nFree++] = i;
  }

  // Movement, separation, attacks. `run` gives the hero, the grid and the
  // ways to hurt the hero and fire acid.
  update(dt, run) {
    const { x, y, kx, ky, type, state, t, frozen } = this;
    const hero = run.hero;
    const hx = hero.x;
    const hy = hero.y;
    const grid = run.grid;
    const items = grid.items;
    const start = grid.start;
    const cols = grid.cols;
    const slowAll = run.timeSlow; // freeze aura etc.
    for (let k = 0; k < this.n; k++) {
      const i = this.list[k];
      this.px[i] = x[i];
      this.py[i] = y[i];
      const T0 = TYPES[type[i]];
      if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt * 7);
      // knockback slides even when frozen
      const kd = Math.exp(-9 * dt);
      x[i] += kx[i] * dt;
      y[i] += ky[i] * dt;
      kx[i] *= kd;
      ky[i] *= kd;
      if (T0.boss) continue; // boss.js moves (and thaws) the boss
      if (frozen[i] > 0) {
        frozen[i] -= dt;
        continue;
      }
      const sl = this.slow[i] > 0 ? 0.45 : 1;
      if (this.slow[i] > 0) this.slow[i] -= dt;
      const st = state[i];
      t[i] -= dt;
      const dx = hx - x[i];
      const dy = hy - y[i];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const reach = T0.r + 18 + T0.reach;
      let sp = T0.speed * this.spd[i] * sl * slowAll;
      let mx = 0;
      let my = 0;
      if (st === WALK || st === HEADLESS) {
        if (st === HEADLESS) {
          // a decapitated body staggers on, drifting, then drops (run.js finishes it)
          mx = Math.sin(this.seed[i] * 40 + t[i] * 9) * 0.6;
          my = 0.8;
          sp *= 0.6;
          if (t[i] <= 0) {
            run.collapse(i);
            continue;
          }
        } else if (T0.ranged && !run.mopUp && y[i] >= this.holdY[i] && hy - y[i] > 220) {
          state[i] = HOLD;
          t[i] = rand(0.6, 1.6);
        } else {
          // head down the road; home in on the hero more the closer they get
          const near = run.mopUp ? 1 : clamp((y[i] - 200) / 700, 0, 1);
          const home = T0.home + near * T0.homeNear;
          if (run.mopUp) sp *= 1.6;
          mx = (dx / d) * home;
          // mopping up, a straggler knocked past the hero turns back for him
          my = run.mopUp ? dy / d : Math.max(dy / d, 0.15) * (1 - home * 0.3) + 0.2;
          if (T0.weave) mx += Math.sin(run.time * T0.weaveF + this.seed[i] * TAU) * T0.weave; // spiders zig-zag, imps swoop
          if (T0.key === 'hound') {
            // a pounce: a burst of speed straight at the hero from a few strides out
            this.aux[i] -= dt;
            if (this.aux[i] < -0.4) this.aux[i] = rand(1.1, 2.0);
            else if (this.aux[i] < 0) sp *= 2.3;
            else if (d < 300 && d > reach + 40 && this.aux[i] > 0.6) this.aux[i] = 0;
          }
          const l = Math.sqrt(mx * mx + my * my) || 1;
          mx /= l;
          my /= l;
          if (d < reach && hero.alive) {
            state[i] = WIND;
            t[i] = T0.wind;
            mx = my = 0;
            if (T0.burst) run.sound.exploderSwell?.(run.pan(x[i]));
          }
        }
      } else if (st === WIND) {
        if (T0.burst) {
          // swelling up: it waddles on toward the hero, then goes off wherever it is
          if (t[i] <= 0) {
            run.burstNow(i);
            continue;
          }
          mx = dx / d;
          my = dy / d;
          sp *= 0.35;
        } else if (t[i] <= 0) {
          if (d < reach + 14) run.hitHero(T0.dmg * (this.elite[i] ? 1.3 : 1), x[i], y[i]);
          state[i] = RECOVER;
          t[i] = T0.cool * 0.5;
        }
      } else if (st === RECOVER) {
        if (t[i] <= 0) state[i] = WALK;
      } else if (st === HOLD) {
        // spitters keep their line, sidle toward the hero's x and spit
        mx = clamp(dx / 300, -0.5, 0.5);
        sp *= 0.6;
        if (t[i] <= 0) {
          state[i] = SPIT;
          t[i] = T0.wind;
        }
        if (hy - y[i] < 160 || run.mopUp) state[i] = WALK;
      } else if (st === SPIT) {
        if (t[i] <= 0) {
          run.spit(i);
          state[i] = HOLD;
          t[i] = rand(1.8, 2.8);
        }
      }
      x[i] += mx * sp * dt;
      y[i] += my * sp * dt;
      if (mx || my) this.anim[i] += dt * T0.fps * (sp / (T0.speed + 1e-3)) * (0.7 + 0.3 * this.spd[i]);
    }
    // separation: push overlapping creatures apart (cheap, position based)
    for (let k = 0; k < this.n; k++) {
      const i = this.list[k];
      const Ti = TYPES[type[i]];
      if (Ti.boss) continue;
      const ri = Ti.r * this.scale[i];
      const fly = Ti.fly;
      const c0 = grid.cx(x[i] - 40);
      const c1 = grid.cx(x[i] + 40);
      const r0 = grid.cy(y[i] - 40);
      const r1 = grid.cy(y[i] + 40);
      let sx = 0;
      let sy = 0;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cc = r * cols + c;
          for (let m = start[cc]; m < start[cc + 1]; m++) {
            const j = items[m];
            if (j === i || !this.alive[j]) continue;
            const Tj = TYPES[type[j]];
            if (Tj.fly !== fly) continue; // flyers pass over the horde
            const ddx = x[i] - x[j];
            const ddy = y[i] - y[j];
            const rr = ri + Tj.r * this.scale[j];
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 >= rr * rr || d2 < 1e-6) continue;
            const dd = Math.sqrt(d2);
            const push = (rr - dd) / dd;
            // heavier creatures shove lighter ones
            const w = Tj.mass / (Ti.mass + Tj.mass);
            sx += ddx * push * w;
            sy += ddy * push * w;
          }
        }
      }
      x[i] += sx * 0.5;
      y[i] += sy * 0.35;
      // keep off the hero and inside the road
      const hdx = x[i] - hx;
      const hdy = y[i] - hy;
      const hr = ri + 16;
      const h2 = hdx * hdx + hdy * hdy;
      if (h2 < hr * hr && h2 > 1e-6) {
        const hd = Math.sqrt(h2);
        x[i] += (hdx / hd) * (hr - hd);
        y[i] += (hdy / hd) * (hr - hd);
      }
      // wrecks and barriers in play: pushed out of the footprint; one that meets it
      // head on slides along it toward the nearer end, so the horde flows round (toward the
      // far end when the nearer one is off the field, as with the Graveyard's corner crypts)
      const ob = fly ? null : run.obstacles;
      if (ob) {
        const pad = ri * 0.6;
        for (let o = 0; o < ob.length; o += 4) {
          const odx = x[i] - ob[o];
          const ody = y[i] - ob[o + 1];
          const ex = ob[o + 2] + pad;
          const ey = ob[o + 3] + pad;
          if (odx >= ex || odx <= -ex || ody >= ey || ody <= -ey) continue;
          let sx = odx > 0 || (odx === 0 && this.seed[i] > 0.5) ? 1 : -1;
          let px = ex - Math.abs(odx);
          const end = ob[o] + sx * ex;
          if (end < 8 || end > ARENA.w - 8) {
            sx = -sx;
            px = Infinity;
          }
          const py = ey - Math.abs(ody);
          if (px < py) x[i] += sx * px;
          else {
            y[i] += (ody > 0 ? 1 : -1) * py;
            x[i] += sx * Math.min(px, 110 * dt);
          }
        }
      }
      x[i] = clamp(x[i], 8, ARENA.w - 8);
      if (y[i] > BAND.y1 + 20) y[i] = BAND.y1 + 20;
    }
  }
}
