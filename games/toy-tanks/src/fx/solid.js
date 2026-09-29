// The solid pieces: paper confetti (FlatPool) and the blobs (BlobPool: gel,
// mud, water, crumbs of earth and snow, rubber beads). Each pool is
// one InstancedMesh with a fixed capacity, simulated on the CPU with structure-
// of-arrays typed arrays. Nothing allocates after construction: slots are
// recycled through a ring, matrices are composed straight into the instance
// buffer and only the used part of each buffer is uploaded.
//
// Physics is deliberately simple but honest: gravity (scaled up so small debris
// reads as small and quick), exponential air drag per piece type, wind as an
// acceleration, restitution and friction against world.heightAt / normalAt,
// then settling and a gentle shrink-and-sink at the end of life (never a pop).
import * as THREE from 'three';
import { flatGeometry, blobGeometry } from './geometry.js';
import { flatMaterial, blobMaterial, blobDepthMaterial } from './materials.js';

const _col = new THREE.Color();
const smooth = (a, b, x) => {
  const t = x < a ? 0 : x > b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

// instance matrix from a quaternion, a scale per axis and a position
function composeQ(M, o, px, py, pz, qx, qy, qz, qw, sx, sy, sz) {
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;
  M[o] = (1 - (yy + zz)) * sx;
  M[o + 1] = (xy + wz) * sx;
  M[o + 2] = (xz - wy) * sx;
  M[o + 3] = 0;
  M[o + 4] = (xy - wz) * sy;
  M[o + 5] = (1 - (xx + zz)) * sy;
  M[o + 6] = (yz + wx) * sy;
  M[o + 7] = 0;
  M[o + 8] = (xz + wy) * sz;
  M[o + 9] = (yz - wx) * sz;
  M[o + 10] = (1 - (xx + yy)) * sz;
  M[o + 11] = 0;
  M[o + 12] = px;
  M[o + 13] = py;
  M[o + 14] = pz;
  M[o + 15] = 1;
}

// matrix whose local +Y is the unit vector (ax, ay, az): stretched along it by
// sy, and by sxz across
function composeAxis(M, o, px, py, pz, ax, ay, az, sxz, sy) {
  let rx = 0;
  let ry = 0;
  let rz = 1;
  if (az > 0.9 || az < -0.9) {
    rx = 1;
    rz = 0;
  }
  // X = normalize(Y x ref), Z = X x Y
  let xx = ay * rz - az * ry;
  let xy = az * rx - ax * rz;
  let xz = ax * ry - ay * rx;
  const il = 1 / Math.sqrt(xx * xx + xy * xy + xz * xz);
  xx *= il;
  xy *= il;
  xz *= il;
  const zx = xy * az - xz * ay;
  const zy = xz * ax - xx * az;
  const zz = xx * ay - xy * ax;
  M[o] = xx * sxz;
  M[o + 1] = xy * sxz;
  M[o + 2] = xz * sxz;
  M[o + 3] = 0;
  M[o + 4] = ax * sy;
  M[o + 5] = ay * sy;
  M[o + 6] = az * sy;
  M[o + 7] = 0;
  M[o + 8] = zx * sxz;
  M[o + 9] = zy * sxz;
  M[o + 10] = zz * sxz;
  M[o + 11] = 0;
  M[o + 12] = px;
  M[o + 13] = py;
  M[o + 14] = pz;
  M[o + 15] = 1;
}

class InstancedPool {
  constructor(geometry, material, cap) {
    this.cap = cap;
    const mesh = new THREE.InstancedMesh(geometry, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.mesh = mesh;
    this.geometry = geometry;
    this.M = mesh.instanceMatrix.array;
    this.C = mesh.instanceColor.array;
    this.state = new Uint8Array(cap);
    this.high = 0;
    this.head = 0;
    this.live = 0;
    this.spawned = false;
    this.extra = [];
  }

  // extra per-instance attribute (vec4), static after spawn unless the pool rewrites it
  addAttr(name) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
    a.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute(name, a);
    this.extra.push(a);
    return a;
  }

  // a dead slot near the head; if none within a short scan, the oldest (the head itself)
  alloc() {
    const cap = this.cap;
    let i = this.head;
    for (let n = 0; n < 24; n++) {
      if (this.state[i] === 0) break;
      i = i + 1 === cap ? 0 : i + 1;
    }
    if (this.state[i] !== 0) i = this.head;
    this.head = i + 1 === cap ? 0 : i + 1;
    if (i >= this.high) this.high = i + 1;
    this.spawned = true;
    return i;
  }

  color(i, r, g, b) {
    const o = i * 3;
    this.C[o] = r;
    this.C[o + 1] = g;
    this.C[o + 2] = b;
  }

  kill(i) {
    this.state[i] = 0;
    this.M.fill(0, i * 16, i * 16 + 16);
  }

  // end of frame: trim the draw count to the last live slot and upload the used range
  finish(hi) {
    this.high = hi;
    this.mesh.count = hi;
    this.live = hi;
    if (hi === 0) return;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, hi * 16);
    im.needsUpdate = true;
    if (this.spawned) {
      const ic = this.mesh.instanceColor;
      ic.clearUpdateRanges();
      ic.addUpdateRange(0, hi * 3);
      ic.needsUpdate = true;
      for (const a of this.extra) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, hi * 4);
        a.needsUpdate = true;
      }
      this.spawned = false;
    }
  }

  clear() {
    this.state.fill(0);
    this.M.fill(0);
    this.high = 0;
    this.head = 0;
    this.mesh.count = 0;
  }
}

// random unit quaternion, written into an array at offset o
function randomQuat(A, o) {
  const u1 = Math.random();
  const u2 = Math.random() * 6.2831853;
  const u3 = Math.random() * 6.2831853;
  const s1 = Math.sqrt(1 - u1);
  const s2 = Math.sqrt(u1);
  A[o] = s1 * Math.sin(u2);
  A[o + 1] = s1 * Math.cos(u2);
  A[o + 2] = s2 * Math.sin(u3);
  A[o + 3] = s2 * Math.cos(u3);
}

function randomSpin(A, o, mag) {
  const z = Math.random() * 2 - 1;
  const a = Math.random() * 6.2831853;
  const r = Math.sqrt(1 - z * z);
  A[o] = Math.cos(a) * r * mag;
  A[o + 1] = z * mag;
  A[o + 2] = Math.sin(a) * r * mag;
}

// integrate q by angular velocity w over h and normalise
function integrateQ(Q, o, wx, wy, wz, h) {
  const qx = Q[o];
  const qy = Q[o + 1];
  const qz = Q[o + 2];
  const qw = Q[o + 3];
  const hh = 0.5 * h;
  let nx = qx + hh * (wx * qw + wy * qz - wz * qy);
  let ny = qy + hh * (wy * qw + wz * qx - wx * qz);
  let nz = qz + hh * (wz * qw + wx * qy - wy * qx);
  let nw = qw + hh * (-wx * qx - wy * qy - wz * qz);
  const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
  Q[o] = nx * il;
  Q[o + 1] = ny * il;
  Q[o + 2] = nz * il;
  Q[o + 3] = nw * il;
}

// target orientation that lays the piece's local +Z face flat on the ground
// (whichever face is nearer up), keeping its twist about the normal
function flatTarget(Q, Tq, o, Nx, Ny, Nz) {
  const qx = Q[o];
  const qy = Q[o + 1];
  const qz = Q[o + 2];
  const qw = Q[o + 3];
  const nx = 2 * (qx * qz + qw * qy);
  const ny = 2 * (qy * qz - qw * qx);
  const nz = 1 - 2 * (qx * qx + qy * qy);
  let tx = Nx;
  let ty = Ny;
  let tz = Nz;
  let c = nx * tx + ny * ty + nz * tz;
  if (c < 0) {
    tx = -tx;
    ty = -ty;
    tz = -tz;
    c = -c;
  }
  // shortest arc from n to t
  let ax = ny * tz - nz * ty;
  let ay = nz * tx - nx * tz;
  let az = nx * ty - ny * tx;
  let aw = 1 + c;
  const il = 1 / Math.sqrt(ax * ax + ay * ay + az * az + aw * aw);
  ax *= il;
  ay *= il;
  az *= il;
  aw *= il;
  // arc * q
  Tq[o] = aw * qx + ax * qw + ay * qz - az * qy;
  Tq[o + 1] = aw * qy - ax * qz + ay * qw + az * qx;
  Tq[o + 2] = aw * qz + ax * qy - ay * qx + az * qw;
  Tq[o + 3] = aw * qw - ax * qx - ay * qy - az * qz;
}

function nlerpTo(Q, Tq, o, f) {
  let dot = Q[o] * Tq[o] + Q[o + 1] * Tq[o + 1] + Q[o + 2] * Tq[o + 2] + Q[o + 3] * Tq[o + 3];
  const s = dot < 0 ? -1 : 1;
  let x = Q[o] + (Tq[o] * s - Q[o]) * f;
  let y = Q[o + 1] + (Tq[o + 1] * s - Q[o + 1]) * f;
  let z = Q[o + 2] + (Tq[o + 2] * s - Q[o + 2]) * f;
  let w = Q[o + 3] + (Tq[o + 3] * s - Q[o + 3]) * f;
  const il = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
  Q[o] = x * il;
  Q[o + 1] = y * il;
  Q[o + 2] = z * il;
  Q[o + 3] = w * il;
}

// ---------------------------------------------------------------------------
// Paper: confetti, ribbons, grass blades, pine needles. A flat plate in air:
// the drag on the part of its speed across the plate is much stronger than
// along it, and a torque turns it broadside to its motion, so it tumbles at
// first, then flutters and glides down like real confetti.
export class FlatPool extends InstancedPool {
  constructor(cap, ctx) {
    super(flatGeometry(), flatMaterial(), cap);
    this.ctx = ctx;
    this.param = this.addAttr('aParam');
    this.P = new Float32Array(cap * 3);
    this.V = new Float32Array(cap * 3);
    this.Q = new Float32Array(cap * 4);
    this.T = new Float32Array(cap * 4);
    this.W = new Float32Array(cap * 3);
    this.SX = new Float32Array(cap);
    this.SY = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.rest = new Float32Array(cap);
    this.KN = new Float32Array(cap);
    this.KT = new Float32Array(cap);
    this.GS = new Float32Array(cap);
    this.WK = new Float32Array(cap);
    this.LIFT = new Float32Array(cap);
    this.FLOOR = new Float32Array(cap).fill(-1000);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
  }

  // sx: length, sy: width (metres, full size); shape 0 rounded, 1 round, 2 flake, 3 blade, 4 diamond
  spawn(x, y, z, vx, vy, vz, sx, sy, shape, bend, foil, cr, cg, cb, life, kn, kt, gs, wk, spin, lift = 0.0007, floor = -1000) {
    const i = this.alloc();
    const p = i * 3;
    this.P[p] = x;
    this.P[p + 1] = y;
    this.P[p + 2] = z;
    this.V[p] = vx;
    this.V[p + 1] = vy;
    this.V[p + 2] = vz;
    randomQuat(this.Q, i * 4);
    randomSpin(this.W, p, spin);
    this.SX[i] = sx;
    this.SY[i] = sy;
    this.age[i] = 0;
    this.life[i] = life;
    this.rest[i] = 0;
    this.KN[i] = kn;
    this.KT[i] = kt;
    this.GS[i] = gs;
    this.WK[i] = wk;
    this.LIFT[i] = lift;
    this.FLOOR[i] = floor;
    const a = this.param.array;
    a[i * 4] = shape;
    a[i * 4 + 1] = bend;
    a[i * 4 + 2] = sy / sx;
    a[i * 4 + 3] = foil;
    this.color(i, cr, cg, cb);
    this.state[i] = 1;
    this.write(i, 1);
    return i;
  }

  write(i, sc) {
    const p = i * 3;
    const q = i * 4;
    const Q = this.Q;
    composeQ(this.M, i * 16, this.P[p], this.P[p + 1], this.P[p + 2], Q[q], Q[q + 1], Q[q + 2], Q[q + 3], this.SX[i] * sc, this.SY[i] * sc, this.SX[i] * sc);
  }

  update(dt) {
    const ctx = this.ctx;
    const world = ctx.world;
    const G = world.gravity;
    const wind = world.wind;
    const n = dt > 0.0182 ? (dt > 0.0364 ? 4 : 2) : 1;
    const h = dt / n;
    const P = this.P;
    const V = this.V;
    const Q = this.Q;
    const W = this.W;
    let hi = 0;
    for (let i = 0; i < this.high; i++) {
      const st = this.state[i];
      if (st === 0) continue;
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) {
        this.kill(i);
        continue;
      }
      hi = i + 1;
      const p = i * 3;
      const q = i * 4;
      let x = P[p];
      let y = P[p + 1];
      let z = P[p + 2];
      let fade = 1;
      if (age > life - 1.3) fade = 1 - smooth(life - 1.3, life, age);
      if (st === 1) {
        let vx = V[p];
        let vy = V[p + 1];
        let vz = V[p + 2];
        let wx = W[p];
        let wy = W[p + 1];
        let wz = W[p + 2];
        const kn = this.KN[i];
        const kt = this.KT[i];
        const gs = G * this.GS[i];
        const wa = wind * this.WK[i];
        const damp = Math.exp(-2.2 * h);
        let landed = false;
        for (let s = 0; s < n; s++) {
          const qx = Q[q];
          const qy = Q[q + 1];
          const qz = Q[q + 2];
          const qw = Q[q + 3];
          const nx = 2 * (qx * qz + qw * qy);
          const ny = 2 * (qy * qz - qw * qx);
          const nz = 1 - 2 * (qx * qx + qy * qy);
          const un = vx * nx + vy * ny + vz * nz;
          const f = kn - kt;
          vx += (-kt * vx - f * un * nx + wa) * h;
          vy += (-kt * vy - f * un * ny - gs) * h;
          vz += (-kt * vz - f * un * nz) * h;
          x += vx * h;
          y += vy * h;
          z += vz * h;
          // torque turning the plate broadside to its motion
          const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (sp > 0.004) {
            const sgn = un >= 0 ? 1 : -1;
            const k = sgn * 26 * h;
            wx += (ny * vz - nz * vy) * k;
            wy += (nz * vx - nx * vz) * k;
            wz += (nx * vy - ny * vx) * k;
          }
          wx *= damp;
          wy *= damp;
          wz *= damp;
          integrateQ(Q, q, wx, wy, wz, h);
          if (y < Math.max(world.heightAt(x, z), this.FLOOR[i]) + this.LIFT[i]) {
            landed = true;
            break;
          }
        }
        P[p] = x;
        P[p + 1] = y;
        P[p + 2] = z;
        V[p] = vx;
        V[p + 1] = vy;
        V[p + 2] = vz;
        W[p] = wx;
        W[p + 1] = wy;
        W[p + 2] = wz;
        if (landed) {
          const N = ctx.normalAt(x, z);
          flatTarget(Q, this.T, q, N.x, N.y, N.z);
          this.state[i] = 2;
          this.rest[i] = 0;
          V[p] *= 0.3;
          V[p + 2] *= 0.3;
          V[p + 1] = 0;
        }
      } else if (st === 2) {
        const r = (this.rest[i] += dt);
        const k = Math.exp(-14 * dt);
        V[p] *= k;
        V[p + 2] *= k;
        x += V[p] * dt;
        z += V[p + 2] * dt;
        P[p] = x;
        P[p + 2] = z;
        P[p + 1] = Math.max(world.heightAt(x, z), this.FLOOR[i]) + this.LIFT[i];
        nlerpTo(Q, this.T, q, 1 - Math.exp(-20 * dt));
        if (r > 0.45) this.state[i] = 3;
      } else if (fade >= 1) {
        continue;
      }
      let sc = 1;
      if (fade < 1) {
        sc = fade;
        if (this.state[i] === 3) P[p + 1] = Math.max(world.heightAt(x, z), this.FLOOR[i]) + this.LIFT[i] - 0.0015 * (1 - fade);
      }
      this.write(i, sc);
    }
    this.finish(hi);
  }

  clear() {
    super.clear();
  }

  // the ground under settled paper changed (a crater): lay the pieces near it back on the ground
  reseat(x, z, r) {
    const world = this.ctx.world;
    const r2 = r * r;
    for (let i = 0; i < this.high; i++) {
      if (this.state[i] !== 3) continue;
      const p = i * 3;
      const dx = this.P[p] - x;
      const dz = this.P[p + 2] - z;
      if (dx * dx + dz * dz > r2) continue;
      this.P[p + 1] = Math.max(world.heightAt(this.P[p], this.P[p + 2]), this.FLOOR[i]) + this.LIFT[i];
      this.write(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Blobs. kinds:
export const K_JELLY = 1;
export const K_MUD = 2;
export const K_WATER = 3;
export const K_CLOD = 4;
export const K_CANDY = 5;
export const K_PAINT = 6;

// e restitution, drag 1/s, gs gravity scale, wk wind scale, hc contact height (of radius),
// splat lands as a decal and vanishes, decal size (of radius; 0 none), rough/sss/lump/grain/neck: look,
// wob wobble amplitude and decay, sqK squash from impact speed, str stretch by speed, rigid tumbles
const KINDS = [];
KINDS[K_JELLY] = { e: 0.5, drag: 0.5, gs: 1.6, wk: 0.3, hc: 0.88, splat: 0, decal: 1.1, rough: 0.14, sss: 0.6, lump: 0, grain: 0, neck: 0.5, wob: 0.14, wobDecay: 2.4, sqK: 0.25, str: 0.5, rigid: 0, roll: 5, maxB: 2 };
KINDS[K_MUD] = { e: 0, drag: 0.3, gs: 2.0, wk: 0.4, hc: 0.5, splat: 1, decal: 1.5, rough: 0.14, sss: 0.0, lump: 0.07, grain: 0.12, neck: 0.3, wob: 0.06, wobDecay: 6, sqK: 0, str: 1.0, rigid: 0, roll: 5, maxB: 0 };
KINDS[K_WATER] = { e: 0, drag: 0.25, gs: 2.0, wk: 0.5, hc: 0.5, splat: 1, decal: 0, rough: 0.03, sss: 0.45, lump: 0, grain: 0, neck: 0.25, wob: 0.04, wobDecay: 6, sqK: 0, str: 1.2, rigid: 0, roll: 5, maxB: 0 };
KINDS[K_PAINT] = { e: 0, drag: 0.4, gs: 1.9, wk: 0.4, hc: 0.5, splat: 1, decal: 1.7, rough: 0.1, sss: 0.5, lump: 0, grain: 0, neck: 0.3, wob: 0.06, wobDecay: 6, sqK: 0, str: 1.0, rigid: 0, roll: 5, maxB: 0 };
KINDS[K_CLOD] = { e: 0.3, drag: 0.5, gs: 2.0, wk: 0.15, hc: 0.85, splat: 0, decal: 0, rough: 0.92, sss: 0, lump: 0.3, grain: 0.75, neck: 0.3, wob: 0, wobDecay: 6, sqK: 0, str: 0, rigid: 1, roll: 3.5, maxB: 3 };
KINDS[K_CANDY] = { e: 0.62, drag: 0.4, gs: 1.7, wk: 0.4, hc: 0.95, splat: 0, decal: 0, rough: 0.1, sss: 0.35, lump: 0, grain: 0, neck: 0.3, wob: 0.03, wobDecay: 4, sqK: 0, str: 0, rigid: 1, roll: 2, maxB: 4 };

export class BlobPool extends InstancedPool {
  constructor(cap, ctx) {
    super(blobGeometry(), blobMaterial(), cap);
    this.ctx = ctx;
    this.aA = this.addAttr('aA'); // tail, neck, wobble, seed
    this.aB = this.addAttr('aB'); // rough, sss, lump, grain
    this.mesh.customDepthMaterial = blobDepthMaterial();
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.P = new Float32Array(cap * 3);
    this.V = new Float32Array(cap * 3);
    this.Ax = new Float32Array(cap * 3);
    this.O = new Float32Array(cap * 3);
    this.Q = new Float32Array(cap * 4);
    this.W = new Float32Array(cap * 3);
    this.R = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.rest = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.bounces = new Uint8Array(cap);
    this.landed = new Uint8Array(cap);
    this.E = new Float32Array(cap);
    this.T0 = new Float32Array(cap);
    this.Tdec = new Float32Array(cap);
    this.pin = new Float32Array(cap);
    this.pinMax = new Float32Array(cap);
    this.wob = new Float32Array(cap);
    this.sq = new Float32Array(cap);
    this.sqV = new Float32Array(cap);
    this.breakT = new Float32Array(cap);
    this.decalAmt = new Float32Array(cap);
    this.hidden = new Float32Array(cap);
    this.floorY = new Float32Array(cap).fill(-1000);
  }

  spawn(kind, x, y, z, vx, vy, vz, R, cr, cg, cb, life) {
    const K = KINDS[kind];
    const i = this.alloc();
    const p = i * 3;
    this.P[p] = x;
    this.P[p + 1] = y;
    this.P[p + 2] = z;
    this.V[p] = vx;
    this.V[p + 1] = vy;
    this.V[p + 2] = vz;
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6;
    this.Ax[p] = vx / sp;
    this.Ax[p + 1] = vy / sp;
    this.Ax[p + 2] = vz / sp;
    this.O[p] = x;
    this.O[p + 1] = y;
    this.O[p + 2] = z;
    randomQuat(this.Q, i * 4);
    randomSpin(this.W, p, K.rigid ? 5 + Math.random() * 9 : 0);
    this.R[i] = R;
    this.age[i] = 0;
    this.life[i] = life;
    this.rest[i] = 0;
    this.kind[i] = kind;
    this.bounces[i] = 0;
    this.landed[i] = 0;
    this.E[i] = K.e;
    this.T0[i] = 0;
    this.Tdec[i] = 8;
    this.pin[i] = 0;
    this.pinMax[i] = 6;
    this.wob[i] = K.wob;
    this.sq[i] = 0;
    this.sqV[i] = 0;
    this.breakT[i] = 0;
    this.decalAmt[i] = K.decal;
    this.hidden[i] = 0;
    this.floorY[i] = -1000;
    const a = this.aA.array;
    a[i * 4] = 0;
    a[i * 4 + 1] = K.neck;
    a[i * 4 + 2] = K.wob;
    a[i * 4 + 3] = Math.random();
    const b = this.aB.array;
    b[i * 4] = K.rough;
    b[i * 4 + 1] = K.sss;
    b[i * 4 + 2] = K.lump;
    b[i * 4 + 3] = K.grain;
    this.color(i, cr, cg, cb);
    this.state[i] = 1;
    return i;
  }

  // per-piece overrides after spawn()
  look(i, rough, sss, lump, grain, neck) {
    const b = this.aB.array;
    b[i * 4] = rough;
    b[i * 4 + 1] = sss;
    b[i * 4 + 2] = lump;
    b[i * 4 + 3] = grain;
    if (neck >= 0) this.aA.array[i * 4 + 1] = neck;
  }

  // a level the piece may not fall below (a water surface over the ground)
  floor(i, y) {
    this.floorY[i] = y;
  }

  // a tail (in head radii) that fades with rate decay; pinT > 0 anchors the tail
  // tip at the spawn point for that long (a tendril still joined to the ground)
  tail(i, T, decay, pinT, pinMax = 6) {
    this.T0[i] = T;
    this.Tdec[i] = decay;
    this.pin[i] = pinT;
    this.pinMax[i] = pinMax;
  }

  update(dt) {
    const ctx = this.ctx;
    const world = ctx.world;
    const G = world.gravity;
    const wind = world.wind;
    const n = dt > 0.0182 ? (dt > 0.0364 ? 4 : 2) : 1;
    const h = dt / n;
    const P = this.P;
    const V = this.V;
    const Ax = this.Ax;
    const Q = this.Q;
    const W = this.W;
    const aA = this.aA.array;
    let hi = 0;
    for (let i = 0; i < this.high; i++) {
      let st = this.state[i];
      if (st === 0) continue;
      const kd = this.kind[i];
      const K = KINDS[kd];
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) {
        this.kill(i);
        continue;
      }
      hi = i + 1;
      const p = i * 3;
      const q = i * 4;
      const R = this.R[i];
      let x = P[p];
      let y = P[p + 1];
      let z = P[p + 2];
      let vx = V[p];
      let vy = V[p + 1];
      let vz = V[p + 2];
      const hcR = K.hc * R;
      const fl = this.floorY[i];
      let gy = Math.max(world.heightAt(x, z), fl);
      let nX = 0;
      let nY = 1;
      let nZ = 0;
      let grounded = false;
      let flatten = 0;
      // snow lumps break up in the air or on landing
      if (st === 1 && this.breakT[i] > 0 && age >= this.breakT[i]) {
        ctx.breakUp(this, i, x, y, z, vx, vy, vz);
        this.kill(i);
        continue;
      }
      if (st === 1) {
        const dk = Math.exp(-K.drag * h);
        const gs = G * K.gs;
        const wa = wind * K.wk;
        let wx = W[p];
        let wy = W[p + 1];
        let wz = W[p + 2];
        for (let s = 0; s < n; s++) {
          vx = vx * dk + wa * h;
          vy = vy * dk - gs * h;
          vz *= dk;
          x += vx * h;
          y += vy * h;
          z += vz * h;
          if (K.rigid) integrateQ(Q, q, wx, wy, wz, h);
          if (y < gy + hcR + 0.004) gy = Math.max(world.heightAt(x, z), fl);
          if (y < gy + hcR) {
            const N = ctx.normalAt(x, z);
            nX = N.x;
            nY = N.y;
            nZ = N.z;
            y = gy + hcR;
            const vn = vx * nX + vy * nY + vz * nZ;
            if (this.breakT[i] > 0) {
              ctx.breakUp(this, i, x, y, z, vx, vy, vz);
              this.kill(i);
              st = 0;
              break;
            }
            if (K.splat) {
              ctx.splat(this, i, x, gy, z, R, nX, nY, nZ);
              this.state[i] = 2;
              this.rest[i] = 0;
              vx = vy = vz = 0;
              st = 2;
              break;
            }
            if (!this.landed[i]) {
              this.landed[i] = 1;
              if (this.decalAmt[i] > 0) ctx.splat(this, i, x, gy, z, R, nX, nY, nZ);
            }
            if (vn < -0.16 && this.bounces[i] < K.maxB) {
              const impact = -vn;
              const e = this.E[i];
              vx -= (1 + e) * vn * nX;
              vy -= (1 + e) * vn * nY;
              vz -= (1 + e) * vn * nZ;
              const f = Math.exp(-3 * 0.3);
              const dn = vx * nX + vy * nY + vz * nZ;
              vx = (vx - dn * nX) * f + dn * nX;
              vy = (vy - dn * nY) * f + dn * nY;
              vz = (vz - dn * nZ) * f + dn * nZ;
              this.bounces[i]++;
              this.sqV[i] += impact * 9 * (K.sqK + 0.001);
              this.wob[i] = Math.min(0.3, this.wob[i] + impact * 0.1 * (K.wob > 0 ? 1 : 0));
              if (K.rigid) {
                wx = wx * 0.5 + (Math.random() - 0.5) * 6;
                wy = wy * 0.5 + (Math.random() - 0.5) * 6;
                wz = wz * 0.5 + (Math.random() - 0.5) * 6;
              }
              ctx.bounceTick(kd, x, gy, z, impact, R);
            } else {
              // rolling or sitting: no speed into the ground, friction along it
              grounded = true;
              if (vn < 0) {
                vx -= vn * nX;
                vy -= vn * nY;
                vz -= vn * nZ;
              }
              const f = Math.exp(-K.roll * h);
              vx *= f;
              vy *= f;
              vz *= f;
              if (K.rigid) {
                wx = (nY * vz - nZ * vy) / Math.max(R, 0.002);
                wy = (nZ * vx - nX * vz) / Math.max(R, 0.002);
                wz = (nX * vy - nY * vx) / Math.max(R, 0.002);
              }
              if (vx * vx + vy * vy + vz * vz < 0.0009) {
                vx = vy = vz = 0;
                this.state[i] = 3;
                this.rest[i] = 0;
                st = 3;
                wx = wy = wz = 0;
                break;
              }
            }
          }
        }
        if (st === 0) continue;
        W[p] = wx;
        W[p + 1] = wy;
        W[p + 2] = wz;
      } else if (st === 2) {
        // a drop hitting the ground: flatten into a disc while its stain fades in, then it is gone
        const r = (this.rest[i] += dt);
        if (r >= 0.085) {
          this.kill(i);
          continue;
        }
        const N = ctx.normalAt(x, z);
        nX = N.x;
        nY = N.y;
        nZ = N.z;
      } else {
        // sitting: jellies slowly slump into a flat dome, other blobs sag a little
        flatten = (kd === K_JELLY ? 0.6 : 0.3) * smooth(0, 0.35, (this.rest[i] += dt));
        y = gy + hcR * (1 - (kd === K_JELLY ? 0.7 : 0.55) * Math.max(-0.3, Math.min(0.6, this.sq[i] + flatten))) * 0.94;
        const N = ctx.normalAt(x, z);
        nX = N.x;
        nY = N.y;
        nZ = N.z;
        grounded = true;
      }
      P[p] = x;
      P[p + 1] = y;
      P[p + 2] = z;
      V[p] = vx;
      V[p + 1] = vy;
      V[p + 2] = vz;

      // squash spring and wobble
      let sqv = this.sqV[i];
      let sqq = this.sq[i];
      sqv += (-900 * sqq - 26 * sqv) * dt;
      sqq += sqv * dt;
      this.sqV[i] = sqv;
      this.sq[i] = sqq;
      const wob = (this.wob[i] *= Math.exp(-K.wobDecay * dt));

      // the end of life: melt away by shrinking and sinking
      let fade = 1;
      const fadeLen = kd === K_CLOD ? 0.55 : 1.1;
      if (age > life - fadeLen) fade = 1 - smooth(life - fadeLen, life, age);
      const sc = R * fade;

      const o = i * 16;
      if (st === 2) {
        const k = this.rest[i] / 0.085;
        const sy = sc * (1 - 0.88 * k);
        const sxz = sc * (1 + 1.6 * k);
        composeAxis(this.M, o, x, y - hcR * 0.5 * k, z, nX, nY, nZ, sxz, sy);
        aA[i * 4] = 0;
        aA[i * 4 + 2] = wob;
      } else if (K.rigid) {
        composeQ(this.M, o, x, y - (1 - fade) * R * 0.6, z, Q[q], Q[q + 1], Q[q + 2], Q[q + 3], sc, sc, sc);
        aA[i * 4] = 0;
        aA[i * 4 + 2] = wob;
      } else if (grounded) {
        const s = Math.max(-0.3, Math.min(0.6, sqq + (flatten > 0 ? flatten : 0.12)));
        const sy = 1 - (kd === K_JELLY ? 0.7 : 0.55) * s;
        const sxz = 1 / Math.sqrt(sy);
        composeAxis(this.M, o, x, y - (1 - fade) * R * 0.7, z, nX, nY, nZ, sc * sxz, sc * sy);
        aA[i * 4] = 0;
        aA[i * 4 + 2] = wob;
      } else {
        // in the air: long axis along the velocity; a tendril's tail runs back to where it started
        let ax = Ax[p];
        let ay = Ax[p + 1];
        let az = Ax[p + 2];
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (sp > 0.05) {
          const k = Math.min(1, dt * 22);
          ax += (vx / sp - ax) * k;
          ay += (vy / sp - ay) * k;
          az += (vz / sp - az) * k;
        }
        let il = 1 / Math.sqrt(ax * ax + ay * ay + az * az);
        ax *= il;
        ay *= il;
        az *= il;
        const str = 1 + Math.min(0.9, sp * 0.3) * K.str;
        let sy = sc * str;
        let T = this.T0[i] * Math.exp(-this.Tdec[i] * age);
        const pinT = this.pin[i];
        if (pinT > 0 && age < pinT) {
          const ox = P[p] - this.O[p];
          const oy = P[p + 1] - this.O[p + 1];
          const oz = P[p + 2] - this.O[p + 2];
          const dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
          if (dist > 1e-4) {
            const tp = Math.min(this.pinMax[i], Math.max(0, dist / Math.max(1e-4, sy) - 1));
            const w = smooth(pinT * 0.55, pinT, age);
            T = tp + (T - tp) * w;
            const k = 1 - w;
            ax += (ox / dist - ax) * k;
            ay += (oy / dist - ay) * k;
            az += (oz / dist - az) * k;
            il = 1 / Math.sqrt(ax * ax + ay * ay + az * az);
            ax *= il;
            ay *= il;
            az *= il;
          }
        }
        Ax[p] = ax;
        Ax[p + 1] = ay;
        Ax[p + 2] = az;
        aA[i * 4] = T;
        aA[i * 4 + 2] = wob;
        composeAxis(this.M, o, x, y, z, ax, ay, az, sc / Math.sqrt(str), sy);
      }
    }
    this.finish(hi);
    if (hi > 0) {
      this.aA.clearUpdateRanges();
      this.aA.addUpdateRange(0, hi * 4);
      this.aA.needsUpdate = true;
    }
  }
}
