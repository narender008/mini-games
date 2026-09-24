// Small visual touches around the blocks: soft golden glints, a faint puff of
// wood dust on heavy knocks, "+10" points that float up for big kids, real
// paper confetti, the soft air streak of a finger flick, and the magic
// tidy-away sweep that lifts every block off the floor and whisks it away.
// Everything is sized for the real scene (metres; a block is 4 cm), so the
// glints are millimetres to a centimetre across, not cartoon stars.
import * as THREE from 'three';
import { REDUCED_MOTION, rand, clamp } from './config.js';

const GOLD = new THREE.Color(1.0, 0.74, 0.36);
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

// Positions may come in as plain {x, y, z} (physics events) or Vector3s.
const v3 = (p) => (p && p.isVector3 ? p : new THREE.Vector3(p?.x || 0, p?.y || 0, p?.z || 0));

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ------------------------------------------------------------ billboards

// Camera-facing quads drawn in one call. Each instance has a position, a
// size in metres, a colour (rgb may exceed 1 so bloom picks glints up) with
// alpha, a rotation, and a seed the fragment shader uses for its shape.
const BILLBOARD_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec3 iMisc; // size (m), rotation, seed
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
void main() {
  vUv = position.xy + 0.5;
  vColor = iColor;
  vSeed = iMisc.z;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iMisc.y), s = sin(iMisc.y);
  mv.xy += mat2(c, s, -s, c) * position.xy * iMisc.x;
  gl_Position = projectionMatrix * mv;
}`;

// A glint: a tiny hot core, a soft halo and four thin rays, like sunlight
// catching a polished edge.
const GLINT_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  float core = exp(-r2 * 60.0);
  float halo = exp(-r2 * 7.0) * 0.28;
  float rays = exp(-abs(p.x) * 40.0) * exp(-abs(p.y) * 3.2) + exp(-abs(p.y) * 40.0) * exp(-abs(p.x) * 3.2);
  float a = (core * 1.6 + halo + rays * 0.55) * smoothstep(1.0, 0.75, sqrt(r2));
  gl_FragColor = vec4(vColor.rgb, a * vColor.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Dust: a soft, lumpy puff (seeded value noise) or, for tiny specks, a
// simple soft dot.
const DUST_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vSeed;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 91.7) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a;
  if (vSeed < 0.0) {
    a = smoothstep(1.0, 0.3, r);
  } else {
    float lumps = n(p * 2.6 + vSeed * 7.0) * 0.6 + n(p * 5.3 - vSeed * 3.0) * 0.4;
    a = smoothstep(1.0, 0.15, r + (lumps - 0.5) * 0.55);
    a *= 0.55 + 0.45 * lumps;
  }
  gl_FragColor = vec4(vColor.rgb, a * vColor.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Billboards {
  constructor(max, fragmentShader, blending) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.misc = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iColor', this.col);
    g.setAttribute('iMisc', this.misc);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        vertexShader: BILLBOARD_VERT,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.items = [];
  }

  add(item) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(item);
    return item;
  }

  // Each item: { p, v, size, grow, life, age, color (Color), alpha, rot, spin,
  // seed, drag, gravity, twinkle, fadeIn }
  update(dt, time) {
    const items = this.items;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const s = items[i];
      s.age += dt;
      if (s.age >= s.life) continue;
      if (s.v) {
        if (s.drag) s.v.multiplyScalar(Math.exp(-s.drag * dt));
        if (s.gravity) s.v.y -= s.gravity * dt;
        s.p.addScaledVector(s.v, dt);
        if (s.floor !== undefined && s.p.y < s.floor) {
          s.p.y = s.floor;
          s.v.set(0, 0, 0);
        }
      }
      s.rot += (s.spin || 0) * dt;
      const k = s.age / s.life;
      let a = s.alpha * (k > s.fadeAt ? 1 - (k - s.fadeAt) / (1 - s.fadeAt) : 1);
      if (s.fadeIn) a *= Math.min(1, s.age / s.fadeIn);
      if (s.twinkle) a *= 0.55 + 0.45 * Math.sin(time * s.twinkle + s.seed * 40);
      const size = s.size * (1 + (s.grow || 0) * easeOut(k)) * (s.pop ? Math.min(1, 0.3 + s.age / s.pop) : 1);
      this.pos.setXYZ(n, s.p.x, s.p.y, s.p.z);
      this.col.setXYZW(n, s.color.r, s.color.g, s.color.b, Math.max(0, a));
      this.misc.setXYZ(n, size, s.rot, s.seed);
      items[n++] = s;
    }
    items.length = n;
    this.mesh.geometry.instanceCount = n;
    if (n) {
      this.pos.needsUpdate = true;
      this.col.needsUpdate = true;
      this.misc.needsUpdate = true;
    }
  }

  clear() {
    this.items.length = 0;
    this.mesh.geometry.instanceCount = 0;
  }
}

// ------------------------------------------------------------ streaks

// The finger flick's trace: a soft tapered streak that follows the flick
// direction (drawn along the projected direction, so it reads from any
// angle) and a faint ripple ring where the finger met the block.
const STREAK_VERT = /* glsl */ `
attribute vec3 iStart;
attribute vec4 iDir;   // direction xyz, length (m)
attribute vec4 iMisc;  // width (m), alpha, kind (0 streak, 1 ring), progress 0..1
varying vec2 vUv;
varying vec4 vMisc;
void main() {
  vUv = position.xy + 0.5;
  vMisc = iMisc;
  vec4 a = modelViewMatrix * vec4(iStart, 1.0);
  if (iMisc.z > 0.5) {
    a.xy += position.xy * iDir.w;
    gl_Position = projectionMatrix * a;
    return;
  }
  vec4 b = modelViewMatrix * vec4(iStart + iDir.xyz * iDir.w, 1.0);
  vec2 axis = b.xy - a.xy;
  float l = length(axis);
  axis = l > 1e-5 ? axis / l : vec2(1.0, 0.0);
  vec2 side = vec2(-axis.y, axis.x);
  vec4 p = mix(a, b, vUv.x);
  p.xy += side * position.y * iMisc.x;
  gl_Position = projectionMatrix * p;
}`;

const STREAK_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vMisc;
void main() {
  float a;
  if (vMisc.z > 0.5) {
    float r = length(vUv * 2.0 - 1.0);
    float ring = exp(-pow((r - 0.72) / 0.16, 2.0));
    a = ring * smoothstep(1.0, 0.9, r);
  } else {
    float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
    a = pow(vUv.x, 1.8) * across * across * smoothstep(1.0, 0.85, vUv.x);
  }
  a *= vMisc.y;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Streaks {
  constructor(max = 16) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.start = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.dir = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.misc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iStart', this.start);
    g.setAttribute('iDir', this.dir);
    g.setAttribute('iMisc', this.misc);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({ vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.items = [];
  }

  add(item) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(item);
  }

  update(dt) {
    let n = 0;
    for (const s of this.items) {
      s.age += dt;
      if (s.age >= s.life) continue;
      const k = s.age / s.life;
      const fade = (1 - k) ** 2 * Math.min(1, s.age / 0.03);
      if (s.kind === 1) {
        this.start.setXYZ(n, s.p.x, s.p.y, s.p.z);
        this.dir.setXYZW(n, 0, 0, 0, s.size * (0.35 + 0.65 * easeOut(k)));
        this.misc.setXYZW(n, 0, s.alpha * fade, 1, k);
      } else {
        // the streak travels with the flick and stretches out behind it
        const head = s.travel * easeOut(k);
        const len = s.length * (0.4 + 0.6 * easeOut(Math.min(1, k * 2)));
        tmpV.copy(s.p).addScaledVector(s.d, head - len);
        this.start.setXYZ(n, tmpV.x, tmpV.y, tmpV.z);
        this.dir.setXYZW(n, s.d.x, s.d.y, s.d.z, len);
        this.misc.setXYZW(n, s.width, s.alpha * fade, 0, k);
      }
      this.items[n++] = s;
    }
    this.items.length = n;
    this.mesh.geometry.instanceCount = n;
    if (n) {
      this.start.needsUpdate = true;
      this.dir.needsUpdate = true;
      this.misc.needsUpdate = true;
    }
  }

  clear() {
    this.items.length = 0;
    this.mesh.geometry.instanceCount = 0;
  }
}

// ------------------------------------------------------------ confetti

const PAPER = ['#f26d7d', '#ffb347', '#ffe066', '#7bd389', '#5bc0eb', '#9b8cf2', '#f7a1c4', '#fdf7ea', '#4ecdc4'];
const FOIL = ['#e8c15a', '#d9dde2', '#e59ab0'];

// Real confetti is slightly curled from the punch, so each piece is a
// gently bent strip rather than a flat card.
function confettiGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 4, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, x * x * 0.35);
  }
  g.computeVertexNormals();
  return g;
}

class Confetti {
  constructor(max, supportAt) {
    this.max = max;
    this.supportAt = supportAt;
    const geo = confettiGeometry();
    const make = (mat, n) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = false;
      m.receiveShadow = true;
      return m;
    };
    this.paper = make(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.62, metalness: 0 }), max);
    this.foil = make(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.28, metalness: 0.9 }), Math.ceil(max * 0.25));
    this.meshes = [this.paper, this.foil];
    this.items = [];
  }

  burst(center, n, gentle) {
    for (let k = 0; k < n; k++) {
      const foil = Math.random() < 0.16;
      const list = foil ? FOIL : PAPER;
      const a = rand(0, Math.PI * 2);
      const out = rand(0.15, 0.7) * (gentle ? 0.6 : 1);
      const up = rand(1.2, 2.0) * (gentle ? 0.7 : 1);
      const round = Math.random() < 0.3;
      const w = round ? rand(0.005, 0.0065) : rand(0.004, 0.0055);
      this.items.push({
        foil,
        p: new THREE.Vector3(center.x + rand(-0.01, 0.01), center.y + rand(-0.01, 0.01), center.z + rand(-0.01, 0.01)),
        v: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out),
        w,
        h: round ? w : rand(0.009, 0.013),
        axis: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
        angle: rand(0, 6.28),
        spin: rand(8, 22) * (gentle ? 0.5 : 1),
        q: new THREE.Quaternion().setFromEuler(tmpE.set(rand(0, 6), rand(0, 6), rand(0, 6))),
        sway: new THREE.Vector3(Math.cos(a + 1.6), 0, Math.sin(a + 1.6)),
        phase: rand(0, 6.28),
        freq: rand(4, 7),
        color: new THREE.Color(list[Math.floor(Math.random() * list.length)]).multiplyScalar(rand(0.85, 1.05)),
        rest: false,
        age: 0,
        life: rand(9, 12),
      });
    }
    // keep within the instance budget: drop the oldest first
    while (this.items.length > this.max) this.items.shift();
  }

  update(dt) {
    if (!this.items.length) return;
    let np = 0;
    let nf = 0;
    let n = 0;
    for (const c of this.items) {
      c.age += dt;
      if (c.age >= c.life) continue;
      if (c.rest && this.supportAt) {
        // now and then, see that what it lies on is still there
        c.recheck -= dt;
        if (c.recheck <= 0) {
          c.recheck = rand(0.2, 0.35);
          if (this.supportAt(c.p.x, c.p.z) + 0.0006 < c.p.y - 0.002) {
            c.rest = false;
            c.v.set(0, 0, 0);
          }
        }
      }
      if (!c.rest) {
        // paper: light, so strong drag; it falls at about a third of a
        // metre a second and sways side to side as it tips back and forth
        c.v.y -= 9.81 * dt;
        c.v.y *= Math.exp(-dt * (c.v.y < 0 ? 28 : 2.5));
        const h = Math.exp(-dt * 3.2);
        c.v.x *= h;
        c.v.z *= h;
        c.p.addScaledVector(c.v, dt);
        const falling = c.v.y < 0 ? 1 : 0.2;
        c.p.addScaledVector(c.sway, Math.sin(c.age * c.freq + c.phase) * 0.12 * falling * dt);
        c.angle = c.spin * dt;
        c.q.premultiply(tmpQ.setFromAxisAngle(c.axis, c.angle));
        const floor = (this.supportAt ? this.supportAt(c.p.x, c.p.z) : 0) + 0.0006;
        if (c.p.y <= floor && c.v.y <= 0) {
          c.p.y = floor;
          c.rest = true;
          c.recheck = rand(0.2, 0.35);
          // settles flat, curl up or down, in whatever direction it landed
          c.q.setFromEuler(tmpE.set(-Math.PI / 2 + rand(-0.15, 0.15) + (Math.random() < 0.5 ? Math.PI : 0), 0, rand(0, 6.28), 'YXZ'));
        }
      }
      const s = c.age > c.life - 1 ? (c.life - c.age) : 1;
      tmpS.set(c.w * s, c.h * s, Math.max(c.w, c.h) * s);
      tmpM.compose(c.p, c.q, tmpS);
      const mesh = c.foil ? this.foil : this.paper;
      const i = c.foil ? nf++ : np++;
      if (c.foil && i >= this.foil.instanceMatrix.count) continue;
      mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, c.color);
      this.items[n++] = c;
    }
    this.items.length = n;
    this.paper.count = np;
    this.foil.count = Math.min(nf, this.foil.instanceMatrix.count);
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    this.items.length = 0;
    for (const m of this.meshes) m.count = 0;
  }
}

// ------------------------------------------------------------ points labels

// "+10" as a small sprite: rounded bold system font (no downloaded fonts),
// warm white with a soft amber edge so it reads on pale wood and dark rugs.
const labelCache = new Map();
function labelTexture(text) {
  if (labelCache.has(text)) return labelCache.get(text);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.font = '800 84px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  x.shadowColor = 'rgba(60, 30, 0, 0.45)';
  x.shadowBlur = 10;
  x.lineWidth = 12;
  x.strokeStyle = 'rgba(176, 102, 18, 0.9)';
  x.strokeText(text, 128, 68);
  x.shadowBlur = 0;
  const g = x.createLinearGradient(0, 30, 0, 100);
  g.addColorStop(0, '#fffdf2');
  g.addColorStop(1, '#ffd872');
  x.fillStyle = g;
  x.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (labelCache.size > 40) labelCache.clear();
  labelCache.set(text, t);
  return t;
}

// ------------------------------------------------------------ sweep floor

// The shimmering band of light that crosses the floor during the tidy-away.
const SWEEP_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SWEEP_FRAG = /* glsl */ `
uniform float uFront;
uniform float uWidth;
uniform float uAlpha;
uniform float uTime;
uniform float uRadius;
uniform vec2 uDir;
varying vec2 vP;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float s = dot(vP, uDir);
  float band = exp(-pow((s - uFront) / uWidth, 2.0));
  float trail = exp(-max(0.0, uFront - s) / (uWidth * 3.0)) * step(s, uFront) * 0.35;
  // tiny twinkling specks inside the band, like light on dust
  vec2 g = vP * 260.0;
  vec2 cell = floor(g);
  float dotShape = smoothstep(0.5, 0.1, length(fract(g) - 0.5));
  float sp = step(0.985, h(cell)) * dotShape * (0.5 + 0.5 * sin(uTime * 18.0 + h(cell + 3.1) * 40.0));
  float edge = smoothstep(uRadius, uRadius * 0.55, length(vP));
  // a soft warm sheen, not a beam: most of the sparkle is in the specks
  float a = (band * (0.16 + sp * 1.4) + trail * (0.05 + sp * 0.5)) * edge * uAlpha;
  gl_FragColor = vec4(vec3(1.0, 0.78, 0.42) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------ FX

export class FX {
  constructor({ scene, camera, quality = {}, supportAt = null }) {
    this.scene = scene;
    this.camera = camera;
    // `particles` is a count budget; tolerate a 0..1 multiplier as well
    const p = quality.particles;
    this.budget = typeof p === 'number' ? (p > 4 ? p : Math.round(500 * p)) : quality.tier === 'low' ? 220 : quality.tier === 'medium' ? 380 : 520;
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.glints = new Billboards(clamp(Math.round(this.budget), 120, 800), GLINT_FRAG, THREE.AdditiveBlending);
    this.puffs = new Billboards(clamp(Math.round(this.budget * 0.3), 40, 240), DUST_FRAG, THREE.NormalBlending);
    this.puffs.mesh.renderOrder = 7;
    this.streaks = new Streaks(16);
    this.papers = new Confetti(clamp(Math.round(this.budget * 0.45), 60, 320), supportAt);
    this.group.add(this.glints.mesh, this.puffs.mesh, this.streaks.mesh, ...this.papers.meshes);
    this.labels = [];
    this.labelMat = [];
    this.sweeps = [];
    this.time = 0;
  }

  get reduced() {
    return REDUCED_MOTION.matches;
  }

  // Particle counts scale with the quality budget and reduced motion.
  count(n) {
    const k = clamp(this.budget / 500, 0.35, 1.2) * (this.reduced ? 0.4 : 1);
    return Math.max(1, Math.round(n * k));
  }

  glint(pos, { color = GOLD, intensity = 2.1, size = 0.009, life = 0.7, v = null, drag = 2, gravity = 0, twinkle = 24, alpha = 1, pop = 0.06 } = {}) {
    tmpC.copy(color).multiplyScalar(intensity);
    return this.glints.add({
      p: pos.clone(),
      v,
      drag,
      gravity,
      size,
      life,
      age: 0,
      color: tmpC.clone(),
      alpha,
      rot: rand(0, Math.PI / 2),
      spin: rand(-1.5, 1.5),
      seed: Math.random(),
      twinkle: this.reduced ? 0 : twinkle * rand(0.7, 1.3),
      fadeAt: 0.35,
      pop,
    });
  }

  // Soft golden glints that pop around a point: a block dropped in, a
  // challenge slot filled.
  sparkle(pos, colour, count = 8) {
    pos = v3(pos);
    const color = colour === undefined || colour === null ? GOLD : colour instanceof THREE.Color ? colour : new THREE.Color(colour);
    const n = this.count(count);
    for (let i = 0; i < n; i++) {
      const dir = tmpV.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize();
      const at = pos.clone().addScaledVector(dir, rand(0.004, 0.028));
      const v = dir.clone().multiplyScalar(rand(0.03, 0.12) * (this.reduced ? 0.5 : 1));
      v.y += 0.03;
      this.glint(at, { color, size: rand(0.006, 0.014), life: rand(0.45, 0.95), v, drag: 2.5 });
    }
  }

  // A faint puff of wood dust where a block slams down hard, with a few
  // specks that catch the light and settle. Deliberately subtle.
  dust(pos, strength = 0.5) {
    pos = v3(pos);
    const k = clamp(strength, 0, 1);
    if (k < 0.05) return;
    const puffs = this.reduced ? 1 : 1 + Math.round(k * 2);
    const floorY = Math.max(0, pos.y - 0.02);
    for (let i = 0; i < puffs; i++) {
      const a = rand(0, Math.PI * 2);
      const out = rand(0.02, 0.07) * (0.5 + k);
      this.puffs.add({
        p: new THREE.Vector3(pos.x + Math.cos(a) * 0.006, pos.y + rand(-0.003, 0.004), pos.z + Math.sin(a) * 0.006),
        v: new THREE.Vector3(Math.cos(a) * out, rand(0.015, 0.04), Math.sin(a) * out),
        drag: 3,
        gravity: -0.004,
        size: rand(0.018, 0.03) * (0.7 + 0.6 * k),
        grow: rand(1.4, 2.2),
        life: rand(0.9, 1.5),
        age: 0,
        color: new THREE.Color(0.86, 0.8, 0.7),
        alpha: rand(0.1, 0.17) * (0.5 + 0.5 * k),
        rot: rand(0, 6.28),
        spin: rand(-0.6, 0.6),
        seed: Math.random() * 10,
        fadeAt: 0.15,
        fadeIn: 0.06,
      });
    }
    const specks = this.count(4 + k * 8);
    for (let i = 0; i < specks; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.05, 0.25) * (0.4 + k);
      this.puffs.add({
        p: pos.clone(),
        v: new THREE.Vector3(Math.cos(a) * sp, rand(0.1, 0.35) * (0.4 + k), Math.sin(a) * sp),
        drag: 1.5,
        gravity: 1.2,
        floor: floorY,
        size: rand(0.0007, 0.0014),
        life: rand(0.8, 1.4),
        age: 0,
        color: new THREE.Color(0.95, 0.88, 0.74),
        alpha: 0.75,
        rot: 0,
        seed: -1,
        fadeAt: 0.6,
      });
    }
  }

  // "+N" for big kids, rising and fading with a few glints around it.
  points(pos, value) {
    pos = v3(pos);
    const text = typeof value === 'number' ? `+${value}` : String(value);
    let mat = this.labelMat.pop();
    if (!mat) mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    mat.map = labelTexture(text);
    mat.opacity = 0;
    mat.needsUpdate = true;
    const s = new THREE.Sprite(mat);
    s.renderOrder = 20;
    s.center.set(0.5, 0.3);
    s.position.copy(pos);
    this.group.add(s);
    if (this.labels.length > 24) this.dropLabel(this.labels[0]);
    this.labels.push({ sprite: s, from: pos.clone(), age: 0, life: this.reduced ? 1.1 : 1.3, drift: rand(-0.012, 0.012) });
    const n = this.count(5);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-0.06, 0.06), rand(0.04, 0.12), rand(-0.06, 0.06));
      this.glint(pos.clone().add(tmpV.set(rand(-0.01, 0.01), rand(0, 0.02), rand(-0.01, 0.01))), { v, size: rand(0.006, 0.011), life: rand(0.5, 0.9) });
    }
  }

  dropLabel(l) {
    this.group.remove(l.sprite);
    this.labelMat.push(l.sprite.material);
    this.labels.splice(this.labels.indexOf(l), 1);
  }

  // Paper confetti thrown up from a point (challenge complete, new best).
  confetti(center) {
    center = v3(center);
    this.papers.burst(center, this.count(110), this.reduced);
    this.sparkle(center, GOLD, 10);
  }

  // The flick's soft trace: a streak along `dir` and a ripple at the touch.
  swish(pos, dir, strength = 0.6) {
    pos = v3(pos);
    const k = clamp(strength, 0.1, 1);
    const d = v3(dir).clone().normalize();
    this.streaks.add({ kind: 0, p: pos.clone().addScaledVector(d, -0.01), d, travel: 0.03 + 0.03 * k, length: 0.045 + 0.05 * k, width: 0.008 + 0.006 * k, alpha: 0.28 + 0.2 * k, age: 0, life: 0.22 });
    // a second, fainter streak a touch above, like an air trail
    this.streaks.add({ kind: 0, p: pos.clone().addScaledVector(d, -0.02).add(tmpV.set(0, 0.008, 0)), d, travel: 0.025 + 0.025 * k, length: 0.03 + 0.04 * k, width: 0.005, alpha: 0.14 + 0.1 * k, age: 0, life: 0.2 });
    this.streaks.add({ kind: 1, p: pos.clone(), size: 0.022 + 0.02 * k, alpha: 0.2 * k + 0.06, age: 0, life: 0.3 });
    if (!this.reduced) this.sparkle(pos, GOLD, 3);
  }

  // ---------------------------------------------------------- sweep

  // The magic tidy-away. A band of warm light crosses the floor; one after
  // another, each block lifts, twirls and flies off in an arc towards the
  // top of the view with a trail of glints. FX moves the meshes; when a
  // block has left the view its mesh is hidden and onBlockGone(handle) is
  // called, then onDone() once all have gone.
  sweep(blocks, onBlockGone = () => {}, onDone = () => {}) {
    const reduced = this.reduced;
    const cam = this.camera;
    // work out the sweep's frame: across the view, left to right
    const right = new THREE.Vector3(1, 0, 0);
    const toward = new THREE.Vector3(0, 0, 1);
    if (cam) {
      cam.updateMatrixWorld();
      right.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
      toward.setFromMatrixColumn(cam.matrixWorld, 2).setY(0).normalize();
    }
    const centre = new THREE.Vector3();
    for (const b of blocks) centre.add(b.mesh.position);
    if (blocks.length) centre.divideScalar(blocks.length);
    centre.y = 0;
    let sMin = Infinity;
    let sMax = -Infinity;
    const list = blocks.map((b) => {
      const s = tmpV.copy(b.mesh.position).sub(centre).dot(right);
      sMin = Math.min(sMin, s);
      sMax = Math.max(sMax, s);
      return { ...b, s, y: b.mesh.position.y };
    });
    // left to right; within a stack, top block first (like unstacking)
    list.sort((a, b) => (Math.abs(a.s - b.s) > 0.02 ? a.s - b.s : b.y - a.y));
    const n = list.length;
    const spread = n ? Math.min(reduced ? 2.2 : 1.7, (reduced ? 0.12 : 0.085) * n) : 0.5;
    const flight = reduced ? 1.25 : 0.95;
    // one shared destination, up above the view on the right, as if the
    // blocks were being gathered into a toy box just out of sight
    const top = Math.max(0.9, ...list.map((b) => b.y)) + 1.1;
    const dest = centre.clone().addScaledVector(right, reduced ? 0.25 : 0.7).addScaledVector(toward, -0.25).setY(top);
    const items = list.map((b, i) => {
      const t0 = n > 1 ? (i / (n - 1)) * spread : 0;
      const turns = reduced ? 0.25 : rand(1.2, 2.2) * (Math.random() < 0.5 ? -1 : 1);
      const tumble = reduced ? 0 : rand(0.4, 1.0) * Math.PI * (Math.random() < 0.5 ? -1 : 1);
      const lift = reduced ? 0.02 : rand(0.03, 0.05);
      const p0 = b.mesh.position.clone();
      const p1 = p0.clone().add(tmpV.set(0, lift, 0));
      const end = dest.clone().add(tmpV.set(rand(-0.15, 0.15), rand(-0.1, 0.2), rand(-0.12, 0.12)));
      const ctrl = p1.clone().lerp(end, 0.25).add(tmpV.set(0, 0.25 + rand(0, 0.15), 0)).addScaledVector(right, -0.05);
      const tumbleAxis = new THREE.Vector3().subVectors(end, p1).setY(0).normalize().cross(UP);
      if (tumbleAxis.lengthSq() < 1e-6) tumbleAxis.set(1, 0, 0);
      return { ...b, t0, turns, tumble, tumbleAxis, p0, p1, end, ctrl, q0: b.mesh.quaternion.clone(), done: false, lastTrail: 0 };
    });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: SWEEP_VERT,
        fragmentShader: SWEEP_FRAG,
        uniforms: {
          uFront: { value: 0 },
          uWidth: { value: 0.04 },
          uAlpha: { value: 0 },
          uTime: { value: 0 },
          uRadius: { value: 0.5 },
          uDir: { value: new THREE.Vector2(1, 0) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    const radius = Math.max(0.35, (sMax - sMin) / 2 + 0.25);
    floor.scale.setScalar(radius * 2);
    floor.rotation.x = -Math.PI / 2;
    floor.position.copy(centre).setY(0.0008);
    floor.renderOrder = 6;
    floor.frustumCulled = false;
    // the plane's local x/y map to world x/-z; express the sweep direction there
    floor.material.uniforms.uDir.value.set(right.x, -right.z);
    floor.material.uniforms.uRadius.value = 0.5;
    this.group.add(floor);
    const waveTime = Math.max(0.6, spread + 0.3);
    this.sweeps.push({ items, floor, age: 0, waveTime, flight, sMin: -0.5, sMax: 0.5, radius, centre, right, onBlockGone, onDone, finished: false, total: spread + flight + 0.15 });
  }

  updateSweep(sw, dt) {
    sw.age += dt;
    const u = sw.floor.material.uniforms;
    const w = clamp(sw.age / sw.waveTime, 0, 1);
    u.uFront.value = -0.55 + 1.1 * easeInOut(w);
    u.uAlpha.value = Math.min(1, sw.age / 0.2) * (1 - clamp((sw.age - sw.waveTime) / 0.5, 0, 1)) * (this.reduced ? 0.6 : 1);
    u.uTime.value = this.time;
    // glints rising from the band as it passes
    if (w < 1) {
      const n = this.reduced ? (Math.random() < 0.3 ? 1 : 0) : Math.random() < 0.8 ? 2 : 1;
      const frontWorld = u.uFront.value * sw.radius * 2;
      const perp = tmpV2.set(-sw.right.z, 0, sw.right.x);
      for (let i = 0; i < n; i++) {
        const side = rand(-0.8, 0.8) * sw.radius;
        const at = sw.centre.clone().addScaledVector(sw.right, frontWorld + rand(-0.02, 0.02)).addScaledVector(perp, side).setY(rand(0.002, 0.012));
        if (at.distanceTo(sw.centre) > sw.radius * 0.9) continue;
        this.glint(at, { v: new THREE.Vector3(0, rand(0.04, 0.12), 0), size: rand(0.005, 0.01), life: rand(0.5, 0.9), drag: 1 });
      }
    }
    let remaining = 0;
    for (const it of sw.items) {
      if (it.done) continue;
      remaining++;
      const t = sw.age - it.t0;
      if (t < 0) continue;
      const m = it.mesh;
      const liftT = 0.26;
      if (t < liftT) {
        // rise gently, starting to turn
        const k = easeOut(t / liftT);
        m.position.lerpVectors(it.p0, it.p1, k);
        tmpQ.setFromAxisAngle(UP, it.turns * 0.08 * Math.PI * 2 * k);
        m.quaternion.copy(it.q0).premultiply(tmpQ);
        if (!it.popped) {
          it.popped = true;
          this.sparkle(it.p0.clone().setY(Math.max(0.005, it.p0.y - 0.015)), GOLD, 4);
        }
      } else {
        const k = clamp((t - liftT) / (sw.flight - liftT), 0, 1);
        const e = k ** 1.7; // accelerates away, like being drawn off
        const a = 1 - e;
        m.position.set(
          a * a * it.p1.x + 2 * a * e * it.ctrl.x + e * e * it.end.x,
          a * a * it.p1.y + 2 * a * e * it.ctrl.y + e * e * it.end.y,
          a * a * it.p1.z + 2 * a * e * it.ctrl.z + e * e * it.end.z,
        );
        const spinK = 0.08 + 0.92 * easeInOut(k);
        tmpQ.setFromAxisAngle(UP, it.turns * spinK * Math.PI * 2);
        m.quaternion.copy(it.q0).premultiply(tmpQ);
        tmpQ.setFromAxisAngle(it.tumbleAxis, it.tumble * easeInOut(k));
        m.quaternion.premultiply(tmpQ);
        // sparkle trail
        it.lastTrail += dt;
        const every = (this.reduced ? 0.09 : 0.022) * clamp(500 / this.budget, 1, 3);
        while (it.lastTrail > every) {
          it.lastTrail -= every;
          const at = m.position.clone().add(tmpV.set(rand(-0.015, 0.015), rand(-0.015, 0.015), rand(-0.015, 0.015)));
          this.glint(at, { v: new THREE.Vector3(rand(-0.03, 0.03), rand(-0.05, 0.02), rand(-0.03, 0.03)), size: rand(0.005, 0.011), life: rand(0.35, 0.7), drag: 3 });
        }
        if (k >= 1) {
          it.done = true;
          m.visible = false;
          remaining--;
          try {
            sw.onBlockGone(it.handle);
          } catch (err) {
            console.error(err);
          }
        }
      }
    }
    if (!remaining && sw.age >= sw.waveTime && !sw.finished) {
      sw.finished = true;
      try {
        sw.onDone();
      } catch (err) {
        console.error(err);
      }
    }
    if (sw.finished && sw.age > sw.waveTime + 0.5) {
      this.group.remove(sw.floor);
      sw.floor.geometry.dispose();
      sw.floor.material.dispose();
      return false;
    }
    return true;
  }

  get sweeping() {
    return this.sweeps.some((s) => !s.finished);
  }

  update(dt, time = this.time + dt) {
    this.time = time;
    this.sweeps = this.sweeps.filter((sw) => this.updateSweep(sw, dt));
    this.glints.update(dt, time);
    this.puffs.update(dt, time);
    this.streaks.update(dt);
    this.papers.update(dt);
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.age += dt;
      const k = l.age / l.life;
      if (k >= 1) {
        this.dropLabel(l);
        continue;
      }
      const s = l.sprite;
      s.position.copy(l.from).add(tmpV.set(l.drift * k, 0.075 * easeOut(k), 0));
      const pop = this.reduced ? 1 : 0.7 + 0.3 * easeOut(Math.min(1, l.age / 0.18)) + 0.06 * Math.sin(Math.min(1, l.age / 0.3) * Math.PI);
      const h = 0.028 * pop;
      s.scale.set(h * 2, h, 1);
      s.material.opacity = Math.min(1, l.age / 0.1) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
    }
  }

  clear() {
    this.glints.clear();
    this.puffs.clear();
    this.streaks.clear();
    this.papers.clear();
    while (this.labels.length) this.dropLabel(this.labels[0]);
    this.clearSweep();
  }

  // Abandon any sweep in progress without calling its callbacks: the
  // caller is clearing its blocks itself.
  clearSweep() {
    for (const sw of this.sweeps) {
      this.group.remove(sw.floor);
      sw.floor.geometry.dispose();
      sw.floor.material.dispose();
    }
    this.sweeps.length = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.group);
    for (const b of [this.glints, this.puffs, this.streaks]) {
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    }
    for (const m of this.papers.meshes) m.material.dispose();
    this.papers.meshes[0].geometry.dispose();
    for (const m of this.labelMat) m.dispose();
  }
}
