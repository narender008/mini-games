// Loomwake sound core: the mixing graph, shared buffers and the voice budget.
//
// Everything is built on an "engine" E made by createEngine(ctx). The live game
// uses one engine on a real AudioContext; the offline check (dev/audio.html)
// makes a fresh engine on an OfflineAudioContext, so the same code that plays
// in the game is what gets measured.
//
//   sfx ───────┐                                   ┌─ reverb A ─┐
//   voice ─────┼─ mix ─ glue comp ─ limiter ─ trim ─ soft clip ─ out ─ destination
//   music ─ muffle ─ duck ─┘     ▲                  └─ reverb B ─┘ (crossfaded per room)
//   (every bus also sends to the room reverb, after its volume)
//
// The soft clip is a WaveShaper whose curve tops out at 0.98, so no stack of
// hits can ever push the output past full scale. A voice is one sound effect:
// a gain (and optional stereo panner) its sources feed; voice() refuses new
// sounds once too many are alive, and repeats of the same sound inside a short
// window get quieter instead of louder.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const P = (param, v, t) => { try { param.setValueAtTime(v, t); } catch (e) { param.value = v; } };

// Room reverbs, generated once each and cached on the engine.
export const ROOMS = { // len is kept short (convolution cost scales with it); the tail fades out smoothly
  hub:       { len: 1.5, decay: 1.8, damp: 0.55, pre: 0.014, er: 5, bright: 0.55, width: 0.8 },
  title:     { len: 2.0, decay: 2.4, damp: 0.6, pre: 0.02, er: 4, bright: 0.5, width: 0.9 },
  glasswood: { len: 1.9, decay: 2.2, damp: 0.25, pre: 0.018, er: 7, bright: 0.85, width: 1 },
  choir:     { len: 2.4, decay: 3.0, damp: 0.6, pre: 0.035, er: 6, bright: 0.45, width: 1 },
  forge:     { len: 1.2, decay: 1.2, damp: 0.4, pre: 0.008, er: 11, bright: 0.7, width: 0.7 },
  unwoven:   { len: 2.4, decay: 2.9, damp: 0.75, pre: 0.05, er: 3, bright: 0.35, width: 1 },
};

export function createEngine(ctx, opts = {}) {
  const E = {
    ctx, sr: ctx.sampleRate, offline: !!opts.offline,
    maxVoices: opts.maxVoices || 36,
    live: [], recent: new Map(), cache: new Map(),
    stats: { made: 0, dropped: 0, stacked: 0 },
    vol: { master: 0.85, music: 0.7, sfx: 0.9, voice: 0.85 },
    muted: false, room: null, G: null,
  };
  E.now = () => ctx.currentTime;

  // ---- shared buffers -------------------------------------------------
  E.noise = noiseBuffer(ctx, 2, 'white');
  E.pink = noiseBuffer(ctx, 2, 'pink');
  E.brown = noiseBuffer(ctx, 2, 'brown');

  // ---- master chain ---------------------------------------------------
  const out = ctx.createGain(); out.gain.value = E.muted ? 0 : 1;
  const clipIn = ctx.createGain(); clipIn.gain.value = 0.5; // curve domain is +-2
  const clip = ctx.createWaveShaper(); clip.curve = softClipCurve(); clip.oversample = 'none';
  const trim = ctx.createGain(); trim.gain.value = 0.72; // Chrome's compressors add make-up gain
  const lim = ctx.createDynamicsCompressor();
  P(lim.threshold, -3.5, 0); P(lim.knee, 0, 0); P(lim.ratio, 20, 0); P(lim.attack, 0.0015, 0); P(lim.release, 0.09, 0);
  const glue = ctx.createDynamicsCompressor();
  P(glue.threshold, -16, 0); P(glue.knee, 9, 0); P(glue.ratio, 2.6, 0); P(glue.attack, 0.006, 0); P(glue.release, 0.24, 0);
  const mix = ctx.createGain(); mix.gain.value = E.vol.master;
  mix.connect(glue); glue.connect(lim); lim.connect(trim); trim.connect(clipIn); clipIn.connect(clip); clip.connect(out);
  out.connect(ctx.destination);
  E.out = out; E.mix = mix; E.glue = glue; E.limiter = lim;
  if (!E.offline && ctx.createAnalyser) {
    E.analyser = ctx.createAnalyser(); E.analyser.fftSize = 512; out.connect(E.analyser);
  }

  // ---- reverb: two convolvers crossfaded when the room changes ---------
  E.revIn = ctx.createGain(); E.revIn.gain.value = 1;
  const revOut = ctx.createGain(); revOut.gain.value = 0.9; revOut.connect(mix);
  E.revA = ctx.createConvolver(); E.revB = ctx.createConvolver();
  E.revAG = ctx.createGain(); E.revBG = ctx.createGain(); E.revAG.gain.value = 1; E.revBG.gain.value = 0;
  E.revIn.connect(E.revA); E.revIn.connect(E.revB);
  E.revA.connect(E.revAG); E.revB.connect(E.revBG); E.revAG.connect(revOut); E.revBG.connect(revOut);
  E.revActive = 'A';

  // ---- buses ----------------------------------------------------------
  // sfx
  E.sfx = ctx.createGain(); E.sfx.gain.value = E.vol.sfx;
  E.sfx.connect(mix);
  E.sfxSend = ctx.createGain(); E.sfxSend.gain.value = 0.16; E.sfx.connect(E.sfxSend); E.sfxSend.connect(E.revIn);
  // ambience (under the sfx volume)
  E.amb = ctx.createGain(); E.amb.gain.value = 0.55; E.amb.connect(E.sfx);
  // voice
  E.voice = ctx.createGain(); E.voice.gain.value = E.vol.voice; E.voice.connect(mix);
  const vSend = ctx.createGain(); vSend.gain.value = 0.14; E.voice.connect(vSend); vSend.connect(E.revIn);
  // music: tracks feed E.music (dry) and E.musicWet (extra reverb)
  E.music = ctx.createGain(); E.music.gain.value = 1;
  E.muffle = ctx.createBiquadFilter(); E.muffle.type = 'lowpass'; E.muffle.frequency.value = 20000; E.muffle.Q.value = 0.5;
  E.duck = ctx.createGain(); E.duck.gain.value = 1;
  E.musicVol = ctx.createGain(); E.musicVol.gain.value = E.vol.music * 0.62;
  E.music.connect(E.muffle); E.muffle.connect(E.duck); E.duck.connect(E.musicVol); E.musicVol.connect(mix);
  // wet music goes only to the reverb, through its own muffle and volume
  E.musicWet = ctx.createGain(); E.musicWet.gain.value = 1;
  E.wetMuffle = ctx.createBiquadFilter(); E.wetMuffle.type = 'lowpass'; E.wetMuffle.frequency.value = 20000;
  const mwVol = ctx.createGain(); mwVol.gain.value = E.vol.music * 0.62;
  E.musicWet.connect(E.wetMuffle); E.wetMuffle.connect(mwVol); mwVol.connect(E.revIn);
  E.musicWetVol = mwVol;
  // dry music also feeds a little reverb so everything sits in the same room
  const mSend = ctx.createGain(); mSend.gain.value = 0.12; E.musicVol.connect(mSend); mSend.connect(E.revIn);

  E.raw = !!opts.raw;
  setRoom(E, opts.room || 'hub', 0);
  applyVolumes(E);
  return E;
}

// ---- buffers ------------------------------------------------------------
export function noiseBuffer(ctx, seconds, color) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
    } else d[i] = w;
  }
  // fade the loop seam
  const f = Math.min(256, n >> 2);
  for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[n - 1 - i] *= k; }
  return b;
}

function softClipCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = ((i / (n - 1)) * 2 - 1) * 2; // signal value -2..2
    const a = Math.abs(s);
    const y = a < 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18);
    c[i] = Math.sign(s) * y;
  }
  return c;
}

let driveCurves = new Map();
export function driveCurve(k = 3) {
  if (driveCurves.has(k)) return driveCurves.get(k);
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
  driveCurves.set(k, c); return c;
}

// A stereo impulse response: early reflections, then a damped noise tail.
export function impulse(ctx, room) {
  const sr = ctx.sampleRate, n = Math.floor(sr * room.len);
  const b = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(room.pre * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / room.decay);
      // damping: the low-pass closes as the tail ages
      const a = clamp(room.bright * Math.exp(-t * (1 + room.damp * 4)) + 0.04, 0.02, 1);
      y += a * ((Math.random() * 2 - 1) - y);
      d[i] = y * env * (ch ? 1 : 1) * (0.6 + 0.4 * room.width);
    }
    for (let k = 0; k < room.er; k++) {
      const at = pre + Math.floor((0.004 + Math.random() * 0.05) * sr);
      if (at < n) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - k * 0.03) * (0.7 + Math.random() * 0.3);
    }
    const fi = Math.floor(0.003 * sr);
    for (let i = 0; i < fi && pre + i < n; i++) d[pre + i] *= i / fi;
    const fo = Math.floor(n * 0.3); // cosine fade over the last 30% so the cut is inaudible
    for (let i = 0; i < fo; i++) d[n - fo + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fo);
  }
  return b;
}

export function setRoom(E, id, fade = 1.2) {
  const room = ROOMS[id] || ROOMS.hub;
  if (E.room === id) return;
  E.room = id;
  let ir = E.cache.get('ir:' + id);
  if (!ir) { ir = impulse(E.ctx, room); E.cache.set('ir:' + id, ir); }
  const t = E.now();
  if (!E.revA.buffer) {
    // first room: load convolver A directly
    E.revA.buffer = ir; E.revActive = 'A'; P(E.revAG.gain, 1, t); P(E.revBG.gain, 0, t); return;
  }
  // load the idle convolver (a fresh node, since a buffer can be swapped on a
  // live convolver but that clicks), then crossfade to it
  const into = E.revActive === 'A' ? 'B' : 'A';
  const gIn = into === 'A' ? E.revAG : E.revBG, gOut = into === 'A' ? E.revBG : E.revAG;
  const old = into === 'A' ? E.revA : E.revB;
  const conv = E.ctx.createConvolver(); conv.buffer = ir;
  E.revIn.connect(conv); conv.connect(gIn);
  try { E.revIn.disconnect(old); old.disconnect(); } catch (e) {}
  if (into === 'A') E.revA = conv; else E.revB = conv;
  fade = Math.max(fade, 0.02);
  gIn.gain.cancelScheduledValues(t); gOut.gain.cancelScheduledValues(t);
  gIn.gain.setValueAtTime(gIn.gain.value, t); gIn.gain.linearRampToValueAtTime(1, t + fade);
  gOut.gain.setValueAtTime(gOut.gain.value, t); gOut.gain.linearRampToValueAtTime(0, t + fade);
  E.revActive = into;
}

// ---- voices -------------------------------------------------------------
// Repeats of one sound inside `win` seconds get quieter (1, 0.7, 0.5...), and
// past `cap` they are dropped. Returns the gain factor, or 0 to skip.
export function stackGain(E, name, t, win = 0.07, cap = 5) {
  let r = E.recent.get(name);
  if (!r) { r = []; E.recent.set(name, r); }
  while (r.length && r[0] < t - win) r.shift();
  if (r.length >= cap) { E.stats.stacked++; return 0; }
  r.push(t);
  return 1 / Math.sqrt(r.length);
}

// Make a voice: a gain into the sfx bus (or another bus), with an optional
// stereo panner. Returns null when the budget says no (priority 2+ always wins).
export function voice(E, t, dur, o = {}) {
  const now = E.now();
  if (E.live.length > 8) E.live = E.live.filter((v) => v.end > now);
  if (E.live.length >= E.maxVoices && (o.prio || 1) < 2) {
    // steal the oldest quiet voice if this one matters more
    E.stats.dropped++; return null;
  }
  const c = E.ctx;
  const g = c.createGain(); g.gain.value = o.gain ?? 1;
  let head = g;
  if (o.pan && c.createStereoPanner) {
    const p = c.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); head = p;
  }
  head.connect(o.bus || E.sfx);
  if (o.send) { const s = c.createGain(); s.gain.value = o.send; head.connect(s); s.connect(E.revIn); }
  E.live.push({ end: t + dur, prio: o.prio || 1 });
  E.stats.made++;
  return g;
}

// Briefly duck the music under a big moment.
export function duckMusic(E, depth = 0.55, hold = 0.25, release = 0.9) {
  const t = E.now(), p = E.duck.gain;
  p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(depth, t + 0.03);
  p.setValueAtTime(depth, t + 0.03 + hold);
  p.linearRampToValueAtTime(1, t + 0.03 + hold + release);
}

export function applyVolumes(E) {
  const t = E.now(), v = E.vol;
  const curve = (x) => clamp(x, 0, 1) ** 1.6; // perceptual-ish
  E.mix.gain.setTargetAtTime(curve(v.master), t, 0.03);
  E.sfx.gain.setTargetAtTime(curve(v.sfx), t, 0.03);
  E.voice.gain.setTargetAtTime(curve(v.voice), t, 0.03);
  E.musicVol.gain.setTargetAtTime(curve(v.music) * 0.62, t, 0.05);
  E.musicWetVol.gain.setTargetAtTime(curve(v.music) * 0.62, t, 0.05);
  E.out.gain.setTargetAtTime(E.muted ? 0 : 1, t, 0.03);
}

// Low-pass the music (pause menu, low health). f = 20000 is open.
export function muffleMusic(E, f = 20000, tau = 0.25) {
  const t = E.now();
  E.muffle.frequency.setTargetAtTime(f, t, tau);
  E.wetMuffle.frequency.setTargetAtTime(f, t, tau);
}
