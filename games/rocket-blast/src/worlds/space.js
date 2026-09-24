// Outer Space: a friendly deep blue and violet sky full of glowing nebula
// clouds and twinkling stars. Lit planets hang at different depths (a ringed
// gas giant, an icy blue world, a cratered moon), rocks drift and glint at
// the sides, and now and then a shooting star streaks past with a sparkly
// tail. A warm sun just out of view lights everything.
import * as THREE from 'three';
import { visibleAt } from './common.js';
import { mulberry32, SPRITE } from '../textures.js';

// Direction to the sun: up, right and in front, so the planets show their
// lit faces with a soft terminator towards the lower left.
const SUN = new THREE.Vector3(0.7, 0.42, 0.58).normalize();

const domeVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 0.0)).xyz;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99998, p.w);
}`;

const domeFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uMagenta;
uniform vec3 uCyan;
uniform vec3 uViolet;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uCalm;
varying vec3 vDir;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float tex(vec2 p, int c) {
  vec4 t = texture2D(uNoise, p);
  return c == 0 ? t.r : c == 1 ? t.g : c == 2 ? t.b : t.a;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uBottom, uTop, smoothstep(-0.7, 0.7, d.y));
  // stereographic map of the sky: smooth everywhere but straight behind
  vec2 uv = d.xy / (1.0 - d.z) * 3.2;
  vec2 wv = uv + (texture2D(uNoise, uv * 0.3 + 0.21).rb - 0.5) * 0.5;
  float big = tex(wv * 0.42 + vec2(0.13, 0.61), 0);
  float mid = tex(wv * 0.95 + vec2(0.71, 0.27), 0);
  float fine = tex(wv * 2.3 + vec2(0.37, 0.83), 2);
  float billow = tex(wv * 0.8 + vec2(0.55, 0.15), 1);
  // a broad river of gas across the sky, like a galaxy seen edge on
  float band = exp(-pow(dot(d, normalize(vec3(-0.5, 0.8, 0.12))) / 0.5, 2.0));
  float dens = big * 0.55 + mid * 0.3 + fine * 0.15 + band * 0.18 - 0.1;
  float cloud = smoothstep(0.38, 0.8, dens);
  // calmer straight ahead, where the toys fly
  vec2 sp = d.xy / max(-d.z, 0.05);
  float calm = d.z < 0.0 ? mix(uCalm, 1.0, smoothstep(0.08, 0.6, length(sp * vec2(0.75, 1.25)))) : 1.0;
  cloud *= calm;
  // regions of different gas: magenta, violet and cyan
  float hue = tex(uv * 0.16 + vec2(0.4, 0.9), 0);
  vec3 neb = mix(uMagenta, uViolet, smoothstep(0.36, 0.48, hue));
  neb = mix(neb, uCyan, smoothstep(0.5, 0.62, hue));
  float glow = cloud * (0.45 + 0.9 * billow * billow);
  col += neb * glow;
  // bright cores
  col += (neb + vec3(0.06, 0.05, 0.08)) * pow(glow, 3.0) * 0.9;
  // dust lanes in front of the glow
  float dust = smoothstep(0.52, 0.72, tex(wv * 1.5 + vec2(0.9, 0.4), 2)) * smoothstep(0.2, 0.7, cloud);
  col = mix(col, uTop * 0.8, dust * 0.45);
  // the sun's warm glow, just out of view
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.1 + pow(sd, 40.0) * 0.35);
  // fine star dust, thicker along the river
  for (int i = 0; i < 2; i++) {
    float scale = i == 0 ? 260.0 : 520.0;
    vec3 g = floor(d * scale);
    float h = hash(g + float(i) * 17.0);
    vec3 f = fract(d * scale) - 0.5;
    float star = step(0.975 - band * 0.015, h) * smoothstep(0.35, 0.0, length(f));
    float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 4.0) + h * 50.0);
    col += mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.9), fract(h * 7.0)) * star * tw * (0.3 + 0.8 * fract(h * 13.0)) * (i == 0 ? 1.0 : 0.6);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// Twinkling stars as points; the brightest get soft diffraction spikes.
const starVertex = /* glsl */ `
attribute vec4 aStar;   // size (css px), phase, speed, brightness
uniform float uTime;
uniform float uPx;
varying vec3 vColor;
varying float vBright;
varying float vSpike;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.6 + 0.4 * sin(uTime * aStar.z + aStar.y);
  vSpike = step(2.6, aStar.x);
  vBright = aStar.w * tw;
  gl_PointSize = aStar.x * uPx * mix(2.2, 5.0, vSpike);
  vColor = color;
}`;

const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vBright;
varying float vSpike;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float k = mix(1.0, 6.0, vSpike);
  float a = exp(-r2 * 14.0 * k) + exp(-r2 * 4.0 * k) * 0.25;
  a += vSpike * (exp(-abs(p.x) * 40.0) + exp(-abs(p.y) * 40.0)) * pow(max(0.0, 1.0 - sqrt(r2)), 2.0) * 0.8;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * vBright * a, 1.0);
}`;

const planetVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
void main() {
  vObj = normal;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// One shader for every planet; KIND picks the surface.
const planetFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFill;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uAtmo;
uniform float uAtmoAmt;
uniform vec3 uCenter;
uniform vec3 uRingN;
uniform vec2 uRing;     // inner, outer radius (0 = no ring)
uniform vec3 uSunObj;   // sun direction in the planet's own frame
#if KIND == 2
uniform vec4 uCraters[CRATERS];
#endif
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;

vec4 tri(vec3 d, float s, vec2 off) {
  vec3 w = pow(abs(d), vec3(4.0));
  w /= w.x + w.y + w.z;
  return texture2D(uNoise, d.yz * s + off) * w.x + texture2D(uNoise, d.xz * s + off) * w.y + texture2D(uNoise, d.xy * s + off) * w.z;
}

// crater height on the moon: round bowls with raised rims
float craterH(vec3 o) {
  float h = 0.0;
#if KIND == 2
  for (int i = 0; i < CRATERS; i++) {
    vec4 c = uCraters[i];
    float d = acos(clamp(dot(o, c.xyz), -1.0, 1.0)) / c.w;
    if (d < 1.6) h += (exp(-pow((d - 1.0) / 0.22, 2.0)) * 0.35 - smoothstep(1.0, 0.55, d) * 0.5) * (0.5 + c.w * 2.0);
  }
#endif
  return h;
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 o = normalize(vObj);
  float lat = o.y;
  float lon = atan(o.z, o.x) / 6.2832 + 0.5;
  vec3 albedo;
  float limb = 1.0;
#if KIND == 0
  // gas giant: soft turbulent bands
  float warp = texture2D(uNoise, vec2(lon * 2.0, lat * 0.9 + 0.3)).r - 0.5;
  float swirl = texture2D(uNoise, vec2(lon * 4.0 + uTime * 0.003, lat * 2.5)).b - 0.5;
  float b = lat * 2.6 + warp * 0.28 + swirl * 0.1;
  float bands = texture2D(uNoise, vec2(0.37, b * 0.5)).r;
  float fine = texture2D(uNoise, vec2(0.81, b * 1.7)).b;
  albedo = mix(uA, uB, smoothstep(0.3, 0.72, bands));
  albedo = mix(albedo, uC, smoothstep(0.5, 0.78, fine) * 0.7);
  // a big friendly storm spot
  vec2 sd = vec2((lon - 0.62) * 3.2, (lat + 0.28) * 5.0);
  float spot = 1.0 - smoothstep(0.35, 0.55, length(sd));
  albedo = mix(albedo, uC * vec3(1.05, 0.8, 0.75), spot * 0.8);
  limb = 0.65 + 0.35 * pow(clamp(dot(N, V), 0.0, 1.0), 0.6);
#elif KIND == 1
  // icy blue world: soft turbulent bands and thin bright streaks of cloud
  float warp = tri(o, 1.1, vec2(0.3, 0.6)).r - 0.5;
  float warp2 = tri(o, 2.7, vec2(0.1, 0.4)).b - 0.5;
  float b = lat * 2.4 + warp * 0.35 + warp2 * 0.08;
  float sea = texture2D(uNoise, vec2(0.13, b * 0.45)).r;
  float sea2 = texture2D(uNoise, vec2(0.57, b * 1.3)).b;
  albedo = mix(uA, uB, smoothstep(0.3, 0.75, sea * 0.75 + sea2 * 0.25));
  float streak = texture2D(uNoise, vec2(lon * 4.0 + warp * 0.15 + uTime * 0.004, b * 1.6 + 0.3)).r;
  float patchy = smoothstep(0.4, 0.7, tri(o, 1.2, vec2(0.8, 0.3)).r);
  albedo = mix(albedo, uC, smoothstep(0.6, 0.85, streak) * patchy * 0.6);
  float pole = smoothstep(0.75, 0.97, abs(lat));
  albedo = mix(albedo, mix(uB, uC, 0.5), pole * 0.5);
  limb = 0.8 + 0.2 * pow(clamp(dot(N, V), 0.0, 1.0), 0.5);
#else
  // cratered moon, embossed towards the sun
  float h = craterH(o);
  vec3 L = normalize(uSunObj - o * dot(uSunObj, o) + 1e-4);
  float emboss = craterH(normalize(o + L * 0.03)) - h;
  // pale highlands and soft darker plains
  float plains = smoothstep(0.45, 0.62, tri(o, 0.55, vec2(0.5)).r);
  albedo = mix(uB, uA, plains);
  albedo *= 0.92 + 0.08 * tri(o, 2.0, vec2(0.1)).b;
  albedo = mix(albedo, uC, clamp(-h, 0.0, 1.0) * 0.35);
  albedo *= clamp(1.0 + emboss * 5.0, 0.5, 1.5);
#endif
  float ndl = dot(N, uSunDir);
  float diff = clamp((ndl + 0.06) / 1.06, 0.0, 1.0);
  // shadow of the ring across the planet
  float shadow = 1.0;
  if (uRing.y > 0.0) {
    float t = dot(uCenter - vWorld, uRingN) / dot(uSunDir, uRingN);
    if (t > 0.0) {
      float r = length(vWorld + uSunDir * t - uCenter);
      float x = (r - uRing.x) / (uRing.y - uRing.x);
      if (x > 0.0 && x < 1.0) shadow = 1.0 - 0.55 * texture2D(uNoise, vec2(x * 1.3, 0.21)).b * smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.9, x);
    }
  }
  vec3 col = albedo * (uSunColor * diff * shadow + uFill * 0.22) * limb;
  // atmosphere: a glowing rim, brightest on the day side
  float fres = pow(1.0 - clamp(dot(normalize(vN), V), 0.0, 1.0), 2.5);
  col += uAtmo * fres * uAtmoAmt * (0.2 + 0.8 * smoothstep(-0.3, 0.5, dot(normalize(vN), uSunDir)));
  gl_FragColor = vec4(col, 1.0);
}`;

// A soft glow of atmosphere just beyond a planet's edge: the back faces of a
// slightly larger sphere, brightest at the limb and on the sunny side.
const haloVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const haloFragment = /* glsl */ `
uniform vec3 uAtmo;
uniform vec3 uSunDir;
uniform float uEdge;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float x = clamp(-dot(N, V) / uEdge, 0.0, 1.0);
  vec3 side = normalize(N - V * dot(N, V) + 1e-4);
  float sun = 0.25 + 0.75 * smoothstep(-0.4, 0.6, dot(side, uSunDir));
  gl_FragColor = vec4(uAtmo * x * x * x * sun, 1.0);
}`;

const ringVertex = /* glsl */ `
varying vec3 vWorld;
varying float vR;
void main() {
  vR = length(position.xy);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const ringFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFill;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uCenter;
uniform float uRadius;
uniform vec2 uRing;
varying vec3 vWorld;
varying float vR;
void main() {
  float x = (vR - uRing.x) / (uRing.y - uRing.x);
  float bands = texture2D(uNoise, vec2(x * 1.3, 0.21)).b;
  float fine = texture2D(uNoise, vec2(x * 4.1, 0.63)).r;
  float dens = smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.9, x) * (0.3 + 0.7 * smoothstep(0.3, 0.7, bands * 0.7 + fine * 0.3));
  dens *= 1.0 - 0.85 * smoothstep(0.6, 0.62, x) * (1.0 - smoothstep(0.66, 0.68, x));
  if (dens < 0.01) discard;
  vec3 albedo = mix(uA, uB, smoothstep(0.35, 0.7, fine));
  // the planet's shadow falls across the ring behind it
  vec3 toC = uCenter - vWorld;
  float tc = dot(toC, uSunDir);
  float miss = length(toC - uSunDir * tc);
  float shade = tc > 0.0 ? smoothstep(uRadius * 0.96, uRadius * 1.02, miss) : 1.0;
  vec3 col = albedo * (uSunColor * 0.8 * shade + uFill * 0.25);
  gl_FragColor = vec4(col * dens, dens * 0.92);
}`;

export function create(ctx) {
  const group = new THREE.Group();
  const q = ctx.quality;
  const low = q.tier === 'low';
  const sunColor = new THREE.Color('#fff0dc').multiplyScalar(1.45);
  const fill = new THREE.Color('#8f7cff');

  // nebula sky
  const domeUniforms = {
    uNoise: { value: ctx.noise },
    uTime: { value: 0 },
    uTop: { value: new THREE.Color('#141c63') },
    uBottom: { value: new THREE.Color('#34186a') },
    uMagenta: { value: new THREE.Color('#ff4fb8').multiplyScalar(0.34) },
    uCyan: { value: new THREE.Color('#3fd6ff').multiplyScalar(0.3) },
    uViolet: { value: new THREE.Color('#8a58ff').multiplyScalar(0.34) },
    uSunDir: { value: SUN.clone() },
    uSunColor: { value: new THREE.Color('#ffd9a8') },
    uCalm: { value: 0.3 },
  };
  const domeMat = new THREE.ShaderMaterial({ uniforms: domeUniforms, vertexShader: domeVertex, fragmentShader: domeFragment, side: THREE.BackSide, depthWrite: false });
  const domeGeo = new THREE.SphereGeometry(1000, 48, 24);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);

  // stars
  const starCount = Math.round(2400 * q.clouds);
  const stars = makeStars(starCount);
  group.add(stars.points);

  // planets
  const sphere = new THREE.SphereGeometry(1, low ? 48 : 72, low ? 32 : 48);
  const planets = [
    // ringed gas giant, upper right
    { kind: 0, z: -360, fx: 0.68, fy: 0.42, r: 0.2, a: '#f6d5a6', b: '#e8955f', c: '#c9644c', atmo: '#ffc78f', atmoAmt: 0.5, halo: 0.6, ring: [1.35, 2.3], ringA: '#fbe6c6', ringB: '#d9a37a', tilt: [0.55, 0, -0.32], spin: 0.02 },
    // icy blue world low on the left, partly out of view
    { kind: 1, z: -560, fx: -0.92, fy: -0.72, r: 0.36, a: '#1f5fc4', b: '#3cb8e8', c: '#eef9ff', atmo: '#7fe3ff', atmoAmt: 0.9, halo: 1.1, tilt: [0.3, 0, 0.25], spin: 0.012 },
    // small cratered moon, upper left
    { kind: 2, z: -230, fx: -0.62, fy: 0.5, r: 0.08, a: '#b2a9cc', b: '#e6e0f2', c: '#8a80a6', atmo: '#d8d0ff', atmoAmt: 0.25, tilt: [0.2, 0, 0], spin: 0.03 },
  ].map((p) => {
    const uniforms = {
      uNoise: { value: ctx.noise },
      uTime: domeUniforms.uTime,
      uSunDir: { value: SUN.clone() },
      uSunColor: { value: sunColor },
      uFill: { value: fill },
      uA: { value: new THREE.Color(p.a) },
      uB: { value: new THREE.Color(p.b) },
      uC: { value: new THREE.Color(p.c) },
      uAtmo: { value: new THREE.Color(p.atmo) },
      uAtmoAmt: { value: p.atmoAmt },
      uCenter: { value: new THREE.Vector3() },
      uRingN: { value: new THREE.Vector3(0, 1, 0) },
      uRing: { value: new THREE.Vector2(0, 0) },
      uSunObj: { value: SUN.clone() },
    };
    const defines = { KIND: p.kind };
    if (p.kind === 2) {
      const cr = mulberry32(8);
      uniforms.uCraters = {
        value: Array.from({ length: 22 }, (_, i) => {
          const d = new THREE.Vector3(cr() * 2 - 1, cr() * 2 - 1, cr() * 2 - 1).normalize();
          return new THREE.Vector4(d.x, d.y, d.z, i < 4 ? 0.35 + cr() * 0.2 : 0.08 + Math.pow(cr(), 2) * 0.2);
        }),
      };
      defines.CRATERS = 22;
    }
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: planetVertex, fragmentShader: planetFragment, defines });
    const holder = new THREE.Group();
    holder.rotation.set(p.tilt[0], p.tilt[1], p.tilt[2]);
    const mesh = new THREE.Mesh(sphere, material);
    holder.add(mesh);
    group.add(holder);
    const out = { def: p, holder, mesh, uniforms, material };
    if (p.halo) {
      // edge of the halo at 1.08 radii: -dot(N, V) at the planet's limb
      const k = 1 / 1.08;
      const haloMat = new THREE.ShaderMaterial({
        uniforms: { uAtmo: { value: new THREE.Color(p.atmo).multiplyScalar(p.halo) }, uSunDir: uniforms.uSunDir, uEdge: { value: Math.sqrt(1 - k * k) } },
        vertexShader: haloVertex,
        fragmentShader: haloFragment,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Mesh(sphere, haloMat);
      halo.scale.setScalar(1.08);
      halo.renderOrder = -7;
      holder.add(halo);
      Object.assign(out, { haloMat });
    }
    if (p.ring) {
      const ringUniforms = {
        uNoise: { value: ctx.noise },
        uSunDir: uniforms.uSunDir,
        uSunColor: { value: sunColor },
        uFill: { value: fill },
        uA: { value: new THREE.Color(p.ringA) },
        uB: { value: new THREE.Color(p.ringB) },
        uCenter: uniforms.uCenter,
        uRadius: { value: 1 },
        uRing: { value: new THREE.Vector2(p.ring[0], p.ring[1]) },
      };
      const ringMat = new THREE.ShaderMaterial({
        uniforms: ringUniforms,
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.ring[0], p.ring[1], low ? 96 : 160, 1), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = -6;
      holder.add(ring);
      Object.assign(out, { ring, ringUniforms, ringMat });
    }
    return out;
  });

  // drifting rocks that catch the light
  const rockCount = low ? 5 : q.tier === 'medium' ? 7 : 9;
  const rockGeo = rockGeometry(mulberry32(5));
  const rockMat = new THREE.MeshStandardMaterial({ color: '#cfc8dc', roughness: 0.7, metalness: 0.08, vertexColors: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.frustumCulled = false;
  group.add(rocks);
  const rr = mulberry32(12);
  const rockList = Array.from({ length: rockCount }, (_, i) => ({
    z: -20 - rr() * 45,
    fx: (i % 2 ? 1 : -1) * (0.62 + rr() * 0.36),
    fy: rr() * 2 - 1,
    vy: -(0.15 + rr() * 0.3),
    size: 0.3 + Math.pow(rr(), 2) * 0.6,
    stretch: new THREE.Vector3(1 + rr() * 0.5, 0.8 + rr() * 0.3, 0.9 + rr() * 0.3),
    rot: new THREE.Euler(rr() * 6, rr() * 6, rr() * 6),
    spin: new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).multiplyScalar(0.5),
    x: 0,
    y: 0,
    hw: 10,
    hh: 6,
  }));

  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let placed = false;

  const layout = (view) => {
    const at = (z) => visibleAt(view.camera, view.dist, z);
    for (const p of planets) {
      const { def } = p;
      const v = at(def.z);
      const R = def.r * Math.min(v.halfW * 1.15, v.halfH);
      p.holder.position.set(def.fx * v.halfW, def.fy * v.halfH, def.z);
      p.holder.scale.setScalar(R);
      p.holder.updateMatrixWorld(true);
      p.uniforms.uCenter.value.copy(p.holder.position);
      if (p.ring) {
        p.uniforms.uRing.value.set(def.ring[0] * R, def.ring[1] * R);
        p.uniforms.uRingN.value.set(0, 1, 0).applyQuaternion(p.holder.quaternion).normalize();
        p.ringUniforms.uRadius.value = R;
      }
    }
    for (const r of rockList) {
      const v = at(r.z);
      r.hw = v.halfW;
      r.hh = v.halfH;
      if (!placed) r.y = r.fy * v.halfH;
      r.x = r.fx * v.halfW;
    }
    placed = true;
  };

  // shooting stars
  const glow = ctx.glow;
  const shooters = [];
  let nextShooter = 1.2;
  let nextGlint = 0.5;
  const TAIL = [
    [2.2, 1.2, 2.4],
    [1.0, 2.0, 2.6],
    [2.6, 2.1, 1.0],
    [1.6, 1.4, 2.8],
  ];
  const launch = (view) => {
    const z = -30 - Math.random() * 50;
    const v = visibleAt(view.camera, view.dist, z);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const ang = 0.18 + Math.random() * 0.4;
    const speed = v.halfW * (1.0 + Math.random() * 0.6);
    shooters.push({
      x: -dir * v.halfW * (0.4 + Math.random() * 0.7),
      y: v.halfH * (0.25 + Math.random() * 0.7),
      z,
      vx: dir * Math.cos(ang) * speed,
      vy: -Math.sin(ang) * speed,
      age: 0,
      life: 1.1 + Math.random() * 0.5,
      scale: v.halfH / 20,
      acc: 0,
    });
  };

  const env = new THREE.Scene();
  const envDome = new THREE.Mesh(domeGeo, domeMat);
  envDome.frustumCulled = false;
  env.add(envDome);

  return {
    id: 'space',
    group,
    envScene: env,
    light: {
      sunDir: new THREE.Vector3(0.45, 0.72, 0.58),
      sunColor: new THREE.Color('#ffe8cc'),
      sunIntensity: 2.3,
      skyColor: new THREE.Color('#c2b2ff'),
      groundColor: new THREE.Color('#98dcff'),
      hemiIntensity: 0.8,
      envIntensity: 1.3,
      exposure: 1.05,
      rimColor: new THREE.Color('#a4ecff'),
      rimIntensity: 1.6,
      bloom: 0.5,
    },
    layout,
    update(dt, t, view) {
      domeUniforms.uTime.value = t;
      dome.position.copy(view.camera.position);
      stars.update(t, view.camera, ctx.renderer.getPixelRatio());
      for (const p of planets) {
        p.mesh.rotation.y += dt * p.def.spin;
        p.mesh.getWorldQuaternion(quat).invert();
        p.uniforms.uSunObj.value.copy(SUN).applyQuaternion(quat);
      }

      // rocks drift down the sides and tumble
      for (let i = 0; i < rockCount; i++) {
        const r = rockList[i];
        r.y += r.vy * dt;
        if (r.y < -r.hh - 2) r.y += r.hh * 2 + 4;
        r.rot.x += r.spin.x * dt;
        r.rot.y += r.spin.y * dt;
        r.rot.z += r.spin.z * dt;
        pos.set(r.x, r.y, r.z);
        scl.copy(r.stretch).multiplyScalar(r.size);
        rocks.setMatrixAt(i, m4.compose(pos, quat.setFromEuler(r.rot), scl));
      }
      rocks.instanceMatrix.needsUpdate = true;
      nextGlint -= dt;
      if (nextGlint <= 0) {
        nextGlint = 0.4 + Math.random() * 0.9;
        const r = rockList[Math.floor(Math.random() * rockCount)];
        tmp.copy(SUN).multiplyScalar(r.size * 0.8);
        glow.add({ x: r.x + tmp.x, y: r.y + tmp.y, z: r.z + tmp.z, size: 0.9 + r.size, life: 0.7, frame: SPRITE.SPARKLE, spin: 1.5, curve: 'inout', r: 2.2, g: 2.0, b: 1.7, a: 1 });
      }

      // shooting stars with a sparkly tail
      nextShooter -= dt;
      if (nextShooter <= 0) {
        nextShooter = 2.5 + Math.random() * 4;
        launch(view);
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i];
        s.age += dt;
        if (s.age >= s.life) {
          shooters.splice(i, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const k = Math.sin(Math.PI * Math.min(1, s.age / s.life)) ** 0.5;
        const sc = s.scale;
        glow.add({ x: s.x, y: s.y, z: s.z, size: 3.4 * sc * k, life: 0, frame: SPRITE.GLOW, r: 2.4, g: 2.1, b: 1.8, a: 1 });
        glow.add({ x: s.x, y: s.y, z: s.z, size: 2.2 * sc * k, life: 0, frame: SPRITE.SPARKLE, rot: t * 2, r: 3, g: 2.8, b: 2.4, a: 1 });
        const sp = Math.hypot(s.vx, s.vy);
        const ux = s.vx / sp;
        const uy = s.vy / sp;
        // a long soft tail plus a brighter core near the head
        const len = 15 * sc * k;
        glow.add({ x: s.x - ux * len * 0.45, y: s.y - uy * len * 0.45, z: s.z, vx: ux * 1e-3, vy: uy * 1e-3, size: len, h: 0.4, align: true, life: 0, frame: SPRITE.STREAK, r: 1.6, g: 1.3, b: 2.2, a: 0.8 });
        glow.add({ x: s.x - ux * len * 0.2, y: s.y - uy * len * 0.2, z: s.z, vx: ux * 1e-3, vy: uy * 1e-3, size: len * 0.45, h: 0.5, align: true, life: 0, frame: SPRITE.STREAK, r: 2.8, g: 2.6, b: 2.3, a: 1 });
        s.acc += dt;
        while (s.acc > 0.012) {
          s.acc -= 0.012;
          const c = TAIL[Math.floor(Math.random() * TAIL.length)];
          glow.add({
            x: s.x - s.vx * Math.random() * 0.05,
            y: s.y - s.vy * Math.random() * 0.05,
            z: s.z,
            vx: (Math.random() - 0.5) * 2 * sc,
            vy: (Math.random() - 0.5) * 2 * sc - 1.5 * sc,
            drag: 1.5,
            size: (0.5 + Math.random() * 0.7) * sc * 1.6,
            life: 0.6 + Math.random() * 0.8,
            frame: SPRITE.SPARKLE,
            spin: 3,
            rot: Math.random() * 6,
            twinkle: 25,
            r: c[0],
            g: c[1],
            b: c[2],
            a: 0.9 * k,
          });
        }
      }
    },
    dispose() {
      group.removeFromParent();
      domeGeo.dispose();
      domeMat.dispose();
      stars.dispose();
      sphere.dispose();
      for (const p of planets) {
        p.material.dispose();
        if (p.haloMat) p.haloMat.dispose();
        if (p.ring) {
          p.ring.geometry.dispose();
          p.ringMat.dispose();
        }
      }
      rockGeo.dispose();
      rockMat.dispose();
      rocks.dispose();
    },
  };
}

// A dense field of stars on a far sphere in front of the camera.
function makeStars(count) {
  const rand = mulberry32(3);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const star = new Float32Array(count * 4);
  const tints = [
    [0.75, 0.85, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 0.92, 0.78],
    [1.0, 0.8, 0.9],
    [0.8, 1.0, 1.0],
  ];
  for (let i = 0; i < count; i++) {
    // directions spread over the front of the sky (az ±70°, el ±50°)
    const az = (rand() * 2 - 1) * 1.22;
    const el = Math.asin((rand() * 2 - 1) * 0.77);
    const r = 850;
    pos[i * 3] = Math.sin(az) * Math.cos(el) * r;
    pos[i * 3 + 1] = Math.sin(el) * r;
    pos[i * 3 + 2] = -Math.cos(az) * Math.cos(el) * r;
    const c = tints[Math.floor(rand() * tints.length)];
    col.set(c, i * 3);
    const big = rand() < 0.03;
    star[i * 4] = big ? 2.8 + rand() * 1.6 : 0.7 + Math.pow(rand(), 4) * 1.6;
    star[i * 4 + 1] = rand() * 6.28;
    star[i * 4 + 2] = 1 + rand() * 4;
    star[i * 4 + 3] = big ? 1.6 + rand() * 1.2 : 0.5 + rand() * 1.1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aStar', new THREE.BufferAttribute(star, 4));
  const uniforms = { uTime: { value: 0 }, uPx: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: starVertex,
    fragmentShader: starFragment,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  points.renderOrder = -8;
  return {
    points,
    update(t, camera, px) {
      uniforms.uTime.value = t;
      uniforms.uPx.value = px;
      points.position.copy(camera.position);
    },
    dispose() {
      g.dispose();
      material.dispose();
    },
  };
}

// A lumpy rock: a sphere pushed in and out by random bumps and dents, with
// darker crevices baked into vertex colours.
function rockGeometry(rand) {
  const src = new THREE.IcosahedronGeometry(1, 3);
  const p = src.attributes.position;
  // weld the duplicated corners so the normals come out smooth
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
  const bumps = Array.from({ length: 14 }, () => {
    const d = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    return { d, amp: (rand() - 0.6) * 0.35, w: 3 + rand() * 8 };
  });
  const n = verts.length / 3;
  const colors = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
    let r = 1;
    for (const b of bumps) r += b.amp * Math.exp(-(1 - v.dot(b.d)) * b.w);
    v.multiplyScalar(r);
    verts[i * 3] = v.x;
    verts[i * 3 + 1] = v.y;
    verts[i * 3 + 2] = v.z;
    const shade = THREE.MathUtils.clamp(0.55 + (r - 1) * 1.6, 0.35, 1.1) * (0.9 + rand() * 0.2);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade * 0.96;
    colors[i * 3 + 2] = shade * 0.94;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
