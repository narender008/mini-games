// The camera: a patient film crew. It frames a box in the lane (both tanks
// while aiming, the ball and where it will land while it flies, the splash
// up close when it lands) from a low three-quarter view, like the picture,
// and moves between framings on critically damped springs, so every move
// eases in and out and a new framing picked mid-move blends in smoothly.
// Distance is worked out from the screen's shape, so a phone held upright
// sees the same action as a laptop, just from further back (within reason).
import * as THREE from 'three';
import { clamp, REDUCED_MOTION } from './config.js';

// critically damped spring towards `to` (after Game Programming Gems 4, 1.10)
class Spring {
  constructor(v = 0) {
    this.v = v;
    this.vel = 0;
    this.to = v;
  }

  update(dt, time) {
    const omega = 2 / Math.max(0.0001, time);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.v - this.to;
    const temp = (this.vel + omega * change) * dt;
    this.vel = (this.vel - omega * temp) * exp;
    this.v = this.to + (change + temp) * exp;
    return this.v;
  }

  snap(v) {
    this.v = this.to = v;
    this.vel = 0;
  }
}

export class Director {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.aspect = 1.6;
    this.tx = new Spring(0);
    this.ty = new Spring(0.05);
    this.tz = new Spring(0);
    this.dist = new Spring(1.8);
    this.yaw = new Spring(0.12);
    this.pitch = new Spring(0.14);
    // how quickly each framing is reached, seconds (roughly)
    this.pace = 0.9;
    this.shakeAmt = 0;
    this.time = 0;
    this.focus = 1.8;
    this.minDist = 0.45;
    this.maxDist = 2.8;
    this.menu = false;
    this._look = new THREE.Vector3();
  }

  setAspect(a) {
    this.aspect = a;
    this.camera.aspect = a;
    // a little wider on tall screens, so the lane still fits
    this.camera.fov = a < 1 ? 44 : a < 1.4 ? 38 : 34;
    this.camera.updateProjectionMatrix();
  }

  // Frame the part of the lane from x0 to x1 and y0 to y1 (metres).
  // opts: yaw, pitch (radians), pace (seconds), margin, lift (move the
  // picture's centre up, as a fraction of the box height)
  frame(x0, x1, y0, y1, opts = {}) {
    const margin = opts.margin ?? 1.18;
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const h = Math.atan(Math.tan(v) * this.aspect);
    const w = ((x1 - x0) / 2) * margin;
    const hh = ((y1 - y0) / 2) * margin;
    let d = Math.max(w / Math.tan(h), hh / Math.tan(v));
    d = clamp(d, opts.minDist ?? this.minDist, opts.maxDist ?? this.maxDist);
    this.tx.to = (x0 + x1) / 2 + (opts.shiftX ?? 0);
    this.ty.to = (y0 + y1) / 2 + (y1 - y0) * (opts.lift ?? 0);
    this.tz.to = opts.z ?? 0;
    this.dist.to = d;
    if (opts.yaw !== undefined) this.yaw.to = opts.yaw;
    if (opts.pitch !== undefined) this.pitch.to = opts.pitch;
    this.pace = opts.pace ?? 0.9;
  }

  snap() {
    for (const s of [this.tx, this.ty, this.tz, this.dist, this.yaw, this.pitch]) s.snap(s.to);
  }

  // a small, soft nudge on a big hit (not a shake that rattles the picture)
  shake(amount) {
    if (REDUCED_MOTION.matches) return;
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  update(dt) {
    this.time += dt;
    const p = this.pace;
    const x = this.tx.update(dt, p);
    const y = this.ty.update(dt, p);
    const z = this.tz.update(dt, p);
    const d = this.dist.update(dt, p * 1.15);
    let yaw = this.yaw.update(dt, p * 1.3);
    let pitch = this.pitch.update(dt, p * 1.3);
    // a slow breathing drift, as if the camera were hand-held very steadily
    if (!REDUCED_MOTION.matches) {
      yaw += Math.sin(this.time * 0.21) * 0.012 + (this.menu ? Math.sin(this.time * 0.07) * 0.22 : 0);
      pitch += Math.sin(this.time * 0.17 + 1) * 0.006;
    }
    const cam = this.camera;
    const cp = Math.cos(pitch);
    cam.position.set(x + Math.sin(yaw) * cp * d, y + Math.sin(pitch) * d, z + Math.cos(yaw) * cp * d);
    // never dip into a hill or the grass in front
    const ground = this.world.heightAt(cam.position.x, cam.position.z) + 0.04;
    if (cam.position.y < ground) cam.position.y = ground;
    this._look.set(x, y, z);
    if (this.shakeAmt > 0.0001) {
      const s = this.shakeAmt;
      this._look.x += Math.sin(this.time * 31) * s * 0.004;
      this._look.y += Math.sin(this.time * 37 + 1) * s * 0.004;
      this.shakeAmt *= Math.exp(-dt * 6);
    }
    cam.lookAt(this._look);
    this.focus = cam.position.distanceTo(this._look);
  }
}
