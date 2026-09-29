// Trees for the scenery beyond the lane: real-sized (four to nine metres),
// a few metres to a few hundred metres away, where the lens softens them.
// A round leafy crown is a cluster of lumpy blobs, shaded darker inside and
// underneath and given a fine leafy bump in the shader; a pine is a stack of
// drooping skirts. Instanced: one draw per crown shape, one for the trunks.
// Crowns sway slowly in the wind.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three-gltf/utils/BufferGeometryUtils.js';
import { fbm3, rng } from '../config.js';

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

// a round crown, tree height 1 (the crown's middle is at about 0.62)
function roundCrown(seed, far) {
  const R = rng(seed);
  const blobs = [];
  const count = far ? 4 : 7 + Math.floor(R() * 4);
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * 0.2;
    const y = 0.6 + (R() - 0.35) * 0.3;
    const s = (0.15 + R() * 0.1) * (far ? 1.2 : 1);
    let g = new THREE.IcosahedronGeometry(1, far ? 1 : 4);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      _v.fromBufferAttribute(p, k);
      const n = fbm3(_v.x * 2.2 + i * 7, _v.y * 2.2, _v.z * 2.2, 3, seed) * 0.28 + fbm3(_v.x * 6.5, _v.y * 6.5 + i, _v.z * 6.5, 2, seed + 5) * 0.1;
      _v.multiplyScalar(s * (1 + n));
      _v.y *= 0.85;
      _v.x += Math.cos(a) * r;
      _v.z += Math.sin(a) * r;
      _v.y += y;
      p.setXYZ(k, _v.x, _v.y, _v.z);
    }
    blobs.push(g);
  }
  return finishCrown(blobs, 0.62, 0.3);
}

// a pine: stacked, drooping skirts of needles, narrowing to the top
function pineCrown(seed, far) {
  const R = rng(seed);
  const parts = [];
  const tiers = far ? 4 : 7 + Math.floor(R() * 3);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = 0.14 + t * 0.8;
    const rad = 0.23 * (1 - t * 0.88) + 0.02;
    let g = new THREE.ConeGeometry(rad, rad * 1.25, far ? 7 : 14, far ? 1 : 3, true);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      _v.fromBufferAttribute(p, k);
      const ang = Math.atan2(_v.z, _v.x);
      // ragged, drooping edge of branches
      const edge = Math.max(0, -_v.y / (rad * 0.625));
      const n = fbm3(Math.cos(ang) * 2 + i, Math.sin(ang) * 2, i * 0.7, 3, seed) * 0.35 * edge;
      _v.x *= 1 + n;
      _v.z *= 1 + n;
      _v.y += y - edge * edge * rad * 0.25 + fbm3(_v.x * 9, i, _v.z * 9, 2, seed + 3) * 0.02;
      p.setXYZ(k, _v.x, _v.y, _v.z);
    }
    parts.push(g);
  }
  return finishCrown(parts, 0.5, 0.45);
}

// merge, then bake a darkening towards the inside and the bottom (light
// barely gets into a real crown)
function finishCrown(parts, cy, ry) {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  _c.set(0, cy, 0);
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const out = Math.min(1, _v.clone().sub(_c).length() / (ry * 1.1));
    const up = THREE.MathUtils.smoothstep(_v.y, cy - ry, cy + ry * 0.8);
    const k = 0.35 + 0.65 * Math.min(1, out * 0.7 + up * 0.5);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function trunkGeometry(pine) {
  const parts = [];
  const t = new THREE.CylinderGeometry(pine ? 0.012 : 0.022, pine ? 0.028 : 0.04, pine ? 0.9 : 0.62, 8, 1, true);
  t.translate(0, pine ? 0.45 : 0.31, 0);
  parts.push(t);
  if (!pine) {
    for (const [a, l] of [[0.6, 0.2], [-0.8, 0.17], [2.4, 0.15]]) {
      const b = new THREE.CylinderGeometry(0.008, 0.016, l, 6, 1, true);
      b.translate(0, l / 2, 0);
      b.rotateZ(0.7);
      b.rotateY(a);
      b.translate(0, 0.42, 0);
      parts.push(b);
    }
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
}

const SWAY_GLSL = `
uniform float uTime;
uniform float uWind;
varying vec3 vLeaf;`;

// list: [{ x, y, z, h, seed }]  look: { kind: 'round' | 'pine', colors: [hex...], trunk: hex, variants }
export class Trees {
  constructor({ list, look = {} }) {
    const L = { kind: 'round', colors: [0x4d7a26, 0x5f8d2c, 0x3f6b24, 0x74a03a], trunk: 0x5a4632, variants: 3, seed: 5, far: false, ...look };
    const pine = L.kind === 'pine';
    const R = rng(L.seed);
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0 } };
    const crownMat = this.material({ vertexColors: true, roughness: 0.85 }, true, pine);
    const trunkMat = this.material({ color: L.trunk, roughness: 0.9 }, false, pine);
    const shapes = [];
    for (let i = 0; i < L.variants; i++) shapes.push(pine ? pineCrown(L.seed * 31 + i, L.far) : roundCrown(L.seed * 31 + i, L.far));
    const byShape = shapes.map(() => []);
    list.forEach((t, i) => byShape[i % shapes.length].push(t));
    this.meshes = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const trunk = new THREE.InstancedMesh(trunkGeometry(pine), trunkMat, Math.max(1, list.length));
    let ti = 0;
    shapes.forEach((geo, k) => {
      const items = byShape[k];
      const mesh = new THREE.InstancedMesh(geo, crownMat, Math.max(1, items.length));
      mesh.count = items.length;
      items.forEach((t, i) => {
        q.setFromAxisAngle(up, R() * Math.PI * 2);
        const w = t.h * (0.85 + R() * 0.35) * (t.wide ?? 1);
        m4.compose(p.set(t.x, t.y - t.h * 0.02, t.z), q, s.set(w, t.h, w));
        mesh.setMatrixAt(i, m4);
        trunk.setMatrixAt(ti++, m4);
        mesh.setColorAt(i, c.set(L.colors[Math.floor(R() * L.colors.length)]).multiplyScalar(0.9 + R() * 0.2));
      });
      mesh.name = `trees-${k}`;
      this.meshes.push(mesh);
    });
    trunk.count = ti;
    trunk.name = 'trunks';
    this.meshes.push(trunk);
    for (const m of this.meshes) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere?.();
    }
    this.group = new THREE.Group();
    this.group.add(...this.meshes);
  }

  material(params, crown, pine) {
    const mat = new THREE.MeshStandardMaterial({ metalness: 0, ...params });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>${SWAY_GLSL}`)
        .replace(
          '#include <project_vertex>',
          `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
vLeaf = transformed * vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
{
  vec3 root = instanceMatrix[3].xyz;
  float hgt = max(transformed.y, 0.0);
  float ph = root.x * 0.37 + root.z * 0.23;
  float sway = (sin(uTime * 0.7 + ph) * 0.6 + sin(uTime * 1.7 + ph * 2.0) * 0.25) * (0.3 + abs(uWind) * 1.5);
  mvPosition.x += sway * hgt * hgt * length(instanceMatrix[1].xyz) * 0.012;
}
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
        );
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLeaf;
float lfHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float lfNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lfHash(i), lfHash(i + vec3(1, 0, 0)), f.x), mix(lfHash(i + vec3(0, 1, 0)), lfHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lfHash(i + vec3(0, 0, 1)), lfHash(i + vec3(1, 0, 1)), f.x), mix(lfHash(i + vec3(0, 1, 1)), lfHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`);
      if (crown) {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
float leaf = lfNoise(vLeaf * ${pine ? '14.0' : '7.0'}) * 0.6 + lfNoise(vLeaf * ${pine ? '37.0' : '19.0'}) * 0.4;
diffuseColor.rgb *= mix(0.78, 1.1, leaf);`,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
{
  // clumps of leaves: bump the normal with the same noise, fading out where it would shimmer
  float hh = leaf;
  vec2 dh = vec2(dFdx(hh), dFdy(hh));
  float fade = 1.0 - smoothstep(0.08, 0.35, length(dh));
  vec3 sx = dFdx(-vViewPosition);
  vec3 sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2) * 1.6 * fade;
  normal = normalize(abs(det) * normal - grad);
}`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
// light through the leaves at the edge of the crown
totalEmissiveRadiance += diffuseColor.rgb * 0.05;`,
          );
      }
    };
    mat.customProgramCacheKey = () => `tree-${crown ? 'crown' : 'trunk'}-${pine ? 'pine' : 'round'}`;
    return mat;
  }

  update(dt, time, world) {
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value = world.wind ?? 0;
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.material.dispose();
      m.dispose?.();
    }
  }
}

// scatter trees where fn(x, z) says (0..1 density) on the ground
export function scatterTrees({ count, area, density, heightAt, size = [4, 8], seed = 3, minGap = 2 }) {
  const R = rng(seed);
  const out = [];
  const taken = new Set(); // one tree per minGap cell, so they never overlap
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const x = area[0] + R() * (area[1] - area[0]);
    const z = area[2] + R() * (area[3] - area[2]);
    if (R() > density(x, z)) continue;
    let ok = true;
    const key = `${Math.floor(x / minGap)},${Math.floor(z / minGap)}`;
    if (taken.has(key)) ok = false;
    if (!ok) continue;
    taken.add(key);
    out.push({ x, y: heightAt(x, z), z, h: size[0] + R() * (size[1] - size[0]) });
  }
  return out;
}
