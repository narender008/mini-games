// Shared constants, the catalogue of stages, balls and modes, and small
// helpers.
//
// Units are metres and seconds at real scale: the tanks are chunky toys about
// 19 cm long sitting in a real meadow, beach, garden, snowfield or forest. x runs
// along the lane (left and right on screen), y is up and z comes towards the
// camera. The game itself happens in the upright plane z = 0: tanks drive
// along x and balls fly in x and y, with the wind pushing along x. The
// scenery is fully 3D around that lane.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

// "Toy gravity": a ball lobbed across a metre of lawn at real gravity lands
// in well under a second, too quick to follow or enjoy. A gentler pull gives
// flights of one to two seconds.
export const GRAVITY = 1.9;
export const BALL_RADIUS = 0.026;
export const WIND_MAX = 0.5;
// muzzle speed for full power, m/s (enough to cross the widest stage)
export const POWER_MAX = 2.5;
export const POWER_MIN = 0.5;
// how far a tank may drive in one turn, metres
export const DRIVE_PER_TURN = 0.2;
export const DRIVE_SPEED = 0.09;

export const STAGES = ['meadow', 'beach', 'garden', 'snow', 'forest'];
export const MODES = ['cpu', 'duo', 'targets', 'little'];
export const LEVELS = ['easy', 'medium', 'hard'];
export const BALL_IDS = ['confetti', 'star', 'mud', 'snow', 'jelly', 'bouncy', 'triple'];

// what each stage's ground is made of, and the ball its picture shows
export const GROUND = { meadow: 'grass', beach: 'sand', garden: 'mud', snow: 'snow', forest: 'moss' };
export const SIGNATURE = { meadow: 'confetti', beach: 'star', garden: 'mud', snow: 'snow', forest: 'jelly' };

// Balls. wind: how much the wind moves it; crater: crater size; stars: stars
// needed to unlock (the five stage balls are always there); stain: the mark
// it leaves on a tank when that is not the ball's own colour (mud is brown).
export const BALLS = {
  confetti: { color: 0xff7a1a, wind: 1, crater: 1, stars: 0 },
  star: { color: 0x2a62e8, stain: 0xc9a24e, wind: 1, crater: 1, stars: 0 },
  mud: { color: 0xff4fb0, stain: 0x4e3521, wind: 0.6, crater: 1.2, stars: 0 },
  snow: { color: 0xf4f7ff, wind: 1.15, crater: 1, stars: 0 },
  jelly: { color: 0xff5ad0, stain: 0xd8405e, wind: 0.9, crater: 1.1, stars: 0 },
  bouncy: { color: 0xff3d6e, wind: 1, crater: 0.8, stars: 5, bounces: 3 },
  triple: { color: 0x9b5cff, wind: 1, crater: 0.65, stars: 12, split: 3 },
};

// (stages and balls share the word 'snow', so they have their own names)
export const STAGE_NAMES = {
  meadow: 'Meadow',
  beach: 'Beach',
  garden: 'Rainy garden',
  snow: 'Snowy peaks',
  forest: 'Pine forest',
};

export const LABELS = {
  cpu: 'Vs computer',
  duo: 'Two players',
  targets: 'Target practice',
  little: 'Little ones',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  confetti: 'Confetti ball',
  star: 'Star ball',
  mud: 'Mud ball',
  snow: 'Snowball',
  jelly: 'Rainbow jelly',
  bouncy: 'Bouncy ball',
  triple: 'Triple ball',
};

const PREFIX = 'mini-games.toy-tanks.';

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
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A small seeded random generator, so procedural scenery and level layouts
// come out the same on every visit.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Smooth value noise in 2D, for terrain and scatter.
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (noise2(x * f, y * f, seed + i * 17) * 2 - 1);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

// Smooth value noise in 3D, for rocks and tree crowns.
function hash3(x, y, z, seed) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(x - xi);
  const v = s(y - yi);
  const w = s(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

export function fbm3(x, y, z, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (noise3(x * f, y * f, z * f, seed + i * 17) * 2 - 1);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
