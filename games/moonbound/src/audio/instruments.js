// Moonbound audio: the instruments of the score. Each is a function (kit, dest, t, ...) that makes
// a small graph on the live context for one note (or, for the beds, for as long as the music
// plays). All of them are synthesised: bells and glass from decaying partials, music box and
// harp, pads and strings from detuned saws and triangles through low-pass filters, brass from
// saws with an opening filter, the choir from the looped vowel pads in bank.js, the drums from
// the buffers there.
import { mtof, clamp } from './dsp.js';
import { held } from './kit.js';
import { bp, hp } from './sfx.js';

const trace = (k, kind, t, midi, vel, dur) => {
  if (k.trace) k.trace.push({ kind, t, midi, vel, dur });
};

// ---- bells -----------------------------------------------------------------------------------------
// [ratio, amp, tau multiplier]; T seconds is the ring of the main partial at A3
const BELLS = {
  church: { T: 3.2, strike: 0.16, parts: [[0.5, 0.4, 1.0], [1, 1, 1], [1.183, 0.55, 0.8], [1.506, 0.3, 0.65], [2, 0.38, 0.5], [2.514, 0.2, 0.4], [3.011, 0.14, 0.33], [4.166, 0.08, 0.22]] },
  glass: { T: 2.8, strike: 0.07, parts: [[1, 1, 1], [2.32, 0.4, 0.5], [4.25, 0.22, 0.3], [6.63, 0.1, 0.2]] },
  hand: { T: 1.9, strike: 0.22, parts: [[1, 1, 1], [2, 0.55, 0.7], [2.4, 0.3, 0.5], [3, 0.3, 0.4], [4.2, 0.15, 0.25], [5.9, 0.08, 0.15]] },
  toll: { T: 5.5, strike: 0.3, parts: [[0.5, 0.55, 1.0], [1, 1, 1], [1.183, 0.6, 0.85], [1.506, 0.35, 0.7], [2, 0.4, 0.5], [2.514, 0.22, 0.4], [3.011, 0.15, 0.3], [4.166, 0.1, 0.2]] },
};

export function bell(k, dest, t, midi, vel = 0.8, o = {}) {
  const kind = BELLS[o.kind || 'church'];
  const f = mtof(midi);
  const T = kind.T * (o.ts ?? 1) * clamp(Math.pow(220 / f, 0.3), 0.55, 2.2);
  k.modal(dest, t, { f, parts: kind.parts, tauScale: T, g: 0.3 * vel * (o.g ?? 1), det: 2 });
  k.noise(dest, t, { filt: [bp(3800, 1.2)], a: 0.0008, tau: 0.005, g: kind.strike * vel * (o.g ?? 1) });
  trace(k, 'bell', t, midi, vel);
}

// a music box: a bright sine and a thin comb of overtones, a small click of the tine
export function musicBox(k, dest, t, midi, vel = 0.7, o = {}) {
  const f = mtof(midi);
  const T = 1.1 * clamp(Math.pow(440 / f, 0.4), 0.5, 1.6) * (o.ts ?? 1);
  k.modal(dest, t, { f, parts: [[1, 1, 1], [2, 0.28, 0.5], [4, 0.12, 0.25], [6.3, 0.06, 0.1]], tauScale: T, g: 0.26 * vel * (o.g ?? 1) });
  k.noise(dest, t, { filt: [hp(4500)], a: 0.0005, tau: 0.003, g: 0.05 * vel * (o.g ?? 1) });
  trace(k, 'box', t, midi, vel);
}

// a harp: a plucked string made once in JS (bank.pluck), played as a buffer
export function harp(k, bank, dest, t, midi, vel = 0.7, o = {}) {
  const a = bank.pluck(midi);
  const ctx = k.ctx;
  const src = ctx.createBufferSource();
  src.buffer = a.buf(ctx);
  if (o.det) src.detune.value = o.det;
  const g = ctx.createGain();
  g.gain.value = 0.55 * vel * (o.g ?? 1);
  src.connect(g);
  g.connect(dest);
  src.start(t);
  trace(k, 'harp', t, midi, vel);
}

// ---- sustained voices ---------------------------------------------------------------------------------
// A pad note: two detuned saws and a triangle through a low-pass that opens as the note swells.
//   o: { a attack, r release, g, lp cut-off, det cents, saw, tri, q }
export function pad(k, dest, t, midi, dur, o = {}) {
  const ctx = k.ctx;
  const f = mtof(midi);
  const a = o.a ?? 1.6;
  const r = o.r ?? 2.4;
  const lp = o.lp ?? 900;
  const det = o.det ?? 7;
  const saw = o.saw ?? 0.35;
  const tri = o.tri ?? 0.65;
  const env = ctx.createGain();
  env.gain.value = 0;
  held(env.gain, t, o.g ?? 0.1, a, dur, r);
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.Q.value = o.q ?? 0.6;
  flt.frequency.setValueAtTime(lp * 0.45, t);
  flt.frequency.setTargetAtTime(lp, t, a * 0.45);
  flt.frequency.setTargetAtTime(lp * 0.62, t + a + Math.max(0, dur - a) * 0.5, Math.max(1, dur) * 0.4);
  const stop = t + dur + r * 1.25;
  for (const [type, c, amp] of [['sawtooth', -det, saw * 0.5], ['sawtooth', det, saw * 0.5], ['triangle', 0, tri]]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    osc.detune.value = c;
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g);
    g.connect(flt);
    osc.start(t);
    osc.stop(stop);
  }
  flt.connect(env);
  env.connect(dest);
  trace(k, 'pad', t, midi, o.g ?? 0.1, dur);
}

// A bowed or plucked string: two detuned saws (and a sub-octave sine) through a low-pass that closes
// after the attack. Short and dry it is a spiccato ostinato; long, with vibrato, a legato line.
//   o: { a, r, g, lp, lp1, lpT, det, sub, vib: [Hz, cents] }
export function bowed(k, dest, t, midi, dur, o = {}) {
  const ctx = k.ctx;
  const f = mtof(midi);
  const a = o.a ?? 0.02;
  const r = o.r ?? 0.1;
  const env = ctx.createGain();
  env.gain.value = 0;
  held(env.gain, t, o.g ?? 0.2, a, dur, r);
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.Q.value = o.q ?? 0.9;
  flt.frequency.setValueAtTime(o.lp ?? 2200, t);
  flt.frequency.setTargetAtTime(o.lp1 ?? 900, t + a, o.lpT ?? 0.1);
  const stop = t + dur + r * 1.3 + 0.05;
  const det = o.det ?? 6;
  for (const c of [-det, det]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    osc.detune.value = c;
    if (o.vib) k.vibrato(osc.detune, t + (o.vibDelay ?? 0.15), dur + r, o.vib[0], o.vib[1]);
    const g = ctx.createGain();
    g.gain.value = 0.5;
    osc.connect(g);
    g.connect(flt);
    osc.start(t);
    osc.stop(stop);
  }
  if (o.sub) {
    const s = ctx.createOscillator();
    s.type = 'sine';
    s.frequency.value = f / 2;
    const g = ctx.createGain();
    g.gain.value = o.sub;
    s.connect(g);
    g.connect(flt);
    s.start(t);
    s.stop(stop);
  }
  flt.connect(env);
  env.connect(dest);
  trace(k, 'bowed', t, midi, o.g ?? 0.2, dur);
}

// Brass: three saws through a filter that blooms open as the note starts, a slight scoop up to pitch.
export function brass(k, dest, t, midi, dur, o = {}) {
  const ctx = k.ctx;
  const f = mtof(midi);
  const a = o.a ?? 0.05;
  const r = o.r ?? 0.18;
  const env = ctx.createGain();
  env.gain.value = 0;
  held(env.gain, t, o.g ?? 0.18, a, dur, r);
  const flt = ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.Q.value = 1.2;
  flt.frequency.setValueAtTime(o.lp0 ?? 350, t);
  flt.frequency.exponentialRampToValueAtTime(o.lp ?? 2600, t + a + 0.07);
  flt.frequency.setTargetAtTime(o.lp1 ?? 1500, t + a + 0.1, 0.25);
  const stop = t + dur + r * 1.3 + 0.05;
  for (const c of [-11, 0, 11]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 0.985, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    osc.detune.value = c;
    const g = ctx.createGain();
    g.gain.value = 0.34;
    osc.connect(g);
    g.connect(flt);
    osc.start(t);
    osc.stop(stop);
  }
  flt.connect(env);
  env.connect(dest);
  trace(k, 'brass', t, midi, o.g ?? 0.18, dur);
}

// A sub-bass note: a sine with a touch of its octave and a short pitch drop, for pulses and pedals.
export function sub(k, dest, t, midi, dur, o = {}) {
  const f = mtof(midi);
  const g = o.g ?? 0.5;
  const tau = o.tau ?? Math.max(0.1, dur * 0.35);
  k.tone(dest, t, { f: f * (o.drop ?? 1.4), f1: f, ft: 0.03, a: o.a ?? 0.006, tau, hold: Math.max(0, dur - tau * 3) * 0.25, g, drive: o.drive ?? 1.3, dur: dur + tau * 4 });
  k.tone(dest, t, { f: f * 2, a: o.a ?? 0.006, tau: tau * 0.6, g: g * 0.22, dur: dur + tau * 3 });
  trace(k, 'sub', t, midi, g, dur);
}

// ---- the choir --------------------------------------------------------------------------------------------
// A choir note: the looped vowel pad of bank.js on two sources, a little apart in pitch and in the
// stereo field (a section, not a single voice), swelling in over `a` and out over `r`.
//   o: { a, r, g, to: vowel to slide to half way, width }
// Returns false when the pad is not built yet (the note is skipped; it will be there next time).
export function choirNote(k, bank, dest, t, vowel, midi, dur, o = {}) {
  const asset = bank.choir(vowel, midi);
  if (!asset) return false;
  const ctx = k.ctx;
  const a = o.a ?? 1.4;
  const r = o.r ?? 2.2;
  const g = (o.g ?? 0.1) * 3; // the vowel pads are baked quietly
  const to = o.to ? bank.choir(o.to, midi) : null;
  const voices = [[asset, 0, dur, a, r, g]];
  if (to) {
    voices[0] = [asset, 0, dur * 0.65, a, r * 0.7, g];
    voices.push([to, dur * 0.3, dur * 0.7, dur * 0.4, r, g * 0.9]);
  }
  for (const [as, delay, d, aa, rr, gg] of voices) {
    const env = ctx.createGain();
    env.gain.value = 0;
    held(env.gain, t + delay, gg, aa, d, rr);
    env.connect(dest);
    const stop = t + delay + d + rr * 1.3;
    for (const side of [-1, 1]) {
      const src = ctx.createBufferSource();
      src.buffer = as.buf(ctx);
      src.loop = true;
      src.playbackRate.value = 1 + side * 0.0028;
      let n = src;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = side * (o.width ?? 0.55);
        src.connect(p);
        n = p;
      }
      n.connect(env);
      src.start(t + delay, Math.random() * 1.9);
      src.stop(stop);
    }
  }
  trace(k, 'choir', t, midi, g, dur);
  return true;
}

// ---- drums ----------------------------------------------------------------------------------------------------
export function drum(k, bank, dest, t, name, vel = 0.8, rate = 1) {
  const a = bank.drum(name);
  if (!a) return false;
  const ctx = k.ctx;
  const src = ctx.createBufferSource();
  src.buffer = a.buf(ctx);
  src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.03);
  const g = ctx.createGain();
  g.gain.value = vel;
  src.connect(g);
  g.connect(dest);
  src.start(t);
  trace(k, `drum:${name}`, t, 0, vel, 0);
  return true;
}

// ---- beds (they play for as long as the theme) ----------------------------------------------------------------
function lfo(ctx, param, t, f, depth, nodes) {
  const o = ctx.createOscillator();
  o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g);
  g.connect(param);
  o.start(t);
  nodes.push(o);
}

// A drone: for each note a sine and two detuned saws through a low-pass whose cut-off drifts slowly.
//   notes: [{ m: midi, g }], o: { lp, g, fade }
export function droneBed(k, dest, t, notes, o = {}) {
  const ctx = k.ctx;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime((o.g ?? 1) * 0.07, t, o.fade ?? 2.5);
  out.connect(dest);
  const nodes = [];
  for (const n of notes) {
    const f = mtof(n.m);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = o.lp ?? 220;
    flt.Q.value = 0.8;
    lfo(ctx, flt.frequency, t, 0.045 + k.rnd() * 0.07, (o.lp ?? 220) * 0.35, nodes);
    flt.connect(out);
    for (const c of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = c;
      const g = ctx.createGain();
      g.gain.value = n.g * 0.4 * (o.saw ?? 1);
      osc.connect(g);
      g.connect(flt);
      osc.start(t);
      nodes.push(osc);
    }
    const s = ctx.createOscillator();
    s.frequency.value = f;
    const sg = ctx.createGain();
    sg.gain.value = n.g * 0.6;
    s.connect(sg);
    sg.connect(out);
    s.start(t);
    nodes.push(s);
  }
  return {
    out,
    stop(tt) {
      out.gain.cancelScheduledValues(tt);
      out.gain.setTargetAtTime(0, tt, 0.8);
      for (const n of nodes) {
        try {
          n.stop(tt + 6);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

// Wind: two panned bands of air that wander, gusts that rise and fall, and (if asked) a thin whistle.
//   o: { f, g, whistle }
export function windBed(k, dest, t, o = {}) {
  const ctx = k.ctx;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(o.g ?? 0.5, t, 3);
  out.connect(dest);
  const nodes = [];
  const noise = (off) => {
    const s = ctx.createBufferSource();
    s.buffer = k.noiseBuf('pink');
    s.loop = true;
    s.start(t, off);
    nodes.push(s);
    return s;
  };
  for (const side of [-1, 1]) {
    const s = noise(k.rnd() * 2.5);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = (o.f ?? 480) * (1 + side * 0.08);
    f.Q.value = 1.1;
    lfo(ctx, f.frequency, t, 0.07 + (side > 0 ? 0.013 : 0), 200, nodes);
    lfo(ctx, f.frequency, t, 0.19 + side * 0.02, 80, nodes);
    const gust = ctx.createGain();
    gust.gain.value = 0.6;
    lfo(ctx, gust.gain, t, 0.09 + side * 0.012, 0.28, nodes);
    lfo(ctx, gust.gain, t, 0.23, 0.14, nodes);
    s.connect(f);
    f.connect(gust);
    let n = gust;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = side * 0.7;
      gust.connect(p);
      n = p;
    }
    n.connect(out);
  }
  if (o.whistle) {
    const s = noise(k.rnd() * 2.5);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1450;
    f.Q.value = 26;
    lfo(ctx, f.frequency, t, 0.05, 260, nodes);
    lfo(ctx, f.frequency, t, 0.13, 70, nodes);
    const g = ctx.createGain();
    g.gain.value = o.whistle * 0.5;
    lfo(ctx, g.gain, t, 0.037, o.whistle * 0.45, nodes);
    s.connect(f);
    f.connect(g);
    g.connect(out);
  }
  return {
    out,
    stop(tt) {
      out.gain.cancelScheduledValues(tt);
      out.gain.setTargetAtTime(0, tt, 0.8);
      for (const n of nodes) {
        try {
          n.stop(tt + 6);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

// A feedback echo: input -> delay (with a darkening loop) -> dest, `mix` of the repeats.
export function echo(ctx, input, dest, { time, fb = 0.35, lp = 3000, mix = 0.3 }) {
  const dl = ctx.createDelay(4);
  dl.delayTime.value = time;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const fbg = ctx.createGain();
  fbg.gain.value = fb;
  const wet = ctx.createGain();
  wet.gain.value = mix;
  input.connect(dl);
  dl.connect(f);
  f.connect(fbg);
  fbg.connect(dl);
  f.connect(wet);
  wet.connect(dest);
  return { dl, wet, fbg };
}
