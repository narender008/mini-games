// Moonbound audio: the looping sounds (whirling blades, bubbling cauldron, fountain, soul fire,
// wind, the void's hum, the boss's charge). Each is rendered by bank.js into a buffer that joins
// itself without a seam: the recipe builds a signal that is exactly periodic in `len` seconds
// (noise tables that loop at len, oscillators and LFOs whose frequencies are whole cycles per
// loop, events that are laid down again one loop later), the bank renders a run-in plus one
// period and keeps the period.
//
// A recipe is fn(c, r): c.out[0] (and c.out[1] for stereo) are the outputs;
//   c.noise(kind, seed) a started looping noise source      c.osc(type, f) an oscillator, f snapped to whole cycles
//   c.lfo(param, cycles, depth) a sine of `cycles` per loop added to a param
//   c.ev(phase, fn(t))  run fn at the loop phase (seconds) and a loop later, so tails wrap round
//   c.kit               the Kit, for noise bursts and tones   c.gain(v), c.filt(type, f, q)
import { bp, hp } from './sfx.js';

export const LOOPS = {
  // spinning blades: a swish at each pass, a low whoomp, a thin metallic sheen
  whirl: {
    len: 0.8, ch: 1, tgt: -22, rev: 0.1,
    fn(c) {
      const rot = 7; // passes per loop: 8.75 Hz
      const out = c.out[0];
      const sw = c.noise('pink', 1);
      const f = c.filt('bandpass', 1600, 1.3);
      c.lfo(f.frequency, rot, 900);
      const am = c.gain(0.62);
      c.lfo(am.gain, rot, 0.45);
      c.lfo(am.gain, rot * 2, 0.15);
      const g1 = c.gain(0.9);
      sw.connect(f); f.connect(am); am.connect(g1); g1.connect(out);
      const lo = c.noise('brown', 2);
      const lf = c.filt('lowpass', 380, 0.7);
      const lam = c.gain(0.5);
      c.lfo(lam.gain, rot, 0.4);
      const g2 = c.gain(0.55);
      lo.connect(lf); lf.connect(lam); lam.connect(g2); g2.connect(out);
      for (const [fq, g] of [[2400, 0.05], [3610, 0.04], [5210, 0.03]]) {
        const o = c.osc('sine', fq);
        const a = c.gain(g * 0.5);
        c.lfo(a.gain, rot, g * 0.5);
        o.connect(a); a.connect(out);
      }
      const rb = c.osc('sine', 70);
      const ra = c.gain(0.08);
      c.lfo(ra.gain, rot, 0.06);
      rb.connect(ra); ra.connect(out);
    },
  },

  // a cauldron on a low flame: a soft simmer and unhurried bubbles
  cauldron: {
    len: 4, ch: 1, tgt: -30, rev: 0.15,
    fn(c, r) {
      const out = c.out[0];
      const sim = c.noise('brown', 3);
      const lf = c.filt('lowpass', 380, 0.7);
      const am = c.gain(0.7);
      c.lfo(am.gain, 2, 0.25);
      c.lfo(am.gain, 5, 0.1);
      const g = c.gain(0.5);
      sim.connect(lf); lf.connect(am); am.connect(g); g.connect(out);
      const hs = c.noise('pink', 4);
      const hf = c.filt('bandpass', 900, 0.9);
      const hg = c.gain(0.08);
      c.lfo(hg.gain, 3, 0.04);
      hs.connect(hf); hf.connect(hg); hg.connect(out);
      for (let i = 0; i < 22; i++) {
        const f0 = 160 + r() * 360;
        const len = 0.04 + r() * 0.05;
        const g0 = 0.15 + r() * 0.25;
        c.ev(r() * 4, (t) => c.kit.tone(out, t, { f: f0, f1: f0 * (1.6 + r() * 0.6), ft: len * 0.5, a: 0.004, tau: len * 0.6, g: g0, dur: len * 5 }));
      }
      for (let i = 0; i < 4; i++) {
        const f0 = 100 + r() * 100;
        c.ev(r() * 4, (t) => c.kit.tone(out, t, { f: f0, f1: f0 * 2, ft: 0.05, a: 0.005, tau: 0.08, g: 0.4, dur: 0.5 }));
      }
    },
  },

  // a stone fountain: a bright hiss of falling water and a thousand tiny drops
  fountain: {
    len: 5, ch: 1, tgt: -30, rev: 0.3,
    fn(c, r) {
      const out = c.out[0];
      const w = c.noise('pink', 5);
      const f = c.filt('bandpass', 3000, 0.6);
      const am = c.gain(0.7);
      c.lfo(am.gain, 3, 0.25);
      c.lfo(am.gain, 8, 0.1);
      const g = c.gain(0.2);
      w.connect(f); f.connect(am); am.connect(g); g.connect(out);
      const h = c.noise('white', 6);
      const hf = c.filt('highpass', 6500, 0.7);
      const hg = c.gain(0.03);
      h.connect(hf); hf.connect(hg); hg.connect(out);
      for (let i = 0; i < 200; i++) {
        const f0 = 1200 + r() * 3000;
        const len = 0.012 + r() * 0.018;
        const g0 = 0.03 + r() * 0.06;
        c.ev(r() * 5, (t) => c.kit.tone(out, t, { f: f0, f1: f0 * 1.8, ft: len * 0.5, a: 0.002, tau: len * 0.6, g: g0, dur: len * 5 }));
      }
      for (let i = 0; i < 8; i++) {
        const f0 = 700 + r() * 600;
        c.ev(r() * 5, (t) => c.kit.tone(out, t, { f: f0, f1: f0 * 1.5, ft: 0.03, a: 0.003, tau: 0.05, g: 0.1, dur: 0.3 }));
      }
    },
  },

  // cold soul-fire: a thin airy roar, sparse glassy crackles and a faint ghostly shimmer
  soulfire: {
    len: 6, ch: 1, tgt: -32, rev: 0.25,
    fn(c, r) {
      const out = c.out[0];
      const w = c.noise('pink', 7);
      const f = c.filt('bandpass', 1300, 0.5);
      const am = c.gain(0.7);
      c.lfo(am.gain, 2, 0.3);
      c.lfo(am.gain, 7, 0.12);
      const g = c.gain(0.16);
      w.connect(f); f.connect(am); am.connect(g); g.connect(out);
      const h = c.noise('white', 8);
      const hf = c.filt('highpass', 5500, 0.7);
      const hg = c.gain(0.02);
      h.connect(hf); hf.connect(hg); hg.connect(out);
      for (let i = 0; i < 70; i++) {
        const gg = 0.15 + r() * r() * 0.8;
        const tau = 0.003 + r() * 0.009;
        const fc = 2200 + r() * 3500;
        c.ev(r() * 6, (t) => {
          c.kit.noise(out, t, { filt: [hp(fc, 0.8)], a: 0.0005, tau, g: gg });
          if (gg > 0.5) c.kit.noise(out, t + 0.012 + tau, { filt: [bp(fc * 0.7, 2)], a: 0.0005, tau, g: gg * 0.5 });
        });
      }
      for (const [fq, g2] of [[702, 0.012], [1053, 0.01], [1404, 0.008]]) {
        const o = c.osc('sine', fq);
        const a = c.gain(g2 * 0.5);
        c.lfo(a.gain, 1 + ((fq / 351) | 0), g2 * 0.5);
        o.connect(a); a.connect(out);
      }
    },
  },

  // wind over the ramparts: stereo, wandering band of air, gusts, a thin whistle
  wind: {
    len: 12, ch: 2, tgt: -27, rev: 0.2,
    fn(c) {
      for (let ch = 0; ch < 2; ch++) {
        const out = c.out[ch];
        const w = c.noise('pink', 10 + ch);
        const f = c.filt('bandpass', 520 + ch * 60, 1.3);
        c.lfo(f.frequency, 3 + ch, 190);
        c.lfo(f.frequency, 7 - ch, 90);
        const gust = c.gain(0.55);
        c.lfo(gust.gain, 2 + ch, 0.3);
        c.lfo(gust.gain, 5, 0.15);
        const g = c.gain(0.9);
        w.connect(f); f.connect(gust); gust.connect(g); g.connect(out);
        const lo = c.noise('brown', 20 + ch);
        const lf = c.filt('lowpass', 140, 0.7);
        const lg = c.gain(0.4);
        c.lfo(lg.gain, 2 + ch, 0.2);
        lo.connect(lf); lf.connect(lg); lg.connect(out);
        const ws = c.noise('pink', 30 + ch);
        const wf = c.filt('bandpass', 1150 + ch * 230, 28);
        c.lfo(wf.frequency, 1 + ch, 220);
        c.lfo(wf.frequency, 4, 60);
        const wg = c.gain(0.05);
        c.lfo(wg.gain, 1, 0.04);
        c.lfo(wg.gain, 3 + ch, 0.01);
        ws.connect(wf); wf.connect(wg); wg.connect(out);
      }
    },
  },

  // the void: sub tones that beat very slowly, a rumble of air, a faint high shimmer
  void_hum: {
    len: 8, ch: 1, tgt: -25, rev: 0.3,
    fn(c) {
      const out = c.out[0];
      for (const [fq, g] of [[41, 0.5], [41.125, 0.5], [61.5, 0.3], [82.25, 0.18]]) {
        const o = c.osc('sine', fq);
        const a = c.gain(g);
        o.connect(a); a.connect(out);
      }
      const t3 = c.osc('triangle', 123);
      const t3g = c.gain(0.06);
      c.lfo(t3g.gain, 1, 0.04);
      t3.connect(t3g); t3g.connect(out);
      const rb = c.noise('brown', 40);
      const rf = c.filt('lowpass', 90, 0.7);
      const rg = c.gain(0.45);
      c.lfo(rg.gain, 1, 0.2);
      rb.connect(rf); rf.connect(rg); rg.connect(out);
      const ns = c.noise('pink', 41);
      const nf = c.filt('bandpass', 300, 8);
      c.lfo(nf.frequency, 1, 90);
      const ng = c.gain(0.05);
      c.lfo(ng.gain, 2, 0.03);
      ns.connect(nf); nf.connect(ng); ng.connect(out);
      for (const [fq, g] of [[1230, 0.006], [1847, 0.005]]) {
        const o = c.osc('sine', fq);
        const a = c.gain(g * 0.5);
        c.lfo(a.gain, 3, g * 0.5);
        o.connect(a); a.connect(out);
      }
    },
  },

  // a boss gathering itself to charge: a galloping rumble with a saw growl under it
  charge: {
    len: 1, ch: 1, tgt: -21, rev: 0.2,
    fn(c) {
      const out = c.out[0];
      const rb = c.noise('brown', 50);
      const rf = c.filt('lowpass', 220, 0.8);
      const am = c.gain(0.55);
      c.lfo(am.gain, 11, 0.4);
      const g = c.gain(0.9);
      rb.connect(rf); rf.connect(am); am.connect(g); g.connect(out);
      const s = c.osc('sawtooth', 50);
      const sf = c.filt('lowpass', 320, 1.5);
      const sa = c.gain(0.2);
      c.lfo(sa.gain, 11, 0.12);
      const sg = c.gain(0.4);
      s.connect(sf); sf.connect(sa); sa.connect(sg); sg.connect(out);
      const ns = c.noise('pink', 51);
      const nf = c.filt('bandpass', 700, 2);
      const na = c.gain(0.07);
      c.lfo(na.gain, 22, 0.05);
      ns.connect(nf); nf.connect(na); na.connect(out);
    },
  },
};
