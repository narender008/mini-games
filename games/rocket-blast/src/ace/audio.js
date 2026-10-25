// Ace Pilot sound set: the grown-up counterpart to ../audio.js. Every sound
// is synthesised with Web Audio (no files): punchy twin cannons, enemy fire
// chirps, explosions with a sub-bass thump and crackle, alarms, stingers, a
// synth-brass fanfare and the sector music (./music.js).
//
// It rides on the app's Audio instance (created lazily on the first user
// gesture), so every method no-ops until audio.ready() (which also covers
// mute). Sounds go through an Ace bus with its own fast compressor into
// audio.sfx -> audio.master, so the app's mute and master chain apply; the
// music goes straight to audio.master.
//
// API (the controller wires it):
//   new AceAudio(audio)
//   onEvent(ev, S)       a sim event ({ type, x, y, ... }); pan from ev.x and
//                        S.field.halfW. Also nudges music intensity on
//                        waveStart / waveClear / bossStart / bossDead / dead.
//   fire(kind, pan)      player shots: 'cannon' | 'pierce' | 'missile' |
//                        'spread' | 'drone' (onEvent forwards 'fire' here too;
//                        the per-kind gate makes a double call harmless)
//   ui(kind)             'click' | 'hover' | 'select' | 'back' | 'deny' |
//                        'card' | 'rare' | 'legendary' | 'reroll' | 'pause' |
//                        'resume' | 'launch' | 'locked'
//   startMusic(sector), stopMusic(), setIntensity(0..1), duck(amount, time)
//   setLowHull(on)       the warning beep loop (pure Web Audio, no timers)
//
// Budget: each sound claims a voice in its category (minimum gap, maximum
// concurrent) and in a global budget of BUDGET; low-priority sounds are
// dropped first, and a category's level falls as it gets busy, so a screen
// full of explosions stays clean. For offline renders set `clock` to a time
// (seconds on the context) and every sound is scheduled there.
import { AceMusic } from './music.js';

const BUDGET = 28;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// category -> [min gap s, max concurrent, voice length s, priority 0..2]
const CATS = {
  cannon: [0.055, 3, 0.08, 0], pierce: [0.065, 3, 0.12, 0], spread: [0.085, 2, 0.1, 0],
  missile: [0.11, 3, 0.3, 0], drone: [0.09, 2, 0.06, 0],
  efire: [0.045, 4, 0.12, 0], hit: [0.03, 3, 0.04, 0], graze: [0.04, 2, 0.05, 0],
  small: [0.03, 4, 0.35, 0], medium: [0.05, 3, 0.7, 1], large: [0.12, 2, 1.4, 1],
  part: [0.15, 2, 1.2, 1], pickup: [0.06, 2, 0.35, 1], tele: [0.08, 3, 1, 1],
  shield: [0.15, 1, 0.4, 2], hull: [0.3, 1, 0.8, 2], emp: [0.5, 1, 2, 2],
  sting: [0.2, 2, 3, 2], ui: [0.035, 3, 0.25, 2], boss: [1, 1, 4, 2],
};

// enemy type -> explosion size
const SIZE = {
  dart: 'small', shard: 'small', mine: 'small', drone: 'small', pod: 'small',
  gunship: 'medium', diver: 'medium', minelayer: 'medium', splitter: 'medium', sniper: 'medium',
  turret: 'medium', bulwark: 'large',
};

export class AceAudio {
  constructor(audio) {
    this.a = audio;
    this.ctx = null;
    this.clock = null; // offline renders: fixed schedule time
    this.cats = {};
    this.voices = [];
    this.twin = false;
    this.grazeN = 0;
    this.grazeT = -1;
    this.music = null;
    this.wantMusic = null;
    this.intensity = 0.75;
    this.lowWanted = false;
    this.low = null;
    this.waitTimer = null;
  }

  // ------------------------------------------------------------ plumbing

  // Builds the Ace bus the first time a context exists.
  live() {
    const a = this.a;
    if (!a || !a.ctx || !a.master) return false;
    if (this.ctx !== a.ctx) this.build(a.ctx);
    return true;
  }

  ok() {
    return this.live() && this.a.ready();
  }

  build(ctx) {
    this.ctx = ctx;
    this.cats = {};
    this.voices = [];
    this.music = null;
    this.low = null;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(comp).connect(this.a.sfx || this.a.master);
    this.verb = this.a.verb || null;
    this.white = this.a.noise;
    if (!this.white) {
      this.white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.white.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    // brown noise (rumble) and crackle (sparse sharp impulses)
    const sr = ctx.sampleRate;
    this.brown = ctx.createBuffer(1, sr * 2, sr);
    const bd = this.brown.getChannelData(0);
    let v = 0;
    for (let i = 0; i < bd.length; i++) {
      v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = v * 3.5;
    }
    this.crackle = ctx.createBuffer(1, sr * 2, sr);
    const cd = this.crackle.getChannelData(0);
    for (let i = 0; i < cd.length; i++) {
      if (Math.random() < 0.0016) {
        const amp = rnd(0.3, 1) * (Math.random() < 0.5 ? -1 : 1);
        const len = 20 + ((Math.random() * 120) | 0);
        for (let j = 0; j < len && i + j < cd.length; j++) cd[i + j] += amp * Math.exp(-j / (len * 0.25)) * (Math.random() * 2 - 1);
      }
    }
    if (this.wantMusic != null) this.startMusic(this.wantMusic);
    if (this.lowWanted) this.setLowHull(true);
  }

  now() {
    return this.clock != null ? this.clock : this.ctx.currentTime + 0.004;
  }

  // Returns a level 0..1 for a new sound in a category, or 0 to drop it.
  claim(cat) {
    const [gap, max, dur, prio] = CATS[cat];
    const t = this.now();
    const c = this.cats[cat] || (this.cats[cat] = { last: -9, ends: [] });
    if (t - c.last < gap) return 0;
    c.ends = c.ends.filter((e) => e > t);
    if (c.ends.length >= max) return 0;
    this.voices = this.voices.filter((e) => e > t);
    const n = this.voices.length;
    if ((prio === 0 && n >= BUDGET * 0.7) || (prio === 1 && n >= BUDGET)) return 0;
    c.last = t;
    c.ends.push(t + dur);
    this.voices.push(t + dur);
    return 1 / Math.sqrt(1 + 0.6 * (c.ends.length - 1));
  }

  pan(ev, S) {
    const hw = S && S.field && S.field.halfW;
    if (!hw || typeof ev.x !== 'number') return 0;
    return clamp(ev.x / hw, -1, 1) * 0.6;
  }

  out(pan = 0, wet = 0.2) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(this.bus);
    if (wet > 0 && this.verb) {
      const w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(this.verb);
    }
    return p;
  }

  tone({ type = 'sine', f0, f1 = f0, t, attack = 0.003, dur = 0.2, peak = 0.1, dest, curve = 'exp', detune = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + attack + dur);
    }
    const g = ctx.createGain();
    g.gain.value = 0; // silent before t even if a source starts early
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.03);
    return o;
  }

  noise({ buf = this.white, t, type = 'lowpass', f0 = 1200, f1 = f0, q = 0.7, attack = 0.002, dur = 0.2, peak = 0.1, dest, rate = 1 }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
    const g = ctx.createGain();
    g.gain.value = 0; // silent before t even if a source starts early
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * (buf.duration * 0.5));
    s.stop(t + attack + dur + 0.03);
  }

  // a brass voice: detuned saws through a low-pass that opens and settles
  brass(f, t, len, peak, dest, bright = 2800) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(bright, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(bright * 0.5, t + Math.max(0.12, len));
    const g = ctx.createGain();
    g.gain.value = 0; // silent before t even if a source starts early
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.setValueAtTime(peak * 0.85, t + Math.max(0.04, len - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
    lp.connect(g).connect(dest);
    for (const dt of [-9, 0, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = dt;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.3);
    }
  }

  // ------------------------------------------------------------ player fire

  fire(kind = 'cannon', pan = 0) {
    if (!this.ok()) return;
    const cat = CATS[kind] ? kind : 'cannon';
    const k = this.claim(cat);
    if (!k) return;
    const t = this.now();
    this.twin = !this.twin;
    if (cat === 'cannon' || cat === 'spread') {
      const d = this.out(pan + (this.twin ? 0.08 : -0.08), 0.05);
      const f = rnd(390, 430) * (this.twin ? 1 : 1.04);
      const lv = cat === 'spread' ? 0.7 : 1;
      // a short square "thup" with a falling pitch, a click on top, a punch under
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.connect(d);
      this.tone({ type: 'square', f0: f, f1: f * 0.4, t, attack: 0.002, dur: 0.055, peak: 0.05 * k * lv, dest: lp });
      this.noise({ t, type: 'highpass', f0: 2800, dur: 0.018, peak: 0.035 * k * lv, dest: d });
      this.tone({ f0: 140, f1: 60, t, attack: 0.002, dur: 0.045, peak: 0.07 * k * lv, dest: d });
      if (cat === 'spread') {
        this.tone({ type: 'sawtooth', f0: f * 1.5, f1: f * 0.7, t, dur: 0.05, peak: 0.018 * k, dest: this.out(pan - 0.3, 0.05) });
        this.tone({ type: 'sawtooth', f0: f * 1.52, f1: f * 0.71, t, dur: 0.05, peak: 0.018 * k, dest: this.out(pan + 0.3, 0.05) });
      }
    } else if (cat === 'pierce') {
      // a bright zing: band-passed saw sweep with a ringing top
      const d = this.out(pan, 0.1);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3;
      bp.frequency.setValueAtTime(2600, t);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.09);
      bp.connect(d);
      this.tone({ type: 'sawtooth', f0: rnd(880, 940), f1: 330, t, dur: 0.09, peak: 0.07 * k, dest: bp });
      this.tone({ f0: 2350, f1: 1500, t, dur: 0.08, peak: 0.015 * k, dest: d });
      this.tone({ f0: 150, f1: 70, t, dur: 0.04, peak: 0.05 * k, dest: d });
    } else if (cat === 'missile') {
      // a launch thump and a rising whoosh
      const d = this.out(pan, 0.15);
      this.tone({ f0: 120, f1: 55, t, dur: 0.08, peak: 0.06 * k, dest: d });
      this.noise({ t, type: 'bandpass', f0: 500, f1: 2400, q: 1.4, attack: 0.02, dur: 0.24, peak: 0.05 * k, dest: d });
    } else {
      // wing drones: a tiny, quiet blip
      const d = this.out(pan, 0.05);
      this.tone({ type: 'triangle', f0: rnd(1250, 1350), f1: 700, t, dur: 0.035, peak: 0.022 * k, dest: d });
    }
  }

  // ------------------------------------------------------------ enemy fire

  enemyFire(what, pan) {
    const k = this.claim('efire');
    if (!k) return;
    const t = this.now();
    const d = this.out(pan, 0.12);
    const v = k * 0.9;
    switch (what) {
      case 'gunship': case 'needle': {
        // a buzzy needle burst
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1500;
        bp.Q.value = 2;
        bp.connect(d);
        this.tone({ type: 'sawtooth', f0: rnd(1350, 1450), f1: 1000, t, dur: 0.045, peak: 0.05 * v, dest: bp });
        break;
      }
      case 'ball': case 'boss':
        // a fat low "thoom"
        this.tone({ type: 'square', f0: 190, f1: 85, t, dur: 0.12, peak: 0.03 * v, dest: d });
        this.tone({ f0: 120, f1: 60, t, dur: 0.14, peak: 0.07 * v, dest: d });
        break;
      case 'sniper': case 'beam':
        // a sharp crack: the shot you were warned about
        this.noise({ t, type: 'highpass', f0: 3000, dur: 0.05, peak: 0.07 * v, dest: d });
        this.tone({ type: 'sawtooth', f0: 2600, f1: 260, t, dur: 0.14, peak: 0.05 * v, dest: d });
        break;
      case 'mine': case 'minelayer':
        // ring burst: a pop and a short metallic ring
        this.noise({ t, type: 'bandpass', f0: 1200, q: 1.5, dur: 0.06, peak: 0.06 * v, dest: d });
        this.tone({ f0: 1780, f1: 1700, t, dur: 0.2, peak: 0.02 * v, dest: d });
        this.tone({ f0: 2620, t, dur: 0.12, peak: 0.012 * v, dest: d });
        break;
      case 'turret':
        this.tone({ type: 'square', f0: 760, f1: 520, t, dur: 0.03, peak: 0.025 * v, dest: d });
        this.tone({ type: 'square', f0: 760, f1: 520, t: t + 0.05, dur: 0.03, peak: 0.02 * v, dest: d });
        break;
      default:
        // darts and orbs: a soft descending chirp
        this.tone({ type: 'triangle', f0: rnd(950, 1050), f1: 480, t, dur: 0.06, peak: 0.045 * v, dest: d });
    }
  }

  // ------------------------------------------------------------ impacts

  hitTick(pan, blocked, boss) {
    const k = this.claim('hit');
    if (!k) return;
    const t = this.now();
    const d = this.out(pan, 0.04);
    if (blocked) {
      // shot glances off a shield: metallic ping
      this.tone({ f0: 1650, t, dur: 0.07, peak: 0.025 * k, dest: d });
      this.tone({ f0: 2480, t, dur: 0.05, peak: 0.015 * k, dest: d });
    } else if (boss) {
      this.tone({ type: 'triangle', f0: rnd(820, 900), f1: 600, t, dur: 0.03, peak: 0.03 * k, dest: d });
      this.noise({ t, type: 'bandpass', f0: 3000, q: 2, dur: 0.02, peak: 0.03 * k, dest: d });
    } else {
      this.tone({ f0: rnd(2300, 2500), f1: 1800, t, dur: 0.018, peak: 0.022 * k, dest: d });
      this.noise({ t, type: 'highpass', f0: 4500, dur: 0.012, peak: 0.02 * k, dest: d });
    }
  }

  // size: 'small' | 'medium' | 'large'; level scales the whole thing
  boom(size, pan, t = this.now(), level = 1) {
    const P = {
      small: { sub: [95, 40, 0.18, 0.18], body: [3200, 320, 0.22, 0.13], crack: [0.18, 0.05], rumble: 0, wet: 0.15 },
      medium: { sub: [85, 32, 0.38, 0.28], body: [3600, 240, 0.45, 0.18], crack: [0.45, 0.07], rumble: [0.7, 0.12], wet: 0.25 },
      large: { sub: [72, 24, 0.9, 0.38], body: [4200, 150, 1.0, 0.22], crack: [0.9, 0.09], rumble: [1.6, 0.2], wet: 0.4 },
    }[size];
    const d = this.out(pan, P.wet);
    const low = this.out(pan * 0.3, 0);
    const [s0, s1, sd, sp] = P.sub;
    this.tone({ f0: s0 * rnd(0.9, 1.1), f1: s1, t, attack: 0.002, dur: sd, peak: sp * level, dest: low });
    const [b0, b1, bd, bp] = P.body;
    this.noise({ t, type: 'lowpass', f0: b0, f1: b1, q: 0.9, dur: bd, peak: bp * level, dest: d });
    this.noise({ buf: this.crackle, t: t + 0.01, type: 'highpass', f0: 1400, attack: 0.02, dur: P.crack[0], peak: P.crack[1] * level, dest: d, rate: rnd(0.8, 1.2) });
    if (P.rumble) this.noise({ buf: this.brown, t, type: 'lowpass', f0: 260, f1: 70, attack: 0.02, dur: P.rumble[0], peak: P.rumble[1] * level, dest: low });
  }

  explode(size, pan, level = 1) {
    const k = this.claim(size);
    if (k) this.boom(size, pan, this.now(), level * k);
  }

  clang(t, pan, level = 1) {
    const d = this.out(pan, 0.35);
    [317, 546, 893, 1291, 1777].forEach((f, i) => this.tone({ f0: f, f1: f * 0.97, t, dur: 0.7 - i * 0.1, peak: (0.05 - i * 0.007) * level, dest: d }));
  }

  partDestroyed(pan) {
    const k = this.claim('part');
    if (!k) return;
    const t = this.now();
    this.boom('large', pan, t, 0.8 * k);
    this.clang(t + 0.02, pan, k);
  }

  bossPhase(pan) {
    const k = this.claim('part');
    if (!k) return;
    const t = this.now();
    this.boom('large', pan, t, 0.9 * k);
    const d = this.out(0, 0.3);
    // a metal groan and a riser into the next phase
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.connect(d);
    this.tone({ type: 'sawtooth', f0: 95, f1: 42, t: t + 0.1, attack: 0.05, dur: 1.1, peak: 0.08, dest: lp });
    this.noise({ t: t + 0.4, type: 'bandpass', f0: 300, f1: 3500, q: 2, attack: 0.9, dur: 0.15, peak: 0.05, dest: d });
  }

  // a chain of blasts walking across the hull, a riser, then the big one
  bossDead(pan) {
    if (!this.claim('boss')) return;
    const t = this.now();
    const offs = [0, 0.32, 0.58, 0.8, 0.98, 1.13, 1.26, 1.37, 1.47];
    offs.forEach((o, i) => this.boom(i % 3 === 2 ? 'large' : 'medium', clamp(pan + rnd(-0.5, 0.5), -0.8, 0.8), t + o, 0.55 + i * 0.03));
    const d = this.out(0, 0.4);
    this.noise({ t: t + 0.2, type: 'bandpass', f0: 250, f1: 4000, q: 1.5, attack: 1.4, dur: 0.1, peak: 0.07, dest: d });
    const T = t + 1.65;
    this.boom('large', 0, T, 1.15);
    this.tone({ f0: 55, f1: 20, t: T, dur: 2.2, peak: 0.3, dest: this.out(0, 0) });
    this.noise({ buf: this.brown, t: T, type: 'lowpass', f0: 400, f1: 60, attack: 0.05, dur: 2.6, peak: 0.25, dest: this.out(0, 0.5) });
    this.clang(T + 0.05, 0, 1.3);
    // falling debris sparkle
    for (let i = 0; i < 8; i++) this.tone({ type: 'triangle', f0: rnd(2500, 4200), f1: 1800, t: T + 0.3 + i * rnd(0.08, 0.16), dur: 0.05, peak: 0.02, dest: this.out(rnd(-0.6, 0.6), 0.4) });
    this.duck(0.25, 3.2);
  }

  // ------------------------------------------------------------ player

  shieldHit(pan) {
    const k = this.claim('shield');
    if (!k) return;
    const t = this.now();
    const d = this.out(pan, 0.3);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    bp.connect(d);
    this.tone({ type: 'sawtooth', f0: 1300, f1: 260, t, dur: 0.26, peak: 0.2, dest: bp });
    this.noise({ t, type: 'highpass', f0: 3500, dur: 0.08, peak: 0.07, dest: d });
    this.tone({ f0: 1900, f1: 950, t, dur: 0.32, peak: 0.05, dest: d });
    this.tone({ f0: 120, f1: 60, t, dur: 0.12, peak: 0.12, dest: d });
  }

  hullHit(pan) {
    const k = this.claim('hull');
    if (!k) return;
    const t = this.now();
    // a crunch...
    const d = this.out(pan, 0.25);
    this.tone({ f0: 110, f1: 35, t, dur: 0.35, peak: 0.36, dest: this.out(0, 0) });
    this.noise({ t, type: 'lowpass', f0: 5000, f1: 400, q: 1.2, dur: 0.3, peak: 0.22, dest: d });
    this.noise({ buf: this.crackle, t, type: 'highpass', f0: 1200, dur: 0.35, peak: 0.1, dest: d });
    // ...then a two-tone alarm
    const a = this.out(0, 0.15);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 1.5;
    bp.connect(a);
    [880, 660, 880, 660].forEach((f, i) => this.tone({ type: 'square', f0: f, t: t + 0.12 + i * 0.11, attack: 0.004, dur: 0.09, peak: 0.07, dest: bp }));
    this.duck(0.5, 0.8);
  }

  graze(pan) {
    const t0 = this.now();
    this.grazeN = t0 - this.grazeT < 0.6 ? Math.min(12, this.grazeN + 1) : 0;
    this.grazeT = t0;
    const k = this.claim('graze');
    if (!k) return;
    const t = this.now();
    const f = 2600 * 2 ** (this.grazeN / 24);
    this.tone({ type: 'triangle', f0: f, f1: f * 1.3, t, dur: 0.025, peak: 0.025 * k, dest: this.out(pan, 0.1) });
  }

  pickup(kind, pan) {
    const k = this.claim('pickup');
    if (!k) return;
    const t = this.now();
    const d = this.out(pan, 0.3);
    if (kind === 'shield') {
      this.tone({ f0: 500, f1: 1600, t, dur: 0.22, peak: 0.07, dest: d });
      this.tone({ type: 'triangle', f0: 1600, f1: 2400, t: t + 0.12, dur: 0.18, peak: 0.03, dest: d });
    } else if (kind === 'emp') {
      this.tone({ f0: 180, f1: 720, t, dur: 0.2, peak: 0.08, dest: d });
      this.tone({ type: 'triangle', f0: 1440, t: t + 0.16, dur: 0.18, peak: 0.04, dest: d });
    } else if (kind === 'hull') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ type: 'triangle', f0: f, t: t + i * 0.05, dur: 0.2, peak: 0.05, dest: d }));
    } else {
      // score: a quick bright double ping
      this.tone({ type: 'triangle', f0: 1318.5, t, dur: 0.06, peak: 0.035 * k, dest: d });
      this.tone({ type: 'triangle', f0: 1975.5, t: t + 0.045, dur: 0.08, peak: 0.03 * k, dest: d });
    }
  }

  // the EMP: a deep downward sweep under a rising wash and a crackling tail
  emp() {
    if (!this.claim('emp')) return;
    const t = this.now();
    const d = this.out(0, 0.5);
    this.tone({ f0: 320, f1: 28, t, attack: 0.01, dur: 1.3, peak: 0.34, dest: this.out(0, 0.1) });
    this.noise({ t, type: 'bandpass', f0: 180, f1: 7000, q: 1.3, attack: 0.05, dur: 0.6, peak: 0.16, dest: d });
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    lp.connect(d);
    this.tone({ type: 'sawtooth', f0: 110, f1: 55, t, dur: 1.2, peak: 0.08, dest: lp, detune: 0 });
    this.tone({ type: 'sawtooth', f0: 111.5, f1: 55.5, t, dur: 1.2, peak: 0.08, dest: lp });
    this.noise({ buf: this.crackle, t: t + 0.15, type: 'highpass', f0: 2000, attack: 0.1, dur: 1.2, peak: 0.12, dest: d });
    this.duck(0.3, 1.4);
  }

  // telegraphs: the sniper's rising whine (its 1 s line) and the diver's lock
  telegraph(what, pan, dur) {
    const k = this.claim('tele');
    if (!k) return;
    const t = this.now();
    const d = this.out(pan, 0.15);
    if (what === 'diver') {
      const D = dur || 0.6;
      for (let i = 0; i < 3; i++) this.tone({ type: 'square', f0: 1500, t: t + i * D * 0.22, dur: 0.04, peak: 0.03, dest: d });
      this.tone({ type: 'square', f0: 2000, t: t + D * 0.7, dur: D * 0.3, peak: 0.03, dest: d });
    } else if (what === 'sniper' || what === 'line') {
      const D = dur || 1;
      const o = this.tone({ f0: 1100, f1: 2700, t, attack: D * 0.8, dur: D * 0.25, peak: 0.035, dest: d });
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(9, t);
      lfo.frequency.linearRampToValueAtTime(24, t + D);
      const lg = this.ctx.createGain();
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + D * 1.1);
    } else {
      // a boss weapon charging (beam cannon, drill sweep)
      const D = dur || 1.2;
      this.noise({ t, type: 'bandpass', f0: 200, f1: 2400, q: 4, attack: D, dur: 0.1, peak: 0.06, dest: d });
      this.tone({ type: 'sawtooth', f0: 60, f1: 120, t, attack: D, dur: 0.1, peak: 0.04, dest: d, curve: 'lin' });
    }
  }

  // ------------------------------------------------------------ stingers

  waveStart(n = 1) {
    if (!this.claim('sting')) return;
    const t = this.now();
    const d = this.out(0, 0.4);
    // a dark brass hit with a sub, a ping a step higher each wave
    this.brass(110, t, 0.35, 0.06, d, 1800);
    this.brass(164.8, t, 0.35, 0.04, d, 1800);
    this.tone({ f0: 70, f1: 40, t, dur: 0.5, peak: 0.18, dest: this.out(0, 0) });
    this.noise({ t: t - 0, type: 'highpass', f0: 6000, f1: 2000, dur: 0.3, peak: 0.03, dest: d });
    const f = 880 * 2 ** (Math.min(8, n - 1) * 2 / 12);
    this.tone({ type: 'triangle', f0: f, t: t + 0.12, dur: 0.5, peak: 0.035, dest: d });
  }

  waveClear() {
    if (!this.claim('sting')) return;
    const t = this.now();
    const d = this.out(0, 0.4);
    [659.25, 987.77, 1318.5].forEach((f, i) => {
      this.tone({ type: 'triangle', f0: f, t: t + i * 0.08, dur: 0.35, peak: 0.045, dest: d });
      this.tone({ type: 'square', f0: f / 2, t: t + i * 0.08, dur: 0.12, peak: 0.012, dest: d });
    });
  }

  // boss warning siren: a two-tone band-passed saw over a low drone
  siren() {
    if (!this.claim('sting')) return;
    const t = this.now();
    const d = this.out(0, 0.35);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    bp.connect(d);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    for (let i = 0; i < 3; i++) {
      o.frequency.linearRampToValueAtTime(840, t + i * 0.9 + 0.45);
      o.frequency.linearRampToValueAtTime(420, t + i * 0.9 + 0.9);
    }
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.1);
    g.gain.setValueAtTime(0.1, t + 2.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.9);
    o.connect(g).connect(bp);
    o.start(t);
    o.stop(t + 3);
    this.tone({ type: 'sawtooth', f0: 55, t, attack: 0.3, dur: 2.6, peak: 0.05, dest: this.out(0, 0.2) });
    this.tone({ f0: 55, t, attack: 0.3, dur: 2.6, peak: 0.12, dest: this.out(0, 0) });
    this.duck(0.35, 2.8);
  }

  // sector clear: heroic synth brass, I - bVI - bVII - I, over timpani
  fanfare() {
    if (!this.claim('sting')) return;
    const t = this.now() + 0.02;
    const d = this.out(0, 0.45);
    const C = [[261.63, 329.63, 392], [207.65, 261.63, 311.13], [233.08, 293.66, 349.23], [261.63, 329.63, 392, 523.25]];
    const at = [0, 0.16, 0.32, 0.48, 1.1, 1.62, 2.14];
    const ch = [0, 0, 0, 0, 1, 2, 3];
    const len = [0.12, 0.12, 0.12, 0.55, 0.48, 0.48, 1.6];
    at.forEach((o, i) => {
      const notes = C[ch[i]];
      notes.forEach((f) => this.brass(f, t + o, len[i], 0.045, d, i === 6 ? 3600 : 2800));
      this.brass(notes[0] / 2, t + o, len[i], 0.05, d, 1200);
      if (i === 0 || i >= 3) this.tone({ f0: 98, f1: 60, t: t + o, dur: 0.4, peak: 0.16, dest: this.out(0, 0.2) });
    });
    // top line rings out
    this.tone({ type: 'triangle', f0: 1046.5, t: t + 2.14, attack: 0.05, dur: 1.6, peak: 0.03, dest: d });
    this.noise({ t: t + 2.14, type: 'highpass', f0: 7000, attack: 0.3, dur: 1.4, peak: 0.02, dest: d });
    this.duck(0.12, 4);
  }

  // failed: a falling minor line, the filter closing, a low wash
  fail() {
    if (!this.claim('sting')) return;
    const t = this.now() + 0.02;
    const d = this.out(0, 0.45);
    [311.13, 293.66, 277.18, 261.63].forEach((f, i) => {
      const L = i === 3 ? 1.4 : 0.32;
      this.brass(f / 2, t + i * 0.36, L, 0.05, d, 1100 - i * 180);
      this.brass(f / 2 * 1.498, t + i * 0.36, L, 0.03, d, 900 - i * 150);
    });
    this.tone({ f0: 65, f1: 30, t: t + 1.08, dur: 1.8, peak: 0.2, dest: this.out(0, 0) });
    this.noise({ buf: this.brown, t, type: 'lowpass', f0: 600, f1: 80, attack: 0.2, dur: 2.4, peak: 0.12, dest: d });
    this.duck(0.15, 3);
  }

  // ------------------------------------------------------------ UI

  ui(kind = 'click') {
    if (!this.ok()) return;
    if (!this.claim('ui')) return;
    const t = this.now();
    const d = this.out(0, 0.12);
    const T = (o) => this.tone({ dest: d, t, ...o });
    switch (kind) {
      case 'hover':
        T({ type: 'triangle', f0: 2200, dur: 0.02, peak: 0.012 });
        break;
      case 'select': case 'confirm':
        T({ type: 'square', f0: 660, dur: 0.04, peak: 0.025 });
        T({ type: 'square', f0: 990, t: t + 0.05, dur: 0.06, peak: 0.025 });
        break;
      case 'back':
        T({ type: 'square', f0: 700, f1: 440, dur: 0.07, peak: 0.025 });
        break;
      case 'deny': case 'error': case 'locked':
        T({ type: 'square', f0: 180, dur: 0.06, peak: 0.04 });
        T({ type: 'square', f0: 170, t: t + 0.08, dur: 0.08, peak: 0.04 });
        break;
      case 'card': case 'rare': case 'legendary': {
        T({ type: 'triangle', f0: 523.25, f1: 1046.5, dur: 0.12, peak: 0.05 });
        const top = kind === 'legendary' ? [1318.5, 1568, 2093] : kind === 'rare' ? [1318.5, 1568] : [1318.5];
        top.forEach((f, i) => T({ f0: f, t: t + 0.08 + i * 0.06, dur: 0.3, peak: 0.04 }));
        if (kind === 'legendary') this.noise({ t: t + 0.05, type: 'highpass', f0: 6000, attack: 0.05, dur: 0.5, peak: 0.02, dest: d });
        break;
      }
      case 'reroll':
        for (let i = 0; i < 4; i++) T({ type: 'triangle', f0: 900 + i * 220, t: t + i * 0.035, dur: 0.03, peak: 0.025 });
        break;
      case 'pause':
        T({ type: 'triangle', f0: 880, f1: 440, dur: 0.12, peak: 0.04 });
        break;
      case 'resume':
        T({ type: 'triangle', f0: 440, f1: 880, dur: 0.12, peak: 0.04 });
        break;
      case 'launch':
        this.noise({ t, type: 'bandpass', f0: 300, f1: 3000, q: 1.2, attack: 0.05, dur: 0.45, peak: 0.07, dest: d });
        T({ f0: 90, f1: 45, dur: 0.4, peak: 0.12 });
        T({ type: 'square', f0: 660, t: t + 0.05, dur: 0.05, peak: 0.02 });
        T({ type: 'square', f0: 990, t: t + 0.12, dur: 0.12, peak: 0.02 });
        break;
      default: // click
        T({ type: 'square', f0: 1200, f1: 900, dur: 0.025, peak: 0.025 });
    }
  }

  // ------------------------------------------------------------ low hull

  // A beep that repeats while hull is at its last segment. Two square gates
  // (1.25 Hz and 2.5 Hz, stepped to 0/1) multiplied give a 0.2 s beep every 0.8 s, smoothed
  // by a low-pass so the edges do not click. No timers.
  setLowHull(on) {
    this.lowWanted = !!on;
    if (!this.live()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (on && !this.low) {
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.setTargetAtTime(1, t, 0.05);
      out.connect(this.out(0, 0.1));
      // a square LFO hard-stepped to 0/1 (its band-limited ripple removed),
      // then smoothed so the beep edges do not click
      const c = new Float32Array(257);
      for (let i = 0; i < c.length; i++) c[i] = i > 128 ? 1 : 0;
      const gate = (hz, delay) => {
        const g = ctx.createGain();
        g.gain.value = 0;
        const sq = ctx.createOscillator();
        sq.type = 'square';
        sq.frequency.value = hz;
        const sh = ctx.createWaveShaper();
        sh.curve = c;
        const sm = ctx.createBiquadFilter();
        sm.type = 'lowpass';
        sm.frequency.value = 60;
        sm.Q.value = 0.5;
        sq.connect(sh).connect(sm).connect(g.gain);
        sq.start(t + delay);
        return { g, nodes: [sq] };
      };
      // the fast gate starts 30 ms late so the two never switch together
      const A = gate(1.25, 0);
      const B = gate(2.5, 0.03);
      const tone = ctx.createOscillator();
      tone.type = 'square';
      tone.frequency.value = 988;
      const tone2 = ctx.createOscillator();
      tone2.type = 'square';
      tone2.frequency.value = 1318.5;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 1;
      const lvl = ctx.createGain();
      lvl.gain.value = 0.045;
      const lvl2 = ctx.createGain();
      lvl2.gain.value = 0.4;
      tone.connect(bp);
      tone2.connect(lvl2).connect(bp);
      bp.connect(lvl).connect(A.g).connect(B.g).connect(out);
      tone.start(t);
      tone2.start(t);
      this.low = { out, nodes: [...A.nodes, ...B.nodes, tone, tone2] };
    } else if (!on && this.low) {
      const L = this.low;
      this.low = null;
      L.out.gain.setTargetAtTime(0.0001, t, 0.04);
      for (const n of L.nodes) n.stop(t + 0.3);
    }
  }

  // ------------------------------------------------------------ music

  startMusic(sectorId = 1) {
    this.wantMusic = sectorId;
    if (!this.live()) {
      // the context arrives with the first gesture; start then
      if (!this.waitTimer && typeof setInterval === 'function') {
        this.waitTimer = setInterval(() => {
          if (this.wantMusic == null || this.live()) {
            clearInterval(this.waitTimer);
            this.waitTimer = null;
          }
        }, 250);
      }
      return;
    }
    // the kids' tune steps aside
    this.a.music?.stop?.();
    if (!this.music) this.music = new AceMusic(this.ctx, this.a.master, this.a.verb || this.a.master, this.white);
    this.music.k = this.intensity;
    this.music.start(sectorId);
  }

  stopMusic() {
    this.wantMusic = null;
    if (this.music) this.music.stop();
  }

  setIntensity(k) {
    this.intensity = clamp(k, 0, 1);
    if (this.music) this.music.setIntensity(this.intensity);
  }

  duck(amount = 0.4, time = 1.2) {
    if (this.music && this.music.playing) this.music.duck(amount, time);
  }

  // ------------------------------------------------------------ events

  onEvent(ev, S) {
    if (!ev || !this.ok()) return;
    const pan = this.pan(ev, S);
    const who = ev.enemy || ev.etype || ev.by || ev.source || ev.kind || ev.what;
    switch (ev.type) {
      case 'fire':
        this.fire(ev.kind || ev.weapon || 'cannon', pan);
        break;
      case 'enemyFire':
        this.enemyFire(who, pan);
        break;
      case 'hit':
        this.hitTick(pan, ev.blocked || ev.shielded || ev.deflect, ev.boss || ev.part != null);
        break;
      case 'kill': {
        const size = ev.size || (ev.big ? 'large' : SIZE[ev.enemy || ev.etype || ev.kind] || 'small');
        this.explode(size, pan);
        if ((ev.enemy || ev.kind) === 'mine') this.enemyFire('mine', pan);
        break;
      }
      case 'partDestroyed':
        this.partDestroyed(pan);
        break;
      case 'bossPhase':
        this.bossPhase(pan);
        break;
      case 'bossDead':
        this.bossDead(pan);
        this.setIntensity(0.5);
        break;
      case 'playerHit':
        this.hullHit(pan);
        break;
      case 'shieldHit':
        this.shieldHit(pan);
        break;
      case 'graze':
        this.graze(pan);
        break;
      case 'pickup':
        this.pickup(ev.kind, pan);
        break;
      case 'emp':
        this.emp();
        break;
      case 'telegraph':
        this.telegraph(who, pan, ev.dur || ev.time);
        break;
      case 'waveStart':
        this.waveStart(ev.wave || (S && S.wave) || 1);
        this.setIntensity(0.75);
        break;
      case 'waveClear':
        this.waveClear();
        this.setIntensity(0.4);
        break;
      case 'bossStart':
        this.siren();
        this.setIntensity(1);
        break;
      case 'sectorClear':
        this.fanfare();
        break;
      case 'dead':
        this.fail();
        this.setLowHull(false);
        this.setIntensity(0.2);
        break;
      default:
    }
  }
}
