// Celebrations: every hit is a volumetric starburst of light that throws out
// physically lit stars, sweets, gems and foil confetti, with a shock ring,
// sparkles, coloured smoke, a real flash of light on the toys nearby and a
// little camera kick. Also the fireworks, bottom "boops" and treat showers.
import * as THREE from 'three';
import { SPRITE } from './textures.js';
import { puffyStar, gemGeometry, candyGeometry, lollipopGeometry } from './geometry.js';
import { vinylMaterial, addGlow } from './materials.js';
import { rand, pick, TOY_COLORS } from './config.js';

const COLORS = TOY_COLORS.map((h) => new THREE.Color(h));
const GOLD = new THREE.Color('#ffc53a');
const STAR_COLORS = ['#ffd23f', '#ffd23f', '#ffe27a', '#ff9ad5', '#9fe3ff', '#ffffff'].map((h) => new THREE.Color(h));
const GEM_COLORS = ['#ff2d55', '#2f7dff', '#1ed760', '#b14dff', '#ffb000', '#19e0ff'].map((h) => new THREE.Color(h));
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

// Instanced physical debris with simple ballistics and tumbling.
class Debris {
  constructor(geometry, material, capacity, { flutter = 0, gravity = 13 } = {}) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.capacity = capacity;
    this.flutter = flutter;
    this.gravity = gravity;
    this.items = [];
  }

  add(x, y, z, vx, vy, vz, scale, color, life) {
    if (this.items.length >= this.capacity) this.items.shift();
    this.items.push({
      x,
      y,
      z,
      vx,
      vy,
      vz,
      scale,
      color,
      life,
      age: 0,
      rx: rand(0, 6.28),
      ry: rand(0, 6.28),
      rz: rand(0, 6.28),
      wx: rand(-9, 9),
      wy: rand(-9, 9),
      wz: rand(-6, 6),
      phase: rand(0, 6.28),
    });
  }

  update(dt) {
    const items = this.items;
    let n = 0;
    const drag = Math.exp(-dt * (this.flutter ? 2.6 : 0.9));
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      p.vy -= this.gravity * dt * (this.flutter ? 0.35 : 1);
      if (this.flutter) p.vx += Math.sin(p.age * 7 + p.phase) * 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.wx * dt;
      p.ry += p.wy * dt;
      p.rz += p.wz * dt;
      const k = p.age / p.life;
      const pop = Math.min(1, p.age / 0.08);
      const s = p.scale * pop * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      tmpE.set(p.rx, p.ry, p.rz);
      tmpQ.setFromEuler(tmpE);
      tmpS.set(s, s, s);
      tmpP.set(p.x, p.y, p.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(n, tmpM);
      this.mesh.setColorAt(n, p.color);
      items[n++] = p;
    }
    items.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// The 3D starburst: a hot core with spikes, drawn additively with a fresnel
// fade so it reads as a glowing volume rather than a solid.
function spikeGeometry() {
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const pos = ico.attributes.position;
  const dirs = [];
  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    const key = v.toArray().map((x) => x.toFixed(3)).join();
    if (!seen.has(key)) {
      seen.add(key);
      dirs.push(v);
    }
  }
  const verts = [];
  const norms = [];
  const tips = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of dirs) {
    const cone = new THREE.ConeGeometry(0.28, 1, 7, 1, true).toNonIndexed();
    cone.translate(0, 0.5, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, d);
    cone.applyQuaternion(q);
    const p = cone.attributes.position;
    const nn = cone.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      verts.push(p.getX(i), p.getY(i), p.getZ(i));
      norms.push(nn.getX(i), nn.getY(i), nn.getZ(i));
      tips.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).length());
    }
  }
  const core = new THREE.IcosahedronGeometry(0.42, 2); // polyhedra are already non-indexed
  for (let i = 0; i < core.attributes.position.count; i++) {
    verts.push(core.attributes.position.getX(i), core.attributes.position.getY(i), core.attributes.position.getZ(i));
    norms.push(core.attributes.normal.getX(i), core.attributes.normal.getY(i), core.attributes.normal.getZ(i));
    tips.push(0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tips, 1));
  return g;
}

const burstVertex = /* glsl */ `
attribute float aTip;
attribute vec4 aState; // age 0..1, heat, unused, unused
varying float vTip;
varying float vFres;
varying float vAge;
varying vec3 vColor;
void main() {
  vTip = aTip;
  vAge = aState.x;
  #ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
  #else
  vColor = vec3(1.0);
  #endif
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vec3 v = normalize(cameraPosition - wp.xyz);
  vFres = abs(dot(n, v));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const burstFragment = /* glsl */ `
varying float vTip;
varying float vFres;
varying float vAge;
varying vec3 vColor;
void main() {
  float a = 1.0 - vAge;
  // white-hot core, sunny yellow body, tips in the toy's own colour
  vec3 col = mix(vec3(2.4, 2.1, 1.3), vec3(1.0, 0.62, 0.06), smoothstep(0.2, 0.5, vTip));
  col = mix(col, vColor, smoothstep(0.6, 1.0, vTip));
  float edge = smoothstep(0.05, 0.6, vFres);
  float alpha = edge * a * a * mix(1.0, 0.85, vTip);
  gl_FragColor = vec4(col, alpha);
}`;

class BurstMeshes {
  constructor(capacity = 24) {
    const g = spikeGeometry();
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.state.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aState', this.state);
    const m = new THREE.ShaderMaterial({
      vertexShader: burstVertex,
      fragmentShader: burstFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(g, m, capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.count = 0;
    this.capacity = capacity;
    this.items = [];
  }

  add(x, y, z, size, color, life = 0.42) {
    if (this.items.length >= this.capacity) this.items.shift();
    this.items.push({ x, y, z, size, color, life, age: 0, rot: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)), spin: rand(-3, 3) });
  }

  update(dt) {
    let n = 0;
    for (const p of this.items) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = p.age / p.life;
      const grow = 1 - (1 - Math.min(1, k * 2.6)) ** 3;
      const s = p.size * (0.25 + grow * 0.9);
      p.rot.z += p.spin * dt;
      tmpQ.setFromEuler(p.rot);
      tmpS.set(s, s, s);
      tmpP.set(p.x, p.y, p.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(n, tmpM);
      this.mesh.setColorAt(n, p.color);
      this.state.setXYZW(n, k, 1, 0, 0);
      this.items[n++] = p;
    }
    this.items.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.state.needsUpdate = true;
  }
}

export class FX {
  constructor({ scene, glow, smoke, candyTexture, quality, onKick, onShock }) {
    this.scene = scene;
    this.glow = glow; // additive SpriteBatch
    this.smoke = smoke; // alpha SpriteBatch
    this.onKick = onKick;
    this.onShock = onShock;
    this.amount = quality.debris;
    const cap = Math.round(260 * quality.debris);
    const starMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 });
    addGlow(starMat, 0.35);
    const gemMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0.05, ior: 2.4, specularIntensity: 1, clearcoat: 1, iridescence: 0.5, iridescenceIOR: 1.6, envMapIntensity: 2.2, flatShading: true });
    addGlow(gemMat, 0.45);
    const candyMat = vinylMaterial({ map: candyTexture, roughness: 0.18, sss: 0.3, clearcoat: 1 });
    const confMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.55, side: THREE.DoubleSide });
    this.stars = new Debris(puffyStar(), starMat, cap);
    this.gems = new Debris(gemGeometry(), gemMat, cap);
    this.candy = new Debris(candyGeometry(), candyMat, Math.round(cap * 0.6));
    this.lolly = new Debris(lollipopGeometry(), candyMat, Math.round(cap * 0.4));
    this.confetti = new Debris(new THREE.PlaneGeometry(0.2, 0.11), confMat, cap * 2, { flutter: 1, gravity: 9 });
    this.all = [this.stars, this.gems, this.candy, this.lolly, this.confetti];
    for (const d of this.all) scene.add(d.mesh);
    this.bursts = new BurstMeshes(28);
    scene.add(this.bursts.mesh);

    // a few real point lights, re-used for the most recent blasts
    this.lights = [];
    const nLights = quality.tier === 'low' ? 1 : 3;
    for (let i = 0; i < nLights; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 7, 1.6);
      l.position.set(0, 0, 1.2);
      scene.add(l);
      this.lights.push({ light: l, age: 9, peak: 0 });
    }
    this.nextLight = 0;
    this.fireworks = [];
    this.heat = 0;
  }

  flashLight(x, y, color, peak) {
    const slot = this.lights[this.nextLight++ % this.lights.length];
    if (!slot) return;
    slot.light.position.set(x, y, 1.4);
    slot.light.color.copy(color);
    slot.age = 0;
    slot.peak = peak;
  }

  // The main celebration. `power` scales everything (MEGA and bosses > 1).
  burst(x, y, color, power = 1) {
    const g = this.glow;
    const c = color || pick(COLORS);
    const warm = new THREE.Color(1, 0.72, 0.25);
    const tint = c.clone().lerp(warm, 0.35);
    // Many blasts at once share one flash budget, so a big multi-hit never
    // whites out the screen (gentle on small eyes).
    const dim = 1 / (1 + this.heat * 0.45);
    this.heat = Math.min(10, this.heat + 1);
    // comic starburst layers, painted (not added) so they stay saturated on
    // the brightest sky: an orange outer star, a yellow inner star...
    const sm = this.smoke;
    const rot = rand(0, 6.28);
    sm.add({ x, y, z: 0.8, size: 2.3 * power, grow: 0.8, life: 0.3, frame: SPRITE.BURST, rot, spin: rand(-1.5, 1.5), r: 1, g: 0.42 + tint.g * 0.2, b: 0.08, a: 0.95, curve: 'out' });
    sm.add({ x, y, z: 0.82, size: 1.6 * power, grow: 0.9, life: 0.26, frame: SPRITE.BURST2, rot: rot + 0.3, spin: rand(-2, 2), r: 1, g: 0.86, b: 0.3, a: 1, curve: 'out' });
    // ...then a white-hot flash and a ring of light on top
    g.add({ x, y, z: 0.9, size: 2.2 * power, grow: 0.4, life: 0.16, frame: SPRITE.GLOW, r: 2.4, g: 2.2, b: 1.8, a: dim });
    g.add({ x, y, z: 0.7, size: 1.2 * power, grow: 4, life: 0.42, frame: SPRITE.RING, r: 1.6, g: 1.4, b: 1.1, a: 0.6 * dim });
    this.bursts.add(x, y, 0.5, 1.05 * power, tint.clone().multiplyScalar(1.2));
    // sparkles
    const ns = Math.round(10 * power);
    for (let i = 0; i < ns; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(3, 8) * power;
      const sc = pick(STAR_COLORS);
      g.add({ x, y, z: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 1.5, drag: 2.5, gravity: 3, size: rand(0.35, 0.7), life: rand(0.5, 0.9), frame: Math.random() < 0.5 ? SPRITE.SPARKLE : SPRITE.STAR, rot: rand(0, 6), spin: rand(-4, 4), r: sc.r * 2.5, g: sc.g * 2.5, b: sc.b * 2.5, a: 1, twinkle: 30 });
    }
    // soft coloured smoke
    for (let i = 0; i < 3; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.6, 1.6);
      const cc = c.clone().lerp(new THREE.Color(1, 1, 1), 0.35);
      this.smoke.add({ x: x + Math.cos(a) * 0.3, y: y + Math.sin(a) * 0.3, z: -0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.3, drag: 2, size: rand(0.9, 1.3) * power, grow: 1.5, rot: rand(0, 6), spin: rand(-0.6, 0.6), life: rand(0.6, 0.9), frame: i % 2 ? SPRITE.PUFF : SPRITE.PUFF2, r: cc.r, g: cc.g, b: cc.b, a: 0.32 * (0.4 + 0.6 * dim), fadeIn: 0.05 });
    }
    // lit treats
    const k = this.amount * power;
    const throwOut = (list, count, scale, colorFn, speed = [4, 9], life = [1.3, 2]) => {
      for (let i = 0; i < Math.round(count * k); i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(speed[0], speed[1]) * Math.sqrt(power);
        list.add(x, y, rand(0.2, 1.2), Math.cos(a) * sp, Math.sin(a) * sp + 3, rand(-1, 2), scale * rand(0.8, 1.2), colorFn(), rand(life[0], life[1]));
      }
    };
    throwOut(this.stars, 6, 0.55, () => pick(STAR_COLORS));
    throwOut(this.gems, 4, 0.42, () => pick(GEM_COLORS));
    throwOut(this.candy, 2, 0.6, () => pick(COLORS));
    throwOut(this.lolly, 1.2, 0.55, () => pick(COLORS));
    throwOut(this.confetti, 16, 1, () => pick(COLORS), [3, 8], [1.6, 2.4]);
    this.flashLight(x, y, tint, 14 * power * dim);
    if (this.onKick) this.onKick(0.12 * power * dim);
    if (this.onShock && dim > 0.4) this.onShock(x, y, power);
  }

  // A gentle "boop" when an enemy reaches the bottom: no explosion, just a
  // soft puff and a couple of floating hearts.
  boop(x, y, color) {
    const c = color || GOLD;
    this.glow.add({ x, y, z: 0.6, size: 1.8, grow: 0.8, life: 0.35, frame: SPRITE.GLOW, r: c.r * 1.2 + 0.4, g: c.g * 1.2 + 0.4, b: c.b * 1.2 + 0.4, a: 0.8 });
    this.glow.add({ x, y, z: 0.6, size: 0.8, grow: 2.2, life: 0.4, frame: SPRITE.RING, r: 1.4, g: 1.3, b: 1.2, a: 0.6 });
    for (let i = 0; i < 3; i++) {
      this.glow.add({ x: x + rand(-0.4, 0.4), y, z: 1, vx: rand(-0.5, 0.5), vy: rand(1.2, 2.2), drag: 0.8, size: rand(0.35, 0.5), life: rand(0.9, 1.3), frame: SPRITE.HEART, rot: rand(-0.3, 0.3), r: 2.2, g: 0.8, b: 1.3, a: 1, curve: 'inout' });
    }
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2);
      const cc = c.clone().lerp(new THREE.Color(1, 1, 1), 0.6);
      this.smoke.add({ x, y, z: -0.2, vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.8, drag: 2, size: 0.8, grow: 1.5, rot: rand(0, 6), life: 0.8, frame: SPRITE.PUFF, r: cc.r, g: cc.g, b: cc.b, a: 0.4 });
    }
  }

  // A firework shell: climbs, then bursts into a sphere of coloured sparks.
  firework(x, y) {
    const c = pick(COLORS).clone().lerp(new THREE.Color(1, 1, 1), 0.15);
    this.fireworks.push({ x, y: y - 6, ty: y, vy: 14, c, age: 0 });
  }

  // A shower of treats raining down from above (boss finale, MEGA).
  shower(x, y, w, count = 60) {
    for (let i = 0; i < Math.round(count * this.amount); i++) {
      const px = x + rand(-w, w);
      const py = y + rand(0, 3);
      const r = Math.random();
      const vx = rand(-1.5, 1.5);
      const vy = rand(0, 4);
      if (r < 0.3) this.stars.add(px, py, rand(0, 1), vx, vy, 0, 0.6, pick(STAR_COLORS), rand(2.2, 3.2));
      else if (r < 0.55) this.gems.add(px, py, rand(0, 1), vx, vy, 0, 0.45, pick(GEM_COLORS), rand(2.2, 3.2));
      else if (r < 0.75) this.candy.add(px, py, rand(0, 1), vx, vy, 0, 0.65, pick(COLORS), rand(2.2, 3.2));
      else if (r < 0.85) this.lolly.add(px, py, rand(0, 1), vx, vy, 0, 0.6, pick(COLORS), rand(2.2, 3.2));
      else this.confetti.add(px, py, rand(0, 1), vx, vy, 0, 1, pick(COLORS), rand(2.5, 3.5));
    }
  }

  update(dt) {
    this.heat = Math.max(0, this.heat - dt * 6);
    for (const d of this.all) d.update(dt);
    this.bursts.update(dt);
    for (const s of this.lights) {
      s.age += dt;
      const k = Math.max(0, 1 - s.age / 0.35);
      s.light.intensity = s.peak * k * k;
    }
    // fireworks
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const f = this.fireworks[i];
      f.age += dt;
      f.y += f.vy * dt;
      this.glow.add({ x: f.x, y: f.y, z: -1, vx: 0, vy: f.vy * 0.02, size: 0.9, w: 1, h: 0.18, stretch: 1, align: true, life: 0.18, frame: SPRITE.STREAK, r: 3, g: 2.2, b: 1.2, a: 0.9 });
      if (f.y >= f.ty) {
        this.fireworks.splice(i, 1);
        const n = Math.round(46 * Math.max(0.6, this.amount));
        for (let k = 0; k < n; k++) {
          const u = rand(-1, 1);
          const th = rand(0, Math.PI * 2);
          const s = Math.sqrt(1 - u * u);
          const sp = rand(5, 7);
          this.glow.add({ x: f.x, y: f.y, z: -1, vx: Math.cos(th) * s * sp, vy: u * sp, vz: Math.sin(th) * s * sp * 0.3, drag: 1.6, gravity: 2.5, size: rand(0.22, 0.34), life: rand(1.1, 1.6), frame: SPRITE.SPARKLE, rot: rand(0, 6), r: f.c.r * 3, g: f.c.g * 3, b: f.c.b * 3, a: 1, twinkle: 22 });
        }
        this.glow.add({ x: f.x, y: f.y, z: -1, size: 5, grow: 0.5, life: 0.35, frame: SPRITE.GLOW, r: f.c.r * 1.5, g: f.c.g * 1.5, b: f.c.b * 1.5, a: 0.9 });
        this.flashLight(f.x, f.y, f.c, 10);
      }
    }
  }
}
