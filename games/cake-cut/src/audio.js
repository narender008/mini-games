// All sound is synthesised with Web Audio: no audio files. Everything that
// touches the cake is soft, low-passed noise: a moist squish as a blade goes
// in, a gentle swish through sponge and cream, soft rasps for the serrated
// knife, a quiet zip for the wire and a faint patter of crumbs. Porcelain is
// a few mellow partials; the birthday song is a little music box.
//
// Every one-shot rises and falls on a smooth curve that starts and ends at
// exactly zero, and every source starts when its envelope does, so nothing
// clicks. The Happy Birthday moment is the loudest thing in the game.
const STORE_KEY = 'mini-games.cake-cut.muted';

function readMuted() {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

// Happy Birthday (traditional), as [midi note, beats] from the pickup.
const BIRTHDAY = [
  [67, 0.75], [67, 0.25], [69, 1], [67, 1], [72, 1], [71, 2],
  [67, 0.75], [67, 0.25], [69, 1], [67, 1], [74, 1], [72, 2],
  [67, 0.75], [67, 0.25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
  [77, 0.75], [77, 0.25], [76, 1], [72, 1], [74, 1], [72, 3],
];
// bass note at the start of each bar (3/4, after a one-beat pickup)
const BIRTHDAY_BASS = [48, 43, 43, 48, 48, 41, 43, 48];
// a major pentatonic run for sparkles, so they always sound in tune
const PENTA = [81, 83, 85, 88, 90, 93, 95];

// How each tool sounds in the cake: the swish's centre, width and top end,
// and its level at full speed.
const BLADE = {
  chef: { freq: 750, q: 0.7, lp: 2000, peak: 0.17 },
  serrated: { freq: 900, q: 0.9, lp: 2300, peak: 0.17 },
  sword: { freq: 800, q: 0.7, lp: 2000, peak: 0.14 },
  server: { freq: 650, q: 0.7, lp: 1800, peak: 0.13 },
  wire: { freq: 500, q: 1.4, lp: 2600, peak: 0.2 },
};
const WIRE_PLUNGE = 0.6; // seconds, as in main.js

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = readMuted();
    this.suspendedByPage = false;
    this.cut = null;
    this.crumbClock = 0;
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
    // a gentle glue compressor and a soft top, never a hard limiter
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = 9000;
    top.Q.value = 0.5;
    // and no rumble or DC below hearing
    const floor = ctx.createBiquadFilter();
    floor.type = 'highpass';
    floor.frequency.value = 30;
    floor.Q.value = 0.5;
    this.master.connect(floor).connect(comp).connect(top).connect(ctx.destination);

    // a small warm room: darker noise that loses its top end as it dies
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.2);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const k = 0.35 + 0.5 * Math.exp(-t * 6);
        lp += k * (Math.random() * 2 - 1 - lp);
        const tail = i > len * 0.85 ? 0.5 + 0.5 * Math.cos((Math.PI * (i - len * 0.85)) / (len * 0.15)) : 1;
        d[i] = lp * Math.exp(-t * 5.5) * (t < 0.008 ? t / 0.008 : 1) * tail;
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.send = ctx.createGain();
    this.send.gain.value = 0.2;
    const sendLp = ctx.createBiquadFilter();
    sendLp.type = 'lowpass';
    sendLp.frequency.value = 3500;
    this.send.connect(sendLp).connect(this.reverb).connect(this.master);

    const n = sr * 2;
    this.noise = ctx.createBuffer(1, n, sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    // pink noise (Paul Kellet's filter): soft and airy, for swishes
    this.pink = ctx.createBuffer(1, n, sr);
    const pd = this.pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // brown noise: muffled and round, for squishes, breath and room tone
    this.brown = ctx.createBuffer(1, n, sr);
    const bd = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }
    for (const b of [this.pink, this.brown]) removeDC(b.getChannelData(0));

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

  // A looping noise source that starts at `t`, somewhere random in the loop.
  src(buffer = this.noise, t = this.ctx.currentTime) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.loopStart = 0;
    s.loopEnd = buffer.duration;
    s.start(t, Math.random() * buffer.duration * 0.9);
    return s;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // A gain that stays silent until its envelope runs.
  silent() {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    return g;
  }

  // A one-shot envelope from exactly 0 back to exactly 0: a raised-cosine
  // rise over `attack`, then a smooth exponential fall over `decay` that
  // tapers the last of it to nothing.
  env(gain, t, peak, attack, decay) {
    attack = Math.max(0.003, attack);
    const total = attack + decay;
    const n = Math.max(32, Math.min(4096, Math.ceil(total * 2000)));
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = (i / (n - 1)) * total;
      let v;
      if (s < attack) v = 0.5 - 0.5 * Math.cos((Math.PI * s) / attack);
      else {
        const u = (s - attack) / decay;
        v = Math.exp(-4 * u) * (u > 0.75 ? 0.5 + 0.5 * Math.cos((Math.PI * (u - 0.75)) / 0.25) : 1);
      }
      curve[i] = v * peak;
    }
    curve[n - 1] = 0;
    gain.gain.setValueCurveAtTime(curve, t, total);
    return t + total;
  }

  // a short filtered noise burst; `lp` adds a low-pass after the filter
  burst({ t = this.ctx.currentTime, buffer = this.noise, type = 'bandpass', freq = 2000, q = 1, peak = 0.3, attack = 0.004, decay = 0.05, dest = this.bus, sweep = 0, lp = 0 }) {
    const n = this.src(buffer, t);
    const f = this.filter(type, freq, q);
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + attack + decay);
    const g = this.silent();
    const end = this.env(g, t, peak, attack, decay);
    let out = n.connect(f);
    if (lp) out = out.connect(this.filter('lowpass', lp, 0.5));
    out.connect(g).connect(dest);
    n.stop(end + 0.02);
  }

  // a tone; `glide` bends it to that frequency over `glideTime`
  tone({ t = this.ctx.currentTime, freq, type = 'sine', peak = 0.2, attack = 0.004, decay = 0.4, dest = this.bus, detune = 0, glide = 0, glideTime = 0.08 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + glideTime);
    o.detune.value = detune;
    const g = this.silent();
    const end = this.env(g, t, peak, attack, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(end + 0.02);
    return o;
  }

  // ------------------------------------------------------------ room

  startRoom() {
    const ctx = this.ctx;
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 1;
    this.roomGain.connect(this.master);
    const n = this.src(this.brown);
    const g = ctx.createGain();
    g.gain.value = 0.03;
    n.connect(this.filter('lowpass', 300)).connect(g).connect(this.roomGain);
  }

  // ------------------------------------------------------------ cutting

  // Start the sound of a blade in the cake. kind: chef, serrated, wire,
  // sword, server.
  cutStart(kind) {
    if (!this.ctx) return;
    this.cutStop(false);
    const t = this.ctx.currentTime;
    const b = BLADE[kind] || BLADE.chef;
    // the stroke through sponge and cream: soft pink noise, low-passed
    const n = this.src(this.pink, t);
    const bp = this.filter('bandpass', b.freq, b.q);
    const g = this.silent();
    n.connect(bp).connect(this.filter('lowpass', b.lp, 0.5)).connect(g).connect(this.bus);
    this.cut = { kind, b, n, bp, g, t0: t, level: 0 };
    // a wire slips in cleanly; blades squish into the frosting
    if (kind !== 'wire') this.squish(t, kind === 'sword' ? 0.6 : 1);
  }

  // The blade entering the cake: a soft, moist, muffled squish. Two grains
  // of pink noise through a resonant low-pass that closes as the blade
  // sinks, the second smaller, with a tiny wet bubble beneath.
  squish(t = this.ctx.currentTime, strength = 1) {
    for (const [dt, from, to, q, peak, attack, decay] of [
      [0, 1500, 380, 2.5, 0.38, 0.015, 0.15],
      [0.045, 950, 300, 3, 0.18, 0.01, 0.1],
    ]) {
      const at = t + dt;
      const n = this.src(this.pink, at);
      const f = this.filter('lowpass', from, q);
      f.frequency.setValueAtTime(from, at);
      f.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
      const g = this.silent();
      const end = this.env(g, at, peak * strength, attack, decay);
      n.connect(f).connect(g).connect(this.bus);
      n.stop(end + 0.02);
    }
    this.tone({ t: t + 0.02, freq: 240, glide: 150, glideTime: 0.09, peak: 0.04 * strength, attack: 0.012, decay: 0.1 });
  }

  // Called every frame while cutting: level 0..1 from how fast the blade is
  // moving; saw is the serrated knife's stroke (-1..1).
  cutLevel(level, dt, saw = 0) {
    const v = this.cut;
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    const l = Math.max(0, Math.min(1, level));
    const b = v.b;
    if (v.kind === 'wire') {
      // a clean, quiet zip: the band rises as the wire runs down
      const k = Math.min(1, (t - v.t0) / WIRE_PLUNGE);
      v.g.gain.setTargetAtTime(l * b.peak * (0.5 + 0.5 * k), t, 0.04);
      v.bp.frequency.setTargetAtTime(b.freq + 1100 * k, t, 0.05);
      return;
    }
    let target = l * b.peak;
    let freq = b.freq * (0.85 + 0.35 * l);
    if (v.kind === 'serrated') {
      // soft, rhythmic rasps: louder mid-stroke, a shade higher pushing
      // than pulling
      const s = Math.abs(saw);
      target *= 0.2 + 0.8 * s * s;
      freq = b.freq * (0.9 + 0.3 * l) + 120 * saw;
    }
    v.g.gain.setTargetAtTime(target, t, v.kind === 'serrated' ? 0.025 : 0.06);
    v.bp.frequency.setTargetAtTime(freq, t, 0.06);
    this.crumbs(l * (v.kind === 'serrated' ? 1.6 : v.kind === 'server' ? 0.8 : 1), dt);
  }

  // Crumbs breaking away: a faint, soft patter.
  crumbs(amount, dt) {
    if (!this.ctx) return;
    this.crumbClock -= dt * 16 * amount;
    const t = this.ctx.currentTime;
    while (this.crumbClock < 0) {
      this.crumbClock += 0.5 + Math.random();
      this.burst({
        t: t + Math.random() * 0.03,
        buffer: this.pink,
        type: 'bandpass',
        freq: rand(1100, 2400),
        q: 1.2,
        lp: 3500,
        peak: rand(0.04, 0.08),
        attack: 0.004,
        decay: rand(0.025, 0.05),
      });
    }
  }

  // The blade stops: a light tap if it met the board.
  cutStop(board = true) {
    const v = this.cut;
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.g.gain.setTargetAtTime(0, t, 0.035);
    v.n.stop(t + 0.4);
    this.cut = null;
    if (board) this.boardTap();
  }

  // the blade meeting the cake board: a light, dull tap
  boardTap() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ t, freq: 230, glide: 150, glideTime: 0.05, peak: 0.1, attack: 0.004, decay: 0.08 });
    this.burst({ t, buffer: this.pink, type: 'lowpass', freq: 1800, q: 0.7, peak: 0.08, attack: 0.003, decay: 0.03 });
  }

  // ------------------------------------------------------------ serving

  // a tool sliding under a slice: a soft shuffle
  scrape() {
    if (!this.ctx) return;
    this.burst({ buffer: this.pink, type: 'bandpass', freq: 650, q: 0.8, lp: 1600, peak: 0.11, attack: 0.06, decay: 0.3, sweep: 1.4 });
  }

  // air moving: a soft rising swell
  whoosh(strength = 0.5) {
    if (!this.ctx) return;
    this.burst({ buffer: this.pink, type: 'bandpass', freq: 320, q: 0.7, lp: 1500, peak: 0.16 * strength, attack: 0.1, decay: 0.32, sweep: 2.6 });
  }

  // porcelain set down gently: a soft knock and a few mellow partials
  clink(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ t, freq: 320, glide: 220, glideTime: 0.05, peak: 0.04 * strength, attack: 0.003, decay: 0.07 });
    this.burst({ t, buffer: this.pink, type: 'lowpass', freq: 2200, q: 0.7, peak: 0.03 * strength, attack: 0.003, decay: 0.02 });
    const base = 1480 + Math.random() * 80;
    for (const [k, a, d] of [
      [1, 0.04, 0.8],
      [2.46, 0.016, 0.45],
      [3.9, 0.005, 0.22],
    ]) {
      this.tone({ t, freq: base * k, peak: a * strength, attack: 0.004, decay: d });
    }
  }

  // a soft UI tap
  click() {
    if (!this.ctx) return;
    this.tone({ freq: 720, glide: 560, glideTime: 0.04, peak: 0.05, attack: 0.003, decay: 0.05 });
  }

  // ------------------------------------------------------------ candles

  match() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst({ t, buffer: this.pink, type: 'bandpass', freq: 2200, q: 0.8, lp: 5000, peak: 0.1, attack: 0.008, decay: 0.12 });
    for (let i = 0; i < 6; i++) {
      this.burst({ t: t + 0.04 + Math.random() * 0.12, buffer: this.pink, type: 'bandpass', freq: 2600, q: 1.2, lp: 5000, peak: 0.03, attack: 0.003, decay: 0.014 });
    }
    this.ignite(t + 0.1, 0.6);
  }

  ignite(t = this.ctx ? this.ctx.currentTime : 0, strength = 0.35) {
    if (!this.ctx) return;
    this.burst({ t, buffer: this.brown, type: 'lowpass', freq: 380, q: 0.5, peak: 0.26 * strength, attack: 0.035, decay: 0.3, sweep: 2 });
  }

  // A held breath across the candles.
  blowStart() {
    if (!this.ctx || this.breath) return;
    const n = this.src(this.pink);
    const f = this.filter('bandpass', 550, 0.5);
    const g = this.silent();
    n.connect(f).connect(this.filter('lowpass', 1500, 0.5)).connect(g).connect(this.bus);
    this.breath = { n, f, g };
  }

  blowLevel(level) {
    if (!this.breath) return;
    const t = this.ctx.currentTime;
    this.breath.g.gain.setTargetAtTime(level * 0.16, t, 0.07);
    this.breath.f.frequency.setTargetAtTime(480 + level * 420, t, 0.1);
  }

  blowStop() {
    if (!this.breath) return;
    const t = this.ctx.currentTime;
    this.breath.g.gain.setTargetAtTime(0, t, 0.08);
    this.breath.n.stop(t + 0.7);
    this.breath = null;
  }

  // a candle going out
  puff() {
    if (!this.ctx) return;
    this.burst({ buffer: this.brown, type: 'lowpass', freq: 650, q: 0.7, peak: 0.14, attack: 0.012, decay: 0.14, sweep: 0.45 });
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
        [4.2, 0.05, 0.25],
      ]) this.tone({ t, freq: f * k, peak: peak * a, attack: 0.004, decay: d });
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

  // two party poppers and paper settling
  confetti() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const d of [0, 0.09]) {
      this.burst({ t: t + d, buffer: this.pink, type: 'bandpass', freq: 1300, q: 0.7, lp: 5000, peak: 0.3, attack: 0.003, decay: 0.07 });
      this.tone({ t: t + d, freq: 140, glide: 90, glideTime: 0.06, peak: 0.14, attack: 0.003, decay: 0.08 });
    }
    for (let i = 0; i < 14; i++) {
      this.burst({ t: t + 0.15 + Math.random() * 1.4, buffer: this.pink, type: 'bandpass', freq: 2800, q: 0.8, lp: 6000, peak: 0.012, attack: 0.012, decay: 0.05 });
    }
  }

  // a soft twinkle, always in tune
  sparkle(count = 5, t = this.ctx ? this.ctx.currentTime : 0) {
    if (!this.ctx) return;
    for (let i = 0; i < count; i++) {
      const n = PENTA[Math.floor(Math.random() * PENTA.length)];
      this.tone({ t: t + i * 0.05 + Math.random() * 0.02, freq: midi(n), peak: 0.022, attack: 0.006, decay: 0.4 });
    }
  }

  ding() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ t, freq: 1568, peak: 0.07, decay: 0.8 });
    this.tone({ t, freq: 1568 * 2.76, peak: 0.012, decay: 0.25 });
  }

  // a served slice: higher and brighter for better slices and longer streaks
  success(quality = 1, streak = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const up = Math.min(streak - 1, 8);
    const notes = quality > 0.93 ? [0, 4, 7, 12] : [0, 7];
    notes.forEach((k, i) => this.tone({ t: t + i * 0.07, freq: midi(76 + up + k), peak: 0.07, decay: 0.5 }));
  }

  // A slice hopping out of the cake: a soft, round "boop" that bends up,
  // a smaller bubble after it and a breath of air.
  pop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone({ t, freq: 300, glide: 620, glideTime: 0.07, peak: 0.17, attack: 0.008, decay: 0.16 });
    this.tone({ t, freq: 600, glide: 1240, glideTime: 0.07, peak: 0.025, attack: 0.008, decay: 0.08 });
    this.tone({ t: t + 0.09, freq: 470, glide: 900, glideTime: 0.06, peak: 0.08, attack: 0.008, decay: 0.12 });
    this.burst({ t, buffer: this.brown, type: 'lowpass', freq: 500, q: 0.7, peak: 0.1, attack: 0.008, decay: 0.08 });
  }

  // A slice landing on its plate: a little marimba ta-da and a twinkle.
  cheer() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.04;
    [72, 76, 79, 84].forEach((n, i) => {
      const at = t + i * 0.075;
      const last = i === 3;
      this.tone({ t: at, freq: midi(n), peak: last ? 0.085 : 0.065, attack: 0.005, decay: last ? 0.7 : 0.35 });
      // the mallet: a quiet, short fourth partial
      this.tone({ t: at, freq: midi(n) * 3.98, peak: 0.008, attack: 0.004, decay: 0.05 });
    });
    this.tone({ t: t + 0.225, freq: midi(76), peak: 0.03, attack: 0.01, decay: 0.6 });
    this.tone({ t: t + 0.225, freq: midi(79), peak: 0.03, attack: 0.01, decay: 0.6 });
    this.sparkle(3, t + 0.3);
  }

  miss() {
    if (!this.ctx) return;
    this.tone({ freq: 330, glide: 200, glideTime: 0.3, type: 'triangle', peak: 0.07, decay: 0.35 });
  }

  tick() {
    if (!this.ctx) return;
    this.tone({ freq: 1200, peak: 0.04, attack: 0.003, decay: 0.05 });
  }

  fanfare(level = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 72 + Math.min(level, 4) * 2;
    [0, 4, 7, 12, 16].forEach((k, i) => {
      this.tone({ t: t + i * 0.08, freq: midi(base + k), type: 'triangle', peak: 0.08, decay: 0.6 });
      this.tone({ t: t + i * 0.08, freq: midi(base + k) * 2, peak: 0.012, decay: 0.3 });
    });
  }
}

// Take out any slow drift so a looped noise buffer has no DC in it.
function removeDC(d) {
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i];
  const m = sum / d.length;
  for (let i = 0; i < d.length; i++) d[i] -= m;
}
