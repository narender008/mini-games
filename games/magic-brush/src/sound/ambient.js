// The garden's own sound, synthesised with Web Audio on the game's context
// and master gain (so the mute toggle silences it): a soft breeze that
// swells with each gust, a trickle of water that grows as the camera comes
// near the pond, and the songbirds themselves, whose tweets are scheduled
// by the birds (world/birds.js) so a beak opens exactly when its note
// sounds. Nothing is built before the audio is unlocked (life.js creates
// this once `audio.ready`), it is quiet at the easel and a little fuller in
// the garden, and it sits well under the music and the friends' own calls.
//
// A song is plain data (makeSong): the birds animate from it, and sing()
// plays it, so the picture and the sound cannot drift apart.
import { clamp, rand } from '../config.js';

// ------------------------------------------------------------ songs

// a song for a voice: notes [{ t, d, f0, f1, v, vib }] (seconds from the
// start, duration, Hz at the start and end, loudness 0..1, vibrato depth),
// always soft, high and short. `base` is the bird's own pitch (Hz).
export function makeSong(kind, base) {
  const notes = [];
  const add = (t, d, f0, f1, v = 1, vib = 0) => notes.push({ t, d, f0, f1, v, vib });
  let t = 0;
  if (kind === 'chirp') {
    // a cheerful "chip chip cheep"
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const d = rand(0.06, 0.1);
      const f0 = base * rand(0.95, 1.1);
      add(t, d, f0, f0 * rand(1.12, 1.32), 0.9 - i * 0.06);
      t += d + rand(0.07, 0.13);
    }
  } else if (kind === 'whistle') {
    // a clear two-note whistle that falls away
    add(t, 0.2, base, base * 1.06, 1, 0.006);
    t += 0.27;
    add(t, 0.3, base * 0.84, base * 0.78, 0.9, 0.008);
    if (Math.random() < 0.5) {
      t += 0.36;
      add(t, 0.16, base * 0.9, base * 0.86, 0.7, 0.005);
    }
  } else if (kind === 'trill') {
    // a quick, bright run that tumbles back down
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const up = i % 2 === 0;
      const f = base * (up ? 1.12 : 1) * (1 - i * 0.012);
      add(t, 0.045, f, f * (up ? 0.96 : 1.04), 0.85 - i * 0.05);
      t += 0.068;
    }
  } else if (kind === 'warble') {
    // a liquid little song that wanders up and down
    const n = 4 + Math.floor(Math.random() * 3);
    let f = base;
    for (let i = 0; i < n; i++) {
      const d = rand(0.08, 0.14);
      const nf = clamp(f * rand(0.86, 1.16), base * 0.75, base * 1.25);
      add(t, d, f, nf, 0.85, 0.012);
      f = nf;
      t += d + rand(0.02, 0.06);
    }
  } else if (kind === 'tsee') {
    // high, clear "tsee tsee tsee"
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      add(t, 0.1, base * 1.14, base * 1.02, 0.85);
      t += 0.2;
    }
  } else {
    // "tweet-tweet"
    for (let r = 0; r < 2; r++) {
      add(t, 0.09, base * 0.9, base * 1.24, 1 - r * 0.15);
      add(t + 0.1, 0.11, base * 1.24, base * 1.0, 0.85 - r * 0.15);
      t += 0.34;
    }
  }
  const last = notes[notes.length - 1];
  return { notes, length: last.t + last.d };
}

// a quiet "peep" for a bird that has just been startled or has landed
export function makePeep(base) {
  const f = base * rand(0.95, 1.1);
  return { notes: [{ t: 0, d: 0.09, f0: f * 1.15, f1: f * 0.85, v: 0.7, vib: 0 }], length: 0.09 };
}

// ------------------------------------------------------------ the sound

// how loud the garden is in each part of the game (fuller at play)
const LEVEL = { menu: 0.6, paint: 0.32, play: 1, magic: 0.5 };
// the whole ambience sits low; music and friends stay on top
const MASTER = 0.75;

export class Ambient {
  constructor(audio) {
    const ctx = (this.ctx = audio.ctx);
    this.audio = audio;
    this.state = 'menu';
    this.level = 0;
    this.wind = 0;
    this.cam = { x: 0, y: 1, z: 2, rx: 1, rz: 0 };
    this.nextSong = 0; // audio time before which no bird may start a song
    this.singing = 0; // songs still sounding
    this.timer = 0;
    this.nodes = 0;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(audio.master);
    this.send = ctx.createGain(); // a little of the garden's air on the birds
    this.send.gain.value = 0.22;
    this.send.connect(audio.verbIn);
    this.buildBreeze();
    this.buildWater();
    this.lastT = 0;
  }

  // ------------------------------------------------------------ beds

  loop(buffer, offset, dest, chain = []) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    let node = src;
    for (const n of chain) node = node.connect(n);
    node.connect(dest);
    src.start(0, offset);
    return src;
  }

  lfo(rate, depth, param) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
    return o;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  // a soft breeze: low air moving, a breathier band, and leaves stirring
  buildBreeze() {
    const ctx = this.ctx;
    const a = this.audio;
    this.breeze = ctx.createGain();
    this.breeze.gain.value = 0.03;
    this.breeze.connect(this.out);
    const air = this.filter('lowpass', 420, 0.5);
    this.loop(a.brown, 0.4, this.breeze, [air]);
    this.lfo(0.11, 190, air.frequency);
    const breath = this.filter('bandpass', 950, 0.7);
    const bg = ctx.createGain();
    bg.gain.value = 0.32;
    this.loop(a.pink, 1.7, this.breeze, [breath, bg]);
    this.lfo(0.17, 320, breath.frequency);
    // leaves: a hiss high up that only wakes with the gusts
    this.leaves = ctx.createGain();
    this.leaves.gain.value = 0.0035;
    const hp = this.filter('highpass', 3200, 0.5);
    const bp = this.filter('bandpass', 5200, 0.6);
    this.loop(a.white, 0.9, this.leaves, [hp, bp]);
    this.leaves.connect(this.out);
    this.lfo(0.23, 0.0018, this.leaves.gain);
  }

  // distant water: a few narrow bands of noise whose loudness bubbles up
  // and down at different rates, panned to where the pond is
  buildWater() {
    const ctx = this.ctx;
    const a = this.audio;
    this.pan = ctx.createStereoPanner();
    this.pan.pan.value = -0.5;
    this.water = ctx.createGain();
    this.water.gain.value = 0.006;
    this.water.connect(this.pan).connect(this.out);
    const bands = [
      [820, 3.2, 6.3, 0.5, 0.2],
      [1500, 3.6, 8.9, 0.45, 1.1],
      [2500, 3.0, 11.4, 0.4, 2.3],
      [3800, 2.4, 14.6, 0.3, 0.6],
    ];
    for (const [f, q, rate, depth, off] of bands) {
      const g = ctx.createGain();
      g.gain.value = 0.5;
      this.lfo(rate, depth, g.gain);
      this.loop(a.pink, off + 0.3, g, [this.filter('bandpass', f, q)]);
      g.connect(this.water);
    }
    // the steady rush of the fall underneath
    const rush = ctx.createGain();
    rush.gain.value = 0.28;
    this.loop(a.brown, 2.1, rush, [this.filter('bandpass', 620, 0.8)]);
    rush.connect(this.water);
  }

  // ------------------------------------------------------------ every frame

  setState(state) {
    this.state = state;
  }

  // where the listener is: the camera (its position and its right-hand side)
  // and the pond, for the panning and the loudness of the water
  listen(camera, pond) {
    const e = camera.matrixWorld.elements;
    const c = this.cam;
    c.x = e[12];
    c.y = e[13];
    c.z = e[14];
    c.rx = e[0];
    c.rz = e[2];
    this.pondAt = pond;
  }

  // wind: 0..1 how hard a gust blows now
  setWind(k) {
    this.wind = k;
  }

  update(dt) {
    const ctx = this.ctx;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.12;
    const now = ctx.currentTime;
    const lv = LEVEL[this.state] ?? 0.6;
    this.out.gain.setTargetAtTime(MASTER * lv, now, 0.9);
    this.breeze.gain.setTargetAtTime(0.03 + 0.075 * this.wind, now, 0.5);
    this.leaves.gain.setTargetAtTime(0.0035 + 0.02 * this.wind, now, 0.4);
    const p = this.pondAt;
    if (p) {
      const dx = p.x - this.cam.x;
      const dz = p.z - this.cam.z;
      const d = Math.hypot(dx, dz);
      // strongest when the camera is by the pond, a faint far-off trickle otherwise
      const near = clamp((6.5 - d) / 4.5, 0, 1);
      this.water.gain.setTargetAtTime(0.006 + 0.03 * near * near, now, 0.6);
      this.pan.pan.setTargetAtTime(clamp(((dx * this.cam.rx + dz * this.cam.rz) / Math.max(d, 0.5)) * 1.2, -0.85, 0.85), now, 0.3);
    }
    if (this.singing > 0 && now > this.nextSong) this.singing = 0;
  }

  // ------------------------------------------------------------ voices

  // may a bird begin a song now? (never more than a tweet or two at a time)
  canSing() {
    return this.ctx.currentTime >= this.nextSong;
  }

  // the level and pan a sound at (x, y, z) has for the listener
  place(x, y, z, gain, pan) {
    const c = this.cam;
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, y - c.y, dz);
    const p = clamp(((dx * c.rx + dz * c.rz) / Math.max(d, 0.4)) * 1.3, -0.85, 0.85);
    pan.pan.value = p;
    gain.gain.value = 1 / (1 + 0.24 * d);
  }

  // sing a song (from makeSong) from a spot in the garden. level: 0..1
  sing(song, x, y, z, level = 1) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.04;
    const out = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const soft = this.filter('lowpass', 5200, 0.5);
    this.place(x, y, z, out, pan);
    out.connect(soft).connect(pan);
    pan.connect(this.out);
    pan.connect(this.send);
    for (const n of song.notes) {
      const t = t0 + n.t;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(n.f0, t);
      o.frequency.exponentialRampToValueAtTime(n.f1, t + n.d * 0.92);
      const h = ctx.createOscillator(); // a whisper of the octave: brighter, not shriller
      h.type = 'sine';
      h.frequency.setValueAtTime(n.f0 * 2, t);
      h.frequency.exponentialRampToValueAtTime(n.f1 * 2, t + n.d * 0.92);
      const hg = ctx.createGain();
      hg.gain.value = 0.14;
      const g = ctx.createGain();
      const v = 0.18 * n.v * level;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
      if (n.vib) {
        const l = ctx.createOscillator();
        l.frequency.value = rand(28, 42);
        const lg = ctx.createGain();
        lg.gain.value = n.f0 * n.vib;
        l.connect(lg);
        lg.connect(o.frequency);
        l.start(t);
        l.stop(t + n.d + 0.05);
      }
      o.connect(g);
      h.connect(hg).connect(g);
      g.connect(out);
      o.start(t);
      h.start(t);
      o.stop(t + n.d + 0.05);
      h.stop(t + n.d + 0.05);
    }
    this.singing++;
    this.nextSong = t0 + song.length + rand(1.6, 3.2);
    // the graph frees itself once the last note is over (nothing holds on to it)
    return song;
  }

  // a soft flutter of wings as a bird lifts off
  flutter(x, y, z, k = 1) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    const pan = ctx.createStereoPanner();
    this.place(x, y, z, out, pan);
    out.connect(pan).connect(this.out);
    const src = ctx.createBufferSource();
    src.buffer = this.audio.pink;
    const bp = this.filter('bandpass', 1500, 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    const beats = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < beats; i++) {
      const t = t0 + i * 0.085;
      g.gain.linearRampToValueAtTime(0.05 * k * (1 - i / (beats + 1)), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.002, t + 0.07);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + beats * 0.085 + 0.05);
    src.connect(bp).connect(g).connect(out);
    src.start(t0, Math.random() * 2);
    src.stop(t0 + beats * 0.085 + 0.1);
  }

  // a little water drop: a frog's hop, a fish's jump, a dragonfly's touch
  plip(x, y, z, size = 1) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    const pan = ctx.createStereoPanner();
    this.place(x, y, z, out, pan);
    out.connect(pan).connect(this.out);
    pan.connect(this.send);
    const f0 = rand(520, 760) / Math.sqrt(size);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.1, t0 + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.07 * Math.min(1.4, size), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12 + size * 0.05);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.25);
    if (size > 0.7) {
      // a bigger splash gets a burst of spray and a second, smaller drop
      const src = ctx.createBufferSource();
      src.buffer = this.audio.white;
      const hp = this.filter('bandpass', 3000, 0.8);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.linearRampToValueAtTime(0.03 * size, t0 + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      src.connect(hp).connect(ng).connect(out);
      src.start(t0, Math.random());
      src.stop(t0 + 0.3);
      const o2 = ctx.createOscillator();
      o2.frequency.setValueAtTime(f0 * 1.5, t0 + 0.11);
      o2.frequency.exponentialRampToValueAtTime(f0 * 3, t0 + 0.16);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t0 + 0.11);
      g2.gain.linearRampToValueAtTime(0.03, t0 + 0.117);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o2.connect(g2).connect(out);
      o2.start(t0 + 0.11);
      o2.stop(t0 + 0.3);
    }
  }

  dispose() {
    try {
      this.out.disconnect();
      this.send.disconnect();
    } catch {
      /* already gone */
    }
  }
}

// which voice (kind and pitch) each songbird has
export const VOICES = [
  { kind: 'warble', base: 3200 },
  { kind: 'tsee', base: 3700 },
  { kind: 'chirp', base: 2500 },
  { kind: 'whistle', base: 2900 },
  { kind: 'trill', base: 3400 },
  { kind: 'tweet', base: 3000 },
];
