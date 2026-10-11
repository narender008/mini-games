// Moonbound's sound: everything is synthesised with Web Audio (no audio files, no samples, no
// network, no spoken voice), dark and atmospheric.
//
// How it is built:
//  - bank.js renders every one-shot (sfx.js, sfx2.js), every drum (drums.js), every loop (loops.js)
//    and the choir pads once, in the background, with an OfflineAudioContext, measures each one and
//    scales it to a target loudness, so the mix is balanced by number. Playing a sound is then a
//    buffer source, a gain and a pan: cheap at 120 fps. A sound asked for before it is built is run
//    live from the same recipe. The harp's plucked strings are made in JS (dsp.js) on first use.
//  - the score (music.js, themes_a.js, themes_b.js) is played by a look-ahead sequencer: a timer
//    every 40 ms writes bars that start within half a second of the audio clock and builds the notes
//    that are due on the audio clock; layers fade with the (smoothed) combat intensity and the boss
//    phase. Themes crossfade; stingers (stingers.js) play over them in the key of the music.
//  - one master chain (space.js): a gentle bus compressor, a limiter and a soft ceiling, so hits can
//    stack without clipping, and one shared reverb, a cold stone hall.
// Every method is safe to call before unlock() and when muted: what is asked for early (music,
// intensity, loops, volumes) is remembered and applied when the context runs.
import { Space } from './space.js';
import { Kit } from './kit.js';
import { Bank, ALL_SFX, getOAC, bind, renderOneShot, renderLoop } from './bank.js';
import { Score, LOOK } from './music.js';
import { THEMES } from './themes.js';
import { STINGERS } from './stingers.js';
import { LOOPS } from './loops.js';
import { clamp, statsOf, seeded, hashStr } from './dsp.js';

const MAX_VOICES = 36;
const TICK_MS = 40;

// Where a sound is relative to the listener: pan, attenuation and how much wetter it gets with distance.
// The screen shows about 28 x 16 m, so a sound at the edge of the screen pans most of the way over.
function spatial(dx, dy) {
  const d = Math.hypot(dx, dy * 1.35);
  return {
    pan: clamp(dx / 12, -1, 1) * 0.85,
    att: 1 / (1 + Math.pow(Math.max(0, d - 4) / 10, 1.5)),
    wet: 1 + d / 25,
  };
}

// One voice of a buffered sound: source -> gain -> (pan) -> bus, with a send to the reverb.
function makeVoice(ctx, space, asset, p) {
  const src = ctx.createBufferSource();
  src.buffer = asset.buf(ctx);
  if (p.rate && p.rate !== 1) src.playbackRate.value = p.rate;
  const g = ctx.createGain();
  g.gain.value = p.gain;
  src.connect(g);
  let tail = g;
  if (p.pan && ctx.createStereoPanner) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = clamp(p.pan, -1, 1);
    g.connect(pn);
    tail = pn;
  }
  tail.connect(p.bus || space.sfxBus);
  let send = null;
  if (p.wet > 0.01) {
    send = ctx.createGain();
    send.gain.value = Math.min(1, p.wet);
    tail.connect(send);
    send.connect(p.send || space.sfxSend);
  }
  src.start(p.at ?? 0);
  return { src, g, tail, send };
}

export class Audio {
  // volumes: { master, music, sfx } 0..1 and { muted }
  constructor(volumes = {}) {
    this.vols = { master: 0.8, music: 0.7, sfx: 0.9, muted: false, ...volumes };
    this.ctx = null;
    this.space = null;
    this.kit = null;
    this.bank = null;
    this.score = null; // the theme playing
    this.fading = []; // themes fading out
    this.musicKey = null; // tonic pitch class of the playing theme
    this.want = { theme: undefined, themeOpts: undefined, intensity: 0, phase: 1 };
    this.I = 0; // smoothed combat intensity
    this.ph = 1;
    this.listener = { x: 0, y: 0 };
    this.voices = []; // live one-shots, oldest first
    this._st = {}; // per sound: last start, voices now
    this._loops = new Map(); // id -> { name, o, live: { src, g, pn, send } | null }
    this._timer = 0;
    this._lastTick = 0;
    this._lastUpdate = 0;
    this._lvAt = 0;
    this._loopAt = 0;
    this._suspended = false; // suspend() was called
    this._hidden = false; // the page is in the background
    this._warned = new Set();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running' && !this._suspended && !this._hidden;
  }

  // what the sound system is doing (for a debug overlay)
  get info() {
    const b = this.bank;
    return {
      state: this.ctx ? this.ctx.state : 'none',
      voices: this.voices.length,
      theme: this.score ? this.score.name : null,
      intensity: +this.I.toFixed(3),
      phase: this.ph,
      built: b ? b.done : 0,
      queued: b ? b.pending : 0,
      errors: b ? b.errors.slice() : [],
    };
  }

  // ---- context ----------------------------------------------------------------------------------

  // Call inside a user gesture, as often as you like: makes (or wakes) the audio context.
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        this.ctx = null;
        return;
      }
      this._build();
    }
    this._suspended = false;
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(() => this._apply()).catch(() => {});
    } else {
      this._apply();
    }
  }

  _build() {
    const ctx = this.ctx;
    this.space = new Space(ctx, this.vols);
    this.kit = new Kit(ctx, (Math.random() * 1e9) | 0);
    this.bank = new Bank({ sr: ctx.sampleRate });
    this.bank.queueAll();
    this._prepStingers(2);
    this.bank.start();
    // older iOS only opens the output once something has played inside the gesture
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start();
    } catch {
      /* fine */
    }
    ctx.onstatechange = () => {
      if (ctx.state === 'running') this._apply();
    };
    this._timer = setInterval(() => this._tick(), TICK_MS);
    // a hidden page's timers slow to one a second, which the look-ahead cannot cover: go quiet until it is back
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        this._hidden = document.visibilityState === 'hidden';
        if (!this.ctx) return;
        if (this._hidden) {
          if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
        } else if (!this._suspended && this.ctx.state !== 'running') {
          this.ctx.resume().then(() => this._apply()).catch(() => {});
        }
      });
    }
  }

  // what was asked for before the context ran
  _apply() {
    if (!this.ready) return;
    this.space.setVolumes(this.vols);
    if (this.vols.menu) this.space.setMenu(true);
    const w = this.want;
    this.I = this.I || 0;
    if (w.theme !== undefined && (this.score ? this.score.name : null) !== w.theme) this._startTheme(w.theme, w.themeOpts);
    this._syncLoops();
  }

  suspend() {
    this._suspended = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    this._suspended = false;
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().then(() => this._apply()).catch(() => {});
  }

  // ---- volumes ---------------------------------------------------------------------------------

  setVolumes(v = {}) {
    if (v.master !== undefined) this.vols.master = clamp(+v.master || 0, 0, 1);
    if (v.music !== undefined) this.vols.music = clamp(+v.music || 0, 0, 1);
    if (v.sfx !== undefined) this.vols.sfx = clamp(+v.sfx || 0, 0, 1);
    if (v.muted !== undefined) this.vols.muted = !!v.muted;
    if (this.space) this.space.setVolumes(this.vols);
  }

  setMuted(on) {
    this.setVolumes({ muted: !!on });
  }

  // a menu is open (true) or closed: the score dips under it
  duck(on) {
    this.vols.menu = !!on;
    if (this.space) this.space.setMenu(!!on);
  }

  setListener(x, y) {
    this.listener.x = +x || 0;
    this.listener.y = +y || 0;
  }

  // ---- one-shots -------------------------------------------------------------------------------

  // play(name, { x, y } world metres | { pan }, gain 0..2, rate 0.5..2)
  play(name, o = {}) {
    if (!this.ready) return;
    const def = ALL_SFX[name];
    if (!def) {
      if (!this._warned.has(name)) {
        this._warned.add(name);
        if (typeof console !== 'undefined') console.warn(`moonbound audio: unknown sound "${name}"`);
      }
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const st = this._st[name] || (this._st[name] = { last: -10, n: 0 });
    if (def.gap && now - st.last < def.gap) return;
    let pan = clamp(+o.pan || 0, -1, 1);
    let att = 1;
    let wet = def.rev ?? 0;
    if (o.x !== undefined) {
      const s = spatial(o.x - this.listener.x, (o.y ?? this.listener.y) - this.listener.y);
      pan = s.pan;
      att = s.att;
      wet *= s.wet;
      if (att < 0.03) return;
    }
    // voices: a cap per sound (the oldest of its kind goes), and a cap on all of them
    if (st.n >= (def.max ?? 4)) {
      const v = this.voices.find((x) => x.name === name);
      if (v) this._steal(v, now);
    }
    while (this.voices.length >= MAX_VOICES) {
      const v = this.voices.find((x) => x.pri <= (def.pri ?? 2));
      if (!v) return;
      this._steal(v, now);
    }
    st.last = now;
    let rate = clamp(+o.rate || 1, 0.5, 2) * (1 + (Math.random() * 2 - 1) * (def.jit ?? 0.04));
    if (def.key !== undefined && this.musicKey !== null) rate *= Math.pow(2, ((((this.musicKey - def.key) % 12) + 18) % 12 - 6) / 12);
    const gain = clamp(o.gain ?? 1, 0, 2) * att * (0.92 + Math.random() * 0.16);
    const asset = this.bank.pick(name);
    let v;
    if (asset) {
      const vo = makeVoice(ctx, this.space, asset, { gain, rate, pan, wet, at: now });
      v = { name, pri: def.pri ?? 2, ...vo };
      vo.src.onended = () => this._ended(v);
    } else {
      // not built yet: make it now from the recipe, and have it built next
      this.bank.want('sfx', name);
      v = this._live(name, def, gain, rate, pan, wet, now);
      if (!v) return;
    }
    this.voices.push(v);
    st.n++;
    if (def.duck) this.space.duck(def.duck[0], def.duck[1]);
  }

  // the same recipe, run on the live context at about the level the baked one would have
  _live(name, def, gain, rate, pan, wet, now) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain * 0.45; // the baked sounds are scaled by 0.1 to 1.5 (median 0.48) from the raw recipe
    let tail = g;
    if (pan && ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      g.connect(pn);
      tail = pn;
    }
    tail.connect(this.space.sfxBus);
    let send = null;
    if (wet > 0.01) {
      send = ctx.createGain();
      send.gain.value = Math.min(1, wet);
      tail.connect(send);
      send.connect(this.space.sfxSend);
    }
    const k = this.kit;
    k.rnd = seeded(((Math.random() * 1e9) | 0) + hashStr(name));
    try {
      def.fn(bind(k, g, now + 0.002), k.rnd, 0);
    } catch {
      return null;
    }
    const v = { name, pri: def.pri ?? 2, src: null, g, tail, send, live: true, end: now + def.dur + 0.1 };
    return v;
  }

  _steal(v, now) {
    if (v.over) return;
    v.over = true;
    this._drop(v);
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setTargetAtTime(0, now, 0.004);
    if (v.src) {
      try {
        v.src.stop(now + 0.03);
      } catch {
        /* over already */
      }
    }
  }

  _drop(v) {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    const st = this._st[v.name];
    if (st && st.n > 0) st.n--;
  }

  _ended(v) {
    if (v.over) return;
    v.over = true;
    this._drop(v);
    try {
      v.g.disconnect();
      v.tail.disconnect();
      if (v.send) v.send.disconnect();
    } catch {
      /* already gone */
    }
  }

  // ---- loops -----------------------------------------------------------------------------------

  // loop(id, name, on, { x, y, gain, rate, pan }): start, update or stop a looping sound under an id
  loop(id, name, on, o = {}) {
    if (!on) {
      const L = this._loops.get(id);
      if (L) {
        this._loops.delete(id);
        this._stopLive(L);
      }
      return;
    }
    if (!LOOPS[name]) {
      if (!this._warned.has(name)) {
        this._warned.add(name);
        if (typeof console !== 'undefined') console.warn(`moonbound audio: unknown loop "${name}"`);
      }
      return;
    }
    const cur = this._loops.get(id);
    if (cur && cur.name === name) {
      cur.o = o;
      this._updateLoop(cur, true);
      return;
    }
    if (cur) this._stopLive(cur);
    this._loops.set(id, { name, o, live: null });
    this._syncLoops();
  }

  // start the loops whose sound is built and whose context is running
  _syncLoops() {
    if (!this.ready) return;
    for (const [id, L] of this._loops) {
      if (L.live) continue;
      const a = this.bank.loop(L.name);
      if (!a) {
        this.bank.want('loop', L.name);
        continue;
      }
      this._startLoop(id, L, a);
    }
  }

  _startLoop(id, L, a) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = a.buf(ctx);
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    src.connect(g);
    let tail = g;
    let pn = null;
    if (a.ch.length === 1 && ctx.createStereoPanner) {
      pn = ctx.createStereoPanner();
      g.connect(pn);
      tail = pn;
    }
    tail.connect(this.space.sfxBus);
    const send = ctx.createGain();
    send.gain.value = LOOPS[L.name].rev ?? 0.2;
    tail.connect(send);
    send.connect(this.space.sfxSend);
    L.live = { src, g, pn, send, gain: -1, pan: 9, wet: -1 };
    L.baseRev = LOOPS[L.name].rev ?? 0.2;
    src.start(ctx.currentTime, Math.random() * a.dur);
    this._updateLoop(L, true);
  }

  // follow the position (pan, distance), gain and rate of a running loop
  _updateLoop(L, force) {
    const live = L.live;
    if (!live || !this.ctx) return;
    const now = this.ctx.currentTime;
    const o = L.o || {};
    let pan = clamp(+o.pan || 0, -1, 1);
    let att = 1;
    let wet = L.baseRev;
    if (o.x !== undefined) {
      const s = spatial(o.x - this.listener.x, (o.y ?? this.listener.y) - this.listener.y);
      pan = s.pan;
      att = s.att;
      wet *= s.wet;
    }
    const gain = clamp(o.gain ?? 1, 0, 2) * att;
    if (force || Math.abs(gain - live.gain) > 0.004) {
      live.g.gain.setTargetAtTime(gain, now, force ? 0.1 : 0.07);
      live.gain = gain;
    }
    if (live.pn && (force || Math.abs(pan - live.pan) > 0.01)) {
      live.pn.pan.setTargetAtTime(pan, now, 0.07);
      live.pan = pan;
    }
    if (force || Math.abs(wet - live.wet) > 0.01) {
      live.send.gain.setTargetAtTime(Math.min(1, wet), now, 0.1);
      live.wet = wet;
    }
    if (o.rate !== undefined && live.rate !== o.rate) {
      live.src.playbackRate.setTargetAtTime(clamp(o.rate, 0.25, 4), now, 0.05);
      live.rate = o.rate;
    }
  }

  // fade a running loop out and let it go
  _stopLive(L) {
    const live = L.live;
    L.live = null;
    if (!live || !this.ctx) return;
    const now = this.ctx.currentTime;
    live.g.gain.cancelScheduledValues(now);
    live.g.gain.setTargetAtTime(0, now, 0.07);
    try {
      live.src.stop(now + 0.6);
    } catch {
      /* not started */
    }
    live.src.onended = () => {
      try {
        live.g.disconnect();
        if (live.pn) live.pn.disconnect();
        live.send.disconnect();
      } catch {
        /* gone */
      }
    };
  }

  // ---- music -----------------------------------------------------------------------------------

  // crossfade to a theme ('title', 'hollow', 'gloamwall', 'gaoler', 'seraph', 'victory', 'death') or null
  music(theme, o) {
    const name = theme || null;
    this.want.theme = name;
    this.want.themeOpts = o;
    if (!this.ready) return;
    if ((this.score ? this.score.name : null) === name) return;
    this._startTheme(name, o);
  }

  _startTheme(name, o = {}) {
    const ctx = this.ctx;
    if (name && !THEMES[name]) {
      if (!this._warned.has(name)) {
        this._warned.add(name);
        if (typeof console !== 'undefined') console.warn(`moonbound audio: unknown theme "${name}"`);
      }
      name = null;
    }
    const def = name ? THEMES[name] : null;
    const fade = o.fade ?? def?.fade ?? 2;
    if (this.score) {
      this.score.stop(o.fadeOut ?? (def ? fade : 1.6));
      this.fading.push(this.score);
      this.score = null;
    }
    this.musicKey = null;
    if (!def) return;
    const s = new Score({ ctx, k: this.kit, bank: this.bank, space: this.space }, name, def, { fade: fade * 0.8 });
    s.setState(this.I, this.ph);
    s.start(ctx.currentTime + 0.06);
    this.score = s;
    this.musicKey = def.key ?? 2;
    this._prepStingers(this.musicKey);
  }

  // intensity 0..1: the combat layer follows it (rise about a second, fall about four)
  intensity(v) {
    this.want.intensity = clamp(+v || 0, 0, 1);
  }

  // boss phase 1..3
  phase(n) {
    this.ph = clamp(Math.round(+n || 1), 1, 3);
    this.want.phase = this.ph;
    if (this.score) this.score.setState(this.I, this.ph);
  }

  // the tonic of the music as a MIDI note in 57..68 (D when no theme plays)
  _root() {
    const pc = this.musicKey ?? 2;
    return 57 + ((((pc - 57) % 12) + 12) % 12);
  }

  // have the choir pads of the stingers built for a key
  _prepStingers(keyPc) {
    const R = 57 + ((((keyPc - 57) % 12) + 12) % 12);
    for (const def of Object.values(STINGERS)) for (const [v, m] of def.needs(R)) this.bank.request('choir', `${v}:${m}`, 1.5);
  }

  // stinger(name): 'run_start', 'room_clear', 'reward', 'blessing', 'boss_intro', 'boss_phase', 'boss_defeat', 'death', 'ending'
  stinger(name) {
    if (!this.ready) return;
    const def = STINGERS[name];
    if (!def) {
      if (!this._warned.has(name)) {
        this._warned.add(name);
        if (typeof console !== 'undefined') console.warn(`moonbound audio: unknown stinger "${name}"`);
      }
      return;
    }
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.connect(this.space.stingBus);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    out.connect(send);
    send.connect(this.space.stingSend);
    const E = { ctx, k: this.kit, bank: this.bank, out, t0: ctx.currentTime + 0.03 };
    def.fn(E, this._root());
    if (def.duck) this.space.duck(def.duck[0], def.duck[1]);
    // the graph is let go once the longest tail is over
    setTimeout(() => {
      try {
        out.disconnect();
        send.disconnect();
      } catch {
        /* gone */
      }
    }, 16000);
  }

  // ---- per frame and per tick ------------------------------------------------------------------------

  // every frame: cheap
  update(dt) {
    if (!this.ctx) return;
    this._lastUpdate = performance.now();
    this._advance(clamp(+dt || 0, 0, 0.25));
  }

  // smooth the intensity, refresh the layer levels and follow the positional loops
  _advance(dt) {
    const tgt = this.want.intensity;
    const tau = tgt > this.I ? 0.4 : 1.8; // 90 % in about 0.9 s up, 4.1 s down
    this.I += (tgt - this.I) * (1 - Math.exp(-dt / tau));
    if (Math.abs(tgt - this.I) < 0.002) this.I = tgt;
    if (!this.ready) return;
    const now = performance.now();
    if (this.score) this.score.setState(this.I, this.ph);
    if (now - this._lvAt > 50) {
      this._lvAt = now;
      if (this.score) this.score.levels();
    }
    for (const L of this._loops.values()) if (L.live && L.o && (L.o.x !== undefined)) this._updateLoop(L, false);
  }

  // the timer: write the score ahead, retire what has faded, start loops that have been built
  _tick() {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    const t = performance.now();
    // if the game is not calling update() (hidden canvas, a menu), keep the intensity moving
    if (t - this._lastUpdate > 150) this._advance(Math.min(0.25, (t - (this._lastTick || t)) / 1000));
    this._lastTick = t;
    if (this.score) this.score.tick(ctx.currentTime);
    if (this.fading.length) this.fading = this.fading.filter((s) => !s.maybeDispose());
    if (t - this._loopAt > 200) {
      this._loopAt = t;
      this._syncLoops();
      // retire live-built voices that have finished
      const now = ctx.currentTime;
      for (const v of this.voices.slice()) if (v.live && now > v.end) this._ended(v);
    }
  }
}

// ---- the headless check ---------------------------------------------------------------------------------

// Render a sound ('step', 'hit_bone', ...), a loop ('wind'), a stinger ('stinger:reward') or a theme
// ('music:gloamwall') through an OfflineAudioContext, with the master chain, at unity volumes, and
// measure it: { peak, rms, nan, seconds, sampleRate }. opts: { intensity, phase, sr, seed } for music.
export async function renderTest(name, seconds = 2, opts = {}) {
  const OAC = getOAC();
  if (!OAC) throw new Error('no OfflineAudioContext here');
  const sr = opts.sr ?? 44100;
  const secs = Math.max(0.2, +seconds || 2);
  const isMusic = name.startsWith('music:');
  const isSting = name.startsWith('stinger:');
  const ctx = new OAC(2, Math.ceil((secs + (isMusic ? 0 : 0.15)) * sr), sr);
  const space = new Space(ctx, { master: 1, music: 1, sfx: 1 });
  const kit = new Kit(ctx, opts.seed ?? 3);
  const bank = new Bank({ sr });
  let known = true;
  if (isMusic) {
    const theme = name.slice(6);
    const def = THEMES[theme];
    if (!def) known = false;
    else {
      bank.queueAll();
      bank.jobs = bank.jobs.filter((j) => j.kind === 'drum');
      const score = new Score({ ctx, k: kit, bank, space }, theme, def, { seed: opts.seed ?? 3, fade: 0.2 });
      score.setState(opts.intensity ?? 0.5, opts.phase ?? 1);
      score.preload();
      await bank.idle();
      score.start(0);
      // the live timer's job, done ahead of time: walk the clock in 50 ms steps
      for (let t = 0; t < secs; t += 0.05) score.tick(t, t + LOOK);
    }
  } else if (isSting) {
    const key = name.slice(8);
    const def = STINGERS[key];
    if (!def) known = false;
    else {
      const R = 62;
      for (const [v, m] of def.needs(R)) bank.request('choir', `${v}:${m}`, 1);
      for (const d of ['boom', 'crash', 'don', 'don_m', 'don_s', 'riser']) bank.request('drum', d, 1);
      await bank.idle();
      const out = ctx.createGain();
      out.connect(space.stingBus);
      const send = ctx.createGain();
      send.gain.value = 0.5;
      out.connect(send);
      send.connect(space.stingSend);
      def.fn({ ctx, k: kit, bank, out, t0: 0.02 }, R);
    }
  } else if (ALL_SFX[name]) {
    const def = ALL_SFX[name];
    const [asset] = await renderOneShot(name, def, sr);
    makeVoice(ctx, space, asset, { gain: 1, rate: 1, pan: 0, wet: def.rev ?? 0, at: 0.02 });
  } else if (LOOPS[name]) {
    const asset = await renderLoop(name, LOOPS[name], sr);
    const src = ctx.createBufferSource();
    src.buffer = asset.buf(ctx);
    src.loop = true;
    src.connect(space.sfxBus);
    src.start(0);
  } else known = false;
  if (!known) return { peak: 0, rms: 0, nan: false, error: `unknown sound "${name}"`, seconds: 0, sampleRate: sr };
  const buf = await ctx.startRendering();
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const st = statsOf(ch);
  // the loudest second (RMS, dBFS): how loud it is when it is loud
  let loud = -120;
  const w = sr;
  for (let a = 0; a < ch[0].length; a += w >> 1) {
    let e = 0;
    const b = Math.min(ch[0].length, a + w);
    for (let i = a; i < b; i++) e += ch[0][i] * ch[0][i] + ch[1][i] * ch[1][i];
    loud = Math.max(loud, 10 * Math.log10(e / (2 * Math.max(1, b - a)) + 1e-12));
  }
  const res = { peak: st.peak, rms: st.rms, nan: st.nan, loud, seconds: buf.duration, sampleRate: sr };
  if (opts.channels) res.channels = ch;
  return res;
}
