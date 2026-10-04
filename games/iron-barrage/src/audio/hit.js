// Impact sounds for hit(kind, x, size): armour struck by a shell, a ricochet,
// earth and metal coming down, a gory slap, a tank landing, an energy shield,
// a repair, a parachute opening. Recipes of layers (layers.js); the debris is
// a scatter of pings of its own.
import { seeded, finishPair, damped } from './dsp.js';
import { runLayers, plate, when } from './layers.js';

function recipe(dur, build, tailMs = 60) {
  return function* render(sr, seed) {
    const r = seeded(seed);
    const n = Math.round(dur * sr);
    const hi = new Float32Array(n);
    const lo = new Float32Array(n);
    const layers = typeof build === 'function' ? build(r) : build;
    yield* runLayers(layers, hi, lo, sr, r);
    return yield* finishPair(hi, lo, sr, 0.95, tailMs);
  };
}

// a shell strikes armour: a hard tick, a heavy thud, the plate ringing, the hull booming under it
const metal = recipe(1.9, [
  { k: 'crack', amp: 0.7, dur: 0.004, hp: 2500, snap: 0 },
  { k: 'roar', dur: 0.07, amp: 0.45, fA: 2600, fB: 600, tauF: 0.02, env: [[0, 0], [0.001, 1], [0.07, 0.01], [0.074, 0]] },
  { k: 'body', f0: 95, f1: 58, tp: 0.03, tau: 0.08, amp: 0.8, drive: 1.4 },
  { k: 'plate', at: 0.001, base: 215, amp: 0.55, tau: 0.55 },
  { k: 'plate', at: 0.075, base: 172, amp: 0.26, tau: 0.4, n: 6 },
  { k: 'modal', to: 'lo', amp: 0.4, partials: [[120, 0.6, 0.25], [185, 0.4, 0.18]] },
  { k: 'echo', taps: [[0.22, 0.1]], fc: 700, atk: 0.04, tau: 0.2, amp: 0.4 },
], 200);

// a glancing blow: the scrape, a falling whine, a ping
const ricochet = recipe(1.0, [
  { k: 'crack', amp: 0.6, dur: 0.004, hp: 3000, snap: 0 },
  { k: 'roar', dur: 0.14, amp: 0.5, fA: 9500, fB: 3000, tauF: 0.05, hp: 2500, modFc: 120, modDepth: 0.6, env: [[0, 0], [0.002, 1], [0.05, 0.6], [0.14, 0.01], [0.144, 0]] },
  { k: 'body', to: 'hi', f0: 4000, f1: 1350, tp: 0.2, tau: 0.3, amp: 0.45, attack: 0.004, dur: 0.9 },
  { k: 'body', to: 'hi', at: 0.012, f0: 2300, f1: 900, tp: 0.18, tau: 0.22, amp: 0.2, attack: 0.004, dur: 0.7 },
  { k: 'modal', amp: 0.3, partials: [[2900, 0.6, 0.1], [4300, 0.3, 0.06]] },
  { k: 'echo', taps: [[0.28, 0.08]], fc: 1500, atk: 0.04, tau: 0.15, amp: 0.3 },
]);

// clods and gravel landing
const dirt = recipe(1.6, [
  { k: 'roar', dur: 0.35, amp: 0.4, fA: 700, fB: 200, tauF: 0.1, env: [[0, 0], [0.004, 1], [0.35, 0.01], [0.354, 0]] },
  { k: 'clods', n: 9, t0: 0.0, t1: 1.1, lam: 0.4, amp: 0.8, fLo: 70, fHi: 150 },
  { k: 'debris', n: 34, t0: 0.02, t1: 1.2, lam: 0.45, amp: 0.3, fLo: 500, fHi: 2800 },
  { k: 'body', f0: 90, f1: 45, tp: 0.05, tau: 0.1, amp: 0.4, drive: 1.0 },
]);

// scraps of metal clattering down
function* debrisHit(sr, seed) {
  const r = seeded(seed);
  const dur = 2.2;
  const n = Math.round(dur * sr);
  const hi = new Float32Array(n);
  const lo = new Float32Array(n);
  for (let k = 0; k < 48; k++) {
    const t = when(r, 0.0, 1.9, 0.6);
    const a = (0.12 + 0.55 * r() * r()) * (1 - 0.6 * (t / 1.9));
    const f = 700 + 3000 * r() ** 1.5;
    const at = Math.round(t * sr);
    const tau = 0.02 + 0.07 * r();
    damped(hi, sr, at, f, a, tau, r() * 6);
    damped(hi, sr, at, f * 2.76, a * 0.5, tau * 0.7, r() * 6);
    damped(hi, sr, at, f * 5.4, a * 0.22, tau * 0.5, r() * 6);
    if (k % 8 === 7) yield;
  }
  for (let k = 0; k < 4; k++) {
    const t = 0.05 + 1.2 * r() * r();
    const at = Math.round(t * sr);
    plate(hi, sr, r, at, { base: 250 + 250 * r(), amp: 0.35 + 0.2 * r(), tau: 0.12 + 0.08 * r(), n: 5 });
    damped(lo, sr, at, 90 + 40 * r(), 0.3, 0.06);
  }
  return yield* finishPair(hi, lo, sr, 0.95, 120);
}

// a wet, dull slap, short: not comedic, no bubbles
const splat = recipe(0.5, [
  { k: 'body', to: 'hi', f0: 150, f1: 62, tp: 0.03, tau: 0.05, amp: 0.8, drive: 1.2 },
  { k: 'roar', dur: 0.12, amp: 0.55, fA: 1200, fB: 300, tauF: 0.04, env: [[0, 0], [0.002, 1], [0.12, 0.01], [0.124, 0]] },
  { k: 'roar', at: 0.03, dur: 0.24, amp: 0.3, fA: 1500, fB: 350, tauF: 0.1, q: 1.6, hp: 250, modFc: 38, modDepth: 0.9, env: [[0, 0], [0.01, 1], [0.24, 0.01], [0.244, 0]] },
]);

// a tank comes down hard: a heavy thud, the hull ringing, suspension and loose fittings clanking
const thud = recipe(1.3, [
  { k: 'body', f0: 80, f1: 36, tp: 0.08, tau: 0.2, amp: 1.0, drive: 1.5 },
  { k: 'roar', dur: 0.14, amp: 0.45, fA: 480, fB: 120, tauF: 0.05, env: [[0, 0], [0.003, 1], [0.14, 0.01], [0.144, 0]] },
  { k: 'modal', at: 0.015, amp: 0.5, partials: [[160, 0.35, 0.2], [290, 0.25, 0.15], [470, 0.15, 0.1]] },
  { k: 'modal', at: 0.12, amp: 0.25, partials: [[900, 0.3, 0.04], [1500, 0.2, 0.03]] },
  { k: 'modal', at: 0.2, amp: 0.15, partials: [[1100, 0.3, 0.04], [1800, 0.2, 0.03]] },
  { k: 'clods', n: 3, t0: 0.1, t1: 0.6, amp: 0.25 },
  { k: 'rumble', dur: 0.9, amp: 0.4, fc: 110, att: 0.01, tau: 0.25, rollFc: 7, rollDepth: 0.3 },
], 120);

// an energy shield taking a hit: a bright pulse falling away, a buzz, a sizzle
const shield = recipe(1.0, [
  { k: 'crack', amp: 0.5, dur: 0.015, hp: 4000, snap: 0 },
  { k: 'body', to: 'hi', f0: 1500, f1: 420, tp: 0.12, tau: 0.25, amp: 0.55, attack: 0.003, dur: 0.8 },
  { k: 'body', to: 'hi', f0: 1535, f1: 430, tp: 0.12, tau: 0.25, amp: 0.45, attack: 0.003, dur: 0.8 },
  { k: 'body', to: 'hi', f0: 128, f1: 108, tp: 0.2, tau: 0.3, amp: 0.4, drive: 3.2 },
  { k: 'roar', dur: 0.45, amp: 0.25, fA: 12000, fB: 5000, tauF: 0.2, hp: 4500, modFc: 90, modDepth: 0.8, env: [[0, 0], [0.002, 1], [0.1, 0.5], [0.45, 0.01], [0.454, 0]] },
]);

// ratchet, then two clanks of a wrench on steel and a last ring
const repair = recipe(1.3, () => {
  const L = [];
  for (const t of [0, 0.06, 0.115, 0.16, 0.2, 0.235, 0.265]) {
    L.push({ k: 'crack', at: t, amp: 0.5, dur: 0.003, hp: 2200, snap: 0 });
    L.push({ k: 'modal', at: t, amp: 0.25, partials: [[1900, 0.5, 0.012], [2800, 0.3, 0.008]] });
  }
  L.push({ k: 'crack', at: 0.4, amp: 0.5, dur: 0.005, hp: 1500, snap: 0 });
  L.push({ k: 'plate', at: 0.4, base: 1250, amp: 0.5, tau: 0.12, n: 5 });
  L.push({ k: 'body', at: 0.4, to: 'lo', f0: 130, f1: 80, tp: 0.03, tau: 0.05, amp: 0.4 });
  L.push({ k: 'crack', at: 0.62, amp: 0.4, dur: 0.005, hp: 1800, snap: 0 });
  L.push({ k: 'plate', at: 0.62, base: 1500, amp: 0.4, tau: 0.1, n: 5 });
  L.push({ k: 'modal', at: 0.8, amp: 0.25, partials: [[2600, 0.5, 0.3]] });
  return L;
});

// a parachute cracks open and billows
const chute = recipe(1.1, [
  { k: 'crack', amp: 1.0, dur: 0.02, hp: 700, snap: 0.6, snapFc: 1800, snapTau: 0.03 },
  { k: 'body', to: 'lo', f0: 150, f1: 85, tp: 0.05, tau: 0.14, amp: 0.6 },
  { k: 'roar', dur: 0.9, amp: 0.55, fA: 2200, fB: 600, tauF: 0.25, hp: 300, modFc: 22, modDepth: 0.85, env: [[0, 0], [0.02, 1], [0.2, 0.6], [0.9, 0.01], [0.904, 0]] },
  { k: 'roar', at: 0.15, dur: 0.7, amp: 0.25, fA: 1500, fB: 500, tauF: 0.3, modFc: 9, modDepth: 0.9, env: [[0, 0], [0.05, 1], [0.7, 0.01], [0.704, 0]] },
]);

export const HITS = {
  metal: { sr: 22050, variants: 3, render: metal, send: 0.3 },
  ricochet: { sr: 22050, variants: 3, render: ricochet, send: 0.3 },
  dirt: { sr: 22050, variants: 3, render: dirt, send: 0.18 },
  debris: { sr: 22050, variants: 3, render: debrisHit, send: 0.2 },
  splat: { sr: 22050, variants: 3, render: splat, send: 0.1 },
  thud: { sr: 22050, variants: 2, render: thud, send: 0.2 },
  shield: { sr: 22050, variants: 2, render: shield, send: 0.3 },
  repair: { sr: 22050, variants: 2, render: repair, send: 0.15 },
  chute: { sr: 22050, variants: 2, render: chute, send: 0.2 },
};
