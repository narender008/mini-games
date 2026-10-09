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

export const TYPES = [
  // 0
  { key: 'shambler', hp: 32, speed: 43, r: 20, hitY: 40, hr: 26, mass: 1, dmg: 12, reach: 29, wind: 0.42, cool: 0.9, xp: 3,
    anim: 'shambler_walk', fps: 7, headless: 'shambler_nohead', attack: 'shambler_attack', gib: 'shambler', blood: RED, shadow: 30 },
  // 1
  { key: 'runner', hp: 20, speed: 150, r: 18, hitY: 35, hr: 22, mass: 0.8, dmg: 9, reach: 23, wind: 0.22, cool: 0.7, xp: 3,
    anim: 'runner_walk', fps: 13, headless: 'runner_nohead', attack: 'runner_attack', gib: 'runner', blood: RED, shadow: 26, fallback: 'shambler' },
  // 2
  { key: 'brute', hp: 240, speed: 36, r: 35, hitY: 59, hr: 43, mass: 4, dmg: 20, reach: 39, wind: 0.6, cool: 1.2, xp: 16,
    anim: 'brute_walk', fps: 6, headless: 'brute_nohead', attack: 'brute_attack', gib: 'brute', blood: DARK, shadow: 49, fallback: 'shambler', big: true },
  // 3
  { key: 'spider', hp: 8, speed: 106, r: 15, hitY: 14, hr: 18, mass: 0.35, dmg: 5, reach: 18, wind: 0.18, cool: 0.6, xp: 1,
    anim: 'spider_walk', fps: 16, gib: 'spider', blood: PURPLE, shadow: 22, fallback: 'shambler', small: true },
  // 4
  { key: 'spitter', hp: 60, speed: 36, r: 23, hitY: 38, hr: 28, mass: 1.4, dmg: 10, reach: 26, wind: 0.5, cool: 1.0, xp: 7,
    anim: 'spitter_walk', fps: 7, attack: 'spitter_attack', gib: 'spitter', blood: BLUE, shadow: 32, fallback: 'shambler', ranged: true },
  // 5: the chapter 1 boss; its behaviour is in boss.js
  { key: 'ogre', hp: 110000, speed: 48, r: 108, hitY: 230, hr: 150, mass: 60, dmg: 30, reach: 78, wind: 0.6, cool: 1, xp: 300,
    anim: 'ogre_walk', fps: 5, gib: 'ogre', blood: RED, shadow: 190, fallback: 'shambler', boss: true },
];
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
    this.maxHp[i] = this.hp[i] = T0.hp * hpMul * (elite ? 5 : 1);
    this.t[i] = 0;
    this.anim[i] = rnd() * 8;
    this.flash[i] = 0;
    this.frozen[i] = 0;
    this.slow[i] = 0;
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
      if (frozen[i] > 0) {
        frozen[i] -= dt;
        continue;
      }
      if (T0.boss) continue; // boss.js moves the boss
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
        } else if (T0.ranged && y[i] >= this.holdY[i] && hy - y[i] > 220) {
          state[i] = HOLD;
          t[i] = rand(0.6, 1.6);
        } else {
          // head down the road; home in on the hero more the closer they get
          const near = clamp((y[i] - 200) / 700, 0, 1);
          const home = type[i] === 1 ? 0.25 + near : type[i] === 3 ? 0.35 + near * 0.8 : 0.08 + near * 0.9;
          mx = (dx / d) * home;
          my = Math.max(dy / d, 0.15) * (1 - home * 0.3) + 0.2;
          if (type[i] === 3) mx += Math.sin(run.time * 6 + this.seed[i] * TAU) * 0.8; // spiders zig-zag
          const l = Math.sqrt(mx * mx + my * my) || 1;
          mx /= l;
          my /= l;
          if (d < reach && hero.alive) {
            state[i] = WIND;
            t[i] = T0.wind;
            mx = my = 0;
          }
        }
      } else if (st === WIND) {
        if (t[i] <= 0) {
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
        if (hy - y[i] < 160) state[i] = WALK;
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
      if (TYPES[type[i]].boss) continue;
      const ri = TYPES[type[i]].r * this.scale[i];
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
            const ddx = x[i] - x[j];
            const ddy = y[i] - y[j];
            const rr = ri + TYPES[type[j]].r * this.scale[j];
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 >= rr * rr || d2 < 1e-6) continue;
            const dd = Math.sqrt(d2);
            const push = (rr - dd) / dd;
            // heavier creatures shove lighter ones
            const w = TYPES[type[j]].mass / (TYPES[type[i]].mass + TYPES[type[j]].mass);
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
      x[i] = clamp(x[i], 8, ARENA.w - 8);
      if (y[i] > BAND.y1 + 20) y[i] = BAND.y1 + 20;
    }
  }
}
