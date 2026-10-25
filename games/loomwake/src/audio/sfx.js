// Loomwake sound effects: every one synthesised from the kit in synth.js.
//
// SFX[name] = { d: rough length (s), prio: 1 normal / 2 never dropped / 0 first to go,
//               send: reverb send, win/cap: repeat stacking, fn(E, t, o, out) }
// o carries the caller's options: vel (0..1.5 loudness), pitch (multiplier),
// dur (for tells: the wind-up time, so the rise peaks as the attack lands),
// rarity, patron, element, combo, chained...
//
// Language: Iri and the patrons are gold, warm and tonal; the Unravelled are
// cloth, thread, dry rasps and hollow armour; bosses each have a material
// (Veyl glass, Morrow water and voices, Aurum gold and fire, Sable black thread).
import { mtof, rnd, clamp, stackGain, voice, duckMusic, driveCurve } from './core.js';
import * as K from './synth.js';
import { LEVELS } from './levels.js';

const { tone, noise, fm, partials, pluck } = K;
export const SFX = {};
const def = (name, d, fn, o = {}) => { SFX[name] = { d, fn, prio: o.prio ?? 1, send: o.send ?? 0, win: o.win ?? 0.06, cap: o.cap ?? 4, gain: o.gain ?? 1, duck: o.duck }; };
const V = (o) => o.vel ?? 1;
const Pm = (o, vary = 0.05) => (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * vary);

// ======================================================================
// Iri: the Shuttle Blade and the other Instruments
// ======================================================================
// Three combo swings: a light forehand, a backhand, and a heavy finisher.
def('swing1', 0.25, (E, t, o, out) => {
  const p = Pm(o), v = V(o);
  noise(E, t, out, { f: 700 * p, f1: 3400 * p, q: 1.3, a: 0.012, d: 0.15, peak: 0.5 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 380, a: 0.01, d: 0.12, peak: 0.28 * v });
  tone(E, t + 0.01, out, { f: 1320 * p, f1: 1760 * p, glide: 0.1, a: 0.01, d: 0.13, peak: 0.045 * v });
  return tone(E, t + 0.015, out, { type: 'triangle', f: 2640 * p, a: 0.004, d: 0.08, peak: 0.018 * v });
}, { win: 0.04, cap: 3 });
def('swing2', 0.25, (E, t, o, out) => {
  const p = Pm(o), v = V(o);
  noise(E, t, out, { f: 3200 * p, f1: 850 * p, q: 1.2, a: 0.008, d: 0.16, peak: 0.5 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 420, a: 0.008, d: 0.12, peak: 0.26 * v });
  return tone(E, t + 0.01, out, { f: 1175 * p, f1: 880 * p, glide: 0.12, a: 0.01, d: 0.14, peak: 0.045 * v });
}, { win: 0.04, cap: 3 });
def('swing3', 0.45, (E, t, o, out) => {
  const p = Pm(o, 0.03), v = V(o);
  noise(E, t, out, { f: 380 * p, f1: 2600 * p, q: 0.9, a: 0.04, d: 0.24, peak: 0.55 * v });
  noise(E, t + 0.03, out, { f: 1400 * p, f1: 5200 * p, q: 1.6, a: 0.02, d: 0.2, peak: 0.25 * v });
  tone(E, t + 0.05, out, { f: 95, f1: 44, glide: 0.16, a: 0.006, d: 0.22, peak: 0.42 * v });
  tone(E, t + 0.04, out, { f: 1320 * p, a: 0.01, d: 0.32, peak: 0.04 * v });
  return tone(E, t + 0.04, out, { f: 1976 * p, a: 0.01, d: 0.3, peak: 0.03 * v });
}, { win: 0.05, cap: 2, send: 0.1 });
def('spear', 0.35, (E, t, o, out) => { // Spindle Spear thrust
  const p = Pm(o), v = V(o);
  noise(E, t, out, { f: 1800 * p, f1: 600 * p, q: 2.2, a: 0.01, d: 0.14, peak: 0.45 * v });
  noise(E, t, out, { ftype: 'highpass', f: 5000, a: 0.002, d: 0.05, peak: 0.2 * v });
  return tone(E, t, out, { type: 'triangle', f: 900 * p, f1: 1400 * p, glide: 0.08, a: 0.005, d: 0.12, peak: 0.05 * v });
}, { win: 0.04 });
def('bow_draw', 0.5, (E, t, o, out) => { // Warp Bow charge creak
  const v = V(o);
  noise(E, t, out, { f: 300, f1: 1400, q: 6, a: 0.25, d: 0.25, peak: 0.12 * v, am: [22, 0.7] });
  return tone(E, t, out, { f: 330, f1: 660, glide: 0.45, a: 0.3, d: 0.2, peak: 0.04 * v });
});
def('bow', 0.4, (E, t, o, out) => { // release: string twang + arrow whistle
  const p = Pm(o), v = V(o);
  pluck(E, t, out, { f: 110 * p, len: 0.6, bright: 0.8, peak: 0.35 * v, d: 0.35 });
  noise(E, t + 0.01, out, { f: 2400 * p, f1: 5200 * p, q: 5, a: 0.01, d: 0.25, peak: 0.18 * v });
  return tone(E, t + 0.01, out, { f: 1900 * p, f1: 1500 * p, glide: 0.3, a: 0.02, d: 0.3, peak: 0.03 * v });
}, { win: 0.04 });
def('punch', 0.25, (E, t, o, out) => { // Heddle Gauntlets jab
  const p = Pm(o, 0.08), v = V(o);
  noise(E, t, out, { f: 900 * p, f1: 2400 * p, q: 1, a: 0.006, d: 0.08, peak: 0.42 * v });
  return tone(E, t + 0.02, out, { f: 160 * p, f1: 80, glide: 0.05, a: 0.003, d: 0.08, peak: 0.3 * v });
}, { win: 0.03, cap: 4 });
def('chakram', 0.6, (E, t, o, out) => { // Bobbin Chakram throw: spinning whir
  const p = Pm(o), v = V(o);
  noise(E, t, out, { f: 1600 * p, f1: 900 * p, q: 3, a: 0.02, d: 0.5, peak: 0.25 * v, am: [26, 0.9] });
  return tone(E, t, out, { type: 'triangle', f: 700 * p, f1: 520 * p, glide: 0.5, a: 0.01, d: 0.5, peak: 0.04 * v, vib: [26, 40] });
});
def('chakram_catch', 0.25, (E, t, o, out) => {
  const v = V(o);
  partials(E, t, out, { f: 1300, ratios: [1, 2.3, 3.9], d: 0.25, peak: 0.08 * v });
  return noise(E, t, out, { ftype: 'highpass', f: 3000, a: 0.001, d: 0.03, peak: 0.25 * v });
});

// ======================================================================
// Hits (flesh-less): thread, armour, glass, stone; crits and armour break
// ======================================================================
def('hit_thread', 0.22, (E, t, o, out) => { // cloth and thread: a tight thwack with a twang
  const p = Pm(o, 0.07), v = V(o);
  tone(E, t, out, { f: 190 * p, f1: 58, glide: 0.09, a: 0.002, d: 0.11, peak: 0.7 * v });
  noise(E, t, out, { f: 2000 * p, f1: 650, q: 0.9, a: 0.001, d: 0.075, peak: 0.55 * v });
  noise(E, t, out, { ftype: 'highpass', f: 6000, a: 0.001, d: 0.02, peak: 0.25 * v });
  return tone(E, t + 0.004, out, { type: 'triangle', f: 440 * p, f1: 392 * p, glide: 0.1, a: 0.002, d: 0.1, peak: 0.1 * v });
}, { win: 0.05, cap: 4 });
def('hit_armor', 0.45, (E, t, o, out) => { // hollow plate: clank and ring
  const p = Pm(o, 0.06), v = V(o);
  partials(E, t, out, { f: 560 * p, ratios: [1, 2.31, 3.72, 5.13, 6.9], d: 0.38, peak: 0.16 * v });
  noise(E, t, out, { ftype: 'highpass', f: 2800, a: 0.001, d: 0.045, peak: 0.5 * v });
  return tone(E, t, out, { f: 150, f1: 70, glide: 0.07, a: 0.002, d: 0.09, peak: 0.45 * v });
}, { win: 0.05, cap: 4 });
def('hit_glass', 0.45, (E, t, o, out) => {
  const p = Pm(o, 0.08), v = V(o);
  for (let i = 0; i < 3; i++) fm(E, t + i * 0.012, out, { f: rnd(2200, 3800) * p, ratio: 2.7, index: 1.6, index1: 0.05, idecay: 0.03, a: 0.001, d: rnd(0.15, 0.35), peak: 0.07 * v });
  noise(E, t, out, { ftype: 'highpass', f: 4500, a: 0.001, d: 0.09, peak: 0.35 * v });
  return tone(E, t, out, { f: 170, f1: 80, glide: 0.06, a: 0.002, d: 0.08, peak: 0.42 * v });
}, { win: 0.05, cap: 4 });
def('hit_stone', 0.3, (E, t, o, out) => {
  const p = Pm(o, 0.07), v = V(o);
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 1100 * p, f1: 220, a: 0.001, d: 0.16, peak: 0.85 * v });
  noise(E, t, out, { f: 2600, q: 3, a: 0.001, d: 0.05, peak: 0.3 * v });
  return tone(E, t, out, { f: 115 * p, f1: 48, glide: 0.1, a: 0.002, d: 0.14, peak: 0.6 * v });
}, { win: 0.05, cap: 4 });
def('hit_wood', 0.3, (E, t, o, out) => { // Loomhulk's loom-beam body
  const p = Pm(o, 0.07), v = V(o);
  tone(E, t, out, { type: 'triangle', f: 230 * p, f1: 180 * p, glide: 0.05, a: 0.001, d: 0.12, peak: 0.4 * v });
  noise(E, t, out, { f: 800 * p, q: 4, a: 0.001, d: 0.09, peak: 0.45 * v });
  return tone(E, t, out, { f: 120, f1: 55, glide: 0.08, a: 0.002, d: 0.12, peak: 0.5 * v });
}, { win: 0.05, cap: 4 });
def('hit_gold', 0.6, (E, t, o, out) => { // Aurum's molten-gold plate: deep bell clang
  const p = Pm(o, 0.04), v = V(o);
  partials(E, t, out, { f: 240 * p, ratios: [1, 2.02, 2.76, 3.97, 5.41], d: 0.6, peak: 0.16 * v });
  noise(E, t, out, { ftype: 'highpass', f: 2500, a: 0.001, d: 0.05, peak: 0.45 * v });
  return tone(E, t, out, { f: 110, f1: 52, glide: 0.1, a: 0.002, d: 0.14, peak: 0.55 * v });
}, { win: 0.05, cap: 4 });
def('crit', 0.5, (E, t, o, out) => { // a bright "shing" on top of the hit
  const v = V(o);
  noise(E, t, out, { f: 4200, f1: 1800, q: 2.5, a: 0.002, d: 0.14, peak: 0.35 * v });
  fm(E, t, out, { f: 2093, ratio: 1.5, index: 1.2, index1: 0.05, a: 0.002, d: 0.45, peak: 0.08 * v });
  tone(E, t, out, { f: 3136, a: 0.002, d: 0.35, peak: 0.04 * v });
  return tone(E, t, out, { f: 90, f1: 40, glide: 0.1, a: 0.002, d: 0.15, peak: 0.5 * v });
}, { win: 0.06, cap: 2, send: 0.15 });
def('armor_break', 1.2, (E, t, o, out) => { // crack, scatter, and a low boom + "BROKEN" bell
  const v = V(o), glass = o.material === 'glass';
  noise(E, t, out, { f: 2400, f1: 380, q: 0.6, a: 0.001, d: 0.35, peak: 0.75 * v });
  tone(E, t, out, { f: 75, f1: 32, glide: 0.4, a: 0.003, d: 0.55, peak: 0.85 * v });
  for (let i = 0; i < 6; i++) {
    const at = t + 0.03 + Math.random() * 0.3;
    if (glass) fm(E, at, out, { f: rnd(1800, 4200), ratio: 2.7, index: 1.4, index1: 0.05, a: 0.001, d: rnd(0.2, 0.5), peak: 0.05 * v });
    else partials(E, at, out, { f: rnd(700, 1500), ratios: [1, 2.4, 3.8], d: rnd(0.15, 0.3), peak: 0.06 * v });
  }
  fm(E, t + 0.08, out, { f: 880, ratio: 1.5, index: 1.5, index1: 0.1, a: 0.002, d: 0.9, peak: 0.07 * v });
  return fm(E, t + 0.08, out, { f: 1318.5, ratio: 1.5, index: 1.5, index1: 0.1, a: 0.002, d: 0.9, peak: 0.05 * v });
}, { prio: 2, cap: 2, send: 0.25 });
def('stagger', 0.3, (E, t, o, out) => // stun stars
  fm(E, t, out, { f: 1600, f1: 1200, ratio: 3, index: 1, a: 0.002, d: 0.28, peak: 0.05 * V(o) }));

// ======================================================================
// Movement and actions
// ======================================================================
def('dash', 0.3, (E, t, o, out) => {
  const p = (o.chained ? 1.22 : 1) * Pm(o, 0.04), v = V(o);
  noise(E, t, out, { f: 320 * p, f1: 1900 * p, q: 0.8, a: 0.02, d: 0.2, peak: 0.52 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 650, a: 0.01, d: 0.16, peak: 0.32 * v });
  return tone(E, t + 0.02, out, { f: 880 * p, f1: 1760 * p, glide: 0.14, a: 0.02, d: 0.14, peak: 0.03 * v });
}, { win: 0.05, cap: 2 });
def('footstep', 0.08, (E, t, o, out) => noise(E, t, out, { color: 'pink', ftype: 'lowpass', f: rnd(500, 800), a: 0.002, d: 0.05, peak: 0.12 * V(o) }), { prio: 0, win: 0.1, cap: 1 });
def('snare_throw', 0.3, (E, t, o, out) => { // golden thread zips out, singing
  const p = Pm(o), v = V(o);
  noise(E, t, out, { f: 2000 * p, f1: 6400 * p, q: 4, a: 0.005, d: 0.17, peak: 0.25 * v });
  tone(E, t, out, { f: 620 * p, f1: 1480 * p, glide: 0.16, a: 0.005, d: 0.17, peak: 0.1 * v });
  return fm(E, t + 0.02, out, { f: 1480 * p, ratio: 2, index: 0.8, a: 0.003, d: 0.25, peak: 0.03 * v });
}, { win: 0.08 });
def('snare_hit', 0.6, (E, t, o, out) => { // it lodges: thunk + taut twang
  const p = Pm(o), v = V(o);
  tone(E, t, out, { f: 170, f1: 75, glide: 0.07, a: 0.002, d: 0.09, peak: 0.5 * v });
  pluck(E, t, out, { f: 196 * p, len: 0.9, bright: 0.85, peak: 0.36 * v, d: 0.55, bend: 1.03 });
  return pluck(E, t + 0.004, out, { f: 293.7 * p, len: 0.7, bright: 0.7, peak: 0.15 * v, d: 0.45 });
}, { win: 0.08, send: 0.08 });
def('snare_recall', 0.5, (E, t, o, out) => { // reel in: reverse zip, then the pull twang
  const p = Pm(o), v = V(o);
  noise(E, t, out, { f: 6000 * p, f1: 1500 * p, q: 4, a: 0.03, d: 0.18, peak: 0.24 * v });
  tone(E, t, out, { f: 1500 * p, f1: 520 * p, glide: 0.18, a: 0.01, d: 0.18, peak: 0.08 * v });
  return pluck(E, t + 0.16, out, { f: 246.9 * p, len: 0.8, bright: 0.8, peak: 0.3 * v, d: 0.4 });
}, { win: 0.1 });
def('bind', 0.6, (E, t, o, out) => { // a foe bound by thread
  const v = V(o);
  for (let i = 0; i < 3; i++) pluck(E, t + i * 0.05, out, { f: [392, 494, 587][i], len: 0.6, bright: 0.8, peak: 0.13 * v, d: 0.4 });
  return noise(E, t, out, { f: 3000, f1: 1200, q: 6, a: 0.01, d: 0.25, peak: 0.12 * v });
});
def('special', 0.8, (E, t, o, out) => { // heavy golden burst
  const v = V(o), p = Pm(o, 0.02);
  noise(E, t, out, { f: 300, f1: 2400, q: 0.8, a: 0.05, d: 0.3, peak: 0.45 * v });
  tone(E, t + 0.04, out, { f: 145, f1: 46, glide: 0.4, a: 0.004, d: 0.5, peak: 0.7 * v });
  noise(E, t + 0.04, out, { f: 3200, f1: 300, q: 0.7, a: 0.004, d: 0.5, peak: 0.42 * v });
  fm(E, t + 0.05, out, { f: 880 * p, ratio: 2, index: 1.2, a: 0.01, d: 0.6, peak: 0.06 * v });
  return fm(E, t + 0.05, out, { f: 1318.5 * p, ratio: 2, index: 1.2, a: 0.01, d: 0.6, peak: 0.05 * v });
}, { win: 0.1, cap: 2, send: 0.2 });
def('hero_hurt', 0.4, (E, t, o, out) => {
  const v = V(o);
  tone(E, t, out, { type: 'square', f: 190, f1: 90, glide: 0.18, a: 0.002, d: 0.18, peak: 0.12 * v, ftype: 'lowpass', ff: 1400 });
  noise(E, t, out, { f: 1300, f1: 380, q: 1, a: 0.001, d: 0.16, peak: 0.45 * v });
  tone(E, t, out, { f: 110, f1: 50, glide: 0.1, a: 0.002, d: 0.16, peak: 0.6 * v });
  return fm(E, t + 0.01, out, { f: 622, f1: 466, ratio: 1.41, index: 2, a: 0.003, d: 0.3, peak: 0.05 * v });
}, { prio: 2, win: 0.12, cap: 2, duck: 0.7 });
def('heal', 1.0, (E, t, o, out) => { // rising harp gliss + warm glow
  const v = V(o);
  [62, 66, 69, 74, 78].forEach((m, i) => K.harp(E, t + i * 0.06, out, m, 0.55 * v, { len: 1.4 }));
  return tone(E, t, out, { f: 587, a: 0.15, d: 0.8, peak: 0.04 * v });
}, { send: 0.3, prio: 2 });
def('death_defy', 1.6, (E, t, o, out) => { // a second chance: reverse swell, then a bright held chord
  const v = V(o);
  K.swell(E, t, out, 0.6, 0.5 * v, { f: 300, f1: 6000 });
  K.choir(E, t + 0.55, out, [62, 69, 74, 78], 0.5, 0.8 * v, { vowel: 'a', a: 0.05, r: 1.2 });
  return K.bell(E, t + 0.6, out, 86, 0.6 * v, { d: 2 });
}, { prio: 2, send: 0.4, duck: 0.5 });
def('heartbeat', 0.6, (E, t, o, out) => K.heartbeat(E, t, out, 0.55 * V(o)), { prio: 0, win: 0.3, cap: 1 });

// ======================================================================
// Patrons: calls (ultimates) and boon procs
// ======================================================================
const PATRON = { solenne: 'dawn', dawn: 'dawn', radiance: 'dawn', sun: 'dawn', light: 'dawn', fire: 'dawn',
  maru: 'tide', tide: 'tide', water: 'tide', sea: 'tide',
  veyra: 'storm', storm: 'storm', lightning: 'storm', shock: 'storm',
  ossian: 'stone', stone: 'stone', earth: 'stone', rock: 'stone',
  ilu: 'shade', shade: 'shade', shadow: 'shade', dark: 'shade',
  kestrel: 'wind', wind: 'wind', air: 'wind' };
export const patronKey = (id) => {
  if (!id) return null;
  const s = String(id).toLowerCase();
  if (PATRON[s]) return PATRON[s];
  for (const k in PATRON) if (s.includes(k)) return PATRON[k];
  return null;
};

def('call_dawn', 2.2, (E, t, o, out) => { // radiance: a sunrise chord blooms, choir and bells
  const v = V(o);
  tone(E, t, out, { f: 90, f1: 40, glide: 0.6, a: 0.004, d: 0.8, peak: 0.7 * v });
  K.swell(E, t - 0.0, out, 0.15, 0.3 * v, { f: 800, f1: 8000 });
  K.pad(E, t, out, [62, 69, 74, 78, 81, 88], 0.9, 1.1 * v, { bright: 900, bright1: 7000, a: 0.04, r: 1.2 });
  K.choir(E, t + 0.02, out, [74, 78, 81], 0.8, 0.8 * v, { vowel: 'a', a: 0.06, r: 1 });
  K.bell(E, t + 0.02, out, 86, 0.6 * v, { d: 2 });
  return noise(E, t, out, { ftype: 'highpass', f: 5000, a: 0.05, d: 1.2, peak: 0.12 * v });
}, { prio: 2, send: 0.4, duck: 0.45 });
def('call_tide', 2.0, (E, t, o, out) => { // a wave crashes; bubbles; deep swell
  const v = V(o);
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 300, f1: 1800, f2: 280, glide: 0.35, glide2: 1, a: 0.25, d: 1.3, peak: 0.95 * v });
  noise(E, t + 0.3, out, { color: 'pink', f: 2200, f1: 700, q: 0.7, a: 0.02, d: 1.0, peak: 0.35 * v });
  tone(E, t + 0.25, out, { f: 70, f1: 38, glide: 0.5, a: 0.01, d: 0.9, peak: 0.65 * v });
  for (let i = 0; i < 14; i++) { const f = rnd(300, 900); tone(E, t + 0.3 + Math.random() * 1.1, out, { f, f1: f * rnd(1.8, 2.6), glide: 0.05, a: 0.002, d: 0.07, peak: 0.07 * v }); }
  return fm(E, t + 0.3, out, { f: 392, ratio: 1.5, index: 1, a: 0.05, d: 1.4, peak: 0.05 * v });
}, { prio: 2, send: 0.4, duck: 0.45 });
def('call_storm', 2.2, (E, t, o, out) => { // thunder crack, crackle, rumble
  const v = V(o);
  noise(E, t, out, { ftype: 'highpass', f: 900, a: 0.001, d: 0.1, peak: 0.95 * v });
  tone(E, t, out, { type: 'sawtooth', f: 1400, f1: 120, glide: 0.25, a: 0.002, d: 0.3, peak: 0.12 * v, ftype: 'lowpass', ff: 3000 });
  noise(E, t + 0.04, out, { color: 'brown', ftype: 'lowpass', f: 400, f1: 120, a: 0.03, d: 1.8, peak: 0.9 * v, am: [7, 0.5] });
  for (let i = 0; i < 26; i++) noise(E, t + Math.random() * 0.75, out, { ftype: 'highpass', f: rnd(2500, 7000), a: 0.0005, d: rnd(0.004, 0.02), peak: rnd(0.15, 0.4) * v });
  return tone(E, t, out, { f: 60, f1: 30, glide: 0.8, a: 0.005, d: 1.1, peak: 0.6 * v });
}, { prio: 2, send: 0.35, duck: 0.45 });
def('call_stone', 2.0, (E, t, o, out) => { // quake: shuddering sub, grinding rock, crunches
  const v = V(o);
  tone(E, t, out, { f: 70, f1: 38, glide: 0.3, a: 0.003, d: 0.6, peak: 0.85 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 260, a: 0.02, d: 1.6, peak: 0.95 * v, am: [9, 0.8] });
  tone(E, t + 0.05, out, { f: 46, a: 0.05, d: 1.4, peak: 0.5 * v, vib: [9, 60] });
  for (let i = 0; i < 9; i++) noise(E, t + 0.05 + Math.random() * 1.0, out, { color: 'brown', ftype: 'lowpass', f: rnd(900, 2200), f1: 200, a: 0.001, d: rnd(0.08, 0.2), peak: rnd(0.3, 0.6) * v });
  return noise(E, t, out, { f: 600, q: 2, a: 0.001, d: 0.12, peak: 0.5 * v });
}, { prio: 2, send: 0.3, duck: 0.45 });
def('call_shade', 1.8, (E, t, o, out) => { // shade: breath in, the light drains, a dark bell
  const v = V(o);
  K.swell(E, t, out, 0.45, 0.45 * v, { f: 4000, f1: 300 });
  tone(E, t + 0.45, out, { f: 55, a: 0.01, d: 1.2, peak: 0.5 * v });
  tone(E, t + 0.45, out, { f: 58.3, a: 0.01, d: 1.2, peak: 0.4 * v });
  noise(E, t + 0.45, out, { f: 2800, q: 7, a: 0.05, d: 1.0, peak: 0.22 * v, am: [5, 0.8] });
  return fm(E, t + 0.45, out, { f: 233, ratio: 1.41, index: 3, index1: 0.3, a: 0.003, d: 1.3, peak: 0.12 * v });
}, { prio: 2, send: 0.45, duck: 0.45 });
def('call_wind', 2.0, (E, t, o, out) => { // a cyclone spins up and away
  const v = V(o);
  noise(E, t, out, { f: 300, f1: 2600, f2: 600, glide: 0.6, glide2: 1, q: 2.2, a: 0.2, d: 1.4, peak: 0.7 * v, am: [6, 0.5] });
  noise(E, t, out, { color: 'pink', ftype: 'lowpass', f: 500, a: 0.1, d: 1.2, peak: 0.4 * v });
  tone(E, t + 0.1, out, { f: 1100, f1: 2100, glide: 0.8, a: 0.2, d: 0.9, peak: 0.05 * v, vib: [7, 90] });
  return tone(E, t, out, { f: 80, f1: 45, glide: 0.4, a: 0.01, d: 0.6, peak: 0.45 * v });
}, { prio: 2, send: 0.35, duck: 0.45 });
def('call_ready', 0.8, (E, t, o, out) => { // the call gauge is full
  const v = V(o);
  K.harp(E, t, out, 74, 0.4 * v, { len: 1 }); K.harp(E, t + 0.07, out, 81, 0.4 * v, { len: 1 });
  return K.celesta(E, t + 0.14, out, 86, 0.5 * v, { d: 0.8 });
}, { send: 0.3, win: 1, cap: 1 });

def('proc_dawn', 0.3, (E, t, o, out) => { const v = V(o); noise(E, t, out, { ftype: 'highpass', f: 4200, a: 0.004, d: 0.2, peak: 0.16 * v }); return tone(E, t, out, { f: 1760 * Pm(o), a: 0.004, d: 0.2, peak: 0.035 * v }); }, { win: 0.08, cap: 2 });
def('proc_tide', 0.3, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 1300, f1: 480, q: 1, a: 0.004, d: 0.2, peak: 0.32 * v }); const f = rnd(400, 600); return tone(E, t + 0.03, out, { f, f1: f * 2.3, glide: 0.05, a: 0.002, d: 0.06, peak: 0.08 * v }); }, { win: 0.08, cap: 2 });
def('proc_storm', 0.3, (E, t, o, out) => { // zap + crackle (chain arcs)
  const v = V(o);
  noise(E, t, out, { f: 4200, f1: 1100, q: 3, a: 0.002, d: 0.2, peak: 0.4 * v });
  tone(E, t, out, { type: 'sawtooth', f: 950, f1: 280, glide: 0.12, a: 0.001, d: 0.12, peak: 0.06 * v });
  for (let i = 0; i < 4; i++) noise(E, t + Math.random() * 0.15, out, { ftype: 'highpass', f: 5000, a: 0.0005, d: 0.008, peak: 0.3 * v });
  return t + 0.25;
}, { win: 0.07, cap: 2 });
def('proc_stone', 0.15, (E, t, o, out) => { const v = V(o); noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 1800, a: 0.001, d: 0.07, peak: 0.45 * v }); return tone(E, t, out, { f: 210, f1: 100, glide: 0.06, a: 0.001, d: 0.06, peak: 0.3 * v }); }, { win: 0.08, cap: 2 });
def('proc_shade', 0.3, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 2600, q: 5, a: 0.03, d: 0.2, peak: 0.2 * v }); return tone(E, t, out, { f: 110, f1: 104, a: 0.02, d: 0.2, peak: 0.12 * v }); }, { win: 0.08, cap: 2 });
def('proc_wind', 0.3, (E, t, o, out) => noise(E, t, out, { f: 600, f1: 2200, q: 1.5, a: 0.04, d: 0.22, peak: 0.28 * V(o) }), { win: 0.08, cap: 2 });
def('proc_fire', 0.4, (E, t, o, out) => { const v = V(o); noise(E, t, out, { color: 'pink', ftype: 'lowpass', f: 1600, a: 0.01, d: 0.3, peak: 0.3 * v, am: [30, 0.7] }); return noise(E, t, out, { ftype: 'highpass', f: 5000, a: 0.005, d: 0.25, peak: 0.08 * v }); }, { win: 0.08, cap: 2 });
def('chain', 0.4, (E, t, o, out) => { // storm chain-arc between foes (motion test "zap")
  const v = V(o);
  noise(E, t, out, { f: 4000, f1: 1200, q: 3, a: 0.002, d: 0.22, peak: 0.4 * v });
  tone(E, t, out, { type: 'sawtooth', f: 900, f1: 300, glide: 0.12, a: 0.001, d: 0.12, peak: 0.08 * v });
  for (let i = 0; i < 6; i++) noise(E, t + Math.random() * 0.2, out, { ftype: 'highpass', f: 6000, a: 0.0005, d: 0.006, peak: 0.3 * v });
  return t + 0.3;
}, { win: 0.08, cap: 2 });
def('shield', 0.6, (E, t, o, out) => { const v = V(o); partials(E, t, out, { f: 330, ratios: [1, 1.5, 2.3], d: 0.5, peak: 0.1 * v }); return noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 500, a: 0.02, d: 0.3, peak: 0.4 * v }); });
def('cloak', 0.6, (E, t, o, out) => { const v = V(o); K.swell(E, t, out, 0.25, 0.3 * v, { f: 3000, f1: 400 }); return tone(E, t + 0.25, out, { f: 220, f1: 110, glide: 0.3, a: 0.01, d: 0.3, peak: 0.08 * v }); });

// ======================================================================
// The Unravelled: tells, voices, attacks, spawn and death
// ======================================================================
// Tells rise over the wind-up so the peak lands with the attack (o.dur).
const tellDur = (o, lo = 0.35, hi = 1.4) => clamp(o.dur ?? 0.5, lo, hi);
def('tell', 1.0, (E, t, o, out) => { // generic: short rising whine + rising hiss
  const d = tellDur(o), v = V(o), p = Pm(o, 0.04);
  tone(E, t, out, { type: 'triangle', f: 300 * p, f1: 980 * p, glide: d, a: d * 0.85, d: 0.06, peak: 0.075 * v, vib: [14, 25] });
  return noise(E, t, out, { f: 900, f1: 4200, q: 3, a: d * 0.9, d: 0.05, peak: 0.12 * v });
}, { win: 0.1, cap: 2 });
def('tell_claw', 0.8, (E, t, o, out) => { // Hollow raises its claws: dry rasp drawn tight
  const d = tellDur(o), v = V(o);
  noise(E, t, out, { f: 1200, f1: 2600, q: 3, a: d * 0.8, d: 0.08, peak: 0.2 * v, am: [38, 0.8] });
  return tone(E, t, out, { type: 'triangle', f: 340, f1: 820, glide: d, a: d * 0.85, d: 0.05, peak: 0.05 * v });
}, { win: 0.1, cap: 2 });
def('tell_heavy', 1.2, (E, t, o, out) => { // Knight: armour clank, then a low hum rising
  const d = tellDur(o, 0.4, 1.6), v = V(o);
  partials(E, t, out, { f: rnd(480, 560), ratios: [1, 2.31, 3.72], d: 0.25, peak: 0.09 * v });
  tone(E, t, out, { type: 'sawtooth', f: 68, f1: 120, glide: d, a: d * 0.9, d: 0.08, peak: 0.16 * v, ftype: 'lowpass', ff: 300, ff1: 1100, fglide: d });
  return tone(E, t, out, { type: 'triangle', f: 260, f1: 620, glide: d, a: d * 0.9, d: 0.05, peak: 0.05 * v });
}, { win: 0.12, cap: 2 });
def('tell_cast', 0.9, (E, t, o, out) => { // Needlecaster fans its needles: glassy shimmer rising
  const d = tellDur(o), v = V(o);
  fm(E, t, out, { f: 1200, f1: 2500, glide: d, ratio: 3.01, index: 0.8, index1: 0.8, a: d * 0.85, d: 0.06, peak: 0.07 * v });
  return noise(E, t, out, { ftype: 'highpass', f: 3500, f1: 8000, a: d * 0.9, d: 0.04, peak: 0.08 * v });
}, { win: 0.1, cap: 2 });
def('tell_leap', 0.8, (E, t, o, out) => { // Snarl crouches: a growl that climbs
  const d = tellDur(o), v = V(o);
  tone(E, t, out, { type: 'sawtooth', f: 78, f1: 150, glide: d, a: d * 0.5, hold: d * 0.4, r: 0.05, peak: 0.16 * v, ftype: 'lowpass', ff: 600, ff1: 1400, fglide: d });
  return noise(E, t, out, { f: 500, f1: 1400, q: 2, a: d * 0.6, hold: d * 0.3, r: 0.05, peak: 0.2 * v, am: [32, 0.9] });
}, { win: 0.1, cap: 2 });
def('tell_slam', 1.4, (E, t, o, out) => { // Loomhulk heaves the beam: wood creak and a low rise
  const d = tellDur(o, 0.5, 1.6), v = V(o);
  noise(E, t, out, { f: 160, f1: 260, q: 9, a: 0.05, hold: d * 0.7, r: 0.1, peak: 0.35 * v, am: [11, 0.9] });
  tone(E, t, out, { type: 'sawtooth', f: 45, f1: 85, glide: d, a: d * 0.9, d: 0.08, peak: 0.18 * v, ftype: 'lowpass', ff: 260 });
  return tone(E, t, out, { type: 'triangle', f: 200, f1: 520, glide: d, a: d * 0.9, d: 0.05, peak: 0.04 * v });
}, { win: 0.15, cap: 2 });
def('tell_charge', 1.2, (E, t, o, out) => { // a lane telegraph: scraping hooves of thread
  const d = tellDur(o, 0.4, 1.6), v = V(o);
  noise(E, t, out, { color: 'pink', f: 400, f1: 2000, q: 1.5, a: d * 0.9, d: 0.06, peak: 0.25 * v, am: [9, 0.8] });
  return tone(E, t, out, { type: 'triangle', f: 160, f1: 480, glide: d, a: d * 0.9, d: 0.05, peak: 0.06 * v });
}, { win: 0.12, cap: 2 });
def('tell_song', 1.2, (E, t, o, out) => { // Chorister: a breathy note swelling up
  const d = tellDur(o, 0.4, 1.6), v = V(o);
  return K.choir(E, t, out, [67 + Math.round(Math.random() * 2)], d, 0.9 * v, { vowel: 'u', vowel2: 'a', a: d * 0.9, r: 0.2, vib: 14 });
}, { win: 0.15, cap: 2 });
def('tell_boss', 1.6, (E, t, o, out) => { // big boss wind-up: rising braam-ish whine
  const d = tellDur(o, 0.5, 2), v = V(o);
  tone(E, t, out, { type: 'sawtooth', f: 55, f1: 110, glide: d, a: d * 0.9, d: 0.1, peak: 0.18 * v, ftype: 'lowpass', ff: 200, ff1: 1600, fglide: d });
  tone(E, t, out, { type: 'triangle', f: 220, f1: 880, glide: d, a: d * 0.9, d: 0.06, peak: 0.06 * v });
  return noise(E, t, out, { f: 600, f1: 5000, q: 2, a: d * 0.95, d: 0.04, peak: 0.14 * v });
}, { win: 0.15, cap: 2 });

def('rasp', 0.4, (E, t, o, out) => noise(E, t, out, { f: rnd(1200, 1900), q: 3, a: 0.04, d: 0.28, peak: 0.16 * V(o), am: [rnd(30, 45), 0.85] }), { prio: 0, win: 0.25, cap: 1 });
def('growl', 0.6, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 420, q: 2, a: 0.05, d: 0.45, peak: 0.25 * v, am: [30, 0.9] }); return tone(E, t, out, { type: 'sawtooth', f: 72, f1: 60, a: 0.05, d: 0.45, peak: 0.1 * v, ftype: 'lowpass', ff: 500 }); }, { prio: 0, win: 0.3, cap: 1 });
def('clank', 0.3, (E, t, o, out) => partials(E, t, out, { f: rnd(500, 640), ratios: [1, 2.31, 3.72, 5.1], d: 0.22, peak: 0.08 * V(o) }), { prio: 0, win: 0.12, cap: 2 });
def('claw', 0.25, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 2600, f1: 900, q: 1.5, a: 0.005, d: 0.12, peak: 0.42 * v }); return noise(E, t + 0.06, out, { f: 2200, f1: 800, q: 1.5, a: 0.005, d: 0.12, peak: 0.36 * v }); });
def('slam', 0.9, (E, t, o, out) => { // a greatsword or beam meets the floor
  const v = V(o);
  tone(E, t, out, { f: 80, f1: 34, glide: 0.25, a: 0.002, d: 0.5, peak: 0.85 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 1200, f1: 200, a: 0.001, d: 0.45, peak: 0.85 * v });
  return noise(E, t, out, { f: 1500, f1: 400, q: 0.8, a: 0.001, d: 0.25, peak: 0.3 * v });
}, { prio: 2, cap: 2, send: 0.15 });
def('shockwave', 0.7, (E, t, o, out) => { const v = V(o); noise(E, t, out, { color: 'pink', f: 300, f1: 1400, q: 0.8, a: 0.02, d: 0.5, peak: 0.45 * v }); return tone(E, t, out, { f: 60, f1: 40, a: 0.01, d: 0.45, peak: 0.4 * v }); }, { cap: 2 });
def('leap', 0.4, (E, t, o, out) => noise(E, t, out, { color: 'pink', f: 500, f1: 1600, q: 1, a: 0.05, d: 0.25, peak: 0.35 * V(o) }));
def('teleport', 0.5, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 5000, f1: 600, q: 4, a: 0.01, d: 0.25, peak: 0.25 * v }); return fm(E, t, out, { f: 1400, f1: 500, ratio: 1.41, index: 2, a: 0.005, d: 0.3, peak: 0.06 * v }); });
def('pull', 0.8, (E, t, o, out) => { // Unspooler's black thread draws taut
  const v = V(o);
  tone(E, t, out, { type: 'sawtooth', f: 90, f1: 150, a: 0.05, hold: 0.4, r: 0.2, peak: 0.12 * v, ftype: 'lowpass', ff: 900 });
  return noise(E, t, out, { f: 1800, q: 8, a: 0.05, hold: 0.4, r: 0.2, peak: 0.2 * v, am: [17, 0.6] });
});
def('fire_breath', 1.2, (E, t, o, out) => { // Bellows Brute's cone
  const v = V(o);
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 400, f1: 1600, a: 0.08, hold: 0.6, r: 0.3, peak: 0.8 * v, am: [13, 0.5] });
  return noise(E, t, out, { ftype: 'highpass', f: 2500, a: 0.1, hold: 0.5, r: 0.3, peak: 0.15 * v, am: [37, 0.8] });
}, { cap: 2, send: 0.1 });
def('censer', 0.6, (E, t, o, out) => { // Lantern Warden swings: chain jingle + whoosh
  const v = V(o);
  for (let i = 0; i < 4; i++) partials(E, t + i * 0.04, out, { f: rnd(2400, 3600), ratios: [1, 2.6], d: 0.12, peak: 0.04 * v });
  return noise(E, t, out, { f: 500, f1: 1500, q: 1, a: 0.05, d: 0.3, peak: 0.3 * v });
});

def('spawn', 0.9, (E, t, o, out) => { // black-thread vortex rising out of the floor
  const v = V(o);
  noise(E, t, out, { f: 300, f1: 1700, q: 3, a: 0.45, d: 0.2, peak: 0.2 * v, am: [9, 0.6] });
  tone(E, t, out, { type: 'triangle', f: 110, f1: 220, glide: 0.6, a: 0.4, d: 0.2, peak: 0.08 * v });
  return tone(E, t + 0.55, out, { f: 90, f1: 45, glide: 0.1, a: 0.003, d: 0.15, peak: 0.3 * v });
}, { prio: 0, win: 0.12, cap: 3 });
def('unravel', 0.7, (E, t, o, out) => { // death: threads snap, curl away, the eye-light goes out
  const v = V(o), p = Pm(o, 0.06);
  for (let i = 0; i < 6; i++) pluck(E, t + Math.random() * 0.22, out, { f: rnd(500, 1300) * p, len: 0.4, bright: 0.9, peak: 0.12 * v, d: 0.25 });
  noise(E, t, out, { f: 2200, f1: 380, q: 1.2, a: 0.01, d: 0.4, peak: 0.28 * v });
  tone(E, t, out, { f: 660 * p, f1: 200 * p, glide: 0.35, a: 0.005, d: 0.32, peak: 0.06 * v });
  return tone(E, t, out, { f: 120, f1: 50, glide: 0.1, a: 0.002, d: 0.12, peak: 0.35 * v });
}, { win: 0.06, cap: 3, send: 0.12 });
def('unravel_elite', 1.6, (E, t, o, out) => { // elites: bigger, with a magenta-red bell
  const v = V(o);
  for (let i = 0; i < 12; i++) pluck(E, t + Math.random() * 0.45, out, { f: rnd(300, 1400), len: 0.5, bright: 0.9, peak: 0.12 * v, d: 0.35 });
  noise(E, t, out, { f: 2600, f1: 260, q: 0.9, a: 0.01, d: 0.8, peak: 0.45 * v });
  tone(E, t, out, { f: 70, f1: 30, glide: 0.5, a: 0.003, d: 0.6, peak: 0.75 * v });
  return fm(E, t + 0.05, out, { f: 466, f1: 233, ratio: 1.41, index: 2.5, a: 0.003, d: 1.2, peak: 0.1 * v });
}, { prio: 2, cap: 2, send: 0.25 });
def('thorn_burst', 0.6, (E, t, o, out) => { // Thornling death: glows, then bursts into thorns
  const v = V(o);
  for (let i = 0; i < 5; i++) fm(E, t + i * 0.015, out, { f: rnd(1800, 3600), ratio: 2.7, index: 1.5, index1: 0.05, a: 0.001, d: rnd(0.2, 0.4), peak: 0.06 * v });
  return noise(E, t, out, { ftype: 'highpass', f: 3000, a: 0.001, d: 0.2, peak: 0.4 * v });
}, { cap: 2 });
def('thorn_warn', 0.5, (E, t, o, out) => fm(E, t, out, { f: 900, f1: 2400, glide: 0.45, ratio: 3, index: 0.8, a: 0.4, d: 0.05, peak: 0.06 * V(o) }), { win: 0.1, cap: 2 });

// ---- projectiles --------------------------------------------------------
def('needle', 0.35, (E, t, o, out) => { // Needlecaster's fan: glassy whistle
  const v = V(o), p = Pm(o, 0.05);
  tone(E, t, out, { f: 2500 * p, f1: 1600 * p, glide: 0.3, a: 0.005, d: 0.3, peak: 0.05 * v });
  tone(E, t + 0.01, out, { f: 2560 * p, f1: 1650 * p, glide: 0.3, a: 0.005, d: 0.28, peak: 0.03 * v });
  return noise(E, t, out, { ftype: 'highpass', f: 6000, a: 0.002, d: 0.08, peak: 0.12 * v });
}, { win: 0.08, cap: 2 });
def('orb', 0.35, (E, t, o, out) => { const v = V(o); tone(E, t, out, { f: 520, f1: 260, glide: 0.25, a: 0.004, d: 0.25, peak: 0.08 * v }); return fm(E, t, out, { f: 780, f1: 390, ratio: 1.5, index: 1, a: 0.004, d: 0.2, peak: 0.03 * v }); }, { win: 0.08, cap: 2 });
def('hammer_throw', 0.6, (E, t, o, out) => { // tumbling molten hammer
  const v = V(o);
  noise(E, t, out, { color: 'pink', ftype: 'lowpass', f: 900, a: 0.03, d: 0.5, peak: 0.4 * v, am: [11, 0.9] });
  return noise(E, t, out, { ftype: 'highpass', f: 4000, a: 0.05, d: 0.4, peak: 0.07 * v, am: [40, 0.6] });
}, { win: 0.1, cap: 2 });
def('sizzle', 0.9, (E, t, o, out) => noise(E, t, out, { ftype: 'highpass', f: 3500, f1: 2000, a: 0.01, d: 0.8, peak: 0.16 * V(o), am: [23, 0.5] }), { prio: 0, win: 0.15, cap: 2 });
def('arrow', 0.3, (E, t, o, out) => noise(E, t, out, { f: 3000, f1: 1600, q: 6, a: 0.01, d: 0.25, peak: 0.12 * V(o) }), { prio: 0, win: 0.05, cap: 3 });
def('song_ring', 1.2, (E, t, o, out) => { // a song wave rolls out across the floor
  const v = V(o);
  K.choir(E, t, out, [60 + Math.round(Math.random() * 3)], 0.7, 0.7 * v, { vowel: 'o', vowel2: 'u', a: 0.05, r: 0.5, vib: 20 });
  return noise(E, t, out, { color: 'pink', f: 600, f1: 300, q: 1, a: 0.05, d: 0.9, peak: 0.15 * v });
}, { win: 0.15, cap: 2, send: 0.3 });
def('projectile', 0.3, (E, t, o, out) => noise(E, t, out, { f: 1200, f1: 700, q: 2, a: 0.01, d: 0.2, peak: 0.18 * V(o) }), { prio: 0, win: 0.06, cap: 2 });

// ---- explosions ---------------------------------------------------------
def('explode', 1.0, (E, t, o, out) => {
  const v = V(o), el = o.element;
  tone(E, t, out, { f: 120, f1: 36, glide: 0.35, a: 0.002, d: 0.6, peak: 0.85 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 1800, f1: 160, a: 0.001, d: 0.6, peak: 0.8 * v });
  if (el === 'fire' || el === 'molten' || el === 'dawn') noise(E, t + 0.05, out, { ftype: 'highpass', f: 3000, a: 0.02, d: 0.7, peak: 0.12 * v, am: [27, 0.6] });
  else if (el === 'storm') noise(E, t, out, { ftype: 'highpass', f: 1500, a: 0.001, d: 0.08, peak: 0.6 * v });
  else if (el === 'tide') noise(E, t, out, { f: 1200, f1: 400, q: 0.8, a: 0.01, d: 0.4, peak: 0.4 * v });
  else if (el === 'glass') for (let i = 0; i < 4; i++) fm(E, t + i * 0.02, out, { f: rnd(1800, 3800), ratio: 2.7, index: 1.4, a: 0.001, d: 0.35, peak: 0.05 * v });
  return t + 0.8;
}, { cap: 3, send: 0.2 });

// ======================================================================
// Bosses
// ======================================================================
// Queen Veyl: glass thorns
def('veyl_thorns', 1.0, (E, t, o, out) => { // thorn lanes erupt, stepping toward Iri
  const v = V(o);
  for (let i = 0; i < 7; i++) {
    const at = t + i * 0.055;
    noise(E, at, out, { ftype: 'highpass', f: 2200 + i * 300, a: 0.001, d: 0.08, peak: 0.25 * v });
    fm(E, at, out, { f: 1500 + i * 220 + rnd(-80, 80), ratio: 2.7, index: 1.6, index1: 0.05, a: 0.001, d: 0.3, peak: 0.05 * v });
    tone(E, at, out, { f: 140, f1: 70, glide: 0.05, a: 0.001, d: 0.06, peak: 0.18 * v });
  }
  return t + 0.8;
}, { prio: 2, cap: 2, send: 0.3 });
def('veyl_volley', 1.2, (E, t, o, out) => { // glass rain falls whistling
  const v = V(o);
  for (let i = 0; i < 6; i++) { const f = rnd(2600, 3600); tone(E, t + i * 0.08, out, { f, f1: f * 0.45, glide: 0.5, a: 0.02, d: 0.5, peak: 0.035 * v }); }
  return noise(E, t, out, { ftype: 'highpass', f: 6000, f1: 3000, a: 0.3, d: 0.4, peak: 0.08 * v });
}, { prio: 2, cap: 2, send: 0.3 });
def('veyl_shatter', 0.7, (E, t, o, out) => { // a falling shard lands
  const v = V(o);
  for (let i = 0; i < 4; i++) fm(E, t + i * 0.01, out, { f: rnd(2000, 4400), ratio: 2.7, index: 1.5, index1: 0.05, a: 0.001, d: rnd(0.25, 0.6), peak: 0.06 * v });
  noise(E, t, out, { ftype: 'highpass', f: 4000, f1: 1800, a: 0.001, d: 0.25, peak: 0.35 * v });
  return tone(E, t, out, { f: 150, f1: 60, glide: 0.08, a: 0.002, d: 0.1, peak: 0.3 * v });
}, { win: 0.05, cap: 4, send: 0.2 });
def('veyl_claw', 0.8, (E, t, o, out) => { // a sweeping arc of glass talons
  const v = V(o);
  noise(E, t, out, { f: 500, f1: 4800, q: 1.2, a: 0.12, d: 0.3, peak: 0.6 * v });
  for (let i = 0; i < 5; i++) fm(E, t + 0.1 + i * 0.03, out, { f: 1800 + i * 300, ratio: 3, index: 1, a: 0.002, d: 0.3, peak: 0.04 * v });
  return tone(E, t + 0.1, out, { f: 90, f1: 40, glide: 0.2, a: 0.003, d: 0.3, peak: 0.5 * v });
}, { prio: 2, cap: 2, send: 0.25 });
def('veyl_ring', 1.4, (E, t, o, out) => { // a spinning ring of thorns: shimmering chorus
  const v = V(o);
  for (const f of [1760, 2217, 2637]) fm(E, t, out, { f, ratio: 3.01, index: 0.6, index1: 0.4, a: 0.2, d: 1.1, peak: 0.03 * v });
  return noise(E, t, out, { ftype: 'highpass', f: 5000, a: 0.2, d: 1.0, peak: 0.08 * v, am: [12, 0.8] });
}, { prio: 2, cap: 2, send: 0.35 });
def('veyl_summon', 1.2, (E, t, o, out) => { // calls her Glass Knights: a cold chime chord, rising
  const v = V(o);
  K.swell(E, t, out, 0.5, 0.3 * v, { f: 800, f1: 7000 });
  for (const m of [76, 81, 84, 88]) K.glass(E, t + 0.5, out, m, 0.8 * v, { d: 1.2 });
  return t + 1.6;
}, { prio: 2, send: 0.4 });

// Cantor Morrow: drowned choir, water rings
def('morrow_choir', 2.4, (E, t, o, out) => { // the drowned choir swells
  const v = V(o);
  K.choir(E, t, out, [48, 55, 60, 63], 1.6, 1.0 * v, { vowel: 'o', vowel2: 'a', a: 0.6, r: 1.2 });
  return K.bell(E, t + 0.5, out, 48, 0.5 * v, { d: 3 });
}, { prio: 2, cap: 1, win: 0.5, send: 0.5 });
def('morrow_ring', 1.6, (E, t, o, out) => { // a water ring: deep bell, ripples, a sung note
  const v = V(o);
  fm(E, t, out, { f: 196, ratio: 1.4, index: 2.6, index1: 0.3, a: 0.003, d: 1.6, peak: 0.12 * v });
  noise(E, t, out, { color: 'pink', f: 900, f1: 260, q: 2, a: 0.01, d: 1.0, peak: 0.25 * v, am: [6, 0.7] });
  return tone(E, t + 0.05, out, { f: 392, a: 0.08, d: 1.0, peak: 0.05 * v, vib: [5, 20] });
}, { prio: 2, cap: 3, win: 0.1, send: 0.45 });
def('morrow_lantern', 0.9, (E, t, o, out) => { // lantern-staff sweep
  const v = V(o);
  for (let i = 0; i < 5; i++) partials(E, t + i * 0.035, out, { f: rnd(2000, 3200), ratios: [1, 2.6], d: 0.15, peak: 0.04 * v });
  noise(E, t, out, { f: 400, f1: 2200, q: 1.1, a: 0.1, d: 0.35, peak: 0.5 * v });
  return noise(E, t + 0.05, out, { color: 'pink', ftype: 'lowpass', f: 1600, a: 0.05, d: 0.5, peak: 0.2 * v, am: [21, 0.6] });
}, { prio: 2, cap: 2, send: 0.3 });
def('morrow_flood', 2.2, (E, t, o, out) => { // a section of floor floods
  const v = V(o);
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 250, f1: 1200, f2: 300, glide: 0.6, glide2: 1.2, a: 0.4, d: 1.4, peak: 0.85 * v });
  for (let i = 0; i < 10; i++) { const f = rnd(250, 700); tone(E, t + 0.2 + Math.random() * 1.4, out, { f, f1: f * 2.2, glide: 0.05, a: 0.002, d: 0.07, peak: 0.06 * v }); }
  return t + 2;
}, { prio: 2, cap: 1, win: 0.4, send: 0.3 });
def('morrow_summon', 1.4, (E, t, o, out) => K.choir(E, t, out, [55, 62], 1.0, 0.8 * V(o), { vowel: 'u', vowel2: 'o', a: 0.3, r: 0.6, vib: 18 }), { prio: 2, send: 0.5 });

// Aurum: forge hammer, molten hiss
def('aurum_hammer', 2.0, (E, t, o, out) => { // the anvil-sized hammer falls
  const v = V(o);
  partials(E, t, out, { f: 330, ratios: [1, 2.03, 2.8, 4.1, 5.6, 7.3], amps: [1, 0.8, 0.6, 0.45, 0.3, 0.2], d: 1.7, peak: 0.16 * v });
  tone(E, t, out, { f: 70, f1: 30, glide: 0.4, a: 0.002, d: 0.9, peak: 0.95 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 2000, f1: 150, a: 0.001, d: 0.7, peak: 0.9 * v });
  return noise(E, t, out, { ftype: 'highpass', f: 3000, a: 0.001, d: 0.06, peak: 0.6 * v });
}, { prio: 2, cap: 2, send: 0.35, duck: 0.65 });
def('aurum_hiss', 1.4, (E, t, o, out) => { // molten gold spills and hisses
  const v = V(o);
  noise(E, t, out, { ftype: 'highpass', f: 4200, f1: 2200, a: 0.03, d: 1.2, peak: 0.25 * v, am: [19, 0.6] });
  for (let i = 0; i < 7; i++) { const f = rnd(90, 200); tone(E, t + Math.random() * 1.0, out, { f, f1: f * 0.6, glide: 0.06, a: 0.003, d: 0.08, peak: 0.12 * v }); }
  return noise(E, t, out, { color: 'pink', ftype: 'lowpass', f: 700, a: 0.05, d: 1.0, peak: 0.25 * v });
}, { prio: 2, cap: 2, send: 0.2 });
def('aurum_anvil', 1.4, (E, t, o, out) => { // a thrown anvil: heavy whoosh then ring
  const v = V(o), land = o.land ?? 0.45;
  noise(E, t, out, { color: 'pink', f: 300, f1: 1200, q: 1, a: land * 0.8, d: 0.1, peak: 0.4 * v, am: [7, 0.7] });
  partials(E, t + land, out, { f: 420, ratios: [1, 2.03, 2.8, 4.1, 5.6], d: 1.0, peak: 0.12 * v });
  return tone(E, t + land, out, { f: 80, f1: 34, glide: 0.3, a: 0.002, d: 0.5, peak: 0.8 * v });
}, { prio: 2, cap: 2, send: 0.3 });
def('aurum_heat', 2.4, (E, t, o, out) => { // he heats the forge: a rising furnace roar
  const v = V(o);
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 200, f1: 1800, a: 1.6, d: 0.6, peak: 0.85 * v, am: [5, 0.4] });
  K.braam(E, t + 1.5, out, 29, 1.6, 0.9 * v);
  return t + 3;
}, { prio: 2, cap: 1, win: 1, send: 0.3, duck: 0.6 });
def('aurum_step', 0.5, (E, t, o, out) => { const v = V(o); tone(E, t, out, { f: 60, f1: 35, glide: 0.1, a: 0.002, d: 0.3, peak: 0.6 * v }); return partials(E, t, out, { f: 180, ratios: [1, 2.03, 2.8], d: 0.35, peak: 0.05 * v }); }, { prio: 0, win: 0.15, cap: 1 });

// Sable: black-thread distortion
def('sable_thread', 1.4, (E, t, o, out) => { // a ring-modulated warble, detuned and falling
  const c = E.ctx, v = V(o), d = 1.1;
  const car = c.createOscillator(), rm = c.createGain(), mod = c.createOscillator(), mg = c.createGain();
  car.type = 'sawtooth'; car.frequency.setValueAtTime(330, t); car.frequency.exponentialRampToValueAtTime(110, t + d);
  mod.frequency.setValueAtTime(37, t); mod.frequency.linearRampToValueAtTime(19, t + d);
  rm.gain.value = 0; mg.gain.value = 1; mod.connect(mg); mg.connect(rm.gain); car.connect(rm);
  const ws = c.createWaveShaper(); ws.curve = driveCurve(3);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(500, t + d);
  const g = c.createGain(); K.envS(g.gain, t, 0.22 * v, 0.03, d - 0.3, 0.3);
  rm.connect(ws); ws.connect(lp); lp.connect(g); g.connect(out);
  car.start(t); mod.start(t); car.stop(t + d + 0.1); mod.stop(t + d + 0.1);
  tone(E, t, out, { type: 'sawtooth', f: 110, f1: 104, a: 0.05, d: d, peak: 0.08 * v, ftype: 'lowpass', ff: 600 });
  return noise(E, t, out, { f: 1200, f1: 300, q: 4, a: 0.2, d: 0.8, peak: 0.2 * v, am: [13, 0.9] });
}, { prio: 2, cap: 2, send: 0.35 });
def('sable_lunge', 0.6, (E, t, o, out) => { // needle-sword lunge
  const v = V(o);
  noise(E, t, out, { f: 600, f1: 5000, q: 1.6, a: 0.04, d: 0.2, peak: 0.5 * v });
  noise(E, t + 0.05, out, { f: 5200, f1: 2600, q: 4, a: 0.003, d: 0.25, peak: 0.25 * v });
  return tone(E, t + 0.05, out, { type: 'sawtooth', f: 2400, f1: 1900, glide: 0.3, a: 0.003, d: 0.3, peak: 0.03 * v, ftype: 'bandpass', ff: 2400, q: 6 });
}, { prio: 2, cap: 2, send: 0.2 });
def('sable_snare', 1.0, (E, t, o, out) => { // black thread snares Iri and pulls
  const v = V(o);
  noise(E, t, out, { f: 5000, f1: 900, q: 5, a: 0.01, d: 0.25, peak: 0.25 * v });
  pluck(E, t + 0.18, out, { f: 98, len: 1.0, bright: 0.9, peak: 0.4 * v, d: 0.7, bend: 0.97 });
  return tone(E, t + 0.18, out, { type: 'sawtooth', f: 98, f1: 92, a: 0.01, d: 0.6, peak: 0.07 * v, ftype: 'lowpass', ff: 900 });
}, { prio: 2, cap: 2, send: 0.25 });
def('sable_echo', 0.9, (E, t, o, out) => { // summons Echoes: reversed dash whooshes, detuned
  const v = V(o);
  K.swell(E, t, out, 0.35, 0.35 * v, { f: 400, f1: 3000 });
  noise(E, t + 0.35, out, { f: 1900, f1: 320, q: 0.8, a: 0.003, d: 0.2, peak: 0.4 * v });
  return tone(E, t + 0.35, out, { f: 1760, f1: 830, glide: 0.2, a: 0.005, d: 0.2, peak: 0.04 * v, vib: [30, 60] });
}, { prio: 2, cap: 2, send: 0.3 });
def('sable_unmask', 3.0, (E, t, o, out) => { // phase 2: the mask falls; a sub drop into a reversed choir
  const v = V(o);
  K.choir(E, t, out, [47, 54, 59, 62], 1.2, 0.9 * v, { vowel: 'u', vowel2: 'a', a: 1.15, r: 0.05 });
  tone(E, t + 1.2, out, { f: 90, f1: 25, glide: 1.4, a: 0.003, d: 1.6, peak: 0.9 * v });
  partials(E, t + 1.2, out, { f: 123.5, ratios: [1, 1.41, 2.76, 3.2], d: 2.5, peak: 0.1 * v });
  return noise(E, t + 1.2, out, { f: 2000, f1: 200, q: 1, a: 0.002, d: 1.2, peak: 0.5 * v });
}, { prio: 2, cap: 1, win: 1, send: 0.5, duck: 0.3 });

// Generic boss moments
def('boss_intro', 3.0, (E, t, o, out) => { // title card: a deep drum, a choir hit, a shimmer
  const v = V(o);
  K.taiko(E, t, out, 1.0 * v, { f: 60, d: 1.2 });
  K.braam(E, t, out, o.root ?? 33, 2.2, 0.9 * v);
  K.choir(E, t + 0.02, out, [(o.root ?? 33) + 24, (o.root ?? 33) + 31, (o.root ?? 33) + 36], 1.4, 0.8 * v, { vowel: 'a', a: 0.04, r: 1.4 });
  return noise(E, t, out, { ftype: 'highpass', f: 6000, a: 0.002, d: 1.2, peak: 0.1 * v });
}, { prio: 2, cap: 1, win: 1, send: 0.5, duck: 0.15 });
def('boss_phase', 2.0, (E, t, o, out) => { // phase two: a braam and a cracking sting
  const v = V(o);
  K.braam(E, t, out, (o.root ?? 33), 1.8, 1.0 * v, { bright: 1800 });
  K.timpani(E, t, out, (o.root ?? 33) + 12, 0.9 * v);
  return noise(E, t, out, { f: 2400, f1: 300, q: 0.7, a: 0.002, d: 0.6, peak: 0.55 * v });
}, { prio: 2, cap: 1, win: 1, send: 0.4, duck: 0.25 });
def('boss_defeat', 4.5, (E, t, o, out) => { // release: a boom, an unravelling cascade, a major chord
  const v = V(o);
  tone(E, t, out, { f: 80, f1: 24, glide: 1.4, a: 0.002, d: 1.8, peak: 1.0 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 2400, f1: 120, a: 0.001, d: 1.5, peak: 0.9 * v });
  for (let i = 0; i < 18; i++) pluck(E, t + 0.1 + i * 0.07 + Math.random() * 0.04, out, { f: mtof(86 - i * 2 + (Math.random() * 3 | 0)), len: 0.8, bright: 0.8, peak: 0.1 * v, d: 0.5 });
  const r = o.root ?? 62;
  K.choir(E, t + 1.3, out, [r, r + 4, r + 7, r + 12], 2.2, 0.8 * v, { vowel: 'a', a: 0.8, r: 2 });
  return K.bell(E, t + 1.4, out, r + 24, 0.6 * v, { d: 3.5 });
}, { prio: 2, cap: 1, win: 2, send: 0.5, duck: 0.05 });

// ======================================================================
// Rewards, rooms, saves, UI
// ======================================================================
const RARITY = { common: 0, rare: 1, epic: 2, mythic: 3, legendary: 3, duo: 3, braid: 3 };
def('card', 1.4, (E, t, o, out) => { // a boon card turns over; rarer cards sing more notes
  const v = V(o), r = RARITY[o.rarity] ?? 0;
  noise(E, t, out, { f: 1200, f1: 4200, q: 1.2, a: 0.03, d: 0.14, peak: 0.25 * v });
  const notes = [[81], [79, 86], [76, 83, 88], [74, 81, 86, 93]][r];
  notes.forEach((m, i) => (r >= 2 ? K.celesta : K.harp)(E, t + 0.06 + i * 0.075, out, m, 0.55 * v, { len: 1.6, d: 1.2 }));
  if (r >= 2) fm(E, t + 0.08, out, { f: mtof(notes[notes.length - 1] + 12), ratio: 3.01, index: 0.8, a: 0.02, d: 0.9, peak: 0.03 * v });
  if (r >= 3) {
    K.choir(E, t + 0.1, out, [62, 69, 74], 0.8, 0.5 * v, { vowel: 'a', a: 0.2, r: 0.9 });
    noise(E, t + 0.1, out, { ftype: 'highpass', f: 7000, a: 0.2, d: 0.9, peak: 0.06 * v, am: [16, 0.9] });
  }
  return t + 1.4;
}, { win: 0.05, cap: 6, send: 0.35 });
def('offer', 0.6, (E, t, o, out) => { // cards fan out
  const v = V(o);
  for (let i = 0; i < 3; i++) noise(E, t + i * 0.07, out, { f: 1500, f1: 3500, q: 1, a: 0.01, d: 0.08, peak: 0.18 * v });
  return K.swell(E, t, out, 0.3, 0.15 * v, { f: 600, f1: 5000 });
}, { send: 0.2 });
def('boon_take', 1.6, (E, t, o, out) => { // a boon is woven in: the patron's colour and a warm chord
  const v = V(o), k = o.patron ? patronKey(o.patron) : null;
  const roots = { dawn: 74, tide: 67, storm: 76, stone: 62, shade: 69, wind: 79 };
  const r = roots[k] ?? 74;
  K.swell(E, t, out, 0.18, 0.18 * v, { f: 2000, f1: 8000 });
  [r, r + 7, r + 12].forEach((m, i) => K.harp(E, t + 0.15 + i * 0.05, out, m, 0.6 * v, { len: 1.8 }));
  K.pad(E, t + 0.15, out, [r - 12, r - 5, r], 0.5, 0.8 * v, { bright: 2400, a: 0.03, r: 1 });
  if (k === 'storm') SFX.proc_storm.fn(E, t + 0.15, { vel: 0.5 }, out);
  else if (k === 'tide') SFX.proc_tide.fn(E, t + 0.15, { vel: 0.6 }, out);
  else if (k === 'wind') SFX.proc_wind.fn(E, t + 0.15, { vel: 0.6 }, out);
  else if (k === 'stone') SFX.proc_stone.fn(E, t + 0.15, { vel: 0.6 }, out);
  else if (k === 'shade') SFX.proc_shade.fn(E, t + 0.15, { vel: 0.6 }, out);
  else SFX.proc_dawn.fn(E, t + 0.15, { vel: 0.5 }, out);
  return t + 1.6;
}, { prio: 2, send: 0.35, cap: 2 });
def('reroll', 0.5, (E, t, o, out) => { const v = V(o); for (let i = 0; i < 4; i++) noise(E, t + i * 0.05, out, { f: 2500, q: 1, a: 0.005, d: 0.04, peak: 0.2 * v }); return K.harp(E, t + 0.22, out, 79, 0.4 * v, { len: 1 }); });

def('pickup_heal', 1.0, (E, t, o, out) => SFX.heal.fn(E, t, o, out), { send: 0.3, prio: 2 });
def('pickup_lumen', 0.5, (E, t, o, out) => { // currency: two bright coin glints
  const v = V(o), p = Pm(o, 0.03);
  fm(E, t, out, { f: 2093 * p, ratio: 2.4, index: 1, a: 0.001, d: 0.25, peak: 0.07 * v });
  return fm(E, t + 0.06, out, { f: 3136 * p, ratio: 2.4, index: 1, a: 0.001, d: 0.3, peak: 0.06 * v });
}, { win: 0.05, cap: 4 });
def('pickup_shard', 0.8, (E, t, o, out) => { const v = V(o); K.glass(E, t, out, 88, 0.8 * v, { d: 0.7 }); return K.glass(E, t + 0.08, out, 95, 0.6 * v, { d: 0.6 }); }, { send: 0.3, win: 0.05, cap: 3 });
def('pickup_key', 0.6, (E, t, o, out) => { const v = V(o); for (let i = 0; i < 3; i++) partials(E, t + i * 0.06, out, { f: rnd(1800, 2600), ratios: [1, 2.7, 4.1], d: 0.25, peak: 0.06 * v }); return t + 0.5; });
def('pickup_knot', 0.9, (E, t, o, out) => { const v = V(o); pluck(E, t, out, { f: 220, len: 1, bright: 0.85, peak: 0.3 * v, d: 0.6, bend: 1.06 }); return K.celesta(E, t + 0.1, out, 81, 0.6 * v); }, { send: 0.3 });
def('pickup_memory', 2.2, (E, t, o, out) => { // a Memory Thread: the Weaver's motif on a music box
  const v = V(o);
  [69, 65, 64, 62].forEach((m, i) => K.musicBox(E, t + i * 0.32, out, m + 12, 0.8 * v, { d: 1.6 }));
  return K.pad(E, t, out, [50, 57, 62, 65], 1.6, 0.6 * v, { bright: 900, a: 0.4, r: 1.2 });
}, { prio: 2, send: 0.5 });
def('pickup', 0.4, (E, t, o, out) => K.harp(E, t, out, 81, 0.5 * V(o), { len: 1 }), { win: 0.05, cap: 4, send: 0.2 });

def('door_open', 1.4, (E, t, o, out) => { // a thread-door unlocks: stone grind and a rising shimmer
  const v = V(o);
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 380, a: 0.05, hold: 0.6, r: 0.3, peak: 0.6 * v, am: [14, 0.6] });
  tone(E, t, out, { f: 55, a: 0.05, hold: 0.5, r: 0.3, peak: 0.3 * v });
  [62, 69, 74, 81].forEach((m, i) => K.harp(E, t + 0.3 + i * 0.08, out, m, 0.45 * v, { len: 1.5 }));
  return t + 1.4;
}, { prio: 2, cap: 1, win: 0.3, send: 0.3 });
def('door_locked', 0.3, (E, t, o, out) => { const v = V(o); tone(E, t, out, { f: 130, f1: 90, glide: 0.08, a: 0.002, d: 0.12, peak: 0.4 * v }); return noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 700, a: 0.002, d: 0.1, peak: 0.4 * v }); }, { win: 0.25, cap: 1 });
def('door_enter', 1.0, (E, t, o, out) => { const v = V(o); K.swell(E, t, out, 0.5, 0.3 * v, { f: 300, f1: 3000 }); return tone(E, t + 0.5, out, { f: 80, f1: 45, glide: 0.2, a: 0.003, d: 0.35, peak: 0.35 * v }); }, { win: 0.5, cap: 1, send: 0.3 });
def('wave_start', 1.0, (E, t, o, out) => { // a new wave: low drum and a rising breath
  const v = V(o);
  K.swell(E, t, out, 0.5, 0.18 * v, { f: 200, f1: 2500 });
  K.taiko(E, t + 0.5, out, 0.6 * v, { f: 70 });
  return t + 1.1;
}, { win: 0.5, cap: 1, send: 0.2 });
def('chamber_clear', 2.2, (E, t, o, out) => { // a resolving harp phrase in the region's key
  const v = V(o), r = o.root ?? 62, maj = o.minor ? 3 : 4;
  [r, r + 7, r + 12, r + 12 + maj, r + 19, r + 24].forEach((m, i) => K.harp(E, t + i * 0.07, out, m, 0.6 * v, { len: 2 }));
  K.bell(E, t + 0.42, out, r + 24, 0.5 * v, { d: 2.2 });
  return K.pad(E, t + 0.3, out, [r - 12, r - 5, r, r + maj], 1.2, 0.7 * v, { bright: 1800, a: 0.2, r: 1.2 });
}, { prio: 2, cap: 1, win: 1, send: 0.45 });
def('save', 1.4, (E, t, o, out) => { // checkpoint: two soft bells, the motif's last two notes
  const v = V(o);
  K.celesta(E, t, out, 76, 0.45 * v, { d: 1.2 });
  return K.celesta(E, t + 0.22, out, 74, 0.45 * v, { d: 1.4 });
}, { win: 2, cap: 1, send: 0.4 });
def('fountain', 2.0, (E, t, o, out) => { const v = V(o); noise(E, t, out, { color: 'pink', f: 1500, q: 0.6, a: 0.3, hold: 0.6, r: 0.8, peak: 0.25 * v }); [62, 66, 69, 74, 78, 81].forEach((m, i) => K.harp(E, t + 0.2 + i * 0.1, out, m, 0.4 * v, { len: 1.6 })); return t + 2; }, { prio: 2, send: 0.4 });
def('purchase', 0.8, (E, t, o, out) => { const v = V(o); SFX.pickup_lumen.fn(E, t, o, out); K.harp(E, t + 0.1, out, 74, 0.5 * v); return K.harp(E, t + 0.18, out, 81, 0.5 * v); }, { send: 0.25 });
def('victory', 4.0, (E, t, o, out) => { // a region conquered: bright arpeggio, bells, swell
  const v = V(o), r = o.root ?? 62;
  [r, r + 4, r + 7, r + 12, r + 16, r + 19, r + 24].forEach((m, i) => K.harp(E, t + i * 0.09, out, m, 0.6 * v, { len: 2.4 }));
  K.brass(E, t + 0.6, out, [r - 12, r - 5, r + 4], 1.6, 0.8 * v);
  K.choir(E, t + 0.6, out, [r, r + 4, r + 7, r + 12], 2.2, 0.8 * v, { vowel: 'a', a: 0.3, r: 1.6 });
  K.timpani(E, t + 0.6, out, r - 24, 0.8 * v);
  return K.bell(E, t + 0.65, out, r + 24, 0.6 * v, { d: 3 });
}, { prio: 2, cap: 1, win: 2, send: 0.5, duck: 0.1 });
def('death_sting', 4.0, (E, t, o, out) => { // Iri falls: a descending glide, the golden thread pulls back
  const v = V(o);
  tone(E, t, out, { f: 110, f1: 28, glide: 1.2, a: 0.003, d: 1.4, peak: 0.8 * v });
  noise(E, t, out, { f: 2600, f1: 200, q: 0.8, a: 0.002, d: 0.9, peak: 0.45 * v });
  K.strings(E, t + 0.1, out, [62, 65, 69], 1.6, 0.8 * v, { fray: 0.8, a: 0.05, r: 1.2 });
  K.swell(E, t + 1.6, out, 1.4, 0.35 * v, { f: 300, f1: 6000 });
  [74, 69, 65, 64].forEach((m, i) => K.musicBox(E, t + 2.0 + i * 0.35, out, m, 0.5 * v, { d: 1.5, detune: -20 }));
  return t + 4;
}, { prio: 2, cap: 1, win: 3, send: 0.5, duck: 0 });
def('dialogue_open', 0.5, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 800, f1: 2400, q: 0.8, a: 0.04, d: 0.15, peak: 0.12 * v }); return K.harp(E, t + 0.04, out, 74, 0.25 * v, { len: 1 }); }, { win: 0.3, cap: 1, send: 0.2 });
def('dialogue_next', 0.2, (E, t, o, out) => tone(E, t, out, { f: 1100, f1: 1400, glide: 0.04, a: 0.002, d: 0.06, peak: 0.05 * V(o) }), { win: 0.05, cap: 2 });

def('ui_click', 0.1, (E, t, o, out) => { const v = V(o); tone(E, t, out, { f: 1800, f1: 1200, glide: 0.03, a: 0.001, d: 0.04, peak: 0.11 * v }); return noise(E, t, out, { ftype: 'highpass', f: 5000, a: 0.001, d: 0.012, peak: 0.12 * v }); }, { win: 0.03, cap: 2 });
def('ui_hover', 0.05, (E, t, o, out) => tone(E, t, out, { f: 2400, a: 0.001, d: 0.025, peak: 0.035 * V(o) }), { prio: 0, win: 0.04, cap: 1 });
def('ui_back', 0.1, (E, t, o, out) => tone(E, t, out, { f: 1200, f1: 760, glide: 0.05, a: 0.001, d: 0.06, peak: 0.1 * V(o) }), { win: 0.03, cap: 2 });
def('ui_open', 0.6, (E, t, o, out) => { const v = V(o); K.harp(E, t, out, 74, 0.35 * v, { len: 1 }); return K.harp(E, t + 0.06, out, 81, 0.35 * v, { len: 1 }); }, { win: 0.1, cap: 1, send: 0.2 });
def('ui_close', 0.5, (E, t, o, out) => { const v = V(o); K.harp(E, t, out, 81, 0.3 * v, { len: 0.8 }); return K.harp(E, t + 0.06, out, 74, 0.3 * v, { len: 0.8 }); }, { win: 0.1, cap: 1, send: 0.2 });
def('ui_confirm', 0.7, (E, t, o, out) => { const v = V(o); K.celesta(E, t, out, 78, 0.45 * v, { d: 0.6 }); return K.celesta(E, t + 0.07, out, 85, 0.45 * v, { d: 0.7 }); }, { win: 0.1, cap: 1, send: 0.25 });
def('ui_error', 0.3, (E, t, o, out) => { const v = V(o); tone(E, t, out, { type: 'square', f: 140, a: 0.002, d: 0.08, peak: 0.07 * v, ftype: 'lowpass', ff: 900 }); return tone(E, t + 0.1, out, { type: 'square', f: 125, a: 0.002, d: 0.1, peak: 0.07 * v, ftype: 'lowpass', ff: 900 }); }, { win: 0.2, cap: 1 });
def('ui_tick', 0.05, (E, t, o, out) => noise(E, t, out, { f: 3200, q: 4, a: 0.001, d: 0.015, peak: 0.12 * V(o) }), { prio: 0, win: 0.02, cap: 2 });
def('ui_slider', 0.06, (E, t, o, out) => tone(E, t, out, { f: 900 + (o.value ?? 0.5) * 900, a: 0.001, d: 0.03, peak: 0.05 * V(o) }), { prio: 0, win: 0.03, cap: 1 });
def('ui_upgrade', 1.2, (E, t, o, out) => { // a Tapestry upgrade woven
  const v = V(o);
  pluck(E, t, out, { f: 146.8, len: 1.4, bright: 0.8, peak: 0.3 * v, d: 1, bend: 1.04 });
  [74, 78, 81, 86].forEach((m, i) => K.celesta(E, t + 0.08 + i * 0.06, out, m, 0.4 * v, { d: 1 }));
  return t + 1.2;
}, { send: 0.35 });

// ======================================================================
// Event-specific extras (sibling events: weaponFx, foe*, boss*, power)
// ======================================================================
def('spear_throw', 0.6, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 900, f1: 3200, q: 2, a: 0.02, d: 0.35, peak: 0.4 * v }); return tone(E, t, out, { f: 1400, f1: 900, glide: 0.4, a: 0.01, d: 0.4, peak: 0.04 * v, vib: [18, 30] }); }, { win: 0.1 });
def('spear_stick', 0.4, (E, t, o, out) => { const v = V(o); tone(E, t, out, { type: 'triangle', f: 260, f1: 190, glide: 0.05, a: 0.001, d: 0.12, peak: 0.4 * v }); pluck(E, t, out, { f: 330, len: 0.5, bright: 0.7, peak: 0.2 * v, d: 0.3, bend: 0.98 }); return noise(E, t, out, { f: 900, q: 3, a: 0.001, d: 0.06, peak: 0.4 * v }); });
def('chakram_return', 0.5, (E, t, o, out) => noise(E, t, out, { f: 900, f1: 1800, q: 3, a: 0.2, d: 0.2, peak: 0.22 * V(o), am: [30, 0.9] }), { win: 0.1 });
def('chakram_ricochet', 0.3, (E, t, o, out) => { const v = V(o); partials(E, t, out, { f: rnd(1700, 2300), ratios: [1, 2.3, 3.9], d: 0.22, peak: 0.08 * v }); return noise(E, t, out, { ftype: 'highpass', f: 4000, a: 0.001, d: 0.02, peak: 0.3 * v }); }, { win: 0.05, cap: 3 });
def('chakram_spin', 1.0, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 1400, q: 2.5, a: 0.05, hold: 0.6, r: 0.2, peak: 0.3 * v, am: [34, 0.9] }); return tone(E, t, out, { type: 'triangle', f: 620, a: 0.05, hold: 0.6, r: 0.2, peak: 0.035 * v, vib: [34, 50] }); }, { win: 0.3 });
def('bow_perfect', 0.8, (E, t, o, out) => { const v = V(o); fm(E, t, out, { f: 1760, ratio: 2, index: 1.2, a: 0.002, d: 0.6, peak: 0.07 * v }); fm(E, t, out, { f: 2637, ratio: 2, index: 1, a: 0.002, d: 0.5, peak: 0.05 * v }); return noise(E, t, out, { f: 5000, f1: 2000, q: 3, a: 0.002, d: 0.2, peak: 0.25 * v }); }, { send: 0.25 });
def('charge_full', 0.4, (E, t, o, out) => K.celesta(E, t, out, 88, 0.5 * V(o), { d: 0.4 }), { win: 0.2, cap: 1 });
def('arrow_wall', 0.3, (E, t, o, out) => { const v = V(o); tone(E, t, out, { type: 'triangle', f: 300, f1: 200, glide: 0.04, a: 0.001, d: 0.08, peak: 0.3 * v }); return noise(E, t, out, { f: 1200, q: 2, a: 0.001, d: 0.05, peak: 0.3 * v }); }, { win: 0.05, cap: 3 });
def('hymn', 1.0, (E, t, o, out) => K.choir(E, t, out, [74, 81], 0.4, 0.8 * V(o), { vowel: 'a', a: 0.03, r: 0.6 }), { send: 0.4, win: 0.2 });
def('uppercut', 0.4, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 400, f1: 3000, q: 1, a: 0.01, d: 0.18, peak: 0.5 * v }); return tone(E, t + 0.03, out, { f: 120, f1: 220, glide: 0.1, a: 0.003, d: 0.12, peak: 0.3 * v }); }, { win: 0.05 });
def('comet', 0.9, (E, t, o, out) => { const v = V(o); K.swell(E, t, out, 0.2, 0.3 * v, { f: 600, f1: 6000 }); tone(E, t + 0.2, out, { f: 110, f1: 40, glide: 0.3, a: 0.002, d: 0.4, peak: 0.7 * v }); return noise(E, t + 0.2, out, { color: 'brown', ftype: 'lowpass', f: 1600, f1: 200, a: 0.001, d: 0.4, peak: 0.6 * v }); }, { send: 0.2 });
def('dodge', 0.3, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 2400, f1: 5000, q: 2, a: 0.01, d: 0.12, peak: 0.18 * v }); return tone(E, t, out, { f: 1568, f1: 2093, glide: 0.08, a: 0.004, d: 0.15, peak: 0.04 * v }); }, { win: 0.15, cap: 1 });
def('ward', 0.5, (E, t, o, out) => { const v = V(o); partials(E, t, out, { f: 392, ratios: [1, 1.5, 2.25], d: 0.4, peak: 0.1 * v }); return noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 700, a: 0.002, d: 0.15, peak: 0.4 * v }); }, { win: 0.1, cap: 2 });
def('respawn', 2.4, (E, t, o, out) => { // the golden thread pulls Iri home to the Loomhall
  const v = V(o);
  K.swell(E, t, out, 0.9, 0.3 * v, { f: 300, f1: 7000 });
  [62, 69, 74, 76].forEach((m, i) => K.harp(E, t + 0.85 + i * 0.09, out, m, 0.55 * v, { len: 2 }));
  return K.pad(E, t + 0.85, out, [50, 57, 62, 64], 1.2, 0.7 * v, { bright: 1400, a: 0.1, r: 1.2 });
}, { prio: 2, send: 0.5, cap: 1, win: 2 });
def('fall', 1.2, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 2400, f1: 300, q: 1.2, a: 0.02, d: 0.8, peak: 0.35 * v }); return tone(E, t, out, { f: 600, f1: 90, glide: 0.9, a: 0.02, d: 0.9, peak: 0.05 * v }); }, { win: 0.2, cap: 2, send: 0.3 });
def('wall_slam', 0.5, (E, t, o, out) => { // knocked into a wall: a thud and a crack
  const v = V(o);
  tone(E, t, out, { f: 100, f1: 45, glide: 0.1, a: 0.002, d: 0.18, peak: 0.7 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 1400, f1: 300, a: 0.001, d: 0.18, peak: 0.7 * v });
  return noise(E, t, out, { f: 3000, q: 2, a: 0.001, d: 0.04, peak: 0.35 * v });
}, { win: 0.06, cap: 3 });
def('foe_swing', 0.4, (E, t, o, out) => { // a heavy foe weapon cuts the air (greatsword, censer, hammer)
  const v = V(o), p = Pm(o);
  noise(E, t, out, { f: 260 * p, f1: 1500 * p, q: 0.9, a: 0.04, d: 0.22, peak: 0.5 * v });
  return noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 300, a: 0.03, d: 0.2, peak: 0.35 * v });
}, { win: 0.06, cap: 3 });
def('foe_dash', 0.4, (E, t, o, out) => { const v = V(o); noise(E, t, out, { f: 1800, f1: 300, q: 0.8, a: 0.01, d: 0.2, peak: 0.42 * v }); return tone(E, t, out, { f: 830, f1: 415, glide: 0.15, a: 0.01, d: 0.15, peak: 0.03 * v, vib: [30, 60] }); }, { win: 0.08, cap: 2 });
def('inhale', 0.9, (E, t, o, out) => { const d = clamp(o.dur ?? 0.6, 0.3, 1.2), v = V(o); noise(E, t, out, { color: 'pink', f: 1600, f1: 300, q: 1, a: d * 0.9, d: 0.05, peak: 0.35 * v }); return tone(E, t, out, { type: 'sawtooth', f: 60, f1: 90, glide: d, a: d * 0.9, d: 0.05, peak: 0.08 * v, ftype: 'lowpass', ff: 300 }); }, { win: 0.2, cap: 2 });
def('roar', 1.2, (E, t, o, out) => { // Loomhulk enrages
  const v = V(o);
  noise(E, t, out, { f: 300, f1: 500, q: 2, a: 0.1, hold: 0.5, r: 0.4, peak: 0.45 * v, am: [24, 0.9] });
  tone(E, t, out, { type: 'sawtooth', f: 55, f1: 48, a: 0.1, hold: 0.5, r: 0.4, peak: 0.2 * v, ftype: 'lowpass', ff: 600 });
  return partials(E, t, out, { f: 140, ratios: [1, 1.48, 2.1], d: 0.9, peak: 0.06 * v });
}, { win: 0.5, cap: 1, send: 0.2 });
def('snap', 0.5, (E, t, o, out) => { // a black thread snaps
  const v = V(o);
  noise(E, t, out, { ftype: 'highpass', f: 2500, a: 0.001, d: 0.05, peak: 0.6 * v });
  pluck(E, t, out, { f: 880, len: 0.4, bright: 0.95, peak: 0.25 * v, d: 0.25, bend: 0.8 });
  return tone(E, t, out, { f: 1200, f1: 300, glide: 0.25, a: 0.001, d: 0.25, peak: 0.05 * v });
}, { prio: 2, win: 0.1, cap: 2, send: 0.15 });
def('aurum_sweep', 0.9, (E, t, o, out) => { // the great hammer sweeps
  const v = V(o);
  noise(E, t, out, { f: 180, f1: 1400, q: 0.8, a: 0.15, d: 0.35, peak: 0.7 * v });
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 260, a: 0.1, d: 0.4, peak: 0.6 * v });
  return partials(E, t + 0.15, out, { f: 260, ratios: [1, 2.03, 2.8], d: 0.6, peak: 0.05 * v });
}, { prio: 2, cap: 2, send: 0.2 });
def('aurum_breath', 1.6, (E, t, o, out) => { // a gout of forge fire
  const v = V(o);
  noise(E, t, out, { color: 'brown', ftype: 'lowpass', f: 300, f1: 2200, a: 0.12, hold: 0.9, r: 0.4, peak: 0.9 * v, am: [11, 0.5] });
  return noise(E, t, out, { ftype: 'highpass', f: 2200, a: 0.15, hold: 0.8, r: 0.4, peak: 0.2 * v, am: [31, 0.8] });
}, { prio: 2, cap: 1, win: 0.3, send: 0.2 });
def('sable_dash', 0.5, (E, t, o, out) => { // his dash: Iri's whoosh, detuned and dark
  const v = V(o);
  noise(E, t, out, { f: 1900, f1: 280, q: 0.8, a: 0.01, d: 0.2, peak: 0.5 * v });
  tone(E, t, out, { type: 'sawtooth', f: 440, f1: 220, glide: 0.18, a: 0.01, d: 0.18, peak: 0.04 * v, ftype: 'lowpass', ff: 1400 });
  return tone(E, t, out, { f: 466, f1: 233, glide: 0.18, a: 0.01, d: 0.18, peak: 0.03 * v });
}, { prio: 2, win: 0.08, cap: 2 });
def('braid', 4.0, (E, t, o, out) => { // the true ending's choice: two threads braided, gold and black, resolving
  const v = V(o);
  for (let i = 0; i < 8; i++) { pluck(E, t + i * 0.18, out, { f: mtof([62, 66, 69, 74][i % 4] + (i > 3 ? 12 : 0)), len: 1.6, bright: 0.7, peak: 0.25 * v, d: 1.2 }); pluck(E, t + i * 0.18 + 0.09, out, { f: mtof([55, 59, 62, 66][i % 4] + (i > 3 ? 12 : 0)), len: 1.6, bright: 0.4, peak: 0.2 * v, d: 1.2 }); }
  K.choir(E, t + 1.4, out, [62, 66, 69, 74], 2.2, 0.9 * v, { vowel: 'o', vowel2: 'a', a: 0.8, r: 2 });
  return K.bell(E, t + 1.5, out, 86, 0.6 * v, { d: 4 });
}, { prio: 2, cap: 1, win: 3, send: 0.6, duck: 0.1 });
def('run_start', 2.0, (E, t, o, out) => { // through the Dreamdoor
  const v = V(o);
  K.swell(E, t, out, 0.8, 0.4 * v, { f: 200, f1: 6000 });
  tone(E, t + 0.8, out, { f: 70, f1: 35, glide: 0.4, a: 0.002, d: 0.6, peak: 0.6 * v });
  return K.celesta(E, t + 0.8, out, 81, 0.6 * v, { d: 1.6 });
}, { prio: 2, cap: 1, win: 2, send: 0.5 });

// ======================================================================
// play
// ======================================================================
export const SFX_ALIASES = {
  swing: 'swing1', hit: 'hit_thread', hurt: 'hero_hurt', zap: 'chain', burst: 'special', thread: 'snare_throw',
  shatter: 'veyl_shatter', click: 'ui_click', hover: 'ui_hover', back: 'ui_back', confirm: 'ui_confirm', error: 'ui_error',
  open: 'ui_open', close: 'ui_close', select: 'ui_confirm', death: 'death_sting', clear: 'chamber_clear', boon: 'boon_take',
  break: 'armor_break', armorBreak: 'armor_break', recall: 'snare_recall', snare: 'snare_throw', snareHit: 'snare_hit',
  deathDefiance: 'death_defy', wardHit: 'ward', swoosh: 'foe_swing',
};

export function playSfx(E, name, o = {}) {
  if (!E) return 0;
  let n = SFX[name] ? name : SFX_ALIASES[name];
  if (!n && name && name.startsWith('call_')) n = 'call_' + (patronKey(name.slice(5)) || 'dawn');
  if (!n && name && name.startsWith('proc_')) n = 'proc_' + (patronKey(name.slice(5)) || 'dawn');
  if (!n && name && name.startsWith('card_')) { o = { ...o, rarity: name.slice(5) }; n = 'card'; }
  const d = SFX[n];
  if (!d) return 0;
  const t = E.now() + 0.005 + (o.delay || 0);
  const k = stackGain(E, n, t, d.win, d.cap);
  if (!k) return 0;
  const lv = E.raw ? 1 : (LEVELS.sfx[n] ?? 1);
  const g = voice(E, t, d.d + (o.dur || 0), { gain: k * d.gain * lv * (o.vol ?? 1), pan: o.pan, send: d.send, prio: o.prio ?? d.prio });
  if (!g) return 0;
  try { d.fn(E, t, o, g); } catch (e) { if (!E.warned) { E.warned = true; console.warn('Loomwake audio:', name, e); } }
  if (d.duck != null && !E.offline) duckMusic(E, d.duck, 0.3, 1.2);
  return d.d;
}

export const SFX_NAMES = () => Object.keys(SFX);
