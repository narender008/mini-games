// A cheerful little tune, played by a step sequencer on synthesised
// instruments: marimba melody, plucked ukulele-style chords, a round bass,
// and soft kick, clap and shaker. It loops every eight bars.
const BPM = 112;

const n = (name) => {
  const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const semis = map[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
};

// eight bars of eight eighth-notes; '-' holds, '.' rests
const MELODY = [
  'E5 G5 E5 C5 D5 E5 G5 -',
  'D5 G5 D5 B4 C5 D5 G5 -',
  'C5 E5 A5 G5 E5 C5 D5 E5',
  'F5 A5 C6 A5 G5 F5 E5 D5',
  'E5 G5 C6 G5 E5 G5 C6 -',
  'D5 G5 B5 G5 D5 G5 B5 -',
  'A5 G5 E5 C5 D5 E5 G5 A5',
  'F5 E5 D5 C5 D5 - C5 -',
].map((bar) => bar.split(' '));

const CHORDS = [
  ['C4', 'E4', 'G4'],
  ['B3', 'D4', 'G4'],
  ['C4', 'E4', 'A4'],
  ['C4', 'F4', 'A4'],
  ['C4', 'E4', 'G4'],
  ['B3', 'D4', 'G4'],
  ['C4', 'E4', 'A4'],
  ['C4', 'F4', 'A4'],
].map((c) => c.map(n));
const BASS = ['C3', 'G2', 'A2', 'F2', 'C3', 'G2', 'A2', 'F2'].map(n);

export class Music {
  constructor(ctx, master, verb, noise) {
    this.ctx = ctx;
    this.noise = noise;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.3;
    this.bus.connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    this.bus.connect(send).connect(verb);
    this.step = 0;
    this.next = 0;
    this.timer = null;
    this.setTempo(BPM);
  }

  // eighth-note length from beats per minute (Big Kid plays it faster)
  setTempo(bpm) {
    this.stepLen = 60 / bpm / 2;
  }

  start() {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 30);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  // duck the music (e.g. under a fanfare) for a moment
  duck(amount = 0.4, time = 1.2) {
    const g = this.bus.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.3 * amount, t, 0.05);
    g.setTargetAtTime(0.3, t + time, 0.4);
  }

  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      this.next = ctx.currentTime + 0.1;
      return;
    }
    while (this.next < ctx.currentTime + 0.15) {
      this.play(this.step, this.next);
      this.step = (this.step + 1) % 64;
      this.next += this.stepLen;
    }
  }

  play(step, t) {
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const note = MELODY[bar][beat];
    if (note !== '-' && note !== '.') {
      let len = 1;
      while (beat + len < 8 && MELODY[bar][beat + len] === '-') len++;
      this.marimba(n(note), t, this.stepLen * len);
    }
    if (beat % 2 === 1) this.strum(CHORDS[bar], t);
    if (beat === 0 || beat === 4) this.bass(BASS[bar], t, beat === 0 ? 1 : 1.5);
    if (beat === 0 || beat === 4) this.kick(t);
    if (beat === 2 || beat === 6) this.clap(t);
    this.shaker(t, beat % 2 ? 0.6 : 1);
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  osc(type, f, t, a, peak, d, dest = this.bus) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = this.ctx.createGain();
    this.env(g, t, a, peak, d);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.05);
    return o;
  }

  marimba(f, t, len) {
    this.osc('sine', f, t, 0.004, 0.22, Math.min(0.9, 0.35 + len));
    this.osc('sine', f * 4, t, 0.002, 0.05, 0.06);
    this.osc('triangle', f * 2, t, 0.003, 0.04, 0.15);
  }

  strum(chord, t) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    lp.connect(this.bus);
    chord.forEach((f, i) => this.osc('sawtooth', f, t + i * 0.012, 0.003, 0.03, 0.22, lp));
  }

  bass(f, t, mul) {
    this.osc('triangle', f * mul, t, 0.01, 0.2, 0.32);
    this.osc('sine', f * mul, t, 0.01, 0.15, 0.3);
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, 0.22, 0.16);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.2);
  }

  noiseBurst(t, type, f, peak, d) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const fl = this.ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, peak, d);
    s.connect(fl).connect(g).connect(this.bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + d + 0.02);
  }

  clap(t) {
    this.noiseBurst(t, 'bandpass', 1500, 0.07, 0.09);
  }

  shaker(t, k) {
    this.noiseBurst(t, 'highpass', 7000, 0.025 * k, 0.05);
  }
}
