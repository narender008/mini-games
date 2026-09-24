// Shared constants, the catalogue of weapons, worlds, enemy styles and
// modes, and small helpers for settings kept on this device.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

// One grid cell of the play field, in world units. Enemies are about a cell.
export const CELL = 1;
// How many more cells the camera shows than the original layout. Everything in
// play (rocket, toys, shots, bursts) looks this much smaller on screen, and
// screen-relative speeds and distances are multiplied by it to feel the same.
export const VIEW_ZOOM = 1.3;
// Most toys each enemy style can draw at once (alive, popping and the boss).
// Free Blast keeps its grid below this with room for toys still popping.
export const TOY_CAPACITY = 240;

export const WEAPONS = ['laser', 'rocket', 'bubble', 'rainbow'];
export const WORLDS = ['sunny', 'night', 'storm', 'clouds', 'grass', 'space'];
export const STYLES = ['blocks', 'aliens', 'robots'];
export const MODES = ['little', 'big', 'free'];

// Candy-bright toy colours (sRGB). Every enemy style draws from these.
export const TOY_COLORS = ['#ff3b3b', '#2f7dff', '#2fc85a', '#ffc21a', '#ff8a1f', '#a45bff', '#ff5fb3', '#16c7c7'];

const PREFIX = 'mini-games.rocket-blast.';

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

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);
