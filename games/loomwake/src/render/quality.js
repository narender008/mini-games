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
    high: { dprCap: touch ? 1.5 : 2, particles: 5000, lights: 32, lightRes: 0.5, floorRes: 1, shadows: true, post: true, ambient: 1 },
    low: { dprCap: 1, particles: 1000, lights: 8, lightRes: 0.35, floorRes: 0.6, shadows: false, post: false, ambient: 0.4 },
  };
  const Q = { tier: pin || (touch ? 'low' : 'high'), scale: scale ?? 1, pinned: !!pin, scalePinned: scale != null, ema: 16.7, slowT: 0, fastT: 0 };
  const apply = () => Object.assign(Q, TIERS[Q.tier]);
  apply();
  Q.set = (tier) => { if (TIERS[tier]) { Q.tier = tier; apply(); } };
  Q.frame = (ms) => {
    if (!(ms > 0) || ms > 250) return false;
    Q.ema += (ms - Q.ema) * 0.05;
    let changed = false;
    if (Q.ema > 21) { Q.slowT += ms; Q.fastT = 0; } else if (Q.ema < 13.5) { Q.fastT += ms; Q.slowT = 0; } else { Q.slowT = 0; Q.fastT = 0; }
    if (Q.slowT > 1500) {
      Q.slowT = 0;
      if (!Q.scalePinned && Q.scale > 0.6) { Q.scale = Math.max(0.6, Math.round((Q.scale - 0.1) * 10) / 10); changed = true; }
      else if (!Q.pinned && Q.tier === 'high') { Q.set('low'); changed = true; }
    } else if (Q.fastT > 4000) {
      Q.fastT = 0;
      if (!Q.pinned && Q.tier === 'low' && Q.scale >= 1) { Q.set('high'); changed = true; }
      else if (!Q.scalePinned && Q.scale < 1) { Q.scale = Math.min(1, Math.round((Q.scale + 0.1) * 10) / 10); changed = true; }
    }
    return changed;
  };
  return Q;
}
