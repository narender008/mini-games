// Shared kit for the Ace Pilot sectors: the five backdrops of the campaign.
//
// A sector is a world module (same interface as src/worlds/*.js, see the
// header of src/worlds/common.js): `create(ctx)` returns
//   group, envScene, light, update(dt, t, view), layout(view), dispose()
// and optionally `flash` (0..1, read each frame) and `edges`.
//
// Additions over the kids' worlds:
//   edges(y)   -> { left, right } the inner x of solid side scenery at the
//                 play plane (z = 0) at height y, so turret pods can sit on
//                 it; null in sectors without side walls (belt, storm).
//   accent     a CSS colour for the HUD.
//   light.bloom, light.exposure as in the worlds, plus light.rim*.
//
// Everything scrolls downward for a forward-flight feel. Positions are pure
// functions of t (not accumulated dt), so a frame at a given time is always
// the same and nothing drifts; scroll offsets wrap at PERIOD world units and
// every procedural pattern repeats an exact divisor of it, so the wrap never
// shows. Ground layers all move at one world speed and perspective gives the
// parallax; far skies creep.
//
// The kit: `Plane` (a quad that covers the view at a depth, drawn by a
// fragment shader in world coordinates), `Motes` (GPU points: dust, embers,
// spores, wrapping round the view at their depth), `envDome` (the sky baked
// into the environment map that the gunmetal ships reflect), `rockGeometry`,
// `wrapY` and the GLSL helpers in `GLSL`.
import * as THREE from 'three';
import { visibleAt } from '../../worlds/common.js';

export { visibleAt };
export const PERIOD = 2048;

// Scroll offset of a layer moving at `speed` world units per second.
export const scrollAt = (t, speed) => (((t * speed) % PERIOD) + PERIOD) % PERIOD;

// Wrap a value into [-h, h).
export function wrapY(y, h) {
  const span = h * 2;
  return ((((y + h) % span) + span) % span) - h;
}

// GLSL helpers shared by every sector shader. Hashes avoid sin() so they
// stay stable for the large cell indices a long scroll reaches.
export const GLSL = /* glsl */ `
uniform sampler2D uNoise;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
vec4 nz(vec2 p) { return texture2D(uNoise, p); }
// soft fbm from the noise texture's smooth channel, 3 taps
float fbm(vec2 p) {
  return nz(p).r * 0.55 + nz(p * 2.03 + 0.37).r * 0.3 + nz(p * 4.01 + 0.71).b * 0.15;
}
// 0 in the middle of the screen, 1 at the sides: keeps the play lane calm
float sideMask(vec2 ndc, float a, float b) { return smoothstep(a, b, abs(ndc.x)); }
// a rounded-rectangle distance, for panels and plates
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
`;

const planeVertex = /* glsl */ `
varying vec3 vWorld;
varying vec2 vNdc;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 p = projectionMatrix * viewMatrix * wp;
  vNdc = p.xy / p.w;
  gl_Position = p;
}`;

const PLANE_HEAD = /* glsl */ `
uniform float uScroll;
uniform float uTime;
uniform vec2 uView;
uniform vec2 uPlay;
uniform vec2 uSize;
varying vec3 vWorld;
varying vec2 vNdc;
varying vec2 vUv;
`;

// A flat quad at depth z, sized in layout() to cover the view there (with a
// margin for camera sway). x0, x1 limit it to part of the width, in
// fractions of the view's half width at that depth (-1..1), or in world units
// at the play plane with `worldX`. The fragment shader gets:
//   vWorld (world position), vNdc (screen -1..1), vUv
//   uScroll (wrapped), uTime, uView (half w, h of the view at this depth),
//   uPlay (half w, h at the play plane), uSize (quad half size)
export class Plane {
  constructor({ z, fragment, uniforms = {}, noise, x0 = -1, x1 = 1, margin = 1.12, transparent = false, blending = THREE.NormalBlending, renderOrder = -6, speed = 0, depthWrite = !transparent, rotate = 0, defines = {} }) {
    this.z = z;
    this.x0 = x0;
    this.x1 = x1;
    this.margin = margin;
    this.speed = speed;
    this.uniforms = Object.assign(
      {
        uNoise: { value: noise },
        uScroll: { value: 0 },
        uTime: { value: 0 },
        uView: { value: new THREE.Vector2(1, 1) },
        uPlay: { value: new THREE.Vector2(1, 1) },
        uSize: { value: new THREE.Vector2(1, 1) },
      },
      uniforms,
    );
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: planeVertex,
      fragmentShader: GLSL + PLANE_HEAD + fragment,
      transparent,
      depthWrite,
      blending,
      defines,
    });
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.rotation.z = rotate;
  }

  layout(view) {
    const v = visibleAt(view.camera, view.dist, this.z);
    const hw = v.halfW * this.margin;
    const hh = v.halfH * this.margin;
    const l = this.x0 <= -1 ? -hw : this.x0 * v.halfW;
    const r = this.x1 >= 1 ? hw : this.x1 * v.halfW;
    this.mesh.position.set((l + r) / 2, 0, this.z);
    this.mesh.scale.set((r - l) / 2, hh, 1);
    this.uniforms.uView.value.set(v.halfW, v.halfH);
    this.uniforms.uPlay.value.set(view.halfW, view.halfH);
    this.uniforms.uSize.value.set((r - l) / 2, hh);
  }

  update(t) {
    this.uniforms.uTime.value = t;
    this.uniforms.uScroll.value = scrollAt(t, this.speed);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// Points that stream down the view at their own depth and wrap round, all on
// the GPU. Each mote: x, y (0..1 across its box), z, speed (world/s), size
// (css px), brightness, colour mix (0..1 between colA and colB), stretch
// (1 round, >1 a streak along y). `side` (0..1) pushes them out of the
// middle of the screen.
const moteVertex = /* glsl */ `
attribute vec4 aMote;   // x01, y01, z, speed
attribute vec4 aLook;   // size, brightness, colour mix, stretch
uniform float uTime;
uniform float uTanH;
uniform float uAspect;
uniform float uDist;
uniform float uPx;
uniform float uCalm;
uniform float uFlicker;
uniform float uSway;    // sideways wander (world units)
varying float vBright;
varying float vMix;
varying float vStretch;
void main() {
  float z = aMote.z;
  float hh = (uDist - z) * uTanH * 1.08;
  float hw = hh * uAspect * 1.04;
  float y01 = fract(aMote.y - uTime * aMote.w / (2.0 * hh));
  float y = (y01 * 2.0 - 1.0) * hh;
  float x = (aMote.x * 2.0 - 1.0) * hw + sin(uTime * 0.7 + aMote.y * 40.0) * uSway;
  vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  vec2 ndc = gl_Position.xy / gl_Position.w;
  float calm = mix(uCalm, 1.0, smoothstep(0.15, 0.7, abs(ndc.x)));
  float fl = 1.0 - uFlicker + uFlicker * (0.5 + 0.5 * sin(uTime * (3.0 + aMote.y * 9.0) + aMote.x * 60.0));
  vBright = aLook.y * calm * fl;
  vMix = aLook.z;
  vStretch = aLook.w;
  gl_PointSize = aLook.x * uPx * aLook.w;
}`;

const moteFragment = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
varying float vBright;
varying float vMix;
varying float vStretch;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.x *= vStretch;
  float r2 = dot(p, p);
  float a = exp(-r2 * 6.0) + exp(-r2 * 1.6) * 0.15;
  a *= smoothstep(1.0, 0.6, abs(p.x));
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(uColA, uColB, vMix) * vBright * a, 1.0);
}`;

export class Motes {
  // gen(rand, i) returns { x, y, z, speed, size, bright, mix, stretch }
  constructor({ count, rand, gen, colA = '#ffffff', colB = '#ffffff', calm = 0.35, flicker = 0, sway = 0, blending = THREE.AdditiveBlending, renderOrder = -2 }) {
    const mote = new Float32Array(count * 4);
    const look = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const m = gen(rand, i);
      mote.set([m.x, m.y, m.z, m.speed], i * 4);
      look.set([m.size, m.bright, m.mix ?? 0, m.stretch ?? 1], i * 4);
    }
    this.geometry = new THREE.BufferGeometry();
    // positions are made in the shader; a dummy attribute sets the count
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.geometry.setAttribute('aMote', new THREE.BufferAttribute(mote, 4));
    this.geometry.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
    this.uniforms = {
      uTime: { value: 0 },
      uTanH: { value: 0.36 },
      uAspect: { value: 1.6 },
      uDist: { value: 27 },
      uPx: { value: 1 },
      uCalm: { value: calm },
      uFlicker: { value: flicker },
      uSway: { value: sway },
      uColA: { value: new THREE.Color(colA) },
      uColB: { value: new THREE.Color(colB) },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: moteVertex, fragmentShader: moteFragment, transparent: true, depthWrite: false, blending });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
  }

  update(t, view, px) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uTanH.value = Math.tan(THREE.MathUtils.degToRad(view.camera.fov) / 2);
    u.uAspect.value = view.camera.aspect;
    u.uDist.value = view.dist;
    u.uPx.value = px;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// The environment the ships reflect: a dark sphere with up to four soft
// coloured lobes. The camera looks down -z at ships facing it, so lobes
// towards +z show most on their hulls; +y lights the tops of round shapes.
const envVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 0.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const envFragment = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uUp;
uniform vec3 uDown;
uniform vec4 uLobeDir[4];   // xyz, sharpness
uniform vec3 uLobeCol[4];
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 col = uBase + uUp * smoothstep(-0.2, 1.0, d.y) + uDown * smoothstep(0.2, -1.0, d.y);
  for (int i = 0; i < 4; i++) {
    float k = max(dot(d, normalize(uLobeDir[i].xyz)), 0.0);
    col += uLobeCol[i] * pow(k, uLobeDir[i].w);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function envDome({ base = '#05070c', up = '#1a2433', down = '#020305', lobes = [] }) {
  const dirs = [];
  const cols = [];
  for (let i = 0; i < 4; i++) {
    const l = lobes[i];
    dirs.push(l ? new THREE.Vector4(l.dir[0], l.dir[1], l.dir[2], l.sharp ?? 4) : new THREE.Vector4(0, 1, 0, 1));
    cols.push(l ? new THREE.Color(l.color).multiplyScalar(l.power ?? 1) : new THREE.Color(0, 0, 0));
  }
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(base) },
      uUp: { value: new THREE.Color(up) },
      uDown: { value: new THREE.Color(down) },
      uLobeDir: { value: dirs },
      uLobeCol: { value: cols },
    },
    vertexShader: envVertex,
    fragmentShader: envFragment,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const geometry = new THREE.SphereGeometry(100, 32, 16);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  return {
    scene,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// A lumpy, broken rock: an icosphere pushed in and out by broad bumps,
// rough fractal noise, a few flat sheared faces and round craters with
// raised rims, with darker crevices baked into vertex colours.
export function rockGeometry(rand, detail = 3) {
  const src = new THREE.IcosahedronGeometry(1, detail);
  const p = src.attributes.position;
  const map = new Map();
  const verts = [];
  const index = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = verts.length / 3;
      map.set(key, k);
      verts.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    index.push(k);
  }
  src.dispose();
  const dir = () => new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
  const bumps = Array.from({ length: 14 }, () => ({ d: dir(), amp: (rand() - 0.6) * 0.45, w: 2 + rand() * 7 }));
  const cuts = Array.from({ length: 4 }, () => ({ d: dir(), at: 0.66 + rand() * 0.22 }));
  const craters = Array.from({ length: 9 }, () => ({ d: dir(), r: 0.18 + Math.pow(rand(), 2) * 0.35 }));
  const vn = valueNoise3(rand);
  const n = verts.length / 3;
  const colors = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
    let r = 1;
    for (const b of bumps) r += b.amp * Math.exp(-(1 - v.dot(b.d)) * b.w);
    let cav = 0;
    for (const c of craters) {
      const a = Math.acos(Math.min(1, v.dot(c.d))) / c.r;
      if (a < 1.5) {
        const bowl = a < 1 ? (1 - a * a) : 0;
        const lip = Math.exp(-((a - 1) * (a - 1)) / 0.03);
        r += c.r * (lip * 0.12 - bowl * 0.28);
        cav += bowl;
      }
    }
    const rough = vn(v.x * 3.1, v.y * 3.1, v.z * 3.1) * 0.6 + vn(v.x * 7.3, v.y * 7.3, v.z * 7.3) * 0.3 + vn(v.x * 15, v.y * 15, v.z * 15) * 0.1;
    r += (rough - 0.5) * 0.22;
    v.multiplyScalar(r);
    for (const c of cuts) {
      const h = v.dot(c.d);
      if (h > c.at) v.addScaledVector(c.d, (c.at - h) * 0.9);
    }
    verts[i * 3] = v.x;
    verts[i * 3 + 1] = v.y;
    verts[i * 3 + 2] = v.z;
    const shade = THREE.MathUtils.clamp(0.62 + (r - 1) * 1.4 - cav * 0.18 + (rough - 0.5) * 0.5, 0.25, 1.05);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade * 0.98;
    colors[i * 3 + 2] = shade * 0.95;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Smooth 3D value noise, 0..1, on a 16-cell lattice that repeats.
function valueNoise3(rand) {
  const N = 16;
  const lat = new Float32Array(N * N * N).map(() => rand());
  const at = (x, y, z) => lat[((((z % N) + N) % N) * N + (((y % N) + N) % N)) * N + (((x % N) + N) % N)];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = s(x - x0);
    const fy = s(y - y0);
    const fz = s(z - z0);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(at(x0, y0, z0), at(x0 + 1, y0, z0), fx), l(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), fx), fy),
      l(l(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), fx), l(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), fx), fy),
      fz,
    );
  };
}

// Instanced props that stream down at their depth and wrap round. items:
// { fx (x as a fraction of the half width at its depth) or x (world),
//   y0 (0..1 along the loop), z, speed, scale (Vector3), rot (Euler), spin
//   (Vector3, rad/s), ps (scale on portrait screens, default 1) }. The loop is the view's height at that depth plus a
// margin, so a prop leaves the bottom before it reappears at the top.
export class Stream {
  constructor(mesh, items, { margin = 3 } = {}) {
    this.mesh = mesh;
    this.items = items;
    this.margin = margin;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s2 = new THREE.Vector3();
    mesh.frustumCulled = false;
    mesh.count = items.length;
  }

  layout(view) {
    this.portrait = view.halfH > view.halfW;
    for (const it of this.items) {
      const v = visibleAt(view.camera, view.dist, it.z);
      it.hh = v.halfH + this.margin * (it.size ?? 1);
      it.wx = it.fx !== undefined ? it.fx * v.halfW : it.x;
    }
  }

  update(t) {
    const { m4, q, e, p } = this;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const y = wrapY(it.hh * (it.y0 * 2 - 1) - t * it.speed, it.hh);
      p.set(it.wx, y, it.z);
      const s = it.spin;
      e.set(it.rot.x + (s ? s.x * t : 0), it.rot.y + (s ? s.y * t : 0), it.rot.z + (s ? s.z * t : 0));
      q.setFromEuler(e);
      const s2 = this.portrait && it.ps ? this.s2.copy(it.scale).multiplyScalar(it.ps) : it.scale;
      this.mesh.setMatrixAt(i, m4.compose(p, q, s2));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Seeded events on a fixed timeline: the slot holding time t and how far
// into it we are. Used for lightning and distant flashes so a frame at a
// given time is always the same.
export function slot(t, every, seed = 0) {
  const i = Math.floor(t / every);
  const r = mulberrySlot(i * 7919 + seed * 104729);
  return { i, age: t - i * every - r() * every * 0.6, r };
}

function mulberrySlot(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Patch a MeshStandardMaterial for the sectors: haze towards `haze` with
// view distance (near..far, world units from the camera), and a coloured
// fresnel rim (light wrapping round silhouettes from behind). With `grit`
// (a noise texture) the albedo is broken up by triplanar noise in the
// object's own space, so instances keep their pattern as they tumble.
export function patchStandard(material, { haze = '#000000', near = 60, far = 300, rim = '#000000', rimPower = 3, rimAmt = 0, grit = null, gritScale = 1.2, gritAmt = 0.6 } = {}) {
  const u = {
    uGrit: { value: grit },
    uGritK: { value: new THREE.Vector2(gritScale, grit ? gritAmt : 0) },
    uHaze: { value: new THREE.Color(haze) },
    uHazeNF: { value: new THREE.Vector2(near, far) },
    uRimCol: { value: new THREE.Color(rim).multiplyScalar(rimAmt) },
    uRimPow: { value: rimPower },
  };
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('void main() {', 'varying vec3 vObjPos;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = transformed;');
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform vec3 uHaze;\nuniform vec2 uHazeNF;\nuniform vec3 uRimCol;\nuniform float uRimPow;\nuniform sampler2D uGrit;\nuniform vec2 uGritK;\nvarying vec3 vObjPos;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  if (uGritK.y > 0.0) {
    vec3 op = vObjPos * uGritK.x;
    vec3 an = abs(normalize(cross(dFdx(vObjPos), dFdy(vObjPos))));
    an = pow(an, vec3(4.0));
    an /= an.x + an.y + an.z;
    vec4 g = texture2D(uGrit, op.yz) * an.x + texture2D(uGrit, op.xz) * an.y + texture2D(uGrit, op.xy) * an.z;
    vec4 g2 = texture2D(uGrit, op.yz * 3.1) * an.x + texture2D(uGrit, op.xz * 3.1) * an.y + texture2D(uGrit, op.xy * 3.1) * an.z;
    float k = (g.r - 0.5) * 1.2 + (g2.a - 0.5) * 0.8 - smoothstep(0.75, 0.95, g.a) * 0.6;
    diffuseColor.rgb *= clamp(1.0 + k * uGritK.y, 0.2, 1.6);
  }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
  {
    float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), uRimPow);
    gl_FragColor.rgb += uRimCol * fres * clamp(0.6 - normal.y * 0.6 + normal.x * -0.3, 0.0, 1.0);
    float hz = smoothstep(uHazeNF.x, uHazeNF.y, length(vViewPosition));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, hz);
  }`,
      );
  };
  material.customProgramCacheKey = () => 'ace-sector-std2';
  return u;
}
