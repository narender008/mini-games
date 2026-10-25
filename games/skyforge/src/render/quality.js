// Quality tiers and the frame governor. `?quality=high|medium|low` or
// settings.quality ('auto' by default) picks the tier; under 'auto' the
// governor lowers the tier (then the render scale) when frames run long, drops
// straight to low when they are far too slow (software canvas), and raises
// the scale again when there is headroom, aiming at a steady 60 fps.
import { CFG } from '../config.js';

export const TIERS = {
  high: { name: 'high', dprCap: 2, cacheCap: 2, particles: 1, blur: true, rays: true, distant: true, skyK: 2, rain: 900, agents: 1, grade: true },
  medium: { name: 'medium', dprCap: 1.5, cacheCap: 1.5, particles: 0.6, blur: true, rays: true, distant: true, skyK: 1.25, rain: 520, agents: 0.75, grade: true },
  low: { name: 'low', dprCap: 1, cacheCap: 1, particles: 0.35, blur: false, rays: false, distant: false, skyK: 1, rain: 260, agents: 0.45, grade: true },
};
const ORDER = ['low', 'medium', 'high'];

export function createQuality(app) {
  const R = CFG.render;
  const forced = app.flags?.quality && TIERS[app.flags.quality] ? app.flags.quality : null;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  let tier = forced || pickSetting() || (coarse ? 'medium' : 'high');
  let scale = 1, slow = 0, fast = 0, ema = 1 / 60, changed = false;
  const mqReduce = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function pickSetting() { const s = app.settings?.quality; return s && TIERS[s] ? s : null; }
  const q = {
    get tier() { return tier; },
    get Q() { return TIERS[tier]; },
    get scale() { return scale; },
    get auto() { return !forced && !pickSetting(); },
    set(t) { if (TIERS[t]) { tier = t; scale = 1; changed = true; } },
    // returns true when the canvas size must change
    frame(dt) {
      const s = pickSetting();
      if (!forced && s && s !== tier) { tier = s; scale = 1; changed = true; }
      if (!q.auto || dt <= 0 || dt > 0.25 || document.hidden) { const c = changed; changed = false; return c; }
      ema += (dt - ema) * 0.08;
      if (ema > 1 / (R.governorLowFps || 48)) { slow += dt; fast = 0; } else if (ema < 1 / 57) { fast += dt; slow = 0; } else { slow = Math.max(0, slow - dt); fast = 0; }
      // far too slow (a software canvas, a weak GPU): drop straight to low
      if (slow > 0.6 && ema > 1 / 22 && tier !== 'low') { tier = 'low'; scale = 1; slow = 0; ema = 1 / 40; changed = true; }
      else if (slow > 1.5) {
        // tiers first (they cut work), then the render scale (blurrier)
        slow = 0; ema = 1 / 50;
        if (ORDER.indexOf(tier) > 0) tier = ORDER[ORDER.indexOf(tier) - 1];
        else if (scale > (R.minScale || 0.65)) scale = Math.max(R.minScale || 0.65, +(scale - 0.1).toFixed(2));
        changed = true;
      } else if (fast > 5) {
        fast = 0;
        if (scale < 1) { scale = Math.min(1, +(scale + 0.1).toFixed(2)); changed = true; }
      }
      const c = changed; changed = false; return c;
    },
    dpr() { const d = (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1) || 1; return Math.max(0.5, Math.min(d, TIERS[tier].dprCap) * scale); },
    reduceMotion() {
      const s = app.settings || {};
      if (s.reducedMotion != null) return !!s.reducedMotion;
      if (s.reduceMotion != null) return !!s.reduceMotion;
      if (s.motion != null) return s.motion === 'reduced' || s.motion === false;
      return !!mqReduce?.matches;
    },
  };
  return q;
}
