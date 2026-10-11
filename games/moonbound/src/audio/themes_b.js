// Moonbound audio: the themes of the fights. All of them rise with intensity (the number of foes,
// 0..1): each is an ambient bed that is always there, and a few combat layers that fade in one on
// top of the other as the fight grows: first a slow taiko heartbeat, then a backbeat and a low
// string ostinato, then a driving pulse, brass stabs and a shaker. The bosses are arranged in
// three phases (S.ph) that change the tempo, the drum pattern and the ostinato.
//
//   gloamwall  E Phrygian / Aeolian, 92 bpm: cold wind, open fifths, sparse glass bells.
//   gaoler     B Phrygian, 78 / 84 / 92 bpm: heavy half-time, iron clanks and chains, a menacing riff.
//   seraph     D minor, 138 / 144 / 152 bpm: driving taiko, choir swells, bells, brass.
import { chordOf, line, nearest, atOrAbove } from './theory.js';
import { smooth } from './dsp.js';
import { droneBed, windBed } from './instruments.js';
import { N, isStart, runLen, leadSeq, playLine, choirSet } from './tune.js';

const triad = (c) => [c.root, (c.root + c.tones[1]) % 12, (c.root + c.tones[2]) % 12];
const sm = (a, b) => (I) => smooth(I, a, b);

// drum hits written as [step of 16, drum, velocity]
function hits(S, layer, list, t, scale = 1) {
  const st = S.spb / 4;
  for (const [s, d, v] of list) S.drum(layer, t + s * st + S.h(5), d, v * scale * (0.9 + 0.2 * S.rnd()));
}

// =================================================================================================
// GLOAMWALL
// =================================================================================================
const G_A = ['Em', 'C', 'D', 'Em', 'Am', 'F', 'Em', 'B'];
const G_B = ['Em', 'D', 'C', 'Em', 'F', 'Em', 'Dsus2', 'B'];
const G_BARS = [...G_A, ...G_B].flatMap((c) => [c, c]); // two bars to a chord, 32 bars
const G_PAD = leadSeq(G_BARS, 40, 66, 3);
const G_CH = leadSeq(G_BARS, 52, 69, 3, triad);
const G_MOTIF = line('B4/2 E5/1 D5/1 B4/2 G4/2');
const G_OSTI = [0.95, 0.55, 0.55, 0.85, 0.55, 0.55, 0.7, 0.55]; // accents of the eight eighths

const GLOAMWALL = {
  key: 4,
  fade: 2.2,
  beats: 4,
  bpm: 92,
  layers: {
    drone: { gain: 0.844, send: 0.3, lv: (I) => 1 - 0.3 * I },
    wind: { gain: 0.606, send: 0.25, lv: (I) => 1 - 0.45 * I },
    pad: { gain: 1.14, send: 0.4, lv: (I) => 1 - 0.35 * smooth(I, 0.3, 0.8) },
    bells: { gain: 0.418, send: 0.5, lv: (I) => 1 - 0.5 * smooth(I, 0.3, 0.8), echo: { beats: 1.5, fb: 0.45, lp: 3000, mix: 0.5 } },
    choir: { gain: 1.501, send: 0.55, lv: (I) => 1 - 0.5 * I },
    d1: { gain: 0.287, send: 0.3, lv: sm(0.05, 0.3) },
    d2: { gain: 1.083, send: 0.25, lv: sm(0.3, 0.6) },
    d3: { gain: 0.443, send: 0.25, lv: sm(0.6, 0.9) },
    bass: { gain: 0.31, send: 0.05, lv: sm(0.15, 0.5) },
    strings: { gain: 0.582, send: 0.25, lv: sm(0.35, 0.7) },
    brass: { gain: 1.323, send: 0.3, lv: sm(0.7, 0.95) },
  },
  choirs: choirSet('oo', G_CH),
  drums: ['don', 'don_m', 'don_s', 'ka', 'chain', 'shaker'],
  setup(S, t) {
    S.bed(droneBed(S.k, S.out.drone, t, [{ m: N('E1'), g: 0.7 }, { m: N('B1'), g: 0.5 }, { m: N('E2'), g: 0.4 }, { m: N('E4'), g: 0.03 }], { lp: 190, g: 1, fade: 3 }));
    S.bed(windBed(S.k, S.out.wind, t, { f: 520, g: 1, whistle: 0.7 }));
  },
  bar(S) {
    const i = S.bar % 32;
    const t = S.t;
    const b = S.spb;
    const sym = G_BARS[i];
    const ch = chordOf(sym);
    const first = isStart(G_BARS, i);
    // ambient: open voicings, a glass bell or two, a distant choir
    if (first) {
      const run = runLen(G_BARS, i);
      G_PAD[i].forEach((m, k) => S.pad('pad', t + S.h(25) + k * 0.04, m, run * 4 * b + 0.3, { g: 0.05, a: 2.4, r: 3, lp: 640, q: 0.8, det: 9, saw: 0.6, tri: 0.4 }));
      if (i % 16 === 0) playLine(S, 'bells', 'bell', G_MOTIF, t + b, b, { vel: 0.75, opts: { kind: 'glass', ts: 1.4 } });
      else {
        const pcs = [ch.root, (ch.root + ch.tones[1]) % 12, (ch.root + 7) % 12, (ch.root + 2) % 12];
        if (S.chance(0.8)) S.bell('bells', t + b * (0.5 + 2 * S.rnd()), atOrAbove(S.pick(pcs), 76), 0.4 + 0.2 * S.rnd(), { kind: 'glass', ts: 1.3 });
        if (S.chance(0.4)) S.bell('bells', t + b * (5 + 2.5 * S.rnd()), atOrAbove(S.pick(pcs), 69), 0.3 + 0.2 * S.rnd(), { kind: 'glass', ts: 1.3 });
      }
      if (i % 8 === 4) G_CH[i].forEach((m, k) => S.choir('choir', t + k * 0.15, 'oo', m, run * 4 * b * 0.9, { g: 0.07, a: 2.2, r: 3 }));
    }
    // combat 1: a slow heartbeat on the taiko
    S.drum('d1', t + S.h(6), 'don', 0.9);
    S.drum('d1', t + 2 * b + S.h(6), 'don', 0.6);
    if (S.chance(0.5)) S.drum('d1', t + 2.5 * b, 'don_s', 0.3);
    // combat 2: backbeat on the hoop, a chain, a low string ostinato
    S.drum('d2', t + b, 'ka', 0.5);
    S.drum('d2', t + 3 * b, 'ka', 0.55);
    S.drum('d2', t + 3.5 * b, 'don_s', 0.45);
    if (S.chance(0.5)) S.drum('d2', t + 1.75 * b, 'chain', 0.3);
    const rootN = nearest(ch.root, 40);
    const third = ch.tones[1];
    const pat = [0, 0, 0, third, 0, 0, third === 3 ? 1 : 2, 0];
    for (let q = 0; q < 8; q++) {
      S.bowed('strings', t + q * (b / 2) + S.h(5), rootN + pat[q], b * 0.4, { g: 0.2 * G_OSTI[q], a: 0.012, r: 0.07, lp: 1500, lp1: 520, lpT: 0.07, sub: 0.35 });
    }
    // the pulse under it
    for (let q = 0; q < 8; q++) S.sub('bass', t + q * (b / 2), nearest(ch.root, 38), b * 0.42, { g: q % 2 === 0 ? 0.5 : 0.34, tau: 0.09, drop: 1.25 });
    // combat 3: eighths on the mid drum, a shaker, fills
    for (let q = 0; q < 8; q++) S.drum('d3', t + q * (b / 2) + S.h(4), q % 2 === 0 ? 'don_m' : 'don_s', q % 4 === 0 ? 0.5 : 0.3);
    for (let s = 0; s < 16; s++) S.drum('d3', t + s * (b / 4), 'shaker', s % 4 === 0 ? 0.26 : 0.14);
    if (S.bar % 4 === 3) for (let s = 12; s < 16; s++) S.drum('d3', t + s * (b / 4), 'don_s', 0.28 + (s - 12) * 0.1);
    // brass stabs when the fight is at its height
    if (first || i % 2 === 0) {
      const r0 = nearest(ch.root, 40);
      for (const iv of [0, 7, 12]) S.brass('brass', t + S.h(5), r0 + iv, 0.55, { g: 0.12, lp0: 320, lp: 2000, lp1: 1000 });
    }
  },
};

// =================================================================================================
// THE BONE GAOLER
// =================================================================================================
const GA_BARS = ['Bm', 'Bm', 'C', 'Bm', 'G', 'Asus2', 'Bdim', 'Bm'];
const GA_PCS = { Bm: [11, 6, 0, 2], C: [0, 7, 11, 4], G: [7, 2, 6, 11], Asus2: [9, 4, 11, 9], Bdim: [11, 5, 2, 11] };
const GA_PAD = leadSeq(GA_BARS, 47, 70, 4, (c) => GA_PCS[c.name]);
const GA_CH = leadSeq(GA_BARS, 47, 68, 3, triad);
const GA_RIFF = [[0, 0, 1, 0, 3, 0, 1, 0], [0, 0, 1, 0, 6, 5, 3, 1]];
const GA_PERC = {
  1: [[0, 'don', 1], [0, 'clank_lo', 0.75], [8, 'clank_hi', 0.55], [10, 'don', 0.7], [13, 'chain', 0.4]],
  2: [[0, 'don', 1], [0, 'clank_lo', 0.75], [8, 'clank_hi', 0.55], [10, 'don', 0.7], [13, 'chain', 0.4]],
  3: [[0, 'don', 1], [0, 'clank_lo', 0.8], [8, 'clank_lo', 0.7], [10, 'don', 0.75], [4, 'clank_hi', 0.5], [12, 'clank_hi', 0.55], [13, 'chain', 0.45]],
};
const GA_PERC2 = {
  2: [[4, 'ka', 0.5], [12, 'ka', 0.55], [6, 'don_m', 0.45], [7, 'don_m', 0.35], [14, 'don_m', 0.5], [15, 'don_m', 0.4], [2, 'shaker', 0.3], [6, 'shaker', 0.3], [10, 'shaker', 0.3], [14, 'shaker', 0.3], [5, 'chain', 0.3]],
  3: [[2, 'don_m', 0.45], [6, 'don_m', 0.5], [7, 'don_m', 0.4], [14, 'don_m', 0.55], [15, 'don_m', 0.45], [4, 'ka', 0.5], [12, 'ka', 0.55], [2, 'shaker', 0.3], [6, 'shaker', 0.3], [10, 'shaker', 0.3], [14, 'shaker', 0.3], [1, 'shaker', 0.2], [5, 'shaker', 0.2], [9, 'shaker', 0.2], [13, 'shaker', 0.2], [5, 'chain', 0.35], [11, 'chain', 0.3]],
};

const GAOLER = {
  key: 11,
  fade: 0.9,
  beats: 4,
  bpm: (ph) => [78, 84, 92][ph - 1] || 78,
  layers: {
    drone: { gain: 0.609, send: 0.3 },
    pad: { gain: 1.349, send: 0.4, lv: (I, ph) => 0.55 + 0.15 * ph },
    choir: { gain: 1.311, send: 0.5, lv: (I, ph) => (ph >= 2 ? 0.9 : 0) },
    perc: { gain: 0.371, send: 0.35, lv: (I) => 0.75 + 0.25 * I },
    perc2: { gain: 0.466, send: 0.3, lv: (I, ph) => (ph >= 2 ? 1 : 0) },
    riff: { gain: 0.68, send: 0.25, lv: (I, ph) => (ph === 1 ? 0.5 + 0.4 * I : ph === 2 ? 0.85 : 1) },
    brass: { gain: 1.298, send: 0.3, lv: (I, ph) => (ph >= 3 ? 1 : 0) },
    bells: { gain: 0.787, send: 0.5 },
    sub: { gain: 0.23, send: 0.1 },
  },
  choirs: choirSet('oo', GA_CH),
  drums: ['don', 'don_m', 'ka', 'clank_lo', 'clank_hi', 'chain', 'shaker', 'crash'],
  setup(S, t) {
    S.bed(droneBed(S.k, S.out.drone, t, [{ m: N('B1'), g: 0.8 }, { m: N('F#2'), g: 0.5 }, { m: N('B2'), g: 0.4 }, { m: N('C3'), g: 0.12 }], { lp: 230, g: 1, fade: 2.5, saw: 1.4 }));
  },
  bar(S) {
    const ph = S.ph;
    const i = S.bar % 8;
    const t = S.t;
    const b = S.spb;
    const st = b / 4;
    const I = S.I;
    const ch = chordOf(GA_BARS[i]);
    // the dark cluster of the pad, changing every bar or two
    if (isStart(GA_BARS, i)) {
      const run = runLen(GA_BARS, i);
      GA_PAD[i].forEach((m, k) => S.pad('pad', t + S.h(20) + k * 0.05, m, run * 4 * b + 0.3, { g: 0.05, a: 1.2, r: 2.2, lp: 520 + 120 * ph, q: 1, det: 11, saw: 0.7, tri: 0.3 }));
      if (ph >= 2 && i % 4 === 0) GA_CH[i].forEach((m, k) => S.choir('choir', t + k * 0.12, 'oo', m, run * 4 * b * 0.9, { g: 0.085, a: 1.2, r: 2.5 }));
    }
    // a toll of the great bell
    if (i === 0 || (ph >= 2 && i === 4)) S.bell('bells', t + 0.05, N('B3'), 0.55, { kind: 'toll', ts: 0.8 });
    S.sub('sub', t, nearest(ch.root, 36), b * 3.2, { g: 0.55, tau: 0.5 });
    // the percussion: iron on the beats, the taiko under it, chains in the gaps
    hits(S, 'perc', GA_PERC[ph], t);
    if (ph >= 2) hits(S, 'perc2', GA_PERC2[ph], t);
    if (ph >= 2 && i === 0) S.drum('perc2', t, 'crash', 0.35);
    // the riff, low and marcato: B, C, B, D... and the tritone in the turn
    const riff = GA_RIFF[i % 2];
    const base = N('B2');
    for (let q = 0; q < 8; q++) {
      if (ph === 1 && q % 2 === 1) continue;
      const long = ph === 1 ? 1.7 : 1;
      S.bowed('riff', t + q * (b / 2) + S.h(5), base + riff[q], (b / 2) * 0.78 * long, { g: 0.22 * (q % 4 === 0 ? 1 : 0.75), a: 0.012, r: 0.07, lp: 1300 + 500 * I, lp1: 480, lpT: 0.08, sub: 0.45, det: 12 });
      if (ph >= 3 && q >= 6) S.bowed('riff', t + q * (b / 2) + b / 4, base + riff[q], (b / 4) * 0.7, { g: 0.16, a: 0.01, r: 0.05, lp: 1400, lp1: 520, lpT: 0.06, sub: 0.4, det: 12 });
    }
    // brass stabs, last phase
    for (const s of [0, 10]) for (const iv of [0, 7, 12]) S.brass('brass', t + s * st, base + iv, 0.4, { g: 0.12, lp0: 300, lp: 2100, lp1: 1000 });
  },
};

// =================================================================================================
// THE HOLLOW SERAPH
// =================================================================================================
const SE_BARS = [
  ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Gm', 'Bb', 'A'],
  ['Dm', 'Bb', 'C', 'Dm', 'Gm', 'Bb', 'A', 'A'],
  ['Dm', 'Bb', 'C', 'Dm', 'Eb', 'C', 'A', 'A'],
];
const SE_PAD = SE_BARS.map((l) => leadSeq(l, 50, 72, 4));
const SE_CH = SE_BARS.map((l) => leadSeq(l, 50, 69, 3, triad));
const SE_MOTIF = line('A4/2 D5/1 C5/1 A4/2 F4/2');
const SE_PERC = {
  1: [[0, 'don', 1], [8, 'don', 0.85], [4, 'don_m', 0.6], [12, 'don_m', 0.6], [14, 'ka', 0.4]],
  2: [[0, 'don', 1], [8, 'don', 0.9], [3, 'don_m', 0.55], [6, 'don_m', 0.6], [11, 'don_m', 0.55], [14, 'don_m', 0.6]],
  3: [[0, 'don', 1], [8, 'don', 0.95], [2, 'don_m', 0.5], [4, 'don_m', 0.65], [6, 'don_m', 0.5], [10, 'don_m', 0.5], [12, 'don_m', 0.65], [14, 'don_m', 0.5]],
};
const SE_PERC2 = {
  2: [[4, 'ka', 0.5], [12, 'ka', 0.5], [2, 'shaker', 0.25], [6, 'shaker', 0.25], [10, 'shaker', 0.25], [14, 'shaker', 0.25]],
  3: [[6, 'ka', 0.55], [14, 'ka', 0.6], [7, 'don_s', 0.5], [15, 'don_s', 0.5], ...Array.from({ length: 16 }, (_, s) => [s, 'shaker', s % 4 === 0 ? 0.26 : 0.17])],
};
const SE_OSTI = {
  1: { n: 8, iv: [0, 0, 7, 0, 0, 7, 12, 7], v: [0.9, 0.5, 0.65, 0.5, 0.8, 0.55, 0.7, 0.55] },
  2: { n: 16, iv: [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 10, 12, 7], v: [0.9, 0.45, 0.6, 0.45, 0.75, 0.45, 0.6, 0.45, 0.85, 0.45, 0.6, 0.45, 0.75, 0.55, 0.65, 0.6] },
  3: { n: 16, iv: [0, 12, 0, 12, 7, 12, 0, 7, 0, 12, 0, 12, 10, 12, 7, 12], v: [0.95, 0.5, 0.6, 0.5, 0.8, 0.5, 0.65, 0.55, 0.9, 0.5, 0.6, 0.5, 0.8, 0.5, 0.7, 0.6] },
};

const SERAPH = {
  key: 2,
  fade: 0.9,
  beats: 4,
  bpm: (ph) => [138, 144, 152][ph - 1] || 138,
  layers: {
    drone: { gain: 0.675, send: 0.3 },
    pad: { gain: 1.539, send: 0.4, lv: 0.8 },
    choir: { gain: 1.062, send: 0.55, lv: (I) => 0.8 + 0.2 * I },
    perc: { gain: 0.285, send: 0.3, lv: (I) => 0.85 + 0.15 * I },
    perc2: { gain: 0.754, send: 0.3, lv: (I, ph) => (ph >= 2 ? 1 : 0) },
    strings: { gain: 0.77, send: 0.3, lv: (I) => 0.7 + 0.3 * I },
    brass: { gain: 1.297, send: 0.35, lv: (I, ph) => (ph >= 2 ? 0.9 : 0) },
    bells: { gain: 0.572, send: 0.5 },
    sub: { gain: 0.267, send: 0.1 },
  },
  choirs: [
    ...choirSet('ah', SE_CH[0]),
    ...choirSet('ah', SE_CH[1].map((v) => [v[0], v[1], v[2] + 12])),
    ...choirSet('ah', SE_CH[2].map((v) => v.map((m) => m - 12))),
    ...choirSet('ah', [SE_MOTIF.map((e) => e.m)]),
  ],
  drums: ['don', 'don_m', 'don_s', 'ka', 'shaker', 'crash', 'riser'],
  setup(S, t) {
    S.bed(droneBed(S.k, S.out.drone, t, [{ m: N('D1'), g: 0.7 }, { m: N('A1'), g: 0.5 }, { m: N('D2'), g: 0.4 }], { lp: 260, g: 1, fade: 2, saw: 1.3 }));
  },
  bar(S) {
    const ph = S.ph;
    const i = S.bar % 8;
    const t = S.t;
    const b = S.spb;
    const st = b / 4;
    const bars = SE_BARS[ph - 1];
    const ch = chordOf(bars[i]);
    const rootN = nearest(ch.root, 38);
    if (isStart(bars, i)) {
      const run = runLen(bars, i);
      SE_PAD[ph - 1][i].forEach((m, k) => S.pad('pad', t + S.h(15) + k * 0.03, m, run * 4 * b + 0.3, { g: 0.045, a: 0.5, r: 1.6, lp: 1100, saw: 0.6, tri: 0.4, det: 9 }));
    }
    // the choir: long chords, and from the last phase the motif itself
    if (ph < 3) {
      if (isStart(bars, i)) {
        const run = runLen(bars, i);
        SE_CH[ph - 1][i].forEach((m, k) => S.choir('choir', t + k * 0.08, 'ah', m + (ph === 2 && k === 2 ? 12 : 0), run * 4 * b * 0.95, { g: 0.1, a: 0.9, r: 1.6 }));
      }
    } else {
      if (i % 2 === 0) playLine(S, 'choir', 'choir', SE_MOTIF, t, b, { vel: 1, opts: { vowel: 'ah', a: 0.25, r: 1.2, g: 0.1 } });
      if (isStart(bars, i)) SE_CH[2][i].forEach((m, k) => S.choir('choir', t + k * 0.06, 'ah', m - 12, runLen(bars, i) * 4 * b * 0.95, { g: 0.07, a: 0.7, r: 1.4 }));
    }
    // bells: a toll on the downbeat, the motif once the fight has turned
    if (ph === 1 && (i === 0 || i === 4)) S.bell('bells', t, N('D4'), 0.75, { kind: 'church', ts: 0.9 });
    if (ph === 2 && i % 4 === 0) playLine(S, 'bells', 'bell', SE_MOTIF, t, b, { vel: 0.7, opts: { kind: 'church', ts: 0.7 } });
    if (ph === 3 && i % 2 === 0) S.bell('bells', t, N('D5'), 0.5, { kind: 'church', ts: 0.6 });
    // the drums
    const fill = ph === 3 && i === 7;
    hits(S, 'perc', fill ? SE_PERC[3].filter((h) => h[0] < 8) : SE_PERC[ph], t);
    if (fill) for (let s = 8; s < 16; s++) S.drum('perc', t + s * st, 'don_s', 0.4 + (s - 8) * 0.08);
    if (ph >= 2) hits(S, 'perc2', SE_PERC2[ph], t);
    if (ph >= 2 && i === 0) S.drum('perc2', t, 'crash', 0.45);
    if (i === 7 && ph >= 2) S.drum('perc2', t, 'riser', 0.5);
    // the string ostinato on the root of the chord
    const o = SE_OSTI[ph];
    const step = (4 * b) / o.n;
    for (let q = 0; q < o.n; q++) S.bowed('strings', t + q * step + S.h(4), rootN + o.iv[q], step * 0.75, { g: 0.2 * o.v[q], a: 0.01, r: 0.06, lp: 1700, lp1: 600, lpT: 0.06, sub: 0.35, det: 8 });
    // brass: the power chords
    if (ph >= 2) for (const s of [0, 10]) for (const iv of [0, 7, 12]) S.brass('brass', t + s * st, nearest(ch.root, 50) + iv - 12, s === 0 ? b : b / 2, { g: 0.11, lp0: 320, lp: 2400, lp1: 1200 });
    // the pulse under it
    const pulses = ph === 1 ? 4 : 8;
    for (let q = 0; q < pulses; q++) S.sub('sub', t + q * (4 * b / pulses), rootN, (4 * b / pulses) * 0.8, { g: 0.5, tau: 0.1, drop: 1.3 });
  },
};

export const THEMES_B = { gloamwall: GLOAMWALL, gaoler: GAOLER, seraph: SERAPH };
