// A small sculpting kit for soft, toy-like friends. A friend's body is a
// signed distance field: ellipsoids, round cones, rounded boxes and tori,
// melted together with smooth unions (and carved with smooth subtractions,
// for a mouth or the hollow of an ear). The field is turned into one closed,
// smooth mesh with surface nets on a narrow band around the surface, each
// vertex pulled onto the true surface and given the field's own gradient as
// its normal, so there are no facets or seams anywhere.
//
// Every primitive belongs to a bone and carries a look: a base tint (linear
// RGB), how much of the child's painting shows on it (paint), how long its
// fur is (fur), its roughness and how much of the micro pattern (scales,
// pleats) it has. The same smooth blends that melt the shapes together blend
// the looks and the bone weights, so a leg flows into the body in shape,
// colour and movement alike; a few rounds of smoothing over the mesh then
// soften the weights so joints bend without creasing.
//
// Rigid parts (eyes, lids, horns, claws, wings) are ordinary geometry built
// in the same rest space and bound to a single bone, so everything a friend
// is made of shares one skeleton and one idea of where the painting lies.
import * as THREE from 'three';

import { meshField, LOOK_SIZE } from './sculptcore.js';

function frame(rot) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  const e = m.elements;
  // inverse of a rotation is its transpose: rows of m
  return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
}

export { LOOK_SIZE };

// One shared worker meshes friends off the main thread; if workers are
// unavailable (or fail) the same code runs here instead.
let worker = null;
let workerBroken = false;
let jobId = 0;
const jobs = new Map();

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./sculpt-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const job = jobs.get(e.data.id);
      if (!job) return;
      jobs.delete(e.data.id);
      if (e.data.error) job.reject(new Error(e.data.error));
      else job.resolve(e.data.out);
    };
    worker.onerror = () => {
      workerBroken = true;
      worker = null;
      for (const [, job] of jobs) job.fallback();
      jobs.clear();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

function runMesher(prims, nb, opts) {
  const w = getWorker();
  if (!w) return Promise.resolve(meshField(prims, nb, opts));
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    jobs.set(id, { resolve, reject, fallback: () => resolve(meshField(prims, nb, opts)) });
    w.postMessage({ id, prims, nb, opts });
  });
}

function toLinear(t) {
  if (Array.isArray(t)) return t;
  const c = new THREE.Color(t);
  return [c.r, c.g, c.b];
}

// ------------------------------------------------------------ sculpt

export class Sculpt {
  constructor() {
    this.bones = []; // { name, parent, pos: [x,y,z] }
    this.index = {};
    this.prims = [];
    // default look for primitives that don't say
    this.look = { tint: [0.8, 0.8, 0.8], paint: 1, fur: 0, rough: 0.6, pat: 0 };
  }

  // A bone at a rest-space position. Parent by name (null for the root).
  bone(name, parent, pos) {
    if (name in this.index) throw new Error(`bone ${name} twice`);
    this.index[name] = this.bones.length;
    this.bones.push({ name, parent, pos: [...pos] });
    return this;
  }

  // mirrored pair of bones: name + 'L' at +x, name + 'R' at -x
  bones2(name, parent, pos) {
    const pl = parent && parent + 'L' in this.index ? parent + 'L' : parent;
    const pr = parent && parent + 'R' in this.index ? parent + 'R' : parent;
    this.bone(name + 'L', pl, pos);
    this.bone(name + 'R', pr, [-pos[0], pos[1], pos[2]]);
    return this;
  }

  setLook(look) {
    this.look = { ...this.look, ...look, tint: look.tint !== undefined ? toLinear(look.tint) : this.look.tint };
    return this;
  }

  _add(p, o) {
    const look = { ...this.look, ...o };
    look.tint = o.tint !== undefined ? toLinear(o.tint) : this.look.tint;
    p.k = o.k ?? 0.02;
    p.sub = !!o.sub;
    p.look = [look.tint[0], look.tint[1], look.tint[2], look.paint, look.fur, look.rough, look.pat];
    p.boneName = o.bone ?? null;
    this.prims.push(p);
    if (o.sym) {
      const m = { ...p, mirrorOf: p };
      mirrorPrim(m);
      if (m.boneName && m.boneName.endsWith('L')) m.boneName = m.boneName.slice(0, -1) + 'R';
      this.prims.push(m);
    }
    return this;
  }

  ellipsoid(c, r, o = {}) {
    return this._add({ type: 0, c: [...c], r: [...r], m: o.rot ? frame(o.rot) : null }, o);
  }

  sphere(c, r, o = {}) {
    return this.ellipsoid(c, [r, r, r], o);
  }

  // round cone from a (radius ra) to b (radius rb)
  cone(a, b, ra, rb, o = {}) {
    return this._add({ type: 1, a: [...a], b: [...b], ra, rb }, o);
  }

  // a chain of round cones through points with radii
  chain(points, radii, o = {}) {
    for (let i = 0; i < points.length - 1; i++) {
      const bone = Array.isArray(o.bones) ? o.bones[Math.min(i, o.bones.length - 1)] : o.bone;
      this.cone(points[i], points[i + 1], radii[i], radii[i + 1], { ...o, bone });
    }
    return this;
  }

  box(c, half, radius, o = {}) {
    return this._add({ type: 2, c: [...c], h: [...half], rr: radius, m: o.rot ? frame(o.rot) : null }, o);
  }

  // ring of radius R and thickness r, in the plane given by rot (default xz)
  torus(c, R, r, o = {}) {
    return this._add({ type: 3, c: [...c], R, r, m: o.rot ? frame(o.rot) : null }, o);
  }

  // ------------------------------------------------------------ evaluation

  _prepare() {
    for (const p of this.prims) {
      if (p.type === 1) {
        p.ax = p.a[0]; p.ay = p.a[1]; p.az = p.a[2];
        p.bx = p.b[0]; p.by = p.b[1]; p.bz = p.b[2];
        p.r1 = p.ra; p.r2 = p.rb;
        p.l2 = Math.max(1e-10, (p.bx - p.ax) ** 2 + (p.by - p.ay) ** 2 + (p.bz - p.az) ** 2);
        // guard: one sphere swallowing the other breaks the formula
        const l = Math.sqrt(p.l2);
        if (Math.abs(p.r1 - p.r2) >= l) {
          if (p.r1 > p.r2) p.r2 = Math.max(0.0005, p.r1 - l * 0.98);
          else p.r1 = Math.max(0.0005, p.r2 - l * 0.98);
        }
        p.bc = [(p.ax + p.bx) / 2, (p.ay + p.by) / 2, (p.az + p.bz) / 2];
        p.br = l / 2 + Math.max(p.r1, p.r2);
      } else if (p.type === 0) {
        p.bc = p.c;
        p.br = Math.max(...p.r);
      } else if (p.type === 2) {
        p.bc = p.c;
        p.br = Math.hypot(...p.h);
      } else {
        p.bc = p.c;
        p.br = p.R + p.r;
      }
      p.bone = p.boneName !== null && p.boneName in this.index ? this.index[p.boneName] : -1;
      if (p.boneName !== null && p.bone < 0) throw new Error(`no bone ${p.boneName}`);
    }
  }

  // Mesh the field (in a worker when one is available, so the page keeps
  // animating) and return a BufferGeometry with skinning and look attributes.
  async build({ voxel = 0.005, smooth = 8 } = {}) {
    this._prepare();
    const prims = this.prims.map(({ mirrorOf, ...p }) => p);
    const nb = this.bones.length;
    const out = await runMesher(prims, nb, { voxel, smooth });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(out.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(out.skinWeight, 4));
    g.setAttribute('aTint', new THREE.BufferAttribute(out.tint, 3));
    g.setAttribute('aMix', new THREE.BufferAttribute(out.mix, 4));
    g.setIndex(new THREE.BufferAttribute(out.index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  // ------------------------------------------------------------ skeleton

  // Bones for a SkinnedMesh, from the rest positions (no rest rotations:
  // every bone starts aligned with the creature's space).
  skeleton() {
    const bones = this.bones.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      return bone;
    });
    this.bones.forEach((b, i) => {
      const bone = bones[i];
      if (b.parent) {
        const pi = this.index[b.parent];
        const pp = this.bones[pi].pos;
        bone.position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
        bones[pi].add(bone);
      } else bone.position.set(...b.pos);
    });
    const root = bones[0];
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    const byName = {};
    bones.forEach((b) => (byName[b.name] = b));
    return { skeleton, root, bones: byName, list: bones };
  }
}

function mirrorPrim(p) {
  const mx = (v) => [-v[0], v[1], v[2]];
  if (p.c) p.c = mx(p.c);
  if (p.a) p.a = mx(p.a);
  if (p.b) p.b = mx(p.b);
  if (p.m) {
    // conjugate the rotation by the x mirror: flip the signs of the x row and x column
    const m = [...p.m];
    m[1] = -m[1]; m[2] = -m[2]; m[3] = -m[3]; m[6] = -m[6];
    p.m = m;
  }
}

// ------------------------------------------------------------ rigid parts

// Give an ordinary geometry (already placed in the creature's rest space) the
// attributes a friend's materials expect, bound wholly to one bone.
export function rigid(geometry, boneIndex, look = {}) {
  const g = geometry.index ? geometry : geometry;
  const n = g.attributes.position.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = boneIndex;
    sw[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const tint = toLinear(look.tint ?? 0xffffff);
  const t = new Float32Array(n * 3);
  const m = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    t.set(tint, i * 3);
    m[i * 4] = look.paint ?? 0;
    m[i * 4 + 1] = look.fur ?? 0;
    m[i * 4 + 2] = look.rough ?? 0.5;
    m[i * 4 + 3] = look.pat ?? 0;
  }
  g.setAttribute('aTint', new THREE.BufferAttribute(t, 3));
  g.setAttribute('aMix', new THREE.BufferAttribute(m, 4));
  return g;
}

// Merge several geometries that share the same attributes into one.
export function mergeGeometries(list) {
  const out = new THREE.BufferGeometry();
  const names = Object.keys(list[0].attributes);
  let vtx = 0;
  let idx = 0;
  for (const g of list) {
    vtx += g.attributes.position.count;
    idx += g.index ? g.index.count : g.attributes.position.count;
  }
  for (const name of names) {
    const a0 = list[0].attributes[name];
    const arr = new a0.array.constructor(vtx * a0.itemSize);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name];
      arr.set(a.array.subarray(0, a.count * a.itemSize), o);
      o += a.count * a.itemSize;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
  }
  const index = new (vtx > 65535 ? Uint32Array : Uint16Array)(idx);
  let o = 0;
  let base = 0;
  for (const g of list) {
    if (g.index) for (let i = 0; i < g.index.count; i++) index[o++] = g.index.array[i] + base;
    else for (let i = 0; i < g.attributes.position.count; i++) index[o++] = i + base;
    base += g.attributes.position.count;
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
