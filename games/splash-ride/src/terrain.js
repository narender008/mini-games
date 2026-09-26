// Land: the terrain mesh of a natural place (seabed, beaches, islands and
// hills from one height function) with a material that paints sand, wet
// sand, grass, rock and coral from the height and slope, and the land
// distance field every system shares: the boat's soft bumper bounces, the
// animals keeping to open water, the camera staying off the shore and the
// water's shore foam all read the same signed distance (metres to the
// nearest land or obstacle; positive over open water).
import * as THREE from 'three';
import { clamp } from './config.js';

// ------------------------------------------------------------ distance field

// 1D squared Euclidean distance transform (Felzenszwalb and Huttenlocher).
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// squared distance (in cells) from every cell to the nearest cell where mask is set
function edt2d(mask, w, h) {
  const INF = 1e20;
  const out = new Float32Array(w * h);
  const n = Math.max(w, h);
  const f = new Float32Array(n);
  const d = new Float32Array(n);
  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] ? 0 : INF;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  return out;
}

export class LandField {
  // solid(x, z) -> true where the boat may not go (land, shallows, obstacles)
  constructor({ minX, maxX, minZ, maxZ, cell = 2, solid }) {
    this.minX = minX;
    this.minZ = minZ;
    this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell) + 1;
    this.h = Math.ceil((maxZ - minZ) / cell) + 1;
    this.sizeX = (this.w - 1) * cell;
    this.sizeZ = (this.h - 1) * cell;
    const { w, h } = this;
    const inside = new Uint8Array(w * h);
    const outside = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const s = solid(minX + i * cell, minZ + j * cell) ? 1 : 0;
        inside[j * w + i] = s;
        outside[j * w + i] = 1 - s;
      }
    }
    const dOut = edt2d(inside, w, h); // for water cells: distance to land
    const dIn = edt2d(outside, w, h); // for land cells: distance to water
    const sdf = (this.sdf = new Float32Array(w * h));
    for (let k = 0; k < w * h; k++) sdf[k] = inside[k] ? -(Math.sqrt(dIn[k]) - 0.5) * cell : (Math.sqrt(dOut[k]) - 0.5) * cell;
    // a half-float texture for the water shader's shore foam
    const half = new Uint16Array(w * h);
    for (let k = 0; k < w * h; k++) half[k] = THREE.DataUtils.toHalfFloat(clamp(sdf[k], -500, 500));
    this.texture = new THREE.DataTexture(half, w, h, THREE.RedFormat, THREE.HalfFloatType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  // signed distance in metres, bilinear; outside the field it keeps growing
  distance(x, z) {
    const fx = (x - this.minX) / this.cell;
    const fz = (z - this.minZ) / this.cell;
    const cx = clamp(fx, 0, this.w - 1.001);
    const cz = clamp(fz, 0, this.h - 1.001);
    const i = Math.floor(cx);
    const j = Math.floor(cz);
    const tx = cx - i;
    const tz = cz - j;
    const w = this.w;
    const s = this.sdf;
    const a = s[j * w + i];
    const b = s[j * w + i + 1];
    const c = s[(j + 1) * w + i];
    const d = s[(j + 1) * w + i + 1];
    const v = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    return v + Math.hypot(fx - cx, fz - cz) * this.cell;
  }

  // unit direction of increasing distance (towards open water)
  gradient(x, z, out) {
    const e = this.cell * 0.75;
    const gx = this.distance(x + e, z) - this.distance(x - e, z);
    const gz = this.distance(x, z + e) - this.distance(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    out.x = gx / l;
    out.z = gz / l;
    return out;
  }
}

// ------------------------------------------------------------ terrain mesh

// Painted from world height and slope; `ground` is the place's palette.
export function terrainMaterial(ground, textures) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const u = {
    uNoise: { value: textures.noise },
    uSand: { value: new THREE.Color(ground.sand) },
    uWet: { value: new THREE.Color(ground.wet) },
    uBed: { value: new THREE.Color(ground.bed ?? ground.sand) },
    uGrass: { value: new THREE.Color(ground.grass) },
    uGrass2: { value: new THREE.Color(ground.grass2 ?? ground.grass) },
    uRock: { value: new THREE.Color(ground.rock) },
    uCoral: { value: ground.coral ? 1 : 0 },
    uLevels: { value: new THREE.Vector4(ground.grassLevel ?? 1.4, ground.rockSlope ?? 0.55, ground.wetTop ?? 0.35, ground.snowLevel ?? 1e4) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
uniform sampler2D uNoise;
uniform vec3 uSand, uWet, uBed, uGrass, uGrass2, uRock;
uniform float uCoral;
uniform vec4 uLevels;
float tRough;
vec3 tPert;`,
      )
      .replace(
        '#include <map_fragment>',
        `
{
  vec2 p = vWPos.xz;
  float h = vWPos.y;
  float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
  vec4 n1 = texture2D(uNoise, p * 0.0037);
  vec4 n2 = texture2D(uNoise, p * 0.031);
  vec4 n3 = texture2D(uNoise, p * 0.21);
  float grain = n3.b * 0.6 + n2.b * 0.4;
  vec3 sand = uSand * (0.86 + 0.22 * grain + 0.12 * (n1.g - 0.5));
  vec3 col = sand;
  tRough = 0.92;
  tPert = vec3(0.0);
  // wet sand: darker and glossier from just under the water up the beach
  float wet = smoothstep(uLevels.z + 0.25 * n2.r, -0.05, h);
  col = mix(col, uWet * (0.9 + 0.2 * grain), wet);
  tRough = mix(tRough, 0.42, wet * smoothstep(-0.6, 0.05, h));
  // under water: rippled sand, weed tints, and coral in the lagoon
  float under = smoothstep(-0.15, -0.8, h);
  if (under > 0.0) {
    float rip = sin(dot(p, vec2(1.7, 0.6)) + n2.r * 9.0) * 0.5 + 0.5;
    vec3 bed = uBed * (0.8 + 0.25 * grain + 0.12 * rip);
    bed = mix(bed, bed * vec3(0.8, 0.9, 0.7), smoothstep(0.55, 0.75, n1.r) * 0.6);
    tPert += vec3(cos(dot(p, vec2(1.7, 0.6)) + n2.r * 9.0) * 0.12, 0.0, 0.05) * under;
    if (uCoral > 0.5) {
      float cm = smoothstep(0.6, 0.72, n1.r + n2.g * 0.25) * smoothstep(-0.7, -1.6, h) * smoothstep(-9.0, -4.0, h);
      float kind = n2.a;
      vec3 coral = kind > 0.66 ? vec3(0.62, 0.3, 0.33) : kind > 0.33 ? vec3(0.55, 0.45, 0.26) : vec3(0.36, 0.34, 0.42);
      coral *= 0.6 + 0.6 * n3.a;
      col = mix(col, mix(bed, coral, cm), under);
      tPert += vec3(n3.a - 0.5, 0.0, n3.g - 0.5) * cm * 0.9;
    } else {
      col = mix(col, bed, under);
    }
  }
  // grass and scrub on the higher ground, rock on the steep bits
  float grass = smoothstep(uLevels.x, uLevels.x + 0.6, h + (n2.g - 0.5) * 1.2) * (1.0 - smoothstep(uLevels.y - 0.15, uLevels.y + 0.05, slope));
  vec3 g = mix(uGrass, uGrass2, smoothstep(0.35, 0.65, n1.g)) * (0.8 + 0.35 * n3.b);
  col = mix(col, g, grass);
  tRough = mix(tRough, 0.85, grass);
  float rock = smoothstep(uLevels.y - 0.1, uLevels.y + 0.1, slope + (n2.r - 0.5) * 0.2) * smoothstep(-0.4, 0.4, h);
  vec3 r = uRock * (0.75 + 0.4 * n3.g + 0.2 * (n1.b - 0.5));
  col = mix(col, r, rock);
  tRough = mix(tRough, 0.78, rock);
  tPert += vec3(n3.g - 0.5, 0.0, n3.b - 0.5) * (rock * 1.2 + grass * 0.3 + (1.0 - wet) * 0.08);
  diffuseColor.rgb *= col;
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (viewMatrix * vec4(tPert, 0.0)).xyz * 0.6);');
  };
  mat.customProgramCacheKey = () => 'terrain';
  return mat;
}

// A height-field mesh in square chunks (so off-screen parts are culled).
export function terrainMesh({ height, minX, maxX, minZ, maxZ, cell, chunk = 96, material, skip }) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const nx = Math.ceil((maxX - minX) / cell);
  const nz = Math.ceil((maxZ - minZ) / cell);
  const e = cell * 0.5;
  for (let cz = 0; cz < nz; cz += chunk) {
    for (let cx = 0; cx < nx; cx += chunk) {
      const w = Math.min(chunk, nx - cx);
      const d = Math.min(chunk, nz - cz);
      const x0 = minX + cx * cell;
      const z0 = minZ + cz * cell;
      if (skip && skip(x0, z0, x0 + w * cell, z0 + d * cell)) continue;
      const pos = new Float32Array((w + 1) * (d + 1) * 3);
      const nrm = new Float32Array((w + 1) * (d + 1) * 3);
      let k = 0;
      for (let j = 0; j <= d; j++) {
        for (let i = 0; i <= w; i++) {
          const x = x0 + i * cell;
          const z = z0 + j * cell;
          const y = height(x, z);
          pos[k] = x;
          pos[k + 1] = y;
          pos[k + 2] = z;
          const hx = height(x + e, z) - height(x - e, z);
          const hz = height(x, z + e) - height(x, z - e);
          const l = Math.hypot(hx, 2 * e, hz);
          nrm[k] = -hx / l;
          nrm[k + 1] = (2 * e) / l;
          nrm[k + 2] = -hz / l;
          k += 3;
        }
      }
      const idx = new (((w + 1) * (d + 1)) > 65535 ? Uint32Array : Uint16Array)(w * d * 6);
      let t = 0;
      for (let j = 0; j < d; j++) {
        for (let i = 0; i < w; i++) {
          const a = j * (w + 1) + i;
          const b = a + 1;
          const c = a + w + 1;
          const dd = c + 1;
          idx[t++] = a;
          idx[t++] = c;
          idx[t++] = b;
          idx[t++] = b;
          idx[t++] = c;
          idx[t++] = dd;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, material);
      m.receiveShadow = true;
      group.add(m);
    }
  }
  return group;
}
