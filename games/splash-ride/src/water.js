// The water, the star of the game.
//
// Shape: a gentle swell (a few long sine waves travelling with deep-water
// speed) plus "bump sets", little groups of rolling wave crests that give
// the boat its floaty hops (and, for big kids, taller wave ramps). The same
// formulas run here on the CPU for the boat and the animals and in the
// vertex shader of a detailed grid that follows the camera, so what you see
// is what the boat rides. Beyond the grid a flat skirt runs to the horizon,
// shaded with the same normals.
//
// Look: drawn after the opaque scene, the water shader reads that scene's
// colour and depth. From the depth it knows how much water each ray passes
// through, so the seabed, coral, fish and hulls fade by real per-colour
// absorption (clear turquoise over white sand, tea-green in the lake), with
// refraction wobble and moving caustics on anything lit under the surface.
// On top: a planar reflection of the world (Fresnel-weighted), a sharp sun
// glitter path, foam from the wake map (wake.js), along shores and on bump
// crests, the glow of the night bay's plankton, and haze into the distance.
import * as THREE from 'three';
import { SKY_UNIFORMS_GLSL, SKY_GLSL } from './sky.js';
import { clamp, smoothstep } from './config.js';

export const MAX_BUMPS = 8;
const G = 9.81;

// ------------------------------------------------------------ shape (CPU)

export class WaterShape {
  constructor() {
    // up to four swell waves: [kx, kz, amplitude, omega]
    this.swell = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    // bump sets: A = (cx, cz, dirX, dirZ), B = (amp, halfWidth, halfLength, roll speed),
    // C = (spacing, crest count, fade 0..1, foam)
    this.bumpA = Array.from({ length: MAX_BUMPS }, () => new THREE.Vector4());
    this.bumpB = Array.from({ length: MAX_BUMPS }, () => new THREE.Vector4());
    this.bumpC = Array.from({ length: MAX_BUMPS }, () => new THREE.Vector4());
    this.bumps = Array.from({ length: MAX_BUMPS }, (_, i) => ({ i, active: false, fade: 0, target: 0, kind: 'bump', x: 0, z: 0, angle: 0 }));
    this.time = 0;
  }

  // waves: [{ dir: degrees (direction of travel, 0 = -z, clockwise), length: m, amp: m }]
  setSwell(waves = []) {
    for (let i = 0; i < 4; i++) {
      const w = waves[i];
      if (!w) {
        this.swell[i].set(0, 0, 0, 0);
        continue;
      }
      const a = THREE.MathUtils.degToRad(w.dir);
      const k = (Math.PI * 2) / w.length;
      this.swell[i].set(Math.sin(a) * k, -Math.cos(a) * k, w.amp, Math.sqrt(G * k) * (w.speed ?? 1));
    }
  }

  // Place (or move) a bump set. kind 'bump' = three small rolling crests,
  // 'ramp' = one tall standing wave with a foamy lip.
  setBump(i, { x, z, angle, kind = 'bump', amp }) {
    const b = this.bumps[i];
    b.active = true;
    b.kind = kind;
    b.x = x;
    b.z = z;
    b.angle = angle;
    b.target = 1;
    const dx = -Math.sin(angle);
    const dz = -Math.cos(angle);
    this.bumpA[i].set(x, z, dx, dz);
    if (kind === 'ramp') {
      this.bumpB[i].set(amp ?? 0.95, 5.5, 12, 0);
      this.bumpC[i].set(0, 1, b.fade, 0.75);
    } else {
      this.bumpB[i].set(amp ?? 0.42, 3.4, 13, 1.1);
      this.bumpC[i].set(10, 3, b.fade, 0.4);
    }
  }

  clearBump(i, instant = false) {
    const b = this.bumps[i];
    b.target = 0;
    if (instant) {
      b.fade = 0;
      b.active = false;
      this.bumpC[i].z = 0;
    }
  }

  freeBump() {
    return this.bumps.find((b) => !b.active && b.fade <= 0) ?? null;
  }

  update(dt, time) {
    this.time = time;
    for (const b of this.bumps) {
      if (!b.active && b.fade <= 0) continue;
      b.fade = clamp(b.fade + (b.target > b.fade ? dt / 2.5 : -dt / 2.5), 0, 1);
      this.bumpC[b.i].z = b.fade;
      if (b.target === 0 && b.fade <= 0) b.active = false;
    }
  }

  swellHeight(x, z, t = this.time) {
    let h = 0;
    for (const w of this.swell) {
      if (w.z === 0) continue;
      h += Math.sin(w.x * x + w.y * z - w.w * t) * w.z;
    }
    return h;
  }

  bumpHeight(x, z, t = this.time) {
    let h = 0;
    for (let i = 0; i < MAX_BUMPS; i++) {
      const C = this.bumpC[i];
      if (C.z <= 0) continue;
      const A = this.bumpA[i];
      const B = this.bumpB[i];
      const dx = x - A.x;
      const dz = z - A.y;
      const n = dx * A.z + dz * A.w;
      const s = -dx * A.w + dz * A.z;
      const halfZone = C.x * C.y * 0.5 + B.y;
      if (Math.abs(s) > B.z || Math.abs(n) > halfZone) continue;
      const ws = smoothstep(B.z, B.z - 5, Math.abs(s));
      const wn = C.y > 1 ? smoothstep(halfZone, halfZone - B.y * 1.4, Math.abs(n)) : 1;
      const phase = C.y > 1 ? (t * B.w) % C.x : 0;
      let sum = 0;
      for (let k = 0; k <= C.y; k++) {
        const nk = C.y > 1 ? -C.x * C.y * 0.5 + phase + k * C.x : 0;
        const u = n - nk;
        if (Math.abs(u) < B.y) sum += 0.5 + 0.5 * Math.cos((Math.PI * u) / B.y);
        if (C.y <= 1) break;
      }
      h += B.x * sum * ws * wn * C.z;
    }
    return h;
  }

  heightAt(x, z, t = this.time) {
    return this.swellHeight(x, z, t) + this.bumpHeight(x, z, t);
  }
}

// ------------------------------------------------------------ GLSL

export const SHAPE_GLSL = /* glsl */ `
uniform vec4 uSwell[4];
uniform vec4 uBumpA[${MAX_BUMPS}];
uniform vec4 uBumpB[${MAX_BUMPS}];
uniform vec4 uBumpC[${MAX_BUMPS}];
uniform float uTime;
float swellH(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = uSwell[i];
    h += sin(dot(w.xy, p) - w.w * uTime) * w.z;
  }
  return h;
}
vec2 swellGrad(vec2 p) {
  vec2 g = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uSwell[i];
    g += cos(dot(w.xy, p) - w.w * uTime) * w.z * w.xy;
  }
  return g;
}
// height of the bump sets; foam gets the crest lips
float bumpH(vec2 p, out float foam) {
  float h = 0.0;
  foam = 0.0;
  for (int i = 0; i < ${MAX_BUMPS}; i++) {
    vec4 C = uBumpC[i];
    if (C.z <= 0.0) continue;
    vec4 A = uBumpA[i];
    vec4 B = uBumpB[i];
    vec2 d = p - A.xy;
    float n = dot(d, A.zw);
    float s = -d.x * A.w + d.y * A.z;
    float halfZone = C.x * C.y * 0.5 + B.y;
    if (abs(s) > B.z || abs(n) > halfZone) continue;
    float ws = smoothstep(B.z, B.z - 5.0, abs(s));
    float wn = C.y > 1.0 ? smoothstep(halfZone, halfZone - B.y * 1.4, abs(n)) : 1.0;
    float phase = C.y > 1.0 ? mod(uTime * B.w, C.x) : 0.0;
    float sum = 0.0;
    float lip = 0.0;
    for (int k = 0; k <= 3; k++) {
      if (float(k) > C.y) break;
      float nk = C.y > 1.0 ? -C.x * C.y * 0.5 + phase + float(k) * C.x : 0.0;
      float u = n - nk;
      if (abs(u) < B.y) sum += 0.5 + 0.5 * cos(3.14159265 * u / B.y);
      // the lip just ahead of the crest in its direction of travel
      float l = u - B.y * 0.12;
      lip += exp(-l * l * 1.2);
      if (C.y <= 1.0) break;
    }
    float w = ws * wn * C.z;
    h += B.x * sum * w;
    foam += C.w * lip * w;
  }
  return h;
}
`;

// ------------------------------------------------------------ surface

const VERT = /* glsl */ `
${SHAPE_GLSL}
uniform vec2 uGridCenter;
uniform float uGridHalf;
uniform mat4 uTexMatrix;
attribute float skirt;
varying vec3 vWorld;
varying vec4 vReflCoord;
varying float vViewZ;
void main() {
  vec3 w = vec3(position.x + uGridCenter.x, 0.0, position.z + uGridCenter.y);
  if (skirt < 0.5) {
    // displacement fades out before the edge of the detailed grid
    vec2 e = abs(position.xz) / uGridHalf;
    float fade = 1.0 - smoothstep(0.7, 0.98, max(e.x, e.y));
    float f;
    w.y = (swellH(w.xz) + bumpH(w.xz, f)) * fade;
  }
  vWorld = w;
  vReflCoord = uTexMatrix * vec4(w.x, 0.0, w.z, 1.0);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
${SKY_UNIFORMS_GLSL}
${SKY_GLSL}
${SHAPE_GLSL}
uniform sampler2D uRipples;
uniform sampler2D uCaustics;
uniform sampler2D uNoise;
uniform sampler2D uWake;
uniform vec3 uWakeInfo;        // origin x, origin z, size (m)
uniform float uWakeTexel;
uniform sampler2D uLand;
uniform vec4 uLandInfo;        // origin x, origin z, size x, size z
uniform sampler2D uOpaque;
uniform sampler2D uDepth;
uniform sampler2D uReflect;
uniform float uReflectOn;
uniform vec2 uResolution;
uniform vec2 uCamNF;           // near, far
uniform vec3 uAbsorb;          // per metre, per colour
uniform vec3 uScatter;         // colour of deep water (lit)
uniform vec3 uAmbient;         // sky light on a horizontal surface (for foam)
uniform vec4 uLook;            // x ripple strength, y refraction, z caustics, w specular
uniform vec4 uLook2;           // x fog density, y shore foam, z reflection strength, w glitter
uniform vec4 uGlow;            // rgb colour, a strength (night bay plankton)
uniform vec2 uWind;            // ripple drift direction
varying vec3 vWorld;
varying vec4 vReflCoord;
varying float vViewZ;

float viewZFromDepth(float d) {
  float n = uCamNF.x, f = uCamNF.y;
  return (n * f) / ((f - n) * d - f);
}

vec2 rippleSlope(vec2 p, float detail) {
  vec2 w = uWind * uTime;
  vec2 s = texture2D(uRipples, p * 0.021 + w * 0.012).rg * 0.9;
  s += texture2D(uRipples, p * 0.057 + vec2(-w.y, w.x) * 0.021).rg * 0.55;
  s += texture2D(uRipples, p * 0.16 - w * 0.047).rg * 0.34 * detail;
  s += texture2D(uRipples, p * 0.43 + vec2(w.y, -w.x) * 0.09).rg * 0.2 * detail * detail;
  return s;
}

void main() {
  vec2 p = vWorld.xz;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 suv = gl_FragCoord.xy / uResolution;

  // --- normal: swell + bumps (analytic/finite difference), ripples, wake
  float bf;
  float e = 0.25;
  float hb = bumpH(p, bf);
  float d1, d2;
  vec2 bg = vec2(bumpH(p + vec2(e, 0.0), d1) - hb, bumpH(p + vec2(0.0, e), d2) - hb) / e;
  vec2 slope = swellGrad(p) + bg;
  float detail = exp(-dist * 0.012);
  slope += rippleSlope(p, detail) * uLook.x * mix(0.35, 1.0, detail);

  vec2 wuv = (p - uWakeInfo.xy) / uWakeInfo.z + 0.5;
  vec4 wake = vec4(0.0);
  if (all(greaterThan(wuv, vec2(0.002))) && all(lessThan(wuv, vec2(0.998)))) {
    wake = texture2D(uWake, wuv);
    float t = uWakeTexel;
    float hx = texture2D(uWake, wuv + vec2(t, 0.0)).g - texture2D(uWake, wuv - vec2(t, 0.0)).g;
    float hz = texture2D(uWake, wuv + vec2(0.0, t)).g - texture2D(uWake, wuv - vec2(0.0, t)).g;
    slope += vec2(hx, hz) / (2.0 * t * uWakeInfo.z);
    // churned water is rougher
    slope += rippleSlope(p * 2.3, 1.0) * clamp(wake.r, 0.0, 1.0) * 0.8;
  }
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  // --- what lies beneath: scene colour and depth, refracted
  float waterZ = vViewZ;
  float sceneZ = viewZFromDepth(texture2D(uDepth, suv).x);
  float path = max(0.0, dist * (sceneZ / waterZ - 1.0));
  vec2 ruv = suv + N.xz * uLook.y * clamp(path, 0.0, 3.0) / 3.0 / (1.0 + dist * 0.04);
  float sceneZr = viewZFromDepth(texture2D(uDepth, ruv).x);
  if (sceneZr > waterZ - 0.05) ruv = suv; else sceneZ = sceneZr;
  float ratio = sceneZ / waterZ;
  path = max(0.0, dist * (ratio - 1.0));
  vec3 bedPos = cameraPosition - toCam * ratio;
  float depthBelow = max(0.0, vWorld.y - bedPos.y);
  vec3 bed = texture2D(uOpaque, ruv).rgb;
  bool sky = texture2D(uDepth, ruv).x >= 0.99999;

  // caustics dance on anything lit under the surface
  if (!sky) {
    vec2 cp = bedPos.xz * 0.23 + N.xz * 0.6;
    float c1 = texture2D(uCaustics, cp + vec2(uTime * 0.021, uTime * 0.013)).r;
    float c2 = texture2D(uCaustics, cp * 1.31 - vec2(uTime * 0.017, -uTime * 0.019)).r;
    float caus = min(c1, c2) * 2.2;
    float sunUp = clamp(uSunDir.y * 2.0, 0.0, 1.0);
    bed *= 1.0 + caus * uLook.z * sunUp * smoothstep(0.05, 0.6, depthBelow) * exp(-depthBelow * 0.22);
  }
  vec3 T = exp(-uAbsorb * (sky ? 1e3 : path + depthBelow * 0.9));
  vec3 under = bed * T + uScatter * (1.0 - T);
  // churned water full of tiny bubbles turns milky and pale
  float bub = clamp(wake.a, 0.0, 1.0);
  under = mix(under, uScatter * 2.2 + uAmbient * 0.12, bub * 0.5);
  // light through the thin tops of the waves
  float sss = pow(max(dot(-V, uSunDir), 0.0), 3.0) * clamp(dot(N.xz, -uSunDir.xz) * 4.0 + 0.2, 0.0, 1.0);
  under += uScatter * sss * 1.5;

  // --- reflection
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl;
  if (uReflectOn > 0.5) {
    vec2 rc = vReflCoord.xy / vReflCoord.w + N.xz * 0.09 / (1.0 + dist * 0.015);
    refl = texture2D(uReflect, clamp(rc, 0.002, 0.998)).rgb;
  } else {
    refl = skyColor(R, false);
  }
  vec3 col = mix(under, refl * uLook2.z, F);

  // --- sun glitter: a sharp GGX lobe on the rippled normal
  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(N, H), 0.0);
  float a2 = uLook.w * uLook.w;
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  float nl = max(dot(N, uSunDir), 0.0);
  float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  col += uSunColor * D * Fs * nl * 0.25 / max(0.1, cosT) * uLook2.w;

  // --- foam
  float shore = 0.0;
  if (!sky) shore = (1.0 - smoothstep(0.02, 0.45, depthBelow));
  vec2 luv = (p - uLandInfo.xy) / uLandInfo.zw;
  float land = texture2D(uLand, luv).r;
  float nB = texture2D(uNoise, p * 0.013).g;
  float band = exp(-max(land, 0.0) / 1.6) * (0.5 + 0.5 * sin(land * 2.3 - uTime * 1.3 + nB * 9.0));
  float foamAmt = wake.r + (shore * 0.8 + band * 0.45) * uLook2.y + bf;
  // foam: fractal patches (which grow and join as foam builds up) with a
  // bubbly lace inside them
  vec2 fp = p + N.xz * 0.4;
  float blot = texture2D(uNoise, fp * 0.061 + vec2(uTime * 0.002, 0.0)).g * 0.55
    + texture2D(uNoise, fp * 0.13 - vec2(0.0, uTime * 0.004)).b * 0.3
    + texture2D(uNoise, fp * 0.47).b * 0.15;
  float lace = texture2D(uCaustics, fp * 0.21).g;
  float pattern = clamp((blot - 0.5) * 1.9 + 0.5, 0.0, 1.0);
  // fine bubbly break-up (smooth noise: cellular noise read as tiles here)
  float fine = texture2D(uNoise, p * 0.71 + vec2(uTime * 0.011, 0.0)).b * 0.6 + texture2D(uNoise, p * 1.9).b * 0.4;
  pattern = pattern * 0.78 + fine * 0.22;
  float fm = smoothstep(1.0 - foamAmt, 1.2 - foamAmt, pattern) * smoothstep(0.0, 0.3, foamAmt) * (0.55 + 0.45 * clamp(foamAmt, 0.0, 1.0));
  fm *= 0.82 + 0.18 * lace;
  vec3 foamCol = 0.8 * (uSunColor * (0.55 + 0.45 * nl) / 3.14159 + uAmbient) * (0.82 + 0.18 * fine);
  col = mix(col, foamCol, clamp(fm, 0.0, 0.95));

  // --- the night bay's glowing plankton, stirred up by anything moving
  if (uGlow.a > 0.0) {
    // specks of light rather than a flat sheet: bright where the water is
    // churned (foam), a fine glitter of points everywhere it was stirred
    float speck = smoothstep(0.55, 0.92, texture2D(uNoise, p * 2.1 + vec2(uTime * 0.07, -uTime * 0.05)).b);
    float twinkle = texture2D(uNoise, p * 0.7 + uTime * 0.05).b;
    float g = wake.b * (0.18 + 0.32 * pattern + 1.3 * speck) + fm * 0.6 * wake.b;
    col += uGlow.rgb * uGlow.a * (g + smoothstep(0.72, 0.95, twinkle) * wake.b * 1.5);
  }

  // --- haze into the distance
  float fog = 1.0 - exp(-dist * uLook2.x * (0.4 + 0.6 * exp(-max(cameraPosition.y, 0.0) / 30.0)));
  col = mix(col, skyHaze(-V), fog);

  gl_FragColor = vec4(col, 1.0);
}`;

// a square grid of (cells x cells) with the given cell size, plus an outer
// skirt ring out to `far` metres, all centred on the origin
function gridGeometry(cells, cell, far) {
  const half = (cells * cell) / 2;
  const n = cells + 1;
  const pos = [];
  const skirt = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      pos.push(-half + i * cell, 0, -half + j * cell);
      skirt.push(0);
    }
  }
  const idx = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // skirt: the grid's border ring joined to a big square
  const base = pos.length / 3;
  const ring = [];
  for (let i = 0; i < cells; i++) ring.push(i); // top edge, left to right
  for (let j = 0; j < cells; j++) ring.push(j * n + cells); // right edge
  for (let i = cells; i > 0; i--) ring.push(cells * n + i); // bottom edge
  for (let j = cells; j > 0; j--) ring.push(j * n); // left edge
  const corners = [
    [-far, -far],
    [far, -far],
    [far, far],
    [-far, far],
  ];
  for (const [x, z] of corners) {
    pos.push(x, 0, z);
    skirt.push(1);
  }
  // each border vertex fans to the nearest far corner(s)
  const side = (k) => Math.floor(k / cells);
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const s = side(k);
    const cA = base + ((s + 0) % 4);
    const cB = base + ((s + 1) % 4);
    // triangle from the edge segment to the corner at the end of this side
    idx.push(a, b, cB);
    if (k % cells === 0) idx.push(a, cB, cA);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skirt', new THREE.Float32BufferAttribute(skirt, 1));
  g.setIndex(idx);
  return g;
}

export class WaterSurface {
  constructor({ quality, textures, sky, shape, wake }) {
    this.q = quality;
    this.shape = shape;
    this.cell = quality.waterCell;
    this.cells = quality.waterCells;
    this.half = (this.cell * this.cells) / 2;
    this.uniforms = {
      ...sky.uniforms,
      uSwell: { value: shape.swell },
      uBumpA: { value: shape.bumpA },
      uBumpB: { value: shape.bumpB },
      uBumpC: { value: shape.bumpC },
      uTime: { value: 0 },
      uGridCenter: { value: new THREE.Vector2() },
      uGridHalf: { value: this.half },
      uTexMatrix: { value: new THREE.Matrix4() },
      uRipples: { value: textures.ripples },
      uCaustics: { value: textures.caustics },
      uNoise: { value: textures.noise },
      uWake: { value: wake.texture },
      uWakeInfo: { value: wake.info },
      uWakeTexel: { value: 1 / wake.res },
      uLand: { value: null },
      uLandInfo: { value: new THREE.Vector4(0, 0, 1, 1) },
      uOpaque: { value: null },
      uDepth: { value: null },
      uReflect: { value: null },
      uReflectOn: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCamNF: { value: new THREE.Vector2(0.1, 5000) },
      uAbsorb: { value: new THREE.Vector3(0.45, 0.09, 0.05) },
      uScatter: { value: new THREE.Color(0.0, 0.1, 0.14) },
      uAmbient: { value: new THREE.Color(0.5, 0.6, 0.8) },
      uLook: { value: new THREE.Vector4(1, 0.03, 1, 0.08) },
      uLook2: { value: new THREE.Vector4(0.0006, 1, 1, 1) },
      uGlow: { value: new THREE.Vector4(0.2, 0.8, 1, 0) },
      uWind: { value: new THREE.Vector2(1, 0.3) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthWrite: true,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(gridGeometry(this.cells, this.cell, 20000), this.material);
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1);
  }

  // look: the place's water settings (see places/*.js)
  setLook(look, land) {
    const u = this.uniforms;
    u.uAbsorb.value.fromArray(look.absorb);
    u.uScatter.value.copy(look.scatter);
    u.uAmbient.value.copy(look.ambient);
    u.uLook.value.set(look.ripples ?? 1, look.refraction ?? 0.03, look.caustics ?? 1, look.roughness ?? 0.08);
    u.uLook2.value.set(look.fog ?? 0.0006, look.shoreFoam ?? 1, look.reflection ?? 1, look.glitter ?? 1);
    u.uGlow.value.set(look.glow?.r ?? 0, look.glow?.g ?? 0, look.glow?.b ?? 0, look.glowStrength ?? 0);
    u.uWind.value.set(look.wind?.[0] ?? 1, look.wind?.[1] ?? 0.3);
    u.uLand.value = land.texture;
    u.uLandInfo.value.set(land.minX, land.minZ, land.sizeX, land.sizeZ);
  }

  // follow the camera, a little ahead of it, snapped to the grid spacing so
  // the displaced vertices never swim
  update(time, camera) {
    this.uniforms.uTime.value = time;
    const fwd = camera.getWorldDirection(this._fwd || (this._fwd = new THREE.Vector3()));
    const ahead = this.half * 0.45;
    const s = this.cell * 2;
    const x = Math.round((camera.position.x + fwd.x * ahead) / s) * s;
    const z = Math.round((camera.position.z + fwd.z * ahead) / s) * s;
    this.uniforms.uGridCenter.value.set(x, z);
  }
}
