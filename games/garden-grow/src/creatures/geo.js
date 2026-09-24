// Small geometry kit for insect bodies: lathed body segments (head, thorax,
// abdomen) laid along +z, thin tapered tubes for legs and antennae, and a
// merge that bakes everything into one BufferGeometry per species.
//
// Pieces are plain arrays { p, n, uv, i, c?, layer? } so they can be
// transformed and merged cheaply before any GPU buffer exists.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

// A body segment lathed around the z axis from z0 (rear) to z1 (front).
// `radius(t)` gives the radius at t in 0..1 (0 at z0); rx, ry squash the
// cross-section; `sag(t)` lifts or lowers the centre line (y).
export function lathe({ z0, z1, radius, rx = 1, ry = 1, sag = null, segs = 18, rings = 16, x = 0, y = 0 }) {
  const p = [];
  const n = [];
  const uv = [];
  const i = [];
  const dz = z1 - z0;
  for (let r = 0; r <= rings; r++) {
    // cluster rings near the ends so the caps stay round
    const u = r / rings;
    const t = 0.5 - 0.5 * Math.cos(u * Math.PI);
    const z = z0 + dz * t;
    const rad = Math.max(0, radius(t));
    const eps = 1e-3;
    const slope = (radius(Math.min(1, t + eps)) - radius(Math.max(0, t - eps))) / ((Math.min(1, t + eps) - Math.max(0, t - eps)) * dz);
    const cy = y + (sag ? sag(t) : 0);
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      p.push(x + ca * rad * rx, cy + sa * rad * ry, z);
      // normal of an elliptic lathe: outward in the cross-section, tilted by the slope
      _n.set((ca / rx) * 1, (sa / ry) * 1, -slope * (rx + ry) * 0.5).normalize();
      if (rad < 1e-6) _n.set(0, 0, t < 0.5 ? -1 : 1);
      n.push(_n.x, _n.y, _n.z);
      uv.push(s / segs, t);
    }
  }
  const row = segs + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * row + s;
      const b = a + row;
      i.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  return { p, n, uv, i };
}

// An ellipsoid (for eyes, clubs, the ladybird's dome parts).
export function ellipsoid(cx, cy, cz, rx, ry, rz, segs = 14, rings = 10) {
  return lathe({ z0: cz - rz, z1: cz + rz, radius: (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)), rx, ry, segs, rings, x: cx, y: cy });
}

// A thin tube through `pts` (Vector3s) with radius r(t), t in 0..1.
export function tube(pts, r, radial = 5) {
  const p = [];
  const n = [];
  const uv = [];
  const i = [];
  const count = pts.length;
  const tan = new THREE.Vector3();
  const nor = new THREE.Vector3(0, 1, 0);
  const bin = new THREE.Vector3();
  let len = 0;
  const lens = [0];
  for (let k = 1; k < count; k++) {
    len += pts[k].distanceTo(pts[k - 1]);
    lens.push(len);
  }
  for (let k = 0; k < count; k++) {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(count - 1, k + 1)];
    tan.subVectors(b, a).normalize();
    // keep a stable frame: project the previous normal off the tangent
    nor.sub(_v.copy(tan).multiplyScalar(nor.dot(tan)));
    if (nor.lengthSq() < 1e-8) nor.set(tan.y, -tan.x, 0.3);
    nor.normalize();
    bin.crossVectors(tan, nor);
    const t = len > 0 ? lens[k] / len : 0;
    const rad = typeof r === 'function' ? r(t) : r;
    for (let s = 0; s <= radial; s++) {
      const ang = (s / radial) * Math.PI * 2;
      _n.copy(nor).multiplyScalar(Math.cos(ang)).addScaledVector(bin, Math.sin(ang));
      p.push(pts[k].x + _n.x * rad, pts[k].y + _n.y * rad, pts[k].z + _n.z * rad);
      n.push(_n.x, _n.y, _n.z);
      uv.push(s / radial, t);
    }
  }
  const row = radial + 1;
  for (let k = 0; k < count - 1; k++) {
    for (let s = 0; s < radial; s++) {
      const a = k * row + s;
      const b = a + row;
      i.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { p, n, uv, i };
}

// Smooth points through control points (Catmull-Rom), as Vector3s.
export function curve(ctrl, steps = 8) {
  const c = new THREE.CatmullRomCurve3(ctrl.map((q) => (q.isVector3 ? q : new THREE.Vector3(q[0], q[1], q[2]))));
  return c.getPoints(steps);
}

// Moves a piece by a Matrix4 (positions and normals).
export function transform(piece, m) {
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let k = 0; k < piece.p.length; k += 3) {
    _v.set(piece.p[k], piece.p[k + 1], piece.p[k + 2]).applyMatrix4(m);
    piece.p[k] = _v.x;
    piece.p[k + 1] = _v.y;
    piece.p[k + 2] = _v.z;
    _n.set(piece.n[k], piece.n[k + 1], piece.n[k + 2]).applyMatrix3(nm).normalize();
    piece.n[k] = _n.x;
    piece.n[k + 1] = _n.y;
    piece.n[k + 2] = _n.z;
  }
  return piece;
}

// Mirrors a piece in x (the other side of the body), fixing the winding.
export function mirrorX(piece) {
  const p = piece.p.slice();
  const n = piece.n.slice();
  for (let k = 0; k < p.length; k += 3) {
    p[k] = -p[k];
    n[k] = -n[k];
  }
  const i = [];
  for (let k = 0; k < piece.i.length; k += 3) i.push(piece.i[k], piece.i[k + 2], piece.i[k + 1]);
  return { ...piece, p, n, i, c: piece.c && piece.c.slice(), layer: piece.layer && piece.layer.slice() };
}

// Paints a piece with a colour per vertex: fn(x, y, z, out: THREE.Color).
export function paint(piece, fn) {
  const col = new THREE.Color();
  piece.c = [];
  for (let k = 0; k < piece.p.length; k += 3) {
    fn(piece.p[k], piece.p[k + 1], piece.p[k + 2], col);
    piece.c.push(col.r, col.g, col.b);
  }
  return piece;
}

// Bakes pieces into one indexed BufferGeometry.
export function merge(pieces) {
  let nv = 0;
  let ni = 0;
  for (const q of pieces) {
    nv += q.p.length / 3;
    ni += q.i.length;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const hasC = pieces.some((q) => q.c);
  const hasL = pieces.some((q) => q.layer);
  const col = hasC ? new Float32Array(nv * 3) : null;
  const lay = hasL ? new Float32Array(nv) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0;
  let io = 0;
  for (const q of pieces) {
    const cnt = q.p.length / 3;
    pos.set(q.p, vo * 3);
    nor.set(q.n, vo * 3);
    uv.set(q.uv, vo * 2);
    if (col) {
      if (q.c) col.set(q.c, vo * 3);
      else col.fill(1, vo * 3, (vo + cnt) * 3);
    }
    if (lay && q.layer) lay.set(q.layer, vo);
    for (let k = 0; k < q.i.length; k++) idx[io + k] = q.i[k] + vo;
    vo += cnt;
    io += q.i.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (lay) g.setAttribute('aLayer', new THREE.BufferAttribute(lay, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
