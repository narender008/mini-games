// A quiet bed of sound for each stage, cross-faded when the stage changes.
// All of it is soft, far away and never sudden: a loop or two of rendered
// noise textures under sparse little events (birds, drips, gulls, chimes)
// dropped in at random times, places and pitches.
//  - meadow: a breeze through the grass and distant small-bird song;
//  - beach: slow soft waves and far-off gulls;
//  - garden: gentle rain, drips into puddles and a blackbird now and then;
//  - snow: soft wind and faint wind chimes in the stage's key;
//  - forest: a babbling stream and woodland birds, a cuckoo far away.
import { TAU, clamp, rand, pick, seeded, secs, smooth, pitched, bubble, grain, filt, normalise, white, pinkify, slowNoise, finish, finishLoop } from './dsp.js';

const CH = (n) => new Float32Array(n);

// ------------------------------------------------------------ loops

// Wind: pink noise, low-passed, whose loudness follows a slow random swell,
// with a rustle on top and (for the snow) a faint wandering whistle.
export function windLoop(sr, seed, dur, { fc = 900, floor = 0.25, hiss = 0.06, whistle = 0, swell = 0.35 } = {}) {
  const r = seeded(seed);
  const n = secs(sr, dur);
  const base = filt(pinkify(white(n, r), true), sr, 'lowpass', fc, 0.6, true);
  normalise([base]);
  const sw = slowNoise(n, sr, r, swell);
  const out = CH(n);
  for (let i = 0; i < n; i++) out[i] = base[i] * (floor + (1 - floor) * smooth(0.5 + 0.5 * sw[i]));
  if (hiss) {
    const h = filt(white(n, r), sr, 'bandpass', 3500, 0.7, true);
    normalise([h]);
    for (let i = 0; i < n; i++) out[i] += h[i] * hiss * smooth(0.5 + 0.5 * sw[i]) ** 2;
  }
  if (whistle) {
    const w = filt(white(n, r), sr, 'bandpass', 640, 10, true);
    normalise([w]);
    const sw2 = slowNoise(n, sr, r, 0.2);
    for (let i = 0; i < n; i++) out[i] += w[i] * whistle * smooth(0.5 + 0.5 * sw2[i]) ** 3;
  }
  return finishLoop([out], sr);
}

// Waves breaking far up the beach: every few seconds a soft wash swells, hushes
// and drains away, with a little foam hiss just after its crest.
function surfLoop(sr, seed, dur = 12) {
  const r = seeded(seed);
  const n = secs(sr, dur);
  const wash = normalise([filt(pinkify(white(n, r), true), sr, 'lowpass', 2000, 0.6, true)])[0];
  const foam = normalise([filt(white(n, r), sr, 'bandpass', 3600, 0.7, true)])[0];
  const out = CH(n);
  for (let i = 0; i < n; i++) out[i] = wash[i] * 0.1;
  const count = 3;
  for (let w = 0; w < count; w++) {
    const at = Math.floor(((w + (r() - 0.5) * 0.25) / count) * n);
    const rise = 2.3 + r() * 0.6;
    const amp = 0.7 + 0.3 * r();
    const len = secs(sr, rise + 5);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // the wash drains away and is gone by the end of its length, so waves never leave a step
      const gone = 1 - smooth((t - (rise + 3)) / 2);
      const e = (t < rise ? smooth(t / rise) ** 1.4 : Math.exp(-(t - rise) / 1.7)) * gone;
      const f = t < rise + 0.3 ? 0 : Math.exp(-(t - rise - 0.3) / 0.9);
      const j = (at + i) % n;
      out[j] += amp * (wash[j] * e + foam[j] * 0.12 * f * smooth((t - rise * 0.6) / 1.2));
    }
  }
  return finishLoop([out], sr);
}

// Rain: thousands of tiny drops, a soft wash of falling water and the low
// patter on leaves, never harsh.
function rainLoop(sr, seed, dur = 5) {
  const r = seeded(seed);
  const n = secs(sr, dur);
  const drops = CH(n);
  for (let i = 0, k = Math.floor(dur * 1800); i < k; i++) grain(drops, Math.floor(r() * n), secs(sr, 0.001 + r() * 0.002), 2, r() ** 2, r, true);
  filt(drops, sr, 'highpass', 1400, 0.7, true);
  filt(drops, sr, 'lowpass', 8000, 0.6, true);
  normalise([drops]);
  const wash = normalise([filt(white(n, r), sr, 'bandpass', 4200, 0.5, true)])[0];
  const leaves = CH(n);
  for (let i = 0, k = Math.floor(dur * 90); i < k; i++) grain(leaves, Math.floor(r() * n), secs(sr, 0.004 + r() * 0.006), 4, 0.4 + r() * 0.6, r, true);
  filt(leaves, sr, 'bandpass', 800, 1, true);
  normalise([leaves]);
  const out = CH(n);
  for (let i = 0; i < n; i++) out[i] = drops[i] * 0.5 + wash[i] * 0.22 + leaves[i] * 0.14;
  return finishLoop([out], sr);
}

// A babbling stream: a soft wash of water over hundreds of little bubbles
// popping at every pitch (the sound of running water is bubbles).
function streamLoop(sr, seed, dur = 6) {
  const r = seeded(seed);
  const n = secs(sr, dur);
  const wash = normalise([filt(pinkify(white(n, r), true), sr, 'bandpass', 1400, 0.5, true)])[0];
  const mod = slowNoise(n, sr, r, 1.2);
  const out = CH(n);
  for (let i = 0; i < n; i++) out[i] = wash[i] * (0.45 + 0.25 * mod[i]) * 0.3;
  for (let i = 0, k = Math.floor(dur * 55); i < k; i++) {
    const f = 350 * 8 ** r();
    const d = (0.043 * f + 0.0014 * f ** 1.5) * (0.6 + 0.6 * r());
    bubble(out, sr, Math.floor(r() * (n - secs(sr, 0.05))), f, 0.03 + 0.34 * r() ** 2, 0.2 + 0.4 * r(), d);
  }
  return finishLoop([out], sr);
}

export const LOOPS = {
  breeze: { render: (sr, s) => windLoop(sr, s, 8, { fc: 1000, floor: 0.22, hiss: 0.08 }), sr: 16000 },
  surf: { render: (sr, s) => surfLoop(sr, s, 12), sr: 16000 },
  rain: { render: (sr, s) => rainLoop(sr, s, 5), sr: 22050 },
  stream: { render: (sr, s) => streamLoop(sr, s, 6), sr: 22050 },
  snowwind: { render: (sr, s) => windLoop(sr, s, 10, { fc: 700, floor: 0.3, hiss: 0.02, whistle: 0.05, swell: 0.25 }), sr: 11025 },
  // the wind() layer: a gustier wind, its speed is set by the game
  gust: { render: (sr, s) => windLoop(sr, s, 7, { fc: 1300, floor: 0.12, hiss: 0.1, swell: 0.5 }), sr: 16000 },
};

// ------------------------------------------------------------ animals

// The notes of a bird's phrase: [start s, length s, Hz at start, Hz at end, loudness, vibrato depth].
function birdNotes(kind, r) {
  const notes = [];
  if (kind === 'chirp') {
    // small bright chirps: a few short up- or down-swept notes
    const n = 3 + ((r() * 4) | 0);
    const base = 3000 + r() * 1500;
    let t = 0;
    for (let i = 0; i < n; i++) {
      const dur = 0.045 + r() * 0.05;
      const f0 = base * (0.85 + r() * 0.3);
      notes.push([t, dur, f0, f0 * (r() < 0.55 ? 1.2 + r() * 0.25 : 0.7 + r() * 0.1), 0.6 + 0.4 * r(), 0]);
      t += dur + 0.025 + r() * 0.06;
    }
  } else if (kind === 'trill') {
    // a finch's trill, two pitches alternating fast, ending on a falling glide
    const base = 3400 + r() * 1000;
    const k = 9 + ((r() * 7) | 0);
    const step = 0.036 + r() * 0.01;
    for (let i = 0; i < k; i++) {
      const hi = i % 2 === 1;
      notes.push([i * step, step * 0.85, base * (hi ? 1.15 : 1), base * (hi ? 1.18 : 0.98), 0.5 + 0.5 * Math.sin((Math.PI * (i + 0.5)) / k), 0]);
    }
    notes.push([k * step + 0.02, 0.13, base * 1.15, base * 0.75, 0.7, 0]);
  } else if (kind === 'warbler') {
    // a quick, wandering run of little notes
    let f = 3200 + r() * 800;
    let t = 0;
    for (let i = 0, n = 12 + ((r() * 8) | 0); i < n; i++) {
      const dur = 0.035 + r() * 0.03;
      const f1 = clamp(f * (0.8 + r() * 0.4), 2400, 5400);
      notes.push([t, dur, f, f1, 0.5 + 0.5 * r(), 0.01]);
      f = f1;
      t += dur + 0.01 + r() * 0.02;
    }
  } else if (kind === 'blackbird') {
    // a mellow, fluting phrase that ends in a quick falling warble
    const scale = [1300, 1460, 1640, 1950, 2200, 2600];
    let t = 0;
    let idx = 2 + ((r() * 3) | 0);
    for (let i = 0, n = 5 + ((r() * 4) | 0); i < n; i++) {
      idx = clamp(idx + ((r() * 5) | 0) - 2, 0, 5);
      const dur = 0.12 + r() * 0.2;
      const f0 = scale[idx];
      notes.push([t, dur, f0, f0 * (0.92 + r() * 0.2), 0.7 + 0.3 * Math.sin((Math.PI * (i + 1)) / (n + 1)), 0.008]);
      t += dur + 0.04 + r() * 0.07;
    }
    for (let i = 0; i < 4; i++) {
      notes.push([t, 0.05, 2400 - i * 220, 2200 - i * 220, 0.5 - i * 0.08, 0.02]);
      t += 0.06;
    }
  } else if (kind === 'thrush') {
    // a motif of two or three notes, sung over again
    const motif = [0, 1, 2].slice(0, 2 + ((r() * 2) | 0)).map(() => 2200 + r() * 1200);
    let t = 0;
    for (let rep = 0, reps = 2 + ((r() * 2) | 0); rep < reps; rep++) {
      for (const f of motif) {
        const dur = 0.07 + r() * 0.04;
        notes.push([t, dur, f, f * (0.9 + r() * 0.25), 0.7, 0.006]);
        t += dur + 0.025;
      }
      t += 0.12 + r() * 0.06;
    }
  } else if (kind === 'cuckoo') {
    // "cu-coo, cu-coo": two soft falling notes, twice
    for (const t0 of [0, 0.75]) {
      notes.push([t0, 0.22, 700, 690, 0.9, 0]);
      notes.push([t0 + 0.3, 0.34, 560, 540, 1, 0]);
    }
  }
  return notes;
}

function birdRender(sr, seed, kind) {
  const r = seeded(seed);
  const notes = birdNotes(kind, r);
  const total = notes.reduce((m, [t, d]) => Math.max(m, t + d), 0) + 0.1;
  const out = CH(secs(sr, total));
  for (const [t, dur, f0, f1, amp, vib] of notes) {
    pitched(out, sr, secs(sr, t), dur, (x) => f0 * (f1 / f0) ** smooth(x / dur) * (1 + vib * Math.sin(TAU * 22 * x)),
      { amp, env: (x) => Math.sin(Math.PI * clamp(x / dur, 0, 1)) ** 0.6, h2: kind === 'cuckoo' ? 0.08 : 0.05 });
  }
  filt(out, sr, 'lowpass', 7500, 0.6);
  return finish([out], sr, 2, 30);
}

// A gull far off along the shore: three "kee-ow" cries, a harmonic stack
// under a broad formant, the pitch arching up and falling away.
function gullRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.35));
  const K = 14;
  const weights = [];
  for (let k = 1; k <= K; k++) weights.push(Math.exp(-((Math.log2((k * 1000) / 1800) / 0.85) ** 2)) / k ** 0.3);
  [[0.02, 0.34, 1], [0.44, 0.3, 0.8], [0.82, 0.32, 0.6]].forEach(([t0, dur, amp]) => {
    const base = 700 + r() * 120;
    const at = secs(sr, t0);
    let ph = 0;
    for (let i = 0, n = secs(sr, dur); i < n && at + i < out.length; i++) {
      const x = i / sr / dur;
      const f = base * (1 + 0.75 * Math.sin(Math.PI * Math.min(1, x * 1.25)) ** 0.9) * (1 - 0.15 * x);
      ph += (TAU * f) / sr;
      const c1 = Math.cos(ph);
      let sPrev = 0;
      let s = Math.sin(ph);
      let v = 0;
      for (let k = 1; k <= K; k++) {
        if (k * f < sr * 0.45) v += weights[k - 1] * s;
        const sn = 2 * c1 * s - sPrev;
        sPrev = s;
        s = sn;
      }
      const e = smooth(x / 0.08) * (1 - smooth((x - 0.6) / 0.4)) * (1 + 0.12 * Math.sin(TAU * 43 * x * dur));
      out[at + i] += amp * e * v;
    }
  });
  filt(out, sr, 'lowpass', 4500, 0.6);
  return finish([out], sr, 2, 40);
}

export const EVENTS = {
  chirp: { render: (sr, s) => birdRender(sr, s, 'chirp'), variants: 5, sr: 24000 },
  trill: { render: (sr, s) => birdRender(sr, s, 'trill'), variants: 4, sr: 24000 },
  warbler: { render: (sr, s) => birdRender(sr, s, 'warbler'), variants: 4, sr: 24000 },
  blackbird: { render: (sr, s) => birdRender(sr, s, 'blackbird'), variants: 4, sr: 24000 },
  thrush: { render: (sr, s) => birdRender(sr, s, 'thrush'), variants: 4, sr: 24000 },
  cuckoo: { render: (sr, s) => birdRender(sr, s, 'cuckoo'), variants: 1, sr: 24000 },
  gull: { render: gullRender, variants: 3, sr: 24000 },
};

// ------------------------------------------------------------ the beds

// Each stage: loops [name, level] and events {pool, every: [min, max] seconds, gain: [lo, hi], cut: low-pass Hz,
// rate, wet: share to the room}. A `chime` event plays wind-chime notes in the stage's key instead.
export const BEDS = {
  meadow: {
    loops: [['breeze', 0.07]],
    events: [{ pool: ['chirp', 'trill', 'warbler'], every: [3, 8], gain: [0.05, 0.1], cut: 6500, wet: 0.2 }],
  },
  beach: {
    loops: [['surf', 0.09]],
    events: [{ pool: ['gull'], every: [9, 20], gain: [0.04, 0.07], cut: 3800, wet: 0.3 }],
  },
  garden: {
    loops: [['rain', 0.075]],
    events: [
      { pool: ['drip'], every: [0.35, 1.6], gain: [0.03, 0.08], rate: [0.8, 1.3], wet: 0.3 },
      { pool: ['blackbird'], every: [9, 18], gain: [0.05, 0.09], cut: 5500, wet: 0.25 },
    ],
  },
  snow: {
    loops: [['snowwind', 0.09]],
    events: [{ chime: true, every: [5, 11], gain: [0.05, 0.09], wet: 0.4 }],
  },
  forest: {
    loops: [['stream', 0.085]],
    events: [
      { pool: ['thrush', 'warbler', 'chirp'], every: [4, 10], gain: [0.05, 0.1], cut: 6500, wet: 0.3 },
      { pool: ['cuckoo'], every: [22, 45], gain: [0.05, 0.08], cut: 3000, wet: 0.4 },
    ],
  },
};

export class Ambience {
  constructor(audio) {
    this.a = audio;
    this.beds = new Map();
    this.stage = null;
    this.next = [];
  }

  // Crossfade to a stage's bed over a couple of seconds.
  set(id) {
    const a = this.a;
    if (!BEDS[id]) id = 'meadow';
    const t = a.now();
    let bed = this.beds.get(id);
    if (!bed) bed = this.build(id, t);
    bed.kill = 0;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.setTargetAtTime(1, t, 0.9);
    for (const [k, b] of this.beds) {
      if (k === id) continue;
      b.gain.gain.cancelScheduledValues(t);
      b.gain.gain.setTargetAtTime(0, t, 0.9);
      b.kill = t + 5;
    }
    if (this.stage !== id) {
      this.stage = id;
      this.next = BEDS[id].events.map((ev) => t + 1 + rand(0.5, Math.min(4, ev.every[1])));
    }
  }

  build(id, t) {
    const a = this.a;
    const ctx = a.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(a.ambBus);
    const srcs = [];
    for (const [name, level] of BEDS[id].loops) {
      const s = a.loopSrc(a.buf(name), t);
      const g = ctx.createGain();
      g.gain.value = level;
      s.connect(g).connect(gain);
      srcs.push(s);
    }
    const bed = { id, gain, srcs, kill: 0 };
    this.beds.set(id, bed);
    return bed;
  }

  // every ~80 ms: the events due before `until`, and tidying faded beds
  pump(now, until, muted) {
    for (const [k, b] of this.beds) {
      if (b.kill && b.kill < now) {
        for (const s of b.srcs) {
          try {
            s.stop();
          } catch {
            /* already stopped */
          }
        }
        b.gain.disconnect();
        this.beds.delete(k);
      }
    }
    const def = BEDS[this.stage];
    if (!def) return;
    def.events.forEach((ev, i) => {
      if (this.next[i] < now - 1) this.next[i] = now + rand(0.5, 2);
      while (this.next[i] < until) {
        if (!muted) this.fire(ev, this.next[i]);
        this.next[i] += rand(ev.every[0], ev.every[1]);
      }
    });
  }

  fire(ev, t) {
    const a = this.a;
    const pan = rand(-0.8, 0.8);
    const gain = rand(ev.gain[0], ev.gain[1]);
    if (ev.chime) {
      // a little run of two to four chime notes down the stage's pentatonic, as a breeze catches them
      const base = a.tonic + 24;
      const scale = [0, 2, 4, 7, 9];
      let i = 4 + ((Math.random() * 5) | 0);
      for (let n = 0, count = 2 + ((Math.random() * 3) | 0); n < count; n++) {
        const m = base + 12 * Math.floor(i / 5) + scale[((i % 5) + 5) % 5];
        a.note('chime', m, t + n * rand(0.16, 0.42), gain * rand(0.7, 1), pan, a.ambBus, 0, 0.35);
        i -= 1 + ((Math.random() * 3) | 0);
        if (i < 0) i += 5;
      }
      return;
    }
    a.play(a.bank(pick(ev.pool)), { t, gain, rate: ev.rate ? rand(ev.rate[0], ev.rate[1]) : rand(0.94, 1.06), pan, cutoff: ev.cut || 0, wet: ev.wet, dest: a.ambBus, kind: 'amb' });
  }

  // warm-up jobs for a stage: its loops and its animals
  jobs(id) {
    const a = this.a;
    const def = BEDS[id];
    const jobs = [];
    for (const [name] of def.loops) jobs.push(() => a.buf(name));
    for (const ev of def.events) {
      if (ev.chime) continue;
      for (const name of ev.pool) for (let v = 0; v < a.variantsOf(name); v++) jobs.push(() => a.buf(name, v));
    }
    return jobs;
  }
}
