// Tropical Lagoon: turquoise water over white sand inside a ring of palm
// islets and a coral reef, with a few palm islands, a sandbar and dark
// volcanic rocks to drive round, coral heads under the clear water, a
// thatched hut on stilts, and the deep blue ocean breaking on the reef
// beyond. Sunny late morning with drifting cumulus.
import * as THREE from 'three';
import { rng } from '../config.js';
import { dirFrom } from '../sky.js';
import { makeNoise, islandHeight, smax, rockGeometry, instances } from './common.js';
import { makePalms } from './palms.js';

const noise = makeNoise(21);
const REEF_R = 360; // the ring of islets and reef around the lagoon

// islands inside the lagoon: r = beach radius, top = height of the middle
const ISLANDS = [
  { x: 95, z: -150, r: 34, top: 2.6, p: 3, seed: 1.2, hill: 1.5 },
  { x: -140, z: -40, r: 46, top: 3.2, p: 3.2, seed: 2.7, hill: 4 },
  { x: 150, z: 110, r: 26, top: 2.2, p: 2.6, seed: 4.1 },
  { x: -60, z: 170, r: 30, top: 2.4, p: 2.8, seed: 5.3, sx: 1.4, sz: 0.8 },
  { x: 20, z: 40, r: 11, top: 1.2, p: 2.2, seed: 6.6, wobble: 0.25 }, // a little palm islet
  { x: 210, z: -40, r: 9, top: 0.25, p: 1.6, seed: 7.7, sx: 2.6, sz: 0.9, slope: 0.05 }, // sandbar
];

// dark volcanic rocks poking out of the water
const ROCKS = [
  { x: 60, z: -95, r: 3.2 },
  { x: 66, z: -88, r: 2 },
  { x: -80, z: 90, r: 2.8 },
  { x: 180, z: 40, r: 3.6 },
  { x: 186, z: 50, r: 2.2 },
  { x: -200, z: 120, r: 3 },
  { x: -30, z: -170, r: 2.5 },
  { x: 250, z: -160, r: 3.4 },
];

function basin(x, z) {
  const r = Math.hypot(x, z);
  const n = noise.fbm(x * 0.006, z * 0.006, 4);
  // lagoon floor, deeper in the middle, then the reef crest and the ocean
  let h = -3.4 - 1.6 * Math.exp(-(r * r) / (180 * 180)) + n * 1.2;
  const ang = Math.atan2(z, x);
  const reefR = REEF_R + noise.fbm(Math.cos(ang) * 2 + 9, Math.sin(ang) * 2, 3) * 30;
  const reef = -0.35 + 0.25 * noise.noise(ang * 9, 3.1);
  h = smax(h, reef - Math.abs(r - reefR) * 0.06, 6);
  if (r > reefR) h = Math.min(h, -0.35 - (r - reefR) * 0.35);
  return Math.max(h, -40);
}

// the motu: islets along the reef ring, with gaps of shallow reef between
const MOTU = [];
{
  const r = rng(5);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + r() * 0.25;
    const rr = REEF_R + (r() - 0.5) * 20;
    MOTU.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: 22 + r() * 26, top: 1.8 + r() * 1.2, p: 2.8, seed: 10 + i, sx: 1.6, sz: 0.8, rot: a });
  }
}

function motuHeight(m, x, z) {
  // stretched along the ring
  const c = Math.cos(-m.rot + Math.PI / 2);
  const s = Math.sin(-m.rot + Math.PI / 2);
  const dx = x - m.x;
  const dz = z - m.z;
  return islandHeight({ ...m, x: 0, z: 0 }, dx * c - dz * s, dx * s + dz * c, noise);
}

export function height(x, z) {
  let h = basin(x, z);
  for (const isl of ISLANDS) {
    if (Math.abs(x - isl.x) > 140 || Math.abs(z - isl.z) > 140) continue;
    h = smax(h, islandHeight(isl, x, z, noise), 1.5);
  }
  for (const m of MOTU) {
    if (Math.abs(x - m.x) > 150 || Math.abs(z - m.z) > 150) continue;
    h = smax(h, motuHeight(m, x, z), 1.5);
  }
  return h;
}

export function solid(x, z) {
  if (height(x, z) > -0.7) return true;
  for (const r of ROCKS) if (Math.hypot(x - r.x, z - r.z) < r.r * 1.05) return true;
  return false;
}

const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const PLACE = {
  id: 'lagoon',
  area: { minX: -440, maxX: 440, minZ: -440, maxZ: 440 },
  terrain: { minX: -520, maxX: 520, minZ: -520, maxZ: 520 },
  height,
  solid,
  spawn: { x: 40, z: 120, heading: 0.3 },
  sky: {
    sunDir: dirFrom(210, 52),
    sunColor: C('#fff3df', 3.3),
    zenith: C('#2462c8', 0.66),
    horizon: C('#a6d3ea', 1.0),
    ground: C('#2c5a78', 0.5),
    glow: C('#fff1d6', 0.45),
    gradient: 0.42,
    glowWidth: 24,
    glowStrength: 0.9,
    sunSize: 0.7,
    cloud: { cover: 0.34, soft: 0.22, bright: 1.35, scale: 1.1, lit: C('#ffffff'), shade: C('#aab6c6') },
  },
  light: {
    sun: C('#fff3df'),
    sunIntensity: 3.3,
    hemiSky: C('#bcd8f5'),
    hemiGround: C('#e8dcc0'),
    hemi: 0.35,
    env: 0.9,
  },
  exposure: 1.0,
  fog: 0.00022,
  bloom: { strength: 0.18, threshold: 2.2, radius: 0.45 },
  grade: { saturation: 1.1, contrast: 0.12, vignette: 0.18 },
  water: {
    absorb: [0.42, 0.075, 0.052],
    scatter: C('#0a4d63', 0.42),
    ambient: C('#a8c8e8', 0.95),
    ripples: 0.85,
    refraction: 0.035,
    caustics: 1.25,
    roughness: 0.075,
    shoreFoam: 1,
    reflection: 1,
    glitter: 1,
    fog: 0.00022,
    wind: [0.8, 0.5],
    swell: [
      { dir: 60, length: 34, amp: 0.07 },
      { dir: 95, length: 19, amp: 0.04 },
      { dir: 20, length: 11, amp: 0.018 },
    ],
  },
  ground: {
    sand: '#e9dcc0',
    wet: '#b5a584',
    bed: '#e3d6b6',
    grass: '#5e7a2e',
    grass2: '#7d8a3a',
    rock: '#4a443e',
    coral: true,
    grassLevel: 1.3,
    rockSlope: 0.6,
    wetTop: 0.45,
  },
  animals: { dolphins: true, turtles: 4, fish: 'tropical', birds: 'gull', ducks: 0 },
  // open-water spots for wave bumps (Big kid ramps too)
  bumps: [
    { x: 0, z: -60, angle: 1.2 },
    { x: 130, z: -20, angle: 2.4 },
    { x: -40, z: 100, angle: 0.4 },
    { x: 240, z: 60, angle: 2.0 },
    { x: -230, z: -150, angle: 0.9 },
    { x: 60, z: 250, angle: 3.3 },
  ],
  ramps: [
    { x: -30, z: -110, angle: 1.6 },
    { x: 200, z: -100, angle: 2.2 },
    { x: -200, z: 60, angle: 0.2 },
  ],
};

// ------------------------------------------------------------ scenery

function thatchHut(r) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.85 });
  const thatch = new THREE.MeshStandardMaterial({ color: 0xb49a62, roughness: 0.95 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 6), wood);
  deck.position.y = 1.6;
  g.add(deck);
  for (const [x, z] of [[-2.7, -2.7], [2.7, -2.7], [-2.7, 2.7], [2.7, 2.7], [0, 2.7], [0, -2.7]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.2, 7), wood);
    post.position.set(x, -0.4, z);
    g.add(post);
  }
  const walls = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 4.4), new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9 }));
  walls.position.y = 2.85;
  g.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.3, 2.6, 4, 1), thatch);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 5.2;
  g.add(roof);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  g.rotation.y = r;
  return g;
}

export async function build({ quality }) {
  const group = new THREE.Group();
  group.name = 'lagoon';
  const r = rng(99);

  // palms on every island and islet, keeping to dry sand and grass
  const spots = [];
  const tryPalm = (x, z) => {
    const h = height(x, z);
    if (h < 0.55 || h > 6) return;
    spots.push({ x, y: h - 0.15, z, ry: r() * Math.PI * 2, s: 0.85 + r() * 0.35 });
  };
  for (const isl of [...ISLANDS.slice(0, 5)]) {
    const n = Math.round(isl.r * isl.r * 0.012) + 3;
    for (let i = 0; i < n * 3 && spots.length < 400; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * isl.r * (isl.sx ?? 1) * 0.95;
      tryPalm(isl.x + Math.cos(a) * d, isl.z + Math.sin(a) * d * (isl.sz ?? 1));
    }
  }
  for (const m of MOTU) {
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * m.r * 1.5;
      tryPalm(m.x + Math.cos(a) * d, m.z + Math.sin(a) * d);
    }
  }
  const maxPalms = quality.tier === 'low' ? 160 : 320;
  const palms = makePalms(spots.slice(0, maxPalms), 3);
  group.add(palms);

  // volcanic rocks
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3e3935, roughness: 0.82, metalness: 0 });
  const rockGeos = [rockGeometry(3), rockGeometry(8), rockGeometry(13)];
  rockGeos.forEach((geo, k) => {
    const items = ROCKS.filter((_, i) => i % 3 === k).map((rk) => ({ x: rk.x, y: -0.6, z: rk.z, s: rk.r, sy: 1.1 + r() * 0.5, ry: r() * 6 }));
    // smaller boulders scattered on beaches
    for (const isl of ISLANDS.slice(0, 4)) {
      for (let i = 0; i < 4; i++) {
        const a = r() * Math.PI * 2;
        const x = isl.x + Math.cos(a) * isl.r * 1.02;
        const z = isl.z + Math.sin(a) * isl.r * 1.02 * (isl.sz ?? 1);
        items.push({ x, y: height(x, z) - 0.2, z, s: 0.6 + r() * 0.9, ry: r() * 6 });
      }
    }
    group.add(instances(geo, rockMat, items));
  });

  // coral heads in the shallows round the islands, seen through the water
  const coralMats = [
    new THREE.MeshStandardMaterial({ color: 0xc97a6e, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: 0x8a7bb0, roughness: 0.7 }),
  ];
  const coralGeo = rockGeometry(31, 2);
  coralMats.forEach((mat, k) => {
    const items = [];
    for (let i = 0; i < 90; i++) {
      const isl = ISLANDS[i % 5];
      const a = r() * Math.PI * 2;
      const d = isl.r * (1.15 + r() * 0.9);
      const x = isl.x + Math.cos(a) * d * (isl.sx ?? 1);
      const z = isl.z + Math.sin(a) * d * (isl.sz ?? 1);
      const h = height(x, z);
      if (h > -1.6 || h < -6) continue;
      if ((i + k) % 3 !== 0) continue;
      items.push({ x, y: h - 0.1, z, s: 0.5 + r() * 0.9, sy: 0.6 + r() * 0.5, ry: r() * 6 });
    }
    group.add(instances(coralGeo, mat, items, { shadow: false }));
  });

  // a thatched hut on stilts off the big island
  const hut = thatchHut(0.6);
  hut.position.set(-140 + 52, 0, -40 + 18);
  group.add(hut);

  // a far volcanic island on the horizon
  const far = new THREE.Mesh(
    new THREE.ConeGeometry(420, 260, 48, 8),
    new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 1 }),
  );
  {
    const p = far.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.18 * noise.fbm(v.x * 0.01 + 5, v.z * 0.01, 4);
      p.setXYZ(i, v.x * k, v.y * (0.9 + 0.2 * noise.noise(v.x * 0.02, v.z * 0.02)), v.z * k);
    }
    far.geometry.computeVertexNormals();
  }
  far.position.set(-1500, 60, -2600);
  group.add(far);

  return {
    group,
    update(dt, t) {
      palms.userData.update(t);
    },
    // where a spot is out of the way of everything (for courses and shells)
    islands: ISLANDS,
  };
}
