// Geometry helpers for the garden props: merging many small parts into one
// mesh per material, timber with UVs that follow the grain, lathes mapped by
// height, and a little seeded jitter so nothing is machine-perfect.
import * as THREE from 'three';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

// Moves a geometry in place: { x, y, z, rx, ry, rz, s (number or [x,y,z]) }.
export function place(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, order = 'XYZ' } = {}) {
  E.set(rx, ry, rz, order);
  Q.setFromEuler(E);
  if (Array.isArray(s)) S.set(s[0], s[1], s[2]);
  else S.set(s, s, s);
  M.compose(V.set(x, y, z), Q, S);
  geo.applyMatrix4(M);
  return geo;
}

// Merges geometries into one. Missing colours default to white, missing UVs
// to zero, so parts can be mixed freely. Indexed parts keep their indices.
export function merge(list) {
  const geos = list.filter(Boolean);
  const indexed = geos.every((g) => g.index);
  const parts = indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = new Set();
  for (const g of parts) for (const n of Object.keys(g.attributes)) names.add(n);
  let count = 0;
  let icount = 0;
  for (const g of parts) {
    count += g.attributes.position.count;
    if (indexed) icount += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = name === 'uv' ? 2 : name === 'color' ? parts.find((g) => g.attributes.color).attributes.color.itemSize : 3;
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const g of parts) {
      const a = g.attributes[name];
      const n = g.attributes.position.count;
      if (a) {
        if (a.itemSize === size && !a.isInterleavedBufferAttribute) arr.set(a.array.subarray(0, n * size), o);
        else for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[o + i * size + k] = k < a.itemSize ? a.getComponent(i, k) : 1;
      } else if (name === 'color') arr.fill(1, o, o + n * size);
      o += n * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  if (indexed) {
    const idx = count > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
    let o = 0;
    let base = 0;
    for (const g of parts) {
      const src = g.index.array;
      for (let i = 0; i < g.index.count; i++) idx[o + i] = src[i] + base;
      o += g.index.count;
      base += g.attributes.position.count;
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Paints a per-vertex colour (for baked darkening: inside pots, under rims,
// down in crevices). `fn(x, y, z, nx, ny, nz)` returns a grey level or [r,g,b].
export function shade(geo, fn) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
    if (typeof v === 'number') c.set([v, v, v], i * 3);
    else c.set(v, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// ---------------------------------------------------------------- timber

// The wood atlas (see textures.js): long grain fills v 0.25..1 and covers
// 1.2 m along the grain by 0.4 m across; one end-grain tile fills v 0..0.25
// and covers 0.3 m square.
export const GRAIN = { len: 1.2, across: 0.4, v0: 0.25, v1: 1, endSize: 0.3, ends: true };
// The painted-timber texture: 1.2 m along the grain by 0.3 m across, no ends.
export const PAINT = { len: 1.2, across: 0.3, v0: 0, v1: 1, endSize: 0.3, ends: false };

// Re-maps a timber part's UVs so the grain runs along `axis` ('x' | 'y' |
// 'z'), faces across the grain show end grain, and each part picks its own
// patch of the atlas (rnd: a seeded random function).
export function grainUV(geo, axis, rnd, { atlas = GRAIN, pith = false } = {}) {
  const across = atlas.across;
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  const A = { x: 0, y: 1, z: 2 }[axis];
  const offU = rnd();
  const span = atlas.v1 - atlas.v0;
  const face = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  // boards are sawn off-centre, so their ends show arcs of the rings; a
  // whole log shows the pith in the middle
  const endOff = pith ? [0, 0] : [(rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3];
  // how far across the part reaches, so its patch stays inside the atlas
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
  const mins = [bb.min.x, bb.min.y, bb.min.z];
  const mid = [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2];
  const offs = [0, 1, 2].map((k) => (Math.max(0, span - (ext[k] / across) * span) * rnd()));
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    face[0] = Math.abs(n.x);
    face[1] = Math.abs(n.y);
    face[2] = Math.abs(n.z);
    const end = atlas.ends && face[A] > 0.72;
    // the coordinate across the grain on this face: the axis that is neither
    // the grain nor the face normal
    let k = 0;
    let best = 2;
    for (let q = 0; q < 3; q++) if (q !== A && face[q] < best) (best = face[q]), (k = q);
    for (let j = 0; j < 3; j++) {
      const v = [p.getX(i + j), p.getY(i + j), p.getZ(i + j)];
      if (end) {
        // end grain: the two axes other than the grain
        const e = [0, 1, 2].filter((q) => q !== A);
        const s = 0.5 + (v[e[0]] - mid[e[0]]) / GRAIN.endSize + endOff[0];
        const t = 0.5 + (v[e[1]] - mid[e[1]]) / GRAIN.endSize + endOff[1];
        uv.setXY(i + j, Math.min(0.97, Math.max(0.03, s)), Math.min(0.97, Math.max(0.03, t)) * GRAIN.v0);
      } else {
        uv.setXY(i + j, v[A] / atlas.len + offU, atlas.v0 + offs[k] + ((v[k] - mins[k]) / across) * span);
      }
    }
  }
  g.setAttribute('uv', uv);
  return g;
}

// A plank or post: length along x, height along y, thickness along z,
// centred on the origin. Long arrises are rounded (r) and the ends chamfered
// (b), because a perfectly sharp box is what gives CG timber away.
export function plankGeo(len, h, t, { r = 0.004, b = 0.003, seg = 1 } = {}) {
  r = Math.min(r, h * 0.45, t * 0.45);
  const hw = t / 2 - r - b;
  const hh = h / 2 - r - b;
  const shape = new THREE.Shape();
  roundRect(shape, -hw - r, -hh - r, (hw + r) * 2, (hh + r) * 2, r, seg);
  const g = new THREE.ExtrudeGeometry(shape, { depth: len - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: seg });
  g.translate(0, 0, -(len - 2 * b) / 2);
  g.rotateY(Math.PI / 2); // length along x
  return g;
}

function roundRect(shape, x, y, w, h, r, seg) {
  if (r <= 0.0005) {
    shape.moveTo(x, y);
    shape.lineTo(x + w, y);
    shape.lineTo(x + w, y + h);
    shape.lineTo(x, y + h);
    shape.closePath();
    return;
  }
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  void seg;
}

// Nudges vertices a little (seeded), for hand-made unevenness. Vertices at
// the same position move together so the surface stays closed.
export function jitter(geo, amount, rnd, scale = 1) {
  const p = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let d = seen.get(key);
    if (!d) {
      d = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount * scale, (rnd() - 0.5) * amount];
      seen.set(key, d);
    }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  p.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------- lathes

// A lathe from a profile of [radius, y] points (bottom to top, and back down
// the inside), with u around and v = y / vScale so painted textures stay
// upright whatever the profile does. Smooth normals, indexed. `wobble(a, y)`
// may return a small radius change for hand-thrown unevenness.
export function lathe(profile, segments = 48, { vScale = 1, wobble = null, uRepeat = 1 } = {}) {
  const rows = profile.length;
  const cols = segments + 1;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  for (let j = 0; j < rows; j++) {
    const [r, y] = profile[j];
    for (let i = 0; i < cols; i++) {
      const a = (i / segments) * Math.PI * 2;
      const rr = r + (wobble && r > 0 ? wobble(a, y) : 0);
      const o = j * cols + i;
      pos[o * 3] = Math.sin(a) * rr;
      pos[o * 3 + 1] = y;
      pos[o * 3 + 2] = Math.cos(a) * rr;
      uv[o * 2] = (i / segments) * uRepeat;
      uv[o * 2 + 1] = y / vScale;
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the seam column gets averaged normals so there is no crease
  const n = g.attributes.normal;
  for (let j = 0; j < rows; j++) {
    const a = j * cols;
    const b = a + segments;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

// A flat quad (for leaf cards and far silhouettes) facing +z, centred at
// its bottom middle.
export function card(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  return g;
}
