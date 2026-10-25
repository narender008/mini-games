// A tiny JS synthesiser that renders a sustained music voice (a pad chord, a
// choir chord, a bowed string, a brass note, a bass note) into an AudioBuffer.
// The score repeats, so each distinct voice is rendered once and then played
// as a single buffer source, which costs a tenth of live oscillators and
// automated filters. Rendering is resumable: a job renders a few thousand
// samples per call, so the bake queue can spread one long pad over several
// timer ticks and never stall a frame.
//
// spec = {
//   dur,                                   total seconds (attack + hold + release)
//   env: { a, hold, r, peak },             linear attack, hold, exponential release
//   oscs: [{ wave: 'saw'|'tri'|'sqr'|'sin', f, cents, gain, scoop: [cents, secs],
//            drift: [[t, cents], ...] }],  piecewise-linear detune over time
//   vib: [rate, cents], trem: [rate, depth],
//   filter: { type: 'lowpass'|'bandpass'|'highpass', q, pts: [[t, hz], ...] },
//   formants: { from: [f1, f2, f3], to: [...] | null, q: [...], amp: [...] },
//   drive: k
// }
const TAU = Math.PI * 2;
const BLOCK = 32;

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
function coeffs(type, f, q, sr, out) {
  f = Math.min(Math.max(f, 10), sr * 0.45);
  const w = (TAU * f) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  out[0] = b0 / a0; out[1] = b1 / a0; out[2] = b2 / a0; out[3] = (-2 * cs) / a0; out[4] = (1 - al) / a0;
  return out;
}
const lerpPts = (pts, t) => {
  if (!pts || !pts.length) return 0;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-6, t1 - t0); }
  return pts[pts.length - 1][1];
};

// Returns a job: job.step(maxSamples) -> true when done; job.buffer when done.
export function voiceJob(ctx, spec) {
  const sr = ctx.sampleRate, n = Math.max(64, Math.ceil(sr * Math.min(spec.dur, 7)));
  const buffer = ctx.createBuffer(1, n, sr), x = buffer.getChannelData(0);
  const oscs = spec.oscs.map((o) => ({ ...o, ph: Math.random(), inc: 0 }));
  const env = spec.env, rel0 = env.a + env.hold;
  const F = spec.filter, FS = [0, 0, 0, 0], fc = [0, 0, 0, 0, 0];
  const FM = spec.formants, fmS = FM ? FM.from.map(() => [0, 0, 0, 0]) : null, fmC = FM ? FM.from.map(() => [0, 0, 0, 0, 0]) : null;
  const drive = spec.drive || 0, dn = drive ? Math.tanh(drive) : 1;
  let i = 0, vibPh = 0, tremPh = 0;
  const job = {
    buffer, done: false,
    step(max = 8192) {
      const end = Math.min(n, i + max);
      while (i < end) {
        const t = i / sr, bEnd = Math.min(end, i + BLOCK);
        // per block: pitch (vibrato, drift, scoop) and filter coefficients
        const vib = spec.vib ? Math.sin(vibPh) * spec.vib[1] : 0;
        for (const o of oscs) {
          let c = (o.cents || 0) + vib + (o.drift ? lerpPts(o.drift, t) : 0);
          if (o.scoop && t < o.scoop[1]) c += o.scoop[0] * (1 - t / o.scoop[1]);
          o.inc = (o.f * Math.pow(2, c / 1200)) / sr;
        }
        if (F) coeffs(F.type, lerpPts(F.pts, t), F.q, sr, fc);
        if (FM) for (let k = 0; k < FM.from.length; k++) { const to = FM.to || FM.from; coeffs('bandpass', FM.from[k] + (to[k] - FM.from[k]) * Math.min(1, t / spec.dur), FM.q[k], sr, fmC[k]); }
        for (; i < bEnd; i++) {
          const tt = i / sr;
          let s = 0;
          for (const o of oscs) {
            const p = o.ph, dt = o.inc;
            let v;
            if (o.wave === 'saw') v = 2 * p - 1 - blep(p, dt);
            else if (o.wave === 'sqr') { v = p < 0.5 ? 1 : -1; v += blep(p, dt); v -= blep((p + 0.5) % 1, dt); }
            else if (o.wave === 'tri') v = 1 - 4 * Math.abs(p - 0.5);
            else v = Math.sin(TAU * p);
            s += v * (o.gain ?? 1);
            o.ph = p + dt; if (o.ph >= 1) o.ph -= 1;
          }
          if (FM) {
            let y = 0;
            for (let k = 0; k < fmC.length; k++) {
              const c = fmC[k], st = fmS[k];
              const o = c[0] * s + c[1] * st[0] + c[2] * st[1] - c[3] * st[2] - c[4] * st[3];
              st[1] = st[0]; st[0] = s; st[3] = st[2]; st[2] = o; y += o * FM.amp[k];
            }
            s = y;
          }
          if (F) {
            const o = fc[0] * s + fc[1] * FS[0] + fc[2] * FS[1] - fc[3] * FS[2] - fc[4] * FS[3];
            FS[1] = FS[0]; FS[0] = s; FS[3] = FS[2]; FS[2] = o; s = o;
          }
          if (drive) s = Math.tanh(s * drive) / dn;
          if (spec.trem) s *= 1 - spec.trem[1] / 2 + (spec.trem[1] / 2) * (Math.sin(tremPh) >= 0 ? 1 : -1);
          const e = tt < env.a ? tt / env.a : tt < rel0 ? 1 : Math.exp(-((tt - rel0) * 5) / env.r);
          x[i] = s * e * env.peak;
          if (spec.trem) tremPh += (TAU * spec.trem[0]) / sr;
        }
        if (spec.vib) vibPh += (TAU * spec.vib[0] * BLOCK) / sr;
      }
      if (i >= n) {
        for (let k = 0, f = Math.min(256, n >> 3); k < f; k++) x[n - 1 - k] *= k / f;
        job.done = true;
      }
      return job.done;
    },
  };
  return job;
}
