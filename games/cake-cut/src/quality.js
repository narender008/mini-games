// Device quality tiers. The starting tier comes from a quick look at the
// device; the frame-time monitor then trims the pixel ratio if frames run
// long. `?quality=high|medium|low` forces a tier.
import { QUERY } from './config.js';

const TIERS = {
  high: { tier: 'high', maxDpr: 2, msaa: 4, shadows: true, shadowSize: 2048, ao: true, dof: true, crumbs: 360, confetti: 420, maxPixels: 3.6e6 },
  medium: { tier: 'medium', maxDpr: 1.6, msaa: 2, shadows: true, shadowSize: 1024, ao: true, dof: true, crumbs: 240, confetti: 280, maxPixels: 2.2e6 },
  low: { tier: 'low', maxDpr: 1.25, msaa: 0, shadows: true, shadowSize: 512, ao: false, dof: false, crumbs: 140, confetti: 160, maxPixels: 1.2e6 },
};

export function detectQuality() {
  const q = pickTier();
  if (QUERY.has('msaa')) q.msaa = Number(QUERY.get('msaa')) || 0;
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
// raising it again (up to the tier's limit) when there is headroom.
export class FrameGovernor {
  constructor(onScale) {
    this.onScale = onScale;
    this.scale = 1;
    this.samples = [];
    this.cooldown = 3;
  }

  sample(realDt) {
    if (realDt > 0.25) return;
    this.samples.push(realDt);
    this.cooldown -= realDt;
    if (this.samples.length < 90 || this.cooldown > 0) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    this.samples.length = 0;
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
