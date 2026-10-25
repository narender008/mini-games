// Seeded random numbers and small maths for the Ace sim. The sim never calls
// Math.random: every roll comes from a mulberry32 stream kept as a number on
// the state (S.rng), so a seed replays the same sector exactly.

export function makeRng(seed) {
  return { s: seed >>> 0 || 0x9e3779b9 };
}

// next float in [0, 1)
export function rnd(r) {
  let t = (r.s = (r.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const range = (r, a, b) => a + rnd(r) * (b - a);
export const chance = (r, p) => rnd(r) < p;
export const pickOne = (r, list) => list[Math.floor(rnd(r) * list.length)];

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const TAU = Math.PI * 2;

// shortest signed angle from a to b
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

// squared distance from point (px, py) to segment (ax, ay)-(bx, by)
export function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let k = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  k = k < 0 ? 0 : k > 1 ? 1 : k;
  const ex = ax + dx * k - px;
  const ey = ay + dy * k - py;
  return ex * ex + ey * ey;
}

// remove items failing keep(item) in place, keeping order, without allocating
export function compact(list, keep) {
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (keep(it)) list[j++] = it;
  }
  list.length = j;
}
