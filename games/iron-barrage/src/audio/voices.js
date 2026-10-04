// The continuous voices behind whistle(), engine(), burn(), jet() and rocket():
// small live graphs built the first time the game updates them, whose level,
// pitch and tone glide to whatever the game says every frame. Each one is a
// handle { update(...), stop() }: stop() fades out and frees its nodes. If the
// game stops calling update (a pause, a lost frame loop) a voice fades by
// itself and wakes when updates resume. No allocation happens in update().
import { clamp } from './dsp.js';

const TC = 0.04; // seconds: how quickly params glide to new values

// A stereo panner, or on browsers without one a plain gain that ignores its pan.
export function makePan(ctx) {
  if (ctx.createStereoPanner) return ctx.createStereoPanner();
  const g = ctx.createGain();
  g.pan = { value: 0, setTargetAtTime() {} };
  return g;
}

class Voice {
  constructor(s, need) {
    this.s = s;
    this.need = need; // library keys of the loops it plays
    this.built = false;
    this.stopped = false;
    this.last = 0;
    this.srcs = [];
    this.nodes = [];
    this.idle = false;
  }

  // Build the graph once its loops are rendered; false until then.
  attach() {
    const s = this.s;
    const ents = [];
    for (const k of this.need) {
      const e = s._entry(k);
      if (!e) return false;
      ents.push(e);
    }
    this.ents = ents;
    const ctx = s.ctx;
    this.vg = ctx.createGain();
    this.vg.gain.value = 0;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 12000;
    this.lp.Q.value = 0.5;
    this.pan = makePan(ctx);
    this.vg.connect(this.lp).connect(this.pan).connect(s.posBus);
    this.nodes.push(this.vg, this.lp, this.pan);
    this.build();
    this.built = true;
    s._live.add(this);
    return true;
  }

  // ready for an update: false if it has been stopped or its loops are not ready
  ok() {
    if (this.stopped) return false;
    return this.built || this.attach();
  }

  gain(v = 0) {
    const g = this.s.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }

  filter(type, f, q = 0.7) {
    const b = this.s.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    this.nodes.push(b);
    return b;
  }

  loop(entry, rate = 1) {
    const src = this.s.ctx.createBufferSource();
    src.buffer = entry.hi;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(0, Math.random() * entry.hi.duration * 0.9);
    this.srcs.push(src);
    return src;
  }

  // level and the position's effect on it, tone and pan
  place(x, lvl) {
    const s = this.s;
    const now = s.ctx.currentTime;
    this.last = now;
    this.idle = false;
    s._spatial(x);
    this.vg.gain.setTargetAtTime(lvl * s.spG, now, TC);
    this.lp.frequency.setTargetAtTime(s.spLP, now, 0.05);
    this.pan.pan.setTargetAtTime(s.spPan, now, TC);
  }

  set(param, v, tc = TC) {
    param.setTargetAtTime(v, this.s.ctx.currentTime, tc);
  }

  // silent but kept, until the game calls update again
  hush() {
    if (this.idle || !this.built) return;
    this.idle = true;
    this.vg.gain.setTargetAtTime(0, this.s.ctx.currentTime, 0.12);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (!this.built) return;
    const now = this.s.ctx.currentTime;
    this.vg.gain.cancelScheduledValues(now);
    this.vg.gain.setTargetAtTime(0, now, 0.07);
    setTimeout(() => this.dispose(), 600);
  }

  dispose() {
    for (const src of this.srcs) {
      try {
        src.stop();
      } catch {
        /* never started */
      }
    }
    for (const n of this.nodes) n.disconnect();
    this.s._live.delete(this);
  }

  update() {}
  build() {}
}

// An inert handle for when there is no room for another voice.
export const NO_VOICE = Object.freeze({ update() {}, stop() {} });

// A handle handed out before the audio context exists (the game asked before the
// first click): it makes the real voice on the first update after unlock().
export class Deferred {
  constructor(s, Cls) {
    this.s = s;
    this.Cls = Cls;
    this.real = null;
    this.stopped = false;
  }

  update(a, b, c) {
    if (this.stopped) return;
    if (!this.real) {
      if (!this.s.ctx) return;
      this.real = new this.Cls(this.s);
    }
    this.real.update(a, b, c);
  }

  stop() {
    this.stopped = true;
    if (this.real) this.real.stop();
  }
}

// ---------------------------------------------------------------- whistle

// The incoming shell: a thin tone with a breathy edge, a little vibrato.
// Pitch falls as the shell comes down, level rises as it nears the ground.
export class Whistle extends Voice {
  constructor(s) {
    super(s, []);
  }

  build() {
    const ctx = this.s.ctx;
    this.o1 = ctx.createOscillator();
    this.o1.type = 'sine';
    this.o2 = ctx.createOscillator();
    this.o2.type = 'triangle';
    this.g1 = this.gain(0.5);
    this.g2 = this.gain(0.16);
    this.o1.connect(this.g1).connect(this.vg);
    this.o2.connect(this.g2).connect(this.vg);
    // breath: noise through a narrow band that follows the pitch
    this.band = this.filter('bandpass', 1500, 9);
    this.gn = this.gain(0.5);
    const n = this.loop({ hi: this.s.noiseBuf }, 1);
    n.connect(this.band).connect(this.gn).connect(this.vg);
    // vibrato
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 6.2;
    this.lfoG = this.gain(22);
    this.lfo.connect(this.lfoG);
    this.lfoG.connect(this.o1.detune);
    this.lfoG.connect(this.o2.detune);
    this.o1.start();
    this.o2.start();
    this.lfo.start();
    this.srcs.push(this.o1, this.o2, this.lfo);
  }

  // x metres, height above the ground in metres, speed in m/s
  update(x, height, speed) {
    if (!this.ok()) return;
    const s = this.s;
    const hh = clamp(height / 90, 0, 1);
    const near = 1 - hh;
    const sp = clamp(speed / 80, 0, 1);
    // a falling pitch, a little higher the faster it comes (approach)
    const f = (480 + 1450 * Math.pow(hh, 0.8)) * (0.88 + 0.24 * sp) * s._tsRate;
    const t = s.ctx.currentTime;
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    this.band.frequency.setTargetAtTime(f * 1.03, t, 0.03);
    this.place(x, 0.35 * (0.3 + 0.7 * Math.pow(near, 1.4)) * (0.6 + 0.4 * sp));
  }
}

// ---------------------------------------------------------------- engine

// A diesel idling and revving, with the squeal and clank of tracks that grows with throttle.
export class Engine extends Voice {
  constructor(s) {
    super(s, ['loop.engine', 'loop.squeal']);
  }

  build() {
    this.lpE = this.filter('lowpass', 600, 0.8);
    this.ge = this.gain(0.5);
    this.se = this.loop(this.ents[0], 1);
    this.se.connect(this.lpE).connect(this.ge).connect(this.vg);
    this.gs = this.gain(0);
    this.ss = this.loop(this.ents[1], 1);
    this.ss.connect(this.gs).connect(this.vg);
  }

  update(x, throttle) {
    if (!this.ok()) return;
    const s = this.s;
    const th = clamp(throttle, 0, 1);
    const ts = s._tsRate;
    const t = s.ctx.currentTime;
    this.se.playbackRate.setTargetAtTime((0.78 + 0.95 * th) * ts, t, 0.12);
    this.lpE.frequency.setTargetAtTime(380 + 1900 * th, t, 0.1);
    this.ge.gain.setTargetAtTime((0.62 + 0.38 * th) * this.ents[0].gain, t, 0.1);
    this.ss.playbackRate.setTargetAtTime((0.92 + 0.25 * th) * ts, t, 0.12);
    this.gs.gain.setTargetAtTime((th > 0.04 ? 0.5 * Math.pow(th, 1.2) : 0) * this.ents[1].gain, t, 0.12);
    this.place(x, 0.5);
  }
}

// ---------------------------------------------------------------- burn

// Fire: a throaty roar and a crackle, bigger and brighter with size.
export class Burn extends Voice {
  constructor(s) {
    super(s, ['loop.burnRoar', 'loop.burnCrackle']);
  }

  build() {
    this.lpR = this.filter('lowpass', 900, 0.7);
    this.gr = this.gain(0.4);
    this.sr = this.loop(this.ents[0], 0.97);
    this.sr.connect(this.lpR).connect(this.gr).connect(this.vg);
    this.gc = this.gain(0.3);
    this.sc = this.loop(this.ents[1], 1);
    this.sc.connect(this.gc).connect(this.vg);
  }

  update(x, size) {
    if (!this.ok()) return;
    const s = this.s;
    const z = clamp(size, 0, 1.5);
    const t = s.ctx.currentTime;
    const ts = s._tsRate;
    this.sr.playbackRate.setTargetAtTime((1.06 - 0.12 * Math.min(z, 1)) * ts, t, 0.2);
    this.sc.playbackRate.setTargetAtTime(ts, t, 0.2);
    this.lpR.frequency.setTargetAtTime(500 + 3200 * Math.min(z, 1), t, 0.2);
    this.gr.gain.setTargetAtTime((0.25 + 0.75 * Math.min(z, 1)) * this.ents[0].gain, t, 0.2);
    this.gc.gain.setTargetAtTime((0.35 + 0.65 * Math.min(z, 1)) * this.ents[1].gain, t, 0.2);
    this.place(x, 0.2 + 0.8 * Math.min(z, 1));
  }
}

// ---------------------------------------------------------------- jet

// A jet going over: roar and whine, with a Doppler shift taken from how fast its x
// closes on the listener.
export class Jet extends Voice {
  constructor(s) {
    super(s, ['loop.jet']);
    this.lastX = null;
    this.lastT = 0;
    this.dop = 1;
  }

  build() {
    this.src = this.loop(this.ents[0], 1);
    this.g = this.gain(this.ents[0].gain);
    this.src.connect(this.g).connect(this.vg);
  }

  update(x) {
    if (!this.ok()) return;
    const s = this.s;
    const t = s.ctx.currentTime;
    if (this.lastX !== null && t - this.lastT > 0.004) {
      const d0 = Math.abs(this.lastX - s._cx);
      const d1 = Math.abs(x - s._cx);
      const approach = (d0 - d1) / (t - this.lastT);
      this.dop = 1 + 0.2 * clamp(approach / 120, -1, 1);
      this.lastX = x;
      this.lastT = t;
    } else if (this.lastX === null) {
      this.lastX = x;
      this.lastT = t;
    }
    this.src.playbackRate.setTargetAtTime(this.dop * s._tsRate, t, 0.15);
    this.place(x, 0.9);
  }
}

// ---------------------------------------------------------------- rocket

export class Rocket extends Voice {
  constructor(s) {
    super(s, ['loop.rocket']);
  }

  build() {
    this.src = this.loop(this.ents[0], 1);
    this.g = this.gain(this.ents[0].gain);
    this.src.connect(this.g).connect(this.vg);
  }

  update(x) {
    if (!this.ok()) return;
    const s = this.s;
    this.src.playbackRate.setTargetAtTime(s._tsRate, s.ctx.currentTime, 0.15);
    this.place(x, 0.6);
  }
}
