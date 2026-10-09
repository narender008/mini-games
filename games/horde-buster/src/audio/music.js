// The score of Horde Buster: original, procedural, rendered once into stereo
// loops (no samples, no files). Each track is a few "stems" (layers) that play
// in sync, so the intensity layer is just a gain on a stem:
//   battle  E minor, 150 bpm, 8 bars. A: kick, hats, driving bass, pad.
//           B: snare, double-tracked palm-muted guitars, fills. C: lead riff, arpeggio, 16th hats, riser.
//   boss    D minor, 166 bpm, 8 bars, heavier: gallop kick, taiko, sub bass, heavy guitars, brass stabs.
//   menu    G major / E minor, 100 bpm, 8 bars, one stem: pad, arpeggio, soft kick, a slow lead.
//   victory a brass fanfare and a timpani roll resolving to G major (one shot, with reverb).
//   defeat  a low minor chord sinking away (one shot, with reverb).
// Notes are small synths (saws through filters, a tanh drive for the guitars),
// drums are a falling sine and filtered noise. Loops are made seamless by
// folding the tails that run past the end back onto the start.
import { TAU, BLOCK, mtof, seeded, noise, Biquad, filter, normalise, wave, WAVES } from './dsp.js';

const SR = 32000;
const MASK = 65535;

// ---------------------------------------------------------------- the mix

class Mix {
  constructor(n, big) {
    this.n = n;
    this.big = big;
    this.L = new Float32Array(big);
    this.R = new Float32Array(big);
  }
}

// m.tmp[0..len) into the mix at sample `at`, equal-power panned (pan -1..1, unity at the centre)
function put(m, mix, at, len, g, pan) {
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

function* addMix(dst, src, g = 1) {
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
function* fold(mix) {
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
function* makeTables(r) {
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

function newCtx(r, tables) {
  return { sr: SR, r, nz: tables, tmp: new Float32Array(SR * 8), ph: new Float64Array(64), dp: new Float64Array(64) };
}

// ---------------------------------------------------------------- drums

function* kick(m, mix, t, vel = 1, o = {}) {
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

function* snare(m, mix, t, vel = 1, pan = 0) {
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

function* hat(m, mix, t, vel = 1, open = false, pan = 0) {
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

function* tom(m, mix, t, f, vel = 1, pan = 0, tau = 0.16) {
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

function* crash(m, mix, t, vel = 1, len = 2.4) {
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
function* riser(m, mix, t, dur, vel = 1) {
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
//   vel gain, pan -1..1
function* note(m, mix, t, o) {
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
  const { lp, vib, pump } = o;
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
function* pingpong(mix, sr, time, fb, wet) {
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
function* reverb(mix, sr, wet, size = 1, fbk = 0.82, damp = 0.35) {
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

const ARPS = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];
const on = (pat, s) => pat[s] !== '.';

const EM = { g: 40, b: 28, pad: [52, 55, 59, 64], arp: [64, 67, 71, 76] };
const CM = { g: 48, b: 36, pad: [48, 52, 55, 60], arp: [60, 64, 67, 72] };
const DD = { g: 50, b: 38, pad: [50, 54, 57, 62], arp: [62, 66, 69, 74] };
const BM = { g: 47, b: 35, pad: [47, 50, 54, 59], arp: [59, 62, 66, 71] };

// lead lines: [step, length in steps, midi]
const BATTLE = [
  { ...EM, lead: [[0, 3, 76], [3, 1, 74], [4, 4, 71], [8, 3, 76], [11, 1, 79], [12, 4, 83]] },
  { ...EM, lead: [[0, 4, 79], [4, 2, 78], [6, 2, 76], [8, 4, 71], [12, 2, 74], [14, 2, 76]] },
  { ...CM, lead: [[0, 3, 84], [3, 1, 83], [4, 4, 79], [8, 4, 76], [12, 4, 79]] },
  { ...DD, lead: [[0, 3, 81], [3, 1, 78], [4, 4, 74], [8, 4, 78], [12, 2, 81], [14, 2, 78]] },
  { ...EM, lead: [[0, 3, 83], [3, 1, 81], [4, 4, 79], [8, 4, 76], [12, 2, 79], [14, 2, 83]] },
  { ...EM, lead: [[0, 4, 88], [4, 2, 86], [6, 2, 83], [8, 4, 79], [12, 2, 83], [14, 2, 81]] },
  { ...CM, lead: [[0, 3, 88], [3, 1, 86], [4, 4, 84], [8, 4, 79], [12, 4, 84]] },
  { ...BM, lead: [[0, 4, 83], [4, 2, 78], [6, 2, 81], [8, 4, 83], [12, 4, 86]] },
];

const DM = { g: 50, b: 38, pad: [50, 53, 57, 62], stab: [50, 57, 62] };
const BB = { g: 46, b: 34, pad: [46, 50, 53, 58], stab: [46, 53, 58] };
const AA = { g: 45, b: 33, pad: [45, 49, 52, 57], stab: [45, 52, 57] };
const BOSS = [
  { ...DM, lead: [[0, 2, 74], [2, 2, 77], [4, 4, 81], [8, 2, 79], [10, 2, 77], [12, 4, 74]] },
  { ...DM, lead: [[0, 3, 81], [3, 1, 84], [4, 4, 86], [8, 2, 84], [10, 2, 81], [12, 4, 77]] },
  { ...BB, lead: [[0, 4, 82], [4, 2, 81], [6, 2, 79], [8, 4, 77], [12, 4, 74]] },
  { ...AA, lead: [[0, 4, 85], [4, 4, 88], [8, 4, 81], [12, 4, 85]] },
  { ...DM, lead: [[0, 2, 81], [2, 2, 86], [4, 4, 89], [8, 2, 88], [10, 2, 86], [12, 4, 81]] },
  { ...DM, lead: [[0, 4, 86], [4, 2, 84], [6, 2, 81], [8, 2, 77], [10, 2, 79], [12, 4, 81]] },
  { ...BB, lead: [[0, 4, 89], [4, 4, 86], [8, 4, 82], [12, 4, 86]] },
  { ...AA, lead: [[0, 4, 88], [4, 4, 85], [8, 2, 81], [10, 2, 83], [12, 4, 85]] },
];

const MENU_BARS = [
  { g: 40, pad: [52, 55, 59, 64], arp: [64, 67, 71, 76], lead: [[0, 6, 71], [6, 2, 74], [8, 8, 76]] },
  { g: 36, pad: [48, 52, 55, 60], arp: [60, 64, 67, 72], lead: [[0, 6, 72], [6, 2, 76], [8, 8, 79]] },
  { g: 43, pad: [47, 50, 55, 59], arp: [62, 67, 71, 74], lead: [[0, 6, 74], [6, 2, 71], [8, 8, 74]] },
  { g: 38, pad: [50, 54, 57, 62], arp: [62, 66, 69, 74], lead: [[0, 6, 69], [6, 2, 74], [8, 8, 78]] },
  { g: 40, pad: [52, 55, 59, 64], arp: [64, 67, 71, 76], lead: [[0, 4, 76], [4, 4, 79], [8, 8, 83]] },
  { g: 36, pad: [48, 52, 55, 60], arp: [60, 64, 67, 72], lead: [[0, 4, 84], [4, 4, 83], [8, 8, 79]] },
  { g: 43, pad: [47, 50, 55, 59], arp: [62, 67, 71, 74], lead: [[0, 4, 79], [4, 4, 74], [8, 4, 71], [12, 4, 74]] },
  { g: 38, pad: [50, 54, 57, 62], arp: [62, 66, 69, 74], lead: [[0, 8, 78], [8, 8, 74]] },
];

// ---------------------------------------------------------------- battle

const BP = {
  kickA: 'X...x...x...x...',
  hatsA: '..x...x...x...x.',
  ghostA: '.x.x.x.x.x.x.x.x',
  bassA: 'x.x.x.x.x.x.x.x.',
  snareB: '....x.......x...',
  kickB: '......x...x.....',
  gtrB: 'X.x.x.x.X.x.x.x.',
  hat16C: '.x.x.x.x.x.x.x.x',
};

function* renderBattle() {
  const sr = SR;
  const r = seeded(7041);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 150 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(BATTLE.length * bar * sr);
  const big = n + Math.round(2.8 * sr);
  const A = new Mix(n, big);
  const B = new Mix(n, big);
  const C = new Mix(n, big);
  const Lead = new Mix(n, big);
  const pump = [beat, 0.5, 0.11];
  for (let b = 0; b < BATTLE.length; b++) {
    const ch = BATTLE[b];
    const t0 = b * bar;
    const humanise = () => 0.85 + r() * 0.3;
    // pad, a pair of takes for width
    yield* note(m, A, t0, { midis: ch.pad, det: [-10, 4], wave: 'saw', att: 0.3, rel: 0.5, dur: bar * 0.98, lp: [800, 800, 1], q: 0.7, pump, vel: 0.2, pan: -0.6 });
    yield* note(m, A, t0, { midis: ch.pad, det: [-4, 10], wave: 'saw', att: 0.3, rel: 0.5, dur: bar * 0.98, lp: [800, 800, 1], q: 0.7, pump, vel: 0.2, pan: 0.6 });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      // --- A: the drive
      if (on(BP.kickA, s)) yield* kick(m, A, t, BP.kickA[s] === 'X' ? 1 : 0.85);
      if (on(BP.hatsA, s)) yield* hat(m, A, t, 0.5 * humanise(), false, s % 4 === 2 ? 0.25 : -0.25);
      if (b >= 4 && on(BP.ghostA, s)) yield* hat(m, A, t, 0.2, false, s % 4 === 1 ? -0.3 : 0.3);
      if (on(BP.bassA, s) || (b === 7 && s >= 12)) {
        const up = s === 6 || s === 14 ? 12 : 0;
        yield* note(m, A, t, {
          midis: [ch.b + up], det: [-4, 4], wave: 'saw', att: 0.003, tau: 0.16, rel: 0.02, dur: step * 1.7, lp: [1200, 280, 0.06], q: 1.2, drive: 1.6, pump, vel: 0.85 * (up ? 0.7 : 1),
        });
      }
      // --- B: the weight
      if (on(BP.snareB, s)) yield* snare(m, B, t, 1);
      if (on(BP.kickB, s) && (b & 1)) yield* kick(m, B, t, 0.8);
      if (s === 14) yield* hat(m, B, t, 0.8, true, 0.3);
      if (on(BP.gtrB, s)) {
        const open = BP.gtrB[s] === 'X';
        const o = { midis: [ch.g, ch.g + 7, ch.g + 12], wave: 'saw', att: 0.002, tau: open ? 0.5 : 0.045, rel: 0.025, dur: open ? step * 1.9 : step * 0.9, lp: [3600, 3600, 1], q: 0.8, hp: 80, drive: 7, vel: open ? 0.55 : 0.5 };
        yield* note(m, B, t, { ...o, det: [-5, 5], pan: -0.75 });
        yield* note(m, B, t, { ...o, det: [-8, 8], pan: 0.75 });
      }
      if ((b === 3 || b === 7) && s >= 12) yield* tom(m, B, t, [210, 170, 140, 105][s - 12], 0.65, [-0.4, -0.1, 0.2, 0.5][s - 12]);
      if (s === 0 && (b === 0 || b === 4)) yield* crash(m, B, t, b === 0 ? 0.8 : 0.6);
      // --- C: the peak
      if (on(BP.hat16C, s)) yield* hat(m, C, t, 0.32 * humanise(), false, s % 4 === 1 ? -0.35 : 0.35);
      for (const [st, len, midi] of ch.lead) {
        if (st === s) {
          yield* note(m, Lead, t, {
            midis: [midi], det: [-6, 6], wave: 'square', att: 0.012, rel: 0.07, dur: len * step * 0.92, lp: [5200, 3000, 0.25], q: 1, vib: [5.6, 0.008, 0.12], drive: 1.2, vel: 0.55, pan: 0.05,
          });
        }
      }
      yield* note(m, Lead, t, { midis: [ch.arp[ARPS[s]]], det: [0], wave: 'saw', att: 0.002, tau: 0.05, rel: 0.02, dur: step * 0.9, lp: [4200, 900, 0.04], vel: 0.26, pan: s % 2 ? 0.45 : -0.45 });
      if (b === 7 && s === 8) yield* riser(m, C, t, step * 8, 0.9);
      if (b === 3 && s === 8) yield* riser(m, C, t, step * 8, 0.6);
      yield;
    }
  }
  // the lead and arpeggio get an echo and a little room, then join the peak stem
  yield* pingpong(Lead, sr, step * 3, 0.4, 0.32);
  yield* reverb(Lead, sr, 0.12, 0.9);
  yield* addMix(C, Lead, 1);
  return { stems: [yield* fold(A), yield* fold(B), yield* fold(C)], sr, loop: true };
}

// ---------------------------------------------------------------- boss

const XP = {
  kick: 'X.xxx.xxx.xxx.xx',
  snare: '....x.......x...',
  taiko: 'X.......x.......',
  hats: 'x.x.x.x.x.x.x.x.',
  gtr: 'X.xxx.xxx.xxx.xx',
};

function* renderBoss() {
  const sr = SR;
  const r = seeded(9113);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 166 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(BOSS.length * bar * sr);
  const big = n + Math.round(2.8 * sr);
  const A = new Mix(n, big);
  const B = new Mix(n, big);
  const C = new Mix(n, big);
  const Lead = new Mix(n, big);
  const pump = [beat, 0.4, 0.1];
  for (let b = 0; b < BOSS.length; b++) {
    const ch = BOSS[b];
    const t0 = b * bar;
    // A: a sub drone and a dark choir-ish pad
    yield* note(m, A, t0, { midis: [ch.b], det: [0], wave: 'sine', att: 0.01, rel: 0.1, dur: bar * 0.97, drive: 1.3, pump, vel: 0.9 });
    yield* note(m, A, t0, { midis: [ch.b + 12], det: [-5, 5], wave: 'saw', att: 0.01, rel: 0.1, dur: bar * 0.97, lp: [500, 500, 1], q: 0.9, drive: 1.5, pump, vel: 0.4 });
    yield* note(m, A, t0, { midis: ch.pad, det: [-14, 5], wave: 'saw', att: 0.4, rel: 0.5, dur: bar * 0.98, lp: [1100, 1100, 1], q: 0.7, pump, vel: 0.17, pan: -0.7 });
    yield* note(m, A, t0, { midis: ch.pad, det: [-5, 14], wave: 'saw', att: 0.4, rel: 0.5, dur: bar * 0.98, lp: [1100, 1100, 1], q: 0.7, pump, vel: 0.17, pan: 0.7 });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      const hum = 0.85 + r() * 0.3;
      // --- A: the gallop
      if (on(XP.kick, s)) yield* kick(m, A, t, (XP.kick[s] === 'X' ? 1 : 0.75) * hum, { f0: 150, f1: 42, tau: 0.07, len: 0.22 });
      if (on(XP.snare, s)) yield* snare(m, A, t, 1.1);
      if (on(XP.taiko, s)) yield* tom(m, A, t, 62, 1.0, 0, 0.32);
      if (on(XP.hats, s)) yield* hat(m, A, t, 0.45 * hum, false, s % 4 === 2 ? 0.3 : -0.3);
      // --- B: heavy guitars and brass
      if (on(XP.gtr, s)) {
        const open = XP.gtr[s] === 'X';
        const o = { midis: [ch.g, ch.g + 7, ch.g + 12], wave: 'saw', att: 0.002, tau: open ? 0.55 : 0.05, rel: 0.02, dur: open ? step * 3.5 : step * 0.8, lp: [3000, 3000, 1], q: 0.8, hp: 70, drive: 9, vel: open ? 0.6 : 0.52 };
        yield* note(m, B, t, { ...o, det: [-6, 6], pan: -0.8 });
        yield* note(m, B, t, { ...o, det: [-9, 9], pan: 0.8 });
      }
      if (s === 0 && (b & 1) === 0) {
        yield* note(m, B, t, { midis: ch.stab.map((x) => x + 12), det: [-12, 12], wave: 'saw', att: 0.04, tau: 0.7, rel: 0.25, dur: beat * 1.5, lp: [700, 3600, 0.12], q: 1, drive: 1.4, vel: 0.5 });
      }
      if (b === 1 && s === 12) yield* note(m, B, t, { midis: [51, 58, 63], det: [-12, 12], wave: 'saw', att: 0.02, tau: 0.3, rel: 0.2, dur: beat * 0.9, lp: [600, 3000, 0.1], q: 1, drive: 1.4, vel: 0.55 });
      if (s === 0 && (b === 0 || b === 4)) yield* crash(m, B, t, 0.8);
      if ((b === 3 || b === 7) && s >= 12) yield* tom(m, B, t, [180, 150, 120, 90][s - 12], 0.7, [-0.4, -0.1, 0.2, 0.5][s - 12], 0.2);
      // --- C: the lead
      if (s % 2 === 1) yield* hat(m, C, t, 0.3 * hum, false, s % 4 === 1 ? -0.4 : 0.4);
      for (const [st, len, midi] of ch.lead) {
        if (st === s) {
          yield* note(m, Lead, t, {
            midis: [midi], det: [-8, 8], wave: 'saw', att: 0.01, rel: 0.06, dur: len * step * 0.92, lp: [6500, 3500, 0.2], q: 1, vib: [6, 0.012, 0.1], drive: 2, vel: 0.5, pan: 0.05,
          });
        }
      }
      if ((b === 3 || b === 7) && s === 8) yield* riser(m, C, t, step * 8, 0.9);
      yield;
    }
  }
  yield* pingpong(Lead, sr, step * 3, 0.35, 0.25);
  yield* reverb(Lead, sr, 0.1, 0.9);
  yield* addMix(C, Lead, 1);
  return { stems: [yield* fold(A), yield* fold(B), yield* fold(C)], sr, loop: true };
}

// ---------------------------------------------------------------- menu

function* renderMenu() {
  const sr = SR;
  const r = seeded(3301);
  const m = newCtx(r, yield* makeTables(r));
  const step = 60 / 100 / 4;
  const beat = step * 4;
  const bar = beat * 4;
  const n = Math.round(MENU_BARS.length * bar * sr);
  const big = n + Math.round(3.5 * sr);
  const X = new Mix(n, big);
  const Wet = new Mix(n, big);
  const pump = [beat * 2, 0.3, 0.15];
  for (let b = 0; b < MENU_BARS.length; b++) {
    const ch = MENU_BARS[b];
    const t0 = b * bar;
    yield* note(m, Wet, t0, { midis: ch.pad, det: [-10, 4], wave: 'saw', att: 0.6, rel: 0.9, dur: bar * 0.98, lp: [700, 700, 1], q: 0.7, vel: 0.3, pan: -0.6 });
    yield* note(m, Wet, t0, { midis: ch.pad, det: [-4, 10], wave: 'saw', att: 0.6, rel: 0.9, dur: bar * 0.98, lp: [700, 700, 1], q: 0.7, vel: 0.3, pan: 0.6 });
    yield* note(m, X, t0, { midis: [ch.g], det: [-4, 4], wave: 'saw', att: 0.01, tau: 0.9, rel: 0.1, dur: bar * 0.97, lp: [600, 200, 0.4], q: 1, drive: 1.3, pump, vel: 0.7 });
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step;
      if (s === 0 || s === 8) yield* kick(m, X, t, 0.6, { f0: 130, f1: 44, tau: 0.1 });
      if (s === 4 || s === 12) yield* snare(m, X, t, 0.35);
      if (s % 4 === 2) yield* hat(m, X, t, 0.3, false, s % 8 === 2 ? 0.25 : -0.25);
      if (s % 2 === 0) {
        yield* note(m, Wet, t, { midis: [ch.arp[ARPS[s]]], det: [0], wave: 'saw', att: 0.002, tau: 0.09, rel: 0.03, dur: step * 1.6, lp: [3000, 800, 0.08], vel: 0.3, pan: s % 4 ? 0.4 : -0.4 });
      }
      for (const [st, len, midi] of ch.lead) {
        if (st === s) {
          yield* note(m, Wet, t, { midis: [midi], det: [-6, 6], wave: 'square', att: 0.07, rel: 0.25, dur: len * step * 0.95, lp: [2800, 1900, 0.5], q: 1, vib: [5.2, 0.01, 0.3], drive: 1.1, vel: 0.4, pan: 0.05 });
        }
      }
      yield;
    }
  }
  // the pad, arpeggio and lead get an echo and a room; the drums and bass stay dry
  yield* pingpong(Wet, sr, step * 3, 0.45, 0.35);
  yield* reverb(Wet, sr, 0.3, 1.1);
  yield* addMix(X, Wet, 1);
  return { stems: [yield* fold(X)], sr, loop: true };
}

// ---------------------------------------------------------------- stings

function* renderVictory() {
  const sr = SR;
  const r = seeded(5521);
  const m = newCtx(r, yield* makeTables(r));
  const secs = 7.5;
  const X = new Mix(Math.round(secs * sr), Math.round(secs * sr));
  const brassO = { wave: 'saw', det: [-9, 9], att: 0.03, rel: 0.08, lp: [1000, 4500, 0.1], q: 1, drive: 1.3 };
  // a timpani roll that grows into the fanfare
  for (let k = 0; k < 16; k++) yield* tom(m, X, k * 0.075, 110, 0.25 + 0.55 * (k / 15), k % 2 ? 0.2 : -0.2, 0.12);
  for (const [t, d, midi] of [[0, 0.22, 67], [0.3, 0.12, 67], [0.45, 0.12, 67], [0.6, 0.25, 71], [0.9, 0.3, 74]]) {
    yield* note(m, X, t, { ...brassO, midis: [midi, midi - 12], tau: 0.25, dur: d, vel: 0.5 });
  }
  // the chord: G major, wide and bright
  yield* note(m, X, 1.3, { ...brassO, midis: [43, 55, 59, 62, 67, 71], tau: 1.5, rel: 0.9, dur: 2.6, lp: [1400, 5200, 0.2], vel: 0.7 });
  yield* note(m, X, 1.3, { ...brassO, midis: [74, 79, 83], det: [-6, 6], tau: 1.2, rel: 0.9, dur: 2.2, lp: [2000, 6500, 0.2], vel: 0.35 });
  yield* tom(m, X, 1.3, 70, 1.1, 0, 0.5);
  yield* kick(m, X, 1.3, 1, { f0: 120, f1: 40, tau: 0.2, len: 0.5 });
  yield* crash(m, X, 1.3, 1, 4);
  for (const [t, v] of [[1.9, 0.5], [2.5, 0.4]]) yield* tom(m, X, t, 85, v, 0, 0.3);
  yield* note(m, X, 2.2, { wave: 'saw', det: [-10, 10], midis: [55, 59, 62, 67, 71], att: 0.5, rel: 2.5, dur: 3, lp: [900, 900, 1], vel: 0.25 });
  yield* reverb(X, sr, 0.35, 1.3, 0.85);
  return { stems: [{ L: X.L, R: X.R }], sr, loop: false };
}

function* renderDefeat() {
  const sr = SR;
  const r = seeded(6619);
  const m = newCtx(r, yield* makeTables(r));
  const secs = 8;
  const X = new Mix(Math.round(secs * sr), Math.round(secs * sr));
  yield* tom(m, X, 0, 55, 1.1, 0, 0.5);
  yield* kick(m, X, 0, 0.9, { f0: 100, f1: 34, tau: 0.25, len: 0.7 });
  yield* note(m, X, 0.05, { midis: [40, 47, 52, 55, 59], det: [-14, 14], wave: 'saw', att: 0.05, tau: 1.8, rel: 1.8, dur: 3.5, lp: [1800, 200, 1.3], q: 0.9, drive: 1.2, vel: 0.55 });
  yield* note(m, X, 0.05, { midis: [28], det: [0], wave: 'sine', att: 0.05, tau: 1.5, rel: 1.5, dur: 3, vel: 0.7 });
  let k = 0;
  for (const midi of [76, 74, 71, 67, 64]) {
    yield* note(m, X, 0.35 + k * 0.45, { midis: [midi], det: [-9, 9], wave: 'saw', att: 0.04, tau: 0.9, rel: 1.2, dur: 1.2, lp: [2600 - 350 * k, 400, 0.6], q: 1, vib: [4.5, 0.012, 0.3], vel: 0.32 });
    k++;
  }
  for (const [t, v] of [[1.0, 0.6], [2.2, 0.45], [3.5, 0.3]]) yield* tom(m, X, t, 60, v, 0, 0.4);
  yield* reverb(X, sr, 0.5, 1.5, 0.86, 0.45);
  return { stems: [{ L: X.L, R: X.R }], sr, loop: false };
}

// ---------------------------------------------------------------- the table

const sm = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// mix(i): the gain of each stem at intensity i; trim(i): the track's overall gain
export const TRACKS = {
  menu: { render: renderMenu, loop: true, mix: () => [1], trim: () => 1 },
  battle: { render: renderBattle, loop: true, mix: (i) => [1.9, 1.15 * sm(0.1, 0.5, i), 0.85 * sm(0.5, 0.9, i)], trim: (i) => 1.1 - 0.3 * i },
  boss: { render: renderBoss, loop: true, mix: (i) => [1, 1, 0.6 + 0.4 * i], trim: () => 1.1 },
  victory: { render: renderVictory, loop: false, mix: () => [1], trim: () => 1 },
  defeat: { render: renderDefeat, loop: false, mix: () => [1], trim: () => 1 },
};
