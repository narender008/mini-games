// The two other ground surfaces: a pea-gravel patch round the raised
// planters (baked stone map plus instanced pebbles near the camera) and the
// balcony's weathered wooden decking (boards, gaps, screws and grain drawn
// procedurally in world space, so they stay sharp however close you look).
// Both darken and shine where the wet map says water fell.
import * as THREE from 'three';
import { mulberry32 } from '../config.js';
import { NOISE_GLSL, WET_GLSL, BAKE_GLSL } from './groundglsl.js';
import { bakeTexture } from './bake.js';
import { rockGeometry } from './rocks.js';
import { lumpMaterial } from './soil.js';

// ------------------------------------------------------------ gravel

const GRAVEL_TILE = 0.4;

// Rounded pea gravel in three layers (the ones underneath show in the
// gaps), in mixed buff, grey, rust and cream.
const GRAVEL_GLSL = /* glsl */ `
${BAKE_GLSL}
struct Peb { float h; vec3 col; float rough; };
void pebbleLayer(vec2 uv, float N, float base, float seed, inout Peb p) {
  vec2 g = uv * N;
  vec2 gi = floor(g);
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 c = gi + vec2(float(x), float(y));
      vec3 r = hp3(c + seed, N);
      vec3 q = hp3(c + seed + 57.0, N);
      float rad = mix(0.36, 0.56, q.x);
      float a = q.y * 6.283;
      vec2 d = mat2(cos(a), sin(a), -sin(a), cos(a)) * (g - c - 0.5 - (r.xy - 0.5) * 0.7);
      d.x *= mix(0.75, 1.25, q.z);
      float l = length(d) / rad + (vnP(g * 4.0 + q.xy * 13.0, N * 4.0) - 0.5) * 0.12;
      if (l >= 1.0) continue;
      float h = base + sqrt(1.0 - l * l) * rad / N * 0.75;
      if (h <= p.h) continue;
      p.h = h;
      float k = fract(r.z * 7.13 + q.x * 3.1);
      vec3 col = k < 0.3 ? vec3(0.66, 0.56, 0.42) : k < 0.5 ? vec3(0.58, 0.55, 0.5) : k < 0.66 ? vec3(0.62, 0.43, 0.3)
        : k < 0.8 ? vec3(0.78, 0.73, 0.64) : k < 0.92 ? vec3(0.45, 0.4, 0.35) : vec3(0.72, 0.6, 0.44);
      col *= 0.85 + 0.3 * fract(q.z * 5.7);
      col *= 0.82 + 0.3 * vnP(g * 9.0 + r.xy * 31.0, N * 9.0);
      // the rim of each stone, where it meets its neighbours, is shaded
      col *= mix(0.55, 1.0, smoothstep(1.0, 0.55, l));
      p.col = s2l(col);
      p.rough = mix(0.45, 0.7, fract(q.y * 9.1));
    }
}
Peb gravel(vec2 uv) {
  Peb p;
  p.h = 0.0;
  p.col = s2l(vec3(0.24, 0.21, 0.17));
  p.rough = 0.9;
  pebbleLayer(uv + 0.37, 38.0, 0.0, 91.0, p);
  pebbleLayer(uv + 0.11, 38.0, 0.004, 23.0, p);
  pebbleLayer(uv, 38.0, 0.008, 3.0, p);
  // gaps between stones are deep and dark
  p.col *= mix(0.25, 1.0, smoothstep(0.0, 0.012, p.h));
  return p;
}
`;

const GRAVEL_A = `${GRAVEL_GLSL}
vec4 bake(vec2 uv, float texel) {
  Peb p = gravel(uv);
  return vec4(p.col, clamp(p.h / 0.03, 0.0, 1.0));
}`;

const GRAVEL_B = `${GRAVEL_GLSL}
vec4 bake(vec2 uv, float texel) {
  Peb p = gravel(uv);
  float hl = gravel(uv - vec2(texel, 0.0)).h;
  float hr = gravel(uv + vec2(texel, 0.0)).h;
  float hd = gravel(uv - vec2(0.0, texel)).h;
  float hu = gravel(uv + vec2(0.0, texel)).h;
  vec3 n = normalize(vec3((hl - hr) / (2.0 * texel), (hd - hu) / (2.0 * texel), 1.0));
  return vec4(n.xy * 0.5 + 0.5, p.rough, smoothstep(0.0, 0.016, p.h));
}`;

const gravelCache = new WeakMap();
function gravelMaps(renderer, size) {
  let m = gravelCache.get(renderer);
  if (!m) {
    m = { a: bakeTexture(renderer, size, GRAVEL_A, { srgb: true }), b: bakeTexture(renderer, size, GRAVEL_B) };
    gravelCache.set(renderer, m);
  }
  return m;
}

const GRAVEL_DECL = /* glsl */ `
${NOISE_GLSL}
${WET_GLSL}
uniform sampler2D uGravA;
uniform sampler2D uGravB;
uniform vec4 uGravBox;
varying vec3 vGravW;
float gvRough;
float gvAO;
vec3 gvN;
`;

const GRAVEL_MAIN = /* glsl */ `
vec2 gxz = vGravW.xz;
// a ragged edge where the gravel peters out into the lawn
vec2 gIn = min(gxz - uGravBox.xy, uGravBox.zw - gxz);
float gEdge = min(gIn.x, gIn.y) + (gNoise(gxz * 9.0) - 0.5) * 0.05 + (gNoise(gxz * 31.0) - 0.5) * 0.02;
if (gEdge < 0.0) discard;
const mat2 GROT = mat2(0.8, 0.6, -0.6, 0.8);
vec2 gu1 = gxz / ${GRAVEL_TILE.toFixed(2)};
vec2 gu2 = GROT * gxz / ${GRAVEL_TILE.toFixed(2)} * 0.77 + vec2(0.21, 0.63);
vec4 ga1 = texture2D(uGravA, gu1);
vec4 ga2 = texture2D(uGravA, gu2);
vec4 gb1 = texture2D(uGravB, gu1);
vec4 gb2 = texture2D(uGravB, gu2);
float gbw = smoothstep(-0.06, 0.06, ga2.a - ga1.a + (gFbm(gxz * 2.1) - 0.5) * 0.8);
vec3 gAlb = mix(ga1.rgb, ga2.rgb, gbw);
vec4 gB = mix(gb1, gb2, gbw);
vec2 gN2 = mix(gb1.xy * 2.0 - 1.0, (gb2.xy * 2.0 - 1.0) * GROT, gbw);
gAlb *= 0.88 + 0.24 * gFbm(gxz * 1.3 + 5.0);
// thinner at the edge: soil shows between the stones
gAlb = mix(gAlb * vec3(0.5, 0.42, 0.34), gAlb, smoothstep(0.0, 0.06, gEdge));
vec2 gWet = wetAt(gxz);
float gDamp = smoothstep(0.0, 0.8, gWet.x);
gAlb = mix(gAlb, pow(gAlb, vec3(1.15)) * 0.55, gDamp);
diffuseColor.rgb = gAlb;
gvRough = mix(gB.z, 0.25, gDamp);
gvRough = mix(gvRough, 0.12, gWet.y * 0.7);
gvAO = mix(1.0, gB.w, 0.8);
gvN = normalize(vec3(gN2.x * 1.1, 1.0, gN2.y * 1.1));
`;

function gravelMaterial(maps, uniforms, box) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms, { uGravA: { value: maps.a }, uGravB: { value: maps.b }, uGravBox: { value: box } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGravW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGravW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${GRAVEL_DECL}`)
      .replace('#include <map_fragment>', GRAVEL_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gvRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gvN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gvAO;\nreflectedLight.indirectSpecular *= gvAO;');
  };
  m.customProgramCacheKey = () => 'gg-gravel';
  return m;
}

const PEBBLES = { high: 2600, medium: 1300, low: 450 };
const PALETTE = [
  [0.66, 0.56, 0.42],
  [0.58, 0.55, 0.5],
  [0.62, 0.43, 0.3],
  [0.78, 0.73, 0.64],
  [0.45, 0.4, 0.35],
  [0.72, 0.6, 0.44],
];

export class Gravel {
  constructor({ renderer, quality, uniforms, soilMaps }) {
    this.quality = quality;
    this.maps = gravelMaps(renderer, quality.tier === 'low' ? 512 : 1024);
    this.box = new THREE.Vector4();
    this.material = gravelMaterial(this.maps, uniforms, this.box);
    this.pebbleMat = lumpMaterial(soilMaps, uniforms, true);
    this.pebbleGeo = rockGeometry({ detail: 2, lumpy: 0.1, seed: 5 });
    this.group = new THREE.Group();
    this.surface = null;
  }

  build(layout) {
    this.clear();
    const g = layout.gravel;
    this.box.set(g.x0, g.z0, g.x1, g.z1);
    const pad = 0.06;
    const geo = new THREE.PlaneGeometry(g.x1 - g.x0 + pad * 2, g.z1 - g.z0 + pad * 2);
    geo.rotateX(-Math.PI / 2);
    geo.translate((g.x0 + g.x1) / 2, 0.006, (g.z0 + g.z1) / 2);
    this.surface = new THREE.Mesh(geo, this.material);
    this.surface.receiveShadow = true;
    this.surface.userData.surface = 'gravel';
    this.group.add(this.surface);
    // loose pebbles on top, where the camera is close enough to see them
    const rnd = mulberry32(4242);
    const n = PEBBLES[this.quality.tier] ?? PEBBLES.high;
    const mesh = new THREE.InstancedMesh(this.pebbleGeo, this.pebbleMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const zMin = Math.max(g.z0, layout.camera.target[2] - 0.9);
    let count = 0;
    for (let tries = 0; count < n && tries < n * 20; tries++) {
      const x = g.x0 + 0.02 + rnd() * (g.x1 - g.x0 - 0.04);
      const z = zMin + rnd() * (g.z1 - 0.02 - zMin);
      // not under the planters
      if (layout.zones.some((zn) => zn.shape === 'rect' && Math.abs(x - zn.cx) < zn.w / 2 + 0.05 && Math.abs(z - zn.cz) < zn.d / 2 + 0.05)) continue;
      const s = 0.0035 + rnd() ** 1.5 * 0.0035;
      const p = PALETTE[Math.floor(rnd() * PALETTE.length)];
      const v = 0.8 + rnd() * 0.3;
      col.setRGB(p[0] * v, p[1] * v, p[2] * v, THREE.SRGBColorSpace);
      e.set((rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4);
      q.setFromEuler(e);
      const sy = s * (0.55 + rnd() * 0.25);
      m.compose(new THREE.Vector3(x, 0.006 + sy * 0.35, z), q, new THREE.Vector3(s * (0.9 + rnd() * 0.3), sy, s * (0.8 + rnd() * 0.3)));
      mesh.setMatrixAt(count, m);
      mesh.setColorAt(count, col);
      count++;
    }
    mesh.count = count;
    mesh.receiveShadow = true;
    mesh.castShadow = this.quality.tier === 'high' && this.quality.shadows;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  clear() {
    for (const obj of [...this.group.children]) {
      this.group.remove(obj);
      if (obj.isInstancedMesh) obj.dispose();
      else obj.geometry?.dispose();
    }
    this.surface = null;
    this.group.removeFromParent();
  }

  dispose() {
    this.clear();
    this.material.dispose();
    this.pebbleMat.dispose();
    this.pebbleGeo.dispose();
  }
}

// ------------------------------------------------------------ deck

const DECK_DECL = /* glsl */ `
${NOISE_GLSL}
${WET_GLSL}
uniform vec4 uDeck; // x0, z0 of the boards
varying vec3 vDeckW;
varying vec3 vDeckN;
float dkRough;
float dkAO;
vec3 dkN;
`;

// Boards run along x: 140 mm wide with 6 mm gaps, staggered butt joints,
// two screws per board over every joist, grain, knots, weathering.
const DECK_MAIN = /* glsl */ `
vec3 dp = vDeckW;
vec3 dNg = normalize(vDeckN);
const float PITCH = 0.146;
const float GAP = 0.006;
float dz = dp.z - uDeck.y;
float row = floor(dz / PITCH);
float v = dz - row * PITCH;
vec3 rr = gHash3(vec2(row, 7.0));
float L = rr.x < 0.5 ? 2.4 : 3.6;
float ux = dp.x - uDeck.x + rr.y * L;
float seg = floor(ux / L);
float u = ux - seg * L;
vec3 sr = gHash3(vec2(row * 1.7 + 3.0, seg + 11.0));
vec3 sr2 = gHash3(vec2(seg * 3.1 + 5.0, row + 0.5));
float W = PITCH - GAP;
float edge = min(v, W - v);
float endD = min(u, L - u);
// board colour: warm oiled hardwood, each board a little different,
// weathered greyer towards its ends and edges
vec3 wood = mix(vec3(0.5, 0.33, 0.21), vec3(0.62, 0.44, 0.28), sr.x);
wood = mix(wood, vec3(0.47, 0.42, 0.37), sr.y * 0.45);
// grain: long streaks with the odd cathedral arch, and fine fibres
float warp = gFbm(vec2(u * 1.6, v * 9.0) + sr.xy * 40.0);
float ringC = v * mix(45.0, 75.0, sr.z) + warp * 3.5 + sin(u * 1.1 + sr.z * 6.28) * 1.8 * sr2.x;
float ring = smoothstep(0.3, 0.48, abs(fract(ringC) - 0.5));
float fibre = gNoise(vec2(u * 9.0, v * 900.0 + sr.x * 91.0));
float fine = gNoise(vec2(u * 40.0, v * 2600.0));
vec3 dCol = wood * (1.0 - 0.2 * ring) * (0.92 + 0.14 * fibre) * (0.96 + 0.08 * fine);
// knots
float knotD = 9.0;
vec2 kp = vec2(fract(sr2.y * 3.7) * L, (0.25 + 0.5 * sr2.z) * W);
if (sr2.y > 0.35) {
  vec2 kd = vec2((u - kp.x) * 0.55, v - kp.y);
  knotD = length(kd);
  dCol *= mix(0.45, 1.0, smoothstep(0.004, 0.012, knotD));
  dCol *= 1.0 - 0.15 * smoothstep(0.03, 0.012, knotD) * (0.5 + 0.5 * sin(knotD * 900.0));
}
float weather = smoothstep(0.35, 0.0, endD) * 0.5 + smoothstep(0.012, 0.0, edge) * 0.35;
dCol = mix(dCol, vec3(0.5, 0.47, 0.43) * (0.9 + 0.2 * fibre), weather * 0.6);
// walked on down the middle: a touch paler and smoother
float worn = smoothstep(1.2, 0.2, abs(dp.x - 0.1)) * smoothstep(-1.2, 0.4, dp.z);
dCol *= 1.0 + 0.06 * worn;
dkRough = mix(0.72, 0.58, worn) + 0.1 * ring;
// screws over each joist (every 450 mm)
float jx = dp.x - uDeck.x;
float jd = abs(jx - (floor(jx / 0.45) + 0.5) * 0.45);
vec2 sp = vec2(jd, min(abs(v - 0.022), abs(v - (W - 0.022))));
float screwD = length(sp);
float screw = smoothstep(0.0036, 0.0028, screwD);
float rust = smoothstep(0.009, 0.0035, screwD) * (1.0 - screw) * 0.45;
dCol = mix(dCol, dCol * vec3(0.6, 0.42, 0.3), rust);
dCol = mix(dCol, vec3(0.2, 0.19, 0.18) * (0.8 + 0.4 * gNoise(dp.xz * 3000.0)), screw);
dkRough = mix(dkRough, 0.45, screw);
// the gaps between boards and at the butt joints
float gapV = smoothstep(W, W + 0.0008, v) * smoothstep(PITCH, PITCH - 0.0008, v);
float gapU = smoothstep(0.0022, 0.0012, endD);
float gap = max(gapV, gapU);
float bevel = 1.0 - smoothstep(0.0, 0.003, edge);
dCol *= 1.0 - 0.3 * bevel;
dCol = mix(dCol, vec3(0.03, 0.025, 0.02), gap);
// end grain on the sides of the deck
if (abs(dNg.y) < 0.5) dCol = wood * vec3(0.7, 0.62, 0.55) * (0.85 + 0.2 * gNoise(dp.xy * vec2(40.0, 900.0) + dp.zy * vec2(40.0, 900.0)));
vec2 dWet = wetAt(dp.xz);
float dDamp = smoothstep(0.0, 0.8, dWet.x);
dCol = mix(dCol, pow(dCol, vec3(1.12)) * 0.6, dDamp);
diffuseColor.rgb = deckLinear(dCol);
dkRough = mix(dkRough, 0.3, dDamp);
dkRough = mix(dkRough, 0.1, dWet.y * 0.8 * (1.0 - gap));
dkAO = 1.0 - 0.7 * gap - 0.25 * bevel;
// rounded board edges catch the light; raised grain; sunk screw heads
float slopeV = (v < W * 0.5 ? -1.0 : 1.0) * bevel * 0.9;
float grainBump = (ring - 0.5) * 0.04 + (fibre - 0.5) * 0.03;
dkN = normalize(dNg + vec3(0.0, 0.0, slopeV + grainBump) - vec3(0.0, 0.0, 0.0));
if (abs(dNg.y) < 0.5) dkN = dNg;
`;

function deckMaterial(uniforms, origin) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms, { uDeck: { value: origin } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDeckW;\nvarying vec3 vDeckN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDeckW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDeckN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECK_DECL}\nvec3 deckLinear(vec3 c) { return pow(c, vec3(2.2)); }`)
      .replace('#include <map_fragment>', DECK_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = dkRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(dkN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= dkAO;\nreflectedLight.indirectSpecular *= dkAO;');
  };
  m.customProgramCacheKey = () => 'gg-deck';
  return m;
}

export class Deck {
  constructor({ uniforms }) {
    this.origin = new THREE.Vector4();
    this.material = deckMaterial(uniforms, this.origin);
    this.group = new THREE.Group();
    this.surface = null;
  }

  build(layout) {
    this.clear();
    const d = layout.deck;
    const t = 0.045;
    this.origin.set(d.x0, d.z0, 0, 0);
    const geo = new THREE.BoxGeometry(d.x1 - d.x0, t, d.z1 - d.z0);
    geo.translate((d.x0 + d.x1) / 2, -t / 2, (d.z0 + d.z1) / 2);
    this.surface = new THREE.Mesh(geo, this.material);
    this.surface.receiveShadow = true;
    this.surface.userData.surface = 'deck';
    this.group.add(this.surface);
  }

  clear() {
    for (const obj of [...this.group.children]) {
      this.group.remove(obj);
      obj.geometry?.dispose();
    }
    this.surface = null;
    this.group.removeFromParent();
  }

  dispose() {
    this.clear();
    this.material.dispose();
  }
}
