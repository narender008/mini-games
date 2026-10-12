// Moonbound audio: a little music theory so the score can be written the way a musician
// writes it: note names, chord symbols, voice leading and a one-line melody notation.
// Pure JS, no Web Audio.
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

// 'C4' = 60, 'Bb3' = 58, 'F#5' = 78
export function noteNum(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`bad note ${s}`);
  return LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
}

export const noteName = (n) => NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

// chord qualities as semitones above the root (extensions written as the compound interval)
export const QUAL = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  5: [0, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  7: [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  '7sus4': [0, 5, 7, 10],
};

// 'Dm9', 'Bbmaj7', 'F#m7b5', 'A', 'Dm/F' -> { root: pitch class, tones: [semitones above root],
// bass: pitch class of the lowest note, name }
export function chordOf(sym) {
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m) throw new Error(`bad chord ${sym}`);
  const root = (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = QUAL[m[3]];
  if (!q) throw new Error(`bad chord quality ${sym}`);
  let bass = root;
  if (m[4]) bass = (LETTER[m[4][0]] + (m[4][1] === '#' ? 1 : m[4][1] === 'b' ? -1 : 0) + 12) % 12;
  return { name: sym, root, tones: q.slice(), bass };
}

// MIDI note of the pitch class `pc` nearest to (and at or above) `lo`
export const atOrAbove = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12);
export const nearest = (pc, around) => {
  let n = around - 6 + ((((pc - (around - 6)) % 12) + 12) % 12);
  if (n > around + 6) n -= 12;
  return n;
};

// The chord as MIDI notes with its root at `rootNote` (a MIDI number): [root, ...tones]
export function chordNotes(c, rootNote) {
  return c.tones.map((t) => rootNote + t);
}

// Voice leading: choose the octave of each chord tone (pitch classes, most important first, cut to
// `count`) inside [lo, hi] so the voicing moves as little as possible from `prev` (a sorted array
// of MIDI notes or null) and never crowds a low interval. Returns a sorted array of MIDI notes.
export function voiceLead(prev, pcs, lo, hi, count = pcs.length) {
  const want = pcs.slice(0, count);
  const cands = want.map((pc) => {
    const arr = [];
    for (let n = lo; n <= hi; n++) if (((n % 12) + 12) % 12 === pc) arr.push(n);
    return arr.length ? arr : [atOrAbove(pc, lo)];
  });
  let best = null;
  let bestCost = Infinity;
  const pick = new Array(want.length);
  const rec = (i) => {
    if (i === want.length) {
      const v = pick.slice().sort((a, b) => a - b);
      for (let k = 1; k < v.length; k++) if (v[k] === v[k - 1]) return;
      let cost = 0;
      for (let k = 1; k < v.length; k++) {
        const gap = v[k] - v[k - 1];
        // crowded low intervals sound muddy
        if (v[k - 1] < 55 && gap < 5) cost += 14;
        else if (gap < 3) cost += 5;
        if (gap > 12) cost += (gap - 12) * 1.5;
      }
      if (prev && prev.length) {
        for (let k = 0; k < v.length; k++) {
          const p = prev[Math.min(prev.length - 1, Math.round((k * (prev.length - 1)) / Math.max(1, v.length - 1)))];
          cost += Math.abs(v[k] - p) * 1.4;
        }
      } else {
        // no history: keep it compact and centred
        cost += (v[v.length - 1] - v[0]) * 0.4 + Math.abs((v[0] + v[v.length - 1]) / 2 - (lo + hi) / 2) * 0.3;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
      return;
    }
    for (const n of cands[i]) {
      pick[i] = n;
      rec(i + 1);
    }
  };
  rec(0);
  return best || cands.map((a) => a[0]).sort((a, b) => a - b);
}

// The pitch classes of a chord in order of importance for a thin voicing: root, third, seventh,
// ninth and extensions, fifth last (so a four-voice pad keeps the colour and drops the fifth).
export function importance(c, withFifth = true) {
  const t = c.tones;
  const pcs = [];
  const add = (iv) => {
    const pc = (c.root + iv) % 12;
    if (!pcs.includes(pc)) pcs.push(pc);
  };
  add(0);
  const third = t.find((x) => x === 3 || x === 4 || x === 2 || x === 5);
  if (third !== undefined) add(third);
  for (const x of t) if (x === 10 || x === 11 || x === 9) add(x);
  for (const x of t) if (x >= 12) add(x);
  if (withFifth) for (const x of t) if (x === 7 || x === 6) add(x);
  return pcs;
}

// n pitch classes for a pad of n voices: the important tones first, then the root, third... doubled
export function voicingPcs(c, n) {
  const base = importance(c, true);
  const pcs = base.slice(0, n);
  for (let i = 0; pcs.length < n; i++) pcs.push(base[i % base.length]);
  return pcs;
}

// One-line melody notation: 'A4/2 D5 C5 -/1 A4/2!' -> [{ b: beat, m: midi, d: beats, v: velocity }]
//   NOTE or -(rest) '/' length in beats (default 1); ! accent, ~ soft; '|' bar lines are ignored.
// Beats count from the start of the line.
export function line(src) {
  const out = [];
  let b = 0;
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const m = /^([A-G][#b]?-?\d|-)(?:\/([\d.]+))?([!~]?)$/.exec(tok);
    if (!m) throw new Error(`bad melody token "${tok}" in "${src}"`);
    const d = m[2] ? parseFloat(m[2]) : 1;
    if (m[1] !== '-') out.push({ b, m: noteNum(m[1]), d, v: m[3] === '!' ? 1 : m[3] === '~' ? 0.55 : 0.8 });
    b += d;
  }
  out.len = b;
  return out;
}

// move a line by semitones
export const shift = (ln, semis) => {
  const o = ln.map((e) => ({ ...e, m: e.m + semis }));
  o.len = ln.len;
  return o;
};
