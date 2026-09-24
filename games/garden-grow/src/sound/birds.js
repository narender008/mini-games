// Birdsong, rendered sample by sample. A songbird's syrinx makes nearly
// pure whistles, so each phrase is a string of short elements: pure tones
// with fast glides, warbles (a quick vibrato), inflected notes and trills,
// with tiny gaps between. Three garden birds:
//  - robin: varied, liquid, warbling phrases leaping between high and low;
//  - blue tit: two or three thin "tsee" notes, then a "chu-chu-chu" trill;
//  - goldfinch: a fast, tinkling twitter with the odd soft buzzy note.
// Everything sits between about 2 and 7 kHz. No two phrases are the same.
import { mulberry32, TAU, filter, finish } from './synth.js';

// pitch shapes over an element (u runs 0..1)
const lin = (a, b) => (u) => a + (b - a) * u;
const glide = (a, b) => (u) => a * Math.pow(b / a, u);
const arch = (a, p, b) => (u) => (u < 0.5 ? a + (p - a) * Math.sin(Math.PI * u) : b + (p - b) * Math.sin(Math.PI * u));
const drop = (a, b) => (u) => b + (a - b) * (1 - u) * (1 - u);

function phrase(rand) {
  const els = [];
  const r = (a, b) => a + rand() * (b - a);
  const s = { t: 0.015 };
  s.add = (e, gap) => {
    els.push({ at: s.t, ...e });
    s.t += e.dur + gap;
  };
  s.rest = (g) => (s.t += g);
  return { els, r, s };
}

function robin(rand) {
  const { els, r, s } = phrase(rand);
  // one or two high, thin opening notes
  const fi = r(5200, 6300);
  const intro = rand() < 0.5 ? 2 : 1;
  for (let i = 0; i < intro; i++) s.add({ dur: r(0.08, 0.14), f: lin(fi, fi * r(0.9, 0.97)), amp: 0.5, attack: 0.012, release: 0.02 }, r(0.05, 0.1));
  // then a varied, liquid run
  const count = 5 + Math.floor(rand() * 6);
  for (let k = 0; k < count; k++) {
    const type = rand();
    const gap = r(0.012, 0.06);
    if (type < 0.22) {
      const c = r(3000, 4800);
      s.add({ dur: r(0.1, 0.2), f: lin(c, c * r(0.9, 1.1)), vib: [r(24, 40), r(250, 550)], amp: r(0.6, 0.9) }, gap);
    } else if (type < 0.42) {
      const a = r(4800, 6700);
      s.add({ dur: r(0.035, 0.08), f: glide(a, a * r(0.5, 0.7)), amp: r(0.6, 1), attack: 0.004 }, gap);
    } else if (type < 0.55) {
      const a = r(2600, 3600);
      s.add({ dur: r(0.035, 0.07), f: glide(a, a * r(1.4, 1.8)), amp: r(0.6, 0.9) }, gap);
    } else if (type < 0.7) {
      const a = r(2800, 4200);
      s.add({ dur: r(0.06, 0.12), f: arch(a, a * r(1.25, 1.5), a * r(0.85, 1.05)), amp: r(0.7, 1) }, gap);
    } else if (type < 0.85) {
      const a = r(4200, 6000);
      const b = a * r(0.65, 0.8);
      const d = r(0.022, 0.032);
      const notes = 3 + Math.floor(rand() * 5);
      for (let i = 0; i < notes; i++) s.add({ dur: d, f: glide(a, b), amp: r(0.55, 0.8), attack: 0.003, release: 0.007 }, r(0.008, 0.014));
      s.rest(gap);
    } else {
      const a = r(2400, 4000);
      s.add({ dur: r(0.09, 0.18), f: lin(a, a * r(0.97, 1.06)), amp: r(0.6, 0.85) }, gap);
    }
  }
  // it ends softly: a low warble or a fading little trill
  if (rand() < 0.5) {
    const c = r(2500, 3200);
    s.add({ dur: r(0.14, 0.22), f: lin(c, c * 0.92), vib: [r(20, 30), r(200, 350)], amp: 0.55, release: 0.04 }, 0);
  } else {
    const a = r(4000, 5000);
    for (let i = 0; i < 5; i++) s.add({ dur: 0.026, f: glide(a, a * 0.75), amp: 0.6 * (1 - i * 0.15), attack: 0.003, release: 0.007 }, 0.012);
  }
  return els;
}

function blueTit(rand) {
  const { els, r, s } = phrase(rand);
  const f = r(6400, 6900);
  const tsee = rand() < 0.3 ? 3 : 2;
  for (let i = 0; i < tsee; i++) s.add({ dur: r(0.085, 0.11), f: lin(f, f * 0.95), amp: 0.5, attack: 0.014, release: 0.022 }, r(0.06, 0.08));
  s.rest(r(0.02, 0.05));
  if (rand() < 0.65) {
    // "chu-chu-chu"
    const a = r(4400, 4900);
    const b = r(3200, 3600);
    const count = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) s.add({ dur: r(0.05, 0.062), f: drop(a * (1 - i * 0.01), b), amp: 0.9, attack: 0.004, release: 0.014 }, r(0.022, 0.03));
  } else {
    // a quick silvery trill
    const a = r(4300, 4700);
    const count = 12 + Math.floor(rand() * 8);
    for (let i = 0; i < count; i++) s.add({ dur: 0.022, f: glide(a, a * 0.85), amp: 0.7 * (1 - (i / count) * 0.35), attack: 0.003, release: 0.007 }, 0.013);
  }
  return els;
}

function goldfinch(rand) {
  const { els, r, s } = phrase(rand);
  const count = 16 + Math.floor(rand() * 18);
  for (let k = 0; k < count; k++) {
    const type = rand();
    let gap = r(0.008, 0.03);
    if (rand() < 0.12) gap += r(0.04, 0.09);
    if (type < 0.25) {
      const a = r(2800, 3800);
      s.add({ dur: r(0.025, 0.04), f: glide(a, a * r(1.3, 1.6)), amp: r(0.6, 0.9), attack: 0.003, release: 0.008 }, gap);
    } else if (type < 0.5) {
      const a = r(4800, 6000);
      s.add({ dur: r(0.035, 0.06), f: glide(a, a * r(0.6, 0.75)), amp: r(0.6, 1), attack: 0.004 }, gap);
    } else if (type < 0.7) {
      const a = r(3200, 4200);
      s.add({ dur: r(0.03, 0.05), f: arch(a, a * 1.35, a * 0.95), amp: r(0.7, 1), attack: 0.004 }, gap);
    } else if (type < 0.82) {
      // "tickelitt"
      const a = r(3400, 4200);
      s.add({ dur: 0.024, f: glide(a, a * 1.3), amp: 0.8, attack: 0.003, release: 0.006 }, 0.008);
      s.add({ dur: 0.024, f: glide(a * 1.35, a * 1.05), amp: 0.7, attack: 0.003, release: 0.006 }, 0.008);
      s.add({ dur: 0.03, f: glide(a * 1.1, a * 1.45), amp: 0.85, attack: 0.003, release: 0.008 }, gap);
    } else if (type < 0.92) {
      const c = r(3600, 4600);
      s.add({ dur: r(0.05, 0.08), f: lin(c, c * 1.05), vib: [r(50, 70), r(400, 650)], amp: r(0.6, 0.85) }, gap);
    } else {
      // a soft buzzy "zee"
      const c = r(4000, 4700);
      s.add({ dur: r(0.08, 0.13), f: lin(c, c * 0.97), am: [r(110, 150), 0.7], amp: 0.45, attack: 0.012, release: 0.02 }, gap);
    }
  }
  return els;
}

const SONGS = { robin, 'blue-tit': blueTit, bluetit: blueTit, goldfinch };

// Render one phrase of `kind` ('robin' | 'blue-tit' | 'goldfinch').
export function birdPhrase(sr, seed, kind) {
  const rand = mulberry32(seed);
  const els = (SONGS[kind] || robin)(rand);
  let end = 0;
  for (const e of els) end = Math.max(end, e.at + e.dur);
  const n = Math.ceil((end + 0.05) * sr);
  const out = new Float32Array(n);
  for (const e of els) {
    const start = Math.floor(e.at * sr);
    const len = Math.max(8, Math.floor(e.dur * sr));
    const att = Math.max(1, Math.min(len >> 1, Math.floor((e.attack ?? 0.006) * sr)));
    const rel = Math.max(1, Math.min(len >> 1, Math.floor((e.release ?? 0.01) * sr)));
    let ph = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      const u = i / len;
      const t = i / sr;
      let f = e.f(u);
      if (e.vib) f += e.vib[1] * Math.sin(TAU * e.vib[0] * t);
      ph += (TAU * f) / sr;
      let env = e.amp;
      if (i < att) env *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
      if (i > len - rel) env *= 0.5 - 0.5 * Math.cos((Math.PI * (len - i)) / rel);
      if (e.am) env *= 1 - e.am[1] * (0.5 + 0.5 * Math.sin(TAU * e.am[0] * t));
      out[start + i] += env * (Math.sin(ph) + 0.06 * Math.sin(2 * ph));
    }
  }
  filter(out, sr, 'highpass', 1200, 0.7);
  filter(out, sr, 'lowpass', 7200, 0.7);
  return finish([out], sr, 1, 20);
}
