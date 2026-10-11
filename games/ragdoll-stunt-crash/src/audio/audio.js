// Ragdoll Stunt Crash's sound: everything is synthesised at run time with Web Audio, no audio files, no samples,
// no network.
//
// How it is built:
//  - every one-shot (impacts on eight materials in three weights, bones, tearing, glass, blasts, the crash, boings,
//    launches, the crowd, stunt stings, the tally and the interface) is rendered once, in plain JS, into a short
//    mono buffer by the recipes in sfx.js / sfx2.js (layers.js, dsp.js), a few random variants each, and both music
//    loops into stereo stems (music.js). lib.js keeps the queue: prewarm() (or unlock()) starts it and it renders a
//    few milliseconds at a time, the common sounds first, so no frame stalls. Each buffer is measured and scaled to
//    its target loudness, so the mix is balanced by number;
//  - a one-shot plays as source -> gain -> one of nine shared pan lanes -> the effects bus: two nodes per voice,
//    nothing built per call but the source. Every sound (or group of sounds, like all the impacts) has a minimum gap
//    (calls that come sooner are dropped and make the next one a little louder), a cap on how many may sound at once
//    (the oldest of its kind is cut) and a priority; at 40 voices the oldest voice of equal or lower priority goes,
//    or the new sound is dropped. The more voices are already sounding, the quieter a new one starts;
//  - the four continuous sounds (engine, rocket, wind, slingshot stretch) are not one-shots: each is a small graph of
//    oscillators and a noise loop built the first time it is used and kept for good. The game calls
//    engine(level, rpm) and so on as often as it likes (a call that changes nothing does no work) and only parameters
//    move, glided so nothing clicks. At level 0 a sound fades out and, a little later, its output is unplugged, so an
//    idle sound costs nothing; none of them stops by itself, so call stopAll() or set the level to 0 to end a run;
//  - the score is looping stems played in sync with the audio clock: no scheduler, nothing to drift. Slow motion is
//    the loops' playback rate plus a low-pass. Tracks crossfade in about 1 s;
//  - the master chain is volume -> a soft ceiling (a waveshaper that is untouched up to 0.75 and eases towards 0.985). There is
//    no DynamicsCompressorNode on purpose: Chrome's one dulls sharp transients by several dB whatever the settings, and a
//    crack that loses its edge is no crack. The sounds are levelled by number instead (lib.js), and a pile of hits saturates softly.
// Every method is safe to call before unlock() and when muted: it does nothing until the context is running; what is
// asked for early (the music, slow motion) is remembered and applied.
import { Library } from './lib.js';
import { SFX, TRACKS } from './bank.js';
import { clamp, seeded } from './dsp.js';
import { MAT_NAMES } from './sfx.js';

const MAX_VOICES = 40;
const MAJOR = [0, 2, 4, 5, 7, 9, 11]; // the tally ticks climb a major scale

// the keys the one-shot methods play (no string building per call)
const IMPACT = {};
for (const mat of MAT_NAMES) IMPACT[mat] = [`impact.${mat}.0`, `impact.${mat}.1`, `impact.${mat}.2`];
const CRACK = ['crack.0', 'crack.1'];
const SPLAT = ['splat.0', 'splat.1'];
const GLASS = ['glass.0', 'glass.1'];
const EXPLODE = ['explode.0', 'explode.1', 'explode.2'];
const CRASH = ['crash.0', 'crash.1'];
const CANNON = ['cannon.0', 'cannon.1'];
const SPLASH = ['splash.0', 'splash.1'];
const CROWD = { ooh: 'crowd.ooh', cheer: 'crowd.cheer', gasp: 'crowd.gasp' };
const POPUP = ['popup.0', 'popup.1', 'popup.2', 'popup.3'];

// sounds with a pitch of their own are not detuned at random (they would clash with the score)
const jitterOf = (key) => (/^(popup|tick|cash|click|unlock|fail|win|horn)/.test(key) ? 0 : /^(boing|crowd|sling)/.test(key) ? 0.03 : 0.05);

// a soft ceiling: untouched up to 0.75, eased towards 0.985 which it never passes. The curve spans signals of +-2, so
// a gain of 0.5 goes in front of the waveshaper (which sees +-1 only)
function softCeiling() {
  const n = 4097;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.75 ? a : 0.75 + 0.235 * Math.tanh((a - 0.75) / 0.235));
  }
  return c;
}

// a gentle tanh drive for the engine
function driveCurve(k) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1));
  return c;
}

// how long after a continuous sound falls to level 0 its output is unplugged (ms)
const IDLE_MS = 800;

export class Sound {
  // opts.prewarm: false keeps the constructor from starting the build in the background (tests)
  constructor(opts = {}) {
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
    this._st = {}; // per key or group: last play time, dropped calls, voices now
    this._jit = {};
    for (const [key, d] of Object.entries(SFX)) {
      this._st[d.grp || key] = this._st[d.grp || key] || { last: -10, dropped: 0, n: 0 };
      this._jit[key] = jitterOf(key);
    }
    this._clock = null; // tests: the time to play at
    this._slow = 1;
    this._rateF = 1; // one-shot playback rate in slow motion
    this._musicRate = 1;
    this._slowVoices = 1;
    this._duckDepth = 1;
    this._duckUntil = 0;
    this._want = { music: undefined };
    this._m = { cur: null, old: [], pending: null, started: undefined };
    this._c = { eng: null, rkt: null, wind: null, str: null }; // the continuous sounds
    this._noise = null; // the shared noise loop they read
    this._tickN = 0;
    this._tickT = -10;
    this._pumpT = 0;
    this._pumpIdle = false;
    this._sleepT = 0;
    this._watching = false;
    this._keepData = false;
    this._onEnd = (e) => this._end(e.target);
    if (opts.prewarm !== false && this._AC()) setTimeout(() => this.prewarm(), 800);
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

  // build progress: { pending jobs, ms spent rendering, slowest slice } (for a debug overlay)
  get stats() {
    const l = this._lib;
    return l ? { pending: l.pending, done: l.stats.done, jobs: l.stats.jobs, ms: l.stats.ms, longest: l.stats.longest, errors: l.errors.length } : null;
  }

  // ------------------------------------------------------------ context

  _AC() {
    return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  }

  // Start rendering the sounds without an audio context (the constructor does it a moment after load; unlock()
  // does it anyway). Does nothing on a browser without Web Audio.
  prewarm() {
    if (this._lib || (!this._AC() && !this.offline)) return;
    this._lib = new Library();
    this._schedule();
  }

  // true once a track ('menu', 'run') is built, so music(name) starts it at once
  musicReady(name) {
    return !!this._lib && this._lib.music.has(name);
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
    // the master chain: volume, then a soft ceiling
    this.mix = gain(1);
    this.master = gain(this._audible() ? this._volume : 0);
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = softCeiling();
    ceiling.oversample = '2x';
    this.mix.connect(this.master).connect(gain(0.5)).connect(ceiling).connect(ctx.destination);
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
    // the noise the continuous sounds read: three seconds of white noise at 24 kHz, looped
    const nb = ctx.createBuffer(1, 72000, 24000);
    const nd = nb.getChannelData(0);
    const r = seeded(4242);
    for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;
    this._noise = nb;
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
    // idle time when the browser offers it, a small steady slice when it does not; more when the score is
    // waiting for its track or the first sounds are not made yet
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

  // flags: 1 = interface (slow motion does not touch it), 2 = keep the pitch exact, 4 = second of a pair (no gap check)
  _play(key, pan, level, rate, flags) {
    if (!this._ok() || !this._lib) return;
    const def = SFX[key];
    const gk = def.grp || key;
    const st = this._st[gk];
    const now = this._now();
    if (!(flags & 4)) {
      if (def.gap && now - st.last < def.gap * 0.001) {
        if (st.dropped < 8) st.dropped++;
        return;
      }
      st.last = now;
      level *= 1 + 0.09 * st.dropped;
      st.dropped = 0;
    }
    const ent = this._lib.pick(key);
    if (!ent) return;
    if (st.n >= def.max) {
      const v = this._oldest(gk, -1);
      if (v) this._steal(v, now);
    }
    while (this._voices.length >= MAX_VOICES) {
      const v = this._oldest(null, def.pri);
      if (!v) return;
      this._steal(v, now);
    }
    const ctx = this.ctx;
    const ui = (flags & 1) !== 0;
    // a busy moment is not made louder by every extra voice: each one already sounding takes 2.5 % off the next, down to 60 %
    if (!ui) level *= 1 - Math.min(0.4, this._voices.length * 0.025);
    const src = ctx.createBufferSource();
    src.buffer = this._buffer(ent);
    const jit = flags & 2 ? 0 : this._jit[key];
    const base = rate * (1 + (Math.random() * 2 - 1) * jit);
    src.playbackRate.value = ui ? base : base * this._rateF;
    const g = this._gains.pop() || ctx.createGain();
    g.gain.cancelScheduledValues(0);
    g.gain.value = Math.min(2.5, level * (0.92 + Math.random() * 0.16));
    src.connect(g);
    g.connect(this._lanes[((clamp(+pan || 0, -1, 1) + 1) * 4 + 0.5) | 0]);
    const v = this._vfree.pop() || {};
    v.key = gk;
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

  // ------------------------------------------------------------ the game's sounds
  // strength / size / power are 0..1; pan is -1 (left of the screen) .. 1 (right)

  // A body part hitting something. mat: 'flesh' | 'metal' | 'concrete' | 'wood' | 'glass' | 'rubber' | 'dirt' | 'snow'.
  // Three weights (a brush, a knock, a smash) are cross-faded by strength, the pitch falls as it gets harder.
  impact(strength = 0.5, mat = 'flesh', pan = 0) {
    const s = clamp(Number(strength) || 0, 0, 1);
    if (s < 0.03) return;
    const keys = IMPACT[mat] || IMPACT.flesh;
    const w = s < 0.34 ? 0 : s < 0.67 ? 1 : 2;
    const f = (s - (w === 0 ? 0 : w === 1 ? 0.34 : 0.67)) / (w === 0 ? 0.34 : 0.33);
    this._play(keys[w], pan, 0.6 + 0.6 * f, 1.1 - 0.22 * s, 0);
  }

  // a bone breaking: a dry crack and a crunch (strength above about 0.55 is the big, wincing one)
  crack(strength = 0.5, pan = 0) {
    const s = clamp(Number(strength) || 0, 0, 1);
    this._play(CRACK[s < 0.55 ? 0 : 1], pan, 0.75 + 0.5 * s, 1.08 - 0.16 * s, 0);
  }

  // a limb tearing off: a wet tear and a squelch
  rip(pan = 0) {
    this._play('rip', pan, 1, 1, 0);
  }

  // the neck
  snap(pan = 0) {
    this._play('snap', pan, 1, 1, 0);
  }

  // blood splatting, or a body landing wet
  splat(strength = 0.5, pan = 0) {
    const s = clamp(Number(strength) || 0, 0, 1);
    this._play(SPLAT[s < 0.5 ? 0 : 1], pan, 0.7 + 0.5 * s, 1.08 - 0.16 * s, 0);
  }

  // glass shattering, with tinkles (a small pane below strength 0.5)
  glass(strength = 0.5, pan = 0) {
    const s = clamp(Number(strength) || 0, 0, 1);
    this._play(GLASS[s < 0.5 ? 0 : 1], pan, 0.7 + 0.5 * s, 1.05 - 0.1 * s, 0);
  }

  // an oil drum (about 0.3) to a TNT stack (1): bigger is louder, deeper and longer
  explode(size = 0.5, pan = 0) {
    const z = clamp(Number(size) || 0, 0, 1);
    this._play(EXPLODE[z < 0.3 ? 0 : z < 0.65 ? 1 : 2], pan, 0.7 + 0.6 * z, 1.12 - 0.3 * z, 0);
  }

  // a car into a wall: a huge thud, tearing metal, glass, a hubcap rattling away, steam
  crash(strength = 0.7, pan = 0) {
    const s = clamp(Number(strength) || 0, 0, 1);
    this._play(CRASH[s < 0.65 ? 0 : 1], pan, 0.7 + 0.4 * s, 1.1 - 0.15 * s, 0);
  }

  // a trampoline or a bumper
  boing(strength = 0.6, pan = 0) {
    const s = clamp(Number(strength) || 0, 0, 1);
    this._play('boing', pan, 0.6 + 0.6 * s, 0.9 + 0.35 * s, 0);
  }

  // a circus cannon (below power 0.6) or the mega cannon
  cannon(power = 0.7) {
    const p = clamp(Number(power) || 0, 0, 1);
    this._play(CANNON[p < 0.6 ? 0 : 1], 0, 0.8 + 0.5 * p, 1.1 - 0.25 * p, 0);
  }

  // the slingshot letting go
  sling(power = 0.7) {
    const p = clamp(Number(power) || 0, 0, 1);
    this._play('sling', 0, 0.6 + 0.6 * p, 0.9 + 0.3 * p, 0);
  }

  skid(strength = 0.6) {
    const s = clamp(Number(strength) || 0, 0, 1);
    this._play('skid', 0, 0.5 + 0.7 * s, 0.9 + 0.3 * s, 0);
  }

  // a traffic horn: a car's double beep or a lorry's blast
  horn() {
    this._play('horn', 0, 1, 1, 0);
  }

  splash(strength = 0.6) {
    const s = clamp(Number(strength) || 0, 0, 1);
    this._play(SPLASH[s < 0.5 ? 0 : 1], 0, 0.7 + 0.5 * s, 1.1 - 0.2 * s, 0);
  }

  // lava
  sizzle() {
    this._play('sizzle', 0, 1, 1, 0);
  }

  // 'ooh' | 'cheer' | 'gasp': two different takes, one hard left and one hard right, so it is wide
  crowd(kind) {
    const key = CROWD[kind];
    if (!key) return;
    this._play(key, -0.6, 0.75, 1, 0);
    this._play(key, 0.6, 0.75, 1, 4);
  }

  // a sting for a stunt popup, tier 0..3: a blip, a run, a flourish, a fanfare
  popup(tier = 0) {
    this._play(POPUP[clamp(Math.round(Number(tier) || 0), 0, 3)], 0, 1, 1, 2);
  }

  // a tally tick: a tick that follows another within a third of a second steps up a major scale, so a rolling counter climbs
  tick() {
    if (!this._ok()) return;
    const now = this._now();
    if (now - this._tickT > 0.35) this._tickN = 0;
    else if (this._tickN < 10) this._tickN++;
    this._tickT = now;
    const n = this._tickN;
    this._play('tick', 0, 1, Math.pow(2, MAJOR[n % 7] / 12 + ((n / 7) | 0)), 3);
  }

  // ka-ching
  cash() {
    this._play('cash', 0, 1, 1, 3);
  }

  click() {
    this._play('click', 0, 1, 1, 3);
  }

  // a new track is unlocked
  unlockSting() {
    this._play('unlock', 0, 1, 1, 3);
  }

  // the target missed: a sad trombone
  fail() {
    this._play('fail', 0, 1, 1, 3);
  }

  // the target hit: a brass fanfare
  win() {
    this._play('win', 0, 1, 1, 3);
  }

  // ------------------------------------------------------------ the continuous sounds

  // an oscillator of a type at a frequency, started now
  _osc(type, f, t) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(this.offline ? t : 0);
    return o;
  }

  _gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _filter(type, f, q) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  // a looping read of the shared noise, from a different place each time
  _noiseSrc(t) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    s.start(this.offline ? t : 0, Math.random() * 2.9);
    return s;
  }

  // plug a continuous sound's output in (level above 0) or, a while after it fell to 0, unplug it
  _contLevel(c, lv) {
    if (lv > 0) {
      if (c.timer) clearTimeout(c.timer);
      c.timer = 0;
      if (!c.conn) {
        c.out.connect(this._lanes[4]);
        c.conn = true;
      }
    } else if (c.conn && !c.timer && !this.offline) {
      c.timer = setTimeout(() => {
        c.timer = 0;
        if (c.lv === 0 && c.conn) {
          c.out.disconnect();
          c.conn = false;
        }
      }, IDLE_MS);
    }
  }

  // a level 0..1 rounded to 1/50; 0 when nothing can play
  _lv(level) {
    return this._ok() ? Math.round(clamp(Number(level) || 0, 0, 1) * 50) / 50 : 0;
  }

  // The engine, a car or bike: level 0..1 (0 fades it out), rpm 0..1. Two saws and a square an octave down, a firing
  // pulse (an LFO at half the fundamental that blurs into a buzz as the revs climb), a growl of intake noise, a tanh
  // drive and a low-pass that opens with the rpm.
  engine(level = 0, rpm = 0) {
    const lv = this._lv(level);
    const r = Math.round(clamp(Number(rpm) || 0, 0, 1) * 100) / 100;
    let e = this._c.eng;
    if (!e) {
      if (lv === 0) return;
      e = this._c.eng = this._engineMake();
    }
    if (lv === e.lv && r === e.rpm) return;
    e.lv = lv;
    e.rpm = r;
    this._engineSet(e, this._now(), 0.04);
    this._contLevel(e, lv);
  }

  _engineMake() {
    const t = this._now();
    const e = { lv: 0, rpm: 0, conn: false, timer: 0 };
    e.out = this._gain(0);
    e.lp = this._filter('lowpass', 400, 1.2);
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = driveCurve(2.5);
    const am = this._gain(0.68);
    const mix = this._gain(1);
    e.a = this._osc('sawtooth', 60, t);
    e.b = this._osc('square', 30, t);
    e.c = this._osc('sawtooth', 61, t);
    const gb = this._gain(0.4);
    const gc = this._gain(0.55);
    e.a.connect(mix);
    e.b.connect(gb).connect(mix);
    e.c.connect(gc).connect(mix);
    e.lfo = this._osc('sine', 30, t);
    e.lfoG = this._gain(0.3);
    e.lfo.connect(e.lfoG).connect(am.gain);
    e.ng = this._gain(0);
    this._noiseSrc(t).connect(this._filter('bandpass', 900, 0.8)).connect(e.ng).connect(mix);
    mix.connect(am).connect(shaper).connect(e.lp).connect(e.out);
    return e;
  }

  _engineSet(e, t, tc) {
    const { lv, rpm } = e;
    const f = (42 + 190 * rpm) * this._rateF;
    e.a.frequency.setTargetAtTime(f, t, tc);
    e.b.frequency.setTargetAtTime(f * 0.5, t, tc);
    e.c.frequency.setTargetAtTime(f * 1.012, t, tc);
    e.lfo.frequency.setTargetAtTime(f * 0.5, t, tc);
    e.lfoG.gain.setTargetAtTime(0.32 * (1 - 0.55 * rpm), t, tc);
    e.lp.frequency.setTargetAtTime((320 + 2600 * rpm + 700 * lv) * (0.5 + 0.5 * this._rateF), t, tc);
    e.ng.gain.setTargetAtTime(0.03 + 0.25 * rpm * lv, t, tc);
    e.out.gain.cancelScheduledValues(t);
    e.out.gain.setTargetAtTime(lv * (0.55 + 0.45 * rpm) * 0.28, t, lv > 0 ? 0.04 : 0.15);
  }

  // The rocket's roar, level 0..1: noise through a low-pass that opens with the level, a saw rumbling underneath,
  // a crackle of bright noise.
  rocket(level = 0) {
    const lv = this._lv(level);
    let k = this._c.rkt;
    if (!k) {
      if (lv === 0) return;
      k = this._c.rkt = this._rocketMake();
    }
    if (lv === k.lv) return;
    k.lv = lv;
    this._rocketSet(k, this._now(), 0.05);
    this._contLevel(k, lv);
  }

  _rocketMake() {
    const t = this._now();
    const k = { lv: 0, conn: false, timer: 0 };
    k.out = this._gain(0);
    k.lp = this._filter('lowpass', 800, 0.7);
    this._noiseSrc(t).connect(k.lp).connect(k.out);
    k.sub = this._osc('sawtooth', 55, t);
    const sublp = this._filter('lowpass', 180, 0.8);
    const subAm = this._gain(0.7);
    const lfo = this._osc('sine', 29, t);
    const lfoG = this._gain(0.3);
    lfo.connect(lfoG).connect(subAm.gain);
    k.sub.connect(sublp).connect(subAm);
    k.subG = this._gain(0.5);
    subAm.connect(k.subG).connect(k.out);
    k.cr = this._gain(0);
    const crAm = this._gain(0.6);
    const lfo2 = this._osc('square', 41, t);
    const lfo2G = this._gain(0.4);
    lfo2.connect(lfo2G).connect(crAm.gain);
    this._noiseSrc(t).connect(this._filter('highpass', 3000, 0.7)).connect(crAm).connect(k.cr).connect(k.out);
    return k;
  }

  _rocketSet(k, t, tc) {
    const lv = k.lv;
    k.lp.frequency.setTargetAtTime((600 + 3800 * lv) * (0.5 + 0.5 * this._rateF), t, tc);
    k.sub.frequency.setTargetAtTime((46 + 22 * lv) * this._rateF, t, tc);
    k.cr.gain.setTargetAtTime(0.25 * lv, t, tc);
    k.out.gain.cancelScheduledValues(t);
    k.out.gain.setTargetAtTime(Math.pow(lv, 0.85) * 0.4, t, lv > 0 ? 0.05 : 0.2);
  }

  // The wind of a fast flight, speed 0..1: band-passed noise that brightens and swells with the speed, swaying in
  // gusts, with a thin whistle that comes in near the top.
  wind(speed = 0) {
    const lv = this._lv(speed);
    let w = this._c.wind;
    if (!w) {
      if (lv === 0) return;
      w = this._c.wind = this._windMake();
    }
    if (lv === w.lv) return;
    w.lv = lv;
    this._windSet(w, this._now(), 0.12);
    this._contLevel(w, lv);
  }

  _windMake() {
    const t = this._now();
    const w = { lv: 0, conn: false, timer: 0 };
    w.out = this._gain(0);
    w.bp = this._filter('bandpass', 400, 0.6);
    const sway = this._gain(0.8);
    const lfo = this._osc('sine', 0.37, t);
    const lfoG = this._gain(0.2);
    lfo.connect(lfoG).connect(sway.gain);
    const lfoF = this._osc('sine', 0.23, t);
    w.lfoFG = this._gain(80);
    lfoF.connect(w.lfoFG).connect(w.bp.frequency);
    const src = this._noiseSrc(t);
    src.connect(w.bp).connect(sway).connect(w.out);
    w.wh = this._gain(0);
    src.connect(this._filter('highpass', 2800, 0.7)).connect(this._filter('bandpass', 4200, 3)).connect(w.wh).connect(w.out);
    return w;
  }

  _windSet(w, t, tc) {
    const s = w.lv;
    w.bp.frequency.setTargetAtTime((300 + 2000 * Math.pow(s, 1.2)) * (0.6 + 0.4 * this._rateF), t, tc);
    w.lfoFG.gain.setTargetAtTime(30 + 220 * s, t, tc);
    w.wh.gain.setTargetAtTime(0.18 * s * s * s, t, tc);
    w.out.gain.cancelScheduledValues(t);
    w.out.gain.setTargetAtTime(Math.pow(s, 1.4) * 0.48, t, s > 0 ? 0.1 : 0.3);
  }

  // The slingshot's rubber creaking as it is pulled, level 0..1 (0 stops it). A stick-slip saw whose pitch and
  // resonance climb with the stretch; it creaks while the level is changing and settles to a low strain when held.
  stretch(level = 0) {
    const lv = this._lv(level);
    let s = this._c.str;
    if (!s) {
      if (lv === 0) return;
      s = this._c.str = this._stretchMake();
    }
    if (lv === s.lv) return;
    const t = this._now();
    const dt = Math.max(0.008, t - s.t);
    const speed = clamp(Math.abs(lv - s.lv) / dt, 0, 2);
    s.lv = lv;
    s.t = t;
    this._stretchSet(s, t, speed);
    this._contLevel(s, lv);
  }

  _stretchMake() {
    const t = this._now();
    const s = { lv: 0, t: t - 0.3, conn: false, timer: 0 };
    s.out = this._gain(0);
    s.osc = this._osc('sawtooth', 40, t);
    s.bp = this._filter('bandpass', 600, 6);
    const shake = this._osc('sine', 7.3, t);
    s.shakeG = this._gain(10);
    shake.connect(s.shakeG).connect(s.osc.frequency);
    s.og = this._gain(0.6);
    s.osc.connect(s.bp).connect(s.og).connect(s.out);
    s.ng = this._gain(0);
    this._noiseSrc(t).connect(this._filter('bandpass', 1800, 2.5)).connect(s.ng).connect(s.out);
    return s;
  }

  _stretchSet(s, t, speed) {
    const lv = s.lv;
    s.osc.frequency.setTargetAtTime((26 + 95 * lv + 30 * speed) * this._rateF, t, 0.03);
    s.bp.frequency.setTargetAtTime(420 + 1100 * lv, t, 0.05);
    s.shakeG.gain.setTargetAtTime(6 + 22 * lv, t, 0.1);
    s.ng.gain.setTargetAtTime(0.12 * Math.min(1, speed), t, 0.03);
    s.out.gain.cancelScheduledValues(t);
    if (lv > 0) {
      // loud while it moves, settling to a quiet strain 0.14 s after the last change
      s.out.gain.setTargetAtTime(0.25 + 1.3 * Math.min(1, speed * 1.5) * (0.4 + 0.6 * lv), t, 0.03);
      s.out.gain.setTargetAtTime(0.07 + 0.2 * lv, t + 0.14, 0.08);
    } else {
      s.out.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  // ------------------------------------------------------------ the score

  // 'menu' | 'run' | null (also 'none'). Crossfades in about a second. A tune that is not built yet is bumped to the
  // front of the queue and starts the moment it is ready; the one that is playing carries on until then.
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
    const mix = T.mix();
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.setTargetAtTime(T.trim(), t, 0.3);
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

  // 1 = normal, 0.25 = slow motion: the score drops in pitch and loses its highs, effects and engines get deeper and duller
  // (the tally and the interface are left alone)
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
      const c = this._c;
      if (c.eng && c.eng.lv > 0) this._engineSet(c.eng, t, 0.06);
      if (c.rkt && c.rkt.lv > 0) this._rocketSet(c.rkt, t, 0.06);
      if (c.wind && c.wind.lv > 0) this._windSet(c.wind, t, 0.06);
    }
  }

  // on quit to the menu: every sound off, the score faded out, slow motion reset
  stopAll() {
    this._want.music = null;
    if (!this.ctx) return;
    const now = this._now();
    for (const v of this._voices.slice()) this._steal(v, now);
    this.engine(0);
    this.rocket(0);
    this.wind(0);
    this.stretch(0);
    this._startMusic(null, true);
    this.slowmo(1);
    this._duckDepth = 1;
    this._duckUntil = 0;
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(1, now, 0.1);
  }
}
