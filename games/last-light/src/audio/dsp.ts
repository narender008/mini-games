// Small synthesis toolkit shared by the sound effects, music and ambience.
//
// A Group is one voice: an output gain (plus an optional reverb send) that any number of oscillators,
// noise bursts and filters feed. Every source is stopped at a scheduled time; when the last one ends
// the whole chain is disconnected, so nothing outlives its sound (no leaks over a long run).
// `live` counts sources still alive so the debug harness can check that the count stays bounded.

export const live = { sources: 0, groups: 0 };

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const SILENT = 0.0001;

/** White noise, mono. Sources pick a random offset into it so bursts never repeat exactly. */
export function makeNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Procedural stereo reverb impulse: exponentially decaying noise with a darkening tail
 * (one-pole lowpass whose cutoff falls over time), a short pre-delay and a few early reflections.
 */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, predelay = 0.012, bright = 0.6): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * predelay);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      const decay = Math.pow(1 - x, 2.2) * Math.exp(-x * 3);
      const k = bright * (1 - x * 0.85) + 0.05; // filter coefficient falls: the tail gets darker
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * decay;
    }
    // Early reflections from nearby stone.
    for (const [ms, g] of [[9, 0.5], [17, 0.35], [29, 0.25], [41, 0.18]] as const) {
      const at = pre + Math.floor(sr * (ms + c * 3) / 1000);
      if (at < len) d[at] = (d[at] ?? 0) + g * (c ? -1 : 1);
    }
  }
  return buf;
}

/** Soft clipper: linear up to `knee`, then a tanh shoulder that never exceeds `ceiling`. */
export function makeSoftClip(knee = 0.6, ceiling = 0.97, n = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const room = ceiling - knee;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** Attack, optional hold, exponential decay. Returns the time the envelope reaches silence. */
export function env(p: AudioParam, t: number, a: number, d: number, peak: number, hold = 0): number {
  p.cancelScheduledValues(t);
  p.setValueAtTime(SILENT, t);
  p.linearRampToValueAtTime(Math.max(peak, SILENT * 2), t + Math.max(a, 0.001));
  if (hold > 0) p.setValueAtTime(Math.max(peak, SILENT * 2), t + a + hold);
  p.exponentialRampToValueAtTime(SILENT, t + a + hold + Math.max(d, 0.005));
  return t + a + hold + d;
}

export interface ToneOpts {
  type?: OscillatorType; f: number; f2?: number; glide?: number; at?: number;
  a?: number; d: number; hold?: number; peak: number; dest?: AudioNode; detune?: number;
  /** Fixed pitch: ignore the group's pitch multiplier. */
  fixed?: boolean;
}
export interface NoiseOpts {
  at?: number; a?: number; d: number; hold?: number; peak: number; dest?: AudioNode;
  type?: BiquadFilterType; f: number; f2?: number; sweep?: number; q?: number;
}
export interface FmOpts {
  f: number; ratio: number; index: number; index2?: number; at?: number; a?: number; d: number;
  hold?: number; peak: number; type?: OscillatorType; dest?: AudioNode; f2?: number; glide?: number;
}

export class Group {
  readonly out: GainNode;
  /** Pitch multiplier applied to every frequency. */
  p = 1;
  end: number;
  private send: GainNode | null = null;
  private extra: AudioNode[] = [];
  private srcs: AudioScheduledSourceNode[] = [];
  private pending = 0;
  private done = false;
  onDone: (() => void) | null = null;

  constructor(readonly ctx: BaseAudioContext, readonly t0: number, dest: AudioNode,
    readonly noise: AudioBuffer, rev?: AudioNode | null, wet = 0) {
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.end = t0;
    if (rev && wet > 0) {
      this.send = ctx.createGain();
      this.send.gain.value = wet;
      this.out.connect(this.send);
      this.send.connect(rev);
    }
    live.groups++;
  }

  /** Register a started source; it stops at `stopAt` (absolute). */
  private track(src: AudioScheduledSourceNode, stopAt: number, chain: AudioNode[]): void {
    this.pending++;
    live.sources++;
    this.srcs.push(src);
    src.stop(stopAt);
    if (stopAt > this.end) this.end = stopAt;
    src.onended = () => {
      live.sources--;
      src.disconnect();
      for (const n of chain) n.disconnect();
      if (--this.pending === 0) this.finish();
    };
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    live.groups--;
    this.out.disconnect();
    this.send?.disconnect();
    for (const n of this.extra) n.disconnect();
    this.srcs.length = 0;
    this.onDone?.();
  }

  /** A filter (or other node) feeding this voice's output; disconnected with the voice. */
  filter(type: BiquadFilterType, f: number, q = 0.7, dest?: AudioNode): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.setValueAtTime(Math.min(f * this.p, 20000), this.t0);
    b.Q.value = q;
    b.connect(dest ?? this.out);
    this.extra.push(b);
    return b;
  }

  node<T extends AudioNode>(n: T): T { this.extra.push(n); return n; }

  tone(o: ToneOpts): OscillatorNode {
    const t = this.t0 + (o.at ?? 0);
    const m = o.fixed ? 1 : this.p;
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f * m, t);
    if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f2 * m, 1), t + (o.glide ?? o.d));
    if (o.detune) osc.detune.value = o.detune;
    const g = this.ctx.createGain();
    const end = env(g.gain, t, o.a ?? 0.004, o.d, o.peak, o.hold);
    osc.connect(g);
    g.connect(o.dest ?? this.out);
    osc.start(t);
    this.track(osc, end + 0.03, [g]);
    return osc;
  }

  noiseBurst(o: NoiseOpts): BiquadFilterNode {
    const t = this.t0 + (o.at ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const b = this.ctx.createBiquadFilter();
    b.type = o.type ?? 'bandpass';
    b.Q.value = o.q ?? 1;
    const f = Math.min(o.f * this.p, 18000);
    b.frequency.setValueAtTime(f, t);
    if (o.f2 !== undefined) b.frequency.exponentialRampToValueAtTime(Math.min(Math.max(o.f2 * this.p, 20), 18000), t + (o.sweep ?? o.d));
    const g = this.ctx.createGain();
    const end = env(g.gain, t, o.a ?? 0.003, o.d, o.peak, o.hold);
    src.connect(b); b.connect(g); g.connect(o.dest ?? this.out);
    src.start(t, Math.random() * (this.noise.duration - 0.1));
    this.track(src, end + 0.03, [b, g]);
    return b;
  }

  /** Two-operator FM: a sine modulator into the carrier's frequency. index is in multiples of f. */
  fm(o: FmOpts): OscillatorNode {
    const t = this.t0 + (o.at ?? 0);
    const f = o.f * this.p;
    const car = this.ctx.createOscillator();
    car.type = o.type ?? 'sine';
    car.frequency.setValueAtTime(f, t);
    const mod = this.ctx.createOscillator();
    mod.frequency.setValueAtTime(f * o.ratio, t);
    if (o.f2 !== undefined) {
      const f2 = Math.max(o.f2 * this.p, 1);
      const tg = t + (o.glide ?? o.d);
      car.frequency.exponentialRampToValueAtTime(f2, tg);
      mod.frequency.exponentialRampToValueAtTime(f2 * o.ratio, tg);
    }
    const mg = this.ctx.createGain();
    const total = (o.a ?? 0.003) + (o.hold ?? 0) + o.d;
    mg.gain.setValueAtTime(o.index * f, t);
    mg.gain.linearRampToValueAtTime((o.index2 ?? o.index * 0.15) * f, t + total);
    const g = this.ctx.createGain();
    const end = env(g.gain, t, o.a ?? 0.003, o.d, o.peak, o.hold);
    mod.connect(mg); mg.connect(car.frequency);
    car.connect(g); g.connect(o.dest ?? this.out);
    car.start(t); mod.start(t);
    this.track(car, end + 0.03, [g]);
    this.track(mod, end + 0.03, [mg]);
    return car;
  }

  /** An LFO on a parameter for the voice's lifetime (tremolo, rattles, wobble). */
  lfo(param: AudioParam, rate: number, depth: number, at = 0, dur = 1, type: OscillatorType = 'sine'): OscillatorNode {
    const t = this.t0 + at;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g); g.connect(param);
    o.start(t);
    this.track(o, t + dur, [g]);
    return o;
  }

  /** Fade out fast and stop everything (voice stealing, pause). */
  kill(now: number, fade = 0.04): void {
    if (this.done) return;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    for (const s of this.srcs) { try { s.stop(now + fade + 0.01); } catch { /* already stopped */ } }
  }
}
