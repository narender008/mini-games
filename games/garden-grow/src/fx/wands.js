// Big kid tools: the sun wand and the rain cloud. Each floats over the
// aimed spot, following with a soft lag and a gentle bob.
//
// The sun wand is a slender varnished wooden wand with a small glowing
// golden sun on its tip (slowly boiling granules, darker at the rim, like
// the real one). Pressed, it shines a warm soft beam down on the spot: a
// faint cone of light in the air, a warm pool of light on the ground and
// golden motes drifting in it. The rain cloud is a small soft grey-white
// cloud, lit from the sun's side; pressed, its underside darkens and it rains
// gently on the spot below.
import * as THREE from 'three';
import { REDUCED_MOTION, clamp, damp, mulberry32 } from '../config.js';
import { canvasTexture, fbm } from '../shared.js';
import { SpriteBatch, FRAME } from './sprites.js';
import { Drops, LAND_REPORT, LAND_SPLASH } from './drops.js';
import { lightFor } from './light.js';

const SUN_HEIGHT = 0.42; // orb above the spot
const CLOUD_HEIGHT = 0.5;
const STICK = 0.3;
const ORB = 0.022;
const BEAM_RADIUS = 0.13;

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const WARM = new THREE.Color(1, 0.62, 0.26);

const NOISE = /* glsl */ `
float wh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float wn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wh(i), wh(i + vec3(1, 0, 0)), f.x), mix(wh(i + vec3(0, 1, 0)), wh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wh(i + vec3(0, 0, 1)), wh(i + vec3(1, 0, 1)), f.x), mix(wh(i + vec3(0, 1, 1)), wh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

// ------------------------------------------------------------ the sun wand

function orbMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vP = position;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime;
      uniform float uHeat;
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        float mu = max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0);
        // limb darkening, and granules slowly boiling on the surface
        float limb = 0.5 + 0.5 * pow(mu, 0.55);
        vec3 q = vP * 160.0;
        float g = wn(q + vec3(0.0, uTime * 0.7, 0.0)) * 0.6 + wn(q * 2.3 - uTime * 0.9) * 0.4;
        // kept near 1: brighter, and the tone curve bleaches the gold to cream
        vec3 core = mix(vec3(1.0, 0.3, 0.03), vec3(1.0, 0.56, 0.13), limb * limb);
        vec3 col = core * limb * (0.74 + 0.3 * g) * (0.8 + 0.4 * uHeat);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function woodTexture() {
  return canvasTexture(
    32,
    256,
    (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // long grain along the wand, the odd darker streak
          const g = fbm(x / 3, y / 60, 4);
          const streak = Math.pow(Math.abs(Math.sin(x * 0.9 + g * 6)), 8) * 0.25;
          const c = 0.62 + g * 0.35 - streak;
          const i = (y * w + x) * 4;
          img.data[i] = 255 * Math.min(1, c * 0.78);
          img.data[i + 1] = 255 * Math.min(1, c * 0.5);
          img.data[i + 2] = 255 * Math.min(1, c * 0.3);
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { srgb: true },
  );
}

const BEAM_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying float vH;
varying float vAng;
void main() {
  vH = position.y + 0.5; // 0 at the ground, 1 at the orb
  vAng = atan(position.z, position.x);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BEAM_FRAG = /* glsl */ `
${NOISE}
uniform float uTime;
uniform float uAmount;
uniform vec3 uColor;
varying vec3 vW;
varying vec3 vN;
varying float vH;
varying float vAng;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  // light through the middle of the cone crosses more lit air
  float thick = pow(abs(dot(normalize(vN), v)), 1.6);
  float fall = mix(0.35, 1.0, vH * vH);
  // dust drifting through the beam
  float dust = 0.7 + 0.3 * wn(vW * 30.0 + vec3(0.0, -uTime * 0.2, uTime * 0.1));
  // soft shafts round the cone, slowly shifting
  float shafts = 0.55 + 0.45 * wn(vec3(vAng * 3.0, vH * 1.5 - uTime * 0.15, uTime * 0.05));
  float a = thick * fall * dust * shafts * uAmount;
  gl_FragColor = vec4(uColor * a, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const POOL_FRAG = /* glsl */ `
uniform float uAmount;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = (exp(-r * r * 5.0) * 0.8 + exp(-r * r * 2.0) * 0.2) * (1.0 - smoothstep(0.85, 1.0, r)) * uAmount;
  gl_FragColor = vec4(uColor * a, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function additive(uniforms, vertexShader, fragmentShader, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    ...extra,
  });
}

// ------------------------------------------------------------ the wands

export class Wands {
  // ground (optional): { heightAt, wet } so the cloud's rain wets the soil
  constructor({ scene, quality, ground = null }) {
    this.scene = scene;
    this.ground = ground;
    this.onWater = null;
    this.onSun = null;
    this.k = clamp(quality.particles ?? 1, 0.25, 1);
    this.id = null;
    this.on = false;
    this.target = null;
    this.spot = new THREE.Vector3(); // smoothed aim
    this.pos = new THREE.Vector3(); // where the wand floats
    this.vel = new THREE.Vector3();
    this.time = 0;
    this.show = { sun: 0, rain: 0 };
    this.power = 0; // eases with active()

    // the sun wand: orb on a stick
    this.sun = new THREE.Group();
    this.orbMat = orbMaterial();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(ORB, 32, 16), this.orbMat);
    this.sun.add(orb);
    this.stick = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.42, metalness: 0 });
    const stickMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0042, STICK, 12, 1), wood);
    stickMesh.position.y = ORB + 0.006 + STICK / 2;
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a05a, metalness: 1, roughness: 0.32 });
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0052, 0.016, 16, 1), brass);
    ferrule.position.y = ORB + 0.004;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 8), wood);
    knob.position.y = ORB + 0.006 + STICK;
    for (const m of [stickMesh, ferrule, knob]) {
      m.castShadow = true;
      this.stick.add(m);
    }
    this.sun.add(this.stick);
    this.sun.visible = false;
    scene.add(this.sun);

    // its beam, the pool of light on the ground, and a halo round the orb
    this.beamU = { uTime: { value: 0 }, uAmount: { value: 0 }, uColor: { value: new THREE.Color() } };
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1, 1, 32, 1, true), additive(this.beamU, BEAM_VERT, BEAM_FRAG, { side: THREE.DoubleSide }));
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 10;
    this.beam.visible = false;
    scene.add(this.beam);
    this.poolU = { uAmount: { value: 0 }, uColor: { value: new THREE.Color() } };
    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      additive(this.poolU, 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', POOL_FRAG, {
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.pool.frustumCulled = false;
    this.pool.renderOrder = 7;
    this.pool.visible = false;
    scene.add(this.pool);

    // glows and motes (light), and the cloud's puffs (matter)
    this.glows = new SpriteBatch(scene, { capacity: 64, renderOrder: 11 });
    this.halo = this.glows.spawn();
    this.rays = this.glows.spawn();
    for (const p of [this.halo, this.rays]) {
      p.life = 1e9;
      p.add = 1;
      p.a = 0;
    }
    this.halo.frame = FRAME.soft;
    this.rays.frame = FRAME.star;
    this.moteAcc = 0;

    this.cloud = new SpriteBatch(scene, { capacity: 24, renderOrder: 9 });
    this.puffs = [];
    const rnd = mulberry32(7);
    for (let i = 0; i < 18; i++) {
      const p = this.cloud.spawn();
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd());
      p.ox = Math.cos(a) * r * 0.12;
      p.oz = Math.sin(a) * r * 0.07;
      // a flat base, billows heaped on top and in the middle
      p.oy = -0.02 + rnd() * 0.035 + (1 - r) * 0.04;
      p.base = p.oy < 0.0 ? 1 : 0;
      p.size = 0.075 + rnd() * 0.06 * (1 - r * 0.5);
      p.frame = FRAME.cloud + (i % 4);
      p.rot = rnd() * 6.28;
      p.life = 1e9;
      p.add = 0;
      p.lit = 0.75;
      p.a = 0;
      p.phase = rnd() * 6.28;
      // which way this puff faces from the cloud's middle, for its shading
      p.nx = p.ox / 0.12;
      p.ny = (p.oy - 0.01) / 0.05;
      p.nz = p.oz / 0.07;
      this.puffs.push(p);
    }
    // soft grey veils of rain hanging under the cloud while it rains
    this.virga = [];
    for (let i = 0; i < 3; i++) {
      const v = this.cloud.spawn();
      v.frame = FRAME.soft;
      v.life = 1e9;
      v.add = 0;
      v.lit = 0;
      v.a = 0;
      v.w = 0.55;
      v.h = 1.6;
      v.ox = (i - 1) * 0.05;
      v.phase = i * 2.1;
      this.virga.push(v);
    }
    this.drops = new Drops(scene, {
      capacity: Math.round(300 + 400 * this.k),
      groundAt: (x, z) => (this.ground ? this.ground.heightAt(x, z) : this.spot.y),
    });
    this.drops.uniforms.uFar.value = 3;
    this.rainAcc = 0;
    this.landN = 0;
    this.landX = 0;
    this.landZ = 0;
    this.landW = 0;
    this.drops.onLand = (x, y, z, w) => {
      this.landN++;
      this.landX += x;
      this.landZ += z;
      this.landW += w;
    };
    this.stickDir = new THREE.Vector3(0, 1, 0);
    this.eye = new THREE.Vector3();
    const e = this.eye;
    const d2 = (p) => (p.x - e.x) ** 2 + (p.y - e.y) ** 2 + (p.z - e.z) ** 2;
    this.byDepth = (a, b) => d2(b) - d2(a);
  }

  // 'sun' | 'rain' | null
  set(id) {
    if (id !== 'sun' && id !== 'rain') id = null;
    if (id && id !== this.id && !this.target) this.placed = false;
    this.id = id;
    if (!id) this.on = false;
  }

  // the spot over the ground to hover above (Vector3), or null
  aim(target) {
    if (!target) {
      this.target = null;
      return;
    }
    if (!this.target) this.target = new THREE.Vector3();
    this.target.copy(target);
    if (!this.placed) {
      // first appearance: start right there, just a little higher
      this.placed = true;
      this.spot.copy(target);
      this.pos.copy(target);
      this.pos.y += SUN_HEIGHT + 0.08;
      this.vel.set(0, 0, 0);
    }
  }

  // pressed: the sun wand shines, the cloud rains
  active(on) {
    this.on = !!on;
  }

  update(dt, t, camera) {
    if (dt <= 0) return;
    this.time += dt;
    const reduced = REDUCED_MOTION.matches;
    const L = lightFor(this.scene);
    this.show.sun = damp(this.show.sun, this.id === 'sun' && this.placed ? 1 : 0, 7, dt);
    this.show.rain = damp(this.show.rain, this.id === 'rain' && this.placed ? 1 : 0, 7, dt);
    const on = this.on && !!this.id && !!this.target;
    this.power = damp(this.power, on ? 1 : 0, on ? 5 : 3.5, dt);

    // ---- float over the spot, with a soft lag and a gentle bob
    if (this.target) {
      this.spot.x = damp(this.spot.x, this.target.x, 8, dt);
      this.spot.y = damp(this.spot.y, this.target.y, 8, dt);
      this.spot.z = damp(this.spot.z, this.target.z, 8, dt);
    }
    const h = this.id === 'rain' ? CLOUD_HEIGHT : SUN_HEIGHT;
    tmpV.copy(this.spot);
    tmpV.y += h + (reduced ? 0 : Math.sin(this.time * 1.6) * 0.008);
    const w = reduced ? 6 : 9;
    tmpW.subVectors(tmpV, this.pos).multiplyScalar(w * w).addScaledVector(this.vel, -2 * w);
    this.vel.addScaledVector(tmpW, dt);
    this.pos.addScaledVector(this.vel, dt);

    this.updateSun(dt, camera, L, reduced);
    this.updateRain(dt, camera, L, reduced);
    this.glows.update(dt, L);
    this.cloud.update(dt, L);
    this.drops.update(dt);

    // ---- tell the garden
    if (on && this.power > 0.5) {
      if (this.id === 'sun' && this.onSun) this.onSun(this.spot.x, this.spot.z, dt * this.power);
    }
    if (this.landN > 0) {
      const x = this.landX / this.landN;
      const z = this.landZ / this.landN;
      if (this.ground && this.ground.wet) this.ground.wet(x, z, 0.1, Math.min(1, this.landW * 1.5));
      if (this.onWater) this.onWater(x, z, this.landW);
      this.landN = this.landX = this.landZ = this.landW = 0;
    }
  }

  updateSun(dt, camera, L, reduced) {
    const s = this.show.sun;
    this.sun.visible = s > 0.01;
    const glowOn = s > 0.01;
    if (!glowOn) {
      this.halo.a = this.rays.a = 0;
      this.beam.visible = this.pool.visible = false;
      return;
    }
    this.sun.position.copy(this.pos);
    this.sun.scale.setScalar(0.3 + 0.7 * s);
    // the wand leans back towards the camera, as if held from there, and
    // swings a little as it is carried
    if (camera) {
      tmpV.subVectors(camera.position, this.pos).setY(0).normalize();
      tmpW.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      tmpV.multiplyScalar(0.55).addScaledVector(tmpW, 0.3).add(UP);
      tmpV.addScaledVector(this.vel, -0.25);
      tmpV.normalize();
      this.stickDir.lerp(tmpV, 1 - Math.exp(-dt * 8)).normalize();
    }
    tmpQ.setFromUnitVectors(UP, this.stickDir);
    this.stick.quaternion.copy(tmpQ);
    const p = this.power;
    this.orbMat.uniforms.uTime.value = this.time;
    this.orbMat.uniforms.uHeat.value = p;
    // halo and slowly turning rays round the orb
    // a little stronger when the garden is dim
    const dim = Math.min(1, 0.3 / Math.max(0.05, L.sunColor.r + L.sunColor.g));
    this.halo.x = this.rays.x = this.pos.x;
    this.halo.y = this.rays.y = this.pos.y;
    this.halo.z = this.rays.z = this.pos.z;
    this.halo.size = (0.09 + 0.05 * p) * s;
    this.halo.r = WARM.r;
    this.halo.g = WARM.g;
    this.halo.b = WARM.b;
    this.halo.a = (0.3 + 0.25 * p + 0.15 * dim) * s;
    this.rays.size = (0.13 + 0.08 * p) * s;
    this.rays.rot += dt * 0.15;
    this.rays.r = WARM.r;
    this.rays.g = WARM.g;
    this.rays.b = WARM.b;
    this.rays.a = (0.18 + 0.3 * p) * s;
    // the beam, down to the ground
    const gy = this.ground ? this.ground.heightAt(this.spot.x, this.spot.z) : this.spot.y;
    const len = Math.max(0.05, this.pos.y - gy);
    this.beam.visible = this.pool.visible = p > 0.01;
    if (!this.beam.visible) return;
    this.beam.position.set(this.pos.x, gy + len / 2, this.pos.z);
    this.beam.scale.set(BEAM_RADIUS, len, BEAM_RADIUS);
    this.beamU.uTime.value = this.time;
    this.beamU.uAmount.value = p * s * 0.2;
    this.beamU.uColor.value.copy(WARM);
    this.pool.position.set(this.pos.x, gy + 0.004, this.pos.z);
    this.pool.scale.setScalar(BEAM_RADIUS * 3.2);
    this.poolU.uAmount.value = p * s * 0.5;
    this.poolU.uColor.value.copy(WARM);
    // golden motes drifting in the light
    this.moteAcc += dt * p * (reduced ? 12 : 30) * this.k;
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1;
      const m = this.glows.spawn();
      const y = Math.random();
      const r = Math.sqrt(Math.random()) * BEAM_RADIUS * (0.2 + 0.8 * (1 - y)) * 0.8;
      const a = Math.random() * Math.PI * 2;
      m.x = this.pos.x + Math.cos(a) * r;
      m.y = gy + len * y;
      m.z = this.pos.z + Math.sin(a) * r;
      m.vx = (Math.random() - 0.5) * 0.02;
      m.vy = (Math.random() - 0.4) * 0.03;
      m.vz = (Math.random() - 0.5) * 0.02;
      m.size = 0.006 + Math.random() * 0.006;
      m.frame = FRAME.mote;
      m.life = 1.4 + Math.random() * 1.4;
      m.fadeIn = 0.4;
      const hot = 1.8 + Math.random() * 1.5;
      m.r = WARM.r * hot;
      m.g = WARM.g * hot;
      m.b = WARM.b * hot;
      m.add = 1;
      m.twinkle = reduced ? 0 : 6 + Math.random() * 6;
    }
  }

  updateRain(dt, camera, L, reduced) {
    const s = this.show.rain;
    this.cloud.mesh.visible = s > 0.01;
    if (!this.cloud.mesh.visible) return;
    const p = this.id === 'rain' ? this.power : 0;
    const t = this.time;
    for (const q of this.puffs) {
      // billowing slowly
      const b = reduced ? 0 : 1;
      q.x = this.pos.x + q.ox * (0.4 + 0.6 * s) + Math.sin(t * 0.5 + q.phase) * 0.006 * b;
      q.y = this.pos.y + q.oy * (0.4 + 0.6 * s) + Math.sin(t * 0.7 + q.phase * 1.3) * 0.004 * b;
      q.z = this.pos.z + q.oz * (0.4 + 0.6 * s);
      q.rot += dt * 0.05 * (q.phase > 3 ? 1 : -1);
      // white on top and on the sunny side; the underside greyer, darker
      // still while it rains
      const sd = L.sunDir;
      const sunny = clamp((q.nx * sd.x + q.ny * sd.y + q.nz * sd.z) / Math.hypot(q.nx, q.ny, q.nz, 0.3), -1, 1);
      const g = (q.base ? 0.74 - 0.24 * p : 0.94 - 0.1 * p) * (0.8 + 0.26 * sunny);
      q.r = g;
      q.g = g;
      q.b = g * 1.02;
      q.a = 0.9 * s;
    }
    for (const v of this.virga) {
      v.x = this.pos.x + v.ox;
      v.y = this.pos.y - 0.2;
      v.z = this.pos.z;
      v.size = 0.14 * s;
      const c = 0.55 + 0.25 * (L.sky.r + L.sky.g) * 0.5;
      v.r = v.g = v.b = Math.min(0.9, c);
      v.a = 0.1 * p * s * (0.8 + 0.2 * Math.sin(t * 0.8 + v.phase));
    }
    // draw back to front
    if (camera) {
      this.eye.copy(camera.position);
      this.cloud.list.sort(this.byDepth);
    }
    // rain from its base
    if (p > 0.05) {
      const full = (reduced ? 90 : 170) * (0.5 + 0.5 * this.k);
      this.rainAcc += dt * full * p;
      const weight = 1 / full;
      while (this.rainAcc >= 1) {
        this.rainAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 0.085;
        const age = Math.random() * dt;
        this.drops.emit(
          this.pos.x + Math.cos(a) * r,
          this.pos.y - 0.03,
          this.pos.z + Math.sin(a) * r * 0.7,
          this.vel.x * 0.5,
          -0.5 - Math.random() * 0.4,
          this.vel.z * 0.5,
          0.0006 + Math.random() * 0.0004,
          1.3,
          LAND_REPORT | (Math.random() < 0.4 ? LAND_SPLASH : 0),
          weight,
          1,
          age,
        );
      }
    }
  }
}
