// Moonbound audio: the quiet themes. Each is written the way a score is: chords bar by bar, voiced
// with voice leading, melodies as written lines (theory.js line()), and a form long enough not to
// repeat for minutes (the choice of ornaments, echoes and sparkles is made by a seeded random that
// differs every time a theme starts, so even the cycle does not repeat exactly).
//
//   title   D Aeolian, 52 bpm: bells over a slow pad, a choir that blooms and a cello in the bridge.
//   hollow  A Dorian, 6/8: a harp rocking over a soft pad, a music box singing the Moonbound motif.
//   victory D minor turning to D major, 72 bpm: a brass fanfare, then a bright loop that can run on.
//   death   D minor, 42 bpm: a low bell, a falling choir, a drone that settles.
//
// The Moonbound motif (A D C A F in D minor, the fifth, root, seventh, fifth, third) turns up in
// every theme in the local key.
import { chordOf, line, nearest } from './theory.js';
import { droneBed, windBed } from './instruments.js';
import { N, isStart, runLen, leadSeq, playLine, choirSet } from './tune.js';

const triad = (c) => [c.root, (c.root + c.tones[1]) % 12, (c.root + c.tones[2]) % 12];

// =================================================================================================
// TITLE
// =================================================================================================
const T_BARS = [
  'Dm9', 'Bbmaj7', 'Fadd9', 'Csus2', 'Dm', 'Gm7', 'Bb', 'A', // A
  'Dm9', 'Bbmaj7', 'Fadd9', 'Csus2', 'Dm', 'Gm7', 'Bbmaj7', 'A', // A'
  'Bbmaj7', 'Fadd9', 'Gm7', 'Dm', 'Em7b5', 'A', 'Dm', 'Dm', // B: the bridge
  'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A', // C: sparse, leaning on the dominant
];
const T_PAD = leadSeq(T_BARS, 50, 72, 4);
const T_CH = leadSeq(T_BARS, 48, 68, 3, triad);
const T_CHOIR_ON = T_BARS.map((_, i) => (i >= 12 && i <= 23) || i >= 28);
const T_PH = [
  [line('A4/2 D5/1 C5/1 A4/2 F4/2'), line('C5/2 A4/1 G4/1 E4/2 D4/2'), line('D5/3 C5/1 Bb4/2 A4/2'), line('F5/2 D5/2 C#5/3 -/1')],
  [line('A4/2 D5/1 C5/1 A4/2 G4/1 F4/1'), line('C6/2 A5/1 G5/1 E5/2 D5/2'), line('D5/3 E5/1 F5/2 E5/2'), line('F5/2 D5/2 C#5/3 -/1')],
];
const T_SPARSE = [line('D5/3 -/5'), line('F5/3 -/5'), line('Bb4/3 -/5'), line('C#5/4 -/4')];
const T_CELLO = ['D4', 'C4', 'Bb3', 'A3', 'G3', 'C#4', 'D4', 'D4'].map(N);
const T_SPARK = [86, 89, 91, 93]; // D F G A, two octaves above the middle

const TITLE = {
  key: 2,
  fade: 2.5,
  beats: 4,
  bpm: 52,
  layers: {
    drone: { gain: 0.791, send: 0.3 },
    wind: { gain: 0.382, send: 0.25 },
    pad: { gain: 0.83, send: 0.38 },
    bells: { gain: 0.394, send: 0.45, echo: { beats: 1.5, fb: 0.4, lp: 2800, mix: 0.35 } },
    spark: { gain: 0.836, send: 0.6 },
    choir: { gain: 1.201, send: 0.5 },
    strings: { gain: 1.063, send: 0.38 },
    sub: { gain: 0.258, send: 0.12 },
  },
  choirs: [...choirSet('ah', T_CH), ...choirSet('oh', T_CH)],
  setup(S, t) {
    S.bed(droneBed(S.k, S.out.drone, t, [{ m: N('D2'), g: 0.7 }, { m: N('A2'), g: 0.5 }, { m: N('D3'), g: 0.3 }, { m: N('D1'), g: 0.5 }], { lp: 240, g: 1, fade: 4 }));
    S.bed(windBed(S.k, S.out.wind, t, { f: 420, g: 1, whistle: 0.12 }));
  },
  bar(S) {
    const i = S.cyc(32, 2);
    const t = S.t;
    const b = S.spb;
    if (i < 0) {
      // the intro: only the drone and the wind, then one low toll
      if (S.bar === 1) S.bell('bells', t + 1.2 * b, N('D3'), 0.5, { kind: 'toll', ts: 0.8 });
      return;
    }
    const sec = i >> 3;
    const cycleNo = Math.floor((S.bar - 2) / 32);
    const sym = T_BARS[i];
    const root = chordOf(sym).root;
    // the pad: each chord swells in over the last, voiced to move as little as possible
    if (isStart(T_BARS, i)) {
      const run = runLen(T_BARS, i);
      const lvl = [0.8, 0.95, 1, 0.7][sec];
      T_PAD[i].forEach((m, k) => S.pad('pad', t + S.h(25) + k * 0.03, m, run * 4 * b + 0.4, { g: 0.055 * lvl, a: 1.7, r: 2.8, lp: 780, saw: 0.3, tri: 0.7 }));
    }
    if (sec === 1 || sec === 2) S.sub('sub', t, nearest(root, 44), 2.6, { g: 0.4, tau: 0.9 });
    // the melody
    if (sec < 2 && i % 2 === 0) {
      const ph = T_PH[sec][(i & 7) >> 1];
      const alt = cycleNo % 2 === 1 && sec === 0 && (i & 7) === 2; // the answer an octave up on odd cycles
      playLine(S, 'bells', 'bell', ph, t, b, { vel: 0.85, shift: alt ? 12 : 0, opts: { kind: 'hand', ts: 1.1 } });
    } else if (sec === 2) {
      // the bridge: a falling arpeggio of the chord, a bell on each beat
      const v = T_PAD[i];
      const up = cycleNo % 2 === 1;
      for (let q = 0; q < 4; q++) {
        let m = v[up ? q : 3 - q] + 12;
        while (m > 88) m -= 12;
        if (S.chance(0.88)) S.bell('bells', t + q * b + S.h(14), m, (q === 0 ? 0.55 : 0.38) * (0.85 + 0.3 * S.rnd()), { kind: 'glass', ts: 1.0 });
      }
      S.bowed('strings', t + 0.15, T_CELLO[i - 16], 4 * b * 0.98, { g: 0.13, a: 0.9, r: 1.4, lp: 1500, lp1: 900, lpT: 1, vib: [4.9, 13], vibDelay: 0.5, sub: 0.2 });
    } else if (i % 2 === 0) {
      playLine(S, 'bells', 'bell', T_SPARSE[(i - 24) >> 1], t, b, { vel: 0.75, opts: { kind: 'church', ts: 1.2 } });
    }
    // the choir blooms from the second half of the second statement through the bridge
    if (T_CHOIR_ON[i] && isStart(T_BARS, i)) {
      let run = 1;
      while (i + run < 32 && T_CHOIR_ON[i + run] && T_BARS[i + run] === sym) run++;
      T_CH[i].forEach((m, k) => S.choir('choir', t + k * 0.12 + S.h(40), 'ah', m, run * 4 * b * 0.92, { g: sec === 2 ? 0.075 : 0.095, a: 1.9, r: 2.8, to: 'oh' }));
    }
    // a glint of glass now and then
    if (S.chance(sec === 3 ? 0.18 : 0.32)) S.bell('spark', t + b * (0.5 + S.rnd() * 3), S.pick(T_SPARK), 0.14 + 0.1 * S.rnd(), { kind: 'glass', ts: 0.8 });
  },
};

// =================================================================================================
// HOLLOW
// =================================================================================================
const H_BARS = [
  'Am9', 'D', 'Gmaj7', 'Cmaj7', 'Am9', 'Bm7', 'Cmaj7', 'D', // A
  'Fmaj7', 'Cmaj7', 'Gadd9', 'D', 'Fmaj7', 'C', 'Em7', 'Am9', // B
  'Am9', 'D', 'Em7', 'Gmaj7', 'Cmaj7', 'D', 'Bm7', 'Em7', // C
];
const H_ARP = leadSeq(H_BARS, 50, 76, 5);
const H_PAD = leadSeq(H_BARS, 52, 70, 4);
// arpeggio patterns over six eighths: indices into [bass, v0..v4]
const H_PATS = [[0, 2, 3, 4, 3, 2], [0, 1, 3, 2, 4, 3], [0, 2, 4, 3, 5, 3], [0, 3, 2, 4, 2, 3]];
const H_PAT_W = [[0, 0, 1], [2, 3, 0], [1, 2, 3]]; // by section
const H_VEL = [0.78, 0.44, 0.56, 0.62, 0.5, 0.42];
const H_MEL = [
  line('E5/2 A5/2 G5/2 E5/3 C5/3 D5/3 B4/3 E5/6'),
  line('A5/3 G5/3 F#5/3 D5/3 E5/2 G5/2 C6/2 A5/3 F#5/3'),
  line('C6/3 A5/3 G5/3 E5/3 D5/3 B4/3 A5/3 F#5/3'),
  line('A5/3 G5/3 E5/3 C5/3 B4/3 G5/3 E5/6'),
  line('E6/2 A6/2 G6/2 E6/3 C6/3 D6/3 B5/3 E6/6'),
  line('G5/3 E5/3 F#5/3 A5/3 D5/3 F#5/3 B4/6'),
];
const H_CELLO_ROOT = (sym) => nearest(chordOf(sym).root, 52);

const HOLLOW = {
  key: 9,
  fade: 2.5,
  beats: 2,
  bpm: 56,
  layers: {
    drone: { gain: 0.616, send: 0.2 },
    pad: { gain: 0.712, send: 0.4 },
    harp: { gain: 0.874, send: 0.4, echo: { beats: 2 / 3, fb: 0.3, lp: 2600, mix: 0.22 } },
    box: { gain: 0.797, send: 0.5, echo: { beats: 1, fb: 0.35, lp: 3000, mix: 0.25 } },
    strings: { gain: 0.936, send: 0.4 },
    sub: { gain: 0.267, send: 0.1 },
    spark: { gain: 0.933, send: 0.6 },
    fire: { gain: 1, send: 0.1 },
  },
  setup(S, t) {
    S.bed(droneBed(S.k, S.out.drone, t, [{ m: N('A1'), g: 0.6 }, { m: N('A2'), g: 0.4 }, { m: N('E3'), g: 0.2 }], { lp: 170, g: 1, fade: 3 }));
  },
  bar(S) {
    const i = S.bar % 24;
    const sec = i >> 3;
    const cycleNo = Math.floor(S.bar / 24);
    const t = S.t;
    const st = S.spb / 3; // an eighth
    const sym = H_BARS[i];
    const root = chordOf(sym).root;
    const bass = nearest(root, 46);
    // the pad
    if (isStart(H_BARS, i)) {
      const run = runLen(H_BARS, i);
      H_PAD[i].forEach((m, k) => S.pad('pad', t + S.h(20) + k * 0.025, m, run * 2 * S.spb + 0.3, { g: 0.045, a: 1.3, r: 2.0, lp: 700, saw: 0.18, tri: 0.82 }));
    }
    // the harp: six eighths, rocking
    const pat = H_PATS[S.pick(H_PAT_W[sec])];
    const arr = [bass, ...H_ARP[i]];
    for (let s = 0; s < 6; s++) {
      if (s > 0 && S.chance(0.09)) continue;
      const m = arr[pat[s]];
      S.harp('harp', t + s * st + S.h(7), m, H_VEL[s] * (0.88 + 0.24 * S.rnd()));
    }
    S.sub('sub', t, bass, 1.3, { g: 0.32, tau: 0.5 });
    S.sub('sub', t + 3 * st, bass, 0.9, { g: 0.16, tau: 0.35 });
    // the cello in the bridge: one warm long note per chord
    if (sec === 1 && isStart(H_BARS, i)) {
      const run = runLen(H_BARS, i);
      S.bowed('strings', t + 0.1, H_CELLO_ROOT(sym), run * 2 * S.spb * 0.97, { g: 0.1, a: 0.8, r: 1.2, lp: 1000, lp1: 700, lpT: 1, vib: [4.7, 12], vibDelay: 0.5, sub: 0.25 });
    }
    // the music box sings the motif
    const variant = cycleNo % 3; // box, then harp an octave down, then soft bells
    const phrase = i % 4 === 0 ? H_MEL[(sec << 1) + (i % 8 === 4 ? 1 : 0)] : null;
    if (phrase) {
      const lowered = variant === 1 ? -12 : 0;
      const inst = variant === 1 ? 'harp' : variant === 2 ? 'bell' : 'box';
      playLine(S, variant === 1 ? 'harp' : 'box', inst, phrase, t, st, { vel: variant === 1 ? 0.8 : 0.62, shift: lowered, opts: variant === 2 ? { kind: 'hand', ts: 0.7, g: 0.8 } : undefined });
    }
    // candle-lit extras
    if (S.chance(0.22)) S.box('spark', t + st * (1 + 4 * S.rnd()), S.pick([88, 93, 91, 96]), 0.16 + 0.1 * S.rnd());
    if (S.chance(0.5)) {
      const tt = t + S.spb * 2 * S.rnd();
      const f = 3500 + 2500 * S.rnd();
      S.at(tt, 'fire', () => S.k.noise(S.out.fire, tt, { filt: [{ t: 'highpass', f, q: 0.7 }], a: 0.0005, tau: 0.004, g: 0.05 }));
    }
  },
};

// =================================================================================================
// VICTORY
// =================================================================================================
const V_BARS = ['Dm', 'Bb', 'F', 'C', 'Gm', 'Dm', 'Bb', 'A', 'D', 'Bm', 'G', 'A', 'G', 'D', 'Em7', 'D'];
const V_PAD = leadSeq(V_BARS, 50, 72, 4);
const V_CH = leadSeq(V_BARS, 48, 69, 3, triad);
const V_FANFARE = [
  line('D4/1 A4/1 D5/2 F5/1 D5/1 Bb4/2 A4/1 C5/1 F5/2 E5/1 G5/1 C6/2'),
  line('Bb5/2 A5/1 G5/1 F5/2 D5/2 F5/1 D5/1 Bb4/2 C#5/4'),
];
const V_MAJOR = [
  line('A4/2 D5/1 C#5/1 A4/2 F#4/2 G4/2 B4/2 A4/2 C#5/2'),
  line('D5/2 B4/2 A4/2 F#4/2 G4/2 B4/2 D5/4'),
];
const V_ARP = [0, 1, 2, 3, 2, 1, 2, 3]; // eighths over the pad voicing

const VICTORY = {
  key: 2,
  fade: 1,
  beats: 4,
  bpm: 72,
  layers: {
    drone: { gain: 0.611, send: 0.3 },
    pad: { gain: 0.738, send: 0.4 },
    brass: { gain: 1.916, send: 0.35 },
    bells: { gain: 0.421, send: 0.5, echo: { beats: 1.5, fb: 0.35, lp: 3200, mix: 0.3 } },
    harp: { gain: 1.741, send: 0.4 },
    choir: { gain: 0.836, send: 0.5 },
    drums: { gain: 1.086, send: 0.35 },
    strings: { gain: 0.524, send: 0.35 },
  },
  choirs: [...choirSet('ah', V_CH), ...choirSet('oh', V_CH)],
  drums: ['don', 'don_m', 'crash'],
  setup(S, t) {
    S.bed(droneBed(S.k, S.out.drone, t, [{ m: N('D2'), g: 0.7 }, { m: N('A2'), g: 0.5 }, { m: N('D3'), g: 0.3 }], { lp: 260, g: 1, fade: 2 }));
  },
  bar(S) {
    const first = S.bar < 16;
    const i = first ? S.bar : 8 + ((S.bar - 16) % 8);
    const t = S.t;
    const b = S.spb;
    const sym = V_BARS[i];
    const major = i >= 8;
    const root = chordOf(sym).root;
    if (isStart(V_BARS, i) || (!first && i === 8)) {
      const v = V_PAD[i];
      v.forEach((m, k) => S.pad('pad', t + S.h(20) + k * 0.03, m, 4 * b + 0.3, { g: major ? 0.05 : 0.055, a: 0.9, r: 2.2, lp: major ? 1100 : 900, saw: 0.35, tri: 0.65 }));
      V_CH[i].forEach((m, k) => S.choir('choir', t + k * 0.1 + S.h(30), 'ah', m, 4 * b * 0.95, { g: major ? 0.085 : 0.1, a: 1.0, r: 2.2, to: major ? 'oh' : undefined }));
    }
    S.bowed('strings', t, nearest(root, 40), 4 * b * 0.97, { g: 0.14, a: 0.5, r: 1.2, lp: 1000, lp1: 700, lpT: 1, vib: [4.9, 12], vibDelay: 0.4, sub: 0.3 });
    if (first) {
      // the first pass: a brass fanfare under bell doubling, with the big drums
      if (i < 8 && i % 4 === 0) {
        const ln = V_FANFARE[i >> 2];
        playLine(S, 'brass', 'brass', ln, t, b, { vel: 0.9, opts: { lp: 2400, lp1: 1500 } });
        playLine(S, 'bells', 'bell', ln, t, b, { vel: 0.4, shift: 12, opts: { kind: 'hand', ts: 0.9 } });
      }
      if (i === 0) {
        S.drum('drums', t, 'don', 1);
        S.drum('drums', t, 'crash', 0.35);
        S.drum('drums', t + b * 2, 'don_m', 0.6);
      } else if (i < 8) {
        S.drum('drums', t, 'don', i % 4 === 0 ? 0.85 : 0.6);
        if (i % 2 === 1) S.drum('drums', t + b * 2, 'don_m', 0.5);
      }
      if (i === 8) S.drum('drums', t, 'crash', 0.4);
    }
    if (major) {
      // the bright half: the motif in D major on bells, a harp ripple, a music-box glint
      if (i % 4 === 0) playLine(S, 'bells', 'bell', V_MAJOR[(i - 8) >> 2], t, b, { vel: first ? 0.8 : 0.62, opts: { kind: 'hand', ts: 1.1 } });
      const v = V_PAD[i];
      for (let s = 0; s < 8; s++) {
        if (s > 0 && S.chance(0.1)) continue;
        S.harp('harp', t + s * (b / 2) + S.h(8), v[V_ARP[s]] + 12, (s === 0 ? 0.6 : 0.36) * (0.85 + 0.3 * S.rnd()));
      }
    }
  },
};

// =================================================================================================
// DEATH
// =================================================================================================
const D_BARS = ['Dm', 'Dm', 'Bb', 'A'];
const D_PAD = leadSeq(D_BARS, 48, 69, 4);
const D_CH = [N('A4'), N('G4'), N('F4'), N('E4')];
const D_CH2 = [N('D4'), N('D4'), N('D4'), N('C#4')];

const DEATH = {
  key: 2,
  fade: 0.6,
  beats: 4,
  bpm: 42,
  layers: {
    drone: { gain: 0.703, send: 0.35 },
    wind: { gain: 0.391, send: 0.3 },
    pad: { gain: 0.817, send: 0.45 },
    bells: { gain: 0.6, send: 0.55 },
    choir: { gain: 1.448, send: 0.6 },
    drums: { gain: 1.061, send: 0.4 },
  },
  choirs: [...D_CH, ...D_CH2].map((m) => ['oh', m]).concat(D_CH.map((m) => ['ah', m])),
  drums: ['boom'],
  setup(S, t) {
    S.bed(droneBed(S.k, S.out.drone, t, [{ m: N('D1'), g: 0.8 }, { m: N('A1'), g: 0.5 }, { m: N('D2'), g: 0.4 }], { lp: 190, g: 1, fade: 3 }));
    S.bed(windBed(S.k, S.out.wind, t, { f: 360, g: 1, whistle: 0 }));
  },
  bar(S) {
    const first = S.bar < 4;
    const i = first ? S.bar : S.bar % 4;
    const t = S.t;
    const b = S.spb;
    if (S.bar === 0) {
      S.drum('drums', t + 0.05, 'boom', 0.8);
      S.bell('bells', t + 0.05, N('D3'), 0.9, { kind: 'toll' });
    } else if (first && i === 1) {
      S.bell('bells', t + 2 * b, N('A2'), 0.7, { kind: 'toll' });
    } else if (!first && i === 0 && S.chance(0.6)) {
      S.bell('bells', t + 0.1, N('D3'), 0.55, { kind: 'toll', ts: 0.9 });
    }
    // the pad sinks in with each chord
    D_PAD[i].forEach((m, k) => S.pad('pad', t + S.h(30) + k * 0.05, m, 4 * b + 0.4, { g: 0.05, a: 1.8, r: 3, lp: 650, saw: 0.3, tri: 0.7 }));
    // the choir sings a falling line, one long note a bar
    const n = D_CH[i];
    if (first || i === 1 || i === 3) S.choir('choir', t + 0.2, 'oh', n, 4 * b * 0.95, { g: first ? 0.11 : 0.07, a: 1.6, r: 3, to: 'ah' });
    if (first && i >= 1) S.choir('choir', t + 0.35, 'oh', D_CH2[i], 4 * b * 0.9, { g: 0.05, a: 2, r: 3 });
  },
};

export const THEMES_A = { title: TITLE, hollow: HOLLOW, victory: VICTORY, death: DEATH };
