// The chase camera: behind and a little above the boat, following its course
// smoothly. The horizon always stays level (no roll, no shake) and hops lift
// the view only a little, so nobody feels sick; with reduced motion it
// follows more calmly still. It pulls back a touch at speed, widens on narrow
// portrait screens so the boat never looks oversized, and slides in closer
// rather than disappear behind a house or into a hillside.
import * as THREE from 'three';
import { clamp, damp, smoothstep, angleDiff, REDUCED_MOTION } from './config.js';

export class ChaseCam {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.base = 0;
    this.dist = 10;
    this.frame = { distance: 10, height: 3.4, lookHeight: 1.1 };
    this.aspect = 1.6;
    this.fovKick = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.menu = false;
    this.orbit = 0;
  }

  setFrame(frame) {
    this.frame = { ...this.frame, ...frame };
  }

  setAspect(aspect) {
    this.aspect = aspect;
    // keep at least about 64 degrees across, whatever the screen shape
    const hfov = THREE.MathUtils.degToRad(64);
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    this.baseFov = clamp(vfov, 46, 74);
    this.camera.aspect = aspect;
    this.camera.fov = this.baseFov + this.fovKick;
    this.offset = -1;
    this.camera.updateProjectionMatrix();
  }

  // the boat's direction of travel (its course, drifting included)
  courseOf(boat) {
    const v = boat.vel;
    if (v.lengthSq() < 0.5) return boat.heading;
    const course = Math.atan2(-v.x, -v.y);
    return boat.heading + angleDiff(boat.heading, course) * 0.6;
  }

  snap(boat) {
    this.yaw = this.courseOf(boat);
    this.base = 0;
    this.dist = this.frame.distance;
    this.update(0, boat, null, true);
  }

  // on the start screen the boat shows in the band between the title and
  // the pictures, so the view is shifted down a little; on a tall portrait
  // screen the horizon rides higher so there is more water and less sky
  applyOffset() {
    const cam = this.camera;
    const want = this.menu ? 0.2 : this.aspect < 0.8 ? 0.1 : 0;
    if (want === this.offset) return;
    this.offset = want;
    if (want) cam.setViewOffset(1000 * this.aspect, 1000, 0, 1000 * want, 1000 * this.aspect, 1000);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  update(dt, boat, land, instant = false) {
    this.applyOffset();
    const calm = REDUCED_MOTION.matches;
    const f = this.frame;
    const portrait = this.aspect < 1;
    const k = instant ? 1e6 : 1;
    if (this.menu) {
      // on the start screen: a slow drift round the boat
      this.orbit += dt * 0.06;
      this.yaw = damp(this.yaw, boat.heading + 0.55 + Math.sin(this.orbit) * 0.25, 0.6 * k, dt);
    } else {
      const target = this.courseOf(boat);
      this.yaw += angleDiff(this.yaw, target) * (1 - Math.exp(-(calm ? 1.4 : 2.3) * k * dt));
    }
    const speed = boat.speed;
    const want = f.distance * (1 + 0.14 * smoothstep(6, 15, speed)) * (portrait ? 1.1 : 1) * (this.menu ? 0.95 : 1);
    this.dist = damp(this.dist, want, 1.5 * k, dt);
    // hops lift the camera only a little
    this.base = damp(this.base, Math.max(0, boat.pos.y) * (calm ? 0.2 : 0.35), 3 * k, dt);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let d = this.dist;
    let cx = boat.pos.x - fx * d;
    let cz = boat.pos.z - fz * d;
    let lift = 0;
    if (land) {
      // slide in rather than go through a wall or a hill
      for (let i = 0; i < 6 && land.distance(cx, cz) < 2.5 && d > f.distance * 0.45; i++) {
        d *= 0.88;
        lift += 0.35;
        cx = boat.pos.x - fx * d;
        cz = boat.pos.z - fz * d;
      }
    }
    this.lift = damp(this.lift ?? 0, lift, 3 * k, dt);
    this.pos.set(cx, this.base + f.height * (portrait ? 1.1 : 1) + this.lift, cz);
    const ahead = 4 + speed * 0.25;
    this.look.set(boat.pos.x + fx * ahead, this.base + f.lookHeight, boat.pos.z + fz * ahead);
    const cam = this.camera;
    if (instant) cam.position.copy(this.pos);
    else cam.position.lerp(this.pos, 1 - Math.exp(-12 * dt));
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    // a little wider during a boost or ring whoosh (not with reduced motion)
    const kick = calm ? 0 : boat.boost01 * 4;
    if (Math.abs(kick - this.fovKick) > 0.01) {
      this.fovKick = damp(this.fovKick, kick, 3, dt);
      cam.fov = this.baseFov + this.fovKick;
      cam.updateProjectionMatrix();
    }
  }

  // distance from the camera to the boat (for audio and focus)
  get distance() {
    return this.dist;
  }
}
