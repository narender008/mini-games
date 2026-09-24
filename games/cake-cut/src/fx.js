// Small things that fly: crumbs from the cut, confetti for the birthday
// moment, smoke wisps from blown-out candles and sparkles from the sword.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

// An irregular lump: an icosahedron with its corners pulled about.
function lumpGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.7 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.6;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

// Crumbs fall under gravity, bounce a little and come to rest on whatever
// is below: the board, the stand, a plate or the cloth.
export class Crumbs {
  constructor(max, supportAt) {
    this.max = max;
    this.supportAt = supportAt;
    this.mesh = new THREE.InstancedMesh(lumpGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.9 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.items = [];
    this.next = 0;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
  }

  spawn(pos, vel, colour, size = 0.0015, { rest = null, life = Infinity } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const item = {
      p: pos.clone(),
      v: vel.clone(),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      spin: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
      size: size * (0.6 + Math.random() * 0.8),
      resting: false,
      rest,
      life,
      age: 0,
    };
    this.items[i] = item;
    this.mesh.setColorAt(i, colour.clone().multiplyScalar(0.8 + Math.random() * 0.35));
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
    this.next = 0;
  }

  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i];
      if (!c) continue;
      c.age += dt;
      let scale = c.size;
      if (c.age > c.life) scale *= Math.max(0, 1 - (c.age - c.life) / 0.6);
      if (!c.resting) {
        c.v.y -= 9.8 * dt;
        c.v.multiplyScalar(Math.exp(-dt * 1.5));
        c.p.addScaledVector(c.v, dt);
        c.rot.x += c.spin.x * dt;
        c.rot.y += c.spin.y * dt;
        c.rot.z += c.spin.z * dt;
        const floor = (c.rest ?? this.supportAt(c.p.x, c.p.z)) + c.size * 0.5;
        if (c.p.y < floor) {
          c.p.y = floor;
          if (Math.abs(c.v.y) > 0.25) {
            c.v.y *= -0.25;
            c.v.x *= 0.5;
            c.v.z *= 0.5;
            c.spin.multiplyScalar(0.4);
          } else {
            c.resting = true;
            c.v.set(0, 0, 0);
          }
        }
      }
      tmpE.copy(c.rot);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(scale);
      tmpM.compose(c.p, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------ smoke

const SMOKE_VERT = /* glsl */ `
varying vec2 vUv;
uniform vec2 uSize;
void main() {
  vUv = vec2(position.x * 2.0, position.y + 0.5);
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += vec2(position.x * uSize.x, (position.y + 0.5) * uSize.y);
  gl_Position = projectionMatrix * mv;
}`;

const SMOKE_FRAG = /* glsl */ `
${NOISE}
varying vec2 vUv;
uniform float uAge;
uniform float uSeed;
uniform float uLife;
void main() {
  float y = vUv.y;
  float t = uAge;
  // the column climbs from the wick, then lets go and drifts off
  float head = clamp(t * 0.9, 0.0, 1.0);
  float tail = max(0.0, (t - 0.9) * 0.45);
  float sway = sin(y * 7.0 - t * 2.2 + uSeed * 6.0) * 0.16 * y + sin(y * 15.0 + uSeed * 3.0 - t * 3.1) * 0.05 * y;
  sway += (vnoise(vec3(y * 3.0 - t, uSeed * 9.0, 0.0)) - 0.5) * 0.5 * y * y;
  float w = 0.035 + 0.3 * y * y;
  float d = (vUv.x - sway) / w;
  float a = exp(-d * d);
  a *= smoothstep(head, head - 0.3, y) * smoothstep(tail, tail + 0.2, y);
  a *= 0.55 + 0.45 * vnoise(vec3(vUv.x * 6.0, y * 8.0 - t * 1.5, uSeed));
  a *= 1.0 - smoothstep(uLife * 0.55, uLife, t);
  a *= smoothstep(1.0, 0.4, y) * 0.5;
  gl_FragColor = vec4(vec3(0.82, 0.8, 0.78) * a, a);
}`;

export class Smoke {
  constructor(scene, max = 16) {
    this.pool = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          uniforms: { uAge: { value: 0 }, uSeed: { value: Math.random() }, uLife: { value: 4 }, uSize: { value: new THREE.Vector2(0.06, 0.2) } },
          vertexShader: SMOKE_VERT,
          fragmentShader: SMOKE_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
        }),
      );
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 6;
      scene.add(m);
      this.pool.push({ m, age: 0, life: 4, on: false });
    }
    this.next = 0;
  }

  puff(pos, { life = 4, scale = 1 } = {}) {
    const w = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    w.on = true;
    w.age = 0;
    w.life = life;
    w.m.visible = true;
    w.m.position.copy(pos);
    const u = w.m.material.uniforms;
    u.uSeed.value = Math.random();
    u.uLife.value = life;
    u.uSize.value.set(0.06 * scale, 0.2 * scale);
  }

  clear() {
    for (const w of this.pool) {
      w.on = false;
      w.m.visible = false;
    }
  }

  update(dt) {
    for (const w of this.pool) {
      if (!w.on) continue;
      w.age += dt;
      w.m.material.uniforms.uAge.value = w.age;
      if (w.age > w.life) {
        w.on = false;
        w.m.visible = false;
      }
    }
  }
}

// ------------------------------------------------------------ confetti

const CONFETTI_COLOURS = ['#f25f7a', '#f7c948', '#5ec2e8', '#8fd46a', '#b58be8', '#ff9d4d', '#fdf6ec', '#e6c07a'];

// Paper and foil confetti that tumbles, flutters down and settles.
const H_DRAG = 1.6; // sideways drag on confetti

export class Confetti {
  constructor(max, supportAt) {
    this.max = max;
    this.supportAt = supportAt;
    const geo = new THREE.PlaneGeometry(0.0065, 0.011);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.45, metalness: 0.25 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.receiveShadow = true;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
    this.items = [];
    this.next = 0;
  }

  // Shoot a burst from `from` towards `to` (world positions).
  burst(from, to, n) {
    const dir = to.clone().sub(from);
    const flat = Math.hypot(dir.x, dir.z) || 1;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      // aimed so the paper spreads from short of the target to beyond it
      const reach = flat * H_DRAG * (0.45 + Math.random() * 1.1);
      const side = (Math.random() - 0.5) * 0.9;
      const v = new THREE.Vector3((dir.x / flat) * reach - (dir.z / flat) * side, 1.5 + Math.random() * 1.1, (dir.z / flat) * reach + (dir.x / flat) * side);
      this.items[i] = {
        p: from.clone(),
        v,
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
        phase: Math.random() * 6.28,
        rest: false,
        age: 0,
      };
      this.mesh.setColorAt(i, new THREE.Color(CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)]));
      this.mesh.count = Math.max(this.mesh.count, i + 1);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
    this.next = 0;
  }

  update(dt) {
    if (!this.items.length) return;
    this.tick = (this.tick || 0) + 1;
    for (let i = 0; i < this.items.length; i++) {
      const c = this.items[i];
      if (!c) continue;
      c.age += dt;
      // paper resting up on the cake falls again if its slice is taken away
      if (c.rest && c.p.y > 0.12 && (i + this.tick) % 8 === 0 && this.supportAt(c.p.x, c.p.z) + 0.003 < c.p.y) {
        c.rest = false;
        c.v.set(0, 0, 0);
      }
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        // paper falls slowly: strong drag, and it flutters side to side
        c.v.y *= Math.exp(-dt * (c.v.y < 0 ? 26 : 2.2));
        const h = Math.exp(-dt * H_DRAG);
        c.v.x *= h;
        c.v.z *= h;
        c.p.addScaledVector(c.v, dt);
        const flutter = c.v.y < 0 ? 1 : 0.3;
        c.p.x += Math.sin(c.age * 6 + c.phase) * 0.16 * flutter * dt;
        c.p.z += Math.cos(c.age * 4.3 + c.phase) * 0.13 * flutter * dt;
        c.rot.x += c.spin.x * dt;
        c.rot.y += c.spin.y * dt;
        c.rot.z += c.spin.z * dt;
        const floor = this.supportAt(c.p.x, c.p.z) + 0.0008;
        if (c.p.y < floor && c.v.y < 0) {
          c.p.y = floor;
          c.rest = true;
          c.rot.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * 6.28);
        }
      }
      let s = 1;
      if (c.age > 14) s = Math.max(0, 1 - (c.age - 14) / 1.5);
      tmpQ.setFromEuler(c.rot);
      tmpS.setScalar(s);
      tmpM.compose(c.p, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.items.every((c) => !c || c.age > 15.5)) this.clear();
  }
}

// ------------------------------------------------------------ sparkles

function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,230,180,0.8)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.fillRect(31, 4, 2, 56);
  x.fillRect(4, 31, 56, 2);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// Little glints that pop and fade: the sword's trail, the birthday moment.
export class Sparkles {
  constructor(max = 160) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.012, map: sparkTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    this.items = [];
    this.next = 0;
    g.setDrawRange(0, 0);
  }

  emit(p, n = 6, spread = 0.3) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.items[i] = {
        p: p.clone(),
        v: new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread, (Math.random() - 0.5) * spread),
        life: 0.35 + Math.random() * 0.4,
        age: 0,
      };
    }
  }

  update(dt) {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) {
      const s = this.items[i];
      if (!s) continue;
      s.age += dt;
      s.v.y -= 0.6 * dt;
      s.p.addScaledVector(s.v, dt);
      const k = Math.max(0, 1 - s.age / s.life);
      this.pos.set([s.p.x, s.p.y, s.p.z], i * 3);
      this.col.set([2.2 * k, 1.7 * k, 0.9 * k], i * 3);
      n = Math.max(n, i + 1);
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
