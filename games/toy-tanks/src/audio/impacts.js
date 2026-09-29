// What a ball bursting and a prop being knocked sound like, written once into
// small buffers like the rest of the sounds (sounds.js) from physical parts:
// grains, damped modes and bubbles. A burst is heard in four layers that
// audio.js plays together, each one quiet and soft (nothing here is a boom):
//   whump   a low pressure thump, felt more than heard, the same for every ground;
//   hit     the ground's own impact: sand thud and hiss, wet mud slap and squelch,
//           snow powder crunch and poof, soil and grass thump, moss soft thud;
//   payload what the ball is made of: paper flutter, glitter, mud splatter,
//           powder puff, a gel wobble, a rubber thup, a small light pock;
//   fall    the debris coming back down over a second or two: grains, crumbs,
//           droplets, clumps of snow, leaves.
// KNOCKS are the sounds of small things being hit or tumbling (plastic, wood,
// shell, stone, metal, clod), DEBRIS are steady streams of ticks that
// audio.patter() plays short pieces of. Every render returns { sr, ch: [mono] }
// at peak 1; audio.js sets each sound's level.
import { TAU, seeded, secs, smooth, pitched, damped, bubble, grain, sweep, filt, finish, put, puffInto } from './dsp.js';

const CH = (n) => new Float32Array(n);
const soften = (out, sr, fc = 6500) => filt(out, sr, 'lowpass', fc, 0.6);
const dropEnv = (rise, k) => (u) => smooth(u / rise) * Math.exp(-u * k);
const between = (r, a, b) => a + (b - a) * r();

// Even out the grains of a texture: normalise to peak 1, then ease the loudest
// ones down (tanh), so it can be played with more body for the same peak.
function tame(out, k = 1.8) {
  let m = 0;
  for (let i = 0; i < out.length; i++) m = Math.max(m, Math.abs(out[i]));
  if (m === 0) return out;
  const n = Math.tanh(k);
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh((k * out[i]) / m) / n;
  return out;
}

// a time in [0, span] whose density thins out exponentially (tau seconds); tau 0 is even
const when = (r, span, tau) => (tau > 0 ? -tau * Math.log(1 - r() * (1 - Math.exp(-span / tau))) : r() * span);

// n grains of noise scattered over `span` seconds from `at`, through one filter,
// mixed in at peak `level`. `tau` thins them out with time (or `time(r)` gives
// each one's moment) and `fade` also makes the late ones quieter (the last
// stragglers).
function scatter(out, sr, r, { n, at = 0, span, tau = 0, time = null, len = [0.001, 0.003], rise = 0.0004, amp = [0.3, 1], fade = 0, type = 'bandpass', fc, q = 0.7, level }) {
  const c = CH(out.length);
  for (let i = 0; i < n; i++) {
    const t = time ? time(r) : when(r, span, tau);
    const a = between(r, amp[0], amp[1]) * (fade ? Math.exp(-t / (span * fade)) : 1);
    grain(c, secs(sr, at + t), secs(sr, between(r, len[0], len[1])), secs(sr, rise), a, r);
  }
  filt(c, sr, type, fc, q);
  put(out, c, level);
}

// n tiny bright tinkles (damped sines between f[0] and f[1] Hz)
function tinkles(out, sr, r, { n, at = 0, span, tau = 0, time = null, f, decay = [0.004, 0.014], amp = [0.15, 1], fade = 0 }) {
  for (let i = 0; i < n; i++) {
    const t = time ? time(r) : when(r, span, tau);
    const a = between(r, amp[0], amp[1]) * (fade ? Math.exp(-t / (span * fade)) : 1);
    damped(out, sr, secs(sr, at + t), f[0] * (f[1] / f[0]) ** r(), a, between(r, decay[0], decay[1]), r() * TAU);
  }
}

// a few damped modes [ratio, amplitude, decay s] on a fundamental f
function modes(out, sr, at, f, list, gain = 1) {
  for (const [k, a, tau] of list) damped(out, sr, at, f * k, a * gain, tau);
}

// ------------------------------------------------------------ the whump

// A soft pressure thump: a low sine that sags as the air settles, over a swell
// of low noise. Most of it is under 100 Hz, with a little at twice that so a
// phone can be heard doing it.
function whumpRender(sr, seed, v) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.85));
  const f = [62, 70, 79][v % 3];
  pitched(out, sr, 0, 0.75, (t) => f * (0.6 + 0.4 * Math.exp(-t / 0.08)), { amp: 1, attack: 0.014, tau: 0.13, h2: 0.3 });
  puffInto(out, sr, 0, 0.5, 'lowpass', 170, 0.7, 0.5, r, 0.018);
  return finish([out], sr, 1, 70);
}

// ------------------------------------------------------------ the ground

// Sand: a dull soft thump, a puff of fine sand thrown up and the hiss of it
// pouring off, over a scatter of single grains.
function sandHit(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.85));
  pitched(out, sr, 0, 0.2, (t) => 82 * (1 + 0.4 * Math.exp(-t / 0.05)), { amp: 0.55, attack: 0.006, tau: 0.05 });
  puffInto(out, sr, 0, 0.1, 'lowpass', 320, 0.7, 0.35, r, 0.005);
  puffInto(out, sr, 0, 0.2, 'bandpass', 3800, 0.5, 0.5, r, 0.004);
  const h = CH(out.length);
  sweep(h, sr, secs(sr, 0.012), 0.7, 5200, 2200, 0.6, 1, r, dropEnv(0.05, 3.2));
  put(out, h, 0.42);
  scatter(out, sr, r, { n: 300, span: 0.7, tau: 0.3, len: [0.0006, 0.002], fc: 3600, q: 0.5, level: 0.35 });
  soften(out, sr);
  return finish([out], sr, 1, 60);
}

// Wet mud: a flat slap, a low thump, the squelch of it sucking back (a band of
// noise that rises and wobbles), big slow bubbles and a few tiny wet plips.
function mudHit(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.8));
  puffInto(out, sr, 0, 0.06, 'lowpass', 1400, 0.7, 0.8, r, 0.002);
  pitched(out, sr, 0, 0.22, (t) => 74 * (1 + 0.5 * Math.exp(-t / 0.06)), { amp: 0.6, attack: 0.005, tau: 0.06 });
  const s = CH(out.length);
  sweep(s, sr, secs(sr, 0.03), 0.42, 260, 950, 0.9, 1, r, (u) => Math.sin(Math.PI * u ** 0.7) * (0.72 + 0.28 * Math.sin(TAU * 10 * u)));
  put(out, s, 0.55);
  for (let i = 0; i < 3; i++) bubble(out, sr, secs(sr, 0.03 + r() * 0.16), between(r, 110, 260), 0.35 + r() * 0.3, 0.4, 20 + r() * 12);
  for (let i = 0; i < 5; i++) bubble(out, sr, secs(sr, 0.1 + r() * 0.4), between(r, 300, 700), 0.08 + r() * 0.1, 0.3, 30 + r() * 20);
  for (let i = 0; i < 6; i++) bubble(out, sr, secs(sr, 0.08 + r() * 0.5), between(r, 1200, 2600), 0.04 + r() * 0.05, 0.25, 90 + r() * 60);
  soften(out, sr, 5000);
  return finish([out], sr, 1, 60);
}

// Snow: the crunch of a few dozen tiny grains and a creak or two, a soft
// powder poof that closes down and a very muffled thump.
function snowHit(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.65));
  scatter(out, sr, r, { n: 42, span: 0.22, tau: 0.09, len: [0.001, 0.0028], fc: 2300, q: 0.7, level: 0.5 });
  scatter(out, sr, r, { n: 7, span: 0.2, len: [0.004, 0.009], fc: 3400, q: 1.2, level: 0.16 });
  const p = CH(out.length);
  sweep(p, sr, 0, 0.5, 1600, 380, 0.5, 1, r, dropEnv(0.05, 4));
  put(out, p, 0.6);
  pitched(out, sr, 0, 0.3, (t) => 78 * (1 + 0.3 * Math.exp(-t / 0.05)), { amp: 0.3, attack: 0.014, tau: 0.08 });
  soften(out, sr);
  return finish([out], sr, 1, 50);
}

// Soil and grass: a round thump, crumbs of earth, a little stone tick and the
// brush of blades.
function soilHit(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.55));
  pitched(out, sr, 0, 0.2, (t) => 104 * (1 + 0.5 * Math.exp(-t / 0.05)), { amp: 0.8, attack: 0.004, tau: 0.055 });
  puffInto(out, sr, 0, 0.09, 'lowpass', 400, 0.7, 0.5, r, 0.004);
  scatter(out, sr, r, { n: 24, span: 0.3, tau: 0.12, len: [0.002, 0.006], fc: 1700, q: 0.8, level: 0.3 });
  const b = CH(out.length);
  sweep(b, sr, secs(sr, 0.01), 0.4, 4200, 2800, 0.6, 1, r, dropEnv(0.1, 4));
  put(out, b, 0.18);
  for (let i = 0; i < 3; i++) damped(out, sr, secs(sr, 0.01 + r() * 0.2), between(r, 1500, 2800), 0.06 + r() * 0.06, 0.005);
  soften(out, sr);
  return finish([out], sr, 1, 40);
}

// Moss: a soft, slow thud, and the rustle of a few leaves.
function mossHit(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.5));
  pitched(out, sr, 0, 0.2, (t) => 98 * (1 - 0.3 * smooth(t / 0.07)), { amp: 0.7, attack: 0.008, tau: 0.05 });
  puffInto(out, sr, 0, 0.12, 'lowpass', 260, 0.7, 0.4, r, 0.008);
  scatter(out, sr, r, { n: 14, span: 0.3, tau: 0.12, len: [0.002, 0.006], fc: 4500, q: 0.9, level: 0.16 });
  soften(out, sr, 5500);
  return finish([out], sr, 1, 40);
}

// Nothing to land on (a ball that bursts in the air): a soft "fff" of air and
// a hint of pressure.
function airHit(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.5));
  const p = CH(out.length);
  sweep(p, sr, 0, 0.4, 2400, 700, 0.5, 1, r, dropEnv(0.03, 4.5));
  put(out, p, 0.7);
  pitched(out, sr, 0, 0.16, (t) => 120 * (1 + 0.3 * Math.exp(-t / 0.04)), { amp: 0.4, attack: 0.006, tau: 0.04 });
  soften(out, sr);
  return finish([out], sr, 1, 40);
}

// ------------------------------------------------------------ the payloads

// Tissue-paper confetti: a soft puff as it leaves, a fizz of paper being
// thrown, then the rustle of it fluttering down: grains that thin out, and a
// few longer swishes with a flap in them.
function confettiPayload(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.4));
  puffInto(out, sr, 0, 0.06, 'bandpass', 1800, 0.8, 0.45, r, 0.004);
  const fz = CH(out.length);
  sweep(fz, sr, secs(sr, 0.01), 0.3, 2400, 5600, 0.7, 1, r, (u) => Math.sin(Math.PI * u ** 0.6));
  put(out, fz, 0.3);
  scatter(out, sr, r, { n: 110, at: 0.03, span: 1.25, tau: 0.45, len: [0.003, 0.012], rise: 0.001, fc: 4500, q: 0.6, level: 0.5, fade: 1.2 });
  const sw = CH(out.length);
  for (let i = 0; i < 7; i++) {
    const at = secs(sr, 0.05 + 0.9 * r() ** 1.4);
    const len = secs(sr, between(r, 0.06, 0.14));
    const flap = between(r, 26, 42);
    const c = CH(out.length);
    grain(c, at, len, secs(sr, 0.02), 1, r);
    for (let k = 0; k < len && at + k < c.length; k++) c[at + k] *= 0.6 + 0.4 * Math.sin((TAU * flap * k) / sr);
    filt(c, sr, 'bandpass', between(r, 3000, 5200), 0.7);
    put(sw, c, 0.5 * (1 - (at / sr) / 1.3));
  }
  put(out, sw, 0.28);
  tame(out, 1.6);
  soften(out, sr, 7000);
  return finish([out], sr, 1, 60);
}

// Glitter: a scatter of tiny bright tinkles and ticks, as flakes land, thinning
// over about a second, with a few longer glints among them.
function glitterPayload(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.3));
  puffInto(out, sr, 0, 0.14, 'lowpass', 2000, 0.6, 0.22, r, 0.012);
  tinkles(out, sr, r, { n: 70, at: 0.012, span: 1.05, tau: 0.4, f: [3000, 7400], decay: [0.004, 0.014], amp: [0.12, 0.7], fade: 1.3 });
  tinkles(out, sr, r, { n: 5, at: 0.02, span: 0.6, tau: 0.25, f: [2800, 5200], decay: [0.04, 0.09], amp: [0.35, 0.55], fade: 1.2 });
  scatter(out, sr, r, { n: 60, at: 0.01, span: 1.1, tau: 0.4, len: [0.0008, 0.0022], fc: 6500, q: 1.2, level: 0.25, fade: 1.2 });
  tame(out, 1.6);
  soften(out, sr, 8500);
  return finish([out], sr, 1, 70);
}

// A mud ball: a wet flat slap, two big slow blorps, spray thrown up and
// droplets pattering back as wet plops.
function mudPayload(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.0));
  puffInto(out, sr, 0, 0.05, 'lowpass', 1500, 0.7, 0.8, r, 0.002);
  for (const [t, f, a] of [[0.012, 165, 0.95], [0.06, 235, 0.6]]) bubble(out, sr, secs(sr, t + r() * 0.01), f * between(r, 0.92, 1.08), a, 0.3 + r() * 0.2, 24 + r() * 10);
  scatter(out, sr, r, { n: 34, at: 0.005, span: 0.5, tau: 0.2, len: [0.002, 0.008], fc: 2800, q: 0.7, level: 0.3 });
  for (let i = 0; i < 14; i++) bubble(out, sr, secs(sr, 0.09 + r() ** 1.3 * 0.75), between(r, 500, 1900), 0.07 + r() * 0.16, 0.25, 55 + r() * 60);
  soften(out, sr, 6500);
  return finish([out], sr, 1, 60);
}

// A snowball: a soft powder puff (a wide band of air that closes down), fine
// crystals flying, and a few soft clumps landing.
function snowPayload(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.9));
  const p = CH(out.length);
  sweep(p, sr, 0, 0.55, 2200, 450, 0.5, 1, r, dropEnv(0.045, 3.6));
  put(out, p, 0.8);
  pitched(out, sr, 0, 0.3, (t) => 90 * (1 + 0.3 * Math.exp(-t / 0.05)), { amp: 0.35, attack: 0.014, tau: 0.08 });
  scatter(out, sr, r, { n: 26, at: 0.02, span: 0.5, tau: 0.2, len: [0.001, 0.0028], fc: 5200, q: 1, level: 0.14 });
  for (let i = 0; i < 4; i++) puffInto(out, sr, secs(sr, 0.1 + r() * 0.4), 0.03, 'lowpass', between(r, 250, 500), 0.7, 0.28, r, 0.008);
  soften(out, sr, 6500);
  return finish([out], sr, 1, 60);
}

// A gel ball: a wet squish, then the gel wobbling: a low body that trembles
// and settles, a weak fifth above it, and a few slick ticks.
function gelPayload(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.15));
  const ph = r() * TAU;
  puffInto(out, sr, 0, 0.03, 'lowpass', 900, 0.7, 0.45, r, 0.003);
  const sq = CH(out.length);
  sweep(sq, sr, 0, 0.17, 950, 260, 0.9, 1, r, (u) => Math.sin(Math.PI * u ** 0.6) * (0.75 + 0.25 * Math.sin(TAU * 4 * u)));
  put(out, sq, 0.55);
  const wob = (k, a, tau) => pitched(out, sr, secs(sr, 0.02), 1.0, (t) => 178 * k * (1 + 0.16 * Math.exp(-t / 0.3) * Math.sin(TAU * 8.5 * t + ph)) * (1 - 0.08 * smooth(t / 0.5)),
    { amp: a, attack: 0.008, tau, h2: 0.3 });
  wob(1, 0.85, 0.26);
  wob(1.5, 0.2, 0.2);
  for (let i = 0; i < 6; i++) bubble(out, sr, secs(sr, 0.05 + r() * 0.6), between(r, 700, 1500), 0.05 + r() * 0.06, 0.3, 50 + r() * 40);
  soften(out, sr, 5500);
  return finish([out], sr, 1, 70);
}

// A rubber ball: a round "thup" whose pitch sags as it squashes, a short
// second mode, a click of surface and a puff of dust.
function rubberPayload(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.5));
  pitched(out, sr, 0, 0.2, (t) => 300 * (1 - 0.4 * smooth(t / 0.07)), { amp: 1, attack: 0.002, tau: 0.04, h2: 0.25 });
  damped(out, sr, 0, 610, 0.3, 0.02);
  puffInto(out, sr, 0, 0.012, 'lowpass', 1800, 0.7, 0.3, r, 0.0008);
  puffInto(out, sr, 0, 0.09, 'lowpass', 900, 0.6, 0.2, r, 0.006);
  pitched(out, sr, secs(sr, 0.004), 0.05, (t) => 900 + 500 * smooth(t / 0.04), { amp: 0.05, attack: 0.006, tau: 0.02 });
  soften(out, sr, 5000);
  return finish([out], sr, 0.6, 50);
}

// One of the three small balls: a light, crisp "pock" and a puff of fine dust.
function smallPayload(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 0.4));
  modes(out, sr, 0, between(r, 480, 560), [[1, 1, 0.02], [2.05, 0.35, 0.01], [3.1, 0.12, 0.006]]);
  puffInto(out, sr, 0, 0.01, 'bandpass', 2500, 0.9, 0.35, r, 0.0006);
  puffInto(out, sr, 0, 0.12, 'lowpass', 1600, 0.6, 0.22, r, 0.006);
  scatter(out, sr, r, { n: 14, at: 0.01, span: 0.25, tau: 0.1, len: [0.001, 0.003], fc: 4000, q: 0.8, level: 0.15 });
  soften(out, sr, 6000);
  return finish([out], sr, 0.6, 40);
}

// ------------------------------------------------------------ water

// A splash in a puddle: a soft round "bloop" (bubbles that rise), a splash of
// spray, a hush of ripples and droplets pattering back. Never loud.
function splashRender(sr, seed) {
  const r = seeded(seed);
  const out = CH(secs(sr, 1.4));
  bubble(out, sr, secs(sr, 0.004), between(r, 240, 330), 0.9, 0.5, 26);
  bubble(out, sr, secs(sr, 0.03), between(r, 520, 680), 0.35, 0.4, 40);
  puffInto(out, sr, 0, 0.09, 'bandpass', 2400, 0.7, 0.55, r, 0.004);
  const s = CH(out.length);
  sweep(s, sr, secs(sr, 0.01), 0.35, 3600, 1500, 0.6, 1, r, dropEnv(0.04, 4.5));
  put(out, s, 0.3);
  const h = CH(out.length);
  sweep(h, sr, secs(sr, 0.05), 0.8, 900, 500, 0.5, 1, r, dropEnv(0.12, 3));
  put(out, h, 0.14);
  for (let i = 0; i < 26; i++) bubble(out, sr, secs(sr, 0.08 + when(r, 1.1, 0.4)), between(r, 900, 3800), 0.07 + r() * 0.3, 0.3, 70 + r() * 130);
  scatter(out, sr, r, { n: 30, at: 0.05, span: 0.9, tau: 0.35, len: [0.001, 0.003], fc: 3000, q: 0.7, level: 0.15 });
  soften(out, sr, 7000);
  return finish([out], sr, 1, 70);
}

// ------------------------------------------------------------ debris

// What comes back down, per ground: a stream of small events over `span`
// seconds, each at the moment time(r) gives it. A burst's shower (fallRender)
// starts after the flight of the debris, peaks half a second in and
// thins out; a steady stream (streamRender) is what audio.patter() cuts short
// pieces from. `fade` makes the late ones quieter.
const DEBRIS = {
  sand(out, sr, r, span, time, fade) {
    scatter(out, sr, r, { n: Math.round(span * 150), span, time, len: [0.0006, 0.0016], fc: 3500, q: 0.5, level: 0.55, fade });
    scatter(out, sr, r, { n: Math.round(span * 12), span, time, len: [0.003, 0.007], rise: 0.001, fc: 1100, type: 'lowpass', level: 0.4, fade });
  },
  soil(out, sr, r, span, time, fade) {
    scatter(out, sr, r, { n: Math.round(span * 55), span, time, len: [0.002, 0.005], fc: 1500, q: 0.7, level: 0.5, fade });
    scatter(out, sr, r, { n: Math.round(span * 9), span, time, len: [0.004, 0.01], fc: 5000, q: 0.9, level: 0.16, fade });
    tinkles(out, sr, r, { n: Math.round(span * 6), span, time, f: [1800, 3200], decay: [0.004, 0.008], amp: [0.15, 0.4], fade });
  },
  mud(out, sr, r, span, time, fade) {
    for (let i = 0, n = Math.round(span * 14); i < n; i++) {
      const t = time(r);
      bubble(out, sr, secs(sr, t), between(r, 300, 1500), between(r, 0.15, 0.6) * (fade ? Math.exp(-t / (span * fade)) : 1), 0.3, 45 + r() * 65);
    }
    scatter(out, sr, r, { n: Math.round(span * 40), span, time, len: [0.001, 0.003], fc: 2200, q: 0.6, level: 0.3, fade });
    scatter(out, sr, r, { n: Math.round(span * 5), span, time, len: [0.008, 0.02], rise: 0.002, fc: 700, type: 'lowpass', level: 0.35, fade });
  },
  snow(out, sr, r, span, time, fade) {
    scatter(out, sr, r, { n: Math.round(span * 7), span, time, len: [0.015, 0.03], rise: 0.005, fc: 520, type: 'lowpass', level: 0.6, fade });
    scatter(out, sr, r, { n: Math.round(span * 30), span, time, len: [0.001, 0.003], fc: 3200, q: 0.8, level: 0.25, fade });
  },
  moss(out, sr, r, span, time, fade) {
    scatter(out, sr, r, { n: Math.round(span * 17), span, time, len: [0.008, 0.016], rise: 0.002, fc: 380, type: 'lowpass', level: 0.5, fade });
    scatter(out, sr, r, { n: Math.round(span * 24), span, time, len: [0.003, 0.008], fc: 4500, q: 0.8, level: 0.3, fade });
  },
  water(out, sr, r, span, time, fade) {
    for (let i = 0, n = Math.round(span * 16); i < n; i++) {
      const t = time(r);
      bubble(out, sr, secs(sr, t), between(r, 900, 3800), between(r, 0.1, 0.6) * (fade ? Math.exp(-t / (span * fade)) : 1), 0.3, 70 + r() * 130);
    }
    scatter(out, sr, r, { n: Math.round(span * 24), span, time, len: [0.001, 0.003], fc: 3000, q: 0.7, level: 0.2, fade });
  },
};

// falling over `span` seconds: nothing for the first 60 ms, then a shower that
// peaks half a second in (debris takes that long to come down) and thins out
// (a Weibull of shape 1.4)
function fallRender(sr, seed, ground) {
  const r = seeded(seed);
  const span = 2;
  const out = CH(secs(sr, span + 0.1));
  const time = (rr) => {
    for (let k = 0; k < 8; k++) {
      const t = 0.06 + 0.6 * (-Math.log(1 - rr())) ** (1 / 1.4);
      if (t < span) return t;
    }
    return rr() * span;
  };
  DEBRIS[ground](out, sr, r, span, time, 1.2);
  tame(out);
  soften(out, sr, 6500);
  return finish([out], sr, 1, 80);
}

// even, for audio.patter() to cut short pieces from
function streamRender(sr, seed, ground) {
  const r = seeded(seed);
  const span = 1.5;
  const out = CH(secs(sr, span));
  DEBRIS[ground](out, sr, r, span, (rr) => rr() * span, 0);
  tame(out);
  soften(out, sr, 6500);
  return finish([out], sr, 1, 20);
}

// ------------------------------------------------------------ knocks

const KNOCKS = {
  // a hollow plastic tock: a bucket, a spade, a watering can, a toy block
  plastic(out, sr, r, v) {
    modes(out, sr, 0, [430, 620, 980][v], [[1, 1, 0.05], [1.62, 0.5, 0.03], [2.4, 0.3, 0.02], [3.7, 0.12, 0.012]]);
    puffInto(out, sr, 0, 0.008, 'bandpass', 2200, 0.9, 0.22, r, 0.0006);
  },
  // a woody tok: a log, a stand
  wood(out, sr, r, v) {
    modes(out, sr, 0, [300, 380, 470][v], [[1, 1, 0.06], [2.35, 0.5, 0.03], [4.1, 0.22, 0.015], [0.62, 0.35, 0.08]]);
    puffInto(out, sr, 0, 0.01, 'lowpass', 1800, 0.7, 0.3, r, 0.0008);
  },
  // a small hard tik: a shell
  shell(out, sr, r, v) {
    modes(out, sr, 0, [2300, 2800, 3300][v], [[1, 1, 0.011], [1.52, 0.6, 0.008], [2.2, 0.35, 0.006]]);
    puffInto(out, sr, 0, 0.006, 'bandpass', 5000, 1, 0.2, r, 0.0004);
  },
  // a pebble's tk
  stone(out, sr, r, v) {
    modes(out, sr, 0, [3400, 4100, 4900][v], [[1, 1, 0.005], [1.6, 0.7, 0.004], [2.3, 0.4, 0.003]]);
    damped(out, sr, 0, 700, 0.3, 0.01);
    puffInto(out, sr, 0, 0.004, 'bandpass', 4500, 1, 0.5, r, 0.0003);
  },
  // a thin sheet-metal tonk: the zinc can
  metal(out, sr, r, v) {
    modes(out, sr, 0, [820, 1050, 1300][v], [[1, 1, 0.09], [2.76, 0.55, 0.06], [5.4, 0.28, 0.035], [1.34, 0.3, 0.08]]);
    puffInto(out, sr, 0, 0.006, 'bandpass', 3000, 0.9, 0.12, r, 0.0005);
  },
  // a dull thud and a crumble: a chunk of earth
  clod(out, sr, r, v) {
    pitched(out, sr, 0, 0.15, (t) => [120, 105, 92][v] * (1 + 0.5 * Math.exp(-t / 0.04)), { amp: 0.8, attack: 0.003, tau: 0.035 });
    puffInto(out, sr, 0, 0.02, 'lowpass', 600, 0.7, 0.5, r, 0.002);
    scatter(out, sr, r, { n: 8, at: 0.01, span: 0.15, tau: 0.06, len: [0.002, 0.005], fc: 1500, q: 0.8, level: 0.25 });
  },
};
const KNOCK_LEN = { plastic: 0.3, wood: 0.4, shell: 0.16, stone: 0.12, metal: 0.5, clod: 0.28 };

function knockRender(sr, seed, kind, v) {
  const r = seeded(seed);
  const out = CH(secs(sr, KNOCK_LEN[kind]));
  KNOCKS[kind](out, sr, r, v % 3);
  soften(out, sr, kind === 'stone' || kind === 'shell' ? 8000 : 6500);
  return finish([out], sr, 0.4, kind === 'metal' ? 90 : 30);
}

// ------------------------------------------------------------ the library

// audio.js draws every name here like the sounds of sounds.js. The seed is
// salted so that two sounds with names of one length never share noise.
const salt = (fn, k) => (sr, seed, v) => fn(sr, seed + k * 977, v);

export const IMPACTS = {
  whump: { render: salt(whumpRender, 1), variants: 3, sr: 8000 },
  hitSand: { render: salt(sandHit, 2), variants: 3, sr: 24000 },
  hitMud: { render: salt(mudHit, 3), variants: 3, sr: 24000 },
  hitSnow: { render: salt(snowHit, 4), variants: 3, sr: 24000 },
  hitSoil: { render: salt(soilHit, 5), variants: 3, sr: 24000 },
  hitMoss: { render: salt(mossHit, 6), variants: 3, sr: 24000 },
  hitAir: { render: salt(airHit, 7), variants: 2, sr: 24000 },
  payConfetti: { render: salt(confettiPayload, 8), variants: 3, sr: 24000 },
  payGlitter: { render: salt(glitterPayload, 9), variants: 3, sr: 24000 },
  payMud: { render: salt(mudPayload, 10), variants: 3, sr: 24000 },
  paySnow: { render: salt(snowPayload, 11), variants: 3, sr: 24000 },
  payGel: { render: salt(gelPayload, 12), variants: 3, sr: 24000 },
  payRubber: { render: salt(rubberPayload, 13), variants: 3, sr: 24000 },
  paySmall: { render: salt(smallPayload, 14), variants: 3, sr: 24000 },
  splash: { render: salt(splashRender, 15), variants: 3, sr: 24000 },
  ...Object.fromEntries(Object.keys(DEBRIS).map((g, i) => [`fall_${g}`, { render: salt((sr, s) => fallRender(sr, s, g), 20 + i), variants: 3, sr: 16000 }])),
  ...Object.fromEntries(Object.keys(DEBRIS).map((g, i) => [`stream_${g}`, { render: salt((sr, s) => streamRender(sr, s, g), 30 + i), variants: 2, sr: 16000 }])),
  ...Object.fromEntries(Object.keys(KNOCKS).map((k, i) => [`knock_${k}`, { render: salt((sr, s, v) => knockRender(sr, s, k, v), 40 + i), variants: 3, sr: 24000 }])),
};
