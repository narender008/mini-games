// Looping beds and one-off events, rendered like the one-shots:
//  LOOPS   the engine, track squeal, fire, jet, rocket, the five weather beds,
//          rain and crickets. Each joins its own start without a seam.
//  EVENTS  what happens now and then in the distance: far guns and gunfire,
//          crows, a siren, thunder.
// Continuous voices (audio.js) loop these through a few live nodes and steer
// their level, pitch and tone from what the game says every frame.
import {
  TAU, clamp, seeded, whiteSync, noise, filter, normalise, addTo, modulate, noiseLoop, sweepLoop, slowLoop, gustInto, damped, modal, fold, removeDCg, fadeEnds, expEnv, shape, sawBL, Biquad, finishPair, BLOCK,
} from './dsp.js';
import { runLayers } from './layers.js';

const E = Math.exp;
function* loopOut(buf, sr, peak = 0.9) {
  yield* removeDCg(buf);
  yield* normalise(buf, peak);
  return { sr, hi: buf, lo: null };
}

// filter a loop as if it repeated forever, and keep one period
function* cyc(buf, sr, chain) {
  const n = buf.length;
  const x = new Float32Array(n * 2);
  x.set(buf);
  x.set(buf, n);
  for (const [t, f, q] of chain) yield* filter(x, sr, t, f, q);
  buf.set(x.subarray(n));
  return buf;
}

// ---------------------------------------------------------------- the machines

// A diesel at a lazy idle: 25 firing pulses a second, each a low thump and a
// knock, a little irregular. Played faster it revs.
function* engine(sr, seed) {
  const r = seeded(seed);
  const len = 1.6;
  const n = Math.round(len * sr);
  const big = new Float32Array(n * 2);
  const tab = whiteSync(2048, r);
  const pulses = 40;
  for (let k = 0; k < pulses; k++) {
    const at = Math.max(0, Math.round(((k + (r() - 0.5) * 0.22) / pulses) * len * sr));
    const a = 0.7 + 0.3 * r();
    damped(big, sr, at, 56 + 8 * r(), a, 0.05);
    damped(big, sr, at, 114 + 10 * r(), a * 0.55, 0.035);
    damped(big, sr, at, 240 + 30 * r(), a * 0.25, 0.02);
    const off = (r() * 2000) | 0;
    for (let i = 0; i < 160; i++) big[at + i] += a * 0.3 * tab[(off + i) & 2047] * E(-i / 70);
    if ((k & 7) === 7) yield;
  }
  const out = yield* fold(big, n);
  const body = yield* noiseLoop(n, sr, r, [['lowpass', 260, 0.8], ['lowpass', 260, 0.8]]);
  yield* normalise(body, 1);
  for (let i = 0; i < n; i++) out[i] += body[i] * 0.22;
  yield* cyc(out, sr, [['lowpass', 900, 0.8]]);
  return yield* loopOut(out, sr);
}

// Tracks clanking round their sprockets, with a squeal that wanders in and out.
function* squeal(sr, seed) {
  const r = seeded(seed);
  const len = 3;
  const n = Math.round(len * sr);
  const big = new Float32Array(n * 2);
  const tab = whiteSync(1024, r);
  for (let k = 0; k < 30; k++) {
    const at = Math.max(0, Math.round(((k + (r() - 0.5) * 0.3) / 30) * len * sr));
    const a = 0.45 + 0.4 * r();
    modal(big, sr, at, [[560, 1, 0.02], [1180, 0.7, 0.015], [2450, 0.5, 0.01]], a * (0.8 + 0.4 * r()));
    const off = (r() * 1000) | 0;
    for (let i = 0; i < 90; i++) big[at + i] += a * 0.25 * tab[(off + i) & 1023] * E(-i / 25);
  }
  const clank = yield* fold(big, n);
  yield* normalise(clank, 1);
  const gate = yield* slowLoop(n, sr, r, 1.3);
  const sq = new Float32Array(n);
  let p1 = 0;
  let p2 = 0;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      const t = i / sr;
      p1 += (TAU * 1750 * (1 + 0.03 * Math.sin((TAU * 2 * t) / len))) / sr;
      p2 += (TAU * 2860 * (1 + 0.025 * Math.sin((TAU * 2 * t) / len + 1.3))) / sr;
      const g = clamp(0.3 + 0.7 * gate[i], 0, 1);
      sq[i] = (Math.sin(p1) * 0.6 + Math.sin(p2) * 0.4) * g * g;
    }
    yield;
  }
  const rattle = yield* noiseLoop(n, sr, r, [['bandpass', 3200, 3]]);
  yield* normalise(rattle, 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = clank[i] * 0.8 + sq[i] * 0.25 + rattle[i] * 0.15;
  return yield* loopOut(out, sr);
}

// A fire's roar and its crackle, two loops of different lengths so they never line up.
function* burnRoar(sr, seed) {
  const r = seeded(seed);
  const n = Math.round(4 * sr);
  const a = yield* noiseLoop(n, sr, r, [['lowpass', 650, 0.7], ['highpass', 70, 0.7]]);
  yield* normalise(a, 1);
  const fl = yield* slowLoop(n, sr, r, 9);
  yield* gustInto(a, fl, 0.55);
  const g = yield* slowLoop(n, sr, r, 0.6);
  yield* gustInto(a, g, 0.35);
  return yield* loopOut(a, sr);
}

function* burnCrackle(sr, seed) {
  const r = seeded(seed);
  const len = 5;
  const n = Math.round(len * sr);
  const big = new Float32Array(n * 2);
  const tab = whiteSync(1024, r);
  for (let k = 0; k < 200; k++) {
    const at = Math.round(r() * n);
    const a = 0.08 + 0.9 * r() ** 3;
    const l = Math.round((0.001 + 0.003 * r()) * sr);
    const off = (r() * 1000) | 0;
    let prev = 0;
    for (let i = 0; i < l; i++) {
      const x = tab[(off + i) & 1023];
      big[at + i] += a * (x - prev) * E((-4 * i) / l);
      prev = x;
    }
    if ((k & 15) === 15) yield;
  }
  for (let k = 0; k < 14; k++) damped(big, sr, Math.round(r() * n), 1500 + 2000 * r(), 0.15 + 0.4 * r(), 0.004 + 0.004 * r());
  const out = yield* fold(big, n);
  const hiss = yield* noiseLoop(n, sr, r, [['highpass', 2500, 0.7]]);
  yield* normalise(hiss, 1);
  const fl = yield* slowLoop(n, sr, r, 3);
  yield* gustInto(hiss, fl, 0.6);
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] = out[i] / (m || 1) + hiss[i] * 0.06;
  return yield* loopOut(out, sr);
}

// A jet going by: roar, a deep rumble, a turbine's whine, a hiss of burner.
function* jet(sr, seed) {
  const r = seeded(seed);
  const len = 3;
  const n = Math.round(len * sr);
  const body = yield* noiseLoop(n, sr, r, [['bandpass', 900, 0.5], ['lowpass', 3000, 0.7]]);
  yield* normalise(body, 1);
  const rum = yield* noiseLoop(n, sr, r, [['lowpass', 200, 0.8]]);
  yield* normalise(rum, 1);
  const burn = yield* noiseLoop(n, sr, r, [['highpass', 3500, 0.7]]);
  yield* normalise(burn, 1);
  const g = yield* slowLoop(n, sr, r, 0.8);
  const out = new Float32Array(n);
  let ph = 0;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      const t = i / sr;
      ph += (TAU * 1500 * (1 + 0.008 * Math.sin((TAU * 2 * t) / len))) / sr;
      const gust = clamp(1 + 0.25 * g[i], 0.4, 1.6);
      out[i] = (body[i] * 0.8 + rum[i] * 0.5 + burn[i] * 0.12 * gust + (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) * 0.12) * gust;
    }
    yield;
  }
  return yield* loopOut(out, sr);
}

// A rocket motor: a hard hiss over a throaty roar.
function* rocket(sr, seed) {
  const r = seeded(seed);
  const len = 2;
  const n = Math.round(len * sr);
  const hiss = yield* noiseLoop(n, sr, r, [['bandpass', 3200, 0.5], ['highpass', 1200, 0.7]]);
  yield* normalise(hiss, 1);
  const f1 = yield* slowLoop(n, sr, r, 70);
  yield* gustInto(hiss, f1, 0.3);
  const roarBed = yield* noiseLoop(n, sr, r, [['lowpass', 700, 0.7], ['lowpass', 700, 0.7]]);
  yield* normalise(roarBed, 1);
  const f2 = yield* slowLoop(n, sr, r, 25);
  yield* gustInto(roarBed, f2, 0.4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = hiss[i] * 0.6 + roarBed[i] * 0.9;
  return yield* loopOut(out, sr);
}

// ---------------------------------------------------------------- weather

// each bed is the wind itself (the Sound scales it with setWind); gusts are in the loop
function* windFarm(sr, seed) {
  const r = seeded(seed);
  const n = Math.round(8 * sr);
  const a = yield* noiseLoop(n, sr, r, [['bandpass', 420, 0.45], ['lowpass', 1200, 0.7]]);
  yield* normalise(a, 1);
  const g = yield* slowLoop(n, sr, r, 0.35);
  yield* gustInto(a, g, 0.55);
  const rus = yield* noiseLoop(n, sr, r, [['highpass', 3200, 0.7], ['lowpass', 6000, 0.7]]);
  yield* normalise(rus, 1);
  yield* gustInto(rus, g, 0.9);
  for (let i = 0; i < n; i++) a[i] += rus[i] * 0.1;
  return yield* loopOut(a, sr);
}

function* windDesert(sr, seed) {
  const r = seeded(seed);
  const n = Math.round(8 * sr);
  const a = yield* noiseLoop(n, sr, r, [['bandpass', 1000, 0.5], ['lowpass', 3000, 0.7]]);
  yield* normalise(a, 1);
  const hiss = yield* noiseLoop(n, sr, r, [['highpass', 3500, 0.7]]);
  yield* normalise(hiss, 1);
  for (let i = 0; i < n; i++) a[i] += hiss[i] * 0.25;
  const g = yield* slowLoop(n, sr, r, 0.25);
  yield* gustInto(a, g, 0.5);
  return yield* loopOut(a, sr);
}

// a cold howl: two narrow bands wandering about, over a low bed
function* windSnow(sr, seed) {
  const r = seeded(seed);
  const len = 8;
  const n = Math.round(len * sr);
  const h1 = yield* sweepLoop(n, sr, r, 'bandpass', (t) => 480 + 160 * Math.sin((TAU * t) / len), 14);
  yield* normalise(h1, 1);
  const h2 = yield* sweepLoop(n, sr, r, 'bandpass', (t) => 1020 + 260 * Math.sin((TAU * 2 * t) / len + 1), 16);
  yield* normalise(h2, 1);
  const bed = yield* noiseLoop(n, sr, r, [['lowpass', 260, 0.8], ['lowpass', 260, 0.8]]);
  yield* normalise(bed, 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = h1[i] * 0.5 + h2[i] * 0.3 + bed[i] * 0.6;
  const g = yield* slowLoop(n, sr, r, 0.3);
  yield* gustInto(out, g, 0.5);
  return yield* loopOut(out, sr);
}

function* windCity(sr, seed) {
  const r = seeded(seed);
  const n = Math.round(8 * sr);
  const a = yield* noiseLoop(n, sr, r, [['bandpass', 250, 0.5], ['lowpass', 800, 0.7]]);
  yield* normalise(a, 1);
  const g = yield* slowLoop(n, sr, r, 0.3);
  yield* gustInto(a, g, 0.5);
  return yield* loopOut(a, sr);
}

function* windNight(sr, seed) {
  const r = seeded(seed);
  const n = Math.round(8 * sr);
  const a = yield* noiseLoop(n, sr, r, [['lowpass', 320, 0.7], ['bandpass', 200, 0.6]]);
  yield* normalise(a, 1);
  const g = yield* slowLoop(n, sr, r, 0.2);
  yield* gustInto(a, g, 0.5);
  return yield* loopOut(a, sr);
}

// rain on rubble: a steady hiss, a patter of drops, now and then a drop on tin
function* rain(sr, seed) {
  const r = seeded(seed);
  const len = 8;
  const n = Math.round(len * sr);
  const a = yield* noiseLoop(n, sr, r, [['highpass', 900, 0.7], ['lowpass', 6500, 0.7]]);
  yield* normalise(a, 1);
  const f = yield* slowLoop(n, sr, r, 2);
  yield* gustInto(a, f, 0.15);
  const big = new Float32Array(n * 2);
  for (let k = 0; k < 900; k++) {
    damped(big, sr, Math.round(r() * n), 2500 + 4000 * r(), 0.04 + 0.2 * r() * r(), 0.0015 + 0.002 * r());
    if ((k & 63) === 63) yield;
  }
  for (let k = 0; k < 60; k++) damped(big, sr, Math.round(r() * n), 700 + 1400 * r(), 0.15 + 0.35 * r(), 0.008 + 0.012 * r());
  const drops = yield* fold(big, n);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i] * 0.5 + drops[i];
  return yield* loopOut(out, sr);
}

// crickets: six of them, each chirping in groups of short pulses
function* crickets(sr, seed) {
  const r = seeded(seed);
  const len = 6;
  const n = Math.round(len * sr);
  const out = new Float32Array(n + 4000);
  for (let c = 0; c < 6; c++) {
    const fc = 4100 + 1100 * r();
    const count = 11 + Math.floor(r() * 6);
    const phase = r();
    const amp = 0.18 + 0.12 * r();
    for (let j = 0; j < count; j++) {
      const t0 = ((j + phase) / count) * len;
      const start = Math.round(t0 * sr);
      let ph = r() * TAU;
      for (let p = 0; p < 4; p++) {
        const ps = start + Math.round(p * 0.0182 * sr);
        const pl = Math.round(0.014 * sr);
        for (let i = 0; i < pl; i++) {
          const e = Math.sin((Math.PI * i) / pl);
          ph += (TAU * fc) / sr;
          const idx = (ps + i) % n;
          out[idx] += amp * e * e * Math.sin(ph);
        }
      }
      if ((j & 3) === 3) yield;
    }
  }
  return yield* loopOut(out.subarray(0, n).slice(), sr, 0.8);
}

export const LOOPS = {
  engine: { sr: 16000, render: engine },
  squeal: { sr: 16000, render: squeal },
  burnRoar: { sr: 16000, render: burnRoar },
  burnCrackle: { sr: 16000, render: burnCrackle },
  jet: { sr: 22050, render: jet },
  rocket: { sr: 22050, render: rocket },
  windFarm: { sr: 16000, render: windFarm },
  windDesert: { sr: 16000, render: windDesert },
  windSnow: { sr: 16000, render: windSnow },
  windCity: { sr: 16000, render: windCity },
  windNight: { sr: 16000, render: windNight },
  rain: { sr: 16000, render: rain },
  crickets: { sr: 16000, render: crickets },
};

// ---------------------------------------------------------------- events

// a distance of dull thumps and rolling: no crack at all
function monoOf(pair) {
  const { sr, hi, lo } = pair;
  const out = new Float32Array(hi.length);
  for (let i = 0; i < out.length; i++) out[i] = hi[i] + (lo ? lo[i] : 0);
  return { sr, hi: out, lo: null };
}

function* farGun(sr, seed) {
  const r = seeded(seed);
  const n = Math.round(3.4 * sr);
  const hi = new Float32Array(n);
  const lo = new Float32Array(n);
  yield* runLayers([
    { k: 'body', f0: 62, f1: 30, tp: 0.12, tau: 0.35, amp: 0.8, drive: 1.0, attack: 0.01 },
    { k: 'roar', dur: 0.7, amp: 0.35, fA: 600, fB: 150, tauF: 0.2, att: 0.02, env: [[0, 0], [0.02, 1], [0.7, 0.01], [0.704, 0]] },
    { k: 'rumble', dur: 3.0, amp: 1.0, fc: 120, att: 0.06, tau: 0.8, rollFc: 4, rollDepth: 0.5 },
    { k: 'echo', taps: [[0.6, 0.35], [1.3, 0.25], [2.1, 0.15]], fc: 320, atk: 0.1, tau: 0.5, amp: 1.0 },
  ], hi, lo, sr, r);
  return monoOf(yield* finishPair(hi, lo, sr, 0.9, 200));
}

// a burst of gunfire a long way off: soft cracks rolling over the ground
function* farBurst(sr, seed) {
  const r = seeded(seed);
  const n = Math.round(3.2 * sr);
  const hi = new Float32Array(n);
  const lo = new Float32Array(n);
  const L = [];
  const pops = 7 + Math.floor(r() * 7);
  let t = 0.05;
  for (let k = 0; k < pops; k++) {
    const a = 0.45 + 0.5 * r();
    L.push({ k: 'crack', at: t, amp: a, dur: 0.008, hp: 400, snap: 0.9, snapFc: 1600, snapTau: 0.012 });
    L.push({ k: 'body', at: t, f0: 190, f1: 90, tp: 0.03, tau: 0.04, amp: a * 0.5, drive: 1.2 });
    t += 0.09 + 0.08 * r();
  }
  L.push({ k: 'echo', at: 0, taps: [[0.3, 0.3], [0.75, 0.2], [1.3, 0.1]], fc: 520, atk: 0.07, tau: 0.35, amp: 1.0 });
  yield* runLayers(L, hi, lo, sr, r);
  return monoOf(yield* finishPair(hi, lo, sr, 0.9, 150));
}

// a crow, a long way off: a few harsh caws
function* crow(sr, seed) {
  const r = seeded(seed);
  const n = Math.round(1.7 * sr);
  const out = new Float32Array(n);
  const caws = 2 + Math.floor(r() * 3);
  let t = 0.05;
  const b1 = new Biquad('bandpass', 900, 5, sr);
  const b2 = new Biquad('bandpass', 1900, 7, sr);
  const tab = whiteSync(2048, r);
  for (let c = 0; c < caws; c++) {
    const dur = 0.2 + 0.1 * r();
    const f0 = 480 + 140 * r();
    const at = Math.round(t * sr);
    const len = Math.round(dur * sr);
    let ph = 0;
    for (let i = 0; i < len && at + i < n; i++) {
      const tt = i / sr;
      const u = tt / dur;
      ph += (f0 * (1 - 0.28 * u) * (1 + 0.02 * Math.sin(TAU * 38 * tt))) / sr;
      if (ph >= 1) ph -= 1;
      let src = ph < 0.18 ? 1 - ph / 0.18 : -0.2 * (1 - (ph - 0.18) / 0.82);
      src = src * (0.65 + 0.35 * Math.sin(TAU * 72 * tt)) + 0.25 * tab[i & 2047];
      const env = (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) * 0.9) * Math.min(1, tt / 0.012);
      out[at + i] += env * (b1.run(src) + 0.6 * b2.run(src));
    }
    t += dur + 0.12 + 0.2 * r();
    yield;
  }
  yield* filter(out, sr, 'lowpass', 2600, 0.7);
  yield* normalise(out, 0.9);
  fadeEnds(out, 32, 200);
  return { sr, hi: out, lo: null };
}

// a siren far away: two slow wails a little apart, with an echo off the walls
function* siren(sr, seed) {
  const r = seeded(seed);
  const len = 12;
  const n = Math.round(len * sr);
  const out = new Float32Array(n);
  const voices = [[1, 1, 0], [1.34, 0.5, 2]];
  for (const [mult, amp, shift] of voices) {
    let ph = r();
    for (let b = 0; b < n; b += BLOCK) {
      const e = Math.min(n, b + BLOCK);
      for (let i = b; i < e; i++) {
        const t = i / sr + shift;
        const f = mult * (560 + 320 * (0.5 - 0.5 * Math.cos((TAU * t) / 6)));
        const dt = f / sr;
        ph += dt;
        if (ph >= 1) ph -= 1;
        out[i] += amp * sawBL(ph, dt);
      }
      yield;
    }
  }
  yield* filter(out, sr, 'lowpass', 1300, 0.7);
  const d = Math.round(0.35 * sr);
  for (let i = n - 1; i >= d; i--) out[i] += 0.3 * out[i - d];
  yield* shape(out, sr, [[0, 0], [2.5, 1], [len - 3.5, 1], [len, 0]]);
  yield* normalise(out, 0.9);
  return { sr, hi: out, lo: null };
}

// thunder: a crackle of lightning tearing, then a long roll
function* thunder(sr, seed) {
  const r = seeded(seed);
  const len = 9;
  const n = Math.round(len * sr);
  const out = new Float32Array(n);
  for (let k = 0; k < 9; k++) {
    const at = Math.round(r() * 0.7 * sr);
    const l = Math.round((0.04 + 0.1 * r()) * sr);
    const a = yield* noise(l, r);
    yield* filter(a, sr, 'highpass', 300, 0.7);
    yield* shape(a, sr, expEnv(0.004, l / sr / 4, l / sr));
    yield* addTo(out, a, 0.3 + 0.5 * r(), at);
  }
  const roll = yield* noise(n, r);
  yield* filter(roll, sr, 'lowpass', 160, 0.9);
  yield* filter(roll, sr, 'lowpass', 220, 0.7);
  yield* normalise(roll, 1);
  yield* modulate(roll, sr, r, 1.1, 0.8);
  yield* shape(roll, sr, expEnv(0.3, 2.6, len));
  yield* addTo(out, roll, 1.2, 0);
  const mid = yield* noise(n, r);
  yield* filter(mid, sr, 'bandpass', 300, 0.6);
  yield* normalise(mid, 1);
  yield* modulate(mid, sr, r, 0.7, 0.7);
  yield* shape(mid, sr, expEnv(0.2, 1.4, 6));
  yield* addTo(out, mid, 0.5, 0);
  yield* normalise(out, 0.9);
  fadeEnds(out, 32, Math.round(0.4 * sr));
  return { sr, hi: out, lo: null };
}

export const EVENTS = {
  farGun: { sr: 16000, variants: 2, render: farGun },
  farBurst: { sr: 16000, variants: 2, render: farBurst },
  crow: { sr: 16000, variants: 3, render: crow },
  siren: { sr: 16000, variants: 1, render: siren },
  thunder: { sr: 12000, variants: 2, render: thunder },
};
