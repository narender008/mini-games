// Canal Town: a sunny late afternoon in a little harbour town somewhere
// between Amsterdam, Copenhagen's Nyhavn and Burano. Two canal rings curve
// round the old town between stone quays and rows of tall, narrow,
// colourful gabled houses with flower boxes at the windows; lime trees,
// lamps and moored boats line the quays; four bridges (two tall stone
// arches, a white wooden footbridge and a row of little houses on an arch)
// span the canals high enough for every boat to pass under. Both rings open
// into the harbour basin, where a breakwater with a lighthouse keeps the
// sea out, and a church spire and a windmill stand over the roofs.
//
// The plan (water, heights, solid map, bridges, moored boats) is in
// canal-layout.js; the scenery is built from one shared town material
// (canal-kit.js) by canal-quays.js, canal-houses.js, canal-bridges.js and
// canal-props.js.
import * as THREE from 'three';
import { dirFrom } from '../sky.js';
import { height, solid, CZ } from './canal-layout.js';

export { height, solid };

const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const PLACE = {
  id: 'canal',
  area: { minX: -380, maxX: 380, minZ: -290, maxZ: 290 },
  terrain: { minX: -420, maxX: 420, minZ: -330, maxZ: 330 },
  height,
  solid,
  spawn: { x: -40, z: 178, heading: 0 },
  sky: {
    sunDir: dirFrom(236, 27),
    sunColor: C('#ffe4bf', 3.2),
    zenith: C('#3f74c4', 0.62),
    horizon: C('#c9dcea', 1.0),
    ground: C('#4a5560', 0.5),
    glow: C('#ffe2b8', 0.6),
    gradient: 0.45,
    glowWidth: 16,
    glowStrength: 0.8,
    sunSize: 0.7,
    cloud: { cover: 0.26, soft: 0.24, bright: 1.3, scale: 1.2, lit: C('#fff6ea'), shade: C('#a9b3c4') },
  },
  light: {
    sun: C('#ffe2bc'),
    sunIntensity: 3.0,
    hemiSky: C('#b9cfe8'),
    hemiGround: C('#b8a48a'),
    hemi: 0.4,
    env: 0.9,
  },
  exposure: 1.0,
  fog: 0.0005,
  bloom: { strength: 0.16, threshold: 2.2, radius: 0.45 },
  grade: { saturation: 1.06, contrast: 0.1, vignette: 0.18 },
  water: {
    // calm, slightly green canal water: murky enough to hide the bed
    absorb: [0.62, 0.26, 0.34],
    scatter: C('#1f4a40', 0.3),
    ambient: C('#b4c6dc', 0.9),
    ripples: 0.32,
    refraction: 0.02,
    caustics: 0.3,
    roughness: 0.05,
    shoreFoam: 0.22,
    reflection: 1,
    glitter: 0.9,
    fog: 0.0005,
    wind: [0.6, 0.4],
    swell: [
      { dir: 40, length: 16, amp: 0.022 },
      { dir: 105, length: 9, amp: 0.011 },
      { dir: -15, length: 5.5, amp: 0.005 },
    ],
  },
  ground: {
    sand: '#8e877b',
    wet: '#4f4a40',
    bed: '#4d4a3a',
    grass: '#55682f',
    grass2: '#6b7a38',
    rock: '#6e6960',
    coral: false,
    grassLevel: 40,
    rockSlope: 0.55,
    wetTop: 0.2,
  },
  animals: { dolphins: false, turtles: 0, fish: 'lake', birds: 'pigeon', ducks: 3 },
  // wave bumps out in the harbour basin, where there is room
  bumps: [
    { x: -40, z: 110, angle: 0.2 },
    { x: -250, z: 125, angle: 1.3 },
    { x: 150, z: 105, angle: 2.2 },
    { x: 260, z: 190, angle: 0.8 },
    { x: -180, z: 205, angle: 2.8 },
    { x: 60, z: 200, angle: 1.9 },
  ],
  // Big kid: out of the basin up the wide outer canal, under both stone
  // bridges round the old town, and back through the basin
  course: {
    gate: { x: 0, z: 150, angle: Math.PI / 2, width: 14 },
    buoys: [
      [-190, 110],
      [-241, CZ - 65],
      [-86, CZ - 235],
      [86, CZ - 235],
      [241, CZ - 65],
      [190, 110],
    ],
  },
  ramps: [
    { x: -110, z: 190, angle: 1.0 },
    { x: 230, z: 120, angle: 2.6 },
    { x: -290, z: 190, angle: 0.4 },
  ],
};

export async function build({ quality }) {
  const group = new THREE.Group();
  group.name = 'canal';
  return { group, update() {} };
}
