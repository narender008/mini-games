// All of Garden Grow's sound, synthesised with Web Audio: no audio files and
// no voices of any kind. Natural sounds (soil, water, leaves, paper, glass,
// wicker, birds) are rendered once in JS from grains, bubbles and partials
// (sound/nature.js, sound/birds.js) and then played back cheaply; musical
// touches use the same instruments as the music (sound/instruments.js). The
// garden's ambience lives in ambience.js and the music in music.js.
//
// Everything is soft. Every sound starts and ends at exactly zero, levels
// peak well below full scale, the master is conservative (a soft top-end
// roll-off, a gentle compressor and a safety limiter at about -6 dBFS), a
// whole bed sprouting at once ripples instead of stacking up, and Bedtime
// (setCalm) makes it all quieter and darker still.
import { load, save, VISITORS } from './config.js';
import { Music } from './music.js';
import { Ambience } from './ambience.js';
import { Instruments } from './sound/instruments.js';
import { Bank } from './sound/bank.js';
import { birdPhrase } from './sound/birds.js';
import { toBuffer, white, pinkify, removeDC } from './sound/synth.js';

const MASTER = 0.8;
const MAKEUP_LIMIT = 0.676;
const TOP = 9000; // the master's top-end roll-off (Hz); lower in Bedtime
const TOP_CALM = 4200;

// C major pentatonic from C5: blooms walk up it, sparkles pick from it.
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];

// One-shot levels (rendered sounds are normalised to a peak of 1).
const LEVEL = {
  click: 0.07,
  select: 0.061,
  swish: 0.06,
  page: 0.16,
  plant: 0.5,
  pour: 0.24,
  drip: 0.15,
  crack: 0.2,
  sprout: 0.18,
  sproutNote: 0.085,
  unfurl: 0.14,
  bud: 0.19,
  bloom: 0.11,
  petals: 0.04,
  burst: 0.13,
  shimmer: 0.05,
  harvest: 0.6,
  pick: 0.22,
  vase: 0.155,
  basket: 0.45,
  visitor: 0.078,
  poke: 0.047,
  bird: 0.127,
  sun: 0.16,
  sunSparkle: 0.02,
  rainWand: 0.24,
  rainbow: 0.064,
  rainbowPad: 0.021,
};

// the little tune a new visitor gets, by group: [instrument, notes, times]
const CHIMES = {
  butterfly: ['celesta', [84, 88, 91, 96], [0, 0.07, 0.14, 0.21]],
  bee: ['kalimba', [79, 81, 84, 88], [0, 0.08, 0.2, 0.28]],
  beetle: ['marimba', [76, 79, 84], [0, 0.1, 0.2]],
  bird: ['harp', [79, 84, 86, 91], [0, 0.06, 0.12, 0.2]],
  night: ['musicbox', [88, 91, 96], [0, 0.16, 0.32]],
};

// Crowd control, per sound: [gap between repeats (s), most at once]. A
// whole bed sprouting or blooming together becomes a soft ripple (for
// blooms, a rising arpeggio) instead of one loud stack.
const CROWD = {
  tap: [0.05, 2],
  select: [0.08, 2],
  page: [0.15, 2],
  plant: [0.09, 4],
  drip: [0.05, 4],
  crack: [0.07, 4],
  sprout: [0.1, 4],
  unfurl: [0.08, 3],
  bud: [0.1, 4],
  bloom: [0.11, 6],
  burst: [0.16, 3],
  harvest: [0.12, 3],
  pick: [0.12, 3],
  place: [0.12, 3],
  visitor: [0.45, 2],
  poke: [0.06, 3],
  rainbow: [2, 1],
};

const clampPan = (p) => Math.max(-0.85, Math.min(0.85, p || 0));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = load('muted', false);
    this.hidden = false;
    this.calm = 0;
    this.musicKind = 'day';
    this.wantMusic = false;
    this.amb = { night: 0, rain: 0, wind: 0, bees: 0, birds: 0 };
    this.birdPool = {};
    this.crowd = {};
    this.singing = {};
  }

  // Create or resume the context: must run inside a user gesture the first time.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.attach(new AC({ latencyHint: 'interactive' }));
    }
    if (this.ctx.state !== 'running' && !this.hidden) this.ctx.resume().catch(() => {});
  }

  // Build the graph on a context. The game calls unlock(); the dev bench
  // attaches an OfflineAudioContext here to measure every sound.
  attach(ctx) {
    this.ctx = ctx;
    this.live = !(typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext);
    const sr = ctx.sampleRate;

    // master: mute -> calm -> no rumble -> soft top -> gentle glue -> limiter -> out
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    this.calmGain = ctx.createGain();
    const floor = ctx.createBiquadFilter();
    floor.type = 'highpass';
    floor.frequency.value = 35;
    floor.Q.value = 0.5;
    this.top = ctx.createBiquadFilter();
    this.top.type = 'lowpass';
    this.top.frequency.value = TOP;
    this.top.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    // and a safety limiter so that, however much stacks up, nothing goes
    // past about -6 dBFS
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -6;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.15;
    // each adds its own makeup gain (+4.8 dB and +3.4 dB here): take it
    // back off, so ordinary levels pass at unity and only peaks are squeezed
    const trim = ctx.createGain();
    trim.gain.value = 0.575;
    const trim2 = ctx.createGain();
    trim2.gain.value = MAKEUP_LIMIT;
    this.master.connect(this.calmGain).connect(floor).connect(this.top).connect(comp).connect(trim).connect(limit).connect(trim2).connect(ctx.destination);

    // a little outdoor space: a dark, airy reverb from decaying noise
    const len = Math.floor(sr * 1.6);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const k = 0.25 + 0.55 * Math.exp(-t * 5);
        lp += k * (Math.random() * 2 - 1 - lp);
        const tail = i > len * 0.8 ? 0.5 + 0.5 * Math.cos((Math.PI * (i - len * 0.8)) / (len * 0.2)) : 1;
        d[i] = lp * Math.exp(-t * 4.2) * (t < 0.012 ? t / 0.012 : 1) * tail;
      }
      removeDC(d);
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    this.send = ctx.createGain();
    this.send.gain.value = 0.5;
    const sendLp = ctx.createBiquadFilter();
    sendLp.type = 'lowpass';
    sendLp.frequency.value = 4000;
    this.send.connect(sendLp).connect(reverb).connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    // loopable noise for filters to shape (4 s, so no repeat is heard)
    this.noise = toBuffer(ctx, { sr, ch: [white(sr * 4, Math.random)] });
    this.pink = toBuffer(ctx, { sr, ch: [removeDC(pinkify(white(sr * 4, Math.random), true))] });

    this.bank = new Bank(ctx, this.live);
    this.inst = new Instruments(ctx);
    this.music = new Music(this);
    this.ambience = new Ambience(this);
    this.setCalm(this.calm);
    if (this.wantMusic) this.music.set(this.musicKind);
    if (this.live) {
      this.timer = setInterval(() => this.pump(), 100);
      this.warmup();
    }
  }

  // Get the sounds ready before they are needed: the rendered ones in a
  // background worker (or, without one, a few at a time in idle moments),
  // and the first instrument notes and birdsong a little at a time.
  warmup() {
    const sounds = ['tap', 'pat', 'drip', 'sprout', 'pour', 'crack', 'rustle', 'swishUp', 'swishDown', 'page', 'petals', 'whoosh'];
    sounds.push('carrot', 'snip', 'vase', 'basket', 'rain', 'bees', 'cricketA', 'cricketB', 'cricketC');
    const jobs = [];
    if (!this.bank.prefetch(sounds)) {
      for (const name of sounds) for (let v = 0; v < this.bank.variants(name); v++) jobs.push(() => this.bank.buffer(name, v));
    }
    const notes = [['kalimba', PENTA], ['marimba', [76, 79, 81, 84]], ['boop', [76, 79, 81]], ['musicbox', PENTA.slice(5).concat([96, 100])], ['guitar', [48, 55, 60, 64, 67, 41, 57, 65, 69, 43, 59, 62, 45]]];
    for (const [inst, list] of notes) for (const m of list) jobs.unshift(() => this.inst.note(inst, m));
    for (const kind of ['robin', 'blue-tit', 'goldfinch']) jobs.push(() => this.birdBuffer(kind), () => this.birdBuffer(kind));
    const run = () => {
      const job = jobs.shift();
      if (!job) return;
      job();
      setTimeout(run, 20);
    };
    setTimeout(run, 60);
  }

  setMuted(m) {
    this.muted = m;
    save('muted', m);
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
  }

  pageHidden(hidden) {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  startMusic() {
    this.wantMusic = true;
    if (this.music) this.music.set(this.musicKind);
  }

  // 'day' | 'bedtime' | 'off', crossfaded
  setMusic(kind) {
    this.musicKind = kind;
    if (kind !== 'off') this.wantMusic = true;
    if (this.music && this.wantMusic) this.music.set(kind);
  }

  // Targets for the garden's ambience, each 0..1. Called every frame, so it
  // only stores numbers; the audio timer eases towards them.
  setAmbience(o) {
    const a = this.amb;
    if (o.night !== undefined) a.night = o.night;
    if (o.rain !== undefined) a.rain = o.rain;
    if (o.wind !== undefined) a.wind = o.wind;
    if (o.bees !== undefined) a.bees = o.bees;
    if (o.birds !== undefined) a.birds = o.birds;
  }

  // Bedtime: everything quieter and softer.
  setCalm(v) {
    this.calm = Math.max(0, Math.min(1, v));
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.calmGain.gain.setTargetAtTime(1 - 0.3 * this.calm, t, 0.5);
    this.top.frequency.setTargetAtTime(TOP * Math.pow(TOP_CALM / TOP, this.calm), t, 0.5);
    this.music.setCalm(this.calm);
    this.ambience.setCalm(this.calm);
  }

  ready() {
    return this.ctx && !this.muted && (!this.live || this.ctx.state === 'running');
  }

  // The scheduler: music, ambience and wand sparkles, a moment ahead.
  pump() {
    const ctx = this.ctx;
    if (!ctx || (this.live && ctx.state !== 'running')) return;
    const now = ctx.currentTime;
    this.music.pump(now, now + 0.35, this.muted);
    this.ambience.tick(now, this.muted);
    if (!this.muted) this.wandTick(now);
  }

  // ------------------------------------------------------------ playback

  // A short-lived panned voice on the effects bus. Any number of sources
  // feed it and it takes itself apart when the last one ends.
  voice(pan = 0, wet = 0.15, dest = this.sfx) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = clampPan(pan);
    p.connect(dest);
    let w = null;
    if (wet > 0) {
      w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(this.send);
    }
    let count = 0;
    const add = (src, after) => {
      count++;
      src.onended = () => {
        if (after) after();
        if (--count > 0) return;
        p.disconnect();
        if (w) w.disconnect();
      };
      return src;
    };
    return {
      out: p,
      add,
      buf: (buffer, t, gain = 1, rate = 1) => {
        const s = ctx.createBufferSource();
        s.buffer = buffer;
        s.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = gain;
        s.connect(g).connect(p);
        s.start(t);
        return add(s, () => g.disconnect());
      },
      note: (inst, midi, t, gain = 1) => {
        const s = this.inst.play(inst, midi, t, p, gain);
        return add(s, s.onended);
      },
    };
  }

  playBuffer(buffer, { t = this.ctx.currentTime, pan = 0, gain = 1, rate = 1, wet = 0.15, dest = this.sfx } = {}) {
    return this.voice(pan, wet, dest).buf(buffer, t, gain, rate);
  }

  // When a sound may play: [time, gain] — at once, or, if the same sound
  // was just asked for, a moment later and a little softer; null if too
  // many are already waiting.
  slot(name) {
    if (!this.ready()) return null;
    const [gap, max] = CROWD[name] || [0.06, 4];
    const now = this.ctx.currentTime;
    const c = this.crowd[name] || (this.crowd[name] = { next: 0, n: 0 });
    if (c.next <= now) {
      c.next = now;
      c.n = 0;
    }
    if (c.n >= max) return null;
    const t = c.next + (c.n ? rnd(0, gap * 0.3) : 0);
    c.next += gap;
    c.n++;
    return [t, 1 / Math.sqrt(c.n)];
  }

  // one rendered sound, a random variation of it
  one(name, key, pan, gain, wet = 0.15, rate = rnd(0.96, 1.04)) {
    const s = this.slot(key);
    if (s) this.voice(pan, wet).buf(this.bank.get(name), s[0], gain * s[1], rate);
  }

  // A looped sound that runs for the whole game once started, faded in and
  // out (the pour and the rain wand).
  loopVoice(name, wet) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.bank.buffer(name, 0);
    s.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createStereoPanner();
    s.connect(g).connect(p).connect(this.sfx);
    if (wet) {
      const w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(this.send);
    }
    s.start(ctx.currentTime, Math.random() * s.buffer.duration);
    return { g, p, on: false, pan: 0, next: 0 };
  }

  // Fade a continuous voice in or out and keep it where the pointer is.
  // Cheap to call every frame; without a pan it stays where it was.
  hold(v, on, pan, level, up = 0.08, down = 0.16) {
    const t = this.ctx.currentTime;
    if (pan !== undefined && Math.abs(clampPan(pan) - v.pan) > 0.01) {
      v.pan = clampPan(pan);
      v.p.pan.setTargetAtTime(v.pan, t, 0.08);
    }
    if (on === v.on) return false;
    v.on = on;
    v.g.gain.setTargetAtTime(on ? level : 0, t, on ? up : down);
    return true;
  }

  birdBuffer(kind) {
    const pool = this.birdPool[kind] || (this.birdPool[kind] = []);
    if (pool.length < 5 && (pool.length < 2 || Math.random() < 0.5)) {
      const b = toBuffer(this.ctx, birdPhrase(this.ctx.sampleRate, Math.floor(Math.random() * 1e9), kind));
      pool.push(b);
      return b;
    }
    const i = Math.floor(Math.random() * pool.length);
    // now and then a fresh phrase replaces an old one
    if (Math.random() < 0.25) pool[i] = toBuffer(this.ctx, birdPhrase(this.ctx.sampleRate, Math.floor(Math.random() * 1e9), kind));
    return pool[i];
  }

  // ------------------------------------------------------------ interface

  // a soft wooden tap
  click() {
    this.one('tap', 'tap', 0, LEVEL.click, 0.08);
  }

  // two soft marimba notes, rising
  select() {
    this.marimbas('tap', [79, 84], [0, 0.075], [0.85, 1]);
  }

  // a panel opening: paper sliding and a little rise
  open() {
    this.marimbas('swishUp', [76, 81], [0.04, 0.11], [0.7, 0.8]);
  }

  close() {
    this.marimbas('swishDown', [81, 76], [0.03, 0.1], [0.7, 0.65]);
  }

  marimbas(under, notes, times, levels) {
    const s = this.slot('select');
    if (!s) return;
    const [t, k] = s;
    const v = this.voice(0, 0.2);
    v.buf(this.bank.get(under), t, (under === 'tap' ? LEVEL.click * 0.7 : LEVEL.swish) * k);
    notes.forEach((m, i) => v.note('marimba', m, t + times[i], LEVEL.select * levels[i] * k));
  }

  // a book page turning
  page() {
    this.one('page', 'page', 0, LEVEL.page, 0.12);
  }

  // ------------------------------------------------------------ the garden

  plant(pan = 0) {
    this.one('pat', 'plant', pan, LEVEL.plant, 0.08);
  }

  // The watering can's shower on leaves and soil, faded in and out; the
  // last few drops fall from the rose when it stops.
  pour(on, pan) {
    if (!this.ctx || (!on && !this.pourVoice)) return;
    const v = this.pourVoice || (this.pourVoice = this.loopVoice('pour', 0.1));
    if (!this.hold(v, !!on, pan, LEVEL.pour, 0.08, 0.15) || on || !this.ready()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.voice(v.pan, 0.1).buf(this.bank.get('drip'), t + 0.3 + i * rnd(0.22, 0.45), LEVEL.drip * (0.8 - i * 0.2), rnd(0.9, 1.1));
    }
  }

  drip(pan = 0) {
    this.one('drip', 'drip', pan, LEVEL.drip, 0.12, rnd(0.9, 1.1));
  }

  crack(pan = 0) {
    this.one('crack', 'crack', pan, LEVEL.crack, 0.05);
  }

  // a soft round pop, then two little rising kalimba notes
  sprout(pan = 0) {
    const s = this.slot('sprout');
    if (!s) return;
    const [t, k] = s;
    const v = this.voice(pan, 0.2);
    v.buf(this.bank.get('sprout'), t, LEVEL.sprout * k, rnd(0.95, 1.05));
    const [a, b] = pick([[79, 84], [76, 81], [81, 86], [74, 79]]);
    v.note('kalimba', a, t + 0.07, LEVEL.sproutNote * 0.8 * k);
    v.note('kalimba', b, t + 0.15, LEVEL.sproutNote * k);
  }

  unfurl(pan = 0) {
    this.one('rustle', 'unfurl', pan, LEVEL.unfurl, 0.1);
  }

  bud(pan = 0) {
    const s = this.slot('bud');
    if (s) this.voice(pan, 0.2).note('boop', pick([76, 79, 81]), s[0], LEVEL.bud * s[1]);
  }

  // Petals opening: a warm kalimba note that walks up the pentatonic scale
  // with n, a faint music-box octave above it and a breath of petals.
  bloom(pan = 0, n = 0) {
    const s = this.slot('bloom');
    if (!s) return;
    const [t, k] = s;
    const m = PENTA[((Math.floor(n) % PENTA.length) + PENTA.length) % PENTA.length];
    const v = this.voice(pan, 0.3);
    v.note('kalimba', m, t, LEVEL.bloom * k);
    v.note('musicbox', m + 12, t + 0.025, LEVEL.bloom * 0.14 * k);
    v.buf(this.bank.get('petals'), t, LEVEL.petals * k);
  }

  // a joyful petal burst: an airy whoosh and a shimmer climbing up
  burst(pan = 0) {
    const s = this.slot('burst');
    if (!s) return;
    const [t, k] = s;
    const v = this.voice(pan, 0.35);
    v.buf(this.bank.get('whoosh'), t, LEVEL.burst * k);
    [84, 88, 91, 93, 96].forEach((m, i) => v.note('celesta', m, t + 0.08 + i * 0.045 + rnd(0, 0.01), LEVEL.shimmer * (1 - i * 0.1) * k));
  }

  harvestPop(pan = 0) {
    this.one('carrot', 'harvest', pan, LEVEL.harvest, 0.08, rnd(0.94, 1.06));
  }

  pick(pan = 0) {
    this.one('snip', 'pick', pan, LEVEL.pick, 0.08);
  }

  // 'vase': the stem slips into the water and touches the glass;
  // 'basket': a soft wicker thump
  place(kind) {
    if (kind === 'vase') this.one('vase', 'place', 0.25, LEVEL.vase, 0.2, 1);
    else this.one('basket', 'place', -0.25, LEVEL.basket, 0.08);
  }

  // A new visitor: a small happy chime, a little different for each group.
  visitor(kind) {
    const s = this.slot('visitor');
    if (!s) return;
    const [t0, k] = s;
    const group = (VISITORS[kind] && VISITORS[kind].group) || kind;
    const [inst, notes, times] = CHIMES[group] || CHIMES.butterfly;
    const t = t0 + 0.02;
    const v = this.voice(0, 0.4);
    notes.forEach((m, i) => v.note(inst, m, t + times[i], LEVEL.visitor * (0.85 + 0.15 * (i / notes.length)) * k));
    v.note('musicbox', pick([96, 100]), t + times[times.length - 1] + 0.12, LEVEL.visitor * 0.25 * k);
  }

  // tapping a creature or a plant: a soft sparkle, two notes going up
  poke(pan = 0) {
    const s = this.slot('poke');
    if (!s) return;
    const [t, k] = s;
    const high = [88, 91, 93, 96, 98];
    const i = Math.floor(Math.random() * 4);
    const v = this.voice(pan, 0.3);
    v.note('musicbox', high[i], t, LEVEL.poke * k);
    v.note('musicbox', high[i + 1], t + 0.055, LEVEL.poke * 0.8 * k);
  }

  // One phrase of real-sounding birdsong from a visiting bird. A bird
  // cannot sing two songs at once: while its phrase lasts, it stays quiet.
  bird(kind = 'robin', pan = 0) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (now < (this.singing[kind] || 0)) return;
    const buf = this.birdBuffer(kind);
    this.singing[kind] = now + buf.duration + 0.4;
    this.voice(pan, 0.12).buf(buf, now, LEVEL.bird, rnd(0.98, 1.02));
  }

  // ------------------------------------------------------------ wands

  // The sun wand: a warm shimmering chord, with tiny sparkles while it beams.
  sunWand(on, pan) {
    if (!this.ctx || (!on && !this.sunVoice)) return;
    const v = this.sunVoice || (this.sunVoice = this.makeSun());
    this.hold(v, !!on, pan, LEVEL.sun, 0.2, 0.35);
  }

  makeSun() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createStereoPanner();
    const shimmer = ctx.createGain();
    shimmer.gain.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.value = 0.2;
    lfo.connect(depth).connect(shimmer.gain);
    lfo.start(t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    // unequal, barely detuned pairs: a slow gentle chorus rather than a throb
    for (const [m, det, a] of [[60, -2, 1], [60, 2.5, 0.45], [67, -1.5, 0.7], [67, 2, 0.3], [76, 0, 0.45], [84, 1, 0.25]]) {
      const o = ctx.createOscillator();
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = a * 0.25;
      o.connect(og).connect(shimmer);
      o.start(t);
    }
    shimmer.connect(lp).connect(g).connect(p).connect(this.sfx);
    const w = ctx.createGain();
    w.gain.value = 0.5;
    p.connect(w).connect(this.send);
    return { g, p, on: false, pan: 0, next: 0 };
  }

  // The rain wand: soft local rain from its little cloud, and drips.
  rainWand(on, pan) {
    if (!this.ctx || (!on && !this.rainVoice)) return;
    const v = this.rainVoice || (this.rainVoice = this.loopVoice('rain', 0.15));
    this.hold(v, !!on, pan, LEVEL.rainWand, 0.15, 0.3);
  }

  wandTick(now) {
    const s = this.sunVoice;
    if (s && s.on && now >= s.next) {
      this.voice(s.pan + rnd(-0.15, 0.15), 0.5).note('musicbox', PENTA[5 + Math.floor(Math.random() * 5)], now + 0.05, LEVEL.sunSparkle * rnd(0.6, 1));
      s.next = now + rnd(0.16, 0.4);
    }
    const r = this.rainVoice;
    if (r && r.on && now >= r.next) {
      this.voice(r.pan + rnd(-0.2, 0.2), 0.15).buf(this.bank.get('drip'), now + 0.05, LEVEL.drip * rnd(0.3, 0.7), rnd(0.85, 1.15));
      r.next = now + rnd(0.2, 0.6);
    }
  }

  // The rainbow: a soft harp glissando up the pentatonic scale over a warm
  // swelling chord, and a last shimmer at the top.
  rainbow() {
    const s = this.slot('rainbow');
    if (!s) return;
    const ctx = this.ctx;
    const t = s[0] + 0.03;
    const v = this.voice(0, 0.45);
    const notes = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
    let at = t;
    notes.forEach((m, i) => {
      const u = i / (notes.length - 1);
      v.note('harp', m, at, LEVEL.rainbow * (0.7 + 0.45 * Math.sin(Math.PI * u)));
      at += 0.085 - 0.03 * Math.sin(Math.PI * u);
    });
    [100, 96, 103].forEach((m, i) => v.note('musicbox', m, at + 0.05 + i * 0.11, LEVEL.rainbow * 0.3));
    for (const m of [60, 64, 67, 74]) {
      const o = ctx.createOscillator();
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(LEVEL.rainbowPad, t + 0.9);
      g.gain.setTargetAtTime(0, t + 1.3, 0.7);
      o.connect(g).connect(v.out);
      o.start(t);
      o.stop(t + 5.5);
      v.add(o, () => g.disconnect());
    }
  }
}
