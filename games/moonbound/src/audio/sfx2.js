// Moonbound audio: the sound recipes, part two (enemies, bosses, the world). See sfx.js for how a
// recipe and its meta are written.
import { GLASS, IRON, WOOD, CHAIN, HARP, FORM, bp, lp, hp } from './sfx.js';

function sparkle(s, r, at, n, span, lo, hi, g, tau) {
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    s.tone(at + r() * span, { f: lo * Math.pow(hi / lo, r()), a: 0.0008, tau: tau * (0.5 + r()), g: g * (0.45 + 0.55 * r()) * (1 - 0.45 * u), dur: tau * 6 });
  }
}
const grain = (s, at, f, q, tau, g, kind = 'white') => s.noise(at, { kind, filt: [bp(f, q)], a: 0.0006, tau, g });

// a small watery "bloop": a sine that chirps upwards as it dies
const bloop = (s, at, f, g, len = 0.05) => s.tone(at, { f, f1: f * 1.9, ft: len * 0.5, a: 0.003, tau: len * 0.6, g, dur: len * 5 });

// a clink of metal at time `at`
const clink = (s, at, f, g, ts = 0.03) => s.modal(at, { f, parts: CHAIN, tauScale: ts, g });

export const SFX2 = {
  // ------------------------------------------------------------------------- enemies
  bow_draw: {
    dur: 0.8, tgt: -27, v: 2, max: 2, gap: 0.2, rev: 0.12, jit: 0.04, pri: 1,
    fn(s) {
      s.noise(0, { kind: 'pink', filt: [bp(380, 9, 520, 0.6)], env: [[0, 0], [0.05, 0.5], [0.12, 0.25], [0.2, 0.7], [0.28, 0.3], [0.4, 0.8], [0.55, 0.6], [0.68, 0]], g: 0.6 });
      s.tone(0, { type: 'sawtooth', f: 150, f1: 200, ft: 0.5, a: 0.05, tau: 0.15, g: 0.05, filt: [lp(600)], dur: 0.7 });
      s.modal(0, { f: 200, parts: [[1, 0.5, 1]], tauScale: 0.04, g: 0.2 });
    },
  },
  arrow_loose: {
    dur: 0.5, tgt: -19, v: 3, max: 3, gap: 0.05, rev: 0.2, jit: 0.05, pri: 2,
    fn(s, r) {
      const f = 180 * (1 + (r() - 0.5) * 0.12);
      s.modal(0, { f, parts: [[1, 1, 1], [2, 0.5, 0.78], [3, 0.35, 0.55], [4, 0.2, 0.45]], tauScale: 0.09, g: 0.5 });
      s.tone(0, { f: 220, f1: 170, ft: 0.05, tau: 0.1, g: 0.4 });
      s.noise(0.01, { filt: [bp(3500, 1.5, 1800, 0.2)], env: [[0, 0], [0.02, 1], [0.14, 0.3], [0.3, 0]], g: 0.7 });
      s.noise(0, { filt: [lp(900)], tau: 0.02, g: 0.5 });
    },
  },
  arrow_hit: {
    dur: 0.4, tgt: -19.5, v: 3, max: 4, gap: 0.03, rev: 0.12, jit: 0.06, pri: 2,
    fn(s, r) {
      s.tone(0, { f: 190, f1: 100, ft: 0.02, tau: 0.045, g: 1, drive: 1.3 });
      s.modal(0, { f: 520 * (1 + (r() - 0.5) * 0.2), parts: [[1, 0.6, 1], [2.7, 0.3, 0.65]], tauScale: 0.03, g: 0.4 });
      s.noise(0, { filt: [lp(1500)], tau: 0.012, g: 0.6 });
      s.tone(0.005, { type: 'triangle', f: 420, tau: 0.08, g: 0.14, lfo: { f: 40, d: 80 } });
    },
  },
  skitter: {
    dur: 0.55, tgt: -27, v: 4, max: 2, gap: 0.1, rev: 0.2, jit: 0.08, pri: 1,
    fn(s, r) {
      let t0 = 0;
      for (let i = 0; i < 8; i++) {
        grain(s, t0, 2200 + r() * 2000, 3, 0.006, 0.5 + r() * 0.4);
        s.tone(t0, { f: 3000 + r() * 2500, tau: 0.004, g: 0.2, dur: 0.03 });
        if (i % 2 === 0) grain(s, t0 + 0.012, 2800 + r() * 1500, 3, 0.005, 0.35);
        t0 += 0.03 + r() * 0.035;
      }
      s.noise(0, { filt: [hp(5000)], env: [[0, 0], [0.03, 0.5], [0.4, 0.3], [0.5, 0]], g: 0.07 });
    },
  },
  leap: {
    dur: 0.5, tgt: -22, v: 2, max: 3, gap: 0.08, rev: 0.2, jit: 0.05, pri: 2,
    fn(s, r) {
      s.noise(0, { kind: 'pink', filt: [bp(500, 1, 2800, 0.25)], env: [[0, 0], [0.06, 0.8], [0.2, 1], [0.4, 0]], g: 0.9 });
      for (let i = 0; i < 4; i++) grain(s, r() * 0.1, 2500 + r() * 2000, 3, 0.006, 0.4);
      s.tone(0, { f: 160, f1: 90, ft: 0.04, tau: 0.05, g: 0.25, drive: 1.6 });
    },
  },
  wail: {
    dur: 1.0, tgt: -21, v: 3, max: 2, gap: 0.12, rev: 0.75, jit: 0.07, pri: 2,
    fn(s, r) {
      const f = 330 * (1 + (r() - 0.5) * 0.2);
      s.vox(0, { fc: [[0, f * 0.9], [0.15, f], [0.7, f * 0.74]], form: FORM.oo, form1: FORM.ah, fT: 0.4, a: 0.12, dur: 0.35, rel: 0.45, g: 0.9, vib: [5.2, 22], breath: 0.3, det: [-12, 0, 12] });
      s.noise(0, { kind: 'pink', filt: [bp(1500, 5, 800, 0.8)], env: [[0, 0], [0.2, 0.3], [0.8, 0]], g: 0.18 });
    },
  },
  orb_fire: {
    dur: 0.55, tgt: -21, v: 2, max: 4, gap: 0.05, rev: 0.45, jit: 0.05, pri: 2,
    fn(s) {
      s.fm(0, { f: 300, f1: 700, ft: 0.1, ratio: 1.5, index: 3, index1: 0.5, a: 0.004, tau: 0.15, g: 0.6, filt: [lp(2500)] });
      s.noise(0, { kind: 'pink', filt: [bp(900, 2, 2400, 0.25)], env: [[0, 0], [0.03, 0.7], [0.25, 0.2], [0.4, 0]], g: 0.45 });
      s.tone(0.02, { f: 2400, f1: 1800, ft: 0.2, a: 0.01, tau: 0.15, g: 0.08 });
      s.tone(0, { f: 120, f1: 70, ft: 0.04, tau: 0.06, g: 0.35 });
    },
  },
  orb_hit: {
    dur: 0.5, tgt: -20, v: 3, max: 4, gap: 0.04, rev: 0.4, jit: 0.06, pri: 2,
    fn(s, r) {
      s.noise(0, { filt: [lp(3000, 0.7, 500, 0.1)], tau: 0.05, g: 0.8 });
      s.tone(0, { f: 650, f1: 230, ft: 0.05, tau: 0.09, g: 0.8 });
      s.modal(0, { f: 1100, parts: [[1, 0.3, 1], [2.4, 0.2, 0.75]], tauScale: 0.2, g: 0.3 });
      sparkle(s, r, 0.02, 4, 0.2, 2000, 5000, 0.12, 0.1);
    },
  },
  pyre_burst: {
    dur: 1.2, tgt: -14, v: 2, max: 2, gap: 0.08, rev: 0.45, jit: 0.05, pri: 3, sat: 1.8,
    fn(s, r) {
      s.noise(0, { kind: 'pink', filt: [lp(3500, 0.7, 400, 0.5)], env: [[0, 0], [0.02, 1], [0.2, 0.7], [0.6, 0.2], [0.95, 0]], g: 1 });
      s.tone(0, { f: 100, f1: 45, ft: 0.1, tau: 0.2, g: 0.6, drive: 2.2 });
      for (let i = 0; i < 14; i++) s.noise(0.05 + r() * 0.75, { filt: [hp(2000)], tau: 0.006 + r() * 0.01, g: 0.28 * (1 - i / 18) });
      s.tone(0.02, { f: 900, f1: 600, ft: 0.3, a: 0.02, tau: 0.4, g: 0.05 });
    },
  },
  spear_thrust: {
    dur: 0.35, tgt: -19, v: 3, max: 3, gap: 0.05, rev: 0.12, jit: 0.05, pri: 2,
    fn(s) {
      s.noise(0, { filt: [bp(1500, 1.8, 5500, 0.07)], env: [[0, 0], [0.02, 1], [0.1, 0.4], [0.22, 0]], g: 1 });
      s.modal(0, { f: 3100, parts: [[1, 0.5, 1], [2.4, 0.3, 0.8]], tauScale: 0.05, g: 0.15 });
      s.tone(0, { f: 180, f1: 110, ft: 0.03, tau: 0.04, g: 0.35 });
    },
  },
  shield_bash: {
    dur: 0.7, tgt: -14, v: 2, max: 2, gap: 0.06, rev: 0.3, jit: 0.05, pri: 3, sat: 2,
    fn(s) {
      s.tone(0, { f: 130, f1: 70, ft: 0.03, tau: 0.1, g: 0.9, drive: 2.2 });
      s.modal(0, { f: 420, parts: IRON, tauScale: 0.2, g: 0.6, det: 3 });
      s.modal(0, { f: 210, parts: WOOD, tauScale: 0.08, g: 0.5 });
      s.noise(0, { filt: [lp(2000)], tau: 0.015, g: 0.6 });
    },
  },
  spikes: {
    dur: 0.55, tgt: -17, v: 2, max: 3, gap: 0.06, rev: 0.25, jit: 0.05, pri: 2,
    fn(s, r) {
      s.noise(0, { filt: [bp(3500, 2, 7500, 0.08)], env: [[0, 0], [0.01, 1], [0.08, 0.5], [0.14, 0]], g: 0.6 });
      for (const [at, f] of [[0.08, 1400], [0.105, 1850], [0.13, 1150]]) {
        s.modal(at, { f: f * (1 + (r() - 0.5) * 0.1), parts: [[1, 0.8, 1], [2.2, 0.6, 0.75], [3.7, 0.4, 0.5]], tauScale: 0.02, g: 0.5 });
      }
      s.noise(0, { filt: [lp(1500)], tau: 0.06, g: 0.35 });
      s.tone(0, { f: 120, f1: 70, ft: 0.03, tau: 0.04, g: 0.5 });
    },
  },
  trap_arrow: {
    dur: 0.45, tgt: -21, v: 2, max: 3, gap: 0.05, rev: 0.2, jit: 0.05, pri: 2,
    fn(s) {
      s.modal(0, { f: 900, parts: [[1, 0.8, 1], [2.9, 0.5, 0.65]], tauScale: 0.012, g: 0.5 });
      s.noise(0.01, { kind: 'pink', filt: [bp(4500, 6, 2500, 0.3)], env: [[0, 0], [0.02, 1], [0.2, 0.3], [0.35, 0]], g: 0.35 });
      s.tone(0, { f: 300, f1: 240, ft: 0.06, tau: 0.1, g: 0.2 });
      s.noise(0.01, { filt: [hp(3000)], env: [[0, 0], [0.02, 1], [0.12, 0]], g: 0.4 });
    },
  },
  telegraph: {
    dur: 0.25, tgt: -30, v: 1, max: 2, gap: 0.1, rev: 0.1, jit: 0, pri: 1,
    fn(s) {
      s.modal(0, { f: 1250, parts: [[1, 0.8, 1], [1.5, 0.35, 0.8]], tauScale: 0.03, g: 0.6 });
      s.tone(0.06, { f: 400, f1: 300, ft: 0.02, tau: 0.02, g: 0.2 });
      s.modal(0.09, { f: 1650, parts: [[1, 0.8, 1], [1.5, 0.35, 0.8]], tauScale: 0.03, g: 0.45 });
    },
  },

  // ------------------------------------------------------------------------- bosses
  slam: {
    dur: 2.2, tgt: -8, v: 2, max: 2, gap: 0.1, rev: 0.6, jit: 0.03, pri: 3, sat: 2.5, duck: [0.5, 0.8],
    fn(s, r) {
      s.tone(0, { f: 85, f1: 30, ft: 0.25, tau: 0.4, g: 1.0, drive: 2.6 });
      s.noise(0, { filt: [lp(4000)], tau: 0.015, g: 0.9 });
      s.noise(0, { kind: 'pink', filt: [lp(900)], tau: 0.07, g: 1 });
      s.modal(0.005, { f: 140, parts: [[1, 0.8, 1], [1.6, 0.5, 0.75], [2.4, 0.4, 0.6]], tauScale: 0.2, g: 0.3 });
      for (let i = 0; i < 20; i++) {
        const u = r();
        grain(s, 0.08 + u * u * 0.85, 400 + r() * 2100, 1.2, 0.03 + r() * 0.05, 0.25 + 0.35 * (1 - u), 'pink');
      }
      s.noise(0.02, { kind: 'brown', filt: [lp(150)], env: [[0, 0], [0.05, 1], [0.5, 0.7], [1.4, 0.2], [2.0, 0]], g: 0.7 });
    },
  },
  chain_sweep: {
    dur: 1.1, tgt: -15, v: 2, max: 2, gap: 0.1, rev: 0.4, jit: 0.04, pri: 3,
    fn(s, r) {
      for (let i = 0; i < 36; i++) {
        const u = r();
        const at = 0.12 + 0.62 * (0.5 - 0.5 * Math.cos(Math.PI * u));
        clink(s, at, 2200 + r() * 3000, 0.1 + 0.2 * r(), 0.035);
      }
      s.noise(0, { kind: 'pink', filt: [bp(400, 1, 2000, 0.35)], env: [[0, 0], [0.1, 0.5], [0.35, 1], [0.65, 0.4], [0.95, 0]], g: 0.9 });
      s.tone(0, { f: 90, f1: 60, ft: 0.3, a: 0.1, tau: 0.25, g: 0.25, drive: 1.6 });
    },
  },
  roar: {
    dur: 2.2, tgt: -9.5, v: 2, max: 1, gap: 0.4, rev: 0.6, jit: 0.04, pri: 3, sat: 1.6, duck: [0.45, 1.6],
    fn(s, r) {
      const tre = s.k.tremolo(s.t, 2.2, 28, 0.8);
      const sh = s.k.shaper(3);
      tre.connect(sh);
      sh.connect(s.out);
      const f = 70 * (1 + (r() - 0.5) * 0.1);
      s.tone(0, { type: 'sawtooth', f, f1: f * 0.7, ft: 0.8, a: 0.15, hold: 1.0, tau: 0.4, g: 0.55, dest: tre, filt: [lp(400, 3, 2400, 0.5)], dur: 2.1 });
      s.tone(0, { type: 'sawtooth', f: f * 1.013, f1: f * 0.71, ft: 0.8, a: 0.15, hold: 1.0, tau: 0.4, g: 0.5, dest: tre, filt: [lp(400, 3, 2400, 0.5)], dur: 2.1 });
      s.noise(0, { kind: 'pink', filt: [bp(600, 1.2, 1100, 0.8)], env: [[0, 0], [0.2, 0.7], [1.1, 0.6], [1.9, 0]], g: 0.9, dest: tre });
      s.tone(0, { f: 45, a: 0.2, hold: 1.0, tau: 0.5, g: 0.35, dur: 2.1 });
    },
  },
  scythe: {
    dur: 1.0, tgt: -17, v: 2, max: 2, gap: 0.08, rev: 0.3, jit: 0.04, pri: 3,
    fn(s) {
      s.noise(0, { filt: [bp(5500, 1.6, 1600, 0.5)], env: [[0, 0], [0.12, 0.8], [0.3, 1], [0.6, 0.35], [0.88, 0]], g: 0.8 });
      s.modal(0.1, { f: 1800, parts: [[1, 0.3, 1], [1.52, 0.25, 0.9], [2.3, 0.2, 0.8]], tauScale: 0.5, g: 0.12 });
      s.tone(0, { f: 130, f1: 80, ft: 0.2, a: 0.06, tau: 0.15, g: 0.2, drive: 1.6 });
    },
  },
  wing_beat: {
    dur: 0.8, tgt: -19, v: 3, max: 2, gap: 0.12, rev: 0.35, jit: 0.05, pri: 2,
    fn(s) {
      s.noise(0, { kind: 'pink', filt: [lp(400, 0.8, 1500, 0.08)], env: [[0, 0], [0.04, 1], [0.16, 0.4], [0.3, 0]], g: 1 });
      s.noise(0.28, { kind: 'pink', filt: [lp(400, 0.8, 1300, 0.08)], env: [[0, 0], [0.04, 0.7], [0.14, 0.3], [0.26, 0]], g: 0.7 });
      s.noise(0, { filt: [hp(3000)], env: [[0, 0], [0.05, 0.4], [0.3, 0.1], [0.5, 0]], g: 0.12 });
      s.tone(0.03, { f: 90, f1: 55, ft: 0.05, tau: 0.1, g: 0.3, drive: 1.8 });
      s.tone(0.3, { f: 85, f1: 52, ft: 0.05, tau: 0.1, g: 0.2, drive: 1.8 });
    },
  },
  dive_impact: {
    dur: 1.8, tgt: -8, v: 2, max: 2, gap: 0.1, rev: 0.6, jit: 0.03, pri: 3, sat: 2.5, duck: [0.5, 0.8],
    fn(s, r) {
      s.tone(0, { f: 105, f1: 36, ft: 0.18, tau: 0.3, g: 1.0, drive: 2.6 });
      s.noise(0, { filt: [hp(1200)], tau: 0.01, g: 1 });
      s.noise(0, { kind: 'pink', filt: [lp(1000)], tau: 0.07, g: 0.9 });
      s.modal(0, { f: 250, parts: IRON, tauScale: 0.35, g: 0.45 });
      sparkle(s, r, 0.02, 10, 0.4, 2000, 7000, 0.25, 0.15);
      for (let i = 0; i < 10; i++) grain(s, 0.05 + r() * 0.6, 500 + r() * 2000, 1.2, 0.04, 0.2, 'pink');
      s.noise(0, { kind: 'pink', filt: [lp(2500, 0.7, 150, 0.6)], env: [[0, 0], [0.01, 1], [0.4, 0.5], [1.1, 0]], g: 0.7 });
      s.noise(0.2, { kind: 'pink', filt: [bp(1200, 1)], env: [[0, 0], [0.3, 0.3], [0.9, 0]], g: 0.2 });
    },
  },
  boss_charge: {
    dur: 1.4, tgt: -15, v: 1, max: 1, gap: 0.3, rev: 0.4, jit: 0.02, pri: 3,
    fn(s, r) {
      s.noise(0, { kind: 'brown', filt: [lp(200, 1, 2000, 1.0)], env: [[0, 0], [0.3, 0.5], [1.0, 1], [1.25, 0]], g: 1 });
      s.tone(0, { f: 45, f1: 95, ft: 0.8, a: 0.2, hold: 0.6, tau: 0.5, g: 0.5, drive: 2.2, dur: 1.3 });
      const tre = s.k.tremolo(s.t, 1.3, 22, 0.8);
      tre.connect(s.out);
      s.tone(0, { type: 'sawtooth', f: 80, f1: 130, ft: 0.7, a: 0.15, hold: 0.7, tau: 0.3, g: 0.5, dest: tre, filt: [lp(900)], dur: 1.3 });
      for (let i = 0; i < 8; i++) clink(s, r() * 0.35, 2000 + r() * 3000, 0.12, 0.03);
    },
  },

  // ------------------------------------------------------------------------- the world
  door_open: {
    dur: 2.8, tgt: -13, v: 1, max: 1, gap: 0.3, rev: 0.6, jit: 0, pri: 3, key: 9,
    fn(s, r) {
      const tre = s.k.tremolo(s.t, 2.6, 7, 0.5);
      tre.connect(s.out);
      s.noise(0, { kind: 'brown', dest: tre, filt: [lp(300, 0.8, 180, 2.4)], env: [[0, 0], [0.2, 0.8], [1.6, 1], [2.3, 0.2], [2.6, 0]], g: 0.9 });
      s.noise(0, { kind: 'pink', dest: tre, filt: [bp(700, 4)], env: [[0, 0], [0.3, 0.5], [1.7, 0.6], [2.4, 0]], g: 0.25 });
      for (const [f, at] of [[220, 0.1], [330, 0.25], [440, 0.4], [660, 0.55]]) s.tone(at, { f, a: 0.5, hold: 0.6, tau: 0.8, g: 0.12, dur: 2.6 });
      s.modal(1.3, { f: 1318.5, parts: [[1, 0.5, 1], [1.5, 0.4, 0.9], [2, 0.3, 0.7]], tauScale: 0.4, g: 0.22 });
      s.tone(1.9, { f: 70, f1: 35, ft: 0.12, tau: 0.2, g: 0.9, drive: 1.3 });
      s.noise(1.9, { kind: 'pink', filt: [lp(900)], tau: 0.15, g: 0.4 });
      sparkle(s, r, 1.2, 5, 1.3, 1500, 4000, 0.05, 0.3);
    },
  },
  door_sealed: {
    dur: 0.8, tgt: -17, v: 2, max: 2, gap: 0.15, rev: 0.3, jit: 0.04, pri: 2,
    fn(s, r) {
      s.tone(0, { f: 110, f1: 55, ft: 0.04, tau: 0.09, g: 1, drive: 1.4 });
      for (let i = 0; i < 6; i++) clink(s, 0.05 + r() * 0.22, 2000 + r() * 2500, 0.2, 0.03);
      s.tone(0.03, { type: 'sawtooth', f: 330, f1: 210, ft: 0.25, a: 0.02, tau: 0.25, g: 0.2, filt: [lp(800)] });
      s.tone(0.03, { type: 'sawtooth', f: 349, f1: 220, ft: 0.25, a: 0.02, tau: 0.25, g: 0.15, filt: [lp(800)] });
      s.modal(0.02, { f: 1500, parts: [[1, 0.8, 1], [2.7, 0.4, 0.8]], tauScale: 0.012, g: 0.4 });
    },
  },
  reward_appear: {
    dur: 1.8, tgt: -20, v: 1, max: 2, gap: 0.2, rev: 0.55, jit: 0, pri: 2, key: 2,
    fn(s, r) {
      [587.3, 698.5, 880, 1046.5, 1174.7].forEach((f, i) => s.modal(i * 0.08, { f, parts: HARP, tauScale: 0.6, g: 0.3 + i * 0.04 }));
      s.noise(0, { filt: [hp(6000)], env: [[0, 0], [0.3, 0.3], [1.0, 0.1], [1.5, 0]], g: 0.1 });
      for (const f of [293.7, 440]) s.tone(0, { type: 'triangle', f, a: 0.4, tau: 0.5, g: 0.1, dur: 1.7 });
      sparkle(s, r, 0.3, 6, 1.0, 2000, 6000, 0.06, 0.3);
    },
  },
  pickup_silver: {
    dur: 0.55, tgt: -19, v: 3, max: 4, gap: 0.02, rev: 0.25, jit: 0.04, pri: 2,
    fn(s, r) {
      const f = 3150 * (1 + (r() - 0.5) * 0.1);
      s.modal(0, { f, parts: [[1, 0.7, 1], [1.34, 0.5, 0.8], [2.1, 0.4, 0.65], [3.4, 0.2, 0.4]], tauScale: 0.12, g: 0.5 });
      s.modal(0.05, { f: f * 1.5, parts: [[1, 0.7, 1], [1.34, 0.5, 0.8], [2.1, 0.4, 0.65]], tauScale: 0.1, g: 0.4 });
      s.noise(0, { filt: [hp(6000)], tau: 0.004, g: 0.2 });
      s.modal(0, { f: 1200, parts: [[1, 0.5, 1]], tauScale: 0.05, g: 0.15 });
    },
  },
  pickup_shard: {
    dur: 1.3, tgt: -18, v: 2, max: 3, gap: 0.04, rev: 0.5, jit: 0.03, pri: 2,
    fn(s, r) {
      s.modal(0, { f: 1865 * (1 + (r() - 0.5) * 0.05), parts: GLASS, tauScale: 0.3, g: 0.6 });
      s.noise(0, { filt: [hp(7000)], tau: 0.03, g: 0.2 });
      sparkle(s, r, 0.04, 6, 0.5, 2500, 7000, 0.12, 0.2);
      s.tone(0, { f: 3730, a: 0.01, tau: 0.15, g: 0.12 });
    },
  },
  pickup_heartroot: {
    dur: 1.4, tgt: -20, v: 1, max: 2, gap: 0.2, rev: 0.45, jit: 0.02, pri: 2, key: 9,
    fn(s, r) {
      for (const f of [220, 330, 440]) s.tone(0, { f, a: 0.12, tau: 0.5, g: 0.25, dur: 1.3 });
      s.tone(0, { f: 90, f1: 60, ft: 0.05, tau: 0.06, g: 0.6 });
      s.tone(0.16, { f: 80, f1: 55, ft: 0.05, tau: 0.06, g: 0.4 });
      s.modal(0.12, { f: 659, parts: [[1, 0.5, 1], [2, 0.2, 0.7]], tauScale: 0.6, g: 0.25 });
      sparkle(s, r, 0.1, 4, 0.5, 1500, 3500, 0.08, 0.2);
    },
  },
  fountain_heal: {
    dur: 2.0, tgt: -20, v: 1, max: 2, gap: 0.3, rev: 0.55, jit: 0, pri: 2, key: 9,
    fn(s, r) {
      for (let i = 0; i < 12; i++) bloop(s, r() * 0.9, 600 + r() * 1200, 0.12 + r() * 0.1, 0.04 + r() * 0.03);
      [440, 523.3, 659.3, 880].forEach((f, i) => s.modal(0.1 + i * 0.15, { f, parts: HARP, tauScale: 0.7, g: 0.3 }));
      for (const f of [880, 1320]) s.tone(0.3, { f, a: 0.4, tau: 0.5, g: 0.07, dur: 1.8 });
      s.noise(0.2, { filt: [bp(4000, 2)], env: [[0, 0], [0.4, 0.5], [1.4, 0]], g: 0.08 });
    },
  },
  shop_buy: {
    dur: 0.9, tgt: -20, v: 2, max: 2, gap: 0.08, rev: 0.3, jit: 0.03, pri: 2,
    fn(s, r) {
      for (let i = 0; i < 3; i++) s.modal(i * 0.06, { f: 2900 * (1 + (r() - 0.5) * 0.08) * (1 + i * 0.12), parts: [[1, 0.7, 1], [1.34, 0.5, 0.8], [2.1, 0.4, 0.6]], tauScale: 0.1, g: 0.4 });
      s.tone(0, { f: 320, f1: 200, ft: 0.03, tau: 0.03, g: 0.4 });
      s.modal(0.16, { f: 1046.5, parts: [[1, 0.6, 1], [2.01, 0.3, 0.7], [2.76, 0.2, 0.55]], tauScale: 0.35, g: 0.3 });
      s.modal(0.24, { f: 1568, parts: [[1, 0.6, 1], [2.01, 0.3, 0.7]], tauScale: 0.35, g: 0.25 });
    },
  },
  cauldron_upgrade: {
    dur: 2.8, tgt: -15, v: 1, max: 1, gap: 0.3, rev: 0.6, jit: 0, pri: 3, key: 9,
    fn(s, r) {
      for (let i = 0; i < 40; i++) {
        const u = Math.pow(r(), 0.7);
        bloop(s, u * 1.25, 150 + r() * 350, 0.14 + 0.1 * u, 0.04 + r() * 0.03);
      }
      s.noise(0, { kind: 'pink', filt: [bp(300, 1.2, 3500, 1.2)], env: [[0, 0], [1.0, 0.7], [1.25, 0]], g: 0.7 });
      s.tone(0, { f: 55, f1: 110, ft: 0.8, a: 0.5, hold: 0.4, tau: 0.4, g: 0.3, drive: 1.6, dur: 1.8 });
      s.modal(1.15, { f: 880, parts: [[1, 0.8, 1], [1.5, 0.5, 0.9], [2, 0.45, 0.8], [3.01, 0.25, 0.6]], tauScale: 1.1, g: 0.45 });
      s.modal(1.2, { f: 1760, parts: [[1, 0.6, 1], [2.01, 0.2, 0.6]], tauScale: 0.8, g: 0.25 });
      sparkle(s, r, 1.2, 8, 0.8, 1800, 6000, 0.1, 0.3);
    },
  },
  gate_roots: {
    dur: 2.7, tgt: -14, v: 1, max: 1, gap: 0.3, rev: 0.5, jit: 0, pri: 3,
    fn(s, r) {
      [[0, 300, 700, 0.55], [0.45, 350, 600, 0.5], [0.95, 280, 760, 0.7], [1.4, 400, 520, 0.6]].forEach(([at, f0, f1, len]) => {
        s.noise(at, { kind: 'pink', filt: [bp(f0, 12, f1, len)], env: [[0, 0], [0.05, 0.6], [0.15, 0.3], [0.25, 0.8], [0.4, 0.4], [len, 0]], g: 0.3 });
      });
      const tre = s.k.tremolo(s.t, 2.3, 9, 0.6);
      tre.connect(s.out);
      s.noise(0, { kind: 'brown', dest: tre, filt: [lp(500)], env: [[0, 0], [0.3, 0.8], [1.7, 0.9], [2.2, 0]], g: 0.7 });
      s.noise(0, { kind: 'pink', dest: tre, filt: [bp(600, 1.5, 900, 2.0)], env: [[0, 0], [0.3, 0.6], [1.7, 0.7], [2.2, 0]], g: 0.35 });
      for (let i = 0; i < 5; i++) s.modal(0.1 + r() * 1.7, { f: 300 + r() * 600, parts: WOOD, tauScale: 0.015, g: 0.25 });
      s.tone(2.0, { f: 70, f1: 40, ft: 0.12, tau: 0.15, g: 0.8 });
      s.noise(2.0, { kind: 'pink', filt: [lp(800)], tau: 0.2, g: 0.35 });
    },
  },
  urn_break: {
    dur: 1.0, tgt: -17, v: 3, max: 3, gap: 0.04, rev: 0.3, jit: 0.06, pri: 2,
    fn(s, r) {
      s.noise(0, { filt: [hp(1500)], tau: 0.008, g: 0.9 });
      s.tone(0, { f: 180, f1: 90, ft: 0.03, tau: 0.04, g: 0.7 });
      s.modal(0, { f: 520, parts: [[1, 0.4, 1], [2.2, 0.3, 0.8]], tauScale: 0.05, g: 0.25 });
      for (let i = 0; i < 14; i++) {
        const u = r();
        s.modal(0.02 + u * u * 0.5, { f: 1800 + r() * 3400, parts: [[1, 0.6, 1], [1.6, 0.4, 0.8], [2.5, 0.25, 0.6]], tauScale: 0.03, g: 0.1 + 0.25 * r() });
      }
      for (let i = 0; i < 3; i++) s.modal(0.5 + r() * 0.3, { f: 1500 + r() * 1500, parts: [[1, 0.6, 1]], tauScale: 0.025, g: 0.07 });
    },
  },
  dummy_hit: {
    dur: 0.4, tgt: -18, v: 3, max: 3, gap: 0.03, rev: 0.12, jit: 0.07, pri: 2,
    fn(s, r) {
      s.noise(0, { kind: 'pink', filt: [lp(1600, 0.7, 450, 0.1)], tau: 0.045, g: 1 });
      s.tone(0, { f: 190, f1: 100, ft: 0.03, tau: 0.05, g: 0.8, drive: 2 });
      s.modal(0, { f: 240 * (1 + (r() - 0.5) * 0.2), parts: [[1, 0.6, 1], [2.76, 0.3, 0.65]], tauScale: 0.06, g: 0.6 });
      s.noise(0, { kind: 'pink', filt: [bp(3000, 1)], env: [[0, 0], [0.03, 0.5], [0.2, 0.1], [0.3, 0]], g: 0.2 });
    },
  },
  cat_purr: {
    dur: 1.8, tgt: -28, v: 2, max: 1, gap: 0.2, rev: 0.12, jit: 0.04, pri: 1,
    fn(s, r) {
      const tre = s.k.tremolo(s.t, 1.7, 24 + r() * 3, 0.9);
      tre.connect(s.out);
      s.noise(0, { kind: 'brown', dest: tre, filt: [bp(120, 1.1)], env: [[0, 0], [0.25, 1], [1.2, 0.9], [1.7, 0]], g: 0.9 });
      s.noise(0, { kind: 'pink', dest: tre, filt: [bp(1000, 0.8)], env: [[0, 0], [0.25, 1], [1.2, 0.9], [1.7, 0]], g: 0.2 });
      s.tone(0, { f: 52, a: 0.25, hold: 0.9, tau: 0.3, g: 0.12, dest: tre, dur: 1.7 });
      s.noise(0, { kind: 'pink', dest: tre, filt: [bp(450, 0.9)], env: [[0, 0], [0.25, 1], [1.2, 0.9], [1.7, 0]], g: 0.4 });
    },
  },
  cat_mew: {
    dur: 0.65, tgt: -24, v: 3, max: 1, gap: 0.3, rev: 0.2, jit: 0.07, pri: 1,
    fn(s, r) {
      const f = 560 * (1 + (r() - 0.5) * 0.2);
      s.vox(0, { fc: [[0, f], [0.12, f * 1.55], [0.45, f * 1.1]], form: FORM.ee, form1: FORM.mew, fT: 0.3, a: 0.04, dur: 0.3, rel: 0.2, g: 0.9, vib: [6, 20], breath: 0.15, det: [-6, 6] });
    },
  },
  wisp_chime: {
    dur: 1.6, tgt: -27, v: 2, max: 3, gap: 0.1, rev: 0.7, jit: 0.04, pri: 1,
    fn(s, r) {
      const f = 2093 * (1 + (r() - 0.5) * 0.08);
      s.modal(0, { f, parts: [[1, 0.7, 1], [2, 0.2, 0.65], [2.99, 0.1, 0.55]], tauScale: 0.35, g: 0.5, det: 6 });
      s.modal(0.01, { f: f * 1.003, parts: [[1, 0.5, 1]], tauScale: 0.35, g: 0.4 });
      s.noise(0, { filt: [hp(8000)], env: [[0, 0], [0.08, 0.25], [0.6, 0]], g: 0.05 });
    },
  },
};
