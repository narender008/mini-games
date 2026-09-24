// Bedtime music: slow, soft lullabies on a music box, with a celesta rocking
// gently underneath, a warm pad and a quiet felt bass. An original garden
// lullaby (3/4) and Twinkle, Twinkle, Little Star (traditional, public
// domain), with a slow improvised music-box interlude after each. The second
// time round the lullaby is played an octave higher, like a music box.
import { midiHz } from './instruments.js';

const CHORDS = { C: [0, 4, 7], Dm: [2, 5, 9], Em: [4, 7, 11], F: [5, 9, 0], G: [7, 11, 2], Am: [9, 0, 4] };
const PENTA = [0, 2, 4, 7, 9];

// [midi, beats]; null is a rest
const GARDEN = {
  bpm: 58,
  meter: 3,
  melody: [
    [76, 1.5], [74, 0.5], [72, 1], [79, 2], [76, 1], [77, 1], [81, 1], [79, 1], [76, 3],
    [76, 1.5], [74, 0.5], [72, 1], [81, 2], [79, 1], [77, 1], [76, 1], [74, 1], [74, 3],
    [79, 1.5], [81, 0.5], [79, 1], [84, 2], [81, 1], [79, 1], [76, 1], [72, 1], [74, 3],
    [76, 1.5], [74, 0.5], [72, 1], [79, 2], [76, 1], [77, 1], [74, 1], [71, 1], [72, 3],
  ],
  chords: ['C', 'Em', 'F', 'C', 'C', 'F', 'G', 'G', 'C', 'F', 'C', 'G', 'C', 'Am', 'G', 'C'],
};

const TWINKLE = {
  bpm: 64,
  meter: 4,
  melody: [
    [72, 1], [72, 1], [79, 1], [79, 1], [81, 1], [81, 1], [79, 2],
    [77, 1], [77, 1], [76, 1], [76, 1], [74, 1], [74, 1], [72, 2],
    [79, 1], [79, 1], [77, 1], [77, 1], [76, 1], [76, 1], [74, 2],
    [79, 1], [79, 1], [77, 1], [77, 1], [76, 1], [76, 1], [74, 2],
    [72, 1], [72, 1], [79, 1], [79, 1], [81, 1], [81, 1], [79, 2],
    [77, 1], [77, 1], [76, 1], [76, 1], [74, 1], [74, 1], [72, 2],
  ],
  chords: [['C'], ['F', 'C'], ['F', 'C'], ['G', 'C'], ['C', 'G'], ['C', 'G'], ['C', 'G'], ['C', 'G'], ['C'], ['F', 'C'], ['F', 'C'], ['G', 'C']],
};

const INTERLUDES = [
  ['C', 'Am', 'F', 'G', 'C', 'F', 'G', 'C'],
  ['F', 'C', 'Dm', 'G', 'C', 'Am', 'G', 'C'],
  ['C', 'F', 'Am', 'G', 'F', 'C', 'G', 'C'],
];

const MIX = { box: 0.15, celesta: 0.055, pad: 0.018, bass: 0.07 };

const inRange = (pc, lo) => lo + ((((pc - lo) % 12) + 12) % 12);

// An improvised interlude: the music box wanders over a slow progression.
function interlude() {
  const chords = INTERLUDES[Math.floor(Math.random() * INTERLUDES.length)];
  const melody = [];
  let prev = 79;
  chords.forEach((name, bar) => {
    const tones = CHORDS[name];
    const last = bar === chords.length - 1;
    const rhythm = last ? [3] : Math.random() < 0.5 ? [2, 1] : Math.random() < 0.5 ? [1, 1, 1] : [1.5, 0.5, 1];
    rhythm.forEach((b, k) => {
      if (!last && k > 0 && Math.random() < 0.2) {
        melody.push([null, b]);
        return;
      }
      let best = prev;
      let bestS = -1e9;
      for (let m = 74; m <= 91; m++) {
        const pc = m % 12;
        const ok = k === 0 ? tones.includes(pc) : tones.includes(pc) || PENTA.includes(pc);
        if (!ok) continue;
        const s = -Math.abs(m - prev - (bar < 4 ? 1 : -1)) + Math.random() * 2 - (m === prev ? 1 : 0);
        if (s > bestS) {
          bestS = s;
          best = m;
        }
      }
      if (last) best = inRange(0, Math.max(72, prev - 6));
      melody.push([best, b]);
      prev = best;
    });
  });
  return { bpm: 56, meter: 3, melody, chords };
}

// Turn a tune into events on an eighth-note grid.
function compile(tune, octave = 0) {
  const bar = tune.meter * 2;
  const events = new Map();
  const add = (step, ev) => {
    if (!events.has(step)) events.set(step, []);
    events.get(step).push(ev);
  };
  let beat = 0;
  for (const [m, b] of tune.melody) {
    if (m) add(Math.round(beat * 2), { kind: 'mel', midi: m + octave, beats: b });
    beat += b;
  }
  tune.chords.forEach((c, i) => {
    const parts = Array.isArray(c) ? c : [c];
    parts.forEach((name, p) => {
      const span = bar / parts.length;
      add(i * bar + p * span, { kind: 'chord', name, steps: span });
    });
    // the celesta rocks on each beat: root, then the chord's other notes
    for (let b = 0; b < tune.meter; b++) {
      const name = parts[Math.floor((b * parts.length) / tune.meter)];
      const [r, t3, t5] = CHORDS[name];
      const root = inRange(r, 53);
      const third = root + ((t3 - r + 12) % 12);
      const fifth = root + ((t5 - r + 12) % 12);
      const pattern = tune.meter === 3 ? [root, third + 12 > 72 ? third : third + 12, fifth] : [root, fifth, third + 12 > 72 ? third : third + 12, fifth];
      add(i * bar + b * 2, { kind: 'acc', midi: pattern[b], first: b === 0 });
    }
  });
  return { events, steps: tune.chords.length * bar + bar, stepLen: 30 / tune.bpm };
}

export class Lullaby {
  constructor(audio, dest) {
    const ctx = audio.ctx;
    this.ctx = ctx;
    this.inst = audio.inst;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.boxBus = ctx.createStereoPanner();
    this.boxBus.pan.value = 0.12;
    this.boxBus.connect(this.out);
    this.lowBus = ctx.createStereoPanner();
    this.lowBus.pan.value = -0.12;
    this.lowBus.connect(this.out);
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 0.5;
    this.padFilter.connect(this.out);
    this.live = false;
    this.offAt = 0;
    this.round = 0;
  }

  reset(t) {
    this.next = t;
    this.order = 0;
    this.tune = null;
  }

  nextTune() {
    const slot = this.order % 4;
    if (slot === 0) this.tune = compile(GARDEN, this.round % 2 ? 12 : 0);
    else if (slot === 2) this.tune = compile(TWINKLE);
    else this.tune = compile(interlude());
    if (slot === 3) this.round++;
    this.order++;
    this.pos = 0;
  }

  pump(until) {
    const now = this.ctx.currentTime;
    if (this.next < now) this.next = now + 0.05;
    while (this.next < until) {
      if (!this.tune || this.pos >= this.tune.steps) this.nextTune();
      const evs = this.tune.events.get(this.pos);
      if (evs) for (const ev of evs) this.play(ev, this.next);
      this.pos++;
      this.next += this.tune.stepLen;
    }
  }

  play(ev, t) {
    const loose = (Math.random() - 0.5) * 0.01;
    if (ev.kind === 'mel') {
      this.inst.play('musicbox', ev.midi, t + loose, this.boxBus, MIX.box * (0.9 + Math.random() * 0.1));
    } else if (ev.kind === 'acc') {
      this.inst.play('celesta', ev.midi, t + loose, this.lowBus, MIX.celesta * (ev.first ? 1 : 0.75));
    } else {
      const dur = ev.steps * this.tune.stepLen;
      this.pad(ev.name, t, dur);
      this.inst.play('bass', inRange(CHORDS[ev.name][0], 36), t, this.lowBus, MIX.bass, dur);
    }
  }

  pad(name, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(MIX.pad, t + Math.min(1.5, dur * 0.5));
    g.gain.setValueAtTime(MIX.pad, t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.6);
    g.connect(this.padFilter);
    let first = null;
    for (const pc of CHORDS[name]) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = midiHz(inRange(pc, 55));
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 4);
        first = first || o;
      }
    }
    first.onended = () => g.disconnect();
  }
}
