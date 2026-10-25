// Tidebreaker sound core: the AudioContext, the mixing buses, generated noise
// buffers and the small node kit every sound is built from.
//
// Graph:  sfx ─┐                 ┌─ (reverb send from any voice) ─ convolver ─┐
//         music ─ duck ─┼─ mix ─ glue compressor ─ limiter ─ master (mute) ─ destination
//         amb ─┘                 └──────────────────────────────────────────┘
// A voice is one sound effect: a gain (with an optional panner and reverb
// send) that its sources feed. voice() refuses a sound when its gate (minimum
// gap, most alive at once) or the global voice cap says no, so a 15-ball
// broadside never piles up hundreds of nodes. Nothing here throws when Web
// Audio is missing: every entry point checks A.ctx first.
import { W, DEBUG } from '../config.js';

export const A = {
  ctx: null, muted: false, failed: false,
  master: null, mix: null, sfx: null, music: null, duck: null, amb: null, revIn: null,
  buf: {}, live: [], gates: new Map(),
  stats: { voices: 0, peak: 0, made: 0, dropped: 0, notes: 0, nodes: 0 },
};
export const MAX_VOICES = 44;
export const MUSIC_LEVEL = 0.2;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const panX = (x) => (x == null || !isFinite(x) ? 0 : clamp((x / W) * 2 - 1, -1, 1) * 0.7);

// Create the context (only ever from a user gesture) and the buses.
export function boot() {
  if (A.ctx || A.failed) return !!A.ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) { A.failed = true; return false; }
  try {
    A.ctx = new AC({ latencyHint: 'interactive' });
    build();
  } catch (e) {
    console.warn('Tidebreaker: no sound', e);
    A.ctx = null; A.failed = true; return false;
  }
  return true;
}

export function resume() {
  const c = A.ctx;
  if (c && c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {});
}

export const running = () => !!A.ctx && A.ctx.state === 'running';
export const now = () => (A.ctx ? A.ctx.currentTime : 0);

function build() {
  const c = A.ctx;
  A.master = c.createGain(); A.master.gain.value = A.muted ? 0 : 1;
  // glue compressor, then a fast brick-wall-ish limiter a few dB under full scale
  const glue = c.createDynamicsCompressor();
  setP(glue.threshold, -12); setP(glue.knee, 10); setP(glue.ratio, 3); setP(glue.attack, 0.004); setP(glue.release, 0.22);
  const lim = c.createDynamicsCompressor();
  setP(lim.threshold, -4); setP(lim.knee, 0); setP(lim.ratio, 20); setP(lim.attack, 0.001); setP(lim.release, 0.08);
  const trim = c.createGain(); trim.gain.value = 0.75; // Chrome's compressors add make-up gain
  A.mix = c.createGain(); A.mix.gain.value = 0.85;
  A.mix.connect(glue); glue.connect(lim); lim.connect(trim); trim.connect(A.master); A.master.connect(c.destination);

  if (DEBUG) { // level meters for tests: before the compressors and at the output
    A.meterIn = c.createAnalyser(); A.meterIn.fftSize = 2048; A.mix.connect(A.meterIn);
    A.meterOut = c.createAnalyser(); A.meterOut.fftSize = 2048; trim.connect(A.meterOut);
  }
  A.sfx = c.createGain(); A.sfx.gain.value = 0.9; A.sfx.connect(A.mix);
  A.duck = c.createGain(); A.duck.gain.value = 1; A.duck.connect(A.mix);
  A.music = c.createGain(); A.music.gain.value = MUSIC_LEVEL; A.music.connect(A.duck);
  A.amb = c.createGain(); A.amb.gain.value = 0.42; A.amb.connect(A.mix);

  // reverb: generated stereo impulse, decaying and darkening noise
  const conv = c.createConvolver();
  conv.buffer = impulse(2.6, 0.55);
  A.revIn = c.createGain(); A.revIn.gain.value = 1;
  const revOut = c.createGain(); revOut.gain.value = 0.45;
  const revHp = c.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 160;
  A.revIn.connect(revHp); revHp.connect(conv); conv.connect(revOut); revOut.connect(A.mix);

  A.buf.white = noiseBuf(2, 'white');
  A.buf.pink = noiseBuf(3, 'pink');
  A.buf.brown = noiseBuf(4, 'brown');
  A.buf.crackle = crackleBuf(3);
  A.buf.rain = rainBuf(3);
}

function setP(p, v) { try { p.value = v; } catch { /* old implementations */ } }

function noiseBuf(sec, kind) {
  const c = A.ctx, n = Math.floor(sec * c.sampleRate);
  const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.7;
    else if (kind === 'pink') { // Paul Kellet's filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  fadeLoop(d, c.sampleRate);
  return b;
}

// cross-fade the ends so the loop has no click
function fadeLoop(d, sr) {
  const k = Math.min(d.length >> 2, Math.floor(sr * 0.05));
  for (let i = 0; i < k; i++) { const t = i / k; const a = d[i], z = d[d.length - k + i]; d[d.length - k + i] = z * (1 - t) + a * t; }
}

// Sparse sharp pops over a soft hiss: fire, and the debris after a blast.
function crackleBuf(sec) {
  const c = A.ctx, sr = c.sampleRate, n = Math.floor(sec * sr);
  const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.025;
  let i = 0;
  while (i < n) {
    i += Math.floor(sr * (0.004 + Math.random() ** 2 * 0.09));
    const amp = 0.25 + Math.random() ** 3 * 0.75, len = Math.floor(sr * (0.0008 + Math.random() * 0.004));
    for (let k = 0; k < len && i + k < n; k++) d[i + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / (len * 0.3));
  }
  return b;
}

// Rain: dense small droplet ticks over a hiss.
function rainBuf(sec) {
  const c = A.ctx, sr = c.sampleRate, n = Math.floor(sec * sr);
  const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.16;
  for (let j = 0; j < sec * 900; j++) {
    const at = (Math.random() * n) | 0, amp = 0.1 + Math.random() * 0.4, len = (sr * 0.0015) | 0;
    for (let k = 0; k < len && at + k < n; k++) d[at + k] += (Math.random() * 2 - 1) * amp * (1 - k / len);
  }
  fadeLoop(d, sr);
  return b;
}

function impulse(sec, tau) {
  const c = A.ctx, sr = c.sampleRate, n = Math.floor(sec * sr);
  const b = c.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = 0.25 + 0.7 * Math.exp(-t / 0.6); // darker as it decays
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-t / tau) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  return b;
}

// Peak and RMS of the last ~46 ms at a meter (debug only).
export function meter(an) {
  if (!an) return null;
  const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d);
  let pk = 0, sq = 0;
  for (const v of d) { const a = Math.abs(v); if (a > pk) pk = a; sq += v * v; }
  return { peak: +pk.toFixed(3), rms: +Math.sqrt(sq / d.length).toFixed(4) };
}

// ------------------------------------------------------------- voices
// Gates: [minimum seconds between starts, most alive at once]
const GATES = {
  cannon: [0.02, 7], cannonFar: [0.03, 5], whoosh: [0.06, 4], whistle: [0.1, 3], splash: [0.03, 6],
  hit: [0.025, 6], crit: [0.04, 3], explode: [0.05, 4], sink: [0.25, 3], chain: [0.1, 2], barrel: [0.1, 3],
  zap: [0.05, 3], thunder: [0.4, 2], kraken: [0.15, 2], coin: [0.04, 4], ui: [0.03, 3], hover: [0.05, 2],
  card: [0.05, 3], fanfare: [0.2, 3], roar: [0.3, 2], amb: [0.05, 6], spit: [0.1, 3], groan: [0.2, 2],
};

// o: { x, pan, gain, rev (0..1 send), dur (s), delay (s), bus, pri (2 ignores the voice cap) }
export function voice(name, o = {}) {
  const c = A.ctx;
  if (!c || A.muted || c.state !== 'running') return null;
  const t0 = c.currentTime;
  const t = t0 + 0.005 + (o.delay || 0), dur = o.dur || 1;
  const gate = GATES[name] || [0.02, 4];
  let gs = A.gates.get(name);
  if (!gs) A.gates.set(name, (gs = { last: -1, ends: [] }));
  gs.ends = gs.ends.filter((e) => e > t0);
  if (t - gs.last < gate[0] || gs.ends.length >= gate[1] || (A.live.length >= MAX_VOICES && (o.pri || 0) < 2)) {
    A.stats.dropped++; return null;
  }
  gs.last = t; gs.ends.push(t + dur);
  A.live.push(t + dur);
  A.stats.made++;
  const out = c.createGain(); out.gain.value = o.gain ?? 1;
  let tail = out;
  const pan = o.pan ?? panX(o.x);
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); out.connect(p); tail = p; }
  tail.connect(o.bus || A.sfx);
  if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; tail.connect(s); s.connect(A.revIn); }
  A.stats.nodes += 3;
  return { c, t, dur, out, tail };
}

export function prune() {
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  if (A.live.length) A.live = A.live.filter((e) => e > t);
  A.stats.voices = A.live.length;
  if (A.live.length > A.stats.peak) A.stats.peak = A.live.length;
}

// --------------------------------------------------------------- node kit
export function gain(v, val = 0, dest) { const g = A.ctx.createGain(); g.gain.value = val; if (dest) g.connect(dest); A.stats.nodes++; return g; }
export function filt(type, f, q = 0.707, dest) {
  const b = A.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
  if (dest) b.connect(dest); A.stats.nodes++; return b;
}
export function osc(type, f, t0, t1, dest) {
  const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f;
  if (dest) o.connect(dest); o.start(t0); o.stop(t1); A.stats.nodes++; return o;
}
export function noise(kind, t0, t1, dest, rate = 1) {
  const s = A.ctx.createBufferSource(), b = A.buf[kind] || A.buf.white;
  s.buffer = b; s.loop = true; s.playbackRate.value = rate;
  if (dest) s.connect(dest);
  s.start(t0, Math.random() * b.duration * 0.9); s.stop(t1); A.stats.nodes++; return s;
}
// Hit envelope: 0, up to peak in att seconds, exponential fall with time constant tau.
export function hitEnv(param, t, peak, att, tau) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + att);
  param.setTargetAtTime(0, t + att, tau);
}
// Swell: up over att, hold, down with tau from t + att + hold.
export function swell(param, t, peak, att, hold, tau) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + att);
  param.setValueAtTime(peak, t + att + hold);
  param.setTargetAtTime(0, t + att + hold, tau);
}
export function glide(param, t, f0, f1, dur) {
  param.setValueAtTime(Math.max(1, f0), t);
  param.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
}

// Briefly pull the music down under a big sound.
export function duck(depth = 0.5, hold = 0.15) {
  if (!A.duck || !A.ctx) return;
  const t = A.ctx.currentTime, p = A.duck.gain;
  p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
  p.setTargetAtTime(depth, t, 0.02);
  p.setTargetAtTime(1, t + hold, 0.45);
}
