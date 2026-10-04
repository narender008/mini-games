// Gun, launcher and motor sounds for fire(kind, x): recipes of layers
// (layers.js). A shot is a sharp crack, a chest thump (sub around 40 to 60 Hz),
// a short mechanical recoil clank and a long outdoor echo off distant hills.
import { seeded, finishPair } from './dsp.js';
import { runLayers } from './layers.js';

function recipe(dur, layers, tailMs = 100) {
  return function* render(sr, seed) {
    const r = seeded(seed);
    const n = Math.round(dur * sr);
    const hi = new Float32Array(n);
    const lo = new Float32Array(n);
    yield* runLayers(layers, hi, lo, sr, r);
    return yield* finishPair(hi, lo, sr, 0.95, tailMs);
  };
}

const cannon = recipe(3.2, [
  { k: 'crack', amp: 1.0, dur: 0.008, hp: 1200, snap: 0.65, snapFc: 4000, snapTau: 0.012 },
  { k: 'body', f0: 105, f1: 48, tp: 0.05, tau: 0.2, amp: 0.95, drive: 2.0 },
  { k: 'body', at: 0.003, f0: 56, f1: 44, tp: 0.1, tau: 0.16, amp: 0.55 },
  { k: 'roar', dur: 0.4, amp: 0.5, fA: 4200, fB: 420, tauF: 0.1, modFc: 40, modDepth: 0.35, env: [[0, 0], [0.002, 1], [0.04, 0.6], [0.4, 0.01], [0.404, 0]] },
  { k: 'crack', at: 0.09, amp: 0.22, dur: 0.004, hp: 2000, snap: 0 },
  { k: 'modal', at: 0.09, amp: 0.3, partials: [[820, 0.5, 0.06], [1650, 0.4, 0.05], [2480, 0.3, 0.035], [3900, 0.2, 0.02]] },
  { k: 'echo', taps: [[0.36, 0.3], [0.82, 0.2], [1.45, 0.12]], fc: 760, atk: 0.06, tau: 0.38, amp: 1.4 },
]);

const heavy = recipe(4.2, [
  { k: 'crack', amp: 1.0, dur: 0.012, hp: 900, snap: 0.85, snapFc: 3000, snapTau: 0.02 },
  { k: 'body', f0: 88, f1: 36, tp: 0.07, tau: 0.38, amp: 1.0, drive: 2.4 },
  { k: 'body', at: 0.004, f0: 50, f1: 38, tp: 0.12, tau: 0.3, amp: 0.6 },
  { k: 'roar', dur: 0.7, amp: 0.6, fA: 3800, fB: 260, tauF: 0.16, modFc: 30, modDepth: 0.4, env: [[0, 0], [0.003, 1], [0.06, 0.65], [0.7, 0.01], [0.704, 0]] },
  { k: 'modal', at: 0.1, amp: 0.3, partials: [[510, 0.6, 0.12], [1100, 0.5, 0.08], [1750, 0.3, 0.05], [2600, 0.2, 0.03]] },
  { k: 'modal', at: 0.24, amp: 0.4, to: 'lo', partials: [[150, 0.7, 0.09], [330, 0.5, 0.07], [690, 0.3, 0.05]] },
  { k: 'echo', taps: [[0.45, 0.36], [1.0, 0.26], [1.8, 0.16], [2.7, 0.08]], fc: 700, atk: 0.07, tau: 0.5, amp: 1.5 },
], 160);

// a hollow thump out of a tube, no real crack
const mortar = recipe(2.4, [
  { k: 'body', f0: 165, f1: 70, tp: 0.04, tau: 0.16, amp: 1.0, drive: 1.6 },
  { k: 'crack', amp: 0.35, dur: 0.01, hp: 600, snap: 0.9, snapFc: 1800, snapTau: 0.02 },
  { k: 'modal', amp: 0.35, to: 'lo', partials: [[210, 1, 0.1], [420, 0.5, 0.06], [640, 0.3, 0.04]] },
  { k: 'roar', dur: 0.22, amp: 0.4, fA: 1800, fB: 400, tauF: 0.06, env: [[0, 0], [0.005, 1], [0.22, 0.01], [0.224, 0]] },
  { k: 'echo', taps: [[0.34, 0.24], [0.8, 0.13]], fc: 640, atk: 0.06, tau: 0.3, amp: 1.1 },
]);

// ignition thump and the whoosh of the motor catching, the rest is rocket()
const missile = recipe(2.4, [
  { k: 'body', f0: 130, f1: 62, tp: 0.06, tau: 0.13, amp: 0.5, drive: 1.3 },
  { k: 'crack', amp: 0.28, dur: 0.01, hp: 700, snap: 0.5, snapFc: 2400, snapTau: 0.02 },
  { k: 'roar', dur: 2.2, amp: 0.9, fA: 3800, fB: 800, tauF: 0.9, hp: 350, modFc: 45, modDepth: 0.4, env: [[0, 0], [0.12, 1], [0.5, 0.75], [2.2, 0.01], [2.204, 0]] },
  { k: 'roar', dur: 1.8, amp: 0.55, fA: 900, fB: 280, tauF: 0.7, att: 0.1, modFc: 30, modDepth: 0.5, env: [[0, 0], [0.1, 1], [0.5, 0.8], [1.8, 0.01], [1.804, 0]] },
  { k: 'echo', taps: [[0.4, 0.14], [0.95, 0.08]], fc: 700, atk: 0.07, tau: 0.3, amp: 0.8 },
]);

// a hypervelocity round: a double crack, a ring of metal, a long hard echo
const sabot = recipe(3.4, [
  { k: 'crack', amp: 1.0, dur: 0.006, hp: 2500, snap: 0.4, snapFc: 5000, snapTau: 0.01 },
  { k: 'crack', at: 0.013, amp: 0.8, dur: 0.008, hp: 2000, snap: 0.5, snapFc: 4500, snapTau: 0.012 },
  { k: 'body', f0: 95, f1: 44, tp: 0.05, tau: 0.17, amp: 0.85, drive: 2.0 },
  { k: 'modal', at: 0.01, amp: 0.22, partials: [[3100, 0.25, 0.12], [4700, 0.2, 0.08], [6300, 0.12, 0.05]] },
  { k: 'roar', at: 0.02, dur: 0.3, amp: 0.4, fA: 5000, fB: 700, tauF: 0.07, env: [[0, 0], [0.002, 1], [0.3, 0.01], [0.304, 0]] },
  { k: 'roar', at: 0.05, dur: 0.3, amp: 0.18, fA: 4200, fB: 1800, tauF: 0.12, hp: 1500, q: 3, env: [[0, 0], [0.03, 1], [0.3, 0.01], [0.304, 0]] },
  { k: 'echo', taps: [[0.4, 0.3], [0.9, 0.22], [1.6, 0.14], [2.4, 0.07]], fc: 900, atk: 0.05, tau: 0.42, amp: 1.3 },
]);

// a soft thunk and the hiss of a flare lifting away
const flare = recipe(2.0, [
  { k: 'body', f0: 190, f1: 90, tp: 0.04, tau: 0.08, amp: 0.7, drive: 1.3 },
  { k: 'crack', amp: 0.3, dur: 0.01, hp: 900, snap: 0.6, snapFc: 3000, snapTau: 0.015 },
  { k: 'roar', dur: 1.0, amp: 0.32, fA: 5500, fB: 1500, tauF: 0.4, hp: 1800, modFc: 60, modDepth: 0.5, env: [[0, 0], [0.12, 1], [0.4, 0.6], [1.0, 0.01], [1.004, 0]] },
  { k: 'debris', at: 0.05, n: 26, t0: 0.1, t1: 0.9, lam: 0.5, amp: 0.2, fLo: 3000, fHi: 8000 },
  { k: 'echo', taps: [[0.3, 0.1]], fc: 800, atk: 0.05, tau: 0.2, amp: 0.8 },
]);

// one round of a machine gun (call it once per round)
const mg = recipe(0.8, [
  { k: 'crack', amp: 1.0, dur: 0.006, hp: 1800, snap: 0.6, snapFc: 5000, snapTau: 0.008 },
  { k: 'body', f0: 240, f1: 115, tp: 0.025, tau: 0.035, amp: 0.55, drive: 1.5 },
  { k: 'roar', dur: 0.12, amp: 0.35, fA: 5500, fB: 900, tauF: 0.04, env: [[0, 0], [0.002, 1], [0.12, 0.01], [0.124, 0]] },
  { k: 'modal', at: 0.16, amp: 0.1, partials: [[3400, 1, 0.04], [5200, 0.4, 0.02]] },
  { k: 'echo', taps: [[0.13, 0.2], [0.32, 0.1]], fc: 1000, atk: 0.03, tau: 0.15, amp: 1.0 },
], 60);

export const FIRES = {
  cannon: { sr: 22050, variants: 3, render: cannon, send: 0.34 },
  heavy: { sr: 22050, variants: 3, render: heavy, send: 0.4 },
  mortar: { sr: 22050, variants: 3, render: mortar, send: 0.3 },
  missile: { sr: 22050, variants: 2, render: missile, send: 0.3 },
  sabot: { sr: 22050, variants: 3, render: sabot, send: 0.36 },
  flare: { sr: 22050, variants: 2, render: flare, send: 0.25 },
  mg: { sr: 22050, variants: 4, render: mg, send: 0.22 },
};
