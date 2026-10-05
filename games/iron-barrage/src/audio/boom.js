// Explosions, as recipes of layers (layers.js). Each is rendered for a "size 1"
// shell and played back faster (smaller) or slower (bigger) and quieter or
// louder to suit; see Sound.boom. Every layer sits in the `hi` buffer (crack,
// roar, debris, clods) or the `lo` buffer (thump, rumble, echo), which a far-off
// blast delays slightly. The recipe is the sound's whole character:
//   transient crack -> thump with a pitch drop -> broadband roar that decays
//   -> rumble -> debris rattle and clods coming down -> echo off the hills.
import { seeded, finishPair } from './dsp.js';
import { runLayers } from './layers.js';

// Render a recipe: the layer list may depend on the random stream.
function recipe(dur, build) {
  return function* render(sr, seed) {
    const r = seeded(seed);
    const n = Math.round(dur * sr);
    const hi = new Float32Array(n);
    const lo = new Float32Array(n);
    const layers = typeof build === 'function' ? build(r) : build;
    yield* runLayers(layers, hi, lo, sr, r);
    return yield* finishPair(hi, lo, sr, 0.95, dur > 4 ? 250 : 120);
  };
}

const he = recipe(3.8, [
  { k: 'crack', amp: 0.85, dur: 0.012, hp: 1000, snap: 0.75, snapFc: 3200, snapTau: 0.018 },
  { k: 'body', f0: 125, f1: 40, tp: 0.06, tau: 0.28, amp: 1.0, drive: 2.2 },
  { k: 'roar', dur: 1.7, amp: 0.8, fA: 5200, fB: 230, tauF: 0.32, modFc: 24, modDepth: 0.55, env: [[0, 0], [0.003, 1], [0.05, 0.8], [0.35, 0.38], [1.7, 0.01], [1.704, 0]] },
  { k: 'rumble', at: 0.03, dur: 3.4, amp: 0.95, fc: 190, att: 0.03, tau: 0.85, rollFc: 5, rollDepth: 0.5 },
  { k: 'debris', n: 100, t0: 0.1, t1: 1.9, lam: 0.7, amp: 0.3 },
  { k: 'clods', n: 16, t0: 0.45, t1: 2.5, amp: 0.55 },
  { k: 'echo', taps: [[0.48, 0.34], [1.05, 0.22], [1.75, 0.13]], fc: 560, atk: 0.07, tau: 0.45, amp: 0.9 },
]);

const heavy = recipe(5.6, [
  { k: 'crack', amp: 1.0, dur: 0.016, hp: 800, snap: 0.9, snapFc: 2800, snapTau: 0.03 },
  { k: 'body', f0: 100, f1: 30, tp: 0.09, tau: 0.5, amp: 1.0, drive: 2.6 },
  { k: 'body', at: 0.02, f0: 220, f1: 70, tp: 0.05, tau: 0.16, amp: 0.45, drive: 1.5 },
  { k: 'roar', dur: 2.6, amp: 0.85, fA: 4800, fB: 170, tauF: 0.5, modFc: 20, modDepth: 0.6, env: [[0, 0], [0.004, 1], [0.08, 0.85], [0.6, 0.42], [2.6, 0.01], [2.604, 0]] },
  { k: 'rumble', at: 0.04, dur: 5.0, amp: 1.15, fc: 150, att: 0.04, tau: 1.35, rollFc: 4, rollDepth: 0.55 },
  { k: 'debris', n: 160, t0: 0.12, t1: 2.8, lam: 0.95, amp: 0.3 },
  { k: 'clods', n: 28, t0: 0.5, t1: 3.6, amp: 0.6 },
  { k: 'echo', taps: [[0.58, 0.4], [1.3, 0.28], [2.2, 0.18], [3.3, 0.1]], fc: 520, atk: 0.09, tau: 0.6, amp: 1.1 },
]);

const small = recipe(1.5, [
  { k: 'crack', amp: 0.9, dur: 0.009, hp: 1400, snap: 0.55, snapFc: 3600, snapTau: 0.012 },
  { k: 'body', f0: 210, f1: 72, tp: 0.04, tau: 0.12, amp: 0.9, drive: 1.8 },
  { k: 'roar', dur: 0.6, amp: 0.65, fA: 6000, fB: 420, tauF: 0.14, modFc: 30, modDepth: 0.5, env: [[0, 0], [0.002, 1], [0.03, 0.7], [0.6, 0.01], [0.604, 0]] },
  { k: 'rumble', at: 0.01, dur: 1.2, amp: 0.6, fc: 220, att: 0.01, tau: 0.3, rollFc: 7, rollDepth: 0.4 },
  { k: 'debris', n: 28, t0: 0.05, t1: 0.9, lam: 0.35, amp: 0.3 },
  { k: 'clods', n: 4, t0: 0.25, t1: 1.1, amp: 0.3, fLo: 80, fHi: 190 },
  { k: 'echo', taps: [[0.3, 0.2], [0.65, 0.1]], fc: 700, atk: 0.04, tau: 0.25, amp: 0.75 },
]);

// small sharp pops, called many times quickly
const cluster = recipe(0.6, [
  { k: 'crack', amp: 1.0, dur: 0.008, hp: 1800, snap: 0.5, snapFc: 4200, snapTau: 0.011 },
  { k: 'body', f0: 290, f1: 115, tp: 0.03, tau: 0.06, amp: 0.65, drive: 1.5 },
  { k: 'roar', dur: 0.22, amp: 0.45, fA: 6500, fB: 800, tauF: 0.07, env: [[0, 0], [0.002, 1], [0.03, 0.5], [0.22, 0.01], [0.224, 0]] },
  { k: 'debris', n: 12, t0: 0.03, t1: 0.4, lam: 0.15, amp: 0.25, fLo: 2500, fHi: 7500 },
  { k: 'echo', taps: [[0.15, 0.22]], fc: 800, atk: 0.03, tau: 0.12, amp: 0.6 },
]);

// the airburst: a hard crack, a ripping of air, a mid-heavy crump, fragments pinging down
const air = recipe(3.1, [
  { k: 'crack', amp: 1.0, dur: 0.02, hp: 1600, snap: 0.9, snapFc: 4200, snapTau: 0.03 },
  { k: 'roar', dur: 0.5, amp: 0.65, fA: 9000, fB: 1200, tauF: 0.1, hp: 1500, modFc: 40, modDepth: 0.4, env: [[0, 0], [0.002, 1], [0.1, 0.5], [0.5, 0.01], [0.504, 0]] },
  { k: 'body', f0: 190, f1: 62, tp: 0.05, tau: 0.16, amp: 0.8, drive: 1.8 },
  { k: 'roar', at: 0.03, dur: 1.6, amp: 0.55, fA: 3500, fB: 300, tauF: 0.3, modFc: 18, modDepth: 0.55, env: [[0, 0], [0.01, 1], [0.2, 0.6], [1.6, 0.01], [1.604, 0]] },
  { k: 'rumble', at: 0.05, dur: 2.6, amp: 0.7, fc: 200, att: 0.05, tau: 0.6, rollFc: 5, rollDepth: 0.5 },
  { k: 'debris', n: 34, t0: 0.15, t1: 1.9, lam: 0.8, amp: 0.4, fLo: 2500, fHi: 7000 },
  { k: 'echo', taps: [[0.55, 0.3], [1.2, 0.18], [1.9, 0.1]], fc: 600, atk: 0.08, tau: 0.45, amp: 0.9 },
]);

// a fireball: a whoomph, a long mid roar that swells then flickers, then crackling
const napalm = recipe(5.0, [
  { k: 'crack', amp: 0.4, dur: 0.02, hp: 500, snap: 1.0, snapFc: 1500, snapTau: 0.05 },
  { k: 'body', f0: 64, f1: 36, tp: 0.25, tau: 0.65, amp: 1.0, drive: 1.5, attack: 0.05 },
  { k: 'roar', dur: 4.4, amp: 0.85, fA: 1500, fB: 420, tauF: 1.3, q: 0.9, modFc: 12, modDepth: 0.6, env: [[0, 0], [0.09, 1], [0.9, 0.85], [2.6, 0.32], [4.4, 0.01], [4.404, 0]] },
  { k: 'roar', dur: 1.4, amp: 0.3, fA: 7000, fB: 1500, tauF: 0.4, hp: 1200, modFc: 25, modDepth: 0.5, env: [[0, 0], [0.12, 1], [0.5, 0.5], [1.4, 0.01], [1.404, 0]] },
  { k: 'rumble', at: 0.02, dur: 4.4, amp: 0.8, fc: 100, att: 0.15, tau: 1.3, rollFc: 4, rollDepth: 0.5 },
  { k: 'debris', n: 170, t0: 0.5, t1: 4.4, lam: 2.4, amp: 0.3, fLo: 2200, fHi: 8000 },
  { k: 'echo', taps: [[0.7, 0.2], [1.5, 0.12]], fc: 400, atk: 0.1, tau: 0.5, amp: 0.75 },
]);

// a muffled thud from underground, then the ground erupts
const buster = recipe(5.4, [
  { k: 'body', f0: 78, f1: 30, tp: 0.1, tau: 0.3, amp: 0.75, drive: 1.0 },
  { k: 'roar', dur: 0.35, amp: 0.3, fA: 420, fB: 150, tauF: 0.1, env: [[0, 0], [0.004, 1], [0.35, 0.01], [0.354, 0]] },
  { k: 'rumble', dur: 0.9, amp: 0.45, fc: 95, att: 0.01, tau: 0.3, rollFc: 8, rollDepth: 0.3 },
  { k: 'crack', at: 0.55, amp: 0.85, dur: 0.016, hp: 500, snap: 0.9, snapFc: 1900, snapTau: 0.035 },
  { k: 'body', at: 0.55, f0: 88, f1: 27, tp: 0.09, tau: 0.55, amp: 1.0, drive: 2.0 },
  { k: 'roar', at: 0.55, dur: 2.5, amp: 0.85, fA: 3000, fB: 160, tauF: 0.45, modFc: 16, modDepth: 0.6, env: [[0, 0], [0.01, 1], [0.12, 0.8], [0.7, 0.4], [2.5, 0.01], [2.504, 0]] },
  { k: 'rumble', at: 0.55, dur: 4.6, amp: 1.2, fc: 140, att: 0.06, tau: 1.2, rollFc: 4, rollDepth: 0.55 },
  { k: 'clods', at: 0.55, n: 46, t0: 0.2, t1: 3.2, amp: 0.55, fLo: 50, fHi: 130 },
  { k: 'debris', at: 0.55, n: 90, t0: 0.15, t1: 3.0, lam: 1.1, amp: 0.3, fLo: 600, fHi: 3500 },
  { k: 'echo', at: 0.55, taps: [[0.55, 0.32], [1.2, 0.2], [2.0, 0.12]], fc: 440, atk: 0.09, tau: 0.5, amp: 0.9 },
]);

// the big one: crack, pressure wave, a roar that sweeps down for seconds, a rumble that rolls for eight
const nuke = recipe(10.6, [
  { k: 'crack', amp: 0.9, dur: 0.02, hp: 600, snap: 0.9, snapFc: 2600, snapTau: 0.06 },
  { k: 'body', at: 0.02, f0: 62, f1: 16, tp: 0.45, tau: 1.5, amp: 1.0, drive: 3.0, attack: 0.01 },
  { k: 'body', at: 0.4, f0: 48, f1: 20, tp: 0.3, tau: 0.8, amp: 0.6, drive: 2.4, attack: 0.02 },
  { k: 'roar', dur: 6.5, amp: 1.4, fA: 4200, fB: 90, tauF: 1.5, modFc: 9, modDepth: 0.6, env: [[0, 0], [0.004, 1], [0.5, 0.9], [2.5, 0.5], [6.5, 0.01], [6.504, 0]] },
  { k: 'roar', dur: 8.0, amp: 0.9, fA: 700, fB: 120, tauF: 3.0, modFc: 4, modDepth: 0.7, env: [[0, 0], [0.3, 0.8], [1.6, 1], [5, 0.4], [8, 0.01], [8.004, 0]] },
  { k: 'rumble', dur: 10.4, amp: 1.6, fc: 75, q: 1.1, att: 0.25, tau: 4.2, rollFc: 3.5, rollDepth: 0.6 },
  { k: 'rumble', at: 0.1, dur: 9.5, amp: 1.5, fc: 170, att: 0.3, tau: 3.4, rollFc: 6, rollDepth: 0.6 },
  { k: 'roar', at: 2.5, dur: 5.0, amp: 0.25, fA: 500, fB: 250, tauF: 3, env: [[0, 0], [1.5, 1], [3, 0.4], [5, 0.01], [5.004, 0]] },
  { k: 'debris', n: 220, t0: 1.2, t1: 9.5, lam: 3.4, amp: 0.5, fLo: 800, fHi: 4500 },
  { k: 'clods', n: 60, t0: 1.5, t1: 9.5, lam: 3.0, amp: 0.8, fLo: 40, fHi: 110 },
  { k: 'echo', taps: [[0.9, 0.45], [1.9, 0.38], [3.1, 0.3], [4.6, 0.22], [6.3, 0.14]], fc: 360, atk: 0.12, tau: 0.9, amp: 1.3 },
]);

// A bomb off an aircraft: a deep, punchy ground blast with no gun crack, only a
// dull slap of air. Heavy low end: a long sub thump and a doubled ground pulse,
// a dark roar, a deep rumble, big clods coming down.
const bomb = recipe(4.8, [
  { k: 'crack', amp: 0.5, dur: 0.02, hp: 300, snap: 1.0, snapFc: 1500, snapTau: 0.04 },
  { k: 'body', f0: 92, f1: 27, tp: 0.075, tau: 0.46, amp: 1.0, drive: 2.5, attack: 0.002 },
  { k: 'body', at: 0.012, f0: 160, f1: 55, tp: 0.05, tau: 0.15, amp: 0.7, drive: 1.7 },
  { k: 'body', at: 0.13, f0: 62, f1: 24, tp: 0.12, tau: 0.5, amp: 0.55, drive: 1.8, attack: 0.01 },
  { k: 'roar', dur: 2.3, amp: 1.0, fA: 2800, fB: 150, tauF: 0.45, modFc: 16, modDepth: 0.6, env: [[0, 0], [0.005, 1], [0.1, 0.85], [0.6, 0.4], [2.3, 0.01], [2.304, 0]] },
  { k: 'rumble', at: 0.02, dur: 4.6, amp: 1.3, fc: 118, att: 0.03, tau: 1.3, rollFc: 4, rollDepth: 0.55 },
  { k: 'clods', n: 34, t0: 0.35, t1: 3.4, amp: 0.65, fLo: 45, fHi: 130 },
  { k: 'debris', n: 90, t0: 0.15, t1: 2.8, lam: 0.9, amp: 0.26, fLo: 600, fHi: 4200 },
  { k: 'echo', taps: [[0.55, 0.38], [1.25, 0.26], [2.1, 0.16], [3.1, 0.09]], fc: 440, atk: 0.09, tau: 0.55, amp: 1.1 },
]);

// A missile warhead: a sharp, bright high-explosive crack, a short hard punch, and
// the rest of the motor spitting and fizzing out in a bright, flickering tail.
const missile = recipe(3.2, [
  { k: 'crack', amp: 1.0, dur: 0.01, hp: 2200, snap: 0.55, snapFc: 5200, snapTau: 0.014 },
  { k: 'body', f0: 175, f1: 62, tp: 0.04, tau: 0.17, amp: 0.85, drive: 2.0 },
  { k: 'roar', dur: 0.9, amp: 0.75, fA: 8000, fB: 520, tauF: 0.16, hp: 500, modFc: 46, modDepth: 0.5, env: [[0, 0], [0.002, 1], [0.04, 0.7], [0.9, 0.01], [0.904, 0]] },
  { k: 'rumble', at: 0.02, dur: 2.2, amp: 0.55, fc: 210, att: 0.02, tau: 0.5, rollFc: 5, rollDepth: 0.5 },
  { k: 'roar', at: 0.06, dur: 1.9, amp: 0.38, fA: 10500, fB: 3800, tauF: 0.6, hp: 3200, modFc: 90, modDepth: 0.92, env: [[0, 0], [0.05, 0.8], [0.18, 1], [0.7, 0.5], [1.9, 0.01], [1.904, 0]] },
  { k: 'roar', at: 0.1, dur: 1.3, amp: 0.3, fA: 4200, fB: 1500, tauF: 0.4, hp: 1300, modFc: 28, modDepth: 0.85, env: [[0, 0], [0.04, 1], [0.4, 0.55], [1.3, 0.01], [1.304, 0]] },
  { k: 'debris', n: 120, t0: 0.08, t1: 1.9, lam: 0.55, amp: 0.3, fLo: 3200, fHi: 9000, grit: 0.4 },
  { k: 'echo', taps: [[0.4, 0.28], [0.9, 0.18], [1.55, 0.1]], fc: 900, atk: 0.06, tau: 0.38, amp: 0.85 },
]);

// A sabot dart striking: a double supersonic snap, a hard short punch, a steel clang
// that rings for a moment, a spray of sparks and spall. Hardly any blast body, it
// plays alongside hit('metal') on a tank, and on a miss it is a hard punch into earth.
const sabot = recipe(1.6, [
  { k: 'crack', amp: 1.0, dur: 0.004, hp: 3200, snap: 0.3, snapFc: 6000, snapTau: 0.006 },
  { k: 'crack', at: 0.0045, amp: 0.7, dur: 0.005, hp: 2400, snap: 0.5, snapFc: 4500, snapTau: 0.01 },
  { k: 'body', f0: 150, f1: 58, tp: 0.025, tau: 0.075, amp: 0.95, drive: 2.2 },
  { k: 'roar', dur: 0.2, amp: 0.45, fA: 5500, fB: 700, tauF: 0.045, hp: 800, env: [[0, 0], [0.001, 1], [0.03, 0.55], [0.2, 0.01], [0.204, 0]] },
  { k: 'plate', at: 0.0015, base: 330, amp: 0.5, tau: 0.3 },
  { k: 'plate', at: 0.0015, base: 1180, amp: 0.2, tau: 0.12, n: 5 },
  { k: 'modal', to: 'lo', amp: 0.35, partials: [[140, 0.7, 0.14], [260, 0.45, 0.1]] },
  { k: 'clods', n: 3, t0: 0.06, t1: 0.5, amp: 0.3, fLo: 70, fHi: 170 },
  { k: 'debris', n: 38, t0: 0.012, t1: 0.7, lam: 0.2, amp: 0.3, fLo: 3000, fHi: 8500, grit: 0.35 },
  { k: 'echo', taps: [[0.26, 0.2], [0.6, 0.1]], fc: 950, atk: 0.04, tau: 0.22, amp: 0.7 },
]);

// A rolling bomb going off: a medium blast, then a long gravelly tail of stones and grit
// pattering and sliding down, low gravel thuds under it.
const roller = recipe(4.4, [
  { k: 'crack', amp: 0.75, dur: 0.013, hp: 850, snap: 0.8, snapFc: 3000, snapTau: 0.022 },
  { k: 'body', f0: 118, f1: 42, tp: 0.06, tau: 0.3, amp: 1.0, drive: 2.2 },
  { k: 'roar', dur: 1.5, amp: 0.8, fA: 4400, fB: 240, tauF: 0.3, modFc: 24, modDepth: 0.55, env: [[0, 0], [0.003, 1], [0.05, 0.8], [0.4, 0.38], [1.5, 0.01], [1.504, 0]] },
  { k: 'rumble', at: 0.03, dur: 3.2, amp: 0.85, fc: 175, att: 0.03, tau: 0.75, rollFc: 5, rollDepth: 0.5 },
  { k: 'debris', n: 230, t0: 0.08, t1: 3.6, lam: 1.25, amp: 0.4, fLo: 500, fHi: 3400, grit: 0.8, gritLen: 2.6 },
  { k: 'debris', n: 120, t0: 0.5, t1: 3.9, lam: 1.5, amp: 0.28, fLo: 250, fHi: 1500, grit: 0.9, gritLen: 4 },
  { k: 'clods', n: 36, t0: 0.4, t1: 3.8, lam: 1.3, amp: 0.5, fLo: 85, fHi: 230 },
  { k: 'echo', taps: [[0.5, 0.28], [1.1, 0.18], [1.8, 0.1]], fc: 540, atk: 0.07, tau: 0.45, amp: 0.85 },
]);

// ammunition cooking off: a fire's roar with bangs of every size going off in it
const cookoff = recipe(5.2, (r) => {
  const L = [
    { k: 'roar', dur: 4.8, amp: 0.32, fA: 900, fB: 420, tauF: 2.0, modFc: 14, modDepth: 0.7, env: [[0, 0], [0.2, 1], [1.5, 0.8], [3.5, 0.3], [4.8, 0.01], [4.804, 0]] },
    { k: 'crack', amp: 0.7, dur: 0.012, hp: 1200, snap: 0.6, snapFc: 3000, snapTau: 0.016 },
    { k: 'body', f0: 150, f1: 55, tp: 0.06, tau: 0.22, amp: 0.8, drive: 1.8 },
  ];
  const times = [];
  for (let k = 0; k < 34; k++) times.push(0.2 + 4.3 * Math.pow(r(), 1.5));
  times.sort((a, b) => a - b);
  for (const t of times) {
    const u = r();
    if (u < 0.6) {
      // a pop
      const a = 0.25 + 0.4 * r();
      L.push({ k: 'crack', at: t, amp: a, dur: 0.007, hp: 1500 + 1500 * r(), snap: 0.4, snapFc: 3500, snapTau: 0.01 });
      L.push({ k: 'body', at: t, f0: 220 + 120 * r(), f1: 90, tp: 0.025, tau: 0.04 + 0.03 * r(), amp: a * 0.8, drive: 1.3 });
    } else if (u < 0.88) {
      // a bang
      const a = 0.45 + 0.35 * r();
      L.push({ k: 'crack', at: t, amp: a, dur: 0.01, hp: 1000, snap: 0.6, snapFc: 3000, snapTau: 0.015 });
      L.push({ k: 'body', at: t, f0: 140 + 40 * r(), f1: 52, tp: 0.05, tau: 0.12 + 0.08 * r(), amp: a, drive: 1.7 });
      L.push({ k: 'roar', at: t, dur: 0.4, amp: a * 0.5, fA: 4500, fB: 400, tauF: 0.1, env: [[0, 0], [0.003, 1], [0.05, 0.6], [0.4, 0.01], [0.404, 0]] });
    } else {
      // a ping of something flying off
      const f = 2800 + 1800 * r();
      L.push({ k: 'modal', at: t, amp: 0.25, partials: [[f, 1, 0.09], [f * 1.5, 0.5, 0.06]] });
    }
  }
  // a few real ones
  for (const t of [1.3, 2.7, 3.5]) {
    const a = 0.7 + 0.25 * r();
    L.push({ k: 'crack', at: t, amp: a, dur: 0.014, hp: 800, snap: 0.8, snapFc: 2800, snapTau: 0.025 });
    L.push({ k: 'body', at: t, f0: 105, f1: 38, tp: 0.07, tau: 0.34, amp: a, drive: 2.2 });
    L.push({ k: 'roar', at: t, dur: 0.9, amp: a * 0.55, fA: 3800, fB: 260, tauF: 0.2, modFc: 22, modDepth: 0.5, env: [[0, 0], [0.003, 1], [0.1, 0.55], [0.9, 0.01], [0.904, 0]] });
    L.push({ k: 'debris', at: t, n: 18, t0: 0.05, t1: 1.0, lam: 0.4, amp: 0.3 });
  }
  L.push({ k: 'rumble', at: 0.03, dur: 4.6, amp: 0.6, fc: 150, att: 0.05, tau: 1.2, rollFc: 5, rollDepth: 0.5 });
  L.push({ k: 'echo', taps: [[0.6, 0.25], [1.4, 0.18], [2.4, 0.12]], fc: 480, atk: 0.08, tau: 0.5, amp: 0.75 });
  return L;
});

// sr, how many variants, the render, and how loud one plays (see Sound.boom)
export const BOOMS = {
  he: { sr: 22050, variants: 3, render: he, send: 0.34 },
  heavy: { sr: 22050, variants: 3, render: heavy, send: 0.4 },
  small: { sr: 22050, variants: 3, render: small, send: 0.28 },
  cluster: { sr: 22050, variants: 4, render: cluster, send: 0.2 },
  air: { sr: 22050, variants: 3, render: air, send: 0.4 },
  napalm: { sr: 22050, variants: 2, render: napalm, send: 0.3 },
  buster: { sr: 22050, variants: 2, render: buster, send: 0.34 },
  nuke: { sr: 16000, variants: 1, render: nuke, send: 0.35 },
  cookoff: { sr: 22050, variants: 3, render: cookoff, send: 0.3 },
  bomb: { sr: 22050, variants: 2, render: bomb, send: 0.4 },
  missile: { sr: 22050, variants: 2, render: missile, send: 0.34 },
  sabot: { sr: 22050, variants: 3, render: sabot, send: 0.26 },
  roller: { sr: 22050, variants: 2, render: roller, send: 0.34 },
};
