// Shared helpers for flying visitors: where they come from and go to, how
// they find their flower again each frame (plants rebuild their targets),
// and how they are kept over the garden and clear of the camera lens.
import * as THREE from 'three';
import { PLANTS } from '../config.js';

// The air the visitors keep to while they are in the garden.
export const VOLUME = { x0: -2, x1: 2, y0: 0.05, y1: 1.6, z0: -1.5, z1: 1 };
export const LENS_CLEARANCE = 0.6;

const _v = new THREE.Vector3();
const _ndc = new THREE.Vector3();

// Is a world point comfortably outside the camera's view?
export function offscreen(p, camera, margin = 1.08) {
  if (!camera) return Math.abs(p.x) > 2.6 || p.y > 2.4;
  _ndc.copy(p).project(camera);
  return _ndc.z > 1 || Math.abs(_ndc.x) > margin || Math.abs(_ndc.y) > margin;
}

// A point just off-screen at one side (or high up at the back), never
// towards the camera, to arrive from or leave to.
export function offscreenPoint(out, camera, side = Math.random() < 0.5 ? -1 : 1, high = false) {
  if (high) out.set((Math.random() - 0.5) * 2, 2.2 + Math.random() * 0.4, -2.2 - Math.random() * 0.8);
  else out.set(side * (2.6 + Math.random() * 0.4), 0.45 + Math.random() * 0.9, -1.5 + Math.random() * 1.6);
  // push further out until it is really out of view (wide screens)
  for (let k = 0; k < 12 && camera && !offscreen(out, camera, 1.12); k++) {
    if (high) out.y += 0.4;
    else out.x += side * 0.5;
  }
  return out;
}

// Plants may hand out a fresh targets list each frame: find the entry for
// the same spot again (same plant and kind, nearest to where it was).
export function refind(targets, plant, kind, lastPos, maxDist = 0.08) {
  if (!targets) return null;
  let best = null;
  let bd = maxDist * maxDist;
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k];
    if (t.plant !== plant || t.kind !== kind) continue;
    const d = t.pos.distanceToSquared(lastPos);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

function speciesOf(plant) {
  if (!plant) return null;
  const s = plant.species;
  return typeof s === 'string' ? s : s?.id ?? null;
}

// Picks a landing spot: flowers that attract this visitor are favoured,
// nearer ones a little, and spots another visitor holds are skipped.
// `taken(t)` says whether a spot is held; `prefer` is an optional species.
export function chooseTarget(targets, kinds, visitor, from, taken, avoid = null, prefer = null) {
  if (!targets || !targets.length) return null;
  let total = 0;
  const w = chooseTarget.w || (chooseTarget.w = []);
  w.length = 0;
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k];
    let weight = 0;
    if (kinds.includes(t.kind) && t !== avoid && !(avoid && t.plant === avoid.plant && t.pos.distanceToSquared(avoid.pos) < 0.0009) && !taken(t)) {
      weight = 1;
      const sp = speciesOf(t.plant);
      if (sp && PLANTS[sp]?.attracts?.includes(visitor)) weight *= 4;
      if (prefer && sp === prefer) weight *= 12;
      if (from) weight *= 1 / (0.4 + t.pos.distanceTo(from));
      // keep off spots right under the lens
      if (t.pos.z > VOLUME.z1) weight *= 0.1;
    }
    w.push(weight);
    total += weight;
  }
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (let k = 0; k < targets.length; k++) {
    r -= w[k];
    if (r <= 0 && w[k] > 0) return targets[k];
  }
  return null;
}

// A gentle push back into the garden volume (added to a desired velocity).
export function keepInside(p, out, strength = 1.5) {
  const V = VOLUME;
  if (p.x < V.x0) out.x += (V.x0 - p.x) * strength;
  if (p.x > V.x1) out.x += (V.x1 - p.x) * strength;
  if (p.y < V.y0 + 0.1) out.y += (V.y0 + 0.1 - p.y) * strength * 2;
  if (p.y > V.y1) out.y += (V.y1 - p.y) * strength;
  if (p.z < V.z0) out.z += (V.z0 - p.z) * strength;
  if (p.z > V.z1) out.z += (V.z1 - p.z) * strength;
  return out;
}

// Keeps a point at least LENS_CLEARANCE from the camera.
export function clearLens(p, camera) {
  if (!camera) return;
  _v.subVectors(p, camera.position);
  const d = _v.length();
  if (d < LENS_CLEARANCE && d > 1e-6) p.copy(camera.position).addScaledVector(_v, LENS_CLEARANCE / d);
}

// A random point to wander to over the garden.
export function wanderPoint(out, low = 0.25, high = 1.0) {
  return out.set(-1.6 + Math.random() * 3.2, low + Math.random() * (high - low), -1.3 + Math.random() * 1.8);
}

// Smooth-ish noise from a few sines (cheap, no allocation).
export function wave(t, a, b, c) {
  return Math.sin(t * 0.83 + a) * 0.5 + Math.sin(t * 1.91 + b) * 0.32 + Math.sin(t * 3.37 + c) * 0.18;
}

// Orientation from a forward direction and an up hint (body frame: +z
// forward, +y up), written into a quaternion.
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
export function basis(forward, up, outQuat) {
  _z.copy(forward).normalize();
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x).normalize();
  _m.makeBasis(_x, _y, _z);
  return outQuat.setFromRotationMatrix(_m);
}

export const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
