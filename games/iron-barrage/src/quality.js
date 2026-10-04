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

// Watches frame times and lowers the render scale when the device struggles,
// raising it again when there is room. The 75th percentile ignores the odd
// long frame but reacts to a steady slowdown within a couple of seconds.
export class FrameGovernor {
  constructor(q, onScale) {
    this.q = q;
    this.onScale = onScale;
    this.samples = new Float32Array(90);
    this.n = 0;
    this.cooldown = 3;
    this.target = 1 / 58;
  }

  sample(dt) {
    if (dt > 0.25) return;
    this.samples[this.n++ % this.samples.length] = dt;
    this.cooldown -= dt;
    if (this.cooldown > 0 || this.n < this.samples.length) return;
    const s = Array.from(this.samples).sort((a, b) => a - b);
    const p75 = s[Math.floor(s.length * 0.75)];
    const q = this.q;
    let next = q.scale;
    if (p75 > 1 / 50) next = Math.max(0.55, q.scale - 0.1);
    else if (p75 < 1 / 64 && q.scale < 1) next = Math.min(1, q.scale + 0.05);
    if (next !== q.scale) {
      q.scale = next;
      this.onScale();
      this.cooldown = 2.5;
    }
  }
}
