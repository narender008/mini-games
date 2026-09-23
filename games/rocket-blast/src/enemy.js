// One toy enemy: where it is, how it wobbles, where its googly pupils are
// rolling, and how far through its squash-and-pop it has got. The enemy
// styles only read these fields to draw it.
import * as THREE from 'three';
import { TOY_COLORS, rand } from './config.js';

let nextId = 1;
const COLORS = TOY_COLORS.map((h) => new THREE.Color(h));

export class Enemy {
  constructor({ x = 0, y = 0, colorIndex = 0, size = 1, hp = 1, boss = false } = {}) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.size = size;
    this.hp = hp;
    this.maxHp = hp;
    this.boss = boss;
    this.colorIndex = colorIndex;
    this.color = COLORS[colorIndex % COLORS.length].clone();
    this.variant = Math.floor(Math.random() * 1000); // styles pick details from this
    this.scale = 0; // grows in with a bounce
    this.spawnT = 0;
    this.squash = 0;
    this.squashV = 0;
    this.tilt = 0;
    this.tiltX = 0;
    this.tiltY = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.blink = rand(1, 5);
    this.hitFlash = 0;
    this.alive = true; // can still be hit
    this.dying = false;
    this.dieT = 0;
    this.gone = false;
    // googly pupils: offset within the eye (unit disc) and velocity
    this.pupils = [0, 1].map(() => ({ x: 0, y: -0.3, vx: rand(-2, 2), vy: rand(-2, 2) }));
    this.lookX = 0;
    this.lookY = -1;
    this.formation = null;
    this.bottomPop = false;
  }

  // A hit that does not destroy: a jelly wobble and a flash.
  jiggle(strength = 1) {
    this.squashV += 9 * strength;
    this.hitFlash = 1;
    for (const p of this.pupils) {
      p.vx += rand(-6, 6) * strength;
      p.vy += rand(-6, 6) * strength;
    }
  }

  // Start the squash-and-pop. Returns false if it was already going.
  kill() {
    if (!this.alive) return false;
    this.alive = false;
    this.dying = true;
    this.dieT = 0;
    this.hitFlash = 1;
    this.squashV += 14;
    return true;
  }

  update(dt, t, look) {
    // grow in with an overshoot
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.2);
      const k = this.spawnT;
      this.scale = 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k) - (1 - k) ** 3;
      if (k >= 1) this.scale = 1;
    }
    // jelly squash spring
    this.squashV += (-this.squash * 160 - this.squashV * 7) * dt;
    this.squash += this.squashV * dt;
    this.squash = Math.max(-0.35, Math.min(0.45, this.squash));
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    // idle wobble
    const w = t * 2.1 + this.phase;
    this.tilt = Math.sin(w) * 0.06 + this.vx * 0.04;
    this.tiltX = Math.sin(w * 0.7) * 0.05;
    this.tiltY = Math.sin(w * 0.9 + 1) * 0.08;
    // blinking
    this.blink -= dt;
    if (this.blink < 0) this.blink = rand(2, 6);
    // pupils roll towards whatever the enemy is looking at, with googly slop
    if (look) {
      const dx = look.x - this.x;
      const dy = look.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.lookX = dx / d;
      this.lookY = dy / d;
    }
    for (const p of this.pupils) {
      const tx = this.lookX * 0.55;
      const ty = this.lookY * 0.55 - 0.15;
      p.vx += ((tx - p.x) * 55 - p.vx * 3.2) * dt;
      p.vy += ((ty - p.y) * 55 - p.vy * 3.2 - 6) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const r = Math.hypot(p.x, p.y);
      if (r > 1) {
        // bounce off the rim of the eye
        const nx = p.x / r;
        const ny = p.y / r;
        p.x = nx;
        p.y = ny;
        const vn = p.vx * nx + p.vy * ny;
        if (vn > 0) {
          p.vx -= 1.6 * vn * nx;
          p.vy -= 1.6 * vn * ny;
        }
      }
    }
    if (this.dying) {
      this.dieT += dt;
      // squash flat and wide, then shrink away inside the burst
      const k = this.dieT / 0.14;
      this.scale = k < 1 ? 1 + k * 0.15 : Math.max(0, 1.15 - (k - 1) * 3);
      if (this.dieT > 0.14 + 0.38) this.gone = true;
    }
  }
}
