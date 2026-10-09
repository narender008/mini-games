// Shared constants and small helpers. World units ("u"): x to the right, y DOWN
// the screen, the road arena is 720 x 1280 u (one Blender metre of the sprite
// art is 40 u). Times are seconds.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const COVER = QUERY.has('cover');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ARENA = { w: 720, h: 1280 };
// the hero's band at the bottom of the road
export const BAND = { x0: 34, x1: 686, y0: 960, y1: 1226 };
export const STEP = 1 / 60; // fixed simulation step
export const MAX_STEPS = 5; // per frame, so a stall does not spiral

// Player preferences changed on the settings screen (loaded from the save).
export const PREFS = { shake: REDUCED_MOTION ? 'reduced' : 'full', numbers: true, gore: 'max' };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const TAU = Math.PI * 2;

// One fast generator for gameplay randomness (xorshift; Math.random is fine
// too, this one is just cheaper in the hot loops and seedable for benches).
let seed = (Date.now() ^ 0x9e3779b9) >>> 0 || 1;
export function reseed(s) {
  seed = s >>> 0 || 1;
}
export function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
export const rand = (a = 0, b = 1) => a + rnd() * (b - a);
export const randi = (a, b) => Math.floor(a + rnd() * (b - a + 1));
export const pick = (list) => list[Math.floor(rnd() * list.length)];
export const chance = (p) => rnd() < p;

// A seeded generator for scenery, so a chapter looks the same every time.
export function rng(s) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
