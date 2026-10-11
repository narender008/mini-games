// Shared constants and small helpers. World units are metres and seconds, x
// to the right and y UP (the physics' own frame; the renderer flips y). Kept
// free of the DOM at load so the simulation modules also run under Node for
// balance tests.
const hasDom = typeof location !== 'undefined';
export const QUERY = new URLSearchParams(hasDom ? location.search : '');
export const DEBUG = QUERY.has('debug');
export const COVER = QUERY.has('cover');
export const REDUCED_MOTION = hasDom && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const G = 9.8 * 1.25; // a little more than real gravity: snappier arcs, shorter runs
export const STEP = 1 / 120; // fixed simulation step
export const MAX_STEPS = 8; // per frame, so a stall does not spiral
// cash paid for a run, as a share of its score (insurance raises it)
export const PAY_RATE = 0.1;
export const RUNS_PER_SET = 3;

// Player preferences changed on the settings screen (loaded from the save).
export const PREFS = { shake: REDUCED_MOTION ? 'reduced' : 'full', gore: 'max', replay: true };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
export const TAU = Math.PI * 2;

// One fast generator for gameplay randomness (xorshift), seedable so a bench
// or a balance test can repeat itself.
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
export const chance = (p) => rnd() < p;

// A separate seeded generator for scenery and art, so a track always looks the same.
export function rng(s) {
  let x = s >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

// dollars with thousands separators, built without allocating more than the result
export function money(v) {
  return '$' + Math.round(v).toLocaleString('en-GB');
}
