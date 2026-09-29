// Lit materials for the instanced pieces. They are three's own physical
// materials (so they get the scene's environment lighting, sun and shadows) with
// per-instance behaviour patched in through onBeforeCompile:
//   flat  : paper confetti, ribbons, grass blades, needles (cut out by a
//           signed-distance shape, curled by a bend, foil glints)
//   star  : the chunky candy stars
//   blob  : jelly, mud, water, paint, clods, candy beads (a head sphere with an
//           optional drop-on-a-neck tail, wobble, lumps, grain, fake subsurface)
//   decal : ground stains (a splat atlas, wet-looking bump)
import * as THREE from 'three';
import { PERTURB_GLSL } from './common.js';

// Shared uniforms, updated once per frame by the Fx.
export const sharedUniforms = {
  uTime: { value: 0 },
  uNoise: { value: null },
  uAtlas: { value: null },
};

function patch(material, key, edit) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uNoise = sharedUniforms.uNoise;
    shader.uniforms.uAtlas = sharedUniforms.uAtlas;
    edit(shader);
  };
  material.customProgramCacheKey = () => key;
}

const rep = (src, what, by) => {
  if (!src.includes(what)) throw new Error('fx material patch: missing ' + what);
  return src.replace(what, by);
};

// ---------------------------------------------------------------------------
// paper
export function flatMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.55,
    metalness: 1.0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    alphaToCoverage: true,
  });
  patch(m, 'tt-flat', (shader) => {
    shader.vertexShader = rep(
      shader.vertexShader,
      '#include <common>',
      `#include <common>
attribute vec4 aParam;
uniform float uTime;
varying vec4 vP;
varying vec2 vQ;`,
    );
    shader.vertexShader = rep(
      shader.vertexShader,
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
float ttPh = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453) * 6.2831853;
float ttBend = aParam.y * (1.0 + 0.22 * sin(uTime * 11.0 + ttPh));
vec3 ttPos = position;
if (abs(ttBend) > 0.03) {
  float th = ttBend * position.x;
  ttPos = vec3(sin(th) / ttBend, position.y, (1.0 - cos(th)) / ttBend);
  objectNormal = vec3(-sin(th), 0.0, cos(th));
}
vP = vec4(aParam.x, aParam.z, ttPh, aParam.w);
vQ = position.xy * 2.0;`,
    );
    shader.vertexShader = rep(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\ntransformed = ttPos;');
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>
varying vec4 vP;
varying vec2 vQ;
float ttRBox(vec2 p, vec2 b, float rho) {
  vec2 q = abs(p) - (b - rho);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rho;
}
// signed distance (negative inside) of the paper shape, in units of the smaller half-size
float ttShape(vec2 uv, float shape, float asp, float seed) {
  vec2 b = vec2(max(1.0, 1.0 / asp), max(1.0, asp));
  vec2 p = uv * b;
  if (shape < 0.5) return ttRBox(p, b, 0.32);
  if (shape < 1.5) return (length(uv) - 1.0) * min(b.x, b.y);
  if (shape < 2.5) {
    vec2 w = p + 0.2 * vec2(sin(p.y * 2.7 + seed * 5.0), sin(p.x * 2.3 + seed * 3.0));
    return ttRBox(w, b * 0.92, 0.55);
  }
  if (shape < 3.5) return abs(p.y) - b.y * pow(max(0.0, 1.0 - abs(p.x) / b.x), 0.75);
  return (abs(p.x) / b.x + abs(p.y) / b.y - 1.0) * 0.6;
}`,
    );
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <map_fragment>',
      `#include <map_fragment>
{
  float d = ttShape(vQ, vP.x, vP.y, vP.z);
  float fw = max(fwidth(d), 1e-4);
  diffuseColor.a = clamp(0.5 - d / fw, 0.0, 1.0);
}`,
    );
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <color_fragment>',
      `#include <color_fragment>
if (!gl_FrontFacing) diffuseColor.rgb *= 0.9;`,
    );
    shader.fragmentShader = rep(shader.fragmentShader, '#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.6, 0.26, vP.w);');
    shader.fragmentShader = rep(shader.fragmentShader, '#include <metalnessmap_fragment>', 'float metalnessFactor = vP.w * 0.95;');
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * 0.16;`,
    );
  });
  return m;
}

// ---------------------------------------------------------------------------
// candy stars
export function starMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.2,
  });
  patch(m, 'tt-star', (shader) => {
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
{
  float fres = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * (0.16 + 0.3 * fres * fres);
}`,
    );
  });
  return m;
}

// ---------------------------------------------------------------------------
// blobs
const BLOB_GLSL = /* glsl */ `
// radius of the surface of revolution at height y (head radii): a unit sphere
// smoothly joined to a tapering tail of length T that starts as thick as neck
float ttBlobR(float y, float T, float neck) {
  float head = sqrt(max(0.0, 1.0 - y * y));
  if (T < 0.002) return head;
  float d = -y;
  float tailLen = 1.0 + T;
  float tail = (d > 0.0 && d < tailLen) ? neck * pow(1.0 - d / tailLen, 0.8) : 0.0;
  float k = 0.3;
  float h = clamp(0.5 + 0.5 * (head - tail) / k, 0.0, 1.0);
  return mix(tail, head, h) + k * h * (1.0 - h);
}
void ttBlob(float s, vec2 az, float T, float neck, out vec3 p, out vec3 n) {
  float y;
  if (s < 0.3333) y = cos(s * 3.0 * 1.5707963);
  else if (s < 0.6667) y = -sin((s - 0.3333) * 3.0 * 1.5707963);
  else y = -(1.0 + T * pow((s - 0.6667) * 3.0, 0.85));
  float r = ttBlobR(y, T, neck);
  p = vec3(az.x * r, y, az.y * r);
  if (s < 0.002) { n = vec3(0.0, 1.0, 0.0); return; }
  if (s > 0.998) { n = vec3(0.0, -1.0, 0.0); return; }
  float e = 0.02;
  float dR = (ttBlobR(y + e, T, neck) - ttBlobR(y - e, T, neck)) / (2.0 * e);
  vec2 nn = normalize(vec2(1.0, -dR));
  n = vec3(az.x * nn.x, nn.y, az.y * nn.x);
}`;

export function blobMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.25,
  });
  patch(m, 'tt-blob', (shader) => {
    shader.vertexShader = rep(
      shader.vertexShader,
      '#include <common>',
      `#include <common>
attribute vec4 aA;
attribute vec4 aB;
uniform float uTime;
varying vec4 vB;
varying vec3 vLocal;
${BLOB_GLSL}`,
    );
    shader.vertexShader = rep(
      shader.vertexShader,
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
vec3 ttP;
{
  vec3 n;
  ttBlob(position.y, position.xz, aA.x, aA.y, ttP, n);
  float seed = aA.w;
  // jelly wobble: the head lengthens and widens in turn, with a ripple over its height
  float amp = aA.z;
  if (amp > 0.001) {
    float w = 0.6 * sin(uTime * 19.0 + seed * 6.2831 + ttP.y * 2.4) + 0.4 * sin(uTime * 27.0 + seed * 3.1 + ttP.x * 3.0 + ttP.z * 2.0);
    ttP.xz *= 1.0 + amp * w;
    ttP.y *= 1.0 - amp * w * 0.7;
  }
  // lumps: a sum of three plane waves, with the analytic gradient bending the normal
  float lump = aB.z;
  if (lump > 0.001) {
    vec3 d = normalize(ttP + vec3(1e-4));
    vec3 k1 = vec3(3.1, 2.3, 1.7); vec3 k2 = vec3(-4.3, 5.1, 2.9); vec3 k3 = vec3(6.7, -3.3, 4.1);
    float a1 = dot(d, k1) + seed * 17.0; float a2 = dot(d, k2) + seed * 29.0; float a3 = dot(d, k3) + seed * 41.0;
    float h = 0.5 * sin(a1) + 0.35 * sin(a2) + 0.25 * sin(a3);
    vec3 g = 0.5 * cos(a1) * k1 + 0.35 * cos(a2) * k2 + 0.25 * cos(a3) * k3;
    ttP *= 1.0 + lump * h;
    n = normalize(n - lump * (g - dot(g, n) * n));
  }
  objectNormal = n;
}
vB = aB;
vLocal = ttP;`,
    );
    shader.vertexShader = rep(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\ntransformed = ttP;');
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>
uniform sampler2D uNoise;
varying vec4 vB;
varying vec3 vLocal;
${PERTURB_GLSL}`,
    );
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <color_fragment>',
      `#include <color_fragment>
float ttGrain = 0.0;
if (vB.w > 0.001) {
  vec3 lp = vLocal * 2.3;
  ttGrain = texture2D(uNoise, lp.xy + lp.zy * 0.6).r * 0.65 + texture2D(uNoise, (lp.xz - lp.zy) * 2.1 + 0.37).r * 0.35;
  diffuseColor.rgb *= mix(1.0, 0.68 + 0.7 * ttGrain, vB.w);
}`,
    );
    shader.fragmentShader = rep(shader.fragmentShader, '#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(vB.x, 0.03, 1.0);');
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
if (vB.w > 0.001) {
  normal = ttPerturb(-vViewPosition, normal, vec2(dFdx(ttGrain), dFdy(ttGrain)) * vB.w * 7.0, faceDirection);
}`,
    );
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= smoothstep(0.85, 0.35, vB.x);
#endif`,
    );
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
{
  float fres = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * vB.y * (0.55 + 0.55 * fres * fres);
  // a wet, glossy thing shows a bright sky-coloured rim, even where the environment is dull
  totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * pow(fres, 4.0) * 0.2 * smoothstep(0.5, 0.1, vB.x);
}`,
    );
  });
  return m;
}

// The blob's shape for the shadow pass, so tails and lumps cast their own shape.
export function blobDepthMaterial() {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = rep(
      shader.vertexShader,
      '#include <common>',
      `#include <common>
attribute vec4 aA;
attribute vec4 aB;
${BLOB_GLSL}`,
    );
    shader.vertexShader = rep(shader.vertexShader, '#include <begin_vertex>', `vec3 ttP; { vec3 n; ttBlob(position.y, position.xz, aA.x, aA.y, ttP, n); ttP *= 1.0 + aB.z * 0.4; }
vec3 transformed = ttP;`);
  };
  m.customProgramCacheKey = () => 'tt-blob-depth';
  return m;
}

// ---------------------------------------------------------------------------
// ground stains
export function decalMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.2,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    envMapIntensity: 0.8,
  });
  patch(m, 'tt-decal', (shader) => {
    shader.vertexShader = rep(
      shader.vertexShader,
      '#include <common>',
      `#include <common>
attribute vec4 aDecal;
attribute vec4 aCorner;
varying vec4 vD;
varying vec2 vDUv;`,
    );
    shader.vertexShader = rep(
      shader.vertexShader,
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
  vec2 uvq = position.xy * 0.5 + 0.5;
  float hh = mix(mix(aCorner.x, aCorner.y, uvq.x), mix(aCorner.z, aCorner.w, uvq.x), uvq.y);
  transformed.z = hh + 0.0009;
  transformed.xy *= aDecal.z;
  float cell = aDecal.x;
  vec2 origin = vec2(mod(cell, 4.0), floor(cell / 4.0));
  vDUv = (origin + clamp(uvq, 0.004, 0.996)) / vec2(4.0, 2.0);
  vD = aDecal;
}`,
    );
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>
uniform sampler2D uAtlas;
varying vec4 vD;
varying vec2 vDUv;
${PERTURB_GLSL}`,
    );
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <color_fragment>',
      `#include <color_fragment>
vec4 ttAtlas = texture2D(uAtlas, vDUv);
diffuseColor.a *= ttAtlas.a * vD.y;
diffuseColor.rgb *= 0.78 + 0.34 * ttAtlas.r;
if (diffuseColor.a < 0.004) discard;`,
    );
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
normal = ttPerturb(-vViewPosition, normal, vec2(dFdx(ttAtlas.r), dFdy(ttAtlas.r)) * 5.0, faceDirection);`,
    );
    shader.fragmentShader = rep(shader.fragmentShader, '#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.7, 0.26, vD.w);');
    shader.fragmentShader = rep(
      shader.fragmentShader,
      '#include <lights_physical_fragment>',
      `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= vD.w;
#endif`,
    );
  });
  return m;
}
