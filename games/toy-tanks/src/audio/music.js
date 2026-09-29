// Toy Tanks' music: a light toy-box tune for each stage, composed as it plays,
// and a softer lullaby for the menus.
//
//  - meadow: C major, 108 bpm. Marimba and glockenspiel over a strummed
//    ukulele, a round bass and a light shaker;
//  - beach: G major, 100 bpm with a lazy swing. Marimba and kalimba over an
//    off-beat ukulele skank and a bouncing bass;
//  - garden: D major, 88 bpm, rainy-day. Kalimba and music box over a
//    fingerpicked harp, a soft bass and a whisper of shaker;
//  - snow: F major, 84 bpm, sleigh-ride sparkle. Glockenspiel and celesta over
//    a celesta arpeggio and a jingle of sleigh bells;
//  - forest: A major, 104 bpm, skipping. Marimba and kalimba over a bouncy
//    ukulele, a walking bass and a swung shaker;
//  - menu: a music-box lullaby in 6/8 at 66 bpm over a rocking harp and a warm
//    pad, in the key of the chosen stage.
//
// A step sequencer composes each eight-bar pass as it goes: the stage's
// accompaniment under a major-pentatonic tune built from a two-bar motif that
// is kept or reshaped from pass to pass, so it is familiar without repeating
// exactly; every fourth pass the tune rests for half the loop. The melody
// always lands on chord tones on the strong beats and ends on the tonic, so
// it cannot sound wrong. Instruments are rendered into buffers by
// instruments.js and cached by audio.js.
import { clamp, rand, pick, mtof } from './dsp.js';

export const STAGES = ['meadow', 'beach', 'garden', 'snow', 'forest'];

const PENTA = [0, 2, 4, 7, 9];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
// the i-th note up the major pentatonic scale from `base` (a midi note)
export const penta = (base, i) => base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];
// the triad on scale degree d (0 = I), in semitones above the tonic
const triad = (d) => [0, 2, 4].map((k) => MAJOR[(d + k) % 7] + (d + k >= 7 ? 12 : 0));

// ------------------------------------------------------------ patterns

// One-bar rhythms as [step, length in steps]; a bar of 4/4 has eight eighth-note steps.
const R8 = [
  [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]],
  [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2]],
  [[0, 3], [3, 1], [4, 2], [6, 1], [7, 1]],
  [[0, 2], [2, 2], [4, 1], [5, 1], [6, 2]],
  [[0, 1], [1, 2], [3, 1], [4, 2], [6, 1], [7, 1]],
];
const R8_SLOW = [
  [[0, 3], [3, 1], [4, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2]],
  [[0, 4], [4, 2], [6, 2]],
  [[0, 2], [2, 1], [3, 1], [4, 4]],
];
const END8 = [[0, 2], [2, 2], [4, 4]];
// and the lullaby's six-step bars
const R6 = [
  [[0, 3], [3, 2], [5, 1]],
  [[0, 2], [2, 1], [3, 3]],
  [[0, 3], [3, 3]],
  [[0, 1], [1, 1], [2, 1], [3, 3]],
];
const END6 = [[0, 3], [3, 3]];

// Chord progressions, eight bars, as scale degrees (0 = I, 3 = IV, 4 = V, 5 = vi).
const PROGS = [
  [0, 4, 5, 3, 0, 4, 3, 0],
  [0, 5, 3, 4, 0, 5, 3, 4],
  [0, 3, 0, 4, 0, 3, 4, 0],
];

// A stage's style. Patterns are [step, ..., velocity]: strum [step, vel, up];
// arp [step, chord tone, octave, vel]; bass [step, chord tone, octave, vel];
// shaker [step, vel, accent].
const bar8 = (f) => Array.from({ length: 8 }, (_, s) => f(s));
function style(tonic, o) {
  return {
    tonic, spb: 8, swing: 0, level: 1, progs: PROGS, rhythms: R8, end: END8, leadBase: tonic + 12, leadVel: 0.5,
    ...o,
    strum: o.strum && { base: tonic - 5, spread: 0.014, size: 3, ...o.strum },
    arp: o.arp && { base: tonic, ...o.arp },
    bass: o.bass && { base: tonic - 12, ...o.bass },
    pad: o.pad && { base: tonic, ...o.pad },
  };
}

const TUNES = {
  meadow: style(60, {
    bpm: 108, leads: ['marimba', 'glock'], leadVel: 0.5,
    strum: { inst: 'uke', pat: [[2, 1, 0], [3, 0.5, 1], [6, 1, 0], [7, 0.5, 1]] },
    bass: { inst: 'bass', pat: [[0, 0, 0, 1], [4, 2, -1, 0.85]] },
    shaker: bar8((s) => [s, s % 2 ? 0.35 : 0.6, s % 4 === 2 ? 1 : 0]),
  }),
  beach: style(55, {
    bpm: 100, swing: 0.1, leads: ['marimba', 'kalimba'], leadVel: 0.5,
    strum: { inst: 'uke', pat: [[2, 1, 0], [3, 0.45, 1], [6, 1, 0], [7, 0.45, 1]] },
    bass: { inst: 'bass', pat: [[0, 0, 0, 1], [3, 0, 0, 0.6], [4, 2, -1, 0.9], [7, 1, 0, 0.5]] },
    shaker: bar8((s) => [s, s % 2 ? 0.55 : 0.28, 0]),
  }),
  garden: style(62, {
    bpm: 88, leads: ['kalimba', 'musicbox'], leadVel: 0.45, rhythms: R8_SLOW,
    arp: { inst: 'harp', pat: [[0, 0, 0, 0.5], [1, 1, 0, 0.36], [2, 2, 0, 0.4], [3, 1, 1, 0.34], [4, 0, 1, 0.44], [5, 1, 1, 0.33], [6, 2, 0, 0.38], [7, 1, 0, 0.32]] },
    bass: { inst: 'bass', pat: [[0, 0, 0, 0.9], [4, 2, -1, 0.7]] },
    shaker: [[2, 0.3, 0], [6, 0.3, 0]],
  }),
  snow: style(53, {
    bpm: 84, leads: ['glock', 'celesta'], leadBase: 53 + 24, leadVel: 0.42, rhythms: R8_SLOW,
    arp: { inst: 'celesta', base: 53 + 12, pat: [[0, 0, 0, 0.36], [2, 1, 0, 0.3], [3, 2, 0, 0.3], [4, 1, 1, 0.34], [6, 2, 0, 0.28], [7, 1, 1, 0.27]] },
    bass: { inst: 'bass', pat: [[0, 0, 0, 0.85]] },
    shaker: [[0, 0.45, 1], [2, 0.3, 0], [4, 0.4, 0], [6, 0.3, 0]],
    jingle: true,
  }),
  forest: style(57, {
    bpm: 104, swing: 0.18, leads: ['marimba', 'kalimba'], leadVel: 0.5,
    strum: { inst: 'uke', pat: [[0, 0.8, 0], [3, 0.6, 1], [4, 0.8, 0], [7, 0.6, 1]] },
    bass: { inst: 'bass', pat: [[0, 0, 0, 1], [2, 2, 0, 0.55], [4, 0, 0, 0.85], [6, 2, -1, 0.6]] },
    shaker: bar8((s) => [s, s % 2 ? 0.28 : 0.5, 0]),
  }),
};

// The menu's lullaby, in the key of the stage on show.
function lullaby(tonic) {
  return style(tonic, {
    bpm: 66, spb: 6, leads: ['musicbox', 'celesta'], leadVel: 0.4, rhythms: R6, end: END6, level: 0.9,
    progs: [[0, 3, 0, 4, 0, 5, 3, 0], [0, 5, 3, 0, 0, 3, 4, 0]],
    arp: { inst: 'harp', pat: [[0, 0, 0, 0.36], [1, 1, 0, 0.26], [2, 2, 0, 0.28], [3, 1, 1, 0.3], [4, 2, 0, 0.24], [5, 1, 0, 0.22]] },
    bass: { inst: 'bass', pat: [[0, 0, 0, 0.8], [3, 2, -1, 0.5]] },
    pad: { vel: 0.045 },
  });
}

export const KEYS = Object.fromEntries(STAGES.map((s) => [s, TUNES[s].tonic]));

const FADE_IN = 0.5;
const FADE_OUT = 0.4;
// music bus levels per scene: under the effects while playing, fuller for the party
const SCENE_LEVEL = { menu: 0.85, playing: 0.55, celebrate: 0.8 };
const BASE = 0.34;

// Every (instrument, midi note) a style can play, so audio.js can render them
// ahead of time: the lead over its whole range, the chords it can use.
export function styleNotes(stage, mode) {
  const st = mode === 'lull' ? lullaby(TUNES[stage].tonic) : TUNES[stage];
  const seen = new Set();
  const out = [];
  const add = (inst, m) => {
    const key = inst + m;
    if (!seen.has(key)) {
      seen.add(key);
      out.push([inst, m]);
    }
  };
  for (const inst of st.leads) for (let i = 0; i <= TOP; i++) add(inst, penta(st.leadBase, i));
  const fold = (x, base) => base + ((((st.tonic + x - base) % 12) + 12) % 12);
  for (const deg of [0, 3, 4, 5]) {
    const ch = triad(deg);
    if (st.strum) for (const x of ch) add(st.strum.inst, fold(x, st.strum.base));
    if (st.arp) for (const [, tone, oct] of st.arp.pat) add(st.arp.inst, fold(ch[tone], st.arp.base) + 12 * oct);
    if (st.bass) for (const [, tone, oct] of st.bass.pat) add(st.bass.inst, st.bass.base + ch[tone] + 12 * oct);
  }
  if (st.shaker) {
    add('shaker', 0);
    add('shaker', 1);
  }
  if (st.jingle) {
    add('jingle', 0);
    add('jingle', 1);
  }
  return out;
}

export class Music {
  constructor(audio) {
    this.a = audio;
    const ctx = (this.ctx = audio.ctx);
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.duckG = ctx.createGain();
    this.fade.connect(this.duckG).connect(audio.musicBus);
    // left, centre, right and the bass, a little apart so it sounds like a small band on a table
    this.buses = [-0.28, 0.05, 0.28, 0].map((p) => {
      const s = ctx.createStereoPanner();
      s.pan.value = p;
      s.connect(this.fade);
      return s;
    });
    // the pad: a soft sawtooth with the top rolled off
    const amps = Array.from({ length: 10 }, (_, i) => Math.exp(-(i + 1) / 2.5) / (i + 1));
    const real = new Float32Array(amps.length + 1);
    const imag = new Float32Array(amps.length + 1);
    amps.forEach((v, i) => (imag[i + 1] = v));
    this.wave = ctx.createPeriodicWave(real, imag);
    this.running = false;
    this.pending = null;
    this.stage = 'meadow';
    this.scene = 'menu';
  }

  // the menu plays the lullaby, the game and the party the stage's tune
  modeFor(scene) {
    return scene === 'menu' ? 'lull' : 'tune';
  }

  level() {
    return BASE * SCENE_LEVEL[this.scene] * (this.style ? this.style.level : 1);
  }

  // Start the tune (or the lullaby, on the menu) of a stage, or change to it:
  // the old one fades and the new one begins from a fresh bar a moment later.
  start(stage = this.stage, scene = this.scene) {
    if (!TUNES[stage]) stage = 'meadow';
    this.stage = stage;
    this.scene = scene;
    const mode = this.modeFor(scene);
    const t = this.a.now();
    if (this.running) {
      const want = this.pending || { stage: this.cur.stage, mode: this.cur.mode };
      if (want.stage !== stage || want.mode !== mode) {
        this.fade.gain.cancelScheduledValues(t);
        this.fade.gain.setTargetAtTime(0, t, FADE_OUT);
        this.pending = { stage, mode };
        this.switchAt = t + 1.1;
      } else this.setLevel();
      return;
    }
    this.running = true;
    this.pending = null;
    this.begin(stage, mode, t + 0.15);
  }

  begin(stage, mode, t) {
    this.cur = { stage, mode };
    this.style = mode === 'lull' ? lullaby(TUNES[stage].tonic) : TUNES[stage];
    this.stepLen = 60 / this.style.bpm / 2;
    this.step = 0;
    this.next = t;
    this.planLoop = -1;
    this.motif = null;
    const g = this.fade.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.level(), t, FADE_IN);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.pending = null;
    const t = this.a.now();
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setTargetAtTime(0, t, 0.3);
  }

  // scene or stage changed while running: follow it
  setScene(scene) {
    this.scene = scene;
    if (this.running) this.start(this.stage, scene);
  }

  setStage(stage) {
    if (!TUNES[stage]) return;
    this.stage = stage;
    if (this.running) this.start(stage, this.scene);
  }

  setLevel() {
    if (!this.running || this.pending) return;
    const t = this.a.now();
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setTargetAtTime(this.level(), t, 0.6);
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
      // the timer fell behind (a long frame, a throttled tab, muted): skip ahead
      // rather than cram the missed notes in at once
      const k = Math.ceil((now - this.next) / this.stepLen);
      this.step += k;
      this.next += k * this.stepLen;
    }
    while (this.next < until) {
      if (this.pending && this.next >= this.switchAt) {
        const p = this.pending;
        this.pending = null;
        this.begin(p.stage, p.mode, this.next);
      }
      this.play(this.step, this.next);
      this.step++;
      this.next += this.stepLen;
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
    const bar = Math.floor(k / st.spb);
    const s = k % st.spb;
    const at = t + (st.spb === 8 && s % 2 === 1 ? st.swing * this.stepLen : 0);
    const evs = this.plan.steps[k];
    // the music's room is a send from the music bus, so the fade and the duck take the reverb with them
    if (evs) for (const [inst, m, vel, bus, jit] of evs) a.note(inst, m, at + jit, vel, 0, this.buses[bus], 0, 0);
    if (st.pad && s === 0) this.padChord(this.plan.chords[bar], t, this.stepLen * st.spb * 1.02);
  }

  // A soft sustained chord: the bar's triad folded into one octave, and its root below.
  padChord(deg, t, dur) {
    const st = this.style;
    const ch = triad(deg);
    const fold = (x, base) => base + ((((st.tonic + x - base) % 12) + 12) % 12);
    const notes = ch.map((x) => fold(x, st.pad.base));
    notes.push(fold(ch[0], st.pad.base) - 12);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    lp.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(st.pad.vel, t, 0.45);
    g.gain.setTargetAtTime(0, t + dur, 0.5);
    lp.connect(g).connect(this.buses[3]);
    let live = notes.length * 2;
    notes.forEach((m, i) => {
      for (const c of [-7, 6]) {
        const o = this.ctx.createOscillator();
        o.setPeriodicWave(this.wave);
        o.frequency.value = mtof(m);
        o.detune.value = c;
        const v = this.ctx.createGain();
        v.gain.value = i === 3 ? 0.6 : 1;
        o.connect(v).connect(lp);
        o.start(t);
        o.stop(t + dur + 3.5);
        o.onended = () => {
          v.disconnect();
          if (--live === 0) {
            lp.disconnect();
            g.disconnect();
          }
        };
      }
    });
  }

  // One eight-bar pass: the accompaniment, then the tune (A A' B A'').
  compose(loop) {
    const st = this.style;
    const spb = st.spb;
    const steps = [];
    const add = (step, ev) => (steps[step] || (steps[step] = [])).push(ev);
    const prog = st.progs[loop % st.progs.length];
    const fold = (x, base) => base + ((((st.tonic + x - base) % 12) + 12) % 12);
    prog.forEach((deg, bar) => {
      const ch = triad(deg);
      const o = bar * spb;
      if (st.arp) for (const [s, tone, oct, vel] of st.arp.pat) add(o + s, [st.arp.inst, fold(ch[tone], st.arp.base) + 12 * oct, vel * rand(0.88, 1.08), 2, rand(0, 0.008)]);
      if (st.strum) {
        const S = st.strum;
        const notes = ch.map((x) => fold(x, S.base)).sort((x, y) => x - y);
        if (S.size > 3) notes.push(notes[0] + 12);
        for (const [s, vel, up] of S.pat) {
          const order = up ? notes.slice().reverse() : notes;
          order.forEach((m, i) => add(o + s, [S.inst, m, vel * (1 - 0.07 * i) * rand(0.88, 1.1), 0, i * S.spread + rand(0, 0.005)]));
        }
      }
      if (st.bass) for (const [s, tone, oct, vel] of st.bass.pat) add(o + s, [st.bass.inst, st.bass.base + ch[tone] + 12 * oct, vel * rand(0.92, 1.05), 3, 0]);
      if (st.shaker) for (const [s, vel, acc] of st.shaker) add(o + s, ['shaker', acc, vel * 0.5 * rand(0.75, 1.1), 2, rand(0, 0.008)]);
      if (st.jingle && st.shaker) for (const [s, vel, acc] of st.shaker) if (s % 2 === 0) add(o + s, ['jingle', acc, vel * 0.4 * rand(0.75, 1.1), 1, rand(0, 0.008)]);
    });
    // the tune
    if (!this.motif || Math.random() < 0.6) this.motif = motif(st, this.motif);
    const lead = st.leads[loop % st.leads.length];
    const rest = loop % 4 === 3;
    let idx = pick([1, 2, 3, 4]);
    let prev = -1;
    for (let bar = 0; bar < 8; bar++) {
      const phrase = bar >> 1;
      const half = bar & 1;
      const pcs = triad(prog[bar]).map((x) => x % 12);
      const last = bar === 7;
      const fresh = phrase === 2;
      const rhythm = last ? st.end : fresh ? pick(st.rhythms) : this.motif.rhythm[half];
      rhythm.forEach(([s, l], k) => {
        let stepBy = fresh ? pick(STEPS) : this.motif.steps[half][k % this.motif.steps[half].length];
        if (phrase === 1 && half === 1 && k === 0) stepBy += 1; // the answer reaches a little higher
        if (idx + stepBy > TOP - 1 || idx + stepBy < 1) stepBy = -stepBy;
        idx = clamp(idx + stepBy, 0, TOP);
        // strong beats sit on a chord tone (and do not just repeat the last note); the tune ends on a chord tone,
        // the tonic whenever the last chord is I
        const strong = s === 0 || (spb === 8 && s === 4) || (spb === 6 && s === 3);
        if (last && k === rhythm.length - 1) idx = prog[bar] === 0 ? (idx >= 3 ? 5 : 0) : chordTone(idx, pcs, -1);
        else if (strong) idx = chordTone(idx, pcs, Math.random() < 0.25 ? -1 : prev);
        prev = idx;
        if (rest && bar < 4) return;
        add(bar * spb + s, [lead, penta(st.leadBase, idx), st.leadVel * (s === 0 ? 1 : 0.82) * (l > 3 ? 1.05 : 1) * rand(0.88, 1.08), 1, rand(0, 0.006)]);
      });
    }
    return { steps, chords: prog };
  }
}

// the tune lives on pentatonic notes 0..TOP above the lead's base note (a little over an octave and a half)
const TOP = 7;
// steps up or down the pentatonic scale between melody notes
const STEPS = [-2, -1, -1, 0, 1, 1, 2, -1, 1];

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

// The nearest pentatonic index whose note belongs to the chord, keeping off `avoid` (the note just played) if it can.
function chordTone(idx, pcs, avoid) {
  let fallback = idx;
  for (const d of [0, -1, 1, -2, 2]) {
    const j = idx + d;
    if (j >= 0 && j <= TOP && pcs.includes(PENTA[j % 5])) {
      if (j !== avoid) return j;
      fallback = j;
    }
  }
  return fallback;
}
