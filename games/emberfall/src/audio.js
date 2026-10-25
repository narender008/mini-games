// Emberfall sound: Web Audio only, every note and effect synthesized here.
// Music is a set of generative layers (title, one per biome, boss, won), each
// with its own gain; updateAudio picks the mood from G.scene, G.room.biome and
// G.boss and crossfades, and a lookahead scheduler queues the notes of every
// audible layer. Sound effects answer the events on the bus (events.js).
// Graph: layers -> music (lowpass, ducked on pause/map) -> master -> compressor
// -> out; sfx -> master; both send to a generated reverb.
// audioDebug() reports { ctxState, muted, playing: [names], biome, mood } for tests.
import { on } from './events.js';

let ctx = null, master, music, musicLP, sfx, verb, noiseBuf, brownBuf, muted = false, voices = 0;
let mood = null, biome = null, lastHover = null;
const layers = {};
const recent = []; // [name, time] of recent sound effects
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export function initAudio() {
  if (ctx) { if (ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { ctx = new AC(); } catch { ctx = null; return; }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(comp);
  musicLP = ctx.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 16000; musicLP.connect(master);
  music = ctx.createGain(); music.gain.value = 0.55; music.connect(musicLP);
  sfx = ctx.createGain(); sfx.gain.value = 0.7; sfx.connect(master);
  verb = ctx.createConvolver(); verb.buffer = impulse(3.2, 2.6);
  const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  brownBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const b = brownBuf.getChannelData(0); let last = 0;
  for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  ctx.resume().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });
  hookEvents();
}

export function setMuted(m) {
  muted = !!m;
  if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
}

export function audioDebug() {
  const now = ctx ? ctx.currentTime : 0;
  const playing = Object.entries(layers).filter(([, L]) => L.on && L.target > 0).map(([n]) => 'music:' + n);
  for (const [n, t] of recent) if (now - t < 1.5) playing.push(n);
  return { ctxState: ctx ? ctx.state : 'none', muted, playing: [...new Set(playing)], biome, mood };
}

// ------------------------------------------------------------ building blocks
function impulse(sec, decay) {
  const n = ctx.sampleRate * sec, buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
  return buf;
}
// A voice's output: gain -> pan -> dest, with a reverb send. Returns the gain node.
function out(dest, { pan = 0, send = 0.2 } = {}) {
  const g = ctx.createGain();
  let node = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
  node.connect(dest);
  if (send) { const s = ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(verb); }
  return g;
}
function env(param, t, a, att, dur, rel = dur) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(a, t + att);
  param.setTargetAtTime(0.0001, t + att + Math.max(0, dur - att), rel / 4 + 0.001);
}
// A pitched note. o: { f, f2 (glide to), type, t, dur, a, att, rel, cut (lowpass), q, pan, send, detune }
function tone(dest, o) {
  const t = o.t ?? ctx.currentTime, dur = o.dur ?? 0.3, end = t + dur + (o.rel ?? dur) + 0.1;
  const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide ?? dur));
  if (o.detune) osc.detune.value = o.detune;
  const g = out(dest, o);
  let src = osc;
  if (o.cut) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cut; f.Q.value = o.q ?? 0.7; osc.connect(f); src = f; }
  src.connect(g);
  env(g.gain, t, o.a ?? 0.2, o.att ?? 0.005, dur, o.rel ?? dur);
  osc.start(t); osc.stop(end);
  track(osc);
}
// Filtered noise. o: { t, dur, a, type ('bandpass'...), f, f2, q, att, rel, pan, send, brown }
function noise(dest, o) {
  const t = o.t ?? ctx.currentTime, dur = o.dur ?? 0.2;
  const src = ctx.createBufferSource(); src.buffer = o.brown ? brownBuf : noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f ?? 1000, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide ?? dur));
  const g = out(dest, o);
  src.connect(f); f.connect(g);
  env(g.gain, t, o.a ?? 0.2, o.att ?? 0.005, dur, o.rel ?? dur);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + (o.rel ?? dur) + 0.1);
  track(src);
}
// A bell: inharmonic sine partials with long decays.
function bell(dest, f, t, a = 0.1, dur = 2.5, o = {}) {
  [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]].forEach(([k, m], i) => tone(dest, { f: f * k, t, dur: 0.01, rel: dur / (1 + i * 0.7), a: a * m, att: 0.002, send: o.send ?? 0.4, pan: o.pan }));
}
function track(node) { voices++; node.onended = () => { voices--; }; }

// ------------------------------------------------------------ music layers
// Each layer: start(L) builds its sustained nodes on L.gain, tick(L, from, to)
// schedules its notes in [from, to). L.v holds the layer's own state.
function drone(L, freqs, { type = 'sawtooth', cut = 300, a = 0.05, lfo = 0.06, lfoAmt = 120, detune = 6 } = {}) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.8; f.connect(L.gain);
  const lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = lfo; lg.gain.value = lfoAmt; lf.connect(lg); lg.connect(f.frequency); lf.start();
  const g = ctx.createGain(); g.gain.value = a; g.connect(f);
  const oscs = freqs.flatMap((fr) => [-detune, detune].map((d) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = d; o.connect(g); o.start(); return o; }));
  L.nodes.push(lf, ...oscs);
  return { oscs, filter: f, g };
}
function loopNoise(L, { brown = true, type = 'lowpass', f = 120, a = 0.1, q = 0.7 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = brown ? brownBuf : noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); g.gain.value = a; s.connect(fl); fl.connect(g); g.connect(L.gain); s.start();
  L.nodes.push(s);
  return g;
}
// Formant "choir" voice: detuned saws through vowel band-passes.
function choir(L, notes, a = 0.03) {
  const sum = ctx.createGain(); sum.gain.value = a; sum.connect(L.gain);
  for (const [fq, q, m] of [[700, 8, 1], [1150, 9, 0.6], [2500, 10, 0.25]]) {
    const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = fq; b.Q.value = q; const g = ctx.createGain(); g.gain.value = m * 3; b.connect(g); g.connect(sum); L.forms = (L.forms || []).concat(b);
  }
  const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5; vg.gain.value = 6; vib.connect(vg); vib.start(); L.nodes.push(vib);
  const oscs = notes.flatMap((m) => [-8, 0, 9].map((d) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d; vg.connect(o.detune);
    for (const b of L.forms) o.connect(b);
    o.start(); return o;
  }));
  L.nodes.push(...oscs);
  return oscs;
}

const LAYERS = {
  title: {
    start(L) { drone(L, [mtof(45), mtof(52)], { cut: 260, a: 0.05 }); L.v.pad = drone(L, [mtof(57), mtof(60), mtof(64)], { type: 'triangle', cut: 1200, a: 0.035, lfo: 0.1, lfoAmt: 300, detune: 4 }); },
    tick(L, t0, t1) {
      every(L, 'chime', t0, t1, () => rnd(2.5, 5), (t) => bell(L.gain, mtof(pick([72, 76, 79, 81, 84])), t, 0.05, 3.5, { pan: rnd(-0.6, 0.6) }));
    },
  },
  hollow: {
    start(L) { drone(L, [55, 82.4], { cut: 200, a: 0.07, lfo: 0.07, lfoAmt: 70 }); loopNoise(L, { f: 160, a: 0.12 }); },
    tick(L, t0, t1) {
      every(L, 'drip', t0, t1, () => rnd(0.6, 2.6), (t) => { const f = rnd(1200, 2200); tone(L.gain, { f, f2: f * 0.45, glide: 0.07, t, dur: 0.05, rel: 0.12, a: 0.06, pan: rnd(-0.8, 0.8), send: 0.8 }); });
      every(L, 'chime', t0, t1, () => rnd(4, 9), (t) => bell(L.gain, mtof(pick([69, 72, 74, 76, 79])), t, 0.035, 4, { pan: rnd(-0.7, 0.7), send: 0.8 }));
      every(L, 'low', t0, t1, () => rnd(7, 12), (t) => tone(L.gain, { f: mtof(pick([33, 36, 38])), type: 'triangle', t, dur: 3, att: 1.5, rel: 3, a: 0.08, cut: 300 }));
    },
  },
  thicket: {
    start(L) { L.v.pad = drone(L, [mtof(50), mtof(57), mtof(60), mtof(65)], { type: 'triangle', cut: 900, a: 0.03, lfo: 0.08, lfoAmt: 250, detune: 5 }); loopNoise(L, { brown: false, type: 'bandpass', f: 3200, q: 0.6, a: 0.008 }); L.v.step = 0; L.v.chord = 0; },
    tick(L, t0, t1) {
      const chords = [[62, 65, 69, 72, 74], [60, 64, 67, 71, 74], [58, 62, 65, 69, 72], [57, 60, 64, 67, 69]];
      every(L, 'arp', t0, t1, () => 0.25, (t) => {
        const s = L.v.step++; if (s % 32 === 0) L.v.chord = (L.v.chord + 1) % chords.length;
        const c = chords[L.v.chord], pat = [0, 2, 4, 2, 1, 3, 4, 3];
        if (Math.random() < 0.72) tone(L.gain, { f: mtof(c[pat[s % 8]] + (s % 16 >= 8 ? 12 : 0)), type: 'triangle', t, dur: 0.02, rel: 0.5, a: 0.05, cut: 2600, pan: Math.sin(s * 0.7) * 0.5, send: 0.45 });
        if (s % 16 === 0) L.v.pad.oscs.forEach((o, i) => { if (i % 2 === 0) o.frequency.setTargetAtTime(mtof(c[(i / 2) % 4] - 12), t, 0.8); });
      });
    },
  },
  cloister: {
    start(L) { L.v.voices = choir(L, [52, 59, 64, 67], 0.022); drone(L, [mtof(28)], { type: 'sine', cut: 200, a: 0.12, lfoAmt: 20 }); L.v.c = 0; },
    tick(L, t0, t1) {
      const chords = [[52, 59, 64, 67], [48, 55, 64, 67], [45, 57, 60, 64], [47, 54, 59, 63]];
      every(L, 'chord', t0, t1, () => 8, (t) => { const c = chords[L.v.c++ % 4]; L.v.voices.forEach((o, i) => o.frequency.setTargetAtTime(mtof(c[(i / 3) | 0]), t, 1.2)); });
      every(L, 'toll', t0, t1, () => rnd(7, 11), (t) => bell(L.gain, mtof(pick([40, 43, 45])), t, 0.09, 6, { send: 0.9 }));
      every(L, 'water', t0, t1, () => rnd(1.5, 4), (t) => { const f = rnd(900, 1800); tone(L.gain, { f, f2: f * 1.8, glide: 0.05, t, dur: 0.03, rel: 0.1, a: 0.035, pan: rnd(-0.8, 0.8), send: 0.9 }); });
    },
  },
  core: {
    start(L) { loopNoise(L, { f: 90, a: 0.3 }); drone(L, [mtof(24), mtof(31)], { cut: 140, a: 0.08, lfo: 0.05, lfoAmt: 50 }); },
    tick(L, t0, t1) {
      every(L, 'pulse', t0, t1, () => 1.4, (t) => { tone(L.gain, { f: 58, f2: 38, glide: 0.25, t, dur: 0.05, rel: 0.5, a: 0.22 }); tone(L.gain, { f: 52, f2: 36, glide: 0.25, t: t + 0.28, dur: 0.05, rel: 0.4, a: 0.13 }); });
      every(L, 'growl', t0, t1, () => rnd(6, 11), (t) => tone(L.gain, { f: mtof(pick([36, 37, 39])), type: 'sawtooth', t, dur: 2.5, att: 1.2, rel: 2, a: 0.05, cut: 260, q: 4 }));
      every(L, 'hiss', t0, t1, () => rnd(2, 5), (t) => noise(L.gain, { t, dur: 0.6, att: 0.2, a: 0.025, f: 2400, q: 0.8, pan: rnd(-0.8, 0.8) }));
    },
  },
  boss: {
    start(L) { drone(L, [mtof(26), mtof(27)], { cut: 240, a: 0.07, lfo: 0.5, lfoAmt: 80 }); L.v.s = 0; },
    tick(L, t0, t1) {
      const bass = [38, 38, 41, 38, 36, 38, 43, 41];
      every(L, 'beat', t0, t1, () => 60 / 132 / 2, (t) => {
        const s = L.v.s++, b = s % 16;
        if (b === 0 || b === 6 || b === 8 || b === 11) tone(L.gain, { f: 110, f2: 42, glide: 0.12, t, dur: 0.03, rel: 0.35, a: 0.35, send: 0.05 });
        if (b === 4 || b === 12) { noise(L.gain, { t, dur: 0.03, rel: 0.2, a: 0.14, f: 1800, q: 0.7, send: 0.3 }); tone(L.gain, { f: 180, f2: 120, t, dur: 0.02, rel: 0.15, a: 0.1 }); }
        if (b === 14 || b === 15) tone(L.gain, { f: b === 14 ? 140 : 110, f2: 70, t, dur: 0.02, rel: 0.25, a: 0.16, pan: b === 14 ? -0.4 : 0.4 });
        if (s % 2) noise(L.gain, { type: 'highpass', t, dur: 0.01, rel: 0.04, a: 0.03, f: 7000, send: 0.05, pan: 0.3 });
        if (s % 2 === 0) tone(L.gain, { f: mtof(bass[(s / 2 | 0) % 8]), type: 'sawtooth', t, dur: 0.12, rel: 0.12, a: 0.08, cut: 500, q: 3 });
        if (s % 64 === 32) bell(L.gain, mtof(62), t, 0.06, 3);
      });
    },
  },
  won: {
    start(L) { drone(L, [mtof(48), mtof(55), mtof(64), mtof(67)], { type: 'triangle', cut: 1600, a: 0.04, lfo: 0.1, lfoAmt: 400, detune: 4 }); L.v.i = 0; },
    tick(L, t0, t1) {
      const up = [72, 76, 79, 84, 79, 76, 74, 77, 81, 86, 81, 77];
      every(L, 'bells', t0, t1, () => 0.6, (t) => { if (Math.random() < 0.8) bell(L.gain, mtof(up[L.v.i++ % up.length]), t, 0.04, 3, { pan: rnd(-0.5, 0.5) }); });
    },
  },
};
// Run fn at each scheduled time of the named event inside [t0, t1).
function every(L, name, t0, t1, gap, fn) {
  let n = L.v['n_' + name];
  if (n == null || n < t0 - 0.5) n = t0 + Math.random() * 0.3;
  while (n < t1) { fn(Math.max(n, t0)); n += gap(); }
  L.v['n_' + name] = n;
}

function layer(name) {
  let L = layers[name];
  if (!L) { L = layers[name] = { gain: ctx.createGain(), nodes: [], v: {}, on: false, target: 0, idle: 0 }; L.gain.gain.value = 0; L.gain.connect(music); }
  return L;
}
function setLayer(name, target, now) {
  const L = layer(name);
  if (target > 0 && !L.on) { L.on = true; L.nodes = []; L.v = {}; L.forms = []; LAYERS[name].start(L); }
  if (L.target !== target) { L.target = target; L.gain.gain.setTargetAtTime(target, now, target > 0 ? 1.2 : 0.8); }
}

// ------------------------------------------------------------ per frame
export function updateAudio(G, dt) {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime, s = G.scene;
  biome = G.room?.biome || null;
  const want = {};
  if (s === 'title') want.title = 1;
  else if (s === 'won') want.won = 1;
  else if (G.boss) { want.boss = 1; if (biome) want[biome] = 0.25; }
  else if (biome && LAYERS[biome]) want[biome] = 1;
  mood = Object.keys(want).sort((a, b) => want[b] - want[a])[0] || null;
  for (const name of Object.keys(LAYERS)) setLayer(name, want[name] || 0, now);
  // quieter and darker on pause / map, muffled while dead
  const duck = s === 'paused' || s === 'map' ? 0.45 : s === 'dead' ? 0.3 : 1;
  const cut = s === 'paused' || s === 'map' ? 900 : s === 'dead' ? 400 : 16000;
  if (Math.abs(music.gain.value - 0.55 * duck) > 0.005) music.gain.setTargetAtTime(0.55 * duck, now, 0.25);
  if (Math.abs(musicLP.frequency.value - cut) > 10) musicLP.frequency.setTargetAtTime(cut, now, 0.25);
  for (const [name, L] of Object.entries(layers)) {
    if (!L.on) continue;
    if (L.target > 0) { L.idle = 0; LAYERS[name].tick(L, now + 0.02, now + 0.25); }
    else if ((L.idle += dt) > 4) { for (const n of L.nodes) { try { n.stop(); } catch { /* already */ } } L.nodes = []; L.on = false; L.idle = 0; }
  }
  if (G.ui && G.ui.hover !== lastHover) { lastHover = G.ui.hover; if (lastHover) play('hover'); }
}

// ------------------------------------------------------------ sound effects
const minGap = { shard: 0.05, hit: 0.03, land: 0.08, swing: 0.05, crumble: 0.1, hover: 0.05, splash: 0.12 };
const lastAt = {};
function play(name, d = {}) {
  if (!ctx || ctx.state !== 'running' || muted) return;
  const now = ctx.currentTime;
  if (now - (lastAt[name] ?? -9) < (minGap[name] ?? 0.02)) return;
  if (voices > 140) return;
  lastAt[name] = now;
  recent.push([name, now]); if (recent.length > 40) recent.shift();
  const fx = SFX[name]; if (fx) fx(sfx, now, d);
}
const SFX = {
  jump: (o, t, d) => {
    if (d.double) { tone(o, { f: 520, f2: 1100, glide: 0.12, t, dur: 0.12, rel: 0.12, a: 0.08, type: 'triangle' }); for (let i = 0; i < 3; i++) tone(o, { f: mtof(pick([84, 88, 91])), t: t + i * 0.04, dur: 0.01, rel: 0.2, a: 0.025, send: 0.5 }); }
    else tone(o, { f: 260, f2: 520, glide: 0.1, t, dur: 0.08, rel: 0.08, a: 0.08, type: 'triangle' });
    noise(o, { t, dur: 0.05, rel: 0.06, a: 0.05, f: 1400, q: 0.6, send: 0.05 });
  },
  land: (o, t, d) => { const k = Math.min(1, Math.abs(d.v || 400) / 900); noise(o, { t, dur: 0.04, rel: 0.1, a: 0.06 + 0.12 * k, type: 'lowpass', f: 380 + 300 * k, send: 0.05 }); },
  dash: (o, t) => { noise(o, { t, dur: 0.18, rel: 0.14, a: 0.2, f: 700, f2: 3400, glide: 0.2, q: 1.4, att: 0.02 }); tone(o, { f: 180, f2: 90, t, dur: 0.12, rel: 0.1, a: 0.1 }); },
  'wall-jump': (o, t) => { noise(o, { t, dur: 0.02, rel: 0.05, a: 0.12, f: 2200, q: 2 }); noise(o, { t: t + 0.01, dur: 0.1, rel: 0.1, a: 0.08, f: 900, f2: 2400, q: 1 }); },
  swing: (o, t) => noise(o, { t, dur: 0.1, rel: 0.08, a: 0.1, f: 600, f2: 2600, glide: 0.1, q: 2.2, att: 0.015, send: 0.05 }),
  hit: (o, t, d) => {
    const big = d.target === 'boss' || (d.dmg || 1) > 1;
    tone(o, { f: big ? 160 : 230, f2: 70, glide: 0.1, t, dur: 0.05, rel: 0.12, a: big ? 0.22 : 0.16, type: 'triangle' });
    noise(o, { t, dur: 0.02, rel: 0.06, a: 0.14, type: 'highpass', f: 2500, send: 0.1 });
  },
  'enemy-die': (o, t) => { noise(o, { t, dur: 0.1, rel: 0.3, a: 0.16, type: 'lowpass', f: 1600, f2: 200, glide: 0.35 }); tone(o, { f: 420, f2: 90, glide: 0.3, t, dur: 0.2, rel: 0.15, a: 0.08, type: 'triangle' }); for (let i = 0; i < 3; i++) tone(o, { f: mtof(pick([79, 83, 86, 90])), t: t + 0.05 + i * 0.05, dur: 0.01, rel: 0.25, a: 0.025, send: 0.5 }); },
  bolt: (o, t) => { tone(o, { f: 700, f2: 1500, glide: 0.12, t, dur: 0.1, rel: 0.12, a: 0.07, type: 'triangle', send: 0.3 }); noise(o, { t, dur: 0.15, rel: 0.1, a: 0.05, f: 4000, q: 1.5 }); },
  hook: (o, t) => { for (let i = 0; i < 6; i++) noise(o, { t: t + i * 0.035, dur: 0.008, rel: 0.04, a: 0.08, f: 3200 + i * 300, q: 8, send: 0.2 }); },
  'hook-pull': (o, t) => noise(o, { t, dur: 0.22, rel: 0.12, a: 0.1, f: 500, f2: 1800, q: 1.2, att: 0.04 }),
  'fire-form': (o, t, d) => {
    if (d.on === false) { noise(o, { t, dur: 0.3, rel: 0.3, a: 0.08, type: 'lowpass', f: 2400, f2: 300, glide: 0.5 }); return; }
    noise(o, { t, dur: 0.6, rel: 0.5, a: 0.24, type: 'lowpass', f: 200, f2: 2600, glide: 0.4, att: 0.08, send: 0.3 });
    tone(o, { f: 70, f2: 110, glide: 0.5, t, dur: 0.6, rel: 0.4, a: 0.12, type: 'sawtooth', cut: 500, q: 3 });
  },
  splash: (o, t, d) => { const k = Math.min(1.5, d.size || 1); noise(o, { t, dur: 0.08, rel: 0.35 * k, a: 0.12 * k, type: 'lowpass', f: 2200, f2: 500, glide: 0.4, send: 0.4 }); for (let i = 0; i < 4; i++) { const f = rnd(700, 1500); tone(o, { f, f2: f * 1.6, glide: 0.04, t: t + 0.05 + i * rnd(0.03, 0.08), dur: 0.02, rel: 0.06, a: 0.03, send: 0.5 }); } },
  crumble: (o, t) => { for (let i = 0; i < 4; i++) noise(o, { t: t + i * rnd(0.03, 0.07), dur: 0.03, rel: 0.1, a: 0.08, type: 'lowpass', f: rnd(400, 900) }); },
  break: (o, t) => { noise(o, { t, dur: 0.05, rel: 0.5, a: 0.3, type: 'lowpass', f: 3000, f2: 250, glide: 0.5, send: 0.4 }); tone(o, { f: 90, f2: 40, t, dur: 0.1, rel: 0.4, a: 0.2 }); for (let i = 0; i < 6; i++) noise(o, { t: t + 0.05 + i * rnd(0.03, 0.09), dur: 0.01, rel: 0.05, a: 0.06, f: rnd(1500, 4000), q: 5 }); },
  burn: (o, t) => { noise(o, { t, dur: 0.4, rel: 0.4, a: 0.12, f: 2600, q: 0.6, att: 0.05 }); for (let i = 0; i < 6; i++) noise(o, { t: t + rnd(0, 0.5), dur: 0.005, rel: 0.02, a: 0.08, type: 'highpass', f: 3000 }); },
  'player-hit': (o, t) => { noise(o, { t, dur: 0.05, rel: 0.2, a: 0.25, type: 'lowpass', f: 900 }); tone(o, { f: 220, t, dur: 0.15, rel: 0.2, a: 0.07, type: 'sawtooth', cut: 1200 }); tone(o, { f: 233, t, dur: 0.15, rel: 0.2, a: 0.07, type: 'sawtooth', cut: 1200 }); },
  'player-die': (o, t) => { tone(o, { f: 440, f2: 90, glide: 1.4, t, dur: 1.2, rel: 0.6, a: 0.12, type: 'triangle', send: 0.6 }); noise(o, { t, dur: 1.2, att: 0.3, rel: 0.8, a: 0.08, type: 'lowpass', f: 2000, f2: 150, glide: 1.6 }); },
  respawn: (o, t) => { for (let i = 0; i < 5; i++) tone(o, { f: mtof([57, 64, 69, 72, 76][i]), t: t + i * 0.08, dur: 0.02, rel: 0.6, a: 0.04, type: 'triangle', send: 0.6 }); },
  pickup: (o, t, d) => {
    if (d.kind === 'vessel') { for (const m of [60, 64, 67, 72]) tone(o, { f: mtof(m), t, dur: 0.6, att: 0.15, rel: 1, a: 0.05, type: 'triangle', send: 0.6 }); bell(o, mtof(84), t + 0.2, 0.06); }
    else if (d.kind === 'lore') noise(o, { t, dur: 0.25, rel: 0.2, a: 0.04, f: 3500, q: 0.5, att: 0.08 });
  },
  ability: (o, t) => {
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => bell(o, mtof(m), t + i * 0.09, 0.05, 2.5, { pan: (i - 3) * 0.15 }));
    for (const m of [48, 55, 64, 67]) tone(o, { f: mtof(m), t, dur: 1.8, att: 0.4, rel: 1.5, a: 0.05, type: 'triangle', cut: 2000, send: 0.6 });
  },
  shard: (o, t) => { const m = pick([84, 86, 88, 91, 93]); bell(o, mtof(m), t, 0.035, 0.8, { pan: rnd(-0.4, 0.4) }); },
  save: (o, t) => { noise(o, { t, dur: 0.5, att: 0.2, rel: 0.4, a: 0.1, type: 'lowpass', f: 300, f2: 2400, glide: 0.5 }); for (const [i, m] of [57, 61, 64, 69].entries()) bell(o, mtof(m + 12), t + 0.25 + i * 0.12, 0.04, 2.5); },
  gate: (o, t) => noise(o, { t, dur: 0.8, att: 0.1, rel: 0.4, a: 0.12, brown: true, type: 'lowpass', f: 300, send: 0.3 }),
  'boss-spawn': (o, t) => roar(o, t, 1),
  'boss-roar': (o, t) => roar(o, t, 0.7),
  'boss-phase': (o, t) => { roar(o, t, 1); tone(o, { f: 90, f2: 35, glide: 0.4, t, dur: 0.05, rel: 0.8, a: 0.35 }); },
  'boss-dead': (o, t) => { roar(o, t, 0.9); noise(o, { t: t + 0.3, dur: 2, att: 0.2, rel: 1.5, a: 0.22, brown: true, type: 'lowpass', f: 400, f2: 60, glide: 2.5 }); bell(o, mtof(50), t + 1.2, 0.12, 5, { send: 0.9 }); },
  won: (o, t) => { for (const m of [48, 55, 60, 64, 67, 72]) tone(o, { f: mtof(m), t, dur: 3, att: 0.8, rel: 3, a: 0.04, type: 'triangle', send: 0.8 }); },
  ui: (o, t) => tone(o, { f: 1100, f2: 1500, glide: 0.03, t, dur: 0.02, rel: 0.06, a: 0.06, type: 'triangle', send: 0.2 }),
  hover: (o, t) => tone(o, { f: 1800, t, dur: 0.01, rel: 0.03, a: 0.02, send: 0.1 }),
  biome: (o, t) => noise(o, { t, dur: 1.2, att: 0.6, rel: 1, a: 0.05, f: 600, f2: 1800, glide: 1.4, q: 0.7, send: 0.6 }),
};
function roar(o, t, k) {
  noise(o, { t, dur: 1.2 * k, att: 0.15, rel: 0.6, a: 0.3 * k, type: 'lowpass', f: 250, f2: 1400, glide: 0.5, q: 3, send: 0.4 });
  tone(o, { f: 55, f2: 75, glide: 0.4, t, dur: 1.1 * k, att: 0.1, rel: 0.5, a: 0.18 * k, type: 'sawtooth', cut: 600, q: 5 });
  tone(o, { f: 58, f2: 70, glide: 0.5, t, dur: 1.1 * k, att: 0.1, rel: 0.5, a: 0.14 * k, type: 'sawtooth', cut: 500, q: 5 });
}

let hooked = false;
function hookEvents() {
  if (hooked) return; hooked = true;
  for (const name of Object.keys(SFX)) if (name !== 'hover') on(name, (d) => play(name, d || {}));
}
