// The layers every Horde Buster one-shot is stacked from (adapted from Iron
// Barrage's, extended with synth, gore and glass). Each one adds itself into a
// mono buffer at sample `at`:
//   crack    a very short burst of bright noise, then a quick dull snap
//   body     (dsp.js thump) a sine falling in pitch, driven through tanh
//   roar     broadband noise whose low-pass sweeps down as it decays; with
//            modFc/modDepth it flutters like something wet
//   rumble   low-passed noise that rolls and fades slowly: the chest and floor
//   debris   a scatter of tiny rattles, grit and ticks, thinning out over time
//   clods    heavier thuds of earth coming down
//   echo     off the street walls: smeared low noise swells at the echo times
//   modal    metal, glass and bells as a handful of damped partials
//   tone     an oscillator (sine, saw, square, triangle) with a pitch glide,
//            vibrato, FM, filter, drive and an envelope: pews, chimes, brass
//   whoosh   band-passed noise whose centre sweeps: air, riser, rocket
//   growl    a pulsing saw through moving formant filters: a roar, a grunt
//   bubbles  rising chirps like bubbles in blood
//   tinkle   a spray of ringing glass pings
// `runLayers` takes a list of plain descriptions of these, so each sound is a
// short recipe (see sfx.js).
import {
  TAU, BLOCK, WAVES, Biquad, wave, sawBL, whiteSync, noise, filter, sweepFilter, shape, expEnv, normalise, addTo, modulate, thump, damped, modal, fadeTail,
} from './dsp.js';

const E = Math.exp;

// noise shaped by a chain of filters [[type, f, q], ...], peak 1
function* colored(n, sr, r, chain) {
  const a = yield* noise(n, r);
  for (const [t, f, q] of chain) yield* filter(a, sr, t, f, q);
  yield* normalise(a, 1);
  return a;
}

// crack: { amp, dur, hp, snap, snapFc, snapTau }
export function* crack(out, sr, r, at, o) {
  const dur = o.dur ?? 0.01;
  const n = Math.max(8, Math.round(dur * sr));
  const a = yield* noise(n, r);
  yield* shape(a, sr, [[0, 0], [0.0002, 1], [dur * 0.25, 0.28], [dur, 0.004], [dur + 0.0004, 0]]);
  if (o.hp) yield* filter(a, sr, 'highpass', o.hp, 0.8);
  yield* normalise(a, 1);
  yield* addTo(out, a, o.amp ?? 1, at);
  const snap = o.snap ?? 0.5;
  if (snap > 0) {
    const tau = o.snapTau ?? 0.02;
    const m = Math.round(tau * 6 * sr);
    const b = yield* colored(m, sr, r, [['lowpass', o.snapFc ?? 3000, 0.7], ['lowpass', o.snapFc ?? 3000, 0.7]]);
    yield* shape(b, sr, expEnv(0.0004, tau, tau * 6));
    yield* addTo(out, b, (o.amp ?? 1) * snap, at);
  }
}

// roar: { dur, amp, fA, fB, tauF, q, hp, modFc, modDepth, att, env }
export function* roar(out, sr, r, at, o) {
  const n = Math.round(o.dur * sr);
  const a = yield* noise(n, r);
  const { fA, fB, tauF } = o;
  yield* sweepFilter(a, sr, 'lowpass', (t) => fB + (fA - fB) * E(-t / tauF), o.q ?? 0.8);
  if (o.hp) yield* filter(a, sr, 'highpass', o.hp, 0.7);
  yield* normalise(a, 1);
  if (o.modDepth) yield* modulate(a, sr, r, o.modFc ?? 20, o.modDepth);
  const att = o.att ?? 0.003;
  yield* shape(a, sr, o.env ?? [[0, 0], [att, 1], [Math.max(att * 2, o.dur * 0.12), 0.62], [o.dur, 0.01], [o.dur + 0.004, 0]]);
  fadeTail(a, sr, Math.min(60, o.dur * 250));
  yield* addTo(out, a, o.amp ?? 1, at);
}

// rumble: { dur, amp, fc, q, att, tau, rollFc, rollDepth }
export function* rumble(out, sr, r, at, o) {
  const n = Math.round(o.dur * sr);
  const a = yield* noise(n, r);
  yield* filter(a, sr, 'lowpass', o.fc, o.q ?? 1.0);
  yield* filter(a, sr, 'lowpass', o.fc * 1.7, 0.7);
  yield* normalise(a, 1);
  if (o.rollDepth) yield* modulate(a, sr, r, o.rollFc ?? 5, o.rollDepth);
  yield* shape(a, sr, expEnv(o.att ?? 0.02, o.tau, o.dur));
  fadeTail(a, sr, 120);
  yield* addTo(out, a, o.amp ?? 1, at);
}

// time of an event drawn from a density that falls off with time constant lam
export function when(r, t0, t1, lam) {
  const u = r();
  return t0 - lam * Math.log(1 - u * (1 - E(-(t1 - t0) / lam)));
}

// debris: { n, t0, t1, lam, amp, fLo, fHi, grit, gritLen }  (seconds; fLo..fHi is the pitch of the ticks;
// grit is the share that are sprays of grit rather than pings, gritLen how long they run)
export function* debris(out, sr, r, o) {
  const tab = whiteSync(8192, r);
  const fLo = o.fLo ?? 1500;
  const fHi = o.fHi ?? 6500;
  for (let k = 0; k < o.n; k++) {
    const t = when(r, o.t0, o.t1, o.lam ?? (o.t1 - o.t0) * 0.4);
    const fall = 1 - 0.7 * ((t - o.t0) / (o.t1 - o.t0 + 1e-6));
    const a = (o.amp ?? 1) * (0.2 + 0.8 * r() * r()) * fall;
    const at = Math.round(t * sr);
    if (r() < (o.grit ?? 0.55)) {
      const len = Math.round((0.002 + 0.008 * r()) * (o.gritLen ?? 1) * sr);
      const off = (r() * 8000) | 0;
      const dec = 4 / len;
      let prev = 0;
      for (let i = 0; i < len && at + i < out.length; i++) {
        const x = tab[(off + i) & 8191];
        out[at + i] += a * 0.6 * (x - prev) * E(-i * dec);
        prev = x;
      }
    } else {
      damped(out, sr, at, fLo + (fHi - fLo) * r(), a * 0.5, 0.0008 + 0.003 * r());
    }
    if ((k & 31) === 31) yield;
  }
}

// clods: { n, t0, t1, lam, amp, fLo, fHi }  heavier thuds landing
export function* clods(out, sr, r, o) {
  const tab = whiteSync(4096, r);
  const fLo = o.fLo ?? 55;
  const fHi = o.fHi ?? 150;
  for (let k = 0; k < o.n; k++) {
    const t = when(r, o.t0, o.t1, o.lam ?? (o.t1 - o.t0) * 0.45);
    const fall = 1 - 0.55 * ((t - o.t0) / (o.t1 - o.t0 + 1e-6));
    const a = (o.amp ?? 1) * (0.25 + 0.75 * r()) * fall;
    const at = Math.round(t * sr);
    const f = fLo + (fHi - fLo) * r();
    const tau = 0.03 + 0.05 * r();
    const len = Math.min(out.length - at, Math.round(tau * 6 * sr));
    if (len <= 0) continue;
    const kf = E(-1 / (0.03 * sr));
    const ka = E(-1 / (tau * sr));
    let fe = 1;
    let ae = 1;
    let ph = 0;
    let lp = 0;
    const off = (r() * 4000) | 0;
    for (let i = 0; i < len; i++) {
      ph += (TAU * f * (0.75 + 0.25 * fe)) / sr;
      lp += 0.1 * (tab[(off + i) & 4095] - lp);
      const x = Math.sin(ph) * ae * 0.9 + lp * 3.2 * E(-i / (0.012 * sr));
      out[at + i] += a * x * (i < 12 ? i / 12 : 1);
      fe *= kf;
      ae *= ka;
    }
    if ((k & 3) === 3) yield;
  }
}

// echo: { taps: [[t, gain], ...], fc, atk, tau, amp }  smeared swells of low noise
export function* echo(out, sr, r, o) {
  const atk = o.atk ?? 0.06;
  const tau = o.tau ?? 0.4;
  let k = 0;
  for (const [t, g] of o.taps) {
    const len = Math.round((atk + tau * 4.5) * sr);
    const fc = (o.fc ?? 500) * (1 - 0.12 * k);
    const a = yield* colored(len, sr, r, [['lowpass', fc, 0.8], ['lowpass', fc * 1.4, 0.7]]);
    yield* shape(a, sr, [[0, 0], [atk, 1], [atk + tau * 4.5, 0.012], [atk + tau * 4.5 + 0.01, 0]]);
    yield* addTo(out, a, (o.amp ?? 1) * g, Math.max(0, Math.round((t - atk * 0.5) * sr)));
    k++;
  }
}

// tone: { wave, f0, f1, tp, dur, att, tau, rel, amp, det, sub, vib, am, fm, lp, q, drive }
//   pitch glides f0 -> f1: exponentially with time constant tp (f0 < f1 rises), or as a straight
//   musical glide over dur when tp is not given. tau is the decay (Infinity: sustain), rel the fade out.
//   det: cents between two oscillators; sub: level of a sine an octave down; vib: [Hz, depth, delay s];
//   am: [Hz, depth 0..1]; fm: [ratio, index, index tau] (sine only); lp: [fc0, fc1, tc] a low-pass
//   that moves from fc0 to fc1; drive: tanh drive.
export function* tone(out, sr, r, at, o) {
  const len = Math.min(out.length - at, Math.ceil(o.dur * sr));
  if (len <= 0) return;
  const w = WAVES[o.wave || 'sine'];
  const f0 = o.f0;
  const f1 = o.f1 ?? o.f0;
  const tp = o.tp || 0;
  const kf = tp ? E(-1 / (tp * sr)) : 1;
  const kr = Math.pow(f1 / f0, 1 / len);
  const att = Math.max(2, Math.round((o.att ?? 0.003) * sr));
  const tau = o.tau ?? o.dur / 3;
  const ka = Number.isFinite(tau) ? E(-1 / (tau * sr)) : 1;
  const amp = o.amp ?? 1;
  const drive = o.drive || 0;
  const norm = drive ? 1 / Math.tanh(drive) : 1;
  const det = o.det ? Math.pow(2, o.det / 2400) : 0;
  const { sub, vib, am, fm, lp } = o;
  const q = o.q ?? 0.8;
  const bq = lp ? new Biquad('lowpass', lp[0], q, sr) : null;
  const endLen = Math.max(2, Math.min(len >> 1, Math.round((o.rel ?? 0.01) * sr)));
  const kidx = fm ? E(-1 / (fm[2] * sr)) : 1;
  let idx = fm ? fm[1] : 0;
  let ph = r();
  let ph2 = r();
  let phm = 0;
  let phs = 0;
  let fcur = f0;
  let fe = 1;
  let ae = 1;
  for (let b = 0; b < len; b += BLOCK) {
    const e = Math.min(len, b + BLOCK);
    for (let i = b; i < e; i++) {
      const t = i / sr;
      let f;
      if (tp) {
        f = f1 + (f0 - f1) * fe;
        fe *= kf;
      } else {
        f = fcur;
        fcur *= kr;
      }
      if (vib) f *= 1 + vib[1] * Math.sin(TAU * vib[0] * t) * Math.min(1, t / (vib[2] || 1e-4));
      const dp = f / sr;
      let s;
      if (det) {
        const d1 = dp / det;
        const d2 = dp * det;
        ph += d1;
        if (ph >= 1) ph -= 1;
        ph2 += d2;
        if (ph2 >= 1) ph2 -= 1;
        s = 0.5 * (wave(w, ph, d1) + wave(w, ph2, d2));
      } else {
        ph += dp;
        if (ph >= 1) ph -= 1;
        if (fm) {
          phm += dp * fm[0];
          phm -= Math.floor(phm);
          s = Math.sin(TAU * ph + idx * Math.sin(TAU * phm));
          idx *= kidx;
        } else {
          s = wave(w, ph, dp);
        }
      }
      if (sub) {
        phs += dp * 0.5;
        if (phs >= 1) phs -= 1;
        s += sub * Math.sin(TAU * phs);
      }
      let g = ae;
      ae *= ka;
      if (i < att) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / att);
      if (i > len - endLen) g *= (len - i) / endLen;
      if (am) g *= 1 - am[1] + am[1] * (0.5 + 0.5 * Math.sin(TAU * am[0] * t));
      if (drive) s = Math.tanh(drive * s) * norm;
      if (bq) {
        if ((i & 31) === 0) bq.set('lowpass', lp[1] + (lp[0] - lp[1]) * E(-t / lp[2]), q, sr);
        s = bq.run(s);
      }
      out[at + i] += amp * g * s;
    }
    yield;
  }
}

// whoosh: { dur, f0, f1, q, hp, amp, env }  noise through a band-pass whose centre sweeps f0 -> f1
export function* whoosh(out, sr, r, at, o) {
  const n = Math.round(o.dur * sr);
  const a = yield* noise(n, r);
  const ratio = o.f1 / o.f0;
  yield* sweepFilter(a, sr, 'bandpass', (t) => o.f0 * Math.pow(ratio, Math.min(1, t / o.dur)), o.q ?? 1.2);
  if (o.hp) yield* filter(a, sr, 'highpass', o.hp, 0.7);
  yield* normalise(a, 1);
  yield* shape(a, sr, o.env ?? [[0, 0], [o.dur * 0.35, 1], [o.dur, 0]]);
  fadeTail(a, sr, Math.min(40, o.dur * 200));
  yield* addTo(out, a, o.amp ?? 1, at);
}

// growl: { dur, f0, f1, jit, vib, pulse, breath, formants: [[fa, fb, q, gain], ...], drive, amp, env }
//   a saw whose pitch glides f0 -> f1, wobbles and pulses (pulse: [Hz, depth], the rasp), with some breath,
//   through band-pass formants whose centres glide fa -> fb: the shape of a vowel. A creature's voice.
export function* growl(out, sr, r, at, o) {
  const n = Math.min(Math.round(o.dur * sr), out.length - at);
  if (n <= 0) return;
  const buf = new Float32Array(n);
  const fm = o.formants;
  const bqs = fm.map((f) => new Biquad('bandpass', f[0], f[2], sr));
  const nz = whiteSync(8192, r);
  const kr = Math.pow(o.f1 / o.f0, 1 / n);
  const jit = o.jit ?? 0.04;
  const breath = o.breath ?? 0.15;
  const { vib, pulse } = o;
  let fcur = o.f0;
  let ph = r();
  let pp = r();
  let wob = 0;
  for (let b = 0; b < n; b += BLOCK) {
    const e = Math.min(n, b + BLOCK);
    for (let i = b; i < e; i++) {
      fcur *= kr;
      wob += 0.0015 * (nz[(i * 3) & 8191] - wob);
      let f = fcur * (1 + jit * wob * 14);
      if (vib) f *= 1 + vib[1] * Math.sin((TAU * vib[0] * i) / sr);
      const dp = f / sr;
      ph += dp;
      if (ph >= 1) ph -= 1;
      let x = sawBL(ph, dp);
      if (pulse) {
        pp += pulse[0] / sr;
        if (pp >= 1) pp -= 1;
        x *= 1 - pulse[1] + pulse[1] * 1.4 * E(-5 * pp);
      }
      x += breath * nz[(i * 7 + 13) & 8191];
      if ((i & 31) === 0) {
        const u = i / n;
        for (let k = 0; k < fm.length; k++) bqs[k].set('bandpass', fm[k][0] + (fm[k][1] - fm[k][0]) * u, fm[k][2], sr);
      }
      let y = 0;
      for (let k = 0; k < fm.length; k++) y += fm[k][3] * bqs[k].run(x);
      buf[i] = y;
    }
    yield;
  }
  const drive = o.drive || 0;
  if (drive) {
    const norm = 1 / Math.tanh(drive);
    let m = 0;
    for (let i = 0; i < n; i++) if (Math.abs(buf[i]) > m) m = Math.abs(buf[i]);
    const k = m > 0 ? 1 / m : 1;
    for (let i = 0; i < n; i++) buf[i] = Math.tanh(drive * buf[i] * k) * norm;
  }
  yield* normalise(buf, 1);
  yield* shape(buf, sr, o.env ?? [[0, 0], [0.04, 1], [o.dur * 0.7, 0.7], [o.dur, 0]]);
  yield* addTo(out, buf, o.amp ?? 1, at);
}

// bubbles: { n, t0, t1, lam, amp, fLo, fHi }  each a sine chirping up as it pops
export function* bubbles(out, sr, r, o) {
  for (let k = 0; k < o.n; k++) {
    const t = when(r, o.t0, o.t1, o.lam ?? (o.t1 - o.t0) * 0.5);
    const at = Math.round(t * sr);
    const f = (o.fLo ?? 200) + ((o.fHi ?? 700) - (o.fLo ?? 200)) * r();
    const len = Math.min(out.length - at, Math.round((0.025 + 0.05 * r()) * sr));
    const a = (o.amp ?? 1) * (0.3 + 0.7 * r());
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      ph += (TAU * f * (1 + 1.6 * u)) / sr;
      out[at + i] += a * E(-u * 5) * (i < 8 ? i / 8 : 1) * Math.sin(ph);
    }
    if ((k & 3) === 3) yield;
  }
}

// tinkle: { n, t0, t1, lam, amp, fLo, fHi, tauLo, tauHi }  glass pings at random times
export function* tinkle(out, sr, r, o) {
  for (let k = 0; k < o.n; k++) {
    const t = when(r, o.t0, o.t1, o.lam ?? (o.t1 - o.t0) * 0.5);
    const tau = (o.tauLo ?? 0.01) + ((o.tauHi ?? 0.06) - (o.tauLo ?? 0.01)) * r();
    damped(out, sr, Math.round(t * sr), (o.fLo ?? 3000) + ((o.fHi ?? 11000) - (o.fLo ?? 3000)) * r(), (o.amp ?? 1) * (0.2 + 0.8 * r()), tau, r() * 6.28);
    if ((k & 15) === 15) yield;
  }
}

// Little jitter on a recipe's numbers so no two variants are alike (jit: 0 on a layer keeps it exact).
const JIT = ['f0', 'f1', 'fA', 'fB', 'fc', 'tau', 'tauF', 'tp', 'dur', 'hp', 'base', 'snapFc', 'fLo', 'fHi'];
export function jitter(L, r, k0 = 0.1) {
  const k = L.jit ?? k0;
  if (!k) return L;
  const o = { ...L };
  for (const key of JIT) if (typeof o[key] === 'number' && Number.isFinite(o[key]) && !(key === 'dur' && o.env)) o[key] *= 1 + (r() * 2 - 1) * k;
  if (typeof o.amp === 'number') o.amp *= 1 + (r() * 2 - 1) * k * 1.5;
  return o;
}

// Render a list of layer descriptions into one mono buffer.
export function* runLayers(layers, out, sr, r, jit = 0.1) {
  for (const L0 of layers) {
    const L = jitter(L0, r, jit);
    const off = L.at || 0;
    const at = Math.round(off * sr);
    switch (L.k) {
      case 'crack':
        yield* crack(out, sr, r, at, L);
        break;
      case 'body':
        yield* thump(out, sr, at, L);
        break;
      case 'roar':
        yield* roar(out, sr, r, at, L);
        break;
      case 'rumble':
        yield* rumble(out, sr, r, at, L);
        break;
      case 'debris':
        yield* debris(out, sr, r, { ...L, t0: L.t0 + off, t1: L.t1 + off });
        break;
      case 'clods':
        yield* clods(out, sr, r, { ...L, t0: L.t0 + off, t1: L.t1 + off });
        break;
      case 'echo':
        yield* echo(out, sr, r, { ...L, taps: L.taps.map(([t, g]) => [t + off, g]) });
        break;
      case 'modal':
        modal(out, sr, at, L.partials, L.amp ?? 1, L.rate ?? 1);
        break;
      case 'tone':
        yield* tone(out, sr, r, at, L);
        break;
      case 'whoosh':
        yield* whoosh(out, sr, r, at, L);
        break;
      case 'growl':
        yield* growl(out, sr, r, at, L);
        break;
      case 'bubbles':
        yield* bubbles(out, sr, r, { ...L, t0: L.t0 + off, t1: L.t1 + off });
        break;
      case 'tinkle':
        yield* tinkle(out, sr, r, { ...L, t0: L.t0 + off, t1: L.t1 + off });
        break;
      default:
        throw new Error(`no layer ${L.k}`);
    }
    yield;
  }
}
