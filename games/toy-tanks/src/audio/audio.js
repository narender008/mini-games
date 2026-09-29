// Toy Tanks' sound. Everything is synthesised with Web Audio at run time: no
// audio files and no voices, and nothing loud. Shots are toy pops and airy
// whooshes; explosions are splats, fizzes, confetti crackles, snow puffs and
// cheerful chimes; a hit tank giggles with squeaky-toy squeaks, a slide-whistle
// wobble and tiny chirps. Each stage has a quiet ambience bed (ambience.js) and
// a toy-box tune (music.js).
//
// How it is built:
//  - one-shots are rendered once into small buffers (sounds.js, from
//    physical-ish parts) and played through a short chain (source, gain, pan,
//    a send to a little room), so a burst costs a handful of nodes; each has
//    a few variants and a random pitch, level and timing, so repeats differ;
//  - tuned notes (chimes, sparkles, music) come from instruments.js and are
//    cached; sounds in the stage's key play in that key;
//  - continuous voices (aim, turret, drive, flight, wind) are small live graphs
//    built the first time they are used, whose gains and pitches glide to the
//    numbers the game gives them every frame; if the game stops calling, they
//    fade by themselves, and they are taken down after a while;
//  - everything meets in one bus with a gentle compressor and a soft ceiling
//    (about -4 dBFS), so nothing can be loud, whatever piles up.
// Everything is safe to call before unlock() and while muted. The same code
// runs on an OfflineAudioContext (attach), which the dev page uses to render
// and measure every sound without playing anything aloud.
import { SHOTS, LOOPS as BASE_LOOPS, KEYED, FIXED } from './sounds.js';
import { LOOPS as AMB_LOOPS, EVENTS, Ambience } from './ambience.js';
import { renderNote, NOTE_RATE } from './instruments.js';
import { Music, KEYS, STAGES, styleNotes, penta } from './music.js';
import { clamp, rand, pick, seeded, toBuffer } from './dsp.js';

const STORE = 'toy-tanks.muted';
const MASTER = 0.9;
// The compressor adds its own make-up gain; this takes it back off, so ordinary
// levels pass at unity and only peaks are squeezed (measured with dev/audio.html).
const GLUE_TRIM = 0.405;
const MAX_LIVE = 56;
const NOTE_CACHE = 260;
const GROUND = { grass: 'grass', sand: 'sand', mud: 'mudGround', snow: 'snowGround', moss: 'moss' };

// Every one-shot renders to peak 1; these set how loud each plays before the
// bus (measured with dev/audio.html). Music, ambience and effects each have a
// bus of their own.
const LV = {
  tap: 0.42, select: 0.25, turn: 0.34,
  pop: 0.78, whoosh: 0.38, colour: 0.11, boing: 0.55, plop: 0.36,
  bounce: 0.66, split: 0.66,
  confetti: 0.95, star: 0.85, mud: 1.1, snow: 1.15, jelly: 0.9, bouncy: 0.9, triple: 0.9,
  ground: 0.7, great: 0.95, chime: 0.17,
  tank: 0.75, balloon: 0.72, blocks: 0.66, ding: 0.75, bonus: 0.3, pip: 0.36,
  fanfare: 1.45, popper: 0.9, roll: 0.45, twinkle: 0.8, starEarn: 1.0, unlock: 1.0,
  // continuous voices at full strength
  aim: 0.22, turret: 0.2, drive: 0.2, flightAir: 0.35, flightWhistle: 0.04, wind: 0.22,
};

const LIB = { ...SHOTS, ...EVENTS, ...FIXED };
const LOOPS = { ...BASE_LOOPS, ...AMB_LOOPS };
const unit = (v) => clamp(Number.isFinite(Number(v)) ? Number(v) : 0, 0, 1);
const jitter = (a, b) => rand(a, b);

function readMuted() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) === true;
  } catch {
    return false;
  }
}

function compressor(ctx, threshold, knee, ratio, attack, release) {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.knee.value = knee;
  c.ratio.value = ratio;
  c.attack.value = attack;
  c.release.value = release;
  return c;
}

// A soft ceiling: untouched up to 0.45 (-7 dBFS), then eased towards 0.62
// (-4 dBFS), which it never passes.
function softCeiling() {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.45 ? a : 0.45 + 0.17 * Math.tanh((a - 0.45) / 0.17));
  }
  return c;
}

// A small, warm toy-box room: a short tail of noise that darkens as it dies,
// with a few early reflections, normalised to unit energy so a send gain is
// the wet-to-dry energy ratio.
function roomIR(ctx, seconds = 1.1) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    const r = seeded(70 + ch);
    let lp = 0;
    let e = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += (0.75 - 0.6 * Math.min(1, t / seconds)) * (r() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-t * 5.2) * (t < 0.008 ? t / 0.008 : 1);
    }
    for (const [dt, g] of ch ? [[0.011, 0.5], [0.023, -0.3]] : [[0.014, 0.5], [0.027, -0.3]]) d[Math.floor(dt * sr)] += g * 0.25;
    for (let i = 0; i < n; i++) e += d[i] * d[i];
    const k = 1 / Math.sqrt(e);
    for (let i = 0; i < n; i++) d[i] *= k;
  }
  return b;
}

export class Audio {
  constructor() {
    this.ctx = null;
    this._muted = readMuted();
    this.hidden = false;
    this.offline = false;
    this.dry = false;
    this.clock = null; // tests: a fixed time to schedule at
    this.stage = 'meadow';
    this.tonic = KEYS.meadow;
    this.scene = 'menu';
    this.wantMusic = false;
    this.bufs = new Map();
    this.notes = new Map();
    this.lastVariant = {};
    this.vox = {};
    this.live = 0;
    this.kinds = {};
    this.jobs = [];
    this.warmed = false;
  }

  get muted() {
    return this._muted;
  }

  // the audio clock (or, in tests, the virtual one)
  now() {
    return this.clock ?? this.ctx.currentTime;
  }

  // Create or resume the context. Call inside every user gesture; cheap. The
  // first call also builds the mixer and starts warming up the sounds.
  unlock() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
      // older iOS only opens the output once something plays inside the gesture
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      s.connect(this.ctx.destination);
      s.start();
      if (this._muted) this.sleepT = setTimeout(() => this._muted && this.ctx.suspend().catch(() => {}), 400);
    }
    if (this.ctx.state !== 'running' && !this.hidden && !this._muted && !this.offline) this.ctx.resume().catch(() => {});
  }

  // Build on a context made elsewhere, e.g. an OfflineAudioContext, to render
  // and measure without playing anything. `share` reuses another instance's
  // rendered buffers; `reverb: false` measures dry.
  attach(ctx, { reverb = true, share = null } = {}) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.dry = !reverb;
    if (share) {
      this.bufs = share.bufs;
      this.notes = share.notes;
    }
    this.build();
    return this;
  }

  build() {
    const ctx = this.ctx;
    // mixer: everything -> no rumble -> a gentle glue compressor -> master (mute)
    // -> a soft top -> a soft ceiling -> out
    this.mix = this.gainNode(1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 35;
    const glue = compressor(ctx, -12, 12, 2.5, 0.006, 0.25);
    this.glueTrim = this.gainNode(GLUE_TRIM);
    this.master = this.gainNode(this.audible() ? MASTER : 0);
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = 10500;
    top.Q.value = 0.5;
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = softCeiling();
    ceiling.oversample = '2x';
    this.out = this.gainNode(1);
    this.mix.connect(hp).connect(glue).connect(this.glueTrim).connect(this.master).connect(top).connect(ceiling).connect(this.out).connect(ctx.destination);

    // buses: effects, ambience and music each feed the mixer; a little room shared by all
    this.sfx = this.gainNode(1);
    this.sfx.connect(this.mix);
    this.ambBus = this.gainNode(1);
    this.ambBus.connect(this.mix);
    this.musicBus = this.gainNode(1);
    this.musicBus.connect(this.mix);
    this.verbIn = this.gainNode(1);
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = roomIR(ctx);
    const verbOut = this.gainNode(this.dry ? 0 : 0.5);
    this.verbIn.connect(conv).connect(verbOut).connect(this.mix);
    this.musicSend = this.gainNode(this.dry ? 0 : 0.16);
    this.musicBus.connect(this.musicSend).connect(this.verbIn);

    this.buf('pink');
    this.music = new Music(this);
    this.amb = new Ambience(this);
    this.applyScene(true);
    this.amb.set(this.stage);
    if (this.wantMusic) this.music.start(this.stage, this.scene);
    if (!this.offline) {
      this.timer = setInterval(() => this.pump(), 80);
      this.warm();
    }
  }

  gainNode(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  audible() {
    return !this._muted && !this.hidden;
  }

  ready() {
    return !!this.ctx && !this._muted && !this.hidden && (this.offline || this.ctx.state === 'running');
  }

  // ------------------------------------------------------------ buffers

  variantsOf(name) {
    return (LIB[name] || KEYED[name] || { variants: 1 }).variants || 1;
  }

  // A rendered sound (or loop), made the first time it is needed; warm() makes
  // them all ahead of time so that first time is never during play.
  buf(name, v = 0, key = 0) {
    const id = `${name}|${v}|${key}`;
    let b = this.bufs.get(id);
    if (!b) {
      const seed = 1000 + v * 7919 + name.length * 31 + key * 13;
      let e;
      let d;
      if ((e = LIB[name])) d = e.render(e.sr, seed, v);
      else if ((e = KEYED[name])) d = e.render(e.sr, seed, key);
      else if ((e = LOOPS[name])) d = e.render(e.sr, seed);
      else throw new Error(`no sound ${name}`);
      b = toBuffer(this.ctx, d);
      this.bufs.set(id, b);
    }
    return b;
  }

  // a variant of a sound, never the same one twice running; keyed ones in the stage's key
  bank(name) {
    const count = this.variantsOf(name);
    let v = Math.floor(Math.random() * count);
    if (count > 1 && v === this.lastVariant[name]) v = (v + 1) % count;
    this.lastVariant[name] = v;
    return this.buf(name, v, KEYED[name] ? this.tonic : 0);
  }

  noteBuf(inst, m) {
    const key = inst + m;
    let b = this.notes.get(key);
    if (b) this.notes.delete(key);
    else {
      const sr = NOTE_RATE[inst] || 24000;
      const d = renderNote(sr, inst, m);
      b = this.ctx.createBuffer(1, d.length, sr);
      b.getChannelData(0).set(d);
      if (this.notes.size >= NOTE_CACHE) this.notes.delete(this.notes.keys().next().value);
    }
    this.notes.set(key, b);
    return b;
  }

  // Get every sound ready before it is needed, a few milliseconds at a time so
  // the game never stutters: what a first shot needs first, then the stage on
  // show (its music, ambience and key), then the other stages.
  warm() {
    const jobs = this.jobs;
    const b = (name, v = 0, key = 0) => jobs.push(() => this.buf(name, v, key));
    const all = (name, key = 0) => {
      for (let v = 0; v < this.variantsOf(name); v++) b(name, v, key);
    };
    for (const name of ['pop', 'whooshUp', 'whooshDown', 'tap', 'boing', 'pink', 'patter', 'gust']) all(name);
    for (const name of ['confetti', 'mud', 'jelly', 'snow', 'candy', 'triple', 'grass', 'sand', 'mudGround', 'snowGround', 'moss', 'tankHit']) all(name);
    const order = [this.stage, ...STAGES.filter((s) => s !== this.stage)];
    for (const name of ['twinkleBurst', 'flourish', 'split', 'twinkle']) all(name, KEYS[order[0]]);
    for (const name of ['balloon', 'blocks', 'drip', 'star', 'unlockRun', 'unlockBloom', 'roll']) all(name);
    jobs.push(...this.sfxNoteJobs(order[0]), ...[91, 93, 95, 103, 105, 107].map((m) => () => this.noteBuf('glock', m)));
    for (const st of order) jobs.push(...this.stageJobs(st));
    this.warmed = false;
    this.pumpWarm();
  }

  // the instrument notes the effects play in a stage's key (select, turn, shot
  // colour, score tally, bonus chime), so no call has to render one on the spot
  sfxNoteJobs(id) {
    const k = KEYS[id];
    const list = [['glock', k + 19], ['glock', k + 24], ['glock', k + 26], ['glock', k + 28], ['glock', k + 31], ['glock', k + 36], ['kalimba', k + 16], ['kalimba', k + 21], ['celesta', k + 36]];
    for (let i = 0; i < 6; i++) list.push(['pip', penta(k + 24, i)], ['glock', penta(k + 24, i + 1)]);
    return list.map(([inst, m]) => () => this.noteBuf(inst, m));
  }

  // the sounds that belong to one stage: its key's sparkles, its music, its ambience
  stageJobs(id) {
    const jobs = [];
    const key = KEYS[id];
    for (const name of ['twinkleBurst', 'flourish', 'split', 'twinkle', 'fanfare']) for (let v = 0; v < this.variantsOf(name); v++) jobs.push(() => this.buf(name, v, key));
    jobs.push(...this.amb.jobs(id));
    for (const mode of ['lull', 'tune']) for (const [inst, m] of styleNotes(id, mode)) jobs.push(() => this.noteBuf(inst, m));
    return jobs;
  }

  // run queued jobs for a few ms per tick; never while the page is hidden
  pumpWarm() {
    clearTimeout(this.warmTimer);
    const run = () => {
      if (!this.hidden) {
        const t0 = performance.now();
        while (this.jobs.length && performance.now() - t0 < 4) this.jobs.shift()();
      }
      if (this.jobs.length) this.warmTimer = setTimeout(run, 18);
      else this.warmed = true;
    };
    this.warmTimer = setTimeout(run, 40);
  }

  // Tests: render everything that is queued now.
  warmAll() {
    clearTimeout(this.warmTimer);
    if (!this.jobs.length) this.warm();
    clearTimeout(this.warmTimer);
    while (this.jobs.length) this.jobs.shift()();
    this.warmed = true;
  }

  // ------------------------------------------------------------ settings

  setMuted(m) {
    this._muted = !!m;
    try {
      localStorage.setItem(STORE, JSON.stringify(this._muted));
    } catch {
      /* storage may be unavailable (private mode) */
    }
    if (!this.ctx) return;
    this.gainMaster(0.05);
    if (this.offline) return;
    clearTimeout(this.sleepT);
    // asleep while muted: no work at all
    if (this._muted) this.sleepT = setTimeout(() => this._muted && this.ctx.suspend().catch(() => {}), 400);
    else if (!this.hidden) this.ctx.resume().catch(() => {});
  }

  pageHidden(hidden) {
    this.hidden = !!hidden;
    if (!this.ctx || this.offline) return;
    this.gainMaster(this.hidden ? 0.03 : 0.12);
    clearTimeout(this.sleepT);
    if (this.hidden) this.sleepT = setTimeout(() => this.hidden && this.ctx.suspend().catch(() => {}), 150);
    else if (!this._muted) this.ctx.resume().catch(() => {});
  }

  gainMaster(tc) {
    const now = this.now();
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.audible() ? MASTER : 0, now, tc);
  }

  // 'meadow' | 'beach' | 'garden' | 'snow' | 'forest': crossfade the ambience,
  // the music's key and tune, and the sparkles' key over about two seconds
  setStage(id) {
    if (!KEYS[id]) id = 'meadow';
    if (id === this.stage) return;
    this.stage = id;
    this.tonic = KEYS[id];
    if (!this.ctx) return;
    this.amb.set(id);
    this.music.setStage(id);
    if (!this.offline) {
      this.jobs.unshift(...this.sfxNoteJobs(id), ...this.stageJobs(id));
      if (this.warmed) {
        this.warmed = false;
        this.pumpWarm();
      }
    }
  }

  // 'menu' | 'playing' | 'celebrate': the music's mood and level, the ambience's level
  setScene(scene) {
    if (scene !== 'menu' && scene !== 'playing' && scene !== 'celebrate') scene = 'menu';
    this.scene = scene;
    if (this.ctx) this.applyScene();
  }

  applyScene(instant = false) {
    const t = this.now();
    const tc = instant ? 0.01 : 0.5;
    const g = this.ambBus.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.scene === 'menu' ? 1.2 : this.scene === 'playing' ? 1.6 : 0.8, t, tc);
    this.music.setScene(this.scene);
  }

  startMusic() {
    this.wantMusic = true;
    if (this.ctx) this.music.start(this.stage, this.scene);
  }

  stopMusic() {
    this.wantMusic = false;
    if (this.ctx) this.music.stop();
  }

  // The scheduler, every 80 ms (tests call it with a horizon): the music and the
  // ambience's events a moment ahead, and tidying up the continuous voices.
  pump(horizon) {
    const ctx = this.ctx;
    if (!ctx || (!this.offline && ctx.state !== 'running')) return;
    const now = this.now();
    const until = horizon ?? now + 0.3;
    this.music.pump(until);
    this.amb.pump(now, until, this._muted);
    for (const k of Object.keys(this.vox)) {
      const v = this.vox[k];
      // the game stopped calling (a pause, a lost frame loop): let it fade
      if (v.on && !v.hold && now - v.last > 0.3) this.fadeVoice(v, now);
      if (!v.on && now - v.idle > 1.5) this.dropVoice(k);
    }
  }

  // Tests: step a virtual clock from `from` to `to` seconds, calling frame(t, dt)
  // each step and pumping the schedulers as the timer would.
  simulate(from, to, frame, step = 1 / 60) {
    let pumpAt = from;
    for (let t = from; t < to; t += step) {
      this.clock = t;
      if (frame) frame(t, step);
      if (t >= pumpAt) {
        this.pump(t + 0.35);
        pumpAt = t + 0.08;
      }
    }
  }

  // ------------------------------------------------------------ playback

  // One rendered buffer: source -> (low-pass) -> level -> pan -> bus, and a share
  // to the room. `kind` counts against a voice budget.
  play(buf, { t, gain = 1, rate = 1, pan = 0, cutoff = 0, wet = 0.1, dest = this.sfx, kind = null } = {}) {
    const ctx = this.ctx;
    const now = this.now();
    t = Math.max(t ?? now, now);
    if (this.live >= MAX_LIVE || (kind && (this.kinds[kind] || 0) >= (kind === 'amb' ? 6 : 24))) return null;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    if (rate !== 1) s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let f = null;
    if (cutoff && cutoff < 15000) {
      f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      f.Q.value = 0.6;
      s.connect(f).connect(g);
    } else s.connect(g);
    let tail = g;
    let p = null;
    if (pan) {
      p = ctx.createStereoPanner();
      p.pan.value = clamp(Number(pan) || 0, -0.9, 0.9);
      g.connect(p);
      tail = p;
    }
    tail.connect(dest);
    let w = null;
    if (wet > 0 && !this.dry) {
      w = ctx.createGain();
      w.gain.value = wet;
      tail.connect(w).connect(this.verbIn);
    }
    s.start(t);
    this.live++;
    if (kind) this.kinds[kind] = (this.kinds[kind] || 0) + 1;
    s.onended = () => {
      this.live--;
      if (kind) this.kinds[kind]--;
      g.disconnect();
      if (f) f.disconnect();
      if (p) p.disconnect();
      if (w) w.disconnect();
    };
    return s;
  }

  // A rendered instrument note (cached).
  note(inst, m, t, vel, pan = 0, dest = this.sfx, len = 0, wet = 0.15) {
    const ctx = this.ctx;
    const buf = this.noteBuf(inst, Math.round(m));
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vel;
    const at = Math.max(t, this.now());
    let tail = g;
    let p = null;
    s.connect(g);
    pan = Number(pan) || 0;
    if (pan) {
      p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -0.9, 0.9);
      g.connect(p);
      tail = p;
    }
    tail.connect(dest);
    let w = null;
    if (wet > 0 && !this.dry) {
      w = ctx.createGain();
      w.gain.value = wet;
      tail.connect(w).connect(this.verbIn);
    }
    s.start(at);
    s.onended = () => {
      g.disconnect();
      if (p) p.disconnect();
      if (w) w.disconnect();
    };
    return s;
  }

  // a looping buffer source, started somewhere random in its loop
  loopSrc(buffer, t, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * buffer.duration * 0.9);
    return s;
  }

  // a note of the stage's key: `steps` semitones above its tonic
  keyNote(inst, steps, t, vel, pan = 0, wet = 0.2) {
    return this.note(inst, this.tonic + steps, t, vel, pan, this.sfx, 0, wet);
  }

  // ------------------------------------------------------------ interface

  click() {
    if (!this.ready()) return;
    this.play(this.bank('tap'), { gain: LV.tap * jitter(0.9, 1.05), rate: jitter(0.97, 1.05), wet: 0.08 });
  }

  select() {
    if (!this.ready()) return;
    const t = this.now();
    this.keyNote('glock', 19, t, LV.select, 0, 0.3);
    this.keyNote('glock', 26, t + 0.07, LV.select * 0.85, 0, 0.3);
  }

  // a soft two-note chime; each side has its own pair and its own instrument
  turn(side = 0) {
    if (!this.ready()) return;
    const t = this.now() + 0.01;
    if (side === 1) {
      this.keyNote('kalimba', 16, t, LV.turn * 1.25, 0.15, 0.3);
      this.keyNote('kalimba', 21, t + 0.13, LV.turn * 1.1, 0.15, 0.3);
    } else {
      this.keyNote('glock', 19, t, LV.turn, -0.15, 0.3);
      this.keyNote('glock', 24, t + 0.13, LV.turn * 0.9, -0.15, 0.3);
    }
  }

  // cheerful little tally blips: about one more each time the score roughly doubles, up to six
  score(points = 10) {
    if (!this.ready()) return;
    const n = clamp(Math.round(1 + Math.log2(1 + Math.max(0, Number(points) || 0) / 10)), 1, 6);
    const t = this.now() + 0.01;
    for (let i = 0; i < n; i++) this.note('pip', penta(this.tonic + 24, i), t + i * 0.068, LV.pip * (0.75 + 0.25 * (i / n)) * jitter(0.92, 1.05), 0, this.sfx, 0, 0.2);
    // and a glockenspiel sparkle on the next note up
    this.note('glock', penta(this.tonic + 24, n), t + n * 0.068 + 0.02, LV.pip * 0.9, 0, this.sfx, 0, 0.35);
  }

  // ------------------------------------------------------------ the shot

  // A toy pop-gun "pomf" (soft, round; deeper with power) and an airy whoosh,
  // coloured by the ball.
  shot(ball = 'confetti', power = 0.6) {
    if (!this.ready()) return;
    const p = unit(power);
    const t = this.now() + 0.002;
    const rate = (1.14 - 0.24 * p) * jitter(0.96, 1.04);
    this.play(this.bank('pop'), { t, gain: LV.pop * (0.55 + 0.45 * p) * jitter(0.93, 1.05), rate, wet: 0.1, cutoff: ball === 'snow' ? 1700 : 0 });
    this.play(this.bank('whooshUp'), { t: t + 0.012, gain: LV.whoosh * (0.35 + 0.65 * p), rate: 0.85 + 0.35 * p, cutoff: 5200, wet: 0.14 });
    const c = LV.colour;
    if (ball === 'confetti') this.keyNote('glock', 24, t + 0.03, c * 1.4, 0, 0.3);
    else if (ball === 'star') {
      this.keyNote('glock', 24, t + 0.03, c * 1.4, 0, 0.3);
      this.keyNote('glock', 31, t + 0.09, c * 1.1, 0, 0.3);
    } else if (ball === 'mud') this.play(this.bank('drip'), { t: t + 0.02, gain: LV.plop, rate: jitter(0.28, 0.4), wet: 0.1 });
    else if (ball === 'jelly') this.play(this.bank('boing'), { t: t + 0.02, gain: LV.boing * 0.5, rate: jitter(1.2, 1.4), wet: 0.1 });
    else if (ball === 'bouncy') this.play(this.bank('boing'), { t: t + 0.02, gain: LV.boing * 0.8, rate: jitter(0.95, 1.1), wet: 0.1 });
    else if (ball === 'triple') this.play(this.bank('pop'), { t: t + 0.055, gain: LV.pop * 0.4, rate: rate * 1.3, wet: 0.1 });
  }

  // ------------------------------------------------------------ the ball in flight

  // Called every frame while the ball flies: a soft whoosh and a faint whistle
  // that follow its speed (0..1), moving across the stereo field with `pan`.
  flight(speed01 = 0.5, pan = 0) {
    if (!this.ready()) return;
    const s = unit(speed01);
    const now = this.now();
    let v = this.vox.flight;
    if (!v) v = this.buildFlight(now);
    v.last = now;
    if (!v.on) {
      v.on = true;
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(1, now, 0.03);
    }
    v.band.frequency.setTargetAtTime(480 + 1500 * s, now, 0.04);
    v.air.gain.setTargetAtTime(LV.flightAir * s ** 1.2, now, 0.05);
    v.whistle.frequency.setTargetAtTime(620 + 1000 * s, now, 0.05);
    v.whistleG.gain.setTargetAtTime(LV.flightWhistle * s ** 1.5, now, 0.05);
    v.pan.pan.setTargetAtTime(clamp(Number(pan) || 0, -0.9, 0.9), now, 0.03);
  }

  flightEnd() {
    const v = this.vox.flight;
    if (v && this.ctx) this.fadeVoice(v, this.now());
  }

  buildFlight(now) {
    const ctx = this.ctx;
    const out = this.gainNode(0);
    const pan = ctx.createStereoPanner();
    out.connect(pan).connect(this.sfx);
    const air = this.gainNode(0);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.1;
    const noise = this.loopSrc(this.buf('pink'), now);
    noise.connect(band).connect(air).connect(out);
    const whistle = ctx.createOscillator();
    const whistleG = this.gainNode(0);
    whistle.connect(whistleG).connect(out);
    // a little wobble on the whistle
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = this.gainNode(35);
    lfo.connect(depth).connect(whistle.detune);
    whistle.start(now);
    lfo.start(now);
    return this.addVoice('flight', { out, pan, air, band, whistle, whistleG, srcs: [noise, whistle, lfo], nodes: [out, pan, air, band, whistleG, depth] });
  }

  // ------------------------------------------------------------ bounce, split, burst

  // the bouncy ball's "boing"
  bounce(strength01 = 0.6, pan = 0) {
    if (!this.ready()) return;
    const s = unit(strength01);
    this.play(this.bank('boing'), { gain: LV.bounce * (0.4 + 0.6 * s) * jitter(0.92, 1.05), rate: (1.12 - 0.22 * s) * jitter(0.95, 1.05), pan, wet: 0.14 });
  }

  // the triple ball splitting: a bright pop-pop-pop with a sparkle
  split(pan = 0) {
    if (!this.ready()) return;
    this.play(this.bank('split'), { gain: LV.split * jitter(0.92, 1.05), rate: jitter(0.97, 1.04), pan, wet: 0.14 });
  }

  // The explosion, in layers: the ball's payload, the ground it landed on and,
  // for a great hit, a rising chime flourish. Soft and round, never a boom.
  // `power01` scales level and depth; the whole is panned to where it landed.
  burst(ball = 'confetti', ground = 'grass', power01 = 0.7, pan = 0, great = false) {
    if (!this.ready()) return;
    const p = unit(power01);
    const t = this.now() + 0.004;
    const lvl = 0.6 + 0.4 * p;
    const rate = (1.1 - 0.16 * p) * jitter(0.95, 1.05);
    const wet = 0.16;
    const pl = (name, gain, extra = {}) => this.play(this.bank(name), { t, gain: gain * lvl * jitter(0.93, 1.05), rate, pan, wet, ...extra });
    switch (ball) {
      case 'star': {
        // a twinkling cascade in the stage's key over a soft puff
        this.play(this.bank('twinkleBurst'), { t, gain: LV.star * lvl * jitter(0.93, 1.05), rate: jitter(0.98, 1.03), pan, wet: 0.22 });
        break;
      }
      case 'mud':
        pl('mud', LV.mud);
        break;
      case 'snow':
        pl('snow', LV.snow);
        break;
      case 'jelly':
        pl('jelly', LV.jelly);
        break;
      case 'bouncy':
        pl('candy', LV.bouncy);
        break;
      case 'triple':
        pl('triple', LV.triple);
        break;
      default:
        pl('confetti', LV.confetti);
        // the chime: a few notes of the stage's chord, quick
        for (let i = 0; i < 3; i++) this.keyNote('glock', 24 + [0, 4, 7][i], t + 0.02 + i * 0.055, LV.chime * lvl, pan, 0.3);
    }
    // the ground: a soft thud and its own texture
    this.play(this.bank(GROUND[ground] || 'grass'), { t, gain: LV.ground * (0.55 + 0.45 * p) * jitter(0.93, 1.05), rate: jitter(0.94, 1.06), pan, wet: 0.08 });
    if (great) {
      // a cheerful rising chime flourish
      this.play(this.bank('flourish'), { t: t + 0.06, gain: LV.great * jitter(0.95, 1.05), rate: jitter(0.99, 1.02), pan: pan * 0.5, wet: 0.25 });
      this.music.duck(0.75, 0.8);
    }
  }

  // ------------------------------------------------------------ tanks and targets

  // the hit toy tank giggles: squeaky-toy squeaks, a slide-whistle wobble, tiny chirps
  hitTank(pan = 0) {
    if (!this.ready()) return;
    this.play(this.bank('tankHit'), { gain: LV.tank * jitter(0.93, 1.05), rate: jitter(0.94, 1.08), pan, wet: 0.2 });
  }

  // 'balloon' | 'blocks' | 'bullseye' | 'bonus'
  target(kind = 'balloon', pan = 0) {
    if (!this.ready()) return;
    const t = this.now() + 0.003;
    if (kind === 'blocks') this.play(this.bank('blocks'), { t, gain: LV.blocks * jitter(0.93, 1.05), rate: jitter(0.95, 1.06), pan, wet: 0.12 });
    else if (kind === 'bullseye') {
      const m = pick([91, 93, 95]);
      this.note('glock', m, t, LV.ding * jitter(0.92, 1.05), pan, this.sfx, 0, 0.3);
      this.note('glock', m + 12, t + 0.004, LV.ding * 0.16, pan, this.sfx, 0, 0.3);
    } else if (kind === 'bonus') {
      // a rising star chime in the stage's key
      [0, 4, 7, 12].forEach((s, i) => this.keyNote('glock', 24 + s, t + i * 0.06, LV.bonus * (0.8 + 0.07 * i), pan, 0.35));
      this.keyNote('celesta', 36, t + 0.24, LV.bonus * 0.7, pan, 0.4);
    } else this.play(this.bank('balloon'), { t, gain: LV.balloon * jitter(0.93, 1.05), rate: jitter(0.9, 1.15), pan, wet: 0.12 });
  }

  // ------------------------------------------------------------ the party

  // End of the game: a toy-trumpet fanfare, party poppers, a shaker roll and
  // twinkles. It celebrates everyone.
  celebrate() {
    if (!this.ready()) return;
    const t = this.now() + 0.02;
    this.play(this.bank('fanfare'), { t, gain: LV.fanfare, wet: 0.2 });
    [[0, -0.5, 1], [0.5, 0.5, 0.85], [0.8, -0.25, 0.8], [1.3, 0.4, 0.7]].forEach(([dt, pan, k]) => {
      this.play(this.bank('confetti'), { t: t + dt, gain: LV.popper * k * jitter(0.9, 1.05), rate: jitter(1.05, 1.25), pan, wet: 0.2 });
    });
    this.play(this.bank('roll'), { t: t + 0.9, gain: LV.roll, wet: 0.12 });
    this.play(this.bank('twinkle'), { t: t + 1.25, gain: LV.twinkle, wet: 0.25 });
    this.music.duck(0.35, 4.2);
  }

  // a star earned
  star() {
    if (!this.ready()) return;
    this.play(this.bank('star'), { gain: LV.starEarn, wet: 0.25 });
    this.music.duck(0.6, 1.6);
  }

  // a new tank or ball unlocked: a magical shimmer
  unlockItem() {
    if (!this.ready()) return;
    const t = this.now() + 0.005;
    this.play(this.bank('unlockRun'), { t, gain: LV.unlock, wet: 0.3 });
    this.play(this.bank('unlockBloom'), { t, gain: LV.unlock * 0.9, wet: 0.35 });
    this.music.duck(0.5, 2.6);
  }

  // ------------------------------------------------------------ continuous voices

  addVoice(name, v) {
    v.name = name;
    v.on = false;
    v.idle = this.now();
    v.last = this.now();
    this.vox[name] = v;
    return v;
  }

  fadeVoice(v, now) {
    if (!v.on) return;
    v.on = false;
    v.idle = now;
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setTargetAtTime(0, now, 0.06);
  }

  // take a silent voice down, stopping its sources
  dropVoice(name) {
    const v = this.vox[name];
    if (!v) return;
    delete this.vox[name];
    for (const s of v.srcs) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const n of v.nodes) n.disconnect();
  }

  // shared start-up of a voice's call: build it if needed, bring it up
  voiceOn(name, build, k) {
    if (!this.ready()) return null;
    const now = this.now();
    let v = this.vox[name];
    if (!v) {
      if (k < 0.01) return null;
      v = build.call(this, now);
    }
    if (k < 0.01) {
      this.fadeVoice(v, now);
      return null;
    }
    v.last = now;
    if (!v.on) {
      v.on = true;
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(1, now, 0.04);
    }
    return v;
  }

  // The rubber of the slingshot stretching as the player drags back: a soft
  // tension tone and a creak, both rising with `k` (0..1). k = 0 fades it out.
  aimStretch(k = 0) {
    k = unit(k);
    const v = this.voiceOn('aim', this.buildAim, k);
    if (!v) return;
    const now = this.now();
    v.tone.frequency.setTargetAtTime(150 + 330 * k, now, 0.05);
    v.toneG.gain.setTargetAtTime(LV.aim * 0.6 * k * k, now, 0.05);
    v.band.frequency.setTargetAtTime(520 + 1100 * k, now, 0.05);
    v.lfo.frequency.setTargetAtTime(6 + 14 * k, now, 0.08);
    v.creakG.gain.setTargetAtTime(LV.aim * k * (0.3 + 0.7 * k), now, 0.05);
  }

  buildAim(now) {
    const ctx = this.ctx;
    const out = this.gainNode(0);
    out.connect(this.sfx);
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    const toneLP = ctx.createBiquadFilter();
    toneLP.type = 'lowpass';
    toneLP.frequency.value = 1100;
    const toneG = this.gainNode(0);
    tone.connect(toneLP).connect(toneG).connect(out);
    // the creak: narrow resonant noise chopped by a fast wobble, like rubber
    // sticking and slipping
    const noise = this.loopSrc(this.buf('pink'), now);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 7;
    const chop = this.gainNode(0.5);
    const creakG = this.gainNode(0);
    noise.connect(band).connect(chop).connect(creakG).connect(out);
    const lfo = ctx.createOscillator();
    const lfoDepth = this.gainNode(0.5);
    lfo.connect(lfoDepth).connect(chop.gain);
    tone.start(now);
    lfo.start(now);
    return this.addVoice('aim', { out, tone, toneG, band, creakG, lfo, srcs: [tone, noise, lfo], nodes: [out, toneLP, toneG, band, chop, creakG, lfoDepth] });
  }

  // A small toy servo whirring as the barrel turns; `k` (0..1) is how fast it moves.
  turret(k = 0) {
    k = unit(k);
    const v = this.voiceOn('turret', this.buildTurret, k);
    if (!v) return;
    const now = this.now();
    const f = 105 + 200 * k;
    v.a.frequency.setTargetAtTime(f, now, 0.04);
    v.b.frequency.setTargetAtTime(f * 1.498, now, 0.04);
    v.band.frequency.setTargetAtTime(700 + 900 * k, now, 0.05);
    v.body.gain.setTargetAtTime(LV.turret * k ** 0.6, now, 0.04);
    v.gear.gain.setTargetAtTime(LV.turret * 0.35 * k, now, 0.05);
  }

  buildTurret(now) {
    const ctx = this.ctx;
    const out = this.gainNode(0);
    out.connect(this.sfx);
    const wave = this.servoWave();
    const a = ctx.createOscillator();
    a.setPeriodicWave(wave);
    const b = ctx.createOscillator();
    b.setPeriodicWave(wave);
    const bG = this.gainNode(0.4);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const body = this.gainNode(0);
    a.connect(band);
    b.connect(bG).connect(band);
    band.connect(lp).connect(body).connect(out);
    // a slow wobble, as if the motor is a little uneven
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.6;
    const depth = this.gainNode(40);
    lfo.connect(depth);
    depth.connect(a.detune);
    depth.connect(b.detune);
    // the tick of little gears
    const noise = this.loopSrc(this.buf('pink'), now);
    const gearBand = ctx.createBiquadFilter();
    gearBand.type = 'bandpass';
    gearBand.frequency.value = 2600;
    gearBand.Q.value = 1.5;
    const gear = this.gainNode(0);
    noise.connect(gearBand).connect(gear).connect(out);
    a.start(now);
    b.start(now);
    lfo.start(now);
    return this.addVoice('turret', { out, a, b, band, body, gear, srcs: [a, b, lfo, noise], nodes: [out, bG, band, lp, body, depth, gearBand, gear] });
  }

  servoWave() {
    if (!this._servo) {
      const amps = [1, 0.5, 0.33, 0.2, 0.12, 0.08];
      const real = new Float32Array(amps.length + 1);
      const imag = new Float32Array(amps.length + 1);
      amps.forEach((a, i) => (imag[i + 1] = a));
      this._servo = this.ctx.createPeriodicWave(real, imag);
    }
    return this._servo;
  }

  // The tank driving: a little motor whirr and the patter of rubber tracks,
  // both following `speed01`; 0 fades out.
  drive(speed01 = 0) {
    const s = unit(speed01);
    const v = this.voiceOn('drive', this.buildDrive, s);
    if (!v) return;
    const now = this.now();
    v.motor.frequency.setTargetAtTime(58 + 100 * s, now, 0.06);
    v.lp.frequency.setTargetAtTime(520 + 900 * s, now, 0.06);
    v.motorG.gain.setTargetAtTime(LV.drive * 0.7 * (0.4 + 0.6 * s), now, 0.06);
    v.patter.playbackRate.setTargetAtTime(0.6 + 1.5 * s, now, 0.08);
    v.patterG.gain.setTargetAtTime(LV.drive * (0.25 + 0.75 * s), now, 0.06);
  }

  buildDrive(now) {
    const ctx = this.ctx;
    const out = this.gainNode(0);
    out.connect(this.sfx);
    const motor = ctx.createOscillator();
    motor.setPeriodicWave(this.servoWave());
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    const motorG = this.gainNode(0);
    motor.connect(lp).connect(motorG).connect(out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3.7;
    const depth = this.gainNode(30);
    lfo.connect(depth).connect(motor.detune);
    // the tracks: soft rubber ticks, faster as it goes faster
    const patter = this.loopSrc(this.buf('patter'), now);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1300;
    band.Q.value = 0.8;
    const patterG = this.gainNode(0);
    patter.connect(band).connect(patterG).connect(out);
    motor.start(now);
    lfo.start(now);
    return this.addVoice('drive', { out, motor, lp, motorG, patter, patterG, srcs: [motor, lfo, patter], nodes: [out, lp, motorG, depth, band, patterG] });
  }

  // The wind: a soft gust layer, its loudness following `strength01` smoothly.
  // It holds its level until told otherwise (no need to call every frame).
  wind(strength01 = 0) {
    if (!this.ready()) return;
    const s = unit(strength01);
    const now = this.now();
    let v = this.vox.wind;
    if (!v) {
      if (s < 0.01) return;
      v = this.buildWind(now);
    }
    v.last = now;
    if (s < 0.01) {
      this.fadeVoice(v, now);
      return;
    }
    if (!v.on) {
      v.on = true;
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(1, now, 0.3);
    }
    v.band.frequency.setTargetAtTime(320 + 520 * s, now, 0.4);
    v.level.gain.setTargetAtTime(LV.wind * s ** 1.2, now, 0.4);
  }

  buildWind(now) {
    const ctx = this.ctx;
    const out = this.gainNode(0);
    out.connect(this.sfx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const level = this.gainNode(0);
    const a = this.loopSrc(this.buf('gust'), now);
    // a second, slower copy so the gusts never line up
    const b = this.loopSrc(this.buf('gust'), now, 0.73);
    const bG = this.gainNode(0.6);
    a.connect(band);
    b.connect(bG).connect(band);
    band.connect(lp).connect(level).connect(out);
    const v = this.addVoice('wind', { out, band, level, srcs: [a, b], nodes: [out, band, lp, level, bG] });
    v.hold = true;
    return v;
  }
}
