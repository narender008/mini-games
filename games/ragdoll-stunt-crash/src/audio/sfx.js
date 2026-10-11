// The body of the sound bank: impacts on eight materials, bones, tearing, splats,
// glass, explosions and the car crash. Every sound is a recipe of layers
// (layers.js) that lib.js renders once into a mono buffer, a few variants each.
// Per sound (the `def` at the foot of each table):
//   sr        sample rate it is rendered at (24 kHz for low, fat sounds; 32 kHz for glass, cracks, sparkle)
//   variants  how many differently seeded renders to make (the player picks one at random, never the last)
//   tgt       loudness it lands at, in dB of short-term A-weighted level (see loudness() in dsp.js)
//   gap       minimum ms between two plays; calls that come sooner are dropped and add a little to the next one
//   max       how many may sound at once (the oldest of the kind is cut for a new one)
//   pri       0..3: when all voices are busy a new sound may cut the oldest voice of its own priority or lower
//   duck      optional [amount, seconds]: dip the music when it plays
//   grp       optional name: sounds of a group share one gap and one voice cap (all the impacts, say)
// The key is `group.name.tier` for sounds with a strength (impact.flesh.2).
// sfx2.js holds the rest (vehicles, launches, water, crowd, stings, interface); bank.js joins them.
import { seeded, removeDC, fadeEnds, saturate } from './dsp.js';
import { runLayers } from './layers.js';

export const LO = 24000;
export const HI = 32000;

// Turn a list of layers (or a function of (rng, variant) making one) into a render generator.
export function recipe(dur, build, o = {}) {
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

export const def = (sr, variants, render, tgt, gap, max, pri, extra = {}) => ({ sr, variants, render, tgt, gap, max, pri, ...extra });

// ----------------------------------------------------------------------------
// small phrases the recipes share

// an FM bell: a sine with a decaying inharmonic modulator (chimes, stings)
export const bell = (at, f, tau, amp, idx = 1.6, ratio = 3.5) => ({
  k: 'tone', at, wave: 'sine', f0: f, f1: f, dur: tau * 6, att: 0.002, tau, amp, fm: [ratio, idx, tau * 0.6], rel: 0.03, jit: 0,
});

// a brass note: two detuned saws through a low-pass that opens as the note speaks
export const brass = (at, f, dur, amp, o = {}) => ({
  k: 'tone', at, wave: 'saw', f0: f, f1: o.f1 ?? f, det: o.det ?? 12, dur, att: o.att ?? 0.02, tau: o.tau ?? Infinity, rel: o.rel ?? 0.12, amp,
  lp: [o.lp0 ?? 800, o.lp1 ?? 4000, o.tc ?? 0.12], q: o.q ?? 1, drive: o.drive ?? 1.2, vib: o.vib, jit: 0,
});

// a ring of glass
export const sparkle = (at, n, t1, amp = 0.2, fLo = 3000, fHi = 11000) => ({
  k: 'tinkle', at, n, t0: 0, t1, lam: t1 * 0.5, amp, fLo, fHi, tauLo: 0.02, tauHi: 0.08, jit: 0,
});

// a struck piece of iron: the partials of a plate, ringing for tau
export const ring = (at, f, amp = 0.5, tau = 0.1) => ({
  k: 'modal', at, amp, partials: [[f, 1, tau], [f * 2.32, 0.7, tau * 0.75], [f * 4.25, 0.5, tau * 0.5], [f * 6.63, 0.3, tau * 0.35]],
});

// a fireball of the given size 0..1 starting at `at`
export const boom = (at, s) => [
  { k: 'crack', at, amp: 1, dur: 0.012, hp: 600, snap: 0.8, snapFc: 2500, snapTau: 0.03 },
  { k: 'roar', at, dur: 0.35 + 0.65 * s, amp: 1, fA: 7000, fB: 300, tauF: 0.06 + 0.09 * s, q: 0.8, modFc: 25, modDepth: 0.5 },
  { k: 'body', at, f0: 130 - 50 * s, f1: 42 - 14 * s, tp: 0.06, tau: 0.12 + 0.3 * s, amp: 1, drive: 2.2 },
  { k: 'rumble', at, dur: 0.5 + 1.8 * s, amp: 0.5, fc: 170 - 80 * s, att: 0.01, tau: 0.2 + 0.5 * s, rollFc: 7, rollDepth: 0.3 },
  { k: 'debris', at, n: Math.round(14 + 40 * s), t0: 0.04, t1: 0.5 + 1.1 * s, lam: 0.15 + 0.3 * s, amp: 0.35, fLo: 600, fHi: 4500, grit: 0.6 },
];

// a vowel for a voice: formants [from, to, q, gain] gliding over the layer
export const OOF_F = [[420, 380, 5, 1], [800, 700, 7, 0.5], [2300, 2200, 9, 0.12]];

// ----------------------------------------------------------------------------
// impacts: eight materials in three weights (0 a brush, 1 a knock, 2 a smash). One recipe per material takes the weight
// s (0.18, 0.5 or 0.88) and the variant v and makes the layers; the lengths below are per weight.

export const WEIGHTS = [0.18, 0.5, 0.88];
const when = (c, ...layers) => (c ? layers : []);

// meat: a low thump, a slap, a wet squelch, bubbles; a crunch of bone when it is hard; a grunt now and then
const flesh = (s, v) => [
  { k: 'body', f0: 190 - 45 * s, f1: 85 - 26 * s, tp: 0.03, tau: 0.045 + 0.09 * s, amp: 0.75, drive: 1.5, dur: 0.14 + 0.3 * s },
  { k: 'roar', dur: 0.07 + 0.06 * s, amp: 1, fA: 3400, fB: 450, tauF: 0.02 + 0.02 * s, q: 1.1 },
  { k: 'roar', at: 0.012, dur: 0.14 + 0.3 * s, amp: 0.6 + 0.3 * s, fA: 1500, fB: 250, tauF: 0.05 + 0.08 * s, q: 1.8, modFc: 55, modDepth: 0.95, hp: 140 },
  { k: 'crack', amp: 0.35, dur: 0.003, hp: 1800, snap: 0 },
  ...when(s > 0.3, { k: 'bubbles', at: 0.03, n: Math.round(2 + 7 * s), t0: 0, t1: 0.1 + 0.22 * s, amp: 0.25 + 0.08 * s, fLo: 180, fHi: 620 }),
  ...when(s > 0.5,
    { k: 'debris', at: 0.004, n: Math.round(5 + 12 * s), t0: 0.004, t1: 0.1 + 0.12 * s, lam: 0.05, amp: 0.45, fLo: 700, fHi: 2800, grit: 0.4 },
    { k: 'crack', at: 0.003, amp: 0.35, dur: 0.005, hp: 1200, snap: 0.4, snapFc: 1800 },
    { k: 'rumble', dur: 0.25 + 0.3 * s, amp: 0.3, fc: 140, att: 0.01, tau: 0.12 }),
  ...when(s > 0.7 && v === 0, {
    k: 'growl', at: 0.01, dur: 0.22, f0: 150, f1: 95, jit: 0.04, vib: [6, 0.02], breath: 0.35, drive: 0.8, amp: 0.4, formants: OOF_F,
    env: [[0, 0], [0.03, 1], [0.12, 0.7], [0.22, 0]],
  }),
];

// a clang: a hard click, a body of ringing partials, rattling bits; a second clank when it is hard
const metal = (s, v) => {
  const fb = (v ? 470 : 340) * (1 - 0.25 * s);
  return [
    { k: 'crack', amp: 0.9, dur: 0.004, hp: 2500, snap: 0.3, snapFc: 3000 },
    { k: 'body', f0: 210 - 60 * s, f1: 100 - 30 * s, tp: 0.02, tau: 0.03 + 0.04 * s, amp: 0.7, drive: 1.3, dur: 0.12 + 0.2 * s },
    ring(0, fb, 0.75, 0.06 + 0.17 * s),
    ring(0.004, fb * 1.47, 0.35, 0.04 + 0.12 * s),
    { k: 'debris', at: 0.005, n: Math.round(4 + 14 * s), t0: 0.005, t1: 0.1 + 0.3 * s, lam: 0.08, amp: 0.5, fLo: 1500, fHi: 6000, grit: 0.3 },
    ...when(s > 0.5, ring(0.07, fb * 0.8, 0.5, 0.12), { k: 'rumble', dur: 0.3, amp: 0.3, fc: 180, att: 0.01, tau: 0.15 }),
  ];
};

// stone: a dull crack, a heavy thud, grit; slabs and clods when it is hard
const concrete = (s) => [
  { k: 'body', f0: 130, f1: 55, tp: 0.03, tau: 0.06 + 0.08 * s, amp: 0.8, drive: 1.8, dur: 0.15 + 0.3 * s },
  { k: 'crack', amp: 1, dur: 0.008, hp: 600, snap: 0.7, snapFc: 2200, snapTau: 0.025 },
  { k: 'roar', dur: 0.1 + 0.15 * s, amp: 0.8, fA: 4500, fB: 600, tauF: 0.03 + 0.03 * s, hp: 200 },
  { k: 'debris', at: 0.004, n: Math.round(8 + 30 * s), t0: 0.005, t1: 0.15 + 0.4 * s, lam: 0.08 + 0.1 * s, amp: 0.6, fLo: 600, fHi: 4500, grit: 0.8 },
  ...when(s > 0.4, { k: 'clods', n: Math.round(2 + 4 * s), t0: 0.03, t1: 0.12 + 0.3 * s, amp: 0.45 }, { k: 'rumble', dur: 0.3 + 0.3 * s, amp: 0.4, fc: 150, att: 0.01, tau: 0.2 }),
];

// a hollow knock; splinters when it breaks
const wood = (s, v) => {
  const fw = (v ? 300 : 240) * (1 - 0.25 * s);
  return [
    { k: 'crack', amp: 0.8, dur: 0.005, hp: 700, snap: 0.6, snapFc: 1700, snapTau: 0.02 },
    { k: 'body', f0: 170 - 40 * s, f1: 80, tp: 0.02, tau: 0.035 + 0.05 * s, amp: 0.8, drive: 1.2, dur: 0.12 + 0.2 * s },
    { k: 'modal', amp: 0.7, partials: [[fw, 1, 0.03 + 0.05 * s], [fw * 1.9, 0.7, 0.025 + 0.03 * s], [fw * 3.4, 0.5, 0.015 + 0.02 * s], [fw * 5.1, 0.25, 0.01]] },
    { k: 'debris', at: 0.004, n: Math.round(3 + 12 * s), t0: 0.004, t1: 0.06 + 0.2 * s, lam: 0.05, amp: 0.45, fLo: 800, fHi: 3500, grit: 0.3 },
    ...when(s > 0.5,
      { k: 'crack', at: 0.035, amp: 0.55, dur: 0.004, hp: 1000, snap: 0.5, snapFc: 1500 },
      { k: 'debris', at: 0.04, n: 16, t0: 0.01, t1: 0.3, lam: 0.1, amp: 0.4, fLo: 700, fHi: 3000, grit: 0.35 }),
  ];
};

// a clink; a shower of glass when it is hard
const glassHit = (s) => [
  { k: 'crack', amp: 0.9, dur: 0.006, hp: 3500, snap: 0.3, snapFc: 5000, snapTau: 0.01 },
  { k: 'tinkle', n: Math.round(6 + 30 * s), t0: 0, t1: 0.12 + 0.4 * s, lam: 0.1 + 0.15 * s, amp: 0.45, fLo: 2200, fHi: 11000, tauLo: 0.01, tauHi: 0.06 },
  { k: 'modal', amp: 0.35, partials: [[3300, 0.6, 0.04 + 0.05 * s], [5100, 0.4, 0.03], [7400, 0.25, 0.02]] },
  { k: 'body', f0: 380, f1: 190, tp: 0.02, tau: 0.03, amp: 0.3, dur: 0.1 },
  ...when(s > 0.5, { k: 'roar', at: 0.01, dur: 0.2, amp: 0.3, fA: 9000, fB: 3000, tauF: 0.06, hp: 2500, modFc: 90, modDepth: 0.8 }),
];

// a bouncy thud with a rubbery wobble
const rubber = (s) => [
  { k: 'body', f0: 150 - 40 * s, f1: 62, tp: 0.04, tau: 0.05 + 0.06 * s, amp: 1, drive: 1.1, dur: 0.15 + 0.2 * s },
  { k: 'boing', at: 0.005, dur: 0.18 + 0.15 * s, f0: 190, f1: 110, tp: 0.06, wob: 22, wobDepth: 0.12, tauW: 0.08, tau: 0.08 + 0.08 * s, amp: 0.45, drive: 1 },
  { k: 'roar', dur: 0.06, amp: 0.45, fA: 1400, fB: 300, tauF: 0.02 },
];

// earth: a dull thump, a spray of soil, clods
const dirt = (s) => [
  { k: 'body', f0: 105, f1: 46, tp: 0.035, tau: 0.05 + 0.08 * s, amp: 1, drive: 1.3, dur: 0.15 + 0.3 * s },
  { k: 'roar', dur: 0.12 + 0.25 * s, amp: 0.65, fA: 1700, fB: 250, tauF: 0.04 + 0.05 * s, hp: 100, q: 0.8 },
  { k: 'rumble', dur: 0.25 + 0.35 * s, amp: 0.35, fc: 230, att: 0.006, tau: 0.1 + 0.1 * s },
  { k: 'debris', at: 0.01, n: Math.round(6 + 24 * s), t0: 0.01, t1: 0.15 + 0.45 * s, lam: 0.1 + 0.15 * s, amp: 0.35, fLo: 300, fHi: 1500, grit: 0.95 },
  ...when(s > 0.4, { k: 'clods', n: Math.round(1 + 4 * s), t0: 0.02, t1: 0.2 + 0.5 * s, amp: 0.45 }),
];

// a soft whump and a squeaky crunch
const snow = (s) => [
  { k: 'body', f0: 92, f1: 46, tp: 0.04, tau: 0.045 + 0.05 * s, amp: 0.65, drive: 1, dur: 0.12 + 0.2 * s },
  { k: 'roar', dur: 0.15 + 0.28 * s, amp: 0.8, fA: 1000, fB: 220, tauF: 0.05 + 0.06 * s, q: 0.7, hp: 80, att: 0.01 },
  { k: 'debris', at: 0.02, n: Math.round(6 + 16 * s), t0: 0.02, t1: 0.18 + 0.35 * s, lam: 0.1 + 0.12 * s, amp: 0.22, fLo: 1800, fHi: 5500, grit: 0.9, gritLen: 1.5 },
];

// material -> [layer maker, [length of weights 0, 1, 2], rate, loudness offset (dB), variants, sat]
const MATS = {
  flesh: [flesh, [0.3, 0.42, 0.6], HI, 2, 3, 1.5],
  metal: [metal, [0.35, 0.6, 1.0], HI, 0, 2, 1.5],
  concrete: [concrete, [0.3, 0.45, 0.8], HI, 1, 2, 1.7],
  wood: [wood, [0.25, 0.4, 0.6], HI, 0, 2, 1.5],
  glass: [glassHit, [0.3, 0.55, 0.9], HI, -1, 2, 1.3],
  rubber: [rubber, [0.25, 0.35, 0.5], LO, 0, 2, 1.4],
  dirt: [dirt, [0.35, 0.6, 0.95], LO, 1, 2, 1.5],
  snow: [snow, [0.35, 0.5, 0.75], LO, -3, 2, 1.2],
};
const TIER_TGT = [-28, -22, -16];

export const MAT_NAMES = Object.keys(MATS);

const IMPACTS = {};
for (const [mat, [make, lens, sr, off, variants, sat]] of Object.entries(MATS)) {
  for (let w = 0; w < 3; w++) {
    const s = WEIGHTS[w];
    IMPACTS[`impact.${mat}.${w}`] = def(sr, variants, recipe(lens[w], (r, v) => make(s, v), { sat }), TIER_TGT[w] + off, 22, 7, w === 2 ? 2 : 1, { grp: 'impact' });
  }
}

// ----------------------------------------------------------------------------
// bones, tearing, neck, splats

// a bone breaking: a sharp dry crack, a second snap close behind, a crunch of splinters, a low thunk
const crackR = (s) => recipe(0.3 + 0.25 * s, (r, v) => [
  { k: 'crack', amp: 1, dur: 0.0035, hp: 2800, snap: 0.5, snapFc: 3500, snapTau: 0.012 },
  { k: 'modal', at: 0.0005, amp: 1.1, partials: [[1150 + 250 * v, 1, 0.012], [2350 + 300 * v, 0.75, 0.009], [3700, 0.4, 0.006], [5200, 0.2, 0.004]] },
  { k: 'crack', at: 0.014 + 0.006 * v, amp: 0.75, dur: 0.003, hp: 2200, snap: 0.3 },
  { k: 'modal', at: 0.014 + 0.006 * v, amp: 0.55, partials: [[1700 - 100 * v, 1, 0.01], [3100, 0.6, 0.007]] },
  { k: 'debris', at: 0.01, n: Math.round(10 + 18 * s), t0: 0.004, t1: 0.12 + 0.12 * s, lam: 0.05, amp: 0.7, fLo: 900, fHi: 4200, grit: 0.45 },
  { k: 'body', f0: 250, f1: 105, tp: 0.016, tau: 0.03 + 0.03 * s, amp: 0.3, drive: 1.4, dur: 0.12 },
  { k: 'roar', at: 0.012, dur: 0.12 + 0.12 * s, amp: 0.22, fA: 1500, fB: 300, tauF: 0.04, q: 1.6, modFc: 55, modDepth: 0.9, hp: 150 },
  ...when(s > 0.6, { k: 'tone', at: 0.03, wave: 'sine', f0: 3400, f1: 2100, tp: 0.05, dur: 0.12, att: 0.002, tau: 0.04, amp: 0.1, jit: 0 }),
], { sat: 1.6 });

// a limb tearing off: a ripping stutter, a wet squelch, bubbles, and a pop as it comes free
const rip = recipe(0.8, [
  { k: 'tear', dur: 0.5, f0: 2300, f1: 750, q: 1.3, grain: 85, depth: 1.1, amp: 1, env: [[0, 0], [0.02, 1], [0.34, 0.9], [0.5, 0]] },
  { k: 'tear', at: 0.04, dur: 0.42, f0: 3600, f1: 1300, q: 1.5, grain: 120, depth: 1.0, amp: 0.45 },
  { k: 'roar', at: 0.04, dur: 0.55, amp: 0.6, fA: 1700, fB: 210, tauF: 0.17, q: 2, modFc: 45, modDepth: 1.0, hp: 140 },
  { k: 'bubbles', at: 0.1, n: 9, t0: 0, t1: 0.5, amp: 0.4, fLo: 170, fHi: 640 },
  { k: 'crack', amp: 0.45, dur: 0.004, hp: 1500, snap: 0 },
  { k: 'body', at: 0.48, f0: 170, f1: 62, tp: 0.03, tau: 0.09, amp: 0.95, drive: 1.5, dur: 0.3 },
  { k: 'roar', at: 0.48, dur: 0.1, amp: 0.55, fA: 2400, fB: 320, tauF: 0.025 },
  { k: 'bubbles', at: 0.5, n: 5, t0: 0, t1: 0.25, amp: 0.35, fLo: 200, fHi: 700 },
  { k: 'debris', at: 0.5, n: 14, t0: 0.02, t1: 0.28, lam: 0.1, amp: 0.35, fLo: 300, fHi: 1500, grit: 0.9 },
]);

// the neck: a short creak, then a hollow dry snap that makes you wince
const snap = recipe(0.55, [
  { k: 'tone', wave: 'saw', f0: 900, f1: 380, tp: 0.05, dur: 0.12, att: 0.004, tau: 0.05, amp: 0.25, lp: [2500, 700, 0.05], q: 2 },
  { k: 'crack', at: 0.075, amp: 1, dur: 0.004, hp: 2500, snap: 0.6, snapFc: 3000, snapTau: 0.015 },
  { k: 'modal', at: 0.075, amp: 0.9, partials: [[620, 1, 0.035], [1380, 0.7, 0.025], [2250, 0.5, 0.018], [3300, 0.25, 0.01]] },
  { k: 'body', at: 0.075, f0: 220, f1: 90, tp: 0.02, tau: 0.05, amp: 0.8, drive: 1.5, dur: 0.2 },
  { k: 'debris', at: 0.08, n: 14, t0: 0.004, t1: 0.14, lam: 0.05, amp: 0.45, fLo: 800, fHi: 3800, grit: 0.4 },
  { k: 'crack', at: 0.105, amp: 0.6, dur: 0.003, hp: 2000, snap: 0.2 },
  { k: 'roar', at: 0.09, dur: 0.2, amp: 0.3, fA: 1300, fB: 250, tauF: 0.06, q: 1.7, modFc: 50, modDepth: 0.9, hp: 140 },
  { k: 'bubbles', at: 0.12, n: 3, t0: 0, t1: 0.2, amp: 0.25, fLo: 200, fHi: 500 },
], { sat: 1.6 });

// blood landing: a heavy wet slap, a squelching spread, drops spattering
const splatR = (s) => recipe(0.45 + 0.5 * s, [
  { k: 'body', f0: 125, f1: 50, tp: 0.035, tau: 0.08 + 0.1 * s, amp: 1, drive: 1.6, dur: 0.25 + 0.3 * s },
  { k: 'roar', dur: 0.09, amp: 0.8, fA: 2800, fB: 380, tauF: 0.028, q: 1 },
  { k: 'roar', at: 0.01, dur: 0.25 + 0.4 * s, amp: 0.65, fA: 1400, fB: 200, tauF: 0.08 + 0.1 * s, q: 1.7, modFc: 38, modDepth: 1.0, hp: 130 },
  { k: 'bubbles', at: 0.02, n: Math.round(4 + 10 * s), t0: 0, t1: 0.25 + 0.5 * s, amp: 0.4, fLo: 170, fHi: 650 },
  { k: 'debris', at: 0.03, n: Math.round(10 + 26 * s), t0: 0.02, t1: 0.22 + 0.5 * s, lam: 0.12 + 0.2 * s, amp: 0.4, fLo: 300, fHi: 1800, grit: 0.85 },
  ...when(s > 0.55,
    { k: 'whoosh', at: 0.01, dur: 0.3, f0: 900, f1: 320, q: 0.9, amp: 0.3, env: [[0, 0], [0.04, 1], [0.3, 0]] },
    { k: 'rumble', dur: 0.4, amp: 0.3, fc: 130, att: 0.01, tau: 0.15 }),
]);

// ----------------------------------------------------------------------------
// glass

// glass breaking: a crack, then a long shower of ringing shards, a hiss of splinters
const glassR = (s) => recipe(0.7 + 0.8 * s, [
  { k: 'crack', amp: 1.3, dur: 0.01, hp: 3000, snap: 0.5, snapFc: 5000, snapTau: 0.012 },
  { k: 'tinkle', at: 0.01, n: Math.round(20 + 50 * s), t0: 0, t1: 0.25 + 0.9 * s, lam: 0.1 + 0.3 * s, amp: 0.3, fLo: 2500, fHi: 12000, tauLo: 0.015, tauHi: 0.09 },
  { k: 'tinkle', at: 0.02, n: Math.round(6 + 10 * s), t0: 0, t1: 0.3 + 0.6 * s, lam: 0.15 + 0.2 * s, amp: 0.22, fLo: 1200, fHi: 4000, tauLo: 0.02, tauHi: 0.1 },
  { k: 'roar', at: 0.005, dur: 0.12 + 0.2 * s, amp: 0.8, fA: 9000, fB: 2500, tauF: 0.06, hp: 2500, modFc: 90, modDepth: 0.8 },
  { k: 'debris', at: 0.08, n: Math.round(20 + 40 * s), t0: 0, t1: 0.5 + 0.9 * s, lam: 0.25 + 0.3 * s, amp: 0.35, fLo: 3000, fHi: 10000, grit: 0.5 },
  { k: 'body', f0: 400, f1: 160, tp: 0.02, tau: 0.03, amp: 0.25 + 0.2 * s, dur: 0.15 },
  ...when(s > 0.5, { k: 'crack', at: 0.06, amp: 0.6, dur: 0.008, hp: 3500, snap: 0.3, snapFc: 5000 }),
], { sat: 1.3 });

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

// ----------------------------------------------------------------------------
// the car crash: a huge thud, tearing metal, a flight of glass, a hubcap rattling to rest, steam

const crashR = (s, dur) => recipe(dur, (r, v) => [
  { k: 'body', f0: 120, f1: 40, tp: 0.05, tau: 0.16 + 0.12 * s, amp: 1.2, drive: 2.3, dur: 0.9 },
  { k: 'crack', amp: 1, dur: 0.012, hp: 500, snap: 0.9, snapFc: 2200, snapTau: 0.05 },
  { k: 'roar', dur: 0.5 + 0.2 * s, amp: 0.85, fA: 5500, fB: 450, tauF: 0.12, q: 1.4, modFc: 30, modDepth: 0.8, hp: 150 },
  { k: 'tear', at: 0.02, dur: 0.55, f0: 1900, f1: 800, q: 4, grain: 52, depth: 1.2, amp: 0.55 },
  { k: 'tear', at: 0.14, dur: 0.5, f0: 3200, f1: 1200, q: 3, grain: 66, depth: 1.1, amp: 0.4 },
  ring(0, 380 + 60 * v, 0.7, 0.5),
  ring(0.05, 520, 0.5, 0.35),
  ring(0.13, 290, 0.5, 0.45),
  ring(0.24, 450 + 40 * v, 0.35, 0.3),
  { k: 'crack', at: 0.05, amp: 0.6, dur: 0.008, hp: 3500, snap: 0.3, snapFc: 5000, snapTau: 0.01 },
  { k: 'tinkle', at: 0.06, n: Math.round(40 + 30 * s), t0: 0, t1: 1.5, lam: 0.6, amp: 0.33, fLo: 2500, fHi: 12000, tauLo: 0.015, tauHi: 0.1 },
  { k: 'roar', at: 0.05, dur: 0.45, amp: 0.35, fA: 9000, fB: 3000, tauF: 0.1, hp: 2500, modFc: 90, modDepth: 0.8 },
  { k: 'debris', n: Math.round(40 + 30 * s), t0: 0.04, t1: 1.6, lam: 0.5, amp: 0.4, fLo: 500, fHi: 5000, grit: 0.5 },
  { k: 'rumble', dur: 1.3, amp: 0.5, fc: 140, att: 0.01, tau: 0.5, rollFc: 6, rollDepth: 0.3 },
  { k: 'rattle', at: 0.6, n: 11, gap: 0.13, ratio: 0.74, f: 1250, amp: 0.5, tau: 0.06 },
  { k: 'whoosh', at: 0.7, dur: 1.2, f0: 4500, f1: 6000, q: 0.6, hp: 3000, amp: 0.13, env: [[0, 0], [0.1, 1], [1.2, 0]] },
  { k: 'clods', n: Math.round(3 + 4 * s), t0: 0.1, t1: 1.0, amp: 0.35 },
  { k: 'tone', at: 1.2, wave: 'saw', f0: 260, f1: 150, dur: 0.45, att: 0.05, tau: 0.25, amp: 0.1, lp: [900, 300, 0.2], vib: [18, 0.03, 0.1], jit: 0 },
  ...when(s > 0.8,
    { k: 'tone', wave: 'sine', f0: 55, f1: 26, tp: 0.4, dur: 1.4, att: 0.01, tau: 0.5, amp: 0.55, jit: 0.05 },
    { k: 'echo', taps: [[0.4, 0.12], [0.9, 0.07]], fc: 500, atk: 0.05, tau: 0.3, amp: 0.8 },
    ring(0.4, 330, 0.3, 0.5)),
], { sat: 2, tail: 90 });

// ----------------------------------------------------------------------------

export const SFX1 = {
  ...IMPACTS,
  'crack.0': def(HI, 3, crackR(0.35), -21, 45, 3, 2),
  'crack.1': def(HI, 3, crackR(0.85), -16, 45, 3, 3),
  'rip': def(HI, 3, rip, -15, 90, 3, 3),
  'snap': def(HI, 2, snap, -14, 150, 2, 3),
  'splat.0': def(LO, 2, splatR(0.35), -22, 40, 4, 1),
  'splat.1': def(LO, 2, splatR(0.8), -16.5, 60, 3, 2),
  'glass.0': def(HI, 2, glassR(0.3), -21, 50, 3, 1),
  'glass.1': def(HI, 2, glassR(0.9), -15, 90, 3, 2),
  'explode.0': def(LO, 2, explodeS, -16, 60, 4, 2),
  'explode.1': def(LO, 2, explodeM, -13, 90, 3, 3, { duck: [0.3, 0.8] }),
  'explode.2': def(LO, 1, explodeL, -11, 150, 2, 3, { duck: [0.5, 1.6] }),
  'crash.0': def(LO, 2, crashR(0.55, 2.1), -12, 200, 2, 3, { duck: [0.45, 1.4] }),
  'crash.1': def(LO, 2, crashR(1, 2.8), -9, 200, 2, 3, { duck: [0.6, 2.0] }),
};
