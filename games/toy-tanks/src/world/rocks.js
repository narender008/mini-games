// Rocks: boulders and outcrops that the tanks' knolls rise out of, and
// pebbles in the grass. Each rock is a lumpy sphere cut by a few planes, so it
// has the flat broken faces of real stone, then textured from the world
// (triplanar, no stretched UVs) with bare rock on the sides and a cap of moss
// (or snow, or sand) wherever it faces up. All of a stage's rocks are merged
// into one mesh: one draw call.
//
// Loose rocks: an entry with `loose: 'stone' | 'sand'` (pebbles, clods) is not
// merged. Loose entries are drawn as a few InstancedMesh variants (children of
// the returned mesh, tagged userData.loose) so physics.js can wake single
// instances when a blast reaches them and write their matrices while they move.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three-gltf/utils/BufferGeometryUtils.js';
import { fbm3, rng } from '../config.js';
import { loadPBR } from '../env.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// one rock, unit size, around the origin
export function rockGeometry(seed, detail = 10, { cuts = 5, lumpy = 0.38, reach = 0.55, flat = 0.9, blocky = 0 } = {}) {
  const R = rng(seed * 7919 + 13);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const planes = [];
  for (let i = 0; i < cuts; i++) {
    const n = new THREE.Vector3(R() * 2 - 1, R() * 1.6 - 0.5, R() * 2 - 1).normalize();
    planes.push({ n, c: reach + R() * 0.3 });
  }
  // blocky: the rock is first trimmed to a rough slab (four upright faces turned at random, a top and a bottom), then broken by the other cuts
  if (blocky > 0) {
    const a0 = R() * 6.283;
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2 + (R() - 0.5) * 0.35;
      planes.push({ n: new THREE.Vector3(Math.cos(a), (R() - 0.5) * 0.3, Math.sin(a)).normalize(), c: blocky * (0.6 + R() * 0.14) });
    }
    planes.push({ n: new THREE.Vector3((R() - 0.5) * 0.2, 1, (R() - 0.5) * 0.2).normalize(), c: blocky * (0.62 + R() * 0.1) });
    planes.push({ n: new THREE.Vector3(0, -1, 0), c: blocky * 0.75 });
  }
  const o = [R() * 50, R() * 50, R() * 50];
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const big = fbm3(_v.x * 1.3 + o[0], _v.y * 1.3 + o[1], _v.z * 1.3 + o[2], 3, seed);
    const mid = fbm3(_v.x * 3.4 + o[1], _v.y * 3.4 + o[2], _v.z * 3.4 + o[0], 3, seed + 3);
    const r = 1 + big * lumpy + mid * 0.1;
    _v.multiplyScalar(r);
    // broken faces: push anything beyond a plane back almost onto it
    for (const pl of planes) {
      const d = _v.dot(pl.n) - pl.c;
      if (d > 0) _v.addScaledVector(pl.n, -d * flat);
    }
    const fine = fbm3(_v.x * 11 + o[2], _v.y * 11, _v.z * 11 + o[0], 2, seed + 9);
    _v.multiplyScalar(1 + fine * 0.022);
    p.setXYZ(i, _v.x, _v.y, _v.z);
    // dents are darker: a cheap cavity term the shader multiplies in
    const cav = 0.72 + 0.28 * Math.min(1, Math.max(0, 0.5 + (big * lumpy + mid * 0.1) * 1.6));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = cav;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const ROCK_GLSL_V = `
varying vec3 vRockPos;
varying vec3 vRockNormal;`;

const ROCK_GLSL_F = `
uniform sampler2D tRockCol;
uniform sampler2D tRockNrm;
uniform sampler2D tRockOrm;
uniform sampler2D tCapCol;
uniform sampler2D tCapNrm;
uniform sampler2D tCapOrm;
uniform vec2 uRockScale;   // x: rock tiles per metre, y: cap tiles per metre
uniform vec3 uRockTint;
uniform vec3 uCapTint;
uniform vec2 uCap;         // x: how much of the top the cap covers, y: its softness
uniform float uCapRough;
uniform vec4 uHaze;        // x: haze starts (m), y: full (m), z: how far it goes towards the colour
uniform vec3 uHazeCol;
varying vec3 vRockPos;
varying vec3 vRockNormal;
vec3 rkW;
vec3 rkNormal;
float rkRough;
float rkAO;
float rkCap;
float rkHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float rkNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkHash(i), rkHash(i + vec3(1, 0, 0)), f.x), mix(rkHash(i + vec3(0, 1, 0)), rkHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(rkHash(i + vec3(0, 0, 1)), rkHash(i + vec3(1, 0, 1)), f.x), mix(rkHash(i + vec3(0, 1, 1)), rkHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// triplanar sample: colour, and a world-space normal (UDN blend)
vec3 rkTri(sampler2D col, sampler2D nrm, sampler2D orm, float scale, vec3 N, out vec3 wn, out vec3 o) {
  vec3 p = vRockPos * scale;
  vec2 ux = p.zy, uy = p.xz, uz = p.xy;
  vec3 c = texture2D(col, ux).rgb * rkW.x + texture2D(col, uy).rgb * rkW.y + texture2D(col, uz).rgb * rkW.z;
  o = texture2D(orm, ux).rgb * rkW.x + texture2D(orm, uy).rgb * rkW.y + texture2D(orm, uz).rgb * rkW.z;
  vec3 tx = texture2D(nrm, ux).xyz * 2.0 - 1.0;
  vec3 ty = texture2D(nrm, uy).xyz * 2.0 - 1.0;
  vec3 tz = texture2D(nrm, uz).xyz * 2.0 - 1.0;
  vec3 s = sign(N);
  tx.x *= s.x; ty.x *= s.y; tz.x *= -s.z;
  tx = vec3(tx.xy + N.zy, abs(N.x) * s.x);
  ty = vec3(ty.xy + N.xz, abs(N.y) * s.y);
  tz = vec3(tz.xy + N.xy, abs(N.z) * s.z);
  wn = normalize(tx.zyx * rkW.x + ty.xzy * rkW.y + tz.xyz * rkW.z);
  return c;
}`;

// rocks: [{ x, y, z, size: [sx, sy, sz], yaw, tilt, seed, detail }]
// look: { rock, cap, capAmount, capSoft, rockTint, capTint, rockTile, capTile, haze: { color, near, far, amount } (distant rocks melt into the haze) }
// a rock may also carry cuts (planes that break it), lumpy, reach (how deep the planes bite, 0.5 = angular), flat (0..1, how fully a cut is flattened) and blocky (0..1: trimmed to a rough slab first)
export async function buildRocks({ rocks, look = {} }) {
  const L = { rock: 'rock', cap: 'moss', capAmount: 0.5, capSoft: 0.25, rockTint: 0xffffff, capTint: 0xffffff, rockTile: 1.1, capTile: 3, capRough: 1, haze: null, ...look };
  const [rock, cap] = await Promise.all([loadPBR(L.rock), L.cap ? loadPBR(L.cap) : null]);
  const parts = [];
  const looseRocks = [];
  for (const r of rocks) {
    if (r.loose) {
      looseRocks.push(r);
      continue;
    }
    const g = rockGeometry(r.seed ?? 1, r.detail ?? 10, r);
    _e.set((r.tilt ?? 0) * 0.7, r.yaw ?? 0, (r.tilt ?? 0) * 0.4);
    _q.setFromEuler(_e);
    _m.compose(_v.set(r.x, r.y, r.z), _q, _n.set(r.size[0], r.size[1], r.size[2]));
    g.applyMatrix4(_m);
    parts.push(g);
  }
  let geo = parts.length ? mergeGeometries(parts, false) : null;
  parts.forEach((g) => g.dispose());
  if (!geo) {
    // only loose rocks: the merged mesh is one empty triangle
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const U = {
    tRockCol: { value: rock.map },
    tRockNrm: { value: rock.normalMap },
    tRockOrm: { value: rock.ormMap },
    tCapCol: { value: cap?.map ?? rock.map },
    tCapNrm: { value: cap?.normalMap ?? rock.normalMap },
    tCapOrm: { value: cap?.ormMap ?? rock.ormMap },
    uRockScale: { value: new THREE.Vector2(L.rockTile, L.capTile) },
    uRockTint: { value: new THREE.Color(L.rockTint) },
    uCapTint: { value: new THREE.Color(L.capTint) },
    uCap: { value: new THREE.Vector2(cap ? L.capAmount : 0, L.capSoft) },
    uCapRough: { value: L.capRough },
    uHaze: { value: new THREE.Vector4(L.haze?.near ?? 0, L.haze?.far ?? 1, L.haze?.amount ?? 0, 0) },
    uHazeCol: { value: new THREE.Color(L.haze?.color ?? 0xffffff) },
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${ROCK_GLSL_V}`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
#ifdef USE_INSTANCING
vRockPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
mat3 rkIm = mat3(instanceMatrix);
vRockNormal = normalize(mat3(modelMatrix) * (rkIm * (objectNormal / vec3(dot(rkIm[0], rkIm[0]), dot(rkIm[1], rkIm[1]), dot(rkIm[2], rkIm[2])))));
#else
vRockPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vRockNormal = normalize(mat3(modelMatrix) * objectNormal);
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${ROCK_GLSL_F}`)
      .replace(
        '#include <map_fragment>',
        `{
  vec3 N = normalize(vRockNormal);
  rkW = pow(abs(N), vec3(4.0));
  rkW /= rkW.x + rkW.y + rkW.z;
  vec3 nR, oR, nC, oC;
  vec3 cR = rkTri(tRockCol, tRockNrm, tRockOrm, uRockScale.x, N, nR, oR) * uRockTint;
  vec3 cC = rkTri(tCapCol, tCapNrm, tCapOrm, uRockScale.y, N, nC, oC) * uCapTint;
  // the cap grows on what faces up, raggedly, thicker in the rock's hollows
  float n = rkNoise(vRockPos * 9.0) * 0.6 + rkNoise(vRockPos * 31.0) * 0.4;
  float up = N.y + (n - 0.5) * 0.7 + (oR.b - 0.5) * 0.4;
  rkCap = smoothstep(1.0 - uCap.x - uCap.y, 1.0 - uCap.x + uCap.y, up) * step(0.001, uCap.x);
  diffuseColor.rgb *= mix(cR, cC, rkCap);
  diffuseColor.rgb = mix(diffuseColor.rgb, uHazeCol, uHaze.z * smoothstep(uHaze.x, uHaze.y, length(vViewPosition)));
  rkNormal = normalize(mix(nR, nC, rkCap));
  rkRough = mix(oR.g, oC.g * uCapRough, rkCap);
  rkAO = mix(oR.r, oC.r, rkCap);
}`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(rkRough, 0.3, 1.0);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(rkNormal, 0.0)).xyz);')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= rkAO;
reflectedLight.indirectSpecular *= rkAO;`,
      );
  };
  mat.customProgramCacheKey = () => 'rocks';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'rocks';
  // loose rocks: a few shape variants, each an InstancedMesh (see the header)
  const looseGeos = [];
  if (looseRocks.length) {
    const V = Math.min(4, looseRocks.length);
    const lists = Array.from({ length: V }, () => []);
    looseRocks.forEach((r, i) => lists[i % V].push(r));
    for (const list of lists) {
      const r0 = list[0];
      const g = rockGeometry(r0.seed ?? 1, r0.detail ?? 10, r0);
      g.computeVertexNormals();
      looseGeos.push(g);
      const im = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((r, i) => {
        _e.set((r.tilt ?? 0) * 0.7, r.yaw ?? 0, (r.tilt ?? 0) * 0.4);
        _q.setFromEuler(_e);
        _m.compose(_v.set(r.x, r.y, r.z), _q, _n.set(r.size[0], r.size[1], r.size[2]));
        im.setMatrixAt(i, _m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false; // instances move when a blast throws them
      im.name = 'rocks-loose';
      im.userData.loose = { material: r0.loose === 'sand' ? 'sand' : 'stone' };
      mesh.add(im);
    }
  }
  return {
    mesh,
    uniforms: U,
    dispose() {
      geo.dispose();
      looseGeos.forEach((g) => g.dispose());
      mat.dispose();
    },
  };
}

// Rocks around a knoll: a ring of boulders half buried in its slope, mostly
// on the camera's side and the outer side, none in the lane between the
// tanks. heightAt gives the ground.
export function knollRocks({ x, top, width, outward, seed, heightAt, count = 7 }) {
  const R = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    // angle around the knoll, 0 = towards the camera (+z)
    const a = (R() * 2 - 1) * Math.PI * 0.62 + (R() < 0.35 ? outward * Math.PI * 0.5 : 0);
    const rr = width * (0.72 + R() * 0.45);
    const rx = x + Math.sin(a) * rr;
    const rz = 0.06 + Math.cos(a) * rr * 1.25;
    if (Math.abs(rz) < 0.1 && (rx - x) * outward < 0) continue;
    const s = width * (0.22 + R() * 0.3);
    const ground = heightAt(rx, rz);
    const sy = s * (0.6 + R() * 0.5);
    out.push({
      x: rx,
      y: Math.min(ground + sy * 0.25, top - sy * 0.35),
      z: rz,
      size: [s * (0.9 + R() * 0.5), sy, s * (0.8 + R() * 0.4)],
      yaw: R() * Math.PI * 2,
      tilt: (R() - 0.5) * 0.5,
      seed: Math.floor(R() * 1e6),
      detail: 9,
    });
  }
  return out;
}

// Pebbles scattered in an area (a few centimetres each), mostly in front.
export function pebbles({ area, count, seed, heightAt, size = [0.008, 0.03], keepOut }) {
  const R = rng(seed);
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const x = area[0] + R() * (area[1] - area[0]);
    const z = area[2] + R() * (area[3] - area[2]);
    if (keepOut && keepOut(x, z)) continue;
    const s = size[0] + Math.pow(R(), 2.2) * (size[1] - size[0]);
    out.push({ x, y: heightAt(x, z) + s * 0.15, z, size: [s, s * (0.5 + R() * 0.3), s * (0.7 + R() * 0.4)], yaw: R() * 6.28, tilt: (R() - 0.5) * 0.4, seed: Math.floor(R() * 1e6), detail: 3, cuts: 3, loose: 'stone' });
  }
  return out;
}
