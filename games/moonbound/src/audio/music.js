// Moonbound audio: the sequencer. A Score plays one theme (themes.js) on the live (or an offline)
// context. It works bar by bar: when a bar's start comes within LOOK seconds of the audio clock,
// the theme's bar() function is called and puts that bar's notes in a queue, each stamped with the
// time to play it; a timer (audio.js, every 40 ms) pops the notes that fall within LOOK of now and
// builds their small node graphs on the audio clock. Nothing is scheduled per frame, and a note
// that is still half a second away costs nothing until its time comes.
//
// Layers are what intensity (0..1, smoothed by audio.js: rise ~1 s, fall ~4 s) and the boss phase
// fade in and out: the pad, the bells, the drums, the ostinato. Each layer is a gain node whose
// target follows the layer's level function; a note of a layer whose level is 0 is not even built.
import { clamp, seeded } from './dsp.js';
import { echo, bell, musicBox, harp, pad, bowed, brass, sub, choirNote, drum } from './instruments.js';

export const LOOK = 0.45;

// the stage a theme's bar() writes on
class Stage {
  constructor(score) {
    this.score = score;
    this.k = score.k;
    this.ctx = score.ctx;
    this.bank = score.bank;
    this.out = score.out; // layer name -> GainNode
    this.rnd = score.rnd;
    this.t = 0; // start of the bar being written
    this.bar = 0; // bars since the theme started
    this.spb = 1; // seconds per beat
    this.I = 0; // smoothed intensity
    this.ph = 1; // boss phase
    this.mem = {}; // whatever a theme wants to remember between bars
  }

  // hand a bed (drone, wind: anything with stop(t)) to the score, which stops it when the theme ends
  bed(b) {
    this.score.beds.push(b);
    return b;
  }

  lv(name) {
    return this.score.lvl[name] ?? 0;
  }

  chance(p) {
    return this.rnd() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.rnd() * arr.length)];
  }

  // a little human timing: +-ms
  h(ms = 12) {
    return ((this.rnd() * 2 - 1) * ms) / 1000;
  }

  // position inside a cycle of `len` bars that starts after `intro` bars (-1 while in the intro)
  cyc(len, intro = 0) {
    return this.bar < intro ? -1 : (this.bar - intro) % len;
  }

  at(t, layer, fn) {
    this.score.queue.push({ t, layer, fn });
  }

  bell(layer, t, midi, vel, o) {
    this.at(t, layer, () => bell(this.k, this.out[layer], t, midi, vel, o));
  }

  box(layer, t, midi, vel, o) {
    this.at(t, layer, () => musicBox(this.k, this.out[layer], t, midi, vel, o));
  }

  harp(layer, t, midi, vel, o) {
    this.at(t, layer, () => harp(this.k, this.bank, this.out[layer], t, midi, vel, o));
  }

  pad(layer, t, midi, dur, o) {
    this.at(t, layer, () => pad(this.k, this.out[layer], t, midi, dur, o));
  }

  bowed(layer, t, midi, dur, o) {
    this.at(t, layer, () => bowed(this.k, this.out[layer], t, midi, dur, o));
  }

  brass(layer, t, midi, dur, o) {
    this.at(t, layer, () => brass(this.k, this.out[layer], t, midi, dur, o));
  }

  sub(layer, t, midi, dur, o) {
    this.at(t, layer, () => sub(this.k, this.out[layer], t, midi, dur, o));
  }

  choir(layer, t, vowel, midi, dur, o) {
    this.at(t, layer, () => choirNote(this.k, this.bank, this.out[layer], t, vowel, midi, dur, o));
  }

  drum(layer, t, name, vel, rate) {
    this.at(t, layer, () => drum(this.k, this.bank, this.out[layer], t, name, vel, rate));
  }
}

export class Score {
  // eng: { ctx, k, bank, space }; def: a theme from themes.js; opts: { seed, fade, dest, send }
  constructor(eng, name, def, opts = {}) {
    this.ctx = eng.ctx;
    this.k = eng.k;
    this.bank = eng.bank;
    this.space = eng.space;
    this.name = name;
    this.def = def;
    this.rnd = seeded(opts.seed ?? ((Math.random() * 1e9) | 0));
    this.queue = [];
    this.out = {};
    this.lvl = {};
    this.beds = [];
    this.stopped = false;
    this.disposed = false;
    const ctx = this.ctx;
    // the theme's own master, for fades: layers -> bus -> the score bus
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(opts.dest || this.space.musicIn);
    const send = opts.send || this.space.musicSend;
    this.sends = [];
    this._nodes = [];
    for (const [lname, L] of Object.entries(def.layers)) {
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(this.bus);
      this.out[lname] = out;
      this.lvl[lname] = 0;
      const sg = ctx.createGain();
      sg.gain.value = L.send ?? 0.2;
      out.connect(sg);
      sg.connect(send);
      this.sends.push(sg);
      if (L.echo) {
        const e = echo(ctx, out, this.bus, { time: L.echo.beats * (60 / this._bpm(1, 0)), fb: L.echo.fb ?? 0.35, lp: L.echo.lp ?? 3000, mix: L.echo.mix ?? 0.3 });
        e.wet.connect(sg);
        this._nodes.push(e.dl);
      }
    }
    this.S = new Stage(this);
    this.I = 0;
    this.ph = 1;
    this.barNo = 0;
    this.nextBar = 0;
    this.started = false;
    this.fadeIn = opts.fade ?? 1.5;
  }

  _bpm(ph, I) {
    const b = this.def.bpm;
    return typeof b === 'function' ? b(ph, I) : b;
  }

  // ask the bank for the choir pads and drums this theme plays (idempotent; start() does it too)
  preload() {
    for (const [v, m] of this.def.choirs || []) if (!this.bank.choirs.has(`${v}:${m}`)) this.bank.want('choir', `${v}:${m}`);
    for (const d of this.def.drums || []) if (!this.bank.drums.has(d)) this.bank.want('drum', d);
  }

  start(t0) {
    const ctx = this.ctx;
    const t = Math.max(t0, ctx.currentTime);
    this.bus.gain.setTargetAtTime(1, t, this.fadeIn / 3);
    this.nextBar = t + 0.05;
    this.started = true;
    this.preload();
    this._levels(t, true);
    if (this.def.setup) this.def.setup(this.S, t);
  }

  // layer levels from intensity and phase
  _levels(now, jump) {
    const def = this.def;
    for (const [lname, L] of Object.entries(def.layers)) {
      const lv = typeof L.lv === 'function' ? L.lv(this.I, this.ph, this.S) : (L.lv ?? 1);
      const target = (L.gain ?? 1) * clamp(lv, 0, 1.5);
      this.lvl[lname] = target;
      const p = this.out[lname].gain;
      if (jump) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(target, now);
      } else {
        p.setTargetAtTime(target, now, 0.16);
      }
    }
  }

  setState(I, ph) {
    this.I = I;
    this.S.I = I;
    if (ph !== this.ph) {
      this.ph = ph;
      this.S.ph = ph;
    }
  }

  // every ~50 ms: refresh the layer levels
  levels() {
    if (!this.started || this.disposed) return;
    this._levels(this.ctx.currentTime, false);
  }

  // schedule: write bars that start within LOOK, then play the notes that are due
  tick(now = this.ctx.currentTime, horizon = now + LOOK) {
    if (!this.started || this.stopped || this.disposed) return;
    const S = this.S;
    const def = this.def;
    let guard = 0;
    while (this.nextBar < horizon && guard++ < 8) {
      const bpm = this._bpm(this.ph, this.I);
      S.spb = 60 / bpm;
      S.t = this.nextBar;
      S.bar = this.barNo;
      S.I = this.I;
      S.ph = this.ph;
      def.bar(S);
      this.queue.sort((a, b) => a.t - b.t);
      this.nextBar += def.beats * S.spb;
      this.barNo++;
    }
    const q = this.queue;
    while (q.length && q[0].t < horizon) {
      const e = q.shift();
      if (e.t < now - 0.3) continue; // far too late (a stalled page): skip rather than pile up
      if ((this.lvl[e.layer] ?? 0) > 0.004) e.fn();
    }
  }

  // fade out over `fade` seconds; the nodes are let go a little after
  stop(fade = 2) {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, Math.max(0.02, fade / 4));
    this.disposeAt = t + fade * 1.6 + 0.3;
    this.queue.length = 0;
    for (const b of this.beds) b.stop(t + fade);
  }

  // true once the fade is over and the score may be forgotten
  maybeDispose() {
    if (this.disposed || !this.stopped || this.ctx.currentTime < this.disposeAt) return this.disposed;
    this.disposed = true;
    try {
      this.bus.disconnect();
      for (const s of this.sends) s.disconnect();
      for (const o of Object.values(this.out)) o.disconnect();
    } catch {
      /* already gone */
    }
    return true;
  }
}
