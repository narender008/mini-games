// The ground: one mesh from the stage's height function, reaching from just
// behind the camera to the far horizon, with a fine deformable strip along
// the lane where balls land and craters are dug.
//
// The strip is a crater map (a small float texture, 1 cm per texel on good
// devices) holding, per texel: R = height change in metres, G = how dug-up
// the ground is (bare soil or damp sand shows through), B = wetness (mud and
// paint splashes, melted snow), A = flattening (grass lies down). The vertex
// shader adds R to the height and bends the normal by its slope, so craters
// cost nothing per frame. A new crater grows over a quarter of a second as a
// formula in the shader and is written into the map once, when it has
// finished, so no frame ever uploads more than one small texture.
//
// The mesh is a grid whose rows and columns are 1 cm apart inside the strip
// and grow steadily larger away from it, so there are no cracks between fine
// and coarse ground.
import * as THREE from 'three';
import { clamp, noise2, smoothstep } from './config.js';

// the deformable strip along the lane (x) and across it (z)
const STRIP_X = 2.56;
const STRIP_Z = 0.32;
// base heights are cached on a coarser grid a little wider than the strip
const BASE_X = 3.2;
const BASE_Z = 1.6;
const BASE_CELL = 0.02;
const MAX_CRATERS = 4;

// cells grow away from the strip, up to maxCell, and beyond 60 m keep
// growing with distance (far hills need few vertices)
function axis(lo, hi, stripLo, stripHi, cell, growth, maxCell) {
  const cap = (v) => maxCell * (1 + Math.max(0, Math.abs(v) - 60) / 120);
  const out = [];
  for (let v = stripLo; v <= stripHi + 1e-9; v += cell) out.push(+v.toFixed(5));
  let step = cell;
  let v = stripHi;
  while (v < hi) {
    step = Math.min(cap(v), step * growth);
    v += step;
    out.push(v);
  }
  step = cell;
  v = stripLo;
  const low = [];
  while (v > lo) {
    step = Math.min(cap(v), step * growth);
    v -= step;
    low.push(v);
  }
  return low.reverse().concat(out);
}

// crater shape: a bowl with a raised, slightly ragged rim, as a fraction of
// the depth (negative is down), for distance r / radius = u
function craterProfile(u, rim) {
  if (u > 2.2) return 0;
  const bowl = u < 1 ? -(1 - u * u) * (1 - u * u) : 0;
  const lip = rim * Math.exp(-((u - 0.95) * (u - 0.95)) / 0.09);
  return bowl + lip;
}

export const CRATER_GLSL = /* glsl */ `
uniform sampler2D tDeform;
uniform vec4 uStrip;          // x0, z0, 1/width, 1/depth (texel centres)
uniform vec4 uCraters[${MAX_CRATERS}];     // x, z, radius, depth * progress
uniform float uCraterRim[${MAX_CRATERS}];
vec2 deformUv(vec2 xz) { return (xz - uStrip.xy) * uStrip.zw; }
float craterShape(float u, float rim) {
  float bowl = u < 1.0 ? -(1.0 - u * u) * (1.0 - u * u) : 0.0;
  float lip = rim * exp(-((u - 0.95) * (u - 0.95)) / 0.09);
  return u > 2.2 ? 0.0 : bowl + lip;
}
float liveCraters(vec2 xz) {
  float h = 0.0;
  for (int i = 0; i < ${MAX_CRATERS}; i++) {
    vec4 c = uCraters[i];
    if (c.w == 0.0) continue;
    h += c.w * craterShape(length(xz - c.xy) / c.z, uCraterRim[i]);
  }
  return h;
}
float deformHeight(vec2 xz) {
  vec2 uv = deformUv(xz);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return texture2D(tDeform, uv).r * inside + liveCraters(xz);
}`;

export class Terrain {
  // stage: { height(x, z), ground: {...} }; textures: from loadGround() or null
  constructor({ quality, stage }) {
    this.quality = quality;
    this.stage = stage;
    const fine = quality.tier !== 'low';
    this.cell = fine ? 0.01 : 0.02;
    this.nx = Math.round((2 * STRIP_X) / this.cell);
    this.nz = Math.round((2 * STRIP_Z) / this.cell);
    this.x0 = -STRIP_X + this.cell / 2;
    this.z0 = -STRIP_Z + this.cell / 2;
    const n = this.nx * this.nz;
    this.delta = new Float32Array(n);
    this.dug = new Float32Array(n);
    this.wet = new Float32Array(n);
    this.flat = new Float32Array(n);
    this.texData = new Uint16Array(n * 4);
    this.deformTex = new THREE.DataTexture(this.texData, this.nx, this.nz, THREE.RGBAFormat, THREE.HalfFloatType);
    this.deformTex.magFilter = this.deformTex.minFilter = THREE.LinearFilter;
    this.deformTex.wrapS = this.deformTex.wrapT = THREE.ClampToEdgeWrapping;
    this.deformTex.needsUpdate = true;
    this.dirty = false;
    // uniforms shared with anything that sits on the ground (grass, stains)
    this.uniforms = {
      tDeform: { value: this.deformTex },
      uStrip: { value: new THREE.Vector4(this.x0 - this.cell / 2, this.z0 - this.cell / 2, 1 / (this.nx * this.cell), 1 / (this.nz * this.cell)) },
      uCraters: { value: Array.from({ length: MAX_CRATERS }, () => new THREE.Vector4()) },
      uCraterRim: { value: new Array(MAX_CRATERS).fill(0) },
    };
    this.live = Array.from({ length: MAX_CRATERS }, () => ({ on: false, t: 0, x: 0, z: 0, r: 0, d: 0, rim: 0 }));
    this.cacheBase();
    this.mesh = this.buildMesh();
  }

  // ------------------------------------------------------------ heights

  cacheBase() {
    const h = this.stage.height;
    this.bnx = Math.round((2 * BASE_X) / BASE_CELL) + 1;
    this.bnz = Math.round((2 * BASE_Z) / BASE_CELL) + 1;
    this.base = new Float32Array(this.bnx * this.bnz);
    for (let j = 0; j < this.bnz; j++) {
      const z = -BASE_Z + j * BASE_CELL;
      for (let i = 0; i < this.bnx; i++) this.base[j * this.bnx + i] = h(-BASE_X + i * BASE_CELL, z);
    }
  }

  baseAt(x, z) {
    const fx = (x + BASE_X) / BASE_CELL;
    const fz = (z + BASE_Z) / BASE_CELL;
    if (fx < 0 || fz < 0 || fx >= this.bnx - 1 || fz >= this.bnz - 1) return this.stage.height(x, z);
    const i = fx | 0;
    const j = fz | 0;
    const u = fx - i;
    const v = fz - j;
    const k = j * this.bnx + i;
    const b = this.base;
    return (b[k] * (1 - u) + b[k + 1] * u) * (1 - v) + (b[k + this.bnx] * (1 - u) + b[k + this.bnx + 1] * u) * v;
  }

  // bilinear read of one of the strip's layers (0 outside it)
  stripAt(arr, x, z) {
    const fx = (x - this.x0) / this.cell;
    const fz = (z - this.z0) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return 0;
    const i = fx | 0;
    const j = fz | 0;
    const u = fx - i;
    const v = fz - j;
    const k = j * this.nx + i;
    return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + this.nx] * (1 - u) + arr[k + this.nx + 1] * u) * v;
  }

  // ground height including finished craters (craters still forming count
  // at full depth, so debris never falls through a hole that is opening)
  heightAt(x, z) {
    return this.baseAt(x, z) + this.stripAt(this.delta, x, z);
  }

  normalAt(x, z, out) {
    const e = this.cell;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  dugAt(x, z) {
    return this.stripAt(this.dug, x, z);
  }

  // ------------------------------------------------------------ mesh

  buildMesh() {
    const q = this.quality;
    const h = this.stage.height;
    const far = this.stage.far ?? 70;
    const wide = this.stage.wide ?? 45;
    const xs = axis(-wide, wide, -STRIP_X, STRIP_X, this.cell, q.tier === 'low' ? 1.2 : 1.14, 4);
    const zs = axis(-far, 9, -STRIP_Z, STRIP_Z, this.cell, q.tier === 'low' ? 1.2 : 1.12, 4);
    const nx = xs.length;
    const nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    const nrm = new Float32Array(nx * nz * 3);
    // how wooded the ground is (seen from afar as a forest canopy)
    const coverFn = this.stage.cover;
    // and where a second ground (moss on the knolls, say) covers the first
    const patchFn = this.stage.patch;
    const cov = new Float32Array(nx * nz * 2);
    const n = new THREE.Vector3();
    for (let j = 0; j < nz; j++) {
      const z = zs[j];
      const ez = Math.max(0.005, 0.5 * (zs[Math.min(nz - 1, j + 1)] - zs[Math.max(0, j - 1)]));
      for (let i = 0; i < nx; i++) {
        const x = xs[i];
        const k = (j * nx + i) * 3;
        const y = Math.abs(x) <= BASE_X && Math.abs(z) <= BASE_Z ? this.baseAt(x, z) : h(x, z);
        pos[k] = x;
        pos[k + 1] = y;
        pos[k + 2] = z;
        if (coverFn && (Math.abs(x) > BASE_X || Math.abs(z) > BASE_Z)) cov[(j * nx + i) * 2] = coverFn(x, z, y);
        if (patchFn && Math.abs(x) <= BASE_X && Math.abs(z) <= BASE_Z) cov[(j * nx + i) * 2 + 1] = patchFn(x, z);
        const ex = Math.max(0.005, 0.5 * (xs[Math.min(nx - 1, i + 1)] - xs[Math.max(0, i - 1)]));
        n.set(-(h(x + ex, z) - h(x - ex, z)) / (2 * ex), 1, -(h(x, z + ez) - h(x, z - ez)) / (2 * ez)).normalize();
        nrm[k] = n.x;
        nrm[k + 1] = n.y;
        nrm[k + 2] = n.z;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        // alternate the diagonal so slopes don't show a grain
        if ((i + j) & 1) {
          idx[o++] = a; idx[o++] = c; idx[o++] = b;
          idx[o++] = b; idx[o++] = c; idx[o++] = d;
        } else {
          idx[o++] = a; idx[o++] = c; idx[o++] = d;
          idx[o++] = a; idx[o++] = d; idx[o++] = b;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('aCover', new THREE.BufferAttribute(cov, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 1;
    const mesh = new THREE.Mesh(geo, this.makeMaterial());
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  // The ground look: the stage's ground texture set (grass and soil, sand,
  // mud, snow or moss), with the crater set (bare soil, damp sand, packed
  // snow...) showing through wherever the ground has been dug, blended by
  // height so it breaks up like the real thing, and darker, glossier ground
  // where it is wet.
  makeMaterial() {
    const g = this.stage.ground;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    const U = this.uniforms;
    const T = g.textures || {};
    const has = !!(T.base && T.dug);
    mat.userData.uniforms = {
      tBaseCol: { value: T.base?.map ?? null },
      tBaseNrm: { value: T.base?.normalMap ?? null },
      tBaseOrm: { value: T.base?.ormMap ?? null },
      tDugCol: { value: T.dug?.map ?? null },
      tDugNrm: { value: T.dug?.normalMap ?? null },
      tDugOrm: { value: T.dug?.ormMap ?? null },
      tFarCol: { value: T.far?.map ?? T.base?.map ?? null },
      uScale: { value: new THREE.Vector3(1 / (g.baseTile ?? 0.5), 1 / (g.dugTile ?? 0.4), 1 / (g.farTile ?? 6)) },
      uBaseTint: { value: new THREE.Color(g.baseTint ?? 0xffffff) },
      uDugTint: { value: new THREE.Color(g.dugTint ?? 0xffffff) },
      uFarTint: { value: new THREE.Color(g.farTint ?? g.baseTint ?? 0xffffff) },
      uBaseColor: { value: new THREE.Color(g.baseColor ?? 0x6f8a3a) },
      uDugColor: { value: new THREE.Color(g.dugColor ?? 0x5a4030) },
      uWetDark: { value: g.wetDark ?? 0.45 },
      uRough: { value: new THREE.Vector2(g.baseRough ?? 1, g.dugRough ?? 1) },
      uNormalScale: { value: g.normalScale ?? 1 },
      uCoverColor: { value: new THREE.Color(g.coverColor ?? 0x2f5a1c) },
      // water line, width of the shore band above it; its colour
      uShore: { value: new THREE.Vector2(g.shore?.y ?? -1e4, g.shore?.width ?? 0.5) },
      uShoreColor: { value: new THREE.Color(g.shore?.color ?? 0x8f8468) },
      uRockColor: { value: new THREE.Color(g.farRock ?? 0x7d7a72) },
      uCarve: { value: g.carve ?? 0.08 },
      tPatchCol: { value: T.patch?.map ?? null },
      tPatchNrm: { value: T.patch?.normalMap ?? null },
      tPatchOrm: { value: T.patch?.ormMap ?? null },
      uPatchScale: { value: 1 / (g.patchTile ?? 0.4) },
      uPatchTint: { value: new THREE.Color(g.patchTint ?? 0xffffff) },
    };
    const patch = has && !!T.patch;
    mat.defines = {};
    if (has) mat.defines.USE_GROUND_TEX = '';
    if (patch) mat.defines.USE_PATCH = '';
    mat.customProgramCacheKey = () => `terrain-${has}-${patch}`;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U, mat.userData.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
${CRATER_GLSL}
attribute vec2 aCover;
varying vec3 vGround; // world x, z and height change
varying vec4 vDeform;
varying vec2 vLand;   // woodland cover, height
varying float vPatch;
varying vec3 vWN;     // world normal (the terrain is not transformed)`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 objectNormal = normal;
{
  vec2 xz = position.xz;
  float e = 0.01;
  float dx = deformHeight(xz + vec2(e, 0.0)) - deformHeight(xz - vec2(e, 0.0));
  float dz = deformHeight(xz + vec2(0.0, e)) - deformHeight(xz - vec2(0.0, e));
  vec3 n = normal / max(normal.y, 0.05);
  objectNormal = normalize(vec3(n.x - dx / (2.0 * e), 1.0, n.z - dz / (2.0 * e)));
}`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
vLand = vec2(aCover.x, position.y);
vPatch = aCover.y;
vWN = objectNormal;
float dH = deformHeight(position.xz);
transformed.y += dH;
vDeform = texture2D(tDeform, deformUv(position.xz));
vDeform.r = dH;
vGround = vec3(position.x, position.z, dH);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vGround;
varying vec4 vDeform;
varying vec2 vLand;
varying float vPatch;
varying vec3 vWN;
uniform vec3 uRockColor;
uniform float uCarve;
float gFar;      // 0 near, 1 for the far hills and mountains
vec2 gCarve;     // slope of the carved ridges and gullies (world x, -z)
uniform sampler2D tPatchCol;
uniform sampler2D tPatchNrm;
uniform sampler2D tPatchOrm;
uniform float uPatchScale;
uniform vec3 uPatchTint;
uniform vec3 uCoverColor;
uniform vec2 uShore;
uniform vec3 uShoreColor;
uniform sampler2D tBaseCol;
uniform sampler2D tBaseNrm;
uniform sampler2D tBaseOrm;
uniform sampler2D tDugCol;
uniform sampler2D tDugNrm;
uniform sampler2D tDugOrm;
uniform sampler2D tFarCol;
uniform vec3 uScale;
uniform vec3 uBaseTint;
uniform vec3 uDugTint;
uniform vec3 uFarTint;
uniform vec3 uBaseColor;
uniform vec3 uDugColor;
uniform float uWetDark;
uniform vec2 uRough;
uniform float uNormalScale;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}
float gRidge(vec2 p) {
  float a = 1.0 - abs(gNoise(p) * 2.0 - 1.0);
  float b = 1.0 - abs(gNoise(p * 2.3 + 5.1) * 2.0 - 1.0);
  return a * a * 0.65 + b * b * 0.35;
}
float gMix;      // 0 = the stage's ground, 1 = dug-up ground
float gWet;
vec3 gNormal;    // tangent-space normal from the maps
float gRough;
float gAO;`,
        )
        .replace(
          '#include <map_fragment>',
          `{
  vec2 wuv = vec2(vGround.x, -vGround.y);
  float dist = length(vViewPosition);
  // break up the edge of dug ground with noise and the texture's own height
  float n = gNoise(wuv * 23.0) * 0.6 + gNoise(wuv * 61.0) * 0.4;
#ifdef USE_GROUND_TEX
  vec4 bo = texture2D(tBaseOrm, wuv * uScale.x);
  vec4 dO = texture2D(tDugOrm, wuv * uScale.y);
  float hb = bo.b;
  gMix = smoothstep(0.35, 0.65, vDeform.g * 1.25 + (n - 0.5) * 0.5 + (dO.b - hb) * 0.35);
  vec3 cb = texture2D(tBaseCol, wuv * uScale.x).rgb * uBaseTint;
  vec3 cfar = texture2D(tFarCol, wuv * uScale.z).rgb * uFarTint;
  // far away, one large tiling reads as fields instead of a repeating carpet
  cb = mix(cb, cfar, smoothstep(4.0, 14.0, dist));
  // from afar, woods read as a lumpy dark canopy (the trees stand on it)
  float lumps = gNoise(wuv * 0.09) * 0.55 + gNoise(wuv * 0.37 + 7.0) * 0.3 + gNoise(wuv * 1.3) * 0.15;
  cb = mix(cb, uCoverColor * (0.55 + 0.8 * lumps), clamp(vLand.x, 0.0, 1.0) * smoothstep(6.0, 30.0, dist));
  // far hills and mountains: bare rock on the steep faces, and ridges and
  // gullies carved into the shading so they read as real land, not a smooth
  // blanket (the geometry out there is coarse)
  gFar = smoothstep(35.0, 140.0, dist);
  gCarve = vec2(0.0);
  if (gFar > 0.0) {
    vec2 p = wuv / 38.0;
    float e = 0.03;
    float h0 = gRidge(p);
    gCarve = vec2(gRidge(p + vec2(e, 0.0)) - h0, gRidge(p + vec2(0.0, e)) - h0) / e * uCarve * gFar;
    vec3 wn = normalize(vWN);
    float steep = 1.0 - smoothstep(0.6, 0.86, wn.y - dot(gCarve, gCarve) * 0.02);
    vec3 rock = uRockColor * (0.65 + 0.7 * gNoise(wuv * 0.05)) * (0.8 + 0.4 * h0);
    cb = mix(cb, rock, steep * gFar * (1.0 - 0.6 * clamp(vLand.x, 0.0, 1.0)));
    cb *= 0.82 + 0.36 * h0 * gFar + (1.0 - gFar) * 0.18;
  }
  // a pebbly shore just above the water
  float sh = 1.0 - smoothstep(uShore.x, uShore.x + uShore.y * (0.6 + 0.8 * lumps), vLand.y);
  cb = mix(cb, uShoreColor * (0.8 + 0.4 * n), sh);
  vec3 cd = texture2D(tDugCol, wuv * uScale.y).rgb * uDugTint;
  vec3 col = mix(cb, cd, gMix);
  vec3 nb = texture2D(tBaseNrm, wuv * uScale.x).xyz * 2.0 - 1.0;
  vec3 nd = texture2D(tDugNrm, wuv * uScale.y).xyz * 2.0 - 1.0;
  gNormal = normalize(mix(nb, nd, gMix));
  gRough = mix(bo.g * uRough.x, dO.g * uRough.y, gMix);
  gAO = mix(bo.r, dO.r, gMix);
#ifdef USE_PATCH
  {
    // the second ground grows raggedly over the first, and craters dig it away
    vec4 po = texture2D(tPatchOrm, wuv * uPatchScale);
    float pm = smoothstep(0.35, 0.65, vPatch + (po.b - 0.5) * 0.6 + (n - 0.5) * 0.3) * (1.0 - gMix);
    col = mix(col, texture2D(tPatchCol, wuv * uPatchScale).rgb * uPatchTint, pm);
    gNormal = normalize(mix(gNormal, texture2D(tPatchNrm, wuv * uPatchScale).xyz * 2.0 - 1.0, pm));
    gRough = mix(gRough, po.g, pm);
    gAO = mix(gAO, po.r, pm);
  }
#endif
#else
  gMix = smoothstep(0.35, 0.65, vDeform.g * 1.25 + (n - 0.5) * 0.5);
  vec3 col = mix(uBaseColor * (0.8 + 0.4 * n), uDugColor * (0.85 + 0.3 * n), gMix);
  gNormal = vec3(0.0, 0.0, 1.0);
  gRough = 0.95;
  gAO = 1.0;
#endif
  gWet = clamp(vDeform.b, 0.0, 1.0);
  col *= mix(1.0, uWetDark, gWet);
  diffuseColor.rgb *= col;
}`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = mix(clamp(gRough, 0.04, 1.0), 0.18, gWet * 0.85);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
  // ground UVs run along world x and -z, so the map's tangent frame is known
  vec3 tX = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
  vec3 tZ = normalize((viewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vec3 t = normalize(tX - normal * dot(normal, tX));
  vec3 b = normalize(tZ - normal * dot(normal, tZ));
  vec3 nm = gNormal;
  nm.xy *= uNormalScale * mix(1.0, 0.4, gWet);
  normal = normalize(t * nm.x + b * nm.y + normal * nm.z);
#ifdef USE_GROUND_TEX
  if (gFar > 0.0) normal = normalize(normal - (viewMatrix * vec4(gCarve.x, 0.0, -gCarve.y, 0.0)).xyz);
#endif
}`,
        )
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gAO;\nreflectedLight.indirectSpecular *= mix(gAO, 1.0, 0.5);`);
    };
    return mat;
  }

  // swap in texture sets once they have loaded
  setTextures(textures) {
    this.stage.ground.textures = textures;
    const old = this.mesh.material;
    this.mesh.material = this.makeMaterial();
    old.dispose();
  }

  // ------------------------------------------------------------ craters

  // Dig a crater. radius and depth in metres; kind shapes it: 'sand' slumps
  // to a soft bowl, 'snow' keeps a crisp rim, 'mud' splashes wet.
  crater(x, z, radius, depth, kind = 'grass') {
    // keep the whole crater inside the strip
    x = clamp(x, -STRIP_X + radius * 2.4, STRIP_X - radius * 2.4);
    z = clamp(z, -STRIP_Z + radius * 2.4, STRIP_Z - radius * 2.4);
    const rim = kind === 'sand' ? 0.18 : kind === 'snow' ? 0.34 : kind === 'mud' ? 0.3 : 0.26;
    // the heights the game reads change at once...
    this.stamp(x, z, radius, depth, rim, kind);
    // ...and the picture catches up over a quarter second
    let slot = this.live.find((c) => !c.on);
    if (!slot) {
      this.settle();
      slot = this.live[0];
    }
    Object.assign(slot, { on: true, t: 0, x, z, r: radius, d: depth, rim });
    return { x, z };
  }

  stamp(x, z, radius, depth, rim, kind) {
    const c = this.cell;
    const reach = radius * 2.3;
    const i0 = Math.max(0, Math.floor((x - reach - this.x0) / c));
    const i1 = Math.min(this.nx - 1, Math.ceil((x + reach - this.x0) / c));
    const j0 = Math.max(0, Math.floor((z - reach - this.z0) / c));
    const j1 = Math.min(this.nz - 1, Math.ceil((z + reach - this.z0) / c));
    const seed = Math.random() * 1000;
    const wet = kind === 'mud' ? 0.9 : kind === 'snow' ? 0.15 : kind === 'sand' ? 0.35 : 0.2;
    for (let j = j0; j <= j1; j++) {
      const pz = this.z0 + j * c;
      for (let i = i0; i <= i1; i++) {
        const px = this.x0 + i * c;
        const dx = px - x;
        const dz = pz - z;
        const a = Math.atan2(dz, dx);
        // a slightly lumpy outline, never a perfect circle
        const wob = 1 + 0.12 * (noise2(Math.cos(a) * 2 + seed, Math.sin(a) * 2) - 0.5) * 2;
        const u = Math.hypot(dx, dz) / (radius * wob);
        if (u > 2.3) continue;
        const k = j * this.nx + i;
        // deeper craters over old ones stay sensible: the new bowl is cut
        // relative to the ground that is there now
        this.delta[k] += depth * craterProfile(u, rim);
        const d = 1 - smoothstep(0.85, 1.55 + 0.25 * noise2(px * 40 + seed, pz * 40), u);
        this.dug[k] = Math.max(this.dug[k], d);
        this.wet[k] = Math.min(1, Math.max(this.wet[k], wet * (1 - smoothstep(0.6, 1.9, u))));
        this.flat[k] = Math.max(this.flat[k], 1 - smoothstep(1.2, 2.3, u));
      }
    }
    this.dirtyBox = this.dirtyBox ? [Math.min(this.dirtyBox[0], i0), Math.max(this.dirtyBox[1], i1), Math.min(this.dirtyBox[2], j0), Math.max(this.dirtyBox[3], j1)] : [i0, i1, j0, j1];
  }

  // mark wet ground (a splash of mud, water or paint) without digging
  wetten(x, z, radius, amount = 0.8) {
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((x - radius - this.x0) / c));
    const i1 = Math.min(this.nx - 1, Math.ceil((x + radius - this.x0) / c));
    const j0 = Math.max(0, Math.floor((z - radius - this.z0) / c));
    const j1 = Math.min(this.nz - 1, Math.ceil((z + radius - this.z0) / c));
    if (i0 > i1 || j0 > j1) return;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const u = Math.hypot(this.x0 + i * c - x, this.z0 + j * c - z) / radius;
        if (u < 1) this.wet[j * this.nx + i] = Math.min(1, Math.max(this.wet[j * this.nx + i], amount * (1 - u * u)));
      }
    }
    this.dirtyBox = this.dirtyBox ? [Math.min(this.dirtyBox[0], i0), Math.max(this.dirtyBox[1], i1), Math.min(this.dirtyBox[2], j0), Math.max(this.dirtyBox[3], j1)] : [i0, i1, j0, j1];
    // (uploaded by update, after any crater still growing has settled)
  }

  // every crater has finished growing: write them all into the map and
  // stop drawing them as formulas (both in the same frame, so nothing jumps)
  settle() {
    for (const c of this.live) c.on = false;
    for (const v of this.uniforms.uCraters.value) v.w = 0;
    this.upload();
  }

  // copy the changed part of the crater map into the texture
  upload() {
    const b = this.dirtyBox;
    if (!b) return;
    const { nx } = this;
    const td = this.texData;
    const half = THREE.DataUtils.toHalfFloat;
    for (let j = b[2]; j <= b[3]; j++) {
      for (let i = b[0]; i <= b[1]; i++) {
        const k = j * nx + i;
        td[k * 4] = half(this.delta[k]);
        td[k * 4 + 1] = half(this.dug[k]);
        td[k * 4 + 2] = half(this.wet[k]);
        td[k * 4 + 3] = half(this.flat[k]);
      }
    }
    this.dirtyBox = null;
    this.deformTex.needsUpdate = true;
  }

  update(dt) {
    const U = this.uniforms;
    let on = false;
    let growing = false;
    for (let i = 0; i < MAX_CRATERS; i++) {
      const c = this.live[i];
      if (!c.on) continue;
      on = true;
      c.t = Math.min(1, c.t + dt / 0.28);
      if (c.t < 1) growing = true;
      // the bowl opens fast and eases to rest, with a hint of overshoot so
      // the ground seems to give
      const t = c.t;
      const e = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.08;
      U.uCraters.value[i].set(c.x, c.z, c.r, c.d * e);
      U.uCraterRim.value[i] = c.rim;
    }
    if (on && !growing) this.settle();
    else if (!on && this.dirtyBox) this.upload();
  }

  // a fresh field for a new game
  reset() {
    this.delta.fill(0);
    this.dug.fill(0);
    this.wet.fill(0);
    this.flat.fill(0);
    this.texData.fill(0);
    this.deformTex.needsUpdate = true;
    for (const c of this.live) c.on = false;
    for (const v of this.uniforms.uCraters.value) v.w = 0;
    this.dirtyBox = null;
  }

  // slowly dry out wet ground (called a few times a second)
  dry(amount) {
    let any = false;
    const w = this.wet;
    for (let k = 0; k < w.length; k++) {
      if (w[k] > 0.02) {
        w[k] = Math.max(0.02, w[k] - amount);
        any = true;
      }
    }
    if (any) this.dirtyBox = [0, this.nx - 1, 0, this.nz - 1];
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.deformTex.dispose();
  }
}

export { STRIP_X, STRIP_Z };
