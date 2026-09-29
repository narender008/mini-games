// Toy Tanks' one-shot sounds, each written once into a small buffer from
// physical-ish parts: a cork leaving a bottle, air whooshing, a rubber
// spring going "boing", bubbles and droplets for mud and jelly, hundreds of
// tiny grains for paper and sand, damped bars and bells for chimes, squeaky
// toys for a giggle. All soft and round: there is no boom in here, no
// gunfire and no voice. Every render returns { sr, ch: [mono] } at peak 1;
// audio.js sets each sound's level.
//
// SHOTS: renderers with a few variants (so repeats never sound identical).
// KEYED: sparkles and fanfares that play in the stage's musical key.
import { TAU, clamp, seeded, secs, smooth, pitched, damped, bubble, grain, sweep, filt, mix, finish, finishLoop, white, pinkify, mtof } from './dsp.js';
import { renderNote, trumpetInto } from './instruments.js';

const CH = (n) => new Float32Array(n);

// mix a copy of `comp` scaled to peak `amp` into `out` at sample `at`
function put(out, comp, amp, at = 0) {
  let m = 0;
  for (let i = 0; i < comp.length; i++) m = Math.max(m, Math.abs(comp[i]));
  if (m > 0) mix(out, comp, amp / m, at);
}

// take the fizz off the top: noisy sounds are kept soft and round
const soften = (out, sr, fc = 7000) => filt(out, sr, 'lowpass', fc, 0.6);

// a burst of noise (a grain) filtered to a band or below a cut-off, mixed in at peak `amp`
function puffInto(out, sr, at, dur, type, fc, q, amp, r, rise = 0.003) {
  const a = CH(Math.min(secs(sr, dur), out.length - at));
  grain(a, 0, a.length, secs(sr, rise), 1, r);
  filt(a, sr, type, fc, q);
  put(out, a, amp, at);
}

// ------------------------------------------------------------ the shot

// A toy pop-gun's "pomf": the cork leaves the neck with a short resonant note
// that drops in pitch as the air empties, over a round soft body, a puff of
// air and a breathy tail. Reused by the balloons, candy and split balls.
function popInto(out, sr, at, { f0 = 430, amp = 1, body = 150, air = 1400, puff = 0.5, breath = 0.18 }, r) {
  pitched(out, sr, at, 0.16, (t) => f0 * (1 + 0.35 * Math.exp(-t / 0.03)), { amp, attack: 0.0025, tau: 0.032, h2: 0.25 });
  pitched(out, sr, at, 0.18, (t) => body * (1 + 0.6 * Math.exp(-t / 0.04)), { amp: amp * 0.55, attack: 0.004, tau: 0.045 });
  puffInto(out, sr, at, 0.1, 'bandpass', air, 0.9, amp * puff, r);
  if (breath > 0) puffInto(out, sr, at + secs(sr, 0.01), 0.17, 'lowpass', 2200, 0.7, amp * breath, r, 0.02);
}

function popRender(sr, seed, f0) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.34));
  popInto(out, sr, 0, { f0 }, r);
  soften(out, sr, 6000);
  return finish([out], sr, 0.5, 25);
}

// The airy whoosh after the pop: a wide band of air that opens and closes.
function whooshRender(sr, seed, up) {
  const r = seeded(seed);
  const n = secs(sr, 0.66);
  const out = CH(n);
  const env = (u) => smooth(u / 0.22) * Math.exp(-Math.max(0, u - 0.22) * 3.4);
  const [fa, fb] = up ? [420, 1900] : [1500, 480];
  const a = CH(n);
  sweep(a, sr, 0, 0.62, fa, fb, 1.1, 1, r, env);
  put(out, a, 1);
  const b = CH(n);
  sweep(b, sr, secs(sr, 0.03), 0.4, 2800, 4600, 0.8, 1, r, env);
  put(out, b, 0.22);
  soften(out, sr, 6500);
  return finish([out], sr, 4, 40);
}

// A rubber spring letting go: a sine that leaps up and wobbles, decaying.
function boingRender(sr, seed, base) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.6));
  const ph = r() * TAU;
  pitched(out, sr, 0, 0.55, (t) => base * (1 + 0.5 * (1 - Math.exp(-t / 0.05))) * (1 + 0.16 * Math.exp(-t / 0.16) * Math.sin(TAU * 17 * t + ph)),
    { amp: 1, attack: 0.004, tau: 0.14, h2: 0.3, h3: 0.08 });
  puffInto(out, sr, 0, 0.03, 'bandpass', 2400, 1, 0.16, r, 0.002);
  filt(out, sr, 'lowpass', 4500, 0.6);
  return finish([out], sr, 1, 30);
}

// ------------------------------------------------------------ payloads

// Mud: a wet slap, big round blorps, a squelch of middling bubbles and tiny
// bright droplets that plink about, over a little spray.
function mudRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.0));
  puffInto(out, sr, 0, 0.14, 'lowpass', 1000, 0.8, 0.8, r, 0.004);
  for (const [t, f, a] of [[0.012, 170, 0.95], [0.06, 235, 0.65], [0.125, 320, 0.45]]) {
    bubble(out, sr, secs(sr, t + r() * 0.01), f * (0.9 + r() * 0.2), a, 0.3 + r() * 0.2, 24 + r() * 10);
  }
  for (let i = 0; i < 12; i++) bubble(out, sr, secs(sr, 0.09 + r() * 0.55), 380 + r() * 820, 0.1 + r() * 0.22, 0.2, 30 + r() * 30);
  for (let i = 0; i < 11; i++) bubble(out, sr, secs(sr, 0.1 + r() ** 1.4 * 0.8), 1500 + r() * 2300, 0.07 + r() * 0.13, 0.25, 70 + r() * 90);
  puffInto(out, sr, secs(sr, 0.005), 0.4, 'bandpass', 3200, 0.6, 0.16, r, 0.02);
  soften(out, sr, 7000);
  return finish([out], sr, 0.6, 40);
}

// Jelly: a squishy slap, then a low body that wobbles like a set pudding,
// with a fifth above it and a few rainbow bubbles.
function jellyRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.1));
  const ph = r() * TAU;
  puffInto(out, sr, 0, 0.1, 'lowpass', 800, 0.8, 0.5, r, 0.005);
  bubble(out, sr, secs(sr, 0.01), 150, 0.6, 0.7, 14);
  const wob = (k, a, tau) => pitched(out, sr, secs(sr, 0.02), 0.95, (t) => 235 * k * (1 + 0.2 * Math.exp(-t / 0.28) * Math.sin(TAU * 8.5 * t + ph)) * (1 - 0.08 * smooth(t / 0.5)),
    { amp: a, attack: 0.006, tau, h2: 0.35 });
  wob(1, 0.9, 0.24);
  wob(1.5, 0.28, 0.18);
  for (let i = 0; i < 6; i++) bubble(out, sr, secs(sr, 0.05 + r() * 0.6), 800 + r() * 1600, 0.06 + r() * 0.08, 0.3, 45 + r() * 40);
  return finish([out], sr, 0.8, 40);
}

// Confetti: a party popper's pop, a rising fizz and the crackle of a shower of
// paper landing (a few dozen tiny band-limited grains, thinning out).
function confettiRender(sr, seed) {
  const r = seeded(seed);
  const n = secs(sr, 0.95);
  const out = CH(n);
  popInto(out, sr, 0, { f0: 720, amp: 0.7, body: 200, air: 2600, puff: 0.5, breath: 0.1 }, r);
  const fz = CH(n);
  sweep(fz, sr, secs(sr, 0.008), 0.34, 2400, 6200, 0.7, 1, r, (u) => Math.sin(Math.PI * u ** 0.6));
  put(out, fz, 0.32);
  const c = CH(n);
  for (let i = 0; i < 72; i++) {
    const t = 0.02 + 0.8 * r() ** 1.5;
    grain(c, secs(sr, t), secs(sr, 0.0012 + r() * 0.004), 2, (0.25 + 0.75 * r()) * (1 - t / 0.95), r);
  }
  filt(c, sr, 'bandpass', 4200, 0.6);
  put(out, c, 0.5);
  soften(out, sr, 7000);
  return finish([out], sr, 0.6, 40);
}

// Snow: a soft powder "whumpf" (a wide band of air that closes down over a low
// pillowy thump) and a few tiny crystalline tinkles.
function snowRender(sr, seed) {
  const r = seeded(seed);
  const n = secs(sr, 1.0);
  const out = CH(n);
  const p = CH(n);
  sweep(p, sr, 0, 0.55, 1800, 350, 0.5, 1, r, (u) => smooth(u / 0.07) * Math.exp(-u * 3.5));
  put(out, p, 0.8);
  pitched(out, sr, 0, 0.3, (t) => 95 * (1 + 0.4 * Math.exp(-t / 0.05)), { amp: 0.5, attack: 0.012, tau: 0.09 });
  for (let i = 0; i < 9; i++) damped(out, sr, secs(sr, 0.04 + r() * 0.6), 3000 + r() * 2500, 0.06 + r() * 0.08, 0.03 + r() * 0.04);
  soften(out, sr, 7000);
  return finish([out], sr, 2, 50);
}

// Bouncy candy ball: a rubbery pop with a little twang, a sugary fizz and
// some tiny plinks.
function candyRender(sr, seed) {
  const r = seeded(seed);
  const n = secs(sr, 0.75);
  const out = CH(n);
  popInto(out, sr, 0, { f0: 600, amp: 0.9, body: 190, air: 3000, puff: 0.4, breath: 0.12 }, r);
  pitched(out, sr, secs(sr, 0.03), 0.45, (t) => 320 * (1 + 0.4 * (1 - Math.exp(-t / 0.04))) * (1 + 0.1 * Math.exp(-t / 0.12) * Math.sin(TAU * 20 * t)),
    { amp: 0.33, attack: 0.006, tau: 0.1, h2: 0.3 });
  const fz = CH(n);
  sweep(fz, sr, secs(sr, 0.01), 0.3, 5500, 3500, 0.8, 1, r, (u) => smooth(u / 0.1) * Math.exp(-u * 2.5));
  put(out, fz, 0.26);
  for (let i = 0; i < 4; i++) bubble(out, sr, secs(sr, 0.05 + r() * 0.35), 2200 + r() * 1400, 0.07 + r() * 0.06, 0.3, 60 + r() * 50);
  soften(out, sr, 7000);
  return finish([out], sr, 0.6, 40);
}

// Three small pops, each a little higher than the last, and a sparkle of plinks.
function tripleRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.6));
  [[0, 520, 0.85, 180], [0.065, 640, 0.75, 210], [0.14, 780, 0.65, 240]].forEach(([t, f0, amp, body]) => {
    popInto(out, sr, secs(sr, t), { f0: f0 * (0.97 + r() * 0.06), amp, body, air: 2000, puff: 0.45, breath: 0.06 }, r);
  });
  for (let i = 0; i < 3; i++) bubble(out, sr, secs(sr, 0.12 + r() * 0.25), 2400 + r() * 1000, 0.08 + r() * 0.05, 0.3, 60 + r() * 40);
  return finish([out], sr, 0.6, 40);
}

// ------------------------------------------------------------ the ground

const dropEnv = (rise, k) => (u) => smooth(u / rise) * Math.exp(-u * k);

// Grass: a soft thud and the whisper of blades brushing.
function grassRender(sr, seed) {
  const r = seeded(seed);
  const n = secs(sr, 0.55);
  const out = CH(n);
  pitched(out, sr, 0, 0.2, (t) => 105 * (1 + 0.5 * Math.exp(-t / 0.05)), { amp: 0.8, attack: 0.004, tau: 0.055 });
  puffInto(out, sr, 0, 0.09, 'lowpass', 380, 0.7, 0.5, r, 0.004);
  const s = CH(n);
  sweep(s, sr, secs(sr, 0.01), 0.42, 4200, 2800, 0.6, 1, r, dropEnv(0.1, 4));
  put(out, s, 0.28);
  const b = CH(n);
  for (let i = 0; i < 14; i++) grain(b, secs(sr, 0.02 + r() * 0.3), secs(sr, 0.002 + r() * 0.003), 2, 0.3 + r() * 0.7, r);
  filt(b, sr, 'bandpass', 5000, 0.8);
  put(out, b, 0.18);
  soften(out, sr, 6500);
  return finish([out], sr, 0.8, 40);
}

// Sand: a dull soft thump and the hiss of sand pouring off.
function sandRender(sr, seed) {
  const r = seeded(seed);
  const n = secs(sr, 0.75);
  const out = CH(n);
  pitched(out, sr, 0, 0.2, (t) => 90 * (1 + 0.4 * Math.exp(-t / 0.05)), { amp: 0.5, attack: 0.005, tau: 0.05 });
  puffInto(out, sr, 0, 0.09, 'lowpass', 300, 0.7, 0.3, r, 0.005);
  const g = CH(n);
  for (let i = 0; i < 260; i++) grain(g, secs(sr, 0.6 * r() ** 1.5), secs(sr, 0.0006 + r() * 0.0014), 2, r(), r);
  filt(g, sr, 'bandpass', 3800, 0.5);
  put(out, g, 0.4);
  const h = CH(n);
  sweep(h, sr, secs(sr, 0.01), 0.6, 5000, 2500, 0.6, 1, r, dropEnv(0.05, 3.5));
  put(out, h, 0.33);
  soften(out, sr, 6500);
  return finish([out], sr, 1, 60);
}

// Mud: a squelchy splorch, all low bubbles.
function mudGroundRender(sr, seed) {
  const r = seeded(seed);
  const n = secs(sr, 0.7);
  const out = CH(n);
  pitched(out, sr, 0, 0.25, (t) => 80 * (1 + 0.5 * Math.exp(-t / 0.06)), { amp: 0.7, attack: 0.005, tau: 0.06 });
  const s = CH(n);
  sweep(s, sr, 0, 0.35, 900, 200, 0.6, 1, r, dropEnv(0.04, 4));
  put(out, s, 0.6);
  for (let i = 0; i < 3; i++) bubble(out, sr, secs(sr, 0.02 + r() * 0.18), 110 + r() * 150, 0.4 + r() * 0.3, 0.4, 20 + r() * 12);
  for (let i = 0; i < 4; i++) bubble(out, sr, secs(sr, 0.1 + r() * 0.35), 300 + r() * 400, 0.08 + r() * 0.1, 0.3, 30 + r() * 20);
  return finish([out], sr, 1, 50);
}

// Snow: a crunch (a burst of tiny grains, front-loaded) and a soft puff.
function snowGroundRender(sr, seed) {
  const r = seeded(seed);
  const n = secs(sr, 0.5);
  const out = CH(n);
  const c = CH(n);
  for (let i = 0; i < 34; i++) grain(c, secs(sr, 0.005 + 0.2 * r() ** 1.3), secs(sr, 0.001 + r() * 0.002), 2, 0.3 + r() * 0.7, r);
  filt(c, sr, 'bandpass', 2000, 0.7);
  put(out, c, 0.55);
  const p = CH(n);
  sweep(p, sr, 0, 0.32, 1500, 400, 0.5, 1, r, dropEnv(0.08, 4));
  put(out, p, 0.4);
  pitched(out, sr, 0, 0.2, (t) => 85 * (1 + 0.4 * Math.exp(-t / 0.05)), { amp: 0.3, attack: 0.006, tau: 0.05 });
  soften(out, sr, 6500);
  return finish([out], sr, 0.8, 40);
}

// Moss and soil: a soft thump and the rustle of leaves.
function mossRender(sr, seed) {
  const r = seeded(seed);
  const n = secs(sr, 0.5);
  const out = CH(n);
  pitched(out, sr, 0, 0.18, (t) => 100 * (1 - 0.3 * smooth(t / 0.06)), { amp: 0.7, attack: 0.004, tau: 0.045 });
  const l = CH(n);
  sweep(l, sr, secs(sr, 0.01), 0.32, 4800, 3000, 0.7, 1, r, dropEnv(0.06, 4.5));
  put(out, l, 0.3);
  const c = CH(n);
  for (let i = 0; i < 16; i++) grain(c, secs(sr, 0.02 + r() * 0.28), secs(sr, 0.0015 + r() * 0.003), 2, 0.3 + r() * 0.7, r);
  filt(c, sr, 'bandpass', 5500, 0.9);
  put(out, c, 0.18);
  soften(out, sr, 6500);
  return finish([out], sr, 0.8, 40);
}

// ------------------------------------------------------------ the tank's giggle

// A hit toy tank giggles without a voice: squeaky-toy squeaks that leap up,
// a slide-whistle wobble and a run of tiny chirps, in three orders.
function tankHitRender(sr, seed, variant) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.5));
  const k = 0.92 + r() * 0.16;
  const at = (t) => secs(sr, t);
  const squeak = (t, f0, f1, dur, amp) => pitched(out, sr, at(t), dur, (x) => (f0 + (f1 - f0) * smooth(x / dur)) * k * (1 + 0.025 * Math.sin(TAU * 32 * x)),
    { amp, attack: 0.006, tau: dur * 0.7, h2: 0.42, h3: 0.15 });
  const blocks = {
    S: [0.32, (t) => {
      squeak(t, 560, 1150, 0.11, 0.8);
      squeak(t + 0.15, 800, 1650, 0.13, 0.85);
    }],
    W: [0.64, (t) => pitched(out, sr, at(t), 0.62, (x) => (x < 0.22 ? 650 + 950 * smooth(x / 0.22) : 1600 - 700 * smooth((x - 0.22) / 0.4)) * k * (1 + 0.045 * Math.sin(TAU * 6.5 * x) * smooth((x - 0.15) / 0.1)),
      { env: (x) => smooth(x / 0.03) * (1 - smooth((x - 0.5) / 0.12)), amp: 0.5, h2: 0.06 })],
    C: [0.36, (t) => {
      for (let i = 0; i < 4; i++) {
        const f = (1150 + (i % 2) * 130 + i * 40) * k;
        pitched(out, sr, at(t + i * 0.085), 0.05, (x) => f * (1 + 0.5 * smooth(x / 0.05)), { amp: 0.42 - i * 0.05, attack: 0.004, tau: 0.03, h2: 0.2 });
      }
    }],
  };
  const order = [['S', 'W', 'C'], ['C', 'S', 'W'], ['S', 'C', 'W']][variant % 3];
  let t = 0.005;
  for (const id of order) {
    blocks[id][1](t);
    t += blocks[id][0] + 0.04;
  }
  filt(out, sr, 'lowpass', 4800, 0.6);
  return finish([out], sr, 2, 60);
}

// ------------------------------------------------------------ targets and interface

// A balloon lets go: a thin soft "pip" and a squeak of escaping air.
function balloonRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.4));
  puffInto(out, sr, 0, 0.035, 'bandpass', 1700, 0.8, 0.8, r, 0.0015);
  pitched(out, sr, 0, 0.06, (t) => 900 - 250 * smooth(t / 0.05), { amp: 0.5, attack: 0.001, tau: 0.012 });
  pitched(out, sr, secs(sr, 0.02), 0.17, (t) => 1700 + 900 * smooth(t / 0.05) - 800 * smooth((t - 0.05) / 0.11), { amp: 0.28, attack: 0.01, tau: 0.07, h2: 0.35 });
  return finish([out], sr, 0.5, 40);
}

// Wooden blocks tumbling over: a cascade of woody knocks, each a few damped
// modes, getting quieter and further apart.
function blocksRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.0));
  const times = [0, 0.045, 0.1, 0.17, 0.26, 0.37, 0.5, 0.66];
  times.forEach((t0, i) => {
    const a = 0.8 ** i;
    const at = secs(sr, t0 + r() * 0.012);
    const f = 650 + r() * 1200;
    damped(out, sr, at, f, a, 0.03 + r() * 0.03);
    damped(out, sr, at, f * 2.32, a * 0.5, 0.02);
    damped(out, sr, at, f * 4.1, a * 0.2, 0.012);
    damped(out, sr, at, f * 0.5, a * 0.6, 0.05);
    const tk = CH(secs(sr, 0.008));
    grain(tk, 0, tk.length, 2, 1, r);
    filt(tk, sr, 'bandpass', 2500, 1);
    put(out, tk, a * 0.3, at);
  });
  return finish([out], sr, 0.5, 60);
}

// A UI tap: a small woody "tok" with a bright tick.
function tapRender(sr, seed, f) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.17));
  pitched(out, sr, 0, 0.14, (t) => f * (1 - 0.28 * smooth(t / 0.05)), { amp: 1, attack: 0.002, tau: 0.035, h2: 0.15 });
  puffInto(out, sr, 0, 0.007, 'bandpass', 2600, 1, 0.22, r, 0.0008);
  return finish([out], sr, 0.5, 20);
}

// One rain drop on a puddle: a single tiny bubble.
function dripRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.22));
  bubble(out, sr, 0, 900 + r() * 1700, 1, 0.5, 50 + r() * 40);
  return finish([out], sr, 0.5, 30);
}

// ------------------------------------------------------------ loops

// Soft ticks of a toy tank's rubber tracks meeting the ground, 14 a second,
// slightly uneven; played faster or slower it follows the tank's speed.
function patterLoop(sr, seed) {
  const r = seeded(seed);
  const n = sr;
  const out = CH(n);
  for (let i = 0; i < 14; i++) {
    const at = Math.floor(((i + (r() - 0.5) * 0.12) * sr) / 14);
    const a = i % 2 ? 0.7 : 1;
    const tick = CH(secs(sr, 0.02));
    grain(tick, 0, tick.length, 2, 1, r);
    filt(tick, sr, 'bandpass', 1500, 1.1);
    put(out, tick, 0.6 * a, Math.max(0, at));
    pitched(out, sr, Math.max(0, at), 0.02, (t) => 190 * (1 - 0.3 * smooth(t / 0.01)), { amp: 0.5 * a, attack: 0.0015, tau: 0.006 });
  }
  filt(out, sr, 'lowpass', 4200, 0.6, true);
  return finishLoop([out], sr);
}

function noiseLoop(sr, seed, dur, pink) {
  const r = seeded(seed);
  const d = white(secs(sr, dur), r);
  if (pink) pinkify(d, true);
  return finishLoop([d], sr);
}

export const SHOTS = {
  tap: { render: (sr, s, v) => tapRender(sr, s, [880, 940, 990][v]), variants: 3, sr: 32000 },
  pop: { render: (sr, s, v) => popRender(sr, s, [400, 430, 465][v]), variants: 3, sr: 32000 },
  whooshUp: { render: (sr, s) => whooshRender(sr, s, true), variants: 2, sr: 24000 },
  whooshDown: { render: (sr, s) => whooshRender(sr, s, false), variants: 2, sr: 24000 },
  boing: { render: (sr, s, v) => boingRender(sr, s, [210, 240, 275][v]), variants: 3, sr: 24000 },
  mud: { render: mudRender, variants: 3, sr: 32000 },
  jelly: { render: jellyRender, variants: 3, sr: 24000 },
  confetti: { render: confettiRender, variants: 3, sr: 32000 },
  snow: { render: snowRender, variants: 3, sr: 32000 },
  candy: { render: candyRender, variants: 2, sr: 32000 },
  triple: { render: tripleRender, variants: 2, sr: 32000 },
  grass: { render: grassRender, variants: 3, sr: 24000 },
  sand: { render: sandRender, variants: 3, sr: 24000 },
  mudGround: { render: mudGroundRender, variants: 3, sr: 24000 },
  snowGround: { render: snowGroundRender, variants: 3, sr: 24000 },
  moss: { render: mossRender, variants: 3, sr: 24000 },
  tankHit: { render: (sr, s, v) => tankHitRender(sr, s, v), variants: 3, sr: 32000 },
  balloon: { render: balloonRender, variants: 3, sr: 32000 },
  blocks: { render: blocksRender, variants: 3, sr: 24000 },
  drip: { render: dripRender, variants: 8, sr: 32000 },
};

export const LOOPS = {
  pink: { render: (sr, s) => noiseLoop(sr, s, 3, true), sr: 22050 },
  white: { render: (sr, s) => noiseLoop(sr, s, 2, false), sr: 32000 },
  patter: { render: patterLoop, sr: 22050 },
};

// ------------------------------------------------------------ keyed sparkles

// A twinkling cascade of glockenspiel notes climbing and tumbling down the
// stage's major pentatonic, with a soft puff of air at the start when the ball
// bursts (`puff`).
const PENTA = [0, 2, 4, 7, 9];
const pentaNote = (base, i) => base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];

function twinkleRender(sr, seed, tonic, puff) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.75));
  if (puff) puffInto(out, sr, 0, 0.12, 'lowpass', 1800, 0.6, 0.35, r, 0.01);
  const base = tonic + 24;
  let idx = 2 + ((r() * 4) | 0);
  let dir = r() < 0.5 ? 1 : -1;
  let t = 0.02;
  const count = 11 + ((r() * 4) | 0);
  const cache = {};
  for (let i = 0; i < count; i++) {
    if (r() < 0.22) dir = -dir;
    idx = clamp(idx + dir * (1 + (r() < 0.3 ? 1 : 0)), 0, 9);
    if (idx === 0 || idx === 9) dir = -dir;
    const m = pentaNote(base, idx);
    const note = cache[m] || (cache[m] = renderNote(sr, 'glock', m));
    mix(out, note, (0.35 + 0.65 * r()) * (1 - i / (count * 1.6)), secs(sr, t));
    t += 0.045 + r() * 0.06;
  }
  return finish([out], sr, 0.6, 60);
}

// The "great hit" flourish: a bright major arpeggio racing up two octaves and
// ringing on the top, an octave sparkle above it.
function flourishRender(sr, seed, tonic) {
  const out = CH(secs(sr, 1.9));
  const base = tonic + 12;
  const steps = [0, 4, 7, 12, 16, 19, 24];
  steps.forEach((s, i) => {
    const last = i === steps.length - 1;
    mix(out, renderNote(sr, 'glock', base + s), 0.5 + 0.5 * (i / (steps.length - 1)), secs(sr, i * 0.05));
    if (last) mix(out, renderNote(sr, 'glock', base + s + 12), 0.22, secs(sr, i * 0.05 + 0.01));
  });
  mix(out, renderNote(sr, 'celesta', base + 12), 0.35, secs(sr, 0.15));
  return finish([out], sr, 0.6, 80);
}

// The ball splits in three: three quick rising pops and a sprinkle of
// glockenspiel sparkles.
function splitRender(sr, seed, tonic) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.7));
  [[0, 560], [0.055, 700], [0.11, 880]].forEach(([t, f0]) => popInto(out, sr, secs(sr, t), { f0, amp: 0.8, body: 200, air: 2400, puff: 0.4, breath: 0.05 }, r));
  [0, 2, 4].forEach((i, k) => mix(out, renderNote(sr, 'glock', pentaNote(tonic + 36, i + 1)), 0.25, secs(sr, 0.05 + k * 0.055)));
  return finish([out], sr, 0.6, 50);
}

// A toy-trumpet fanfare for the party: do-mi-sol-DO, the last note held over a
// marimba chord and a run of glockenspiel sparkles. Cheerful, not military.
function fanfareRender(sr, seed, tonic) {
  const out = CH(secs(sr, 2.2));
  const b = tonic + 12;
  const tp = (t, s, dur, amp) => trumpetInto(out, sr, secs(sr, t), mtof(b + s), dur, amp);
  tp(0.02, 0, 0.13, 0.75);
  tp(0.18, 4, 0.13, 0.75);
  tp(0.34, 7, 0.13, 0.8);
  tp(0.5, 12, 0.85, 0.9);
  tp(0.5, 7, 0.85, 0.5);
  const T = 0.5;
  for (const [s, v] of [[0, 0.55], [4, 0.45], [7, 0.45], [12, 0.4]]) mix(out, renderNote(sr, 'marimba', b + s), v, secs(sr, T + 0.005 * (s / 4)));
  mix(out, renderNote(sr, 'bass', tonic - 12), 0.6, secs(sr, T));
  [16, 19, 24, 28, 31].forEach((s, i) => mix(out, renderNote(sr, 'glock', b + s), 0.28, secs(sr, 0.85 + i * 0.09)));
  return finish([out], sr, 2, 100);
}

export const KEYED = {
  twinkle: { render: (sr, s, key) => twinkleRender(sr, s, key, false), variants: 2, sr: 32000 },
  twinkleBurst: { render: (sr, s, key) => twinkleRender(sr, s, key, true), variants: 2, sr: 32000 },
  flourish: { render: (sr, s, key) => flourishRender(sr, s, key), variants: 1, sr: 32000 },
  split: { render: (sr, s, key) => splitRender(sr, s, key), variants: 2, sr: 32000 },
  fanfare: { render: (sr, s, key) => fanfareRender(sr, s, key), variants: 1, sr: 24000 },
};

// ------------------------------------------------------------ fixed fanfares (any key)

// A run of shaker strokes, swelling and fading, for the party.
function rollRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.9));
  const gap = 0.115;
  const count = 15;
  for (let i = 0; i < count; i++) {
    const v = 0.25 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / count);
    mix(out, renderNote(sr, 'shaker', i % 4 === 0 ? 1 : 0), v, secs(sr, 0.02 + i * gap + (r() - 0.5) * 0.012));
  }
  return finish([out], sr, 3, 80);
}

// A star earned: a bright rising four-note chime that rings out, on a shimmer.
function starRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 2.0));
  [79, 84, 88, 91].forEach((m, i) => {
    mix(out, renderNote(sr, 'glock', m), 0.7 + i * 0.1, secs(sr, i * 0.09));
    mix(out, renderNote(sr, 'celesta', m), 0.3, secs(sr, i * 0.09));
  });
  mix(out, renderNote(sr, 'glock', 103), 0.2, secs(sr, 0.36));
  const sh = CH(out.length);
  sweep(sh, sr, secs(sr, 0.1), 1.3, 4500, 6500, 0.8, 1, r, (u) => smooth(u / 0.3) * (1 - smooth((u - 0.4) / 0.6)));
  put(out, sh, 0.12);
  for (let i = 0; i < 6; i++) mix(out, renderNote(sr, 'glock', pentaNote(96, (r() * 6) | 0)), 0.12, secs(sr, 0.4 + r() * 1.0));
  return finish([out], sr, 0.6, 100);
}

// A new tank or ball unlocked, in two layers that play together (so that
// neither takes long to render): a harp glissando up two octaves, and a chord
// that blooms over a swell of shimmer with twinkles.
function unlockRunRender(sr, seed) {
  const out = CH(secs(sr, 2.6));
  const run = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
  run.forEach((s, i) => {
    mix(out, renderNote(sr, 'harp', 72 + s), 0.55 + 0.02 * i, secs(sr, i * 0.07));
    mix(out, renderNote(sr, 'celesta', 72 + s), 0.25, secs(sr, i * 0.07 + 0.005));
  });
  return finish([out], sr, 0.6, 150);
}

function unlockBloomRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 3.0));
  [84, 88, 91, 96].forEach((m, i) => mix(out, renderNote(sr, 'glock', m), 0.5, secs(sr, 1.0 + i * 0.04)));
  mix(out, renderNote(sr, 'musicbox', 100), 0.25, secs(sr, 1.2));
  const sh = CH(out.length);
  sweep(sh, sr, 0, 2.4, 3000, 6000, 0.7, 1, r, (u) => smooth(u / 0.45) * (1 - smooth((u - 0.5) / 0.5)));
  put(out, sh, 0.16);
  for (let i = 0; i < 12; i++) mix(out, renderNote(sr, 'glock', pentaNote(96, (r() * 6) | 0)), 0.14, secs(sr, 0.8 + r() * 1.8));
  return finish([out], sr, 0.6, 150);
}

export const FIXED = {
  roll: { render: rollRender, variants: 2, sr: 24000 },
  star: { render: starRender, variants: 1, sr: 24000 },
  unlockRun: { render: unlockRunRender, variants: 1, sr: 24000 },
  unlockBloom: { render: unlockBloomRender, variants: 1, sr: 24000 },
};
