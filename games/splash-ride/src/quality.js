// Device quality tiers. The starting tier comes from a quick look at the
// device; the frame governor then trims the render scale if frames run long.
// URL switches: ?quality=high|medium|low forces a tier, ?msaa=N and
// ?shadows=0 override single features.
import { QUERY } from './config.js';

// water: vertex spacing of the detailed water grid (m) and its cells per side.
// reflect: planar reflection resolution as a fraction of the screen (0 = sky
// only). wake: the foam/wake map's texels per side. particles: spray budget.
const TIERS = {
  high: {
    tier: 'high', maxDpr: 2, msaa: 4, shadows: true, shadowSize: 2048,
    maxPixels: 3.4e6, particles: 3000, texSize: 1024, envSize: 256,
    waterCell: 0.5, waterCells: 256, reflect: 0.5, wake: 1024, scatter: 1,
  },
  medium: {
    tier: 'medium', maxDpr: 1.6, msaa: 2, shadows: true, shadowSize: 2048,
    maxPixels: 2.1e6, particles: 1800, texSize: 1024, envSize: 128,
    waterCell: 0.6, waterCells: 192, reflect: 0.38, wake: 512, scatter: 0.75,
  },
  low: {
    tier: 'low', maxDpr: 1.25, msaa: 0, shadows: true, shadowSize: 1024,
    maxPixels: 1.1e6, particles: 1000, texSize: 512, envSize: 128,
    waterCell: 1, waterCells: 128, reflect: 0.28, wake: 512, scatter: 0.5,
  },
};

export function detectQuality() {
  const q = pickTier();
  if (QUERY.has('msaa')) q.msaa = Math.max(0, Math.min(8, Number(QUERY.get('msaa')) || 0));
  if (QUERY.has('shadows')) q.shadows = QUERY.get('shadows') !== '0';
  if (QUERY.has('reflect')) q.reflect = Math.max(0, Math.min(1, Number(QUERY.get('reflect')) || 0));
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
// percentile ignores the odd long frame (GC, tab switch) but reacts to a
// steady slowdown within a couple of seconds.
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
