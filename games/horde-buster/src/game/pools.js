// Small pools of typed arrays for everything that is not a creature: the
// hero's bullets, enemy shots, thrown bombs, XP gems, pickups and barrels.
// Each pool keeps its live items packed at the front (swap-remove), so loops
// run over `n` items with no gaps and nothing is allocated while playing.

class Pool {
  constructor(cap, fields) {
    this.cap = cap;
    this.n = 0;
    this.fields = fields;
    this.arrays = [];
    for (const [name, T] of Object.entries(fields)) {
      this[name] = new T(cap);
      this.arrays.push(this[name]);
    }
  }
  reset() {
    this.n = 0;
  }
  // a new item's index, or -1 when full
  take() {
    return this.n < this.cap ? this.n++ : -1;
  }
  kill(i) {
    const last = --this.n;
    if (i !== last) {
      const A = this.arrays;
      for (let k = 0; k < A.length; k++) A[k][i] = A[k][last];
    }
  }
}

const F = Float32Array;
const U8 = Uint8Array;
const I16 = Int16Array;

// kinds: 0 bolt, 1 pellet, 2 rocket. `hits` remembers the last 4 creatures a
// piercing shot went through (slot * 4096 + generation), so it hits each once.
export class Bullets extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vx: F, vy: F, dmg: F, life: F, kb: F, size: F, accel: F, blast: F, pierce: I16, kind: U8, hitN: U8, r: F, g: F, b: F });
    this.hits = new Int32Array(cap * 4);
  }
  kill(i) {
    const last = this.n - 1;
    if (i !== last) this.hits.copyWithin(i * 4, last * 4, last * 4 + 4);
    super.kill(i);
  }
}

// enemy shots. kinds: 0 acid glob, 1 boss fireball
export class Shots extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vx: F, vy: F, r: F, dmg: F, life: F, kind: U8 });
  }
}

// thrown bombs in flight: kind 0 bomb, 1 freeze bomb
export class Bombs extends Pool {
  constructor(cap) {
    super(cap, { x0: F, y0: F, x1: F, y1: F, t: F, dur: F, kind: U8 });
  }
}

// XP crystals. state: 0 popping out, 1 drifting down, 2 flying to the hero
export class Gems extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vx: F, vy: F, value: F, t: F, state: U8, seed: F });
  }
}

// power-ups floating down in bubbles. kinds below
export const PICKUPS = ['magnet', 'freeze', 'shield', 'bomb', 'heart', 'lightning', 'chest'];
// each pickup's colour: its bubble, the burst on the hero when grabbed
export const PICKUP_COL = {
  magnet: [1.6, 0.35, 0.3],
  freeze: [0.5, 1.1, 2.0],
  shield: [0.4, 0.9, 2.0],
  bomb: [1.8, 0.5, 0.2],
  heart: [1.9, 0.3, 0.45],
  lightning: [1.9, 1.5, 0.3],
  chest: [2.0, 1.5, 0.4],
};
export class Pickups extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vy: F, t: F, kind: U8, seed: F });
  }
}

// explosive barrels. fuse > 0 counts down to a chained blast; vy rolls them in
export class Barrels extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vy: F, ty: F, hp: F, fuse: F, flash: F, rot: F });
  }
}
