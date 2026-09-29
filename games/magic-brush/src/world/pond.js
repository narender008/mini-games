// Life in and on the pond: lily pads that bob on the water (and dip when a
// ripple passes under them), two pink water lilies, a little green frog that
// sits on a pad, breathes, blinks and now and then hops to another pad
// with a ripple, koi that swim slowly under the surface (glimpsed as soft
// shapes through the water), and once in a while one leaps out in an arc
// with a splash. Everything that touches the water makes ring ripples
// (ripple()), drawn as one instanced mesh of expanding rings, and a few
// droplets (splash()).
import * as THREE from 'three';
import { rand, clamp, damp, angleDiff, TAU, REDUCED_MOTION } from '../config.js';
import { POND, WATER_Y } from './world.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// pads: [dx, dz, radius] from the pond's centre (the waterfall lands to the back left)
const PADS = [
  [0.5, 0.25, 0.15],
  [0.12, 0.6, 0.17],
  [-0.5, 0.4, 0.13],
  [-0.15, 0.02, 0.16],
  [0.42, -0.3, 0.11],
  [0.78, -0.02, 0.09],
  [-0.72, -0.12, 0.1],
  [0.05, -0.72, 0.09],
];
// which pads have a lily flower
const BLOOMS = [2, 4];

// a soft green pad, veined, with a notch cut out
function padTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 6, 128, 128, 128);
  grd.addColorStop(0, '#3f7a2e');
  grd.addColorStop(0.7, '#57993a');
  grd.addColorStop(1, '#8fc25a');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(200,235,140,0.28)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128);
    g.stroke();
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40}, ${80 + Math.random() * 60}, 30, 0.10)`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 10, 0, TAU);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function padGeometry() {
  // a fan from the middle with the rim turned up, a notch cut at the side
  const seg = 32;
  const a0 = 0.32;
  const pos = [0, 0, 0];
  const uv = [0.5, 0.5];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (i / seg) * (TAU - 2 * a0);
    const x = Math.cos(a);
    const z = Math.sin(a);
    // three rings so the rim can curl
    pos.push(x * 0.55, 0.003, z * 0.55, x * 0.85, 0.008, z * 0.85, x, 0.026, z);
    uv.push(0.5 + x * 0.275, 0.5 + z * 0.275, 0.5 + x * 0.425, 0.5 + z * 0.425, 0.5 + x * 0.5, 0.5 + z * 0.5);
  }
  const idx = [];
  for (let i = 0; i < seg; i++) {
    const a = 1 + i * 3;
    const c = a + 3;
    idx.push(0, c, a);
    for (let r = 0; r < 2; r++) idx.push(a + r, c + r, a + r + 1, a + r + 1, c + r, c + r + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a water lily: rings of pointed petals, white at the base and pink at the tip
function lilyGeometry() {
  const pos = [];
  const col = [];
  const idx = [];
  const white = new THREE.Color(0xfff8f2);
  const pink = new THREE.Color(0xff9ec2);
  const gold = new THREE.Color(0xffd23f);
  const petal = (ang, lift, len, wid) => {
    const base = pos.length / 3;
    const N = 5;
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= 2; j++) {
        const u = i / N;
        const v = (j / 2 - 0.5) * 2;
        const w = wid * Math.sin(Math.min(1, u * 1.15 + 0.12) * Math.PI * 0.85) * (1 - u * 0.15);
        const r = u * len;
        // cupped: rises along its length, edges lifted
        const x = r * Math.cos(lift);
        const y = r * Math.sin(lift) + 0.004 * v * v * (1 - u);
        const z = v * w;
        pos.push(x * Math.cos(ang) - z * Math.sin(ang), y, x * Math.sin(ang) + z * Math.cos(ang));
        const c = white.clone().lerp(pink, smooth(0.35, 1, u));
        col.push(c.r, c.g, c.b);
      }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < 2; j++) {
        const a = base + i * 3 + j;
        idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
  };
  for (let i = 0; i < 8; i++) petal((i / 8) * TAU, 0.85, 0.05, 0.0135);
  for (let i = 0; i < 6; i++) petal(((i + 0.5) / 6) * TAU, 1.15, 0.038, 0.011);
  // stamens
  const st = pos.length / 3;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    pos.push(Math.cos(a) * 0.008, 0.02, Math.sin(a) * 0.008, Math.cos(a) * 0.008, 0.032, Math.sin(a) * 0.008, Math.cos(a) * 0.011, 0.031, Math.sin(a) * 0.011);
    for (let k = 0; k < 3; k++) col.push(gold.r, gold.g, gold.b);
    idx.push(st + i * 3, st + i * 3 + 1, st + i * 3 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ripple rings: a shader plane per ring, drawn just above the water
const RING_VERT = /* glsl */ `
attribute vec2 aRip;
varying vec2 vUv;
varying vec2 vRip;
void main() {
  vUv = uv;
  vRip = aRip;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const RING_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec2 vRip;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float a = vRip.x;
  float r = 0.1 + 0.88 * (1.0 - (1.0 - a) * (1.0 - a));
  float ring = exp(-pow((d - r) / 0.05, 2.0));
  float ring2 = exp(-pow((d - r * 0.68) / 0.04, 2.0)) * 0.55;
  float fade = pow(1.0 - a, 1.2) * smoothstep(1.0, 0.82, d);
  float al = (ring + ring2) * fade * vRip.y;
  if (al < 0.01) discard;
  gl_FragColor = vec4(vec3(0.92, 0.98, 1.0) * 1.15, al * 0.7);
}`;

// koi seen through the water: soft coloured shapes with a wagging tail
const KOI_VERT = /* glsl */ `
attribute vec4 aFish;
varying vec2 vUv;
varying vec4 vFish;
void main() {
  vUv = uv;
  vFish = aFish;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const KOI_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec4 vFish;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  // x along the fish (tail -1 .. head +1), y across it
  float x = (vUv.x - 0.5) * 2.0;
  float y = (vUv.y - 0.5) * 2.0;
  float ph = vFish.x;
  // the spine bends more towards the tail
  float sway = sin(x * 3.4 - uTime * 4.2 + ph) * 0.26 * (0.55 - 0.45 * x) * (x < 0.1 ? 1.0 : 0.3);
  float yy = y - sway;
  float bw = 0.34 * (1.0 - pow(abs(x + 0.08), 2.0) * 0.92);
  float body = smoothstep(bw + 0.05, bw - 0.05, abs(yy)) * step(-0.58, x) * smoothstep(0.98, 0.84, x);
  // the tail fin: a fan that opens behind the body
  float tx = (-x - 0.5);
  float fin = smoothstep(0.32 * tx + 0.05, 0.32 * tx - 0.05, abs(yy)) * step(0.0, tx) * smoothstep(0.55, 0.42, tx);
  fin *= 0.75;
  // pectoral fins
  float pf = smoothstep(0.1, 0.03, length(vec2(x - 0.28, abs(yy) - 0.36 - 0.05 * sin(uTime * 3.0 + ph)))) * 0.7;
  float shape = max(max(body, fin), pf);
  // patches of orange and red on a pale body
  float pat = n(vec2(x * 3.0 + ph * 3.0, y * 2.6 + ph));
  vec3 pale = vec3(0.96, 0.93, 0.86);
  vec3 orange = mix(vec3(1.0, 0.5, 0.13), vec3(1.0, 0.72, 0.2), vFish.y);
  vec3 red = vec3(0.92, 0.22, 0.12);
  vec3 c = mix(pale, orange, smoothstep(0.46, 0.56, pat));
  c = mix(c, red, smoothstep(0.72, 0.8, n(vec2(x * 4.0 - ph, y * 3.0 + 2.0))) * step(-0.2, x));
  c = mix(c, orange * 0.9, fin * 0.6);
  // seen through the pond's water: dimmer and greener, soft-edged
  c = mix(c * vec3(0.78, 0.86, 0.8), vec3(0.16, 0.3, 0.28), 0.16);
  float a = shape * 0.62;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
}`;

export class PondLife {
  constructor({ scene, quality, sound }) {
    this.scene = scene;
    this.sound = sound;
    this.tier = quality.tier;
    this.calm = REDUCED_MOTION.matches;
    this.time = 0;
    this.waves = []; // ripples: { x, z, t0, size }
    this.buildPads();
    this.buildRipples();
    this.buildDrops();
    this.buildKoi();
    this.buildFrog();
    this.leapT = rand(4, 9);
  }

  // ------------------------------------------------------------ pads and lilies

  buildPads() {
    const n = PADS.length;
    const mat = new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.42, side: THREE.DoubleSide });
    this.pads = new THREE.InstancedMesh(padGeometry(), mat, n);
    this.pads.frustumCulled = false;
    this.pads.receiveShadow = true;
    this.padList = PADS.map(([dx, dz, r], i) => ({ x: POND.x + dx, z: POND.z + dz, r, yaw: Math.random() * TAU, ph: Math.random() * TAU, y: -0.012, tiltX: 0, tiltZ: 0 }));
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) this.pads.setColorAt(i, c.setScalar(0.85 + Math.random() * 0.25));
    this.scene.add(this.pads);
    const lily = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });
    this.lilies = new THREE.InstancedMesh(lilyGeometry(), lily, BLOOMS.length);
    this.lilies.frustumCulled = false;
    this.scene.add(this.lilies);
  }

  padHeight(p, t) {
    // a slow bob, and the passing rings of any ripple lift and drop it
    let y = -0.012 + 0.0035 * Math.sin(t * 1.1 + p.ph) + 0.0015 * Math.sin(t * 2.3 + p.ph * 2);
    let tx = 0.02 * Math.sin(t * 0.9 + p.ph);
    let tz = 0.02 * Math.cos(t * 0.8 + p.ph * 1.3);
    for (const w of this.waves) {
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      const age = t - w.t0;
      const dd = d - 0.42 * age * (1 + w.size * 0.3);
      const k = Math.exp(-(dd * dd) / 0.03) * Math.exp(-age * 1.1) * w.size / (1 + d * 3);
      y += 0.014 * k * Math.cos(dd * 24);
      tx += 0.25 * k * Math.sin(dd * 24) * (w.z - p.z) / Math.max(d, 0.05);
      tz -= 0.25 * k * Math.sin(dd * 24) * (w.x - p.x) / Math.max(d, 0.05);
    }
    p.y = y;
    p.tiltX = tx;
    p.tiltZ = tz;
  }

  updatePads(t) {
    let i = 0;
    for (const p of this.padList) {
      this.padHeight(p, t);
      _e.set(p.tiltX, p.yaw, p.tiltZ, 'YXZ');
      _q.setFromEuler(_e);
      this.pads.setMatrixAt(i++, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.r, 1, p.r)));
    }
    this.pads.instanceMatrix.needsUpdate = true;
    BLOOMS.forEach((pi, k) => {
      const p = this.padList[pi];
      _e.set(p.tiltX * 0.5, p.yaw * 2, p.tiltZ * 0.5, 'YXZ');
      _q.setFromEuler(_e);
      // the bloom breathes open and shut very slowly
      const open = 0.9 + 0.1 * Math.sin(t * 0.25 + k * 2);
      this.lilies.setMatrixAt(k, _m.compose(_p.set(p.x + p.r * 0.2, p.y + 0.008, p.z), _q, _s.set(1.15 * open, 1.15, 1.15 * open)));
    });
    this.lilies.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ ripples and splashes

  buildRipples() {
    const n = 12;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.aRip = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aRip', this.aRip);
    const mat = new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.rings = new THREE.InstancedMesh(geo, mat, n);
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 3;
    this.ringList = Array.from({ length: n }, () => ({ on: false, x: 0, z: 0, age: 0, life: 1, size: 1 }));
    this.ringNext = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) this.rings.setMatrixAt(i, _m);
    this.scene.add(this.rings);
  }

  // a ring spreading from (x, z); size 0.3 (a dragonfly's touch) .. 1.2 (a leap)
  ripple(x, z, size = 0.6, wave = true) {
    const r = this.ringList[this.ringNext];
    this.ringNext = (this.ringNext + 1) % this.ringList.length;
    r.on = true;
    r.x = x;
    r.z = z;
    r.age = 0;
    r.size = size;
    r.life = 1.3 + size * 0.8;
    if (wave) this.waves.push({ x, z, t0: this.time, size });
    if (this.waves.length > 8) this.waves.shift();
  }

  buildDrops() {
    const n = this.tier === 'low' ? 14 : 28;
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xe6f8ff, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.85 });
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, n);
    this.drops.frustumCulled = false;
    this.dropList = Array.from({ length: n }, () => ({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0.005 }));
    this.dropNext = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) this.drops.setMatrixAt(i, _m);
    this.scene.add(this.drops);
  }

  splash(x, z, count = 10, power = 1) {
    for (let i = 0; i < count; i++) {
      const d = this.dropList[this.dropNext];
      this.dropNext = (this.dropNext + 1) % this.dropList.length;
      const a = Math.random() * TAU;
      const s = rand(0.1, 0.5) * power;
      d.on = true;
      d.p.set(x + Math.cos(a) * 0.01, WATER_Y + 0.01, z + Math.sin(a) * 0.01);
      d.v.set(Math.cos(a) * s, rand(0.9, 1.9) * power, Math.sin(a) * s);
      d.r = rand(0.0035, 0.008);
    }
  }

  updateEffects(dt) {
    for (let i = 0; i < this.ringList.length; i++) {
      const r = this.ringList[i];
      if (!r.on) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.on = false;
        _m.makeScale(0, 0, 0);
        this.rings.setMatrixAt(i, _m);
        this.aRip.setXY(i, 1, 0);
        continue;
      }
      const R = 0.09 + 0.26 * r.size;
      this.rings.setMatrixAt(i, _m.compose(_p.set(r.x, WATER_Y + 0.0015, r.z), _q.identity(), _s.set(R * 2, 1, R * 2)));
      this.aRip.setXY(i, k, Math.min(1, r.size + 0.3));
    }
    this.rings.instanceMatrix.needsUpdate = true;
    this.aRip.needsUpdate = true;
    for (let i = 0; i < this.dropList.length; i++) {
      const d = this.dropList[i];
      if (!d.on) continue;
      d.v.y -= 6 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < WATER_Y) {
        d.on = false;
        // (only some drops leave a ring, or a splash would be all rings)
        if (i % 4 === 0 && Math.hypot(d.p.x - POND.x, d.p.z - POND.z) < POND.r - 0.05) this.ripple(d.p.x, d.p.z, 0.14, false);
        _m.makeScale(0, 0, 0);
      } else _m.compose(d.p, _q.identity(), _s.set(d.r, d.r * 1.3, d.r));
      this.drops.setMatrixAt(i, _m);
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ koi

  buildKoi() {
    const n = this.tier === 'low' ? 2 : 3;
    const geo = new THREE.PlaneGeometry(0.36, 0.17);
    geo.rotateX(-Math.PI / 2);
    this.aFish = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('aFish', this.aFish);
    this.koiU = { uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.koiU, vertexShader: KOI_VERT, fragmentShader: KOI_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.koi = new THREE.InstancedMesh(geo, mat, n);
    this.koi.frustumCulled = false;
    this.koi.renderOrder = 2;
    this.fish = [];
    for (let i = 0; i < n; i++) {
      this.aFish.setXYZW(i, Math.random() * TAU, Math.random(), 0, 0);
      this.fish.push({ a: Math.random() * TAU, r: 0.35 + i * 0.22, w: (i % 2 ? -1 : 1) * rand(0.13, 0.2), wob: Math.random() * TAU, yaw: 0, x: 0, z: 0, hidden: false });
    }
    this.scene.add(this.koi);
    // the fish that leaps
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.fishGeometry(), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.DoubleSide }));
    g.add(body);
    g.visible = false;
    this.leap = { group: g, on: false, t: 0, dur: 0.85, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0.5, peak: 0.2, tail: body };
    this.scene.add(g);
  }

  fishGeometry() {
    const pos = [];
    const col = [];
    const idx = [];
    const add = (geo, colorFn) => {
      const p = geo.attributes.position;
      const base = pos.length / 3;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        col.push(...colorFn(p.getX(i), p.getY(i), p.getZ(i)));
      }
      const ix = geo.index;
      for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
    };
    const pale = [0.96, 0.92, 0.84];
    const orange = [1.0, 0.42, 0.08];
    const red = [0.85, 0.16, 0.1];
    const patch = (x, y, z) => {
      const n = Math.sin(z * 55 + 1.3) * Math.cos(x * 90) + Math.sin(y * 70 + z * 30);
      return n > 0.55 ? (n > 1.25 ? red : orange) : pale;
    };
    // body: a plump teardrop
    const body = new THREE.SphereGeometry(1, 18, 12);
    const bp = body.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const z = bp.getZ(i);
      const taper = z < 0 ? 1 - 0.55 * Math.pow(-z, 1.4) : 1 - 0.15 * z * z;
      bp.setXYZ(i, bp.getX(i) * 0.03 * taper, bp.getY(i) * 0.034 * taper, z * 0.085);
    }
    body.computeVertexNormals();
    add(body, patch);
    // tail: a two-lobed fan
    const tail = new THREE.BufferGeometry();
    tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.07, 0, 0.045, -0.135, 0, 0.012, -0.12, 0, -0.045, -0.135, 0, 0, -0.07, 0, 0.012, -0.12, 0, 0.045, -0.135, 0, -0.045, -0.135], 3));
    tail.setIndex([0, 1, 2, 0, 2, 3]);
    tail.computeVertexNormals();
    add(tail, () => orange);
    // dorsal and side fins
    const dorsal = new THREE.BufferGeometry();
    dorsal.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.03, 0.03, 0, 0.065, -0.02, 0, 0.03, -0.055], 3));
    dorsal.setIndex([0, 1, 2]);
    dorsal.computeVertexNormals();
    add(dorsal, () => orange);
    for (const s of [-1, 1]) {
      const fin = new THREE.BufferGeometry();
      fin.setAttribute('position', new THREE.Float32BufferAttribute([s * 0.025, -0.01, 0.035, s * 0.07, -0.03, 0.0, s * 0.03, -0.015, -0.01], 3));
      fin.setIndex(s > 0 ? [0, 1, 2] : [0, 2, 1]);
      fin.computeVertexNormals();
      add(fin, () => orange);
    }
    // eyes
    for (const s of [-1, 1]) {
      const eye = new THREE.SphereGeometry(0.0065, 8, 6);
      eye.translate(s * 0.022, 0.014, 0.068);
      add(eye, () => [0.02, 0.02, 0.02]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  updateKoi(dt, t) {
    this.koiU.uTime.value = t;
    const L = this.leap;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      f.a += f.w * dt * (this.calm ? 0.6 : 1);
      const r = f.r + 0.08 * Math.sin(t * 0.3 + f.wob);
      f.x = POND.x + Math.cos(f.a) * r;
      f.z = POND.z + Math.sin(f.a) * r;
      // heading along the circle
      const dir = f.w > 0 ? 1 : -1;
      const tx = -Math.sin(f.a) * dir;
      const tz = Math.cos(f.a) * dir;
      f.yaw = Math.atan2(tx, tz);
      // the model's length runs along x: turn it to face along (tx, tz)
      _q.setFromAxisAngle(_up, f.yaw - Math.PI / 2);
      const hide = L.on && i === 0;
      _s.setScalar(hide ? 0 : 1);
      this.koi.setMatrixAt(i, _m.compose(_p.set(f.x, WATER_Y + 0.001, f.z), _q, _s));
    }
    this.koi.instanceMatrix.needsUpdate = true;
    // now and then the first fish leaps
    if (!L.on) {
      this.leapT -= dt;
      if (this.leapT <= 0) {
        this.leapT = rand(11, 22);
        const f = this.fish[0];
        L.on = true;
        L.t = 0;
        L.dur = 0.85;
        L.from.set(f.x, WATER_Y, f.z);
        // out and back in along the way it swims, curving a little
        L.dir.set(-Math.sin(f.a) * Math.sign(f.w), 0, Math.cos(f.a) * Math.sign(f.w));
        L.dist = 0.42;
        L.peak = rand(0.17, 0.26);
        L.group.visible = true;
        L.entered = false;
        this.ripple(f.x, f.z, 1);
        this.splash(f.x, f.z, 10, 1);
        this.sound?.()?.plip(f.x, WATER_Y, f.z, 1.3);
      }
    } else {
      L.t += dt;
      const u = clamp(L.t / L.dur, 0, 1);
      const x = L.from.x + L.dir.x * L.dist * u;
      const z = L.from.z + L.dir.z * L.dist * u;
      const y = WATER_Y + L.peak * 4 * u * (1 - u);
      // nose up as it rises, down as it falls
      const vy = L.peak * 4 * (1 - 2 * u) / L.dur;
      const vh = L.dist / L.dur;
      const pitch = Math.atan2(vy, vh);
      L.group.position.set(x, y, z);
      _e.set(-pitch, Math.atan2(L.dir.x, L.dir.z), Math.sin(u * 9) * 0.25, 'YXZ');
      L.group.quaternion.setFromEuler(_e);
      L.group.scale.setScalar(1.15);
      L.tail.rotation.y = Math.sin(L.t * 34) * 0.12;
      if (u >= 1) {
        L.on = false;
        L.group.visible = false;
        this.ripple(x, z, 1.1);
        this.splash(x, z, 12, 1.1);
        this.sound?.()?.plip(x, WATER_Y, z, 1.1);
      }
    }
  }

  // ------------------------------------------------------------ frog

  buildFrog() {
    const skin = new THREE.Color(0x76cf52);
    const skin2 = new THREE.Color(0x5dae3f);
    const belly = new THREE.Color(0xeaf6bb);
    const pink = new THREE.Color(0xff9fa8);
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.3 });
    const ell = (c, r, colorFn, w = 16, h = 12) => {
      const g = new THREE.SphereGeometry(1, w, h);
      const p = g.attributes.position;
      const n = g.attributes.normal;
      const cols = [];
      for (let i = 0; i < p.count; i++) {
        const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
        const nx = ux / r[0], ny = uy / r[1], nz = uz / r[2];
        const l = Math.hypot(nx, ny, nz) || 1;
        n.setXYZ(i, nx / l, ny / l, nz / l);
        p.setXYZ(i, c[0] + ux * r[0], c[1] + uy * r[1], c[2] + uz * r[2]);
        const col = colorFn(ux, uy, uz, nx / l, ny / l, nz / l);
        cols.push(col.r, col.g, col.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      return g;
    };
    const skinFn = (ux, uy, uz, nx, ny, nz) => {
      const c = skin.clone().lerp(belly, smooth(0.1, -0.5, ny));
      // a few darker blotches on the back
      const b = Math.sin(ux * 9 + 1) * Math.sin(uz * 8) + Math.sin(uy * 7 + uz * 5);
      if (ny > 0.2 && b > 0.9) c.lerp(skin2, 0.7);
      return c;
    };
    const merge = (geos) => {
      const pos = [];
      const nor = [];
      const col = [];
      const idx = [];
      for (const g of geos) {
        const base = pos.length / 3;
        pos.push(...g.attributes.position.array);
        nor.push(...g.attributes.normal.array);
        col.push(...g.attributes.color.array);
        for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
      }
      const m = new THREE.BufferGeometry();
      m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      m.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      m.setIndex(idx);
      return m;
    };
    const flat = (c) => () => c;
    const parts = [
      ell([0, 0.03, -0.006], [0.05, 0.036, 0.058], skinFn),
      ell([0, 0.038, 0.036], [0.042, 0.027, 0.034], skinFn),
      // front legs and feet
      ell([-0.03, 0.014, 0.04], [0.009, 0.017, 0.01], skinFn, 10, 8),
      ell([0.03, 0.014, 0.04], [0.009, 0.017, 0.01], skinFn, 10, 8),
      ell([-0.032, 0.004, 0.052], [0.012, 0.005, 0.015], skinFn, 10, 8),
      ell([0.032, 0.004, 0.052], [0.012, 0.005, 0.015], skinFn, 10, 8),
      // rosy cheeks
      ell([-0.031, 0.03, 0.05], [0.008, 0.006, 0.004], flat(pink), 8, 6),
      ell([0.031, 0.03, 0.05], [0.008, 0.006, 0.004], flat(pink), 8, 6),
      // eyes: round green domes on top of the head
      ell([-0.022, 0.058, 0.036], [0.0125, 0.0125, 0.0125], skinFn, 12, 10),
      ell([0.022, 0.058, 0.036], [0.0125, 0.0125, 0.0125], skinFn, 12, 10),
    ];
    const body = new THREE.Mesh(merge(parts), mat);
    // a smile on the front of the face
    const smile = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.026, 0.03, 0.064), new THREE.Vector3(-0.012, 0.024, 0.0705), new THREE.Vector3(0.012, 0.024, 0.0705), new THREE.Vector3(0.026, 0.03, 0.064)]), 12, 0.0012, 5), new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 0.6 }));
    const root = new THREE.Group();
    root.add(body, smile);
    // throat sac that pulses
    const throatGeo = ell([0, 0.018, 0.05], [0.022, 0.012, 0.016], () => belly);
    const throat = new THREE.Mesh(throatGeo, mat);
    root.add(throat);
    // pupils (they close to blink)
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.05, clearcoat: 1 });
    const glint = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.8) });
    const pupils = [];
    for (const s of [-1, 1]) {
      const eyeG = new THREE.Group();
      eyeG.position.set(s * 0.024, 0.061, 0.043);
      eyeG.rotation.y = s * 0.5;
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.0082, 12, 10), dark);
      pu.position.z = 0.0035;
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 6, 5), glint);
      gl.position.set(-s * 0.0022, 0.0035, 0.0108);
      eyeG.add(pu, gl);
      root.add(eyeG);
      pupils.push(eyeG);
    }
    // hind legs: a thigh and a foot that folds back or stretches out
    const legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.043, 0.026, -0.018);
      const thigh = new THREE.Mesh(merge([ell([0, 0, -0.018], [0.016, 0.018, 0.028], skinFn)]), mat);
      const knee = new THREE.Group();
      knee.position.set(0, 0, -0.038);
      const foot = new THREE.Mesh(merge([ell([0, -0.004, -0.02], [0.011, 0.007, 0.024], skinFn), ell([0, -0.011, -0.045], [0.014, 0.003, 0.014], skinFn, 10, 6)]), mat);
      knee.add(foot);
      hip.add(thigh, knee);
      root.add(hip);
      legs.push({ hip, knee, s });
    }
    root.scale.setScalar(1.15);
    root.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    this.scene.add(root);
    this.frog = { root, body, throat, pupils, legs, pad: 0, x: 0, y: 0, z: 0, yaw: 0, state: 'sit', t: 0, timer: rand(1.5, 3), blink: 0, blinkT: rand(1.5, 4), from: new THREE.Vector3(), to: new THREE.Vector3(), toPad: 0, ext: 0, look: 0, breath: Math.random() * TAU, squash: 0, pitch: 0 };
    const f = this.frog;
    const p = this.padList[f.pad];
    f.x = p.x;
    f.z = p.z;
    f.yaw = 0.6;
    this.updateFrog(0, 0);
  }

  padTop(i) {
    const p = this.padList[i];
    return p.y + 0.006;
  }

  updateFrog(dt, t) {
    const f = this.frog;
    f.t += dt;
    f.blinkT -= dt;
    if (f.blinkT <= 0) {
      f.blink = 0.16;
      f.blinkT = rand(1.5, 4.5);
    }
    f.blink = Math.max(0, f.blink - dt);
    const blink = f.blink > 0 ? Math.sin((1 - f.blink / 0.16) * Math.PI) : 0;
    let scaleY = 1;
    let scaleXZ = 1;
    let ext = 0;
    let pitch = 0;
    let lift = 0;
    let throat = 1 + 0.16 * Math.sin(t * 2.6 + f.breath);
    if (f.state === 'sit') {
      f.timer -= dt;
      // gentle breathing, an occasional throat swell
      if (f.timer <= 0) {
        if (Math.random() < 0.65) this.startHop();
        else {
          f.state = 'croak';
          f.t = 0;
        }
      }
      f.yaw += Math.sin(t * 0.35 + f.breath) * 0.06 * dt;
    } else if (f.state === 'croak') {
      const k = f.t / 0.9;
      throat = 1 + 0.9 * Math.sin(clamp(k, 0, 1) * Math.PI * 2) ** 2;
      if (k >= 1) {
        f.state = 'sit';
        f.timer = rand(2, 4.5);
      }
    } else if (f.state === 'turn') {
      const want = Math.atan2(f.to.x - f.x, f.to.z - f.z);
      const d = angleDiff(f.yaw, want);
      f.yaw += d * (1 - Math.exp(-12 * dt));
      if (Math.abs(d) < 0.08 || f.t > 0.6) {
        f.state = 'crouch';
        f.t = 0;
      }
    } else if (f.state === 'crouch') {
      const k = clamp(f.t / 0.22, 0, 1);
      scaleY = 1 - 0.2 * k;
      scaleXZ = 1 + 0.1 * k;
      ext = -0.3 * k;
      if (k >= 1) {
        f.state = 'jump';
        f.t = 0;
        f.from.set(f.x, this.padTop(f.pad), f.z);
        this.sound?.()?.plip(f.x, WATER_Y, f.z, 0.3);
      }
    } else if (f.state === 'jump') {
      const dur = 0.58;
      const u = clamp(f.t / dur, 0, 1);
      const to = f.to;
      const ty = this.padTop(f.toPad);
      f.x = f.from.x + (to.x - f.from.x) * u;
      f.z = f.from.z + (to.z - f.from.z) * u;
      const arc = 4 * u * (1 - u);
      f.y = f.from.y + (ty - f.from.y) * u;
      lift = arc * 0.13;
      ext = smooth(0, 0.22, u) * (1 - smooth(0.78, 1, u));
      pitch = -0.6 * (1 - 2 * u) * 0.9;
      scaleY = 1 + 0.12 * arc;
      scaleXZ = 1 - 0.05 * arc;
      if (u >= 1) {
        f.state = 'land';
        f.t = 0;
        f.pad = f.toPad;
        f.x = to.x;
        f.z = to.z;
        // a ripple on the water and the pad dips under its weight
        const p = this.padList[f.pad];
        this.ripple(p.x, p.z, 0.7);
        this.splash(p.x, p.z, 3, 0.45);
        this.sound?.()?.plip(p.x, WATER_Y, p.z, 0.7);
      }
    } else if (f.state === 'land') {
      const k = clamp(f.t / 0.3, 0, 1);
      scaleY = 1 - 0.18 * Math.sin(k * Math.PI);
      scaleXZ = 1 + 0.09 * Math.sin(k * Math.PI);
      if (k >= 1) {
        f.state = 'sit';
        f.timer = rand(2.5, 6);
      }
    }
    f.ext = damp(f.ext, ext, 30, dt);
    const p = this.padList[f.pad];
    // while sitting or landing it rides its pad; in the air it has its own height
    if (f.state === 'sit' || f.state === 'croak' || f.state === 'turn' || f.state === 'crouch' || f.state === 'land') {
      f.x = p.x + Math.sin(f.yaw + 0.5) * 0.0;
      f.z = p.z;
      f.y = p.y + 0.006;
    }
    f.root.position.set(f.x, f.y + lift, f.z);
    _e.set(-pitch, f.yaw, 0, 'YXZ');
    f.root.quaternion.setFromEuler(_e);
    if (f.state === 'sit' || f.state === 'croak' || f.state === 'land' || f.state === 'crouch') {
      // the pad tips a little with the frog on it
      f.root.rotation.x += p.tiltX * 0.4;
      f.root.rotation.z += p.tiltZ * 0.4;
    }
    f.root.scale.set(1.15 * scaleXZ, 1.15 * scaleY, 1.15 * scaleXZ);
    f.throat.scale.set(1, throat, 1 + (throat - 1) * 0.5);
    for (const g of f.pupils) g.children[0].scale.y = 1 - blink * 0.92;
    // legs: folded at rest, stretched behind in the jump
    const e = clamp(f.ext, -0.4, 1);
    for (const l of f.legs) {
      l.hip.rotation.x = 0.35 - e * 0.95;
      l.hip.rotation.y = -l.s * (0.25 - e * 0.25);
      l.knee.rotation.x = Math.PI * 0.9 * (1 - clamp(e, 0, 1)) + 0.0;
      l.hip.scale.z = 1 + Math.max(0, e) * 0.25;
    }
  }

  startHop() {
    const f = this.frog;
    // to another pad, not too far, and not the one it is on
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < this.padList.length; i++) {
      if (i === f.pad) continue;
      const p = this.padList[i];
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      const score = -Math.abs(d - 0.5) + Math.random() * 0.4 + p.r * 2;
      if (d < 0.9 && score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) {
      f.timer = 2;
      return;
    }
    f.toPad = best;
    f.to.set(this.padList[best].x, 0, this.padList[best].z);
    f.state = 'turn';
    f.t = 0;
  }

  // ------------------------------------------------------------ every frame

  update(dt, t) {
    this.time = t;
    this.updatePads(t);
    this.updateEffects(dt);
    this.updateKoi(dt, t);
    this.updateFrog(dt, t);
    // waves that have died away
    while (this.waves.length && t - this.waves[0].t0 > 3.5) this.waves.shift();
  }

  dispose() {
    for (const o of [this.pads, this.lilies, this.rings, this.drops, this.koi, this.leap.group, this.frog.root]) {
      this.scene.remove(o);
      o.traverse?.((c) => {
        c.geometry?.dispose();
        c.material?.dispose?.();
      });
    }
  }
}
