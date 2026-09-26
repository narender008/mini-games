// Shared kit for the friendly animals.
//
// MeshBuilder makes each animal's rest pose from a few smooth parts in its
// own space (facing -z, metres): lofted bodies (superellipse rings along a
// spine in the y-z plane) and airfoil fins lofted from root to tip. Every
// vertex carries aPart (which part it belongs to) and aSurf (where it sits on
// that part: along the body, up/down the side, across a fin), so the
// fragment shader can paint countershading, scales or feathers that follow
// the body however it bends.
//
// animalMaterial() patches a MeshPhysicalMaterial: the vertex shader bends
// the rest pose (a fluke beat, a tail wiggle, a flapping wing) and the
// fragment shader paints it. The same bend goes into a matching depth
// material, so shadows move with the animal.
//
// Plus small helpers for moving around the boat and the shore.
import * as THREE from 'three';
import { TAU, clamp } from '../config.js';

// ------------------------------------------------------------ curves

// A smooth curve through points [[x, y], ...] (x increasing), monotone cubic
// so profiles never overshoot into bumps. Returns f(x).
export function curve1d(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// Several named profiles sharing one x axis: table rows are [x, a, b, c...].
export function profiles(names, rows) {
  const out = {};
  names.forEach((name, k) => {
    out[name] = curve1d(rows.map((r) => [r[0], r[k + 1]]));
  });
  return out;
}

// ------------------------------------------------------------ mesh builder

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _o = new THREE.Vector3();

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.part = [];
    this.surf = [];
    this.ctr = []; // a point inside the solid for each vertex, to face triangles outwards
    this.idx = [];
  }

  get count() {
    return this.pos.length / 3;
  }

  vert(x, y, z, part, s, q, k, cx = 0, cy = 0, cz = 0) {
    this.pos.push(x, y, z);
    this.part.push(part);
    this.surf.push(s, q, k);
    this.ctr.push(cx, cy, cz);
    return this.count - 1;
  }

  tri(a, b, c) {
    this.idx.push(a, b, c);
  }

  // A body lofted along a spine in the y-z plane, front (t = 0) to back
  // (t = 1). at(t, out) fills out = { y, z, w, up, dn, e, s }: the spine
  // point, half width, height above and depth below the spine, the
  // superellipse exponent (2 = ellipse, more is boxier, less is diamond) and
  // the paint coordinate s (defaults to t); e2, if set, is the exponent of
  // the lower half (a flatter belly). Ends are closed with a point.
  loft({ rings, segs, at, part = 0, cluster = 1 }) {
    const c = { e: 2 };
    const c0 = { e: 2 };
    const c1 = { e: 2 };
    const first = [];
    for (let r = 0; r <= rings; r++) {
      const u = r / rings;
      const t = u + (0.5 - 0.5 * Math.cos(Math.PI * u) - u) * cluster;
      at(t, c);
      at(Math.max(0, t - 1e-3), c0);
      at(Math.min(1, t + 1e-3), c1);
      let ty = c1.y - c0.y;
      let tz = c1.z - c0.z;
      const tl = Math.hypot(ty, tz) || 1;
      ty /= tl;
      tz /= tl;
      const ny = tz;
      const nz = -ty;
      const s = c.s ?? t;
      first.push(this.count);
      for (let j = 0; j < segs; j++) {
        const th = (j / segs) * TAU;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        const e = sn < 0 && c.e2 ? c.e2 : c.e ?? 2;
        const fx = Math.sign(cs) * Math.pow(Math.abs(cs), 2 / e);
        const fy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / e);
        const yy = (fy >= 0 ? c.up : c.dn) * fy;
        this.vert(c.w * fx, c.y + ny * yy, c.z + nz * yy, part, s, fy, j / segs, 0, c.y, c.z);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let j = 0; j < segs; j++) {
        const a = first[r] + j;
        const b = first[r + 1] + j;
        const cc = first[r + 1] + ((j + 1) % segs);
        const d = first[r] + ((j + 1) % segs);
        this.tri(a, d, cc);
        this.tri(a, cc, b);
      }
    }
    // poles: a point just beyond each end ring, its "inside" just behind it
    for (const [r, t, dir] of [
      [0, 0, -1],
      [rings, 1, 1],
    ]) {
      at(t, c);
      at(clamp(t - dir * 2e-3, 0, 1), c0);
      const dy = c.y - c0.y;
      const dz = c.z - c0.z;
      const l = Math.hypot(dy, dz) || 1;
      const reach = Math.min(c.w, c.up, c.dn) * 0.6;
      const pole = this.vert(0, c.y + (dy / l) * reach, c.z + (dz / l) * reach, part, c.s ?? t, 0, 0, 0, c0.y, c0.z);
      for (let j = 0; j < segs; j++) this.tri(pole, first[r] + j, first[r] + ((j + 1) % segs));
    }
  }

  // An airfoil fin lofted through sections from root (buried in the body) to
  // tip. Each section is { le, te, th, side }: leading and trailing edge
  // points (Vector3), thickness as a fraction of the chord and the unit
  // thickness direction. sOf(x, y, z) gives the paint coordinate along the
  // body. Paint q is +1 on the `side` face and -1 on the other, k runs root
  // to tip.
  fin({ sections, part, chord = 6, sOf = () => 0 }) {
    const nc = chord;
    const ring = 2 * nc;
    const first = [];
    const p = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const n = sections.length;
    for (let k = 0; k < n; k++) {
      const S = sections[k];
      const len = S.le.distanceTo(S.te);
      mid.addVectors(S.le, S.te).multiplyScalar(0.5);
      first.push(this.count);
      for (let j = 0; j < ring; j++) {
        // upper face LE -> TE, lower face TE -> LE, cosine spaced
        const upper = j <= nc;
        const jj = upper ? j : ring - j;
        const cc = 0.5 - 0.5 * Math.cos((Math.PI * jj) / nc);
        const ht = 5 * S.th * len * (0.2969 * Math.sqrt(cc) - 0.126 * cc - 0.3516 * cc * cc + 0.2843 * cc * cc * cc - 0.1036 * cc * cc * cc * cc);
        p.lerpVectors(S.le, S.te, cc).addScaledVector(S.side, upper ? ht : -ht);
        this.vert(p.x, p.y, p.z, part, sOf(p.x, p.y, p.z), upper ? 1 : -1, k / (n - 1), mid.x, mid.y, mid.z);
      }
    }
    for (let k = 0; k < n - 1; k++) {
      for (let j = 0; j < ring; j++) {
        const a = first[k] + j;
        const b = first[k + 1] + j;
        const cc = first[k + 1] + ((j + 1) % ring);
        const d = first[k] + ((j + 1) % ring);
        this.tri(a, d, cc);
        this.tri(a, cc, b);
      }
    }
    // tip: a point a little beyond the last section, inside is the last section
    const L = sections[n - 1];
    const P = sections[n - 2];
    mid.addVectors(L.le, L.te).multiplyScalar(0.5);
    p.addVectors(P.le, P.te).multiplyScalar(0.5);
    const tipDir = _o.subVectors(mid, p);
    const tl = tipDir.length() || 1;
    const reach = Math.min(L.le.distanceTo(L.te) * 0.5, tl * 0.8);
    tipDir.multiplyScalar(reach / tl);
    const tip = this.vert(mid.x + tipDir.x, mid.y + tipDir.y, mid.z + tipDir.z, part, sOf(mid.x, mid.y, mid.z), 0, 1, mid.x, mid.y, mid.z);
    for (let j = 0; j < ring; j++) this.tri(tip, first[n - 1] + j, first[n - 1] + ((j + 1) % ring));
  }

  // An ellipsoid (eyes, small heads), rings along its own axis `dir`.
  ellipsoid({ c, r, part, rings = 8, segs = 10, s = 0 }) {
    this.loft({
      rings,
      segs,
      part,
      cluster: 1,
      at: (t, o) => {
        const k = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
        o.y = c[1];
        o.z = c[2] + (2 * t - 1) * r[2];
        o.w = Math.max(1e-4, r[0] * k);
        o.up = o.dn = Math.max(1e-4, r[1] * k);
        o.e = 2;
        o.s = s;
      },
    });
    // loft places the ring centre at x = 0: shift the new vertices
    if (c[0]) {
      const start = this.count - ((rings + 1) * segs + 2);
      for (let v = start; v < this.count; v++) {
        this.pos[v * 3] += c[0];
        this.ctr[v * 3] += c[0];
      }
    }
  }

  // Mirrors vertices [from, to) into a new copy across x (for left/right
  // parts) and returns nothing; windings are fixed in build().
  mirrorX(from, to, fromTri, toTri) {
    const base = this.count;
    for (let v = from; v < to; v++) {
      this.vert(-this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2], this.part[v], this.surf[v * 3], this.surf[v * 3 + 1], this.surf[v * 3 + 2], -this.ctr[v * 3], this.ctr[v * 3 + 1], this.ctr[v * 3 + 2]);
    }
    for (let i = fromTri; i < toTri; i++) this.idx.push(this.idx[i] - from + base);
  }

  // Marks a span of vertices, so a part can be mirrored afterwards.
  mark() {
    return { v: this.count, i: this.idx.length };
  }

  mirrorSince(m) {
    this.mirrorX(m.v, this.count, m.i, this.idx.length);
  }

  // Apply fn(v: Vector3) to vertex positions (and their inside points) since mark m.
  transformSince(m, fn) {
    const v = new THREE.Vector3();
    for (let i = m.v; i < this.count; i++) {
      v.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      fn(v);
      this.pos[i * 3] = v.x;
      this.pos[i * 3 + 1] = v.y;
      this.pos[i * 3 + 2] = v.z;
      v.set(this.ctr[i * 3], this.ctr[i * 3 + 1], this.ctr[i * 3 + 2]);
      fn(v);
      this.ctr[i * 3] = v.x;
      this.ctr[i * 3 + 1] = v.y;
      this.ctr[i * 3 + 2] = v.z;
    }
  }

  build() {
    // face every triangle away from its inside point
    const P = this.pos;
    const C = this.ctr;
    const I = this.idx;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t];
      const b = I[t + 1];
      const c = I[t + 2];
      _a.set(P[a * 3], P[a * 3 + 1], P[a * 3 + 2]);
      _b.set(P[b * 3], P[b * 3 + 1], P[b * 3 + 2]);
      _c.set(P[c * 3], P[c * 3 + 1], P[c * 3 + 2]);
      _n.subVectors(_b, _a).cross(_o.subVectors(_c, _a));
      if (_n.lengthSq() < 1e-16) continue;
      _o.set(C[a * 3] + C[b * 3] + C[c * 3], C[a * 3 + 1] + C[b * 3 + 1] + C[c * 3 + 1], C[a * 3 + 2] + C[b * 3 + 2] + C[c * 3 + 2]).multiplyScalar(1 / 3);
      _a.add(_b).add(_c).multiplyScalar(1 / 3).sub(_o);
      if (_n.dot(_a) < 0) {
        I[t + 1] = c;
        I[t + 2] = b;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.surf, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------ GLSL

// Hash and value noise (after Inigo Quilez), cheap cell noise for scales and
// scutes. `an` prefix keeps clear of three.js names.
export const NOISE_GLSL = /* glsl */ `
float anHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float anHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float anNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(anHash(i), anHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(anHash(i + vec3(0.0, 1.0, 0.0)), anHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(anHash(i + vec3(0.0, 0.0, 1.0)), anHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(anHash(i + vec3(0.0, 1.0, 1.0)), anHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float anFbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * anNoise(p);
    p = p * 2.03 + vec3(11.7, 3.1, 7.3);
    a *= 0.5;
  }
  return s;
}
// Cell noise in 2D: x = distance to the nearest cell border, y = that cell's
// random id, z = distance to its centre.
vec3 anCells(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  vec2 mg;
  vec2 mr;
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(anHash2(n + g), anHash2(n + g + 19.19));
    o = 0.5 + 0.38 * sin(6.2831 * o);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float bd = 8.0;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = vec2(anHash2(n + g), anHash2(n + g + 19.19));
    o = 0.5 + 0.38 * sin(6.2831 * o);
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001) bd = min(bd, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec3(bd, anHash2(n + mg + 7.7), sqrt(md));
}
`;

const VARYINGS = /* glsl */ `
varying vec3 vRest;
varying vec3 vRestN;
varying vec3 vSurf;
varying float vPart;
`;

// Builds the material and its shadow depth twin.
//   physical: MeshPhysicalMaterial parameters
//   vertex: GLSL declarations for the vertex shader (attributes, varyings, functions)
//   deform: body of void anDeform(inout vec3 p, inout vec3 n), rest pose -> pose
//   vertexMain: GLSL run after the deform (fill extra varyings)
//   fragment: GLSL declarations for the fragment shader
//   paint: GLSL in main() after the base colour; may set diffuseColor.rgb,
//     anRough, anMetal, anEmis, anBump (a height in metres, for bumps),
//     anCoat (clearcoat amount) and anSheen (sheen amount)
export function animalMaterial({ name, physical = {}, vertex = '', deform = '', vertexMain = '', fragment = '', paint = '', bump = false, sheenTint = false }) {
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.6, metalness: 0, ...physical });
  mat.name = name;
  const vpars = `attribute float aPart;\nattribute vec3 aSurf;\n${VARYINGS}\n${NOISE_GLSL}\n${vertex}\nvoid anDeform(inout vec3 p, inout vec3 n) {\n${deform}\n}\n`;
  const patchVertex = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${vpars}`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);\n{ vec3 anN = vec3(normal); anDeform(transformed, anN); }\nvRest = position;\nvRestN = normal;\nvSurf = aSurf;\nvPart = aPart;\n${vertexMain}`);
    if (sh.vertexShader.includes('#include <beginnormal_vertex>')) {
      sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n{ vec3 anP = vec3(position); anDeform(anP, objectNormal); }');
    }
  };
  mat.onBeforeCompile = (sh) => {
    patchVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${VARYINGS}\n${NOISE_GLSL}\n${fragment}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float anRough = roughness;
float anMetal = metalness;
vec3 anEmis = vec3(0.0);
float anBump = 0.0;
float anCoat = 1.0;
float anSheen = 1.0;
{
${paint}
}`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = anRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = anMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += anEmis;')
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= anCoat;
#endif
#ifdef USE_SHEEN
  material.sheenColor *= anSheen${sheenTint ? ' * (diffuseColor.rgb * 1.3 + 0.03)' : ''};
#endif`,
      );
    if (bump) {
      // bump from the painted height, by screen-space derivatives
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 anPx = dFdx(-vViewPosition);
  vec3 anPy = dFdy(-vViewPosition);
  vec2 anDh = vec2(dFdx(anBump), dFdy(anBump));
  vec3 anR1 = cross(anPy, normal);
  vec3 anR2 = cross(normal, anPx);
  float anDet = dot(anPx, anR1) * faceDirection;
  vec3 anG = sign(anDet) * (anDh.x * anR1 + anDh.y * anR2);
  normal = normalize(abs(anDet) * normal - anG);
}`,
      );
    }
  };
  mat.customProgramCacheKey = () => `animal-${name}`;

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.name = `${name}-depth`;
  depth.onBeforeCompile = patchVertex;
  depth.customProgramCacheKey = () => `animal-${name}-depth`;
  return { material: mat, depth };
}

// A linear-space colour as a GLSL vec3 literal (from a CSS hex in sRGB).
export function glslColor(hex) {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

// An InstancedMesh ready for animals: no frustum culling (they roam), a
// shadow twin, and every instance hidden until placed.
export function instanced(geo, mat, count, { shadows = false, name = 'animals' } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat.material, count);
  mesh.customDepthMaterial = mat.depth;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero);
  return mesh;
}

// Adds a per-instance float attribute (itemSize 1..4) updated every frame.
export function instanceAttr(geo, name, count, size) {
  const arr = new Float32Array(count * size);
  const attr = new THREE.InstancedBufferAttribute(arr, size);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute(name, attr);
  return attr;
}

// ------------------------------------------------------------ placing

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// Writes an instance: position, heading (yaw), nose-up pitch, roll into the
// turn, uniform scale.
export function place(mesh, i, x, y, z, yaw, pitch, roll, scale) {
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(scale, scale, scale);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}

// The same with a separate scale per axis (width, height, length).
export function placeScaled(mesh, i, x, y, z, yaw, pitch, roll, sx, sy, sz) {
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}

export function hide(mesh, i) {
  _m.makeScale(0, 0, 0);
  mesh.setMatrixAt(i, _m);
}

// ------------------------------------------------------------ moving about

// The boat's frame at a point: `along` is ahead of the boat's centre (m) and
// `across` to its right. Written into out = { along, across }.
export function boatFrame(boat, x, z, out) {
  const h = boat.heading;
  const s = Math.sin(h);
  const c = Math.cos(h);
  const dx = x - boat.pos.x;
  const dz = z - boat.pos.z;
  out.along = -dx * s - dz * c;
  out.across = dx * c - dz * s;
  return out;
}

// Stand-in for the hull: half length and half width (m) of the footprint
// animals keep clear of, before their own margin.
export const HULL = { half: 2.5, beam: 1.05 };

// Moves p (Vector3, x/z) out of the boat's footprint grown by `margin`,
// sideways, the way an animal slips aside. Returns true if it had to move.
const _f = { along: 0, across: 0 };
export function keepClearOfBoat(boat, p, margin) {
  if (!boat) return false;
  boatFrame(boat, p.x, p.z, _f);
  const hl = HULL.half + margin;
  const hw = HULL.beam + margin;
  if (Math.abs(_f.along) >= hl || Math.abs(_f.across) >= hw) return false;
  const side = _f.across >= 0 ? 1 : -1;
  const push = side * hw - _f.across;
  const h = boat.heading;
  p.x += Math.cos(h) * push;
  p.z += -Math.sin(h) * push;
  return true;
}

// Direction away from the nearest shore at (x, z) (unit, into out = {x, z}),
// by finite differences of the world's landDistance.
export function awayFromLand(world, x, z, out, h = 1.5) {
  const dx = world.landDistance(x + h, z) - world.landDistance(x - h, z);
  const dz = world.landDistance(x, z + h) - world.landDistance(x, z - h);
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) {
    out.x = 0;
    out.z = 0;
  } else {
    out.x = dx / l;
    out.z = dz / l;
  }
  return out;
}

// Heading (rotation.y) of a direction (dx, dz) in the game's convention.
export const headingOf = (dx, dz) => Math.atan2(-dx, -dz);

// Events with every hook present, so callers never need to check.
const noop = () => {};
export function safeEvents(events = {}) {
  return {
    splash: events.splash || noop,
    sound: events.sound || noop,
    ripple: events.ripple || noop,
    // optional: a dolphin's breath (a small puff of mist); falls back to a tiny splash
    blow: events.blow || ((pos) => (events.splash || noop)(pos, 0.08)),
  };
}

// Quality tier helper: 'high' | 'medium' | 'low'.
export function tierOf(quality) {
  const t = typeof quality === 'string' ? quality : quality?.tier;
  return t === 'low' || t === 'medium' ? t : 'high';
}
