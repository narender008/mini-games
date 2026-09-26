// Splash Ride's music: a gentle tune for each place, composed as it plays,
// and the instruments it (and the tuned effects) are played on.
//
//  - lagoon: steel pan (or marimba) over a ukulele strum, a round bass and a
//    light shaker, G major, relaxed at 92 bpm;
//  - lake: a fingerpicked nylon guitar and a warm pad, D major, 76 bpm;
//  - canal: an accordion waltz in 3/4 with a mandolin "pah-pah" and a bass
//    "oom", F major, 100 bpm;
//  - bay: a music-box lullaby over a rocking celesta and a warm pad, C major,
//    64 bpm, in 3/4.
//
// A step sequencer composes each eight-bar pass as it goes: the place's
// accompaniment under a major-pentatonic tune built from a two-bar motif
// that is kept or reshaped from pass to pass, so it is familiar without
// repeating exactly; every fourth pass the tune rests for half the loop.
//
// Instruments are rendered note by note into small buffers the first time a
// note is needed (audio.js caches them): additive tuned bars and bells
// (marimba, celesta, music box, steel pan, chimes, bells), plucked strings
// by Karplus-Strong (guitar, ukulele, a double-course mandolin), a two-reed
// accordion, a sand shaker and a round bass. The pad is live oscillators.
import { TAU, clamp, rand, pick } from './config.js';
import { mtof, seeded, lp1, hp1, normalise, trim, fadeTail, filt, grain, secs, mix } from './ambience.js';

// ------------------------------------------------------------ keys and scales

// Each place's key (tonic, as a midi note), shared with the tuned effects.
export const KEYS = { lagoon: 55, lake: 50, canal: 53, bay: 48 };
export const PENTA = [0, 2, 4, 7, 9];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
// the i-th note up the major pentatonic scale from `base` (a midi note)
export const penta = (base, i) => base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];
// the triad on scale degree d (0 = I), in semitones above the tonic
const triad = (d) => [0, 2, 4].map((k) => MAJOR[(d + k) % 7] + (d + k >= 7 ? 12 : 0));

// ------------------------------------------------------------ instruments

// Additive instruments: partials [ratio, amplitude, decay s, attack s], the
// attack, and a mallet "thump" [amplitude, low-pass, decay].
const INST = {
  // a rosewood bar over a tuned tube and a soft yarn mallet
  marimba: (f) => ({ partials: [[1, 1, clamp(0.5 * (500 / f) ** 0.5, 0.18, 0.9)], [3.93, 0.18, 0.06], [9.2, 0.045, 0.02]], attack: 0.0015, thump: [0.12, 1400, 0.006], len: 1.3 }),
  // a thumb piano tine
  kalimba: (f) => ({ partials: [[1, 1, clamp(0.75 * (400 / f) ** 0.3, 0.3, 1.1)], [5.9, 0.1, 0.05], [2.01, 0.03, 0.25]], attack: 0.002, thump: [0.1, 700, 0.01], len: 1.7 }),
  // a music-box comb: two nearly unison tines beat gently; the steel
  // cantilever's second mode sits at 6.27 times the first
  musicbox: () => ({ partials: [[1, 1, 0.9], [1.0028, 0.4, 0.8], [6.27, 0.09, 0.06]], attack: 0.001, thump: [0.05, 4000, 0.002], len: 2.0 }),
  // steel plates over wooden resonators, a felt hammer
  celesta: (f) => ({ partials: [[1, 1, clamp(0.9 * (700 / f) ** 0.5, 0.35, 1.4)], [2.756, 0.07, 0.1], [5.404, 0.025, 0.035]], attack: 0.0015, thump: [0.05, 2500, 0.002], len: 2.4 }),
  // A steel pan note: the pan is hammered so its note area rings with
  // harmonic partials (the note, its octave and twelfth). The octave blooms
  // a moment after the strike as energy passes between the modes, and the
  // close pairs give the pan its shimmer. A rubber-tipped stick.
  steelpan: (f) => {
    const T = clamp(1.0 * (440 / f) ** 0.4, 0.45, 1.5);
    return { partials: [[1, 1, T], [1.0025, 0.3, T * 0.9], [2, 0.5, T * 0.6, 0.012], [2.004, 0.15, T * 0.5, 0.014], [3, 0.2, T * 0.35, 0.006], [4, 0.06, T * 0.2]], attack: 0.003, thump: [0.1, 1100, 0.004], len: 2.2 };
  },
  // a small soft chime for sparkles
  bell: () => ({ partials: [[1, 1, 0.45], [2.76, 0.22, 0.09], [5.4, 0.05, 0.03]], attack: 0.001, len: 1.2 }),
  // a round, soft bass
  bass: () => ({ partials: [[1, 1, 0.55], [2, 0.35, 0.3], [3, 0.08, 0.12]], attack: 0.01, thump: [0.06, 300, 0.01], len: 1.3 }),
  // A brass hand bell (the buoy's bell and the sailboat's ship's bell): the
  // note, the twelfth, and inharmonic modes, each split into a close pair
  // that beats slowly.
  handbell: (f) => {
    const T = clamp(1.25 * (600 / f) ** 0.5, 0.6, 2.0);
    return { partials: [[1, 1, T], [1.0019, 0.45, T * 0.9], [3.0, 0.4, T * 0.45], [3.006, 0.2, T * 0.4], [4.07, 0.06, T * 0.2], [5.43, 0.15, T * 0.18], [8.36, 0.05, T * 0.08]], attack: 0.0008, thump: [0.08, 5000, 0.0012], len: 4 };
  },
  // A glass bell: almost pure, soft quick upper modes, a slow beat.
  glassbell: (f) => {
    const T = clamp(1.4 * (880 / f) ** 0.4, 0.8, 2.2);
    return { partials: [[1, 1, T], [1.0011, 0.35, T], [2.61, 0.13, T * 0.35], [4.62, 0.04, T * 0.12]], attack: 0.0015, thump: [0.04, 7000, 0.0008], len: 4.5 };
  },
  // A tubular chime (the lanterns' wind chime): a free tube's modes at
  // 1 : 2.76 : 5.40, with a slow beat from a slightly oval tube.
  chime: (f) => {
    const T = clamp(1.8 * (800 / f) ** 0.4, 1.0, 2.6);
    return { partials: [[1, 1, T], [1.0009, 0.4, T * 0.95], [2.756, 0.4, T * 0.5], [5.404, 0.18, T * 0.2]], attack: 0.001, thump: [0.04, 5000, 0.001], len: 5 };
  },
};

// Plucked strings: decay time, where along the string it is plucked, how
// soft the finger or pick is, the low-pass, body resonances [Hz, Q, gain]
// and (for a mandolin's pairs) the detune of the two strings in cents.
const STRINGS = {
  guitar: (f) => ({ t60: clamp(3.2 * (110 / f) ** 0.3, 1.2, 3.4), pos: 0.18, soft: 0.62, len: 2.8, lp: 3000, body: [[105, 2, 0.5], [215, 2, 0.25]] }),
  uke: (f) => ({ t60: clamp(1.4 * (262 / f) ** 0.3, 0.7, 1.6), pos: 0.2, soft: 0.5, len: 1.7, lp: 3800, body: [[240, 2, 0.3], [470, 2.5, 0.2]] }),
  mandolin: (f) => ({ t60: clamp(1.1 * (392 / f) ** 0.3, 0.6, 1.3), pos: 0.13, soft: 0.38, len: 1.5, lp: 4000, body: [[330, 2.5, 0.25], [680, 3, 0.15]], detune: 3 }),
};

// Sample rates for rendered notes: enough for each instrument's content.
export const NOTE_RATE = { bass: 12000, shaker: 24000 };

// One note at midi pitch m (for the shaker, m = 0 a soft stroke, 1 an
// accent). Partials above 7 kHz are left out and those above 3.5 kHz
// softened; higher notes are a little quieter because ears are most
// sensitive up there.
export function renderNote(sr, inst, m) {
  const f = mtof(m);
  let d;
  if (STRINGS[inst]) d = renderString(sr, f, STRINGS[inst](f), seeded(m * 17 + inst.length));
  else if (inst === 'accordion') d = renderReed(sr, f);
  else if (inst === 'shaker') d = renderShaker(sr, m);
  else d = renderAdditive(sr, f, (INST[inst] || INST.bell)(f), seeded(m * 31 + inst.length));
  d = trim(d, 0.002);
  return normalise([d], inst !== 'shaker' && f > 1000 ? (1000 / f) ** 0.35 : 1)[0];
}

function renderAdditive(sr, f, { partials, attack, thump, len }, r) {
  const n = Math.ceil(len * sr);
  const d = new Float32Array(n);
  for (const [ratio, amp, tau, att = 0] of partials) {
    const fr = f * ratio;
    if (fr > 7000 || fr > sr * 0.45) continue;
    const a0 = amp * (fr > 3500 ? 1 - (0.7 * (fr - 3500)) / 3500 : 1);
    const w = (TAU * fr) / sr;
    const c = 2 * Math.cos(w);
    const k = Math.exp(-1 / (tau * sr));
    const end = Math.min(n, Math.ceil(tau * sr * 7));
    const na = Math.round(att * sr);
    // a sine by recurrence, from phase 0
    let s1 = Math.sin(-w);
    let s2 = Math.sin(-2 * w);
    let e = a0;
    for (let i = 0; i < end; i++) {
      const s = c * s1 - s2;
      s2 = s1;
      s1 = s;
      d[i] += s * e * (i < na ? 0.5 - 0.5 * Math.cos((Math.PI * i) / na) : 1);
      e *= k;
    }
  }
  if (thump) {
    const [amp, fc, tau] = thump;
    const m = Math.min(n, Math.ceil(tau * 8 * sr));
    const c = new Float32Array(m);
    for (let i = 0; i < m; i++) c[i] = (r() * 2 - 1) * Math.exp(-i / (tau * sr));
    lp1(c, sr, fc);
    lp1(c, sr, fc);
    normalise([c], amp);
    for (let i = 0; i < m; i++) d[i] += c[i];
  }
  const na = Math.max(2, Math.round(attack * sr));
  for (let i = 0; i < na && i < n; i++) d[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / na);
  fadeTail(d, 0.3);
  return d;
}

// A plucked string (Karplus-Strong): one period of softened noise, combed
// by the pluck position, circulates in a delay line whose averaging takes
// the highs first, with an all-pass for exact tuning.
function pluck(out, sr, f, { t60, pos, soft }, amp, r) {
  const D = sr / f;
  const N = Math.max(2, Math.floor(D - 0.6));
  const frac = D - 0.5 - N;
  const C = (1 - frac) / (1 + frac);
  const rho = 10 ** (-3 / (f * t60));
  const line = new Float32Array(N);
  let lv = 0;
  let lv2 = 0;
  for (let i = 0; i < N; i++) {
    lv = soft * lv + (1 - soft) * (r() * 2 - 1);
    lv2 = soft * lv2 + (1 - soft) * lv;
    line[i] = lv2;
  }
  const off = Math.max(1, Math.round(N * pos));
  const ex = line.slice();
  for (let i = 0; i < N; i++) line[i] = ex[i] - ex[(i + off) % N];
  let idx = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < out.length; i++) {
    const x = line[idx];
    const avg = 0.5 * (x + prev) * rho;
    prev = x;
    const ap = C * avg + apIn - C * apOut;
    apIn = avg;
    apOut = ap;
    line[idx] = ap;
    out[i] += x * amp;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
}

function renderString(sr, f, spec, r) {
  const n = Math.ceil(spec.len * sr);
  const d = new Float32Array(n);
  if (spec.detune) for (const c of [-spec.detune, spec.detune]) pluck(d, sr, f * 2 ** (c / 1200), spec, 0.5, r);
  else pluck(d, sr, f, spec, 1, r);
  const dry = Float32Array.from(d);
  for (const [bf, q, g] of spec.body) {
    const b = Float32Array.from(dry);
    filt(b, sr, 'bandpass', bf, q);
    mix(d, b, g);
  }
  lp1(d, sr, spec.lp);
  lp1(d, sr, spec.lp * 1.5);
  hp1(d, sr, 50);
  const na = Math.round(0.002 * sr);
  for (let i = 0; i < na; i++) d[i] *= i / na;
  fadeTail(d, 0.3);
  return d;
}

// An accordion note: two free reeds, the second a hair sharp so the pair
// beats slowly (a gentle, not a wobbly, musette), each a bright harmonic
// series softened for a quiet bellows; a gentle swell of air as it starts.
// Rendered long; a note is released by its player.
function renderReed(sr, f) {
  const len = 3.2;
  const n = Math.ceil(len * sr);
  const out = new Float32Array(n);
  const top = Math.min(5000, sr * 0.45);
  for (const [fr, a] of [[f, 1], [f + 0.9 * (f / 440) ** 0.5, 0.7]]) {
    for (let k = 1; k <= 16; k++) {
      const fk = fr * k;
      if (fk > top) break;
      const amp = (a * k ** -0.9 * (k % 2 ? 1 : 0.75)) / (1 + (fk / 1600) ** 2);
      const w = (TAU * fk) / sr;
      const c = 2 * Math.cos(w);
      let s1 = Math.sin(-w + k);
      let s2 = Math.sin(-2 * w + k);
      for (let i = 0; i < n; i++) {
        const s = c * s1 - s2;
        s2 = s1;
        s1 = s;
        out[i] += amp * s;
      }
    }
  }
  const na = Math.round(0.045 * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] *= (i < na ? 0.5 - 0.5 * Math.cos((Math.PI * i) / na) : 1) * (1 + 0.04 * Math.sin(TAU * 0.6 * t));
  }
  lp1(out, sr, 3200);
  fadeTail(out, 0.12);
  return out;
}

// A shaker: a cloud of seeds hitting the shell, a soft stroke or an accent.
function renderShaker(sr, accent) {
  const r = seeded(77 + accent);
  const n = Math.ceil(0.14 * sr);
  const out = new Float32Array(n);
  const spanS = accent ? 0.07 : 0.05;
  for (let k = 0; k < (accent ? 140 : 90); k++) {
    const u = r() ** 1.5 * spanS;
    grain(out, Math.floor((0.003 + u) * sr), secs(sr, 0.0003 + 0.0008 * r()), 1, (0.2 + 0.8 * r() ** 2) * (1 - u / 0.09), r);
  }
  filt(out, sr, 'bandpass', 5200, 1.0);
  filt(out, sr, 'highpass', 2500, 0.7);
  return out;
}

// ------------------------------------------------------------ the tunes

// Melody rhythms, one bar each, as [step, length] in eighth notes.
const R4 = [
  [[0, 2], [2, 2], [4, 4]],
  [[0, 3], [3, 1], [4, 4]],
  [[0, 2], [2, 1], [3, 1], [4, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2]],
  [[0, 4], [4, 2], [6, 2]],
  [[0, 3], [3, 3], [6, 2]],
  [[0, 2], [3, 3], [6, 2]],
];
const R4_SPARSE = [
  [[0, 4], [4, 4]],
  [[0, 2], [2, 2], [4, 4]],
  [[0, 6], [6, 2]],
  [[0, 3], [3, 1], [4, 4]],
  [[2, 2], [4, 4]],
];
const R3 = [
  [[0, 4], [4, 2]],
  [[0, 2], [2, 2], [4, 2]],
  [[0, 3], [3, 1], [4, 2]],
  [[0, 2], [2, 4]],
  [[0, 6]],
];
const R3_LULL = [
  [[0, 4], [4, 2]],
  [[0, 3], [3, 1], [4, 2]],
  [[0, 6]],
  [[0, 2], [2, 4]],
];
// melodic steps along the pentatonic scale: mostly small, sometimes a leap
const STEPS = [-2, -1, -1, 0, 1, 1, 2];

// Per place: tempo and metre, key, two chord progressions (scale degrees,
// one chord per bar), the lead(s) and the accompaniment. Patterns are
// [step, chord tone (0 root, 1 third, 2 fifth), octave, velocity]; a strum
// is [step, velocity, upstroke]; a shaker stroke is [step, velocity, accent].
const STYLES = {
  lagoon: {
    bpm: 92,
    beats: 4,
    tonic: 55,
    level: 1.05,
    prog: [0, 4, 5, 3, 0, 3, 4, 0],
    alt: [0, 3, 0, 4, 5, 3, 1, 4],
    leads: ['steelpan', 'marimba'],
    leadBase: 67,
    leadVel: 0.42,
    rhythms: R4,
    end: [[0, 2], [2, 2], [4, 4]],
    strum: { inst: 'uke', base: 64, size: 4, spread: 0.014, pat: [[2, 0.11, 0], [3, 0.07, 1], [6, 0.11, 0], [7, 0.07, 1]] },
    bass: { inst: 'bass', base: 43, pat: [[0, 0, 0, 0.42], [3, 2, -1, 0.2], [4, 0, 0, 0.3], [6, 2, -1, 0.2]] },
    shaker: [[0, 0.24, 0], [1, 0.14, 1], [2, 0.2, 0], [3, 0.16, 1], [4, 0.24, 0], [5, 0.14, 1], [6, 0.2, 0], [7, 0.18, 1]],
  },
  lake: {
    bpm: 76,
    beats: 4,
    tonic: 50,
    level: 1.45,
    prog: [0, 3, 5, 4, 0, 3, 1, 4],
    alt: [0, 5, 3, 4, 3, 0, 4, 0],
    leads: ['guitar'],
    leadBase: 74,
    leadVel: 0.3,
    rhythms: R4_SPARSE,
    end: [[0, 8]],
    arp: { inst: 'guitar', base: 52, pat: [[0, 0, -1, 0.3], [1, 1, 1, 0.1], [2, 2, 0, 0.15], [3, 0, 1, 0.1], [4, 2, -1, 0.22], [5, 1, 1, 0.1], [6, 2, 0, 0.13], [7, 0, 1, 0.09]] },
    pad: { base: 62, vel: 0.05 },
  },
  canal: {
    bpm: 100,
    beats: 3,
    tonic: 53,
    level: 1.35,
    prog: [0, 4, 4, 0, 0, 3, 4, 0],
    alt: [0, 3, 0, 4, 5, 1, 4, 0],
    leads: ['accordion'],
    leadBase: 65,
    leadVel: 0.2,
    legato: true,
    rhythms: R3,
    end: [[0, 6]],
    bass: { inst: 'bass', base: 41, pat: [[0, 'alt', 0, 0.36]] },
    strum: { inst: 'mandolin', base: 60, size: 3, spread: 0.008, pat: [[2, 0.1, 0], [4, 0.085, 0]] },
  },
  bay: {
    bpm: 64,
    beats: 3,
    tonic: 48,
    level: 1.3,
    prog: [0, 3, 0, 4, 5, 3, 4, 0],
    alt: [0, 5, 3, 4, 0, 3, 4, 0],
    leads: ['musicbox'],
    leadBase: 72,
    leadVel: 0.26,
    rhythms: R3_LULL,
    end: [[0, 6]],
    arp: { inst: 'celesta', base: 60, pat: [[0, 0, 0, 0.1], [1, 2, 0, 0.06], [2, 1, 1, 0.07], [3, 2, 0, 0.05], [4, 0, 1, 0.06], [5, 2, 0, 0.05]] },
    pad: { base: 55, vel: 0.04 },
    bass: { inst: 'bass', base: 36, pat: [[0, 0, 0, 0.2]] },
  },
};
for (const s of Object.values(STYLES)) {
  s.spb = s.beats * 2; // eighth-note steps per bar
  s.stepLen = 60 / s.bpm / 2;
}

// the lead instrument of each place (for the finish flourish)
export const LEADS = { lagoon: 'steelpan', lake: 'guitar', canal: 'mandolin', bay: 'musicbox' };

// Every [instrument, note] a place's music may ask for, so they can be
// rendered ahead of time.
export function styleNotes(place) {
  const st = STYLES[place] || STYLES.lagoon;
  const out = new Set();
  const fold = (x, base) => base + ((((st.tonic + x - base) % 12) + 12) % 12);
  for (const lead of st.leads) for (let i = 0; i <= 9; i++) out.add(lead + ':' + penta(st.leadBase, i));
  for (let d = 0; d < 7; d++) {
    const ch = triad(d);
    if (st.arp) for (const [, tone, oct] of st.arp.pat) out.add(st.arp.inst + ':' + (fold(ch[tone], st.arp.base) + 12 * oct));
    if (st.strum) {
      const notes = ch.map((x) => fold(x, st.strum.base)).sort((x, y) => x - y);
      if (st.strum.size > 3) notes.push(notes[0] + 12);
      for (const m of notes) out.add(st.strum.inst + ':' + m);
    }
    if (st.bass) {
      for (const [, tone, oct] of st.bass.pat) {
        for (const tn of tone === 'alt' ? [0, 2] : [tone]) out.add(st.bass.inst + ':' + (st.bass.base + ch[tn] + 12 * (tone === 'alt' ? (tn === 2 ? -1 : 0) : oct)));
      }
    }
  }
  if (st.shaker) out.add('shaker:0').add('shaker:1');
  return [...out].map((s) => {
    const [inst, m] = s.split(':');
    return [inst, Number(m)];
  });
}

const LEVEL = 0.36; // the music under the effects
const FADE_OUT = 0.35; // time constants of a change of place
const FADE_IN = 0.6;

export class Music {
  constructor(audio) {
    this.a = audio;
    const ctx = (this.ctx = audio.ctx);
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.duckG = ctx.createGain();
    this.fade.connect(this.duckG).connect(audio.musicBus);
    this.buses = [-0.3, 0, 0.3].map((p) => {
      const s = ctx.createStereoPanner();
      s.pan.value = p;
      s.connect(this.fade);
      return s;
    });
    // a warm pad: a softened sawtooth
    const amps = Array.from({ length: 12 }, (_, i) => Math.exp(-(i + 1) / 3) / (i + 1));
    const real = new Float32Array(amps.length + 1);
    const imag = new Float32Array(amps.length + 1);
    amps.forEach((v, i) => (imag[i + 1] = v));
    this.wave = ctx.createPeriodicWave(real, imag);
    this.running = false;
    this.pending = null;
    this.place = null;
  }

  // Start the place's tune, or change to it: the old tune fades, the new
  // one begins from a fresh bar a moment later.
  start(place) {
    if (!STYLES[place]) place = 'lagoon';
    const t = this.a.now();
    if (this.running) {
      if (place !== (this.pending || this.place)) {
        this.fade.gain.cancelScheduledValues(t);
        this.fade.gain.setTargetAtTime(0, t, FADE_OUT);
        this.pending = place;
        this.switchAt = t + 1.2;
      }
      return;
    }
    this.running = true;
    this.pending = null;
    this.begin(place, t + 0.15);
  }

  begin(place, t) {
    this.place = place;
    this.style = STYLES[place];
    this.step = 0;
    this.next = t;
    this.planLoop = -1;
    this.motif = null;
    const g = this.fade.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(LEVEL * this.style.level, t, FADE_IN);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.pending = null;
    const t = this.a.now();
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setTargetAtTime(0, t, 0.3);
  }

  // dip the music under a flourish, then bring it back
  duck(amount = 0.5, time = 1.5) {
    const g = this.duckG.gain;
    const t = this.a.now();
    g.cancelScheduledValues(t);
    g.setTargetAtTime(amount, t, 0.08);
    g.setTargetAtTime(1, t + time, 0.5);
  }

  // Schedule every step that starts before `until` (audio clock).
  pump(until) {
    if (!this.running) return;
    const now = this.a.now();
    if (this.next < now - 0.05) {
      // the timer fell behind (a long frame, a throttled tab): skip ahead
      // rather than cram the missed notes in at once
      const k = Math.ceil((now - this.next) / this.style.stepLen);
      this.step += k;
      this.next += k * this.style.stepLen;
    }
    while (this.next < until) {
      if (this.pending && this.next >= this.switchAt) {
        const p = this.pending;
        this.pending = null;
        this.begin(p, this.next);
      }
      this.play(this.step, this.next);
      this.step++;
      this.next += this.style.stepLen;
    }
  }

  play(step, t) {
    const st = this.style;
    const a = this.a;
    const loopLen = st.spb * 8;
    const li = Math.floor(step / loopLen);
    if (li !== this.planLoop) {
      this.plan = this.compose(li);
      this.planLoop = li;
    }
    // keep time while muted, but spare the work
    if (a.muted) return;
    const k = step % loopLen;
    const evs = this.plan.steps[k];
    if (evs) for (const [inst, m, vel, bus, jit, len] of evs) a.note(inst, m, t + jit, vel, 0, this.buses[bus], len);
    if (st.pad && k % st.spb === 0) {
      // the bar's chord folded into the octave above the pad's base, so the
      // voices move by small steps, and the root an octave down
      const ch = triad(this.plan.chords[k / st.spb]);
      const fold = (x, base) => base + ((((st.tonic + x - base) % 12) + 12) % 12);
      const notes = ch.map((x) => fold(x, st.pad.base));
      notes.push(fold(ch[0], st.pad.base) - 12);
      const dur = st.stepLen * st.spb * 1.02;
      notes.forEach((m, i) => this.pad(m, t, dur, st.pad.vel * (i === 3 ? 0.6 : 1), this.buses[i % 3]));
    }
  }

  // A soft sustained pad note: two slightly detuned oscillators (a slow
  // chorus), swelling in and fading out.
  pad(m, t, dur, vel, dest) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(vel, t, 0.4);
    g.gain.setTargetAtTime(0, t + dur, 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.Q.value = 0.5;
    g.connect(lp).connect(dest);
    const f = mtof(m);
    let live = 2;
    for (const c of [-7, 6]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.wave);
      o.frequency.value = f;
      o.detune.value = c;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 3.5);
      o.onended = () => {
        if (--live === 0) {
          g.disconnect();
          lp.disconnect();
        }
      };
    }
  }

  // One eight-bar pass: the accompaniment, then the tune (A A' B A'').
  compose(loop) {
    const st = this.style;
    const spb = st.spb;
    const steps = [];
    const add = (step, ev) => (steps[step] || (steps[step] = [])).push(ev);
    const prog = loop % 2 && st.alt ? st.alt : st.prog;
    const fold = (x, base) => base + ((((st.tonic + x - base) % 12) + 12) % 12);
    prog.forEach((deg, bar) => {
      const ch = triad(deg);
      const o = bar * spb;
      if (st.arp) for (const [s, tone, oct, vel] of st.arp.pat) add(o + s, [st.arp.inst, fold(ch[tone], st.arp.base) + 12 * oct, vel * rand(0.85, 1.1), 2, rand(0, 0.01), 0]);
      if (st.strum) {
        const S = st.strum;
        const notes = ch.map((x) => fold(x, S.base)).sort((x, y) => x - y);
        if (S.size > 3) notes.push(notes[0] + 12);
        for (const [s, vel, up] of S.pat) {
          const order = up ? notes.slice().reverse() : notes;
          order.forEach((m, i) => add(o + s, [S.inst, m, vel * (1 - 0.07 * i) * rand(0.85, 1.1), 0, i * S.spread + rand(0, 0.005), 0]));
        }
      }
      if (st.bass) {
        for (const [s, tone, oct, vel] of st.bass.pat) {
          const tn = tone === 'alt' ? (bar % 2 ? 2 : 0) : tone;
          const oc = tone === 'alt' ? (tn === 2 ? -1 : 0) : oct;
          add(o + s, [st.bass.inst, st.bass.base + ch[tn] + 12 * oc, vel * rand(0.9, 1.05), 1, 0, 0]);
        }
      }
      if (st.shaker) for (const [s, vel, acc] of st.shaker) add(o + s, ['shaker', acc, vel * rand(0.75, 1.1), 2, rand(0, 0.01), 0]);
    });
    if (!this.motif || Math.random() < 0.6) this.motif = motif(st, this.motif);
    const lead = st.leads[loop % st.leads.length];
    const rest = loop % 4 === 3;
    let idx = pick([2, 4, 5]);
    for (let bar = 0; bar < 8; bar++) {
      const phrase = bar >> 1;
      const half = bar & 1;
      const pcs = triad(prog[bar]).map((x) => x % 12);
      const last = bar === 7;
      const fresh = phrase === 2;
      const rhythm = last ? st.end : fresh ? pick(st.rhythms) : this.motif.rhythm[half];
      rhythm.forEach(([s, l], k) => {
        let step = fresh ? pick(STEPS) : this.motif.steps[half][k % this.motif.steps[half].length];
        if (phrase === 1 && half === 1 && k === 0) step += 1; // the answer reaches a little higher
        if (idx + step > 8 || idx + step < 1) step = -step;
        idx = clamp(idx + step, 0, 9);
        // strong beats and the last note sit on a chord tone
        if (s === 0 || (st.beats === 4 && s === 4) || (last && k === rhythm.length - 1)) idx = chordTone(idx, pcs);
        if (rest && bar < 4) return;
        const len = st.legato ? l * st.stepLen * 0.95 : 0;
        add(bar * spb + s, [lead, penta(st.leadBase, idx), st.leadVel * (s === 0 ? 1 : 0.82) * rand(0.88, 1.08), 1, rand(0, 0.006), len]);
      });
    }
    return { steps, chords: prog };
  }
}

function motif(st, prev) {
  if (prev && Math.random() < 0.5) {
    // reshape one bar of the old motif
    const m = { rhythm: prev.rhythm.slice(), steps: prev.steps.map((s) => s.slice()) };
    const h = Math.random() < 0.5 ? 0 : 1;
    m.rhythm[h] = pick(st.rhythms);
    m.steps[h] = m.rhythm[h].map(() => pick(STEPS));
    return m;
  }
  const rhythm = [pick(st.rhythms), pick(st.rhythms)];
  return { rhythm, steps: rhythm.map((r) => r.map(() => pick(STEPS))) };
}

// the nearest pentatonic index whose note belongs to the chord
function chordTone(idx, pcs) {
  for (const d of [0, -1, 1, -2, 2]) {
    const j = idx + d;
    if (j >= 0 && j <= 9 && pcs.includes(PENTA[j % 5])) return j;
  }
  return idx;
}
