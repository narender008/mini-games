// How a boat drives. Arcade physics tuned to feel like a real small boat,
// but kind: it always moves forward on its own, steering is smooth and
// forgiving with a little drift, it leans into turns, lifts its bow as it
// speeds up and bobs as it slows. It rides the swell; over a wave bump it
// floats up into a little hop and lands with a splash. Rocks, shores,
// jetties and other boats are soft bumpers: the boat bounces off gently and
// turns back towards open water, and it can never get stuck, beached or
// sunk.
import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep, angleDiff } from './config.js';

// Per boat: cruise speed for big kids and for little ones, boost speed (m/s),
// acceleration, turn rate (rad/s), grip (how fast sideways drift dies away),
// how far it leans into turns, how much the bow lifts, and how springy it is.
export const HANDLING = {
  speedboat: { cruise: 10.5, little: 8.2, boost: 15.5, accel: 2.6, turn: 0.95, grip: 2.1, bank: 1.0, lift: 1.0, bob: 1.0, hop: 1.0 },
  sailboat: { cruise: 8.6, little: 7.0, boost: 12.5, accel: 1.7, turn: 0.82, grip: 3.2, bank: 0.55, lift: 0.25, bob: 1.1, hop: 0.85 },
  duck: { cruise: 7.6, little: 6.6, boost: 11.5, accel: 2.2, turn: 1.12, grip: 2.7, bank: 0.5, lift: 0.35, bob: 1.5, hop: 1.1 },
  jetski: { cruise: 11.5, little: 8.8, boost: 16.5, accel: 3.3, turn: 1.25, grip: 1.55, bank: 1.7, lift: 0.7, bob: 0.9, hop: 1.15 },
};

const G_AIR = 7.2; // gravity while airborne: floaty
const G_HANG = 4.8; // near the top of a hop: floatier still

// a damped spring on one value (angle or offset)
class Spring {
  constructor(omega, zeta) {
    this.x = 0;
    this.v = 0;
    this.omega = omega;
    this.zeta = zeta;
  }

  step(target, dt) {
    const w = this.omega;
    const a = w * w * (target - this.x) - 2 * this.zeta * w * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
}

export class Boat {
  constructor({ shape, land, spec, id }) {
    this.shape = shape;
    this.land = land;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.heading = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.vy = 0;
    this.airborne = false;
    this.airTime = 0;
    this.surfVy = 0;
    this.climb = 0;
    this.lastSurf = 0;
    this.pitch = new Spring(5.5, 0.32);
    this.roll = new Spring(5, 0.3);
    this.heave = new Spring(6, 0.38);
    this.ringBoost = 0;
    this.boostHeld = false;
    this.boost01 = 0;
    this.assist = 0;
    this.assistHeading = 0;
    this.bumpCool = 0;
    this.slapCool = 0;
    this.accelSmooth = 0;
    this.speed = 0;
    this.little = true;
    this.events = { bump() {}, takeoff() {}, land() {}, slap() {} };
    this._n = { x: 0, z: 0 };
    this._g = { x: 0, z: 0 };
    this.setBoat(id, spec);
  }

  setBoat(id, spec) {
    this.id = id;
    this.spec = spec;
    this.h = HANDLING[id];
    this.radius = spec.beam * 0.5 + 0.35;
  }

  get fwdX() {
    return -Math.sin(this.heading);
  }

  get fwdZ() {
    return -Math.cos(this.heading);
  }

  place(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    const v = this.h.little * 0.6;
    this.vel.set(-Math.sin(heading) * v, -Math.cos(heading) * v);
    this.yawRate = 0;
    this.vy = 0;
    this.airborne = false;
    this.pitch.x = this.pitch.v = this.roll.x = this.roll.v = this.heave.x = this.heave.v = 0;
    this.lastSurf = this.shape.heightAt(x, z);
    this.pos.y = this.lastSurf;
    this.surfVy = 0;
    this.assist = 0;
  }

  targetSpeed() {
    const h = this.h;
    const base = this.little ? h.little : h.cruise;
    const top = h.boost;
    const b = Math.max(this.ringBoost, this.boostHeld ? 1 : 0);
    return lerp(base, top, b) * (1 - 0.12 * Math.abs(this.steer));
  }

  // surface height under the hull and its fore-aft / side slopes
  sampleSurface() {
    const s = this.shape;
    const L = this.spec.length * 0.42;
    const B = this.spec.beam * 0.45;
    const fx = this.fwdX;
    const fz = this.fwdZ;
    const rx = -fz;
    const rz = fx;
    const { x, z } = this.pos;
    const hb = s.heightAt(x + fx * L, z + fz * L);
    const hs = s.heightAt(x - fx * L, z - fz * L);
    const hr = s.heightAt(x + rx * B, z + rz * B);
    const hl = s.heightAt(x - rx * B, z - rz * B);
    const hc = s.heightAt(x, z);
    return {
      h: hc * 0.4 + (hb + hs + hr + hl) * 0.15,
      pitch: Math.atan2(hb - hs, 2 * L),
      roll: Math.atan2(hl - hr, 2 * B),
      bump: s.bumpHeight(x, z),
    };
  }

  // input: { steer: -1..1 (right +), boost: bool }
  update(dt, input) {
    const h = this.h;
    this.bumpCool = Math.max(0, this.bumpCool - dt);
    this.slapCool = Math.max(0, this.slapCool - dt);
    this.ringBoost = Math.max(0, this.ringBoost - dt * 0.55);
    this.boostHeld = !!input.boost;
    this.boost01 = damp(this.boost01, Math.max(this.ringBoost, this.boostHeld ? 1 : 0), 4, dt);

    // steering, with the bounce assist turning the boat back to open water
    let want = clamp(input.steer, -1, 1);
    if (this.assist > 0) {
      this.assist = Math.max(0, this.assist - dt);
      const d = angleDiff(this.heading, this.assistHeading);
      const k = smoothstep(0, 0.3, this.assist);
      want = lerp(want, clamp(-d * 3, -1, 1), k);
      if (Math.abs(d) < 0.12) this.assist = Math.min(this.assist, 0.3);
    }
    this.steer = damp(this.steer, want, 7, dt);
    const speed = this.vel.length();
    let turnK = clamp(speed / 4, 0.35, 1) * (this.airborne ? 0.35 : 1);
    // after a bump the boat swings round briskly, even while slow
    if (this.assist > 0 && !this.airborne) turnK = Math.max(turnK, 1) * 1.7;
    this.yawRate = damp(this.yawRate, -this.steer * h.turn * turnK, 3.2, dt);
    this.heading += this.yawRate * dt;

    // speed along the heading, drift sideways
    const fx = this.fwdX;
    const fz = this.fwdZ;
    const rx = -fz;
    const rz = fx;
    let vf = this.vel.x * fx + this.vel.y * fz;
    let vl = this.vel.x * rx + this.vel.y * rz;
    const prevVf = vf;
    if (!this.airborne) {
      let target = this.targetSpeed();
      // ease off while still pointing at whatever we bumped
      if (this.assist > 0) target *= clamp(1 - Math.abs(angleDiff(this.heading, this.assistHeading)) / 1.6, 0.25, 1);
      const up = h.accel * (1 + this.boost01 * 0.8);
      vf += clamp(target - vf, -1.6 * dt, up * dt);
      vl *= Math.exp(-h.grip * dt);
    } else {
      vl *= Math.exp(-0.3 * dt);
    }
    this.accelSmooth = damp(this.accelSmooth, (vf - prevVf) / Math.max(dt, 1e-4), 6, dt);
    this.vel.set(fx * vf + rx * vl, fz * vf + rz * vl);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.speed = Math.abs(vf);

    this.collide();

    // vertical: ride the surface, or fly
    const surf = this.sampleSurface();
    const sv = (surf.h - this.lastSurf) / Math.max(dt, 1e-4);
    this.lastSurf = surf.h;
    if (!this.airborne) {
      // over a crest: if the water was lifting us quickly and now falls
      // away, float up into a hop
      // remember how fast this wave lifted us
      if (sv > this.climb) this.climb = sv;
      if (sv < -0.2) this.climb = 0;
      if (this.climb > 0.5 && sv <= 0.05 && surf.bump > 0.12 && this.speed > 3) {
        const ramp = clamp(surf.bump / 0.42, 0.6, 2.4);
        this.vy = (this.climb * 0.8 + 1.25 * ramp) * h.hop;
        this.climb = 0;
        this.airborne = true;
        this.airTime = 0;
        this.events.takeoff(clamp(this.vy / 5, 0.2, 1));
      } else {
        this.heave.step(0, dt);
        this.pos.y = surf.h + this.heave.x * h.bob;
        if (Math.abs(sv - this.surfVy) > 1.2 && this.slapCool <= 0 && this.speed > 4) {
          this.events.slap(clamp(Math.abs(sv - this.surfVy) / 4, 0.1, 0.8));
          this.slapCool = 0.18;
        }
      }
      this.surfVy = damp(this.surfVy, sv, 18, dt);
    }
    if (this.airborne) {
      this.airTime += dt;
      const g = Math.abs(this.vy) < 1.1 ? G_HANG : G_AIR;
      this.vy -= g * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= surf.h && this.vy < 0) {
        const s = clamp(-this.vy / 5.5, 0.15, 1);
        this.airborne = false;
        this.pos.y = surf.h;
        this.heave.x = 0;
        this.heave.v = this.vy * 0.28;
        this.pitch.v -= 0.9 * s;
        this.surfVy = 0;
        this.vy = 0;
        this.events.land(s);
      }
    }

    // attitude: bow lift, lean into turns, the swell underneath, springs
    const v = this.speed;
    const planing = (0.075 * smoothstep(1, 5.5, v) * (1 - 0.55 * smoothstep(6, 11, v)) + 0.03 * smoothstep(3, 8, v)) * h.lift;
    const accelLift = clamp(this.accelSmooth * 0.018, -0.05, 0.07) * (0.5 + h.lift * 0.5) + this.boost01 * 0.035 * h.lift;
    let pitchT = planing + accelLift + surf.pitch * 0.8;
    let rollT = clamp(this.yawRate * v * 0.028 * h.bank, -0.32, 0.32) + surf.roll * 0.7;
    if (this.airborne) {
      pitchT = clamp(this.vy * 0.045, -0.1, 0.16);
      rollT *= 0.5;
    }
    this.pitch.step(pitchT, dt);
    this.roll.step(rollT, dt);
  }

  // Soft bumper-boat bounces against anything solid.
  collide() {
    const land = this.land;
    if (!land) return;
    const L = this.spec.length * 0.36;
    const fx = this.fwdX;
    const fz = this.fwdZ;
    const pts = [
      [0, this.radius],
      [L, this.spec.beam * 0.34 + 0.3],
      [-L, this.spec.beam * 0.42 + 0.3],
    ];
    let worst = 0;
    let wx = 0;
    let wz = 0;
    for (const [o, r] of pts) {
      const x = this.pos.x + fx * o;
      const z = this.pos.z + fz * o;
      const pen = r - land.distance(x, z);
      if (pen > worst) {
        worst = pen;
        wx = x;
        wz = z;
      }
    }
    if (worst <= 0) return;
    const n = land.gradient(wx, wz, this._n);
    // never stuck: push straight out
    this.pos.x += n.x * worst;
    this.pos.z += n.z * worst;
    const vn = this.vel.x * n.x + this.vel.y * n.z;
    if (vn < 0) {
      const e = 0.45;
      this.vel.x -= (1 + e) * vn * n.x;
      this.vel.y -= (1 + e) * vn * n.z;
      this.vel.multiplyScalar(0.82);
      const s = clamp(-vn / 7, 0, 1);
      if (s > 0.06 && this.bumpCool <= 0) {
        this.events.bump(s, wx, wz);
        this.bumpCool = 0.35;
        this.roll.v += (Math.random() < 0.5 ? -1 : 1) * 0.5 * s;
        this.pitch.v += 0.6 * s;
        this.heave.v += 0.5 * s;
      }
      // turn away along the shore, the short way round
      this.assistHeading = this.awayHeading(n);
      this.assist = 1.4;
    } else if (this.assist <= 0) {
      this.assistHeading = this.awayHeading(n);
      this.assist = 0.7;
    }
  }

  // a heading out from the shore (normal n) and along it, on the side the
  // boat is already facing
  awayHeading(n) {
    let tx = -n.z;
    let tz = n.x;
    if (tx * this.fwdX + tz * this.fwdZ < 0) {
      tx = -tx;
      tz = -tz;
    }
    const x = n.x + tx * 0.9;
    const z = n.z + tz * 0.9;
    return Math.atan2(-x, -z);
  }

  // Little ones: gently steer round shores before touching them (most of
  // the time), and drift towards a sparkle ring ahead.
  littleAssist(input, ring) {
    const land = this.land;
    const fx = this.fwdX;
    const fz = this.fwdZ;
    const look = clamp(this.speed * 1.9, 10, 22);
    const d = land.distance(this.pos.x + fx * look, this.pos.z + fz * look);
    let s = input.steer;
    if (d < 8) {
      const a = 0.6;
      // right-hand side is (-fz, fx)
      const rx = this.pos.x + (fx * Math.cos(a) - fz * Math.sin(a)) * look;
      const rz = this.pos.z + (fz * Math.cos(a) + fx * Math.sin(a)) * look;
      const lx = this.pos.x + (fx * Math.cos(a) + fz * Math.sin(a)) * look;
      const lz = this.pos.z + (fz * Math.cos(a) - fx * Math.sin(a)) * look;
      const dl = land.distance(lx, lz);
      const dr = land.distance(rx, rz);
      const k = smoothstep(8, 0, d) * 0.85;
      // while the child is steering the same way, let them
      s = lerp(s, dr > dl ? 1 : -1, input.active && Math.sign(input.steer) === (dr > dl ? 1 : -1) ? 0 : k);
    }
    if (ring && !input.active) {
      const dx = ring.x - this.pos.x;
      const dz = ring.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dx, -dz);
      const off = angleDiff(this.heading, want);
      if (dist < 45 && Math.abs(off) < 0.7) s = lerp(s, clamp(-off * 2.5, -0.6, 0.6), 0.5);
    }
    return s;
  }
}
