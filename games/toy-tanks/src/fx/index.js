// Ball impacts and the little effects around them, made to look like real
// physical events at toy scale (a 5 cm ball beside 19 cm tanks): layered, big
// enough to read clearly from the gameplay camera, never filling the screen.
// PRESENCE sets how big a burst is: 1 is a strictly lifesize pop (a great
// hit reaches about 0.25 m from the impact), which reads as almost nothing
// from where the camera plays; at 2.6 a great hit reaches about 0.65 m (its
// dust ring some 1.25 m across, most of the way to the other tank, which
// starts about 0.9 m off) and the paper, blobs and grains it throws grow
// with it.
//
//   const fx = new Fx({ renderer, scene, camera, quality, world, softUniforms });
//   await fx.warmup();                 // once, after scene.environment and the lights exist
//   fx.burst('jelly', x, y, z, { power: 0.8, great: false, ground: 'moss', water: false, vx, vy });
//   fx.update(dt);                     // every frame, dt already includes slow motion
//
// The pieces (see the headers of each file):
//   soft.js    one GPU-analytic instanced draw on LAYER_SOFT: dust and powder
//              clouds lit as volumes, the impact's bright core, mist
//   shock.js   the fast low ring of dust or spray, and the crown of a splash
//   grains.js  fine ballistic ejecta that land on the real ground: grains,
//              powder, droplets, glitter that flashes when it catches the sun
//   solid.js   CPU-simulated instanced meshes on layer 0, lit and shadowed:
//              tissue paper (FlatPool), gel, mud, water and crumbs (BlobPool)
//   decals.js  splats and stains laid on the ground
// recipes.js says what each ball throws, in layers (contact, shockwave, puff,
// ejecta, secondary pops, marks). The impact flash is one PointLight owned
// here: made with the Fx at intensity 0 and never removed or hidden, so the
// scene's light count never changes and nothing recompiles when a burst goes off.
// Everything is preallocated: a burst writes numbers into typed arrays.
import * as THREE from 'three';
import { LAYER_SOFT } from '../post.js';
import { GROUND_KIT, PAPER, GLITTER, GEL, MUD, BEADS, PIGMENT, makeNoiseTexture, makeSplatAtlas, randomColorIndex, rnd, rr, TAU } from './common.js';
import { sharedUniforms } from './materials.js';
import { SoftParticles } from './soft.js';
import { Shock } from './shock.js';
import { Grains, G_BEAD, G_GLITTER } from './grains.js';
import { FlatPool, BlobPool, K_JELLY, K_MUD, K_CLOD } from './solid.js';
import { Decals } from './decals.js';
import { RECIPES, FLASH_K, contact, ring, puff, flash, dir, D, NO_FLOOR, LIFT_G } from './recipes.js';

const EMPTY = Object.freeze({});
const _c = new THREE.Color();
const BALL_LIST = ['confetti', 'star', 'mud', 'snow', 'jelly', 'bouncy', 'triple'];
const GROUND_LIST = ['grass', 'sand', 'mud', 'snow', 'moss', 'air'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const PRESENCE = 2.6;
// thrown things fly as far as the burst is big (same gravity: speed goes as its root)
const PRESENCE_SPEED = Math.sqrt(PRESENCE);

// what the sky adds to shaded powder, by ground, and the strength of the sun
// (sun.intensity / PI) it was tuned against: the sky term follows the sun's
// strength if the lead changes the light. setLighting() overrides both.
const AMBIENT = {
  grass: [0.38, 0.46, 0.58],
  sand: [0.42, 0.4, 0.42],
  mud: [0.24, 0.28, 0.32],
  snow: [0.62, 0.62, 0.86],
  moss: [0.2, 0.28, 0.26],
};
const SUN_REF = { grass: 1.43, sand: 3.1, mud: 0.57, snow: 6.2, moss: 1.5 };

// what a ball sheds in flight: 0 paper, 1 glitter, 2 snow, 3 gel, 4 mud, 5 none, 6 tri-colour paper
const TRAIL_KIND = { confetti: 0, star: 1, snow: 2, jelly: 3, mud: 4, bouncy: 5, triple: 6 };
const TRAIL_STEP = [0.03, 0.022, 0.03, 0.05, 0.05, 1, 0.034];

class TrailHandle {
  constructor(fx) {
    this.fx = fx;
    this.active = false;
    this.have = false;
    this.acc = 0;
    this.n = 0;
    this.px = 0;
    this.py = 0;
    this.pz = 0;
    this.kind = 0;
    this.step = 0.02;
    this.born = 0;
  }

  begin(ball) {
    this.active = true;
    this.have = false;
    this.acc = 0;
    this.n = 0;
    this.born = this.fx.time;
    const k = TRAIL_KIND[ball] | 0;
    this.kind = k;
    this.step = TRAIL_STEP[k] / Math.max(0.5, this.fx.q);
    return this;
  }

  update(x, y, z, vx, vy) {
    if (!this.active) return;
    if (!this.have) {
      this.px = x;
      this.py = y;
      this.pz = z;
      this.have = true;
      return;
    }
    const dx = x - this.px;
    const dy = y - this.py;
    const dz = z - this.pz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 1e-7) {
      this.acc += d;
      while (this.acc >= this.step) {
        this.acc -= this.step;
        const f = 1 - this.acc / d;
        this.emit(this.px + dx * f, this.py + dy * f, this.pz + dz * f, vx, vy);
      }
    }
    this.px = x;
    this.py = y;
    this.pz = z;
  }

  // what a ball of this stuff sheds as it flies: a paper fleck, a glitter flake, a puff of powder, a drip
  emit(x, y, z, vx, vy) {
    const fx = this.fx;
    const k = this.kind;
    const n = this.n++;
    const jx = x + rr(-0.004, 0.004);
    const jy = y + rr(-0.004, 0.004);
    const jz = z + rr(-0.004, 0.004);
    const G = fx.grains;
    if (k === 0 || k === 6) {
      const ci = randomColorIndex(PAPER);
      const s = rr(0.004, 0.007);
      fx.flat.spawn(jx, jy, jz, rr(-0.08, 0.08) + vx * 0.04, rr(-0.02, 0.08), rr(-0.08, 0.08), s, s * rr(0.7, 1.1), rnd() < 0.4 ? 1 : 0, 0, 0,
        PAPER[ci * 3], PAPER[ci * 3 + 1], PAPER[ci * 3 + 2], 40, rr(9, 13), rr(3.2, 5.5), rr(0.55, 0.85), rr(1.6, 3), rr(8, 22), LIFT_G[fx.world.ground] || 0.0007);
    } else if (k === 1) {
      const ci = randomColorIndex(GLITTER);
      G.spawn(jx, jy, jz, rr(-0.06, 0.06), rr(-0.03, 0.06), rr(-0.06, 0.06), rr(0.0012, 0.002), GLITTER[ci * 3], GLITTER[ci * 3 + 1], GLITTER[ci * 3 + 2], 1, rr(0.9, 1.5), G_GLITTER, rr(3, 5), 0.5, 1, 0, 0, 0, NO_FLOOR);
    } else if (k === 2) {
      puff(fx.soft, jx, jy, jz, rr(-0.03, 0.03), rr(0, 0.05), rr(-0.03, 0.03), rr(0.4, 0.65), 0.003, rr(0.008, 0.016), 1.05, 1.05, 1.08, 0.16, 3, -0.03, 1.4, NO_FLOOR, 1, 0, 0.5);
      G.spawn(jx, jy, jz, rr(-0.05, 0.05), rr(-0.02, 0.06), rr(-0.05, 0.05), rr(0.0006, 0.0011), 1, 1, 1, 0.95, rr(0.6, 1.1), G_BEAD, 2.4, 0.4, 1.5, 0, 0, 0, NO_FLOOR);
    } else if (k === 3 && (n & 1) === 0) {
      const gi = fx.gelIdx;
      const j = fx.blobs.spawn(K_JELLY, jx, jy - 0.006, jz, rr(-0.05, 0.05), rr(-0.05, 0.03), rr(-0.05, 0.05), rr(0.0018, 0.0028), GEL[gi * 3], GEL[gi * 3 + 1], GEL[gi * 3 + 2], rr(2, 3));
      fx.blobs.look(j, 0.13, 0.6, 0, 0, 0.5);
    } else if (k === 4) {
      const ci = randomColorIndex(MUD);
      const j = fx.blobs.spawn(K_MUD, jx, jy - 0.006, jz, rr(-0.05, 0.05), rr(-0.05, 0.03), rr(-0.05, 0.05), rr(0.0015, 0.0026), MUD[ci * 3], MUD[ci * 3 + 1], MUD[ci * 3 + 2], rr(2, 3));
      fx.blobs.look(j, 0.14, 0, 0.1, 0.2, 0.5);
    }
  }

  end() {
    this.active = false;
  }
}

export class Fx {
  constructor({ renderer, scene, camera, quality, world, softUniforms }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.quality = quality;
    this.q = quality && quality.particles ? quality.particles : 1;
    this.time = 0;
    this.onSplat = null;
    this.sun = null;
    this.lightOverride = false;
    this.n = new THREE.Vector3(0, 1, 0);
    this.gelIdx = 0;
    this.waterMesh = null;

    const noise = makeNoiseTexture(256);
    sharedUniforms.uNoise.value = noise;
    sharedUniforms.uAtlas.value = makeSplatAtlas();

    const fx = this;
    // what the pools call back into
    this.ctx = {
      world,
      fx,
      normalAt(x, z) {
        world.normalAt(x, z, fx.n);
        return fx.n;
      },
      splat: (pool, i, x, gy, z, R, nx, ny, nz) => this.splatFrom(pool, i, x, gy, z, R),
      breakUp: (pool, i, x, y, z, vx, vy, vz) => this.breakUp(pool, i, x, y, z, vx, vy, vz),
      bounceTick: (kd, x, gy, z, impact, R) => this.bounceTick(kd, x, gy, z, impact, R),
      pop: (x, gy, z, r, g, b, rad, water) => this.pop(x, gy, z, water),
    };

    // everything we draw lives under one group, so warmup can compile just our own materials
    this.root = new THREE.Group();
    this.root.name = 'fx';
    scene.add(this.root);
    this.soft = new SoftParticles(this.root, softUniforms, noise, 3072);
    this.shock = new Shock(this.root, softUniforms, noise, 6);
    this.grains = new Grains(this.root, softUniforms, this.ctx, Math.round(2000 * Math.max(0.5, this.q)));
    this.decals = new Decals(240, this.ctx);
    this.flat = new FlatPool(1400, this.ctx);
    this.blobs = new BlobPool(620, this.ctx);
    this.root.add(this.decals.mesh, this.flat.mesh, this.blobs.mesh);

    // The impact flash: one warm point light for every burst, part of the scene from the start at
    // intensity 0, so the number of lights never changes (a change recompiles every lit material).
    // It shines on layer 3 as well, like the sun, because the lake's mirror pass counts lights too.
    this.light = new THREE.PointLight(0xffe2b8, 0, 0.9, 2);
    this.light.castShadow = false;
    this.light.layers.enable(3);
    this.light.name = 'fx-flash';
    scene.add(this.light);
    this.flashT = 1e3;
    this.flashPeak = 0;
    this.flashGain = 1;

    // the burst being built (reused)
    this.B = {
      x: 0, y: 0, z: 0, gy: 0, hi: false, water: false, wy: NO_FLOOR, floor: NO_FLOOR, size: 1, reach: 1, ext: 0.25, cm: 1, cmSoft: 1, sm: 1, bx: 0, debrisK: 1, great: false, power: 1,
      ground: 'grass', kit: GROUND_KIT.grass, ball: 'confetti',
    };
    // delayed events: the second wave of a great hit, the small pops where debris lands
    this.evN = 28;
    this.evT = new Float32Array(this.evN).fill(-1);
    this.evD = new Float32Array(this.evN * 16);
    // celebration fountains
    this.emN = 3;
    this.emT = new Float32Array(this.emN).fill(-1);
    this.emD = new Float32Array(this.emN * 5);
    this.trails = [new TrailHandle(this), new TrailHandle(this), new TrailHandle(this), new TrailHandle(this)];
    this.stats = { flat: 0, blobs: 0, decals: 0, soft: 0, grains: 0 };
  }

  // ------------------------------------------------------------------ setup
  findSun() {
    this.sun = null;
    this.scene.traverse((o) => {
      if (!this.sun && o.isDirectionalLight) this.sun = o;
    });
  }

  // Optional overrides: sunDir (towards the sun), sunColor (linear, already scaled
  // like a Lambert surface facing the sun would show it), ambient (sky light on shade).
  setLighting({ sunDir, sunColor, ambient }) {
    this.lightOverride = true;
    this.ovDir = sunDir || [0.4, 0.8, 0.3];
    this.ovSun = sunColor || [1, 0.95, 0.85];
    this.ovAmb = ambient || [0.3, 0.38, 0.5];
  }

  // The sun and sky the clouds are lit with, from the scene's own sun, and how
  // strong the impact flash is beside it.
  syncLight() {
    let dx = 0.4;
    let dy = 0.8;
    let dz = 0.3;
    let sr = 1;
    let sg = 0.95;
    let sb = 0.85;
    const ground = this.world.ground;
    let amb = AMBIENT[ground] || AMBIENT.grass;
    let ambK = 1;
    let sunI = 4.5;
    if (this.lightOverride) {
      dx = this.ovDir[0];
      dy = this.ovDir[1];
      dz = this.ovDir[2];
      sr = this.ovSun[0];
      sg = this.ovSun[1];
      sb = this.ovSun[2];
      amb = this.ovAmb;
    } else if (this.sun) {
      const s = this.sun;
      dx = s.position.x - s.target.position.x;
      dy = s.position.y - s.target.position.y;
      dz = s.position.z - s.target.position.z;
      const k = s.intensity / Math.PI;
      sr = s.color.r * k;
      sg = s.color.g * k;
      sb = s.color.b * k;
      sunI = s.intensity;
      ambK = clamp(k / (SUN_REF[ground] || 1.43), 0.5, 3);
    }
    this.flashGain = clamp(sunI / 4.5, 0.4, 4.5);
    const a0 = amb[0] * ambK;
    const a1 = amb[1] * ambK;
    const a2 = amb[2] * ambK;
    this.soft.setLight(dx, dy, dz, sr, sg, sb, a0, a1, a2);
    this.shock.setLight(dx, dy, dz, sr, sg, sb, a0, a1, a2);
    this.grains.setLight(dx, dy, dz, sr, sg, sb, a0, a1, a2);
  }

  // Compile every material and touch every pool before the first real burst: put
  // one of each thing in the scene, render it once into a tiny target (this also
  // builds the shadow-pass programs), then run each recipe through a second of
  // simulated time so the code paths are hot.
  async warmup() {
    const renderer = this.renderer;
    this.findSun();
    this.syncLight();
    const world = this.world;
    const cam = this.camera;
    const gy = world.heightAt(0, 0);
    this.clear();
    const opts = { great: true, power: 1, ground: 'grass' };
    for (let g = 0; g < BALL_LIST.length; g++) {
      opts.ground = GROUND_LIST[g % 5];
      this.burst(BALL_LIST[g], 0, gy + 0.02, 0, opts);
    }
    // a hit high on a tank (or a target in the air) and a splash in water
    this.burst('confetti', 0.1, gy + 0.2, 0, { great: true, power: 1, ground: 'air' });
    this.burst('mud', -0.1, gy + 0.2, 0, { great: false, power: 0.6, ground: 'grass' });
    this.burst('jelly', 0.2, gy + 0.02, 0, { great: true, power: 1, ground: 'mud', water: true });
    this.bounce('bouncy', 0, gy, 0, 1);
    this.split(0, gy + 0.1, 0);
    this.muzzle(0, gy + 0.1, 0, 1, 0.5, 'star');
    this.celebrate(0, gy, 0);
    this.sparkle(0, gy + 0.1, 0, 6, 0xffcc00);
    this.decals.add(0, 0, 0.03, 0.2, 0.1, 0.05, 0, 1);
    for (const ball of BALL_LIST) {
      const t = this.trail(ball);
      t.update(0, gy + 0.1, 0, 1, 0);
      t.update(0.1, gy + 0.12, 0, 1, 0);
      t.end();
    }
    this.update(1 / 60);
    for (const p of [this.flat, this.blobs, this.decals]) p.mesh.visible = true;
    this.soft.mesh.visible = true;
    this.shock.mesh.visible = true;
    this.grains.mesh.visible = true;
    const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType });
    const prevRT = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const mask = cam.layers.mask;
    const bg = this.scene.background;
    // draw only our own things (plus the lights, which the lit materials' programs depend on):
    // the rest of the scene is hidden for these two tiny renders
    const hidden = [];
    for (const o of this.scene.children) {
      if (o === this.root || o.isLight || !o.visible) continue;
      o.visible = false;
      hidden.push(o);
    }
    try {
      // parallel compile of just our materials, with a timeout so a slow driver can never hold up loading
      if (renderer.compileAsync) {
        await Promise.race([renderer.compileAsync(this.root, cam, this.scene), new Promise((r) => setTimeout(r, 2500))]);
      } else renderer.compile(this.root, cam, this.scene);
      this.scene.background = null;
      renderer.setRenderTarget(rt);
      renderer.autoClear = true;
      cam.layers.set(0);
      renderer.render(this.scene, cam);
      cam.layers.set(LAYER_SOFT);
      renderer.autoClear = false;
      renderer.render(this.scene, cam);
    } finally {
      for (const o of hidden) o.visible = true;
      cam.layers.mask = mask;
      renderer.autoClear = prevAuto;
      this.scene.background = bg;
      renderer.setRenderTarget(prevRT);
      rt.dispose();
    }
    // hot paths: about a second of game time for each recipe
    for (let s = 0; s < 36; s++) this.update(1 / 30);
    this.clear();
  }

  clear() {
    this.flat.clear();
    this.blobs.clear();
    this.decals.clear();
    this.soft.clear();
    this.shock.clear();
    this.grains.clear();
    this.evT.fill(-1);
    this.emT.fill(-1);
    for (const t of this.trails) t.active = false;
    this.flashPeak = 0;
    this.flashT = 1e3;
    this.light.intensity = 0;
    this.setFlash(0, -100, 0, 0);
  }

  setViewport(heightPx) {
    this.soft.setViewport(heightPx);
    this.grains.setViewport(heightPx);
  }

  // a crater reshaped the ground here: stains under it go, paper and glitter that lay there settle onto the new ground
  clearDecalsNear(x, z, r) {
    this.decals.clearNear(x, z, r);
    this.flat.reseat(x, z, r);
    this.grains.reseat(x, z, r, this.world);
  }

  setFlash(x, y, z, I) {
    this.soft.setFlash(x, y, z, I);
    this.shock.setFlash(x, y, z, I);
    this.grains.setFlash(x, y, z, I);
  }

  // The impact flash: a warm point light that lights the ground, grass and tanks
  // round the impact for about 60 ms: full for a frame, then dying away. k is its
  // strength (1 for a great hit of a bright ball); the sun's strength scales it,
  // so it stays restrained in every light.
  flashLight(x, y, z, k) {
    const I = 0.055 * k * this.flashGain;
    if (this.flashT < 0.09 && this.flashPeak > I) return;
    this.flashT = 0;
    this.flashPeak = I;
    this.light.position.set(x, y, z);
  }

  // where the water of a puddle lies (the stage's puddle sheet), for a splash
  waterLevel(gy) {
    let m = this.waterMesh;
    if (!m || !m.parent) {
      m = null;
      this.scene.traverse((o) => {
        if (!m && o.name === 'puddles' && o.geometry && o.geometry.attributes.position) m = o;
      });
      this.waterMesh = m;
    }
    if (m) return m.geometry.attributes.position.getY(0) + m.position.y;
    return gy + 0.012;
  }

  // ------------------------------------------------------------------ API
  burst(ball, x, y, z, opts = EMPTY) {
    const world = this.world;
    const B = this.B;
    const recipe = RECIPES[ball] || RECIPES.confetti;
    const great = !!opts.great;
    const power = opts.power === undefined ? 0.75 : clamp(opts.power, 0, 1);
    const scale = opts.scale === undefined ? 1 : opts.scale;
    const ground = opts.ground || world.ground || 'grass';
    const air = ground === 'air';
    B.ball = ball;
    B.ground = ground;
    B.kit = GROUND_KIT[air ? world.ground : ground] || GROUND_KIT.grass;
    B.great = great;
    B.power = power;
    B.gy = world.heightAt(x, z);
    B.water = !!opts.water && !air;
    B.wy = B.water ? this.waterLevel(B.gy) : NO_FLOOR;
    B.floor = B.wy;
    const base = B.water ? B.wy : B.gy;
    B.x = x;
    B.z = z;
    B.y = Math.max(y, base + 0.004);
    // a hit high on a tank (or a target in the air) throws only what the ball is made of
    B.hi = air || B.y - base > 0.05;
    B.debrisK = B.hi ? 0.4 : 1;
    const ballScale = ball === 'triple' ? 0.62 : ball === 'bouncy' ? 0.78 : 1;
    const size = scale * ballScale;
    const q = this.q;
    const sz1 = Math.min(1, size);
    B.size = size * PRESENCE;
    B.reach = B.size * (great ? 1 : 0.7) * (0.8 + 0.2 * power);
    B.ext = 0.25 * B.reach;
    // more pieces for the bigger spread, so it stays as dense
    B.cm = q * (0.6 + 0.4 * power) * (great ? 1 : 0.7) * (0.4 + 0.6 * sz1) * (B.hi ? 0.85 : 1) * PRESENCE * 0.8;
    B.cmSoft = (0.6 + 0.4 * q) * (0.75 + 0.25 * power) * (great ? 1 : 0.75) * (0.5 + 0.5 * sz1) * 1.3;
    B.sm = (0.72 + 0.28 * power) * (0.55 + 0.45 * Math.min(1.2, size)) * (great ? 1.08 : 0.92) * PRESENCE_SPEED;
    B.bx = clamp((opts.vx || 0) * 0.08, -0.3, 0.3);
    contact(this, B, FLASH_K[ball] || 1);
    ring(this, B);
    recipe(this, B, false);
    // the second bloom of a great hit, and the patter of small pops as debris lands
    if (great) this.schedule(0.11, 0);
    if (!B.hi) this.patter(B);
    if (this.soft.endTime < this.time + 3) this.soft.endTime = this.time + 3;
  }

  // queue an event: type 0 the second wave of B's burst, 1 a small pop of dust or mist
  queue(delay, type, x, z, gy, size) {
    const B = this.B;
    for (let e = 0; e < this.evN; e++) {
      if (this.evT[e] >= 0) continue;
      this.evT[e] = this.time + delay;
      const o = e * 16;
      const d = this.evD;
      d[o] = x;
      d[o + 1] = B.y;
      d[o + 2] = z;
      d[o + 3] = gy;
      d[o + 4] = B.cm;
      d[o + 5] = B.cmSoft;
      d[o + 6] = B.sm;
      d[o + 7] = B.bx;
      d[o + 8] = BALL_LIST.indexOf(B.ball);
      d[o + 9] = GROUND_LIST.indexOf(B.ground);
      d[o + 10] = type;
      d[o + 11] = size;
      d[o + 12] = B.reach;
      d[o + 13] = B.hi ? 1 : 0;
      d[o + 14] = B.water ? 1 : 0;
      d[o + 15] = B.wy;
      return;
    }
  }

  schedule(delay, type) {
    const B = this.B;
    this.queue(delay, type, B.x, B.z, B.gy, B.size);
  }

  // small puffs of dust or mist a moment later, where the fine debris comes down
  patter(B) {
    const n = Math.round((B.great ? 5 : 3) * (0.5 + 0.5 * this.q));
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      const r = B.ext * rr(0.15, 0.9);
      const x = B.x + Math.cos(a) * r;
      const z = B.z + Math.sin(a) * r;
      this.queue(rr(0.15, 0.6), 1, x, z, B.water ? B.wy : this.world.heightAt(x, z), B.size);
    }
  }

  runEvent(e) {
    const d = this.evD;
    const o = e * 16;
    const B = this.B;
    const type = d[o + 10];
    if (type === 1) {
      // a pop of dust, powder or mist where something landed
      const wet = d[o + 14] > 0;
      const size = d[o + 11];
      const g = GROUND_LIST[d[o + 9]] || 'grass';
      const kit = GROUND_KIT[g] || GROUND_KIT.grass;
      const snowy = g === 'snow' && !wet;
      const s = (snowy ? 1.3 : 1) * Math.max(0.6, size);
      const gy = d[o + 3];
      const a = Math.min(0.3, 0.22 * (kit.dustAmt / 0.34) ** 0.5 * (wet ? 0.5 : 1));
      puff(this.soft, d[o], gy + 0.004, d[o + 2], rr(-0.05, 0.05), rr(0.1, 0.24), rr(-0.05, 0.05), rr(0.4, 0.7), 0.008 * s, rr(0.02, 0.036) * s, wet ? 0.9 : kit.dust[0], wet ? 0.88 : kit.dust[1], wet ? 0.82 : kit.dust[2], a, 4, -0.08, 1.2, gy + 0.004, 1, 0, 0.4);
      return;
    }
    B.x = d[o];
    B.y = d[o + 1];
    B.z = d[o + 2];
    B.gy = d[o + 3];
    B.cm = d[o + 4] * 0.7;
    B.cmSoft = d[o + 5];
    B.sm = d[o + 6] * 0.92;
    B.bx = d[o + 7];
    B.ball = BALL_LIST[d[o + 8]] || 'confetti';
    B.ground = GROUND_LIST[d[o + 9]] || 'grass';
    B.size = d[o + 11];
    B.reach = d[o + 12];
    B.ext = 0.25 * B.reach;
    B.hi = d[o + 13] > 0;
    B.water = d[o + 14] > 0;
    B.wy = d[o + 15];
    B.floor = B.water ? B.wy : NO_FLOOR;
    B.kit = GROUND_KIT[B.ground === 'air' ? this.world.ground : B.ground] || GROUND_KIT.grass;
    B.great = true;
    B.debrisK = 0.5;
    (RECIPES[B.ball] || RECIPES.confetti)(this, B, true);
  }

  // a rubber ball hopping: a little ring and puff of the ground's dust and a few grains
  bounce(ball, x, y, z, strength) {
    const world = this.world;
    const gy = world.heightAt(x, z);
    const kit = GROUND_KIT[world.ground] || GROUND_KIT.grass;
    const s = clamp(strength === undefined ? 0.7 : strength, 0.3, 1.4);
    this.shock.spawn(x, gy + 0.002, z, 0.05 + 0.05 * s, 0.01 * s, 0.22, kit.dust[0], kit.dust[1], kit.dust[2], 0.3 + 0.1 * s, 0.3, world.ground === 'snow' ? 1 : 0);
    const n = 5;
    for (let k = 0; k < n; k++) {
      const a = ((k + rnd() * 0.7) / n) * TAU;
      const sp = rr(0.2, 0.45) * s;
      puff(this.soft, x + Math.cos(a) * 0.01, gy + 0.006, z + Math.sin(a) * 0.01, Math.cos(a) * sp, rr(0.03, 0.12), Math.sin(a) * sp, rr(0.3, 0.5), 0.006 * s, rr(0.014, 0.026) * s,
        kit.dust[0], kit.dust[1], kit.dust[2], 0.3 * kit.dustAmt + 0.06, 4.5, -0.05, 0.9, gy + 0.005, 1, rr(0, 0.03), 0.35);
    }
    const ng = Math.round(16 * s * (0.6 + 0.4 * this.q));
    const soil = kit.soil;
    for (let k = 0; k < ng; k++) {
      dir(0.3, 1, 1);
      const sp = rr(0.3, 1.1) * s;
      const ci = randomColorIndex(soil);
      this.grains.spawn(x, gy + 0.008, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.0006, 0.0012), soil[ci * 3], soil[ci * 3 + 1], soil[ci * 3 + 2], 1, rr(0.6, 1.2), G_BEAD, 1.1, 1, 0.7, 0, 0, 0.03, NO_FLOOR);
    }
  }

  // the triple ball opening in the air: a small pop of violet-grey powder and a spray of tissue paper
  split(x, y, z) {
    const S = this.soft;
    this.flashLight(x, y, z, 0.5);
    flash(S, x, y, z, 0.07, 0.02, 1, 0.94, 0.82, 0.55);
    const tone = PIGMENT.triple;
    const n = Math.round(8 * (0.6 + 0.4 * this.q));
    for (let k = 0; k < n; k++) {
      dir(-1, 1, 1);
      const sp = rr(0.3, 0.8);
      puff(S, x, y, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.5, 0.8), 0.01, rr(0.03, 0.05), tone[0], tone[1], tone[2], 0.22, 4, -0.05, 1.3, NO_FLOOR, 1, 0, 0.4);
    }
    const nc = Math.round(24 * this.q);
    for (let k = 0; k < nc; k++) {
      dir(-1, 1, 1);
      const sp = rr(0.4, 1.2);
      const ci = randomColorIndex(PAPER);
      const s = rr(0.005, 0.008);
      this.flat.spawn(x, y, z, D[0] * sp, D[1] * sp, D[2] * sp, s, s * rr(0.7, 1.1), rnd() < 0.4 ? 1 : 0, 0, 0, PAPER[ci * 3], PAPER[ci * 3 + 1], PAPER[ci * 3 + 2], 60, rr(9, 13), rr(3.2, 5.5), rr(0.55, 0.85), rr(1.6, 3), rr(8, 22), LIFT_G[this.world.ground] || 0.0007);
    }
  }

  // the toy pop at the barrel: a small flash, a puff of the ball's own dust and a narrow fan of what it is made of
  muzzle(x, y, z, dirX, dirY, ball) {
    const S = this.soft;
    let l = Math.sqrt(dirX * dirX + dirY * dirY);
    if (l < 1e-6) {
      dirX = 1;
      dirY = 0;
      l = 1;
    }
    const ux = dirX / l;
    const uy = dirY / l;
    const k = TRAIL_KIND[ball] | 0;
    const ox = x + ux * 0.014;
    const oy = y + uy * 0.014;
    this.flashLight(ox, oy, z, 0.4);
    flash(S, ox, oy, z, 0.06, 0.014, 1, 0.94, 0.82, 0.5);
    // a puff along the barrel's axis
    const tone = k === 2 ? WHITE_T : ball === 'confetti' ? PIGMENT.confetti : ball === 'star' ? PIGMENT.star : ball === 'triple' ? PIGMENT.triple : k === 3 ? PIGMENT.jelly : k === 4 ? MUD : PIGMENT.bouncy;
    const np = 4;
    for (let i = 0; i < np; i++) {
      const sp = rr(0.5, 1.4);
      puff(S, ox, oy, z, ux * sp + rr(-0.06, 0.06), uy * sp + rr(-0.06, 0.06), rr(-0.08, 0.08), rr(0.4, 0.6), 0.008, rr(0.022, 0.04), tone[0], tone[1], tone[2], 0.24, 4.2, -0.04, 1.3, NO_FLOOR, 1, i * 0.008, 0.4);
    }
    const nf = Math.round(10 * (0.6 + 0.4 * this.q));
    for (let i = 0; i < nf; i++) {
      const spread = rr(-0.4, 0.4);
      const ca = Math.cos(spread);
      const sa = Math.sin(spread);
      const sp = rr(0.8, 2.2);
      const vx = (ux * ca - uy * sa) * sp;
      const vy = (uy * ca + ux * sa) * sp;
      const vz = rr(-0.3, 0.3) * sp;
      if (k === 0 || k === 6) {
        const ci = randomColorIndex(PAPER);
        const w = rr(0.005, 0.008);
        this.flat.spawn(ox, oy, z, vx, vy, vz, w, w * rr(0.7, 1.1), rnd() < 0.4 ? 1 : 0, 0, 0, PAPER[ci * 3], PAPER[ci * 3 + 1], PAPER[ci * 3 + 2], 40, rr(9, 13), rr(3.2, 5.5), rr(0.55, 0.85), rr(1.6, 3), rr(8, 22), LIFT_G[this.world.ground] || 0.0007);
      } else if (k === 1) {
        const ci = randomColorIndex(GLITTER);
        this.grains.spawn(ox, oy, z, vx, vy, vz, rr(0.0014, 0.0024), GLITTER[ci * 3], GLITTER[ci * 3 + 1], GLITTER[ci * 3 + 2], 1, rr(1, 1.6), G_GLITTER, rr(4, 7), 0.5, 1, 0, 0, 0, NO_FLOOR);
      } else if (k === 2) {
        this.grains.spawn(ox, oy, z, vx, vy, vz, rr(0.0007, 0.0013), 1, 1, 1, 0.95, rr(0.8, 1.6), G_BEAD, 2.6, 0.4, 1.5, 0, 0, 0, NO_FLOOR);
      } else if (k === 3) {
        const gi = this.gelIdx;
        const j = this.blobs.spawn(K_JELLY, ox, oy, z, vx * 0.6, vy * 0.6, vz * 0.6, rr(0.0016, 0.0026), GEL[gi * 3], GEL[gi * 3 + 1], GEL[gi * 3 + 2], rr(2, 3));
        this.blobs.look(j, 0.13, 0.6, 0, 0, 0.5);
      } else if (k === 4) {
        const ci = randomColorIndex(MUD);
        const j = this.blobs.spawn(K_MUD, ox, oy, z, vx * 0.6, vy * 0.6, vz * 0.6, rr(0.0016, 0.0028), MUD[ci * 3], MUD[ci * 3 + 1], MUD[ci * 3 + 2], rr(2, 3));
        this.blobs.look(j, 0.14, 0, 0.1, 0.2, 0.5);
      } else {
        const ci = randomColorIndex(BEADS);
        this.grains.spawn(ox, oy, z, vx * 0.7, vy * 0.7, vz * 0.7, rr(0.0009, 0.0014), BEADS[ci * 3], BEADS[ci * 3 + 1], BEADS[ci * 3 + 2], 0.9, rr(0.8, 1.4), G_BEAD, 2, 0.8, 1, 0, 0, 0, NO_FLOOR);
      }
    }
  }

  trail(ball) {
    let t = null;
    let oldest = this.trails[0];
    for (let i = 0; i < this.trails.length; i++) {
      const h = this.trails[i];
      if (!h.active) {
        t = h;
        break;
      }
      if (h.born < oldest.born) oldest = h;
    }
    if (ball === 'jelly') this.gelIdx = randomColorIndex(GEL);
    return (t || oldest).begin(ball);
  }

  // sparkle where a target is hit: a shower of glitter flakes in the target's colour and gold
  sparkle(x, y, z, count, color) {
    if (color === undefined) _c.setRGB(1, 0.85, 0.45);
    else _c.set(color);
    const n = Math.max(1, Math.round(count * (0.6 + 0.4 * this.q)));
    flash(this.soft, x, y, z, 0.06, 0.012, 1, 0.94, 0.8, 0.4);
    for (let k = 0; k < n; k++) {
      dir(-0.6, 1, 1);
      const sp = rr(0.4, 1.6);
      const t = 0.35 + 0.4 * rnd();
      this.grains.spawn(x, y, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.0012, 0.0022), _c.r * t + 0.9 * (1 - t), _c.g * t + 0.72 * (1 - t), _c.b * t + 0.35 * (1 - t), 1, rr(0.9, 1.6), G_GLITTER, rr(3.5, 6), 0.5, 1, 0, 0, 0, NO_FLOOR, rr(0, 0.04));
    }
  }

  // party confetti fountain, about two seconds
  celebrate(x, y, z) {
    for (let e = 0; e < this.emN; e++) {
      if (this.emT[e] >= 0) continue;
      this.emT[e] = 2.4;
      const o = e * 5;
      this.emD[o] = x;
      this.emD[o + 1] = y;
      this.emD[o + 2] = z;
      this.emD[o + 3] = 0;
      this.emD[o + 4] = 0;
      break;
    }
    flash(this.soft, x, y + 0.02, z, 0.07, 0.016, 1, 0.92, 0.78, 0.4);
  }

  // ------------------------------------------------------------------ callbacks from the pools
  splatFrom(pool, i, x, gy, z, R) {
    const size = R * pool.decalAmt[i];
    if (size <= 0) return;
    const C = pool.C;
    const r = C[i * 3];
    const g = C[i * 3 + 1];
    const b = C[i * 3 + 2];
    const cell = ((rnd() * 4) | 0) + (rnd() < 0.3 ? 4 : 0);
    const mudK = pool.kind[i] === K_MUD;
    this.decals.add(x, z, size, mudK ? r * 0.7 : r, mudK ? g * 0.7 : g, mudK ? b * 0.7 : b, cell, mudK ? 0.4 : 1, 120);
    if (this.onSplat && R >= 0.0033) {
      _c.setRGB(r, g, b);
      const kd = pool.kind[i];
      this.onSplat(x, gy, z, size, _c.getHex(), kd === K_MUD ? 'mud' : kd === K_JELLY ? 'jelly' : 'paint');
    }
  }

  // a snow clump breaks up: crumbs, a small puff of powder and fine flakes
  breakUp(pool, i, x, y, z, vx, vy, vz) {
    const S = this.soft;
    const R = pool.R[i];
    const C = pool.C;
    const gy = this.world.heightAt(x, z);
    for (let k = 0; k < 4; k++) {
      const j = pool.spawn(K_CLOD, x, y, z, vx * 0.3 + rr(-0.5, 0.5), vy * 0.25 + rr(0.1, 0.7), vz * 0.3 + rr(-0.5, 0.5), R * rr(0.28, 0.48), C[i * 3], C[i * 3 + 1], C[i * 3 + 2], rr(0.6, 1.0));
      pool.look(j, 0.85, 0.25, 0.35, 0.4, -1);
    }
    puff(S, x, y, z, vx * 0.12 + rr(-0.08, 0.08), vy * 0.1 + rr(0, 0.12), vz * 0.12 + rr(-0.08, 0.08), rr(0.7, 1.1), R * 1.3, R * rr(4, 5.5), 1.04, 1.04, 1.06, 0.34, 3.4, -0.1, 1.6, gy + R, 1, 0, 0.3);
    for (let k = 0; k < 10; k++) {
      dir(0.05, 1, 1);
      const sp = rr(0.4, 1.3);
      this.grains.spawn(x, y, z, D[0] * sp + vx * 0.15, D[1] * sp + vy * 0.1, D[2] * sp + vz * 0.15, rr(0.0006, 0.0012), 1, 1, 1, 0.95, rr(0.8, 1.5), G_BEAD, 3, 0.4, 1.5, 0, 0, 0, NO_FLOOR);
    }
  }

  bounceTick(kd, x, gy, z, impact, R) {
    if (kd !== K_CLOD || impact < 0.55) return;
    this.pop(x, gy, z, false);
  }

  // a small puff of dust (or mist over water) where debris came down
  pop(x, gy, z, water) {
    const world = this.world;
    const kit = GROUND_KIT[world.ground] || GROUND_KIT.grass;
    const snowy = world.ground === 'snow' && !water;
    const s = snowy ? 1.3 : 1;
    const a = Math.min(0.3, 0.2 * (kit.dustAmt / 0.34) ** 0.5 * (water ? 0.5 : 1));
    puff(this.soft, x, gy + 0.004, z, rr(-0.04, 0.04), rr(0.08, 0.2), rr(-0.04, 0.04), rr(0.35, 0.6), 0.006 * s, rr(0.016, 0.03) * s, water ? 0.9 : kit.dust[0], water ? 0.88 : kit.dust[1], water ? 0.82 : kit.dust[2], a, 4, -0.05, 1.2, gy + 0.004, 1, 0, 0.35);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (dt <= 0) dt = 0.0001;
    if (dt > 0.1) dt = 0.1;
    const world = this.world;
    this.time += dt;
    sharedUniforms.uTime.value = this.time;
    this.soft.time = this.time;
    this.shock.time = this.time;
    this.syncLight();
    // the impact flash: full for a frame or two, then gone in about 60 ms
    if (this.flashPeak > 0) {
      const t = (this.flashT += dt);
      let I = 0;
      if (t < 0.16) I = this.flashPeak * (t < 0.022 ? 1 : Math.exp(-(t - 0.022) / 0.02));
      else this.flashPeak = 0;
      this.light.intensity = I;
      const p = this.light.position;
      this.setFlash(p.x, p.y, p.z, I);
    }
    // delayed events
    for (let e = 0; e < this.evN; e++) {
      const t = this.evT[e];
      if (t >= 0 && t <= this.time) {
        this.evT[e] = -1;
        this.runEvent(e);
      }
    }
    // celebration fountains
    for (let e = 0; e < this.emN; e++) {
      if (this.emT[e] < 0) continue;
      const left = (this.emT[e] -= dt);
      if (left < 0) {
        this.emT[e] = -1;
        continue;
      }
      const o = e * 5;
      const x = this.emD[o];
      const y = this.emD[o + 1];
      const z = this.emD[o + 2];
      const rate = 80 * Math.min(1, left / 0.6 + 0.2) * this.q;
      this.emD[o + 3] += rate * dt;
      while (this.emD[o + 3] >= 1) {
        this.emD[o + 3] -= 1;
        const a = rnd() * TAU;
        const tilt = rr(0.02, 0.3);
        const sp = rr(1.4, 2.5);
        const ci = randomColorIndex(PAPER);
        const sx = rr(0.008, 0.013);
        const r = rnd();
        const strip = r < 0.15;
        const foil = r > 0.94;
        const gi = randomColorIndex(GLITTER);
        this.flat.spawn(x, y + 0.02, z, Math.cos(a) * Math.sin(tilt) * sp, Math.cos(tilt) * sp, Math.sin(a) * Math.sin(tilt) * sp, strip ? sx * 2.4 : sx, strip ? sx * 0.26 : sx * rr(0.6, 1), r < 0.5 ? 0 : r < 0.75 ? 1 : 2, strip ? rr(2, 4.5) : 0, foil ? 1 : 0,
          foil ? GLITTER[gi * 3] : PAPER[ci * 3], foil ? GLITTER[gi * 3 + 1] : PAPER[ci * 3 + 1], foil ? GLITTER[gi * 3 + 2] : PAPER[ci * 3 + 2], rr(6, 9), rr(9, 13), rr(3.2, 5.5), rr(0.55, 0.85), rr(1.6, 3), rr(8, 22), LIFT_G[world.ground] || 0.0007);
      }
    }
    this.decals.update(dt);
    this.flat.update(dt);
    this.blobs.update(dt);
    this.soft.update(this.time, world.gravity, world.wind);
    this.shock.update(this.time);
    this.grains.update(dt, this.time, world);
  }

  get counts() {
    const s = this.stats;
    s.flat = this.flat.live;
    s.blobs = this.blobs.live;
    s.decals = this.decals.mesh.count;
    s.soft = this.soft.high;
    s.grains = this.grains.live;
    return s;
  }
}

const WHITE_T = new Float32Array([1.02, 1.02, 1.04]);
