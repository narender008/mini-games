// Natural sounds, rendered from what makes them in the real world:
//  - soil: a fingertip's muffled pat (low-passed noise and a soft thump),
//    then crumbs settling (tiny grains of band-limited noise);
//  - water: drops are bubbles whose pitch rises as they collapse, a pour is
//    thousands of little impacts on leaves and soil plus the spray's hiss;
//  - leaves and paper: dense crinkly grains under a breath of air;
//  - glass: a few inharmonic partials of a thin cylinder, slightly detuned;
//  - insects: cricket chirps are trains of soft pulses of a pure tone, a bee
//    is a warm harmonic buzz that drifts in pitch as it flies.
// Every render takes (sampleRate, seed) and returns { sr, ch: [channels] }.
import {
  mulberry32, TAU, secs, logRand, Biquad, filter, white, pinkify, noiseGrain, tone, damped, bubble, rampIn, mix, normalize, finish, finishLoop,
} from './synth.js';

const ms = (sr, x) => secs(sr, x / 1000);
const lanes = (count, n) => Array.from({ length: count }, () => new Float32Array(n));

// ------------------------------------------------------------ soil

// A seed pressed into soft soil: two soft pats and crumbs settling.
export function soilPat(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(0.75 * sr);
  const [body, grit, crumb, clod] = lanes(4, n);
  const out = new Float32Array(n);
  const second = 0.15 + rand() * 0.05;
  for (const [t, a] of [[0.003, 1], [second, 0.55]]) {
    const at = Math.floor(t * sr);
    noiseGrain(body, at, ms(sr, 95), ms(sr, 7), a, rand);
    tone(out, sr, at, { f0: 170 + rand() * 25, f1: 110, glide: 0.07, amp: 0.08 * a, attack: 0.008, tau: 0.035 });
    // the soil surface giving under the fingertip
    for (let k = 0; k < 12; k++) {
      noiseGrain(grit, at + Math.floor(rand() * 0.06 * sr), ms(sr, 1.2 + rand() * 2.5), ms(sr, 0.8), a * (0.15 + 0.6 * rand() ** 2), rand);
    }
  }
  for (let k = 0; k < 40; k++) {
    const t = 0.04 + 0.55 * Math.pow(rand(), 1.7);
    const big = rand() < 0.22;
    const a = (0.25 + 0.75 * rand() ** 2) * (1 - t * 0.9);
    if (big) noiseGrain(clod, Math.floor(t * sr), ms(sr, 5 + rand() * 7), ms(sr, 1.2), a, rand);
    else noiseGrain(crumb, Math.floor(t * sr), ms(sr, 1.2 + rand() * 3), ms(sr, 0.5), a, rand);
  }
  filter(body, sr, 'lowpass', 520, 0.9);
  filter(body, sr, 'lowpass', 850, 0.6);
  filter(body, sr, 'highpass', 90, 0.7);
  filter(grit, sr, 'bandpass', 2300, 0.9);
  filter(crumb, sr, 'bandpass', 1700, 1.1);
  filter(clod, sr, 'lowpass', 650, 0.8);
  mix(out, body, 1.6);
  mix(out, grit, 0.4);
  mix(out, crumb, 0.75);
  mix(out, clod, 1.2);
  filter(out, sr, 'lowpass', 5500, 0.6);
  return finish([out], sr, 0.5, 40);
}

// Soil cracking as a shoot pushes up: a tiny dry crumbly crackle.
export function soilCrack(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(0.5 * sr);
  const [dry, crumb, low] = lanes(3, n);
  const clusters = 2 + Math.floor(rand() * 2);
  for (let c = 0; c < clusters; c++) {
    const t0 = 0.02 + rand() * 0.25;
    const count = 5 + Math.floor(rand() * 6);
    for (let k = 0; k < count; k++) {
      const at = Math.floor((t0 + rand() * 0.07) * sr);
      noiseGrain(dry, at, ms(sr, 0.9 + rand() * 1.6), ms(sr, 0.5), 0.2 + 0.8 * rand() ** 3, rand);
    }
  }
  for (let k = 0; k < 6; k++) {
    noiseGrain(crumb, Math.floor((0.05 + rand() * 0.35) * sr), ms(sr, 2 + rand() * 3), ms(sr, 0.6), 0.2 + 0.4 * rand(), rand);
  }
  noiseGrain(low, Math.floor(0.01 * sr), ms(sr, 90), ms(sr, 30), 1, rand);
  filter(dry, sr, 'bandpass', 2300, 1);
  filter(crumb, sr, 'bandpass', 1300, 1);
  filter(low, sr, 'lowpass', 300, 0.8);
  const out = new Float32Array(n);
  mix(out, dry, 0.8);
  mix(out, crumb, 0.9);
  mix(out, low, 0.45);
  filter(out, sr, 'lowpass', 3800, 0.6);
  filter(out, sr, 'lowpass', 5000, 0.6);
  return finish([out], sr, 0.5, 30);
}

// A carrot pulled from the ground: rootlets tearing, a hollow suction
// "thwock" as it comes free, then soil falling back.
export function carrotPop(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(1.0 * sr);
  const [tear, suck, crumb, clod] = lanes(4, n);
  const out = new Float32Array(n);
  const pop = 0.17 + rand() * 0.03;
  // the rootlets letting go, faster and faster
  for (let k = 0; k < 34; k++) {
    const u = Math.pow(rand(), 0.55);
    noiseGrain(tear, Math.floor(u * pop * sr), ms(sr, 0.8 + rand() * 2), ms(sr, 0.4), (0.1 + 0.4 * u) * (0.3 + 0.7 * rand()), rand);
  }
  const at = Math.floor(pop * sr);
  // the suction breaking
  noiseGrain(suck, at, ms(sr, 35), ms(sr, 2.5), 1, rand);
  // the hollow cavity ringing up in pitch as it opens
  const f0 = 330 + rand() * 50;
  tone(out, sr, at, { f0, f1: f0 * 1.6, glide: 0.045, amp: 0.55, attack: 0.003, tau: 0.035, len: 0.16 });
  tone(out, sr, at, { f0: f0 * 2.2, f1: f0 * 3.4, glide: 0.04, amp: 0.13, attack: 0.003, tau: 0.018, len: 0.08 });
  // the ground giving way
  tone(out, sr, at, { f0: 150, f1: 105, glide: 0.06, amp: 0.1, attack: 0.004, tau: 0.045, len: 0.22 });
  // soil falling back
  for (let k = 0; k < 70; k++) {
    const t = pop + 0.02 + 0.6 * Math.pow(rand(), 1.6);
    const a = (0.2 + 0.8 * rand() ** 2) * Math.max(0.1, 1 - (t - pop) * 1.4);
    if (rand() < 0.3) noiseGrain(clod, Math.floor(t * sr), ms(sr, 5 + rand() * 9), ms(sr, 1.2), a, rand);
    else noiseGrain(crumb, Math.floor(t * sr), ms(sr, 1 + rand() * 3), ms(sr, 0.5), a * 0.8, rand);
  }
  filter(tear, sr, 'bandpass', 2100, 1.1);
  filter(suck, sr, 'bandpass', 850, 1.3);
  filter(crumb, sr, 'bandpass', 1500, 1);
  filter(clod, sr, 'lowpass', 520, 0.8);
  mix(out, tear, 0.5);
  mix(out, suck, 1.4);
  mix(out, crumb, 0.55);
  mix(out, clod, 0.9);
  filter(out, sr, 'lowpass', 5000, 0.6);
  filter(out, sr, 'highpass', 90, 0.7);
  return finish([out], sr, 0.5, 40);
}

// ------------------------------------------------------------ water

// One drop falling into water: the faint tick of impact and the rising
// "plip" of the bubble it traps, sometimes with a smaller second bubble.
export function drip(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(0.26 * sr);
  const out = new Float32Array(n);
  const tick = new Float32Array(n);
  const at = ms(sr, 2);
  noiseGrain(tick, at, ms(sr, 2), ms(sr, 0.4), 0.18, rand);
  filter(tick, sr, 'bandpass', 2600, 0.8);
  mix(out, tick);
  const f0 = logRand(rand, 850, 1450);
  bubble(out, sr, at + ms(sr, 0.5), f0, 1, 0.14 + rand() * 0.1);
  if (rand() < 0.45) bubble(out, sr, at + ms(sr, 35 + rand() * 40), f0 * (1.3 + rand() * 0.5), 0.25, 0.12);
  filter(out, sr, 'lowpass', 6000, 0.6);
  return finish([out], sr, 0.5, 15);
}

// Water from a watering can's rose landing on leaves and soil: a seamless
// stereo loop of thousands of small impacts, little puddle bubbles and the
// hiss of the spray. The flow swells gently twice per loop.
export function pourLoop(sr, seed) {
  const rand = mulberry32(seed);
  const dur = 3.2;
  const n = Math.floor(dur * sr);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const [leaf, patter, soil, splat] = lanes(4, n);
    const out = new Float32Array(n);
    const ph = rand() * TAU;
    const flow = (i) => 0.86 + 0.14 * Math.sin((TAU * 2 * i) / n + ph);
    const count = Math.floor(1600 * dur);
    for (let k = 0; k < count; k++) {
      const at = Math.floor(rand() * n);
      const a = (0.15 + 0.5 * rand() ** 3) * flow(at);
      const r = rand();
      if (r < 0.3) noiseGrain(leaf, at, ms(sr, 0.8 + rand() * 1.7), ms(sr, 0.3), a, rand, true);
      else if (r < 0.62) noiseGrain(patter, at, ms(sr, 1.5 + rand() * 2.5), ms(sr, 0.4), a, rand, true);
      else if (r < 0.88) noiseGrain(soil, at, ms(sr, 4 + rand() * 6), ms(sr, 0.8), a, rand, true);
      else noiseGrain(splat, at, ms(sr, 2 + rand() * 4), ms(sr, 0.5), a, rand, true);
    }
    for (let k = 0; k < 40 * dur; k++) {
      bubble(out, sr, Math.floor(rand() * n), logRand(rand, 1100, 3600), 0.02 + 0.06 * rand() ** 2, 0.08 + 0.15 * rand(), true);
    }
    const hiss = white(n, rand);
    filter(hiss, sr, 'bandpass', 2400, 0.5, true);
    filter(leaf, sr, 'bandpass', 3300, 1.2, true);
    filter(patter, sr, 'bandpass', 1500, 0.9, true);
    filter(soil, sr, 'lowpass', 520, 0.8, true);
    filter(splat, sr, 'bandpass', 850, 1.3, true);
    for (let i = 0; i < n; i++) {
      out[i] += leaf[i] * 0.9 + patter[i] * 1.0 + soil[i] * 1.6 + splat[i] * 0.9 + hiss[i] * 0.09 * flow(i);
    }
    filter(out, sr, 'lowpass', 6500, 0.6, true);
    filter(out, sr, 'highpass', 110, 0.7, true);
    chans.push(out);
  }
  return finishLoop(chans, sr);
}

// Gentle rain on a garden: a seamless stereo loop of soft hiss, drops
// ticking on leaves, a duller patter on soil and grass, and the odd bubble
// in a puddle. No thunder.
export function rainLoop(sr, seed) {
  const rand = mulberry32(seed);
  const dur = 4;
  const n = Math.floor(dur * sr);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const [leaf, patter] = lanes(2, n);
    const out = new Float32Array(n);
    const ph = rand() * TAU;
    const swell = (i) => 0.88 + 0.12 * Math.sin((TAU * 3 * i) / n + ph);
    for (let k = 0; k < 420 * dur; k++) {
      const at = Math.floor(rand() * n);
      noiseGrain(leaf, at, ms(sr, 0.8 + rand() * 1.5), ms(sr, 0.4), (0.1 + 0.5 * rand() ** 4) * swell(at), rand, true);
    }
    for (let k = 0; k < 300 * dur; k++) {
      const at = Math.floor(rand() * n);
      noiseGrain(patter, at, ms(sr, 2 + rand() * 5), ms(sr, 0.6), (0.15 + 0.55 * rand() ** 3) * swell(at), rand, true);
    }
    for (let k = 0; k < 7 * dur; k++) {
      bubble(out, sr, Math.floor(rand() * n), logRand(rand, 1300, 3400), 0.03 + 0.06 * rand() ** 2, 0.1 + 0.15 * rand(), true);
    }
    const hiss = pinkify(white(n, rand), true);
    filter(hiss, sr, 'highpass', 450, 0.6, true);
    filter(leaf, sr, 'bandpass', 2800, 1.1, true);
    filter(patter, sr, 'lowpass', 1100, 0.7, true);
    for (let i = 0; i < n; i++) out[i] += leaf[i] * 0.8 + patter[i] * 1.2 + hiss[i] * 0.22 * swell(i);
    filter(out, sr, 'lowpass', 5500, 0.6, true);
    filter(out, sr, 'highpass', 100, 0.7, true);
    chans.push(out);
  }
  return finishLoop(chans, sr);
}

// ------------------------------------------------------------ leaves and paper

// A soft leaf rustle: dense crinkly grains in a swell, over a breath of air.
export function leafRustle(sr, seed, dur = 0.42, density = 260) {
  const rand = mulberry32(seed);
  const n = Math.floor((dur + 0.05) * sr);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const [lo, hi] = lanes(2, n);
    const count = Math.floor(density * dur);
    for (let k = 0; k < count; k++) {
      // grains cluster in the middle of the movement
      const u = (rand() + rand() + rand()) / 3;
      const at = Math.floor(u * dur * sr);
      const bell = Math.sin(Math.PI * u);
      noiseGrain(rand() < 0.6 ? lo : hi, at, ms(sr, 1.2 + rand() * 3.5), ms(sr, 0.5), bell * (0.1 + 0.9 * rand() ** 3), rand);
    }
    const air = white(n, rand);
    for (let i = 0; i < n; i++) {
      const u = i / (dur * sr);
      air[i] *= u < 1 ? Math.pow(Math.sin(Math.PI * u), 2) * 0.18 : 0;
    }
    filter(lo, sr, 'bandpass', 1900, 0.8);
    filter(hi, sr, 'bandpass', 3300, 1);
    filter(air, sr, 'bandpass', 2200, 0.5);
    const out = new Float32Array(n);
    mix(out, lo, 1);
    mix(out, hi, 0.55);
    mix(out, air, 1);
    filter(out, sr, 'lowpass', 4800, 0.6);
    chans.push(out);
  }
  return finish(chans, sr, 1, 30);
}

// A book page turning: a light crinkle as it lifts, a soft swish of air as
// it sweeps over, and a gentle flap as it settles.
export function pageTurn(sr, seed) {
  const rand = mulberry32(seed);
  const dur = 0.62;
  const n = Math.floor(dur * sr);
  const [crinkle, swish, flap] = lanes(3, n);
  for (let k = 0; k < 14; k++) {
    noiseGrain(crinkle, Math.floor(rand() * 0.09 * sr), ms(sr, 0.6 + rand() * 1.4), ms(sr, 0.25), 0.2 + 0.8 * rand() ** 2, rand);
  }
  for (let k = 0; k < 5; k++) {
    noiseGrain(crinkle, Math.floor((0.37 + rand() * 0.06) * sr), ms(sr, 0.5 + rand()), ms(sr, 0.25), 0.2 * rand(), rand);
  }
  // the sweep: pink noise through a band that rises and falls as the page passes
  const src = pinkify(white(n, rand));
  const bq = new Biquad('bandpass', 900, 0.8, sr);
  const t0 = 0.03;
  const t1 = 0.4;
  const flutter = 20 + rand() * 12;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = (t - t0) / (t1 - t0);
    if (u <= 0 || u >= 1) {
      bq.run(0);
      continue;
    }
    if ((i & 15) === 0) bq.set('bandpass', 900 * Math.pow(2.6, Math.sin(Math.PI * Math.pow(u, 0.8))), 0.8, sr);
    const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 1.6) * (1 + 0.12 * Math.sin(TAU * flutter * t));
    swish[i] = bq.run(src[i] * env);
  }
  noiseGrain(flap, Math.floor(0.38 * sr), ms(sr, 45), ms(sr, 4), 1, rand);
  filter(crinkle, sr, 'bandpass', 3800, 1);
  filter(flap, sr, 'lowpass', 850, 0.7);
  const out = new Float32Array(n);
  mix(out, crinkle, 0.35);
  mix(out, swish, 1.6);
  mix(out, flap, 0.9);
  filter(out, sr, 'lowpass', 6000, 0.6);
  return finish([out], sr, 1, 30);
}

// Air moving past: pink noise through a band that sweeps from f0 to f1,
// swelling and fading. Used for petal bursts and panels opening or closing.
export function whoosh(sr, seed, { f0 = 500, f1 = 2600, dur = 0.45, peak = 0.35, q = 0.7 } = {}) {
  const rand = mulberry32(seed);
  const n = Math.floor((dur + 0.02) * sr);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const src = pinkify(white(n, rand));
    const bq = new Biquad('bandpass', f0, q, sr);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / (dur * sr);
      if (u >= 1) {
        out[i] = bq.run(0);
        continue;
      }
      if ((i & 15) === 0) bq.set('bandpass', f0 * Math.pow(f1 / f0, u), q, sr);
      const env = u < peak ? 0.5 - 0.5 * Math.cos((Math.PI * u) / peak) : 0.5 + 0.5 * Math.cos((Math.PI * (u - peak)) / (1 - peak));
      out[i] = bq.run(src[i] * env);
    }
    filter(out, sr, 'lowpass', 6000, 0.6);
    chans.push(out);
  }
  return finish(chans, sr, 1, 20);
}

// A flower stem snapped: a soft green snap, a fibrous tear, then leaves
// brushing together (the leaves carry most of it; the snap stays gentle).
export function stemSnap(sr, seed) {
  const rand = mulberry32(seed);
  const rustle = leafRustle(sr, seed + 7, 0.38, 200).ch;
  const n = rustle[0].length + ms(sr, 50);
  const [snap, wet] = lanes(2, n);
  const out = new Float32Array(n);
  noiseGrain(snap, ms(sr, 1), ms(sr, 6), ms(sr, 1), 1, rand);
  noiseGrain(snap, ms(sr, 22 + rand() * 10), ms(sr, 4), ms(sr, 0.8), 0.3, rand);
  noiseGrain(wet, ms(sr, 1), ms(sr, 30), ms(sr, 2.5), 0.9, rand);
  filter(snap, sr, 'bandpass', 1600, 1.1);
  filter(wet, sr, 'lowpass', 700, 0.8);
  mix(out, snap, 0.8);
  mix(out, wet, 0.9);
  damped(out, sr, ms(sr, 1), 1000 + rand() * 200, 0.07, 0.012);
  rampIn(out, ms(sr, 1), ms(sr, 1));
  filter(out, sr, 'lowpass', 4500, 0.6);
  normalize([out], 0.55);
  const chans = [out, Float32Array.from(out)];
  const off = ms(sr, 40);
  for (let c = 0; c < 2; c++) for (let i = 0; i < rustle[c].length; i++) chans[c][off + i] += rustle[c][i];
  return finish(chans, sr, 0.5, 30);
}

// ------------------------------------------------------------ glass and wicker

// A cut flower slipped into a glass vase: the plip of the stem entering the
// water, then a soft glassy clink as it comes to rest against the rim.
export function vaseClink(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(1.3 * sr);
  const out = new Float32Array(n);
  const splash = new Float32Array(n);
  bubble(out, sr, ms(sr, 2), logRand(rand, 850, 1200), 0.55, 0.18);
  for (let k = 0; k < 6; k++) noiseGrain(splash, ms(sr, 2 + rand() * 40), ms(sr, 1 + rand() * 2), ms(sr, 0.4), 0.1 * rand(), rand);
  const at = Math.floor((0.11 + rand() * 0.03) * sr);
  // a thin glass cylinder: partials near 1 : 2.83 : 5.42, each a close pair
  const glass = new Float32Array(n);
  const base = 1250 + rand() * 250;
  for (const [k, a, tau] of [[1, 0.5, 0.55], [2.83, 0.16, 0.2], [5.42, 0.05, 0.07]]) {
    damped(glass, sr, at, base * k, a * 0.6, tau);
    damped(glass, sr, at, base * k * 1.0023, a * 0.4, tau * 0.9, 1.3);
  }
  noiseGrain(splash, at, ms(sr, 1.2), ms(sr, 0.3), 0.12, rand);
  filter(splash, sr, 'bandpass', 3800, 1);
  rampIn(glass, at, ms(sr, 0.8));
  mix(out, glass);
  mix(out, splash);
  filter(out, sr, 'lowpass', 7000, 0.6);
  return finish([out], sr, 0.5, 60);
}

// Something set down in a wicker basket: a soft dull thump and the creak
// and tick of the weave.
export function wickerThump(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(0.6 * sr);
  const [thud, creak] = lanes(2, n);
  const out = new Float32Array(n);
  noiseGrain(thud, ms(sr, 1), ms(sr, 80), ms(sr, 5), 1, rand);
  filter(thud, sr, 'lowpass', 420, 0.9);
  filter(thud, sr, 'lowpass', 700, 0.6);
  filter(thud, sr, 'highpass', 80, 0.7);
  tone(out, sr, ms(sr, 1), { f0: 140, f1: 100, glide: 0.06, amp: 0.1, attack: 0.006, tau: 0.045 });
  for (let k = 0; k < 16; k++) {
    noiseGrain(creak, Math.floor((0.005 + 0.17 * rand() ** 1.5) * sr), ms(sr, 2 + rand() * 4), ms(sr, 0.6), 0.2 + 0.8 * rand() ** 2, rand);
  }
  filter(creak, sr, 'bandpass', 1500, 2.2);
  for (let k = 0; k < 4; k++) damped(out, sr, Math.floor((0.004 + rand() * 0.12) * sr), 850 + rand() * 900, 0.02, 0.01);
  mix(out, thud, 2.2);
  mix(out, creak, 1.2);
  filter(out, sr, 'lowpass', 5000, 0.6);
  return finish([out], sr, 0.5, 40);
}

// ------------------------------------------------------------ small magic

// The shoot popping through: a soft round "puck" that bends up in pitch,
// with a breath of loosened soil.
export function sproutPop(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(0.3 * sr);
  const out = new Float32Array(n);
  const puff = new Float32Array(n);
  const f0 = 250 + rand() * 50;
  tone(out, sr, 0, { f0, f1: f0 * 2.3, glide: 0.07, amp: 1, attack: 0.006, tau: 0.04, len: 0.2, h2: 0.08 });
  noiseGrain(puff, 0, ms(sr, 18), ms(sr, 3), 0.9, rand);
  filter(puff, sr, 'lowpass', 800, 0.7);
  mix(out, puff, 0.6);
  return finish([out], sr, 0.5, 20);
}

// A soft wooden tap for interface buttons: a small bar's two modes and a
// muffled contact.
export function woodTap(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(0.12 * sr);
  const out = new Float32Array(n);
  const f = 690 + rand() * 90;
  damped(out, sr, 0, f, 1, 0.02);
  damped(out, sr, 0, f * 2.76, 0.22, 0.006);
  const hit = new Float32Array(n);
  noiseGrain(hit, 0, ms(sr, 1.5), ms(sr, 0.3), 0.35, rand);
  filter(hit, sr, 'lowpass', 2200, 0.7);
  mix(out, hit);
  rampIn(out, 0, ms(sr, 0.7));
  return finish([out], sr, 0.5, 10);
}

// ------------------------------------------------------------ insects

// One cricket, singing on and on: soft chirps of a few pulses of a pure
// tone, `rate` chirps a second. The loop holds whole chirps, so it joins
// seamlessly; little random changes keep it from sounding mechanical.
export function cricketLoop(sr, seed, { fc = 3000, rate = 1.5, pulses = 4, pulse = 0.016, gap = 0.012, count = 12 } = {}) {
  const rand = mulberry32(seed);
  const period = 1 / rate;
  const n = Math.round(period * count * sr);
  const out = new Float32Array(n);
  for (let k = 0; k < count; k++) {
    const t0 = k * period + (rand() - 0.5) * 0.06 * period;
    const amp = 0.7 + 0.3 * rand();
    const f = fc * (1 + (rand() - 0.5) * 0.012);
    for (let p = 0; p < pulses; p++) {
      const start = Math.floor((t0 + p * (pulse + gap)) * sr);
      const len = Math.floor(pulse * sr);
      const a = amp * (p === 0 ? 0.7 : 1) * (p === pulses - 1 ? 0.8 : 1);
      for (let i = 0; i < len; i++) {
        let j = start + i;
        if (j < 0) j += n;
        if (j >= n) j -= n;
        const w = Math.sin((Math.PI * i) / len);
        out[j] += a * w * w * Math.sin((TAU * f * i) / sr);
      }
    }
  }
  filter(out, sr, 'lowpass', 5000, 0.6, true);
  return finishLoop([out], sr);
}

// A few bees busy among the flowers: a warm harmonic buzz for each, its
// pitch drifting as it flies and its level rising and falling as it comes
// and goes (and falls silent while it lands). Every modulation repeats a
// whole number of times per loop and each bee's pitch is trimmed to a whole
// number of cycles, so the loop is seamless.
export function beeLoop(sr, seed) {
  const rand = mulberry32(seed);
  const C = 64; // modulation is worked out every C samples and interpolated
  const n = Math.floor((12 * sr) / C) * C;
  const L = n / sr;
  const table = new Float32Array(2049);
  for (let i = 0; i <= 2048; i++) {
    let v = 0;
    for (let k = 1; k <= 14; k++) v += (Math.pow(0.82, k) / k) * Math.sin((TAU * k * i) / 2048);
    table[i] = v;
  }
  const L0 = new Float32Array(n);
  const R0 = new Float32Array(n);
  const bees = [
    { f: 160, pan: -0.45, amp: 1 },
    { f: 196, pan: 0.4, amp: 0.8 },
    { f: 232, pan: 0.05, amp: 0.55 },
  ];
  const nc = n / C + 1;
  const pitch = new Float32Array(nc);
  const level = new Float32Array(nc);
  const gl = new Float32Array(nc);
  const gr = new Float32Array(nc);
  for (const bee of bees) {
    const f = Math.round(bee.f * L) / L;
    const p = Array.from({ length: 6 }, () => rand() * TAU);
    for (let j = 0; j < nc; j++) {
      const u = j / (nc - 1);
      pitch[j] = f * (1 + 0.022 * Math.sin(TAU * 3 * u + p[0]) + 0.009 * Math.sin(TAU * 7 * u + p[1]) + 0.004 * Math.sin(TAU * 23 * u + p[2]));
      // comes and goes: a slow swell, sharpened so there are quiet gaps
      const come = 0.5 + 0.5 * Math.sin(TAU * 2 * u + p[3]);
      level[j] = Math.pow(come, 2.2) * (0.85 + 0.15 * Math.sin(TAU * 13 * u + p[4])) * bee.amp;
      const pan = Math.max(-1, Math.min(1, bee.pan + 0.3 * Math.sin(TAU * u + p[5])));
      gl[j] = Math.cos(((pan + 1) * Math.PI) / 4);
      gr[j] = Math.sin(((pan + 1) * Math.PI) / 4);
    }
    const raw = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const j = (i / C) | 0;
      const fr = (i - j * C) / C;
      ph += (pitch[j] + (pitch[j + 1] - pitch[j]) * fr) / sr;
      ph -= Math.floor(ph);
      const x = ph * 2048;
      const xi = x | 0;
      raw[i] = (table[xi] + (table[xi + 1] - table[xi]) * (x - xi)) * (level[j] + (level[j + 1] - level[j]) * fr);
    }
    filter(raw, sr, 'lowpass', 1400, 0.6, true);
    for (let i = 0; i < n; i++) {
      const j = (i / C) | 0;
      const fr = (i - j * C) / C;
      L0[i] += raw[i] * (gl[j] + (gl[j + 1] - gl[j]) * fr);
      R0[i] += raw[i] * (gr[j] + (gr[j + 1] - gr[j]) * fr);
    }
  }
  filter(L0, sr, 'highpass', 90, 0.6, true);
  filter(R0, sr, 'highpass', 90, 0.6, true);
  return finishLoop([L0, R0], sr);
}

// ------------------------------------------------------------ breeze

// A slow random flutter signal (about 5 to 20 Hz) that makes leaves rustle
// when it modulates filtered noise. Rendered at a low rate; it loops.
export function flutterLoop(sr, seed) {
  const rand = mulberry32(seed);
  const n = Math.floor(7 * sr);
  const out = white(n, rand);
  filter(out, sr, 'bandpass', 9, 0.5, true);
  filter(out, sr, 'lowpass', 22, 0.7, true);
  return finishLoop([out], sr);
}
