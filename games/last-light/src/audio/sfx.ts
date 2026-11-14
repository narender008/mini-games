// The sound-effect synth table: one recipe per Sfx name, each a few layered synthesis voices
// built on a Group (see dsp.ts). Times inside a recipe are relative to the voice start.
//
// Each entry also carries its voice rules: `max` simultaneous, minimum `gap` between starts,
// priority for global voice stealing, approximate length, reverb send and random pitch variation.
// SFX_NAMES lists the table's keys so the tests can check every Sfx name has a recipe.

import type { Sfx } from './types';
import type { Group } from './dsp';
import { mtof } from './dsp';
import type { MoteSequencer } from './limiter';

export interface SfxEnv { now: number; mote: MoteSequencer }

export interface SfxDef {
  fn: (g: Group, x: SfxEnv) => void;
  /** Most simultaneous voices of this sound. */
  max: number;
  /** Minimum seconds between starts. */
  gap: number;
  /** Priority for global voice stealing: 0 expendable, 1 normal, 2 important. */
  prio: number;
  /** Approximate length in seconds (voice bookkeeping; the voice frees itself when it really ends). */
  len: number;
  /** Output gain (recipes peak around 0.2..0.6 on their own, so this ranges up to ~2). */
  vol: number;
  /** Reverb send, 0..1. */
  wet: number;
  /** Random pitch spread, as a fraction (0.04 = up to 4 % up or down). */
  vary: number;
}

const r = (a: number, b: number): number => a + Math.random() * (b - a);
const D = (semis: number): number => mtof(62 + semis); // relative to D4

// Reusable layers -------------------------------------------------------------------------------

/** Low pitched thump: the body of every impact. */
function thump(g: Group, f: number, f2: number, d: number, peak: number, at = 0): void {
  g.tone({ type: 'sine', f, f2, glide: d * 0.6, d, peak, at, a: 0.002 });
}

/** Bell / celesta: a few inharmonic sine partials with quick upper decay. */
function bell(g: Group, f: number, d: number, peak: number, at = 0, bright = 1): void {
  g.tone({ f, d, peak, at, a: 0.002 });
  g.tone({ f: f * 2.0, d: d * 0.55, peak: peak * 0.35 * bright, at, a: 0.002 });
  g.tone({ f: f * 3.01, d: d * 0.3, peak: peak * 0.18 * bright, at, a: 0.001 });
  g.tone({ f: f * 5.43, d: d * 0.12, peak: peak * 0.08 * bright, at, a: 0.001 });
}

/** Glassy FM chime, slightly metallic (ratio 3.5). */
function chime(g: Group, f: number, d: number, peak: number, at = 0): void {
  g.fm({ f, ratio: 3.5, index: 1.4, index2: 0.05, d, peak, at, a: 0.002 });
  g.tone({ f: f * 2, d: d * 0.4, peak: peak * 0.2, at });
}

/** Stone debris: a handful of tiny filtered clicks spread over `spread` seconds. */
function debris(g: Group, n: number, spread: number, peak: number, at = 0, f = 2200): void {
  for (let i = 0; i < n; i++) {
    g.noiseBurst({ at: at + Math.random() * spread, d: r(0.015, 0.05), peak: peak * r(0.4, 1), type: 'bandpass', f: f * r(0.5, 1.6), q: 3 });
  }
}

/** Rattle: amplitude-modulated tone, the core of the enemy warnings. */
function rattle(g: Group, type: OscillatorType, f: number, f2: number, dur: number, rate: number, peak: number, cutoff: number): void {
  const lp = g.filter('lowpass', cutoff, 2);
  const trem = g.node(g.ctx.createGain());
  trem.gain.value = 0.55;
  trem.connect(lp);
  g.tone({ type, f, f2, glide: dur, a: dur * 0.85, d: 0.08, peak, dest: trem });
  g.lfo(trem.gain, rate, 0.45, 0, dur + 0.1, 'square');
}

// The table ------------------------------------------------------------------------------------

const def = (fn: SfxDef['fn'], o: Partial<Omit<SfxDef, 'fn'>> = {}): SfxDef => ({
  fn, max: 4, gap: 0.03, prio: 1, len: 0.5, vol: 0.6, wet: 0.15, vary: 0.04, ...o,
});

export const SFX: Record<Sfx, SfxDef> = {
  // Player melee ---------------------------------------------------------------------------------
  swing: def((g) => {
    g.noiseBurst({ a: 0.035, d: 0.14, peak: 0.55, type: 'bandpass', f: 700, f2: 3200, sweep: 0.12, q: 1.4 });
    g.noiseBurst({ a: 0.02, d: 0.08, peak: 0.12, type: 'highpass', f: 6000, at: 0.02 });
    // metallic shimmer of the lantern blade
    g.tone({ f: 2350 * r(0.97, 1.03), d: 0.16, peak: 0.035, at: 0.03, a: 0.02 });
    g.tone({ f: 3530 * r(0.97, 1.03), d: 0.12, peak: 0.022, at: 0.035, a: 0.02 });
  }, { max: 3, gap: 0.05, len: 0.25, vol: 1.26, wet: 0.12, vary: 0.07 }),

  swingHeavy: def((g) => {
    g.noiseBurst({ a: 0.06, d: 0.24, peak: 0.6, type: 'bandpass', f: 320, f2: 1700, sweep: 0.22, q: 1.1 });
    g.noiseBurst({ a: 0.05, d: 0.12, peak: 0.12, type: 'highpass', f: 4500, at: 0.04 });
    thump(g, 140, 70, 0.22, 0.25, 0.04);
    g.tone({ f: 1580, d: 0.25, peak: 0.03, at: 0.06, a: 0.04 });
    g.tone({ f: 2390, d: 0.2, peak: 0.02, at: 0.06, a: 0.04 });
  }, { max: 2, gap: 0.08, len: 0.4, vol: 1.08, wet: 0.15, vary: 0.05 }),

  hit: def((g) => {
    thump(g, 190, 55, 0.13, 0.85);
    g.noiseBurst({ d: 0.035, peak: 0.45, type: 'highpass', f: 2200 });
    g.noiseBurst({ d: 0.07, peak: 0.3, type: 'bandpass', f: 900, q: 1.5 });
    const lp = g.filter('lowpass', 1400);
    g.tone({ type: 'triangle', f: 330, f2: 150, d: 0.06, peak: 0.25, dest: lp });
  }, { max: 4, gap: 0.03, len: 0.2, vol: 0.62, wet: 0.08, vary: 0.08 }),

  hitHeavy: def((g) => {
    thump(g, 125, 36, 0.28, 1);
    g.noiseBurst({ d: 0.03, peak: 0.45, type: 'bandpass', f: 3600, q: 1.2 });
    g.noiseBurst({ d: 0.14, peak: 0.45, type: 'lowpass', f: 1900, f2: 300, q: 0.8 });
    const lp = g.filter('lowpass', 900);
    g.tone({ type: 'square', f: 160, f2: 70, d: 0.1, peak: 0.12, dest: lp });
    debris(g, 4, 0.12, 0.08, 0.02);
  }, { max: 3, gap: 0.05, len: 0.35, vol: 0.68, wet: 0.15, vary: 0.06 }),

  kill: def((g) => {
    thump(g, 160, 48, 0.18, 0.55);
    g.noiseBurst({ a: 0.005, d: 0.32, peak: 0.3, type: 'bandpass', f: 2400, f2: 380, q: 1.3 });
    const n = [0, 7, 9, 14][Math.floor(Math.random() * 4)]!;
    bell(g, D(24 + n), 0.45, 0.09, 0.04);
  }, { max: 3, gap: 0.04, len: 0.55, vol: 0.9, wet: 0.25 }),

  killBig: def((g) => {
    thump(g, 95, 28, 0.6, 0.9);
    g.noiseBurst({ a: 0.01, d: 0.7, peak: 0.45, type: 'lowpass', f: 3200, f2: 180, q: 0.9 });
    debris(g, 7, 0.35, 0.07, 0.03, 1600);
    bell(g, D(19), 1.0, 0.07, 0.06);
    bell(g, D(26), 0.9, 0.05, 0.12);
    bell(g, D(31), 0.8, 0.04, 0.18);
  }, { max: 2, gap: 0.08, len: 1.2, vol: 0.7, wet: 0.4, vary: 0.03 }),

  // Ranged -------------------------------------------------------------------------------------
  boltFire: def((g) => {
    g.tone({ f: 1500, f2: 640, glide: 0.11, d: 0.14, peak: 0.28 });
    g.tone({ type: 'triangle', f: 3000, f2: 1300, glide: 0.1, d: 0.08, peak: 0.06 });
    chime(g, 2200 * r(0.98, 1.02), 0.18, 0.05, 0.01);
    g.noiseBurst({ d: 0.05, peak: 0.1, type: 'bandpass', f: 5200, q: 2 });
  }, { max: 4, gap: 0.04, len: 0.25, vol: 1.0, wet: 0.18, vary: 0.05 }),

  boltHit: def((g) => {
    g.tone({ f: 900, f2: 280, d: 0.07, peak: 0.3 });
    g.noiseBurst({ d: 0.05, peak: 0.22, type: 'bandpass', f: 2600, q: 1.5 });
    g.tone({ f: 2900, d: 0.06, peak: 0.03, at: 0.005 });
  }, { max: 4, gap: 0.03, len: 0.12, vol: 0.96, wet: 0.12, vary: 0.1 }),

  // Movement -------------------------------------------------------------------------------------
  dash: def((g) => {
    g.noiseBurst({ a: 0.03, d: 0.18, peak: 0.5, type: 'bandpass', f: 450, f2: 2800, sweep: 0.12, q: 1.3 });
    g.noiseBurst({ a: 0.02, d: 0.1, peak: 0.1, type: 'highpass', f: 5000 });
    g.tone({ f: 210, f2: 120, d: 0.14, peak: 0.12 });
  }, { max: 2, gap: 0.08, len: 0.25, vol: 1.0, wet: 0.12 }),

  dashReady: def((g) => {
    g.tone({ f: D(31), d: 0.35, peak: 0.08, a: 0.004 });   // A6
    g.tone({ f: D(38), d: 0.3, peak: 0.05, at: 0.05 });    // E7
  }, { max: 1, gap: 0.2, len: 0.4, vol: 1.2, wet: 0.3, vary: 0.01 }),

  perfectDodge: def((g) => {
    // a held breath: shimmer swelling in while the air drains away downward
    for (const [s, at] of [[19, 0], [26, 0.03], [31, 0.06]] as const) g.tone({ f: D(s), a: 0.08, d: 0.6, peak: 0.07, at });
    g.noiseBurst({ a: 0.02, d: 0.35, peak: 0.25, type: 'bandpass', f: 3200, f2: 500, q: 1.2 });
    g.tone({ f: 600, f2: 300, d: 0.3, peak: 0.08 });
  }, { max: 1, gap: 0.2, len: 0.75, vol: 1.1, wet: 0.5, vary: 0.01, prio: 2 }),

  footstep: def((g) => {
    g.noiseBurst({ d: r(0.02, 0.035), peak: 0.22, type: 'bandpass', f: r(1400, 2300), q: 2.2 });
    g.tone({ f: r(170, 230), f2: 110, d: 0.035, peak: 0.12 });
  }, { max: 2, gap: 0.07, len: 0.06, vol: 0.45, wet: 0.05, vary: 0.08, prio: 0 }),

  wallBonk: def((g) => {
    thump(g, 125, 75, 0.07, 0.5);
    g.noiseBurst({ d: 0.045, peak: 0.25, type: 'lowpass', f: 700 });
  }, { max: 1, gap: 0.15, len: 0.1, vol: 0.4, wet: 0.08, prio: 0 }),

  // Player state ---------------------------------------------------------------------------------
  hurt: def((g) => {
    thump(g, 230, 85, 0.18, 0.7);
    g.noiseBurst({ d: 0.12, peak: 0.35, type: 'lowpass', f: 1300 });
    const lp = g.filter('lowpass', 700, 3);
    g.tone({ type: 'square', f: 155, d: 0.16, peak: 0.12, dest: lp });
    g.tone({ type: 'square', f: 164, d: 0.16, peak: 0.1, dest: lp }); // beating: a wince
  }, { max: 2, gap: 0.1, len: 0.25, vol: 0.87, wet: 0.12, prio: 2, vary: 0.03 }),

  death: def((g) => {
    const lp = g.filter('lowpass', 2400, 1.5);
    lp.frequency.exponentialRampToValueAtTime(140, g.t0 + 1.4);
    g.tone({ type: 'sawtooth', f: 330, f2: 52, glide: 1.4, a: 0.02, d: 1.4, peak: 0.25, dest: lp });
    g.tone({ type: 'sawtooth', f: 334, f2: 53, glide: 1.4, a: 0.02, d: 1.4, peak: 0.2, dest: lp });
    thump(g, 110, 30, 0.6, 0.8);
    bell(g, D(14), 1.8, 0.08, 0.15, 0.6);
    g.noiseBurst({ a: 0.01, d: 1.0, peak: 0.2, type: 'lowpass', f: 1200, f2: 120 });
  }, { max: 1, gap: 0.5, len: 1.9, vol: 0.7, wet: 0.5, prio: 2, vary: 0 }),

  heal: def((g) => {
    for (const [s, at] of [[12, 0], [19, 0.06], [24, 0.12], [28, 0.18]] as const) {
      g.tone({ f: D(s), f2: D(s) * 1.01, a: 0.12, d: 0.7, peak: 0.07, at });
    }
    bell(g, D(31), 0.6, 0.05, 0.22);
  }, { max: 1, gap: 0.2, len: 1.0, vol: 0.9, wet: 0.45, vary: 0.01 }),

  // Pickups ------------------------------------------------------------------------------------
  mote: def((g, x) => {
    const m = x.mote.next(x.now);
    const f = D(24 + m.semis) * r(0.996, 1.004);
    g.tone({ f, d: r(0.28, 0.38), peak: 0.13 * m.gain, a: 0.002 });
    g.tone({ f: f * 4.0, d: 0.06, peak: 0.025 * m.gain, a: 0.001 });
    g.tone({ f: f * 2.01, d: 0.14, peak: 0.03 * m.gain });
  }, { max: 4, gap: 0.035, len: 0.4, vol: 1.12, wet: 0.3, vary: 0, prio: 0 }),

  pickupBig: def((g) => {
    for (const [s, at] of [[12, 0], [16, 0.05], [19, 0.1], [24, 0.15]] as const) bell(g, D(s), 0.9, 0.08, at);
    g.noiseBurst({ a: 0.15, d: 0.4, peak: 0.08, type: 'highpass', f: 6000 });
  }, { max: 1, gap: 0.15, len: 1.1, vol: 0.88, wet: 0.45, vary: 0, prio: 2 }),

  levelUp: def((g) => {
    const steps = [0, 7, 12, 14, 19, 24];
    steps.forEach((s, i) => bell(g, D(12 + s), 1.1 - i * 0.08, 0.09, i * 0.075));
    g.noiseBurst({ a: 0.35, d: 0.6, peak: 0.07, type: 'highpass', f: 5000, at: 0.05 });
    for (const s of [0, 7, 16]) g.tone({ f: D(s), a: 0.25, d: 1.2, peak: 0.05, at: 0.3 }); // warm pad under
  }, { max: 1, gap: 0.3, len: 1.8, vol: 1.08, wet: 0.5, vary: 0, prio: 2 }),

  lanternLit: def((g) => {
    g.noiseBurst({ a: 0.12, d: 0.5, peak: 0.3, type: 'lowpass', f: 300, f2: 2200, sweep: 0.2, q: 1.2 });
    debris(g, 6, 0.5, 0.03, 0.05, 3500); // crackle
    for (const [s, at] of [[0, 0.1], [7, 0.16], [12, 0.22]] as const) g.tone({ f: D(s), a: 0.1, d: 1.0, peak: 0.06, at });
    bell(g, D(19), 0.9, 0.05, 0.25);
  }, { max: 1, gap: 0.3, len: 1.3, vol: 1.2, wet: 0.45, vary: 0.01, prio: 2 }),

  interact: def((g) => {
    g.noiseBurst({ d: 0.02, peak: 0.25, type: 'bandpass', f: 1800, q: 4 });
    g.tone({ f: 700, d: 0.04, peak: 0.12 });
    bell(g, D(21), 0.35, 0.06, 0.03);
  }, { max: 1, gap: 0.1, len: 0.4, vol: 1.5, wet: 0.25, prio: 2, vary: 0.02 }),

  // UI -----------------------------------------------------------------------------------------
  uiMove: def((g) => {
    g.tone({ type: 'triangle', f: 880, f2: 760, d: 0.035, peak: 0.2 });
    g.noiseBurst({ d: 0.015, peak: 0.15, type: 'bandpass', f: 2100, q: 4 });
  }, { max: 2, gap: 0.03, len: 0.06, vol: 1.05, wet: 0.06, vary: 0.03, prio: 2 }),

  uiSelect: def((g) => {
    g.noiseBurst({ d: 0.02, peak: 0.18, type: 'bandpass', f: 1600, q: 4 });
    chime(g, D(12), 0.5, 0.12, 0.005);
    chime(g, D(19), 0.55, 0.09, 0.05);
  }, { max: 2, gap: 0.06, len: 0.6, vol: 1.26, wet: 0.25, vary: 0, prio: 2 }),

  uiBack: def((g) => {
    g.tone({ type: 'triangle', f: 620, f2: 380, d: 0.07, peak: 0.2 });
    g.noiseBurst({ d: 0.02, peak: 0.13, type: 'bandpass', f: 1300, q: 4 });
  }, { max: 2, gap: 0.05, len: 0.1, vol: 1.14, wet: 0.08, vary: 0.02, prio: 2 }),

  deny: def((g) => {
    const lp = g.filter('lowpass', 420, 1);
    g.tone({ type: 'square', f: 110, d: 0.08, peak: 0.25, dest: lp });
    g.tone({ type: 'square', f: 104, d: 0.1, peak: 0.25, dest: lp, at: 0.1 });
    thump(g, 150, 105, 0.12, 0.3);
  }, { max: 1, gap: 0.15, len: 0.25, vol: 0.54, wet: 0.05, vary: 0, prio: 2 }),

  // Sunburst (lantern ultimate) and shield ---------------------------------------------------------
  sunburstCharge: def((g) => {
    g.fm({ f: 220, f2: 880, glide: 0.95, ratio: 2, index: 0.2, index2: 2.5, a: 0.85, d: 0.15, peak: 0.12 });
    g.tone({ f: 440, f2: 1760, glide: 0.95, a: 0.85, d: 0.12, peak: 0.05 });
    g.noiseBurst({ a: 0.85, d: 0.1, peak: 0.18, type: 'bandpass', f: 800, f2: 5000, sweep: 0.95, q: 1.5 });
  }, { max: 1, gap: 0.3, len: 1.05, vol: 0.83, wet: 0.35, vary: 0, prio: 2 }),

  sunburst: def((g) => {
    thump(g, 105, 38, 0.7, 0.9);
    g.noiseBurst({ a: 0.005, d: 0.9, peak: 0.5, type: 'lowpass', f: 7000, f2: 500, q: 0.7 });
    // warm radiant chord (D major: light, against the dorian world)
    for (const [s, at] of [[0, 0], [7, 0.02], [12, 0.04], [16, 0.06], [19, 0.08]] as const) bell(g, D(s + 12), 1.6, 0.06, at);
    for (const s of [-12, 0, 4]) g.tone({ type: 'triangle', f: D(s), a: 0.05, d: 1.5, peak: 0.06 });
  }, { max: 1, gap: 0.3, len: 1.8, vol: 0.75, wet: 0.55, vary: 0, prio: 2 }),

  shieldUp: def((g) => {
    const trem = g.node(g.ctx.createGain());
    trem.gain.value = 0.7; trem.connect(g.out);
    g.tone({ f: 620, f2: 1240, glide: 0.25, a: 0.08, d: 0.45, peak: 0.12, dest: trem });
    g.tone({ f: 930, f2: 1860, glide: 0.25, a: 0.08, d: 0.4, peak: 0.06, dest: trem });
    g.lfo(trem.gain, 11, 0.3, 0, 0.6);
    chime(g, D(26), 0.5, 0.05, 0.18);
  }, { max: 1, gap: 0.2, len: 0.65, vol: 1.5, wet: 0.35, vary: 0.02, prio: 2 }),

  shieldBreak: def((g) => {
    thump(g, 180, 60, 0.15, 0.5);
    for (let i = 0; i < 9; i++) {
      const at = Math.random() * 0.18;
      g.noiseBurst({ at, d: r(0.03, 0.09), peak: r(0.08, 0.18), type: 'bandpass', f: r(3000, 9000), q: 8 });
    }
    for (const f of [2210, 3170, 4630]) g.tone({ f: f * r(0.95, 1.05), d: r(0.2, 0.4), peak: 0.04 });
  }, { max: 1, gap: 0.2, len: 0.45, vol: 0.78, wet: 0.3, prio: 2 }),

  reflect: def((g) => {
    g.fm({ f: 1500, ratio: 1.41, index: 2, index2: 0.1, d: 0.35, peak: 0.12 });
    g.noiseBurst({ a: 0.005, d: 0.08, peak: 0.15, type: 'bandpass', f: 3000, f2: 1200, q: 1.5 });
  }, { max: 3, gap: 0.05, len: 0.4, vol: 1.5, wet: 0.25, vary: 0.05 }),

  // Status effects -------------------------------------------------------------------------------
  burn: def((g) => {
    g.noiseBurst({ a: 0.04, d: 0.25, peak: 0.25, type: 'bandpass', f: 900, f2: 1600, q: 0.9 });
    debris(g, 5, 0.25, 0.06, 0, 3800);
  }, { max: 2, gap: 0.12, len: 0.32, vol: 1.0, wet: 0.1, vary: 0.08, prio: 0 }),

  chain: def((g) => {
    const bp = g.filter('bandpass', 2400, 0.8);
    g.fm({ type: 'sawtooth', f: 180, ratio: 7.13, index: 9, index2: 3, d: 0.16, peak: 0.12, dest: bp });
    g.noiseBurst({ d: 0.12, peak: 0.12, type: 'highpass', f: 4000 });
    g.tone({ f: 2800, f2: 1900, d: 0.1, peak: 0.03 });
  }, { max: 3, gap: 0.04, len: 0.22, vol: 1.35, wet: 0.15, vary: 0.08 }),

  shard: def((g) => {
    for (const f of [3020, 4710, 7130]) g.tone({ f: f * r(0.97, 1.03), d: r(0.08, 0.16), peak: 0.06 });
    g.noiseBurst({ d: 0.02, peak: 0.1, type: 'highpass', f: 6500 });
  }, { max: 3, gap: 0.03, len: 0.2, vol: 1.26, wet: 0.25, vary: 0.06 }),

  // Enemies ------------------------------------------------------------------------------------
  // Windups are warnings: rising, rattling and clearly in front of the mix (priority 2).
  enemyWindup: def((g) => {
    rattle(g, 'sawtooth', 300, 920, 0.42, 26, 0.3, 2600);
    g.tone({ type: 'triangle', f: 600, f2: 1840, glide: 0.42, a: 0.38, d: 0.06, peak: 0.06 });
  }, { max: 3, gap: 0.06, len: 0.55, vol: 1.1, wet: 0.12, prio: 2, vary: 0.05 }),

  enemyShot: def((g) => {
    const lp = g.filter('lowpass', 1400, 4);
    g.tone({ type: 'square', f: 520, f2: 190, d: 0.11, peak: 0.25, dest: lp });
    g.noiseBurst({ d: 0.05, peak: 0.12, type: 'bandpass', f: 1500, q: 1.5 });
    g.tone({ f: D(1 + 12) * 2, d: 0.08, peak: 0.03 }); // a sour Eb: corruption
  }, { max: 4, gap: 0.04, len: 0.16, vol: 0.81, wet: 0.12, vary: 0.06 }),

  enemyLunge: def((g) => {
    g.noiseBurst({ a: 0.03, d: 0.2, peak: 0.4, type: 'bandpass', f: 300, f2: 1400, sweep: 0.15, q: 1.2 });
    const lp = g.filter('lowpass', 900, 2);
    g.fm({ type: 'sawtooth', f: 85, f2: 120, ratio: 1.5, index: 3, d: 0.22, peak: 0.25, dest: lp, a: 0.02 });
  }, { max: 3, gap: 0.06, len: 0.3, vol: 1.0, wet: 0.1, vary: 0.06 }),

  chargeWindup: def((g) => {
    rattle(g, 'sawtooth', 120, 380, 0.7, 17, 0.35, 1600);
    g.noiseBurst({ a: 0.6, d: 0.1, peak: 0.15, type: 'bandpass', f: 400, f2: 1800, sweep: 0.7, q: 1.5 });
  }, { max: 2, gap: 0.1, len: 0.85, vol: 0.83, wet: 0.12, prio: 2, vary: 0.04 }),

  chargeImpact: def((g) => {
    thump(g, 110, 34, 0.35, 1);
    g.noiseBurst({ d: 0.25, peak: 0.45, type: 'lowpass', f: 1500, f2: 250 });
    debris(g, 9, 0.3, 0.1, 0.02, 1800);
  }, { max: 2, gap: 0.08, len: 0.45, vol: 0.68, wet: 0.25, vary: 0.04 }),

  slamWindup: def((g) => {
    const lp = g.filter('lowpass', 500, 3);
    lp.frequency.exponentialRampToValueAtTime(1400, g.t0 + 0.8);
    g.tone({ type: 'sawtooth', f: 58, f2: 140, glide: 0.8, a: 0.72, d: 0.1, peak: 0.35, dest: lp });
    g.tone({ type: 'sawtooth', f: 59.5, f2: 143, glide: 0.8, a: 0.72, d: 0.1, peak: 0.3, dest: lp });
    g.noiseBurst({ a: 0.7, d: 0.1, peak: 0.2, type: 'lowpass', f: 200, f2: 900, sweep: 0.8 });
  }, { max: 2, gap: 0.1, len: 0.95, vol: 0.6, wet: 0.15, prio: 2, vary: 0.03 }),

  slam: def((g) => {
    thump(g, 85, 27, 0.8, 1);
    g.noiseBurst({ d: 0.55, peak: 0.5, type: 'lowpass', f: 1300, f2: 150 });
    g.noiseBurst({ d: 0.03, peak: 0.3, type: 'bandpass', f: 2600, q: 1 });
    debris(g, 12, 0.5, 0.09, 0.04, 1500);
  }, { max: 2, gap: 0.1, len: 1.0, vol: 0.75, wet: 0.35, vary: 0.03 }),

  spawn: def((g) => {
    // reversed-feeling swell of corruption: two detuned tones a semitone apart, cut off sharply
    g.tone({ type: 'triangle', f: D(7), a: 0.32, d: 0.06, peak: 0.1 });
    g.tone({ type: 'triangle', f: D(8), a: 0.32, d: 0.06, peak: 0.08 });
    g.noiseBurst({ a: 0.32, d: 0.06, peak: 0.2, type: 'bandpass', f: 500, f2: 3500, sweep: 0.34, q: 2 });
    thump(g, 140, 60, 0.15, 0.3, 0.34);
  }, { max: 3, gap: 0.08, len: 0.55, vol: 0.7, wet: 0.35, vary: 0.04 }),

  blink: def((g) => {
    g.tone({ f: 300, f2: 2200, glide: 0.08, d: 0.12, peak: 0.15 });
    g.tone({ f: 2200, f2: 700, glide: 0.1, d: 0.12, peak: 0.08, at: 0.08 });
    g.noiseBurst({ d: 0.1, peak: 0.08, type: 'highpass', f: 5000 });
  }, { max: 2, gap: 0.06, len: 0.25, vol: 1.12, wet: 0.3 }),

  // World --------------------------------------------------------------------------------------
  doorOpen: def((g) => {
    const bp = g.noiseBurst({ a: 0.15, d: 0.7, hold: 0.3, peak: 0.35, type: 'bandpass', f: 220, q: 2.5 });
    g.lfo(bp.frequency, 7, 90, 0, 1.2, 'triangle'); // grinding judder
    g.tone({ type: 'sawtooth', f: 48, a: 0.2, hold: 0.4, d: 0.5, peak: 0.08, dest: g.filter('lowpass', 200) });
    thump(g, 90, 40, 0.3, 0.6, 1.05);
    debris(g, 6, 0.9, 0.04, 0.1, 1200);
  }, { max: 1, gap: 0.3, len: 1.5, vol: 0.6, wet: 0.35, vary: 0.03, prio: 2 }),

  roomClear: def((g) => {
    const notes = [7, 12, 14, 19, 24];
    notes.forEach((s, i) => bell(g, D(s), 1.4, 0.07, i * 0.11));
    for (const s of [-12, 0, 7]) g.tone({ type: 'triangle', f: D(s), a: 0.3, d: 1.6, peak: 0.05 });
  }, { max: 1, gap: 0.5, len: 2.1, vol: 1.1, wet: 0.5, vary: 0, prio: 2 }),

  victory: def((g) => {
    [0, 4, 7, 12, 16, 19].forEach((s, i) => bell(g, D(12 + s), 1.8, 0.08, i * 0.09));
    for (const s of [-12, 0, 4, 7]) g.tone({ type: 'triangle', f: D(s), a: 0.4, d: 2.2, peak: 0.06 });
    g.noiseBurst({ a: 0.5, d: 1.0, peak: 0.06, type: 'highpass', f: 6000 });
  }, { max: 1, gap: 1, len: 2.8, vol: 0.9, wet: 0.55, vary: 0, prio: 2 }),

  // Boss: the Choked Star ------------------------------------------------------------------------
  bossRoar: def((g) => {
    const lp = g.filter('lowpass', 500, 2);
    lp.frequency.linearRampToValueAtTime(1600, g.t0 + 0.5);
    lp.frequency.exponentialRampToValueAtTime(220, g.t0 + 1.7);
    for (const f of [55, 58.3, 82.4]) g.fm({ type: 'sawtooth', f, f2: f * 0.8, glide: 1.6, ratio: 0.5, index: 2.5, index2: 0.6, a: 0.25, d: 1.3, peak: 0.25, dest: lp });
    g.noiseBurst({ a: 0.3, d: 1.2, peak: 0.25, type: 'lowpass', f: 700, f2: 150 });
    thump(g, 70, 25, 0.9, 0.6);
  }, { max: 1, gap: 0.6, len: 1.9, vol: 0.75, wet: 0.45, prio: 2, vary: 0.03 }),

  bossBeamCharge: def((g) => {
    const lp = g.filter('lowpass', 700, 4);
    lp.frequency.exponentialRampToValueAtTime(3000, g.t0 + 1.4);
    g.tone({ type: 'sawtooth', f: 78, f2: 312, glide: 1.4, a: 1.3, d: 0.12, peak: 0.3, dest: lp });
    g.tone({ type: 'sawtooth', f: 79.5, f2: 318, glide: 1.4, a: 1.3, d: 0.12, peak: 0.25, dest: lp });
    g.tone({ f: 1200, f2: 2600, glide: 1.4, a: 1.3, d: 0.1, peak: 0.04 });
    g.noiseBurst({ a: 1.3, d: 0.1, peak: 0.18, type: 'bandpass', f: 300, f2: 3000, sweep: 1.4, q: 2 });
  }, { max: 1, gap: 0.5, len: 1.6, vol: 0.62, wet: 0.3, prio: 2, vary: 0 }),

  bossBeam: def((g) => {
    thump(g, 90, 30, 0.5, 0.8);
    const lp = g.filter('lowpass', 1800, 1);
    const trem = g.node(g.ctx.createGain());
    trem.gain.value = 0.7; trem.connect(lp);
    for (const f of [73.4, 74.6, 110, 155.6]) g.tone({ type: 'sawtooth', f, a: 0.04, hold: 0.9, d: 0.4, peak: 0.13, dest: trem });
    g.lfo(trem.gain, 13, 0.3, 0, 1.4);
    g.noiseBurst({ a: 0.03, hold: 0.9, d: 0.4, peak: 0.25, type: 'bandpass', f: 2200, q: 0.8 });
  }, { max: 1, gap: 0.4, len: 1.45, vol: 0.62, wet: 0.3, prio: 2, vary: 0 }),

  bossPhase: def((g) => {
    g.noiseBurst({ a: 0.45, d: 0.04, peak: 0.3, type: 'bandpass', f: 400, f2: 5000, sweep: 0.5, q: 1 });
    thump(g, 80, 26, 1.0, 1, 0.48);
    // the orrery: inharmonic metal rings
    for (const [f, d] of [[146.8, 2.4], [207.6, 2.0], [311, 1.6], [439, 1.3]] as const) {
      g.fm({ f, ratio: 2.41, index: 2.5, index2: 0.1, d, peak: 0.08, at: 0.48 });
    }
    debris(g, 10, 0.6, 0.06, 0.5, 1400);
  }, { max: 1, gap: 1, len: 3, vol: 0.75, wet: 0.55, prio: 2, vary: 0 }),

  bossDeath: def((g) => {
    thump(g, 75, 22, 1.4, 1);
    const lp = g.filter('lowpass', 1500, 1);
    lp.frequency.exponentialRampToValueAtTime(120, g.t0 + 2.6);
    for (const f of [110, 116.5, 164.8]) g.tone({ type: 'sawtooth', f, f2: f * 0.35, glide: 2.6, a: 0.05, d: 2.6, peak: 0.15, dest: lp });
    g.noiseBurst({ d: 1.8, peak: 0.4, type: 'lowpass', f: 2500, f2: 120 });
    debris(g, 14, 1.4, 0.06, 0.1, 1300);
    // the trapped light escaping upward
    [0, 7, 12, 16, 19, 24, 28].forEach((s, i) => bell(g, D(12 + s), 1.6, 0.06, 0.9 + i * 0.16));
  }, { max: 1, gap: 2, len: 3.6, vol: 0.8, wet: 0.6, prio: 2, vary: 0 }),

  bossVolley: def((g) => {
    for (let i = 0; i < 3; i++) {
      const lp = g.filter('lowpass', 1500 - i * 200, 4);
      g.tone({ type: 'square', f: 440 - i * 40, f2: 150, glide: 0.14, d: 0.15, peak: 0.2, dest: lp, at: i * 0.07 });
      g.noiseBurst({ d: 0.05, peak: 0.1, type: 'bandpass', f: 1300, q: 1.5, at: i * 0.07 });
    }
  }, { max: 2, gap: 0.12, len: 0.4, vol: 0.99, wet: 0.2, prio: 2, vary: 0.04 }),
};

export const SFX_NAMES = Object.keys(SFX) as Sfx[];
