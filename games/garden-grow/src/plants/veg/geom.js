// Geometry helpers for the vegetable plants: tubes that are re-bent as a
// plant grows, leaf grids with an "unfurled" morph target, soil crumbs and a
// small geometry merge (BufferGeometryUtils is not available).
import * as THREE from 'three';

const defaultFlex = (m) => (m / 0.4) * (m / 0.4);
const T = new THREE.Vector3();
const N = new THREE.Vector3();
const B = new THREE.Vector3();
const P = new THREE.Vector3();
const TMP = new THREE.Vector3();

// Several tubes in one geometry, so a plant's stems are one draw call. Each
// tube keeps a fixed number of rings; set() moves them along new centre
// points, so a stem can lengthen, arch and straighten every frame.
export class TubeSet {
  constructor(defs, { uvScale = 30 } = {}) {
    this.uvScale = uvScale;
    this.tubes = [];
    let nv = 0;
    let ni = 0;
    for (const d of defs) {
      const radial = d.radial ?? 6;
      this.tubes.push({ segs: d.segs, radial, v0: nv, u0: d.u0 ?? 0, u1: d.u1 ?? 1, thick: d.thick ?? 0.5 });
      nv += (d.segs + 1) * (radial + 1);
      ni += d.segs * radial * 6;
    }
    this.pos = new Float32Array(nv * 3);
    this.nor = new Float32Array(nv * 3);
    this.uv = new Float32Array(nv * 2);
    this.plant = new Float32Array(nv * 2);
    const idx = new (nv > 65000 ? Uint32Array : Uint16Array)(ni);
    let k = 0;
    for (const t of this.tubes) {
      const row = t.radial + 1;
      for (let i = 0; i < t.segs; i++) {
        for (let j = 0; j < t.radial; j++) {
          const a = t.v0 + i * row + j;
          const b = a + row;
          idx[k++] = a;
          idx[k++] = a + 1;
          idx[k++] = b;
          idx[k++] = b;
          idx[k++] = a + 1;
          idx[k++] = b + 1;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aPlant', new THREE.BufferAttribute(this.plant, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geometry = g;
    this.points = this.tubes.map((t) => Array.from({ length: t.segs + 1 }, () => new THREE.Vector3()));
  }

  // pts: Vector3[segs + 1] (defaults to this.points[i]); radius(s) with s 0..1
  // along the tube, or a number. flex(metresAlong, s) gives the breeze flex
  // (see windSway in shared.js); by default a stem 40 cm long bends 1.
  set(i, radius, pts = this.points[i], flex = defaultFlex) {
    const t = this.tubes[i];
    const { pos, nor, uv, plant } = this;
    const row = t.radial + 1;
    let along = 0;
    const d0 = pts[1].clone().sub(pts[0]);
    T.copy(d0).normalize();
    if (T.lengthSq() < 0.5) T.set(0, 1, 0);
    TMP.set(0, 1, 0);
    if (Math.abs(T.y) > 0.9) TMP.set(1, 0, 0);
    B.crossVectors(T, TMP).normalize();
    N.crossVectors(B, T).normalize();
    for (let i2 = 0; i2 <= t.segs; i2++) {
      const p = pts[i2];
      if (i2 > 0) along += p.distanceTo(pts[i2 - 1]);
      const a = pts[Math.max(0, i2 - 1)];
      const b = pts[Math.min(t.segs, i2 + 1)];
      TMP.subVectors(b, a);
      if (TMP.lengthSq() > 1e-14) {
        TMP.normalize();
        // parallel transport: keep the frame from twisting
        N.addScaledVector(TMP, -N.dot(TMP)).normalize();
        T.copy(TMP);
        B.crossVectors(T, N);
      }
      const s = i2 / t.segs;
      const r = typeof radius === 'number' ? radius : radius(s);
      const f = flex(along, s);
      for (let j = 0; j <= t.radial; j++) {
        const ang = (j / t.radial) * Math.PI * 2;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const nx = N.x * c + B.x * sn;
        const ny = N.y * c + B.y * sn;
        const nz = N.z * c + B.z * sn;
        const v = t.v0 + i2 * row + j;
        pos[v * 3] = p.x + nx * r;
        pos[v * 3 + 1] = p.y + ny * r;
        pos[v * 3 + 2] = p.z + nz * r;
        nor[v * 3] = nx;
        nor[v * 3 + 1] = ny;
        nor[v * 3 + 2] = nz;
        uv[v * 2] = t.u0 + (t.u1 - t.u0) * (j / t.radial);
        uv[v * 2 + 1] = along * this.uvScale;
        plant[v * 2] = f;
        plant[v * 2 + 1] = t.thick;
      }
    }
  }

  commit() {
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.attributes.aPlant.needsUpdate = true;
    g.computeBoundingSphere();
  }
}

// A grid over leaf space (u across 0..1, v along 0..1). shape(u, v, out)
// places each point; two shapes give a base and a morph target (folded bud
// -> open leaf). uvRect maps the grid into a texture atlas.
export function leafGrid(nu, nv, shapeFolded, shapeOpen, uvRect = [0, 0, 1, 1]) {
  const n = (nu + 1) * (nv + 1);
  const uv = new Float32Array(n * 2);
  const idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      uv[k * 2] = uvRect[0] + (uvRect[2] - uvRect[0]) * (i / nu);
      uv[k * 2 + 1] = uvRect[1] + (uvRect[3] - uvRect[1]) * (j / nv);
      if (i < nu && j < nv) {
        const a = k;
        const b = k + 1;
        const c = k + nu + 1;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
  }
  const build = (shape) => {
    const pos = new Float32Array(n * 3);
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const k = j * (nu + 1) + i;
        shape(i / nu, j / nv, P.set(0, 0, 0));
        pos[k * 3] = P.x;
        pos[k * 3 + 1] = P.y;
        pos[k * 3 + 2] = P.z;
      }
    }
    return pos;
  };
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('position', new THREE.BufferAttribute(build(shapeFolded), 3));
  g.computeVertexNormals();
  if (shapeOpen) {
    const tmp = new THREE.BufferGeometry();
    tmp.setIndex(idx);
    tmp.setAttribute('position', new THREE.BufferAttribute(build(shapeOpen), 3));
    tmp.computeVertexNormals();
    g.morphAttributes.position = [tmp.attributes.position];
    g.morphAttributes.normal = [tmp.attributes.normal];
  }
  return g;
}

// A static tube (for parts built once, e.g. a petiole inside a leaf
// geometry). points: Vector3[]; radius(s). Returns a geometry with an
// optional morph target from a second set of points.
export function staticTube(points, radius, radial = 5, uvRect = [0, 0, 0.05, 1], pointsOpen = null, flex = defaultFlex, thick = 0.5) {
  const segs = points.length - 1;
  const ts = new TubeSet([{ segs, radial, u0: uvRect[0], u1: uvRect[2], thick }], { uvScale: 1 });
  const tube = ts.points[0];
  const fill = (pts) => {
    for (let i = 0; i <= segs; i++) tube[i].copy(pts[i]);
    ts.set(0, radius, tube, flex);
  };
  fill(points);
  const g = new THREE.BufferGeometry();
  // v runs 0..1 along the tube inside the atlas strip
  const uv = ts.uv.slice();
  for (let i = 1; i < uv.length; i += 2) uv[i] = uvRect[1] + (uvRect[3] - uvRect[1]) * Math.floor((i >> 1) / (radial + 1)) / segs;
  g.setIndex(ts.geometry.index.clone());
  g.setAttribute('position', new THREE.BufferAttribute(ts.pos.slice(), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(ts.nor.slice(), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aPlant', new THREE.BufferAttribute(ts.plant.slice(), 2));
  if (pointsOpen) {
    fill(pointsOpen);
    g.morphAttributes.position = [new THREE.BufferAttribute(ts.pos.slice(), 3)];
    g.morphAttributes.normal = [new THREE.BufferAttribute(ts.nor.slice(), 3)];
  }
  return g;
}

// Merges indexed or non-indexed geometries with the same attributes
// (position, normal, uv, optional color) and the same morph targets.
export function mergeGeometries(list) {
  const names = Object.keys(list[0].attributes);
  const morphNames = Object.keys(list[0].morphAttributes);
  const out = new THREE.BufferGeometry();
  let total = 0;
  const idx = [];
  for (const g of list) {
    const count = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + total);
    else for (let i = 0; i < count; i++) idx.push(i + total);
    total += count;
  }
  for (const name of names) {
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name];
      for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) arr[o++] = a.getComponent(i, c);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const name of morphNames) {
    const n = list[0].morphAttributes[name].length;
    out.morphAttributes[name] = [];
    for (let m = 0; m < n; m++) {
      const arr = new Float32Array(total * 3);
      let o = 0;
      for (const g of list) {
        const a = g.morphAttributes[name]?.[m] ?? g.attributes[name];
        for (let i = 0; i < a.count; i++) for (let c = 0; c < 3; c++) arr[o++] = a.getComponent(i, c);
      }
      out.morphAttributes[name].push(new THREE.BufferAttribute(arr, 3));
    }
  }
  out.setIndex(total > 65000 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : idx);
  return out;
}

// Sets the plant attribute (flex, thickness) used by the shared plant
// materials, from fn(x, y, z, u, v) -> [flex, thick] on the base shape.
export function setPlantAttr(g, fn) {
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const arr = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const r = fn(p.getX(i), p.getY(i), p.getZ(i), uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    arr[i * 2] = r[0];
    arr[i * 2 + 1] = r[1];
  }
  g.setAttribute('aPlant', new THREE.BufferAttribute(arr, 2));
  return g;
}

// Turns absolute morph targets into offsets, so the breeze (added before
// morphing) is not scaled away as a leaf opens.
export function makeRelative(g) {
  for (const name of ['position', 'normal']) {
    const list = g.morphAttributes[name];
    if (!list) continue;
    const base = g.attributes[name];
    for (const a of list) for (let i = 0; i < a.array.length; i++) a.array[i] -= base.array[i];
  }
  g.morphTargetsRelative = true;
  return g;
}

// A lumpy little soil crumb (unit size), flat-faceted like a real clod.
export function crumbGeometry(seed = 1) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const h = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 3.1) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.7 + 0.25 * h(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)) + 0.25 * Math.sin(x * 3 + seed) * Math.sin(z * 2.6 + y * 1.7);
    p.setXYZ(i, x * k, y * k * 0.72, z * k);
  }
  // soft lumps: normals from the (squashed) sphere, not the facets
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    TMP.set(p.getX(i), p.getY(i) / 0.52, p.getZ(i)).normalize();
    n.setXYZ(i, TMP.x, TMP.y, TMP.z);
  }
  return g;
}

// Writes a transform into an InstancedMesh slot.
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
export function setInstance(mesh, i, pos, quat, scale) {
  S.set(scale, scale, scale);
  if (typeof scale !== 'number') S.copy(scale);
  M.compose(pos, quat ?? Q.identity(), S);
  mesh.setMatrixAt(i, M);
}

// Vertex colours (linear) from fn(x, y, z) -> [r, g, b].
export function colorize(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// A morph target that does not move (so still parts merge with moving ones).
export function still(g) {
  g.morphAttributes.position = [g.attributes.position.clone()];
  g.morphAttributes.normal = [g.attributes.normal.clone()];
  return g;
}

// Adds zero UVs where a part has none, so it merges with textured parts.
export function withUV(g) {
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
