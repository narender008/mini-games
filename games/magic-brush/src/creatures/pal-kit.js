// Helpers shared by the Paint Pals built here (unicorn, fox, elephant,
// whale): a tracker that feels how the friend moves through the world (so
// manes, tails and ears can lag behind it), planted legs solved with a
// two-bone IK and a trotting step cycle (so hooves and paws do not slide),
// clumps of hair for manes and tails, and a silky hair material with
// strands in it.
import * as THREE from 'three';
import { twoBone, clamp, smooth } from './anim.js';

const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ik = [0, 0];

// ------------------------------------------------------------ motion

// How the friend's object moves in the world, in its own frame (metres of
// the friend's rest space): smoothed velocity, acceleration and turn rate.
export class Tracker {
  constructor() {
    this.pos = null;
    this.yaw = 0;
    this.vel = new THREE.Vector3();
    this.acc = new THREE.Vector3();
    this.yawRate = 0;
  }

  update(obj, dt) {
    if (dt <= 0) return this;
    obj.updateWorldMatrix(true, false);
    const e = obj.matrixWorld.elements;
    const s = Math.hypot(e[8], e[9], e[10]) || 1;
    const p = _a.setFromMatrixPosition(obj.matrixWorld);
    const yaw = Math.atan2(e[8], e[10]);
    if (!this.pos) {
      this.pos = p.clone();
      this.yaw = yaw;
      return this;
    }
    // world velocity into the friend's own axes
    _b.copy(p).sub(this.pos).divideScalar(dt);
    const vx = (_b.x * e[0] + _b.y * e[1] + _b.z * e[2]) / (s * s);
    const vy = (_b.x * e[4] + _b.y * e[5] + _b.z * e[6]) / (s * s);
    const vz = (_b.x * e[8] + _b.y * e[9] + _b.z * e[10]) / (s * s);
    const k = 1 - Math.exp(-dt * 10);
    const ox = this.vel.x, oy = this.vel.y, oz = this.vel.z;
    this.vel.x += (clamp(vx, -4, 4) - this.vel.x) * k;
    this.vel.y += (clamp(vy, -4, 4) - this.vel.y) * k;
    this.vel.z += (clamp(vz, -4, 4) - this.vel.z) * k;
    const ka = 1 - Math.exp(-dt * 6);
    this.acc.x += (clamp((this.vel.x - ox) / dt, -20, 20) - this.acc.x) * ka;
    this.acc.y += (clamp((this.vel.y - oy) / dt, -20, 20) - this.acc.y) * ka;
    this.acc.z += (clamp((this.vel.z - oz) / dt, -20, 20) - this.acc.z) * ka;
    let dy = yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yawRate += (clamp(dy / dt, -8, 8) - this.yawRate) * k;
    this.pos.copy(p);
    this.yaw = yaw;
    return this;
  }
}

// ------------------------------------------------------------ legs

// A leg of three bones (hip, knee, foot) that bends in its y-z plane.
// bend: +1 bends the knee forward (a horse's front knee, lower leg folding
// back), -1 bends it backward (a hock, lower leg folding forward).
export class Leg {
  constructor(friend, hip, knee, foot, bend = 1) {
    this.f = friend;
    this.names = [hip, knee, foot];
    this.bend = bend;
    const S = friend.sculptor;
    const P = (n) => S.bones[S.index[n]].pos;
    const h = P(hip), k = P(knee), ft = P(foot);
    this.rest = { hip: h, knee: k, foot: ft };
    this.l1 = Math.hypot(k[1] - h[1], k[2] - h[2]);
    this.l2 = Math.hypot(ft[1] - k[1], ft[2] - k[2]);
    this.uRest = Math.atan2(k[2] - h[2], -(k[1] - h[1]));
    this.wRest = Math.atan2(ft[2] - k[2], -(ft[1] - k[1]));
    this.foot = new THREE.Vector3(...ft); // the rest foot, in friend space
    this.target = new THREE.Vector3();
    this.lift = 0; // how high the foot is off the ground now (for effects)
  }

  // target: where the foot bone should be (friend space) when planted;
  // plant 0..1 blends to a free leg that hangs from the hip with freeOff
  // (friend-space offset from its rest place); toe: extra foot pitch
  // (positive tips the toe down)
  solve(target, plant = 1, freeOff = null, toe = 0) {
    const B = this.f.bones;
    const hip = B[this.names[0]];
    const knee = B[this.names[1]];
    const foot = B[this.names[2]];
    const parent = hip.parent;
    parent.updateWorldMatrix(true, false);
    this.f.object.updateWorldMatrix(true, false);
    _m.copy(this.f.object.matrixWorld).invert().multiply(parent.matrixWorld); // parent -> friend
    _mi.copy(_m).invert();
    // the free place: the rest foot carried along with the hip
    _a.copy(hip.position).applyMatrix4(_m); // hip now, friend space
    _b.set(this.rest.foot[0] - this.rest.hip[0], this.rest.foot[1] - this.rest.hip[1], this.rest.foot[2] - this.rest.hip[2]).add(_a);
    if (freeOff) _b.add(freeOff);
    _c.copy(_b).lerp(target, plant);
    this.target.copy(_c);
    _c.applyMatrix4(_mi); // into the parent's frame
    const dy = _c.y - hip.position.y;
    const dz = _c.z - hip.position.z;
    const phi = Math.atan2(dz, -dy);
    const d = Math.hypot(dy, dz);
    twoBone(this.l1, this.l2, d, _ik);
    const a1 = _ik[0];
    const a2 = _ik[1];
    const u = phi + this.bend * a1;
    const w = u - this.bend * a2;
    hip.rotation.x += -(u - this.uRest);
    knee.rotation.x += -(w - u - (this.wRest - this.uRest));
    const pitch = Math.atan2(_m.elements[6], _m.elements[5]);
    foot.rotation.x += w - this.wRest - pitch + toe;
  }
}

// A step cycle: phase 0..1; the first `duty` of it the foot is down and
// slides back under the body at the ground's speed, then it lifts and
// swings forward. Returns [dz, dy] from the foot's rest place (in `out`
// when given, to avoid an allocation).
export function stepOffset(phase, duty, stride, lift, peak = 0.45, out = [0, 0]) {
  const u = phase - Math.floor(phase);
  if (u < duty) {
    out[0] = stride * (0.5 - u / duty);
    out[1] = 0;
    return out;
  }
  const s = (u - duty) / (1 - duty);
  // lift rises fast and lands a touch later, a springy step
  const y = s < peak ? Math.sin((s / peak) * Math.PI * 0.5) : Math.cos(((s - peak) / (1 - peak)) * Math.PI * 0.5);
  out[0] = stride * (-0.5 + smooth(s));
  out[1] = lift * Math.pow(Math.max(0, y), 0.9);
  return out;
}

// ------------------------------------------------------------ hair

// One clump of hair (a lock of mane or tail): a tube with a flattened,
// lens-shaped cross-section along a curve, widest near its root and
// tapering to a point, wide side facing `side` (so it lies on the neck).
// aSpan: 0 root .. 1 tip; aHair: (around, along, seed) for strand streaks.
export function hairClump(points, width, thick, { steps = 18, radial = 10, side = [1, 0, 0], seed = Math.random(), swell = 0.45, tip = 0.9 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const pos = [];
  const nor = [];
  const span = [];
  const hair = [];
  const idx = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const S = new THREE.Vector3(...side).normalize();
  const W = new THREE.Vector3();
  const N = new THREE.Vector3();
  const len = curve.getLength();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    // wide axis: the side direction made perpendicular to the curve
    W.copy(S).addScaledVector(T, -S.dot(T));
    if (W.lengthSq() < 1e-8) W.set(0, 1, 0);
    W.normalize();
    N.crossVectors(T, W).normalize();
    const prof = (1 - swell + swell * Math.sin(Math.min(1, t * 1.8 + 0.15) * Math.PI)) * (1 - tip * Math.pow(t, 2.2));
    const w = Math.max(0.0004, width * prof);
    const h = Math.max(0.0003, thick * prof);
    for (let a = 0; a <= radial; a++) {
      const th = (a / radial) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      pos.push(P.x + W.x * c * w + N.x * sn * h, P.y + W.y * c * w + N.y * sn * h, P.z + W.z * c * w + N.z * sn * h);
      // the normal of an ellipse
      const nx = W.x * (c / w) + N.x * (sn / h), ny = W.y * (c / w) + N.y * (sn / h), nz = W.z * (c / w) + N.z * (sn / h);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / nl, ny / nl, nz / nl);
      span.push(t);
      hair.push(a / radial, t * len * 20, seed);
    }
  }
  const row = radial + 1;
  for (let s = 0; s < steps; s++)
    for (let a = 0; a < radial; a++) {
      const i0 = s * row + a;
      idx.push(i0, i0 + 1, i0 + row, i0 + 1, i0 + row + 1, i0 + row);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  g.setAttribute('aHair', new THREE.Float32BufferAttribute(hair, 3));
  g.setIndex(idx);
  return g;
}

// Silky hair: the friend's solid material with a soft sheen
// and fine strands running along each clump (lighter tips, darker roots).
export function hairMaterial(friend, { sheen = 0.7, strands = 0.5, key = 'hair' } = {}) {
  const m = friend.mat('solid');
  m.sheen = sheen;
  m.sheenColor = new THREE.Color(1, 0.97, 0.94);
  m.sheenRoughness = 0.3;
  m.clearcoat = 0.25;
  m.clearcoatRoughness = 0.35;
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    base(s, r);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aHair;\nvarying vec3 vHair;')
      .replace('vRest = position;', 'vRest = position;\nvHair = aHair;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHair;').replace(
      'diffuseColor.rgb = mbBase;',
      `diffuseColor.rgb = mbBase;
      {
        float hs = vHair.z * 41.0;
        float st = mbNoise(vec3(vHair.x * 34.0 + hs, vHair.y * 0.35, hs)) * 0.6 + mbNoise(vec3(vHair.x * 97.0 + hs, vHair.y * 0.8, hs + 7.0)) * 0.4;
        float k = ${strands.toFixed(3)} * (1.0 - mbPaintState * uAliveOn);
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.62 * st, k);
        diffuseColor.rgb *= mix(1.0, mix(0.8, 1.1, smoothstep(0.0, 6.0, vHair.y)), k);
      }`,
    );
  };
  const k0 = m.customProgramCacheKey();
  m.customProgramCacheKey = () => `${k0}-${key}`;
  return m;
}
