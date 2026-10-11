// Shared constants, URL switches and small maths helpers.
//
// Space: metres. The ground plane is (x, y) with x east and y SOUTH (down
// the screen); z is height. The camera looks north and down at ELEV degrees,
// orthographic, so a ground point (x, y, z) lands on the screen at
// (x, y * SIN_E - z * COS_E) screen-metres (DESIGN.md section 2).

export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const COVER = QUERY.has('cover');
export const PLAY = QUERY.has('play');

export const ELEV = 50; // degrees; must match blender/bl.py ELEV
export const SIN_E = Math.sin((ELEV * Math.PI) / 180);
export const COS_E = Math.cos((ELEV * Math.PI) / 180);

// the view shows about this many square screen-metres, whatever the window's shape
export const VIEW_AREA = 370;
export const VIEW_MIN_SIDE = 11;
export const VIEW_MAX_SIDE = 38;

// fixed simulation step (the frame interpolates between steps)
export const STEP = 1 / 120;
export const MAX_STEPS = 12;

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const angleDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const approach = (v, target, rate) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));
// frame-rate independent exponential smoothing toward a target
export const damp = (v, target, k, dt) => target + (v - target) * Math.exp(-k * dt);

// A small seeded PRNG (mulberry32) so runs, layouts and effects are repeatable
// when seeded; `rng` is the shared game stream, `fxRand` the cosmetic one.
export class Rng {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  seed(s) {
    this.s = s >>> 0 || 1;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  // weighted pick: items with a numeric `weight` (or a weight function)
  weighted(items, w = (i) => i.weight) {
    let total = 0;
    for (const it of items) total += Math.max(0, w(it));
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, w(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}

export const rng = new Rng((Math.random() * 2 ** 32) >>> 0);
export const fxRand = new Rng(12345);
