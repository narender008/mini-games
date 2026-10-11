// Moonbound audio: the sound recipes, part one (interface, movement, weapons, hits, kills, the
// heroine, magic). Part two, sfx2.js, has the enemies, the bosses and the world.
//
// A recipe is a function (s, r, v) that builds a short graph with the Kit: s.tone / s.noise /
// s.modal / s.fm / s.vox take (at, options) with `at` in seconds from the start of the sound;
// r() is a seeded random number in 0..1 and v the variant number, so each variant of a sound is a
// little different. bank.js renders every recipe (and variant) once into an AudioBuffer with an
// OfflineAudioContext, measures it and scales it to the loudness `tgt` given here (dB, loudest
// 100 ms), so the whole mix is balanced by number. If a sound is wanted before its buffer is
// ready, the very same recipe runs live.
//
// The meta of a sound:
//   dur   seconds of buffer      tgt  loudness target in dB       v    variants (default 2)
//   max   voices at once          gap  min seconds between plays   rev  reverb send 0..1
//   jit   random pitch spread     pri  1 low .. 3 high (kept when voices run out)
//   key   the pitch class (0..11) the sound is written in, if it is tonal: it is moved into the key
//         of the music that is playing; duck [depth 0..1, seconds]: dip the music
//   stereo  the recipe is rendered in two channels (the recipe writes both)
export const BELL = [[1, 1, 1], [2, 0.5, 0.7], [2.76, 0.4, 0.5], [4.07, 0.2, 0.3], [5.4, 0.1, 0.2]];
export const GLASS = [[1, 1, 1], [2.32, 0.45, 0.5], [4.25, 0.25, 0.3], [6.63, 0.12, 0.2]];
export const IRON = [[1, 1, 1], [1.47, 0.8, 0.8], [2.09, 0.7, 0.7], [2.56, 0.5, 0.5], [3.53, 0.4, 0.35], [5.1, 0.25, 0.2]];
export const WOOD = [[1, 1, 1], [2.3, 0.5, 0.6], [3.6, 0.3, 0.35]];
export const CHAIN = [[1, 0.6, 1], [2.31, 0.3, 0.85], [3.9, 0.2, 0.6]];
export const HARP = [[1, 1, 1], [2, 0.3, 0.6], [3, 0.12, 0.4]];

export const bp = (f, q = 1, f1, ft) => ({ t: 'bandpass', f, q, f1, ft });
export const lp = (f, q = 0.707, f1, ft) => ({ t: 'lowpass', f, q, f1, ft });
export const hp = (f, q = 0.707, f1, ft) => ({ t: 'highpass', f, q, f1, ft });

// formant sets (Hz, Q, gain) for the wordless voices
export const FORM = {
  ah: [[780, 9, 1], [1150, 10, 0.5], [2800, 12, 0.18]],
  oh: [[480, 9, 1], [820, 10, 0.45], [2700, 12, 0.1]],
  oo: [[330, 9, 1], [720, 10, 0.3], [2600, 12, 0.06]],
  ee: [[300, 9, 0.8], [2200, 11, 0.6], [3000, 12, 0.25]],
  mew: [[820, 7, 1], [1900, 8, 0.7], [3100, 10, 0.2]],
};

// n pings of glass: random pitch in [lo, hi], spread over `span` seconds, fading with time
function sparkle(s, r, at, n, span, lo, hi, g, tau) {
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    const t0 = at + r() * span;
    const f = lo * Math.pow(hi / lo, r());
    s.tone(t0, { f, a: 0.0008, tau: tau * (0.5 + r()), g: g * (0.45 + 0.55 * r()) * (1 - 0.45 * u), dur: tau * 6 });
  }
}

// a grain of bandpassed noise: the stuff of crunches, shards and clicks
const grain = (s, at, f, q, tau, g, kind = 'white') => s.noise(at, { kind, filt: [bp(f, q)], a: 0.0006, tau, g });

export const SFX = {
  // ------------------------------------------------------------------------- interface
  ui_move: {
    dur: 0.14, tgt: -27, v: 1, max: 2, gap: 0.03, rev: 0.1, jit: 0.02, pri: 1,
    fn(s, r) {
      s.modal(0, { f: 1900, parts: [[1, 1, 1], [2.4, 0.35, 0.65]], tauScale: 0.014, g: 0.8 });
      s.noise(0, { filt: [hp(3200)], tau: 0.004, g: 0.12 });
    },
  },
  ui_select: {
    dur: 1.25, tgt: -22, v: 1, max: 2, gap: 0.05, rev: 0.32, jit: 0, pri: 2, key: 0,
    fn(s) {
      s.modal(0, { f: 1046.5, parts: BELL, tauScale: 0.3, g: 0.8 });
      s.modal(0.075, { f: 1568, parts: [[1, 0.8, 1], [2, 0.35, 0.55], [3, 0.2, 0.35]], tauScale: 0.3, g: 0.7 });
      s.noise(0, { filt: [hp(5000)], tau: 0.01, g: 0.1 });
    },
  },
  ui_back: {
    dur: 0.8, tgt: -26, v: 1, max: 2, gap: 0.05, rev: 0.2, jit: 0, pri: 1, key: 0,
    fn(s) {
      s.modal(0, { f: 784, parts: [[1, 1, 1], [2, 0.3, 0.6], [3, 0.12, 0.4]], tauScale: 0.16, g: 0.7 });
      s.modal(0.075, { f: 523.25, parts: [[1, 1, 1], [2, 0.3, 0.6], [3, 0.12, 0.4]], tauScale: 0.18, g: 0.65 });
    },
  },
  ui_open: {
    dur: 0.5, tgt: -26, v: 2, max: 2, gap: 0.05, rev: 0.12, jit: 0.03, pri: 1,
    fn(s, r) {
      s.noise(0, { kind: 'pink', filt: [bp(1200, 0.9, 4200, 0.22)], env: [[0, 0], [0.05, 0.5], [0.16, 1], [0.3, 0.25], [0.44, 0]], g: 1 });
      for (let i = 0; i < 5; i++) s.noise(0.04 + r() * 0.26, { filt: [hp(4000 + r() * 2000)], tau: 0.004, g: 0.22 });
      s.tone(0.02, { f: 220, tau: 0.03, g: 0.18 });
    },
  },
  ui_deny: {
    dur: 0.36, tgt: -23, v: 1, max: 2, gap: 0.06, rev: 0.06, jit: 0.02, pri: 1,
    fn(s) {
      s.tone(0, { f: 230, f1: 110, ft: 0.04, tau: 0.07, g: 0.9, drive: 1.6 });
      s.noise(0, { filt: [lp(800)], tau: 0.02, g: 0.5 });
      s.tone(0.09, { f: 190, f1: 90, ft: 0.04, tau: 0.07, g: 0.7, drive: 1.6 });
    },
  },

  // ------------------------------------------------------------------------- movement
  step: {
    dur: 0.2, tgt: -33, v: 4, max: 3, gap: 0.08, rev: 0.22, jit: 0.1, pri: 1, sat: 1.5,
    fn(s, r) {
      s.tone(0, { f: 125 * (1 + (r() - 0.5) * 0.4), f1: 75, ft: 0.02, tau: 0.03, g: 0.8, drive: 2 });
      s.noise(0, { kind: 'pink', filt: [lp(1000 * (1 + (r() - 0.5) * 0.5), 0.7, 380, 0.03)], tau: 0.02, g: 0.9 });
      s.noise(0.002, { filt: [hp(2500)], tau: 0.004, g: 0.14 * r() });
    },
  },
  dash: {
    dur: 0.6, tgt: -19, v: 2, max: 2, gap: 0.08, rev: 0.3, jit: 0.03, pri: 2,
    fn(s, r) {
      s.noise(0, { kind: 'pink', filt: [bp(700, 1.1, 5200, 0.22)], env: [[0, 0], [0.04, 0.8], [0.14, 1], [0.3, 0.35], [0.5, 0]], g: 1 });
      s.noise(0.02, { filt: [hp(6500)], env: [[0, 0], [0.03, 0.6], [0.2, 0.15], [0.32, 0]], g: 0.28 });
      for (const f of [2637, 3951, 5274]) s.tone(0.02 + r() * 0.03, { f, f1: f * 0.93, ft: 0.15, a: 0.01, tau: 0.2, g: 0.1 });
      s.tone(0, { f: 180, f1: 90, ft: 0.06, tau: 0.08, g: 0.2, drive: 1.5 });
    },
  },

  // ------------------------------------------------------------------------- Waning Twins
  twins_swing: {
    dur: 0.3, tgt: -20, v: 3, max: 3, gap: 0.04, rev: 0.16, jit: 0.06, pri: 2,
    fn(s, r) {
      s.noise(0, { filt: [bp(2600, 2.2, 6500, 0.12)], env: [[0, 0], [0.03, 1], [0.09, 0.7], [0.2, 0]], g: 1 });
      s.modal(0.01, { f: 2900 * (1 + (r() - 0.5) * 0.1), parts: [[1, 0.5, 1], [1.52, 0.35, 0.85], [2.31, 0.25, 0.7]], tauScale: 0.07, g: 0.22 });
      s.noise(0, { kind: 'pink', filt: [bp(700, 0.8)], tau: 0.06, g: 0.3 });
    },
  },
  twins_heavy: {
    dur: 1.0, tgt: -17, v: 2, max: 2, gap: 0.08, rev: 0.34, jit: 0.04, pri: 3,
    fn(s, r) {
      s.noise(0, { filt: [bp(1800, 2, 7000, 0.14)], env: [[0, 0], [0.03, 1], [0.12, 0.7], [0.22, 0]], g: 0.9 });
      s.noise(0.18, { filt: [bp(7000, 2, 1800, 0.2)], env: [[0, 0], [0.03, 0.9], [0.14, 0.6], [0.3, 0]], g: 0.8 });
      s.modal(0.02, { f: 2400, parts: [[1, 0.6, 1], [1.52, 0.5, 0.85], [2.31, 0.4, 0.7], [3.4, 0.25, 0.55]], tauScale: 0.4, g: 0.34 });
      s.modal(0.2, { f: 2400 * 1.06, parts: [[1, 0.6, 1], [1.52, 0.5, 0.85], [2.31, 0.4, 0.7]], tauScale: 0.35, g: 0.24 });
      s.tone(0, { f: 160, f1: 80, ft: 0.08, tau: 0.12, g: 0.55 });
      for (const f of [4500, 6000]) s.tone(0.05, { f, a: 0.02, tau: 0.4, g: 0.05 });
    },
  },

  // ------------------------------------------------------------------------- Tidecaller staff
  staff_swing: {
    dur: 0.55, tgt: -20, v: 3, max: 2, gap: 0.06, rev: 0.22, jit: 0.05, pri: 2,
    fn(s) {
      s.noise(0, { kind: 'pink', filt: [lp(450, 0.8, 2000, 0.18)], env: [[0, 0], [0.08, 0.7], [0.18, 1], [0.34, 0.4], [0.5, 0]], g: 1 });
      s.tone(0, { f: 130, f1: 80, ft: 0.15, a: 0.05, tau: 0.14, g: 0.6, drive: 1.8 });
      s.noise(0.05, { kind: 'pink', filt: [bp(900, 1.5)], env: [[0, 0], [0.1, 0.5], [0.3, 0]], g: 0.3 });
    },
  },
  staff_heavy: {
    dur: 1.0, tgt: -15, v: 2, max: 2, gap: 0.08, rev: 0.4, jit: 0.04, pri: 3,
    fn(s) {
      s.noise(0, { kind: 'pink', filt: [lp(350, 0.8, 2200, 0.3)], env: [[0, 0], [0.15, 0.6], [0.32, 1], [0.5, 0.5], [0.7, 0]], g: 0.9 });
      s.tone(0.3, { f: 95, f1: 45, ft: 0.1, tau: 0.2, g: 0.9, drive: 2.4 });
      s.modal(0.31, { f: 320, parts: WOOD, tauScale: 0.06, g: 0.5 });
      s.noise(0.32, { filt: [lp(2500)], tau: 0.02, g: 0.5 });
      s.noise(0.1, { kind: 'pink', filt: [bp(3000, 3)], env: [[0, 0], [0.2, 0.5], [0.7, 0]], g: 0.1 });
    },
  },
  moon_bolt: {
    dur: 0.6, tgt: -18, v: 2, max: 4, gap: 0.05, rev: 0.4, jit: 0.04, pri: 2,
    fn(s, r) {
      s.fm(0, { f: 900, f1: 2200, ft: 0.06, ratio: 2, index: 2.5, index1: 0.3, a: 0.003, tau: 0.12, g: 0.6, filt: [hp(400)] });
      s.tone(0, { f: 3300, f1: 4400, ft: 0.1, a: 0.01, tau: 0.25, g: 0.2 });
      s.noise(0, { filt: [bp(5000, 3)], tau: 0.1, g: 0.25 });
      sparkle(s, r, 0.05, 5, 0.3, 2500, 6000, 0.12, 0.1);
      s.tone(0, { f: 200, f1: 120, ft: 0.03, tau: 0.03, g: 0.3 });
    },
  },

  // ------------------------------------------------------------------------- hits
  hit_bone: {
    dur: 0.4, tgt: -12.5, v: 4, max: 5, gap: 0.025, rev: 0.16, jit: 0.07, pri: 3, sat: 2.2,
    fn(s, r) {
      s.noise(0, { filt: [hp(2000)], tau: 0.006, g: 1 });
      s.noise(0, { filt: [bp(2400 * (1 + (r() - 0.5) * 0.3), 1.2, 1500, 0.05)], tau: 0.018, g: 0.9 });
      s.noise(0.012 + r() * 0.01, { filt: [bp(3400 * (1 + (r() - 0.5) * 0.3), 1.5)], tau: 0.009, g: 0.5 });
      s.modal(0, { f: 420 * (1 + (r() - 0.5) * 0.2), parts: [[1, 0.8, 1], [1.52, 0.6, 0.8], [2.8, 0.4, 0.55]], tauScale: 0.05, g: 0.6 });
      s.tone(0, { f: 150 * (1 + (r() - 0.5) * 0.25), f1: 68, ft: 0.03, tau: 0.07, g: 0.9, drive: 2.2 });
      for (let i = 0; i < 7; i++) grain(s, 0.02 + r() * 0.1, 1200 + r() * 2800, 1.5, 0.008 + r() * 0.012, 0.4 * (1 - i * 0.1));
    },
  },
  hit_spirit: {
    dur: 0.7, tgt: -14, v: 3, max: 4, gap: 0.03, rev: 0.55, jit: 0.06, pri: 3,
    fn(s, r) {
      s.noise(0, { kind: 'pink', filt: [bp(900, 0.8)], a: 0.004, tau: 0.045, g: 0.8 });
      s.tone(0.004, { f: 310 * (1 + (r() - 0.5) * 0.1), f1: 285, ft: 0.15, a: 0.004, tau: 0.13, g: 0.5, lfo: { f: 6, d: 20 } });
      s.tone(0.004, { f: 466, f1: 430, ft: 0.15, a: 0.004, tau: 0.12, g: 0.35, lfo: { f: 5, d: 25 } });
      s.noise(0.01, { kind: 'pink', filt: [bp(1400, 6, 600, 0.35)], a: 0.03, tau: 0.12, g: 0.35 });
      s.tone(0, { f: 90, f1: 60, ft: 0.04, tau: 0.08, g: 0.5 });
      for (const f of [2100, 3100]) s.tone(0.01, { f, a: 0.005, tau: 0.2, g: 0.07 });
    },
  },
  hit_armor: {
    dur: 0.8, tgt: -12.5, v: 3, max: 4, gap: 0.03, rev: 0.3, jit: 0.06, pri: 3, sat: 1.8,
    fn(s, r) {
      s.modal(0, { f: 520 * (1 + (r() - 0.5) * 0.12), parts: IRON, tauScale: 0.26, g: 0.8, det: 4 });
      s.noise(0, { filt: [hp(3000)], tau: 0.004, g: 0.8 });
      s.tone(0, { f: 110, f1: 70, ft: 0.03, tau: 0.05, g: 0.8, drive: 1.4 });
      s.noise(0, { filt: [bp(1800, 1)], tau: 0.015, g: 0.5 });
    },
  },
  hit_heavy: {
    dur: 1.0, tgt: -9.5, v: 2, max: 3, gap: 0.04, rev: 0.35, jit: 0.04, pri: 3, sat: 2.5, duck: [0.35, 0.35],
    fn(s, r) {
      s.tone(0, { f: 115, f1: 45, ft: 0.09, tau: 0.2, g: 1.0, drive: 2.5 });
      s.noise(0, { filt: [lp(1100)], tau: 0.06, g: 1.2 });
      s.noise(0, { filt: [hp(1200)], tau: 0.006, g: 0.8 });
      s.modal(0, { f: 180, parts: [[1, 0.8, 1], [1.48, 0.7, 0.75], [2.28, 0.5, 0.55], [3.08, 0.4, 0.45]], tauScale: 0.2, g: 0.6 });
      s.noise(0.01, { kind: 'brown', filt: [lp(200)], env: [[0, 0], [0.04, 1], [0.2, 0.6], [0.55, 0]], g: 0.4 });
      for (let i = 0; i < 4; i++) grain(s, 0.015 + r() * 0.08, 700 + r() * 2500, 1.3, 0.012, 0.3);
    },
  },
  crit: {
    dur: 0.7, tgt: -16, v: 2, max: 3, gap: 0.04, rev: 0.4, jit: 0.03, pri: 3, key: 2,
    fn(s) {
      s.modal(0, { f: 2093, parts: [[1, 0.8, 1], [1.5, 0.5, 0.85], [2, 0.5, 0.7], [2.76, 0.4, 0.5], [4.1, 0.2, 0.35]], tauScale: 0.16, g: 0.6 });
      s.noise(0, { filt: [hp(7000)], tau: 0.03, g: 0.4 });
      s.tone(0, { f: 1500, f1: 5000, ft: 0.03, tau: 0.08, g: 0.25 });
    },
  },

  // ------------------------------------------------------------------------- kills
  shatter_bone: {
    dur: 1.1, tgt: -13.5, v: 3, max: 4, gap: 0.03, rev: 0.5, jit: 0.05, pri: 3, sat: 1.8,
    fn(s, r) {
      for (let k = 0; k < 6; k++) {
        grain(s, [0, 0.012, 0.03, 0.05, 0.075, 0.105][k] + r() * 0.006, (2800 + r() * 900) * (1 - k * 0.07), 1.5, 0.01 + r() * 0.006, 0.8 - k * 0.09);
      }
      s.tone(0, { f: 140, f1: 60, ft: 0.05, tau: 0.08, g: 0.6, drive: 2 });
      s.modal(0, { f: 400, parts: [[1, 0.8, 1], [1.52, 0.6, 0.8], [2.8, 0.4, 0.5]], tauScale: 0.04, g: 0.35 });
      sparkle(s, r, 0.03, 15, 0.55, 1800, 7500, 0.28, 0.2);
      s.noise(0, { filt: [bp(5500, 1.4)], env: [[0, 0], [0.1, 0.4], [0.4, 0.12], [0.85, 0]], g: 0.14 });
      s.tone(0.02, { f: 520, f1: 1040, ft: 0.25, a: 0.05, tau: 0.3, g: 0.09 });
    },
  },
  shatter_spirit: {
    dur: 1.3, tgt: -16, v: 2, max: 3, gap: 0.03, rev: 0.7, jit: 0.04, pri: 3,
    fn(s, r) {
      s.noise(0, { kind: 'pink', filt: [bp(500, 6, 900, 0.5)], env: [[0, 0], [0.12, 0.8], [0.4, 1], [0.9, 0]], g: 1 });
      s.noise(0, { kind: 'pink', filt: [bp(1500, 7, 2300, 0.5)], env: [[0, 0], [0.12, 0.6], [0.4, 0.8], [0.9, 0]], g: 0.8 });
      s.vox(0.02, { fc: [[0, 440], [0.3, 400], [0.9, 250]], form: FORM.oh, form1: FORM.oo, fT: 0.8, a: 0.1, dur: 0.5, rel: 0.5, g: 0.22, vib: [5.5, 25], breath: 0.4 });
      sparkle(s, r, 0.05, 8, 0.7, 2000, 6000, 0.12, 0.2);
      s.tone(0, { f: 100, f1: 60, ft: 0.04, tau: 0.08, g: 0.3 });
    },
  },

  // ------------------------------------------------------------------------- the heroine
  hurt: {
    dur: 0.7, tgt: -13, v: 2, max: 2, gap: 0.1, rev: 0.3, jit: 0.03, pri: 3, sat: 2, duck: [0.2, 0.25],
    fn(s) {
      s.tone(0, { f: 140, f1: 60, ft: 0.04, tau: 0.08, g: 0.7, drive: 2.2 });
      s.noise(0, { filt: [hp(1400)], tau: 0.01, g: 1 });
      s.noise(0, { filt: [lp(900)], tau: 0.05, g: 0.5 });
      s.modal(0.02, { f: 1480, parts: [[1, 0.5, 1], [1.06, 0.45, 1], [2, 0.2, 0.6]], tauScale: 0.4, g: 0.35 });
      s.tone(0.03, { f: 2200, f1: 1400, ft: 0.2, a: 0.01, tau: 0.25, g: 0.1 });
    },
  },
  heartbeat: {
    dur: 0.6, tgt: -21, v: 1, max: 1, gap: 0.2, rev: 0.05, jit: 0, pri: 2, sat: 1.6,
    fn(s) {
      s.tone(0, { f: 82, f1: 52, ft: 0.03, a: 0.006, tau: 0.06, g: 1, drive: 3, filt: [lp(420)] });
      s.tone(0.17, { f: 72, f1: 46, ft: 0.03, a: 0.006, tau: 0.06, g: 0.75, drive: 3, filt: [lp(420)] });
      s.noise(0, { kind: 'brown', filt: [lp(300)], tau: 0.05, g: 0.4 });
      s.noise(0.17, { kind: 'brown', filt: [lp(260)], tau: 0.05, g: 0.3 });
    },
  },
  death: {
    dur: 3.6, tgt: -13, v: 1, max: 1, gap: 0.5, rev: 0.65, jit: 0, pri: 3, key: 2, duck: [0.6, 2.5],
    fn(s, r) {
      s.tone(0.02, { f: 100, f1: 38, ft: 0.3, tau: 0.3, g: 0.8, drive: 2.2 });
      s.noise(0, { filt: [lp(800)], tau: 0.15, g: 0.9 });
      s.noise(0.05, { filt: [bp(2000, 1)], env: [[0, 0], [0.1, 0.5], [0.5, 0.2], [0.9, 0.3], [1.3, 0]], g: 0.2 });
      s.modal(0.05, { f: 330, parts: [[1, 0.6, 1], [2.4, 0.4, 0.75], [3.9, 0.3, 0.5]], tauScale: 0.4, g: 0.2 });
      for (const [f, g] of [[146.8, 0.2], [220, 0.2], [293.7, 0.18], [440, 0.12]]) {
        s.vox(0.4, { f, f1: f * 0.97, ft: 1.5, form: FORM.oh, a: 1.2, dur: 1.0, rel: 1.6, g, vib: [4.8, 14], breath: 0.15, det: [-12, 0, 12] });
      }
      s.noise(0.4, { filt: [hp(4000)], env: [[0, 0], [1.2, 0.3], [2, 0]], g: 0.1 });
      sparkle(s, r, 1.2, 6, 1.6, 1500, 5000, 0.07, 0.4);
    },
  },

  // ------------------------------------------------------------------------- magic
  cast_rune: {
    dur: 1.0, tgt: -22, v: 3, max: 3, gap: 0.06, rev: 0.4, jit: 0.04, pri: 2,
    fn(s, r) {
      s.noise(0, { filt: [bp(1800, 3, 3500, 0.5)], env: [[0, 0], [0.02, 0.8], [0.12, 0.5], [0.14, 0], [0.17, 0.8], [0.28, 0.6], [0.3, 0], [0.34, 0.7], [0.5, 0.4], [0.58, 0]], g: 0.9 });
      for (const f of [1760, 2640]) s.tone(0.28, { f, a: 0.2, tau: 0.12, g: 0.1, dur: 0.7 });
      s.modal(0.5, { f: 2093, parts: [[1, 0.5, 1], [2.7, 0.2, 0.5]], tauScale: 0.12, g: 0.28 });
      sparkle(s, r, 0.3, 4, 0.3, 2500, 5500, 0.08, 0.15);
    },
  },
  rune_burst: {
    dur: 1.5, tgt: -11.5, v: 2, max: 2, gap: 0.08, rev: 0.6, jit: 0.03, pri: 3, sat: 2, duck: [0.35, 0.45],
    fn(s) {
      s.tone(0, { f: 110, f1: 40, ft: 0.12, tau: 0.25, g: 0.9, drive: 2.2 });
      s.noise(0, { filt: [lp(4000, 0.7, 400, 0.5)], env: [[0, 0], [0.01, 1], [0.15, 0.6], [0.6, 0]], g: 0.8 });
      s.noise(0, { kind: 'pink', filt: [bp(3000, 2, 1200, 0.5)], env: [[0, 0], [0.15, 0.35], [0.6, 0.15], [1.1, 0]], g: 0.3 });
      s.modal(0.02, { f: 880, parts: [[1, 0.5, 1], [1.5, 0.4, 0.9], [2, 0.35, 0.75], [3, 0.2, 0.5]], tauScale: 0.8, g: 0.3 });
      s.tone(0.09, { f: 60, f1: 35, ft: 0.1, tau: 0.2, g: 0.5 });
    },
  },
  whirl_spin: {
    dur: 0.9, tgt: -20, v: 2, max: 2, gap: 0.1, rev: 0.3, jit: 0.04, pri: 2,
    fn(s) {
      const tre = s.k.tremolo(s.t, 0.9, 14, 0.6);
      tre.connect(s.out);
      s.noise(0, { kind: 'pink', dest: tre, filt: [bp(400, 1.4, 2800, 0.5)], env: [[0, 0], [0.1, 0.4], [0.45, 1], [0.65, 0.7], [0.8, 0]], g: 1 });
      s.modal(0.05, { f: 3200, parts: [[1, 0.4, 1], [1.5, 0.3, 0.8], [2.2, 0.2, 0.6]], tauScale: 0.5, g: 0.2 });
      s.tone(0, { f: 110, f1: 170, ft: 0.3, a: 0.1, tau: 0.12, g: 0.15, dur: 0.8 });
    },
  },
  crescent_wave: {
    dur: 1.0, tgt: -19, v: 2, max: 3, gap: 0.06, rev: 0.5, jit: 0.04, pri: 2,
    fn(s) {
      s.noise(0, { kind: 'pink', filt: [bp(600, 2, 3500, 0.3)], env: [[0, 0], [0.15, 0.7], [0.3, 1], [0.6, 0.5], [0.9, 0]], g: 1 });
      s.noise(0.3, { kind: 'pink', filt: [bp(3500, 2, 1500, 0.4)], env: [[0, 0], [0.1, 0.5], [0.4, 0]], g: 0.4 });
      s.tone(0, { f: 600, f1: 2400, ft: 0.25, a: 0.05, tau: 0.14, g: 0.18, dur: 0.9 });
      s.tone(0, { f: 1200, f1: 4800, ft: 0.25, a: 0.05, tau: 0.1, g: 0.06, dur: 0.8 });
      s.modal(0.25, { f: 1175, parts: [[1, 0.4, 1], [2.01, 0.3, 0.85], [3.02, 0.2, 0.65]], tauScale: 0.25, g: 0.22 });
      s.tone(0, { f: 140, f1: 80, ft: 0.1, tau: 0.1, g: 0.2, drive: 1.6 });
    },
  },
  blessing_hum: {
    dur: 3.0, tgt: -23, v: 1, max: 2, gap: 0.3, rev: 0.7, jit: 0, pri: 2, key: 2,
    fn(s, r) {
      for (const [f, g] of [[146.8, 0.16], [220, 0.18], [293.7, 0.16], [440, 0.12], [587.3, 0.08]]) {
        s.vox(0, { f, form: FORM.oh, form1: FORM.ah, fT: 1.5, a: 0.8, dur: 1.0, rel: 1.2, g, vib: [4.6, 12], breath: 0.1, det: [-10, 0, 10] });
      }
      s.modal(0.05, { f: 1174.7, parts: GLASS, tauScale: 0.5, g: 0.12 });
      sparkle(s, r, 0.4, 7, 1.8, 1500, 4500, 0.05, 0.4);
    },
  },
};
