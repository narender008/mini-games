// Water spray and sparkles as GPU points: bow spray fanning off the chines,
// the churned mist behind the stern, splash sheets and droplets when the
// boat lands from a hop or bumps something, and golden sparkles when a ring
// is collected. Droplets fly ballistically, catch the sun (a soft round
// sprite lit from the sky and sun, brighter when backlit), and fade as they
// fall back into the water.
import * as THREE from 'three';
import { rand } from './config.js';
import { LAYER_FX } from './post.js';

const VERT = /* glsl */ `
attribute vec4 data;   // size, life 0..1, kind, seed
attribute vec3 tint;
uniform float uScale;
varying float vLife;
varying float vKind;
varying vec3 vTint;
varying float vSeed;
void main() {
  vLife = data.y;
  vKind = data.z;
  vTint = tint;
  vSeed = data.w;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float grow = data.z > 1.5 ? 1.0 : mix(0.6, 1.6, data.y);
  gl_PointSize = data.x * grow * uScale / max(0.5, -mv.z);
}`;

const FRAG = /* glsl */ `
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uGlow;
varying float vLife;
varying float vKind;
varying vec3 vTint;
varying float vSeed;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float a;
  vec3 col;
  if (vKind > 1.5) {
    // sparkle: a bright core with a soft four-point glint
    float core = exp(-r2 * 9.0);
    float star = exp(-abs(p.x * p.y) * 60.0) * (1.0 - r2);
    a = clamp(core + star * 0.6, 0.0, 1.0) * (1.0 - vLife);
    col = vTint * (1.5 + 4.0 * core);
  } else {
    // water: mist (kind 1) is soft and wide, droplets (kind 0) are rounder
    // (mist falls all the way to nothing at the sprite's rim, so no disc edge shows)
    float soft = vKind > 0.5 ? (exp(-r2 * 3.0) - 0.0498) / 0.9502 : (1.0 - smoothstep(0.45, 1.0, r2));
    a = soft * (1.0 - vLife * vLife) * (vKind > 0.5 ? 0.12 : 0.85);
    // fine mist scatters light forwards and reads white, never grey smoke
    col = vTint * (vKind > 0.5 ? uAmbient * 1.5 + uSunColor * 0.4 : uAmbient * 0.95 + uSunColor * 0.22);
    // droplets catch the sun as a tiny bright glint
    if (vKind < 0.5) col += uSunColor * 0.5 * exp(-dot(p - vec2(-0.3, -0.3), p - vec2(-0.3, -0.3)) * 8.0);
    col += vec3(0.25, 0.8, 1.0) * uGlow * 2.5;
  }
  gl_FragColor = vec4(col * a, a);
}`;

export class Spray {
  constructor({ scene, quality, sky }) {
    this.max = quality.particles;
    this.count = 0;
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max); // seconds left
    this.span = new Float32Array(this.max);
    this.drag = new Float32Array(this.max);
    this.data = new Float32Array(this.max * 4);
    this.tint = new Float32Array(this.max * 3);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('data', new THREE.BufferAttribute(this.data, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = {
      uScale: { value: 600 },
      uSunColor: sky.uniforms.uSunColor,
      uAmbient: { value: new THREE.Color(0.6, 0.7, 0.85) },
      uGlow: { value: 0 },
    };
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.points.frustumCulled = false;
    this.points.layers.set(LAYER_FX);
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.budget = 1;
  }

  setLook(ambient, glow = 0) {
    this.uniforms.uAmbient.value.copy(ambient);
    this.uniforms.uGlow.value = glow;
  }

  setViewport(heightPx) {
    this.uniforms.uScale.value = heightPx * 0.9;
  }

  // one particle; kind 0 droplet, 1 mist, 2 sparkle
  emit(x, y, z, vx, vy, vz, life, size, kind = 0, tint = null, drag = 0.4) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.span[i] = life;
    this.drag[i] = drag;
    this.data[i * 4] = size;
    this.data[i * 4 + 1] = 0;
    this.data[i * 4 + 2] = kind;
    this.data[i * 4 + 3] = Math.random();
    const t = tint || (kind === 2 ? [1, 0.85, 0.45] : [1, 1, 1]);
    this.tint[i * 3] = t[0];
    this.tint[i * 3 + 1] = t[1];
    this.tint[i * 3 + 2] = t[2];
    this.count = Math.min(this.max, this.count + 1);
  }

  // A splash: a crown sheet of droplets and a puff of mist.
  // A splash: a crown sheet of droplets thrown out round the hull, a few
  // big blobs, and a low puff of mist. radius: roughly the hull's half size.
  splash(x, y, z, strength, vx = 0, vz = 0, radius = 1.4) {
    const n = Math.round(150 * strength * this.budget) + 16;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * rand(0.7, 1.25);
      const sp = rand(1.5, 4.8) * (0.55 + strength);
      const big = Math.random() < 0.18;
      this.emit(x + Math.cos(a) * r, y + 0.05, z + Math.sin(a) * r, Math.cos(a) * sp + vx * 0.4, rand(2.2, 5.5) * (0.5 + strength * 0.8), Math.sin(a) * sp + vz * 0.4, rand(0.8, 1.6), big ? rand(0.12, 0.2) : rand(0.05, 0.1), 0);
    }
    for (let k = 0; k < n / 5; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * rand(0.6, 1.4);
      this.emit(x + Math.cos(a) * r, y + 0.25, z + Math.sin(a) * r, Math.cos(a) * 1.4 + vx * 0.35, rand(0.8, 2.2) * (0.6 + strength), Math.sin(a) * 1.4 + vz * 0.35, rand(1.2, 2.2), rand(0.5, 1.1), 1, null, 1.6);
    }
  }

  sparkle(x, y, z, n = 40, tint = [1, 0.85, 0.45]) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = rand(0.8, 3.2);
      this.emit(x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp + 1, Math.sin(a) * Math.cos(b) * sp, rand(0.7, 1.4), rand(0.08, 0.16), 2, tint, 1.6);
    }
  }

  update(dt) {
    const g = 9.81;
    let live = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.data[i * 4 + 1] = 1;
        continue;
      }
      this.life[i] -= dt;
      const d = Math.exp(-this.drag[i] * dt);
      const kind = this.data[i * 4 + 2];
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - (kind > 1.5 ? 1.2 : kind > 0.5 ? 0.6 : g) * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // droplets vanish into the water
      if (kind < 0.5 && this.pos[i * 3 + 1] < -0.05) this.life[i] = 0;
      this.data[i * 4 + 1] = Math.min(1, 1 - this.life[i] / this.span[i]);
      live++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.data.needsUpdate = true;
    geo.attributes.tint.needsUpdate = true;
    this.live = live;
  }
}
