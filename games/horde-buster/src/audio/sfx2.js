// Stage 2 one-shots of Horde Buster: the new creatures, the two bosses, the two new guns and the six
// evolutions, the saw's grind, the hazard sizzle and the chapter stings. Same recipes of layers as sfx.js
// (see its header for what the numbers of a definition mean); bank.js joins the two tables.
//   load   where the sound sits in the build queue (lib.js): the first variant is built at `load`, the others
//          at load + 0.6. Left out, the queue sorts it by name as before. The Tesla gun and the Saw launcher
//          come early (crates drop them from chapter 1 on); everything else is built after the chapter 1 sounds.
import { seeded, removeDC, modulate, addTo, foldLoop } from './dsp.js';
import { colored } from './layers.js';
import {
  recipe, bell, brass, tick, sparkle, boom, crunch, gore, clack, ROAR_F, LO, HI, def,
} from './sfx.js';

// ----------------------------------------------------------------------------
// small phrases the recipes share

// a struck piece of iron: the partials of a plate, ringing for tau
const ring = (at, f, amp = 0.5, tau = 0.1) => ({
  k: 'modal', at, amp, partials: [[f, 1, tau], [f * 2.32, 0.7, tau * 0.75], [f * 4.25, 0.5, tau * 0.5], [f * 6.63, 0.3, tau * 0.35]],
});

// links of a chain jingling against each other for t1 seconds
const links = (at, n, t1, amp = 0.35, fLo = 1400, fHi = 5200) => ({
  k: 'tinkle', at, n, t0: 0, t1, lam: t1 * 0.6, amp, fLo, fHi, tauLo: 0.008, tauHi: 0.035, jit: 0,
});

// vowels for the sung voices: formants [from, to, q, gain] gliding over the layer
const OOH_AH = [[350, 800, 6, 1], [800, 1200, 8, 0.6], [2500, 2800, 10, 0.2]];
const SCREAM = [[1100, 2000, 6, 1], [2600, 3400, 8, 0.7], [4300, 4800, 10, 0.3]];
// the bloated, wet mouth of the Abomination: lower than the Ogre's 'oh' to 'ah'
const ABOM_F = [[330, 560, 5, 1], [760, 1000, 6, 0.8], [1700, 1500, 9, 0.3]];

// a held note of a choir: one steady voice with a slow vibrato
const sing = (at, f, dur, amp, formants = OOH_AH, att = 0.45) => ({
  k: 'growl', at, dur, f0: f, f1: f, jit: 0.012, vib: [5.2, 0.014, 0.5], breath: 0.1, drive: 1.1, amp, formants,
  env: [[0, 0], [dur * att, 1], [dur * 0.8, 0.9], [dur, 0]],
});

// ----------------------------------------------------------------------------
// creatures

// a bloat starting to burst: bubbles popping faster in a wet throat, a moan building under them
const exploderSwell = recipe(0.5, [
  { k: 'bubbles', n: 16, t0: 0, t1: 0.46, lam: 0.5, amp: 0.75, fLo: 110, fHi: 380 },
  { k: 'bubbles', n: 10, t0: 0.15, t1: 0.48, lam: 0.5, amp: 0.4, fLo: 380, fHi: 800 },
  { k: 'roar', dur: 0.5, amp: 0.7, fA: 260, fB: 1100, tauF: 0.3, q: 1.4, hp: 90, modFc: 17, modDepth: 1.1, env: [[0, 0.15], [0.12, 0.6], [0.44, 1], [0.5, 0]] },
  { k: 'tone', wave: 'sine', f0: 85, f1: 200, dur: 0.46, att: 0.05, tau: Infinity, rel: 0.04, amp: 0.55, vib: [13, 0.05, 0.05], am: [11, 0.5], jit: 0.04 },
  {
    k: 'growl', dur: 0.46, f0: 70, f1: 120, jit: 0.05, pulse: [16, 0.8], breath: 0.3, drive: 1.6, amp: 0.45,
    formants: [[300, 700, 5, 1], [700, 1200, 6, 0.5], [1500, 2200, 8, 0.2]], env: [[0, 0], [0.1, 0.6], [0.4, 1], [0.46, 0]],
  },
  // the skin creaking as it stretches
  { k: 'tone', at: 0.3, wave: 'sine', f0: 700, f1: 1500, dur: 0.18, att: 0.02, tau: 0.1, amp: 0.15, vib: [28, 0.04, 0.02] },
], { sat: 1.3, tail: 30 });

// the belly goes: a meaty crack, a gush of toxic froth, chunks landing, a bubbling fizz
const exploderBurst = recipe(1.2, [
  { k: 'crack', amp: 0.9, dur: 0.012, hp: 500, snap: 0.9, snapFc: 1500, snapTau: 0.035 },
  { k: 'body', f0: 125, f1: 40, tp: 0.05, tau: 0.17, amp: 1.1, drive: 2.2, dur: 0.6 },
  { k: 'roar', dur: 0.6, amp: 0.8, fA: 3800, fB: 240, tauF: 0.12, q: 1.1, hp: 110, modFc: 32, modDepth: 1.0 },
  { k: 'roar', at: 0.05, dur: 0.5, amp: 0.45, fA: 1700, fB: 200, tauF: 0.14, q: 1.8, hp: 120, modFc: 55, modDepth: 1.0 },
  { k: 'bubbles', n: 26, t0: 0.03, t1: 0.9, lam: 0.3, amp: 0.55, fLo: 150, fHi: 780 },
  { k: 'roar', at: 0.08, dur: 0.7, amp: 0.2, fA: 9500, fB: 4200, tauF: 0.3, hp: 3200, modFc: 140, modDepth: 0.9 },
  { k: 'clods', n: 6, t0: 0.08, t1: 0.7, lam: 0.22, amp: 0.5, fLo: 70, fHi: 170 },
  { k: 'debris', n: 46, t0: 0.05, t1: 0.95, lam: 0.25, amp: 0.4, fLo: 300, fHi: 1700, grit: 0.88 },
  { k: 'tone', wave: 'sine', f0: 520, f1: 130, tp: 0.05, dur: 0.22, att: 0.003, tau: 0.07, amp: 0.45 },
  { k: 'rumble', dur: 0.9, amp: 0.4, fc: 140, att: 0.01, tau: 0.3 },
], { sat: 1.8, tail: 60 });

// a bullet glancing off a shield: a bright ring of iron over a dull knock; every other variant skips a second tick
const armorHit = recipe(0.13, (r, v) => {
  const f = [1180, 1420, 1650, 1320][v & 3] * (0.95 + 0.1 * r());
  return [
    { k: 'crack', amp: 0.8, dur: 0.003, hp: 2400, snap: 0 },
    ring(0, f, 0.55, 0.018),
    { k: 'body', f0: 420, f1: 190, tp: 0.01, tau: 0.012, amp: 0.4, dur: 0.045 },
    ...(v & 1 ? [{ k: 'modal', at: 0.014 + 0.008 * r(), amp: 0.2, partials: [[f * 1.5, 1, 0.012], [f * 3.1, 0.5, 0.007]] }] : []),
  ];
}, { tail: 12, sat: 1.2 });

// a shield giving way: iron clangs, wood splinters, pieces rattle down
const armorBreak = recipe(1.1, [
  { k: 'crack', amp: 1, dur: 0.014, hp: 700, snap: 0.8, snapFc: 2200, snapTau: 0.03 },
  { k: 'body', f0: 165, f1: 52, tp: 0.04, tau: 0.13, amp: 1, drive: 1.9, dur: 0.5 },
  { k: 'modal', at: 0.004, amp: 0.55, partials: [[420, 1, 0.3], [780, 0.75, 0.22], [1330, 0.6, 0.17], [2150, 0.4, 0.12], [3350, 0.3, 0.08]] },
  { k: 'modal', at: 0.07, amp: 0.35, partials: [[640, 1, 0.2], [1180, 0.7, 0.14], [1980, 0.5, 0.1], [3100, 0.3, 0.06]] },
  ...crunch(0.005, 1),
  { k: 'debris', n: 36, t0: 0.02, t1: 0.7, lam: 0.2, amp: 0.45, fLo: 500, fHi: 2800, grit: 0.7 },
  { k: 'tinkle', n: 14, t0: 0.06, t1: 0.8, lam: 0.3, amp: 0.3, fLo: 1500, fHi: 6000, tauLo: 0.01, tauHi: 0.05, jit: 0 },
  { k: 'clods', n: 4, t0: 0.1, t1: 0.7, lam: 0.25, amp: 0.4, fLo: 90, fHi: 240 },
  { k: 'roar', dur: 0.16, amp: 0.5, fA: 5000, fB: 500, tauF: 0.05, hp: 300 },
], { sat: 1.5, tail: 50 });

// the imp's shriek: a thin, rasping scream that leaps up and falls away
const impScreech = recipe(0.55, [
  { k: 'crack', amp: 0.25, dur: 0.004, hp: 2500, snap: 0 },
  {
    k: 'growl', dur: 0.3, f0: 700, f1: 1700, jit: 0.07, vib: [11, 0.03, 0.02], pulse: [48, 0.5], breath: 0.25, drive: 2, amp: 0.9, formants: SCREAM,
    env: [[0, 0], [0.02, 1], [0.2, 0.9], [0.3, 0]],
  },
  {
    k: 'growl', at: 0.2, dur: 0.33, f0: 1600, f1: 620, jit: 0.07, vib: [12, 0.035, 0.02], pulse: [52, 0.5], breath: 0.3, drive: 2, amp: 0.85, formants: SCREAM,
    env: [[0, 0], [0.03, 1], [0.15, 0.8], [0.33, 0]],
  },
  {
    k: 'growl', dur: 0.5, f0: 340, f1: 520, jit: 0.08, pulse: [30, 0.7], breath: 0.2, drive: 2.2, amp: 0.45,
    formants: [[600, 900, 5, 1], [1500, 1800, 7, 0.5]], env: [[0, 0], [0.03, 1], [0.3, 0.8], [0.5, 0]],
  },
  { k: 'roar', dur: 0.45, amp: 0.3, fA: 9000, fB: 4000, tauF: 0.25, hp: 2200, modFc: 70, modDepth: 0.8 },
], { sat: 1.6, tail: 40 });

// a hellhound howling as it arrives: up to a long, wavering note and down again, a growl beneath
const HOWL = [[420, 520, 5, 1], [880, 1000, 7, 0.6], [2300, 2200, 10, 0.2]];
const houndHowl = recipe(1.45, [
  {
    k: 'growl', dur: 0.72, f0: 240, f1: 540, jit: 0.05, vib: [5.5, 0.03, 0.15], pulse: [14, 0.35], breath: 0.14, drive: 1.5, amp: 1, formants: HOWL,
    env: [[0, 0], [0.09, 1], [0.6, 1], [0.72, 0]],
  },
  {
    k: 'growl', at: 0.55, dur: 0.88, f0: 540, f1: 290, jit: 0.05, vib: [6, 0.04, 0.05], pulse: [14, 0.35], breath: 0.18, drive: 1.5, amp: 0.95, formants: HOWL,
    env: [[0, 0], [0.1, 1], [0.5, 0.8], [0.88, 0]],
  },
  {
    k: 'growl', dur: 1.4, f0: 120, f1: 150, jit: 0.07, pulse: [20, 0.7], breath: 0.3, drive: 2.4, amp: 0.4,
    formants: [[350, 500, 5, 1], [800, 900, 6, 0.6]], env: [[0, 0], [0.12, 1], [0.8, 0.8], [1.4, 0]],
  },
  { k: 'roar', dur: 1.2, amp: 0.2, fA: 3000, fB: 900, tauF: 0.5, hp: 500, modFc: 8, modDepth: 0.6, env: [[0, 0], [0.1, 1], [1.0, 0.5], [1.2, 0]] },
  { k: 'rumble', dur: 1.3, amp: 0.3, fc: 130, att: 0.1, tau: 0.7 },
], { sat: 1.4, tail: 60 });

// a hellhound's bite: jaws snapping shut on meat, a snarl, bone
const houndBite = recipe(0.34, [
  { k: 'crack', amp: 0.8, dur: 0.006, hp: 1000, snap: 0.5, snapFc: 2400, snapTau: 0.02 },
  { k: 'body', at: 0.01, f0: 190, f1: 75, tp: 0.025, tau: 0.06, amp: 0.9, drive: 1.6, dur: 0.2 },
  {
    k: 'growl', dur: 0.28, f0: 170, f1: 105, jit: 0.1, pulse: [34, 0.7], breath: 0.3, drive: 2.2, amp: 0.65,
    formants: [[500, 700, 5, 1], [1000, 1300, 6, 0.6], [2200, 2000, 9, 0.25]], env: [[0, 0], [0.03, 1], [0.12, 0.8], [0.28, 0]],
  },
  ...crunch(0.015, 0.5),
  ...gore(0.03, 0.25),
], {});

// ----------------------------------------------------------------------------
// the Golden Demon

// a deep 'ha' of a laugh at pitch f0 falling to f1 over len seconds, with the breath in front of it and an echo behind
const ha = (at, f0, f1, len, amp) => {
  const one = (t, a) => [
    {
      k: 'growl', at: t, dur: len, f0, f1, jit: 0.04, vib: [6.5, 0.03, 0.02], pulse: [28, 0.55], breath: 0.22, drive: 2.2, amp: a,
      formants: [[700, 820, 5, 1], [1100, 1250, 7, 0.7], [2500, 2600, 9, 0.25]], env: [[0, 0], [0.012, 1], [len * 0.55, 0.55], [len, 0]],
    },
    { k: 'roar', at: t, dur: len * 0.55, amp: a * 0.35, fA: 3600, fB: 700, tauF: 0.05, hp: 400 },
  ];
  return [...one(at, amp), ...one(at + 0.27, amp * 0.22)];
};

const demonLaugh = recipe(2.3, [
  { k: 'body', f0: 100, f1: 40, tp: 0.05, tau: 0.2, amp: 0.7, drive: 1.6 },
  ...ha(0, 150, 118, 0.26, 1),
  ...ha(0.36, 138, 108, 0.2, 0.85),
  ...ha(0.62, 128, 100, 0.2, 0.85),
  ...ha(0.88, 120, 92, 0.2, 0.8),
  ...ha(1.16, 112, 80, 0.55, 1),
  { k: 'rumble', dur: 1.8, amp: 0.3, fc: 100, att: 0.05, tau: 0.8 },
  sparkle(1.15, 20, 1.1, 0.12, 2500, 7000),
], { sat: 1.6, tail: 80 });

// the staff's orb charging with a rising shimmer and leaving it in a flash of gold bells
const demonCast = recipe(1.0, [
  { k: 'tone', wave: 'sine', f0: 420, f1: 1900, dur: 0.5, att: 0.06, tau: Infinity, rel: 0.03, amp: 0.45, fm: [2.01, 1.4, 0.4], jit: 0 },
  { k: 'tone', wave: 'saw', f0: 110, f1: 380, dur: 0.5, att: 0.08, tau: Infinity, rel: 0.03, amp: 0.25, det: 22, lp: [500, 4000, 0.25], drive: 1.3, am: [24, 0.5], jit: 0 },
  { k: 'whoosh', dur: 0.5, f0: 600, f1: 7000, q: 1.2, amp: 0.4, env: [[0, 0], [0.45, 1], [0.5, 0]] },
  sparkle(0.05, 24, 0.5, 0.2, 3000, 10000),
  { k: 'crack', at: 0.5, amp: 0.7, dur: 0.01, hp: 1800, snap: 0.4, snapFc: 3500 },
  { k: 'body', at: 0.5, f0: 190, f1: 70, tp: 0.03, tau: 0.1, amp: 0.8, drive: 1.5 },
  { k: 'whoosh', at: 0.5, dur: 0.4, f0: 5000, f1: 700, q: 1, amp: 0.35, env: [[0, 0], [0.03, 1], [0.4, 0]] },
  bell(0.5, 1480, 0.4, 0.4),
  bell(0.5, 2217, 0.35, 0.25),
  bell(0.52, 2960, 0.25, 0.15),
  sparkle(0.5, 14, 0.45, 0.15),
], { sat: 1.3 });

// portals tearing open: a dark choir swelling in F sharp minor over a sub drone, a rip of air, a gong as they open
const demonSummon = recipe(2.8, [
  ...[92.5, 138.6, 185, 220, 277.2, 370].map((f, i) => sing(i * 0.04, f, 2.3, 0.5 - 0.03 * i, OOH_AH, 0.5)),
  { k: 'tone', wave: 'sine', f0: 46, f1: 62, dur: 2.5, att: 0.6, tau: Infinity, rel: 0.3, amp: 0.55, jit: 0 },
  { k: 'whoosh', dur: 1.5, f0: 180, f1: 4500, q: 1, amp: 0.5, env: [[0, 0], [1.4, 1], [1.5, 0]] },
  { k: 'roar', dur: 1.5, amp: 0.4, fA: 3500, fB: 3500, tauF: 1, hp: 500, modFc: 7, modDepth: 0.8, env: [[0, 0], [1.45, 1], [1.5, 0]] },
  { k: 'crack', at: 1.5, amp: 0.8, dur: 0.012, hp: 900, snap: 0.6, snapFc: 2500, snapTau: 0.03 },
  { k: 'body', at: 1.5, f0: 100, f1: 38, tp: 0.05, tau: 0.35, amp: 1, drive: 2 },
  { k: 'modal', at: 1.5, amp: 0.55, partials: [[93, 1, 1.2], [186, 0.6, 0.9], [277, 0.5, 0.6], [496, 0.4, 0.4], [740, 0.3, 0.3]] },
  bell(1.5, 740, 0.8, 0.22),
  bell(1.5, 1109, 0.7, 0.18),
  sparkle(1.4, 30, 1.2, 0.15, 2500, 9000),
  { k: 'rumble', at: 1.45, dur: 1.2, amp: 0.4, fc: 90, att: 0.02, tau: 0.5 },
], { sat: 1.4, tail: 100 });

// the demon blinking out and back: air folding in, a pop, air rushing out, gold sparkle
const demonTeleport = recipe(0.8, [
  { k: 'whoosh', dur: 0.3, f0: 5500, f1: 350, q: 1.4, amp: 0.7, env: [[0, 0], [0.04, 1], [0.3, 0]] },
  { k: 'tone', wave: 'sine', f0: 1600, f1: 200, dur: 0.3, att: 0.01, tau: 0.12, amp: 0.5, fm: [2.4, 2, 0.15], jit: 0 },
  { k: 'crack', at: 0.3, amp: 0.8, dur: 0.008, hp: 2000, snap: 0.3 },
  { k: 'body', at: 0.3, f0: 220, f1: 60, tp: 0.02, tau: 0.08, amp: 0.7, drive: 1.5 },
  { k: 'whoosh', at: 0.3, dur: 0.4, f0: 400, f1: 6500, q: 1.2, amp: 0.55, env: [[0, 0], [0.08, 1], [0.4, 0]] },
  bell(0.31, 1760, 0.3, 0.35),
  bell(0.34, 2637, 0.25, 0.25),
  sparkle(0.3, 26, 0.45, 0.2, 3500, 11000),
], { sat: 1.2 });

// the golden shockwave: a boom, a ring of air racing out, a gong and chimes tuned in fifths
const demonNova = recipe(1.9, [
  { k: 'crack', amp: 1, dur: 0.016, hp: 900, snap: 0.8, snapFc: 3000, snapTau: 0.03 },
  { k: 'body', f0: 105, f1: 30, tp: 0.08, tau: 0.3, amp: 1.2, drive: 2.6 },
  { k: 'whoosh', dur: 0.7, f0: 250, f1: 9000, q: 0.9, amp: 0.7, env: [[0, 0], [0.03, 1], [0.25, 0.9], [0.7, 0]] },
  { k: 'roar', dur: 0.6, amp: 0.6, fA: 7000, fB: 600, tauF: 0.2, hp: 200 },
  { k: 'rumble', dur: 1.5, amp: 0.55, fc: 110, att: 0.01, tau: 0.5 },
  { k: 'modal', amp: 0.55, partials: [[185, 1, 1.0], [277, 0.8, 0.9], [370, 0.7, 0.8], [554, 0.6, 0.6], [740, 0.5, 0.5], [1109, 0.4, 0.4], [1480, 0.3, 0.35]] },
  bell(0.01, 1480, 0.7, 0.35),
  bell(0.01, 2217, 0.6, 0.28),
  bell(0.02, 2960, 0.5, 0.2),
  bell(0.02, 4435, 0.4, 0.12),
  sparkle(0.02, 60, 1.6, 0.2, 2500, 11000),
  { k: 'echo', taps: [[0.35, 0.14], [0.8, 0.09]], fc: 600, atk: 0.05, tau: 0.3, amp: 0.8 },
], { sat: 2, tail: 80 });

// the demon's end: a falling scream, golden detonations, a chord of brass and bells, a shower of coins
const demonDeath = recipe(5.4, (r) => {
  const L = [
    {
      k: 'growl', dur: 2.3, f0: 210, f1: 62, jit: 0.07, vib: [5, 0.03], pulse: [24, 0.6], breath: 0.25, drive: 2.4, amp: 1, formants: ROAR_F,
      env: [[0, 0], [0.08, 1], [1.4, 0.85], [2.3, 0]],
    },
    {
      k: 'growl', dur: 2.3, f0: 105, f1: 31, jit: 0.07, pulse: [24, 0.6], breath: 0.25, drive: 2.4, amp: 0.55, formants: ROAR_F,
      env: [[0, 0], [0.1, 1], [1.4, 0.8], [2.3, 0]],
    },
    ...boom(0.35, 0.4),
    ...boom(0.95, 0.55),
    ...boom(1.55, 0.8),
    { k: 'body', at: 2.2, f0: 62, f1: 20, tp: 0.12, tau: 0.8, amp: 1.2, drive: 2.4 },
    { k: 'crack', at: 2.2, amp: 0.9, dur: 0.02, hp: 800, snap: 0.8, snapFc: 3000, snapTau: 0.04 },
    { k: 'whoosh', at: 1.7, dur: 0.55, f0: 300, f1: 9000, q: 1, amp: 0.5, env: [[0, 0], [0.5, 1], [0.55, 0]] },
    { k: 'roar', at: 2.2, dur: 2.4, amp: 0.3, fA: 14000, fB: 6000, tauF: 1, hp: 4500, env: [[0, 0], [0.01, 1], [2.4, 0]] },
    // the golden chord: F sharp major in brass, bells in fifths on top
    ...[92.5, 185, 277.2, 370, 466.2, 554.4, 740].map((f) => brass(2.2, f, 2.6, 0.2, { tau: 1.9, rel: 0.9, lp0: 1400, lp1: 5600, tc: 0.2 })),
    bell(2.2, 1480, 1.0, 0.3),
    bell(2.3, 2217, 0.9, 0.22),
    bell(2.4, 2960, 0.8, 0.16),
    sparkle(2.2, 90, 3.0, 0.18, 2500, 11000),
    { k: 'echo', taps: [[2.8, 0.14], [3.5, 0.09], [4.2, 0.05]], fc: 500, atk: 0.06, tau: 0.4, amp: 0.8 },
  ];
  // coins: bright bell-metal clinks raining down, thick at first
  for (let i = 0; i < 52; i++) {
    const at = 2.3 + 2.7 * Math.pow(r(), 1.6);
    const f = 1500 + 2600 * r();
    const a = 0.25 + 0.5 * r();
    L.push(bell(at, f, 0.04, a, 1.5, 3.2));
    L.push({ k: 'tone', at, wave: 'sine', f0: f * 2.76, f1: f * 2.76, dur: 0.08, att: 0.001, tau: 0.02, amp: a * 0.3, jit: 0 });
  }
  return L;
}, { sat: 1.8, tail: 250 });

// ----------------------------------------------------------------------------
// the Abomination

const abomRoar = recipe(2.9, [
  {
    k: 'growl', dur: 2.6, f0: 58, f1: 36, jit: 0.07, vib: [4.2, 0.03], pulse: [17, 0.85], breath: 0.35, drive: 3, amp: 1, formants: ABOM_F,
    env: [[0, 0], [0.15, 1], [1.6, 0.9], [2.6, 0]],
  },
  {
    k: 'growl', at: 0.08, dur: 2.5, f0: 118, f1: 74, jit: 0.07, pulse: [17, 0.7], breath: 0.35, drive: 2.6, amp: 0.5, formants: ABOM_F,
    env: [[0, 0], [0.2, 1], [1.5, 0.85], [2.5, 0]],
  },
  // the faces in its chest and belly moaning along: three thin, wavering voices
  { k: 'growl', at: 0.2, dur: 2.2, f0: 210, f1: 150, jit: 0.04, vib: [5.5, 0.05, 0.1], breath: 0.2, drive: 1.3, amp: 0.2, formants: [[400, 300, 6, 1], [800, 700, 8, 0.5]], env: [[0, 0], [0.5, 1], [1.6, 0.8], [2.2, 0]] },
  { k: 'growl', at: 0.3, dur: 2.1, f0: 262, f1: 190, jit: 0.04, vib: [4.8, 0.05, 0.1], breath: 0.2, drive: 1.3, amp: 0.16, formants: [[450, 350, 6, 1], [900, 800, 8, 0.5]], env: [[0, 0], [0.5, 1], [1.5, 0.8], [2.1, 0]] },
  { k: 'growl', at: 0.45, dur: 2.0, f0: 330, f1: 240, jit: 0.04, vib: [6, 0.05, 0.1], breath: 0.2, drive: 1.3, amp: 0.13, formants: [[500, 400, 6, 1], [1000, 900, 8, 0.5]], env: [[0, 0], [0.5, 1], [1.4, 0.8], [2.0, 0]] },
  { k: 'bubbles', n: 36, t0: 0.1, t1: 2.5, lam: 1.4, amp: 0.4, fLo: 70, fHi: 320 },
  { k: 'roar', dur: 2.4, amp: 0.35, fA: 1600, fB: 220, tauF: 0.8, hp: 90, modFc: 10, modDepth: 1.0 },
  { k: 'tone', wave: 'sine', f0: 46, f1: 36, dur: 2.4, att: 0.2, tau: Infinity, rel: 0.4, amp: 0.55, jit: 0 },
  { k: 'rumble', dur: 2.7, amp: 0.55, fc: 100, att: 0.05, tau: 1.1 },
]);

// the chain: links dragging taut, the crack as it is thrown, the hook whooshing off with the chain paying out behind it
const abomHook = recipe(1.1, [
  links(0, 26, 0.34, 0.4, 1000, 4200),
  { k: 'debris', n: 18, t0: 0, t1: 0.34, lam: 0.2, amp: 0.2, fLo: 1500, fHi: 5000, grit: 0.4 },
  { k: 'whoosh', at: 0.1, dur: 0.24, f0: 200, f1: 1300, q: 1.2, amp: 0.3 },
  { k: 'crack', at: 0.34, amp: 1, dur: 0.012, hp: 1400, snap: 0.5, snapFc: 3500, snapTau: 0.015 },
  { k: 'body', at: 0.34, f0: 150, f1: 54, tp: 0.04, tau: 0.1, amp: 0.8, drive: 1.8 },
  ring(0.345, 520, 0.45, 0.12),
  { k: 'whoosh', at: 0.32, dur: 0.6, f0: 700, f1: 2500, q: 0.9, amp: 0.65, env: [[0, 0], [0.06, 1], [0.6, 0]] },
  links(0.36, 48, 0.7, 0.3, 1200, 5000),
], { sat: 1.4, tail: 60 });

// the hook biting into flesh: a wet thud, the iron point ringing, the chain jangling taut
const abomCatch = recipe(0.65, [
  { k: 'body', f0: 150, f1: 52, tp: 0.03, tau: 0.1, amp: 1.1, drive: 1.9, dur: 0.4 },
  { k: 'crack', amp: 0.9, dur: 0.008, hp: 900, snap: 0.7, snapFc: 1700, snapTau: 0.025 },
  ring(0.004, 780, 0.4, 0.09),
  ...gore(0.01, 0.55),
  ...crunch(0.012, 0.6),
  { k: 'roar', at: 0.02, dur: 0.3, amp: 0.5, fA: 1500, fB: 220, tauF: 0.08, q: 1.8, modFc: 55, modDepth: 1.0, hp: 120 },
  links(0.03, 22, 0.4, 0.3, 1100, 4500),
], { sat: 1.5 });

// bile: a retching throat, then a long wet gush, spatter and the fizz of acid
const abomVomit = recipe(1.9, [
  {
    k: 'growl', dur: 0.45, f0: 72, f1: 108, jit: 0.08, pulse: [11, 0.9], breath: 0.35, drive: 2.4, amp: 0.8, formants: ABOM_F,
    env: [[0, 0], [0.1, 0.8], [0.4, 1], [0.45, 0]],
  },
  { k: 'roar', at: 0.32, dur: 1.3, amp: 1, fA: 2400, fB: 380, tauF: 0.7, q: 1, hp: 100, modFc: 19, modDepth: 1.1, env: [[0, 0], [0.06, 1], [0.9, 0.85], [1.3, 0]] },
  { k: 'roar', at: 0.34, dur: 1.2, amp: 0.55, fA: 1100, fB: 200, tauF: 0.8, q: 2, hp: 80, modFc: 38, modDepth: 1.1 },
  { k: 'bubbles', n: 60, t0: 0.3, t1: 1.8, lam: 0.9, amp: 0.55, fLo: 90, fHi: 520 },
  { k: 'debris', n: 90, t0: 0.34, t1: 1.8, lam: 0.8, amp: 0.4, fLo: 400, fHi: 2600, grit: 0.92 },
  { k: 'roar', at: 0.34, dur: 1.4, amp: 0.2, fA: 8000, fB: 3500, tauF: 0.7, hp: 3000, modFc: 130, modDepth: 0.9 },
  { k: 'rumble', at: 0.3, dur: 1.3, amp: 0.45, fc: 130, att: 0.05, tau: 0.7 },
  { k: 'body', at: 0.32, f0: 100, f1: 50, tp: 0.05, tau: 0.12, amp: 0.5, drive: 1.5 },
], { sat: 1.4, tail: 80 });

// the cleaver coming down: a crack like a tree splitting, a body blow, iron ringing, earth thrown up, an air rush along the line
const abomSlam = recipe(2.3, [
  { k: 'crack', amp: 1, dur: 0.02, hp: 400, snap: 0.9, snapFc: 1500, snapTau: 0.05 },
  { k: 'body', f0: 72, f1: 22, tp: 0.15, tau: 0.5, amp: 1.2, drive: 3 },
  { k: 'modal', amp: 0.45, partials: [[170, 1, 0.5], [320, 0.8, 0.4], [540, 0.6, 0.3], [900, 0.5, 0.2], [1450, 0.3, 0.15]] },
  { k: 'clods', n: 16, t0: 0.02, t1: 1.5, lam: 0.45, amp: 0.7, fLo: 50, fHi: 140 },
  { k: 'debris', n: 60, t0: 0.05, t1: 1.6, lam: 0.5, amp: 0.3, fLo: 400, fHi: 3000, grit: 0.6 },
  { k: 'rumble', dur: 2.1, amp: 0.6, fc: 85, att: 0.01, tau: 0.65, rollFc: 5, rollDepth: 0.4 },
  { k: 'whoosh', dur: 0.6, f0: 120, f1: 900, q: 0.7, amp: 0.4, env: [[0, 0], [0.05, 1], [0.6, 0]] },
  { k: 'roar', dur: 0.4, amp: 0.5, fA: 1600, fB: 200, tauF: 0.1 },
  { k: 'echo', taps: [[0.4, 0.15], [0.85, 0.09]], fc: 450, atk: 0.05, tau: 0.3, amp: 0.8 },
], { sat: 2.4, tail: 100 });

// the belly tearing open: stitches popping, a long rip, a huge wet burst and gas, things skittering out
const abomBurst = recipe(2.1, [
  { k: 'roar', dur: 0.8, amp: 0.9, fA: 5200, fB: 1800, tauF: 0.5, hp: 700, q: 1.3, modFc: 85, modDepth: 1.3, env: [[0, 0], [0.02, 1], [0.5, 0.9], [0.8, 0]] },
  ...[0.05, 0.14, 0.22, 0.31, 0.38].map((t) => ({ k: 'crack', at: t, amp: 0.5, dur: 0.005, hp: 1200, snap: 0.3 })),
  { k: 'crack', at: 0.45, amp: 1, dur: 0.02, hp: 400, snap: 0.9, snapFc: 1300, snapTau: 0.05 },
  { k: 'body', at: 0.45, f0: 100, f1: 30, tp: 0.06, tau: 0.3, amp: 1.2, drive: 2.5 },
  ...gore(0.45, 1),
  { k: 'roar', at: 0.5, dur: 0.9, amp: 0.4, fA: 6000, fB: 1500, tauF: 0.4, hp: 1200 },
  { k: 'debris', n: 70, t0: 0.6, t1: 2.0, lam: 0.8, amp: 0.3, fLo: 2500, fHi: 6500, grit: 0.15 },
  {
    k: 'growl', at: 0.4, dur: 1.4, f0: 70, f1: 50, jit: 0.07, pulse: [16, 0.8], breath: 0.3, drive: 2.6, amp: 0.8, formants: ABOM_F,
    env: [[0, 0], [0.1, 1], [0.8, 0.8], [1.4, 0]],
  },
  { k: 'clods', n: 8, t0: 0.5, t1: 1.6, amp: 0.45, fLo: 60, fHi: 160 },
  { k: 'rumble', at: 0.4, dur: 1.6, amp: 0.45, fc: 100, att: 0.02, tau: 0.6 },
], { sat: 1.8, tail: 100 });

// the Abomination falls apart: its voice sinking, belly after belly bursting, a collapse, the faces dying, the last gas
const abomDeath = recipe(5.4, [
  {
    k: 'growl', dur: 3.4, f0: 76, f1: 20, jit: 0.08, vib: [4, 0.03], pulse: [14, 0.8], breath: 0.3, drive: 2.5, amp: 1, formants: ABOM_F,
    env: [[0, 0], [0.1, 1], [2.2, 0.8], [3.4, 0]],
  },
  {
    k: 'growl', at: 0.05, dur: 3.2, f0: 152, f1: 42, jit: 0.08, pulse: [14, 0.7], breath: 0.3, drive: 2.4, amp: 0.4, formants: ABOM_F,
    env: [[0, 0], [0.15, 1], [2, 0.7], [3.2, 0]],
  },
  ...[0.2, 0.85, 1.5].map((t, i) => [
    { k: 'crack', at: t, amp: 0.8, dur: 0.016, hp: 450, snap: 0.9, snapFc: 1400, snapTau: 0.04 },
    { k: 'body', at: t, f0: 110 - 15 * i, f1: 34, tp: 0.06, tau: 0.25 + 0.05 * i, amp: 1, drive: 2.3 },
    ...gore(t, 1),
  ]).flat(),
  // three faces dying, one by one
  { k: 'growl', at: 0.5, dur: 2.0, f0: 240, f1: 110, jit: 0.04, vib: [5.5, 0.06, 0.1], breath: 0.2, drive: 1.3, amp: 0.2, formants: [[400, 300, 6, 1], [800, 600, 8, 0.5]], env: [[0, 0], [0.3, 1], [1.2, 0.7], [2, 0]] },
  { k: 'growl', at: 1.1, dur: 2.0, f0: 300, f1: 130, jit: 0.04, vib: [5, 0.06, 0.1], breath: 0.2, drive: 1.3, amp: 0.17, formants: [[450, 330, 6, 1], [900, 700, 8, 0.5]], env: [[0, 0], [0.3, 1], [1.2, 0.7], [2, 0]] },
  { k: 'growl', at: 1.7, dur: 2.0, f0: 190, f1: 90, jit: 0.04, vib: [4.5, 0.06, 0.1], breath: 0.2, drive: 1.3, amp: 0.2, formants: [[380, 280, 6, 1], [760, 560, 8, 0.5]], env: [[0, 0], [0.3, 1], [1.2, 0.7], [2, 0]] },
  // the collapse
  { k: 'body', at: 2.8, f0: 62, f1: 18, tp: 0.14, tau: 0.9, amp: 1.3, drive: 3 },
  { k: 'crack', at: 2.8, amp: 1, dur: 0.02, hp: 400, snap: 0.9, snapFc: 1500, snapTau: 0.05 },
  { k: 'clods', n: 18, t0: 2.82, t1: 4.2, lam: 0.6, amp: 0.7, fLo: 50, fHi: 140 },
  ...gore(2.8, 1),
  { k: 'bubbles', n: 50, t0: 2.9, t1: 5.0, lam: 1.4, amp: 0.4, fLo: 80, fHi: 450 },
  { k: 'roar', at: 3.2, dur: 1.8, amp: 0.3, fA: 3000, fB: 800, tauF: 0.8, hp: 900, modFc: 6, modDepth: 0.7, env: [[0, 0], [0.1, 1], [1.8, 0]] },
  { k: 'rumble', at: 0.2, dur: 5, amp: 0.5, fc: 90, att: 0.1, tau: 1.8 },
  { k: 'echo', taps: [[3.3, 0.14], [3.9, 0.09], [4.5, 0.05]], fc: 450, atk: 0.06, tau: 0.4, amp: 0.8 },
], { sat: 2.2, tail: 250 });

// ----------------------------------------------------------------------------
// guns

// the Tesla gun: a spit of arc and a buzzing coil, sparks crackling round it
const shotTesla = recipe(0.32, [
  { k: 'crack', amp: 0.8, dur: 0.005, hp: 3000, snap: 0.2, snapFc: 5000, snapTau: 0.01 },
  { k: 'tone', wave: 'saw', f0: 120, f1: 135, dur: 0.28, att: 0.004, tau: 0.14, amp: 0.5, am: [100, 0.8], drive: 2.5, lp: [5500, 1800, 0.1], jit: 0.06 },
  { k: 'tone', wave: 'sine', f0: 6500, f1: 700, tp: 0.06, dur: 0.16, att: 0.001, tau: 0.05, amp: 0.4, fm: [1.5, 1.5, 0.05] },
  { k: 'tone', wave: 'square', f0: 1700, f1: 1500, dur: 0.22, att: 0.003, tau: 0.09, amp: 0.2, am: [38, 1], lp: [6000, 2500, 0.08], jit: 0.06 },
  { k: 'debris', n: 70, t0: 0, t1: 0.28, lam: 0.12, amp: 0.55, fLo: 2500, fHi: 12000, grit: 0.75, gritLen: 0.8 },
  { k: 'roar', dur: 0.2, amp: 0.3, fA: 9000, fB: 2500, tauF: 0.08, hp: 2500, modFc: 120, modDepth: 1.2 },
], {});

// the Saw launcher: a heavy thunk, a click of steel and a blade whirring away, falling in pitch
const shotSaw = recipe(0.55, [
  { k: 'crack', amp: 0.7, dur: 0.008, hp: 700, snap: 0.6, snapFc: 1800, snapTau: 0.02 },
  { k: 'body', f0: 150, f1: 58, tp: 0.04, tau: 0.09, amp: 1, drive: 1.8, dur: 0.3 },
  { k: 'modal', at: 0.01, amp: 0.4, partials: [[540, 1, 0.08], [1010, 0.7, 0.06], [1800, 0.4, 0.04]] },
  { k: 'tone', at: 0.03, wave: 'saw', f0: 520, f1: 300, dur: 0.5, att: 0.01, tau: 0.22, amp: 0.55, det: 40, am: [62, 0.75], drive: 2, lp: [4200, 1400, 0.2], jit: 0.05 },
  { k: 'tone', at: 0.03, wave: 'square', f0: 1040, f1: 600, dur: 0.4, att: 0.01, tau: 0.16, amp: 0.2, am: [62, 0.8], lp: [5000, 1500, 0.15], jit: 0.05 },
  { k: 'whoosh', at: 0.03, dur: 0.45, f0: 1500, f1: 5000, q: 1.6, amp: 0.3, env: [[0, 0], [0.04, 1], [0.45, 0]] },
  { k: 'debris', at: 0.03, n: 18, t0: 0, t1: 0.35, lam: 0.2, amp: 0.2, fLo: 3000, fHi: 9000, grit: 0.6 },
], {});

// Swarm: a tiny rocket leaving its pod, a small pop and a quick swish
const shotSwarm = recipe(0.4, [
  { k: 'crack', amp: 0.5, dur: 0.006, hp: 1500, snap: 0.2 },
  { k: 'body', f0: 210, f1: 90, tp: 0.02, tau: 0.04, amp: 0.55, drive: 1.4, dur: 0.15 },
  { k: 'whoosh', at: 0.01, dur: 0.34, f0: 1400, f1: 6500, q: 1.5, amp: 0.8, env: [[0, 0], [0.03, 1], [0.34, 0]] },
  { k: 'roar', at: 0.01, dur: 0.3, amp: 0.3, fA: 7000, fB: 3500, tauF: 0.2, hp: 2800 },
  { k: 'tone', at: 0.01, wave: 'saw', f0: 340, f1: 1500, dur: 0.3, att: 0.01, tau: 0.15, amp: 0.2, lp: [1500, 4000, 0.1], jit: 0.05 },
], {});

// Dragon: the scatter gun's boom with a roar of flame bursting out behind the shot
const shotDragon = recipe(0.95, [
  { k: 'crack', amp: 1, dur: 0.014, hp: 650, snap: 0.75, snapFc: 2400, snapTau: 0.03 },
  { k: 'body', f0: 165, f1: 48, tp: 0.045, tau: 0.13, amp: 1.1, drive: 2.1 },
  { k: 'roar', at: 0.01, dur: 0.6, amp: 0.85, fA: 5500, fB: 320, tauF: 0.16, hp: 150, q: 0.8, modFc: 22, modDepth: 0.7 },
  { k: 'whoosh', at: 0.02, dur: 0.7, f0: 250, f1: 2400, q: 0.8, amp: 0.55, env: [[0, 0], [0.07, 1], [0.3, 0.8], [0.7, 0]] },
  { k: 'rumble', dur: 0.8, amp: 0.45, fc: 160, att: 0.01, tau: 0.22 },
  { k: 'debris', n: 40, t0: 0.05, t1: 0.8, lam: 0.3, amp: 0.3, fLo: 800, fHi: 5000, grit: 0.8 },
], { sat: 1.8, tail: 50 });

// Thunder: a bigger arc, a sharp crack and thunder rolling after it
const shotThunder = recipe(1.3, [
  { k: 'crack', amp: 1, dur: 0.012, hp: 2200, snap: 0.6, snapFc: 4500, snapTau: 0.02 },
  { k: 'tone', wave: 'saw', f0: 3200, f1: 140, tp: 0.06, dur: 0.3, att: 0.001, tau: 0.1, amp: 0.5, drive: 2, lp: [9000, 1500, 0.08] },
  { k: 'tone', wave: 'saw', f0: 110, f1: 90, dur: 0.4, att: 0.002, tau: 0.17, amp: 0.45, am: [58, 0.8], drive: 2.5, lp: [5000, 1800, 0.12] },
  { k: 'debris', n: 80, t0: 0, t1: 0.5, lam: 0.18, amp: 0.5, fLo: 2500, fHi: 12000, grit: 0.7, gritLen: 0.7 },
  { k: 'body', at: 0.03, f0: 90, f1: 28, tp: 0.06, tau: 0.32, amp: 1.1, drive: 2.4 },
  { k: 'roar', at: 0.04, dur: 1.0, amp: 0.7, fA: 2600, fB: 130, tauF: 0.35, q: 0.7, modFc: 11, modDepth: 0.8 },
  { k: 'rumble', at: 0.04, dur: 1.2, amp: 0.5, fc: 95, att: 0.02, tau: 0.45, rollFc: 4, rollDepth: 0.5 },
], { sat: 2, tail: 80 });

// Bloodmill: the saw launcher made heavy: a deeper thunk, a slower, lower whir and a spray of blood
const shotBloodmill = recipe(0.8, [
  { k: 'crack', amp: 0.8, dur: 0.01, hp: 600, snap: 0.7, snapFc: 1600, snapTau: 0.025 },
  { k: 'body', f0: 120, f1: 40, tp: 0.06, tau: 0.13, amp: 1.2, drive: 2.2, dur: 0.4 },
  { k: 'modal', at: 0.01, amp: 0.45, partials: [[330, 1, 0.15], [640, 0.7, 0.1], [1180, 0.5, 0.07], [2000, 0.3, 0.05]] },
  { k: 'tone', at: 0.04, wave: 'saw', f0: 300, f1: 170, dur: 0.7, att: 0.015, tau: 0.35, amp: 0.7, det: 50, am: [44, 0.8], drive: 2.6, lp: [3200, 900, 0.3], jit: 0.05 },
  { k: 'tone', at: 0.04, wave: 'square', f0: 600, f1: 340, dur: 0.55, att: 0.015, tau: 0.22, amp: 0.2, am: [44, 0.8], lp: [3500, 1200, 0.2], jit: 0.05 },
  { k: 'rumble', dur: 0.7, amp: 0.45, fc: 130, att: 0.01, tau: 0.3 },
  { k: 'whoosh', at: 0.05, dur: 0.6, f0: 900, f1: 2800, q: 1.2, amp: 0.3, env: [[0, 0], [0.05, 1], [0.6, 0]] },
  ...gore(0.05, 0.3),
], { sat: 1.8, tail: 50 });

// a blade ripping through flesh: a buzzing saw, a wet rasp, bits of bone
const sawGrind = recipe(0.22, [
  { k: 'tone', wave: 'saw', f0: 440, f1: 330, dur: 0.19, att: 0.004, tau: 0.09, amp: 0.7, det: 35, am: [88, 0.85], drive: 2.2, lp: [3800, 1500, 0.08] },
  { k: 'roar', dur: 0.17, amp: 0.55, fA: 2600, fB: 420, tauF: 0.06, q: 1.4, modFc: 65, modDepth: 1.0 },
  { k: 'debris', n: 14, t0: 0.005, t1: 0.17, lam: 0.08, amp: 0.4, fLo: 600, fHi: 3000, grit: 0.9 },
  { k: 'bubbles', n: 3, t0: 0.03, t1: 0.17, amp: 0.3, fLo: 250, fHi: 700 },
  { k: 'crack', amp: 0.35, dur: 0.004, hp: 1500, snap: 0 },
  { k: 'body', f0: 190, f1: 90, tp: 0.015, tau: 0.03, amp: 0.4, dur: 0.1 },
], { tail: 20 });

// ----------------------------------------------------------------------------
// the inferno: the flamer's roar made hotter and deeper (a seamless loop of 2.3 s, run by Sound.flame like the plain one)

function* flameRoarInferno(sr, seed) {
  const r = seeded(seed);
  const N = Math.round(2.3 * sr);
  const X = Math.round(0.28 * sr); // rendered past the end, to be folded onto the start
  const buf = new Float32Array(N + X);
  const layer = function* (chain, mods, amp) {
    const a = yield* colored(N + X, sr, r, chain);
    for (const [fc, depth] of mods) yield* modulate(a, sr, r, fc, depth);
    yield* addTo(buf, a, amp, 0);
  };
  yield* layer([['highpass', 70, 0.7], ['lowpass', 1400, 0.8], ['lowpass', 2600, 0.7]], [[9, 0.55], [2.5, 0.4]], 1);
  yield* layer([['lowpass', 110, 1.2], ['lowpass', 190, 0.7]], [[3.5, 0.5]], 1.25);
  yield* layer([['highpass', 3500, 0.7], ['lowpass', 12000, 0.7]], [[55, 0.85], [6, 0.45]], 0.36);
  yield* layer([['lowpass', 520, 0.9]], [[13, 1.2]], 0.7);
  yield;
  const out = foldLoop(buf, N);
  removeDC(out);
  return out;
}

// ----------------------------------------------------------------------------
// the hero grabs the new guns (~0.5 s): a clack, then a charge in the flavour of the gun

const swapTesla = recipe(0.5, [
  ...clack(0, 1100, 0.8),
  { k: 'tone', at: 0.05, wave: 'saw', f0: 110, f1: 480, dur: 0.3, att: 0.02, tau: Infinity, rel: 0.03, amp: 0.4, det: 20, am: [70, 0.7], lp: [600, 5000, 0.18], drive: 1.5, jit: 0 },
  { k: 'tone', at: 0.05, wave: 'sine', f0: 600, f1: 5200, dur: 0.28, att: 0.02, tau: Infinity, rel: 0.03, amp: 0.25, jit: 0 },
  { k: 'debris', at: 0.05, n: 40, t0: 0, t1: 0.3, lam: 0.2, amp: 0.4, fLo: 3500, fHi: 12000, grit: 0.7, gritLen: 0.7 },
  { k: 'crack', at: 0.34, amp: 0.8, dur: 0.005, hp: 3500, snap: 0 },
  { k: 'tone', at: 0.35, wave: 'sine', f0: 2637, f1: 2637, dur: 0.14, att: 0.002, tau: 0.04, amp: 0.4, jit: 0 },
], { sat: 1.3 });

const swapSaw = recipe(0.52, [
  ...clack(0, 820, 1),
  { k: 'rev', at: 0.1, f0: 70, f1: 320, dur: 0.3, att: 0.02, rel: 0.04, amp: 0.45, pulse: 0.6, ratio: 3, lp: [400, 3500], drive: 2 },
  { k: 'tone', at: 0.1, wave: 'saw', f0: 300, f1: 900, dur: 0.3, att: 0.03, tau: Infinity, rel: 0.04, amp: 0.3, am: [55, 0.7], lp: [900, 4000, 0.15], drive: 1.5, jit: 0 },
  { k: 'modal', at: 0.4, amp: 0.4, partials: [[2400, 1, 0.14], [3600, 0.7, 0.1], [5100, 0.4, 0.07]] },
  { k: 'crack', at: 0.4, amp: 0.5, dur: 0.004, hp: 3000, snap: 0 },
], { sat: 1.3 });

// inferno: a heavier igniter, a longer hiss of gas and a deeper whump
const swapInferno = recipe(0.56, [
  ...clack(0, 700, 0.9),
  { k: 'roar', at: 0.04, dur: 0.28, amp: 0.5, fA: 8000, fB: 3500, tauF: 0.25, hp: 3000, q: 0.7, env: [[0, 0], [0.05, 1], [0.24, 0.8], [0.28, 0]] },
  { k: 'crack', at: 0.2, amp: 0.7, dur: 0.003, hp: 3500, snap: 0 },
  { k: 'crack', at: 0.235, amp: 0.5, dur: 0.003, hp: 3500, snap: 0 },
  { k: 'crack', at: 0.265, amp: 0.4, dur: 0.003, hp: 3500, snap: 0 },
  { k: 'body', at: 0.29, f0: 70, f1: 28, tp: 0.1, tau: 0.28, amp: 1.2, drive: 2.4 },
  { k: 'roar', at: 0.29, dur: 0.26, amp: 0.8, fA: 3000, fB: 200, tauF: 0.1, hp: 80, q: 0.8, modFc: 26, modDepth: 0.6 },
  { k: 'rumble', at: 0.29, dur: 0.27, amp: 0.6, fc: 120, att: 0.01, tau: 0.14 },
]);

// swarm: pods locking in one after another, a servo whine, a ready beep
const swapSwarm = recipe(0.5, [
  ...clack(0, 1500, 0.6),
  ...[0.1, 0.16, 0.22, 0.28].flatMap((t, i) => tick(t, 2000 + 250 * i, 0.3)),
  { k: 'tone', at: 0.08, wave: 'saw', f0: 400, f1: 1600, dur: 0.3, att: 0.02, tau: Infinity, rel: 0.03, amp: 0.25, lp: [800, 3500, 0.15], am: [40, 0.4], jit: 0 },
  { k: 'tone', at: 0.38, wave: 'sine', f0: 2093, f1: 2093, dur: 0.1, att: 0.002, tau: 0.04, amp: 0.4, jit: 0 },
  { k: 'tone', at: 0.43, wave: 'sine', f0: 3136, f1: 3136, dur: 0.08, att: 0.002, tau: 0.03, amp: 0.3, jit: 0 },
]);

// dragon: the pump racked hard, then a warm rush of flame and embers
const swapDragon = recipe(0.55, [
  ...clack(0, 600, 1.1),
  { k: 'whoosh', at: 0.02, dur: 0.14, f0: 900, f1: 2200, q: 1.4, amp: 0.25, env: [[0, 0], [0.03, 1], [0.14, 0]] },
  ...clack(0.19, 880, 1.2),
  { k: 'body', at: 0.19, f0: 120, f1: 45, tp: 0.03, tau: 0.1, amp: 0.8, drive: 1.8 },
  { k: 'roar', at: 0.27, dur: 0.28, amp: 0.6, fA: 4000, fB: 300, tauF: 0.12, hp: 120, q: 0.8, modFc: 24, modDepth: 0.6 },
  { k: 'debris', at: 0.27, n: 20, t0: 0, t1: 0.27, lam: 0.12, amp: 0.3, fLo: 800, fHi: 4500, grit: 0.8 },
  { k: 'rumble', at: 0.27, dur: 0.26, amp: 0.4, fc: 140, att: 0.01, tau: 0.12 },
]);

// thunder: a deep coil hum rising, a whine, then a crack and a roll of thunder
const swapThunder = recipe(0.56, [
  ...clack(0, 640, 1),
  { k: 'tone', at: 0.04, wave: 'saw', f0: 55, f1: 120, dur: 0.34, att: 0.03, tau: Infinity, rel: 0.04, amp: 0.45, am: [50, 0.8], lp: [400, 1500, 0.2], drive: 1.6, jit: 0 },
  { k: 'tone', at: 0.06, wave: 'sine', f0: 300, f1: 3800, dur: 0.3, att: 0.02, tau: Infinity, rel: 0.03, amp: 0.25, jit: 0 },
  { k: 'debris', at: 0.06, n: 30, t0: 0, t1: 0.3, lam: 0.2, amp: 0.35, fLo: 3000, fHi: 11000, grit: 0.7 },
  { k: 'crack', at: 0.36, amp: 0.9, dur: 0.008, hp: 2000, snap: 0.5, snapFc: 4000 },
  { k: 'body', at: 0.36, f0: 85, f1: 30, tp: 0.05, tau: 0.25, amp: 1, drive: 2 },
  { k: 'roar', at: 0.37, dur: 0.19, amp: 0.5, fA: 1800, fB: 140, tauF: 0.1, q: 0.7 },
], { sat: 1.5 });

// bloodmill: a low motor winding up, a squelch, a ring of steel
const swapBloodmill = recipe(0.56, [
  ...clack(0, 520, 1.1),
  { k: 'rev', at: 0.08, f0: 55, f1: 220, dur: 0.34, att: 0.02, rel: 0.05, amp: 0.55, pulse: 0.7, ratio: 3, lp: [300, 2600], drive: 2.4 },
  { k: 'tone', at: 0.1, wave: 'saw', f0: 200, f1: 600, dur: 0.3, att: 0.03, tau: Infinity, rel: 0.04, amp: 0.25, am: [44, 0.8], lp: [700, 2500, 0.15], drive: 1.5, jit: 0 },
  ...gore(0.3, 0.2),
  { k: 'modal', at: 0.42, amp: 0.35, partials: [[1700, 1, 0.14], [2600, 0.7, 0.1], [3900, 0.4, 0.07]] },
  { k: 'crack', at: 0.42, amp: 0.5, dur: 0.004, hp: 2500, snap: 0 },
], { sat: 1.4 });

// ----------------------------------------------------------------------------
// the game

// a body in acid or fire: a crackling fizz with little pops, a sick bubble, a wet flutter
const hazard = recipe(0.55, [
  { k: 'roar', dur: 0.5, amp: 0.8, fA: 11000, fB: 4500, tauF: 0.25, hp: 2800, q: 0.8, modFc: 150, modDepth: 1.1, env: [[0, 0], [0.01, 1], [0.18, 0.8], [0.5, 0]] },
  { k: 'debris', n: 44, t0: 0, t1: 0.5, lam: 0.2, amp: 0.55, fLo: 1500, fHi: 7000, grit: 0.55 },
  { k: 'bubbles', n: 6, t0: 0.03, t1: 0.45, amp: 0.4, fLo: 300, fHi: 900 },
  { k: 'roar', dur: 0.4, amp: 0.3, fA: 1800, fB: 400, tauF: 0.1, hp: 150, modFc: 45, modDepth: 0.9 },
  { k: 'body', f0: 140, f1: 70, tp: 0.02, tau: 0.04, amp: 0.3, dur: 0.12 },
], { tail: 40 });

// a chapter cleared: a timpani roll, a brass call (G G G, B, D) and a big G major chord with bells and a crash
const chapterClear = recipe(4.4, [
  ...Array.from({ length: 18 }, (_, i) => ({ k: 'body', at: i * 0.045, f0: 150, f1: 80, tp: 0.02, tau: 0.05, amp: 0.12 + 0.45 * (i / 17), drive: 1.1, dur: 0.12, jit: 0.03 })),
  ...[[0.7, 392, 0.14], [0.88, 392, 0.14], [1.06, 392, 0.14], [1.24, 493.9, 0.3], [1.6, 587.3, 0.3]].map(([t, f, d]) => brass(t, f, d, 0.34, { tau: d, rel: 0.06, lp0: 1000, lp1: 4800 })),
  ...[196, 392, 493.9, 587.3, 784, 987.8, 1174.7].map((f) => brass(2.0, f, 2.2, 0.2, { tau: 1.8, rel: 0.8, lp0: 1400, lp1: 5600, tc: 0.2 })),
  { k: 'body', at: 2.0, f0: 100, f1: 38, tp: 0.05, tau: 0.45, amp: 1.1, drive: 1.8 },
  { k: 'crack', at: 2.0, amp: 0.6, dur: 0.012, hp: 1200, snap: 0.5, snapFc: 3000 },
  { k: 'roar', at: 2.0, dur: 2.2, amp: 0.35, fA: 14000, fB: 6000, tauF: 0.9, hp: 4500, env: [[0, 0], [0.01, 1], [2.2, 0]] },
  bell(2.0, 1568, 1.0, 0.28),
  bell(2.08, 1975.5, 0.9, 0.2),
  bell(2.16, 2349, 0.8, 0.16),
  bell(2.24, 3136, 0.7, 0.12),
  sparkle(2.0, 60, 2.4, 0.2),
  { k: 'body', at: 2.45, f0: 110, f1: 45, tp: 0.04, tau: 0.3, amp: 0.7, drive: 1.6 },
], { sat: 1.1, tail: 200 });

// an endless wave: a dark B minor swell with two hits and a bell; Sound.endlessWave raises it a little with the wave number
const endlessWave = recipe(1.35, [
  brass(0, 123.5, 1.2, 0.5, { att: 0.22, tau: Infinity, rel: 0.3, lp0: 260, lp1: 1900, tc: 0.3, det: 16, drive: 1.8 }),
  brass(0, 185, 1.2, 0.35, { att: 0.22, tau: Infinity, rel: 0.3, lp0: 260, lp1: 1900, tc: 0.3, det: 16, drive: 1.8 }),
  brass(0.38, 293.7, 0.8, 0.22, { att: 0.04, tau: 0.5, rel: 0.2, lp0: 900, lp1: 3800 }),
  { k: 'whoosh', dur: 0.55, f0: 250, f1: 3200, q: 1.1, amp: 0.35, env: [[0, 0], [0.5, 1], [0.55, 0]] },
  { k: 'body', at: 0.5, f0: 100, f1: 40, tp: 0.05, tau: 0.28, amp: 1, drive: 2 },
  { k: 'crack', at: 0.5, amp: 0.5, dur: 0.01, hp: 800, snap: 0.5 },
  { k: 'body', at: 0.8, f0: 95, f1: 38, tp: 0.05, tau: 0.22, amp: 0.7, drive: 2 },
  bell(0.5, 987.8, 0.4, 0.22),
  bell(0.8, 1480, 0.5, 0.25),
  { k: 'rumble', at: 0.5, dur: 0.8, amp: 0.35, fc: 110, att: 0.01, tau: 0.3 },
]);

// ----------------------------------------------------------------------------

export const SFX2 = {
  // creatures
  'exploder.swell': def(LO, 2, exploderSwell, -24, 250, 2, 2, { load: 4 }),
  'exploder.burst': def(LO, 4, exploderBurst, -17, 50, 4, 2, { load: 4 }),
  'armor.hit': def(HI, 4, armorHit, -31, 24, 5, 0, { load: 4 }),
  'armor.break': def(HI, 2, armorBreak, -20, 120, 3, 2, { load: 4 }),
  'imp.screech': def(HI, 3, impScreech, -25, 160, 2, 1, { load: 4 }),
  'hound.howl': def(LO, 2, houndHowl, -20, 800, 2, 2, { load: 4 }),
  'hound.bite': def(LO, 3, houndBite, -24, 90, 3, 1, { load: 4 }),
  // the Golden Demon
  'demon.laugh': def(LO, 1, demonLaugh, -15, 800, 1, 3, { load: 4, duck: [0.5, 2.2] }),
  'demon.cast': def(HI, 1, demonCast, -20, 300, 2, 2, { load: 4, duck: [0.15, 0.5] }),
  'demon.summon': def(HI, 1, demonSummon, -15, 800, 1, 3, { load: 4, duck: [0.55, 2.6] }),
  'demon.teleport': def(HI, 1, demonTeleport, -21, 250, 2, 2, { load: 4, duck: [0.15, 0.5] }),
  'demon.nova': def(HI, 1, demonNova, -12, 600, 1, 3, { load: 4, duck: [0.6, 1.9] }),
  'demon.death': def(HI, 1, demonDeath, -9, 1500, 1, 3, { load: 4, duck: [0.8, 4.8] }),
  // the Abomination
  'abom.roar': def(LO, 1, abomRoar, -12, 600, 1, 3, { load: 4, duck: [0.55, 2.8] }),
  'abom.hook': def(HI, 1, abomHook, -18, 400, 1, 2, { load: 4, duck: [0.3, 1.0] }),
  'abom.catch': def(LO, 1, abomCatch, -17, 250, 2, 3, { load: 4, duck: [0.25, 0.6] }),
  'abom.vomit': def(LO, 1, abomVomit, -15, 600, 1, 3, { load: 4, duck: [0.4, 1.8] }),
  'abom.slam': def(LO, 1, abomSlam, -10, 400, 1, 3, { load: 4, duck: [0.6, 1.9] }),
  'abom.burst': def(LO, 1, abomBurst, -13, 800, 1, 3, { load: 4, duck: [0.55, 2.0] }),
  'abom.death': def(LO, 1, abomDeath, -9, 1500, 1, 3, { load: 4, duck: [0.8, 4.8] }),
  // guns: the two new ones come early, the evolutions with the rest
  'shot.tesla': def(HI, 3, shotTesla, -23, 60, 4, 1, { load: 2.2 }),
  'shot.saw': def(HI, 3, shotSaw, -19, 100, 3, 1, { load: 2.2 }),
  'shot.swarm': def(HI, 4, shotSwarm, -26, 38, 6, 1, { load: 4 }),
  'shot.dragon': def(LO, 2, shotDragon, -16, 100, 3, 2, { load: 4 }),
  'shot.thunder': def(HI, 2, shotThunder, -15, 140, 3, 2, { load: 4 }),
  'shot.bloodmill': def(LO, 2, shotBloodmill, -17, 130, 3, 2, { load: 4 }),
  'saw.grind': def(LO, 4, sawGrind, -28, 55, 4, 0, { load: 2.2 }),
  'flame.inferno': def(HI, 1, flameRoarInferno, -25, 0, 1, 2, { load: 4, loop: true }),
  'swap.tesla': def(HI, 1, swapTesla, -23, 120, 1, 2, { load: 2.2 }),
  'swap.saw': def(HI, 1, swapSaw, -23, 120, 1, 2, { load: 2.2 }),
  'swap.inferno': def(HI, 1, swapInferno, -22, 120, 1, 2, { load: 4 }),
  'swap.swarm': def(HI, 1, swapSwarm, -23, 120, 1, 2, { load: 4 }),
  'swap.dragon': def(LO, 1, swapDragon, -22, 120, 1, 2, { load: 4 }),
  'swap.thunder': def(HI, 1, swapThunder, -22, 120, 1, 2, { load: 4 }),
  'swap.bloodmill': def(LO, 1, swapBloodmill, -22, 120, 1, 2, { load: 4 }),
  // the game
  'hazard': def(HI, 3, hazard, -26, 220, 2, 1, { load: 4 }),
  'chapterClear': def(HI, 1, chapterClear, -13, 1000, 1, 3, { load: 4, duck: [0.6, 3.6] }),
  'endlessWave': def(HI, 1, endlessWave, -16, 500, 1, 3, { load: 4, duck: [0.35, 1.2] }),
};
