// Glowing Night Bay: a warm summer night on a wide sheltered bay. A long
// sandy beach curves round to a little fishing village of whitewashed
// cottages with lit windows and a wooden pier strung with paper lanterns;
// a lighthouse on the rocky point sweeps a soft warm light slowly round.
// Wooded hills and low cliffs ring the bay, and a low dune spit closes its
// mouth, beyond which the moonlit sea runs to the horizon under a big
// friendly moon. Floating lanterns drift on the water, fireflies blink over
// the dune grass and the woods, and the water glows blue-green wherever the
// boat or an animal stirs it.
import * as THREE from 'three';
import { rng, smoothstep } from '../config.js';
import { dirFrom } from '../sky.js';
import { makeNoise, islandHeight, smax, rockGeometry, rockMaterial, instances, merge } from './common.js';
import { makeSeaPines, makeWoods } from './bay-trees.js';
import { makeVillage } from './bay-village.js';
import { makeFireflies, makeFloatingLanterns, makeSeaSparkle } from './bay-glow.js';

const noise = makeNoise(63);

// where the moon hangs (and so the moonlight and its path on the water)
const MOON = dirFrom(-6, 8);

// ------------------------------------------------------------ layout

// The long beach runs from the village (a = -0.35, east-north-east) round
// the south to a = 2.05; everywhere else the shore is low cliffs and coves.
function cliffK(a) {
  return 1 - smoothstep(-0.62, -0.38, a) * (1 - smoothstep(1.85, 2.15, a));
}

// the bay's shore: distance from the middle by direction a = atan2(z, x);
// to the north it opens between two headlands to the sea
function shoreR(a) {
  const cl = cliffK(a);
  const n = noise.fbm(Math.cos(a) * 1.6 + 7, Math.sin(a) * 1.6 - 3, 4);
  const R = 312 + n * (22 + 48 * cl) + 18 * Math.sin(a);
  const north = -Math.sin(a); // 1 straight out of the mouth
  return R + smoothstep(0.8, 0.92, north) * 700;
}

// the dune spit across the mouth: a gentle arc bowing out to sea
const SPIT = { x: 0, z: 70, r: 450 };
function spitHeight(x, z) {
  if (z > -220 || Math.abs(x) > 320) return -99;
  const d = Math.abs(Math.hypot(x - SPIT.x, z - SPIT.z) - SPIT.r);
  const W = 25 + noise.fbm(x * 0.012 + 40, z * 0.012, 3) * 7;
  const top = 2.3 + noise.fbm(x * 0.03, z * 0.03 + 9, 3) * 1.8;
  const fade = 1 - smoothstep(260, 320, Math.abs(x));
  const h = d < W ? top * (1 - Math.pow(d / W, 2.2)) : -(d - W) * 0.1;
  return h * fade - 20 * (1 - fade);
}

// islands: a wooded one with a beach, a rocky islet in the moon's path, and
// the lighthouse knoll on the east headland
const ISLANDS = [
  { x: -150, z: -80, r: 40, top: 2.6, p: 2.2, hill: 7, seed: 2.2, wobble: 0.2 },
  { x: 55, z: -205, r: 10, top: 3.2, p: 1.3, seed: 5.5, slope: 0.25 },
  { x: 232, z: -292, r: 30, top: 7, p: 1.5, hill: 3, seed: 9.9, slope: 0.3, wobble: 0.12 },
];
const KNOLL = ISLANDS[2];

// sea stacks off the west cliffs: pillars of layered rock
const STACKS = [
  { x: -238, z: 112, r: 5.5, h: 13 },
  { x: -226, z: 134, r: 3.6, h: 8.5 },
  { x: -252, z: 92, r: 2.4, h: 4.5 },
];

function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const s = r - shoreR(a); // metres from the shore, + inland
  const cl = cliffK(a);
  const n = noise.fbm(x * 0.013 + 3, z * 0.013 - 7, 3);
  let h;
  if (s < 0) {
    // the bed: gentle off the beaches, steep off the cliffs, deeper out to sea
    const deep = 14 + 3 * n + 10 * smoothstep(-300, -470, z);
    const shelf = s > -35 ? s * 0.06 : -2.1 + (s + 35) * 0.12;
    h = Math.max(-deep, shelf + (s * 0.25 - shelf) * cl);
  } else {
    // a beach and dunes, or a low cliff, then wooded hills
    const beach = s * 0.05 + smoothstep(14, 40, s) * (1.7 + n * 1.2);
    const cliff = Math.min(s * 1.1, 6 + n * 3) + s * 0.05;
    h = beach + (cliff - beach) * cl;
    const hills = 0.5 + 0.5 * noise.fbm(x * 0.004 - 5, z * 0.004 + 2, 4);
    h += hills * (36 + 22 * cl) * smoothstep(30, 230, s);
  }
  return h + n * 0.4;
}

export function height(x, z) {
  let h = baseHeight(x, z);
  h = smax(h, spitHeight(x, z), 3);
  for (const isl of ISLANDS) {
    if (Math.abs(x - isl.x) > 110 || Math.abs(z - isl.z) > 110) continue;
    h = smax(h, islandHeight(isl, x, z, noise), 1.5);
  }
  // a rocky shoal round the foot of each sea stack
  for (const st of STACKS) {
    const d = Math.hypot(x - st.x, z - st.z);
    if (d < st.r * 4) h = smax(h, -0.9 - (d - st.r) * 0.35, 1);
  }
  return h;
}

// the pier runs west from the village beach; its line and the shore it
// starts from are worked out once here
const PIER_Z = -24;
const shoreX = (z) => {
  let x = 200;
  while (x < 420 && height(x, z) < 0) x += 0.5;
  return x;
};
const PIER = (() => {
  const root = shoreX(PIER_Z);
  const len = 72;
  return { x0: root + 15, x1: root + 15 - len, z: PIER_Z, width: 3.2, head: 16, headDepth: 5, deck: 1.35 };
})();

function inPier(x, z, pad = 0) {
  if (x > PIER.x0 + pad || x < PIER.x1 - pad) return false;
  if (Math.abs(z - PIER.z) < PIER.width / 2 + pad) return true;
  return x < PIER.x1 + PIER.headDepth + pad && Math.abs(z - PIER.z) < PIER.head / 2 + pad;
}

// fishing boats moored off the pier and the beach: [x, z, heading]
const MOORED = [
  [PIER.x1 + 2.5, PIER.z + PIER.head / 2 + 2.2, Math.PI / 2 + 0.05],
  [PIER.x1 + 22, PIER.z - 9, 1.2],
  [PIER.x1 + 16, PIER.z + 26, 1.9],
];

export function solid(x, z) {
  if (height(x, z) > -0.7) return true;
  for (const st of STACKS) if (Math.hypot(x - st.x, z - st.z) < st.r * 1.25 + 0.6) return true;
  for (const [mx, mz] of MOORED) if (Math.hypot(x - mx, z - mz) < 3.2) return true;
  return inPier(x, z, 0.8);
}

// The terrain is built in build() rather than by the engine: chunks where
// the ground crosses the waterline (beaches, rocks, shallows) finely, the
// deep bed and the high hills coarsely, merged into nine meshes. That keeps
// the whole ring of hills to a fraction of the triangles and draw calls of
// a uniform grid. The engine is told to skip every chunk.
function waterline(x0, z0, x1, z1) {
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 12; j++) {
      const h = height(x0 + ((x1 - x0) * i) / 12, z0 + ((z1 - z0) * j) / 12);
      if (h > -2.5 && h < 5) return true;
    }
  }
  return false;
}

const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const PLACE = {
  id: 'bay',
  area: { minX: -440, maxX: 440, minZ: -440, maxZ: 440 },
  terrain: { minX: -560, maxX: 560, minZ: -560, maxZ: 560, skip: () => true },
  height,
  solid,
  spawn: { x: 120, z: 150, heading: -0.12 },
  sky: {
    // the "sun" is the moon: moonlight, its glitter path and the glow round it
    sunDir: MOON,
    sunColor: C('#dfe6ff', 0.2),
    zenith: C('#12246a', 0.3),
    horizon: C('#4a55a0', 0.3),
    ground: C('#101830', 0.2),
    glow: C('#93a9ee', 0.25),
    gradient: 0.55,
    glowWidth: 14,
    glowStrength: 0.6,
    sunSize: 0.001,
    cloud: { cover: 0.2, soft: 0.3, bright: 0.28, scale: 1.2, lit: C('#d0d8f4'), shade: C('#4a5680') },
    night: { stars: 1.6, moonSize: 3.4, moonBright: 2.0, moonDir: MOON },
  },
  light: {
    sun: C('#bccbff'),
    sunIntensity: 1.1,
    hemiSky: C('#6c7fc4'),
    hemiGround: C('#3a3438'),
    hemi: 0.9,
    env: 1.4,
  },
  exposure: 1.6,
  fog: 0.0003,
  bloom: { strength: 0.35, threshold: 1.1, radius: 0.55 },
  grade: { saturation: 1.05, contrast: 0.08, vignette: 0.2 },
  water: {
    absorb: [0.4, 0.11, 0.08],
    scatter: C('#0b2b44', 0.16),
    ambient: C('#7d90c8', 0.45),
    ripples: 1.5,
    refraction: 0.03,
    caustics: 0.2,
    roughness: 0.06,
    shoreFoam: 0.5,
    reflection: 1,
    glitter: 1.8,
    fog: 0.0003,
    wind: [0.4, 0.25],
    swell: [
      { dir: 170, length: 26, amp: 0.035 },
      { dir: 140, length: 13, amp: 0.016 },
      { dir: 200, length: 7, amp: 0.007 },
    ],
    // the plankton that glows where the water is stirred
    glow: new THREE.Color(0.2, 0.85, 0.95),
    glowStrength: 0.05,
  },
  ground: {
    sand: '#bcab8e',
    wet: '#8e8069',
    bed: '#9a8f76',
    grass: '#3b4a2a',
    grass2: '#57603a',
    rock: '#6e6964',
    coral: false,
    grassLevel: 2.6,
    rockSlope: 0.3,
    wetTop: 0.35,
  },
  animals: { dolphins: true, turtles: 2, fish: 'glow', birds: null, ducks: 0 },
  bumps: [
    { x: 40, z: 60, angle: 0.4 },
    { x: -90, z: 120, angle: 2.7 },
    { x: 170, z: -140, angle: 1.9 },
    { x: -40, z: -260, angle: 3.3 },
    { x: -130, z: -230, angle: 0.9 },
    { x: 60, z: 230, angle: 3.6 },
  ],
  course: {
    gate: { x: 110, z: 70, angle: 0, width: 14 },
    buoys: [
      [100, -100],
      [90, -240],
      [10, -250],
      [-80, -150],
      [-200, -150],
      [-205, -10],
      [-60, 40],
    ],
  },
  ramps: [
    { x: -40, z: -60, angle: 1.3 },
    { x: 180, z: 20, angle: 2.2 },
    { x: -150, z: 220, angle: 0.5 },
  ],
};

// ------------------------------------------------------------ scenery

const inVillage = (x, z) => x > 240 && z > -150 && z < 95 && x < shoreX(z) + 80;
const nearLight = (x, z) => Math.hypot(x - KNOLL.x, z - KNOLL.z) < 22;
const glade = (x, z) => noise.fbm(x * 0.018 + 40, z * 0.018, 3) > 0.28;

// terrain cells (m) by quality tier: near the waterline, and elsewhere
const CELL = { high: [2.4, 8], medium: [3.2, 11.2], low: [4.8, 14] };

// One square of terrain; skirts hang from the edges flagged in `skirt`
// ([-z, +z, -x, +x]) where it meets a square of another resolution, so no
// crack shows between them.
function fillChunk(x0, z0, x1, z1, n, skirt) {
  const pos = [];
  const nrm = [];
  const ex = (x1 - x0) / n / 2;
  const at = (x, z, drop = 0) => {
    const hx = height(x + ex, z) - height(x - ex, z);
    const hz = height(x, z + ex) - height(x, z - ex);
    const l = Math.hypot(hx, 2 * ex, hz);
    pos.push(x, height(x, z) - drop, z);
    nrm.push(-hx / l, (2 * ex) / l, -hz / l);
  };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) at(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * j) / n);
  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const c = a + n + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const edge = (list) => {
    const base = pos.length / 3;
    for (const k of list) at(pos[k * 3], pos[k * 3 + 2], 3);
    for (let e = 0; e < list.length - 1; e++) {
      const a = list[e];
      const b = list[e + 1];
      idx.push(a, base + e, b, b, base + e, base + e + 1, a, b, base + e, b, base + e + 1, base + e);
    }
  };
  const line = (f) => Array.from({ length: n + 1 }, (_, i) => f(i));
  if (skirt[0]) edge(line((i) => i));
  if (skirt[1]) edge(line((i) => n * (n + 1) + i));
  if (skirt[2]) edge(line((j) => j * (n + 1)));
  if (skirt[3]) edge(line((j) => j * (n + 1) + n));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

// the whole terrain in 56 m squares, merged into a 3 x 3 grid of meshes
function terrain(material, [fine, coarse]) {
  const T = PLACE.terrain;
  const size = 56;
  const n = Math.round((T.maxX - T.minX) / size);
  const kind = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) kind.push(waterline(T.minX + i * size, T.minZ + j * size, T.minX + (i + 1) * size, T.minZ + (j + 1) * size));
  const at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n ? null : kind[j * n + i]);
  const parts = Array.from({ length: 9 }, () => []);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = at(i, j);
      const differs = (o) => o !== null && o !== k;
      const x0 = T.minX + i * size;
      const z0 = T.minZ + j * size;
      const cells = Math.max(2, Math.round(size / (k ? fine : coarse)));
      const skirt = [differs(at(i, j - 1)), differs(at(i, j + 1)), differs(at(i - 1, j)), differs(at(i + 1, j))];
      parts[Math.floor((j * 3) / n) * 3 + Math.floor((i * 3) / n)].push(fillChunk(x0, z0, x0 + size, z0 + size, cells, skirt));
    }
  }
  const group = new THREE.Group();
  group.name = 'terrain';
  for (const list of parts) {
    const mesh = new THREE.Mesh(merge(list), material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// a sea stack: a leaning pillar of layered rock, wider at the foot
function stackGeometry(seed) {
  const g = new THREE.CylinderGeometry(0.72, 1, 1, 18, 14);
  g.translate(0, 0.5, 0);
  const n = makeNoise(seed);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const strata = 0.06 * Math.sin(v.y * 38 + n.noise(a * 2, v.y * 3) * 3);
    const k = 1 + 0.22 * n.fbm(Math.cos(a) * 1.5 + v.y * 2.5, Math.sin(a) * 1.5, 4) + strata;
    const top = v.y > 0.99 ? 0.75 + 0.2 * n.noise(v.x * 3, v.z * 3) : 1;
    p.setXYZ(i, v.x * k * top + v.y * 0.12, v.y * (v.y > 0.99 ? 1 + 0.04 * n.noise(v.x * 5, v.z * 5) : 1), v.z * k * top);
  }
  g.computeVertexNormals();
  return g;
}

// clumps of marram grass for the dunes: stiff, arching blades
function grassClump(seed) {
  const r = rng(seed);
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const h = 0.45 + r() * 0.55;
    const w = 0.04;
    const lean = 0.15 + r() * 0.35;
    const tri = [];
    const sw = [];
    const pt = (t, s) => [s * w * (1 - t * 0.9) + lean * t * t, h * t, 0];
    for (const [t0, t1] of [[0, 0.5], [0.5, 1]]) {
      const a = pt(t0, -1);
      const b = pt(t0, 1);
      const c = pt(t1, -1);
      const d = pt(t1, 1);
      tri.push(...a, ...b, ...c, ...b, ...d, ...c);
      sw.push(t0 * t0, t0 * t0, t1 * t1, t0 * t0, t1 * t1, t1 * t1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(sw, 1));
    g.rotateY(r() * Math.PI * 2);
    g.translate((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
    g.computeVertexNormals();
    parts.push(g);
  }
  return merge(parts);
}

function grassMaterial(time) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9660, roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27;
#else
  float ph = 0.0;
#endif
  transformed.x += sin(uTime * 1.2 + ph) * 0.06 * sway;
  transformed.z += cos(uTime * 0.9 + ph * 1.3) * 0.05 * sway;`,
      );
  };
  mat.customProgramCacheKey = () => 'bay-marram';
  return mat;
}

export async function build({ quality, renderer, textures, land }) {
  const [{ LAYER_FX }, { terrainMaterial }] = await Promise.all([import('../post.js'), import('../terrain.js')]);
  const group = new THREE.Group();
  group.name = 'bay';
  const r = rng(77);
  const tier = quality.tier;
  const k = tier === 'low' ? 0.45 : tier === 'medium' ? 0.75 : 1;
  const time = { value: 0 };

  group.add(terrain(terrainMaterial(PLACE.ground, textures), CELL[tier] ?? CELL.high));

  // ---- trees: seaside pines along the shores and on the island, and woods
  // of firs and pines on the hills behind
  const pines = [];
  let tries = 0;
  while (pines.length < 210 * k && tries++ < 60000) {
    const x = (r() - 0.5) * 1000;
    const z = (r() - 0.5) * 1000;
    const s = Math.hypot(x, z) - shoreR(Math.atan2(z, x));
    if (s < 5 || s > 70 || inVillage(x, z) || nearLight(x, z) || glade(x, z)) continue;
    const h = height(x, z);
    if (h < 2.6 || h > 60) continue;
    pines.push({ x, y: h - 0.2, z, ry: r() * 6.28, s: 0.75 + r() * 0.4 });
  }
  const isl = ISLANDS[0];
  for (let i = 0; i < 300 && pines.length < 245 * k; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * isl.r;
    const x = isl.x + Math.cos(a) * d;
    const z = isl.z + Math.sin(a) * d;
    const h = height(x, z);
    if (h < 1.3) continue;
    pines.push({ x, y: h - 0.2, z, ry: r() * 6.28, s: 0.7 + r() * 0.4 });
  }
  // a lone windswept pine on the rocky islet, and a few behind the village
  pines.push({ x: ISLANDS[1].x + 1, y: height(ISLANDS[1].x + 1, ISLANDS[1].z) - 0.3, z: ISLANDS[1].z, ry: 1, s: 0.8 });
  const pineGroup = makeSeaPines(pines, 3);
  group.add(pineGroup);
  const far = [];
  tries = 0;
  while (far.length < 2600 * k && tries++ < 90000) {
    const x = (r() - 0.5) * 1110;
    const z = (r() - 0.5) * 1110;
    const s = Math.hypot(x, z) - shoreR(Math.atan2(z, x));
    if (s < 50 || glade(x * 0.7, z * 0.7) || (inVillage(x, z) && s < 110)) continue;
    const h = height(x, z);
    if (h < 6) continue;
    far.push({ x, y: h - 0.4, z, ry: r() * 6.28, s: 0.8 + r() * 0.5, pine: r() < 0.4 });
  }
  group.add(makeWoods(far, 5));

  // ---- rocks: along the foot of the cliffs, round the lighthouse knoll and
  // the islet, and the sea stacks
  const rockMat = rockMaterial(textures.noise, 0x7c766f, { lichen: 0.5, lichenColor: 0x9a9670 });
  const bigRocks = [];
  const smallRocks = [];
  const addRock = (x, z, s, sink = 0.35) => (s > 1.5 ? bigRocks : smallRocks).push({ x, y: height(x, z) - s * sink, z, s, sy: 0.6 + r() * 0.5, ry: r() * 6.28 });
  for (let i = 0; i < 200 * k; i++) {
    const a = (r() - 0.5) * Math.PI * 2;
    if (cliffK(a) < 0.5) continue;
    const R = shoreR(a) + (r() - 0.35) * 6;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    if (Math.abs(x) > 430 || Math.abs(z) > 430) continue;
    addRock(x, z, 0.5 + r() * r() * 2.6);
  }
  for (const [c, n, spread, big] of [[KNOLL, 30, 1.05, 2.4], [ISLANDS[1], 12, 0.9, 2], [ISLANDS[0], 12, 1.02, 1.2]]) {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = c.r * spread * (0.75 + r() * 0.35);
      addRock(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 0.6 + r() * big);
    }
  }
  for (const st of STACKS) {
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2;
      const d = st.r * (1 + r() * 0.6);
      smallRocks.push({ x: st.x + Math.cos(a) * d, y: -0.8 - r() * 0.4, z: st.z + Math.sin(a) * d, s: 0.7 + r() * 1.2, sy: 0.7, ry: r() * 6.28 });
    }
  }
  group.add(instances(rockGeometry(5, 2), rockMat, bigRocks, { shadow: false }));
  group.add(instances(rockGeometry(11, 1), rockMat, smallRocks, { shadow: false }));
  const stackParts = STACKS.map((st, i) => {
    const g = stackGeometry(31 + i);
    g.scale(st.r, st.h + 2, st.r);
    g.rotateY(i * 2.1);
    g.translate(st.x, -2, st.z);
    return g;
  });
  const stacks = new THREE.Mesh(merge(stackParts), new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.85 }));
  stacks.receiveShadow = true;
  group.add(stacks);

  // ---- marram grass on the dunes of the long beach and the spit
  const tufts = [];
  tries = 0;
  while (tufts.length < 380 * k && tries++ < 40000) {
    const x = (r() - 0.5) * 900;
    const z = (r() - 0.5) * 900;
    const h = height(x, z);
    if (h < 1.1 || h > 5.5) continue;
    const a = Math.atan2(z, x);
    const s = Math.hypot(x, z) - shoreR(a);
    const onSpit = z < -280 && Math.abs(x) < 240;
    if (!onSpit && (cliffK(a) > 0.5 || s < 10 || s > 60)) continue;
    if (inVillage(x, z) && s > 12) continue;
    if (noise.fbm(x * 0.05 + 3, z * 0.05, 2) < -0.15) continue;
    tufts.push({ x, y: h - 0.05, z, ry: r() * 6.28, s: 0.9 + r() * 0.7 });
  }
  group.add(instances(grassClump(3), grassMaterial(time), tufts, { shadow: false }));

  // ---- the village, the pier and the lighthouse
  const village = makeVillage({ quality, PIER, MOORED, KNOLL, height, shoreX, fxLayer: LAYER_FX });
  group.add(village.group);

  // ---- fireflies: in swarms over the dune grass, the cottage gardens, the
  // edges of the woods and the island, a few out over the shallows
  const flies = [];
  const swarm = (cx, cz, n, rad, lo, hi) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * rad;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const h = Math.max(0, height(x, z));
      flies.push({ x, y: h + lo + r() * (hi - lo), z });
    }
  };
  const total = Math.round(1400 * k);
  tries = 0;
  while (flies.length < total && tries++ < 5000) {
    const a = (r() - 0.5) * Math.PI * 2;
    const R = shoreR(a);
    if (R > 600) continue;
    const beach = cliffK(a) < 0.5;
    const s = beach ? 6 + r() * 30 : 2 + r() * 22;
    const x = Math.cos(a) * (R + s);
    const z = Math.sin(a) * (R + s);
    if (Math.abs(x) > 430 || Math.abs(z) > 430) continue;
    swarm(x, z, 10 + Math.floor(r() * 16), 6 + r() * 5, 0.4, beach ? 2.2 : 4);
  }
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    swarm(isl.x + Math.cos(a) * isl.r * 0.7, isl.z + Math.sin(a) * isl.r * 0.7, 14, 8, 0.5, 4);
  }
  for (const hsp of village.houses.filter((_, i) => i % 3 === 0)) swarm(hsp.x + 6, hsp.z, 6, 6, 0.4, 2.5);
  const fireflies = makeFireflies(flies, LAYER_FX);
  group.add(fireflies);

  // ---- lanterns floating on the bay, many near the pier they were launched from
  const keepOut = [...PLACE.bumps.map((b) => ({ x: b.x, z: b.z, r: 26 })), ...PLACE.ramps.map((b) => ({ x: b.x, z: b.z, r: 28 }))];
  const floatSpots = [];
  tries = 0;
  const nFloat = Math.round(44 * k);
  while (floatSpots.length < nFloat && tries++ < 4000) {
    // a drift near the pier they were launched from, some ahead of where
    // the boat starts, the rest spread over the bay
    const f = floatSpots.length / nFloat;
    const x = f < 0.35 ? PIER.x1 - 10 - r() * 90 : f < 0.6 ? 60 + r() * 140 : -160 + r() * 400;
    const z = f < 0.35 ? PIER.z - 60 + r() * 120 : f < 0.6 ? 10 + r() * 115 : -250 + r() * 430;
    if (land.distance(x, z) < 18) continue;
    if (keepOut.some((o) => Math.hypot(x - o.x, z - o.z) < o.r)) continue;
    floatSpots.push({ x, z });
  }
  const floating = makeFloatingLanterns({ spots: floatSpots, land, keepOut, swell: PLACE.water.swell, fxLayer: LAYER_FX });
  group.add(floating);

  // ---- a faint sea sparkle in the open water
  const sparkle = makeSeaSparkle({ count: Math.round(2200 * k), land, glow: PLACE.water.glow, fxLayer: LAYER_FX });
  group.add(sparkle);

  // Where is the boat? main.js may hand it to update(); otherwise it is read
  // off the chase camera, which always looks at it from about 11 m behind.
  const view = { cam: new THREE.Vector3(PLACE.spawn.x, 3, PLACE.spawn.z + 11), dir: new THREE.Vector3(0, 0, -1), ok: false };
  fireflies.userData.direct.onBeforeRender = (rend, scene, cam) => {
    if (cam.position.y <= 0) return;
    view.cam.copy(cam.position);
    cam.getWorldDirection(view.dir);
    view.ok = true;
  };
  const est = { x: PLACE.spawn.x, z: PLACE.spawn.z, fx: 0, fz: -1, speed: 0, px: PLACE.spawn.x, pz: PLACE.spawn.z };
  const buf = new THREE.Vector2();

  return {
    group,
    update(dt, t, boat) {
      time.value = t;
      if (boat?.pos) {
        est.x = boat.pos.x;
        est.z = boat.pos.z;
        est.fx = -Math.sin(boat.heading);
        est.fz = -Math.cos(boat.heading);
        est.speed = boat.speed;
      } else if (view.ok) {
        const l = Math.hypot(view.dir.x, view.dir.z) || 1;
        est.fx = view.dir.x / l;
        est.fz = view.dir.z / l;
        est.x = view.cam.x + est.fx * 10.8;
        est.z = view.cam.z + est.fz * 10.8;
        if (dt > 0) est.speed += (Math.min(20, Math.hypot(est.x - est.px, est.z - est.pz) / dt) - est.speed) * Math.min(1, dt * 2);
        est.px = est.x;
        est.pz = est.z;
      }
      renderer.getDrawingBufferSize(buf);
      const h = buf.y * 0.9;
      pineGroup.userData.update(t);
      village.update(dt, t, view);
      fireflies.userData.update(t, h);
      floating.userData.update(dt, t, est);
      sparkle.userData.update(t, view.cam, est, h);
    },
    islands: ISLANDS,
  };
}
