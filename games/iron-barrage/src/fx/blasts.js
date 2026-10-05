// Each weapon's own blast, by the weapon's `boom` kind. Every recipe builds
// on the Effects building blocks (ball, flash, shock, ring, spark, ember,
// clod, dust, puff, smoke, fire, scorch, glow, shake, screenFlash, later,
// proc) and the particle pool.
// o: { r: crater radius, power, nx, ny: ground normal, inGround, weapon, hitTank }
//
// Layers of a ground blast, in the order they show up: a white flash and a
// light, the fireball (billows that are white-hot, then orange, then sooty,
// with dark smoke rolling through them), a quick shock ring, a plume of earth
// shaped by the ground's normal (clods that trail dust), sparks, a dust
// surge along the ground, a column of smoke that rises and drifts with the
// wind, embers, then the scorch and the glowing rim of the crater.
import { rand, clamp, PREFS } from '../config.js';
import { K } from './particles.js';

const TAU = Math.PI * 2;

// ---- shared pieces

// The first instant of a blast: a short, irregular, warm flash instead of one
// disc. A small core, a few offset lobes and radial streaks; gone in two or
// three frames. R is about 0.7 of the blast radius.
export function coreFlash(fx, x, y, R, k = 1, streaks = 5) {
  fx.flashAt(x, y, R * 0.62 * k, 0.07, 2.6, 1.9, 0.9, 1);
  for (let i = 0; i < 3; i++) fx.flashAt(x + rand(-0.5, 0.5) * R * 0.55, y + rand(-0.25, 0.5) * R * 0.55, R * rand(0.3, 0.55) * k, rand(0.05, 0.075), 2.6, 1.8, 0.8, 0.9);
  for (let i = 0; i < streaks; i++) {
    const a = rand(0, TAU);
    fx.flashAt(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.5, R * rand(0.22, 0.38) * k, 0.06, 2.8, 2.0, 1.0, 0.85, rand(3, 5), a);
  }
}

// The blast axis: the ground's normal (up when the blast is in the air).
function axis(o, ground) {
  let nx = ground ? o.nx ?? 0 : 0;
  let ny = ground ? o.ny ?? 1 : 1;
  const l = Math.hypot(nx, ny) || 1;
  nx /= l;
  ny /= l;
  if (ny < 0.2) {
    // an overhang: do not throw the plume into the ground
    ny = 0.2;
    nx = nx < 0 ? -0.98 : 0.98;
  }
  return [nx, ny];
}

// A fireball of radius F around (cx, cy). It is built from many billows of
// different sizes and lifetimes, offset from one another (never one disc): a
// white-hot core, big lobes rolling out and up, small fast ones that rag the
// edge, flames licking out, a shroud of dark smoke wrapped round it and black
// smoke rolling over it a moment later. `omni` spreads it in every direction
// (an airburst).
function fireball(fx, cx, cy, F, nx, ny, o) {
  const q = fx.q.particleScale;
  const L = o.L ?? 1;
  const skew = rand(-0.5, 0.5); // the whole thing leans one way
  const base = Math.atan2(ny, nx);
  // the shroud: dark smoke behind and around the fireball, so the flames sit
  // inside a dark wrapping that stays after they die
  const nShroud = Math.max(3, Math.round((o.shroud ?? 6) * q));
  for (let k = 0; k < nShroud; k++) {
    const a = o.omni ? rand(0, TAU) : base + rand(-1.5, 1.5);
    const d = F * rand(0.45, 0.9);
    const sp = F * rand(0.5, 1.4);
    const i = fx.smoke(cx + Math.cos(a) * d + skew * F * 0.2, cy + Math.sin(a) * d * 0.85, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 + F * rand(0.2, 0.8), F * rand(0.5, 0.85), rand(3.5, 6) * L, rand(0.03, 0.06), 0.85);
    if (i >= 0) fx.p.env[i] = 0.3;
  }
  // the white-hot core
  for (let k = 0; k < 4; k++) {
    fx.ball(cx + rand(-0.32, 0.32) * F + skew * F * 0.1, cy + rand(-0.15, 0.25) * F, rand(-2, 2), rand(0, 3), F * rand(0.25, 0.5), rand(0.35, 0.8) * L, rand(1.05, 1.3), 0, 1, 0.9, 2.2, 0.15);
  }
  // big lobes of every size and lifetime, offset from the middle
  const nBody = Math.max(6, Math.round((o.body ?? 11) * q));
  for (let k = 0; k < nBody; k++) {
    const a = (k / nBody) * TAU + rand(-0.75, 0.75);
    const dx = Math.cos(a);
    let dy = Math.sin(a);
    if (!o.omni) dy = dy < 0 ? -dy * 0.3 : dy * 0.9;
    const off = F * rand(0.1, 0.5);
    const sp = F * rand(1.6, 4.6);
    fx.ball(cx + dx * off + skew * F * 0.25, cy + dy * off, dx * sp + nx * F * 0.5, dy * sp + ny * F * rand(0.2, 1.4), F * rand(0.2, 0.56), rand(0.5, 1.9) * L, rand(0.75, 1.2), rand(0.3, 0.8), 1, rand(0.7, 1.1), rand(1.4, 2.3), o.omni ? 0.12 : rand(0.15, 0.4));
  }
  // small fast ones tear the edge into a ragged outline
  const nBit = Math.max(4, Math.round((o.bits ?? 8) * q));
  for (let k = 0; k < nBit; k++) {
    const a = o.omni ? rand(0, TAU) : base + rand(-1.7, 1.7);
    const sp = F * rand(3.4, 6.5);
    fx.ball(cx + rand(-0.15, 0.15) * F, cy + rand(-0.05, 0.2) * F, Math.cos(a) * sp, Math.sin(a) * sp * 0.85, F * rand(0.12, 0.26), rand(0.35, 0.85) * L, rand(0.9, 1.25), rand(0.2, 0.5), 1, 0.7, 1.9, 0.2);
  }
  if (!o.omni) {
    // the head of the fireball rolls up and away from the ground
    for (let k = 0; k < 5; k++) {
      const sp = F * rand(2.4, 6.5);
      fx.ball(cx + rand(-0.35, 0.35) * F, cy + rand(0, 0.3) * F, rand(-0.9, 0.9) * F + nx * sp, ny * sp, F * rand(0.2, 0.46), rand(0.9, 1.9) * L, rand(0.8, 1.1), rand(0.4, 0.8), 1, 0.9, 1.7, 0.4);
    }
  }
  // flames licking out of it
  const nFlame = Math.round((o.flames ?? 12) * q);
  for (let k = 0; k < nFlame; k++) {
    const a = o.omni ? rand(0, TAU) : base + rand(-1.35, 1.35);
    const sp = F * rand(1.5, 4.5);
    fx.fire(cx + rand(-0.3, 0.3) * F, cy + rand(-0.2, 0.3) * F, Math.cos(a) * sp, Math.sin(a) * sp, F * rand(0.16, 0.3), rand(0.4, 0.9) * L, 1);
  }
  // dark smoke rolling over it: some through the middle, some round the rim
  const nSoot = Math.max(3, Math.round((o.soot ?? 7) * q));
  for (let k = 0; k < nSoot; k++) {
    const rim = k % 2 === 0;
    fx.later(rand(0.06, 0.32) * L, (f) => {
      const a = o.omni ? rand(0, TAU) : base + rand(-1.5, 1.5);
      const d = (rim ? rand(0.65, 1.0) : rand(0.1, 0.55)) * F;
      f.ball(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, rand(-2, 2) + Math.cos(a) * F * 0.5 + nx * F * 0.3, Math.sin(a) * F * 0.5 + ny * F * rand(0.6, 1.8) + rand(0, 2), F * rand(0.28, 0.5), rand(1.2, 2.3) * L, rand(0, 0.3), 1, rim ? 0.7 : 0.85, 0.9, 1.6, 0.35);
    });
  }
}

// A column of dark smoke over the blast, built up over a second or so from
// the crater upwards (the first puffs climb the highest, the last fill in
// its foot), that billows and drifts with the wind. The foot is dusty.
function smokeColumn(fx, x, y, F, n, o) {
  const L = o.L ?? 1;
  const lite = o.lite ?? 0;
  const soil = fx.soil;
  for (let k = 0; k < n; k++) {
    const h = n > 1 ? k / (n - 1) : 0;
    fx.later(0.05 + h * 1.0 * L, (f) => {
      const reach = F * (3.2 - 2.3 * h) * (o.rise ?? 1);
      const sh = rand(0.04, 0.08) + lite;
      const m = h * h * (o.dusty ?? 0.75);
      const i = f.puff(
        x + rand(-0.5, 0.5) * F * 0.7 + (o.nx ?? 0) * F * 0.3 * (1 - h),
        y + 0.4 + rand(0, 0.5) * F * (1 - h) * 0.5,
        rand(-1.5, 1.5) + (o.nx ?? 0) * reach * 0.3,
        reach * 0.9 * rand(0.85, 1.1),
        F * rand(0.5, 0.85) * (0.85 + 0.3 * (1 - h)),
        rand(5.5, 9) * (0.85 + 0.3 * (o.life ?? 1)) * L,
        sh * (1 - m) + (soil[0] * 1.5 + 0.04) * m,
        sh * 0.93 * (1 - m) + (soil[1] * 1.5 + 0.035) * m,
        sh * 0.86 * (1 - m) + (soil[2] * 1.5 + 0.03) * m,
        0.9,
        rand(0.35, 0.7),
        0.9,
        0.05,
      );
      if (i >= 0) f.p.env[i] = 0.35;
    });
  }
}

// Earth thrown up in a plume around the ground's normal, with a few wide
// clods, big ones trailing dust, a dust plume lifting off the crater rim and
// a dust surge along the ground in both directions.
function dirtPlume(fx, x, y, r, nx, ny, pw, S) {
  const P = fx.p;
  const q = fx.q.particleScale;
  const sq = Math.sqrt(pw);
  const tx = ny;
  const ty = -nx;
  const base = Math.atan2(ny, nx);
  const nClod = Math.round((30 + 34 * pw) * (S.dirt ?? 1) * q);
  for (let k = 0; k < nClod; k++) {
    const side = Math.random() < (S.side ?? 0);
    const wide = k % 5 === 0;
    let a;
    if (side) a = Math.atan2(ty, tx) + (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.28, 0.28) * (Math.random() < 0.5 ? 1 : -1);
    else a = base + rand(-1, 1) * (wide ? 1.35 : 0.65) * (S.cone ?? 1);
    const sp = rand(7, 28) * sq * (wide ? 0.8 : 1) * (S.speed ?? 1);
    const big = k % 6 === 0;
    const size = rand(0.3, 0.72) * (big ? 1.6 : 1);
    const stone = k % 9 === 4;
    fx.clod(x + rand(-r, r) * 0.4, y + 0.3 + rand(0, r * 0.4), Math.cos(a) * sp, Math.sin(a) * sp, size, rand(2.2, 4), big ? 0.07 : 0, stone);
  }
  // the dust plume, lifting off the crater
  const nDust = Math.max(5, Math.round(10 * sq * (S.dust ?? 1) * q));
  for (let k = 0; k < nDust; k++) {
    const sp = rand(5, 15) * sq * (S.speed ?? 1);
    const a = base + rand(-0.55, 0.55);
    const size = rand(2.2, 4) * sq;
    fx.dust(x + rand(-r, r) * 0.5, y + 0.6 + size * 0.4 + rand(0, r * 0.3), Math.cos(a) * sp + tx * rand(-4, 4), Math.sin(a) * sp + ty * rand(-4, 4), size, rand(2.8, 5), 0.62, 1.3);
  }
  // the surge along the ground
  const nSurge = Math.max(3, Math.round(5 * sq * (S.dust ?? 1) * q));
  for (let k = 0; k < nSurge * 2; k++) {
    const s = k % 2 ? 1 : -1;
    const px = x + s * (r * 0.9 + rand(0, r * 0.7));
    const size = rand(1.2, 2.5) * sq;
    const i = fx.dust(px, fx.groundY(px, y + 2) + size * 0.45 + rand(0, 0.4), s * rand(6, 17) * sq, rand(0.5, 2.2), size, rand(2, 3.8), 0.5, 1.7);
    if (i >= 0) fx.flat(i, 0.7);
  }
}

function sparkBurst(fx, x, y, nx, ny, n, spread, v0, v1, o = {}) {
  const base = Math.atan2(ny, nx);
  for (let k = 0; k < n; k++) {
    const a = base + rand(-spread, spread);
    const sp = rand(v0, v1);
    fx.spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.07, 0.14) * (o.size ?? 1), rand(0.3, 0.9) * (o.life ?? 1), o.r ?? 6, rand(2.2, 3.4), o.b ?? 1.1, 0.6, 1.2, k % 3 === 0 ? 2 : 0);
  }
}

function embers(fx, x, y, r, n, h = 1) {
  for (let k = 0; k < n; k++) {
    fx.ember(x + rand(-r, r) * 0.5, y + rand(0, r) * 0.5, rand(-6, 6), rand(3, 13) * h, rand(0.06, 0.13), rand(1.2, 3.6));
  }
}

// ---- the high-explosive family

// S: fire, flash, shock, L (life scale), dirt, dust, side, cone, speed,
// col (smoke column), lite, spark, spark speed, tall (rising dust column),
// shake, ember
function heBlast(fx, x, y, o, S = {}) {
  const P = fx.p;
  const q = fx.q.particleScale;
  const r = o.r ?? 4;
  const pw = o.power ?? 1;
  const sq = Math.sqrt(pw);
  const ground = o.inGround !== false;
  const [nx, ny] = axis(o, ground);
  const L = S.L ?? 1;
  const F = r * 1.3 * (S.fire ?? 1);
  const cx = x + nx * F * 0.25;
  const cy = y + ny * F * 0.5 + (ground ? 0 : r * 0.1);
  const fl = S.flash ?? 1;
  // flash and light
  coreFlash(fx, x, y + (ground ? r * 0.3 : 0), r * (0.75 + 0.1 * pw) * fl);
  fx.flashAt(cx, cy, (9 * pw + r * 1.8) * fl, 0.3 * L, 0.9, 0.42, 0.14, 0.5);
  fx.glow(x, y, 4, 20 * pw + r * 2.5, 4.5, 3.2, 2, 0.16);
  fx.glow(x, y + r * 0.6, 5, 16 * pw + r * 2, 2.6, 1.15, 0.32, (0.9 + pw * 0.4) * L, 0.3);
  fireball(fx, cx, cy, F, nx, ny, { L, flames: 12 * (S.fire ?? 1), body: 10 + 3 * pw });
  // shock ring
  const R = (24 + 14 * sq) * (S.shock ?? 1);
  fx.shock(x, y, R, 0.4 + pw * 0.1, 0.9 * Math.min(1.5, pw) * (S.shock ?? 1), ground);
  if (S.ring) fx.ring(x, y, R * 0.85, 0.36 + pw * 0.06, S.ring, 1.1, 0.95, 0.8, ground);
  // the ground erupts
  if (ground) {
    dirtPlume(fx, x, y, r, nx, ny, pw, S);
    if (S.tall) tallColumn(fx, x, y, r, nx, ny, S.tall);
  } else if (o.hitTank) {
    // hitting a tank: the armour flings metal
    sparkBurst(fx, x, y, 0, 1, Math.round(14 * q), 3.1, 12, 40);
  }
  // sparks
  sparkBurst(fx, x, y, nx, ny, Math.round((14 + 14 * pw) * (S.spark ?? 1) * q), 1.4, 18 * (S.sparkSpeed ?? 1), 55 * (S.sparkSpeed ?? 1));
  smokeColumn(fx, x, y, F, Math.max(4, Math.round((6 + 8 * pw) * (S.col ?? 1) * q)), { L, lite: S.lite, nx, life: 1 });
  embers(fx, x, y, r, Math.round((10 + 12 * pw) * (S.ember ?? 1) * q));
  // heat shimmer
  P.spawn(K.HEAT, x, y + r, 0, 2, 5 + r * 1.2, 1.6, 0, 0, 0, 0.8);
  if (ground) {
    fx.scorch(x, y, r);
    streaks(fx, x, y, r, nx, ny);
  }
  fx.shake((0.28 * pw + r * 0.02) * (S.shake ?? 1));
  fx.screenFlash(0.05 * pw);
  fx.aberrate(0.008 * pw);
}

// Scorch marks raked out along the ground on both sides.
function streaks(fx, x, y, r, nx, ny) {
  const ang = Math.atan2(-nx, ny);
  for (let k = 0; k < 3; k++) {
    const s = k % 2 ? 1 : -1;
    const d = r * rand(0.9, 1.7);
    fx.decal(0, x + s * ny * d, y - s * nx * d, r * rand(0.6, 1.0), 0.75, 0, 0, 0, ang, rand(2, 3.6));
  }
}

// A tall column of dust shoved up along the axis, growing as it climbs.
function tallColumn(fx, x, y, r, nx, ny, k) {
  const q = fx.q.particleScale;
  const n = Math.max(4, Math.round(8 * k * q));
  for (let i = 0; i < n; i++) {
    const h = i / n;
    fx.later(h * 0.55, (f) => {
      const sp = rand(14, 30) * (0.7 + 0.5 * k);
      const j = f.dust(x + rand(-0.5, 0.5) * r * 0.6, y + rand(0, 1), nx * sp * 0.5 + rand(-1.5, 1.5), ny * sp, rand(1.8, 3.2) * (0.8 + 0.3 * k) * (1 + h * 0.6), rand(3.5, 6), 0.6, 0.9);
      if (j >= 0) {
        f.p.env[j] = 0.4;
        f.p.grow[j] *= 1.4;
      }
    });
  }
}

// ---- the recipes

export const BLASTS = {
  // The standard shell.
  he: (fx, x, y, o) => heBlast(fx, x, y, o, { ring: o.inGround === false ? 0 : 0.2 }),

  // A secondary pop inside a burning wreck.
  cookoff: (fx, x, y, o) => heBlast(fx, x, y, o, { shock: 0.45, flash: 0.8, dirt: 0 }),

  // A 155 mm round: bigger, deeper, longer, more earth and a taller column.
  heavy: (fx, x, y, o) => heBlast(fx, x, y, o, { fire: 1.1, L: 1.25, dirt: 1.5, dust: 1.4, col: 1.5, spark: 1.1, shock: 1.15, shake: 1.2, speed: 1.1, tall: 0.6, ember: 1.3, ring: 0.22 }),

  // An airstrike bomb: a punchy ground blast with a tall column of earth.
  bomb: (fx, x, y, o) => heBlast(fx, x, y, o, { fire: 1.15, L: 1.15, flash: 1.25, dirt: 1.7, dust: 1.5, col: 1.5, spark: 1.2, shock: 1.3, shake: 1.2, speed: 1.15, tall: 1.5, cone: 0.8, ring: 0.26 }),

  // A rolling shot: a medium blast and a lot of earth thrown sideways.
  roller: (fx, x, y, o) => heBlast(fx, x, y, o, { fire: 0.85, dirt: 1.6, dust: 1.4, side: 0.6, speed: 1.2, col: 0.8, spark: 0.8, shake: 0.9, ring: 0.15 }),

  // A missile: a hot, sharp blast, many sparks, a medium fire, little earth
  // and a thin pale smoke.
  missile: (fx, x, y, o) => {
    heBlast(fx, x, y, o, { fire: 0.82, L: 0.85, flash: 1.15, dirt: 0.55, dust: 0.7, col: 0.7, lite: 0.05, spark: 2.4, sparkSpeed: 1.25, shock: 1.1, ember: 1.4, ring: 0.2 });
    const q = fx.q.particleScale;
    const [nx, ny] = axis(o, o.inGround !== false);
    sparkBurst(fx, x, y, nx, ny, Math.round(14 * q), 1.5, 30, 78, { size: 0.8, life: 0.7 });
    coreFlash(fx, x, y + (o.r ?? 3) * 0.3, (o.r ?? 3) * 0.6, 1, 4);
  },

  // Cluster bomblets (called many times in a row): sharp small cracks, lots
  // of sparks and shrapnel, little fire, grey smoke puffs.
  cluster: (fx, x, y, o) => {
    const P = fx.p;
    const q = fx.q.particleScale;
    const r = o.r ?? 2.4;
    const pw = o.power ?? 0.55;
    const ground = o.inGround !== false;
    const [nx, ny] = axis(o, ground);
    const F = r * 1.1;
    coreFlash(fx, x, y + r * 0.2, r * 0.8, 0.9, 3);
    fx.glow(x, y + 0.5, 3, 12 + r * 3, 4, 2.6, 1.2, 0.12);
    for (let k = 0; k < 2; k++) fx.ball(x + rand(-0.4, 0.4), y + F * 0.45 + rand(0, 0.5), rand(-3, 3) + nx * 3, rand(1.5, 5) * ny, F * rand(0.4, 0.55), rand(0.45, 0.75), 1.15, 0.5, 1, 0.9, 2.2, 0.3);
    fx.shock(x, y, 11 + r * 2, 0.22, 0.5, ground);
    sparkBurst(fx, x, y, nx, ny, Math.max(8, Math.round(24 * q)), 1.5, 22, 66, { size: 0.9, life: 0.8 });
    // shrapnel: a few long fast streaks along the ground and up
    for (let k = 0; k < Math.max(2, Math.round(4 * q)); k++) {
      const a = Math.atan2(ny, nx) + rand(-1.5, 1.5);
      fx.spark(x, y + 0.3, Math.cos(a) * rand(40, 80), Math.sin(a) * rand(40, 80), 0.06, rand(0.15, 0.3), 6, 4, 2.5, 0.2, 0.6);
    }
    if (ground) {
      const n = Math.max(3, Math.round(8 * q));
      for (let k = 0; k < n; k++) {
        const a = Math.atan2(ny, nx) + rand(-0.9, 0.9);
        const sp = rand(6, 20);
        fx.clod(x + rand(-1, 1), y + rand(0, 0.5), Math.cos(a) * sp, Math.sin(a) * sp, rand(0.1, 0.24), rand(1.5, 2.6), 0);
      }
      fx.dust(x + rand(-1, 1), y + 0.5, rand(-2, 2), rand(1, 3.5), rand(1.1, 1.9), rand(1.6, 2.6), 0.5, 1.5);
      fx.scorch(x, y, r * 0.8, 0.6);
    }
    for (let k = 0; k < 3; k++) {
      const i = fx.smoke(x + rand(-1, 1), y + rand(0.2, 1.4), rand(-1.5, 1.5), rand(2, 5), rand(0.8, 1.5), rand(2.2, 4), rand(0.12, 0.2), 0.7);
      if (i >= 0) P.env[i] = 0.3;
    }
    fx.shake(0.07 + r * 0.01);
  },

  // Napalm: the fuel bursts into a fireball that spreads sideways along the
  // ground, thick black oily smoke, burning droplets arcing out.
  napalm: (fx, x, y, o) => {
    const q = fx.q.particleScale;
    const r = o.r ?? 4;
    const pw = o.power ?? 1;
    const [nx, ny] = axis(o, o.inGround !== false);
    const tx = ny;
    const ty = -nx;
    const F = r * 0.95;
    coreFlash(fx, x, y + 0.5, r * 0.8, 1, 4);
    fx.flashAt(x, y + F * 0.4, 14 + r * 2, 0.4, 0.95, 0.4, 0.1, 0.65);
    fx.glow(x, y, 4, 24 + r * 2.5, 4.2, 2.2, 0.8, 0.18);
    fx.glow(x, y + 1, 4, 22 + r * 2, 2.8, 1.1, 0.25, 2.4, 0.3);
    // the fuel fireball spreads along the ground in both directions
    for (let k = 0; k < 3; k++) fx.ball(x + rand(-0.4, 0.4), y + F * 0.4, rand(-1, 1), rand(0, 2), F * rand(0.55, 0.7), rand(0.7, 1), 1.3, 0.2, 1, 0.9, 2, 0.2);
    const nSide = Math.max(4, Math.round(8 * q));
    for (let k = 0; k < nSide * 2; k++) {
      const s = k % 2 ? 1 : -1;
      const sp = rand(10, 27) * (0.8 + 0.2 * pw);
      const px = x + s * rand(0, r * 0.4);
      fx.ball(px, y + rand(0.4, 1.2), s * tx * sp, rand(1, 5) + s * ty * sp, F * rand(0.34, 0.52), rand(0.9, 1.8), rand(0.85, 1.1), rand(0.5, 0.9), 1, 0.7, 1.4, 0.22);
    }
    // the sheet of burning fuel along the ground
    for (let k = 0; k < Math.round(16 * q); k++) {
      const s = k % 2 ? 1 : -1;
      const sp = rand(8, 24);
      const i = fx.fire(x + s * rand(0, r * 0.5), y + rand(0.2, 0.8), s * tx * sp, rand(0.5, 3) + s * ty * sp, rand(0.5, 1.1), rand(0.5, 1.1), 1);
      if (i >= 0) {
        fx.p.rot[i] = s > 0 ? Math.atan2(ty, tx) : Math.atan2(-ty, -tx);
        fx.p.spin[i] = 0;
        fx.p.str[i] = 1.1;
      }
    }
    // a tall flame in the middle
    for (let k = 0; k < 4; k++) fx.ball(x + rand(-1.2, 1.2), y + F * 0.6, rand(-2, 2), rand(8, 15), F * rand(0.3, 0.45), rand(1.1, 1.8), 1, 0.7, 0.95, 0.8, 1.6, 0.45);
    // thick black oily smoke, a column rising from the fire
    smokeColumn(fx, x, y, F * 1.1, Math.max(7, Math.round(14 * q)), { L: 1.2, lite: -0.028, rise: 1.15, life: 1.3, dusty: 0.1, nx });
    // burning droplets arcing out
    const nDrop = Math.max(8, Math.round(22 * q));
    for (let k = 0; k < nDrop; k++) {
      const a = Math.atan2(ny, nx) + rand(-1.3, 1.3);
      const sp = rand(9, 30);
      fx.spark(x, y + 0.5, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.09, 0.15), rand(0.9, 1.9), 5, rand(1.4, 2.2), 0.4, 0.9, 0.12, 2);
    }
    for (let k = 0; k < Math.max(4, Math.round(9 * q)); k++) {
      const a = Math.atan2(ny, nx) + rand(-1.2, 1.2);
      const sp = rand(7, 22);
      fx.fire(x, y + 0.6, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.55), rand(0.7, 1.4), 0.95);
    }
    embers(fx, x, y, r, Math.round(16 * q), 1.1);
    fx.p.spawn(K.HEAT, x, y + r, 0, 2, 6 + r * 1.2, 2.2, 0, 0, 0, 0.9);
    fx.shock(x, y, 26, 0.4, 0.55, true);
    // scorched, burning ground along the splash
    fx.decal(0, x, y, r * 2.4, 0.95, 0, 0, 0, Math.atan2(-nx, ny), 2.2);
    fx.decal(0, x, y, r * 1.5, 0, 0, 0, 0.8, Math.atan2(-nx, ny), 2.4);
    fx.shake(0.3 * pw + 0.08);
    fx.screenFlash(0.04 * pw, 1, 0.7, 0.4);
  },

  // A buster: it burrows and goes off underground. The ground heaves, then a
  // geyser of earth and rock blasts out of it; dust, only a little fire.
  buster: (fx, x, y, o) => {
    const P = fx.p;
    const q = fx.q.particleScale;
    const r = o.r ?? 5;
    const pw = o.power ?? 1.4;
    const sq = Math.sqrt(pw);
    const [nx, ny] = axis(o, true);
    // a dull glow from inside the earth
    fx.flashAt(x, y + r * 0.3, 7 + r * 1.5, 0.22, 2.2, 1.0, 0.3, 0.8);
    fx.glow(x, y + r * 0.2, 4, 24 + r * 2.5, 3.4, 1.6, 0.5, 0.45);
    fx.glow(x, y + r * 0.6, 5, 18 + r * 2, 2.2, 0.9, 0.22, 1.4, 0.3);
    // the heave: a swelling dome of dust along the ground
    for (let k = 0; k < Math.max(5, Math.round(10 * q)); k++) {
      const s = k % 2 ? 1 : -1;
      const px = x + s * rand(0, r * 1.1);
      const i = fx.dust(px, fx.groundY(px, y + 2) + rand(0, 1), s * rand(4, 12) * sq, rand(2, 7), rand(2, 3.8) * sq, rand(2.6, 4.4), 0.6, 1.4);
      if (i >= 0) fx.flat(i, 0.4);
    }
    // the geyser: earth and rock blasted straight up through the crater
    const base = Math.atan2(ny, nx);
    const nClod = Math.round(50 * sq * q);
    for (let k = 0; k < nClod; k++) {
      const a = base + rand(-0.38, 0.38) * (k % 4 === 0 ? 1.7 : 1);
      const sp = rand(17, 55) * Math.sqrt(sq);
      const big = k % 5 === 0;
      fx.clod(x + rand(-r, r) * 0.35, y - rand(0, r * 0.3), Math.cos(a) * sp, Math.sin(a) * sp, rand(0.16, 0.42) * (big ? 2 : 1), rand(2.6, 4.6), big ? 0.04 : 0, k % 4 === 3);
    }
    // the column of earth, each puff climbing faster than the last
    const nCol = Math.max(6, Math.round(14 * q));
    for (let k = 0; k < nCol; k++) {
      const h = k / nCol;
      fx.later(h * 0.45, (f) => {
        const sp = rand(16, 36) * (1 - h * 0.35) * Math.sqrt(sq);
        const i = f.dust(x + rand(-0.5, 0.5) * r * 0.5, y + rand(-0.5, 1), nx * sp * 0.4 + rand(-1.5, 1.5), ny * sp, rand(2, 3.6) * sq * (0.8 + h * 0.5), rand(3.5, 6.5), 0.62, 0.8);
        if (i >= 0) {
          f.p.env[i] = 0.4;
          f.p.grow[i] *= 1.5;
        }
      });
    }
    // grey-brown smoke above it, and only a little fire
    smokeColumn(fx, x, y + r, r * 0.85, Math.max(4, Math.round(8 * q)), { L: 1, lite: 0.06, rise: 1.2, life: 1.1 });
    for (let k = 0; k < 4; k++) fx.ball(x + rand(-1, 1), y + r * 0.4, rand(-3, 3), rand(3, 10), r * rand(0.3, 0.45), rand(0.6, 1.0), 0.8, 0.6, 0.9, 0.8, 1.8, 0.3);
    sparkBurst(fx, x, y, nx, ny, Math.round(16 * q), 0.6, 22, 55);
    embers(fx, x, y, r, Math.round(10 * q));
    fx.shock(x, y, 38 + 10 * sq, 0.5, 1.1, true);
    fx.ring(x, y, 30, 0.45, 0.2, 1.0, 0.9, 0.75, true);
    fx.scorch(x, y, r * 0.9);
    streaks(fx, x, y, r, nx, ny);
    fx.shake(0.55 * Math.min(1.5, pw) + r * 0.02);
    fx.screenFlash(0.04);
    fx.aberrate(0.01);
  },

  // An airburst: a fireball in the air, shrapnel sparks raining down. No
  // earth.
  air: (fx, x, y, o) => {
    const q = fx.q.particleScale;
    const pw = o.power ?? 0.5;
    const F = 1.2 + 3 * Math.pow(pw, 0.8);
    coreFlash(fx, x, y, 1.6 + 2.2 * pw, 1, 5);
    fx.flashAt(x, y, 10 + 10 * pw, 0.28, 0.9, 0.45, 0.16, 0.55);
    fx.glow(x, y, 4, 16 + 20 * pw, 4.5, 3.2, 2, 0.14);
    fx.glow(x, y, 5, 14 + 14 * pw, 2.6, 1.1, 0.3, 0.8 + pw * 0.4, 0.3);
    fireball(fx, x, y, F, 0, 1, { L: 0.9, omni: true, flames: 8, body: 7, soot: 3 });
    fx.shock(x, y, 18 + 14 * pw, 0.32, 0.7, false);
    fx.ring(x, y, 15 + 12 * pw, 0.3, 0.2, 1.1, 0.95, 0.8, false);
    // shrapnel raining down
    sparkBurst(fx, x, y, 0, -1, Math.round((12 + 22 * pw) * q), 1.0, 22, 60, { size: 0.9 });
    sparkBurst(fx, x, y, 0, 1, Math.round(6 * q), 1.4, 12, 34, { size: 0.8 });
    for (let k = 0; k < Math.max(3, Math.round((5 + 6 * pw) * q)); k++) {
      const a = rand(0, TAU);
      const i = fx.smoke(x + Math.cos(a) * F * 0.4, y + Math.sin(a) * F * 0.4, Math.cos(a) * rand(1, 5), Math.sin(a) * rand(1, 5) + 1, F * rand(0.4, 0.7), rand(4, 7), rand(0.05, 0.1), 0.8);
      if (i >= 0) fx.p.env[i] = 0.35;
    }
    embers(fx, x, y, F * 2, Math.round(8 * q));
    fx.p.spawn(K.HEAT, x, y, 0, 1, 4 + F, 1.3, 0, 0, 0, 0.7);
    fx.shake(0.14 + 0.2 * pw);
    fx.screenFlash(0.04 * pw);
  },

  // A penetrator hitting: a bright white-blue flash, a spray of metal sparks,
  // a small puff of dust, hardly any fire.
  sabot: (fx, x, y, o) => {
    const q = fx.q.particleScale;
    const tank = !!o.hitTank;
    const ground = o.inGround !== false && !tank;
    const [nx, ny] = axis(o, ground);
    fx.flashAt(x, y, 4.2, 0.05, 2.6, 3.4, 6, 1);
    fx.flashAt(x, y, 9, 0.16, 0.5, 0.8, 1.8, 0.7);
    fx.flashAt(x, y, 1.6, 0.1, 4.5, 4, 3.6, 0.8, 3, Math.atan2(ny, nx));
    fx.glow(x, y, 3, 18, 3, 3.6, 6, 0.1);
    // metal sparks, many, fast and long: white to yellow
    const n = Math.round((tank ? 56 : 40) * q);
    for (let k = 0; k < n; k++) {
      const a = Math.atan2(ny, nx) + rand(-1.35, 1.35);
      const sp = rand(22, 85);
      fx.spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.06, 0.12), rand(0.3, 1.0), 5, rand(3.4, 4.6), rand(1.8, 3), 0.7, 0.9, k % 2 ? 2 : 0);
    }
    // a few big glowing fragments
    for (let k = 0; k < Math.max(3, Math.round(6 * q)); k++) {
      const a = Math.atan2(ny, nx) + rand(-1.2, 1.2);
      const sp = rand(12, 36);
      fx.spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.14, 0.2), rand(0.8, 1.5), 5, 1.8, 0.45, 1, 0.3, 3);
    }
    fx.ball(x, y + 0.4, rand(-1, 1), rand(1, 3), rand(0.7, 1.1), rand(0.3, 0.5), 0.9, 0.5, 0.9, 0.8, 2, 0.2);
    if (ground) {
      for (let k = 0; k < Math.max(3, Math.round(6 * q)); k++) {
        const a = Math.atan2(ny, nx) + rand(-0.9, 0.9);
        const sp = rand(3, 10);
        fx.dust(x + rand(-0.4, 0.4), y + rand(0, 0.4), Math.cos(a) * sp, Math.sin(a) * sp, rand(0.8, 1.5), rand(1.4, 2.4), 0.5, 1.6);
      }
      for (let k = 0; k < Math.round(8 * q); k++) {
        const a = Math.atan2(ny, nx) + rand(-0.8, 0.8);
        const sp = rand(5, 16);
        fx.clod(x, y + 0.2, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.1, 0.22), rand(1.2, 2.2));
      }
      fx.scorch(x, y, (o.r ?? 2) * 0.8, 0.6);
    } else {
      fx.smoke(x, y + 0.6, rand(-1, 1), rand(2, 4), rand(0.7, 1.2), rand(2, 3.5), 0.12, 0.7);
    }
    fx.shock(x, y, 12, 0.2, 0.55, ground);
    fx.ring(x, y, 9, 0.2, 0.2, 0.85, 0.95, 1.2, ground);
    fx.shake(0.2);
    fx.screenFlash(0.025, 0.8, 0.9, 1);
  },

  // Tiny pops.
  small: (fx, x, y, o) => {
    const q = fx.q.particleScale;
    const r = o.r ?? 1;
    const ground = o.inGround !== false;
    const [nx, ny] = axis(o, ground);
    coreFlash(fx, x, y, 1.4 + r * 0.6, 0.8, 2);
    fx.glow(x, y, 3, 8 + r * 3, 3.4, 2.2, 1.1, 0.1);
    fx.ball(x, y + 0.4, rand(-1, 1), rand(1, 3), rand(0.5, 0.8) + r * 0.2, rand(0.3, 0.5), 1.1, 0.5, 1, 0.9, 2, 0.3);
    sparkBurst(fx, x, y, nx, ny, Math.max(3, Math.round(6 * q)), 1.5, 12, 34, { size: 0.7, life: 0.6 });
    fx.smoke(x, y + 0.5, rand(-0.5, 0.5), rand(1.5, 3), rand(0.5, 0.9), rand(1.5, 2.6), 0.14, 0.6);
    if (ground) {
      fx.dust(x, y + 0.3, rand(-1, 1), rand(1, 2.5), rand(0.7, 1.2), rand(1.2, 2), 0.45, 1.5);
      for (let k = 0; k < Math.max(2, Math.round(4 * q)); k++) {
        const a = Math.atan2(ny, nx) + rand(-0.9, 0.9);
        const sp = rand(4, 11);
        fx.clod(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.08, 0.16), rand(1, 1.8));
      }
      fx.scorch(x, y, r * 0.7, 0.4);
    }
    fx.shake(0.04);
  },

  // A tank's ammunition goes up (the first blast; the pops that follow are
  // in Effects.tankKill): a huge fireball out of the hull and hatches, a
  // tall fireball from the ammunition and a ring of dust along the ground.
  tankkill: (fx, x, y, o) => {
    const q = fx.q.particleScale;
    heBlast(fx, x, y, { r: 3.2, power: 1.9, nx: 0, ny: 1, inGround: false }, { fire: 1.35, L: 1.2, col: 1.8, spark: 1.5, shock: 1.1, ember: 1.6, lite: 0.0, flash: 0.7 });
    // the taller fireball from the ammunition racks
    for (let k = 0; k < 5; k++) fx.ball(x + rand(-1.8, 1.8), y + rand(0, 1.2), rand(-3, 3), rand(9, 22), rand(1.4, 2.4), rand(0.9, 1.5), rand(0.95, 1.2), 0.5, 1, 0.9, 1.5, 0.45);
    for (let k = 0; k < Math.round(16 * q); k++) fx.fire(x + rand(-2.5, 2.5), y + rand(0, 2), rand(-5, 5), rand(8, 26), rand(1.6, 3.2), rand(0.7, 1.3), 1);
    fx.glow(x, y + 3, 6, 56, 6, 3.4, 1.2, 1.6, 0.4);
    // the ground under it is blown clean: a ring of dust
    const gy = fx.groundY(x, y);
    for (let k = 0; k < Math.max(6, Math.round(14 * q)); k++) {
      const s = k % 2 ? 1 : -1;
      const px = x + s * rand(1, 4);
      const i = fx.dust(px, fx.groundY(px, gy + 2) + rand(0.1, 0.6), s * rand(6, 18), rand(0.5, 2.5), rand(1.3, 2.6), rand(2.2, 4), 0.5, 1.5);
      if (i >= 0) fx.flat(i, 0.6);
    }
    fx.shock(x, gy + 0.2, 52, 0.55, 1.2, true);
  },

  // Sunburst, the thermobaric warhead: a white-out flash, an expanding
  // fireball, a shock ring that sweeps the whole field, a dust wave hugging
  // the ground, then a mushroom cloud (stem and rolling cap, lit from inside,
  // darkening) that lasts about ten seconds, ash and embers falling, and
  // ground scorched over a wide area. o.r sets the scale (14 m is the base).
  nuke: (fx, x, y, o) => nuke(fx, x, y, o),
};

// ---- Sunburst

function nuke(fx, x, y, o) {
  const P = fx.p;
  const q = fx.q.particleScale;
  const Z = clamp((o.r ?? 14) / 14, 0.55, 1.7);
  const [nx, ny] = axis(o, o.inGround !== false);
  const soft = PREFS.calm ? 0.4 : 1;
  const FR = 24 * Z;
  const T = fx.terrain;
  // the white-out
  fx.flashAt(x, y + 4 * Z, 110 * Z, 0.2, 7, 6.4, 5.4, 0.9 * soft);
  fx.flashAt(x, y + 6 * Z, 150 * Z, 0.13, 3, 2.8, 2.4, 0.6 * soft, 9, 0);
  fx.flashAt(x, y + FR * 0.6, 80 * Z, 1.3, 3.2, 1.3, 0.35, 0.8);
  const gFlash = fx.glow(x, y + 8 * Z, 9, 210 * Z, 16, 12, 7.5, 0.55);
  const gFire = fx.glow(x, y + FR * 0.7, 9, 130 * Z, 6, 2.6, 0.7, 9, 0.12);
  fx.screenFlash(1, 1, 0.94, 0.85);
  fx.later(0.35, (f) => f.screenFlash(0.22, 1, 0.6, 0.3));
  fx.shake(1.2);
  fx.aberrate(0.035);
  // the fireball: big billows swelling out, white-hot, cooling to the cap's
  // glowing underside
  const nBall = Math.max(10, Math.round(26 * q));
  for (let k = 0; k < nBall; k++) {
    const a = (k / nBall) * TAU + rand(-0.3, 0.3);
    let dx = Math.cos(a);
    let dy = Math.sin(a);
    if (dy < 0) dy = -dy * 0.3;
    const sp = FR * rand(1.1, 2.3);
    fx.ball(x + dx * FR * 0.15, y + FR * 0.25 + dy * FR * 0.15, dx * sp, dy * sp * 0.9 + FR * rand(0.2, 0.8), FR * rand(0.3, 0.46), rand(2.0, 3.6), rand(1.0, 1.45), rand(0.4, 0.8), 1, 0.75, 1.3, 0.3);
  }
  for (let k = 0; k < 5; k++) fx.ball(x + rand(-0.2, 0.2) * FR, y + FR * rand(0.2, 0.5), rand(-2, 2), rand(0, 5), FR * rand(0.6, 0.8), rand(1.6, 2.4), 1.5, 0.2, 1, 0.8, 1.5, 0.2);
  for (let k = 0; k < Math.round(20 * q); k++) {
    const a = Math.atan2(ny, nx) + rand(-1.4, 1.4);
    const sp = FR * rand(1.5, 4);
    fx.fire(x + rand(-0.3, 0.3) * FR, y + FR * 0.3, Math.cos(a) * sp, Math.sin(a) * sp, FR * rand(0.12, 0.22), rand(0.7, 1.5), 1);
  }
  // the shock sweeps the whole field
  fx.shock(x, y, 330 * Z, 1.7, 2.0, true);
  fx.ring(x, y, 320 * Z, 1.7, 0.36 * soft, 1.6, 1.45, 1.25, true);
  fx.later(0.12, (f) => f.shock(x, y, 190 * Z, 1.5, 1.2, true));
  fx.later(0.1, (f) => f.ring(x, y, 190 * Z, 1.4, 0.3, 1.2, 1.05, 0.9, true));
  // a ground-hugging dust wave that follows the contour of the land
  fx.proc(2.0, (f, p, dt) => {
    p.acc -= dt;
    if (p.acc > 0) return;
    p.acc = 0.02 / Math.max(0.5, q);
    const d = 190 * Z * (1 - Math.exp(-p.t * 1.7)) + rand(0, 6);
    const decay = Math.exp(-p.t * 1.1);
    for (let s = -1; s <= 1; s += 2) {
      const px = x + s * d;
      const gy = T ? T.groundBelow(px, 140) : y;
      const i = f.dust(px, gy + rand(0.5, 3.5), s * rand(16, 38) * Z * decay, rand(0.5, 3.5), rand(4.5, 9) * Z * (0.7 + decay * 0.5), rand(4, 7), 0.72, 1.1);
      if (i >= 0) {
        f.flat(i, 0.8);
        P.env[i] = 0.35;
      }
    }
  });
  // a burst of earth thrown up from the base
  const nClod = Math.round(60 * q);
  for (let k = 0; k < nClod; k++) {
    const a = Math.atan2(ny, nx) + rand(-1.2, 1.2);
    const sp = rand(20, 60);
    fx.clod(x + rand(-1, 1) * 6 * Z, y + rand(0, 3), Math.cos(a) * sp, Math.sin(a) * sp, rand(0.2, 0.55), rand(3, 5.5), k % 4 === 0 ? 0.06 : 0, k % 7 === 3);
  }
  // the mushroom cloud
  mushroom(fx, x, y, Z, gFire, gFlash);
  // ash and embers falling over the field for the whole of it
  fx.proc(
    10,
    (f, p, dt) => {
      p.acc -= dt;
      if (p.acc > 0) return;
      p.acc = 0.09 / Math.max(0.4, q);
      const px = x + rand(-110, 110) * Z;
      const py = y + rand(15, 90) * Z;
      const i = P.spawn(K.DIRT, px, py, rand(-1, 1), -rand(0.5, 1.5), rand(0.08, 0.17), rand(6, 10), 0.09, 0.085, 0.08, 0.9);
      if (i >= 0) {
        P.grav[i] = 0.07;
        P.drag[i] = 1.2;
        P.wind[i] = 0.6;
        P.hit[i] = 1;
        P.spin[i] = rand(-3, 3);
      }
      if (p.t < 6 && Math.random() < 0.8) {
        const j = f.ember(x + rand(-90, 90) * Z, y + rand(10, 70) * Z, rand(-1, 1), -rand(0.4, 1.4), rand(0.07, 0.13), rand(3, 6), 0.04, 1.1);
        if (j >= 0) P.wind[j] = 0.5;
      }
    },
    0.5,
  );
  // scorched ground over a wide area, glowing at the centre
  fx.decal(0, x, y, 62 * Z, 0.9, 0, 0, 0, 0, 1.5);
  fx.decal(0, x, y, 40 * Z, 1, 0, 0, 0, 0, 1);
  for (let k = 0; k < 8; k++) {
    const s = k % 2 ? 1 : -1;
    const px = x + s * rand(15, 85) * Z;
    fx.decal(0, px, T ? T.groundBelow(px, 140) : y, rand(10, 26) * Z, 0.8, 0, 0, 0, rand(-0.2, 0.2), rand(1.5, 3));
  }
  fx.decal(0, x, y, 30 * Z, 0, 0, 0, 1, 0, 1.3);
  fx.decal(0, x, y, 18 * Z, 0, 0, 0, 1, 0, 1);
}

// The mushroom cloud: a procedure that grows a stem and a rolling cap of
// puffs. The cap is two counter-rotating vortex cells (the torus seen in
// cross-section); puffs are spawned on them with their rolling velocity, then
// hang where they are as the cap climbs away, so the stem is the cap's wake.
// Puffs glow from inside when young and darken as they cool.
function mushroom(fx, x, y, Z, gFire, gFlash) {
  const P = fx.p;
  const q = fx.q.particleScale;
  const T = fx.terrain;
  const H = 60 * Z; // how high the cap centre climbs
  const tau = 2.5;
  const Rc = 22 * Z; // cap radius
  const gy0 = T ? T.groundBelow(x, 140) : y;
  const soil = fx.soil;
  fx.proc(9.5, (f, p, dt) => {
    const t = p.t;
    const lift = 1 - Math.exp(-(t + 0.25) / tau);
    const hc = gy0 + 6 * Z + H * lift;
    const vc = (H / tau) * Math.exp(-(t + 0.25) / tau);
    const grow = Math.min(1, 0.35 + t * 0.4);
    const rc = Rc * grow;
    // keep the inner light on the cap while it is young
    const b = Math.max(0, 1 - t / 7);
    gFire.x = x;
    gFire.y = hc - rc * 0.3;
    gFire.age = gFire.life * (1 - Math.sqrt(Math.max(0.02, b)));
    gFire.radius = (110 + rc * 3) * Z;
    // the flash light tapers on its own; nothing to hold
    void gFlash;
    p.acc += dt;
    const step = 1 / (44 * q);
    while (p.acc > step) {
      p.acc -= step;
      const r = Math.random();
      if (t < 6.2 && r < 0.62) {
        // cap: a puff on one of the two vortex cells
        const s = Math.random() < 0.5 ? -1 : 1;
        const u = rand(0, TAU);
        const cellX = Rc * 0.74 * grow;
        const cellR = rc * 0.5;
        const fill = Math.random() < 0.3; // the middle of the dome, between the two cells
        const px = fill ? x + rand(-0.45, 0.45) * Rc * grow : x + s * (cellX + Math.cos(u) * cellR * rand(0.6, 1.05));
        const py = fill ? hc + rand(-0.15, 0.5) * rc : hc + Math.sin(u) * cellR * rand(0.6, 1.0) * 0.8;
        const roll = (7 + 4 * Math.random()) * Z * Math.max(0.3, 1 - t * 0.1);
        const vx = fill ? rand(-2, 2) : s * Math.sin(u) * roll;
        const vy = fill ? rand(0, 3) + vc * 0.7 : -Math.cos(u) * roll + vc * 0.7;
        const sz = rand(7, 11) * Z * (0.7 + 0.4 * grow);
        // lit from below and inside while young, white-grey at the top
        const top = clamp(Math.sin(u) * 0.5 + 0.5, 0, 1);
        const sh = 0.13 + 0.09 * top + rand(0, 0.04);
        const i = f.puff(px, py, vx, vy, sz, rand(6.5, 9.5), sh * 1.05, sh, sh * 0.93, 0.82, 0.12, 1.15, 0.05);
        if (i >= 0) {
          P.env[i] = 0.55;
          P.heat[i] = Math.max(0, 1 - t / 5.5) * (0.5 + 0.7 * (1 - top)) * rand(0.8, 1.25) * 1.3;
        }
      } else if (t < 5.4) {
        // stem: a column from the ground up to the cap, narrowing as it
        // climbs, dusty at the foot and darker above
        const h = Math.random();
        const py = gy0 + 1 + h * (hc - gy0 - rc * 0.55);
        const wid = (4.2 - 1.6 * h) * Z * (0.8 + 0.3 * Math.min(1, t));
        const px = x + rand(-1, 1) * wid;
        const sz = rand(5.5, 8.5) * Z * (1.1 - 0.35 * h);
        const dusty = clamp(1 - h * 1.6, 0, 1);
        const sh = 0.13 + 0.1 * h + rand(0, 0.04);
        const cr = sh * (1 - dusty) + (soil[0] * 1.7 + 0.05) * dusty;
        const cg = sh * 0.95 * (1 - dusty) + (soil[1] * 1.7 + 0.045) * dusty;
        const cb = sh * 0.9 * (1 - dusty) + (soil[2] * 1.7 + 0.04) * dusty;
        const i = f.puff(px, py, rand(-1, 1) - (px - x) * 0.4, (4 + vc * 0.4) * (0.5 + h), sz, rand(5.5, 8.5), cr, cg, cb, 0.8, 0.1, 1.1, 0.05);
        if (i >= 0) {
          P.env[i] = 0.5;
          P.heat[i] = Math.max(0, 1 - t / 3.2) * (1 - h) * 0.9 * rand(0.5, 1);
        }
      }
    }
  });
}

export function blast(fx, kind, x, y, o) {
  (BLASTS[kind] || BLASTS.he)(fx, x, y, o);
}
