// Device quality tiers. The starting tier comes from a quick look at the
// device; the frame governor then trims the render scale if frames run long
// and gives it back when there is headroom. ?quality=high|medium|low forces a
// tier (as does the Settings screen). Low halves the sprite atlases at upload
// (a quarter of the texture memory), and so do phones and tablets at every tier.
import { QUERY } from './config.js';

const MOBILE = matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

const TIERS = {
  high: { tier: 'high', maxDpr: 2, maxPixels: 3.7e6, lights: 24, bloomLevels: 5, bursts: 120, floorRes: 64, shadows: true, halfAtlas: false, mist: 1 },
  medium: { tier: 'medium', maxDpr: 1.5, maxPixels: 2.6e6, lights: 16, bloomLevels: 4, bursts: 80, floorRes: 48, shadows: true, halfAtlas: false, mist: 1 },
  low: { tier: 'low', maxDpr: 1.1, maxPixels: 1.3e6, lights: 8, bloomLevels: 3, bursts: 45, floorRes: 32, shadows: false, halfAtlas: true, mist: 0 },
};

function settings(name) {
  const t = TIERS[name];
  return { ...t, halfAtlas: t.halfAtlas || MOBILE };
}

export function detectQuality(saved) {
  const forced = QUERY.get('quality') || (saved && saved !== 'auto' ? saved : null);
  if (forced && TIERS[forced]) return { ...settings(forced), scale: 1, forced: true };
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  let tier = 'high';
  if (MOBILE) tier = mem <= 3 || cores <= 4 ? 'low' : 'medium';
  else if (mem <= 4 || cores <= 4) tier = 'medium';
  // integrated graphics on an ordinary laptop: start at medium, the governor does the rest
  const gpu = gpuName();
  if (!MOBILE && /Intel|UHD|Iris|Radeon\(TM\) Graphics|Mali|Adreno/i.test(gpu) && tier === 'high') tier = 'medium';
  return { ...settings(tier), scale: 1, forced: false };
}

function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return name || '';
  } catch {
    return '';
  }
}

export function tierSettings(name) {
  return TIERS[name] ? settings(name) : null;
}

// Watches frame times against the display's refresh period and lowers the
// render scale when frames run clearly longer, raising it again when there is
// room. The 75th percentile ignores the odd long frame but reacts to a steady
// slowdown within a couple of seconds; the 10th percentile, kept as a running
// minimum, is the refresh period, never taken below a 60 fps frame (a 90 or
// 120 Hz screen is not chased with fewer pixels). If three steps down do not
// shorten the frames (the cost is not pixels) they are undone and not tried
// again for a while. A raise that had to be taken back makes the next one
// wait longer, so the scale does not hunt.
const MIN_SCALE = 0.55;

export class FrameGovernor {
  constructor(q, onScale) {
    this.q = q;
    this.onScale = onScale;
    this.samples = new Float32Array(90);
    this.sorted = new Float32Array(90);
    this.i = 0;
    this.n = 0;
    this.cooldown = 3;
    this.period = 1 / 45;
    this.from = 0;
    this.before = 0;
    this.lowerHold = 0;
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
    this.cooldown = 0.5;
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
        this.raiseHold = 5;
      }
    } else if (this.from && p75 >= this.before * 0.95 && q.scale <= Math.max(MIN_SCALE, this.from - 0.25) + 1e-6) {
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
      this.period = p10;
    }
    if (next !== q.scale) {
      q.scale = next;
      this.onScale();
      this.cooldown = 2.5;
      this.n = 0;
    }
  }
}
