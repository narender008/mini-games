// A quiet music box over a soft pad: an original tune in C major that
// wanders through a few gentle chord changes, the melody picked from the
// chord's notes and the pentatonic scale, so it never repeats exactly and
// never clashes. Scheduled a little ahead of time on the audio clock.
const BPM = 76;
const CHORDS = [
  [261.63, 329.63, 392.0],
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [196.0, 246.94, 293.66],
];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export class Music {
  constructor(ctx, dest, verb) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.send = ctx.createGain();
    this.send.gain.value = 0.9;
    this.out.connect(this.send).connect(verb);
    this.level = 0.7;
    this.playing = false;
    this.beat = 0;
    this.nextTime = 0;
    this.last = 4;
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.nextTime = this.ctx.currentTime + 0.3;
    this.out.gain.setTargetAtTime(0.16 * this.level, this.ctx.currentTime, 1.5);
  }

  setLevel(l) {
    this.level = l;
    if (this.playing) this.out.gain.setTargetAtTime(0.16 * l, this.ctx.currentTime, 1.2);
  }

  update() {
    if (!this.playing) return;
    const ctx = this.ctx;
    const spb = 60 / BPM / 2; // eighth notes
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.step(this.beat, this.nextTime);
      this.beat++;
      this.nextTime += spb;
    }
  }

  step(b, t) {
    const bar = Math.floor(b / 8);
    const chord = CHORDS[bar % CHORDS.length];
    const pos = b % 8;
    if (pos === 0) for (const f of chord) this.pad(f / 2, t, (60 / BPM) * 4);
    // melody: a note on most beats, resting now and then
    const rest = pos % 2 === 1 ? Math.random() < 0.55 : Math.random() < 0.12;
    if (!rest) {
      let i = this.last + Math.round((Math.random() - 0.5) * 3);
      i = Math.max(0, Math.min(PENTA.length - 1, i));
      // lean on chord tones on the strong beats
      if (pos % 4 === 0) {
        const tones = PENTA.map((f, k) => [k, chord.some((c) => Math.abs(Math.log2(f / c) % 1) < 0.02 || Math.abs((Math.log2(f / c) % 1) - 1) < 0.02 || Math.abs((Math.log2(f / c) % 1) + 1) < 0.02)]).filter((x) => x[1]).map((x) => x[0]);
        if (tones.length) i = tones.reduce((a, k) => (Math.abs(k - this.last) < Math.abs(a - this.last) ? k : a), tones[0]);
      }
      this.last = i;
      this.box(PENTA[i], t, pos % 4 === 0 ? 0.5 : 0.35);
    }
  }

  box(freq, t, v) {
    const ctx = this.ctx;
    for (const [m, a, d] of [[1, 1, 1.4], [3.0, 0.18, 0.4], [5.2, 0.06, 0.2]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * a, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  pad(freq, t, dur) {
    const ctx = this.ctx;
    for (const det of [-7, 5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
      o.connect(f).connect(g).connect(this.out);
      o.start(t);
      o.stop(t + dur * 1.1);
    }
  }
}
