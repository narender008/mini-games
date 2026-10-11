// Moonbound audio: plain-JS DSP helpers. Nothing here touches Web Audio or the DOM, so it
// also runs in Node (the module must load with no AudioContext). Everything heavy that
// Web Audio itself cannot do for us is made here once and handed over as Float32Arrays:
// the shared noise tables, the cold stone-hall reverb impulse response, and plucked-string
// (Karplus-Strong) notes for the harp.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
export const dbToLin = (db) => 10 ** (db / 20);
export const linToDb = (v) => 20 * Math.log10(Math.max(v, 1e-9));
// smooth 0..1 ramp between a and b
export const smooth = (x, a, b) => {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

// mulberry32 with the seed scrambled and the first values dropped, so nearby seeds do not
// start alike. Renders are repeatable.
export function seeded(seed) {
  let a = Math.imul((seed | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0 || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 6; i++) r();
  return r;
}

export function hashStr(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h & 0xffffff;
}

// A cyclic noise table of n samples: when it is looped there is no seam, whatever the colour.
//   white: flat. pink: -3 dB/oct (Kellet). brown: -6 dB/oct (leaky integrator, so it stays centred).
// The filter is run over two copies of the white signal and the second pass kept, so the state
// at the end equals the state at the start. Peak is scaled to 0.9.
export function noiseTable(kind, n, rnd) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = rnd() * 2 - 1;
  if (kind === 'white') return scalePeak(w, 0.9);
  const out = new Float32Array(n);
  if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const x = w[i];
        b0 = 0.99886 * b0 + x * 0.0555179;
        b1 = 0.99332 * b1 + x * 0.0750759;
        b2 = 0.969 * b2 + x * 0.153852;
        b3 = 0.8665 * b3 + x * 0.3104856;
        b4 = 0.55 * b4 + x * 0.5329522;
        b5 = -0.7616 * b5 - x * 0.016898;
        const y = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
        b6 = x * 0.115926;
        if (pass) out[i] = y;
      }
    }
  } else {
    let y = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        y = 0.997 * y + w[i] * 0.06;
        if (pass) out[i] = y;
      }
    }
  }
  // remove the slow mean so it centres on zero
  let m = 0;
  for (let i = 0; i < n; i++) m += out[i];
  m /= n;
  for (let i = 0; i < n; i++) out[i] -= m;
  return scalePeak(out, 0.9);
}

export function scalePeak(buf, peak = 1) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] < 0 ? -buf[i] : buf[i];
    if (v > m) m = v;
  }
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < buf.length; i++) buf[i] *= k;
  }
  return buf;
}

// The cold stone hall: a stereo impulse response. A handful of hard early reflections, then a
// diffuse tail (two independent noise streams) that dies away with RT60 `rt` seconds and
// darkens as it goes, as air and stone soak up the highs. Scaled to unit energy.
export function reverbIR(sr, o = {}, rnd = seeded(77)) {
  const rt = o.rt ?? 2.5;
  const len = Math.floor(sr * (o.len ?? rt * 1.15));
  const pre = Math.floor(sr * (o.pre ?? 0.014));
  const tau = rt / 6.9; // amplitude e-fold time
  const out = [new Float32Array(len), new Float32Array(len)];
  for (let c = 0; c < 2; c++) {
    const d = out[c];
    // diffuse tail, low-passed with a cut-off that falls from hi to lo
    let y = 0;
    let a = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      if (((i - pre) & 31) === 0) {
        const fc = (o.hi ?? 9000) * Math.pow((o.lo ?? 1100) / (o.hi ?? 9000), Math.min(1, t / (rt * 0.9)));
        a = Math.exp((-TAU * fc) / sr);
      }
      y = (1 - a) * (rnd() * 2 - 1) + a * y;
      // the first 30 ms builds up (no instant wall of sound)
      const build = t < 0.03 ? t / 0.03 : 1;
      d[i] = y * Math.exp(-t / tau) * build;
    }
    // early reflections
    const taps = 14;
    for (let k = 0; k < taps; k++) {
      const t = 0.006 + k * 0.0055 + rnd() * 0.012 + c * 0.0021;
      const i = pre + Math.floor(t * sr);
      const sign = rnd() < 0.5 ? -1 : 1;
      if (i < len) d[i] += sign * 0.9 * Math.exp(-t / 0.09) * (1 - k / (taps * 1.4));
    }
  }
  let e = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < len; i++) e += out[c][i] * out[c][i];
  const k = 1 / Math.sqrt(e / 2 + 1e-12);
  for (let c = 0; c < 2; c++) for (let i = 0; i < len; i++) out[c][i] *= k;
  // fade the very end
  const f = Math.floor(sr * 0.15);
  for (let c = 0; c < 2; c++) for (let i = 0; i < f; i++) out[c][len - 1 - i] *= i / f;
  return out;
}

// A plucked string (Karplus-Strong with a fractional delay), for the harp. Warm: the
// excitation is a soft burst of noise, and the loop loses its highs quickly.
//   o: { dur s, t60 s, bright 0..1, pos 0..1 (pluck position) }
export function pluckData(sr, midi, rnd, o = {}) {
  const f = mtof(midi);
  const dur = o.dur ?? 3;
  const len = Math.ceil(dur * sr);
  const out = new Float32Array(len);
  const N = sr / f - 0.5; // the averaging filter adds half a sample of delay
  const n0 = Math.ceil(N) + 2;
  const bright = o.bright ?? 0.5;
  // excitation: white noise through a one-pole low-pass, with a comb for the pluck position
  const ex = new Float32Array(n0);
  let y = 0;
  const lp = 0.15 + 0.8 * bright;
  for (let i = 0; i < n0; i++) {
    y += lp * ((rnd() * 2 - 1) - y);
    ex[i] = y;
  }
  const pk = Math.max(1, Math.floor(n0 * (o.pos ?? 0.18)));
  for (let i = n0 - 1; i >= pk; i--) ex[i] -= ex[i - pk];
  let m = 0;
  for (let i = 0; i < n0; i++) m += ex[i];
  m /= n0;
  for (let i = 0; i < n0; i++) out[i] = ex[i] - m;
  const g = Math.pow(10, -3 / (f * (o.t60 ?? 2.6)));
  for (let n = n0; n < len; n++) {
    const p = n - N;
    const i = Math.floor(p);
    const fr = p - i;
    const a = out[i] * (1 - fr) + out[i + 1] * fr;
    const b = out[i - 1] * (1 - fr) + out[i] * fr;
    out[n] = g * 0.5 * (a + b);
  }
  // a very short fade-in avoids a click, a long fade-out ends it in silence
  const fi = 24;
  for (let i = 0; i < fi; i++) out[i] *= i / fi;
  const fo = Math.floor(sr * 0.4);
  for (let i = 0; i < fo; i++) out[len - 1 - i] *= i / fo;
  return scalePeak(out, 0.9);
}

// ---- measuring (tests, normalising, renderTest) ------------------------------------------------

export function statsOf(chans) {
  let peak = 0;
  let ss = 0;
  let count = 0;
  let nan = false;
  for (const d of chans) {
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (v !== v || v === Infinity || v === -Infinity) {
        nan = true;
        continue;
      }
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      ss += v * v;
    }
    count += d.length;
  }
  return { peak, rms: Math.sqrt(ss / Math.max(1, count)), nan };
}

// Loudness of a sound in dB: the mean square of its loudest 100 ms after a 150 Hz high-pass (the
// ear hears little below that and a low thump would otherwise count for too much). Used to bring
// every sound to its own target, so the mix is balanced by number.
export function burstDb(chans, sr) {
  const n = chans[0].length;
  const hop = Math.max(1, Math.round(0.01 * sr));
  const blocks = Math.ceil(n / hop);
  const e = new Float64Array(blocks);
  const a = Math.exp((-TAU * 150) / sr);
  for (const d of chans) {
    let x1 = 0;
    let y1 = 0;
    for (let i = 0; i < n; i++) {
      const x = d[i];
      const yv = a * (y1 + x - x1);
      x1 = x;
      y1 = yv;
      e[(i / hop) | 0] += yv * yv;
    }
  }
  const win = Math.min(blocks, 10);
  let best = 0;
  let sum = 0;
  for (let k = 0; k < blocks; k++) {
    sum += e[k];
    if (k >= win) sum -= e[k - win];
    if (sum > best) best = sum;
  }
  const len = Math.min(n, win * hop) * chans.length;
  return 10 * Math.log10(best / len + 1e-12);
}

// ease the ends of a buffer to exact zero (raised cosine), so a sound never starts or ends on a click
export function fadeEnds(d, head, tail) {
  const n = d.length;
  head = Math.min(head, n >> 1);
  tail = Math.min(tail, n >> 1);
  for (let i = 0; i < head; i++) d[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / head);
  for (let i = 0; i < tail; i++) d[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / tail);
  return d;
}
