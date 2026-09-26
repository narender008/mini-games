// Shared constants, the catalogue of places, boats and modes, and small
// helpers for settings and best times kept on this device.
//
// Units are metres and seconds, y is up and the calm water surface is y = 0.
// Boats and animals face -z in their own space (like a three.js camera), so
// an object with rotation.y = heading travels along
// (-sin(heading), 0, -cos(heading)) and its right-hand side is
// (cos(heading), 0, -sin(heading)).
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

export const PLACES = ['lagoon', 'lake', 'canal', 'bay'];
export const BOATS = ['speedboat', 'sailboat', 'duck', 'jetski'];
export const MODES = ['little', 'big'];
export const STEERS = ['touch', 'tilt'];

export const LABELS = {
  lagoon: 'Tropical Lagoon',
  lake: 'Sunset Lake',
  canal: 'Canal Town',
  bay: 'Glowing Night Bay',
  speedboat: 'Speedboat',
  sailboat: 'Sailboat',
  duck: 'Duck boat',
  jetski: 'Jet ski',
  little: 'Little ones',
  big: 'Big kid',
  touch: 'Touch',
  tilt: 'Tilt',
};

const PREFIX = 'mini-games.splash-ride.';

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
  } catch {
    /* storage may be unavailable (private mode) */
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
// shortest signed difference between two angles
export const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

// A small seeded random generator, so procedural scenery looks the same on
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
