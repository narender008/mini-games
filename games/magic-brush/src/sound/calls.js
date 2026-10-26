// Friends' calls: short, soft, friendly animal sounds made from oscillators,
// filters and noise, never a voice. Each is a function (audio, time) that
// schedules its own nodes into the effects bus. A friend's module can name
// calls here by its id: happy (a hello, a tap), and the names its tricks use
// (a name a friend has no call for falls back to `generic`, then its happy).
import { rand } from '../config.js';

// a pitch glide through points [[t, Hz], ...] with a vowel-ish formant and
// optional trill (tremolo), for chirps, whinnies and toots
export function glide(a, t0, points, { v = 0.12, type = 'triangle', formant = 1600, q = 1.2, trill = 0, trillDepth = 0.6, attack = 0.015, vibrato = 0, breath = 0 } = {}) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = type;
  const end = t0 + points[points.length - 1][0];
  o.frequency.setValueAtTime(points[0][1], t0);
  for (const [t, f] of points.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t0 + t);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lg = ctx.createGain();
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t0);
    lfo.stop(end + 0.1);
  }
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = formant;
  f.Q.value = q;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = formant * 2.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + attack);
  g.gain.setValueAtTime(v, end - Math.min(0.08, (end - t0) * 0.4));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
  let out = g;
  if (trill) {
    const am = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = trill;
    const depth = ctx.createGain();
    depth.gain.value = trillDepth * 0.5;
    am.gain.value = 1 - trillDepth * 0.5;
    lfo.connect(depth).connect(am.gain);
    lfo.start(t0);
    lfo.stop(end + 0.1);
    g.connect(am);
    out = am;
  }
  o.connect(f).connect(soft).connect(g);
  out.connect(a.sfx);
  o.start(t0);
  o.stop(end + 0.1);
  if (breath) {
    const n = ctx.createBufferSource();
    n.buffer = a.pink;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = formant * 1.3;
    nf.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(v * breath, t0 + attack * 2);
    ng.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
    n.connect(nf).connect(ng).connect(a.sfx);
    n.start(t0, Math.random());
    n.stop(end + 0.1);
  }
}

// a soft puff of air
export function puff(a, t, { v = 0.2, from = 900, to = 2400, dur = 0.5 } = {}) {
  const ctx = a.ctx;
  const n = ctx.createBufferSource();
  n.buffer = a.pink;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(a.sfx);
  n.start(t, Math.random());
  n.stop(t + dur + 0.05);
}

// wing beats: soft thumps of moving air
export function flaps(a, t, n = 5, rate = 0.16, v = 0.12) {
  for (let i = 0; i < n; i++) puff(a, t + i * rate, { v: v * (1 - i / (n + 2)), from: 300, to: 700, dur: 0.14 });
}

// a soft blip that slides from f0 to f1: pops, boings, beeps
export function tone(a, t, f0, f1, dur, { v = 0.1, type = 'sine', lp = 3000 } = {}) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(a.sfx);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// a soft thump (a paw, a plop, a tummy landing)
export const thump = (a, t, { v = 0.16, f = 150, dur = 0.2 } = {}) => tone(a, t, f, f * 0.4, dur, { v, lp: 600 });

// a contented purr: low breath rippling about 25 times a second
export function purr(a, t, dur = 1.2, v = 0.09) {
  const ctx = a.ctx;
  const n = ctx.createBufferSource();
  n.buffer = a.pink;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  const am = ctx.createGain();
  am.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 25;
  const depth = ctx.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(am.gain);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v * 2.2, t + 0.25);
  g.gain.setValueAtTime(v * 2.2, t + dur - 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(am).connect(g).connect(a.sfx);
  n.start(t, Math.random());
  n.stop(t + dur + 0.05);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

// happy munching: three chews
export function munch(a, t) {
  for (let i = 0; i < 3; i++) {
    puff(a, t + i * 0.17, { v: 0.11, from: 600, to: 1400, dur: 0.1 });
    tone(a, t + i * 0.17, 240, 150, 0.09, { v: 0.05, type: 'triangle', lp: 900 });
  }
}

// a giggle: quick rising notes
export function giggle(a, t, base = 900) {
  for (let i = 0; i < 4; i++) glide(a, t + i * 0.085, [[0, base * (1 + i * 0.06)], [0.05, base * (1.35 + i * 0.06)]], { v: 0.075, formant: base * 1.8, q: 1.4 });
}

// a handful of sparkly bells
export function sparkle(a, t, n = 6, base = 1800, spread = 1800) {
  for (let i = 0; i < n; i++) a.bell(base + Math.random() * spread, 0.035, t + i * 0.055, 0.6);
}

// a rising run of bells up a pentatonic scale
export function arpeggio(a, t, notes = [523.25, 659.25, 783.99, 1046.5], gap = 0.09, v = 0.06) {
  notes.forEach((f, i) => a.bell(f, v, t + i * gap, 1.0));
}

// a spring boing
export const boing = (a, t) => glide(a, t, [[0, 220], [0.09, 640], [0.3, 300]], { v: 0.1, formant: 900, q: 0.7, vibrato: 40, type: 'sine' });

// a vehicle beep: two soft squarish tones
export function beeps(a, t, f = 660, n = 2, gap = 0.16, v = 0.07) {
  for (let i = 0; i < n; i++) tone(a, t + i * gap, f, f * 1.01, 0.11, { v, type: 'square', lp: 1600 });
}

export const CALLS = {
  generic: {
    happy: (a, t) => {
      a.bell(1318.5, 0.05, t, 0.5);
      a.bell(1760, 0.05, t + 0.09, 0.6);
    },
    munch: (a, t) => munch(a, t),
    purr: (a, t) => purr(a, t, 1.4, 0.08),
    giggle: (a, t) => giggle(a, t),
    sparkle: (a, t) => sparkle(a, t),
    boing: (a, t) => boing(a, t),
    thump: (a, t) => thump(a, t),
    hop: (a, t) => tone(a, t, 320, 620, 0.12, { v: 0.07 }),
  },
  // Draco: a cute rolling chirp, a sparkly puff, wing flaps
  dragon: {
    happy: (a, t) => {
      glide(a, t, [[0, 820], [0.12, 1250], [0.3, 980]], { v: 0.1, formant: 1500, trill: 34, trillDepth: 0.7, breath: 0.25 });
      glide(a, t + 0.36, [[0, 1100], [0.1, 1500], [0.22, 1350]], { v: 0.08, formant: 1800, trill: 30, trillDepth: 0.6 });
    },
    puff: (a, t) => {
      puff(a, t, { v: 0.16, from: 700, to: 2800, dur: 0.6 });
      for (let i = 0; i < 9; i++) a.bell(rand(1800, 3600), 0.03, t + 0.05 + i * 0.05, 0.6);
    },
    flap: (a, t) => {
      flaps(a, t, 8, 0.17, 0.1);
      glide(a, t + 0.4, [[0, 900], [0.15, 1400], [0.28, 1200]], { v: 0.08, formant: 1600, trill: 32 });
    },
  },
  // Lumi: a small silvery whinny, soft hooves, sparkles
  unicorn: {
    happy: (a, t) => glide(a, t, [[0, 700], [0.13, 1500], [0.42, 1050]], { v: 0.09, formant: 1700, vibrato: 30, breath: 0.2 }),
    paw: (a, t) => { thump(a, t, { v: 0.09, f: 210, dur: 0.12 }); thump(a, t + 0.17, { v: 0.09, f: 200, dur: 0.12 }); },
    rear: (a, t) => {
      glide(a, t, [[0, 600], [0.16, 1650], [0.55, 900]], { v: 0.1, formant: 1800, vibrato: 45, breath: 0.25 });
      sparkle(a, t + 0.3, 6);
    },
    sparkle: (a, t) => sparkle(a, t, 9, 1900, 2200),
    spin: (a, t) => { puff(a, t, { v: 0.09, from: 900, to: 3200, dur: 0.8 }); sparkle(a, t + 0.1, 8, 2000, 2200); },
    gallop: (a, t) => { for (let i = 0; i < 6; i++) thump(a, t + i * 0.13 + (i % 2) * 0.03, { v: 0.07, f: 190, dur: 0.1 }); },
  },
  // Flick: a bright little yip and a fluffy pounce
  fox: {
    happy: (a, t) => {
      glide(a, t, [[0, 900], [0.07, 1750], [0.2, 1250]], { v: 0.09, formant: 2000, q: 1.6 });
      glide(a, t + 0.26, [[0, 1000], [0.06, 1850], [0.16, 1400]], { v: 0.07, formant: 2100, q: 1.6 });
    },
    chase: (a, t) => { for (let i = 0; i < 4; i++) glide(a, t + i * 0.14, [[0, 1000], [0.05, 1700], [0.12, 1300]], { v: 0.06, formant: 2000 }); },
    pounce: (a, t) => { puff(a, t, { v: 0.09, from: 500, to: 1600, dur: 0.25 }); thump(a, t + 0.22, { v: 0.12 }); glide(a, t + 0.3, [[0, 900], [0.08, 1800], [0.2, 1300]], { v: 0.08, formant: 2000 }); },
    wag: (a, t) => { for (let i = 0; i < 4; i++) puff(a, t + i * 0.11, { v: 0.05, from: 1200, to: 2400, dur: 0.1 }); },
  },
  // Poppy: a gentle toot on a small trunk
  elephant: {
    happy: (a, t) => glide(a, t, [[0, 330], [0.15, 560], [0.42, 430]], { v: 0.1, type: 'sawtooth', formant: 750, q: 1.4, vibrato: 14, breath: 0.15 }),
    trumpet: (a, t) => {
      glide(a, t, [[0, 300], [0.14, 640], [0.5, 520]], { v: 0.11, type: 'sawtooth', formant: 800, q: 1.4, vibrato: 18, breath: 0.2 });
      glide(a, t + 0.6, [[0, 460], [0.12, 700], [0.34, 560]], { v: 0.09, type: 'sawtooth', formant: 850, q: 1.4, vibrato: 18 });
    },
    balance: (a, t) => { for (let i = 0; i < 4; i++) a.bell(520 + (i % 2) * 90, 0.05, t + i * 0.15, 0.7); },
    flutter: (a, t) => flaps(a, t, 6, 0.09, 0.09),
    plop: (a, t) => { thump(a, t, { v: 0.2, f: 130, dur: 0.24 }); puff(a, t, { v: 0.06, from: 500, to: 900, dur: 0.2 }); },
  },
  // Wave: a slow, warm whale song and the splash of a spout
  whale: {
    happy: (a, t) => glide(a, t, [[0, 260], [0.35, 470], [0.9, 320]], { v: 0.11, type: 'sine', formant: 520, q: 0.9, vibrato: 12, attack: 0.08, breath: 0.1 }),
    spout: (a, t) => { puff(a, t, { v: 0.16, from: 500, to: 2600, dur: 0.9 }); for (let i = 0; i < 8; i++) a.bubble(0.05); sparkle(a, t + 0.3, 5, 2200, 1500); },
    flip: (a, t) => { puff(a, t, { v: 0.12, from: 700, to: 2000, dur: 0.45 }); puff(a, t + 0.4, { v: 0.14, from: 1800, to: 600, dur: 0.5 }); glide(a, t + 0.1, [[0, 300], [0.3, 500], [0.6, 340]], { v: 0.08, formant: 560, vibrato: 10 }); },
    bounce: (a, t) => { for (let i = 0; i < 3; i++) { tone(a, t + i * 0.28, 180, 320, 0.2, { v: 0.09 }); puff(a, t + i * 0.28 + 0.05, { v: 0.06, from: 900, to: 1800, dur: 0.15 }); } },
  },
  // the butterfly: tiny bells, a whisper of wings
  butterfly: {
    happy: (a, t) => { a.bell(2093, 0.045, t, 0.6); a.bell(2637, 0.04, t + 0.08, 0.6); a.bell(3136, 0.035, t + 0.16, 0.7); },
    fan: (a, t) => flaps(a, t, 6, 0.08, 0.05),
    flower: (a, t) => arpeggio(a, t, [1046.5, 1318.5, 1568, 2093], 0.08, 0.04),
    loop: (a, t) => { puff(a, t, { v: 0.06, from: 1500, to: 3400, dur: 0.6 }); sparkle(a, t + 0.15, 5, 2200, 1600); },
    sparkle: (a, t) => sparkle(a, t, 8, 2200, 1800),
  },
  // Bramble: a sleepy hum, a soft "ooh", a big hug
  teddy: {
    happy: (a, t) => glide(a, t, [[0, 340], [0.15, 470], [0.4, 380]], { v: 0.1, formant: 700, q: 1, attack: 0.05, vibrato: 6 }),
    hello: (a, t) => { glide(a, t, [[0, 360], [0.12, 500]], { v: 0.09, formant: 750 }); glide(a, t + 0.18, [[0, 520], [0.18, 430]], { v: 0.09, formant: 700 }); },
    ooh: (a, t) => glide(a, t, [[0, 400], [0.2, 620], [0.36, 560]], { v: 0.09, formant: 800, vibrato: 8 }),
    hug: (a, t) => { purr(a, t, 1.0, 0.07); a.bell(880, 0.05, t + 0.1, 1); },
    roll: (a, t) => { for (let i = 0; i < 4; i++) { puff(a, t + i * 0.15, { v: 0.07, from: 500, to: 1000, dur: 0.15 }); thump(a, t + i * 0.15 + 0.06, { v: 0.05, f: 170, dur: 0.1 }); } },
    thump: (a, t) => thump(a, t, { v: 0.14, f: 130, dur: 0.24 }),
    tada: (a, t) => arpeggio(a, t, [523.25, 659.25, 783.99, 1046.5, 1318.5], 0.08, 0.06),
  },
  // Zippy the car: friendly beeps, a purring engine
  car: {
    happy: (a, t) => beeps(a, t, 740, 2, 0.15),
    honk: (a, t) => { tone(a, t, 392, 392, 0.22, { v: 0.07, type: 'square', lp: 1300 }); tone(a, t, 494, 494, 0.22, { v: 0.06, type: 'square', lp: 1300 }); },
    vroom: (a, t) => { tone(a, t, 70, 180, 0.7, { v: 0.09, type: 'sawtooth', lp: 500 }); puff(a, t, { v: 0.06, from: 300, to: 900, dur: 0.7 }); },
    skid: (a, t) => puff(a, t, { v: 0.09, from: 2600, to: 900, dur: 0.4 }),
    boing: (a, t) => boing(a, t),
  },
  // Comet the rocket: beeps, a rumble, a whoosh (never loud)
  rocket: {
    happy: (a, t) => { beeps(a, t, 880, 2, 0.13); a.bell(1760, 0.04, t + 0.3, 0.6); },
    beep: (a, t) => beeps(a, t, 990, 3, 0.11),
    blast: (a, t) => { tone(a, t, 60, 150, 1.0, { v: 0.09, type: 'sawtooth', lp: 380 }); puff(a, t, { v: 0.13, from: 250, to: 1800, dur: 1.2 }); },
    rumble: (a, t) => { tone(a, t, 55, 90, 0.9, { v: 0.08, type: 'sawtooth', lp: 320 }); puff(a, t, { v: 0.07, from: 200, to: 600, dur: 0.9 }); },
    land: (a, t) => { puff(a, t, { v: 0.1, from: 1400, to: 400, dur: 0.6 }); thump(a, t + 0.4, { v: 0.14, f: 120, dur: 0.25 }); sparkle(a, t + 0.5, 4); },
    pop: (a, t) => tone(a, t, 500, 1300, 0.08, { v: 0.09 }),
    whirl: (a, t) => puff(a, t, { v: 0.09, from: 500, to: 2600, dur: 0.8 }),
  },
  // the little boat: a jolly toot and water
  boat: {
    happy: (a, t) => { glide(a, t, [[0, 330], [0.16, 350]], { v: 0.09, type: 'sawtooth', formant: 600, q: 1.2 }); glide(a, t + 0.24, [[0, 392], [0.2, 400]], { v: 0.09, type: 'sawtooth', formant: 650, q: 1.2 }); },
    splash: (a, t) => { puff(a, t, { v: 0.14, from: 1800, to: 500, dur: 0.6 }); for (let i = 0; i < 5; i++) a.bubble(0.05); },
    swoosh: (a, t) => puff(a, t, { v: 0.1, from: 600, to: 2200, dur: 0.5 }),
    whirl: (a, t) => { puff(a, t, { v: 0.1, from: 500, to: 2400, dur: 0.9 }); a.bubble(0.05); },
  },
  // Binky the bunny: squeaks, thumps and boings
  bunny: {
    happy: (a, t) => glide(a, t, [[0, 1300], [0.06, 1900], [0.15, 1500]], { v: 0.07, formant: 2100, q: 1.5 }),
    binky: (a, t) => { boing(a, t); glide(a, t + 0.2, [[0, 1400], [0.07, 2000], [0.16, 1600]], { v: 0.06, formant: 2200 }); },
    boing: (a, t) => boing(a, t),
    flop: (a, t) => thump(a, t, { v: 0.12, f: 140, dur: 0.22 }),
    wiggle: (a, t) => { for (let i = 0; i < 3; i++) puff(a, t + i * 0.09, { v: 0.05, from: 1400, to: 2600, dur: 0.08 }); },
    thump: (a, t) => { thump(a, t, { v: 0.18, f: 170, dur: 0.16 }); thump(a, t + 0.16, { v: 0.16, f: 165, dur: 0.16 }); },
  },
  // Mochi the kitten: a small mew and a big purr
  kitten: {
    happy: (a, t) => glide(a, t, [[0, 900], [0.1, 1550], [0.28, 900]], { v: 0.08, formant: 1900, q: 1.6, vibrato: 25, breath: 0.15 }),
    mew: (a, t) => glide(a, t, [[0, 850], [0.14, 1600], [0.45, 800]], { v: 0.09, formant: 1900, q: 1.6, vibrato: 30, breath: 0.15 }),
    purr: (a, t) => purr(a, t, 1.5, 0.08),
    pounce: (a, t) => { puff(a, t, { v: 0.07, from: 700, to: 1800, dur: 0.22 }); thump(a, t + 0.2, { v: 0.1, f: 190, dur: 0.14 }); },
    flop: (a, t) => { thump(a, t, { v: 0.1, f: 150, dur: 0.2 }); purr(a, t + 0.2, 0.8, 0.06); },
  },
  // Waddles the penguin: squeaky chirps, a belly slide
  penguin: {
    happy: (a, t) => { glide(a, t, [[0, 1000], [0.08, 1600], [0.2, 1250]], { v: 0.08, formant: 1900, trill: 28, trillDepth: 0.5 }); glide(a, t + 0.26, [[0, 1150], [0.07, 1700]], { v: 0.06, formant: 2000 }); },
    slide: (a, t) => { puff(a, t, { v: 0.11, from: 700, to: 2400, dur: 0.7 }); glide(a, t + 0.1, [[0, 1100], [0.15, 1800], [0.4, 1300]], { v: 0.07, formant: 2000, trill: 26 }); },
    flap: (a, t) => flaps(a, t, 6, 0.1, 0.09),
    dance: (a, t) => { arpeggio(a, t, [784, 988, 784, 1175], 0.13, 0.05); glide(a, t + 0.1, [[0, 1000], [0.1, 1500]], { v: 0.06, formant: 1900 }); },
  },
  // Biscuit the puppy: yips and a hopeful whimper
  puppy: {
    happy: (a, t) => { glide(a, t, [[0, 700], [0.06, 1150], [0.16, 850]], { v: 0.1, formant: 1400, q: 1.3 }); glide(a, t + 0.24, [[0, 760], [0.06, 1200], [0.15, 900]], { v: 0.08, formant: 1450, q: 1.3 }); },
    yip: (a, t) => glide(a, t, [[0, 720], [0.06, 1180], [0.17, 860]], { v: 0.1, formant: 1400, q: 1.3 }),
    beg: (a, t) => glide(a, t, [[0, 900], [0.25, 1300], [0.6, 950]], { v: 0.07, formant: 1600, vibrato: 35, attack: 0.05 }),
    spin: (a, t) => { for (let i = 0; i < 3; i++) glide(a, t + i * 0.16, [[0, 720], [0.06, 1180], [0.13, 880]], { v: 0.08, formant: 1400 }); },
  },
  // Pebble the turtle: gentle bloops
  turtle: {
    happy: (a, t) => { tone(a, t, 300, 520, 0.14, { v: 0.09 }); tone(a, t + 0.2, 380, 640, 0.14, { v: 0.08 }); },
    hide: (a, t) => { thump(a, t, { v: 0.1, f: 200, dur: 0.14 }); puff(a, t, { v: 0.05, from: 800, to: 400, dur: 0.2 }); },
    peek: (a, t) => { a.bell(1174.7, 0.05, t, 0.7); a.bell(1568, 0.04, t + 0.1, 0.7); },
    spin: (a, t) => puff(a, t, { v: 0.08, from: 500, to: 1800, dur: 0.6 }),
    stretch: (a, t) => glide(a, t, [[0, 260], [0.3, 420], [0.7, 300]], { v: 0.07, formant: 600, attack: 0.08 }),
  },
  // Blossom the flower: bells
  flower: {
    happy: (a, t) => arpeggio(a, t, [1046.5, 1318.5, 1568], 0.09, 0.05),
    bloom: (a, t) => { puff(a, t, { v: 0.07, from: 600, to: 2200, dur: 0.6 }); arpeggio(a, t + 0.1, [784, 987.8, 1174.7, 1568, 1976], 0.1, 0.05); },
    grow: (a, t) => puff(a, t, { v: 0.08, from: 400, to: 1800, dur: 0.9 }),
    dance: (a, t) => { for (let i = 0; i < 4; i++) a.bell(1046.5 * (1 + (i % 2) * 0.26), 0.045, t + i * 0.14, 0.7); },
    shut: (a, t) => puff(a, t, { v: 0.06, from: 1800, to: 500, dur: 0.4 }),
    stretch: (a, t) => puff(a, t, { v: 0.06, from: 500, to: 1500, dur: 0.5 }),
  },
  // the tree: leaves and a warm wooden tune
  tree: {
    happy: (a, t) => { puff(a, t, { v: 0.07, from: 2500, to: 4000, dur: 0.6 }); a.bell(587.3, 0.05, t + 0.1, 0.9); },
    grow: (a, t) => puff(a, t, { v: 0.09, from: 300, to: 1500, dur: 1.0 }),
    rustle: (a, t) => { for (let i = 0; i < 3; i++) puff(a, t + i * 0.18, { v: 0.07, from: 3000, to: 5000, dur: 0.35 }); },
    stretch: (a, t) => glide(a, t, [[0, 180], [0.3, 260], [0.6, 200]], { v: 0.06, formant: 420, attack: 0.1 }),
    boing: (a, t) => boing(a, t),
    tune: (a, t) => arpeggio(a, t, [392, 440, 523.25, 587.3, 659.25], 0.14, 0.06),
  },
  // the rainbow: a shimmer
  rainbow: {
    happy: (a, t) => arpeggio(a, t, [1046.5, 1318.5, 1568, 2093], 0.07, 0.045),
    shimmer: (a, t) => sparkle(a, t, 10, 1600, 2400),
    twinkle: (a, t) => { a.bell(2349, 0.04, t, 0.7); a.bell(3136, 0.035, t + 0.09, 0.8); a.bell(2637, 0.03, t + 0.19, 0.8); },
  },
  // the sun: warm chimes
  sun: {
    happy: (a, t) => { a.bell(523.25, 0.06, t, 1.4); a.bell(659.25, 0.05, t + 0.08, 1.4); a.bell(783.99, 0.05, t + 0.16, 1.4); },
    wink: (a, t) => { a.bell(1568, 0.05, t, 0.7); sparkle(a, t + 0.1, 3); },
    whirl: (a, t) => { puff(a, t, { v: 0.07, from: 600, to: 2600, dur: 0.7 }); sparkle(a, t + 0.1, 6); },
    duck: (a, t) => tone(a, t, 700, 400, 0.14, { v: 0.07 }),
    peek: (a, t) => tone(a, t, 400, 800, 0.14, { v: 0.07 }),
  },
};
