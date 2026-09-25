// Sunny Playroom: the room the first marble run stands in (reference picture
// 1). A long honey-oak table fills the lower half of the view; behind it a
// strip of oak floor with a grey wool rug, a deep charcoal wall with floating
// shelves, a basket of soft toys, a pothos trailing from a shelf and a bright
// garden window at the back left. Low sun comes in from the back left and
// rakes across the table.
//
// Everything is real scale in metres with the table top at y = 0 and the
// floor 60 cm below it. Surface textures are baked once on the GPU. The sun
// is a DirectionalLight whose shadow map is fitted tightly round the run; the
// window's light pattern on the room is worked out analytically per pixel
// (sunCookie below: the ray to the sun must pass the window opening, its
// deep reveal and its glazing bars), so the patches of sun on the table,
// floor and walls stay crisp and correct far outside the small shadow map.
// The window wall and frame also cast into that shadow map, so the run
// itself is shaded by the same bars. The room is captured into a PMREM
// environment so glass marbles and brass bells reflect it.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { REDUCED_MOTION } from '../config.js';

// ------------------------------------------------------------ layout

const FLOOR = -0.6; // floor height (the table top is y = 0)
const ROOM = { x0: -2.5, x1: 2.9, z0: -3.0, z1: 2.6, h: 2.8 };
const CEIL = FLOOR + ROOM.h;
const TABLE = { x0: -1.25, x1: 1.15, z0: -0.45, z1: 0.65, t: 0.04 };
const WALL_T = 0.3; // outer walls are thick, so the windows have deep reveals
// Sun window in the left wall (world z; heights above the floor). The big
// centre pane is sized so every sun ray reaching the run area passes through
// it: the bars' shadows fall on the table beside the run, not across it.
const WIN_L = { z0: -2.45, z1: -0.25, y0: 1.0, y1: 2.7, bars: [-2.05, -0.6], transoms: [1.3] };
// Garden window at the back left, set in a cream pier that stands proud of
// the charcoal wall (world x; heights above the floor).
const WIN_B = { x0: -2.28, x1: -1.18, y0: 0.45, y1: 2.35, bars: [-1.73], transoms: [1.95] };
const PIER_X = -0.95;
const PIER_Z = ROOM.z0 + 0.12;
const FRAME_W = 0.055;
const BAR_W = 0.05;
// Low late-afternoon sun from the back left: long shadows to the front right.
const SUN_ELEV = THREE.MathUtils.degToRad(22);
const SUN_HORIZ = new THREE.Vector2(-0.871, -0.491).normalize();
const TO_SUN = new THREE.Vector3(SUN_HORIZ.x * Math.cos(SUN_ELEV), Math.sin(SUN_ELEV), SUN_HORIZ.y * Math.cos(SUN_ELEV));
// The volume the run may occupy (plus margin): the sun's shadow map covers it.
const CASTERS = new THREE.Box3(new THREE.Vector3(-0.78, 0, -0.38), new THREE.Vector3(0.58, 0.56, 0.48));
const BOWL = { x: -0.66, z: 0.32, inner: 0.066, rim: 0.045, floorY: 0.012 };

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

// A rounded box with flat faces and quarter-round edges (from Block Tower).
function roundedBox(w, h, d, r, seg = 2) {
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

// A wall panel in its own plane (x along the wall, y up, facing +z) with
// rectangular openings. UVs in metres / tile.
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

// Joins geometries (already placed) into one, so a many-part prop costs one
// draw call. Missing colours default to white.
function merge(geos) {
  let nv = 0;
  let ni = 0;
  const list = geos.map((g) => {
    const idx = g.index ? g.index.array : Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i);
    nv += g.attributes.position.count;
    ni += idx.length;
    return { g, idx };
  });
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const colr = new Float32Array(nv * 3).fill(1);
  const index = new Uint32Array(ni);
  let v = 0;
  let i = 0;
  for (const { g, idx } of list) {
    const a = g.attributes;
    pos.set(a.position.array, v * 3);
    if (a.normal) nor.set(a.normal.array, v * 3);
    if (a.uv) uv.set(a.uv.array, v * 2);
    if (a.color) colr.set(a.color.array, v * 3);
    for (let k = 0; k < idx.length; k++) index[i + k] = idx[k] + v;
    v += a.position.count;
    i += idx.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

// Places a geometry (scale, then rotation, then position) and paints it.
function put(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], c = null } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  geo.applyMatrix4(m);
  if (c) {
    const cc = col(c);
    const n = geo.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cc.toArray(a, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return geo;
}

// ------------------------------------------------------------ GPU texture bakes

const NOISE = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
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
`;

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function bake(K, { width, height = width, fragment, uniforms = {}, srgb = false, mipmaps = true, repeat = true, defines = {} }) {
  const { renderer } = K;
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
  K.keep(rt);
  return rt.texture;
}

// Planked oak (after Block Tower's floor). Boards of varied width run along
// v; the grain is a flat-sawn log cut by a plane drifting in depth along the
// board, which draws cathedral arches. uJoints 0 gives full-length glued
// table planks with hairline seams. The normal pass stores roughness in alpha.
const WOOD_FRAG = /* glsl */ `
uniform vec2 uTile;
uniform int uCols;
uniform float uSeed;
uniform vec3 uEarly;
uniform vec3 uLate;
uniform float uRings;
uniform float uGap;
uniform float uWear;
uniform float uJoints;
uniform float uVar;
uniform float uRough;
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
  float j0 = uJoints > 0.5 ? hash11(idx * 1.93 + uSeed + 5.1) * L : 0.0;
  bool two = uJoints > 0.5 && hash11(idx * 4.1 + uSeed + 2.3) > 0.3;
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
  k.edge = uJoints > 0.5 ? min(min(k.u, w - k.u), min(k.v, k.len - k.v)) : min(k.u, w - k.u);
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
  h += (hk(k, 11.0) - 0.5) * 0.0007 * (k.u / k.w) * uJoints;
  h += (hk(k, 12.0) - 0.5) * 0.001 * (k.v / k.len) * uJoints;
  float cu = k.u / k.w - 0.5;
  h += 0.00016 * cu * cu * 4.0 * uJoints;
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
  float rough = uRough + 0.1 * (figure - 0.5) + 0.14 * wear + 0.22 * sc + 0.35 * (1.0 - smoothstep(uGap, uGap + 0.002, k.edge));
  gl_FragColor = vec4(n * 0.5 + 0.5, clamp(rough, 0.05, 1.0));
#else
  vec3 c = mix(uEarly, uLate, late * 0.6);
  c *= 0.88 + 0.24 * figure;
  float tone = hk(k, 8.0);
  c *= mix(1.0 - 0.26 * uVar, 1.0 + 0.18 * uVar, tone * tone * (3.0 - 2.0 * tone));
  c = mix(c, c * vec3(1.1, 0.94, 0.8), hk(k, 9.0) * 0.9 * uVar);
  float pores = vnoise(vec2(k.u / uTexel.x * 0.45, k.v * 22.0) + hk(k, 10.0) * 71.0, vec2(1e4));
  c *= 1.0 - 0.16 * smoothstep(0.6, 0.95, pores) * (0.5 + late);
  c *= mix(0.62, 1.0, smoothstep(uGap, uGap + 0.0025, k.edge));
  c = mix(c * 0.16, c, smoothstep(uGap * 0.4, uGap, k.edge));
  c = mix(c, c * vec3(1.1, 1.07, 1.02), wear * 0.6);
  c = mix(c, c * 1.3 + 0.015, sc * 0.35);
  gl_FragColor = vec4(c, 1.0);
#endif
}`;

// Close-up detail for the table: fine pore streaks along the grain. rg: a
// normal offset, b: albedo factor, a: roughness factor.
const DETAIL_FRAG = /* glsl */ `
varying vec2 vUv;
float dh(vec2 uv) {
  float s = vnoise(vec2(uv.x * 420.0, uv.y * 18.0), vec2(420.0, 18.0));
  float fine = vnoise(vec2(uv.x * 900.0, uv.y * 40.0), vec2(900.0, 40.0));
  return -smoothstep(0.62, 0.92, s) * 0.7 + fine * 0.2;
}
void main() {
  vec2 e = 1.0 / uRes;
  float h = dh(vUv);
  float dx = dh(vUv + vec2(e.x, 0.0)) - dh(vUv - vec2(e.x, 0.0));
  float dy = dh(vUv + vec2(0.0, e.y)) - dh(vUv - vec2(0.0, e.y));
  gl_FragColor = vec4(0.5 - dx * 0.35, 0.5 - dy * 0.35, 1.0 + h * 0.12, 1.0 - h * 0.25);
}`;

// Painted plaster: a gentle mottle and a fine roller stipple.
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

// Wool pile: tufts on a jittered grid. Normal in rgb; alpha is how much
// light reaches into the pile.
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
  gl_FragColor = vec4(n * 0.5 + 0.5, 0.62 + 0.38 * smoothstep(0.05, 0.85, h));
}`;

// Basket weave: horizontal weavers passing over and under upright stakes.
const WEAVE_FRAG = /* glsl */ `
uniform vec2 uCells;
varying vec2 vUv;
float wh(vec2 uv) {
  vec2 g = uv * uCells;
  vec2 c = floor(g);
  vec2 f = fract(g);
  float over = mod(c.x + c.y, 2.0);
  float across = sqrt(max(0.0, 1.0 - pow((f.y - 0.5) * 2.05, 2.0)));
  float along = over > 0.5 ? 0.75 + 0.25 * sin(f.x * 3.1416) : 0.75 - 0.25 * sin(f.x * 3.1416);
  float strands = 0.9 + 0.1 * sin(f.y * 40.0 + hash12(c) * 6.0);
  return across * along * strands;
}
void main() {
  vec2 e = 1.0 / uRes;
  float h = wh(vUv);
  float dx = wh(vUv + vec2(e.x, 0.0)) - wh(vUv - vec2(e.x, 0.0));
  float dy = wh(vUv + vec2(0.0, e.y)) - wh(vUv - vec2(0.0, e.y));
#ifdef NORMAL_PASS
  gl_FragColor = vec4(normalize(vec3(-dx * 3.0, -dy * 3.0, 1.0)) * 0.5 + 0.5, 1.0);
#else
  vec2 c = floor(vUv * uCells);
  float tone = 0.8 + 0.35 * hash12(vec2(c.y, 3.0)) + 0.1 * vnoise(vUv * uCells * vec2(4.0, 1.0), uCells * vec2(4.0, 1.0));
  gl_FragColor = vec4(vec3(tone) * mix(0.35, 1.0, smoothstep(0.0, 0.7, h)), 1.0);
#endif
}`;

// Leaves: x across the blade, y from stalk to tip. A midrib, curving side
// veins and, for the pothos, golden marbling along them.
const LEAF_FRAG = /* glsl */ `
uniform float uVariegate;
varying vec2 vUv;
void main() {
  float x = vUv.x - 0.5;
  float y = vUv.y;
  float rib = 1.0 - smoothstep(0.004, 0.014, abs(x));
  float vv = y - abs(x) * 1.2;
  float veins = smoothstep(0.82, 0.97, 0.5 + 0.5 * sin(vv * 38.0)) * smoothstep(0.02, 0.08, abs(x));
  vec3 c = vec3(0.055, 0.15, 0.025) * (0.85 + 0.3 * vnoise(vUv * vec2(9.0, 14.0), vec2(1e4)));
  float marb = smoothstep(0.55, 0.85, fbm(vec2(vv * 7.0, abs(x) * 16.0) + 3.0, vec2(1e4))) * uVariegate;
  c = mix(c, vec3(0.42, 0.44, 0.12), marb * 0.8);
  c = mix(c, c * 1.6 + vec3(0.03, 0.05, 0.0), rib * 0.8 + veins * 0.25);
  gl_FragColor = vec4(c, 1.0);
}`;

// The garden through the windows: hazy bright sky, sunlit trees and lawn,
// overexposed like a camera exposing for the room, with a few leaf-gap
// glints that the lens turns into soft bokeh.
const VIEW_FRAG = /* glsl */ `
uniform float uGain;
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 p = vUv;
  float t = uTime * 0.03;
  vec3 c = mix(vec3(1.25, 1.2, 1.05), vec3(0.62, 0.8, 1.15), smoothstep(0.45, 1.0, p.y));
  float canopy = 0.5 + 0.2 * fbm(vec2(p.x * 2.2 + uSeed, 0.3), vec2(1e4)) + 0.05 * vnoise(vec2(p.x * 13.0 + uSeed, 1.0), vec2(1e4));
  float trees = 1.0 - smoothstep(canopy - 0.012, canopy + 0.012, p.y);
  float leaf = fbm(p * vec2(26.0, 18.0) + vec2(t, 0.0) + uSeed, vec2(1e4));
  float lit = smoothstep(0.42, 0.78, leaf) * (0.4 + 0.6 * smoothstep(0.1, canopy, p.y));
  vec3 g = mix(vec3(0.05, 0.1, 0.02), vec3(0.55, 0.78, 0.18) * 1.6, lit);
  c = mix(c, g, trees);
  // bright gaps in the foliage
  vec2 q = p * vec2(40.0, 30.0) + uSeed;
  vec2 cell = floor(q);
  float gap = step(0.9, hash12(cell)) * (1.0 - smoothstep(0.05, 0.25, length(fract(q) - 0.5 - (hash22(cell) - 0.5) * 0.5)));
  c += vec3(2.2, 2.1, 1.7) * gap * trees * smoothstep(0.25, 0.6, p.y);
  // a near branch hanging into the top of the view
  float br = smoothstep(0.78, 0.9, p.y + 0.12 * fbm(vec2(p.x * 3.0 + uSeed * 2.0, 5.0), vec2(1e4))) * step(0.45, fbm(p * vec2(14.0, 9.0) + uSeed + t * 0.5, vec2(1e4)));
  c = mix(c, vec3(0.12, 0.2, 0.05) * (0.6 + 1.2 * leaf), br * 0.9);
  // lawn and a low hedge
  c = mix(c, vec3(0.35, 0.55, 0.12) * (0.9 + 0.3 * vnoise(p * vec2(60.0, 8.0), vec2(1e4))), 1.0 - smoothstep(0.1, 0.13, p.y));
  gl_FragColor = vec4(c * uGain, 1.0);
}`;

// Soft sun dapple from the garden trees outside, tileable.
const DAPPLE_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float f = fbm(vUv * 3.0, vec2(3.0));
  gl_FragColor = vec4(vec3(smoothstep(0.3, 0.72, f)), 1.0);
}`;

// ------------------------------------------------------------ shader hooks

// Shared by every room material: the sun cookie (how much of the sun's disc
// a point sees through the windows) and soft analytic occlusion for room
// corners and furniture footprints, which screen-space AO cannot reach.
const SET_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunSoft;
uniform vec4 uWinL;
uniform vec3 uWinLX;
uniform vec4 uWinLBars;
uniform vec4 uWinLTrans;
uniform vec4 uWinB;
uniform vec3 uWinBZ;
uniform vec4 uWinBBars;
uniform vec4 uWinBTrans;
uniform vec2 uWinFrame;
uniform vec4 uTableRect;
uniform sampler2D uDapple;
uniform float uDappleK;
uniform float uFloorY;
uniform vec4 uOcc[6];
uniform vec4 uOccH[6];
uniform vec4 uWalls;
uniform float uCeil;
uniform float uCornerAO;
float stBand(float x, float lo, float hi, float s) {
  return smoothstep(lo - s, lo + s, x) * (1.0 - smoothstep(hi - s, hi + s, x));
}
float stBars(float x, vec4 bars, float hw, float s) {
  float m = 1.0;
  for (int i = 0; i < 4; i++) m *= 1.0 - stBand(x, bars[i] - hw, bars[i] + hw, s);
  return m;
}
// The opening is tested at the wall's inner face, at the frame (where the
// glazing bars are) and at the outer face, so a raking beam is clipped by
// the deep reveal. Penumbrae widen with the distance to each plane, as the
// sun's disc does. u: position along the wall, planes: inner, frame, outer.
float stOpening(vec3 p, vec3 L, bool leftWall) {
  vec3 planes = leftWall ? uWinLX : uWinBZ;
  vec4 win = leftWall ? uWinL : uWinB;
  float pc = leftWall ? p.x : p.z;
  float lc = leftWall ? L.x : L.z;
  float m = 1.0;
  for (int i = 0; i < 3; i++) {
    float t = (planes[i] - pc) / lc;
    if (t <= 0.0) continue;
    vec3 h = p + L * t;
    float u = leftWall ? h.z : h.x;
    float s = uSunSoft.x + uSunSoft.y * t;
    float inset = i == 1 ? uWinFrame.x : 0.0;
    m *= stBand(u, win.x + inset, win.y - inset, s) * stBand(h.y, win.z + inset, win.w - inset, s);
    if (i == 1) {
      m *= stBars(u, leftWall ? uWinLBars : uWinBBars, uWinFrame.y, s) * stBars(h.y, leftWall ? uWinLTrans : uWinBTrans, uWinFrame.y, s);
    }
    if (i == 2) m *= 1.0 - uDappleK * (1.0 - texture2D(uDapple, vec2(u, h.y) * 0.45).r);
  }
  return m;
}
float sunCookie(vec3 p) {
  vec3 L = uSunDir;
  float tl = (uWinLX.z - p.x) / L.x;
  float tb = (uWinBZ.z - p.z) / L.z;
  float m = stOpening(p, L, tl < tb);
  // the table top shades whatever is below it
  if (p.y < -0.002) {
    float tt = -p.y / L.y;
    vec2 h = p.xz + L.xz * tt;
    float s = 0.004 + uSunSoft.y * tt;
    m *= 1.0 - stBand(h.x, uTableRect.x, uTableRect.y, s) * stBand(h.y, uTableRect.z, uTableRect.w, s);
  }
  return m * uSunSoft.z;
}
float roomBoxDist(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float roomOcclusion(vec3 p) {
  float occ = 1.0;
  float y = p.y - uFloorY;
  for (int i = 0; i < 6; i++) {
    if (uOcc[i].z <= 0.0) continue;
    float d = max(roomBoxDist(p.xz, uOcc[i].xy, uOcc[i].zw), 0.0);
    float hgt = uOccH[i].x;
    float reach = 0.3 * hgt + 0.03;
    float below = 1.0 - smoothstep(hgt * 0.6, hgt * 1.15, y);
    occ *= 1.0 - uOccH[i].y * exp(-d / reach) * below;
  }
  float dw = min(min(p.x - uWalls.x, uWalls.y - p.x), min(p.z - uWalls.z, uWalls.w - p.z));
  float corner = exp(-max(dw, 0.0) / 0.2) * exp(-max(y, 0.0) / 0.25);
  float top = exp(-max(dw, 0.0) / 0.25) * exp(-max(uCeil - p.y, 0.0) / 0.25);
  occ *= 1.0 - uCornerAO * min(1.0, corner + top * 0.6);
  return clamp(occ, 0.0, 1.0);
}
`;

// A replacement for three's PCF lookup, used by the room's own materials.
// Blockers more than SH_FAR towards the sun are the window wall and its bars:
// those are drawn by sunCookie() with their true soft penumbrae, so they are
// ignored here (they are in the shadow map only so the run is shaded by
// them too). Near blockers (the run) get contact-hardening shadows: a blocker
// search at a few depth offsets estimates how far above the surface the
// blocker is, and the filter widens with it, so a block's shadow is crisp at
// its foot and soft at the top of a tower's long raking shadow. The
// receiver-plane slope keeps the wide filter from shadowing the table itself.
const SHADOW_FN = /* glsl */ `
uniform vec2 uShUv;
uniform vec4 uShD;
uniform vec2 uShPen;
float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
  shadowCoord.xyz /= shadowCoord.w;
  shadowCoord.z += shadowBias;
  if ( shadowCoord.x < 0.0 || shadowCoord.x > 1.0 || shadowCoord.y < 0.0 || shadowCoord.y > 1.0 || shadowCoord.z > 1.0 ) return 1.0;
  vec3 ddx = dFdx( shadowCoord.xyz );
  vec3 ddy = dFdy( shadowCoord.xyz );
  float det = ddx.x * ddy.y - ddx.y * ddy.x;
  vec2 slope = abs( det ) > 1e-14 ? vec2( ddy.y * ddx.z - ddx.y * ddy.z, ddx.x * ddy.z - ddy.x * ddx.z ) / det : vec2( 0.0 );
  slope = clamp( slope, vec2( -20.0 ), vec2( 20.0 ) );
  float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
  float farZ = uShD.w;
#ifdef SH_SOFT
  vec2 search = uShUv * ( uShPen.x * 0.35 + uShPen.y );
  float occ0 = 0.0;
  float o1 = 0.0;
  float o2 = 0.0;
  float o3 = 0.0;
  for ( int i = 0; i < SH_SEARCH; i ++ ) {
    vec2 o = vogelDiskSample( i, SH_SEARCH, phi ) * search;
    vec2 uv = shadowCoord.xy + o;
    float z = shadowCoord.z + dot( slope, o );
    float lf = texture( shadowMap, vec3( uv, z - farZ ) );
    occ0 += lf - texture( shadowMap, vec3( uv, z ) );
    o1 += lf - texture( shadowMap, vec3( uv, z - uShD.x ) );
    o2 += lf - texture( shadowMap, vec3( uv, z - uShD.y ) );
    o3 += lf - texture( shadowMap, vec3( uv, z - uShD.z ) );
  }
  if ( occ0 < 1e-3 ) return 1.0;
  float p1 = clamp( o1 / occ0, 0.0, 1.0 );
  float p2 = clamp( o2 / occ0, 0.0, 1.0 );
  float p3 = clamp( o3 / occ0, 0.0, 1.0 );
  // mean blocker distance (m) from how many blockers lie beyond each offset
  float dBlock = 0.012 * ( 1.0 - p1 ) + 0.05 * ( p1 - p2 ) + 0.2 * ( p2 - p3 ) + 0.75 * p3;
  vec2 r = max( 0.5 * ( dBlock * uShPen.x + uShPen.y ) * uShUv, vec2( 0.7 / shadowMapSize.x ) );
  float s = 0.0;
  for ( int i = 0; i < SH_FILTER; i ++ ) {
    vec2 o = vogelDiskSample( i, SH_FILTER, phi + 1.7 ) * r;
    vec2 uv = shadowCoord.xy + o;
    float z = shadowCoord.z + dot( slope, o );
    s += 1.0 - texture( shadowMap, vec3( uv, z - farZ ) ) + texture( shadowMap, vec3( uv, z ) );
  }
  return mix( 1.0, s / float( SH_FILTER ), shadowIntensity );
#else
  vec2 r = uShUv * ( uShPen.y + 0.001 );
  float s = 0.0;
  for ( int i = 0; i < 5; i ++ ) {
    vec2 o = vogelDiskSample( i, 5, phi ) * r;
    vec2 uv = shadowCoord.xy + o;
    float z = shadowCoord.z + dot( slope, o );
    s += 1.0 - texture( shadowMap, vec3( uv, z - farZ ) ) + texture( shadowMap, vec3( uv, z ) );
  }
  return mix( 1.0, s * 0.2, shadowIntensity );
#endif
}
`;

function shadowChunk(quality) {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const start = chunk.indexOf('float getShadow( sampler2DShadow shadowMap');
  const end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )', start);
  if (start < 0 || end < 0) return null;
  let defs = '';
  if (quality.softShadows) defs = quality.tier === 'high' ? '#define SH_SOFT\n#define SH_SEARCH 6\n#define SH_FILTER 14\n' : '#define SH_SOFT\n#define SH_SEARCH 5\n#define SH_FILTER 9\n';
  return defs + chunk.slice(0, start) + SHADOW_FN + '\n\t' + chunk.slice(end);
}

const LIGHTS_BEGIN = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= setSunVis;',
);

// Adds the room hooks to a standard/physical material. Options:
//   rough: roughness in normalMap.a    fiber: normalMap.a darkens (pile)
//   occl: corner/furniture AO          detail: the table's close-up pores
//   leaf: back-lit translucency and a gentle sway   wood: turned-bowl grain
function hook(K, mat, opt = {}) {
  const key = ['r', 'f', 'o', 'd', 'l', 'w'].filter((k, i) => opt[['rough', 'fiber', 'occl', 'detail', 'leaf', 'wood'][i]]).join('');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, K.uniforms);
    let vs = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSetPos;\nvarying vec3 vObjPos;\nuniform float uTime;');
    vs = vs.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
{
  vec4 rp = vec4( transformed, 1.0 );
  vObjPos = transformed;
  #ifdef USE_INSTANCING
  rp = instanceMatrix * rp;
  #endif
  vSetPos = ( modelMatrix * rp ).xyz;
}`,
    );
    if (opt.leaf) {
      // a slow sway about the stalk, stronger towards the tip
      vs = vs.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
  float ph = dot( instanceMatrix[ 3 ].xyz, vec3( 13.1, 7.7, 5.3 ) );
  #else
  float ph = 0.0;
  #endif
  float k = transformed.y * transformed.y * 6.0;
  transformed.x += sin( uTime * 0.9 + ph ) * 0.012 * k;
  transformed.z += sin( uTime * 1.3 + ph * 1.7 ) * 0.02 * k;
}`,
      );
    }
    shader.vertexShader = vs;
    let fs = shader.fragmentShader;
    fs = fs.replace('#include <common>', `#include <common>\nvarying vec3 vSetPos;\nvarying vec3 vObjPos;\n${SET_PARS}\n${opt.wood ? NOISE : ''}`);
    if (K.shadowChunk) fs = fs.replace('#include <shadowmap_pars_fragment>', K.shadowChunk);
    fs = fs.replace('#include <lights_fragment_begin>', 'float setSunVis = sunCookie( vSetPos );\n' + LIGHTS_BEGIN);
    if (opt.rough) {
      fs = fs.replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = roughness;\n#ifdef USE_NORMALMAP\n\troughnessFactor *= texture2D( normalMap, vNormalMapUv ).a;\n#endif',
      );
    }
    if (opt.detail) {
      fs = fs.replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform vec2 uDetailRep;');
      fs = fs.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nvec4 setDetail = texture2D( uDetail, vSetPos.zx * uDetailRep );\ndiffuseColor.rgb *= setDetail.b;',
      );
      fs = fs.replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale;\n\tmapN.xy += ( setDetail.rg - 0.5 ) * 0.6;'),
      );
      fs = fs.replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = roughness * texture2D( normalMap, vNormalMapUv ).a * setDetail.a;',
      );
    }
    if (opt.fiber) {
      fs = fs.replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n#ifdef USE_NORMALMAP\n\tdiffuseColor.rgb *= texture2D( normalMap, vNormalMapUv ).a;\n#endif',
      );
    }
    if (opt.wood) {
      // a turned bowl: the blank's growth rings are cylinders round a pith
      // below and behind the bowl, so the inside shows ring arcs and the
      // outside flowing stripes
      fs = fs.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 q = vObjPos / uWoodScale;
  vec2 rc = vec2( q.y + 0.09, q.z - 0.02 );
  float r = length( rc ) + ( vnoise( q.xz * 60.0, vec2( 1e4 ) ) - 0.5 ) * 0.003 + ( vnoise( vec2( q.x * 8.0, q.y * 30.0 ), vec2( 1e4 ) ) - 0.5 ) * 0.002;
  float f = fract( r * 180.0 );
  float late = smoothstep( 0.45, 0.8, f ) * ( 1.0 - smoothstep( 0.85, 1.0, f ) );
  float fig = vnoise( vec2( q.x * 40.0, r * 90.0 ), vec2( 1e4 ) );
  diffuseColor.rgb *= mix( vec3( 1.0 ), uWoodLate, late * 0.75 ) * ( 0.88 + 0.24 * fig );
}`,
      );
      fs = fs.replace('#include <common>', '#include <common>\nuniform vec3 uWoodLate;\nuniform float uWoodScale;');
    }
    if (opt.occl) {
      fs = fs.replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
{
  float occ = roomOcclusion( vSetPos );
  reflectedLight.indirectDiffuse *= occ;
  reflectedLight.indirectSpecular *= occ;
  reflectedLight.directDiffuse *= mix( 1.0, occ, 0.3 );
}`,
      );
    }
    if (opt.leaf) {
      // sunlight through the blade: seen from the shaded side a leaf glows
      fs = fs.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
{
  float back = max( 0.0, -dot( normal, directionalLights[ 0 ].direction ) );
  reflectedLight.directDiffuse += diffuseColor.rgb * vec3( 1.1, 1.25, 0.55 ) * directionalLights[ 0 ].color * setSunVis * back * 0.45;
}
#endif`,
      );
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `mr-sunny-${key}`;
  return mat;
}

// ------------------------------------------------------------ the kit

class Kit {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.tier = quality.tier || 'high';
    this.tex = Math.max(512, quality.texSize || 1024);
    this.bin = [];
    this.group = new THREE.Group();
    this.group.name = 'sunny-setting';
    this.animators = [];
    this.shadowChunk = shadowChunk(quality);
    this.occCount = 0;
    const v4 = (n) => Array.from({ length: n }, () => new THREE.Vector4());
    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: TO_SUN.clone() },
      // base softness (m), extra per metre from the window, glass transmission
      uSunSoft: { value: new THREE.Vector3(0.004, 0.012, 0.9) },
      uWinL: { value: new THREE.Vector4(WIN_L.z0, WIN_L.z1, FLOOR + WIN_L.y0, FLOOR + WIN_L.y1) },
      uWinLX: { value: new THREE.Vector3(ROOM.x0, ROOM.x0 - WALL_T / 2, ROOM.x0 - WALL_T) },
      uWinLBars: { value: new THREE.Vector4(...pad4(WIN_L.bars)) },
      uWinLTrans: { value: new THREE.Vector4(...pad4(WIN_L.transoms.map((y) => y + FLOOR))) },
      uWinB: { value: new THREE.Vector4(WIN_B.x0, WIN_B.x1, FLOOR + WIN_B.y0, FLOOR + WIN_B.y1) },
      uWinBZ: { value: new THREE.Vector3(PIER_Z, PIER_Z - WALL_T / 2, PIER_Z - WALL_T) },
      uWinBBars: { value: new THREE.Vector4(...pad4(WIN_B.bars)) },
      uWinBTrans: { value: new THREE.Vector4(...pad4(WIN_B.transoms.map((y) => y + FLOOR))) },
      uWinFrame: { value: new THREE.Vector2(FRAME_W, BAR_W / 2) },
      uTableRect: { value: new THREE.Vector4(TABLE.x0, TABLE.x1, TABLE.z0, TABLE.z1) },
      uDapple: { value: null },
      uDappleK: { value: 0.22 },
      uFloorY: { value: FLOOR },
      uOcc: { value: v4(6) },
      uOccH: { value: v4(6) },
      uWalls: { value: new THREE.Vector4(ROOM.x0, ROOM.x1, ROOM.z0, ROOM.z1) },
      uCeil: { value: CEIL },
      uCornerAO: { value: 0.4 },
      uShUv: { value: new THREE.Vector2(1, 1) },
      uShD: { value: new THREE.Vector4(0.001, 0.01, 0.05, 0.2) },
      uShPen: { value: new THREE.Vector2(0.02, 0.0008) },
    };
  }

  keep(x) {
    if (x && x.dispose) this.bin.push(x);
    return x;
  }

  mesh(geo, mat, { cast = false, receive = false, parent = this.group } = {}) {
    this.keep(geo);
    this.keep(mat);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  std(params, opt = {}) {
    return hook(this, new THREE.MeshStandardMaterial(params), opt);
  }

  phys(params, opt = {}) {
    return hook(this, new THREE.MeshPhysicalMaterial(params), opt);
  }

  occluder(x, z, hx, hz, height, strength = 0.45) {
    if (this.occCount >= 6) return;
    this.uniforms.uOcc.value[this.occCount].set(x, z, hx, hz);
    this.uniforms.uOccH.value[this.occCount].set(height, strength, 0, 0);
    this.occCount++;
  }

  woodTextures({ early, late, seed = 3, rings = 260, wear = 0.5, tileU, tileV, cols, joints = 1, gap = 0.0007, variation = 1, rough = 0.36, width, height }) {
    const u = {
      uTile: { value: new THREE.Vector2(tileU, tileV) },
      uCols: { value: cols },
      uSeed: { value: seed },
      uEarly: { value: col(early) },
      uLate: { value: col(late) },
      uRings: { value: rings },
      uGap: { value: gap },
      uWear: { value: wear },
      uJoints: { value: joints },
      uVar: { value: variation },
      uRough: { value: rough },
      uTexel: { value: new THREE.Vector2(tileU / width, tileV / height) },
    };
    const map = bake(this, { width, height, fragment: WOOD_FRAG, uniforms: u, srgb: true });
    const normalMap = bake(this, { width, height, fragment: WOOD_FRAG, uniforms: u, defines: { NORMAL_PASS: '' } });
    return { map, normalMap };
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
    if (!this._fiber) {
      this._fiber = bake(this, {
        width: this.tier === 'low' ? 256 : 512,
        fragment: FIBER_FRAG,
        uniforms: { uCells: { value: 22 }, uTileM: { value: 0.1 }, uDepth: { value: 0.0014 } },
      });
    }
    return this._fiber;
  }

  weaveTextures() {
    if (!this._weave) {
      const u = { uCells: { value: new THREE.Vector2(24, 18) } };
      const size = this.tier === 'low' ? 256 : 512;
      this._weave = {
        map: bake(this, { width: size, fragment: WEAVE_FRAG, uniforms: u, srgb: true }),
        normalMap: bake(this, { width: size, fragment: WEAVE_FRAG, uniforms: u, defines: { NORMAL_PASS: '' } }),
      };
    }
    return this._weave;
  }

  wallMaterial(colour) {
    const w = this.wallTextures();
    return this.std({ color: col(colour), map: w.map, normalMap: w.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 }, { rough: true, occl: true });
  }

  // a wall panel from `from`, running along `along`, facing `inward`
  wall(mat, { from, along, width, height, holes = [], cast = false }) {
    const w = this.wallTextures();
    const m = this.mesh(wallGeo(width, height, holes, w.tile), mat, { cast, receive: false });
    const inward = new THREE.Vector3(0, 1, 0).cross(along).negate();
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, new THREE.Vector3(0, 1, 0), inward));
    m.position.copy(from);
    return m;
  }
}

function pad4(a) {
  return [...a, 99, 99, 99, 99].slice(0, 4);
}

// ------------------------------------------------------------ the room

function buildRoom(K) {
  const { x0: X0, x1: X1, z0: Z0, z1: Z1, h: H } = ROOM;
  const cream = K.wallMaterial('#eee4d4');
  const charcoal = K.wallMaterial('#343636');
  const white = K.std({ color: col('#f1ede6'), roughness: 0.45 }, { occl: true });
  const oakTrim = K.std({ color: col('#b98552'), roughness: 0.5 }, { occl: true });

  // Oak boards, a little deeper and more worn than the table.
  const fs = Math.min(2048, K.tex);
  const floorWood = K.woodTextures({ early: '#cf9e66', late: '#9d6a3b', seed: 7, rings: 280, wear: 0.6, tileU: 2, tileV: 2, cols: 16, width: fs, height: fs, rough: 0.42 });
  const floorMat = K.std({ map: floorWood.map, normalMap: floorWood.normalMap, roughness: 1 }, { rough: true, occl: true });
  const fg = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0);
  fg.rotateX(-Math.PI / 2);
  fg.translate((X0 + X1) / 2, FLOOR, (Z0 + Z1) / 2);
  const fp = fg.attributes.position;
  for (let i = 0; i < fp.count; i++) fg.attributes.uv.setXY(i, fp.getX(i) / 2, -fp.getZ(i) / 2);
  K.mesh(fg, floorMat, { receive: true });

  // Walls. The charcoal feature wall runs from the pier to the right; the
  // pier (cream, with the garden window) stands 12 cm proud of it.
  const hole = (a0, a1, y0, y1) => ({ x0: a0, x1: a1, y0, y1 });
  K.wall(charcoal, { from: new THREE.Vector3(PIER_X, FLOOR, Z0), along: new THREE.Vector3(1, 0, 0), width: X1 - PIER_X, height: H });
  K.wall(cream, { from: new THREE.Vector3(X0, FLOOR, PIER_Z), along: new THREE.Vector3(1, 0, 0), width: PIER_X - X0, height: H, holes: [hole(WIN_B.x0 - X0, WIN_B.x1 - X0, WIN_B.y0, WIN_B.y1)] });
  K.wall(cream, { from: new THREE.Vector3(PIER_X, FLOOR, PIER_Z), along: new THREE.Vector3(0, 0, -1), width: PIER_Z - Z0, height: H });
  // left wall, sun window; it casts into the sun's shadow map so the run is
  // shaded by the window's bars as the table is
  K.wall(cream, {
    from: new THREE.Vector3(X0, FLOOR, Z1),
    along: new THREE.Vector3(0, 0, -1),
    width: Z1 - PIER_Z,
    height: H,
    holes: [hole(Z1 - WIN_L.z1, Z1 - WIN_L.z0, WIN_L.y0, WIN_L.y1)],
    cast: true,
  });
  K.wall(cream, { from: new THREE.Vector3(X1, FLOOR, Z0), along: new THREE.Vector3(0, 0, 1), width: Z1 - Z0, height: H });
  K.wall(cream, { from: new THREE.Vector3(X1, FLOOR, Z1), along: new THREE.Vector3(-1, 0, 0), width: X1 - X0, height: H });
  const ceil = K.mesh(wallGeo(X1 - X0, Z1 - Z0, [], 0.8), K.wallMaterial('#f6f1e9'), { cast: true });
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(X0, CEIL, Z0);

  // oak skirting all round
  const skirt = [];
  const run = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const g = roundedBox(len, 0.085, 0.014, 0.003, 1);
    const ang = Math.atan2(-(bz - az), bx - ax);
    const nx = (bz - az) / len;
    const nz = -(bx - ax) / len;
    skirt.push(put(g, { p: [(ax + bx) / 2 - nx * 0.007, FLOOR + 0.0425, (az + bz) / 2 - nz * 0.007], r: [0, ang, 0] }));
  };
  run(X0, PIER_Z, PIER_X, PIER_Z);
  run(PIER_X, Z0, X1, Z0);
  run(X1, Z0, X1, Z1);
  run(X1, Z1, X0, Z1);
  run(X0, Z1, X0, PIER_Z);
  K.mesh(merge(skirt), oakTrim);

  // The windows: reveals, painted frame with glazing bars, a deep sill
  // board, and the garden beyond.
  const view = (seed, gain) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: NOISE + VIEW_FRAG,
      uniforms: { uGain: { value: gain }, uTime: K.uniforms.uTime, uSeed: { value: seed } },
    });
    return K.keep(m);
  };
  window_(K, {
    center: new THREE.Vector3(X0, FLOOR + (WIN_L.y0 + WIN_L.y1) / 2, (WIN_L.z0 + WIN_L.z1) / 2),
    along: new THREE.Vector3(0, 0, -1),
    width: WIN_L.z1 - WIN_L.z0,
    height: WIN_L.y1 - WIN_L.y0,
    bars: WIN_L.bars.map((z) => (WIN_L.z0 + WIN_L.z1) / 2 - z),
    transoms: WIN_L.transoms.map((y) => y - (WIN_L.y0 + WIN_L.y1) / 2),
    frameMat: white,
    revealMat: cream,
    view: view(3.1, 4.2),
    cast: true,
  });
  window_(K, {
    center: new THREE.Vector3((WIN_B.x0 + WIN_B.x1) / 2, FLOOR + (WIN_B.y0 + WIN_B.y1) / 2, PIER_Z),
    along: new THREE.Vector3(1, 0, 0),
    width: WIN_B.x1 - WIN_B.x0,
    height: WIN_B.y1 - WIN_B.y0,
    bars: WIN_B.bars.map((x) => x - (WIN_B.x0 + WIN_B.x1) / 2),
    transoms: WIN_B.transoms.map((y) => y - (WIN_B.y0 + WIN_B.y1) / 2),
    frameMat: white,
    revealMat: cream,
    view: view(7.3, 4.8),
    cast: false,
  });
  K.walls(X0, X1, Z0, Z1);
}

Kit.prototype.walls = function walls(xmin, xmax, zmin, zmax) {
  this.uniforms.uWalls.value.set(xmin, xmax, zmin, zmax);
};

// A window in a wall: reveals, painted frame with bars (one extruded shape,
// so one draw call), a deep sill board and the view outside.
function window_(K, { center, along, width, height, bars, transoms, frameMat, revealMat, view, cast }) {
  const up = new THREE.Vector3(0, 1, 0);
  const inward = up.clone().cross(along).negate();
  const g = new THREE.Group();
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, up, inward));
  g.position.copy(center);
  K.group.add(g);
  const hw = width / 2;
  const hh = height / 2;
  const d = WALL_T;
  const plane = (w, h, pos, rx, ry) => {
    const m = K.mesh(new THREE.PlaneGeometry(w, h), revealMat, { parent: g, cast });
    m.position.copy(pos);
    m.rotation.set(rx, ry, 0);
  };
  plane(d, height, new THREE.Vector3(-hw, 0, -d / 2), 0, Math.PI / 2);
  plane(d, height, new THREE.Vector3(hw, 0, -d / 2), 0, -Math.PI / 2);
  plane(width, d, new THREE.Vector3(0, hh, -d / 2), Math.PI / 2, 0);
  // frame: the opening with a hole per pane
  const s = new THREE.Shape();
  s.moveTo(-hw, -hh);
  s.lineTo(hw, -hh);
  s.lineTo(hw, hh);
  s.lineTo(-hw, hh);
  s.closePath();
  const us = [-hw + FRAME_W, ...bars.flatMap((b) => [b - BAR_W / 2, b + BAR_W / 2]).sort((a, b) => a - b), hw - FRAME_W];
  const vs = [-hh + FRAME_W, ...transoms.flatMap((b) => [b - BAR_W / 2, b + BAR_W / 2]).sort((a, b) => a - b), hh - FRAME_W];
  for (let i = 0; i < us.length; i += 2) {
    for (let j = 0; j < vs.length; j += 2) {
      const p = new THREE.Path();
      p.moveTo(us[i], vs[j]);
      p.lineTo(us[i], vs[j + 1]);
      p.lineTo(us[i + 1], vs[j + 1]);
      p.lineTo(us[i + 1], vs[j]);
      p.closePath();
      s.holes.push(p);
    }
  }
  const fg = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2 });
  fg.translate(0, 0, -d / 2 - 0.03);
  K.mesh(fg, frameMat, { parent: g, cast });
  // deep interior window board
  const sill = K.mesh(roundedBox(width + 0.1, 0.03, d / 2 + 0.05, 0.008, 1), frameMat, { parent: g, receive: true });
  sill.position.set(0, -hh - 0.015, -d / 4 + 0.025);
  const v = K.mesh(new THREE.PlaneGeometry(width + 6, height + 4), view, { parent: g });
  v.position.set(0, 0.6, -d - 3.2);
}

// ------------------------------------------------------------ the table

function buildTable(K) {
  const { x0, x1, z0, z1, t } = TABLE;
  const W = x1 - x0;
  const D = z1 - z0;
  // One bake for the whole top: planks along x, glued, no end joints. The
  // texture's u runs across the planks (world z), v along them (world x).
  const long = K.tier === 'low' ? 1024 : 2048;
  const wood = K.woodTextures({
    early: '#e4b17a',
    late: '#c08750',
    seed: 11,
    rings: 210,
    wear: 0.25,
    tileU: D,
    tileV: W,
    cols: 5,
    joints: 0,
    gap: 0.00025,
    variation: 0.55,
    rough: 0.46,
    width: long / 2,
    height: long,
  });
  const detail = bake(K, { width: K.tier === 'low' ? 256 : 512, fragment: DETAIL_FRAG });
  K.uniforms.uDetail = { value: detail };
  K.uniforms.uDetailRep = { value: new THREE.Vector2(1 / 0.12, 1 / 0.12) };
  const top = K.phys(
    {
      map: wood.map,
      normalMap: wood.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 1,
      clearcoat: K.tier === 'low' ? 0 : 0.12,
      clearcoatRoughness: 0.5,
      envMapIntensity: 1,
    },
    { detail: true, occl: false },
  );
  const g = roundedBox(W, t, D, 0.008, 2);
  // uv: u across the planks (z), v along them (x)
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getZ(i) + D / 2) / D, (pos.getX(i) + W / 2) / W);
  const m = K.mesh(g, top, { receive: true });
  m.position.set((x0 + x1) / 2, -t / 2, (z0 + z1) / 2);
  // legs and apron, plain oiled oak (seen only from low angles)
  const legMat = K.std({ color: col('#c58f58'), roughness: 0.5 }, { occl: true });
  const parts = [];
  for (const lx of [x0 + 0.07, x1 - 0.07]) {
    for (const lz of [z0 + 0.07, z1 - 0.07]) parts.push(put(roundedBox(0.06, -FLOOR - t, 0.06, 0.006, 1), { p: [lx, (FLOOR - t) / 2, lz] }));
  }
  parts.push(put(roundedBox(W - 0.14, 0.08, 0.022, 0.004, 1), { p: [(x0 + x1) / 2, -t - 0.04, z0 + 0.08] }));
  parts.push(put(roundedBox(W - 0.14, 0.08, 0.022, 0.004, 1), { p: [(x0 + x1) / 2, -t - 0.04, z1 - 0.08] }));
  parts.push(put(roundedBox(0.022, 0.08, D - 0.14, 0.004, 1), { p: [x0 + 0.08, -t - 0.04, (z0 + z1) / 2] }));
  parts.push(put(roundedBox(0.022, 0.08, D - 0.14, 0.004, 1), { p: [x1 - 0.08, -t - 0.04, (z0 + z1) / 2] }));
  K.mesh(merge(parts), legMat);
  K.occluder((x0 + x1) / 2, (z0 + z1) / 2, W / 2, D / 2, -FLOOR, 0.55);
}

// ------------------------------------------------------------ the bowl

// Turned bowl profile (radius, height) from the foot round the lip to the
// centre of the inside floor.
function bowlGeometry() {
  const pts = [
    [0.0, 0.0], [0.04, 0.0], [0.043, 0.0015], [0.0445, 0.005], [0.05, 0.009], [0.062, 0.016], [0.0705, 0.026],
    [0.0742, 0.036], [0.0741, 0.0415], [0.0728, 0.0445], [0.0702, 0.0453], [0.0676, 0.0447], [0.0661, 0.0428],
    [0.0645, 0.037], [0.059, 0.0285], [0.049, 0.0212], [0.035, 0.0158], [0.018, 0.0128], [0.0, 0.012],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 64);
}

function buildBowl(K) {
  const mat = K.phys(
    { color: col('#c98b52'), roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.35 },
    { wood: true },
  );
  const u = { uWoodLate: { value: col('#8a5530') }, uWoodScale: { value: 1 } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    prev(shader);
    Object.assign(shader.uniforms, u);
  };
  const m = K.mesh(bowlGeometry(), mat, { cast: true, receive: true });
  m.position.set(BOWL.x, 0, BOWL.z);
  m.rotation.y = 0.7;
  return m;
}

// ------------------------------------------------------------ plants

// A leaf blade as a curved grid: x across, y from the stalk to the tip.
function leafGeometry(len, wid, heart) {
  const cols = 4;
  const rows = 8;
  const g = new THREE.PlaneGeometry(1, 1, cols, rows);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i) - 0.5;
    const v = uv.getY(i);
    const w = heart ? Math.pow(Math.sin(Math.PI * Math.pow(v, 0.62)), 0.9) : Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.75);
    const x = u * wid * w;
    const y = v * len - (heart ? 0.1 * len : 0);
    // cupped across the blade, arched along it, the tip drooping
    const z = -Math.pow(u * 2, 2) * wid * 0.12 * w + Math.sin(Math.PI * v) * len * 0.06 - v * v * len * 0.08;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function buildPlants(K) {
  const rand = rng(17);
  const leafTex = (variegate) =>
    bake(K, { width: 256, fragment: LEAF_FRAG, uniforms: { uVariegate: { value: variegate } }, srgb: true });
  const potMat = K.phys({ color: col('#eeebe4'), roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2 }, { occl: true });
  const soil = K.std({ color: col('#2a1d14'), roughness: 1 });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  // pothos on a floating shelf on the charcoal wall, trailing down
  const shelfY = FLOOR + 0.86;
  const shelfX = -0.52;
  const shelfZ = ROOM.z0 + 0.1;
  const oak = K.std({ color: col('#b88450'), roughness: 0.5 }, { occl: true });
  const shelf = K.mesh(roundedBox(0.68, 0.032, 0.2, 0.004, 1), oak);
  shelf.position.set(shelfX, shelfY - 0.016, shelfZ);
  const potX = -0.45;
  const potP = [new THREE.Vector2(0, 0), new THREE.Vector2(0.05, 0), new THREE.Vector2(0.062, 0.1), new THREE.Vector2(0.066, 0.12), new THREE.Vector2(0.06, 0.12), new THREE.Vector2(0.057, 0.108), new THREE.Vector2(0, 0.108)];
  const pot = K.mesh(new THREE.LatheGeometry(potP, 32), potMat);
  pot.position.set(potX, shelfY, shelfZ + 0.01);
  const pothosN = 110;
  const pothosLeaf = K.keep(leafGeometry(0.075, 0.06, true));
  const pothosMat = K.std({ map: K.keep(leafTex(1)), roughness: 0.42, side: THREE.DoubleSide }, { leaf: true });
  const pothos = new THREE.InstancedMesh(pothosLeaf, pothosMat, pothosN);
  K.keep(pothos);
  const vines = [];
  let n = 0;
  const vineCount = 7;
  for (let k = 0; k < vineCount; k++) {
    const a = (k / vineCount) * Math.PI * 1.4 - Math.PI * 0.2 + rand() * 0.2;
    const start = new THREE.Vector3(potX + Math.cos(a) * 0.05, shelfY + 0.11, shelfZ + 0.01 + Math.abs(Math.sin(a)) * 0.05);
    const out = new THREE.Vector3(start.x + Math.cos(a) * 0.08, shelfY + 0.08, shelfZ + 0.13 + rand() * 0.05);
    const drop = 0.25 + rand() * 0.45;
    const pts = [start, out];
    for (let j = 1; j <= 4; j++) pts.push(new THREE.Vector3(out.x + Math.sin(j * 1.3 + k) * 0.04 + (rand() - 0.5) * 0.03, out.y - (drop * j) / 4, out.z + 0.02 + Math.sin(j + k) * 0.02));
    const curve = new THREE.CatmullRomCurve3(pts);
    vines.push(put(new THREE.TubeGeometry(curve, 24, 0.0022, 4, false), { c: '#4d6b2a' }));
    const per = Math.floor(8 + drop * 18);
    for (let j = 0; j < per && n < pothosN - 20; j++) {
      const tt = 0.12 + (j / per) * 0.88;
      curve.getPointAt(tt, v);
      const side = j % 2 ? 1 : -1;
      e.set(-0.4 + rand() * 0.5, side * (0.6 + rand() * 0.5), Math.PI + side * (0.4 + rand() * 0.4));
      q.setFromEuler(e);
      const sc = 0.6 + (1 - tt) * 0.6 + rand() * 0.2;
      pothos.setMatrixAt(n, m4.compose(v.clone().add(new THREE.Vector3(side * 0.008, 0, 0.012)), q, s.set(sc, sc, sc)));
      pothos.setColorAt(n, c.setRGB(0.85 + rand() * 0.3, 0.85 + rand() * 0.3, 0.8));
      n++;
    }
  }
  // a crown of leaves arching up and out of the pot
  while (n < pothosN) {
    const a = rand() * Math.PI * 2;
    v.set(potX + Math.cos(a) * 0.03, shelfY + 0.11, shelfZ + 0.01 + Math.sin(a) * 0.03);
    e.set(-0.5 - rand() * 0.6, a + Math.PI / 2, 0, 'YXZ');
    q.setFromEuler(e);
    const sc = 0.8 + rand() * 0.5;
    pothos.setMatrixAt(n, m4.compose(v, q, s.set(sc, sc, sc)));
    pothos.setColorAt(n, c.setRGB(0.9 + rand() * 0.2, 0.9 + rand() * 0.2, 0.8));
    n++;
  }
  K.group.add(pothos);
  K.mesh(merge(vines), K.std({ vertexColors: true, roughness: 0.6 }));

  // a big leafy plant in a tall pot on the floor behind the table's left end
  const px = -1.32;
  const pz = -0.98;
  const bigPot = [[0, 0], [0.12, 0], [0.14, 0.02], [0.155, 0.34], [0.162, 0.37], [0.15, 0.37], [0.145, 0.35], [0, 0.35]].map(([a, b]) => new THREE.Vector2(a, b));
  const pm = K.mesh(new THREE.LatheGeometry(bigPot, 40), K.std({ color: col('#dcd6cc'), roughness: 0.8 }, { occl: true }));
  pm.position.set(px, FLOOR, pz);
  const soilDisc = K.mesh(new THREE.CircleGeometry(0.145, 24), soil);
  soilDisc.rotation.x = -Math.PI / 2;
  soilDisc.position.set(px, FLOOR + 0.345, pz);
  K.occluder(px, pz, 0.16, 0.16, 0.37, 0.4);
  const bigN = 46;
  const bigLeaf = K.keep(leafGeometry(0.26, 0.11, false));
  const bigMat = K.std({ map: K.keep(leafTex(0)), roughness: 0.38, side: THREE.DoubleSide }, { leaf: true });
  const big = new THREE.InstancedMesh(bigLeaf, bigMat, bigN);
  K.keep(big);
  const stems = [];
  for (let i = 0; i < bigN; i++) {
    const t = i / bigN;
    const a = i * 2.39996 + rand() * 0.4;
    const reach = 0.03 + 0.1 * (1 - t) * rand();
    const h = 0.42 + 0.62 * Math.sqrt(t) + (rand() - 0.5) * 0.08;
    const base = new THREE.Vector3(px + Math.cos(a) * reach, FLOOR + h, pz + Math.sin(a) * reach);
    // a short stalk from the trunk to the blade
    const root = new THREE.Vector3(px + (i % 3 - 1) * 0.02, base.y - 0.05, pz + ((i >> 1) % 3 - 1) * 0.02);
    const dir = base.clone().sub(root);
    const sl = dir.length();
    const sg = new THREE.CylinderGeometry(0.003, 0.004, sl, 5);
    sg.translate(0, sl / 2, 0);
    sg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    stems.push(put(sg, { p: [root.x, root.y, root.z], c: '#4a6a2a' }));
    // leaves open upwards and outwards, facing the room a little
    e.set(-0.9 + t * 0.5 + (rand() - 0.5) * 0.4, -a + Math.PI / 2, (rand() - 0.5) * 0.5, 'YXZ');
    q.setFromEuler(e);
    const sc = 0.75 + rand() * 0.45;
    big.setMatrixAt(i, m4.compose(base, q, s.set(sc, sc, sc)));
    big.setColorAt(i, c.setRGB(0.8 + rand() * 0.35, 0.85 + rand() * 0.3, 0.75 + rand() * 0.2));
  }
  for (const [dx, dz, top] of [[-0.02, -0.02, 1.02], [0.02, 0.0, 0.9], [0.0, 0.02, 0.78]]) {
    const tg = new THREE.CylinderGeometry(0.006, 0.01, top - 0.34, 6);
    stems.push(put(tg, { p: [px + dx, FLOOR + 0.34 + (top - 0.34) / 2, pz + dz], r: [dz * 3, 0, -dx * 3], c: '#5a5a2e' }));
  }
  big.castShadow = true;
  K.group.add(big);
  K.mesh(merge(stems), K.std({ vertexColors: true, roughness: 0.6 }));
}

// ------------------------------------------------------------ soft furnishings

function softBall(r, sx, sy, sz, seed, amount = 0.04) {
  const g = new THREE.SphereGeometry(r, 24, 16);
  const pos = g.attributes.position;
  const rand = rng(seed);
  const k = [rand() * 6, rand() * 6, rand() * 6];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const b = 1 + amount * Math.sin((x / r) * 3 + k[0]) * Math.sin((y / r) * 2.5 + k[1]) * Math.sin((z / r) * 3 + k[2]);
    pos.setXYZ(i, x * b * sx, y * b * sy, z * b * sz);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
  return g;
}

function buildToys(K) {
  const X = 1.95;
  const Z = -2.3;
  const R = 0.23;
  const HB = 0.34;
  // woven basket: flared wall, thick rim
  const weave = K.weaveTextures();
  const basketMat = K.std({ color: col('#b4a184'), map: weave.map, normalMap: weave.normalMap, roughness: 0.85, side: THREE.DoubleSide }, { occl: true });
  const prof = [[0, 0.004], [R * 0.86, 0.004], [R * 0.9, 0.02], [R, HB]].map(([a, b]) => new THREE.Vector2(a, b));
  const bg = new THREE.LatheGeometry(prof, 48);
  const buv = bg.attributes.uv;
  for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 4, buv.getY(i) * 1.6);
  const basket = K.mesh(bg, basketMat);
  basket.position.set(X, FLOOR, Z);
  const rim = K.mesh(new THREE.TorusGeometry(R, 0.014, 10, 48), K.std({ color: col('#a48f70'), roughness: 0.8 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(X, FLOOR + HB, Z);
  K.occluder(X, Z, R, R, HB, 0.45);

  // the teddy: soft fuzzy caramel fur, cream muzzle and paws, button eyes
  const fiber = K.fiberTexture();
  const fur = (hex, sheen) =>
    K.phys({ color: col(hex), roughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: col(sheen), normalMap: fiber, normalScale: new THREE.Vector2(0.9, 0.9) }, { fiber: true });
  const bear = new THREE.Group();
  bear.position.set(X, FLOOR + 0.13, Z + 0.02);
  bear.rotation.y = -0.45;
  K.group.add(bear);
  const main = [];
  const light = [];
  const dark = [];
  main.push(put(softBall(0.1, 1, 1.15, 0.9, 1), { p: [0, 0.12, 0] }));
  main.push(put(softBall(0.085, 1.05, 0.95, 0.95, 2), { p: [0, 0.3, 0.01] }));
  for (const sx of [-1, 1]) {
    main.push(put(softBall(0.034, 1, 1, 0.6, 3), { p: [sx * 0.068, 0.37, -0.005] }));
    light.push(put(softBall(0.021, 1, 1, 0.45, 4), { p: [sx * 0.068, 0.37, 0.012] }));
    main.push(put(softBall(0.032, 0.9, 2.0, 0.9, 5), { p: [sx * 0.1, 0.17, 0.05], r: [0.5, 0, sx * 0.5] }));
    main.push(put(softBall(0.04, 0.95, 0.85, 1.6, 6), { p: [sx * 0.06, 0.05, 0.09] }));
    light.push(put(softBall(0.026, 1, 1, 0.4, 7), { p: [sx * 0.06, 0.05, 0.152] }));
    dark.push(put(new THREE.SphereGeometry(0.0095, 16, 12), { p: [sx * 0.031, 0.318, 0.075] }));
  }
  light.push(put(softBall(0.04, 1.05, 0.78, 0.8, 8), { p: [0, 0.278, 0.07] }));
  light.push(put(softBall(0.055, 1, 1.2, 0.35, 9), { p: [0, 0.13, 0.085] }));
  dark.push(put(new THREE.SphereGeometry(0.013, 16, 12), { p: [0, 0.292, 0.104], s: [1.3, 0.85, 0.8] }));
  K.mesh(merge(main), fur('#a8723f', '#f2d3aa'), { parent: bear });
  K.mesh(merge(light), fur('#e3c9a3', '#fff1dc'), { parent: bear });
  K.mesh(merge(dark), K.phys({ color: col('#1b1210'), roughness: 0.18, clearcoat: 1 }), { parent: bear });

  // a pink bunny peeking over the back, and a blue elephant's head in front
  const pink = [];
  pink.push(put(softBall(0.06, 1, 0.95, 0.95, 11), { p: [X - 0.12, FLOOR + 0.36, Z - 0.1] }));
  pink.push(put(softBall(0.02, 1, 3.2, 0.6, 12), { p: [X - 0.15, FLOOR + 0.46, Z - 0.1], r: [0, 0, 0.25] }));
  pink.push(put(softBall(0.02, 1, 3.0, 0.6, 13), { p: [X - 0.09, FLOOR + 0.47, Z - 0.11], r: [0.1, 0, -0.15] }));
  K.mesh(merge(pink), fur('#e5a3a0', '#ffe2df'));
  const blue = [];
  blue.push(put(softBall(0.055, 1.1, 0.9, 1, 14), { p: [X + 0.1, FLOOR + 0.33, Z + 0.12] }));
  blue.push(put(softBall(0.045, 0.3, 1.1, 1, 15), { p: [X + 0.05, FLOOR + 0.34, Z + 0.1] }));
  blue.push(put(softBall(0.045, 0.3, 1.1, 1, 16), { p: [X + 0.16, FLOOR + 0.34, Z + 0.1] }));
  K.mesh(merge(blue), fur('#5b78a8', '#dfe8ff'));

  // grey wool rug on the floor behind the table
  const rugMat = K.std({ color: col('#a7a39c'), normalMap: fiber, normalScale: new THREE.Vector2(1, 1), roughness: 1 }, { fiber: true, occl: true });
  const RW = 2.6;
  const RD = 1.3;
  const rg = roundedBox(RW, 0.012, RD, 0.005, 1);
  const rp = rg.attributes.position;
  for (let i = 0; i < rp.count; i++) rg.attributes.uv.setXY(i, rp.getX(i) / 0.1, rp.getZ(i) / 0.1);
  const rug = K.mesh(rg, rugMat, { receive: true });
  rug.position.set(0.15, FLOOR + 0.006, -2.15);

  // a chunky knitted mat on the table's front-left corner
  const mat = K.std({ color: col('#efe5d6'), map: weave.map, normalMap: weave.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 });
  const mg = roundedBox(0.44, 0.008, 0.3, 0.004, 1);
  const mp = mg.attributes.position;
  for (let i = 0; i < mp.count; i++) mg.attributes.uv.setXY(i, mp.getX(i) / 0.12, mp.getZ(i) / 0.09);
  const mesh = K.mesh(mg, mat, { receive: true });
  mesh.position.set(-1.0, 0.004, 0.47);
  mesh.rotation.y = 0.12;
}

// shelves on the charcoal wall: a turned bowl, a stack of books, a small
// woven basket with a plant
function buildShelves(K) {
  const y = FLOOR + 0.8;
  const z = ROOM.z0 + 0.12;
  const oak = K.std({ color: col('#b88450'), roughness: 0.5 }, { occl: true });
  const board = K.mesh(roundedBox(1.05, 0.035, 0.24, 0.004, 1), oak);
  board.position.set(2.08, y - 0.0175, z);
  const books = [];
  const bc = [['#e6dcc6', 0.24, 0.032, 0.17], ['#95a78b', 0.22, 0.026, 0.16], ['#c77b5a', 0.2, 0.034, 0.15]];
  let by = y;
  bc.forEach(([hex, w, h, d], i) => {
    books.push(put(roundedBox(w, h, d, 0.003, 1), { p: [1.86 + i * 0.01, by + h / 2, z + 0.01], r: [0, (i - 1) * 0.08, 0], c: hex }));
    by += h;
  });
  K.mesh(merge(books), K.std({ vertexColors: true, roughness: 0.6 }, { occl: true }));
  const bowlMat = K.phys({ color: col('#b0764a'), roughness: 0.45, clearcoat: 0.2 }, { wood: true });
  const u = { uWoodLate: { value: col('#7a4a2a') }, uWoodScale: { value: 2.2 } };
  const prev = bowlMat.onBeforeCompile;
  bowlMat.onBeforeCompile = (shader) => {
    prev(shader);
    Object.assign(shader.uniforms, u);
  };
  const b = K.mesh(bowlGeometry(), bowlMat);
  b.scale.set(1.7, 1.3, 1.7);
  b.position.set(2.1, y + 0.001, z + 0.01);
  const weave = K.weaveTextures();
  const bmat = K.std({ color: col('#c4ad8a'), map: weave.map, normalMap: weave.normalMap, roughness: 0.85 }, { occl: true });
  const bk = K.mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.17, 32, 1, true), bmat);
  bk.position.set(2.42, y + 0.085, z);
  const cap = K.mesh(new THREE.CircleGeometry(0.072, 24), K.std({ color: col('#2a1d14'), roughness: 1 }));
  cap.rotation.x = -Math.PI / 2;
  cap.position.set(2.42, y + 0.15, z);
}

// ------------------------------------------------------------ light

function buildSun(K) {
  const sun = new THREE.DirectionalLight(col('#ffdfb8'), 8.2);
  sun.name = 'sun';
  K.group.add(sun, sun.target);
  const q = K.quality;
  sun.castShadow = !!q.shadows;
  sun.shadow.mapSize.set(q.shadowSize || 2048, q.shadowSize || 2048);
  sun.shadow.bias = -0.00006;
  sun.shadow.normalBias = 0.0011;
  sun.shadow.radius = 2.5;
  // Fit the orthographic shadow camera to the run's volume as seen from the
  // sun. The light sits far enough out that the window wall is inside the
  // camera's depth range, so the bars cast into the map too.
  const dist = 6;
  const center = CASTERS.getCenter(new THREE.Vector3());
  const basis = new THREE.Matrix4().lookAt(TO_SUN, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const inv = basis.clone().invert();
  const lo = new THREE.Vector2(Infinity, Infinity);
  const hi = new THREE.Vector2(-Infinity, -Infinity);
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? CASTERS.max.x : CASTERS.min.x, i & 2 ? CASTERS.max.y : CASTERS.min.y, i & 4 ? CASTERS.max.z : CASTERS.min.z).sub(center).applyMatrix4(inv);
    lo.min(new THREE.Vector2(c.x, c.y));
    hi.max(new THREE.Vector2(c.x, c.y));
  }
  const off = new THREE.Vector3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0).applyMatrix4(basis);
  const aim = center.clone().add(off);
  sun.target.position.copy(aim);
  sun.position.copy(aim).addScaledVector(TO_SUN, dist);
  const cam = sun.shadow.camera;
  const hw = (hi.x - lo.x) / 2 + 0.02;
  const hh = (hi.y - lo.y) / 2 + 0.02;
  cam.left = -hw;
  cam.right = hw;
  cam.top = hh;
  cam.bottom = -hh;
  cam.near = 0.1;
  cam.far = dist + 2.2;
  cam.updateProjectionMatrix();
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  const range = cam.far - cam.near;
  K.uniforms.uShUv.value.set(1 / (2 * hw), 1 / (2 * hh));
  K.uniforms.uShD.value.set(0.02 / range, 0.08 / range, 0.3 / range, 1.6 / range);
  // penumbra per metre of blocker distance (a sun a little softened by the
  // glass), and a base width
  K.uniforms.uShPen.value.set(0.018, 0.0009);

  // Fill: sky through the windows and warm bounce off the oak.
  const hemi = new THREE.HemisphereLight(col('#f6efe4'), col('#c48a52'), 0.42);
  K.group.add(hemi);
  return sun;
}

// Dust motes drifting in the sunbeam (after Block Tower): 1-2 px glints lit
// only where the sun reaches them, faded out wherever the lens would blur
// them. The camera is read in onBeforeRender, so update() needs no camera.
function buildDust(K) {
  const count = { high: 380, medium: 240, low: 100 }[K.tier] || 200;
  const rand = rng(77);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // seeded on rays from the sun window, so none are wasted in shade
    p.set(ROOM.x0, FLOOR + WIN_L.y0 + rand() * (WIN_L.y1 - WIN_L.y0), WIN_L.z0 + rand() * (WIN_L.z1 - WIN_L.z0));
    const tHit = (p.y - (p.x < TABLE.x0 ? FLOOR : 0)) / TO_SUN.y;
    p.addScaledVector(TO_SUN, -(0.15 + rand() * 0.85) * tHit);
    p.toArray(pos, i * 3);
    seed[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...K.uniforms, uDrift: { value: 0 }, uScale: { value: 1000 }, uFocus: { value: 1.3 }, uGain: { value: 5.0 } },
    vertexShader: /* glsl */ `
${SET_PARS}
uniform float uDrift;
uniform float uScale;
uniform float uFocus;
attribute float aSeed;
varying float vLit;
void main() {
  float t = uDrift;
  vec3 p = position + vec3(sin(t * 0.13 + aSeed * 40.0) * 0.05, sin(t * 0.05 + aSeed * 17.0) * 0.08, cos(t * 0.11 + aSeed * 23.0) * 0.05);
  float lit = sunCookie(p);
  lit *= (0.35 + 0.65 * fract(aSeed * 7.31)) * (0.6 + 0.4 * sin(t * (0.8 + aSeed) + aSeed * 50.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float z = -mv.z;
  float px = 0.0012 * uScale / max(z, 0.01);
  float size = clamp(px, 1.0, 2.0);
  float cover = min(1.0, (px * px) / (size * size));
  float defocus = abs(1.0 / uFocus - 1.0 / max(z, 0.01)) - 0.15;
  float sharp = 1.0 - smoothstep(-0.06, 0.04, defocus);
  float band = smoothstep(0.3, 0.5, z) * (1.0 - smoothstep(2.0, 2.8, z));
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
  gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * vLit * uGain * (1.0 - 0.4 * smoothstep(0.25, 0.5, d)), 1.0);
}`,
    transparent: true,
    depthWrite: true,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  K.keep(geo);
  K.keep(mat);
  K.group.add(pts);
  const size = new THREE.Vector2();
  const target = new THREE.Vector3(-0.1, 0.16, 0);
  const eye = new THREE.Vector3();
  pts.onBeforeRender = (renderer, scene, camera) => {
    if (!camera.isPerspectiveCamera) return;
    renderer.getDrawingBufferSize(size);
    mat.uniforms.uScale.value = size.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
    eye.setFromMatrixPosition(camera.matrixWorld);
    mat.uniforms.uFocus.value = Math.max(0.2, eye.distanceTo(target));
  };
  K.animators.push((dt) => {
    if (!REDUCED_MOTION.matches) mat.uniforms.uDrift.value += dt;
  });
}

// ------------------------------------------------------------ environment

// Render the finished room into a PMREM so glossy things reflect it. A black
// stand-in environment of the same size is set during compilation so the
// programs built here are the ones the game then uses. Two bounces: the
// second capture sees walls already lit by the first, so sun off the table
// warms the whole room.
async function captureEnvironment(K, envIntensity) {
  const size = K.quality.envSize || 256;
  const pmrem = new THREE.PMREMGenerator(K.renderer);
  const blank = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 1, { size });
  const scene = new THREE.Scene();
  scene.environment = blank.texture;
  scene.environmentIntensity = 0;
  scene.add(K.group);
  const at = new THREE.Vector3(-0.1, 0.2, 0.05);
  const cam = new THREE.PerspectiveCamera(90, 1, 0.03, 60);
  cam.position.copy(at);
  if (K.renderer.compileAsync) {
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const prev = K.renderer.getRenderTarget();
    K.renderer.setRenderTarget(target);
    const done = K.renderer.compileAsync(scene, cam);
    K.renderer.setRenderTarget(prev);
    await done;
    target.dispose();
  }
  const first = pmrem.fromScene(scene, 0.01, 0.03, 60, { size, position: at });
  scene.environment = first.texture;
  scene.environmentIntensity = envIntensity;
  const rt = pmrem.fromScene(scene, 0.01, 0.03, 60, { size, position: at });
  first.dispose();
  pmrem.dispose();
  blank.dispose();
  scene.remove(K.group);
  K.keep(rt);
  return rt;
}

// ------------------------------------------------------------ entry

export async function createSunnySetting({ renderer, quality }) {
  const K = new Kit(renderer, quality);
  K.uniforms.uDapple.value = bake(K, { width: 256, fragment: DAPPLE_FRAG });
  buildRoom(K);
  buildTable(K);
  const bowl = buildBowl(K);
  buildPlants(K);
  buildToys(K);
  buildShelves(K);
  const sun = buildSun(K);
  buildDust(K);
  const environmentIntensity = 1.1;
  const env = await captureEnvironment(K, environmentIntensity);
  return {
    group: K.group,
    environment: env.texture,
    environmentIntensity,
    background: null,
    exposure: 0.95,
    bloom: { strength: 0.22, threshold: 2.4, radius: 0.6 },
    grade: {
      white: [1.02, 1.0, 0.95],
      power: 1.22,
      lookSaturation: 1.26,
      saturation: 1.02,
      contrast: 0.08,
      shadowTint: [0.008, 0.003, -0.004],
      highTint: [0.006, 0.002, -0.006],
      vignette: 0.24,
      grain: 0.02,
      fringe: 0.004,
    },
    sun,
    bowl: { position: new THREE.Vector3(BOWL.x, 0, BOWL.z), innerRadius: BOWL.inner, rimHeight: BOWL.rim, floorY: BOWL.floorY, object: bowl },
    camera: {
      target: new THREE.Vector3(-0.1, 0.16, 0.0),
      distance: 1.3,
      azimuth: THREE.MathUtils.degToRad(-8),
      elevation: THREE.MathUtils.degToRad(18),
      fov: 34,
    },
    focus: new THREE.Vector3(-0.1, 0.15, 0.03),
    update(dt, time) {
      K.uniforms.uTime.value = REDUCED_MOTION.matches ? 0 : time;
      for (const a of K.animators) a(dt, time);
    },
    dispose() {
      K.group.removeFromParent();
      const owned = new Set(K.bin);
      K.group.traverse((o) => {
        if (o.geometry) owned.add(o.geometry);
        for (const m of [].concat(o.material ?? [])) owned.add(m);
        if (o.isInstancedMesh) owned.add(o);
        if (o.shadow && o.shadow.map) owned.add(o.shadow);
      });
      for (const x of owned) x.dispose?.();
      K.bin.length = 0;
    },
  };
}
