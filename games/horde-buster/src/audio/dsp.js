// The small offline DSP kit every Horde Buster sound and music loop is rendered
// with (adapted from Iron Barrage's). Sounds are made once, in plain JS, into
// mono (or stereo) Float32Arrays that Web Audio then plays cheaply. Nothing here
// touches the DOM or Web Audio, so it also runs in Node.
//
// Anything that loops over many samples is a generator: it does a block of work
// (BLOCK samples, a fraction of a millisecond), then yields. The builder in
// lib.js resumes these generators a few milliseconds at a time between frames,
// so rendering hundreds of thousands of samples never stalls a frame. Call them
// with `yield*`; short helpers are plain functions.
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
// recursion, until it has died away. Bells, glass and ticks are sums of these.
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

// One cycle of a wave at phase p (0..1), step dp: 0 sine, 1 saw, 2 square, 3 triangle
export function wave(w, p, dp) {
  if (w === 1) return sawBL(p, dp);
  if (w === 2) return sawBL(p, dp) - sawBL(p >= 0.5 ? p - 0.5 : p + 0.5, dp);
  if (w === 3) return 4 * Math.abs(p - 0.5) - 1;
  return Math.sin(TAU * p);
}
export const WAVES = { sine: 0, saw: 1, square: 2, tri: 3 };

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

// Make a seamless loop of the first n samples of buf (which holds n + x samples): the extra x samples are
// what would come after the end, so they are faded in over the head while the head fades out (equal power,
// for noise). The last sample then runs straight on into the first as if the stream had never stopped.
export function foldLoop(buf, n) {
  const x = buf.length - n;
  const out = buf.slice(0, n);
  for (let i = 0; i < x; i++) {
    const th = (i / x) * Math.PI * 0.5;
    out[i] = buf[i] * Math.sin(th) + buf[n + i] * Math.cos(th);
  }
  return out;
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

export function peakOf(buf) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] < 0 ? -buf[i] : buf[i];
    if (v > m) m = v;
  }
  return m;
}

export function rmsOf(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
}

// Scale to peak 1 then squash the peaks with tanh(k x) / tanh(k): more loudness
// for the same peak, and a rounder attack. k around 1.2 (gentle) to 3 (hard).
export function saturate(buf, k) {
  const p = peakOf(buf);
  if (p <= 0) return buf;
  const s = 1 / p;
  const norm = 1 / Math.tanh(k);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(k * buf[i] * s) * norm;
  return buf;
}

// Loudness in dB of a sound: mean square after a 170 Hz high-pass (as the ear
// hears little below that), the loudest 100 ms window ('burst') or the whole
// sound ('mean'). `raw` is the same without the high-pass.
export function loudness(buf, sr, mode = 'burst') {
  const n = buf.length;
  const hp = new Biquad('highpass', 170, 0.707, sr);
  const hop = Math.max(1, Math.round(0.025 * sr));
  const blocks = Math.ceil(n / hop);
  const e = new Float64Array(blocks);
  const r = new Float64Array(blocks);
  for (let i = 0; i < n; i++) {
    const x = buf[i];
    const y = hp.run(x);
    const k = (i / hop) | 0;
    e[k] += y * y;
    r[k] += x * x;
  }
  const wb = mode === 'mean' ? blocks : Math.min(blocks, 4);
  const len = Math.min(n, wb * hop);
  let bestA = 0;
  let bestR = 0;
  let sa = 0;
  let sr2 = 0;
  for (let k = 0; k < blocks; k++) {
    sa += e[k];
    sr2 += r[k];
    if (k >= wb) {
      sa -= e[k - wb];
      sr2 -= r[k - wb];
    }
    if (sa > bestA) bestA = sa;
    if (sr2 > bestR) bestR = sr2;
  }
  return { a: 10 * Math.log10(bestA / len + 1e-12), raw: 10 * Math.log10(bestR / len + 1e-12) };
}

// Run a generator to the end (for Node and for synchronous builds).
export function run(gen) {
  let s = gen.next();
  while (!s.done) s = gen.next();
  return s.value;
}
