// Splash Ride's sound. Everything is synthesised with Web Audio at run time:
// no audio files, no voices. It aims to sound like a field recording of a
// small boat on calm water, never like an arcade.
//
// While you drive, a set of continuous voices follows the boat every frame,
// all smoothed so nothing clicks: water rushing along the hull (a rendered
// loop of wash, bubbles and spatter, brighter and louder with speed), the
// foamy hiss of the wake, the fizz of bow spray thrown to the outside of a
// turn, wind past your ears, and soft lapping when you slow down. On top of
// that, each boat has its own voice:
//  - speedboat: a small four-stroke outboard, a low purr. An oscillator plays
//    the exhaust pulses (two firings a cycle, the second a little weaker and
//    late, with cycle-to-cycle jitter) at 18 firings a second at idle up to
//    60 at speed, through fixed exhaust and cowl resonances and a low-pass
//    that opens with speed; valve clatter pulses with the firing; the
//    exhaust burbles out under water; the prop churns behind.
//  - sailboat: no motor. Water chuckling along the wooden hull, wind in the
//    sail, the cloth fluttering and snapping when it luffs, a soft thump as
//    it fills, and the rigging creaking now and then.
//  - duck: a pedal boat's quiet electric whirr and its paddle wheel's
//    rhythmic little splashes, their rate following speed.
//  - jetski: the jet pump's soft whoosh (filtered noise round a low tonal
//    core) and the jet of water behind, kept mellow and low-passed.
// In the air the water lets go at once, the motor note lifts a little (the
// prop unloaded) and the wind stays.
//
// One-shots (splashes, hull slaps, bumps, horns, the ring chime...) are
// rendered once into small buffers from physical parts (see ambience.js)
// and played through a voice budget, so a burst of events never piles up.
// The master bus has a gentle glue compressor, a limiter and a soft
// ceiling at -6 dBFS: nothing ever gets loud. Each place has its own
// generated reverb, ambience and music (ambience.js, music.js); menus get
// music and ambience only, quieter.
//
// Everything runs on any BaseAudioContext, so _dev/audio.html renders and
// measures every sound offline without playing anything aloud.
import { load, save, clamp, rand, smoothstep, BOATS, TAU } from './config.js';
import { Music, KEYS, LEADS, penta, renderNote, NOTE_RATE, styleNotes } from './music.js';
import {
  Ambience, CALLS, distGain, distCut, seeded, secs, logRand, Biquad, filt, white, pinkify, grain, damped, bubble, voiced, mix, normalise,
  fadeTail, finish, toBuffer, renderIR, rushLoop, fizzLoop, burbleLoop, lapLoop, chuckleLoop, gustLoop, flutterLoop, removeDC, periodic,
} from './ambience.js';

// ------------------------------------------------------------ levels

const MASTER = 0.9;
// the compressors add their own make-up gain; these take it back off, so
// ordinary levels pass at unity and only peaks are squeezed (measured with
// _dev/audio.html)
const GLUE_TRIM = 0.5349; // -5.43 dB
const LIMIT_TRIM = 0.4545; // -6.84 dB
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const MAX_SHOTS = COARSE ? 18 : 26;
// most one-shots of a kind at once
const CAP = { splash: 6, slap: 4, bump: 3, animal: 4, amb: 6, paddle: 4, flap: 4, whoosh: 2, creak: 2 };

// continuous voices at full strength
const K = {
  rush: 0.13, wake: 0.06, spray: 0.05, wind: 0.035, lap: 0.25,
  motor: 0.17, burble: 0.1, prop: 0.06,
  jet: 0.06, core: 0.035, jetSpray: 0.035,
  whirr: 0.022, hiss: 0.008, churn: 0.07, paddle: 0.12,
  chuckle: 0.3, sailWind: 0.06, luff: 0.05, flap: 0.12, creak: 0.06,
};

// one-shots (rendered sounds and notes peak at 1)
const LV = {
  splash: 0.34, slap: 0.3, takeoff: 0.26, bump: 0.45, whoosh: 0.16,
  ring: 0.36, glint: 0.03, buoy: 0.2, shell: 0.15, tick: 0.08, pip: 0.2, go: 0.12, finish: 0.2,
  toot: 0.17, shipbell: 0.15, squeak: 0.17, beep: 0.12,
  click: 0.12, select: 0.12, fill: 0.14,
};
// the animals, at 10 m
const ANIMAL = { dolphin: 0.24, duck: 0.35, gull: 0.25, frog: 0.35, splashfish: 1 };

// How each hull colours a wave slap and a bump: playback rate, brightness.
// A sailboat and a pedal boat slip through the water more quietly, and a
// jet ski skims on top of it, so they get less of the common rush and spray
// (`water`) and a duller rush (`bright`, scales its lowpass).
const HULL = {
  speedboat: { rate: 1, cut: 3200, gain: 1, water: 1, bright: 1 },
  sailboat: { rate: 0.85, cut: 2600, gain: 1, water: 0.7, bright: 1 },
  duck: { rate: 0.75, cut: 1700, gain: 0.9, water: 0.7, bright: 0.9 },
  jetski: { rate: 1.12, cut: 3000, gain: 0.85, water: 0.8, bright: 0.7 },
};

// Each place's space (a generated impulse response: reverb time, how the
// highs die away, early reflections [s, gain], far echoes [s, gain, Hz])
// and how much of the effects, ambience and music goes into it.
const ROOMS = {
  // open water, a short airy tail over the sea
  lagoon: { ir: { rt: 0.9, top: 6500, bottom: 1500, predelay: 0.008, early: [[0.011, 0.45], [0.019, -0.22], [0.031, 0.12]] }, sfx: 0.08, amb: 0.1, music: 0.22 },
  // a still lake: a longer, darker tail and the shore answering back
  lake: { ir: { rt: 1.5, top: 5000, bottom: 1100, predelay: 0.02, early: [[0.024, 0.3], [0.041, -0.18]], echoes: [[0.21, 0.2, 2600], [0.36, 0.12, 1900]] }, sfx: 0.12, amb: 0.16, music: 0.28 },
  // stone walls either side, about 8 m apart: a flutter of reflections
  canal: { ir: { rt: 1.25, top: 7000, bottom: 2000, predelay: 0.004, early: [[0.0235, 0.55], [0.047, -0.42], [0.07, 0.32], [0.094, -0.24], [0.117, 0.17], [0.14, -0.12]] }, sfx: 0.2, amb: 0.3, music: 0.26 },
  // a warm night on a sheltered bay
  bay: { ir: { rt: 1.3, top: 4500, bottom: 1100, predelay: 0.014, early: [[0.018, 0.35], [0.033, -0.2]] }, sfx: 0.12, amb: 0.16, music: 0.32 },
};

// ------------------------------------------------------------ small helpers

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const unit = (v) => clamp(num(v), 0, 1);

function gainNode(ctx, v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function filter(ctx, type, freq, q = 0.7, db = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (db) f.gain.value = db;
  return f;
}

function compressor(ctx, threshold, knee, ratio, attack, release) {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.knee.value = knee;
  c.ratio.value = ratio;
  c.attack.value = attack;
  c.release.value = release;
  return c;
}

// A soft ceiling: untouched up to 0.4 (-8 dBFS), then eased towards 0.5
// (-6 dBFS), which it never passes.
function softCeiling() {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.4 ? a : 0.4 + 0.1 * Math.tanh((a - 0.4) / 0.1));
  }
  return c;
}

function periodicWave(ctx, amps) {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => (imag[i + 1] = a));
  return ctx.createPeriodicWave(real, imag);
}

// The outboard's exhaust pressure over one engine cycle: two sharp pulses
// (the second a little weaker and late, as no engine fires quite evenly),
// each followed by its rarefaction. Played at half the firing rate.
function engineWave(ctx) {
  const N = 2048;
  const x = new Float32Array(N);
  const bump = (c, w, a) => {
    for (let i = 0; i < N; i++) {
      let d = i / N - c;
      d -= Math.round(d);
      x[i] += a * Math.exp(-(d * d) / (2 * w * w));
    }
  };
  bump(0, 0.006, 1);
  bump(0.025, 0.02, -0.3);
  bump(0.515, 0.007, 0.8);
  bump(0.545, 0.022, -0.26);
  removeDC(x);
  const H = 180;
  const real = new Float32Array(H + 1);
  const imag = new Float32Array(H + 1);
  for (let k = 1; k <= H; k++) {
    let re = 0;
    let im = 0;
    const w = (TAU * k) / N;
    for (let i = 0; i < N; i++) {
      re += x[i] * Math.cos(w * i);
      im += x[i] * Math.sin(w * i);
    }
    real[k] = (re * 2) / N;
    imag[k] = (im * 2) / N;
  }
  return ctx.createPeriodicWave(real, imag);
}

// ------------------------------------------------------------ rendered one-shots

// A contact force (a half-sine of length tc) driving damped modes [Hz,
// amplitude, Q]; what radiates is the surface's velocity. From Marble Run.
function modal(sr, { modes, tc, len }, r) {
  const n = Math.ceil(len * sr);
  const out = new Float32Array(n);
  const nf = Math.max(2, Math.round(tc * sr));
  const force = new Float32Array(nf);
  let area = 0;
  for (let i = 0; i < nf; i++) {
    force[i] = Math.sin((Math.PI * (i + 0.5)) / nf) * (1 + 0.15 * (r() * 2 - 1));
    area += force[i];
  }
  for (const [f, amp, q] of modes) {
    if (f >= sr * 0.45) continue;
    const w = (TAU * f) / sr;
    const rr = Math.exp((-Math.PI * f) / (q * sr));
    const a1 = 2 * rr * Math.cos(w);
    const a2 = rr * rr;
    const b = (amp * Math.sin(w)) / area;
    const vel = 1 / (2 * Math.sin(w / 2));
    const end = Math.min(n, nf + Math.ceil((q / (Math.PI * f)) * 9.2 * sr));
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < end; i++) {
      const y = (i < nf ? b * force[i] : 0) + a1 * y1 - a2 * y2;
      out[i] += (y - y1) * vel;
      y2 = y1;
      y1 = y;
    }
  }
  fadeTail(out, 0.1);
  return out;
}

// Landing from a hop: the hull meets the water with a low thump and a
// slap, a sheet of water is thrown up and falls back (a crash whose
// brightness dies away), air dragged under rings as a cloud of bubbles, and
// drops patter back down, thinner and thinner. `size` 0..1.
function splashRender(sr, seed, size) {
  const r = seeded(seed);
  const dur = 1.0 + 0.7 * size;
  const n = Math.floor(dur * sr);
  const at = secs(sr, 0.004);
  const core = new Float32Array(n);
  const f = 70 + 25 * r() - 8 * size;
  damped(core, sr, at, f, 0.35, 0.04 + 0.025 * size);
  damped(core, sr, at, f * 2.35, 0.12, 0.02);
  const thud = new Float32Array(n);
  grain(thud, at, secs(sr, 0.05 + 0.04 * size), secs(sr, 0.003), 1, r);
  filt(thud, sr, 'lowpass', 450, 0.8);
  filt(thud, sr, 'lowpass', 700, 0.6);
  mix(core, thud, 0.6);
  const slap = new Float32Array(n);
  grain(slap, at, secs(sr, 0.03), secs(sr, 0.0015), 1, r);
  filt(slap, sr, 'bandpass', 900, 0.7);
  mix(core, slap, 0.8 + 0.3 * size);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const out = Float32Array.from(core);
    const crash = new Float32Array(n);
    const bq = new Biquad('lowpass', 7000, 0.6, sr);
    const tau = 0.12 + 0.18 * size;
    for (let i = at; i < n; i++) {
      const t = (i - at) / sr;
      if ((i & 15) === 0) bq.set('lowpass', 1600 + 5400 * Math.exp(-t / 0.15), 0.6, sr);
      const e = t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / tau);
      crash[i] = bq.run((r() * 2 - 1) * e);
    }
    mix(out, crash, 0.9 + 0.4 * size);
    const nb = Math.floor(40 + 90 * size);
    for (let k = 0; k < nb; k++) {
      const u = r() ** 1.6;
      const t = 0.005 + u * (0.25 + 0.2 * size);
      bubble(out, sr, Math.floor(t * sr), logRand(r, 250, 2600) * (0.6 + 0.8 * u), (0.06 + 0.22 * r() ** 2) * (1 - 0.6 * u), 0.05 + 0.15 * r());
    }
    const drops = new Float32Array(n);
    const nd = Math.floor(25 + 55 * size);
    for (let k = 0; k < nd; k++) {
      const t = 0.12 + ((0.25 + 0.8 * size) * -Math.log(1 - 0.95 * r())) / 3;
      if (t > dur - 0.1) continue;
      const i = Math.floor(t * sr);
      const a = (0.05 + 0.12 * r() ** 2) * Math.exp(-t / (0.5 + 0.3 * size));
      grain(drops, i, secs(sr, 0.001 + 0.0015 * r()), 2, a, r);
      if (r() < 0.55) bubble(out, sr, i + 2, logRand(r, 1200, 4500), a * (0.3 + 0.5 * r()), 0.15 + 0.15 * r());
    }
    filt(drops, sr, 'bandpass', 3500, 0.8);
    mix(out, drops, 1.8);
    filt(out, sr, 'lowpass', 7500, 0.6);
    filt(out, sr, 'highpass', 45, 0.7);
    chans.push(out);
  }
  return finish(chans, sr, 0.3, 50);
}

// A small wave slapping the hull: the hull panel's short thump, the water's
// slap, a few bubbles and a fizz of spray after.
function slapRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.4 * sr);
  const out = new Float32Array(n);
  const at = secs(sr, 0.002);
  const f = 160 + 80 * r();
  damped(out, sr, at, f, 0.3, 0.02);
  damped(out, sr, at, f * 2.3, 0.12, 0.01);
  const low = new Float32Array(n);
  grain(low, at, secs(sr, 0.025), secs(sr, 0.002), 1, r);
  filt(low, sr, 'lowpass', 650, 0.7);
  mix(out, low, 0.45);
  const sl = new Float32Array(n);
  grain(sl, at, secs(sr, 0.015 + 0.015 * r()), secs(sr, 0.002), 1, r);
  filt(sl, sr, 'bandpass', 900 + 400 * r(), 0.7);
  mix(out, sl, 1);
  for (let k = 0; k < 4 + Math.floor(r() * 6); k++) bubble(out, sr, at + Math.floor(r() * 0.06 * sr), logRand(r, 400, 2000), 0.08 + 0.14 * r() ** 2, 0.06 + 0.12 * r());
  const fz = new Float32Array(n);
  for (let k = 0; k < 12 + Math.floor(r() * 14); k++) grain(fz, Math.floor((0.03 + 0.17 * r() ** 1.5) * sr), secs(sr, 0.0008 + 0.0015 * r()), 2, 0.05 + 0.12 * r() ** 2, r);
  filt(fz, sr, 'bandpass', 3000, 0.8);
  mix(out, fz, 1.3);
  filt(out, sr, 'lowpass', 5500, 0.6);
  filt(out, sr, 'highpass', 70, 0.7);
  return finish([out], sr, 0.3, 30);
}

// Leaving the water on a hop: the hull sucking free (a gurgle of bubbles
// rising fast), the water sheet tearing off, drops streaming back, and the
// air: a soft rising swoosh.
function takeoffRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.9 * sr);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(n);
    for (let k = 0; k < 6 + Math.floor(r() * 6); k++) bubble(out, sr, Math.floor((0.005 + 0.12 * r()) * sr), logRand(r, 300, 900), 0.2 + 0.3 * r(), 0.2 + 0.2 * r(), false, 30 + 30 * r());
    const tear = new Float32Array(n);
    grain(tear, secs(sr, 0.01), secs(sr, 0.14), secs(sr, 0.012), 1, r);
    filt(tear, sr, 'bandpass', 1800, 0.7);
    mix(out, tear, 0.45);
    const drops = new Float32Array(n);
    for (let k = 0; k < 10 + Math.floor(r() * 10); k++) {
      const i = Math.floor((0.08 + 0.55 * r() ** 1.3) * sr);
      const a = 0.04 + 0.1 * r() ** 2;
      grain(drops, i, secs(sr, 0.001 + 0.001 * r()), 2, a, r);
      if (r() < 0.5) bubble(out, sr, i + 2, logRand(r, 1300, 4200), a * 0.5, 0.15);
    }
    filt(drops, sr, 'bandpass', 3200, 0.8);
    mix(out, drops, 1.2);
    airSweep(out, sr, secs(sr, 0.02), 0.6, (u) => 350 * (1500 / 350) ** u, 1.1, 0.5, r, (u) => Math.sin(Math.PI * u) ** 2);
    filt(out, sr, 'lowpass', 6500, 0.6);
    chans.push(out);
  }
  return finish(chans, sr, 0.3, 40);
}

// noise through a band-pass whose centre follows fc(u), under env(u)
function airSweep(out, sr, at, dur, fc, q, amp, r, env) {
  const len = Math.floor(dur * sr);
  const bq = new Biquad('bandpass', fc(0), q, sr);
  for (let i = 0; i < len && at + i < out.length; i++) {
    const u = i / len;
    if ((i & 15) === 0) bq.set('bandpass', fc(u), q, sr);
    out[at + i] += amp * env(u) * bq.run(r() * 2 - 1);
  }
}

// A bumper-boat bounce: the rubber fender's soft thud (a long, soft
// contact barely reaches the higher modes) with the hull behind it, a small
// squeak as the fender rubs along, and the slosh of water pushed aside.
function bumpRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.9 * sr);
  const out = new Float32Array(n);
  const thud = modal(sr, { modes: [[160 + 40 * r(), 0.5, 2.2], [330 + 70 * r(), 0.8, 3], [700 + 150 * r(), 0.4, 4], [1300 + 200 * r(), 0.12, 5], [85 + 25 * r(), 0.7, 3]], tc: 0.004 + 0.002 * r(), len: 0.35 }, r);
  normalise([thud], 1);
  for (let i = 0; i < thud.length; i++) out[i + 40] += thud[i];
  // stick-slip: a quasi-periodic train of slips ringing the fender's modes
  const sq = new Float32Array(n);
  const t0 = 0.008 + 0.01 * r();
  const dur = 0.07 + 0.07 * r();
  const f0 = 380 + 240 * r();
  for (let t = t0; t < t0 + dur;) {
    const u = (t - t0) / dur;
    sq[Math.floor(t * sr)] += Math.sin(Math.PI * u) ** 1.5 * (0.7 + 0.3 * r());
    t += 1 / (f0 * (1 + 0.35 * Math.sin(Math.PI * u)) * (0.97 + 0.06 * r()));
  }
  const sq2 = Float32Array.from(sq);
  filt(sq, sr, 'bandpass', 1700, 5);
  filt(sq2, sr, 'bandpass', 2600, 6);
  mix(sq, sq2, 0.5);
  normalise([sq], 0.2);
  mix(out, sq);
  const sl = new Float32Array(n);
  grain(sl, secs(sr, 0.02), secs(sr, 0.35), secs(sr, 0.05), 1, r);
  filt(sl, sr, 'lowpass', 1000, 0.7);
  normalise([sl], 0.45);
  mix(out, sl);
  for (let k = 0; k < 3 + Math.floor(r() * 4); k++) bubble(out, sr, Math.floor((0.03 + 0.17 * r()) * sr), logRand(r, 200, 700), 0.1 + 0.15 * r(), 0.1 + 0.1 * r(), false, 25 + 20 * r());
  const drops = new Float32Array(n);
  for (let k = 0; k < 8 + Math.floor(r() * 7); k++) {
    const i = Math.floor((0.1 + 0.5 * r() ** 1.3) * sr);
    const a = 0.03 + 0.06 * r() ** 2;
    grain(drops, i, secs(sr, 0.001 + 0.001 * r()), 2, a, r);
    if (r() < 0.5) bubble(out, sr, i + 2, logRand(r, 1200, 3800), a * 0.6, 0.15);
  }
  filt(drops, sr, 'bandpass', 3000, 0.8);
  mix(out, drops);
  filt(out, sr, 'lowpass', 5000, 0.6);
  filt(out, sr, 'highpass', 40, 0.7);
  return finish([out], sr, 0.3, 40);
}

// A paddle of the duck boat's wheel dipping in: a small slap, a few
// bubbles, and drops off the paddle as it lifts.
function paddleRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.3 * sr);
  const out = new Float32Array(n);
  const at = secs(sr, 0.002);
  const sl = new Float32Array(n);
  grain(sl, at, secs(sr, 0.012 + 0.01 * r()), secs(sr, 0.0015), 1, r);
  filt(sl, sr, 'bandpass', 1000 + 300 * r(), 0.8);
  mix(out, sl, 0.5);
  damped(out, sr, at, 170 + 40 * r(), 0.2, 0.01);
  for (let k = 0; k < 2 + Math.floor(r() * 4); k++) bubble(out, sr, at + Math.floor(r() * 0.03 * sr), logRand(r, 400, 1600), 0.1 + 0.2 * r(), 0.08 + 0.12 * r());
  for (let k = 0; k < 3 + Math.floor(r() * 6); k++) bubble(out, sr, Math.floor((0.04 + 0.18 * r()) * sr), logRand(r, 1500, 4000), 0.03 + 0.06 * r(), 0.15);
  filt(out, sr, 'lowpass', 5000, 0.6);
  return finish([out], sr, 0.3, 20);
}

// Wood and rope creaking under load: stick-slip, a train of little slips
// that speeds up or slows down, each ringing the timber's modes.
function creakRender(sr, seed) {
  const r = seeded(seed);
  const dur = 0.35 + 0.5 * r();
  const n = Math.floor((dur + 0.15) * sr);
  const ex = new Float32Array(n);
  const r0 = 30 + 40 * r();
  const r1 = r() < 0.5 ? 60 + 90 * r() : 20 + 15 * r();
  for (let t = 0.01; t < dur;) {
    const u = t / dur;
    ex[Math.floor(t * sr)] += Math.sin(Math.PI * u) ** 0.8 * (0.6 + 0.4 * r());
    t += 1 / (r0 + (r1 - r0) * u + 8 * (r() - 0.5));
  }
  const out = new Float32Array(n);
  for (const [f, q, g] of [[430 + 120 * r(), 14, 1], [950 + 200 * r(), 12, 0.6], [1750 + 300 * r(), 9, 0.3]]) {
    const b = Float32Array.from(ex);
    filt(b, sr, 'bandpass', f, q);
    mix(out, b, g);
  }
  filt(out, sr, 'lowpass', 2800, 0.6);
  filt(out, sr, 'highpass', 150, 0.7);
  return finish([out], sr, 0.5, 30);
}

// A luffing sail's cloth snapping: a tiny crack, a soft low "flup" and a
// rustle.
function flapRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.2 * sr);
  const out = new Float32Array(n);
  const crack = new Float32Array(n);
  grain(crack, secs(sr, 0.002), secs(sr, 0.002 + 0.004 * r()), 2, 1, r);
  filt(crack, sr, 'bandpass', 1300 + 700 * r(), 0.7);
  mix(out, crack, 0.5);
  const flup = new Float32Array(n);
  grain(flup, secs(sr, 0.002), secs(sr, 0.04 + 0.05 * r()), secs(sr, 0.005), 1, r);
  filt(flup, sr, 'lowpass', 350, 0.7);
  mix(out, flup, 1.2);
  const rs = new Float32Array(n);
  for (let k = 0; k < 6 + Math.floor(r() * 7); k++) grain(rs, Math.floor((0.004 + 0.06 * r()) * sr), secs(sr, 0.001 + 0.002 * r()), 2, 0.1 + 0.2 * r(), r);
  filt(rs, sr, 'bandpass', 2500, 0.8);
  mix(out, rs, 0.6);
  filt(out, sr, 'lowpass', 4500, 0.6);
  return finish([out], sr, 0.3, 20);
}

// The sail filling: a soft low whump of air and a rustle of cloth.
function fillRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.6 * sr);
  const out = new Float32Array(n);
  const wh = new Float32Array(n);
  grain(wh, secs(sr, 0.003), secs(sr, 0.09), secs(sr, 0.02), 1, r);
  filt(wh, sr, 'lowpass', 220, 0.7);
  mix(out, wh);
  damped(out, sr, secs(sr, 0.01), 65 + 15 * r(), 0.35, 0.06);
  const cl = new Float32Array(n);
  for (let k = 0; k < 20; k++) grain(cl, Math.floor((0.005 + 0.15 * r()) * sr), secs(sr, 0.001 + 0.003 * r()), 2, 0.1 + 0.15 * r(), r);
  filt(cl, sr, 'bandpass', 1800, 0.8);
  mix(out, cl, 0.8);
  filt(out, sr, 'lowpass', 3000, 0.6);
  return finish([out], sr, 0.5, 30);
}

// a soft wooden tap for buttons
function tapRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.12 * sr);
  const out = new Float32Array(n);
  const f = 690 + 90 * r();
  damped(out, sr, 0, f, 1, 0.02);
  damped(out, sr, 0, f * 2.76, 0.22, 0.006);
  const hit = new Float32Array(n);
  grain(hit, 0, secs(sr, 0.0015), 3, 0.35, r);
  filt(hit, sr, 'lowpass', 2200, 0.7);
  mix(out, hit);
  return finish([out], sr, 0.7, 10);
}

// A speed whoosh: air rushing past, sweeping up then easing back and
// travelling from one side to the other, over a surge of water under the
// hull (bubbly wash whose brightness follows the swell).
function whooshRender(sr, seed) {
  const r = seeded(seed);
  const dur = 1.25;
  const n = Math.floor((dur + 0.05) * sr);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(n);
    const side = (u) => (c === 0 ? 1 - 0.6 * u : 0.4 + 0.6 * u);
    airSweep(out, sr, 0, dur, (u) => (u < 0.45 ? 350 * (1700 / 350) ** (u / 0.45) : 1700 * (900 / 1700) ** ((u - 0.45) / 0.55)), 1, 1, r, (u) => side(u) * (u < 0.3 ? Math.sin((Math.PI / 2) * (u / 0.3)) ** 2 : Math.exp(-(u - 0.3) / 0.25)));
    const water = new Float32Array(n);
    const bq = new Biquad('lowpass', 600, 0.6, sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const e = t < 0.2 ? Math.sin((Math.PI / 2) * (t / 0.2)) ** 2 : Math.exp(-(t - 0.2) / 0.45);
      if ((i & 15) === 0) bq.set('lowpass', 600 + 2400 * e, 0.6, sr);
      water[i] = bq.run((r() * 2 - 1) * e);
    }
    for (let k = 0; k < 60; k++) {
      const t = 0.02 + 0.8 * r() ** 1.3;
      bubble(water, sr, Math.floor(t * sr), logRand(r, 400, 2500), 0.15 * Math.exp(-t / 0.5) * r(), 0.08);
    }
    mix(out, water, 0.35);
    filt(out, sr, 'lowpass', 7000, 0.6);
    chans.push(out);
  }
  return finish(chans, sr, 0.5, 40);
}

// the ring's shimmer: sparse tiny high tinks and a breath of airy hiss
function glintRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(1.2 * sr);
  const chans = [];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(n);
    for (let k = 0; k < 14; k++) {
      const t = 0.01 + 0.8 * r() ** 1.4;
      damped(out, sr, Math.floor(t * sr), logRand(r, 3000, 6500), 0.3 * Math.exp(-t / 0.4) * (0.4 + 0.6 * r()), 0.015 + 0.025 * r(), r() * TAU);
    }
    const air = new Float32Array(n);
    grain(air, 0, Math.floor(0.9 * sr), secs(sr, 0.05), 0.4, r);
    filt(air, sr, 'bandpass', 5200, 0.8);
    mix(out, air);
    chans.push(out);
  }
  return finish(chans, sr, 0.5, 40);
}

// a shell picked up: a tiny hard click
function tickRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.06 * sr);
  const out = new Float32Array(n);
  damped(out, sr, 0, 3200 + 300 * r(), 1, 0.004);
  damped(out, sr, 0, 5100 + 400 * r(), 0.5, 0.002);
  grain(out, 0, secs(sr, 0.0005), 2, 0.4, r);
  return finish([out], sr, 0.2, 10);
}

// The speedboat's horn: a soft two-tone toot-toot (a major third), each a
// mellow harmonic tone settling onto its pitch.
function tootRender(sr) {
  const r = seeded(5);
  const n = Math.floor(0.75 * sr);
  const out = new Float32Array(n);
  for (const [t0, dur, a] of [[0.005, 0.15, 0.85], [0.26, 0.3, 1]]) {
    for (const [f, fa] of [[392, 1], [494, 0.8]]) {
      voiced(out, sr, Math.floor(t0 * sr), dur, { f: (u) => f * (1 - 0.015 * Math.exp((-u * dur) / 0.012)), harm: (k) => (k <= 8 ? 1 / k ** 1.4 : 0), attack: 0.02, release: 0.045, amp: a * fa }, r);
    }
  }
  filt(out, sr, 'lowpass', 1500, 0.7);
  filt(out, sr, 'lowpass', 2200, 0.6);
  return finish([out], sr, 0.5, 20);
}

// The duck boat's horn: a rubber duck's squeaker. Squeezed, air forced past
// the reed sings a bright little note that rises with the squeeze; let go,
// a softer, lower squeak as air rushes back in.
function squeakRender(sr, seed) {
  const r = seeded(seed);
  const n = Math.floor(0.6 * sr);
  const out = new Float32Array(n);
  const f0 = 1000 + 100 * r();
  const harm = (k) => [0, 1, 0.45, 0.25, 0.12, 0.06][k] || 0;
  voiced(out, sr, secs(sr, 0.005), 0.2, { f: (u) => f0 * (1 + 0.16 * Math.sin(Math.PI * u * 0.9)), harm, attack: 0.015, release: 0.04, am: (t) => 1 + 0.08 * Math.sin(TAU * 18 * t) }, r);
  voiced(out, sr, secs(sr, 0.3), 0.13, { f: (u) => 0.78 * f0 + 110 * u, harm, attack: 0.01, release: 0.03, amp: 0.35 }, r);
  const air = new Float32Array(n);
  grain(air, secs(sr, 0.005), secs(sr, 0.2), secs(sr, 0.015), 0.05, r);
  grain(air, secs(sr, 0.3), secs(sr, 0.13), secs(sr, 0.01), 0.03, r);
  filt(air, sr, 'bandpass', 2000, 0.8);
  mix(out, air);
  filt(out, sr, 'lowpass', 4000, 0.6);
  return finish([out], sr, 0.5, 20);
}

// The jet ski's horn: a gentle beep-beep.
function beepRender(sr) {
  const r = seeded(9);
  const n = Math.floor(0.4 * sr);
  const out = new Float32Array(n);
  for (const t0 of [0.005, 0.2]) voiced(out, sr, Math.floor(t0 * sr), 0.11, { f: () => 659, harm: (k) => [0, 1, 0.08, 0.25, 0.04, 0.1][k] || 0, attack: 0.006, release: 0.025 }, r);
  filt(out, sr, 'lowpass', 2200, 0.7);
  return finish([out], sr, 0.5, 20);
}

// Rendered one-shots: renderer, variants, sample rate.
const SHOTS = {
  splash: { render: (sr, s) => splashRender(sr, s, 0.25), variants: 3, sr: 32000 },
  splashBig: { render: (sr, s) => splashRender(sr, s, 1), variants: 3, sr: 32000 },
  slap: { render: slapRender, variants: 6, sr: 24000 },
  takeoff: { render: takeoffRender, variants: 3, sr: 32000 },
  bump: { render: bumpRender, variants: 4, sr: 24000 },
  paddle: { render: paddleRender, variants: 6, sr: 24000 },
  creak: { render: creakRender, variants: 4, sr: 22050 },
  flap: { render: flapRender, variants: 6, sr: 24000 },
  fill: { render: fillRender, variants: 2, sr: 22050 },
  tap: { render: tapRender, variants: 3, sr: 32000 },
  whoosh: { render: whooshRender, variants: 2, sr: 32000 },
  glint: { render: glintRender, variants: 2, sr: 32000 },
  tick: { render: tickRender, variants: 2, sr: 32000 },
  toot: { render: tootRender, variants: 1, sr: 24000 },
  squeak: { render: squeakRender, variants: 2, sr: 24000 },
  beep: { render: beepRender, variants: 1, sr: 24000 },
};

// Loops and noise: renderer and sample rate.
const TEX = {
  white: [(sr) => ({ sr, ch: [periodic(white(3 * sr, seeded(1)), () => {})] }), 32000],
  pink: [(sr) => ({ sr, ch: [removeDC(pinkify(white(3 * sr, seeded(2)), true))] }), 32000],
  gust: [(sr) => gustLoop(sr, 3), 8000],
  flutter: [(sr) => flutterLoop(sr, 4), 8000],
  rush: [(sr) => rushLoop(sr, 5), 16000],
  fizz: [(sr) => fizzLoop(sr, 6), 24000],
  burble: [(sr) => burbleLoop(sr, 7), 16000],
  lap: [(sr) => lapLoop(sr, 8, 'hull'), 22050],
  chuckle: [(sr) => chuckleLoop(sr, 9), 22050],
};

const NOTE_CACHE = 140;

// ------------------------------------------------------------ the engine

export class Audio {
  constructor() {
    this.ctx = null;
    this._muted = load('muted', false) === true;
    this.hidden = false;
    this.offline = false;
    this.dry = false;
    this.clock = null; // tests: a fixed time to schedule at
    this.place = 'lagoon';
    this.boat = 'speedboat';
    this.scene = 'menu';
    this.wantMusic = false;
    this.boostHeld = false;
    this.bufs = {};
    this.shotBufs = {};
    this.lastVariant = {};
    this.notes = new Map();
    this.shots = [];
    this.last = {};
    this.slapTokens = 3;
    this.slapAt = 0;
    this.water = null;
    this.bv = null;
    this.driveAt = -1;
    this.verbs = {};
  }

  get muted() {
    return this._muted;
  }

  // the audio clock (or, in tests, the virtual one)
  now() {
    return this.clock ?? this.ctx.currentTime;
  }

  // Create or resume the context. Call inside every user gesture; cheap.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
      // older iOS only opens the output once something plays in the gesture
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      s.connect(this.ctx.destination);
      s.start();
      if (this._muted) this.sleepT = setTimeout(() => this._muted && this.ctx.suspend().catch(() => {}), 400);
    }
    if (this.ctx.state !== 'running' && !this.hidden && !this._muted && !this.offline) this.ctx.resume().catch(() => {});
  }

  // Build on a context made elsewhere, e.g. an OfflineAudioContext, to render
  // and measure without playing anything. `reverb: false` measures dry.
  attach(ctx, { reverb = true } = {}) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.dry = !reverb;
    this.build();
    return this;
  }

  build() {
    const ctx = this.ctx;
    // master: mute -> no rumble -> gentle glue -> soft top -> limiter -> a
    // soft ceiling at -6 dBFS
    this.master = gainNode(ctx, this.audible() ? MASTER : 0);
    const glue = compressor(ctx, -20, 10, 2.5, 0.008, 0.3);
    const limit = compressor(ctx, -12, 0, 20, 0.002, 0.2);
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = softCeiling();
    ceiling.oversample = '2x';
    this.master
      .connect(filter(ctx, 'highpass', 30, 0.7))
      .connect(glue)
      .connect(gainNode(ctx, GLUE_TRIM))
      .connect(filter(ctx, 'lowpass', 11000, 0.5))
      .connect(limit)
      .connect(gainNode(ctx, LIMIT_TRIM))
      .connect(ceiling)
      .connect(ctx.destination);

    // buses: effects (and the boat) feed `bus`; ambience and music have
    // their own, whose levels follow the scene; each sends to the room
    this.bus = gainNode(ctx, 1);
    this.bus.connect(this.master);
    this.sfx = gainNode(ctx, 1);
    this.sfx.connect(this.bus);
    this.boatBus = gainNode(ctx, 0);
    this.boatBus.connect(this.bus);
    this.ambBus = gainNode(ctx, 0.7);
    this.ambBus.connect(this.master);
    this.musicBus = gainNode(ctx, 0.85);
    this.musicBus.connect(this.master);
    this.verbIn = gainNode(ctx, 1);
    this.sfxSend = gainNode(ctx, 0);
    this.ambSend = gainNode(ctx, 0);
    this.musicSend = gainNode(ctx, 0);
    this.bus.connect(this.sfxSend).connect(this.verbIn);
    this.ambBus.connect(this.ambSend).connect(this.verbIn);
    this.musicBus.connect(this.musicSend).connect(this.verbIn);

    this.waves = {
      engine: engineWave(ctx),
      // the jet pump's core and the duck's motor: soft, few harmonics
      soft: periodicWave(ctx, [1, 0.5, 0.3, 0.15, 0.08]),
      motor: periodicWave(ctx, [1, 0.25, 0.12, 0.05, 0.04]),
    };
    for (const name of ['white', 'pink', 'gust', 'flutter']) this.buf(name);

    this.music = new Music(this);
    this.ambience = new Ambience(this);
    this.applyPlace(this.place, true);
    this.applyScene(true);
    if (this.wantMusic) this.music.start(this.place);
    if (this.offline) this.ambience.set(this.place);
    else {
      this.timer = setInterval(() => this.pump(), 80);
      this.warm();
    }
  }

  audible() {
    return !this._muted && !this.hidden;
  }

  ready() {
    return !!this.ctx && !this._muted && (this.offline || this.ctx.state === 'running');
  }

  // true when `name` last played less than `gap` seconds ago
  limit(name, gap) {
    const now = this.now();
    if (now - (this.last[name] ?? -1) < gap) return true;
    this.last[name] = now;
    return false;
  }

  // ------------------------------------------------------------ buffers

  // a loop or noise buffer, rendered on first use
  buf(name) {
    let b = this.bufs[name];
    if (!b) {
      const [render, sr] = TEX[name];
      b = this.bufs[name] = toBuffer(this.ctx, render(sr));
    }
    return b;
  }

  shotBuf(name, v) {
    const key = name + v;
    let b = this.shotBufs[key];
    if (!b) {
      const S = SHOTS[name];
      b = this.shotBufs[key] = toBuffer(this.ctx, S.render(S.sr, 1000 + v * 7919 + name.length * 31));
    }
    return b;
  }

  // a variation of a one-shot, never the same one twice running
  bank(name) {
    const count = SHOTS[name].variants;
    let v = Math.floor(Math.random() * count);
    if (count > 1 && v === this.lastVariant[name]) v = (v + 1) % count;
    this.lastVariant[name] = v;
    return this.shotBuf(name, v);
  }

  noteBuf(inst, m) {
    const key = inst + m;
    let b = this.notes.get(key);
    if (b) this.notes.delete(key);
    else {
      const sr = NOTE_RATE[inst] || 24000;
      const d = renderNote(sr, inst, m);
      b = this.ctx.createBuffer(1, d.length, sr);
      b.getChannelData(0).set(d);
      if (this.notes.size >= NOTE_CACHE) this.notes.delete(this.notes.keys().next().value);
    }
    this.notes.set(key, b);
    return b;
  }

  // Get sounds ready before they are needed, one small job at a time so
  // the game never stutters: the ambience first, then the boat's textures
  // and one-shots, this place's instruments, then everything else.
  warm() {
    const jobs = [() => this.ambience.set(this.place)];
    for (const name of ['rush', 'fizz', 'lap', 'burble', 'chuckle']) jobs.push(() => this.buf(name));
    for (const name of ['slap', 'splash', 'splashBig', 'takeoff', 'bump', 'whoosh', 'glint', 'tap', 'tick', 'paddle', 'flap', 'creak', 'fill', 'toot', 'squeak', 'beep']) {
      for (let v = 0; v < SHOTS[name].variants; v++) jobs.push(() => this.shotBuf(name, v));
    }
    const places = [this.place, ...Object.keys(ROOMS).filter((p) => p !== this.place)];
    for (const p of places) {
      for (const [inst, m] of styleNotes(p)) jobs.push(() => this.noteBuf(inst, m));
      const base = KEYS[p] + 24;
      for (let i = 0; i < 8; i++) jobs.push(() => this.noteBuf('glassbell', penta(base, i)));
      jobs.push(...this.ambience.jobs(p));
    }
    for (const kind of ['dolphin', 'splashfish']) jobs.push(() => this.ambience.call(kind), () => this.ambience.call(kind));
    const run = () => {
      if (!this.hidden) {
        const job = jobs.shift();
        if (!job) return;
        job();
      }
      this.warmTimer = setTimeout(run, 25);
    };
    this.warmTimer = setTimeout(run, 30);
  }

  // ------------------------------------------------------------ settings

  setMuted(m) {
    this._muted = !!m;
    save('muted', this._muted);
    if (!this.ctx) return;
    this.gainMaster(0.05);
    if (this.offline) return;
    clearTimeout(this.sleepT);
    // asleep while muted: no work at all
    if (this._muted) this.sleepT = setTimeout(() => this._muted && this.ctx.suspend().catch(() => {}), 400);
    else if (!this.hidden) this.ctx.resume().catch(() => {});
  }

  pageHidden(hidden) {
    this.hidden = !!hidden;
    if (!this.ctx || this.offline) return;
    this.gainMaster(this.hidden ? 0.03 : 0.12);
    clearTimeout(this.sleepT);
    if (this.hidden) this.sleepT = setTimeout(() => this.hidden && this.ctx.suspend().catch(() => {}), 150);
    else if (!this._muted) this.ctx.resume().catch(() => {});
  }

  gainMaster(tc) {
    const now = this.now();
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.audible() ? MASTER : 0, now, tc);
  }

  // 'lagoon' | 'lake' | 'canal' | 'bay': crossfade the space, ambience and
  // music over about 2.5 s
  setPlace(id) {
    if (!ROOMS[id]) id = 'lagoon';
    if (id === this.place) return;
    this.place = id;
    if (!this.ctx) return;
    this.applyPlace(id);
    this.ambience.set(id);
    if (this.music.running) this.music.start(id);
  }

  // Crossfade to a place's reverb. Idle rooms are unplugged after the fade
  // so their convolvers cost nothing.
  applyPlace(id, instant = false) {
    const ctx = this.ctx;
    const room = ROOMS[id];
    const t = this.now();
    const tc = instant ? 0.01 : 0.8;
    let v = this.verbs[id];
    if (!v) {
      const conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = renderIR(ctx, room.ir);
      const g = gainNode(ctx, 0);
      conv.connect(g).connect(this.master);
      v = this.verbs[id] = { conv, g, linked: false, unlink: 0 };
    }
    clearTimeout(v.unlink);
    if (!v.linked) {
      this.verbIn.connect(v.conv);
      v.linked = true;
    }
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(1, t, tc);
    for (const [k, o] of Object.entries(this.verbs)) {
      if (k === id) continue;
      o.g.gain.cancelScheduledValues(t);
      o.g.gain.setTargetAtTime(0, t, tc);
      if (o.linked && !this.offline) {
        clearTimeout(o.unlink);
        o.unlink = setTimeout(() => {
          if (this.place === k || !o.linked) return;
          this.verbIn.disconnect(o.conv);
          o.linked = false;
        }, 6000);
      }
    }
    const dry = this.dry ? 0 : 1;
    this.sfxSend.gain.setTargetAtTime(room.sfx * dry, t, tc);
    this.ambSend.gain.setTargetAtTime(room.amb * dry, t, tc);
    this.musicSend.gain.setTargetAtTime(room.music * dry, t, tc);
  }

  // 'menu' | 'playing': on the menu only music and ambience, quieter
  setScene(state) {
    this.scene = state === 'playing' ? 'playing' : 'menu';
    if (this.ctx) this.applyScene();
  }

  applyScene(instant = false) {
    const t = this.now();
    const tc = instant ? 0.01 : 0.35;
    const play = this.scene === 'playing';
    for (const [g, v] of [[this.ambBus.gain, play ? 1 : 0.7], [this.musicBus.gain, play ? 1 : 0.85]]) {
      g.cancelScheduledValues(t);
      g.setTargetAtTime(v, t, tc);
    }
    if (!play) {
      this.boostHeld = false;
      this.boatBus.gain.cancelScheduledValues(t);
      this.boatBus.gain.setTargetAtTime(0, t, 0.25);
    }
  }

  // 'speedboat' | 'sailboat' | 'duck' | 'jetski': the old voice fades and
  // the new one starts with the next drive()
  setBoat(id) {
    if (!BOATS.includes(id)) id = 'speedboat';
    if (id === this.boat) return;
    this.boat = id;
    if (this.bv) {
      this.dropVoice(this.bv, this.now(), 0.2);
      this.bv = null;
    }
  }

  startMusic() {
    this.wantMusic = true;
    if (this.music) this.music.start(this.place);
  }

  // The scheduler, every 80 ms (tests call it with a horizon): music and
  // ambience a moment ahead, and tidying up.
  pump(horizon) {
    const ctx = this.ctx;
    if (!ctx || (!this.offline && ctx.state !== 'running')) return;
    const now = this.now();
    this.music.pump(horizon ?? now + 0.3);
    this.ambience.tick(now, this._muted);
    if (this.offline) return;
    this.shots = this.shots.filter((v) => v.end > now);
    // nobody is driving (the menu, a pause): let the boat voices go
    if ((this.water || this.bv) && now - this.driveAt > 3) {
      if (this.bv) this.dropVoice(this.bv, now);
      if (this.water) this.dropVoice(this.water, now);
      this.bv = this.water = null;
    }
  }

  // Tests: step a virtual clock from `from` to `to` seconds, calling
  // frame(t, dt) each step and pumping the schedulers as the timer would.
  simulate(from, to, frame, step = 1 / 60) {
    let pumpAt = from;
    for (let t = from; t < to; t += step) {
      this.clock = t;
      if (frame) frame(t, step);
      if (t >= pumpAt) {
        this.pump(t + 0.35);
        pumpAt = t + 0.08;
      }
    }
  }

  // ------------------------------------------------------------ playback

  // One rendered buffer: source -> (low-pass) -> level -> pan -> dest, and a
  // share to the room. With a `kind` it counts against the voice budget.
  shot(buf, { t, gain = 1, rate = 1, pan = 0, cutoff = 0, wet = 0, dest = this.sfx, send = this.verbIn, kind = null } = {}) {
    const ctx = this.ctx;
    const now = this.now();
    t = Math.max(t ?? now, now);
    if (kind && !this.admit(kind, gain, now)) return null;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = gainNode(ctx, gain);
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(num(pan), -0.9, 0.9);
    let f = null;
    if (cutoff && cutoff < 15000) {
      f = filter(ctx, 'lowpass', cutoff, 0.6);
      s.connect(f).connect(g);
    } else s.connect(g);
    g.connect(p).connect(dest);
    let w = null;
    if (wet > 0 && !this.dry) {
      w = gainNode(ctx, wet);
      p.connect(w).connect(send);
    }
    s.start(t);
    s.onended = () => {
      g.disconnect();
      p.disconnect();
      if (f) f.disconnect();
      if (w) w.disconnect();
    };
    const v = { kind, src: s, g, t, end: t + buf.duration / rate, level: gain };
    if (kind) this.shots.push(v);
    return v;
  }

  // The budget: when a kind (or everything) is full, the quietest voice as
  // it sounds now gives way, unless the new one is quieter still.
  admit(kind, level, now) {
    const cap = CAP[kind] ?? 6;
    this.shots = this.shots.filter((v) => v.end > now);
    const same = this.shots.filter((v) => v.kind === kind);
    if (same.length < cap && this.shots.length < MAX_SHOTS) return true;
    const pool = same.length >= cap ? same : this.shots;
    let q = null;
    let ql = Infinity;
    for (const v of pool) {
      const l = v.level * Math.exp(-Math.max(0, now - v.t) / 0.4);
      if (l < ql) {
        ql = l;
        q = v;
      }
    }
    if (!q || ql > level) return false;
    q.g.gain.cancelScheduledValues(now);
    q.g.gain.setTargetAtTime(0, now, 0.02);
    try {
      q.src.stop(now + 0.15);
    } catch {
      /* already stopped */
    }
    this.shots.splice(this.shots.indexOf(q), 1);
    return true;
  }

  // A pre-rendered instrument note. With `len` it is released then (an
  // accordion's bellows closing, a string touched).
  note(inst, m, t, vel, pan = 0, dest = this.sfx, len = 0) {
    const ctx = this.ctx;
    const buf = this.noteBuf(inst, Math.round(m));
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = gainNode(ctx, vel);
    const at = Math.max(t, this.now());
    let end = at + buf.duration;
    if (len > 0 && at + len < end) {
      g.gain.setValueAtTime(vel, at + len);
      g.gain.setTargetAtTime(0, at + len, 0.06);
      end = Math.min(end, at + len + 0.5);
    }
    let p = null;
    if (pan) {
      p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -0.9, 0.9);
      s.connect(g).connect(p).connect(dest);
    } else s.connect(g).connect(dest);
    s.start(at);
    s.stop(end);
    s.onended = () => {
      g.disconnect();
      if (p) p.disconnect();
    };
    return s;
  }

  panner(pan, dest) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  // a looping buffer source, started somewhere random in its loop
  loopSrc(buffer, t, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * buffer.duration * 0.9);
    return s;
  }

  // ------------------------------------------------------------ driving

  // Called every frame while playing. Only numbers go in; the voices glide
  // to them. The boat bus has a dead man's handle: if the calls stop (a
  // pause, a lost frame loop), the boat fades out by itself.
  drive(s) {
    if (!this.ctx || !s || this.scene !== 'playing' || !this.ready()) return;
    const now = this.now();
    if (now - this.driveAt < 0.025) return;
    this.driveAt = now;
    if (!this.water) this.water = this.buildWater(now);
    if (!this.bv) this.bv = this.buildBoat(this.boat, now);
    const bg = this.boatBus.gain;
    bg.cancelScheduledValues(now);
    bg.setTargetAtTime(1, now, 0.12);
    bg.setTargetAtTime(0, now + 0.5, 0.2);

    const v = unit(s.speed01);
    const sp = clamp(num(s.speed), 0, 25);
    const boost = Math.max(unit(s.boost01), this.boostHeld ? 1 : 0);
    const air = !!s.airborne;
    const wet = air ? 0 : 1;
    const turn = clamp(num(s.turn), -1, 1);
    const d = { v, sp, boost, air, wet, turn, bank: unit(s.bank), fill: unit(s.sailFill01), luff: unit(s.sailLuff01) };
    const set = (p, x, tc) => p.setTargetAtTime(x, now, tc);
    const W = this.water;
    // in the air the water lets go at once
    const tw = air ? 0.04 : 0.1;
    const hull = HULL[this.boat];
    const hw = hull.water;
    set(W.rushG.gain, K.rush * hw * v ** 1.3 * (1 + 0.35 * Math.abs(turn) * v) * wet, tw);
    set(W.rushLP.frequency, (700 + 4300 * v ** 0.8) * hull.bright, 0.12);
    set(W.wakeG.gain, K.wake * unit(s.wake01) * (air ? 0.5 : 1), 0.2);
    // bow spray is thrown to the outside of a turn
    set(W.sprayG.gain, K.spray * hw * unit(s.spray01) * wet, tw);
    set(W.sprayPan.pan, clamp(-turn * 0.5, -0.6, 0.6), 0.15);
    const wv = clamp(sp / 14, 0, 1.3);
    set(W.windG.gain, K.wind * wv ** 1.6 * (1 + 0.3 * boost), 0.3);
    set(W.windBP.frequency, 280 + 520 * wv, 0.3);
    set(W.lapG.gain, K.lap * (1 - smoothstep(0.04, 0.3, v)) * wet, 0.4);
    this.driveBoat(this.bv, d, now, set);
  }

  // the water every boat makes
  buildWater(now) {
    const ctx = this.ctx;
    const out = gainNode(ctx, 1);
    out.connect(this.boatBus);
    const w = { out, srcs: [] };
    const src = (name, rate, pan, dest) => {
      const s = this.loopSrc(this.buf(name), now, rate);
      s.connect(pan ? this.panner(pan, dest) : dest);
      w.srcs.push(s);
      return s;
    };
    const level = () => {
      const g = gainNode(ctx, 0);
      g.connect(out);
      return g;
    };
    // the hull rush, read twice and spread
    w.rushG = level();
    w.rushLP = filter(ctx, 'lowpass', 1000, 0.5);
    w.rushLP.connect(filter(ctx, 'highpass', 110, 0.6)).connect(w.rushG);
    src('rush', 1, -0.35, w.rushLP);
    src('rush', 0.93, 0.35, w.rushLP);
    // the wake's foam behind
    w.wakeG = level();
    const wl = filter(ctx, 'lowpass', 2600, 0.6);
    wl.connect(filter(ctx, 'highpass', 350, 0.6)).connect(w.wakeG);
    src('fizz', 0.9, -0.15, wl);
    src('fizz', 0.83, 0.15, wl);
    // bow spray
    w.sprayG = gainNode(ctx, 0);
    w.sprayPan = ctx.createStereoPanner();
    w.sprayG.connect(w.sprayPan).connect(out);
    const sh = filter(ctx, 'highpass', 1400, 0.6);
    sh.connect(filter(ctx, 'lowpass', 6500, 0.6)).connect(w.sprayG);
    src('fizz', 1.12, 0, sh);
    // wind past the ears, gusting a little
    w.windG = level();
    w.windBP = filter(ctx, 'bandpass', 400, 0.8);
    const gust = gainNode(ctx, 0.75);
    w.windBP.connect(filter(ctx, 'highpass', 180, 0.7)).connect(filter(ctx, 'lowpass', 1500, 0.6)).connect(gust).connect(w.windG);
    const lfo = this.loopSrc(this.buf('gust'), now, 2.5);
    lfo.connect(gainNode(ctx, 0.25)).connect(gust.gain);
    w.srcs.push(lfo);
    src('pink', 1, -0.6, w.windBP);
    src('pink', 0.97, 0.6, w.windBP);
    // lapping against the hull when slow
    w.lapG = level();
    const ll = filter(ctx, 'lowpass', 2500, 0.6);
    ll.connect(w.lapG);
    src('lap', 1, -0.45, ll);
    src('lap', 1.07, 0.45, ll);
    return w;
  }

  // each boat's own voice
  buildBoat(kind, now) {
    const ctx = this.ctx;
    const out = gainNode(ctx, 0);
    out.gain.setTargetAtTime(1, now, 0.15);
    out.connect(this.boatBus);
    const v = { kind, out, srcs: [], next: {}, side: 1, low: true };
    const src = (name, rate, pan, dest) => {
      const s = this.loopSrc(this.buf(name), now, rate);
      s.connect(pan ? this.panner(pan, dest) : dest);
      v.srcs.push(s);
      return s;
    };
    const osc = (wave, f) => {
      const o = ctx.createOscillator();
      if (typeof wave === 'string') o.type = wave;
      else o.setPeriodicWave(wave);
      o.frequency.value = f;
      o.start(now);
      v.srcs.push(o);
      return o;
    };
    // a slow random wobble on a parameter
    const wobble = (param, depth, rate) => {
      const l = this.loopSrc(this.buf('flutter'), now, rate);
      l.connect(gainNode(ctx, depth)).connect(param);
      v.srcs.push(l);
    };
    const level = (dest = out) => {
      const g = gainNode(ctx, 0);
      g.connect(dest);
      return g;
    };
    if (kind === 'speedboat') {
      v.eng = osc(this.waves.engine, 9);
      wobble(v.eng.detune, 18, 1);
      v.engAM = gainNode(ctx, 0.85);
      wobble(v.engAM.gain, 0.12, 0.7);
      v.engLP = filter(ctx, 'lowpass', 700, 0.7);
      v.motorG = level();
      v.eng.connect(v.engAM).connect(filter(ctx, 'peaking', 170, 1.2, 5)).connect(filter(ctx, 'peaking', 440, 2, 3)).connect(v.engLP);
      v.engLP.connect(filter(ctx, 'highpass', 40, 0.7)).connect(v.motorG);
      // valve and gear clatter, pulsing with the firing
      v.fire = osc('sine', 18);
      const mech = gainNode(ctx, 0.5);
      v.fire.connect(gainNode(ctx, 0.45)).connect(mech.gain);
      const mbp = filter(ctx, 'bandpass', 1300, 0.9);
      src('white', 1, 0, mbp);
      mbp.connect(mech).connect(gainNode(ctx, 0.12)).connect(v.engLP);
      // the exhaust burbling out under water
      v.burbleG = level();
      const bl = filter(ctx, 'lowpass', 900, 0.6);
      bl.connect(v.burbleG);
      v.burble = src('burble', 1, 0, bl);
      // the prop churning behind
      v.washG = level();
      const pl = filter(ctx, 'lowpass', 900, 0.6);
      pl.connect(v.washG);
      src('rush', 0.8, 0, pl);
    } else if (kind === 'jetski') {
      v.jetBP = filter(ctx, 'bandpass', 400, 0.9);
      v.jetLP = filter(ctx, 'lowpass', 1400, 0.6);
      v.jetG = level();
      v.jetBP.connect(v.jetLP).connect(v.jetG);
      src('pink', 1, -0.2, v.jetBP);
      src('pink', 1.05, 0.2, v.jetBP);
      v.core = osc(this.waves.soft, 60);
      wobble(v.core.detune, 12, 1.3);
      v.coreG = level();
      v.core.connect(filter(ctx, 'lowpass', 600, 0.7)).connect(v.coreG);
      v.jsG = level();
      const jl = filter(ctx, 'lowpass', 2000, 0.6);
      jl.connect(filter(ctx, 'highpass', 500, 0.6)).connect(v.jsG);
      src('fizz', 0.85, 0, jl);
      src('rush', 1.1, 0, jl);
    } else if (kind === 'duck') {
      v.whirr = osc(this.waves.motor, 90);
      wobble(v.whirr.detune, 6, 0.8);
      v.whirrG = level();
      v.whirr.connect(filter(ctx, 'lowpass', 900, 0.7)).connect(v.whirrG);
      v.hissG = level();
      const hb = filter(ctx, 'bandpass', 2200, 1.5);
      hb.connect(v.hissG);
      src('white', 1, 0, hb);
      v.churnG = level();
      const cl = filter(ctx, 'lowpass', 900, 0.6);
      cl.connect(v.churnG);
      src('rush', 0.75, 0, cl);
    } else {
      v.chuckG = level();
      const cb = filter(ctx, 'bandpass', 800, 0.5);
      cb.connect(v.chuckG);
      src('chuckle', 1, -0.3, cb);
      src('chuckle', 1.06, 0.3, cb);
      v.sailG = level();
      const sb = filter(ctx, 'bandpass', 420, 0.8);
      sb.connect(filter(ctx, 'lowpass', 1200, 0.6)).connect(v.sailG);
      src('pink', 0.9, 0.2, sb);
      // the cloth fluttering: noise chopped by a fast random flutter
      v.luffG = level();
      const lam = gainNode(ctx, 0.4);
      const lb = filter(ctx, 'bandpass', 1100, 0.8);
      lb.connect(lam).connect(v.luffG);
      src('pink', 1.1, -0.1, lb);
      wobble(lam.gain, 0.6, 1.3);
      v.next.creak = now + rand(1, 3);
    }
    v.next.paddle = now;
    v.next.flap = now;
    return v;
  }

  driveBoat(v, d, now, set) {
    const { v: x, boost, air, wet } = d;
    if (v.kind === 'speedboat') {
      const fire = (18 + 42 * x ** 0.9) * (1 + 0.08 * boost) * (air ? 1.1 : 1);
      const tf = air ? 0.12 : 0.25;
      set(v.eng.frequency, fire / 2, tf);
      set(v.fire.frequency, fire, tf);
      set(v.engLP.frequency, 600 + 900 * x + 250 * boost, 0.2);
      set(v.motorG.gain, K.motor * (0.35 + 0.65 * x) * (1 + 0.25 * boost) * (air ? 0.9 : 1), 0.15);
      set(v.burbleG.gain, K.burble * (1 - 0.7 * x) * wet, 0.1);
      set(v.burble.playbackRate, 0.8 + 0.7 * x, 0.2);
      set(v.washG.gain, K.prop * x * wet * (1 + 0.3 * boost), air ? 0.04 : 0.1);
    } else if (v.kind === 'jetski') {
      const y = x + 0.15 * boost;
      set(v.jetBP.frequency, 300 + 500 * y, 0.2);
      set(v.jetLP.frequency, 800 + 500 * y, 0.2);
      set(v.jetG.gain, K.jet * (0.3 + 0.7 * x) * (1 + 0.25 * boost) * (air ? 0.8 : 1), 0.15);
      set(v.core.frequency, (55 + 95 * x) * (1 + 0.06 * boost) * (air ? 1.12 : 1), air ? 0.12 : 0.25);
      set(v.coreG.gain, K.core * (0.4 + 0.6 * x), 0.15);
      set(v.jsG.gain, K.jetSpray * x * wet, air ? 0.04 : 0.1);
    } else if (v.kind === 'duck') {
      set(v.whirr.frequency, (80 + 140 * x) * (1 + 0.1 * boost) * (air ? 1.1 : 1), 0.2);
      set(v.whirrG.gain, K.whirr * (0.3 + 0.7 * x), 0.15);
      set(v.hissG.gain, K.hiss * x, 0.15);
      set(v.churnG.gain, K.churn * x * wet, air ? 0.04 : 0.12);
      this.paddles(v, Math.min(1.2, x + 0.2 * boost), wet, now);
    } else {
      set(v.chuckG.gain, K.chuckle * x ** 1.1 * wet, air ? 0.04 : 0.15);
      set(v.sailG.gain, K.sailWind * ((0.25 + 0.75 * d.fill) * (0.3 + 0.7 * x) + 0.5 * d.luff), 0.25);
      set(v.luffG.gain, K.luff * d.luff, 0.15);
      this.flaps(v, d.luff, now);
      this.creaks(v, d, now);
      // the sail filling: a soft thump as it goes taut
      if (d.fill < 0.35) v.low = true;
      else if (v.low && d.fill > 0.7) {
        v.low = false;
        if (!this.limit('fill', 1.5)) this.shot(this.bank('fill'), { t: now + 0.01, gain: LV.fill, pan: rand(-0.2, 0.2), dest: this.boatBus });
      }
    }
  }

  // The duck boat's paddle wheel: six paddles a turn, each a little splash,
  // scheduled a moment ahead on the audio clock.
  paddles(v, x, wet, now) {
    const rate = x > 0.03 ? 2.2 + 7 * x : 0;
    if (!rate || !wet) {
      v.next.paddle = Math.max(v.next.paddle, now + 0.05);
      return;
    }
    if (v.next.paddle < now) v.next.paddle = now + 0.01;
    while (v.next.paddle < now + 0.1) {
      v.side = -v.side;
      this.shot(this.bank('paddle'), { t: v.next.paddle, gain: K.paddle * (0.4 + 0.6 * Math.min(1, x)) * rand(0.7, 1), rate: rand(0.9, 1.12), pan: v.side * 0.18, dest: this.boatBus, kind: 'paddle' });
      v.next.paddle += (1 / rate) * rand(0.85, 1.15);
    }
  }

  // A luffing sail: irregular soft snaps of cloth, more the more it luffs.
  flaps(v, luff, now) {
    if (luff < 0.15) {
      v.next.flap = Math.max(v.next.flap, now + 0.1);
      return;
    }
    if (v.next.flap < now) v.next.flap = now + 0.01;
    const rate = 1.5 + 9 * luff;
    while (v.next.flap < now + 0.1) {
      this.shot(this.bank('flap'), { t: v.next.flap, gain: K.flap * luff * rand(0.4, 1), rate: rand(0.85, 1.2), pan: rand(-0.3, 0.3), dest: this.boatBus, kind: 'flap' });
      v.next.flap += clamp(-Math.log(1 - Math.random()) / rate, 0.04, 0.6);
    }
  }

  // the rigging and mast creaking now and then, more when the boat heels
  creaks(v, d, now) {
    if (now < v.next.creak) return;
    const load = Math.min(1, 0.3 + Math.abs(d.turn) + d.bank);
    this.shot(this.bank('creak'), { t: now + 0.02, gain: K.creak * rand(0.5, 1) * load, rate: rand(0.9, 1.1), pan: rand(-0.5, 0.5), dest: this.boatBus, kind: 'creak' });
    v.next.creak = now + rand(2.5, 7) / (0.6 + Math.abs(d.turn) + d.bank);
  }

  // fade a continuous voice out and stop its sources
  dropVoice(v, now, tc = 0.1) {
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setTargetAtTime(0, now, tc);
    for (const s of v.srcs) {
      try {
        s.stop(now + tc * 8);
      } catch {
        /* already stopped */
      }
    }
    if (!this.offline) setTimeout(() => v.out.disconnect(), (tc * 8 + 0.3) * 1000);
  }

  // ------------------------------------------------------------ water events

  // Landing from a hop (or a dolphin splashing down near you).
  splash(strength = 0.6, pan = 0) {
    if (!this.ready()) return;
    const s = unit(strength);
    if (s < 0.02 || this.limit('splash', 0.05)) return;
    const big = s > 0.55;
    this.shot(this.bank(big ? 'splashBig' : 'splash'), { t: this.now() + 0.004, gain: LV.splash * (0.3 + 0.7 * s), rate: rand(0.94, 1.06), pan, cutoff: 2500 + 6000 * s, kind: 'splash' });
  }

  // A small wave slapping the hull; called often at speed, so at most about
  // six a second get through.
  hullSlap(strength = 0.5) {
    if (!this.ready() || this.scene !== 'playing') return;
    const s = unit(strength);
    if (s < 0.02) return;
    const now = this.now();
    this.slapTokens = Math.min(3, this.slapTokens + (now - this.slapAt) * 6);
    this.slapAt = now;
    if (this.slapTokens < 1 || now - (this.last.slap ?? -1) < 0.07) return;
    this.slapTokens -= 1;
    this.last.slap = now;
    const h = HULL[this.boat];
    this.shot(this.bank('slap'), { t: now + rand(0.002, 0.012), gain: LV.slap * h.gain * (0.25 + 0.75 * s ** 1.2), rate: h.rate * rand(0.92, 1.08), pan: rand(-0.35, 0.35), cutoff: h.cut * (0.6 + 0.6 * s), kind: 'slap' });
  }

  // Leaving the water on a hop.
  takeoff(strength = 0.5) {
    if (!this.ready() || this.limit('takeoff', 0.2)) return;
    const s = unit(strength);
    this.shot(this.bank('takeoff'), { t: this.now() + 0.004, gain: LV.takeoff * (0.35 + 0.65 * s), rate: rand(0.95, 1.05), kind: 'splash' });
  }

  // A soft bumper-boat bounce, never a crash.
  bump(strength = 0.5, pan = 0) {
    if (!this.ready()) return;
    const s = unit(strength);
    if (s < 0.02 || this.limit('bump', 0.15)) return;
    const h = HULL[this.boat];
    this.shot(this.bank('bump'), { t: this.now() + 0.003, gain: LV.bump * (0.3 + 0.7 * s), rate: rand(0.93, 1.07) * (this.boat === 'duck' ? 0.85 : 1), pan, cutoff: Math.min(h.cut * 1.6, 1800 + 3500 * s), kind: 'bump' });
  }

  // The short speed whoosh after a ring, or when a boost starts.
  whoosh() {
    if (!this.ready() || this.limit('whoosh', 0.3)) return;
    this.shot(this.bank('whoosh'), { t: this.now() + 0.005, gain: LV.whoosh, rate: rand(0.95, 1.05), kind: 'whoosh' });
  }

  // Big kid boost held or let go: the motor surges (through drive) and a
  // whoosh marks the start.
  boost(on) {
    const was = this.boostHeld;
    this.boostHeld = !!on;
    if (this.boostHeld && !was) this.whoosh();
  }

  // ------------------------------------------------------------ tuned things

  // A sparkle ring: a glass-bell chime stepping up the place's pentatonic
  // scale with each ring in a row, a celesta an octave over it, and a
  // shimmer tail.
  ring(n = 1) {
    if (!this.ready() || this.limit('ring', 0.04)) return;
    const k = Math.max(1, Math.round(num(n) || 1));
    const idx = k <= 10 ? k - 1 : 5 + ((k - 11) % 5);
    const base = KEYS[this.place] + 24;
    const m = penta(base, idx);
    const t = this.now() + 0.005;
    const pan = rand(-0.1, 0.1);
    this.note('glassbell', m, t, LV.ring, pan);
    this.note('celesta', m + 12, t + 0.012, LV.ring * 0.22, pan);
    for (let i = 0; i < 3; i++) this.note('musicbox', penta(base + 12, (idx + 2 + 2 * i) % 7), t + 0.09 + i * 0.07, LV.ring * 0.07 * (1 - 0.2 * i), pan + rand(-0.3, 0.3));
    this.shot(this.bank('glint'), { t: t + 0.02, gain: LV.glint, pan });
  }

  // Passing a course buoy: its bell, and the clapper's softer second
  // strike as the buoy rocks.
  buoy(k = 0) {
    if (!this.ready() || this.limit('buoy', 0.1)) return;
    const i = clamp(Math.round(num(k)), 0, 20) % 8;
    const m = penta(KEYS[this.place] + 12, i + 2);
    const t = this.now() + 0.005;
    const pan = rand(-0.4, 0.4);
    this.note('handbell', m, t, LV.buoy, pan);
    this.note('handbell', m, t + rand(0.22, 0.34), LV.buoy * 0.35, pan);
  }

  // A shell collected: a tiny click and two quick celesta notes up.
  shell() {
    if (!this.ready() || this.limit('shell', 0.05)) return;
    const t = this.now() + 0.004;
    const base = KEYS[this.place] + 24;
    this.shot(this.bank('tick'), { t, gain: LV.tick });
    this.note('celesta', penta(base, 4), t + 0.01, LV.shell);
    this.note('celesta', penta(base, 7), t + 0.075, LV.shell * 1.05);
    this.note('musicbox', penta(base + 12, 4), t + 0.14, LV.shell * 0.3, 0.2);
  }

  // Course start: soft pips on the fifth for 3, 2, 1 and a brighter chord
  // for go.
  countdown(k = 3) {
    if (!this.ready()) return;
    const t = this.now() + 0.005;
    const tonic = KEYS[this.place];
    if (num(k) > 0) {
      this.note('marimba', tonic + 31, t, LV.pip);
      this.note('bell', tonic + 43, t, LV.pip * 0.2);
    } else {
      [36, 40, 43, 48].forEach((iv, i) => this.note('celesta', tonic + iv, t + i * 0.012, LV.go * (i === 3 ? 0.7 : 1), (i - 1.5) * 0.15));
      this.note('marimba', tonic + 36, t, LV.pip * 1.1);
      this.note('bass', tonic, t, LV.go * 1.5);
    }
  }

  // A course finished: a quick run up the chord on the place's lead, a
  // rolled chord and, for a best time, more notes and a sprinkle of bells.
  courseFinish(isBest = false) {
    if (!this.ready()) return;
    const t = this.now() + 0.03;
    const inst = LEADS[this.place];
    const tonic = KEYS[this.place];
    const b = tonic + (inst === 'musicbox' ? 24 : 12);
    const run = isBest ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
    const step = 0.085;
    run.forEach((iv, k) => this.note(inst, b + iv, t + k * step, LV.finish * (0.9 + 0.03 * k), -0.3 + (0.6 * k) / run.length));
    const top = t + run.length * step;
    for (const [iv, dl] of [[12, 0], [16, 0.03], [19, 0.06]]) this.note(inst, b + iv, top + dl, LV.finish * 0.6);
    this.note('bass', tonic, top, LV.finish * 1.2);
    if (isBest) {
      for (let k = 0; k < 5; k++) this.note('bell', penta(tonic + 36, Math.floor(rand(0, 7))), top + 0.12 + k * rand(0.07, 0.11), LV.finish * rand(0.25, 0.4), rand(-0.5, 0.5));
    }
    this.music.duck(0.4, 1.3 + (isBest ? 0.6 : 0));
  }

  // The current boat's soft horn.
  horn() {
    if (!this.ready() || this.limit('horn', 0.6)) return;
    const t = this.now() + 0.005;
    if (this.boat === 'sailboat') {
      // a small brass ship's bell: ding-ding
      this.note('handbell', 86, t, LV.shipbell, 0.1);
      this.note('handbell', 86, t + 0.34, LV.shipbell * 0.85, 0.1);
    } else if (this.boat === 'duck') this.shot(this.bank('squeak'), { t, gain: LV.squeak, rate: rand(0.97, 1.03) });
    else if (this.boat === 'jetski') this.shot(this.bank('beep'), { t, gain: LV.beep });
    else this.shot(this.bank('toot'), { t, gain: LV.toot });
  }

  // ------------------------------------------------------------ animals and interface

  // An animal nearby: 'dolphin' | 'duck' | 'gull' | 'frog' | 'splashfish',
  // `dist` metres away (farther is quieter and darker).
  animal(kind, pan = 0, dist = 10) {
    if (!this.ready() || !CALLS[kind] || !ANIMAL[kind]) return;
    if (this.limit('animal:' + kind, kind === 'frog' ? 0.2 : 0.35)) return;
    const d = Math.max(0, num(dist));
    this.shot(this.ambience.call(kind), { t: this.now() + 0.01, gain: ANIMAL[kind] * distGain(d), rate: rand(0.97, 1.03), pan, cutoff: distCut(d), wet: clamp(0.05 + d / 120, 0, 0.5), kind: 'animal' });
  }

  // a button: a small wooden tap
  click() {
    if (!this.ready() || this.limit('click', 0.03)) return;
    this.shot(this.bank('tap'), { t: this.now() + 0.003, gain: LV.click, rate: rand(0.97, 1.03) });
  }

  // choosing something: two soft marimba notes up a fourth
  select() {
    if (!this.ready() || this.limit('select', 0.05)) return;
    const t = this.now() + 0.005;
    const b = KEYS[this.place] + 24;
    this.note('marimba', penta(b, 3), t, LV.select * 0.85);
    this.note('marimba', penta(b, 5), t + 0.07, LV.select);
  }
}

// Tests: render `seconds` of sound offline. `fn(audio, ctx)` sets things up
// (use audio.simulate() to step time and drive); resolves to the rendered
// AudioBuffer. Nothing is played aloud.
export async function renderOffline(fn, seconds, { sampleRate = 48000, reverb = true } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const a = new Audio();
  a._muted = false;
  a.attach(ctx, { reverb });
  await fn(a, ctx);
  a.clock = null;
  return ctx.startRendering();
}
