// The sound library: every one-shot and music loop, rendered once into plain
// Float32Arrays and measured. It knows nothing of Web Audio (audio.js wraps the
// arrays in AudioBuffers when it first plays them), so it also runs in Node.
//
// Rendering is a queue of generator jobs that pump() resumes a few milliseconds
// at a time, so nothing stalls a frame; the most needed sounds come first (the
// button click, the common impacts, the menu tune), the rest follow, the run
// tune after them (music() bumps a tune to the front when it is asked for early).
// Each finished sound is measured (loudness(), dsp.js) and scaled in place to
// its target loudness from sfx.js / sfx2.js, whatever its recipe, so the mix is
// balanced by number rather than by ear, and no buffer peaks above 0.98.
import { SFX, TRACKS } from './bank.js';
import { loudness, peakOf, rmsOf, BLOCK } from './dsp.js';

// loudness of a whole music loop at full music volume, in dB (A-weighted, mean)
const MUSIC_TARGET = -26;
// 16-bit music stems span +-NORM
const NORM = 1.25;

const hash = (s) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h & 0xffff;
};

// what plays first: the interface and the sounds every run has, then the rest
const FIRST = /^(click|tick|impact\.(flesh|metal|concrete|dirt)\.|crack|splat)/;
const SECOND = /^(impact|rip|snap|glass|crash|explode|boing|cannon|sling|popup|cash|crowd)/;

export class Library {
  constructor() {
    this.sfx = new Map(); // key -> [entry per variant]
    this.music = new Map(); // name -> entry
    this.jobs = [];
    this.errors = [];
    this._last = {};
    this.stats = { jobs: 0, done: 0, ms: 0, slowest: 0, slowestKey: '', longest: 0 };
    this._queue();
  }

  _queue() {
    const jobs = this.jobs;
    const first = (key) => (FIRST.test(key) ? 0 : SECOND.test(key) ? 1 : 2);
    for (const [key, d] of Object.entries(SFX)) {
      this.sfx.set(key, new Array(d.variants));
      jobs.push({ kind: 'sfx', key, v: 0, prio: first(key), gen: null });
      for (let v = 1; v < d.variants; v++) jobs.push({ kind: 'sfx', key, v, prio: FIRST.test(key) ? 1.5 : 3, gen: null });
    }
    jobs.push({ kind: 'music', key: 'menu', v: 0, prio: 1.2, gen: null });
    jobs.push({ kind: 'music', key: 'run', v: 0, prio: 2.5, gen: null });
    jobs.sort((a, b) => a.prio - b.prio);
    this.stats.jobs = jobs.length;
  }

  // move a music track (or any key) to the front of the queue
  bump(key) {
    let any = false;
    for (const j of this.jobs) {
      if (j.key === key && j.prio > -1) {
        j.prio = -1;
        any = true;
      }
    }
    if (any) this.jobs.sort((a, b) => a.prio - b.prio);
  }

  get pending() {
    return this.jobs.length;
  }

  *_render(job) {
    if (job.kind === 'music') {
      const res = yield* TRACKS[job.key].render();
      yield* this._bakeMusic(job.key, res);
      return res;
    }
    const d = SFX[job.key];
    const data = yield* d.render(d.sr, 1000 + job.v * 7919 + hash(job.key) * 3, job.v);
    yield;
    return this._bake(job.key, data, d);
  }

  // scale a one-shot to its target loudness and describe it
  _bake(key, data, d) {
    const peak0 = peakOf(data);
    const m = loudness(data, d.sr, 'burst');
    let gain = Math.pow(10, (d.tgt - m.a) / 20);
    // a sound that is mostly low rumble reads quiet by ear but loads the master chain: its plain level may not pass target + 9 dB
    gain = Math.min(gain, Math.pow(10, (d.tgt + 9 - m.raw) / 20));
    if (peak0 > 0) gain = Math.min(gain, 0.98 / peak0);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
    return {
      data, sr: d.sr, buf: null, dur: data.length / d.sr, gain,
      peak: peak0 * gain, rms: rmsOf(data), loud: m.a + 20 * Math.log10(gain), limited: gain === 0.98 / peak0,
    };
  }

  // scale a music loop so the sum of its stems at the track's mix sits at MUSIC_TARGET
  *_bakeMusic(name, res) {
    const { stems, sr } = res;
    const T = TRACKS[name];
    const w = T.mix().map((g) => g * T.trim());
    const n = stems[0].L.length;
    const dec = 4;
    const m = new Float32Array(Math.ceil(n / dec));
    for (let b = 0; b < n; b += BLOCK * 8) {
      const e = Math.min(n, b + BLOCK * 8);
      for (let i = b; i < e; i++) {
        let s = 0;
        for (let k = 0; k < stems.length; k++) s += (stems[k].L[i] + stems[k].R[i]) * w[k];
        m[(i / dec) | 0] += s * 0.5 / dec;
      }
      yield;
    }
    const ld = loudness(m, sr / dec, 'mean');
    const peak = peakOf(m);
    let gain = Math.pow(10, (MUSIC_TARGET - ld.a) / 20);
    if (peak > 0) gain = Math.min(gain, 1.15 / peak);
    // scale, then keep each stem as 16-bit (half the memory); audio.js widens it again when the track first plays
    const k16 = (gain * 32767) / NORM;
    const q = (x) => (x > 32767 ? 32767 : x < -32767 ? -32767 : Math.round(x));
    let nan = 0;
    for (let j = 0; j < stems.length; j++) {
      const st = stems[j];
      const L = new Int16Array(n);
      const R = new Int16Array(n);
      for (let b = 0; b < n; b += BLOCK * 8) {
        const e = Math.min(n, b + BLOCK * 8);
        for (let i = b; i < e; i++) {
          const l = st.L[i] * k16;
          const r = st.R[i] * k16;
          if (l !== l || r !== r) nan++; // an Int16Array would turn it into a quiet 0
          L[i] = q(l);
          R[i] = q(r);
        }
        yield;
      }
      stems[j] = { L, R };
    }
    if (nan || !Number.isFinite(gain)) throw new Error(`music ${name}: ${nan} samples are not numbers (gain ${gain})`);
    res.norm = NORM / 32767;
    res.gain = gain;
    res.dur = n / sr;
    res.loud = ld.a + 20 * Math.log10(gain);
    res.peak = peak * gain;
    res.bufs = stems.map(() => null);
  }

  _finish(job, out) {
    if (job.kind === 'music') this.music.set(job.key, out);
    else this.sfx.get(job.key)[job.v] = out;
    this.stats.done++;
  }

  // advance the first job by one slice
  step() {
    const job = this.jobs[0];
    if (!job) return false;
    try {
      if (!job.gen) job.gen = this._render(job);
      const s = job.gen.next();
      if (s.done) {
        this.jobs.shift();
        this._finish(job, s.value);
      }
    } catch (err) {
      this.jobs.shift();
      this.errors.push(`${job.kind}:${job.key}#${job.v}: ${err && err.message ? err.message : err}`);
      if (typeof console !== 'undefined') console.warn(`ragdoll-stunt-crash sound: ${job.key} failed`, err);
    }
    return this.jobs.length > 0;
  }

  // run queued renders for about `budget` ms; true if work remains
  pump(budget = 3) {
    const t0 = performance.now();
    while (this.jobs.length) {
      const key = `${this.jobs[0].key}#${this.jobs[0].v}`;
      const s0 = performance.now();
      this.step();
      const now = performance.now();
      if (now - s0 > this.stats.slowest) {
        this.stats.slowest = now - s0;
        this.stats.slowestKey = key;
      }
      if (now - t0 >= budget) break;
    }
    const dt = performance.now() - t0;
    this.stats.ms += dt;
    if (dt > this.stats.longest) this.stats.longest = dt;
    return this.jobs.length > 0;
  }

  // a built variant at random, never the one that just played
  pick(key) {
    const arr = this.sfx.get(key);
    if (!arr) return null;
    let n = 0;
    for (const e of arr) if (e) n++;
    if (!n) return null;
    let i = Math.floor(Math.random() * arr.length);
    for (let tries = 0; tries <= arr.length; tries++) {
      if (arr[i] && (n === 1 || i !== this._last[key])) break;
      i = (i + 1) % arr.length;
    }
    if (!arr[i]) {
      for (const e of arr) if (e) return e;
      return null;
    }
    this._last[key] = i;
    return arr[i];
  }
}
