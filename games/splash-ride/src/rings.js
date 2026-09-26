// Sparkle rings: upright hoops of warm light standing in the water, each
// with a soft halo and a swirl of twinkling motes. Driving through one gives
// a chime, a shimmer burst and a short speed whoosh. They come in gentle
// chains laid out ahead of the boat through open water, so wherever a child
// steers there is always another one to find.
import * as THREE from 'three';
import { rand, clamp, angleDiff, TAU } from './config.js';
import { LAYER_FX } from './post.js';
import { canvasTexture } from './places/common.js';

const POOL = 10;
const R = 1.65; // hoop radius
const TUBE = 0.075;
const Y = 1.35; // hoop centre above the water
const MOTES = 28;
const TINTS = [
  [1.0, 0.78, 0.35],
  [1.0, 0.58, 0.62],
  [0.45, 0.9, 1.0],
  [0.78, 0.66, 1.0],
  [0.6, 1.0, 0.62],
];

const MOTE_VERT = /* glsl */ `
attribute vec4 mote; // phase, size, alpha, twinkle speed
attribute vec3 tint;
uniform float uTime;
uniform float uScale;
varying vec3 vTint;
varying float vA;
void main() {
  vTint = tint;
  vA = mote.z * (0.55 + 0.45 * sin(uTime * mote.w + mote.x * 9.0));
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = mote.y * uScale / max(0.5, -mv.z);
}`;

const MOTE_FRAG = /* glsl */ `
varying vec3 vTint;
varying float vA;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float core = exp(-r2 * 10.0);
  float star = exp(-abs(p.x * p.y) * 80.0) * max(0.0, 1.0 - r2);
  float a = (core + star * 0.7) * vA;
  gl_FragColor = vec4(vTint * a * 3.0, 0.0);
}`;

function haloTexture() {
  return canvasTexture(256, 256, (g, w) => {
    const c = w / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    // brightest just outside the hoop's radius (at 0.78 of the quad)
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.76, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.9, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  }, { srgb: false });
}

export class Rings {
  constructor({ scene, land }) {
    this.land = land;
    this.group = new THREE.Group();
    this.group.name = 'rings';
    scene.add(this.group);
    this.rings = [];
    this.time = 0;
    this.streak = 0;
    this.streakTimer = 0;
    this.onCollect = () => {};
    const torus = new THREE.TorusGeometry(R, TUBE, 14, 72);
    const halo = new THREE.PlaneGeometry(R * 2 / 0.78, R * 2 / 0.78);
    const haloTex = haloTexture();
    for (let i = 0; i < POOL; i++) {
      const tint = new THREE.Color().fromArray(TINTS[i % TINTS.length]);
      const mat = new THREE.MeshStandardMaterial({
        color: tint.clone().multiplyScalar(0.8),
        emissive: tint,
        emissiveIntensity: 2.6,
        roughness: 0.25,
        metalness: 0.3,
      });
      const hoop = new THREE.Mesh(torus, mat);
      hoop.position.y = Y;
      const glow = new THREE.Mesh(
        halo,
        new THREE.MeshBasicMaterial({ map: haloTex, color: tint.clone().multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      );
      glow.position.y = Y;
      glow.layers.set(LAYER_FX);
      const root = new THREE.Group();
      root.add(hoop, glow);
      root.visible = false;
      this.group.add(root);
      this.rings.push({ i, root, hoop, glow, mat, tint, live: false, x: 0, z: 0, heading: 0, pop: 0, side: 0, born: 0, chain: 0 });
    }
    // motes: one point cloud for every ring
    const n = POOL * MOTES;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const mote = new Float32Array(n * 4);
    const tint = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      mote.set([Math.random(), rand(0.05, 0.12), rand(0.5, 1), rand(2, 6)], k * 4);
      tint.set(TINTS[Math.floor(k / MOTES) % TINTS.length], k * 3);
    }
    g.setAttribute('mote', new THREE.BufferAttribute(mote, 4));
    g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
    this.moteUniforms = { uTime: { value: 0 }, uScale: { value: 700 } };
    this.motes = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, uniforms: this.moteUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    this.motes.layers.set(LAYER_FX);
    scene.add(this.motes);
    this.chainId = 0;
  }

  setViewport(h) {
    this.moteUniforms.uScale.value = h * 0.9;
  }

  clear() {
    for (const r of this.rings) {
      r.live = false;
      r.root.visible = false;
    }
    this.streak = 0;
  }

  // the next live ring ahead of the boat (for the little ones' gentle pull)
  nextAhead(boat) {
    let best = null;
    let bd = Infinity;
    for (const r of this.rings) {
      if (!r.live || r.pop > 0) continue;
      const dx = r.x - boat.pos.x;
      const dz = r.z - boat.pos.z;
      const d = Math.hypot(dx, dz);
      const ahead = dx * boat.fwdX + dz * boat.fwdZ;
      if (ahead < 2 || d > 70) continue;
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  // Lay a gentle chain of rings through open water ahead of the boat.
  spawnChain(boat) {
    const free = this.rings.filter((r) => !r.live);
    if (free.length < 3) return;
    const count = Math.min(free.length, 3 + Math.floor(Math.random() * 3));
    let h = boat.heading + rand(-0.5, 0.5);
    let x = boat.pos.x - Math.sin(h) * rand(38, 55);
    let z = boat.pos.z - Math.cos(h) * rand(38, 55);
    const bend = rand(-0.22, 0.22);
    const chain = ++this.chainId;
    let placed = 0;
    for (let k = 0; k < count; k++) {
      if (this.land.distance(x, z) < 9) break;
      const r = free[k];
      r.live = true;
      r.x = x;
      r.z = z;
      r.heading = h;
      r.pop = 0;
      r.born = this.time + k * 0.15;
      r.chain = chain;
      r.side = null;
      r.root.visible = true;
      r.root.position.set(x, 0, z);
      r.root.rotation.set(0, h, 0);
      placed++;
      h += bend;
      const step = rand(15, 19);
      x -= Math.sin(h) * step;
      z -= Math.cos(h) * step;
    }
    return placed;
  }

  update(dt, boat, camera) {
    this.time += dt;
    const t = this.time;
    this.moteUniforms.uTime.value = t;
    this.streakTimer -= dt;
    if (this.streakTimer <= 0) this.streak = 0;
    let ahead = 0;
    const pos = this.motes.geometry.attributes.position.array;
    for (const r of this.rings) {
      if (!r.live) {
        for (let m = 0; m < MOTES; m++) pos[(r.i * MOTES + m) * 3 + 1] = -100;
        continue;
      }
      const dx = boat.pos.x - r.x;
      const dz = boat.pos.z - r.z;
      const dist = Math.hypot(dx, dz);
      // ring axis (its facing) and the line across it
      const ax = -Math.sin(r.heading);
      const az = -Math.cos(r.heading);
      const along = dx * ax + dz * az;
      const across = dx * az - dz * ax;
      if (r.pop > 0) {
        r.pop += dt * 2.2;
        const s = 1 + r.pop * 0.6;
        r.root.scale.set(s, s, s);
        r.mat.emissiveIntensity = 2.6 * (1 + r.pop * 2) * Math.max(0, 1 - r.pop);
        r.glow.material.opacity = Math.max(0, 1 - r.pop);
        if (r.pop >= 1) {
          r.live = false;
          r.root.visible = false;
          r.root.scale.set(1, 1, 1);
          r.glow.material.opacity = 1;
        }
      } else {
        // grow in gently
        const g = clamp((t - r.born) / 0.6, 0, 1);
        const s = 0.2 + 0.8 * g * g * (3 - 2 * g);
        r.root.scale.set(s, s, s);
        r.mat.emissiveIntensity = 2.6 * (0.85 + 0.15 * Math.sin(t * 3 + r.i));
        r.root.position.y = Math.sin(t * 1.3 + r.i) * 0.06;
        // collected when the boat passes through the plane of the hoop
        const side = Math.sign(along);
        if (r.side !== null && side !== r.side && Math.abs(across) < R + 1.1 && !boat.airborneHigh) this.collect(r);
        else if (dist < 1.8) this.collect(r);
        r.side = side;
        if (along < 0 || dist < 30) ahead++;
        // forget rings far behind
        const behind = -(dx * boat.fwdX + dz * boat.fwdZ);
        if (behind < -60 || dist > 260) {
          r.live = false;
          r.root.visible = false;
        }
      }
      // motes swirl round the hoop
      const ca = Math.cos(r.heading);
      const sa = Math.sin(r.heading);
      const s = r.root.scale.x;
      for (let m = 0; m < MOTES; m++) {
        const k = (r.i * MOTES + m) * 3;
        const a = (m / MOTES) * TAU + t * (0.35 + (m % 3) * 0.12) * (m % 2 ? 1 : -1);
        const rr = (R + Math.sin(t * 2 + m) * 0.18 + (m % 4) * 0.05) * s;
        const lx = Math.cos(a) * rr;
        const ly = Math.sin(a) * rr + Y * s + r.root.position.y;
        const lz = Math.sin(t * 1.7 + m * 1.3) * 0.25;
        pos[k] = r.x + lx * ca + lz * sa;
        pos[k + 1] = Math.max(0.05, ly);
        pos[k + 2] = r.z - lx * sa + lz * ca;
      }
      // the halo always faces the camera
      r.glow.quaternion.copy(camera.quaternion);
      r.glow.quaternion.premultiply(r.root.quaternion.clone().invert());
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    if (ahead === 0) this.spawnChain(boat);
  }

  collect(r) {
    r.pop = 0.0001;
    this.streak++;
    this.streakTimer = 6;
    this.onCollect(r, this.streak);
  }
}

export { angleDiff };
