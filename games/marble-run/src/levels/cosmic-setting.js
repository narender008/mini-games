// Cosmic Observatory: the fourth marble run's world (reference picture 4). A
// round white-marble plinth trimmed in brass floats in deep space, with a
// glowing violet inlay round its top and a soft halo under it. Behind it a
// starry sky with blue, violet and rose nebula clouds, a cream ringed planet
// up to the left, a blue planet down to the right and a little rose moon.
// A brass telescope on a tripod peers up from the back right, cut crystals
// and moon rocks sit on the plinth, and a white marble dish with a brass rim
// holds the spare planet marbles at the front left.
//
// It should feel like a magical night, never a dark one: the sky is rich in
// colour, stars twinkle, a few sparkles drift round the run, and a warm key
// light (like a desk lamp in the observatory) keeps the marble and brass
// bright. The nebula is baked once on the GPU into an equirectangular
// texture; stars are points (crisp at any screen size, and they twinkle);
// planets are lit in their own small shaders. The whole sky plus some warm
// "studio" panels is captured into a PMREM so brass, chrome and glass have
// something bright and warm to reflect.
//
// Real scale in metres, plinth top at y = 0, camera looking from +z.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { REDUCED_MOTION } from '../config.js';
import { mergeGeometries } from '../geometry.js';

// ------------------------------------------------------------ layout

// The plinth: an ellipse (it reads as a round disc from the usual camera
// height), centred under the run.
const PLINTH = { x: -0.075, z: 0.0, rx: 0.62, rz: 0.39, t: 0.05 };
const SKY_R = 18;
// the key light: from the front left and above, like a lamp over the desk
const TO_KEY = new THREE.Vector3(-0.42, 0.82, 0.48).normalize();
// what may cast shadows (the run, its props and the bowl), with a margin
const CASTERS = new THREE.Box3(new THREE.Vector3(-0.72, 0, -0.34), new THREE.Vector3(0.6, 0.56, 0.42));
const BOWL = { x: -0.46, z: 0.215, inner: 0.062, rim: 0.034, floorY: 0.008 };
// where the far light (the "sun" of this little solar system) comes from,
// for the planets' own shading
const STAR_DIR = new THREE.Vector3(0.55, 0.35, 0.75).normalize();

const col = (hex) => new THREE.Color(hex);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ GLSL

const NOISE = /* glsl */ `
float h13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return s;
}
`;

// The nebula, baked into an equirectangular map (u: longitude, v: latitude).
// A broad band of cloud crosses the sky (like the Milky Way seen from a dark
// hill), coloured blue, violet and rose, with darker dust lanes through it
// and a soft glow along its heart. The empty sky is a deep blue, not black.
const NEBULA_FRAG = /* glsl */ `
varying vec2 vUv;
${NOISE}
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
  // the band's plane leans across the view, rising to the left
  vec3 bn = normalize(vec3(0.52, -0.78, 0.34));
  float warp = fbm(d * 2.1 + 3.0, 5) - 0.5;
  float across = dot(d, bn) + warp * 0.35;
  float band = exp(-across * across / 0.09);
  float core = exp(-across * across / 0.012);
  float n1 = fbm(d * 3.0 + vec3(warp * 1.5), 7);
  float n2 = fbm(d * 5.5 + 11.0, 6);
  float n3 = fbm(d * 1.4 + 23.0, 4);
  float cloud = smoothstep(0.32, 0.78, n1) * band;
  float wisps = smoothstep(0.45, 0.85, n2) * (0.35 + 0.65 * band);
  // dust lanes: thin dark ribbons along the band's heart
  float lane = 1.0 - 0.75 * smoothstep(0.52, 0.6, fbm(d * 7.0 + 5.0, 5)) * core;
  vec3 deep = mix(vec3(0.006, 0.009, 0.036), vec3(0.014, 0.014, 0.06), smoothstep(-0.6, 0.6, d.y));
  vec3 blue = vec3(0.05, 0.12, 0.55);
  vec3 violet = vec3(0.32, 0.1, 0.62);
  vec3 rose = vec3(0.6, 0.14, 0.42);
  vec3 teal = vec3(0.04, 0.3, 0.38);
  vec3 hue = mix(blue, violet, smoothstep(0.3, 0.7, n3));
  hue = mix(hue, rose, smoothstep(0.55, 0.8, n2) * 0.7);
  hue = mix(hue, teal, smoothstep(0.62, 0.85, fbm(d * 2.4 + 40.0, 4)) * 0.6);
  vec3 c = deep;
  c += hue * cloud * 0.8 * lane;
  c += mix(violet, blue, n2) * wisps * 0.2;
  // a few warm rose and gold glows in the clouds
  c += vec3(0.55, 0.25, 0.2) * smoothstep(0.62, 0.8, fbm(d * 3.3 + 70.0, 5)) * band * 0.35;
  c += vec3(0.5, 0.36, 0.55) * core * smoothstep(0.35, 0.7, n1) * 0.25 * lane;
  // a faint general glow so no part of the sky is flat black
  c += vec3(0.02, 0.02, 0.07) * band;
  gl_FragColor = vec4(c, 1.0);
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}
`;

const SKY_FRAG = /* glsl */ `
uniform sampler2D tNeb;
uniform float uGain;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  gl_FragColor = vec4(textureLod(tNeb, uv, 0.0).rgb * uGain, 1.0);
}
`;

// Stars: round points of light, a few big and bright enough to bloom, all
// twinkling gently at their own pace.
const STAR_VERT = /* glsl */ `
attribute vec4 aStar; // size (px), brightness, twinkle rate, phase
attribute vec3 aCol;
uniform float uTime;
uniform float uPx;
varying vec3 vCol;
void main() {
  float tw = 0.72 + 0.28 * sin(uTime * aStar.z + aStar.w) * sin(uTime * aStar.z * 0.37 + aStar.w * 2.1);
  vCol = aCol * aStar.y * tw;
  gl_PointSize = aStar.x * uPx;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 4.0) + 0.25 * exp(-r2 * 1.2);
  gl_FragColor = vec4(vCol, a);
}
`;

// A planet, lit by the far star in its own shader: soft terminator, bands
// or blotches from noise in its own space, and a glowing rim of atmosphere.
const PLANET_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
void main() {
  vObj = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const PLANET_FRAG = /* glsl */ `
uniform vec3 uL;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uAtmo;
uniform vec4 uK; // bands (0 = blotches), band warp, gain, ambient
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
${NOISE}
void main() {
  vec3 N = normalize(vN);
  float n = fbm(vObj * 3.0, 6);
  float t;
  if (uK.x > 0.0) {
    float y = vObj.y + (n - 0.5) * uK.y;
    t = 0.5 + 0.5 * sin(y * uK.x + 1.3 * sin(y * uK.x * 0.37));
  } else {
    t = smoothstep(0.35, 0.7, fbm(vObj * 2.2 + 4.0, 6));
  }
  vec3 c = mix(uA, uB, t);
  c = mix(c, uC, smoothstep(0.55, 0.8, n) * 0.6);
  float ndl = dot(N, uL);
  float lit = smoothstep(-0.12, 0.55, ndl);
  float nv = clamp(dot(N, normalize(vV)), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0);
  vec3 o = c * (lit * uK.z + uK.w);
  o += uAtmo * rim * (0.25 + 1.2 * smoothstep(-0.3, 0.5, ndl));
  gl_FragColor = vec4(o, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform vec2 uR; // inner, outer radius
uniform float uGain;
varying vec3 vObj;
varying vec2 vUv2;
${NOISE}
void main() {
  float r = (length(vUv2) - uR.x) / (uR.y - uR.x);
  float bands = 0.55 + 0.45 * sin(r * 70.0 + 3.0 * sin(r * 13.0));
  bands *= 0.6 + 0.4 * vnoise(vec3(r * 40.0, 0.0, 0.0));
  float edge = smoothstep(0.0, 0.06, r) * (1.0 - smoothstep(0.9, 1.0, r));
  float gap = 1.0 - 0.85 * exp(-pow((r - 0.62) / 0.025, 2.0));
  float a = edge * gap * bands;
  gl_FragColor = vec4(uCol * a * uGain, a * 0.8);
}
`;

const RING_VERT = /* glsl */ `
varying vec3 vObj;
varying vec2 vUv2;
void main() {
  vObj = position;
  vUv2 = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A soft glow card (halo under the plinth, glow round the tower's foot).
const HALO_FRAG = /* glsl */ `
uniform vec3 uCol;
varying vec2 vUv;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  float a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(uCol, a);
}
`;

const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ------------------------------------------------------------ kit

class Kit {
  constructor(renderer, quality, mats) {
    this.renderer = renderer;
    this.quality = quality;
    this.tier = quality.tier || 'high';
    this.mats = mats;
    this.bin = [];
    this.group = new THREE.Group();
    this.group.name = 'cosmic-setting';
    this.animators = [];
    this.time = { value: 0 };
  }

  keep(x) {
    if (x && x.dispose) this.bin.push(x);
    return x;
  }

  // shared library materials are not ours to dispose: only keep our own
  mesh(geo, mat, { cast = false, receive = false, parent = this.group, own = false } = {}) {
    this.keep(geo);
    if (own) this.keep(mat);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  shader(opts) {
    return this.keep(new THREE.ShaderMaterial(opts));
  }
}

function bake(K, { width, height, fragment }) {
  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
  rt.texture.wrapS = THREE.RepeatWrapping;
  rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;
  const mat = new THREE.ShaderMaterial({ vertexShader: UV_VERT.replace('projectionMatrix * modelViewMatrix * vec4(position, 1.0)', 'vec4(position.xy, 0.0, 1.0)'), fragmentShader: fragment });
  const quad = new FullScreenQuad(mat);
  const prev = K.renderer.getRenderTarget();
  K.renderer.setRenderTarget(rt);
  quad.render(K.renderer);
  K.renderer.setRenderTarget(prev);
  quad.dispose();
  mat.dispose();
  K.keep(rt);
  return rt.texture;
}

// ------------------------------------------------------------ sky

function buildSky(K) {
  const hi = K.tier === 'high';
  const neb = bake(K, { width: hi ? 2048 : 1024, height: hi ? 1024 : 512, fragment: NEBULA_FRAG });
  const skyMat = K.shader({
    uniforms: { tNeb: { value: neb }, uGain: { value: 1.0 } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = K.mesh(new THREE.SphereGeometry(SKY_R, 48, 24), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.name = 'sky';

  // stars: many small ones, gathered towards the nebula's band, a few big
  const r = rng(7);
  const n = hi ? 3600 : K.tier === 'medium' ? 2400 : 1400;
  const pos = new Float32Array(n * 3);
  const star = new Float32Array(n * 4);
  const cols = new Float32Array(n * 3);
  const bn = new THREE.Vector3(0.52, -0.78, 0.34).normalize();
  const palette = [col('#ffffff'), col('#cfe0ff'), col('#aac4ff'), col('#fff0d2'), col('#ffd9a8'), col('#ffc6ea'), col('#ffb870'), col('#ffcf8a')];
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // rejection-sample directions, keeping more near the band
    for (;;) {
      v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      const l = v.length();
      if (l < 0.05 || l > 1) continue;
      v.divideScalar(l);
      const a = v.dot(bn);
      if (r() < 0.35 + 0.65 * Math.exp((-a * a) / 0.08)) break;
    }
    v.multiplyScalar(SKY_R * 0.97);
    pos.set([v.x, v.y, v.z], i * 3);
    const big = r();
    const size = big > 0.99 ? 5 + r() * 4 : big > 0.92 ? 2.6 + r() * 1.6 : 1.5 + r() * 1.2;
    const bright = big > 0.99 ? 2.2 + r() * 1.6 : big > 0.92 ? 1.1 + r() * 0.8 : 0.45 + r() * 0.7;
    star.set([size, bright, 0.6 + r() * 2.4, r() * 6.283], i * 4);
    const c = palette[Math.floor(r() * palette.length)];
    cols.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aStar', new THREE.BufferAttribute(star, 4));
  geo.setAttribute('aCol', new THREE.BufferAttribute(cols, 3));
  const starMat = K.shader({
    uniforms: { uTime: K.time, uPx: { value: Math.min(2, window.devicePixelRatio || 1) } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(K.keep(geo), starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  K.group.add(stars);
  return { sky, skyMat, stars };
}

function planetMat(K, { a, b, c, atmo, bands, warp, gain = 1, amb = 0.03 }) {
  return K.shader({
    uniforms: {
      uL: { value: STAR_DIR.clone() },
      uA: { value: col(a) },
      uB: { value: col(b) },
      uC: { value: col(c) },
      uAtmo: { value: col(atmo).multiplyScalar(1.4) },
      uK: { value: new THREE.Vector4(bands, warp, gain, amb) },
    },
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
  });
}

function buildPlanets(K) {
  const seg = K.tier === 'low' ? 32 : 64;
  // directions from the default camera (az, el in degrees), so they sit in
  // the picture: the view looks down 25 degrees, so the sky it sees lies
  // mostly just below the horizon
  const eye = new THREE.Vector3(-0.07, 0.75, 1.21);
  const put = (az, el, dist) => {
    const a = THREE.MathUtils.degToRad(az);
    const e = THREE.MathUtils.degToRad(el);
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(dist).add(eye);
  };
  // the ringed planet, up to the left: cream and caramel bands
  const ringed = new THREE.Group();
  ringed.position.copy(put(-21, -12, 14));
  const body = K.mesh(new THREE.SphereGeometry(0.85, seg, seg / 2), planetMat(K, { a: '#e9c99a', b: '#b98a66', c: '#f5e6cc', atmo: '#ffd9b0', bands: 22, warp: 0.25, gain: 1.6 }), { parent: ringed });
  body.rotation.z = 0.35;
  const ringGeo = new THREE.RingGeometry(1.15, 2.0, 128, 1);
  const ringMat = K.shader({
    uniforms: { uCol: { value: col('#e8d2b0') }, uR: { value: new THREE.Vector2(1.15, 2.0) }, uGain: { value: 1.3 } },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const ring = K.mesh(ringGeo, ringMat, { parent: ringed });
  ring.rotation.set(-1.25, 0.2, 0.35);
  ringed.lookAt(0, 0, 0);
  ring.renderOrder = -8;
  K.group.add(ringed);
  // the blue planet, low to the right, half hidden below the plinth
  const blue = K.mesh(new THREE.SphereGeometry(1.0, seg, seg / 2), planetMat(K, { a: '#2d6fd6', b: '#6ec3f0', c: '#eaf6ff', atmo: '#6fb0ff', bands: 0, warp: 0, gain: 1.0, amb: 0.02 }));
  blue.position.copy(put(30, -19, 13));
  // a small rose moon, up to the right
  const moon = K.mesh(new THREE.SphereGeometry(0.28, seg, seg / 2), planetMat(K, { a: '#e6a6c4', b: '#b98ad8', c: '#ffe2f0', atmo: '#ffc2e8', bands: 0, warp: 0, gain: 1.4 }));
  moon.position.copy(put(19, -6, 13));
  for (const o of [body, ring, blue, moon]) o.frustumCulled = false;
  K.animators.push((dt) => {
    if (!REDUCED_MOTION.matches) body.rotation.y += dt * 0.02;
  });
}

// ------------------------------------------------------------ plinth

// The plinth's profile (radius factor, y): a polished top with a rounded
// edge, a brass band, and a wider step below.
// The marble's veins are sized for track pieces; the plinth is built at
// VEIN times its size and shrunk back, so its veins come out finer.
const VEIN = 2.2;
function ellipseLathe(pts, seg, sx, sz) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * VEIN, y * VEIN)), seg);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

function buildPlinth(K) {
  const M = K.mats;
  const seg = K.tier === 'low' ? 96 : 160;
  const { rx, rz } = PLINTH;
  const sz = rz / rx;
  const marble = M.marbleStone({ color: '#f3efea', veins: '#d2cbd2' });
  const brass = M.brass({ polish: 0.85, age: 0.15 });
  const g = new THREE.Group();
  g.position.set(PLINTH.x, 0, PLINTH.z);
  g.scale.setScalar(1 / VEIN);
  // kept apart when static meshes are merged: its veins rely on its scale
  g.userData.noMerge = true;
  K.group.add(g);
  // top slab: flat top at y = 0, rounded front edge down to the brass band
  const top = [[0, -0.026], [rx - 0.004, -0.026], [rx, -0.022], [rx + 0.001, -0.014], [rx, -0.006], [rx - 0.004, -0.0015], [rx - 0.012, 0], [0, 0]];
  K.mesh(ellipseLathe(top, seg, 1, sz), marble, { receive: true, parent: g });
  // brass band
  const band = [[rx - 0.01, -0.039], [rx + 0.004, -0.039], [rx + 0.006, -0.036], [rx + 0.006, -0.028], [rx + 0.004, -0.025], [rx - 0.01, -0.025]];
  K.mesh(ellipseLathe(band, seg, 1, sz), brass, { receive: true, parent: g });
  // the lower step, a little wider, and its underside
  const step = [[0, -0.084], [rx + 0.02, -0.084], [rx + 0.03, -0.078], [rx + 0.033, -0.05], [rx + 0.031, -0.041], [rx + 0.025, -0.038], [0, -0.038]];
  K.mesh(ellipseLathe(step, seg, 1, sz), marble, { receive: true, parent: g });
  // a thin brass line round the step's top edge
  const line = [[rx + 0.021, -0.0385], [rx + 0.028, -0.0385], [rx + 0.0285, -0.037], [rx + 0.027, -0.0362], [rx + 0.021, -0.0362]];
  K.mesh(ellipseLathe(line, seg, 1, sz), brass, { parent: g });
  // the glowing inlay: a violet ring set into the top near the edge, and a
  // second fainter blue one inside it
  const glowMat = (c, k) => K.keep(new THREE.MeshBasicMaterial({ color: col(c).multiplyScalar(k) }));
  const inlay = (r0, w, mat) => {
    const geo = new THREE.RingGeometry((r0 - w) * VEIN, r0 * VEIN, seg, 1);
    geo.rotateX(-Math.PI / 2);
    geo.scale(1, 1, sz);
    const m = K.mesh(geo, mat, { parent: g });
    m.position.y = 0.0004 * VEIN;
    return m;
  };
  inlay(rx - 0.03, 0.005, glowMat('#9b7bff', 4.5));
  inlay(rx - 0.046, 0.0022, glowMat('#6fb8ff', 3.5));
  // a soft violet halo under the plinth, as if it floats on its own light
  const halo = K.mesh(new THREE.PlaneGeometry(1, 1), K.shader({
    uniforms: { uCol: { value: col('#7a5cff').multiplyScalar(0.55) } },
    vertexShader: UV_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), { parent: g });
  halo.rotation.x = -Math.PI / 2;
  halo.scale.set(rx * 3.2 * VEIN, rz * 3.2 * VEIN, 1);
  halo.position.y = -0.09 * VEIN;
  halo.renderOrder = -5;
  return { marble, brass };
}

// ------------------------------------------------------------ the bowl

// A white marble dish with a brass rim and a brass spiral set into its
// floor, like the spiral catch in the picture.
function buildBowl(K) {
  const M = K.mats;
  const g = new THREE.Group();
  g.position.set(BOWL.x, 0, BOWL.z);
  K.group.add(g);
  const R = BOWL.inner;
  const pts = [
    [0, 0], [R + 0.006, 0], [R + 0.01, 0.002], [R + 0.013, 0.01], [R + 0.014, BOWL.rim - 0.004], [R + 0.012, BOWL.rim],
    [R + 0.004, BOWL.rim], [R + 0.001, BOWL.rim - 0.004], [R - 0.001, 0.02], [R - 0.008, BOWL.floorY + 0.004], [R - 0.02, BOWL.floorY], [0, BOWL.floorY],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const dish = K.mesh(new THREE.LatheGeometry(pts, 72), M.marbleStone({ color: '#f4f1ee', veins: '#a49eaa' }), { cast: true, receive: true, parent: g });
  dish.geometry.computeVertexNormals();
  const brass = M.brass({ polish: 0.9, age: 0.1 });
  const rim = K.mesh(new THREE.TorusGeometry(R + 0.008, 0.0035, 12, 72), brass, { cast: true, receive: true, parent: g });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BOWL.rim + 0.001;
  // spiral inlay on the floor
  const sp = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    const a = t * Math.PI * 2 * 2.5;
    const rr = 0.006 + t * (R - 0.024);
    sp.push(new THREE.Vector3(Math.cos(a) * rr, BOWL.floorY + 0.0004, Math.sin(a) * rr));
  }
  K.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 200, 0.0012, 6, false), brass, { receive: true, parent: g });
  // three little brass feet
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const foot = K.mesh(new THREE.SphereGeometry(0.006, 12, 8), brass, { parent: g });
    foot.position.set(Math.cos(a) * (R - 0.004), 0.001, Math.sin(a) * (R - 0.004));
    foot.scale.y = 0.4;
  }
  return g;
}

// ------------------------------------------------------------ props

// a lumpy moon rock
function rockGeometry(r, seed, detail = 3) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const rand = rng(seed);
  const bumps = Array.from({ length: 7 }, () => [new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(), 0.08 + rand() * 0.18, 0.4 + rand() * 0.5]);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let k = 1;
    for (const [d, amt, w] of bumps) k += amt * Math.max(0, n.dot(d) - (1 - w)) * (1 / w) - amt * 0.2;
    v.multiplyScalar(k);
    v.y *= 0.7;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// a pointed hexagonal crystal, base at the origin
function crystalGeometry(r, h) {
  const g = new THREE.CylinderGeometry(r * 0.2, r, h, 6, 1, false);
  g.translate(0, h / 2, 0);
  const tip = new THREE.ConeGeometry(r * 0.2, r * 0.5, 6);
  tip.translate(0, h + r * 0.25, 0);
  const merged = mergeGeos([g, tip]);
  g.dispose();
  tip.dispose();
  return merged;
}

function mergeGeos(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    if (!geos.includes(g)) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}

function buildProps(K) {
  const M = K.mats;
  const rock = M.asteroid();
  // moon rocks on the plinth, away from where marbles run
  const rocks = [
    [-0.6, 0.04, 0.042, 1], [-0.58, 0.11, 0.024, 2], [0.3, 0.27, 0.036, 3], [0.37, 0.22, 0.02, 4], [-0.2, 0.3, 0.026, 5], [0.08, 0.31, 0.018, 6], [-0.3, -0.27, 0.03, 7],
  ];
  for (const [x, z, r, s] of rocks) {
    const m = K.mesh(rockGeometry(r, s, K.tier === 'low' ? 2 : 3), rock, { cast: true, receive: true });
    m.position.set(x, r * 0.35, z);
    m.rotation.y = s * 1.7;
  }
  // a cluster of glowing crystals at the back left
  const cr = M.crystal({ tint: '#c8b4ff', glow: 0.6 });
  const cb = M.crystal({ tint: '#a8dcff', glow: 0.45 });
  const cluster = [
    [-0.58, -0.16, 0.026, 0.13, 0.1, 0.0, cr], [-0.545, -0.18, 0.018, 0.09, -0.3, 0.35, cb], [-0.615, -0.13, 0.015, 0.075, 0.4, -0.4, cb], [-0.565, -0.12, 0.012, 0.055, -0.5, -0.2, cr],
    [0.44, 0.12, 0.02, 0.1, 0.2, 0.1, cb], [0.465, 0.15, 0.014, 0.065, -0.4, 0.3, cr], [0.42, 0.155, 0.011, 0.05, 0.3, -0.4, cr],
  ];
  for (const [x, z, r, h, rx, rz, mat] of cluster) {
    const m = K.mesh(crystalGeometry(r, h), mat);
    m.position.set(x, 0, z);
    m.rotation.set(rx * 0.6, (x + z) * 9, rz * 0.6);
  }
  buildTelescope(K);
}

// A brass telescope on a tripod at the back right, looking up at the sky.
function buildTelescope(K) {
  const M = K.mats;
  const brass = M.brass({ polish: 0.9, age: 0.2 });
  const chrome = M.chrome();
  const dark = M.brass({ polish: 0.5, age: 0.7 });
  const g = new THREE.Group();
  g.position.set(0.42, 0, -0.2);
  K.group.add(g);
  const head = new THREE.Vector3(0, 0.2, 0);
  // tripod legs
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const foot = new THREE.Vector3(Math.cos(a) * 0.09, 0, Math.sin(a) * 0.09);
    const len = foot.distanceTo(head);
    const leg = K.mesh(new THREE.CylinderGeometry(0.0035, 0.0045, len, 12), brass, { cast: true, receive: true, parent: g });
    leg.position.copy(foot).add(head).multiplyScalar(0.5);
    leg.lookAt(head.clone().add(g.position));
    leg.rotateX(Math.PI / 2);
    const shoe = K.mesh(new THREE.SphereGeometry(0.006, 12, 8), dark, { parent: g });
    shoe.position.copy(foot);
    shoe.scale.y = 0.5;
  }
  const hub = K.mesh(new THREE.SphereGeometry(0.011, 16, 12), brass, { cast: true, parent: g });
  hub.position.copy(head);
  // the tube, tilted up towards the ringed planet
  const tube = new THREE.Group();
  tube.position.copy(head).add(new THREE.Vector3(0, 0.012, 0));
  g.add(tube);
  const L = 0.24;
  const body = K.mesh(new THREE.CylinderGeometry(0.017, 0.012, L, 32), brass, { cast: true, receive: true, parent: tube });
  body.rotation.z = Math.PI / 2;
  for (const [x, r] of [[L * 0.48, 0.019], [L * 0.12, 0.016], [-L * 0.3, 0.0145]]) {
    const ringM = K.mesh(new THREE.TorusGeometry(r, 0.0018, 8, 32), dark, { parent: tube });
    ringM.position.x = x;
    ringM.rotation.y = Math.PI / 2;
  }
  const lens = K.mesh(new THREE.CircleGeometry(0.016, 32), M.glowGlass({ color: '#8fb8ff', glow: 0.35 }), { parent: tube });
  lens.position.x = L / 2 + 0.0005;
  lens.rotation.y = Math.PI / 2;
  const eye = K.mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.05, 16), chrome, { cast: true, parent: tube });
  eye.rotation.z = Math.PI / 2;
  eye.position.x = -L / 2 - 0.022;
  tube.rotation.set(0, 2.5, 0.62);
}

// Bake static meshes that share a material into one mesh each: a draw call
// per material rather than per rock, leg and ring.
function mergeStatic(K) {
  K.group.updateMatrixWorld(true);
  const groups = new Map();
  K.group.traverse((o) => {
    if (!o.isMesh) return;
    for (let a = o; a; a = a.parent) if (a.userData.noMerge || a.userData.dynamic) return;
    const mat = o.material;
    if (!mat.isMeshStandardMaterial) return;
    const key = `${mat.uuid}|${o.castShadow}|${o.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(o.matrixWorld);
      return g;
    });
    K.mesh(mergeGeometries(geos), list[0].material, { cast: list[0].castShadow, receive: list[0].receiveShadow });
    for (const o of list) o.removeFromParent();
  }
}

// Glass does not write depth; a depth-only twin drawn last lets the lens
// pass see how far away it is (see the level's theme).
function depthProxies(K) {
  const mat = K.keep(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true }));
  const glass = [];
  K.group.traverse((o) => {
    if (o.isMesh && o.material.transparent && o.material.depthWrite === false && o.material.isMeshPhysicalMaterial && !o.userData.depthProxy) glass.push(o);
  });
  for (const o of glass) {
    const d = new THREE.Mesh(o.geometry, mat);
    d.userData.depthProxy = true;
    d.renderOrder = 50;
    o.add(d);
  }
}

// ------------------------------------------------------------ sparkles

// A few motes of starlight drifting slowly round the run.
function buildSparkles(K) {
  const n = K.tier === 'high' ? 140 : K.tier === 'medium' ? 90 : 50;
  const r = rng(99);
  const pos = new Float32Array(n * 3);
  const star = new Float32Array(n * 4);
  const cols = new Float32Array(n * 3);
  const palette = [col('#cfe0ff'), col('#ffe6b0'), col('#e6c8ff'), col('#b8f0ff')];
  for (let i = 0; i < n; i++) {
    pos.set([PLINTH.x + (r() * 2 - 1) * 0.75, 0.03 + r() * 0.55, PLINTH.z + (r() * 2 - 1) * 0.5], i * 3);
    star.set([1.6 + r() * 2.2, 0.8 + r() * 1.6, 1.5 + r() * 3, r() * 6.283], i * 4);
    const c = palette[i % palette.length];
    cols.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aStar', new THREE.BufferAttribute(star, 4));
  geo.setAttribute('aCol', new THREE.BufferAttribute(cols, 3));
  const mat = K.shader({
    uniforms: { uTime: K.time, uPx: { value: Math.min(2, window.devicePixelRatio || 1) } },
    vertexShader: STAR_VERT.replace('vec4(position, 1.0)', 'vec4(position + 0.012 * vec3(sin(uTime * 0.3 + aStar.w), sin(uTime * 0.23 + aStar.w * 1.7), cos(uTime * 0.27 + aStar.w)), 1.0)'),
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(K.keep(geo), mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  K.group.add(pts);
}

// ------------------------------------------------------------ lights

function buildLights(K) {
  const key = new THREE.DirectionalLight(col('#ffe6cc'), 4.4);
  key.name = 'sun';
  K.group.add(key, key.target);
  const q = K.quality;
  key.castShadow = !!q.shadows;
  key.shadow.mapSize.set(q.shadowSize || 2048, q.shadowSize || 2048);
  key.shadow.bias = -0.00008;
  key.shadow.normalBias = 0.0012;
  key.shadow.radius = 3;
  // fit the orthographic shadow camera round the run as seen from the light
  const dist = 3;
  const center = CASTERS.getCenter(new THREE.Vector3());
  const basis = new THREE.Matrix4().lookAt(TO_KEY, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const inv = basis.clone().invert();
  const lo = new THREE.Vector2(Infinity, Infinity);
  const hi = new THREE.Vector2(-Infinity, -Infinity);
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? CASTERS.max.x : CASTERS.min.x, i & 2 ? CASTERS.max.y : CASTERS.min.y, i & 4 ? CASTERS.max.z : CASTERS.min.z).sub(center).applyMatrix4(inv);
    lo.min(new THREE.Vector2(c.x, c.y));
    hi.max(new THREE.Vector2(c.x, c.y));
  }
  const off = new THREE.Vector3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0).applyMatrix4(basis);
  const aim = center.clone().add(off);
  key.target.position.copy(aim);
  key.position.copy(aim).addScaledVector(TO_KEY, dist);
  const cam = key.shadow.camera;
  const hw = (hi.x - lo.x) / 2 + 0.02;
  const hh = (hi.y - lo.y) / 2 + 0.02;
  cam.left = -hw;
  cam.right = hw;
  cam.top = hh;
  cam.bottom = -hh;
  cam.near = 0.5;
  cam.far = dist + 1.5;
  cam.updateProjectionMatrix();
  key.updateMatrixWorld();
  key.target.updateMatrixWorld();
  // a cool rim from behind, so brass edges and glass catch starlight
  // (steep, so its glint on the polished plinth falls behind the run)
  const rim = new THREE.DirectionalLight(col('#aabaff'), 1.1);
  rim.position.set(0.35, 1.7, -1.0);
  K.group.add(rim);
  // space above, the lit plinth below
  const hemi = new THREE.HemisphereLight(col('#8e9bff'), col('#b9a4c8'), 0.55);
  K.group.add(hemi);
  // the tower's glow, spilling violet-blue light onto the marble round it
  const towerGlow = new THREE.PointLight(col('#8f7dff'), 0.12, 0.8, 2);
  towerGlow.position.set(0.0, 0.06, -0.08);
  K.group.add(towerGlow);
  return key;
}

// ------------------------------------------------------------ environment

// Capture the sky plus warm studio panels (and the plinth's white below)
// into a PMREM: brass and glass then show warm highlights and the violet
// sky, rather than black.
async function captureEnvironment(K, skyMat) {
  const size = K.quality.envSize || 256;
  const pmrem = new THREE.PMREMGenerator(K.renderer);
  const scene = new THREE.Scene();
  const own = [];
  const add = (geo, mat) => {
    own.push(geo, mat);
    const m = new THREE.Mesh(geo, mat);
    scene.add(m);
    return m;
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16), skyMat);
  own.push(sky.geometry);
  scene.add(sky);
  const panel = (c, k, w, h, pos) => {
    const m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(pos);
    m.lookAt(0, 0.2, 0);
    return m;
  };
  // the key lamp's big warm softbox, a smaller one to the right, a violet
  // glow behind and a cool one high above
  panel('#ffe4c0', 6, 2.2, 1.4, TO_KEY.clone().multiplyScalar(3));
  panel('#ffd7a8', 3, 1.2, 1.0, new THREE.Vector3(2.6, 1.2, 1.2));
  panel('#9a82ff', 2.2, 3, 1.2, new THREE.Vector3(0, 0.6, -3));
  panel('#b8c8ff', 1.5, 2.5, 2.5, new THREE.Vector3(0, 3.2, 0.2));
  // warm fill in front, low, so brass facing the camera glows
  panel('#ffe2b8', 2.6, 3.4, 1.0, new THREE.Vector3(0.3, 0.3, 3.0));
  panel('#ffd9b0', 1.6, 2.0, 1.0, new THREE.Vector3(-2.8, 0.2, 1.4));
  // the plinth below: lit white marble
  const floor = add(new THREE.CircleGeometry(1.4, 48), new THREE.MeshBasicMaterial({ color: col('#efe4d6').multiplyScalar(1.3) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  const rt = pmrem.fromScene(scene, 0.02, 0.05, 30, { size, position: new THREE.Vector3(-0.05, 0.2, 0.05) });
  pmrem.dispose();
  for (const o of own) if (o !== skyMat) o.dispose();
  K.keep(rt);
  return rt;
}

// ------------------------------------------------------------ entry

export async function createCosmicSetting({ renderer, quality, mats }) {
  let M = mats;
  if (!M) {
    const { Materials } = await import('../materials.js');
    M = new Materials({ renderer, quality });
  }
  const K = new Kit(renderer, quality, M);
  const { skyMat } = buildSky(K);
  buildPlanets(K);
  buildPlinth(K);
  const bowl = buildBowl(K);
  buildProps(K);
  mergeStatic(K);
  if (quality.dof !== false || quality.ao !== false) depthProxies(K);
  buildSparkles(K);
  const sun = buildLights(K);
  const env = await captureEnvironment(K, skyMat);
  return {
    group: K.group,
    environment: env.texture,
    environmentIntensity: 0.8,
    background: null,
    // a little under-exposed, so the white marble keeps its veins and the
    // glows and the deep sky carry the picture
    exposure: 0.78,
    bloom: { strength: 0.32, threshold: 1.8, radius: 0.5 },
    grade: {
      white: [1.02, 1.0, 0.99],
      power: 1.3,
      lookSaturation: 1.3,
      saturation: 1.1,
      contrast: 0.12,
      shadowTint: [0.004, 0.0, 0.016],
      highTint: [0.006, 0.003, -0.004],
      vignette: 0.3,
      grain: 0.018,
      fringe: 0.004,
    },
    sun,
    bowl: { position: new THREE.Vector3(BOWL.x, 0, BOWL.z), innerRadius: BOWL.inner, rimHeight: BOWL.rim, floorY: BOWL.floorY, object: bowl },
    camera: {
      target: new THREE.Vector3(-0.07, 0.18, 0.0),
      distance: 1.24,
      azimuth: 0,
      elevation: THREE.MathUtils.degToRad(25),
      fov: 34,
    },
    focus: new THREE.Vector3(-0.06, 0.16, 0.0),
    update(dt, time) {
      K.time.value = REDUCED_MOTION.matches ? 0 : time;
      for (const a of K.animators) a(dt, time);
    },
    dispose() {
      K.group.removeFromParent();
      for (const x of K.bin) x.dispose?.();
      K.bin.length = 0;
      if (sun.shadow.map) sun.shadow.dispose();
    },
  };
}
