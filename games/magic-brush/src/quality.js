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

// Steady frame pacing. A screen faster than 60 Hz (a 120 Hz MacBook, a 90 or
// 144 Hz phone or monitor) asks for a frame every few milliseconds; a scene
// that costs between one and two of those intervals then makes the browser
// flip between (say) 120 and 60 fps, which reads as judder. The pacer lets
// every n-th refresh through so the game runs at one fixed cadence of about
// 60 fps (the largest n that stays at or above ~54 fps: n = 1 on 60 Hz, 2 on
// 120 and 144 Hz, 4 on 240 Hz), and it hands the simulation a time step made
// of WHOLE refreshes, so timestamp jitter never reaches the motion: on time,
// every frame advances the world by exactly the same amount. After a hitch the
// step is capped, so the world slows for a moment instead of jumping.
// ?fps=N forces the target (e.g. ?fps=120 to let a fast screen run flat out).
const RATES = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240];
const MAX_STEP = 40; // ms of world time a single frame may advance

export class FramePacer {
  constructor(targetFps = 0) {
    this.forced = targetFps;
    this.vsync = 1000 / 60; // ms between refreshes
    this.n = 1; // refreshes per frame
    this.step = this.vsync; // ms between frames (n * vsync)
    this.deltas = [];
    this.prev = 0;
    this.count = 0;
    this.lastRender = 0;
    this.real = this.step; // ms since the previous frame that was drawn (what the governor watches)
    this.pending = 0;
    this.pendingRuns = 0;
  }

  // called on every refresh with the animation-frame time (ms); returns the
  // seconds to advance the world by, or 0 when this refresh is skipped
  tick(now) {
    if (this.prev) {
      const d = now - this.prev;
      if (d > 3 && d < 45) {
        this.deltas.push(d);
        if (this.deltas.length > 240) this.deltas.shift();
      }
    }
    this.prev = now;
    if (++this.count % 15 === 0) this.reassess();
    const since = now - this.lastRender;
    if (this.lastRender && since < this.step * 0.8) return 0;
    const first = !this.lastRender;
    this.lastRender = now;
    this.real = first ? this.step : since;
    const k = Math.max(1, Math.round((first ? this.step : since) / this.vsync));
    return Math.min(k * this.vsync, MAX_STEP) / 1000;
  }

  // the refresh interval is the low end of what the browser has been giving
  // us (slow frames only stretch it), snapped to a real refresh rate
  reassess() {
    if (this.deltas.length < 30) return;
    const sorted = [...this.deltas].sort((a, b) => a - b);
    let v = sorted[Math.floor(sorted.length * 0.15)];
    const hz = 1000 / v;
    let best = 0;
    for (const r of RATES) if (Math.abs(r - hz) / r < 0.08 && (!best || Math.abs(r - hz) < Math.abs(best - hz))) best = r;
    if (best) v = 1000 / best;
    let n = Math.max(1, Math.floor(18.5 / v));
    if (this.forced) n = Math.max(1, Math.round(1000 / v / this.forced));
    // change only when two checks in a row agree, so one odd second never flips the cadence
    if (n === this.n && Math.abs(v - this.vsync) < 0.4) {
      this.pending = 0;
      return;
    }
    const key = n * 1000 + Math.round(v);
    this.pendingRuns = key === this.pending ? this.pendingRuns + 1 : 1;
    this.pending = key;
    if (this.pendingRuns >= 2) {
      this.vsync = v;
      this.n = n;
      this.step = n * v;
      this.pending = 0;
    }
  }
}

// Watches frame times and lowers the render scale when the device struggles.
// Changing the scale re-allocates every render target (tens of ms, a visible
// hitch, and a step in sharpness), so it is a last resort: it waits for a
// quiet moment unless the game is truly crawling, steps down in big enough
// strides to settle in one go, and climbs back only after a long calm and
// with a growing back-off if a climb has ever failed (no scale flapping).
export class FrameGovernor {
  constructor(onScale, pacer, canResize = () => true) {
    this.onScale = onScale;
    this.pacer = pacer;
    this.canResize = canResize;
    this.scale = 1;
    this.samples = [];
    this.cooldown = 4; // s before the first verdict (the first frames build things)
    this.calm = 0; // s of frames on target
    this.sinceChange = 99;
    this.upWait = 25; // s of calm needed to climb again; doubles after a failed climb
    this.lastUp = -99;
    this.clock = 0;
    this.want = 0; // a scale change waiting for a quiet moment
    // extra help when even the lowest render scale cannot hold 30 fps (a
    // steady 30 may be the browser saving battery): fewer fur shells, fewer
    // friends about
    this.strain = 0;
  }

  // hold: a one-off moment (the come-alive) is on; its slow frames say nothing about the device
  sample(realDt, hold = false) {
    this.clock += realDt;
    this.sinceChange += realDt;
    if (hold) {
      this.samples.length = 0;
      this.cooldown = Math.max(this.cooldown, 3);
      this.calm = 0;
      return;
    }
    this.cooldown -= realDt;
    const target = this.pacer.step / 1000;
    this.samples.push(realDt);
    if (realDt < target * 1.12) this.calm += realDt;
    else this.calm = 0;
    if (this.want && this.canResize()) this.apply(this.want);
    if (this.samples.length < 90 || this.cooldown > 0) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    this.samples.length = 0;
    if (p75 > target * 1.3) {
      // slower than about 46 fps at a 60 fps target: less resolution
      let next = Math.max(0.55, this.scale * 0.82);
      if (next === this.scale && p75 > 1 / 25) this.strain = Math.min(1, this.strain + 0.25);
      if (next !== this.scale) {
        // a failed climb: back off for longer next time
        if (this.clock - this.lastUp < 25) this.upWait = Math.min(240, this.upWait * 2);
        this.calm = 0;
        if (this.canResize() || p75 > target * 2) this.apply(next);
        else this.want = next;
      }
    } else if (this.calm > this.upWait && this.sinceChange > this.upWait) {
      if (this.strain > 0) this.strain = Math.max(0, this.strain - 0.125);
      else if (this.scale < 1) {
        this.lastUp = this.clock;
        this.want = Math.min(1, this.scale / 0.82);
        if (this.want === this.scale) this.want = 0;
        else this.calm = 0;
      }
    }
  }

  apply(next) {
    this.want = 0;
    if (next === this.scale) return;
    this.scale = next;
    this.sinceChange = 0;
    this.cooldown = 3;
    this.samples.length = 0;
    this.onScale(next);
  }
}
