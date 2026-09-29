// Effects: twinkling star sparkles, glossy droplets of paint that fly with
// real weight and splat where they land (the splats fade away), soft puffs,
// flower petals that flutter down, and bubbles. Everything comes from fixed
// pools sized to the device, so a big moment never costs more than planned.
import * as THREE from 'three';
import { rand, TAU } from './config.js';

const SPARK_VERT = /* glsl */ `
attribute vec4 aColor;
attribute vec3 aInfo; // size, twinkle phase, spin
uniform float uScale;
uniform float uTime;
varying vec4 vColor;
varying float vSpin;
void main() {
  vColor = aColor;
  vSpin = aInfo.z + uTime * 1.5 * sign(aInfo.z - 0.5);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.75 + 0.25 * sin(uTime * 9.0 + aInfo.y * 6.28);
  gl_PointSize = aInfo.x * uScale * tw / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const SPARK_FRAG = /* glsl */ `
varying vec4 vColor;
varying float vSpin;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vSpin), s = sin(vSpin);
  p = mat2(c, -s, s, c) * p;
  float r = length(p);
  // a four-pointed star with a soft round glow
  float star = max(0.0, 1.0 - abs(p.x * p.y) * 18.0 - r * 0.8);
  float core = exp(-r * r * 14.0);
  float glow = exp(-r * r * 3.0) * 0.35;
  float a = (star * 0.9 + core + glow) * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * a, a);
}`;

export class Sparkles {
  constructor(scene, max = 900) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.info = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.base = new Float32Array(max * 4);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    // a sparkle can be pulled towards a point (paint gathering into a friend)
    this.tgt = new Float32Array(max * 3);
    this.pull = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 3).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 600 }, uTime: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.next = 0;
    this.live = 0;
    g.setDrawRange(0, max);
  }

  setViewport(heightPx) {
    this.uniforms.uScale.value = heightPx * 0.9;
  }

  // one sparkle: position, velocity, colour [r,g,b] (HDR allowed), size (m), life (s).
  // target {x, y, z} and pull (m/s^2): it is drawn towards that point
  emit(x, y, z, vx, vy, vz, color, size = 0.02, life = 1, { drag = 1.5, gravity = -0.4, target = null, pull = 0 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.base[i * 4] = color[0];
    this.base[i * 4 + 1] = color[1];
    this.base[i * 4 + 2] = color[2];
    this.base[i * 4 + 3] = 1;
    this.info[i * 3] = size;
    this.info[i * 3 + 1] = Math.random();
    this.info[i * 3 + 2] = Math.random() * TAU;
    this.life[i] = life;
    this.age[i] = 0;
    this.drag[i] = drag;
    this.grav[i] = gravity;
    this.pull[i] = target ? pull : 0;
    if (target) {
      this.tgt[i * 3] = target.x;
      this.tgt[i * 3 + 1] = target.y;
      this.tgt[i * 3 + 2] = target.z;
    }
  }

  // a burst of sparkles from a point
  burst(p, count, { colors = [[1.6, 1.3, 0.7]], speed = 0.6, size = 0.02, life = 1.2, up = 0.3, spread = 1, dir = null, gravity = -0.4 } = {}) {
    for (let i = 0; i < count; i++) {
      const th = Math.random() * TAU;
      const ph = Math.acos(2 * Math.random() - 1);
      let vx = Math.sin(ph) * Math.cos(th) * spread;
      let vy = Math.cos(ph) * spread + up;
      let vz = Math.sin(ph) * Math.sin(th) * spread;
      if (dir) {
        vx = vx * 0.35 + dir.x;
        vy = vy * 0.35 + dir.y;
        vz = vz * 0.35 + dir.z;
      }
      const s = speed * (0.4 + Math.random() * 0.8);
      const c = colors[Math.floor(Math.random() * colors.length)];
      this.emit(p.x, p.y, p.z, vx * s, vy * s, vz * s, c, size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), { gravity });
    }
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      if (k >= 1) {
        this.life[i] = 0;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      if (this.pull[i] > 0) {
        const tx = this.tgt[i * 3] - this.pos[i * 3];
        const ty = this.tgt[i * 3 + 1] - this.pos[i * 3 + 1];
        const tz = this.tgt[i * 3 + 2] - this.pos[i * 3 + 2];
        const l = Math.hypot(tx, ty, tz) || 1;
        const a = (this.pull[i] * dt) / l;
        this.vel[i * 3] += tx * a;
        this.vel[i * 3 + 1] += ty * a;
        this.vel[i * 3 + 2] += tz * a;
        // it melts into the friend as it arrives
        if (l < 0.03) this.age[i] = Math.max(this.age[i], this.life[i] * 0.92);
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const fade = Math.min(1, k * 8) * (1 - k * k);
      this.col[i * 4] = this.base[i * 4];
      this.col[i * 4 + 1] = this.base[i * 4 + 1];
      this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = fade;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aInfo.needsUpdate = true;
  }
}

// Glossy drops of wet paint, stretched along their flight, and the splats
// they leave behind.
export class Droplets {
  constructor(scene, max = 160, groundAt = () => 0) {
    this.max = max;
    this.groundAt = groundAt;
    const geo = new THREE.SphereGeometry(1, 14, 10);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = max;
    const splatGeo = new THREE.CircleGeometry(1, 20);
    splatGeo.rotateX(-Math.PI / 2);
    const splatMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, clearcoat: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.splats = new THREE.InstancedMesh(splatGeo, splatMat, max);
    this.splats.frustumCulled = false;
    this.splats.receiveShadow = true;
    this.splatsAge = new Float32Array(max);
    this.splatNext = 0;
    scene.add(this.mesh, this.splats);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.01, color: new THREE.Color() });
    this.next = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.splats.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.splats.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.splatAlpha = [];
  }

  // water drops just vanish when they land; paint drops leave a splat
  throw(pos, vel, color, r = 0.01, water = false) {
    const d = this.p[this.next];
    this.next = (this.next + 1) % this.max;
    d.on = true;
    d.pos.copy(pos);
    d.vel.copy(vel);
    d.r = r;
    d.color.copy(color);
    d.water = water;
    d.t = 0;
  }

  update(dt) {
    const m = this._m;
    for (let i = 0; i < this.max; i++) {
      const d = this.p[i];
      if (!d.on) continue;
      d.t += dt;
      d.vel.y -= 9.8 * dt;
      d.vel.multiplyScalar(Math.exp(-0.4 * dt));
      d.pos.addScaledVector(d.vel, dt);
      const gy = this.groundAt(d.pos.x, d.pos.z);
      if (d.pos.y - d.r < gy || d.t > 4) {
        d.on = false;
        this.mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
        if (d.t <= 4 && !d.water) this.splat(d.pos.x, gy + 0.002, d.pos.z, d.r * (2.2 + Math.random()), d.color);
        continue;
      }
      // stretched along the velocity, a little wobble
      const sp = d.vel.length();
      const st = 1 + Math.min(1.6, sp * 0.12);
      this._q.setFromUnitVectors(this._up, this._s.copy(d.vel).normalize());
      this._s.set(d.r / Math.sqrt(st), d.r * st, d.r / Math.sqrt(st));
      m.compose(d.pos, this._q, this._s);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, d.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // splats shrink away after a few seconds
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.splatsAge[i] <= 0) continue;
      any = true;
      this.splatsAge[i] -= dt;
      const s = this.splatSize[i] * Math.min(1, this.splatsAge[i] / 1.5) * Math.min(1, (6 - this.splatsAge[i]) * 12 + 0.2);
      this.splats.getMatrixAt(i, m);
      m.decompose(this._p, this._q, this._s);
      m.compose(this._p, this._q, this._s.set(s, 1, s * 0.85));
      if (this.splatsAge[i] <= 0) m.makeScale(0, 0, 0);
      this.splats.setMatrixAt(i, m);
    }
    if (any) this.splats.instanceMatrix.needsUpdate = true;
  }

  splat(x, y, z, r, color) {
    this.splatSize ??= new Float32Array(this.max);
    const i = this.splatNext;
    this.splatNext = (this.splatNext + 1) % this.max;
    this.splatsAge[i] = 6;
    this.splatSize[i] = r;
    this._q.setFromAxisAngle(this._up, Math.random() * TAU);
    this._m.compose(this._p.set(x, y, z), this._q, this._s.set(r, 1, r * 0.85));
    this.splats.setMatrixAt(i, this._m);
    this.splats.setColorAt(i, color);
    this.splats.instanceMatrix.needsUpdate = true;
    this.splats.instanceColor.needsUpdate = true;
  }
}

// flower petals that tumble and flutter down (the elephant's shower)
export class Petals {
  constructor(scene, max = 200, groundAt = () => 0) {
    this.max = max;
    this.groundAt = groundAt;
    const g = new THREE.CircleGeometry(1, 8);
    g.scale(1, 0.55, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.p = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this.p.push({ on: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 });
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.next = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  throw(pos, vel, color, size = 0.012) {
    const d = this.p[this.next];
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    d.on = true;
    d.pos.copy(pos);
    d.vel.copy(vel);
    d.rot.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    d.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    d.size = size;
    d.life = 6;
    this.mesh.setColorAt(i, color);
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, t) {
    const m = this._m;
    for (let i = 0; i < this.max; i++) {
      const d = this.p[i];
      if (!d.on) continue;
      d.life -= dt;
      const gy = this.groundAt(d.pos.x, d.pos.z) + 0.003;
      if (d.pos.y > gy) {
        // air holds a petal up: it drifts and flutters
        d.vel.y += (-2.2 - d.vel.y * 2.5) * dt;
        d.vel.x += (Math.sin(t * 3 + i) * 0.4 - d.vel.x * 1.5) * dt;
        d.vel.z += (Math.cos(t * 2.6 + i * 1.7) * 0.4 - d.vel.z * 1.5) * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.rot.x += d.spin.x * dt;
        d.rot.y += d.spin.y * dt;
        d.rot.z += d.spin.z * dt;
      } else {
        d.pos.y = gy;
        d.rot.x = -Math.PI / 2;
      }
      const s = d.size * Math.min(1, d.life / 1.5);
      if (d.life <= 0) {
        d.on = false;
        m.makeScale(0, 0, 0);
      } else {
        this._q.setFromEuler(d.rot);
        m.compose(d.pos, this._q, this._s.set(s, s, s));
      }
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
