// Sunny Playroom: a wooden toy marble run on a sunlit table. Natural beech
// and painted blocks, wooden troughs, a clear tube across the top, an
// orange spiral bowl funnel, a blue loop-the-loop, a water wheel with
// coloured segments, three brass bells in a row, a clear spiral-screw lift
// with a red cup on top, and a little zig-zag run beside it that ends at a
// single bell.
import * as THREE from 'three';
import { pillarBlocks } from '../skin.js';

export const id = 'sunny';

// cell (0, 0) of the build grid, on the table top
export const grid = {
  origin: new THREE.Vector3(0.02, 0, -0.1),
  min: [-15, -3],
  max: [9, 8],
};

export const ground = { y: 0, surface: 'wood', bounds: { minX: -1.1, maxX: 0.9, minZ: -0.45, maxZ: 0.6 } };

export const palette = 'sunny';

// The ready-made run. Levels are 1 cm steps; see track/pieces.js.
export const layout = [
  // the lift in the left tower: marbles ride a turning screw up a clear
  // tube to the red cup, where tapped-in marbles are dropped too
  { type: 'lift', i: -5, j: 1, level: 0, rot: 2, h: 48, out: 'W' },
  // across the top, through a clear tube
  { type: 'long', i: -4, j: 1, level: 47 },
  { type: 'tube3', i: -2, j: 1, level: 45 },
  { type: 'long', i: 1, j: 1, level: 44 },
  { type: 'straight', i: 3, j: 1, level: 43 },
  // round the right tower and back towards the funnel
  { type: 'uturnR', i: 4, j: 1, level: 41, tint: 'white' },
  { type: 'straight', i: 3, j: 2, level: 40, rot: 2 },
  { type: 'funnel', i: 2, j: 3, level: 31, rot: 2 },
  // a flipper sends marbles alternately to the bells and loop, or the wheel
  { type: 'splitter', i: 0, j: 3, level: 30, rot: 2, tint: 'yellow' },
  { type: 'curveL', i: 0, j: 4, level: 29, rot: 1, tint: 'orange' },
  { type: 'bell', i: 1, j: 4, level: 28 },
  { type: 'bell', i: 2, j: 4, level: 27 },
  { type: 'bell', i: 3, j: 4, level: 26 },
  { type: 'loop', i: 4, j: 4, level: 13, tint: 'blue' },
  { type: 'uturnR', i: 7, j: 5, level: 11, tint: 'yellow' },
  { type: 'long', i: 6, j: 6, level: 10, rot: 2, tint: 'blue' },
  { type: 'long', i: 4, j: 6, level: 9, rot: 2 },
  { type: 'tube3', i: 2, j: 6, level: 7, rot: 2 },
  { type: 'long', i: -1, j: 6, level: 6, rot: 2 },
  { type: 'curveR', i: -3, j: 6, level: 5, rot: 2 },
  { type: 'long', i: -3, j: 5, level: 4, rot: 3 },
  { type: 'long', i: -3, j: 3, level: 3, rot: 3 },
  { type: 'curveL', i: -3, j: 1, level: 2, rot: 3 },
  { type: 'straight', i: -4, j: 1, level: 1, rot: 2 },
  // the other way from the flipper: over the water wheel to a tray
  { type: 'curveL', i: 0, j: 2, level: 29, rot: 3, tint: 'orange' },
  { type: 'wheel', i: -1, j: 2, level: 19, rot: 2 },
  { type: 'straight', i: 0, j: 2, level: 18 },
  { type: 'long', i: 1, j: 2, level: 17 },
  { type: 'catcher', i: 3, j: 2, level: 16 },
  // the little run on the left: a dish at the top, a zig-zag and a bell
  { type: 'start', i: -13, j: 4, level: 22 },
  { type: 'long', i: -12, j: 4, level: 21 },
  { type: 'long', i: -10, j: 4, level: 20 },
  { type: 'uturnR', i: -8, j: 4, level: 18 },
  { type: 'long', i: -9, j: 5, level: 17, rot: 2 },
  { type: 'long', i: -11, j: 5, level: 16, rot: 2 },
  { type: 'uturnL', i: -13, j: 5, level: 14, rot: 2 },
  { type: 'long', i: -12, j: 6, level: 13 },
  { type: 'long', i: -10, j: 6, level: 12 },
  { type: 'bell', i: -8, j: 6, level: 11, bellIndex: 3 },
  { type: 'catcher', i: -7, j: 6, level: 10 },
];

// What Big kid builders get to place on this level.
export const kit = ['straight', 'long', 'steep', 'curveL', 'curveR', 'bendL', 'bendR', 'uturnL', 'uturnR', 'drop', 'tube2', 'funnel', 'loop', 'wheel', 'bell', 'splitter', 'catcher', 'goal', 'start', 'lift'];

// Materials and styles for this level's pieces.
export function theme(mats) {
  const beech = mats.wood({ species: 'beech', mapping: 'uv', finish: 'oiled' });
  const beechBlock = mats.wood({ species: 'beech', mapping: 'object', finish: 'oiled', grain: 'y' });
  const mapleBlock = mats.wood({ species: 'maple', mapping: 'object', finish: 'oiled', grain: 'x' });
  const paints = ['#c3272a', '#2059ad', '#efb31c', '#2e9447'].map((color) => mats.paint({ color, mapping: 'object' }));
  const tints = {
    blue: mats.plastic({ color: '#1f5fd6' }),
    yellow: mats.plastic({ color: '#ffc21c' }),
    orange: mats.plastic({ color: '#ff7a14' }),
    white: mats.plastic({ color: '#f1efe8' }),
    red: mats.plastic({ color: '#e0261f' }),
  };
  const acrylic = mats.acrylic({ tint: '#f4fbff' });
  const brass = mats.brass({ polish: 0.85, age: 0.2 });
  const walnut = mats.wood({ species: 'walnut', mapping: 'object', finish: 'oiled' });
  return {
    trough: { mat: beech, top: 0.004, width: 0.042 },
    tinted: (tint) => ({ kind: 'shell', mat: tints[tint] || beech, top: 0.007, thickness: 0.0026 }),
    loop: { kind: 'shell', mat: tints.blue, top: 0.009, thickness: 0.003 },
    tube: { mat: acrylic, thickness: 0.0016 },
    enclosed: { mat: acrylic },
    funnel: { mat: tints.orange, stemMat: tints.orange },
    bell: { mat: brass, bead: walnut, clapper: brass, frame: { mat: beech }, size: 0.016 },
    wheel: { segmentMats: [paints[0], paints[2], paints[1], paints[3]], paddle: tints.blue, hub: tints.blue, cover: acrylic, mat: tints.blue },
    spinner: { mat: brass, tip: paints[0] },
    splitter: { mat: tints.yellow },
    cup: { mat: tints.red, neck: acrylic },
    lift: { tube: acrylic, screw: mats.plastic({ color: '#e9f3fb' }), cap: tints.red },
    goal: { flag: paints[0], pole: beech },
    // blocks under the pieces: mostly natural beech, some painted
    block(inst, seed) {
      const h = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
      if (h < 0.42) return beechBlock;
      if (h < 0.55) return mapleBlock;
      return paints[Math.floor(((h - 0.55) / 0.45) * 4) % 4];
    },
    pillar: pillarBlocks,
  };
}

export const cameraDefault = { target: new THREE.Vector3(-0.12, 0.17, 0.04), distance: 1.55, azimuth: THREE.MathUtils.degToRad(-8), elevation: THREE.MathUtils.degToRad(18), fov: 34 };

export async function setting(ctx) {
  const mod = await import('./sunny-setting.js');
  return mod.createSunnySetting(ctx);
}
