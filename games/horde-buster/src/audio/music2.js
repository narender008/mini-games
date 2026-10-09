// The chapter themes of Horde Buster (stage 2), rendered like the score in music.js (stereo loops in stems, the
// intensity layer a gain on a stem, tails folded back onto the start so the loop is seamless) and rendered
// lazily: lib.js holds them back until the game asks for one with Sound.music(name) or Sound.preload(name),
// or until everything else is built.
//   graveyard  C sharp minor, 138 bpm, 8 bars. An organ and a choir over a driving beat; an eerie lead and glassy bells on top.
//   hell       A minor (Phrygian), 176 bpm, 8 bars. Gallop riffs on distorted guitars, a double kick, a screaming lead.
//   boss2      F sharp minor, 108 bpm, 8 bars. The demon: timpani, a five-voice choir, brass stabs, gold bells, a violin ostinato.
//   boss3      C minor, 72 bpm, 6 bars. The Abomination: slow and crushing, huge kicks, anvil clangs, groaning sweeps, a moaning choir.
//   endless    B minor, 164 bpm, 8 bars, four stems. Relentless; each stem is a step up in intensity.
import { TAU, mtof, seeded, Biquad, wave, WAVES, modal } from './dsp.js';
import {
  SR, MASK, Mix, put, addMix, fold, makeTables, newCtx, kick, snare, hat, tom, crash, riser, note, pingpong, reverb, ARPS, on, sm,
} from './music.js';

// ---------------------------------------------------------------- new voices

// vowels as [formant centre Hz, gain]
const VOWELS = {
  oo: [[330, 1], [750, 0.35], [2500, 0.12]],
  oh: [[480, 1], [850, 0.5], [2700, 0.15]],
  ah: [[800, 1], [1200, 0.55], [2800, 0.2]],
};

// A choir. Every note of `midis` is sung by two detuned saws; the lot goes through the three formants of a vowel,
// which glide over the note from vowel[0] to vowel[1] ('oo' | 'oh' | 'ah'). A slow attack, a late vibrato, some breath.
//   dur seconds held, rel release, att attack, vel gain, pan, breath noise level, vib [Hz, depth]
// The saws are the plain ramp (not band-limited): the formant filters after them take out what would alias.
export function* choir(m, mix, t, o) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const rel = o.rel ?? 0.5;
  const body = Math.round(o.dur * sr);
  const len = Math.min(body + Math.round(rel * sr), m.tmp.length, mix.big - at);
  if (len <= 0) return;
  const dets = o.det ?? [-12, 12];
  const { ph, dp, tmp } = m;
  let no = 0;
  for (const midi of o.midis) {
    for (const d of dets) {
      ph[no] = m.r();
      dp[no] = mtof(midi + d / 100) / sr;
      no++;
    }
  }
  const [v0, v1] = (o.vowel ?? ['oo', 'ah']).map((n) => VOWELS[n]);
  const q = o.q ?? 7;
  const bqs = v0.map((f) => new Biquad('bandpass', f[0], q, sr));
  const att = Math.max(2, Math.round((o.att ?? 0.5) * sr));
  const vib = o.vib ?? [5.3, 0.009];
  const nz = m.nz.snap;
  const off = (m.r() * MASK) | 0;
  const breath = o.breath ?? 0.05;
  const g0 = 4 / Math.sqrt(no);
  const relLen = Math.max(1, len - body);
  for (let b = 0; b < len; b += 1024) {
    const e = Math.min(len, b + 1024);
    for (let i = b; i < e; i++) {
      const tt = i / sr;
      const vm = 1 + vib[1] * Math.sin(TAU * vib[0] * tt) * Math.min(1, tt / 0.6);
      let s = 0;
      for (let k = 0; k < no; k++) {
        let p = ph[k] + dp[k] * vm;
        if (p >= 1) p -= 1;
        ph[k] = p;
        s += 2 * p - 1;
      }
      s = s * g0 + breath * nz[(off + i) & MASK];
      const u = Math.min(1, i / Math.max(1, body));
      if ((i & 63) === 0) for (let k = 0; k < 3; k++) bqs[k].set('bandpass', v0[k][0] + (v1[k][0] - v0[k][0]) * u, q, sr);
      let y = 0;
      for (let k = 0; k < 3; k++) y += (v0[k][1] + (v1[k][1] - v0[k][1]) * u) * bqs[k].run(s);
      let g = 1;
      if (i < att) g = 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
      if (i >= body) g *= Math.max(0, 1 - (i - body) / relLen);
      tmp[i] = y * g;
    }
    yield;
  }
  put(m, mix, at, len, o.vel ?? 1, o.pan ?? 0);
}

// A saw (or square) gliding from f0 to f1 through a moving low-pass: sirens, groans and risers.
//   f0 f1 Hz, dur, att, rel, wave, det cents, lp [fc0, fc1], drive, am [Hz, depth], vel, pan
export function* sweep(m, mix, t, o) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const body = Math.round(o.dur * sr);
  const len = Math.min(body + Math.round((o.rel ?? 0.1) * sr), m.tmp.length, mix.big - at);
  if (len <= 0) return;
  const w = WAVES[o.wave ?? 'saw'];
  const kr = Math.pow(o.f1 / o.f0, 1 / body);
  const det = Math.pow(2, (o.det ?? 12) / 2400);
  const lp = o.lp ?? [1500, 1500];
  const q = o.q ?? 0.9;
  const bq = new Biquad('lowpass', lp[0], q, sr);
  const drive = o.drive || 0;
  const norm = drive ? 1 / Math.tanh(drive) : 1;
  const att = Math.max(2, Math.round((o.att ?? 0.02) * sr));
  const relLen = Math.max(1, len - body);
  const tmp = m.tmp;
  let f = o.f0;
  let p1 = m.r();
  let p2 = m.r();
  for (let b = 0; b < len; b += 1024) {
    const e = Math.min(len, b + 1024);
    for (let i = b; i < e; i++) {
      if (i < body) f *= kr;
      const d1 = f / det / sr;
      const d2 = (f * det) / sr;
      p1 += d1;
      if (p1 >= 1) p1 -= 1;
      p2 += d2;
      if (p2 >= 1) p2 -= 1;
      let s = 0.5 * (wave(w, p1, d1) + wave(w, p2, d2));
      if (drive) s = Math.tanh(drive * s) * norm;
      if ((i & 31) === 0) bq.set('lowpass', lp[0] + (lp[1] - lp[0]) * Math.min(1, i / body), q, sr);
      s = bq.run(s);
      let g = 1;
      if (i < att) g = i / att;
      if (i >= body) g *= Math.max(0, 1 - (i - body) / relLen);
      if (o.am) g *= 1 - o.am[1] + o.am[1] * (0.5 + 0.5 * Math.sin((TAU * o.am[0] * i) / sr));
      tmp[i] = s * g;
    }
    yield;
  }
  put(m, mix, at, len, o.vel ?? 1, o.pan ?? 0);
}

// A struck piece of iron (anvil, plate, chain): a click of noise and the inharmonic partials of a bar, ringing for tau
export function* clang(m, mix, t, f, vel = 1, tau = 0.5, pan = 0) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const len = Math.min(Math.round(Math.min(tau * 5, 3.2) * sr), m.tmp.length, mix.big - at);
  if (len <= 0) return;
  // the partials are written into a view of exactly the length used (modal() would otherwise ring on for 8 tau)
  const tmp = m.tmp.subarray(0, len);
  tmp.fill(0);
  modal(tmp, sr, 0, [[f, 1, tau], [f * 2.32, 0.7, tau * 0.75], [f * 4.25, 0.5, tau * 0.5], [f * 6.63, 0.3, tau * 0.35]], 0.6);
  const nz = m.nz.crash;
  for (let i = 0; i < 400 && i < len; i++) tmp[i] += nz[i] * Math.exp(-i / 70) * 0.8 * (i < 10 ? i / 10 : 1);
  const tail = Math.min(len >> 1, 600);
  for (let i = 0; i < tail; i++) tmp[len - 1 - i] *= i / tail;
  put(m, mix, at, len, vel, pan);
  yield;
}

// a sine/tri bell (a music box, a celesta): the note and a quiet twelfth above it
function* bellNote(m, mix, t, midi, vel, tau, pan = 0) {
  yield* note(m, mix, t, { midis: [midi], det: [0], wave: 'sine', att: 0.002, tau, rel: 0.1, dur: tau * 3.5, vel, pan });
  yield* note(m, mix, t, { midis: [midi + 19], det: [0], wave: 'sine', att: 0.002, tau: tau * 0.4, rel: 0.05, dur: tau * 1.5, vel: vel * 0.3, pan });
}

// ---------------------------------------------------------------- graveyard

// bass, organ voicing, choir voicing, bell arpeggio, lead [step, length in steps, midi]
const GRAVE = [
  { b: 37, org: [49, 56, 61, 64], ch: [61, 64, 68, 73], arp: [61, 64, 68, 73], lead: [[0, 6, 76], [6, 2, 75], [8, 8, 73]] },
  { b: 33, org: [45, 52, 57, 61], ch: [57, 61, 64, 69], arp: [57, 61, 64, 69], lead: [[0, 4, 73], [4, 4, 76], [8, 6, 81], [14, 2, 80]] },
  { b: 40, org: [40, 47, 52, 56], ch: [59, 64, 68, 71], arp: [64, 68, 71, 76], lead: [[0, 6, 80], [6, 2, 78], [8, 8, 76]] },
  { b: 35, org: [47, 54, 59, 63], ch: [59, 63, 66, 71], arp: [59, 63, 66, 71], lead: [[0, 4, 75], [4, 4, 78], [8, 8, 83]] },
  { b: 37, org: [49, 56, 61, 64], ch: [61, 64, 68, 73], arp: [61, 64, 68, 73], lead: [[0, 4, 73], [4, 4, 76], [8, 4, 80], [12, 4, 76]] },
  { b: 30, org: [42, 49, 54, 57], ch: [57, 61, 66, 69], arp: [57, 61, 66, 69], lead: [[0, 6, 78], [6, 2, 76], [8, 4, 73], [12, 4, 69]] },
  { b: 32, org: [44, 51, 56, 60], ch: [56, 60, 63, 68], arp: [56, 60, 63, 68], lead: [[0, 4, 72], [4, 4, 75], [8, 4, 80], [12, 4, 75]] },
  { b: 32, org: [44, 51, 56, 60], ch: [56, 60, 63, 68], arp: [56, 60, 63, 68], lead: [[0, 8, 80], [8, 4, 78], [12, 4, 75]] },
];

const GP = {
  kick: 'X..x..x.X..x..x.',
  hats: 'x.x.x.x.x.x.x.x.',
  bass: 'x.x.x.x.x.x.x.x.',
  snare: '....x.......x...',
  gtr: 'X.x.x.X.x.x.X.x.',
  hat16: '.x.x.x.x.x.x.x.x',
};

function* renderGraveyard() {
  const sr = SR;
  const r = seeded(4417);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 138 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(GRAVE.length * bar * sr);
  const big = n + Math.round(3.2 * sr);
  const A = new Mix(n, big);
  const B = new Mix(n, big);
  const C = new Mix(n, big);
  const PadA = new Mix(n, big);
  const PadB = new Mix(n, big);
  const Lead = new Mix(n, big);
  const pump = [beat, 0.4, 0.1];
  for (let b = 0; b < GRAVE.length; b++) {
    const ch = GRAVE[b];
    const t0 = b * bar;
    const hum = () => 0.85 + r() * 0.3;
    // --- A: the organ (reedy squares and a soft triangle an octave up) and a hushed choir under the beat
    yield* note(m, PadA, t0, { midis: ch.org, det: [-5, 5], wave: 'tri', att: 0.15, rel: 0.45, dur: bar * 0.98, lp: [1800, 1800, 1], q: 0.7, vib: [5.5, 0.004, 0.4], hp: 90, drive: 2.4, vel: 0.2, pan: -0.15 });
    yield* note(m, PadA, t0, { midis: ch.org.map((x) => x + 12), det: [0], wave: 'tri', att: 0.2, rel: 0.45, dur: bar * 0.98, vib: [5.5, 0.004, 0.4], vel: 0.12, pan: 0.15 });
    yield* choir(m, PadA, t0, { midis: ch.ch, dur: bar * 0.96, att: 0.7, rel: 0.6, vowel: ['oo', 'oh'], vel: 0.2 });
    // --- B: the full choir, rising from oo to ah over each bar, and the guitar's chug
    yield* choir(m, PadB, t0, { midis: ch.ch, dur: bar * 0.96, att: 0.55, rel: 0.6, vowel: ['oo', 'ah'], vel: 0.55, pan: -0.2 });
    yield* choir(m, PadB, t0, { midis: ch.ch.map((x) => x - 12), dur: bar * 0.96, att: 0.65, rel: 0.6, vowel: ['oh', 'oo'], vel: 0.3, pan: 0.2 });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      if (on(GP.kick, s)) yield* kick(m, A, t, GP.kick[s] === 'X' ? 1 : 0.8);
      if (on(GP.hats, s)) yield* hat(m, A, t, 0.42 * hum(), s === 14 && (b & 1) === 1, s % 4 === 2 ? 0.25 : -0.25);
      if (on(GP.bass, s)) {
        const up = s === 6 || s === 14 ? 12 : 0;
        yield* note(m, A, t, { midis: [ch.b + up], det: [-4, 4], wave: 'saw', att: 0.003, tau: 0.15, rel: 0.02, dur: step * 1.7, lp: [1000, 260, 0.07], q: 1.2, drive: 1.5, sub: 0.35, pump, vel: 0.8 * (up ? 0.7 : 1) });
      }
      if (on(GP.snare, s)) yield* snare(m, B, t, 1);
      if (on(GP.gtr, s)) {
        const open = GP.gtr[s] === 'X';
        const o = { midis: [ch.b + 12, ch.b + 19, ch.b + 24], wave: 'saw', att: 0.002, tau: open ? 0.45 : 0.05, rel: 0.025, dur: open ? step * 1.9 : step * 0.9, lp: [3000, 3000, 1], q: 0.8, hp: 80, drive: 6, vel: open ? 0.5 : 0.42 };
        yield* note(m, B, t, { ...o, det: [-5, 5], pan: -0.7 });
        yield* note(m, B, t, { ...o, det: [-8, 8], pan: 0.7 });
      }
      if ((b === 3 || b === 7) && s >= 12) yield* tom(m, B, t, [200, 165, 135, 100][s - 12], 0.65, [-0.4, -0.1, 0.2, 0.5][s - 12]);
      if (s === 0 && (b === 0 || b === 4)) yield* crash(m, B, t, b === 0 ? 0.8 : 0.6);
      // --- C: the eerie lead and the bells
      if (on(GP.hat16, s)) yield* hat(m, C, t, 0.26 * hum(), false, s % 4 === 1 ? -0.35 : 0.35);
      for (const [st, len, midi] of ch.lead) {
        if (st === s) yield* note(m, Lead, t, { midis: [midi], det: [-7, 7], wave: 'tri', att: 0.1, rel: 0.4, dur: len * step * 0.95, lp: [3200, 2200, 0.3], q: 1, vib: [5.4, 0.016, 0.35], drive: 1.1, vel: 0.55, pan: 0.05 });
      }
      if (s % 2 === 0) yield* bellNote(m, Lead, t, ch.arp[ARPS[s]] + 12, 0.2, 0.4, s % 4 ? 0.5 : -0.5);
      if (b === 7 && s === 8) yield* riser(m, C, t, step * 8, 0.9);
      yield;
    }
  }
  yield* reverb(PadA, sr, 0.28, 1.5, 0.84, 0.4);
  yield* reverb(PadB, sr, 0.3, 1.6, 0.85, 0.4);
  yield* pingpong(Lead, sr, step * 3, 0.42, 0.34);
  yield* reverb(Lead, sr, 0.22, 1.3, 0.84, 0.4);
  yield* addMix(A, PadA, 1);
  yield* addMix(B, PadB, 1);
  yield* addMix(C, Lead, 1);
  return { stems: [yield* fold(A), yield* fold(B), yield* fold(C)], sr, loop: true };
}

// ---------------------------------------------------------------- hell

const HELL = [
  { b: 33, lead: [[0, 2, 81], [2, 2, 82], [4, 4, 81], [8, 2, 84], [10, 2, 82], [12, 4, 81]] },
  { b: 33, lead: [[0, 4, 86], [4, 2, 85], [6, 2, 84], [8, 4, 82], [12, 4, 81]] },
  { b: 34, lead: [[0, 4, 82], [4, 4, 86], [8, 4, 85], [12, 4, 82]] },
  { b: 33, lead: [[0, 2, 84], [2, 2, 82], [4, 2, 81], [6, 2, 79], [8, 4, 81], [12, 4, 82]] },
  { b: 29, lead: [[0, 4, 84], [4, 4, 81], [8, 4, 77], [12, 4, 81]] },
  { b: 29, lead: [[0, 2, 84], [2, 2, 85], [4, 4, 84], [8, 4, 81], [12, 2, 77], [14, 2, 78]] },
  { b: 28, lead: [[0, 4, 83], [4, 4, 87], [8, 4, 83], [12, 4, 80]] },
  { b: 34, lead: [[0, 4, 85], [4, 4, 88], [8, 8, 87]] },
];

const HP = {
  kick: 'X.xxX.xxX.xxX.xx',
  hats: 'x.x.x.x.x.x.x.x.',
  snare: '....X.......X...',
  gallop: 'X.xxX.xxX.xxX.xx',
  chug: 'XxxxXxxxXxxxXxxx',
  dbl: '.x..x..x.x..x..x',
};

function* renderHell() {
  const sr = SR;
  const r = seeded(6663);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 176 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(HELL.length * bar * sr);
  const big = n + Math.round(2.8 * sr);
  const A = new Mix(n, big);
  const B = new Mix(n, big);
  const C = new Mix(n, big);
  const Lead = new Mix(n, big);
  for (let b = 0; b < HELL.length; b++) {
    const ch = HELL[b];
    const t0 = b * bar;
    const riffPat = b === 3 || b === 7 ? HP.chug : HP.gallop;
    // a low drone under it all: two detuned saws and a sine, and a dark pad a fifth up
    yield* note(m, A, t0, { midis: [ch.b + 12], det: [0], wave: 'sine', att: 0.01, rel: 0.1, dur: bar * 0.97, drive: 1.4, vel: 0.35 });
    yield* note(m, A, t0, { midis: [ch.b + 12, ch.b + 19], det: [-12, 12], wave: 'saw', att: 0.3, rel: 0.3, dur: bar * 0.98, lp: [420, 420, 1], q: 0.8, vel: 0.14 });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      const hum = 0.85 + r() * 0.3;
      // --- A: the drive: the kick and bass follow the riff
      if (on(HP.kick, s)) yield* kick(m, A, t, (HP.kick[s] === 'X' ? 1 : 0.8) * hum, { f0: 150, f1: 44, tau: 0.045, len: 0.14 });
      if (on(HP.hats, s)) yield* hat(m, A, t, 0.42 * hum, false, s % 4 === 2 ? 0.3 : -0.3);
      if (on(riffPat, s)) {
        const up = s === 14 ? 12 : 0;
        yield* note(m, A, t, { midis: [ch.b + up], det: [-4, 4], wave: 'saw', att: 0.002, tau: 0.09, rel: 0.015, dur: step * 0.95, lp: [1400, 300, 0.05], q: 1.2, drive: 2, vel: 0.7 });
      }
      // --- B: the weight: snare, toms and the riff on two hard-panned guitars
      if (on(HP.snare, s)) yield* snare(m, B, t, 1.15);
      if (on(riffPat, s)) {
        const open = riffPat[s] === 'X';
        const o = { midis: [ch.b + 12, ch.b + 19, ch.b + 24], wave: 'saw', att: 0.002, tau: open ? 0.3 : 0.04, rel: 0.02, dur: open ? step * 1.8 : step * 0.8, lp: [3400, 3400, 1], q: 0.8, hp: 80, drive: 10, vel: open ? 0.55 : 0.48 };
        yield* note(m, B, t, { ...o, det: [-5, 5], pan: -0.8 });
        yield* note(m, B, t, { ...o, det: [-9, 9], pan: 0.8 });
      }
      if ((b === 3 || b === 7) && s >= 12) yield* tom(m, B, t, [190, 160, 125, 90][s - 12], 0.8, [-0.5, -0.15, 0.2, 0.55][s - 12], 0.17);
      if (s === 0 && (b === 0 || b === 4)) yield* crash(m, B, t, 0.85);
      // --- C: the peak: a double kick in between, 16th hats and the scream of a lead
      if (on(HP.dbl, s)) yield* kick(m, C, t, 0.7 * hum, { f0: 140, f1: 44, tau: 0.04, len: 0.12 });
      if (s % 2 === 1) yield* hat(m, C, t, 0.3 * hum, false, s % 4 === 1 ? -0.4 : 0.4);
      for (const [st, len, midi] of ch.lead) {
        if (st === s) yield* note(m, Lead, t, { midis: [midi], det: [-9, 9], wave: 'saw', att: 0.008, rel: 0.05, dur: len * step * 0.93, lp: [6000, 3600, 0.2], q: 1.1, vib: [6.2, 0.02, 0.1], drive: 2.6, vel: 0.5, pan: 0.05 });
      }
      if ((b === 3 || b === 7) && s === 8) yield* sweep(m, C, t, { f0: 330, f1: 1250, dur: step * 7, rel: 0.1, lp: [900, 4500], drive: 2, am: [7, 0.3], vel: 0.38 });
      if (s === 0 && b === 4) yield* crash(m, C, t, 0.7, 3);
      yield;
    }
  }
  yield* pingpong(Lead, sr, step * 3, 0.3, 0.2);
  yield* reverb(Lead, sr, 0.1, 0.9);
  yield* addMix(C, Lead, 1);
  return { stems: [yield* fold(A), yield* fold(B), yield* fold(C)], sr, loop: true };
}

// ---------------------------------------------------------------- boss2: the Golden Demon

// bass, strings voicing, choir voicing, lead
const GOLD = [
  { b: 42, str: [42, 49, 54, 57, 61, 66], ch: [54, 57, 61, 66, 69], arp: [66, 69, 73, 78], lead: [[0, 4, 73], [4, 4, 78], [8, 4, 76], [12, 4, 73]] },
  { b: 42, str: [42, 49, 54, 57, 61, 66], ch: [54, 57, 61, 66, 69], arp: [66, 69, 73, 78], lead: [[0, 6, 73], [6, 2, 76], [8, 4, 74], [12, 4, 73]] },
  { b: 38, str: [38, 45, 50, 54, 57, 62], ch: [50, 54, 57, 62, 66], arp: [62, 66, 69, 74], lead: [[0, 4, 74], [4, 4, 78], [8, 4, 81], [12, 4, 78]] },
  { b: 37, str: [37, 44, 49, 52, 56, 61], ch: [49, 52, 56, 61, 64], arp: [61, 64, 68, 73], lead: [[0, 4, 76], [4, 4, 80], [8, 6, 76], [14, 2, 73]] },
  { b: 42, str: [42, 49, 54, 57, 61, 66], ch: [54, 57, 61, 66, 69], arp: [66, 69, 73, 78], lead: [[0, 4, 78], [4, 2, 80], [6, 2, 81], [8, 4, 85], [12, 4, 81]] },
  { b: 38, str: [38, 45, 50, 54, 57, 62], ch: [50, 54, 57, 62, 66], arp: [62, 66, 69, 74], lead: [[0, 4, 81], [4, 4, 78], [8, 4, 74], [12, 4, 78]] },
  { b: 35, str: [35, 42, 47, 50, 54, 59], ch: [47, 50, 54, 59, 62], arp: [59, 62, 66, 71], lead: [[0, 4, 79], [4, 4, 78], [8, 4, 74], [12, 4, 71]] },
  { b: 37, str: [37, 44, 49, 53, 56, 61], ch: [49, 53, 56, 61, 65], arp: [61, 65, 68, 73], lead: [[0, 4, 77], [4, 4, 80], [8, 8, 85]] },
];

const BP2 = {
  taiko: 'X.......x.......',
  kick: 'X...x...x...x...',
  snare: '....X.......X...',
  vln: 'x.xxx.xxx.xxx.xx',
};

function* renderGold() {
  const sr = SR;
  const r = seeded(8821);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 108 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(GOLD.length * bar * sr);
  const big = n + Math.round(3.4 * sr);
  const A = new Mix(n, big);
  const B = new Mix(n, big);
  const C = new Mix(n, big);
  const PadA = new Mix(n, big);
  const PadB = new Mix(n, big);
  const Lead = new Mix(n, big);
  for (let b = 0; b < GOLD.length; b++) {
    const ch = GOLD[b];
    const t0 = b * bar;
    // --- A: a sub drone, low strings and organ (a held chord of detuned saws, slowly opening) under the timpani
    yield* note(m, A, t0, { midis: [ch.b], det: [0], wave: 'sine', att: 0.02, rel: 0.2, dur: bar * 0.98, drive: 1.3, vel: 0.7 });
    yield* note(m, PadA, t0, { midis: ch.str, det: [-12, 4], wave: 'saw', att: 0.5, rel: 0.6, dur: bar * 0.98, lp: [700, 1500, 0.9], q: 0.8, vel: 0.17, pan: -0.5 });
    yield* note(m, PadA, t0, { midis: ch.str, det: [-4, 12], wave: 'saw', att: 0.5, rel: 0.6, dur: bar * 0.98, lp: [700, 1500, 0.9], q: 0.8, vel: 0.17, pan: 0.5 });
    yield* note(m, PadA, t0, { midis: ch.str.slice(2).map((x) => x + 12), det: [0], wave: 'tri', att: 0.3, rel: 0.5, dur: bar * 0.98, lp: [1500, 1500, 1], vib: [5, 0.004, 0.5], drive: 2.2, vel: 0.12 });
    // --- B: the choir in five voices, a voice an octave below it, and stabs of brass
    yield* choir(m, PadB, t0, { midis: ch.ch, dur: bar * 0.96, att: 0.4, rel: 0.7, vowel: ['oh', 'ah'], vel: 0.6, pan: -0.15 });
    yield* choir(m, PadB, t0, { midis: ch.ch.slice(0, 3).map((x) => x - 12), dur: bar * 0.96, att: 0.5, rel: 0.7, vowel: ['oo', 'oh'], vel: 0.4, pan: 0.15 });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      const hum = 0.85 + r() * 0.3;
      if (on(BP2.taiko, s)) yield* tom(m, A, t, 66, 0.9 * (BP2.taiko[s] === 'X' ? 1 : 0.8), 0, 0.34);
      if (on(BP2.kick, s)) yield* kick(m, A, t, 0.4 * hum, { f0: 120, f1: 48, tau: 0.09, len: 0.25 });
      if (s % 4 === 2) yield* hat(m, A, t, 0.22 * hum, false, s % 8 === 2 ? 0.3 : -0.3);
      if (on(BP2.snare, s)) yield* snare(m, B, t, 1.2);
      if (s === 0 && (b & 1) === 0) {
        yield* note(m, B, t, { midis: ch.str.slice(1, 5).map((x) => x + 12), det: [-12, 12], wave: 'saw', att: 0.04, tau: 0.8, rel: 0.3, dur: beat * 2, lp: [800, 3800, 0.14], q: 1, drive: 1.4, vel: 0.5 });
      }
      if (s === 8 && b === 3) yield* note(m, B, t, { midis: [52, 59, 64], det: [-12, 12], wave: 'saw', att: 0.02, tau: 0.3, rel: 0.2, dur: beat, lp: [600, 3000, 0.1], q: 1, drive: 1.4, vel: 0.5 });
      if ((b === 3 || b === 7) && s >= 12) yield* tom(m, B, t, [170, 140, 110, 85][s - 12], 0.8, [-0.4, -0.1, 0.2, 0.5][s - 12], 0.22);
      if (s === 0 && (b === 0 || b === 4)) yield* crash(m, B, t, 0.9, 3);
      // --- C: gold: bells in fifths running up the chord, a staccato violin ostinato, the lead
      if (s % 2 === 0) yield* bellNote(m, Lead, t, ch.arp[(s >> 1) & 3] + (s >= 8 ? 12 : 0), 0.22, 0.45, s % 4 ? 0.5 : -0.5);
      if (on(BP2.vln, s)) {
        const midi = ch.arp[(s >> 2) & 3] - 12;
        yield* note(m, C, t, { midis: [midi], det: [-8, 8], wave: 'saw', att: 0.004, tau: 0.045, rel: 0.02, dur: step * 0.8, lp: [3600, 1300, 0.05], q: 1, vel: 0.3, pan: s % 4 ? 0.35 : -0.35 });
      }
      for (const [st, len, midi] of ch.lead) {
        if (st === s) yield* note(m, Lead, t, { midis: [midi, midi + 12], det: [-7, 7], wave: 'saw', att: 0.03, rel: 0.2, dur: len * step * 0.95, lp: [4200, 2800, 0.3], q: 1, vib: [5.6, 0.014, 0.25], drive: 1.5, vel: 0.5, pan: 0.05 });
      }
      if ((b === 3 || b === 7) && s === 8) yield* riser(m, C, t, step * 8, 0.9);
      yield;
    }
  }
  yield* reverb(PadA, sr, 0.2, 1.4, 0.85, 0.4);
  yield* reverb(PadB, sr, 0.3, 1.8, 0.86, 0.4);
  yield* pingpong(Lead, sr, step * 3, 0.38, 0.3);
  yield* reverb(Lead, sr, 0.2, 1.2, 0.84, 0.4);
  yield* addMix(A, PadA, 1);
  yield* addMix(B, PadB, 1);
  yield* addMix(C, Lead, 1);
  return { stems: [yield* fold(A), yield* fold(B), yield* fold(C)], sr, loop: true };
}

// ---------------------------------------------------------------- boss3: the Abomination

const ABOM = [
  { b: 36, lead: [[0, 8, 72], [8, 4, 73], [12, 4, 72]] },
  { b: 37, lead: [[0, 6, 73], [6, 2, 72], [8, 8, 75]] },
  { b: 36, lead: [[0, 8, 75], [8, 4, 73], [12, 4, 72]] },
  { b: 32, lead: [[0, 6, 72], [6, 2, 75], [8, 8, 68]] },
  { b: 31, lead: [[0, 8, 74], [8, 4, 71], [12, 4, 74]] },
  { b: 30, lead: [[0, 8, 73], [8, 8, 72]] },
];

const AP = {
  kick: 'X.....x.........',
  snare: '........X.......',
  chug: '..x.x...x.x.x...',
  clank: 'x...x...x...x...',
};

function* renderAbom() {
  const sr = SR;
  const r = seeded(3013);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 72 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(ABOM.length * bar * sr);
  const big = n + Math.round(3.4 * sr);
  const A = new Mix(n, big);
  const B = new Mix(n, big);
  const C = new Mix(n, big);
  const PadB = new Mix(n, big);
  const Lead = new Mix(n, big);
  const pump = [beat * 2, 0.35, 0.2];
  for (let b = 0; b < ABOM.length; b++) {
    const ch = ABOM[b];
    const t0 = b * bar;
    // --- A: sub, a drone that groans down every other bar, kicks the size of a house and an anvil
    yield* note(m, A, t0, { midis: [ch.b], det: [0], wave: 'sine', att: 0.01, rel: 0.2, dur: bar * 0.98, drive: 1.6, pump, vel: 0.55 });
    yield* note(m, A, t0, { midis: [ch.b + 12, ch.b + 19], det: [-14, 14], wave: 'saw', att: 0.4, rel: 0.5, dur: bar * 0.98, lp: [380, 380, 1], q: 0.9, drive: 1.3, pump, vel: 0.2 });
    if (b & 1) yield* sweep(m, A, t0 + bar * 0.45, { f0: 110, f1: 46, dur: bar * 0.5, rel: 0.3, att: 0.15, lp: [700, 220], drive: 1.8, am: [3, 0.4], vel: 0.4 });
    yield* clang(m, A, t0, 98, 0.7, 0.9);
    // --- B: guitars as one long hit per bar, with a low choir moaning above them
    const o = { midis: [ch.b, ch.b + 7, ch.b + 12], wave: 'saw', att: 0.003, tau: 1.3, rel: 0.2, dur: bar * 0.9, lp: [2600, 700, 0.9], q: 0.8, hp: 55, drive: 8, vel: 0.62 };
    yield* note(m, B, t0, { ...o, det: [-6, 6], pan: -0.8 });
    yield* note(m, B, t0, { ...o, det: [-10, 10], pan: 0.8 });
    yield* choir(m, PadB, t0, { midis: [ch.b + 12, ch.b + 19, ch.b + 24, ch.b + 27], dur: bar * 0.94, att: 0.9, rel: 0.7, vowel: ['oh', 'oo'], vel: 0.55, vib: [4.4, 0.012] });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      if (on(AP.kick, s)) yield* kick(m, A, t, 1.0, { f0: 120, f1: 44, tau: 0.16, len: 0.5 });
      if (on(AP.snare, s)) yield* snare(m, B, t, 1.3);
      if (on(AP.snare, s)) yield* tom(m, B, t, 58, 1, 0, 0.5);
      if (on(AP.chug, s)) {
        const p = { midis: [ch.b, ch.b + 7], wave: 'saw', att: 0.002, tau: 0.06, rel: 0.03, dur: step * 0.9, lp: [2200, 2200, 1], q: 0.8, hp: 55, drive: 9, vel: 0.5 };
        yield* note(m, B, t, { ...p, det: [-6, 6], pan: -0.75 });
        yield* note(m, B, t, { ...p, det: [-9, 9], pan: 0.75 });
      }
      if (b === 2 && s >= 12) yield* tom(m, B, t, [120, 100, 80, 64][s - 12], 0.9, [-0.4, -0.1, 0.2, 0.5][s - 12], 0.4);
      if (s === 0 && (b === 0 || b === 3)) yield* crash(m, B, t, 0.8, 3.2);
      // --- C: iron and torment: chains and plates on the quarter notes, a cluster of notes a semitone apart, the lead
      if (on(AP.clank, s)) yield* clang(m, C, t + (s % 8 === 4 ? step * 0.5 : 0), s % 8 === 4 ? 410 : 290, 0.5, 0.3, s % 8 === 4 ? 0.4 : -0.4);
      if (s === 0) yield* note(m, Lead, t, { midis: [ch.b + 36, ch.b + 37, ch.b + 39], det: [-10, 10], wave: 'saw', att: 0.8, rel: 0.8, dur: bar * 0.9, lp: [1400, 2200, 1.2], q: 1, vib: [4.8, 0.02, 0.4], vel: 0.2, pan: 0.3 });
      for (const [st, len, midi] of ch.lead) {
        if (st === s) yield* note(m, Lead, t, { midis: [midi], det: [-12, 12], wave: 'saw', att: 0.08, rel: 0.5, dur: len * step * 0.96, lp: [2600, 1500, 0.5], q: 1.2, vib: [4.6, 0.025, 0.2], drive: 2, vel: 0.4, pan: -0.1 });
      }
      if (b === 5 && s === 8) yield* riser(m, C, t, step * 8, 1);
      yield;
    }
  }
  yield* reverb(PadB, sr, 0.3, 1.8, 0.87, 0.45);
  yield* pingpong(Lead, sr, step * 3, 0.35, 0.28);
  yield* reverb(Lead, sr, 0.2, 1.5, 0.86, 0.45);
  yield* addMix(B, PadB, 1);
  yield* addMix(C, Lead, 1);
  return { stems: [yield* fold(A), yield* fold(B), yield* fold(C)], sr, loop: true };
}

// ---------------------------------------------------------------- endless

const ENDLESS = [
  { b: 35, arp: [59, 62, 66, 71], lead: [[0, 2, 78], [2, 2, 79], [4, 4, 78], [8, 4, 74], [12, 4, 71]] },
  { b: 31, arp: [55, 59, 62, 67], lead: [[0, 2, 79], [2, 2, 78], [4, 4, 74], [8, 4, 71], [12, 4, 74]] },
  { b: 38, arp: [62, 66, 69, 74], lead: [[0, 4, 81], [4, 4, 78], [8, 2, 74], [10, 2, 78], [12, 4, 81]] },
  { b: 33, arp: [57, 61, 64, 69], lead: [[0, 2, 81], [2, 2, 83], [4, 4, 85], [8, 4, 81], [12, 4, 76]] },
  { b: 35, arp: [59, 62, 66, 71], lead: [[0, 2, 78], [2, 2, 79], [4, 4, 78], [8, 4, 83], [12, 4, 78]] },
  { b: 31, arp: [55, 59, 62, 67], lead: [[0, 4, 83], [4, 2, 81], [6, 2, 79], [8, 4, 74], [12, 4, 79]] },
  { b: 33, arp: [57, 61, 64, 69], lead: [[0, 2, 85], [2, 2, 83], [4, 4, 81], [8, 4, 76], [12, 4, 81]] },
  { b: 30, arp: [54, 58, 61, 66], lead: [[0, 4, 85], [4, 4, 82], [8, 8, 78]] },
];

const EP = {
  kick: 'X...X...X...X...',
  hats: '..x...x...x...x.',
  bass: 'xxxxxxxxxxxxxxxx',
  snare: '....X.......X...',
  gtr: 'X.x.x.x.X.x.x.x.',
  hat16: 'xxxxxxxxxxxxxxxx',
};

function* renderEndless() {
  const sr = SR;
  const r = seeded(9091);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 164 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(ENDLESS.length * bar * sr);
  const big = n + Math.round(2.8 * sr);
  const A = new Mix(n, big);
  const B = new Mix(n, big);
  const C = new Mix(n, big);
  const D = new Mix(n, big);
  const Lead = new Mix(n, big);
  const pump = [beat, 0.45, 0.1];
  for (let b = 0; b < ENDLESS.length; b++) {
    const ch = ENDLESS[b];
    const t0 = b * bar;
    // a dark pad holds each bar together
    yield* note(m, A, t0, { midis: [ch.b + 12, ch.b + 19, ch.b + 24], det: [-12, 5], wave: 'saw', att: 0.25, rel: 0.4, dur: bar * 0.98, lp: [700, 700, 1], q: 0.7, pump, vel: 0.17, pan: -0.5 });
    yield* note(m, A, t0, { midis: [ch.b + 12, ch.b + 19, ch.b + 24], det: [-5, 12], wave: 'saw', att: 0.25, rel: 0.4, dur: bar * 0.98, lp: [700, 700, 1], q: 0.7, pump, vel: 0.17, pan: 0.5 });
    // D: the peak chord on a choir, stabbed on the first beat
    yield* choir(m, D, t0, { midis: [ch.b + 24, ch.b + 31, ch.b + 36], dur: beat * 1.5, att: 0.03, rel: 0.5, vowel: ['ah', 'oh'], vel: 0.55, vib: [6, 0.012] });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      const hum = 0.85 + r() * 0.3;
      // --- A: the pulse: four on the floor, a 16th bass
      if (on(EP.kick, s)) yield* kick(m, A, t, 1, { f0: 160, f1: 44, tau: 0.08 });
      if (on(EP.hats, s)) yield* hat(m, A, t, 0.45 * hum, s === 14, 0.3);
      if (on(EP.bass, s)) {
        const up = s % 8 === 6 ? 12 : s % 4 === 3 ? 7 : 0;
        yield* note(m, A, t, { midis: [ch.b + up], det: [-4, 4], wave: 'saw', att: 0.002, tau: 0.1, rel: 0.015, dur: step * 0.9, lp: [1300, 260, 0.05], q: 1.2, drive: 1.7, pump, vel: 0.62 * (up ? 0.8 : 1) });
      }
      // --- B: the weight: snare and clap, the guitar
      if (on(EP.snare, s)) {
        yield* snare(m, B, t, 1.1);
        yield* snare(m, B, t + 0.004, 0.4, 0.2);
      }
      if (on(EP.gtr, s)) {
        const open = EP.gtr[s] === 'X';
        const o = { midis: [ch.b + 12, ch.b + 19, ch.b + 24], wave: 'saw', att: 0.002, tau: open ? 0.4 : 0.045, rel: 0.02, dur: open ? step * 1.9 : step * 0.85, lp: [3400, 3400, 1], q: 0.8, hp: 80, drive: 8, vel: open ? 0.55 : 0.47 };
        yield* note(m, B, t, { ...o, det: [-5, 5], pan: -0.75 });
        yield* note(m, B, t, { ...o, det: [-8, 8], pan: 0.75 });
      }
      if ((b & 3) === 3 && s >= 12) yield* tom(m, B, t, [200, 165, 135, 100][s - 12], 0.7, [-0.4, -0.1, 0.2, 0.5][s - 12], 0.17);
      if (s === 0 && (b & 1) === 0) yield* crash(m, B, t, 0.7);
      // --- C: the arpeggio and the lead riff
      yield* note(m, C, t, { midis: [ch.arp[ARPS[s]] + 12], det: [-6, 6], wave: 'saw', att: 0.002, tau: 0.06, rel: 0.02, dur: step * 0.9, lp: [4600, 1000, 0.05], vel: 0.3, pan: s % 2 ? 0.5 : -0.5 });
      for (const [st, len, midi] of ch.lead) {
        if (st === s) yield* note(m, Lead, t, { midis: [midi], det: [-6, 6], wave: 'square', att: 0.01, rel: 0.06, dur: len * step * 0.92, lp: [5400, 3000, 0.25], q: 1, vib: [5.8, 0.01, 0.12], drive: 1.3, vel: 0.5, pan: 0.05 });
      }
      // --- D: double-time hats, snare rolls into the turn, a siren climbing on the last beats, risers
      if (on(EP.hat16, s)) yield* hat(m, D, t, 0.26 * hum, false, s % 2 ? 0.4 : -0.4);
      if ((b & 3) === 3 && s >= 8 && s % 2 === 0) yield* snare(m, D, t, 0.4 + 0.08 * (s - 8), 0);
      if ((b & 3) === 3 && s === 8) yield* riser(m, D, t, step * 8, 0.9);
      if (b === 7 && s === 0) yield* sweep(m, D, t, { f0: 440, f1: 1760, dur: bar * 0.95, rel: 0.1, att: 0.1, lp: [1200, 5200], drive: 1.6, am: [6, 0.25], vel: 0.22 });
      yield;
    }
  }
  yield* pingpong(Lead, sr, step * 3, 0.32, 0.22);
  yield* reverb(Lead, sr, 0.1, 0.9);
  yield* addMix(C, Lead, 1);
  return { stems: [yield* fold(A), yield* fold(B), yield* fold(C), yield* fold(D)], sr, loop: true };
}

// ---------------------------------------------------------------- the table

// mix(i): the gain of each stem at intensity i; trim(i): the track's overall gain. lazy: lib.js holds the track back until it is wanted.
export const TRACKS2 = {
  graveyard: { render: renderGraveyard, loop: true, lazy: true, mix: (i) => [1.7, 1.1 * sm(0.1, 0.5, i), 0.85 * sm(0.5, 0.9, i)], trim: (i) => 1.1 - 0.25 * i },
  hell: { render: renderHell, loop: true, lazy: true, mix: (i) => [1.7, 1.1 * sm(0.1, 0.5, i), 0.9 * sm(0.45, 0.85, i)], trim: (i) => 1.1 - 0.25 * i },
  boss2: { render: renderGold, loop: true, lazy: true, mix: (i) => [1, 1, 0.65 + 0.35 * i], trim: () => 1.1 },
  boss3: { render: renderAbom, loop: true, lazy: true, mix: (i) => [1, 1, 0.6 + 0.4 * i], trim: () => 1.1 },
  endless: {
    render: renderEndless, loop: true, lazy: true,
    mix: (i) => [1.7, 1.1 * sm(0.05, 0.4, i), 1.0 * sm(0.3, 0.65, i), 0.9 * sm(0.6, 0.95, i)],
    trim: (i) => 1.15 - 0.3 * i,
  },
};
