// Pitched instruments for the music and the musical effects. Each note is
// rendered once, when first needed, into a mono buffer and cached: a felt
// piano, a kalimba, a nylon-string guitar (Karplus-Strong), a music box, a
// celesta, a harp, a soft marimba, a round felt bass and a soft swelling
// "boop". Notes are rendered at half the context rate (everything sits well
// under the master's top-end roll-off) and every note starts and ends at
// exactly zero.
import { mulberry32, secs, filter, white, noiseGrain, damped, rampIn, mix, finish } from './synth.js';

export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// a short burst of low-passed noise: a hammer, thumb or mallet touching
function touch(out, sr, rand, lenMs, cutoff, amp) {
  const t = new Float32Array(out.length);
  noiseGrain(t, 0, secs(sr, lenMs / 1000), secs(sr, 0.0006), amp, rand);
  filter(t, sr, 'lowpass', cutoff, 0.7);
  mix(out, t);
}

const RENDER = {
  // Felt piano: slightly stretched partials, soft felt taking the top off,
  // two strings a hair apart and the usual quick-then-slow decay.
  piano(f, sr, rand) {
    const out = new Float32Array(Math.floor(3.4 * sr));
    const B = 0.00035;
    const slow = 2.6 * Math.pow(262 / f, 0.45);
    for (let k = 1; k <= 10; k++) {
      const fk = k * f * Math.sqrt(1 + B * k * k);
      const a = 1 / Math.pow(k, 1.2) / (1 + Math.pow(fk / 1300, 2));
      const tau = slow / (1 + 0.5 * (k - 1));
      for (const cents of [-0.7, 0.7]) {
        const fd = fk * Math.pow(2, cents / 1200);
        damped(out, sr, 0, fd, a * 0.5 * 0.55, tau * 0.16);
        damped(out, sr, 0, fd, a * 0.5 * 0.45, tau);
      }
    }
    touch(out, sr, rand, 8, 650, 0.05);
    rampIn(out, 0, secs(sr, 0.004));
    return out;
  },

  // Kalimba: a strong fundamental, the tine's bright second mode (about
  // 6.3 times up) that dies at once, a thumb and a little box resonance.
  kalimba(f, sr, rand) {
    const out = new Float32Array(Math.floor(2.6 * sr));
    const tau = 1.3 * Math.pow(523 / f, 0.35);
    damped(out, sr, 0, f, 1, tau);
    damped(out, sr, 0, f * 2, 0.05, tau * 0.3);
    damped(out, sr, 0, f * 6.27, 0.1, 0.045);
    damped(out, sr, 0, 290, 0.04, 0.05);
    touch(out, sr, rand, 5, 1800, 0.06);
    rampIn(out, 0, secs(sr, 0.0015));
    return out;
  },

  // Nylon-string guitar: Karplus-Strong with an allpass for exact tuning,
  // a soft finger pluck part-way along the string and a warm body.
  guitar(f, sr, rand) {
    const n = Math.floor(2.8 * sr);
    const out = new Float32Array(n);
    const N = sr / f;
    const L = Math.floor(N - 0.6);
    const d = N - L - 0.5;
    const ap = (1 - d) / (1 + d);
    const t60 = 3.4 * Math.pow(110 / f, 0.3);
    const g = Math.min(0.9996, Math.pow(10, -3 / (f * t60)) / Math.cos((Math.PI * f) / sr));
    // a soft pluck: noise, low-passed by the fingertip, combed by where it is plucked
    const exc = white(L, rand);
    let lp = 0;
    for (let i = 0; i < L; i++) exc[i] = lp += 0.42 * (exc[i] - lp);
    const pos = Math.max(1, Math.round(L * 0.18));
    for (let i = L - 1; i >= pos; i--) exc[i] -= exc[i - pos];
    let apIn = 0;
    let apOut = 0;
    for (let i = 0; i < n; i++) {
      const a = i >= L ? out[i - L] : 0;
      const b = i >= L + 1 ? out[i - L - 1] : 0;
      const avg = 0.5 * (a + b);
      const y = ap * avg + apIn - ap * apOut;
      apIn = avg;
      apOut = y;
      out[i] = (i < L ? exc[i] : 0) + g * y;
    }
    const body = Float32Array.from(out);
    filter(body, sr, 'bandpass', 105, 2);
    const body2 = Float32Array.from(out);
    filter(body2, sr, 'bandpass', 215, 2);
    mix(out, body, 0.5);
    mix(out, body2, 0.25);
    filter(out, sr, 'lowpass', 3000, 0.6);
    rampIn(out, 0, secs(sr, 0.001));
    return out;
  },

  // Music box: a comb tooth's clear fundamental and its bright, quick
  // second mode, with the tiny tick of the pin.
  musicbox(f, sr, rand) {
    const out = new Float32Array(Math.floor(3 * sr));
    const tau = 2.2 * Math.pow(523 / f, 0.5);
    damped(out, sr, 0, f, 1, tau);
    damped(out, sr, 0, f * 2, 0.12, tau * 0.35);
    damped(out, sr, 0, f * 3, 0.03, tau * 0.2);
    damped(out, sr, 0, f * 5.95, 0.06, 0.05);
    touch(out, sr, rand, 1, 4000, 0.02);
    rampIn(out, 0, secs(sr, 0.001));
    return out;
  },

  // Celesta: rounder than the music box (the bar has a resonator under it).
  celesta(f, sr, rand) {
    const out = new Float32Array(Math.floor(2.6 * sr));
    const tau = 1.7 * Math.pow(523 / f, 0.5);
    damped(out, sr, 0, f, 1, tau);
    damped(out, sr, 0, f * 2, 0.1, tau * 0.3);
    damped(out, sr, 0, f * 4, 0.035, 0.18);
    damped(out, sr, 0, f * 5.4, 0.02, 0.05);
    touch(out, sr, rand, 2, 2500, 0.03);
    rampIn(out, 0, secs(sr, 0.0015));
    return out;
  },

  // Harp: a plucked string's harmonics (shaped by where it is plucked),
  // higher ones dying sooner.
  harp(f, sr, rand) {
    const out = new Float32Array(Math.floor(2.6 * sr));
    const tau = 1.9 * Math.pow(440 / f, 0.4);
    for (let k = 1; k <= 7; k++) {
      const a = Math.abs(Math.sin(Math.PI * k * 0.28)) / Math.pow(k, 1.8);
      damped(out, sr, 0, k * f * (1 + 0.0002 * k * k), a, tau / Math.pow(k, 0.7));
    }
    touch(out, sr, rand, 2, 3000, 0.03);
    rampIn(out, 0, secs(sr, 0.0025));
    return out;
  },

  // Soft marimba: a tuned bar (partials at 1, ~4 and ~10) with a warm tube
  // resonance and a felt mallet.
  marimba(f, sr, rand) {
    const out = new Float32Array(Math.floor(1.5 * sr));
    const tau = 0.5 * Math.pow(440 / f, 0.35);
    damped(out, sr, 0, f, 1, tau);
    damped(out, sr, 0, f * 1.001, 0.3, tau * 1.2);
    damped(out, sr, 0, f * 3.93, 0.1, 0.05);
    damped(out, sr, 0, f * 9.2, 0.02, 0.015);
    touch(out, sr, rand, 3, 1400, 0.05);
    rampIn(out, 0, secs(sr, 0.002));
    return out;
  },

  // Round felt bass: a soft attack and a few quiet harmonics.
  bass(f, sr) {
    const out = new Float32Array(Math.floor(2.4 * sr));
    for (const [k, a, tau] of [[1, 1, 1.3], [2, 0.3, 0.7], [3, 0.1, 0.4], [4, 0.04, 0.25]]) damped(out, sr, 0, f * k, a, tau);
    rampIn(out, 0, secs(sr, 0.014));
    return out;
  },

  // A soft swelling "boop": a sine that eases up to pitch, with a touch of
  // second harmonic, for buds.
  boop(f, sr) {
    const n = Math.floor(0.5 * sr);
    const out = new Float32Array(n);
    let ph = 0;
    const att = 0.03;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const fi = f * (0.93 + 0.07 * Math.min(1, t / 0.05));
      ph += (2 * Math.PI * fi) / sr;
      const e = (t < att ? 0.5 - 0.5 * Math.cos((Math.PI * t) / att) : 1) * Math.exp(-Math.max(0, t - att) / 0.1);
      out[i] = e * (Math.sin(ph) + 0.12 * Math.sin(2 * ph));
    }
    return out;
  },
};

export class Instruments {
  constructor(ctx) {
    this.ctx = ctx;
    this.sr = Math.max(22050, Math.round(ctx.sampleRate / 2));
    this.cache = new Map();
  }

  // The cached buffer for one note (midi number), rendered on first use.
  note(name, midi) {
    const key = name + midi;
    let b = this.cache.get(key);
    if (!b) {
      const render = RENDER[name] || RENDER.kalimba;
      const { sr, ch } = finish([render(midiHz(midi), this.sr, mulberry32(midi * 131 + name.length))], this.sr, 0, 40);
      b = this.ctx.createBuffer(1, ch[0].length, sr);
      b.copyToChannel(ch[0], 0);
      this.cache.set(key, b);
    }
    return b;
  }

  // Play a note into `dest` at time t. With `len`, it is damped from then
  // on (a piano key let go, a string touched).
  play(name, midi, t, dest, gain = 1, len = 0) {
    const ctx = this.ctx;
    const buf = this.note(name, midi);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    let end = t + buf.duration;
    if (len > 0 && t + len < end) {
      g.gain.setValueAtTime(gain, t + len);
      g.gain.setTargetAtTime(0, t + len, 0.12);
      end = Math.min(end, t + len + 0.9);
    }
    s.connect(g).connect(dest);
    s.onended = () => g.disconnect();
    s.start(t);
    s.stop(end);
    return s;
  }
}
