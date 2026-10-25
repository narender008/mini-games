// Synthesis kit: small node recipes that every sound effect and instrument is
// built from. Each takes (E, t, out, o): the engine, a start time on E's clock,
// the node to feed, and options. They return the time the sound is over, so a
// caller can size its voice. Nothing here allocates buffers per call except
// the plucked-string cache, which renders each pitch once and reuses it.
import { clamp, mtof, driveCurve } from './core.js';
import * as B from './bank.js';

const TINY = 0.0001;
const q2 = (v) => Math.round(v * 50) / 50;
const F = (f) => clamp(f || 440, 8, 20000);

// Percussive envelope: linear attack to `peak`, then an exponential-style fall
// that is ~-43 dB at t + a + d. Never ramps to 0 exponentially (which throws).
export function env(param, t, peak, a, d) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(Math.max(peak, TINY), t + Math.max(a, 0.001));
  param.setTargetAtTime(0, t + Math.max(a, 0.001), Math.max(d, 0.004) / 5);
  return t + a + d;
}
// Sustained envelope: attack, hold, release.
export function envS(param, t, peak, a, hold, r) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(Math.max(peak, TINY), t + Math.max(a, 0.001));
  param.setValueAtTime(Math.max(peak, TINY), t + a + Math.max(hold, 0));
  param.setTargetAtTime(0, t + a + Math.max(hold, 0), Math.max(r, 0.01) / 5);
  return t + a + hold + r;
}

function gainNode(E, out, v = 1) { const g = E.ctx.createGain(); g.gain.value = v; g.connect(out); return g; }
function shapeEnv(g, t, o, dur) {
  if (o.hold != null) return envS(g.gain, t, o.peak ?? 0.3, o.a ?? 0.005, o.hold, o.r ?? 0.1);
  return env(g.gain, t, o.peak ?? 0.3, o.a ?? 0.004, o.d ?? dur ?? 0.2);
}

// One oscillator, optional pitch glide and filter.
export function tone(E, t, out, o) {
  const c = E.ctx, osc = c.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(F(o.f), t);
  if (o.f1) {
    const gl = o.glide ?? (o.d ?? 0.2);
    if (o.lin) osc.frequency.linearRampToValueAtTime(F(o.f1), t + gl);
    else osc.frequency.exponentialRampToValueAtTime(F(o.f1), t + gl);
  }
  if (o.detune) osc.detune.value = o.detune;
  if (o.vib) { // vibrato: [rate, cents]
    const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
    l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(t + (o.d ?? 0.2) + (o.hold ?? 0) + (o.r ?? 0) + 0.1);
  }
  let head = osc;
  if (o.ftype) {
    const f = c.createBiquadFilter(); f.type = o.ftype; f.frequency.value = F(o.ff || 2000); f.Q.value = o.q ?? 0.7;
    if (o.ff1) f.frequency.exponentialRampToValueAtTime(F(o.ff1), t + (o.fglide ?? o.d ?? 0.2));
    head.connect(f); head = f;
  }
  const g = gainNode(E, out, 0); head.connect(g);
  const end = shapeEnv(g, t, o);
  osc.start(t); osc.stop(end + 0.05);
  return end;
}

// Filtered noise from one of the shared buffers.
export function noise(E, t, out, o) {
  const c = E.ctx, s = c.createBufferSource();
  s.buffer = o.color === 'pink' ? E.pink : o.color === 'brown' ? E.brown : E.noise;
  s.loop = true;
  if (o.rate) s.playbackRate.value = o.rate;
  let head = s;
  if (o.ftype !== null) {
    const f = c.createBiquadFilter(); f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(F(o.f || 1000), t); f.Q.value = o.q ?? 1;
    if (o.f1) {
      const gl = o.glide ?? ((o.a ?? 0) + (o.d ?? 0.2) + (o.hold ?? 0));
      f.frequency.exponentialRampToValueAtTime(F(o.f1), t + gl);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(F(o.f2), t + gl + (o.glide2 ?? gl));
    }
    head.connect(f); head = f;
  }
  if (o.am) { // amplitude modulation: [rate, depth]
    const am = c.createGain(); am.gain.value = 1 - o.am[1] / 2;
    const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.am[0]; lg.gain.value = o.am[1] / 2;
    l.connect(lg); lg.connect(am.gain); head.connect(am); head = am;
    l.start(t); l.stop(t + (o.a ?? 0) + (o.d ?? 0.2) + (o.hold ?? 0) + (o.r ?? 0) + 0.1);
  }
  const g = gainNode(E, out, 0); head.connect(g);
  const end = shapeEnv(g, t, o);
  s.start(t, Math.random() * 1.5); s.stop(end + 0.05);
  return end;
}

// Two-operator FM: bells, glass, metal, celesta.
export function fm(E, t, out, o) {
  const c = E.ctx, f = F(o.f);
  const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain();
  car.type = o.type || 'sine'; mod.type = o.modType || 'sine';
  car.frequency.setValueAtTime(f, t); mod.frequency.setValueAtTime(f * (o.ratio ?? 2), t);
  if (o.f1) { car.frequency.exponentialRampToValueAtTime(F(o.f1), t + (o.glide ?? o.d ?? 0.3)); mod.frequency.exponentialRampToValueAtTime(F(o.f1) * (o.ratio ?? 2), t + (o.glide ?? o.d ?? 0.3)); }
  const i0 = (o.index ?? 2) * f, i1 = (o.index1 ?? 0.2) * f;
  mg.gain.setValueAtTime(i0, t);
  mg.gain.setTargetAtTime(i1, t + 0.002, (o.idecay ?? (o.d ?? 0.4) * 0.35));
  mod.connect(mg); mg.connect(car.frequency);
  const g = gainNode(E, out, 0); car.connect(g);
  const end = shapeEnv(g, t, o);
  car.start(t); mod.start(t); car.stop(end + 0.05); mod.stop(end + 0.05);
  return end;
}

// Inharmonic partials (anvils, armour, struck glass). ratios[i], amps[i].
export function partials(E, t, out, o) {
  const c = E.ctx, f = F(o.f), d = o.d ?? 0.6;
  const g = gainNode(E, out, 1);
  let end = t;
  const rs = o.ratios || [1, 2.76, 5.4, 8.93];
  for (let i = 0; i < rs.length; i++) {
    const fr = f * rs[i]; if (fr > 18000) continue;
    const osc = c.createOscillator(), og = c.createGain();
    osc.type = 'sine'; osc.frequency.value = fr * (1 + (Math.random() - 0.5) * (o.spread ?? 0.004));
    const amp = (o.amps ? o.amps[i] : 1 / (1 + i * 0.7)) * (o.peak ?? 0.2);
    const di = d * (o.decays ? o.decays[i] : 1 / (1 + i * 0.35));
    const e = env(og.gain, t, amp, o.a ?? 0.001, di);
    osc.connect(og); og.connect(g); osc.start(t); osc.stop(e + 0.05);
    end = Math.max(end, e);
  }
  return end;
}

// ---- plucked strings (Karplus-Strong, rendered once per pitch) ----------
export function ksBuffer(E, freq, dur = 2, bright = 0.5) {
  const key = 'ks:' + Math.round(freq * 4) + ':' + dur + ':' + bright;
  const b = E.cache.get(key);
  if (b) return b;
  if (!E.offline) { // bake later (bank.bakeStep), play a stand-in now
    if (!E.bakeQ) E.bakeQ = new Map();
    if (!E.bakeQ.has(key)) E.bakeQ.set(key, [0, () => ksMake(E, key, freq, dur, bright)]);
    return null;
  }
  return ksMake(E, key, freq, dur, bright);
}
function ksMake(E, key, freq, dur, bright) {
  let b;
  const sr = E.sr, N = Math.max(2, Math.round(sr / freq));
  const len = Math.floor(sr * dur);
  b = E.ctx.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  const rho = Math.pow(10, -3 / (dur * freq)); // -60 dB over dur
  // excitation: noise, low-passed by brightness
  let y = 0;
  for (let i = 0; i < N && i < len; i++) { y += (0.15 + bright * 0.85) * ((Math.random() * 2 - 1) - y); d[i] = y; }
  // remove DC from the excitation
  let m = 0; for (let i = 0; i < N; i++) m += d[i]; m /= N; for (let i = 0; i < N; i++) d[i] -= m;
  const s = 0.5 * (0.5 + bright * 0.5);
  for (let i = N; i < len; i++) d[i] = rho * (d[i - N] * (1 - s) + d[i - N - 1 > 0 ? i - N - 1 : 0] * s);
  // normalise
  let pk = 0; for (let i = 0; i < Math.min(len, N * 6); i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) for (let i = 0; i < len; i++) d[i] /= pk;
  for (let i = 0; i < 400 && i < len; i++) d[len - 1 - i] *= i / 400;
  b.ratio = N / (sr / freq); // playback-rate correction to the exact pitch
  B.cachePut(E, key, b);
  return b;
}

export function pluck(E, t, out, o) {
  const f = F(o.f);
  const b = ksBuffer(E, f, o.len ?? 2, o.bright ?? 0.5);
  if (!b) return tone(E, t, out, { type: 'triangle', f, a: 0.002, d: Math.min(o.d ?? o.len ?? 2, 1.2), peak: (o.peak ?? 0.3) * 0.7, ftype: 'lowpass', ff: f * (3 + (o.bright ?? 0.5) * 6), ff1: f * 1.5, fglide: 0.4 });
  const s = E.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = b.ratio * (o.bend ? 1 : 1);
  if (o.bend) s.playbackRate.setTargetAtTime(b.ratio * o.bend, t + 0.01, 0.08);
  const g = gainNode(E, out, 0);
  let head = s;
  if (o.lp) { const lp = E.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp; head.connect(lp); head = lp; }
  head.connect(g);
  const d = o.d ?? (o.len ?? 2);
  g.gain.setValueAtTime(o.peak ?? 0.3, t);
  if (o.d) g.gain.setTargetAtTime(0, t + o.d * 0.6, o.d * 0.1);
  s.start(t); s.stop(t + Math.min(d, b.duration) + 0.02);
  return t + Math.min(d, b.duration);
}

// ---- instruments --------------------------------------------------------
// Each takes (E, t, out, midi or midis, vel, extra) and returns the end time.

export const harp = (E, t, out, m, vel = 0.5, o = {}) =>
  pluck(E, t, out, { f: mtof(m), len: o.len ?? 2.2, bright: o.bright ?? 0.55, peak: vel * 0.32, d: o.d, lp: o.lp });

export function celesta(E, t, out, m, vel = 0.5, o = {}) {
  const b = B.celestaBuf(E, m, o.d ?? 1.3);
  if (b) return B.playBuf(E, t, out, b, vel);
  const f = mtof(m);
  fm(E, t, out, { f, ratio: 4, index: 1.4, index1: 0.05, idecay: 0.08, a: 0.002, d: o.d ?? 1.3, peak: vel * 0.16 });
  return tone(E, t, out, { f: f * 2, a: 0.002, d: (o.d ?? 1.3) * 0.5, peak: vel * 0.04 });
}

export function musicBox(E, t, out, m, vel = 0.5, o = {}) {
  const rate = o.detune ? Math.pow(2, o.detune / 1200) : 1;
  const b = B.musicBoxBuf(E, m, o.d ?? 1.6);
  if (b) return B.playBuf(E, t, out, b, vel, rate);
  const f = mtof(m) * rate;
  fm(E, t, out, { f, ratio: 5.19, index: 0.9, index1: 0.02, idecay: 0.05, a: 0.001, d: o.d ?? 1.6, peak: vel * 0.15 });
  return tone(E, t, out, { f, a: 0.001, d: o.d ?? 1.6, peak: vel * 0.09 });
}

export function bell(E, t, out, m, vel = 0.5, o = {}) {
  const b = B.bellBuf(E, m, o.d ?? 4);
  if (b) return B.playBuf(E, t, out, b, vel);
  const f = mtof(m);
  fm(E, t, out, { f, ratio: 1.4, index: 3.2, index1: 0.4, idecay: 0.6, a: 0.002, d: o.d ?? 4, peak: vel * 0.12 });
  return partials(E, t, out, { f: f * 0.5, ratios: [1, 2, 2.4, 3, 4.2], d: (o.d ?? 4) * 0.9, peak: vel * 0.05 });
}

export function glass(E, t, out, m, vel = 0.5, o = {}) {
  const b = B.glassBuf(E, m, o.d ?? 0.5);
  if (b) return B.playBuf(E, t, out, b, vel);
  return fm(E, t, out, { f: mtof(m), ratio: 3.01, index: 2.4, index1: 0.1, idecay: 0.03, a: 0.001, d: o.d ?? 0.5, peak: vel * 0.12 });
}

// Warm polysynth pad.
export function pad(E, t, out, ms, dur, vel = 0.5, o = {}) {
  {
    const a = o.a ?? Math.min(0.9, dur * 0.35), r = o.r ?? 1.2, br = o.bright ?? 1100, br1 = o.bright1 ?? br, type = o.type || 'sawtooth';
    const key = `pad:${ms.join(',')}:${q2(dur)}:${q2(a)}:${q2(r)}:${br}:${br1}:${type}:${o.q ?? 0.6}`;
    const b = B.voiceBuf(E, key, () => ({
      dur: dur + r, env: { a, hold: Math.max(0, dur - a), r, peak: 0.16 / Math.sqrt(ms.length) },
      oscs: ms.flatMap((m) => [{ wave: type === 'sawtooth' ? 'saw' : 'tri', f: mtof(m), cents: -7 + (Math.random() - 0.5) * 4 }, { wave: 'tri', f: mtof(m), cents: 6 + (Math.random() - 0.5) * 4 }]),
      filter: { type: 'lowpass', q: o.q ?? 0.6, pts: [[0, br], [dur, br1]] },
    }));
    if (b) return B.playBuf(E, t, out, b, vel);
  }
  const c = E.ctx, g = gainNode(E, out, 0);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q ?? 0.6;
  lp.frequency.setValueAtTime(o.bright ?? 1100, t);
  if (o.bright1) lp.frequency.linearRampToValueAtTime(o.bright1, t + dur);
  lp.connect(g);
  const a = o.a ?? Math.min(0.9, dur * 0.35), r = o.r ?? 1.2;
  const end = envS(g.gain, t, vel * 0.16 / Math.sqrt(ms.length), a, Math.max(0, dur - a), r);
  for (const m of ms) for (const [type, det] of [[o.type || 'sawtooth', -7], ['triangle', 6]]) {
    const osc = c.createOscillator(); osc.type = type; osc.frequency.value = mtof(m); osc.detune.value = det + (Math.random() - 0.5) * 4;
    osc.connect(lp); osc.start(t); osc.stop(end + 0.1);
  }
  return end;
}

// Formant choir: the chord's saws share one formant bank (formants do not
// depend on pitch), so a four-note choir costs eight oscillators and three filters.
const VOWELS = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1600, 2700], i: [300, 2100, 3000] };
export function choir(E, t, out, ms, dur, vel = 0.5, o = {}) {
  {
    const a = o.a ?? Math.min(1.2, dur * 0.4), r = o.r ?? 1.4, v = o.vowel || 'a', v2 = o.vowel2 || v;
    const key = `cho:${ms.join(',')}:${q2(dur)}:${q2(a)}:${q2(r)}:${v}${v2}:${o.vib ?? 9}:${o.vibRate ?? 4.6}`;
    const b = B.voiceBuf(E, key, () => ({
      dur: dur + r, env: { a, hold: Math.max(0, dur - a), r, peak: 0.3 / Math.sqrt(ms.length) },
      oscs: ms.flatMap((m) => [-9, 8].map((d) => ({ wave: 'saw', f: mtof(m), cents: d + (Math.random() - 0.5) * 6 }))),
      vib: [o.vibRate ?? 4.6, o.vib ?? 9],
      formants: { from: VOWELS[v], to: VOWELS[v2], q: [7, 9, 12], amp: [3.2, 1.76, 0.7] },
    }));
    if (b) return B.playBuf(E, t, out, b, vel);
  }
  const c = E.ctx, g = gainNode(E, out, 0);
  const sum = c.createGain(); sum.gain.value = 1;
  const v = VOWELS[o.vowel || 'a'], v2 = o.vowel2 ? VOWELS[o.vowel2] : null;
  const amps = [1, 0.55, 0.22], qs = [7, 9, 12];
  for (let k = 0; k < 3; k++) {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = qs[k];
    bp.frequency.setValueAtTime(v[k], t);
    if (v2) bp.frequency.linearRampToValueAtTime(v2[k], t + dur);
    const bg = c.createGain(); bg.gain.value = amps[k] * 3.2;
    sum.connect(bp); bp.connect(bg); bg.connect(g);
  }
  const a = o.a ?? Math.min(1.2, dur * 0.4), r = o.r ?? 1.4;
  const end = envS(g.gain, t, vel * 0.3 / Math.sqrt(ms.length), a, Math.max(0, dur - a), r);
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = o.vibRate ?? 4.6; lg.gain.value = o.vib ?? 9;
  lfo.connect(lg); lfo.start(t); lfo.stop(end + 0.1);
  for (const m of ms) for (const det of [-9, 8]) {
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = mtof(m); osc.detune.value = det + (Math.random() - 0.5) * 6;
    lg.connect(osc.detune); osc.connect(sum); osc.start(t); osc.stop(end + 0.1);
  }
  return end;
}

// Detuned strings; `fray` makes notes sag and waver (the Unwoven).
export function strings(E, t, out, ms, dur, vel = 0.5, o = {}) {
  {
    const a = o.a ?? Math.min(0.7, dur * 0.3), r = o.r ?? 0.9, fray = o.fray || 0, br = o.bright ?? 1900;
    // frayed strings get one of three drift variants per chord
    const key = `str:${ms.join(',')}:${q2(dur)}:${q2(a)}:${q2(r)}:${br}:${fray}:${o.vib ?? 7}:${o.trem ? o.trem.join('/') : ''}:${fray ? (Math.random() * 3) | 0 : 0}`;
    const b = B.voiceBuf(E, key, () => {
      const total = dur + r;
      return {
        dur: total, env: { a, hold: Math.max(0, dur - a), r, peak: 0.13 / Math.sqrt(ms.length) },
        oscs: ms.flatMap((m) => [-11, 10].map((det) => {
          const c0 = det + (Math.random() - 0.5) * 8 * (1 + fray * 3);
          const o2 = { wave: 'saw', f: mtof(m), cents: 0 };
          if (fray) { const k = 2 + ((Math.random() * 3) | 0), pts = [[0, c0]]; for (let i = 1; i <= k; i++) pts.push([(dur * i) / k, det + (Math.random() - 0.65) * 60 * fray]); pts.push([total, det - 90 * fray]); o2.drift = pts; }
          else o2.cents = c0;
          return o2;
        })),
        vib: dur > 0.4 ? [5.2, o.vib ?? 7] : null,
        trem: o.trem || null,
        filter: { type: 'lowpass', q: 0.8, pts: [[0, br]] },
      };
    });
    if (b) return B.playBuf(E, t, out, b, vel);
  }
  const c = E.ctx, g = gainNode(E, out, 0);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.bright ?? 1900; lp.Q.value = 0.8; lp.connect(g);
  const a = o.a ?? Math.min(0.7, dur * 0.3), r = o.r ?? 0.9;
  const end = envS(g.gain, t, vel * 0.13 / Math.sqrt(ms.length), a, Math.max(0, dur - a), r);
  let lg = null;
  if (dur > 0.4) { // short bowed notes need no vibrato (and skip two nodes)
    const lfo = c.createOscillator(); lg = c.createGain(); lfo.frequency.value = 5.2; lg.gain.value = o.vib ?? 7;
    lfo.connect(lg); lfo.start(t); lfo.stop(end + 0.1);
  }
  let trem = null;
  if (o.trem) { // tremolo bowing: [rate, depth]
    trem = c.createGain(); trem.gain.value = 1 - o.trem[1] / 2;
    const tl = c.createOscillator(), tg = c.createGain(); tl.type = 'square'; tl.frequency.value = o.trem[0]; tg.gain.value = o.trem[1] / 2;
    tl.connect(tg); tg.connect(trem.gain); tl.start(t); tl.stop(end + 0.1); trem.connect(lp);
  }
  const fray = o.fray || 0;
  for (const m of ms) for (const det of [-11, 10]) {
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = mtof(m);
    osc.detune.setValueAtTime(det + (Math.random() - 0.5) * 8 * (1 + fray * 3), t);
    if (fray) { // drift and sag
      const k = 2 + ((Math.random() * 3) | 0);
      for (let i = 1; i <= k; i++) osc.detune.linearRampToValueAtTime(det + (Math.random() - 0.65) * 60 * fray, t + (dur * i) / k);
      osc.detune.linearRampToValueAtTime(det - 90 * fray, end);
    }
    if (lg) lg.connect(osc.detune); osc.connect(trem || lp); osc.start(t); osc.stop(end + 0.1);
  }
  return end;
}

// Brass-like synth: saws through a filter that blooms open, with a pitch scoop.
export function brass(E, t, out, m, dur, vel = 0.5, o = {}) {
  {
    const ms = Array.isArray(m) ? m : [m], r = o.r ?? 0.18, pf = o.bright ?? 2600;
    const key = `brs:${ms.join(',')}:${q2(dur)}:${q2(r)}:${pf}`;
    const b = B.voiceBuf(E, key, () => ({
      dur: dur + r, env: { a: 0.025, hold: Math.max(0, dur - 0.025), r, peak: 0.16 },
      oscs: ms.flatMap((n) => [[-6, 'saw', 1, 1 / ms.length], [7, 'saw', 1, 1 / ms.length], [0, 'sqr', 0.5, 0.35]].map(([det, wave, mul, g]) => ({ wave, f: mtof(n) * mul, cents: det, gain: g, scoop: [-45, 0.06] }))),
      filter: { type: 'lowpass', q: 1.8, pts: [[0, 220], [0.08, pf], [0.12, pf], [0.45, pf * 0.6], [0.9, pf * 0.47], [9, pf * 0.45]] },
    }));
    if (b) return B.playBuf(E, t, out, b, vel);
  }
  const c = E.ctx, g = gainNode(E, out, 0);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.8;
  const peakF = o.bright ?? 2600;
  lp.frequency.setValueAtTime(220, t); lp.frequency.linearRampToValueAtTime(peakF, t + 0.06 + 0.04 * vel);
  lp.frequency.setTargetAtTime(peakF * 0.45, t + 0.12, 0.25);
  lp.connect(g);
  const end = envS(g.gain, t, vel * 0.16, 0.025, Math.max(0, dur - 0.025), o.r ?? 0.18);
  const ms = Array.isArray(m) ? m : [m];
  for (const n of ms) for (const det of [-6, 7, 0]) {
    const osc = c.createOscillator(); osc.type = det === 0 ? 'square' : 'sawtooth';
    osc.frequency.value = mtof(n) * (det === 0 ? 0.5 : 1);
    osc.detune.setValueAtTime(det - 45, t); osc.detune.linearRampToValueAtTime(det, t + 0.06);
    const og = c.createGain(); og.gain.value = det === 0 ? 0.35 : 1 / ms.length;
    osc.connect(og); og.connect(lp); osc.start(t); osc.stop(end + 0.1);
  }
  return end;
}

export function bass(E, t, out, m, dur, vel = 0.5, o = {}) {
  {
    const br = o.bright ?? 420, type = o.type || 'triangle';
    const key = `bas:${m}:${q2(dur)}:${br}:${o.q ?? 1.2}:${type}:${o.drive || 0}:${o.pluck ? 1 : 0}`;
    const b = B.voiceBuf(E, key, () => ({
      dur: o.pluck ? dur + 0.01 : dur + 0.07,
      env: o.pluck ? { a: 0.005, hold: 0, r: dur, peak: 0.32 } : { a: 0.012, hold: Math.max(0, dur - 0.05), r: 0.12, peak: 0.3 },
      oscs: [{ wave: type === 'sawtooth' ? 'saw' : type === 'sine' ? 'sin' : type === 'square' ? 'sqr' : 'tri', f: mtof(m) }, { wave: 'sin', f: mtof(m) * 0.5 }],
      filter: { type: 'lowpass', q: o.q ?? 1.2, pts: [[0, br]] },
      drive: o.drive || 0,
    }));
    if (b) return B.playBuf(E, t, out, b, vel);
  }
  const c = E.ctx, g = gainNode(E, out, 0);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.bright ?? 420; lp.Q.value = o.q ?? 1.2; lp.connect(g);
  let head = lp;
  if (o.drive) { const ws = c.createWaveShaper(); ws.curve = driveCurve(o.drive); lp.disconnect(); lp.connect(ws); ws.connect(g); head = ws; }
  const end = o.pluck ? env(g.gain, t, vel * 0.32, 0.005, dur) : envS(g.gain, t, vel * 0.3, 0.012, Math.max(0, dur - 0.05), 0.12);
  for (const [type, mul] of [[o.type || 'triangle', 1], ['sine', 0.5]]) {
    const osc = c.createOscillator(); osc.type = type; osc.frequency.value = mtof(m) * mul; osc.connect(lp); osc.start(t); osc.stop(end + 0.1);
  }
  return end;
}

export function drone(E, t, out, m, dur, vel = 0.5, o = {}) {
  const c = E.ctx, g = gainNode(E, out, 0);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.bright ?? 380; lp.connect(g);
  const end = envS(g.gain, t, vel * 0.2, o.a ?? 1.5, Math.max(0, dur - (o.a ?? 1.5)), o.r ?? 2);
  for (const [mul, det, type] of [[1, -5, 'sawtooth'], [1, 6, 'sawtooth'], [1.5, 0, 'triangle'], [0.5, 0, 'sine']]) {
    const osc = c.createOscillator(); osc.type = type; osc.frequency.value = mtof(m) * mul; osc.detune.value = det; osc.connect(lp); osc.start(t); osc.stop(end + 0.1);
  }
  return end;
}

// ---- percussion ---------------------------------------------------------
export function kick(E, t, out, vel = 0.7, o = {}) {
  const b = B.kickBuf(E, o.f ?? 150, o.f1 ?? 42, o.d ?? 0.38);
  if (b) return B.playBuf(E, t, out, b, vel);
  tone(E, t, out, { f: o.f ?? 150, f1: o.f1 ?? 42, glide: 0.11, a: 0.002, d: o.d ?? 0.38, peak: vel * 0.9 });
  return noise(E, t, out, { ftype: 'highpass', f: 3500, q: 0.7, a: 0.001, d: 0.012, peak: vel * 0.25 });
}
export function taiko(E, t, out, vel = 0.7, o = {}) {
  const f = o.f ?? 95;
  const b = B.taikoBuf(E, f, o.d ?? 0.6);
  if (b) return B.playBuf(E, t, out, b, vel);
  tone(E, t, out, { f: f * 1.5, f1: f, glide: 0.06, a: 0.002, d: o.d ?? 0.6, peak: vel * 0.8 });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 900, a: 0.002, d: 0.22, peak: vel * 0.7 });
  return noise(E, t, out, { ftype: 'bandpass', f: 320, q: 1.2, a: 0.001, d: 0.07, peak: vel * 0.35 });
}
export function tom(E, t, out, vel = 0.6, o = {}) {
  const f = o.f ?? 140;
  const b = B.tomBuf(E, f, o.d ?? 0.35);
  if (b) return B.playBuf(E, t, out, b, vel);
  tone(E, t, out, { f: f * 1.3, f1: f, glide: 0.05, a: 0.002, d: o.d ?? 0.35, peak: vel * 0.6 });
  return noise(E, t, out, { ftype: 'bandpass', f: f * 4, q: 1, a: 0.001, d: 0.06, peak: vel * 0.25 });
}
export function hat(E, t, out, vel = 0.3, o = {}) {
  const b = B.hatBuf(E, o.f ?? 7500, !!o.open);
  if (b) return B.playBuf(E, t, out, b, vel);
  return noise(E, t, out, { ftype: 'highpass', f: o.f ?? 7500, q: 0.8, a: 0.001, d: o.open ? 0.28 : 0.045, peak: vel * 0.32 });
}
export function shaker(E, t, out, vel = 0.3) {
  const b = B.shakerBuf(E);
  if (b) return B.playBuf(E, t, out, b, vel);
  return noise(E, t, out, { ftype: 'bandpass', f: 6500, q: 1.4, a: 0.012, d: 0.06, peak: vel * 0.3 });
}
export function snare(E, t, out, vel = 0.6, o = {}) {
  const b = B.snareBuf(E, o.f ?? 210, o.nf ?? 2200, o.d ?? 0.17);
  if (b) return B.playBuf(E, t, out, b, vel);
  tone(E, t, out, { type: 'triangle', f: o.f ?? 210, f1: 160, glide: 0.06, a: 0.001, d: 0.09, peak: vel * 0.35 });
  return noise(E, t, out, { ftype: 'bandpass', f: o.nf ?? 2200, q: 0.6, a: 0.001, d: o.d ?? 0.17, peak: vel * 0.55 });
}
export function rim(E, t, out, vel = 0.3, o = {}) {
  const b = B.rimBuf(E, o.f ?? 2600);
  if (b) return B.playBuf(E, t, out, b, vel);
  return noise(E, t, out, { ftype: 'bandpass', f: o.f ?? 2600, q: 5, a: 0.001, d: 0.025, peak: vel * 0.5 });
}
const ANVIL = [1, 2.02, 2.76, 3.97, 5.41, 6.83];
export function anvil(E, t, out, vel = 0.6, o = {}) {
  const f = o.f ?? 880;
  const b = B.anvilBuf(E, f, o.d ?? 0.9);
  if (b) return B.playBuf(E, t, out, b, vel);
  partials(E, t, out, { f, ratios: ANVIL, amps: [1, 0.7, 0.55, 0.4, 0.3, 0.2], d: o.d ?? 0.9, peak: vel * 0.13 });
  return noise(E, t, out, { ftype: 'highpass', f: 4200, a: 0.001, d: 0.02, peak: vel * 0.4 });
}
export function timpani(E, t, out, m, vel = 0.6, o = {}) {
  const f = mtof(m);
  tone(E, t, out, { f: f * 1.02, f1: f, glide: 0.08, a: 0.003, d: o.d ?? 1.2, peak: vel * 0.55 });
  tone(E, t, out, { f: f * 1.5, a: 0.003, d: 0.5, peak: vel * 0.15 });
  return noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 600, a: 0.002, d: 0.3, peak: vel * 0.4 });
}
export function heartbeat(E, t, out, vel = 0.6) {
  tone(E, t, out, { f: 70, f1: 42, glide: 0.08, a: 0.004, d: 0.22, peak: vel * 0.7 });
  return tone(E, t + 0.19, out, { f: 60, f1: 38, glide: 0.08, a: 0.004, d: 0.26, peak: vel * 0.5 });
}
export function drip(E, t, out, vel = 0.3, o = {}) {
  const f = o.f ?? 900 + Math.random() * 700;
  return tone(E, t, out, { f, f1: f * 2.2, glide: 0.05, a: 0.001, d: 0.09, peak: vel * 0.18 });
}
// Rising noise swell that cuts off sharply (a "reverse" hit).
export function swell(E, t, out, dur = 1, vel = 0.4, o = {}) {
  const c = E.ctx, s = c.createBufferSource(); s.buffer = o.color === 'brown' ? E.brown : E.pink; s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.5;
  f.frequency.setValueAtTime(o.f ?? 220, t); f.frequency.exponentialRampToValueAtTime(o.f1 ?? 5000, t + dur);
  const g = gainNode(E, out, 0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.5, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
  s.connect(f); f.connect(g); s.start(t, Math.random()); s.stop(t + dur + 0.06);
  return t + dur + 0.04;
}
// Cinematic low "braam": detuned saws, filter opening, light drive.
export function braam(E, t, out, m, dur = 1.6, vel = 0.6, o = {}) {
  const c = E.ctx, g = gainNode(E, out, 0);
  const ws = c.createWaveShaper(); ws.curve = driveCurve(2.5);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(140, t); lp.frequency.linearRampToValueAtTime(o.bright ?? 1300, t + 0.25); lp.frequency.setTargetAtTime(260, t + 0.3, dur * 0.3);
  lp.connect(ws); ws.connect(g);
  const end = envS(g.gain, t, vel * 0.3, 0.04, dur * 0.4, dur * 0.6);
  for (const [mul, det] of [[1, -12], [1, 11], [0.5, 0], [1.5, 4]]) {
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = mtof(m) * mul; osc.detune.value = det; osc.connect(lp); osc.start(t); osc.stop(end + 0.1);
  }
  return end;
}
