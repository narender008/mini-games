// Camera-facing soft sprites drawn in one call per batch: dust, glints,
// motes and cloud puffs. Blending is premultiplied, so one batch mixes light
// (added, like a glint) and matter (laid over, like dust) per sprite. Cloud
// and dust frames carry a normal in their colour channels, so they can be lit
// from the sun's side and look round rather than flat.
import * as THREE from 'three';
import { fbm } from '../shared.js';

export const FRAME = { soft: 0, star: 1, cloud: 2, dust: 6, spark: 7, mote: 8, ring: 9 };
const CELL = 64;
const COLS = 4;

let atlas = null;

// Paints the 4x4 atlas once: white shapes in alpha; lit frames store a
// normal (x, y, z mapped to 0..1) in rgb.
function paintAtlas() {
  const size = CELL * COLS;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const put = (frame, fn) => {
    const ox = (frame % COLS) * CELL;
    const oy = Math.floor(frame / COLS) * CELL;
    const hs = new Float32Array(CELL * CELL);
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const u = (x + 0.5) / CELL * 2 - 1;
        const v = (y + 0.5) / CELL * 2 - 1;
        hs[y * CELL + x] = fn(u, -v);
      }
    }
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const a = hs[y * CELL + x];
        const l = hs[y * CELL + Math.max(0, x - 1)];
        const r = hs[y * CELL + Math.min(CELL - 1, x + 1)];
        const t = hs[Math.max(0, y - 1) * CELL + x];
        const b = hs[Math.min(CELL - 1, y + 1) * CELL + x];
        const nx = (l - r) * 5;
        const ny = (b - t) * 5; // canvas rows run down, so this points up
        const nz = 1;
        const len = Math.hypot(nx, ny, nz);
        const i = ((oy + y) * size + ox + x) * 4;
        d[i] = ((nx / len) * 0.5 + 0.5) * 255;
        d[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        d[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
        d[i + 3] = Math.max(0, Math.min(1, a)) * 255;
      }
    }
  };
  const bell = (r, w) => Math.exp(-(r * r) / (w * w));
  // soft round glow
  put(FRAME.soft, (u, v) => bell(Math.hypot(u, v), 0.42));
  // a four-point glint with a soft core
  put(FRAME.star, (u, v) => {
    const r = Math.hypot(u, v);
    const rays = Math.exp(-Math.abs(u) * 26) * bell(v, 0.9) + Math.exp(-Math.abs(v) * 26) * bell(u, 0.9);
    const diag = (Math.exp(-Math.abs(u - v) * 40) + Math.exp(-Math.abs(u + v) * 40)) * bell(r, 0.35) * 0.35;
    return Math.min(1, bell(r, 0.16) + rays * 0.8 + diag + bell(r, 0.5) * 0.12);
  });
  // cloud puffs: lumpy billows, denser in the middle
  for (let k = 0; k < 4; k++) {
    put(FRAME.cloud + k, (u, v) => {
      const r = Math.hypot(u, v * 1.1);
      const n = fbm(u * 2.2 + k * 7.1, v * 2.2 + k * 3.7, 4);
      const edge = 0.72 + (n - 0.5) * 0.55;
      const body = 1 - smoothstep(edge - 0.32, edge, r);
      const billow = 0.75 + 0.45 * fbm(u * 5 + k * 11, v * 5 - k * 5, 3);
      return Math.min(1, body * billow);
    });
  }
  // a dusty puff: thinner, wispier
  put(FRAME.dust, (u, v) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 3 + 17, v * 3 + 5, 4);
    return Math.max(0, bell(r, 0.55) * (0.35 + n * 1.1) - 0.08);
  });
  // a thin six-ray sparkle
  put(FRAME.spark, (u, v) => {
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    const ray = Math.pow(Math.abs(Math.cos(a * 3)), 60) * Math.exp(-r * 3.2);
    return Math.min(1, bell(r, 0.12) + ray * 0.9);
  });
  // a tiny mote: bright pin with a halo
  put(FRAME.mote, (u, v) => {
    const r = Math.hypot(u, v);
    return Math.min(1, bell(r, 0.14) + bell(r, 0.5) * 0.18);
  });
  // a thin ring
  put(FRAME.ring, (u, v) => {
    const r = Math.hypot(u, v);
    return bell(r - 0.72, 0.09) * (1 - smoothstep(0.9, 1, r));
  });
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function smoothstep(a, b, x) {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

export function spriteAtlas() {
  if (!atlas) atlas = paintAtlas();
  return atlas;
}

const VERT = /* glsl */ `
attribute vec4 iPos;   // xyz, rotation
attribute vec4 iSize;  // width, height, frame, additive (0 matter .. 1 light)
attribute vec4 iColor; // rgb (may exceed 1 for bloom), alpha
attribute float iLit;  // 0: flat colour; above 0 lit by the sun, its shape's normal weighted by this
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
varying float vLit;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  float c = cos(iPos.w);
  float s = sin(iPos.w);
  vec2 q = position.xy * iSize.xy;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = projectionMatrix * mv;
  float f = iSize.z;
  vec2 cell = vec2(mod(f, 4.0), 3.0 - floor(f / 4.0));
  vUv = (cell + uv) / 4.0;
  vColor = iColor;
  vAdd = iSize.w;
  vLit = iLit;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLightView; // towards the sun, in view space
uniform vec3 uSunCol;
uniform vec3 uAmbient;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
varying float vLit;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vColor.a;
  if (a < 0.002) discard;
  vec3 col = vColor.rgb;
  if (vLit > 0.0) {
    // vLit sets how strongly the puff's own shape shades it
    vec3 n = normalize(mix(vec3(0.0, 0.0, 1.0), t.rgb * 2.0 - 1.0, vLit));
    float wrap = clamp(dot(n, uLightView) * 0.5 + 0.5, 0.0, 1.0);
    // thin fringes glow when the sun is behind; light bounced about inside
    // keeps even the shaded side of a cloud fairly bright
    float through = pow(clamp(-uLightView.z, 0.0, 1.0), 2.0) * (1.0 - t.a) * 0.6;
    vec3 lit = uAmbient * 1.2 + uSunCol * (wrap * wrap * 0.25 + 0.06 + through * 0.2);
    col *= lit;
  }
  gl_FragColor = vec4(col * a, a * (1.0 - vAdd));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// A pool of sprites with simple motion. add() takes a plain object:
// { x, y, z, vx, vy, vz, size, grow, rot, spin, life, frame, r, g, b, a,
//   add (0..1), lit (0..1), drag, gravity, fadeIn, twinkle, w, h }
// Sprites are recycled objects, so adding one allocates nothing once warm.
export class SpriteBatch {
  constructor(scene, { capacity = 256, renderOrder = 9, depthTest = true } = {}) {
    this.scene = scene;
    this.capacity = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.pos = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity * 4);
    this.col = new Float32Array(capacity * 4);
    this.lit = new Float32Array(capacity);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.size, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aLit = new THREE.InstancedBufferAttribute(this.lit, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iSize', this.aSize);
    g.setAttribute('iColor', this.aCol);
    g.setAttribute('iLit', this.aLit);
    g.instanceCount = 0;
    this.geometry = g;
    this.uniforms = {
      uMap: { value: spriteAtlas() },
      uLightView: { value: new THREE.Vector3(0, 0, 1) },
      uSunCol: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.3, 0.3, 0.3) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    const lv = this.uniforms.uLightView.value;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.mesh.onBeforeRender = (renderer, s, camera) => {
      lv.copy(this.sunDir).transformDirection(camera.matrixWorldInverse);
    };
    scene.add(this.mesh);
    this.list = [];
    this.free = [];
  }

  // a recycled sprite object with every field reset
  spawn() {
    const p = this.free.pop() || {};
    p.x = p.y = p.z = 0;
    p.vx = p.vy = p.vz = 0;
    p.size = 0.01;
    p.w = 1;
    p.h = 1;
    p.grow = 0;
    p.rot = 0;
    p.spin = 0;
    p.life = 1;
    p.age = 0;
    p.frame = 0;
    p.r = p.g = p.b = 1;
    p.a = 1;
    p.add = 1;
    p.lit = 0;
    p.drag = 0;
    p.gravity = 0;
    p.fadeIn = 0;
    p.twinkle = 0;
    p.seed = Math.random() * 100;
    p.follow = null; // optional (p, dt) => {} run every frame
    if (this.list.length >= this.capacity) this.free.push(this.list.shift());
    this.list.push(p);
    return p;
  }

  clear() {
    for (const p of this.list) this.free.push(p);
    this.list.length = 0;
  }

  // light: { sunDir, sunColor, sky, ground } (from lightFor)
  update(dt, light) {
    if (light) {
      this.sunDir.copy(light.sunDir);
      this.uniforms.uSunCol.value.copy(light.sunColor);
      this.uniforms.uAmbient.value.copy(light.sky).multiplyScalar(0.55).add(tmpC.copy(light.ground).multiplyScalar(0.25));
    }
    const list = this.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.free.push(p);
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.follow) p.follow(p, dt);
      list[n++] = p;
    }
    list.length = n;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const k = p.age / p.life;
      let alpha = 1 - k * k;
      if (p.fadeIn) alpha *= Math.min(1, p.age / p.fadeIn);
      if (p.twinkle) alpha *= 0.6 + 0.4 * Math.sin(p.age * p.twinkle + p.seed);
      const s = p.size * (1 + p.grow * k);
      const j = i * 4;
      this.pos[j] = p.x;
      this.pos[j + 1] = p.y;
      this.pos[j + 2] = p.z;
      this.pos[j + 3] = p.rot;
      this.size[j] = s * p.w;
      this.size[j + 1] = s * p.h;
      this.size[j + 2] = p.frame;
      this.size[j + 3] = p.add;
      this.col[j] = p.r;
      this.col[j + 1] = p.g;
      this.col[j + 2] = p.b;
      this.col[j + 3] = p.a * alpha;
      this.lit[i] = p.lit;
    }
    this.geometry.instanceCount = n;
    if (n) {
      this.aPos.needsUpdate = true;
      this.aSize.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aLit.needsUpdate = true;
    }
  }
}

const tmpC = new THREE.Color();
