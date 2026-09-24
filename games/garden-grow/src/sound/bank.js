// Rendered sounds, kept once made. One-shots have several seeded variations
// so repeats never sound identical; loops have one. Right after the audio
// unlocks they are rendered in the background by a worker (sound/worker.js)
// so the game never stutters; anything asked for before it is ready is
// rendered on the spot instead.
import { toBuffer } from './synth.js';
import * as N from './nature.js';

const SOUNDS = {
  pat: { render: N.soilPat, variants: 4 },
  crack: { render: N.soilCrack, variants: 4 },
  carrot: { render: N.carrotPop, variants: 3 },
  drip: { render: N.drip, variants: 6 },
  rustle: { render: (sr, s) => N.leafRustle(sr, s, 0.42), variants: 4 },
  petals: { render: (sr, s) => N.leafRustle(sr, s, 0.3, 140), variants: 3 },
  snip: { render: N.stemSnap, variants: 3 },
  vase: { render: N.vaseClink, variants: 3 },
  basket: { render: N.wickerThump, variants: 3 },
  page: { render: N.pageTurn, variants: 3 },
  tap: { render: N.woodTap, variants: 3 },
  sprout: { render: N.sproutPop, variants: 3 },
  whoosh: { render: (sr, s) => N.whoosh(sr, s, { f0: 450, f1: 2800, dur: 0.5, peak: 0.35 }), variants: 2 },
  swishUp: { render: (sr, s) => N.whoosh(sr, s, { f0: 700, f1: 2200, dur: 0.22, peak: 0.5, q: 0.9 }), variants: 2 },
  swishDown: { render: (sr, s) => N.whoosh(sr, s, { f0: 2000, f1: 650, dur: 0.22, peak: 0.4, q: 0.9 }), variants: 2 },
  // the textures are low-passed well below 12 kHz, so half rate is plenty
  pour: { render: (sr, s) => N.pourLoop(Math.round(sr / 2), s), variants: 1 },
  rain: { render: (sr, s) => N.rainLoop(Math.round(sr / 2), s), variants: 1 },
  bees: { render: (sr, s) => N.beeLoop(Math.round(sr / 2), s), variants: 1 },
  cricketA: { render: (sr, s) => N.cricketLoop(sr, s, { fc: 3050, rate: 1.55, pulses: 4 }), variants: 1 },
  cricketB: { render: (sr, s) => N.cricketLoop(sr, s, { fc: 3450, rate: 1.2, pulses: 3, pulse: 0.018, gap: 0.014 }), variants: 1 },
  cricketC: { render: (sr, s) => N.cricketLoop(sr, s, { fc: 2750, rate: 2.05, pulses: 5, pulse: 0.011, gap: 0.009, count: 16 }), variants: 1 },
  flutter: { render: (sr, s) => N.flutterLoop(8000, s), variants: 1 },
};

// Render one variation: { sr, ch: [Float32Array...] }. Pure, so the worker
// can call it too.
export function renderSound(name, variant, sampleRate) {
  return SOUNDS[name].render(sampleRate, 1000 + variant * 7919 + name.length * 31);
}

export class Bank {
  constructor(ctx, background = false) {
    this.ctx = ctx;
    this.store = new Map();
    this.last = new Map();
    this.pending = new Set();
    this.worker = null;
    if (background && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => this.receive(e.data);
        // no module workers here: everything is simply rendered on demand
        this.worker.onerror = () => {
          this.worker = null;
          this.pending.clear();
        };
      } catch {
        this.worker = null;
      }
    }
  }

  buffer(name, variant = 0) {
    const key = name + '#' + variant;
    let b = this.store.get(key);
    if (!b) {
      b = toBuffer(this.ctx, renderSound(name, variant, this.ctx.sampleRate));
      this.store.set(key, b);
    }
    return b;
  }

  // A variation of `name`, never the same one twice running.
  get(name) {
    const count = SOUNDS[name].variants;
    let v = Math.floor(Math.random() * count);
    if (count > 1 && v === this.last.get(name)) v = (v + 1) % count;
    this.last.set(name, v);
    return this.buffer(name, v);
  }

  variants(name) {
    return SOUNDS[name].variants;
  }

  // Have every variation of these rendered in the background. False if
  // there is no worker to do it.
  prefetch(names) {
    if (!this.worker) return false;
    for (const name of names) {
      for (let v = 0; v < SOUNDS[name].variants; v++) {
        const key = name + '#' + v;
        if (this.store.has(key) || this.pending.has(key)) continue;
        this.pending.add(key);
        this.worker.postMessage({ key, name, variant: v, sampleRate: this.ctx.sampleRate });
      }
    }
    return true;
  }

  receive({ key, sr, ch }) {
    this.pending.delete(key);
    if (!this.store.has(key)) this.store.set(key, toBuffer(this.ctx, { sr, ch }));
  }
}
