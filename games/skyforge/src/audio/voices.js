// Instruments: each call schedules one note at audio time t into `dest`.
// Sampled voices (pluck, bell, drums) replay buffers from samples.js; the rest
// are small oscillator graphs that stop themselves.
import { pickPitched } from './samples.js';

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function createVoices(ctx, S) {
  const panned = (dest, pan) => {
    if (!pan || !ctx.createStereoPanner) return dest;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(dest); return p;
  };
  const gainAt = (dest, v) => { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; };

  function sample(dest, t, buffer, { vel = 1, rate = 1, pan = 0, dur = null, fade = 0.08, offset = 0 } = {}) {
    if (!buffer) return null;
    const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vel;
    src.connect(g); g.connect(panned(dest, pan));
    src.start(t, offset);
    if (dur != null) { g.gain.setValueAtTime(vel, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + fade); src.stop(t + dur + fade + 0.02); }
    return { src, g };
  }

  function pitched(dest, t, set, midi, vel, opts = {}) {
    const f = mtof(midi), [base, b] = pickPitched(set, f);
    return sample(dest, t, b, { ...opts, vel, rate: f / base });
  }

  const V = {
    sample,
    pluck: (dest, t, midi, vel = 0.5, o = {}) => pitched(dest, t, S.pluck, midi, vel, o),
    pizz: (dest, t, midi, vel = 0.5, o = {}) => pitched(dest, t, S.pizz, midi, vel, o),
    bell: (dest, t, midi, vel = 0.4, o = {}) => pitched(dest, t, S.bell, midi, vel, o),
    celesta: (dest, t, midi, vel = 0.4, o = {}) => pitched(dest, t, S.celesta, midi, vel, o),
    drum: (dest, t, name, vel = 0.6, o = {}) => sample(dest, t, S[name], { vel, ...o }),

    // warm sustained chord: detuned saws through a soft lowpass, slow swell
    pad(dest, t, midis, dur, vel = 0.12, { attack = 1.2, release = 1.6, cutoff = 1100, wave = 'sawtooth', detune = 7, pan = 0, vowel = null } = {}) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + attack);
      g.gain.setValueAtTime(vel, t + Math.max(attack, dur));
      g.gain.linearRampToValueAtTime(0, t + Math.max(attack, dur) + release);
      let head = g;
      if (vowel) {
        // a choir-like "ah": three formant bands in parallel
        const mix = ctx.createGain(); mix.gain.value = 1; mix.connect(panned(dest, pan));
        for (const [f, q, a] of vowel) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const ga = gainAt(mix, a); bp.connect(ga); g.connect(bp); }
      } else {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.4;
        g.connect(lp); lp.connect(panned(dest, pan));
        head = g;
      }
      const end = t + Math.max(attack, dur) + release + 0.05;
      const n = midis.length;
      for (const m of midis) for (const d of [-detune, detune]) {
        const o = ctx.createOscillator(); o.type = wave; o.frequency.value = mtof(m); o.detune.value = d;
        const og = gainAt(head, 1 / Math.sqrt(n * 2)); o.connect(og);
        o.start(t); o.stop(end);
      }
      return g;
    },

    // breathy wooden flute: sine + soft triangle, delayed vibrato, breath noise on the attack
    flute(dest, t, midi, dur, vel = 0.2, { pan = 0, vib = 5.2, glide = null } = {}) {
      const f = mtof(midi);
      const out = panned(dest, pan);
      const g = ctx.createGain();
      const a = 0.05, r = 0.18;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + a);
      g.gain.setTargetAtTime(vel * 0.82, t + a, 0.2);
      g.gain.setValueAtTime(vel * 0.82, t + Math.max(a, dur)); g.gain.linearRampToValueAtTime(0, t + Math.max(a, dur) + r);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(6000, f * 5); lp.Q.value = 0.3;
      g.connect(lp); lp.connect(out);
      const end = t + Math.max(a, dur) + r + 0.05;
      const lfo = ctx.createOscillator(); lfo.frequency.value = vib;
      const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + 0.25); lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.6);
      lfo.connect(lg);
      for (const [type, amp, mul] of [['sine', 1, 1], ['triangle', 0.18, 1], ['sine', 0.08, 2]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
        if (glide) { o.frequency.setValueAtTime(mtof(glide) * mul, t); o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.08); }
        lg.connect(o.frequency);
        const og = gainAt(g, amp); o.connect(og); o.start(t); o.stop(end);
      }
      lfo.start(t); lfo.stop(end);
      // breath
      const n = ctx.createBufferSource(); n.buffer = S.white; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 1.5;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(vel * 0.35, t + 0.02); ng.gain.exponentialRampToValueAtTime(vel * 0.04, t + 0.15);
      ng.gain.setValueAtTime(vel * 0.04, t + Math.max(a, dur)); ng.gain.linearRampToValueAtTime(0, t + Math.max(a, dur) + r);
      n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t, Math.random() * 1.5); n.stop(end);
    },

    // brass: saws with a filter that opens on the attack
    brass(dest, t, midis, dur, vel = 0.15, { pan = 0, bright = 1 } = {}) {
      if (!Array.isArray(midis)) midis = [midis];
      const g = ctx.createGain(); const a = 0.06, r = 0.25;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + a); g.gain.setTargetAtTime(vel * 0.75, t + a, 0.15);
      g.gain.setValueAtTime(vel * 0.75, t + Math.max(a, dur)); g.gain.linearRampToValueAtTime(0, t + Math.max(a, dur) + r);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
      const top = Math.min(9000, mtof(midis[0]) * 7 * bright);
      lp.frequency.setValueAtTime(top * 0.2, t); lp.frequency.exponentialRampToValueAtTime(top, t + a * 1.5); lp.frequency.setTargetAtTime(top * 0.55, t + a * 2, 0.3);
      g.connect(lp); lp.connect(panned(dest, pan));
      const end = t + Math.max(a, dur) + r + 0.05;
      for (const m of midis) for (const d of [-5, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d;
        o.detune.setValueAtTime(d - 30, t); o.detune.linearRampToValueAtTime(d, t + 0.05);
        const og = gainAt(g, 0.6 / Math.sqrt(midis.length)); o.connect(og); o.start(t); o.stop(end);
      }
    },

    // short bowed string (ostinato)
    stacc(dest, t, midi, dur, vel = 0.12, { pan = 0, cutoff = 2200 } = {}) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.012); g.gain.exponentialRampToValueAtTime(vel * 0.3, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.7;
      g.connect(lp); lp.connect(panned(dest, pan));
      for (const d of [-8, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi); o.detune.value = d; const og = gainAt(g, 0.5); o.connect(og); o.start(t); o.stop(t + dur + 0.08); }
    },

    // round bass: sine sub + a plucked attack
    bass(dest, t, midi, dur, vel = 0.3, { pan = 0 } = {}) {
      const g = ctx.createGain(); const f = mtof(midi);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.3);
      g.gain.setValueAtTime(vel * 0.5, t + Math.max(0.3, dur)); g.gain.linearRampToValueAtTime(0, t + Math.max(0.3, dur) + 0.12);
      g.connect(panned(dest, pan));
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g);
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(g);
      const end = t + Math.max(0.3, dur) + 0.2; o.start(t); o.stop(end); o2.start(t); o2.stop(end);
      V.pizz(dest, t, midi + 12, vel * 0.5, { pan });
    },

    // rumbling low drone for storms: a cluster of saws through a wandering lowpass
    drone(dest, t, midis, dur, vel = 0.1, { pan = 0 } = {}) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + dur * 0.35); g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
      lp.frequency.setValueAtTime(140, t); lp.frequency.linearRampToValueAtTime(420, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(160, t + dur);
      g.connect(lp); lp.connect(panned(dest, pan));
      for (const m of midis) for (const d of [-12, 0, 13]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d; const og = gainAt(g, 0.35); o.connect(og); o.start(t); o.stop(t + dur + 0.6); }
    },
  };
  return V;
}
