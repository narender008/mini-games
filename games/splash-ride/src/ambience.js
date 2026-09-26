// Splash Ride's world sounds: the ambience of each place, the animals' calls,
// the water textures the boats ride on, and the small offline DSP kit every
// sound module shares (music.js and audio.js import it from here).
//
// Real water is mostly bubbles and droplets. A drop that hits the surface
// traps a bubble that rings at its Minnaert frequency (about 3.3 kHz for a
// 1 mm bubble, 330 Hz for a 1 cm one) with a quick upward chirp as it
// collapses; a wave folding over or a hull pushing through adds thousands of
// them over a soft wash of broadband noise. So every water sound here is
// written once, in plain JS, from those parts (bubbles, grains of noise and
// filtered noise) into looping or one-shot buffers that Web Audio then plays
// cheaply. The animals are small additive voices: harmonic stacks through
// formants (a duck, a gull, a pigeon), nearly pure whistles (songbirds, a
// dolphin) and pulse trains (frogs, crickets).
//
// The places, all soft, nothing sudden, no voices:
//  - lagoon: surf breaking on the distant reef in slow swells, a breeze in
//    the palms, far-off gulls and a tern;
//  - lake: calm lapping at the shore, evening birdsong (blackbird, thrush,
//    robin), now and then a far duck or a fish jumping;
//  - canal: water lapping against stone walls (the walls are in the canal's
//    reverb), pigeons cooing, a church bell far away;
//  - bay: small waves on a beach at night, crickets, soft frogs and a wind
//    chime by the lanterns. No owls.
import { TAU, clamp, rand, pick, rng } from './config.js';

// ------------------------------------------------------------ the DSP kit

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const secs = (sr, s) => Math.max(1, Math.round(s * sr));
export const logRand = (r, a, b) => a * (b / a) ** r();

// A seeded generator for renders: config's, with the seed scrambled and the
// first few values dropped so that nearby seeds do not start alike.
export function seeded(seed) {
  const r = rng(Math.imul((seed | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0 || 1);
  for (let i = 0; i < 6; i++) r();
  return r;
}

// White noise that grains read at random offsets (much faster than a fresh
// random number per sample, and just as good to the ear).
const NOISE = (() => {
  const r = seeded(12345);
  const b = new Float32Array(65536);
  for (let i = 0; i < b.length; i++) b[i] = r() * 2 - 1;
  return b;
})();

// RBJ biquad, direct form I: lowpass, highpass or bandpass (0 dB peak).
export class Biquad {
  constructor(type, freq, q, sr) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, freq, q, sr);
  }

  set(type, freq, q, sr) {
    const w = (TAU * Math.min(freq, sr * 0.45)) / sr;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'lowpass') {
      b0 = (1 - cs) / 2;
      b1 = 1 - cs;
      b2 = b0;
    } else if (type === 'highpass') {
      b0 = (1 + cs) / 2;
      b1 = -(1 + cs);
      b2 = b0;
    } else {
      b0 = al;
      b1 = 0;
      b2 = -al;
    }
    const a0 = 1 + al;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - al) / a0;
  }

  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  // Filter a whole array in place. `cyclic` first runs through its end so a
  // looped buffer joins without a seam.
  process(buf, cyclic = false) {
    if (cyclic) for (let i = Math.max(0, buf.length - 24000); i < buf.length; i++) this.run(buf[i]);
    for (let i = 0; i < buf.length; i++) buf[i] = this.run(buf[i]);
    return buf;
  }
}

export function filt(buf, sr, type, freq, q = 0.707, cyclic = false) {
  return new Biquad(type, freq, q, sr).process(buf, cyclic);
}

// one-pole low- and high-pass, in place
export function lp1(d, sr, fc) {
  const a = Math.exp((-TAU * fc) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) d[i] = y = (1 - a) * d[i] + a * y;
  return d;
}

export function hp1(d, sr, fc) {
  const a = Math.exp((-TAU * fc) / sr);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    y1 = a * (y1 + x - x1);
    x1 = x;
    d[i] = y1;
  }
  return d;
}

// Run `process` over a loop as if it repeated forever: two copies back to
// back, keeping the second, whose start has the first's end as its past.
export function periodic(d, process) {
  const n = d.length;
  const x = new Float32Array(n * 2);
  x.set(d);
  x.set(d, n);
  process(x);
  return x.slice(n);
}

export function white(n, r) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = r() * 2 - 1;
  return b;
}

// Pink from white (Paul Kellet's filter), in place.
export function pinkify(buf, cyclic = false) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  const pass = (write) => {
    for (let i = write ? 0 : Math.max(0, buf.length - 24000); i < buf.length; i++) {
      const w = buf[i];
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      const y = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      if (write) buf[i] = y;
    }
  };
  if (cyclic) pass(false);
  pass(true);
  return buf;
}

// A slow random signal between -1 and 1 (noise low-passed at fc), looping.
export function slowNoise(n, sr, r, fc) {
  const d = periodic(white(n, r), (x) => {
    lp1(x, sr, fc);
    lp1(x, sr, fc);
    lp1(x, sr, fc);
  });
  removeDC(d);
  return normalise([d], 1)[0];
}

// Add a grain of white noise at sample `at`: a raised-cosine rise over
// `rise` samples, then an exponential fall to silence by `len` samples.
export function grain(out, at, len, rise, amp, r, wrap = false) {
  const n = out.length;
  rise = Math.max(1, Math.min(rise, len - 1));
  const fall = Math.exp(-5 / Math.max(1, len - rise));
  const taper = len * 0.9;
  const off = (r() * 65536) | 0;
  let e = 1;
  for (let i = 0; i < len; i++) {
    let j = at + i;
    if (j >= n) {
      if (!wrap) break;
      j -= n;
    }
    let v;
    if (i < rise) v = 0.5 - 0.5 * Math.cos((Math.PI * i) / rise);
    else {
      v = e;
      e *= fall;
      if (i > taper) v *= (len - i) / (len - taper);
    }
    out[j] += amp * v * NOISE[(off + i) & 65535];
  }
}

// A sine gliding (exponentially) from f0 to f1 over `glide` seconds, rising
// over `attack` and dying away with time constant `tau`, ending at zero.
export function tone(out, sr, at, { f0, f1 = f0, glide = 0.05, amp = 1, attack = 0.003, tau = 0.2, len = tau * 6, h2 = 0, wrap = false }) {
  const n = out.length;
  const total = Math.floor(len * sr);
  const att = Math.max(1, Math.floor(attack * sr));
  const tail = Math.max(1, Math.floor(total * 0.15));
  const ratio = f1 / f0;
  let ph = 0;
  for (let i = 0; i < total; i++) {
    let j = at + i;
    if (j >= n) {
      if (!wrap) break;
      j -= n;
    }
    const t = i / sr;
    const f = ratio !== 1 && glide > 0 ? f0 * ratio ** Math.min(1, t / glide) : f0;
    ph += (TAU * f) / sr;
    let e = Math.exp(-t / tau);
    if (i < att) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
    if (i > total - tail) e *= (total - i) / tail;
    out[j] += amp * e * (Math.sin(ph) + (h2 ? h2 * Math.sin(2 * ph) : 0));
  }
}

// Add amp * e^(-t/tau) * sin(2 pi f t + phase) from sample `at`, by a
// two-pole recursion, until it has died away to nothing.
export function damped(out, sr, at, f, amp, tau, phase = 0, wrap = false) {
  if (f >= sr * 0.47 || amp === 0) return;
  const n = out.length;
  const w = (TAU * f) / sr;
  const rr = Math.exp(-1 / (tau * sr));
  const c = 2 * rr * Math.cos(w);
  const r2 = rr * rr;
  let y2 = (amp / r2) * Math.sin(phase - 2 * w);
  let y1 = (amp / rr) * Math.sin(phase - w);
  const len = Math.min(wrap ? n : n - at, Math.ceil(tau * sr * 9.3));
  for (let i = 0; i < len; i++) {
    const y = c * y1 - r2 * y2;
    let j = at + i;
    if (j >= n) j -= n;
    out[j] += y;
    y2 = y1;
    y1 = y;
  }
}

// A water bubble (van den Doel's model): a sine whose pitch rises as the
// bubble collapses, damped at a rate set by its size. `d` overrides the
// damping (per second) for big, irregular bubbles that die sooner.
export function bubble(out, sr, at, f0, amp, rise = 0.1, wrap = false, d = 0) {
  if (f0 >= sr * 0.45) return;
  const n = out.length;
  if (!d) d = 0.043 * f0 + 0.0014 * f0 ** 1.5;
  const len = Math.min(Math.floor((6 / d) * sr), n);
  const att = Math.max(2, Math.floor(0.0008 * sr));
  let ph = 0;
  for (let i = 0; i < len; i++) {
    let j = at + i;
    if (j >= n) {
      if (!wrap) break;
      j -= n;
    }
    const t = i / sr;
    ph += (TAU * f0 * (1 + rise * d * t)) / sr;
    let e = Math.exp(-d * t);
    if (i < att) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
    if (i > len * 0.85) e *= (len - i) / (len * 0.15);
    out[j] += amp * e * Math.sin(ph);
  }
}

// Noise through a band-pass whose centre sweeps from fa to fb (log), under
// an envelope env(u) for u in 0..1 over `dur` seconds from `at`.
export function sweep(out, sr, at, dur, fa, fb, q, amp, r, env) {
  const len = Math.floor(dur * sr);
  const bq = new Biquad('bandpass', fa, q, sr);
  const off = (r() * 65536) | 0;
  for (let i = 0; i < len && at + i < out.length; i++) {
    const u = i / len;
    if ((i & 15) === 0) bq.set('bandpass', fa * (fb / fa) ** u, q, sr);
    out[at + i] += amp * env(u) * bq.run(NOISE[(off + i) & 65535]);
  }
}

// Ease the first `len` samples from `at` in with a raised cosine.
export function rampIn(buf, at, len) {
  for (let i = 0; i < at && i < buf.length; i++) buf[i] = 0;
  for (let i = 0; i < len && at + i < buf.length; i++) buf[at + i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / len);
}

export function fadeEnds(buf, head, tail) {
  const n = buf.length;
  head = Math.min(head, n >> 1);
  tail = Math.min(tail, n >> 1);
  for (let i = 0; i < head; i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / head);
  for (let i = 0; i < tail; i++) buf[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / tail);
  buf[0] = 0;
  buf[n - 1] = 0;
  return buf;
}

export function fadeTail(d, frac) {
  const n = d.length;
  const m = Math.max(1, Math.floor(n * frac));
  for (let i = 0; i < m; i++) d[n - m + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / m);
  return d;
}

export function removeDC(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i];
  const m = s / buf.length;
  for (let i = 0; i < buf.length; i++) buf[i] -= m;
  return buf;
}

export function mix(a, b, k = 1) {
  for (let i = 0; i < a.length; i++) a[i] += b[i] * k;
  return a;
}

// Scale channels together so the loudest sample is `peak`.
export function normalise(chans, peak = 1) {
  let m = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
  if (m > 0) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= peak / m;
  return chans;
}

export function normaliseRms(d, rms) {
  let e = 0;
  for (let i = 0; i < d.length; i++) e += d[i] * d[i];
  const k = rms / Math.sqrt(e / d.length || 1);
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return d;
}

// Cut a signal where it falls below `floor` of its peak for good, easing
// the new end to zero.
export function trim(d, floor) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  const th = m * floor;
  let cut = d.length - 1;
  while (cut > 0 && Math.abs(d[cut]) < th) cut--;
  if (cut >= d.length - 64) return d;
  const out = d.slice(0, cut + 64);
  fadeTail(out, 0.15);
  return out;
}

// Finish a one-shot: no DC, exactly zero at both ends, peak 1.
export function finish(chans, sr, headMs = 0.5, tailMs = 20) {
  for (const c of chans) {
    removeDC(c);
    fadeEnds(c, secs(sr, headMs / 1000), secs(sr, tailMs / 1000));
  }
  return { sr, ch: normalise(chans) };
}

// Finish a loop: no DC and peak 1 (it has no ends to fade).
export function finishLoop(chans, sr) {
  for (const c of chans) removeDC(c);
  return { sr, ch: normalise(chans) };
}

export function toBuffer(ctx, { sr, ch }) {
  const b = ctx.createBuffer(ch.length, ch[0].length, sr);
  ch.forEach((d, i) => b.getChannelData(i).set(d));
  return b;
}

// A space's impulse response: a diffuse tail of noise decaying at the
// reverb time through a low-pass that closes as it dies (air and soft
// things take the highs first), after early reflections that differ left
// and right, and, outdoors, a far echo or two (the shore across a lake), each
// a short smeared, darkened burst. Normalised to unit energy per channel,
// so a send gain is simply the wet-to-dry energy ratio.
export function renderIR(ctx, { rt, top, bottom, predelay, early = [], echoes = [] }) {
  const sr = ctx.sampleRate;
  let longest = rt * 1.4 + 0.05;
  for (const [time] of echoes) longest = Math.max(longest, time + 0.3);
  const n = Math.ceil(Math.min(2.6, longest) * sr);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n);
    const p0 = Math.round(predelay * sr);
    let lp = 0;
    let tail = 0;
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr;
      const fc = bottom + (top - bottom) * Math.exp((-3 * t) / rt);
      const a = Math.exp((-TAU * fc) / sr);
      lp = (1 - a) * (Math.random() * 2 - 1) + a * lp;
      d[i] = lp * Math.exp((-6.91 * t) / rt) * Math.min(1, t / 0.015 + 0.15);
      tail += d[i] * d[i];
    }
    // the early reflections carry about a third of the energy
    const smear = [0.5, 0.3, 0.15, 0.05];
    let e = 0;
    for (const [, g] of early) e += g * g;
    if (e > 0) {
      const k = Math.sqrt((tail * 0.5) / (e * smear.reduce((s, x) => s + x * x, 0)));
      for (const [time, g] of early) {
        const at = p0 + Math.round(time * sr * (ch ? 1.06 : 0.94));
        for (let j = 0; j < smear.length && at + j < n; j++) d[at + j] += g * smear[j] * k * (ch && j === 0 ? 0.9 : 1);
      }
    }
    // far echoes: a short diffuse burst each, darkened by distance
    for (const [time, g, fc] of echoes) {
      const at = Math.round((time + (ch ? 0.004 : 0)) * sr);
      const m = Math.round(0.06 * sr);
      const burst = new Float32Array(m);
      for (let i = 0; i < m; i++) burst[i] = (Math.random() * 2 - 1) * Math.exp(-i / (0.012 * sr));
      lp1(burst, sr, fc);
      lp1(burst, sr, fc);
      let be = 0;
      for (let i = 0; i < m; i++) be += burst[i] * burst[i];
      const k = Math.sqrt((tail * g * g) / (be || 1));
      for (let i = 0; i < m && at + i < n; i++) d[at + i] += burst[i] * k;
    }
    fadeTail(d, 0.12);
    let energy = 0;
    for (let i = 0; i < n; i++) energy += d[i] * d[i];
    const s = 1 / Math.sqrt(energy || 1);
    for (let i = 0; i < n; i++) d[i] *= s;
    buf.getChannelData(ch).set(d);
  }
  return buf;
}

// ------------------------------------------------------------ water textures

// Water rushing along a moving hull: a broadband wash with slow turbulence,
// a dense bed of small bubbles, the odd bigger gurgle and fine spatter
// against the hull. A 4 s seamless loop; the boat voice brightens and
// raises it with speed.
export function rushLoop(sr, seed) {
  const r = seeded(seed);
  const L = 4;
  const n = L * sr;
  const wash = white(n, r);
  filt(wash, sr, 'bandpass', 1000, 0.45, true);
  const turb = slowNoise(n, sr, r, 3);
  for (let i = 0; i < n; i++) wash[i] *= 0.7 + 0.3 * turb[i];
  normaliseRms(wash, 0.11);
  const out = new Float32Array(n);
  for (let k = 0; k < 900 * L; k++) bubble(out, sr, Math.floor(r() * n), logRand(r, 450, 4200), 0.012 + 0.05 * r() ** 3, 0.03 + 0.09 * r(), true);
  for (let k = 0; k < 45 * L; k++) bubble(out, sr, Math.floor(r() * n), logRand(r, 170, 550), 0.04 + 0.09 * r() ** 2, 0.08 + 0.12 * r(), true);
  const sp = new Float32Array(n);
  for (let k = 0; k < 260 * L; k++) grain(sp, Math.floor(r() * n), secs(sr, 0.0005 + 0.002 * r()), 2, 0.05 + 0.3 * r() ** 3, r, true);
  filt(sp, sr, 'bandpass', 3000, 0.8, true);
  mix(out, wash);
  mix(out, sp, 0.6);
  filt(out, sr, 'highpass', 110, 0.7, true);
  filt(out, sr, 'lowpass', Math.min(7500, sr * 0.4), 0.6, true);
  return finishLoop([out], sr);
}

// Foam: a fizz of countless tiny bubbles popping and a fine crackle over a
// thin hiss. The wake behind the boat and the spray at the bow, filtered
// differently. A 3 s loop.
export function fizzLoop(sr, seed) {
  const r = seeded(seed);
  const L = 3;
  const n = L * sr;
  const out = new Float32Array(n);
  const top = Math.min(7500, sr * 0.42);
  for (let k = 0; k < 2200 * L; k++) bubble(out, sr, Math.floor(r() * n), logRand(r, 1800, top), 0.008 + 0.03 * r() ** 4, 0.1, true);
  const cr = new Float32Array(n);
  for (let k = 0; k < 1400 * L; k++) grain(cr, Math.floor(r() * n), secs(sr, 0.0002 + 0.0006 * r()), 1, 0.3 * r() ** 4, r, true);
  filt(cr, sr, 'bandpass', 4500, 0.7, true);
  const hiss = white(n, r);
  filt(hiss, sr, 'bandpass', 3500, 0.6, true);
  const slow = slowNoise(n, sr, r, 5);
  for (let i = 0; i < n; i++) hiss[i] *= 0.8 + 0.2 * slow[i];
  normaliseRms(hiss, 0.03);
  mix(out, cr);
  mix(out, hiss);
  filt(out, sr, 'highpass', 600, 0.7, true);
  filt(out, sr, 'lowpass', Math.min(9000, sr * 0.42), 0.6, true);
  return finishLoop([out], sr);
}

// An outboard's exhaust leaving under water: big irregular bubbles
// gulping out in quick blubs, over a low muffled thump. A 3 s loop.
export function burbleLoop(sr, seed) {
  const r = seeded(seed);
  const L = 3;
  const n = L * sr;
  const out = new Float32Array(n);
  const low = new Float32Array(n);
  let t = r() * 0.05;
  while (t < L) {
    const at = Math.floor(t * sr);
    const a = 0.5 + 0.5 * r();
    grain(low, at, secs(sr, 0.03 + 0.04 * r()), secs(sr, 0.004), a, r, true);
    const k = 1 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) bubble(out, sr, at + Math.floor(r() * 0.015 * sr), logRand(r, 80, 260), a * (0.4 + 0.6 * r()), 0.05 + 0.1 * r(), true, 30 + 30 * r());
    t += 0.07 + 0.12 * r();
  }
  filt(low, sr, 'lowpass', 260, 0.7, true);
  mix(out, low, 1.2);
  filt(out, sr, 'highpass', 45, 0.7, true);
  filt(out, sr, 'lowpass', 1100, 0.7, true);
  return finishLoop([out], sr);
}

// Small waves meeting something: a soft swell of water noise as each
// wavelet arrives, a gloop as it folds over and traps air, and drops after.
//  - 'hull': lapping against a boat at rest;
//  - 'shore': ripples on a lake shore (more fizz on the pebbles, few gloops);
//  - 'stone': the canal against its walls (more gloops, a hollow knock where
//    water slaps into a gap in the stones).
// An 8 s loop.
export function lapLoop(sr, seed, kind = 'hull') {
  const r = seeded(seed);
  const L = 8;
  const n = L * sr;
  const stone = kind === 'stone';
  const shore = kind === 'shore';
  const slosh = new Float32Array(n);
  const plip = new Float32Array(n);
  const fizz = new Float32Array(n);
  const out = new Float32Array(n);
  let t = r() * 0.3;
  while (t < L) {
    const at = Math.floor(t * sr);
    const a = 0.4 + 0.6 * r();
    grain(slosh, at, secs(sr, 0.12 + 0.2 * r()), secs(sr, 0.04 + 0.05 * r()), a, r, true);
    const gl = stone ? 1 + Math.floor(r() * 3) : shore ? (r() < 0.35 ? 1 : 0) : 1 + Math.floor(r() * 2);
    for (let k = 0; k < gl; k++) bubble(out, sr, at + Math.floor((0.02 + 0.12 * r()) * sr), logRand(r, stone ? 150 : 200, stone ? 420 : 600), a * (0.2 + 0.3 * r()), 0.1 + 0.15 * r(), true, 25 + 25 * r());
    if (stone && r() < 0.5) damped(out, sr, at + Math.floor(0.03 * r() * sr), 150 + 110 * r(), a * 0.1, 0.03, 0, true);
    const pl = shore ? 3 + Math.floor(r() * 6) : 1 + Math.floor(r() * 4);
    for (let k = 0; k < pl; k++) bubble(plip, sr, at + Math.floor((0.05 + 0.35 * r()) * sr), logRand(r, 700, 2400), a * (0.04 + 0.1 * r() ** 2), 0.15 + 0.2 * r(), true);
    if (shore) for (let k = 0; k < 30; k++) grain(fizz, at + Math.floor((0.05 + 0.5 * r() ** 1.5) * sr), secs(sr, 0.0008 + 0.002 * r()), 2, a * 0.3 * r() ** 2, r, true);
    t += (stone ? 0.3 : shore ? 0.6 : 0.45) + (stone ? 0.6 : 1.0) * r();
  }
  filt(slosh, sr, 'lowpass', stone ? 700 : 520, 0.7, true);
  filt(slosh, sr, 'highpass', 70, 0.7, true);
  filt(fizz, sr, 'bandpass', 3200, 0.9, true);
  mix(out, slosh, 1.1);
  mix(out, plip);
  mix(out, fizz, 0.8);
  filt(out, sr, 'lowpass', 4500, 0.6, true);
  return finishLoop([out], sr);
}

// Water chuckling along a wooden hull under sail: little bursts of bubbles
// every fraction of a second over a soft wash. A 5 s loop.
export function chuckleLoop(sr, seed) {
  const r = seeded(seed);
  const L = 5;
  const n = L * sr;
  const wash = white(n, r);
  filt(wash, sr, 'bandpass', 700, 0.6, true);
  const slow = slowNoise(n, sr, r, 6);
  for (let i = 0; i < n; i++) wash[i] *= 0.6 + 0.4 * slow[i];
  normaliseRms(wash, 0.05);
  const out = new Float32Array(n);
  let t = r() * 0.2;
  while (t < L) {
    const at = Math.floor(t * sr);
    const a = 0.3 + 0.7 * r();
    const k = 2 + Math.floor(r() * 5);
    for (let i = 0; i < k; i++) bubble(out, sr, at + Math.floor(r() * 0.06 * sr), logRand(r, 260, 1300), a * (0.15 + 0.35 * r()), 0.08 + 0.12 * r(), true);
    if (r() < 0.3) bubble(out, sr, at + Math.floor((0.05 + 0.1 * r()) * sr), logRand(r, 1400, 3000), a * 0.1, 0.15, true);
    t += 0.12 + 0.33 * r();
  }
  mix(out, wash);
  filt(out, sr, 'highpass', 90, 0.7, true);
  filt(out, sr, 'lowpass', 4000, 0.6, true);
  return finishLoop([out], sr);
}

// Surf on a distant reef: a steady, dark roar that swells as each wave
// breaks (a slow rise, then a long wash), with a little brightness at each
// break. A 16 s loop.
export function surfLoop(sr, seed) {
  const r = seeded(seed);
  const L = 16;
  const n = L * sr;
  const roar = pinkify(white(n, r), true);
  filt(roar, sr, 'lowpass', 650, 0.6, true);
  filt(roar, sr, 'highpass', 55, 0.7, true);
  const bright = white(n, r);
  filt(bright, sr, 'bandpass', 1300, 0.5, true);
  normaliseRms(roar, 0.2);
  normaliseRms(bright, 0.2);
  const env = new Float32Array(n).fill(0.5);
  const benv = new Float32Array(n);
  let t = r() * 1.5;
  while (t < L - 0.5) {
    const at = Math.floor(t * sr);
    const amp = 0.6 + 0.4 * r();
    const rise = 1.4 + 0.8 * r();
    const decay = 2.5 + r();
    for (let i = 0; i < n; i++) {
      const u = ((i - at + n) % n) / sr;
      if (u > rise + decay * 6) continue;
      env[i] += amp * (u < rise ? 0.5 - 0.5 * Math.cos((Math.PI * u) / rise) : Math.exp(-(u - rise) / decay));
      const b = u - rise + 0.4;
      if (b > 0 && b < 5) benv[i] += amp * (b < 0.5 ? b / 0.5 : Math.exp(-(b - 0.5) / 0.9));
    }
    t += 3.2 + 2.3 * r();
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = roar[i] * env[i] + bright[i] * 0.22 * benv[i];
  filt(out, sr, 'lowpass', 2500, 0.6, true);
  return finishLoop([out], sr);
}

// Small waves on a beach at night: each wave a soft break, the foam
// fizzing up the sand and the backwash drawing back, every 5-7 s over a low
// murmur of the sea. An 18 s loop.
export function beachLoop(sr, seed) {
  const r = seeded(seed);
  const L = 18;
  const n = L * sr;
  const murmur = pinkify(white(n, r), true);
  filt(murmur, sr, 'lowpass', 400, 0.6, true);
  normaliseRms(murmur, 0.05);
  const brk = pinkify(white(n, r), true);
  filt(brk, sr, 'lowpass', 1400, 0.6, true);
  normaliseRms(brk, 0.2);
  const back = white(n, r);
  filt(back, sr, 'bandpass', 900, 0.7, true);
  normaliseRms(back, 0.2);
  const foam = new Float32Array(n);
  const eb = new Float32Array(n);
  const ek = new Float32Array(n);
  let t = r();
  const waves = [];
  while (t < L - 1) {
    waves.push([t, 0.6 + 0.4 * r()]);
    t += 5 + 2 * r();
  }
  for (const [t0, amp] of waves) {
    for (let i = 0; i < n; i++) {
      const u = ((i - Math.floor(t0 * sr) + n) % n) / sr;
      if (u < 6) {
        eb[i] += amp * (u < 0.8 ? 0.5 - 0.5 * Math.cos((Math.PI * u) / 0.8) : Math.exp(-(u - 0.8) / 0.7));
        const v = u - 2.3;
        if (v > 0) ek[i] += amp * 0.4 * (v < 0.5 ? v / 0.5 : Math.exp(-(v - 0.5) / 1.3));
      }
    }
    // the foam running up the sand
    const a0 = Math.floor((t0 + 0.5) * sr);
    for (let k = 0; k < 1200; k++) {
      const u = r() ** 0.8 * 2.4;
      const e = u < 0.3 ? u / 0.3 : Math.exp(-(u - 0.3) / 0.9);
      grain(foam, (a0 + Math.floor(u * sr)) % n, secs(sr, 0.0008 + 0.0025 * r()), 2, amp * e * (0.1 + 0.5 * r() ** 2), r, true);
    }
    for (let k = 0; k < 160; k++) {
      const u = r() * 2.2;
      bubble(foam, sr, (a0 + Math.floor(u * sr)) % n, logRand(r, 1500, Math.min(5000, sr * 0.4)), amp * 0.05 * Math.exp(-u / 1.2), 0.1, true);
    }
  }
  filt(foam, sr, 'bandpass', 2600, 0.6, true);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = murmur[i] + brk[i] * eb[i] + back[i] * ek[i] + foam[i] * 0.9;
  filt(out, sr, 'lowpass', Math.min(5500, sr * 0.42), 0.6, true);
  filt(out, sr, 'highpass', 50, 0.7, true);
  return finishLoop([out], sr);
}

// One cricket singing on and on: soft chirps of a few pulses of a pure
// tone. The loop holds whole chirps, so it joins seamlessly.
export function cricketLoop(sr, seed, { fc = 3000, rate = 1.5, pulses = 4, pulse = 0.016, gap = 0.012, count = 12 } = {}) {
  const r = seeded(seed);
  const period = 1 / rate;
  const n = Math.round(period * count * sr);
  const out = new Float32Array(n);
  for (let k = 0; k < count; k++) {
    const t0 = k * period + (r() - 0.5) * 0.06 * period;
    const amp = 0.7 + 0.3 * r();
    const f = fc * (1 + (r() - 0.5) * 0.012);
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
  filt(out, sr, 'lowpass', 5000, 0.6, true);
  return finishLoop([out], sr);
}

// A slow gust signal (-1..1) for breezes and wind, rendered at a low rate.
export function gustLoop(sr, seed) {
  const r = seeded(seed);
  const n = 24 * sr;
  return { sr, ch: [slowNoise(n, sr, r, 0.35)] };
}

// A faster random flutter (about 5-20 Hz) for leaves, cloth and jitter.
export function flutterLoop(sr, seed) {
  const r = seeded(seed);
  const n = 7 * sr;
  const out = white(n, r);
  filt(out, sr, 'bandpass', 9, 0.5, true);
  filt(out, sr, 'lowpass', 22, 0.7, true);
  return finishLoop([out], sr);
}

// ------------------------------------------------------------ animals and far-off things

// A harmonic voice: per sample, a pitch contour f(u) and a sum of harmonics
// with amplitudes amp(k, f) (a formant), under a raised-cosine envelope.
export function voiced(out, sr, at, dur, { f, harm, attack = 0.015, release = 0.05, amp = 1, am = null, jitter = 0 }, r) {
  const len = Math.floor(dur * sr);
  const att = Math.max(1, Math.floor(attack * sr));
  const rel = Math.max(1, Math.floor(release * sr));
  let ph = 0;
  const jr = r() * TAU;
  const H = 24;
  const amps = new Float32Array(H + 1);
  for (let i = 0; i < len && at + i < out.length; i++) {
    const u = i / len;
    const t = i / sr;
    let fi = f(u);
    if (jitter) fi *= 1 + jitter * Math.sin(TAU * 23 * t + jr) + jitter * 0.6 * Math.sin(TAU * 41 * t + 2 * jr);
    ph += (TAU * fi) / sr;
    if ((i & 31) === 0) for (let k = 1; k <= H; k++) amps[k] = k * fi < Math.min(9000, sr * 0.45) ? harm(k, fi) : 0;
    let s = 0;
    for (let k = 1; k <= H; k++) if (amps[k]) s += amps[k] * Math.sin(k * ph);
    let e = amp;
    if (i < att) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
    if (i > len - rel) e *= 0.5 - 0.5 * Math.cos((Math.PI * (len - i)) / rel);
    if (am) e *= am(t);
    out[at + i] += e * s;
  }
}

// a formant: a bump in log frequency around fc, `width` octaves wide
const formant = (x, fc, width) => Math.exp(-((Math.log2(x / fc) / width) ** 2));

// A herring gull far off: a few "kyow" notes, each leaping up then sliding
// down, harmonic-rich with a nasal formant and a slight roughness.
export function gullCall(sr, seed) {
  const r = seeded(seed);
  const notes = 2 + Math.floor(r() * 4);
  const plan = [];
  let t = 0.02;
  for (let k = 0; k < notes; k++) {
    const dur = 0.2 + 0.15 * r();
    const f0 = 600 + 120 * r();
    const peak = f0 * (1.5 + 0.2 * r());
    const end = f0 * (1.05 + 0.15 * r());
    plan.push([t, dur, f0, peak, end, 1 - 0.12 * k]);
    t += dur + 0.08 + 0.12 * r();
  }
  const out = new Float32Array(Math.ceil((t + 0.1) * sr));
  for (const [t0, dur, f0, peak, end, a] of plan) {
    const rough = 60 + 20 * r();
    voiced(out, sr, Math.floor(t0 * sr), dur, {
      f: (u) => (u < 0.25 ? f0 + (peak - f0) * Math.sin((Math.PI / 2) * (u / 0.25)) : peak + (end - peak) * ((u - 0.25) / 0.75) ** 0.8),
      harm: (k, fi) => (formant(k * fi, 1900, 0.9) + 0.15) / k ** 0.6,
      attack: 0.015,
      release: 0.06,
      amp: a,
      am: (tt) => 1 - 0.2 * (0.5 + 0.5 * Math.sin(TAU * rough * tt)),
      jitter: 0.008,
    }, r);
  }
  filt(out, sr, 'highpass', 400, 0.7);
  filt(out, sr, 'lowpass', 5000, 0.6);
  return finish([out], sr, 1, 30);
}

// A tern: a few quick, high "kip" calls.
export function ternCall(sr, seed) {
  const r = seeded(seed);
  const notes = 3 + Math.floor(r() * 4);
  const out = new Float32Array(Math.ceil((0.05 + notes * 0.2) * sr));
  let t = 0.02;
  for (let k = 0; k < notes; k++) {
    const f0 = 2500 + 300 * r();
    voiced(out, sr, Math.floor(t * sr), 0.045 + 0.025 * r(), {
      f: (u) => f0 * (1.04 - 0.12 * u),
      harm: (h) => [0, 1, 0.3, 0.1][h] || 0,
      attack: 0.005,
      release: 0.02,
      amp: 1 - 0.08 * k,
    }, r);
    t += 0.12 + 0.08 * r();
  }
  filt(out, sr, 'lowpass', 6000, 0.6);
  return finish([out], sr, 1, 20);
}

// A mallard, softly: two to four nasal quacks, each a little lower and
// quieter, from a buzzy harmonic source through two formants.
export function duckQuack(sr, seed) {
  const r = seeded(seed);
  const count = 2 + Math.floor(r() * 3);
  const plan = [];
  let t = 0.02;
  for (let k = 0; k < count; k++) {
    const dur = 0.13 + 0.07 * r();
    plan.push([t, dur, (330 - 25 * k) * (0.94 + 0.12 * r()), 1 - 0.18 * k]);
    t += dur + 0.07 + 0.06 * r();
  }
  const src = new Float32Array(Math.ceil((t + 0.1) * sr));
  for (const [t0, dur, f0, a] of plan) {
    voiced(src, sr, Math.floor(t0 * sr), dur, {
      f: (u) => f0 * (1 + 0.12 * Math.sin(Math.PI * u)) * (1 - 0.1 * u),
      harm: (k) => 1 / k,
      attack: 0.008,
      release: 0.03,
      amp: a,
      am: (tt) => 1 - 0.25 * (0.5 + 0.5 * Math.sin(TAU * f0 * 0.5 * tt)),
      jitter: 0.012,
    }, r);
  }
  const f1 = Float32Array.from(src);
  const f2 = Float32Array.from(src);
  filt(f1, sr, 'bandpass', 1050, 3);
  filt(f2, sr, 'bandpass', 2300, 4);
  const out = new Float32Array(src.length);
  mix(out, f1, 1);
  mix(out, f2, 0.6);
  mix(out, src, 0.06);
  filt(out, sr, 'lowpass', 4000, 0.6);
  return finish([out], sr, 1, 30);
}

// A pigeon on a sill: "coo, rrroo-oo, coo", low and soft, the middle note
// rolling, with a breath of air.
export function pigeonCoo(sr, seed) {
  const r = seeded(seed);
  const k = 0.92 + 0.16 * r();
  const segs = [
    [0.02, 0.18, (u) => k * (520 + 40 * u), 0],
    [0.26, 0.5, (u) => k * (540 + 90 * Math.sin(Math.PI * u) - 30 * u), 24 + 6 * r()],
    [0.86, 0.32, (u) => k * (590 - 100 * u), 0],
  ];
  const n = Math.ceil(1.25 * sr);
  const out = new Float32Array(n);
  for (const [t0, dur, f, trill] of segs) {
    voiced(out, sr, Math.floor(t0 * sr), dur, {
      f,
      harm: (h) => [0, 1, 0.35, 0.12][h] || 0,
      attack: 0.03,
      release: 0.07,
      am: trill ? (tt) => 1 - 0.55 * (0.5 + 0.5 * Math.cos(TAU * trill * tt)) : null,
    }, r);
  }
  const breath = new Float32Array(n);
  for (const [t0, dur] of segs) grain(breath, Math.floor(t0 * sr), Math.floor(dur * sr), Math.floor(0.03 * sr), 0.06, r);
  filt(breath, sr, 'lowpass', 900, 0.7);
  mix(out, breath);
  filt(out, sr, 'lowpass', 1400, 0.7);
  return finish([out], sr, 1, 30);
}

// A small frog: a soft "rib-bit" (two short pulse trains of a rounded
// carrier) or a low "brrup".
export function frogCall(sr, seed) {
  const r = seeded(seed);
  const n = Math.ceil(0.45 * sr);
  const out = new Float32Array(n);
  const pulses = (t0, dur, rate, fc, tau, amp) => {
    for (let t = t0; t < t0 + dur; t += 1 / rate) {
      const u = (t - t0) / dur;
      const a = amp * Math.sin(Math.PI * u) ** 0.6;
      damped(out, sr, Math.floor(t * sr), fc * (1 + 0.04 * u), a, tau, 0);
      damped(out, sr, Math.floor(t * sr), fc * 0.5, a * 0.35, tau * 1.4, 0);
    }
  };
  if (r() < 0.65) {
    const fc = 1300 + 350 * r();
    pulses(0.01, 0.07, 105 + 15 * r(), fc, 0.0028, 1);
    pulses(0.14, 0.1, 90 + 12 * r(), fc * 1.06, 0.0028, 0.9);
  } else {
    pulses(0.01, 0.22, 36 + 6 * r(), 480 + 80 * r(), 0.007, 1);
  }
  filt(out, sr, 'lowpass', 3000, 0.6);
  return finish([out], sr, 0.5, 30);
}

// A dolphin alongside: a whistle or two (smooth sweeps, softened into a
// friendly range), a quick train of clicks, or the "pfff" of its blow as it
// surfaces, and the little breath in after.
export function dolphinCall(sr, seed, variant = 0) {
  const r = seeded(seed);
  const n = Math.ceil(1.6 * sr);
  const out = new Float32Array(n);
  const whistle = (t0) => {
    const dur = 0.35 + 0.45 * r();
    const shape = Math.floor(r() * 3);
    const a = 2200 + 900 * r();
    const b = a * (1.3 + 0.4 * r());
    const rate = 2 + 2 * r();
    const f = shape === 0 ? (u) => a * (b / a) ** u : shape === 1 ? (u) => (a + b) / 2 + ((b - a) / 2) * Math.sin(TAU * rate * u * dur) : (u) => a + (b - a) * Math.sin(Math.PI * u);
    voiced(out, sr, Math.floor(t0 * sr), dur, { f, harm: (k) => [0, 1, 0.06][k] || 0, attack: 0.04, release: 0.08, amp: 0.3 }, r);
    return t0 + dur;
  };
  const clicks = (t0) => {
    const count = 15 + Math.floor(r() * 25);
    let t = t0;
    let ici = 0.03;
    for (let k = 0; k < count; k++) {
      const at = Math.floor(t * sr);
      grain(out, at, secs(sr, 0.0006), 2, 0.12, r);
      damped(out, sr, at, 3300 + 500 * r(), 0.15, 0.0004);
      t += ici;
      ici = Math.max(0.008, ici * 0.94);
    }
    return t;
  };
  const blow = (t0) => {
    const b = new Float32Array(n);
    grain(b, Math.floor(t0 * sr), secs(sr, 0.24), secs(sr, 0.015), 1, r);
    grain(b, Math.floor((t0 + 0.36) * sr), secs(sr, 0.1), secs(sr, 0.02), 0.35, r);
    filt(b, sr, 'bandpass', 1150, 0.6);
    mix(out, b, 1.4);
    return t0 + 0.5;
  };
  if (variant === 0) whistle(blow(0.01) + 0.05);
  else if (variant === 1) whistle(whistle(0.01) - 0.1);
  else if (variant === 2) whistle(clicks(0.01) + 0.05);
  else clicks(blow(0.01));
  filt(out, sr, 'highpass', 250, 0.7);
  filt(out, sr, 'lowpass', 6000, 0.6);
  return finish([out], sr, 0.5, 40);
}

// A fish jumping and falling back: a small crown of splash, the deep
// "plop" of the cavity closing (a big bubble whose pitch jumps up), and a
// few drops after.
export function fishPlop(sr, seed) {
  const r = seeded(seed);
  const n = Math.ceil(0.6 * sr);
  const out = new Float32Array(n);
  const crown = new Float32Array(n);
  grain(crown, secs(sr, 0.002), secs(sr, 0.025), secs(sr, 0.002), 0.4, r);
  filt(crown, sr, 'bandpass', 1500, 0.7);
  mix(out, crown);
  const f0 = 380 + 240 * r();
  const at = secs(sr, 0.012);
  let ph = 0;
  for (let i = 0; i < Math.floor(0.2 * sr); i++) {
    const t = i / sr;
    ph += (TAU * f0 * (1 + 0.45 * (1 - Math.exp(-t / 0.035)))) / sr;
    const e = Math.exp(-t / 0.045) * Math.min(1, i / (0.001 * sr));
    out[at + i] += e * Math.sin(ph);
  }
  for (let k = 0; k < 5 + Math.floor(r() * 6); k++) bubble(out, sr, Math.floor((0.05 + 0.35 * r()) * sr), logRand(r, 1500, 4000), 0.05 + 0.1 * r(), 0.15);
  filt(out, sr, 'lowpass', 6000, 0.6);
  return finish([out], sr, 0.5, 30);
}

// A church bell far off, one stroke: the partials of a real bell (hum,
// prime, minor-third tierce, quint, nominal and the upper ones), each a
// slowly beating pair, softened by distance. `f` is the prime.
export function churchBell(sr, seed, f = 349) {
  const r = seeded(seed);
  const n = Math.ceil(6 * sr);
  const out = new Float32Array(n);
  const parts = [[0.5, 0.5, 3.5], [1, 0.6, 2.2], [1.2, 0.45, 2.0], [1.5, 0.15, 1.0], [2, 0.6, 1.4], [2.5, 0.2, 0.7], [2.66, 0.15, 0.6], [3, 0.12, 0.5], [4, 0.06, 0.3]];
  for (const [k, a, tau] of parts) {
    damped(out, sr, 0, f * k, a * 0.6, tau, r() * TAU);
    damped(out, sr, 0, f * k + 0.3 + 0.4 * r(), a * 0.4, tau * 0.9, r() * TAU);
  }
  const strike = new Float32Array(n);
  grain(strike, 0, secs(sr, 0.004), 2, 0.2, r);
  lp1(strike, sr, 2500);
  mix(out, strike);
  rampIn(out, 0, secs(sr, 0.002));
  filt(out, sr, 'lowpass', 2400, 0.6);
  fadeTail(out, 0.2);
  return finish([out], sr, 0.5, 100);
}

// ------------------------------------------------------------ songbirds

const lin = (a, b) => (u) => a + (b - a) * u;
const glide = (a, b) => (u) => a * (b / a) ** u;
const arch = (a, p, b) => (u) => (u < 0.5 ? a + (p - a) * Math.sin(Math.PI * u) : b + (p - b) * Math.sin(Math.PI * u));

function song(r) {
  const els = [];
  const s = { t: 0.015 };
  const x = (a, b) => a + r() * (b - a);
  s.add = (e, gap) => {
    els.push({ at: s.t, ...e });
    s.t += e.dur + gap;
  };
  return { els, s, x };
}

// A European robin: varied, liquid phrases leaping between high and low.
function robin(r) {
  const { els, s, x } = song(r);
  const fi = x(5000, 6000);
  s.add({ dur: x(0.08, 0.14), f: lin(fi, fi * x(0.9, 0.97)), amp: 0.5, attack: 0.012, release: 0.02 }, x(0.05, 0.1));
  const count = 5 + Math.floor(r() * 6);
  for (let k = 0; k < count; k++) {
    const type = r();
    const gap = x(0.012, 0.06);
    if (type < 0.25) {
      const c = x(3000, 4800);
      s.add({ dur: x(0.1, 0.2), f: lin(c, c * x(0.9, 1.1)), vib: [x(24, 40), x(250, 550)], amp: x(0.6, 0.9) }, gap);
    } else if (type < 0.5) {
      const a = x(4800, 6500);
      s.add({ dur: x(0.035, 0.08), f: glide(a, a * x(0.5, 0.7)), amp: x(0.6, 1), attack: 0.004 }, gap);
    } else if (type < 0.7) {
      const a = x(2800, 4200);
      s.add({ dur: x(0.06, 0.12), f: arch(a, a * x(1.25, 1.5), a * x(0.85, 1.05)), amp: x(0.7, 1) }, gap);
    } else if (type < 0.85) {
      const a = x(4200, 5800);
      const d = x(0.022, 0.032);
      for (let i = 0; i < 3 + Math.floor(r() * 5); i++) s.add({ dur: d, f: glide(a, a * 0.72), amp: x(0.55, 0.8), attack: 0.003, release: 0.007 }, x(0.008, 0.014));
      s.t += gap;
    } else {
      const a = x(2400, 4000);
      s.add({ dur: x(0.09, 0.18), f: lin(a, a * x(0.97, 1.06)), amp: x(0.6, 0.85) }, gap);
    }
  }
  return els;
}

// A blackbird at dusk: a few mellow, fluted notes low in its range, gently
// slurred and warbled, then a quiet, higher twitter.
function blackbird(r) {
  const { els, s, x } = song(r);
  const count = 3 + Math.floor(r() * 4);
  for (let k = 0; k < count; k++) {
    const type = r();
    const c = x(1500, 2700);
    const gap = x(0.02, 0.08);
    if (type < 0.35) s.add({ dur: x(0.15, 0.3), f: arch(c, c * x(1.1, 1.3), c * x(0.85, 1)), amp: x(0.7, 1), attack: 0.02, release: 0.04 }, gap);
    else if (type < 0.6) s.add({ dur: x(0.15, 0.28), f: lin(c, c * x(0.92, 1.08)), vib: [x(18, 28), x(80, 160)], amp: x(0.7, 0.95), attack: 0.02, release: 0.04 }, gap);
    else if (type < 0.8) s.add({ dur: x(0.08, 0.16), f: glide(c, c * x(1.3, 1.6)), amp: x(0.6, 0.9), attack: 0.012 }, gap);
    else s.add({ dur: x(0.1, 0.2), f: glide(c * 1.3, c * x(0.8, 0.9)), amp: x(0.6, 0.9), attack: 0.015 }, gap);
  }
  s.t += x(0.03, 0.08);
  const tw = 3 + Math.floor(r() * 7);
  for (let k = 0; k < tw; k++) {
    const a = x(3500, 6000);
    s.add({ dur: x(0.02, 0.04), f: glide(a, a * x(0.7, 1.3)), amp: x(0.25, 0.45), attack: 0.003, release: 0.008 }, x(0.01, 0.03));
  }
  return els;
}

// A song thrush: a short, bright motif sung two to four times over.
function thrush(r) {
  const { els, s, x } = song(r);
  const motif = [];
  for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
    const a = x(2200, 4800);
    const type = r();
    motif.push({ dur: x(0.04, 0.11), f: type < 0.4 ? glide(a, a * x(1.3, 1.6)) : type < 0.7 ? glide(a, a * x(0.6, 0.8)) : arch(a, a * 1.3, a), gap: x(0.015, 0.04), amp: x(0.6, 1) });
  }
  const reps = 2 + Math.floor(r() * 3);
  for (let rep = 0; rep < reps; rep++) {
    for (const m of motif) s.add({ dur: m.dur, f: m.f, amp: m.amp * (1 - 0.06 * rep), attack: 0.005 }, m.gap);
    s.t += x(0.06, 0.12);
  }
  return els;
}

const SONGS = { robin, blackbird, thrush };

// One phrase of birdsong. A syrinx makes nearly pure whistles, so each
// element is a sine with its glide, warble and envelope.
export function birdPhrase(sr, seed, kind) {
  const r = seeded(seed);
  const els = (SONGS[kind] || robin)(r);
  let end = 0;
  for (const e of els) end = Math.max(end, e.at + e.dur);
  const n = Math.ceil((end + 0.05) * sr);
  const out = new Float32Array(n);
  for (const e of els) {
    const start = Math.floor(e.at * sr);
    const len = Math.max(8, Math.floor(e.dur * sr));
    const att = Math.max(1, Math.min(len >> 1, Math.floor((e.attack ?? 0.006) * sr)));
    const rel = Math.max(1, Math.min(len >> 1, Math.floor((e.release ?? 0.01) * sr)));
    let ph = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      const u = i / len;
      let f = e.f(u);
      if (e.vib) f += e.vib[1] * Math.sin((TAU * e.vib[0] * i) / sr);
      ph += (TAU * f) / sr;
      let env = e.amp;
      if (i < att) env *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
      if (i > len - rel) env *= 0.5 - 0.5 * Math.cos((Math.PI * (len - i)) / rel);
      out[start + i] += env * (Math.sin(ph) + 0.06 * Math.sin(2 * ph));
    }
  }
  filt(out, sr, 'highpass', 1000, 0.7);
  filt(out, sr, 'lowpass', 7000, 0.7);
  return finish([out], sr, 1, 20);
}

// ------------------------------------------------------------ calls, rendered on demand

// Every kind of call: its renderer, sample rate and how many different
// renders to keep (a fresh one replaces an old one now and then).
export const CALLS = {
  gull: { render: gullCall, sr: 22050, keep: 4 },
  tern: { render: ternCall, sr: 22050, keep: 3 },
  duck: { render: duckQuack, sr: 22050, keep: 4 },
  pigeon: { render: pigeonCoo, sr: 16000, keep: 4 },
  frog: { render: frogCall, sr: 22050, keep: 6 },
  dolphin: { render: (sr, s) => dolphinCall(sr, s, s % 4), sr: 32000, keep: 4 },
  splashfish: { render: fishPlop, sr: 24000, keep: 4 },
  robin: { render: (sr, s) => birdPhrase(sr, s, 'robin'), sr: 22050, keep: 4 },
  blackbird: { render: (sr, s) => birdPhrase(sr, s, 'blackbird'), sr: 22050, keep: 4 },
  thrush: { render: (sr, s) => birdPhrase(sr, s, 'thrush'), sr: 22050, keep: 4 },
  bell: { render: (sr, s) => churchBell(sr, s, 349.2), sr: 22050, keep: 2 },
};

// Bring a rendered call to an even loudness: the RMS of its loudest 300 ms
// set to `rms`, but never past a peak of 1. Different renders of a call (a
// whistle or just a blow, one quack or four) then sound equally loud.
export function evenOut({ sr, ch }, rms = 0.12) {
  const n = ch[0].length;
  const w = Math.max(1, Math.floor(0.3 * sr));
  let best = 0;
  let peak = 0;
  let e = 0;
  const sq = (i) => ch.reduce((s, c) => s + c[i] * c[i], 0) / ch.length;
  for (let i = 0; i < n; i++) {
    e += sq(i);
    if (i >= w) e -= sq(i - w);
    best = Math.max(best, e / Math.min(w, i + 1));
    for (const c of ch) peak = Math.max(peak, Math.abs(c[i]));
  }
  const k = Math.min(rms / Math.sqrt(best || 1e-12), 1 / (peak || 1));
  for (const c of ch) for (let i = 0; i < n; i++) c[i] *= k;
  return { sr, ch };
}

// Loudness of each call at 10 m (calls are evened out, see above).
const CALL_LEVEL = { gull: 0.8, tern: 0.5, duck: 0.5, pigeon: 0.25, frog: 0.25, dolphin: 0.5, splashfish: 0.5, robin: 0.35, blackbird: 0.4, thrush: 0.35, bell: 2 };

// how loud and how dark something `dist` metres away is
export const distGain = (d) => clamp(12 / (Math.max(0, d) + 2), 0.03, 1.5);
export const distCut = (d) => clamp(14000 / (1 + Math.max(0, d) / 25), 1200, 12000);

// ------------------------------------------------------------ the places

// Loop renders, by name: [renderer, sample rate]. Mono; beds read each loop
// twice from different points and pan the two apart for width.
export const LOOPS = {
  surf: [(sr) => surfLoop(sr, 11), 12000],
  beach: [(sr) => beachLoop(sr, 12), 16000],
  shore: [(sr) => lapLoop(sr, 13, 'shore'), 22050],
  stone: [(sr) => lapLoop(sr, 14, 'stone'), 22050],
  cricketA: [(sr) => cricketLoop(sr, 21, { fc: 3900, rate: 1.55, pulses: 4 }), 16000],
  cricketB: [(sr) => cricketLoop(sr, 22, { fc: 4300, rate: 1.2, pulses: 3, pulse: 0.018, gap: 0.014 }), 16000],
  cricketC: [(sr) => cricketLoop(sr, 23, { fc: 3500, rate: 2.05, pulses: 5, pulse: 0.011, gap: 0.009, count: 16 }), 16000],
};

// The beds of each place: [loop or noise, level, filters, options]. A noise
// bed is pink noise shaped by filters; `gust` swells it with the breeze.
const BEDS = {
  lagoon: [
    ['surf', 0.17, [['lowpass', 1800]], { spread: 0.6 }],
    // the breeze, and palm fronds rattling in it
    ['pink', 0.05, [['bandpass', 420, 0.6], ['lowpass', 1500]], { gust: 0.7 }],
    ['white', 0.012, [['bandpass', 3200, 0.8], ['lowpass', 6000]], { gust: 0.7, flutter: 0.3, spread: 0.7 }],
  ],
  lake: [
    ['shore', 0.3, [['lowpass', 3800]], { spread: 0.5 }],
    ['pink', 0.02, [['lowpass', 500]], { gust: 0.5 }],
    ['cricketC', 0.006, [], { pan: 0.7 }],
  ],
  canal: [
    ['stone', 0.16, [['lowpass', 4200]], { spread: 0.7, wet: 0.35 }],
    // the town's quiet air: a very low far-off hum, no voices
    ['pink', 0.035, [['lowpass', 220], ['highpass', 40]], {}],
  ],
  bay: [
    ['beach', 0.24, [['lowpass', 4000]], { spread: 0.5 }],
    ['cricketA', 0.03, [], { pan: -0.6 }],
    ['cricketB', 0.02, [], { pan: 0.55 }],
    ['cricketC', 0.014, [], { pan: 0.1 }],
    ['pink', 0.02, [['bandpass', 600, 0.7]], { gust: 0.6 }],
  ],
};

// Occasional events of each place: [call, seconds between [min, max],
// distance [min, max] m, pan spread]. The first comes sooner.
const EVENTS = {
  lagoon: [['gull', [9, 24], [50, 130], 0.8], ['tern', [22, 48], [40, 90], 0.8]],
  lake: [['songbird', [5, 13], [20, 60], 0.8], ['duck', [40, 90], [45, 90], 0.7], ['splashfish', [25, 60], [20, 50], 0.8]],
  canal: [['pigeon', [8, 19], [12, 30], 0.7], ['church', [55, 110], [250, 250], 0.3]],
  bay: [['frog', [3, 9], [12, 35], 0.8], ['chime', [11, 26], [8, 14], 0.5], ['splashfish', [40, 90], [25, 50], 0.8]],
};

// the lake's resident singers
const SINGERS = [
  { kind: 'blackbird', pan: -0.55, dist: 30 },
  { kind: 'thrush', pan: 0.6, dist: 40 },
  { kind: 'robin', pan: 0.2, dist: 25 },
  { kind: 'blackbird', pan: 0.75, dist: 55 },
];

export class Ambience {
  constructor(audio) {
    this.a = audio;
    this.ctx = audio.ctx;
    this.out = audio.ambBus;
    this.layers = {};
    this.place = null;
    this.pools = {};
    this.loops = {};
  }

  // A rendered loop buffer, made on first use.
  loop(name) {
    let b = this.loops[name];
    if (!b) {
      const [render, sr] = LOOPS[name];
      b = this.loops[name] = toBuffer(this.ctx, render(sr));
    }
    return b;
  }

  // A buffer of a call. Keeps a few renders of each and now and then swaps
  // one for a fresh one, so no two calls in a row are alike.
  call(kind) {
    const spec = CALLS[kind];
    const pool = this.pools[kind] || (this.pools[kind] = []);
    const fresh = () => toBuffer(this.ctx, evenOut(spec.render(spec.sr, Math.floor(Math.random() * 1e9))));
    if (pool.length < 2 || (pool.length < spec.keep && Math.random() < 0.5)) {
      const b = fresh();
      pool.push(b);
      return b;
    }
    const i = Math.floor(Math.random() * pool.length);
    if (Math.random() < 0.2) pool[i] = fresh();
    return pool[i];
  }

  // Warm-up jobs for a place: its loops and a couple of each of its calls.
  jobs(place) {
    const out = [];
    for (const [src] of BEDS[place]) if (LOOPS[src]) out.push(() => this.loop(src));
    for (const [kind] of EVENTS[place]) {
      const kinds = kind === 'songbird' ? ['blackbird', 'thrush', 'robin'] : kind === 'church' ? ['bell'] : CALLS[kind] ? [kind] : [];
      for (const k of kinds) out.push(() => this.call(k), () => this.call(k));
    }
    return out;
  }

  // Crossfade to a place over about 2.5 s.
  set(place, instant = false) {
    if (place === this.place || !BEDS[place]) return;
    const now = this.a.now();
    const tc = instant ? 0.02 : 0.8;
    const old = this.place && this.layers[this.place];
    if (old) {
      for (const p of [old.g.gain, old.send.gain]) {
        p.cancelScheduledValues(now);
        p.setTargetAtTime(0, now, tc * 0.8);
      }
      old.offAt = now;
    }
    this.place = place;
    let L = this.layers[place];
    if (!L) L = this.layers[place] = this.build(place, now);
    for (const p of [L.g.gain, L.send.gain]) {
      p.cancelScheduledValues(now);
      p.setTargetAtTime(1, now, tc);
    }
    L.offAt = Infinity;
    L.next = {};
  }

  build(place, now) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.out);
    // the layer's own share to the room, fading with it
    const send = ctx.createGain();
    send.gain.value = 0;
    send.connect(this.a.verbIn);
    const L = { place, g, send, srcs: [], next: {}, offAt: Infinity, bout: null };
    for (const [src, level, filters, o] of BEDS[place]) this.bed(L, src, level, filters, o, now);
    return L;
  }

  // One bed: a looped source (two, spread apart, for width) through its
  // filters and level, optionally swelling with the breeze.
  bed(L, src, level, filters, { spread = 0, pan = 0, gust = 0, flutter = 0, wet = 0 }, now) {
    const ctx = this.ctx;
    const a = this.a;
    const buf = src === 'pink' ? a.buf('pink') : src === 'white' ? a.buf('white') : this.loop(src);
    const g = ctx.createGain();
    g.gain.value = level;
    let head = g;
    if (gust || flutter) {
      // level = 1 - depth + depth * (0.5 + 0.5 * lfo), for each of the two
      const sw = ctx.createGain();
      sw.gain.value = 1 - 0.5 * (gust + flutter);
      for (const [name, d, rate] of [['gust', gust, rand(0.8, 1.2)], ['flutter', flutter, rand(0.8, 1.25)]]) {
        if (!d) continue;
        const m = ctx.createBufferSource();
        m.buffer = a.buf(name);
        m.loop = true;
        m.playbackRate.value = rate;
        const dg = ctx.createGain();
        dg.gain.value = d * 0.5;
        m.connect(dg).connect(sw.gain);
        m.start(now, Math.random() * m.buffer.duration);
        L.srcs.push(m);
      }
      sw.connect(g);
      head = sw;
    }
    let chain = head;
    for (let i = filters.length - 1; i >= 0; i--) {
      const [type, f, q = 0.7] = filters[i];
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      b.connect(chain);
      chain = b;
    }
    const pans = spread ? [-spread, spread] : [pan];
    for (const p of pans) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const sp = ctx.createStereoPanner();
      sp.pan.value = p;
      s.connect(sp).connect(chain);
      s.start(now, Math.random() * buf.duration);
      L.srcs.push(s);
    }
    if (spread) g.gain.value = level * Math.SQRT1_2;
    g.connect(L.g);
    if (wet) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w).connect(L.send);
    }
  }

  // Called by the audio's scheduler: stops places long faded out and
  // schedules the current place's events a moment ahead.
  tick(now, muted) {
    for (const [id, L] of Object.entries(this.layers)) {
      if (id === this.place || now - L.offAt < 6 || this.a.offline) continue;
      for (const s of L.srcs) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      L.g.disconnect();
      L.send.disconnect();
      delete this.layers[id];
    }
    if (muted || !this.place) return;
    const L = this.layers[this.place];
    for (const [kind, gap, dist, spread] of EVENTS[this.place]) {
      const due = L.next[kind];
      if (due === undefined) {
        L.next[kind] = now + rand(gap[0], gap[1]) * 0.4;
        continue;
      }
      if (now < due) continue;
      this.soon = false;
      const busy = this.event(L, kind, now + 0.05, rand(dist[0], dist[1]), rand(-spread, spread));
      L.next[kind] = now + busy + (this.soon ? 0 : rand(gap[0], gap[1]));
    }
  }

  // Play one event; returns how long it keeps its slot busy (and sets
  // `soon` when the next one should follow without the usual gap).
  event(L, kind, t, dist, pan) {
    if (kind === 'songbird') return this.songbird(L, t);
    if (kind === 'church') return this.church(L, t);
    if (kind === 'chime') return this.chime(L, t, pan);
    const buf = this.call(kind);
    this.play(L, kind, buf, t, dist, pan);
    // a frog is often answered by another
    if (kind === 'frog' && Math.random() < 0.5) this.play(L, kind, this.call(kind), t + rand(0.3, 0.9), dist * rand(0.8, 1.4), -pan * rand(0.5, 1));
    return buf.duration;
  }

  play(L, kind, buf, t, dist, pan, gain = 1) {
    this.a.shot(buf, {
      t,
      gain: CALL_LEVEL[kind] * distGain(dist) * gain * rand(0.8, 1.05),
      rate: rand(0.97, 1.03),
      pan,
      cutoff: distCut(dist),
      wet: clamp(0.05 + dist / 150, 0, 0.6),
      dest: L.g,
      send: L.send,
      kind: 'amb',
    });
  }

  // Evening birdsong in bouts: one bird sings a few phrases with little
  // pauses, then the lake is quiet for a while before another answers.
  songbird(L, t) {
    if (!L.bout || L.bout.left <= 0) L.bout = { who: pick(SINGERS), left: 1 + Math.floor(Math.random() * 3) };
    const b = L.bout;
    const buf = this.call(b.who.kind);
    this.play(L, b.who.kind, buf, t, b.who.dist, b.who.pan + rand(-0.05, 0.05));
    b.left--;
    // within a bout the next phrase comes after a short pause
    if (b.left > 0) {
      this.soon = true;
      return buf.duration + rand(1.2, 3);
    }
    return buf.duration;
  }

  // A church bell across the roofs: three to five slow strokes.
  church(L, t) {
    const strokes = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < strokes; k++) this.play(L, 'bell', this.call('bell'), t + k * 2.3, 250, -0.35, 1 - 0.05 * k);
    return strokes * 2.3 + 4;
  }

  // The lanterns' wind chime stirring: a few soft tubular notes of the
  // pentatonic scale, close together as a breath of air passes.
  chime(L, t, pan) {
    const a = this.a;
    const notes = [84, 86, 88, 91, 93, 96];
    const count = 3 + Math.floor(Math.random() * 5);
    let at = t;
    for (let k = 0; k < count; k++) {
      a.note('chime', pick(notes), at, 0.035 * rand(0.5, 1) * Math.sin((Math.PI * (k + 0.5)) / count), pan + rand(-0.15, 0.15), L.g);
      at += rand(0.12, 0.45);
    }
    return at - t + 1;
  }
}
