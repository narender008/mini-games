// Geometry for the rigid and thin parts of a friend, built straight into the
// friend's rest space: eyes and eyelids, tapered tubes (horns, claws,
// antennae, whiskers), membranes stretched between spines (wings, fins,
// frills) and ribbons of hair (manes, tails). Each comes back with the
// attributes the friend materials expect; bones are bound by the caller.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

// orthonormal frame with z along dir and y as close to up as possible
export function frameFrom(dir, up = [0, 1, 0]) {
  const z = new THREE.Vector3(...dir).normalize();
  const u = new THREE.Vector3(...up);
  const x = new THREE.Vector3().crossVectors(u, z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return { x, y, z };
}

function setLook(g, look) {
  const n = g.attributes.position.count;
  const c = new THREE.Color(look.tint ?? 0xffffff);
  const t = new Float32Array(n * 3);
  const m = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    t[i * 3] = c.r;
    t[i * 3 + 1] = c.g;
    t[i * 3 + 2] = c.b;
    m[i * 4] = look.paint ?? 0;
    m[i * 4 + 1] = look.fur ?? 0;
    m[i * 4 + 2] = look.rough ?? 0.5;
    m[i * 4 + 3] = look.pat ?? 0;
  }
  g.setAttribute('aTint', new THREE.BufferAttribute(t, 3));
  g.setAttribute('aMix', new THREE.BufferAttribute(m, 4));
  return g;
}

// per-vertex tint from a function of the vertex position (rest space)
export function tintBy(g, fn) {
  const p = g.attributes.position;
  const t = g.attributes.aTint;
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), c, i);
    t.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

// Skin weights from a function of the vertex position: fn returns a list of
// [boneIndex, weight] pairs (up to four).
export function bindBy(g, fn) {
  const p = g.attributes.position;
  const n = p.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    let sum = 0;
    for (let k = 0; k < Math.min(4, w.length); k++) sum += w[k][1];
    for (let k = 0; k < Math.min(4, w.length); k++) {
      si[i * 4 + k] = w[k][0];
      sw[i * 4 + k] = sum > 0 ? w[k][1] / sum : 0;
    }
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

export function bindTo(g, bone) {
  return bindBy(g, () => [[bone, 1]]);
}

// ------------------------------------------------------------ eyes

// An eye ball of radius r at centre c looking along dir. aEye carries each
// vertex in the eye's own frame (radius 1, +z forward) for the iris shader.
export function eyeGeometry(c, r, dir, look = {}) {
  const g = new THREE.SphereGeometry(r, 36, 24);
  // put the pole on +z
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  const eye = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    eye[i * 3] = p.getX(i) / r;
    eye[i * 3 + 1] = p.getY(i) / r;
    eye[i * 3 + 2] = p.getZ(i) / r;
  }
  g.setAttribute('aEye', new THREE.BufferAttribute(eye, 3));
  const f = frameFrom(dir);
  _m.makeBasis(f.x, f.y, f.z).setPosition(c[0], c[1], c[2]);
  g.applyMatrix4(_m);
  g.deleteAttribute('uv');
  return setLook(g, { tint: 0xffffff, rough: 0.3, ...look });
}

// An upper eyelid: a cap a little larger than the eye, covering its top and
// back when open. Rotating it about the eye frame's x axis (positive angle
// = down) closes it over the eye. Returns the geometry and that axis.
export function lidGeometry(c, r, dir, look = {}, { lower = false } = {}) {
  const R = r * 1.07;
  // hemisphere covering +y of the eye frame, tipped back so its rim sits
  // just above the iris
  const g = new THREE.SphereGeometry(R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(lower ? Math.PI + 0.35 : -0.35);
  const f = frameFrom(dir);
  _m.makeBasis(f.x, f.y, f.z).setPosition(c[0], c[1], c[2]);
  g.applyMatrix4(_m);
  g.deleteAttribute('uv');
  setLook(g, { tint: 0xffffff, paint: 1, rough: 0.6, ...look });
  return { geometry: g, axis: f.x.clone() };
}

// ------------------------------------------------------------ tubes

// A tapered tube through points (rest space) with radii, rounded at the
// tip, for horns, claws, antennae and whiskers. rings: ridge count along
// the length (horn rings), depth as a fraction of the radius.
export function tubeGeometry(points, radii, { radial = 12, steps = 24, ridges = 0, ridgeDepth = 0.12, cap = true, twist = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const frames = curve.computeFrenetFrames(steps, false);
  const pos = [];
  const nor = [];
  const idx = [];
  const radiusAt = (t) => {
    const f = t * (radii.length - 1);
    const i = Math.min(radii.length - 2, Math.floor(f));
    const k = f - i;
    return radii[i] + (radii[i + 1] - radii[i]) * k;
  };
  const P = new THREE.Vector3();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    curve.getPointAt(t, P);
    let r = radiusAt(t);
    if (ridges > 0) r *= 1 - ridgeDepth * Math.pow(Math.abs(Math.sin(t * ridges * Math.PI)), 3);
    const N = frames.normals[s];
    const B = frames.binormals[s];
    for (let a = 0; a <= radial; a++) {
      const th = (a / radial) * Math.PI * 2 + twist * t;
      const cx = Math.cos(th), sy = Math.sin(th);
      const nx = N.x * cx + B.x * sy, ny = N.y * cx + B.y * sy, nz = N.z * cx + B.z * sy;
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
      nor.push(nx, ny, nz);
    }
  }
  const row = radial + 1;
  for (let s = 0; s < steps; s++)
    for (let a = 0; a < radial; a++) {
      const i0 = s * row + a;
      idx.push(i0, i0 + 1, i0 + row, i0 + 1, i0 + row + 1, i0 + row);
    }
  if (cap) {
    // a little dome at the tip
    const T = frames.tangents[steps];
    curve.getPointAt(1, P);
    const r = radiusAt(1);
    const tip = pos.length / 3;
    pos.push(P.x + T.x * r, P.y + T.y * r, P.z + T.z * r);
    nor.push(T.x, T.y, T.z);
    for (let a = 0; a < radial; a++) idx.push(steps * row + a, steps * row + a + 1, tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

export function withLook(g, look) {
  return setLook(g, look);
}

// ------------------------------------------------------------ membranes

// A membrane stretched from a root between spine tips, like a bat wing or a
// fin: consecutive tips are joined by an edge that sags inwards by `sag`
// (scalloped). The surface is gently cupped by `cup` along `normal`. Each
// vertex gets aSpan: 0 at the root, 1 at the edge (for bending weights).
export function fanGeometry(root, tips, { sag = 0.25, cup = 0.0, normal = [1, 0, 0], radial = 10, arc = 8 } = {}) {
  const R = new THREE.Vector3(...root);
  const T = tips.map((t) => new THREE.Vector3(...t));
  const Nn = new THREE.Vector3(...normal).normalize();
  const pos = [];
  const span = [];
  const idx = [];
  const E = new THREE.Vector3();
  const Q = new THREE.Vector3();
  for (let k = 0; k < T.length - 1; k++) {
    const a = T[k];
    const b = T[k + 1];
    const base = pos.length / 3;
    for (let j = 0; j <= arc; j++) {
      const u = j / arc;
      // edge point: straight between the tips, pulled toward the root in the middle
      E.lerpVectors(a, b, u);
      const pull = Math.sin(u * Math.PI) * sag;
      E.lerp(R, pull);
      for (let i = 0; i <= radial; i++) {
        const s = i / radial;
        Q.lerpVectors(R, E, s);
        const c = cup * Math.sin(s * Math.PI) * (0.6 + 0.4 * Math.sin(u * Math.PI));
        pos.push(Q.x + Nn.x * c, Q.y + Nn.y * c, Q.z + Nn.z * c);
        span.push(s);
      }
    }
    const row = radial + 1;
    for (let j = 0; j < arc; j++)
      for (let i = 0; i < radial; i++) {
        const i0 = base + j * row + i;
        idx.push(i0, i0 + row, i0 + 1, i0 + 1, i0 + row, i0 + row + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ hair

// A clump of hair: a flat, tapering ribbon along a curve, a little wider in
// the middle, twisted slightly. Many of these make a mane or a tail. aSpan
// runs 0 at the root to 1 at the tip.
export function ribbonGeometry(points, width, { steps = 16, twist = 0.4, taper = 1, side = [1, 0, 0] } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const pos = [];
  const span = [];
  const idx = [];
  const P = new THREE.Vector3();
  const Tn = new THREE.Vector3();
  const S = new THREE.Vector3(...side).normalize();
  const W = new THREE.Vector3();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, Tn);
    W.crossVectors(Tn, S);
    if (W.lengthSq() < 1e-8) W.set(0, 1, 0);
    W.normalize().applyAxisAngle(Tn, twist * t);
    const w = width * (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.6 + 0.2) * Math.PI)) * (1 - taper * t * t * 0.85);
    pos.push(P.x - W.x * w, P.y - W.y * w, P.z - W.z * w, P.x + W.x * w, P.y + W.y * w, P.z + W.z * w);
    span.push(t, t);
  }
  for (let s = 0; s < steps; s++) {
    const i0 = s * 2;
    idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// weights along a chain of bones by a 0..1 span attribute
export function bindChain(g, bones) {
  const sp = g.attributes.aSpan;
  const n = bones.length;
  return bindBy(g, (x, y, z, i) => {
    const f = sp.getX(i) * (n - 1);
    const a = Math.min(n - 1, Math.floor(f));
    const b = Math.min(n - 1, a + 1);
    const k = f - a;
    return a === b ? [[bones[a], 1]] : [[bones[a], 1 - k], [bones[b], k]];
  });
}

export { _v as scratch };
