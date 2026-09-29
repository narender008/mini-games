// Open water beyond the lane: a lake, the sea, a pond. A flat sheet at the
// water line that the terrain dips under, so the shore is wherever the land
// meets it. The surface is glassy, reflecting the sky (the stage's
// environment) more and more towards the horizon, with small wind ripples
// and the sun glinting on them; its own colour shows only when looking down
// into it. Distant ripples fade out so they never shimmer.
import * as THREE from 'three';

export class Water {
  // area: [x0, x1, z0, z1]; color: the water's body colour; ripple: strength
  constructor({ y, area, color = 0x1f5566, ripple = 1, rough = 0.04, waves = 0 }) {
    const [x0, x1, z0, z1] = area;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, waves ? 160 : 1, waves ? 60 : 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.uniforms = { uTime: { value: 0 }, uRipple: { value: ripple }, uWaves: { value: waves } };
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, ior: 1.33, specularIntensity: 1 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;\nuniform float uTime;\nuniform float uWaves;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
// long gentle swell (the sea); nothing on a lake
transformed.y += uWaves * (sin(position.z * 0.9 + uTime * 1.1) * 0.05 + sin(position.x * 0.37 + position.z * 0.5 + uTime * 0.8) * 0.04);`,
        )
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWaterPos;
uniform float uTime;
uniform float uRipple;
vec2 wtGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  // several small wave trains at different angles and sizes
  const int N = 6;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float a = fi * 2.39996 + 0.4;
    vec2 d = vec2(cos(a), sin(a));
    float k = 1.6 * pow(1.55, fi);
    float amp = 0.06 / k;
    float ph = dot(d, p) * k + t * sqrt(9.8 * k) * 0.5 + fi * 1.7;
    g += d * cos(ph) * amp * k;
  }
  return g;
}`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
  float dist = length(vViewPosition);
  // ripples fade with distance so they never shimmer; a little stays for the sparkle
  float fade = uRipple / (1.0 + dist * 0.12);
  vec2 g = wtGrad(vWaterPos.xz * 3.0, uTime) * fade + wtGrad(vWaterPos.xz * 0.7 + 13.0, uTime * 0.6) * fade * 0.6;
  vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
        );
    };
    mat.customProgramCacheKey = () => 'water';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'water';
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
