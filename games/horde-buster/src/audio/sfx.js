// Every one-shot of Horde Buster, as a recipe of layers (layers.js) that lib.js
// renders once into a mono buffer, several variants each. Per sound:
//   sr        sample rate it is rendered at (24 kHz for low, fat sounds; 32 kHz for glass, zaps, sparkle)
//   variants  how many differently seeded renders to make (the player picks one at random, never the last)
//   tgt       loudness it lands at, in dB of short-term A-weighted level (see loudness() in dsp.js)
//   gap       minimum ms between two plays; calls that come sooner are dropped and add a little to the next one
//   max       how many may sound at once (the oldest of the kind is cut for a new one)
//   pri       0..3: when all voices are busy a new sound may cut the oldest voice of its own priority or lower
//   duck      optional [amount, seconds]: dip the music when it plays
// The key is `group.name` for sounds with a kind (shot.blaster, pickup.heart, ui.click).
// Music in G major / E minor (the stings are in G major, the relative major of the battle theme).
import { seeded, removeDC, fadeEnds, saturate } from './dsp.js';
import { runLayers } from './layers.js';

const LO = 24000;
const HI = 32000;

// Turn a list of layers (or a function of (rng, variant) making one) into a render generator.
function recipe(dur, build, o = {}) {
  return function* render(sr, seed, v) {
    const r = seeded(seed);
    const n = Math.round(dur * sr);
    const out = new Float32Array(n);
    const layers = typeof build === 'function' ? build(r, v) : build;
    yield* runLayers(layers, out, sr, r, o.jit);
    removeDC(out);
    fadeEnds(out, Math.max(3, Math.round(0.0003 * sr)), Math.round((o.tail ?? 25) * 0.001 * sr));
    if (o.sat !== 0) saturate(out, o.sat ?? 1.5);
    return out;
  };
}

// ----------------------------------------------------------------------------
// small phrases the recipes share

// an FM bell: a sine with a decaying inharmonic modulator (coins, chimes, gems)
const bell = (at, f, tau, amp, idx = 1.6, ratio = 3.5) => ({
  k: 'tone', at, wave: 'sine', f0: f, f1: f, dur: tau * 6, att: 0.002, tau, amp, fm: [ratio, idx, tau * 0.6], rel: 0.03, jit: 0,
});

// a brass note: two detuned saws through a low-pass that opens as the note speaks
const brass = (at, f, dur, amp, o = {}) => ({
  k: 'tone', at, wave: 'saw', f0: f, f1: f, det: o.det ?? 12, dur, att: o.att ?? 0.02, tau: o.tau ?? Infinity, rel: o.rel ?? 0.12, amp,
  lp: [o.lp0 ?? 800, o.lp1 ?? 4000, o.tc ?? 0.12], q: 1, drive: o.drive ?? 1.2, jit: 0,
});

// a short metallic tick (a latch, a clasp)
const tick = (at, f, amp = 0.3) => [
  { k: 'crack', at, amp: amp * 1.4, dur: 0.003, hp: 2200, snap: 0 },
  { k: 'modal', at, amp, partials: [[f, 0.6, 0.012], [f * 1.8, 0.4, 0.008], [f * 2.7, 0.2, 0.005]] },
];

// a ring of glass
const sparkle = (at, n, t1, amp = 0.2, fLo = 3000, fHi = 11000) => ({
  k: 'tinkle', at, n, t0: 0, t1, lam: t1 * 0.5, amp, fLo, fHi, tauLo: 0.02, tauHi: 0.08, jit: 0,
});

// a fireball of the given size 0..1 starting at `at`
const boom = (at, s) => [
  { k: 'crack', at, amp: 1, dur: 0.012, hp: 600, snap: 0.8, snapFc: 2500, snapTau: 0.03 },
  { k: 'roar', at, dur: 0.35 + 0.65 * s, amp: 1, fA: 7000, fB: 300, tauF: 0.06 + 0.09 * s, q: 0.8, modFc: 25, modDepth: 0.5 },
  { k: 'body', at, f0: 130 - 50 * s, f1: 42 - 14 * s, tp: 0.06, tau: 0.12 + 0.3 * s, amp: 1, drive: 2.2 },
  { k: 'rumble', at, dur: 0.5 + 1.8 * s, amp: 0.5, fc: 170 - 80 * s, att: 0.01, tau: 0.2 + 0.5 * s, rollFc: 7, rollDepth: 0.3 },
  { k: 'debris', at, n: Math.round(14 + 40 * s), t0: 0.04, t1: 0.5 + 1.1 * s, lam: 0.15 + 0.3 * s, amp: 0.35, fLo: 600, fHi: 4500, grit: 0.6 },
];

// bones going: a handful of dry ticks and cracks
const crunch = (at, s) => [
  { k: 'debris', at, n: Math.round(6 + 10 * s), t0: 0.004, t1: 0.1 + 0.1 * s, lam: 0.05, amp: 0.4, fLo: 800, fHi: 3500, grit: 0.35 },
  { k: 'modal', at: at + 0.012, amp: 0.2 + 0.1 * s, partials: [[700 + 300 * s, 0.5, 0.02], [1500 + 400 * s, 0.3, 0.012]] },
];

// blood and mess: wet noise flutter, rising bubbles, drops
const gore = (at, s) => [
  { k: 'roar', at, dur: 0.2 + 0.4 * s, amp: 0.6, fA: 1800, fB: 220, tauF: 0.08 + 0.1 * s, q: 1.5, modFc: 40, modDepth: 0.9, hp: 150 },
  { k: 'bubbles', at, n: Math.round(4 + 10 * s), t0: 0.02, t1: 0.2 + 0.7 * s, amp: 0.45, fLo: 180, fHi: 650 },
  { k: 'debris', at, n: Math.round(8 + 20 * s), t0: 0.04, t1: 0.25 + 0.7 * s, lam: 0.15 + 0.25 * s, amp: 0.3, fLo: 300, fHi: 1600, grit: 0.85 },
];

// ----------------------------------------------------------------------------
// shots

const blaster = recipe(0.17, [
  { k: 'tone', wave: 'saw', f0: 2100, f1: 420, tp: 0.028, dur: 0.15, att: 0.001, tau: 0.045, amp: 0.55, det: 14, drive: 1.6, lp: [7500, 1900, 0.05], q: 1 },
  { k: 'tone', wave: 'sine', f0: 3300, f1: 1000, tp: 0.02, dur: 0.11, att: 0.001, tau: 0.03, amp: 0.4 },
  { k: 'crack', amp: 0.45, dur: 0.004, hp: 3500, snap: 0 },
  { k: 'body', f0: 260, f1: 95, tp: 0.018, tau: 0.035, amp: 0.45, dur: 0.1, drive: 1.2 },
], { sat: 1.4, tail: 14 });

const scatter = recipe(0.6, [
  { k: 'crack', amp: 1, dur: 0.014, hp: 700, snap: 0.7, snapFc: 2600, snapTau: 0.03 },
  { k: 'roar', dur: 0.24, amp: 0.8, fA: 6000, fB: 450, tauF: 0.045, hp: 120, env: [[0, 0], [0.002, 1], [0.05, 0.55], [0.24, 0.01], [0.244, 0]] },
  { k: 'body', f0: 170, f1: 52, tp: 0.045, tau: 0.11, amp: 1, drive: 2 },
  { k: 'rumble', dur: 0.5, amp: 0.35, fc: 220, att: 0.005, tau: 0.13 },
  ...tick(0.26, 1500, 0.3),
  ...tick(0.33, 1250, 0.25),
]);

const rocket = recipe(0.75, [
  { k: 'crack', amp: 0.5, dur: 0.012, hp: 900, snap: 0.5, snapFc: 1800, snapTau: 0.04 },
  { k: 'body', f0: 130, f1: 48, tp: 0.07, tau: 0.14, amp: 0.8, drive: 1.6 },
  { k: 'whoosh', dur: 0.66, f0: 350, f1: 3200, q: 0.9, amp: 0.8, env: [[0, 0], [0.04, 1], [0.24, 0.8], [0.66, 0]] },
  { k: 'roar', dur: 0.5, amp: 0.4, fA: 3500, fB: 500, tauF: 0.2, hp: 200, modFc: 45, modDepth: 0.5 },
  { k: 'rumble', dur: 0.65, amp: 0.3, fc: 160, att: 0.02, tau: 0.2 },
]);

const railgun = recipe(0.7, [
  { k: 'tone', wave: 'square', f0: 2800, f1: 180, tp: 0.09, dur: 0.42, att: 0.002, tau: 0.12, amp: 0.5, drive: 2, lp: [9000, 1500, 0.1] },
  { k: 'tone', wave: 'sine', f0: 7000, f1: 900, tp: 0.05, dur: 0.25, att: 0.001, tau: 0.06, amp: 0.4 },
  { k: 'crack', amp: 0.9, dur: 0.008, hp: 3000, snap: 0.6, snapFc: 4000 },
  { k: 'body', f0: 110, f1: 32, tp: 0.09, tau: 0.22, amp: 1, drive: 2.5 },
  { k: 'debris', n: 30, t0: 0, t1: 0.4, lam: 0.15, amp: 0.3, fLo: 3000, fHi: 11000, grit: 0.4, gritLen: 0.6 },
  { k: 'modal', amp: 0.35, partials: [[1850, 0.6, 0.22], [2790, 0.4, 0.16], [4100, 0.2, 0.1]] },
]);

// ----------------------------------------------------------------------------
// flesh

// a bullet into meat: a dull slap, a wet flutter
const hit = recipe(0.16, [
  { k: 'body', f0: 230, f1: 85, tp: 0.014, tau: 0.03, amp: 0.9, drive: 1.3, dur: 0.1 },
  { k: 'roar', dur: 0.07, amp: 0.65, fA: 2800, fB: 450, tauF: 0.022, q: 1.1, env: [[0, 0], [0.001, 1], [0.07, 0.01], [0.074, 0]] },
  { k: 'roar', at: 0.012, dur: 0.11, amp: 0.3, fA: 1400, fB: 300, tauF: 0.04, q: 1.8, modFc: 55, modDepth: 0.9, env: [[0, 0], [0.004, 1], [0.11, 0.01], [0.114, 0]] },
  { k: 'crack', amp: 0.3, dur: 0.003, hp: 1800, snap: 0 },
], { tail: 15 });

// a critical: the same with a bone crunch and a ring
const hitCrit = recipe(0.32, [
  { k: 'body', f0: 270, f1: 70, tp: 0.02, tau: 0.05, amp: 1, drive: 1.8, dur: 0.2 },
  { k: 'roar', dur: 0.12, amp: 0.8, fA: 3600, fB: 400, tauF: 0.035, q: 1.1, env: [[0, 0], [0.001, 1], [0.12, 0.01], [0.124, 0]] },
  { k: 'crack', amp: 0.7, dur: 0.007, hp: 1200, snap: 0.5, snapFc: 2400, snapTau: 0.02 },
  { k: 'modal', at: 0.004, amp: 0.35, partials: [[1100, 0.5, 0.03], [1900, 0.3, 0.02], [2900, 0.2, 0.015]] },
  { k: 'debris', n: 14, t0: 0.01, t1: 0.24, lam: 0.08, amp: 0.5, fLo: 700, fHi: 3200, grit: 0.5 },
  { k: 'roar', at: 0.02, dur: 0.2, amp: 0.3, fA: 1600, fB: 300, tauF: 0.07, q: 1.8, modFc: 50, modDepth: 0.9 },
], {});

// a gory splat
const kill = recipe(0.55, [
  { k: 'body', f0: 140, f1: 50, tp: 0.04, tau: 0.08, amp: 0.9, drive: 1.5, dur: 0.3 },
  { k: 'crack', amp: 0.5, dur: 0.008, hp: 800, snap: 0.6, snapFc: 1800, snapTau: 0.03 },
  ...gore(0, 0.4),
  ...crunch(0, 0.3),
]);

// a big one: a brute, the boss's minions
const killBig = recipe(1.1, [
  { k: 'body', f0: 105, f1: 36, tp: 0.05, tau: 0.17, amp: 1, drive: 2, dur: 0.7 },
  { k: 'crack', amp: 0.6, dur: 0.01, hp: 700, snap: 0.7, snapFc: 1600, snapTau: 0.04 },
  ...gore(0, 1),
  ...crunch(0, 1),
  ...[0.05, 0.1, 0.16].map((t, i) => ({ k: 'modal', at: t, amp: 0.3, partials: [[600 + 350 * i, 0.5, 0.025], [1500 + 400 * i, 0.3, 0.015]] })),
  { k: 'rumble', dur: 0.9, amp: 0.4, fc: 130, att: 0.01, tau: 0.25 },
]);

// a head bursting: a cork pop, then the mess
const headPop = recipe(0.5, [
  { k: 'tone', wave: 'sine', f0: 260, f1: 900, tp: 0.03, dur: 0.12, att: 0.002, tau: 0.04, amp: 0.8 },
  { k: 'crack', amp: 0.75, dur: 0.006, hp: 1200, snap: 0.5, snapFc: 2400, snapTau: 0.02 },
  { k: 'body', at: 0.012, f0: 160, f1: 60, tp: 0.03, tau: 0.07, amp: 0.8, drive: 1.5, dur: 0.25 },
  ...gore(0.015, 0.6),
]);

// a limb bouncing on asphalt: two wet thuds
const gib = recipe(0.24, [
  { k: 'body', f0: 130, f1: 70, tp: 0.025, tau: 0.04, amp: 0.8, drive: 1.2, dur: 0.12 },
  { k: 'roar', dur: 0.07, amp: 0.5, fA: 900, fB: 250, tauF: 0.025, env: [[0, 0], [0.002, 1], [0.07, 0.01], [0.074, 0]] },
  { k: 'modal', amp: 0.2, partials: [[900, 0.5, 0.02]] },
  { k: 'body', at: 0.1, f0: 115, f1: 65, tp: 0.025, tau: 0.035, amp: 0.45, drive: 1.1, dur: 0.1 },
  { k: 'roar', at: 0.1, dur: 0.05, amp: 0.25, fA: 800, fB: 250, tauF: 0.02, env: [[0, 0], [0.002, 1], [0.05, 0.01], [0.054, 0]] },
]);

// ----------------------------------------------------------------------------
// blasts

const explodeS = recipe(1.0, () => boom(0, 0.1), { tail: 60 });
const explodeM = recipe(1.7, () => [
  ...boom(0, 0.55),
  { k: 'clods', n: 4, t0: 0.1, t1: 1.0, amp: 0.4 },
  { k: 'echo', taps: [[0.35, 0.12], [0.7, 0.06]], fc: 500, atk: 0.05, tau: 0.25, amp: 0.8 },
], { sat: 2, tail: 80 });
const explodeL = recipe(2.8, () => [
  ...boom(0, 1),
  { k: 'tone', wave: 'sine', f0: 58, f1: 24, tp: 0.5, dur: 1.6, att: 0.01, tau: 0.6, amp: 0.7, jit: 0.05 },
  { k: 'clods', n: 9, t0: 0.1, t1: 1.6, amp: 0.5 },
  { k: 'echo', taps: [[0.4, 0.14], [0.85, 0.09], [1.4, 0.05]], fc: 480, atk: 0.06, tau: 0.35, amp: 0.9 },
], { sat: 2.4, tail: 120 });

// the horde freezing over: a rising icy sweep, a rain of glass, a cold thump
const freeze = recipe(1.6, [
  { k: 'body', f0: 150, f1: 62, tp: 0.05, tau: 0.2, amp: 0.55, drive: 1.3 },
  { k: 'crack', amp: 0.4, dur: 0.006, hp: 4000, snap: 0 },
  { k: 'whoosh', dur: 1.05, f0: 1200, f1: 7500, q: 1.5, amp: 0.7, env: [[0, 0], [0.5, 1], [1.05, 0]] },
  { k: 'tone', wave: 'sine', f0: 1800, f1: 2500, dur: 1.3, att: 0.15, tau: 0.5, amp: 0.2, fm: [2.4, 2.5, 0.5], jit: 0 },
  sparkle(0.1, 42, 1.2, 0.3, 3500, 12500),
  bell(1.0, 3136, 0.5, 0.2, 1.2),
], { sat: 1.2 });

// an ice statue bursting
const shatter = recipe(0.5, [
  { k: 'crack', amp: 0.8, dur: 0.01, hp: 3000, snap: 0.3, snapFc: 5000, snapTau: 0.01 },
  sparkle(0, 26, 0.38, 0.3, 2500, 12000),
  { k: 'roar', dur: 0.22, amp: 0.35, fA: 9000, fB: 3000, tauF: 0.06, hp: 2500, modFc: 80, modDepth: 0.7 },
  { k: 'body', f0: 320, f1: 140, tp: 0.02, tau: 0.04, amp: 0.3, dur: 0.12 },
], {});

// lightning jumping from body to body
const zap = recipe(0.4, [
  { k: 'crack', amp: 0.7, dur: 0.006, hp: 3500, snap: 0.3, snapFc: 5000, snapTau: 0.012 },
  { k: 'tone', wave: 'saw', f0: 170, f1: 150, tp: 1, dur: 0.3, att: 0.002, tau: 0.12, amp: 0.55, am: [58, 0.7], drive: 2.5, lp: [6000, 2200, 0.1] },
  { k: 'tone', wave: 'square', f0: 4200, f1: 600, tp: 0.03, dur: 0.14, att: 0.001, tau: 0.04, amp: 0.35, lp: [9000, 3000, 0.05] },
  { k: 'debris', n: 42, t0: 0, t1: 0.32, lam: 0.14, amp: 0.55, fLo: 3000, fHi: 11000, grit: 0.7, gritLen: 0.7 },
], {});

// a spitter's glob
const spit = recipe(0.42, [
  { k: 'tone', wave: 'sine', f0: 230, f1: 720, tp: 0.05, dur: 0.18, att: 0.004, tau: 0.07, amp: 0.7 },
  { k: 'roar', dur: 0.22, amp: 0.5, fA: 3200, fB: 700, tauF: 0.07, hp: 1500, q: 1.3, modFc: 70, modDepth: 0.8 },
  { k: 'bubbles', n: 6, t0: 0.04, t1: 0.35, amp: 0.4, fLo: 250, fHi: 750 },
  { k: 'crack', amp: 0.3, dur: 0.005, hp: 1500, snap: 0.2 },
]);

// the boss's red bullets: a dark falling whine
const enemyShot = recipe(0.34, [
  { k: 'tone', wave: 'saw', f0: 720, f1: 170, tp: 0.09, dur: 0.3, att: 0.004, tau: 0.1, amp: 0.7, det: 22, drive: 2, lp: [3200, 900, 0.08] },
  { k: 'tone', wave: 'sine', f0: 1500, f1: 400, tp: 0.05, dur: 0.18, att: 0.002, tau: 0.05, amp: 0.3 },
  { k: 'body', f0: 120, f1: 60, tp: 0.04, tau: 0.08, amp: 0.55, drive: 1.5, dur: 0.15 },
  { k: 'roar', dur: 0.12, amp: 0.25, fA: 4000, fB: 800, tauF: 0.04 },
]);

// ----------------------------------------------------------------------------
// pickups

const pickMagnet = recipe(1.0, [
  { k: 'tone', wave: 'saw', f0: 90, f1: 300, dur: 0.8, att: 0.06, tau: Infinity, rel: 0.1, amp: 0.5, det: 30, am: [28, 0.5], lp: [500, 3000, 0.4], drive: 1.4, jit: 0 },
  { k: 'tone', wave: 'sine', f0: 440, f1: 990, dur: 0.75, att: 0.05, tau: Infinity, rel: 0.1, amp: 0.3, fm: [2, 1.5, 0.6], jit: 0 },
  { k: 'whoosh', dur: 0.7, f0: 300, f1: 3500, q: 1.2, amp: 0.4, env: [[0, 0], [0.6, 1], [0.7, 0]] },
  { k: 'body', at: 0.7, f0: 160, f1: 70, tp: 0.03, tau: 0.07, amp: 0.6, drive: 1.3 },
  bell(0.7, 1568, 0.3, 0.4),
], { sat: 1.2 });

const pickFreeze = recipe(0.95, [
  bell(0, 2349, 0.35, 0.4, 1.1, 2.7),
  bell(0.09, 3136, 0.35, 0.4, 1.1, 2.7),
  bell(0.18, 3951, 0.45, 0.4, 1.1, 2.7),
  { k: 'whoosh', at: 0.05, dur: 0.6, f0: 6000, f1: 1500, q: 1.3, amp: 0.35, env: [[0, 0], [0.1, 1], [0.6, 0]] },
  sparkle(0.1, 24, 0.7, 0.25, 4000, 12500),
  { k: 'crack', amp: 0.25, dur: 0.004, hp: 5000, snap: 0 },
], { sat: 0 });

const pickShield = recipe(0.85, [
  { k: 'tone', wave: 'sine', f0: 280, f1: 620, dur: 0.55, att: 0.04, tau: Infinity, rel: 0.1, amp: 0.55, jit: 0 },
  { k: 'tone', wave: 'sine', f0: 420, f1: 930, dur: 0.55, att: 0.04, tau: Infinity, rel: 0.1, amp: 0.3, jit: 0 },
  { k: 'tone', wave: 'saw', f0: 140, f1: 310, dur: 0.55, att: 0.04, tau: Infinity, rel: 0.1, amp: 0.25, am: [40, 0.6], lp: [600, 3000, 0.3], jit: 0 },
  { k: 'debris', n: 30, t0: 0, t1: 0.55, lam: 0.3, amp: 0.3, fLo: 3000, fHi: 10000, grit: 0.6, gritLen: 0.6 },
  bell(0.52, 1760, 0.3, 0.4),
  { k: 'body', at: 0.52, f0: 140, f1: 70, tp: 0.03, tau: 0.08, amp: 0.45, drive: 1.2 },
], { sat: 1.2 });

const pickBomb = recipe(0.7, [
  ...tick(0, 700, 0.5),
  { k: 'modal', amp: 0.5, partials: [[310, 1, 0.09], [480, 0.7, 0.07], [930, 0.5, 0.05], [1480, 0.3, 0.03]] },
  { k: 'body', f0: 150, f1: 62, tp: 0.03, tau: 0.09, amp: 0.8, drive: 1.5, dur: 0.25 },
  { k: 'roar', at: 0.1, dur: 0.4, amp: 0.3, fA: 9000, fB: 4000, tauF: 0.2, hp: 3000, modFc: 150, modDepth: 0.9 },
  ...tick(0.34, 1400, 0.25),
  ...tick(0.46, 1700, 0.25),
]);

const pickHeart = recipe(0.9, [
  bell(0, 784, 0.3, 0.5, 0.8, 2),
  bell(0.08, 987.8, 0.3, 0.5, 0.8, 2),
  bell(0.16, 1174.7, 0.5, 0.55, 0.8, 2),
  { k: 'tone', wave: 'sine', f0: 392, f1: 392, dur: 0.7, att: 0.05, tau: 0.35, amp: 0.3, jit: 0 },
  { k: 'tone', wave: 'sine', f0: 587.3, f1: 587.3, dur: 0.7, att: 0.1, tau: 0.35, amp: 0.2, jit: 0 },
  sparkle(0.18, 14, 0.6, 0.12, 3500, 9000),
], { sat: 0 });

const pickChest = recipe(1.6, [
  { k: 'body', f0: 100, f1: 46, tp: 0.04, tau: 0.12, amp: 0.9, drive: 1.5 },
  { k: 'crack', amp: 0.4, dur: 0.01, hp: 600, snap: 0.6, snapFc: 1500, snapTau: 0.03 },
  { k: 'whoosh', at: 0.05, dur: 0.6, f0: 500, f1: 5000, q: 1, amp: 0.4, env: [[0, 0], [0.5, 1], [0.6, 0]] },
  ...[784, 987.8, 1174.7, 1568].map((f, i) => bell(0.12 + i * 0.07, f, 0.5, 0.35, 1.2)),
  ...[392, 587.3, 784].map((f) => brass(0.25, f, 0.9, 0.16, { tau: 0.7, rel: 0.3, lp0: 1000, lp1: 4000 })),
  sparkle(0.12, 38, 1.3, 0.22, 2200, 8000),
], {});

const pickWeapon = recipe(1.4, [
  ...tick(0, 1100, 0.5),
  ...tick(0.13, 850, 0.5),
  { k: 'body', at: 0.13, f0: 120, f1: 55, tp: 0.03, tau: 0.08, amp: 0.7, drive: 1.5, dur: 0.25 },
  { k: 'tone', at: 0.2, wave: 'saw', f0: 150, f1: 600, dur: 0.4, att: 0.02, tau: Infinity, rel: 0.05, amp: 0.4, det: 20, lp: [500, 5000, 0.25], drive: 1.5, jit: 0 },
  brass(0.6, 196, 0.7, 0.35, { tau: 0.55, rel: 0.2 }),
  brass(0.6, 293.7, 0.7, 0.3, { tau: 0.55, rel: 0.2 }),
  brass(0.6, 392, 0.7, 0.3, { tau: 0.55, rel: 0.2 }),
  { k: 'body', at: 0.6, f0: 100, f1: 45, tp: 0.04, tau: 0.18, amp: 0.8, drive: 1.6 },
  bell(0.6, 1568, 0.45, 0.3),
  sparkle(0.6, 14, 0.7, 0.18),
], {});

// ----------------------------------------------------------------------------
// XP gems: one bell per octave of the G major scale; the player pitches it up by the step

const gemBell = (f) => recipe(0.36, [
  { k: 'tone', wave: 'sine', f0: f, f1: f, dur: 0.32, att: 0.002, tau: 0.08, amp: 0.8, fm: [2, 0.9, 0.05], jit: 0 },
  { k: 'tone', wave: 'sine', f0: f * 2.005, f1: f * 2.005, dur: 0.2, att: 0.001, tau: 0.04, amp: 0.3, jit: 0 },
  { k: 'tone', wave: 'sine', f0: f * 3.01, f1: f * 3.01, dur: 0.12, att: 0.001, tau: 0.025, amp: 0.12, jit: 0 },
  { k: 'crack', amp: 0.1, dur: 0.002, hp: 5000, snap: 0 },
], { sat: 0, jit: 0, tail: 25 });

// ----------------------------------------------------------------------------
// progression

const levelUp = recipe(2.4, [
  { k: 'whoosh', dur: 0.4, f0: 600, f1: 7000, q: 1.1, amp: 0.5, env: [[0, 0], [0.3, 1], [0.4, 0]] },
  ...[392, 493.9, 587.3, 784].map((f, i) => brass(i * 0.085, f, 0.3, 0.3, { tau: 0.3, rel: 0.1, lp0: 900, lp1: 4500 })),
  ...[196, 392, 493.9, 587.3, 784, 987.8].map((f) => brass(0.42, f, 1.4, 0.22, { tau: 1.1, rel: 0.5, lp0: 1200, lp1: 5200, tc: 0.2 })),
  { k: 'body', at: 0.42, f0: 100, f1: 42, tp: 0.05, tau: 0.3, amp: 0.8, drive: 1.5 },
  { k: 'crack', at: 0.42, amp: 0.5, dur: 0.01, hp: 1800, snap: 0 },
  { k: 'roar', at: 0.42, dur: 1.4, amp: 0.3, fA: 14000, fB: 6500, tauF: 0.5, hp: 5000, env: [[0, 0], [0.01, 1], [1.4, 0]] },
  bell(0.42, 1568, 0.6, 0.3),
  bell(0.5, 1975.5, 0.5, 0.2),
  bell(0.58, 2349, 0.45, 0.15),
  sparkle(0.45, 26, 1.7, 0.18),
], { sat: 1.1 });

const card = recipe(0.5, [
  bell(0, 587.3, 0.2, 0.5, 1.2),
  bell(0.07, 784, 0.3, 0.55, 1.2),
  { k: 'whoosh', dur: 0.2, f0: 800, f1: 4000, q: 1.2, amp: 0.3, env: [[0, 0], [0.12, 1], [0.2, 0]] },
  { k: 'body', at: 0.06, f0: 140, f1: 70, tp: 0.03, tau: 0.06, amp: 0.55, drive: 1.3, dur: 0.18 },
  { k: 'crack', amp: 0.25, dur: 0.004, hp: 2500, snap: 0 },
], {});

// a weapon evolving: a riser, an impact, a big chord
const evolve = recipe(2.6, [
  { k: 'tone', wave: 'saw', f0: 100, f1: 800, dur: 1.2, att: 0.1, tau: Infinity, rel: 0.05, amp: 0.4, det: 40, lp: [300, 6000, 0.7], drive: 1.5, jit: 0 },
  { k: 'whoosh', dur: 1.2, f0: 400, f1: 9000, q: 1.2, amp: 0.55, env: [[0, 0], [1.1, 1], [1.2, 0]] },
  sparkle(0, 24, 1.2, 0.15),
  { k: 'body', at: 1.2, f0: 100, f1: 34, tp: 0.05, tau: 0.5, amp: 1.1, drive: 2 },
  { k: 'crack', at: 1.2, amp: 0.7, dur: 0.012, hp: 1200, snap: 0.6, snapFc: 3000 },
  ...[98, 196, 293.7, 392, 493.9, 587.3, 784].map((f) => brass(1.2, f, 1.3, 0.2, { tau: 1.0, rel: 0.5, lp0: 1500, lp1: 5500, tc: 0.15 })),
  { k: 'roar', at: 1.2, dur: 1.4, amp: 0.3, fA: 14000, fB: 6000, tauF: 0.5, hp: 5000, env: [[0, 0], [0.01, 1], [1.4, 0]] },
  bell(1.2, 1568, 0.7, 0.3),
  bell(1.3, 2349, 0.6, 0.2),
  sparkle(1.2, 40, 1.3, 0.18),
], { sat: 1.2 });

const waveStart = recipe(1.6, [
  brass(0, 98, 1.3, 0.5, { att: 0.28, tau: Infinity, rel: 0.3, lp0: 250, lp1: 1700, tc: 0.35, det: 16, drive: 1.8 }),
  brass(0, 146.8, 1.3, 0.35, { att: 0.28, tau: Infinity, rel: 0.3, lp0: 250, lp1: 1700, tc: 0.35, det: 16, drive: 1.8 }),
  { k: 'whoosh', dur: 0.7, f0: 200, f1: 1800, q: 1, amp: 0.3, env: [[0, 0], [0.6, 1], [0.7, 0]] },
  { k: 'body', at: 0.55, f0: 95, f1: 38, tp: 0.05, tau: 0.3, amp: 1, drive: 2 },
  { k: 'crack', at: 0.55, amp: 0.5, dur: 0.01, hp: 800, snap: 0.5 },
  { k: 'body', at: 0.9, f0: 90, f1: 38, tp: 0.05, tau: 0.25, amp: 0.7, drive: 2 },
  { k: 'rumble', at: 0.55, dur: 1.0, amp: 0.4, fc: 110, att: 0.01, tau: 0.35 },
], {});

const waveComplete = recipe(2.8, [
  ...Array.from({ length: 14 }, (_, i) => ({ k: 'body', at: i * 0.04, f0: 150, f1: 80, tp: 0.02, tau: 0.05, amp: 0.15 + 0.4 * (i / 13), drive: 1.1, dur: 0.12, jit: 0.03 })),
  ...[392, 493.9, 587.3].map((f, i) => brass(0.5 + i * 0.16, f, 0.2, 0.32, { tau: 0.2, rel: 0.06, lp0: 1000, lp1: 4500 })),
  ...[196, 392, 493.9, 587.3, 784, 987.8].map((f) => brass(1.0, f, 1.6, 0.22, { tau: 1.3, rel: 0.6, lp0: 1300, lp1: 5200, tc: 0.18 })),
  { k: 'body', at: 1.0, f0: 100, f1: 40, tp: 0.05, tau: 0.35, amp: 1, drive: 1.6 },
  { k: 'roar', at: 1.0, dur: 1.6, amp: 0.3, fA: 14000, fB: 6500, tauF: 0.6, hp: 5000, env: [[0, 0], [0.01, 1], [1.6, 0]] },
  bell(1.0, 1568, 0.7, 0.28),
  bell(1.08, 1975.5, 0.6, 0.2),
  sparkle(1.0, 30, 1.8, 0.16),
], { sat: 1.1 });

// a coin counting up: three pitches
const coin = recipe(0.2, (r, v) => {
  const f = [1568, 1760, 1976][v % 3];
  return [
    bell(0, f, 0.04, 0.8, 1.5, 3.2),
    { k: 'tone', wave: 'sine', f0: f * 2.76, f1: f * 2.76, dur: 0.08, att: 0.001, tau: 0.02, amp: 0.25, jit: 0 },
    { k: 'crack', amp: 0.25, dur: 0.002, hp: 5000, snap: 0 },
  ];
}, { sat: 0, tail: 12 });

const claim = recipe(1.7, [
  { k: 'body', f0: 120, f1: 58, tp: 0.03, tau: 0.1, amp: 0.7, drive: 1.4, dur: 0.3 },
  ...tick(0, 2637, 0.5),
  { k: 'modal', amp: 0.5, partials: [[2637, 1, 0.35], [3951, 0.6, 0.25], [5300, 0.3, 0.18]] },
  ...tick(0.085, 3136, 0.4),
  { k: 'modal', at: 0.085, amp: 0.4, partials: [[3136, 1, 0.3], [4700, 0.5, 0.2]] },
  sparkle(0.1, 36, 1.3, 0.2, 2500, 7500),
  ...[392, 493.9, 587.3, 784].map((f) => brass(0.12, f, 0.6, 0.22, { tau: 0.45, rel: 0.25, lp0: 1100, lp1: 4500 })),
  { k: 'body', at: 0.12, f0: 100, f1: 46, tp: 0.04, tau: 0.2, amp: 0.7, drive: 1.5 },
], { sat: 1.2 });

// ----------------------------------------------------------------------------
// the shield

const shieldUp = recipe(0.85, [
  { k: 'tone', wave: 'sine', f0: 200, f1: 720, dur: 0.6, att: 0.03, tau: Infinity, rel: 0.1, amp: 0.55, jit: 0 },
  { k: 'tone', wave: 'saw', f0: 100, f1: 360, dur: 0.6, att: 0.03, tau: Infinity, rel: 0.1, amp: 0.3, am: [36, 0.6], lp: [500, 3500, 0.25], drive: 1.4, jit: 0 },
  { k: 'debris', n: 36, t0: 0, t1: 0.6, lam: 0.3, amp: 0.3, fLo: 3000, fHi: 10000, grit: 0.6, gritLen: 0.6 },
  bell(0.55, 1568, 0.25, 0.4),
  { k: 'body', at: 0.55, f0: 130, f1: 65, tp: 0.03, tau: 0.08, amp: 0.45, drive: 1.2 },
], { sat: 1.2 });

const shieldHit = recipe(0.38, [
  { k: 'crack', amp: 0.5, dur: 0.012, hp: 3000, snap: 0 },
  { k: 'tone', wave: 'sine', f0: 1500, f1: 420, tp: 0.1, dur: 0.3, att: 0.002, tau: 0.1, amp: 0.55, fm: [1.5, 1.5, 0.08] },
  { k: 'tone', wave: 'square', f0: 128, f1: 108, tp: 0.2, dur: 0.3, att: 0.003, tau: 0.12, amp: 0.4, drive: 3.2, lp: [1500, 700, 0.1] },
  { k: 'roar', dur: 0.3, amp: 0.25, fA: 12000, fB: 5000, tauF: 0.15, hp: 4500, modFc: 90, modDepth: 0.8 },
], {});

const shieldDown = recipe(0.8, [
  { k: 'tone', wave: 'sine', f0: 760, f1: 110, tp: 0.25, dur: 0.6, att: 0.005, tau: 0.3, amp: 0.55, jit: 0.05 },
  { k: 'tone', wave: 'saw', f0: 340, f1: 70, tp: 0.25, dur: 0.6, att: 0.005, tau: 0.3, amp: 0.3, am: [30, 0.7], lp: [3000, 400, 0.25], drive: 1.5 },
  { k: 'debris', n: 36, t0: 0, t1: 0.55, lam: 0.2, amp: 0.3, fLo: 2500, fHi: 9000, grit: 0.7, gritLen: 0.6 },
  { k: 'body', f0: 110, f1: 40, tp: 0.08, tau: 0.2, amp: 0.5, drive: 1.3 },
], { sat: 1.2 });

// ----------------------------------------------------------------------------
// the hero's abilities

const bombThrow = recipe(0.5, [
  { k: 'whoosh', dur: 0.4, f0: 400, f1: 2000, q: 1.2, amp: 0.7, env: [[0, 0], [0.12, 1], [0.4, 0]] },
  { k: 'tone', wave: 'sine', f0: 480, f1: 920, tp: 0.05, dur: 0.12, att: 0.01, tau: 0.06, amp: 0.25 },
  { k: 'body', f0: 120, f1: 70, tp: 0.03, tau: 0.06, amp: 0.4, drive: 1.2, dur: 0.15 },
  { k: 'crack', amp: 0.2, dur: 0.004, hp: 2500, snap: 0 },
]);

// a bolt from the sky
const lightning = recipe(3.0, [
  { k: 'crack', amp: 1, dur: 0.02, hp: 1500, snap: 0.8, snapFc: 4000, snapTau: 0.04 },
  { k: 'tone', wave: 'saw', f0: 4000, f1: 100, tp: 0.08, dur: 0.35, att: 0.001, tau: 0.12, amp: 0.5, drive: 2, lp: [9000, 1500, 0.1] },
  { k: 'debris', n: 90, t0: 0, t1: 0.9, lam: 0.25, amp: 0.5, fLo: 2500, fHi: 12000, grit: 0.5, gritLen: 0.8 },
  { k: 'body', at: 0.04, f0: 95, f1: 28, tp: 0.06, tau: 0.4, amp: 1.1, drive: 2.5 },
  { k: 'roar', at: 0.05, dur: 2.4, amp: 0.8, fA: 2800, fB: 120, tauF: 0.6, q: 0.7, modFc: 12, modDepth: 0.7 },
  { k: 'rumble', at: 0.05, dur: 2.8, amp: 0.6, fc: 100, att: 0.02, tau: 0.9, rollFc: 4, rollDepth: 0.5 },
  { k: 'echo', taps: [[0.5, 0.2], [1.0, 0.12], [1.6, 0.08]], fc: 600, atk: 0.06, tau: 0.4, amp: 0.8 },
], { sat: 2.2, tail: 150 });

// ----------------------------------------------------------------------------
// the hero

const hurt = recipe(0.55, [
  { k: 'body', f0: 170, f1: 60, tp: 0.03, tau: 0.07, amp: 0.9, drive: 1.6, dur: 0.25 },
  { k: 'roar', dur: 0.12, amp: 0.6, fA: 2400, fB: 300, tauF: 0.04, q: 1.3, modFc: 50, modDepth: 0.8 },
  { k: 'crack', amp: 0.4, dur: 0.006, hp: 1000, snap: 0.4 },
  {
    k: 'growl', at: 0.02, dur: 0.32, f0: 150, f1: 90, jit: 0.1, breath: 0.2, drive: 1.5, amp: 0.6,
    formants: [[650, 480, 6, 1], [1100, 850, 8, 0.6], [2500, 2000, 10, 0.25]], env: [[0, 0], [0.03, 1], [0.12, 0.7], [0.32, 0]],
  },
]);

const death = recipe(2.6, [
  { k: 'body', f0: 120, f1: 38, tp: 0.05, tau: 0.25, amp: 1, drive: 2, dur: 1.0 },
  { k: 'crack', amp: 0.7, dur: 0.012, hp: 800, snap: 0.7, snapFc: 1800, snapTau: 0.04 },
  ...gore(0, 1),
  ...gore(0.35, 0.8),
  ...[0.06, 0.12, 0.2, 0.31].map((t, i) => ({ k: 'modal', at: t, amp: 0.3, partials: [[500 + 300 * i, 0.5, 0.03], [1400 + 300 * i, 0.3, 0.02]] })),
  {
    k: 'growl', at: 0.08, dur: 1.9, f0: 165, f1: 45, jit: 0.08, vib: [5, 0.03], pulse: [20, 0.5], breath: 0.2, drive: 1.6, amp: 0.65,
    formants: [[800, 330, 5, 1], [1200, 700, 7, 0.6], [2600, 1500, 9, 0.2]], env: [[0, 0], [0.1, 1], [1.2, 0.6], [1.9, 0]],
  },
  { k: 'tone', wave: 'sine', f0: 80, f1: 24, tp: 0.5, dur: 1.5, att: 0.02, tau: 0.6, amp: 0.6, jit: 0.05 },
  { k: 'rumble', dur: 2.2, amp: 0.4, fc: 100, att: 0.02, tau: 0.8 },
]);

const heartbeat = recipe(0.92, [
  { k: 'body', f0: 78, f1: 42, tp: 0.05, tau: 0.09, amp: 1, drive: 1.2, dur: 0.3 },
  { k: 'body', at: 0.3, f0: 70, f1: 40, tp: 0.05, tau: 0.075, amp: 0.65, drive: 1.2, dur: 0.26 },
  { k: 'body', f0: 150, f1: 95, tp: 0.03, tau: 0.05, amp: 0.55, drive: 1.3, dur: 0.15 },
  { k: 'body', at: 0.3, f0: 140, f1: 90, tp: 0.03, tau: 0.045, amp: 0.35, drive: 1.3, dur: 0.12 },
  { k: 'roar', dur: 0.08, amp: 0.3, fA: 900, fB: 200, tauF: 0.03 },
  { k: 'roar', at: 0.3, dur: 0.06, amp: 0.18, fA: 800, fB: 200, tauF: 0.03 },
], { sat: 1.6, tail: 8, jit: 0.04 });

// ----------------------------------------------------------------------------
// the boss

// 'oh' to 'ah' formants: the shape of a roar
const ROAR_F = [[500, 900, 5, 1], [1000, 1500, 6, 0.8], [2400, 1800, 9, 0.35]];

const bossRoar = recipe(2.6, [
  {
    k: 'growl', dur: 2.3, f0: 80, f1: 54, jit: 0.07, vib: [5.5, 0.02], pulse: [26, 0.7], breath: 0.25, drive: 2.8, amp: 1, formants: ROAR_F,
    env: [[0, 0], [0.12, 1], [1.5, 0.85], [2.3, 0]],
  },
  {
    k: 'growl', at: 0.05, dur: 2.2, f0: 160, f1: 108, jit: 0.07, pulse: [26, 0.6], breath: 0.3, drive: 2.4, amp: 0.45, formants: ROAR_F,
    env: [[0, 0], [0.15, 1], [1.4, 0.8], [2.2, 0]],
  },
  { k: 'tone', wave: 'sine', f0: 52, f1: 40, dur: 2.2, att: 0.15, tau: Infinity, rel: 0.4, amp: 0.55, jit: 0 },
  { k: 'rumble', dur: 2.4, amp: 0.5, fc: 120, att: 0.05, tau: 1.0 },
  { k: 'roar', dur: 2.0, amp: 0.3, fA: 1800, fB: 500, tauF: 0.8, hp: 200, modFc: 30, modDepth: 0.6 },
]);

const bossSlam = recipe(2.0, [
  { k: 'crack', amp: 1, dur: 0.02, hp: 400, snap: 0.9, snapFc: 1500, snapTau: 0.05 },
  { k: 'body', f0: 75, f1: 24, tp: 0.15, tau: 0.45, amp: 1.2, drive: 3 },
  { k: 'clods', n: 14, t0: 0.02, t1: 1.3, lam: 0.4, amp: 0.7, fLo: 50, fHi: 130 },
  { k: 'debris', n: 50, t0: 0.05, t1: 1.5, lam: 0.5, amp: 0.3, fLo: 400, fHi: 3000, grit: 0.6 },
  { k: 'rumble', dur: 1.9, amp: 0.6, fc: 85, att: 0.01, tau: 0.6, rollFc: 5, rollDepth: 0.4 },
  { k: 'roar', dur: 0.4, amp: 0.5, fA: 1600, fB: 200, tauF: 0.1 },
  { k: 'echo', taps: [[0.4, 0.15], [0.8, 0.08]], fc: 450, atk: 0.05, tau: 0.3, amp: 0.8 },
], { sat: 2.4, tail: 100 });

// the boss winding up: a rising growl and a quickening pulse
const bossCharge = recipe(1.5, [
  {
    k: 'growl', dur: 1.35, f0: 48, f1: 125, jit: 0.06, pulse: [22, 0.7], breath: 0.2, drive: 2.5, amp: 0.85,
    formants: [[300, 700, 5, 1], [800, 1200, 6, 0.6], [2000, 2600, 9, 0.2]], env: [[0, 0], [1.15, 1], [1.35, 0]],
  },
  { k: 'whoosh', dur: 1.35, f0: 200, f1: 2500, q: 1, amp: 0.4, env: [[0, 0], [1.2, 1], [1.35, 0]] },
  ...[0.15, 0.45, 0.7, 0.9, 1.05, 1.17, 1.27].map((t, i) => ({ k: 'body', at: t, f0: 95, f1: 46, tp: 0.03, tau: 0.07, amp: 0.35 + 0.05 * i, drive: 1.5, dur: 0.15, jit: 0.04 })),
  { k: 'rumble', dur: 1.4, amp: 0.4, fc: 90, att: 0.3, tau: 1.5 },
]);

const bossDeath = recipe(4.4, [
  {
    k: 'growl', dur: 2.6, f0: 96, f1: 28, jit: 0.08, vib: [4.5, 0.03], pulse: [24, 0.6], breath: 0.25, drive: 2.6, amp: 0.9,
    formants: [[900, 350, 5, 1], [1300, 700, 6, 0.8], [2400, 1500, 9, 0.3]], env: [[0, 0], [0.1, 1], [1.8, 0.8], [2.6, 0]],
  },
  ...boom(0.35, 0.4),
  ...boom(0.95, 0.55),
  ...boom(1.55, 0.7),
  ...boom(2.3, 1),
  { k: 'tone', at: 2.3, wave: 'sine', f0: 56, f1: 22, tp: 0.6, dur: 1.9, att: 0.01, tau: 0.8, amp: 0.8, jit: 0.04 },
  { k: 'clods', n: 12, t0: 2.4, t1: 3.8, amp: 0.5 },
  { k: 'echo', taps: [[2.8, 0.14], [3.3, 0.09]], fc: 450, atk: 0.06, tau: 0.4, amp: 0.8 },
], { sat: 2.2, tail: 200 });

// ----------------------------------------------------------------------------
// kill streaks 1..5: a run up the scale that grows with the tier

const STREAK_NOTES = [392, 493.9, 587.3, 784, 987.8, 1174.7, 1568];
const streak = (tier) => {
  const n = tier + 2;
  const dur = [0.7, 0.85, 1.05, 1.3, 1.7][tier - 1];
  const t1 = 0.065 * n;
  return recipe(dur, () => {
    const L = [];
    for (let i = 0; i < n; i++) L.push(brass(i * 0.065, STREAK_NOTES[i], 0.1, 0.32, { att: 0.01, tau: 0.1, rel: 0.05, lp0: 1200, lp1: 5000 }));
    const top = STREAK_NOTES[n - 1];
    L.push(brass(t1, top / 2, dur - t1 - 0.05, 0.28, { tau: 0.3 + 0.12 * tier, rel: 0.3, lp0: 1500, lp1: 5500, tc: 0.12 }));
    L.push(brass(t1, top / 1.5, dur - t1 - 0.05, 0.22, { tau: 0.3 + 0.12 * tier, rel: 0.3, lp0: 1500, lp1: 5500, tc: 0.12 }));
    L.push(bell(t1, top * 2, 0.25 + 0.06 * tier, 0.3));
    L.push({ k: 'body', at: t1, f0: 110, f1: 48, tp: 0.04, tau: 0.12 + 0.04 * tier, amp: 0.55 + 0.1 * tier, drive: 1.5 });
    L.push({ k: 'crack', at: t1, amp: 0.3 + 0.06 * tier, dur: 0.008, hp: 1500, snap: 0.3 });
    if (tier >= 3) L.push({ k: 'roar', at: t1, dur: dur - t1, amp: 0.18 + 0.05 * tier, fA: 14000, fB: 6000, tauF: 0.3, hp: 5000, env: [[0, 0], [0.01, 1], [dur - t1, 0]] });
    if (tier >= 4) L.push(sparkle(t1, 10 + 6 * tier, dur - t1, 0.16));
    if (tier >= 5) L.push({ k: 'whoosh', dur: t1, f0: 800, f1: 9000, q: 1.2, amp: 0.35, env: [[0, 0], [t1, 1]] });
    return L;
  }, { sat: 1.2 });
};

// ----------------------------------------------------------------------------
// interface

const uiHover = recipe(0.07, [
  { k: 'tone', wave: 'sine', f0: 1900, f1: 1900, dur: 0.05, att: 0.001, tau: 0.012, amp: 0.7, jit: 0 },
  { k: 'crack', amp: 0.15, dur: 0.002, hp: 4000, snap: 0 },
], { sat: 0, tail: 10 });

const uiClick = recipe(0.14, [
  { k: 'crack', amp: 0.6, dur: 0.003, hp: 2000, snap: 0 },
  { k: 'tone', wave: 'sine', f0: 1000, f1: 640, tp: 0.02, dur: 0.1, att: 0.001, tau: 0.025, amp: 0.7 },
  { k: 'body', f0: 300, f1: 160, tp: 0.02, tau: 0.03, amp: 0.4, dur: 0.08 },
], { tail: 12 });

const uiCard = recipe(0.28, [
  { k: 'whoosh', dur: 0.2, f0: 700, f1: 4500, q: 1.2, amp: 0.4, env: [[0, 0], [0.14, 1], [0.2, 0]] },
  ...tick(0.12, 1800, 0.4),
  { k: 'body', at: 0.12, f0: 220, f1: 110, tp: 0.02, tau: 0.04, amp: 0.4, dur: 0.1 },
], {});

// ----------------------------------------------------------------------------

const def = (sr, variants, render, tgt, gap, max, pri, extra = {}) => ({ sr, variants, render, tgt, gap, max, pri, ...extra });

export const SFX = {
  'shot.blaster': def(HI, 4, blaster, -25, 45, 6, 1),
  'shot.scatter': def(LO, 2, scatter, -17, 90, 4, 1),
  'shot.rocket': def(LO, 2, rocket, -19, 120, 3, 2),
  'shot.railgun': def(HI, 2, railgun, -17, 150, 3, 2),
  'hit': def(LO, 4, hit, -28, 40, 7, 0),
  'hit.crit': def(HI, 3, hitCrit, -24, 50, 4, 1),
  'kill': def(LO, 4, kill, -26, 55, 8, 1),
  'kill.big': def(LO, 3, killBig, -19, 120, 3, 2),
  'headPop': def(LO, 3, headPop, -22, 80, 4, 1),
  'gib': def(LO, 4, gib, -33, 70, 4, 0),
  'explode.s': def(LO, 2, explodeS, -17, 50, 5, 2),
  'explode.m': def(LO, 2, explodeM, -14, 80, 4, 2),
  'explode.l': def(LO, 2, explodeL, -13, 150, 2, 3, { duck: [0.35, 0.7] }),
  'freeze': def(HI, 1, freeze, -20, 400, 1, 3),
  'shatter': def(HI, 3, shatter, -26, 35, 6, 1),
  'zap': def(HI, 3, zap, -24, 60, 4, 1),
  'spit': def(LO, 2, spit, -25, 100, 3, 1),
  'enemyShot': def(LO, 2, enemyShot, -25, 70, 4, 1),
  'pickup.magnet': def(HI, 1, pickMagnet, -21, 100, 1, 2),
  'pickup.freeze': def(HI, 1, pickFreeze, -22, 100, 1, 2),
  'pickup.shield': def(HI, 1, pickShield, -22, 100, 1, 2),
  'pickup.bomb': def(LO, 1, pickBomb, -21, 100, 1, 2),
  'pickup.heart': def(LO, 1, pickHeart, -22, 100, 1, 2),
  'pickup.chest': def(HI, 1, pickChest, -18, 100, 1, 3),
  'pickup.weapon': def(HI, 1, pickWeapon, -18, 100, 1, 3),
  'gem.0': def(LO, 1, gemBell(392), -28, 28, 8, 1),
  'gem.1': def(LO, 1, gemBell(784), -29, 28, 8, 1),
  'gem.2': def(LO, 1, gemBell(1568), -31, 28, 8, 1),
  'levelUp': def(HI, 1, levelUp, -15, 500, 1, 3, { duck: [0.5, 1.6] }),
  'card': def(HI, 1, card, -21, 120, 2, 3),
  'evolve': def(HI, 1, evolve, -14, 500, 1, 3, { duck: [0.6, 2] }),
  'waveStart': def(LO, 1, waveStart, -16, 500, 1, 3),
  'waveComplete': def(HI, 1, waveComplete, -15, 500, 1, 3, { duck: [0.5, 2] }),
  'coin': def(HI, 3, coin, -28, 40, 6, 2),
  'claim': def(HI, 1, claim, -17, 200, 1, 3),
  'shieldUp': def(HI, 1, shieldUp, -23, 300, 1, 2),
  'shieldHit': def(HI, 2, shieldHit, -23, 60, 3, 2),
  'shieldDown': def(HI, 1, shieldDown, -23, 300, 1, 2),
  'bombThrow': def(LO, 1, bombThrow, -23, 120, 2, 2),
  'lightning': def(HI, 1, lightning, -10, 300, 2, 3, { duck: [0.6, 1.4] }),
  'hurt': def(LO, 2, hurt, -19, 150, 2, 3),
  'death': def(LO, 1, death, -14, 1000, 1, 3, { duck: [0.7, 2.4] }),
  'heartbeat': def(LO, 1, heartbeat, -29, 0, 1, 2),
  'boss.roar': def(LO, 1, bossRoar, -13, 500, 1, 3, { duck: [0.55, 2.6] }),
  'boss.slam': def(LO, 1, bossSlam, -11, 300, 1, 3, { duck: [0.6, 1.6] }),
  'boss.charge': def(LO, 1, bossCharge, -18, 500, 1, 3),
  'boss.death': def(LO, 1, bossDeath, -9, 1000, 1, 3, { duck: [0.8, 4] }),
  'streak.1': def(HI, 1, streak(1), -21, 300, 1, 3),
  'streak.2': def(HI, 1, streak(2), -20, 300, 1, 3),
  'streak.3': def(HI, 1, streak(3), -19, 300, 1, 3, { duck: [0.4, 1.2] }),
  'streak.4': def(HI, 1, streak(4), -18, 300, 1, 3, { duck: [0.45, 1.4] }),
  'streak.5': def(HI, 1, streak(5), -16, 300, 1, 3, { duck: [0.5, 1.8] }),
  'ui.hover': def(HI, 1, uiHover, -37, 30, 2, 3),
  'ui.click': def(HI, 1, uiClick, -30, 30, 3, 3),
  'ui.card': def(HI, 1, uiCard, -29, 30, 3, 3),
};
