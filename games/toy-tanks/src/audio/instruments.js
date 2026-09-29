// The toy-box band: tuned instruments rendered note by note into small buffers
// (audio.js caches them). Bars and bells are sums of damped sine partials
// (glockenspiel, marimba, kalimba, music box, celesta, tubular chime); strings
// are additive plucks (ukulele, harp) with the spectrum of a soft finger pluck
// and a little body resonance; there is a round bass, two shakers and a toy
// trumpet for the party fanfare. Everything is gentle: no partial above 7.5 kHz
// and the highest ones are softened.
import { TAU, clamp, mtof, seeded, secs, damped, grain, filt, mix, trim, normalise, fadeEnds } from './dsp.js';

// Additive instruments: partials [ratio, amplitude, decay time s], a mallet
// "tick" [amplitude, low-pass Hz, length s] and the buffer length.
const INST = {
  // a steel bar (free-free bar modes 1 : 2.76 : 5.40) struck with a plastic mallet
  glock: (f) => {
    const T = clamp(1.3 * (1000 / f) ** 0.4, 0.5, 1.6);
    return { partials: [[1, 1, T], [2.756, 0.26, T * 0.35], [5.404, 0.08, T * 0.12]], thump: [0.1, 6500, 0.0015], len: 2.2 };
  },
  // a rosewood bar over a tuned tube, soft yarn mallet: the second mode sits at four times the note
  marimba: (f) => ({ partials: [[1, 1, clamp(0.55 * (500 / f) ** 0.5, 0.2, 0.95)], [3.93, 0.17, 0.06], [9.2, 0.04, 0.02]], thump: [0.13, 1500, 0.006], len: 1.3 }),
  // a thumb-piano tine
  kalimba: (f) => ({ partials: [[1, 1, clamp(0.8 * (400 / f) ** 0.3, 0.3, 1.1)], [5.9, 0.09, 0.05], [2.01, 0.03, 0.25]], thump: [0.1, 800, 0.01], len: 1.7 }),
  // a music-box comb: two nearly unison tines beat gently
  musicbox: () => ({ partials: [[1, 1, 0.95], [1.0028, 0.4, 0.85], [6.27, 0.09, 0.06]], thump: [0.05, 4000, 0.002], len: 2.2 }),
  // steel plates over wooden resonators, a felt hammer
  celesta: (f) => ({ partials: [[1, 1, clamp(1.0 * (700 / f) ** 0.5, 0.4, 1.5)], [2.756, 0.07, 0.1], [5.404, 0.025, 0.035]], thump: [0.05, 2500, 0.002], len: 2.4 }),
  // a very short round marimba blip for the score tally
  pip: (f) => ({ partials: [[1, 1, 0.11], [3.93, 0.12, 0.03]], thump: [0.1, 2000, 0.004], len: 0.5 }),
  // a soft round bass: a plucked upright's low, woody note
  bass: () => ({ partials: [[1, 1, 0.55], [2, 0.32, 0.3], [3, 0.07, 0.12]], thump: [0.05, 300, 0.01], len: 1.3 }),
  // a tubular wind chime: free tube modes 1 : 2.76 : 5.40 with a slow beat from a slightly oval tube
  chime: (f) => {
    const T = clamp(1.9 * (800 / f) ** 0.4, 1.0, 2.6);
    return { partials: [[1, 1, T], [1.0009, 0.4, T * 0.95], [2.756, 0.32, T * 0.45], [5.404, 0.12, T * 0.18]], thump: [0.03, 5000, 0.001], len: 4.5 };
  },
};

// Plucked strings: decay time, where along the string it is plucked, how soft
// the finger is, the low-pass, and body resonances [Hz, Q, gain].
const STRINGS = {
  uke: (f) => ({ t60: clamp(1.4 * (262 / f) ** 0.3, 0.7, 1.6), pos: 0.2, soft: 0.5, len: 1.7, lp: 3800, body: [[240, 2, 0.3], [470, 2.5, 0.2]] }),
  harp: (f) => ({ t60: clamp(3.0 * (300 / f) ** 0.35, 1.2, 3.2), pos: 0.14, soft: 0.75, len: 3.0, lp: 4200, body: [[180, 2, 0.25], [360, 2, 0.15]] }),
};

// Sample rates for rendered notes: enough for each instrument's content.
export const NOTE_RATE = {
  glock: 24000, celesta: 24000, musicbox: 24000, chime: 24000, marimba: 20000, kalimba: 20000, pip: 20000, uke: 16000, harp: 16000,
  bass: 12000, shaker: 24000, jingle: 32000,
};
export const INSTRUMENTS = [...Object.keys(INST), ...Object.keys(STRINGS), 'shaker', 'jingle'];

// One note at midi pitch m, peak 1 (for the shakers, m = 0 a soft stroke and
// 1 an accent). Higher notes come out a little quieter, because ears are most
// sensitive up there.
export function renderNote(sr, inst, m) {
  const f = mtof(m);
  const r = seeded(Math.round(m) * 17 + inst.length * 131);
  let d;
  if (STRINGS[inst]) d = renderString(sr, f, STRINGS[inst](f), r);
  else if (inst === 'shaker') d = renderShaker(sr, m, r);
  else if (inst === 'jingle') d = renderJingle(sr, m, r);
  else d = renderAdditive(sr, f, (INST[inst] || INST.glock)(f), r);
  d = trim(d, 0.004);
  fadeEnds(d, 8, 32);
  return normalise([d], inst !== 'shaker' && inst !== 'jingle' && f > 1000 ? (1000 / f) ** 0.35 : 1)[0];
}

function renderAdditive(sr, f, { partials, thump, len }, r) {
  const n = secs(sr, len);
  const d = new Float32Array(n);
  for (const [ratio, amp, tau] of partials) {
    const fr = f * ratio;
    if (fr > 7500) continue;
    damped(d, sr, 0, fr, amp * (fr > 3500 ? 1 - (0.7 * (fr - 3500)) / 4000 : 1), tau);
  }
  if (thump) addTick(d, sr, thump, r);
  return d;
}

function addTick(d, sr, [amp, cut, dec], r) {
  const g = new Float32Array(Math.min(d.length, secs(sr, dec * 6 + 0.004)));
  grain(g, 0, secs(sr, dec), secs(sr, 0.0004), 1, r);
  filt(g, sr, 'lowpass', cut, 0.7);
  normalise([g], amp);
  mix(d, g);
}

function renderString(sr, f, { t60, pos, soft, len, lp, body }, r) {
  const n = secs(sr, len);
  const d = new Float32Array(n);
  const top = Math.min(sr * 0.45, 7000);
  for (let k = 1; k * f < top && k <= 30; k++) {
    // a finger pluck at `pos` along the string leaves harmonic k with sin(k pi pos)/k^(1+soft); the highs die first
    const fk = k * f * Math.sqrt(1 + 0.00012 * k * k);
    const a = Math.abs(Math.sin(k * Math.PI * pos)) / k ** (0.9 + soft);
    if (a < 0.002) continue;
    damped(d, sr, 0, fk, a, t60 / 6.9 / (1 + 0.55 * (k - 1)));
  }
  // the wooden body: two soft resonances that ring a little with the string
  const head = d.slice(0, Math.min(n, secs(sr, 0.6)));
  for (const [fc, q, g] of body) {
    const b = filt(head.slice(), sr, 'bandpass', fc, q);
    mix(d, b, g);
  }
  addTick(d, sr, [0.12, 2600, 0.006], r);
  return filt(d, sr, 'lowpass', lp, 0.6);
}

// A shaker: a burst of band-passed noise; an accent is louder and brighter.
function renderShaker(sr, accent, r) {
  const len = secs(sr, accent ? 0.11 : 0.07);
  const d = new Float32Array(len);
  grain(d, 0, len, secs(sr, accent ? 0.012 : 0.008), 1, r);
  filt(d, sr, 'bandpass', accent ? 6800 : 6000, 0.9);
  return d;
}

// Sleigh bells: a scatter of tiny inharmonic bells over a shimmer of noise.
function renderJingle(sr, accent, r) {
  const n = secs(sr, 0.4);
  const d = new Float32Array(n);
  for (const [f, a, tau] of [[3300, 0.6, 0.09], [4150, 0.5, 0.07], [5250, 0.4, 0.06], [6350, 0.3, 0.05], [7700, 0.2, 0.04]]) {
    damped(d, sr, secs(sr, r() * 0.004), f * (0.98 + r() * 0.04), a * (accent ? 1 : 0.7), tau * (0.8 + r() * 0.4));
  }
  const g = new Float32Array(n);
  grain(g, 0, secs(sr, 0.12), secs(sr, 0.002), 1, r);
  filt(g, sr, 'bandpass', 6500, 1.2);
  normalise([g], 0.3);
  mix(d, g);
  return d;
}

// A toy trumpet note written straight into `out` at sample `at`: a soft brassy
// buzz (harmonics that brighten as the note opens, a slow vibrato that arrives
// late), never loud, with a little breath at the start. `dur` is the held time.
export function trumpetInto(out, sr, at, f, dur, amp = 1) {
  const total = secs(sr, dur + 0.08);
  const att = secs(sr, 0.03);
  const rel = secs(sr, 0.08);
  const hold = secs(sr, dur);
  const H = Math.min(9, Math.floor((sr * 0.45) / f));
  let ph = 0;
  for (let i = 0; i < total; i++) {
    const j = at + i;
    if (j >= out.length) break;
    const t = i / sr;
    const vib = 1 + 0.006 * Math.sin(TAU * 5.4 * t) * clamp((t - 0.12) / 0.2, 0, 1);
    ph += (TAU * f * vib) / sr;
    // the horn opens: brightness climbs from 0.4 to 0.68 within 60 ms; harmonic k is scaled by b^(k-1)
    const b = 0.68 - 0.28 * Math.exp(-t / 0.03);
    const s1 = Math.sin(ph);
    const c1 = Math.cos(ph);
    let sPrev = 0;
    let s = s1;
    let g = 1;
    let v = 0;
    for (let k = 1; k <= H; k++) {
      v += (s * g) / k ** 0.7;
      const sNext = 2 * c1 * s - sPrev;
      sPrev = s;
      s = sNext;
      g *= b;
    }
    let e = i < att ? 0.5 - 0.5 * Math.cos((Math.PI * i) / att) : 1;
    if (i > hold) e *= Math.max(0, 1 - (i - hold) / rel);
    if (i >= hold) e *= 0.9;
    out[j] += amp * e * v * 0.5;
  }
}
