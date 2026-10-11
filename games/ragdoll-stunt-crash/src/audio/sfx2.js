// The rest of the sound bank: the trampoline, the launchers, tyres, the horn, water and lava, the cartoon crowd, the
// stunt popup stings and the interface. Same recipes of layers as sfx.js (see its header for what the numbers of a
// definition mean); bank.js joins the two tables.
//
// The stings are in G major (G A B D E), which fits both the menu theme (E minor) and the run theme (A minor).
import { recipe, def, bell, brass, sparkle, LO, HI } from './sfx.js';

// ----------------------------------------------------------------------------
// bounce, launch, tyres, horn

// a trampoline: fabric thump, a rising spring that wobbles, a metal twang
const boingR = recipe(0.9, (r, v) => [
  { k: 'boing', dur: 0.8, f0: 150, f1: 450 + 90 * v, tp: 0.05, wob: 21, wobDepth: 0.22, tauW: 0.25, tau: 0.28, amp: 0.9, drive: 1.5 },
  { k: 'boing', dur: 0.6, f0: 300, f1: 900 + 180 * v, tp: 0.05, wob: 21, wobDepth: 0.22, tauW: 0.25, tau: 0.2, amp: 0.3 },
  { k: 'body', f0: 130, f1: 58, tp: 0.03, tau: 0.07, amp: 0.9, drive: 1.3, dur: 0.2 },
  { k: 'roar', dur: 0.06, amp: 0.35, fA: 1500, fB: 300, tauF: 0.02 },
  { k: 'modal', at: 0.01, amp: 0.14, partials: [[330, 0.5, 0.18], [497, 0.4, 0.15], [1180, 0.2, 0.1], [1990, 0.1, 0.06]] },
], { sat: 1.3 });

// a cannon: a huge low boom, a blast of smoke, the iron barrel ringing, the stuntman whooshing off
const cannonR = (k) => recipe(2 + k, [
  { k: 'body', f0: 95 - 15 * k, f1: 34 - 8 * k, tp: 0.09 + 0.03 * k, tau: 0.3 + 0.2 * k, amp: 1.2, drive: 2.6, dur: 1.2 + 0.6 * k },
  { k: 'crack', amp: 1, dur: 0.012, hp: 500, snap: 0.8, snapFc: 1800, snapTau: 0.04 },
  { k: 'roar', dur: 0.7 + 0.5 * k, amp: 0.8, fA: 4500, fB: 300, tauF: 0.12 + 0.05 * k, q: 0.8, modFc: 25, modDepth: 0.5 },
  { k: 'rumble', dur: 1.2 + 0.9 * k, amp: 0.55, fc: 120, att: 0.01, tau: 0.4 + 0.3 * k },
  { k: 'modal', at: 0.01, amp: 0.25, partials: [[210, 0.6, 0.5], [330, 0.4, 0.4], [580, 0.3, 0.3], [910, 0.2, 0.2]] },
  { k: 'whoosh', at: 0.02, dur: 0.5, f0: 400, f1: 3000, q: 0.9, amp: 0.4, env: [[0, 0], [0.05, 1], [0.5, 0]] },
  { k: 'debris', at: 0.03, n: Math.round(14 + 14 * k), t0: 0.03, t1: 0.9, lam: 0.3, amp: 0.3, fLo: 600, fHi: 4500, grit: 0.7 },
  ...(k ? [
    { k: 'tone', wave: 'sine', f0: 52, f1: 22, tp: 0.5, dur: 1.8, att: 0.01, tau: 0.7, amp: 0.7, jit: 0.05 },
    { k: 'clods', n: 6, t0: 0.1, t1: 1.6, amp: 0.45 },
    { k: 'echo', taps: [[0.45, 0.13], [0.95, 0.08]], fc: 480, atk: 0.06, tau: 0.35, amp: 0.8 },
  ] : []),
], { sat: 2.2, tail: 100 });

// the slingshot letting go: a rubber twang falling away, a snap, a whoosh
const slingR = recipe(0.8, [
  { k: 'tone', wave: 'sine', f0: 700, f1: 140, tp: 0.05, dur: 0.35, att: 0.001, tau: 0.12, amp: 0.7 },
  { k: 'tone', wave: 'saw', f0: 520, f1: 110, tp: 0.05, dur: 0.3, att: 0.001, tau: 0.09, amp: 0.3, lp: [3500, 700, 0.06], q: 1.5, drive: 1.3 },
  { k: 'crack', amp: 0.6, dur: 0.005, hp: 1500, snap: 0.4, snapFc: 2500 },
  { k: 'whoosh', at: 0.005, dur: 0.45, f0: 600, f1: 3200, q: 0.9, amp: 0.45, env: [[0, 0], [0.06, 1], [0.45, 0]] },
  { k: 'modal', amp: 0.3, partials: [[190, 0.5, 0.25], [380, 0.3, 0.18], [760, 0.15, 0.1]] },
  { k: 'body', f0: 140, f1: 60, tp: 0.03, tau: 0.08, amp: 0.7, drive: 1.3, dur: 0.2 },
]);

// tyres screaming: a stick-slip squeal, hissing rubber, a juddering rumble
const skidR = recipe(0.95, (r, v) => [
  { k: 'tone', wave: 'saw', f0: 1500 + 200 * v, f1: 1350 + 150 * v, tp: 0.4, dur: 0.9, att: 0.05, tau: Infinity, rel: 0.1, amp: 0.45, vib: [6.5, 0.02, 0.1], am: [38, 0.45], lp: [3500, 2400, 0.3], q: 3, drive: 1.5, jit: 0.03 },
  { k: 'whoosh', dur: 0.9, f0: 2600, f1: 1900, q: 2.2, amp: 0.7, env: [[0, 0], [0.08, 1], [0.6, 0.8], [0.9, 0]] },
  { k: 'tear', dur: 0.85, f0: 900, f1: 650, q: 1.2, grain: 45, depth: 1.0, amp: 0.35, env: [[0, 0], [0.05, 1], [0.7, 0.8], [0.85, 0]] },
], { sat: 1.3 });

// two-tone car horn (beep, beeeep) and a lorry's deep blast
const hornNote = (at, fs, dur, amp) => fs.map((f) => ({
  k: 'tone', at, wave: 'square', f0: f, f1: f, det: 8, dur, att: 0.012, tau: Infinity, rel: 0.05, amp, lp: [1800, 2600, 0.05], q: 1.2, drive: 1.6, jit: 0,
}));
const hornR = recipe(1.0, (r, v) => (v
  ? [...hornNote(0, [185, 233], 0.9, 0.7), { k: 'tone', wave: 'sine', f0: 92, f1: 92, dur: 0.9, att: 0.02, tau: Infinity, rel: 0.05, amp: 0.4, jit: 0 }]
  : [...hornNote(0, [415, 523], 0.16, 0.5), ...hornNote(0.2, [415, 523], 0.55, 0.55)]), { sat: 1.3 });

// ----------------------------------------------------------------------------
// water and lava

// something falls in: a heavy gulp, bubbles, a spray of hiss, drops pattering
const splashR = (s) => recipe(0.55 + 0.7 * s, [
  { k: 'roar', dur: 0.3 + 0.3 * s, amp: 0.7, fA: 3500, fB: 400, tauF: 0.06 + 0.04 * s, q: 0.9, modFc: 30, modDepth: 0.6 },
  { k: 'bubbles', at: 0.02, n: Math.round(6 + 14 * s), t0: 0, t1: 0.4 + 0.7 * s, amp: 0.5, fLo: 250, fHi: 900 },
  { k: 'roar', at: 0.01, dur: 0.5 + 0.5 * s, amp: 0.35, fA: 9000, fB: 3000, tauF: 0.15, hp: 3500, modFc: 60, modDepth: 0.8 },
  { k: 'body', f0: 110, f1: 55, tp: 0.04, tau: 0.1, amp: 0.6, drive: 1.2, dur: 0.3 },
  { k: 'tinkle', at: 0.04, n: Math.round(10 + 20 * s), t0: 0, t1: 0.4 + 0.8 * s, amp: 0.12, fLo: 2500, fHi: 7000, tauLo: 0.004, tauHi: 0.01 },
]);

// lava: a frying hiss, spitting pops and slow glops
const sizzleR = recipe(1.6, [
  { k: 'roar', dur: 1.4, amp: 0.5, fA: 9000, fB: 4000, tauF: 1.0, hp: 3000, modFc: 90, modDepth: 1.0, env: [[0, 0], [0.05, 1], [0.9, 0.7], [1.4, 0]] },
  { k: 'debris', n: 55, t0: 0, t1: 1.4, lam: 0.6, amp: 0.5, fLo: 2000, fHi: 9000, grit: 0.6 },
  { k: 'bubbles', n: 8, t0: 0, t1: 1.3, amp: 0.35, fLo: 120, fHi: 400 },
  { k: 'rumble', dur: 1.3, amp: 0.25, fc: 160, att: 0.05, tau: 0.8 },
], { sat: 1.2 });

// ----------------------------------------------------------------------------
// the crowd: voices spread in time and pitch through vowel formants. The game plays two of them, one each side.

const OOH_F = [[400, 330, 6, 1], [850, 700, 8, 0.6], [2400, 2200, 10, 0.15]];
const AAH_F = [[700, 850, 6, 1], [1150, 1500, 8, 0.7], [2600, 2800, 10, 0.2]];
const EEE_F = [[330, 400, 6, 1], [2200, 2400, 8, 0.8], [3000, 3100, 10, 0.3]];

// 'ooh': a sympathetic wince, sagging in pitch
const oohR = recipe(1.6, [
  { k: 'crowd', n: 14, dur: 1.35, spread: 0.15, f0: 330, f1: 235, fSpread: 0.28, formants: OOH_F, amp: 0.8, att: 0.18, breath: 0.25 },
], { sat: 1.3, tail: 60 });

// a cheer: a roar of 'aah', a few high whoops, clapping and a whistle
const cheerR = recipe(2.4, [
  { k: 'crowd', n: 18, dur: 2.0, spread: 0.2, f0: 260, f1: 300, fSpread: 0.35, formants: AAH_F, amp: 0.8, att: 0.12 },
  { k: 'crowd', at: 0.1, n: 6, dur: 1.4, spread: 0.3, f0: 520, f1: 640, fSpread: 0.3, formants: EEE_F, amp: 0.5, att: 0.15 },
  { k: 'debris', at: 0.3, n: 70, t0: 0, t1: 1.8, lam: 1.4, amp: 0.3, fLo: 1500, fHi: 4000, grit: 0.8 },
  { k: 'tone', at: 0.5, wave: 'sine', f0: 2900, f1: 3300, dur: 0.5, att: 0.02, tau: 0.3, amp: 0.1, vib: [9, 0.02, 0.05], jit: 0 },
], { sat: 1.3, tail: 80 });

// a gasp: a sharp breath in, then a shocked 'ah'
const gaspR = recipe(0.9, [
  { k: 'whoosh', dur: 0.32, f0: 800, f1: 2600, q: 1.4, amp: 0.55, env: [[0, 0], [0.25, 1], [0.32, 0.2], [0.34, 0]] },
  { k: 'crowd', at: 0.18, n: 9, dur: 0.5, spread: 0.06, f0: 300, f1: 420, fSpread: 0.25, formants: AAH_F, amp: 0.7, att: 0.08, breath: 0.3 },
], { sat: 1.3, tail: 50 });

// ----------------------------------------------------------------------------
// stunt popup stings: tier 0 a blip, 1 a run of three, 2 a flourish with a brass chord, 3 a full fanfare with a crash

const cymbal = (at, dur, amp) => ({ k: 'roar', at, dur, amp, fA: 14000, fB: 5000, tauF: 0.4, hp: 5000, q: 0.7, modFc: 100, modDepth: 0.6 });
const G4 = 392; const B4 = 493.9; const D5 = 587.3; const G5 = 784; const B5 = 987.8; const D6 = 1174.7; const G6 = 1568;

const pop0 = recipe(0.5, [
  bell(0, G5, 0.1, 0.6, 1.0),
  bell(0.07, D6, 0.14, 0.6, 1.0),
  { k: 'crack', amp: 0.4, dur: 0.003, hp: 3500, snap: 0 },
  { k: 'body', f0: 200, f1: 90, tp: 0.02, tau: 0.03, amp: 0.4, dur: 0.08 },
], { sat: 1.2 });

const pop1 = recipe(0.7, [
  bell(0, G5, 0.12, 0.6, 1.1),
  bell(0.065, B5, 0.12, 0.6, 1.1),
  bell(0.13, D6, 0.2, 0.65, 1.1),
  sparkle(0.13, 12, 0.3, 0.15, 5000, 12000),
  { k: 'crack', amp: 0.4, dur: 0.003, hp: 3500, snap: 0 },
  { k: 'body', f0: 180, f1: 80, tp: 0.02, tau: 0.04, amp: 0.5, dur: 0.1 },
], { sat: 1.2 });

const pop2 = recipe(1.0, [
  bell(0, G5, 0.12, 0.55, 1.2),
  bell(0.06, B5, 0.12, 0.55, 1.2),
  bell(0.12, D6, 0.12, 0.55, 1.2),
  bell(0.18, G6, 0.28, 0.65, 1.2),
  brass(0.18, G4, 0.5, 0.45, { rel: 0.3, lp0: 900, lp1: 3800, tau: 0.5 }),
  brass(0.18, D5, 0.5, 0.35, { rel: 0.3, lp0: 900, lp1: 3800, tau: 0.5 }),
  brass(0.18, B5, 0.5, 0.3, { rel: 0.3, lp0: 900, lp1: 3800, tau: 0.5 }),
  sparkle(0.18, 22, 0.55, 0.18, 4000, 12500),
  { k: 'body', at: 0.18, f0: 140, f1: 60, tp: 0.03, tau: 0.1, amp: 0.8, drive: 1.4, dur: 0.3 },
  { k: 'crack', at: 0.18, amp: 0.5, dur: 0.005, hp: 2000, snap: 0.3 },
], { sat: 1.3 });

const pop3 = recipe(1.8, [
  ...[G4, B4, D5, G5, B5, D6, G6].map((f, i) => bell(i * 0.055, f, 0.1 + 0.01 * i, 0.5, 1.2)),
  brass(0.42, 196, 1.0, 0.55, { rel: 0.6, lp0: 1000, lp1: 4500, tau: 0.8, att: 0.015 }),
  brass(0.42, 293.7, 1.0, 0.45, { rel: 0.6, lp0: 1000, lp1: 4500, tau: 0.8, att: 0.015 }),
  brass(0.42, G4, 1.0, 0.45, { rel: 0.6, lp0: 1000, lp1: 4500, tau: 0.8, att: 0.015 }),
  brass(0.42, B4, 1.0, 0.4, { rel: 0.6, lp0: 1000, lp1: 4500, tau: 0.8, att: 0.015 }),
  brass(0.42, D5, 1.0, 0.4, { rel: 0.6, lp0: 1000, lp1: 4500, tau: 0.8, att: 0.015 }),
  bell(0.42, G6, 0.5, 0.4, 1.2),
  cymbal(0.42, 1.2, 0.5),
  { k: 'body', at: 0.42, f0: 130, f1: 46, tp: 0.05, tau: 0.25, amp: 1.1, drive: 1.9, dur: 0.7 },
  { k: 'crack', at: 0.42, amp: 0.6, dur: 0.01, hp: 600, snap: 0.6, snapFc: 2000, snapTau: 0.04 },
  sparkle(0.42, 40, 1.1, 0.2, 3500, 12500),
], { sat: 1.6, tail: 80 });

// ----------------------------------------------------------------------------
// the tally and the interface

// a wooden tally tick; the game steps its pitch up a scale while it rolls
const tickR = recipe(0.09, [
  { k: 'crack', amp: 0.8, dur: 0.002, hp: 3000, snap: 0 },
  { k: 'modal', amp: 0.7, partials: [[1300, 1, 0.012], [2650, 0.5, 0.008], [3900, 0.25, 0.005]] },
  { k: 'body', f0: 700, f1: 420, tp: 0.01, tau: 0.01, amp: 0.3, dur: 0.04 },
], { sat: 1.1, tail: 12 });

// ka-ching: the drawer's clunk, a bright double bell, coins jingling
const cashR = recipe(1.25, [
  { k: 'body', f0: 200, f1: 90, tp: 0.02, tau: 0.04, amp: 0.7, drive: 1.3, dur: 0.12 },
  { k: 'crack', amp: 0.7, dur: 0.005, hp: 1500, snap: 0.3, snapFc: 2500 },
  { k: 'modal', amp: 0.4, partials: [[800, 0.4, 0.03], [1900, 0.3, 0.02]] },
  { k: 'modal', at: 0.09, amp: 0.7, partials: [[3136, 1, 0.55], [3160, 0.8, 0.5], [4700, 0.5, 0.35], [6272, 0.4, 0.25], [8400, 0.15, 0.12]] },
  { k: 'modal', at: 0.21, amp: 0.55, partials: [[3136, 1, 0.5], [3160, 0.8, 0.45], [4700, 0.5, 0.3], [6272, 0.4, 0.2]] },
  { k: 'tinkle', at: 0.12, n: 22, t0: 0, t1: 0.8, lam: 0.4, amp: 0.22, fLo: 3500, fHi: 9000, tauLo: 0.02, tauHi: 0.06 },
  { k: 'whoosh', at: 0.12, dur: 0.22, f0: 500, f1: 1200, q: 0.8, amp: 0.15, env: [[0, 0], [0.05, 1], [0.22, 0]] },
], { sat: 1.3 });

// a button
const clickR = recipe(0.07, [
  { k: 'crack', amp: 0.9, dur: 0.002, hp: 2500, snap: 0 },
  { k: 'tone', wave: 'sine', f0: 1500, f1: 900, tp: 0.01, dur: 0.05, att: 0.001, tau: 0.012, amp: 0.5, jit: 0 },
  { k: 'body', f0: 400, f1: 220, tp: 0.01, tau: 0.01, amp: 0.4, dur: 0.05 },
], { sat: 1.1, tail: 10 });

// a lock springing open, a rising run of bells and a big brass chord
const lockClick = (at, f) => [
  { k: 'crack', at, amp: 0.9, dur: 0.003, hp: 2200, snap: 0 },
  { k: 'modal', at, amp: 0.5, partials: [[f, 0.6, 0.012], [f * 1.8, 0.4, 0.008], [f * 2.7, 0.2, 0.005]] },
];
const unlockR = recipe(1.9, [
  ...lockClick(0, 900),
  ...lockClick(0.07, 1200),
  ...[G4, B4, D5, G5, B5, D6, G6].map((f, i) => bell(0.22 + i * 0.07, f, 0.12 + 0.015 * i, 0.5, 1.2)),
  brass(0.75, 196, 1.0, 0.5, { rel: 0.5, lp0: 900, lp1: 4200, tau: 1.0, att: 0.04 }),
  brass(0.75, 294, 1.0, 0.4, { rel: 0.5, lp0: 900, lp1: 4200, tau: 1.0, att: 0.04 }),
  brass(0.75, G4, 1.0, 0.4, { rel: 0.5, lp0: 900, lp1: 4200, tau: 1.0, att: 0.04 }),
  brass(0.75, B4, 1.0, 0.35, { rel: 0.5, lp0: 900, lp1: 4200, tau: 1.0, att: 0.04 }),
  brass(0.75, D5, 1.0, 0.35, { rel: 0.5, lp0: 900, lp1: 4200, tau: 1.0, att: 0.04 }),
  bell(0.75, G6, 0.5, 0.4, 1.2),
  sparkle(0.75, 36, 1.0, 0.2, 3500, 12500),
  { k: 'body', at: 0.75, f0: 130, f1: 50, tp: 0.04, tau: 0.18, amp: 0.9, drive: 1.6, dur: 0.5 },
  cymbal(0.75, 0.9, 0.3),
], { sat: 1.4, tail: 80 });

// target missed: a muted trombone, wah wah wah waaah
const wah = (at, f, dur, amp, o = {}) => ({
  k: 'tone', at, wave: 'saw', f0: f, f1: f * (o.sag ?? 0.97), det: 14, dur, att: 0.03, tau: Infinity, rel: 0.08, amp, lp: [350, 1700, 0.08], q: 2.2, drive: 1.3, vib: o.vib, jit: 0,
});
const failR = recipe(2.1, [
  wah(0, 233.1, 0.42, 0.6),
  wah(0.45, 220, 0.42, 0.6),
  wah(0.9, 207.7, 0.42, 0.6),
  wah(1.35, 196, 0.7, 0.65, { sag: 0.84, vib: [5.5, 0.025, 0.25] }),
], { sat: 1.3, tail: 60 });

// target hit: a brass fanfare, a chord and a crash
const winR = recipe(2.2, [
  brass(0, G4, 0.12, 0.55, { rel: 0.05, lp0: 1000, lp1: 4200 }),
  brass(0.15, G4, 0.12, 0.55, { rel: 0.05, lp0: 1000, lp1: 4200 }),
  brass(0.3, G4, 0.12, 0.55, { rel: 0.05, lp0: 1000, lp1: 4200 }),
  brass(0.45, B4, 0.22, 0.6, { rel: 0.06, lp0: 1000, lp1: 4200 }),
  brass(0.72, D5, 0.3, 0.65, { rel: 0.08, lp0: 1000, lp1: 4200 }),
  ...[196, 294, G4, B4, D5, G5].map((f, i) => brass(1.05, f, 0.9, 0.5 - 0.03 * i, { rel: 0.6, lp0: 1100, lp1: 4800, tau: 1.0, att: 0.03 })),
  cymbal(1.05, 1.1, 0.4),
  { k: 'body', at: 1.05, f0: 120, f1: 50, tp: 0.04, tau: 0.2, amp: 1, drive: 1.7, dur: 0.6 },
  { k: 'crack', at: 1.05, amp: 0.5, dur: 0.008, hp: 700, snap: 0.5, snapFc: 2000, snapTau: 0.04 },
  sparkle(1.05, 30, 1.0, 0.18, 3500, 12500),
], { sat: 1.4, tail: 80 });

// ----------------------------------------------------------------------------

export const SFX2 = {
  'boing': def(LO, 2, boingR, -18, 60, 3, 2),
  'cannon.0': def(LO, 2, cannonR(0), -13, 200, 2, 3, { duck: [0.4, 1.2] }),
  'cannon.1': def(LO, 2, cannonR(1), -10, 200, 2, 3, { duck: [0.55, 1.8] }),
  'sling': def(HI, 2, slingR, -20, 150, 2, 2),
  'skid': def(HI, 2, skidR, -24, 140, 2, 1),
  'horn': def(HI, 2, hornR, -20, 250, 2, 2),
  'splash.0': def(HI, 2, splashR(0.35), -26, 60, 3, 1),
  'splash.1': def(HI, 2, splashR(0.8), -21, 100, 3, 2),
  'sizzle': def(HI, 2, sizzleR, -28, 200, 2, 1),
  'crowd.ooh': def(LO, 3, oohR, -21, 300, 3, 2),
  'crowd.cheer': def(LO, 3, cheerR, -21, 300, 3, 2),
  'crowd.gasp': def(LO, 3, gaspR, -21, 300, 3, 2),
  'popup.0': def(HI, 1, pop0, -21.5, 60, 2, 2),
  'popup.1': def(HI, 1, pop1, -19.5, 60, 2, 2),
  'popup.2': def(HI, 1, pop2, -17, 80, 2, 3, { duck: [0.2, 0.6] }),
  'popup.3': def(HI, 1, pop3, -14, 100, 2, 3, { duck: [0.4, 1.4] }),
  'tick': def(HI, 1, tickR, -30, 22, 4, 2),
  'cash': def(HI, 1, cashR, -15, 150, 2, 3),
  'click': def(HI, 1, clickR, -31, 30, 3, 3),
  'unlock': def(HI, 1, unlockR, -15, 500, 1, 3, { duck: [0.5, 2] }),
  'fail': def(HI, 1, failR, -17, 500, 1, 3, { duck: [0.5, 2.2] }),
  'win': def(HI, 1, winR, -15, 500, 1, 3, { duck: [0.5, 2.2] }),
};
