// The three rooms the tower is built in: a sunny playroom, a garden patio and
// a cosy bedroom at dusk. Everything is at real scale (metres, floor top at
// y = 0) so a 4 cm block reads as a 4 cm block. Each room bakes its surface
// textures on the GPU (large, sharp maps in a few milliseconds instead of
// slow canvas loops), captures itself into a PMREM environment so glossy
// blocks reflect the actual room, and sets up one shadow-casting key light
// with soft, contact-hardening shadows on the floor, plus gentle fill.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { DEBUG, REDUCED_MOTION } from './config.js';

// ------------------------------------------------------------ small helpers

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const col = (hex) => new THREE.Color(hex);

// A rounded box with true flat faces and smooth quarter-round edges. The
// box is subdivided an odd number of times so no vertex sits on a face's
// centre line; the innermost ring of each face stays flat.
function roundedBox(w, h, d, r, seg = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2) * 0.999;
  const s = seg * 2 + 1;
  const geo = new THREE.BoxGeometry(1, 1, 1, s, s, s);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const inner = [w / 2 - r, h / 2 - r, d / 2 - r];
  const lim = 0.5 / s + 1e-5;
  const v = [0, 0, 0];
  const n = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    v[0] = pos.getX(i);
    v[1] = pos.getY(i);
    v[2] = pos.getZ(i);
    for (let k = 0; k < 3; k++) n[k] = Math.abs(v[k]) < lim ? 0 : v[k];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    for (let k = 0; k < 3; k++) n[k] /= len;
    pos.setXYZ(i, Math.sign(v[0]) * inner[0] + n[0] * r, Math.sign(v[1]) * inner[1] + n[1] * r, Math.sign(v[2]) * inner[2] + n[2] * r);
    nor.setXYZ(i, n[0], n[1], n[2]);
  }
  return geo;
}

// Soft furnishings (cushions, duvet, pouf): a rounded box whose surface is
// pushed in and out a little along its normal, like stuffed fabric.
function softBox(w, h, d, r, amount, seed, seg = 5) {
  const geo = roundedBox(w, h, d, r, seg);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const rand = rng(seed);
  const waves = Array.from({ length: 5 }, () => [rand() * 9 + 3, rand() * 9 + 3, rand() * 9 + 3, rand() * 6.28]);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let o = 0;
    for (const [a, b, c, p] of waves) o += Math.sin(x * a + y * b + z * c + p);
    o = (o / waves.length) * amount;
    pos.setXYZ(i, x + nor.getX(i) * o, y + nor.getY(i) * o, z + nor.getZ(i) * o);
  }
  geo.computeVertexNormals();
  return geo;
}

// A wall panel in its own plane (x along the wall, y up, facing +z) with
// rectangular openings for windows. UVs are in metres / tile.
function wallGeo(width, height, holes, tile) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(width, 0);
  s.lineTo(width, height);
  s.lineTo(0, height);
  s.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h.x0, h.y0);
    p.lineTo(h.x0, h.y1);
    p.lineTo(h.x1, h.y1);
    p.lineTo(h.x1, h.y0);
    p.closePath();
    s.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(s);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return g;
}

// A horizontal plane at height y whose UVs follow world x and -z, so floor
// textures line up with real metres (u across boards, v along them).
function floorGeo(w, d, cx, cz, tile, seg = 1) {
  const g = new THREE.PlaneGeometry(w, d, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, 0, cz);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile.x, -pos.getZ(i) / tile.y);
  return g;
}

// ------------------------------------------------------------ GPU texture bakes

const NOISE = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
// value noise that repeats every 'per' cells, so baked tiles wrap seamlessly
float vnoise(vec2 p, vec2 per) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(mod(i, per));
  float b = hash12(mod(i + vec2(1.0, 0.0), per));
  float c = hash12(mod(i + vec2(0.0, 1.0), per));
  float d = hash12(mod(i + vec2(1.0, 1.0), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, vec2 per) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  return s / 0.96875;
}
// distance to the nearest and second-nearest cell point, and the cell's id
vec3 worley(vec2 p, vec2 per) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 c = mod(i + g, per);
      vec2 r = g + 0.15 + 0.7 * hash22(c) - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = hash12(c + 17.0); } else if (d < d2) { d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
float band(float x, float h, float w) { return 1.0 - smoothstep(h - w * 0.5, h + w * 0.5, abs(x)); }
`;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function bake(R, { width, height = width, fragment, uniforms = {}, srgb = false, mipmaps = true, repeat = true, defines = {} }) {
  const { renderer } = R;
  const rt = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    generateMipmaps: mipmaps,
    minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
    wrapT: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
    colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: 'uniform vec2 uRes;\n' + NOISE + fragment,
    uniforms: { uRes: { value: new THREE.Vector2(width, height) }, ...uniforms },
    defines,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(mat);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  renderer.setRenderTarget(prev);
  quad.dispose();
  mat.dispose();
  R.bin.add(rt);
  return rt.texture;
}

// Oak floorboards. Boards of varied width run along v; each has one or two
// end joints per tile. The grain is a flat-sawn log: growth rings cut by a
// plane that drifts in depth along the board, which draws the familiar
// cathedral arches. The normal pass stores roughness in alpha.
const WOOD_FRAG = /* glsl */ `
uniform vec2 uTile;
uniform int uCols;
uniform float uSeed;
uniform vec3 uEarly;
uniform vec3 uLate;
uniform float uRings;
uniform float uGap;
uniform float uWear;
uniform vec2 uTexel;
varying vec2 vUv;
struct Plank { float id; float u; float v; float w; float len; float edge; };
float colW(int i) { return 0.8 + 0.4 * hash11(float(i) * 3.71 + uSeed); }
Plank plankAt(vec2 p) {
  float total = 0.0;
  for (int i = 0; i < 32; i++) { if (i >= uCols) break; total += colW(i); }
  float sc = uTile.x / total;
  float x = mod(p.x, uTile.x);
  float acc = 0.0;
  float x0 = 0.0;
  float w = 0.1;
  float idx = 0.0;
  for (int i = 0; i < 32; i++) {
    if (i >= uCols) break;
    float wi = colW(i) * sc;
    if (x >= acc) { idx = float(i); x0 = acc; w = wi; }
    acc += wi;
  }
  float L = uTile.y;
  float j0 = hash11(idx * 1.93 + uSeed + 5.1) * L;
  bool two = hash11(idx * 4.1 + uSeed + 2.3) > 0.3;
  float s1 = mix(0.36, 0.64, hash11(idx * 7.7 + uSeed + 0.7)) * L;
  float yy = mod(p.y - j0, L);
  Plank k;
  k.id = idx * 2.0 + 1.0;
  k.v = yy;
  k.len = L;
  if (two) {
    if (yy < s1) { k.len = s1; } else { k.id += 1.0; k.v = yy - s1; k.len = L - s1; }
  }
  k.u = x - x0;
  k.w = w;
  k.edge = min(min(k.u, w - k.u), min(k.v, k.len - k.v));
  return k;
}
float hk(Plank k, float s) { return hash11(k.id * 1.618 + s * 13.37 + uSeed * 0.71); }
float grain(Plank k, out float late, out float figure) {
  float ux = k.u - 0.5 * k.w;
  float c = (hk(k, 1.0) - 0.5) * k.w * 1.3;
  float depth = 0.018 + 0.09 * hk(k, 2.0) + (hk(k, 3.0) - 0.5) * 0.045 * k.v + 0.01 * sin(k.v * (0.8 + 1.8 * hk(k, 4.0)) + hk(k, 5.0) * 6.2832);
  vec2 q = vec2(ux * 55.0, k.v * 2.2) + hk(k, 6.0) * 97.0;
  float wob = (vnoise(q, vec2(1e4)) - 0.5) * 0.005 + (vnoise(q * vec2(3.7, 4.1), vec2(1e4)) - 0.5) * 0.0016;
  float r = length(vec2(ux - c, depth)) + wob;
  float f = fract(r * uRings);
  late = smoothstep(0.5, 0.82, f) * (1.0 - smoothstep(0.86, 0.995, f));
  figure = vnoise(vec2(ux * 30.0, k.v * 1.1) + hk(k, 7.0) * 53.0, vec2(1e4));
  return r;
}
float scratches(Plank k) {
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = hk(k, 20.0 + float(i)) * 3.1416;
    vec2 d = vec2(cos(a), sin(a));
    vec2 uv = vec2(k.u, k.v);
    vec2 q = vec2(dot(uv, d), dot(uv, vec2(-d.y, d.x)));
    float n = vnoise(vec2(q.x * 0.3 / uTexel.x, q.y * 5.0) + float(i) * 17.0 + k.id, vec2(1e4));
    s += smoothstep(0.94, 0.995, n);
  }
  return min(s, 1.0);
}
float wearAt(vec2 p) { return uWear * smoothstep(0.4, 0.75, fbm(p / uTile * 3.0, vec2(3.0))); }
float woodHeight(vec2 p) {
  Plank k = plankAt(p);
  float late;
  float figure;
  grain(k, late, figure);
  float h = 0.0;
  h -= 0.00045 * (1.0 - smoothstep(0.0, 0.0024, k.edge));
  h -= 0.0008 * (1.0 - smoothstep(uGap * 0.4, uGap, k.edge));
  // each board sits very slightly differently, so reflections break at the seams
  h += (hk(k, 11.0) - 0.5) * 0.0007 * (k.u / k.w);
  h += (hk(k, 12.0) - 0.5) * 0.001 * (k.v / k.len);
  float cu = k.u / k.w - 0.5;
  h += 0.00016 * cu * cu * 4.0;
  h += late * 0.00002;
  return h;
}
void main() {
  vec2 p = vUv * uTile;
  Plank k = plankAt(p);
  float late;
  float figure;
  grain(k, late, figure);
  float wear = wearAt(p);
  float sc = scratches(k);
#ifdef NORMAL_PASS
  vec2 e = uTexel;
  float hl = woodHeight(p - vec2(e.x, 0.0));
  float hr = woodHeight(p + vec2(e.x, 0.0));
  float hd = woodHeight(p - vec2(0.0, e.y));
  float hu = woodHeight(p + vec2(0.0, e.y));
  vec3 n = normalize(vec3((hl - hr) / (2.0 * e.x), (hd - hu) / (2.0 * e.y), 1.0));
  float rough = 0.36 + 0.1 * (figure - 0.5) + 0.14 * wear + 0.22 * sc + 0.35 * (1.0 - smoothstep(uGap, uGap + 0.002, k.edge));
  gl_FragColor = vec4(n * 0.5 + 0.5, clamp(rough, 0.05, 1.0));
#else
  vec3 c = mix(uEarly, uLate, late * 0.6);
  c *= 0.88 + 0.24 * figure;
  // board to board: some paler, some deeper, some a little redder
  float tone = hk(k, 8.0);
  c *= mix(0.74, 1.18, tone * tone * (3.0 - 2.0 * tone));
  c = mix(c, c * vec3(1.1, 0.94, 0.8), hk(k, 9.0) * 0.9);
  float pores = vnoise(vec2(k.u / uTexel.x * 0.45, k.v * 22.0) + hk(k, 10.0) * 71.0, vec2(1e4));
  c *= 1.0 - 0.16 * smoothstep(0.6, 0.95, pores) * (0.5 + late);
  // grime in the eased edges, dark gaps between the boards
  c *= mix(0.62, 1.0, smoothstep(uGap, uGap + 0.0025, k.edge));
  c = mix(c * 0.16, c, smoothstep(uGap * 0.4, uGap, k.edge));
  // worn paths are paler; scratches catch the light
  c = mix(c, c * vec3(1.1, 1.07, 1.02), wear * 0.6);
  c = mix(c, c * 1.3 + 0.015, sc * 0.35);
  gl_FragColor = vec4(c, 1.0);
#endif
}`;

// Riven sandstone flags in rows of 60, 45 and 30 cm, with sunken mortar
// joints, per-slab colour and a hint of moss.
const STONE_FRAG = /* glsl */ `
uniform vec2 uTile;
uniform float uSeed;
uniform vec3 uCol0;
uniform vec3 uCol1;
uniform vec3 uCol2;
uniform vec3 uMortar;
uniform float uJoint;
uniform vec2 uTexel;
varying vec2 vUv;
struct Slab { vec2 id; vec2 l; vec2 s; float edge; };
Slab slabAt(vec2 p) {
  p = mod(p, uTile);
  float y0 = 0.0;
  float h = 0.6;
  float row = 0.0;
  if (p.y >= 0.6) { y0 = 0.6; h = 0.45; row = 1.0; }
  if (p.y >= 1.05) { y0 = 1.05; h = 0.3; row = 2.0; }
  if (p.y >= 1.35) { y0 = 1.35; h = 0.6; row = 3.0; }
  if (p.y >= 1.95) { y0 = 1.95; h = 0.45; row = 4.0; }
  float off = floor(hash11(row * 3.1 + uSeed) * 16.0) * 0.15;
  float x = mod(p.x - off, uTile.x);
  float acc = 0.0;
  float x0 = 0.0;
  float w = 0.6;
  float idx = 0.0;
  for (int i = 0; i < 10; i++) {
    if (acc >= uTile.x - 1e-4) break;
    float hh = hash11(row * 17.0 + float(i) * 3.3 + uSeed);
    float wi = hh < 0.3 ? 0.45 : (hh < 0.72 ? 0.6 : 0.9);
    if (acc + wi > uTile.x - 0.3) wi = uTile.x - acc;
    if (x >= acc) { x0 = acc; w = wi; idx = float(i); }
    acc += wi;
  }
  Slab s;
  s.id = vec2(row, idx);
  s.l = vec2(x - x0, p.y - y0);
  s.s = vec2(w, h);
  s.edge = min(min(s.l.x, w - s.l.x), min(s.l.y, h - s.l.y));
  return s;
}
float hs(Slab s, float k) { return hash12(s.id * vec2(7.13, 3.71) + k * 1.37 + uSeed); }
float riven(Slab s) {
  float a = hs(s, 1.0) * 3.1416;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * s.l;
  return fbm(q * vec2(2.2, 7.5) + hs(s, 2.0) * 50.0, vec2(1e4));
}
float edgeOf(Slab s) { return s.edge + (vnoise(s.l * 40.0 + hs(s, 4.0) * 30.0, vec2(1e4)) - 0.5) * 0.0025; }
float stoneHeight(vec2 p) {
  Slab s = slabAt(p);
  float e = edgeOf(s);
  float bevel = smoothstep(uJoint, uJoint + 0.007, e);
  float fine = vnoise(s.l / uTexel * 0.35 + hs(s, 3.0) * 20.0, vec2(1e4));
  float h = (riven(s) * 0.004 + fine * 0.00025) * bevel;
  h += (hs(s, 5.0) - 0.5) * 0.002 * (s.l.x / s.s.x) + (hs(s, 6.0) - 0.5) * 0.002 * (s.l.y / s.s.y);
  h -= 0.005 * (1.0 - bevel);
  return h;
}
void main() {
  vec2 p = vUv * uTile;
  Slab s = slabAt(p);
  float e = edgeOf(s);
  float bevel = smoothstep(uJoint, uJoint + 0.007, e);
  float rv = riven(s);
#ifdef NORMAL_PASS
  vec2 d = uTexel;
  float hl = stoneHeight(p - vec2(d.x, 0.0));
  float hr = stoneHeight(p + vec2(d.x, 0.0));
  float hd = stoneHeight(p - vec2(0.0, d.y));
  float hu = stoneHeight(p + vec2(0.0, d.y));
  vec3 n = normalize(vec3((hl - hr) / (2.0 * d.x), (hd - hu) / (2.0 * d.y), 1.0));
  float rough = mix(0.96, 0.74 + 0.14 * (1.0 - rv), bevel);
  gl_FragColor = vec4(n * 0.5 + 0.5, rough);
#else
  float t = hs(s, 7.0);
  vec3 c = mix(uCol0, uCol1, smoothstep(0.3, 0.7, t));
  c = mix(c, uCol2, step(0.82, t) * 0.7);
  c *= 0.92 + 0.14 * hs(s, 8.0);
  c *= 0.84 + 0.32 * fbm(s.l * 4.0 + hs(s, 9.0) * 40.0, vec2(1e4));
  // sandstone's wavy bedding: bands of buff, grey and rust across each slab
  float a = hs(s, 1.0) * 3.1416;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * s.l;
  float bed = 0.5 + 0.5 * sin(q.y * 26.0 + fbm(q * 3.0 + hs(s, 10.0) * 9.0, vec2(1e4)) * 7.0);
  c = mix(c, c * vec3(1.05, 0.9, 0.78), bed * 0.35 * hs(s, 11.0));
  c = mix(c, c * vec3(0.9, 0.92, 0.95), (1.0 - bed) * 0.25);
  c *= 0.93 + 0.14 * rv;
  float sp = vnoise(s.l / uTexel * 0.3 + 11.0, vec2(1e4));
  c *= 1.0 - 0.22 * smoothstep(0.84, 0.97, sp);
  c *= 1.0 - 0.2 * (1.0 - smoothstep(uJoint, uJoint + 0.035, e));
  vec3 m = uMortar * (0.85 + 0.3 * vnoise(p * 90.0, vec2(216.0)));
  float moss = smoothstep(0.55, 0.8, fbm(p * 1.5, vec2(3.6)));
  m = mix(m, vec3(0.035, 0.06, 0.018), moss * 0.75);
  gl_FragColor = vec4(mix(m, c, bevel), 1.0);
#endif
}`;

// Painted plaster: a gentle mottle for colour and a fine roller stipple.
const WALL_FRAG = /* glsl */ `
uniform float uTileM;
uniform vec2 uTexel;
varying vec2 vUv;
float wallH(vec2 uv) {
  return fbm(uv * 180.0, vec2(180.0)) * 0.00012 + fbm(uv * 9.0, vec2(9.0)) * 0.0006;
}
void main() {
#ifdef NORMAL_PASS
  vec2 d = uTexel / uTileM;
  float hl = wallH(vUv - vec2(d.x, 0.0));
  float hr = wallH(vUv + vec2(d.x, 0.0));
  float hd = wallH(vUv - vec2(0.0, d.y));
  float hu = wallH(vUv + vec2(0.0, d.y));
  vec3 n = normalize(vec3((hl - hr) / (2.0 * uTexel.x), (hd - hu) / (2.0 * uTexel.y), 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 0.86 + 0.08 * vnoise(vUv * 40.0, vec2(40.0)));
#else
  float m = fbm(vUv * 5.0, vec2(5.0));
  gl_FragColor = vec4(vec3(0.94 + 0.06 * m), 1.0);
#endif
}`;

// Wool pile: tufts on a jittered grid, each a soft dome with a twist of
// yarn. Normal in rgb; alpha is how much light reaches into the pile.
const FIBER_FRAG = /* glsl */ `
uniform float uCells;
uniform float uTileM;
uniform float uDepth;
varying vec2 vUv;
float pile(vec2 uv) {
  vec3 w = worley(uv * uCells, vec2(uCells));
  float dome = 1.0 - smoothstep(0.0, 0.72, w.x);
  float a = w.z * 6.2832;
  vec2 dir = vec2(cos(a), sin(a));
  float twist = 0.5 + 0.5 * sin(dot(uv * uCells, dir) * 20.0 + w.z * 40.0);
  float fuzz = vnoise(uv * uCells * 8.0, vec2(uCells * 8.0));
  return pow(dome, 0.6) * (0.8 + 0.2 * twist) + fuzz * 0.12;
}
void main() {
  float e = 1.0 / uRes.x;
  float h = pile(vUv);
  float dx = (pile(vUv + vec2(e, 0.0)) - pile(vUv - vec2(e, 0.0))) * uDepth / (2.0 * e * uTileM);
  float dy = (pile(vUv + vec2(0.0, e)) - pile(vUv - vec2(0.0, e))) * uDepth / (2.0 * e * uTileM);
  vec3 n = normalize(vec3(-dx, -dy, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 0.68 + 0.32 * smoothstep(0.05, 0.85, h));
}`;

// The bedtime rug's design: warm cream wool, a two-stripe border and a
// scatter of little mustard stars.
const RUG_FRAG = /* glsl */ `
uniform vec2 uSize;
uniform vec3 uBase;
uniform vec3 uBand1;
uniform vec3 uBand2;
uniform vec3 uStar;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float e = min(uSize.x * 0.5 - abs(p.x), uSize.y * 0.5 - abs(p.y));
  vec3 c = uBase * (0.92 + 0.16 * fbm(p * 2.5 + 7.0, vec2(1e4)));
  float aa = 0.003;
  float b1 = smoothstep(0.07, 0.07 + aa, e) * (1.0 - smoothstep(0.1, 0.1 + aa, e));
  float b2 = smoothstep(0.125, 0.125 + aa, e) * (1.0 - smoothstep(0.14, 0.14 + aa, e));
  c = mix(c, uBand1 * (0.9 + 0.2 * fbm(p * 9.0, vec2(1e4))), b1);
  c = mix(c, uBand2, b2);
  vec2 g = p / 0.3;
  vec2 cell = floor(g);
  vec2 q = (fract(g) - 0.5 - (hash22(cell) - 0.5) * 0.4) * 0.3;
  float a = atan(q.y, q.x) + hash12(cell) * 6.28;
  float rr = 0.028 * mix(0.45, 1.0, pow(0.5 + 0.5 * cos(5.0 * a), 2.0));
  float star = (1.0 - smoothstep(rr - aa, rr + aa, length(q))) * step(0.45, hash12(cell + 3.0)) * step(0.2, e - 0.05);
  c = mix(c, uStar, star * 0.85);
  gl_FragColor = vec4(c, 1.0);
}`;

// Lawn: short blades in two greens with some straw, seen from a few metres.
const GRASS_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.1 + 0.4;
    mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 q = r * vUv;
    s += vnoise(q * vec2(260.0, 26.0) + float(i) * 13.0, vec2(1e4));
  }
  s /= 3.0;
  float patchy = fbm(vUv * 6.0, vec2(6.0));
  vec3 c = mix(vec3(0.025, 0.07, 0.012), vec3(0.09, 0.2, 0.03), smoothstep(0.3, 0.75, s));
  c *= 0.75 + 0.5 * fbm(vUv * 3.0, vec2(3.0));
  c = mix(c, vec3(0.16, 0.18, 0.05), smoothstep(0.62, 0.8, patchy) * 0.45);
  gl_FragColor = vec4(c, 1.0);
}`;

// Foliage for shrubs and trees: overlapping leaves with dark gaps, so a
// bush reads as leafy even through the lens blur.
const FOLIAGE_FRAG = /* glsl */ `
uniform vec2 uCells;
varying vec2 vUv;
float leafH(vec2 uv, out float tone) {
  vec3 w = worley(uv * uCells, uCells);
  vec3 w2 = worley(uv * uCells * 1.7 + 3.3, uCells * 1.7);
  tone = mix(w.z, w2.z, step(w2.x, w.x));
  float a = 1.0 - smoothstep(0.1, 0.6, min(w.x, w2.x * 1.1));
  return a * a;
}
void main() {
  float tone;
  float h = leafH(vUv, tone);
#ifdef NORMAL_PASS
  vec2 e = 1.0 / uRes;
  float t2;
  float dx = leafH(vUv + vec2(e.x, 0.0), t2) - leafH(vUv - vec2(e.x, 0.0), t2);
  float dy = leafH(vUv + vec2(0.0, e.y), t2) - leafH(vUv - vec2(0.0, e.y), t2);
  vec3 n = normalize(vec3(-dx * 6.0, -dy * 6.0, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
#else
  vec3 c = vec3(0.6 + 0.7 * tone) * mix(0.18, 1.0, h);
  c *= vec3(0.95 + 0.1 * tone, 1.0, 0.9);
  gl_FragColor = vec4(c, 1.0);
#endif
}`;

// The playroom sun's light cookie: the window as seen from the sun, with a
// soft edge for the sun's size and the haze of the glass.
const COOKIE_FRAG = /* glsl */ `
uniform mat4 uInvVP;
uniform vec3 uWinO;
uniform vec3 uWinU;
uniform vec3 uWinV;
uniform vec3 uWinN;
uniform vec2 uWinHalf;
uniform vec4 uBarsU;
uniform vec4 uBarsV;
uniform float uBar;
uniform float uSoft;
varying vec2 vUv;
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 a = uInvVP * vec4(ndc, -1.0, 1.0);
  vec4 b = uInvVP * vec4(ndc, 1.0, 1.0);
  a /= a.w;
  b /= b.w;
  vec3 dir = normalize(b.xyz - a.xyz);
  float t = dot(uWinO - a.xyz, uWinN) / dot(dir, uWinN);
  vec3 q = a.xyz + dir * t - uWinO;
  vec2 w = vec2(dot(q, uWinU), dot(q, uWinV));
  float m = band(w.x, uWinHalf.x, uSoft) * band(w.y, uWinHalf.y, uSoft);
  for (int i = 0; i < 4; i++) {
    m *= 1.0 - band(w.x - uBarsU[i], uBar, uSoft);
    m *= 1.0 - band(w.y - uBarsV[i], uBar, uSoft);
  }
  gl_FragColor = vec4(vec3(m), 1.0);
}`;

// A child's painting for the playroom wall: sky, sun, hill and a house.
const PICTURE_FRAG = /* glsl */ `
varying vec2 vUv;
float blob(vec2 p, vec2 c, float r) { return 1.0 - smoothstep(r - 0.01, r + 0.01, length(p - c) + (vnoise(p * 30.0, vec2(1e4)) - 0.5) * 0.02); }
void main() {
  vec2 p = vUv;
  vec3 c = vec3(0.92, 0.9, 0.84);
  float wob = (vnoise(p * 12.0, vec2(1e4)) - 0.5) * 0.03;
  c = mix(c, vec3(0.35, 0.6, 0.95), smoothstep(0.5, 0.52, p.y + wob) * 0.8);
  c = mix(c, vec3(1.0, 0.8, 0.1), blob(p, vec2(0.78, 0.78), 0.1));
  float hill = 0.32 + 0.08 * sin(p.x * 4.0 + 1.0) + wob;
  c = mix(c, vec3(0.25, 0.65, 0.2), 1.0 - smoothstep(hill - 0.01, hill + 0.01, p.y));
  float house = step(0.2, p.x) * step(p.x, 0.45) * step(0.28, p.y) * step(p.y, 0.5);
  c = mix(c, vec3(0.9, 0.2, 0.15), house);
  float roof = step(0.5, p.y) * step(p.y, 0.5 + 0.15 - abs(p.x - 0.325) * 1.1);
  c = mix(c, vec3(0.5, 0.25, 0.6), roof);
  c *= 0.93 + 0.07 * vnoise(p * 200.0, vec2(1e4));
  gl_FragColor = vec4(c, 1.0);
}`;

// The house seen through the patio's glass doors: a dim room with sheer
// curtains gathered at the sides and a band of floor at the bottom. The glass
// adds its own reflections on top.
const INTERIOR_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  vec2 p = vUv;
  vec3 c = mix(vec3(0.16, 0.15, 0.14), vec3(0.3, 0.29, 0.27), smoothstep(0.1, 1.0, p.y));
  c = mix(c, vec3(0.36, 0.28, 0.21), 1.0 - smoothstep(0.14, 0.16, p.y));
  float side = min(p.x, 1.0 - p.x);
  float drape = 1.0 - smoothstep(0.13, 0.17, side + (vnoise(vec2(p.y * 6.0, 1.0), vec2(1e4)) - 0.5) * 0.03);
  float folds = 0.78 + 0.22 * sin(p.x * 140.0 + vnoise(p * vec2(8.0, 2.0), vec2(1e4)) * 3.0);
  c = mix(c, vec3(0.8, 0.77, 0.71) * folds * mix(0.8, 1.0, p.y), drape * 0.9);
  c *= 0.94 + 0.06 * vnoise(p * vec2(60.0, 90.0), vec2(1e4));
  gl_FragColor = vec4(c, 1.0);
}`;

// ------------------------------------------------------------ soft shadows

// A contact-hardening replacement for three's PCF shadow lookup, used on
// the floors only. It samples the shadow map at a few depth offsets to
// estimate how far above the floor the blocker is, then widens the filter
// with that distance, so a tower's shadow is crisp at its base and softer
// at the top, like a real window or lamp. The receiver-plane slope keeps
// the wide filter from shadowing the floor with itself.
const SOFT_SHADOW_FN = /* glsl */ `
uniform vec4 uShInfo;
uniform vec3 uShPersp;
float shDist( float z ) {
  return uShPersp.x > 0.5 ? uShPersp.y * uShPersp.z / ( uShPersp.z - z * ( uShPersp.z - uShPersp.y ) ) : z * uShInfo.y;
}
float shDepth( float d ) {
  return uShPersp.x > 0.5 ? uShPersp.z * ( d - uShPersp.y ) / ( d * ( uShPersp.z - uShPersp.y ) ) : d / uShInfo.y;
}
float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  vec3 ddx = dFdx( shadowCoord.xyz );
  vec3 ddy = dFdy( shadowCoord.xyz );
  if ( shadowCoord.x < 0.0 || shadowCoord.x > 1.0 || shadowCoord.y < 0.0 || shadowCoord.y > 1.0 || shadowCoord.z > 1.0 ) return 1.0;
  float det = ddx.x * ddy.y - ddx.y * ddy.x;
  vec2 slope = abs( det ) > 1e-14 ? vec2( ddy.y * ddx.z - ddx.y * ddy.z, ddx.x * ddy.z - ddy.x * ddx.z ) / det : vec2( 0.0 );
  slope = clamp( slope, vec2( -20.0 ), vec2( 20.0 ) );
  float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
  float dRecv = shDist( shadowCoord.z );
  float mPerUv = uShPersp.x > 0.5 ? uShInfo.x * dRecv : uShInfo.x;
  float searchUv = 0.5 * ( uShInfo.z * 0.45 + uShInfo.w ) / mPerUv;
  float occ0 = 0.0;
  for ( int i = 0; i < SH_SEARCH; i ++ ) {
    vec2 o = vogelDiskSample( i, SH_SEARCH, phi ) * searchUv;
    occ0 += 1.0 - texture( shadowMap, vec3( shadowCoord.xy + o, shadowCoord.z + dot( slope, o ) ) );
  }
  if ( occ0 < 1e-3 ) return 1.0;
  // deep inside a shadow the wide filter would only find shadow too
  if ( occ0 > float( SH_SEARCH ) - 1e-3 ) return 1.0 - shadowIntensity;
  float o1 = 0.0;
  float o2 = 0.0;
  float o3 = 0.0;
  for ( int i = 0; i < SH_SEARCH; i ++ ) {
    vec2 o = vogelDiskSample( i, SH_SEARCH, phi ) * searchUv;
    vec2 uv = shadowCoord.xy + o;
    float d = shDist( shadowCoord.z + dot( slope, o ) );
    o1 += 1.0 - texture( shadowMap, vec3( uv, shDepth( d - 0.012 ) ) );
    o2 += 1.0 - texture( shadowMap, vec3( uv, shDepth( d - 0.05 ) ) );
    o3 += 1.0 - texture( shadowMap, vec3( uv, shDepth( d - 0.2 ) ) );
  }
  // mean blocker distance from how many blockers lie beyond each offset
  float p1 = o1 / occ0;
  float p2 = o2 / occ0;
  float p3 = o3 / occ0;
  float dBlock = 0.006 * ( 1.0 + p1 ) + 0.019 * ( p1 + p2 ) + 0.075 * ( p2 + p3 ) + 0.25 * p3;
  float pen = dBlock * uShInfo.z + uShInfo.w;
  float r = max( 0.5 * pen / mPerUv, 0.7 / shadowMapSize.x );
  float s = 0.0;
  for ( int i = 0; i < SH_FILTER; i ++ ) {
    vec2 o = vogelDiskSample( i, SH_FILTER, phi + 1.7 ) * r;
    s += texture( shadowMap, vec3( shadowCoord.xy + o, shadowCoord.z + dot( slope, o ) ) );
  }
  return mix( 1.0, s / float( SH_FILTER ), shadowIntensity );
}
`;

function softShadowChunk(tier) {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const start = chunk.indexOf('float getShadow( sampler2DShadow shadowMap');
  const end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )', start);
  if (start < 0 || end < 0) return null;
  const taps = tier === 'high' ? '#define SH_SEARCH 6\n#define SH_FILTER 12\n' : '#define SH_SEARCH 5\n#define SH_FILTER 8\n';
  return taps + chunk.slice(0, start) + SOFT_SHADOW_FN + '\n\t' + chunk.slice(end);
}

// ------------------------------------------------------------ room materials

// Shared by every hooked material in a room: ambient occlusion from the
// furniture footprints and the room's corners (which the screen-space AO
// cannot see past the edge of the picture), and the bedtime star projector.
const ROOM_PARS = /* glsl */ `
uniform float uTime;
uniform vec4 uOcc[8];
uniform vec4 uOccH[8];
uniform vec4 uWalls;
uniform float uCeil;
uniform float uCornerAO;
float roomBoxDist(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float roomOcclusion(vec3 p) {
  float occ = 1.0;
  for (int i = 0; i < 8; i++) {
    if (uOcc[i].z <= 0.0) continue;
    float d = max(roomBoxDist(p.xz, uOcc[i].xy, uOcc[i].zw), 0.0);
    float hgt = uOccH[i].x;
    float reach = 0.3 * hgt + 0.03;
    float below = 1.0 - smoothstep(hgt * 0.6, hgt * 1.15, p.y);
    occ *= 1.0 - uOccH[i].y * exp(-d / reach) * below;
  }
  float dw = min(min(p.x - uWalls.x, uWalls.y - p.x), min(p.z - uWalls.z, uWalls.w - p.z));
  float corner = exp(-max(dw, 0.0) / 0.2) * exp(-max(p.y, 0.0) / 0.25);
  float top = exp(-max(dw, 0.0) / 0.25) * exp(-max(uCeil - p.y, 0.0) / 0.25);
  occ *= 1.0 - uCornerAO * min(1.0, corner + top * 0.6);
  return clamp(occ, 0.0, 1.0);
}
`;

const STARS_PARS = /* glsl */ `
uniform vec3 uProj;
uniform float uStarGain;
uniform float uStarTurn;
uniform vec3 uFairy[24];
uniform float uFairyGain;
${NOISE}
vec3 projectedStars(vec3 p) {
  vec3 d = normalize(p - uProj);
  float a = uStarTurn;
  float ca = cos(a);
  float sa = sin(a);
  d.xz = mat2(ca, -sa, sa, ca) * d.xz;
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(d.z, d.x);
  vec2 g = vec2(lon, lat) * 9.0;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  vec2 c = 0.2 + 0.6 * hash22(cell + 11.0);
  float size = mix(0.04, 0.09, hash12(cell + 3.0));
  vec2 dd = (f - c) * vec2(cos(lat), 1.0);
  float r = length(dd);
  float on = step(0.3, hash12(cell + 7.0));
  float star = (1.0 - smoothstep(size * 0.35, size, r)) * on;
  float dist = length(p - uProj);
  vec3 tint = mix(vec3(1.0, 0.72, 0.34), vec3(1.0, 0.86, 0.6), step(0.6, hash12(cell + 5.0)));
  return tint * star * uStarGain / max(dist * dist, 0.3);
}
vec3 fairyGlow(vec3 p) {
  float g = 0.0;
  for (int i = 0; i < 24; i++) {
    vec3 d = p - uFairy[i];
    g += exp(-dot(d, d) / 0.006);
  }
  return vec3(1.0, 0.62, 0.3) * g * uFairyGain;
}
`;

// Adds the room's shader hooks to a standard material. Options:
//   soft: contact-hardening shadows (floors)   rough: roughness in normalMap.a
//   fiber: normalMap.a darkens the pile (rugs) occl: furniture/corner AO
//   stars: bedtime star projector + fairy-light glow as emission
function hook(R, mat, opt = {}) {
  const soft = opt.soft && R.quality.softShadows && R.softChunk;
  const key = [soft ? 's' : '', opt.rough ? 'r' : '', opt.fiber ? 'f' : '', opt.occl ? 'o' : '', opt.stars ? 't' : ''].join('');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, R.uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRoomPos;').replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
{
  vec4 rp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
  rp = instanceMatrix * rp;
  #endif
  vRoomPos = ( modelMatrix * rp ).xyz;
}`,
    );
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\nvarying vec3 vRoomPos;\n${ROOM_PARS}\n${opt.stars ? STARS_PARS : ''}`);
    if (soft) fs = fs.replace('#include <shadowmap_pars_fragment>', R.softChunk);
    if (opt.rough) {
      fs = fs.replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = roughness;\n#ifdef USE_NORMALMAP\n\troughnessFactor *= texture2D( normalMap, vNormalMapUv ).a;\n#endif',
      );
    }
    if (opt.fiber) {
      fs = fs.replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n#ifdef USE_NORMALMAP\n\tdiffuseColor.rgb *= texture2D( normalMap, vNormalMapUv ).a;\n#endif',
      );
    }
    if (opt.stars) {
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += ( projectedStars( vRoomPos ) + fairyGlow( vRoomPos ) ) * diffuseColor.rgb;',
      );
    }
    if (opt.occl) {
      fs = fs.replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
{
  float occ = roomOcclusion( vRoomPos );
  reflectedLight.indirectDiffuse *= occ;
  reflectedLight.indirectSpecular *= occ;
  reflectedLight.directDiffuse *= mix( 1.0, occ, 0.4 );
}`,
      );
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `bt-room-${key}`;
  return mat;
}

// The exterior seen through a window: bright daylight garden or dusk sky.
const VIEW_FRAG = /* glsl */ `
uniform float uGain;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv;
#ifdef DUSK
  vec3 c = mix(vec3(1.0, 0.55, 0.35) * 0.9, vec3(0.08, 0.14, 0.42), smoothstep(0.0, 0.75, p.y));
  c = mix(c, vec3(0.03, 0.05, 0.16), smoothstep(0.7, 1.0, p.y));
  vec2 g = p * vec2(40.0, 30.0);
  vec2 cell = floor(g);
  float st = step(0.86, hash12(cell)) * (1.0 - smoothstep(0.03, 0.12, length(fract(g) - 0.5 - (hash22(cell) - 0.5) * 0.6)));
  c += vec3(0.9, 0.9, 1.0) * st * smoothstep(0.35, 0.8, p.y) * 1.5;
  vec2 m = (p - vec2(0.68, 0.7)) * vec2(1.6, 1.0);
  float moon = (1.0 - smoothstep(0.045, 0.05, length(m))) * smoothstep(0.035, 0.045, length(m - vec2(0.022, 0.012)));
  c += vec3(1.0, 0.92, 0.7) * moon * 5.0;
  float roofs = 0.18 + 0.06 * step(0.5, fract(p.x * 3.0)) + 0.1 * fbm(vec2(p.x * 3.0, 0.2), vec2(1e4));
  c = mix(c, vec3(0.02, 0.025, 0.05), 1.0 - smoothstep(roofs - 0.005, roofs + 0.005, p.y));
#else
  vec3 c = mix(vec3(1.05, 1.0, 0.92), vec3(0.42, 0.62, 1.0), smoothstep(0.2, 1.0, p.y));
  float tree = 0.36 + 0.2 * fbm(vec2(p.x * 3.0, 0.5), vec2(1e4)) + 0.06 * vnoise(vec2(p.x * 16.0, 3.0), vec2(1e4));
  float t = 1.0 - smoothstep(tree - 0.01, tree + 0.01, p.y);
  c = mix(c, vec3(0.2, 0.34, 0.12) * (0.6 + 0.8 * fbm(p * vec2(24.0, 14.0), vec2(1e4))), t);
  c = mix(c, vec3(0.34, 0.52, 0.16), 1.0 - smoothstep(0.1, 0.13, p.y));
#endif
  gl_FragColor = vec4(c * uGain, 1.0);
}`;

// ------------------------------------------------------------ the builder

class Build {
  constructor(id, renderer, quality) {
    this.id = id;
    this.renderer = renderer;
    this.quality = quality;
    this.bin = { list: [], add: (x) => (x && x.dispose && this.bin.list.push(x), x) };
    this.group = new THREE.Group();
    this.group.name = `room-${id}`;
    this.softChunk = quality.shadows && quality.softShadows ? softShadowChunk(quality.tier) : null;
    this.tex = Math.max(256, quality.texSize || 1024);
    this.uniforms = {
      uTime: { value: 0 },
      uOcc: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uOccH: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
      uWalls: { value: new THREE.Vector4(-50, 50, -50, 50) },
      uCeil: { value: 50 },
      uCornerAO: { value: 0 },
      uShInfo: { value: new THREE.Vector4(1, 1, 0.02, 0.0015) },
      uShPersp: { value: new THREE.Vector3(0, 0.1, 10) },
      uProj: { value: new THREE.Vector3() },
      uStarGain: { value: 0 },
      uStarTurn: { value: 0 },
      uFairy: { value: Array.from({ length: 24 }, () => new THREE.Vector3(0, -99, 0)) },
      uFairyGain: { value: 0 },
    };
    this.occCount = 0;
    this.lights = [];
    this.animators = [];
  }

  mesh(geo, mat, { cast = false, receive = false, parent = this.group } = {}) {
    this.bin.add(geo);
    this.bin.add(mat);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  std(params, opt) {
    const m = new THREE.MeshStandardMaterial(params);
    return opt ? hook(this, m, opt) : m;
  }

  // furniture footprint for the analytic floor occlusion
  occluder(x, z, hx, hz, height, strength = 0.45) {
    if (this.occCount >= 8) return;
    this.uniforms.uOcc.value[this.occCount].set(x, z, hx, hz);
    this.uniforms.uOccH.value[this.occCount].set(height, strength, 0, 0);
    this.occCount++;
  }

  walls(xmin, xmax, zmin, zmax, ceil, strength) {
    this.uniforms.uWalls.value.set(xmin, xmax, zmin, zmax);
    this.uniforms.uCeil.value = ceil;
    this.uniforms.uCornerAO.value = strength;
  }

  // Oak boards: albedo (sRGB) and normal + roughness, one 2 m tile.
  woodTextures({ early, late, seed = 3, rings = 260, wear = 0.6, tile = 2 }) {
    const size = this.tex;
    const u = {
      uTile: { value: new THREE.Vector2(tile, tile) },
      uCols: { value: Math.round(tile / 0.122) },
      uSeed: { value: seed },
      uEarly: { value: col(early) },
      uLate: { value: col(late) },
      uRings: { value: rings },
      uGap: { value: 0.0007 },
      uWear: { value: wear },
      uTexel: { value: new THREE.Vector2(tile / size, tile / size) },
    };
    const map = bake(this, { width: size, fragment: WOOD_FRAG, uniforms: u, srgb: true });
    const normalMap = bake(this, { width: size, fragment: WOOD_FRAG, uniforms: u, defines: { NORMAL_PASS: '' } });
    return { map, normalMap, tile: new THREE.Vector2(tile, tile) };
  }

  stoneTextures({ seed = 5 }) {
    const size = this.tex;
    const tile = 2.4;
    const u = {
      uTile: { value: new THREE.Vector2(tile, tile) },
      uSeed: { value: seed },
      uCol0: { value: col('#bda27a') },
      uCol1: { value: col('#a99b84') },
      uCol2: { value: col('#b88f68') },
      uMortar: { value: col('#6f6a5e') },
      uJoint: { value: 0.005 },
      uTexel: { value: new THREE.Vector2(tile / size, tile / size) },
    };
    const map = bake(this, { width: size, fragment: STONE_FRAG, uniforms: u, srgb: true });
    const normalMap = bake(this, { width: size, fragment: STONE_FRAG, uniforms: u, defines: { NORMAL_PASS: '' } });
    return { map, normalMap, tile: new THREE.Vector2(tile, tile) };
  }

  wallTextures() {
    if (this._wall) return this._wall;
    const size = Math.min(1024, this.tex / 2);
    const tile = 0.8;
    const u = { uTileM: { value: tile }, uTexel: { value: new THREE.Vector2(tile / size, tile / size) } };
    const map = bake(this, { width: size, fragment: WALL_FRAG, uniforms: u, srgb: true });
    const normalMap = bake(this, { width: size, fragment: WALL_FRAG, uniforms: u, defines: { NORMAL_PASS: '' } });
    this._wall = { map, normalMap, tile };
    return this._wall;
  }

  fiberTexture() {
    if (this._fiber) return this._fiber;
    this._fiber = bake(this, {
      width: this.quality.tier === 'low' ? 256 : 512,
      fragment: FIBER_FRAG,
      uniforms: { uCells: { value: 22 }, uTileM: { value: 0.1 }, uDepth: { value: 0.0014 } },
    });
    return this._fiber;
  }

  wallMaterial(colour, opt = {}) {
    const w = this.wallTextures();
    return this.std(
      { color: col(colour), map: w.map, normalMap: w.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 },
      { rough: true, occl: true, ...opt },
    );
  }

  // Wall with openings. `from` is the wall's start corner, `along` the unit
  // direction it runs in, and it faces `inward`.
  wall(mat, { from, along, width, height, holes = [] }) {
    const w = this.wallTextures();
    const m = this.mesh(wallGeo(width, height, holes, w.tile), mat);
    const inward = new THREE.Vector3(0, 1, 0).cross(along).negate();
    const basis = new THREE.Matrix4().makeBasis(along, new THREE.Vector3(0, 1, 0), inward);
    m.quaternion.setFromRotationMatrix(basis);
    m.position.copy(from);
    return m;
  }

  ceiling(mat, x0, x1, z0, z1, h) {
    const w = this.wallTextures();
    const m = this.mesh(wallGeo(x1 - x0, z1 - z0, [], w.tile), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x0, h, z0);
    return m;
  }

  skirting(from, along, length, mat) {
    const inward = new THREE.Vector3(0, 1, 0).cross(along).negate();
    const g = roundedBox(length, 0.1, 0.016, 0.004, 1);
    const m = this.mesh(g, mat);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, new THREE.Vector3(0, 1, 0), inward));
    m.position.copy(from).addScaledVector(along, length / 2).addScaledVector(inward, 0.008);
    m.position.y = 0.05;
    return m;
  }

  // A window in a wall: reveals, painted frame with glazing bars, a sill
  // board, the view outside and a pair of curtains. Returns the frame
  // plane for the sun's light cookie.
  window({ center, along, width, height, depth = 0.16, bars = [], transoms = [], view, frameMat, revealMat, curtain, curtainIn = 0 }) {
    const up = new THREE.Vector3(0, 1, 0);
    const inward = up.clone().cross(along).negate();
    const g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, up, inward));
    g.position.copy(center);
    this.group.add(g);
    const hw = width / 2;
    const hh = height / 2;
    const plane = (w, h, mat, pos, rotX, rotY) => {
      const m = this.mesh(new THREE.PlaneGeometry(w, h), mat, { parent: g });
      m.position.copy(pos);
      m.rotation.set(rotX, rotY, 0);
      return m;
    };
    plane(depth, height, revealMat, new THREE.Vector3(-hw, 0, -depth / 2), 0, Math.PI / 2);
    plane(depth, height, revealMat, new THREE.Vector3(hw, 0, -depth / 2), 0, -Math.PI / 2);
    plane(width, depth, revealMat, new THREE.Vector3(0, hh, -depth / 2), Math.PI / 2, 0);
    const fz = -0.085;
    const bar = (w, h, x, y) => {
      const m = this.mesh(roundedBox(w, h, 0.06, 0.006, 1), frameMat, { parent: g });
      m.position.set(x, y, fz);
    };
    const f = 0.055;
    bar(f, height, -hw + f / 2, 0);
    bar(f, height, hw - f / 2, 0);
    bar(width, f, 0, hh - f / 2);
    bar(width, f, 0, -hh + f / 2);
    for (const x of bars) bar(0.05, height, x, 0);
    for (const y of transoms) bar(width, 0.05, 0, y);
    // interior window board
    const sill = this.mesh(roundedBox(width + 0.12, 0.028, depth + 0.05, 0.008, 1), frameMat, { parent: g });
    sill.position.set(0, -hh - 0.014, -depth / 2 + 0.025);
    if (view) {
      const v = this.mesh(new THREE.PlaneGeometry(width + 3, height + 2.4), view, { parent: g });
      v.position.set(0, 0.2, -depth - 0.7);
    }
    if (curtain) {
      for (const s of [-1, 1]) {
        const cw = 0.42;
        const ch = height + 0.55;
        const geo = new THREE.PlaneGeometry(cw, ch, 36, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const flare = 1 + 0.4 * (0.5 - y / ch);
          pos.setZ(i, (Math.sin((x / cw) * Math.PI * 7) * 0.022 + Math.sin((x / cw) * Math.PI * 3 + 1) * 0.01) * flare);
        }
        geo.computeVertexNormals();
        const c = this.mesh(geo, curtain, { parent: g });
        c.position.set(s * (hw + cw / 2 - 0.06 - curtainIn), hh + 0.3 - ch / 2, 0.07);
      }
      const rod = this.mesh(new THREE.CylinderGeometry(0.011, 0.011, width + 0.7, 12), frameMat, { parent: g });
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, hh + 0.31, 0.07);
    }
    return {
      origin: center.clone().addScaledVector(inward, fz + 0.03),
      u: along.clone(),
      v: up.clone(),
      n: inward.clone(),
      half: new THREE.Vector2(hw - f, hh - f),
      bars,
      transoms,
    };
  }

  viewMaterial(dusk, gain) {
    const m = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: NOISE + VIEW_FRAG,
      uniforms: { uGain: { value: gain }, uTime: this.uniforms.uTime },
      defines: dusk ? { DUSK: '' } : {},
    });
    return m;
  }

  // A painted panel door in its architrave (frame paint, defaulting to the
  // door's), fixed flat to a wall at (x, z) and facing into the room.
  door(x, z, along, paint, frame = null, width = 0.84) {
    const up = new THREE.Vector3(0, 1, 0);
    const inward = up.clone().cross(along).negate();
    const g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, up, inward));
    g.position.set(x, 0, z);
    this.group.add(g);
    const box = (w, h, d, px, py, pz, mat = paint) => {
      const m = this.mesh(roundedBox(w, h, d, Math.min(0.004, d / 2.2), 1), mat, { parent: g });
      m.position.set(px, py, pz);
    };
    box(width, 2.04, 0.03, 0, 1.02, 0.015);
    for (const [py, ph] of [[0.5, 0.62], [1.45, 0.82]]) {
      for (const px of [-width / 4 + 0.02, width / 4 - 0.02]) box(width / 2 - 0.13, ph, 0.012, px, py, 0.032);
    }
    const trim = frame || paint;
    box(0.07, 2.11, 0.036, -width / 2 - 0.035, 1.055, 0.018, trim);
    box(0.07, 2.11, 0.036, width / 2 + 0.035, 1.055, 0.018, trim);
    box(width + 0.14, 0.07, 0.036, 0, 2.075, 0.018, trim);
    const brass = this.std({ color: col('#c9a65a'), metalness: 1, roughness: 0.3 });
    box(0.03, 0.12, 0.012, width / 2 - 0.07, 1.0, 0.034, brass);
    const lever = this.mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.1, 12), brass, { parent: g });
    lever.rotation.z = Math.PI / 2;
    lever.position.set(width / 2 - 0.11, 1.03, 0.058);
    return g;
  }

  // Dust motes drifting in the sunbeam: 1-2 px glints lit only where the
  // window's light cookie says the sun reaches them. They write depth, so
  // the depth of field treats each one at its own distance instead of the
  // wall's behind it (which spread them into dotted rings), and they only
  // show near the focal plane: a mote that would need blurring is faded
  // out, and one that is culled is moved off screen so it writes nothing.
  // place(rand, out) puts one mote somewhere in the beam.
  dust(sun, count, place) {
    const rand = rng(77);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      place(rand, p).toArray(pos, i * 3);
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uDrift: { value: 0 },
        uSunMatrix: { value: sun.shadow.matrix },
        uCookie: { value: sun.map },
        uScale: { value: 1000 },
        uFocus: { value: 1.1 },
        uGain: { value: 4.0 },
      },
      vertexShader: /* glsl */ `
uniform float uDrift;
uniform mat4 uSunMatrix;
uniform sampler2D uCookie;
uniform float uScale;
uniform float uFocus;
attribute float aSeed;
varying float vLit;
void main() {
  float t = uDrift;
  vec3 p = position + vec3(sin(t * 0.13 + aSeed * 40.0) * 0.06, sin(t * 0.05 + aSeed * 17.0) * 0.1, cos(t * 0.11 + aSeed * 23.0) * 0.06);
  vec4 sc = uSunMatrix * vec4(p, 1.0);
  vec2 suv = sc.xy / sc.w;
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float lit = inside * texture2D(uCookie, clamp(suv, 0.0, 1.0)).r;
  lit *= (0.35 + 0.65 * fract(aSeed * 7.31)) * (0.6 + 0.4 * sin(t * (0.8 + aSeed) + aSeed * 50.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float z = -mv.z;
  // a 1.5 mm glint: below a pixel it dims instead of shrinking
  float px = 0.0015 * uScale / max(z, 0.01);
  float size = clamp(px, 1.0, 2.0);
  float cover = min(1.0, (px * px) / (size * size));
  // defocus in dioptres beyond the post chain's in-focus tolerance (0.15,
  // the lens pass's uTolerance); fade out before any blur would start
  float defocus = abs(1.0 / uFocus - 1.0 / max(z, 0.01)) - 0.15;
  float sharp = 1.0 - smoothstep(-0.06, 0.04, defocus);
  float band = smoothstep(0.35, 0.6, z) * (1.0 - smoothstep(1.8, 2.6, z));
  vLit = lit * cover * sharp * band;
  gl_PointSize = size;
  gl_Position = vLit < 0.004 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}`,
      fragmentShader: /* glsl */ `
uniform float uGain;
varying float vLit;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * vLit * uGain * (1.0 - 0.4 * smoothstep(0.25, 0.5, d)), 1.0);
}`,
      transparent: true,
      depthWrite: true,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.bin.add(geo);
    this.bin.add(mat);
    this.group.add(pts);
    const size = new THREE.Vector2();
    const eye = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    this.animators.push((dt, time, camera) => {
      if (!REDUCED_MOTION.matches) mat.uniforms.uDrift.value += dt;
      if (camera && camera.isPerspectiveCamera) {
        this.renderer.getDrawingBufferSize(size);
        mat.uniforms.uScale.value = size.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
        // the game focuses on the tower, which stands on the room's vertical
        // axis: take the view ray's closest approach to that axis
        eye.setFromMatrixPosition(camera.matrixWorld);
        camera.getWorldDirection(fwd);
        const flat = fwd.x * fwd.x + fwd.z * fwd.z;
        let focus = flat > 1e-4 ? -(eye.x * fwd.x + eye.z * fwd.z) / flat : eye.length();
        if (!(focus > 0.2)) focus = eye.length();
        mat.uniforms.uFocus.value = Math.min(6, focus);
      }
    });
    return pts;
  }

  // Terracotta pot with a leafy plant; leaves are flattened ellipsoids.
  plant({ x, z, potR = 0.16, potH = 0.3, height = 0.9, leaves = 36, seed = 1, leafColour = '#2f5a24', leafSize = 1 }) {
    const rand = rng(seed);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.group.add(g);
    const prof = [
      [0, 0],
      [potR * 0.72, 0],
      [potR * 0.74, 0.01],
      [potR * 0.95, potH * 0.88],
      [potR * 1.04, potH * 0.9],
      [potR * 1.04, potH],
      [potR * 0.94, potH],
      [potR * 0.92, potH * 0.92],
      [0, potH * 0.92],
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const pot = this.mesh(new THREE.LatheGeometry(prof, 40), this.std({ color: col('#b86a45'), roughness: 0.85 }), { parent: g });
    pot.castShadow = false;
    const leafGeo = new THREE.SphereGeometry(1, 12, 8);
    leafGeo.scale(0.045 * leafSize, 0.008, 0.09 * leafSize);
    leafGeo.translate(0, 0, 0.08 * leafSize);
    const leafMat = this.std({ color: col(leafColour), roughness: 0.45 });
    const inst = new THREE.InstancedMesh(leafGeo, leafMat, leaves);
    this.bin.add(leafGeo);
    this.bin.add(leafMat);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    for (let i = 0; i < leaves; i++) {
      const t = i / leaves;
      const y = potH + (height - potH) * (0.15 + 0.85 * Math.sqrt(t)) + (rand() - 0.5) * 0.05;
      const a = i * 2.4 + rand() * 0.5;
      const rr = (0.03 + 0.12 * (1 - t) + rand() * 0.04) * leafSize;
      e.set(-0.3 - rand() * 0.6 + t * 0.4, a, (rand() - 0.5) * 0.6);
      q.setFromEuler(e);
      const s = 0.8 + rand() * 0.6;
      m.compose(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), q, new THREE.Vector3(s, s, s));
      inst.setMatrixAt(i, m);
      c.set(leafColour).multiplyScalar(0.75 + rand() * 0.5);
      inst.setColorAt(i, c);
    }
    g.add(inst);
    // a few thin stems
    const stemMat = this.std({ color: col('#4a5a2a'), roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const sh = height - potH;
      const stem = this.mesh(new THREE.CylinderGeometry(0.006, 0.008, sh, 6), stemMat, { parent: g });
      stem.position.set((rand() - 0.5) * 0.06, potH + sh / 2 - 0.05, (rand() - 0.5) * 0.06);
      stem.rotation.set((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
    }
    return g;
  }

  // A soft toy bear made of fuzzy spheres, sitting.
  teddy(x, y, z, rotY, scale = 1, colour = '#a8744a') {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    g.scale.setScalar(scale);
    this.group.add(g);
    const fur = new THREE.MeshPhysicalMaterial({ color: col(colour), roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: col('#f0d2b0') });
    this.bin.add(fur);
    const ball = (r, px, py, pz, sx = 1, sy = 1, sz = 1, mat = fur) => {
      const m = this.mesh(new THREE.SphereGeometry(r, 20, 14), mat, { parent: g });
      m.position.set(px, py, pz);
      m.scale.set(sx, sy, sz);
      return m;
    };
    ball(0.075, 0, 0.075, 0, 1, 1.1, 0.9);
    ball(0.058, 0, 0.19, 0.005);
    ball(0.022, -0.045, 0.235, 0);
    ball(0.022, 0.045, 0.235, 0);
    ball(0.025, 0, 0.18, 0.05, 1, 0.8, 0.8, this.std({ color: col('#e3c7a3'), roughness: 0.9 }));
    ball(0.028, -0.07, 0.1, 0.03, 0.8, 1.4, 0.8);
    ball(0.028, 0.07, 0.1, 0.03, 0.8, 1.4, 0.8);
    ball(0.032, -0.04, 0.025, 0.06, 0.9, 0.8, 1.5);
    ball(0.032, 0.04, 0.025, 0.06, 0.9, 0.8, 1.5);
    const eye = this.std({ color: col('#1a1210'), roughness: 0.2 });
    ball(0.007, -0.02, 0.2, 0.052, 1, 1, 1, eye);
    ball(0.007, 0.02, 0.2, 0.052, 1, 1, 1, eye);
    return g;
  }

  // Fit a DirectionalLight's orthographic shadow camera around a sphere,
  // snapped to whole texels so the shadow does not shimmer as it moves.
  fitDirectional(light, toLight, center, radius) {
    const r = Math.max(0.25, radius);
    const cam = light.shadow.camera;
    const size = light.shadow.mapSize.x;
    const texel = (2 * r) / size;
    const basis = new THREE.Matrix4().lookAt(toLight, new THREE.Vector3(), Math.abs(toLight.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
    const inv = basis.clone().invert();
    const c = center.clone().applyMatrix4(inv);
    c.x = Math.round(c.x / texel) * texel;
    c.y = Math.round(c.y / texel) * texel;
    c.applyMatrix4(basis);
    const dist = 4;
    light.target.position.copy(c);
    light.position.copy(c).addScaledVector(toLight, dist);
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.2;
    cam.far = dist + r + 3;
    cam.updateProjectionMatrix();
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
    this.uniforms.uShInfo.value.x = 2 * r;
    this.uniforms.uShInfo.value.y = cam.far - cam.near;
    this.uniforms.uShPersp.value.set(0, cam.near, cam.far);
  }

  // Fit a SpotLight's shadow frustum (a narrower cone than the light's own)
  // around a sphere.
  fitSpot(light, center, radius) {
    light.target.position.copy(center);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
    const dist = light.position.distanceTo(center);
    const half = Math.asin(Math.min(0.95, Math.max(0.2, radius) / dist)) * 1.08;
    light.shadow.focus = Math.min(1, half / light.angle);
    const cam = light.shadow.camera;
    cam.near = Math.max(0.05, dist - radius - 0.4);
    cam.far = dist + radius + 2.5;
    light.shadow.updateMatrices(light);
    cam.updateProjectionMatrix();
    const fov = 2 * light.angle * light.shadow.focus;
    this.uniforms.uShInfo.value.x = 2 * Math.tan(fov / 2);
    this.uniforms.uShPersp.value.set(1, cam.near, cam.far);
  }

  shadowSetup(light, { bias, normalBias, radius }) {
    const q = this.quality;
    light.castShadow = !!q.shadows;
    light.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    light.shadow.bias = bias;
    light.shadow.normalBias = normalBias;
    light.shadow.radius = radius;
  }
}

// ------------------------------------------------------------ playroom

function buildPlayroom(R) {
  const X0 = -2.4;
  const X1 = 2.6;
  const Z0 = -2.3;
  const Z1 = 3.2;
  const H = 2.7;
  R.walls(X0, X1, Z0, Z1, H, 0.45);

  // light oak boards with a satin varnish
  const wood = R.woodTextures({ early: '#d8b584', late: '#ae8452', seed: 7, rings: 300, wear: 0.7 });
  const floorMat = R.std(
    { map: wood.map, normalMap: wood.normalMap, roughness: 1, envMapIntensity: 1 },
    { soft: true, rough: true, occl: true },
  );
  R.mesh(floorGeo(X1 - X0, Z1 - Z0, (X0 + X1) / 2, (Z0 + Z1) / 2, wood.tile), floorMat, { receive: true });

  const wallMat = R.wallMaterial('#f5f0e7');
  const revealMat = wallMat;
  const white = R.std({ color: col('#f4f1ea'), roughness: 0.42 });
  R.ceiling(R.wallMaterial('#f7f3ec'), X0, X1, Z0, Z1, H);

  // Sun window on the left wall and a smaller, shaded one at the back.
  const sunWin = { z0: -0.1, z1: 1.9, y0: 0.75, y1: 2.4 };
  const backWin = { x0: -1.55, x1: -0.55, y0: 0.95, y1: 2.2 };
  const left = new THREE.Vector3(0, 0, -1);
  R.wall(wallMat, { from: new THREE.Vector3(X0, 0, Z1), along: left, width: Z1 - Z0, height: H, holes: [{ x0: Z1 - sunWin.z1, x1: Z1 - sunWin.z0, y0: sunWin.y0, y1: sunWin.y1 }] });
  R.wall(wallMat, { from: new THREE.Vector3(X0, 0, Z0), along: new THREE.Vector3(1, 0, 0), width: X1 - X0, height: H, holes: [{ x0: backWin.x0 - X0, x1: backWin.x1 - X0, y0: backWin.y0, y1: backWin.y1 }] });
  R.wall(wallMat, { from: new THREE.Vector3(X1, 0, Z0), along: new THREE.Vector3(0, 0, 1), width: Z1 - Z0, height: H });
  R.wall(wallMat, { from: new THREE.Vector3(X1, 0, Z1), along: new THREE.Vector3(-1, 0, 0), width: X1 - X0, height: H });
  R.skirting(new THREE.Vector3(X0, 0, Z1), left, Z1 - Z0, white);
  R.skirting(new THREE.Vector3(X0, 0, Z0), new THREE.Vector3(1, 0, 0), X1 - X0, white);
  R.skirting(new THREE.Vector3(X1, 0, Z0), new THREE.Vector3(0, 0, 1), Z1 - Z0, white);
  R.skirting(new THREE.Vector3(X1, 0, Z1), new THREE.Vector3(-1, 0, 0), X1 - X0, white);

  const linen = new THREE.MeshStandardMaterial({ color: col('#efe6d6'), roughness: 0.9, emissive: col('#fff2dc'), emissiveIntensity: 0.06 });
  R.bin.add(linen);
  const view = R.viewMaterial(false, 1.5);
  R.bin.add(view);
  const zc = (sunWin.z0 + sunWin.z1) / 2;
  const yc = (sunWin.y0 + sunWin.y1) / 2;
  const sw = sunWin.z1 - sunWin.z0;
  const frame = R.window({
    center: new THREE.Vector3(X0, yc, zc),
    along: left,
    width: sw,
    height: sunWin.y1 - sunWin.y0,
    bars: [-sw / 6, sw / 6],
    view,
    frameMat: white,
    revealMat,
    curtain: linen,
  });
  R.window({
    center: new THREE.Vector3((backWin.x0 + backWin.x1) / 2, (backWin.y0 + backWin.y1) / 2, Z0),
    along: new THREE.Vector3(1, 0, 0),
    width: backWin.x1 - backWin.x0,
    height: backWin.y1 - backWin.y0,
    bars: [0],
    transoms: [0.25],
    view,
    frameMat: white,
    revealMat,
    curtain: linen,
  });

  // Sun: a SpotLight far outside, aimed through the window, carrying the
  // window's light cookie, so the patch of sun, the glazing-bar shadows and
  // the shade beyond them fall the same on the floor and on the blocks.
  const toSun = new THREE.Vector3(-0.814, 0.5, 0.296).normalize();
  const far = 30;
  const sun = new THREE.SpotLight(col('#ffe2bb'), 10, 0, 0.1, 0, 0);
  sun.position.copy(frame.origin).addScaledVector(toSun, far);
  sun.target.position.copy(frame.origin);
  R.group.add(sun, sun.target);
  // cone just wide enough for the whole window
  let maxA = 0;
  const axis = frame.origin.clone().sub(sun.position).normalize();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const p = frame.origin.clone().addScaledVector(frame.u, sx * frame.half.x).addScaledVector(frame.v, sy * frame.half.y);
      maxA = Math.max(maxA, p.sub(sun.position).normalize().angleTo(axis));
    }
  }
  sun.angle = maxA * 1.1;
  R.shadowSetup(sun, { bias: -0.0002, normalBias: 0.0006, radius: 2 });
  sun.shadow.focus = 1;
  sun.shadow.camera.near = far - 0.9;
  sun.shadow.camera.far = far + 6;
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.updateMatrices(sun);
  const cam = sun.shadow.camera;
  const invVP = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
  const pad = (a) => [...a, 99, 99, 99, 99].slice(0, 4);
  sun.map = bake(R, {
    width: R.quality.tier === 'high' ? 1024 : 512,
    fragment: COOKIE_FRAG,
    mipmaps: false,
    repeat: false,
    uniforms: {
      uInvVP: { value: invVP },
      uWinO: { value: frame.origin },
      uWinU: { value: frame.u },
      uWinV: { value: frame.v },
      uWinN: { value: frame.n },
      uWinHalf: { value: frame.half },
      uBarsU: { value: new THREE.Vector4(...pad(frame.bars)) },
      uBarsV: { value: new THREE.Vector4(...pad(frame.transoms)) },
      uBar: { value: 0.05 },
      uSoft: { value: 0.022 },
    },
  });
  R.uniforms.uShInfo.value.set(2 * Math.tan(sun.angle), 1, 0.022, 0.0014);
  R.uniforms.uShPersp.value.set(1, cam.near, cam.far);
  R.key = sun;
  R.lights.push(sun);
  R.setShadowFocus = () => {}; // the sun's frustum is the window's beam: fixed

  const hemi = new THREE.HemisphereLight(col('#fff4e4'), col('#c9a27a'), 0.35);
  R.group.add(hemi);
  R.lights.push(hemi);

  // --- furniture, all soft in the depth of field
  // cube shelf against the back wall with fabric bins and toys
  const shelf = new THREE.Group();
  shelf.position.set(0.55, 0, Z0 + 0.16);
  R.group.add(shelf);
  const board = (w, h, d, x, y, z, mat = white) => {
    const m = R.mesh(roundedBox(w, h, d, 0.004, 1), mat, { parent: shelf });
    m.position.set(x, y, z);
    return m;
  };
  const SW = 1.12;
  const SH = 0.76;
  for (const x of [-SW / 2, -SW / 6, SW / 6, SW / 2]) board(0.018, SH, 0.3, x, SH / 2, 0);
  for (const y of [0.02, SH / 2, SH]) board(SW + 0.018, 0.018, 0.3, 0, y, 0);
  board(SW, SH, 0.006, 0, SH / 2, -0.147);
  const binCols = ['#9bb59a', '#e5b54f', '#e8998d'];
  const cubbies = [
    [-SW / 3, 0.2],
    [0, 0.2],
    [SW / 3, 0.2],
    [-SW / 3, 0.57],
    [0, 0.57],
    [SW / 3, 0.57],
  ];
  const fabric = (hex) => new THREE.MeshPhysicalMaterial({ color: col(hex), roughness: 0.95, sheen: 0.6, sheenRoughness: 0.6, sheenColor: col('#ffffff') });
  [0, 2, 4].forEach((ci, i) => {
    const m = fabric(binCols[i]);
    R.bin.add(m);
    const b = R.mesh(softBox(0.32, 0.3, 0.27, 0.03, 0.004, 11 + i), m, { parent: shelf });
    b.position.set(cubbies[ci][0], cubbies[ci][1] - 0.02, 0.01);
  });
  // books
  const rand = rng(21);
  const bookCols = ['#c0392b', '#2e6fb0', '#f2c14e', '#3f8f5b', '#8e5bb5', '#f07f3c', '#ecebe4'];
  let bx = -0.15;
  while (bx < 0.14) {
    const w = 0.02 + rand() * 0.025;
    const h = 0.2 + rand() * 0.09;
    const m = R.std({ color: col(bookCols[Math.floor(rand() * bookCols.length)]), roughness: 0.6 });
    const b = R.mesh(roundedBox(w, h, 0.2, 0.002, 1), m, { parent: shelf });
    b.position.set(cubbies[3][0] + bx + w / 2, SH / 2 + 0.009 + h / 2, 0.02);
    bx += w + 0.002;
  }
  // stacking rings toy on a peg
  const ringCols = ['#d94f3d', '#f28c28', '#f6cf3f', '#5bb56b', '#3e86c9'];
  ringCols.forEach((hex, i) => {
    const r = 0.06 - i * 0.009;
    const t = R.mesh(new THREE.TorusGeometry(r, 0.018, 12, 28), R.std({ color: col(hex), roughness: 0.35 }), { parent: shelf });
    t.rotation.x = Math.PI / 2;
    t.position.set(cubbies[5][0], SH / 2 + 0.03 + i * 0.034, 0.02);
  });
  R.teddy(0.55 + 0.22, SH + 0.009, Z0 + 0.18, 0.2, 1.1);
  R.teddy(0.3, SH + 0.009, Z0 + 0.17, -0.3, 0.8, '#d9c3a5');
  R.occluder(0.55, Z0 + 0.16, SW / 2 + 0.01, 0.15, SH, 0.5);

  // child's painting above the shelf
  const art = bake(R, { width: 256, height: 200, fragment: PICTURE_FRAG, srgb: true, repeat: false });
  const pic = R.mesh(new THREE.PlaneGeometry(0.4, 0.31), R.std({ map: art, roughness: 0.8 }));
  pic.position.set(0.5, 1.42, Z0 + 0.012);
  const pframe = R.mesh(roundedBox(0.46, 0.37, 0.02, 0.004, 1), R.std({ color: col('#c79b66'), roughness: 0.55 }));
  pframe.position.set(0.5, 1.42, Z0 + 0.004);

  // big leafy plant in the back-left corner
  R.plant({ x: -1.95, z: Z0 + 0.45, potR: 0.17, potH: 0.32, height: 1.2, leaves: 44, seed: 3, leafSize: 1.5 });
  R.occluder(-1.95, Z0 + 0.45, 0.17, 0.17, 0.35, 0.45);

  // knitted pouf to the right
  const pouf = new THREE.MeshPhysicalMaterial({ color: col('#b9b2a6'), roughness: 0.98, sheen: 0.8, sheenRoughness: 0.5, sheenColor: col('#ffffff') });
  R.bin.add(pouf);
  const pg = softBox(0.5, 0.36, 0.5, 0.16, 0.008, 5, 6);
  const pm = R.mesh(pg, pouf);
  pm.position.set(1.75, 0.18, -1.35);
  R.occluder(1.75, -1.35, 0.23, 0.23, 0.36, 0.45);

  // the door on the front wall, and a second painting on the right wall
  R.door(1.3, Z1, new THREE.Vector3(-1, 0, 0), R.std({ color: col('#a9c0cf'), roughness: 0.4 }), white);
  const pic2 = R.mesh(new THREE.PlaneGeometry(0.4, 0.31), pic.material);
  pic2.rotation.y = -Math.PI / 2;
  pic2.position.set(X1 - 0.012, 1.35, -0.6);
  const pf2 = R.mesh(roundedBox(0.02, 0.37, 0.46, 0.004, 1), R.std({ color: col('#3f6f9e'), roughness: 0.5 }));
  pf2.position.set(X1 - 0.004, 1.35, -0.6);
  // motes in the beam
  const motes = { high: 600, medium: 400, low: 160 }[R.quality.tier] || 300;
  // seeded along rays from the window opening, so none are wasted in shade
  R.dust(sun, motes, (rand, out) => {
    out.set(X0, sunWin.y0 + rand() * (sunWin.y1 - sunWin.y0), sunWin.z0 + rand() * (sunWin.z1 - sunWin.z0));
    return out.addScaledVector(toSun, -(0.1 + rand() * 0.9) * (out.y - 0.05) / toSun.y);
  });

  // a cream rug at the side of the room (clear of the play area)
  const rugMat = R.std(
    { color: col('#e9e0d0'), normalMap: R.fiberTexture(), normalScale: new THREE.Vector2(1, 1), roughness: 1 },
    { fiber: true, occl: true },
  );
  rugMat.normalMap.repeat.set(10, 10);
  const rug = R.mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.012, 64), rugMat, { receive: true });
  rug.position.set(1.9, 0.006, 0.4);
  const ruv = rug.geometry.attributes.uv;
  const rpos = rug.geometry.attributes.position;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, rpos.getX(i) / 1.0 + 0.5, rpos.getZ(i) / 1.0 + 0.5);

  R.exposure = 0.72;
  R.bloom = 0.22;
  R.bloomThreshold = 3.0;
  R.envIntensity = 1.15;
  R.floor = { kind: 'wood', friction: 0.5, restitution: 0.32 };
  R.grade = { white: [1.01, 1.0, 0.97], vignette: 0.24 };
  R.view = { position: new THREE.Vector3(0.12, 0.42, 1.12), target: new THREE.Vector3(0, 0.1, 0) };
  R.envPos = new THREE.Vector3(0, 0.3, 0);
}

// ------------------------------------------------------------ patio

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.2, 0.42, 0.95) * 0.5;
  vec3 horizon = vec3(0.8, 0.9, 1.05) * 0.85;
  vec3 c = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  c += vec3(1.0, 0.9, 0.7) * (pow(s, 6.0) * 0.35 + pow(s, 300.0) * 30.0);
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.12) * 1.3 + vec2(uTime * 0.004, 0.0);
    float cl = smoothstep(0.52, 0.82, fbm(cp, vec2(1e4)));
    c = mix(c, vec3(1.25, 1.22, 1.2) * (0.85 + 0.3 * s), cl * smoothstep(0.0, 0.25, h) * 0.85);
  }
  c = mix(c, vec3(0.18, 0.24, 0.12), smoothstep(0.0, -0.05, h));
  gl_FragColor = vec4(c, 1.0);
}`;

function buildPatio(R) {
  const toSun = new THREE.Vector3(-0.55, 0.78, 0.3).normalize();

  // sandstone flags under the tower, lawn beyond
  const stone = R.stoneTextures({ seed: 9 });
  const stoneMat = R.std(
    { map: stone.map, normalMap: stone.normalMap, roughness: 1 },
    { soft: true, rough: true, occl: true },
  );
  R.mesh(floorGeo(7.2, 6.0, 0, 0.5, stone.tile), stoneMat, { receive: true });
  // a stone kerb where the patio meets the lawn
  const kerbMat = R.std({ color: col('#b09c80'), roughness: 0.85 });
  const kerb = R.mesh(roundedBox(7.3, 0.06, 0.12, 0.012, 1), kerbMat);
  kerb.position.set(0, -0.012, -2.56);

  const grass = bake(R, { width: R.quality.tier === 'low' ? 256 : 512, fragment: GRASS_FRAG, srgb: true });
  grass.repeat.set(1, 1);
  const lawnMat = R.std({ map: grass, roughness: 0.95 });
  const lawn = R.mesh(floorGeo(60, 60, 0, -26, new THREE.Vector2(0.7, 0.7), 1), lawnMat);
  lawn.position.y = -0.04;

  // fence of weathered boards across the end of the garden
  const fenceMat = R.std({ color: col('#8a7258'), roughness: 0.85 });
  const boardGeo = roundedBox(0.13, 1.7, 0.02, 0.004, 1);
  R.bin.add(boardGeo);
  const n = 120;
  const boards = new THREE.InstancedMesh(boardGeo, fenceMat, n);
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  const rand = rng(5);
  for (let i = 0; i < n; i++) {
    // boards of slightly different lengths, a little out of line, as fences are
    const dh = (rand() - 0.5) * 0.06;
    m4.makeRotationZ((rand() - 0.5) * 0.02).setPosition(-9 + i * 0.15 + (rand() - 0.5) * 0.012, 0.85 + dh / 2, -7.2 + (rand() - 0.5) * 0.01);
    m4.scale(new THREE.Vector3(1, 1 + dh / 1.7, 1));
    boards.setMatrixAt(i, m4);
    c.set('#8a7258').multiplyScalar(0.75 + rand() * 0.4);
    boards.setColorAt(i, c);
  }
  R.group.add(boards);

  // shrubs, hedges and flowers: lumpy spheres, blurred by the lens anyway
  const fu = { uCells: { value: new THREE.Vector2(18, 9) } };
  const leafMap = bake(R, { width: 512, height: 256, fragment: FOLIAGE_FRAG, uniforms: fu, srgb: true });
  const leafNormal = bake(R, { width: 512, height: 256, fragment: FOLIAGE_FRAG, uniforms: fu, defines: { NORMAL_PASS: '' } });
  leafMap.repeat.set(3, 2);
  leafNormal.repeat.set(3, 2);
  const leafy = R.std({ vertexColors: true, map: leafMap, normalMap: leafNormal, roughness: 0.75 });
  const shrub = (x, y, z, sx, sy, sz, seed, base = '#3f6b2a') => {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const pos = g.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const r2 = rng(seed);
    const k = [r2() * 5, r2() * 5, r2() * 5];
    const bc = col(base);
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const b = 1 + 0.12 * Math.sin(vx * 5 + k[0]) * Math.sin(vy * 6 + k[1]) + 0.08 * Math.sin(vz * 9 + k[2]);
      pos.setXYZ(i, vx * b, vy * b, vz * b);
      const t = 0.7 + 0.5 * r2() + 0.25 * vy;
      cols[i * 3] = bc.r * t;
      cols[i * 3 + 1] = bc.g * t;
      cols[i * 3 + 2] = bc.b * t;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const mesh = R.mesh(g, leafy);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  };
  for (let i = 0; i < 14; i++) {
    const x = -8 + i * 1.2 + (rand() - 0.5) * 0.5;
    const s = 0.5 + rand() * 0.45;
    shrub(x, s * 0.7, -6.6 + (rand() - 0.5) * 0.3, s * 1.2, s, s, 30 + i, rand() < 0.3 ? '#55702f' : '#35602a');
  }
  // side hedges
  shrub(-5.6, 0.9, -2.5, 0.9, 1.1, 5.5, 91, '#2f5a24');
  shrub(5.8, 0.9, -2.5, 0.9, 1.1, 5.5, 92, '#2f5a24');
  // trees beyond the fence
  const bark = R.std({ color: col('#5b4a3a'), roughness: 0.9 });
  for (const [x, z, h, s] of [
    [-5.5, -11, 3.2, 2.4],
    [0.8, -13, 4.0, 3.2],
    [6.5, -10.5, 3.0, 2.2],
    [-1.8, -9.5, 2.4, 1.6],
  ]) {
    const trunk = R.mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 10), bark);
    trunk.position.set(x, h / 2, z);
    shrub(x, h + s * 0.35, z, s, s * 0.85, s, Math.round(x * 10 + z), '#3b6a2c');
    shrub(x + s * 0.5, h - 0.2, z + 0.3, s * 0.6, s * 0.55, s * 0.6, Math.round(x * 7 - z), '#45742f');
  }
  // flowers in the border along the fence
  const flowerGeo = new THREE.SphereGeometry(0.035, 8, 6);
  R.bin.add(flowerGeo);
  const flowerMat = R.std({ roughness: 0.6 });
  const fl = 160;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, fl);
  const fcols = ['#f4f1f6', '#f2a7c3', '#e04f6a', '#f6d24a', '#9b6fd0', '#ff9c4a'];
  for (let i = 0; i < fl; i++) {
    const x = -8.5 + rand() * 17;
    const z = -6.4 + (rand() - 0.5) * 0.9;
    const y = 0.25 + rand() * 0.7;
    m4.makeTranslation(x, y, z + 0.5);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, c.set(fcols[Math.floor(rand() * fcols.length)]));
  }
  R.group.add(flowers);

  // pots of lavender and geraniums on the flags
  R.plant({ x: -2.1, z: -1.9, potR: 0.18, potH: 0.3, height: 0.62, leaves: 40, seed: 7, leafColour: '#5d7d4a', leafSize: 0.7 });
  R.plant({ x: 2.3, z: -1.5, potR: 0.15, potH: 0.26, height: 0.55, leaves: 34, seed: 8, leafColour: '#3b6b2a', leafSize: 0.8 });
  R.plant({ x: -2.6, z: 1.2, potR: 0.2, potH: 0.36, height: 0.9, leaves: 44, seed: 9, leafColour: '#2f5d27', leafSize: 1.1 });
  const blossom = new THREE.InstancedMesh(flowerGeo, flowerMat, 60);
  for (let i = 0; i < 60; i++) {
    const [px, pz, py, cc] = i < 30 ? [-2.1, -1.9, 0.55, '#8f6fcf'] : [2.3, -1.5, 0.48, '#e84a5f'];
    const a = rand() * 6.28;
    const r = rand() * 0.14;
    m4.makeScale(0.5, 0.5, 0.5).setPosition(px + Math.cos(a) * r, py + rand() * 0.12, pz + Math.sin(a) * r);
    blossom.setMatrixAt(i, m4);
    blossom.setColorAt(i, c.set(cc));
  }
  R.group.add(blossom);
  R.occluder(-2.1, -1.9, 0.18, 0.18, 0.3, 0.4);
  R.occluder(2.3, -1.5, 0.15, 0.15, 0.26, 0.4);
  R.occluder(-2.6, 1.2, 0.2, 0.2, 0.36, 0.4);

  // the house behind the camera: rendered wall and a glazed door
  const render = R.wallMaterial('#ece2d0');
  R.wall(render, { from: new THREE.Vector3(8, 0, 3.6), along: new THREE.Vector3(-1, 0, 0), width: 16, height: 4.5, holes: [{ x0: 7.1, x1: 8.9, y0: 0, y1: 2.1 }] });
  // glazed French doors: glass with a pale room behind, in white frames
  const inside = bake(R, { width: 256, height: 256, fragment: INTERIOR_FRAG, srgb: true, repeat: false });
  const glass = R.std({ map: inside, roughness: 0.04 });
  const door = R.mesh(new THREE.PlaneGeometry(1.8, 2.1), glass);
  door.rotation.y = Math.PI;
  door.position.set(0, 1.05, 3.68);
  const doorFrame = R.std({ color: col('#f2f0ea'), roughness: 0.45 });
  for (const [w, h, x, y] of [
    [0.07, 2.1, -0.865, 1.05],
    [0.07, 2.1, 0.865, 1.05],
    [0.1, 2.1, 0, 1.05],
    [1.8, 0.07, 0, 2.065],
    [1.8, 0.12, 0, 0.06],
    [1.8, 0.05, 0, 1.0],
  ]) {
    const b = R.mesh(roundedBox(w, h, 0.05, 0.006, 1), doorFrame);
    b.position.set(x, y, 3.65);
  }

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE + SKY_FRAG,
    uniforms: { uSunDir: { value: toSun }, uTime: R.uniforms.uTime },
    side: THREE.BackSide,
    depthWrite: true,
  });
  R.mesh(new THREE.SphereGeometry(28, 48, 24), skyMat);

  const sun = new THREE.DirectionalLight(col('#fff0da'), 5.5);
  R.group.add(sun, sun.target);
  R.shadowSetup(sun, { bias: -0.0001, normalBias: 0.0006, radius: 2 });
  R.uniforms.uShInfo.value.z = 0.012;
  R.uniforms.uShInfo.value.w = 0.0012;
  R.setShadowFocus = (center, radius) => R.fitDirectional(sun, toSun, center, radius);
  R.setShadowFocus(new THREE.Vector3(0, 0.15, 0), 0.6);
  R.key = sun;
  R.lights.push(sun);
  const hemi = new THREE.HemisphereLight(col('#cfe2ff'), col('#80905a'), 0.3);
  R.group.add(hemi);
  R.lights.push(hemi);

  R.exposure = 1.0;
  R.bloom = 0.18;
  R.bloomThreshold = 4.0;
  R.envIntensity = 0.85;
  R.floor = { kind: 'stone', friction: 0.62, restitution: 0.36 };
  R.grade = { white: [1.0, 1.0, 0.99], vignette: 0.2 };
  R.view = { position: new THREE.Vector3(0.1, 0.42, 1.12), target: new THREE.Vector3(0, 0.1, 0) };
  R.envPos = new THREE.Vector3(0, 0.3, 0);
}

// ------------------------------------------------------------ bedtime

function buildBedtime(R) {
  const X0 = -2.2;
  const X1 = 2.4;
  const Z0 = -2.0;
  const Z1 = 3.0;
  const H = 2.5;
  const RUG = new THREE.Vector2(2.4, 1.9);
  R.walls(X0, X1, Z0, Z1, H, 0.4);

  // walnut-toned boards round a thick wool rug; the rug's top is y = 0
  const wood = R.woodTextures({ early: '#8c5f3c', late: '#5a3a22', seed: 11, rings: 230, wear: 0.4 });
  const floorMat = R.std({ map: wood.map, normalMap: wood.normalMap, roughness: 1 }, { soft: true, rough: true, occl: true });
  const floor = R.mesh(floorGeo(X1 - X0, Z1 - Z0, (X0 + X1) / 2, (Z0 + Z1) / 2, wood.tile), floorMat, { receive: true });
  floor.position.y = -0.014;

  const design = bake(R, {
    width: 1024,
    height: 810,
    fragment: RUG_FRAG,
    srgb: true,
    repeat: false,
    uniforms: {
      uSize: { value: RUG },
      uBase: { value: col('#e6dac6') },
      uBand1: { value: col('#8fa3b8') },
      uBand2: { value: col('#d9a79a') },
      uStar: { value: col('#e2b04a') },
    },
  });
  const fiber = R.fiberTexture();
  const rugMat = hook(
    R,
    new THREE.MeshPhysicalMaterial({
      map: design,
      normalMap: fiber,
      normalScale: new THREE.Vector2(1, 1),
      roughness: 1,
      sheen: 1,
      sheenRoughness: 0.55,
      sheenColor: col('#fff1dc'),
    }),
    { soft: true, fiber: true, occl: true },
  );
  R.bin.add(rugMat);
  // the pile tile is 10 cm; each room bakes its own, so the repeat is ours
  fiber.repeat.set(RUG.x / 0.1, RUG.y / 0.1);
  const rg = roundedBox(RUG.x, 0.014, RUG.y, 0.006, 2);
  const ruv = rg.attributes.uv;
  const rp = rg.attributes.position;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, rp.getX(i) / RUG.x + 0.5, -rp.getZ(i) / RUG.y + 0.5);
  const rug = R.mesh(rg, rugMat, { receive: true });
  rug.position.set(0, -0.007, 0);

  const wallMat = R.wallMaterial('#c5ccd6', { stars: true });
  const revealMat = wallMat;
  R.ceiling(R.wallMaterial('#f1e9df', { stars: true }), X0, X1, Z0, Z1, H);
  const paint = R.std({ color: col('#f2eee6'), roughness: 0.45 });
  const win = { x0: -1.35, x1: -0.15, y0: 0.85, y1: 2.0 };
  R.wall(wallMat, { from: new THREE.Vector3(X0, 0, Z0), along: new THREE.Vector3(1, 0, 0), width: X1 - X0, height: H, holes: [{ x0: win.x0 - X0, x1: win.x1 - X0, y0: win.y0, y1: win.y1 }] });
  R.wall(wallMat, { from: new THREE.Vector3(X0, 0, Z1), along: new THREE.Vector3(0, 0, -1), width: Z1 - Z0, height: H });
  R.wall(wallMat, { from: new THREE.Vector3(X1, 0, Z0), along: new THREE.Vector3(0, 0, 1), width: Z1 - Z0, height: H });
  R.wall(wallMat, { from: new THREE.Vector3(X1, 0, Z1), along: new THREE.Vector3(-1, 0, 0), width: X1 - X0, height: H });
  for (const [from, along, len] of [
    [new THREE.Vector3(X0, 0, Z1), new THREE.Vector3(0, 0, -1), Z1 - Z0],
    [new THREE.Vector3(X0, 0, Z0), new THREE.Vector3(1, 0, 0), X1 - X0],
    [new THREE.Vector3(X1, 0, Z0), new THREE.Vector3(0, 0, 1), Z1 - Z0],
    [new THREE.Vector3(X1, 0, Z1), new THREE.Vector3(-1, 0, 0), X1 - X0],
  ]) {
    const s = R.skirting(from, along, len, paint);
    s.position.y = 0.05 - 0.014;
  }
  const curtain = new THREE.MeshStandardMaterial({ color: col('#7f93b4'), roughness: 0.9 });
  R.bin.add(curtain);
  const dusk = R.viewMaterial(true, 1.0);
  R.bin.add(dusk);
  R.window({
    center: new THREE.Vector3((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, Z0),
    along: new THREE.Vector3(1, 0, 0),
    width: win.x1 - win.x0,
    height: win.y1 - win.y0,
    bars: [0],
    view: dusk,
    frameMat: paint,
    revealMat,
    curtain,
    curtainIn: 0.14,
  });

  // the bed along the right wall: frame, mattress, a soft duvet and pillow
  const woodMat = R.std({ color: col('#c9a57c'), roughness: 0.5 });
  const bed = new THREE.Group();
  bed.position.set(1.8, 0, -1.0);
  R.group.add(bed);
  const part = (geo, mat, x, y, z) => {
    const m = R.mesh(geo, mat, { parent: bed });
    m.position.set(x, y, z);
    return m;
  };
  part(roundedBox(1.14, 0.26, 1.98, 0.02, 2), woodMat, 0, 0.16, 0);
  part(roundedBox(1.14, 0.8, 0.05, 0.02, 2), woodMat, 0, 0.4, -1.0);
  for (const x of [-0.55, 0.55]) part(roundedBox(0.06, 0.3, 0.06, 0.01, 1), woodMat, x, 0.15, 0.96);
  const duvetMat = new THREE.MeshPhysicalMaterial({ color: col('#f3ede4'), roughness: 0.9, sheen: 1, sheenRoughness: 0.5, sheenColor: col('#ffffff') });
  R.bin.add(duvetMat);
  part(softBox(1.08, 0.18, 1.9, 0.08, 0.004, 3), duvetMat, 0, 0.37, 0.02);
  const cover = new THREE.MeshPhysicalMaterial({ color: col('#aebdd6'), roughness: 0.92, sheen: 1, sheenRoughness: 0.45, sheenColor: col('#e8eeff') });
  R.bin.add(cover);
  part(softBox(1.22, 0.1, 1.35, 0.05, 0.012, 7, 6), cover, -0.04, 0.5, 0.3);
  part(softBox(0.62, 0.14, 0.38, 0.07, 0.01, 9, 6), duvetMat, 0, 0.53, -0.72);
  R.teddy(1.65, 0.54, -0.35, -1.2, 1.2, '#b98a5c');
  R.occluder(1.8, -1.0, 0.58, 1.0, 0.5, 0.45);

  // fairy lights draped in three low swags along the back wall, where a
  // camera kneeling by the tower sees them glowing behind it
  const bulbs = [];
  const fairy = R.uniforms.uFairy.value;
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const x = X0 + 0.15 + t * (X1 - X0 - 0.3);
    const y = 0.6 - 0.1 * Math.sin(((t * 3) % 1) * Math.PI);
    fairy[i].set(x, y, Z0 + 0.03);
    bulbs.push(fairy[i].clone());
  }
  const bulbGeo = new THREE.SphereGeometry(0.008, 10, 8);
  R.bin.add(bulbGeo);
  const bulbMat = new THREE.MeshBasicMaterial({ color: col('#ffffff') });
  R.bin.add(bulbMat);
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
  const m4 = new THREE.Matrix4();
  bulbs.forEach((b, i) => {
    bulbMesh.setMatrixAt(i, m4.makeTranslation(b.x, b.y, b.z + 0.008));
    bulbMesh.setColorAt(i, new THREE.Color(6, 2.9, 1.0));
  });
  R.group.add(bulbMesh);
  const wire = new THREE.CatmullRomCurve3(bulbs.map((b) => new THREE.Vector3(b.x, b.y + 0.006, b.z + 0.006)));
  R.mesh(new THREE.TubeGeometry(wire, 120, 0.0012, 4, false), R.std({ color: col('#3a3a2e'), roughness: 0.6 }));
  R.uniforms.uFairyGain.value = 0.35;
  const tw = new THREE.Color();
  R.animators.push((dt, time) => {
    const c = tw;
    for (let i = 0; i < bulbs.length; i++) {
      const k = 1 + 0.12 * Math.sin(time * (0.7 + (i % 5) * 0.23) + i * 1.7);
      bulbMesh.setColorAt(i, c.setRGB(6 * k, 2.9 * k, 1.0 * k));
    }
    bulbMesh.instanceColor.needsUpdate = true;
  });

  // the room's night lamp: a glowing moon on a low bookcase under the
  // window, placed so the game's camera (a little right of the tower,
  // looking slightly left) has it in frame in landscape and portrait, clear
  // of the tower, glowing below the curtains
  const shelfMat = R.std({ color: col('#e9e2d6'), roughness: 0.55 });
  const bcX = -0.5;
  // (low, so the fairy lights stay in view above it)
  const bcH = 0.32;
  const bc = R.mesh(roundedBox(0.8, bcH, 0.3, 0.01, 1), shelfMat);
  bc.position.set(bcX, bcH / 2, Z0 + 0.16);
  R.occluder(bcX, Z0 + 0.16, 0.4, 0.15, bcH, 0.45);
  const moonMat = new THREE.MeshStandardMaterial({ color: col('#fff1dc'), emissive: col('#ffb466'), emissiveIntensity: 2.6, roughness: 0.6 });
  R.bin.add(moonMat);
  const moon = R.mesh(new THREE.SphereGeometry(0.1, 32, 20), moonMat);
  moon.position.set(bcX + 0.28, bcH + 0.1, Z0 + 0.17);
  const glow = new THREE.PointLight(col('#ffb870'), 0.32, 0, 2);
  glow.position.set(bcX + 0.28, bcH + 0.12, Z0 + 0.34);
  R.group.add(glow);
  R.lights.push(glow);
  const books = ['#c96f5a', '#6f8fb8', '#e2b04a', '#7aa37a'];
  books.forEach((hex, i) => {
    const b = R.mesh(roundedBox(0.035, 0.17, 0.13, 0.002, 1), R.std({ color: col(hex), roughness: 0.6 }));
    b.position.set(bcX - 0.16 + i * 0.04, bcH + 0.085, Z0 + 0.16);
  });
  // star projector: a little dome on the bookcase
  const projMat = new THREE.MeshStandardMaterial({ color: col('#dfe6f5'), emissive: col('#9fb4ff'), emissiveIntensity: 0.8, roughness: 0.3 });
  R.bin.add(projMat);
  const proj = R.mesh(new THREE.SphereGeometry(0.05, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), projMat);
  proj.position.set(bcX - 0.3, bcH, Z0 + 0.2);
  R.uniforms.uProj.value.set(bcX - 0.3, bcH + 0.06, Z0 + 0.2);
  R.uniforms.uStarGain.value = 0.9;
  R.animators.push((dt, time) => {
    if (!REDUCED_MOTION.matches) R.uniforms.uStarTurn.value += dt * 0.015;
  });

  // the bedroom door, behind the player
  R.door(0.9, Z1, new THREE.Vector3(-1, 0, 0), paint);

  // chest of drawers with the reading lamp, front left
  const chest = R.mesh(roundedBox(0.45, 0.62, 0.7, 0.01, 1), shelfMat);
  chest.position.set(X0 + 0.24, 0.31, 1.0);
  R.occluder(X0 + 0.24, 1.0, 0.23, 0.35, 0.62, 0.45);
  const baseMat = R.std({ color: col('#d8c7b0'), roughness: 0.35 });
  const lampBase = R.mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 24), baseMat);
  lampBase.position.set(X0 + 0.26, 0.73, 1.0);
  const shadeMat = new THREE.MeshStandardMaterial({ color: col('#f6e7cf'), emissive: col('#ffb56a'), emissiveIntensity: 1.6, roughness: 0.9 });
  R.bin.add(shadeMat);
  const shade = R.mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 32, 1, true), shadeMat);
  shade.position.set(X0 + 0.26, 0.93, 1.0);

  // key: the lamp's warm light onto the rug, soft because the shade is big
  const lamp = new THREE.SpotLight(col('#ffc48a'), 11, 0, 0.85, 0.75, 2);
  lamp.position.set(X0 + 0.35, 0.95, 0.95);
  R.group.add(lamp, lamp.target);
  R.shadowSetup(lamp, { bias: -0.00015, normalBias: 0.0008, radius: 4 });
  R.uniforms.uShInfo.value.z = 0.07;
  R.uniforms.uShInfo.value.w = 0.0016;
  R.setShadowFocus = (center, radius) => R.fitSpot(lamp, center, radius);
  R.setShadowFocus(new THREE.Vector3(0, 0.15, 0), 0.6);
  R.key = lamp;
  R.lights.push(lamp);
  // soft warm fill from the lamp's bounce and a dusk-blue sky from above
  const hemi = new THREE.HemisphereLight(col('#8ea0cc'), col('#9a6a44'), 0.5);
  R.group.add(hemi);
  R.lights.push(hemi);

  R.exposure = 1.28;
  R.bloom = 0.38;
  R.bloomThreshold = 2.2;
  R.envIntensity = 1.0;
  R.floor = { kind: 'rug', friction: 0.95, restitution: 0.06 };
  R.grade = { white: [1.0, 0.99, 0.99], vignette: 0.28, shadowTint: [-0.004, 0.0, 0.01], highTint: [0.01, 0.004, -0.006] };
  R.view = { position: new THREE.Vector3(0.1, 0.42, 1.12), target: new THREE.Vector3(0, 0.1, 0) };
  R.envPos = new THREE.Vector3(0, 0.3, 0);
}

// ------------------------------------------------------------ entry

const BUILDERS = { playroom: buildPlayroom, patio: buildPatio, bedtime: buildBedtime };

// Render the finished room into a PMREM so glossy blocks reflect it. The
// capture scene carries a black stand-in environment of the same size, so
// the room's shader programs compiled here are the very ones the game then
// uses (compiling is the slow part of loading a room). compileAsync lets
// the driver build them in parallel without freezing the loader.
async function captureEnvironment(R) {
  const size = R.quality.envSize || 256;
  const pmrem = new THREE.PMREMGenerator(R.renderer);
  const blank = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 1, { size });
  const scene = new THREE.Scene();
  scene.environment = blank.texture;
  scene.environmentIntensity = 0;
  scene.add(R.group);
  const cam = new THREE.PerspectiveCamera(90, 1, 0.03, 60);
  cam.position.copy(R.envPos);
  const t = performance.now();
  if (R.renderer.compileAsync) {
    // compile for an off-screen target (linear output, no tone mapping),
    // which is how the capture and the post chain render the room
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const prev = R.renderer.getRenderTarget();
    R.renderer.setRenderTarget(target);
    const done = R.renderer.compileAsync(scene, cam);
    R.renderer.setRenderTarget(prev);
    await done;
    target.dispose();
  }
  const t1 = performance.now();
  // two bounces: the second capture sees walls already lit by the first,
  // so sunlight off the floor warms the whole room as it does in life
  const first = pmrem.fromScene(scene, 0.01, 0.03, 60, { size, position: R.envPos });
  scene.environment = first.texture;
  scene.environmentIntensity = R.envIntensity;
  const rt = pmrem.fromScene(scene, 0.01, 0.03, 60, { size, position: R.envPos });
  first.dispose();
  if (DEBUG) console.log(`room ${R.id}: compile ${(t1 - t).toFixed(0)} ms, capture ${(performance.now() - t1).toFixed(0)} ms, programs ${R.renderer.info.programs.length}`);
  pmrem.dispose();
  blank.dispose();
  scene.remove(R.group);
  R.bin.add(rt);
  return rt;
}

export async function createRoom(id, { renderer, quality }) {
  const build = BUILDERS[id] || BUILDERS.playroom;
  const R = new Build(BUILDERS[id] ? id : 'playroom', renderer, quality);
  const t0 = performance.now();
  build(R);
  const t1 = performance.now();
  const env = await captureEnvironment(R);
  if (DEBUG) console.log(`room ${R.id}: build ${(t1 - t0).toFixed(0)} ms, environment ${(performance.now() - t1).toFixed(0)} ms`);
  const focus = new THREE.Vector3();
  return {
    id: R.id,
    group: R.group,
    environment: env.texture,
    environmentIntensity: R.envIntensity,
    background: null,
    lights: R.lights,
    keyLight: R.key,
    exposure: R.exposure,
    bloom: R.bloom,
    bloomThreshold: R.bloomThreshold,
    grade: R.grade,
    view: R.view,
    floor: { ...R.floor },
    // camera is optional; the playroom's dust motes use it to size their
    // points to the drawing buffer
    update(dt, time, camera) {
      R.uniforms.uTime.value = time;
      for (const a of R.animators) a(dt, time, camera);
    },
    // center + radius: a sphere holding every block that should cast a
    // shadow, e.g. the tower's mid-height and half its height plus the
    // spread of loose blocks around it.
    setShadowFocus(center, radius) {
      focus.copy(center);
      R.setShadowFocus(focus, radius);
    },
    // Frees everything the room made: the baked textures and reflection map
    // (in the bin), and every geometry, material, instanced mesh and light
    // shadow map in its scene graph, binned or not.
    dispose() {
      R.group.removeFromParent();
      const owned = new Set(R.bin.list);
      const own = (o) => {
        if (o.geometry) owned.add(o.geometry);
        for (const m of [].concat(o.material ?? [])) owned.add(m);
        if (o.isInstancedMesh) owned.add(o);
        if (o.shadow) owned.add(o.shadow);
      };
      R.group.traverse(own);
      R.lights.forEach(own);
      for (const x of owned) x.dispose?.();
      R.bin.list.length = 0;
    },
  };
}
