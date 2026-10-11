// Effects: GPU particle bursts, slashes and waves, glows, ground marks,
// transient lights, damage numbers, screen shake and flashes. Everything is
// pooled; emit() writes this frame's records into the renderer's lists.
// Effects run on their own clock, so a hit-stop freezes the fight but not
// the sparks flying off the blow.
import { fxRand, clamp, SIN_E, COS_E } from '../config.js';
import { GLYPHS } from '../gl/renderer.js';
import { FEEL } from '../game/feel.js';

export const BURST = { shatter: 0, wisps: 1, dust: 2, sparks: 3, embers: 4, motes: 5, smoke: 6 };
export const GROUND = { circle: 0, cone: 1, line: 2, ring: 3, rune: 4, shock: 5, pool: 6, sigil: 7, spawn: 8, mark: 9 };
export const GLOW = { glow: 0, orb: 1, bolt: 2, flame: 3, soulflame: 4, pillar: 5, blessing: 6, star: 7, arrow: 8 };

const BURST_LIFE = 2.6;

function pool(make) {
  return { items: [], n: 0, make };
}
function take(p) {
  let o = p.items[p.n];
  if (!o) o = p.items[p.n] = p.make();
  p.n++;
  return o;
}
// remove dead entries in place (keeps the pooled objects)
function sweep(p, alive) {
  let w = 0;
  for (let i = 0; i < p.n; i++) {
    const o = p.items[i];
    if (alive(o)) {
      p.items[i] = p.items[w];
      p.items[w] = o;
      w++;
    }
  }
  p.n = w;
}

export class FX {
  constructor() {
    this.time = 0;
    this.bursts = pool(() => ({ x: 0, y: 0, z: 0, t: 0, r: 0, g: 0, b: 0, a: 0, kind: 0, count: 0, seed: 0, scale: 1, dx: 0, dy: 0, dz: 0, spread: 0 }));
    this.arcs = pool(() => ({ x: 0, y: 0, z: 0, radius: 0, r: 0, g: 0, b: 0, a: 0, start: 0, sweep: 0, width: 0, t: 0, life: 0, kind: 0, seed: 0 }));
    this.glows = pool(() => ({ x: 0, y: 0, z: 0, size: 0, r: 0, g: 0, b: 0, a: 0, kind: 0, seed: 0, stretch: 0, rot: 0, p0: 0, t: 0, life: 0, fade: 1, grow: 0, vx: 0, vy: 0, vz: 0, under: false }));
    this.grounds = pool(() => ({ x: 0, y: 0, sx: 0, sy: 0, r: 0, g: 0, b: 0, a: 0, kind: 0, t: 0, life: 0, rot: 0, seed: 0, p0: 0, fade: 1, grow: 0 }));
    this.lights = pool(() => ({ x: 0, y: 0, z: 0, radius: 0, r: 0, g: 0, b: 0, t: 0, life: 0 }));
    this.texts = pool(() => ({ x: 0, y: 0, z: 0, vz: 0, value: '', r: 0, g: 0, b: 0, size: 0, t: 0, life: 0, vx: 0 }));
    this.trauma = 0;
    this.shakeScale = 1;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = [1, 1, 1, 0];
    this.flashDecay = 6;
    this.chroma = 0;
    this.maxBursts = 120; // burst records alive at once (each up to 24 particles); set from the quality tier
  }

  clear() {
    this.bursts.n = this.arcs.n = this.glows.n = this.grounds.n = this.lights.n = this.texts.n = 0;
    this.trauma = 0;
    this.flash[3] = 0;
    this.chroma = 0;
  }

  // ---- emitters
  burst(kind, x, y, z, col, count = 16, scale = 1, dir = null, spread = 0) {
    if (this.bursts.n >= this.maxBursts) return;
    const o = take(this.bursts);
    o.x = x;
    o.y = y;
    o.z = z;
    o.t = this.time;
    o.r = col[0];
    o.g = col[1];
    o.b = col[2];
    o.a = col[3] ?? 1;
    o.kind = kind;
    o.count = Math.min(24, count);
    o.seed = fxRand.next() * 1000;
    o.scale = scale;
    o.dx = dir ? dir[0] : 0;
    o.dy = dir ? dir[1] : 0;
    o.dz = dir ? dir[2] : 0;
    o.spread = spread;
  }

  // a slash: an arc of light around (x, y) at height z
  arc(x, y, z, radius, start, sweep, width, col, life = 0.18, kind = 0) {
    const o = take(this.arcs);
    o.x = x;
    o.y = y;
    o.z = z;
    o.radius = radius;
    o.start = start;
    o.sweep = sweep;
    o.width = width;
    o.r = col[0];
    o.g = col[1];
    o.b = col[2];
    o.a = col[3] ?? 1;
    o.t = 0;
    o.life = life;
    o.kind = kind;
    o.seed = fxRand.next() * 10;
    return o;
  }

  glow(kind, x, y, z, size, col, life = 0.3, opts = null) {
    const o = take(this.glows);
    o.kind = kind;
    o.x = x;
    o.y = y;
    o.z = z;
    o.size = size;
    o.r = col[0];
    o.g = col[1];
    o.b = col[2];
    o.a = col[3] ?? 1;
    o.t = 0;
    o.life = life;
    o.seed = fxRand.next() * 10;
    o.stretch = opts?.stretch || 0;
    o.rot = opts?.rot || 0;
    o.p0 = opts?.p0 || 0;
    o.fade = opts?.fade ?? 1;
    o.grow = opts?.grow || 0;
    o.vx = opts?.vx || 0;
    o.vy = opts?.vy || 0;
    o.vz = opts?.vz || 0;
    o.under = !!opts?.under;
    return o;
  }

  ground(kind, x, y, sx, sy, col, life = 0.4, opts = null) {
    const o = take(this.grounds);
    o.kind = kind;
    o.x = x;
    o.y = y;
    o.sx = sx;
    o.sy = sy ?? sx;
    o.r = col[0];
    o.g = col[1];
    o.b = col[2];
    o.a = col[3] ?? 1;
    o.t = 0;
    o.life = life;
    o.rot = opts?.rot || 0;
    o.seed = fxRand.next() * 10;
    o.p0 = opts?.p0 || 0;
    o.fade = opts?.fade ?? 1;
    o.grow = opts?.grow || 0;
    return o;
  }

  light(x, y, z, radius, col, life = 0.2) {
    const o = take(this.lights);
    o.x = x;
    o.y = y;
    o.z = z;
    o.radius = radius;
    o.r = col[0];
    o.g = col[1];
    o.b = col[2];
    o.t = 0;
    o.life = life;
  }

  // a damage number rising from (x, y, z)
  number(x, y, z, value, col, size = 0.5) {
    // numbers born together in one place stack up instead of printing over each other
    let lift = 0;
    const T = this.texts;
    for (let i = 0; i < T.n; i++) {
      const q = T.items[i];
      if (q.t < 0.2 && Math.abs(q.x - x) < 0.8 && Math.abs(q.y - y) < 0.8) lift += size * 0.85;
    }
    const o = take(T);
    o.x = x + (fxRand.next() - 0.5) * 0.4;
    o.y = y;
    o.z = z + Math.min(lift, 2.5);
    o.vz = 2.6;
    o.vx = (fxRand.next() - 0.5) * 0.8;
    o.value = String(value);
    o.r = col[0];
    o.g = col[1];
    o.b = col[2];
    o.size = size;
    o.t = 0;
    o.life = 0.8;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount * this.shakeScale);
  }

  flashScreen(col, amount, decay = 6) {
    if (amount < this.flash[3]) return;
    this.flash[0] = col[0];
    this.flash[1] = col[1];
    this.flash[2] = col[2];
    this.flash[3] = amount;
    this.flashDecay = decay;
  }

  // ---- composite effects
  shatterInto(x, y, h, col, big = 1) {
    // a creature shattering into light: shards, wisps, bone dust and a flash of light
    this.burst(BURST.shatter, x, y, h * 0.55, col, 24, big);
    this.burst(BURST.shatter, x, y, h * 0.35, [1.4, 1.6, 1.8, 1], 14, big * 0.8);
    this.burst(BURST.wisps, x, y, h * 0.3, col, 12, big);
    this.burst(BURST.dust, x, y, 0.1, [0.5, 0.48, 0.44, 0.8], 14, big);
    this.light(x, y, h * 0.5, 4 * big, [col[0] * 2.5, col[1] * 2.5, col[2] * 2.5], 0.45);
    this.ground(GROUND.shock, x, y, 1.4 * big, 1.4 * big, [col[0], col[1], col[2], 0.7], 0.45, { grow: 1 });
  }

  // ---- per frame
  update(dt) {
    this.time += dt;
    for (let i = 0; i < this.arcs.n; i++) this.arcs.items[i].t += dt;
    for (let i = 0; i < this.glows.n; i++) {
      const o = this.glows.items[i];
      o.t += dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.z += o.vz * dt;
    }
    for (let i = 0; i < this.grounds.n; i++) this.grounds.items[i].t += dt;
    for (let i = 0; i < this.lights.n; i++) this.lights.items[i].t += dt;
    for (let i = 0; i < this.texts.n; i++) {
      const o = this.texts.items[i];
      o.t += dt;
      o.z += o.vz * dt;
      o.x += o.vx * dt;
      o.vz = Math.max(0.3, o.vz - 7 * dt);
    }
    const now = this.time;
    sweep(this.bursts, (o) => now - o.t < BURST_LIFE);
    sweep(this.arcs, (o) => o.t < o.life);
    sweep(this.glows, (o) => o.t < o.life);
    sweep(this.grounds, (o) => o.t < o.life);
    sweep(this.lights, (o) => o.t < o.life);
    sweep(this.texts, (o) => o.t < o.life);
    // shake: trauma squared, smooth noise
    this.trauma = Math.max(0, this.trauma - FEEL.shake.decay * dt);
    const s = this.trauma * this.trauma * FEEL.shake.maxOffset;
    this.shakeX = s * (Math.sin(now * 47.3) * 0.6 + Math.sin(now * 91.7 + 1.3) * 0.4);
    this.shakeY = s * (Math.sin(now * 53.1 + 2.1) * 0.6 + Math.sin(now * 83.9 + 0.4) * 0.4);
    this.flash[3] = Math.max(0, this.flash[3] - this.flashDecay * dt * Math.max(this.flash[3], 0.25));
    this.chroma = Math.max(0, this.chroma - dt * 0.05);
  }

  // write this frame's records into the renderer's lists
  emit(s, lights) {
    for (let i = 0; i < this.bursts.n; i++) {
      const o = this.bursts.items[i];
      s.bursts.push16(o.x, o.y, o.z, o.t, o.r, o.g, o.b, o.a, o.kind, o.count, o.seed, o.scale, o.dx, o.dy, o.dz, o.spread);
    }
    for (let i = 0; i < this.arcs.n; i++) {
      const o = this.arcs.items[i];
      const k = clamp(o.t / o.life, 0, 1);
      s.arcs.push16(o.x, o.y, o.z, o.radius, o.r, o.g, o.b, o.a, o.start, o.sweep, o.width, k, o.kind, o.seed, Math.max(0, (k - 0.7) / 0.3), 0);
    }
    for (let i = 0; i < this.glows.n; i++) {
      const o = this.glows.items[i];
      const k = o.t / o.life;
      const a = o.a * (o.fade ? 1 - k * k : 1);
      const size = o.size * (1 + o.grow * k);
      (o.under ? s.glowsUnder : s.glows).push16(o.x, o.y, o.z, size, o.r, o.g, o.b, a, o.kind, o.seed, o.stretch, o.rot, o.p0, 0, 0, 0);
    }
    for (let i = 0; i < this.grounds.n; i++) {
      const o = this.grounds.items[i];
      const k = o.t / o.life;
      const kindProgress = o.kind === GROUND.shock || o.kind === GROUND.mark ? k : o.p0 || k;
      const a = o.a * (o.fade && o.kind !== GROUND.shock && o.kind !== GROUND.mark ? 1 - k * k : 1);
      const g = 1 + o.grow * k;
      s.ground.push16(o.x, o.y, o.sx * g, o.sy * g, o.r, o.g, o.b, a, o.kind, kindProgress, o.rot, o.seed, 0, 0, 0, 0);
    }
    for (let i = 0; i < this.lights.n; i++) {
      const o = this.lights.items[i];
      const k = 1 - o.t / o.life;
      lights.add(o.x, o.y, o.z, o.radius, o.r * k, o.g * k, o.b * k);
    }
    for (let i = 0; i < this.texts.n; i++) {
      const o = this.texts.items[i];
      const k = o.t / o.life;
      const pop = k < 0.12 ? 1 + (0.12 - k) * 5 : 1;
      const a = k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
      const size = o.size * pop;
      const n = o.value.length;
      const adv = size * 0.62;
      const sx = o.x - ((n - 1) * adv) / 2;
      const sy = o.y * SIN_E - o.z * COS_E;
      for (let c = 0; c < n; c++) {
        const gi = GLYPHS.indexOf(o.value[c]);
        if (gi < 0) continue;
        const k2 = s.text.alloc();
        const D = s.text.data;
        D[k2] = sx + c * adv;
        D[k2 + 1] = sy;
        D[k2 + 2] = size;
        D[k2 + 3] = 0;
        D[k2 + 4] = o.r;
        D[k2 + 5] = o.g;
        D[k2 + 6] = o.b;
        D[k2 + 7] = a;
        D[k2 + 8] = gi;
        D[k2 + 9] = 0;
        D[k2 + 10] = 0;
        D[k2 + 11] = 0.8;
      }
    }
  }
}
