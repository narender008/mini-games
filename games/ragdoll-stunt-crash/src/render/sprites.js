// The sprite cache. Every painter in src/art/ draws in metres; here each one
// is rasterised once into an offscreen canvas at the cache's resolution
// (pixels per metre, from the screen size and the quality tier), with the
// metre box it covers, so drawing a sprite is one drawImage in the object's
// own frame. Sprites that can get blood on them (props, body parts) are
// cloned on the first stamp of a run (see decals.js); `char` versions are a
// sprite's silhouette filled near-black, laid over burnt parts.
import { PARTS, RIDES, PROPS } from '../sim/defs.js';
import { paintPart, paintHelmet, paintStump, paintBone, paintTooth, paintRide, paintWheel, paintBarrel, paintLauncherBase, paintPouch, ACTOR_BOUNDS } from '../art/actors.js';
import { PROP_PAINTERS, paintSplat, paintSmear, paintShard, paintDebris, paintScorch } from '../art/props.js';
import { FACES } from '../game/run.js';

const FACE_NAMES = FACES;
const PAD = 0.4;
// how far a prop's art may reach beyond its box (x pad, top pad, bottom pad)
const PROP_PAD = {
  pole: [2.2, 1.4, 0.4],
  billboard: [0.6, 0.6, 3.6],
  watertower: [0.6, 0.6, 2.6],
  hoop: [0.8, 0.8, 0.8],
  trampoline: [0.4, 0.4, 0.4],
  ramp: [0.4, 0.5, 0.4],
};
const WHEEL_STYLE = { hatchback: 'hatchback', muscle: 'muscle', pickup: 'pickup', rocket: 'rocket', cart: 'cart', bike: 'bike', tub: 'tub', sled: 'cart' };

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export class Sprites {
  constructor(ppm) {
    this.ppm = ppm;
    this.cache = new Map();
  }

  // A sprite covering x0..x1, y0..y1 metres (canvas y, down), painted by paint(ctx).
  make(key, x0, y0, x1, y1, paint, ppm = this.ppm) {
    let s = this.cache.get(key);
    if (s) return s;
    const c = makeCanvas((x1 - x0) * ppm, (y1 - y0) * ppm);
    const ctx = c.getContext('2d');
    ctx.setTransform(c.width / (x1 - x0), 0, 0, c.height / (y1 - y0), -x0 * (c.width / (x1 - x0)), -y0 * (c.height / (y1 - y0)));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    try {
      paint(ctx);
    } catch (e) {
      console.warn('sprite failed', key, e);
    }
    s = { canvas: c, x0, y0, w: x1 - x0, h: y1 - y0, key, char: null };
    this.cache.set(key, s);
    return s;
  }

  // the sprite's silhouette in near-black (for charring), made on first use
  char(s) {
    if (s.char) return s.char;
    const c = makeCanvas(s.canvas.width, s.canvas.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(s.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#1a0d08';
    ctx.fillRect(0, 0, c.width, c.height);
    s.char = { canvas: c, x0: s.x0, y0: s.y0, w: s.w, h: s.h };
    return s.char;
  }

  // ------------------------------------------------------------- the man
  part(shape, side, face = 0, helmet = true) {
    const P = PARTS[shape];
    const key = shape === 'head' ? 'head|' + face + '|' + (helmet ? 1 : 0) : 'part|' + shape + '|' + side;
    if (P.r) return this.make(key, -0.32, -0.34, 0.32, 0.3, (c) => paintPart(c, shape, side, { face: FACE_NAMES[face], helmet }), this.ppm * 1.25);
    const hw = P.w / 2 + 0.22;
    const hh = P.h / 2 + P.w / 2 + 0.12;
    return this.make(key, -hw, -hh, hw + (shape === 'lleg' || shape === 'larm' ? 0.12 : 0), hh, (c) => paintPart(c, shape, side, {}), this.ppm * 1.25);
  }

  helmet() {
    return this.make('helmet', -0.3, -0.3, 0.3, 0.3, (c) => paintHelmet(c), this.ppm * 1.25);
  }

  stump() {
    return this.make('stump', -0.14, -0.16, 0.14, 0.1, (c) => paintStump(c, {}));
  }

  bone() {
    return this.make('bone', -0.14, -0.08, 0.14, 0.08, (c) => paintBone(c));
  }

  tooth() {
    return this.make('tooth', -0.04, -0.04, 0.04, 0.04, (c) => paintTooth(c), 400);
  }

  // ------------------------------------------------------------- rides
  ride(id, layer, crush = 0, glass = 'intact') {
    const d = RIDES[id];
    const c = Math.round(crush * 3) / 3;
    const key = 'ride|' + id + '|' + layer + '|' + c.toFixed(2) + '|' + glass;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [x, y] of d.profile) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, -y);
      y1 = Math.max(y1, -y);
    }
    const b = ACTOR_BOUNDS[id];
    if (b) {
      x0 = Math.min(x0, b[0]);
      y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2]);
      y1 = Math.max(y1, b[3]);
    }
    return this.make(key, x0 - PAD, y0 - PAD - 0.2, x1 + PAD, y1 + PAD, (ctx) => paintRide(ctx, id, { layer, crush: c, glass }));
  }

  wheel(id, r) {
    const style = WHEEL_STYLE[id] || 'hatchback';
    return this.make('wheel|' + style + '|' + r, -r - 0.06, -r - 0.06, r + 0.06, r + 0.06, (c) => paintWheel(c, r, style));
  }

  barrel(id) {
    const b = RIDES[id].barrel;
    return this.make('barrel|' + id, b.x0 - 0.4, -b.r0 - 0.5, b.x1 + 0.5, b.r0 + 0.5, (c) => paintBarrel(c, id));
  }

  base(id) {
    const d = RIDES[id];
    if (d.forks) return this.make('base|' + id, -1.8, -4.8, 1.8, 0.4, (c) => paintLauncherBase(c, id));
    const w = id === 'mega' ? 3.4 : 2.4;
    return this.make('base|' + id, -w, -1.4, w, d.ground + 0.4, (c) => paintLauncherBase(c, id));
  }

  pouch() {
    return this.make('pouch', -0.5, -0.35, 0.5, 0.35, (c) => paintPouch(c));
  }

  // ------------------------------------------------------------- props
  prop(P) {
    const key = 'prop|' + P.t + '|' + P.variant + '|' + P.w.toFixed(2) + '|' + P.h.toFixed(2) + '|' + (P.seed & 7);
    const pad = PROP_PAD[P.t] || [PAD, PAD, PAD];
    const painter = PROP_PAINTERS[P.t];
    const p = { w: P.w, h: P.h, variant: P.variant, seed: P.seed & 7 };
    return this.make(key, -P.w / 2 - pad[0], -P.h / 2 - pad[1], P.w / 2 + pad[0], P.h / 2 + pad[2], (c) => painter && painter(c, p));
  }

  // a far-lane copy of a prop: darker and hazier
  far(P, fog) {
    const s = this.prop(P);
    const key = s.key + '|far';
    let f = this.cache.get(key);
    if (f) return f;
    const c = makeCanvas(s.canvas.width, s.canvas.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(s.canvas, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, c.width, c.height);
    f = { canvas: c, x0: s.x0, y0: s.y0, w: s.w, h: s.h, key };
    this.cache.set(key, f);
    return f;
  }

  // ------------------------------------------------------------- effects
  splat(i) {
    return this.make('splat|' + i, -0.6, -0.6, 0.6, 0.6, (c) => paintSplat(c, i * 7919 + 13), 96);
  }

  smear(i) {
    return this.make('smear|' + i, -0.6, -0.25, 0.6, 0.25, (c) => paintSmear(c, i * 104729 + 7), 96);
  }

  scorch(i) {
    return this.make('scorch|' + i, -0.6, -0.6, 0.6, 0.6, (c) => paintScorch(c, i * 31 + 5), 64);
  }

  shard(i) {
    return this.make('shard|' + i, -0.1, -0.1, 0.1, 0.1, (c) => paintShard(c, i * 17 + 3), 240);
  }

  debris(mat, i) {
    return this.make('debris|' + mat + '|' + i, -0.14, -0.14, 0.14, 0.14, (c) => paintDebris(c, mat, i * 23 + 1), 200);
  }

  // soft round blobs for smoke, fire and dust, and a hard droplet for blood
  glow(name, inner, outer) {
    return this.make('glow|' + name, -0.5, -0.5, 0.5, 0.5, (c) => {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.5);
      g.addColorStop(0, inner);
      g.addColorStop(0.45, outer);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(-0.5, -0.5, 1, 1);
    }, 96);
  }

  drop(name, colour, rim) {
    return this.make('drop|' + name, -0.5, -0.5, 0.5, 0.5, (c) => {
      c.fillStyle = rim;
      c.beginPath();
      c.arc(0, 0, 0.48, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = colour;
      c.beginPath();
      c.arc(-0.04, -0.05, 0.38, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.arc(-0.16, -0.18, 0.11, 0, Math.PI * 2);
      c.fill();
    }, 64);
  }
}

export { PROPS };
