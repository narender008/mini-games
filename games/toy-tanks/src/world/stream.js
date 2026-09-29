// A small stream: a ribbon of water laid along a winding line at the water's
// own level, in the gorge the ground has been cut into. The ribbon is wider
// than the water needs to be; where the ground rises above the surface the
// water fades out over the last few millimetres, so the bank is wherever the
// ground meets it. The water is glassy, mirroring the trees and sky, with
// ripples that run along the flow and white water where it is fast or
// brushes the banks.
import * as THREE from 'three';
import { BLAST_GLSL, blastUniforms } from './react.js';

export class Stream {
  // terrain: for baseAt; centre(z) -> x of the stream's middle; half(z) -> half width; level(z) -> water height;
  // z0 (far) and z1 (near) bound the ribbon along the lane's depth
  constructor({ terrain, centre, half, level, z0, z1, color = 0x5f8f8a, deep = 0x1d3b3a, flow = 0.5, foam = 1, across = 11 }) {
    const zs = [];
    // fine steps near the camera, coarser far away
    for (let z = z1; z > z0; z -= Math.min(0.5, 0.04 + Math.abs(z - z1) * 0.06)) zs.push(z);
    zs.push(z0);
    const rows = zs.length;
    const pos = new Float32Array(rows * across * 3);
    const dep = new Float32Array(rows * across);
    const flw = new Float32Array(rows * across * 2);
    let s = 0;
    for (let r = 0; r < rows; r++) {
      const z = zs[r];
      if (r) s += Math.hypot(zs[r - 1] - z, centre(zs[r - 1]) - centre(z));
      const cx = centre(z);
      const hw = half(z) * 1.35;
      const y = level(z);
      for (let a = 0; a < across; a++) {
        const u = (a / (across - 1)) * 2 - 1;
        const x = cx + u * hw;
        const k = r * across + a;
        pos[k * 3] = x;
        pos[k * 3 + 1] = y;
        pos[k * 3 + 2] = z;
        // depth of water over the ground here; fades to nothing at the far end
        dep[k] = y - terrain.baseAt(x, z) - 0.05 * smooth(z0 * 0.8, z0, z);
        flw[k * 2] = u;
        flw[k * 2 + 1] = s;
      }
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let a = 0; a < across - 1; a++) {
        const i = r * across + a;
        // skip pieces where there is no water at all
        if (Math.max(dep[i], dep[i + 1], dep[i + across], dep[i + across + 1]) <= 0) continue;
        // (rows run away from the camera, so this winding faces up)
        idx.push(i, i + 1, i + across, i + 1, i + across + 1, i + across);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    geo.setAttribute('aFlow', new THREE.BufferAttribute(flw, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.uniforms = { ...blastUniforms, uTime: { value: 0 }, uFlow: { value: flow }, uFoam: { value: foam }, uShallow: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) } };
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, ior: 1.33, specularIntensity: 1, transparent: true });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aDepth;\nattribute vec2 aFlow;\nvarying float vDepth;\nvarying vec2 vFlow;\nvarying vec3 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth;\nvFlow = aFlow;\nvWp = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWp;
${BLAST_GLSL}
uniform float uTime;
uniform float uFlow;
uniform float uFoam;
uniform vec3 uShallow;
uniform vec3 uDeep;
float stHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float stNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(stHash(i), stHash(i + vec2(1, 0)), u.x), mix(stHash(i + vec2(0, 1)), stHash(i + vec2(1, 1)), u.x), u.y);
}
// the water's surface height: ripples stretched along the flow (towards +z), drifting with it
float stHeight(vec2 p, float t) {
  vec2 q = vec2(p.x, p.y - t * uFlow);
  return stNoise(q * vec2(34.0, 14.0)) * 0.55 + stNoise(q * vec2(79.0, 31.0) + 7.3) * 0.3 + stNoise(vec2(p.x, p.y - t * uFlow * 1.6) * vec2(150.0, 60.0) + 3.1) * 0.15;
}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
float stFoam = 0.0;
{
  float shallow = smoothstep(0.0, 0.05, vDepth);
  vec3 wc = mix(uShallow, uDeep, shallow);
  // white water: broken ripples where it is quick, and along the banks
  vec2 q = vec2(vWp.x, vWp.z - uTime * uFlow * 1.2);
  float rap = smoothstep(0.35, 0.75, stNoise(vec2(vWp.z * 2.2, vWp.x * 3.0) + 4.0));
  float br = smoothstep(0.55, 0.82, stNoise(q * vec2(60.0, 22.0)) * 0.6 + stNoise(q * vec2(130.0, 50.0) + 1.7) * 0.4);
  float bank = 1.0 - smoothstep(0.0, 0.006 + 0.006 * stNoise(q * 25.0), vDepth);
  stFoam = clamp((br * rap * 0.75 + bank * (0.4 + 0.5 * br)) * uFoam, 0.0, 1.0);
  diffuseColor.rgb = mix(wc, vec3(0.86, 0.9, 0.9), stFoam);
  diffuseColor.a = smoothstep(0.0, 0.005, vDepth) * mix(0.9, 1.0, stFoam);
}`,
        )
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.7, stFoam);')
        .replace(
          '#include <normal_fragment_maps>',
          `{
  float dist = length(vViewPosition);
  float fade = 1.0 / (1.0 + dist * 0.35);
  vec2 p = vWp.xz;
  float e = 0.004;
  float h0 = stHeight(p, uTime);
  vec2 g = vec2(stHeight(p + vec2(e, 0.0), uTime) - h0, stHeight(p + vec2(0.0, e), uTime) - h0) / e;
  // choppier where it is quick
  // and rings from a burst on the bank
  vec2 rg = blastRipple(p, uTime) * 1.1;
  vec3 wn = normalize(vec3(-(g.x * 0.012 + rg.x) * fade, 1.0, -(g.y * 0.012 + rg.y) * fade));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.85, 0.9, 0.9) * stFoam * 0.12;');
    };
    mat.customProgramCacheKey = () => 'stream';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'stream';
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
