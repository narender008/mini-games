// Green Hills: a spring meadow under a blue sky. Rolling ridges recede into
// aerial haze, shaded by a grass shader (colour patches, wind waves rolling
// through, sunlight glowing through the blades on the crests). Round trees
// stand on the far slopes, drifts of wildflowers cover the near ones and a
// few butterflies flutter low behind the toys.
import * as THREE from 'three';
import { SkyDome, CloudField, visibleAt } from './common.js';
import { mulberry32 } from '../textures.js';

// Sunlight on the landscape: high, from the right and a little from in
// front, so the faces of the hills are lit.
const LAND_SUN = new THREE.Vector3(0.5, 0.78, 0.38).normalize();

// Shared light and aerial haze for everything on the ground.
const landCommon = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyLight;
uniform vec3 uBounce;
uniform vec3 uHaze;
uniform vec3 uHazeFar;
uniform float uHazeDensity;
vec3 hazeOf(vec3 col, vec3 wp, float extra) {
  float d = length(wp - cameraPosition);
  float h = 1.0 - exp(-d * uHazeDensity * (1.0 + extra));
  return mix(col, mix(uHaze, uHazeFar, smoothstep(120.0, 650.0, d)), h);
}
vec3 lightOf(vec3 albedo, vec3 N, float wrap) {
  float diff = clamp((dot(N, uSunDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  float up = 0.5 + 0.5 * N.y;
  return albedo * (uSunColor * diff + uSkyLight * up + uBounce * (1.0 - up));
}`;

const hillVertex = /* glsl */ `
attribute float aH;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vH = aH;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const hillFragment = /* glsl */ `
${landCommon}
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uLush;
uniform vec3 uFresh;
uniform vec3 uDeep;
uniform vec3 uDry;
uniform float uDetail;  // fine blade texture (fades out on far ridges)
uniform float uMist;    // extra haze low in the valleys
uniform float uScale;   // pattern scale, so far ridges keep their patches
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
void main() {
  vec2 p = vWorld.xz * uScale;
  float big = texture2D(uNoise, p * 0.006 + 0.13).r;
  float mid = texture2D(uNoise, p * 0.022 + 0.51).b;
  float clump = texture2D(uNoise, p * 0.14).g;
  // blades: streaks standing up the slope
  float blade = texture2D(uNoise, vec2(vWorld.x * 1.9, vWorld.y * 0.3 + vWorld.z * 0.25)).b;
  float fine = texture2D(uNoise, vec2(vWorld.x * 5.3, vWorld.y * 0.9 + vWorld.z * 0.7)).a;
  vec3 albedo = mix(uDeep, uLush, smoothstep(0.25, 0.65, big));
  albedo = mix(albedo, uFresh, smoothstep(0.42, 0.78, mid) * 0.75);
  albedo = mix(albedo, uDry, smoothstep(0.68, 0.9, big * 0.55 + mid * 0.45) * 0.35);
  albedo *= 0.84 + 0.3 * clump;
  albedo *= mix(1.0, 0.72 + 0.34 * blade + 0.22 * fine, uDetail);
  // wind: bright silvery waves rolling through the grass
  float g1 = texture2D(uNoise, p * vec2(0.02, 0.035) + vec2(-uTime * 0.03, uTime * 0.008)).r;
  float g2 = texture2D(uNoise, p * vec2(0.07, 0.12) + vec2(-uTime * 0.08, 0.0)).b;
  float gust = smoothstep(0.55, 0.85, g1 * 0.7 + g2 * 0.3);
  vec3 N = normalize(vN + vec3(clump - 0.5, 0.0, blade - 0.5) * 0.4 * uDetail);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = lightOf(albedo, N, 0.35);
  // sunlight through the blades on the crests and grazing slopes
  float graze = pow(1.0 - clamp(dot(normalize(vN), V), 0.0, 1.0), 3.0);
  float sunSide = clamp(dot(N, uSunDir) + 0.4, 0.0, 1.0);
  col += albedo * uSunColor * vec3(0.95, 1.0, 0.4) * (graze * 0.8 * sunSide + gust * 0.32);
  col += vec3(0.03, 0.04, 0.015) * gust;
  col = hazeOf(col, vWorld, (1.0 - vH) * uMist);
  gl_FragColor = vec4(col, 1.0);
}`;

// Rounded trees (canopy blobs and trunks), instanced.
const treeVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vColor;
varying float vSeed;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vObj = position;
  vColor = instanceColor;
  vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const treeFragment = /* glsl */ `
${landCommon}
uniform sampler2D uNoise;
uniform float uLeaves;
varying vec3 vWorld;
varying vec3 vN;
varying vec3 vObj;
varying vec3 vColor;
varying float vSeed;
void main() {
  vec3 o = normalize(vObj);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  vec3 albedo = vColor;
  if (uLeaves > 0.5) {
    // leafy clumps: billowy bumps over the canopy, darker inside
    float n = texture2D(uNoise, o.xy * 0.55 + vSeed * 7.0).g;
    float n2 = texture2D(uNoise, o.zy * 0.8 + vSeed * 3.0 + 0.3).a;
    N = normalize(N + (vec3(n, n2, n2) - 0.5) * 1.4);
    albedo *= (0.7 + 0.55 * n) * (0.55 + 0.45 * smoothstep(-0.7, 0.5, o.y));
  } else {
    albedo *= 0.8 + 0.2 * o.x;
  }
  vec3 col = lightOf(albedo, N, 0.3);
  float graze = pow(1.0 - clamp(dot(normalize(vN), V), 0.0, 1.0), 3.0);
  col += albedo * uSunColor * vec3(0.8, 1.0, 0.45) * graze * 0.45 * uLeaves;
  col = hazeOf(col, vWorld, 0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

// Wildflowers: camera-facing heads with procedural petals.
const flowerVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWorld;
varying float vSeed;
void main() {
  vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float size = length(instanceMatrix[0].xyz);
  vec4 mv = viewMatrix * c;
  mv.xy += position.xy * size * vec2(1.0, 0.72);
  mv.y += size * 0.3;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vColor = instanceColor;
  vWorld = c.xyz;
  vSeed = fract(sin(dot(c.xz, vec2(12.9898, 78.233))) * 43758.5453);
}`;

const flowerFragment = /* glsl */ `
${landCommon}
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vWorld;
varying float vSeed;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x) + vSeed * 6.2832;
  float petals = 5.0 + floor(vSeed * 3.0);
  float edge = 0.55 + 0.45 * abs(cos(a * petals * 0.5));
  if (r > edge) discard;
  vec3 col = vColor * (0.7 + 0.4 * r);
  vec3 eye = mix(vec3(1.0, 0.62, 0.05), vec3(0.28, 0.12, 0.03), step(0.55, vColor.g * (1.0 - vColor.b)));
  col = mix(col, eye, 1.0 - smoothstep(0.2, 0.3, r));
  col *= 0.8 + 0.3 * p.y;
  col = col * (uSunColor * 0.8 + uSkyLight);
  gl_FragColor = vec4(hazeOf(col, vWorld, 0.0), 1.0);
}`;

// Butterflies: two hinged wings and a body, flapping in the vertex shader.
const flyVertex = /* glsl */ `
attribute float aSide;  // -1 left wing, 1 right wing, 0 body
attribute vec4 iPos;    // xyz, half wingspan
attribute vec4 iAng;    // flap, roll, pitch, kind
varying vec2 vUv;
varying float vSide;
varying float vKind;
varying float vLight;
void main() {
  vec3 p = vec3(position.xy, 0.0);
  vec3 n = vec3(0.0, 0.0, 1.0);
  float flap = iAng.x;
  if (aSide != 0.0) {
    float ax = abs(p.x);
    p.x = aSide * ax * cos(flap);
    p.z = ax * sin(flap);
    n = vec3(-aSide * sin(flap), 0.0, cos(flap));
  }
  float c = cos(iAng.y);
  float s = sin(iAng.y);
  p.xy = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  float cp = cos(iAng.z);
  float sp = sin(iAng.z);
  p.yz = vec2(cp * p.y - sp * p.z, sp * p.y + cp * p.z);
  n.yz = vec2(cp * n.y - sp * n.z, sp * n.y + cp * n.z);
  vec4 mv = modelViewMatrix * vec4(iPos.xyz + p * iPos.w, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vSide = aSide;
  vKind = iAng.w;
  // wings are thin: light from either side, plus some shining through
  vLight = 0.55 + 0.45 * abs(dot(n, normalize(vec3(0.4, 0.8, 0.5))));
}`;

const flyFragment = /* glsl */ `
uniform vec3 uSunColor;
uniform vec3 uSkyLight;
varying vec2 vUv;
varying float vSide;
varying float vKind;
varying float vLight;
float ell(vec2 p, vec2 c, vec2 r, float a) {
  p -= c;
  float cs = cos(a);
  float sn = sin(a);
  p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y) / r;
  return length(p);
}
void main() {
  vec2 p = vUv;
  if (vSide == 0.0) {
    // fuzzy dark body: round head, thorax, tapering abdomen
    float y = p.y;
    float w = y > 0.86 ? sqrt(max(0.0, 1.0 - pow((y - 0.93) / 0.07, 2.0))) * 0.75 : y > 0.55 ? 0.95 : mix(0.25, 0.8, y / 0.55);
    float d = abs(p.x * 2.0 - 1.0) / max(w, 0.001);
    if (d > 1.0 || (y > 0.84 && y < 0.86)) discard;
    gl_FragColor = vec4(vec3(0.06, 0.045, 0.035) * (1.3 - d * 0.6) * (uSunColor * 0.6 + uSkyLight), 1.0);
    return;
  }
  // p.x: 0 at the body to 1 at the tip; p.y: 0 tail to 1 head
  vec2 w = vec2(p.x, p.y * 1.8 - 0.8);
  float fore = ell(w, vec2(0.46, 0.42), vec2(0.56, 0.36), 0.42);
  float hind = ell(w, vec2(0.34, -0.3), vec2(0.36, 0.38), -0.25);
  float d = min(fore, hind);
  if (d > 1.0) discard;
  int k = int(vKind + 0.5);
  vec3 base;
  vec3 edge;
  float border;
  if (k == 0) { base = vec3(1.0, 0.36, 0.02); edge = vec3(0.03, 0.02, 0.02); border = 0.72; }
  else if (k == 1) { base = vec3(0.05, 0.42, 1.0); edge = vec3(0.02, 0.03, 0.12); border = 0.8; }
  else if (k == 2) { base = vec3(1.0, 0.82, 0.08); edge = vec3(0.95, 0.5, 0.02); border = 0.9; }
  else if (k == 3) { base = vec3(1.0, 0.32, 0.62); edge = vec3(0.35, 0.05, 0.3); border = 0.76; }
  else { base = vec3(0.62, 0.38, 1.0); edge = vec3(0.12, 0.04, 0.25); border = 0.8; }
  // brighter towards the body, a dark border with pale spots, fine veins
  vec3 col = base * (0.75 + 0.35 * (1.0 - p.x));
  float veins = smoothstep(0.93, 1.0, abs(sin(atan(w.y, w.x) * 9.0)));
  col = mix(col, edge, veins * 0.5 * step(0.5, border + 0.1 * (1.0 - float(k == 2))));
  float b = smoothstep(border - 0.03, border + 0.02, d);
  col = mix(col, edge, b);
  float spots = step(0.7, fract(atan(w.y - 0.05, w.x - 0.3) * 4.0)) * step(border + 0.07, d) * step(d, 0.95);
  col = mix(col, vec3(1.0), spots * 0.9 * float(k != 2));
  if (k == 2) col = mix(col, vec3(1.0, 0.45, 0.05), 1.0 - smoothstep(0.08, 0.12, length(w - vec2(0.48, 0.38))));
  col *= uSunColor * 0.75 * vLight + uSkyLight;
  gl_FragColor = vec4(col, 1.0);
}`;

// Grass blades on the nearest meadow: thin tapered blades bending with the
// same wind that rolls across the hill shader.
const bladeVertex = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
attribute vec4 iBlade;  // root xyz, height
attribute vec4 iLook;   // lean, width, seed, shade
varying vec3 vWorld;
varying float vT;
varying float vSeed;
varying float vShade;
void main() {
  float t = position.y;
  float h = iBlade.w;
  float g1 = texture2D(uNoise, iBlade.xz * vec2(0.02, 0.035) + vec2(-uTime * 0.03, uTime * 0.008)).r;
  float g2 = texture2D(uNoise, iBlade.xz * vec2(0.07, 0.12) + vec2(-uTime * 0.08, 0.0)).b;
  float gust = smoothstep(0.45, 0.85, g1 * 0.7 + g2 * 0.3);
  float sway = iLook.x + sin(uTime * 2.3 + iBlade.x * 0.7 + iLook.z * 6.28) * 0.1 + gust * 0.55;
  vec3 p = iBlade.xyz;
  p.x += position.x * iLook.y + sway * h * t * t;
  p.y += h * t * (1.0 - 0.2 * sway * sway * t);
  vWorld = p;
  vT = t;
  vSeed = iLook.z;
  vShade = iLook.w + gust * 0.25 * t;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const bladeFragment = /* glsl */ `
${landCommon}
uniform sampler2D uNoise;
uniform vec3 uLush;
uniform vec3 uFresh;
uniform vec3 uDeep;
varying vec3 vWorld;
varying float vT;
varying float vSeed;
varying float vShade;
void main() {
  vec2 p = vWorld.xz;
  float big = texture2D(uNoise, p * 0.006 + 0.13).r;
  float mid = texture2D(uNoise, p * 0.022 + 0.51).b;
  vec3 albedo = mix(uDeep, uLush, smoothstep(0.25, 0.65, big));
  albedo = mix(albedo, uFresh, smoothstep(0.42, 0.78, mid) * 0.75);
  albedo *= 0.8 + 0.4 * vSeed;
  albedo *= mix(0.55, 1.1, vT);
  vec3 col = lightOf(albedo, normalize(vec3(0.2, 0.55, 1.0)), 0.4);
  // sunlight glowing through the tips
  col += albedo * uSunColor * vec3(0.95, 1.0, 0.4) * (vT * vT * 0.45 + vShade);
  gl_FragColor = vec4(hazeOf(col, vWorld, 0.0), 1.0);
}`;

// The hill ridges, far to near. top: height of the crest as a fraction of
// the visible half height at that depth; freq: bumps per half height.
const RIDGES = [
  { z: -620, top: -0.52, amp: 0.05, freq: 3.4, detail: 0, mist: 1.4, scale: 0.35, trees: 0, lush: '#5f9e4a', fresh: '#8fbd57', deep: '#3f7b3b' },
  { z: -330, top: -0.57, amp: 0.045, freq: 2.6, detail: 0, mist: 1.2, scale: 0.55, trees: 22, treeSize: 0.018 },
  { z: -160, top: -0.64, amp: 0.045, freq: 2.1, detail: 0.15, mist: 0.9, scale: 0.8, trees: 16, treeSize: 0.024 },
  { z: -72, top: -0.72, amp: 0.04, freq: 1.6, detail: 0.5, mist: 0.6, scale: 1, trees: 4, treeSize: 0.029, flowers: 0.45 },
  { z: -26, top: -0.845, amp: 0.035, freq: 1.2, detail: 1, mist: 0.3, scale: 1, trees: 0, flowers: 1 },
];

const UP = new THREE.Vector3(0, 1, 0);
// wildflower colours and how common each is
const FLOWERS = [
  ['#ffd21a', 5],
  ['#ffffff', 4],
  ['#ff2d2d', 2.5],
  ['#ff6fb8', 1.5],
  ['#a266ff', 1.2],
  ['#ff8a1f', 1],
  ['#4f86ff', 0.8],
];
const FLOWER_TOTAL = FLOWERS.reduce((a, f) => a + f[1], 0);
function pickFlower(rand) {
  let x = rand() * FLOWER_TOTAL;
  for (const [hex, w] of FLOWERS) if ((x -= w) <= 0) return hex;
  return FLOWERS[0][0];
}
const TREE_COLORS = ['#2f7d2c', '#3d8c31', '#4b9a36', '#58a33a', '#357f2d'];

export function create(ctx) {
  const group = new THREE.Group();
  const q = ctx.quality;
  const low = q.tier === 'low';

  const skySun = new THREE.Vector3(0.6, 0.5, -0.62).normalize();
  const sky = new SkyDome({
    zenith: '#1c64d8',
    horizon: '#c6e6fb',
    ground: '#cfe8f6',
    sunDir: skySun,
    sunColor: '#fff1cf',
    sunDisc: 40,
    sunSize: 0.9993,
    glow: 1.1,
    horizonEl: -0.2,
    topEl: 0.45,
    band: '#eef8ff',
    bandAmt: 0.45,
  });
  group.add(sky.mesh);

  const clouds = new CloudField({ noise: ctx.noise, lit: '#ffffff', shadow: '#a2b7d6', haze: '#c8e5fb', sun: new THREE.Vector3(0.45, 0.75, 0.45), rim: 0.3, fogNear: 200, fogFar: 1400, capacity: 500 });
  group.add(clouds.mesh);

  // light and haze shared by the hills, trees and flowers
  const land = {
    uNoise: { value: ctx.noise },
    uTime: { value: 0 },
    uSunDir: { value: LAND_SUN.clone() },
    uSunColor: { value: new THREE.Color('#fff1da').multiplyScalar(1.85) },
    uSkyLight: { value: new THREE.Color('#9cc8ff').multiplyScalar(0.5) },
    uBounce: { value: new THREE.Color('#a8c870').multiplyScalar(0.22) },
    uHaze: { value: new THREE.Color('#d2e9f8') },
    uHazeFar: { value: new THREE.Color('#bddcf6') },
    uHazeDensity: { value: 1 / 430 },
  };

  const ridges = RIDGES.map((def) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...land,
        uLush: { value: new THREE.Color(def.lush ?? '#57ad32') },
        uFresh: { value: new THREE.Color(def.fresh ?? '#a3d43c') },
        uDeep: { value: new THREE.Color(def.deep ?? '#2c8629') },
        uDry: { value: new THREE.Color('#cfd06a') },
        uDetail: { value: def.detail },
        uMist: { value: def.mist },
        uScale: { value: def.scale },
      },
      vertexShader: hillVertex,
      fragmentShader: hillFragment,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.frustumCulled = false;
    group.add(mesh);
    return { def, mesh, material };
  });

  // trees: canopy blobs and trunks
  const trunkCap = 240;
  const blobCap = 1100;
  const tint = new THREE.Color();
  const treeMat = new THREE.ShaderMaterial({ uniforms: { ...land, uLeaves: { value: 1 } }, vertexShader: treeVertex, fragmentShader: treeFragment });
  const trunkMat = new THREE.ShaderMaterial({ uniforms: { ...land, uLeaves: { value: 0 } }, vertexShader: treeVertex, fragmentShader: treeFragment });
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, low ? 2 : 3), treeMat, blobCap);
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 1, 6, 1, true).translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkCap);
  canopy.setColorAt(0, new THREE.Color());
  trunks.setColorAt(0, new THREE.Color());
  canopy.frustumCulled = trunks.frustumCulled = false;
  group.add(canopy, trunks);

  // wildflowers
  const flowerCap = Math.round(3400 * q.debris);
  const flowerMat = new THREE.ShaderMaterial({ uniforms: { ...land }, vertexShader: flowerVertex, fragmentShader: flowerFragment });
  const flowers = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flowerMat, flowerCap);
  flowers.setColorAt(0, new THREE.Color());
  flowers.frustumCulled = false;
  group.add(flowers);

  // grass blades swaying on the nearest meadow
  const grassBlades = makeBlades(Math.round(9000 * q.debris), land, ridges[ridges.length - 1].material.uniforms);
  group.add(grassBlades.mesh);

  // butterflies
  const flyCount = low ? 4 : q.tier === 'medium' ? 5 : 7;
  const fly = makeButterflies(flyCount, land);
  group.add(fly.mesh);

  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const pt = { x: 0, y: 0, z: 0 };

  let laidOut = '';
  const layout = (view) => {
    // the frame governor resizes for pixel ratio alone: nothing to rebuild
    const key = `${view.dist.toFixed(4)}:${view.camera.aspect.toFixed(4)}`;
    if (key === laidOut) return;
    laidOut = key;
    const cam = view.camera;
    const at = (z) => visibleAt(cam, view.dist, z);
    const rand = mulberry32(7);
    const r = (a, b) => a + rand() * (b - a);

    // hills
    for (const ridge of ridges) {
      const v = at(ridge.def.z);
      ridge.shape = ridgeShape(ridge.def, v, mulberry32(Math.round(ridge.def.z * -13 + 5)));
      const g = buildRidge(ridge.shape, low ? 0.7 : 1);
      ridge.mesh.geometry.dispose();
      ridge.mesh.geometry = g;
    }

    // trees in small copses along the crests: a trunk and a few leafy blobs
    let nt = 0;
    let nb = 0;
    const blob = (x, y, z, sx, sy, colour) => {
      if (nb >= blobCap) return;
      pos.set(x, y, z);
      scl.set(sx, sy, sx);
      quat.setFromAxisAngle(UP, r(0, 6.28));
      canopy.setMatrixAt(nb, m4.compose(pos, quat, scl));
      canopy.setColorAt(nb, colour);
      nb++;
    };
    const addTree = (shape, x, s, size, hex) => {
      if (nt >= trunkCap) return;
      shape.point(x, s, pt);
      const trunkH = size * r(0.8, 1.2);
      pos.set(pt.x, pt.y - size * 0.2, pt.z);
      scl.set(size * 1.1, trunkH + size * 0.6, size * 1.1);
      trunks.setMatrixAt(nt, m4.compose(pos, quat.identity(), scl));
      trunks.setColorAt(nt, col.set('#5a4030'));
      nt++;
      const cy = pt.y + trunkH + size * 0.7;
      col.set(hex);
      blob(pt.x, cy, pt.z, size, size * r(0.95, 1.2), col);
      const extra = low ? 2 : 3 + Math.floor(rand() * 2);
      for (let k = 0; k < extra; k++) {
        const a = (k / extra) * 6.28 + r(-0.4, 0.4);
        const sz = size * r(0.55, 0.75);
        tint.copy(col).offsetHSL(r(-0.01, 0.02), r(-0.05, 0.05), r(-0.02, 0.05));
        blob(pt.x + Math.cos(a) * size * 0.62, cy + r(-0.2, 0.55) * size, pt.z + Math.sin(a) * size * 0.5, sz, sz * r(0.9, 1.1), tint);
      }
    };
    for (const ridge of ridges) {
      const { def, shape } = ridge;
      if (!def.trees) continue;
      const n = Math.round(def.trees * (0.6 + 0.4 * q.clouds));
      for (let c = 0; c < n; c++) {
        const cx = r(-shape.halfW, shape.halfW) * 1.05;
        const cs = r(-0.02, 0.3);
        const count = rand() < 0.3 ? 1 : Math.round(r(2, 5));
        const blossom = rand() < 0.12;
        for (let k = 0; k < count; k++) {
          const size = shape.hh * def.treeSize * r(0.7, 1.25);
          const hex = blossom && k === 0 ? (rand() < 0.5 ? '#f4a9c6' : '#f8c3d8') : TREE_COLORS[Math.floor(rand() * TREE_COLORS.length)];
          addTree(shape, cx + (k - count / 2) * size * r(1.5, 2.2), cs + r(-0.04, 0.06), size, hex);
        }
      }
    }
    canopy.count = nb;
    trunks.count = nt;
    canopy.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true;
    canopy.instanceColor.needsUpdate = trunks.instanceColor.needsUpdate = true;

    // wildflowers in drifts on the near hills, and grass blades on the
    // nearest one (only where they can be seen)
    let nf = 0;
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    ridges.forEach((ridge, ri) => {
      const { def, shape } = ridge;
      if (!def.flowers) return;
      const next = RIDGES[ri + 1];
      const minFrac = next ? next.top - next.amp - 0.02 : -1.03;
      const budget = Math.round(flowerCap * (def.flowers / 1.45));
      const size0 = shape.hh * 0.016;
      let made = 0;
      let guard = 0;
      while (made < budget && nf < flowerCap && guard++ < budget * 4) {
        const cx = r(-shape.halfW, shape.halfW) * 1.05;
        const cs = r(-0.02, 0.7);
        const hue = pickFlower(rand);
        const n = Math.round(r(25, 90));
        const spread = shape.hh * r(0.03, 0.12);
        for (let k = 0; k < n && made < budget && nf < flowerCap; k++) {
          const x = cx + gauss() * spread;
          const s = cs + gauss() * 0.1;
          if (s < -0.03 || s > 0.95) continue;
          shape.point(x, s, pt);
          const vis = at(pt.z);
          if (pt.y < vis.halfH * minFrac || Math.abs(pt.x) > vis.halfW * 1.1) continue;
          const size = size0 * r(0.7, 1.3) * (0.8 + 0.4 * s);
          pos.set(pt.x, pt.y, pt.z);
          scl.setScalar(size);
          flowers.setMatrixAt(nf, m4.compose(pos, quat.identity(), scl));
          flowers.setColorAt(nf, col.set(rand() < 0.85 ? hue : pickFlower(rand)));
          nf++;
          made++;
        }
      }
    });
    flowers.count = nf;
    flowers.instanceMatrix.needsUpdate = true;
    flowers.instanceColor.needsUpdate = true;
    grassBlades.layout(ridges[ridges.length - 1].shape, at, rand);

    // a few fair-weather clouds
    clouds.clouds.length = 0;
    const amount = q.clouds;
    const cr = mulberry32(31);
    const rc = (a, b) => a + cr() * (b - a);
    // far, flat clouds peeping over the distant hills
    for (let i = 0; i < Math.round(5 * amount + 2); i++) {
      const z = rc(-950, -800);
      const v = at(z);
      clouds.addCloud({ x: rc(-v.halfW, v.halfW), y: rc(-0.5, -0.36) * v.halfH, z, w: rc(90, 170), h: rc(18, 28), vx: 0.6, alpha: 0.85, flat: 0.25, rand: cr });
    }
    // fair-weather cumulus up in the sky, towards the sides
    for (let i = 0; i < Math.round(3 * amount + 2); i++) {
      const z = rc(-200, -120);
      const v = at(z);
      const side = i % 2 ? 1 : -1;
      clouds.addCloud({ x: side * rc(0.3, 0.95) * v.halfW, y: rc(-0.1, 0.65) * v.halfH, z, w: rc(24, 40), h: rc(8, 12), vx: 0.8, rand: cr });
    }
    clouds.finish();

    fly.layout(view);
  };

  // environment: the sky above, a sunlit meadow below
  const env = new THREE.Scene();
  env.add(sky.clone());
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ color: new THREE.Color('#77b64a').multiplyScalar(1.3) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -60;
  env.add(ground);

  return {
    id: 'grass',
    group,
    envScene: env,
    light: {
      sunDir: new THREE.Vector3(0.35, 0.8, 0.55),
      sunColor: new THREE.Color('#fff4e0'),
      sunIntensity: 2.1,
      skyColor: new THREE.Color('#bfe0ff'),
      groundColor: new THREE.Color('#e4eccb'),
      hemiIntensity: 0.55,
      envIntensity: 0.85,
      exposure: 1.0,
      rimColor: new THREE.Color('#fff0d0'),
      rimIntensity: 1.2,
    },
    layout,
    update(dt, t, v) {
      sky.update(t, v.camera);
      land.uTime.value = t;
      clouds.update(dt, t, { halfW: (z) => visibleAt(v.camera, v.dist, z).halfW });
      fly.update(dt, t);
    },
    dispose() {
      group.removeFromParent();
      for (const r of ridges) {
        r.mesh.geometry.dispose();
        r.material.dispose();
      }
      for (const m of [canopy, trunks, flowers]) {
        m.geometry.dispose();
        m.dispose();
      }
      treeMat.dispose();
      trunkMat.dispose();
      flowerMat.dispose();
      fly.dispose();
      grassBlades.dispose();
      clouds.mesh.geometry.dispose();
      clouds.material.dispose();
      sky.material.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
    },
  };
}

// The surface of one ridge. s runs across it: -1 behind the crest, 0 on the
// crest, 1 at the foot of its front slope (towards the camera).
function ridgeShape(def, v, rand) {
  const hh = v.halfH;
  const halfW = v.halfW * 1.2 + hh * 0.05;
  const ph = Array.from({ length: 6 }, () => rand() * 6.283);
  const f = def.freq;
  const top = (x) => {
    const u = x / hh;
    const w = 0.5 * Math.sin(u * f + ph[0]) + 0.28 * Math.sin(u * f * 2.3 + ph[1]) + 0.14 * Math.sin(u * f * 4.7 + ph[2]) + 0.08 * Math.sin(u * f * 9.1 + ph[3]);
    return hh * (def.top + def.amp * w);
  };
  const base = -hh * 1.25;
  const front = hh * 0.55;
  const back = hh * 0.25;
  return {
    hh,
    halfW,
    point(x, s, out) {
      const u = x / hh;
      const t = top(x);
      const zc = def.z + hh * 0.06 * Math.sin(u * 1.1 + ph[4]);
      const c = 1 - s * s;
      // folds and knolls on the slope that leave the skyline alone
      const fold = (t - base) * 0.07 * Math.sin(u * f * 3.1 + s * 4.0 + ph[5]) * c * (1 - c) * 4;
      out.x = x;
      out.y = base + (t - base) * c + fold;
      out.z = zc + s * (s > 0 ? front : back);
      out.h = c;
      return out;
    },
  };
}

function buildRidge(shape, detail) {
  const nx = Math.round(200 * detail);
  const ns = Math.round(30 * detail);
  const verts = (nx + 1) * (ns + 1);
  const position = new Float32Array(verts * 3);
  const height = new Float32Array(verts);
  const pt = {};
  let k = 0;
  for (let j = 0; j <= ns; j++) {
    // rows bunch up near the crest, where the silhouette is
    const a = (j / ns) * 2 - 1;
    const s = a < 0 ? -Math.pow(-a, 1.4) : Math.pow(a, 1.4);
    for (let i = 0; i <= nx; i++) {
      shape.point(-shape.halfW + (2 * shape.halfW * i) / nx, s, pt);
      position[k * 3] = pt.x;
      position[k * 3 + 1] = pt.y;
      position[k * 3 + 2] = pt.z;
      height[k] = pt.h;
      k++;
    }
  }
  const index = [];
  for (let j = 0; j < ns; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('aH', new THREE.BufferAttribute(height, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Blades of grass over the visible part of the nearest ridge, thickest along
// its crest where they fringe the skyline.
function makeBlades(capacity, land, palette) {
  const g = new THREE.InstancedBufferGeometry();
  // a tapered blade: two quads and a tip, x -0.5..0.5, y 0..1
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.36, 0.5, 0, 0.36, 0.5, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const blade = new Float32Array(capacity * 4);
  const look = new Float32Array(capacity * 4);
  const aBlade = new THREE.InstancedBufferAttribute(blade, 4);
  const aLook = new THREE.InstancedBufferAttribute(look, 4);
  g.setAttribute('iBlade', aBlade);
  g.setAttribute('iLook', aLook);
  g.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    uniforms: { ...land, uLush: palette.uLush, uFresh: palette.uFresh, uDeep: palette.uDeep },
    vertexShader: bladeVertex,
    fragmentShader: bladeFragment,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  const pt = {};
  return {
    mesh,
    layout(shape, at, rand) {
      let n = 0;
      let guard = 0;
      const h0 = shape.hh * 0.028;
      while (n < capacity && guard++ < capacity * 3) {
        const crest = rand() < 0.45;
        const s = crest ? -0.07 + rand() * 0.14 : 0.05 + Math.pow(rand(), 1.3) * 0.7;
        shape.point((rand() * 2 - 1) * shape.halfW, s, pt);
        const vis = at(pt.z);
        if (pt.y < -vis.halfH * 1.04 || Math.abs(pt.x) > vis.halfW * 1.08) continue;
        const h = h0 * (0.6 + rand() * 0.8) * (0.85 + 0.3 * s);
        blade[n * 4] = pt.x;
        blade[n * 4 + 1] = pt.y - h * 0.08;
        blade[n * 4 + 2] = pt.z;
        blade[n * 4 + 3] = h;
        look[n * 4] = (rand() - 0.5) * 0.5;
        look[n * 4 + 1] = h * (0.1 + rand() * 0.06);
        look[n * 4 + 2] = rand();
        look[n * 4 + 3] = rand() * 0.15;
        n++;
      }
      g.instanceCount = n;
      aBlade.needsUpdate = true;
      aLook.needsUpdate = true;
    },
    dispose() {
      g.dispose();
      material.dispose();
    },
  };
}

// A handful of butterflies wandering low over the meadow, behind the toys.
function makeButterflies(count, land) {
  // wings: x 0..1 out from the body, y -0.8..1 tail to head
  const pos = [];
  const uv = [];
  const side = [];
  const idx = [];
  const quad = (x0, x1, y0, y1, sd, flipU) => {
    const b = pos.length / 3;
    pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    const u0 = flipU ? 1 : 0;
    const u1 = flipU ? 0 : 1;
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    side.push(sd, sd, sd, sd);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad(-1, 0, -0.8, 1, -1, true);
  quad(0, 1, -0.8, 1, 1, false);
  quad(-0.08, 0.08, -0.5, 0.62, 0, false);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  const iPos = new Float32Array(count * 4);
  const iAng = new Float32Array(count * 4);
  const aPos = new THREE.InstancedBufferAttribute(iPos, 4).setUsage(THREE.DynamicDrawUsage);
  const aAng = new THREE.InstancedBufferAttribute(iAng, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iPos', aPos);
  g.setAttribute('iAng', aAng);
  g.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: { uSunColor: land.uSunColor, uSkyLight: land.uSkyLight },
    vertexShader: flyVertex,
    fragmentShader: flyFragment,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;

  const rand = mulberry32(99);
  const kinds = [0, 1, 2, 3, 0, 4, 2, 1];
  const flies = Array.from({ length: count }, (_, i) => ({
    kind: kinds[i % kinds.length],
    z: -1.6 - rand() * 2.4,
    fx: (i / count) * 2 - 1 + rand() * 0.2,
    fy: -0.9 + rand() * 0.3,
    vx: (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.35),
    seed: rand() * 100,
    phase: rand() * 6.28,
    rate: 13 + rand() * 5,
    glide: 0,
    size: 0.33 + rand() * 0.08,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    roll: 0,
    hw: 10,
    hh: 6,
  }));
  let placed = false;

  return {
    mesh,
    layout(view) {
      for (const f of flies) {
        const v = visibleAt(view.camera, view.dist, f.z);
        f.hw = v.halfW;
        f.hh = v.halfH;
        if (!placed) f.x = f.fx * v.halfW;
      }
      placed = true;
    },
    update(dt, t) {
      for (let i = 0; i < count; i++) {
        const f = flies[i];
        // flutter, with the odd short glide on raised wings
        f.glide -= dt;
        if (f.glide < -2 && Math.random() < dt * 0.4) f.glide = 0.3 + Math.random() * 0.4;
        const gliding = f.glide > 0;
        f.phase += dt * f.rate * (gliding ? 0 : 1);
        const flap = gliding ? 0.55 : 0.35 + 0.95 * Math.sin(f.phase);
        f.x += f.vx * dt;
        const lim = f.hw + 1;
        if (f.x > lim) f.x -= lim * 2;
        if (f.x < -lim) f.x += lim * 2;
        const s = t * 0.9 + f.seed;
        const x = f.x + Math.sin(s * 1.3) * 0.7 + Math.sin(s * 2.9) * 0.25;
        let y = (f.fy + 0.07 * Math.sin(s * 0.37)) * f.hh + Math.sin(s * 1.7 + 1) * 0.35 + Math.sin(s * 3.7) * 0.12;
        y += gliding ? 0 : Math.sin(f.phase) * 0.04;
        const vx = dt > 0 ? (x - f.px) / dt : 0;
        f.px = x;
        f.py = y;
        f.roll += (THREE.MathUtils.clamp(-vx * 0.35, -0.6, 0.6) - f.roll) * Math.min(1, dt * 4);
        iPos[i * 4] = x;
        iPos[i * 4 + 1] = y;
        iPos[i * 4 + 2] = f.z;
        iPos[i * 4 + 3] = f.size;
        iAng[i * 4] = flap;
        iAng[i * 4 + 1] = f.roll;
        iAng[i * 4 + 2] = 0.55;
        iAng[i * 4 + 3] = f.kind;
      }
      aPos.needsUpdate = true;
      aAng.needsUpdate = true;
    },
    dispose() {
      g.dispose();
      material.dispose();
    },
  };
}
