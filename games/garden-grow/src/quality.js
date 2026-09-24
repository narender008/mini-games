// Device quality tiers. The starting tier comes from a quick look at the
// device; the frame governor then trims the render scale when frames run
// long, and thins the grass if that is not enough. `?quality=high|medium|low`
// forces a tier; `?msaa=N`, `?shadows=0`, `?ao=0`, `?dof=0` tune it.
import { QUERY } from './config.js';

const TIERS = {
  high: { tier: 'high', maxDpr: 2, msaa: 4, maxPixels: 3.6e6, shadows: true, shadowSize: 2048, ao: true, dof: true, grass: 1, particles: 1, creatures: 1 },
  medium: { tier: 'medium', maxDpr: 1.6, msaa: 2, maxPixels: 2.2e6, shadows: true, shadowSize: 2048, ao: true, dof: true, grass: 0.55, particles: 0.7, creatures: 0.8 },
  low: { tier: 'low', maxDpr: 1.25, msaa: 0, maxPixels: 1.2e6, shadows: true, shadowSize: 1024, ao: false, dof: false, grass: 0.3, particles: 0.45, creatures: 0.6 },
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
// raising it again (up to the tier's limit) when there is headroom. Once the
// scale is at its floor it asks for lighter foliage instead (onFoliage).
export class FrameGovernor {
  constructor(onScale, onFoliage) {
    this.onScale = onScale;
    this.onFoliage = onFoliage;
    this.scale = 1;
    this.foliage = 1;
    this.samples = [];
    this.cooldown = 4;
  }

  sample(realDt) {
    if (realDt > 0.25) return;
    this.samples.push(realDt);
    this.cooldown -= realDt;
    if (this.samples.length < 90 || this.cooldown > 0) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    this.samples.length = 0;
    if (p75 > 1 / 45) {
      if (this.scale > 0.6) this.setScale(Math.max(0.6, this.scale * 0.87));
      else if (this.foliage > 0.35) this.setFoliage(Math.max(0.35, this.foliage * 0.75));
    } else if (p75 < 1 / 58) {
      if (this.foliage < 1) this.setFoliage(Math.min(1, this.foliage * 1.1));
      else if (this.scale < 1) this.setScale(Math.min(1, this.scale * 1.06));
    }
  }

  setScale(s) {
    this.scale = s;
    this.cooldown = 2;
    this.onScale(s);
  }

  setFoliage(f) {
    this.foliage = f;
    this.cooldown = 2;
    this.onFoliage?.(f);
  }
}
