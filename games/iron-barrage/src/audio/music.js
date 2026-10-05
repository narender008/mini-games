// The score: original, procedural, a dark cinematic war score in D minor made
// of live Web Audio instruments (no samples):
//   strings   detuned saws through a slowly breathing low-pass: a drone that
//             follows the chords, and tremolo strings on top at high intensity
//   drums     taiko-like toms (a sine falling in pitch plus a thud of noise),
//             a military snare, rolls and fills
//   brass     saw pairs through a filter that opens as the note speaks: stabs,
//             slow swells, a long low horn
//   pulse     a plucked low ostinato that tightens as the fight does
// A lookahead scheduler (a timer every 25 ms scheduling on audio-clock time a
// moment ahead) plays them. Tracks: 'menu' (brooding, slow), 'battle' (a tense
// pulse whose layers follow setIntensity), 'victory' (a brass swell resolving
// to D major in about six seconds, then a quiet bed), 'defeat' (a low sombre
// chord for about six seconds, then a faint bed). Switching crossfades.
import { clamp, mtof } from './dsp.js';

const LOOK = 0.2; // seconds scheduled ahead
const TICK = 25; // ms between scheduler runs

// MIDI notes
const D2 = 38;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- instruments

function gain(ctx, v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

// free a note's nodes when its first oscillator or noise source has ended
function done(src, ...nodes) {
  src.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

// A drum: a sine falling from f0 to f1 and a thud of low-passed noise.
// kind: taiko | tom | low | soft | snare
const DRUMS = {
  taiko: { f0: 150, f1: 56, fall: 0.1, dec: 0.8, noise: 0.4, nf: 800, ndec: 0.07, nq: 0.7 },
  tom: { f0: 215, f1: 96, fall: 0.07, dec: 0.45, noise: 0.28, nf: 1300, ndec: 0.05, nq: 0.7 },
  low: { f0: 100, f1: 40, fall: 0.18, dec: 1.5, noise: 0.25, nf: 500, ndec: 0.12, nq: 0.7 },
  soft: { f0: 92, f1: 48, fall: 0.07, dec: 0.5, noise: 0, nf: 400, ndec: 0.05, nq: 0.7 },
};

function drum(ctx, dest, noiseBuf, t, kind, vel, rate = 1) {
  if (kind === 'snare') {
    const g = gain(ctx, 0);
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2300;
    bp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1000;
    n.connect(bp).connect(hp).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.7, t + 0.002);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0008, vel * 0.1), t + 0.045);
    // the drag: a second stroke a hair behind the first
    g.gain.setValueAtTime(vel * 0.3, t + 0.045);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.17);
    n.start(t, Math.random() * 1.5);
    n.stop(t + 0.2);
    const o = ctx.createOscillator();
    const og = gain(ctx, 0);
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    o.connect(og).connect(dest);
    og.gain.setValueAtTime(vel * 0.4, t);
    og.gain.exponentialRampToValueAtTime(0.0008, t + 0.08);
    o.start(t);
    o.stop(t + 0.1);
    done(n, g, bp, hp);
    done(o, og);
    return;
  }
  const d = DRUMS[kind] || DRUMS.taiko;
  const o = ctx.createOscillator();
  const g = gain(ctx, 0);
  o.frequency.setValueAtTime(d.f0 * rate, t);
  o.frequency.exponentialRampToValueAtTime(d.f1 * rate, t + d.fall);
  o.connect(g).connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0008, t + d.dec);
  o.start(t);
  o.stop(t + d.dec + 0.05);
  done(o, g);
  if (d.noise) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = d.nf;
    lp.Q.value = d.nq;
    const ng = gain(ctx, 0);
    n.connect(lp).connect(ng).connect(dest);
    ng.gain.setValueAtTime(vel * d.noise, t);
    ng.gain.exponentialRampToValueAtTime(0.0008, t + d.ndec);
    n.start(t, Math.random() * 1.5);
    n.stop(t + d.ndec + 0.05);
    done(n, lp, ng);
  }
}

// brass: each note two saws a few cents apart; the filter opens as the note speaks.
// o = { att, rel, f0, f1, f2 }
function brass(ctx, dest, t, dur, midis, vel, o = {}) {
  const att = o.att ?? 0.07;
  const rel = o.rel ?? 0.3;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.1;
  lp.frequency.setValueAtTime(o.f0 ?? 350, t);
  lp.frequency.exponentialRampToValueAtTime(o.f1 ?? 1900, t + att * 1.4);
  lp.frequency.exponentialRampToValueAtTime(o.f2 ?? 1000, t + Math.max(dur, att * 2));
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + att);
  g.gain.setValueAtTime(vel * 0.85, t + Math.max(att, dur - 0.05));
  g.gain.linearRampToValueAtTime(0, t + dur + rel);
  lp.connect(g).connect(dest);
  const per = 0.5 / Math.sqrt(midis.length);
  let first = null;
  for (const m of midis) {
    for (const det of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = mtof(m);
      osc.detune.value = det;
      const og = gain(ctx, per);
      osc.connect(og).connect(lp);
      osc.start(t);
      osc.stop(t + dur + rel + 0.05);
      if (!first) first = osc;
      else done(osc, og);
    }
  }
  done(first, lp, g);
}

// a plucked low pulse: a saw and a square an octave down through a closing, resonant filter
function pluck(ctx, dest, t, midi, vel, len = 0.2) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 4;
  lp.frequency.setValueAtTime(500 + 1400 * vel, t);
  lp.frequency.exponentialRampToValueAtTime(240, t + len * 0.8);
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  lp.connect(g).connect(dest);
  const a = ctx.createOscillator();
  a.type = 'sawtooth';
  a.frequency.value = mtof(midi);
  const b = ctx.createOscillator();
  b.type = 'square';
  b.frequency.value = mtof(midi - 12);
  const bg = gain(ctx, 0.6);
  a.connect(lp);
  b.connect(bg).connect(lp);
  a.start(t);
  b.start(t);
  a.stop(t + len + 0.05);
  b.stop(t + len + 0.05);
  done(a, lp, g, bg);
}

// a swell of bright noise (a cymbal rushing in) and its crash
function cymbal(ctx, dest, noiseBuf, t, rise, crash, vel) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  n.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5500;
  const g = gain(ctx, 0);
  n.connect(hp).connect(g).connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  if (rise > 0) g.gain.exponentialRampToValueAtTime(vel * 0.5, t + rise);
  g.gain.setValueAtTime(vel * 0.5, t + rise);
  g.gain.linearRampToValueAtTime(vel, t + rise + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + rise + crash);
  n.start(t, Math.random());
  n.stop(t + rise + crash + 0.1);
  done(n, hp, g);
}

// a low gong: a few inharmonic partials ringing for seconds
function gong(ctx, dest, t, midi, vel, dur = 4) {
  const f = mtof(midi);
  for (const [ratio, a, d] of [[1, 1, 1], [1.51, 0.6, 0.8], [2.37, 0.4, 0.6], [3.1, 0.25, 0.45]]) {
    const o = ctx.createOscillator();
    const g = gain(ctx, 0);
    o.frequency.value = f * ratio;
    o.connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * a * 0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur * d);
    o.start(t);
    o.stop(t + dur * d + 0.05);
    done(o, g);
  }
}

// Strings: for each voice three saws a few cents apart, all through one
// low-pass whose cut-off breathes slowly. setChord glides the notes.
class Strings {
  constructor(ctx, dest, voices, t, { cut = 600, breath = 220, rate = 0.07, det = 11 } = {}) {
    this.ctx = ctx;
    this.out = gain(ctx, 0);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.8;
    this.lp.frequency.value = cut;
    this.lp.connect(this.out).connect(dest);
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = rate;
    this.lfoG = gain(ctx, breath);
    this.lfo.connect(this.lfoG).connect(this.lp.frequency);
    this.lfo.start(t);
    this.oscs = [this.lfo];
    this.nodes = [this.out, this.lp, this.lfoG];
    this.voices = [];
    for (let v = 0; v < voices; v++) {
      const vg = gain(ctx, 1 / Math.sqrt(voices));
      vg.connect(this.lp);
      this.nodes.push(vg);
      const list = [];
      for (const d of [-det, 0, det]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = d;
        o.frequency.value = 55;
        o.connect(vg);
        o.start(t);
        list.push(o);
        this.oscs.push(o);
      }
      this.voices.push(list);
    }
  }

  setChord(midis, t, glide = 1.0) {
    for (let v = 0; v < this.voices.length; v++) {
      const f = mtof(midis[v % midis.length]);
      for (const o of this.voices[v]) o.frequency.setTargetAtTime(f, t, glide / 3);
    }
  }

  level(v, t, tc = 1) {
    this.out.gain.setTargetAtTime(v, t, tc);
  }

  cut(f, t, tc = 1) {
    this.lp.frequency.setTargetAtTime(f, t, tc);
  }

  dispose(t) {
    for (const o of this.oscs) {
      try {
        o.stop(t);
      } catch {
        /* already stopped */
      }
    }
    this.lfo.onended = () => {
      for (const n of this.nodes) n.disconnect();
    };
  }
}

// tremolo strings: the same idea an octave or two up, shimmering at about 10 Hz
class Tremolo {
  constructor(ctx, dest, t) {
    this.out = gain(ctx, 0);
    this.trem = gain(ctx, 0.55);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 2200;
    this.lp.Q.value = 0.7;
    this.lp.connect(this.trem).connect(this.out).connect(dest);
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 10.5;
    this.lfoG = gain(ctx, 0.45);
    this.lfo.connect(this.lfoG).connect(this.trem.gain);
    this.lfo.start(t);
    this.oscs = [this.lfo];
    this.voices = [];
    for (let v = 0; v < 3; v++) {
      const vg = gain(ctx, 0.3);
      vg.connect(this.lp);
      const list = [];
      for (const d of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = d;
        o.frequency.value = 220;
        o.connect(vg);
        o.start(t);
        list.push(o);
        this.oscs.push(o);
      }
      this.voices.push(list);
    }
    this.nodes = [this.out, this.trem, this.lp, this.lfoG];
  }

  setChord(midis, t) {
    for (let v = 0; v < 3; v++) {
      const f = mtof(midis[v % midis.length]);
      for (const o of this.voices[v]) o.frequency.setTargetAtTime(f, t, 0.4);
    }
  }

  level(v, t) {
    this.out.gain.setTargetAtTime(v, t, 0.8);
  }

  dispose(t) {
    for (const o of this.oscs) {
      try {
        o.stop(t);
      } catch {
        /* already stopped */
      }
    }
    this.lfo.onended = () => {
      for (const n of this.nodes) n.disconnect();
    };
  }
}

// ---------------------------------------------------------------- chords

// roots and the chord tones above them, as MIDI notes
const DM = { root: D2, drone: [D2, D2 + 7, D2 + 12, D2 + 15], pad: [D2 + 24, D2 + 27, D2 + 31], semis: [0, 3, 7] };
const BB = { root: 34, drone: [34, 41, 46, 50], pad: [46, 50, 53], semis: [0, 4, 7] };
const GM = { root: 31, drone: [31, 38, 43, 46], pad: [43, 46, 50], semis: [0, 3, 7] };
const A = { root: 33, drone: [33, 40, 45, 49], pad: [45, 49, 52], semis: [0, 4, 7] };
const PROG = [DM, BB, GM, A];

// ---------------------------------------------------------------- tracks

class Track {
  constructor(m, name) {
    this.m = m;
    this.name = name;
    this.ctx = m.s.ctx;
    this.bus = gain(this.ctx, 0);
    this.trim = 1; // set by a track that plays louder or softer than the rest
    this.bus.connect(m.s.musicBus);
    this.noise = m.s.noiseBuf;
    this.parts = [];
    this.t0 = Math.max(this.ctx.currentTime, 0) + 0.08;
    this.nextT = this.t0;
    this.n = 0;
    this.live = true;
  }

  fadeIn(tc = 0.5) {
    const t = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(this.trim, t, this.fade ?? tc);
  }

  fadeOut(tc = 0.4) {
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, tc);
    this.live = false;
  }

  dispose() {
    const t = this.ctx.currentTime;
    for (const p of this.parts) p.dispose(t + 0.05);
    this.bus.disconnect();
    this.live = false;
  }

  schedule() {}
}

// brooding: a drone on the chords, a heartbeat, a low horn that rarely speaks, a faint high shimmer
class MenuTrack extends Track {
  constructor(m) {
    super(m, 'menu');
    const c = this.ctx;
    this.dt = 60 / 52;
    this.strings = new Strings(c, this.bus, 4, this.t0, { cut: 380, breath: 140, rate: 0.05 });
    this.parts.push(this.strings);
    this.strings.setChord(DM.drone, this.t0, 0.1);
    this.strings.level(0.42, this.t0, 2.5);
    this.shim = [c.createOscillator(), c.createOscillator()];
    this.shimG = gain(c, 0);
    this.shim[0].frequency.value = mtof(93);
    this.shim[1].frequency.value = mtof(94);
    for (const o of this.shim) {
      o.connect(this.shimG);
      o.start(this.t0);
    }
    this.shimG.connect(this.bus);
    this.parts.push({
      dispose: (t) => {
        for (const o of this.shim) o.stop(t);
        this.shim[0].onended = () => this.shimG.disconnect();
      },
    });
    this.melody = [
      // bar-in-cycle, beat, beats long, midi
      [0, 0, 4, 50], [1, 0, 2, 53], [1, 2, 2, 52], [2, 0, 4, 50], [3, 0, 2, 45],
      [4, 0, 4, 46], [5, 0, 2, 50], [5, 2, 2, 48], [6, 0, 4, 46],
      [8, 0, 4, 43], [9, 0, 2, 46], [9, 2, 2, 45], [10, 0, 4, 43],
      [12, 0, 4, 45], [13, 0, 2, 49], [13, 2, 2, 50], [14, 0, 4, 52],
    ];
  }

  schedule(upTo) {
    while (this.nextT < upTo) {
      const t = this.nextT;
      const beat = this.n % 4;
      const bar = Math.floor(this.n / 4);
      const cyc = bar % 16;
      if (beat === 0) {
        const chord = PROG[(cyc >> 2) & 3];
        if (bar % 4 === 0) this.strings.setChord(chord.drone, t, 3);
        // a heartbeat, lub-dub
        drum(this.ctx, this.bus, this.noise, t, 'soft', 0.5);
        drum(this.ctx, this.bus, this.noise, t + 0.42, 'soft', 0.32);
        if (bar % 2 === 0) drum(this.ctx, this.bus, this.noise, t, 'low', 0.36);
        // the shimmer swells and fades over the long cycle
        if (cyc === 8) this.shimG.gain.setTargetAtTime(0.004, t, 3);
        if (cyc === 0) this.shimG.gain.setTargetAtTime(0.0, t, 3);
      }
      for (const [b, bt, len, midi] of this.melody) {
        if (b === cyc && bt === beat) brass(this.ctx, this.bus, t, len * this.dt * 0.95, [midi], 0.2, { att: 0.9, rel: 1.4, f0: 260, f1: 700, f2: 520 });
      }
      this.nextT += this.dt;
      this.n++;
    }
  }
}

// the fight: sixteenth-note steps at 96 bpm; layers come in with the intensity
const OST = [0, 0, 2, 0, 0, 1, 0, 2]; // chord-tone index for each eighth of the pulse (0 root, 1 third, 2 fifth)
class BattleTrack extends Track {
  constructor(m) {
    super(m, 'battle');
    const c = this.ctx;
    this.dt = 60 / 96 / 4;
    this.strings = new Strings(c, this.bus, 4, this.t0, { cut: 520, breath: 200, rate: 0.09 });
    this.trem = new Tremolo(c, this.bus, this.t0);
    this.parts.push(this.strings, this.trem);
    this.strings.setChord(DM.drone, this.t0, 0.1);
    this.trem.setChord([DM.root + 24, DM.root + 27, DM.root + 31], this.t0);
  }

  schedule(upTo) {
    const c = this.ctx;
    const bus = this.bus;
    const nz = this.noise;
    while (this.nextT < upTo) {
      const t = this.nextT;
      const i = this.m.int;
      const s = this.n % 16;
      const bar = Math.floor(this.n / 16);
      const chord = PROG[(bar >> 1) & 3];
      const hum = () => (Math.random() - 0.5) * 0.008;
      if (s === 0 && (bar & 1) === 0) {
        this.strings.setChord(chord.drone, t, 1.4);
        this.trem.setChord([chord.root + 24, chord.root + 12 + chord.semis[1] + 12, chord.root + 12 + chord.semis[2] + 12], t);
      }
      if (s === 0) {
        this.strings.level(0.3 + 0.3 * i, t, 0.8);
        this.strings.cut(520 + 900 * i, t, 0.8);
        this.trem.level(0.34 * smooth(0.28, 0.7, i), t);
      }
      // drums
      if (s === 0) drum(c, bus, nz, t, 'taiko', 0.4 + 0.5 * i);
      if (s === 0 && (bar & 3) === 0 && i > 0.35) drum(c, bus, nz, t, 'low', 0.5 + 0.4 * i);
      if (s === 8 && i >= 0.3) drum(c, bus, nz, t, 'taiko', 0.3 + 0.35 * i);
      if ((s === 6 || s === 14) && i >= 0.5) drum(c, bus, nz, t + hum(), 'tom', 0.25 + 0.3 * i, 0.9);
      if ((s === 3 || s === 11) && i >= 0.62) drum(c, bus, nz, t + hum(), 'tom', 0.14 + 0.2 * i, 1.2);
      if (i >= 0.7 && s % 2 === 0 && s !== 0 && s !== 8 && s !== 6 && s !== 14) drum(c, bus, nz, t + hum(), 'tom', 0.16 + 0.22 * i, [1, 0.85, 1.15][(s >> 1) % 3]);
      if ((s === 4 || s === 12) && i >= 0.6) drum(c, bus, nz, t + hum(), 'snare', 0.3 + 0.3 * i);
      if (s === 15 && i >= 0.8) drum(c, bus, nz, t + hum(), 'snare', 0.18);
      if (i >= 0.45 && (bar & 3) === 3 && s >= 12) drum(c, bus, nz, t, 'tom', 0.2 + 0.12 * (s - 12) * i, 1.05 - 0.05 * (s - 12));
      // the pulse: quarters at first, eighths, then sixteenths
      {
        const q = s % 4 === 0;
        const e = s % 2 === 0;
        if ((i < 0.2 && q) || (i >= 0.2 && i < 0.75 && e) || i >= 0.75) {
          const eighth = (s >> 1) & 7;
          const semi = chord.semis[OST[eighth]] + (s % 2 ? 12 : 0);
          const accent = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.75 : 0.5;
          pluck(c, bus, t, chord.root + 24 + semi, (0.17 + 0.45 * i) * accent, s % 2 ? 0.1 : 0.17);
        }
      }
      // brass
      if (i >= 0.5 && s === 0 && (bar & 1) === 0) brass(c, bus, t, 0.7, [chord.root + 12, chord.root + 19, chord.root + 24], 0.3 + 0.35 * (i - 0.5), { att: 0.06, f0: 380, f1: 2000, f2: 900 });
      if (i >= 0.8 && s === 10) brass(c, bus, t, 0.22, [chord.root + 12, chord.root + 19], 0.3, { att: 0.04, f1: 1800, f2: 800, rel: 0.12 });
      // a crash every eight bars, rushing in the bar before
      if (i >= 0.6 && (bar & 7) === 7 && s === 8) cymbal(c, bus, nz, t, 1.1, 1.6, 0.18);
      if (i >= 0.6 && (bar & 7) === 0 && s === 0) gong(c, bus, t, 43, 0.4, 3);
      this.nextT += this.dt;
      this.n++;
    }
  }
}

// brass swelling through B flat and A to a full D major, drums rolling under, a gong, then a quiet bed
class VictoryTrack extends Track {
  constructor(m) {
    super(m, 'victory');
    this.trim = 2.0;
    this.fade = 0.03;
    const c = this.ctx;
    const t0 = this.t0;
    const bus = this.bus;
    const nz = this.noise;
    this.bed = new Strings(c, bus, 4, t0, { cut: 500, breath: 120, rate: 0.05, det: 8 });
    this.parts.push(this.bed);
    this.bed.setChord([D2, D2 + 7, D2 + 12, D2 + 16], t0, 0.1);
    this.bed.level(0.3, t0 + 5.2, 1.2);
    // a roll that grows
    for (let k = 0; k < 26; k++) drum(c, bus, nz, t0 + k * 0.09, 'tom', 0.12 + 0.5 * (k / 26), 0.95);
    brass(c, bus, t0, 1.25, [46, 50, 53, 58], 0.5, { att: 1.0, rel: 0.2, f0: 300, f1: 1500, f2: 1300 });
    brass(c, bus, t0 + 1.2, 1.25, [45, 49, 52, 57], 0.62, { att: 0.6, rel: 0.15, f0: 450, f1: 1900, f2: 1600 });
    brass(c, bus, t0 + 2.4, 3.6, [38, 45, 50, 54, 57, 62], 0.85, { att: 0.12, rel: 1.2, f0: 500, f1: 2400, f2: 1100 });
    brass(c, bus, t0 + 2.4, 1.0, [74, 81], 0.25, { att: 0.08, rel: 0.5, f0: 700, f1: 3000, f2: 1400 });
    cymbal(c, bus, nz, t0 + 1.4, 1.0, 2.4, 0.3);
    drum(c, bus, nz, t0 + 2.4, 'low', 1.1);
    drum(c, bus, nz, t0 + 2.4, 'taiko', 0.9);
    drum(c, bus, nz, t0 + 3.0, 'taiko', 0.55);
    drum(c, bus, nz, t0 + 3.6, 'taiko', 0.45);
    gong(c, bus, t0 + 2.4, 38, 0.55, 5);
    this.done = true;
  }
}

// a low chord that sinks away, a funeral drum, one long horn, a gong
class DefeatTrack extends Track {
  constructor(m) {
    super(m, 'defeat');
    this.trim = 1.0;
    this.fade = 0.03;
    const c = this.ctx;
    const t0 = this.t0;
    const bus = this.bus;
    const nz = this.noise;
    this.str = new Strings(c, bus, 4, t0, { cut: 900, breath: 80, rate: 0.04 });
    this.parts.push(this.str);
    this.str.setChord([D2, D2 + 7, D2 + 8, D2 + 15], t0, 0.1);
    this.str.level(0.55, t0 + 0.05, 0.5);
    this.str.cut(300, t0 + 0.5, 2.2);
    this.str.level(0.07, t0 + 4.0, 1.4);
    gong(c, bus, t0, 26, 0.5, 5);
    drum(c, bus, nz, t0, 'low', 0.8);
    [[1.2, 0.6], [2.4, 0.45], [3.6, 0.3], [4.8, 0.18]].forEach(([dt, v]) => drum(c, bus, nz, t0 + dt, 'soft', v));
    brass(c, bus, t0 + 0.9, 3.2, [46, 58], 0.28, { att: 1.3, rel: 1.8, f0: 220, f1: 650, f2: 420 });
    this.done = true;
  }
}

const TRACKS = { menu: MenuTrack, battle: BattleTrack, victory: VictoryTrack, defeat: DefeatTrack };

// ---------------------------------------------------------------- the player

export class Music {
  constructor(sound) {
    this.s = sound;
    this.cur = null;
    this.old = [];
    this.timer = 0;
    this.target = 0;
    this.int = 0;
    this.lastT = 0;
  }

  // start (or switch to) a track, or fade to silence with null
  play(name) {
    const s = this.s;
    if (!s.ctx || !s.musicBus) return;
    if (this.cur && this.cur.name === name && this.cur.live) return;
    if (this.cur) {
      this.cur.fadeOut(name ? 0.5 : 0.7);
      this.old.push({ track: this.cur, until: s.ctx.currentTime + 6 });
      this.cur = null;
    }
    if (TRACKS[name]) {
      this.cur = new TRACKS[name](this);
      this.cur.fadeIn(0.6);
      this.lastT = s.ctx.currentTime;
      this.arm();
    }
  }

  setIntensity(v, instant = false) {
    this.target = clamp(Number(v) || 0, 0, 1);
    if (instant) this.int = this.target;
  }

  arm() {
    if (this.timer || this.s.offline) return;
    this.timer = setInterval(() => this.pump(), TICK);
  }

  // schedule what falls before `upTo` (default: a moment ahead of now)
  pump(upTo) {
    const ctx = this.s.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (!this.s.offline && ctx.state !== 'running') return;
    const dt = Math.max(0, now - this.lastT);
    this.lastT = now;
    this.int += (this.target - this.int) * (1 - Math.exp(-dt / 1.2));
    const horizon = upTo ?? now + LOOK;
    const c = this.cur;
    if (c) {
      if (!this.s.offline && c.nextT < now - 0.05) c.nextT = now + 0.02;
      if (c.schedule) c.schedule(horizon);
    }
    for (let k = this.old.length - 1; k >= 0; k--) {
      if (now >= this.old[k].until) {
        this.old[k].track.dispose();
        this.old.splice(k, 1);
      }
    }
    if (!c && !this.old.length && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  dispose() {
    clearInterval(this.timer);
    this.timer = 0;
  }
}
