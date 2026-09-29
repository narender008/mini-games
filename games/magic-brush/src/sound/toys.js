// The toys' sounds, synthesised with Web Audio through the game's own Audio
// object (its effects bus, noise buffers and bells): soft pops, boings and
// bops, a munch, chimes and sparkles, a warm hum for a petted friend. All
// gentle, none of it a voice. Every sound goes quiet with the mute switch
// (the Audio master gain), and each kind is rate-limited so a burst of pops
// or bounces can never pile up into a racket.
import { rand, clamp } from '../config.js';
import { glide, puff } from './calls.js';

const CHIME = { call: [1046.5, 1318.5, 1568, 2093], cheer: [1046.5, 1318.5, 1568, 2093, 2637], welcome: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093] };

export class ToySounds {
  constructor(audio) {
    this.a = audio;
    this.at = {};
  }

  // may this kind of sound play now (ready, and not again within `gap` seconds)?
  ok(name, gap = 0.05) {
    const a = this.a;
    if (!a.ready || !a.ctx) return false;
    const t = a.ctx.currentTime;
    if (t - (this.at[name] ?? -9) < gap) return false;
    this.at[name] = t;
    return true;
  }

  // a short burst of filtered noise (a tick, a crunch, a whoosh)
  noise(t, { from = 2000, to = from, q = 1, dur = 0.03, v = 0.08, type = 'bandpass', buf = 'white' } = {}) {
    const a = this.a;
    const ctx = a.ctx;
    const n = ctx.createBufferSource();
    n.buffer = a[buf];
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.006, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(a.sfx);
    n.start(t, Math.random());
    n.stop(t + dur + 0.02);
  }

  // a soft sine that glides from f0 to f1 (a boing, a bop, a plop)
  tone(t, f0, f1, dur, v, type = 'sine') {
    const a = this.a;
    const ctx = a.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.008, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.sfx);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // ------------------------------------------------------------ bubbles

  // a stream of bubbles being blown: a soft breath with a rising whistle
  blow() {
    if (!this.ok('blow', 0.3)) return;
    const t = this.a.ctx.currentTime;
    puff(this.a, t, { v: 0.09, from: 700, to: 1700, dur: 0.75 });
    this.tone(t + 0.05, 520, 940, 0.5, 0.012, 'sine');
  }

  // a bubble pops: a tiny wet tick and a short blip, lower for bigger bubbles.
  // size: its diameter in metres (about 0.08 .. 0.26)
  pop(size = 0.14) {
    if (!this.ok('pop', 0.03)) return;
    const t = this.a.ctx.currentTime;
    const f = clamp(1500 * Math.pow(0.12 / size, 0.85), 420, 1900);
    this.tone(t, f * 1.5, f * 0.6, 0.07, 0.085);
    this.noise(t, { from: 3200, q: 1.4, dur: 0.03, v: 0.07 });
    if (Math.random() < 0.5) this.a.bell(rand(2600, 3500), 0.014, t + 0.02, 0.3);
  }

  // ------------------------------------------------------------ ball

  // a soft boing as the ball lands; harder landings are a little louder and lower
  bounce(impact = 2) {
    if (!this.ok('bounce', 0.07)) return;
    const t = this.a.ctx.currentTime;
    const k = clamp(impact / 4, 0.15, 1);
    const f = 330 - 70 * k;
    this.tone(t, f, f * 0.62, 0.13, 0.03 + 0.06 * k);
    this.tone(t, f * 2, f * 1.3, 0.07, 0.012 * k, 'triangle');
    this.noise(t, { from: 400, type: 'lowpass', dur: 0.025, v: 0.05 * k });
  }

  // a friend kicks or nudges the ball: a round, happy bop
  bop() {
    if (!this.ok('bop', 0.1)) return;
    const t = this.a.ctx.currentTime;
    this.tone(t, 240, 95, 0.11, 0.11);
    this.noise(t, { from: 900, q: 0.9, dur: 0.03, v: 0.06 });
    this.a.bell(1318.5, 0.025, t + 0.03, 0.35);
  }

  // the ball is thrown: a little rush of air
  whoosh() {
    if (!this.ok('whoosh', 0.2)) return;
    const t = this.a.ctx.currentTime;
    this.noise(t, { from: 450, to: 1900, q: 0.8, dur: 0.28, v: 0.09, buf: 'pink' });
  }

  // ------------------------------------------------------------ petting

  // a happy hum, like a purr: a low, warm, fluttering tone
  purr() {
    if (!this.ok('purr', 0.6)) return;
    const t = this.a.ctx.currentTime;
    glide(this.a, t, [[0, 300], [0.4, 370], [0.85, 330]], { v: 0.05, type: 'triangle', formant: 620, q: 0.8, trill: 21, trillDepth: 0.55, attack: 0.12, breath: 0.12 });
  }

  // a tickled giggle: quick little bells up and down
  tickle() {
    if (!this.ok('tickle', 0.5)) return;
    const t = this.a.ctx.currentTime;
    [1568, 1976, 1568, 2349, 1760].forEach((f, i) => this.a.bell(f, 0.045, t + i * 0.055, 0.3));
  }

  // a heart floats up
  heart() {
    if (!this.ok('heart', 0.15)) return;
    this.a.bell(1318.5, 0.028, this.a.ctx.currentTime, 0.5);
  }

  // ------------------------------------------------------------ treats

  // something lands with a soft pluck (a berry, a puddle of paint)
  drop() {
    if (!this.ok('drop', 0.1)) return;
    const t = this.a.ctx.currentTime;
    this.a.bell(1760, 0.045, t, 0.5);
    this.a.bell(2349, 0.03, t + 0.06, 0.4);
  }

  // a nibble: two soft crunches
  munch() {
    if (!this.ok('munch', 0.15)) return;
    const t = this.a.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      this.noise(t + i * 0.09, { from: rand(900, 1300), q: 1.6, dur: 0.045, v: 0.09 });
      this.tone(t + i * 0.09, 160, 110, 0.05, 0.05);
    }
  }

  // a happy little chirp (not a voice: a bright glide)
  chirp() {
    if (!this.ok('chirp', 0.3)) return;
    const t = this.a.ctx.currentTime;
    glide(this.a, t, [[0, 900], [0.07, 1500], [0.15, 1250]], { v: 0.06, formant: 1700, trill: 0 });
    glide(this.a, t + 0.2, [[0, 1100], [0.08, 1800], [0.16, 1500]], { v: 0.05, formant: 2000 });
  }

  // a treat is shared: a bright pop and a twinkle
  share() {
    if (!this.ok('share', 0.2)) return;
    const t = this.a.ctx.currentTime;
    this.a.bell(1976, 0.05, t, 0.5);
    this.a.bell(2637, 0.035, t + 0.07, 0.5);
  }

  // ------------------------------------------------------------ paint

  // a friend jumps into paint: a soft plop and a squelch
  splash() {
    if (!this.ok('splash', 0.12)) return;
    const t = this.a.ctx.currentTime;
    this.tone(t, 330, 120, 0.12, 0.08);
    this.noise(t, { from: 900, to: 500, type: 'lowpass', dur: 0.14, v: 0.07, buf: 'pink' });
    this.a.bubble(0.05);
  }

  // ------------------------------------------------------------ chimes

  // 'call' (the bell), 'cheer' (all together), 'welcome' (a new friend)
  chime(kind = 'call') {
    if (!this.ok('chime', 0.3)) return;
    const t = this.a.ctx.currentTime;
    const notes = CHIME[kind] || CHIME.call;
    const step = kind === 'welcome' ? 0.07 : 0.085;
    notes.forEach((f, i) => this.a.bell(f, kind === 'welcome' ? 0.06 : 0.055, t + i * step, kind === 'call' ? 0.9 : 1.3));
    if (kind !== 'call') for (let i = 0; i < 6; i++) this.a.bell(rand(2200, 4200), 0.02, t + 0.1 + Math.random() * 0.9, 0.45);
    if (kind === 'welcome') [261.63, 329.63, 392].forEach((f, i) => this.a.pad(f, 0.022, t + 0.05 + i * 0.04, 1.6));
  }

  // a little twinkle: a few high bells
  sparkle(n = 3) {
    if (!this.ok('sparkle', 0.1)) return;
    const t = this.a.ctx.currentTime;
    for (let i = 0; i < n; i++) this.a.bell(rand(2000, 4200), 0.022, t + i * 0.045 + Math.random() * 0.03, 0.4);
  }

  // the welcome star reaches the shelf: a bright ding
  arrive() {
    if (!this.ok('arrive', 0.3)) return;
    const t = this.a.ctx.currentTime;
    this.a.bell(1568, 0.06, t, 0.9);
    this.a.bell(2093, 0.05, t + 0.06, 0.8);
    this.a.bell(3136, 0.025, t + 0.1, 0.6);
  }

  // a ball drops out of the sky: a soft rising whoop
  whoop() {
    if (!this.ok('whoop', 0.4)) return;
    const t = this.a.ctx.currentTime;
    glide(this.a, t, [[0, 520], [0.25, 1040]], { v: 0.04, type: 'sine', formant: 900, q: 0.6 });
  }
}
