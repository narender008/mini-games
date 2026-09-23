// All sound is synthesised with Web Audio: no audio files. A blade through
// sponge is soft filtered noise with a fine crackle of crumbs; porcelain
// rings with a few bright partials; the birthday song is a little music box.
const STORE_KEY = 'mini-games.cake-cut.muted';

function readMuted() {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Happy Birthday (traditional), as [midi note, beats] from the pickup.
const BIRTHDAY = [
  [67, 0.75], [67, 0.25], [69, 1], [67, 1], [72, 1], [71, 2],
  [67, 0.75], [67, 0.25], [69, 1], [67, 1], [74, 1], [72, 2],
  [67, 0.75], [67, 0.25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
  [77, 0.75], [77, 0.25], [76, 1], [72, 1], [74, 1], [72, 3],
];
// bass note at the start of each bar (3/4, after a one-beat pickup)
const BIRTHDAY_BASS = [48, 43, 43, 48, 48, 41, 43, 48];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = readMuted();
    this.suspendedByPage = false;
    this.cut = null;
    this.crackleClock = 0;
  }

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
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    // a small warm room
    const len = Math.floor(ctx.sampleRate * 1.3);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 5.5) * (t < 0.006 ? t / 0.006 : 1);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.send = ctx.createGain();
    this.send.gain.value = 0.22;
    this.send.connect(this.reverb).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // brown-ish noise for breath and room tone
    this.brown = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }

    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.bus.connect(this.send);
    this.startRoom();
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
    this.roomGain.gain.setTargetAtTime(paused ? 0 : 1, this.ctx.currentTime, 0.2);
    if (paused) this.cutStop(false);
  }

  ready() {
    return this.ctx && this.ctx.state === 'running' && !this.muted;
  }

  src(buffer = this.noise, offset = Math.random()) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.loopStart = 0;
    s.loopEnd = buffer.duration;
    s.start(this.ctx.currentTime, offset * buffer.duration * 0.9);
    return s;
  }

  env(gain, t, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  // a short filtered noise burst
  burst({ t = this.ctx.currentTime, type = 'bandpass', freq = 2000, q = 1, peak = 0.3, attack = 0.002, decay = 0.05, dest = this.bus, sweep = 0 }) {
    const n = this.src();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + attack + decay);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, attack, decay);
    n.connect(f).connect(g).connect(dest);
    n.stop(t + attack + decay + 0.05);
  }

  tone({ t = this.ctx.currentTime, freq, type = 'sine', peak = 0.2, attack = 0.004, decay = 0.4, dest = this.bus, detune = 0 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    const g = this.ctx.createGain();
    this.env(g, t, peak, attack, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    return o;
  }

  // ------------------------------------------------------------ room

  startRoom() {
    const ctx = this.ctx;
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 1;
    this.roomGain.connect(this.master);
    const n = this.src(this.brown);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    n.connect(f).connect(g).connect(this.roomGain);
  }

  // ------------------------------------------------------------ cutting

  // Start the sound of a blade in the cake. kind: chef, serrated, wire,
  // sword, server.
  cutStart(kind) {
    if (!this.ctx) return;
    this.cutStop(false);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.src();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'wire' ? 5200 : kind === 'serrated' ? 2600 : 1500;
    bp.Q.value = kind === 'wire' ? 4 : 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'wire' ? 9000 : 3800;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    n.connect(bp).connect(lp).connect(g).connect(this.bus);
    const voice = { kind, n, bp, g, extra: [] };
    if (kind === 'wire') {
      // the taut wire sings faintly
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 1320;
      const og = ctx.createGain();
      og.gain.value = 0.0001;
      o.connect(og).connect(this.bus);
      o.start(t);
      voice.extra.push({ o, og });
    }
    // the squish of the blade entering the frosting
    this.burst({ t, type: 'lowpass', freq: 900, q: 0.8, peak: 0.12, attack: 0.01, decay: 0.12, sweep: 0.5 });
    this.cut = voice;
  }

  // Called every frame while cutting: level 0..1 from how fast the blade is
  // moving; saw is the serrated knife's stroke (-1..1).
  cutLevel(level, dt, saw = 0) {
    const v = this.cut;
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    let l = Math.min(1, level);
    if (v.kind === 'serrated') l *= 0.35 + 0.65 * Math.abs(saw);
    const peak = v.kind === 'wire' ? 0.05 : v.kind === 'sword' ? 0.2 : 0.16;
    v.g.gain.setTargetAtTime(0.0001 + l * peak, t, 0.03);
    v.bp.frequency.setTargetAtTime((v.kind === 'wire' ? 5200 : v.kind === 'serrated' ? 2200 : 1300) * (0.8 + 0.5 * l), t, 0.05);
    for (const e of v.extra) e.og.gain.setTargetAtTime(0.0001 + l * 0.012, t, 0.05);
    // crumbs tearing: tiny clicks, more for a serrated blade, none for wire
    const rate = v.kind === 'wire' ? 0 : (v.kind === 'serrated' ? 70 : 35) * l;
    this.crackleClock -= dt * rate;
    while (this.crackleClock < 0) {
      this.crackleClock += 0.5 + Math.random();
      this.burst({
        t: t + Math.random() * 0.02,
        type: 'highpass',
        freq: 1800 + Math.random() * 2500,
        q: 0.5,
        peak: 0.02 + Math.random() * 0.05,
        attack: 0.0008,
        decay: 0.004 + Math.random() * 0.01,
      });
    }
  }

  // The blade stops: a soft knock if it met the board.
  cutStop(board = true) {
    const v = this.cut;
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.g.gain.setTargetAtTime(0.0001, t, 0.04);
    v.n.stop(t + 0.3);
    for (const e of v.extra) {
      e.og.gain.setTargetAtTime(0.0001, t, 0.04);
      e.o.stop(t + 0.3);
    }
    this.cut = null;
    if (board) this.boardTap();
  }

  boardTap() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ t, freq: 190, peak: 0.12, attack: 0.002, decay: 0.09 });
    this.burst({ t, type: 'bandpass', freq: 1400, q: 1.2, peak: 0.06, attack: 0.001, decay: 0.03 });
  }

  // ------------------------------------------------------------ serving

  scrape() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst({ t, type: 'bandpass', freq: 3000, q: 1.4, peak: 0.07, attack: 0.03, decay: 0.28, sweep: 0.7 });
  }

  whoosh(strength = 0.5) {
    if (!this.ctx) return;
    this.burst({ type: 'bandpass', freq: 600, q: 0.9, peak: 0.12 * strength, attack: 0.08, decay: 0.3, sweep: 2.5 });
  }

  // porcelain: a knock and a few bright, slowly dying partials
  clink(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst({ t, type: 'bandpass', freq: 3500, q: 2, peak: 0.08 * strength, attack: 0.001, decay: 0.02 });
    const base = 1850 + Math.random() * 120;
    for (const [k, a, d] of [
      [1, 0.05, 0.9],
      [2.32, 0.035, 0.6],
      [3.86, 0.022, 0.45],
      [5.4, 0.012, 0.3],
    ]) {
      this.tone({ t, freq: base * k, peak: a * strength, attack: 0.001, decay: d });
    }
  }

  click() {
    if (!this.ctx) return;
    this.burst({ type: 'bandpass', freq: 2400, q: 3, peak: 0.08, attack: 0.001, decay: 0.03 });
  }

  // ------------------------------------------------------------ candles

  match() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst({ t, type: 'highpass', freq: 2500, q: 0.7, peak: 0.12, attack: 0.005, decay: 0.12 });
    for (let i = 0; i < 6; i++) this.burst({ t: t + 0.04 + Math.random() * 0.12, type: 'highpass', freq: 3000, peak: 0.05, attack: 0.001, decay: 0.01 });
    this.ignite(t + 0.1, 0.6);
  }

  ignite(t = this.ctx ? this.ctx.currentTime : 0, strength = 0.35) {
    if (!this.ctx) return;
    this.burst({ t, type: 'lowpass', freq: 400, q: 0.5, peak: 0.2 * strength, attack: 0.03, decay: 0.3, sweep: 2.2 });
  }

  // A held breath across the candles.
  blowStart() {
    if (!this.ctx || this.breath) return;
    const ctx = this.ctx;
    const n = this.src(this.noise);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    n.connect(f).connect(g).connect(this.bus);
    this.breath = { n, f, g };
  }

  blowLevel(level) {
    if (!this.breath) return;
    const t = this.ctx.currentTime;
    this.breath.g.gain.setTargetAtTime(0.0001 + level * 0.1, t, 0.06);
    this.breath.f.frequency.setTargetAtTime(700 + level * 900, t, 0.1);
  }

  blowStop() {
    if (!this.breath) return;
    const t = this.ctx.currentTime;
    this.breath.g.gain.setTargetAtTime(0.0001, t, 0.08);
    this.breath.n.stop(t + 0.5);
    this.breath = null;
  }

  puff() {
    if (!this.ctx) return;
    this.burst({ type: 'lowpass', freq: 700, q: 0.7, peak: 0.08, attack: 0.005, decay: 0.12, sweep: 0.4 });
  }

  // ------------------------------------------------------------ party

  // Happy Birthday on a music box, with a soft bass. Returns its length.
  birthday() {
    if (!this.ctx) return 0;
    const ctx = this.ctx;
    const beat = 0.42;
    const start = ctx.currentTime + 0.15;
    const bell = (t, n, peak = 0.11) => {
      const f = midi(n);
      for (const [k, a, d] of [
        [1, 1, 1.4],
        [2, 0.3, 0.8],
        [3.01, 0.12, 0.5],
        [4.2, 0.06, 0.25],
      ]) this.tone({ t, freq: f * k, peak: peak * a, attack: 0.003, decay: d });
    };
    let t = start;
    for (const [n, b] of BIRTHDAY) {
      bell(t, n);
      t += b * beat;
    }
    BIRTHDAY_BASS.forEach((n, i) => {
      const bt = start + beat + i * 3 * beat;
      this.tone({ t: bt, freq: midi(n), type: 'triangle', peak: 0.09, attack: 0.02, decay: 1.1 });
      this.tone({ t: bt + beat, freq: midi(n + 12), type: 'sine', peak: 0.03, attack: 0.02, decay: 0.5 });
      this.tone({ t: bt + 2 * beat, freq: midi(n + 16 - (i === 5 ? 1 : 0)), type: 'sine', peak: 0.025, attack: 0.02, decay: 0.5 });
    });
    return t - ctx.currentTime + 0.8;
  }

  confetti() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const d of [0, 0.09]) {
      this.burst({ t: t + d, type: 'bandpass', freq: 1800, q: 0.8, peak: 0.35, attack: 0.001, decay: 0.06 });
      this.tone({ t: t + d, freq: 140, peak: 0.12, attack: 0.001, decay: 0.08 });
    }
    // paper settling
    for (let i = 0; i < 14; i++) this.burst({ t: t + 0.15 + Math.random() * 1.4, type: 'highpass', freq: 4000, peak: 0.012, attack: 0.01, decay: 0.05 });
  }

  sparkle(count = 5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < count; i++) {
      this.tone({ t: t + i * 0.045 + Math.random() * 0.02, freq: 2200 + Math.random() * 2600, peak: 0.03, attack: 0.002, decay: 0.35 });
    }
  }

  ding() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ t, freq: 1568, peak: 0.08, decay: 0.8 });
    this.tone({ t, freq: 1568 * 2.76, peak: 0.02, decay: 0.3 });
  }

  // a served slice: higher and brighter for better slices and longer streaks
  success(quality = 1, streak = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const up = Math.min(streak - 1, 8);
    const notes = quality > 0.93 ? [0, 4, 7, 12] : [0, 7];
    notes.forEach((k, i) => this.tone({ t: t + i * 0.07, freq: midi(76 + up + k), peak: 0.07, decay: 0.5 }));
  }

  miss() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.tone({ t, freq: 330, type: 'triangle', peak: 0.08, decay: 0.35 });
    o.frequency.exponentialRampToValueAtTime(200, t + 0.3);
  }

  tick() {
    if (!this.ctx) return;
    this.tone({ freq: 1200, peak: 0.05, attack: 0.001, decay: 0.05 });
  }

  fanfare(level = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 72 + Math.min(level, 4) * 2;
    [0, 4, 7, 12, 16].forEach((k, i) => {
      this.tone({ t: t + i * 0.08, freq: midi(base + k), type: 'triangle', peak: 0.08, decay: 0.6 });
      this.tone({ t: t + i * 0.08, freq: midi(base + k), type: 'sawtooth', peak: 0.012, decay: 0.3 });
    });
  }
}
