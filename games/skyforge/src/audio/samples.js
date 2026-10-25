// Sample library rendered once in JS into AudioBuffers (no files): plucked
// strings (Karplus-Strong), bells, drums, noise beds and sound-effect bodies.
// Buffers are cheap to replay with playbackRate, so the scheduler never builds
// big oscillator graphs for short sounds.

// small deterministic random so the library sounds the same every run
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function buf(ctx, sec, ch = 1) { return ctx.createBuffer(ch, Math.max(1, Math.round(sec * ctx.sampleRate)), ctx.sampleRate); }
function normalize(b, peak = 0.9) {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); }
  if (m > 0) { const k = peak / m; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  return b;
}
// fade the ends so loops and one-shots never click
function fades(d, sr, a = 0.004, r = 0.02) {
  const na = Math.min(d.length, a * sr | 0), nr = Math.min(d.length, r * sr | 0);
  for (let i = 0; i < na; i++) d[i] *= i / na;
  for (let i = 0; i < nr; i++) d[d.length - 1 - i] *= i / nr;
}
// crossfade a loop's tail into its head so it repeats seamlessly
function loopify(b, sec = 0.25) {
  const sr = b.sampleRate, n = Math.min(b.length >> 2, sec * sr | 0);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c), L = d.length;
    for (let i = 0; i < n; i++) { const t = i / n; d[i] = d[i] * t + d[L - n + i] * (1 - t); }
    const out = d.slice(0, L - n); d.fill(0); d.set(out);
  }
  return b;
}

// ---- tonal --------------------------------------------------------------------
function pluck(ctx, f, sec, bright = 0.5, decay = 0.996, seed = 1) {
  const b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate, r = rnd(seed);
  const N = Math.max(2, Math.round(sr / f));
  const line = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { const x = r() * 2 - 1; lp += (x - lp) * (0.25 + bright * 0.7); line[i] = lp; }
  let idx = 0, prev = 0;
  for (let i = 0; i < d.length; i++) {
    const cur = line[idx];
    const nxt = line[(idx + 1) % N];
    const v = decay * (0.5 * (cur + nxt));
    line[idx] = v * 0.985 + prev * 0.015; prev = v;
    d[i] = cur;
    idx = (idx + 1) % N;
  }
  // body: a soft resonance for warmth
  let y1 = 0, y2 = 0; const w = 2 * Math.PI * 180 / sr, q = 0.97, c1 = 2 * q * Math.cos(w), c2 = -q * q;
  for (let i = 0; i < d.length; i++) { const y = d[i] * 0.06 + c1 * y1 + c2 * y2; y2 = y1; y1 = y; d[i] += y * 0.35; }
  fades(d, sr, 0.0015, 0.05);
  return normalize(b, 0.85);
}

function bell(ctx, f, sec, partials, seed = 2) {
  const b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate;
  for (const [ratio, amp, dec] of partials) {
    const w = 2 * Math.PI * f * ratio / sr;
    for (let i = 0; i < d.length; i++) d[i] += Math.sin(w * i) * amp * Math.exp(-i / sr / dec);
  }
  fades(d, sr, 0.002, 0.05);
  return normalize(b, 0.85);
}

// ---- noise --------------------------------------------------------------------
function noise(ctx, sec, kind, seed = 3, ch = 1) {
  const b = buf(ctx, sec, ch), r = rnd(seed);
  for (let c = 0; c < ch; c++) {
    const d = b.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
      else { // pink (Paul Kellet)
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
  }
  return normalize(loopify(b, 0.3), 0.8);
}

// one-pole helpers over an array
function lowpass(d, sr, fc) { const a = 1 - Math.exp(-2 * Math.PI * fc / sr); let y = 0; for (let i = 0; i < d.length; i++) { y += (d[i] - y) * a; d[i] = y; } }
function highpass(d, sr, fc) { const a = 1 - Math.exp(-2 * Math.PI * fc / sr); let y = 0; for (let i = 0; i < d.length; i++) { y += (d[i] - y) * a; d[i] -= y; } }

// ---- drums ------------------------------------------------------------------
function drum(ctx, { sec = 0.5, f0 = 120, f1 = 50, sweep = 0.06, tone = 1, noiseAmt = 0.3, noiseDec = 0.03, dec = 0.25, hp = 0, lp = 0, partials = null, seed = 4 }) {
  const b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate, r = rnd(seed);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / sweep);
    ph += 2 * Math.PI * f / sr;
    let s = Math.sin(ph);
    if (partials) for (const [k, a] of partials) s += Math.sin(ph * k) * a * Math.exp(-t / (dec * 0.6));
    d[i] = s * tone * Math.exp(-t / dec);
  }
  if (noiseAmt) {
    const nz = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) nz[i] = (r() * 2 - 1) * Math.exp(-i / sr / noiseDec);
    if (hp) highpass(nz, sr, hp); if (lp) lowpass(nz, sr, lp);
    for (let i = 0; i < d.length; i++) d[i] += nz[i] * noiseAmt;
  }
  fades(d, sr, 0.0008, 0.03);
  return normalize(b, 0.9);
}

function shaker(ctx, sec = 0.12, seed = 5) {
  const b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate, r = rnd(seed);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.min(1, t / 0.012) * Math.exp(-t / 0.035); }
  highpass(d, sr, 5000); highpass(d, sr, 3000);
  fades(d, sr); return normalize(b, 0.8);
}

function cymbal(ctx, sec = 3, seed = 6) {
  const b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate, r = rnd(seed);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t / 0.9); }
  highpass(d, sr, 4000); highpass(d, sr, 2500);
  // metallic shimmer
  for (const f of [3150, 4720, 6300, 8100]) { const w = 2 * Math.PI * f / sr; for (let i = 0; i < d.length; i++) d[i] += Math.sin(w * i + Math.sin(i * 0.0007) * 3) * 0.05 * Math.exp(-i / sr / 1.2); }
  fades(d, sr); return normalize(b, 0.8);
}

// ---- effects bodies -----------------------------------------------------------
function thunder(ctx, sec, seed) {
  const b = buf(ctx, sec, 2), sr = ctx.sampleRate, r = rnd(seed);
  // a rolling envelope of random bursts
  const env = new Float32Array(Math.ceil(sec * 50));
  for (let k = 0; k < env.length; k++) env[k] = 0;
  let t = 0;
  while (t < sec * 0.85) { const a = Math.exp(-t / (sec * 0.35)) * (0.4 + r() * 0.6); const len = 0.1 + r() * 0.6; for (let k = t * 50 | 0; k < Math.min(env.length, (t + len) * 50); k++) env[k] = Math.max(env[k], a * Math.exp(-(k / 50 - t) / (len * 0.6))); t += 0.08 + r() * 0.5; }
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let br = 0, br2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = r() * 2 - 1; br = (br + 0.03 * w) / 1.03; br2 += (br - br2) * 0.08;
      const e = env[Math.min(env.length - 1, (i / sr * 50) | 0)];
      d[i] = br2 * 9 * e;
      // the initial crack
      const tt = i / sr; if (tt < 0.25) d[i] += w * Math.exp(-tt / 0.05) * 0.6;
    }
    lowpass(d, sr, 900);
  }
  for (let c = 0; c < 2; c++) fades(b.getChannelData(c), sr, 0.002, 0.4);
  return normalize(b, 0.9);
}

function crackle(ctx, sec, seed) {
  const b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate, r = rnd(seed);
  let br = 0;
  for (let i = 0; i < d.length; i++) { const w = r() * 2 - 1; br = (br + 0.02 * w) / 1.02; d[i] = br * 1.6; }
  lowpass(d, sr, 500);
  const n = sec * 55;
  for (let k = 0; k < n; k++) {
    const at = (r() * d.length) | 0, len = (0.002 + r() * 0.012) * sr | 0, a = Math.pow(r(), 2) * 0.9;
    for (let i = 0; i < len && at + i < d.length; i++) d[at + i] += (r() * 2 - 1) * a * Math.exp(-i / (len * 0.3));
  }
  highpass(d, sr, 60);
  return normalize(loopify(b, 0.2), 0.8);
}

function zap(ctx, sec, seed) {
  const b = buf(ctx, sec, 2), sr = ctx.sampleRate, r = rnd(seed);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, f = 2400 * Math.exp(-t / 0.09) + 90 + r() * 400 * Math.exp(-t / 0.2);
      ph += 2 * Math.PI * f / sr;
      const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1;
      const buzz = (r() < 0.5 * Math.exp(-t / 0.3) ? 1 : 0) * (r() * 2 - 1);
      d[i] = (saw * 0.6 + buzz * 0.8 + (r() * 2 - 1) * 0.3 * Math.exp(-t / 0.05)) * Math.exp(-t / 0.28);
    }
  }
  for (let c = 0; c < 2; c++) fades(b.getChannelData(c), sr, 0.001, 0.05);
  return normalize(b, 0.85);
}

function explosion(ctx, sec, seed) {
  const b = buf(ctx, sec, 2), sr = ctx.sampleRate, r = rnd(seed);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let br = 0, ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, w = r() * 2 - 1; br = (br + 0.06 * w) / 1.06;
      ph += 2 * Math.PI * (40 + 70 * Math.exp(-t / 0.08)) / sr;
      d[i] = br * 5 * Math.exp(-t / (sec * 0.28)) + w * 0.7 * Math.exp(-t / 0.03) + Math.sin(ph) * 0.9 * Math.exp(-t / 0.25);
    }
    lowpass(d, sr, 2400);
    // debris rattles
    for (let k = 0; k < 14; k++) { const at = ((0.15 + r() * 0.8 * sec) * sr) | 0, len = 0.02 * sr | 0, a = 0.15 * r(); for (let i = 0; i < len && at + i < d.length; i++) d[at + i] += (r() * 2 - 1) * a * (1 - i / len); }
    fades(d, sr, 0.0005, 0.2);
  }
  return normalize(b, 0.92);
}

function creak(ctx, sec, seed) {
  const b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate, r = rnd(seed);
  // stick-slip friction: a pulse train with wandering rate
  let ph = 0, rate = 30 + r() * 30;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    rate += (r() - 0.5) * 0.6; rate = Math.min(140, Math.max(18, rate + Math.sin(t * 7) * 0.08));
    ph += rate / sr;
    if (ph >= 1) { ph -= 1; }
    const p = Math.exp(-ph * 22) * (0.6 + r() * 0.4);
    d[i] = p * Math.sin(Math.PI * Math.min(1, t / (sec * 0.2))) * Math.min(1, (sec - t) / (sec * 0.3));
  }
  // wooden body resonances
  const out = new Float32Array(d.length);
  for (const [f, q] of [[420, 0.995], [910, 0.993], [1650, 0.99]]) {
    let y1 = 0, y2 = 0; const w = 2 * Math.PI * f / sr, c1 = 2 * q * Math.cos(w), c2 = -q * q;
    for (let i = 0; i < d.length; i++) { const y = d[i] * 0.05 + c1 * y1 + c2 * y2; y2 = y1; y1 = y; out[i] += y; }
  }
  d.set(out); highpass(d, sr, 150);
  fades(d, sr, 0.01, 0.05); return normalize(b, 0.8);
}

function chirp(ctx, seed) {
  const r = rnd(seed), sec = 0.5 + r() * 0.7, b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate;
  const notes = 2 + (r() * 5 | 0);
  let t0 = 0; let ph = 0;
  const base = 2600 + r() * 2200;
  for (let n = 0; n < notes; n++) {
    const len = 0.04 + r() * 0.09, gap = 0.02 + r() * 0.06;
    const fa = base * (0.8 + r() * 0.5), fb = base * (0.7 + r() * 0.7), trill = r() < 0.3;
    const i0 = t0 * sr | 0, n0 = len * sr | 0;
    for (let i = 0; i < n0 && i0 + i < d.length; i++) {
      const k = i / n0, f = fa + (fb - fa) * k + (trill ? Math.sin(i / sr * 2 * Math.PI * 60) * 400 : 0);
      ph += 2 * Math.PI * f / sr;
      d[i0 + i] += Math.sin(ph) * Math.sin(Math.PI * k) ** 1.5;
    }
    t0 += len + gap; if (t0 > sec - 0.05) break;
  }
  fades(d, sr); return normalize(b, 0.7);
}

function cricket(ctx, seed) {
  const r = rnd(seed), sec = 1.1, b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate;
  const f = 4200 + r() * 900, pulses = 3 + (r() * 3 | 0), rate = 28 + r() * 10;
  for (let p = 0; p < pulses; p++) {
    const at = (p / rate + 0.02) * sr | 0, len = 0.022 * sr | 0;
    for (let i = 0; i < len && at + i < d.length; i++) d[at + i] += Math.sin(2 * Math.PI * f * i / sr) * Math.sin(Math.PI * i / len);
  }
  fades(d, sr); return normalize(b, 0.6);
}

function propeller(ctx, sec, seed) {
  const b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate, r = rnd(seed);
  let br = 0, ph = 0;
  const blade = 24; // blade-pass rate, Hz
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, w = r() * 2 - 1; br = (br + 0.05 * w) / 1.05;
    ph += 2 * Math.PI * blade / sr;
    const chop = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(ph), 3);
    d[i] = br * 4 * chop + Math.sin(ph * 2.5) * 0.25 + Math.sin(2 * Math.PI * 62 * t) * 0.18;
  }
  lowpass(d, sr, 900);
  return normalize(loopify(b, 0.3), 0.75);
}

function coins(ctx, seed) {
  const r = rnd(seed), sec = 0.9, b = buf(ctx, sec, 2), sr = ctx.sampleRate;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let k = 0; k < 6; k++) {
      const at = ((k * 0.055 + r() * 0.04) * sr) | 0, f = 2400 + r() * 2600;
      for (const [m, a, dec] of [[1, 1, 0.12], [2.76, 0.5, 0.06], [5.4, 0.25, 0.03]]) {
        const w = 2 * Math.PI * f * m / sr; for (let i = 0; i < 0.3 * sr && at + i < d.length; i++) d[at + i] += Math.sin(w * i) * a * Math.exp(-i / sr / dec) * 0.5;
      }
    }
    fades(d, sr);
  }
  return normalize(b, 0.8);
}

function hammer(ctx, seed) {
  const r = rnd(seed), sec = 0.35, b = buf(ctx, sec), d = b.getChannelData(0), sr = ctx.sampleRate;
  const f = 900 + r() * 600;
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t / 0.006) * 0.8 + Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.05) * 0.5 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.04) * 0.6; }
  lowpass(d, sr, 4000);
  fades(d, sr, 0.0005, 0.02); return normalize(b, 0.85);
}

function whoosh(ctx, sec, seed, rise = true) {
  const b = buf(ctx, sec, 2), sr = ctx.sampleRate, r = rnd(seed);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0, lp2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, k = t / sec, env = rise ? Math.sin(Math.PI * k) ** 2 : Math.exp(-t / (sec * 0.3));
      const fc = rise ? 300 + 3000 * Math.sin(Math.PI * k) : 3500 * Math.exp(-t / (sec * 0.25)) + 200;
      const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
      const w = r() * 2 - 1; lp += (w - lp) * a; lp2 += (lp - lp2) * a;
      d[i] = (lp - lp2 * 0.5) * env * 3;
    }
    fades(d, sr);
  }
  return normalize(b, 0.8);
}

// Build the whole library (about 40 buffers; ~20 ms of JS).
export function buildSamples(ctx) {
  const S = {};
  S.pluck = [[110, pluck(ctx, 110, 3.2, 0.35, 0.997, 11)], [220, pluck(ctx, 220, 2.6, 0.5, 0.996, 12)], [440, pluck(ctx, 440, 2.0, 0.6, 0.995, 13)], [880, pluck(ctx, 880, 1.4, 0.65, 0.994, 14)]];
  S.pizz = [[110, pluck(ctx, 110, 0.9, 0.2, 0.990, 15)], [220, pluck(ctx, 220, 0.7, 0.3, 0.988, 16)]];
  S.bell = [[440, bell(ctx, 440, 3.5, [[1, 1, 1.4], [2, 0.5, 0.8], [3, 0.3, 0.5], [4.2, 0.2, 0.3], [5.4, 0.12, 0.2], [0.5, 0.25, 1.8]])], [880, bell(ctx, 880, 2.5, [[1, 1, 1.0], [2, 0.4, 0.6], [3, 0.25, 0.35], [4.2, 0.15, 0.2]])]];
  S.celesta = [[880, bell(ctx, 880, 1.6, [[1, 1, 0.7], [4, 0.25, 0.12], [2, 0.1, 0.3]])]];
  S.white = noise(ctx, 2, 'white', 21); S.pink = noise(ctx, 4, 'pink', 22, 2); S.brown = noise(ctx, 5, 'brown', 23, 2);
  S.kick = drum(ctx, { sec: 0.45, f0: 140, f1: 46, sweep: 0.04, dec: 0.18, noiseAmt: 0.15, noiseDec: 0.005, lp: 2000 });
  S.frame = drum(ctx, { sec: 0.6, f0: 160, f1: 95, sweep: 0.02, dec: 0.22, noiseAmt: 0.5, noiseDec: 0.02, lp: 1800, partials: [[1.6, 0.3], [2.3, 0.15]] });
  S.taiko = drum(ctx, { sec: 1.2, f0: 110, f1: 58, sweep: 0.05, dec: 0.45, noiseAmt: 0.35, noiseDec: 0.04, lp: 1200, partials: [[1.5, 0.25]] });
  S.tom = drum(ctx, { sec: 0.6, f0: 220, f1: 120, sweep: 0.05, dec: 0.2, noiseAmt: 0.25, noiseDec: 0.02, lp: 2500 });
  S.snare = drum(ctx, { sec: 0.35, f0: 240, f1: 180, sweep: 0.02, dec: 0.08, tone: 0.5, noiseAmt: 1.2, noiseDec: 0.08, hp: 1200 });
  S.timpani = drum(ctx, { sec: 2.2, f0: 92, f1: 87, sweep: 0.03, dec: 0.9, noiseAmt: 0.2, noiseDec: 0.02, lp: 1200, partials: [[1.5, 0.35], [1.99, 0.2], [2.44, 0.1]] });
  S.shaker = shaker(ctx); S.cymbal = cymbal(ctx);
  S.thunder = [thunder(ctx, 6, 31), thunder(ctx, 7.5, 32), thunder(ctx, 5, 33)];
  S.crackle = crackle(ctx, 3, 41); S.zap = zap(ctx, 0.9, 42);
  S.boom = [explosion(ctx, 1.6, 51), explosion(ctx, 2.6, 52)];
  S.creak = [creak(ctx, 1.1, 61), creak(ctx, 1.6, 62), creak(ctx, 0.8, 63)];
  S.chirp = [1, 2, 3, 4, 5, 6].map((i) => chirp(ctx, 70 + i));
  S.cricket = [1, 2, 3].map((i) => cricket(ctx, 80 + i));
  S.prop = propeller(ctx, 3, 91);
  S.coins = coins(ctx, 101);
  S.hammer = [hammer(ctx, 111), hammer(ctx, 112), hammer(ctx, 113)];
  S.whoosh = whoosh(ctx, 0.7, 121, true); S.swish = whoosh(ctx, 0.35, 122, false);
  return S;
}

// nearest-pitch sample from a [[baseHz, buffer], ...] set
export function pickPitched(set, f) {
  let best = set[0];
  for (const e of set) if (Math.abs(Math.log(e[0] / f)) < Math.abs(Math.log(best[0] / f))) best = e;
  return best;
}
