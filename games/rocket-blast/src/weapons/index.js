// The weapon system: keeps one instance of each weapon (so shots already in
// the air finish their flight after a switch), fires the current one on its
// own cadence, and fires the big FIRE! volley on request.
//
// A weapon module exports a class with:
//   constructor(sys)            sys = { scene, glow, smoke, fx, audio, noise }
//   interval(mega) -> seconds   time between automatic shots
//   fire(ctx, { mega, volley }) launch shots from ctx.muzzle
//   update(dt, t, ctx)          move shots; call ctx.hit(enemy, x, y, info)
//   clear(), dispose()
// ctx = { rocket, muzzle, enemies, bounds, assist (0..1 aim help), hit, mega,
//         rapid, firing, time, nextShot() -> unique id for multi-hit combos }
import { Laser } from './laser.js';
import { Missiles } from './missiles.js';
import { Bubbles } from './bubbles.js';
import { Rainbow } from './rainbow.js';

const KINDS = { laser: Laser, rocket: Missiles, bubble: Bubbles, rainbow: Rainbow };

export class WeaponSystem {
  constructor(sys) {
    this.sys = sys;
    this.weapons = {};
    for (const [id, Kind] of Object.entries(KINDS)) this.weapons[id] = new Kind(sys);
    this.current = 'laser';
    this.cooldown = 0;
  }

  set(id) {
    if (!this.weapons[id]) return;
    this.current = id;
    this.cooldown = Math.min(this.cooldown, 0.05);
  }

  volley(ctx) {
    this.weapons[this.current].fire(ctx, { mega: ctx.mega, volley: true });
  }

  update(dt, t, ctx) {
    const w = this.weapons[this.current];
    this.cooldown -= dt;
    if (ctx.firing && this.cooldown <= 0) {
      w.fire(ctx, { mega: ctx.mega });
      this.cooldown = w.interval(ctx.mega) * (ctx.rapid ? 0.55 : 1) * (ctx.mega ? 1 : ctx.pace ?? 1);
    }
    for (const [id, weapon] of Object.entries(this.weapons)) weapon.update(dt, t, { ...ctx, firing: ctx.firing && id === this.current, active: id === this.current });
  }

  clear() {
    for (const w of Object.values(this.weapons)) w.clear();
  }
}
