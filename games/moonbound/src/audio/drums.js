// Moonbound audio: the percussion of the score, written as sound recipes (see sfx.js) and
// rendered once by the bank: the taiko-like drums, iron clanks and chains, the bone shaker, a
// sub boom and the cymbal swells the stingers use. `tgt` is their loudness relative to each
// other, which sets the balance of the drum kit.
import { IRON, CHAIN, WOOD, bp, lp, hp } from './sfx.js';

const clink = (s, at, f, g, ts = 0.03) => s.modal(at, { f, parts: CHAIN, tauScale: ts, g });

export const DRUMS = {
  // the big taiko: a deep thump with a falling pitch, the ring of the skin and the slap of the stick
  don: {
    dur: 1.9, tgt: -12, v: 2, sat: 2,
    fn(s, r) {
      const f = 62 * (1 + (r() - 0.5) * 0.06);
      s.tone(0, { f: f * 1.55, f1: f, ft: 0.11, tau: 0.34, g: 0.9, drive: 2, a: 0.002 });
      s.modal(0, { f: 128, parts: [[1, 0.6, 1], [1.59, 0.5, 0.8], [2.14, 0.4, 0.62], [2.65, 0.25, 0.45]], tauScale: 0.3, g: 0.75 });
      s.noise(0, { filt: [bp(1700, 1)], tau: 0.015, g: 1 });
      s.noise(0, { kind: 'pink', filt: [lp(600)], tau: 0.05, g: 0.5 });
      s.noise(0.01, { kind: 'brown', filt: [lp(190)], env: [[0, 0], [0.04, 1], [0.35, 0.5], [1.1, 0.12], [1.7, 0]], g: 0.4 });
    },
  },
  // a mid drum, higher and shorter
  don_m: {
    dur: 1.1, tgt: -13.5, v: 2, sat: 1.8,
    fn(s, r) {
      const f = 88 * (1 + (r() - 0.5) * 0.06);
      s.tone(0, { f: f * 1.5, f1: f, ft: 0.07, tau: 0.17, g: 1, drive: 1.3, a: 0.002 });
      s.modal(0, { f: 175, parts: [[1, 0.6, 1], [1.59, 0.45, 0.75], [2.14, 0.3, 0.55]], tauScale: 0.16, g: 0.5 });
      s.noise(0, { filt: [bp(2100, 1)], tau: 0.01, g: 0.75 });
      s.noise(0, { kind: 'pink', filt: [lp(700)], tau: 0.035, g: 0.45 });
    },
  },
  // a small tom-like drum
  don_s: {
    dur: 0.7, tgt: -15, v: 2,
    fn(s, r) {
      const f = 132 * (1 + (r() - 0.5) * 0.06);
      s.tone(0, { f: f * 1.4, f1: f, ft: 0.05, tau: 0.1, g: 1, drive: 1.2, a: 0.002 });
      s.modal(0, { f: 250, parts: [[1, 0.5, 1], [1.59, 0.35, 0.7]], tauScale: 0.1, g: 0.4 });
      s.noise(0, { filt: [bp(2500, 1)], tau: 0.01, g: 0.7 });
    },
  },
  // the hoop of the drum: a dry crack
  ka: {
    dur: 0.35, tgt: -17, v: 3,
    fn(s, r) {
      s.noise(0, { filt: [bp(2300 * (1 + (r() - 0.5) * 0.2), 1.3)], tau: 0.022, g: 0.9 });
      s.modal(0, { f: 480, parts: [[1, 0.6, 1], [1.6, 0.4, 0.8]], tauScale: 0.05, g: 0.4 });
      s.tone(0, { f: 220, f1: 160, ft: 0.02, tau: 0.03, g: 0.4 });
    },
  },
  // a stick on wood
  rim: {
    dur: 0.2, tgt: -21, v: 3,
    fn(s, r) {
      s.modal(0, { f: 900 * (1 + (r() - 0.5) * 0.1), parts: WOOD, tauScale: 0.02, g: 0.7 });
      s.noise(0, { filt: [hp(3000)], tau: 0.004, g: 0.4 });
    },
  },
  // an iron slab struck with a hammer
  clank_lo: {
    dur: 2.2, tgt: -15, v: 2,
    fn(s, r) {
      s.modal(0, { f: 310 * (1 + (r() - 0.5) * 0.04), parts: IRON, tauScale: 0.75, g: 0.6, det: 3 });
      s.noise(0, { filt: [hp(2000)], tau: 0.006, g: 0.6 });
      s.tone(0, { f: 100, f1: 70, ft: 0.03, tau: 0.05, g: 0.5 });
    },
  },
  clank_hi: {
    dur: 1.4, tgt: -18, v: 2,
    fn(s, r) {
      s.modal(0, { f: 640 * (1 + (r() - 0.5) * 0.04), parts: IRON, tauScale: 0.4, g: 0.6, det: 3 });
      s.noise(0, { filt: [hp(3500)], tau: 0.004, g: 0.5 });
    },
  },
  // a length of chain dropped: a cluster of clinks
  chain: {
    dur: 0.8, tgt: -20, v: 3,
    fn(s, r) {
      for (let i = 0; i < 12; i++) {
        const u = r();
        clink(s, u * u * 0.3, 1800 + r() * 3400, 0.15 + r() * 0.25, 0.03);
      }
      s.noise(0, { filt: [hp(5000)], env: [[0, 0], [0.02, 0.4], [0.3, 0.1], [0.4, 0]], g: 0.06 });
    },
  },
  // the bone shaker: dry rattling breath
  shaker: {
    dur: 0.22, tgt: -25, v: 3,
    fn(s, r) {
      s.noise(0, { filt: [hp(5500, 0.8)], env: [[0, 0], [0.018, 0.8], [0.09, 0.2], [0.18, 0]], g: 1 });
      for (let i = 0; i < 3; i++) s.modal(r() * 0.05, { f: 2200 + r() * 2200, parts: WOOD, tauScale: 0.008, g: 0.15 });
    },
  },
  // a sub boom, for the big stingers
  boom: {
    dur: 3.2, tgt: -10, v: 1, sat: 2,
    fn(s) {
      s.tone(0, { f: 98, f1: 34, ft: 0.25, tau: 0.7, g: 1.0, drive: 2.5 });
      s.noise(0, { filt: [lp(2500)], tau: 0.02, g: 0.5 });
      s.noise(0.02, { kind: 'brown', filt: [lp(110)], env: [[0, 0], [0.1, 1], [0.8, 0.6], [2.3, 0.12], [3.0, 0]], g: 0.7 });
    },
  },
  // a crash: a wash of hiss over a ring of inharmonic metal
  crash: {
    dur: 3.4, tgt: -17, v: 1,
    fn(s, r) {
      s.noise(0, { filt: [hp(4800)], env: [[0, 0], [0.004, 1], [0.35, 0.45], [1.5, 0.14], [3.1, 0]], g: 1 });
      s.modal(0, { f: 3100, parts: [[1, 0.4, 1], [1.43, 0.35, 0.9], [1.87, 0.3, 0.8], [2.31, 0.3, 0.7], [2.9, 0.2, 0.6]], tauScale: 1.2, g: 0.3, det: 8 });
    },
  },
  // a reverse swell, for the rises into the big moments
  riser: {
    dur: 2.4, tgt: -20, v: 1,
    fn(s) {
      s.noise(0, { filt: [hp(2500), bp(1500, 0.8, 6500, 2.0)], env: [[0, 0], [0.5, 0.15], [2.0, 1], [2.05, 0]], g: 1 });
      s.noise(0, { kind: 'pink', filt: [lp(300, 0.7, 2500, 2.0)], env: [[0, 0], [2.0, 0.6], [2.05, 0]], g: 0.5 });
    },
  },
};
