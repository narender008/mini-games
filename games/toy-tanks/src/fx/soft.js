// The see-through effects: powder clouds, dust, flashes, glints, fine powder
// streaks and grains. All of it lives in ONE instanced draw on LAYER_SOFT and is
// moved analytically on the GPU: every particle carries its start position,
// velocity, drag, gravity and wind, and the vertex shader solves
//   x(t) = x0 + (v0 - a/k) (1 - e^-kt)/k + (a/k) t
// so there is nothing to simulate on the CPU and a burst costs a few hundred
// floats written into a ring buffer (no allocations, no per-frame uploads
// except the freshly written range).
//
// Kinds (aS.z): 0 puff (billowing, noise-shaded, lit), 1 glint (four-point
// star, additive), 2 streak (stretched along its velocity), 3 flash (soft glow,
// additive), 4 dot (a tiny lit bead: grains, flakes, droplets of mist).
//
// The layer is drawn after the lens pass with premultiplied alpha, and every
// fragment fades against the scene depth (SOFT_DEPTH_GLSL) so nothing cuts a
// hard line where it meets the ground or a tank.
import * as THREE from 'three';
import { LAYER_SOFT, SOFT_DEPTH_GLSL } from '../post.js';

export const PUFF = 0;
export const GLINT = 1;
export const STREAK = 2;
export const FLASH = 3;
export const DOT = 4;

const VERT = /* glsl */ `
attribute vec4 aP0;
attribute vec4 aV0;
attribute vec4 aS;
attribute vec4 aC;
attribute vec4 aD;
attribute vec4 aE;
uniform float uTime;
uniform float uGravity;
uniform float uWind;
uniform float uViewH;
uniform float uMinPx;
uniform vec3 uSunDir;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vInfo;
varying vec4 vInfo2;
varying vec3 vLight;
void main() {
  float age = uTime - aP0.w;
  float life = aV0.w;
  if (age < 0.0 || age >= life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0); vColor = vec4(0.0); vInfo = vec4(0.0); vInfo2 = vec4(0.0); vLight = vec3(0.0);
    return;
  }
  float u = age / life;
  float kind = aS.z;
  float seed = aS.w;
  float k = aD.x;
  vec3 acc = vec3(uWind * aD.z, -uGravity * aD.y, 0.0);
  vec3 pos;
  vec3 vel;
  if (k > 0.001) {
    float ek = exp(-k * age);
    vec3 vt = acc / k;
    pos = aP0.xyz + (aV0.xyz - vt) * ((1.0 - ek) / k) + vt * age;
    vel = (aV0.xyz - vt) * ek + vt;
  } else {
    pos = aP0.xyz + aV0.xyz * age + 0.5 * acc * age * age;
    vel = aV0.xyz + acc * age;
  }
  if (kind < 0.5) {
    // a little billow drift so a cloud never moves like a rigid ball
    float d = min(1.0, age * 2.5) * 0.008;
    pos += vec3(sin(age * 4.1 + seed * 40.0), 0.6 * sin(age * 3.3 + seed * 23.0), cos(age * 4.7 + seed * 31.0)) * d;
  }
  float pen = aD.w - pos.y;
  if (pen > 0.0) pos.y = aD.w;

  float grow = 1.0 - pow(1.0 - u, 3.0);
  float size = mix(aS.x, aS.y, grow);

  // alpha over life
  float fin = aE.x > 0.0 ? smoothstep(0.0, aE.x, age) : 1.0;
  float fout;
  float pulse = 1.0;
  if (kind < 0.5) fout = 1.0 - smoothstep(0.18, 0.98, u);
  else if (kind < 1.5) {
    fout = pow(1.0 - u, 0.7);
    pulse = 0.55 + 0.45 * sin(age * aE.w + seed * 60.0);
    pulse *= pulse * 1.6;
  } else if (kind < 2.5) fout = 1.0 - smoothstep(0.45, 1.0, u);
  else if (kind < 3.5) fout = pow(1.0 - u, 2.0);
  else fout = 1.0 - smoothstep(0.65, 1.0, u);
  float ground = kind < 0.5 ? 1.0 : 1.0 - smoothstep(0.0, 0.012, pen);
  float alpha = aC.a * fin * fout * ground * pulse;

  vec4 mv = viewMatrix * vec4(pos, 1.0);
  float depth = -mv.z;
  float pxPerM = uViewH * projectionMatrix[1][1] * 0.5 / max(depth, 0.02);
  float sz = size;
  if (kind > 0.5 && kind < 2.5 || kind > 3.5) {
    float minS = uMinPx / pxPerM;
    if (sz < minS) { alpha *= sz / minS; sz = minS; }
  }
  vec2 q = position.xy;
  vec2 corner;
  if (kind > 1.5 && kind < 2.5) {
    vec3 vv = mat3(viewMatrix) * vel;
    float sp = length(vv.xy);
    vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
    float half_ = sz + 0.5 * sp * aE.w;
    corner = dir * q.x * half_ + vec2(-dir.y, dir.x) * q.y * sz;
  } else if (kind > 3.5 || kind > 2.5 && kind < 3.5) {
    corner = q * sz;
  } else {
    float ang = aE.z * age + seed * 6.2831853;
    float c = cos(ang);
    float s = sin(ang);
    corner = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * sz;
  }
  mv.xy += corner;
  gl_Position = projectionMatrix * mv;

  vUv = q;
  vColor = vec4(aC.rgb, alpha);
  vInfo = vec4(kind, u, seed, aE.y);
  vInfo2 = vec4(max(0.003, sz * (kind < 0.5 ? 0.6 : 1.0)), depth - (kind < 0.5 ? size * 0.35 : 0.0), aE.w, age);
  vLight = normalize(mat3(viewMatrix) * uSunDir);
}`;

const FRAG = /* glsl */ `
precision highp float;
${SOFT_DEPTH_GLSL}
uniform sampler2D uNoise;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vInfo;
varying vec4 vInfo2;
varying vec3 vLight;
void main() {
  if (vColor.a <= 0.0) discard;
  float kind = vInfo.x;
  float u = vInfo.y;
  float seed = vInfo.z;
  float lit = vInfo.w;
  vec2 uv = vUv;
  float r2 = dot(uv, uv);
  vec3 col;
  float a;
  float additive = 0.0;
  if (kind < 0.5) {
    if (r2 > 1.0) discard;
    float r = sqrt(r2);
    vec4 n = texture2D(uNoise, uv * 0.27 + vec2(seed * 7.13, seed * 3.71));
    vec4 n2 = texture2D(uNoise, uv * 0.62 + vec2(seed * 2.3, seed * 5.1) + (n.gb - 0.5) * 0.1);
    float h = n.r * 0.6 + n2.r * 0.4;
    float erode = 0.55 + 0.45 * smoothstep(0.0, 1.0, u) + vInfo2.z;
    float dens = (1.0 - r * r) * 1.15 + (h - 0.5) * erode;
    a = smoothstep(0.0, 0.62, dens);
    vec3 nrm = normalize(vec3(uv * 0.9 + (n.gb - 0.5) * 1.0 + (n2.gb - 0.5) * 0.3, sqrt(max(0.1, 1.0 - r2))));
    float wrap = clamp(dot(nrm, vLight) * 0.5 + 0.6, 0.0, 1.0);
    vec3 sunTerm = uSunColor * smoothstep(0.12, 0.95, wrap);
    vec3 amb = uAmbient * (0.72 + 0.28 * (nrm.y * 0.5 + 0.5));
    vec3 shade = (sunTerm + amb) * (0.88 + 0.22 * h);
    col = mix(vec3(1.0), shade, lit) * vColor.rgb;
    a = a * vColor.a;
  } else if (kind < 1.5) {
    float ax = abs(uv.x);
    float ay = abs(uv.y);
    float s = exp(-ay * 30.0) * max(0.0, 1.0 - ax) + exp(-ax * 30.0) * max(0.0, 1.0 - ay);
    vec2 d = vec2(uv.x + uv.y, uv.x - uv.y) * 0.7071;
    s += 0.3 * (exp(-abs(d.y) * 40.0) * max(0.0, 1.0 - abs(d.x)) + exp(-abs(d.x) * 40.0) * max(0.0, 1.0 - abs(d.y)));
    float core = exp(-r2 * 14.0);
    float inten = s * 0.9 + core * 1.5;
    col = mix(vColor.rgb, vec3(1.0), clamp(core * 0.85, 0.0, 1.0)) * inten * 1.9;
    a = 0.0;
    additive = 1.0;
  } else if (kind < 2.5) {
    float body = smoothstep(1.0, 0.35, abs(uv.y)) * smoothstep(1.0, 0.55, abs(uv.x));
    float head = smoothstep(-1.0, 1.0, uv.x);
    float glint = 1.0 + 4.0 * pow(max(0.0, sin(vInfo2.w * 46.0 + seed * 100.0)), 14.0);
    a = body * (0.3 + 0.7 * head);
    vec3 shade = mix(vec3(1.0), uSunColor * 0.5 + uAmbient, lit);
    col = vColor.rgb * shade * glint;
    a *= vColor.a;
  } else if (kind < 3.5) {
    float r = sqrt(r2);
    float g = pow(max(0.0, 1.0 - r), 2.2);
    col = vColor.rgb * g * 2.4;
    a = 0.0;
    additive = 1.0;
  } else {
    if (r2 > 1.0) discard;
    float r = sqrt(r2);
    float m = smoothstep(1.0, 0.7, r);
    vec3 nrm = vec3(uv, sqrt(max(0.0, 1.0 - r2)));
    float shade = 0.55 + 0.45 * clamp(dot(nrm, vLight) * 0.5 + 0.5, 0.0, 1.0);
    float hl = pow(max(0.0, dot(reflect(-vLight, nrm), vec3(0.0, 0.0, 1.0))), 24.0);
    float glitter = pow(max(0.0, sin(vInfo2.w * 38.0 + seed * 100.0)), 18.0) * vInfo2.z;
    vec3 sunTerm = uSunColor * (0.35 + 0.65 * clamp(dot(nrm, vLight) * 0.5 + 0.5, 0.0, 1.0)) + uAmbient * 0.8;
    col = vColor.rgb * mix(vec3(shade), sunTerm, lit) + vec3(hl * 0.6 + glitter * 3.0);
    a = m * vColor.a;
  }
  float vis = softFade(vInfo2.y, vInfo2.x);
  col *= vis;
  a *= vis;
  if (additive > 0.5) {
    col *= vColor.a;
    gl_FragColor = vec4(col, 0.0);
  } else {
    gl_FragColor = vec4(col * a, a);
  }
}`;

export class SoftParticles {
  constructor(scene, softUniforms, noiseTexture, capacity = 3072) {
    this.capacity = capacity;
    this.head = 0;
    this.high = 0;
    this.time = 0;
    this.endTime = 0;
    this.dirtyLo = 1e9;
    this.dirtyHi = -1;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aP0 = mk();
    this.aV0 = mk();
    this.aS = mk();
    this.aC = mk();
    this.aD = mk();
    this.aE = mk();
    this.attrs = [this.aP0, this.aV0, this.aS, this.aC, this.aD, this.aE];
    const names = ['aP0', 'aV0', 'aS', 'aC', 'aD', 'aE'];
    for (let i = 0; i < 6; i++) geo.setAttribute(names[i], this.attrs[i]);
    geo.instanceCount = 0;
    this.geo = geo;
    // every particle starts dead: t0 far in the future would be alive at age<0, so use a huge age instead
    this.aP0.array.fill(-1e6);
    this.aV0.array.fill(1e-3);
    this.uniforms = {
      ...softUniforms,
      uTime: { value: 0 },
      uGravity: { value: 2.2 },
      uWind: { value: 0 },
      uViewH: { value: 800 },
      uMinPx: { value: 1.3 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Vector3(1.0, 0.95, 0.85) },
      uAmbient: { value: new THREE.Vector3(0.35, 0.42, 0.55) },
      uNoise: { value: noiseTexture },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.layers.set(LAYER_SOFT);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // One particle. delay may be negative to backdate (events fired late).
  // Arguments in the order they are stored: position, velocity, life, size
  // start/end, kind, colour + alpha, drag (1/s), gravity scale, wind scale, the
  // floor the centre may not sink below (-1e3 for none), fade-in time, lit (or
  // glitter for streaks), spin (rad/s), extra (see the kinds above).
  spawn(x, y, z, vx, vy, vz, life, size0, size1, kind, r, g, b, a, drag, grav, wind, floorY, fadeIn, lit, spin, extra, delay = 0) {
    const i = this.head;
    this.head = (i + 1) % this.capacity;
    if (i >= this.high) this.high = i + 1;
    const o = i * 4;
    const t0 = this.time + delay;
    let A = this.aP0.array;
    A[o] = x; A[o + 1] = y; A[o + 2] = z; A[o + 3] = t0;
    A = this.aV0.array;
    A[o] = vx; A[o + 1] = vy; A[o + 2] = vz; A[o + 3] = life;
    A = this.aS.array;
    A[o] = size0; A[o + 1] = size1; A[o + 2] = kind; A[o + 3] = Math.random();
    A = this.aC.array;
    A[o] = r; A[o + 1] = g; A[o + 2] = b; A[o + 3] = a;
    A = this.aD.array;
    A[o] = drag; A[o + 1] = grav; A[o + 2] = wind; A[o + 3] = floorY;
    A = this.aE.array;
    A[o] = fadeIn; A[o + 1] = lit; A[o + 2] = spin; A[o + 3] = extra;
    if (i < this.dirtyLo) this.dirtyLo = i;
    if (i > this.dirtyHi) this.dirtyHi = i;
    const end = t0 + life;
    if (end > this.endTime) this.endTime = end;
  }

  setLight(dx, dy, dz, sr, sg, sb, ar, ag, ab) {
    const u = this.uniforms;
    u.uSunDir.value.set(dx, dy, dz).normalize();
    u.uSunColor.value.set(sr, sg, sb);
    u.uAmbient.value.set(ar, ag, ab);
  }

  // called once per frame after the game code has spawned what it wants
  update(time, gravity, wind) {
    this.time = time;
    const u = this.uniforms;
    u.uTime.value = time;
    u.uGravity.value = gravity;
    u.uWind.value = wind;
    if (this.dirtyHi >= 0) {
      const lo = this.dirtyLo;
      const n = this.dirtyHi - lo + 1;
      for (let k = 0; k < 6; k++) {
        const a = this.attrs[k];
        a.clearUpdateRanges();
        a.addUpdateRange(lo * 4, n * 4);
        a.needsUpdate = true;
      }
      this.dirtyLo = 1e9;
      this.dirtyHi = -1;
    }
    this.geo.instanceCount = this.high;
    this.mesh.visible = this.high > 0 && time < this.endTime;
  }

  setViewport(h) {
    this.uniforms.uViewH.value = h;
  }

  clear() {
    this.aP0.array.fill(-1e6);
    this.dirtyLo = 0;
    this.dirtyHi = this.capacity - 1;
    this.endTime = 0;
    this.head = 0;
    this.high = 0;
  }
}
