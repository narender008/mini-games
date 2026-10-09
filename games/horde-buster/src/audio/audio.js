// Horde Buster's sound: everything is synthesised at run time with Web Audio, no
// audio files, no samples, no network.
//
// How it is built:
//  - every one-shot (shots, hits, splats, blasts, pickups, stings, interface) is
//    rendered once, in plain JS, into a short mono buffer by the recipes in
//    sfx.js (layers.js, dsp.js), a few random variants each, and every music
//    loop into stereo stems (music.js). lib.js keeps the queue: unlock() (or
//    prewarm()) starts it and it renders a few milliseconds at a time, the
//    gameplay sounds first, so no frame stalls. Each buffer is measured and
//    scaled to its target loudness, so the mix is balanced by number;
//  - a one-shot plays as source -> gain -> one of nine shared pan lanes -> the
//    effects bus: two nodes per voice, nothing built per call but the source.
//    Every sound has a minimum gap (calls that come sooner are dropped and make
//    the next one a little louder), a cap on how many may sound at once (the
//    oldest of its kind is cut) and a priority; at 48 voices the oldest voice of
//    equal or lower priority goes, or the new sound is dropped;
//  - the score is looping stems played in sync with the audio clock: no
//    scheduler, nothing to drift. Intensity is a gain on each stem, slow motion
//    is the loops' playback rate plus a low-pass. Tracks crossfade in about 1 s;
//  - one master chain: a bus compressor, a limiter and a soft ceiling, so a
//    hundred hits a second never clip and never turn to mush.
//  - the flamethrower is the one sound that is not a one-shot: flame(level) runs two looping buffers (a roar
//    through a low-pass, a crackle) whose gains and brightness follow the level, from a single pair of sources
//    that start when the level rises from 0 and are stopped on the audio clock a little after it falls to 0.
//    It is held out of the 48 voices as one of them.
// Every method is safe to call before unlock() and when muted: it does nothing
// until the context is running; what is asked for early (music, intensity,
// slow motion, the heartbeat) is remembered and applied.
import { Library } from './lib.js';
import { SFX } from './sfx.js';
import { TRACKS } from './music.js';
import { clamp } from './dsp.js';

const MAX_VOICES = 48;
const COMP = { threshold: -18, ratio: 6 };
const LIM = { threshold: -2, ratio: 20 };

// the keys the one-shot methods play (no string building per call)
const SHOT = { blaster: 'shot.blaster', scatter: 'shot.scatter', rocket: 'shot.rocket', railgun: 'shot.railgun' };
const PICKUP = {
  magnet: 'pickup.magnet', freeze: 'pickup.freeze', shield: 'pickup.shield', bomb: 'pickup.bomb', heart: 'pickup.heart', chest: 'pickup.chest', weapon: 'pickup.weapon',
};
const STREAK = [null, 'streak.1', 'streak.2', 'streak.3', 'streak.4', 'streak.5'];
const UI = { hover: 'ui.hover', click: 'ui.click', card: 'ui.card', claim: 'claim', coin: 'coin' };
const GEM = ['gem.0', 'gem.1', 'gem.2'];
const SWAP = { blaster: 'swap.blaster', scatter: 'swap.scatter', rocket: 'swap.rocket', flamer: 'swap.flamer', railgun: 'swap.railgun' };
const SURGE = { overdrive: 'surge.overdrive', triple: 'surge.triple', rage: 'surge.rage' };
// the flamethrower loop: time constants (s) of the gain and brightness as the level rises / falls (about 40 ms / 150 ms to
// 90 %), and how long after the level falls to 0 the loop is stopped (the gain is down by 70 dB by then)
const FLAME = { att: 0.018, rel: 0.065, idle: 0.55 };
const flameCutoff = (lv) => (lv > 0 ? 700 + 9500 * Math.pow(lv, 1.4) : 500);
const MAJOR = [0, 2, 4, 5, 7, 9, 11]; // the gem steps climb the G major scale

// sounds with a pitch of their own are not detuned at random (they would clash with the score)
const jitterOf = (key) => (/^(gem|levelUp|card|evolve|waveComplete|claim|streak|pickup|ui|weaponUp|surge\.triple)/.test(key) ? 0 : key === 'coin' ? 0.02 : 0.045);

// a soft ceiling: untouched up to 0.8, eased towards 0.985 which it never passes
function softCeiling() {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.185 * Math.tanh((a - 0.8) / 0.185));
  }
  return c;
}

// Chrome (and the spec) add make-up gain to a compressor; this takes it back off
const makeup = (t, ratio) => Math.pow(10, (0.6 * t * (1 - 1 / ratio)) / 20);

export class Sound {
  constructor() {
    this.ctx = null;
    this.offline = false;
    this._muted = false;
    this._hidden = false;
    this._volume = 0.8;
    this._musicVolume = 0.6;
    this._lib = null;
    this._voices = []; // live voices, oldest first
    this._vfree = []; // spare voice records
    this._gains = []; // spare gain nodes
    this._lanes = [];
    this._st = {}; // per key: last play time, dropped calls, voices now
    this._jit = {};
    for (const key of Object.keys(SFX)) {
      this._st[key] = { last: -10, dropped: 0, n: 0 };
      this._jit[key] = jitterOf(key);
    }
    this._clock = null; // tests: the time to play at
    this._slow = 1;
    this._rateF = 1; // one-shot playback rate in slow motion
    this._musicRate = 1;
    this._slowVoices = 1;
    this._duckDepth = 1;
    this._duckUntil = 0;
    this._want = { music: undefined, intensity: 0, lowHp: false };
    this._m = { cur: null, old: [], pending: null, started: undefined, int: 0 };
    this._hb = null;
    this._fl = null; // the flamethrower loop: { a, b, lp, ga, gb, lv, dying, stopAt }
    this._pumpT = 0;
    this._pumpIdle = false;
    this._sleepT = 0;
    this._watching = false;
    this._keepData = false;
    this._onEnd = (e) => this._end(e.target);
  }

  get ready() {
    return !!this.ctx && (this.offline || this.ctx.state === 'running');
  }

  get muted() {
    return this._muted;
  }

  get volume() {
    return this._volume;
  }

  get musicVolume() {
    return this._musicVolume;
  }

  // build progress: { pending jobs, ms spent rendering, slowest slice } (for the debug overlay)
  get stats() {
    const l = this._lib;
    return l ? { pending: l.pending, done: l.stats.done, jobs: l.stats.jobs, ms: l.stats.ms, longest: l.stats.longest, errors: l.errors.length } : null;
  }

  // ------------------------------------------------------------ context

  _AC() {
    return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  }

  // Start rendering the sounds without an audio context (call at load or when idle, if you like:
  // unlock() does it anyway). Does nothing on a browser without Web Audio.
  prewarm() {
    if (this._lib || (!this._AC() && !this.offline)) return;
    this._lib = new Library();
    this._schedule();
  }

  // Call inside a user gesture, as often as you like: makes (or wakes) the audio context.
  unlock() {
    if (this.offline) return;
    if (!this.ctx) {
      const AC = this._AC();
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        this.ctx = null;
        return;
      }
      this.prewarm();
      this._build();
      // older iOS only opens the output once something plays inside the gesture
      try {
        const s = this.ctx.createBufferSource();
        s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
        s.connect(this.ctx.destination);
        s.start();
      } catch {
        /* fine */
      }
      this._watch();
    }
    this._sync();
  }

  // Tests: build on a context made elsewhere (an OfflineAudioContext), reusing the library of
  // another run, so a scene can be rendered and measured without playing anything aloud.
  attach(ctx, { lib = null } = {}) {
    this.ctx = ctx;
    this.offline = true;
    this._keepData = true;
    this._lib = lib || new Library();
    this._build();
    return this;
  }

  _watch() {
    if (this._watching || typeof document === 'undefined') return;
    this._watching = true;
    document.addEventListener('visibilitychange', () => {
      this._hidden = document.hidden;
      this._master(0.03);
      this._sync();
    });
    this.ctx.onstatechange = () => this._applyWanted();
  }

  _audible() {
    return !this._muted && !this._hidden;
  }

  _ok() {
    return !!this.ctx && !this._muted && !this._hidden && (this.offline || this.ctx.state === 'running');
  }

  _now() {
    return this._clock !== null ? this._clock : this.ctx.currentTime;
  }

  // run the context only while there is something to hear
  _sync() {
    if (!this.ctx || this.offline) return;
    clearTimeout(this._sleepT);
    if (this._audible()) {
      if (this.ctx.state !== 'running') this.ctx.resume().then(() => this._applyWanted()).catch(() => {});
      else this._applyWanted();
    } else {
      this._sleepT = setTimeout(() => {
        if (!this._audible() && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
      }, this._hidden ? 150 : 1500);
    }
  }

  _master(tc) {
    if (!this.ctx) return;
    const t = this._now();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this._audible() ? this._volume : 0, t, tc);
  }

  setMuted(on) {
    this._muted = !!on;
    this._master(0.02);
    this._sync();
  }

  setVolume(v) {
    this._volume = clamp(Number(v) || 0, 0, 1);
    this._master(0.03);
  }

  setMusicVolume(v) {
    this._musicVolume = clamp(Number(v) || 0, 0, 1);
    if (this.ctx) this.musicBus.gain.setTargetAtTime(this._musicVolume, this._now(), 0.04);
  }

  // ------------------------------------------------------------ the graph

  _build() {
    const ctx = this.ctx;
    const gain = (v) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    // the master chain: bus compressor, volume, limiter, soft ceiling
    this.mix = gain(1);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = COMP.threshold;
    comp.knee.value = 10;
    comp.ratio.value = COMP.ratio;
    comp.attack.value = 0.003;
    comp.release.value = 0.16;
    this.master = gain(this._audible() ? this._volume : 0);
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = LIM.threshold;
    lim.knee.value = 0;
    lim.ratio.value = LIM.ratio;
    lim.attack.value = 0.001;
    lim.release.value = 0.08;
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = softCeiling();
    ceiling.oversample = '2x';
    this.mix.connect(comp).connect(gain(makeup(COMP.threshold, COMP.ratio))).connect(this.master).connect(lim).connect(gain(makeup(LIM.threshold, LIM.ratio))).connect(ceiling).connect(ctx.destination);
    // effects: shared pan lanes -> low-pass (slow motion) -> bus
    this.sfxBus = gain(1);
    this.sfxBus.connect(this.mix);
    this.sfxLP = ctx.createBiquadFilter();
    this.sfxLP.type = 'lowpass';
    this.sfxLP.frequency.value = this._slow < 1 ? 1500 + 20500 * this._slow * this._slow : 22000;
    this.sfxLP.Q.value = 0.5;
    this.sfxLP.connect(this.sfxBus);
    for (let i = 0; i < 9; i++) {
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = -1 + i * 0.25;
        p.connect(this.sfxLP);
        this._lanes.push(p);
      } else {
        this._lanes.push(this.sfxLP);
      }
    }
    // the score: stems -> track bus -> low-pass (slow motion) -> duck -> volume
    this.musicBus = gain(this._musicVolume);
    this.musicBus.connect(this.mix);
    this.musicDuck = gain(1);
    this.musicDuck.connect(this.musicBus);
    this.musicLP = ctx.createBiquadFilter();
    this.musicLP.type = 'lowpass';
    this.musicLP.frequency.value = this._slow < 1 ? 600 + 19400 * Math.pow(this._slow, 2.5) : 20000;
    this.musicLP.Q.value = 0.5;
    this.musicLP.connect(this.musicDuck);
    this._applyWanted();
  }

  // ------------------------------------------------------------ building the library

  _schedule() {
    if (this._pumpT || !this._lib || !this._lib.pending) return;
    const run = (dl) => {
      this._pumpT = 0;
      this._pump(dl);
    };
    if (typeof requestIdleCallback === 'function') {
      this._pumpIdle = true;
      this._pumpT = requestIdleCallback(run, { timeout: 120 });
    } else {
      this._pumpIdle = false;
      this._pumpT = setTimeout(run, 10);
    }
  }

  _pump(dl) {
    const lib = this._lib;
    if (!lib || !lib.pending) return;
    if (this._hidden) {
      this._pumpIdle = false;
      this._pumpT = setTimeout(() => {
        this._pumpT = 0;
        this._pump();
      }, 250);
      return;
    }
    // idle time when the browser offers it, a small steady slice when it does not; more when the
    // score is waiting for its track or the gameplay sounds are not made yet
    const urgent = !!this._m.pending || lib.stats.done < 12;
    const idle = dl && dl.timeRemaining && !dl.didTimeout ? dl.timeRemaining() : 0;
    lib.pump(urgent ? 6 : idle > 4 ? Math.min(8, idle - 1) : 2.5);
    this._applyWanted();
    this._schedule();
  }

  // ------------------------------------------------------------ things asked for early

  _applyWanted() {
    if (!this.ctx || !this._lib) return;
    const w = this._want;
    if (w.music !== undefined && this._m.started !== w.music) this._startMusic(w.music, false);
    else if (this._m.pending && this._lib.music.has(this._m.pending)) this._startMusic(this._m.pending, false);
    if (w.lowHp !== !!this._hb) this._heart(w.lowHp);
  }

  // ------------------------------------------------------------ one-shots

  // An AudioBuffer for a rendered sound, made the first time it plays.
  _buffer(ent) {
    if (ent.buf) return ent.buf;
    const b = this.ctx.createBuffer(1, ent.data.length, ent.sr);
    if (b.copyToChannel) b.copyToChannel(ent.data, 0);
    else b.getChannelData(0).set(ent.data);
    ent.buf = b;
    if (!this._keepData) ent.data = null;
    return b;
  }

  // flags: 1 = interface (slow motion does not touch it), 2 = keep the pitch exact
  _play(key, pan, level, rate, flags) {
    if (!this._ok() || !this._lib) return;
    const def = SFX[key];
    const st = this._st[key];
    const now = this._now();
    if (def.gap && now - st.last < def.gap * 0.001) {
      if (st.dropped < 8) st.dropped++;
      return;
    }
    const ent = this._lib.pick(key);
    if (!ent) return;
    st.last = now;
    level *= 1 + 0.09 * st.dropped;
    st.dropped = 0;
    if (st.n >= def.max) {
      const v = this._oldest(key, -1);
      if (v) this._steal(v, now);
    }
    const cap = this._fl ? MAX_VOICES - 1 : MAX_VOICES; // the flamethrower's loop is one of the voices
    while (this._voices.length >= cap) {
      const v = this._oldest(null, def.pri);
      if (!v) return;
      this._steal(v, now);
    }
    const ctx = this.ctx;
    const ui = (flags & 1) !== 0;
    const src = ctx.createBufferSource();
    src.buffer = this._buffer(ent);
    const jit = flags & 2 ? 0 : this._jit[key];
    const base = rate * (1 + (Math.random() * 2 - 1) * jit);
    src.playbackRate.value = ui ? base : base * this._rateF;
    const g = this._gains.pop() || ctx.createGain();
    g.gain.cancelScheduledValues(0);
    g.gain.value = Math.min(2.5, level * (0.9 + Math.random() * 0.2));
    src.connect(g);
    g.connect(this._lanes[((clamp(+pan || 0, -1, 1) + 1) * 4 + 0.5) | 0]);
    const v = this._vfree.pop() || {};
    v.key = key;
    v.src = src;
    v.g = g;
    v.t0 = now;
    v.pri = def.pri;
    v.rate = base;
    v.ui = ui;
    v.live = true;
    src._v = v;
    src.onended = this._onEnd;
    src.start(this.offline ? now : 0);
    this._voices.push(v);
    st.n++;
    if (def.duck) this.duck(def.duck[0], def.duck[1]);
  }

  // the oldest live voice of a kind (key), or of equal or lower priority (pri >= 0)
  _oldest(key, pri) {
    const vs = this._voices;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (key !== null ? v.key === key : v.pri <= pri) return v;
    }
    return null;
  }

  // cut a voice off with a very short fade
  _steal(v, now) {
    this._drop(v);
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setTargetAtTime(0, now, 0.004);
    try {
      v.src.stop(now + 0.03);
    } catch {
      /* already over */
    }
  }

  _drop(v) {
    if (!v.live) return;
    v.live = false;
    const i = this._voices.indexOf(v);
    if (i >= 0) this._voices.splice(i, 1);
    this._st[v.key].n--;
  }

  // a voice has finished (or was cut): free its nodes
  _end(src) {
    const v = src._v;
    if (!v) return;
    src._v = null;
    this._drop(v);
    try {
      src.disconnect();
      v.g.disconnect();
    } catch {
      /* fine */
    }
    if (this._gains.length < 64) this._gains.push(v.g);
    v.src = v.g = null;
    this._vfree.push(v);
  }

  // pan is -1..1: left to right of the arena
  shot(kind = 'blaster', pan = 0) {
    this._play(SHOT[kind] || SHOT.blaster, pan, 1, 1, 0);
  }

  hit(pan = 0, crit = false) {
    this._play(crit ? 'hit.crit' : 'hit', pan, 1, 1, 0);
  }

  kill(pan = 0, big = false) {
    this._play(big ? 'kill.big' : 'kill', pan, 1, 1, 0);
  }

  headPop(pan = 0) {
    this._play('headPop', pan, 1, 1, 0);
  }

  gib(pan = 0) {
    this._play('gib', pan, 1, 1, 0);
  }

  // size 0..1: a rocket about 0.4, a barrel 0.7, a bomb 1. Bigger is louder, deeper and longer.
  explode(pan = 0, size = 0.5) {
    const z = clamp(Number(size) || 0, 0, 1);
    this._play(z < 0.3 ? 'explode.s' : z < 0.65 ? 'explode.m' : 'explode.l', pan, 0.55 + 0.45 * z, 1.12 - 0.3 * z, 0);
  }

  freeze() {
    this._play('freeze', 0, 1, 1, 0);
  }

  shatter(pan = 0) {
    this._play('shatter', pan, 1, 1, 0);
  }

  zap(pan = 0) {
    this._play('zap', pan, 1, 1, 0);
  }

  spit(pan = 0) {
    this._play('spit', pan, 1, 1, 0);
  }

  enemyShot(pan = 0) {
    this._play('enemyShot', pan, 1, 1, 0);
  }

  // kind: 'magnet' | 'freeze' | 'shield' | 'bomb' | 'heart' | 'chest' | 'weapon'
  pickup(kind) {
    const key = PICKUP[kind];
    if (key) this._play(key, 0, 1, 1, 0);
  }

  // an XP crystal; step 0..15 climbs the G major scale over two octaves and a bit
  gem(step = 0) {
    const s = clamp(step | 0, 0, 15);
    this._play(GEM[(s / 7) | 0], 0, 1, Math.pow(2, MAJOR[s % 7] / 12), 2);
  }

  levelUp() {
    this._play('levelUp', 0, 1, 1, 0);
  }

  card() {
    this._play('card', 0, 1, 1, 0);
  }

  evolve() {
    this._play('evolve', 0, 1, 1, 0);
  }

  waveStart(n = 1) {
    this._play('waveStart', 0, 1, 1 + 0.015 * clamp((n | 0) - 1, 0, 9), 0);
  }

  waveComplete() {
    this._play('waveComplete', 0, 1, 1, 0);
  }

  coin() {
    this._play('coin', 0, 1, 1, 0);
  }

  claim() {
    this._play('claim', 0, 1, 1, 0);
  }

  shieldUp() {
    this._play('shieldUp', 0, 1, 1, 0);
  }

  shieldHit() {
    this._play('shieldHit', 0, 1, 1, 0);
  }

  shieldDown() {
    this._play('shieldDown', 0, 1, 1, 0);
  }

  bombThrow() {
    this._play('bombThrow', 0, 1, 1, 0);
  }

  // the big strike from the sky
  lightning() {
    this._play('lightning', 0, 1, 1, 0);
  }

  hurt() {
    this._play('hurt', 0, 1, 1, 0);
  }

  death() {
    this._play('death', 0, 1, 1, 0);
  }

  bossRoar() {
    this._play('boss.roar', 0, 1, 1, 0);
  }

  bossSlam() {
    this._play('boss.slam', 0, 1, 1, 0);
  }

  bossCharge() {
    this._play('boss.charge', 0, 1, 1, 0);
  }

  bossDeath() {
    this._play('boss.death', 0, 1, 1, 0);
  }

  // a kill-streak sting, tier 1..5
  streak(tier = 1) {
    this._play(STREAK[clamp(tier | 0, 1, 5)], 0, 1, 1, 0);
  }

  // 'hover' | 'click' | 'card' | 'claim' | 'coin'
  ui(name) {
    const key = UI[name];
    if (key) this._play(key, 0, 1, 1, 1);
  }

  // the hero grabs another weapon: 'blaster' | 'scatter' | 'rocket' | 'flamer' | 'railgun'
  weaponSwap(id) {
    this._play(SWAP[id] || SWAP.blaster, 0, 1, 1, 0);
  }

  // a weapon gained a star: stars 2 or 3 (3 is bigger); a G major run up that lands on a chord
  weaponUp(stars = 2) {
    this._play((stars | 0) >= 3 ? 'weaponUp.3' : 'weaponUp.2', 0, 1, 1, 0);
  }

  // a weapon crate lands (rate-limited)
  crate() {
    this._play('crate', 0, 1, 1, 0);
  }

  // a power surge orb grabbed: 'overdrive' | 'triple' | 'rage' (ducks the score a little)
  surge(kind) {
    this._play(SURGE[kind] || SURGE.overdrive, 0, 1, 1, 0);
  }

  // a surge ran out
  surgeEnd() {
    this._play('surgeEnd', 0, 1, 1, 0);
  }

  // ------------------------------------------------------------ the flamethrower

  // Call every frame while the Flamethrower is held, with level 0..1 (0: not firing, also fine to call once or never).
  // The roar and crackle follow the level: gain and brightness glide (90 % in about 40 ms rising, 150 ms falling), so
  // it never clicks. Level 0 fades to silence and, 0.55 s later, the loop is stopped (no CPU while idle); a level
  // above 0 starts it again, or takes it back if it is still running. Calls that change nothing do no work (the level
  // is rounded to steps of 0.02). Muted, hidden, locked or before the sounds are built: nothing plays and a loop that
  // is running is let go like at 0. If the calls stop for 0.4 s while it is on (a pause, a forgotten flame(0)) it is
  // let go the same way. Slow motion drops its pitch and dulls it like the other effects.
  flame(level = 0) {
    let lv = level > 0 ? (level < 1 ? Math.round(level * 50) / 50 : 1) : 0;
    if (!this._ok()) lv = 0;
    const f = this._fl;
    if (!f) {
      if (lv > 0 && this._lib) this._flameStart(lv);
      return;
    }
    const t = this._now();
    if (lv > 0) f.seen = t;
    if (lv === f.lv) return;
    if (f.dying) {
      // back before the loop was stopped: a later stop() replaces the earlier one. If that is not possible, start afresh.
      let kept = t < f.stopAt - 0.06;
      if (kept) {
        try {
          f.a.stop(t + 86400);
          if (f.b) f.b.stop(t + 86400);
        } catch {
          kept = false;
        }
      }
      if (!kept) {
        this._flameStart(lv);
        return;
      }
      f.dying = false;
      this._flameWatch(f);
    }
    this._flameSet(f, lv, t, 0);
  }

  _flameStart(lv) {
    const ea = this._lib.pick('flame');
    if (!ea) return; // not built yet: the game calls again next frame
    const eb = this._lib.pick('flame.crackle');
    const ctx = this.ctx;
    const t = this._now();
    const lane = this._lanes[4]; // the centre: through the slow-motion low-pass like every effect
    const a = ctx.createBufferSource();
    a.buffer = this._buffer(ea);
    a.loop = true;
    a.playbackRate.value = this._rateF;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.value = flameCutoff(lv);
    const ga = ctx.createGain();
    ga.gain.value = 0;
    a.connect(lp);
    lp.connect(ga);
    ga.connect(lane);
    let b = null;
    let gb = null;
    if (eb) {
      b = ctx.createBufferSource();
      b.buffer = this._buffer(eb);
      b.loop = true;
      b.playbackRate.value = this._rateF;
      gb = ctx.createGain();
      gb.gain.value = 0;
      b.connect(gb);
      gb.connect(lane);
    }
    const f = { a, b, lp, ga, gb, lv: 0, dying: false, stopAt: 0, seen: t, timer: 0 };
    a.onended = () => this._flameEnd(f);
    // from a different place in the loops each time
    const when = this.offline ? t : 0;
    a.start(when, Math.random() * a.buffer.duration);
    if (b) b.start(when, Math.random() * b.buffer.duration);
    this._fl = f;
    this._flameWatch(f);
    this._flameSet(f, lv, t, 0);
  }

  // a loop whose calls have stopped (the game paused, or never said 0) is let go; checked four times a second
  // while it is on, on the real clock (a test with a fake clock calls _flameCheck itself)
  _flameWatch(f) {
    if (this.offline || f.timer) return;
    f.timer = setTimeout(() => {
      f.timer = 0;
      if (this._flameCheck(f)) this._flameWatch(f);
    }, 250);
  }

  // true while the loop is on and still being called
  _flameCheck(f) {
    if (this._fl !== f || f.dying) return false;
    const t = this._now();
    if (t - f.seen <= 0.4) return true;
    this._flameSet(f, 0, t, 0);
    return false;
  }

  // glide the loop to a level (tc: a time constant, or 0 for the usual attack / release)
  _flameSet(f, lv, t, tc) {
    const k = tc || (lv > f.lv ? FLAME.att : FLAME.rel);
    f.lv = lv;
    const ga = f.ga.gain;
    ga.cancelScheduledValues(t);
    ga.setTargetAtTime(lv > 0 ? 0.2 + 0.8 * lv : 0, t, k);
    if (f.gb) {
      f.gb.gain.cancelScheduledValues(t);
      f.gb.gain.setTargetAtTime(lv * lv, t, k);
    }
    f.lp.frequency.cancelScheduledValues(t);
    f.lp.frequency.setTargetAtTime(flameCutoff(lv), t, k);
    if (lv === 0 && !f.dying) {
      f.dying = true;
      if (f.timer) clearTimeout(f.timer);
      f.timer = 0;
      f.stopAt = t + FLAME.idle;
      try {
        f.a.stop(f.stopAt);
        if (f.b) f.b.stop(f.stopAt);
      } catch {
        /* already over */
      }
    }
  }

  _flameEnd(f) {
    if (this._fl === f) this._fl = null;
    if (f.timer) clearTimeout(f.timer);
    f.timer = 0;
    f.a.onended = null;
    try {
      f.a.disconnect();
      f.lp.disconnect();
      f.ga.disconnect();
      if (f.b) {
        f.b.disconnect();
        f.gb.disconnect();
      }
    } catch {
      /* fine */
    }
  }

  // ------------------------------------------------------------ the heartbeat

  lowHp(on) {
    this._want.lowHp = !!on;
    if (this.ctx && this._lib && this.ready) this._heart(!!on);
  }

  _heart(on) {
    const ctx = this.ctx;
    const t = this._now();
    if (on) {
      if (this._hb) return;
      const ent = this._lib.pick('heartbeat');
      if (!ent) return;
      const src = ctx.createBufferSource();
      src.buffer = this._buffer(ent);
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(this.sfxBus);
      src.start(this.offline ? t : 0);
      g.gain.setTargetAtTime(1.5, t, 0.25);
      this._hb = { src, g };
    } else if (this._hb) {
      const hb = this._hb;
      this._hb = null;
      hb.g.gain.cancelScheduledValues(t);
      hb.g.gain.setTargetAtTime(0, t, 0.15);
      try {
        hb.src.stop(t + 1);
        hb.src.onended = () => {
          hb.src.disconnect();
          hb.g.disconnect();
        };
      } catch {
        /* fine */
      }
    }
  }

  // ------------------------------------------------------------ the score

  // 'menu' | 'battle' | 'boss' | 'none'. Also 'victory' and 'defeat': one-shot stings that take
  // the score over until the next music() call. Crossfades in about a second.
  music(name) {
    const want = name === 'none' || name == null ? null : String(name);
    if (want !== null && !TRACKS[want]) return;
    this._want.music = want;
    if (this.ctx && this._lib) this._startMusic(want, true);
  }

  _startMusic(want, explicit) {
    const M = this._m;
    const cur = M.cur;
    if (want === null) {
      M.started = null;
      M.pending = null;
      if (cur) this._fadeOut(cur);
      M.cur = null;
      return;
    }
    if (cur && cur.name === want && (!cur.ended || !explicit)) {
      M.started = want;
      M.pending = null;
      return;
    }
    const entry = this._lib.music.get(want);
    if (!entry) {
      M.pending = want;
      this._lib.bump(want);
      this._schedule();
      return;
    }
    if (!this.ready) {
      // keep it for when the context runs
      M.pending = want;
      return;
    }
    M.pending = null;
    M.started = want;
    if (cur) this._fadeOut(cur);
    M.cur = this._playTrack(want, entry);
  }

  // stems of a track as AudioBuffers, made the first time it plays (the 16-bit copy is let go)
  _stemBuffer(entry, k) {
    if (entry.bufs[k]) return entry.bufs[k];
    const { L, R } = entry.stems[k];
    const n = L.length;
    const b = this.ctx.createBuffer(2, n, entry.sr);
    const l = b.getChannelData(0);
    const r = b.getChannelData(1);
    const q = entry.norm;
    for (let i = 0; i < n; i++) {
      l[i] = L[i] * q;
      r[i] = R[i] * q;
    }
    entry.bufs[k] = b;
    if (!this._keepData) entry.stems[k] = null;
    return b;
  }

  _playTrack(name, entry) {
    const ctx = this.ctx;
    const T = TRACKS[name];
    const t = this._now() + 0.06;
    const i = this._want.intensity;
    this._m.int = i;
    const mix = T.mix(i);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.setTargetAtTime(T.trim(i), t, 0.3);
    bus.connect(this.musicLP);
    const g = { name, T, bus, srcs: [], gains: [], ended: false };
    for (let k = 0; k < entry.stems.length && (entry.bufs[k] || entry.stems[k]); k++) {
      const src = ctx.createBufferSource();
      src.buffer = this._stemBuffer(entry, k);
      src.loop = T.loop;
      if (T.loop) {
        src.loopStart = 0;
        src.loopEnd = src.buffer.duration;
      }
      src.playbackRate.value = this._musicRate;
      const sg = ctx.createGain();
      sg.gain.value = mix[k];
      src.connect(sg);
      sg.connect(bus);
      src.start(t);
      g.srcs.push(src);
      g.gains.push(sg);
    }
    if (!T.loop && g.srcs[0]) {
      g.srcs[0].onended = () => {
        g.ended = true;
        bus.disconnect();
      };
    }
    return g;
  }

  _fadeOut(g) {
    const t = this._now();
    g.bus.gain.cancelScheduledValues(t);
    g.bus.gain.setTargetAtTime(0, t, 0.3);
    for (const s of g.srcs) {
      try {
        s.stop(t + 2.5);
      } catch {
        /* fine */
      }
    }
    g.fading = true;
    this._m.old.push(g);
    if (this._m.old.length > 3) this._retire(this._m.old.shift());
    if (!this.offline) {
      setTimeout(() => {
        const i = this._m.old.indexOf(g);
        if (i >= 0) this._m.old.splice(i, 1);
        this._retire(g);
      }, 3000);
    }
  }

  _retire(g) {
    for (const s of g.srcs) {
      try {
        s.stop();
      } catch {
        /* fine */
      }
    }
    try {
      g.bus.disconnect();
    } catch {
      /* fine */
    }
  }

  // 0..1: how much of the battle score is playing (more enemies, more intensity)
  setIntensity(x) {
    const v = clamp(Number(x) || 0, 0, 1);
    this._want.intensity = v;
    const g = this._m.cur;
    if (!this.ctx || !g || Math.abs(v - this._m.int) < 0.015) return;
    this._m.int = v;
    const t = this._now();
    const mix = g.T.mix(v);
    for (let k = 0; k < g.gains.length; k++) g.gains[k].gain.setTargetAtTime(mix[k], t, 0.8);
    g.bus.gain.setTargetAtTime(g.T.trim(v), t, 0.8);
  }

  // dip the music for a big moment: amount 0..1 (0.5 halves it), seconds to recover
  duck(amount = 0.5, seconds = 0.6) {
    if (!this.ctx) return;
    const target = 1 - clamp(Number(amount) || 0, 0, 0.95);
    const t = this._now();
    const sec = Math.max(0.1, Number(seconds) || 0.6);
    if (t < this._duckUntil && target > this._duckDepth) return;
    this._duckDepth = target;
    this._duckUntil = t + 0.05 + sec * 0.95;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(target, t, 0.02);
    g.setTargetAtTime(1, t + 0.05 + sec * 0.35, sec * 0.2);
  }

  // 1 = normal, 0.25 = slow motion: the score drops in pitch and loses its highs, one-shots get deeper
  slowmo(k) {
    const v = clamp(Number(k) || 1, 0.1, 1);
    if (v === this._slow || (Math.abs(v - this._slow) < 0.01 && v !== 1)) return;
    this._slow = v;
    this._rateF = 0.55 + 0.45 * v;
    this._musicRate = 0.45 + 0.55 * v;
    if (!this.ctx) return;
    const t = this._now();
    this.musicLP.frequency.setTargetAtTime(v === 1 ? 20000 : 600 + 19400 * Math.pow(v, 2.5), t, 0.08);
    this.sfxLP.frequency.setTargetAtTime(v === 1 ? 22000 : 1500 + 20500 * v * v, t, 0.08);
    const m = this._m;
    for (const g of m.cur ? [m.cur, ...m.old] : m.old) for (const s of g.srcs) s.playbackRate.setTargetAtTime(this._musicRate, t, 0.1);
    if (v === 1 || Math.abs(v - this._slowVoices) >= 0.03) {
      this._slowVoices = v;
      for (const x of this._voices) if (!x.ui) x.src.playbackRate.setTargetAtTime(x.rate * this._rateF, t, 0.06);
      const f = this._fl;
      if (f) {
        f.a.playbackRate.setTargetAtTime(this._rateF, t, 0.06);
        if (f.b) f.b.playbackRate.setTargetAtTime(this._rateF, t, 0.06);
      }
    }
  }

  // on quit to title: every sound off, the score faded out, slow motion and the heartbeat reset
  stopAll() {
    this._want.music = null;
    this._want.lowHp = false;
    if (!this.ctx) return;
    const now = this._now();
    for (const v of this._voices.slice()) this._steal(v, now);
    if (this._fl && !this._fl.dying) this._flameSet(this._fl, 0, now, 0.02);
    this._heart(false);
    this._startMusic(null, true);
    this.slowmo(1);
    this._duckDepth = 1;
    this._duckUntil = 0;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(1, now, 0.1);
  }
}

// ----------------------------------------------------------------------------
// a self test for the lead to run in a muted headless browser

const bad = (a) => {
  for (let i = 0; i < a.length; i++) if (!(a[i] > -64 && a[i] < 64)) return true;
  return false;
};

// Render every one-shot (and, by default, every music loop) once and report on it; then, if there is an
// OfflineAudioContext, play a hard scene through the real graph and check the output never clips.
//   resolves { ok, rendered: [names], ms, renderMs, levels: [{name, dur, peak, rms, loud}], music: [...], errors, graph }
export async function selfTest({ music = true, graph = true } = {}) {
  const t0 = performance.now();
  const lib = new Library();
  lib.renderAll({ music });
  const renderMs = performance.now() - t0;
  const errors = [...lib.errors];
  const rendered = [];
  const levels = [];
  for (const [key, arr] of lib.sfx) {
    arr.forEach((e, v) => {
      const name = arr.length > 1 ? `${key}#${v}` : key;
      if (!e) {
        errors.push(`${name}: not rendered`);
        return;
      }
      rendered.push(name);
      const lv = { name, dur: +e.dur.toFixed(3), peak: +e.peak.toFixed(3), rms: +e.rms.toFixed(4), loud: +e.loud.toFixed(1) };
      levels.push(lv);
      if (SFX[key].loop) {
        // a loop must run on from its last sample to its first like any two neighbours: the step across the seam
        // against the typical step
        const d = e.data;
        let ds = 0;
        for (let i = 1; i < d.length; i++) ds += (d[i] - d[i - 1]) * (d[i] - d[i - 1]);
        lv.seam = +(Math.abs(d[0] - d[d.length - 1]) / (Math.sqrt(ds / d.length) + 1e-9)).toFixed(2);
        if (lv.seam > 6) errors.push(`${name}: the loop has a seam (${lv.seam}x the typical step)`);
      }
      if (bad(e.data)) errors.push(`${name}: not a number or out of range`);
      if (e.peak < 0.02) errors.push(`${name}: silent (peak ${e.peak.toFixed(4)})`);
      if (e.peak > 1.0001) errors.push(`${name}: clips (peak ${e.peak.toFixed(3)})`);
    });
  }
  const tracks = [];
  for (const [name, e] of lib.music) {
    rendered.push(`music.${name}`);
    tracks.push({ name, dur: +e.dur.toFixed(2), stems: e.stems.length, peak: +e.peak.toFixed(3), loud: +e.loud.toFixed(1) });
    if (e.peak < 0.02) errors.push(`music.${name}: silent`);
    if (e.peak > 1.3) errors.push(`music.${name}: too hot (peak ${e.peak.toFixed(2)})`);
    for (const st of e.stems) {
      let sat = 0;
      for (let i = 0; i < st.L.length; i++) if (st.L[i] === 32767 || st.L[i] === -32767) sat++;
      if (sat > 8) errors.push(`music.${name}: a stem clips (${sat} samples at full scale)`);
    }
  }
  if (music) {
    for (const name of Object.keys(TRACKS)) if (!lib.music.has(name)) errors.push(`music.${name}: not rendered`);
  }
  // every method before unlock() must be a quiet no-op
  try {
    const dry = new Sound();
    dry.setVolume(0.5);
    dry.setMusicVolume(0.5);
    dry.music('battle');
    dry.setIntensity(0.5);
    dry.slowmo(0.5);
    dry.duck(0.5, 1);
    dry.lowHp(true);
    for (const k of ['blaster', 'scatter', 'rocket', 'railgun']) dry.shot(k, 0.2);
    dry.hit(0, true);
    dry.kill(0, true);
    dry.explode(0, 1);
    dry.gem(5);
    dry.streak(3);
    dry.pickup('heart');
    dry.ui('click');
    for (const level of [1, 0.5, 0, NaN, undefined]) dry.flame(level);
    for (const id of ['blaster', 'scatter', 'rocket', 'flamer', 'railgun', 'nope']) dry.weaponSwap(id);
    dry.weaponUp(2);
    dry.weaponUp(3);
    dry.crate();
    for (const kind of ['overdrive', 'triple', 'rage']) dry.surge(kind);
    dry.surgeEnd();
    if (dry._fl) errors.push('flame: a locked Sound started a loop');
    for (const m of ['headPop', 'gib', 'freeze', 'shatter', 'zap', 'spit', 'enemyShot', 'levelUp', 'card', 'evolve', 'waveStart', 'waveComplete', 'coin', 'claim', 'shieldUp', 'shieldHit', 'shieldDown', 'bombThrow', 'lightning', 'hurt', 'death', 'bossRoar', 'bossSlam', 'bossCharge', 'bossDeath', 'stopAll']) dry[m](0);
  } catch (err) {
    errors.push(`api before unlock: ${err && err.message ? err.message : err}`);
  }
  let g = null;
  if (graph) {
    try {
      g = await graphTest(lib, music);
      if (!g.skipped && !g.ok) errors.push(`graph: ${g.why}`);
    } catch (err) {
      g = { ok: false, why: String(err && err.message ? err.message : err) };
      errors.push(`graph: ${g.why}`);
    }
  }
  return { ok: errors.length === 0, rendered, ms: +(performance.now() - t0).toFixed(0), renderMs: +renderMs.toFixed(0), levels, music: tracks, errors, graph: g };
}

// a hard scene through the real graph in an OfflineAudioContext: a storm of hits and kills, blasts, stings, the score
async function graphTest(lib, withMusic) {
  const OAC = typeof globalThis !== 'undefined' && (globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext);
  if (!OAC) return { skipped: true, ok: true };
  const sr = 44100;
  const secs = 6;
  const ctx = new OAC(2, sr * secs, sr);
  const s = new Sound();
  s.attach(ctx, { lib });
  s._clock = 0;
  if (withMusic) {
    s.music('battle');
    s.setIntensity(1);
  }
  let calls = 0;
  for (let i = 0; i < 600; i++) {
    s._clock = 0.4 + i * 0.002;
    const pan = ((i % 9) - 4) / 4;
    s.hit(pan, i % 5 === 0);
    s.kill(pan, i % 11 === 0);
    s.shot('blaster', pan);
    s.gem(i % 16);
    s.coin();
    s.gib(pan);
    calls += 6;
  }
  // the flamethrower is held through all of it, a call a frame (1/60 s): up, full, flickering down, let go, a tap while the
  // loop is still running, held again, let go for good, and started afresh after the loop was stopped
  const lvAt = (t) => (t < 0.5 ? 0 : t < 0.7 ? (t - 0.5) / 0.2 : t < 1.8 ? 1 : t < 2.2 ? 0.35 + 0.1 * Math.sin(t * 40) : t < 2.4 ? 0 : t < 3.2 ? 0.8 + 0.2 * Math.sin(t * 9) : t < 4.4 ? 0 : t < 5.4 ? 0.7 : 0);
  const timeline = [
    [1.0, () => s.explode(0, 1)], [1.05, () => s.bossSlam()], [1.1, () => s.levelUp()], [1.5, () => s.lightning()],
    [1.6, () => s.explode(-0.5, 0.7)], [1.7, () => s.bossRoar()], [2.0, () => s.freeze()], [2.1, () => s.shatter(0.3)],
    [2.5, () => s.slowmo(0.3)], [2.6, () => s.streak(5)], [2.7, () => s.bossDeath()], [3.0, () => s.slowmo(1)],
    [3.1, () => s.evolve()], [3.4, () => s.waveComplete()], [3.6, () => s.lowHp(true)],
    [0.9, () => s.weaponSwap('flamer')], [1.2, () => s.crate()], [1.4, () => s.weaponUp(2)], [1.9, () => s.surge('overdrive')],
    [2.2, () => s.surge('triple')], [2.9, () => s.weaponUp(3)], [3.3, () => s.surge('rage')], [3.9, () => s.surgeEnd()],
    [4.2, () => s.weaponSwap('blaster')], [4.4, () => s.weaponSwap('scatter')], [4.6, () => s.weaponSwap('rocket')], [4.8, () => s.weaponSwap('railgun')],
  ];
  for (let t = 0.4; t < 5.95; t += 1 / 60) timeline.push([t, () => s.flame(lvAt(t)), true]);
  timeline.sort((x, y) => x[0] - y[0]); // in time order, as the game would call them
  let flames = 0;
  for (const [t, fn, frame] of timeline) {
    s._clock = t;
    fn();
    if (frame) flames++;
    else calls++;
  }
  for (const name of ['shot', 'zap', 'spit', 'enemyShot', 'hurt', 'death', 'claim', 'card', 'waveStart', 'shieldUp', 'shieldHit', 'shieldDown', 'bombThrow', 'bossCharge', 'headPop']) {
    s._clock = 4 + calls * 0.001;
    if (name === 'shot') s.shot('scatter', 0);
    else s[name](0);
  }
  for (const k of ['magnet', 'freeze', 'shield', 'bomb', 'heart', 'chest', 'weapon']) {
    s._clock = 4.5;
    s.pickup(k);
  }
  for (const k of ['hover', 'click', 'card', 'claim', 'coin']) {
    s._clock = 4.6;
    s.ui(k);
  }
  const started = s._voices.length;
  const t1 = performance.now();
  const buf = await ctx.startRendering();
  let peak = 0;
  let clipped = 0;
  let nan = 0;
  const rms = [];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let sec = 0; sec < secs; sec++) {
      let ss = 0;
      for (let i = sec * sr; i < (sec + 1) * sr; i++) {
        const v = d[i];
        if (v !== v) nan++;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        if (a >= 0.999) clipped++;
        ss += v * v;
      }
      rms[sec] = Math.max(rms[sec] || 0, +Math.sqrt(ss / sr).toFixed(4));
    }
  }
  const out = { ok: true, peak: +peak.toFixed(4), clipped, nan, rms, voicesAtStart: started, voicesLeft: s._voices.length, renderMs: +(performance.now() - t1).toFixed(0), calls, flames };
  if (nan) {
    out.ok = false;
    out.why = `${nan} NaN samples`;
  } else if (peak < 0.05) {
    out.ok = false;
    out.why = 'silent';
  } else if (peak > 1) {
    out.ok = false;
    out.why = `output peaks at ${peak}`;
  }
  return out;
}
