// Fine ejecta: grains of sand and soil, powder-snow flakes, glitter, and the
// droplets of spray and mud mist. Each one flies on a real ballistic arc
// (gravity, air drag, wind) and lands on the actual ground (world.heightAt),
// or on a water level given with it, so a grain thrown from a crater rim
// lands on the far side of the bump and one that falls into a puddle stops at
// the surface.
//
// The pieces are simulated on the CPU (structure-of-arrays, no allocation) and
// drawn in one instanced draw on LAYER_SOFT: tiny lit beads, stretched along
// their velocity the way a real photograph blurs a fast grain (so a fast
// glitter flake leaves a thin trail), droplets with a bright highlight, and
// glitter flakes that tumble and flash only when their face catches the sun
// towards the camera (the normal is tumbled per flake and the mirror term is
// worked out in the vertex shader, so flakes twinkle in a way that follows the
// real sun and camera, and a flake lying on the ground keeps its own angle).
//
// A grain that lands either stays (glitter, snow crumbs: they lie there until
// the round ends) or is done; some kick up a tiny puff of dust where they
// land (the patter of secondary pops, drawn by the Fx through ctx.pop).
import * as THREE from 'three';
import { LAYER_SOFT, SOFT_DEPTH_GLSL } from '../post.js';

export const G_BEAD = 0;
export const G_GLITTER = 1;
export const G_DROP = 2;

const VERT = /* glsl */ `
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
attribute vec4 aD;
uniform float uTime;
uniform float uViewH;
uniform float uMinPx;
uniform float uShutter;
uniform vec3 uSunDir;
uniform vec4 uFlash;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vInfo;
varying vec3 vLight;
varying float vFlash;
void main() {
  float alpha = aC.a;
  if (alpha <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0); vColor = vec4(0.0); vInfo = vec4(0.0); vLight = vec3(0.0); vFlash = 0.0;
    return;
  }
  float kind = aD.w;
  vec4 mv = viewMatrix * vec4(aA.xyz, 1.0);
  float depth = -mv.z;
  float pxPerM = uViewH * projectionMatrix[1][1] * 0.5 / max(depth, 0.02);
  float sz = aA.w;
  float minS = uMinPx / pxPerM;
  if (sz < minS) { alpha *= sz / minS; sz = minS; }
  // streak along the velocity, as a fast grain blurs across one exposure
  vec3 vv = mat3(viewMatrix) * aB.xyz;
  float sp = length(vv.xy);
  vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(1.0, 0.0);
  float len = min(sp * uShutter, 0.03);
  vec2 q = position.xy;
  vec2 corner = dir * q.x * (sz + 0.5 * len) + vec2(-dir.y, dir.x) * q.y * sz;
  mv.xy += corner;
  gl_Position = projectionMatrix * mv;
  vUv = q;
  vLight = normalize(mat3(viewMatrix) * uSunDir);
  float spark = 0.0;
  float diff = 1.0;
  if (kind > 0.5 && kind < 1.5) {
    // a flake: its face turns at rate aD.y (0 once it lies still) and shines when it mirrors the sun to the eye
    float t = aD.x + aD.y * uTime;
    float p = aD.z * 6.2831853;
    vec3 n = normalize(vec3(sin(t + p) * cos(p * 2.3), cos(t * 0.71 + p), sin(t * 1.3 + p * 1.7) * 0.8 + 0.35));
    n = mat3(viewMatrix) * n;
    vec3 V = normalize(-(viewMatrix * vec4(aA.xyz, 1.0)).xyz);
    vec3 H = normalize(vLight + V);
    spark = pow(abs(dot(n, H)), 26.0);
    diff = abs(dot(n, vLight));
  }
  vec3 fd = aA.xyz - uFlash.xyz;
  vFlash = uFlash.w / max(dot(fd, fd), 0.012);
  vColor = vec4(aC.rgb, alpha);
  vInfo = vec4(kind, spark, diff, depth);
}`;

const FRAG = /* glsl */ `
precision highp float;
${SOFT_DEPTH_GLSL}
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uFlashColor;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vInfo;
varying vec3 vLight;
varying float vFlash;
void main() {
  if (vColor.a <= 0.0) discard;
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float kind = vInfo.x;
  float r = sqrt(r2);
  float m = smoothstep(1.0, 0.65, r);
  vec3 nrm = vec3(vUv, sqrt(max(0.0, 1.0 - r2)));
  float ndl = clamp(dot(nrm, vLight) * 0.5 + 0.5, 0.0, 1.0);
  vec3 light = uSunColor * (0.35 + 0.65 * ndl) + uAmbient * 0.85 + uFlashColor * vFlash;
  vec3 col;
  if (kind < 0.5) {
    col = vColor.rgb * light;
  } else if (kind < 1.5) {
    // metal glitter: dull until the flake mirrors the sun, then a hard flash
    col = vColor.rgb * (0.12 + 0.4 * vInfo.z) * (uSunColor + uAmbient) + vColor.rgb * vInfo.y * (uSunColor + 0.5) * 3.2 + vec3(1.0, 0.96, 0.88) * pow(vInfo.y, 2.0) * 1.5;
  } else {
    // a droplet: the colour of the liquid, a bright window-shaped highlight
    float hl = pow(max(0.0, dot(reflect(-vLight, nrm), vec3(0.0, 0.0, 1.0))), 22.0);
    col = vColor.rgb * light * 0.9 + vec3(hl) * (uSunColor + 0.4) * 0.9;
  }
  float a = m * vColor.a;
  float vis = softFade(vInfo.w - 0.0005, 0.004);
  col *= vis;
  a *= vis;
  gl_FragColor = vec4(col * a, a);
}`;

// per-grain state, in one array, at these offsets
const N = 20;
const X = 0; // position
const VX = 3; // velocity
const RAD = 6;
const AGE = 7;
const LIFE = 8;
const DRAG = 9;
const GS = 10;
const WK = 11;
const A0 = 12;
const LIFT = 13;
const POP = 14;
const FLOOR = 15;
const STAY = 16;
const ST = 17; // 0 dead, 1 in the air (or waiting), 2 lying
const KIND = 18;

const smooth = (a, b, x) => {
  const t = x < a ? 0 : x > b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export class Grains {
  constructor(scene, softUniforms, ctx, capacity = 2000) {
    this.ctx = ctx;
    this.capacity = capacity;
    this.head = 0;
    this.high = 0;
    this.live = 0;
    this.pops = 0;
    this.S = new Float32Array(capacity * N);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aA = mk();
    this.aB = mk();
    this.aC = mk();
    this.aD = mk();
    geo.setAttribute('aA', this.aA);
    geo.setAttribute('aB', this.aB);
    geo.setAttribute('aC', this.aC);
    geo.setAttribute('aD', this.aD);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.geo = geo;
    this.uniforms = {
      ...softUniforms,
      uTime: { value: 0 },
      uViewH: { value: 800 },
      uMinPx: { value: 1.3 },
      uShutter: { value: 0.5 / 60 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Vector3(1, 0.95, 0.85) },
      uAmbient: { value: new THREE.Vector3(0.35, 0.42, 0.55) },
      uFlash: { value: new THREE.Vector4(0, -100, 0, 0) },
      uFlashColor: { value: new THREE.Vector3(0.11, 0.09, 0.06) },
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
    this.mesh.renderOrder = 21;
    this.mesh.layers.set(LAYER_SOFT);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // One grain, from x,y,z with velocity vx,vy,vz.
  //   radius (m), colour r,g,b, alpha, life (s), kind (G_*)
  //   drag (1/s), gs: gravity scale, wk: wind scale
  //   stay: lies where it lands until its life ends; lift: how high above the ground it lies (grass blades hold it up)
  //   pop: chance of a little puff where it lands; floor: a water level it may not fall below (-1e3 for none)
  //   delay (s)
  spawn(x, y, z, vx, vy, vz, radius, r, g, b, alpha, life, kind, drag, gs, wk, stay, lift, pop, floor, delay = 0) {
    let i = this.head;
    // prefer a dead slot near the head; if none within a short scan, take the oldest (the head itself)
    for (let n = 0; n < 24; n++) {
      if (this.S[i * N + ST] === 0) break;
      i = i + 1 === this.capacity ? 0 : i + 1;
    }
    if (this.S[i * N + ST] !== 0) i = this.head;
    this.head = i + 1 === this.capacity ? 0 : i + 1;
    if (i >= this.high) this.high = i + 1;
    const S = this.S;
    const o = i * N;
    S[o] = x; S[o + 1] = y; S[o + 2] = z;
    S[o + VX] = vx; S[o + VX + 1] = vy; S[o + VX + 2] = vz;
    S[o + RAD] = radius;
    S[o + AGE] = -delay;
    S[o + LIFE] = life;
    S[o + DRAG] = drag;
    S[o + GS] = gs;
    S[o + WK] = wk;
    S[o + A0] = alpha;
    S[o + LIFT] = lift;
    S[o + POP] = pop;
    S[o + FLOOR] = floor;
    S[o + STAY] = stay;
    S[o + ST] = 1;
    S[o + KIND] = kind;
    const q = i * 4;
    this.aC.array[q] = r;
    this.aC.array[q + 1] = g;
    this.aC.array[q + 2] = b;
    this.aC.array[q + 3] = 0;
    const D = this.aD.array;
    D[q] = Math.random() * 6.2831853;
    D[q + 1] = kind === G_GLITTER ? 10 + Math.random() * 26 : 0;
    D[q + 2] = Math.random();
    D[q + 3] = kind;
    const A = this.aA.array;
    A[q] = x; A[q + 1] = y; A[q + 2] = z; A[q + 3] = radius;
    const B = this.aB.array;
    B[q] = vx; B[q + 1] = vy; B[q + 2] = vz; B[q + 3] = 0;
  }

  setLight(dx, dy, dz, sr, sg, sb, ar, ag, ab) {
    const u = this.uniforms;
    u.uSunDir.value.set(dx, dy, dz).normalize();
    u.uSunColor.value.set(sr, sg, sb);
    u.uAmbient.value.set(ar, ag, ab);
  }

  setFlash(x, y, z, intensity) {
    this.uniforms.uFlash.value.set(x, y, z, intensity);
  }

  update(dt, time, world) {
    this.uniforms.uTime.value = time;
    this.pops = 0;
    const S = this.S;
    const A = this.aA.array;
    const B = this.aB.array;
    const C = this.aC.array;
    const D = this.aD.array;
    const G = world.gravity * 2.6;
    const wind = world.wind;
    const n = dt > 0.0182 ? (dt > 0.0364 ? 4 : 2) : 1;
    const h = dt / n;
    let hi = 0;
    let live = 0;
    for (let i = 0; i < this.high; i++) {
      const o = i * N;
      const st = S[o + ST];
      if (st === 0) continue;
      const q = i * 4;
      const life = S[o + LIFE];
      const age = (S[o + AGE] += dt);
      if (age >= life) {
        S[o + ST] = 0;
        C[q + 3] = 0;
        continue;
      }
      hi = i + 1;
      live++;
      if (age < 0) {
        C[q + 3] = 0;
        continue;
      }
      const a0 = S[o + A0];
      const fade = (age < 0.02 ? age / 0.02 : 1) * (age > life - 0.5 ? 1 - smooth(life - 0.5, life, age) : 1);
      if (st === 1) {
        let x = S[o];
        let y = S[o + 1];
        let z = S[o + 2];
        let vx = S[o + VX];
        let vy = S[o + VX + 1];
        let vz = S[o + VX + 2];
        const dk = Math.exp(-S[o + DRAG] * h);
        const gs = G * S[o + GS];
        const wa = wind * S[o + WK];
        const rad = S[o + RAD];
        const floor = S[o + FLOOR];
        let landed = false;
        let gy = 0;
        for (let s = 0; s < n; s++) {
          vx = vx * dk + wa * h;
          vy = vy * dk - gs * h;
          vz *= dk;
          x += vx * h;
          y += vy * h;
          z += vz * h;
          gy = world.heightAt(x, z);
          if (floor > gy) gy = floor;
          if (y < gy + rad * 0.6) {
            landed = true;
            break;
          }
        }
        if (landed) {
          if (S[o + STAY] > 0) {
            S[o + ST] = 2;
            y = gy + S[o + LIFT] + rad * 0.5;
            S[o + VX] = S[o + VX + 1] = S[o + VX + 2] = 0;
            D[q + 1] = 0;
            B[q] = B[q + 1] = B[q + 2] = 0;
          } else {
            // done, with a chance of a tiny puff where it fell
            S[o + ST] = 0;
            C[q + 3] = 0;
            if (S[o + POP] > 0 && Math.random() < S[o + POP] && this.pops < 5) {
              this.pops++;
              this.ctx.pop(x, gy, z, C[q], C[q + 1], C[q + 2], rad, S[o + FLOOR] > -900);
            }
            continue;
          }
        } else {
          S[o + VX] = vx;
          S[o + VX + 1] = vy;
          S[o + VX + 2] = vz;
          B[q] = vx;
          B[q + 1] = vy;
          B[q + 2] = vz;
        }
        S[o] = x;
        S[o + 1] = y;
        S[o + 2] = z;
        A[q] = x;
        A[q + 1] = y;
        A[q + 2] = z;
      }
      C[q + 3] = a0 * fade;
    }
    this.high = hi;
    this.live = live;
    this.geo.instanceCount = hi;
    this.mesh.visible = hi > 0;
    if (hi > 0) {
      for (const a of [this.aA, this.aB, this.aC, this.aD]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, hi * 4);
        a.needsUpdate = true;
      }
    }
  }

  // ground under settled flakes changed (a crater): lay the ones near it back on the ground
  reseat(x, z, r, world) {
    const S = this.S;
    const A = this.aA.array;
    const r2 = r * r;
    for (let i = 0; i < this.high; i++) {
      const o = i * N;
      if (S[o + ST] !== 2) continue;
      const dx = S[o] - x;
      const dz = S[o + 2] - z;
      if (dx * dx + dz * dz > r2) continue;
      const y = Math.max(world.heightAt(S[o], S[o + 2]), S[o + FLOOR]) + S[o + LIFT] + S[o + RAD] * 0.5;
      S[o + 1] = y;
      A[i * 4 + 1] = y;
    }
  }

  setViewport(h) {
    this.uniforms.uViewH.value = h;
  }

  clear() {
    this.S.fill(0);
    this.aC.array.fill(0);
    this.high = 0;
    this.head = 0;
    this.live = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}
