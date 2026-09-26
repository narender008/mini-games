// Friends' calls: short, soft, friendly animal sounds made from oscillators,
// filters and noise, never a voice. Each is a function (audio, time) that
// schedules its own nodes into the effects bus. A friend's module can name
// calls here by its id: happy (a hello, a tap), and the names its tricks use.
import { rand } from '../config.js';

// a pitch glide through points [[t, Hz], ...] with a vowel-ish formant and
// optional trill (tremolo), for chirps, whinnies and toots
export function glide(a, t0, points, { v = 0.12, type = 'triangle', formant = 1600, q = 1.2, trill = 0, trillDepth = 0.6, attack = 0.015, vibrato = 0, breath = 0 } = {}) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = type;
  const end = t0 + points[points.length - 1][0];
  o.frequency.setValueAtTime(points[0][1], t0);
  for (const [t, f] of points.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t0 + t);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lg = ctx.createGain();
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t0);
    lfo.stop(end + 0.1);
  }
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = formant;
  f.Q.value = q;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = formant * 2.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + attack);
  g.gain.setValueAtTime(v, end - Math.min(0.08, (end - t0) * 0.4));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
  let out = g;
  if (trill) {
    const am = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = trill;
    const depth = ctx.createGain();
    depth.gain.value = trillDepth * 0.5;
    am.gain.value = 1 - trillDepth * 0.5;
    lfo.connect(depth).connect(am.gain);
    lfo.start(t0);
    lfo.stop(end + 0.1);
    g.connect(am);
    out = am;
  }
  o.connect(f).connect(soft).connect(g);
  out.connect(a.sfx);
  o.start(t0);
  o.stop(end + 0.1);
  if (breath) {
    const n = ctx.createBufferSource();
    n.buffer = a.pink;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = formant * 1.3;
    nf.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(v * breath, t0 + attack * 2);
    ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
    n.connect(nf).connect(ng).connect(a.sfx);
    n.start(t0, Math.random());
    n.stop(end + 0.1);
  }
}

// a soft puff of air
export function puff(a, t, { v = 0.2, from = 900, to = 2400, dur = 0.5 } = {}) {
  const ctx = a.ctx;
  const n = ctx.createBufferSource();
  n.buffer = a.pink;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(a.sfx);
  n.start(t, Math.random());
  n.stop(t + dur + 0.05);
}

// wing beats: soft thumps of moving air
export function flaps(a, t, n = 5, rate = 0.16, v = 0.12) {
  for (let i = 0; i < n; i++) puff(a, t + i * rate, { v: v * (1 - i / (n + 2)), from: 300, to: 700, dur: 0.14 });
}

export const CALLS = {
  generic: {
    happy: (a, t) => {
      a.bell(1318.5, 0.05, t, 0.5);
      a.bell(1760, 0.05, t + 0.09, 0.6);
    },
  },
  // Draco: a cute rolling chirp, a sparkly puff, wing flaps
  dragon: {
    happy: (a, t) => {
      glide(a, t, [[0, 820], [0.12, 1250], [0.3, 980]], { v: 0.1, formant: 1500, trill: 34, trillDepth: 0.7, breath: 0.25 });
      glide(a, t + 0.36, [[0, 1100], [0.1, 1500], [0.22, 1350]], { v: 0.08, formant: 1800, trill: 30, trillDepth: 0.6 });
    },
    puff: (a, t) => {
      puff(a, t, { v: 0.16, from: 700, to: 2800, dur: 0.6 });
      for (let i = 0; i < 9; i++) a.bell(rand(1800, 3600), 0.03, t + 0.05 + i * 0.05, 0.6);
    },
    flap: (a, t) => {
      flaps(a, t, 8, 0.17, 0.1);
      glide(a, t + 0.4, [[0, 900], [0.15, 1400], [0.28, 1200]], { v: 0.08, formant: 1600, trill: 32 });
    },
  },
};
