// A Spring whose kicks are given over a few frames instead of in one.
//
// A one-frame `kick(v)` makes the spring's speed jump, which shows as a twitch (a mirror or an
// antenna that flicks, a body that drops with a jolt). Here the kick goes through two quick
// filters first, so the speed swells from nothing to its full size in about 60 ms and the motion
// that follows is as springy as ever. What is kicked in one frame adds up: a second kick while the
// first is being given just joins it. Everything else works as in Spring.
import { Spring } from './anim.js';

export class SoftSpring extends Spring {
  constructor(value = 0, freq = 3, zeta = 0.6, rate = 32) {
    super(value, freq, zeta);
    this.rate = rate; // how fast a kick swells in (1/s): the bigger, the sharper
    this.q = 0; // what has been kicked and not yet passed on
    this.r = 0; // what is on its way
  }

  kick(v) {
    this.q += v;
  }

  update(target, dt) {
    if (this.q !== 0 || this.r !== 0) {
      const c = 1 - Math.exp(-dt * this.rate);
      const a = this.q * c;
      this.q -= a;
      this.r += a;
      const b = this.r * c;
      this.r -= b;
      this.v += b;
      if (Math.abs(this.q) < 1e-6 && Math.abs(this.r) < 1e-6) {
        this.v += this.q + this.r;
        this.q = 0;
        this.r = 0;
      }
    }
    return super.update(target, dt);
  }
}
