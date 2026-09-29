// Puddles: a thin sheet of muddy water laid at one level over the hollows of
// the ground. Wherever the ground is lower than the level there is water, as
// deep as the gap; the mesh is only built where that is so. The edge fades
// to nothing over the last few millimetres, so the mud shows through the
// shallows, and the water is glossy, mirroring the sky (the stage's
// environment) more and more at a low angle. Rain lands on it in rings: a
// grid of drops, each a ring growing and fading, bends the reflection.
import * as THREE from 'three';

export class Puddles {
  // terrain: for baseAt; level: water height (m); area: [x0, x1, z0, z1] to look for hollows in
  constructor({ terrain, level, area, cell = 0.025, color = 0x6a5238, deep = 0x2e2418, rough = 0.05, ior = 1.33, ripple = 1, rings = 1, tilt = 0.14 }) {
    const [x0, x1, z0, z1] = area;
    const nx = Math.ceil((x1 - x0) / cell) + 1;
    const nz = Math.ceil((z1 - z0) / cell) + 1;
    const depth = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) depth[j * nx + i] = level - terrain.baseAt(x0 + i * cell, z0 + j * cell);
    }
    const map = new Int32Array(nx * nz).fill(-1);
    const pos = [];
    const dep = [];
    const idx = [];
    const vert = (i, j) => {
      const k = j * nx + i;
      if (map[k] < 0) {
        map[k] = dep.length;
        pos.push(x0 + i * cell, level, z0 + j * cell);
        dep.push(depth[k]);
      }
      return map[k];
    };
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        if (Math.max(depth[k], depth[k + 1], depth[k + nx], depth[k + nx + 1]) <= 0) continue;
        const a = vert(i, j);
        const b = vert(i + 1, j);
        const c = vert(i, j + 1);
        const d = vert(i + 1, j + 1);
        idx.push(a, c, b, b, c, d);
      }
    }
    this.count = dep.length;
    const geo = new THREE.BufferGeometry();
    if (dep.length) {
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    }
    this.uniforms = { uTime: { value: 0 }, uRipple: { value: ripple }, uRings: { value: rings }, uTilt: { value: tilt }, uShallow: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) } };
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: rough, metalness: 0, ior, specularIntensity: 1, transparent: true });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aDepth;\nvarying float vDepth;\nvarying vec3 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth;\nvWp = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying float vDepth;
varying vec3 vWp;
uniform float uTime;
uniform float uRipple;
uniform float uRings;
uniform float uTilt;
uniform vec3 uShallow;
uniform vec3 uDeep;
float pdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// the slope of the water where raindrops have landed: two grids of drops,
// each cell holds one whose ring grows and fades on its own beat
vec2 pdRings(vec2 p, float t) {
  vec2 g = vec2(0.0);
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 11.0 : 19.0;
    vec2 q = p * sc + float(L) * 17.3;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h1 = pdHash(id + float(L) * 3.1);
    float h2 = pdHash(id * 1.7 + 5.3);
    if (h1 > 0.62) continue;
    float age = fract(t * (0.7 + h1) + h2);
    vec2 c = (vec2(pdHash(id + 7.7), pdHash(id + 9.1)) - 0.5) * 0.45;
    vec2 dv = f - c;
    float r = length(dv);
    float R = age * 0.5;
    float e = exp(-pow((r - R) / 0.06, 2.0));
    float amp = (1.0 - age) * (1.0 - age);
    g += dv / max(r, 1e-4) * cos((r - R) * 46.0) * e * amp * sc * 0.02;
  }
  return g;
}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  float shallow = smoothstep(0.0, 0.02, vDepth);
  diffuseColor.rgb = mix(uShallow, uDeep, shallow);
  diffuseColor.a = smoothstep(0.0, 0.004, vDepth) * 0.94;
}`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
  float dist = length(vViewPosition);
  float fade = uRipple / (1.0 + dist * 0.25);
  // a slow swell that stirs the mirror, and the rings of the raindrops
  vec2 sw = vec2(sin(vWp.x * 23.0 + uTime * 1.3) + sin(vWp.z * 31.0 - uTime * 1.1), cos(vWp.x * 17.0 - uTime * 0.9) + sin(vWp.z * 27.0 + vWp.x * 9.0 + uTime)) * 0.006;
  vec2 g = (sw + pdRings(vWp.xz, uTime) * uRings) * fade;
  // a slight lean towards the camera: the mirror then shows the brighter sky above the trees, not just the dark tree line
  vec3 wn = normalize(vec3(-g.x, 1.0, -g.y + uTilt));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
        );
    };
    mat.customProgramCacheKey = () => 'puddles';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'puddles';
    this.mesh.renderOrder = 1;
    this.mesh.visible = dep.length > 0;
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
