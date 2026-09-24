// Little moments: a joyful burst of petals that flutter down and settle,
// crumbs of soil popping up with a breath of dust when planting, a splash of
// droplets and soft twinkling glints for taps and magic. Four pooled draw
// calls in all (petals, crumbs, sprites, drops); nothing is allocated per
// effect.
import * as THREE from 'three';
import { REDUCED_MOTION, clamp } from '../config.js';
import { Petals, Clods } from './debris.js';
import { SpriteBatch, FRAME } from './sprites.js';
import { Drops, LAND_SPLASH } from './drops.js';
import { lightFor } from './light.js';

const tmpC = new THREE.Color();
const DUST = new THREE.Color(0.36, 0.28, 0.2);

export class Effects {
  // ground (optional): { heightAt(x, z) } so petals and crumbs settle on the
  // real surface; without it they settle at the height given to each burst.
  constructor({ scene, quality, ground = null }) {
    this.scene = scene;
    this.ground = ground;
    this.k = clamp(quality.particles ?? 1, 0.25, 1);
    const floorAt = (x, z) => (this.ground ? this.ground.heightAt(x, z) : 0);
    this.petals = new Petals(scene, Math.round(90 + 160 * this.k), floorAt);
    this.clods = new Clods(scene, Math.round(60 + 90 * this.k), floorAt);
    this.sprites = new SpriteBatch(scene, { capacity: 160, renderOrder: 9 });
    this.drops = new Drops(scene, { capacity: 512, groundAt: floorAt, renderOrder: 8 });
    this.drops.uniforms.uFar.value = 2.5;
  }

  get reduced() {
    return REDUCED_MOTION.matches;
  }

  // colors: an array of CSS colours (or one). `floor` (optional) is the
  // height petals settle at when there is no ground to ask.
  petalBurst(pos, colors = ['#ffffff'], count = 18, floor = null) {
    const list = Array.isArray(colors) ? colors : [colors];
    const n = Math.max(3, Math.round(count * this.k * (this.reduced ? 0.5 : 1)));
    const f = this.ground ? null : floor ?? 0;
    this.petals.burst(pos, list, n, { floor: f, gentle: this.reduced });
  }

  // crumbs popping up from the soil, and a breath of dust
  soilPuff(pos) {
    const n = Math.round(16 * this.k * (this.reduced ? 0.6 : 1)) + 4;
    const floor = this.ground ? null : pos.y;
    this.clods.puff(pos, n, { floor, gentle: this.reduced });
    const dusts = this.reduced ? 2 : 4;
    for (let i = 0; i < dusts; i++) {
      const p = this.sprites.spawn();
      const a = Math.random() * Math.PI * 2;
      p.x = pos.x + Math.cos(a) * 0.015;
      p.y = pos.y + 0.01 + Math.random() * 0.015;
      p.z = pos.z + Math.sin(a) * 0.015;
      p.vx = Math.cos(a) * 0.07;
      p.vz = Math.sin(a) * 0.07;
      p.vy = 0.06 + Math.random() * 0.06;
      p.drag = 1.8;
      p.size = 0.035 + Math.random() * 0.025;
      p.grow = 1.6;
      p.rot = Math.random() * 6.28;
      p.spin = (Math.random() - 0.5) * 0.6;
      p.life = 1.1 + Math.random() * 0.6;
      p.frame = FRAME.dust;
      p.r = DUST.r;
      p.g = DUST.g;
      p.b = DUST.b;
      p.a = 0.16 + Math.random() * 0.08;
      p.add = 0;
      p.lit = 1;
      p.fadeIn = 0.08;
    }
  }

  // a splash of droplets (they land and throw up tiny crowns of their own)
  splash(pos) {
    const n = Math.round(22 * this.k * (this.reduced ? 0.6 : 1)) + 6;
    const up = this.reduced ? 0.7 : 1;
    for (let i = 0; i < n; i++) {
      // a crown: most drops fly out low and wide, a few jump high
      const a = Math.random() * Math.PI * 2;
      const high = Math.random() < 0.25;
      const out = high ? 0.1 + Math.random() * 0.2 : 0.3 + Math.random() * 0.5;
      const vy = high ? 0.9 + Math.random() * 0.6 : 0.45 + Math.random() * 0.5;
      this.drops.emit(pos.x, pos.y + 0.003, pos.z, Math.cos(a) * out * up, vy * up, Math.sin(a) * out * up, 0.0006 + Math.random() * 0.0009, 2.5, LAND_SPLASH, 0, 1.8);
    }
  }

  // soft glints that twinkle and drift up (tap feedback, magic)
  sparkle(pos, color = '#fff6d8') {
    tmpC.set(color);
    const n = this.reduced ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const p = this.sprites.spawn();
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.05;
      p.x = pos.x + Math.cos(a) * r;
      p.y = pos.y + Math.random() * 0.05;
      p.z = pos.z + Math.sin(a) * r;
      p.vy = 0.04 + Math.random() * 0.08;
      p.vx = (Math.random() - 0.5) * 0.04;
      p.vz = (Math.random() - 0.5) * 0.04;
      p.size = 0.012 + Math.random() * 0.016;
      p.rot = Math.random() * 0.6;
      p.spin = (Math.random() - 0.5) * 1.2;
      p.life = 0.6 + Math.random() * 0.6;
      p.frame = i % 2 ? FRAME.star : FRAME.spark;
      const hot = 2.2 + Math.random() * 1.5;
      p.r = (tmpC.r * 0.7 + 0.3) * hot;
      p.g = (tmpC.g * 0.7 + 0.3) * hot;
      p.b = (tmpC.b * 0.7 + 0.3) * hot;
      p.a = 1;
      p.add = 1;
      p.fadeIn = 0.06 + Math.random() * 0.2;
      p.twinkle = this.reduced ? 0 : 14 + Math.random() * 10;
    }
  }

  update(dt) {
    if (dt <= 0) return;
    this.petals.update(dt);
    this.clods.update(dt);
    this.sprites.update(dt, lightFor(this.scene));
    this.drops.update(dt);
  }
}
