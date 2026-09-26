// The materials friends are made of, all built on three.js's physical and
// standard materials with extra shader code:
//
//  - hide: the body. Its colour is the child's painting, projected onto the
//    friend from the side exactly as it lay on the canvas, blended with each
//    region's own tint (a cream belly, a pink nose) by the sculpt's 'paint'
//    weight. Scaly regions get domed scales from a 3D cell pattern with
//    thin-film iridescence; smooth skin gets a clear coat; fur regions get a
//    soft undercoat and a sheen, with the fur itself drawn by the shells.
//  - shell: one layer of fur. A furry friend is drawn several times, each
//    shell pushed a little further out along the normal and combed back and
//    down; each shell keeps only the cross-sections of strands (one strand
//    per cell of a fine 3D lattice, tapering to the tip), so together they
//    read as dense, soft fur with dark roots and light tips.
//  - eye: a glossy eye with a procedural iris (fibres, a dark limbal ring,
//    a big soft pupil) under a clear coat that mirrors the sky.
//  - solid: horns, claws, hooves and the like, with the friend's own tint.
//
// Every one of them also knows how to be paint: while a friend is coming
// alive, the parts of it not yet alive are pressed flat onto the canvas
// (uCanvasLocal) and look like wet brush strokes, with a glowing seam where
// paint turns into fur or scales (see alive.js).
import * as THREE from 'three';

// uniforms shared by every material of one friend
export function friendUniforms() {
  return {
    tSkin: { value: null },
    uPaintMat: { value: new THREE.Matrix4() },
    uAliveOn: { value: 0 },
    uFront: { value: -1 },
    uFrontW: { value: 0.1 },
    uCanvasLocal: { value: new THREE.Matrix4() },
    uCanvasN: { value: new THREE.Vector3(0, 0, 1) },
    uTime: { value: 0 },
    uGlow: { value: new THREE.Color(1.0, 0.85, 0.55) },
    uFurLen: { value: 0.012 },
    uComb: { value: new THREE.Vector3(0, -0.4, -0.6) },
    uWind: { value: new THREE.Vector3() },
    uStrand: { value: 0.0022 },
    uScale: { value: 0.0045 },
    uSplat: { value: 0.35 },
    uShellCount: { value: 16 },
    uHappy: { value: 0 },
  };
}

const NOISE = /* glsl */ `
float mbHash1(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
vec3 mbHash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float mbNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mbHash1(i + vec3(0, 0, 0)), mbHash1(i + vec3(1, 0, 0)), f.x),
                 mix(mbHash1(i + vec3(0, 1, 0)), mbHash1(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(mbHash1(i + vec3(0, 0, 1)), mbHash1(i + vec3(1, 0, 1)), f.x),
                 mix(mbHash1(i + vec3(0, 1, 1)), mbHash1(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float mbFbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * mbNoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}`;

// ------------------------------------------------------------ vertex

const VERT_PARS = /* glsl */ `
attribute vec3 aTint;
attribute vec4 aMix;
uniform mat4 uPaintMat;
uniform float uAliveOn;
uniform float uFront;
uniform float uFrontW;
uniform mat4 uCanvasLocal;
uniform vec3 uCanvasN;
uniform float uTime;
#ifdef SHELL
uniform float uShell;
uniform float uFurLen;
uniform vec3 uComb;
uniform vec3 uWind;
varying vec3 vRestN;
#endif
varying vec3 vRest;
varying vec3 vTint;
varying vec4 vMix;
varying vec2 vPaintUv;
varying float vAlive;
${NOISE}`;

// runs after skinning: grow the fur, then press what isn't alive yet flat
// onto the canvas, wobbling a little like wet paint being lifted
const VERT_MAIN = /* glsl */ `
vRest = position;
vTint = aTint;
vMix = aMix;
vPaintUv = (uPaintMat * vec4(position, 1.0)).xy;
float mbAlive = 1.0;
if (uAliveOn > 0.5) {
  float wob = (mbNoise(vec3(vPaintUv * 7.0, uTime * 0.8)) - 0.5) * uFrontW * 0.9;
  mbAlive = smoothstep(uFront - uFrontW, uFront + uFrontW, vPaintUv.x + wob);
}
vAlive = mbAlive;
#ifdef SHELL
  vRestN = normal;
  float mbLen = uFurLen * aMix.y * mbAlive;
  vec3 mbN = normalize(objectNormal);
  transformed += mbN * (uShell * mbLen) + (uComb + uWind) * (uShell * uShell * mbLen);
#endif
if (uAliveOn > 0.5 && mbAlive < 1.0) {
  vec3 mbFlat = (uCanvasLocal * vec4(position, 1.0)).xyz;
  // the paint bulges off the canvas a little as it starts to lift
  mbFlat += uCanvasN * (smoothstep(0.0, 1.0, mbAlive) * 0.012);
  transformed = mix(mbFlat, transformed, smoothstep(0.0, 1.0, mbAlive));
}
`;

const VERT_NORMAL = /* glsl */ `
#ifndef FLAT_SHADED
if (uAliveOn > 0.5 && vAlive < 1.0) vNormal = normalize(mix(normalize(normalMatrix * uCanvasN), vNormal, smoothstep(0.0, 1.0, vAlive)));
#endif
`;

function injectVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
    .replace('#include <project_vertex>', `${VERT_MAIN}\n#include <project_vertex>\n${VERT_NORMAL}`);
}

// ------------------------------------------------------------ fragment

const FRAG_PARS = /* glsl */ `
uniform sampler2D tSkin;
uniform float uAliveOn;
uniform float uTime;
uniform vec3 uGlow;
uniform float uScale;
uniform float uSplat;
uniform float uStrand;
uniform float uHappy;
varying vec3 vRest;
varying vec3 vTint;
varying vec4 vMix;
varying vec2 vPaintUv;
varying float vAlive;
#ifdef SHELL
uniform float uShell;
varying vec3 vRestN;
#endif
${NOISE}
vec3 mbPerturb(vec3 surfPos, vec3 surfNorm, float h, float face) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * face;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
// domed scales: distance to the nearest two cell centres of a 3D lattice
vec3 mbScales(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec3 id = vec3(0.0);
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = mbHash3(i + g);
    vec3 r = g + 0.25 + 0.5 * o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = i + g; }
    else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), mbHash1(id * 1.7 + 3.1));
}
// the painted colour, with a few splatters of the child's other colours
vec3 mbPaint(vec2 uv) {
  vec3 c = texture2D(tSkin, uv).rgb;
  if (uSplat > 0.0) {
    float s = mbNoise(vRest * 90.0) * 0.7 + mbNoise(vRest * 230.0) * 0.3;
    float m = smoothstep(0.72, 0.76, s) * uSplat;
    if (m > 0.0) {
      vec2 off = (mbHash3(floor(vRest * 60.0)).xy - 0.5) * 0.5;
      c = mix(c, texture2D(tSkin, clamp(uv + off, 0.02, 0.98)).rgb, m);
    }
  }
  return c;
}`;

// colour and micro surface of a hide
const HIDE_COLOR = /* glsl */ `
vec3 mbBase = vTint;
if (vMix.x > 0.001) mbBase = mix(vTint, mbPaint(vPaintUv), vMix.x);
float mbPat = vMix.w;
float mbH = 0.0;
float mbScaleId = 0.0;
float mbCrease = 0.0;
#ifdef SCALES
// scales fade out where they would be smaller than a couple of pixels
float mbFw = length(fwidth(vRest / uScale));
mbPat *= 1.0 - smoothstep(0.25, 0.7, mbFw);
if (mbPat > 0.01) {
  vec3 sc = mbScales(vRest / uScale);
  float edge = sc.y - sc.x;
  mbH = smoothstep(0.0, 0.5, edge) * mbPat;
  mbCrease = (1.0 - smoothstep(0.0, 0.1, edge)) * mbPat;
  mbScaleId = sc.z;
  mbBase *= mix(1.0, (0.9 + 0.2 * sc.z) * (1.0 - 0.28 * mbCrease), mbPat);
}
#endif
#ifdef FURRY
// the undercoat between hairs is a little darker than the tips
mbBase *= mix(1.0, 0.8 + 0.2 * mbNoise(vRest * 400.0), vMix.y);
#endif
// wet paint while not yet alive
float mbPaintState = 1.0 - vAlive;
if (uAliveOn > 0.5 && mbPaintState > 0.0) {
  float streak = mbNoise(vec3(vPaintUv.x * 9.0 - uTime * 0.25, vPaintUv.y * 120.0, 1.3));
  vec3 pc = texture2D(tSkin, vPaintUv + vec2(0.0, (streak - 0.5) * 0.004)).rgb * (0.82 + 0.32 * streak);
  mbBase = mix(mbBase, pc, mbPaintState);
  mbH = mix(mbH, streak * 0.6, mbPaintState);
}
diffuseColor.rgb = mbBase;
`;

const HIDE_NORMAL = /* glsl */ `
#if defined(SCALES)
if (mbH > 0.0) normal = mbPerturb(-vViewPosition, normal, mbH * uScale * 0.25, faceDirection);
#endif
`;

const HIDE_ROUGH = /* glsl */ `
roughnessFactor = mix(vMix.z, 0.22, mbPaintState * uAliveOn);
#ifdef SCALES
roughnessFactor += 0.15 * mbCrease;
#endif
`;

const HIDE_MATERIAL = /* glsl */ `
#ifdef USE_IRIDESCENCE
material.iridescence *= vMix.w * (0.75 + 0.5 * mbScaleId);
material.iridescenceThickness = mix(260.0, 520.0, mbScaleId);
#endif
#ifdef USE_SHEEN
material.sheenColor *= mix(vec3(0.0), mbBase * 0.7 + 0.3, vMix.y);
#endif
#ifdef USE_CLEARCOAT
material.clearcoat *= (1.0 - vMix.y) * (1.0 - mbPat * 0.5);
#endif
`;

// the seam where paint turns into a living friend glows and twinkles
const ALIVE_EMISSIVE = /* glsl */ `
if (uAliveOn > 0.5) {
  float seam = 1.0 - abs(vAlive - 0.5) * 2.0;
  seam = smoothstep(0.0, 1.0, seam);
  float tw = pow(mbNoise(vRest * 260.0 + uTime * 3.0), 6.0) * 10.0;
  totalEmissiveRadiance += uGlow * seam * (0.9 + tw) * 1.6;
  totalEmissiveRadiance += uGlow * (1.0 - vAlive) * 0.08;
}
totalEmissiveRadiance += uGlow * uHappy * 0.15;
`;

function injectFragment(shader, color, extra = {}) {
  let f = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAG_PARS}`);
  f = f.replace('#include <color_fragment>', `#include <color_fragment>\n${color}`);
  if (extra.rough) f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${extra.rough}`);
  if (extra.normal) f = f.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${extra.normal}`);
  if (extra.material) f = f.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${extra.material}`);
  f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${ALIVE_EMISSIVE}`);
  shader.fragmentShader = f;
}

function hook(material, shared, key, fn) {
  material.onBeforeCompile = (shader) => {
    for (const k in shared) shader.uniforms[k] = shared[k];
    if (material.userData.own) for (const k in material.userData.own) shader.uniforms[k] = material.userData.own[k];
    fn(shader);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// ------------------------------------------------------------ builders

// opts: scales (bool), furry (bool), sheen (0..1), iridescence (0..1),
// clearcoat (0..1)
export function hideMaterial(shared, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0,
    sheen: opts.sheen ?? 0,
    sheenRoughness: 0.45,
    sheenColor: 0xffffff,
    clearcoat: opts.clearcoat ?? 0,
    clearcoatRoughness: 0.18,
    iridescence: opts.iridescence ?? 0,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [200, 500],
  });
  if (opts.scales) m.defines = { ...m.defines, SCALES: '' };
  if (opts.furry) m.defines = { ...m.defines, FURRY: '' };
  const key = `mb-hide-${!!opts.scales}-${!!opts.furry}`;
  return hook(m, shared, key, (s) => {
    injectVertex(s);
    injectFragment(s, HIDE_COLOR, { rough: HIDE_ROUGH, normal: HIDE_NORMAL, material: HIDE_MATERIAL });
  });
}

// the matching shadow caster, flattened the same way while coming alive
export function depthMaterial(shared) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  return hook(m, shared, 'mb-depth', (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <project_vertex>', `${VERT_MAIN}\n#include <project_vertex>`);
  });
}

const SHELL_COLOR = /* glsl */ `
if (vAlive < 0.98) discard;
vec3 mbBase = vTint;
if (vMix.x > 0.001) mbBase = mix(vTint, mbPaint(vPaintUv), vMix.x);
// two offset lattices of strands, each a column along the rest normal
float mbCov = 0.0;
float mbRnd = 0.5;
for (int L = 0; L < 2; L++) {
  vec3 p = vRest / uStrand + float(L) * vec3(0.5, 0.31, 0.77);
  vec3 cell = floor(p);
  vec3 f = p - cell;
  vec3 r = mbHash3(cell + float(L) * 17.0);
  vec3 d = f - (0.2 + 0.6 * r);
  vec3 n = normalize(vRestN);
  d -= n * dot(d, n);
  float len = 0.55 + 0.45 * r.y;
  float h = uShell / max(len * vMix.y, 0.001);
  float rad = 0.46 * (1.0 - pow(clamp(h, 0.0, 1.0), 1.3));
  float c = 1.0 - smoothstep(rad * 0.7, rad, length(d));
  if (h > 1.0) c = 0.0;
  if (c > mbCov) { mbCov = c; mbRnd = r.z; }
}
if (vMix.y < 0.05) mbCov = 0.0;
diffuseColor.a = mbCov;
// darker towards the roots (the hairs shade each other), lighter tips
float mbTip = uShell;
mbBase *= (0.42 + 0.58 * pow(mbTip, 0.7)) * (0.84 + 0.32 * mbRnd);
mbBase = mix(mbBase, mbBase * 1.15 + 0.02, smoothstep(0.7, 1.0, mbTip));
diffuseColor.rgb = mbBase;
`;

export function shellMaterial(shared, shellValue, alphaToCoverage) {
  const own = { uShell: { value: shellValue } };
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0,
    alphaTest: alphaToCoverage ? 0.0 : 0.5,
    alphaToCoverage: !!alphaToCoverage,
  });
  m.userData.own = own;
  m.defines = { SHELL: '' };
  return hook(m, shared, `mb-shell-${!!alphaToCoverage}`, (s) => {
    injectVertex(s);
    injectFragment(s, SHELL_COLOR);
    // soft rim: light catching the tips of the fur at grazing angles
    s.fragmentShader = s.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float mbRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
       outgoingLight += diffuseColor.rgb * mbRim * 0.35 * uShell;
       #include <opaque_fragment>`,
    );
  });
}

// eye: aEye holds each vertex's position in the eye's own frame (+z is where
// it looks), scaled so the eye's radius is 1
const EYE_COLOR = /* glsl */ `
vec3 e = normalize(vEye);
float r = length(e.xy);
float front = step(0.0, e.z);
float ang = atan(e.y, e.x);
vec3 col = vec3(0.96, 0.94, 0.92) * (0.85 + 0.15 * e.z);
if (front > 0.5 && r < uIris) {
  float t = r / uIris;
  float fib = mbNoise(vec3(ang * 9.0, t * 6.0, 1.0)) * 0.6 + mbNoise(vec3(ang * 23.0, t * 3.0, 4.0)) * 0.4;
  vec3 iris = mix(uIrisColor * 1.35 + 0.05, uIrisColor, smoothstep(0.35, 0.8, t));
  iris = mix(iris, uIrisColor2, smoothstep(0.55, 0.95, t) * 0.8);
  iris *= 0.72 + 0.5 * fib;
  iris = mix(iris, iris * 0.18, smoothstep(0.82, 1.0, t));
  col = iris;
  float p = uPupil;
  col = mix(vec3(0.012, 0.01, 0.02), col, smoothstep(p - 0.03, p + 0.02, t));
  // painted catchlights, like a well-made toy's
  vec2 hl = e.xy - vec2(-0.2, 0.26) * uIris;
  col += vec3(1.0) * (1.0 - smoothstep(0.07, 0.1, length(hl)));
  vec2 hl2 = e.xy - vec2(0.17, -0.2) * uIris;
  col += vec3(0.8) * (1.0 - smoothstep(0.025, 0.045, length(hl2)));
}
diffuseColor.rgb = col;
float mbPaintState = 1.0 - vAlive;
`;

export function eyeMaterial(shared, { iris = 0x6a4cc8, iris2 = 0x2a8fbf, irisSize = 0.8, pupil = 0.45 } = {}) {
  const own = {
    uIrisColor: { value: new THREE.Color(iris) },
    uIrisColor2: { value: new THREE.Color(iris2) },
    uIris: { value: irisSize },
    uPupil: { value: pupil },
  };
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.4 });
  m.userData.own = own;
  return hook(m, shared, 'mb-eye', (s) => {
    injectVertex(s);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aEye;\nvarying vec3 vEye;')
      .replace('vRest = position;', 'vRest = position;\nvEye = aEye;');
    injectFragment(s, EYE_COLOR);
    s.fragmentShader = s.fragmentShader.replace(
      'uniform sampler2D tSkin;',
      'uniform sampler2D tSkin;\nuniform vec3 uIrisColor;\nuniform vec3 uIrisColor2;\nuniform float uIris;\nuniform float uPupil;\nvarying vec3 vEye;',
    );
  });
}

// horns, claws, hooves, teeth: the vertex tint, optionally metallic
const SOLID_COLOR = /* glsl */ `
vec3 mbBase = vTint;
if (vMix.x > 0.001) mbBase = mix(vTint, mbPaint(vPaintUv), vMix.x);
float mbPaintState = 1.0 - vAlive;
diffuseColor.rgb = mbBase;
`;

export function solidMaterial(shared, { metalness = 0, clearcoat = 0, transmission = 0, iridescence = 0, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.4, metalness, clearcoat, clearcoatRoughness: 0.1, iridescence, iridescenceIOR: 1.5, side });
  if (transmission) {
    m.transmission = transmission;
    m.thickness = 0.002;
  }
  return hook(m, shared, `mb-solid-${metalness > 0}-${clearcoat > 0}-${transmission > 0}-${iridescence > 0}-${side}`, (s) => {
    injectVertex(s);
    injectFragment(s, SOLID_COLOR, {
      rough: 'roughnessFactor = mix(vMix.z, 0.22, mbPaintState * uAliveOn);',
    });
  });
}

// Wings and fins light shines through: the tint plus the painting, with a
// soft glow of light passing through from behind and a thin-film sheen.
const MEMBRANE_COLOR = /* glsl */ `
vec3 mbBase = vTint;
if (vMix.x > 0.001) mbBase = mix(vTint, mbPaint(vPaintUv), vMix.x);
float mbPaintState = 1.0 - vAlive;
diffuseColor.rgb = mbBase;
`;

export function membraneMaterial(shared, { iridescence = 0.6 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.35,
    side: THREE.DoubleSide,
    iridescence,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [250, 600],
    sheen: 0.4,
    sheenColor: 0xffffff,
    sheenRoughness: 0.3,
  });
  return hook(m, shared, 'mb-membrane', (s) => {
    injectVertex(s);
    injectFragment(s, MEMBRANE_COLOR, { rough: 'roughnessFactor = mix(vMix.z, 0.22, mbPaintState * uAliveOn);' });
    s.fragmentShader = s.fragmentShader
      // light through the membrane: the key light seen from behind
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 L = directionalLights[0].direction;
          float through = pow(saturate(dot(normalize(vViewPosition), -L)), 2.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * (0.15 + 0.85 * through) * 0.5;
        }
        #endif`,
      );
  });
}
