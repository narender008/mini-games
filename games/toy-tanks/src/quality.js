// Device quality tiers. The starting tier comes from a quick look at the
// device; the frame governor then trims the render scale if frames run long.
// URL switches: ?quality=high|medium|low forces a tier; ?msaa=N, ?shadows=0,
// ?ao=0 and ?dof=0 override single features.
import { QUERY } from './config.js';

// particles: the most burst pieces alive at once. grass: blade density.
// cell: crater map texel in metres.
const TIERS = {
  high: {
    tier: 'high', maxDpr: 2, msaa: 4, shadows: true, shadowSize: 2048, ao: true, dof: true,
    maxPixels: 3.6e6, particles: 1, envSize: 256, grass: 1, dofTaps: 48,
  },
  medium: {
    tier: 'medium', maxDpr: 1.6, msaa: 2, shadows: true, shadowSize: 2048, ao: true, dof: true,
    maxPixels: 2.2e6, particles: 0.7, envSize: 128, grass: 0.6, dofTaps: 32,
  },
  low: {
    tier: 'low', maxDpr: 1.25, msaa: 0, shadows: true, shadowSize: 1024, ao: false, dof: true,
    maxPixels: 1.2e6, particles: 0.45, envSize: 128, grass: 0.35, dofTaps: 24,
  },
};

export function detectQuality() {
  const q = pickTier();
  if (QUERY.has('msaa')) q.msaa = Math.max(0, Math.min(8, Number(QUERY.get('msaa')) || 0));
  if (QUERY.has('shadows')) q.shadows = QUERY.get('shadows') !== '0';
  if (QUERY.has('ao')) q.ao = QUERY.get('ao') !== '0';
  if (QUERY.has('dof')) q.dof = QUERY.get('dof') !== '0';
  return q;
}

function pickTier() {
  const forced = QUERY.get('quality');
  if (forced && TIERS[forced]) return { ...TIERS[forced] };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = coarse || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  let tier = 'high';
  if (mobile) tier = mem <= 3 || cores <= 4 ? 'low' : 'medium';
  else if (mem <= 4 || cores <= 4) tier = 'medium';
  return { ...TIERS[tier] };
}

// Watches frame times and lowers the render scale when the device struggles,
// raising it again (up to the tier's limit) when there is headroom. The 75th
// percentile ignores the odd long frame but reacts to a steady slowdown
// within a couple of seconds.
export class FrameGovernor {
  constructor(onScale) {
    this.onScale = onScale;
    this.scale = 1;
    this.samples = new Float32Array(90);
    this.n = 0;
    this.cooldown = 3;
  }

  sample(realDt) {
    if (realDt > 0.25) return;
    this.samples[this.n++] = realDt;
    this.cooldown -= realDt;
    if (this.n < this.samples.length || this.cooldown > 0) {
      if (this.n >= this.samples.length) this.n = 0;
      return;
    }
    this.n = 0;
    this.samples.sort();
    const p75 = this.samples[Math.floor(this.samples.length * 0.75)];
    let next = this.scale;
    if (p75 > 1 / 45) next = Math.max(0.55, this.scale * 0.85);
    else if (p75 < 1 / 58 && this.scale < 1) next = Math.min(1, this.scale * 1.08);
    if (next !== this.scale) {
      this.scale = next;
      this.cooldown = 2;
      this.onScale(next);
    }
  }
}
