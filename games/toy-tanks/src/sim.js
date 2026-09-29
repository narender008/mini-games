// Ball flight. Balls fly under toy gravity and the wind, with a touch of air
// drag, on a fixed 240 Hz step so every flight is identical however fast the
// device draws (the dotted arc, the computer's aim and the real shot all
// agree). The picture is drawn between two steps, interpolated.
//
// A ball flies in the lane (z = 0) unless a triple ball has split, whose
// three little balls fan out a little in depth. It stops at the first thing
// it touches: the ground, a tank, a prop or a target. A bouncy ball bounces
// off the ground up to three times first.
import * as THREE from 'three';
import { GRAVITY, BALL_RADIUS, BALLS, POWER_MIN, POWER_MAX, clamp } from './config.js';

export const STEP = 1 / 240;
const DRAG = 0.04;
const MAX_FLIGHT = 9;

// Hit shapes. Each is { kind: 'sphere'|'box', x, y, z, r | hx, hy, hz, rot, ref }
// where rot is a rotation about y and ref is whatever the owner wants back.
export function hitShape(s, x, y, z, r) {
  if (s.kind === 'sphere') {
    const dx = x - s.x;
    const dy = y - s.y;
    const dz = z - s.z;
    return dx * dx + dy * dy + dz * dz <= (s.r + r) * (s.r + r);
  }
  // box, possibly turned about y
  let dx = x - s.x;
  let dz = z - s.z;
  if (s.rot) {
    const c = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    const lx = dx * c - dz * sn;
    dz = dx * sn + dz * c;
    dx = lx;
  }
  const dy = y - s.y;
  const qx = Math.max(0, Math.abs(dx) - s.hx);
  const qy = Math.max(0, Math.abs(dy) - s.hy);
  const qz = Math.max(0, Math.abs(dz) - s.hz);
  return qx * qx + qy * qy + qz * qz <= r * r;
}

export class Ball {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.live = false;
  }

  launch(kind, x, y, z, vx, vy, vz = 0) {
    this.kind = kind;
    this.spec = BALLS[kind];
    this.pos.set(x, y, z);
    this.prev.copy(this.pos);
    this.vel.set(vx, vy, vz);
    this.live = true;
    this.age = 0;
    this.bounces = this.spec.bounces ?? 0;
    this.split = !!this.spec.split;
    this.radius = BALL_RADIUS;
    this.child = false;
    this.spin = 0;
    // a ball leaving the barrel ignores its own tank for a moment
    this.grace = 0.12;
    return this;
  }
}

export class Flight {
  // world: { heightAt, normalAt, wind }, shapes(): the current hit shapes
  constructor(world) {
    this.world = world;
    this.balls = [];
    for (let i = 0; i < 4; i++) this.balls.push(new Ball());
    this.acc = 0;
    this.events = { impact: null, bounce: null, split: null };
    this.shapes = [];
    this._n = new THREE.Vector3();
  }

  get active() {
    return this.balls.some((b) => b.live);
  }

  fire(kind, x, y, vx, vy, shooter) {
    for (const b of this.balls) b.live = false;
    const b = this.balls[0].launch(kind, x, y, 0, vx, vy);
    b.shooter = shooter;
    return b;
  }

  // advance by dt (already slowed for slow motion); returns the fraction
  // between the last two steps, for drawing
  update(dt) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      for (const b of this.balls) if (b.live) this.step(b);
    }
    return this.acc / STEP;
  }

  step(b) {
    const w = this.world;
    b.prev.copy(b.pos);
    b.age += STEP;
    b.grace -= STEP;
    const ax = w.wind * b.spec.wind - DRAG * b.vel.x;
    const ay = -GRAVITY - DRAG * b.vel.y;
    b.vel.x += ax * STEP;
    b.vel.y += ay * STEP;
    b.vel.z *= 1 - 0.5 * STEP;
    b.pos.addScaledVector(b.vel, STEP);
    b.spin += b.vel.x * STEP / b.radius;
    // a triple ball splits just after the top of its arc
    if (b.split && b.vel.y < -0.15) {
      b.split = false;
      this.doSplit(b);
      return;
    }
    // things in the way (tanks, props, targets)
    for (const s of this.shapes) {
      if (s.ref === b.shooter && b.grace > 0) continue;
      if (hitShape(s, b.pos.x, b.pos.y, b.pos.z, b.radius)) {
        if (s.pass) {
          // bonus stars are collected, not hit
          if (!s.taken) {
            s.taken = true;
            this.events.collect?.(s, b);
          }
          continue;
        }
        this.impact(b, s);
        return;
      }
    }
    const g = w.heightAt(b.pos.x, b.pos.z);
    if (b.pos.y - b.radius <= g) {
      const n = w.normalAt(b.pos.x, b.pos.z, this._n);
      if (b.bounces > 0) {
        b.bounces--;
        b.pos.y = g + b.radius;
        // reflect about the ground's normal, losing some speed
        const vn = b.vel.dot(n);
        b.vel.addScaledVector(n, -1.68 * vn);
        b.vel.multiplyScalar(0.84);
        this.events.bounce?.(b, Math.min(1, Math.abs(vn) / 2.5));
        return;
      }
      b.pos.y = g + b.radius * 0.5;
      this.impact(b, null);
      return;
    }
    if (b.age > MAX_FLIGHT || b.pos.y < -3 || Math.abs(b.pos.x) > 30) {
      b.live = false;
      this.events.lost?.(b);
    }
  }

  doSplit(b) {
    const spare = this.balls.filter((x) => x !== b && !x.live);
    const spread = [-1, 1];
    for (let i = 0; i < 2 && i < spare.length; i++) {
      const c = spare[i].launch(b.kind, b.pos.x, b.pos.y, b.pos.z, b.vel.x * (1 + spread[i] * 0.2), b.vel.y + 0.1, spread[i] * 0.11);
      c.split = false;
      c.child = true;
      c.shooter = b.shooter;
      c.grace = 0;
      c.radius = BALL_RADIUS * 0.7;
    }
    b.child = true;
    b.radius = BALL_RADIUS * 0.7;
    this.events.split?.(b);
  }

  impact(b, shape) {
    b.live = false;
    this.events.impact?.(b, shape);
  }

  // The path a shot will take (no bounces or splits), for the dotted arc and
  // the computer's aim. Fills out with points (x, y pairs) every `every`
  // steps and returns how many points, plus the landing spot in `land`.
  predict(kind, x, y, vx, vy, out, every = 6, maxPoints = 200, land = null, shapes = null, shooter = null) {
    const w = this.world;
    const spec = BALLS[kind];
    let px = x;
    let py = y;
    let n = 0;
    let t = 0;
    for (let i = 0; i < MAX_FLIGHT / STEP; i++) {
      vx += (w.wind * spec.wind - DRAG * vx) * STEP;
      vy += (-GRAVITY - DRAG * vy) * STEP;
      px += vx * STEP;
      py += vy * STEP;
      t += STEP;
      if (i % every === 0 && n < maxPoints) {
        out[n * 2] = px;
        out[n * 2 + 1] = py;
        n++;
      }
      let hit = py - BALL_RADIUS <= w.heightAt(px, 0);
      if (!hit && shapes) {
        for (const s of shapes) {
          if (s.pass || (s.ref === shooter && t < 0.12)) continue;
          if (hitShape(s, px, py, 0, BALL_RADIUS)) {
            hit = s;
            break;
          }
        }
      }
      if (hit || Math.abs(px) > 30) {
        if (n < maxPoints) {
          out[n * 2] = px;
          out[n * 2 + 1] = py;
          n++;
        }
        if (land) {
          land.x = px;
          land.y = py;
          land.t = t;
          land.shape = hit === true ? null : hit || null;
        }
        return n;
      }
    }
    if (land) {
      land.x = px;
      land.y = py;
      land.t = t;
      land.shape = null;
    }
    return n;
  }
}

// launch velocity from an elevation (radians above horizontal, measured
// towards the tank's facing) and a power 0..1
export function launchVelocity(angle, power, facing, out) {
  const s = POWER_MIN + (POWER_MAX - POWER_MIN) * clamp(power, 0, 1);
  out.x = Math.cos(angle) * s * facing;
  out.y = Math.sin(angle) * s;
  return out;
}
