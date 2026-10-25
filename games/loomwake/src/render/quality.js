// Frame governor: two tiers (high, low) plus a continuous resolution scale.
// Target 60 fps; drops scale/effects when frames run long, climbs back when
// there is headroom. `?quality=high|low` pins the tier (scale still adapts
// unless `?scale=` pins it too).
//
// Exports:
//   createQuality({ pin, scale, touch }) -> Q
//     Q.tier 'high'|'low', Q.scale (0.5..1 render resolution), Q.dprCap, Q.particles, Q.lights,
//     Q.lightRes, Q.floorRes, Q.shadows, Q.post (chromatic flash, grade), Q.ambient (0..1 amount of ambient fx)
//     Q.frame(ms)  feed each frame's interval; returns true when settings changed (renderer resizes)
//     Q.set(tier)  force a tier
export function createQuality({ pin = null, scale = null, touch = false } = {}) {
  const TIERS = {
    high: { dprCap: touch ? 1.5 : 2, particles: 2000, lights: 24, lightRes: 0.5, floorRes: 1, shadows: true, post: true, ambient: 1 },
    low: { dprCap: 1, particles: 600, lights: 8, lightRes: 0.35, floorRes: 0.6, shadows: false, post: false, ambient: 0.4 },
  };
  const Q = { tier: pin || (touch ? 'low' : 'high'), scale: scale ?? 1, pinned: !!pin, scalePinned: scale != null, ema: 16.7, slowT: 0, fastT: 0 };
  const apply = () => Object.assign(Q, TIERS[Q.tier]);
  apply();
  Q.set = (tier) => { if (TIERS[tier]) { Q.tier = tier; apply(); } };
  // Resolution steps are few and fixed (every new size rebuilds the screen-size caches, 50-200 ms on
  // software raster; env/common.js screenCache keeps the last two). It reacts in about half a second
  // and jumps two steps when frames run very long; it climbs back one step after 5 s of headroom.
  const LEVELS = [1, 0.8, 0.6];
  const level = () => { let i = LEVELS.findIndex((l) => Q.scale >= l - 1e-6); return i < 0 ? LEVELS.length - 1 : i; };
  let hold = 0;
  Q.frame = (ms) => {
    if (!(ms > 0) || ms > 250) return false;
    Q.ema += (ms - Q.ema) * 0.1;
    if (hold > 0) { hold -= ms; return false; }
    let changed = false;
    if (Q.ema > 20) { Q.slowT += ms; Q.fastT = 0; } else if (Q.ema < 13.5) { Q.fastT += ms; Q.slowT = 0; } else { Q.slowT = 0; Q.fastT = 0; }
    if (Q.slowT > 500) {
      Q.slowT = 0;
      const li = level();
      if (!Q.scalePinned && li < LEVELS.length - 1) { Q.scale = LEVELS[Math.min(LEVELS.length - 1, li + (Q.ema > 40 ? 2 : 1))]; changed = true; }
      else if (!Q.pinned && Q.tier === 'high') { Q.set('low'); changed = true; }
    } else if (Q.fastT > 5000) {
      Q.fastT = 0;
      if (!Q.pinned && Q.tier === 'low' && Q.scale >= 1) { Q.set('high'); changed = true; }
      else if (!Q.scalePinned && Q.scale < 1) { Q.scale = LEVELS[Math.max(0, level() - 1)]; changed = true; }
    }
    // after a change, let the new settings show in the average before judging again
    if (changed) { hold = 400; Q.ema = Math.min(Q.ema, 24); }
    return changed;
  };
  return Q;
}
