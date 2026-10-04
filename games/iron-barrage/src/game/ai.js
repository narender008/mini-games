// The computer commander. Each turn it picks a target, works out a firing
// solution by flying test shots through the same physics and wind, then
// misses like a person: its aim has an error that shrinks as it walks its
// shots onto the same target (bracketing), faster on harder levels. It picks
// weapons with some sense and sometimes repositions first.
import { WORLD, clamp, gauss, rand, DEG } from '../config.js';
import { WEAPONS } from './weapons.js';
import { trajectory } from './projectiles.js';

export const LEVELS = {
  recruit: { name: 'Recruit', angle: 4.5 * DEG, power: 0.09, learn: 0.75, think: 1.7, sense: 0.3, floor: 0.35 },
  regular: { name: 'Regular', angle: 3 * DEG, power: 0.06, learn: 0.62, think: 1.35, sense: 0.6, floor: 0.22 },
  veteran: { name: 'Veteran', angle: 1.8 * DEG, power: 0.038, learn: 0.5, think: 1.05, sense: 0.85, floor: 0.12 },
  elite: { name: 'Elite', angle: 1.0 * DEG, power: 0.022, learn: 0.42, think: 0.85, sense: 1, floor: 0.06 },
};
export const LEVEL_IDS = Object.keys(LEVELS);

const OUT = { x: 0, y: 0, tank: null, t: 0, apex: 0 };

export class Commander {
  constructor(battle, tank, level = 'regular') {
    this.b = battle;
    this.t = tank;
    this.L = LEVELS[level] || LEVELS.regular;
    this.level = level;
    this.memory = new Map(); // target id -> { err, x }
    this.plan = null;
    this.stage = 'idle';
    this.timer = 0;
  }

  begin() {
    this.stage = 'think';
    this.timer = this.L.think * rand(0.6, 1.1);
    this.plan = null;
  }

  // The power (0..1) that lands a shot at this elevation on target x.
  solveFor(elev, target, w) {
    const t = this.t;
    const dir = Math.sign(target.x - t.x) || 1;
    const aim = dir > 0 ? elev : Math.PI - elev;
    const saved = t.aim;
    const savedF = t.facing;
    t.setAim(aim);
    t.pose();
    const mx = t.muzzleX;
    const my = t.muzzleY;
    const realAim = t.aim;
    t.aim = saved;
    t.facing = savedF;
    t.pose();
    let lo = 0.05;
    let hi = 1;
    let best = null;
    for (let i = 0; i < 13; i++) {
      const p = (lo + hi) / 2;
      const sp = WORLD.maxSpeed * (0.12 + 0.88 * p) * (w.speedK ?? 1) * t.gunBonus;
      trajectory(this.b, t, mx, my, Math.cos(realAim) * sp, Math.sin(realAim) * sp, w, OUT);
      const err = OUT.tank === target ? 0 : (OUT.x - target.x) * dir;
      if (!best || Math.abs(err) < Math.abs(best.err)) best = { power: p, aim: realAim, err, x: OUT.x, tank: OUT.tank, t: OUT.t };
      if (OUT.tank === target) break;
      // short (or blocked by ground on the way) -> more power
      if (err < 0) lo = p;
      else hi = p;
    }
    return best;
  }

  think() {
    const t = this.t;
    const foes = this.b.enemies(t);
    if (!foes.length) return null;
    // the nearest threat, preferring the weakest when close in range
    foes.sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x) + (a.hp - b.hp) * 0.08);
    const target = foes[0];
    const w = WEAPONS[this.pickWeapon(target)];
    let best = null;
    for (let e = 18; e <= 78; e += 5) {
      const s = this.solveFor(e * DEG, target, w);
      if (!s) continue;
      const cost = Math.abs(s.err) + s.t * 0.25 + (s.tank && s.tank !== target && s.tank.team === t.team ? 100 : 0);
      if (!best || cost < best.cost) best = { ...s, cost, weapon: w };
    }
    if (!best) return null;
    // human error, shrinking with each shot at the same target
    const mem = this.memory.get(target.id) || { err: 1, x: target.x };
    if (Math.abs(mem.x - target.x) > 6) mem.err = Math.min(1, mem.err + 0.4);
    const k = Math.max(this.L.floor, mem.err);
    const aimErr = gauss() * this.L.angle * k;
    const powErr = gauss() * this.L.power * k;
    mem.err *= this.L.learn;
    mem.x = target.x;
    this.memory.set(target.id, mem);
    best.aim = clamp(best.aim + aimErr, 0, Math.PI);
    best.power = clamp(best.power + powErr, 0.05, 1);
    best.target = target;
    return best;
  }

  pickWeapon(target) {
    const inv = this.t.inventory;
    const sense = this.L.sense;
    const d = Math.abs(target.x - this.t.x);
    const has = (id) => inv[id] > 0 && WEAPONS[id];
    const roll = Math.random();
    if (has('heavy') && roll < 0.35 * sense) return 'heavy';
    if (has('cluster') && d > 40 && roll > 1 - 0.3 * sense) return 'cluster';
    return 'shell';
  }

  update(dt) {
    const t = this.t;
    if (this.stage === 'think') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.plan = this.think();
        if (!this.plan) {
          this.stage = 'idle';
          this.b.fire(t);
          return;
        }
        t.weapon = this.plan.weapon.id;
        this.stage = 'aim';
        this.timer = 0;
      }
      return;
    }
    if (this.stage === 'aim') {
      const p = this.plan;
      this.timer += dt;
      // swing the turret and set the charge like a gunner would
      const da = p.aim - t.aim;
      const step = 1.4 * dt;
      t.setAim(t.aim + clamp(da, -step, step));
      t.power += clamp(p.power - t.power, -0.6 * dt, 0.6 * dt);
      if ((Math.abs(da) < 0.002 && Math.abs(p.power - t.power) < 0.004) || this.timer > 4) {
        t.setAim(p.aim);
        t.power = p.power;
        this.stage = 'fire';
        this.timer = rand(0.25, 0.5);
      }
      return;
    }
    if (this.stage === 'fire') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.stage = 'idle';
        if (!this.b.fire(t)) {
          t.weapon = 'shell';
          this.b.fire(t);
        }
      }
    }
  }
}
