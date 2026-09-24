// Soil for every planting zone: the cottage bed's gentle mound and the level
// tops of planters, window box and pots. The surface shades baked tilled-soil
// maps (two scales, height-blended so the tiling never shows), darkens and
// glistens where the wet map says it is wet, and sinks where a planting hole
// was dug. Thousands of instanced crumbs, clods and small stones sit on top
// so it reads as real soil up close; digging pushes them aside.
import * as THREE from 'three';
import { inZone, soilHeight, clampToZone } from '../layout.js';
import { mulberry32, lerp, smooth } from '../config.js';
import { NOISE_GLSL, WET_GLSL, HOLES_GLSL, MAX_HOLES } from './groundglsl.js';
import { soilMaps } from './soilmaps.js';
import { rockGeometry } from './rocks.js';

export const HOLE_R = 0.034;
export const HOLE_D = 0.012;
const HOLE_SETTLE = 120; // seconds for a hole to settle to a shallow dimple
const BED_SKIRT = 0.07; // the bed's soil runs on under the lawn edge
const WALL_SKIRT = 0.006; // container soil tucks under the rim

// The same profile as holeProfile() in groundglsl.js.
function holeProfile(r) {
  const b = Math.max(0, 1 - r * r);
  const q = (r - 1.12) / 0.3;
  return -b * b + 0.38 * Math.exp(-q * q);
}

function zoneArea(z) {
  if (z.shape === 'circle') return Math.PI * z.r * z.r;
  if (z.shape === 'rect') return z.w * z.d;
  return Math.PI * z.rx * z.rz;
}

// A point spread evenly over a zone (pulled `pad` in from its edge).
function randomIn(zone, rnd, pad) {
  for (let k = 0; k < 40; k++) {
    let x;
    let z;
    if (zone.shape === 'rect') {
      x = zone.cx + (rnd() - 0.5) * zone.w;
      z = zone.cz + (rnd() - 0.5) * zone.d;
    } else {
      const rx = zone.shape === 'circle' ? zone.r : zone.rx;
      const rz = zone.shape === 'circle' ? zone.r : zone.rz;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd());
      x = zone.cx + Math.cos(a) * r * rx;
      z = zone.cz + Math.sin(a) * r * rz;
    }
    if (inZone(zone, x, z, pad)) return [x, z];
  }
  return [zone.cx, zone.cz];
}

// Height of a zone's drawn surface, including the skirt beyond its edge.
function surfaceY(zone, x, z, skirt) {
  if (inZone(zone, x, z)) return soilHeight(zone, x, z);
  if (zone.container !== 'border') return zone.y;
  const [ex, ez] = clampToZone(zone, x, z);
  if (skirt <= 0) return soilHeight(zone, ex, ez);
  const d = Math.hypot(x - ex, z - ez);
  return lerp(soilHeight(zone, ex, ez), -0.008, smooth(0, skirt, d));
}

// A grid over the zone (grown by `skirt`); vertices outside are pulled onto
// the edge, so the outline is smooth. Positions are in world space.
function zoneSurface(zone, step, skirt) {
  const grown = (x, z) => inZone(zone, x, z, -skirt);
  const hw = zone.shape === 'rect' ? zone.w / 2 : zone.shape === 'circle' ? zone.r : zone.rx;
  const hd = zone.shape === 'rect' ? zone.d / 2 : zone.shape === 'circle' ? zone.r : zone.rz;
  const nx = Math.ceil(((hw + skirt) * 2) / step) + 1;
  const nz = Math.ceil(((hd + skirt) * 2) / step) + 1;
  const sx = ((hw + skirt) * 2) / (nx - 1);
  const sz = ((hd + skirt) * 2) / (nz - 1);
  const pos = new Float32Array(nx * nz * 3);
  const nor = new Float32Array(nx * nz * 3);
  const inside = new Uint8Array(nx * nz);
  const e = 0.004;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let x = zone.cx - hw - skirt + i * sx;
      let z = zone.cz - hd - skirt + j * sz;
      const v = j * nx + i;
      if (grown(x, z)) inside[v] = 1;
      else [x, z] = clampToZone(zone, x, z, -skirt);
      const y = surfaceY(zone, x, z, skirt);
      pos[v * 3] = x;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = z;
      const gx = (surfaceY(zone, x + e, z, skirt) - surfaceY(zone, x - e, z, skirt)) / (2 * e);
      const gz = (surfaceY(zone, x, z + e, skirt) - surfaceY(zone, x, z - e, skirt)) / (2 * e);
      const l = Math.hypot(gx, 1, gz);
      nor[v * 3] = -gx / l;
      nor[v * 3 + 1] = 1 / l;
      nor[v * 3 + 2] = -gz / l;
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      if (inside[a] + inside[b] + inside[c] + inside[d] === 0) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  return { pos, nor, idx };
}

function toGeometry(parts) {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.pos.length / 3;
    ni += p.idx.length;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const p of parts) {
    pos.set(p.pos, ov * 3);
    nor.set(p.nor, ov * 3);
    for (let k = 0; k < p.idx.length; k++) idx[oi + k] = p.idx[k] + ov;
    ov += p.pos.length / 3;
    oi += p.idx.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// ------------------------------------------------------------ materials

const SOIL_DECL = /* glsl */ `
${NOISE_GLSL}
${WET_GLSL}
${HOLES_GLSL}
uniform sampler2D uSoilA;
uniform sampler2D uSoilB;
uniform vec4 uSoilP; // 1/tile, potting mix (0/1)
varying vec3 vSoilW;
varying vec3 vSoilN;
`;

const SOIL_MAIN = /* glsl */ `
vec2 sxz = vSoilW.xz;
const mat2 SROT = mat2(0.8, 0.6, -0.6, 0.8);
vec2 su1 = sxz * uSoilP.x;
vec2 su2 = SROT * sxz * uSoilP.x * 0.71 + vec2(0.31, 0.57);
vec4 sa1 = texture2D(uSoilA, su1);
vec4 sa2 = texture2D(uSoilA, su2);
vec4 sb1 = texture2D(uSoilB, su1);
vec4 sb2 = texture2D(uSoilB, su2);
// pick whichever sample stands higher, varied by a slow noise: no visible tiling
float smac = gNoise(sxz * 1.6) * 0.62 + gNoise(sxz * 4.1 + 7.7) * 0.38;
float sbw = smoothstep(-0.05, 0.05, sa2.a - sa1.a + (smac - 0.5) * 0.8);
vec3 sAlb = mix(sa1.rgb, sa2.rgb, sbw);
vec4 sB = mix(sb1, sb2, sbw);
float sH = mix(sa1.a, sa2.a, sbw);
vec2 sN = mix(sb1.xy * 2.0 - 1.0, (sb2.xy * 2.0 - 1.0) * SROT, sbw);
float sm2 = gNoise(sxz * 4.7 + 3.1);
sAlb *= 0.84 + 0.3 * smac;
sAlb *= mix(vec3(1.0), vec3(1.07, 1.0, 0.92), sm2);
sAlb = mix(sAlb, sAlb * vec3(0.6, 0.56, 0.54), uSoilP.y);
vec4 sHole = holeInfo(sxz);
sAlb *= mix(1.0, 0.7, sHole.z);
sAlb *= 1.0 + 0.12 * sHole.w;
// water: damp soil darkens and deepens, standing water lingers in hollows
vec2 sWet = wetAt(sxz);
float swn = gNoise(sxz * 19.0) * 0.6 + gNoise(sxz * 53.0) * 0.4;
float sDamp = smoothstep(0.0, 1.0, clamp(sWet.x * 1.6 - (swn - 0.5) * 0.5 * (1.0 - sWet.x) * min(1.0, sWet.x * 4.0), 0.0, 1.0));
sDamp = max(sDamp, sHole.z * 0.45);
float sPool = smoothstep(0.35, 0.9, sWet.y) * smoothstep(0.22, 0.08, sH + (swn - 0.5) * 0.12) * 0.7;
sAlb = mix(sAlb, pow(sAlb, vec3(1.3)) * 0.44, sDamp);
diffuseColor.rgb = sAlb;
float sRough = mix(sB.z, 0.72, sDamp);
sRough = mix(sRough, 0.25, sPool);
// tiny wet facets catch the light
vec3 sgr = gHash3(floor(sxz * 380.0));
float sGlint = step(0.985, sgr.x) * smoothstep(0.3, 0.7, sWet.y) * step(0.12, sH);
sRough = mix(sRough, 0.06, sGlint);
float sAO = mix(1.0, sB.w, 0.85) * (1.0 - 0.3 * sHole.z);
// a damp surface drinks the light: less sky sheen, except off the standing water
float sSpec = mix(1.0, 0.5, sDamp * (1.0 - sPool));
vec3 sNg = normalize(vSoilN);
vec3 sNw = normalize(vec3(sNg.x + sN.x * 1.25 - sHole.x, sNg.y, sNg.z + sN.y * 1.25 - sHole.y) + vec3(sgr.y - 0.5, 0.0, sgr.z - 0.5) * sGlint * 0.6);
`;

// Dry, dusty soil is very matte even at grazing angles (its crumbs shade
// their own sheen); water brings the gloss back.
const SOIL_SPEC = /* glsl */ `
float sWetK = max(sDamp * 0.35, sPool);
material.specularColor *= mix(0.55, 1.0, sWetK);
material.specularColorBlended *= mix(0.55, 1.0, sWetK);
material.specularF90 = mix(0.3, 0.8, sWetK) + sGlint * 0.5;
`;

export function soilSurfaceMaterial(maps, uniforms, { tile, pot }) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms, {
      uSoilA: { value: maps.a },
      uSoilB: { value: maps.b },
      uSoilP: { value: new THREE.Vector4(1 / tile, pot ? 1 : 0, 0, 0) },
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${HOLES_GLSL}\nvarying vec3 vSoilW;\nvarying vec3 vSoilN;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 soilW0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        transformed.y += holeHeight(soilW0.xz);
        vSoilW = soilW0 + vec3(0.0, transformed.y - position.y, 0.0);
        vSoilN = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${SOIL_DECL}`)
      .replace('#include <map_fragment>', SOIL_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = sRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(sNw, 0.0)).xyz);')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${SOIL_SPEC}`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= sAO;\nreflectedLight.indirectSpecular *= mix(1.0, sAO, 0.6) * sSpec;');
  };
  m.customProgramCacheKey = () => 'gg-soil';
  return m;
}

// Crumbs, clods and stones: instance colour, a little texture from the soil
// map, dark where they sit in the soil, wet like the ground around them.
export function lumpMaterial(maps, uniforms, stone) {
  const m = new THREE.MeshStandardMaterial({ roughness: stone ? 0.84 : 0.93, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms, { uSoilA: { value: maps.a } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLumpW;\nvarying vec3 vLumpN;\nvarying vec3 vLumpP;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLumpP = position;
        #ifdef USE_INSTANCING
          vLumpW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vLumpN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vLumpW = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vLumpN = normalize(mat3(modelMatrix) * objectNormal);
        #endif`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\n${WET_GLSL}\nuniform sampler2D uSoilA;\nvarying vec3 vLumpW;\nvarying vec3 vLumpN;\nvarying vec3 vLumpP;\nfloat lRough;\nfloat lAO;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        ${
          stone
            ? `float lSpeck = gNoise(vLumpP.xz * 9.0 + vLumpP.y * 7.0) * 0.5 + gNoise(vLumpP.xy * 23.0 + vLumpW.xz * 50.0) * 0.5;
               diffuseColor.rgb *= 0.78 + 0.44 * lSpeck;
               lRough = roughness + (lSpeck - 0.5) * 0.2;`
            : `vec4 lTex = texture2D(uSoilA, (vLumpW.xz + vLumpW.y * vec2(0.7, -0.5)) / 0.6);
               float lLum = dot(lTex.rgb, vec3(0.3, 0.59, 0.11)) / 0.05;
               diffuseColor.rgb *= mix(1.0, clamp(lLum, 0.45, 1.7), 0.55);
               diffuseColor.rgb *= 1.0 + 0.3 * smoothstep(0.45, 0.95, vLumpN.y);
               lRough = roughness;`
        }
        float lContact = smoothstep(-0.95, 0.4, vLumpP.y);
        diffuseColor.rgb *= mix(0.3, 1.0, lContact);
        lAO = mix(0.35, 1.0, lContact);
        vec2 lWet = wetAt(vLumpW.xz);
        float lDamp = smoothstep(0.0, 0.8, lWet.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, pow(diffuseColor.rgb, vec3(1.1)) * ${stone ? '0.55' : '0.4'}, lDamp);
        lRough = mix(lRough, ${stone ? '0.38' : '0.66'}, lDamp);
        lRough = mix(lRough, 0.25, lWet.y * ${stone ? '0.5' : '0.2'});`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = lRough;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= lAO;\nreflectedLight.indirectSpecular *= lAO * ${stone ? 'mix(0.55, 1.0, lDamp)' : '1.0'};`);
  };
  m.customProgramCacheKey = () => (stone ? 'gg-stone' : 'gg-lump');
  return m;
}

// ------------------------------------------------------------ the soil

const PICK_MAT = new THREE.MeshBasicMaterial({ visible: false });
const TIER = {
  high: { step: 0.01, lumps: 1 },
  medium: { step: 0.014, lumps: 0.55 },
  low: { step: 0.02, lumps: 0.25 },
};
const POOL = 16 * 14; // spare crumbs for the rims of dug holes

export class Soil {
  constructor({ renderer, quality, wet }) {
    this.tier = TIER[quality.tier] ?? TIER.high;
    this.shadows = quality.shadows && quality.tier === 'high';
    this.maps = soilMaps(renderer, quality.tier === 'low' ? 512 : 1024);
    this.holes = Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, HOLE_R, 0));
    this.holeState = this.holes.map(() => ({ age: 0, used: false, moved: [] }));
    this.uniforms = { ...wet.uniforms, uHoles: { value: this.holes } };
    this.materials = {
      bed: soilSurfaceMaterial(this.maps, this.uniforms, { tile: 0.6, pot: false }),
      pot: soilSurfaceMaterial(this.maps, this.uniforms, { tile: 0.34, pot: true }),
      lump: lumpMaterial(this.maps, this.uniforms, false),
      stone: lumpMaterial(this.maps, this.uniforms, true),
    };
    this.geos = {
      clod: rockGeometry({ detail: 2, lumpy: 0.5, seed: 3 }),
      crumb: rockGeometry({ detail: 1, lumpy: 0.4, seed: 7 }),
      stone: rockGeometry({ detail: 2, lumpy: 0.16, seed: 11 }),
    };
    this.group = new THREE.Group();
    this.pickMeshes = [];
    this.zones = [];
    this.sets = [];
    this.acc = 0;
  }

  build(layout) {
    this.clear();
    this.zones = layout.zones;
    const bed = [];
    const pots = [];
    for (const zone of this.zones) {
      const border = zone.container === 'border';
      (border ? bed : pots).push(zoneSurface(zone, this.tier.step, border ? BED_SKIRT : WALL_SKIRT));
      const pick = new THREE.Mesh(toGeometry([zoneSurface(zone, 0.05, 0)]), PICK_MAT);
      pick.userData.zone = zone;
      pick.userData.surface = 'soil';
      this.pickMeshes.push(pick);
      this.group.add(pick);
    }
    for (const [parts, mat] of [
      [bed, this.materials.bed],
      [pots, this.materials.pot],
    ]) {
      if (!parts.length) continue;
      const mesh = new THREE.Mesh(toGeometry(parts), mat);
      mesh.receiveShadow = true;
      mesh.userData.owned = true;
      this.group.add(mesh);
    }
    this.buildLumps(layout);
  }

  // Scatter crumbs, clods, stones (and perlite in pots) over every zone.
  buildLumps(layout) {
    const rnd = mulberry32(layout.name.length * 131 + 7);
    const k = this.tier.lumps;
    const col = new THREE.Color();
    const kinds = {
      crumb: { geo: this.geos.crumb, mat: this.materials.lump, list: [], pool: POOL },
      clod: { geo: this.geos.clod, mat: this.materials.lump, list: [], pool: 0, shadow: true },
      stone: { geo: this.geos.stone, mat: this.materials.stone, list: [], pool: 0 },
    };
    const soilCol = (pot) => {
      const v = 0.72 + rnd() * 0.55;
      if (pot) col.setRGB(0.21 * v, 0.16 * v, 0.13 * v, THREE.SRGBColorSpace);
      else col.setRGB(0.34 * v * (0.95 + rnd() * 0.12), 0.245 * v, 0.17 * v * (0.9 + rnd() * 0.15), THREE.SRGBColorSpace);
      return col.clone();
    };
    const STONES = [
      [0.48, 0.42, 0.36],
      [0.54, 0.46, 0.37],
      [0.4, 0.36, 0.32],
      [0.56, 0.5, 0.42],
      [0.46, 0.36, 0.27],
      [0.34, 0.31, 0.28],
    ];
    const add = (kind, zone, pad, size, flat, colour) => {
      const [x, z] = randomIn(zone, rnd, pad);
      const s = size;
      kinds[kind].list.push({
        x,
        z,
        sx: s * (0.75 + rnd() * 0.5),
        sy: s * flat * (0.8 + rnd() * 0.4),
        sz: s * (0.75 + rnd() * 0.5),
        yaw: rnd() * Math.PI * 2,
        tx: (rnd() - 0.5) * 0.5,
        tz: (rnd() - 0.5) * 0.5,
        colour,
      });
    };
    for (const zone of this.zones) {
      const pot = zone.container !== 'border';
      const area = zoneArea(zone);
      const n = (d) => Math.round(area * d * k);
      for (let i = 0, c = n(pot ? 900 : 1100); i < c; i++) add('crumb', zone, 0.004, 0.0012 + rnd() ** 2 * 0.0032, 0.75, soilCol(pot));
      for (let i = 0, c = n(pot ? 40 : 190); i < c; i++) add('clod', zone, 0.01, 0.004 + rnd() ** 1.6 * 0.008, 0.55, soilCol(pot));
      for (let i = 0, c = n(pot ? 30 : 150); i < c; i++) {
        const p = STONES[Math.floor(rnd() * STONES.length)];
        const v = 0.85 + rnd() * 0.25;
        add('stone', zone, 0.006, 0.0018 + rnd() ** 2.2 * 0.0065, 0.6, new THREE.Color().setRGB(p[0] * v, p[1] * v, p[2] * v, THREE.SRGBColorSpace));
      }
      // potting mix: white perlite grains
      if (pot) for (let i = 0, c = n(420); i < c; i++) add('stone', zone, 0.004, 0.0012 + rnd() * 0.0016, 0.8, new THREE.Color().setRGB(0.9, 0.89, 0.86, THREE.SRGBColorSpace));
    }
    // a few crumbs spill onto the lawn edge round the bed
    for (const zone of this.zones) {
      if (zone.container !== 'border') continue;
      const spill = { ...zone, rx: zone.rx + 0.05, rz: zone.rz + 0.05 };
      for (let i = 0, c = Math.round(160 * k); i < c; i++) {
        const [x, z] = randomIn(spill, rnd, 0);
        if (inZone(zone, x, z, -0.01)) continue;
        const s = 0.0015 + rnd() ** 2 * 0.004;
        kinds.crumb.list.push({ x, z, sx: s, sy: s * 0.7, sz: s * 1.1, yaw: rnd() * 6.28, tx: 0, tz: 0, colour: soilCol(false) });
      }
    }
    this.sets = [];
    for (const [id, kd] of Object.entries(kinds)) {
      if (!kd.list.length) continue;
      const total = kd.list.length + kd.pool;
      const mesh = new THREE.InstancedMesh(kd.geo, kd.mat, total);
      mesh.count = kd.list.length;
      mesh.receiveShadow = true;
      mesh.castShadow = !!kd.shadow && this.shadows;
      mesh.frustumCulled = false;
      mesh.userData.owned = true;
      for (let i = 0; i < kd.pool; i++) kd.list.push({ x: 0, z: 0, sx: 0, sy: 0, sz: 0, yaw: 0, tx: 0, tz: 0, colour: soilCol(false) });
      kd.list.forEach((it, i) => {
        mesh.setColorAt(i, it.colour);
        if (i < mesh.count) this.place(mesh, it, i);
      });
      mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      this.sets.push({ id, mesh, list: kd.list, base: mesh.count, next: 0, pool: kd.pool });
    }
  }

  place(mesh, it, i) {
    const y = this.surfaceAt(it.x, it.z) + it.sy * 0.3;
    _q.setFromEuler(_e.set(it.tx, it.yaw, it.tz));
    _m.compose(_p.set(it.x, y, it.z), _q, _s.set(it.sx, it.sy, it.sz));
    mesh.setMatrixAt(i, _m);
  }

  zoneAt(x, z) {
    for (const zone of this.zones) if (inZone(zone, x, z)) return zone;
    return null;
  }

  holeHeight(x, z) {
    let h = 0;
    for (const H of this.holes) {
      if (H.w <= 0) continue;
      const r = Math.hypot(x - H.x, z - H.y) / H.z;
      if (r < 2) h += holeProfile(r) * H.w;
    }
    return h;
  }

  // Drawn soil height at (x, z), or null when not over any zone.
  surfaceAt(x, z) {
    const zone = this.zoneAt(x, z);
    if (zone) return soilHeight(zone, x, z) + this.holeHeight(x, z);
    for (const zn of this.zones) if (zn.container === 'border' && inZone(zn, x, z, -BED_SKIRT)) return surfaceY(zn, x, z, BED_SKIRT);
    return 0;
  }

  heightAt(x, z) {
    const zone = this.zoneAt(x, z);
    return zone ? soilHeight(zone, x, z) + this.holeHeight(x, z) : null;
  }

  dig(x, z) {
    const zone = this.zoneAt(x, z);
    if (!zone) return;
    // a free slot, else the most settled (oldest) hole
    let slot = this.holeState.findIndex((h) => !h.used);
    if (slot < 0) {
      slot = 0;
      for (let i = 1; i < MAX_HOLES; i++) if (this.holeState[i].age > this.holeState[slot].age) slot = i;
    }
    const state = this.holeState[slot];
    state.used = true;
    state.age = 0;
    state.moved = [];
    this.holes[slot].set(x, z, HOLE_R, HOLE_D);
    const rnd = Math.random;
    for (const set of this.sets) {
      let touched = false;
      // push what lies in the hole out onto its rim
      for (let i = 0; i < set.mesh.count; i++) {
        const it = set.list[i];
        const dx = it.x - x;
        const dz = it.z - z;
        const d = Math.hypot(dx, dz);
        if (d > HOLE_R * 1.1) continue;
        const a = d > 1e-4 ? Math.atan2(dz, dx) : rnd() * 6.28;
        const r = HOLE_R * (1.05 + rnd() * 0.45);
        it.x = x + Math.cos(a) * r;
        it.z = z + Math.sin(a) * r;
        state.moved.push(set, i);
        touched = true;
      }
      // and heap a few more loose crumbs there
      if (set.pool) {
        for (let n = 0; n < 14; n++) {
          const i = set.base + set.next;
          set.next = (set.next + 1) % set.pool;
          set.mesh.count = Math.max(set.mesh.count, i + 1);
          const it = set.list[i];
          const a = rnd() * Math.PI * 2;
          const r = HOLE_R * (0.95 + rnd() * 0.6);
          const s = 0.0016 + rnd() ** 2 * 0.004;
          Object.assign(it, { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, sx: s, sy: s * 0.75, sz: s * (0.8 + rnd() * 0.4), yaw: rnd() * 6.28, tx: rnd() - 0.5, tz: rnd() - 0.5 });
          state.moved.push(set, i);
          touched = true;
        }
      }
      if (touched) set.dirty = true;
    }
    this.refreshHole(state);
  }

  refreshHole(state) {
    const m = state.moved;
    for (let k = 0; k < m.length; k += 2) this.place(m[k].mesh, m[k].list[m[k + 1]], m[k + 1]);
    for (const set of this.sets) {
      set.mesh.instanceMatrix.needsUpdate = true;
      set.dirty = false;
    }
  }

  update(dt) {
    // holes settle slowly as the loosened soil slumps back
    this.acc += dt;
    if (this.acc < 0.25) return;
    const step = this.acc;
    this.acc = 0;
    this.holeState.forEach((h, i) => {
      if (!h.used || h.age > HOLE_SETTLE) return;
      h.age += step;
      this.holes[i].w = HOLE_D * (0.3 + 0.7 * (1 - smooth(0, HOLE_SETTLE, h.age)));
      this.refreshHole(h);
    });
  }

  clear() {
    for (const obj of [...this.group.children]) {
      this.group.remove(obj);
      if (obj.isInstancedMesh) obj.dispose();
      else if (obj.geometry) obj.geometry.dispose();
    }
    this.pickMeshes = [];
    this.sets = [];
    for (let i = 0; i < MAX_HOLES; i++) {
      this.holes[i].w = 0;
      this.holeState[i] = { age: 0, used: false, moved: [] };
    }
  }

  dispose() {
    this.clear();
    for (const m of Object.values(this.materials)) m.dispose();
    for (const g of Object.values(this.geos)) g.dispose();
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
