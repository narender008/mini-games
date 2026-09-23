// All sound is synthesised with Web Audio: no audio files. The pop layers a
// sharp crack, a noisy body, a low thump and a fabric-rip crackle, sent into
// a generated open-air reverb so it rings out over the water.
const STORE_KEY = 'mini-games.balloon-pop.muted';

function readMuted() {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = readMuted();
    this.suspendedByPage = false;
    this.listenerCam = null;
  }

  // Must be called from a user gesture.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state === 'suspended' && !this.suspendedByPage) this.ctx.resume();
  }

  build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    this.master.connect(comp).connect(ctx.destination);

    // generated stereo impulse response: sparse early reflections + long tail
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2.6) * (t < 0.012 ? t / 0.012 : 1);
      }
      for (let k = 0; k < 6; k++) {
        const at = Math.floor(ctx.sampleRate * (0.03 + Math.random() * 0.12));
        d[at] += (Math.random() < 0.5 ? -1 : 1) * 0.6;
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // soft saturation for punch
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
    }
    this.shaper.curve = curve;
    this.shaper.connect(this.master);
    this.shaper.connect(this.reverbSend);

    this.startAmbience();
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem(STORE_KEY, m ? '1' : '0');
    } catch {
      /* storage may be unavailable */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  pageHidden(hidden) {
    this.suspendedByPage = hidden;
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend();
    else this.ctx.resume();
  }

  setPaused(paused) {
    if (!this.ctx) return;
    this.ambGain.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, 0.2);
  }

  ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  panFor(position) {
    if (!position || !this.listenerCam) return 0;
    const p = position.clone().project(this.listenerCam);
    return Math.max(-0.9, Math.min(0.9, p.x * 0.8));
  }

  noiseSource(offset = Math.random()) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = this.noise.duration;
    return { src, offset: offset * 1.5 };
  }

  env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  pop({ size = 4, position, golden = false, special = false }) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const big = Math.min(1.6, Math.max(0.6, size / 4.5));
    const out = ctx.createStereoPanner();
    out.pan.value = this.panFor(position);
    out.connect(this.shaper);

    // 1. crack: bright transient
    {
      const { src, offset } = this.noiseSource();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = 3200 / big;
      pk.gain.value = 9;
      pk.Q.value = 0.8;
      const g = ctx.createGain();
      this.env(g, t, 0.0008, 1.1, 0.06 * big);
      src.connect(hp).connect(pk).connect(g).connect(out);
      src.start(t, offset);
      src.stop(t + 0.2);
    }
    // 2. body: the rush of air
    {
      const { src, offset } = this.noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2600 / big, t);
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.25 * big);
      const g = ctx.createGain();
      this.env(g, t, 0.002, 0.8, 0.22 * big);
      src.connect(lp).connect(g).connect(out);
      src.start(t, offset);
      src.stop(t + 0.5 * big);
    }
    // 3. thump
    {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150 / big, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.16 * big);
      const g = ctx.createGain();
      this.env(g, t, 0.002, 0.95, 0.24 * big);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.4 * big);
    }
    // 4. rip: a quick crackle of the skin tearing
    for (let k = 0; k < 9; k++) {
      const { src, offset } = this.noiseSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800 + Math.random() * 3500;
      bp.Q.value = 3;
      const g = ctx.createGain();
      const tk = t + 0.004 + Math.random() * 0.07 * big;
      this.env(g, tk, 0.0005, 0.35 * Math.random() + 0.1, 0.012);
      src.connect(bp).connect(g).connect(out);
      src.start(tk, offset);
      src.stop(tk + 0.05);
    }
    if (special) {
      // a deep boom under the slow-motion moment
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
      const g = ctx.createGain();
      this.env(g, t, 0.01, 0.9, 1.4);
      o.connect(g).connect(this.shaper);
      o.start(t);
      o.stop(t + 1.6);
    }
    if (golden) {
      // bright chime for the golden balloon
      [1318.5, 1975.5, 2637, 3951].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        this.env(g, t + 0.03 + i * 0.045, 0.004, 0.18 / (i + 1), 1.4);
        o.connect(g).connect(out);
        o.start(t + 0.03 + i * 0.045);
        o.stop(t + 1.8);
      });
    }
  }

  splash({ size = 0.3, position }) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.02;
    const big = Math.min(2, Math.max(0.3, size));
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.panFor(position);
    pan.connect(this.master);
    pan.connect(this.reverbSend);
    const { src, offset } = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 / big + Math.random() * 600;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0.05 * big, 0.12 * big);
    src.connect(bp).connect(g).connect(pan);
    src.start(t, offset);
    src.stop(t + 0.4);
    if (big > 0.9) {
      // plunge: low body and a bubbly bloop
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(420, t + 0.02);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
      const og = ctx.createGain();
      this.env(og, t + 0.02, 0.005, 0.12, 0.12);
      o.connect(og).connect(pan);
      o.start(t + 0.02);
      o.stop(t + 0.3);
      const n2 = this.noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const g2 = ctx.createGain();
      this.env(g2, t, 0.004, 0.35, 0.5);
      n2.src.connect(lp).connect(g2).connect(pan);
      n2.src.start(t, n2.offset);
      n2.src.stop(t + 0.8);
    }
  }

  jab() {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const { src, offset } = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.07);
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    this.env(g, t, 0.01, 0.06, 0.07);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, offset);
    src.stop(t + 0.15);
  }

  whoosh(duration = 0.3) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const { src, offset } = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + duration * 0.4);
    bp.frequency.exponentialRampToValueAtTime(700, t + duration);
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14, t + duration * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, offset);
    src.stop(t + duration + 0.05);
  }

  click() {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.03);
    const g = ctx.createGain();
    this.env(g, t, 0.001, 0.05, 0.04);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.08);
  }

  // Quiet wind and lapping water under everything.
  startAmbience() {
    const ctx = this.ctx;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 1;
    this.ambGain.connect(this.master);
    const layer = (freq, gain, lfoRate, lfoDepth) => {
      const { src, offset } = this.noiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lfoRate;
      const lg = ctx.createGain();
      lg.gain.value = lfoDepth;
      lfo.connect(lg).connect(g.gain);
      src.connect(lp).connect(g).connect(this.ambGain);
      src.start(ctx.currentTime, offset);
      lfo.start();
    };
    layer(420, 0.035, 0.07, 0.018); // wind
    layer(900, 0.02, 0.16, 0.014); // water
  }
}
