// Iron Barrage's sound: everything is synthesised at run time with Web Audio, no
// audio files, no samples, no voices, no network.
//
// How it is built:
//  - one-shots (shots, blasts, impacts, interface) are rendered once, in plain
//    JS, into mono buffers by the recipes in fire.js, boom.js, hit.js and ui.js
//    (layers.js, dsp.js), several variants each. The renders are generators that
//    do a block of work and yield, so unlock() builds them a few milliseconds at
//    a time between frames and nothing stalls a frame; `ready` turns true once
//    the core set is made and what is asked for before a buffer exists is
//    simply skipped. Each buffer is measured (an A-weighted short-term level) so
//    every sound lands at the loudness set in TARGET whatever its recipe;
//  - a one-shot plays through a small chain: source(s) -> level -> distance
//    low-pass -> stereo pan -> positioned bus, with a send to a shared outdoor
//    reverb. Blasts come as two buffers (`hi`: crack, roar, debris; `lo`: thump,
//    rumble, echo) so a far-off blast can delay its low end a touch. Distance
//    keeps what is on screen full and makes what is off screen quieter and
//    duller. About 24 voices at once; at the cap the oldest, quietest goes;
//  - continuous voices (voices.js) and the weather bed (ambience.js) are small
//    live graphs over looped buffers; the music (music.js) is live synthesis on
//    a lookahead scheduler;
//  - one master chain: a shock stage (setTimeScale / shellshock), a gentle bus
//    compressor, a final limiter and a soft ceiling, so the biggest blast is
//    punchy and never clips.
// Everything is safe to call before unlock(); calls are remembered where it
// matters (music, ambience, wind) and sounds are skipped otherwise.
import { UIS } from './ui.js';
import { FIRES } from './fire.js';
import { BOOMS } from './boom.js';
import { HITS } from './hit.js';
import { LOOPS, EVENTS } from './loops.js';
import { Music } from './music.js';
import { Ambience, KINDS } from './ambience.js';
import { Whistle, Engine, Burn, Jet, Rocket, NO_VOICE, Deferred, makePan } from './voices.js';
import { clamp, seeded, noise, run, Biquad, BLOCK } from './dsp.js';

const MASTER = 0.9;
const MAX_VOICES = 24;
const MAX_CONT = 24;
const BUDGET_MS = 2.2; // work per build chunk (a step may run a little over)
const GAP_MS = 9; // pause between build chunks

// The loudness each sound gets, in dBFS of A-weighted short-term level (150 ms for
// bursts, the whole loop for loops), before distance and size. Explosions loudest,
// then shots, impacts, the interface quietest.
const TARGET = {
  'boom.he': -14.5, 'boom.heavy': -12.5, 'boom.small': -19, 'boom.cluster': -23, 'boom.air': -17, 'boom.napalm': -15,
  'boom.buster': -12.5, 'boom.nuke': -7, 'boom.cookoff': -16.5,
  'boom.bomb': -14, 'boom.missile': -14.5, 'boom.sabot': -15, 'boom.roller': -16.5,
  'fire.cannon': -24, 'fire.heavy': -22, 'fire.mortar': -25, 'fire.missile': -23, 'fire.sabot': -24, 'fire.flare': -29, 'fire.mg': -27,
  'hit.metal': -14, 'hit.ricochet': -17, 'hit.dirt': -20, 'hit.debris': -19, 'hit.splat': -22, 'hit.thud': -21, 'hit.shield': -18, 'hit.repair': -21, 'hit.chute': -22,
  'ui.click': -31, 'ui.select': -30, 'ui.buy': -30, 'ui.deny': -33, 'ui.turn': -26, 'ui.alarm': -27, 'ui.tick': -35, 'ui.reward': -26,
  'loop.engine': -27, 'loop.squeal': -34, 'loop.burnRoar': -27, 'loop.burnCrackle': -35, 'loop.jet': -23, 'loop.rocket': -21,
  'loop.windFarm': -29, 'loop.windDesert': -30, 'loop.windSnow': -30, 'loop.windCity': -31, 'loop.windNight': -33, 'loop.rain': -30, 'loop.crickets': -35,
  'ev.farGun': -29, 'ev.farBurst': -32, 'ev.crow': -35, 'ev.siren': -37, 'ev.thunder': -25,
};

// built just after `ready`: the big or rarely used blasts (a player cannot fire one in the first seconds)
const LATE = new Set(['boom.nuke', 'boom.bomb', 'boom.missile', 'boom.sabot', 'boom.roller']);

// how many of a kind may sound at once (the rest are dropped), so pops and debris never crowd out blasts
const KMAX = { 'boom.cluster': 10, 'boom.small': 8, 'fire.mg': 8, 'hit.debris': 4, 'hit.dirt': 5, 'hit.ricochet': 4, 'hit.splat': 4 };

// a recipe may be lifted this much to reach its target (the nuke, spread thin over ten seconds, more)
const GAIN_CAP = 1.8;
const CAP = { 'boom.nuke': 4, 'boom.bomb': 2.2 };

// Two loudness figures of a rendered sound, in dB: an A-weighted-ish one (mean
// square after a 170 Hz high-pass, as the ear hears little below that) and the
// plain one, each the loudest 150 ms window ('burst') or the whole ('mean').
function* measure(res, mode) {
  const { sr, hi, lo } = res;
  const n = hi.length;
  const a = new Biquad('highpass', 170, 0.707, sr);
  const hop = Math.max(1, Math.round(0.025 * sr));
  const blocks = Math.ceil(n / hop);
  const e = new Float64Array(blocks);
  const r = new Float64Array(blocks);
  for (let i = 0; i < n; i++) {
    const x = hi[i] + (lo ? lo[i] : 0);
    const y = a.run(x);
    e[(i / hop) | 0] += y * y;
    r[(i / hop) | 0] += x * x;
    if ((i & (BLOCK - 1)) === BLOCK - 1) yield;
  }
  const wb = mode === 'mean' ? blocks : Math.max(1, Math.round(0.15 / 0.025));
  const len = Math.min(n, wb * hop);
  let bestA = 0;
  let bestR = 0;
  let sa = 0;
  let sr2 = 0;
  for (let k = 0; k < blocks; k++) {
    sa += e[k];
    sr2 += r[k];
    if (k >= wb) {
      sa -= e[k - wb];
      sr2 -= r[k - wb];
    }
    if (sa > bestA) bestA = sa;
    if (sr2 > bestR) bestR = sr2;
  }
  return { a: 10 * Math.log10(bestA / len + 1e-12), raw: 10 * Math.log10(bestR / len + 1e-12) };
}

// the shared outdoor space: nothing for 20 ms, a few hard reflections off hills,
// then a long dark tail (about 2.4 s to fade), stereo, energy 1
function* makeIR(ctx) {
  const sr = ctx.sampleRate;
  const secs = 2.6;
  const n = Math.round(sr * secs);
  const chans = [new Float32Array(n), new Float32Array(n)];
  for (let ch = 0; ch < 2; ch++) {
    const d = chans[ch];
    const r = seeded(900 + ch);
    let lp = 0;
    let e = 0;
    const pre = Math.round(0.02 * sr);
    for (let b = 0; b < n; b += BLOCK) {
      const end = Math.min(n, b + BLOCK);
      for (let i = b; i < end; i++) {
        const t = i / sr;
        lp += (0.55 - 0.5 * Math.min(1, t / 2.0)) * (r() * 2 - 1 - lp);
        const ramp = i < pre ? 0 : t < 0.05 ? (t - 0.02) / 0.03 : 1;
        d[i] = lp * Math.exp(-t * 2.9) * ramp;
      }
      yield;
    }
    for (const [dt, g] of ch ? [[0.083, 0.5], [0.19, -0.35], [0.33, 0.25]] : [[0.097, 0.5], [0.16, -0.35], [0.29, 0.25]]) {
      d[Math.round(dt * sr)] += g * 0.3;
    }
    for (let b = 0; b < n; b += BLOCK) {
      const end = Math.min(n, b + BLOCK);
      for (let i = b; i < end; i++) e += d[i] * d[i];
      yield;
    }
    const k = 1 / Math.sqrt(e);
    for (let b = 0; b < n; b += BLOCK) {
      const end = Math.min(n, b + BLOCK);
      for (let i = b; i < end; i++) d[i] *= k;
      yield;
    }
  }
  // the audio buffer last, one small step at a time
  yield;
  const buf = ctx.createBuffer(2, n, sr);
  yield;
  buf.getChannelData(0).set(chans[0]);
  yield;
  buf.getChannelData(1).set(chans[1]);
  return buf;
}

// a soft ceiling: untouched up to 0.8, eased towards 0.985 which it never passes
function softCeiling() {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.185 * Math.tanh((a - 0.8) / 0.185));
  }
  return c;
}

const hash = (s) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h & 0xffff;
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.offline = false;
    this._muted = false; // master: everything, the score too
    this._fxOn = true; // false: guns, blasts, interface and the weather bed go quiet, the score plays on
    this._hidden = false;
    this._ready = false;
    this._lib = new Map(); // key -> [entry per variant]
    this._last = {};
    this._kc = {};
    this._jobs = [];
    this._jobT = 0;
    this._ir = null;
    this._voices = [];
    this._live = new Set();
    this._cx = 0;
    this._hw = 40;
    this.spG = 1;
    this.spLP = 17000;
    this.spPan = 0;
    this.spLag = 0;
    this.spOver = 0;
    this._ts = 1;
    this._tsT = 1;
    this._tsRate = 1;
    this._tsAt = 0;
    this._want = { music: undefined, intensity: 0, amb: undefined, wind: 0 };
    this.stats = { chunks: 0, longest: 0, total: 0, startedAt: 0, readyAt: 0, doneAt: 0, jobs: 0, slowest: 0, slowestKey: '' };
    this._music = null;
    this._amb = null;
  }

  get ready() {
    return this._ready;
  }

  get muted() {
    return this._muted;
  }

  // ------------------------------------------------------------ context

  // Call inside a user gesture, as often as you like: makes (or wakes) the audio
  // context, then builds the sounds in the background.
  unlock() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        this.ctx = null;
        return;
      }
      this._build();
      // older iOS only opens the output once something plays inside the gesture
      try {
        const s = this.ctx.createBufferSource();
        s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        s.connect(this.ctx.destination);
        s.start();
      } catch {
        /* fine */
      }
    }
    this._sync();
  }

  // Tests: build on a context made elsewhere (an OfflineAudioContext), reusing
  // `share`'s rendered buffers, so a sound can be rendered and measured without
  // playing anything aloud.
  attach(ctx, { share = null } = {}) {
    this.ctx = ctx;
    this.offline = true;
    if (share) {
      this._lib = share._lib;
      this._ready = share._ready;
      if (share._ir && share._ir.sampleRate === ctx.sampleRate) this._ir = share._ir;
    }
    this._build(!!share);
    return this;
  }

  _build(shared = false) {
    const ctx = this.ctx;
    const node = (v) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    // the master chain
    this.mix = node(1);
    this.shockGain = node(1);
    this.shockLP = ctx.createBiquadFilter();
    this.shockLP.type = 'lowpass';
    this.shockLP.frequency.value = 20000;
    this.shockLP.Q.value = 0.5;
    this.post = node(1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 28;
    hp.Q.value = 0.7;
    // the bus compressor; Chrome adds its own make-up gain, taken back off here
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 14;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.22;
    this.compTrim = node(0.62);
    this.master = node(this._audible() ? MASTER : 0);
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.1;
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = softCeiling();
    ceiling.oversample = '2x';
    this.out = node(1);
    this.mix.connect(this.shockGain).connect(this.shockLP).connect(this.post).connect(hp).connect(comp).connect(this.compTrim).connect(this.master).connect(lim).connect(ceiling).connect(this.out).connect(ctx.destination);
    // the ring after a blast: two close high sines, joined after the shock's low-pass
    this.ringGain = node(0);
    this.ring = [ctx.createOscillator(), ctx.createOscillator()];
    this.ring[0].frequency.value = 5200;
    this.ring[1].frequency.value = 5213;
    for (const o of this.ring) {
      o.connect(this.ringGain);
      o.start();
    }
    this.ringGain.connect(this.post);
    // buses: everything but the score meets on fxBus, so the effects switch can drop it and leave the music
    this.fxBus = node(this._fxOn ? 1 : 0);
    this.fxBus.connect(this.mix);
    this.sfxBus = node(1);
    this.sfxBus.connect(this.fxBus);
    this.uiBus = node(1);
    this.uiBus.connect(this.sfxBus);
    this.slowLP = ctx.createBiquadFilter();
    this.slowLP.type = 'lowpass';
    this.slowLP.frequency.value = 22000;
    this.slowLP.Q.value = 0.5;
    this.posBus = node(1);
    this.posBus.connect(this.slowLP).connect(this.sfxBus);
    this.ambBus = node(1);
    this.ambBus.connect(this.fxBus);
    this.musicBus = node(0.11);
    this.musicBus.connect(this.mix);
    // the reverb: positioned sounds send to it through a low-pass that follows slow motion, music sends straight
    this.conv = ctx.createConvolver();
    this.conv.normalize = false;
    this.verbOut = node(0.55);
    this.verbIn = node(1);
    this.verbIn.connect(this.conv).connect(this.verbOut).connect(this.mix);
    this.slowLP2 = ctx.createBiquadFilter();
    this.slowLP2.type = 'lowpass';
    this.slowLP2.frequency.value = 22000;
    this.slowLP2.Q.value = 0.5;
    this.posSend = node(this._fxOn ? 1 : 0); // the reverb also carries the score, so the effects' send is cut on its own
    this.posSend.connect(this.slowLP2).connect(this.verbIn);
    this.musicSend = node(0.22);
    this.musicBus.connect(this.musicSend).connect(this.verbIn);
    // a second of noise for whistles and drums
    const nb = ctx.createBuffer(1, Math.round(ctx.sampleRate * 1.5), ctx.sampleRate);
    nb.getChannelData(0).set(run(noise(nb.length, seeded(4242))));
    this.noiseBuf = nb;

    this._music = new Music(this);
    this._amb = new Ambience(this);
    if (this._ir) this.conv.buffer = this._ir;
    if (this.offline) {
      if (!shared) this._queue();
    } else {
      this._queue();
      this.stats.startedAt = performance.now();
      this._jobT = setTimeout(() => this._pumpJobs(), 30);
      this._janitorT = setInterval(() => this._janitor(), 250);
    }
    // what was asked for before there was a context
    const w = this._want;
    this._amb.setWind(w.wind);
    if (w.amb !== undefined) this.ambience(w.amb);
    this._music.setIntensity(w.intensity, true);
    if (w.music !== undefined) this._music.play(w.music);
  }

  _audible() {
    return !this._muted && !this._hidden;
  }

  // run the context only while there is something to hear
  _sync() {
    if (!this.ctx || this.offline) return;
    clearTimeout(this._sleepT);
    if (this._audible()) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    } else {
      this._sleepT = setTimeout(() => {
        if (!this._audible() && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
      }, this._hidden ? 150 : 500);
    }
  }

  _gainMaster(tc) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this._audible() ? MASTER : 0, t, tc);
  }

  setMuted(on) {
    this._muted = !!on;
    this._gainMaster(0.025);
    this._sync();
  }

  // Effects off: new one-shots are skipped and what is sounding fades out; the
  // score keeps playing (setMuted is the master switch).
  setEffects(on) {
    this._fxOn = !!on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of [this.fxBus.gain, this.posSend.gain]) {
      g.cancelScheduledValues(t);
      g.setTargetAtTime(this._fxOn ? 1 : 0, t, 0.03);
    }
  }

  // the tab is hidden
  suspend() {
    this._hidden = true;
    this._gainMaster(0.03);
    this._sync();
  }

  // the tab is shown again
  resume() {
    this._hidden = false;
    this._gainMaster(0.1);
    this._sync();
  }

  // ------------------------------------------------------------ the library

  // every sound to render, nearest-needed first (priority 0..2 is the core set that makes `ready`)
  _queue() {
    const queued = new Set();
    const add = (key, v, prio, e) => {
      let arr = this._lib.get(key);
      if (!arr) this._lib.set(key, (arr = new Array(e.variants || 1)));
      // not already built, and not already queued at an earlier priority
      if (arr[v] || queued.has(`${key}#${v}`)) return;
      queued.add(`${key}#${v}`);
      this._jobs.push({ key, v, prio, e, gen: null });
    };
    if (!this._ir && this.ctx) this._jobs.push({ key: 'ir', v: 0, prio: 0, e: null, gen: null });
    const groups = [['ui', UIS], ['fire', FIRES], ['boom', BOOMS], ['hit', HITS]];
    for (const [g, tbl] of groups) {
      for (const [name, e] of Object.entries(tbl)) {
        const key = `${g}.${name}`;
        add(key, 0, g === 'ui' || g === 'fire' ? 1 : LATE.has(key) ? 3 : 2, e);
      }
    }
    for (const name of ['engine', 'burnRoar', 'burnCrackle', 'squeal', 'jet', 'rocket']) add(`loop.${name}`, 0, 3, { ...LOOPS[name], variants: 1 });
    // the other variants, round-robin so every kind gains one at a time
    for (let v = 1; v < 4; v++) {
      for (const [g, tbl] of groups) {
        for (const [name, e] of Object.entries(tbl)) if (v < (e.variants || 1)) add(`${g}.${name}`, v, 4, e);
      }
    }
    for (const [name, e] of Object.entries(LOOPS)) add(`loop.${name}`, 0, 5, { ...e, variants: 1 });
    for (const [name, e] of Object.entries(EVENTS)) for (let v = 0; v < e.variants; v++) add(`ev.${name}`, v, 5, e);
    this._jobs.sort((a, b) => a.prio - b.prio);
    this.stats.jobs = this._jobs.length;
  }

  // move what a weather bed needs to the front of the queue
  _bump(keys) {
    let any = false;
    for (const j of this._jobs) {
      if (j.prio > 2.5 && keys.includes(j.key) && j.v === 0) {
        j.prio = 2.5;
        any = true;
      } else if (j.prio > 2.5 && keys.includes(j.key)) {
        j.prio = 2.6;
        any = true;
      }
    }
    if (any) this._jobs.sort((a, b) => a.prio - b.prio);
  }

  *_render(job) {
    const e = job.e;
    const key = job.key;
    const res = yield* e.render(e.sr, 1000 + job.v * 7919 + hash(key) * 3, job.v);
    const mode = key.startsWith('loop.') || key.startsWith('ev.') ? 'mean' : 'burst';
    const m = yield* measure(res, mode);
    return { res, m, mode };
  }

  _finish(job, out) {
    const ctx = this.ctx;
    if (job.key === 'ir') {
      this._ir = out;
      this.conv.buffer = out;
      return;
    }
    const { res, m, mode } = out;
    const mk = (arr) => {
      const b = ctx.createBuffer(1, arr.length, res.sr);
      b.getChannelData(0).set(arr);
      return b;
    };
    const tgt = TARGET[job.key] ?? -24;
    let gain = Math.pow(10, (tgt - m.a) / 20);
    // a sound that is mostly low rumble reads quiet by ear but would still load the master chain: its plain level may not pass target + 9 dB
    gain = Math.min(gain, Math.pow(10, (tgt + 9 - m.raw) / 20));
    if (mode === 'burst') gain = Math.min(gain, CAP[job.key] ?? GAIN_CAP);
    this._lib.get(job.key)[job.v] = { hi: mk(res.hi), lo: res.lo ? mk(res.lo) : null, gain, dur: res.hi.length / res.sr };
  }

  // run queued renders for a few milliseconds at a time
  _pumpJobs() {
    clearTimeout(this._jobT);
    const jobs = this._jobs;
    if (!jobs.length) return;
    if (this._hidden) {
      this._jobT = setTimeout(() => this._pumpJobs(), 250);
      return;
    }
    const t0 = performance.now();
    const st = this.stats;
    while (jobs.length && performance.now() - t0 < BUDGET_MS) {
      const key = jobs[0].key + '#' + jobs[0].v;
      const s0 = performance.now();
      this._step(jobs);
      const sd = performance.now() - s0;
      if (sd > st.slowest) {
        st.slowest = sd;
        st.slowestKey = key;
      }
    }
    const dt = performance.now() - t0;
    st.chunks++;
    st.total += dt;
    if (dt > st.longest) st.longest = dt;
    this._checkReady();
    if (jobs.length) this._jobT = setTimeout(() => this._pumpJobs(), GAP_MS);
    else st.doneAt = performance.now() - st.startedAt;
  }

  // advance the first job by one slice (a block of work)
  _step(jobs) {
    const job = jobs[0];
    try {
      if (!job.gen) job.gen = job.key === 'ir' ? makeIR(this.ctx) : this._render(job);
      const s = job.gen.next();
      if (s.done) {
        jobs.shift();
        this._finish(job, s.value);
      }
    } catch (err) {
      jobs.shift();
      if (typeof console !== 'undefined') console.warn(`iron-barrage sound: ${job.key} failed`, err);
    }
  }

  _checkReady() {
    if (this._ready) return;
    if (!this._jobs.some((j) => j.prio <= 2)) {
      this._ready = true;
      this.stats.readyAt = performance.now() - this.stats.startedAt;
    }
  }

  // Tests: render everything that is queued, right now.
  warmAll() {
    clearTimeout(this._jobT);
    while (this._jobs.length) this._step(this._jobs);
    this._ready = true;
  }

  // the first built variant of a sound
  _entry(key) {
    const arr = this._lib.get(key);
    if (!arr) return null;
    for (const e of arr) if (e) return e;
    return null;
  }

  // a built variant at random, never the one that just played
  _pick(key) {
    const arr = this._lib.get(key);
    if (!arr) return null;
    let n = 0;
    for (const e of arr) if (e) n++;
    if (!n) return null;
    let i = Math.floor(Math.random() * arr.length);
    for (let tries = 0; tries < arr.length + 1; tries++) {
      if (arr[i] && (n === 1 || i !== this._last[key])) break;
      i = (i + 1) % arr.length;
    }
    if (!arr[i]) return this._entry(key);
    this._last[key] = i;
    return arr[i];
  }

  // ------------------------------------------------------------ listening, time

  // The camera's centre x and half its visible width, in metres. Call every frame.
  listen(cx, halfWidth) {
    this._cx = cx;
    this._hw = halfWidth > 1 ? halfWidth : 1;
    if (this._tsT !== this._ts) this._stepTime();
  }

  // 1 normally; below that (a slow-motion beat) everything positioned drops in
  // pitch and loses its highs, smoothly
  setTimeScale(s) {
    const v = clamp(Number(s) || 1, 0.1, 1);
    if (v === this._tsT) return;
    if (this._ts === this._tsT) this._tsAt = performance.now();
    this._tsT = v;
  }

  _stepTime() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._tsAt) / 1000);
    this._tsAt = now;
    this._ts += (this._tsT - this._ts) * (1 - Math.exp(-dt / 0.12));
    if (Math.abs(this._tsT - this._ts) < 0.003) this._ts = this._tsT;
    this._tsRate = 0.42 + 0.58 * this._ts;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const cut = 900 + 21100 * this._ts * this._ts * this._ts;
    this.slowLP.frequency.setTargetAtTime(cut, t, 0.04);
    this.slowLP2.frequency.setTargetAtTime(cut, t, 0.04);
    const vs = this._voices;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      v.hi.playbackRate.value = v.rate * this._tsRate;
      if (v.lo) v.lo.playbackRate.value = v.rate * this._tsRate;
    }
  }

  // Where a sound at x is heard from: its level, tone, pan and the delay of its low end.
  _spatial(x) {
    const hw = this._hw;
    const dx = x - this._cx;
    const ad = dx < 0 ? -dx : dx;
    const over = ad > hw ? (ad - hw) / hw : 0;
    const inner = ad < hw ? ad / hw : 1;
    this.spOver = over;
    this.spG = (1 - 0.18 * inner) / Math.pow(1 + 1.2 * over, 1.6);
    this.spLP = (17000 - 5000 * inner) / (1 + 5 * over);
    this.spPan = clamp(dx / hw, -1, 1) * 0.9;
    this.spLag = Math.min(0.14, over * 0.05);
  }

  // ------------------------------------------------------------ one-shots

  // Play one rendered sound where x is. level 1 is the sound's own loudness.
  _play(key, x, level, rate, send) {
    const ctx = this.ctx;
    if (!ctx || this._muted || this._hidden || !this._fxOn) return;
    const kmax = KMAX[key];
    if (kmax && (this._kc[key] || 0) >= kmax) return;
    const e = this._pick(key);
    if (!e) return;
    this._spatial(x);
    const rj = rate * (0.95 + Math.random() * 0.1);
    const lvl = level * e.gain * this.spG * (0.88 + Math.random() * 0.22);
    if (lvl < 0.004) return;
    const now = ctx.currentTime;
    if (this._voices.length >= MAX_VOICES) {
      const w = this._weakest(now);
      if (!w || lvl <= w.score) return;
      this._kill(w.v, now);
    }
    const g = ctx.createGain();
    g.gain.value = lvl;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.spLP;
    lp.Q.value = 0.5;
    const pan = makePan(ctx);
    pan.pan.value = this.spPan;
    g.connect(lp).connect(pan).connect(this.posBus);
    let sd = null;
    const wet = send * (0.7 + 0.6 * Math.min(this.spOver, 1.5));
    if (wet > 0.01) {
      sd = ctx.createGain();
      sd.gain.value = wet;
      lp.connect(sd).connect(this.posSend);
    }
    const rr = rj * this._tsRate;
    const t = now + 0.003;
    const hi = ctx.createBufferSource();
    hi.buffer = e.hi;
    hi.playbackRate.value = rr;
    hi.connect(g);
    hi.start(t);
    let lo = null;
    if (e.lo) {
      lo = ctx.createBufferSource();
      lo.buffer = e.lo;
      lo.playbackRate.value = rr;
      lo.connect(g);
      lo.start(t + this.spLag);
    }
    const v = { key, g, lp, pan, sd, hi, lo, rate: rj, lvl, t0: now, pending: lo ? 2 : 1, dead: false };
    const end = () => {
      if (--v.pending > 0) return;
      this._release(v);
      g.disconnect();
      lp.disconnect();
      pan.disconnect();
      if (sd) sd.disconnect();
    };
    hi.onended = end;
    if (lo) lo.onended = end;
    this._voices.push(v);
    this._kc[key] = (this._kc[key] || 0) + 1;
  }

  // the oldest, quietest voice: lowest level, discounted by age
  _weakest(now) {
    let best = null;
    let bs = Infinity;
    for (const v of this._voices) {
      const s = v.lvl / (1 + 1.5 * (now - v.t0));
      if (s < bs) {
        bs = s;
        best = v;
      }
    }
    if (!best) return null;
    this._w = this._w || { v: null, score: 0 };
    this._w.v = best;
    this._w.score = bs;
    return this._w;
  }

  // take a voice off the books (once)
  _release(v) {
    if (v.dead) return;
    v.dead = true;
    const i = this._voices.indexOf(v);
    if (i >= 0) this._voices.splice(i, 1);
    this._kc[v.key]--;
  }

  _kill(v, now) {
    this._release(v);
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setTargetAtTime(0, now, 0.008);
    try {
      v.hi.stop(now + 0.05);
      if (v.lo) v.lo.stop(now + 0.05);
    } catch {
      /* already over */
    }
  }

  // kind: 'cannon' | 'heavy' | 'mortar' | 'missile' | 'sabot' | 'flare' | 'mg'
  fire(kind, x = 0) {
    const e = FIRES[kind];
    if (e) this._play(`fire.${kind}`, x, 1, 1, e.send);
  }

  // kind: 'he' | 'heavy' | 'cluster' | 'napalm' | 'buster' | 'nuke' | 'cookoff' | 'air' | 'small' | 'bomb' | 'missile' | 'sabot' | 'roller'
  // size roughly 0..1, 1 a heavy shell, the nuke 3: bigger is louder, deeper and longer
  boom(kind, x = 0, size = 1) {
    const e = BOOMS[kind];
    if (!e) return;
    const z = clamp(Number(size) || 0, 0.05, 3);
    let level;
    let rate;
    if (kind === 'nuke') {
      level = 0.55 + 0.15 * z;
      rate = 1;
    } else {
      level = 0.3 + 0.7 * Math.min(z, 1) + 0.18 * Math.max(0, z - 1);
      rate = clamp(1.28 - 0.3 * Math.min(z, 1) - 0.08 * Math.max(0, z - 1), 0.78, 1.5);
    }
    this._play(`boom.${kind}`, x, level, rate, e.send);
  }

  // kind: 'metal' | 'ricochet' | 'dirt' | 'debris' | 'splat' | 'thud' | 'shield' | 'repair' | 'chute'
  hit(kind, x = 0, size = 0.6) {
    const e = HITS[kind];
    if (!e) return;
    const z = clamp(Number(size) || 0, 0, 1.5);
    this._play(`hit.${kind}`, x, 0.4 + 0.6 * Math.min(z, 1.2), clamp(1.2 - 0.3 * Math.min(z, 1.2), 0.8, 1.3), e.send);
  }

  // kind: 'click' | 'select' | 'buy' | 'deny' | 'turn' | 'alarm' | 'tick' | 'reward'
  ui(kind) {
    const ctx = this.ctx;
    if (!ctx || this._muted || this._hidden || !this._fxOn || !UIS[kind]) return;
    const e = this._pick(`ui.${kind}`);
    if (!e) return;
    const src = ctx.createBufferSource();
    src.buffer = e.hi;
    src.playbackRate.value = 0.985 + Math.random() * 0.03;
    const g = ctx.createGain();
    g.gain.value = e.gain;
    src.connect(g).connect(this.uiBus);
    src.start(ctx.currentTime + 0.002);
    src.onended = () => g.disconnect();
  }

  // ------------------------------------------------------------ continuous voices

  _voice(Cls) {
    if (!this.ctx) return new Deferred(this, Cls);
    if (this._live.size >= MAX_CONT) return NO_VOICE;
    return new Cls(this);
  }

  // An incoming projectile: handle.update(x, heightAboveGround, speed)
  whistle(x = 0) {
    const v = this._voice(Whistle);
    v.update(x, 90, 50);
    return v;
  }

  // A tank's engine: handle.update(x, throttle 0..1)
  engine() {
    return this._voice(Engine);
  }

  // Fire for a burning wreck or napalm: handle.update(x, size)
  burn(x = 0, size = 0.5) {
    const v = this._voice(Burn);
    v.update(x, size);
    return v;
  }

  // A jet's flyby: handle.update(x)
  jet(x = 0) {
    const v = this._voice(Jet);
    v.update(x);
    return v;
  }

  // A missile motor: handle.update(x)
  rocket(x = 0) {
    const v = this._voice(Rocket);
    v.update(x);
    return v;
  }

  // ------------------------------------------------------------ bed and score

  // 'farm' | 'desert' | 'snow' | 'city' | 'night' | null: crossfades
  ambience(kind) {
    this._want.amb = kind ?? null;
    if (!this._amb) return;
    if (KINDS[kind]) this._bump(Ambience.needs(kind));
    this._amb.set(kind ?? null);
  }

  // -1..1, how hard the wind blows
  setWind(strength) {
    this._want.wind = clamp(Number(strength) || 0, -1, 1);
    if (this._amb) this._amb.setWind(this._want.wind);
  }

  // 'menu' | 'battle' | 'victory' | 'defeat' | null: crossfades
  music(track) {
    this._want.music = track ?? null;
    if (this._music) this._music.play(track ?? null);
  }

  // 0..1: how much of the battle score is playing
  setIntensity(v) {
    this._want.intensity = clamp(Number(v) || 0, 0, 1);
    if (this._music) this._music.setIntensity(this._want.intensity);
  }

  // After a huge or very close blast: everything ducks and dulls, recovering over
  // about 1.5 to 3 seconds, with a soft, short, quiet ring.
  shellshock(amount = 1) {
    const ctx = this.ctx;
    if (!ctx || !this._fxOn || !this._audible()) return;
    const a = clamp(Number(amount) || 0, 0, 1);
    if (a < 0.03) return;
    const t = ctx.currentTime;
    const back = t + 0.12 + 0.25 * a;
    const tc = 0.5 + 0.35 * a;
    const g = this.shockGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(1 - 0.7 * a, t, 0.015);
    g.setTargetAtTime(1, back, tc);
    const f = this.shockLP.frequency;
    f.cancelScheduledValues(t);
    f.setTargetAtTime(20000 * Math.pow(0.03, a), t, 0.015);
    f.setTargetAtTime(20000, back, tc);
    const r = this.ringGain.gain;
    r.cancelScheduledValues(t);
    r.setTargetAtTime(0.012 * a, t + 0.05, 0.05);
    r.setTargetAtTime(0, t + 0.4, 0.3);
  }

  // every 250 ms: voices the game stopped updating go quiet, the weather bed does its chores
  _janitor() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const v of this._live) if (!v.idle && now - v.last > 1.2) v.hush();
    if (this._amb) this._amb.tick();
  }
}
