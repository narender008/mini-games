// Shared constants, the catalogue of modes, block sets, rooms and knock-down
// tools, and small helpers for settings kept on this device.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

export const MODES = ['little', 'big'];
export const SETS = ['wood', 'rainbow', 'letters'];
export const ROOMS = ['playroom', 'patio', 'bedtime'];
export const TOOLS = ['flick', 'ball', 'car', 'wrecker'];

export const LABELS = {
  little: 'Little ones',
  big: 'Big kid',
  wood: 'Natural wood',
  rainbow: 'Rainbow',
  letters: 'Letters & numbers',
  playroom: 'Sunny playroom',
  patio: 'Garden patio',
  bedtime: 'Cosy bedtime',
  flick: 'Finger flick',
  ball: 'Rolling ball',
  car: 'Wind-up car',
  wrecker: 'Wrecking ball',
};

const PREFIX = 'mini-games.block-tower.';

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
