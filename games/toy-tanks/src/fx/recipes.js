// What each burst is made of, in layers that build and release with weight.
//
//   contact    0-60 ms    a brief warm flash that lights the ground and tanks
//                         around the impact (one point light owned by the Fx)
//                         and a small bright core
//   shockwave  30-200 ms  a fast low ring of dust, powder or spray running out
//                         along the ground (shock.js); for a splash in water,
//                         a crown that rises and folds back
//   puff       100 ms-2 s a billowing cloud of the ground's own material, lit
//                         as a volume (soft.js), drifting downwind, thinning out
//   ejecta                fine grains, powder and droplets on real ballistic
//                         arcs that land on the real ground (grains.js); paper,
//                         gel and mud from the ball itself; light crumbs only,
//                         the heavier chunks are the physics world's
//   secondary  150-600 ms small puffs where the debris lands, a patter of them
//   marks                 splats and stains that stay; paper and glitter that
//                         lie where they fall until the round ends
//
// Sizes are in metres for a 5 cm ball beside 19 cm tanks, scaled by the Fx's
// PRESENCE (2.6, see index.js): a great hit reaches about 0.65 m from the
// impact (1.3 m across), an ordinary one about 0.45 m. A hit high on a tank
// (B.hi) throws only what the ball is made of. Nothing here allocates: numbers in, pool slots out.
import { TAU, rnd, rr, PAPER, GLITTER, GEL, MUD, WATER_TONES, BEADS, PIGMENT, GROUND_KIT, randomColorIndex } from './common.js';
import { PUFF, FLASH, DOT, RING } from './soft.js';
import { G_BEAD, G_GLITTER, G_DROP } from './grains.js';
import { K_JELLY, K_MUD, K_WATER, K_CLOD, K_CANDY } from './solid.js';

const D = new Float32Array(3); // a sampled direction
const NO_FLOOR = -1000;
const TONE = new Float32Array(3);
const TONE2 = new Float32Array(3);
const WHITE3 = new Float32Array([1, 1, 1]);
const GELC = new Float32Array(3);

// direction with sin(elevation) between lo and hi; shape > 1 favours the low end
function dir(lo, hi, shape) {
  const sinE = lo + (hi - lo) * Math.pow(rnd(), shape);
  const cosE = Math.sqrt(Math.max(0, 1 - sinE * sinE));
  const a = rnd() * TAU;
  D[0] = cosE * Math.cos(a);
  D[1] = sinE;
  D[2] = cosE * Math.sin(a);
}

const cnt = (n, cm) => Math.max(1, Math.round(n * cm));

// out = a*(1-w) + b*w
function mix3(out, a, b, w) {
  out[0] = a[0] * (1 - w) + b[0] * w;
  out[1] = a[1] * (1 - w) + b[1] * w;
  out[2] = a[2] * (1 - w) + b[2] * w;
  return out;
}

// how high paper and glitter lie above the ground, by ground (grass blades hold them up)
const LIFT_G = { grass: 0.01, moss: 0.007, mud: 0.005, sand: 0.0007, snow: 0.0005, air: 0.0007 };

// ---------------------------------------------------------------------------
// soft particle helpers (see soft.js for the attribute layout)
function puff(S, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav, wind, floorY, lit, delay = 0, erode = 0, fadeIn = 0.03) {
  S.spawn(x, y, z, vx, vy, vz, life, s0, s1, PUFF, r, g, b, a, drag, grav, wind, floorY, fadeIn, lit, (rnd() - 0.5) * 0.9, erode, delay);
}
function flash(S, x, y, z, life, size, r, g, b, a, delay = 0) {
  S.spawn(x, y, z, 0, 0, 0, life, size * 0.55, size, FLASH, r, g, b, a, 0, 0, 0, NO_FLOOR, 0, 0, 0, 0, delay);
}
function dot(S, x, y, z, vx, vy, vz, life, size, r, g, b, a, drag, grav, wind, floorY, lit, delay = 0) {
  S.spawn(x, y, z, vx, vy, vz, life, size, size, DOT, r, g, b, a, drag, grav, wind, floorY, 0.01, lit, 0, 0, delay);
}

// ---------------------------------------------------------------------------
// 1. contact: the flash and its bright core. k scales both (a wet slap flashes
// less than a bright glitter ball).
function contact(fx, B, k) {
  const S = fx.soft;
  // the flash grows more slowly than the burst: a bigger pop, never a glare
  const s = Math.pow(B.size, 0.6) * (B.great ? 1.15 : 0.85);
  const kk = k * (B.water ? 0.6 : 1);
  fx.flashLight(B.x, B.y + (B.hi ? 0.01 : 0.04), B.z, kk * (B.great ? 1 : 0.72) * Math.sqrt(B.size));
  const y = B.y + (B.hi ? 0.008 : 0.03);
  flash(S, B.x, y, B.z, 0.075, 0.02 * s, 1.0, 0.93, 0.8, 0.62 * kk);
  flash(S, B.x, y, B.z, 0.04, 0.008 * s, 1.0, 1.0, 0.96, 0.75 * kk);
}

// ---------------------------------------------------------------------------
// 2. shockwave: the low ring
function ring(fx, B) {
  if (B.hi) {
    // on a tank: dust jumping off the surface all round the point of impact, seen as a thin ring
    const t = B.ball === 'snow' ? 1.02 : B.ball === 'mud' ? 0.42 : 0.86;
    // (small and faint: any bigger and it reads as a soap bubble round the burst)
    fx.soft.spawn(B.x, B.y, B.z + 0.03, 0, 0, 0, 0.16, 0.01 * B.size, 0.06 * Math.sqrt(B.reach), RING, t, t * 0.97, t * 0.9, 0.28, 0, 0, 0, NO_FLOOR, 0, 1, 0, 0, 0.012);
    return;
  }
  const kit = B.kit;
  const sh = fx.shock;
  const R = B.ext * 0.95;
  if (B.water) {
    // a crown of thin water that stands up and folds back, and a low ring of spray beneath it
    const tint = B.ball === 'mud' ? 0.62 : 1;
    sh.spawn(B.x, B.wy, B.z, 0.085 * B.reach, 0.055 * B.reach, 0.5, 0.78 * tint, 0.74 * tint, 0.66 * tint, 0.55, 0, 2);
    sh.spawn(B.x, B.wy, B.z, R * 0.85, 0.012 * B.reach, 0.34, 0.9, 0.88, 0.82, 0.38, 0.35, 1, 0.03);
    return;
  }
  const g = B.ground;
  if (g === 'snow') sh.spawn(B.x, B.gy, B.z, R, 0.022 * B.reach, 0.3, 1, 1, 1, 0.55, 0.32, 1);
  else if (g === 'mud') sh.spawn(B.x, B.gy, B.z, R * 0.9, 0.016 * B.reach, 0.28, 0.85, 0.79, 0.7, 0.4, 0.3, 1);
  else sh.spawn(B.x, B.gy + 0.002, B.z, R, 0.022 * B.reach, 0.28, kit.dust[0], kit.dust[1], kit.dust[2], g === 'sand' ? 0.6 : 0.5, 0.3, 0);
}

// ---------------------------------------------------------------------------
// 3. the puff: a cloud of puffs gathered, sorted far to near and thrown, so the
// overlaps composite like one cloud. A skirt runs out low and stops; a column
// rises in the middle and billows. spec: see CLOUD.
const PFN = 20;
const PF = new Float32Array(72 * PFN);
const PI = new Uint8Array(72);
const PK = new Float32Array(72);

function cloud(fx, B, c, tone, aMul, wave2) {
  const S = fx.soft;
  const cam = fx.camera.position;
  const reach = B.reach;
  const rs = Math.pow(reach, 0.85);
  const n = Math.min(70, Math.max(3, Math.round(c.n * B.cmSoft * (wave2 ? 0.4 : 1))));
  const colFrac = Math.min(0.9, c.col * (wave2 ? 1.9 : 1));
  const floorY = B.hi ? NO_FLOOR : B.gy + 0.006;
  const baseY = B.hi ? B.y : B.gy + 0.01;
  for (let k = 0; k < n; k++) {
    const o = k * PFN;
    const column = rnd() < colFrac;
    let x = B.x;
    let z = B.z;
    let y = baseY;
    let vx;
    let vy;
    let vz;
    let drag;
    let s0;
    let s1;
    let delay;
    let lift;
    if (B.hi) {
      // a hit on a tank: a burst out of the point of impact, in every direction
      dir(-0.35, 1, 1);
      const sp = rr(0.25, 0.75) * B.sm;
      vx = D[0] * sp;
      vy = D[1] * sp;
      vz = D[2] * sp;
      drag = rr(3.4, 4.4);
      s0 = rr(0.012, 0.02) * B.size;
      s1 = rr(c.s1cA, c.s1cB) * rs * 0.8;
      delay = rr(0.01, 0.07);
      lift = c.lift * 0.6;
    } else if (column) {
      const a = rnd() * TAU;
      const out = rr(0.02, 0.22) * reach;
      vx = Math.cos(a) * out;
      vz = Math.sin(a) * out;
      vy = rr(c.upA, c.upB) * B.sm * (0.7 + 0.3 * reach);
      drag = rr(2.4, 3.3);
      const rad = rr(0.002, 0.014) * B.size;
      x += Math.cos(a) * rad;
      z += Math.sin(a) * rad;
      s0 = rr(0.018, 0.028) * B.size;
      s1 = rr(c.s1cA, c.s1cB) * rs * rr(0.75, 1.25);
      delay = rr(0.035, 0.11);
      lift = c.lift;
    } else {
      const a = ((k + rnd() * 0.8) / n) * TAU;
      const out = rr(c.outA, c.outB) * B.sm * (0.6 + 0.4 * reach);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      vx = ca * out;
      vz = sa * out;
      vy = rr(0.03, 0.2) * reach;
      drag = rr(3.7, 4.8);
      const rad = rr(0.006, 0.022) * B.size;
      x += ca * rad;
      z += sa * rad;
      s0 = rr(0.012, 0.02) * B.size;
      s1 = rr(c.s1sA, c.s1sB) * rs * rr(0.7, 1.3);
      delay = rr(0.015, 0.06);
      lift = c.lift * 0.5;
    }
    vx += B.bx * (column ? 0.5 : 0.8);
    PF[o] = x;
    PF[o + 1] = y + rr(0, 0.008);
    PF[o + 2] = z;
    PF[o + 3] = vx;
    PF[o + 4] = vy;
    PF[o + 5] = vz;
    PF[o + 6] = rr(c.lifeA, c.lifeB) * (wave2 ? 0.8 : 1);
    PF[o + 7] = s0;
    PF[o + 8] = s1;
    PF[o + 9] = drag;
    PF[o + 10] = lift * rr(0.75, 1.25);
    PF[o + 11] = delay + (wave2 ? 0 : 0);
    PF[o + 12] = rr(0.92, 1.08);
    PF[o + 13] = c.alpha * aMul * rr(0.8, 1.15) * (column ? 1 : 0.85);
    PF[o + 14] = rr(c.eroLo, c.eroHi);
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    PK[k] = dx * dx + dy * dy + dz * dz;
    PI[k] = k;
  }
  for (let i = 1; i < n; i++) {
    const v = PI[i];
    const key = PK[v];
    let j = i - 1;
    while (j >= 0 && PK[PI[j]] < key) {
      PI[j + 1] = PI[j];
      j--;
    }
    PI[j + 1] = v;
  }
  for (let m = 0; m < n; m++) {
    const o = PI[m] * PFN;
    const t = PF[o + 12];
    puff(S, PF[o], PF[o + 1], PF[o + 2], PF[o + 3], PF[o + 4], PF[o + 5], PF[o + 6], PF[o + 7], PF[o + 8], tone[0] * t, tone[1] * t, tone[2] * t, PF[o + 13], PF[o + 9], PF[o + 10], c.wind, floorY, 1, PF[o + 11], PF[o + 14]);
  }
}

// the cloud of each ground: n puffs at a great hit; the skirt runs out at
// out A..B (m/s), the column rises at up A..B, and each grows to its s1 (m);
// alpha, lift (negative rises), col (fraction that are column), wind, erosion
const CLOUD = {
  grass: { n: 39, outA: 0.45, outB: 0.8, upA: 0.375, upB: 0.875, s1sA: 0.03, s1sB: 0.057, s1cA: 0.038, s1cB: 0.071, lifeA: 0.95, lifeB: 1.6, alpha: 0.292, lift: -0.09, col: 0.36, wind: 1.3, eroLo: 0.25, eroHi: 0.55 },
  sand: { n: 42, outA: 0.5, outB: 0.85, upA: 0.336, upB: 0.78, s1sA: 0.036, s1sB: 0.07, s1cA: 0.044, s1cB: 0.08, lifeA: 0.9, lifeB: 1.5, alpha: 0.346, lift: -0.05, col: 0.3, wind: 1.5, eroLo: 0.25, eroHi: 0.55 },
  mud: { n: 21, outA: 0.55, outB: 0.95, upA: 0.28, upB: 0.6, s1sA: 0.024, s1sB: 0.043, s1cA: 0.028, s1cB: 0.047, lifeA: 0.7, lifeB: 1.1, alpha: 0.173, lift: 0.1, col: 0.3, wind: 1.2, eroLo: 0.3, eroHi: 0.6 },
  snow: { n: 45, outA: 0.4, outB: 0.8, upA: 0.28, upB: 0.64, s1sA: 0.043, s1sB: 0.077, s1cA: 0.047, s1cB: 0.081, lifeA: 1.4, lifeB: 2.2, alpha: 0.324, lift: -0.15, col: 0.4, wind: 1.7, eroLo: 0.2, eroHi: 0.45 },
  moss: { n: 36, outA: 0.45, outB: 0.8, upA: 0.35, upB: 0.812, s1sA: 0.03, s1sB: 0.056, s1cA: 0.037, s1cB: 0.069, lifeA: 0.95, lifeB: 1.5, alpha: 0.262, lift: -0.08, col: 0.34, wind: 1.3, eroLo: 0.25, eroHi: 0.55 },
  air: { n: 27, outA: 0.45, outB: 0.8, upA: 0.33, upB: 0.77, s1sA: 0.03, s1sB: 0.057, s1cA: 0.037, s1cB: 0.067, lifeA: 0.9, lifeB: 1.4, alpha: 0.233, lift: -0.09, col: 0.3, wind: 1.3, eroLo: 0.25, eroHi: 0.55 },
  // spray over water: a thin mist
  water: { n: 18, outA: 0.5, outB: 0.9, upA: 0.35, upB: 0.75, s1sA: 0.027, s1sB: 0.044, s1cA: 0.03, s1cB: 0.051, lifeA: 0.7, lifeB: 1.1, alpha: 0.13, lift: 0.02, col: 0.4, wind: 1.2, eroLo: 0.3, eroHi: 0.65 },
};
CLOUD.snowSoft = { ...CLOUD.snow, alpha: 0.24 };

// the cloud's colour: the ground's own dust, and for the balls that carry
// powder a share of natural pigment
function dustTone(B, pig, w) {
  const kit = B.kit;
  if (pig) return mix3(TONE, kit.dust, pig, w);
  TONE[0] = kit.dust[0];
  TONE[1] = kit.dust[1];
  TONE[2] = kit.dust[2];
  return TONE;
}

function puffCloud(fx, B, wave2, pig, w, aMul) {
  const c = (B.water ? CLOUD.water : CLOUD[B.ground]) || CLOUD.grass;
  let tone = dustTone(B, pig, w);
  if (B.water) tone = mix3(TONE2, tone, B.ball === 'mud' ? MUD : WATER_TONES, 0.6);
  cloud(fx, B, c, tone, aMul * (B.hi ? 0.9 : 1), wave2);
}

// ---------------------------------------------------------------------------
// 4. ejecta

// a spray of fine grains
function sprinkle(fx, B, pal, n, radA, radB, spA, spB, elA, elB, dragA, dragB, gsc, wk, lifeA, lifeB, kind, stay, pop, alpha, tone, delayMax) {
  const G = fx.grains;
  const zs = B.size;
  for (let k = 0; k < n; k++) {
    dir(elA, elB, 1);
    const sp = rr(spA, spB) * B.sm;
    const ci = randomColorIndex(pal);
    const t = tone * rr(0.88, 1.12);
    const rad = rr(radA, radB) * zs;
    const off = 0.012 * B.size;
    G.spawn(B.x + D[0] * off, B.y + (B.hi ? 0 : 0.008) + D[1] * off * 0.5, B.z + D[2] * off, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rad, pal[ci * 3] * t, pal[ci * 3 + 1] * t, pal[ci * 3 + 2] * t, alpha, rr(lifeA, lifeB),
      kind, rr(dragA, dragB), gsc, wk, stay, LIFT_G[B.ground] || 0.0007, pop, B.floor, delayMax > 0 ? rr(0, delayMax) : 0);
  }
}

// crumbs of earth or snow: small, light, real blobs
function crumbs(fx, B, pal, n, rA, rB, spA, spB, lifeA, lifeB, rough, grain, lump, breakT) {
  const blobs = fx.blobs;
  for (let k = 0; k < n; k++) {
    dir(0.5, 0.97, 1.2);
    const sp = rr(spA, spB) * B.sm;
    const R = rr(rA, rB) * B.size;
    const ci = randomColorIndex(pal);
    const j = blobs.spawn(K_CLOD, B.x + D[0] * 0.02, B.gy + R + 0.004, B.z + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, pal[ci * 3], pal[ci * 3 + 1], pal[ci * 3 + 2], rr(lifeA, lifeB));
    blobs.look(j, rough, 0, lump, grain, -1);
    if (breakT > 0 && rnd() < 0.7) blobs.breakT[j] = rr(breakT, breakT * 2.2);
  }
}

// what a hit on the ground throws up, by ground
function grit(fx, B, wave2) {
  if (B.hi || B.water) return;
  const kit = B.kit;
  const k = wave2 ? 0.45 : 1;
  const cm = B.cm * k;
  const ox = B.x;
  const oz = B.z;
  const gy = B.gy;
  const g = B.ground;
  if (g === 'grass') {
    sprinkle(fx, B, kit.soil, cnt(80, cm), 0.0006, 0.0013, 0.5, 1.9, 0.2, 0.95, 0.9, 1.5, 1, 0.7, 1.1, 1.9, G_BEAD, 0, 0.05, 1, 1, 0);
    // the crown: a low curtain of fine dirt thrown out of the crater rim
    sprinkle(fx, B, kit.soil, cnt(34, cm), 0.0006, 0.0012, 1.0, 1.9, 0.12, 0.4, 0.9, 1.4, 1, 0.7, 0.9, 1.4, G_BEAD, 0, 0.05, 1, 1, 0.03);
    crumbs(fx, B, kit.soil, cnt(5, cm * B.debrisK), 0.0016, 0.003, 0.6, 1.4, 1.3, 2.2, 0.95, 0.75, 0.32, 0);
    const nb = cnt(11, cm);
    for (let i = 0; i < nb; i++) {
      dir(0.35, 1, 1);
      const sp = rr(0.6, 1.6) * B.sm;
      const ci = randomColorIndex(kit.bit);
      fx.flat.spawn(ox + D[0] * 0.02, gy + 0.01, oz + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.012, 0.022) * B.size, rr(0.0022, 0.0035) * B.size, 3, rr(-0.8, 0.8), 0, kit.bit[ci * 3], kit.bit[ci * 3 + 1], kit.bit[ci * 3 + 2],
        rr(2.4, 4), rr(6, 9), rr(1.2, 2), 1, 2, rr(6, 18));
    }
  } else if (g === 'sand') {
    sprinkle(fx, B, kit.soil, cnt(150, cm), 0.0007, 0.0014, 0.5, 2.0, 0.2, 0.95, 0.8, 1.3, 1, 0.6, 0.9, 1.5, G_BEAD, 0, 0.05, 1, 1.12, 0);
    sprinkle(fx, B, kit.soil, cnt(56, cm), 0.0007, 0.0013, 1.0, 2.0, 0.1, 0.38, 0.8, 1.2, 1, 0.6, 0.8, 1.2, G_BEAD, 0, 0.05, 1, 1.12, 0.03);
    crumbs(fx, B, kit.soil, cnt(4, cm * B.debrisK), 0.0016, 0.0032, 0.5, 1.3, 1.2, 2, 0.95, 0.65, 0.3, 0);
  } else if (g === 'mud') {
    // wet ground: heavier, darker spray and a few flecks of mud
    sprinkle(fx, B, kit.soil, cnt(46, cm), 0.0006, 0.0012, 0.7, 2.0, 0.25, 1, 0.8, 1.2, 1.1, 0.5, 0.9, 1.5, G_DROP, 0, 0.03, 0.95, 1, 0);
    const blobs = fx.blobs;
    const nm = cnt(7, cm * B.debrisK);
    for (let i = 0; i < nm; i++) {
      dir(0.45, 0.95, 1);
      const sp = rr(0.6, 1.4) * B.sm;
      const R = rr(0.0025, 0.0055) * B.size;
      const ci = randomColorIndex(kit.soil);
      const j = blobs.spawn(K_MUD, ox + D[0] * 0.02, gy + 0.006, oz + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, kit.soil[ci * 3], kit.soil[ci * 3 + 1], kit.soil[ci * 3 + 2], rr(2, 3));
      blobs.tail(j, rr(0.4, 1.2), 5, 0);
      blobs.look(j, 0.16, 0, 0.14, 0.25, 0.5);
    }
  } else if (g === 'snow') {
    sprinkle(fx, B, kit.soil, cnt(120, cm), 0.0007, 0.0015, 0.4, 1.8, 0.15, 1, 2.4, 4, 0.35, 1.6, 1.5, 2.8, G_BEAD, 0, 0.07, 0.95, 1.05, 0);
    sprinkle(fx, B, kit.soil, cnt(34, cm), 0.0007, 0.0013, 0.9, 1.8, 0.1, 0.4, 2, 3.4, 0.4, 1.4, 1.2, 2.0, G_BEAD, 0, 0.07, 0.95, 1.05, 0.03);
    crumbs(fx, B, kit.soil, cnt(6, cm * B.debrisK), 0.0028, 0.0055, 0.5, 1.4, 1.0, 1.7, 0.85, 0.45, 0.35, 0.3);
    // ice crystals catching the sun
    const G = fx.grains;
    const nc = cnt(24, cm);
    for (let i = 0; i < nc; i++) {
      dir(0.2, 1, 1);
      const sp = rr(0.4, 1.6) * B.sm;
      G.spawn(ox, gy + 0.012, oz, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.0005, 0.0009) * B.size, 0.9, 0.95, 1.05, 0.95, rr(1.4, 2.4), G_GLITTER, rr(2.4, 3.6), 0.4, 1.4, 0, 0, 0, B.floor, rr(0, 0.05));
    }
  } else {
    // moss and forest floor: earth, moss and pine needles
    sprinkle(fx, B, kit.soil, cnt(56, cm), 0.0006, 0.0013, 0.5, 1.8, 0.2, 0.95, 0.9, 1.5, 1, 0.7, 1.1, 1.8, G_BEAD, 0, 0.05, 1, 1, 0);
    crumbs(fx, B, kit.soil, cnt(4, cm * B.debrisK), 0.0016, 0.003, 0.55, 1.4, 1.3, 2.2, 0.95, 0.7, 0.32, 0);
    crumbs(fx, B, kit.bit, cnt(4, cm * B.debrisK), 0.002, 0.004, 0.5, 1.3, 1.4, 2.4, 0.95, 0.6, 0.4, 0);
    const nn = cnt(8, cm);
    for (let i = 0; i < nn; i++) {
      dir(0.4, 1, 1);
      const sp = rr(0.6, 1.6) * B.sm;
      fx.flat.spawn(ox, gy + 0.01, oz, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.016, 0.026) * B.size, 0.0016 * B.size, 3, 0, 0, 0.3 + rnd() * 0.15, 0.25 + rnd() * 0.1, 0.09, rr(2.4, 4), rr(6, 9), rr(1, 1.8), 1, 1.5, rr(5, 14));
    }
  }
}

// ---------------------------------------------------------------------------
// a splash in water: a crown of droplets on thin necks, drops falling back, mist
function splash(fx, B, wave2, muddy) {
  const blobs = fx.blobs;
  const G = fx.grains;
  const k = wave2 ? 0.4 : 1;
  const cm = B.cm * k;
  const wy = B.wy;
  // the crown's drops: leave the rim, on tails
  const nd = cnt(16, cm);
  for (let i = 0; i < nd; i++) {
    const a = ((i + rnd() * 0.85) / nd) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const el = rr(0.8, 1.3);
    const sp = rr(0.8, 1.7) * B.sm;
    const rad = rr(0.025, 0.05) * B.size;
    const R = rr(0.002, 0.0042) * B.size;
    const ci = randomColorIndex(WATER_TONES);
    const t = muddy ? 0.95 : 1.15;
    const j = blobs.spawn(K_WATER, B.x + ca * rad, wy + 0.004, B.z + sa * rad, ca * Math.cos(el) * sp + B.bx, Math.sin(el) * sp, sa * Math.cos(el) * sp, R, WATER_TONES[ci * 3] * t, WATER_TONES[ci * 3 + 1] * t, WATER_TONES[ci * 3 + 2] * t, rr(1.6, 2.4));
    blobs.tail(j, rr(0.5, 1.4), 6, 0);
    blobs.floor(j, wy);
  }
  // finer drops thrown up and out, falling back
  const t = muddy ? 0.75 : 1.05;
  sprinkle(fx, B, WATER_TONES, cnt(90, cm), 0.0005, 0.0012, 0.7, 2.2, 0.3, 1, 0.9, 1.3, 1, 0.4, 0.9, 1.4, G_DROP, 0, 0.05, 0.95, t, 0);
  // a mist that hangs a moment
  const nm = cnt(26, cm);
  for (let i = 0; i < nm; i++) {
    dir(0.25, 1, 1);
    const sp = rr(0.5, 1.6) * B.sm;
    dot(fx.soft, B.x, wy + 0.01, B.z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.5, 1.0), rr(0.0007, 0.0015) * B.size, 0.85 * t, 0.83 * t, 0.78 * t, 0.7, 1.2, 1.1, 1, wy, 1);
  }
  if (muddy) {
    // flecks of mud round the edge
    const nf = cnt(9, cm);
    for (let i = 0; i < nf; i++) {
      dir(0.3, 0.8, 1);
      const sp = rr(0.8, 1.6) * B.sm;
      const R = rr(0.003, 0.0065) * B.size;
      const ci = randomColorIndex(MUD);
      const j = blobs.spawn(K_MUD, B.x + D[0] * 0.03, wy + 0.008, B.z + D[2] * 0.03, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, MUD[ci * 3], MUD[ci * 3 + 1], MUD[ci * 3 + 2], rr(2, 3));
      blobs.tail(j, rr(0.5, 1.4), 5, 0);
      blobs.look(j, 0.14, 0, 0.12, 0.2, 0.5);
      blobs.floor(j, wy);
    }
  }
}

// ---------------------------------------------------------------------------
// paper: tissue-paper confetti of real paper colours: punched circles, squares,
// torn pieces, curling streamers and a few foil flecks. The plate physics in
// solid.js does the tumbling, fluttering and settling.
function paper(fx, B, n, pal, life, scale) {
  const flat = fx.flat;
  const lift = LIFT_G[B.ground] || 0.0007;
  const floor = B.floor;
  const zs = B.size * scale;
  for (let k = 0; k < n; k++) {
    dir(B.hi ? -0.3 : 0.22, 1, 0.75);
    const sp = (0.45 + 1.0 * Math.pow(rnd(), 1.4)) * B.sm;
    const ci = randomColorIndex(pal);
    const r = rnd();
    let sx;
    let sy;
    let shape = 0;
    let bend = 0;
    let foil = 0;
    let cr = pal[ci * 3];
    let cg = pal[ci * 3 + 1];
    let cb = pal[ci * 3 + 2];
    if (r < 0.34) {
      sx = rr(0.006, 0.009);
      sy = sx;
      shape = 1;
    } else if (r < 0.72) {
      sx = rr(0.008, 0.012);
      sy = sx * rr(0.55, 0.95);
      if (rnd() < 0.2) bend = rr(0.4, 1.0) * (rnd() < 0.5 ? -1 : 1);
    } else if (r < 0.85) {
      sx = rr(0.009, 0.013);
      sy = sx * rr(0.6, 1.1);
      shape = 2;
    } else if (r < 0.93) {
      sx = rr(0.022, 0.034);
      sy = sx * rr(0.1, 0.15);
      bend = rr(1.8, 4) * (rnd() < 0.5 ? -1 : 1);
    } else {
      sx = rr(0.005, 0.008);
      sy = sx * rr(0.8, 1);
      shape = rnd() < 0.5 ? 1 : 0;
      foil = 1;
      const gi = randomColorIndex(GLITTER);
      cr = GLITTER[gi * 3];
      cg = GLITTER[gi * 3 + 1];
      cb = GLITTER[gi * 3 + 2];
    }
    const o = 0.012 * B.size;
    flat.spawn(B.x + D[0] * o, B.y + 0.012 + D[1] * o, B.z + D[2] * o, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, sx * zs, sy * zs, shape, bend, foil, cr, cg, cb,
      life * rr(0.9, 1), rr(9, 13), rr(3.2, 5.5), rr(0.55, 0.85), rr(1.6, 3), rr(8, 22), lift, floor);
  }
}

// ---------------------------------------------------------------------------
// the balls

function confetti(fx, B, wave2) {
  const S = fx.soft;
  paper(fx, B, cnt(wave2 ? 40 : 120, B.cm), PAPER, 200, 1.15);
  // a puff of the powdery paper dust, natural ochre, mixed into the ground's own
  puffCloud(fx, B, wave2, PIGMENT.confetti, 0.25, 1);
  grit(fx, B, wave2);
  if (B.water) splash(fx, B, wave2, false);
  // a scatter of fine fibres in the air
  if (!wave2) {
    const nf = cnt(14, B.cm);
    for (let k = 0; k < nf; k++) {
      dir(0.2, 1, 1);
      const sp = rr(0.3, 1.1) * B.sm;
      dot(S, B.x, B.y + 0.015, B.z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.9, 1.6), rr(0.0006, 0.0011) * B.size, 0.95, 0.9, 0.8, 0.7, 2.5, 0.2, 2, B.hi ? NO_FLOOR : B.gy, 1, rr(0, 0.05));
    }
  }
}

function star(fx, B, wave2) {
  const G = fx.grains;
  const lift = LIFT_G[B.ground] || 0.0007;
  // glitter: metal flakes that tumble, flash when they catch the sun, and lie where they fall
  const n = cnt(wave2 ? 40 : 110, B.cm);
  for (let k = 0; k < n; k++) {
    dir(B.hi ? -0.3 : 0.2, 1, 0.85);
    const sp = rr(0.8, 2.4) * B.sm;
    const ci = randomColorIndex(GLITTER);
    const t = rr(0.9, 1.1);
    G.spawn(B.x + D[0] * 0.012, B.y + 0.014, B.z + D[2] * 0.012, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.0016, 0.0028) * B.size, GLITTER[ci * 3] * t, GLITTER[ci * 3 + 1] * t, GLITTER[ci * 3 + 2] * t, 1, 200,
      G_GLITTER, rr(4, 7), 0.5, 1.0, 1, lift, 0, B.floor, rr(0, 0.03));
  }
  // fine glitter dust hanging in the air
  const nd = cnt(wave2 ? 14 : 40, B.cm);
  for (let k = 0; k < nd; k++) {
    dir(0.1, 1, 1);
    const sp = rr(0.3, 1.3) * B.sm;
    G.spawn(B.x, B.y + 0.014, B.z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.0004, 0.0008) * B.size, 1.0, 0.86, 0.5, 1, rr(1.2, 2.4), G_GLITTER, rr(4, 7), 0.12, 1.4, 0, 0, 0, B.floor, rr(0, 0.06));
  }
  puffCloud(fx, B, wave2, PIGMENT.star, 0.3, 1);
  grit(fx, B, wave2);
  if (B.water) splash(fx, B, wave2, false);
}

// mud: a crown of thick tendrils that stay joined to the ground by a neck as
// they leave, a skirt of fat low blobs, heavier lumps, water in the spray, fine
// brown mist, and a stain that stays
function mud(fx, B, wave2) {
  const blobs = fx.blobs;
  const G = fx.grains;
  const { x, z, gy } = B;
  if (B.water) {
    splash(fx, B, wave2, true);
    puffCloud(fx, B, wave2, null, 0, 1);
    return;
  }
  const y0 = B.hi ? B.y : gy + 0.004;
  const cm = B.cm;
  const nT = cnt(wave2 ? 10 : 28, cm);
  for (let k = 0; k < nT; k++) {
    const a = ((k + rnd() * 0.8) / nT) * TAU;
    const el = B.hi ? rr(-0.2, 1.3) : rr(0.9, 1.36);
    const sp = rr(0.9, 1.6) * B.sm;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ce = Math.cos(el);
    const rad = rr(0.012, 0.028) * B.size;
    const R = rr(0.0028, 0.006) * B.size;
    const ci = randomColorIndex(MUD);
    const j = blobs.spawn(K_MUD, x + c * rad, y0, z + s * rad, c * ce * sp + B.bx, Math.sin(el) * sp, s * ce * sp, R, MUD[ci * 3], MUD[ci * 3 + 1], MUD[ci * 3 + 2], rr(2, 3));
    blobs.tail(j, rr(1, 2.2), 6, wave2 || B.hi ? 0 : rr(0.1, 0.16), 5);
    blobs.look(j, 0.1, 0, 0.05, 0.1, rr(0.42, 0.58));
  }
  if (!wave2) {
    // a skirt of fat, low blobs round the foot of the crown
    const nS = cnt(12, cm);
    for (let k = 0; k < nS; k++) {
      const a = ((k + rnd() * 0.8) / nS) * TAU;
      const el = B.hi ? rr(-0.1, 0.9) : rr(0.4, 0.75);
      const sp = rr(0.7, 1.2) * B.sm;
      const ce = Math.cos(el);
      const R = rr(0.005, 0.009) * B.size;
      const ci = randomColorIndex(MUD);
      const rad = rr(0.02, 0.04) * B.size;
      const j = blobs.spawn(K_MUD, x + Math.cos(a) * rad, y0 + 0.001, z + Math.sin(a) * rad, Math.cos(a) * ce * sp + B.bx, Math.sin(el) * sp, Math.sin(a) * ce * sp, R, MUD[ci * 3], MUD[ci * 3 + 1], MUD[ci * 3 + 2], rr(2, 3));
      blobs.tail(j, rr(0.6, 1.4), 6, B.hi ? 0 : rr(0.08, 0.13), 3);
      blobs.look(j, 0.12, 0, 0.1, 0.2, 0.55);
    }
  }
  // heavier lumps
  const nL = cnt(wave2 ? 3 : 9, cm);
  for (let k = 0; k < nL; k++) {
    dir(B.hi ? -0.2 : 0.55, 0.96, 1);
    const sp = rr(0.6, 1.2) * B.sm;
    const R = rr(0.006, 0.011) * B.size;
    const ci = randomColorIndex(MUD);
    const j = blobs.spawn(K_MUD, x + D[0] * 0.02, y0 + 0.004, z + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, MUD[ci * 3], MUD[ci * 3 + 1], MUD[ci * 3 + 2], rr(2, 3));
    blobs.tail(j, rr(0.3, 1), 5, 0);
    blobs.look(j, 0.16, 0, 0.16, 0.3, 0.5);
  }
  // water in the spray: muddy, not clear
  const nW = cnt(wave2 ? 10 : 28, cm);
  for (let k = 0; k < nW; k++) {
    const a = rnd() * TAU;
    const el = B.hi ? rr(-0.2, 1.3) : rr(0.7, 1.45);
    const sp = rr(1.1, 2.2) * B.sm;
    const rad = rr(0.01, 0.03) * B.size;
    const ce = Math.cos(el);
    const R = rr(0.0016, 0.003) * B.size;
    const ci = randomColorIndex(WATER_TONES);
    const j = blobs.spawn(K_WATER, x + Math.cos(a) * rad, y0 + 0.006, z + Math.sin(a) * rad, Math.cos(a) * ce * sp + B.bx, Math.sin(el) * sp, Math.sin(a) * ce * sp, R, WATER_TONES[ci * 3], WATER_TONES[ci * 3 + 1], WATER_TONES[ci * 3 + 2], rr(2, 3));
    blobs.tail(j, rr(1.6, 3.2), 4.5, 0.05, 4);
  }
  // fine brown mist of droplets
  sprinkle(fx, B, MUD, cnt(wave2 ? 24 : 70, cm), 0.0005, 0.0011, 0.8, 2.3, B.hi ? -0.3 : 0.25, 1, 0.8, 1.2, 1.1, 0.5, 0.9, 1.5, G_DROP, 0, 0.04, 0.95, 1.3, 0);
  puffCloud(fx, B, wave2, MUD, 0.25, 1.1);
  // and a pale mist of muddy water over it, which is what shows against dark leaves
  puffCloud(fx, B, wave2, WATER_TONES, 0.75, 0.9);
  if (!wave2 && !B.hi) {
    // the stain that stays: a thick wet splat where it landed
    const R = 0.02 * B.reach;
    const ci = randomColorIndex(MUD);
    fx.decals.add(x, z, R, MUD[ci * 3] * 0.55, MUD[ci * 3 + 1] * 0.55, MUD[ci * 3 + 2] * 0.55, (rnd() * 4) | 0, 0.5, 120);
  }
}

function snow(fx, B, wave2) {
  if (B.water) {
    splash(fx, B, wave2, false);
    return;
  }
  const S = fx.soft;
  // the powder cloud is the event: bright, deep, with blue in its shade
  TONE2[0] = 1.02;
  TONE2[1] = 1.02;
  TONE2[2] = 1.04;
  const c = B.ground === 'snow' ? CLOUD.snow : CLOUD.snowSoft;
  cloud(fx, B, c, mix3(TONE, TONE2, B.kit.dust, B.ground === 'snow' ? 0 : 0.12), 1, wave2);
  // fast fine powder and ice crystals; clumps that break up
  const cm = B.cm * (wave2 ? 0.45 : 1);
  if (B.ground !== 'snow') {
    sprinkle(fx, B, WHITE3, cnt(120, cm), 0.0007, 0.0015, 0.4, 1.8, B.hi ? -0.3 : 0.15, 1, 2.4, 4, 0.35, 1.6, 1.5, 2.8, G_BEAD, 0, 0.07, 0.95, 1.05, 0);
    crumbs(fx, B, WHITE3, cnt(6, cm * B.debrisK), 0.0028, 0.0055, 0.5, 1.4, 1.0, 1.7, 0.85, 0.45, 0.35, 0.3);
    const G = fx.grains;
    const nc = cnt(20, cm);
    for (let i = 0; i < nc; i++) {
      dir(0.2, 1, 1);
      const sp = rr(0.4, 1.6) * B.sm;
      G.spawn(B.x, B.y + 0.012, B.z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.0005, 0.0009) * B.size, 0.9, 0.95, 1.05, 0.95, rr(1.4, 2.4), G_GLITTER, rr(2.4, 3.6), 0.4, 1.4, 0, 0, 0, B.floor, rr(0, 0.05));
    }
  } else grit(fx, B, wave2);
  // a thin veil of powder that hangs on
  if (!wave2) {
    for (let k = 0; k < 3; k++) {
      const a = rnd() * TAU;
      const r = rr(0, 0.05) * B.reach;
      puff(S, B.x + Math.cos(a) * r, (B.hi ? B.y : B.gy) + rr(0.06, 0.14) * B.reach, B.z + Math.sin(a) * r, rr(-0.05, 0.05), rr(0.03, 0.09), rr(-0.05, 0.05), rr(1.6, 2.3), 0.04 * B.reach, rr(0.06, 0.09) * B.reach, 1.05, 1.05, 1.08, 0.14, 1.6, -0.02, 1.6,
        B.hi ? NO_FLOOR : B.gy + 0.05, 1, k * 0.05 + 0.2);
    }
  }
}

// jelly: dessert gel of one colour, bursting into glossy blobs of every size
// that wobble, land, and slump; a gel smear that stays
let gelIdx = 0;
function gelBlob(fx, B, wave2, n, rA, rB, spA, spB, elA, elB, tA, tB, neck, pinA, pinB, decay, radMax, life, pinCap, tone) {
  const blobs = fx.blobs;
  const c = cnt(n, B.cm);
  for (let k = 0; k < c; k++) {
    const a = ((k + rnd() * 0.85) / c) * TAU;
    const el = rr(elA, elB);
    const sp = rr(spA, spB) * B.sm;
    const ce = Math.cos(el);
    const rad = rr(0, radMax) * B.size;
    const R = rr(rA, rB) * B.size;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const t = tone * rr(0.9, 1.1);
    const j = blobs.spawn(K_JELLY, B.x + cx * rad, (B.hi ? B.y : B.wy > -100 && B.water ? B.wy : B.gy) + 0.006, B.z + cz * rad, cx * ce * sp + B.bx, Math.sin(el) * sp, cz * ce * sp, R, GEL[gelIdx * 3] * t, GEL[gelIdx * 3 + 1] * t, GEL[gelIdx * 3 + 2] * t, rr(life * 0.8, life));
    blobs.tail(j, rr(tA, tB), decay, wave2 || B.hi ? 0 : rr(pinA, pinB), pinCap);
    blobs.look(j, 0.13, 0.6, 0, 0, neck);
    if (B.water) blobs.floor(j, B.wy);
  }
}

function jelly(fx, B, wave2) {
  const G = fx.grains;
  // the ball is raspberry jelly: its gel, and the stain it leaves, are raspberry
  gelIdx = 0;
  const gr = GEL[gelIdx * 3];
  const gg = GEL[gelIdx * 3 + 1];
  const gb = GEL[gelIdx * 3 + 2];
  const lo = B.hi ? -0.25 : 0;
  // the ball's own volume: one big lump, a few middling, many small drops
  if (!wave2) gelBlob(fx, B, wave2, 1, 0.011, 0.014, 0.25, 0.5, 0.9 + lo, 1.3, 0.2, 0.5, 0.6, 0.12, 0.18, 3, 0.02, 12, 2.4, 1);
  gelBlob(fx, B, wave2, wave2 ? 3 : 6, 0.005, 0.009, 0.5, 1.2, 0.9 + lo, 1.4, 0.3, 0.9, 0.56, 0.1, 0.16, 4, 0.03, 12, 3, 1);
  gelBlob(fx, B, wave2, wave2 ? 5 : 12, 0.0025, 0.004, 0.8, 1.7, 0.6 + lo, 1.4, 0.8, 2.4, 0.44, 0.08, 0.14, 5, 0.03, 10, 4.5, 1);
  gelBlob(fx, B, wave2, wave2 ? 10 : 24, 0.0011, 0.002, 1.2, 2.4, 0.35 + lo, 1.45, 1.6, 4, 0.4, 0.05, 0.1, 4, 0.03, 8, 7, 1);
  // gel mist
  GELC[0] = gr;
  GELC[1] = gg;
  GELC[2] = gb;
  sprinkle(fx, B, GELC, cnt(wave2 ? 14 : 40, B.cm), 0.0005, 0.0009, 0.8, 2.2, B.hi ? -0.3 : 0.25, 1, 0.8, 1.2, 1.1, 0.5, 0.8, 1.3, G_DROP, 0, 0.03, 0.9, 1.15, 0);
  if (B.water) splash(fx, B, wave2, false);
  // a wet mist of the ground's own dust, not much: gel makes little dust
  puffCloud(fx, B, wave2, PIGMENT.jelly, 0.15, 0.45);
  if (!wave2 && !B.hi && !B.water) {
    // the smear that stays: gel spread on the ground
    const R = 0.02 * B.reach;
    fx.decals.add(B.x, B.z, R, gr * 0.9, gg * 0.9, gb * 0.9, (rnd() * 4) | 0, 1, 120);
  }
}

// bouncy: a rubber ball hitting hard: the ground's dust and a spray of rubber granules
function bouncy(fx, B, wave2) {
  const blobs = fx.blobs;
  puffCloud(fx, B, wave2, PIGMENT.bouncy, 0.22, 0.85);
  grit(fx, B, wave2);
  if (B.water) splash(fx, B, wave2, false);
  const nb = cnt(wave2 ? 4 : 10, B.cm);
  for (let k = 0; k < nb; k++) {
    dir(B.hi ? -0.2 : 0.35, 1, 1);
    const sp = rr(0.8, 1.8) * B.sm;
    const ci = randomColorIndex(BEADS);
    const R = rr(0.0025, 0.004) * B.size;
    const j = blobs.spawn(K_CANDY, B.x, B.y + 0.014, B.z, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, BEADS[ci * 3], BEADS[ci * 3 + 1], BEADS[ci * 3 + 2], rr(20, 40));
    if (B.water) blobs.floor(j, B.wy);
  }
}

// triple: each of the three is a compact little burst: paper of three colours,
// a few gel beads, the ground's dust
function triple(fx, B, wave2) {
  const blobs = fx.blobs;
  puffCloud(fx, B, wave2, PIGMENT.triple, 0.28, 0.85);
  grit(fx, B, wave2);
  if (B.water) splash(fx, B, wave2, false);
  // three colours for the burst
  const a = randomColorIndex(PAPER);
  const b = randomColorIndex(PAPER);
  const c = randomColorIndex(PAPER);
  TRI[0] = PAPER[a * 3]; TRI[1] = PAPER[a * 3 + 1]; TRI[2] = PAPER[a * 3 + 2];
  TRI[3] = PAPER[b * 3]; TRI[4] = PAPER[b * 3 + 1]; TRI[5] = PAPER[b * 3 + 2];
  TRI[6] = PAPER[c * 3]; TRI[7] = PAPER[c * 3 + 1]; TRI[8] = PAPER[c * 3 + 2];
  paper(fx, B, cnt(wave2 ? 20 : 46, B.cm), TRI, 200, 0.9);
  const nj = cnt(wave2 ? 2 : 5, B.cm);
  for (let k = 0; k < nj; k++) {
    dir(B.hi ? -0.2 : 0.4, 1, 1);
    const sp = rr(0.7, 1.4) * B.sm;
    const R = rr(0.0025, 0.0038) * B.size;
    const ci = k % 3;
    const j = blobs.spawn(K_JELLY, B.x, B.y + 0.01, B.z, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, TRI[ci * 3], TRI[ci * 3 + 1], TRI[ci * 3 + 2], rr(10, 14));
    blobs.tail(j, rr(0.5, 1.4), 4, 0);
    blobs.look(j, 0.13, 0.6, 0, 0, 0.42);
    if (B.water) blobs.floor(j, B.wy);
  }
}
const TRI = new Float32Array(9);

export const RECIPES = { confetti, star, mud, snow, jelly, bouncy, triple };
// how bright each ball's flash is: a bright glitter ball, a wet slap of mud or gel, a soft snowball
export const FLASH_K = { confetti: 1, star: 1.3, mud: 0.35, snow: 0.5, jelly: 0.45, bouncy: 0.7, triple: 0.7 };
export { contact, ring, cloud, CLOUD, puffCloud, grit, sprinkle, paper, puff, flash, dot, dir, D, cnt, mix3, NO_FLOOR, LIFT_G, TONE, TONE2, GROUND_KIT };
