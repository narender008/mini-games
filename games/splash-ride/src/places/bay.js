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
import { makeNoise, islandHeight, smax } from './common.js';

const noise = makeNoise(63);

// where the moon hangs (and so the moonlight and its path on the water)
const MOON = dirFrom(-6, 10.5);

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
  const h = d < W ? top * (1 - Math.pow(d / W, 2.2)) : -(d - W) * 0.07;
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
    const deep = 12 + 3 * n + 12 * smoothstep(-300, -470, z);
    h = Math.max(-deep, s * (0.045 + 0.2 * cl));
  } else {
    // a beach and dunes, or a low cliff, then wooded hills
    const beach = s * 0.05 + smoothstep(14, 40, s) * (1.7 + n * 1.2);
    const cliff = Math.min(s * 2.3, 7 + n * 3) + s * 0.05;
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
  const len = 64;
  return { x0: root + 8, x1: root + 8 - len, z: PIER_Z, width: 3.2, head: 16, headDepth: 5, deck: 1.35 };
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

// Leave out terrain chunks that lie wholly deep under the water: at night
// nothing that deep shows through, and the water treats a gap as deep sea.
function skip(x0, z0, x1, z1) {
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      if (height(x0 + ((x1 - x0) * i) / 8, z0 + ((z1 - z0) * j) / 8) > -10.5) return false;
    }
  }
  return true;
}

const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const PLACE = {
  id: 'bay',
  area: { minX: -440, maxX: 440, minZ: -440, maxZ: 440 },
  terrain: { minX: -560, maxX: 560, minZ: -560, maxZ: 560, skip },
  height,
  solid,
  spawn: { x: 120, z: 150, heading: -0.12 },
  sky: {
    // the "sun" is the moon: moonlight, its glitter path and the glow round it
    sunDir: MOON,
    sunColor: C('#dfe6ff', 0.2),
    zenith: C('#16307a', 0.3),
    horizon: C('#5d68b0', 0.42),
    ground: C('#101830', 0.2),
    glow: C('#b8c4ee', 0.5),
    gradient: 0.55,
    glowWidth: 5,
    glowStrength: 0.8,
    sunSize: 0.001,
    cloud: { cover: 0.2, soft: 0.3, bright: 0.28, scale: 1.2, lit: C('#d0d8f4'), shade: C('#4a5680') },
    night: { stars: 1.6, moonSize: 3.4, moonBright: 3.2, moonDir: MOON },
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
    ripples: 0.7,
    refraction: 0.03,
    caustics: 0.2,
    roughness: 0.09,
    shoreFoam: 0.5,
    reflection: 1,
    glitter: 2.2,
    fog: 0.0003,
    wind: [0.4, 0.25],
    swell: [
      { dir: 170, length: 26, amp: 0.035 },
      { dir: 140, length: 13, amp: 0.016 },
      { dir: 200, length: 7, amp: 0.007 },
    ],
    // the plankton that glows where the water is stirred
    glow: new THREE.Color(0.2, 0.85, 0.95),
    glowStrength: 0.9,
  },
  ground: {
    sand: '#d8cbb0',
    wet: '#8e8069',
    bed: '#9a8f76',
    grass: '#3b4a2a',
    grass2: '#57603a',
    rock: '#6e6964',
    coral: false,
    grassLevel: 2.6,
    rockSlope: 0.5,
    wetTop: 0.35,
  },
  animals: { dolphins: true, turtles: 2, fish: 'glow', birds: null, ducks: 0 },
  bumps: [
    { x: 40, z: 60, angle: 0.4 },
    { x: -90, z: 120, angle: 2.7 },
    { x: 170, z: -140, angle: 1.9 },
    { x: -40, z: -260, angle: 3.3 },
    { x: -220, z: -180, angle: 0.9 },
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

// exported for the scenery modules
export const LAYOUT = { PIER, MOORED, STACKS, ISLANDS, KNOLL, SPIT, shoreR, cliffK, inPier, noise };

export async function build({ quality, land }) {
  const group = new THREE.Group();
  group.name = 'bay';
  return { group, update() {}, islands: ISLANDS };
}
