// The camera: glides between shots (painting at the easel, the garden at
// play, the start screen) with an eased move that rises a little on the
// way, and breathes very slightly when still, like a handheld camera.
import * as THREE from 'three';
import { clamp, easeInOut, REDUCED_MOTION } from './config.js';

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
  }

  snap(shot) {
    this.pos.copy(shot.pos);
    this.look.copy(shot.look);
    this.fov = shot.fov;
    this.from = this.to = null;
    this.apply();
  }

  go(shot, dur = 1.4, lift = 0.15) {
    if (REDUCED_MOTION.matches) dur = Math.min(dur, 0.35);
    this.from = { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov };
    this.to = { pos: shot.pos.clone(), look: shot.look.clone(), fov: shot.fov };
    this.t = 0;
    this.dur = Math.max(0.01, dur);
    this.lift = lift;
  }

  get moving() {
    return !!this.to;
  }

  update(dt) {
    this.time += dt;
    if (this.to) {
      this.t += dt;
      const k = clamp(this.t / this.dur, 0, 1);
      const e = easeInOut(k);
      this.pos.lerpVectors(this.from.pos, this.to.pos, e);
      this.pos.y += Math.sin(k * Math.PI) * this.lift;
      this.look.lerpVectors(this.from.look, this.to.look, e);
      this.fov = this.from.fov + (this.to.fov - this.from.fov) * e;
      if (k >= 1) this.from = this.to = null;
    }
    this.offset.lerp(this.offsetTarget, 1 - Math.exp(-dt * 5));
    this.apply();
  }

  apply() {
    const c = this.camera;
    const b = REDUCED_MOTION.matches ? 0 : this.breathe;
    const t = this.time;
    c.position.copy(this.pos);
    c.position.x += Math.sin(t * 0.31) * 0.004 * b;
    c.position.y += Math.sin(t * 0.43 + 1) * 0.003 * b;
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
