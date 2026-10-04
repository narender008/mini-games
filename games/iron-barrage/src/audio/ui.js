// Interface sounds for ui(kind): dry, mechanical and quiet, with brass for the
// turn cue and the reward. No voices. Everything is in D, like the music.
import { seeded, finishPair, sawBL, Biquad } from './dsp.js';
import { runLayers } from './layers.js';

// a brass note: two band-limited saws a few cents apart through a low-pass that
// opens as the note speaks. o = { att, rel, fc0, fc1 }
function* brass(out, sr, r, at, f, dur, amp, o = {}) {
  const att = o.att ?? 0.045;
  const rel = o.rel ?? 0.1;
  const fc0 = o.fc0 ?? 450;
  const fc1 = o.fc1 ?? 2400;
  const n = Math.min(out.length - at, Math.round((dur + rel) * sr));
  const d1 = (f * 1.0035) / sr;
  const d2 = (f * 0.9965) / sr;
  let p1 = r();
  let p2 = r();
  const bq = new Biquad('lowpass', fc0, 1.0, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env = t < att ? t / att : 1;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / rel);
    if ((i & 31) === 0) {
      const k = Math.min(1, t / (att * 2));
      bq.set('lowpass', fc0 + (fc1 - fc0) * k * (1 - 0.35 * Math.min(1, t / (dur + 0.001))), 1.0, sr);
    }
    const s = sawBL(p1, d1) + sawBL(p2, d2);
    p1 += d1;
    if (p1 >= 1) p1 -= 1;
    p2 += d2;
    if (p2 >= 1) p2 -= 1;
    out[at + i] += amp * env * bq.run(s * 0.5);
    if ((i & 4095) === 4095) yield;
  }
}

function recipe(dur, build) {
  return function* render(sr, seed) {
    const r = seeded(seed);
    const n = Math.round(dur * sr);
    const hi = new Float32Array(n);
    const lo = new Float32Array(n);
    const layers = typeof build === 'function' ? yield* build(r, hi, lo, sr) : build;
    if (layers) yield* runLayers(layers, hi, lo, sr, r);
    // the UI is one buffer, so the low layer is folded into the high one
    for (let i = 0; i < n; i++) hi[i] += lo[i];
    return yield* finishPair(hi, null, sr, 0.9, 25);
  };
}

const click = recipe(0.1, [
  { k: 'crack', amp: 0.6, dur: 0.003, hp: 2500, snap: 0 },
  { k: 'modal', amp: 0.35, partials: [[1100, 1, 0.012], [2400, 0.4, 0.008]] },
  { k: 'body', to: 'hi', f0: 400, f1: 250, tp: 0.02, tau: 0.02, amp: 0.3 },
]);

const select = recipe(0.22, [
  { k: 'crack', amp: 0.5, dur: 0.004, hp: 1500, snap: 0 },
  { k: 'modal', amp: 0.4, partials: [[760, 0.7, 0.03], [1520, 0.3, 0.02]] },
  { k: 'crack', at: 0.035, amp: 0.4, dur: 0.003, hp: 2400, snap: 0 },
  { k: 'modal', at: 0.035, amp: 0.3, partials: [[1500, 0.6, 0.02], [3000, 0.2, 0.01]] },
  { k: 'body', f0: 150, f1: 100, tp: 0.03, tau: 0.04, amp: 0.3 },
]);

const buy = recipe(1.4, [
  { k: 'crack', amp: 0.55, dur: 0.005, hp: 1500, snap: 0 },
  { k: 'modal', amp: 0.35, partials: [[900, 0.5, 0.03], [2100, 0.3, 0.02]] },
  { k: 'crack', at: 0.07, amp: 0.5, dur: 0.005, hp: 1900, snap: 0 },
  { k: 'modal', at: 0.07, amp: 0.35, partials: [[1100, 0.5, 0.03], [2500, 0.3, 0.02]] },
  { k: 'modal', at: 0.13, amp: 0.4, partials: [[2640, 0.6, 0.4], [3980, 0.25, 0.28], [5300, 0.15, 0.18]] },
]);

const deny = recipe(0.5, [
  { k: 'body', to: 'hi', f0: 118, f1: 116, tp: 1, tau: 0.09, amp: 0.8, drive: 4, attack: 0.004, dur: 0.17 },
  { k: 'body', to: 'hi', f0: 126, f1: 124, tp: 1, tau: 0.09, amp: 0.6, drive: 4, attack: 0.004, dur: 0.17 },
  { k: 'body', to: 'hi', at: 0.2, f0: 110, f1: 108, tp: 1, tau: 0.1, amp: 0.8, drive: 4, attack: 0.004, dur: 0.2 },
  { k: 'body', to: 'hi', at: 0.2, f0: 118, f1: 116, tp: 1, tau: 0.1, amp: 0.6, drive: 4, attack: 0.004, dur: 0.2 },
]);

// the turn cue: a short bugle figure on a snare tap
const turn = recipe(1.1, function* (r, hi) {
  const sr = 22050;
  const o = { att: 0.03, rel: 0.12 };
  yield* brass(hi, sr, r, 0, 293.66, 0.1, 0.55, o);
  yield* brass(hi, sr, r, Math.round(0.13 * sr), 293.66, 0.1, 0.55, o);
  yield* brass(hi, sr, r, Math.round(0.26 * sr), 440, 0.5, 0.6, { att: 0.05, rel: 0.2 });
  return [
    { k: 'crack', amp: 0.3, dur: 0.01, hp: 1500, snap: 0.5, snapFc: 3000, snapTau: 0.03 },
    { k: 'body', to: 'hi', f0: 160, f1: 90, tp: 0.03, tau: 0.1, amp: 0.4 },
  ];
});

// a klaxon: harsh alternating saw tones, three times
const alarm = recipe(1.25, function* (r, hi) {
  const sr = 22050;
  const o = { att: 0.01, rel: 0.02, fc0: 1500, fc1: 2000 };
  for (let k = 0; k < 3; k++) {
    yield* brass(hi, sr, r, Math.round(k * 0.4 * sr), 622, 0.17, 0.5, o);
    yield* brass(hi, sr, r, Math.round((k * 0.4 + 0.19) * sr), 466, 0.17, 0.5, o);
  }
  return null;
});

const tick = recipe(0.07, [
  { k: 'crack', amp: 0.5, dur: 0.002, hp: 3000, snap: 0 },
  { k: 'modal', amp: 0.4, partials: [[1700, 1, 0.006], [3400, 0.3, 0.004]] },
]);

// brass arpeggio D F# A D, a ring, a drum under it
const reward = recipe(1.5, function* (r, hi) {
  const sr = 22050;
  const o = { att: 0.03, rel: 0.1 };
  for (const [f, t, d] of [[293.66, 0, 0.2], [369.99, 0.09, 0.2], [440, 0.18, 0.2], [587.33, 0.27, 0.75]]) yield* brass(hi, sr, r, Math.round(t * sr), f, d, 0.5, o);
  return [
    { k: 'modal', at: 0.27, amp: 0.3, partials: [[3140, 0.4, 0.6], [4700, 0.2, 0.4]] },
    { k: 'body', at: 0, to: 'lo', f0: 140, f1: 70, tp: 0.04, tau: 0.14, amp: 0.5 },
  ];
});

export const UIS = {
  click: { sr: 22050, variants: 1, render: click },
  select: { sr: 22050, variants: 1, render: select },
  buy: { sr: 22050, variants: 1, render: buy },
  deny: { sr: 22050, variants: 1, render: deny },
  turn: { sr: 22050, variants: 1, render: turn },
  alarm: { sr: 22050, variants: 1, render: alarm },
  tick: { sr: 22050, variants: 1, render: tick },
  reward: { sr: 22050, variants: 1, render: reward },
};
