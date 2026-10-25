// Tidebreaker ambience: the sea under everything, and a bed per biome that
// cross-fades when G.world.biome changes.
//   sea    brown-noise wash and pink foam swelling on slow LFOs, a deep swell;
//          its levels and a muffling low-pass are retuned per biome
//   dawn / sunset  a soft breeze, gulls calling now and then
//   storm  gusting wind, a howl in the rigging, rain
//   fog    a muffled sea, low beating drones, a thin eerie tone, a buoy bell
//   night  a deep swell and a slow, drifting low choir
// Also the fire loop (crackle and roar while ships burn) and the small random
// sounds of a ship at sea (hull creaks, lapping water).
import { A, gain, filt, osc, noise, voice, hitEnv, swell, rnd, mtof, clamp } from './core.js';
import { bell, groan, thunder } from './sfx.js';

const SEA = {
  dawn:   { wash: 0.5, foam: 0.12, deep: 0.15, muffle: 9000, washF: 450 },
  sunset: { wash: 0.55, foam: 0.13, deep: 0.2, muffle: 9000, washF: 450 },
  storm:  { wash: 0.85, foam: 0.26, deep: 0.4, muffle: 9000, washF: 680 },
  fog:    { wash: 0.42, foam: 0.05, deep: 0.22, muffle: 650, washF: 340 },
  night:  { wash: 0.48, foam: 0.07, deep: 0.6, muffle: 3200, washF: 380 },
};
const BEDS = { dawn: 'breeze', sunset: 'breeze', storm: 'storm', fog: 'fog', night: 'night' };

const S = { sea: null, beds: {}, biome: null, burn: null, timers: {}, lastThunder: 0 };
const FOREVER = 1e7;

function lfo(f, depth, param, phase = 0) {
  const t = A.ctx.currentTime;
  const o = osc('sine', f, t + phase, t + FOREVER, gain(null, depth, param));
  return o;
}

function buildSea() {
  const t = A.ctx.currentTime, srcs = [];
  const muffle = filt('lowpass', 9000, 0.6, A.amb);
  const out = gain(null, 1, muffle);
  const wash = gain(null, 0.6, out), washF = filt('lowpass', 450, 0.6, wash);
  srcs.push(noise('brown', t, t + FOREVER, washF), lfo(0.11, 0.38, wash.gain));
  const foam = gain(null, 0.12, out), foamF = filt('bandpass', 1800, 0.6, foam);
  srcs.push(noise('pink', t, t + FOREVER, foamF), lfo(0.13, 0.05, foam.gain, 1.7));
  const deep = gain(null, 0.2, out);
  srcs.push(noise('brown', t, t + FOREVER, filt('lowpass', 95, 0.8, deep), 0.7), lfo(0.07, 0.15, deep.gain, 3));
  return { muffle, out, wash, washF, foam, deep, srcs };
}

function tuneSea(b, tau = 1.5) {
  const p = SEA[b] || SEA.sunset, s = S.sea, t = A.ctx.currentTime;
  s.wash.gain.setTargetAtTime(p.wash, t, tau);
  s.foam.gain.setTargetAtTime(p.foam, t, tau);
  s.deep.gain.setTargetAtTime(p.deep, t, tau);
  s.muffle.frequency.setTargetAtTime(p.muffle, t, tau);
  s.washF.frequency.setTargetAtTime(p.washF, t, tau);
}

function buildBed(kind) {
  const t = A.ctx.currentTime, srcs = [];
  const g = gain(null, 0, A.amb);
  const run = (n) => { srcs.push(n); return n; };
  if (kind === 'breeze') {
    const b = gain(null, 0.05, g);
    run(noise('pink', t, t + FOREVER, filt('bandpass', 520, 0.5, b)));
    run(lfo(0.06, 0.03, b.gain));
  } else if (kind === 'storm') {
    const w = gain(null, 0.26, g), bp = filt('bandpass', 600, 0.8, w);
    run(noise('white', t, t + FOREVER, bp));
    run(lfo(0.07, 260, bp.frequency)); run(lfo(0.045, 0.14, w.gain, 2));
    const h = gain(null, 0.05, g), hb = filt('bandpass', 1500, 14, h);
    run(noise('white', t, t + FOREVER, hb));
    run(lfo(0.09, 380, hb.frequency, 1)); run(lfo(0.05, 0.04, h.gain, 4));
    const r = gain(null, 0.22, g), rl = filt('lowpass', 7000, 0.6, r);
    run(noise('rain', t, t + FOREVER, filt('highpass', 700, 0.6, rl)));
    run(lfo(0.03, 0.05, r.gain));
  } else if (kind === 'fog') {
    const d = gain(null, 0.07, g), dl = filt('lowpass', 380, 0.8, d);
    for (const f of [55, 55.35, 82.6]) run(osc('triangle', f, t, t + FOREVER, dl));
    run(lfo(0.05, 0.025, d.gain));
    const e = gain(null, 0.006, g), eo = run(osc('sine', mtof(86), t, t + FOREVER, e));
    run(lfo(0.27, 14, eo.frequency)); run(lfo(0.11, 0.005, e.gain, 2));
  } else if (kind === 'night') {
    // a low choir: saws through "oo" formants, retuned slowly (see drift)
    const c = gain(null, 0.05, g), f1 = filt('bandpass', 420, 4, c), f2 = filt('bandpass', 900, 6, c);
    const m = gain(null, 1); m.connect(f1); m.connect(f2);
    const voices = [];
    for (const n of [50, 57, 65]) {
      const o1 = run(osc('sawtooth', mtof(n), t, t + FOREVER, m)); o1.detune.value = -6;
      const o2 = run(osc('sawtooth', mtof(n), t, t + FOREVER, m)); o2.detune.value = 7;
      voices.push([o1, o2]);
    }
    run(lfo(0.04, 0.025, c.gain));
    return { g, srcs, voices, chord: 0 };
  }
  return { g, srcs };
}

const NIGHT_CHORDS = [[50, 57, 65], [46, 58, 62], [43, 55, 62], [45, 57, 61]];

export function setBiome(b) {
  if (!A.ctx) return;
  if (!S.sea) S.sea = buildSea();
  tuneSea(b, S.biome ? 1.5 : 0.05);
  S.biome = b;
  const want = BEDS[b];
  const t = A.ctx.currentTime;
  for (const k of new Set(Object.values(BEDS))) {
    let bed = S.beds[k];
    if (k === want) {
      if (!bed) bed = S.beds[k] = buildBed(k);
      bed.g.gain.cancelScheduledValues(t); bed.g.gain.setTargetAtTime(1, t, 1.4); bed.off = 0;
    } else if (bed && !bed.off) {
      bed.g.gain.cancelScheduledValues(t); bed.g.gain.setTargetAtTime(0, t, 1.2); bed.off = t + 8;
    }
  }
}

// Fire: one crackle loop and a low roar, level from how much is burning.
export function setBurn(level, x) {
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  if (!S.burn) {
    if (level <= 0) return;
    const p = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null;
    const g = gain(null, 0, p || A.sfx); if (p) p.connect(A.sfx);
    const cg = gain(null, 0.5, g), rg = gain(null, 0.35, g);
    noise('crackle', t, t + FOREVER, filt('highpass', 900, 0.7, cg));
    noise('brown', t, t + FOREVER, filt('bandpass', 320, 0.7, rg));
    lfo(0.7, 0.12, rg.gain);
    S.burn = { g, p };
  }
  S.burn.g.gain.setTargetAtTime(clamp(level, 0, 1) * 0.5, t, 0.3);
  if (S.burn.p && x != null) S.burn.p.pan.setTargetAtTime(clamp((x / 1280) * 2 - 1, -1, 1) * 0.6, t, 0.3);
}

// Ship's-life details and the biome's occasional calls.
function due(k, t, a, b) {
  if (S.timers[k] == null) S.timers[k] = t + rnd(a * 0.3, b * 0.6);
  if (t < S.timers[k]) return false;
  S.timers[k] = t + rnd(a, b);
  return true;
}

export function gulls(n = rnd(2, 4) | 0) {
  const x = rnd(100, 1200), L = n * 0.32 + 0.4;
  const v = voice('amb', { x, gain: rnd(0.05, 0.09), rev: 0.5, dur: L });
  if (!v) return;
  const { t, out } = v, f0 = rnd(1150, 1450);
  const am = gain(null, 0.75, out); // a 32 Hz rasp on the voice
  osc('sine', 32, t, t + L, gain(null, 0.25, am.gain));
  const g = gain(null, 0, am), bp = filt('bandpass', 2000, 2.5, g);
  const s = osc('sawtooth', f0, t, t + L, bp);
  const sn = osc('sine', f0, t, t + L, gain(null, 0.6, g));
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < n; i++) {
    const at = t + i * rnd(0.25, 0.36), k = i === 0 ? 1 : rnd(0.85, 1);
    for (const o of [s, sn]) {
      o.frequency.setValueAtTime(f0 * k, at);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.65 * k, at + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.12 * k, at + 0.24);
    }
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(i ? 0.8 : 1, at + 0.03); g.gain.setTargetAtTime(0, at + 0.14, 0.04);
  }
}

function lap() {
  const v = voice('amb', { x: rnd(150, 700), gain: rnd(0.04, 0.08), rev: 0.1, dur: 0.8 });
  if (!v) return;
  const g = gain(null, 0, v.out), f = filt('bandpass', rnd(500, 900), 1.2, g);
  f.frequency.setTargetAtTime(350, v.t + 0.1, 0.2);
  noise('pink', v.t, v.t + 0.8, f);
  swell(g.gain, v.t, 1, 0.12, 0.08, 0.15);
}

function buoy() {
  const v = voice('amb', { x: rnd(200, 1200), gain: 0.25, rev: 0.8, dur: 4 });
  if (!v) return;
  const muf = filt('lowpass', 1400, 0.7, v.out);
  bell(v, v.t, 62, 0.12, 1.2, muf);
  if (Math.random() < 0.6) bell(v, v.t + rnd(0.6, 1.1), 62, 0.08, 1.2, muf);
}

export function heardThunder(t) { S.lastThunder = t; }

export function update(G, dt) {
  if (!A.ctx || !S.sea) return;
  const t = A.ctx.currentTime, b = S.biome;
  // retire faded beds
  for (const [k, bed] of Object.entries(S.beds)) {
    if (bed.off && t > bed.off) { for (const s of bed.srcs) { try { s.stop(); } catch { /* already stopped */ } } bed.g.disconnect(); delete S.beds[k]; }
  }
  const night = S.beds.night;
  if (night && !night.off && due('choir', t, 9, 14)) {
    night.chord = (night.chord + 1) % NIGHT_CHORDS.length;
    NIGHT_CHORDS[night.chord].forEach((m, i) => { for (const o of night.voices[i]) o.frequency.setTargetAtTime(mtof(m), t, 1.8); });
  }
  if (A.muted) return;
  const atSea = G.scene === 'play' || G.scene === 'title';
  if ((b === 'dawn' && due('gull', t, 3, 8)) || (b === 'sunset' && due('gull', t, 5, 12))) gulls();
  if (b === 'fog' && due('buoy', t, 9, 16)) buoy();
  if (atSea && due('lap', t, 1.4, 3.8)) lap();
  if (atSea && due('creak', t, 7, 15)) groan(G.player?.x ?? 300, b === 'storm' ? 0.6 : 0.3, { dur: rnd(0.7, 1.3) });
  if (b === 'storm' && t - S.lastThunder > 22 && due('thunder', t, 14, 24)) thunder(rnd(0.05, 0.35));
}

export function ambStats() { return { biome: S.biome, beds: Object.keys(S.beds), burn: S.burn ? +S.burn.g.gain.value.toFixed(3) : 0 }; }
