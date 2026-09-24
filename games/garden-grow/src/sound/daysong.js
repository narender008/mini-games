// Calm, happy garden music for the day, composed as it plays. Eight-bar
// sections over gentle progressions in C major, each with its own
// arrangement: a fingerpicked nylon guitar, a felt piano or kalimba tune, a
// soft flute, a warm pad and a round bass. Every section gets a new melody
// built from a little motif that is stated, answered and brought home, so a
// long play never loops audibly. The tunes keep to the major pentatonic
// (plus chord tones on the beat), the same notes the garden's chimes use.
import { midiHz } from './instruments.js';

const BPM = 74;
const STEP = 60 / BPM / 2; // an eighth note
const PENTA = [0, 2, 4, 7, 9];

const CHORDS = { C: [0, 4, 7], Dm: [2, 5, 9], Em: [4, 7, 11], F: [5, 9, 0], G: [7, 11, 2], Am: [9, 0, 4] };
const GUITAR_BASS = { C: 48, Dm: 50, Em: 52, F: 41, G: 43, Am: 45 };

const PROGRESSIONS = [
  ['C', 'Am', 'F', 'G'],
  ['C', 'F', 'Am', 'G'],
  ['F', 'G', 'Em', 'Am'],
  ['C', 'Em', 'F', 'G'],
  ['Am', 'F', 'C', 'G'],
  ['C', 'G', 'Am', 'F'],
  ['F', 'C', 'Dm', 'G'],
  ['C', 'F', 'C', 'G'],
  ['Dm', 'G', 'C', 'Am'],
];

// fingerpicking patterns: one entry per eighth, an index into the chord's
// [bass, and four strings above] voicing, -1 to let it ring
const PICKS = [
  [0, 2, 3, 2, 1, 2, 3, 2],
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, -1, 2, 3, 1, -1, 3, 2],
  [0, 3, 2, 3, 1, 3, 2, 3],
  [0, -1, -1, 2, -1, 3, -1, -1],
];

// melody rhythms for one bar, in eighths (negative = a rest)
const RHYTHMS = [[4, 4], [2, 2, 4], [3, 1, 4], [2, 4, 2], [4, 2, 2], [-2, 2, 4], [2, 2, 2, 2], [6, 2], [3, 1, 2, 2], [-4, 2, 2], [2, 1, 1, 4]];
const SLOW = [[8], [4, 4], [6, 2], [-2, 6], [4, -2, 2]];
const ENDINGS = [[8], [4, 4], [2, 6], [-2, 6]];

const ARRANGEMENTS = [
  { id: 'open', guitar: 1, pad: 0.8, bass: 0, lead: null, pick: 4 },
  { id: 'piano', guitar: 0.75, pad: 0.6, bass: 0.8, lead: 'piano' },
  { id: 'kalimba', guitar: 0.5, pad: 0.9, bass: 0.8, lead: 'kalimba' },
  { id: 'flute', guitar: 0.85, pad: 0.5, bass: 0.7, lead: 'flute' },
  { id: 'duet', guitar: 0.6, pad: 0.6, bass: 0.8, lead: 'piano', answer: 'kalimba' },
  { id: 'still', guitar: 0, pad: 1, bass: 0.6, lead: 'kalimba', slow: true },
];

const RANGE = { piano: [67, 84], kalimba: [72, 88], flute: [72, 84] };

// each voice's level in the mix
const MIX = { guitar: 0.17, piano: 0.19, kalimba: 0.14, flute: 0.06, pad: 0.022, bass: 0.11 };

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const inRange = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12);

function voicing(name) {
  const pcs = CHORDS[name];
  const up = [];
  for (let m = 55; m <= 72 && up.length < 4; m++) if (pcs.includes(m % 12)) up.push(m);
  return [GUITAR_BASS[name], ...up];
}
const VOICING = Object.fromEntries(Object.keys(CHORDS).map((c) => [c, voicing(c)]));
const PAD = Object.fromEntries(Object.entries(CHORDS).map(([c, pcs]) => [c, pcs.map((pc) => inRange(pc, 53)).sort((a, b) => a - b)]));
const BASS = Object.fromEntries(Object.entries(CHORDS).map(([c, pcs]) => [c, inRange(pcs[0], 36)]));

// ------------------------------------------------------------ melody

function allowed(m, tones, strong) {
  const pc = m % 12;
  return strong ? tones.includes(pc) : tones.includes(pc) || PENTA.includes(pc);
}

// the allowed note nearest to x (ties broken at random)
function snap(x, tones, strong, lo, hi) {
  let best = null;
  let bestD = 99;
  for (let m = lo; m <= hi; m++) {
    if (!allowed(m, tones, strong)) continue;
    const d = Math.abs(m - x) + Math.random() * 0.5;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best ?? x;
}

// a next note: mostly steps, leaning the way the phrase is heading, chord
// tones on the beat
function choose(prev, tones, strong, lean, lo, hi) {
  let best = prev;
  let bestS = -1e9;
  for (let m = Math.max(lo, prev - 7); m <= Math.min(hi, prev + 7); m++) {
    if (!allowed(m, tones, strong)) continue;
    let s = -Math.abs(m - prev - 2 * lean) * 0.6 + Math.random() * 1.6;
    if (strong && tones.includes(m % 12)) s += 1;
    if (m === prev) s -= 1.2;
    if (Math.abs(m - prev) > 4) s -= 1;
    if (s > bestS) {
      bestS = s;
      best = m;
    }
  }
  return best;
}

// a phrase ending: the chord's root (home) or a third or fifth (half-way)
function cadence(prev, tones, lo, hi, home) {
  const want = home ? [tones[0]] : [tones[1], tones[2]];
  return snap(prev, want, true, lo, hi);
}

function melody(chords, inst, slow) {
  const [lo, hi] = RANGE[inst];
  const rhythms = slow || inst === 'flute' ? SLOW : RHYTHMS;
  const a = pick(rhythms);
  const b = pick(rhythms);
  const bars = [a, b, a, pick(ENDINGS), a, b, a, pick(ENDINGS)];
  const lean = [1, 1, 0, -1, 1, 0, -1, -1];
  const notes = [];
  const motif = [];
  let recall = 0;
  let prev = lo + Math.round((hi - lo) * 0.4);
  for (let bar = 0; bar < 8; bar++) {
    const tones = CHORDS[chords[bar]];
    const rh = bars[bar];
    let lastNote = -1;
    rh.forEach((d, k) => d > 0 && (lastNote = k));
    let slot = 0;
    rh.forEach((d, k) => {
      const len = Math.abs(d);
      if (d > 0) {
        const strong = slot === 0 || slot === 4;
        let m;
        if ((bar === 3 || bar === 7) && k === lastNote) m = cadence(prev, tones, lo, hi, bar === 7);
        else if (bar >= 4 && bar <= 6 && recall < motif.length) {
          // the answer recalls the motif's shape, fitted to its own chords
          const target = recall === 0 ? motif[0] : prev + motif[recall] - motif[recall - 1];
          m = snap(Math.max(lo, Math.min(hi, target)), tones, strong, lo, hi);
          recall++;
        } else m = choose(prev, tones, strong, lean[bar], lo, hi);
        if (bar <= 2) motif.push(m);
        notes.push({ at: bar * 8 + slot, len, midi: m, vel: (strong ? 1 : 0.82) * (0.9 + Math.random() * 0.1) });
        prev = m;
      }
      slot += len;
    });
  }
  return notes;
}

// ------------------------------------------------------------ the band

export class DaySong {
  constructor(audio, dest) {
    const ctx = audio.ctx;
    this.ctx = ctx;
    this.inst = audio.inst;
    this.noise = audio.noise;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    const panned = (pan) => {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      p.connect(this.out);
      return p;
    };
    this.guitarBus = panned(-0.25);
    this.leadBus = panned(0.18);
    this.lowBus = panned(0);
    // the pad shares one soft low-pass that opens and closes very slowly
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 850;
    this.padFilter.Q.value = 0.5;
    this.padFilter.connect(this.lowBus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const depth = ctx.createGain();
    depth.gain.value = 200;
    lfo.connect(depth).connect(this.padFilter.frequency);
    lfo.start();
    // a breathy flute: a few soft harmonics
    this.fluteWave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.22, 0.08, 0.03]));
    this.live = false;
    this.offAt = 0;
    this.arr = null;
  }

  // Start again from a fresh section at time t.
  reset(t) {
    this.next = t;
    this.step = 0;
    this.first = true;
  }

  pump(until) {
    const now = this.ctx.currentTime;
    if (this.next < now) this.next = now + 0.05; // running late: carry on, never cram
    while (this.next < until) {
      const s = this.step % 64;
      if (s === 0) this.compose();
      this.play(s, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  compose() {
    const a = pick(PROGRESSIONS);
    const b = Math.random() < 0.6 ? a : pick(PROGRESSIONS);
    this.chords = [...a, ...b];
    let arr = ARRANGEMENTS[0];
    if (!this.first) {
      do arr = pick(ARRANGEMENTS);
      while (arr === this.arr);
    }
    this.first = false;
    this.arr = arr;
    this.pick = PICKS[arr.pick ?? Math.floor(Math.random() * 4)];
    this.notes = new Map();
    if (arr.lead) for (const n of melody(this.chords, arr.lead, arr.slow)) this.notes.set(n.at, n);
  }

  play(s, t) {
    const bar = s >> 3;
    const slot = s & 7;
    const name = this.chords[bar];
    const arr = this.arr;
    const loose = () => (Math.random() - 0.5) * 0.012;
    if (slot === 0 && arr.pad > 0 && (bar === 0 || this.chords[bar - 1] !== name)) {
      let len = 1;
      while (bar + len < 8 && this.chords[bar + len] === name) len++;
      this.pad(name, t, len * 8 * STEP, arr.pad);
    }
    if (arr.bass > 0) {
      if (slot === 0) this.inst.play('bass', BASS[name], t, this.lowBus, MIX.bass * arr.bass, 7.5 * STEP);
      else if (slot === 4 && Math.random() < 0.35) this.inst.play('bass', BASS[name] + 7, t, this.lowBus, MIX.bass * arr.bass * 0.6, 3.5 * STEP);
    }
    if (arr.guitar > 0) {
      const i = this.pick[slot];
      if (i >= 0) {
        const vel = slot === 0 ? 1 : slot === 4 ? 0.85 : 0.55 + Math.random() * 0.15;
        this.inst.play('guitar', VOICING[name][i], t + loose(), this.guitarBus, MIX.guitar * arr.guitar * vel);
      }
    }
    const note = this.notes.get(s);
    if (note) {
      const inst = arr.answer && bar >= 4 ? arr.answer : arr.lead;
      const len = note.len * STEP;
      if (inst === 'flute') this.flute(note.midi, t, len, note.vel);
      else this.inst.play(inst, note.midi, t + loose(), this.leadBus, MIX[inst] * note.vel, inst === 'piano' ? len + 0.35 : 0);
    }
  }

  // a warm pad chord: detuned soft triangles easing in and out
  pad(name, t, dur, level) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const peak = MIX.pad * level;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 1.3);
    g.gain.setValueAtTime(peak, t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.5);
    g.connect(this.padFilter);
    let first = null;
    for (const m of PAD[name]) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midiHz(m);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 3.5);
        first = first || o;
      }
    }
    first.onended = () => g.disconnect();
  }

  // a soft flute note: breathy onset, gentle vibrato that grows in
  flute(m, t, len, vel) {
    const ctx = this.ctx;
    const f = midiHz(m);
    const peak = MIX.flute * vel;
    const o = ctx.createOscillator();
    o.setPeriodicWave(this.fluteWave);
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.6 + Math.random() * 0.6;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.0045, t + Math.min(0.7, len * 0.6));
    vib.connect(vg).connect(o.frequency);
    const breath = ctx.createBufferSource();
    breath.buffer = this.noise;
    breath.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 1.5;
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.12);
    g.gain.linearRampToValueAtTime(peak * 0.85, t + Math.max(0.2, len));
    g.gain.setTargetAtTime(0, t + len, 0.1);
    o.connect(g);
    breath.connect(bp).connect(bg).connect(g);
    g.connect(this.leadBus);
    const end = t + len + 0.8;
    o.start(t);
    vib.start(t);
    breath.start(t, Math.random() * 0.5);
    o.stop(end);
    vib.stop(end);
    breath.stop(end);
    o.onended = () => {
      g.disconnect();
      vg.disconnect();
      bg.disconnect();
    };
  }
}
