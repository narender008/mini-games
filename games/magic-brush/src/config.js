// Shared constants and small helpers: URL switches, settings kept on this
// device, maths.
//
// Units are metres and seconds, y is up. The studio deck and the lawn are at
// y = 0. Creatures face +z in their own space and their side view (the view
// they are painted in on the canvas) looks along -x, so a creature's +z runs
// to the right of the canvas and +y up it.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

export const MODES = ['little', 'big'];

const PREFIX = 'mini-games.magic-brush.';

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    /* storage may be unavailable (private mode) or full */
    return false;
  }
}

export function pickValid(value, list) {
  return list.includes(value) ? value : list[0];
}

export const TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// overshoots a little and settles, like something landing on a spring
export const easeBack = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
// shortest signed difference between two angles
export const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

// A small seeded random generator, so procedural things look the same on
// every visit.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// sRGB hex (0xrrggbb) to linear [r, g, b]
export function lin(hex) {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(((hex >> 16) & 255) / 255), f(((hex >> 8) & 255) / 255), f((hex & 255) / 255)];
}

export const tick = () => new Promise((r) => setTimeout(r, 0));
