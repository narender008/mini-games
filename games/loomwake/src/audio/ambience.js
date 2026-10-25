// Ambience: one looping bed per place (a filtered noise source, sometimes a
// pair of beating sines) plus sparse one-shots scheduled by tick(): glass
// chimes in Glasswood, drips and a far bell in the Choir, crackle and distant
// hammers in the Forge, whispers in the Unwoven, hearth and loom in the hub.
import * as K from './synth.js';

const BEDS = {
  hub:       { color: 'brown', f: 420, q: 0.6, gain: 0.16, am: 0.07, extra: 'hearth' },
  title:     { color: 'pink', f: 700, q: 0.9, gain: 0.07, am: 0.05 },
  glasswood: { color: 'pink', f: 650, q: 0.7, gain: 0.12, am: 0.09 },
  choir:     { color: 'brown', f: 320, q: 0.8, gain: 0.2, am: 0.23 },
  forge:     { color: 'brown', f: 220, q: 1.1, gain: 0.26, am: 0.6 },
  unwoven:   { color: 'pink', f: 380, q: 2, gain: 0.07, am: 0.04, hum: [55, 57.4] },
};

export function createAmbience(E) {
  const A = { id: null, bed: null, nextShot: 0 };
  function stopBed(b, fade = 1.5) {
    if (!b) return;
    const t = E.now(); b.g.gain.cancelScheduledValues(t); b.g.gain.setValueAtTime(b.g.gain.value, t); b.g.gain.linearRampToValueAtTime(0, t + fade);
    for (const s of b.srcs) { try { s.stop(t + fade + 0.1); } catch (e) {} }
  }
  A.set = (id) => {
    if (id === A.id) return;
    stopBed(A.bed); A.bed = null; A.id = id;
    const B = BEDS[id]; if (!B) return;
    const c = E.ctx, t = E.now();
    const g = c.createGain(); g.gain.value = 0; g.connect(E.amb);
    g.gain.linearRampToValueAtTime(B.gain, t + 2.5);
    const s = c.createBufferSource(); s.buffer = B.color === 'brown' ? E.brown : E.pink; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = B.f; f.Q.value = B.q;
    const am = c.createGain(); am.gain.value = 0.7;
    const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = B.am; lg.gain.value = 0.3; l.connect(lg); lg.connect(am.gain);
    s.connect(f); f.connect(am); am.connect(g);
    const srcs = [s, l];
    if (B.hum) for (const hz of B.hum) { const o = c.createOscillator(); o.frequency.value = hz; const og = c.createGain(); og.gain.value = 0.18; o.connect(og); og.connect(g); srcs.push(o); }
    for (const x of srcs) x.start(t);
    A.bed = { g, srcs }; A.nextShot = t + 2;
  };
  A.tick = (now) => {
    if (!A.id || now < A.nextShot) return;
    const r = Math.random, t = now + 0.1, out = E.amb, id = A.id;
    if (id === 'glasswood') { for (let i = 0; i < 1 + (r() * 3 | 0); i++) K.glass(E, t + i * 0.13, out, 84 + [0, 3, 5, 7, 10, 12][r() * 6 | 0], 0.18 + r() * 0.12, { d: 1.2 }); A.nextShot = now + 2.5 + r() * 4; }
    else if (id === 'choir') { if (r() < 0.8) K.drip(E, t, out, 0.4 + r() * 0.3); if (r() < 0.12) K.bell(E, t, out, 43 + (r() < 0.5 ? 0 : 7), 0.18, { d: 5 }); A.nextShot = now + 0.8 + r() * 2.4; }
    else if (id === 'forge') { for (let i = 0; i < 3; i++) K.noise(E, t + r() * 0.3, out, { ftype: 'highpass', f: 3000 + r() * 3000, a: 0.0005, d: 0.01, peak: 0.08 + r() * 0.1 }); if (r() < 0.15) K.anvil(E, t + 0.4, out, 0.15, { f: 600 + r() * 300, d: 1.2 }); A.nextShot = now + 0.6 + r() * 1.6; }
    else if (id === 'unwoven') { K.noise(E, t, out, { f: 1800 + r() * 2500, q: 7, a: 0.4, d: 0.9, peak: 0.07, am: [4 + r() * 6, 0.9] }); A.nextShot = now + 3 + r() * 5; }
    else if (id === 'hub') { for (let i = 0; i < 2; i++) K.noise(E, t + r() * 0.2, out, { ftype: 'highpass', f: 2500 + r() * 2000, a: 0.0005, d: 0.012, peak: 0.06 }); if (r() < 0.1) { K.noise(E, t, out, { f: 900, q: 6, a: 0.001, d: 0.05, peak: 0.1 }); K.noise(E, t + 0.18, out, { f: 850, q: 6, a: 0.001, d: 0.05, peak: 0.08 }); } A.nextShot = now + 0.7 + r() * 1.5; }
    else A.nextShot = now + 5;
  };
  A.stop = () => { stopBed(A.bed, 0.5); A.bed = null; A.id = null; };
  return A;
}
