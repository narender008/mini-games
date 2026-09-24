// The watering can. It sits on the lawn when idle; when aimed it lifts and
// floats over the spot as if carried by a steady hand, the rose about 30 cm
// up and pointing at it, following with a soft lag. Pouring tips it forward
// and, after a beat, water sprays from every hole of the rose: fine threads
// that break into drops, fanning out and arcing down. Where they land the
// soil is wetted, the garden is told (onWater) and tiny crowns of droplets
// jump up. When it stops, a few last drips fall from the rose.
import * as THREE from 'three';
import { REDUCED_MOTION, clamp, damp, smooth } from '../config.js';
import { buildCanModel, roseHoles, ROSE } from './canmodel.js';
import { Drops, LAND_REPORT, LAND_SPLASH } from './drops.js';

const HOVER = 0.3; // rose height above the target
const POUR_TILT = -1.08; // radians the can tips forward to pour
const CARRY_TILT = -0.1; // held just a little nose-down while carried
const JET_SPEED = 1.15; // m/s out of the rose at full flow
const JET_RATE = 62; // drops per second per hole: enough for an unbroken thread
const DRAG = 1.8;
const SPRAY = 0.35; // stray droplets per jet drop: the fine spray round a rose

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YZX');

// A critically damped spring on a vector: smooth, no overshoot.
class Spring {
  constructor(w) {
    this.w = w;
    this.x = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.a = new THREE.Vector3();
  }

  step(target, dt) {
    const w = this.w;
    this.a.subVectors(target, this.x).multiplyScalar(w * w).addScaledVector(this.v, -2 * w);
    this.v.addScaledVector(this.a, dt);
    this.x.addScaledVector(this.v, dt);
  }
}

function angleDamp(a, b, lambda, dt) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return b - d * Math.exp(-lambda * dt);
}

export class WateringCan {
  constructor({ scene, quality, ground }) {
    this.scene = scene;
    this.quality = quality;
    this.ground = ground;
    this.onWater = null;
    const model = buildCanModel({ quality });
    this.object = model.group;
    this.parts = model.parts;
    scene.add(this.object);

    const groundAt = (x, z) => (this.ground ? this.ground.heightAt(x, z) : 0);
    const k = clamp(quality.particles ?? 1, 0.25, 1) * (REDUCED_MOTION.matches ? 0.6 : 1);
    // fewer holes on smaller devices keeps each jet an unbroken thread
    const holes = roseHoles();
    const keep = k > 0.8 ? 1 : k > 0.5 ? 0.7 : 0.45;
    this.holes = holes.filter((h, i) => i === 0 || ((i * 0.618) % 1) < keep);
    // no two holes run quite alike: a little faster or slower, a little off
    // line, and the odd one half blocked with grit
    for (const h of this.holes) {
      h.acc = Math.random();
      const blocked = Math.random() < 0.12;
      h.speed = blocked ? 0.55 + Math.random() * 0.2 : 0.88 + Math.random() * 0.22;
      h.rate = blocked ? 0.5 : 1;
      h.dir.x += (Math.random() - 0.5) * 0.07;
      h.dir.y += (Math.random() - 0.5) * 0.07;
      h.dir.z += (Math.random() - 0.5) * 0.07;
      h.dir.normalize();
    }
    this.fullRate = this.holes.length * JET_RATE;
    this.drops = new Drops(scene, { capacity: Math.ceil(this.fullRate * 0.75 * (1 + SPRAY) + 700), groundAt, gain: 1 });
    this.drops.uniforms.uFar.value = 2.4;
    this.drops.crownScale = REDUCED_MOTION.matches ? 0.6 : 1;
    this.landX = 0;
    this.landZ = 0;
    this.landN = 0;
    this.landW = 0;
    this.drops.onLand = (x, y, z, w) => {
      this.landX += x;
      this.landZ += z;
      this.landN++;
      this.landW += w;
    };

    // how far the water carries sideways from a rose HOVER up, so the rose
    // hangs back from the target by that much and the shower lands on it
    const ax = Math.cos(POUR_TILT + Math.atan2(ROSE.axis.y, ROSE.axis.x));
    const ay = Math.sin(POUR_TILT + Math.atan2(ROSE.axis.y, ROSE.axis.x));
    let t = 0;
    let y = HOVER;
    let vx = ax * JET_SPEED;
    let vy = ay * JET_SPEED;
    let x = 0;
    while (y > 0 && t < 2) {
      const h = 1 / 240;
      vy -= 9.81 * h;
      vx *= Math.exp(-DRAG * h);
      vy *= Math.exp(-DRAG * h);
      x += vx * h;
      y += vy * h;
      t += h;
    }
    this.reach = x;

    this.restPos = new THREE.Vector3();
    this.restYaw = 0;
    this.hasRest = false;
    this.target = null; // aimed spot on the ground
    this.aimSm = new THREE.Vector3();
    this.pouring = false;
    this.minPour = 0;
    this.flow = 0; // 0..1, read by the sound
    this.flowPeak = 0;
    this.drip = 0;
    this.resting = true;
    this.root = new Spring(REDUCED_MOTION.matches ? 5 : 7);
    this.yaw = 0;
    this.tilt = 0;
    this.tiltV = 0;
    this.lean = 0;
    this.roll = 0;
    this.time = 0;
    this.rosePos = new THREE.Vector3();
    this.roseVel = new THREE.Vector3();
    this.prevRose = new THREE.Vector3();
    this.roseAxis = new THREE.Vector3();
    this.roseUp = new THREE.Vector3();
    this.roseSide = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.side = new THREE.Vector3(-1, 0, 0);
  }

  // Where the can sits when it is not in use (layout.canRest), optionally
  // with the direction its spout points (layout.canRest[3]).
  rest(pos, yaw) {
    const y = Math.max(pos.y, this.ground ? this.ground.heightAt(pos.x, pos.z) : 0);
    this.restPos.set(pos.x, y, pos.z);
    // spout towards the garden, so from the camera it sits in three-quarter view
    const fx = -pos.x;
    const fz = -pos.z - 0.4;
    this.restYaw = yaw ?? Math.atan2(-fz, fx) + 0.25;
    if (!this.hasRest || (this.resting && !this.target)) {
      this.hasRest = true;
      this.resting = true;
      this.root.x.copy(this.restPos);
      this.root.v.set(0, 0, 0);
      this.yaw = this.restYaw;
      this.tilt = 0;
      this.tiltV = 0;
      this.pose();
    }
  }

  // Hover over a spot on the ground (a Vector3), or null to put it back down.
  aim(target) {
    if (!target) {
      this.target = null;
      return;
    }
    if (!this.target) {
      this.target = new THREE.Vector3();
      // glide from wherever the rose is now
      if (this.resting) this.aimSm.copy(target);
    }
    this.target.copy(target);
    this.resting = false;
  }

  pour(on) {
    if (on && !this.pouring) this.minPour = 0.5; // even a quick tap gives a little shower
    this.pouring = on;
  }

  // world transform from the current pose
  pose() {
    const o = this.object;
    o.position.copy(this.root.x);
    o.rotation.set(this.roll, this.yaw, this.tilt + this.lean, 'YZX');
    o.updateMatrixWorld(true);
  }

  update(dt, t, camera) {
    this.time += dt;
    if (dt <= 0) return;
    const reduced = REDUCED_MOTION.matches;
    const aimed = !!this.target;
    const pourWanted = aimed && (this.pouring || this.minPour > 0);

    // ---- where the can wants to be
    let tiltTarget = 0;
    if (aimed) {
      this.aimSm.x = damp(this.aimSm.x, this.target.x, 7, dt);
      this.aimSm.y = damp(this.aimSm.y, this.target.y, 7, dt);
      this.aimSm.z = damp(this.aimSm.z, this.target.z, 7, dt);
      // the body hangs to the side of the target (right, as held in a right
      // hand), turning the spout a little towards the camera near the right edge
      if (camera) {
        tmpV.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize(); // camera right
        tmpW.subVectors(camera.position, this.aimSm).setY(0).normalize(); // towards the camera
        const ndc = this.desired.copy(this.aimSm).project(camera).x;
        const k = 0.28 + 0.42 * smooth(0.05, 0.85, ndc);
        this.side.copy(tmpV).multiplyScalar(-(1 - k)).addScaledVector(tmpW, k).normalize();
      }
      const yawTarget = Math.atan2(-this.side.z, this.side.x);
      this.yaw = angleDamp(this.yaw, yawTarget, reduced ? 3 : 4.5, dt);
      tiltTarget = pourWanted ? POUR_TILT : CARRY_TILT;
    } else {
      this.yaw = angleDamp(this.yaw, this.restYaw, 3.5, dt);
    }
    // tilt: a slightly soft spring, so it settles like a held can
    const tw = reduced ? 5 : 7;
    this.tiltV += (tw * tw * (tiltTarget - this.tilt) - 1.7 * tw * this.tiltV) * dt;
    this.tilt += this.tiltV * dt;

    // rose position this pose would give, relative to the root
    tmpE.set(this.roll, this.yaw, this.tilt + this.lean, 'YZX');
    tmpQ.setFromEuler(tmpE);
    const roseOff = tmpW.copy(ROSE.pos).applyQuaternion(tmpQ);
    const want = this.desired;
    if (aimed) {
      want.copy(this.aimSm).addScaledVector(this.side, -this.reach);
      want.y += HOVER;
      if (!reduced) {
        // the gentle drift of a hand holding still
        want.x += Math.sin(this.time * 1.3) * 0.004;
        want.y += Math.sin(this.time * 1.7 + 1) * 0.005;
        want.z += Math.cos(this.time * 1.1) * 0.004;
      }
      want.sub(roseOff);
    } else {
      // back home: stay lifted until nearly there, then set down gently
      const d = Math.hypot(this.root.x.x - this.restPos.x, this.root.x.z - this.restPos.z);
      want.copy(this.restPos);
      want.y += 0.26 * smooth(0.03, 0.5, d);
    }
    // never come close to the lens
    if (camera) {
      tmpV.copy(want).y += 0.1;
      const dc = tmpV.distanceTo(camera.position);
      if (dc < 0.75) {
        tmpV.sub(camera.position).setY(0);
        if (tmpV.lengthSq() < 1e-6) tmpV.set(0, 0, -1);
        want.addScaledVector(tmpV.normalize(), 0.75 - dc);
      }
    }
    if (!this.resting) {
      this.root.step(want, dt);
      // floor: the foot never sinks into the ground
      const gy = this.ground ? this.ground.heightAt(this.root.x.x, this.root.x.z) : 0;
      if (this.root.x.y < gy) {
        this.root.x.y = gy;
        if (this.root.v.y < 0) this.root.v.y = 0;
      }
      // carried: it leans a touch with the hand's acceleration
      if (!reduced) {
        const a = this.root.a;
        const fwd = a.x * Math.cos(this.yaw) - a.z * Math.sin(this.yaw);
        const lat = a.x * Math.sin(this.yaw) + a.z * Math.cos(this.yaw);
        this.lean = damp(this.lean, clamp(-fwd * 0.012, -0.1, 0.1), 6, dt);
        this.roll = damp(this.roll, clamp(lat * 0.01, -0.08, 0.08), 6, dt);
      }
      // settled back home?
      if (!aimed) {
        const d = this.root.x.distanceTo(this.restPos);
        if (d < 0.002 && this.root.v.length() < 0.02 && Math.abs(this.tilt) < 0.01) {
          this.resting = true;
          this.root.x.copy(this.restPos);
          this.root.v.set(0, 0, 0);
          this.lean = this.roll = 0;
        }
      }
    }
    this.pose();

    // ---- the rose in the world
    const mw = this.object.matrixWorld;
    this.prevRose.copy(this.rosePos);
    this.rosePos.copy(ROSE.pos).applyMatrix4(mw);
    this.roseVel.subVectors(this.rosePos, this.prevRose).divideScalar(dt);
    if (this.roseVel.lengthSq() > 25) this.roseVel.set(0, 0, 0);
    this.roseAxis.copy(ROSE.axis).transformDirection(mw);
    this.roseUp.copy(ROSE.up).transformDirection(mw);
    this.parts.water.visible = Math.abs(this.tilt + this.lean) < 0.25;

    // ---- water: flows once the can has tipped far enough and is over the spot
    const tipped = this.tilt < POUR_TILT * 0.72;
    const near = aimed ? tmpV.copy(want).add(roseOff).distanceTo(this.rosePos) < 0.14 : false;
    const flowing = pourWanted && tipped && near;
    this.flow = flowing ? this.flow + (1 - this.flow) * (1 - Math.exp(-dt * 5)) : this.flow * Math.exp(-dt * 9);
    if (this.flow < 0.003) this.flow = 0;
    if (flowing && this.minPour > 0) this.minPour -= dt;
    if (!aimed) this.minPour = 0;
    if (this.flow > 0.02) this.emitShower(dt);
    // last drips from the rose after the flow stops
    this.flowPeak = Math.max(this.flowPeak * Math.exp(-dt * 0.5), this.flow);
    if (this.flow > 0.3) this.drip = 1;
    if (this.flow < 0.05 && this.drip > 0) {
      this.drip -= dt / 2.4;
      if (Math.random() < dt * 9 * this.drip * this.drip) this.emitDrip();
    }

    this.drops.update(dt);
    if (this.landN > 0) {
      const x = this.landX / this.landN;
      const z = this.landZ / this.landN;
      if (this.ground && this.landW > 0) this.ground.wet(x, z, 0.1, Math.min(1, this.landW * 1.6));
      if (this.onWater && this.landW > 0) this.onWater(x, z, this.landW);
      this.landX = this.landZ = this.landN = this.landW = 0;
    }
  }

  // Every hole sends out a thread of water; drops born through the frame are
  // spread over it, so the threads stay unbroken at any frame rate.
  emitShower(dt) {
    const mw = this.object.matrixWorld;
    const flow = this.flow;
    const speed = JET_SPEED * (0.35 + 0.65 * flow);
    const weight = 1 / this.fullRate;
    const vel = this.roseVel;
    for (const h of this.holes) {
      // the lowest holes run first while the rose fills, and last as it empties
      const need = 0.08 + 0.55 * (h.lift * 0.5 + 0.5);
      if (flow < need * 0.9) continue;
      h.acc += JET_RATE * h.rate * dt * Math.min(1, (flow - need * 0.9) * 6);
      if (h.acc < 1) continue;
      const p = tmpV.copy(h.pos).applyMatrix4(mw);
      const d = tmpW.copy(h.dir).transformDirection(mw);
      while (h.acc >= 1) {
        h.acc -= 1;
        const age = (h.acc / (JET_RATE * h.rate)) * 0.999;
        const jit = 0.03;
        const s = speed * h.speed * (0.95 + Math.random() * 0.1);
        const vx = (d.x + (Math.random() - 0.5) * jit) * s + vel.x * 0.85;
        const vy = (d.y + (Math.random() - 0.5) * jit) * s + vel.y * 0.85;
        const vz = (d.z + (Math.random() - 0.5) * jit) * s + vel.z * 0.85;
        const flags = LAND_REPORT | (Math.random() < 0.35 ? LAND_SPLASH : 0);
        const glint = -(0.5 + Math.random() * Math.random() * 1.8);
        const px = p.x - vel.x * age;
        const py = p.y - vel.y * age;
        const pz = p.z - vel.z * age;
        this.drops.emit(px, py, pz, vx, vy, vz, 0.0005 + Math.random() * 0.00025, DRAG, flags, weight, glint, age);
        if (Math.random() < SPRAY) {
          // a stray droplet flung a little off the jet's line
          const sj = 0.16;
          const ss = s * (0.75 + Math.random() * 0.35);
          this.drops.emit(px, py, pz, (d.x + (Math.random() - 0.5) * sj) * ss + vel.x * 0.85, (d.y + (Math.random() - 0.5) * sj) * ss + vel.y * 0.85, (d.z + (Math.random() - 0.5) * sj) * ss + vel.z * 0.85, 0.00022 + Math.random() * 0.0002, DRAG * 1.5, 0, 0, 0.8 + Math.random() * 1.2, age);
        }
      }
    }
  }

  emitDrip() {
    const mw = this.object.matrixWorld;
    // from a low hole: the water that is left gathers at the bottom of the face
    let h = this.holes[(Math.random() * this.holes.length) | 0];
    for (let i = 0; i < 3 && h.lift > -0.3; i++) h = this.holes[(Math.random() * this.holes.length) | 0];
    const p = tmpV.copy(h.pos).applyMatrix4(mw);
    const v = this.roseVel;
    this.drops.emit(p.x, p.y - 0.001, p.z, v.x * 0.5, v.y * 0.5 - 0.05, v.z * 0.5, 0.0013 + Math.random() * 0.0005, 1.2, LAND_REPORT | LAND_SPLASH, 0.004, 1.2);
  }
}
