// Moonbound audio: the building blocks every sound and every instrument is made of. A Kit wraps
// one BaseAudioContext (live or offline: the same recipe renders either) and makes the small
// node graphs we need: a tone with an envelope and filters, a burst of coloured noise, a bank of
// decaying partials (bells, metal, glass), an FM pair. Every call takes (dest, t, options): the
// node to feed, the start time in seconds on the context clock, and what to make.
//
// Nodes made here are short-lived: each source is stopped when its sound is over and then
// garbage-collected, so nothing is built per frame and nothing is left behind.
import { seeded, noiseTable } from './dsp.js';

const NOISE_SECONDS = 3;
const noiseCache = new Map(); // `${kind}:${sr}` -> Float32Array, shared by every context

export function sharedNoise(kind, sr) {
  const key = `${kind}:${sr}`;
  let d = noiseCache.get(key);
  if (!d) {
    d = noiseTable(kind, Math.round(NOISE_SECONDS * sr), seeded(kind === 'white' ? 11 : kind === 'pink' ? 23 : 37));
    noiseCache.set(key, d);
  }
  return d;
}

const FLOOR = 1e-4;

// A struck / plucked envelope on a gain param: starts silent, rises to g in `a` seconds (linear),
// optionally holds, then dies away exponentially with time constant `tau`.
export function perc(p, t, g, a, tau, hold = 0) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + Math.max(a, 0.0005));
  if (hold > 0) p.setValueAtTime(g, t + a + hold);
  p.setTargetAtTime(0, t + a + hold, tau);
}

// A held envelope: attack a, sustain until t + dur, release r (all exponential-ish and click-free).
export function held(p, t, g, a, dur, r) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(g, t + a);
  const end = Math.max(t + a, t + dur);
  p.setValueAtTime(g, end);
  p.setTargetAtTime(0, end, r / 4);
}

// piecewise-linear envelope through [[seconds after t, level], ...]
export function pts(p, t, list) {
  p.setValueAtTime(list[0][1], t + list[0][0]);
  for (let i = 1; i < list.length; i++) p.linearRampToValueAtTime(list[i][1], t + list[i][0]);
}

export class Kit {
  constructor(ctx, seed = 1) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    this.rnd = seeded(seed);
    this._nz = {};
    this._curves = new Map();
    this.trace = null; // tests: an array that instruments push their notes to
  }

  // ---- shared resources

  noiseBuf(kind = 'white') {
    let b = this._nz[kind];
    if (!b) {
      const d = sharedNoise(kind, this.sr);
      b = this.ctx.createBuffer(1, d.length, this.sr);
      if (b.copyToChannel) b.copyToChannel(d, 0);
      else b.getChannelData(0).set(d);
      this._nz[kind] = b;
    }
    return b;
  }

  // a tanh waveshaper curve, normalised so full scale stays full scale
  curve(drive) {
    const key = Math.round(drive * 100);
    let c = this._curves.get(key);
    if (!c) {
      const n = 2049;
      c = new Float32Array(n);
      const k = 1 / Math.tanh(drive);
      for (let i = 0; i < n; i++) c[i] = Math.tanh(drive * ((i / (n - 1)) * 2 - 1)) * k;
      this._curves.set(key, c);
    }
    return c;
  }

  shaper(drive) {
    const s = this.ctx.createWaveShaper();
    s.curve = this.curve(drive);
    return s;
  }

  gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  // ---- filters

  // spec: { t: type, f: Hz, f1: end Hz (exponential sweep), ft: seconds the sweep takes, q, q1, gain (dB) }
  filter(spec, t, dur) {
    const f = this.ctx.createBiquadFilter();
    f.type = spec.t;
    const top = this.sr * 0.45;
    f.frequency.setValueAtTime(Math.min(top, Math.max(10, spec.f)), t);
    if (spec.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.min(top, Math.max(10, spec.f1)), t + (spec.ft ?? dur));
    f.Q.setValueAtTime(spec.q ?? 0.707, t);
    if (spec.q1 !== undefined) f.Q.linearRampToValueAtTime(spec.q1, t + (spec.ft ?? dur));
    if (spec.gain !== undefined) f.gain.value = spec.gain;
    return f;
  }

  chain(input, specs, t, dur) {
    let n = input;
    if (specs) {
      for (const s of specs) {
        const f = this.filter(s, t, dur);
        n.connect(f);
        n = f;
      }
    }
    return n;
  }

  // ---- sources

  // A tone: oscillator -> (drive) -> filters -> envelope -> dest.
  //   o: { type, f, f1 (end Hz), ft (pitch time constant, s), a (attack), tau (decay constant), hold,
  //        dur (stop time), g (peak gain), det (cents), drive, filt: [filter specs],
  //        lfo: { f Hz, d (cents) } vibrato }
  tone(dest, t, o) {
    const ctx = this.ctx;
    const a = o.a ?? 0.002;
    const tau = o.tau ?? 0.1;
    const dur = o.dur ?? a + (o.hold ?? 0) + tau * 8;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1 !== undefined) osc.frequency.setTargetAtTime(o.f1, t, o.ft ?? 0.05);
    if (o.det) osc.detune.value = o.det;
    let n = osc;
    if (o.drive) {
      const sh = this.shaper(o.drive);
      n.connect(sh);
      n = sh;
    }
    n = this.chain(n, o.filt, t, dur);
    const env = ctx.createGain();
    env.gain.value = 0;
    perc(env.gain, t, o.g ?? 1, a, tau, o.hold ?? 0);
    n.connect(env);
    env.connect(dest);
    if (o.lfo) this.vibrato(osc.detune, t, dur, o.lfo.f, o.lfo.d);
    osc.start(t);
    osc.stop(t + dur);
    return env;
  }

  // A burst of noise: buffer -> filters -> envelope -> dest.
  //   o: { kind: white|pink|brown, a, tau, hold, dur, g, rate (playback rate: pitch of the noise),
  //        filt: [filter specs], env: [[s, level]...] (instead of a, tau: a piecewise-linear shape) }
  noise(dest, t, o) {
    const ctx = this.ctx;
    const a = o.a ?? 0.001;
    const tau = o.tau ?? 0.05;
    const dur = o.dur ?? (o.env ? o.env[o.env.length - 1][0] + 0.02 : a + (o.hold ?? 0) + tau * 8);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf(o.kind || 'white');
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    let n = this.chain(src, o.filt, t, dur);
    const env = ctx.createGain();
    env.gain.value = 0;
    if (o.env) {
      const list = o.env.map(([s, v]) => [s, v * (o.g ?? 1)]);
      pts(env.gain, t, list);
    } else {
      perc(env.gain, t, o.g ?? 1, a, tau, o.hold ?? 0);
    }
    n.connect(env);
    env.connect(dest);
    src.start(t, (o.off ?? this.rnd() * (NOISE_SECONDS - 0.5)) % (NOISE_SECONDS - 0.1));
    src.stop(t + dur);
    return env;
  }

  // A bank of decaying sine partials ringing from time t: bells, glass, metal, wood.
  //   o: { f, parts: [[ratio, amp, tau], ...], g, a, det (random cents per partial), tauScale }
  modal(dest, t, o) {
    const ctx = this.ctx;
    const g = o.g ?? 1;
    const a = o.a ?? 0.0006;
    const ts = o.tauScale ?? 1;
    for (const [ratio, amp, tau0] of o.parts) {
      const f = o.f * ratio;
      if (f >= this.sr * 0.45 || amp * g < 1e-5) continue;
      const tau = tau0 * ts;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      if (o.det) osc.detune.value = (this.rnd() * 2 - 1) * o.det;
      const env = ctx.createGain();
      env.gain.value = 0;
      perc(env.gain, t, amp * g, a, tau);
      osc.connect(env);
      env.connect(dest);
      osc.start(t);
      osc.stop(t + a + tau * 7);
    }
  }

  // Two-operator FM: sine carrier f, modulator at f * ratio, index (peak deviation / modulator f)
  // falling from `index` to `index1` over the sound.
  //   o: { f, f1, ft, ratio, index, index1, a, tau, g, dur, filt }
  fm(dest, t, o) {
    const ctx = this.ctx;
    const a = o.a ?? 0.002;
    const tau = o.tau ?? 0.1;
    const dur = o.dur ?? a + tau * 8;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.frequency.setValueAtTime(o.f, t);
    mod.frequency.setValueAtTime(o.f * (o.ratio ?? 2), t);
    if (o.f1 !== undefined) {
      car.frequency.setTargetAtTime(o.f1, t, o.ft ?? 0.05);
      mod.frequency.setTargetAtTime(o.f1 * (o.ratio ?? 2), t, o.ft ?? 0.05);
    }
    const dev = (o.index ?? 2) * o.f * (o.ratio ?? 2);
    mg.gain.setValueAtTime(dev, t);
    mg.gain.setTargetAtTime((o.index1 ?? 0.2) * o.f * (o.ratio ?? 2), t, tau * 0.6);
    mod.connect(mg);
    mg.connect(car.frequency);
    const env = ctx.createGain();
    env.gain.value = 0;
    perc(env.gain, t, o.g ?? 1, a, tau);
    const n = this.chain(car, o.filt, t, dur);
    n.connect(env);
    env.connect(dest);
    car.start(t);
    mod.start(t);
    car.stop(t + dur);
    mod.stop(t + dur);
    return env;
  }

  // A low-frequency oscillator driving a param for [t, t + dur]
  vibrato(param, t, dur, f, depth) {
    const lfo = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    lfo.frequency.value = f;
    g.gain.value = depth;
    lfo.connect(g);
    g.connect(param);
    lfo.start(t);
    lfo.stop(t + dur);
  }

  // amplitude modulation: returns { input, output }; the signal is multiplied by 1 - depth + depth * (lfo + 1) / 2
  tremolo(t, dur, f, depth) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 1 - depth * 0.5;
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = f;
    lg.gain.value = depth * 0.5;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start(t);
    lfo.stop(t + dur);
    return g;
  }

  // A wordless voice: a stack of detuned saws through three parallel formant filters (bandpass),
  // with vibrato, a breath of noise, and an envelope. The formants can glide from one vowel to
  // another. Used for the choir-like moans, the cat and the ethereal swells: no words, ever.
  //   o: { f | fc: [[s, Hz], ...] (pitch contour), det: [cents], a, dur, rel, g,
  //        form: [[Hz, q, gain] x3], form1 (end formants), fT (seconds to glide), vib: [Hz, cents],
  //        breath (noise level), type }
  vox(dest, t, o) {
    const ctx = this.ctx;
    const dur = o.dur ?? 0.5;
    const rel = o.rel ?? 0.2;
    const stop = t + dur + rel;
    const sum = ctx.createGain();
    sum.gain.value = 1;
    for (const c of o.det || [-9, 0, 9]) {
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sawtooth';
      osc.detune.value = c;
      if (o.fc) {
        osc.frequency.setValueAtTime(o.fc[0][1], t + o.fc[0][0]);
        for (let i = 1; i < o.fc.length; i++) osc.frequency.linearRampToValueAtTime(o.fc[i][1], t + o.fc[i][0]);
      } else {
        osc.frequency.setValueAtTime(o.f, t);
        if (o.f1 !== undefined) osc.frequency.setTargetAtTime(o.f1, t, o.ft ?? 0.2);
      }
      if (o.vib) this.vibrato(osc.detune, t, dur + rel, o.vib[0], o.vib[1]);
      osc.connect(sum);
      osc.start(t);
      osc.stop(stop);
    }
    if (o.breath) {
      const nz = ctx.createBufferSource();
      nz.buffer = this.noiseBuf('pink');
      nz.loop = true;
      const ng = ctx.createGain();
      ng.gain.value = o.breath * 2;
      nz.connect(ng);
      ng.connect(sum);
      nz.start(t, this.rnd() * 2);
      nz.stop(stop);
    }
    const env = ctx.createGain();
    env.gain.value = 0;
    held(env.gain, t, o.g ?? 1, o.a ?? 0.05, dur, rel);
    for (let i = 0; i < o.form.length; i++) {
      const [fc, q, gn] = o.form[i];
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(fc, t);
      if (o.form1) bp.frequency.linearRampToValueAtTime(o.form1[i][0], t + (o.fT ?? dur));
      bp.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = gn;
      sum.connect(bp);
      bp.connect(fg);
      fg.connect(env);
    }
    env.connect(dest);
    return env;
  }
}
