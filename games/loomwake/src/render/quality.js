// Frame governor: two tiers (high, low) plus a continuous resolution scale.
// Target 60 fps; drops scale/effects when frames run long, climbs back when
// there is headroom. `?quality=high|low` pins the tier (scale still adapts
// unless `?scale=` pins it too).
//
// Exports:
//   createQuality({ pin, scale, touch }) -> Q
//     Q.tier 'high'|'low', Q.scale (0.5..1 render resolution), Q.dprCap, Q.particles, Q.lights,
//     Q.lightRes, Q.floorRes, Q.shadows, Q.post (chromatic flash, grade), Q.ambient (0..1 amount of ambient fx)
//     Q.frame(ms, work)  feed each frame's interval (and the game's own JS time in it, the headroom on a vsynced
//                  screen); returns true when settings changed (renderer resizes)
//     Q.refresh   the display's typical frame interval (ms), Q.changes  how many times it has switched
//     Q.set(tier)  force a tier
//     Q.pause(ms)  stop judging for a while (the renderer calls it after repainting a chamber)
export function createQuality({ pin = null, scale = null, touch = false } = {}) {
  const TIERS = {
    high: { dprCap: touch ? 1.5 : 2, maxPx: 2.4e6, particles: 2000, lights: 24, lightRes: 0.5, floorRes: 1, shadows: true, post: true, ambient: 1 },
    low: { dprCap: 1, maxPx: 1.3e6, particles: 600, lights: 8, lightRes: 0.35, floorRes: 0.6, shadows: false, post: false, ambient: 0.4 },
  };
  const Q = { tier: pin || (touch ? 'low' : 'high'), scale: scale ?? 1, pinned: !!pin, scalePinned: scale != null, ema: 16.7, slowT: 0, fastT: 0 };
  const apply = () => Object.assign(Q, TIERS[Q.tier]);
  apply();
  Q.set = (tier) => { if (TIERS[tier]) { Q.tier = tier; apply(); } };
  // Resolution steps are few and fixed (every new size rebuilds the screen-size caches, 50-200 ms on
  // software raster; env/common.js screenCache keeps the last three). It reacts in about half a second
  // and jumps two steps when frames run very long; it climbs back one step after a stretch of headroom.
  //
  // Judged against the display's own refresh (Q.refresh, the typical interval), not a fixed 60 Hz: a 50 Hz
  // screen is not "slow" at 20 ms, and a 144 Hz screen is not "fast" just because it is under 13.5 ms.
  // Climbing back is backed off: a climb that has to be undone within 15 s doubles the headroom needed for
  // the next one (5 s, 10 s, 20 s ...), and after three such reversals it stays put. The game used to swing
  // between two levels every few seconds on a 144 Hz screen, each swing a 50-200 ms hitch.
  // One-off spikes (a chamber repaint, a garbage collection, a tab switch) are left out of the average.
  const LEVELS = [1, 0.8, 0.6];
  const level = () => { let i = LEVELS.findIndex((l) => Q.scale >= l - 1e-6); return i < 0 ? LEVELS.length - 1 : i; };
  let hold = 0, sinceUp = Infinity, fastNeed = 5000, reversals = 0;
  Q.refresh = 16.7;
  // a chamber repaint or a resize is a burst of one-off work: don't judge the frames right after it
  Q.pause = (ms) => { hold = Math.max(hold, ms); Q.slowT = 0; Q.fastT = 0; };
  Q.work = 8;
  Q.frame = (ms, work) => {
    if (!(ms > 0) || ms > 250) return false;
    // refresh estimate: follows short intervals quickly and long ones slowly (vsync is the floor)
    Q.refresh += (ms - Q.refresh) * (ms < Q.refresh ? 0.05 : 0.004);
    const base = Math.max(6, Math.min(Q.refresh, 34));
    sinceUp += ms;
    if (ms > Math.max(100, base * 4)) return false;
    Q.ema += (Math.min(ms, base * 3) - Q.ema) * 0.1;
    if (work >= 0) Q.work += (Math.min(work, 100) - Q.work) * 0.05;
    if (hold > 0) { hold -= ms; return false; }
    let changed = false, up = false;
    const slow = Math.max(20, base * 1.3), fast = base * 0.82;
    if (Q.ema > slow) { Q.slowT += ms; Q.fastT = 0; } else if ((Q.ema < fast && base < 13.5) || (Q.ema < base * 1.08 && Q.work < base * 0.4)) { Q.fastT += ms; Q.slowT = 0; } else { Q.slowT = 0; Q.fastT = 0; }
    if (Q.slowT > 500) {
      Q.slowT = 0;
      const li = level();
      if (!Q.scalePinned && li < LEVELS.length - 1) { Q.scale = LEVELS[Math.min(LEVELS.length - 1, li + (Q.ema > slow * 2 ? 2 : 1))]; changed = true; }
      else if (!Q.pinned && Q.tier === 'high') { Q.set('low'); changed = true; }
      if (changed && sinceUp < 15000) { reversals++; fastNeed *= 2; }
    } else if (Q.fastT > fastNeed && reversals < 3) {
      Q.fastT = 0;
      if (!Q.pinned && Q.tier === 'low' && Q.scale >= 1) { Q.set('high'); changed = up = true; }
      else if (!Q.scalePinned && Q.scale < 1) { Q.scale = LEVELS[Math.max(0, level() - 1)]; changed = up = true; }
    }
    if (up) sinceUp = 0;
    // after a change, let the new settings show in the average before judging again
    if (changed) { hold = 400; Q.ema = Math.min(Q.ema, slow); Q.changes = (Q.changes || 0) + 1; }
    return changed;
  };
  return Q;
}
