// Zone ambience beds, quiet, under the music.
//
// A bed is a few long-running sources (looped noise through filters, slow LFOs, a hum) plus random
// one-shot events (drips, chirps, clanks, heartbeats) scheduled on the audio clock from the shared tick.
// Changing zone crossfades beds over 2 s; the old bed's sources are stopped and disconnected after.

import type { Zone } from './types';
import { Group, live } from './dsp';

export interface AmbCore { ctx: BaseAudioContext; noise: AudioBuffer; rev: AudioNode }

const r = (a: number, b: number): number => a + Math.random() * (b - a);

interface Ev { next: number; mean: number; fixed?: boolean; fn: (t: number) => void }

class Bed {
  readonly out: GainNode;
  private srcs: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  events: Ev[] = [];
  deadAt = Infinity;

  constructor(private c: AmbCore, dest: AudioNode, readonly zone: Zone, now: number) {
    this.out = c.ctx.createGain();
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(1, now + 2);
    this.out.connect(dest);
    BUILD[zone](this, now);
  }

  private keep<T extends AudioNode>(n: T): T { this.nodes.push(n); return n; }

  /** Looped noise through a filter into a gain; returns both for modulation. */
  noise(type: BiquadFilterType, f: number, q: number, gain: number, now: number): { f: BiquadFilterNode; g: GainNode } {
    const ctx = this.c.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.c.noise; src.loop = true;
    const b = this.keep(ctx.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q;
    const g = this.keep(ctx.createGain());
    g.gain.value = gain;
    src.connect(b); b.connect(g); g.connect(this.out);
    src.start(now, Math.random());
    this.src(src);
    return { f: b, g };
  }

  osc(type: OscillatorType, f: number, gain: number, now: number, dest?: AudioNode): OscillatorNode {
    const ctx = this.c.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    const g = this.keep(ctx.createGain());
    g.gain.value = gain;
    o.connect(g); g.connect(dest ?? this.out);
    o.start(now);
    this.src(o);
    return o;
  }

  lfo(param: AudioParam, rate: number, depth: number, now: number): void {
    const ctx = this.c.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = this.keep(ctx.createGain());
    g.gain.value = depth;
    o.connect(g); g.connect(param);
    o.start(now);
    this.src(o);
  }

  filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    const b = this.keep(this.c.ctx.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q;
    b.connect(this.out);
    return b;
  }

  every(mean: number, fn: (t: number) => void, now: number, fixed = false): void {
    this.events.push({ next: now + (fixed ? mean : r(0.3, 1.5) * mean), mean, fixed, fn });
  }

  /** A one-shot voice into this bed (frees itself). */
  voice(t: number, wet: number): Group { return new Group(this.c.ctx, t, this.out, this.c.noise, this.c.rev, wet); }

  private src(s: AudioScheduledSourceNode): void { this.srcs.push(s); live.sources++; }

  tick(until: number, now: number): void {
    for (const e of this.events) {
      if (e.next < now - 1) e.next = now + 0.05; // resumed after a stall
      while (e.next < until) {
        e.fn(e.next);
        e.next += e.fixed ? e.mean : -Math.log(1 - Math.random()) * e.mean;
      }
    }
  }

  retire(now: number): void {
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 2);
    for (const s of this.srcs) s.stop(now + 2.1);
    this.events.length = 0;
    this.deadAt = now + 2.3;
  }

  dispose(): void {
    for (const s of this.srcs) { s.disconnect(); live.sources--; }
    for (const n of this.nodes) n.disconnect();
    this.out.disconnect();
    this.srcs.length = 0; this.nodes.length = 0;
  }
}

const BUILD: Record<Zone, (b: Bed, now: number) => void> = {
  // A still, warm room: faint air, candle crackle, a far-off chime now and then.
  sanctum(b, now) {
    const air = b.noise('lowpass', 380, 0.5, 0.05, now);
    b.lfo(air.g.gain, 0.06, 0.015, now);
    b.every(0.9, (t) => {
      const v = b.voice(t, 0.05);
      v.noiseBurst({ d: r(0.005, 0.02), peak: r(0.01, 0.03), type: 'bandpass', f: r(2500, 5000), q: 3 });
    }, now);
    b.every(11, (t) => {
      const v = b.voice(t, 0.8);
      const f = [1174.7, 1318.5, 1760, 1975.5][Math.floor(Math.random() * 4)]!;
      v.tone({ f, d: 3, peak: 0.012 }); v.tone({ f: f * 2.76, d: 1, peak: 0.003 });
    }, now);
  },
  // Wind through leaves over the causeway, insects and the odd bird.
  causeway(b, now) {
    const wind = b.noise('bandpass', 500, 0.6, 0.07, now);
    b.lfo(wind.f.frequency, 0.07, 260, now);
    b.lfo(wind.g.gain, 0.045, 0.035, now);
    const leaves = b.noise('highpass', 3200, 0.5, 0.012, now);
    b.lfo(leaves.g.gain, 0.23, 0.01, now);
    b.every(6, (t) => {
      const v = b.voice(t, 0.4);
      const n = 2 + Math.floor(Math.random() * 3), base = r(2800, 4200);
      for (let i = 0; i < n; i++) v.tone({ f: base, f2: base * r(1.1, 1.3), at: i * 0.09, d: 0.06, peak: 0.012 });
    }, now);
    b.every(9, (t) => { // creak of an old root or branch
      const v = b.voice(t, 0.3);
      const bp = v.noiseBurst({ a: 0.2, d: 0.4, peak: 0.02, type: 'bandpass', f: r(300, 600), q: 9 });
      v.lfo(bp.frequency, 30, 40, 0, 0.7);
    }, now);
  },
  // Running water in the channels, a cold cave rumble and echoing drips.
  aqueduct(b, now) {
    const flow = b.noise('bandpass', 900, 0.7, 0.04, now);
    b.lfo(flow.f.frequency, 0.31, 300, now);
    b.lfo(flow.g.gain, 0.13, 0.012, now);
    b.noise('lowpass', 160, 0.7, 0.06, now);
    b.every(1.3, (t) => {
      const v = b.voice(t, 0.7);
      const f = r(1100, 2300);
      v.tone({ f, f2: f * 0.55, glide: 0.05, d: 0.08, peak: r(0.012, 0.03) });
    }, now);
    b.every(14, (t) => {
      const v = b.voice(t, 0.5);
      v.noiseBurst({ a: 0.05, d: 0.6, peak: 0.025, type: 'bandpass', f: 1200, f2: 500, q: 1 });
    }, now);
  },
  // Ancient machinery: a low hum that wobbles, distant clanks, hiss of steam.
  foundry(b, now) {
    const lp = b.filter('lowpass', 240, 1.5);
    const hum = b.osc('sawtooth', 55, 0.035, now, lp);
    b.lfo(hum.frequency, 0.3, 0.6, now);
    b.osc('sine', 110.4, 0.02, now);
    b.lfo(lp.frequency, 0.11, 70, now);
    b.every(4, (t) => {
      const v = b.voice(t, 0.7);
      const lpf = v.filter('lowpass', 1800, 1);
      v.fm({ f: r(180, 320), ratio: 2.41, index: 3, index2: 0.2, d: r(0.6, 1.2), peak: 0.02, dest: lpf });
    }, now);
    b.every(12, (t) => {
      const v = b.voice(t, 0.3);
      v.noiseBurst({ a: 0.3, d: 0.9, peak: 0.02, type: 'highpass', f: 4000 });
    }, now);
  },
  // Inside the Heart Engine: a slow heartbeat, roots straining, a thin sour whine.
  heart(b, now) {
    b.noise('lowpass', 110, 0.8, 0.07, now);
    b.osc('sine', 1760, 0.002, now);
    b.osc('sine', 1866, 0.0016, now);
    b.every(1.35, (t) => {
      const v = b.voice(t, 0.2);
      v.tone({ f: 62, f2: 38, glide: 0.1, d: 0.3, peak: 0.08 });
      v.tone({ f: 55, f2: 34, glide: 0.1, d: 0.35, peak: 0.06, at: 0.24 });
    }, now, true);
    b.every(5, (t) => {
      const v = b.voice(t, 0.4);
      const bp = v.noiseBurst({ a: 0.3, d: 0.7, peak: 0.025, type: 'bandpass', f: r(200, 400), f2: r(150, 250), q: 8 });
      v.lfo(bp.frequency, 22, 30, 0, 1.1);
    }, now);
  },
};

export class Ambience {
  private bed: Bed | null = null;
  private retiring: Bed[] = [];

  constructor(private c: AmbCore, private dest: AudioNode) {}

  setZone(zone: Zone, now: number): void {
    if (this.bed?.zone === zone) return;
    if (this.bed) { this.bed.retire(now); this.retiring.push(this.bed); }
    this.bed = new Bed(this.c, this.dest, zone, now + 0.02);
  }

  tick(now: number, lookahead: number): void {
    this.bed?.tick(now + lookahead, now);
    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const b = this.retiring[i]!;
      if (now > b.deadAt) { b.dispose(); this.retiring.splice(i, 1); }
    }
  }
}
