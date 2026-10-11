// The score of Ragdoll Stunt Crash: original, procedural, rendered once into stereo
// loops (no samples, no files). Two tracks, each a single stereo stem:
//   menu  E minor, 116 bpm, 8 bars: a surf-rock tune. Dry drums and bass under chugging guitars, a pad, and a
//         tremolo-picked lead in a spring-reverb echo.
//   run   A minor, 150 bpm, 8 bars: driving. Four on the floor, a galloping bass, a chugging guitar riff; the
//         second half adds a high lead line over it. It starts at full tilt (the riff is in bar 1) because a run
//         only lasts a few seconds.
// Notes are small synths (saws through filters, a tanh drive for the guitars), drums are a falling sine and
// filtered noise (adapted from Horde Buster's). Loops are made seamless by folding the tails that run past the
// end back onto the start. Both sit well under the effects: lib.js scales them to a quiet loudness.
import { TAU, BLOCK, mtof, seeded, noise, Biquad, filter, normalise, wave, WAVES } from './dsp.js';

export const SR = 32000;
export const MASK = 65535;

// ---------------------------------------------------------------- the mix

export class Mix {
  constructor(n, big) {
    this.n = n;
    this.big = big;
    this.L = new Float32Array(big);
    this.R = new Float32Array(big);
  }
}

// m.tmp[0..len) into the mix at sample `at`, equal-power panned (pan -1..1, unity at the centre)
export function put(m, mix, at, len, g, pan) {
  const th = (pan + 1) * Math.PI * 0.25;
  const gl = g * Math.cos(th) * 1.4142;
  const gr = g * Math.sin(th) * 1.4142;
  const end = Math.min(len, mix.big - at);
  const { L, R } = mix;
  const tmp = m.tmp;
  for (let i = 0; i < end; i++) {
    const x = tmp[i];
    L[at + i] += x * gl;
    R[at + i] += x * gr;
  }
}

export function* addMix(dst, src, g = 1) {
  for (let b = 0; b < dst.big; b += 16384) {
    const e = Math.min(dst.big, b + 16384);
    for (let i = b; i < e; i++) {
      dst.L[i] += src.L[i] * g;
      dst.R[i] += src.R[i] * g;
    }
    yield;
  }
}

// the tail past the loop end laid back over the start
export function* fold(mix) {
  const { n, big } = mix;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let b = 0; b < n; b += 16384) {
    const e = Math.min(n, b + 16384);
    for (let i = b; i < e; i++) {
      L[i] = mix.L[i] + (i + n < big ? mix.L[i + n] : 0);
      R[i] = mix.R[i] + (i + n < big ? mix.R[i + n] : 0);
    }
    yield;
  }
  return { L, R };
}

// noise tables the drums read from
export function* makeTables(r) {
  const n = MASK + 1;
  const t = {};
  for (const [name, chain] of [
    ['hat', [['highpass', 7000, 0.8], ['highpass', 5500, 0.7]]],
    ['snap', [['bandpass', 2400, 0.6], ['highpass', 900, 0.7]]],
    ['crash', [['highpass', 4200, 0.7]]],
    ['body', [['lowpass', 500, 0.7]]],
  ]) {
    const a = yield* noise(n, r);
    for (const [ty, f, q] of chain) yield* filter(a, SR, ty, f, q);
    yield* normalise(a, 1);
    t[name] = a;
  }
  return t;
}

export function newCtx(r, tables) {
  return { sr: SR, r, nz: tables, tmp: new Float32Array(SR * 8), ph: new Float64Array(64), dp: new Float64Array(64) };
}

// ---------------------------------------------------------------- drums

export function* kick(m, mix, t, vel = 1, o = {}) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const len = Math.round((o.len ?? 0.3) * sr);
  const f0 = o.f0 ?? 170;
  const f1 = o.f1 ?? 46;
  const kf = Math.exp(-1 / (0.02 * sr));
  const ka = Math.exp(-1 / ((o.tau ?? 0.085) * sr));
  const tmp = m.tmp;
  const hat = m.nz.hat;
  let ph = 0;
  let fe = 1;
  let ae = 1;
  for (let i = 0; i < len; i++) {
    ph += (TAU * (f1 + (f0 - f1) * fe)) / sr;
    const s = Math.tanh(2.2 * Math.sin(ph)) * 0.72;
    const click = i < 160 ? hat[i] * Math.exp(-i / 40) * 0.5 : 0;
    tmp[i] = (s * ae + click) * (i < 20 ? i / 20 : 1) * (i > len - 300 ? (len - i) / 300 : 1);
    fe *= kf;
    ae *= ka;
  }
  put(m, mix, at, len, vel * 0.95, o.pan ?? 0);
  yield;
}

export function* snare(m, mix, t, vel = 1, pan = 0) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const len = Math.round(0.3 * sr);
  const tmp = m.tmp;
  const nz = m.nz.snap;
  const off = (m.r() * MASK) | 0;
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / sr;
    ph += (TAU * (165 + 95 * Math.exp(-tt / 0.015))) / sr;
    const body = Math.sin(ph) * Math.exp(-tt / 0.05) * 0.55;
    const hiss = nz[(off + i) & MASK] * 0.95 * Math.exp(-tt / 0.07);
    const clap = tt < 0.034 ? nz[(off + 9000 + i) & MASK] * Math.exp(-(tt % 0.011) / 0.004) * 0.35 : 0;
    tmp[i] = (body + hiss + clap) * (i < 12 ? i / 12 : 1) * (i > len - 200 ? (len - i) / 200 : 1);
  }
  put(m, mix, at, len, vel * 0.75, pan);
  yield;
}

export function* hat(m, mix, t, vel = 1, open = false, pan = 0) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const len = Math.round((open ? 0.4 : 0.09) * sr);
  const k = 1 / ((open ? 0.1 : 0.014) * sr);
  const tmp = m.tmp;
  const nz = m.nz.hat;
  const off = (m.r() * MASK) | 0;
  for (let i = 0; i < len; i++) tmp[i] = nz[(off + i) & MASK] * Math.exp(-i * k) * (i < 6 ? i / 6 : 1) * (i > len - 150 ? (len - i) / 150 : 1);
  put(m, mix, at, len, vel * (open ? 0.5 : 0.6), pan);
  yield;
}

export function* tom(m, mix, t, f, vel = 1, pan = 0, tau = 0.16) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const len = Math.round(Math.min(0.7, tau * 5) * sr);
  const tmp = m.tmp;
  const kf = Math.exp(-1 / (0.035 * sr));
  const ka = Math.exp(-1 / (tau * sr));
  let ph = 0;
  let fe = 1;
  let ae = 1;
  for (let i = 0; i < len; i++) {
    ph += (TAU * f * (1 + 0.6 * fe)) / sr;
    const click = i < 200 ? m.nz.body[i] * Math.exp(-i / 60) * 0.5 : 0;
    tmp[i] = (Math.tanh(1.6 * Math.sin(ph)) * 0.8 * ae + click) * (i < 16 ? i / 16 : 1) * (i > len - 300 ? (len - i) / 300 : 1);
    fe *= kf;
    ae *= ka;
  }
  put(m, mix, at, len, vel * 0.9, pan);
  yield;
}

export function* crash(m, mix, t, vel = 1, len = 2.4) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const n = Math.round(len * sr);
  const tmp = m.tmp;
  const nz = m.nz.crash;
  const off = (m.r() * MASK) | 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const env = 0.65 * Math.exp(-tt / 0.45) + 0.35 * Math.exp(-tt / 1.3);
    tmp[i] = nz[(off + i) & MASK] * env * (i < 40 ? i / 40 : 1) * (i > n - 600 ? (n - i) / 600 : 1);
  }
  put(m, mix, at, n, vel * 0.55, 0);
  yield;
}

// a noise riser that swells to its end (the bar before a crash)
export function* riser(m, mix, t, dur, vel = 1) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const n = Math.round(dur * sr);
  const tmp = m.tmp;
  const nz = m.nz.crash;
  const off = (m.r() * MASK) | 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    tmp[i] = nz[(off + i) & MASK] * u * u * (i > n - 80 ? (n - i) / 80 : 1);
  }
  put(m, mix, at, n, vel * 0.5, 0);
  yield;
}

// ---------------------------------------------------------------- the synth voice

// A note of the synth: a stack of detuned oscillators through a moving low-pass.
//   midis [..] notes sounding together (a chord), det [cents..] detunes of each, wave saw|square|tri|sine
//   dur seconds held, rel seconds of release after it, att attack, tau decay (Infinity: sustain)
//   lp [fc0, fc1, tc] low-pass moving from fc0 towards fc1, hp high-pass Hz, drive tanh drive
//   vib [Hz, depth, delay], sub level of a sine an octave under the lowest note
//   pump [beat s, depth, tc]: ducks after every beat, as if sidechained to the kick
//   pick [Hz, depth]: tremolo picking, the level jumping up at each pick and dying away before the next
//   vel gain, pan -1..1
export function* note(m, mix, t, o) {
  const sr = m.sr;
  const at = Math.round(t * sr);
  const rel = o.rel ?? 0.05;
  const body = Math.round(o.dur * sr);
  const len = Math.min(body + Math.round(rel * sr), m.tmp.length, mix.big - at);
  if (len <= 0) return;
  const w = WAVES[o.wave ?? 'saw'];
  const dets = o.det ?? [-6, 6];
  const { ph, dp, tmp } = m;
  let no = 0;
  let low = 127;
  for (const midi of o.midis) {
    if (midi < low) low = midi;
    for (const d of dets) {
      ph[no] = m.r();
      dp[no] = mtof(midi + d / 100) / sr;
      no++;
    }
  }
  const g0 = 1 / Math.sqrt(no);
  const att = Math.max(2, Math.round((o.att ?? 0.005) * sr));
  const tau = o.tau ?? Infinity;
  const ka = Number.isFinite(tau) ? Math.exp(-1 / (tau * sr)) : 1;
  const { lp, vib, pump, pick } = o;
  const q = o.q ?? 0.8;
  const bq = lp ? new Biquad('lowpass', lp[0], q, sr) : null;
  const bh = o.hp ? new Biquad('highpass', o.hp, 0.7, sr) : null;
  const drive = o.drive || 0;
  const norm = drive ? 1 / Math.tanh(drive) : 1;
  const sub = o.sub ?? 0;
  const subDp = mtof(low - 12) / sr;
  const relLen = Math.max(1, len - body);
  let phs = 0;
  let ae = 1;
  let pg = 1;
  for (let b = 0; b < len; b += 1024) {
    const e = Math.min(len, b + 1024);
    for (let i = b; i < e; i++) {
      const tt = i / sr;
      const vm = vib ? 1 + vib[1] * Math.sin(TAU * vib[0] * tt) * Math.min(1, tt / vib[2]) : 1;
      let s = 0;
      for (let k = 0; k < no; k++) {
        const d = dp[k] * vm;
        let p = ph[k] + d;
        if (p >= 1) p -= 1;
        ph[k] = p;
        s += wave(w, p, d);
      }
      s *= g0;
      if (sub) {
        phs += subDp * vm;
        if (phs >= 1) phs -= 1;
        s += sub * Math.sin(TAU * phs);
      }
      let g = ae;
      ae *= ka;
      if (i < att) g *= i / att;
      if (i >= body) g *= Math.max(0, 1 - (i - body) / relLen);
      if (pump) {
        if ((i & 7) === 0) pg = 1 - pump[1] * Math.exp(-(((at + i) / sr) % pump[0]) / pump[2]);
        g *= pg;
      }
      if (pick) g *= 1 - pick[1] + pick[1] * Math.exp(-4 * ((tt * pick[0]) % 1));
      if (drive) s = Math.tanh(drive * s) * norm;
      if (bq) {
        if ((i & 31) === 0) bq.set('lowpass', lp[1] + (lp[0] - lp[1]) * Math.exp(-tt / lp[2]), q, sr);
        s = bq.run(s);
      }
      if (bh) s = bh.run(s);
      tmp[i] = s * g;
    }
    yield;
  }
  put(m, mix, at, len, o.vel ?? 1, o.pan ?? 0);
}

// ---------------------------------------------------------------- effects

// A stereo ping-pong echo over a whole mix: time in seconds, feedback fb, level wet.
export function* pingpong(mix, sr, time, fb, wet) {
  const d = Math.round(time * sr);
  const n = mix.big;
  const { L, R } = mix;
  const x = new Float32Array(n);
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) x[i] = 0.5 * (L[i] + R[i]);
    yield;
  }
  const eL = new Float32Array(n);
  const eR = new Float32Array(n);
  for (let b = d; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      eL[i] = x[i - d] + fb * eR[i - d];
      eR[i] = fb * eL[i - d];
      L[i] += wet * eL[i];
      R[i] += wet * eR[i];
    }
    yield;
  }
}

// A small Schroeder reverb (4 damped combs, 2 all-passes a side) laid over a whole mix.
export function* reverb(mix, sr, wet, size = 1, fbk = 0.82, damp = 0.35) {
  const n = mix.big;
  const scale = (sr / 44100) * size;
  const mk = (list) => list.map((d) => ({ buf: new Float32Array(Math.round(d * scale)), i: 0, lp: 0 }));
  const sides = [
    { ch: mix.L, combs: mk([1557, 1617, 1491, 1422]), aps: mk([556, 441]) },
    { ch: mix.R, combs: mk([1580, 1640, 1514, 1445]), aps: mk([579, 464]) },
  ];
  const g = 0.5;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      const x = 0.5 * (mix.L[i] + mix.R[i]) * 0.2;
      for (const s of sides) {
        let y = 0;
        for (const c of s.combs) {
          const o = c.buf[c.i];
          c.lp = o * (1 - damp) + c.lp * damp;
          c.buf[c.i] = x + c.lp * fbk;
          if (++c.i >= c.buf.length) c.i = 0;
          y += o;
        }
        for (const a of s.aps) {
          const d = a.buf[a.i];
          const v = y + g * d;
          a.buf[a.i] = v;
          y = d - g * v;
          if (++a.i >= a.buf.length) a.i = 0;
        }
        s.ch[i] += wet * y;
      }
    }
    yield;
  }
}

// ---------------------------------------------------------------- chords and riffs

export const on = (pat, s) => pat[s] !== '.';

// guitar root g, bass root b, pad chord, and the lead line as [step, length in steps, midi]
const EM = { g: 52, b: 40, pad: [52, 55, 59, 64] };
const CM = { g: 48, b: 36, pad: [48, 52, 55, 60] };
const DM = { g: 50, b: 38, pad: [50, 54, 57, 62] };
const BM = { g: 47, b: 35, pad: [47, 51, 54, 59] };
const MENU = [
  { ...EM, lead: [[0, 6, 76], [6, 2, 79], [8, 4, 83], [12, 4, 81]] },
  { ...EM, lead: [[0, 4, 79], [4, 4, 76], [8, 6, 74], [14, 2, 76]] },
  { ...CM, lead: [[0, 4, 79], [4, 2, 76], [6, 2, 72], [8, 8, 79]] },
  { ...DM, lead: [[0, 4, 78], [4, 2, 74], [6, 2, 78], [8, 4, 81], [12, 4, 78]] },
  { ...EM, lead: [[0, 6, 83], [6, 2, 86], [8, 4, 88], [12, 4, 86]] },
  { ...EM, lead: [[0, 4, 83], [4, 4, 79], [8, 4, 81], [12, 4, 83]] },
  { ...CM, lead: [[0, 6, 84], [6, 2, 83], [8, 4, 79], [12, 4, 76]] },
  { ...BM, lead: [[0, 2, 83], [2, 2, 87], [4, 2, 83], [6, 2, 80], [8, 8, 83]] },
];

const AM = { g: 45, b: 45, pad: [57, 60, 64, 69] };
const FM = { g: 41, b: 41, pad: [53, 57, 60, 65] };
const GM = { g: 43, b: 43, pad: [55, 59, 62, 67] };
const EE = { g: 40, b: 40, pad: [52, 56, 59, 64] };
// riff: the guitar line of bars 1-4 (and under the lead after); lead: bars 5-8 only
const RUN = [
  { ...AM, riff: [[0, 1, 69], [1, 1, 69], [2, 1, 72], [3, 1, 69], [4, 2, 74], [6, 1, 72], [7, 1, 69], [8, 1, 67], [9, 1, 69], [10, 2, 64], [12, 4, 69]] },
  { ...AM, riff: [[0, 1, 69], [1, 1, 69], [2, 1, 72], [3, 1, 69], [4, 2, 76], [6, 1, 74], [7, 1, 72], [8, 2, 69], [10, 2, 67], [12, 2, 64], [14, 2, 67]] },
  { ...FM, riff: [[0, 1, 65], [1, 1, 65], [2, 1, 69], [3, 1, 65], [4, 2, 72], [6, 1, 69], [7, 1, 65], [8, 1, 64], [9, 1, 65], [10, 2, 60], [12, 4, 65]] },
  { ...GM, riff: [[0, 1, 67], [1, 1, 67], [2, 1, 71], [3, 1, 67], [4, 2, 74], [6, 1, 71], [7, 1, 67], [8, 2, 62], [10, 2, 67], [12, 2, 71], [14, 2, 74]] },
  { ...AM, riff: [[0, 1, 69], [1, 1, 69], [2, 1, 72], [3, 1, 69], [4, 2, 74], [6, 1, 72], [7, 1, 69], [8, 1, 67], [9, 1, 69], [10, 2, 64], [12, 4, 69]], lead: [[0, 2, 81], [2, 2, 76], [4, 2, 84], [6, 2, 81], [8, 4, 76], [12, 2, 72], [14, 2, 76]] },
  { ...AM, riff: [[0, 1, 69], [1, 1, 69], [2, 1, 72], [3, 1, 69], [4, 2, 76], [6, 1, 74], [7, 1, 72], [8, 2, 69], [10, 2, 67], [12, 2, 64], [14, 2, 67]], lead: [[0, 2, 81], [2, 2, 79], [4, 2, 76], [6, 2, 72], [8, 4, 69], [12, 4, 72]] },
  { ...FM, riff: [[0, 1, 65], [1, 1, 65], [2, 1, 69], [3, 1, 65], [4, 2, 72], [6, 1, 69], [7, 1, 65], [8, 1, 64], [9, 1, 65], [10, 2, 60], [12, 4, 65]], lead: [[0, 2, 77], [2, 2, 72], [4, 2, 81], [6, 2, 77], [8, 4, 72], [12, 2, 69], [14, 2, 72]] },
  { ...EE, riff: [[0, 1, 64], [1, 1, 64], [2, 1, 68], [3, 1, 64], [4, 2, 71], [6, 1, 68], [7, 1, 64], [8, 4, 59], [12, 4, 56]], lead: [[0, 2, 76], [2, 2, 80], [4, 2, 83], [6, 2, 80], [8, 4, 76], [12, 1, 76], [13, 1, 74], [14, 1, 71], [15, 1, 68]] },
];

// ---------------------------------------------------------------- menu

const MP = {
  kick: 'X.....x.X.......',
  snare: '....X.......X...',
  hats: 'x.x.x.x.x.x.x.x.',
  bass: 'x.x.x.x.x.x.x.x.',
  chug: 'x.x.x.x.x.x.x.x.',
};

function* renderMenu() {
  const sr = SR;
  const r = seeded(3301);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 116 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(MENU.length * bar * sr);
  const big = n + Math.round(3.2 * sr);
  const X = new Mix(n, big);
  const Wet = new Mix(n, big);
  const pump = [beat, 0.3, 0.1];
  for (let b = 0; b < MENU.length; b++) {
    const ch = MENU[b];
    const t0 = b * bar;
    const hum = () => 0.85 + r() * 0.3;
    // the pad, a pair of takes for width, and a fat bass
    yield* note(m, Wet, t0, { midis: ch.pad, det: [-10, 4], wave: 'saw', att: 0.3, rel: 0.5, dur: bar * 0.98, lp: [900, 900, 1], q: 0.7, pump, vel: 0.2, pan: -0.6 });
    yield* note(m, Wet, t0, { midis: ch.pad, det: [-4, 10], wave: 'saw', att: 0.3, rel: 0.5, dur: bar * 0.98, lp: [900, 900, 1], q: 0.7, pump, vel: 0.2, pan: 0.6 });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      if (on(MP.kick, s)) yield* kick(m, X, t, (MP.kick[s] === 'X' ? 1 : 0.8) * hum());
      if (on(MP.snare, s)) yield* snare(m, X, t, 1);
      if (on(MP.hats, s)) yield* hat(m, X, t, 0.4 * hum(), false, s % 4 === 2 ? 0.25 : -0.25);
      if (s === 14 && (b === 3 || b === 7)) yield* hat(m, X, t, 0.7, true, 0.3);
      if (on(MP.bass, s)) {
        const up = s === 6 || s === 14 ? 12 : 0;
        yield* note(m, X, t, {
          midis: [ch.b + up], det: [-4, 4], wave: 'saw', att: 0.003, tau: 0.17, rel: 0.02, dur: step * 1.8, lp: [1300, 300, 0.06], q: 1.2, drive: 1.6, sub: 0.5, pump, vel: 0.8 * (up ? 0.7 : 1),
        });
      }
      if (on(MP.chug, s)) {
        const open = s === 0 || s === 8;
        const o = { midis: [ch.g, ch.g + 7, ch.g + 12], wave: 'saw', att: 0.002, tau: open ? 0.45 : 0.05, rel: 0.025, dur: open ? step * 3.5 : step * 0.9, lp: [3000, 3000, 1], q: 0.8, hp: 90, drive: 6, vel: open ? 0.4 : 0.34 };
        yield* note(m, X, t, { ...o, det: [-5, 5], pan: -0.7 });
        yield* note(m, X, t, { ...o, det: [-8, 8], pan: 0.7 });
      }
      if ((b === 3 || b === 7) && s >= 12) yield* tom(m, X, t, [210, 170, 140, 105][s - 12], 0.6, [-0.4, -0.1, 0.2, 0.5][s - 12]);
      if (s === 0 && b === 0) yield* crash(m, X, t, 0.6);
      for (const [st, len, midi] of ch.lead) {
        if (st === s) {
          // tremolo-picked and twangy: a thin saw through a resonant low-pass
          yield* note(m, Wet, t, { midis: [midi], det: [-9, 9], wave: 'saw', att: 0.01, rel: 0.12, dur: len * step * 0.95, lp: [4200, 2600, 0.3], q: 2.4, hp: 300, pick: [15, 0.8], vib: [5.4, 0.006, 0.3], drive: 1.5, vel: 0.5, pan: 0.05 });
        }
      }
      yield;
    }
  }
  // the lead and pad get a dotted echo and a springy room; the drums, bass and guitars stay dry
  yield* pingpong(Wet, sr, step * 3, 0.4, 0.3);
  yield* reverb(Wet, sr, 0.3, 1.0, 0.8);
  yield* addMix(X, Wet, 1);
  return { stems: [yield* fold(X)], sr, loop: true };
}

// ---------------------------------------------------------------- run

const RP = {
  kick: 'X...x...X...x.x.',
  snare: '....X.......X...',
  openHat: '..x...x...x...x.',
  hat16: 'xxxxxxxxxxxxxxxx',
  bassA: 'x.x.x.x.x.x.x.x.',
  bassB: 'x.xxx.xxx.xxx.xx',
};

function* renderRun() {
  const sr = SR;
  const r = seeded(9113);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 150 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(RUN.length * bar * sr);
  const big = n + Math.round(2.8 * sr);
  const X = new Mix(n, big);
  const Wet = new Mix(n, big);
  const pump = [beat, 0.45, 0.1];
  for (let b = 0; b < RUN.length; b++) {
    const ch = RUN[b];
    const t0 = b * bar;
    const second = b >= 4;
    yield* note(m, Wet, t0, { midis: ch.pad, det: [-10, 4], wave: 'saw', att: 0.2, rel: 0.4, dur: bar * 0.98, lp: [800, 800, 1], q: 0.7, pump, vel: second ? 0.2 : 0.13, pan: -0.6 });
    yield* note(m, Wet, t0, { midis: ch.pad, det: [-4, 10], wave: 'saw', att: 0.2, rel: 0.4, dur: bar * 0.98, lp: [800, 800, 1], q: 0.7, pump, vel: second ? 0.2 : 0.13, pan: 0.6 });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      const hum = 0.85 + r() * 0.3;
      // drums: four on the floor, a backbeat, open hats off the beat and 16ths in the second half
      if (on(RP.kick, s)) yield* kick(m, X, t, (RP.kick[s] === 'X' ? 1 : 0.85) * hum, { f0: 160, f1: 44, tau: 0.075, len: 0.24 });
      if (on(RP.snare, s)) yield* snare(m, X, t, 1.05);
      if (on(RP.openHat, s)) yield* hat(m, X, t, 0.45 * hum, true, s % 4 === 2 ? 0.3 : -0.3);
      if (second && on(RP.hat16, s) && s % 2) yield* hat(m, X, t, 0.22 * hum, false, s % 4 === 1 ? -0.35 : 0.35);
      if (s === 0 && (b === 0 || b === 4)) yield* crash(m, X, t, b === 0 ? 0.7 : 0.55);
      if ((b === 3 || b === 7) && s >= 12) yield* tom(m, X, t, [200, 165, 135, 100][s - 12], 0.7, [-0.4, -0.1, 0.2, 0.5][s - 12], 0.2);
      // bass: eighths in the first half, a gallop in the second
      const bp = second ? RP.bassB : RP.bassA;
      if (on(bp, s)) {
        const up = !second && (s === 6 || s === 14) ? 12 : 0;
        yield* note(m, X, t, { midis: [ch.b + up], det: [-4, 4], wave: 'saw', att: 0.003, tau: 0.15, rel: 0.02, dur: step * 1.6, lp: [1300, 300, 0.06], q: 1.2, drive: 1.8, sub: 0.5, pump, vel: 0.8 * (up ? 0.7 : 1) });
      }
      // the riff, two takes panned apart; palm-muted in the first half, ringing a little more in the second
      for (const [st, len, midi] of ch.riff) {
        if (st === s) {
          const o = { midis: [midi, midi - 12], wave: 'saw', att: 0.002, tau: len > 1 ? 0.2 : 0.07, rel: 0.02, dur: len * step * 0.9, lp: [3200, 2400, 0.2], q: 1.0, hp: 120, drive: 5, vel: 0.36 };
          yield* note(m, X, t, { ...o, det: [-5, 5], pan: -0.65 });
          yield* note(m, X, t, { ...o, det: [-9, 9], pan: 0.65 });
        }
      }
      // second half: chugging power chords under it, and the high lead over the top
      if (second && s % 2 === 0) {
        const o = { midis: [ch.g, ch.g + 7, ch.g + 12], wave: 'saw', att: 0.002, tau: 0.045, rel: 0.02, dur: step * 1.1, lp: [2800, 2800, 1], q: 0.8, hp: 90, drive: 7, vel: 0.26 };
        yield* note(m, X, t, { ...o, det: [-6, 6], pan: -0.8 });
        yield* note(m, X, t, { ...o, det: [-9, 9], pan: 0.8 });
      }
      for (const [st, len, midi] of ch.lead || []) {
        if (st === s) {
          yield* note(m, Wet, t, { midis: [midi], det: [-8, 8], wave: 'saw', att: 0.01, rel: 0.1, dur: len * step * 0.95, lp: [5200, 3200, 0.2], q: 1.6, hp: 300, pick: [12.5, 0.55], vib: [5.8, 0.01, 0.15], drive: 1.8, vel: 0.46, pan: 0.05 });
        }
      }
      if (b === 3 && s === 8) yield* riser(m, X, t, step * 8, 0.7);
      if (b === 7 && s === 8) yield* riser(m, X, t, step * 8, 0.8);
      yield;
    }
  }
  yield* pingpong(Wet, sr, step * 3, 0.35, 0.22);
  yield* reverb(Wet, sr, 0.18, 0.9, 0.78);
  yield* addMix(X, Wet, 1);
  return { stems: [yield* fold(X)], sr, loop: true };
}

// ---------------------------------------------------------------- the table

// mix(): the gain of each stem; trim(): the track's overall gain. Both tracks are one stem.
export const TRACKS = {
  menu: { render: renderMenu, loop: true, mix: () => [1], trim: () => 1 },
  run: { render: renderRun, loop: true, mix: () => [1], trim: () => 1 },
};
