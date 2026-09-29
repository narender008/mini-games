// Ground stains: paint, jelly and mud splats that stick to the ground and fade
// after about ten seconds. Each is an instanced 4 x 4 quad laid on the ground
// along world.normalAt, lifted a hair, with the four corner heights sampled
// from world.heightAt so it follows bumps and the rim of a crater. The look
// comes from the splat atlas (organic shapes with tendrils and drops) shaded
// as wet paint: glossy with a bump made from the shape's own thickness.
import * as THREE from 'three';
import { decalGeometry } from './geometry.js';
import { decalMaterial } from './materials.js';

const smooth = (a, b, x) => {
  const t = x < a ? 0 : x > b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

// half-extent of a decal quad per unit of blob radius: the atlas draws the body at
// 0.34 of the half extent, and a landed blob spreads to about 1.15 of its radius
const SIZE_PER_RADIUS = 3.4;

export class Decals {
  constructor(cap, ctx) {
    this.ctx = ctx;
    this.cap = cap;
    const geo = decalGeometry();
    const mesh = new THREE.InstancedMesh(geo, decalMaterial(), cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.mesh = mesh;
    this.aDecal = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aDecal.setUsage(THREE.DynamicDrawUsage);
    this.aCorner = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aCorner.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDecal', this.aDecal);
    geo.setAttribute('aCorner', this.aCorner);
    this.M = mesh.instanceMatrix.array;
    this.C = mesh.instanceColor.array;
    this.state = new Uint8Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.fadeLen = new Float32Array(cap);
    this.X = new Float32Array(cap);
    this.Z = new Float32Array(cap);
    this.head = 0;
    this.high = 0;
    this.spawned = false;
  }

  // x, z: where; radius: of the main body (metres); colour linear; cell: 0..7 in the atlas
  add(x, z, radius, cr, cg, cb, cell, gloss = 1, life = 10) {
    const ctx = this.ctx;
    const world = ctx.world;
    const cap = this.cap;
    // a dead slot near the head; if none within a short scan, the oldest (the head itself)
    let i = this.head;
    for (let n = 0; n < 24; n++) {
      if (this.state[i] === 0) break;
      i = i + 1 === cap ? 0 : i + 1;
    }
    if (this.state[i] !== 0) i = this.head;
    this.head = i + 1 === cap ? 0 : i + 1;
    if (i >= this.high) this.high = i + 1;
    const y = world.heightAt(x, z);
    const N = ctx.normalAt(x, z);
    const nx = N.x;
    const ny = N.y;
    const nz = N.z;
    // tangent basis of the ground, rotated by a random angle about the normal
    let ex = ny;
    let ey = -nx;
    let ez = 0;
    let il = 1 / Math.sqrt(ex * ex + ey * ey + ez * ez);
    ex *= il;
    ey *= il;
    const fx = ey * nz - ez * ny;
    const fy = ez * nx - ex * nz;
    const fz = ex * ny - ey * nx;
    const a = Math.random() * 6.2831853;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tx = ex * ca + fx * sa;
    const ty = ey * ca + fy * sa;
    const tz = ez * ca + fz * sa;
    // B = N x T
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;
    const S = radius * SIZE_PER_RADIUS;
    const o = i * 16;
    const M = this.M;
    M[o] = tx * S;
    M[o + 1] = ty * S;
    M[o + 2] = tz * S;
    M[o + 3] = 0;
    M[o + 4] = bx * S;
    M[o + 5] = by * S;
    M[o + 6] = bz * S;
    M[o + 7] = 0;
    M[o + 8] = nx;
    M[o + 9] = ny;
    M[o + 10] = nz;
    M[o + 11] = 0;
    M[o + 12] = x;
    M[o + 13] = y;
    M[o + 14] = z;
    M[o + 15] = 1;
    // corner offsets along the normal: how far the ground is above or below the plane
    const c = this.aCorner.array;
    const sx = tx * S;
    const sy = ty * S;
    const sz = tz * S;
    const ux = bx * S;
    const uy = by * S;
    const uz = bz * S;
    c[i * 4] = (world.heightAt(x - sx - ux, z - sz - uz) - (y - sy - uy)) * ny;
    c[i * 4 + 1] = (world.heightAt(x + sx - ux, z + sz - uz) - (y + sy - uy)) * ny;
    c[i * 4 + 2] = (world.heightAt(x - sx + ux, z - sz + uz) - (y - sy + uy)) * ny;
    c[i * 4 + 3] = (world.heightAt(x + sx + ux, z + sz + uz) - (y + sy + uy)) * ny;
    const d = this.aDecal.array;
    d[i * 4] = cell;
    d[i * 4 + 1] = 0;
    d[i * 4 + 2] = 0.72;
    d[i * 4 + 3] = gloss;
    const k = i * 3;
    this.C[k] = cr;
    this.C[k + 1] = cg;
    this.C[k + 2] = cb;
    this.state[i] = 1;
    this.age[i] = 0;
    this.life[i] = life;
    this.fadeLen[i] = 3;
    this.X[i] = x;
    this.Z[i] = z;
    this.spawned = true;
  }

  // a new crater reshapes the ground here: let the stains under it go quickly
  clearNear(x, z, r) {
    const r2 = r * r;
    for (let i = 0; i < this.high; i++) {
      if (this.state[i] === 0) continue;
      const dx = this.X[i] - x;
      const dz = this.Z[i] - z;
      if (dx * dx + dz * dz > r2) continue;
      const end = this.age[i] + 0.15;
      if (this.life[i] > end) {
        this.life[i] = end;
        this.fadeLen[i] = 0.15;
      }
    }
  }

  update(dt) {
    const d = this.aDecal.array;
    let hi = 0;
    let changed = false;
    for (let i = 0; i < this.high; i++) {
      if (this.state[i] === 0) continue;
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age >= life) {
        this.state[i] = 0;
        this.M.fill(0, i * 16, i * 16 + 16);
        d[i * 4 + 1] = 0;
        changed = true;
        continue;
      }
      hi = i + 1;
      const fl = this.fadeLen[i];
      const fadeIn = smooth(0, 0.07, age);
      const fadeOut = age > life - fl ? 1 - smooth(life - fl, life, age) : 1;
      if (age < 0.4 || fadeOut < 1) {
        d[i * 4 + 1] = fadeIn * fadeOut;
        const grow = smooth(0, 0.16, age);
        d[i * 4 + 2] = 0.72 + 0.28 * (1 - (1 - grow) * (1 - grow));
        changed = true;
      }
    }
    this.high = hi;
    this.mesh.count = hi;
    if (hi > 0) {
      const im = this.mesh.instanceMatrix;
      if (this.spawned || changed) {
        this.aDecal.clearUpdateRanges();
        this.aDecal.addUpdateRange(0, hi * 4);
        this.aDecal.needsUpdate = true;
      }
      if (this.spawned) {
        im.clearUpdateRanges();
        im.addUpdateRange(0, hi * 16);
        im.needsUpdate = true;
        const ic = this.mesh.instanceColor;
        ic.clearUpdateRanges();
        ic.addUpdateRange(0, hi * 3);
        ic.needsUpdate = true;
        this.aCorner.clearUpdateRanges();
        this.aCorner.addUpdateRange(0, hi * 4);
        this.aCorner.needsUpdate = true;
        this.spawned = false;
      }
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
