// Small animation helpers: springs for follow-through, a blink scheduler,
// gait phases and easing for tricks. Bones in a friend's skeleton have no
// rest rotation, so a bone's rotation is always its pose relative to rest.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
// a bump that rises and falls over [a, b] of t
export const bump = (t, a, b) => {
  if (t <= a || t >= b) return 0;
  return Math.sin(((t - a) / (b - a)) * Math.PI);
};
// 0 before a, 1 after b, smooth between
export const ramp = (t, a, b) => smooth((t - a) / (b - a));
export const easeOutBack = (t, s = 1.8) => {
  t = clamp(t, 0, 1) - 1;
  return t * t * ((s + 1) * t + s) + 1;
};
// damped wobble after an event at t=0: amplitude 1, settles over ~dur
export const wobble = (t, freq = 3, dur = 0.8) => (t < 0 ? 0 : Math.sin(t * freq * TAU) * Math.exp((-t * 4.6) / dur));

// A critically damped (or springy, with zeta < 1) spring for one number.
export class Spring {
  constructor(value = 0, freq = 3, zeta = 0.6) {
    this.x = value;
    this.v = 0;
    this.freq = freq;
    this.zeta = zeta;
  }

  update(target, dt) {
    const w = this.freq * TAU;
    // semi-implicit Euler in small steps keeps it stable at 30 fps
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = w * w * (target - this.x) - 2 * this.zeta * w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  kick(v) {
    this.v += v;
  }
}

export class Spring3 {
  constructor(freq = 3, zeta = 0.6) {
    this.s = [new Spring(0, freq, zeta), new Spring(0, freq, zeta), new Spring(0, freq, zeta)];
    this.value = new THREE.Vector3();
  }

  update(target, dt) {
    this.value.set(this.s[0].update(target.x, dt), this.s[1].update(target.y, dt), this.s[2].update(target.z, dt));
    return this.value;
  }

  set(v) {
    for (let i = 0; i < 3; i++) {
      this.s[i].x = v.getComponent(i);
      this.s[i].v = 0;
    }
    this.value.copy(v);
  }
}

// Blinks every few seconds (sometimes twice), each blink quick to close and
// a little slower to open, like a real one.
export class Blinker {
  constructor() {
    this.timer = 1 + Math.random() * 3;
    this.t = -1;
    this.double = false;
    this.hold = 0; // >0 keeps the eyes closed (sleepy, happy squint)
  }

  update(dt) {
    this.timer -= dt;
    if (this.t < 0 && this.timer <= 0) {
      this.t = 0;
      this.double = Math.random() < 0.2;
    }
    let c = 0;
    if (this.t >= 0) {
      this.t += dt;
      const d = 0.16;
      c = this.t < d * 0.4 ? this.t / (d * 0.4) : 1 - (this.t - d * 0.4) / (d * 0.6);
      if (this.t >= d) {
        if (this.double) {
          this.double = false;
          this.t = 0;
        } else {
          this.t = -1;
          this.timer = 2 + Math.random() * 4;
        }
      }
    }
    return Math.max(clamp(c, 0, 1), this.hold);
  }
}

// set a bone's pose from Euler angles (radians)
export function pose(bone, x = 0, y = 0, z = 0) {
  if (bone) bone.rotation.set(x, y, z);
}

// add to a bone's pose
export function addPose(bone, x = 0, y = 0, z = 0) {
  if (!bone) return;
  bone.rotation.x += x;
  bone.rotation.y += y;
  bone.rotation.z += z;
}

// Rotate a bone about an axis given in the friend's rest space (for lids and
// eyes set at an angle), after its Euler pose.
const _q = new THREE.Quaternion();
export function axisPose(bone, axis, angle) {
  if (!bone) return;
  _q.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(_q);
}

// Two-bone planar IK in a bone chain's own side plane (y-z), for legs: given
// the hip-to-foot distance wanted, returns the hip and knee bend angles.
export function twoBone(l1, l2, dist) {
  const d = clamp(dist, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const a1 = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const a2 = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  return [a1, Math.PI - a2];
}
