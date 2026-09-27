// Magic Brush's sound, all synthesised with Web Audio at run time: no audio
// files and no voices. Everything is soft: a gentle compressor and a
// limiter hold the whole mix well below full scale.
//
// Painting has a continuous voice that follows the brush every frame:
//  - brush: bristles dragging through wet paint on canvas, a band of noise
//    whose pitch and loudness follow the stroke speed, with the faint tick
//    of individual bristles catching the weave;
//  - watercolour: a wetter, darker wash with tiny bubbles;
//  - glitter: the same soft brush plus scattered tinkles;
//  - sponge: a slow, squishy dab.
// The come-alive moment has a magical shimmer (a rising run of bell tones
// over a swelling sparkle) and a whoosh as the friend leaps out. Each
// friend has its own gentle calls (see calls.js), the garden has birdsong,
// the waterfall and leaves, and a quiet music-box tune plays over a soft
// pad.
import { load, save, clamp, rand } from '../config.js';
import { CALLS } from './calls.js';
import { Music } from './music.js';

const MASTER = 0.8;

function noiseBuffer(ctx, seconds = 2, color = 'pink') {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let brown = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w * 0.5;
    else if (color === 'brown') {
      brown = (brown + 0.02 * w) / 1.02;
      d[i] = brown * 3.5;
    } else {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // fade the loop point
  const f = Math.floor(ctx.sampleRate * 0.02);
  for (let i = 0; i < f; i++) {
    const k = i / f;
    d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k;
  }
  return b;
}

function impulse(ctx, seconds = 1.6, decay = 2.6) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = lp * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
    }
  }
  return b;
}

export class Audio {
  constructor() {
    this.muted = load('muted', false);
    this.ctx = null;
    this.ready = false;
    this.paintState = { tool: 'brush', speed: 0, active: false };
  }

  // Browsers only allow sound after a tap: call this from any input.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running' && !this.hidden) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 12;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -8;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.1;
    const trim = ctx.createGain();
    trim.gain.value = 0.55;
    this.master.connect(glue).connect(limit).connect(trim).connect(ctx.destination);
    // a warm room for everything
    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse(ctx, 1.8, 2.8);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.35;
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.6;
    this.verbIn.connect(this.verb).connect(verbOut).connect(this.master);
    // buses
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.sfx.connect(this.verbIn);
    this.pink = noiseBuffer(ctx, 3, 'pink');
    this.white = noiseBuffer(ctx, 2, 'white');
    this.brown = noiseBuffer(ctx, 3, 'brown');
    this.buildPaintVoice();
    this.buildAmbience();
    this.music = new Music(ctx, this.master, this.verbIn);
    this.ready = true;
    if (this.scene) this.setScene(this.scene);
    this.music.start();
  }

  setMuted(m) {
    this.muted = m;
    save('muted', m);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
  }

  pageHidden(h) {
    this.hidden = h;
    if (!this.ctx) return;
    if (h) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  // ------------------------------------------------------------ painting

  buildPaintVoice() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.pink;
    src.loop = true;
    // bristles: a band of noise, brighter and louder with speed
    this.brushBand = ctx.createBiquadFilter();
    this.brushBand.type = 'bandpass';
    this.brushBand.frequency.value = 1800;
    this.brushBand.Q.value = 0.9;
    this.brushHi = ctx.createBiquadFilter();
    this.brushHi.type = 'highshelf';
    this.brushHi.frequency.value = 4000;
    this.brushHi.gain.value = -8;
    this.brushGain = ctx.createGain();
    this.brushGain.gain.value = 0;
    src.connect(this.brushBand).connect(this.brushHi).connect(this.brushGain).connect(this.sfx);
    // watercolour: wet, dark wash
    const src2 = ctx.createBufferSource();
    src2.buffer = this.brown;
    src2.loop = true;
    this.washLP = ctx.createBiquadFilter();
    this.washLP.type = 'lowpass';
    this.washLP.frequency.value = 900;
    this.washGain = ctx.createGain();
    this.washGain.gain.value = 0;
    src2.connect(this.washLP).connect(this.washGain).connect(this.sfx);
    // sponge: squishy, low, dabbed
    this.spongeLP = ctx.createBiquadFilter();
    this.spongeLP.type = 'lowpass';
    this.spongeLP.frequency.value = 500;
    this.spongeLP.Q.value = 3;
    this.spongeGain = ctx.createGain();
    this.spongeGain.gain.value = 0;
    const src3 = ctx.createBufferSource();
    src3.buffer = this.pink;
    src3.loop = true;
    src3.connect(this.spongeLP).connect(this.spongeGain).connect(this.sfx);
    src.start();
    src2.start(0, 1.1);
    src3.start(0, 2.3);
    this.tickAcc = 0;
  }

  // per frame while painting. speed: canvas widths per second (about 0..3)
  paint(tool, speed, active, dt) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = active ? clamp(speed / 1.2, 0, 1.4) : 0;
    const on = (t) => (active && tool === t ? 1 : 0);
    const brushy = on('brush') + on('glitter') * 0.7;
    this.brushGain.gain.setTargetAtTime(brushy * (0.04 + 0.22 * s) * (s > 0.02 ? 1 : 0.25), now, 0.03);
    this.brushBand.frequency.setTargetAtTime(1100 + 2200 * s, now, 0.05);
    this.washGain.gain.setTargetAtTime(on('water') * (0.08 + 0.35 * s), now, 0.05);
    this.washLP.frequency.setTargetAtTime(500 + 900 * s, now, 0.05);
    const dab = on('sponge') * (0.1 + 0.3 * s) * (0.6 + 0.4 * Math.sin(now * 23));
    this.spongeGain.gain.setTargetAtTime(dab, now, 0.02);
    // bristle ticks, water bubbles and glitter tinkles
    if (active) {
      this.tickAcc += dt * (tool === 'glitter' ? 6 + 26 * s : tool === 'water' ? 3 + 8 * s : 8 + 40 * s);
      while (this.tickAcc > 1) {
        this.tickAcc -= 1;
        if (tool === 'glitter') this.tinkle(0.06 + 0.06 * Math.random());
        else if (tool === 'water') this.bubble(0.05);
        else if (tool === 'brush') this.tick(0.02 + 0.03 * s);
      }
    }
  }

  tick(v) {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.02;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = rand(3000, 6000);
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + 0.03);
  }

  bubble(v) {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.03;
    const o = ctx.createOscillator();
    const f0 = rand(500, 1100);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.08);
  }

  // a small bell: a few inharmonic partials
  bell(freq, v, t = this.ctx.currentTime, dur = 1.2, out = this.sfx) {
    const ctx = this.ctx;
    const parts = [
      [1, 1, 1],
      [2.76, 0.35, 0.6],
      [5.4, 0.15, 0.35],
    ];
    for (const [m, a, d] of parts) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * a, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur * d + 0.05);
    }
  }

  tinkle(v) {
    const scale = [1568, 1760, 2093, 2349, 2637, 3136];
    this.bell(scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 2 : 1), v, this.ctx.currentTime + Math.random() * 0.04, 0.5);
  }

  // ------------------------------------------------------------ interface

  click() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.1);
  }

  select() {
    if (!this.ready) return;
    this.bell(1318.5, 0.06, this.ctx.currentTime, 0.6);
    this.bell(1975.5, 0.04, this.ctx.currentTime + 0.06, 0.5);
  }

  // dipping the brush in a new colour: a soft wet 'plip'
  dip() {
    if (!this.ready) return;
    this.bubble(0.08);
    this.bell(1046.5, 0.03, this.ctx.currentTime + 0.02, 0.4);
  }

  undo() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.pink;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(2500, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.3);
  }

  tap() {
    if (!this.ready) return;
    this.bell(1568, 0.05, this.ctx.currentTime, 0.4);
  }

  // ------------------------------------------------------------ magic

  magic(kind) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (kind === 'sweep' || kind === 'shimmer') {
      // a rising run of bells over a swelling sparkle
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
      const step = kind === 'sweep' ? 0.11 : 0.085;
      notes.forEach((f, i) => this.bell(f, 0.07, t + i * step, 1.6));
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      src.connect(hp).connect(g).connect(this.sfx);
      src.start(t);
      src.stop(t + 1.7);
      for (let i = 0; i < 14; i++) this.bell(rand(2000, 4200), 0.025, t + 0.1 + Math.random() * 1.2, 0.5);
    } else if (kind === 'whoosh') {
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.9);
      f.frequency.exponentialRampToValueAtTime(900, t + 1.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      src.connect(f).connect(g).connect(this.sfx);
      src.start(t);
      src.stop(t + 1.8);
      // and a warm chord underneath
      [261.63, 329.63, 392, 523.25].forEach((fr, i) => this.pad(fr, 0.03, t + 0.1 + i * 0.05, 2.2));
    }
  }

  pad(freq, v, t, dur) {
    const ctx = this.ctx;
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  land() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.25);
    for (let i = 0; i < 5; i++) this.bell(rand(1500, 3000), 0.03, t + 0.05 + i * 0.05, 0.5);
  }

  poof() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [2093, 1568, 1318.5, 1046.5].forEach((f, i) => this.bell(f, 0.04, t + i * 0.07, 0.8));
  }

  // a friend's call. kind: the friend's id; name: which call
  creature(kind, name) {
    if (!this.ready) return;
    const call = CALLS[kind]?.[name] || CALLS[kind]?.happy || CALLS.generic[name] || CALLS.generic.happy;
    call(this, this.ctx.currentTime);
  }

  // ------------------------------------------------------------ ambience and music

  buildAmbience() {
    const ctx = this.ctx;
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.master);
    // the waterfall and leaves: two slow bands of noise
    const w = ctx.createBufferSource();
    w.buffer = this.pink;
    w.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 1200;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    w.connect(wf).connect(wg).connect(this.amb);
    w.start();
    const l = ctx.createBufferSource();
    l.buffer = this.white;
    l.loop = true;
    const lf = ctx.createBiquadFilter();
    lf.type = 'bandpass';
    lf.frequency.value = 3500;
    lf.Q.value = 0.6;
    const lg = ctx.createGain();
    lg.gain.value = 0.006;
    l.connect(lf).connect(lg).connect(this.amb);
    l.start();
    this.leafGain = lg;
    this.birdTimer = 2;
  }

  setScene(scene) {
    this.scene = scene;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const amb = scene === 'menu' ? 0.5 : scene === 'play' ? 1 : 0.7;
    this.amb.gain.setTargetAtTime(amb, t, 0.8);
    this.music.setLevel(scene === 'menu' ? 0.8 : scene === 'play' ? 0.75 : 0.55);
  }


  update(dt) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.leafGain.gain.setTargetAtTime(0.004 + 0.004 * (0.5 + 0.5 * Math.sin(t * 0.3)), t, 0.5);
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = rand(3, 9);
      this.bird();
    }
    this.music.update();
  }

  // a songbird somewhere in the garden: a few quick whistled notes
  bird() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.8, 0.8);
    const out = ctx.createGain();
    out.gain.value = rand(0.02, 0.04);
    out.connect(pan).connect(this.amb);
    const base = rand(2400, 3600);
    const n = 2 + Math.floor(Math.random() * 5);
    let at = t;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const d = rand(0.05, 0.12);
      const f0 = base * rand(0.85, 1.2);
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f0 * rand(0.7, 1.4), at + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + d + 0.02);
      at += d + rand(0.02, 0.09);
    }
  }
}
