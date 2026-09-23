// Lightweight CPU particle systems drawn as soft point sprites: the puff of
// air and powder from a burst, sparks on golden pops, and water spray.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
attribute vec4 aColor;   // rgb (linear, may exceed 1 for glowing sparks), alpha
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
#include <common>
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale / max(-mvPosition.z, 0.1);
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
uniform float uSoftness;
varying vec4 vColor;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = pow(1.0 - r2, uSoftness) * vColor.a;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <fog_fragment>
}`;

export class ParticleSystem {
  constructor({ capacity = 1000, additive = false, softness = 1.5, name = 'particles' }) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity); // remaining
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.onWater = new Uint8Array(capacity); // 1 = make a ripple/splash when landing
    this.base = new Float32Array(capacity * 3);
    this.next = 0;
    this.active = 0;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    this.uniforms = {
      uScale: { value: 300 },
      uSoftness: { value: softness },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.uniforms]),
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    this.uniforms = material.uniforms;
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    this.points.name = name;
    this.points.renderOrder = 10;
  }

  setPixelScale(scale) {
    this.uniforms.uScale.value = scale;
  }

  emit(p, v, { life = 1, size0 = 0.1, size1 = 0.2, color, alpha = 1, drag = 1, gravity = 0, splash = 0 }) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size0;
    this.size1[i] = size1;
    this.alpha0[i] = alpha;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
    this.onWater[i] = splash;
  }

  // Returns landing events [{x, z, strength}] for particles that hit the sea.
  update(dt, landings) {
    const { pos, vel, col, size, life, maxLife } = this;
    for (let i = 0; i < this.capacity; i++) {
      if (life[i] <= 0) {
        if (col[i * 4 + 3] !== 0) {
          col[i * 4 + 3] = 0;
          size[i] = 0;
        }
        continue;
      }
      life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      vel[i * 3] *= k;
      vel[i * 3 + 1] = vel[i * 3 + 1] * k - this.gravity[i] * dt;
      vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0 && this.gravity[i] > 0) {
        if (this.onWater[i] && landings) landings.push({ x: pos[i * 3], z: pos[i * 3 + 2], strength: this.onWater[i] * 0.05 });
        life[i] = 0;
      }
      const t = 1 - Math.max(0, life[i]) / maxLife[i];
      size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      const fadeIn = Math.min(1, t * 12);
      col[i * 4] = this.base[i * 3];
      col[i * 4 + 1] = this.base[i * 3 + 1];
      col[i * 4 + 2] = this.base[i * 3 + 2];
      col[i * 4 + 3] = this.alpha0[i] * fadeIn * (1 - t) * (1 - t);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }
}
