// Big kid shape challenges: a ghost outline of a small build (a bridge, an
// arch, a staircase, a pyramid or a castle) stands where the tower goes, and
// each ghost block lights up and fades once a real block of the same shape
// rests in its place. Everything sits in the z = 0 plane, facing the camera,
// so a challenge reads like a picture to copy.
import * as THREE from 'three';
import { SHAPES } from './shapes.js';

// Slot centres in metres: [shape, x, y]. y is the block's centre height when
// it rests upright (see shapes.js for sizes). Neighbours sit a couple of
// millimetres apart so real blocks fit side by side.
const T = 0.085; // castle tower spacing
export const CHALLENGES = {
  bridge: {
    name: 'Bridge',
    slots: [
      ['pillar', -0.045, 0.04],
      ['pillar', 0.045, 0.04],
      ['plank', 0, 0.09],
      ['cube', 0, 0.12],
    ],
  },
  arch: {
    name: 'Arch',
    slots: [
      ['cube', -0.03, 0.02],
      ['cube', 0.03, 0.02],
      ['cube', -0.03, 0.06],
      ['cube', 0.03, 0.06],
      ['arch', 0, 0.1],
      ['roof', 0, 0.14],
    ],
  },
  staircase: {
    name: 'Staircase',
    slots: [
      ['cube', -0.042, 0.02],
      ['cube', 0, 0.02],
      ['cube', 0.042, 0.02],
      ['cube', 0, 0.06],
      ['cube', 0.042, 0.06],
      ['cube', 0.042, 0.1],
    ],
  },
  pyramid: {
    name: 'Pyramid',
    slots: [
      ['brick', -0.082, 0.02],
      ['brick', 0, 0.02],
      ['brick', 0.082, 0.02],
      ['brick', -0.041, 0.06],
      ['brick', 0.041, 0.06],
      ['brick', 0, 0.1],
      ['roof', 0, 0.14],
    ],
  },
  castle: {
    name: 'Castle',
    slots: [
      ['cylinder', -T, 0.02],
      ['cylinder', T, 0.02],
      ['arch', 0, 0.02],
      ['cylinder', -T, 0.06],
      ['cylinder', T, 0.06],
      ['plank', 0, 0.05],
      ['cube', -0.04, 0.08],
      ['cube', 0.04, 0.08],
      ['cylinder', -T, 0.1],
      ['cylinder', T, 0.1],
      ['halfround', -T, 0.13],
      ['halfround', T, 0.13],
    ],
  },
};

export const CHALLENGE_IDS = Object.keys(CHALLENGES);

const POS_TOL = 0.011; // how far off a block may sit and still fill a slot
const DEPTH_TOL = 0.02;
const SIZE_TOL = 0.007;

const _m = new THREE.Matrix4();
const _up = new THREE.Vector3();

const UPRIGHT_ONLY = new Set(['roof', 'halfround', 'arch']);

// Whether a block of this shape, turned this way, looks like the ghost in
// its slot: a cube at any quarter turn, a brick, plank, pillar or cylinder
// upright or flipped, a roof, half-round or arch only upright. The drag
// snap and the check both ask this, so a block never snaps into a slot it
// would not fill.
export function fitsSlot(shapeId, quaternion) {
  if (shapeId === 'cube') return true;
  const up = _up.set(0, 1, 0).applyQuaternion(quaternion).y;
  return UPRIGHT_ONLY.has(shapeId) ? up > 0.9 : Math.abs(up) > 0.9;
}

// World-space bounding-box extents of a block in its current orientation.
function extents(shapeId, quaternion, out) {
  const [sx, sy, sz] = SHAPES[shapeId].size;
  _m.makeRotationFromQuaternion(quaternion);
  const e = _m.elements; // column-major
  out.x = Math.abs(e[0]) * sx + Math.abs(e[4]) * sy + Math.abs(e[8]) * sz;
  out.y = Math.abs(e[1]) * sx + Math.abs(e[5]) * sy + Math.abs(e[9]) * sz;
  out.z = Math.abs(e[2]) * sx + Math.abs(e[6]) * sy + Math.abs(e[10]) * sz;
  return out;
}

export class Challenges {
  constructor({ scene, factory }) {
    this.scene = scene;
    this.factory = factory;
    this.group = new THREE.Group();
    this.group.name = 'challenge-ghosts';
    scene.add(this.group);
    this.id = null;
    this.slots = [];
    this.material = factory.ghostMaterial();
    // the ghosts write depth, so the depth of field sees them where they
    // stand (not at the floor behind) and keeps them sharp; and they glow a
    // little brighter than the blocks' own highlights so they read in sun
    this.material.depthWrite = true;
    if (this.material.uniforms?.uColor) this.material.uniforms.uColor.value.multiplyScalar(1.8);
    this.time = 0;
    this._e = new THREE.Vector3();
  }

  get active() {
    return this.id !== null;
  }

  get name() {
    return this.id ? CHALLENGES[this.id].name : '';
  }

  set(id) {
    this.clear();
    if (!id || !CHALLENGES[id]) return;
    this.id = id;
    for (const [shape, x, y] of CHALLENGES[id].slots) {
      const mesh = new THREE.Mesh(this.factory.geometry(shape), this.material.clone());
      mesh.position.set(x, y, 0);
      mesh.renderOrder = 5;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      this.slots.push({ shape, x, y, mesh, filled: false, fade: 1, by: null });
    }
  }

  clear() {
    for (const s of this.slots) {
      this.group.remove(s.mesh);
      s.mesh.material.dispose();
    }
    this.slots = [];
    this.id = null;
  }

  // Start again with every slot empty (after a crash and tidy-up).
  reset() {
    const id = this.id;
    this.clear();
    if (id) this.set(id);
  }

  // Marks slots filled by resting blocks. `blocks` are { shapeId, position,
  // quaternion, settled } records. Returns the slots newly filled this call.
  check(blocks) {
    const fresh = [];
    for (const s of this.slots) s.by = null;
    for (const s of this.slots) {
      let hit = null;
      for (const b of blocks) {
        if (!b.settled || b.shapeId !== s.shape || b.used) continue;
        const p = b.position;
        if (Math.abs(p.x - s.x) > POS_TOL || Math.abs(p.y - s.y) > POS_TOL || Math.abs(p.z) > DEPTH_TOL) continue;
        const [sx, sy] = SHAPES[s.shape].size;
        extents(s.shape, b.quaternion, this._e);
        if (Math.abs(this._e.x - sx) > SIZE_TOL || Math.abs(this._e.y - sy) > SIZE_TOL) continue;
        if (!fitsSlot(s.shape, b.quaternion)) continue;
        hit = b;
        break;
      }
      if (hit) hit.used = true;
      s.by = hit;
      if (hit && !s.filled) fresh.push(s);
      s.filled = !!hit;
    }
    for (const b of blocks) b.used = false;
    return fresh;
  }

  get progress() {
    if (!this.slots.length) return 0;
    return this.slots.filter((s) => s.filled).length / this.slots.length;
  }

  get complete() {
    return this.slots.length > 0 && this.slots.every((s) => s.filled);
  }

  // The nearest empty slot a block of this shape, turned this way, fills,
  // within `reach` metres across the picture, so a release close to the
  // outline lands in it. Only a slot the block would come to rest in counts:
  // restAt(x) is the height its centre settles at if set down at x.
  snap(shapeId, quaternion, x, restAt, reach = 0.03) {
    if (!fitsSlot(shapeId, quaternion)) return null;
    let best = null;
    let bestD = reach;
    for (const s of this.slots) {
      if (s.filled || s.shape !== shapeId) continue;
      const d = Math.abs(s.x - x);
      if (d >= bestD || Math.abs(restAt(s.x) - s.y) > POS_TOL) continue;
      bestD = d;
      best = s;
    }
    return best;
  }

  // The lowest empty slot glows a little brighter, as a gentle hint of
  // where to start.
  update(dt) {
    this.time += dt;
    let hint = null;
    for (const s of this.slots) if (!s.filled && (!hint || s.y < hint.y - 0.001)) hint = s;
    for (const s of this.slots) {
      s.fade += ((s.filled ? 0 : 1) - s.fade) * Math.min(1, dt * 6);
      s.mesh.visible = s.fade > 0.02;
      const u = s.mesh.material.uniforms;
      const pulse = s === hint ? 0.25 + 0.2 * Math.sin(this.time * 3.2) : 0;
      if (u && u.uTime) u.uTime.value = this.time;
      if (u && u.uOpacity) u.uOpacity.value = s.fade * (0.9 + pulse);
      else s.mesh.material.opacity = s.fade * (0.35 + pulse * 0.4);
    }
  }
}
