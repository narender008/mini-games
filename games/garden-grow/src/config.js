// Shared constants, the catalogue of plants, visitors, modes and settings,
// and small helpers for progress kept on this device.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

export const MODES = ['little', 'big', 'bedtime'];
export const TIMES = ['morning', 'golden', 'night'];
export const WEATHERS = ['sun', 'rain', 'rainbow'];
export const STYLES = ['cottage', 'planters', 'balcony'];

// Growth runs from 0 (a seed just planted) to 1 (full bloom, or ripe).
// Every species follows the same stage timeline, so the rules, sounds and
// effects can key off these thresholds whatever is growing.
export const STAGE = {
  seed: 0, // the seed sits in its little hole
  crack: 0.08, // the soil bulges and cracks
  sprout: 0.18, // a hooked shoot breaks through, seed leaves unfurl
  leaves: 0.35, // the stem climbs, true (veined) leaves open
  bud: 0.65, // a bud forms and swells
  open: 0.8, // petals start to unfold (vegetables: flowers, then fruit)
  bloom: 1, // full bloom (vegetables: ripe)
};

// Plant catalogue. Sizes are real garden sizes in metres at maturity
// (the sunflower is a dwarf variety so it stays in scale with the bed).
// `spacing` is the closest another plant may be planted.
export const PLANTS = {
  sunflower: { name: 'Sunflower', kind: 'flower', height: 0.85, spacing: 0.24, colors: ['#f6c21c'], attracts: ['goldfinch', 'bumblebee', 'honeybee', 'monarch'] },
  tulip: { name: 'Tulip', kind: 'flower', height: 0.4, spacing: 0.12, colors: ['#e0262c', '#f4c21f', '#f27ba3', '#8e3fb0', '#f7f1e4'], attracts: ['brimstone', 'honeybee'] },
  rose: { name: 'Rose', kind: 'flower', height: 0.55, spacing: 0.2, colors: ['#c8102e', '#f08aa8', '#f7b58a', '#fbf4ea'], attracts: ['red-admiral', 'ladybird'] },
  daisy: { name: 'Daisy', kind: 'flower', height: 0.32, spacing: 0.12, colors: ['#ffffff'], attracts: ['common-blue', 'ladybird', 'monarch'] },
  lavender: { name: 'Lavender', kind: 'flower', height: 0.45, spacing: 0.18, colors: ['#8a6cc8'], attracts: ['bumblebee', 'honeybee', 'cabbage-white'] },
  poppy: { name: 'Poppy', kind: 'flower', height: 0.5, spacing: 0.14, colors: ['#e3261b', '#f28a1c'], attracts: ['peacock', 'bumblebee'] },
  moonflower: { name: 'Moonflower', kind: 'flower', height: 0.5, spacing: 0.16, colors: ['#fbf7e8'], night: true, attracts: ['luna-moth', 'firefly'] },
  carrot: { name: 'Carrot', kind: 'veg', height: 0.28, spacing: 0.1, colors: ['#f07a1a'], harvest: 'pull', attracts: ['swallowtail', 'robin'] },
  pumpkin: { name: 'Pumpkin', kind: 'veg', height: 0.3, spacing: 0.34, colors: ['#e8751a'], harvest: 'pick', attracts: ['bumblebee', 'honeybee'] },
  strawberry: { name: 'Strawberry', kind: 'veg', height: 0.2, spacing: 0.14, colors: ['#d8202a'], harvest: 'pick', attracts: ['honeybee', 'blue-tit'] },
  tomato: { name: 'Tomato', kind: 'veg', height: 0.7, spacing: 0.22, colors: ['#e0301e'], harvest: 'pick', attracts: ['bumblebee', 'robin'] },
};
export const FLOWERS = Object.keys(PLANTS).filter((id) => PLANTS[id].kind === 'flower');
export const VEGETABLES = Object.keys(PLANTS).filter((id) => PLANTS[id].kind === 'veg');

// Garden visitors, as the visitors book lists them.
export const VISITORS = {
  monarch: { name: 'Monarch butterfly', group: 'butterfly' },
  peacock: { name: 'Peacock butterfly', group: 'butterfly' },
  'red-admiral': { name: 'Red admiral', group: 'butterfly' },
  'common-blue': { name: 'Common blue', group: 'butterfly' },
  brimstone: { name: 'Brimstone', group: 'butterfly' },
  'cabbage-white': { name: 'Cabbage white', group: 'butterfly' },
  swallowtail: { name: 'Swallowtail', group: 'butterfly' },
  bumblebee: { name: 'Bumblebee', group: 'bee' },
  honeybee: { name: 'Honeybee', group: 'bee' },
  ladybird: { name: 'Ladybird', group: 'beetle' },
  robin: { name: 'Robin', group: 'bird' },
  'blue-tit': { name: 'Blue tit', group: 'bird' },
  goldfinch: { name: 'Goldfinch', group: 'bird' },
  firefly: { name: 'Firefly', group: 'night' },
  'luna-moth': { name: 'Luna moth', group: 'night' },
};

const PREFIX = 'mini-games.garden-grow.';

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
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, v) => {
  const k = clamp((v - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
export const damp = (a, b, lambda, dt) => b + (a - b) * Math.exp(-lambda * dt);

// Small seeded random number generator, so a plant grows the same shape
// every frame it is rebuilt.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
