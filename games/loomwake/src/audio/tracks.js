// Loomwake's procedural score. Each track is { bpm, spb (16ths per bar), room,
// wet, root (for stingers), step(m) }, and step is called once per 16th note
// with m = { E, t, s, bar, pos, sd, bd, L: stems, on(stem), i, phase, r, st }.
//
// Leitmotif: the Weaver's motif (D minor, 3/4): A - F | E D E | F - G | E . . .
// It ends on the second degree, unresolved, everywhere in the game; the ending
// themes finally resolve it to D major. Sable's motif is its mirror image
// (the same intervals turned upside down), and in his second phase, and in the
// true ending, the two are played together: two halves of one thread.
//
// Regions: Glasswood (A dorian, harp and celesta over warm pads), the Drowned
// Choir (C minor 6/8, formant choir and bells), the Sunken Forge (F phrygian,
// anvils and brass), the Unwoven (B minor, detuned fraying strings).
import * as K from './synth.js';

const CH = {
  m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], 7: [0, 4, 7, 10], sus4: [0, 5, 7], sus2: [0, 2, 7],
  add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14], madd9: [0, 3, 7, 14], dim: [0, 3, 6],
};
const mod = (a, n) => ((a % n) + n) % n;
// chord tones around `base` (root lands within base-5..base+6)
function voice(base, root, type) {
  let r = base + mod(root, 12); if (r > base + 6) r -= 12;
  return CH[type].map((x) => r + x);
}
function bassOf(base, root) { let r = base + mod(root, 12); if (r > base + 6) r -= 12; return r; }
// melody table: [[pos, midi, steps], ...] per bar -> lookup
function mel(bars) { return bars.map((b) => { const o = {}; for (const [p, n, d] of b) o[p] = [n, d]; return o; }); }
const at = (M, bar, pos) => M[mod(bar, M.length)][pos];

// ======================================================================
// The lullaby family: hub, title, memory, ending, ending_true
// ======================================================================
const HUB_PROG = [[0, 'm'], [-4, 'M'], [5, 'm'], [7, 'M'], [0, 'm'], [3, 'M'], [5, 'madd9'], [7, 'sus4']];
const END_PROG = [[0, 'M'], [-3, 'm'], [5, 'M'], [7, 'M'], [0, 'M'], [5, 'M'], [2, 'm'], [7, 'sus4']];
// The Weaver's motif in 3/4 (12 steps a bar), D minor.
const WEAVER = mel([
  [[0, 69, 8], [8, 65, 4]], [[0, 64, 4], [4, 62, 4], [8, 64, 4]], [[0, 65, 8], [8, 67, 4]], [[0, 64, 12]],
  [[0, 69, 4], [4, 74, 4], [8, 72, 4]], [[0, 69, 8], [8, 65, 4]], [[0, 67, 4], [4, 70, 4], [8, 69, 4]], [[0, 67, 4], [4, 65, 4], [8, 64, 4]],
]);
// ...and resolved, in D major.
const WEAVER_RESOLVED = mel([
  [[0, 69, 8], [8, 66, 4]], [[0, 64, 4], [4, 62, 4], [8, 64, 4]], [[0, 66, 8], [8, 67, 4]], [[0, 64, 8], [8, 69, 4]],
  [[0, 69, 4], [4, 74, 4], [8, 73, 4]], [[0, 71, 8], [8, 67, 4]], [[0, 67, 4], [4, 71, 4], [8, 69, 4]], [[0, 66, 4], [4, 64, 4], [8, 62, 4]],
]);
// Sable's mirror of it (intervals inverted), in D major for the braid.
const SABLE_BRAID = mel([
  [[0, 55, 8], [8, 59, 4]], [[0, 60, 4], [4, 62, 4], [8, 60, 4]], [[0, 59, 8], [8, 57, 4]], [[0, 61, 12]],
  [[0, 55, 4], [4, 50, 4], [8, 52, 4]], [[0, 55, 8], [8, 59, 4]], [[0, 57, 4], [4, 54, 4], [8, 55, 4]], [[0, 57, 4], [4, 59, 4], [8, 61, 4]],
]);

function lullaby(o) {
  return {
    bpm: o.bpm, spb: 12, room: o.room, wet: o.wet ?? 0.45, root: 62, gain: o.gain ?? 1,
    levels: () => ({ base: 1, motion: 1, drive: o.drive ?? 0, peak: o.peak ?? 0 }),
    step(m) {
      const { E, t, L, pos, sd, bd } = m;
      const end = o.end || o.braid;
      const cyc = end ? 18 : 32;
      const b = m.bar % cyc, b8 = b % 8, sec = Math.floor(b / 8);
      const cad = end && b >= 16; // two-bar resolution
      const prog = end ? END_PROG : HUB_PROG;
      const [root, type] = cad ? [0, 'M'] : prog[b8];
      const melTab = end ? WEAVER_RESOLVED : WEAVER;
      if (pos === 0) {
        const ch = voice(57, root, type);
        K.pad(E, t, L.base, ch, bd * 1.05, o.padVel ?? 0.6, { bright: o.bright ?? 950, a: bd * 0.3, r: bd * 0.6 });
        if (!o.noBass) K.bass(E, t, L.base, bassOf(38, root), bd * 0.95, 0.4, { type: 'sine', bright: 280 });
        if (end && b8 === 0) K.bell(E, t, L.base, 86, 0.25, { d: 4 });
        if (cad && b === 16) { K.choir(E, t, L.motion, [62, 66, 69, 74], bd * 2, 0.7, { vowel: 'a', a: 0.8, r: 2 }); K.bell(E, t, L.base, 74, 0.45, { d: 5 }); }
        if (o.braid && sec === 1) K.choir(E, t, L.motion, voice(62, root, type), bd, 0.45, { vowel: 'o', a: 0.6, r: 1 });
      }
      // harp: broken chord in eighths
      if (!o.noHarp && m.on('motion') && pos % 2 === 0 && !(o.sparseHarp && sec === 0 && pos > 4)) {
        const ch = voice(62, root, type), seq = [0, 1, 2, 3, 2, 1];
        const tones = [ch[0], ch[1], ch[2], ch[0] + 12];
        const n = tones[seq[pos / 2]] + (sec === 1 && !end ? 12 : 0);
        K.harp(E, t, L.motion, n, (pos === 0 ? 0.42 : 0.3) * (o.harpVel ?? 1), { len: 2.4 });
      }
      // melody
      const melodyOn = end ? (cad ? false : true) : (o.melodyAll ? sec !== 2 : sec === 0 || sec === 1 || sec === 3);
      if (melodyOn) {
        const note = at(melTab, b8, pos);
        if (note) {
          const [n, d] = note;
          const inst = (end && sec === 1) || (!end && sec === 1) ? K.celesta : K.musicBox;
          const up = (!end && sec === 1) || (end && sec === 1) ? 12 : 0;
          inst(E, t, L.base, n + up, o.melVel ?? 0.7, { d: Math.max(1.2, d * sd * 1.6), detune: o.haze ? (m.r() - 0.5) * 24 : 0 });
          // the harp answers the melody a beat later, an octave down (an echo of the thread)
          if (!end && sec === 3 && !o.noHarp) K.harp(E, t + sd * 4, L.motion, n - 12, 0.28, { len: 2 });
        }
        if (cad && pos === 0 && b === 16) K.celesta(E, t, L.base, 74, 0.7, { d: 4 });
      }
      if (cad && pos === 0 && b === 17) K.musicBox(E, t, L.base, 62, 0.6, { d: 4 });
      // the true ending: Sable's mirror motif braided under the Weaver's
      if (o.braid && sec === 1 && !cad) {
        const s = at(SABLE_BRAID, b8, pos);
        if (s) K.strings(E, t, L.motion, [s[0] + 12], s[1] * sd * 1.1, 0.75, { a: 0.12, r: 0.6, bright: 2400 });
      }
      // title and memory: a faint wind of thread
      if (o.air && pos === 0 && b % 4 === 0) K.noise(E, t, L.base, { color: 'pink', f: 700, f1: 1500, q: 2, a: bd * 1.5, hold: 0.2, r: bd * 1.5, peak: 0.035 });
    },
  };
}

// ======================================================================
// Glasswood Shallows: A dorian, 88 bpm. Harp and celesta over warm pads.
// ======================================================================
const GW_PROG = [[0, 'm9'], [5, 'add9'], [-4, 'M7'], [-2, 'add9'], [0, 'm7'], [5, 'M'], [7, 'm7'], [-2, 'sus4']];
const GW_MEL = mel([
  [[0, 76, 6], [6, 72, 2], [8, 71, 4], [12, 69, 4]], [[0, 71, 4], [4, 72, 4], [8, 74, 8]],
  [[0, 72, 6], [6, 69, 2], [8, 76, 8]], [[0, 74, 4], [4, 71, 4], [8, 74, 4], [12, 79, 4]],
  [[0, 81, 6], [6, 79, 2], [8, 76, 8]], [[0, 78, 4], [4, 76, 4], [8, 74, 8]],
  [[0, 76, 4], [4, 74, 4], [8, 71, 4], [12, 67, 4]], [[0, 69, 16]],
]);
const glasswood = {
  bpm: 88, spb: 16, room: 'glasswood', wet: 0.4, root: 57,
  step(m) {
    const { E, t, L, pos, sd, bd, r } = m;
    const b = m.bar % 8, [root, type] = GW_PROG[b];
    if (pos === 0) {
      K.pad(E, t, L.base, voice(60, root, type), bd * 1.05, 0.55, { bright: 1300, a: 0.6, r: 1.2 });
      K.bass(E, t, L.base, bassOf(45, root), bd * 0.5, 0.42, { type: 'sine', bright: 300 });
    }
    if (pos === 8 && !m.on('drive')) K.bass(E, t, L.base, bassOf(45, root), bd * 0.45, 0.32, { type: 'sine', bright: 300 });
    // glass twinkles: sparse celesta on chord tones
    if (pos % 2 === 0 && r() < 0.13) { const ch = voice(81, root, type); K.celesta(E, t, L.base, ch[(r() * ch.length) | 0], 0.32 + r() * 0.2, { d: 1.6 }); }
    // motion: rippling harp arpeggio
    if (m.on('motion')) {
      const ch = voice(64, root, type), tones = [ch[0] - 12, ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12];
      const seq = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 2];
      const n = tones[Math.min(seq[pos], tones.length - 1)];
      if (pos % 2 === 0 || m.i > 0.5) K.harp(E, t, L.motion, n, pos % 4 === 0 ? 0.42 : 0.28, { len: 1.8 });
    }
    // drive: soft taiko, shaker, plucked bass, glass on the backbeat
    if (m.on('drive')) {
      if (pos === 0 || pos === 10) K.taiko(E, t, L.drive, pos === 0 ? 0.55 : 0.4, { f: 85 });
      if (pos === 6) K.tom(E, t, L.drive, 0.3, { f: 150 });
      if (pos % 2 === 0) K.shaker(E, t, L.drive, pos % 4 === 0 ? 0.35 : 0.22);
      if (pos === 4 || pos === 12) K.glass(E, t, L.drive, 93 + (pos === 12 ? 2 : 0), 0.55, { d: 0.35 });
      if (pos % 2 === 0) { const bn = bassOf(45, root), pat = [0, 0, 7, 12, 0, 7, 10, 7]; K.harp(E, t, L.drive, bn + pat[pos / 2], 0.5, { len: 0.9, bright: 0.35, d: sd * 2.5, lp: 1400 }); }
    }
    // peak: the Glasswood theme on celesta, hats, taiko fills
    if (m.on('peak')) {
      const note = at(GW_MEL, b, pos);
      if (note) { K.celesta(E, t, L.peak, note[0], 0.8, { d: Math.max(0.8, note[1] * sd * 1.5) }); K.glass(E, t, L.peak, note[0] + 12, 0.25, { d: 0.6 }); }
      if (pos % 2 === 1) K.hat(E, t, L.peak, 0.18);
      if (b === 7 && pos >= 12) K.taiko(E, t, L.peak, 0.35 + (pos - 12) * 0.08, { f: 100 + (pos - 12) * 12 });
    }
  },
};

// ======================================================================
// The Drowned Choir: C minor, 6/8 (12 steps a bar), slow. Choir, bells, water.
// ======================================================================
const DC_PROG = [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M'], [0, 'm'], [5, 'm'], [-4, 'M'], [-5, 'M']];
const DC_MEL = mel([ // the Weaver's motif, transposed and stretched over two-bar chords
  [[0, 67, 12]], [[0, 63, 12]], [[0, 62, 6], [6, 60, 6]], [[0, 62, 12]], [[0, 63, 12]], [[0, 65, 12]], [[0, 62, 12]], [],
  [[0, 67, 6], [6, 72, 6]], [[0, 70, 12]], [[0, 67, 12]], [[0, 63, 12]], [[0, 65, 6], [6, 68, 6]], [[0, 67, 12]], [[0, 65, 6], [6, 63, 6]], [[0, 62, 12]],
]);
const choir = {
  bpm: 75, spb: 12, room: 'choir', wet: 0.6, root: 60,
  step(m) {
    const { E, t, L, pos, sd, bd, r } = m;
    const b = m.bar % 16, ci = b >> 1, [root, type] = DC_PROG[ci];
    if (pos === 0 && b % 2 === 0) {
      const ch = voice(55, root, type);
      K.choir(E, t, L.base, ch, bd * 2.05, 0.7, { vowel: 'o', vowel2: b % 4 === 0 ? 'a' : 'u', a: 1.1, r: 1.6 });
      K.bell(E, t, L.base, bassOf(48, root) + 12, 0.38, { d: 5 });
      if (b % 8 === 0) K.drone(E, t, L.base, 36, bd * 8, 0.5, { bright: 260, a: 2, r: 3 });
    }
    if (pos === 6 && r() < 0.25) K.bell(E, t, L.base, voice(79, root, type)[(r() * 3) | 0], 0.2, { d: 4 });
    if (r() < 0.035) K.drip(E, t, L.base, 0.35 + r() * 0.3);
    // motion: staccato choir on the dotted-quarter pulse, low plucked arpeggio
    if (m.on('motion')) {
      if (pos === 0 || pos === 6) K.choir(E, t, L.motion, voice(67, root, type).slice(0, 2), sd * 4, 0.55, { vowel: 'u', a: 0.04, r: 0.4 });
      if (pos % 2 === 0) { const ch = voice(55, root, type); const seq = [2, 1, 0, 1, 2, 1]; K.harp(E, t, L.motion, ch[seq[pos / 2]], 0.32, { len: 1.6, bright: 0.4, lp: 2200 }); }
    }
    // drive: toms in 6/8, a shaker
    if (m.on('drive')) {
      if (pos === 0) K.tom(E, t, L.drive, 0.6, { f: 85, d: 0.5 });
      if (pos === 6) K.tom(E, t, L.drive, 0.45, { f: 115 });
      if (pos === 9) K.tom(E, t, L.drive, 0.35, { f: 90 });
      if (pos === 3) K.rim(E, t, L.drive, 0.2, { f: 1800 });
      if (pos % 2 === 0) K.shaker(E, t, L.drive, 0.18);
    }
    // peak: a soprano line sings the motif
    if (m.on('peak')) {
      const note = at(DC_MEL, b, pos);
      if (note && note[0]) K.choir(E, t, L.peak, [note[0] + 12], note[1] * sd * 1.05, 0.65, { vowel: 'a', a: 0.15, r: 0.7, vib: 14 });
      if (pos === 0 && b % 2 === 1) K.timpani(E, t, L.peak, 36, 0.45);
    }
  },
};

// ======================================================================
// The Sunken Forge: F phrygian, 100 bpm. Anvils, bellows, brass.
// ======================================================================
const SF_PROG = [[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M'], [0, 'm'], [-4, 'M'], [-2, 'M'], [-5, 'M']];
const SF_MEL = mel([
  [[0, 72, 6], [6, 68, 2], [8, 67, 4], [12, 65, 4]], [[0, 66, 8], [8, 70, 4], [12, 73, 4]],
  [[0, 72, 8], [8, 68, 8]], [[0, 70, 4], [4, 67, 4], [8, 63, 8]],
  [[0, 77, 6], [6, 75, 2], [8, 72, 8]], [[0, 73, 6], [6, 72, 2], [8, 68, 8]],
  [[0, 70, 4], [4, 72, 4], [8, 75, 8]], [[0, 76, 8], [8, 72, 4], [12, 79, 4]],
]);
const ANVIL_PAT = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
const forge = {
  bpm: 100, spb: 16, room: 'forge', wet: 0.3, root: 53,
  step(m) {
    const { E, t, L, pos, sd, bd, r } = m;
    const b = m.bar % 8, [root, type] = SF_PROG[b];
    if (pos === 0) {
      if (b % 4 === 0) K.drone(E, t, L.base, 29, bd * 4, 0.55, { bright: 240, a: 1.5, r: 2 });
      K.brass(E, t, L.base, voice(53, root, type), bd * 0.95, 0.32, { bright: 900, r: 0.6 });
      K.anvil(E, t, L.base, 0.38, { f: 1320 });
    }
    if (pos === 8 && b % 2 === 1) K.swell(E, t, L.base, bd * 0.5, 0.18, { color: 'brown', f: 150, f1: 1400 });
    // motion: the anvil rhythm and a pulsing bass
    if (m.on('motion')) {
      if (ANVIL_PAT[pos]) K.anvil(E, t, L.motion, pos % 8 === 0 ? 0.5 : 0.32, { f: pos % 8 === 0 ? 880 : 1175, d: 0.5 });
      if (pos % 2 === 0) K.bass(E, t, L.motion, bassOf(41, root) + (pos % 4 === 2 ? 12 : 0), sd * 1.6, 0.5, { type: 'sawtooth', bright: 520, pluck: true, drive: 1.5 });
    }
    // drive: kick, metal snare, hats
    if (m.on('drive')) {
      if (pos === 0 || pos === 6 || pos === 8 || (pos === 14 && b % 2 === 1)) K.kick(E, t, L.drive, pos === 0 ? 0.8 : 0.6);
      if (pos === 4 || pos === 12) { K.snare(E, t, L.drive, 0.5, { nf: 1700 }); K.anvil(E, t, L.drive, 0.2, { f: 2200, d: 0.2 }); }
      K.hat(E, t, L.drive, pos % 4 === 2 ? 0.22 : 0.1);
    }
    // peak: brass theme and stabs
    if (m.on('peak')) {
      const note = at(SF_MEL, b, pos);
      if (note) K.brass(E, t, L.peak, note[0], note[1] * sd * 0.95, 0.6, { bright: 2600 });
      if (pos === 2 || pos === 10) K.brass(E, t, L.peak, voice(60, root, type), sd * 1.2, 0.35, { bright: 1800 });
      if (b === 7 && pos >= 12) K.timpani(E, t, L.peak, 29 + (pos - 12) * 2, 0.4);
    }
  },
};

// ======================================================================
// The Unwoven: B minor, 60 bpm. Detuned fraying strings, a slow heartbeat.
// ======================================================================
const UW_PROG = [[0, 'm'], [6, 'M'], [5, 'm'], [7, 'M'], [0, 'm'], [8, 'M'], [1, 'M'], [7, 'sus4']];
const UW_MEL = mel([ // the Weaver's motif in B minor, sung by fraying strings
  [[0, 78, 8], [8, 74, 8]], [[0, 73, 4], [4, 71, 4], [8, 73, 8]], [[0, 74, 8], [8, 76, 8]], [[0, 73, 16]],
  [[0, 78, 4], [4, 83, 4], [8, 81, 8]], [[0, 79, 8], [8, 74, 8]], [[0, 76, 4], [4, 79, 4], [8, 78, 8]], [[0, 76, 4], [4, 74, 4], [8, 73, 8]],
]);
const unwoven = {
  bpm: 60, spb: 16, room: 'unwoven', wet: 0.6, root: 59,
  step(m) {
    const { E, t, L, pos, sd, bd, r } = m;
    const b = m.bar % 8, [root, type] = UW_PROG[b];
    if (pos === 0) {
      K.strings(E, t, L.base, voice(59, root, type), bd * 1.02, 0.6, { fray: 0.55, a: 1.4, r: 1.6, bright: 1500 });
      K.bass(E, t, L.base, bassOf(35, root), bd * 0.9, 0.3, { type: 'sine', bright: 200 });
      K.heartbeat(E, t, L.base, 0.3);
    }
    if (pos === 12 && b % 2 === 1) K.swell(E, t, L.base, sd * 4, 0.22, { f: 300, f1: 4000 });
    if (r() < 0.02) K.noise(E, t, L.base, { color: 'pink', f: 2000 + r() * 2000, q: 8, a: 0.3, d: 0.6, peak: 0.05, am: [5 + r() * 6, 0.9] });
    // motion: tremolo string ostinato, broken music box
    if (m.on('motion')) {
      if (pos % 2 === 0) { const ch = voice(66, root, type), seq = [0, 1, 2, 1, 0, 2, 1, 2]; K.strings(E, t, L.motion, [ch[seq[pos / 2]]], sd * 1.8, 0.55, { a: 0.02, r: 0.25, bright: 2600, fray: 0.25 }); }
      if (b % 4 === 2 && pos % 4 === 0) { const n = at(UW_MEL, b, pos); if (n) K.musicBox(E, t, L.motion, n[0], 0.45, { d: 2, detune: -15 - r() * 30 }); }
    }
    // drive: a heartbeat kick, low toms, a ticking clock
    if (m.on('drive')) {
      if (pos === 0 || pos === 2) K.kick(E, t, L.drive, pos === 0 ? 0.65 : 0.45, { f: 110, f1: 38 });
      if (pos === 8 || pos === 11) K.tom(E, t, L.drive, 0.35, { f: pos === 8 ? 75 : 95 });
      if (pos % 2 === 0) K.rim(E, t, L.drive, pos % 4 === 0 ? 0.18 : 0.1, { f: 3200 });
    }
    // peak: distorted bass, the motif on high strings
    if (m.on('peak')) {
      if (pos % 2 === 0) K.bass(E, t, L.peak, bassOf(35, root), sd * 1.7, 0.4, { type: 'sawtooth', bright: 900, drive: 3, pluck: true });
      const n = at(UW_MEL, b, pos);
      if (n) K.strings(E, t, L.peak, [n[0]], n[1] * sd * 1.05, 0.85, { a: 0.1, r: 0.6, bright: 3200, fray: 0.35, trem: [12, 0.6] });
    }
  },
};

// ======================================================================
// Boss themes. Phase 2 (m.phase >= 2) adds layers and speeds up.
// ======================================================================
const bossLevels = (i) => ({ base: 1, motion: 1, drive: 0.5 + 0.5 * Math.min(1, i / 0.7), peak: Math.min(1, Math.max(0, (i - 0.55) / 0.3)) });

// Queen Veyl, the Thorn Regent: A minor, harp ostinato, glass percussion.
const VEYL_PROG = [[0, 'm'], [-4, 'M'], [-2, 'M'], [7, 'M'], [0, 'm'], [-4, 'M'], [5, 'm'], [7, '7']];
const VEYL_MEL = mel([
  [[0, 69, 4], [4, 76, 4], [8, 74, 2], [10, 72, 2], [12, 71, 4]], [[0, 72, 8], [8, 69, 8]],
  [[0, 71, 4], [4, 74, 4], [8, 79, 4], [12, 77, 4]], [[0, 76, 12], [12, 68, 4]],
  [[0, 69, 4], [4, 76, 4], [8, 81, 4], [12, 79, 4]], [[0, 77, 4], [4, 76, 4], [8, 72, 8]],
  [[0, 74, 4], [4, 77, 4], [8, 76, 4], [12, 74, 4]], [[0, 71, 8], [8, 68, 4], [12, 64, 4]],
]);
const boss_veyl = {
  bpm: (p) => (p >= 2 ? 126 : 118), spb: 16, room: 'glasswood', wet: 0.35, root: 57, levels: bossLevels, fadeIn: 0.4,
  step(m) {
    const { E, t, L, pos, sd, bd, phase } = m;
    const b = m.bar % 8, [root, type] = VEYL_PROG[b], p2 = phase >= 2;
    if (pos === 0) {
      K.pad(E, t, L.base, voice(57, root, type), bd, 0.5, { bright: 1500, a: 0.1, r: 0.5 });
      if (p2) K.choir(E, t, L.peak, voice(64, root, type), bd, 0.55, { vowel: 'a', a: 0.2, r: 0.5 });
    }
    { const ch = voice(69, root, type), tones = [ch[0], ch[1], ch[2], ch[0] + 12], seq = [0, 2, 1, 3, 2, 1, 0, 2]; K.harp(E, t, L.base, tones[seq[pos % 8]], pos % 4 === 0 ? 0.42 : 0.3, { len: 1.2 }); }
    if (pos % 2 === 0) K.bass(E, t, L.base, bassOf(33, root) + (pos % 8 === 6 ? 12 : 0), sd * 1.7, 0.55, { type: 'sawtooth', bright: 600, pluck: true });
    if (m.on('motion')) {
      if (pos % 4 === 2) K.glass(E, t, L.motion, 88 + (pos === 6 ? 3 : 0), 0.6, { d: 0.3 });
      K.shaker(E, t, L.motion, pos % 4 === 0 ? 0.3 : 0.16);
    }
    if (m.on('drive')) {
      if ([0, 3, 6, 10].includes(pos)) K.taiko(E, t, L.drive, pos === 0 ? 0.75 : 0.5, { f: 80 });
      if (pos === 4 || pos === 12) K.snare(E, t, L.drive, 0.45, { nf: 3000 });
      if (p2 && pos % 2 === 1) K.hat(E, t, L.drive, 0.15);
    }
    if (m.on('peak')) {
      const n = at(VEYL_MEL, b, pos);
      if (n) { K.celesta(E, t, L.peak, n[0] + 12, 0.75, { d: n[1] * sd * 1.6 }); K.strings(E, t, L.peak, [n[0]], n[1] * sd, 0.55, { a: 0.03, r: 0.2, bright: 2800 }); }
      if (p2 && (pos === 2 || pos === 10)) K.brass(E, t, L.peak, voice(57, root, type), sd * 1.2, 0.35);
    }
  },
};

// Cantor Morrow: C minor 6/8, full choir, heavy bells, toms; the flood.
const MOR_PROG = [[0, 'm'], [-4, 'M'], [5, 'm'], [-5, 'M'], [0, 'm'], [-4, 'M'], [-2, 'M'], [-5, '7']];
const MOR_MEL = mel([
  [[0, 79, 6], [6, 77, 3], [9, 75, 3]], [[0, 75, 6], [6, 72, 6]], [[0, 77, 6], [6, 75, 3], [9, 72, 3]], [[0, 74, 9], [9, 71, 3]],
  [[0, 72, 3], [3, 75, 3], [6, 79, 6]], [[0, 80, 6], [6, 79, 3], [9, 75, 3]], [[0, 77, 6], [6, 74, 6]], [[0, 74, 6], [6, 71, 6]],
]);
const boss_morrow = {
  bpm: (p) => (p >= 2 ? 98 : 90), spb: 12, room: 'choir', wet: 0.55, root: 60, levels: bossLevels, fadeIn: 0.5,
  step(m) {
    const { E, t, L, pos, sd, bd, phase } = m;
    const b = m.bar % 8, [root, type] = MOR_PROG[b], p2 = phase >= 2;
    if (pos === 0) {
      K.choir(E, t, L.base, voice(p2 ? 62 : 55, root, type), bd * 1.02, 0.75, { vowel: 'a', a: 0.15, r: 0.6 });
      K.bell(E, t, L.base, bassOf(48, root), 0.5, { d: 4 });
      K.bass(E, t, L.base, bassOf(36, root), bd * 0.95, 0.5, { type: 'triangle', bright: 300 });
      if (b % 4 === 0) K.timpani(E, t, L.drive, 36, 0.7);
    }
    if (m.on('motion') && pos % 2 === 0) K.choir(E, t, L.motion, voice(67, root, type).slice(0, 2), sd * 1.4, pos === 0 || pos === 6 ? 0.6 : 0.4, { vowel: 'o', a: 0.02, r: 0.18 });
    if (m.on('drive')) {
      if ([0, 3, 6, 9].includes(pos)) K.tom(E, t, L.drive, pos === 0 ? 0.7 : 0.45, { f: pos === 6 ? 120 : 88 });
      if (p2 && pos % 2 === 1) K.tom(E, t, L.drive, 0.25, { f: 160 });
      if (pos % 3 === 0) K.shaker(E, t, L.drive, 0.2);
    }
    if (m.on('peak')) {
      const n = at(MOR_MEL, b, pos);
      if (n) K.choir(E, t, L.peak, [n[0]], n[1] * sd * 1.05, 0.7, { vowel: 'a', a: 0.06, r: 0.3, vib: 12 });
      if (p2 && pos === 0 && b % 2 === 1) K.fm(E, t, L.peak, { f: 130.8, ratio: 1.4, index: 2.6, index1: 0.3, a: 0.003, d: 2, peak: 0.12 });
    }
  },
};

// Aurum, the Gilded Colossus: F minor, anvils and brass; phase 2 heats up.
const AUR_PROG = [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M'], [0, 'm'], [5, 'm'], [7, 'M'], [7, '7']];
const AUR_MEL = mel([
  [[0, 65, 8], [8, 72, 4], [12, 68, 4]], [[0, 67, 6], [6, 65, 2], [8, 63, 8]], [[0, 65, 4], [4, 68, 4], [8, 73, 8]], [[0, 72, 8], [8, 70, 8]],
  [[0, 77, 8], [8, 75, 4], [12, 72, 4]], [[0, 73, 6], [6, 72, 2], [8, 70, 8]], [[0, 72, 4], [4, 76, 4], [8, 79, 8]], [[0, 76, 12], [12, 72, 4]],
]);
const boss_aurum = {
  bpm: (p) => (p >= 2 ? 116 : 108), spb: 16, room: 'forge', wet: 0.3, root: 53, levels: bossLevels, fadeIn: 0.4,
  step(m) {
    const { E, t, L, pos, sd, bd, phase } = m;
    const b = m.bar % 8, [root, type] = AUR_PROG[b], p2 = phase >= 2;
    if (pos === 0) {
      if (b % 4 === 0) K.drone(E, t, L.base, 29, bd * 4, 0.6, { bright: 260, a: 0.5, r: 1.5 });
      K.brass(E, t, L.base, voice(53, root, type), bd * 0.95, 0.35, { bright: 1100, r: 0.5 });
      if (b % 2 === 0) K.timpani(E, t, L.drive, 29, 0.75);
      if (p2 && b % 4 === 0) K.braam(E, t, L.peak, 29, bd * 1.5, 0.5);
    }
    if (ANVIL_PAT[pos] || (p2 && pos % 2 === 1)) K.anvil(E, t, L.base, ANVIL_PAT[pos] ? (pos % 8 === 0 ? 0.55 : 0.36) : 0.16, { f: pos % 8 === 0 ? 700 : 930, d: 0.5 });
    if (m.on('motion') && pos % 2 === 0) K.bass(E, t, L.motion, bassOf(41, root) + (pos % 4 === 2 ? 12 : 0), sd * 1.6, 0.55, { type: 'sawtooth', bright: 600, pluck: true, drive: 2 });
    if (m.on('drive')) {
      if (pos === 0 || pos === 8 || pos === 10) K.kick(E, t, L.drive, 0.85);
      if (pos === 4 || pos === 12) K.snare(E, t, L.drive, 0.55, { nf: 1600 });
      if (p2) K.hat(E, t, L.drive, pos % 4 === 2 ? 0.25 : 0.12);
    }
    if (m.on('peak')) {
      const n = at(AUR_MEL, b, pos);
      if (n) K.brass(E, t, L.peak, [n[0], n[0] - 12], n[1] * sd * 0.95, 0.65, { bright: 3000 });
    }
  },
};

// Sable, the Unweaver: B minor, driving strings; his mirror motif; in phase 2
// the Weaver's motif plays against it, two halves of one thread.
const SAB_PROG = [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M'], [0, 'm'], [8, 'M'], [1, 'M'], [7, '7']];
const SAB_MEL = mel([
  [[0, 64, 8], [8, 68, 8]], [[0, 69, 4], [4, 71, 4], [8, 69, 8]], [[0, 67, 8], [8, 66, 8]], [[0, 70, 16]],
  [[0, 71, 4], [4, 74, 4], [8, 73, 4], [12, 71, 4]], [[0, 74, 8], [8, 67, 8]], [[0, 72, 4], [4, 76, 4], [8, 74, 4], [12, 72, 4]], [[0, 70, 8], [8, 66, 8]],
]);
const SAB_WEAVER = mel([
  [[0, 78, 8], [8, 74, 8]], [[0, 73, 4], [4, 71, 4], [8, 73, 8]], [[0, 74, 8], [8, 76, 8]], [[0, 73, 16]],
  [[0, 78, 4], [4, 83, 4], [8, 81, 8]], [[0, 79, 8], [8, 74, 8]], [[0, 76, 4], [4, 79, 4], [8, 78, 8]], [[0, 76, 4], [4, 74, 4], [8, 73, 8]],
]);
const boss_sable = {
  bpm: (p) => (p >= 2 ? 136 : 128), spb: 16, room: 'unwoven', wet: 0.4, root: 59, levels: bossLevels, fadeIn: 0.3,
  step(m) {
    const { E, t, L, pos, sd, bd, phase } = m;
    const b = m.bar % 8, [root, type] = SAB_PROG[b], p2 = phase >= 2;
    if (pos === 0) {
      if (b % 2 === 0) K.drone(E, t, L.base, 35, bd * 2, 0.5, { bright: 300, a: 0.3, r: 1 });
      K.strings(E, t, L.base, voice(59, root, type), bd, 0.45, { a: 0.15, r: 0.4, fray: p2 ? 0.4 : 0.15 });
    }
    { const ch = voice(71, root, type), seq = [0, 0, 1, 0, 2, 0, 1, 2]; if (pos % 2 === 0 || p2) K.strings(E, t, L.base, [ch[seq[pos % 8]]], sd * 0.9, 0.5, { a: 0.01, r: 0.08, bright: 3000 }); }
    if (m.on('motion') && pos % 2 === 0) K.bass(E, t, L.motion, bassOf(35, root) + (pos % 8 === 6 ? 12 : 0), sd * 1.7, 0.55, { type: 'sawtooth', bright: 800, drive: 3, pluck: true });
    if (m.on('drive')) {
      if (pos % 4 === 0 || pos === 14) K.kick(E, t, L.drive, pos === 0 ? 0.85 : 0.6);
      if (pos === 4 || pos === 12) K.snare(E, t, L.drive, 0.5);
      if (b === 7 && pos >= 8 && pos % 2 === 0) K.tom(E, t, L.drive, 0.4 + (pos - 8) * 0.05, { f: 160 - (pos - 8) * 10 });
      if (pos % 2 === 1) K.hat(E, t, L.drive, 0.1);
    }
    if (m.on('peak')) {
      const n = at(SAB_MEL, b, pos);
      if (n) K.brass(E, t, L.peak, [n[0], n[0] - 12], n[1] * sd * 0.95, 0.6, { bright: 2200 });
      if (p2) {
        const w = at(SAB_WEAVER, b, pos);
        if (w) { K.celesta(E, t, L.peak, w[0] + 12, 0.7, { d: w[1] * sd * 1.4 }); K.strings(E, t, L.peak, [w[0]], w[1] * sd, 0.5, { a: 0.05, r: 0.3, bright: 3200, fray: 0.2 }); }
        if (pos === 0 && b % 2 === 0) K.choir(E, t, L.peak, voice(66, root, type), bd * 2, 0.5, { vowel: 'u', vowel2: 'a', a: 0.6, r: 0.8 });
      }
    }
  },
};

export const TRACKS = {
  title: lullaby({ bpm: 64, room: 'title', noBass: true, noHarp: false, sparseHarp: true, harpVel: 0.7, padVel: 0.5, air: true, melodyAll: true, bright: 800 }),
  hub: lullaby({ bpm: 72, room: 'hub' }),
  memory: lullaby({ bpm: 58, room: 'title', noBass: true, harpVel: 0.6, padVel: 0.45, haze: true, air: true, melodyAll: true, bright: 700 }),
  ending: lullaby({ bpm: 66, room: 'title', end: true, bright: 1300, wet: 0.55 }),
  ending_true: lullaby({ bpm: 66, room: 'title', braid: true, bright: 1500, wet: 0.55 }),
  glasswood, choir, forge, unwoven,
  boss_veyl, boss_morrow, boss_aurum, boss_sable,
};

export const REGION_ROOT = { hub: 62, glasswood: 57, choir: 60, forge: 53, unwoven: 59 };
