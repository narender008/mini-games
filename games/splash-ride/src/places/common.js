// Shared scenery tools for the places: seeded CPU noise for height fields,
// island profiles, canvas texture helpers, and instancing.
import * as THREE from 'three';
import { rng, clamp, smoothstep } from '../config.js';

// ------------------------------------------------------------ noise

export function makeNoise(seed = 1) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = r() * 2 - 1;
  const h = (x, y) => val[perm[(perm[x & 255] + y) & 511] & 255];
  // value noise, -1..1
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi);
    const b = h(xi + 1, yi);
    const c = h(xi, yi + 1);
    const d = h(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  const fbm = (x, y, oct = 4) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    let n = 0;
    for (let i = 0; i < oct; i++) {
      s += noise(x * f, y * f) * a;
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  };
  return { noise, fbm };
}

// smooth maximum (k = blend width)
export function smax(a, b, k) {
  const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1);
  return b + (a - b) * h + k * h * (1 - h);
}

// A natural island: a rounded top, a beach falling to the waterline at
// radius R (wobbled by noise so the shore is irregular), then a gentle
// underwater slope. Returns height at (x, z).
export function islandHeight(isl, x, z, noise) {
  const dx = (x - isl.x) / (isl.sx ?? 1);
  const dz = (z - isl.z) / (isl.sz ?? 1);
  const r = Math.hypot(dx, dz);
  const a = Math.atan2(dz, dx);
  const wob = 1 + (isl.wobble ?? 0.16) * noise.fbm(Math.cos(a) * 1.3 + isl.seed, Math.sin(a) * 1.3 - isl.seed, 3);
  const R = isl.r * wob;
  if (r < R) {
    const t = r / R;
    return isl.top * (1 - Math.pow(t, isl.p ?? 2.4)) + (isl.hill ?? 0) * Math.exp(-(t * t) * 5);
  }
  return -(r - R) * (isl.slope ?? 0.1);
}

// ------------------------------------------------------------ canvas textures

export function canvasTexture(w, h, draw, { srgb = true, repeat = false, mips = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

// A height canvas (grey) turned into a tangent-space normal map.
export function normalFromHeight(src, strength = 2) {
  const w = src.width;
  const h = src.height;
  const s = src.getContext('2d').getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const H = (x, y) => s[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / l) * 127 + 128;
      img.data[i + 1] = (dy / l) * 127 + 128;
      img.data[i + 2] = (1 / l) * 127 + 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------ instancing

// Scatter instances of one geometry/material; items: [{ x, y, z, ry, s, sx, sy, sz, rx, rz }]
export function instances(geometry, material, items, { shadow = true, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  items.forEach((it, i) => {
    e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0, 'YXZ');
    q.setFromEuler(e);
    p.set(it.x, it.y ?? 0, it.z);
    const k = it.s ?? 1;
    s.set((it.sx ?? 1) * k, (it.sy ?? 1) * k, (it.sz ?? 1) * k);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = items.length;
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// Merge several non-indexed or indexed geometries (same attributes) into one.
export function merge(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = list[0].attributes[n].itemSize;
    let len = 0;
    for (const g of list) len += g.attributes[n].count * size;
    const arr = new Float32Array(len);
    let o = 0;
    for (const g of list) {
      arr.set(g.attributes[n].array, o);
      o += g.attributes[n].count * size;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

// A lumpy rock: an icosphere pushed about by noise, flattened a little.
export function rockGeometry(seed, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const n = makeNoise(seed);
  const r = rng(seed * 7 + 3);
  // a few flat breaks, like a boulder split along its joints
  const cuts = [];
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    const y = r() * 1.4 - 0.4;
    const d = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize();
    cuts.push([d, 0.72 + r() * 0.2]);
  }
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ridge = 1 - Math.abs(n.noise(v.x * 2.6 + 7, v.y * 2.6 + v.z * 1.7));
    const d = 1 + 0.24 * n.fbm(v.x * 1.4 + 3, v.z * 1.4 + v.y * 0.9, 4) + 0.1 * ridge * ridge + 0.06 * n.noise(v.x * 7, v.y * 7 + v.z * 4) + 0.03 * n.noise(v.x * 15 + 2, v.z * 15 - v.y * 9);
    v.multiplyScalar(d);
    for (const [c, k] of cuts) {
      const o = v.dot(c) - k;
      if (o > 0) v.addScaledVector(c, -o * 0.97);
    }
    v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // the icosahedron comes unindexed (flat facets); weld it so it shades as
  // one smooth weathered surface
  const welded = weld(g);
  welded.computeVertexNormals();
  return welded;
}

// join vertices that share a position into one indexed geometry
function weld(g) {
  const pos = g.attributes.position;
  const map = new Map();
  const out = [];
  const index = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = out.length / 3;
      map.set(key, k);
      out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    index.push(k);
  }
  const w = new THREE.BufferGeometry();
  w.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  w.setIndex(index);
  return w;
}

// Stone that looks weathered rather than painted: colour from world
// position (so no two rocks match), dark cracks, lichen or salt on the tops,
// a wet dark band at the waterline and weed below it. `noise` is the game's
// noise texture (textures.noise).
export function rockMaterial(noise, color, { lichen = 0, lichenColor = 0x8a8c5a, weed = 1, roughness = 0.84 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const u = { uRockNoise: { value: noise }, uLichen: { value: lichen }, uLichenColor: { value: new THREE.Color(lichenColor) }, uWeed: { value: weed } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRPos;\nvarying vec3 vRNrm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec4 rp = vec4(transformed, 1.0);
  mat3 rm = mat3(modelMatrix);
#ifdef USE_INSTANCING
  rp = instanceMatrix * rp;
  rm = rm * mat3(instanceMatrix);
#endif
  vRPos = (modelMatrix * rp).xyz;
  vRNrm = normalize(rm * objectNormal);
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRPos;
varying vec3 vRNrm;
uniform sampler2D uRockNoise;
uniform float uLichen, uWeed;
uniform vec3 uLichenColor;
vec3 rPert;
float rRough;
vec4 rockTri(vec3 p, vec3 w) {
  return texture2D(uRockNoise, p.yz) * w.x + texture2D(uRockNoise, p.xz) * w.y + texture2D(uRockNoise, p.xy) * w.z;
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 wn = normalize(vRNrm);
  vec3 w = pow(abs(wn), vec3(4.0));
  w /= w.x + w.y + w.z;
  vec4 a = rockTri(vRPos * 0.33, w);
  vec4 b = rockTri(vRPos * 0.07, w);
  vec4 c = rockTri(vRPos * 1.3, w);
  float tone = a.b * 0.5 + b.g * 0.35 + c.b * 0.15;
  vec3 col = diffuseColor.rgb * (0.62 + 0.7 * tone) * mix(vec3(1.0), vec3(1.06, 1.0, 0.92), b.r);
  // joints and cracks: thin dark lines
  float crack = 1.0 - smoothstep(0.0, 0.035, abs(b.b - 0.5) + c.g * 0.02);
  col *= 1.0 - 0.5 * crack;
  // lichen or salt on the faces that look up
  float top = smoothstep(0.45, 0.85, wn.y) * smoothstep(0.45, 0.62, a.g + c.b * 0.2);
  col = mix(col, uLichenColor * (0.75 + 0.5 * c.g), uLichen * top);
  // wet and dark at the waterline, green-brown weed below it
  float h = vRPos.y;
  float wet = smoothstep(0.7 + a.r * 0.4, 0.0, h);
  col *= mix(1.0, 0.52, wet);
  col = mix(col, col * vec3(0.55, 0.62, 0.36), uWeed * smoothstep(-0.05, -0.5, h));
  rRough = mix(0.84, 0.35, wet * step(-0.1, h));
  rPert = vec3(c.b - 0.5, 0.0, c.g - 0.5) * 0.9 + vec3(a.g - 0.5, 0.0, a.b - 0.5) * 0.5;
  diffuseColor.rgb = col;
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (viewMatrix * vec4(rPert, 0.0)).xyz * 0.5);');
  };
  mat.customProgramCacheKey = () => 'rock';
  return mat;
}

export { smoothstep };
