// The layers every explosion, gun and impact is stacked from. Each one adds
// itself into a buffer at sample `at`:
//   crack   a very short burst of bright noise, then a quick dull snap
//   thump   (dsp.js) a sine falling in pitch, driven through tanh
//   roar    broadband noise whose low-pass sweeps down as the blast decays,
//           flickering like a real fireball
//   rumble  low-passed noise that rolls and fades slowly: the chest and floor
//   debris  a scatter of tiny rattles and ticks, thinning out over time
//   clods   heavier thuds of earth coming down, thinning out over time
//   echo    off distant hills: smeared low noise swells at the echo times
//   modal   metal, as a handful of damped partials
// `runLayers` takes a list of plain descriptions of these, so each sound is a
// short recipe (see boom.js and fire.js). The `hi` buffer carries the sharp
// layers and the `lo` buffer the heavy ones: a distant blast delays `lo` a touch.
import { TAU, clamp, noise, filter, sweepFilter, shape, expEnv, normalise, addTo, modulate, thump, damped, modal, colored, whiteSync, fadeTail } from './dsp.js';

const E = Math.exp;

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
  const fA = o.fA;
  const fB = o.fB;
  const tauF = o.tauF;
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
      // a spray of grit: a few ms of differenced noise
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

// clods: { n, t0, t1, lam, amp, fLo, fHi }  heavier thuds of earth landing
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

// echo: { taps: [[t, gain], ...], fc, atk, tau, amp, dur }  smeared swells of low noise
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

// A struck steel plate: an inharmonic ring. o = { base, amp, tau, n }
const PLATE = [[1, 1, 1], [1.59, 0.85, 0.8], [2.14, 0.65, 0.62], [2.65, 0.55, 0.5], [3.51, 0.4, 0.4], [4.3, 0.3, 0.3], [5.4, 0.2, 0.22], [6.7, 0.14, 0.15]];
export function plate(out, sr, r, at, o) {
  const n = Math.min(o.n ?? PLATE.length, PLATE.length);
  for (let k = 0; k < n; k++) {
    const [ratio, a, d] = PLATE[k];
    damped(out, sr, at, o.base * ratio * (1 + (r() - 0.5) * 0.03), (o.amp ?? 1) * a, o.tau * d, r() * 6.28);
  }
}

// Little jitter on a recipe's numbers so no two variants are alike.
const JIT = ['f0', 'f1', 'fA', 'fB', 'fc', 'tau', 'tauF', 'tp', 'dur', 'hp', 'base', 'snapFc'];
export function jitter(L, r, k = 0.1) {
  const o = { ...L };
  for (const key of JIT) if (typeof o[key] === 'number' && !(key === 'dur' && o.env)) o[key] *= 1 + (r() * 2 - 1) * k;
  if (typeof o.amp === 'number') o.amp *= 1 + (r() * 2 - 1) * k * 1.5;
  return o;
}

// Render a list of layer descriptions into hi and lo.
export function* runLayers(layers, hi, lo, sr, r) {
  for (const L0 of layers) {
    const L = jitter(L0, r);
    const off = L.at || 0;
    const at = Math.round(off * sr);
    switch (L.k) {
      case 'crack':
        yield* crack(L.to === 'lo' ? lo : hi, sr, r, at, L);
        break;
      case 'body':
        yield* thump(L.to === 'hi' ? hi : lo, sr, at, L);
        break;
      case 'roar':
        yield* roar(L.to === 'lo' ? lo : hi, sr, r, at, L);
        break;
      case 'rumble':
        yield* rumble(L.to === 'hi' ? hi : lo, sr, r, at, L);
        break;
      case 'debris':
        yield* debris(hi, sr, r, { ...L, t0: L.t0 + off, t1: L.t1 + off });
        break;
      case 'clods':
        yield* clods(L.to === 'lo' ? lo : hi, sr, r, { ...L, t0: L.t0 + off, t1: L.t1 + off });
        break;
      case 'echo':
        yield* echo(lo, sr, r, { ...L, taps: L.taps.map(([t, g]) => [t + off, g]) });
        break;
      case 'modal':
        modal(L.to === 'lo' ? lo : hi, sr, at, L.partials, L.amp ?? 1, L.rate ?? 1);
        break;
      case 'plate':
        plate(L.to === 'lo' ? lo : hi, sr, r, at, L);
        break;
      default:
        throw new Error(`no layer ${L.k}`);
    }
  }
}

export { clamp };
