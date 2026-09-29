// The camera. Two ways to move it:
//  - go(shot, seconds): an eased glide to a fixed shot that rises a little on
//    the way (the painting, the start screen, a hello close-up);
//  - follow(fn): every frame fn(dt) says where the camera wants to be
//    ({ pos, look, fov }) and the rig eases there with critically damped
//    springs, so it can track a leaping or running friend the way a
//    cinematographer would: never snapping, never overshooting (an optional
//    avoid(pos) then keeps it out of trees and props on the way).
// Whichever is used, a still camera breathes very slightly, like a handheld
// one, and kick() gives a soft thump (a landing).
import * as THREE from 'three';
import { clamp, easeInOut, REDUCED_MOTION } from './config.js';

// critically damped smoothing of a number or vector towards a target
// (Unity's SmoothDamp): frame-rate independent, no overshoot
function smoothDampV(cur, target, vel, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  for (const a of ['x', 'y', 'z']) {
    const change = cur[a] - target[a];
    const temp = (vel[a] + omega * change) * dt;
    vel[a] = (vel[a] - omega * temp) * e;
    cur[a] = target[a] + (change + temp) * e;
  }
}

function smoothDamp(cur, target, state, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * e;
  return target + (change + temp) * e;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 1.4, 3);
    this.look = new THREE.Vector3(0, 0.8, 0);
    this.fov = 40;
    this.from = null;
    this.to = null;
    this.t = 0;
    this.dur = 1;
    this.time = 0;
    this.breathe = 1;
    this.offset = new THREE.Vector2(); // look-around from a drag (radians)
    this.offsetTarget = new THREE.Vector2();
    // follow mode
    this.fn = null;
    this.avoid = null; // (pos) => nudges the smoothed follow position out of props
    this.smooth = 0.5;
    this.lookSmooth = 0.35;
    this.vPos = new THREE.Vector3();
    this.vLook = new THREE.Vector3();
    this.vFov = { v: 0 };
    this.kickT = 0;
    this.kickA = 0;
    this._prev = new THREE.Vector3();
  }

  snap(shot) {
    this.pos.copy(shot.pos);
    this.look.copy(shot.look);
    this.fov = shot.fov;
    this.from = this.to = null;
    this.fn = null;
    this.vPos.set(0, 0, 0);
    this.vLook.set(0, 0, 0);
    this.apply();
  }

  go(shot, dur = 1.4, lift = 0.15) {
    if (REDUCED_MOTION.matches) dur = Math.min(dur, 0.35);
    this.fn = null;
    this.from = { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov };
    this.to = { pos: shot.pos.clone(), look: shot.look.clone(), fov: shot.fov };
    this.t = 0;
    this.dur = Math.max(0.01, dur);
    this.lift = lift;
  }

  // fn(dt) -> { pos, look, fov } (vectors it may reuse). smooth: seconds the
  // camera takes to catch up with the position, lookSmooth for where it looks
  follow(fn, { smooth = 0.5, lookSmooth = 0.35 } = {}) {
    this.from = this.to = null;
    this.fn = fn;
    this.smooth = REDUCED_MOTION.matches ? smooth * 0.6 : smooth;
    this.lookSmooth = lookSmooth;
  }

  stopFollow() {
    this.fn = null;
  }

  // a soft thump of the camera (a friend landing), amount in metres
  kick(amount = 0.012) {
    if (REDUCED_MOTION.matches) return;
    this.kickA = amount;
    this.kickT = 0;
  }

  get moving() {
    return !!this.to;
  }

  get following() {
    return !!this.fn;
  }

  update(dt) {
    this.time += dt;
    if (this.to) {
      this.t += dt;
      const k = clamp(this.t / this.dur, 0, 1);
      const e = easeInOut(k);
      this._prev.copy(this.pos);
      this.pos.lerpVectors(this.from.pos, this.to.pos, e);
      this.pos.y += Math.sin(k * Math.PI) * this.lift;
      this.look.lerpVectors(this.from.look, this.to.look, e);
      this.fov = this.from.fov + (this.to.fov - this.from.fov) * e;
      // carry the speed into a follow that may start next
      if (dt > 0) this.vPos.copy(this.pos).sub(this._prev).divideScalar(dt);
      if (k >= 1) this.from = this.to = null;
    } else if (this.fn) {
      const s = this.fn(dt);
      if (s) {
        smoothDampV(this.pos, s.pos, this.vPos, this.smooth, dt);
        this.avoid?.(this.pos);
        smoothDampV(this.look, s.look, this.vLook, this.lookSmooth, dt);
        this.fov = smoothDamp(this.fov, s.fov, this.vFov, this.smooth, dt);
      }
    }
    this.offset.lerp(this.offsetTarget, 1 - Math.exp(-dt * 5));
    if (this.kickA) {
      this.kickT += dt;
      if (this.kickT > 0.5) this.kickA = 0;
    }
    this.apply();
  }

  apply() {
    const c = this.camera;
    const b = REDUCED_MOTION.matches ? 0 : this.breathe;
    const t = this.time;
    c.position.copy(this.pos);
    c.position.x += Math.sin(t * 0.31) * 0.004 * b;
    c.position.y += Math.sin(t * 0.43 + 1) * 0.003 * b;
    if (this.kickA) c.position.y -= Math.sin(Math.min(1, this.kickT / 0.5) * Math.PI) * Math.exp(-this.kickT * 6) * this.kickA;
    c.lookAt(this.look);
    if (this.offset.lengthSq() > 1e-8) {
      c.rotateY(this.offset.x);
      c.rotateX(this.offset.y);
    }
    if (c.fov !== this.fov) {
      c.fov = this.fov;
      c.updateProjectionMatrix();
    }
  }
}
