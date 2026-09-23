// Every sound is synthesised with Web Audio; there are no audio files.
// Sounds are soft and happy: gentle "pew"s, round booms with a rising chime,
// a boop-and-giggle, fanfares and fireworks. Music lives in music.js.
import { load, save } from './config.js';
import { Music } from './music.js';

// C major pentatonic, two octaves: the hit chime climbs it.
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = load('muted', false);
    this.hiddenPause = false;
    this.chime = 0;
    this.lastLaser = 0;
  }

  // Must run inside a user gesture the first time.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state === 'suspended' && !this.hiddenPause) this.ctx.resume();
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    // a gentle top-end roll-off keeps everything soft on small speakers
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 9000;
    this.master.connect(soften).connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);

    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.2) * (t < 0.01 ? t / 0.01 : 1);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.verb = ctx.createGain();
    this.verb.gain.value = 0.25;
    this.verb.connect(this.reverb).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    this.music = new Music(ctx, this.master, this.verb, this.noise);
    if (this.wantMusic) this.music.start();
  }

  setMuted(m) {
    this.muted = m;
    save('muted', m);
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }

  pageHidden(hidden) {
    this.hiddenPause = hidden;
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend();
    else this.ctx.resume();
  }

  startMusic(style) {
    this.wantMusic = true;
    if (this.music) this.music.start(style);
  }

  ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  // ------------------------------------------------------------ primitives

  out(pan = 0, wet = 0.3) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    p.connect(this.sfx);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(this.verb);
    }
    return p;
  }

  tone({ type = 'sine', f0, f1 = f0, t = this.ctx.currentTime, attack = 0.005, dur = 0.2, peak = 0.2, dest, curve = 'exp' }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  noiseHit({ t = this.ctx.currentTime, type = 'lowpass', f0 = 1200, f1 = f0, q = 0.7, dur = 0.2, peak = 0.2, dest }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  bell(freq, t, peak, dest, dur = 0.6) {
    this.tone({ f0: freq, t, dur, peak, dest });
    this.tone({ f0: freq * 2.76, t, dur: dur * 0.35, peak: peak * 0.3, dest });
    this.tone({ f0: freq * 5.4, t, dur: dur * 0.15, peak: peak * 0.12, dest });
  }

  // ------------------------------------------------------------ effects

  click() {
    if (!this.ready()) return;
    const d = this.out(0, 0.2);
    this.tone({ f0: 880, f1: 1320, dur: 0.07, peak: 0.12, dest: d });
  }

  select() {
    if (!this.ready()) return;
    const d = this.out(0, 0.3);
    const t = this.ctx.currentTime;
    this.bell(784, t, 0.12, d, 0.3);
    this.bell(1175, t + 0.07, 0.1, d, 0.35);
  }

  laser(big = false, pan = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    if (t - this.lastLaser < 0.05) return;
    this.lastLaser = t;
    const d = this.out(pan, 0.15);
    const f = 1500 + Math.random() * 200;
    this.tone({ type: 'triangle', f0: f, f1: f * 0.38, dur: 0.1, peak: big ? 0.08 : 0.055, dest: d });
    this.tone({ type: 'sine', f0: f * 0.5, f1: f * 0.25, dur: 0.08, peak: 0.04, dest: d });
  }

  whoosh(pan = 0) {
    if (!this.ready()) return;
    const d = this.out(pan, 0.2);
    this.noiseHit({ type: 'bandpass', f0: 500, f1: 2400, q: 1.2, dur: 0.35, peak: 0.12, dest: d });
    this.tone({ type: 'sine', f0: 220, f1: 440, dur: 0.25, peak: 0.05, dest: d });
  }

  bloop(pan = 0) {
    if (!this.ready()) return;
    const d = this.out(pan, 0.3);
    const f = 380 + Math.random() * 160;
    this.tone({ type: 'sine', f0: f, f1: f * 2.2, dur: 0.12, peak: 0.12, dest: d, curve: 'exp' });
  }

  bubblePop(pan = 0) {
    if (!this.ready()) return;
    const d = this.out(pan, 0.3);
    this.tone({ type: 'sine', f0: 900 + Math.random() * 300, f1: 2400, dur: 0.05, peak: 0.1, dest: d });
    this.noiseHit({ type: 'highpass', f0: 3000, dur: 0.04, peak: 0.05, dest: d });
  }

  shimmer(level = 1) {
    if (!this.ready()) return;
    const d = this.out(0, 0.5);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.bell(PENTA[(Math.random() * PENTA.length) | 0] * 2, t + i * 0.04, 0.03 * level, d, 0.25);
  }

  // The happy boom: a round thump, a soft burst of air and a chime that
  // climbs the scale as hits come in quick succession.
  hit({ pan = 0, streak = 1, big = 1 } = {}) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.003;
    const d = this.out(pan, 0.35);
    this.tone({ type: 'sine', f0: 150 * (0.9 + Math.random() * 0.2), f1: 48, dur: 0.28 * big, peak: 0.32 * Math.min(1.4, big), dest: d });
    this.noiseHit({ t, type: 'lowpass', f0: 2600, f1: 300, q: 0.5, dur: 0.26 * big, peak: 0.16 * Math.min(1.5, big), dest: d });
    this.noiseHit({ t, type: 'highpass', f0: 5000, dur: 0.05, peak: 0.05, dest: d });
    const step = Math.min(PENTA.length - 1, Math.max(0, streak - 1) % PENTA.length);
    this.bell(PENTA[step], t + 0.02, 0.1, d, 0.5);
    if (streak >= 5) this.bell(PENTA[Math.min(PENTA.length - 1, step + 2)], t + 0.07, 0.07, d, 0.45);
  }

  // An enemy reached the bottom: a soft boop and a little giggle.
  boop(pan = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const d = this.out(pan, 0.3);
    this.tone({ type: 'sine', f0: 520, f1: 260, dur: 0.18, peak: 0.14, dest: d });
    this.giggle(t + 0.12, d);
  }

  giggle(t0, dest) {
    const ctx = this.ctx;
    const base = 650 + Math.random() * 150;
    const n = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.085;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = base * (1 + 0.05 * Math.sin(i * 2.1)) * (1 - i * 0.03);
      o.frequency.setValueAtTime(f * 1.15, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.06);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2200;
      bp.Q.value = 3;
      const bp2 = ctx.createBiquadFilter();
      bp2.type = 'bandpass';
      bp2.frequency.value = 900;
      bp2.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09 * (1 - i * 0.12), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(bp).connect(g);
      o.connect(bp2).connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + 0.1);
    }
  }

  // MEGA POWER! A rising brassy fanfare over a sparkle.
  fanfare(level = 1) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const d = this.out(0, 0.4);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const at = t + i * 0.1;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = f * 1.005;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, at);
      lp.frequency.linearRampToValueAtTime(3200, at + 0.08);
      const g = ctx.createGain();
      const len = i === notes.length - 1 ? 0.7 : 0.14;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.08 * level, at + 0.02);
      g.gain.setValueAtTime(0.08 * level, at + len * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(lp);
      o2.connect(lp);
      lp.connect(g).connect(d);
      o.start(at);
      o2.start(at);
      o.stop(at + len + 0.05);
      o2.stop(at + len + 0.05);
    });
    for (let i = 0; i < 8; i++) this.bell(PENTA[4 + (i % 6)] * 1.0, t + 0.3 + i * 0.05, 0.05, d, 0.4);
  }

  firework(pan = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const d = this.out(pan, 0.5);
    this.noiseHit({ t, type: 'bandpass', f0: 800, f1: 3000, q: 1, dur: 0.3, peak: 0.05, dest: d });
    this.tone({ type: 'sine', f0: 110, f1: 45, t: t + 0.3, dur: 0.35, peak: 0.18, dest: d });
    for (let i = 0; i < 10; i++) this.noiseHit({ t: t + 0.35 + Math.random() * 0.6, type: 'highpass', f0: 4000 + Math.random() * 3000, dur: 0.03, peak: 0.05, dest: d });
  }

  // a combo milestone: rising arpeggio whose top note climbs with the level
  milestone(level = 1) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.02;
    const d = this.out(0, 0.4);
    const base = Math.min(5, level);
    for (let i = 0; i < 4; i++) this.bell(PENTA[Math.min(PENTA.length - 1, base + i)], t + i * 0.06, 0.08, d, 0.45);
  }

  powerup() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const d = this.out(0, 0.35);
    this.tone({ type: 'triangle', f0: 400, f1: 1600, dur: 0.3, peak: 0.1, dest: d });
    for (let i = 0; i < 5; i++) this.bell(PENTA[i * 2 % PENTA.length], t + 0.05 + i * 0.05, 0.06, d, 0.3);
  }

  bossHit(pan = 0) {
    if (!this.ready()) return;
    const d = this.out(pan, 0.3);
    this.tone({ type: 'sine', f0: 200, f1: 90, dur: 0.16, peak: 0.16, dest: d });
    this.tone({ type: 'triangle', f0: 320 + Math.random() * 60, f1: 180, dur: 0.12, peak: 0.06, dest: d });
  }

  bossPop() {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const d = this.out(0, 0.5);
    this.tone({ type: 'sine', f0: 120, f1: 35, dur: 0.8, peak: 0.4, dest: d });
    this.noiseHit({ t, type: 'lowpass', f0: 3000, f1: 200, dur: 0.8, peak: 0.2, dest: d });
    this.fanfare(1.2);
    this.giggle(t + 0.4, d);
  }
}
