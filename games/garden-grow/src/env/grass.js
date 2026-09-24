// The lawn: tens of thousands of instanced grass blades in one draw call,
// over a ground that looks like grass on its own (thatch in the shade under
// the blades, a baked lawn texture where the blades thin out far away).
// Blades are curved and tapered, sway with the shared breeze, darken at the
// root, and glow when the low sun shines through them from behind.
import * as THREE from 'three';
import { inZone } from '../layout.js';
import { mulberry32, smooth, lerp } from '../config.js';
import { wind, WIND_GLSL } from '../shared.js';
import { NOISE_GLSL, WET_GLSL } from './groundglsl.js';
import { LAWN_TILE } from './lawnmaps.js';

// ------------------------------------------------------------ where grass grows

// How densely blades grow at (x, z), 0..1: thickest on the lawn the camera
// sees round the bed, thinner further out, sparse behind the fence.
export function lawnDensity(layout, x, z) {
  const [tx, , tz] = layout.camera.target;
  const dz = z - tz;
  // the part of the lawn in view: a wedge widening away from the camera
  const half = lerp(1.45, 3.1, smooth(-2.1, 2.6, -dz));
  const ex = Math.max(0, Math.abs(x - tx) - half);
  const ez = Math.max(0, dz - 2.1, -2.6 - dz);
  const core = 1 - smooth(0, 0.9, Math.hypot(ex, ez));
  const far = Math.hypot((x - tx) / 6, dz > 0 ? dz / 5.5 : dz / 4);
  // a little more in front, which tall phones see as the camera pulls back
  let rho = Math.max(core, (dz > 0 ? 0.16 : 0.09) * (1 - smooth(0.7, 1.15, far)));
  const f = layout.fence;
  if (f && z < f.z - 0.05) rho *= f.kind === 'panel' ? 0 : 0.3;
  return rho;
}

// 0 where no grass may grow (soil, pots, planters, gravel, stones, fence,
// the can/basket/vase spots), else a height factor (blades are trimmed
// shorter right at an edge).
export function lawnClearance(layout, x, z) {
  const L = layout.lawn;
  if (!L || x < L.x0 || x > L.x1 || z < L.z0 || z > L.z1) return 0;
  let k = 1;
  for (const zone of layout.zones) {
    if (zone.container === 'border') {
      if (inZone(zone, x, z, -0.02)) return 0;
      if (inZone(zone, x, z, -0.07)) k = Math.min(k, 0.6);
    } else if (zone.shape === 'circle') {
      const d = Math.hypot(x - zone.cx, z - zone.cz) - zone.r;
      if (d < 0.08) return 0;
      if (d < 0.12) k = Math.min(k, 0.7);
    } else {
      const d = Math.max(Math.abs(x - zone.cx) - zone.w / 2, Math.abs(z - zone.cz) - zone.d / 2);
      if (d < 0.08) return 0;
      if (d < 0.12) k = Math.min(k, 0.7);
    }
  }
  const g = layout.gravel;
  if (g && x > g.x0 - 0.03 && x < g.x1 + 0.03 && z > g.z0 - 0.03 && z < g.z1 + 0.03) return 0;
  // stepping stones (~0.35-0.4 m slabs): clear, allowing for blades leaning in
  for (const [sx, sz] of layout.stones ?? []) {
    const d = Math.hypot(x - sx, z - sz);
    if (d < 0.24) return 0;
    if (d < 0.29) k = Math.min(k, 0.6);
  }
  const f = layout.fence;
  if (f && Math.abs(z - f.z) < 0.06 && x > f.x0 - 0.1 && x < f.x1 + 0.1) return 0;
  // the can, basket and vase spots: short, flattened grass (hidden inside
  // whatever stands there, and no bald patch when it is away)
  for (const spot of [layout.canRest, layout.basket, layout.vase]) {
    if (!spot) continue;
    const d = Math.hypot(x - spot[0], z - spot[2]);
    if (d < 0.22) k = Math.min(k, 0.28);
    else if (d < 0.3) k = Math.min(k, lerp(0.28, 1, (d - 0.22) / 0.08));
  }
  return k;
}

// A few patches of clover in the lawn (the grass is thinner and a little
// shorter there, so the leaves show).
export function cloverPatches(layout) {
  if (!layout.lawn) return [];
  const rnd = mulberry32(layout.name.length * 71 + 5);
  const out = [];
  for (let tries = 0; out.length < 7 && tries < 600; tries++) {
    const x = -2.7 + rnd() * 5.4;
    const z = -2.3 + rnd() * 3.9;
    const r = 0.1 + rnd() * 0.18;
    if (lawnDensity(layout, x, z) < 0.85 || out.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 0.35)) continue;
    let ok = lawnClearance(layout, x, z) >= 1;
    for (let k = 0; ok && k < 8; k++) ok = lawnClearance(layout, x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r) >= 1;
    if (ok) out.push({ x, z, r });
  }
  return out;
}

// ------------------------------------------------------------ blade geometry

// One blade: pairs of vertices up its length (a mown blade ends square, a
// fresh one comes to a point: the shader narrows the top pair to nothing).
// position.x is the side (-0.5..0.5), position.y how far up (0..1).
function bladeGeometry(rows) {
  const ts = rows === 5 ? [0, 0.22, 0.45, 0.66, 0.84, 1] : [0, 0.4, 0.75, 1];
  const pos = [];
  for (const t of ts) pos.push(-0.5, t, 0, 0.5, t, 0);
  const idx = [];
  for (let r = 0; r < ts.length - 1; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0), 3));
  geo.setIndex(idx);
  return geo;
}

// ------------------------------------------------------------ blade material

const BLADE_VERT_DECL = /* glsl */ `
${WIND_GLSL}
attribute vec4 aBladeA; // root x, root z, facing, height
attribute vec4 aBladeB; // width, lean, seed, dry tip
uniform float uWidthK;
uniform float uPixel;
varying vec3 vGCol;
varying vec3 vGW;
varying float vGT;
varying float vGSide;
`;

// Replaces beginnormal_vertex: builds the whole blade, so begin_vertex can
// just use gPos.
const BLADE_VERT = /* glsl */ `
float gT = position.y;
float gSide = position.x;
float gH = aBladeA.w;
vec2 gF = vec2(cos(aBladeA.z), sin(aBladeA.z));
vec3 gS0 = vec3(-gF.y, 0.0, gF.x);
vec3 gRoot = vec3(aBladeA.x, 0.0, aBladeA.y);
float gPh = aBladeB.z * 43.0;
vec2 gSway = windSway(gRoot + vec3(0.0, gH, 0.0), 1.0) * 0.5 * (gH / 0.09);
// blades twist a little as they rise
float gTw = (fract(aBladeB.z * 5.13) - 0.5) * 1.4 * position.y;
vec3 gS3 = gS0 * cos(gTw) + vec3(gF.x, 0.0, gF.y) * sin(gTw);
gSway += (gS0.xz * sin(uTime * 3.7 + gPh) * 0.0035 + gF * sin(uTime * 2.3 + gPh * 1.7) * 0.0025) * uWindStrength;
// the centreline rises and arcs over, keeping roughly its length
vec2 gTipOff = gF * aBladeB.y * gH + gSway;
float gTipY = sqrt(max(gH * gH - dot(gTipOff, gTipOff) * 0.85, gH * gH * 0.2));
// some blades lean straight from the root, others arch over
float gArc = mix(0.25, 1.0, fract(aBladeB.z * 7.31));
float gBendT = mix(gT, gT * gT, gArc);
vec3 gC = gRoot + vec3(gTipOff.x * gBendT, gTipY * gT, gTipOff.y * gBendT);
float gDB = mix(1.0, 2.0 * gT, gArc);
vec3 gTan = normalize(vec3(gTipOff.x * gDB, gTipY, gTipOff.y * gDB));
vec3 gN = normalize(cross(gS3, gTan));
gN = normalize(gN + gS3 * gSide * 1.3);
objectNormal = gN;
// tapered width, never thinner than about a pixel (no shimmer far away);
// about half the blades were cut square by the mower
float gCut = step(0.5, fract(aBladeB.z * 3.71)) * mix(0.45, 0.7, fract(aBladeB.z * 11.3));
float gW = aBladeB.x * uWidthK * (1.0 - pow(gT, 1.3) * (1.0 - gCut));
float gDist = distance((modelMatrix * vec4(gC, 1.0)).xyz, cameraPosition);
gW = max(gW, gDist * uPixel * 0.9);
vec3 gPos = gC + gS3 * gSide * gW;
// colour: young bright green to older yellow-green, patchy across the lawn,
// the odd dry straw-coloured tip
float gSeed = aBladeB.z;
vec3 gc = mix(vec3(0.062, 0.19, 0.026), vec3(0.15, 0.2, 0.04), smoothstep(0.25, 0.95, gSeed));
gc *= 0.78 + 0.44 * ggNoise(gRoot.xz * 0.8 + 3.0);
gc = mix(gc, gc * vec3(1.18, 1.0, 0.7), smoothstep(0.55, 0.85, ggNoise(gRoot.xz * 0.23)));
gc = mix(gc, vec3(0.34, 0.28, 0.13), max(aBladeB.w * smoothstep(0.5, 1.0, gT), step(0.01, gCut) * smoothstep(0.9, 1.0, gT) * 0.6));
vGCol = gc;
vGT = gT;
vGSide = gSide;
vGW = (modelMatrix * vec4(gPos, 1.0)).xyz;
`;

const BLADE_FRAG_DECL = /* glsl */ `
${NOISE_GLSL}
${WET_GLSL}
varying vec3 vGCol;
varying vec3 vGW;
varying float vGT;
varying float vGSide;
float gAO;
float gRough;
`;

const BLADE_FRAG = /* glsl */ `
gAO = mix(0.16, 1.0, smoothstep(0.0, 0.8, vGT));
// fine parallel veins, only where the blade is wide enough on screen
float gVein = sin(vGSide * 31.4) * (1.0 - smoothstep(0.08, 0.3, fwidth(vGSide)));
vec3 gAlb = vGCol * (0.8 + 0.3 * vGT) * (1.0 + 0.1 * (1.0 - abs(vGSide) * 2.0)) * (1.0 + 0.07 * gVein);
vec2 gWet = wetAt(vGW.xz);
gAlb *= 1.0 - 0.35 * gWet.x;
diffuseColor.rgb = gAlb * mix(1.0, gAO, 0.55);
gTrans = gAlb * vec3(0.95, 1.2, 0.45) * gAO;
gRough = mix(0.62, 0.4, vGT);
gRough = mix(gRough, 0.22, gWet.y);
`;

// Light shining through the blade from behind: the golden-hour glow.
export const TRANSLUCENT = /* glsl */ `
vec3 gTrans = vec3(0.0);
void RE_Direct_Grass(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float back = saturate(-dot(geometryNormal, directLight.direction));
  float toward = pow(saturate(dot(-geometryViewDir, directLight.direction)), 3.0);
  reflectedLight.directDiffuse += directLight.color * gTrans * RECIPROCAL_PI * (0.35 * back + 1.6 * toward * (0.35 + 0.65 * back));
}
#undef RE_Direct
#define RE_Direct RE_Direct_Grass
`;

export function foliagePatch(s, { vertDecl, vertNormal, fragDecl, fragColor, translucent = true }) {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', `#include <common>\n${vertDecl}`)
    .replace('#include <beginnormal_vertex>', `vec3 objectNormal;\n${vertNormal}`)
    .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>\n${fragDecl}`)
    .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${translucent ? TRANSLUCENT : ''}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${fragColor}`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
    .replace(
      '#include <normal_fragment_maps>',
      // soften the blade normals towards the sky, so the lawn is evenly lit
      'normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), 0.3));',
    )
    .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gAO;\nreflectedLight.indirectSpecular *= gAO;');
}

function bladeMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, wind, uniforms);
    foliagePatch(s, { vertDecl: BLADE_VERT_DECL, vertNormal: BLADE_VERT, fragDecl: BLADE_FRAG_DECL, fragColor: BLADE_FRAG });
  };
  m.customProgramCacheKey = () => 'gg-blade';
  return m;
}

// ------------------------------------------------------------ the lawn ground

const LAWN_DECL = /* glsl */ `
${NOISE_GLSL}
${WET_GLSL}
uniform sampler2D uLawnMap;
uniform sampler2D uSoilA;
uniform sampler2D uDensity;
uniform vec4 uDensBox;
uniform float uGrassK;
uniform vec4 uBeds[2];
uniform vec3 uStones[4];
varying vec3 vLawnW;
float lRough;
`;

const LAWN_MAIN = /* glsl */ `
vec2 lxz = vLawnW.xz;
const mat2 LROT = mat2(0.6, 0.8, -0.8, 0.6);
vec4 l1 = texture2D(uLawnMap, lxz / ${LAWN_TILE.toFixed(3)});
vec4 l2 = texture2D(uLawnMap, LROT * lxz / ${LAWN_TILE.toFixed(3)} * 0.57 + vec2(0.4, 0.13));
float lmac = gNoise(lxz * 0.9) * 0.65 + gNoise(lxz * 2.3 + 4.1) * 0.35;
vec3 lawn = mix(l1.rgb, l2.rgb, smoothstep(-0.1, 0.1, l2.a - l1.a + (lmac - 0.5) * 0.9));
// broad patches: greener here, a little yellower there
float lp = gNoise(lxz * 0.35 + 11.0);
lawn *= mix(vec3(0.82, 0.95, 0.8), vec3(1.12, 1.04, 0.84), lp);
// in the shade under the blades the ground is dark thatch
float dens = texture2D(uDensity, (lxz - uDensBox.xy) * uDensBox.zw).r * uGrassK;
// (darker close by, where you look down between the blades into the shade)
vec3 lUnder = lawn * mix(vec3(0.3, 0.34, 0.25), vec3(0.55, 0.62, 0.45), smoothstep(0.8, 3.2, distance(vLawnW, cameraPosition)));
lUnder *= 0.8 + 0.4 * gNoise(lxz * 90.0);
vec3 lAlb = mix(lawn * 1.2, lUnder, dens);
// bare earth at the bed's edge and round the stepping stones
float lDirt = 0.0;
float ln = gNoise(lxz * 23.0) - 0.5;
for (int i = 0; i < 2; i++) {
  vec4 b = uBeds[i];
  if (b.z <= 0.0) continue;
  vec2 q = (lxz - b.xy) / b.zw;
  float k = length(q);
  float sd = (k - 1.0) * k / max(length(q / b.zw), 1e-4);
  lDirt = max(lDirt, smoothstep(0.09, 0.035, sd + ln * 0.035));
}
for (int i = 0; i < 4; i++) {
  vec3 st = uStones[i];
  if (st.z <= 0.0) continue;
  float d = length(lxz - st.xy) - st.z;
  lDirt = max(lDirt, smoothstep(0.035, 0.0, d + ln * 0.02) * 0.45);
}
if (lDirt > 0.001) lAlb = mix(lAlb, texture2D(uSoilA, lxz / 0.6).rgb * (0.85 + 0.3 * lmac), lDirt);
vec2 lWet = wetAt(lxz);
lAlb *= 1.0 - mix(0.2, 0.45, lDirt) * lWet.x;
diffuseColor.rgb = lAlb;
lRough = mix(0.88, 0.95, lDirt);
lRough = mix(lRough, 0.45, lWet.y * 0.7);
`;

function lawnMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLawnW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLawnW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${LAWN_DECL}`)
      .replace('#include <map_fragment>', LAWN_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = lRough;');
  };
  m.customProgramCacheKey = () => 'gg-lawn';
  return m;
}

// ------------------------------------------------------------ the lawn

const BUDGET = 90000; // blades at full density on the high tier

export class Lawn {
  constructor({ quality, uniforms, lawnMap, soilMaps }) {
    this.quality = quality;
    // density k (quality.grass on start, lowered by the frame governor)
    // shows BUDGET * k^1.4 blades: high ~90k, medium ~39k, low ~17k
    this.density = quality.grass ?? 1;
    this.total = Math.round(BUDGET * Math.pow(this.density, 1.4));
    this.rows = quality.tier === 'low' ? 3 : 5;
    this.group = new THREE.Group();
    this.bladeUniforms = {
      ...uniforms,
      uWidthK: { value: 1 },
      uPixel: { value: 0.001 },
    };
    this.bladeMat = bladeMaterial(this.bladeUniforms);
    this.densTex = null;
    this.groundUniforms = {
      ...uniforms,
      uLawnMap: { value: lawnMap },
      uSoilA: { value: soilMaps.a },
      uDensity: { value: null },
      uDensBox: { value: new THREE.Vector4() },
      uGrassK: { value: 1 },
      uBeds: { value: [new THREE.Vector4(), new THREE.Vector4()] },
      uStones: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
    };
    this.groundMat = lawnMaterial(this.groundUniforms);
    this.ground = null;
    this.blades = null;
  }

  build(layout, renderer) {
    this.clear();
    const L = layout.lawn;
    // the ground
    const geo = new THREE.PlaneGeometry(L.x1 - L.x0, L.z1 - L.z0);
    geo.rotateX(-Math.PI / 2);
    geo.translate((L.x0 + L.x1) / 2, 0, (L.z0 + L.z1) / 2);
    this.ground = new THREE.Mesh(geo, this.groundMat);
    this.ground.receiveShadow = true;
    this.ground.renderOrder = 1; // after the blades: only gaps get shaded
    this.ground.userData.surface = 'lawn';
    this.group.add(this.ground);
    this.buildDensity(layout);
    const beds = layout.zones.filter((z) => z.container === 'border').slice(0, 2);
    this.groundUniforms.uBeds.value.forEach((v, i) => (beds[i] ? v.set(beds[i].cx, beds[i].cz, beds[i].rx, beds[i].rz) : v.set(0, 0, 0, 0)));
    const stones = layout.stones ?? [];
    this.groundUniforms.uStones.value.forEach((v, i) => (stones[i] ? v.set(stones[i][0], stones[i][1], 0.19) : v.set(0, 0, 0)));
    this.buildBlades(layout, renderer);
  }

  // A coarse map of blade density for the ground shader.
  buildDensity(layout) {
    const L = layout.lawn;
    const w = 144;
    const h = Math.round((w * (L.z1 - L.z0)) / (L.x1 - L.x0));
    const data = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = L.x0 + ((i + 0.5) / w) * (L.x1 - L.x0);
        const z = L.z0 + ((j + 0.5) / h) * (L.z1 - L.z0);
        data[j * w + i] = Math.round(lawnDensity(layout, x, z) * 255);
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.densTex = tex;
    this.groundUniforms.uDensity.value = tex;
    this.groundUniforms.uDensBox.value.set(L.x0, L.z0, 1 / (L.x1 - L.x0), 1 / (L.z1 - L.z0));
  }

  buildBlades(layout, renderer) {
    const rnd = mulberry32(layout.name.length * 977 + 3);
    const L = layout.lawn;
    const n = this.total;
    const a = new Float32Array(n * 4);
    const b = new Float32Array(n * 4);
    const keys = new Float32Array(n);
    const order = new Uint32Array(n);
    let count = 0;
    // sample where density allows; the box covers every place grass may grow
    const x0 = Math.max(L.x0, -7);
    const x1 = Math.min(L.x1, 7);
    const z0 = Math.max(L.z0, -5.5);
    const z1 = L.z1;
    const clover = cloverPatches(layout);
    for (let tries = 0; count < n && tries < n * 60; tries++) {
      const x = x0 + rnd() * (x1 - x0);
      const z = z0 + rnd() * (z1 - z0);
      const rho = lawnDensity(layout, x, z);
      if (rnd() > rho) continue;
      let clear = lawnClearance(layout, x, z);
      if (clear <= 0) continue;
      const patch = clover.find((p) => Math.hypot(p.x - x, p.z - z) < p.r * 1.15);
      if (patch) {
        if (rnd() < 0.4) continue;
        clear *= 0.72;
      }
      const i = count * 4;
      // shorter where sparse, so outlying blades melt into the lawn texture
      const tall = (0.058 + 0.06 * rnd() ** 1.3) * lerp(0.45, 1, smooth(0.08, 0.6, rho));
      a[i] = x;
      a[i + 1] = z;
      a[i + 2] = rnd() * Math.PI * 2;
      a[i + 3] = tall * clear * (0.9 + 0.2 * rnd());
      b[i] = 0.003 + 0.0028 * rnd();
      b[i + 1] = 0.06 + 0.4 * rnd() ** 1.5;
      b[i + 2] = rnd();
      b[i + 3] = rnd() < 0.07 ? 0.5 + 0.5 * rnd() : 0;
      // thinning drops sparse outer blades first, then evenly
      keys[count] = rnd() * lerp(1.7, 1, rho);
      order[count] = count;
      count++;
    }
    // sort so the first N instances are the ones to keep at lower density;
    // within each eighth, nearest the camera first so the GPU can skip
    // hidden blades behind them
    const idx = Array.from(order.subarray(0, count)).sort((p, q) => keys[p] - keys[q]);
    const [cx, cy, cz] = layout.camera.pos;
    const dist = new Float32Array(count);
    for (let i = 0; i < count; i++) dist[i] = Math.hypot(a[i * 4] - cx, cy, a[i * 4 + 1] - cz);
    const B = 8;
    for (let k = 0; k < B; k++) {
      const s0 = Math.floor((k * count) / B);
      const s1 = Math.floor(((k + 1) * count) / B);
      const part = idx.slice(s0, s1).sort((p, q) => dist[p] - dist[q]);
      for (let i = 0; i < part.length; i++) idx[s0 + i] = part[i];
    }
    const sa = new Float32Array(count * 4);
    const sb = new Float32Array(count * 4);
    idx.forEach((src, dst) => {
      sa.set(a.subarray(src * 4, src * 4 + 4), dst * 4);
      sb.set(b.subarray(src * 4, src * 4 + 4), dst * 4);
    });
    const geo = bladeGeometry(this.rows);
    geo.setAttribute('aBladeA', new THREE.InstancedBufferAttribute(sa, 4));
    geo.setAttribute('aBladeB', new THREE.InstancedBufferAttribute(sb, 4));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 20);
    this.count = count;
    const mesh = new THREE.Mesh(geo, this.bladeMat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.renderOrder = -1;
    const u = this.bladeUniforms;
    const size = new THREE.Vector2();
    mesh.onBeforeRender = (r, scene, camera) => {
      // metres per pixel at 1 m, for the minimum blade width
      const rt = r.getRenderTarget();
      const hpx = rt ? rt.height : r.getDrawingBufferSize(size).y;
      u.uPixel.value = camera.isPerspectiveCamera ? (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (hpx * camera.zoom) : 0;
    };
    this.blades = mesh;
    this.group.add(mesh);
    this.setDensity(this.density);
  }

  setDensity(k) {
    this.density = Math.min(1, Math.max(0, k));
    if (!this.blades) return;
    const n = Math.min(this.count, Math.round(BUDGET * Math.pow(this.density, 1.4)));
    this.blades.geometry.instanceCount = n;
    this.blades.visible = n > 0;
    // fewer blades each get a little wider so the lawn still looks full
    const f = n / BUDGET;
    this.bladeUniforms.uWidthK.value = 1 + 0.5 * (1 - Math.sqrt(f));
    this.groundUniforms.uGrassK.value = Math.pow(f, 0.5);
  }

  clear() {
    for (const obj of [...this.group.children]) {
      this.group.remove(obj);
      obj.geometry?.dispose();
    }
    this.densTex?.dispose();
    this.densTex = null;
    this.ground = null;
    this.blades = null;
  }

  dispose() {
    this.clear();
    this.bladeMat.dispose();
    this.groundMat.dispose();
  }
}
