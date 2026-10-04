// Shared constants and small helpers. Units are metres and seconds, x to the
// right and y up.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const COVER = QUERY.has('cover');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const WORLD = {
  width: 320, // battlefield width
  height: 160, // terrain texture height (the sky goes on above it)
  res: 4, // terrain texels per metre
  gravity: 24,
  maxSpeed: 76, // muzzle speed at 100% power
  maxWind: 6, // sideways acceleration at full wind
  step: 1 / 120, // fixed simulation step
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const DEG = Math.PI / 180;

// A seeded generator for terrain and scenery, so a battlefield looks the same
// every time it is played.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Gaussian sample (Box-Muller), for aiming error.
export function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// Damped spring towards a target: frame-rate independent smoothing.
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);
