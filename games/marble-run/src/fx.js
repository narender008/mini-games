// Little effects: a twinkle of sparkles when a marble magically goes home
// or reaches a goal, and a soft puff when one is dropped in. One pool of
// additive point sprites, so it costs a single draw call.
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aLife;
attribute vec3 aColor;
varying float vLife;
varying vec3 vColor;
void main() {
  vLife = aLife;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (300.0 / -mv.z) * (0.4 + 0.6 * aLife);
}`;

const FRAG = /* glsl */ `
varying float vLife;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  // a soft dot with a four-point twinkle
  float star = max(0.0, 1.0 - abs(p.x * p.y) * 18.0) * max(0.0, 1.0 - r);
  float dot = exp(-r * r * 5.0);
  float a = (dot * 0.7 + star * 0.8) * vLife;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a * 2.2, a);
}`;

export class Sparkles {
  constructor({ scene, quality }) {
    this.n = quality.tier === 'low' ? 160 : 320;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);
    this.decay = new Float32Array(this.n);
    this.size = new Float32Array(this.n);
    this.color = new Float32Array(this.n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.next = 0;
    this.palette = [new THREE.Color('#fff4c0'), new THREE.Color('#ffd0f0'), new THREE.Color('#c8f0ff'), new THREE.Color('#fffbe8')];
  }

  emit(p, v, life, size, color) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.life[i] = 1;
    this.decay[i] = 1 / life;
    this.size[i] = size;
    this.color[i * 3] = color.r;
    this.color[i * 3 + 1] = color.g;
    this.color[i * 3 + 2] = color.b;
  }

  sparkle(p, amount = 1) {
    const v = new THREE.Vector3();
    const n = Math.round(22 * amount);
    for (let k = 0; k < n; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(0.05 + Math.random() * 0.12);
      this.emit(p, v, 0.6 + Math.random() * 0.6, 0.05 + Math.random() * 0.06, this.palette[k % this.palette.length]);
    }
  }

  puff(p, amount = 1) {
    const v = new THREE.Vector3();
    const n = Math.round(8 * amount);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      v.set(Math.cos(a) * 0.06, 0.02, Math.sin(a) * 0.06);
      this.emit(p, v, 0.45, 0.035, this.palette[3]);
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] = Math.max(0, this.life[i] - this.decay[i] * dt);
      this.vel[i * 3 + 1] -= 0.08 * dt;
      const k = Math.exp(-2.5 * dt);
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= k;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
    }
    this.points.visible = any;
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aLife.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
    }
  }
}
