// Device quality tiers. The starting tier comes from a quick look at the
// device; the frame governor then trims the render scale if frames run long
// and gives it back when there is headroom. ?quality=high|medium|low forces a
// tier (as does the Settings screen). `msaa` is unused (sprites are drawn
// with their own soft alpha edges).
import { QUERY } from './config.js';

const TIERS = {
  high: { tier: 'high', maxDpr: 2, maxPixels: 3.6e6, lights: 32, bloomLevels: 5, particles: 9000, gibs: 700, paintRes: 1.5, groundRes: 1, numbers: 220 },
  medium: { tier: 'medium', maxDpr: 1.5, maxPixels: 2.8e6, lights: 20, bloomLevels: 4, particles: 6000, gibs: 450, paintRes: 1.25, groundRes: 0.8, numbers: 160 },
  low: { tier: 'low', maxDpr: 1.15, maxPixels: 1.4e6, lights: 10, bloomLevels: 3, particles: 3500, gibs: 260, paintRes: 1, groundRes: 0.6, numbers: 100 },
};

export function savedQuality() {
  try {
    const q = JSON.parse(localStorage.getItem('horde-buster'))?.settings?.quality;
    return TIERS[q] ? q : null;
  } catch {
    return null;
  }
}

export function detectQuality() {
  const forced = QUERY.get('quality') || savedQuality();
  if (forced && TIERS[forced]) return { ...TIERS[forced], scale: 1, forced: true };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = coarse || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  let tier = 'high';
  if (mobile) tier = mem <= 3 || cores <= 4 ? 'low' : 'medium';
  else if (mem <= 4 || cores <= 4) tier = 'medium';
  return { ...TIERS[tier], scale: 1, forced: false };
}

export function tierSettings(name) {
  return TIERS[name] || null;
}

// Watches frame times against the display's refresh period and lowers the
// render scale when frames run clearly longer, raising it again when there is
// room. The 75th percentile ignores the odd long frame but reacts to a steady
// slowdown within a couple of seconds; the 10th percentile, kept as a running
// minimum, is the refresh period, never taken below a 60 fps frame (a 90 or
// 120 Hz screen is not chased with fewer pixels). If three steps down (or as
// many as the floor allows) do not shorten the frames (the screen is held at
// 30 Hz, or the cost is not pixels) they are undone and not tried again for a
// while; frames that stay long with nothing left to lower mean the display
// runs slower than thought. A raise that had to be taken back makes the next
// one wait longer, so the scale does not hunt.
const MIN_SCALE = 0.55;

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
    this.period = Math.max(1 / 60, Math.min(this.period, p10));
    const q = this.q;
    let next = q.scale;
    if (p75 <= this.period * 1.25) {
      this.from = 0;
      if (p75 < this.period * 1.08 && q.scale < 1 && this.raiseHold <= 0) {
        next = Math.min(1, q.scale + 0.05);
        this.lastUp = true;
        this.raiseHold = 5; // see how it holds before the next step up
      }
    } else if (this.from && p75 >= this.before * 0.95 && q.scale <= Math.max(MIN_SCALE, this.from - 0.25) + 1e-6) {
      // no shorter after three steps (or at the floor): pixels are not the cost, so take them back
      next = this.from;
      this.from = 0;
      this.lowerHold = this.lowerBackoff;
      this.lowerBackoff = Math.min(240, this.lowerBackoff * 2);
    } else if (this.lowerHold <= 0 && q.scale > MIN_SCALE) {
      if (!this.from || p75 < this.before * 0.95) {
        this.from = q.scale;
        this.before = p75;
      }
      next = Math.max(MIN_SCALE, q.scale - 0.1);
      if (this.lastUp) this.raiseBackoff = Math.min(120, this.raiseBackoff * 2);
      this.lastUp = false;
      this.raiseHold = this.raiseBackoff;
    } else if (p10 > this.period * 1.4) {
      // frames stay long with nothing left to lower: the display runs slower than thought
      this.period = p10;
    }
    if (next !== q.scale) {
      q.scale = next;
      this.onScale();
      this.cooldown = 2.5;
      this.n = 0; // judge the new scale on frames drawn at it
    }
  }
}
