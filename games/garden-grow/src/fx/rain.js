// Soft rain: a field of falling streaks and the little rings where drops hit.
//
// The streak field costs no CPU at all: every streak's place is worked out on
// the GPU from its seed and the time, inside a box that follows the view and
// wraps round, so it is always raining wherever the camera looks. Streaks use
// the same camera look as every other drop (thin, mostly clear, smeared by
// the shutter, glowing when backlit).
import * as THREE from 'three';
import { STREAK_LIB, streakMaterial, trackResolution, streakQuadGeometry } from './drops.js';

const RAIN_VERT = /* glsl */ `
${STREAK_LIB}
uniform vec3 uCenter; // middle of the box of rain
uniform vec3 uBox; // its size
uniform vec2 uWind; // sideways drift, m/s
uniform float uAmount; // 0..1: how many streaks fall
attribute vec4 aSeed;
void main() {
  vA = 0.0;
  if (aSeed.w > uAmount) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  // small drops, falling near their terminal speed
  float size = fract(aSeed.z * 13.1 + aSeed.x * 3.3);
  float speed = mix(3.2, 5.0, size);
  vec3 vel = vec3(uWind.x, -speed, uWind.y);
  vec3 p = aSeed.xyz * uBox + vel * uTime;
  p = uCenter + (fract((p - uCenter) / uBox + 0.5) - 0.5) * uBox;
  vec3 tail = p - vel * uExposure;
  float rad = mix(0.00035, 0.00075, size);
  float dPx, len, w;
  if (!streakQuad(tail, p, rad, dPx, len, w)) return;
  vSeed = aSeed.x;
  float cover = min(1.0, dPx / (1.5 * max(dPx * 0.5, 0.65))) * dPx / (len + dPx);
  // none right at the lens; far ones fade into the general wet air
  cover *= smoothstep(0.35, 1.1, w) * (1.0 - smoothstep(0.6, 1.0, w / (uBox.z * 0.9)));
  vA = cover;
  vCol = dropLight(p, 0.9, aSeed.x) * cover * uGain;
}`;

export class RainField {
  constructor(scene, count) {
    const quad = streakQuadGeometry();
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    this.material = streakMaterial(RAIN_VERT, {
      uCenter: { value: new THREE.Vector3(0, 2, 0) },
      uBox: { value: new THREE.Vector3(9, 4.4, 9) },
      uWind: { value: new THREE.Vector2(0, 0) },
      uAmount: { value: 0 },
    });
    this.uniforms = this.material.uniforms;
    this.uniforms.uGain.value = 16; // rain on film reads stronger than the raw physics
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
    trackResolution(this.mesh, this.uniforms.uRes);
    scene.add(this.mesh);
  }
}

const RING_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aRing; // x, y, z, start time
attribute vec2 aSize; // largest radius, seed
varying vec2 vUv;
varying float vT;
void main() {
  float t = (uTime - aRing.w) / 0.5;
  vT = t;
  if (t < 0.0 || t > 1.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vUv = position.xy;
  vec3 p = aRing.xyz + vec3(position.x, 0.0, position.y) * aSize.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const RING_FRAG = /* glsl */ `
uniform vec3 uEnv;
uniform vec3 uSunCol;
varying vec2 vUv;
varying float vT;
void main() {
  if (vT < 0.0 || vT > 1.0) discard;
  float r = length(vUv);
  float rr = mix(0.1, 1.0, 1.0 - exp(-vT * 3.5));
  float w = 0.05 + 0.08 * vT;
  float ring = exp(-pow((r - rr) / w, 2.0)) * pow(1.0 - vT, 2.0);
  // a little second ring inside the first
  ring += 0.4 * exp(-pow((r - rr * 0.55) / w, 2.0)) * pow(1.0 - vT, 3.0);
  if (ring < 0.004) discard;
  vec3 c = uEnv * 1.3 + uSunCol * 0.02;
  gl_FragColor = vec4(c * ring * 0.25, ring * 0.08);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Rings spreading on wet ground where drops land: a pooled ring buffer,
// each ring written once and animated on the GPU.
export class Rings {
  constructor(scene, capacity) {
    this.capacity = capacity;
    this.next = 0;
    const plane = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index;
    g.setAttribute('position', plane.attributes.position);
    this.a = new Float32Array(capacity * 4).fill(-10);
    this.b = new Float32Array(capacity * 2);
    this.aRing = new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.b, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aRing', this.aRing);
    g.setAttribute('aSize', this.aSize);
    g.instanceCount = capacity;
    this.uniforms = {
      uTime: { value: 0 },
      uEnv: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.dirty = false;
    scene.add(this.mesh);
  }

  add(x, y, z, time, size) {
    const i = this.next;
    this.next = (i + 1) % this.capacity;
    this.a[i * 4] = x;
    this.a[i * 4 + 1] = y + 0.0015;
    this.a[i * 4 + 2] = z;
    this.a[i * 4 + 3] = time;
    this.b[i * 2] = size;
    this.b[i * 2 + 1] = Math.random();
    this.dirty = true;
  }

  update(time, light) {
    this.uniforms.uTime.value = time;
    this.uniforms.uEnv.value.copy(light.env);
    this.uniforms.uSunCol.value.copy(light.sunColor);
    if (this.dirty) {
      this.aRing.needsUpdate = true;
      this.aSize.needsUpdate = true;
      this.dirty = false;
    }
  }
}

const VEIL_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const VEIL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAmount;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vWorld;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  // soft curtains of rain drifting across, thicker low down
  vec2 p = vec2(vWorld.x * 0.35 + uTime * 0.05, vWorld.y * 0.5);
  float n = nn(p) * 0.6 + nn(p * 2.3 + 7.0) * 0.4;
  float streaks = 0.75 + 0.25 * nn(vec2(vWorld.x * 6.0, vWorld.y * 0.4 + uTime * 1.5));
  float h = vWorld.y;
  float a = smoothstep(0.0, 0.5, h) * (1.0 - smoothstep(1.2, 3.6, h)) * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
  a *= (0.55 + 0.45 * n) * streaks * uAmount;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// A faint veil of distant rain: a tall soft curtain some way behind the
// garden, turned to face the camera, fading out at the ground and above.
export class Veil {
  constructor(scene) {
    this.uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color() } };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 4, 1, 1).translate(0, 2, 0),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VEIL_VERT,
        fragmentShader: VEIL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -4;
    this.mesh.visible = false;
    this.fwd = new THREE.Vector3();
    scene.add(this.mesh);
  }

  update(time, amount, camera, light) {
    this.mesh.visible = amount > 0.004 && !!camera;
    if (!this.mesh.visible) return;
    camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    this.fwd.normalize();
    this.mesh.position.copy(camera.position).addScaledVector(this.fwd, 8.5);
    this.mesh.position.y = 0;
    this.mesh.rotation.set(0, Math.atan2(-this.fwd.x, -this.fwd.z), 0);
    this.uniforms.uTime.value = time;
    this.uniforms.uAmount.value = amount * 0.16;
    this.uniforms.uColor.value.copy(light.sky).multiplyScalar(0.9).add(light.env);
  }
}
