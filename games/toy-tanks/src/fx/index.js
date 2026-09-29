// Ball explosions and the little effects around them.
//
//   const fx = new Fx({ renderer, scene, camera, quality, world, softUniforms });
//   await fx.warmup();                 // once, after scene.environment and the lights exist
//   fx.burst('jelly', x, y, z, { power: 0.8, great: false, ground: 'moss', vx, vy });
//   fx.update(dt);                     // every frame, dt already includes slow motion
//
// Three systems do the work (see the headers of each file):
//   soft.js   one GPU-analytic instanced draw on LAYER_SOFT: powder clouds, dust,
//             flashes, glints, fine streaks and grains
//   solid.js  CPU-simulated instanced meshes on layer 0, lit and shadowed:
//             paper (FlatPool), candy stars (StarPool), blobs (BlobPool)
//   decals.js paint and mud stains laid on the ground
// recipes.js says what each ball throws. Everything is preallocated: a burst
// writes numbers into typed arrays and allocates nothing.
import * as THREE from 'three';
import { LAYER_SOFT } from '../post.js';
import { BALLS } from '../config.js';
import { GROUND_KIT, RAINBOW, CANDY, STAR_COLORS, JELLY_COLORS, makeNoiseTexture, makeSplatAtlas, randomColorIndex, rnd, rr, TAU } from './common.js';
import { sharedUniforms } from './materials.js';
import { SoftParticles } from './soft.js';
import { FlatPool, StarPool, BlobPool, K_JELLY, K_MUD, K_CLOD, K_CANDY } from './solid.js';
import { Decals } from './decals.js';
import { RECIPES, flashAndRing, debris, puff, glint, streak, flash, dot, dir, D, NO_FLOOR } from './recipes.js';

const EMPTY = Object.freeze({});
const _c = new THREE.Color();
const BALL_LIST = ['confetti', 'star', 'mud', 'snow', 'jelly', 'bouncy', 'triple'];
const GROUND_LIST = ['grass', 'sand', 'mud', 'snow', 'moss'];

// what the sky adds to shaded powder, by ground; the lead can override with setLighting()
const AMBIENT = {
  grass: [0.38, 0.46, 0.58],
  sand: [0.42, 0.4, 0.42],
  mud: [0.24, 0.28, 0.32],
  snow: [0.62, 0.62, 0.86],
  moss: [0.2, 0.28, 0.26],
};

// what flies off behind each ball: 0 confetti, 1 star, 2 snow, 3 jelly, 4 mud, 5 bouncy, 6 triple
const TRAIL_KIND = { confetti: 0, star: 1, snow: 2, jelly: 3, mud: 4, bouncy: 5, triple: 6 };
const TRAIL_STEP = [0.026, 0.02, 0.016, 0.026, 0.02, 0.028, 0.024];

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
    this.cr = 1;
    this.cg = 1;
    this.cb = 1;
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
    const hex = (BALLS[ball] && BALLS[ball].color) || 0xffffff;
    _c.setHex(hex);
    this.cr = _c.r;
    this.cg = _c.g;
    this.cb = _c.b;
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

  // a twinkle in the ball's colour, and something of the ball's own stuff, left hanging or falling
  emit(x, y, z, vx, vy) {
    const fx = this.fx;
    const S = fx.soft;
    const k = this.kind;
    const n = this.n++;
    const jx = x + rr(-0.005, 0.005);
    const jy = y + rr(-0.005, 0.005);
    const jz = z + rr(-0.005, 0.005);
    if (k === 0 || k === 4 || k === 5) {
      const ci = randomColorIndex(CANDY);
      if (k === 0) {
        const s = rr(0.006, 0.011);
        fx.flat.spawn(jx, jy, jz, rr(-0.1, 0.1) + vx * 0.05, rr(-0.02, 0.1), rr(-0.1, 0.1), s, s * rr(0.7, 1.2), rnd() < 0.3 ? 1 : 0, rnd() < 0.2 ? rr(1, 3) : 0, 0,
          CANDY[ci * 3], CANDY[ci * 3 + 1], CANDY[ci * 3 + 2], rr(1.2, 1.8), rr(11, 17), rr(3.4, 6), rr(0.5, 0.8), rr(1.5, 3), rr(8, 22));
      } else if (k === 5) {
        fx.blobs.spawn(K_CANDY, jx, jy, jz, rr(-0.1, 0.1), rr(-0.04, 0.12), rr(-0.1, 0.1), rr(0.0035, 0.0052), CANDY[ci * 3], CANDY[ci * 3 + 1], CANDY[ci * 3 + 2], rr(1.0, 1.5));
      } else {
        dot(S, jx, jy, jz, rr(-0.05, 0.05), rr(-0.03, 0.05), rr(-0.05, 0.05), rr(0.5, 0.9), rr(0.0035, 0.0055), this.cr, this.cg, this.cb, 1, 1.2, 0.6, 0.4, NO_FLOOR, 0.6, 0);
      }
      const t = 0.3 + 0.5 * rnd();
      const c0 = k === 4 ? this.cr : CANDY[ci * 3];
      const c1 = k === 4 ? this.cg : CANDY[ci * 3 + 1];
      const c2 = k === 4 ? this.cb : CANDY[ci * 3 + 2];
      glint(S, jx, jy, jz, rr(-0.05, 0.05), rr(-0.02, 0.07), rr(-0.05, 0.05), rr(0.3, 0.55), rr(0.008, 0.013), c0 * 1.2 + t * 0.3, c1 * 1.2 + t * 0.3, c2 * 1.2 + t * 0.3, 1, 3, 0.2, rr(20, 40));
    } else if (k === 1) {
      const ci = randomColorIndex(STAR_COLORS);
      glint(S, jx, jy, jz, rr(-0.05, 0.05), rr(-0.03, 0.06), rr(-0.05, 0.05), rr(0.5, 0.9), rr(0.009, 0.015), 0.6 + STAR_COLORS[ci * 3], 0.6 + STAR_COLORS[ci * 3 + 1], 0.6 + STAR_COLORS[ci * 3 + 2], 1, 2, 0.05, rr(25, 45));
      if ((n & 1) === 0) {
        const cj = randomColorIndex(STAR_COLORS);
        fx.stars.spawn(jx, jy, jz, rr(-0.12, 0.12) + vx * 0.04, rr(-0.03, 0.12), rr(-0.12, 0.12), rr(0.005, 0.008), STAR_COLORS[cj * 3], STAR_COLORS[cj * 3 + 1], STAR_COLORS[cj * 3 + 2], rr(1.0, 1.5), rr(5, 13));
      }
    } else if (k === 2) {
      // a small soft puff of powder, and flakes
      puff(S, jx, jy, jz, rr(-0.03, 0.03), rr(0, 0.05), rr(-0.03, 0.03), rr(0.4, 0.65), 0.006, rr(0.014, 0.022), 1.12, 1.12, 1.12, 0.8, 3, -0.03, 1, NO_FLOOR, 1, 0, 0.2);
      dot(S, jx, jy, jz, rr(-0.05, 0.05), rr(-0.02, 0.06), rr(-0.05, 0.05), rr(0.6, 1.1), rr(0.0022, 0.0038), 1, 1, 1, 1, 1.8, 0.05, 1.2, NO_FLOOR, 0.6, 0.8);
      if (n % 3 === 0) glint(S, jx, jy, jz, rr(-0.03, 0.03), rr(0, 0.05), rr(-0.03, 0.03), rr(0.5, 0.9), rr(0.008, 0.012), 1.15, 1.2, 1.3, 1, 1, 0.03, rr(20, 40));
    } else if (k === 3) {
      // drips of rainbow jelly
      const ci = randomColorIndex(JELLY_COLORS);
      fx.blobs.spawn(K_JELLY, jx, jy - 0.006, jz, rr(-0.06, 0.06), rr(-0.05, 0.05), rr(-0.06, 0.06), rr(0.0026, 0.0032), JELLY_COLORS[ci * 3], JELLY_COLORS[ci * 3 + 1], JELLY_COLORS[ci * 3 + 2], rr(1.0, 1.5));
      glint(S, jx, jy, jz, rr(-0.04, 0.04), rr(-0.03, 0.05), rr(-0.04, 0.04), rr(0.35, 0.6), rr(0.008, 0.013), JELLY_COLORS[ci * 3] * 1.2 + 0.2, JELLY_COLORS[ci * 3 + 1] * 1.2 + 0.2, JELLY_COLORS[ci * 3 + 2] * 1.2 + 0.2, 1, 3, 0.2, rr(20, 40));
    } else {
      const ci = randomColorIndex(RAINBOW);
      const s = rr(0.006, 0.01);
      fx.flat.spawn(jx, jy, jz, rr(-0.1, 0.1) + vx * 0.05, rr(-0.02, 0.1), rr(-0.1, 0.1), s, s * rr(0.7, 1.2), rnd() < 0.3 ? 1 : 0, 0, 0,
        RAINBOW[ci * 3], RAINBOW[ci * 3 + 1], RAINBOW[ci * 3 + 2], rr(1.2, 1.8), rr(11, 17), rr(3.4, 6), rr(0.5, 0.8), rr(1.5, 3), rr(8, 22));
      glint(S, jx, jy, jz, rr(-0.05, 0.05), rr(-0.02, 0.07), rr(-0.05, 0.05), rr(0.3, 0.55), rr(0.008, 0.013), 0.7 + RAINBOW[ci * 3], 0.7 + RAINBOW[ci * 3 + 1], 0.7 + RAINBOW[ci * 3 + 2], 1, 3, 0.2, rr(20, 40));
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
    };

    // everything we draw lives under one group, so warmup can compile just our own materials
    this.root = new THREE.Group();
    this.root.name = 'fx';
    scene.add(this.root);
    this.soft = new SoftParticles(this.root, softUniforms, noise, 3072);
    this.decals = new Decals(200, this.ctx);
    this.flat = new FlatPool(1400, this.ctx);
    this.stars = new StarPool(110, this.ctx);
    this.blobs = new BlobPool(620, this.ctx);
    this.root.add(this.decals.mesh, this.flat.mesh, this.stars.mesh, this.blobs.mesh);

    // the burst being built (reused)
    this.B = {
      x: 0, y: 0, z: 0, gy: 0, cm: 1, cmSoft: 1, sm: 1, zm: 1, bx: 0, debrisK: 1, great: false, ground: 'grass', kit: GROUND_KIT.grass, ball: 'confetti',
    };
    // delayed events (the second wave of a great hit)
    this.evN = 12;
    this.evT = new Float32Array(this.evN).fill(-1);
    this.evD = new Float32Array(this.evN * 12);
    // celebration fountains
    this.emN = 3;
    this.emT = new Float32Array(this.emN).fill(-1);
    this.emD = new Float32Array(this.emN * 5);
    this.trails = [new TrailHandle(this), new TrailHandle(this), new TrailHandle(this), new TrailHandle(this)];
    this.stats = { flat: 0, stars: 0, blobs: 0, decals: 0, soft: 0 };
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

  syncLight() {
    let dx = 0.4;
    let dy = 0.8;
    let dz = 0.3;
    let sr = 1;
    let sg = 0.95;
    let sb = 0.85;
    let amb = AMBIENT[this.world.ground] || AMBIENT.grass;
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
    }
    this.soft.setLight(dx, dy, dz, sr, sg, sb, amb[0], amb[1], amb[2]);
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
      opts.ground = GROUND_LIST[g % GROUND_LIST.length];
      this.burst(BALL_LIST[g], 0, gy + 0.02, 0, opts);
    }
    this.bounce('bouncy', 0, gy, 0, 1);
    this.split(0, gy + 0.1, 0);
    this.muzzle(0, gy + 0.1, 0, 1, 0.5, 'star');
    this.celebrate(0, gy, 0);
    this.sparkle(0, gy + 0.1, 0, 6, 0xffcc00);
    this.decals.add(0, 0, 0.03, 0.2, 0.1, 0.05, 0, 1);
    const t = this.trail('star');
    t.update(0, gy + 0.1, 0, 1, 0);
    t.update(0.1, gy + 0.12, 0, 1, 0);
    t.end();
    this.update(1 / 60);
    for (const p of [this.flat, this.stars, this.blobs, this.decals]) p.mesh.visible = true;
    this.soft.mesh.visible = true;
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
    this.stars.clear();
    this.blobs.clear();
    this.decals.clear();
    this.soft.clear();
    this.evT.fill(-1);
    this.emT.fill(-1);
    for (const t of this.trails) t.active = false;
  }

  setViewport(heightPx) {
    this.soft.setViewport(heightPx);
  }

  clearDecalsNear(x, z, r) {
    this.decals.clearNear(x, z, r);
  }

  // ------------------------------------------------------------------ API
  burst(ball, x, y, z, opts = EMPTY) {
    const world = this.world;
    const B = this.B;
    const recipe = RECIPES[ball] || RECIPES.confetti;
    const great = !!opts.great;
    const power = opts.power === undefined ? 0.75 : Math.max(0, Math.min(1, opts.power));
    const scale = opts.scale === undefined ? 1 : opts.scale;
    const ground = opts.ground || world.ground || 'grass';
    B.ball = ball;
    B.ground = ground;
    B.kit = GROUND_KIT[ground] || GROUND_KIT.grass;
    B.great = great;
    B.gy = world.heightAt(x, z);
    B.x = x;
    B.z = z;
    B.y = Math.max(y, B.gy + 0.004);
    // a hit high on a tank throws much less of the ground
    B.debrisK = B.y - B.gy > 0.06 ? 0.4 : 1;
    const ballScale = ball === 'triple' ? 0.62 : ball === 'bouncy' ? 0.78 : 1;
    const size = scale * ballScale;
    B.zm = size * (great ? 1.15 : 1);
    B.cm = this.q * (0.72 + 0.28 * power) * (great ? 1.5 : 1) * (0.35 + 0.65 * Math.min(1, size));
    B.cmSoft = (0.6 + 0.4 * this.q) * (0.75 + 0.25 * power) * (great ? 1.3 : 1) * (0.5 + 0.5 * Math.min(1, size));
    B.sm = (0.86 + 0.24 * power) * (great ? 1.1 : 1) * (0.55 + 0.45 * Math.min(1.2, size));
    const vx = opts.vx || 0;
    B.bx = Math.max(-0.45, Math.min(0.45, vx * 0.12));
    flashAndRing(this, B, ball === 'snow');
    recipe(this, B, false);
    debris(this, B, 1);
    if (great) this.schedule(0.085, ball, ground, 0);
    if (this.soft.endTime < this.time + 3) this.soft.endTime = this.time + 3;
  }

  // second wave of a great hit, a few frames after the first
  schedule(delay, ball, ground, type) {
    const B = this.B;
    for (let e = 0; e < this.evN; e++) {
      if (this.evT[e] >= 0) continue;
      this.evT[e] = this.time + delay;
      const o = e * 12;
      const d = this.evD;
      d[o] = B.x;
      d[o + 1] = B.y;
      d[o + 2] = B.z;
      d[o + 3] = B.gy;
      d[o + 4] = B.cm;
      d[o + 5] = B.cmSoft;
      d[o + 6] = B.sm;
      d[o + 7] = B.zm;
      d[o + 8] = B.bx;
      d[o + 9] = BALL_LIST.indexOf(ball);
      d[o + 10] = GROUND_LIST.indexOf(ground);
      d[o + 11] = type;
      return;
    }
  }

  runEvent(e) {
    const d = this.evD;
    const o = e * 12;
    const B = this.B;
    B.x = d[o];
    B.y = d[o + 1];
    B.z = d[o + 2];
    B.gy = d[o + 3];
    B.cm = d[o + 4] * 0.7;
    B.cmSoft = d[o + 5];
    B.sm = d[o + 6] * 0.92;
    B.zm = d[o + 7];
    B.bx = d[o + 8];
    B.ball = BALL_LIST[d[o + 9]] || 'confetti';
    B.ground = GROUND_LIST[d[o + 10]] || 'grass';
    B.kit = GROUND_KIT[B.ground];
    B.great = true;
    B.debrisK = 0.5;
    const S = this.soft;
    flash(S, B.x, B.y + 0.03, B.z, 0.1, 0.07 * B.zm, 1, 0.92, 0.75, 0.8);
    (RECIPES[B.ball] || RECIPES.confetti)(this, B, true);
  }

  bounce(ball, x, y, z, strength) {
    const S = this.soft;
    const gy = this.world.heightAt(x, z);
    const kit = GROUND_KIT[this.world.ground] || GROUND_KIT.grass;
    const s = Math.max(0.3, Math.min(1.4, strength === undefined ? 0.7 : strength));
    // a small ring of dust, a few glints and tiny paper bits: a happy little hop
    const n = 5;
    for (let k = 0; k < n; k++) {
      const a = ((k + rnd() * 0.7) / n) * TAU;
      const sp = rr(0.25, 0.5) * s;
      puff(S, x + Math.cos(a) * 0.01, gy + 0.004, z + Math.sin(a) * 0.01, Math.cos(a) * sp, rr(0.03, 0.1), Math.sin(a) * sp, rr(0.22, 0.36), 0.004 * s, rr(0.012, 0.02) * s,
        kit.dust[0], kit.dust[1], kit.dust[2], 0.3 * kit.dustAmt + 0.06, 4.5, 0.1, 0.6, gy + 0.005, 1, 0, 0.35);
    }
    const ng = Math.round(9 * s * (0.6 + 0.4 * this.q));
    for (let k = 0; k < ng; k++) {
      dir(0.3, 1, 1);
      const sp = rr(0.3, 1.1) * s;
      const ci = randomColorIndex(CANDY);
      glint(S, x, gy + 0.012, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.35, 0.7), rr(0.008, 0.014) * s, CANDY[ci * 3] * 1.2, CANDY[ci * 3 + 1] * 1.2, CANDY[ci * 3 + 2] * 1.2, 1, 3, 0.4, rr(24, 40));
    }
    const nc = Math.round(5 * s * this.q);
    for (let k = 0; k < nc; k++) {
      dir(0.35, 1, 1);
      const sp = rr(0.5, 1.2) * s;
      const ci = randomColorIndex(CANDY);
      const z0 = rr(0.004, 0.007);
      this.flat.spawn(x, gy + 0.01, z, D[0] * sp, D[1] * sp, D[2] * sp, z0, z0 * rr(0.7, 1.2), rnd() < 0.4 ? 1 : 0, 0, 0, CANDY[ci * 3], CANDY[ci * 3 + 1], CANDY[ci * 3 + 2], rr(2.5, 4), rr(8, 12), rr(1.6, 3), rr(0.8, 1.1), rr(1.5, 3), rr(8, 22));
    }
  }

  split(x, y, z) {
    const S = this.soft;
    flash(S, x, y, z, 0.16, 0.06, 1, 0.95, 0.85, 0.9);
    const n = Math.round(22 * (0.6 + 0.4 * this.q));
    for (let k = 0; k < n; k++) {
      const a = ((k + rnd() * 0.5) / n) * TAU;
      const ci = k % (RAINBOW.length / 3);
      const sp = rr(0.5, 1.3);
      glint(S, x, y, z, Math.cos(a) * sp, Math.sin(a) * sp * 0.8, rr(-0.3, 0.3), rr(0.45, 0.85), rr(0.009, 0.016), 0.7 + RAINBOW[ci * 3], 0.7 + RAINBOW[ci * 3 + 1], 0.7 + RAINBOW[ci * 3 + 2], 1, 3.2, 0.25, rr(24, 44));
    }
    // three bright stars pop out of the ring
    for (let k = 0; k < 3; k++) {
      const a = ((k + rnd() * 0.4) / 3) * TAU;
      const sp = rr(0.5, 0.9);
      const ci = randomColorIndex(STAR_COLORS);
      this.stars.spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 + 0.3, rr(-0.2, 0.2), rr(0.007, 0.01), STAR_COLORS[ci * 3], STAR_COLORS[ci * 3 + 1], STAR_COLORS[ci * 3 + 2], rr(2, 3), rr(5, 13));
    }
    const nc = Math.round(14 * this.q);
    for (let k = 0; k < nc; k++) {
      const a = rnd() * TAU;
      const sp = rr(0.4, 1.0);
      const ci = randomColorIndex(RAINBOW);
      const s = rr(0.006, 0.01);
      this.flat.spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp * 0.8, rr(-0.3, 0.3), s, s * rr(0.7, 1.2), rnd() < 0.4 ? 1 : 0, 0, 0, RAINBOW[ci * 3], RAINBOW[ci * 3 + 1], RAINBOW[ci * 3 + 2], rr(3, 5), rr(8, 12), rr(1.6, 3), 1, 2, rr(8, 20));
    }
  }

  // the toy pop at the barrel: a flash, a starburst of glints and a fan of the ball's own confetti (never smoke)
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
    const px = -uy;
    const py = ux;
    const hex = (BALLS[ball] && BALLS[ball].color) || 0xffffff;
    _c.setHex(hex);
    const k = TRAIL_KIND[ball] | 0;
    flash(S, x + ux * 0.012, y + uy * 0.012, z, 0.09, 0.03, 1, 0.95, 0.85, 0.8);
    // a ring of glints opening around the barrel's axis
    const nr = Math.round(8 * (0.6 + 0.4 * this.q));
    for (let i = 0; i < nr; i++) {
      const a = ((i + rnd() * 0.5) / nr) * TAU;
      const out = rr(0.35, 0.6);
      const tint = 0.4 + 0.6 * rnd();
      glint(S, x + ux * 0.012, y + uy * 0.012, z, ux * rr(0.1, 0.35) + px * Math.sin(a) * out, uy * rr(0.1, 0.35) + py * Math.sin(a) * out, Math.cos(a) * out, rr(0.25, 0.45), rr(0.008, 0.013),
        _c.r * 1.1 * tint + (1 - tint) * 0.9, _c.g * 1.1 * tint + (1 - tint) * 0.9, _c.b * 1.1 * tint + (1 - tint) * 0.9, 1, 3.5, 0.1, rr(26, 44));
    }
    // the fan
    const nf = Math.round(14 * (0.6 + 0.4 * this.q));
    for (let i = 0; i < nf; i++) {
      const spread = rr(-0.5, 0.5);
      const ca = Math.cos(spread);
      const sa = Math.sin(spread);
      const sp = rr(0.6, 1.7);
      const vx = (ux * ca - uy * sa) * sp;
      const vy = (uy * ca + ux * sa) * sp;
      const vz = rr(-0.4, 0.4);
      const ox = x + ux * 0.014;
      const oy = y + uy * 0.014;
      if (k === 1 && (i & 3) === 0) {
        const ci = randomColorIndex(STAR_COLORS);
        this.stars.spawn(ox, oy, z, vx * 0.7, vy * 0.7, vz, rr(0.005, 0.008), STAR_COLORS[ci * 3], STAR_COLORS[ci * 3 + 1], STAR_COLORS[ci * 3 + 2], rr(1.6, 2.4), rr(5, 13));
      } else {
        const pal = k === 6 || k === 3 ? RAINBOW : CANDY;
        const ci = randomColorIndex(pal);
        const w = rr(0.005, 0.009);
        const white = k === 2;
        this.flat.spawn(ox, oy, z, vx, vy, vz, w, w * rr(0.7, 1.2), white ? 2 : rnd() < 0.3 ? 1 : 0, 0, 0, white ? 1.1 : pal[ci * 3], white ? 1.1 : pal[ci * 3 + 1], white ? 1.15 : pal[ci * 3 + 2],
          rr(1.6, 2.4), rr(11, 17), rr(3.4, 6), rr(0.5, 0.8), rr(1.5, 3), rr(8, 22));
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
    return (t || oldest).begin(ball);
  }

  sparkle(x, y, z, count, color) {
    const S = this.soft;
    if (color === undefined) _c.setRGB(1, 0.9, 0.5);
    else _c.set(color);
    const n = Math.max(1, Math.round(count * (0.6 + 0.4 * this.q)));
    for (let k = 0; k < n; k++) {
      dir(-0.6, 1, 1);
      const sp = rr(0.25, 1.1);
      const tint = 0.5 + 0.5 * rnd();
      glint(S, x, y, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.6, 1.2), rr(0.009, 0.016), _c.r * tint + 0.6, _c.g * tint + 0.6, _c.b * tint + 0.6, 1, 2, 0.25, rr(20, 40));
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
    const S = this.soft;
    flash(S, x, y + 0.02, z, 0.18, 0.1, 1, 0.9, 0.7, 0.9);
    const n = Math.round(24 * (0.6 + 0.4 * this.q));
    for (let k = 0; k < n; k++) {
      dir(0.5, 1, 1);
      const sp = rr(0.6, 1.8);
      const ci = randomColorIndex(CANDY);
      glint(S, x, y + 0.02, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.7, 1.4), rr(0.007, 0.013), CANDY[ci * 3] * 1.2, CANDY[ci * 3 + 1] * 1.2, CANDY[ci * 3 + 2] * 1.2, 1, 2.2, 0.3, rr(20, 40));
    }
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
    this.decals.add(x, z, size, mudK ? r * 0.27 : r, mudK ? g * 0.27 : g, mudK ? b * 0.27 : b, cell, mudK ? 0.12 : 1);
    if (this.onSplat && R >= 0.0033) {
      _c.setRGB(r, g, b);
      const kd = pool.kind[i];
      this.onSplat(x, gy, z, size, _c.getHex(), kd === K_MUD ? 'mud' : kd === K_JELLY ? 'jelly' : 'paint');
    }
  }

  breakUp(pool, i, x, y, z, vx, vy, vz) {
    const S = this.soft;
    const R = pool.R[i];
    const C = pool.C;
    const nf = 5;
    for (let k = 0; k < nf; k++) {
      const j = pool.spawn(K_CLOD, x, y, z, vx * 0.3 + rr(-0.6, 0.6), vy * 0.25 + rr(0.1, 0.8), vz * 0.3 + rr(-0.6, 0.6), R * rr(0.28, 0.48), C[i * 3], C[i * 3 + 1], C[i * 3 + 2], rr(0.6, 1.0));
      pool.look(j, 0.85, 0.25, 0.35, 0.4, -1);
    }
    for (let k = 0; k < 2; k++) {
      puff(S, x, y, z, vx * 0.15 + rr(-0.1, 0.1), vy * 0.1 + rr(0, 0.15), vz * 0.15 + rr(-0.1, 0.1), rr(0.6, 0.9), R * 1.2, R * rr(3.4, 4.6), 1, 1, 1, 0.8, 3, 0.1, 1.6, this.world.heightAt(x, z) + R, 1);
    }
    for (let k = 0; k < 8; k++) {
      dir(0.05, 1, 1);
      const sp = rr(0.6, 1.6);
      streak(S, x, y, z, D[0] * sp, D[1] * sp, D[2] * sp, rr(0.4, 0.7), 0.0012, 0.02, 1.3, 1.3, 1.35, 0.9, 2.5, 0.5, 2, this.world.heightAt(x, z), 0.4);
    }
  }

  bounceTick(kd, x, gy, z, impact, R) {
    if (kd !== K_CLOD || impact < 0.55) return;
    const kit = GROUND_KIT[this.world.ground] || GROUND_KIT.grass;
    puff(this.soft, x, gy + 0.004, z, rr(-0.05, 0.05), rr(0.05, 0.15), rr(-0.05, 0.05), rr(0.35, 0.55), 0.006, 0.02 + R * 2, kit.dust[0], kit.dust[1], kit.dust[2], 0.22 * kit.dustAmt + 0.06, 4, 0.1, 0.8, gy + 0.005, 1);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (dt <= 0) dt = 0.0001;
    if (dt > 0.1) dt = 0.1;
    const world = this.world;
    this.time += dt;
    sharedUniforms.uTime.value = this.time;
    this.soft.time = this.time;
    this.syncLight();
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
      const rate = 95 * Math.min(1, left / 0.6 + 0.2) * this.q;
      this.emD[o + 3] += rate * dt;
      const S = this.soft;
      while (this.emD[o + 3] >= 1) {
        this.emD[o + 3] -= 1;
        const a = rnd() * TAU;
        const tilt = rr(0.02, 0.34);
        const sp = rr(1.7, 3.1);
        const ci = randomColorIndex(CANDY);
        const sx = rr(0.008, 0.014);
        const r = rnd();
        const strip = r < 0.15;
        this.flat.spawn(x, y + 0.02, z, Math.cos(a) * Math.sin(tilt) * sp, Math.cos(tilt) * sp, Math.sin(a) * Math.sin(tilt) * sp, strip ? sx * 2.2 : sx, strip ? sx * 0.24 : sx * rr(0.7, 1.2), r < 0.5 ? 0 : r < 0.65 ? 1 : r < 0.85 ? 2 : 4, strip ? rr(2, 4.5) : 0, rnd() < 0.25 ? 1 : 0,
          CANDY[ci * 3], CANDY[ci * 3 + 1], CANDY[ci * 3 + 2], rr(6, 9), rr(8, 12), rr(1.6, 3), rr(0.8, 1.1), rr(1.5, 3), rr(8, 22));
        if (rnd() < 0.3) {
          const c2 = randomColorIndex(CANDY);
          glint(S, x, y + 0.02, z, Math.cos(a) * Math.sin(tilt) * sp * 0.6, Math.cos(tilt) * sp * 0.6, Math.sin(a) * Math.sin(tilt) * sp * 0.6, rr(0.6, 1.2), rr(0.006, 0.011), CANDY[c2 * 3] * 1.2, CANDY[c2 * 3 + 1] * 1.2, CANDY[c2 * 3 + 2] * 1.2, 1, 1.8, 0.4, rr(20, 40));
        }
      }
    }
    this.decals.update(dt);
    this.flat.update(dt);
    this.stars.update(dt);
    this.blobs.update(dt);
    this.soft.update(this.time, world.gravity, world.wind);
  }

  get counts() {
    const s = this.stats;
    s.flat = this.flat.live;
    s.stars = this.stars.live;
    s.blobs = this.blobs.live;
    s.decals = this.decals.mesh.count;
    s.soft = this.soft.high;
    return s;
  }
}
