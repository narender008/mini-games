// Cake materials. Both the outside (frosting, ganache, fondant, drips) and the
// inside (the layers a cut reveals) are procedural: the shaders read the
// fragment's position in cake space and work out which layer or coat it is
// in, then paint crumb, cream, jam or ganache with a matching bump. Pieces
// keep their original cake-space coordinates when they move, so a lifted
// slice shows exactly the layers it was cut from.
import * as THREE from 'three';
import { NOISE, PERTURB, SLIT, SHAPE, MAX_SLITS } from './glsl.js';
import { LAYER, COAT } from './recipes.js';

export const MAXL = 12;

const col = (hex) => new THREE.Color(hex);

// Uniforms for one tier, shared by its inside and outside materials.
export const BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLANK.needsUpdate = true;

export function tierUniforms(recipe, tier, index, frosting, slitUniforms) {
  const layerTop = new Array(MAXL).fill(1);
  const layerKind = new Array(MAXL).fill(0);
  const layerA = Array.from({ length: MAXL }, () => new THREE.Color());
  const layerB = Array.from({ length: MAXL }, () => new THREE.Color());
  tier.layers.forEach((l, i) => {
    layerTop[i] = tier.tops[i];
    layerKind[i] = LAYER[l[0]];
    layerA[i].set(l[2]);
    layerB[i].set(l[3] || l[2]);
  });
  const paint = (surface, hex) => {
    if (!frosting) return hex;
    if (recipe.frost === 'all' || recipe.frost === surface) return frosting;
    // unfrosted cakes still take the colour in their whipped cream top
    if (!recipe.frost && surface === 'top' && tier.top.kind === 'whipped') return frosting;
    return hex;
  };
  const u = {
    uTierH: { value: tier.h },
    uTierBase: { value: tier.base },
    uShape: { value: new THREE.Vector4(recipe.shape === 'square' ? 1 : 0, tier.r, 0.018, 0) },
    uLayerTop: { value: layerTop },
    uLayerKind: { value: layerKind },
    uLayerA: { value: layerA },
    uLayerB: { value: layerB },
    uLayers: { value: tier.layers.length },
    uSide: { value: new THREE.Vector4(COAT[tier.side.kind], tier.side.t, tier.side.underT || 0, 0) },
    uSideCol: { value: col(paint('side', tier.side.color)) },
    uSideUnder: { value: col(tier.side.under || tier.side.color) },
    uTop: { value: new THREE.Vector4(COAT[tier.top.kind], tier.top.t, tier.top.underT || 0, 0) },
    uTopCol: { value: col(tier.top.kind === 'ganache' || tier.top.kind === 'glaze' ? tier.top.color : paint('top', tier.top.color)) },
    uTopUnder: { value: col(paint('side', tier.top.under || tier.top.color)) },
    uDrip: { value: new THREE.Vector4(tier.drip ? 1 : 0, tier.drip ? tier.drip.len : 0, tier.r, 0) },
    uDripCol: { value: col(tier.drip ? tier.drip.color : '#000000') },
    uBand: { value: new THREE.Vector4(tier.band ? 1 : 0, tier.band ? tier.band.h : 0, 0, 0) },
    uBandCol: { value: col(tier.band ? tier.band.color : '#000000') },
    uPattern: { value: recipe.pattern === 'checker' ? 1 : 0 },
    uSeed: { value: index * 7.31 + 1.7 },
    uMsg: { value: BLANK },
    uMsgBox: { value: new THREE.Vector4(0, 0, 0.1, 0.03) },
    uMsgOpt: { value: new THREE.Vector4(0, 0, 0, 0) },
    uMsgCol: { value: new THREE.Color(1, 1, 1) },
  };
  return Object.assign(u, slitUniforms);
}

export function createSlitUniforms() {
  return {
    uSlitSeg: { value: Array.from({ length: MAX_SLITS }, () => new THREE.Vector4()) },
    uSlitInfo: { value: Array.from({ length: MAX_SLITS }, () => new THREE.Vector4()) },
    uSlitCount: { value: 0 },
  };
}

const TIER_DECL = /* glsl */ `
#define MAXL ${MAXL}
uniform float uTierH;
uniform float uTierBase;
uniform float uLayerTop[MAXL];
uniform float uLayerKind[MAXL];
uniform vec3 uLayerA[MAXL];
uniform vec3 uLayerB[MAXL];
uniform int uLayers;
uniform vec4 uSide;
uniform vec3 uSideCol;
uniform vec3 uSideUnder;
uniform vec4 uTop;
uniform vec3 uTopCol;
uniform vec3 uTopUnder;
uniform vec4 uDrip;
uniform vec3 uDripCol;
uniform vec4 uBand;
uniform vec3 uBandCol;
uniform float uPattern;
uniform float uSeed;
uniform sampler2D uMsg;
uniform vec4 uMsgBox;
uniform vec4 uMsgOpt;
uniform vec3 uMsgCol;
varying vec3 vCake;
varying vec3 vCakeN;
`;

// Shading for every layer and coat kind. Each writes albedo, roughness and a
// bump height in metres (negative is a dip).
const LAYERS_GLSL = /* glsl */ `
float fadeAt(float px, float scale) { return 1.0 - smoothstep(0.3, 0.95, px * scale); }

void shadeSponge(vec3 p, vec3 base, vec3 crustCol, float yIn, float thick, float edge, float px,
                 out vec3 alb, out float rough, out float h) {
  // air cells at three sizes: a few big holes, the open crumb, fine pits
  vec3 w0 = worley(p * 260.0 + 7.3);
  float big = smoothstep(0.34, 0.12, w0.x) * step(0.78, w0.z) * fadeAt(px, 260.0);
  vec3 w1 = worley(p * 650.0);
  float r1 = mix(0.22, 0.5, w1.z);
  float pore1 = smoothstep(r1, r1 * 0.35, w1.x);
  float wall1 = smoothstep(r1 * 1.55, r1, w1.x) - pore1; // lit lip round each cell
  vec3 w2 = worley(p * 1600.0 + 13.1);
  float pore2 = smoothstep(0.4, 0.12, w2.x);
  float f1 = fadeAt(px, 650.0);
  float f2 = fadeAt(px, 1600.0);
  float pore = max(max(pore1 * f1, pore2 * f2 * 0.7), big);
  float grain = (vnoise(p * 4200.0) - 0.5) * fadeAt(px, 4200.0);
  // a darker, finer crust where the sponge was against the tin
  float crust = max(smoothstep(0.0028, 0.0, yIn), smoothstep(0.0022, 0.0, thick - yIn));
  crust = max(crust, smoothstep(0.0025, 0.0, edge));
  float mott = vnoise(p * 140.0);
  vec3 c = base * (0.86 + 0.26 * mott) * (0.94 + 0.12 * w1.z);
  c = mix(c, crustCol, crust * 0.75);
  vec3 poreCol = mix(base, crustCol, 0.6) * 0.42;
  alb = c * (1.0 + 0.22 * grain + 0.12 * wall1 * f1);
  alb = mix(alb, poreCol, pore * 0.85);
  // pores too small to see still darken the crumb a little
  alb *= mix(0.88, 1.0, max(f1, f2 * 0.7));
  rough = 0.86 + 0.08 * pore;
  h = -pore1 * f1 * 0.00035 - pore2 * f2 * 0.00012 - big * 0.0007 + wall1 * f1 * 0.00006 + grain * 0.00005;
}

void shadeCream(vec3 p, vec3 base, float px, float airy, out vec3 alb, out float rough, out float h) {
  vec3 w = worley(p * (1300.0 - airy * 500.0));
  float bub = smoothstep(0.2 + airy * 0.08, 0.06, w.x) * step(0.55 - airy * 0.25, w.z) * fadeAt(px, 1300.0);
  float streak = vnoise(vec3((p.x + p.z) * 260.0, p.y * 5200.0, 3.0));
  alb = base * (0.965 + 0.05 * vnoise(p * 420.0) + 0.02 * streak) * (1.0 - bub * 0.22);
  rough = 0.48 + airy * 0.12;
  h = -bub * 0.00012 + (streak - 0.5) * 0.00003;
}

void shadeJam(vec3 p, vec3 base, float px, out vec3 alb, out float rough, out float h) {
  float v = vnoise(p * 300.0);
  vec3 w = worley(p * 2400.0);
  float seed = smoothstep(0.28, 0.12, w.x) * step(0.72, w.z) * fadeAt(px, 2400.0);
  alb = base * (0.75 + 0.5 * v);
  alb = mix(alb, vec3(0.55, 0.3, 0.05), seed * 0.7);
  rough = 0.2;
  h = seed * 0.00008 + v * 0.00004;
}

void shadeGloss(vec3 p, vec3 base, float px, float r, out vec3 alb, out float rough, out float h) {
  float v = vnoise(p * 260.0);
  alb = base * (0.92 + 0.14 * v);
  rough = r;
  h = v * 0.00003;
}

void shadeCheese(vec3 p, vec3 base, vec3 bakedCol, float yIn, float thick, float edge, float px,
                 out vec3 alb, out float rough, out float h) {
  float fine = vnoise(p * 2600.0) * fadeAt(px, 2600.0);
  vec3 w = worley(p * 900.0);
  float bub = smoothstep(0.16, 0.05, w.x) * step(0.8, w.z) * fadeAt(px, 900.0);
  float baked = max(smoothstep(0.006, 0.0, edge), smoothstep(0.004, 0.0, thick - yIn) * 0.8);
  alb = base * (0.95 + 0.08 * fine);
  alb = mix(alb, bakedCol, baked * 0.85);
  alb *= 1.0 - bub * 0.2;
  rough = 0.55;
  h = -bub * 0.00015 + fine * 0.00002;
}

void shadeCrumbly(vec3 p, vec3 a, vec3 b, float px, float scale, out vec3 alb, out float rough, out float h) {
  vec3 w = worley(p * scale);
  float crack = smoothstep(0.08, 0.0, w.y - w.x) * fadeAt(px, scale);
  vec3 c = mix(a, b, w.z);
  c *= 0.85 + 0.3 * vnoise(p * scale * 3.1);
  alb = mix(c, b * 0.45, crack * 0.8);
  rough = 0.85;
  h = (0.5 - w.x) * 0.0004 * fadeAt(px, scale) - crack * 0.0002;
}

void shadeIceCream(vec3 p, vec3 base, vec3 fruit, float px, out vec3 alb, out float rough, out float h) {
  float crystal = smoothstep(0.72, 0.9, vnoise(p * 3400.0)) * fadeAt(px, 3400.0);
  vec3 w = worley(p * 1100.0);
  float pit = smoothstep(0.2, 0.06, w.x) * step(0.6, w.z) * fadeAt(px, 1100.0);
  alb = base * (0.95 + 0.07 * vnoise(p * 500.0)) * (1.0 - pit * 0.25);
  rough = mix(0.42, 0.18, crystal);
  h = -pit * 0.0002 + crystal * 0.00003;
  if (distance(base, fruit) > 0.05) {
    vec3 f = worley(p * 320.0 + 7.7);
    float bit = smoothstep(0.34, 0.26, f.x) * step(0.55, f.z);
    alb = mix(alb, fruit * (0.8 + 0.3 * vnoise(p * 900.0)), bit);
    rough = mix(rough, 0.3, bit);
  }
}

void shadeInclusions(vec3 p, vec3 cream, vec3 fruit, float px, float slices, out vec3 alb, out float rough, out float h) {
  shadeCream(p, cream, px, 0.8, alb, rough, h);
  // fruit pieces laid in the cream: sliced strawberries (wide, flat, a pale
  // heart and seeds at the rim) or cherry halves (round, dark and glossy)
  vec3 q = slices > 0.5 ? vec3(p.x * 42.0, p.y * 100.0, p.z * 42.0) : vec3(p.x, p.y * 1.2, p.z) * 52.0;
  vec3 w = worley(q + 3.3);
  float keep = step(slices > 0.5 ? 0.3 : 0.4, w.z);
  // a round piece in each kept cell, its size varying with the cell
  float rad = (slices > 0.5 ? 0.42 : 0.36) + 0.08 * fract(w.z * 13.7);
  float edgeD = rad - w.x; // > 0 inside the piece
  float aa = max(px * 50.0, 0.015);
  float body = smoothstep(-aa, aa, edgeD) * keep;
  float halo = smoothstep(-0.12, 0.0, edgeD) * keep;
  vec3 juice = mix(cream, fruit, 0.3);
  alb = mix(alb, juice, (halo - body) * 0.6);
  float core = smoothstep(0.05, rad, edgeD);
  vec3 fc;
  if (slices > 0.5) {
    vec3 flesh = mix(fruit, vec3(1.0, 0.72, 0.7), 0.55);
    fc = mix(fruit * 0.95, flesh, core);
    // pale threads running to the heart
    float threads = smoothstep(0.8, 0.95, vnoise(vec3(q.xy * 3.0, w.z * 40.0)));
    fc = mix(fc, vec3(1.0, 0.86, 0.84), threads * core * 0.5);
    vec3 sw = worley(p * 1500.0);
    float seed = smoothstep(0.22, 0.1, sw.x) * step(0.6, sw.z) * smoothstep(0.08, 0.03, edgeD) * fadeAt(px, 1500.0);
    fc = mix(fc, vec3(0.95, 0.8, 0.35), seed * 0.8);
  } else {
    fc = fruit * (0.75 + 0.4 * core + 0.2 * vnoise(p * 600.0));
    fc = mix(fc, fruit * 0.5, smoothstep(0.08, 0.0, edgeD));
  }
  alb = mix(alb, fc, body);
  rough = mix(rough, slices > 0.5 ? 0.3 : 0.16, body);
  h += body * (0.00015 + 0.0002 * core);
}

void shadeLayer(float kind, vec3 p, vec3 a, vec3 b, float yIn, float thick, float edge, float px,
                out vec3 alb, out float rough, out float h) {
  if (kind < 0.5) shadeSponge(p, a, b, yIn, thick, edge, px, alb, rough, h);
  else if (kind < 1.5) shadeCream(p, a, px, 0.0, alb, rough, h);
  else if (kind < 2.5) shadeJam(p, a, px, alb, rough, h);
  else if (kind < 3.5) shadeGloss(p, a, px, 0.3, alb, rough, h);
  else if (kind < 4.5) shadeCheese(p, a, b, yIn, thick, edge, px, alb, rough, h);
  else if (kind < 5.5) shadeCrumbly(p, a, b, px, 700.0, alb, rough, h);
  else if (kind < 6.5) shadeIceCream(p, a, b, px, alb, rough, h);
  else if (kind < 7.5) shadeCrumbly(p, a, b, px, 900.0, alb, rough, h);
  else if (kind < 8.5) shadeInclusions(p, a, b, px, 0.0, alb, rough, h);
  else if (kind < 9.5) shadeCream(p, a, px, 1.0, alb, rough, h);
  else if (kind < 10.5) shadeGloss(p, a, px, 0.42, alb, rough, h);
  else if (kind < 11.5) shadeInclusions(p, a, b, px, 1.0, alb, rough, h);
  else if (kind < 12.5) shadeGloss(p, a, px, 0.22, alb, rough, h);
  else shadeGloss(p, a, px, 0.32, alb, rough, h);
}

// The coat seen in cross-section on a cut face.
void shadeCoatSection(float kind, vec3 c, vec3 p, float depth, float px, out vec3 alb, out float rough, out float h) {
  if (kind > 0.5 && kind < 1.5) shadeGloss(p, c, px, 0.25, alb, rough, h);
  else if (kind > 2.5 && kind < 3.5) shadeGloss(p, c, px, 0.42, alb, rough, h);
  else if (kind > 3.5 && kind < 4.5) shadeJam(p, c, px, alb, rough, h);
  else if (kind > 5.5 && kind < 6.5) {
    shadeCream(p, c, px, 0.7, alb, rough, h);
    // chocolate shavings pressed into the outer millimetres
    vec3 w = worley(p * 700.0);
    float s = smoothstep(0.5, 0.3, w.x) * smoothstep(0.0025, 0.0, depth);
    alb = mix(alb, vec3(0.16, 0.07, 0.035) * (0.8 + 0.4 * w.z), s);
  } else shadeCream(p, c, px, kind > 1.5 && kind < 2.5 ? 0.8 : 0.1, alb, rough, h);
}
`;

const INTERIOR_GLSL = /* glsl */ `
attribute vec3 aCut;
varying vec3 vCut;
void cakeInterior(vec3 p, float px, out vec3 alb, out float rough, out float h) {
  float y = p.y - uTierBase;
  float edge = -shapeSdf(p.xz);
  float wob = vnoise(vec3(p.xz * 70.0, uSeed)) - 0.5;
  float wob2 = vnoise(vec3(p.xz * 17.0, uSeed + 5.0)) - 0.5;
  float sideT = uSide.y * (1.0 + 0.6 * wob);
  float topT = uTop.y * (1.0 + 0.5 * wob2);
  if (edge < sideT) { shadeCoatSection(uSide.x, uSideCol, p, edge, px, alb, rough, h); return; }
  if (edge < sideT + uSide.z) { shadeCream(p, uSideUnder, px, 0.1, alb, rough, h); return; }
  if (y > uTierH - topT) { shadeCoatSection(uTop.x, uTopCol, p, uTierH - y, px, alb, rough, h); return; }
  if (y > uTierH - topT - uTop.z) { shadeCream(p, uTopUnder, px, 0.1, alb, rough, h); return; }
  // fillings are never perfectly level
  float yl = y + wob * 0.0018 + wob2 * 0.0024;
  int idx = uLayers - 1;
  for (int i = 0; i < MAXL; i++) {
    if (i >= uLayers) break;
    if (yl < uLayerTop[i]) { idx = i; break; }
  }
  float lo = idx > 0 ? uLayerTop[idx - 1] : 0.0;
  float hi = uLayerTop[idx];
  vec3 a = uLayerA[idx];
  vec3 b = uLayerB[idx];
  float kind = uLayerKind[idx];
  if (uPattern > 0.5 && kind < 0.5) {
    // checkerboard: concentric rings that swap colours from layer to layer
    float ring = floor(length(p.xz) / (uShape.y / 3.0) + wob * 0.12);
    bool dark = mod(ring + float(idx / 2), 2.0) > 0.5;
    vec3 c = dark ? b : a;
    shadeSponge(p, c, c * 0.62, yl - lo, hi - lo, edge - sideT - uSide.z, px, alb, rough, h);
    return;
  }
  shadeLayer(kind, p, a, b, yl - lo, hi - lo, edge - sideT - uSide.z, px, alb, rough, h);
}
`;

// Shared patching: cake-space position and normal into the fragment shader,
// the slit test, and albedo, roughness and bump from the cake function.
function patch(material, uniforms, { vertexDecl = '', vertexBody = '', fragmentDecl, call }) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCake;\nvarying vec3 vCakeN;\n${vertexDecl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvCake = position;\nvCakeN = objectNormal;\n${vertexBody}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}\n${PERTURB}\n${SLIT}\n${SHAPE}\n${TIER_DECL}\n${LAYERS_GLSL}\n${fragmentDecl}`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
slitDiscard(vCake);
float cPx = length(fwidth(vCake));
vec3 cAlb;
float cRough;
float cH;
${call}
diffuseColor.rgb = cAlb;`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cRough;')
      .replace('#include <normal_fragment_maps>', 'normal = cakeBump(-vViewPosition, normal, cH, faceDirection);');
  };
  material.customProgramCacheKey = () => `cake-${call.length}-${fragmentDecl.length}`;
}

export function createInteriorMaterial(uniforms) {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.9, sheen: 0.15, sheenRoughness: 0.8, sheenColor: new THREE.Color(0.4, 0.35, 0.3) });
  patch(m, uniforms, {
    vertexDecl: 'attribute vec3 aCut;\nvarying vec3 vCut;',
    vertexBody: 'vCut = aCut;',
    fragmentDecl: INTERIOR_GLSL.replace('attribute vec3 aCut;\n', ''),
    call: /* glsl */ `
cakeInterior(vCake, cPx, cAlb, cRough, cH);
// knife marks: a serrated blade leaves fine horizontal grooves, a dirty
// blade drags streaks of frosting down the face
float rough01 = vCut.x;
if (rough01 > 0.01) {
  float g = sin(vCake.y * 2400.0 + vnoise(vec3((vCake.x + vCake.z) * 120.0, vCake.y * 300.0, vCut.z)) * 6.0);
  cH += g * 0.00007 * rough01;
  cH += (vnoise(vCake * 900.0) - 0.5) * 0.00025 * rough01;
}
if (vCut.y > 0.01) {
  float y = vCake.y - uTierBase;
  float along = (vCake.x + vCake.z) * 90.0 + vCut.z * 3.1;
  float streak = smoothstep(0.55, 0.8, vnoise(vec3(along, 0.5, vCut.z))) * smoothstep(uTierH * (1.0 - 0.7 * vCut.y), uTierH, y + vnoise(vec3(along * 3.0, 1.0, 2.0)) * 0.02);
  cAlb = mix(cAlb, uTopUnder, streak * min(1.0, vCut.y * 1.4));
  cRough = mix(cRough, 0.45, streak);
}`,
  });
  return m;
}

const EXTERIOR_GLSL = /* glsl */ `
// how far a ganache drip runs down the side at this angle
float dripLength(float ang) {
  // runs of ganache: a narrow column ending in a rounder bead, a few stubs,
  // joined to the rim by a thin wavy band
  float n = 20.0;
  float cellM = 6.2831853 * uDrip.z / n;
  float u = (ang / 6.2831853 + 0.5) * n + uSeed;
  float cell = floor(u);
  float ext = 0.0;
  for (int k = -1; k <= 1; k++) {
    float c = mod(cell + float(k), n);
    float r = fract(sin(c * 91.7 + uSeed) * 4375.85);
    float r2 = fract(sin(c * 17.3 + 3.1) * 2375.13);
    float r3 = fract(sin(c * 47.9 + 1.7) * 1531.77);
    float w = (0.1 + 0.07 * r2) * cellM;
    float x = abs(u - (cell + float(k) + 0.5 + (r2 - 0.5) * 0.4)) * cellM;
    float len = uDrip.y * (0.35 + 0.65 * r);
    if (r3 < 0.15) len *= 0.35;
    float bead = w * 1.12;
    float body = x < w * 0.8 ? len - bead : -1.0;
    float cap = x < bead ? len - bead + sqrt(bead * bead - x * x) : -1.0;
    float col = max(body, cap);
    // fillet where the column meets the band
    float flare = 0.006 + 0.004 * exp(-pow(max(0.0, x - w * 0.8) / (w * 0.9), 2.0));
    ext = max(ext, max(col, flare));
  }
  float band = 0.0045 + 0.0015 * sin(ang * 37.0 + uSeed) + 0.001 * sin(ang * 83.0);
  return max(ext, band);
}

void shadeTop(vec3 p, float px, float edge, out vec3 alb, out float rough, out float h) {
  float kind = uTop.x;
  float r = length(p.xz);
  float ang = atan(p.z, p.x);
  if (kind < 0.5) {
    float ridges = sin(r * 950.0 + vnoise(vec3(ang * 2.0, r * 30.0, uSeed)) * 9.0);
    float patchy = smoothstep(0.35, 0.8, vnoise(vec3(ang * 3.0, r * 25.0, uSeed + 3.0)));
    alb = uTopCol * (0.975 + 0.04 * vnoise(p * 300.0));
    rough = 0.55;
    h = ridges * patchy * 0.00004 + (vnoise(p * 900.0) - 0.5) * 0.00003;
  } else if (kind < 1.5) {
    alb = uTopCol * (0.95 + 0.08 * vnoise(p * 120.0));
    rough = 0.14;
    h = vnoise(p * 70.0) * 0.00035;
  } else if (kind < 2.5) {
    float f = fbm(vec3(p.xz * 55.0, uSeed));
    float swoosh = sin(ang * 3.0 + r * 160.0 + f * 7.0);
    alb = uTopCol * (0.97 + 0.04 * f);
    rough = 0.6;
    h = (f - 0.5) * 0.001 + swoosh * 0.00012;
  } else if (kind < 3.5) {
    alb = uTopCol * (0.985 + 0.02 * vnoise(p * 200.0));
    rough = 0.4;
    h = vnoise(p * 1500.0) * 0.000015;
  } else if (kind < 4.5) {
    float v = vnoise(p * 110.0);
    vec3 w = worley(p * 260.0);
    float bit = smoothstep(0.3, 0.2, w.x) * step(0.7, w.z);
    alb = uTopCol * (0.7 + 0.45 * v);
    alb = mix(alb, uTopCol * 1.35, bit);
    rough = 0.1;
    h = v * 0.0003 + bit * 0.0005;
  } else {
    float v = fbm(p * 90.0);
    alb = mix(uTopCol, uTopCol * 0.72, v);
    rough = 0.7;
    h = v * 0.0002;
  }
  // a piped message
  if (uMsgOpt.x > 0.5) {
    vec2 muv = vec2(0.5 + (p.x - uMsgBox.x) / uMsgBox.z, 0.5 - (p.z - uMsgBox.y) / uMsgBox.w);
    // sample everywhere (a sample inside a branch has no mip level at the
    // edges), then keep only what falls in the box
    vec4 m = texture2D(uMsg, clamp(muv, 0.0, 1.0));
    m *= step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
    float line = smoothstep(0.3, 0.7, m.r);
    float dome = clamp(m.g, 0.0, 1.0);
    alb = mix(alb, uMsgCol * (0.95 + 0.06 * vnoise(p * 900.0)), line);
    rough = mix(rough, 0.32, line);
    h += 0.0011 * dome;
  }
  // rounded rim: the surface falls away over the last few millimetres
  float bev = kind > 0.5 && kind < 1.5 ? 0.006 : 0.004;
  float k = max(0.0, bev - edge);
  h -= 0.55 * k * k / bev;
}

void shadeSide(vec3 p, float px, float y, out vec3 alb, out float rough, out float h) {
  float kind = uSide.x;
  float ang = atan(p.z, p.x);
  vec3 c = uSideCol;
  if (kind < 0.5) {
    float lines = sin(y * 1700.0 + vnoise(vec3(ang * 3.0, y * 90.0, uSeed)) * 9.0);
    float strokes = smoothstep(0.45, 0.85, vnoise(vec3(ang * 4.0, y * 25.0, uSeed + 9.0)));
    alb = c * (0.97 + 0.05 * vnoise(p * 260.0));
    rough = 0.5 + 0.1 * vnoise(p * 90.0);
    h = lines * 0.000018 * strokes + (vnoise(vec3(ang * 14.0, y * 160.0, uSeed + 2.0)) - 0.5) * 0.00012;
  } else if (kind < 1.5) {
    alb = c;
    rough = 0.15;
    h = vnoise(p * 80.0) * 0.0003;
  } else if (kind < 2.5) {
    float f = fbm(vec3(ang * 7.0, y * 90.0, uSeed));
    alb = c * (0.97 + 0.04 * f);
    rough = 0.6;
    h = (f - 0.5) * 0.0009;
  } else if (kind < 3.5) {
    alb = c * (0.985 + 0.02 * vnoise(p * 200.0));
    rough = 0.4;
    h = vnoise(p * 1500.0) * 0.000015;
  } else if (kind < 5.5) {
    // baked cheesecake: golden, mottled, darker near the top
    float v = fbm(p * 120.0);
    alb = mix(c * 1.12, c * 0.62, v * 0.8 + smoothstep(uTierH - 0.012, uTierH, y) * 0.35);
    rough = 0.72;
    h = v * 0.00025;
  } else if (kind < 6.5) {
    // chocolate shavings pressed on all round: two layers of curled
    // flakes overlapping on a bed of fine chocolate crumbs
    float arc = ang * uShape.y;
    vec3 base = vec3(0.1, 0.05, 0.028) * (0.8 + 0.4 * vnoise(p * 2000.0));
    alb = base;
    rough = 0.75;
    h = 0.0002 * vnoise(p * 1500.0);
    for (int L = 0; L < 2; L++) {
      float fl = float(L);
      vec3 q = vec3(arc * 200.0, y * 170.0, uSeed * 3.0 + fl * 11.0) + fl * 0.5;
      q.xy += (vec2(vnoise(q * 0.8), vnoise(q * 0.8 + 5.0)) - 0.5) * 0.8;
      vec3 w = worley(q);
      float rad = 0.5 + 0.15 * fract(w.z * 7.1);
      float inside = rad - w.x;
      float flake = smoothstep(-0.03, 0.03, inside);
      float curl = sin(inside * 10.0 + w.z * 6.0);
      vec3 choc = mix(vec3(0.17, 0.08, 0.04), vec3(0.4, 0.22, 0.11), fract(w.z * 5.3));
      choc *= 0.78 + 0.32 * curl;
      // the upper flakes cast a soft shadow onto the lower ones
      alb *= 1.0 - 0.35 * smoothstep(0.12, 0.0, abs(inside)) * step(inside, 0.0) * fl;
      alb = mix(alb, choc, flake);
      rough = mix(rough, 0.42, flake);
      h = mix(h, 0.0006 + fl * 0.0004 + curl * 0.00012, flake);
    }
  } else {
    // semi-naked: cream scraped thin and streaky round the sides, heavier
    // over the fillings, with the sponge's crust glowing through
    float yl = y + (vnoise(vec3(p.xz * 70.0, uSeed)) - 0.5) * 0.0018;
    int idx = uLayers - 1;
    for (int i = 0; i < MAXL; i++) {
      if (i >= uLayers) break;
      if (yl < uLayerTop[i]) { idx = i; break; }
    }
    float yb = idx > 0 ? uLayerTop[idx - 1] : 0.0;
    float dEdge = min(yl - yb, uLayerTop[idx] - yl);
    float isSponge = uLayerKind[idx] < 0.5 ? 1.0 : 0.0;
    float arc = ang * uShape.y;
    float streak = fbm(vec3(arc * 28.0, y * 330.0, uSeed)) * 0.7 + vnoise(vec3(arc * 9.0, y * 60.0, uSeed + 4.0)) * 0.3;
    float thin = streak + 0.45 * smoothstep(0.007, 0.0, dEdge) - 0.06;
    float cover = smoothstep(0.34, 0.62, thin);
    cover = max(cover, 1.0 - isSponge);
    cover = max(cover, smoothstep(uTierH - 0.008, uTierH - 0.002, y));
    vec3 sponge = mix(uLayerB[idx], uLayerA[idx], 0.35 + 0.3 * vnoise(p * 600.0));
    vec3 w = worley(p * 650.0);
    float pore = smoothstep(0.35, 0.1, w.x) * fadeAt(px, 650.0);
    sponge *= 1.0 - pore * 0.35;
    // a veil of cream: the sponge tints it where it is thinnest
    vec3 veil = mix(sponge, c, 0.55);
    vec3 cream = c * (0.97 + 0.04 * vnoise(p * 300.0));
    alb = mix(mix(sponge, veil, smoothstep(0.0, 0.5, cover)), cream, smoothstep(0.5, 1.0, cover));
    rough = mix(0.85, 0.5, cover);
    h = cover * 0.0004 - (1.0 - cover) * pore * 0.0002 + (streak - 0.5) * 0.00015;
  }
  // satin ribbon round the base
  if (uBand.x > 0.5 && y < uBand.y) {
    float weave = sin(y * 9000.0) * 0.5 + 0.5;
    alb = uBandCol * (0.9 + 0.12 * weave);
    rough = 0.32;
    h = 0.0006 + weave * 0.00001;
  }
  // ganache drip from the top
  if (uDrip.x > 0.5) {
    float len = dripLength(ang);
    // distance to the drip's edge, from its slope round the side
    float da = 0.0015 / max(uDrip.z, 0.01);
    float slope = (dripLength(ang + da) - dripLength(ang - da)) / 0.003;
    float d = (y - (uTierH - len)) / sqrt(1.0 + slope * slope);
    float cover = smoothstep(-px, px, d);
    if (cover > 0.0) {
      alb = mix(alb, uDripCol * (0.95 + 0.08 * vnoise(p * 150.0)), cover);
      rough = mix(rough, 0.12, cover);
      float t = clamp(d / 0.0035, 0.0, 1.0);
      h = mix(h, 0.0011 * sqrt(t * (2.0 - t)) + 0.0002, cover);
    }
  }
  // rounded top edge
  float bev = uDrip.x > 0.5 ? 0.006 : 0.004;
  float k = max(0.0, bev - (uTierH - y));
  h -= 0.55 * k * k / bev;
  // contact darkening at the foot of the tier
  alb *= mix(0.72, 1.0, smoothstep(0.0, 0.012, y));
}

void cakeExterior(vec3 p, vec3 n, float px, out vec3 alb, out float rough, out float h) {
  float y = p.y - uTierBase;
  if (n.y > 0.5) shadeTop(p, px, -shapeSdf(p.xz), alb, rough, h);
  else shadeSide(p, px, y, alb, rough, h);
}
`;

export function createExteriorMaterial(uniforms) {
  const m = new THREE.MeshPhysicalMaterial({
    roughness: 0.55,
    sheen: 0.12,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0.35, 0.3, 0.28),
  });
  patch(m, uniforms, {
    fragmentDecl: EXTERIOR_GLSL,
    call: 'cakeExterior(vCake, normalize(vCakeN), cPx, cAlb, cRough, cH);',
  });
  return m;
}
