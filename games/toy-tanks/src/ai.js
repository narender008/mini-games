// The computer tank. It aims the way a friendly grown-up plays with a child:
// it works out a good shot (trying the real flight, wind and all), then
// misses by a human amount that depends on the level, a bit more on its first
// shot and a bit less as it "gets its eye in". Easy often lands short or
// long; hard usually splats you. It never shows off.
import { clamp, rand } from './config.js';
import { launchVelocity } from './sim.js';

const SPREAD = { easy: 0.3, medium: 0.15, hard: 0.06 };
// how much of the wind it allows for (people underestimate the wind)
const WIND_SENSE = { easy: 0.35, medium: 0.7, hard: 0.95 };

// gaussian-ish noise, -1..1 mostly
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;

export class Brain {
  constructor(level) {
    this.level = level;
    this.shots = 0;
    this._v = { x: 0, y: 0 };
    this._land = { x: 0, y: 0, t: 0, shape: null };
    this._pts = new Float32Array(400);
  }

  // Plan a shot from `me` at `target` (both sides). flight: for predict();
  // world.wind is the true wind. Returns { angle, power } in the tank's frame.
  plan(flight, world, me, target, muzzleAt) {
    const level = this.level;
    const wind = world.wind;
    // aim for the target tank, plus a human miss that shrinks with practice
    const settle = Math.max(0.45, 1 - this.shots * 0.14);
    const miss = SPREAD[level] * settle * gauss();
    const aimX = target.x + miss;
    // it judges the wind imperfectly
    world.wind = wind * WIND_SENSE[level];
    // a nice high lob, varied so it doesn't look robotic
    const angle = clamp(rand(0.72, 1.05), 0.3, 1.35);
    let lo = 0;
    let hi = 1;
    let best = 0.6;
    let bestErr = Infinity;
    for (let i = 0; i < 22; i++) {
      const p = (lo + hi) / 2;
      const m = muzzleAt(angle);
      launchVelocity(angle, p, me.facing, this._v);
      flight.predict(me.ball, m.x, m.y, this._v.x, this._v.y, this._pts, 8, 180, this._land, flight.shapes, me.view);
      const err = this._land.x - aimX;
      if (Math.abs(err) < bestErr) {
        bestErr = Math.abs(err);
        best = p;
      }
      // further along the facing means too strong
      if (err * me.facing > 0) hi = p;
      else lo = p;
    }
    world.wind = wind;
    this.shots++;
    return { angle, power: clamp(best + gauss() * 0.01, 0.02, 1) };
  }

  // a nudge now and then: drive a little to a new spot (-1, 0 or 1 times
  // the drive allowance, in the tank's facing)
  drive(me) {
    if (this.shots === 0) return 0;
    return Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.8) : 0;
  }
}
