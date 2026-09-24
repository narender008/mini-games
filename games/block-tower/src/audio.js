// Block Tower's sound. Everything is synthesised with Web Audio: there are no
// audio files and no voices.
//
// The signature sound is the wooden clack, and it is modelled physically. A
// hit is a short contact-force pulse (shorter for a harder hit, which is why
// hard hits sound brighter) driving a bank of damped resonant modes tuned
// like a small hardwood block, plus the dry click a small body radiates when
// it stops dead. Those impacts are rendered once, when sound starts, into
// small buffers per size, finish and hardness; a voice pool then plays them
// with per-hit loudness, brightness, pitch, timing and choice of variant, and
// a budget and voice stealing keep a 40-block crash a cascade of clatter
// rather than noise or a machine gun. Floors add their own layer rendered the
// same way: a hollow floorboard knock, a muffled rug thud, a crisp stone
// click.
//
// Music is a gentle generative loop per room on small pre-rendered
// instruments (marimba and kalimba in the playroom, plucked strings and
// birdsong on the patio, a music-box lullaby at bedtime), with a fresh
// variation of the tune on each pass.
//
// All of it runs on any BaseAudioContext, so _dev/audio.html can render and
// measure every sound offline without playing anything aloud.
import { load, save } from './config.js';

// ------------------------------------------------------------ levels

const MASTER = 0.8;
const MUSIC = 0.14; // the music bus, before each room's own level
const TONES = 0.32; // tuned effects (notes, chimes, fanfares)
const CLACK = 0.55; // one full-strength clack voice
// voice pool and budget for impacts: a burst, then a steady rate, and a cap
// per animation frame; strong hits always get through
const MAX_VOICES = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 14 : 22;
const BURST = 14;
const RATE = 80; // clacks per second once the burst is spent
const PER_FRAME = 5;

// ------------------------------------------------------------ music theory

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const PENTA = [0, 2, 4, 7, 9];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
// the i-th note up the major pentatonic scale from `base` (a midi note)
const penta = (base, i) => base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];
// the triad on scale degree d (0 = I), in semitones above the tonic
const triad = (d) => [0, 2, 4].map((k) => MAJOR[(d + k) % 7] + (d + k >= 7 ? 12 : 0));

// ------------------------------------------------------------ rooms

// Each room's acoustics: a generated impulse response (reverb time, how the
// highs die away, early reflections as [seconds, gain]) and how much of the
// effects and the music is sent into it.
const ROOMS = {
  // a medium room with a wooden floor and a big window: lively and bright
  playroom: {
    ir: { rt: 0.55, top: 7500, bottom: 2200, predelay: 0.003, early: [[0.006, 0.55], [0.0105, -0.45], [0.015, 0.38], [0.022, -0.3], [0.028, 0.26], [0.036, -0.2], [0.045, 0.15]] },
    sfxSend: 0.3,
    musicSend: 0.34,
  },
  // outdoors: the deck, one house wall, then open air
  patio: {
    ir: { rt: 0.24, top: 6500, bottom: 3000, predelay: 0.002, early: [[0.004, 0.45], [0.017, -0.3], [0.031, 0.12]] },
    sfxSend: 0.14,
    musicSend: 0.2,
  },
  // a small, soft-furnished room: curtains, bed and rug swallow the highs
  bedtime: {
    ir: { rt: 0.42, top: 3800, bottom: 1100, predelay: 0.003, early: [[0.005, 0.35], [0.009, -0.28], [0.014, 0.2], [0.021, -0.14]] },
    sfxSend: 0.22,
    musicSend: 0.32,
  },
};

// ------------------------------------------------------------ music styles

// Melody rhythms, one bar each, as [step, length] in eighth notes.
const R4 = [
  [[0, 2], [2, 2], [4, 4]],
  [[0, 3], [3, 1], [4, 4]],
  [[0, 2], [2, 1], [3, 1], [4, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2]],
  [[0, 4], [4, 2], [6, 2]],
  [[0, 1], [1, 1], [2, 2], [4, 4]],
  [[0, 2], [4, 2], [6, 2]],
];
const R4_SPARSE = [
  [[0, 4], [4, 4]],
  [[0, 2], [2, 2], [4, 4]],
  [[0, 6], [6, 2]],
  [[0, 3], [3, 1], [4, 4]],
  [[2, 2], [4, 4]],
];
const R3 = [
  [[0, 4], [4, 2]],
  [[0, 2], [2, 2], [4, 2]],
  [[0, 3], [3, 1], [4, 2]],
  [[0, 2], [2, 4]],
  [[0, 6]],
];
// melodic steps along the pentatonic scale: mostly small, sometimes a leap
const STEPS = [-2, -1, -1, 0, 1, 1, 2];

// Per room: tempo and metre, the key (tonic as a midi note), two chord
// progressions (scale degrees, one chord per bar) and the instruments.
// Accompaniment patterns are [step, chord tone (0 root, 1 third, 2 fifth),
// octave, velocity].
const STYLES = {
  playroom: {
    bpm: 92,
    beats: 4,
    tonic: 60, // C major
    level: 0.95,
    prog: [0, 5, 3, 4, 0, 5, 3, 4], // I vi IV V
    alt: [0, 3, 0, 4, 5, 3, 1, 4], // I IV I V vi IV ii V
    lead: 'marimba',
    leadBase: 72,
    leadVel: 0.5,
    rhythms: R4,
    end: [[0, 2], [2, 2], [4, 4]],
    comp: 'kalimba',
    compBase: 60,
    compPat: [[0, 0, 0, 0.24], [2, 2, 0, 0.16], [4, 1, 1, 0.18], [6, 2, 0, 0.15]],
    bass: 'bass',
    bassBase: 48,
    bassPat: [[0, 0, 0, 0.42], [4, 2, -1, 0.26]],
  },
  patio: {
    bpm: 84,
    beats: 4,
    tonic: 55, // G major
    level: 0.9,
    birds: true,
    prog: [0, 3, 0, 4, 5, 3, 0, 4],
    alt: [0, 5, 3, 4, 0, 5, 1, 4],
    lead: 'kalimba',
    leadBase: 67,
    leadVel: 0.5,
    rhythms: R4_SPARSE,
    end: [[0, 4], [4, 4]],
    comp: 'pluck',
    compBase: 55,
    // a gentle finger-picked pattern, thumb on the root
    compPat: [[0, 0, -1, 0.5], [1, 2, -1, 0.22], [2, 0, 0, 0.28], [3, 1, 0, 0.24], [4, 2, -1, 0.3], [5, 1, 0, 0.2], [6, 0, 0, 0.24], [7, 2, 0, 0.18]],
    bass: null,
  },
  bedtime: {
    bpm: 69,
    beats: 3,
    tonic: 53, // F major, a lullaby waltz
    level: 0.85,
    prog: [0, 3, 0, 4, 0, 3, 4, 0],
    alt: [0, 5, 3, 4, 0, 3, 4, 0],
    lead: 'musicbox',
    leadBase: 77,
    leadVel: 0.45,
    rhythms: R3,
    end: [[0, 6]],
    comp: 'musicbox',
    compBase: 65,
    compPat: [[2, 1, 0, 0.12], [2, 2, 0, 0.1], [4, 1, 0, 0.1], [4, 2, 0, 0.08]],
    bass: 'bass',
    bassBase: 53,
    bassPat: [[0, 0, 0, 0.3]],
  },
};
for (const s of Object.values(STYLES)) {
  s.spb = s.beats * 2; // eighth-note steps per bar
  s.stepLen = 60 / s.bpm / 2;
}

// ------------------------------------------------------------ impact models

// Clacks are rendered at these sizes (a cube, a brick, a plank); others play
// from the nearest at a shifted rate, which moves pitch and ring length
// together, as a real change of size does.
const CLASSES = [0.04, 0.08, 0.12];
// Contact time of a gentle, a firm and a hard hit. A shorter contact puts
// more energy into the high modes, so harder hits come out brighter.
const CONTACT = [0.45e-3, 0.25e-3, 0.11e-3];
const VARIANTS = 3;
// Mode ratios [frequency, amplitude] of a chunky block (dense, close modes)
// and of a bar (a plank or pillar bending: sparser, ringing a little longer).
const CHUNKY = [[1, 1], [1.19, 0.85], [1.47, 0.75], [1.73, 0.6], [2.06, 0.45], [2.41, 0.3]];
const BEAM = [[1, 1], [1.58, 0.35], [2.0, 0.45], [2.76, 0.4], [3.35, 0.15]];

// A small hardwood block. A 4 cm cube tocks near 1.9 kHz; longer pieces are
// lower (roughly size^-0.6, between a cube's 1/size and a bar's 1/size^2,
// because the thickness stays put), and bars ring a little longer. A low,
// heavily damped "body" mode stands for whatever the block is resting on
// and the air it shoves, and gives the tock its warmth. Lacquered paint is
// harder: a shade higher, less damped, with a faint glassy partial.
function blockSpec(size, paint, hard) {
  const bar = clamp((size - 0.05) / 0.07, 0, 1);
  const f0 = 1900 * (0.04 / size) ** 0.6 * rnd(0.95, 1.05) * (paint ? 1.04 : 1);
  const q0 = (46 + 22 * bar) * (paint ? 1.3 : 1);
  const modes = (bar < 0.5 ? CHUNKY : BEAM).map(([r, a]) => {
    const f = f0 * r * rnd(0.97, 1.03);
    // wood's loss factor is roughly constant, so one Q for all: higher modes
    // still die faster, in proportion to their frequency
    return [f, a * rnd(0.6, 1.25), q0 * rnd(0.8, 1.2)];
  });
  modes.push([f0 * rnd(0.27, 0.33), 0.4, 6]);
  if (paint) modes.push([f0 * rnd(2.8, 3.0), 0.14, 90]);
  return {
    modes,
    tc: CONTACT[hard] * (paint ? 0.85 : 1),
    click: [0.1, 0.25, 0.5][hard] * (paint ? 1.2 : 1),
    rough: 0.2,
    len: 0.16 + 0.12 * bar,
    hp: 180,
  };
}

// What a block lands on. Floorboards sit on joists over a void: a few low,
// quickly damped panel modes and a cavity boom, the hollow "thock". A wool
// rug gives a long, soft contact: a short low thud and a brush of fibres.
// Stone is rigid: a crisp click, a high glassy tick and a dull mass thump.
function floorSpec(kind) {
  if (kind === 'rug') {
    return { modes: [[rnd(130, 160), 1, 1.5], [rnd(240, 290), 0.7, 2], [rnd(420, 500), 0.35, 2.5]], tc: 4e-3, len: 0.16, hp: 70, fibre: 0.25 };
  }
  if (kind === 'stone') {
    return { modes: [[rnd(190, 230), 0.45, 3], [rnd(2300, 2700), 0.28, 26], [rnd(3400, 3800), 0.18, 30], [rnd(4600, 5000), 0.06, 34]], tc: 0.08e-3, click: 0.55, len: 0.12, hp: 90 };
  }
  return {
    modes: [[rnd(115, 135), 0.5, 3], [rnd(190, 220), 0.8, 6], [rnd(300, 340), 1, 8], [rnd(450, 520), 0.8, 10], [rnd(680, 760), 0.55, 12], [rnd(1000, 1150), 0.35, 15], [rnd(1500, 1700), 0.2, 18]],
    tc: 0.35e-3,
    click: 0.12,
    len: 0.24,
    hp: 55,
  };
}

// A rubber play ball's soft "bup", and the toy car's ratchet pawl clicking
// over its wooden gear.
const RUBBER = () => ({ modes: [[rnd(180, 220), 0.45, 2.2], [rnd(380, 440), 0.8, 3], [rnd(800, 950), 0.45, 4], [rnd(1400, 1600), 0.15, 5]], tc: 2.5e-3, len: 0.15, hp: 80 });
const RATCHET = () => ({ modes: [[rnd(2250, 2400), 1, 28], [rnd(3300, 3500), 0.55, 32], [rnd(4300, 4500), 0.22, 36], [rnd(1100, 1250), 0.5, 9]], tc: 0.1e-3, click: 0.4, len: 0.07, hp: 300 });

// ------------------------------------------------------------ instruments

// Additive instruments: partials [ratio, amplitude, decay seconds], the
// attack, and a mallet or finger "thump" [amplitude, low-pass, decay].
const INST = {
  // a rosewood bar over a tuned tube: the fundamental rings, the partial near
  // four times it gives the wooden tock and dies fast; a soft yarn mallet
  marimba: (f) => ({ partials: [[1, 1, clamp(0.5 * (500 / f) ** 0.5, 0.18, 0.9)], [3.93, 0.18, 0.06], [9.2, 0.045, 0.02]], attack: 0.0015, thump: [0.12, 1400, 0.006], len: 1.3 }),
  // brighter, drier bars for quick runs
  xylo: (f) => ({ partials: [[1, 1, clamp(0.32 * (700 / f) ** 0.4, 0.12, 0.5)], [3.0, 0.22, 0.05], [6.1, 0.05, 0.015]], attack: 0.001, thump: [0.1, 2400, 0.004], len: 1.0 }),
  // a thumb piano tine: a long round fundamental and a short metallic overtone
  kalimba: (f) => ({ partials: [[1, 1, clamp(0.75 * (400 / f) ** 0.3, 0.3, 1.1)], [5.9, 0.1, 0.05], [2.01, 0.03, 0.25]], attack: 0.002, thump: [0.1, 700, 0.01], len: 1.7 }),
  // a music-box comb: two nearly unison tines beat gently, and a steel
  // cantilever's second mode sits at 6.27 times the first
  musicbox: () => ({ partials: [[1, 1, 0.9], [1.0028, 0.4, 0.8], [6.27, 0.09, 0.06]], attack: 0.001, thump: [0.05, 4000, 0.002], len: 2.0 }),
  // a small soft chime for sparkles
  bell: () => ({ partials: [[1, 1, 0.45], [2.76, 0.22, 0.09], [5.4, 0.05, 0.03]], attack: 0.001, len: 1.2 }),
  // a round, soft bass
  bass: () => ({ partials: [[1, 1, 0.55], [2, 0.35, 0.3], [3, 0.08, 0.12]], attack: 0.01, thump: [0.06, 300, 0.01], len: 1.3 }),
};

// ------------------------------------------------------------ rolling

// Sample rates for rendered notes: enough for each instrument's content
// (nothing is kept above 7 kHz, the pluck is low-passed, the bass is low).
const NOTE_RATE = { bass: 12000, pluck: 16000 };
const NOTE_CACHE = 72;

// Continuous rolling: noise through a band that rises with speed, pulsing a
// little once per turn.
const ROLL = {
  // a rubber or felt ball: a soft low rumble
  ball: { noise: 'brown', f: 320, q: 0.8, lp: 1300, level: 0.22, radius: 0.035, full: 1.5, am: 0.35 },
  // wooden wheels on wooden axles: brighter, with a rattle
  car: { noise: 'pink', f: 1300, q: 1.1, lp: 3200, level: 0.12, radius: 0.012, full: 0.62, am: 0.5 },
  // a wooden cylinder or block rolling: a hollow wooden rumble
  wood: { noise: 'pink', f: 750, q: 1, lp: 2400, level: 0.2, radius: 0.02, full: 1.0, am: 0.45 },
};
const SURFACE = {
  wood: { f: 1, lp: 1, level: 1 },
  rug: { f: 0.55, lp: 0.35, level: 0.3 },
  stone: { f: 1.3, lp: 1.4, level: 1.1 },
  block: { f: 1.15, lp: 1.1, level: 0.9 },
};

// ------------------------------------------------------------ the engine

export class Audio {
  constructor() {
    this.ctx = null;
    this._muted = load('muted', false) === true;
    this.hidden = false;
    this.offline = false;
    this.dry = false;
    this.room = 'playroom';
    this.tonic = STYLES.playroom.tonic;
    this.musicRoom = null; // music asked for before sound was unlocked
    this.voices = [];
    this.rolls = new Map();
    this.tokens = BURST;
    this.tokenAt = 0;
    this.frameAt = -1;
    this.inFrame = 0;
    this.wobbleAt = 0;
    this.pointsAt = -1;
    this.crashAt = -10;
    this.stats = { clacks: 0, dropped: 0, stolen: 0 };
  }

  get muted() {
    return this._muted;
  }

  // Optional, and needs no AudioContext: render the impact bank and noise
  // now (say, during the loading screen) rather than on the first tap.
  prepare() {
    bank();
    return this;
  }

  // Must run inside a user gesture the first time.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended' && !this.hidden && !this.offline) this.ctx.resume().catch(() => {});
  }

  // Build on a context made elsewhere, e.g. an OfflineAudioContext, to render
  // and measure sounds without playing them. `reverb: false` leaves the room
  // out so a sound can be measured dry.
  attach(ctx, { reverb = true } = {}) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.dry = !reverb;
    this.build();
    return this;
  }

  build() {
    const ctx = this.ctx;
    // master: mute, no rumble, a gentle glue compressor, a soft top, and a
    // soft clipper that only ever touches peaks near full scale
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    const safety = ctx.createWaveShaper();
    safety.curve = softClip();
    this.out = safety;
    this.master.connect(filter(ctx, 'highpass', 35, -3)).connect(comp).connect(filter(ctx, 'lowpass', 10500, -3)).connect(safety).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.tones = ctx.createGain();
    this.tones.gain.value = TONES;
    this.tones.connect(this.sfx);
    this.verbIn = ctx.createGain();
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0;
    this.sfx.connect(this.sfxSend).connect(this.verbIn);
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0;
    this.musicSend.connect(this.verbIn);
    this.verbs = {};

    // the impacts and noise (rendered once per page, see prepare())
    const b = bank();
    const wrap = (x) => (x instanceof Float32Array ? mono(ctx, x, BANK_RATE) : Array.isArray(x) ? x.map(wrap) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, wrap(v)])));
    this.noise = wrap(b.noise.white);
    this.pink = wrap(b.noise.pink);
    this.brown = wrap(b.noise.brown);
    this.blocks = wrap(b.blocks);
    this.floors = wrap(b.floors);
    this.rubber = wrap(b.rubber);
    this.ratchet = wrap(b.ratchet);

    // tonal notes are rendered on first use (see note())
    this.notes = new Map();

    this.music = new Music(this);
    this.applyRoom(this.room, true);
    if (this.musicRoom) this.music.start(this.musicRoom);
    if (!this.offline) this.house = setInterval(() => this.sweepRolls(), 500);
  }

  setMuted(m) {
    this._muted = !!m;
    save('muted', this._muted);
    if (this.ctx) this.master.gain.setTargetAtTime(this._muted ? 0 : MASTER, this.ctx.currentTime, 0.03);
  }

  toggleMute() {
    this.setMuted(!this._muted);
    return this._muted;
  }

  pageHidden(hidden) {
    this.hidden = hidden;
    if (!this.ctx || this.offline) return;
    if (hidden) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  ready() {
    return !!this.ctx && !this._muted && (this.offline || this.ctx.state === 'running');
  }

  // ------------------------------------------------------------ rooms and music

  startMusic(room = this.room) {
    this.setRoom(room);
    this.musicRoom = this.room;
    if (this.music) this.music.start(this.room);
  }

  setRoom(room) {
    if (!ROOMS[room]) room = 'playroom';
    const changed = room !== this.room;
    this.room = room;
    this.tonic = STYLES[room].tonic;
    if (!this.ctx) return;
    if (changed) this.applyRoom(room);
    if (this.music.running) {
      this.musicRoom = room;
      this.music.start(room);
    }
  }

  stopMusic() {
    this.musicRoom = null;
    if (this.music) this.music.stop();
  }

  // Crossfade to a room's reverb. Idle rooms are unplugged after the fade so
  // their convolvers cost nothing.
  applyRoom(id, instant = false) {
    const ctx = this.ctx;
    const r = ROOMS[id];
    const t = ctx.currentTime;
    const tc = instant ? 0.002 : 0.35;
    let v = this.verbs[id];
    if (!v) {
      const conv = ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = renderIR(ctx, r.ir);
      const g = ctx.createGain();
      g.gain.value = 0;
      conv.connect(g).connect(this.master);
      v = this.verbs[id] = { conv, g, linked: false, unlink: 0 };
    }
    clearTimeout(v.unlink);
    if (!v.linked) {
      this.verbIn.connect(v.conv);
      v.linked = true;
    }
    v.g.gain.setTargetAtTime(1, t, tc);
    for (const [k, o] of Object.entries(this.verbs)) {
      if (k === id) continue;
      o.g.gain.setTargetAtTime(0, t, tc);
      if (o.linked && !this.offline) {
        clearTimeout(o.unlink);
        o.unlink = setTimeout(() => {
          if (this.room === k || !o.linked) return;
          this.verbIn.disconnect(o.conv);
          o.linked = false;
        }, 3000);
      }
    }
    this.sfxSend.gain.setTargetAtTime(this.dry ? 0 : r.sfxSend, t, tc);
    this.musicSend.gain.setTargetAtTime(this.dry ? 0 : r.musicSend, t, tc);
  }

  // ------------------------------------------------------------ building blocks

  panner(pan = 0, dest = this.sfx) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -0.9, 0.9);
    p.connect(dest);
    return p;
  }

  // a looping noise source, started somewhere random in its loop
  loopSrc(buffer, t = this.ctx.currentTime) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(t, Math.random() * (buffer.duration - 0.2));
    return s;
  }

  // A pre-rendered instrument note, cached per instrument and pitch. Notes
  // are rendered at a rate that suits their content (a bass needs far fewer
  // samples than a chime), and the cache forgets the least recently used
  // ones, so a room change does not keep every instrument in memory.
  note(inst, m, t, vel, pan = 0, dest = this.tones) {
    const ctx = this.ctx;
    m = Math.round(m);
    const key = inst + m;
    let buf = this.notes.get(key);
    if (buf) this.notes.delete(key);
    else {
      const sr = NOTE_RATE[inst] || 24000;
      buf = mono(ctx, renderNote(sr, inst, m), sr);
      if (this.notes.size >= NOTE_CACHE) this.notes.delete(this.notes.keys().next().value);
    }
    this.notes.set(key, buf);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vel;
    s.connect(g).connect(pan ? this.panner(pan, dest) : dest);
    s.start(Math.max(t, ctx.currentTime));
  }

  // filtered noise with a one-shot envelope; `f1` sweeps the filter
  burst({ t, buffer = this.pink, type = 'bandpass', f = 1000, f1 = 0, q = 1, peak = 0.1, attack = 0.005, decay = 0.08, dest = this.sfx }) {
    const ctx = this.ctx;
    const fl = filter(ctx, type, f, q);
    fl.frequency.setValueAtTime(f, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = ctx.createGain();
    g.gain.value = 0;
    const end = env(g.gain, t, peak, attack, decay);
    const s = this.loopSrc(buffer, t);
    s.connect(fl).connect(g).connect(dest);
    s.stop(end + 0.02);
  }

  // moving air: pink noise through a band that rises then eases back, and a
  // pan that travels
  whoosh({ t, dur = 0.8, f0 = 400, f1 = 1600, q = 1.2, peak = 0.06, pan0 = 0, pan1 = 0 }) {
    const ctx = this.ctx;
    const bp = filter(ctx, 'bandpass', f0, q);
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.55);
    bp.frequency.exponentialRampToValueAtTime(f1 * 0.7, t + dur);
    const g = ctx.createGain();
    g.gain.value = 0;
    const end = env(g.gain, t, peak, dur * 0.45, dur * 0.55);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan0, t);
    p.pan.linearRampToValueAtTime(pan1, end);
    p.connect(this.sfx);
    const s = this.loopSrc(this.pink, t);
    s.connect(bp).connect(filter(ctx, 'lowpass', 3500, -3)).connect(g).connect(p);
    s.stop(end + 0.02);
  }

  // ------------------------------------------------------------ clacks

  // A wooden block hitting something. strength 0..1 sets loudness and
  // brightness; material is the moving block's ('wood'|'paint'|'rubber'|
  // 'metal'); other is what it hit ('block'|'wood'|'rug'|'stone'); size is
  // the block's largest dimension in metres. For block-on-block hits,
  // otherSize/otherMaterial (optional) let the other block ring true too.
  clack({ strength = 0.5, material = 'wood', other = 'block', size = 0.04, pan = 0, otherSize = 0, otherMaterial = '' } = {}) {
    if (!this.ready()) return;
    const s = clamp(Number(strength) || 0, 0, 1);
    if (s < 0.01) return;
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    const spec = this.clackLayers(s, material, other, clamp(Number(size) || 0.04, 0.015, 0.25), otherSize, otherMaterial);
    // Many voices at once each give way a little, so a crash swells rather
    // than piling up into a wall of sound.
    const crowd = 1 / Math.sqrt(1 + 0.4 * this.voices.length);
    const level = CLACK * (0.08 + 0.92 * s ** 1.3) * spec.gain * rnd(0.85, 1.1) * crowd;
    if (!this.admit(now, s, level)) {
      this.stats.dropped++;
      return;
    }
    // Real hits land between animation frames; spreading each frame's batch
    // over a few milliseconds keeps them off a 60 Hz grid.
    const t = now + 0.003 + (this.inFrame - 1) * 0.0025 + Math.random() * 0.008;
    this.voice(t, spec.layers, level, spec.cutoff, pan, true);
    this.stats.clacks++;
    this.sweepRolls();
  }

  // Map a physics 'impact' event straight to a clack: `floor` is the room's
  // floor kind, `sizeOf(handle)` gives a block's largest dimension, `pan`
  // the hit's screen position (-1..1).
  impact(e, { floor = 'wood', sizeOf = () => 0.04, pan = 0 } = {}) {
    if (!e) return;
    const [ma = 'wood', mb = 'wood'] = e.materials || [];
    const strength = clamp((e.speed || 0) / 1.4, 0, 1);
    if (!e.b) {
      this.clack({ strength, material: ma, other: floor, size: sizeOf(e.a), pan });
      return;
    }
    // the softer or heavier striker leads: a ball or wrecking ball, else the
    // smaller block, which rings higher over the other
    const tool = (m) => m === 'rubber' || m === 'metal';
    const aLeads = tool(ma) || (!tool(mb) && sizeOf(e.a) <= sizeOf(e.b));
    const [s, o, sm, om] = aLeads ? [e.a, e.b, ma, mb] : [e.b, e.a, mb, ma];
    this.clack({ strength, material: sm, other: 'block', size: sizeOf(s), pan, otherSize: sizeOf(o), otherMaterial: om });
  }

  clackLayers(s, material, other, size, otherSize, otherMaterial) {
    const hard = s < 0.3 ? 0 : s < 0.65 ? 1 : 2;
    const layers = [];
    let cutoff = 1300 * 2 ** (s * 2.35);
    const paint = material === 'paint';
    const rubber = material === 'rubber';
    const floor = other === 'wood' || other === 'rug' || other === 'stone';
    if (rubber) {
      // a ball: its own soft bup, and the block it meets hardly rings
      layers.push([pick(this.rubber), 1, rnd(0.93, 1.07)]);
      cutoff = Math.min(cutoff, 2000);
      if (other === 'block') layers.push(this.blockLayer(otherSize || rnd(0.04, 0.08), otherMaterial === 'paint', 0, 0.35));
    } else {
      // metal (a wrecking ball) is hard and heavy; the rug softens any blow
      const h = material === 'metal' ? Math.min(2, hard + 1) : other === 'rug' ? 0 : other === 'stone' ? Math.max(1, hard) : hard;
      layers.push(this.blockLayer(size, paint, h, other === 'rug' ? 0.45 : 0.8));
      if (other === 'block') {
        const op = otherMaterial ? otherMaterial === 'paint' : Math.random() < 0.3;
        layers.push(this.blockLayer(otherSize || rnd(0.04, 0.1), op, h, material === 'metal' ? 0.8 : 0.5));
      }
    }
    if (floor) {
      const w = { wood: 0.45, rug: 0.8, stone: 0.4 }[other] * (size / 0.04) ** 0.5 * (rubber ? 0.5 : 1);
      layers.push([pick(this.floors[other]), Math.min(w, 1.6), rnd(0.95, 1.05)]);
      if (other === 'rug') cutoff = Math.min(cutoff, 1500);
      if (other === 'stone') cutoff *= 1.2;
    }
    if (paint) cutoff *= 1.12;
    return { layers, cutoff: Math.min(cutoff, 7500), gain: (size / 0.04) ** 0.25 };
  }

  // a block's own tock: the nearest rendered size, retuned to the real one
  blockLayer(size, paint, hard, gain) {
    let ci = 0;
    let best = Infinity;
    CLASSES.forEach((c, i) => {
      const d = Math.abs(Math.log(size / c));
      if (d < best) {
        best = d;
        ci = i;
      }
    });
    const rate = clamp((CLASSES[ci] / size) ** 0.6, 0.7, 1.45) * rnd(0.97, 1.03);
    return [pick(this.blocks[ci][paint ? 1 : 0][hard]), gain, rate];
  }

  // The clack budget. Faint hits are the first to go when a frame or the
  // bucket is full; when every voice is busy the quietest one (as it sounds
  // now) is faded out fast, unless the new hit is quieter still.
  admit(now, s, level) {
    this.tokens = Math.min(BURST, this.tokens + (now - this.tokenAt) * RATE);
    this.tokenAt = now;
    if (now - this.frameAt > 0.008) {
      this.frameAt = now;
      this.inFrame = 0;
    }
    const strong = s > 0.55;
    if (!strong && (this.tokens < 1 || this.inFrame >= PER_FRAME)) return false;
    if (this.inFrame >= PER_FRAME * 2) return false;
    if (this.voices.length >= MAX_VOICES) {
      let q = null;
      let ql = Infinity;
      for (const v of this.voices) {
        const l = v.level * Math.exp(-Math.max(0, now - v.t) / 0.05);
        if (l < ql) {
          ql = l;
          q = v;
        }
      }
      if (ql > level) return false;
      this.release(q, now);
      this.stats.stolen++;
    }
    this.tokens = Math.max(0, this.tokens - 1);
    this.inFrame++;
    return true;
  }

  release(v, now) {
    for (const g of v.gains) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.006);
    }
    for (const s of v.srcs) {
      try {
        s.stop(now + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.voices.splice(this.voices.indexOf(v), 1);
  }

  // One voice: each layer [buffer, gain, rate] through a brightness
  // low-pass, a level and a pan. Every layer gets its own chain on purpose:
  // in Chrome a short-lived node fed by two sources costs several times more
  // than two separate chains (measured with _dev/audio.html), and a crash
  // makes over a hundred of these.
  voice(t, layers, level, cutoff, pan, track) {
    const ctx = this.ctx;
    const srcs = [];
    const gains = [];
    let life = 0;
    for (const [buf, gain, rate] of layers) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = level * gain;
      s.connect(filter(ctx, 'lowpass', cutoff, -3)).connect(g).connect(this.panner(pan * 0.85));
      s.start(t);
      srcs.push(s);
      gains.push(g);
      life = Math.max(life, buf.duration / rate);
    }
    if (track) this.voices.push({ srcs, gains, t, end: t + life, level });
  }

  // ------------------------------------------------------------ rolling

  // Call every frame for each rolling thing: id is stable per object ('ball-3',
  // 'car-1', a block id...), speed in m/s (0 fades it out), surface is the
  // floor kind or 'block'. kind ('ball'|'car'|'wood') defaults from the id.
  // If the calls stop, the sound fades out by itself.
  roll(id, speed, pan = 0, surface = 'wood', kind) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const sp = Math.max(0, Number(speed) || 0);
    let v = this.rolls.get(id);
    if (!v) {
      if (sp < 0.03 || !this.ready()) return;
      const s = String(id);
      v = this.makeRoll(kind || (s.startsWith('ball') ? 'ball' : s.startsWith('car') ? 'car' : 'wood'));
      this.rolls.set(id, v);
    }
    v.last = now;
    const k = ROLL[v.kind];
    const surf = SURFACE[surface] || SURFACE.wood;
    const x = clamp(sp / k.full, 0, 1);
    const g = v.g.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(k.level * surf.level * x ** 1.2, now, 0.05);
    // a dead man's handle: if updates stop, so does the sound
    g.setTargetAtTime(0, now + 0.25, 0.08);
    v.bp.frequency.setTargetAtTime(k.f * surf.f * (0.65 + 0.7 * x), now, 0.06);
    v.lp.frequency.setTargetAtTime(k.lp * surf.lp * (0.7 + 0.5 * x), now, 0.06);
    v.am.frequency.setTargetAtTime(Math.max(0.5, sp / (2 * Math.PI * k.radius)), now, 0.1);
    v.p.pan.setTargetAtTime(clamp(pan, -0.85, 0.85), now, 0.05);
  }

  makeRoll(kind) {
    const ctx = this.ctx;
    const k = ROLL[kind];
    const bp = filter(ctx, 'bandpass', k.f, k.q);
    const lp = filter(ctx, 'lowpass', k.lp, -3);
    // once a turn the contact patch meets a seam or a flat spot: a soft pulse
    const trem = ctx.createGain();
    trem.gain.value = 1 - k.am * 0.5;
    const am = ctx.createOscillator();
    am.type = 'triangle';
    am.frequency.value = 3;
    const depth = ctx.createGain();
    depth.gain.value = k.am * 0.5;
    am.connect(depth).connect(trem.gain);
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createStereoPanner();
    const src = this.loopSrc(this[k.noise]);
    src.connect(bp).connect(lp).connect(trem).connect(g).connect(p).connect(this.sfx);
    am.start();
    return { kind, src, am, bp, lp, g, p, last: ctx.currentTime };
  }

  sweepRolls(force = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [id, v] of this.rolls) {
      if (!force && now - v.last < 1.5) continue;
      if (force) {
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setTargetAtTime(0, now, 0.03);
      }
      v.src.stop(now + 0.2);
      v.am.stop(now + 0.2);
      this.rolls.delete(id);
    }
  }

  // Stop every continuous sound (rolling, the car's motor): for leaving a game.
  hush() {
    this.sweepRolls(true);
    if (this.whirr) this.whirr.stop();
  }

  // ------------------------------------------------------------ Little ones

  // A block pops into being above the tower: a round "bloop" that bends up,
  // like a cork easing out, and a breath of air.
  drop(pan = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const p = this.panner(pan);
    const k = rnd(0.94, 1.06);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(300 * k, t);
    o.frequency.exponentialRampToValueAtTime(640 * k, t + 0.09);
    const g = ctx.createGain();
    g.gain.value = 0;
    const end = env(g.gain, t, 0.18, 0.014, 0.13);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(end + 0.01);
    // a quiet octave above, for presence on small speakers
    const o2 = ctx.createOscillator();
    o2.frequency.setValueAtTime(600 * k, t);
    o2.frequency.exponentialRampToValueAtTime(1280 * k, t + 0.09);
    const g2 = ctx.createGain();
    g2.gain.value = 0;
    env(g2.gain, t, 0.036, 0.014, 0.13);
    o2.connect(g2).connect(this.panner(pan));
    o2.start(t);
    o2.stop(end + 0.01);
    this.burst({ t, type: 'bandpass', f: 800, q: 0.8, peak: 0.05, attack: 0.008, decay: 0.07, dest: this.panner(pan) });
  }

  // A pentatonic marimba note that climbs with each block in the tower,
  // with a faint chime an octave up; past the top it keeps to the top octave.
  growNote(i = 0, pan = 0) {
    if (!this.ready()) return;
    const n = Math.max(0, Math.floor(i));
    const idx = n < 11 ? n : 6 + ((n - 11) % 5);
    const m = penta(this.tonic + 12, idx);
    const t = this.ctx.currentTime + 0.01;
    this.note('marimba', m, t, 0.3, pan);
    this.note('bell', m + 12, t + 0.004, 0.08, pan);
  }

  // A quieter kalimba accent as a block lands (pass the tower's height index).
  land(i = 0, pan = 0) {
    if (!this.ready()) return;
    const n = Math.max(0, Math.floor(i));
    const idx = n < 11 ? n : 6 + ((n - 11) % 5);
    this.note('kalimba', penta(this.tonic + 12, idx), this.ctx.currentTime + 0.01, 0.14, pan);
  }

  // The joyful accent for a big crash: a quick xylophone run up the scale
  // that sweeps across, landing on a soft chord and a sprinkle of chimes.
  // It comes a beat after the first clacks so it never masks them.
  crash(size = 0.5) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (now - this.crashAt < 1.5) return;
    this.crashAt = now;
    const s = clamp(size, 0, 1);
    const t = now + 0.12;
    const n = 6 + Math.round(8 * s);
    const b = this.tonic + 12;
    let at = t;
    for (let k = 0; k < n; k++) {
      this.note('xylo', penta(b, k), at, 0.11 + 0.07 * Math.sin((Math.PI * (k + 0.5)) / n), -0.5 + k / n);
      at += 0.045 * (1 - k * 0.015);
    }
    for (const [d, iv] of [[0, 0], [0.03, 4], [0.06, 7]]) this.note('marimba', b + 12 + iv, at + d, 0.09);
    for (let k = 0; k < 3 + Math.round(3 * s); k++) this.note('bell', penta(b + 24, Math.floor(rnd(0, 7))), at + 0.12 + k * rnd(0.07, 0.12), rnd(0.09, 0.15), rnd(-0.5, 0.5));
    this.music.duck(0.5, 2.4);
  }

  // The magic tidy-away: a soft whoosh that travels across the room,
  // dusted with twinkles.
  sweep(duration = 1.8) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.02;
    this.whoosh({ t, dur: duration, f0: 450, f1: 2400, q: 1.6, peak: 0.1, pan0: -0.6, pan1: 0.6 });
    const b = this.tonic + 24;
    for (let k = 0; k < 10; k++) {
      const u = k / 10;
      this.note('bell', penta(b, Math.floor(rnd(0, 6))), t + u * duration * 0.85 + rnd(0, 0.05), rnd(0.08, 0.14), -0.6 + 1.2 * u);
    }
  }

  // One rising plink per block flying away in the sweep.
  plink(i = 0, pan = 0) {
    if (!this.ready()) return;
    const n = Math.max(0, Math.floor(i));
    const m = penta(this.tonic + 12, 2 + (n % 10));
    this.note('bell', m, this.ctx.currentTime + 0.005, 0.15, pan || (n % 2 ? 0.25 : -0.25));
  }

  // ------------------------------------------------------------ Big kid

  // Bright sparkle blips for points: more for bigger scores.
  points(n = 1) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (now - this.pointsAt < 0.05) return;
    this.pointsAt = now;
    const count = clamp(1 + Math.floor(Math.log2(Math.max(1, n))), 1, 4);
    const b = this.tonic + 24;
    const start = Math.floor(rnd(2, 5));
    for (let k = 0; k < count; k++) this.note('bell', penta(b, start + k), now + 0.005 + k * 0.05, 0.12, rnd(-0.3, 0.3));
  }

  // A challenge done: a quick marimba pickup up the triad, then the octave
  // over a rolled chord and a soft bass, with a few chimes.
  challenge() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.03;
    const b = this.tonic + 12;
    [[0, 0, 0.2], [4, 0.1, 0.2], [7, 0.2, 0.22], [12, 0.32, 0.3], [12, 0.47, 0.14], [12, 0.58, 0.1]].forEach(([iv, d, v]) => this.note('marimba', b + iv, t + d, v));
    for (const [iv, d] of [[0, 0.32], [4, 0.345], [7, 0.37]]) this.note('marimba', b + iv, t + d, 0.12);
    this.note('bass', this.tonic - 12, t + 0.32, 0.3);
    for (let k = 0; k < 3; k++) this.note('bell', penta(b + 24, Math.floor(rnd(0, 6))), t + 0.5 + k * 0.1, 0.1, rnd(-0.4, 0.4));
    this.music.duck(0.45, 1.6);
  }

  // A new best: a bright run two octaves up the scale landing on a ringing
  // kalimba chord, with chimes.
  best() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.03;
    const b = this.tonic + 12;
    for (let k = 0; k < 10; k++) this.note('marimba', penta(b, k), t + k * 0.055, 0.16 + k * 0.008, -0.4 + k * 0.08);
    const top = t + 10 * 0.055 + 0.03;
    for (const [iv, d] of [[12, 0], [16, 0.02], [19, 0.04], [24, 0.06]]) this.note('kalimba', b + iv, top + d, 0.16);
    for (let k = 0; k < 5; k++) this.note('bell', penta(b + 24, Math.floor(rnd(0, 7))), top + 0.1 + k * 0.09, 0.1, rnd(-0.5, 0.5));
    this.music.duck(0.4, 2.2);
  }

  // Near the tipping point (amount 0..1, call every frame): now and then a
  // very soft wooden creak, and a block ticking against its neighbour.
  wobble(amount = 0, pan = 0) {
    if (!this.ready()) return;
    const a = clamp(Number(amount) || 0, 0, 1);
    const now = this.ctx.currentTime;
    if (a < 0.15 || now < this.wobbleAt) return;
    const k = (a - 0.15) / 0.85;
    this.wobbleAt = now + rnd(0.9, 1.8) * (1.6 - k);
    if (Math.random() < 0.35 + 0.45 * k) this.creak(k, pan);
    const n = 1 + (Math.random() < k ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const t = now + 0.04 + i * rnd(0.06, 0.14);
      const layer = this.blockLayer(rnd(0.04, 0.08), false, 0, 1);
      this.voice(t, [layer], CLACK * rnd(0.035, 0.06) * (0.6 + 0.4 * k), 1600, pan + rnd(-0.1, 0.1), false);
    }
  }

  // Blocks rubbing under load stick and slip: a train of tiny clicks rung
  // through the wood's resonances. Short, quiet, never a door-in-the-night
  // groan.
  creak(k = 0.5, pan = 0, t = this.ctx.currentTime + 0.01, level = 1) {
    const ctx = this.ctx;
    const dur = rnd(0.22, 0.4);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = rnd(24, 34);
    o.frequency.setValueCurveAtTime(Float32Array.from([1, rnd(1.1, 1.4), rnd(0.9, 1.3), rnd(1.2, 1.6)], (x) => base * x), t, dur);
    const hp = filter(ctx, 'highpass', 300, -3);
    o.connect(hp);
    let end = t;
    for (const [f, q, a] of [[rnd(600, 760), 7, 1], [rnd(1050, 1300), 8, 0.8]]) {
      const g = ctx.createGain();
      g.gain.value = 0;
      end = env(g.gain, t, 0.12 * a * (0.5 + 0.5 * k) * level, dur * 0.35, dur * 0.65);
      hp.connect(filter(ctx, 'bandpass', f, q)).connect(g).connect(this.panner(pan));
    }
    o.start(t);
    o.stop(end + 0.02);
  }

  // ------------------------------------------------------------ UI and tools

  // choosing something: two soft marimba notes up a fourth
  select() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + 0.005;
    const b = this.tonic + 12;
    this.note('marimba', penta(b, 3), t, 0.14);
    this.note('marimba', penta(b, 5), t + 0.07, 0.16);
  }

  // a button: a tiny wooden tick
  click() {
    if (!this.ready()) return;
    const [buf] = this.blockLayer(0.04, false, 0, 1);
    this.voice(this.ctx.currentTime + 0.003, [[buf, 1, rnd(1.2, 1.3)]], CLACK * 0.22, 3200, 0, false);
  }

  // Tool sounds: 'windup' (the key's ratchet), 'car' (the clockwork motor;
  // returns a handle { update(speed 0..1, pan), stop() } and otherwise runs
  // down by itself over opts.duration), 'ball' (a soft rubber bump),
  // 'wrecker' (the rope creaks and the ball whooshes), 'flick' (a finger).
  tool(id, opts = {}) {
    if (!this.ready()) return null;
    const t = this.ctx.currentTime + 0.005;
    const pan = opts.pan || 0;
    if (id === 'windup') {
      // three half turns of the key, each a run of pawl clicks over the gear
      let at = t;
      for (let turn = 0; turn < 3; turn++) {
        for (let c = 0; c < 5; c++) {
          this.voice(at, [[pick(this.ratchet), 1, rnd(0.96, 1.04)]], CLACK * rnd(0.08, 0.11), 5200, pan, false);
          at += rnd(0.042, 0.055);
        }
        at += 0.1;
      }
      return null;
    }
    if (id === 'car') return this.motor(opts.duration || 2.6, pan);
    if (id === 'ball') {
      this.voice(t, [[pick(this.rubber), 1, rnd(0.93, 1.07)], [pick(this.floors.wood), 0.25, 1]], CLACK * 0.5, 1600, pan, false);
      return null;
    }
    if (id === 'wrecker') {
      this.creak(0.3, pan - 0.3, t, 0.6);
      this.whoosh({ t: t + 0.25, dur: 0.9, f0: 280, f1: 900, q: 1.1, peak: 0.2, pan0: pan - 0.5, pan1: pan + 0.3 });
      return null;
    }
    if (id === 'flick') {
      // the fingernail slipping off the thumb, and a puff of air
      this.burst({ t, buffer: this.pink, type: 'bandpass', f: 2200, f1: 900, q: 1.1, peak: 0.4, attack: 0.004, decay: 0.07 });
      this.burst({ t, buffer: this.noise, type: 'bandpass', f: 2800, q: 2, peak: 0.12, attack: 0.001, decay: 0.012 });
      return null;
    }
    return null;
  }

  // The wind-up car's clockwork: gear teeth buzzing at a rate set by the
  // spring, with a whirr of air, running down as the spring unwinds.
  motor(duration = 2.6, pan = 0) {
    const ctx = this.ctx;
    if (this.whirr) this.whirr.stop();
    const t = ctx.currentTime + 0.01;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.setTargetAtTime(50, t + 0.1, duration * 0.5);
    const g = ctx.createGain();
    g.gain.value = 0;
    const peak = 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.06);
    g.gain.setTargetAtTime(0, t + duration * 0.55, duration * 0.15);
    const p = this.panner(pan);
    o.connect(filter(ctx, 'highpass', 600, -3)).connect(filter(ctx, 'bandpass', 1700, 1.3)).connect(filter(ctx, 'lowpass', 3500, -3)).connect(g);
    const n = this.loopSrc(this.pink, t);
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    n.connect(filter(ctx, 'bandpass', 950, 1.1)).connect(ng).connect(g);
    g.connect(p);
    const end = t + duration + 0.5;
    o.start(t);
    o.stop(end);
    n.stop(end);
    let done = false;
    const handle = {
      update: (speed = 1, pan2 = pan) => {
        if (done) return;
        const now = ctx.currentTime;
        const s = clamp(speed, 0, 1);
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(peak * s ** 0.7, now, 0.05);
        o.frequency.cancelScheduledValues(now);
        o.frequency.setTargetAtTime(45 + 55 * s, now, 0.08);
        p.pan.setTargetAtTime(clamp(pan2, -0.85, 0.85), now, 0.05);
      },
      stop: () => {
        if (done) return;
        done = true;
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(0, now, 0.05);
        try {
          o.stop(now + 0.3);
          n.stop(now + 0.3);
        } catch {
          /* already stopping */
        }
        if (this.whirr === handle) this.whirr = null;
      },
    };
    this.whirr = handle;
    return handle;
  }

  // A garden bird somewhere off to one side: a short phrase of quick,
  // sweeping whistles. Very soft; it belongs to the music.
  bird(t, dest) {
    const ctx = this.ctx;
    const pan = rnd(-0.7, 0.7);
    const kind = Math.floor(Math.random() * 3);
    const k = rnd(0.9, 1.1);
    const chirps = [];
    if (kind === 0) {
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) chirps.push([i * 0.15, [2900, 4000, 3500], 0.075, 1]);
    } else if (kind === 1) {
      for (let i = 0; i < 6; i++) chirps.push([i * 0.07, i % 2 ? [3300, 3000] : [2700, 3200], 0.055, 0.7]);
    } else {
      chirps.push([0, [3800, 3600, 2500], 0.24, 1], [0.34, [3700, 3500, 2500], 0.22, 0.8]);
    }
    for (const [dt, fs, dur, amp] of chirps) {
      const at = t + dt;
      const o = ctx.createOscillator();
      o.frequency.setValueCurveAtTime(Float32Array.from(fs, (f) => f * k), at, dur);
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueCurveAtTime(hannCurve(0.1 * amp), at, dur);
      o.connect(g).connect(this.panner(pan, dest));
      o.start(at);
      o.stop(at + dur + 0.01);
    }
  }
}

// ------------------------------------------------------------ music

// A step sequencer that composes each eight-bar pass as it goes: the room's
// accompaniment under a pentatonic tune built from a two-bar motif.
class Music {
  constructor(audio) {
    this.a = audio;
    const ctx = (this.ctx = audio.ctx);
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.duckG = ctx.createGain();
    this.fade.connect(this.duckG);
    this.duckG.connect(audio.master);
    this.duckG.connect(audio.musicSend);
    this.buses = [-0.35, 0, 0.35].map((p) => audio.panner(p, this.fade));
    this.running = false;
    this.timer = 0;
    this.pending = null;
    this.room = null;
  }

  start(room) {
    const t = this.ctx.currentTime;
    if (this.running) {
      if (room !== (this.pending || this.room)) {
        // let this tune fade, then begin the new room's from a fresh bar
        this.fade.gain.cancelScheduledValues(t);
        this.fade.gain.setTargetAtTime(0, t, 0.25);
        this.pending = room;
        this.switchAt = t + 1.1;
      }
      return;
    }
    this.running = true;
    this.pending = null;
    this.begin(room, t + 0.15);
    if (!this.a.offline) this.timer = setInterval(() => this.pump(), 60);
    this.pump();
  }

  begin(room, t) {
    this.room = room;
    this.style = STYLES[room] || STYLES.playroom;
    this.step = 0;
    this.next = t;
    this.planLoop = -1;
    this.motif = null;
    this.birdAt = t + rnd(3, 6);
    const g = this.fade.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(MUSIC * this.style.level, t, 0.6);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.pending = null;
    const t = this.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setTargetAtTime(0, t, 0.3);
  }

  // dip the music under a fanfare or a crash, then bring it back
  duck(amount = 0.5, time = 1.5) {
    const g = this.duckG.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(amount, t, 0.08);
    g.setTargetAtTime(1, t + time, 0.5);
  }

  // Schedule every step that starts before `horizon` (default: a little
  // ahead of now). The offline test calls it once for the whole render.
  pump(horizon) {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const until = horizon ?? now + 0.3;
    if (this.next < now - 0.05) {
      // the timer fell behind (a long frame, a throttled tab): skip ahead
      // rather than cram the missed notes in at once
      const k = Math.ceil((now - this.next) / this.style.stepLen);
      this.step += k;
      this.next += k * this.style.stepLen;
    }
    while (this.next < until) {
      if (this.pending && this.next >= this.switchAt) {
        const r = this.pending;
        this.pending = null;
        this.begin(r, this.next);
      }
      this.play(this.step, this.next);
      this.step++;
      this.next += this.style.stepLen;
    }
  }

  play(step, t) {
    const st = this.style;
    const loopLen = st.spb * 8;
    const li = Math.floor(step / loopLen);
    if (li !== this.planLoop) {
      this.plan = this.compose(li);
      this.planLoop = li;
    }
    // keep time while muted, but spare the work
    if (this.a.muted) return;
    const evs = this.plan[step % loopLen];
    if (evs) for (const [inst, m, vel, bus, jit] of evs) this.a.note(inst, m, t + jit, vel, 0, this.buses[bus]);
    if (st.birds && t >= this.birdAt) {
      this.a.bird(t, this.fade);
      this.birdAt = t + rnd(5, 13);
    }
  }

  // One eight-bar pass. The tune is a two-bar motif, answered, contrasted
  // and brought home (A A' B A''); the motif is kept or reshaped from the
  // last pass, so it is familiar without repeating exactly. Every fourth
  // pass the tune rests for half the loop: that space is what stops a loop
  // from nagging.
  compose(loop) {
    const st = this.style;
    const spb = st.spb;
    const plan = [];
    const add = (step, ev) => (plan[step] || (plan[step] = [])).push(ev);
    const prog = loop % 2 && st.alt ? st.alt : st.prog;
    prog.forEach((deg, bar) => {
      const ch = triad(deg);
      for (const [s, tone, oct, vel] of st.compPat) add(bar * spb + s, [st.comp, st.compBase + ch[tone] + 12 * oct, vel * rnd(0.85, 1.1), 0, rnd(0, 0.012)]);
      if (st.bass) for (const [s, tone, oct, vel] of st.bassPat) add(bar * spb + s, [st.bass, st.bassBase + ch[tone] + 12 * oct, vel * rnd(0.9, 1.05), 1, 0]);
    });
    if (!this.motif || Math.random() < 0.6) this.motif = motif(st, this.motif);
    const rest = loop % 4 === 3;
    let idx = pick([2, 4, 5]);
    for (let bar = 0; bar < 8; bar++) {
      const phrase = bar >> 1;
      const half = bar & 1;
      const pcs = triad(prog[bar]).map((x) => x % 12);
      const last = bar === 7;
      const fresh = phrase === 2;
      const rhythm = last ? st.end : fresh ? pick(st.rhythms) : this.motif.rhythm[half];
      rhythm.forEach(([s], k) => {
        let step = fresh ? pick(STEPS) : this.motif.steps[half][k % this.motif.steps[half].length];
        if (phrase === 1 && half === 1 && k === 0) step += 1; // the answer reaches a little higher
        if (idx + step > 8 || idx + step < 1) step = -step;
        idx = clamp(idx + step, 0, 9);
        // strong beats and the last note sit on a chord tone
        if (s === 0 || (st.beats === 4 && s === 4) || (last && k === rhythm.length - 1)) idx = chordTone(idx, pcs);
        if (rest && bar < 4) return;
        add(bar * spb + s, [st.lead, penta(st.leadBase, idx), st.leadVel * (s === 0 ? 1 : 0.82) * rnd(0.88, 1.08), 1, rnd(0, 0.006)]);
      });
    }
    return plan;
  }
}

function motif(st, prev) {
  if (prev && Math.random() < 0.5) {
    // reshape one bar of the old motif
    const m = { rhythm: prev.rhythm.slice(), steps: prev.steps.map((s) => s.slice()) };
    const h = Math.random() < 0.5 ? 0 : 1;
    m.rhythm[h] = pick(st.rhythms);
    m.steps[h] = m.rhythm[h].map(() => pick(STEPS));
    return m;
  }
  const rhythm = [pick(st.rhythms), pick(st.rhythms)];
  return { rhythm, steps: rhythm.map((r) => r.map(() => pick(STEPS))) };
}

// the nearest pentatonic index whose note belongs to the chord
function chordTone(idx, pcs) {
  for (const d of [0, -1, 1, -2, 2]) {
    const j = idx + d;
    if (j >= 0 && j <= 9 && pcs.includes(PENTA[j % 5])) return j;
  }
  return idx;
}

// ------------------------------------------------------------ Web Audio helpers

function filter(ctx, type, freq, q) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function mono(ctx, data, sr = ctx.sampleRate) {
  const b = ctx.createBuffer(1, data.length, sr);
  b.getChannelData(0).set(data);
  return b;
}

// A one-shot envelope from exactly 0 back to exactly 0: a raised-cosine
// rise, then an exponential fall whose last stretch tapers to nothing, so
// nothing clicks. Returns the end time.
function env(param, t, peak, attack, decay) {
  attack = Math.max(0.002, attack);
  const total = attack + decay;
  const n = clamp(Math.ceil(total * 1500), 32, 2048);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    let v;
    if (s < attack) v = 0.5 - 0.5 * Math.cos((Math.PI * s) / attack);
    else {
      const u = (s - attack) / decay;
      v = Math.exp(-4 * u) * (u > 0.7 ? 0.5 + 0.5 * Math.cos((Math.PI * (u - 0.7)) / 0.3) : 1);
    }
    c[i] = v * peak;
  }
  c[n - 1] = 0;
  param.setValueCurveAtTime(c, t, total);
  return t + total;
}

function hannCurve(peak, n = 64) {
  return Float32Array.from({ length: n }, (_, i) => peak * Math.sin((Math.PI * i) / (n - 1)) ** 2);
}

// linear to 0.7, then eased towards 0.98: only the rarest peaks feel it
function softClip() {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
  }
  return c;
}

// Two seconds of noise: white, pink (Paul Kellet's filter) or brown.
function noiseData(kind, sr) {
  const n = sr * 2;
  const d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w * 0.5;
  }
  // no DC, and a loop seam that does not click
  let m = 0;
  for (let i = 0; i < n; i++) m += d[i];
  m /= n;
  for (let i = 0; i < n; i++) d[i] -= m;
  const x = 256;
  for (let i = 0; i < x; i++) {
    const k = i / x;
    d[i] = d[i] * k + d[n - x + i] * (1 - k);
  }
  return d.slice(0, n - x);
}

// The impact bank and noise, rendered once per page at a fixed rate (the
// browser resamples if the context runs at another), so it can be made
// before any AudioContext exists.
const BANK_RATE = 48000;
let BANK = null;
function bank() {
  if (BANK) return BANK;
  const sr = BANK_RATE;
  const variants = (spec) => Array.from({ length: VARIANTS }, () => renderImpact(sr, spec()));
  BANK = {
    noise: { white: noiseData('white', sr), pink: noiseData('pink', sr), brown: noiseData('brown', sr) },
    blocks: CLASSES.map((size) => [false, true].map((paint) => CONTACT.map((_, h) => variants(() => blockSpec(size, paint, h))))),
    floors: { wood: variants(() => floorSpec('wood')), rug: variants(() => floorSpec('rug')), stone: variants(() => floorSpec('stone')) },
    rubber: variants(RUBBER),
    ratchet: variants(RATCHET),
  };
  return BANK;
}

// ------------------------------------------------------------ offline DSP
// Plain JS that fills buffers once (or once per note).

function fadeTail(d, frac) {
  const n = d.length;
  const m = Math.max(1, Math.floor(n * frac));
  for (let i = 0; i < m; i++) d[n - m + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / m);
}

function normalise(d, peak = 1) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
  return d;
}

function onePoleLP(d, sr, fc) {
  const a = Math.exp((-2 * Math.PI * fc) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    y = (1 - a) * d[i] + a * y;
    d[i] = y;
  }
}

function onePoleHP(d, sr, fc) {
  const a = Math.exp((-2 * Math.PI * fc) / sr);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    y1 = a * (y1 + x - x1);
    x1 = x;
    d[i] = y1;
  }
}

// An impact, modelled physically. The contact force is a half-sine pulse of
// length `tc`, slightly roughened as real surfaces are; each mode [freq,
// amplitude, Q] is a two-pole resonator (a damped sine) driven by that
// force, so a longer, softer contact reaches the high modes less. What
// radiates is the surface's velocity, not its displacement, which also keeps
// a soft, slow push (a rug, a rubber ball) from turning into sub-bass. `click`
// adds the rate of change of the force, softened, which is what a small
// rigid body radiates as it is stopped: the dry "t" at the front of a tock.
// `fibre` adds a brush of soft noise (a rug). Starts and ends at zero.
function renderImpact(sr, { modes, tc, click = 0, rough = 0.15, len, hp = 0, fibre = 0 }) {
  const n = Math.ceil(len * sr);
  const out = new Float32Array(n);
  const nf = Math.max(2, Math.round(tc * sr));
  const force = new Float32Array(nf);
  let area = 0;
  for (let i = 0; i < nf; i++) {
    force[i] = Math.sin((Math.PI * (i + 0.5)) / nf) * (1 + rough * (Math.random() * 2 - 1));
    area += force[i];
  }
  for (const [f, amp, q] of modes) {
    if (f >= sr * 0.45 || amp <= 0) continue;
    const w = (2 * Math.PI * f) / sr;
    const r = Math.exp((-Math.PI * f) / (q * sr));
    const a1 = 2 * r * Math.cos(w);
    const a2 = r * r;
    const b = (amp * Math.sin(w)) / area;
    const vel = 1 / (2 * Math.sin(w / 2)); // keeps each mode at `amp`
    // stop once the mode is some 80 dB down
    const end = Math.min(n, nf + Math.ceil((q / (Math.PI * f)) * 9.2 * sr));
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < end; i++) {
      const y = (i < nf ? b * force[i] : 0) + a1 * y1 - a2 * y2;
      out[i] += (y - y1) * vel;
      y2 = y1;
      y1 = y;
    }
  }
  if (click) {
    const c = new Float32Array(Math.min(n, nf + 96));
    let prev = 0;
    for (let i = 0; i < c.length; i++) {
      const v = i < nf ? force[i] : 0;
      c[i] = v - prev;
      prev = v;
    }
    onePoleLP(c, sr, 5000);
    onePoleLP(c, sr, 5000);
    normalise(c, click);
    for (let i = 0; i < c.length; i++) out[i] += c[i];
  }
  if (fibre) {
    const m = Math.min(n, Math.ceil(0.08 * sr));
    const c = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const t = i / sr;
      c[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.014) * Math.min(1, t / 0.003);
    }
    onePoleLP(c, sr, 1600);
    onePoleHP(c, sr, 350);
    normalise(c, fibre);
    for (let i = 0; i < m; i++) out[i] += c[i];
  }
  if (hp) {
    onePoleHP(out, sr, hp);
    onePoleHP(out, sr, hp);
  }
  // keep only what is audible (down to -54 dB), so a voice frees itself as
  // soon as it falls silent
  return normalise(trim(out, 0.002), 1);
}

// A room's impulse response: a diffuse tail of noise decaying at the room's
// reverb time through a low-pass that closes as it dies (air and soft
// surfaces take the highs first), after a handful of early reflections that
// differ left and right. Normalised to unit energy per channel, so a send
// gain is simply the wet-to-dry energy ratio.
function renderIR(ctx, { rt, top, bottom, predelay, early }) {
  const sr = ctx.sampleRate;
  const n = Math.ceil(Math.min(2.5, rt * 1.4 + 0.05) * sr);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n);
    const p0 = Math.round(predelay * sr);
    let lp = 0;
    let tail = 0;
    for (let i = p0; i < n; i++) {
      const t = (i - p0) / sr;
      const fc = bottom + (top - bottom) * Math.exp((-3 * t) / rt);
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      lp = (1 - a) * (Math.random() * 2 - 1) + a * lp;
      d[i] = lp * Math.exp((-6.91 * t) / rt) * Math.min(1, t / 0.015 + 0.15);
      tail += d[i] * d[i];
    }
    // the early reflections carry about a third of the energy
    const smear = [0.5, 0.3, 0.15, 0.05];
    let e = 0;
    for (const [, g] of early) e += g * g;
    const k = Math.sqrt((tail * 0.5) / (e * smear.reduce((s, x) => s + x * x, 0)));
    for (const [time, g] of early) {
      const at = p0 + Math.round(time * sr * (ch ? 1.06 : 0.94));
      for (let j = 0; j < smear.length && at + j < n; j++) d[at + j] += g * smear[j] * k * (ch && j === 0 ? 0.9 : 1);
    }
    fadeTail(d, 0.15);
    let energy = 0;
    for (let i = 0; i < n; i++) energy += d[i] * d[i];
    const s = 1 / Math.sqrt(energy);
    for (let i = 0; i < n; i++) d[i] *= s;
    buf.getChannelData(ch).set(d);
  }
  return buf;
}

// One instrument note at midi pitch m. Partials above 7 kHz are left out and
// those above 3.5 kHz softened, so nothing is sharp; higher notes are a
// little quieter because ears are most sensitive up there.
function renderNote(sr, inst, m) {
  const f = mtof(m);
  const d = trim(inst === 'pluck' ? renderPluck(sr, f) : renderAdditive(sr, f, INST[inst](f)), 0.002);
  return normalise(d, f > 1000 ? (1000 / f) ** 0.35 : 1);
}

// Cut a signal where it falls below `floor` of its peak for good, easing
// the new end to zero.
function trim(d, floor) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  const th = m * floor;
  let cut = d.length - 1;
  while (cut > 0 && Math.abs(d[cut]) < th) cut--;
  if (cut >= d.length - 64) return d;
  const out = d.slice(0, cut + 64);
  fadeTail(out, 0.15);
  return out;
}

function renderAdditive(sr, f, { partials, attack, thump, len }) {
  const n = Math.ceil(len * sr);
  const d = new Float32Array(n);
  for (const [ratio, amp, tau] of partials) {
    const fr = f * ratio;
    if (fr > 7000 || fr > sr * 0.45) continue;
    const a0 = amp * (fr > 3500 ? 1 - (0.7 * (fr - 3500)) / 3500 : 1);
    const w = (2 * Math.PI * fr) / sr;
    const c = 2 * Math.cos(w);
    const k = Math.exp(-1 / (tau * sr));
    const end = Math.min(n, Math.ceil(tau * sr * 7));
    // a sine by recurrence, starting at phase 0
    let s1 = Math.sin(-w);
    let s2 = Math.sin(-2 * w);
    let e = a0;
    for (let i = 0; i < end; i++) {
      const s = c * s1 - s2;
      s2 = s1;
      s1 = s;
      d[i] += s * e;
      e *= k;
    }
  }
  if (thump) {
    const [amp, fc, tau] = thump;
    const m = Math.min(n, Math.ceil(tau * 8 * sr));
    const c = new Float32Array(m);
    for (let i = 0; i < m; i++) c[i] = (Math.random() * 2 - 1) * Math.exp(-i / (tau * sr));
    onePoleLP(c, sr, fc);
    onePoleLP(c, sr, fc);
    normalise(c, amp);
    for (let i = 0; i < m; i++) d[i] += c[i];
  }
  const na = Math.max(2, Math.round(attack * sr));
  for (let i = 0; i < na && i < n; i++) d[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / na);
  fadeTail(d, 0.3);
  return d;
}

// A soft, nylon-ish plucked string (Karplus-Strong): one period of softened
// noise circulates in a delay line whose averaging filter takes the highs
// first, with an all-pass for exact tuning.
function renderPluck(sr, f) {
  const n = Math.ceil(1.7 * sr);
  const d = new Float32Array(n);
  const D = sr / f;
  const N = Math.max(2, Math.floor(D - 0.6));
  const frac = D - 0.5 - N; // left for the all-pass, 0.1..1.1 samples
  const C = (1 - frac) / (1 + frac);
  const t60 = clamp(2.2 * (200 / f) ** 0.4, 0.7, 2.4);
  const rho = 10 ** (-3 / (f * t60));
  const line = new Float32Array(N);
  // a fingertip, not a pick: soft noise, plucked a fifth of the way along
  let lv = 0;
  let lv2 = 0;
  for (let i = 0; i < N; i++) {
    lv = 0.8 * lv + 0.2 * (Math.random() * 2 - 1);
    lv2 = 0.8 * lv2 + 0.2 * lv;
    line[i] = lv2;
  }
  const off = Math.max(1, Math.round(N / 5));
  const ex = line.slice();
  for (let i = 0; i < N; i++) line[i] = ex[i] - ex[(i + off) % N];
  let idx = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < n; i++) {
    const x = line[idx];
    const avg = 0.5 * (x + prev) * rho;
    prev = x;
    const ap = C * avg + apIn - C * apOut;
    apIn = avg;
    apOut = ap;
    line[idx] = ap;
    d[i] = x;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  onePoleLP(d, sr, 2600);
  onePoleHP(d, sr, 40);
  const na = Math.round(0.004 * sr);
  for (let i = 0; i < na; i++) d[i] *= i / na;
  fadeTail(d, 0.3);
  return d;
}
