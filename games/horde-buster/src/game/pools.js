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

// kinds: 0 bolt, 1 pellet, 2 rocket (homes on tx, ty when home is set; rage
// shots blow up on every hit). `hits` remembers the last 4 creatures a
// piercing shot went through (slot * 4096 + generation), so it hits each once.
export class Bullets extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vx: F, vy: F, dmg: F, life: F, kb: F, size: F, accel: F, blast: F, pierce: I16, kind: U8, hitN: U8, rage: U8, home: U8, bounce: U8, tx: F, ty: F, r: F, g: F, b: F });
    this.hits = new Int32Array(cap * 4);
  }
  kill(i) {
    const last = this.n - 1;
    if (i !== last) this.hits.copyWithin(i * 4, last * 4, last * 4 + 4);
    super.kill(i);
  }
}

// enemy shots, by kind: radius, damage, colour (HDR), how hard it homes on the hero (radians a second), life
export const SHOT_KINDS = [
  { r: 12, dmg: 10, col: [0.5, 2.2, 0.3], life: 6 }, // 0 acid glob (spitters)
  { r: 15, dmg: 9, col: [2.6, 0.25, 0.1], life: 6, light: true }, // 1 boss fireball (the Ogre)
  { r: 16, dmg: 10, col: [2.1, 1.45, 0.32], life: 7, light: true }, // 2 golden orb (the Summoner)
  { r: 14, dmg: 9, col: [0.9, 2.4, 0.7], life: 4.5, home: 1.7, light: true }, // 3 homing skull (the Summoner)
  { r: 13, dmg: 9, col: [0.7, 2.2, 0.15], life: 6 }, // 4 bile glob (the Abomination)
];

export class Shots extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vx: F, vy: F, r: F, dmg: F, life: F, kind: U8 });
  }
}

// ground hazards that hurt the hero while he stands in them (acid, fire, molten gold)
export const HAZARD_KINDS = {
  acid: { id: 0, dps: 14, col: [0.35, 1.5, 0.1], paint: [0.1, 0.42, 0.04] },
  fire: { id: 1, dps: 16, col: [2.4, 0.9, 0.2], paint: [0.06, 0.03, 0.02] },
  gold: { id: 2, dps: 14, col: [2.4, 1.6, 0.35], paint: [0.42, 0.3, 0.06] },
};
export const HAZARD_LIST = Object.values(HAZARD_KINDS);
export class Hazards extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, r: F, life: F, max: F, kind: U8 });
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

// power-ups floating down in bubbles, weapon crates (w = the gun inside, as
// an index into CRATE_GUNS) and power-surge orbs. kinds below
export const PICKUPS = ['magnet', 'freeze', 'shield', 'bomb', 'heart', 'lightning', 'chest', 'crate', 'overdrive', 'triple', 'rage'];
export const CRATE = 7;
export const SURGES = ['overdrive', 'triple', 'rage'];
export const CRATE_GUNS = ['blaster', 'scatter', 'rocket', 'flamer', 'tesla', 'saw'];
// each pickup's colour: its bubble, the burst on the hero when grabbed
export const PICKUP_COL = {
  magnet: [1.6, 0.35, 0.3],
  freeze: [0.5, 1.1, 2.0],
  shield: [0.4, 0.9, 2.0],
  bomb: [1.8, 0.5, 0.2],
  heart: [1.9, 0.3, 0.45],
  lightning: [1.9, 1.5, 0.3],
  chest: [2.0, 1.5, 0.4],
  crate: [0.5, 1.6, 1.4],
  overdrive: [2.0, 1.0, 0.2],
  triple: [0.3, 1.5, 2.0],
  rage: [2.2, 0.25, 0.15],
};
export class Pickups extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vx: F, vy: F, t: F, kind: U8, w: U8, seed: F });
  }
}

// explosive barrels. fuse > 0 counts down to a chained blast; vy rolls them in
export class Barrels extends Pool {
  constructor(cap) {
    super(cap, { x: F, y: F, px: F, py: F, vy: F, ty: F, hp: F, fuse: F, flash: F, rot: F });
  }
}
