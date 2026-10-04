// The battlefield bed. Each kind is a wind loop (scaled by setWind), sometimes a
// second bed (rain, crickets), and now and then something in the distance:
//   farm    dawn wind, distant crows, far-off artillery
//   desert  dry hot wind, rare far guns
//   snow    cold howling wind, rare far guns
//   city    rain on rubble, distant sirens, far gunfire and artillery
//   night   night wind, crickets, distant thunder
// Switching crossfades over a couple of seconds. Loops and events come from the
// Sound's library (built in the background); if they are not ready yet the bed
// starts as soon as they are.
import { clamp } from './dsp.js';
import { makePan } from './voices.js';

// wind: loop key, its level; bed: second loop and level; events: [key, min s, max s, level]
export const KINDS = {
  farm: { wind: 'loop.windFarm', wl: 1.0, events: [['ev.crow', 7, 18, 0.5], ['ev.farGun', 11, 26, 0.8]] },
  desert: { wind: 'loop.windDesert', wl: 0.9, events: [['ev.farGun', 25, 50, 0.7]] },
  snow: { wind: 'loop.windSnow', wl: 1.0, events: [['ev.farGun', 20, 40, 0.6]] },
  city: { wind: 'loop.windCity', wl: 0.55, bed: 'loop.rain', bl: 0.9, events: [['ev.farBurst', 7, 18, 0.8], ['ev.siren', 28, 60, 0.7], ['ev.farGun', 10, 24, 0.8]] },
  night: { wind: 'loop.windNight', wl: 0.8, bed: 'loop.crickets', bl: 0.8, events: [['ev.thunder', 14, 32, 1.0], ['ev.farGun', 22, 44, 0.6]] },
};

const rnd = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(s) {
    this.s = s;
    this.kind = null; // what was asked for
    this.cur = null; // the running bed
    this.old = [];
    this.wind = 0;
  }

  // the library keys a kind needs
  static needs(kind) {
    const k = KINDS[kind];
    if (!k) return [];
    return [k.wind, ...(k.bed ? [k.bed] : []), ...k.events.map((e) => e[0])];
  }

  set(kind) {
    if (!KINDS[kind]) kind = null;
    if (kind === this.kind) return;
    this.kind = kind;
    this.start();
  }

  setWind(w) {
    this.wind = clamp(Number(w) || 0, -1, 1);
    if (this.cur) this.applyWind(this.cur, 0.6);
  }

  applyWind(b, tc) {
    const t = this.s.ctx.currentTime;
    const a = Math.abs(this.wind);
    b.wg.gain.setTargetAtTime(b.spec.wl * (0.3 + 0.7 * a) * b.wentry.gain, t, tc);
    b.wlp.frequency.setTargetAtTime(1400 + 5200 * a, t, tc);
  }

  // build the bed for this.kind if its loops are ready; fade out the old one
  start() {
    const s = this.s;
    if (!s.ctx) return;
    const t = s.ctx.currentTime;
    if (this.cur && (!this.kind || this.cur.kind !== this.kind)) {
      this.cur.gain.gain.cancelScheduledValues(t);
      this.cur.gain.gain.setTargetAtTime(0, t, 1.0);
      this.old.push({ b: this.cur, at: t + 7 });
      this.cur = null;
    }
    if (!this.kind || this.cur) return;
    const spec = KINDS[this.kind];
    const we = s._entry(spec.wind);
    const be = spec.bed ? s._entry(spec.bed) : null;
    if (!we || (spec.bed && !be)) return; // retried by tick()
    const ctx = s.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(s.ambBus);
    const nodes = [gain];
    const srcs = [];
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = we.hi;
    wsrc.loop = true;
    wsrc.start(0, Math.random() * we.hi.duration * 0.9);
    const wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.Q.value = 0.5;
    wlp.frequency.value = 3000;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wsrc.connect(wlp).connect(wg).connect(gain);
    nodes.push(wlp, wg);
    srcs.push(wsrc);
    if (be) {
      const bsrc = ctx.createBufferSource();
      bsrc.buffer = be.hi;
      bsrc.loop = true;
      bsrc.start(0, Math.random() * be.hi.duration * 0.9);
      const bg = ctx.createGain();
      bg.gain.value = spec.bl * be.gain;
      bsrc.connect(bg).connect(gain);
      nodes.push(bg);
      srcs.push(bsrc);
    }
    const b = { kind: this.kind, spec, gain, wg, wlp, wentry: we, nodes, srcs, next: spec.events.map((e) => t + rnd(e[1] * 0.35, e[2] * 0.6)) };
    this.cur = b;
    this.applyWind(b, 0.01);
    gain.gain.setTargetAtTime(1, t, 1.2);
  }

  // every 250 ms: retry a bed that was waiting for its loops, fire distant events, tidy up
  tick() {
    const s = this.s;
    if (!s.ctx) return;
    const now = s.ctx.currentTime;
    if (this.kind && !this.cur) this.start();
    for (let i = this.old.length - 1; i >= 0; i--) {
      if (now >= this.old[i].at) {
        this.dispose(this.old[i].b);
        this.old.splice(i, 1);
      }
    }
    const b = this.cur;
    if (!b || s._muted || s.ctx.state !== 'running') return;
    for (let k = 0; k < b.spec.events.length; k++) {
      if (now < b.next[k]) continue;
      const [key, lo, hi, lv] = b.spec.events[k];
      b.next[k] = now + rnd(lo, hi);
      const e = s._pick(key);
      if (!e) continue;
      const src = s.ctx.createBufferSource();
      src.buffer = e.hi;
      src.playbackRate.value = rnd(0.93, 1.06);
      const g = s.ctx.createGain();
      g.gain.value = lv * e.gain * rnd(0.8, 1.15);
      const p = makePan(s.ctx);
      p.pan.value = rnd(-0.85, 0.85);
      src.connect(g).connect(p).connect(b.gain);
      src.start(now + 0.02);
      src.onended = () => {
        g.disconnect();
        p.disconnect();
      };
    }
  }

  dispose(b) {
    for (const src of b.srcs) {
      try {
        src.stop();
      } catch {
        /* never started */
      }
    }
    for (const n of b.nodes) n.disconnect();
  }
}
