// Crystal Night: where the glowing glass run stands (reference picture 2).
// A soft-edged white glazed ceramic base, like a cloud, stands on chrome
// feet over a dark glossy floor; warm lamps under it throw pools of light
// on the floor, blue mist drifts round its foot and clusters of glowing
// crystals grow on it. Behind, a deep blue night with a soft nebula, a
// field of twinkling stars and a few big out-of-focus fairy lights.
//
// Everything is real scale in metres with the base top at y = 0. The sky
// is baked once on the GPU into an equirectangular texture that is both the
// background and, with a few soft light panels, the scene the PMREM
// environment is captured from, so glass, gold and glaze reflect a night
// sky with a big cool moonlit softbox above and a warm one to the right.
// A cool "moon" DirectionalLight casts the shadows; a warm key from the
// front right, a blue rim from behind and a hemisphere light whose ground
// colour is lamp-warm (so the base's underside glows amber) fill in.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { REDUCED_MOTION } from '../config.js';

// ------------------------------------------------------------ layout

// The base's footprint: a rounded superellipse with a gently lobed, cloud-
// like edge (see baseOutline), top at y = 0, soft bulging rim.
const BASE = { cx: -0.1, cz: 0.085, a: 0.56, b: 0.265, n: 3.6 };
const BASE_T = 0.052; // thickness
const FLOOR_Y = -0.095;
const FEET = [
  [-0.55, -0.06],
  [-0.5, 0.25],
  [0.3, -0.1],
  [0.33, 0.24],
  [-0.12, -0.13],
  [-0.1, 0.3],
];
const BOWL = { x: -0.5, z: 0.265, inner: 0.058, rim: 0.034, floorY: 0.011 };
// The volume the run may occupy (plus margin): the moon's shadow map covers it.
const CASTERS = new THREE.Box3(new THREE.Vector3(-0.68, -0.06, -0.2), new THREE.Vector3(0.48, 0.58, 0.37));
// The moon: high, from the front left, so shadows fall back and to the
// right, away from the viewer.
const TO_MOON = new THREE.Vector3(-0.42, 0.84, 0.34).normalize();
const FOG = new THREE.Color().setRGB(0.0045, 0.009, 0.032);

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

// Point on the base's edge at angle th (radians round y from +x).
function baseOutline(th) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const e = 2 / BASE.n;
  const lobe = 1 + 0.045 * Math.sin(6 * th + 0.7) + 0.025 * Math.sin(11 * th + 2.1) + 0.02 * Math.sin(3 * th - 0.4);
  return [BASE.cx + BASE.a * Math.sign(c) * Math.pow(Math.abs(c), e) * lobe, BASE.cz + BASE.b * Math.sign(s) * Math.pow(Math.abs(s), e) * lobe];
}

// ------------------------------------------------------------ GPU bakes

const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p, vec2 per) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(mod(i, per));
  float b = hash12(mod(i + vec2(1.0, 0.0), per));
  float c = hash12(mod(i + vec2(0.0, 1.0), per));
  float d = hash12(mod(i + vec2(1.0, 1.0), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, vec2 per) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  return s / 0.96875;
}
`;

// The night sky as an equirectangular map (three's convention: u from
// atan(z, x), v from asin(y)). Linear HDR values.
const SKY_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float phi = (vUv.x - 0.5) * 6.2831853;
  float th = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(phi) * cos(th), sin(th), sin(phi) * cos(th));
  float y = d.y;
  // deep navy overhead, a soft blue glow along the horizon
  vec3 zen = vec3(0.0016, 0.003, 0.011);
  vec3 mid = vec3(0.004, 0.008, 0.03);
  vec3 hor = vec3(0.0045, 0.009, 0.032);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, y));
  c = mix(c, zen, smoothstep(0.25, 0.9, y));
  c = mix(c, hor * 0.7, smoothstep(0.0, -0.2, y));
  // a faint violet and teal nebula drifting across the sky behind the run
  vec2 q = vec2(vUv.x * 8.0, vUv.y * 4.0);
  float n = fbm(q + vec2(3.1, 1.7), vec2(8.0, 1e4));
  float m = fbm(q * 1.7 + vec2(n * 1.5, 0.3), vec2(8.0 * 1.7, 1e4) * 2.0);
  float band = exp(-pow((y - 0.18 - 0.1 * sin(phi * 1.3)) / 0.22, 2.0));
  c += vec3(0.03, 0.012, 0.06) * smoothstep(0.45, 0.85, m) * band;
  c += vec3(0.0, 0.02, 0.035) * smoothstep(0.55, 0.9, n) * band * 0.7;
  gl_FragColor = vec4(c, 1.0);
}`;

// A soft puff of mist: fbm inside a round falloff, in the alpha channel.
const MIST_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float n = fbm(vUv * 5.0 + 7.3, vec2(5.0, 5.0) * 1e3);
  float n2 = fbm(vUv * 11.0 + n * 2.0, vec2(11.0) * 1e3);
  float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.55) * (0.45 + 0.75 * n2);
  gl_FragColor = vec4(1.0, 1.0, 1.0, clamp(a, 0.0, 1.0));
}`;

function bake(K, { width, height = width, fragment, repeat = false, type = THREE.HalfFloatType }) {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    type,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  const mat = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: NOISE + fragment, depthTest: false, depthWrite: false });
  const quad = new FullScreenQuad(mat);
  const r = K.renderer;
  const prev = r.getRenderTarget();
  r.setRenderTarget(rt);
  quad.render(r);
  r.setRenderTarget(prev);
  quad.dispose();
  mat.dispose();
  K.keep(rt);
  return rt.texture;
}

// ------------------------------------------------------------ the kit

class Kit {
  constructor(renderer, quality, mats) {
    this.renderer = renderer;
    this.quality = quality;
    this.mats = mats;
    this.tier = quality.tier || 'high';
    this.bin = [];
    this.group = new THREE.Group();
    this.group.name = 'crystal-setting';
    this.animators = [];
    this.uniforms = { uTime: { value: 0 }, uScale: { value: 1000 } };
  }

  keep(x) {
    if (x && x.dispose) this.bin.push(x);
    return x;
  }

  mesh(geo, mat, { cast = false, receive = false, parent = this.group, own = true } = {}) {
    this.keep(geo);
    if (own) this.keep(mat);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }
}

// Joins non-indexed geometries (position, normal, optional uv) into one.
function merge(list0) {
  const list = list0.map((g) => {
    if (!g.index) return g;
    const f = g.toNonIndexed();
    g.dispose();
    return f;
  });
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// ------------------------------------------------------------ the base

// The base: a flat top, a soft bulging rim that tucks under, a flat
// underside. Built ring by ring from the outline, offset along its normal.
function baseGeometry() {
  const N = 220;
  // (outward offset, height) round the rim, from the top to the underside
  const prof = [
    [-0.05, 0],
    [0, 0],
    [0.006, -0.0012],
    [0.011, -0.005],
    [0.0142, -0.011],
    [0.0158, -0.019],
    [0.0152, -0.028],
    [0.0122, -0.036],
    [0.0065, -0.0435],
    [-0.003, -0.0485],
    [-0.018, -0.0512],
    [-0.045, -BASE_T],
  ];
  const outline = [];
  for (let k = 0; k < N; k++) outline.push(baseOutline((k / N) * Math.PI * 2));
  const normals = outline.map((p, k) => {
    const a = outline[(k - 1 + N) % N];
    const b = outline[(k + 1) % N];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    return [tz / l, -tx / l];
  });
  const M = prof.length;
  const pos = [];
  const idx = [];
  for (let i = 0; i < M; i++) {
    const [d, y] = prof[i];
    for (let k = 0; k < N; k++) pos.push(outline[k][0] + normals[k][0] * d, y, outline[k][1] + normals[k][1] * d);
  }
  for (let i = 0; i < M - 1; i++) {
    for (let k = 0; k < N; k++) {
      const a = i * N + k;
      const b = i * N + ((k + 1) % N);
      const c = a + N;
      const d = b + N;
      idx.push(a, b, c, b, d, c);
    }
  }
  // top and bottom caps: fans from the middle
  const top = pos.length / 3;
  pos.push(BASE.cx, 0, BASE.cz);
  const bot = pos.length / 3;
  pos.push(BASE.cx, -BASE_T, BASE.cz);
  for (let k = 0; k < N; k++) {
    idx.push(top, (k + 1) % N, k);
    const l = (M - 1) * N;
    idx.push(bot, l + k, l + ((k + 1) % N));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildBase(K) {
  const glaze = K.mats ? K.mats.ceramic({ color: '#fffdfa' }) : new THREE.MeshPhysicalMaterial({ color: col('#f2efe9'), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 });
  K.mesh(baseGeometry(), glaze, { receive: true, cast: true, own: !K.mats });
  // chrome feet with gold collars and warm lamps round their tops
  const chrome = K.mats ? K.mats.chrome() : new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.08 });
  const gold = K.mats ? K.mats.gold({ polish: 0.9 }) : new THREE.MeshStandardMaterial({ color: 0xffc860, metalness: 1, roughness: 0.2 });
  const lamp = K.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.3).multiplyScalar(3.2) }));
  const h = -BASE_T - FLOOR_Y;
  const legs = [];
  const collars = [];
  const lamps = [];
  for (const [x, z] of FEET) {
    const leg = new THREE.CylinderGeometry(0.024, 0.027, h, 32, 1, true);
    leg.translate(x, FLOOR_Y + h / 2, z);
    legs.push(leg);
    const shoe = new THREE.CylinderGeometry(0.029, 0.031, 0.008, 32);
    shoe.translate(x, FLOOR_Y + 0.004, z);
    collars.push(shoe);
    const ring = new THREE.TorusGeometry(0.0255, 0.0024, 8, 40);
    ring.rotateX(Math.PI / 2);
    ring.translate(x, FLOOR_Y + h * 0.62, z);
    collars.push(ring);
    const glow = new THREE.TorusGeometry(0.032, 0.0035, 8, 48);
    glow.rotateX(Math.PI / 2);
    glow.translate(x, -BASE_T - 0.002, z);
    lamps.push(glow);
  }
  K.mesh(merge(legs), chrome, { cast: true, own: !K.mats });
  K.mesh(merge(collars), gold, { own: !K.mats });
  K.mesh(merge(lamps), lamp);
}

// The floor: dark, glossy, fading into the fog. Pools of warm lamplight
// under the feet and a cool glow under the run are drawn on it additively.
function buildFloor(K) {
  const mat = new THREE.MeshPhysicalMaterial({ color: col('#0a1229'), roughness: 0.4, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.18, envMapIntensity: 0.45 });
  const floor = K.mesh(new THREE.CircleGeometry(12, 72), mat, { receive: true });
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  const pool = K.keep(
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying vec2 vUv; void main() { float r = length(vUv * 2.0 - 1.0); float a = exp(-r * r * 4.5) * (1.0 - smoothstep(0.85, 1.0, r)); gl_FragColor = vec4(uColor * a, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const geo = K.keep(new THREE.PlaneGeometry(1, 1));
  const warm = pool.clone();
  K.keep(warm);
  warm.uniforms.uColor.value.setRGB(1.0, 0.55, 0.22).multiplyScalar(0.9);
  for (const [x, z] of FEET) {
    const m = new THREE.Mesh(geo, warm);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, FLOOR_Y + 0.0015, z);
    m.scale.setScalar(0.34);
    m.renderOrder = 1;
    K.group.add(m);
  }
  pool.uniforms.uColor.value.setRGB(0.15, 0.55, 1.0).multiplyScalar(0.45);
  const under = new THREE.Mesh(geo, pool);
  under.rotation.x = -Math.PI / 2;
  under.position.set(BASE.cx, FLOOR_Y + 0.001, BASE.cz);
  under.scale.set(1.9, 1.2, 1);
  under.renderOrder = 1;
  K.group.add(under);
}

// ------------------------------------------------------------ the bowl

// A white glazed dish with a gold lip and a glowing cyan band inside.
function buildBowl(K) {
  const pts = [
    [0.0, 0.0], [0.036, 0.0], [0.039, 0.0015], [0.0405, 0.0045], [0.046, 0.008], [0.056, 0.0145], [0.0635, 0.0235],
    [0.0668, 0.032], [0.0667, 0.0365], [0.0655, 0.0392], [0.0632, 0.0398], [0.0608, 0.0393], [0.0595, 0.0376],
    [0.058, 0.0325], [0.053, 0.025], [0.044, 0.0186], [0.0315, 0.0139], [0.016, 0.0113], [0.0, 0.0106],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const glaze = K.mats ? K.mats.ceramic({ color: '#f6f3ee' }) : new THREE.MeshPhysicalMaterial({ color: 0xf2efe9, roughness: 0.35, clearcoat: 1 });
  const bowl = K.mesh(new THREE.LatheGeometry(pts, 64), glaze, { cast: true, receive: true, own: !K.mats });
  bowl.position.set(BOWL.x, 0, BOWL.z);
  const gold = K.mats ? K.mats.gold({ polish: 0.9 }) : new THREE.MeshStandardMaterial({ color: 0xffc860, metalness: 1, roughness: 0.2 });
  const lip = K.mesh(new THREE.TorusGeometry(0.0632, 0.0014, 8, 64), gold, { own: !K.mats });
  lip.rotation.x = Math.PI / 2;
  lip.position.set(BOWL.x, 0.0399, BOWL.z);
  const band = K.mesh(new THREE.TorusGeometry(0.0545, 0.0009, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.85, 1.0).multiplyScalar(1.8) }));
  band.rotation.x = Math.PI / 2;
  band.position.set(BOWL.x, 0.0262, BOWL.z);
  return bowl;
}

// ------------------------------------------------------------ crystals

// Clusters of hexagonal crystals with pointed tips, leaning out from a
// common root. Each tint's crystals are one mesh of cut crystal round one
// mesh of glowing core, so the whole garden costs a few draw calls.
const CLUSTERS = [
  { x: -0.58, z: -0.07, tint: '#b69cff', core: [0.55, 0.35, 1.0], size: 1.0, n: 7 },
  { x: 0.38, z: -0.08, tint: '#9fe8ff', core: [0.25, 0.8, 1.0], size: 0.9, n: 6 },
  { x: 0.39, z: 0.26, tint: '#ffb3e6', core: [1.0, 0.35, 0.75], size: 1.0, n: 7 },
  { x: 0.13, z: 0.3, tint: '#ffd9a0', core: [1.0, 0.6, 0.2], size: 0.6, n: 5 },
  { x: -0.3, z: 0.34, tint: '#b69cff', core: [0.55, 0.35, 1.0], size: 0.55, n: 4 },
  { x: -0.2, z: -0.13, tint: '#ffd9a0', core: [1.0, 0.6, 0.2], size: 0.7, n: 5 },
  { x: -0.62, z: 0.13, tint: '#9fe8ff', core: [0.25, 0.8, 1.0], size: 0.5, n: 4 },
];

function crystalGeo(r, h, out, core) {
  const k = core ? 0.55 : 1;
  const body = new THREE.CylinderGeometry(r * k, r * 1.08 * k, h * (core ? 0.85 : 1), 6, 1, true);
  body.translate(0, (h * (core ? 0.85 : 1)) / 2, 0);
  const tip = new THREE.ConeGeometry(r * k, r * 1.9 * k, 6, 1, true);
  tip.translate(0, h * (core ? 0.85 : 1) + r * 0.95 * k, 0);
  const g = merge([body, tip]);
  g.applyMatrix4(out);
  return g;
}

function buildCrystals(K) {
  const rand = rng(29);
  const byTint = new Map();
  for (const c of CLUSTERS) {
    const list = byTint.get(c.tint) || { shells: [], cores: [], core: c.core };
    byTint.set(c.tint, list);
    for (let i = 0; i < c.n; i++) {
      const lead = i === 0;
      const h = (lead ? 0.075 : 0.025 + rand() * 0.045) * c.size;
      const r = (lead ? 0.011 : 0.005 + rand() * 0.005) * c.size;
      const a = rand() * Math.PI * 2;
      const lean = lead ? 0.08 : 0.25 + rand() * 0.45;
      const off = lead ? 0 : (0.008 + rand() * 0.012) * c.size;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(c.x + Math.cos(a) * off, -0.004, c.z + Math.sin(a) * off),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * lean, rand() * 3, -Math.cos(a) * lean)),
        new THREE.Vector3(1, 1, 1),
      );
      list.shells.push(crystalGeo(r, h, m, false));
      list.cores.push(crystalGeo(r, h, m, true));
    }
  }
  const cores = [];
  for (const [tint, list] of byTint) {
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...list.core).multiplyScalar(1.7) });
    const cm = K.mesh(merge(list.cores), coreMat);
    cores.push(coreMat);
    const shell = K.mats ? K.mats.crystal({ tint, glow: 0.5 }) : new THREE.MeshPhysicalMaterial({ color: col(tint), transparent: true, opacity: 0.35, roughness: 0.05 });
    const sm = K.mesh(merge(list.shells), shell, { own: !K.mats });
    sm.renderOrder = 2;
    void cm;
  }
  // the cores breathe, very slowly and each at its own pace
  const base = cores.map((m) => m.color.clone());
  K.animators.push((dt, t) => {
    cores.forEach((m, i) => m.color.copy(base[i]).multiplyScalar(0.85 + 0.15 * Math.sin(t * (0.5 + i * 0.13) + i * 1.7)));
  });
}

// ------------------------------------------------------------ sky and air

// Twinkling stars on a far dome, and big soft fairy lights low round the
// horizon. Point sizes follow the drawing buffer, so they look the same on
// any screen.
function buildStars(K) {
  const count = { high: 900, medium: 600, low: 300 }[K.tier] || 600;
  const rand = rng(5);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const phi = rand() * Math.PI * 2;
    const y = 0.04 + Math.pow(rand(), 0.8) * 0.96;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(phi) * r * 16, y * 16, Math.sin(phi) * r * 16], i * 3);
    seed[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: K.uniforms,
    vertexShader: /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute float aSeed;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float big = pow(fract(aSeed * 13.7), 6.0);
  float tw = 0.65 + 0.35 * sin(uTime * (0.8 + 2.2 * fract(aSeed * 7.1)) + aSeed * 40.0);
  vCol = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.65), step(0.82, fract(aSeed * 3.3))) * (0.35 + 1.6 * big) * tw;
  gl_PointSize = clamp((1.2 + 2.2 * big) * uScale / 900.0, 1.0, 4.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vCol * (1.0 - smoothstep(0.15, 0.5, d)), 1.0);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -1;
  K.keep(geo);
  K.keep(mat);
  K.group.add(pts);

  // fairy lights: soft discs, far away and out of focus
  const n = K.tier === 'low' ? 14 : 26;
  const bp = new Float32Array(n * 3);
  const bc = new Float32Array(n * 3);
  const bs = new Float32Array(n);
  const palette = [col('#ffb45a'), col('#ff7ac8'), col('#6fd8ff'), col('#ffd98a')];
  for (let i = 0; i < n; i++) {
    const phi = Math.PI * (1.12 + rand() * 0.76);
    const d = 5.5 + rand() * 4;
    bp.set([Math.cos(phi) * d, -0.05 + rand() * 1.4, Math.sin(phi) * d], i * 3);
    const c = palette[i % palette.length];
    bc.set([c.r, c.g, c.b], i * 3);
    bs[i] = 0.12 + rand() * 0.2;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  bg.setAttribute('aCol', new THREE.BufferAttribute(bc, 3));
  bg.setAttribute('aSize', new THREE.BufferAttribute(bs, 1));
  const bm = new THREE.ShaderMaterial({
    uniforms: K.uniforms,
    vertexShader: /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec3 aCol;
attribute float aSize;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vCol = aCol * (0.1 + 0.03 * sin(uTime * 0.4 + aSize * 50.0));
  gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = (1.0 - smoothstep(0.75, 1.0, d)) * (0.7 + 0.3 * d * d);
  gl_FragColor = vec4(vCol * a, 1.0);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bokeh = new THREE.Points(bg, bm);
  bokeh.frustumCulled = false;
  bokeh.renderOrder = -1;
  K.keep(bg);
  K.keep(bm);
  K.group.add(bokeh);
  const size = new THREE.Vector2();
  pts.onBeforeRender = (renderer, scene, camera) => {
    if (!camera.isPerspectiveCamera) return;
    renderer.getDrawingBufferSize(size);
    K.uniforms.uScale.value = size.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };
}

// Blue mist drifting slowly round the base's foot and along the front.
function buildMist(K) {
  const tex = bake(K, { width: K.tier === 'low' ? 128 : 256, fragment: MIST_FRAG, type: THREE.UnsignedByteType });
  const rand = rng(11);
  const n = { high: 22, medium: 16, low: 9 }[K.tier] || 16;
  // near puffs hug the base's foot; far ones only haze the floor a little
  const mats = [0, 1, 2, 3, 4, 5].map((k) => {
    // (only small or half turns: a sprite turns its whole quad, and these
    // are squashed flat along the floor)
    const m = new THREE.SpriteMaterial({ map: tex, color: col('#7f9cf0'), transparent: true, opacity: k < 3 ? 0.36 : 0.16, depthWrite: false, rotation: [0.06, Math.PI, -0.08][k % 3], fog: false });
    return K.keep(m);
  });
  const sprites = [];
  for (let i = 0; i < n; i++) {
    // a ring hugging the base's foot, and a looser one further out
    const near = i < n * 0.55;
    const a = rand() * Math.PI * 2;
    const rx = near ? 0.58 + rand() * 0.12 : 0.8 + rand() * 0.5;
    const rz = near ? 0.3 + rand() * 0.08 : 0.45 + rand() * 0.5;
    const s = new THREE.Sprite(mats[(i % 3) + (near ? 0 : 3)]);
    const x = BASE.cx + Math.cos(a) * rx;
    const z = BASE.cz + Math.sin(a) * rz;
    const y = FLOOR_Y + 0.02 + rand() * 0.025;
    const sc = near ? 0.4 + rand() * 0.35 : 0.35 + rand() * 0.3;
    s.scale.set(sc * 1.9, sc * 0.42, 1);
    s.position.set(x, y, z);
    s.renderOrder = 5;
    s.userData = { x, y, z, ph: rand() * 6.28, sp: 0.04 + rand() * 0.05 };
    K.group.add(s);
    sprites.push(s);
  }
  K.animators.push((dt, t) => {
    for (const s of sprites) {
      const u = s.userData;
      s.position.x = u.x + Math.sin(t * u.sp + u.ph) * 0.08;
      s.position.z = u.z + Math.cos(t * u.sp * 0.7 + u.ph) * 0.05;
    }
  });
}

// ------------------------------------------------------------ lights

function buildLights(K) {
  const q = K.quality;
  const moon = new THREE.DirectionalLight(col('#f2f3ff'), 5.2);
  moon.name = 'moon';
  K.keep(moon); // frees its shadow map
  K.group.add(moon, moon.target);
  moon.castShadow = !!q.shadows;
  moon.shadow.mapSize.set(q.shadowSize || 2048, q.shadowSize || 2048);
  moon.shadow.bias = -0.0002;
  moon.shadow.normalBias = 0.0012;
  moon.shadow.radius = 3;
  // fit the orthographic shadow camera to the run's volume seen from the moon
  const dist = 3;
  const center = CASTERS.getCenter(new THREE.Vector3());
  const basis = new THREE.Matrix4().lookAt(TO_MOON, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
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
  moon.target.position.copy(aim);
  moon.position.copy(aim).addScaledVector(TO_MOON, dist);
  const cam = moon.shadow.camera;
  const hw = (hi.x - lo.x) / 2 + 0.02;
  const hh = (hi.y - lo.y) / 2 + 0.02;
  cam.left = -hw;
  cam.right = hw;
  cam.top = hh;
  cam.bottom = -hh;
  cam.near = 0.5;
  cam.far = dist + 1.5;
  cam.updateProjectionMatrix();
  moon.updateMatrixWorld();
  moon.target.updateMatrixWorld();

  // warm key from the front right: friendly, lamp-lit gold and glaze
  const warm = new THREE.DirectionalLight(col('#ffcf9a'), 1.6);
  warm.position.set(0.9, 0.7, 1.0);
  K.group.add(warm);
  // sky above, lamp-warm below (the base's underside and the floor glow)
  const hemi = new THREE.HemisphereLight(col('#5a70ba'), col('#ff9d52'), 0.45);
  K.group.add(hemi);
  return moon;
}

// ------------------------------------------------------------ environment

// Glossy things reflect: the night sky, a big cool moonlit softbox above,
// a warm panel to the right and a cooler one to the front left, over a
// dark floor. (No direct rim light: on glossy glass and glaze its glints
// bloom into glare; the blue and pink panels behind do that job softly.)
function captureEnvironment(K, sky) {
  const size = K.quality.envSize || 256;
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide }));
  scene.add(dome);
  const panel = (w, h, colr, k, p, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col(colr).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...p);
    m.lookAt(...look);
    scene.add(m);
    return m;
  };
  panel(5, 3, '#e6edff', 3.2, [-1.5, 5, 1.5], [0, 0, 0]);
  panel(2.6, 2.8, '#ffc98f', 3.0, [5, 1.6, 1.5], [0, 0.3, 0]);
  panel(9, 3.2, '#ffe2bd', 1.5, [0.3, 1.4, 5], [0, 0.3, 0]);
  panel(2.5, 1.4, '#8fb4ff', 1.6, [-4.5, 1.2, 2.5], [0, 0.3, 0]);
  panel(1.6, 1.6, '#ff9ad5', 1.0, [2.5, 1.0, -4.5], [0, 0.3, 0]);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: col('#070d20') }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.4;
  scene.add(floor);
  // the moonlit white base right under everything: gold posts and the
  // undersides of glass see it, warm with lamplight at its edge
  const base = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.58, 0.55) }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.02;
  scene.add(base);
  const glow = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.5, 0.2) }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.06;
  scene.add(glow);
  const pmrem = new THREE.PMREMGenerator(K.renderer);
  const rt = pmrem.fromScene(scene, 0.02, 0.05, 30, { size, position: new THREE.Vector3(0, 0.2, 0) });
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  K.keep(rt);
  return rt;
}

// ------------------------------------------------------------ entry

export async function createCrystalSetting({ renderer, quality, mats = null }) {
  const K = new Kit(renderer, quality, mats);
  const sky = bake(K, { width: K.tier === 'low' ? 512 : 1024, height: K.tier === 'low' ? 256 : 512, fragment: SKY_FRAG, repeat: true });
  sky.mapping = THREE.EquirectangularReflectionMapping;
  buildBase(K);
  buildFloor(K);
  const bowl = buildBowl(K);
  buildCrystals(K);
  buildStars(K);
  buildMist(K);
  const moon = buildLights(K);
  const environmentIntensity = 1.0;
  const env = captureEnvironment(K, sky);
  return {
    group: K.group,
    environment: env.texture,
    environmentIntensity,
    background: sky,
    fog: new THREE.Fog(FOG, 3.0, 10),
    exposure: 0.88,
    // a deep run of glass: keep the whole of it crisp
    aperture: 0.45,
    bloom: { strength: 0.42, threshold: 1.6, radius: 0.5 },
    grade: {
      white: [0.98, 1.0, 1.04],
      power: 1.2,
      lookSaturation: 1.32,
      saturation: 1.06,
      contrast: 0.07,
      shadowTint: [-0.002, 0.0, 0.01],
      highTint: [0.006, 0.002, -0.004],
      vignette: 0.26,
      grain: 0.018,
      fringe: 0.004,
    },
    sun: moon,
    bowl: { position: new THREE.Vector3(BOWL.x, 0, BOWL.z), innerRadius: BOWL.inner, rimHeight: BOWL.rim, floorY: BOWL.floorY, object: bowl },
    camera: {
      target: new THREE.Vector3(-0.1, 0.2, 0.06),
      distance: 1.2,
      azimuth: THREE.MathUtils.degToRad(-4),
      elevation: THREE.MathUtils.degToRad(19),
      fov: 34,
    },
    focus: new THREE.Vector3(-0.06, 0.2, 0.05),
    update(dt, time) {
      const t = REDUCED_MOTION.matches ? 0 : time;
      K.uniforms.uTime.value = t;
      for (const a of K.animators) a(dt, t);
    },
    dispose() {
      K.group.removeFromParent();
      for (const x of K.bin) x.dispose?.();
      K.bin.length = 0;
    },
  };
}
