// The camera: orbits, pans and zooms about a target within sensible limits
// (it never goes under the table or flies off into the room), eases back
// to each level's framing, and can ride along with one marble, swinging
// round behind it as it rolls.
import * as THREE from 'three';
import { clamp, damp } from './config.js';

const DEG = Math.PI / 180;

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3();
    this.az = 0;
    this.el = 0.3;
    this.dist = 1.2;
    this.want = { target: new THREE.Vector3(), az: 0, el: 0.3, dist: 1.2 };
    this.homeView = null;
    this.limits = { az: 75 * DEG, elMin: 4 * DEG, elMax: 62 * DEG, distMin: 0.28, distMax: 2.3, pan: 0.45 };
    this.following = false;
    this.followTarget = null;
    this.aspect = 1.6;
    this.baseFov = 34;
    this._v = new THREE.Vector3();
    this._dir = new THREE.Vector3(1, 0, 0);
  }

  setAspect(a) {
    this.aspect = a;
    this.camera.aspect = a;
    this.applyFov();
  }

  applyFov() {
    // a touch wider on tall screens, and pulled back so the run still fits
    const a = this.aspect;
    this.camera.fov = a < 1 ? this.baseFov + 10 : this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  setHome(view, limits) {
    this.homeView = {
      target: view.target.clone(),
      az: view.azimuth ?? view.az ?? 0,
      el: view.elevation ?? view.el ?? 0.3,
      dist: view.distance ?? view.dist ?? 1.2,
    };
    this.baseFov = view.fov ?? 34;
    if (limits) Object.assign(this.limits, limits);
    this.applyFov();
  }

  // how far back to sit so the framing survives a narrow (portrait) screen
  portraitScale() {
    return this.aspect < 1 ? clamp(1.05 / this.aspect, 1, 1.65) : this.aspect < 1.3 ? 1.12 : 1;
  }

  home(snap = false) {
    const h = this.homeView;
    this.stopFollow();
    this.want.target.copy(h.target);
    // on a tall screen, look down a little more and from a little to the
    // side, so the run's depth fills the height the width cannot give
    const tall = this.aspect < 1;
    this.want.az = h.az - (tall ? 0.2 : 0);
    this.want.el = h.el + (tall ? 0.26 : 0);
    this.want.dist = h.dist * this.portraitScale();
    if (snap) this.snap();
  }

  snap() {
    this.target.copy(this.want.target);
    this.az = this.want.az;
    this.el = this.want.el;
    this.dist = this.want.dist;
    this.place();
  }

  set({ azimuth, elevation, distance, target }) {
    if (azimuth !== undefined) this.want.az = azimuth;
    if (elevation !== undefined) this.want.el = elevation;
    if (distance !== undefined) this.want.dist = distance;
    if (target) this.want.target.copy(target);
    this.snap();
  }

  orbit(dAz, dEl) {
    const h = this.homeView;
    this.want.az = clamp(this.want.az + dAz, h.az - this.limits.az, h.az + this.limits.az);
    this.want.el = clamp(this.want.el + dEl, this.limits.elMin, this.limits.elMax);
  }

  zoom(k) {
    this.want.dist = clamp(this.want.dist * k, this.limits.distMin, this.limits.distMax * this.portraitScale());
  }

  // dx, dy: drag distance as a fraction of the screen height
  pan(dx, dy) {
    const cam = this.camera;
    const right = this._v.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const k = this.want.dist * Math.tan((cam.fov * DEG) / 2) * 2;
    this.want.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    const h = this.homeView.target;
    const off = this.want.target.clone().sub(h);
    if (off.length() > this.limits.pan) off.setLength(this.limits.pan);
    this.want.target.copy(h).add(off);
    this.want.target.y = Math.max(0.01, this.want.target.y);
  }

  follow(marble) {
    this.following = true;
    this.followTarget = marble;
    this._dir.set(Math.sin(this.az), 0, Math.cos(this.az)).negate();
  }

  stopFollow() {
    if (!this.following) return;
    this.following = false;
    this.followTarget = null;
    // ease back towards a comfortable distance, keeping the current angle
    this.want.target.copy(this.homeView.target);
    this.want.dist = Math.max(this.want.dist, this.homeView.dist * 0.7);
  }

  update(dt) {
    if (this.following && this.followTarget) {
      const m = this.followTarget;
      this.want.target.copy(m.pos);
      // swing round behind the marble's travel, slowly, so it never lurches
      const v = this._v.set(m.vel.x, 0, m.vel.z);
      if (v.lengthSq() > 0.01) this._dir.lerp(v.normalize(), 1 - Math.exp(-1.2 * dt)).normalize();
      const behind = Math.atan2(-this._dir.x, -this._dir.z);
      let d = behind - this.want.az;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.want.az += d * (1 - Math.exp(-0.8 * dt));
      this.want.el = damp(this.want.el, 24 * DEG, 1.5, dt);
      this.want.dist = damp(this.want.dist, 0.3, 1.5, dt);
    }
    const k = this.following ? 5 : 9;
    this.target.x = damp(this.target.x, this.want.target.x, k, dt);
    this.target.y = damp(this.target.y, this.want.target.y, k, dt);
    this.target.z = damp(this.target.z, this.want.target.z, k, dt);
    let d = this.want.az - this.az;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.az += d * (1 - Math.exp(-9 * dt));
    this.el = damp(this.el, this.want.el, 9, dt);
    this.dist = damp(this.dist, this.want.dist, 7, dt);
    this.place();
  }

  place() {
    const c = this.camera;
    const ce = Math.cos(this.el);
    c.position.set(this.target.x + Math.sin(this.az) * ce * this.dist, this.target.y + Math.sin(this.el) * this.dist, this.target.z + Math.cos(this.az) * ce * this.dist);
    if (c.position.y < 0.012) c.position.y = 0.012;
    c.lookAt(this.target);
  }

  focusDistance(point) {
    return this.following ? this.dist : this.camera.position.distanceTo(point || this.target);
  }
}
