// The small offline DSP kit every Iron Barrage sound is rendered with. Sounds
// are made once, in plain JS, into mono Float32Arrays (16 to 22 kHz is plenty
// for low, heavy sounds) that Web Audio then plays cheaply. Nothing here
// touches the DOM or Web Audio, so it also runs in Node.
//
// Everything that loops over many samples is a generator: it does a block of
// work (BLOCK samples, a fraction of a millisecond), then yields. The builder
// in audio.js resumes these generators a few milliseconds at a time between
// frames, so building hundreds of thousands of samples never stalls a frame.
// Call them with `yield*`; short helpers are plain functions.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const BLOCK = 2048;

// mulberry32 with the seed scrambled and the first values dropped, so nearby
// seeds do not start alike. Renders are repeatable.
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

export function whiteSync(n, r) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = r() * 2 - 1;
  return a;
}

// White noise by xorshift32: several times quicker than a call to r() a sample.
export function* noise(n, r) {
  const a = new Float32Array(n);
  let s = ((r() * 4294967296) | 0) || 1;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      a[i] = s * 4.656612873077393e-10;
    }
    yield;
  }
  return a;
}

// RBJ biquad, direct form I: low-pass, high-pass or band-pass (0 dB peak).
export class Biquad {
  constructor(type, freq, q, sr) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, freq, q, sr);
  }

  set(type, freq, q, sr) {
    const w = (TAU * clamp(freq, 8, sr * 0.45)) / sr;
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
}

// Filter a whole array in place.
export function* filter(buf, sr, type, f, q = 0.707) {
  const bq = new Biquad(type, f, q, sr);
  const n = buf.length;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) buf[i] = bq.run(buf[i]);
    yield;
  }
  return buf;
}

// A filter whose cut-off follows fn(t seconds), retuned every 32 samples.
export function* sweepFilter(buf, sr, type, fn, q = 0.8) {
  const bq = new Biquad(type, fn(0), q, sr);
  const n = buf.length;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      if ((i & 31) === 0) bq.set(type, fn(i / sr), q, sr);
      buf[i] = bq.run(buf[i]);
    }
    yield;
  }
  return buf;
}

// Envelope through points [[t seconds, level], ...]: a straight run in
// log-level between two positive levels (so one segment is an exact
// exponential decay), a straight line when either end is zero. Before the first
// point the first level holds, after the last point the last one does.
export function* shape(buf, sr, pts) {
  const n = buf.length;
  let i = 0;
  let count = 0;
  const first = Math.min(n, Math.round(pts[0][0] * sr));
  for (; i < first; i++) buf[i] *= pts[0][1];
  for (let k = 0; k < pts.length - 1 && i < n; k++) {
    const v0 = pts[k][1];
    const v1 = pts[k + 1][1];
    const i1 = Math.min(n, Math.round(pts[k + 1][0] * sr));
    const len = i1 - i;
    if (len <= 0) continue;
    if (v0 > 0 && v1 > 0) {
      const ratio = Math.pow(v1 / v0, 1 / len);
      let g = v0;
      for (; i < i1; i++) {
        buf[i] *= g;
        g *= ratio;
        if ((++count & 2047) === 0) yield;
      }
    } else {
      const dv = (v1 - v0) / len;
      let g = v0;
      for (; i < i1; i++) {
        buf[i] *= g;
        g += dv;
        if ((++count & 2047) === 0) yield;
      }
    }
  }
  const last = pts[pts.length - 1][1];
  for (; i < n; i++) {
    buf[i] *= last;
    if ((++count & 2047) === 0) yield;
  }
  return buf;
}

// [[0,0],[att,1], ... exponential fall with time constant tau until dur, then 0]
export const expEnv = (att, tau, dur) => [[0, 0], [att, 1], [dur, Math.exp(-(dur - att) / tau)], [dur + 0.004, 0]];

export function* normalise(buf, peak = 1) {
  const n = buf.length;
  let m = 0;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      const v = buf[i] < 0 ? -buf[i] : buf[i];
      if (v > m) m = v;
    }
    yield;
  }
  if (m > 0) {
    const k = peak / m;
    for (let b = 0; b < n; b += BLOCK) {
      const e = Math.min(n, b + BLOCK);
      for (let i = b; i < e; i++) buf[i] *= k;
      yield;
    }
  }
  return buf;
}

// dst += src * gain, from sample `at`
export function* addTo(dst, src, gain = 1, at = 0) {
  const n = Math.min(src.length, dst.length - at);
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) dst[at + i] += src[i] * gain;
    yield;
  }
}

// Slow random wobble of a signal's level: noise low-passed at fc, scaled to unit
// RMS, gain = 1 + depth * wobble (kept between 0.05 and 2.5).
export function* modulate(buf, sr, r, fc, depth) {
  const n = buf.length;
  const m = yield* noise(n, r);
  const a = Math.exp((-TAU * fc) / sr);
  let y1 = 0;
  let y2 = 0;
  let ss = 0;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      y1 = (1 - a) * m[i] + a * y1;
      y2 = (1 - a) * y1 + a * y2;
      m[i] = y2;
      ss += y2 * y2;
    }
    yield;
  }
  const k = depth / (Math.sqrt(ss / n) + 1e-9);
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      const g = 1 + k * m[i];
      buf[i] *= g < 0.05 ? 0.05 : g > 2.5 ? 2.5 : g;
    }
    yield;
  }
  return buf;
}

// tanh waveshaper in place: adds odd harmonics, so a low thump is heard on small speakers
export function* softClip(buf, drive) {
  const n = buf.length;
  const k = 1 / Math.tanh(drive);
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) buf[i] = Math.tanh(drive * buf[i]) * k;
    yield;
  }
  return buf;
}

// Noise shaped by a chain of filters [[type, f, q], ...], peak 1. Becomes the
// raw material of a layer.
export function* colored(n, sr, r, chain) {
  const a = yield* noise(n, r);
  for (const [t, f, q] of chain) yield* filter(a, sr, t, f, q);
  yield* normalise(a, 1);
  return a;
}

// A noise loop that joins its own start without a seam: the filters run over
// two back-to-back copies and the second copy is kept.
export function* noiseLoop(n, sr, r, chain) {
  const w = yield* noise(n, r);
  const x = new Float32Array(n * 2);
  x.set(w);
  x.set(w, n);
  for (const [t, f, q] of chain) yield* filter(x, sr, t, f, q);
  return x.slice(n);
}

// the same, with a time-varying filter: [type, fn(t), q]
export function* sweepLoop(n, sr, r, type, fn, q) {
  const w = yield* noise(n, r);
  const x = new Float32Array(n * 2);
  x.set(w);
  x.set(w, n);
  yield* sweepFilter(x, sr, type, fn, q);
  return x.slice(n);
}

// A slow, looping random signal of unit RMS (noise low-passed at fc).
export function* slowLoop(n, sr, r, fc) {
  const x = yield* noiseLoop(n, sr, r, [['lowpass', fc, 0.7], ['lowpass', fc, 0.7]]);
  let ss = 0;
  for (let i = 0; i < n; i++) ss += x[i] * x[i];
  const k = 1 / (Math.sqrt(ss / n) + 1e-9);
  for (let i = 0; i < n; i++) x[i] *= k;
  return x;
}

// buf *= 1 + depth * slow, clamped, with a looping `slow` from slowLoop
export function* gustInto(buf, slow, depth, floor = 0.05) {
  const n = buf.length;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      const g = 1 + depth * slow[i];
      buf[i] *= g < floor ? floor : g > 2.5 ? 2.5 : g;
    }
    yield;
  }
  return buf;
}

// A pitched thump: a sine whose pitch falls from f0 to f1 (time constant tp)
// under an exponential decay (tau), optionally pushed through tanh (drive) for
// body and harmonics. o = { f0, f1, tp, tau, amp, drive, attack, dur }
export function* thump(out, sr, at, o) {
  const len = Math.min(out.length - at, Math.ceil((o.dur ?? o.tau * 7) * sr));
  if (len <= 0) return;
  const kf = Math.exp(-1 / (o.tp * sr));
  const ka = Math.exp(-1 / (o.tau * sr));
  const att = Math.max(2, Math.round((o.attack ?? 0.002) * sr));
  const drive = o.drive || 0;
  const norm = drive ? 1 / Math.tanh(drive) : 1;
  const amp = o.amp ?? 1;
  const df = o.f0 - o.f1;
  const endLen = Math.max(2, Math.min(len >> 2, Math.round(0.012 * sr)));
  const endAt = len - endLen;
  let fe = 1;
  let ae = 1;
  let ph = 0;
  for (let b = 0; b < len; b += BLOCK) {
    const e = Math.min(len, b + BLOCK);
    for (let i = b; i < e; i++) {
      ph += (TAU * (o.f1 + df * fe)) / sr;
      let s = Math.sin(ph);
      if (drive) s = Math.tanh(drive * s) * norm;
      let g = ae;
      if (i < att) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
      if (i > endAt) g *= (len - i) / endLen;
      out[at + i] += amp * g * s;
      fe *= kf;
      ae *= ka;
    }
    yield;
  }
}

// Add amp * e^(-t/tau) * sin(2 pi f t + phase) from sample `at`, by a two-pole
// recursion, until it has died away. Metal, bells and ticks are sums of these.
export function damped(out, sr, at, f, amp, tau, phase = 0) {
  if (f >= sr * 0.47 || amp === 0 || at >= out.length) return;
  const w = (TAU * f) / sr;
  const rr = Math.exp(-1 / (tau * sr));
  const c = 2 * rr * Math.cos(w);
  const r2 = rr * rr;
  let y2 = (amp / r2) * Math.sin(phase - 2 * w);
  let y1 = (amp / rr) * Math.sin(phase - w);
  const len = Math.min(out.length - at, Math.ceil(tau * sr * 8));
  for (let i = 0; i < len; i++) {
    const y = c * y1 - r2 * y2;
    out[at + i] += y;
    y2 = y1;
    y1 = y;
  }
}

// partials [[f, amp, tau], ...], each scaled by `amp`, ringing from sample `at`
export function modal(out, sr, at, partials, amp = 1, rate = 1) {
  for (const [f, a, tau] of partials) damped(out, sr, at, f * rate, a * amp, tau);
}

// A band-limited sawtooth sample (polyBLEP) for phase 0..1 and step dt
export function sawBL(ph, dt) {
  let v = 2 * ph - 1;
  if (ph < dt) {
    const t = ph / dt;
    v -= 2 * t - t * t - 1;
  } else if (ph > 1 - dt) {
    const t = (ph - 1) / dt;
    v -= t * t + 2 * t + 1;
  }
  return v;
}

// Fade the last `ms` of a layer to nothing with a raised cosine (so a layer cut
// short by its envelope never ends in a step).
export function fadeTail(buf, sr, ms) {
  const n = buf.length;
  const k = Math.min(n >> 1, Math.round((ms / 1000) * sr));
  for (let i = 0; i < k; i++) buf[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / k);
  return buf;
}

export function removeDC(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i];
  const m = s / buf.length;
  for (let i = 0; i < buf.length; i++) buf[i] -= m;
  return buf;
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

// Finish a one-shot made of a `hi` layer (crack, roar, debris) and an optional
// `lo` layer (thump, rumble, echo): no DC, zero at both ends, and both scaled
// together so their sum peaks at `peak`. They play together, `lo` possibly a
// moment late, so the balance between them is kept.
export function* finishPair(hi, lo, sr, peak = 0.95, tailMs = 60, headMs = 0.15) {
  const head = Math.max(2, Math.round((headMs / 1000) * sr));
  const tail = Math.round((tailMs / 1000) * sr);
  yield* removeDCg(hi);
  fadeEnds(hi, head, tail);
  if (lo) {
    yield* removeDCg(lo);
    fadeEnds(lo, head * 3, tail);
  }
  const n = hi.length;
  let m = 0;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      const v = Math.abs(hi[i] + (lo ? lo[i] : 0));
      if (v > m) m = v;
    }
    yield;
  }
  if (m > 0) {
    const k = peak / m;
    for (let b = 0; b < n; b += BLOCK) {
      const e = Math.min(n, b + BLOCK);
      for (let i = b; i < e; i++) hi[i] *= k;
      if (lo) for (let i = b; i < e; i++) lo[i] *= k;
      yield;
    }
  }
  return { sr, hi, lo: lo || null };
}

// removeDC in blocks
export function* removeDCg(buf) {
  const n = buf.length;
  let s = 0;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) s += buf[i];
    yield;
  }
  const mean = s / n;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) buf[i] -= mean;
    yield;
  }
  return buf;
}

// Fold a buffer that was rendered twice as long (event tails spilling past the
// end) back onto itself: a seamless loop.
export function fold(big, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = big[i] + (big[i + n] || 0);
  return out;
}

// Run a generator to the end (for Node and for synchronous builds).
export function run(gen) {
  let s = gen.next();
  while (!s.done) s = gen.next();
  return s.value;
}
