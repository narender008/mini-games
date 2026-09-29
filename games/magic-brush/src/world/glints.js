// Small drifting lights and litter of the garden: fireflies that wander round
// the bushes and flower beds and glow on and off; pollen dust that a friend
// kicks up running through the flowers; and petals, some drifting down
// slowly through the air on the breeze (across the picture, so they are
// seen), some lifted by a friend's feet, all tumbling as they fall and
// lying a moment on the grass before they fade.
import * as THREE from 'three';
import { rand, pick, TAU, REDUCED_MOTION } from '../config.js';
import { WIND } from './foliage.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

// ------------------------------------------------------------ fireflies

const FLY_VERT = /* glsl */ `
attribute vec4 aSeed; // phase, wander speed, wander radius, blink rate
uniform float uTime;
uniform float uScale;
varying float vGlow;
varying float vHue;
void main() {
  float t = uTime * aSeed.y + aSeed.x * 6.2831;
  vec3 p = position + vec3(sin(t) * aSeed.z, sin(t * 0.7 + 1.0) * aSeed.z * 0.45, cos(t * 0.83 + 2.0) * aSeed.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // a slow blink: on for a moment, mostly dim
  float b = sin(uTime * aSeed.w + aSeed.x * 40.0);
  vGlow = 0.12 + 0.88 * pow(max(b, 0.0), 2.5);
  vHue = fract(aSeed.x * 7.0);
  gl_PointSize = min(0.06 * uScale / -mv.z * (0.5 + vGlow * 0.6), uScale * 0.02);
  gl_Position = projectionMatrix * mv;
}`;

const FLY_FRAG = /* glsl */ `
varying float vGlow;
varying float vHue;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  float a = (exp(-r * 7.0) + exp(-r * 2.2) * 0.25) * vGlow;
  if (a < 0.01) discard;
  vec3 c = mix(vec3(2.0, 1.6, 0.5), vec3(1.5, 1.9, 0.7), step(0.8, vHue));
  gl_FragColor = vec4(c * a, a);
}`;

class Fireflies {
  constructor(scene, count, anchors) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = pick(anchors);
      pos.set([a[0] + rand(-0.3, 0.3), a[1] + rand(0.1, 0.5), a[2] + rand(-0.3, 0.3)], i * 3);
      seed.set([Math.random(), rand(0.15, 0.35), rand(0.25, 0.6), rand(0.5, 1.1)], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.u = { uTime: { value: 0 }, uScale: { value: 600 } };
    const m = new THREE.ShaderMaterial({ vertexShader: FLY_VERT, fragmentShader: FLY_FRAG, uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
}

// ------------------------------------------------------------ pollen dust

const DUST_VERT = /* glsl */ `
attribute vec2 aInfo; // size, alpha
uniform float uScale;
varying float vA;
void main() {
  vA = aInfo.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aInfo.x * uScale / -mv.z, uScale * 0.012);
  gl_Position = projectionMatrix * mv;
}`;

const DUST_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(p, p) * 3.5) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.7, 1.35, 0.7) * a, a);
}`;

class Dust {
  constructor(scene, max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.info = new Float32Array(max * 2);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 2).setUsage(THREE.DynamicDrawUsage));
    this.u = { uScale: { value: 600 } };
    const m = new THREE.ShaderMaterial({ vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.next = 0;
    this.life.fill(0);
  }

  emit(x, y, z, vx, vy, vz, size = 0.012, life = 1.4) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.info[i * 2] = size;
    this.age[i] = 0;
    this.life[i] = life;
  }

  update(dt, windX, windZ) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.info[i * 2 + 1] = 0;
        continue;
      }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      if (k >= 1) {
        this.life[i] = 0;
        this.info[i * 2 + 1] = 0;
        continue;
      }
      const d = Math.exp(-1.6 * dt);
      this.vel[i * 3] = this.vel[i * 3] * d + windX * dt * 0.5;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + 0.03 * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * d + windZ * dt * 0.5;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.info[i * 2 + 1] = Math.min(1, k * 8) * (1 - k) * 0.85;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aInfo.needsUpdate = true;
  }
}

// ------------------------------------------------------------ petals

const PETAL_COLORS = [0xf7a8c8, 0xfff2ee, 0xffe08a, 0xc9b2ff, 0xf58fb5, 0xffffff];

class Petals {
  constructor(scene, max, groundAt) {
    this.max = max;
    this.groundAt = groundAt;
    const g = new THREE.CircleGeometry(1, 10);
    g.scale(1, 0.55, 1);
    // a slightly cupped petal
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.18 * p.getX(i) * p.getX(i));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x201008, emissiveIntensity: 0.4 });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.p = [];
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.p.push({ on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0, size: 0.012, lying: 0 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, c.set(pick(PETAL_COLORS)));
    }
    this.next = 0;
    this.count = 0;
  }

  emit(x, y, z, vx, vy, vz, size = 0.014) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const d = this.p[i];
    d.on = true;
    d.pos.set(x, y, z);
    d.vel.set(vx, vy, vz);
    d.rot.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    d.spin.set(rand(-5, 5), rand(-5, 5), rand(-5, 5));
    d.size = size * rand(0.8, 1.25);
    d.life = 14;
    d.lying = 0;
    this.mesh.setColorAt(i, _c.set(pick(PETAL_COLORS)));
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, t, wx, wz, gust) {
    for (let i = 0; i < this.max; i++) {
      const d = this.p[i];
      if (!d.on) continue;
      const gy = this.groundAt(d.pos.x, d.pos.z) + 0.004;
      if (d.pos.y > gy && !d.lying) {
        // air holds a petal up: it sinks slowly, drifts with the breeze and flutters
        d.vel.y += (-0.32 - d.vel.y * 2.2) * dt;
        d.vel.x += (wx * (0.25 + gust * 0.9) + Math.sin(t * 2.3 + i) * 0.16 - d.vel.x) * 1.2 * dt;
        d.vel.z += (wz * (0.25 + gust * 0.9) + Math.cos(t * 1.9 + i * 1.7) * 0.16 - d.vel.z) * 1.2 * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.rot.x += d.spin.x * dt;
        d.rot.y += d.spin.y * dt;
        d.rot.z += d.spin.z * dt;
        d.life -= dt * 0.5;
      } else {
        // down on the grass: it lies there a moment, then shrinks away
        d.lying += dt;
        d.pos.y = gy + 0.002;
        d.rot.x = -Math.PI / 2;
        d.rot.z += 0;
        d.life = Math.min(d.life, 3.5 - d.lying);
      }
      if (d.life <= 0) {
        d.on = false;
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      const s = d.size * Math.min(1, d.life / 1.2);
      _q.setFromEuler(d.rot);
      this.mesh.setMatrixAt(i, _m.compose(d.pos, _q, _s.set(s, s, s)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------ the lot

export class Glints {
  constructor({ scene, quality, world, groundAt }) {
    this.scene = scene;
    this.groundAt = groundAt;
    this.calm = REDUCED_MOTION.matches;
    const low = quality.tier === 'low';
    const mid = quality.tier === 'medium';
    // where fireflies gather: round the bushes and the flower beds
    const anchors = [];
    for (const b of world.bushes || []) anchors.push([b.x, b.r * 1.0, b.z]);
    for (const [x, , z] of (world.flowers?.userData.spots || []).filter((_, i) => i % 24 === 0)) anchors.push([x, 0.35, z]);
    if (!anchors.length) anchors.push([0, 0.6, -3]);
    this.fireflies = new Fireflies(scene, low ? 8 : mid ? 14 : 22, anchors);
    this.dust = new Dust(scene, low ? 24 : 48);
    this.petals = new Petals(scene, low ? 24 : 44, groundAt);
    // flower cells: is there a bed here? (for kicking up petals)
    this.cells = new Set();
    for (const [x, , z] of world.flowers?.userData.spots || []) this.cells.add(`${Math.floor(x / 0.4)},${Math.floor(z / 0.4)}`);
    this.drift = rand(1.5, 3);
    this.kick = new Map();
    this.lastWind = new THREE.Vector2(1, 0);
  }

  setViewport(px) {
    this.fireflies.u.uScale.value = px * 0.9;
    this.dust.u.uScale.value = px * 0.9;
  }

  inBed(x, z) {
    const cx = Math.floor(x / 0.4);
    const cz = Math.floor(z / 0.4);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (this.cells.has(`${cx + i},${cz + j}`)) return true;
    return false;
  }

  update(dt, t, { camera, friends, state }) {
    this.fireflies.u.uTime.value = t;
    const gd = WIND.uGustDir.value;
    const gust = WIND.uGust.value;
    const wx = gd.x;
    const wz = gd.y;
    // a petal now and then, drifting through the picture in front of the camera
    this.drift -= dt;
    if (this.drift <= 0 && state !== 'paint') {
      this.drift = rand(1.6, 3.4) * (this.calm ? 1.6 : 1);
      const fwd = _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
      fwd.y = 0;
      fwd.normalize();
      const right = _p.set(1, 0, 0).applyQuaternion(camera.quaternion);
      right.y = 0;
      right.normalize();
      const d = rand(2.2, 5);
      const x = camera.position.x + fwd.x * d + right.x * rand(-2.5, 1.2);
      const z = camera.position.z + fwd.z * d + right.z * rand(-2.5, 1.2);
      this.petals.emit(x, rand(1.3, 2.6), z, wx * 0.2, -0.1, wz * 0.2, 0.014);
    }
    // friends running through flowers kick up petals and pollen
    for (const f of friends) {
      const sp = f.speed || 0;
      if (sp < 0.1 || f.pos.y > 0.3) continue;
      const key = f;
      let k = (this.kick.get(key) || 0) - dt * (0.5 + sp * 2.5);
      if (k <= 0) {
        k += 0.5;
        const bed = this.inBed(f.pos.x, f.pos.z);
        const r = (f.radius || 0.15) * 0.8;
        const a = Math.random() * TAU;
        const gy = this.groundAt(f.pos.x, f.pos.z);
        this.dust.emit(f.pos.x + Math.cos(a) * r, gy + 0.05, f.pos.z + Math.sin(a) * r, rand(-0.1, 0.1), rand(0.12, 0.3), rand(-0.1, 0.1), rand(0.008, 0.016), rand(1.2, 2));
        if (bed && Math.random() < 0.8) this.petals.emit(f.pos.x + Math.cos(a) * r, gy + 0.08, f.pos.z + Math.sin(a) * r, rand(-0.25, 0.25) + wx * 0.2, rand(0.5, 0.9), rand(-0.25, 0.25) + wz * 0.2, 0.012);
      }
      this.kick.set(key, k);
    }
    this.dust.update(dt, wx * (0.15 + gust), wz * (0.15 + gust));
    this.petals.update(dt, t, wx, wz, gust);
  }

  dispose() {
    for (const o of [this.fireflies.points, this.dust.points, this.petals.mesh]) {
      this.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
  }
}
