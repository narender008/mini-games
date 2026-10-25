// Baked one-shots. Bells, celesta, music box, glass, anvils and every drum
// have fixed envelopes, so instead of building 5-15 nodes per note they are
// computed in plain JS once per pitch (and three noise variants per drum),
// cached as AudioBuffers on the engine, and played with one source and one
// gain. The maths mirrors the live recipes in synth.js (same envelopes, FM
// index decay, partial ratios and filters), so they sound the same.
//
// The sample loops are generators that yield every CHUNK samples, so the live
// game bakes a long note (a 4 s bell is ~200k samples of FM plus five
// partials, 30-150 ms of JS in one go) a slice at a time inside bakeStep's
// budget; offline engines drain them at once.
import { voiceJob } from './jsynth.js';

const TAU = Math.PI * 2;
const CAP_BYTES = 96 * 1024 * 1024; // baked audio kept in memory (LRU beyond this)
const CHUNK = 2048; // samples per generator step
const drain = (it) => { while (!it.next().done); };

// percussive envelope matching synth.js env(): linear attack, then exp fall
const envAt = (t, a, d) => (t < a ? t / a : Math.exp(-((t - a) * 5) / d));

function* fmInto(x, sr, o) {
  const { f, ratio, index, index1 = 0.2, idecay = 0.1, a = 0.002, d, peak } = o;
  let pc = 0, pm = 0;
  const fm = f * ratio, n = x.length;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const I = index1 + (index - index1) * Math.exp(-t / idecay);
    pm += (TAU * fm) / sr;
    pc += (TAU * (f + I * f * Math.sin(pm))) / sr;
    x[i] += Math.sin(pc) * envAt(t, a, d) * peak;
    if (i % CHUNK === CHUNK - 1) yield;
  }
}
function* sineInto(x, sr, f, a, d, peak) {
  let p = 0; const n = x.length;
  for (let i = 0; i < n; i++) { p += (TAU * f) / sr; x[i] += Math.sin(p) * envAt(i / sr, a, d) * peak; if (i % CHUNK === CHUNK - 1) yield; }
}
function* partialsInto(x, sr, f, ratios, amps, d, peak, a = 0.001) {
  for (let k = 0; k < ratios.length; k++) {
    const fr = f * ratios[k] * (1 + (Math.random() - 0.5) * 0.004); if (fr > sr * 0.45) continue;
    const amp = (amps ? amps[k] : 1 / (1 + k * 0.7)) * peak, dk = d / (1 + k * 0.35);
    let p = 0;
    for (let i = 0; i < x.length; i++) { p += (TAU * fr) / sr; x[i] += Math.sin(p) * envAt(i / sr, a, dk) * amp; if (i % CHUNK === CHUNK - 1) yield; }
  }
}
// exponential pitch glide f0 -> f1 over `glide` (as exponentialRampToValueAtTime)
function* sweepInto(x, sr, f0, f1, glide, a, d, peak, wave = 'sine') {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, f = t < glide ? f0 * Math.pow(f1 / f0, t / glide) : f1;
    p += f / sr;
    const ph = p - Math.floor(p);
    const w = wave === 'tri' ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(TAU * ph);
    x[i] += w * envAt(t, a, d) * peak;
    if (i % CHUNK === CHUNK - 1) yield;
  }
}
// RBJ biquad over a noise burst
function biq(type, f, q, sr) {
  const w = (TAU * f) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2; const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
  else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function* noiseInto(x, sr, o) {
  const { type = 'bandpass', f, q = 1, a = 0.001, d, peak, color } = o;
  const [b0, b1, b2, a1, a2] = biq(type, Math.min(f, sr * 0.45), q, sr);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, br = 0;
  for (let i = 0; i < x.length; i++) {
    let v = Math.random() * 2 - 1;
    if (color === 'brown') { br = (br + 0.02 * v) / 1.02; v = br * 3.5; }
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] += y * envAt(i / sr, a, d) * peak;
    if (i % CHUNK === CHUNK - 1) yield;
  }
}

// Returns the cached buffer, or (live engine) queues the bake and returns null
// so the caller plays the node recipe this once; the queue is drained a few
// milliseconds at a time by bakeStep() from the audio timer, so the first use
// of a pitch never stalls a frame. Offline engines bake at once.
function cacheGet(E, key) {
  const b = E.cache.get(key);
  if (b && E.lru) { E.cache.delete(key); E.cache.set(key, b); } // most recent last
  return b;
}
export function cachePut(E, key, b) {
  E.lru = true;
  E.cache.set(key, b);
  E.cacheBytes = (E.cacheBytes || 0) + b.length * b.numberOfChannels * 4;
  if (E.cacheBytes > CAP_BYTES) {
    for (const [k, v] of E.cache) {
      if (E.cacheBytes <= CAP_BYTES * 0.8) break;
      if (k.startsWith('ir:') || !v || !v.length) continue;
      E.cache.delete(k); E.cacheBytes -= v.length * v.numberOfChannels * 4;
    }
  }
}
function bake(E, key, seconds, gen) {
  const b = cacheGet(E, key);
  if (b) return b;
  if (!E.offline) { if (!E.bakeQ) E.bakeQ = new Map(); if (!E.bakeQ.has(key)) E.bakeQ.set(key, [seconds, gen]); return null; }
  return make(E, key, seconds, gen);
}
// a bake in progress: the buffer and the recipe's generator over it
function job(E, seconds, gen) {
  const sr = E.sr, n = Math.max(32, Math.ceil(sr * Math.min(seconds, 7)));
  const b = E.ctx.createBuffer(1, n, sr);
  return { b, it: gen(b.getChannelData(0), sr) };
}
function finish(E, key, b) {
  const x = b.getChannelData(0), n = x.length;
  for (let i = 0, f = Math.min(256, n >> 3); i < f; i++) x[n - 1 - i] *= i / f; // no click at the end
  cachePut(E, key, b);
  return b;
}
function make(E, key, seconds, gen) {
  const j = job(E, seconds, gen);
  drain(j.it);
  return finish(E, key, j.b);
}
// A sustained music voice rendered by jsynth (resumable job in the live game).
export function voiceBuf(E, key, specFn) {
  const b = cacheGet(E, key);
  if (b) return b;
  if (E.offline) { const job = voiceJob(E.ctx, specFn()); job.step(Infinity); cachePut(E, key, job.buffer); return job.buffer; }
  if (!E.jobQ) E.jobQ = new Map();
  if (!E.jobQ.has(key) && E.jobQ.size < 64) E.jobQ.set(key, { specFn, job: null });
  return null;
}
// Drain the bake queues for about `budgetMs` (called from the audio timer).
export function bakeStep(E, budgetMs = 4) {
  const t0 = performance.now(); let n = 0;
  const Q = E.bakeQ;
  // one queued note at a time, a CHUNK of samples per step, until the budget is spent (the note in progress
  // resumes on the next call)
  while (Q && Q.size) {
    const [key, it] = Q.entries().next().value, seconds = it[0], gen = it[1];
    if (E.cache.has(key)) { Q.delete(key); continue; }
    if (seconds === 0) { Q.delete(key); gen(); n++; }
    else {
      if (!it.job) it.job = job(E, seconds, gen);
      let done = false;
      while (!(done = it.job.it.next().done) && performance.now() - t0 < budgetMs);
      if (!done) return n;
      Q.delete(key); finish(E, key, it.job.b); n++;
    }
    if (performance.now() - t0 > budgetMs) return n;
  }
  const J = E.jobQ;
  while (J && J.size && performance.now() - t0 < budgetMs) {
    const [key, it] = J.entries().next().value;
    if (!it.job) it.job = voiceJob(E.ctx, it.specFn());
    if (it.job.step(4096)) { J.delete(key); cachePut(E, key, it.job.buffer); n++; }
  }
  return n;
}
export function playBuf(E, t, out, buf, gain = 1, rate = 1) {
  const s = E.ctx.createBufferSource(); s.buffer = buf;
  if (rate !== 1) s.playbackRate.value = rate;
  const g = E.ctx.createGain(); g.gain.value = gain;
  s.connect(g); g.connect(out); s.start(t);
  return t + buf.duration / rate;
}
const r3 = () => (Math.random() * 3) | 0;
const q = (v, s = 100) => Math.round(v * s) / s;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- pitched -----------------------------------------------------------
export function celestaBuf(E, m, d = 1.3) {
  d = q(d, 10);
  return bake(E, `cel:${m}:${d}`, d * 1.1, function* (x, sr) {
    const f = mtof(m);
    yield* fmInto(x, sr, { f, ratio: 4, index: 1.4, index1: 0.05, idecay: 0.08, a: 0.002, d, peak: 0.16 });
    yield* sineInto(x, sr, f * 2, 0.002, d * 0.5, 0.04);
  });
}
export function musicBoxBuf(E, m, d = 1.6) {
  d = q(d, 10);
  return bake(E, `mbx:${m}:${d}`, d * 1.1, function* (x, sr) {
    const f = mtof(m);
    yield* fmInto(x, sr, { f, ratio: 5.19, index: 0.9, index1: 0.02, idecay: 0.05, a: 0.001, d, peak: 0.15 });
    yield* sineInto(x, sr, f, 0.001, d, 0.09);
  });
}
export function bellBuf(E, m, d = 4) {
  d = q(d, 2);
  return bake(E, `bel:${m}:${d}`, d * 1.05, function* (x, sr) {
    const f = mtof(m);
    yield* fmInto(x, sr, { f, ratio: 1.4, index: 3.2, index1: 0.4, idecay: 0.6, a: 0.002, d, peak: 0.12 });
    yield* partialsInto(x, sr, f * 0.5, [1, 2, 2.4, 3, 4.2], null, d * 0.9, 0.05, 0.002);
  });
}
export function glassBuf(E, m, d = 0.5) {
  d = q(d, 10);
  return bake(E, `gls:${m}:${d}`, d * 1.1, function* (x, sr) { yield* fmInto(x, sr, { f: mtof(m), ratio: 3.01, index: 2.4, index1: 0.1, idecay: 0.03, a: 0.001, d, peak: 0.12 }); });
}
const ANVIL = [1, 2.02, 2.76, 3.97, 5.41, 6.83], ANVIL_A = [1, 0.7, 0.55, 0.4, 0.3, 0.2];
export function anvilBuf(E, f = 880, d = 0.9) {
  f = Math.round(f); d = q(d, 10);
  return bake(E, `anv:${f}:${d}`, d * 1.1, function* (x, sr) {
    yield* partialsInto(x, sr, f, ANVIL, ANVIL_A, d, 0.13);
    yield* noiseInto(x, sr, { type: 'highpass', f: 4200, q: 0.7, a: 0.001, d: 0.02, peak: 0.4 });
  });
}

// ---- drums (three noise variants each) ---------------------------------
export function kickBuf(E, f = 150, f1 = 42, d = 0.38) {
  const v = r3();
  return bake(E, `kik:${Math.round(f)}:${Math.round(f1)}:${q(d)}:${v}`, d * 1.1 + 0.01, function* (x, sr) {
    yield* sweepInto(x, sr, f, f1, 0.11, 0.002, d, 0.9);
    yield* noiseInto(x, sr, { type: 'highpass', f: 3500, q: 0.7, a: 0.001, d: 0.012, peak: 0.25 });
  });
}
export function taikoBuf(E, f = 95, d = 0.6) {
  const v = r3(); f = Math.round(f);
  return bake(E, `tai:${f}:${q(d)}:${v}`, d * 1.1, function* (x, sr) {
    yield* sweepInto(x, sr, f * 1.5, f, 0.06, 0.002, d, 0.8);
    yield* noiseInto(x, sr, { type: 'lowpass', f: 900, q: 1, a: 0.002, d: 0.22, peak: 0.7, color: 'brown' });
    yield* noiseInto(x, sr, { type: 'bandpass', f: 320, q: 1.2, a: 0.001, d: 0.07, peak: 0.35 });
  });
}
export function tomBuf(E, f = 140, d = 0.35) {
  const v = r3(); f = Math.round(f);
  return bake(E, `tom:${f}:${q(d)}:${v}`, d * 1.1, function* (x, sr) {
    yield* sweepInto(x, sr, f * 1.3, f, 0.05, 0.002, d, 0.6);
    yield* noiseInto(x, sr, { type: 'bandpass', f: f * 4, q: 1, a: 0.001, d: 0.06, peak: 0.25 });
  });
}
export function hatBuf(E, f = 7500, open = false) {
  const v = r3(), d = open ? 0.28 : 0.045;
  return bake(E, `hat:${Math.round(f)}:${open ? 1 : 0}:${v}`, d * 1.2, function* (x, sr) { yield* noiseInto(x, sr, { type: 'highpass', f, q: 0.8, a: 0.001, d, peak: 0.32 }); });
}
export function shakerBuf(E) {
  const v = r3();
  return bake(E, `shk:${v}`, 0.1, function* (x, sr) { yield* noiseInto(x, sr, { type: 'bandpass', f: 6500, q: 1.4, a: 0.012, d: 0.06, peak: 0.3 }); });
}
export function snareBuf(E, f = 210, nf = 2200, d = 0.17) {
  const v = r3();
  return bake(E, `snr:${Math.round(f)}:${Math.round(nf)}:${q(d)}:${v}`, d * 1.15, function* (x, sr) {
    yield* sweepInto(x, sr, f, 160, 0.06, 0.001, 0.09, 0.35, 'tri');
    yield* noiseInto(x, sr, { type: 'bandpass', f: nf, q: 0.6, a: 0.001, d, peak: 0.55 });
  });
}
export function rimBuf(E, f = 2600) {
  const v = r3();
  return bake(E, `rim:${Math.round(f)}:${v}`, 0.05, function* (x, sr) { yield* noiseInto(x, sr, { type: 'bandpass', f, q: 5, a: 0.001, d: 0.025, peak: 0.5 }); });
}
