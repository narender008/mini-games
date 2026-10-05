// Device quality tiers. The starting tier comes from a quick look at the
// device; the frame governor then trims the render scale if frames run long
// and gives it back when there is headroom. ?quality=high|medium|low forces
// a tier.
import { QUERY } from './config.js';

const TIERS = {
  high: { tier: 'high', maxDpr: 2, maxPixels: 4.4e6, lights: 32, bloomLevels: 5, particles: 7000, particleScale: 1, distort: true, grain: true, fieldRes: 2 },
  medium: { tier: 'medium', maxDpr: 1.5, maxPixels: 2.4e6, lights: 20, bloomLevels: 4, particles: 4500, particleScale: 0.75, distort: true, grain: true, fieldRes: 2 },
  low: { tier: 'low', maxDpr: 1.15, maxPixels: 1.3e6, lights: 12, bloomLevels: 3, particles: 2600, particleScale: 0.5, distort: false, grain: false, fieldRes: 1 },
};

// The tier chosen on the Settings screen ('auto' or unset: none). The save is
// plain JSON under 'iron-barrage' (see game/progress.js); ?quality= still wins.
export function savedQuality() {
  try {
    const q = JSON.parse(localStorage.getItem('iron-barrage'))?.settings?.quality;
    return TIERS[q] ? q : null;
  } catch {
    return null;
  }
}

export function detectQuality() {
  const forced = QUERY.get('quality') || savedQuality();
  if (forced && TIERS[forced]) return { ...TIERS[forced], scale: 1 };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = coarse || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  let tier = 'high';
  if (mobile) tier = mem <= 3 || cores <= 4 ? 'low' : 'medium';
  else if (mem <= 4 || cores <= 4) tier = 'medium';
  return { ...TIERS[tier], scale: 1 };
}

// Watches frame times against the display's own refresh period and lowers the
// render scale when frames run clearly longer, raising it again when there is
// room. The 75th percentile ignores the odd long frame but reacts to a steady
// slowdown within a couple of seconds; the 10th percentile, kept as a running
// minimum, is the refresh period (60, 90, 120 Hz...). If three steps down do
// not shorten the frames (the screen is held at 30 Hz, or the cost is not
// pixels) they are undone and not tried again for a while, and a raise that
// had to be taken back makes the next one wait longer, so the scale does not
// hunt.
export class FrameGovernor {
  constructor(q, onScale) {
    this.q = q;
    this.onScale = onScale;
    this.samples = new Float32Array(90);
    this.sorted = new Float32Array(90); // scratch: judging allocates nothing
    this.i = 0;
    this.n = 0; // fresh samples in the window
    this.cooldown = 3;
    this.period = 1 / 45; // refresh period: starts high, falls to what the display shows
    this.from = 0; // scale where the current run of lowerings last paid off (0: no run)
    this.before = 0; // p75 there
    this.lowerHold = 0; // seconds in which no lowering is tried
    this.lowerBackoff = 30;
    this.raiseHold = 0;
    this.raiseBackoff = 8;
    this.lastUp = false;
  }

  sample(dt) {
    if (!(dt > 0) || dt > 0.25) return;
    this.samples[this.i++ % this.samples.length] = dt;
    if (this.n < this.samples.length) this.n++;
    this.cooldown -= dt;
    this.lowerHold -= dt;
    this.raiseHold -= dt;
    if (this.cooldown > 0 || this.n < this.samples.length) return;
    this.cooldown = 0.5; // judged twice a second, not every frame
    const s = this.sorted;
    s.set(this.samples);
    s.sort();
    const p10 = s[Math.floor(s.length * 0.1)];
    const p75 = s[Math.floor(s.length * 0.75)];
    this.period = Math.max(1 / 250, Math.min(this.period, p10));
    const q = this.q;
    let next = q.scale;
    if (p75 <= this.period * 1.25) {
      this.from = 0;
      if (p75 < this.period * 1.08 && q.scale < 1 && this.raiseHold <= 0) {
        next = Math.min(1, q.scale + 0.05);
        this.lastUp = true;
        this.raiseHold = 5; // see how it holds before the next step up
      }
    } else if (this.from && p75 >= this.before * 0.95 && q.scale <= this.from - 0.25) {
      // no shorter after three steps: pixels are not the cost, so take them back
      next = this.from;
      this.from = 0;
      this.lowerHold = this.lowerBackoff;
      this.lowerBackoff = Math.min(240, this.lowerBackoff * 2);
      // frames that stayed long at full size: the display runs slower than thought
      if (p10 > this.period * 1.4) this.period = p10;
    } else if (this.lowerHold <= 0 && q.scale > 0.55) {
      if (!this.from || p75 < this.before * 0.95) {
        this.from = q.scale;
        this.before = p75;
      }
      next = Math.max(0.55, q.scale - 0.1);
      if (this.lastUp) this.raiseBackoff = Math.min(120, this.raiseBackoff * 2);
      this.lastUp = false;
      this.raiseHold = this.raiseBackoff;
    }
    if (next !== q.scale) {
      q.scale = next;
      this.onScale();
      this.cooldown = 2.5;
      this.n = 0; // judge the new scale on frames drawn at it
    }
  }
}
