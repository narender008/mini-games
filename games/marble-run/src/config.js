// Shared constants, the catalogue of levels and modes, and small helpers for
// settings and progress kept on this device.
//
// Units are metres, y is up, the table (or base) top is y = 0 and the camera
// looks from +z (the front) towards -z. Everything is toy-sized: glass
// marbles 19 mm across, 5 cm blocks, runs about half a metre tall.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

export const R_MARBLE = 0.0095; // glass marble radius
export const CELL = 0.05; // build grid: one block
export const LEVEL = 0.01; // build grid: one height step
export const PORT_Y = 0.021; // marble centre height above a piece's level at its ports
export const PORT_SLOPE = 0.105; // every join runs downhill at this slope (about 6 degrees)

export const LEVELS = ['sunny', 'crystal', 'storybook', 'cosmic'];
export const MODES = ['little', 'big'];

export const LABELS = {
  sunny: 'Sunny Playroom',
  crystal: 'Crystal Night',
  storybook: 'Storybook Kingdom',
  cosmic: 'Cosmic Observatory',
  little: 'Little ones',
  big: 'Big kid',
};

const PREFIX = 'mini-games.marble-run.';

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

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// A small seeded random generator, so procedural props look the same on
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
