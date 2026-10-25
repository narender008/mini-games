// Sector 1, the Asteroid Belt: deep navy and teal space with layered,
// lit asteroids drifting past at several depths, the dark limb of a banded
// teal gas giant in the corner, thin gas filaments and dust.
//
// Layers, far to near (all scroll down; perspective gives the parallax):
//   nebula   a far plane: navy base, teal/blue/violet gas, dark dust lanes,
//            calmer in the middle of the screen
//   stars    GPU points just in front of it
//   giant    a sphere lit from behind, so mostly night side with a bright
//            crescent and atmosphere; sits low in the corner, barely moving
//   wisps    an additive plane of ridged teal filaments, sides only
//   rocks    three instanced bands: a far field (small, hazed), a mid band
//            that keeps out of the middle, and a few big near boulders at
//            the very edges
//   dust     specks and faint streaks near the play plane
// Rocks are MeshStandardMaterial lit by the app's key/hemi/rim lights, with
// a teal fresnel rim and distance haze patched in (common.js).
import * as THREE from 'three';
import { Plane, Motes, Stream, envDome, rockGeometry, patchStandard, visibleAt } from './common.js';
import { mulberry32 } from '../../textures.js';

// forward speed of the "ground" layers, world units per second
const SPEED = 2.6;

const nebulaFragment = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uTeal;
uniform vec3 uBlue;
uniform vec3 uViolet;
void main() {
  vec2 p = vec2(vWorld.x, vWorld.y + uScroll) / 512.0;
  vec2 w = p + (vec2(nz(p * 0.5 + 0.13).r, nz(p * 0.5 + 0.57).r) - 0.5) * 0.3;
  float a = nz(w * 0.8).r;
  float b = nz(w * 1.6 + 0.4).r;
  float clouds = smoothstep(0.45, 0.9, a * 0.8 + b * 0.35);
  float hue = nz(p * 0.25 + 0.3).r;
  vec3 neb = mix(uTeal, uBlue, smoothstep(0.38, 0.6, hue));
  neb = mix(neb, uViolet, smoothstep(0.6, 0.75, hue) * 0.8);
  vec3 col = uDeep * (0.75 + 0.5 * nz(p * 0.5 + 0.2).r);
  float side = mix(0.35, 1.0, sideMask(vNdc, 0.05, 0.85));
  col += neb * clouds * (0.35 + 0.9 * b * b) * side;
  float dust = smoothstep(0.5, 0.75, nz(w * 1.2 + 0.9).r);
  col *= 1.0 - dust * 0.5;
  // a slight vignette towards the top and bottom edges for depth
  col *= 0.85 + 0.15 * (1.0 - abs(vNdc.y));
  gl_FragColor = vec4(col, 1.0);
}`;

// Ridged filaments of gas: thin bright threads where the noise crosses 0.5.
const wispFragment = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
void main() {
  vec2 p = vec2(vWorld.x / 128.0, (vWorld.y + uScroll) / 256.0);
  vec2 w = p + (nz(p * 0.5 + 0.31).rb - 0.5) * 0.5;
  float n = nz(w).r;
  float ridge = pow(1.0 - abs(n - 0.5) * 2.0, 12.0);
  float body = smoothstep(0.55, 0.85, nz(w * 0.6 + 0.7).r);
  // threads only where there is gas, so they come and go in long streamers
  float patchy = smoothstep(0.45, 0.7, nz(p * 0.35 + 0.15).r);
  float side = sideMask(vNdc, 0.3, 0.95);
  vec3 col = mix(uColA, uColB, nz(p * 0.3).b) * (ridge * patchy + body * 0.3) * side;
  gl_FragColor = vec4(col, 1.0);
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

const planetFragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uAtmo;
uniform vec3 uNight;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vWorld;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 o = normalize(vObj);
  float lat = o.y;
  float lon = atan(o.z, o.x) / 6.2832 + 0.5;
  float warp = texture2D(uNoise, vec2(lon * 2.0, lat * 0.9 + 0.3)).r - 0.5;
  float swirl = texture2D(uNoise, vec2(lon * 5.0 + uTime * 0.002, lat * 3.0)).b - 0.5;
  float b = lat * 3.2 + warp * 0.3 + swirl * 0.12;
  float bands = texture2D(uNoise, vec2(0.37, b * 0.5)).r;
  float fine = texture2D(uNoise, vec2(0.81, b * 2.1)).b;
  vec3 albedo = mix(uA, uB, smoothstep(0.3, 0.72, bands));
  albedo = mix(albedo, uC, smoothstep(0.6, 0.85, fine) * 0.25);
  // dark storm spots
  vec2 sd = vec2((lon - 0.3) * 4.0, (lat - 0.15) * 7.0);
  albedo *= 1.0 - 0.6 * (1.0 - smoothstep(0.3, 0.6, length(sd)));
  float ndl = dot(N, uSunDir);
  float diff = smoothstep(-0.05, 0.75, ndl);
  float limb = 0.55 + 0.45 * pow(clamp(dot(N, V), 0.0, 1.0), 0.5);
  vec3 col = albedo * (uSunColor * diff + uNight) * limb;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += uAtmo * fres * (0.15 + 1.6 * smoothstep(-0.25, 0.4, ndl));
  gl_FragColor = vec4(col, 1.0);
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
  float sun = 0.12 + 0.88 * smoothstep(-0.3, 0.7, dot(side, uSunDir));
  gl_FragColor = vec4(uAtmo * pow(x, 4.0) * sun, 1.0);
}`;

export function create(ctx) {
  const group = new THREE.Group();
  const q = ctx.quality;
  const low = q.tier === 'low';
  const rand = mulberry32(101);

  const nebula = new Plane({
    z: -700,
    speed: 3,
    noise: ctx.noise,
    fragment: nebulaFragment,
    depthWrite: false,
    renderOrder: -10,
    uniforms: {
      uDeep: { value: new THREE.Color('#040a17') },
      uTeal: { value: new THREE.Color('#1c8a96').multiplyScalar(0.32) },
      uBlue: { value: new THREE.Color('#2a4fb0').multiplyScalar(0.3) },
      uViolet: { value: new THREE.Color('#6a3cb0').multiplyScalar(0.28) },
    },
  });
  group.add(nebula.mesh);

  const stars = new Motes({
    count: Math.round(1400 * q.clouds),
    rand: mulberry32(7),
    calm: 0.55,
    flicker: 0.25,
    colA: '#9fc4ff',
    colB: '#ffe9d0',
    renderOrder: -9,
    gen: (r) => {
      const big = r() < 0.04;
      return { x: r(), y: r(), z: -560 - r() * 100, speed: 3, size: big ? 2.6 + r() * 1.5 : 1 + r() * 1.3, bright: big ? 1.2 + r() : 0.25 + r() * 0.6, mix: r() };
    },
  });
  group.add(stars.points);

  // the gas giant, lit from behind and above: the side we see is mostly night
  const sunDir = new THREE.Vector3(0.3, 0.62, -0.72).normalize();
  const sphere = new THREE.SphereGeometry(1, low ? 48 : 80, low ? 32 : 56);
  const planetU = {
    uNoise: { value: ctx.noise },
    uTime: { value: 0 },
    uSunDir: { value: sunDir },
    uSunColor: { value: new THREE.Color('#d8f4ff').multiplyScalar(0.9) },
    uA: { value: new THREE.Color('#0f4f5c') },
    uB: { value: new THREE.Color('#2b8f98') },
    uC: { value: new THREE.Color('#9fe0e0') },
    uAtmo: { value: new THREE.Color('#5fe6ff').multiplyScalar(0.9) },
    uNight: { value: new THREE.Color('#0a2a38').multiplyScalar(0.45) },
  };
  const planetMat = new THREE.ShaderMaterial({ uniforms: planetU, vertexShader: planetVertex, fragmentShader: planetFragment });
  const planet = new THREE.Group();
  planet.rotation.set(0.25, 0, -0.35);
  const planetMesh = new THREE.Mesh(sphere, planetMat);
  planetMesh.renderOrder = -8;
  planet.add(planetMesh);
  const k = 1 / 1.06;
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uAtmo: { value: new THREE.Color('#4fd8ff').multiplyScalar(0.7) }, uSunDir: { value: sunDir }, uEdge: { value: Math.sqrt(1 - k * k) } },
    vertexShader: planetVertex,
    fragmentShader: haloFragment,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(sphere, haloMat);
  halo.scale.setScalar(1.06);
  halo.renderOrder = -7;
  planet.add(halo);
  group.add(planet);

  const wisps = new Plane({
    z: -140,
    speed: SPEED,
    noise: ctx.noise,
    fragment: wispFragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    renderOrder: -6,
    uniforms: {
      uColA: { value: new THREE.Color('#2fc6d0').multiplyScalar(0.07) },
      uColB: { value: new THREE.Color('#7a54e0').multiplyScalar(0.06) },
    },
  });
  group.add(wisps.mesh);

  // asteroids: a detailed rock for the near and mid bands, a cheap one far
  const rockMat = new THREE.MeshStandardMaterial({ color: '#a3a19d', roughness: 0.84, metalness: 0.05, vertexColors: true, envMapIntensity: 0.35 });
  patchStandard(rockMat, { haze: '#06121e', near: 40, far: 240, rim: '#47d7e6', rimAmt: 0.3, rimPower: 4, grit: ctx.noise, gritScale: 0.9, gritAmt: 0.7 });
  const nearGeo = rockGeometry(mulberry32(5), low ? 3 : 4);
  const farGeo = rockGeometry(mulberry32(9), 1);
  const items = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const rot = () => new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3);
  const spin = (s) => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(s);
  const stretch = (s) => new THREE.Vector3(s * (0.8 + rand() * 0.6), s * (0.7 + rand() * 0.4), s * (0.75 + rand() * 0.4));
  const farItems = items(Math.round(110 * q.debris), () => {
    const z = -70 - rand() * 120;
    return { fx: rand() * 2.2 - 1.1, y0: rand(), z, speed: SPEED * (0.8 + rand() * 0.4), scale: stretch(0.4 + Math.pow(rand(), 3) * 2.2), rot: rot(), spin: spin(0.6), size: 2 };
  });
  const midItems = items(Math.round(30 * q.debris), (i) => {
    const s = (i % 2 ? 1 : -1) * (0.38 + Math.pow(rand(), 0.7) * 0.75);
    return { fx: s, y0: rand(), z: -14 - rand() * 34, speed: SPEED * (0.85 + rand() * 0.3), scale: stretch(0.3 + Math.pow(rand(), 2.5) * 1.3), rot: rot(), spin: spin(0.8), size: 1.5, ps: 0.8 };
  });
  const nearItems = items(6, (i) => ({
    fx: (i % 2 ? 1 : -1) * (0.92 + rand() * 0.16),
    y0: i / 6 + rand() * 0.08,
    z: -4 - rand() * 4,
    speed: SPEED * (1.0 + rand() * 0.2),
    scale: stretch(1.6 + rand() * 1.6),
    rot: rot(),
    spin: spin(0.25),
    size: 3,
    ps: 0.6,
  }));
  const farRocks = new THREE.InstancedMesh(farGeo, rockMat, farItems.length);
  const nearRocks = new THREE.InstancedMesh(nearGeo, rockMat, midItems.length + nearItems.length);
  const farStream = new Stream(farRocks, farItems, { margin: 3 });
  const nearStream = new Stream(nearRocks, [...midItems, ...nearItems], { margin: 3 });
  // tint each rock: warm grey-browns, some darker
  const c = new THREE.Color();
  const tint = (mesh, n) => {
    for (let i = 0; i < n; i++) {
      const v = 0.45 + rand() * 0.45;
      c.setRGB(v, v * (0.95 + rand() * 0.05), v * (0.9 + rand() * 0.08));
      mesh.setColorAt(i, c);
    }
  };
  tint(farRocks, farItems.length);
  tint(nearRocks, midItems.length + nearItems.length);
  group.add(farRocks, nearRocks);

  const dust = new Motes({
    count: Math.round(700 * q.clouds),
    rand: mulberry32(13),
    calm: 0.3,
    colA: '#8fb4c8',
    colB: '#c8b49a',
    renderOrder: -2,
    gen: (r) => {
      const streak = r() < 0.05;
      return { x: r(), y: r(), z: -2 - r() * 50, speed: SPEED * (streak ? 2.2 : 1), size: streak ? 2 + r() * 2 : 1 + r() * 2, bright: streak ? 0.08 + r() * 0.1 : 0.12 + r() * 0.35, mix: r(), stretch: streak ? 4 + r() * 4 : 1 };
    },
  });
  group.add(dust.points);

  const env = envDome({
    base: '#060c16',
    up: '#1d3046',
    down: '#03070c',
    lobes: [
      { dir: [0.5, 0.6, 0.62], color: '#ffe4c6', power: 1.6, sharp: 8 },
      { dir: [-0.6, -0.4, 0.5], color: '#2bc3cf', power: 0.7, sharp: 3 },
      { dir: [0, 0, 1], color: '#36507a', power: 0.4, sharp: 2 },
    ],
  });

  const layout = (view) => {
    nebula.layout(view);
    wisps.layout(view);
    farStream.layout(view);
    nearStream.layout(view);
    // the giant: low right, mostly out of view, bigger on phones
    const z = -420;
    const v = visibleAt(view.camera, view.dist, z);
    const portrait = view.halfH > view.halfW;
    const R = portrait ? v.halfW * 0.95 : v.halfH * 0.85;
    planet.position.set(v.halfW * (portrait ? 1.0 : 1.02), -v.halfH * (portrait ? 1.02 : 1.1), z);
    planet.scale.setScalar(R);
  };

  return {
    id: 'belt',
    accent: '#5fd8e8',
    group,
    envScene: env.scene,
    edges: () => null,
    light: {
      sunDir: new THREE.Vector3(0.5, 0.62, 0.6),
      sunColor: new THREE.Color('#ffe9d2'),
      sunIntensity: 2.6,
      skyColor: new THREE.Color('#5a7fa6'),
      groundColor: new THREE.Color('#0b1a24'),
      hemiIntensity: 0.4,
      envIntensity: 0.9,
      exposure: 1.0,
      rimColor: new THREE.Color('#5fdcec'),
      rimIntensity: 1.5,
      bloom: 0.55,
    },
    layout,
    update(dt, t, view) {
      const px = ctx.renderer.getPixelRatio();
      nebula.update(t);
      wisps.update(t);
      stars.update(t, view, px);
      dust.update(t, view, px);
      planetU.uTime.value = t;
      planetMesh.rotation.y = t * 0.006;
      farStream.update(t);
      nearStream.update(t);
    },
    dispose() {
      group.removeFromParent();
      nebula.dispose();
      wisps.dispose();
      stars.dispose();
      dust.dispose();
      sphere.dispose();
      planetMat.dispose();
      haloMat.dispose();
      rockMat.dispose();
      nearGeo.dispose();
      farGeo.dispose();
      farRocks.dispose();
      nearRocks.dispose();
      env.dispose();
    },
  };
}
