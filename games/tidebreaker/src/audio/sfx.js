// Tidebreaker sound effects: every one-shot, built from the node kit in
// core.js at the moment it plays. Levels are set so one broadside peaks around
// -6 dBFS before the glue compressor; quieter sounds are scaled from there.
// x is the logical canvas x (0..1280), used for panning.
import { A, voice, gain, filt, osc, noise, hitEnv, swell, glide, rnd, clamp, mtof, duck, panX } from './core.js';

// --------------------------------------------------------------- cannons
// One gun: crack, a boom of filtered brown noise, a falling sub thump, the
// wooden thump of the carriage and the hull, and a slow low rumble.
export function cannon(x, o = {}) {
  const far = !!o.far, k = o.k ?? rnd(0.88, 1.12), size = o.size ?? 1;
  const v = voice(far ? 'cannonFar' : 'cannon', { x, pan: o.pan, gain: (far ? 0.4 : 0.85) * size * (o.gain ?? 1), rev: far ? 0.55 : 0.22, dur: far ? 2.4 : 1.9, delay: o.delay, pri: o.pri });
  if (!v) return false;
  const { t, out } = v;
  // crack: the muzzle blast
  const cg = gain(v, 0, out);
  const cf = filt(far ? 'lowpass' : 'bandpass', far ? 1100 : 1900 * k, far ? 0.7 : 0.8, cg);
  noise('white', t, t + 0.16, cf);
  hitEnv(cg.gain, t, far ? 0.35 : 0.9, 0.001, far ? 0.04 : 0.022);
  // boom body
  const bg = gain(v, 0, out);
  const bf = filt('lowpass', 1500 * k, 0.9, bg);
  bf.frequency.setTargetAtTime(far ? 140 : 190, t + 0.01, 0.09);
  noise('brown', t, t + 1.1, bf);
  hitEnv(bg.gain, t, far ? 0.9 : 1.1, 0.003, far ? 0.28 : 0.2);
  // sub thump
  const sg = gain(v, 0, out);
  const so = osc('sine', 92 * k, t, t + 0.7, sg);
  glide(so.frequency, t, 92 * k, 40 * k, 0.22);
  hitEnv(sg.gain, t, far ? 0.5 : 0.95, 0.002, 0.13);
  if (!far) {
    // wooden thump: the gun carriage slams back against its breeching
    const wg = gain(v, 0, out);
    const wo = osc('triangle', 210 * k, t + 0.012, t + 0.2, wg);
    glide(wo.frequency, t + 0.012, 210 * k, 115 * k, 0.07);
    hitEnv(wg.gain, t + 0.012, 0.3, 0.002, 0.035);
    const ng = gain(v, 0, out);
    noise('pink', t + 0.012, t + 0.2, filt('bandpass', 480 * k, 3, ng));
    hitEnv(ng.gain, t + 0.012, 0.5, 0.002, 0.04);
  }
  // rumble rolling away
  const rg = gain(v, 0, out);
  noise('brown', t, t + v.dur, filt('lowpass', far ? 120 : 170, 0.7, rg));
  rg.gain.setValueAtTime(0, t);
  rg.gain.linearRampToValueAtTime(far ? 0.7 : 0.5, t + 0.09);
  rg.gain.setTargetAtTime(0, t + 0.09, far ? 0.7 : 0.48);
  return true;
}

// A broadside of n balls: up to four guns ripple down the hull, the rest is
// the mass of the volley in one extra rumble layer.
export function broadside(x, n = 3, aimX) {
  const guns = clamp(Math.round(n), 1, 4);
  const g = 1 / guns ** 0.35;
  for (let i = 0; i < guns; i++) {
    cannon(x + (i - (guns - 1) / 2) * 40, { delay: i * rnd(0.035, 0.075) + (i ? rnd(0, 0.02) : 0), gain: g, pri: i === 0 ? 2 : 0 });
  }
  if (n > 4) {
    const v = voice('cannon', { x, gain: Math.min(0.9, 0.2 + n * 0.04), rev: 0.3, dur: 2.2, delay: 0.06, pri: 2 });
    if (v) {
      const rg = gain(v, 0, v.out);
      noise('brown', v.t, v.t + 2.2, filt('lowpass', 220, 0.8, rg));
      hitEnv(rg.gain, v.t, 1, 0.05, 0.6);
    }
  }
  whoosh(x + 60, aimX ?? x + 500, { delay: 0.12, gain: 0.12 + Math.min(0.12, n * 0.01) });
}

export function enemyCannon(x, n = 1, heavy) {
  const guns = clamp(Math.round(n), 1, 2);
  for (let i = 0; i < guns; i++) cannon(x, { far: true, size: heavy ? 1.3 : 1, delay: i * rnd(0.05, 0.12), gain: 1 / guns ** 0.3 });
}

// A ball passing: band-passed noise that rises and falls, panned along its path.
export function whoosh(x0, x1, o = {}) {
  const dur = o.dur ?? 0.55;
  const v = voice('whoosh', { pan: 0, gain: o.gain ?? 0.16, dur, delay: o.delay, rev: 0.1 });
  if (!v) return;
  const { c, t, out } = v;
  let dest = out;
  if (c.createStereoPanner) {
    const p = c.createStereoPanner(); p.connect(out);
    p.pan.setValueAtTime(panX(x0), t); p.pan.linearRampToValueAtTime(panX(x1), t + dur); dest = p;
  }
  const g = gain(v, 0, dest);
  const f = filt('bandpass', 600, 1.4, g);
  f.frequency.setValueAtTime(o.f0 ?? 500, t);
  f.frequency.exponentialRampToValueAtTime(o.f1 ?? 2300, t + dur * 0.4);
  f.frequency.exponentialRampToValueAtTime(o.f2 ?? 700, t + dur);
  noise('white', t, t + dur + 0.05, f);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(0, t + dur);
}

// Mortar: a dull far thump now; the whistle is driven by the shot (audio.js).
export function mortarThump(x) { cannon(x, { far: true, size: 0.8, k: 0.75 }); }

// A falling shell's whistle. Returns a handle audio.js retunes every frame.
export function whistle(x) {
  const v = voice('whistle', { x, gain: 1, dur: 4, rev: 0.25 });
  if (!v) return null;
  const { t, out } = v;
  const g = gain(v, 0, out);
  const o = osc('sine', 2400, t, t + 4, g);
  const vib = osc('sine', 9, t, t + 4, gain(v, 18, o.frequency));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.03, t + 0.25);
  return { g, o, vib, out, dead: false, t };
}

// ------------------------------------------------------------------ water
export function splash(x, size = 1, delay = 0) {
  const s = clamp(size > 4 ? size / 24 : size, 0.3, 2.2);
  const v = voice('splash', { x, gain: 0.65 * Math.min(1.3, 0.55 + s * 0.4), rev: 0.2, dur: 1.4 + s * 0.3, delay });
  if (!v) return;
  const { t, out } = v, lo = 1 / Math.sqrt(s);
  // the slap of the ball hitting the surface
  const ig = gain(v, 0, out);
  const iff = filt('bandpass', 2400 * lo, 0.8, ig);
  iff.frequency.setTargetAtTime(520 * lo, t, 0.09);
  noise('white', t, t + 0.6, iff);
  hitEnv(ig.gain, t, 0.55, 0.003, 0.1);
  // the column of water falling back
  const wg = gain(v, 0, out);
  const wf = filt('lowpass', 1200 * lo, 0.6, wg);
  wf.frequency.setTargetAtTime(320, t + 0.1, 0.35);
  noise('pink', t, t + v.dur, wf);
  swell(wg.gain, t, 0.55, 0.06, 0.12 * s, 0.32 * s);
  // the cavity's bloop
  const pg = gain(v, 0, out);
  const po = osc('sine', 300 * lo, t + 0.02, t + 0.25, pg);
  glide(po.frequency, t + 0.02, 300 * lo, 85, 0.12);
  hitEnv(pg.gain, t + 0.02, 0.3, 0.004, 0.045);
  // droplets
  const dg = gain(v, 0, out), d = osc('sine', 1200, t, t + 0.9, dg);
  for (let i = 0; i < 4; i++) {
    const at = t + rnd(0.12, 0.7), f = rnd(900, 2100);
    d.frequency.setValueAtTime(f, at); d.frequency.exponentialRampToValueAtTime(f * 1.5, at + 0.025);
    dg.gain.setValueAtTime(0.06, at); dg.gain.setTargetAtTime(0, at + 0.004, 0.012);
  }
}

// ----------------------------------------------------------------- hits
// Wood: a sharp crack, the thud and knock of the hull, and splinters.
export function hitWood(x, o = {}) {
  const crit = !!o.crit, big = clamp((o.dmg || 14) / 30, 0.5, 1.6), player = !!o.player;
  const v = voice(crit ? 'crit' : 'hit', { x, gain: (player ? 0.75 : 0.55) * (0.75 + big * 0.25), rev: 0.15, dur: crit ? 0.9 : 0.5, pri: player || crit ? 2 : 0 });
  if (!v) return;
  const { t, out } = v, k = rnd(0.9, 1.1) * (player ? 0.8 : 1);
  const cg = gain(v, 0, out);
  noise('white', t, t + 0.08, filt('bandpass', (crit ? 3000 : 2200) * k, 1.1, cg));
  hitEnv(cg.gain, t, crit ? 1 : 0.8, 0.0008, 0.013);
  const tg = gain(v, 0, out);
  const to = osc('sine', 150 * k, t, t + 0.3, tg);
  glide(to.frequency, t, 150 * k, 62, 0.1);
  hitEnv(tg.gain, t, o.weak ? 0.8 : 0.55, 0.002, 0.07);
  const kg = gain(v, 0, out);
  noise('pink', t, t + 0.25, filt('bandpass', 520 * k, 4, kg));
  hitEnv(kg.gain, t, 0.6, 0.002, 0.05);
  // splinters: one high-passed noise source, keyed on and off
  const sg = gain(v, 0, out);
  noise('white', t, t + 0.35, filt('highpass', 3600, 0.7, sg));
  sg.gain.setValueAtTime(0, t);
  for (let i = 0, at = t + 0.015; i < (crit ? 8 : 5); i++) {
    at += rnd(0.012, 0.05);
    sg.gain.setValueAtTime(rnd(0.12, 0.32), at); sg.gain.setTargetAtTime(0, at + 0.001, 0.005);
  }
  if (crit) {
    // a bright ring on top: inharmonic partials of struck iron
    for (const [f, a] of [[1340, 0.07], [2215, 0.05], [3170, 0.035]]) {
      const rg = gain(v, 0, out);
      osc('sine', f * k, t, t + 0.9, rg);
      hitEnv(rg.gain, t, a, 0.001, 0.22);
    }
  }
  if (player) groan(x, 0.6);
}

// The hull groaning under strain.
export function groan(x, amt = 1, o = {}) {
  const dur = o.dur ?? 1.1;
  const v = voice('groan', { x, gain: 0.22 * amt, rev: 0.3, dur, delay: o.delay });
  if (!v) return;
  const { t, out } = v, base = o.f ?? rnd(48, 66);
  const g = gain(v, 0, out);
  const b1 = filt('bandpass', rnd(600, 800), 9, g), b2 = filt('bandpass', rnd(1200, 1500), 7, g);
  const so = osc('sawtooth', base, t, t + dur, b1); so.connect(b2);
  const n = 6, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = base * rnd(0.6, 1.5);
  so.frequency.setValueCurveAtTime(curve, t, dur);
  swell(g.gain, t, 5, dur * 0.25, dur * 0.35, dur * 0.12);
}

export function explode(x, size = 1) {
  const s = clamp(size > 4 ? size / 40 : size, 0.4, 2.5);
  const v = voice('explode', { x, gain: 0.7 * Math.min(1.25, 0.6 + s * 0.35), rev: 0.4, dur: 2.2 + s * 0.6, pri: 2 });
  if (!v) return;
  const { t, out } = v;
  const bg = gain(v, 0, out);
  const bf = filt('lowpass', 4200, 0.7, bg);
  bf.frequency.setTargetAtTime(260, t + 0.01, 0.13);
  noise('white', t, t + 1, bf);
  hitEnv(bg.gain, t, 1, 0.002, 0.15);
  const sg = gain(v, 0, out);
  const so = osc('sine', 72, t, t + 1.4, sg);
  glide(so.frequency, t, 72, 28, 0.45);
  hitEnv(sg.gain, t, 1, 0.003, 0.3 * s);
  const rg = gain(v, 0, out);
  const rf = filt('lowpass', 700, 0.8, rg);
  rf.frequency.setTargetAtTime(110, t + 0.05, 0.5);
  noise('brown', t, t + v.dur, rf);
  swell(rg.gain, t, 0.85, 0.015, 0.05, 0.55 * s);
  const dg = gain(v, 0, out);
  noise('crackle', t + 0.06, t + v.dur, filt('bandpass', 2600, 0.7, dg));
  swell(dg.gain, t + 0.06, 0.55, 0.02, 0.1, 0.45);
  duck(0.55, 0.2);
}

// A ship going down: timbers creaking, water rushing in, a train of bubbles
// and a last glug.
export function sink(x, boss) {
  const L = boss ? 5 : 3;
  const v = voice('sink', { x, gain: boss ? 0.9 : 0.75, rev: 0.4, dur: L + 0.5, pri: boss ? 2 : 0 });
  if (!v) return;
  const { t, out } = v;
  groan(x, boss ? 1.6 : 1.1, { dur: 1.3, f: boss ? 38 : 55 });
  groan(x, boss ? 1.3 : 0.8, { dur: 1.1, delay: 0.9 });
  const wg = gain(v, 0, out);
  const wf = filt('lowpass', 900, 0.7, wg);
  wf.frequency.setTargetAtTime(300, t + 0.5, 1);
  noise('pink', t, t + L, wf);
  swell(wg.gain, t, 0.5, 0.4, L * 0.3, L * 0.2);
  // bubbles: one oscillator, retuned for each blip (bubbles rise in pitch)
  const bg = gain(v, 0, out), bo = osc('sine', 300, t, t + L, bg);
  bg.gain.setValueAtTime(0, t);
  let at = t + 0.4;
  while (at < t + L - 0.3) {
    const f = rnd(boss ? 120 : 180, boss ? 480 : 720), a = rnd(0.05, 0.16);
    bo.frequency.setValueAtTime(f, at); bo.frequency.exponentialRampToValueAtTime(f * 1.7, at + 0.035);
    bg.gain.setValueAtTime(a, at); bg.gain.setTargetAtTime(0, at + 0.005, 0.02);
    at += rnd(0.04, 0.25);
  }
  const lg = gain(v, 0, out), lo = osc('sine', 140, t + L - 0.6, t + L, lg);
  glide(lo.frequency, t + L - 0.6, boss ? 90 : 140, boss ? 40 : 60, 0.3);
  hitEnv(lg.gain, t + L - 0.6, 0.4, 0.01, 0.12);
}

// ------------------------------------------------------------- abilities
// Chain shot: a lighter cannon, then two balls on a chain whirring away.
export function chainShot(x, aimX) {
  cannon(x, { size: 0.8, pri: 2 });
  const dur = 0.9;
  const v = voice('chain', { x, gain: 0.3, rev: 0.15, dur, delay: 0.05 });
  if (!v) return;
  const { c, t, out } = v;
  let dest = out;
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.connect(out); p.pan.setValueAtTime(panX(x), t); p.pan.linearRampToValueAtTime(panX(aimX ?? x + 500), t + dur); dest = p; }
  const am = gain(v, 0.5, dest);
  const lfo = osc('square', 17, t, t + dur, gain(v, 0.5, am.gain));
  lfo.frequency.setValueAtTime(19, t); lfo.frequency.linearRampToValueAtTime(11, t + dur);
  const g = gain(v, 0, am);
  const f = filt('bandpass', 800, 2.5, g);
  f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1300, t + dur * 0.35); f.frequency.linearRampToValueAtTime(600, t + dur);
  noise('white', t, t + dur, f);
  // a metallic tick each turn of the chain
  const mo = osc('triangle', 640, t, t + dur, filt('bandpass', 900, 2, g));
  mo.frequency.linearRampToValueAtTime(420, t + dur);
  swell(g.gain, t, 1, 0.08, dur * 0.5, dur * 0.15);
}

// Fire barrels: a throw, a whoomp of catching flame, a sizzle.
export function barrels(x, n = 3) {
  const v = voice('barrel', { x, gain: 0.6, rev: 0.2, dur: 1.4 });
  if (!v) return;
  const { t, out } = v;
  whoosh(x, x + 400, { gain: 0.1, dur: 0.5, f0: 300, f1: 1200, f2: 500 });
  const fg = gain(v, 0, out);
  const ff = filt('lowpass', 300, 1.2, fg);
  ff.frequency.setValueAtTime(250, t + 0.05); ff.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
  ff.frequency.setTargetAtTime(600, t + 0.3, 0.3);
  noise('brown', t + 0.05, t + 1.4, ff);
  swell(fg.gain, t + 0.05, 0.9, 0.2, 0.1, 0.3);
  const sg = gain(v, 0, out);
  noise('crackle', t + 0.15, t + 1.4, filt('highpass', 1500, 0.7, sg));
  swell(sg.gain, t + 0.15, 0.6 + Math.min(0.3, n * 0.05), 0.1, 0.4, 0.3);
}

// Lightning: a buzzing arc, crackle and the snap of the strike, with a near
// thunderclap behind it.
export function zap(x0, x1) {
  const v = voice('zap', { x: x1, gain: 0.5, rev: 0.35, dur: 0.9, pri: 2 });
  if (!v) return;
  const { t, out } = v;
  const sg = gain(v, 0, out);
  noise('white', t, t + 0.05, filt('highpass', 2500, 0.7, sg));
  hitEnv(sg.gain, t, 1, 0.0005, 0.008);
  const bg = gain(v, 0, out);
  const bo = osc('sawtooth', 75, t, t + 0.6, filt('highpass', 300, 0.7, bg));
  noise('white', t, t + 0.6, gain(v, 900, bo.frequency)); // jitter the arc's pitch
  swell(bg.gain, t, 0.35, 0.005, 0.18, 0.1);
  const cg = gain(v, 0, out);
  noise('crackle', t, t + 0.8, filt('highpass', 1800, 0.7, cg), 1.4);
  swell(cg.gain, t, 1.2, 0.003, 0.15, 0.15);
  thunder(0.85, { delay: 0.12, x: x1 });
}

// The masts charging before a strike.
export function charge(x) {
  const v = voice('zap', { x, gain: 0.18, rev: 0.3, dur: 0.6 });
  if (!v) return;
  const { t, out } = v;
  const g = gain(v, 0, out);
  const o = osc('sawtooth', 160, t, t + 0.6, filt('bandpass', 1200, 1.5, g));
  glide(o.frequency, t, 160, 1400, 0.45);
  swell(g.gain, t, 0.6, 0.35, 0.05, 0.05);
}

// Thunder near (0..1): near thunder cracks first and rolls hard; far thunder
// arrives late and is only a low rumble.
export function thunder(near = 0.5, o = {}) {
  const n = clamp(near, 0, 1), L = 3.5 + (1 - n) * 2;
  const v = voice('thunder', { x: o.x ?? rnd(200, 1100), gain: 0.3 + 0.55 * n, rev: 0.6, dur: L + 0.5, delay: (o.delay ?? 0) + (1 - n) * rnd(0.6, 1.6), pri: 2 });
  if (!v) return;
  const { t, out } = v;
  if (n > 0.45) {
    const cg = gain(v, 0, out);
    noise('white', t, t + 0.4, filt('highpass', 1400, 0.7, cg));
    hitEnv(cg.gain, t, 0.7 * n, 0.002, 0.05);
    const tg = gain(v, 0, out);
    noise('crackle', t + 0.02, t + 0.7, filt('bandpass', 1400, 0.8, tg));
    swell(tg.gain, t + 0.02, 0.9 * n, 0.01, 0.15, 0.12);
  }
  const rg = gain(v, 0, out);
  const rf = filt('lowpass', 140 + 520 * n, 0.8, rg);
  rf.frequency.setTargetAtTime(90 + 120 * n, t + 0.3, L * 0.4);
  noise('brown', t, t + L + 0.4, rf);
  rg.gain.setValueAtTime(0, t);
  let at = t;
  const rolls = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < rolls; i++) {
    const peak = (i === 0 ? 1 : rnd(0.4, 0.9)) * (1 - i / (rolls + 1));
    rg.gain.setTargetAtTime(peak, at, i === 0 ? 0.02 + (1 - n) * 0.15 : 0.12);
    at += rnd(0.3, 0.9);
    rg.gain.setTargetAtTime(peak * 0.35, at - 0.15, 0.2);
  }
  rg.gain.setTargetAtTime(0, at, 0.6);
  if (n > 0.6) duck(0.6, 0.4);
}

// Kraken: the surge as a tentacle rises, then a wet slam.
export function kraken(x, o = {}) {
  const v = voice('kraken', { x, gain: 0.7, rev: 0.35, dur: 2, delay: o.delay, pri: 2 });
  if (!v) return;
  const { t, out } = v, slam = t + (o.rise ?? 0.55);
  const ug = gain(v, 0, out);
  const uf = filt('lowpass', 300, 1, ug);
  uf.frequency.setValueAtTime(250, t); uf.frequency.exponentialRampToValueAtTime(1400, slam);
  noise('pink', t, slam + 0.1, uf);
  ug.gain.setValueAtTime(0, t); ug.gain.linearRampToValueAtTime(0.35, slam - 0.05); ug.gain.linearRampToValueAtTime(0, slam + 0.08);
  const gg = gain(v, 0, out); // a low groan from below
  osc('sawtooth', 44, t, slam + 0.2, filt('lowpass', 260, 2, gg));
  swell(gg.gain, t, 0.3, slam - t - 0.1, 0.05, 0.08);
  const sg = gain(v, 0, out);
  const so = osc('sine', 62, slam, slam + 1, sg);
  glide(so.frequency, slam, 62, 30, 0.35);
  hitEnv(sg.gain, slam, 1, 0.003, 0.22);
  const pg = gain(v, 0, out);
  noise('white', slam, slam + 0.2, filt('bandpass', 950, 0.6, pg));
  hitEnv(pg.gain, slam, 0.85, 0.001, 0.03);
  const wg = gain(v, 0, out); // the squelch
  const wf = filt('bandpass', 400, 5, wg);
  wf.frequency.setValueAtTime(380, slam); wf.frequency.exponentialRampToValueAtTime(1500, slam + 0.12); wf.frequency.exponentialRampToValueAtTime(280, slam + 0.4);
  noise('pink', slam, slam + 0.5, wf);
  swell(wg.gain, slam, 0.9, 0.01, 0.15, 0.1);
  splash(x, 1.8, slam - v.c.currentTime);
  duck(0.6, 0.25);
}

// A wet squeeze while a tentacle crushes a hull.
export function squelch(x) {
  const v = voice('kraken', { x, gain: 0.25, rev: 0.2, dur: 0.6 });
  if (!v) return;
  const { t, out } = v;
  const g = gain(v, 0, out);
  const f = filt('bandpass', 500, 6, g);
  f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1100, t + 0.2); f.frequency.exponentialRampToValueAtTime(400, t + 0.5);
  noise('pink', t, t + 0.6, f);
  swell(g.gain, t, 1, 0.05, 0.25, 0.08);
  groan(x, 0.5, { dur: 0.7 });
}

// Boss spit, slime or a thrown wave: a wet hiss.
export function spit(x) {
  const v = voice('spit', { x, gain: 0.5, rev: 0.25, dur: 0.8 });
  if (!v) return;
  const { t, out } = v;
  const g = gain(v, 0, out);
  const f = filt('bandpass', 3000, 1.2, g);
  f.frequency.setValueAtTime(4500, t); f.frequency.exponentialRampToValueAtTime(1200, t + 0.6);
  noise('white', t, t + 0.8, f);
  swell(g.gain, t, 0.8, 0.02, 0.2, 0.15);
}

// ------------------------------------------------------------ money and UI
export function coins(x, n = 1) {
  const clinks = clamp(1 + Math.round(Math.log2(Math.max(1, n) / 5 + 1)), 1, 5);
  const v = voice('coin', { x, gain: 0.32, rev: 0.25, dur: 0.6 + clinks * 0.06 });
  if (!v) return;
  const { t, out } = v;
  for (let i = 0; i < clinks; i++) {
    const at = t + i * rnd(0.04, 0.07), f = rnd(1950, 2500);
    for (const [m, a, d] of [[1, 0.5, 0.09], [2.42, 0.25, 0.06], [3.93, 0.12, 0.04]]) {
      const g = gain(v, 0, out);
      osc('sine', f * m, at, at + 0.5, g);
      hitEnv(g.gain, at, a / Math.sqrt(clinks), 0.001, d);
    }
  }
}

// A bell-like tone (fundamental plus slightly stretched partials).
export function bell(v, at, midi, a = 0.2, tau = 0.6, dest) {
  const f = mtof(midi);
  for (const [m, k, d] of [[1, 1, 1], [2.0, 0.5, 0.6], [3.01, 0.28, 0.4], [4.17, 0.12, 0.25], [0.5, 0.25, 1.4]]) {
    const g = gain(v, 0, dest || v.out);
    osc('sine', f * m, at, at + tau * d * 6 + 0.05, g);
    hitEnv(g.gain, at, a * k, 0.002, tau * d);
  }
}

const RARITY = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 4 };
export function cardPick(rarity) {
  const r = RARITY[rarity] ?? 0;
  const notes = [74, 81, 86, 89, 93].slice(0, 2 + Math.min(3, r));
  const v = voice('card', { gain: 0.45, rev: 0.4 + r * 0.08, dur: 1.6 + r * 0.4, pri: 2 });
  if (!v) return;
  const { t } = v;
  notes.forEach((m, i) => bell(v, t + i * 0.075, m, 0.16, 0.45 + r * 0.08));
  if (r >= 3) { // sparkle
    const g = gain(v, 0, v.out), o = osc('sine', 3000, t, t + 1.6, g);
    g.gain.setValueAtTime(0, t);
    for (let i = 0, at = t + 0.25; i < 9 + r * 2; i++, at += rnd(0.04, 0.1)) {
      o.frequency.setValueAtTime(rnd(2600, 5200), at); g.gain.setValueAtTime(0.05, at); g.gain.setTargetAtTime(0, at + 0.002, 0.03);
    }
  }
  if (r >= 2) { // a soft swell of brass under the bells
    const g = gain(v, 0, v.out), lp = filt('lowpass', 500, 0.8, g);
    for (const m of [50, 57, 62]) { osc('sawtooth', mtof(m), t, t + 1.4, lp); }
    lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1600, t + 0.35); lp.frequency.setTargetAtTime(500, t + 0.5, 0.3);
    swell(g.gain, t, 0.05 + r * 0.01, 0.2, 0.4, 0.3);
  }
}

// Paper: a swish of band-passed noise.
function paper(v, at, f0 = 900, f1 = 3200, len = 0.22, a = 0.3) {
  const g = gain(v, 0, v.out), f = filt('bandpass', f0, 1.1, g);
  f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + len);
  noise('white', at, at + len + 0.05, f);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(a, at + len * 0.3); g.gain.linearRampToValueAtTime(0, at + len);
}

export function cardsOpen() {
  const v = voice('card', { gain: 0.4, rev: 0.45, dur: 2, pri: 2 });
  if (!v) return;
  const { t } = v;
  paper(v, t, 700, 3000, 0.3, 0.35);
  paper(v, t + 0.12, 900, 3500, 0.2, 0.2);
  [62, 65, 69, 74, 76].forEach((m, i) => pluckTo(v, t + 0.08 + i * 0.09, m, 0.14));
}

export function reroll() {
  const v = voice('card', { gain: 0.4, rev: 0.25, dur: 0.8, pri: 2 });
  if (!v) return;
  for (let i = 0; i < 6; i++) paper(v, v.t + i * 0.045, 1500, 4200, 0.04, 0.4);
  coins(null, 50);
}

// A harp-like pluck into a voice (the music has its own, on the music bus).
function pluckTo(v, at, midi, a) {
  const g = gain(v, 0, v.out), f = filt('lowpass', 3000, 1, g);
  f.frequency.setValueAtTime(4000, at); f.frequency.setTargetAtTime(700, at, 0.15);
  osc('triangle', mtof(midi), at, at + 1.2, f);
  osc('sawtooth', mtof(midi), at, at + 1.2, gain(v, 0.25, f));
  hitEnv(g.gain, at, a, 0.003, 0.35);
}

export function click(kind = 'click') {
  const big = kind === 'start' || kind === 'restart';
  const v = voice('ui', { gain: big ? 0.4 : 0.22, rev: big ? 0.35 : 0.08, dur: big ? 1.6 : 0.15, pri: 2 });
  if (!v) return;
  const { t, out } = v;
  if (big) { bell(v, t, 76, 0.18, 0.5); bell(v, t + 0.32, 76, 0.16, 0.5); return; } // the ship's bell, twice
  const g = gain(v, 0, out), o = osc('sine', 1500, t, t + 0.06, g);
  glide(o.frequency, t, kind === 'back' ? 900 : 1500, kind === 'back' ? 600 : 950, 0.03);
  hitEnv(g.gain, t, 0.5, 0.001, 0.012);
  const ng = gain(v, 0, out);
  noise('white', t, t + 0.03, filt('bandpass', 3200, 2, ng));
  hitEnv(ng.gain, t, 0.35, 0.0005, 0.004);
}

export function hover() {
  const v = voice('hover', { gain: 0.06, dur: 0.06 });
  if (!v) return;
  const g = gain(v, 0, v.out);
  osc('sine', 2300, v.t, v.t + 0.05, g);
  hitEnv(g.gain, v.t, 1, 0.001, 0.008);
}

// --------------------------------------------------------- banners & bosses
// A brass horn: detuned saws whose filter opens with the swell.
export function horn(v, at, midi, len, a = 0.2, dest) {
  const g = gain(v, 0, dest || v.out), lp = filt('lowpass', 400, 1.2, g), f = mtof(midi);
  for (const d of [-4, 3]) { const o = osc('sawtooth', f, at, at + len + 0.4, lp); o.detune.value = d; }
  lp.frequency.setValueAtTime(350, at); lp.frequency.linearRampToValueAtTime(f * 5, at + 0.12); lp.frequency.setTargetAtTime(f * 3, at + 0.15, 0.3);
  swell(g.gain, at, a, 0.06, Math.max(0, len - 0.06), 0.12);
}

export function legBanner() {
  const v = voice('fanfare', { gain: 0.35, rev: 0.5, dur: 3, pri: 2 });
  if (!v) return;
  const { t } = v;
  horn(v, t, 50, 0.35, 0.18); horn(v, t, 57, 0.35, 0.12);
  horn(v, t + 0.45, 57, 1.3, 0.2); horn(v, t + 0.45, 62, 1.3, 0.16);
  bell(v, t + 0.05, 74, 0.1, 0.5); bell(v, t + 0.4, 74, 0.08, 0.5);
}

// A new wave sighted: a distant horn.
export function waveHorn() {
  const v = voice('fanfare', { x: 1150, gain: 0.22, rev: 0.6, dur: 2 });
  if (!v) return;
  const muf = filt('lowpass', 900, 0.7, v.out);
  horn(v, v.t, 45, 0.5, 0.2, muf); horn(v, v.t + 0.55, 50, 0.9, 0.2, muf);
}

export function cleared() {
  const v = voice('fanfare', { gain: 0.35, rev: 0.45, dur: 2.2, pri: 2 });
  if (!v) return;
  const { t } = v;
  horn(v, t, 57, 0.12, 0.18); horn(v, t + 0.15, 57, 0.12, 0.18);
  horn(v, t + 0.3, 62, 1.0, 0.2); horn(v, t + 0.3, 66, 1.0, 0.14); horn(v, t + 0.3, 69, 1.0, 0.12);
}

// Roars: the serpent hisses and screeches, the Leviathan growls from the deep.
export function roar(kind, x = 900, o = {}) {
  const lev = kind !== 'serpent', L = o.len ?? (lev ? 2.6 : 1.8);
  const v = voice('roar', { x, gain: (lev ? 0.75 : 0.55) * (o.gain ?? 1), rev: 0.5, dur: L + 0.6, delay: o.delay, pri: 2 });
  if (!v) return;
  const { t, out } = v, fall = o.fall ? 0.55 : 1;
  if (lev) {
    const g = gain(v, 0, out), lp = filt('lowpass', 700, 1, g), fm = filt('bandpass', 420, 2.5, g);
    const am = gain(v, 0.6, lp); am.connect(fm);
    osc('sine', 27, t, t + L, gain(v, 0.4, am.gain)); // the rattle in its throat
    const pts = new Float32Array([40, 52, 60, 55, 46 * fall, 36 * fall]);
    for (const d of [0, 7, -9]) { const s = osc('sawtooth', 44, t, t + L, am); s.detune.value = d * 4; s.frequency.setValueCurveAtTime(pts, t, L); }
    swell(g.gain, t, 0.9, L * 0.3, L * 0.4, L * 0.12);
    const sg = gain(v, 0, out); const so = osc('sine', 32, t, t + L, sg);
    so.frequency.setValueCurveAtTime(new Float32Array([28, 36, 30 * fall]), t, L);
    swell(sg.gain, t, 0.7, L * 0.3, L * 0.4, L * 0.15);
    const wg = gain(v, 0, out); noise('pink', t, t + L, filt('lowpass', 600, 0.7, wg));
    swell(wg.gain, t, 0.3, L * 0.4, L * 0.3, L * 0.2);
  } else {
    const hg = gain(v, 0, out); noise('white', t, t + L, filt('highpass', 3500, 0.7, hg));
    swell(hg.gain, t, 0.35, 0.3, L * 0.4, 0.2);
    const g = gain(v, 0, out), bp = filt('bandpass', 1300, 2, g), bp2 = filt('bandpass', 2600, 3, g);
    const s = osc('sawtooth', 380, t + 0.15, t + L, bp); s.connect(bp2);
    s.frequency.setValueCurveAtTime(new Float32Array([340, 600, 660, 520, 380 * fall, 300 * fall]), t + 0.15, L - 0.15);
    osc('sine', 7, t, t + L, gain(v, 22, s.frequency));
    swell(g.gain, t + 0.15, 0.4, 0.25, L * 0.45, 0.2);
  }
  duck(0.5, L * 0.6);
}

export function bossSpawn(kind) {
  const v = voice('fanfare', { gain: 0.5, rev: 0.6, dur: 4, pri: 2 });
  if (v) {
    const { t } = v;
    horn(v, t, 38, 2.4, 0.22); horn(v, t, 39, 2.4, 0.14); horn(v, t + 0.6, 45, 1.8, 0.14);
    for (const at of [0, 0.9, 1.8]) timp(v, t + at, 38, 0.8);
  }
  roar(kind, 1000, { delay: 1.2 });
}

export function bossPhase(kind, phase) {
  explode(1000, 1.6);
  roar(kind, 1000, { delay: 0.3 });
  const v = voice('fanfare', { gain: 0.4, rev: 0.6, dur: 3, pri: 2 });
  if (v) { for (const m of [50, 53, 57, 62]) choirNote(v, v.t + 0.2, m + (phase >= 3 ? 1 : 0), 2, 0.05); timp(v, v.t, 38, 1); }
}

export function bossDead(kind) {
  roar(kind, 1000, { len: 3.2, fall: true });
  explode(1000, 2.2);
  explode(1080, 1.4);
  sink(1000, true);
}

export function timp(v, at, midi, a = 0.6) {
  const g = gain(v, 0, v.out), o = osc('sine', mtof(midi) * 1.03, at, at + 1.5, g);
  o.frequency.setTargetAtTime(mtof(midi), at, 0.05);
  hitEnv(g.gain, at, a, 0.003, 0.45);
  const ng = gain(v, 0, v.out);
  noise('brown', at, at + 0.3, filt('lowpass', 500, 0.8, ng));
  hitEnv(ng.gain, at, a * 0.8, 0.002, 0.06);
}

// One choir voice: saws through two vowel formants ("ah").
export function choirNote(v, at, midi, len, a = 0.05, dest) {
  const g = gain(v, 0, dest || v.out), f = mtof(midi);
  const f1 = filt('bandpass', 750, 5, g), f2 = filt('bandpass', 1150, 7, g);
  const mixg = gain(v, 1); mixg.connect(f1); mixg.connect(f2);
  for (const d of [-7, 6]) { const o = osc('sawtooth', f, at, at + len + 0.8, mixg); o.detune.value = d; }
  swell(g.gain, at, a * 3, Math.min(0.5, len * 0.4), len * 0.4, 0.3);
}

// ------------------------------------------------------------- end stings
// (played on the music bus by music.js, which also stops the score)
export { bell as bellTone };
