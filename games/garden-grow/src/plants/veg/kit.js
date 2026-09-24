// Small shared pieces for the vegetable plants: the springy wobble when a
// plant is tapped, hypocotyl hook curves, handing a harvested item over in
// world space, and per-plant geometries that share a species' buffers.
import * as THREE from 'three';
import { REDUCED_MOTION } from '../../config.js';

// A damped spring on two tilt angles (about x and z), for poke() and tugs.
export class Wobble {
  constructor({ stiffness = 55, damping = 4.2, amount = 0.14 } = {}) {
    this.k = stiffness;
    this.c = damping;
    this.amount = amount;
    this.x = 0;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
  }

  poke(scale = 1, dir = Math.random() * Math.PI * 2) {
    const s = this.amount * scale * (REDUCED_MOTION.matches ? 0.45 : 1) * Math.sqrt(this.k);
    this.vx += Math.cos(dir) * s;
    this.vz += Math.sin(dir) * s;
  }

  update(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vx += (-this.k * this.x - this.c * this.vx) * h;
      this.vz += (-this.k * this.z - this.c * this.vz) * h;
      this.x += this.vx * h;
      this.z += this.vz * h;
    }
  }

  get active() {
    return Math.abs(this.x) + Math.abs(this.z) + Math.abs(this.vx) * 0.1 + Math.abs(this.vz) * 0.1 > 1e-4;
  }
}

// Points along a seedling's hypocotyl: straight up from `base` for its first
// part, then bending over by `angle` (pi = the hook that pushes through the
// soil back first) in the direction `dir` (unit x/z). Writes into pts.
export function hookCurve(pts, base, length, hookLen, angle, dirX, dirZ) {
  const n = pts.length - 1;
  const ds = length / n;
  const straight = Math.max(0, length - hookLen);
  let x = base.x;
  let y = base.y;
  let z = base.z;
  pts[0].set(x, y, z);
  for (let i = 1; i <= n; i++) {
    const s = (i - 0.5) * ds;
    const th = s <= straight ? 0 : (angle * (s - straight)) / Math.max(1e-6, hookLen);
    const sn = Math.sin(th);
    x += sn * dirX * ds;
    z += sn * dirZ * ds;
    y += Math.cos(th) * ds;
    pts[i].set(x, y, z);
  }
  return pts;
}

// A geometry that shares a species' buffers but can carry its own
// per-instance attributes. Free it with disposeShared (never plain
// dispose(), which would free the shared buffers too).
export function shareGeometry(src) {
  const g = new THREE.BufferGeometry();
  g.setIndex(src.index);
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.morphAttributes = src.morphAttributes;
  g.morphTargetsRelative = src.morphTargetsRelative;
  if (src.boundingSphere) g.boundingSphere = src.boundingSphere.clone();
  return g;
}

export function disposeShared(g, shared) {
  for (const k of Object.keys(g.attributes)) if (shared.attributes[k] === g.attributes[k]) g.deleteAttribute(k);
  g.setIndex(null);
  g.dispose();
}

// Moves an object out of the plant into world space (no parent), keeping
// where it is on screen. Plants adds it to the scene.
export function toWorld(obj) {
  obj.updateWorldMatrix(true, false);
  const m = obj.matrixWorld.clone();
  obj.removeFromParent();
  m.decompose(obj.position, obj.quaternion, obj.scale);
  obj.updateMatrixWorld(true);
  return obj;
}

// Radius of a pick cylinder etc. growing with the plant.
export const grow = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
