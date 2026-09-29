// What each burst is made of. A recipe is a function of the burst context `B`
// (where, how hard, how big, which ground) that throws pieces into the pools.
//
// Layering in time: 0 to 60 ms a soft flash and the dust ring, 0 to 300 ms the
// primary payload (paper, stars, blobs, powder), debris for a second or so,
// settled confetti, stars and stains linger 6 to 10 s and then melt away.
//
// Nothing here allocates: numbers in, pool slots out. Counts are scaled by
// B.cm (quality tier x impact power x great), speeds by B.sm, sizes by B.zm.
import {
  TAU, rnd, rr, CANDY, STAR_COLORS, JELLY_COLORS, RAINBOW, WATER_BLUES, GROUND_KIT, setRgb, randomColorIndex,
} from './common.js';
import { PUFF, GLINT, STREAK, FLASH, DOT } from './soft.js';
import { K_JELLY, K_MUD, K_WATER, K_CLOD, K_CANDY, K_PAINT } from './solid.js';

const D = new Float32Array(3); // a sampled direction
const RGB = new Float32Array(3);
const NO_FLOOR = -1000;

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

// ---------------------------------------------------------------------------
// soft particle helpers (see soft.js for the attribute layout)
function puff(S, x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav, wind, floorY, lit, delay = 0, erode = 0) {
  S.spawn(x, y, z, vx, vy, vz, life, s0, s1, PUFF, r, g, b, a, drag, grav, wind, floorY, 0.025, lit, (rnd() - 0.5) * 0.9, erode, delay);
}
function glint(S, x, y, z, vx, vy, vz, life, size, r, g, b, a, drag, grav, twinkle, delay = 0) {
  S.spawn(x, y, z, vx, vy, vz, life, size, size * 0.6, GLINT, r, g, b, a, drag, grav, 0.3, NO_FLOOR, 0.02, 0, (rnd() - 0.5) * 3, twinkle, delay);
}
function streak(S, x, y, z, vx, vy, vz, life, size, stretch, r, g, b, a, drag, grav, wind, floorY, lit, delay = 0) {
  S.spawn(x, y, z, vx, vy, vz, life, size, size, STREAK, r, g, b, a, drag, grav, wind, floorY, 0.01, lit, 0, stretch, delay);
}
function flash(S, x, y, z, life, size, r, g, b, a, delay = 0) {
  S.spawn(x, y, z, 0, 0, 0, life, size * 0.55, size, FLASH, r, g, b, a, 0, 0, 0, NO_FLOOR, 0, 0, 0, 0, delay);
}
function dot(S, x, y, z, vx, vy, vz, life, size, r, g, b, a, drag, grav, wind, floorY, lit, glitter, delay = 0) {
  S.spawn(x, y, z, vx, vy, vz, life, size, size, DOT, r, g, b, a, drag, grav, wind, floorY, 0.01, lit, 0, glitter, delay);
}

// ---------------------------------------------------------------------------
// shared layers

// The first frames of every burst: a soft warm glow (not fire) and the ring of
// dust or powder that skims outwards along the ground.
function flashAndRing(fx, B, whiteRing) {
  const S = fx.soft;
  const kit = B.kit;
  const zm = B.zm;
  const { x, y, z, gy } = B;
  const big = B.great ? 1.35 : 1;
  flash(S, x, y + 0.012, z, 0.11, 0.06 * zm * big, 1.0, 0.92, 0.75, 0.85);
  flash(S, x, y + 0.012, z, 0.06, 0.03 * zm * big, 1.0, 1.0, 0.95, 0.9);
  const nr = cnt(12, B.cmSoft);
  const amt = kit.dustAmt * (whiteRing ? 0.85 : 1);
  const dr = whiteRing ? 1 : kit.dust[0];
  const dg = whiteRing ? 1 : kit.dust[1];
  const db = whiteRing ? 1 : kit.dust[2];
  for (let k = 0; k < nr; k++) {
    const a = ((k + rnd() * 0.8) / nr) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const sp = rr(0.5, 0.85) * B.sm;
    puff(S, x + c * 0.012, gy + 0.005, z + s * 0.012, c * sp, rr(0.02, 0.12), s * sp, rr(0.36, 0.55), rr(0.007, 0.012) * zm, rr(0.024, 0.04) * zm,
      dr, dg, db, (whiteRing ? 0.2 : 0.22) * amt, 4.6, 0.1, 0.6, gy + 0.007, 1, 0, 0.35);
  }
  // a low cushion of dust in the middle
  const nc = cnt(4, B.cmSoft);
  for (let k = 0; k < nc; k++) {
    const a = rnd() * TAU;
    const sp = rr(0.05, 0.2);
    puff(S, x + Math.cos(a) * 0.01, gy + 0.01, z + Math.sin(a) * 0.01, Math.cos(a) * sp, rr(0.25, 0.6), Math.sin(a) * sp, rr(0.35, 0.6), rr(0.012, 0.02) * zm, rr(0.035, 0.06) * zm,
      dr, dg, db, (whiteRing ? 0.1 : 0.09) * amt, 3.4, 0.15, 0.8, gy + 0.01, 1, 0, 0.35);
  }
}

// clods of the ground's own stuff, thrown out of the crater
function clod(fx, B, cm, n, rMin, rMax, spMin, spMax, palette, lifeMin, lifeMax, rough, grain, lump) {
  const clods = fx.blobs;
  const c = cnt(n, cm);
  for (let k = 0; k < c; k++) {
    dir(0.5, 0.97, 1.2);
    const sp = rr(spMin, spMax) * B.sm;
    const R = rr(rMin, rMax) * B.zm;
    const ci = randomColorIndex(palette);
    const j = clods.spawn(K_CLOD, B.x + D[0] * 0.02, B.gy + R + 0.004, B.z + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, palette[ci * 3], palette[ci * 3 + 1], palette[ci * 3 + 2], rr(lifeMin, lifeMax));
    clods.look(j, rough, 0, lump, grain, -1);
    if (B.ground === 'snow') {
      clods.look(j, 0.85, 0.25, 0.35, 0.45, -1);
      if (rnd() < 0.7) clods.breakT[j] = rr(0.3, 0.65);
    }
  }
}

// ground debris in the stage's own material
function debris(fx, B, amount = 1) {
  const S = fx.soft;
  const kit = B.kit;
  const cm = B.cm * amount * B.debrisK;
  const { gy } = B;
  const near = B.debrisK;
  const ox = B.x;
  const oz = B.z;
  const zm = B.zm;
  const ground = B.ground;
  const clods = fx.blobs;
  if (ground === 'grass') {
    clod(fx, B, cm, 7, 0.0022, 0.0045, 0.6, 1.6, kit.soil, 1.3, 2.2, 0.95, 0.75, 0.32);
    // grass blades and a fine dust puff
    const nb = cnt(26, cm);
    for (let k = 0; k < nb; k++) {
      dir(0.35, 1, 1);
      const sp = rr(0.7, 2.0) * B.sm;
      const ci = randomColorIndex(kit.bit);
      fx.flat.spawn(ox + D[0] * 0.02, gy + 0.01, oz + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.012, 0.022) * zm, rr(0.0022, 0.0035) * zm, 3, rr(-0.8, 0.8), 0, kit.bit[ci * 3], kit.bit[ci * 3 + 1], kit.bit[ci * 3 + 2],
        rr(2.4, 4), rr(6, 9), rr(1.2, 2), 1, 2, rr(6, 18));
    }
    const nd = cnt(26, cm);
    for (let k = 0; k < nd; k++) {
      dir(0.2, 0.9, 1);
      const sp = rr(0.4, 1.5) * B.sm;
      dot(S, ox, gy + 0.008, oz, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.8, 1.6), rr(0.0006, 0.0013), kit.dust[0], kit.dust[1], kit.dust[2], 0.85, 2.8, 0.9, 1, gy, 1, 0);
    }
  } else if (ground === 'sand') {
    const ng = cnt(95, cm);
    for (let k = 0; k < ng; k++) {
      dir(0.2, 0.95, 1.1);
      const sp = rr(0.5, 2.3) * B.sm;
      const ci = randomColorIndex(kit.soil);
      const tone = rr(0.85, 1.1);
      dot(S, ox + D[0] * 0.015, gy + 0.008, oz + D[2] * 0.015, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.5, 1.3), rr(0.001, 0.0021), kit.soil[ci * 3] * tone * 1.15, kit.soil[ci * 3 + 1] * tone * 1.15, kit.soil[ci * 3 + 2] * tone * 1.15, 1, 1.3, 2.1, 1, gy, 1, 0.3);
    }
    clod(fx, B, cm, 8, 0.0026, 0.0052, 0.5, 1.4, kit.soil, 1.2, 2, 0.95, 0.65, 0.3);
    // a thin veil of sand dust
    const nv = cnt(4, B.cmSoft);
    for (let k = 0; k < nv; k++) {
      const a = rnd() * TAU;
      const sp = rr(0.2, 0.55);
      puff(S, ox, gy + 0.012, oz, Math.cos(a) * sp, rr(0.1, 0.35), Math.sin(a) * sp, rr(0.9, 1.4), rr(0.03, 0.05) * zm, rr(0.09, 0.14) * zm, kit.dust[0], kit.dust[1], kit.dust[2], 0.1, 2.2, 0.08, 1.4, gy + 0.012, 1, k * 0.02);
    }
  } else if (ground === 'mud') {
    clod(fx, B, cm, 10, 0.0035, 0.008, 0.55, 1.5, kit.soil, 1.4, 2.4, 0.3, 0.4, 0.28);
  } else if (ground === 'snow') {
    clod(fx, B, cm, 10, 0.0045, 0.01, 0.6, 1.6, kit.soil, 1.1, 1.8, 0.85, 0.45, 0.35);
  } else {
    // moss: soil, moss clumps, a few pine needles
    clod(fx, B, cm, 8, 0.003, 0.0065, 0.55, 1.5, kit.soil, 1.3, 2.2, 0.95, 0.7, 0.32);
    const mossC = kit.bit;
    const cM = cnt(7, cm);
    for (let k = 0; k < cM; k++) {
      dir(0.5, 0.95, 1.1);
      const sp = rr(0.5, 1.4) * B.sm;
      const R = rr(0.0035, 0.0075) * zm;
      const ci = randomColorIndex(mossC);
      const j = clods.spawn(K_CLOD, ox + D[0] * 0.02, gy + R + 0.004, oz + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, mossC[ci * 3], mossC[ci * 3 + 1], mossC[ci * 3 + 2], rr(1.4, 2.4));
      clods.look(j, 0.95, 0.1, 0.4, 0.6, -1);
    }
    const nn = cnt(9, cm);
    for (let k = 0; k < nn; k++) {
      dir(0.4, 1, 1);
      const sp = rr(0.6, 1.8) * B.sm;
      fx.flat.spawn(ox, gy + 0.01, oz, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.016, 0.026) * zm, 0.0016 * zm, 3, 0, 0, 0.3 + rnd() * 0.15, 0.25 + rnd() * 0.1, 0.09, rr(2.4, 4), rr(6, 9), rr(1, 1.8), 1, 1.5, rr(5, 14));
    }
    const nd = cnt(14, cm);
    for (let k = 0; k < nd; k++) {
      dir(0.2, 0.9, 1);
      const sp = rr(0.4, 1.3) * B.sm;
      dot(S, ox, gy + 0.008, oz, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.8, 1.4), rr(0.0006, 0.0012), kit.dust[0], kit.dust[1], kit.dust[2], 0.85, 2.8, 0.9, 1, gy, 1, 0);
    }
  }
}

// ---------------------------------------------------------------------------
// the seven bursts

function confetti(fx, B, wave2) {
  const S = fx.soft;
  const flat = fx.flat;
  const { x, y, z } = B;
  const n = cnt(wave2 ? 70 : 150, B.cm);
  for (let k = 0; k < n; k++) {
    dir(0.22, 1, 0.75);
    const sp = (0.8 + 1.5 * Math.pow(rnd(), 1.3)) * B.sm;
    const ci = randomColorIndex(CANDY);
    const r = rnd();
    let sx;
    let sy;
    let shape;
    let bend = 0;
    if (r < 0.5) {
      sx = rr(0.007, 0.013);
      sy = sx * rr(0.7, 1.3);
      shape = 0;
      if (rnd() < 0.25) bend = rr(0.4, 1.1) * (rnd() < 0.5 ? -1 : 1);
    } else if (r < 0.62) {
      sx = rr(0.006, 0.011);
      sy = sx * rr(0.85, 1.15);
      shape = 1;
    } else if (r < 0.8) {
      sx = rr(0.008, 0.014);
      sy = sx * rr(0.6, 1.2);
      shape = 2;
    } else if (r < 0.9) {
      sx = rr(0.007, 0.011);
      sy = sx * rr(0.8, 1.2);
      shape = 4;
    } else {
      sx = rr(0.016, 0.026);
      sy = sx * rr(0.14, 0.26);
      shape = 0;
      bend = rr(1.8, 4.5) * (rnd() < 0.5 ? -1 : 1);
    }
    const foil = rnd() < 0.22 ? 1 : 0;
    const o = 0.012;
    flat.spawn(x + D[0] * o, y + 0.012 + D[1] * o, z + D[2] * o, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, sx * B.zm * 1.45, sy * B.zm * 1.45, shape, bend, foil,
      CANDY[ci * 3], CANDY[ci * 3 + 1], CANDY[ci * 3 + 2], rr(7, 10), rr(11, 17), rr(3.4, 6), rr(0.5, 0.8), rr(1.5, 3), rr(8, 24));
  }
  // candy glints
  const ng = cnt(wave2 ? 12 : 26, B.cm);
  for (let k = 0; k < ng; k++) {
    dir(0.1, 1, 1);
    const sp = rr(0.5, 1.9) * B.sm;
    const ci = randomColorIndex(CANDY);
    const bright = 1.15;
    glint(S, x, y + 0.012, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.5, 1.1), rr(0.007, 0.013) * B.zm, CANDY[ci * 3] * bright, CANDY[ci * 3 + 1] * bright, CANDY[ci * 3 + 2] * bright, 1, 2.6, 0.35, rr(20, 40));
  }
}

function star(fx, B, wave2) {
  const S = fx.soft;
  const { x, y, z } = B;
  const n = cnt(wave2 ? 10 : 24, B.cm);
  for (let k = 0; k < n; k++) {
    dir(0.3, 1, 0.85);
    const sp = rr(0.9, 2.3) * B.sm;
    const ci = randomColorIndex(STAR_COLORS);
    const hero = k < 3 && !wave2;
    const R = (hero ? rr(0.02, 0.026) : rr(0.011, 0.017)) * B.zm;
    fx.stars.spawn(x + D[0] * 0.012, y + 0.014 + D[1] * 0.012, z + D[2] * 0.012, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, STAR_COLORS[ci * 3], STAR_COLORS[ci * 3 + 1], STAR_COLORS[ci * 3 + 2], rr(8, 10.5), rr(5, 13));
  }
  // twinkles
  const ng = cnt(wave2 ? 12 : 28, B.cm);
  for (let k = 0; k < ng; k++) {
    dir(0.1, 1, 1);
    const sp = rr(0.3, 1.5) * B.sm;
    const ci = randomColorIndex(STAR_COLORS);
    glint(S, x, y + 0.014, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.7, 1.5), rr(0.006, 0.012) * B.zm, 0.6 + STAR_COLORS[ci * 3], 0.6 + STAR_COLORS[ci * 3 + 1], 0.6 + STAR_COLORS[ci * 3 + 2], 1, 2.2, 0.15, rr(25, 45));
  }
}

function mud(fx, B, wave2) {
  const S = fx.soft;
  const blobs = fx.blobs;
  const kit = GROUND_KIT.mud;
  const { x, z, gy } = B;
  const nT = cnt(wave2 ? 8 : 20, B.cm);
  // the crown: tendrils still joined to the ground by a thin neck when they leave
  for (let k = 0; k < nT; k++) {
    const a = ((k + rnd() * 0.8) / nT) * TAU;
    const el = rr(0.9, 1.36);
    const sp = rr(1.0, 1.75) * B.sm;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ce = Math.cos(el);
    const rad = rr(0.012, 0.028) * B.zm;
    const R = rr(0.005, 0.009) * B.zm;
    const ci = randomColorIndex(kit.soil);
    const sx = x + c * rad;
    const sz = z + s * rad;
    const j = blobs.spawn(K_MUD, sx, gy + 0.004, sz, c * ce * sp + B.bx, Math.sin(el) * sp, s * ce * sp, R, kit.soil[ci * 3] * 1.1, kit.soil[ci * 3 + 1] * 1.1, kit.soil[ci * 3 + 2] * 1.1, rr(2, 3));
    blobs.tail(j, rr(1, 2.2), 6, wave2 ? 0 : rr(0.1, 0.16), 5);
    blobs.look(j, 0.1, 0, 0.05, 0.1, rr(0.42, 0.58));
  }
  // a skirt of fat, low blobs round the foot of the crown
  const nS = cnt(wave2 ? 0 : 10, B.cm);
  for (let k = 0; k < nS; k++) {
    const a = ((k + rnd() * 0.8) / nS) * TAU;
    const el = rr(0.4, 0.75);
    const sp = rr(0.7, 1.25) * B.sm;
    const ce = Math.cos(el);
    const R = rr(0.007, 0.012) * B.zm;
    const ci = randomColorIndex(kit.soil);
    const rad = rr(0.02, 0.04) * B.zm;
    const j = blobs.spawn(K_MUD, x + Math.cos(a) * rad, gy + 0.005, z + Math.sin(a) * rad, Math.cos(a) * ce * sp + B.bx, Math.sin(el) * sp, Math.sin(a) * ce * sp, R, kit.soil[ci * 3], kit.soil[ci * 3 + 1], kit.soil[ci * 3 + 2], rr(2, 3));
    blobs.tail(j, rr(0.6, 1.4), 6, rr(0.08, 0.13), 3);
    blobs.look(j, 0.12, 0, 0.1, 0.2, 0.55);
  }
  // heavier lumps
  const nL = cnt(wave2 ? 3 : 9, B.cm);
  for (let k = 0; k < nL; k++) {
    dir(0.55, 0.96, 1);
    const sp = rr(0.6, 1.3) * B.sm;
    const R = rr(0.008, 0.014) * B.zm;
    const ci = randomColorIndex(kit.soil);
    const j = blobs.spawn(K_MUD, x + D[0] * 0.02, gy + 0.008, z + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, kit.soil[ci * 3], kit.soil[ci * 3 + 1], kit.soil[ci * 3 + 2], rr(2, 3));
    blobs.tail(j, rr(0.3, 1), 5, 0);
    blobs.look(j, 0.16, 0, 0.16, 0.3, 0.5);
  }
  // clear water droplets in the spray
  const nW = cnt(wave2 ? 12 : 26, B.cm);
  for (let k = 0; k < nW; k++) {
    const a = rnd() * TAU;
    const el = rr(0.7, 1.45);
    const sp = rr(1.2, 2.5) * B.sm;
    const rad = rr(0.01, 0.03);
    const ce = Math.cos(el);
    const R = rr(0.0022, 0.0042) * B.zm;
    const ci = randomColorIndex(WATER_BLUES);
    const j = blobs.spawn(K_WATER, x + Math.cos(a) * rad, gy + 0.01, z + Math.sin(a) * rad, Math.cos(a) * ce * sp + B.bx, Math.sin(el) * sp, Math.sin(a) * ce * sp, R, WATER_BLUES[ci * 3], WATER_BLUES[ci * 3 + 1], WATER_BLUES[ci * 3 + 2], rr(2, 3));
    blobs.tail(j, rr(1.6, 3.5), 4.5, 0.06, 4);
  }
  // fine muddy mist and a few glints off the water
  const nm = cnt(wave2 ? 14 : 40, B.cm);
  for (let k = 0; k < nm; k++) {
    dir(0.25, 1, 1);
    const sp = rr(0.8, 2.4) * B.sm;
    const t = rr(0.7, 1.2);
    dot(S, x, gy + 0.01, z, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.6, 1.3), rr(0.0008, 0.0017), kit.soil[0] * t * 1.4, kit.soil[1] * t * 1.4, kit.soil[2] * t * 1.4, 1, 1.0, 1.6, 1, gy, 1, 0.1);
  }
  const ng = cnt(wave2 ? 5 : 12, B.cm);
  for (let k = 0; k < ng; k++) {
    dir(0.4, 1, 1);
    const sp = rr(0.8, 2) * B.sm;
    glint(S, x, gy + 0.012, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.4, 0.8), rr(0.005, 0.009), 0.7, 0.95, 1.2, 1, 2.4, 0.9, rr(24, 40));
  }
}

// puffs are gathered, sorted far to near and then thrown, so the overlaps composite like a real cloud
const PF = new Float32Array(48 * 8);
const PI = new Uint8Array(48);
const PK = new Float32Array(48);

function snowCloud(fx, B, wave2) {
  const S = fx.soft;
  const cam = fx.camera.position;
  const { x, y, z, gy } = B;
  const n = Math.min(46, cnt(wave2 ? 12 : 26, B.cm));
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU;
    const up = rr(0.25, 0.6) * B.sm;
    const out = rr(0.1, 0.4) * B.sm * (0.6 + 0.4 * (1 - up));
    const rad = rr(0.0, 0.035);
    const o = k * 8;
    PF[o] = x + Math.cos(a) * rad;
    PF[o + 1] = y + rr(0.006, 0.04);
    PF[o + 2] = z + Math.sin(a) * rad;
    PF[o + 3] = Math.cos(a) * out + B.bx * 0.7;
    PF[o + 4] = up;
    PF[o + 5] = Math.sin(a) * out;
    PF[o + 6] = rr(0.02, 0.036) * B.zm; // final radius
    PF[o + 7] = rr(0.85, 1.2);
    const dx = PF[o] - cam.x;
    const dy = PF[o + 1] - cam.y;
    const dz = PF[o + 2] - cam.z;
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
    const o = PI[m] * 8;
    const s1 = PF[o + 6];
    const tone = rr(1.08, 1.22);
    S.spawn(PF[o], PF[o + 1], PF[o + 2], PF[o + 3], PF[o + 4], PF[o + 5], PF[o + 7], s1 * 0.32, s1, PUFF, tone, tone, tone, 0.95, 3.4, -0.06, 1.6, gy + s1 * 0.25, 0.02, 1, (rnd() - 0.5) * 0.5, 0, 0);
  }
  if (!wave2) {
    // a thin lingering haze of fine powder above the cloud
    for (let k = 0; k < 4; k++) {
      const a = rnd() * TAU;
      const r = rr(0, 0.06);
      puff(S, x + Math.cos(a) * r, y + rr(0.08, 0.18), z + Math.sin(a) * r, rr(-0.08, 0.08), rr(0.03, 0.1), rr(-0.08, 0.08), rr(1.3, 2.0), 0.04 * B.zm, rr(0.06, 0.09) * B.zm, 1.1, 1.1, 1.1, 0.16, 1.6, -0.02, 1.5, gy + 0.05, 1, k * 0.05 + 0.15);
    }
  }
}

function snow(fx, B, wave2) {
  const S = fx.soft;
  const { x, y, z, gy } = B;
  snowCloud(fx, B, wave2);
  // fast fine powder: glittering streaks
  const ns = cnt(wave2 ? 34 : 70, B.cm);
  for (let k = 0; k < ns; k++) {
    dir(0.12, 1, 1);
    const sp = rr(1.0, 3.0) * B.sm;
    const t = rr(0.9, 1.4);
    streak(S, x + D[0] * 0.02, y + 0.02 + D[1] * 0.02, z + D[2] * 0.02, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.4, 0.8), rr(0.0009, 0.0018), 0.007,
      t, t, t * 1.03, 0.75, 3.8, 0.5, 2.2, gy, 0.4);
  }
  const nd = cnt(wave2 ? 40 : 90, B.cm);
  for (let k = 0; k < nd; k++) {
    dir(0.15, 1, 1);
    const sp = rr(0.5, 2.3) * B.sm;
    dot(S, x, y + 0.02, z, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.8, 1.7), rr(0.0008, 0.0018), 1, 1, 1, 0.95, 1.7, 0.45, 2.2, gy, 0.7, 0.9);
  }
  if (!wave2) {
    // sparkle drifting in the air afterwards
    const ng = cnt(26, B.cm);
    for (let k = 0; k < ng; k++) {
      const a = rnd() * TAU;
      const r = rr(0.02, 0.17);
      const h = rr(0.03, 0.26);
      const tint = rnd() < 0.4 ? 1 : 0;
      glint(S, x + Math.cos(a) * r, gy + h, z + Math.sin(a) * r, rr(-0.06, 0.06), rr(-0.02, 0.12), rr(-0.06, 0.06), rr(1.2, 2.6), rr(0.0045, 0.008),
        1.15, 1.0 + tint * 0.1, 1.05 + tint * 0.12, 1, 1, 0.03, rr(14, 30), rr(0.05, 0.5));
    }
  }
}

function throwBlob(fx, B, wave2, kind, n, rMin, rMax, spMin, spMax, elMin, elMax, tMin, tMax, neck, pinMin, pinMaxT, decay, radMax, life, pinCap) {
  const blobs = fx.blobs;
  const c = cnt(n, B.cm);
  for (let k = 0; k < c; k++) {
    const a = ((k + rnd() * 0.85) / c) * TAU;
    const el = rr(elMin, elMax);
    const sp = rr(spMin, spMax) * B.sm;
    const ce = Math.cos(el);
    const rad = rr(0, radMax) * B.zm;
    const R = rr(rMin, rMax) * B.zm;
    const ci = randomColorIndex(JELLY_COLORS);
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const j = blobs.spawn(kind, B.x + cx * rad, B.gy + 0.006, B.z + cz * rad, cx * ce * sp + B.bx, Math.sin(el) * sp, cz * ce * sp, R, JELLY_COLORS[ci * 3], JELLY_COLORS[ci * 3 + 1], JELLY_COLORS[ci * 3 + 2], rr(life * 0.8, life));
    blobs.tail(j, rr(tMin, tMax), decay, wave2 ? 0 : rr(pinMin, pinMaxT), pinCap);
    if (neck > 0) blobs.look(j, kind === K_JELLY ? 0.13 : 0.1, kind === K_JELLY ? 0.6 : 0.5, 0, 0, neck);
  }
}

function jelly(fx, B, wave2) {
  const S = fx.soft;
  const { x, z, gy } = B;
  throwBlob(fx, B, wave2, K_JELLY, wave2 ? 4 : 8, 0.018, 0.028, 0.45, 1.0, 1.15, 1.5, 0.3, 0.8, 0.66, 0.14, 0.2, 3, 0.03, 7, 2.4);
  throwBlob(fx, B, wave2, K_JELLY, wave2 ? 5 : 10, 0.011, 0.018, 0.7, 1.4, 0.9, 1.45, 0.6, 1.6, 0.56, 0.1, 0.16, 4, 0.03, 6.5, 3);
  throwBlob(fx, B, wave2, K_JELLY, wave2 ? 7 : 14, 0.005, 0.009, 1.1, 2.0, 0.6, 1.4, 1.2, 3, 0.44, 0.08, 0.14, 5, 0.03, 5, 4.5);
  throwBlob(fx, B, wave2, K_PAINT, wave2 ? 12 : 26, 0.0018, 0.0036, 1.4, 3, 0.35, 1.45, 2, 5, 0.4, 0.05, 0.1, 4, 0.03, 3, 7);
  // fine paint mist
  const nm = cnt(wave2 ? 14 : 40, B.cm);
  for (let k = 0; k < nm; k++) {
    dir(0.2, 1, 1);
    const sp = rr(0.8, 2.4) * B.sm;
    const ci = randomColorIndex(JELLY_COLORS);
    dot(S, x, gy + 0.012, z, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, rr(0.5, 1.2), rr(0.0009, 0.0019), JELLY_COLORS[ci * 3] * 1.2, JELLY_COLORS[ci * 3 + 1] * 1.2, JELLY_COLORS[ci * 3 + 2] * 1.2, 1, 1, 1.5, 1, gy, 0.6, 0.3);
  }
  const ng = cnt(wave2 ? 6 : 14, B.cm);
  for (let k = 0; k < ng; k++) {
    dir(0.3, 1, 1);
    const sp = rr(0.6, 1.9) * B.sm;
    const ci = randomColorIndex(RAINBOW);
    glint(S, x, gy + 0.014, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.5, 1.1), rr(0.006, 0.011), 0.6 + RAINBOW[ci * 3], 0.6 + RAINBOW[ci * 3 + 1], 0.6 + RAINBOW[ci * 3 + 2], 1, 2.4, 0.3, rr(22, 40));
  }
}

function bouncy(fx, B, wave2) {
  const S = fx.soft;
  const { x, y, z } = B;
  // streamers
  const ns = cnt(wave2 ? 8 : 20, B.cm);
  for (let k = 0; k < ns; k++) {
    dir(0.3, 1, 0.9);
    const sp = rr(1.0, 2.1) * B.sm;
    const ci = randomColorIndex(CANDY);
    const len = rr(0.03, 0.05) * B.zm;
    fx.flat.spawn(x + D[0] * 0.01, y + 0.014, z + D[2] * 0.01, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, len, len * rr(0.12, 0.18), 0, rr(2.6, 5.2) * (rnd() < 0.5 ? -1 : 1), rnd() < 0.3 ? 1 : 0,
      CANDY[ci * 3], CANDY[ci * 3 + 1], CANDY[ci * 3 + 2], rr(6, 8), rr(5.5, 8), rr(1.1, 1.9), rr(0.7, 1), rr(1.8, 3), rr(6, 16));
  }
  // small confetti
  const nc = cnt(wave2 ? 22 : 54, B.cm);
  for (let k = 0; k < nc; k++) {
    dir(0.25, 1, 0.8);
    const sp = rr(0.8, 2.1) * B.sm;
    const ci = randomColorIndex(CANDY);
    const s = rr(0.007, 0.012) * B.zm;
    fx.flat.spawn(x + D[0] * 0.01, y + 0.012, z + D[2] * 0.01, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, s, s * rr(0.7, 1.2), rnd() < 0.4 ? 1 : 0, 0, 0,
      CANDY[ci * 3], CANDY[ci * 3 + 1], CANDY[ci * 3 + 2], rr(6, 9), rr(8, 12), rr(1.6, 3), rr(0.8, 1.1), rr(1.5, 3), rr(8, 22));
  }
  // candy beads
  const nb = cnt(wave2 ? 6 : 16, B.cm);
  for (let k = 0; k < nb; k++) {
    dir(0.35, 1, 1);
    const sp = rr(0.9, 1.9) * B.sm;
    const ci = randomColorIndex(CANDY);
    const R = rr(0.0045, 0.0068) * B.zm;
    fx.blobs.spawn(K_CANDY, x, y + 0.014, z, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, R, CANDY[ci * 3], CANDY[ci * 3 + 1], CANDY[ci * 3 + 2], rr(4, 6));
  }
  const ng = cnt(wave2 ? 14 : 34, B.cm);
  for (let k = 0; k < ng; k++) {
    dir(0.1, 1, 1);
    const sp = rr(0.5, 1.8) * B.sm;
    const ci = randomColorIndex(CANDY);
    glint(S, x, y + 0.012, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.5, 1.1), rr(0.009, 0.015) * B.zm, CANDY[ci * 3] * 1.2, CANDY[ci * 3 + 1] * 1.2, CANDY[ci * 3 + 2] * 1.2, 1, 2.6, 0.3, rr(22, 42));
  }
}

function triple(fx, B, wave2) {
  const S = fx.soft;
  const { x, y, z, gy } = B;
  // three of these go off, so each is a compact rainbow: small jelly, ribbons of paper, glints
  const nj = cnt(wave2 ? 4 : 9, B.cm);
  for (let k = 0; k < nj; k++) {
    const a = ((k + rnd() * 0.8) / nj) * TAU;
    const el = rr(0.9, 1.45);
    const sp = rr(0.7, 1.5) * B.sm;
    const ce = Math.cos(el);
    const R = rr(0.009, 0.015) * B.zm;
    const ci = randomColorIndex(RAINBOW);
    const j = fx.blobs.spawn(K_JELLY, x, gy + 0.008, z, Math.cos(a) * ce * sp + B.bx, Math.sin(el) * sp, Math.sin(a) * ce * sp, R, RAINBOW[ci * 3], RAINBOW[ci * 3 + 1], RAINBOW[ci * 3 + 2], rr(4.5, 6));
    fx.blobs.tail(j, rr(0.8, 2.2), 4, wave2 ? 0 : 0.1);
    fx.blobs.look(j, 0.13, 0.6, 0, 0, 0.42);
  }
  const nc = cnt(wave2 ? 26 : 64, B.cm);
  for (let k = 0; k < nc; k++) {
    dir(0.25, 1, 0.8);
    const sp = rr(0.8, 2.1) * B.sm;
    const ci = randomColorIndex(RAINBOW);
    const s = rr(0.007, 0.012) * B.zm;
    fx.flat.spawn(x, y + 0.012, z, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, s, s * rr(0.7, 1.2), rnd() < 0.3 ? 1 : 0, rnd() < 0.15 ? rr(2, 4) : 0, rnd() < 0.2 ? 1 : 0,
      RAINBOW[ci * 3], RAINBOW[ci * 3 + 1], RAINBOW[ci * 3 + 2], rr(6, 9), rr(8, 12), rr(1.6, 3), rr(0.8, 1.1), rr(1.5, 3), rr(8, 22));
  }
  const nr = cnt(wave2 ? 6 : 14, B.cm);
  for (let k = 0; k < nr; k++) {
    dir(0.3, 1, 0.9);
    const sp = rr(1.0, 2.0) * B.sm;
    const ci = randomColorIndex(RAINBOW);
    const len = rr(0.024, 0.04) * B.zm;
    fx.flat.spawn(x + D[0] * 0.01, y + 0.014, z + D[2] * 0.01, D[0] * sp + B.bx, D[1] * sp, D[2] * sp, len, len * rr(0.12, 0.18), 0, rr(2.6, 5.2) * (rnd() < 0.5 ? -1 : 1), rnd() < 0.3 ? 1 : 0,
      RAINBOW[ci * 3], RAINBOW[ci * 3 + 1], RAINBOW[ci * 3 + 2], rr(6, 8), rr(5.5, 8), rr(1.1, 1.9), rr(0.7, 1), rr(1.8, 3), rr(6, 16));
  }
  const ng = cnt(wave2 ? 12 : 30, B.cm);
  for (let k = 0; k < ng; k++) {
    dir(0.1, 1, 1);
    const sp = rr(0.5, 1.7) * B.sm;
    const ci = randomColorIndex(RAINBOW);
    glint(S, x, y + 0.012, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.5, 1.1), rr(0.009, 0.015) * B.zm, 0.7 + RAINBOW[ci * 3], 0.7 + RAINBOW[ci * 3 + 1], 0.7 + RAINBOW[ci * 3 + 2], 1, 2.6, 0.3, rr(22, 42));
  }
}

export const RECIPES = { confetti, star, mud, snow, jelly, bouncy, triple };
export { flashAndRing, debris, puff, glint, streak, flash, dot, dir, D, RGB, cnt, NO_FLOOR };
