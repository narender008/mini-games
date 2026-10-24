// Last Line: the shared numbers. The battlefield is a fixed 720 x 1280 world
// (9:16) that the camera scales to fit the window; wider windows see more of
// the ground beside it, but play stays inside the field.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const COVER = QUERY.has('cover');

export const W = 720;
export const H = 1280;
// the extra ground drawn beside the field on wide windows, each side
export const SIDE = 520;

export const HORIZON = 120; // enemies come out of the fog bank below this
export const WIRE_Y = 930; // barbed wire in front of the line
export const LINE_Y = 975; // the sandbag wall: reach it and you hurt the line
export const ZONE = { x0: 48, x1: W - 48, y0: 1035, y1: 1225 }; // where the soldier may move
export const BARRIER_Y = [560, 905]; // where a barricade may be put down

export const STEP = 1 / 120;
export const MAX_STEPS = 12;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// seeded random so ?debug runs and the ground can be repeated
let seed = 1;
export function reseed(s) {
  seed = s >>> 0 || 1;
}
export function rnd() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rand = (a = 1, b) => (b === undefined ? rnd() * a : a + rnd() * (b - a));
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// angle difference wrapped to -PI..PI
export function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// does the segment (x0,y0)-(x1,y1) pass within r of (cx,cy)? returns t along it or -1
export function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-6) return fx * fx + fy * fy <= r * r ? 0 : -1;
  let t = -(fx * dx + fy * dy) / a;
  t = clamp(t, 0, 1);
  const px = fx + dx * t;
  const py = fy + dy * t;
  return px * px + py * py <= r * r ? t : -1;
}

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('last-line:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (DEBUG) return;
    try {
      localStorage.setItem('last-line:' + key, JSON.stringify(value));
    } catch {
      /* private window or storage off: nothing is kept */
    }
  },
};
