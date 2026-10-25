// Ace FX: the effects for sim events, all machines and no gore. Explosions
// are a white flash, a rolling fireball of additive puffs that cool from
// white through orange to red, dark smoke that lingers and drifts down the
// screen (we fly forward, so the wreck falls behind), hot sparks streaking
// out with drag, a crisp shockwave ring, and tumbling lit metal debris whose
// edges glow and cool. Plus muzzle flashes, hit sparks, graze sparkles,
// pickups, the EMP wave, the shield pop and the boss death sequence (a chain
// of blasts across the hull, then one huge blast).
//
// Sprites go to the app's shared glow (additive) and smoke (alpha) batches.
// Crisp rings (shockwaves, EMP) are drawn each frame into the view's bolts
// batch. Debris is one pooled InstancedMesh.
import * as THREE from 'three';
import { SPRITE } from '../../textures.js';
import { MAT, colorOf } from './kit.js';
import { SHAPE } from './bolts.js';

const DEBRIS_MAX = 160;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

// A tiny seeded generator, so harness screenshots repeat exactly.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Chunky low-poly scrap: a squashed icosahedron with a few plates.
function scrapGeometry() {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position;
  const r = rng(5);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.6 + r() * 0.8), p.getY(i) * (0.3 + r() * 0.5), p.getZ(i) * (0.5 + r() * 0.6));
  g.computeVertexNormals();
  return g;
}

export class AceFX {
  constructor({ group, glow, smoke, quality }) {
    this.glow = glow;
    this.smoke = smoke;
    this.q = quality?.debris ?? 1;
    this.rand = rng(1234);
    this.rings = []; // { x, y, r0, r1, age, life, rgb, thick }
    this.queue = []; // timed effects: { at, fn }
    this.time = 0;
    // debris
    const geo = scrapGeometry();
    this.emit = new THREE.InstancedBufferAttribute(new Float32Array(DEBRIS_MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aEmit', this.emit);
    this.debrisMesh = new THREE.InstancedMesh(geo, MAT.gunmetal(true), DEBRIS_MAX);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.count = 0;
    group.add(this.debrisMesh);
    this.debris = [];
  }

  r(a = 0, b = 1) {
    return a + this.rand() * (b - a);
  }

  // ------------------------------------------------------------ building blocks

  flash(x, y, size, r = 3, g = 2.6, b = 2.2, life = 0.14) {
    this.glow.add({ x, y, z: 0.8, size, grow: 0.4, life, frame: SPRITE.GLOW, r, g, b, a: 1 });
  }

  fireball(x, y, size, n) {
    for (let i = 0; i < n; i++) {
      const a = this.r(0, 6.283);
      const d = this.r(0, size * 0.35);
      const life = this.r(0.35, 0.7);
      const heat = this.r(0.6, 1);
      this.glow.add({
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        z: 0.5,
        vx: Math.cos(a) * size * this.r(0.6, 1.6),
        vy: Math.sin(a) * size * this.r(0.6, 1.6) - 0.8,
        drag: 3.5,
        size: size * this.r(0.5, 0.9),
        grow: 1.2,
        rot: a,
        life,
        frame: i % 2 ? SPRITE.PUFF : SPRITE.PUFF2,
        r: 3.2 * heat,
        g: 1.3 * heat,
        b: 0.35 * heat,
        a: 0.9,
        onUpdate: cool,
      });
    }
  }

  smokePuffs(x, y, size, n, dark = 0.1) {
    for (let i = 0; i < n; i++) {
      const a = this.r(0, 6.283);
      const s = dark * this.r(0.8, 1.3);
      this.smoke.add({
        x: x + Math.cos(a) * size * 0.3,
        y: y + Math.sin(a) * size * 0.3,
        z: -0.2,
        vx: Math.cos(a) * size * 0.8,
        vy: Math.sin(a) * size * 0.8 - 1.6,
        drag: 1.8,
        size: size * this.r(0.6, 1),
        grow: 1.6,
        rot: a,
        spin: this.r(-0.6, 0.6),
        life: this.r(1.1, 2),
        frame: i % 2 ? SPRITE.PUFF : SPRITE.PUFF2,
        r: s,
        g: s * 0.98,
        b: s * 1.05,
        a: 0.75,
        fadeIn: 0.12,
      });
    }
  }

  sparks(x, y, n, speed, r = 4, g = 2.4, b = 0.8, size = 0.1, dir = null, spread = Math.PI) {
    for (let i = 0; i < n; i++) {
      const a = dir === null ? this.r(0, 6.283) : dir + this.r(-spread, spread);
      const v = speed * this.r(0.4, 1.2);
      this.glow.add({
        x,
        y,
        z: 0.7,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        drag: 3,
        size: size * this.r(0.7, 1.3),
        w: 1,
        h: 0.35,
        align: true,
        stretch: 3.5,
        life: this.r(0.2, 0.5),
        frame: SPRITE.STREAK,
        r,
        g,
        b,
        a: 1,
      });
    }
  }

  ring(x, y, r0, r1, life, rgb, thick = 0.08) {
    this.rings.push({ x, y, r0, r1, age: 0, life, rgb, thick });
  }

  scrap(x, y, n, speed, size, hot = 1) {
    n = Math.round(n * this.q);
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= DEBRIS_MAX) this.debris.shift();
      const a = this.r(0, 6.283);
      const v = speed * this.r(0.3, 1);
      this.debris.push({
        x,
        y,
        z: this.r(-0.2, 0.3),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: this.r(-1, 2),
        rx: this.r(0, 6.28),
        ry: this.r(0, 6.28),
        rz: this.r(0, 6.28),
        wx: this.r(-8, 8),
        wy: this.r(-8, 8),
        wz: this.r(-5, 5),
        s: size * this.r(0.5, 1.2),
        age: 0,
        life: this.r(0.9, 1.6),
        hot: hot * this.r(0.5, 1),
        trail: this.rand() < 0.35,
      });
    }
  }

  // ------------------------------------------------------------ composites

  // size ~ the radius of what blew up, in world units
  explode(x, y, size = 0.6, color = null, big = false) {
    const k = big ? 1.4 : 1;
    this.flash(x, y, size * 5 * k);
    this.flash(x, y, size * 2.2, 4, 3.6, 3.2, 0.08);
    this.fireball(x, y, size * 1.6 * k, big ? 12 : 7);
    this.smokePuffs(x, y, size * 1.8 * k, big ? 7 : 4);
    this.sparks(x, y, big ? 26 : 14, 10 * k, 4, 2.2, 0.7, 0.14 * k);
    if (color) {
      const [r, g, b] = color;
      this.sparks(x, y, 8, 7, r * 3, g * 3, b * 3, 0.12);
      this.glow.add({ x, y, z: 0.6, size: size * 3.5, grow: 0.8, life: 0.35, frame: SPRITE.GLOW, r: r * 1.5, g: g * 1.5, b: b * 1.5, a: 0.8 });
    }
    this.ring(x, y, size * 0.5, size * 3.2 * k, 0.35, [1.6, 1.0, 0.55], 0.06 * k);
    this.scrap(x, y, big ? 9 : 4, 6 * k, Math.max(0.12, size * 0.35));
  }

  hitSpark(x, y) {
    this.sparks(x, y, 4, 7, 3.5, 3, 2, 0.08, Math.PI / 2, 1.2);
    this.glow.add({ x, y, z: 0.7, size: 0.5, life: 0.08, frame: SPRITE.GLOW, r: 2.5, g: 2.2, b: 1.6, a: 1 });
  }

  muzzle(x, y, rgb, size = 0.6) {
    const [r, g, b] = rgb;
    this.glow.add({ x, y, z: 0.7, size, life: 0.07, frame: SPRITE.GLOW, r: r * 2.5, g: g * 2.5, b: b * 2.5, a: 1 });
    this.glow.add({ x, y, z: 0.7, size: size * 1.6, life: 0.06, frame: SPRITE.FLARE, r: r * 1.5, g: g * 1.5, b: b * 1.5, a: 0.8 });
  }

  graze(x, y) {
    this.glow.add({ x, y, z: 0.8, size: 0.55, life: 0.25, rot: this.r(0, 1), spin: 4, frame: SPRITE.SPARKLE, r: 2.4, g: 2.6, b: 3, a: 1 });
    this.sparks(x, y, 2, 3, 1.5, 2.5, 3, 0.06);
  }

  pickup(x, y, rgb) {
    const [r, g, b] = rgb;
    this.ring(x, y, 0.2, 1.2, 0.3, [r * 1.5, g * 1.5, b * 1.5], 0.05);
    this.glow.add({ x, y, z: 0.8, size: 1.2, life: 0.25, frame: SPRITE.SPARKLE, spin: 3, r: r * 2.5, g: g * 2.5, b: b * 2.5, a: 1 });
  }

  shieldPop(x, y) {
    this.ring(x, y, 0.8, 2.4, 0.4, [0.5, 1.6, 2.4], 0.07);
    this.sparks(x, y, 18, 8, 0.8, 2.4, 3.4, 0.12);
    this.flash(x, y, 2.6, 0.6, 1.8, 2.6, 0.18);
  }

  emp(x, y, reach = 30) {
    this.ring(x, y, 0.5, reach, 0.9, [0.8, 2.2, 3.2], 0.25);
    this.ring(x, y, 0.3, reach * 0.7, 0.75, [0.5, 1.2, 2.6], 0.5);
    this.ring(x, y, 0.2, reach * 0.4, 0.6, [1.5, 2.5, 3], 0.12);
    this.flash(x, y, 6, 1.5, 3, 4, 0.3);
    this.sparks(x, y, 30, 18, 1, 2.6, 3.5, 0.18);
  }

  spawn(x, y, rgb) {
    const [r, g, b] = rgb;
    this.ring(x, y, 1.2, 0.2, 0.25, [r * 1.2, g * 1.2, b * 1.2], 0.05);
    this.glow.add({ x, y, z: 0.6, size: 1.4, life: 0.25, frame: SPRITE.GLOW, r: r * 1.2, g: g * 1.2, b: b * 1.2, a: 0.8 });
  }

  playerDead(x, y) {
    this.explode(x, y, 0.9, [0.3, 0.9, 1], true);
    this.ring(x, y, 0.5, 6, 0.6, [2, 2, 2.4], 0.12);
    this.scrap(x, y, 10, 7, 0.22, 1.2);
  }

  // a chain of blasts across the boss, then one huge one; w, h: its size
  bossDeath(x, y, w = 8, h = 3) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const at = this.time + i * 0.14 + this.r(0, 0.08);
      const px = x + this.r(-w / 2, w / 2) * (1 - i / n * 0.5);
      const py = y + this.r(-h / 2, h / 2);
      this.queue.push({ at, fn: () => this.explode(px, py, this.r(0.5, 1.1), null, true) });
    }
    this.queue.push({
      at: this.time + n * 0.14 + 0.2,
      fn: () => {
        this.explode(x, y, 2.4, [1, 0.8, 0.5], true);
        this.flash(x, y, 14, 1.6, 1.3, 1.1, 0.4);
        this.ring(x, y, 1, 22, 0.9, [1.8, 1.3, 0.9], 0.2);
        this.ring(x, y, 0.5, 12, 0.7, [2.5, 2.2, 2], 0.12);
        this.scrap(x, y, 30, 12, 0.5, 1.3);
        this.fireball(x, y, 4, 18);
        this.smokePuffs(x, y, 4, 12, 0.08);
      },
    });
  }

  // ------------------------------------------------------------ per frame

  update(dt, t, bolts) {
    this.time += dt;
    // timed effects
    if (this.queue.length) {
      let j = 0;
      for (const q of this.queue) {
        if (q.at <= this.time) q.fn();
        else this.queue[j++] = q;
      }
      this.queue.length = j;
    }
    // rings
    let j = 0;
    for (const r of this.rings) {
      r.age += dt;
      if (r.age >= r.life) continue;
      this.rings[j++] = r;
      if (!bolts) continue;
      const k = r.age / r.life;
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      const fade = (1 - k) * (1 - k);
      const th = r.thick * (1 + k * 2);
      bolts.push(SHAPE.RING, r.x, r.y, 0, rad + th * 3, rad + th * 3, rad, th, r.rgb[0] * fade, r.rgb[1] * fade, r.rgb[2] * fade, 0.25 * fade);
    }
    this.rings.length = j;
    // debris
    const list = this.debris;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      d.age += dt;
      if (d.age >= d.life) continue;
      const drag = Math.exp(-1.2 * dt);
      d.vx *= drag;
      d.vy = d.vy * drag - 2.5 * dt; // falls behind as we fly on
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.rx += d.wx * dt;
      d.ry += d.wy * dt;
      d.rz += d.wz * dt;
      const k = d.age / d.life;
      const s = d.s * (k > 0.8 ? (1 - k) / 0.2 : 1);
      tmpM.compose(tmpP.set(d.x, d.y, d.z), tmpQ.setFromEuler(tmpE.set(d.rx, d.ry, d.rz)), tmpS.set(s, s, s));
      this.debrisMesh.setMatrixAt(n, tmpM);
      const heat = d.hot * Math.max(0, 1 - k * 2.2);
      this.emit.setXYZW(n, heat * 3, heat * 1.1, heat * 0.25, k * 0.4);
      if (d.trail && this.rand() < 0.5) {
        this.glow.add({ x: d.x, y: d.y, z: 0.3, size: 0.14 + heat * 0.2, life: 0.3, frame: SPRITE.DOT, r: 2.5, g: 1.0, b: 0.3, a: 0.9 * (1 - k) });
        if (this.rand() < 0.4) this.smoke.add({ x: d.x, y: d.y, z: -0.2, vy: -1, size: 0.3, grow: 1.5, life: 0.8, frame: SPRITE.PUFF, r: 0.12, g: 0.12, b: 0.13, a: 0.5 });
      }
      list[n++] = d;
    }
    list.length = n;
    this.debrisMesh.count = n;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    this.emit.needsUpdate = true;
  }

  clear() {
    this.rings.length = 0;
    this.queue.length = 0;
    this.debris.length = 0;
    this.debrisMesh.count = 0;
  }

  dispose() {
    this.debrisMesh.geometry.dispose();
    this.debrisMesh.dispose();
  }
}

// fire puffs cool from white-yellow to deep red as they age
function cool(p) {
  const k = p.age / p.life;
  if (p.r0 === undefined) {
    p.r0 = p.r;
    p.g0 = p.g;
    p.b0 = p.b;
  }
  p.r = p.r0 * (1 - k * 0.5);
  p.g = p.g0 * (1 - k) * (1 - k * 0.5);
  p.b = p.b0 * (1 - k) * (1 - k);
}

export { colorOf };
