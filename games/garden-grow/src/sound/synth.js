// A small offline DSP kit. Garden Grow's natural sounds (soil, water, leaves,
// paper, birds, insects) and its instrument notes are rendered once in plain
// JS into sample arrays and then played back with a single buffer source.
// Grains of filtered noise, bubble chirps and decaying partials written
// sample by sample sound far more like the real thing than stacks of live
// oscillators, and cost almost nothing to play.
//
// Loops are made seamless by writing grains round the end of the buffer
// (`wrap`) and by running filters once round the loop before the real pass.
// Nothing here touches the page, so it also runs in a worker (sound/worker.js).

export const TAU = Math.PI * 2;

// Small seeded random number generator (the same as config.js's, copied so
// this module can load in a worker).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// White noise that grains read from at random offsets (much faster than a
// fresh random number per sample, and just as good to the ear).
const NOISE = (() => {
  const r = mulberry32(12345);
  const b = new Float32Array(65536);
  for (let i = 0; i < b.length; i++) b[i] = r() * 2 - 1;
  return b;
})();

// seconds -> whole samples (at least one)
export const secs = (sr, s) => Math.max(1, Math.round(s * sr));

// log-uniform random value between a and b
export const logRand = (rand, a, b) => a * Math.pow(b / a, rand());

// RBJ biquad, direct form I: lowpass, highpass or bandpass (0 dB peak).
export class Biquad {
  constructor(type, freq, q, sr) {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
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

  // Filter a whole array in place. `cyclic` first runs through the end of
  // it to settle, so a looped buffer joins without a seam.
  process(buf, cyclic = false) {
    if (cyclic) for (let i = Math.max(0, buf.length - 24000); i < buf.length; i++) this.run(buf[i]);
    for (let i = 0; i < buf.length; i++) buf[i] = this.run(buf[i]);
    return buf;
  }
}

export function filter(buf, sr, type, freq, q = 0.707, cyclic = false) {
  return new Biquad(type, freq, q, sr).process(buf, cyclic);
}

export function white(n, rand) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = rand() * 2 - 1;
  return b;
}

// Pink noise from white (Paul Kellet's filter), in place.
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

// Add a grain of white noise at sample `at`: a raised-cosine rise over
// `rise` samples, then an exponential fall to silence by `len` samples.
export function noiseGrain(out, at, len, rise, amp, rand, wrap = false) {
  const n = out.length;
  rise = Math.max(1, Math.min(rise, len - 1));
  const fall = Math.exp(-5 / Math.max(1, len - rise));
  const taper = len * 0.9;
  const off = (rand() * 65536) | 0;
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

// Add a sine whose pitch glides (exponentially) from f0 to f1 over `glide`
// seconds, rising over `attack` s and dying away with time constant `tau`.
// It is faded to exactly zero at its end.
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
    const f = ratio !== 1 && glide > 0 ? f0 * Math.pow(ratio, Math.min(1, t / glide)) : f0;
    ph += (TAU * f) / sr;
    let e = Math.exp(-t / tau);
    if (i < att) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
    if (i > total - tail) e *= (total - i) / tail;
    out[j] += amp * e * (Math.sin(ph) + (h2 ? h2 * Math.sin(2 * ph) : 0));
  }
}

// Add amp * e^(-t/tau) * sin(2 pi f t) from sample `at`, using a two-pole
// resonator recursion (no sin() per sample). It starts at zero and runs
// until it has died away to nothing.
export function damped(out, sr, at, f, amp, tau, phase = 0) {
  if (f >= sr * 0.47 || amp === 0) return;
  const w = (TAU * f) / sr;
  const r = Math.exp(-1 / (tau * sr));
  const c = 2 * r * Math.cos(w);
  const r2 = r * r;
  let y2 = (amp / r2) * Math.sin(phase - 2 * w);
  let y1 = (amp / r) * Math.sin(phase - w);
  const len = Math.min(out.length - at, Math.ceil(tau * sr * 9.3));
  for (let i = 0; i < len; i++) {
    const y = c * y1 - r2 * y2;
    out[at + i] += y;
    y2 = y1;
    y1 = y;
  }
}

// A water bubble (van den Doel's model): a sine whose pitch rises as the
// bubble collapses, damped at a rate set by its size. Small bubbles are
// high and short, big ones low and longer.
export function bubble(out, sr, at, f0, amp, rise = 0.1, wrap = false) {
  const n = out.length;
  const d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5);
  const len = Math.floor((6 / d) * sr);
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

// Multiply the first `len` samples from `at` by a raised-cosine rise.
export function rampIn(buf, at, len) {
  for (let i = 0; i < len && at + i < buf.length; i++) buf[at + i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / len);
  for (let i = 0; i < at && i < buf.length; i++) buf[i] = 0;
}

// Smoothly fade the very start and the last `tail` samples to zero.
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

export function removeDC(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i];
  const m = s / buf.length;
  for (let i = 0; i < buf.length; i++) buf[i] -= m;
  return buf;
}

// Add b * k into a.
export function mix(a, b, k = 1) {
  for (let i = 0; i < a.length; i++) a[i] += b[i] * k;
  return a;
}

// Scale every channel together so the loudest sample is `peak`.
export function normalize(chans, peak = 1) {
  let m = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
  if (m > 0) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= peak / m;
  return chans;
}

// Finish a one-shot: no DC, exactly zero at both ends, peak 1.
export function finish(chans, sr, headMs = 0.5, tailMs = 20) {
  for (const c of chans) {
    removeDC(c);
    fadeEnds(c, secs(sr, headMs / 1000), secs(sr, tailMs / 1000));
  }
  return { sr, ch: normalize(chans) };
}

// Finish a loop: no DC and peak 1 (it has no ends to fade).
export function finishLoop(chans, sr) {
  for (const c of chans) removeDC(c);
  return { sr, ch: normalize(chans) };
}

export function toBuffer(ctx, { sr, ch }) {
  const b = ctx.createBuffer(ch.length, ch[0].length, sr);
  ch.forEach((d, i) => b.copyToChannel(d, i));
  return b;
}
