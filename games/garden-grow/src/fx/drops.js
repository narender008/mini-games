// Water drops in flight. Each drop's whole path (launch, air drag, gravity)
// is worked out on the GPU from where and when it left, so the CPU only
// writes a drop once, when it is born, and thousands cost almost nothing.
// Where a drop will land is solved at birth, so the landing (a splash, a wet
// patch, watering a plant) fires on time without tracking the drop.
//
// The shader draws each drop the way a camera sees one: a thin streak
// smeared by the shutter, mostly clear (it shows the sky and ground behind
// it, turned over), with a glint of sun, glowing when the sun shines through
// it towards the camera, and a hint of rainbow colour at the rainbow angle.
// Near a nozzle the water is still an unbroken thread, so the shutter does
// not thin it out.
import * as THREE from 'three';
import { lightFor } from './light.js';

export const LAND_REPORT = 1; // tell the owner where it landed (watering)
export const LAND_SPLASH = 2; // throw up a tiny crown of droplets on landing
const GRAVITY = 9.81;

// Shared by every kind of water streak (drops, rain): builds a streak quad
// on screen from where the drop was when the shutter opened (tail) to where
// it is now (head), and works out how it looks.
export const STREAK_LIB = /* glsl */ `
uniform float uTime;
uniform float uExposure;
uniform vec2 uRes;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uEnv;
uniform float uGain;
uniform float uFar; // extra presence for drops too small to resolve (far off)
varying vec4 vGeo; // across (px), along (px), streak length (px), core radius (px)
varying vec3 vCol;
varying float vA;
varying float vSeed;

// Places this corner of the streak quad. Returns false when it cannot be
// drawn (behind the camera). Sets dPx (drop width) and len (streak length) in px.
bool streakQuad(vec3 tail, vec3 head, float radius, out float dPx, out float len, out float w) {
  mat4 vp = projectionMatrix * viewMatrix;
  vec4 cH = vp * vec4(head, 1.0);
  vec4 cT = vp * vec4(tail, 1.0);
  if (cH.w < 0.05 || cT.w < 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return false; }
  vec2 sH = cH.xy / cH.w * 0.5 * uRes;
  vec2 sT = cT.xy / cT.w * 0.5 * uRes;
  vec2 d = sH - sT;
  len = length(d);
  vec2 dir = len > 0.001 ? d / len : vec2(0.0, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);
  vec4 c = mix(cT, cH, position.y);
  w = c.w;
  dPx = 2.0 * radius * projectionMatrix[1][1] * 0.5 * uRes.y / c.w;
  float r = max(dPx * 0.5, 0.65);
  float hw = r * 2.0 + 0.5;
  vec2 s = mix(sT, sH, position.y) + dir * (position.y * 2.0 - 1.0) * hw + perp * position.x * hw;
  gl_Position = vec4(s / (0.5 * uRes) * c.w, c.z, c.w);
  vGeo = vec4(position.x * hw, position.y * (len + 2.0 * hw) - hw, len, r);
  return true;
}

// Light a clear drop at p sends to the camera: the sky and ground it shows
// (turned over, like a tiny lens), a glint of sun, a bright glow when the
// sun shines through it towards the camera, and a hint of rainbow colour
// near the rainbow angle.
vec3 dropLight(vec3 p, float glint, float seed) {
  vec3 V = normalize(cameraPosition - p);
  float cg = dot(-uSunDir, V); // 1: looking into the sun through the drop
  float f = max(cg, 0.0);
  float fwd = 3.2 * pow(f, 8.0) + 0.5 * f * f;
  // wobbling drops flash now and then as a facet catches the sun
  float flick = 0.3 + 1.7 * pow(0.5 + 0.5 * sin(uTime * 23.0 + seed * 91.0), 6.0);
  float ang = acos(clamp(cg, -1.0, 1.0));
  float b = (ang - 2.398) / 0.034; // primary rainbow: red at 137.4, violet at 139.4 degrees
  vec3 bow = clamp(vec3(1.2 - abs(b - 0.1) * 1.6, 1.1 - abs(b - 0.55) * 1.8, 1.2 - abs(b - 1.05) * 1.6), 0.0, 1.0);
  return uEnv + uSunCol * ((fwd + 0.06) * glint * flick + bow * 0.6 * glint) * 0.3183;
}
`;

export const STREAK_FRAG = /* glsl */ `
varying vec4 vGeo;
varying vec3 vCol;
varying float vA;
varying float vSeed;
void main() {
  if (vA <= 0.0) discard;
  float r = vGeo.w;
  float along = vGeo.y < 0.0 ? -vGeo.y : max(0.0, vGeo.y - vGeo.z);
  float q = (vGeo.x * vGeo.x + along * along) / (r * r);
  float cov = exp(-1.4 * q);
  if (cov < 0.003) discard;
  // a wobbling drop brightens and dims along its streak
  float bead = 0.8 + 0.2 * sin(vGeo.y * 0.55 + vSeed * 50.0);
  gl_FragColor = vec4(vCol * cov * bead, vA * cov);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const VERT = /* glsl */ `
${STREAK_LIB}
attribute vec4 aP; // start position, start time
attribute vec4 aV; // start velocity, end time
attribute vec4 aS; // radius, drag, seed, glint (negative: a thread from a nozzle)

// linear air drag: dv/dt = g - k v
vec3 flight(float t) {
  float k = aS.y;
  vec3 vt = vec3(0.0, -${GRAVITY.toFixed(2)} / k, 0.0);
  return aP.xyz + vt * t + (aV.xyz - vt) * ((1.0 - exp(-k * t)) / k);
}

void main() {
  float t = uTime - aP.w;
  vA = 0.0;
  if (t < 0.0 || uTime >= aV.w) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec3 head = flight(t);
  vec3 tail = flight(max(0.0, t - uExposure));
  // a thread breaks into drops about twice its width
  float thread = aS.w < 0.0 ? 1.0 - smoothstep(0.025, 0.06 + aS.z * 0.05, t) : 0.0;
  float rad = aS.x * (aS.w < 0.0 ? mix(1.9, 1.0, thread) : 1.0);
  float dPx, len, w;
  if (!streakQuad(tail, head, rad, dPx, len, w)) return;
  vSeed = aS.z;
  // the shutter spreads a drop along its streak; a thread is not thinned
  float motion = mix(dPx / (len + dPx), 1.0, thread);
  float cover = min(1.0, dPx / (1.5 * max(dPx * 0.5, 0.65))) * motion;
  // a real lens softens many fine drops into a visible shower; lend the
  // unresolved ones a little more presence so the fan reads at a distance
  cover = min(1.0, cover * mix(1.0, uFar, smoothstep(1.2, 0.35, dPx)));
  // fade drops that come very close to the lens
  cover *= smoothstep(0.12, 0.3, w);
  vA = cover;
  vCol = dropLight(head, abs(aS.w), aS.z) * cover * uGain;
}`;

// The material every water streak uses: premultiplied, so each streak both
// hides a little of what is behind it and adds its own light.
export function streakMaterial(vertexShader, extraUniforms = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uExposure: { value: 1 / 60 },
    uRes: { value: new THREE.Vector2(1280, 800) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(3, 3, 3) },
    uEnv: { value: new THREE.Color(0.3, 0.3, 0.3) },
    uGain: { value: 1 },
    uFar: { value: 1 },
    ...extraUniforms,
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: STREAK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

// Keeps a streak material's resolution in step with whatever it renders into.
export function trackResolution(mesh, uniform) {
  mesh.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget();
    if (rt) uniform.value.set(rt.width, rt.height);
    else renderer.getDrawingBufferSize(uniform.value);
  };
}

// A unit quad for streaks: x across (-1..1), y along (0 tail .. 1 head).
export function streakQuadGeometry() {
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  quad.setIndex([0, 2, 1, 2, 3, 1]); // counter-clockwise on screen
  return quad;
}

// Solves when a drop leaving at height y0 with vertical speed vy and drag k
// comes down to height yg.
function fallTime(y0, vy, k, yg) {
  const h = y0 - yg;
  if (h <= 0 && vy <= 0) return 0;
  // no-drag guess, then Newton on the drag formula
  let t = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAVITY * h))) / GRAVITY;
  const vt = -GRAVITY / k;
  for (let i = 0; i < 5; i++) {
    const e = Math.exp(-k * t);
    const y = y0 + vt * t + (vy - vt) * ((1 - e) / k) - yg;
    const dy = vt + (vy - vt) * e;
    if (dy > -1e-4) break;
    const nt = t - y / dy;
    if (!(nt > 0)) break;
    t = nt;
    if (Math.abs(y) < 1e-4) break;
  }
  return Math.min(t, 4);
}

// Queues part of an attribute for upload, widening a range that has not been
// uploaded yet (several updates can run between two renders).
export function markRange(attr, start, count) {
  const r = attr.updateRanges;
  if (r.length) {
    const s = Math.min(r[0].start, start);
    r[0].count = Math.max(r[0].start + r[0].count, start + count) - s;
    r[0].start = s;
  } else attr.addUpdateRange(start, count);
  attr.needsUpdate = true;
}

export class Drops {
  // groundAt(x, z): the surface height drops land on
  constructor(scene, { capacity = 2048, groundAt = () => 0, exposure = 1 / 60, gain = 1, renderOrder = 8 } = {}) {
    this.scene = scene;
    this.capacity = capacity;
    this.groundAt = groundAt;
    this.time = 0;
    this.next = 0;
    this.used = 0;
    this.onLand = null; // (x, y, z, weight) for LAND_REPORT drops
    this.crownScale = 1;

    const quad = streakQuadGeometry();
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    this.p = new Float32Array(capacity * 4);
    this.v = new Float32Array(capacity * 4);
    this.s = new Float32Array(capacity * 4);
    for (let i = 0; i < capacity; i++) this.v[i * 4 + 3] = -1;
    this.aP = new THREE.InstancedBufferAttribute(this.p, 4).setUsage(THREE.DynamicDrawUsage);
    this.aV = new THREE.InstancedBufferAttribute(this.v, 4).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.InstancedBufferAttribute(this.s, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aP', this.aP);
    g.setAttribute('aV', this.aV);
    g.setAttribute('aS', this.aS);
    g.instanceCount = 0;
    this.geometry = g;
    this.dirty0 = capacity;
    this.dirty1 = -1;

    // landings still to come: slot, time, place, flags, weight, impact speed
    this.pend = new Int32Array(capacity);
    this.pendN = 0;
    this.landT = new Float32Array(capacity);
    this.landX = new Float32Array(capacity);
    this.landY = new Float32Array(capacity);
    this.landZ = new Float32Array(capacity);
    this.landF = new Uint8Array(capacity);
    this.landW = new Float32Array(capacity);
    this.landS = new Float32Array(capacity);
    this.landR = new Float32Array(capacity);

    this.material = streakMaterial(VERT);
    this.uniforms = this.material.uniforms;
    this.uniforms.uExposure.value = exposure;
    this.uniforms.uGain.value = gain;
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    trackResolution(this.mesh, this.uniforms.uRes);
    scene.add(this.mesh);
  }

  // Launches one drop from (px, py, pz) at velocity (vx, vy, vz) m/s, that
  // left `age` seconds ago (so drops born within one frame spread out).
  // radius in metres; drag per second (about 9.8 / terminal speed); glint
  // scales its sparkle (negative: an unbroken thread from a nozzle).
  // Returns false if the pool is full.
  emit(px, py, pz, vx, vy, vz, radius, drag = 1.5, flags = 0, weight = 0, glint = 1, age = 0) {
    const i = this.next;
    const now = this.time;
    if (this.v[i * 4 + 3] > now) return false; // still flying: pool is full
    this.next = (i + 1) % this.capacity;
    if (i >= this.used) this.used = i + 1;
    const t0 = now - age;
    const k = Math.max(0.05, drag);
    // where and when it comes down (twice: the ground may be higher there)
    let yg = this.groundAt(px + vx * 0.2, pz + vz * 0.2);
    let t = fallTime(py, vy, k, yg);
    let e = (1 - Math.exp(-k * t)) / k;
    let lx = px + vx * e;
    let lz = pz + vz * e;
    const yg2 = this.groundAt(lx, lz);
    if (Math.abs(yg2 - yg) > 0.002) {
      yg = yg2;
      t = fallTime(py, vy, k, yg);
      e = (1 - Math.exp(-k * t)) / k;
      lx = px + vx * e;
      lz = pz + vz * e;
    }
    const j = i * 4;
    this.p[j] = px;
    this.p[j + 1] = py;
    this.p[j + 2] = pz;
    this.p[j + 3] = t0;
    this.v[j] = vx;
    this.v[j + 1] = vy;
    this.v[j + 2] = vz;
    this.v[j + 3] = t0 + t;
    this.s[j] = radius;
    this.s[j + 1] = k;
    this.s[j + 2] = Math.random();
    this.s[j + 3] = glint;
    if (i < this.dirty0) this.dirty0 = i;
    if (i > this.dirty1) this.dirty1 = i;
    if (flags && t > 0) {
      this.landT[i] = t0 + t;
      this.landX[i] = lx;
      this.landY[i] = yg;
      this.landZ[i] = lz;
      this.landF[i] = flags;
      this.landW[i] = weight;
      this.landR[i] = radius;
      const ekt = Math.exp(-k * t);
      const vyl = -GRAVITY / k + (vy + GRAVITY / k) * ekt;
      this.landS[i] = Math.hypot(vx * ekt, vyl, vz * ekt);
      this.pend[this.pendN++] = i;
    }
    return true;
  }

  // A tiny crown of droplets thrown up where a drop hits (speed: the drop's
  // impact speed in m/s, size: its radius).
  crown(x, y, z, speed, size, n = 3) {
    const up = Math.min(1.1, 0.16 * speed + 0.1) * this.crownScale;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const h = up * (0.3 + Math.random() * 0.5);
      this.emit(x, y + 0.001, z, Math.cos(a) * h, up * (0.55 + Math.random() * 0.6), Math.sin(a) * h, size * (0.3 + Math.random() * 0.25), 7, 0, 0, 0.8);
    }
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.v[i * 4 + 3] = -1;
    this.pendN = 0;
    this.dirty0 = 0;
    this.dirty1 = this.capacity - 1;
  }

  update(dt) {
    this.time += dt;
    const now = this.time;
    // landings that are due
    for (let n = 0; n < this.pendN; n++) {
      const i = this.pend[n];
      if (this.landT[i] > now) continue;
      this.pend[n] = this.pend[--this.pendN];
      n--;
      const f = this.landF[i];
      const x = this.landX[i];
      const y = this.landY[i];
      const z = this.landZ[i];
      if (f & LAND_REPORT && this.onLand) this.onLand(x, y, z, this.landW[i]);
      if (f & LAND_SPLASH) this.crown(x, y, z, this.landS[i], this.landR[i], 2 + ((Math.random() * 2.2) | 0));
    }
    const u = this.uniforms;
    u.uTime.value = now;
    const L = lightFor(this.scene);
    u.uSunDir.value.copy(L.sunDir);
    u.uSunCol.value.copy(L.sunColor);
    u.uEnv.value.copy(L.env);
    if (this.dirty1 >= this.dirty0) {
      const a = this.dirty0 * 4;
      const c = (this.dirty1 - this.dirty0 + 1) * 4;
      for (const attr of [this.aP, this.aV, this.aS]) markRange(attr, a, c);
      this.dirty0 = this.capacity;
      this.dirty1 = -1;
    }
    this.geometry.instanceCount = this.used;
  }
}
