// Generative score. Six pieces share one composer: a key and mode, chord
// progressions in 8-bar phrases, a melody generator (motif, answer, cadence),
// and per-piece arrangements. The scheduler writes a bar at a time slightly
// ahead of the audio clock; changing mood crossfades the pieces.
//   title    the Skyforge theme: flute over harp and strings, G major
//   day      orchestral folk: finger-picked strings, warm pads, flute, light percussion, D major
//   night    nocturne: celesta, soft strings, low flute, F major sevenths
//   raid     driving: string ostinato, taiko, brass, D minor
//   storm    rumbling: drones, choir, timpani, tolling bells, C phrygian
//   victory  the theme on brass with timpani and cymbal swells, D major
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10];

// The Skyforge theme: [scale degree (0 = tonic) | null rest, beats]; 8 bars of 4/4.
const THEME = [
  [[4, 1], [7, 1.5], [6, 0.5], [4, 1]], [[2, 1], [4, 1], [5, 2]], [[5, 1], [6, 1], [7, 1], [8, 1]], [[9, 3], [null, 1]],
  [[9, 1], [8, 1], [7, 1], [6, 1]], [[4, 1.5], [5, 0.5], [6, 2]], [[5, 1], [4, 1], [2, 1], [1, 1]], [[0, 3], [null, 1]],
];
const THEME_CHORDS = [{ d: 0 }, { d: 5 }, { d: 3 }, { d: 0 }, { d: 3 }, { d: 4 }, { d: 1, then: { d: 4 } }, { d: 0 }];

const RHYTHMS = [[1, 1, 2], [1.5, 0.5, 1, 1], [0.5, 0.5, 1, 2], [2, 1, 1], [1, 0.5, 0.5, 2], [3, 1], [1, 1, 1, 1], [2, 2], [0.5, 0.5, 0.5, 0.5, 2]];

function xr(seed) { let s = (seed >>> 0) || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const pickOf = (r, a) => a[(r() * a.length) | 0];

// scale degree -> midi in key (root midi, scale)
function deg(key, d, alter = null) {
  const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
  return key.root + 12 * o + key.scale[i] + (alter && alter[i] ? alter[i] : 0);
}
// chord tones as degrees (triad or seventh); chord { d, seventh, maj, sus }
function chordDegs(c) { const t = [c.d, c.d + (c.sus ? 1 : 2), c.d + 4]; if (c.seventh) t.push(c.d + 6); return t; }
function chordAlter(key, c) {
  // force a major third (V in minor) -> raise that scale step
  if (!c.maj) return null;
  const third = (((c.d + 2) % 7) + 7) % 7, root = (((c.d) % 7) + 7) % 7;
  const iv = (key.scale[third] - key.scale[root] + 12) % 12;
  return iv === 3 ? { [third]: 1 } : null;
}
function chordMidis(key, c, base = 0) { const alt = chordAlter(key, c); return chordDegs(c).map((d) => deg(key, d + base, alt)); }

// A melody for `bars` bars over `chords` (one per bar), in degrees around `center`.
function makeMelody(r, key, chords, { center = 7, range = 5, density = 0.7, cadence = true } = {}) {
  const out = []; let cur = center + pickOf(r, [0, 2, 4]);
  const motifR = [pickOf(r, RHYTHMS), pickOf(r, RHYTHMS)];
  for (let b = 0; b < chords.length; b++) {
    const c = chords[b], tones = chordDegs(c);
    let rh = b % 4 === 3 && cadence ? pickOf(r, [[2, 2], [3, 1], [4]]) : b % 2 === 0 ? motifR[0] : motifR[1];
    if (b >= 4 && r() < 0.3) rh = pickOf(r, RHYTHMS);
    let at = 0;
    for (let i = 0; i < rh.length; i++) {
      const dur = rh[i];
      const strong = at === 0 || at === 2;
      if (!strong && r() > density) { at += dur; continue; }
      let step = pickOf(r, [-2, -1, -1, 1, 1, 2, 0, 3, -3]);
      let nd = cur + step;
      if (nd > center + range) nd -= 2; if (nd < center - range) nd += 2;
      if (strong) {
        // snap to the nearest chord tone (any octave)
        let best = nd, bd = 99;
        for (const t of tones) for (const o of [-14, -7, 0, 7, 14]) { const cand = t + o; const dd = Math.abs(cand - nd); if (dd < bd) { bd = dd; best = cand; } }
        nd = best;
      }
      if (b === chords.length - 1 && i === rh.length - 1 && cadence) { nd = center + ((c.d % 7) - (center % 7)); while (nd > center + 3) nd -= 7; while (nd < center - 4) nd += 7; }
      cur = nd;
      out.push({ bar: b, at, dur, d: nd, alt: chordAlter(key, c) });
      at += dur;
    }
  }
  return out;
}

// ---- pieces --------------------------------------------------------------------
// Each piece: { bpm, key, progs, phrase(state) -> plan for the next 8 bars, bar(api, t, i) }.
// api: { V (voices), out (piece bus), r (random), beat (seconds), key, chord, next, plan, bar, phraseNo }
const C = (d, o = {}) => ({ d, ...o });

function harpArp(api, t, chord, { base = 0, steps = 8, sub = 0.5, vel = 0.22, pattern = [0, 1, 2, 3, 2, 1, 2, 1], set = 'pluck', pan = 0.3 } = {}) {
  const { V, out, key, beat, r } = api;
  const tones = chordMidis(key, chord, base); tones.push(tones[0] + 12); tones.push(tones[1] + 12);
  for (let i = 0; i < steps; i++) {
    const m = tones[pattern[i % pattern.length] % tones.length];
    V[set](out, t + i * sub * beat + (r() - 0.5) * 0.008, m, vel * (i % 4 === 0 ? 1 : 0.72) * (0.9 + r() * 0.2), { pan: pan * (i % 2 ? 1 : -1) * 0.6 });
  }
}

function playMelody(api, t, notes, bar, inst, { oct = 0, vel = 0.2, pan = 0 } = {}) {
  const { V, out, key, beat } = api;
  for (const n of notes) {
    if (n.bar !== bar || n.d == null) continue;
    const m = deg(key, n.d, n.alt) + oct;
    const tt = t + n.at * beat, dur = n.dur * beat * 0.92;
    if (inst === 'flute') V.flute(out, tt, m, dur, vel, { pan });
    else if (inst === 'brass') V.brass(out, tt, [m], dur, vel, { pan });
    else if (inst === 'celesta') V.celesta(out, tt, m, vel, { pan });
    else if (inst === 'bell') V.bell(out, tt, m, vel, { pan });
    else V.pluck(out, tt, m, vel, { pan });
  }
}

const themeNotes = () => THEME.flatMap((bar, b) => { let at = 0; return bar.map(([d, dur]) => { const n = { bar: b, at, dur, d }; at += dur; return n; }); });

const PIECES = {
  title: {
    bpm: 78, key: { root: 55, scale: MAJOR },
    phrase(s) {
      const k = s.phraseNo % 3;
      if (k === 0 || k === 2) return { chords: THEME_CHORDS, melody: themeNotes(), inst: k === 2 ? 'brass' : 'flute', intensity: k === 2 ? 2 : 1 };
      const prog = pickOf(s.r, [[0, 4, 5, 3], [3, 0, 4, 5], [5, 3, 0, 4]]).flatMap((d) => [C(d), C(d)]);
      return { chords: prog, melody: makeMelody(s.r, this.key, prog, { center: 9, density: 0.5 }), inst: 'celesta', intensity: 0 };
    },
    bar(api, t, i) {
      const { V, out, key, beat, chord, plan } = api;
      const dur = beat * 4;
      V.pad(out, t, chordMidis(key, chord, -7), dur, 0.05 + plan.intensity * 0.015, { attack: 1.4, release: 1.8, cutoff: 900 });
      if (chord.then) { harpArp(api, t, chord, { steps: 4, vel: 0.16 }); harpArp(api, t + beat * 2, chord.then, { steps: 4, vel: 0.16 }); }
      else harpArp(api, t, chord, { vel: 0.16 });
      V.bass(out, t, deg(key, chord.d - 14), beat * 3, 0.22);
      if (i === 0) V.drum(out, t, 'timpani', 0.25 + plan.intensity * 0.1);
      if (plan.intensity === 2 && (i === 0 || i === 4)) V.drum(out, t, 'cymbal', 0.08);
      playMelody(api, t, plan.melody, i, plan.inst, { oct: plan.inst === 'celesta' ? 12 : 12, vel: plan.inst === 'brass' ? 0.1 : plan.inst === 'celesta' ? 0.16 : 0.16 });
    },
  },

  day: {
    bpm: 96, key: { root: 50, scale: MAJOR },
    phrase(s) {
      const prog = pickOf(s.r, [[0, 4, 5, 3], [0, 3, 0, 4], [5, 3, 0, 4], [0, 2, 3, 4], [3, 0, 4, 5], [0, 5, 1, 4]]).flatMap((d) => [C(d), C(d)]);
      const k = s.phraseNo % 4;
      const lead = k === 1 || k === 3;
      const theme = s.phraseNo % 8 === 5;
      return {
        chords: theme ? THEME_CHORDS : prog,
        melody: theme ? themeNotes() : lead ? makeMelody(s.r, this.key, prog, { center: 9, density: 0.75 }) : (s.r() < 0.5 ? makeMelody(s.r, this.key, prog, { center: 11, density: 0.35 }) : []),
        inst: lead || theme ? 'flute' : 'celesta', perc: k !== 0, intensity: k === 3 ? 2 : k === 0 ? 0 : 1,
      };
    },
    bar(api, t, i) {
      const { V, out, key, beat, chord, plan, r } = api;
      V.pad(out, t, chordMidis(key, chord, -7), beat * 4, 0.035 + plan.intensity * 0.012, { attack: 0.9, release: 1.4, cutoff: 1000 + plan.intensity * 300 });
      // finger-picked strings: bass on 1 and 3, chord tones between
      const tones = chordMidis(key, chord, 0), alt = chordAlter(key, chord);
      const bassN = deg(key, chord.d - 7, alt), fifth = deg(key, chord.d - 3, alt);
      const pat = [bassN, tones[1], tones[2], tones[1] + 0, fifth, tones[2], tones[0] + 12, tones[2]];
      for (let s = 0; s < 8; s++) V.pluck(out, t + s * beat / 2 + (s % 2 ? beat * 0.04 : 0), pat[s], (s % 4 === 0 ? 0.26 : 0.15) * (0.9 + r() * 0.2), { pan: s % 2 ? 0.35 : -0.25 });
      if (plan.intensity >= 1) V.bass(out, t, deg(key, chord.d - 14, alt), beat * 1.8, 0.2);
      if (plan.perc) {
        V.drum(out, t, 'frame', 0.22); V.drum(out, t + beat * 2, 'frame', 0.15, { rate: 1.12 });
        if (plan.intensity >= 1) for (let s = 0; s < 8; s++) V.drum(out, t + s * beat / 2 + (s % 2 ? beat * 0.06 : 0), 'shaker', s % 2 ? 0.06 : 0.1, { pan: 0.4 });
        if (plan.intensity === 2 && i === 7) for (let s = 0; s < 4; s++) V.drum(out, t + (2 + s * 0.5) * beat, 'tom', 0.12 + s * 0.03, { rate: 1 + s * 0.08 });
      }
      playMelody(api, t, plan.melody, i, plan.inst, { oct: plan.inst === 'celesta' ? 12 : 12, vel: plan.inst === 'flute' ? 0.17 : 0.12, pan: 0.1 });
    },
  },

  night: {
    level: 1.45, bpm: 62, key: { root: 53, scale: MAJOR },
    phrase(s) {
      const prog = pickOf(s.r, [[0, 3, 5, 3], [0, 5, 3, 4], [5, 3, 0, 1], [3, 2, 1, 4]]).flatMap((d) => [C(d, { seventh: true }), C(d, { seventh: true })]);
      const lead = s.phraseNo % 3 === 1;
      return { chords: prog, melody: lead ? makeMelody(s.r, this.key, prog, { center: 4, density: 0.4, range: 4 }) : makeMelody(s.r, this.key, prog, { center: 11, density: 0.3 }), inst: lead ? 'flute' : 'celesta' };
    },
    bar(api, t, i) {
      const { V, out, key, beat, chord, plan, r } = api;
      V.pad(out, t, chordMidis(key, chord, -7), beat * 4, 0.04, { attack: 2.2, release: 2.5, cutoff: 650, wave: 'triangle', detune: 9 });
      V.bass(out, t, deg(key, chord.d - 14), beat * 3.5, 0.12);
      // slow celesta arpeggio, sparse
      const tones = chordMidis(key, chord, 7);
      for (let s = 0; s < 4; s++) if (r() < 0.65) V.celesta(out, t + s * beat + (r() - 0.5) * 0.03, tones[(s + i) % tones.length], 0.09 * (0.8 + r() * 0.3), { pan: (r() - 0.5) * 0.8 });
      if (i % 2 === 0) V.pluck(out, t + beat * 0.02, deg(key, chord.d - 7), 0.1, { pan: -0.2 });
      playMelody(api, t, plan.melody, i, plan.inst, { oct: plan.inst === 'flute' ? 12 : 12, vel: plan.inst === 'flute' ? 0.12 : 0.08 });
    },
  },

  raid: {
    bpm: 136, key: { root: 50, scale: MINOR },
    phrase(s) {
      const prog = pickOf(s.r, [[0, 5, 6, 0], [0, 3, 6, 2], [0, 5, 3, 4], [0, 6, 5, 4]]).flatMap((d) => [C(d, { maj: d === 4 }), C(d, { maj: d === 4 })]);
      const k = s.phraseNo % 3;
      return { chords: prog, melody: makeMelody(s.r, this.key, prog, { center: 7, density: 0.85, range: 5 }), lead: k !== 0, intensity: k === 2 ? 2 : 1 };
    },
    bar(api, t, i) {
      const { V, out, key, beat, chord, plan, r } = api;
      const alt = chordAlter(key, chord);
      const root = deg(key, chord.d - 7, alt), five = deg(key, chord.d - 3, alt), oct = root + 12;
      const os = [root, root, oct, root, five, root, oct, five];
      for (let s = 0; s < 16; s++) V.stacc(out, t + s * beat / 4, os[s % 8], beat / 4, (s % 4 === 0 ? 0.075 : 0.05), { pan: -0.3, cutoff: 1600 + plan.intensity * 500 });
      for (let s = 0; s < 8; s++) V.bass(out, t + s * beat / 2, deg(key, chord.d - 14, alt), beat * 0.4, s % 2 ? 0.12 : 0.2);
      V.drum(out, t, 'taiko', 0.42); V.drum(out, t + beat * 1.5, 'taiko', 0.25, { rate: 1.1 }); V.drum(out, t + beat * 2, 'taiko', 0.35);
      V.drum(out, t + beat, 'snare', 0.12); V.drum(out, t + beat * 3, 'snare', 0.14);
      if (plan.intensity === 2) for (let s = 0; s < 8; s++) V.drum(out, t + s * beat / 2, 'shaker', 0.07);
      if (i % 2 === 0) V.brass(out, t, chordMidis(key, chord, 0), beat * 1.8, 0.07 + plan.intensity * 0.02, { pan: 0.25 });
      if (i === 7) for (let s = 0; s < 6; s++) V.drum(out, t + (2.5 + s * 0.25) * beat, 'tom', 0.18 + s * 0.03, { rate: 0.9 + s * 0.07 });
      if (plan.lead) playMelody(api, t, plan.melody, i, plan.intensity === 2 ? 'brass' : 'pluck', { oct: 12, vel: plan.intensity === 2 ? 0.09 : 0.2, pan: 0.2 });
    },
  },

  storm: {
    level: 1.3, bpm: 70, key: { root: 48, scale: PHRYG },
    phrase(s) {
      const prog = pickOf(s.r, [[0, 1, 0, 6], [0, 5, 1, 0], [0, 6, 5, 1]]).flatMap((d) => [C(d), C(d)]);
      return { chords: prog, melody: makeMelody(s.r, this.key, prog, { center: 4, density: 0.35, range: 3 }), lead: s.phraseNo % 2 === 1 };
    },
    bar(api, t, i) {
      const { V, out, key, beat, chord, plan, r } = api;
      const dur = beat * 4;
      if (i % 2 === 0) V.drone(out, t, [deg(key, -14), deg(key, -10)], dur * 2, 0.08);
      V.pad(out, t, chordMidis(key, chord, -7), dur, 0.05, { attack: 1.8, release: 2, wave: 'sawtooth', vowel: [[750, 6, 1], [1150, 7, 0.5], [2800, 9, 0.18]] });
      for (let s = 0; s < 4; s++) V.pizz(out, t + s * beat, deg(key, chord.d - 14), 0.18, { pan: -0.2 });
      if (i === 3 || i === 7) { for (let s = 0; s < 12; s++) V.drum(out, t + (2 + s / 6) * beat, 'timpani', 0.06 + s * 0.012, { rate: 0.93 }); }
      if (i === 0 || i === 4) V.drum(out, t, 'timpani', 0.32, { rate: 0.93 });
      if (i % 4 === 2) V.bell(out, t + beat, deg(key, chord.d + 1), 0.07, { pan: 0.5 });
      if (plan.lead) playMelody(api, t, plan.melody, i, 'flute', { oct: 0, vel: 0.12, pan: -0.1 });
    },
  },

  victory: {
    bpm: 108, key: { root: 50, scale: MAJOR },
    phrase(s) {
      if (s.phraseNo % 2 === 0) return { chords: THEME_CHORDS, melody: themeNotes(), inst: 'brass' };
      const prog = pickOf(s.r, [[0, 3, 4, 0], [5, 3, 4, 0]]).flatMap((d) => [C(d), C(d)]);
      return { chords: prog, melody: makeMelody(s.r, this.key, prog, { center: 9, density: 0.8 }), inst: 'flute' };
    },
    bar(api, t, i) {
      const { V, out, key, beat, chord, plan } = api;
      V.pad(out, t, chordMidis(key, chord, -7), beat * 4, 0.06, { attack: 0.4, release: 1.2, cutoff: 1800 });
      if (chord.then) { harpArp(api, t, chord, { steps: 8, sub: 0.25, vel: 0.14 }); harpArp(api, t + beat * 2, chord.then, { steps: 8, sub: 0.25, vel: 0.14 }); }
      else harpArp(api, t, chord, { steps: 16, sub: 0.25, vel: 0.14 });
      V.bass(out, t, deg(key, chord.d - 14), beat * 1.8, 0.22); V.bass(out, t + beat * 2, deg(key, chord.d - 10), beat * 1.8, 0.18);
      V.drum(out, t, 'timpani', 0.3); V.drum(out, t + beat * 2, 'timpani', 0.18, { rate: 1.12 });
      if (i === 0) V.drum(out, t, 'cymbal', 0.14);
      if (i === 7) for (let s = 0; s < 8; s++) V.drum(out, t + (2 + s * 0.25) * beat, 'snare', 0.05 + s * 0.012);
      playMelody(api, t, plan.melody, i, plan.inst, { oct: 12, vel: plan.inst === 'brass' ? 0.11 : 0.17 });
    },
  },
};
export const MOODS = Object.keys(PIECES);

export function createMusic(ctx, V, dest, reverbSend) {
  let cur = null;          // { name, piece, gain, nextBar, bar, phraseNo, plan, r }
  const retiring = [];

  function start(name, at, fadeIn) {
    const piece = PIECES[name];
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(piece.level ?? 1, at + fadeIn);
    gain.connect(dest); if (reverbSend) gain.connect(reverbSend);
    const r = xr((Math.random() * 4294967296) >>> 0);
    return { name, piece, gain, nextBar: at + 0.05, bar: 0, phraseNo: name === 'title' || name === 'victory' ? 0 : (r() * 4) | 0, plan: null, r };
  }

  function setMood(name, { fade = 3 } = {}) {
    if (!PIECES[name] || (cur && cur.name === name)) return;
    const now = ctx.currentTime;
    if (cur) {
      cur.gain.gain.cancelScheduledValues(now);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, now);
      cur.gain.gain.linearRampToValueAtTime(0, now + fade);
      const old = cur; retiring.push(old);
      setTimeout(() => { try { old.gain.disconnect(); } catch {} const k = retiring.indexOf(old); if (k >= 0) retiring.splice(k, 1); }, (fade + 4) * 1000);
    }
    // enter on a soft attack; urgent moods come in faster
    const fin = name === 'raid' || name === 'victory' ? Math.min(fade, 0.8) : fade;
    cur = start(name, now + (cur ? Math.min(0.6, fade * 0.25) : 0.05), fin);
  }

  function schedule(ahead = 0.6) {
    if (!cur) return;
    const now = ctx.currentTime;
    if (cur.nextBar < now - 0.2) cur.nextBar = now + 0.05;    // we were starved (hidden tab): restart cleanly
    while (cur.nextBar < now + ahead) {
      const P = cur.piece, beat = 60 / P.bpm;
      if (cur.bar % 8 === 0) { cur.plan = P.phrase({ r: cur.r, phraseNo: cur.phraseNo }); }
      const i = cur.bar % 8;
      const chords = cur.plan.chords;
      const api = { V, out: cur.gain, r: cur.r, beat, key: P.key, chord: chords[i % chords.length], plan: cur.plan, phraseNo: cur.phraseNo };
      try { P.bar(api, cur.nextBar, i); } catch (e) { console.error(e); }
      cur.nextBar += beat * 4;
      cur.bar++;
      if (cur.bar % 8 === 0) cur.phraseNo++;
    }
  }

  return { setMood, schedule, get mood() { return cur?.name || null; }, stop() { if (cur) { cur.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); cur = null; } } };
}
