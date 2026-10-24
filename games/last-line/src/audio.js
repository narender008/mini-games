// Last Line sound: every sound is synthesised with Web Audio, no files.
// Graph: one-shots and loops -> bus low-pass (hurt() muffles it) -> master
// gain -> compressor -> destination, with a shared convolver reverb whose
// impulse is generated decaying noise. One-shots pass through _gate(), which
// throttles each sound and caps live voices so 30+ calls a second never pile up.

const MAX_VOICES = 28;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Sound {
  constructor() {
    this._ctx = null;
    this._muted = false;
    this._vol = 0.8;
    this._paused = false;
    this._gates = {};
    this._live = [];
    this._lv = {}; // last values sent to continuous params
  }

  get ctx() { return this._ctx; }
  get muted() { return this._muted; }

  // Call from a user gesture; later calls just resume.
  unlock() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this._ctx = new AC({ latencyHint: 'interactive' });
      this._build();
    }
    if (this._ctx.state === 'suspended' && !this._paused) this._ctx.resume();
  }

  setMuted(m) {
    this._muted = !!m;
    this._applyGain();
  }

  setVolume(v) {
    this._vol = clamp01(+v || 0);
    this._applyGain();
  }

  suspend() {
    this._paused = true;
    if (this._ctx && this._ctx.state === 'running') this._ctx.suspend();
  }

  resume() {
    this._paused = false;
    if (this._ctx && this._ctx.state !== 'running') this._ctx.resume();
  }

  _applyGain() {
    if (!this._ctx) return;
    const g = this._muted ? 0 : this._vol;
    this.master.gain.setTargetAtTime(g, this._ctx.currentTime, 0.03);
  }

  // ---------- graph and buffers ----------

  _build() {
    const ctx = this._ctx;
    const sr = ctx.sampleRate;

    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this._vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    // everything else enters here; hurt() sweeps this filter down briefly
    this.busLP = this._filter('lowpass', 18000, 0.5);
    this.busLP.connect(this.master);
    this.bus = this.busLP;

    // white and brown noise, 2 s each
    const n = sr * 2;
    this.white = ctx.createBuffer(1, n, sr);
    this.brown = ctx.createBuffer(1, n, sr);
    const w = this.white.getChannelData(0);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }

    // reverb: stereo decaying noise, darker as it fades
    const len = Math.floor(sr * 2.6);
    const ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        const a = 0.5 - 0.45 * k; // one-pole coefficient falls over time
        lp += a * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - k, 2.4);
      }
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.verb.connect(wet).connect(this.bus);

    // grit: soft clip for gun and blast bodies
    this.grit = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 3) / Math.tanh(3);
    }
    this.grit.curve = curve;
    this.grit.oversample = '2x';
    this.grit.connect(this.bus);

    // click trains for loops: overheat ticking and tank treads
    this.tickBuf = this._clickBuffer(1, 8, 0.003, false);
    this.treadBuf = this._clickBuffer(1, 6, 0.025, true);

    this._buildLoops();
  }

  // A 'secs' long buffer holding 'count' decaying noise clicks, loopable.
  _clickBuffer(secs, count, decay, jitter) {
    const sr = this._ctx.sampleRate;
    const n = Math.floor(sr * secs);
    const buf = this._ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let k = 0; k < count; k++) {
      const at = Math.floor((k + (jitter ? rnd(-0.15, 0.15) : 0)) * n / count + n) % n;
      const amp = jitter ? rnd(0.5, 1) : 1;
      const len = Math.floor(sr * decay * 6);
      for (let i = 0; i < len; i++) {
        const j = (at + i) % n;
        d[j] += amp * (Math.random() * 2 - 1) * Math.exp(-i / (sr * decay));
      }
    }
    return buf;
  }

  _buildLoops() {
    const ctx = this._ctx;
    const loop = (buf, rate = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(0, Math.random() * buf.duration);
      return s;
    };
    const gain = (v, dest) => {
      const g = ctx.createGain();
      g.gain.value = v;
      if (dest) g.connect(dest);
      return g;
    };
    const osc = (type, f) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      return o;
    };

    // rain: two noise bands, always on
    const rainG = gain(0, this.bus);
    loop(this.white).connect(this._filter('highpass', 900, 0.4))
      .connect(this._filter('lowpass', 7500, 0.5)).connect(gain(0.05, rainG));
    loop(this.white, 0.7).connect(this._filter('bandpass', 1400, 0.6)).connect(gain(0.035, rainG));
    this.rainG = rainG;

    // wind: band of noise whose centre drifts with a slow LFO
    const windF = this._filter('bandpass', 380, 0.9);
    const lfo = osc('sine', 0.11);
    lfo.connect(gain(160, windF.frequency));
    this.windG = gain(0, this.bus);
    loop(this.white, 0.5).connect(windF).connect(this.windG);

    // distant rumble: brown noise kept very low
    this.rumbleG = gain(0, this.bus);
    loop(this.brown, 0.6).connect(this._filter('lowpass', 85, 0.7)).connect(this.rumbleG);

    // MG barrel spin: mechanical whine plus motor hum
    this.whine = osc('sawtooth', 200);
    this.whineF = this._filter('bandpass', 600, 4);
    this.whineG = gain(0, this.bus);
    this.whine.connect(this.whineF).connect(this.whineG);
    this.motor = osc('square', 55);
    this.motorG = gain(0, this.bus);
    this.motor.connect(this._filter('lowpass', 320, 1)).connect(this.motorG);

    // overheat: hiss and a ticking that speeds up
    this.hissG = gain(0, this.bus);
    loop(this.white, 1.3).connect(this._filter('highpass', 4200, 0.7)).connect(this.hissG);
    this.tick = loop(this.tickBuf, 0.5);
    this.tickG = gain(0, this.bus);
    this.tick.connect(this._filter('bandpass', 3200, 2)).connect(this.tickG);

    // boss treads: clanking click train plus a diesel growl
    this.tread = loop(this.treadBuf, 0.6);
    this.treadG = gain(0, this.bus);
    this.tread.connect(this._filter('bandpass', 750, 1.6)).connect(this.treadG);
    this.diesel = osc('sawtooth', 38);
    this.dieselG = gain(0, this.bus);
    this.diesel.connect(this._filter('lowpass', 210, 2)).connect(this.dieselG);
  }

  // ---------- helpers ----------

  _filter(type, f, q) {
    const n = this._ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    return n;
  }

  // Throttle: min gap per sound, cap per sound and overall. Returns start time or -1.
  _gate(key, gap, cap, dur) {
    const ctx = this._ctx;
    if (!ctx || this._muted || ctx.state !== 'running') return -1;
    const t = ctx.currentTime;
    const g = this._gates[key] || (this._gates[key] = { last: -1e9, ends: [] });
    if (t - g.last < gap) return -1;
    g.ends = g.ends.filter((e) => e > t);
    if (g.ends.length >= cap) return -1;
    this._live = this._live.filter((e) => e > t);
    if (this._live.length >= MAX_VOICES) return -1;
    g.last = t;
    g.ends.push(t + dur);
    this._live.push(t + dur);
    return t + 0.005;
  }

  // Voice output: gain -> panner -> dest (bus or grit), with optional reverb send.
  _out(pan = 0, vol = 1, wet = 0, dest = this.bus) {
    const ctx = this._ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    g.connect(p).connect(dest);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      p.connect(s).connect(this.verb);
    }
    g.panner = p;
    return g;
  }

  // Envelope node: fast attack to peak, exponential decay.
  _env(t, peak, a, d, dest) {
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest);
    return g;
  }

  _noise(t, dur, dest, brown = false, rate = 1) {
    const s = this._ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.white;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  _osc(t, dur, type, f, dest) {
    const o = this._ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // Pitch drop from f0 to f1 over d seconds (sine thump).
  _thump(t, f0, f1, peak, d, dest, type = 'sine') {
    const o = this._osc(t, d, type, f0, this._env(t, peak, 0.002, d, dest));
    o.frequency.exponentialRampToValueAtTime(f1, t + d);
    return o;
  }

  // Filtered noise burst; returns the filter so callers can sweep it.
  _burst(t, type, f, q, peak, a, d, dest, brown = false) {
    const fl = this._filter(type, f, q);
    fl.connect(this._env(t, peak, a, d, dest));
    this._noise(t, a + d, fl, brown);
    return fl;
  }

  // Cheap continuous param ramp, skipped when unchanged.
  _set(key, param, v, tc = 0.06) {
    if (Math.abs((this._lv[key] ?? -1) - v) < 0.002) return;
    this._lv[key] = v;
    param.setTargetAtTime(v, this._ctx.currentTime, tc);
  }

  _running() {
    return this._ctx && this._ctx.state === 'running';
  }

  // ---------- continuous layers ----------

  spin(level) {
    if (!this._running()) return;
    const l = clamp01(level);
    this._set('wf', this.whine.frequency, 180 + l * 1500, 0.08);
    this._set('wbf', this.whineF.frequency, 300 + l * 2200, 0.08);
    this._set('wg', this.whineG.gain, l * l * 0.06, 0.05);
    this._set('mf', this.motor.frequency, 45 + l * 75, 0.08);
    this._set('mg', this.motorG.gain, Math.min(1, l * 3) * 0.05, 0.05);
  }

  heat(level) {
    if (!this._running()) return;
    const l = clamp01(level);
    this._set('hg', this.hissG.gain, l * l * l * 0.12, 0.1);
    const k = clamp01((l - 0.55) / 0.45);
    this._set('tr', this.tick.playbackRate, 0.5 + k * 2.2, 0.1);
    this._set('tg', this.tickG.gain, k * k * 0.35, 0.08);
  }

  ambience(intensity) {
    if (!this._running()) return;
    const i = clamp01(intensity);
    this._set('rain', this.rainG.gain, 1, 1.5);
    this._set('wind', this.windG.gain, 0.012 + i * 0.07, 0.6);
    this._set('rumb', this.rumbleG.gain, 0.05 + i * 0.25, 0.6);
  }

  bossTreads(level) {
    if (!this._running()) return;
    const l = clamp01(level);
    this._set('trr', this.tread.playbackRate, 0.5 + l * 0.9, 0.15);
    this._set('trg', this.treadG.gain, l * 0.3, 0.1);
    this._set('df', this.diesel.frequency, 34 + l * 22, 0.2);
    this._set('dg', this.dieselG.gain, l * 0.1, 0.15);
  }

  // ---------- one-shots ----------

  shot(pan = 0) {
    const t = this._gate('shot', 0.028, 6, 0.35);
    if (t < 0) return;
    const r = rnd(0.9, 1.1);
    const out = this._out(pan, 0.7, 0.18, this.grit);
    this._burst(t, 'highpass', 1600 * r, 0.7, 0.9, 0.001, 0.045, out);
    this._burst(t, 'lowpass', 1100 * r, 0.8, 0.7, 0.002, 0.11, out, true);
    this._thump(t, 130 * r, 42, 1.0, 0.16, out);
  }

  drone(pan = 0) {
    const t = this._gate('drone', 0.03, 4, 0.15);
    if (t < 0) return;
    const r = rnd(0.9, 1.15);
    const out = this._out(pan, 0.3, 0.08);
    this._burst(t, 'highpass', 2800 * r, 0.8, 0.8, 0.001, 0.03, out);
    this._thump(t, 240 * r, 90, 0.6, 0.06, out);
  }

  casing() {
    const t0 = this._gate('casing', 0.06, 4, 0.4);
    if (t0 < 0) return;
    const out = this._out(rnd(-0.3, 0.3), 0.05);
    const t = t0 + rnd(0.08, 0.18);
    for (let i = 0; i < 2; i++) {
      const tt = t + i * rnd(0.04, 0.09);
      const f = rnd(3200, 5600);
      this._osc(tt, 0.08, 'sine', f, this._env(tt, 1 - i * 0.4, 0.001, 0.06, out));
      this._osc(tt, 0.05, 'sine', f * 1.48, this._env(tt, 0.4, 0.001, 0.035, out));
    }
    this._burst(t + 0.12, 'bandpass', 900, 1.2, 0.5, 0.002, 0.05, out); // wet splat
  }

  overheat() {
    const t = this._gate('overheat', 0.5, 1, 1.6);
    if (t < 0) return;
    const out = this._out(0, 0.6, 0.25);
    const hiss = this._burst(t + 0.05, 'highpass', 2500, 0.6, 0.35, 0.06, 1.3, out);
    hiss.frequency.exponentialRampToValueAtTime(5000, t + 1.3);
    // clank: two inharmonic squares through a band
    const bp = this._filter('bandpass', 700, 3);
    bp.connect(this._env(t, 0.6, 0.001, 0.18, out));
    this._osc(t, 0.2, 'square', 183, bp);
    this._osc(t, 0.2, 'square', 271, bp);
    this._burst(t, 'bandpass', 2000, 1, 0.6, 0.001, 0.03, out);
  }

  hit(pan = 0) {
    const t = this._gate('hit', 0.025, 5, 0.12);
    if (t < 0) return;
    const out = this._out(pan, 0.45);
    this._burst(t, 'lowpass', rnd(500, 750), 1, 0.9, 0.002, 0.07, out);
    this._thump(t, rnd(95, 115), 50, 0.7, 0.08, out);
  }

  ping(pan = 0) {
    const t = this._gate('ping', 0.04, 4, 0.5);
    if (t < 0) return;
    const out = this._out(pan, 0.25, 0.25);
    const r = rnd(0.85, 1.2);
    this._burst(t, 'highpass', 3500, 0.7, 0.8, 0.001, 0.02, out);
    for (const [f, a, d] of [[2100, 0.5, 0.25], [3170, 0.35, 0.18], [4430, 0.25, 0.12]]) {
      const o = this._osc(t, d, 'sine', f * r, this._env(t, a, 0.001, d, out));
      o.frequency.exponentialRampToValueAtTime(f * r * 0.94, t + d);
    }
    if (Math.random() < 0.5) { // ricochet whine
      const o = this._osc(t, 0.3, 'sine', 3400 * r, this._env(t + 0.01, 0.12, 0.02, 0.26, out));
      o.frequency.exponentialRampToValueAtTime(1300 * r, t + 0.3);
    }
  }

  death(pan = 0) {
    const t = this._gate('death', 0.05, 4, 0.4);
    if (t < 0) return;
    const out = this._out(pan, 0.55, 0.06);
    this._burst(t, 'lowpass', 320, 0.8, 0.9, 0.004, 0.22, out, true);
    this._thump(t, 75, 34, 0.8, 0.2, out);
    const sq = this._burst(t + 0.03, 'bandpass', 700, 2, 0.35, 0.01, 0.16, out);
    sq.frequency.exponentialRampToValueAtTime(250, t + 0.2); // mud squelch
  }

  explosion(size = 0.5, pan = 0) {
    const s = clamp01(size);
    const dur = 0.6 + s * 1.8;
    const t = this._gate('explosion', 0.05, 5, dur);
    if (t < 0) return;
    const out = this._out(pan, 0.6 + s * 0.4, 0.35 + s * 0.3, this.grit);
    this._burst(t, 'highpass', 1200, 0.6, 0.8, 0.001, 0.05 + s * 0.05, out);
    const body = this._burst(t, 'lowpass', 2400 - s * 800, 0.7, 1, 0.003, 0.4 + s * 1.3, out, true);
    body.frequency.exponentialRampToValueAtTime(120, t + 0.4 + s * 1.2);
    this._thump(t, 95 - s * 35, 24, 1, 0.35 + s * 1.0, out);
    // debris crackle: a few short grains after the blast
    const grains = 4 + Math.round(s * 10);
    const dbr = this._out(pan, 0.25 + s * 0.15, 0.3);
    for (let i = 0; i < grains; i++) {
      const tt = t + rnd(0.08, 0.25 + s * 0.8);
      this._burst(tt, 'bandpass', rnd(1500, 4500), 1.5, rnd(0.3, 0.9), 0.001, rnd(0.01, 0.03), dbr);
    }
  }

  artillery(dist = 1) {
    const d = clamp01(dist);
    const dur = 1 + d * 2.5;
    const t = this._gate('artillery', 0.3, 3, dur);
    if (t < 0) return;
    const tt = t + d * 0.15;
    const out = this._out(rnd(-0.7, 0.7), 0.7 - d * 0.35, 0.5 + d * 0.3);
    const lp = this._filter('lowpass', 500 - d * 330, 0.7);
    lp.connect(out);
    this._burst(tt, 'lowpass', 900, 0.5, 1, 0.01 + d * 0.05, 0.5 + d * 2, lp, true);
    this._thump(tt, 70 - d * 25, 22, 0.9, 0.6 + d * 1.6, lp);
  }

  whistle() {
    const t = this._gate('whistle', 0.4, 2, 1.1);
    if (t < 0) return;
    const out = this._out(rnd(-0.5, 0.5), 0.14, 0.3);
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.02);
    g.connect(out);
    const f0 = rnd(1700, 2000);
    const o = this._osc(t, 1.05, 'sine', f0, g);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.32, t + 1.0);
    const vd = this._ctx.createGain(); // slight wobble as it tumbles
    vd.gain.value = 18;
    vd.connect(o.frequency);
    this._osc(t, 1.05, 'sine', 9, vd);
    const air = this._filter('bandpass', f0, 6);
    air.frequency.exponentialRampToValueAtTime(f0 * 0.32, t + 1.0);
    air.connect(g);
    this._noise(t, 1.05, air);
  }

  lineHit() {
    const t = this._gate('lineHit', 0.08, 3, 0.8);
    if (t < 0) return;
    const out = this._out(rnd(-0.4, 0.4), 0.55, 0.2);
    this._burst(t, 'bandpass', 520, 0.9, 1, 0.003, 0.2, out, true); // sandbag crunch
    for (let i = 0; i < 3; i++) {
      this._burst(t + rnd(0, 0.06), 'bandpass', rnd(1200, 2600), 1.4, 0.4, 0.001, 0.025, out);
    }
    // wire twang: resonant saw with a small pitch sag
    const f = rnd(105, 150);
    const bp = this._filter('bandpass', f * 6, 8);
    bp.connect(this._env(t + 0.01, 0.4, 0.002, 0.6, out));
    const o = this._osc(t + 0.01, 0.65, 'sawtooth', f, bp);
    o.frequency.exponentialRampToValueAtTime(f * 0.93, t + 0.6);
  }

  hurt() {
    const t = this._gate('hurt', 0.15, 2, 0.6);
    if (t < 0) return;
    const out = this._out(0, 0.7);
    this._burst(t, 'lowpass', 260, 0.8, 1, 0.003, 0.28, out, true);
    this._thump(t, 62, 32, 0.9, 0.3, out);
    // muffle the whole mix for a moment
    const f = this.busLP.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(700, t + 0.03);
    f.exponentialRampToValueAtTime(18000, t + 0.7);
  }

  siren() {
    const t = this._gate('siren', 2, 1, 2.6);
    if (t < 0) return;
    const out = this._out(0, 0.13, 0.45);
    const lp = this._filter('lowpass', 1800, 0.8);
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.5);
    g.gain.setValueAtTime(1, t + 1.6);
    g.gain.linearRampToValueAtTime(0.0001, t + 2.5);
    lp.connect(g).connect(out);
    for (const det of [0, 7]) {
      const o = this._osc(t, 2.55, det ? 'triangle' : 'sawtooth', 200, lp);
      o.detune.value = det;
      o.frequency.exponentialRampToValueAtTime(610, t + 1.1);
      o.frequency.setValueAtTime(610, t + 1.5);
      o.frequency.exponentialRampToValueAtTime(190, t + 2.5);
    }
  }

  waveClear() {
    const t = this._gate('waveClear', 1, 1, 2);
    if (t < 0) return;
    const out = this._out(0, 0.09, 0.45);
    const lp = this._filter('lowpass', 300, 1.2);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(1600, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(500, t + 1.4);
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.09);
    g.gain.setTargetAtTime(0.6, t + 0.2, 0.3);
    g.gain.setTargetAtTime(0.0001, t + 1.0, 0.25);
    lp.connect(g).connect(out);
    // D, A, D, F#, A: low and open, major on top
    for (const f of [73.42, 110, 146.83, 185, 220]) {
      for (const det of [-6, 6]) {
        this._osc(t, 1.9, 'sawtooth', f, lp).detune.value = det;
      }
    }
  }

  click() {
    const t = this._gate('click', 0.03, 2, 0.05);
    if (t < 0) return;
    const out = this._out(0, 0.15);
    this._osc(t, 0.03, 'square', 1700, this._env(t, 0.5, 0.001, 0.02, out));
    this._burst(t, 'highpass', 3000, 0.7, 0.6, 0.001, 0.012, out);
  }

  pick() {
    const t = this._gate('pick', 0.1, 1, 0.9);
    if (t < 0) return;
    const out = this._out(0, 0.25, 0.3);
    for (let i = 0; i < 5; i++) {
      this._burst(t + i * 0.032, 'bandpass', 2400 - i * 150, 2, 0.7, 0.001, 0.015, out);
    }
    const tc = t + 0.18;
    for (const [f, a] of [[880, 0.35], [1320, 0.2], [2640, 0.08]]) {
      this._osc(tc, 0.7, 'sine', f, this._env(tc, a, 0.003, 0.65, out));
    }
  }

  burn() {
    const t = this._gate('burn', 0.2, 2, 0.7);
    if (t < 0) return;
    const out = this._out(rnd(-0.3, 0.3), 0.45, 0.2);
    const bp = this._burst(t, 'bandpass', 300, 1, 0.8, 0.08, 0.5, out);
    bp.frequency.exponentialRampToValueAtTime(2500, t + 0.35);
    this._burst(t, 'lowpass', 400, 0.7, 0.8, 0.05, 0.55, out, true);
  }

  airstrikeCall() {
    const t = this._gate('airstrike', 1, 1, 0.8);
    if (t < 0) return;
    const out = this._out(0, 0.22, 0.1);
    const radio = this._filter('bandpass', 1800, 1.5);
    radio.connect(out);
    this._burst(t, 'highpass', 600, 0.5, 0.8, 0.005, 0.12, radio);
    for (const dt of [0.22, 0.42]) {
      const g = this._ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.linearRampToValueAtTime(0.7, t + dt + 0.005);
      g.gain.setValueAtTime(0.7, t + dt + 0.1);
      g.gain.linearRampToValueAtTime(0.0001, t + dt + 0.11);
      g.connect(radio);
      this._osc(t + dt, 0.12, 'square', 1050, g);
    }
    this._burst(t + 0.62, 'highpass', 600, 0.5, 0.5, 0.003, 0.08, radio);
  }

  jet() {
    const t = this._gate('jet', 1.5, 1, 2.3);
    if (t < 0) return;
    const out = this._out(-1, 0.5, 0.3);
    out.panner.pan.setValueAtTime(-1, t);
    out.panner.pan.linearRampToValueAtTime(1, t + 2.1);
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    g.connect(out);
    const bp = this._filter('bandpass', 700, 0.8);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.95);
    bp.frequency.exponentialRampToValueAtTime(600, t + 2.1); // doppler
    bp.connect(g);
    this._noise(t, 2.25, bp);
    const roar = this._filter('lowpass', 280, 0.7);
    roar.connect(g);
    this._noise(t, 2.25, roar, true);
    const w = this._ctx.createGain();
    w.gain.value = 0.04;
    w.connect(g);
    const o = this._osc(t, 2.25, 'sawtooth', 1400, w);
    o.frequency.setValueAtTime(1400, t + 0.9);
    o.frequency.exponentialRampToValueAtTime(520, t + 1.4);
  }

  cannon() {
    const t = this._gate('cannon', 0.4, 2, 2.4);
    if (t < 0) return;
    const out = this._out(rnd(-0.2, 0.2), 1, 0.6, this.grit);
    this._burst(t, 'highpass', 900, 0.6, 0.9, 0.001, 0.08, out);
    const body = this._burst(t, 'lowpass', 1300, 0.8, 1, 0.003, 1.9, out, true);
    body.frequency.exponentialRampToValueAtTime(90, t + 1.6);
    this._thump(t, 62, 20, 1, 1.6, out);
    this._thump(t, 140, 40, 0.5, 0.25, out, 'triangle');
  }

  barrier() {
    const t = this._gate('barrier', 0.2, 2, 1.1);
    if (t < 0) return;
    const out = this._out(rnd(-0.2, 0.2), 0.45, 0.35);
    this._burst(t, 'bandpass', 850, 1.2, 1, 0.001, 0.15, out);
    this._thump(t, 78, 38, 0.9, 0.25, out);
    // steel ring: inharmonic partials
    for (const [f, a, d] of [[141, 0.35, 0.9], [233, 0.25, 0.7], [377, 0.18, 0.55], [612, 0.1, 0.4]]) {
      this._osc(t, d, 'triangle', f * rnd(0.98, 1.02), this._env(t, a, 0.002, d, out));
    }
  }
}
