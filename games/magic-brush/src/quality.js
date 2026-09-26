// Device quality tiers. The starting tier comes from a quick look at the
// device; the frame governor then trims the render scale if frames run long.
// URL switches: ?quality=high|medium|low forces a tier, ?msaa=N, ?shadows=0,
// ?ao=0, ?dof=0 and ?fur=N (shells per furry friend) override single
// features.
import { QUERY } from './config.js';

// fur: shells drawn over a furry friend close up (fewer far away).
// active: friends roaming the garden at once (the rest wait on the shelf).
// paint: the painting's texels across (the canvas is 4:3).
// voxel: the sculpting grid for friends, in metres (smaller is finer).
const TIERS = {
  high: {
    tier: 'high', maxDpr: 2, msaa: 4, shadows: true, shadowSize: 2048, ao: true, dof: true,
    maxPixels: 3.6e6, particles: 1400, envSize: 256, fur: 26, active: 8, paint: 1024, voxel: 0.0042, grass: 1,
  },
  medium: {
    tier: 'medium', maxDpr: 1.6, msaa: 2, shadows: true, shadowSize: 2048, ao: true, dof: true,
    maxPixels: 2.2e6, particles: 900, envSize: 128, fur: 16, active: 6, paint: 1024, voxel: 0.005, grass: 0.65,
  },
  low: {
    tier: 'low', maxDpr: 1.25, msaa: 0, shadows: true, shadowSize: 1024, ao: false, dof: false,
    maxPixels: 1.2e6, particles: 500, envSize: 128, fur: 9, active: 4, paint: 768, voxel: 0.006, grass: 0.4,
  },
};

export function detectQuality() {
  const q = pickTier();
  if (QUERY.has('msaa')) q.msaa = Math.max(0, Math.min(8, Number(QUERY.get('msaa')) || 0));
  if (QUERY.has('shadows')) q.shadows = QUERY.get('shadows') !== '0';
  if (QUERY.has('ao')) q.ao = QUERY.get('ao') !== '0';
  if (QUERY.has('dof')) q.dof = QUERY.get('dof') !== '0';
  if (QUERY.has('fur')) q.fur = Math.max(0, Math.min(48, Number(QUERY.get('fur')) || 0));
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
// percentile ignores the odd long frame (GC, tab switch, a friend being
// sculpted) but reacts to a steady slowdown within a couple of seconds.
export class FrameGovernor {
  constructor(onScale) {
    this.onScale = onScale;
    this.scale = 1;
    this.samples = [];
    this.cooldown = 3;
    // extra help when even the lowest render scale cannot hold 30 fps (a
    // steady 30 may be the browser saving battery): fewer fur shells, fewer
    // friends about
    this.strain = 0;
  }

  sample(realDt) {
    this.samples.push(realDt);
    this.cooldown -= realDt;
    if (this.samples.length < 90 || this.cooldown > 0) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    this.samples.length = 0;
    let next = this.scale;
    if (p75 > 1 / 45) {
      next = Math.max(0.55, this.scale * 0.85);
      if (next === this.scale && p75 > 1 / 25) this.strain = Math.min(1, this.strain + 0.25);
    } else if (p75 < 1 / 58) {
      if (this.strain > 0) this.strain = Math.max(0, this.strain - 0.125);
      else if (this.scale < 1) next = Math.min(1, this.scale * 1.08);
    }
    if (next !== this.scale) {
      this.scale = next;
      this.cooldown = 2;
      this.onScale(next);
    }
  }
}
