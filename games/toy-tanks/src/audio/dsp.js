// The small offline DSP kit every Toy Tanks sound is written with. Sounds are
// rendered once, in plain JS, into little mono buffers (at 16 to 32 kHz, which
// is all a soft sound needs) that Web Audio then plays cheaply: one source
// node per sound however many grains, bubbles and partials went into it.
// Nothing here touches the DOM or Web Audio, so it also runs in Node.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[(Math.random() * list.length) | 0];
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const secs = (sr, s) => Math.max(1, Math.round(s * sr));
export const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// A seeded generator (mulberry32) with the seed scrambled and the first few
// values dropped, so nearby seeds do not start alike. Renders are repeatable.
export function seeded(seed) {
  let a = Math.imul((seed | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0 || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 6; i++) r();
  return r;
}

// White noise that grains read at random offsets: far quicker than a fresh
// random number per sample, and just as good to the ear.
const NOISE = (() => {
  const r = seeded(12345);
  const b = new Float32Array(65536);
  for (let i = 0; i < b.length; i++) b[i] = r() * 2 - 1;
  return b;
})();

export function white(n, r) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = r() * 2 - 1;
  return b;
}

// RBJ biquad, direct form I: low-pass, high-pass or band-pass (0 dB peak).
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
    if (cyclic) for (let i = Math.max(0, buf.length - 4096); i < buf.length; i++) this.run(buf[i]);
    for (let i = 0; i < buf.length; i++) buf[i] = this.run(buf[i]);
    return buf;
  }
}

export function filt(buf, sr, type, freq, q = 0.707, cyclic = false) {
  return new Biquad(type, freq, q, sr).process(buf, cyclic);
}

// one-pole low-pass, in place
export function lp1(d, sr, fc) {
  const a = Math.exp((-TAU * fc) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) d[i] = y = (1 - a) * d[i] + a * y;
  return d;
}

// Pink from white (Paul Kellet's filter), in place.
export function pinkify(buf, cyclic = false) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  const pass = (write) => {
    for (let i = write ? 0 : Math.max(0, buf.length - 6000); i < buf.length; i++) {
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

// Add a grain of white noise at sample `at`: a raised-cosine rise over `rise`
// samples, then an exponential fall to silence by `len` samples.
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

// A sine (with optional 2nd and 3rd harmonics) whose pitch follows fn(t) in Hz
// for `dur` seconds from sample `at`. The default envelope is a soft raised-
// cosine attack, an exponential decay with time constant `tau` and a short
// fade at the end; pass `env(t)` (0..1) to shape it yourself.
export function pitched(out, sr, at, dur, fn, { amp = 1, attack = 0.004, tau = dur / 4, h2 = 0, h3 = 0, env = null } = {}) {
  const n = out.length;
  const total = Math.floor(dur * sr);
  const att = Math.max(1, Math.floor(attack * sr));
  const tail = Math.max(1, Math.floor(total * 0.12));
  let ph = 0;
  for (let i = 0; i < total; i++) {
    const j = at + i;
    if (j >= n) break;
    const t = i / sr;
    ph += (TAU * fn(t)) / sr;
    let e;
    if (env) e = env(t);
    else {
      e = Math.exp(-t / tau);
      if (i < att) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
      if (i > total - tail) e *= (total - i) / tail;
    }
    let v = Math.sin(ph);
    if (h2) v += h2 * Math.sin(2 * ph);
    if (h3) v += h3 * Math.sin(3 * ph);
    out[j] += amp * e * v;
  }
}

// Add amp * e^(-t/tau) * sin(2 pi f t + phase) from sample `at`, by a two-pole
// recursion, until it has died away to nothing. Very cheap: bells, bars and
// plucked strings are sums of these.
export function damped(out, sr, at, f, amp, tau, phase = 0) {
  if (f >= sr * 0.47 || amp === 0) return;
  const n = out.length;
  const w = (TAU * f) / sr;
  const rr = Math.exp(-1 / (tau * sr));
  const c = 2 * rr * Math.cos(w);
  const r2 = rr * rr;
  let y2 = (amp / r2) * Math.sin(phase - 2 * w);
  let y1 = (amp / rr) * Math.sin(phase - w);
  const len = Math.min(n - at, Math.ceil(tau * sr * 9.3));
  for (let i = 0; i < len; i++) {
    const y = c * y1 - r2 * y2;
    out[at + i] += y;
    y2 = y1;
    y1 = y;
  }
}

// A water bubble (van den Doel's model): a sine whose pitch rises as the
// bubble collapses, damped at a rate set by its size. `d` overrides the
// damping (per second) for bubbles that should die sooner or ring longer.
export function bubble(out, sr, at, f0, amp, rise = 0.1, d = 0) {
  if (f0 >= sr * 0.45 || at >= out.length) return;
  const n = out.length;
  if (!d) d = 0.043 * f0 + 0.0014 * f0 ** 1.5;
  const len = Math.min(Math.floor((6 / d) * sr), n - at);
  const att = Math.max(2, Math.floor(0.0008 * sr));
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    ph += (TAU * f0 * (1 + rise * d * t)) / sr;
    let e = Math.exp(-d * t);
    if (i < att) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
    if (i > len * 0.85) e *= (len - i) / (len * 0.15);
    out[at + i] += amp * e * Math.sin(ph);
  }
}

// Noise through a band-pass whose centre sweeps from fa to fb (log), under an
// envelope env(u) for u in 0..1 over `dur` seconds from sample `at`.
export function sweep(out, sr, at, dur, fa, fb, q, amp, r, env) {
  const len = Math.floor(dur * sr);
  const bq = new Biquad('bandpass', fa, q, sr);
  const off = (r() * 65536) | 0;
  for (let i = 0; i < len && at + i < out.length; i++) {
    const u = i / len;
    if ((i & 15) === 0) bq.set('bandpass', fa * (fb / fa) ** u, q, sr);
    // the last fifth eases to nothing, so a sweep never ends with a step
    out[at + i] += amp * env(u) * (u > 0.8 ? 1 - smooth((u - 0.8) / 0.2) : 1) * bq.run(NOISE[(off + i) & 65535]);
  }
}

// Ease the first `head` and last `tail` samples with a raised cosine, so a
// sound starts and ends on exact zero (no clicks).
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

// out += b * k, from sample `at` (defaults to the start)
export function mix(a, b, k = 1, at = 0) {
  const n = Math.min(b.length, a.length - at);
  for (let i = 0; i < n; i++) a[at + i] += b[i] * k;
  return a;
}

// mix a copy of `comp` scaled to peak `amp` into `out` at sample `at`
export function put(out, comp, amp, at = 0) {
  let m = 0;
  for (let i = 0; i < comp.length; i++) m = Math.max(m, Math.abs(comp[i]));
  if (m > 0) mix(out, comp, amp / m, at);
}

// a burst of noise (a grain) filtered to a band or below a cut-off, mixed in at peak `amp`
export function puffInto(out, sr, at, dur, type, fc, q, amp, r, rise = 0.003) {
  const a = new Float32Array(Math.min(secs(sr, dur), out.length - at));
  grain(a, 0, a.length, secs(sr, rise), 1, r);
  filt(a, sr, type, fc, q);
  put(out, a, amp, at);
}

// Scale channels together so the loudest sample is `peak`.
export function normalise(chans, peak = 1) {
  let m = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
  if (m > 0) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= peak / m;
  return chans;
}

// Cut a signal where it has fallen below `floor` of its peak for good,
// easing the new end to zero.
export function trim(d, floor) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  const th = m * floor;
  let cut = d.length - 1;
  while (cut > 0 && Math.abs(d[cut]) < th) cut--;
  if (cut >= d.length - 64) return d;
  const out = d.slice(0, cut + 64);
  const k = Math.max(1, Math.floor(out.length * 0.15));
  for (let i = 0; i < k; i++) out[out.length - k + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / k);
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
