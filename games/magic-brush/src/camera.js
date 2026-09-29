// The camera. Two ways to move it, both of which start from wherever the camera
// is AND however fast it is going, so no shot ever interrupts another with a
// jerk:
//  - go(shot, seconds): a glide to a fixed shot that rises a little on the
//    way (the painting, the start screen, a hello close-up). A quintic move
//    (no jerk at either end) plus a decaying carry of the speed it had;
//  - follow(fn): every frame fn(dt) says where the camera wants to be
//    ({ pos, look, fov }) and the rig eases there through two critically
//    damped stages in a row, so even when the goal jumps (a new shot, a friend
//    turning a corner) the camera's speed AND acceleration change smoothly. It
//    can track a leaping or running friend the way a cinematographer would:
//    never snapping, never overshooting. An optional avoid(pos) says where a
//    tree or prop would push the camera; that push is applied as a soft offset
//    of its own, never as a step.
// Whichever is used, a still camera breathes very slightly, like a handheld
// one, and kick() gives a soft thump (a landing).
import * as THREE from 'three';
import { clamp, REDUCED_MOTION } from './config.js';
import { smoother, dsmoother, smoothDamp, smoothDampV } from './smooth.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 1.4, 3);
    this.look = new THREE.Vector3(0, 0.8, 0);
    this.fov = 40;
    this.vPos = new THREE.Vector3(); // how fast each is changing (per second)
    this.vLook = new THREE.Vector3();
    this.vFov = { v: 0 };
    this.time = 0;
    this.breathe = 1;
    this.offset = new THREE.Vector2(); // look-around from a drag (radians)
    this.offsetTarget = new THREE.Vector2();
    this.vOffset = [{ v: 0 }, { v: 0 }];
    // go mode
    this.from = null;
    this.to = null;
    this.t = 0;
    this.dur = 1;
    this.lift = 0;
    // follow mode: the goal is chased by a middle stage, which the camera chases
    this.fn = null;
    this.smooth = 0.5;
    this.lookSmooth = 0.35;
    this.smoothWant = 0.5;
    this.lookSmoothWant = 0.35;
    this.mid = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
    this.vMid = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: { v: 0 } };
    this.avoid = null; // (pos) => nudges the given position out of props
    this.pushOff = new THREE.Vector3(); // the smoothed nudge, added when the camera is placed
    this.vPush = new THREE.Vector3();
    this.pushMid = new THREE.Vector3(); // (through two stages, like the camera itself)
    this.vPushMid = new THREE.Vector3();
    this.kickT = 0;
    this.kickA = 0;
  }

  snap(shot) {
    this.pos.copy(shot.pos);
    this.look.copy(shot.look);
    this.fov = shot.fov;
    this.from = this.to = null;
    this.fn = null;
    this.vPos.set(0, 0, 0);
    this.vLook.set(0, 0, 0);
    this.vFov.v = 0;
    this.pushOff.set(0, 0, 0);
    this.vPush.set(0, 0, 0);
    this.pushMid.set(0, 0, 0);
    this.vPushMid.set(0, 0, 0);
    this.apply();
  }

  go(shot, dur = 1.4, lift = 0.15) {
    if (REDUCED_MOTION.matches) dur = Math.min(dur, 0.35);
    this.fn = null;
    this.from = { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov, vp: this.vPos.clone(), vl: this.vLook.clone(), vf: this.vFov.v };
    this.to = { pos: shot.pos.clone(), look: shot.look.clone(), fov: shot.fov };
    this.t = 0;
    this.dur = Math.max(0.01, dur);
    this.lift = lift;
  }

  // fn(dt) -> { pos, look, fov } (vectors it may reuse). smooth: seconds the
  // camera takes to catch up with the position, lookSmooth for where it looks.
  // Called again while following, it only changes the goal and how eagerly the
  // camera chases it (which itself eases in).
  follow(fn, { smooth = 0.5, lookSmooth = 0.35 } = {}) {
    const k = REDUCED_MOTION.matches ? 0.6 : 1;
    this.smoothWant = smooth * k;
    this.lookSmoothWant = lookSmooth;
    if (!this.fn) {
      // from rest or from a glide: the middle stage runs ahead of the camera by
      // as much as it would in a steady move, so its speed carries straight on
      this.smooth = this.smoothWant;
      this.lookSmooth = this.lookSmoothWant;
      this.from = this.to = null;
      this.mid.pos.copy(this.pos).addScaledVector(this.vPos, this.smooth * 0.5);
      this.vMid.pos.copy(this.vPos);
      this.mid.look.copy(this.look).addScaledVector(this.vLook, this.lookSmooth * 0.5);
      this.vMid.look.copy(this.vLook);
      this.mid.fov = this.fov + this.vFov.v * this.smooth * 0.5;
      this.vMid.fov.v = this.vFov.v;
    }
    this.fn = fn;
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
    let push = null;
    if (this.to) {
      this.t += dt;
      const k = clamp(this.t / this.dur, 0, 1);
      const s = smoother(k);
      const ds = dsmoother(k) / this.dur;
      // the speed it had carries on and dies away by the end (a cubic that meets
      // the end still and with no acceleration)
      const c = this.t * (1 - k) * (1 - k) * (1 - k);
      const dc = (1 - k) * (1 - k) * (1 - 4 * k);
      const { from: f, to } = this;
      this.pos.lerpVectors(f.pos, to.pos, s).addScaledVector(f.vp, c);
      this.vPos.copy(to.pos).sub(f.pos).multiplyScalar(ds).addScaledVector(f.vp, dc);
      // the lift is a bump that rises and falls with no jerk
      const kb = k < 0.5 ? 2 * k : 2 - 2 * k;
      this.pos.y += smoother(kb) * this.lift;
      this.vPos.y += (k < 0.5 ? 2 : -2) * (dsmoother(kb) / this.dur) * this.lift;
      this.look.lerpVectors(f.look, to.look, s).addScaledVector(f.vl, c);
      this.vLook.copy(to.look).sub(f.look).multiplyScalar(ds).addScaledVector(f.vl, dc);
      this.fov = f.fov + (to.fov - f.fov) * s + f.vf * c;
      this.vFov.v = (to.fov - f.fov) * ds + f.vf * dc;
      if (k >= 1) {
        this.pos.copy(to.pos);
        this.look.copy(to.look);
        this.fov = to.fov;
        this.vPos.set(0, 0, 0);
        this.vLook.set(0, 0, 0);
        this.vFov.v = 0;
        this.from = this.to = null;
      }
    } else if (this.fn) {
      const s = this.fn(dt);
      if (s) {
        const e = 1 - Math.exp(-dt * 3);
        this.smooth += (this.smoothWant - this.smooth) * e;
        this.lookSmooth += (this.lookSmoothWant - this.lookSmooth) * e;
        const tp = this.smooth * 0.5;
        const tl = this.lookSmooth * 0.5;
        smoothDampV(this.mid.pos, s.pos, this.vMid.pos, tp, dt);
        smoothDampV(this.pos, this.mid.pos, this.vPos, tp, dt);
        smoothDampV(this.mid.look, s.look, this.vMid.look, tl, dt);
        smoothDampV(this.look, this.mid.look, this.vLook, tl, dt);
        this.mid.fov = smoothDamp(this.mid.fov, s.fov, this.vMid.fov, tp, dt);
        this.fov = smoothDamp(this.fov, this.mid.fov, this.vFov, tp, dt);
        if (this.avoid) {
          _a.copy(this.pos);
          this.avoid(_a);
          push = _b.copy(_a).sub(this.pos);
        }
      }
    }
    // the nudge out of props eases in and out like everything else
    smoothDampV(this.pushMid, push || _b.set(0, 0, 0), this.vPushMid, 0.14, dt);
    smoothDampV(this.pushOff, this.pushMid, this.vPush, 0.14, dt);
    // (the look-around eases like the rest: a critically damped follow of where a drag asks)
    this.offset.x = smoothDamp(this.offset.x, this.offsetTarget.x, this.vOffset[0], 0.2, dt);
    this.offset.y = smoothDamp(this.offset.y, this.offsetTarget.y, this.vOffset[1], 0.2, dt);
    if (this.kickA) {
      this.kickT += dt;
      if (this.kickT > 0.6) this.kickA = 0;
    }
    this.apply();
  }

  apply() {
    const c = this.camera;
    const b = REDUCED_MOTION.matches ? 0 : this.breathe;
    const t = this.time;
    c.position.copy(this.pos).add(this.pushOff);
    c.position.x += Math.sin(t * 0.31) * 0.004 * b;
    c.position.y += Math.sin(t * 0.43 + 1) * 0.003 * b;
    if (this.kickA) {
      // a dip that starts from rest, bottoms out fast and eases back
      const u = this.kickT / 0.12;
      c.position.y -= u * u * Math.exp(2 - 2 * u) * this.kickA * 0.4;
    }
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
