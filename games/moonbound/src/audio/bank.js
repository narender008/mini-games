// Moonbound audio: the bank. Every sound recipe (sfx, drums, loops) and every choir pad is
// rendered ONCE, in the background, by an OfflineAudioContext into plain Float32Arrays, measured
// and scaled to its loudness target (dsp.js burstDb), and kept as an Asset. Playing a sound is
// then only a buffer source, so the game pays nothing for the synthesis. Plucked harp notes are
// made in plain JS (dsp.js pluckData), a millisecond each, on first use.
//
// The queue is a list of jobs run one at a time with a pause between them, most needed first
// (interface and combat sounds, then the drums the score uses, then the rest, then the loops). A
// sound asked for before it is built is run live by audio.js from the same recipe.
//
// An Asset keeps its samples and wraps them in an AudioBuffer for each context that plays it,
// so one bank can feed a live context and an offline test alike.
import { Kit } from './kit.js';
import { SFX } from './sfx.js';
import { SFX2 } from './sfx2.js';
import { DRUMS } from './drums.js';
import { LOOPS } from './loops.js';
import { seeded, hashStr, burstDb, fadeEnds, dbToLin, mtof, noiseTable, pluckData, scalePeak, statsOf } from './dsp.js';

export const ALL_SFX = { ...SFX, ...SFX2 };

export function getOAC() {
  const g = globalThis;
  return g.OfflineAudioContext || g.webkitOfflineAudioContext || null;
}

export class Asset {
  constructor(ch, sr, meta = {}) {
    this.ch = ch;
    this.sr = sr;
    this.len = ch[0].length;
    this.dur = this.len / sr;
    this.meta = meta;
    this._b = new WeakMap();
  }

  // the AudioBuffer of this asset for a context (made once per context)
  buf(ctx) {
    let b = this._b.get(ctx);
    if (!b) {
      b = ctx.createBuffer(this.ch.length, this.len, this.sr);
      for (let c = 0; c < this.ch.length; c++) {
        if (b.copyToChannel) b.copyToChannel(this.ch[c], c);
        else b.getChannelData(c).set(this.ch[c]);
      }
      this._b.set(ctx, b);
    }
    return b;
  }
}

// The recipe helpers: s.tone(at, o) and friends, times counted from `t0`; o.dest overrides the output.
export function bind(k, out, t0) {
  return {
    k,
    out,
    t: t0,
    tone: (at, o) => k.tone(o.dest || out, t0 + at, o),
    noise: (at, o) => k.noise(o.dest || out, t0 + at, o),
    modal: (at, o) => k.modal(o.dest || out, t0 + at, o),
    fm: (at, o) => k.fm(o.dest || out, t0 + at, o),
    vox: (at, o) => k.vox(o.dest || out, t0 + at, o),
  };
}

// Squash the peaks: scale to peak 1, tanh(k x) / tanh(k), scale back. More body for the same peak,
// and the low thumps gain upper harmonics that small speakers can play.
function saturate(d, k) {
  const pk = statsOf([d]).peak;
  if (pk <= 0) return;
  const norm = 1 / Math.tanh(k);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh((k * d[i]) / pk) * norm * pk;
}

function scaleTo(d, sr, tgt, peakCap = 0.95) {
  const pk = statsOf([d]).peak;
  const db = burstDb([d], sr);
  let g = dbToLin(tgt - db);
  if (pk > 0) g = Math.min(g, peakCap / pk);
  for (let i = 0; i < d.length; i++) d[i] *= g;
  return { gain: g, peak: pk * g, db: db + 20 * Math.log10(g) };
}

// Render the variants of a one-shot recipe (sfx or drum) in one offline context, one after the other.
export async function renderOneShot(name, def, sr) {
  const OAC = getOAC();
  const n = def.v ?? 2;
  const slot = Math.ceil((def.dur + 0.05) * sr);
  const ctx = new OAC(1, slot * n, sr);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const seed = hashStr(name);
  const k = new Kit(ctx, seed);
  for (let v = 0; v < n; v++) {
    const r = seeded(seed + v * 7919 + 1);
    k.rnd = r;
    def.fn(bind(k, out, (v * slot) / sr + 0.001), r, v);
  }
  const buf = await ctx.startRendering();
  const all = buf.getChannelData(0);
  const res = [];
  for (let v = 0; v < n; v++) {
    const d = new Float32Array(Math.ceil(def.dur * sr));
    d.set(all.subarray(v * slot, v * slot + d.length));
    fadeEnds(d, 0, Math.round(0.012 * sr));
    if (def.sat) saturate(d, def.sat);
    const m = scaleTo(d, sr, def.tgt);
    res.push(new Asset([d], sr, { name, v, ...m }));
  }
  return res;
}

// A loop: render a run-in and one period, keep the period (see loops.js).
export async function renderLoop(name, def, sr) {
  const OAC = getOAC();
  const P = 1.0;
  const L = def.len;
  const nL = Math.round(L * sr);
  const nP = Math.round(P * sr);
  const ctx = new OAC(def.ch, nP + nL, sr);
  const seed = hashStr(name);
  const k = new Kit(ctx, seed);
  const r = seeded(seed + 5);
  k.rnd = r;
  const outs = [];
  if (def.ch === 1) {
    const g = ctx.createGain();
    g.connect(ctx.destination);
    outs.push(g);
  } else {
    const m = ctx.createChannelMerger(def.ch);
    m.connect(ctx.destination);
    for (let i = 0; i < def.ch; i++) {
      const g = ctx.createGain();
      g.connect(m, 0, i);
      outs.push(g);
    }
  }
  const c = {
    ctx, kit: k, L, P, sr, out: outs,
    gain: (v) => k.gain(v),
    filt: (type, f, q = 0.707) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    },
    noise: (kind, sd) => {
      const d = noiseTable(kind, nL, seeded(sd * 131 + seed));
      const b = ctx.createBuffer(1, nL, sr);
      if (b.copyToChannel) b.copyToChannel(d, 0);
      else b.getChannelData(0).set(d);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.start(0);
      return s;
    },
    osc: (type, f) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = Math.round(f * L) / L;
      o.start(0);
      return o;
    },
    lfo: (param, cycles, depth) => {
      const o = ctx.createOscillator();
      o.frequency.value = cycles / L;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g);
      g.connect(param);
      o.start(0);
    },
    ev: (phase, fn) => {
      for (let t = phase; t < P + L; t += L) fn(t);
    },
  };
  def.fn(c, r);
  const buf = await ctx.startRendering();
  const ch = [];
  for (let i = 0; i < def.ch; i++) ch.push(buf.getChannelData(i).slice(nP, nP + nL));
  // one gain for all channels, from the louder
  let tgt = -1e9;
  for (const d of ch) tgt = Math.max(tgt, burstDb([d], sr));
  let pk = 0;
  for (const d of ch) pk = Math.max(pk, statsOf([d]).peak);
  let g = dbToLin(def.tgt - tgt);
  if (pk > 0) g = Math.min(g, 0.9 / pk);
  for (const d of ch) for (let i = 0; i < d.length; i++) d[i] *= g;
  return new Asset(ch, sr, { name, loop: true, gain: g });
}

// the wordless vowels of the choir: formant Hz, Q, gain
export const VOWELS = {
  ah: [[760, 10, 1], [1120, 11, 0.5], [2650, 12, 0.18]],
  oh: [[470, 10, 1], [830, 11, 0.42], [2650, 12, 0.1]],
  oo: [[330, 10, 1], [720, 11, 0.28], [2600, 12, 0.06]],
  eh: [[560, 10, 1], [1700, 11, 0.45], [2600, 12, 0.15]],
};

// A choir pad: a sustained vowel on one note, as a loop of exactly two seconds (the oscillators
// and the vibrato make whole cycles in the loop), so it can be held for as long as needed.
export async function renderChoir(vowel, midi, sr) {
  const OAC = getOAC();
  const L = 2;
  const P = 0.6;
  const nL = Math.round(L * sr);
  const nP = Math.round(P * sr);
  const ctx = new OAC(1, nP + nL, sr);
  const f0 = mtof(midi);
  const form = VOWELS[vowel] || VOWELS.ah;
  // formants rise a little with pitch, as a higher voice has a shorter tract
  const shift = f0 > 300 ? 1 + Math.min(0.25, (f0 - 300) / 1500) : 1;
  const sum = ctx.createGain();
  const dets = [-17, -8, 0, 7, 15];
  const rates = [4.5, 5, 5.5, 5, 4.5];
  dets.forEach((cents, i) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = Math.round(f0 * 2 ** (cents / 1200) * L) / L;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rates[i];
    const lg = ctx.createGain();
    lg.gain.value = 9 + (i % 3) * 3;
    lfo.connect(lg);
    lg.connect(o.detune);
    const og = ctx.createGain();
    og.gain.value = 0.2;
    o.connect(og);
    og.connect(sum);
    o.start(0);
    lfo.start(0);
  });
  // breath
  const nd = noiseTable('pink', nL, seeded(midi * 17 + 3));
  const nb = ctx.createBuffer(1, nL, sr);
  nb.copyToChannel(nd, 0);
  const ns = ctx.createBufferSource();
  ns.buffer = nb;
  ns.loop = true;
  const ng = ctx.createGain();
  ng.gain.value = 0.35;
  ns.connect(ng);
  ng.connect(sum);
  ns.start(0);
  const out = ctx.createGain();
  out.gain.value = 1;
  for (const [fc, q, gn] of form) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = fc * shift;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gn;
    sum.connect(bp);
    bp.connect(g);
    g.connect(out);
  }
  out.connect(ctx.destination);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0).slice(nP, nP + nL);
  scalePeak(d, 0.5);
  return new Asset([d], sr, { name: `choir:${vowel}:${midi}`, loop: true });
}

// What gets built first: lower number, sooner.
const PRIO = [
  [/^(ui_|step$|dash$|twins_|staff_|moon_bolt|hit_|crit$|shatter_|hurt$|skitter$|telegraph$)/, 0],
  [/^(heartbeat|death|cast_rune|rune_burst|whirl_spin|crescent_wave|arrow_|bow_|leap|wail|orb_|spear_|shield_|spikes|trap_|pickup_|dummy_|urn_)/, 1],
];

export class Bank {
  constructor({ sr = 44100 } = {}) {
    this.sr = sr;
    this.sfx = new Map(); // name -> [Asset]
    this.drums = new Map();
    this.loops = new Map();
    this.choirs = new Map();
    this.jobs = [];
    this.errors = [];
    this.done = 0;
    this.total = 0;
    this._last = {};
    this._plucks = new Map();
    this._running = null;
    this._wait = [];
    this._have = new Set();
  }

  // queue everything in the order the game needs it
  queueAll() {
    for (const name of Object.keys(ALL_SFX)) {
      const p = PRIO.find(([re]) => re.test(name));
      this._job('sfx', name, p ? p[1] : 2);
    }
    for (const name of Object.keys(DRUMS)) this._job('drum', name, 0.5);
    for (const name of Object.keys(LOOPS)) this._job('loop', name, 3);
  }

  _job(kind, name, prio) {
    const key = `${kind}:${name}`;
    if (this._have.has(key)) return;
    this._have.add(key);
    this.jobs.push({ kind, name, prio, key });
    this.total++;
    this.jobs.sort((a, b) => a.prio - b.prio);
  }

  // queue something at a given priority (lower runs sooner); nothing happens if it is already queued or built
  request(kind, name, prio = 2) {
    this._job(kind, name, prio);
    this.start();
  }

  // ask for something to be built now (next in the queue)
  want(kind, name) {
    const key = `${kind}:${name}`;
    if (!this._have.has(key)) {
      this._have.add(key);
      this.jobs.unshift({ kind, name, prio: -1, key });
      this.total++;
    } else {
      const j = this.jobs.find((x) => x.key === key);
      if (j && j.prio > -1) {
        j.prio = -1;
        this.jobs.sort((a, b) => a.prio - b.prio);
      }
    }
    this.start();
  }

  get pending() {
    return this.jobs.length + (this._busy ? 1 : 0);
  }

  start() {
    if (this._running || !this.jobs.length || !getOAC()) return;
    this._running = this._pump().finally(() => {
      this._running = null;
      if (this.jobs.length) this.start();
      else for (const r of this._wait.splice(0)) r();
    });
  }

  async _pump() {
    while (this.jobs.length) {
      const j = this.jobs.shift();
      this._busy = true;
      try {
        await this._run(j);
      } catch (err) {
        this.errors.push(`${j.key}: ${err && err.message ? err.message : err}`);
        if (typeof console !== 'undefined') console.warn('moonbound audio: could not build', j.key, err);
      }
      this._busy = false;
      this.done++;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  async _run(j) {
    const sr = this.sr;
    if (j.kind === 'sfx') this.sfx.set(j.name, await renderOneShot(j.name, ALL_SFX[j.name], sr));
    else if (j.kind === 'drum') this.drums.set(j.name, await renderOneShot(j.name, DRUMS[j.name], sr));
    else if (j.kind === 'loop') this.loops.set(j.name, await renderLoop(j.name, LOOPS[j.name], sr));
    else if (j.kind === 'choir') {
      const [vowel, midi] = j.name.split(':');
      this.choirs.set(j.name, await renderChoir(vowel, +midi, 22050));
    }
  }

  // resolves when the queue is empty
  idle() {
    if ((!this.jobs.length && !this._running) || !getOAC()) return Promise.resolve();
    this.start();
    return new Promise((r) => this._wait.push(r));
  }

  // a variant of a sound at random, never the one that just played
  pick(name) {
    const arr = this.sfx.get(name);
    if (!arr) return null;
    return this._variant(arr, `s:${name}`);
  }

  drum(name) {
    const arr = this.drums.get(name);
    return arr ? this._variant(arr, `d:${name}`) : null;
  }

  _variant(arr, key) {
    if (arr.length === 1) return arr[0];
    let i = Math.floor(Math.random() * arr.length);
    if (i === this._last[key]) i = (i + 1) % arr.length;
    this._last[key] = i;
    return arr[i];
  }

  loop(name) {
    return this.loops.get(name) || null;
  }

  // a choir loop, or null (it is then built, and will be there next time)
  choir(vowel, midi) {
    const name = `${vowel}:${midi}`;
    const a = this.choirs.get(name);
    if (!a) this.want('choir', name);
    return a || null;
  }

  // a plucked harp note (made in JS the first time it is asked for)
  pluck(midi) {
    let a = this._plucks.get(midi);
    if (!a) {
      const sr = 32000;
      a = new Asset([pluckData(sr, midi, seeded(midi * 31 + 7), { dur: 3, t60: 2.8, bright: 0.45 })], sr, { name: `pluck:${midi}` });
      this._plucks.set(midi, a);
    }
    return a;
  }
}
