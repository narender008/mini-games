// Pooled particles and short-lived effects (slashes, rings, flashes, damage numbers). They run on real
// time, so sparks keep flying during hit-stop, which sells the impact.
import Phaser from 'phaser';
import { DEPTH } from './roomView';
import type { Light } from './lighting';

interface Particle {
  img: Phaser.GameObjects.Image;
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  drag: number; grav: number;
  s0: number; s1: number; a0: number;
  spin: number; stretch: boolean;
  light: Light | null;
  alive: boolean;
}

export interface Burst {
  x: number; y: number; n: number;
  color: number | number[];
  speed: [number, number];
  life: [number, number];
  size?: [number, number]; // start, end scale in art px
  dir?: number; spread?: number; // radians
  drag?: number; grav?: number;
  tex?: 'px' | 'glow' | 'spark';
  add?: boolean; alpha?: number; stretch?: boolean;
  light?: number; // radius of a light carried by each particle (0 = none)
  up?: number; // initial upward velocity bias
}

const MAX = 700;

export class Fx {
  private pool: Particle[] = [];
  private live: Particle[] = [];
  private texts: { t: Phaser.GameObjects.Text; life: number; vy: number; alive: boolean }[] = [];
  lights: Light[] = [];
  reduced = false; // reduced flashes setting
  private effects: { img: Phaser.GameObjects.Image; life: number; max: number; update: (k: number, img: Phaser.GameObjects.Image) => void }[] = [];

  constructor(private scene: Phaser.Scene) {}

  private get(): Particle | null {
    let p = this.pool.pop();
    if (!p) {
      if (this.live.length >= MAX) return null;
      const img = this.scene.add.image(0, 0, 'px').setDepth(DEPTH.fx);
      p = { img, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, drag: 0, grav: 0, s0: 1, s1: 0, a0: 1, spin: 0, stretch: false, light: null, alive: false };
    }
    p.alive = true;
    p.img.setVisible(true);
    this.live.push(p);
    return p;
  }

  burst(b: Burst) {
    const rnd = (r: [number, number]) => r[0] + Math.random() * (r[1] - r[0]);
    for (let i = 0; i < b.n; i++) {
      const p = this.get();
      if (!p) return;
      const a = b.dir !== undefined ? b.dir + (Math.random() - 0.5) * (b.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
      const sp = rnd(b.speed);
      p.x = b.x; p.y = b.y;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (b.up ?? 0);
      p.max = p.life = rnd(b.life);
      p.drag = b.drag ?? 3; p.grav = b.grav ?? 0;
      const sz = b.size ?? [1, 0];
      const tex = b.tex ?? 'px';
      const base = tex === 'glow' ? 1 / 64 : 1 / 32;
      p.s0 = sz[0] * base; p.s1 = sz[1] * base;
      p.a0 = b.alpha ?? 1;
      p.spin = 0;
      p.stretch = !!b.stretch;
      const col = Array.isArray(b.color) ? b.color[Math.floor(Math.random() * b.color.length)] : b.color;
      p.img.setTexture(tex).setTint(col).setBlendMode(b.add === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
        .setScale(p.s0).setAlpha(p.a0).setRotation(p.stretch ? a : 0).setDepth(DEPTH.fx);
      if (b.light) { p.light = { x: p.x, y: p.y, r: b.light, color: col, i: 0.6 }; this.lights.push(p.light); } else p.light = null;
    }
  }

  /** A short image effect (slash arc, ring) driven by a progress callback k in 0..1. */
  effect(key: string, x: number, y: number, life: number, update: (k: number, img: Phaser.GameObjects.Image) => void, add = true, depth = DEPTH.fx) {
    const img = this.scene.add.image(x, y, key).setDepth(depth).setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    update(0, img);
    this.effects.push({ img, life: 0, max: life, update });
    return img;
  }

  number(x: number, y: number, text: string, color: string, big = false) {
    let rec = this.texts.find((t) => !t.alive);
    if (!rec) {
      if (this.texts.length > 40) return;
      const t = this.scene.add.text(0, 0, '', {
        fontFamily: 'Cinzel, Georgia, serif', fontSize: '36px', fontStyle: '700', color: '#fff', stroke: '#06070c', strokeThickness: 8,
      }).setOrigin(0.5).setDepth(DEPTH.ui);
      rec = { t, life: 0, vy: 0, alive: false };
      this.texts.push(rec);
    }
    rec.alive = true;
    rec.life = 0.7;
    rec.vy = -26;
    rec.t.setText(text).setColor(color).setPosition(x + (Math.random() - 0.5) * 6, y).setScale(big ? 0.3 : 0.22).setAlpha(1).setVisible(true);
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.img.setVisible(false);
        if (p.light) { p.light.i = 0; this.lights.splice(this.lights.indexOf(p.light), 1); p.light = null; }
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        this.pool.push(p);
        continue;
      }
      const f = Math.exp(-p.drag * dt);
      p.vx *= f; p.vy = p.vy * f + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * k;
      p.img.setPosition(p.x, p.y).setAlpha(p.a0 * (1 - k * k));
      if (p.stretch) {
        const sp = Math.hypot(p.vx, p.vy);
        p.img.setRotation(Math.atan2(p.vy, p.vx)).setScale(Math.max(s, s * sp / 60), s);
      } else p.img.setScale(s);
      if (p.light) { p.light.x = p.x; p.light.y = p.y; p.light.i = 0.6 * (1 - k); }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life += dt;
      const k = Math.min(1, e.life / e.max);
      e.update(k, e.img);
      if (k >= 1) { e.img.destroy(); this.effects.splice(i, 1); }
    }
    for (const r of this.texts) {
      if (!r.alive) continue;
      r.life -= dt;
      r.t.y += r.vy * dt;
      r.vy *= Math.exp(-4 * dt);
      r.t.setAlpha(Math.min(1, r.life / 0.25));
      if (r.life <= 0) { r.alive = false; r.t.setVisible(false); }
    }
  }

  clear() {
    for (const p of this.live) { p.alive = false; p.img.setVisible(false); this.pool.push(p); }
    this.live = [];
    this.lights.length = 0;
    for (const e of this.effects) e.img.destroy();
    this.effects = [];
    for (const r of this.texts) { r.alive = false; r.t.setVisible(false); }
  }

  get count() { return this.live.length; }

  destroy() {
    this.clear();
    for (const p of this.pool) p.img.destroy();
    this.pool = [];
    for (const r of this.texts) r.t.destroy();
    this.texts = [];
  }
}
