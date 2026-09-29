// Soft shaped bits for the toys: little glossy hearts that float up from a
// petted friend, stars and confetti that flutter down at a welcome, and soft
// round glows. One pool of points drawn in a single call; each point is a
// shape (heart, star, confetti, dot), a colour, a size in metres and a life,
// and the CPU only moves it (gravity, drag, a sway, a pop-in) and fades it.
//
// The shapes are drawn in the fragment shader as distance fields, so they stay
// crisp and round at any size (nothing blocky). Hearts rock a little as they
// rise, confetti tumbles and flips edge-on, stars turn and twinkle.
import * as THREE from 'three';
import { TAU, easeBack } from '../config.js';

export const SHAPE = { dot: 0, heart: 1, star: 2, confetti: 3 };

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute vec4 aInfo; // size (m), phase, spin rate, shape
uniform float uScale;
uniform float uTime;
varying vec4 vColor;
varying vec4 vInfo;
varying float vSpin;
varying float vFlip;
void main() {
  vColor = aColor;
  vInfo = aInfo;
  // hearts rock, the rest turn
  vSpin = aInfo.w > 0.5 && aInfo.w < 1.5 ? sin(uTime * 2.6 + aInfo.y * 30.0) * 0.22 : aInfo.y * 6.2831 + uTime * aInfo.z;
  // confetti flips edge-on as it tumbles
  vFlip = cos(uTime * (3.0 + aInfo.y * 4.0) + aInfo.y * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aInfo.x * uScale / -mv.z, uScale * 0.16);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying vec4 vInfo;
varying float vSpin;
varying float vFlip;
float dot2(vec2 v) { return dot(v, v); }
// a heart, its tip at the origin and about 1.2 wide and 1.1 tall
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
// a five-pointed star of radius r; rf: how fat (0 pointy)
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  float shape = vInfo.w;
  vec3 col = vColor.rgb;
  float a;
  if (shape < 0.5) {
    // a soft round glow
    a = exp(-dot(p, p) * 4.5);
  } else {
    float c = cos(vSpin);
    float s = sin(vSpin);
    vec2 q = mat2(c, -s, s, c) * p;
    float d;
    float shade = 1.0;
    if (shape < 1.5) {
      vec2 h = vec2(q.x, q.y + 0.82) * 0.66;
      d = (sdHeart(h) - 0.0) / 0.66;
    } else if (shape < 2.5) {
      d = sdStar5(q * 1.05, 0.78, 0.5) - 0.07;
      // a star twinkles
      shade = 0.85 + 0.3 * sin(vInfo.y * 60.0 + vSpin * 3.0);
    } else {
      float f = max(0.06, abs(vFlip));
      d = length(max(abs(vec2(q.x, q.y / f)) - vec2(0.7, 0.34), 0.0)) - 0.06;
      d *= f;
      shade = 0.7 + 0.3 * vFlip;
    }
    float aa = max(fwidth(d), 0.01);
    a = 1.0 - smoothstep(-aa, aa, d);
    // glossy: a darker rim, a lit top and a soft highlight
    float edge = smoothstep(-0.4, 0.0, d);
    col *= (1.0 - 0.3 * edge) * (0.92 + 0.14 * q.y) * shade;
    float hl = smoothstep(0.5, 0.0, length(q - vec2(-0.28, 0.3)));
    col += vec3(1.0, 0.95, 0.9) * hl * (shape < 2.5 ? 0.4 : 0.15);
  }
  a *= vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * a, a);
}`;

export class Bits {
  constructor(scene, max = 300) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.info = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.base = new Float32Array(max * 4); // r, g, b, size
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.sway = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 4).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 600 }, uTime: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.next = 0;
    this.live = 0;
    this.dirty = false;
    g.setDrawRange(0, max);
  }

  setViewport(heightPx) {
    this.uniforms.uScale.value = heightPx * 0.9;
  }

  // one bit: position, velocity, colour [r, g, b] (HDR allowed), size (m), life (s), shape
  // o: gravity (m/s^2, negative falls), drag (1/s), sway (m/s of sideways drift), spin (rad/s)
  emit(x, y, z, vx, vy, vz, color, size, life, shape = SHAPE.dot, { gravity = 0, drag = 1, sway = 0, spin = 2 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    if (this.life[i] <= 0) this.live++;
    this.dirty = true;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.base[i * 4] = color[0];
    this.base[i * 4 + 1] = color[1];
    this.base[i * 4 + 2] = color[2];
    this.base[i * 4 + 3] = size;
    this.info[i * 4] = size;
    this.info[i * 4 + 1] = Math.random();
    this.info[i * 4 + 2] = (Math.random() < 0.5 ? -1 : 1) * spin * (0.5 + Math.random());
    this.info[i * 4 + 3] = shape;
    this.life[i] = life;
    this.age[i] = 0;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.sway[i] = sway;
    this.col[i * 4 + 3] = 0;
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    if (!this.live && !this.dirty) return;
    this.dirty = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const age = (this.age[i] += dt);
      const k = age / this.life[i];
      if (k >= 1) {
        this.life[i] = 0;
        this.info[i * 4] = 0;
        this.col[i * 4 + 3] = 0;
        this.live--;
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      const sw = this.sway[i];
      const ph = this.info[i * 4 + 1] * TAU;
      this.vel[i * 3] = this.vel[i * 3] * d + (sw ? Math.sin(age * 2.3 + ph) * sw * dt * 3 : 0);
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * d + (sw ? Math.cos(age * 1.9 + ph * 1.3) * sw * dt * 3 : 0);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // pops in with a little overshoot, fades out at the end
      const pop = age < 0.28 ? easeBack(age / 0.28, 2.4) : 1;
      this.info[i * 4] = this.base[i * 4 + 3] * Math.max(0.01, pop);
      this.col[i * 4] = this.base[i * 4];
      this.col[i * 4 + 1] = this.base[i * 4 + 1];
      this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = Math.min(1, k * 20) * (1 - Math.max(0, (k - 0.6) / 0.4) ** 2);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aInfo.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
