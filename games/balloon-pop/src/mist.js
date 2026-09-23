// Soft mist banks lying on the water towards the horizon: open cylinder
// bands round the viewer with drifting noise, tinted by the haze colour of
// whichever way they face, so they glow gold towards the sun.
import * as THREE from 'three';
import { ATMO_GLSL } from './atmosphere.js';

const vertexShader = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uOpacity;
uniform float uScale;
varying vec3 vWorld;
varying vec2 vUv;
${ATMO_GLSL}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float n = texture2D(uNoise, vec2(vUv.x * uScale + uTime * 0.0015, vUv.y * 0.6 + uTime * 0.002)).r;
  n = n * 0.7 + texture2D(uNoise, vec2(vUv.x * uScale * 2.7 - uTime * 0.002, vUv.y * 1.3)).b * 0.3;
  float h = clamp(vUv.y, 0.0, 1.0);
  float a = smoothstep(0.3, 0.75, n) * pow(1.0 - h, 2.2) * smoothstep(0.0, 0.08, h + 0.04);
  vec3 col = atmoHaze(dir) * 1.05;
  gl_FragColor = vec4(col, a * uOpacity);
}`;

export class Mist {
  constructor(noise) {
    this.group = new THREE.Group();
    this.group.name = 'mist';
    this.materials = [];
    const bands = [
      { r: 260, h: 22, o: 0.45, s: 9 },
      { r: 520, h: 38, o: 0.55, s: 7 },
      { r: 1100, h: 70, o: 0.6, s: 5 },
    ];
    for (const b of bands) {
      const geo = new THREE.CylinderGeometry(b.r, b.r, b.h, 96, 1, true);
      geo.translate(0, b.h / 2 - 1, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uNoise: { value: noise },
          uTime: { value: 0 },
          uOpacity: { value: b.o },
          uScale: { value: b.s },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
      });
      this.materials.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = -400;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  update(t, camera) {
    for (const m of this.materials) m.uniforms.uTime.value = t;
    this.group.position.set(camera.position.x, 0, camera.position.z);
  }
}
