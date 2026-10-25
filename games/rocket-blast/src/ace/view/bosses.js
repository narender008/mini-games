// Ace bosses: five big procedural machines, 8-12 units wide, each a static
// hull (merged into one mesh per material) plus separately animated parts
// placed every frame at the sim's part positions (S.boss.parts[i].x, y are
// world coordinates; the hull follows S.boss.x, y).
//
//   hauler       Quarry Hauler: a rust-red mining barge with ore hoppers and
//                three engines; `drill` arms on booms that follow the parts,
//                a shuttered `core` reactor
//   tempest      Tempest Array: a navy hub; `pylon` capacitor towers joined to
//                it by trusses (lightning between them is the sim's `link`
//                beam bullets, drawn by lightning() below), then the `coil`
//   crusher      Foundry Crusher: a hazard-striped press plate; four `turret`s,
//                the iris `core` whose blades open, two toothed `jaw`s on
//                hydraulic rams
//   brood        Brood Engine: a plum carapace with green veins; egg `pod`s
//                whose petals open, the armoured `core`
//   dreadnought  The Dreadnought: a warship pointing down the screen; flank
//                `battery` turrets, `rack` missile racks, the beam `cannon`,
//                the caged `core`
//
// The hulls are laid out for the part offsets in src/ace/sim/bosses.js and
// scaled by B.scale (bosses shrink on narrow phones); each part is scaled to
// its sim radius. Part kinds are matched by name with aliases (KIND_ALIAS;
// the Crusher's `core` is its iris); an unknown kind gets a generic armoured
// pod with a core, so every sim part shows. Free parts carry their own
// geometry from the sim: drills swing on `ang` from the shoulder `px, py`,
// jaws and pylons drop on rams and tethers, turrets, batteries and the beam
// cannon aim along `ang`, cores and irises open with `open`.
// Parts flash when hit (from `hitT` when the sim gives it, else from an hp
// drop), and destroyed parts turn charred, go dark and keep smoking. Each part
// has its own material instances (same shader programs) so flashes stay local.
// After `bossDead` the wreck keeps burning and shaking through the death
// sequence, then vanishes in the final blast.
import * as THREE from 'three';
import { Builder, MAT, machine, core, slab, sym, ngon, lathe, GEO, colorOf } from './kit.js';
import { SHAPE } from './bolts.js';
import { SPRITE } from '../../textures.js';

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

// per-boss paint
const PAINT = {
  hauler: { hull: 0x8a4f33, plate: 0x7c8189, accent: 'orange', top: 0.42 },
  tempest: { hull: 0x3a4558, plate: 0x6a7586, accent: 'cyan', top: 0.45 },
  crusher: { hull: 0x7b818b, plate: 0x4d535c, accent: 'orange', top: 0.62 },
  brood: { hull: 0x523868, plate: 0x86689a, accent: 'green', top: 0.75 },
  dreadnought: { hull: 0x3c434f, plate: 0x59606b, accent: 'red', top: 0.56 },
};

// size of each hull for the death sequence and the fallback
export const BOSS_SIZE = { hauler: [9, 4.5], tempest: [10, 6], crusher: [11, 5], brood: [9, 5.5], dreadnought: [12, 7.5] };

const KIND_ALIAS = {
  arm: 'drill',
  drill: 'drill',
  reactor: 'core',
  core: 'core',
  pylon: 'pylon',
  capacitor: 'pylon',
  coil: 'coil',
  turret: 'turret',
  gun: 'turret',
  iris: 'iris',
  jaw: 'jaw',
  pod: 'pod',
  hatch: 'pod',
  battery: 'battery',
  broadside: 'battery',
  rack: 'rack',
  missiles: 'rack',
  launcher: 'rack',
  cannon: 'cannon',
  beam: 'cannon',
};

// a box whose uvs repeat the texture every `tile` units (for hazard stripes)
function tiledBox(w, h, d, tile = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile));
  return g;
}

function bossMats(type, key) {
  const P = PAINT[type];
  const k = `boss-${type}-${key}`;
  return {
    hull: machine(`${k}-hull`, { color: P.hull, metalness: 0.7, roughness: 0.42, panel: 0.85, panelScale: 1.1 }),
    plate: machine(`${k}-plate`, { color: P.plate, metalness: 0.85, roughness: 0.34, panel: 0.75, panelScale: 1.4 }),
    dark: machine(`${k}-dark`, { color: 0x22262d, metalness: 0.75, roughness: 0.5, panel: 0.3 }),
    accent: P.accent,
  };
}

// ------------------------------------------------------------ hulls

function haulerHull(M) {
  const b = new Builder();
  const glow = core('orange', 3);
  b.add(slab(sym([[0, 2.1], [2.0, 2.1], [2.9, 1.5], [3.3, 0.4], [3.0, -0.8], [2.0, -1.6], [0.8, -1.95], [0, -1.95]]), 0.6, 0.14), M.hull);
  b.add(slab(sym([[0, 1.8], [1.7, 1.8], [2.5, 1.2], [2.75, 0.3], [2.4, -0.9], [1.4, -1.4], [0, -1.55]]), 0.8, 0.06), M.plate);
  // ore hoppers full of glowing ore
  for (const sx of [-1, 1]) {
    b.add(GEO.box, M.dark, { p: [sx * 1.8, 0.8, 0.42], s: [1.2, 1.2, 0.3] });
    b.add(GEO.box, M.hull, { p: [sx * 1.8, 1.42, 0.55], s: [1.3, 0.12, 0.3] });
    b.add(GEO.box, M.hull, { p: [sx * 1.8, 0.18, 0.55], s: [1.3, 0.12, 0.3] });
    for (let i = 0; i < 7; i++) {
      const a = i * 2.3;
      b.add(GEO.ico, i % 3 ? MAT.rust() : core('amber', 2.2), { p: [sx * 1.8 + Math.cos(a) * 0.36, 0.8 + Math.sin(a) * 0.32, 0.6], r: [a, a * 2, a], s: 0.3 + (i % 2) * 0.1 });
    }
  }
  // spine and pipes
  b.add(GEO.box, M.dark, { p: [0, 0.6, 0.45], s: [0.6, 2.2, 0.2] });
  for (const sx of [-1, 1]) b.add(GEO.cyl, MAT.steel(), { p: [sx * 0.4, 0.6, 0.55], s: [0.12, 2.4, 0.12] });
  // engines on the back (top of the screen)
  for (const x of [-1.6, 0, 1.6]) {
    b.add(GEO.cyl, M.dark, { p: [x, 2.25, 0], s: [0.8, 0.5, 0.6] });
    b.add(GEO.disc, glow, { p: [x, 2.52, 0], s: [0.6, 1, 0.45] });
  }
  // hazard band on the bow and running lights
  b.add(tiledBox(2.6, 0.22, 0.9, 0.4), MAT.hazard(), { p: [0, -1.65, 0] });
  for (const sx of [-1, 1]) {
    b.add(GEO.box, glow, { p: [sx * 3.05, 0.4, 0.2], s: [0.1, 0.6, 0.1] });
    b.add(GEO.cyl, M.dark, { p: [sx * 3.3, -0.4, 0.2], r: [HALF_PI, 0, 0], s: [0.9, 0.5, 0.9] }); // drill shoulders
    b.add(GEO.cyl, MAT.steel(), { p: [sx * 3.3, -0.4, 0.45], r: [HALF_PI, 0, 0], s: [0.5, 0.12, 0.5] });
  }
  return { b, glows: [[-1.6, 2.6, 1.6], [0, 2.6, 1.6], [1.6, 2.6, 1.6]] };
}

function tempestHull(M) {
  const b = new Builder();
  const glow = core('cyan', 2.4);
  b.add(slab(ngon(6, 1.9, HALF_PI), 0.7, 0.12), M.hull, { p: [0, 0.9, 0] });
  b.add(slab(ngon(6, 1.45, HALF_PI), 0.85, 0.05), M.plate, { p: [0, 0.9, 0] });
  // capacitor cells round the hub
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    b.add(GEO.box, M.dark, { p: [Math.cos(a) * 1.65, 0.9 + Math.sin(a) * 1.65, 0.45], r: [0, 0, a], s: [0.35, 0.18, 0.25] });
    if (i % 2) b.add(GEO.box, glow, { p: [Math.cos(a) * 1.65, 0.9 + Math.sin(a) * 1.65, 0.6], r: [0, 0, a], s: [0.2, 0.06, 0.05] });
  }
  // fins at the back and an engine pair
  for (const sx of [-1, 1]) {
    b.add(slab([[0, 0], [1.6, 0.8], [1.8, 1.2], [0.4, 0.9]], 0.2, 0.05), M.hull, { p: [sx * 1.2, 1.9, -0.1], s: [sx, 1, 1] });
    b.add(GEO.cyl, M.dark, { p: [sx * 0.7, 2.9, 0], s: [0.5, 0.4, 0.4] });
    b.add(GEO.disc, glow, { p: [sx * 0.7, 3.12, 0], s: [0.38, 1, 0.3] });
    // pylon mounts on the hub
    b.add(GEO.box, M.dark, { p: [sx * 1.9, 0.3, 0.2], r: [0, 0, sx * -0.3], s: [1.0, 0.5, 0.4] });
  }
  b.add(GEO.box, M.dark, { p: [0, -0.9, 0.2], s: [0.5, 0.9, 0.4] });
  return { b, glows: [[-0.7, 3.2, 1.1], [0.7, 3.2, 1.1]] };
}

function crusherHull(M) {
  const b = new Builder();
  const glow = core('orange', 3);
  b.add(slab(sym([[0, 2.6], [3.6, 2.6], [5.1, 1.3], [5.1, -0.5], [4.2, -1.6], [0, -1.6]]), 0.7, 0.14), M.hull);
  b.add(slab(sym([[0, 2.3], [3.3, 2.3], [4.6, 1.2], [4.6, -0.4], [3.9, -1.25], [0, -1.25]]), 0.8, 0.04), M.plate);
  // a recessed well for the iris
  b.add(GEO.cyl, M.dark, { p: [0, 0.15, 0.35], r: [HALF_PI, 0, 0], s: [3.0, 0.2, 3.0] });
  // raised armour slabs at the shoulders, with bolt rows
  for (const sx of [-1, 1]) {
    b.add(slab([[0, 0], [1.6, 0], [2.3, -0.7], [2.3, -1.6], [0, -1.6]], 0.3, 0.07), M.hull, { p: [sx * 2.2, 2.1, 0.45], s: [sx, 1, 1] });
    for (let i = 0; i < 6; i++) b.add(GEO.cyl8, MAT.steel(), { p: [sx * (2.4 + i * 0.3), 1.95, 0.62], r: [HALF_PI, 0, 0], s: [0.07, 0.04, 0.07] });
  }
  // vents and grilles
  b.add(GEO.box, M.dark, { p: [0, 2.1, 0.45], s: [2.6, 0.32, 0.1] });
  for (let i = 0; i < 9; i++) b.add(GEO.box, M.plate, { p: [-1.2 + i * 0.3, 2.1, 0.5], s: [0.08, 0.3, 0.06] });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) b.add(GEO.box, glow, { p: [sx * 2.2, 0.75 - i * 0.18, 0.46], s: [0.9, 0.05, 0.05] });
    b.add(GEO.box, M.dark, { p: [sx * 2.2, 0.48, 0.42], s: [1.1, 0.8, 0.06] });
  }
  // hazard bands on the jaw mounts and the lower edge
  b.add(tiledBox(8.2, 0.26, 0.9, 0.45), MAT.hazard(), { p: [0, -1.5, 0] });
  for (const sx of [-1, 1]) {
    b.add(tiledBox(0.26, 3.2, 0.9, 0.45), MAT.hazard(), { p: [sx * 4.95, 0.4, 0] });
    b.add(GEO.cyl, MAT.steel(), { p: [sx * 4.7, -1.2, 0.1], s: [0.5, 0.9, 0.5] }); // ram sleeves
  }
  return { b, glows: [] };
}

// a curved band of points from angle a0 to a1 between radii r0 and r1
function band(r0, r1, a0, a1, n = 12, sy = 1) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([Math.cos(a) * r1, Math.sin(a) * r1 * sy]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([Math.cos(a) * r0, Math.sin(a) * r0 * sy]);
  }
  return pts;
}

function broodHull(M) {
  const b = new Builder();
  const vein = core('green', 2.4);
  const pink = core('magenta', 2.4);
  // the body: a broad beetle-like hull
  b.add(slab(sym([[0, 2.9], [1.6, 2.7], [3.3, 1.8], [4.3, 0.4], [4.0, -1.0], [2.8, -2.0], [1.2, -2.5], [0, -2.4]]), 0.8, 0.3), M.hull);
  // overlapping armour segments, like a carapace, each lit along its edge
  for (let i = 0; i < 4; i++) {
    const r = 3.6 - i * 0.62;
    b.add(slab(band(r - 0.55, r, 0.22, Math.PI - 0.22, 18, 0.72), 0.3, 0.1), M.plate, { p: [0, -0.2 + i * 0.12, 0.42 + i * 0.1] });
    b.add(slab(band(r - 0.08, r, 0.3, Math.PI - 0.3, 18, 0.72), 0.32, 0.01), vein, { p: [0, -0.2 + i * 0.12, 0.46 + i * 0.1] });
  }
  // a spine ridge and rows of spikes round the rim
  b.add(slab(sym([[0, 2.7], [0.25, 2.4], [0.2, -0.4], [0, -0.6]]), 1.3, 0.06), M.dark);
  for (let i = 0; i < 9; i++) {
    const a = -0.4 + (i / 8) * (Math.PI + 0.8);
    const x = Math.cos(a) * 4.15;
    const y = Math.sin(a) * 2.45 + 0.1;
    b.add(GEO.cone, MAT.steel(), { p: [x, y, 0.1], r: [0, 0, a - HALF_PI], s: [0.22, 0.6, 0.22] });
  }
  for (const sx of [-1, 1]) {
    // mandible claws at the front
    b.add(slab([[0, 0], [0.9, -0.4], [1.3, -1.6], [1.0, -2.0], [0.7, -1.0], [0, -0.6]], 0.3, 0.06), M.dark, { p: [sx * 1.0, -1.6, 0], s: [sx, 1, 1] });
    b.add(GEO.cone, MAT.steel(), { p: [sx * 2.15, -3.45, 0], r: [Math.PI, 0, 0], s: [0.25, 0.5, 0.25] });
    // vent sacs at the back
    b.add(GEO.sphere, pink, { p: [sx * 0.9, 2.75, 0.2], s: [0.55, 0.32, 0.25] });
  }
  return { b, glows: [[-0.9, 3.0, 1.2], [0.9, 3.0, 1.2]] };
}

function dreadHull(M) {
  const b = new Builder();
  const glow = core('orange', 3.5);
  const red = MAT.red();
  b.add(slab(sym([[0, 3.6], [2.6, 3.6], [4.4, 2.6], [6.0, 1.2], [6.0, 0.2], [4.6, -1.0], [2.6, -2.4], [1.2, -3.6], [0, -3.9]]), 0.8, 0.16), M.hull);
  b.add(slab(sym([[0, 3.2], [2.2, 3.2], [3.6, 2.2], [4.4, 1.0], [3.8, -0.4], [2.0, -1.8], [0.9, -2.9], [0, -3.1]]), 1.0, 0.06), M.plate);
  // superstructure tiers and the bridge
  b.add(slab(sym([[0, 2.9], [1.4, 2.9], [2.0, 2.2], [1.6, 1.3], [0, 1.1]]), 1.4, 0.05), M.hull);
  b.add(GEO.box, M.dark, { p: [0, 2.2, 0.85], s: [1.2, 0.8, 0.3] });
  b.add(GEO.box, glow, { p: [0, 2.0, 1.0], s: [0.9, 0.08, 0.05] });
  for (const sx of [-1, 1]) {
    // red flank stripes along the outer hull and the prow
    b.add(GEO.box, red, { p: [sx * 5.15, 0.45, 0.42], r: [0, 0, sx * 0.72], s: [1.5, 0.14, 0.06] });
    b.add(GEO.box, red, { p: [sx * 1.55, -2.85, 0.58], r: [0, 0, sx * 0.86], s: [1.2, 0.12, 0.06] });
    // armour ribs on the outer hull
    for (let i = 0; i < 5; i++) b.add(GEO.box, M.dark, { p: [sx * (5.55 - i * 0.42), 1.75 - i * 0.48, 0.42], r: [0, 0, sx * 0.75], s: [0.5, 0.1, 0.06] });
    // trenches and vent banks on the deck
    b.add(GEO.box, M.dark, { p: [sx * 2.9, 0.2, 0.56], s: [0.18, 2.6, 0.06] });
    for (let i = 0; i < 6; i++) b.add(GEO.box, M.dark, { p: [sx * 3.45, -0.55 + i * 0.22, 0.56], s: [0.7, 0.08, 0.05] });
    b.add(GEO.box, M.dark, { p: [sx * 1.2, -1.75, 0.56], r: [0, 0, sx * 0.9], s: [1.6, 0.12, 0.05] });
    // running lights
    for (let i = 0; i < 4; i++) b.add(GEO.box, glow, { p: [sx * (4.3 + i * 0.4), 2.35 - i * 0.36, 0.42], r: [0, 0, sx * 0.72], s: [0.18, 0.05, 0.05] });
  }
  b.add(tiledBox(2.2, 0.24, 1.06, 0.45), MAT.hazard(), { p: [0, -2.15, 0] });
  // engines across the stern
  for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) {
    b.add(GEO.cyl, M.dark, { p: [x, 3.75, 0], s: [0.9, 0.5, 0.7] });
    b.add(GEO.disc, glow, { p: [x, 4.02, 0], s: [0.7, 1, 0.5] });
  }
  return { b, glows: [-3.2, -1.6, 0, 1.6, 3.2].map((x) => [x, 4.1, 1.6]) };
}

const HULLS = { hauler: haulerHull, tempest: tempestHull, crusher: crusherHull, brood: broodHull, dreadnought: dreadHull };

// ------------------------------------------------------------ parts
// Each returns { root, spin?, anim(pv, p, ctx) } built from the part's own
// material set M; meshes on lit materials flash and char, glowing ones go dark.

function turretPart(M, scale = 1, color = 'yellow') {
  const base = new Builder();
  base.add(slab(ngon(6, 0.62, 0), 0.3, 0.06), M.hull);
  base.add(slab(ngon(6, 0.48, 0), 0.4, 0.02), M.dark);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    base.add(GEO.cyl8, MAT.steel(), { p: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.17], r: [HALF_PI, 0, 0], s: [0.07, 0.04, 0.07] });
  }
  const head = new Builder();
  head.add(slab(ngon(6, 0.4, HALF_PI), 0.3, 0.08), M.plate, { p: [0, 0, 0.3] });
  head.add(GEO.sphere, M.plate, { p: [0, -0.05, 0.42], s: [0.5, 0.5, 0.3] });
  head.mirror(GEO.box, M.dark, { p: [0.11, 0.38, 0.38], s: [0.12, 0.3, 0.12] });
  head.mirror(GEO.cyl, M.dark, { p: [0.11, 0.62, 0.38], s: [0.09, 0.55, 0.09] });
  head.mirror(GEO.cyl, MAT.steel(), { p: [0.11, 0.88, 0.38], s: [0.12, 0.06, 0.12] });
  head.add(GEO.cyl, MAT.dark(), { p: [0, -0.05, 0.55], r: [HALF_PI, 0, 0], s: [0.3, 0.04, 0.3] });
  head.add(GEO.cyl, core(color, 3.2), { p: [0, -0.05, 0.58], r: [HALF_PI, 0, 0], s: [0.2, 0.04, 0.2] });
  const root = base.group();
  const h = head.group();
  root.add(h);
  root.scale.setScalar(scale);
  return {
    root,
    anim: (pv, p, ctx) => {
      if (!p.dead) h.rotation.z = aimOf(p, ctx) - HALF_PI;
    },
    radius: 0.62 * scale,
  };
}

// a part's aim: the sim's angle (`ang`, or `angle`), else at the player
function aimOf(p, ctx) {
  if (typeof p.ang === 'number') return p.ang;
  if (typeof p.angle === 'number') return p.angle;
  return Math.atan2(ctx.py - p.y, ctx.px - p.x);
}

function drillPart(M, shoulderX) {
  const root = new THREE.Group();
  const bit = new Builder();
  bit.add(lathe([[0, 0.3], [0.45, 0.2], [0.42, -0.2], [0.05, -1.3], [0, -1.32]], 20), MAT.steel());
  for (let i = 0; i < 6; i++) {
    const y = -0.15 - i * 0.18;
    const r = 0.4 - i * 0.06;
    bit.add(GEO.torus, M.dark, { p: [0, y, 0], r: [HALF_PI, 0, i * 0.4], s: [r * 2, r * 2, 0.8] });
  }
  const spin = bit.group();
  const head = new Builder();
  head.add(GEO.cyl, M.hull, { p: [0, 0.5, 0], s: [1.0, 0.7, 0.9] });
  head.add(GEO.box, M.dark, { p: [0, 0.5, 0.42], s: [0.6, 0.4, 0.1] });
  head.add(GEO.box, core('orange', 3), { p: [0, 0.5, 0.48], s: [0.4, 0.08, 0.05] });
  root.add(head.group(), spin);
  // the boom from the shoulder on the hull to the drill head
  const boom = new THREE.Mesh(GEO.box, M.plate);
  const rail = new THREE.Mesh(GEO.box, M.dark);
  const boomG = new THREE.Group();
  boomG.add(boom, rail);
  return {
    root,
    extra: boomG,
    anim: (pv, p, ctx) => {
      if (!p.dead) spin.rotation.y = ctx.t * 9;
      // the drill points along the arm (`ang`), the boom runs from the
      // shoulder (`px, py`, or a point on the hull) to the drill head
      const a = typeof p.ang === 'number' ? p.ang : Math.atan2(p.y - ctx.by, p.x - ctx.bx);
      pv.holder.rotation.z = a + HALF_PI;
      const k = ctx.scale;
      const x0 = p.px ?? ctx.bx + Math.sign(p.x - ctx.bx || shoulderX) * 3.3 * k;
      const y0 = p.py ?? ctx.by - 0.4 * k;
      const x1 = p.x - Math.cos(a) * 0.5 * pv.holder.scale.x;
      const y1 = p.y - Math.sin(a) * 0.5 * pv.holder.scale.x;
      const len = Math.hypot(x1 - x0, y1 - y0);
      boomG.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.25 * k);
      boomG.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      boom.scale.set(len, 0.42 * k, 0.35 * k);
      rail.scale.set(len * 0.9, 0.12 * k, 0.42 * k);
    },
    radius: 0.95,
  };
}

function corePart(M, color, { shutters = 4, cage = false, arcs = false, size = 1, intensity = 4 } = {}) {
  const root = new THREE.Group();
  const shell = new Builder();
  shell.add(GEO.cyl, M.dark, { p: [0, 0, 0.3], r: [HALF_PI, 0, 0], s: [1.6, 0.3, 1.6] });
  shell.add(GEO.torus, M.plate, { p: [0, 0, 0.45], s: [1.7, 1.7, 2.2] });
  root.add(shell.group());
  const orb = new THREE.Mesh(GEO.sphere, core(color, intensity));
  orb.position.z = 0.45;
  orb.scale.set(0.95, 0.95, 0.6);
  root.add(orb);
  const sh = [];
  for (let i = 0; i < shutters; i++) {
    const g = new THREE.Group();
    g.rotation.z = (i / shutters) * TAU;
    const b = new Builder();
    b.add(slab([[0, 0.05], [0.72, 0.05], [0.6, 0.6], [0, 0.85]].map(([x, y]) => [x * Math.cos(0) - y * 0, y]), 0.12, 0.03), M.hull, { r: [0, 0, -Math.PI / shutters] });
    const m = b.group();
    m.position.z = 0.75;
    g.add(m);
    sh.push(m);
    root.add(g);
  }
  if (cage) {
    // a hexagonal armour collar with heavy bolts
    const c = new Builder();
    c.add(slab(ngon(6, 1.35, 0), 0.3, 0.06), M.plate, { p: [0, 0, 0.35] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      c.add(GEO.box, M.dark, { p: [Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0.55], r: [0, 0, a], s: [0.22, 0.42, 0.14] });
    }
    root.add(c.group());
  }
  if (arcs) {
    // three curved armour plates that circle the core
    const c = new Builder();
    const arcGeo = new THREE.TorusGeometry(1.0, 0.16, 8, 20, TAU / 4.6);
    for (let i = 0; i < 3; i++) c.add(arcGeo, M.hull, { p: [0, 0, 0.6], r: [0, 0, (i / 3) * TAU], s: [1, 1, 1.4] });
    const cg = c.group();
    root.add(cg);
    root.userData.cage = cg;
  }
  root.scale.setScalar(size);
  let openK = 0;
  return {
    root,
    anim: (pv, p, ctx) => {
      const open = p.open ?? (ctx.vulnerable(p) ? 1 : 0);
      openK += ((open ? 1 : 0) - openK) * (1 - Math.exp(-ctx.dt * 4));
      for (const m of sh) m.position.y = openK * 0.9;
      orb.scale.setScalar(0.95 * (0.92 + 0.08 * Math.sin(ctx.t * 6)));
      orb.scale.z = 0.6;
      if (root.userData.cage) root.userData.cage.rotation.z = ctx.t * 0.4;
    },
    radius: 0.85 * size,
  };
}

function pylonPart(M) {
  const root = new THREE.Group();
  const b = new Builder();
  b.add(slab(ngon(6, 0.85, HALF_PI), 0.4, 0.08), M.hull);
  b.add(slab(ngon(6, 0.65, HALF_PI), 0.5, 0.03), M.dark);
  for (let i = 0; i < 3; i++) b.add(GEO.cyl8, M.plate, { p: [Math.cos(i * 2.09) * 0.55, Math.sin(i * 2.09) * 0.55, 0.4], r: [HALF_PI, 0, 0], s: [0.14, 0.6, 0.14] });
  root.add(b.group());
  const coils = new Builder();
  const cy = core('cyan', 1.6);
  for (let i = 0; i < 3; i++) coils.add(GEO.torus, cy, { p: [0, 0, 0.45 + i * 0.22], s: [1.0 - i * 0.22, 1.0 - i * 0.22, 1.4] });
  coils.add(GEO.sphere, core('white', 2.2), { p: [0, 0, 1.15], s: 0.3 });
  const c = coils.group();
  root.add(c);
  return {
    root,
    truss: true,
    anim: (pv, p, ctx) => {
      c.rotation.z = ctx.t * 2;
    },
    radius: 0.85,
  };
}

function coilPart(M) {
  const root = new THREE.Group();
  const b = new Builder();
  b.add(GEO.cyl, M.dark, { p: [0, 0, 0.4], r: [HALF_PI, 0, 0], s: [2.2, 0.4, 2.2] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.add(GEO.box, M.plate, { p: [Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0.65], r: [0, 0, a], s: [0.4, 0.2, 0.3] });
  }
  root.add(b.group());
  const rings = new Builder();
  const cy = core('cyan', 1.5);
  for (let i = 0; i < 4; i++) rings.add(GEO.torus, i % 2 ? M.plate : cy, { p: [0, 0, 0.6 + i * 0.16], s: [1.7 - i * 0.28, 1.7 - i * 0.28, 1.6] });
  const r = rings.group();
  root.add(r);
  const orb = new THREE.Mesh(GEO.sphere, core('white', 2.2));
  orb.position.z = 1.1;
  orb.scale.setScalar(0.5);
  root.add(orb);
  return {
    root,
    anim: (pv, p, ctx) => {
      r.rotation.z = -ctx.t * (p.open ? 3 : 1.3);
      orb.scale.setScalar((p.open ? 0.7 : 0.5) * (0.9 + 0.1 * Math.sin(ctx.t * 12)));
    },
    radius: 1.15,
  };
}

function irisPart(M) {
  const root = new THREE.Group();
  const b = new Builder();
  b.add(GEO.torus, M.plate, { p: [0, 0, 0.45], s: [3.6, 3.6, 3] });
  b.add(GEO.cyl, M.dark, { p: [0, 0, 0.3], r: [HALF_PI, 0, 0], s: [3.4, 0.2, 3.4] });
  root.add(b.group());
  const orb = new THREE.Mesh(GEO.sphere, core('orange', 4.5).clone());
  orb.position.z = 0.4;
  orb.scale.set(2.4, 2.4, 0.6);
  root.add(orb);
  const blades = [];
  const bladeGeo = slab([[0, 0], [1.45, 0.25], [1.25, 0.9]], 0.06, 0.02);
  for (let i = 0; i < 9; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 9) * TAU;
    const blade = new THREE.Mesh(bladeGeo, M.hull);
    blade.position.set(0.1, 0, 0.6 + i * 0.012);
    pivot.add(blade);
    root.add(pivot);
    blades.push(blade);
  }
  let openK = 0;
  return {
    root,
    anim: (pv, p, ctx) => {
      const open = p.open ?? (ctx.vulnerable(p) ? 1 : 0);
      openK += ((open ? 1 : 0) - openK) * (1 - Math.exp(-ctx.dt * 3));
      for (const bl of blades) {
        bl.rotation.z = -openK * 1.2;
        bl.position.x = 0.1 + openK * 0.55;
      }
      orb.material.emissiveIntensity = 2 + openK * 3 + Math.sin(ctx.t * 8) * 0.4;
      root.rotation.z = ctx.t * 0.25;
    },
    radius: 1.8,
  };
}

function jawPart(M) {
  const root = new THREE.Group();
  const b = new Builder();
  b.add(slab(sym([[0, 0.9], [1.3, 0.9], [1.5, 0.2], [1.25, -0.6], [0, -0.6]]), 0.9, 0.1), M.hull);
  b.add(slab(sym([[0, 0.55], [1.0, 0.55], [1.12, 0.15], [0.92, -0.38], [0, -0.38]]), 1.0, 0.03), M.plate);
  b.add(tiledBox(2.7, 0.26, 1.08, 0.45), MAT.hazard(), { p: [0, 0.74, 0] });
  for (const sx of [-1, 1]) b.add(GEO.cyl8, MAT.steel(), { p: [sx * 0.75, 0.1, 0.52], r: [HALF_PI, 0, 0], s: [0.22, 0.06, 0.22] });
  for (let i = 0; i < 7; i++) b.add(GEO.cone, MAT.steel(), { p: [-1.08 + i * 0.36, -0.82, 0], r: [Math.PI, 0, 0], s: [0.3, 0.52, 0.34] });
  root.add(b.group());
  // ram from the hull down to the jaw
  const ram = new THREE.Mesh(GEO.cyl, MAT.steel());
  return {
    root,
    extra: ram,
    anim: (pv, p, ctx) => {
      const k = ctx.scale;
      const top = ctx.by - 1.2 * k;
      const y1 = p.y + 0.8 * pv.holder.scale.y;
      const len = Math.max(0.05, top - y1);
      ram.position.set(p.x, (top + y1) / 2, 0);
      ram.scale.set(0.3 * k, len, 0.3 * k);
    },
    radius: 1.3,
  };
}

function podPart(M) {
  const root = new THREE.Group();
  const b = new Builder();
  b.add(GEO.sphere, M.dark, { p: [0, 0, 0.1], s: [1.4, 1.7, 0.8] });
  root.add(b.group());
  const glowM = core('green', 3.5);
  const inner = new THREE.Mesh(GEO.sphere, glowM);
  inner.position.z = 0.2;
  inner.scale.set(0.7, 1.0, 0.5);
  root.add(inner);
  const petals = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i / 4) * TAU + Math.PI / 4;
    const pb = new Builder();
    pb.add(GEO.sphere, M.hull, { p: [0.3, 0, 0.35], s: [0.75, 0.62, 0.42] });
    pb.add(GEO.box, M.plate, { p: [0.45, 0, 0.55], s: [0.3, 0.05, 0.05] });
    const petal = pb.group();
    pivot.add(petal);
    root.add(pivot);
    petals.push(petal);
  }
  let openK = 0;
  return {
    root,
    anim: (pv, p, ctx) => {
      // open while launching (the view marks fireT) or when the sim says so
      const open = p.open || ctx.t - pv.fireT < 1.1;
      openK += ((open ? 1 : 0) - openK) * (1 - Math.exp(-ctx.dt * 5));
      for (const pt of petals) {
        pt.position.x = openK * 0.32;
        pt.rotation.y = openK * 0.5;
      }
      inner.scale.set(0.7, 1.0, 0.5 + openK * 0.3);
    },
    radius: 0.75,
  };
}

function batteryPart(M) {
  const base = new Builder();
  base.add(slab(ngon(8, 0.72, Math.PI / 8), 0.3, 0.06), M.hull, { p: [0, 0, 0.1] });
  base.add(slab(ngon(8, 0.56, Math.PI / 8), 0.36, 0.02), M.dark, { p: [0, 0, 0.12] });
  const head = new Builder();
  head.add(slab(sym([[0, 0.42], [0.36, 0.3], [0.46, -0.2], [0.3, -0.45], [0, -0.48]]), 0.32, 0.1), M.plate, { p: [0, 0, 0.38] });
  head.mirror(GEO.cyl, M.dark, { p: [0.15, 0.72, 0.42], s: [0.13, 0.7, 0.13] });
  head.mirror(GEO.cyl, MAT.steel(), { p: [0.15, 1.08, 0.42], s: [0.17, 0.1, 0.17] });
  head.add(GEO.box, core('red', 3), { p: [0, -0.22, 0.58], s: [0.36, 0.07, 0.04] });
  head.add(GEO.box, M.dark, { p: [0, 0.05, 0.58], s: [0.2, 0.3, 0.06] });
  const root = base.group();
  const h = head.group();
  root.add(h);
  return {
    root,
    anim: (pv, p, ctx) => {
      if (!p.dead) h.rotation.z = aimOf(p, ctx) - HALF_PI;
    },
    radius: 0.72,
  };
}

function rackPart(M) {
  const b = new Builder();
  b.add(GEO.box, M.hull, { p: [0, 0, 0.35], s: [1.6, 1.2, 0.4] });
  b.add(GEO.box, M.dark, { p: [0, 0, 0.5], s: [1.4, 1.0, 0.1] });
  const tips = core('red', 3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const x = -0.45 + i * 0.45;
      const y = -0.22 + j * 0.44;
      b.add(GEO.cyl, MAT.dark(), { p: [x, y, 0.56], r: [HALF_PI, 0, 0], s: [0.3, 0.08, 0.3] });
      b.add(GEO.sphere, tips, { p: [x, y, 0.58], s: [0.17, 0.17, 0.08] });
    }
  }
  return { root: b.group(), anim: () => {}, radius: 0.85 };
}

function cannonPart(M) {
  const root = new THREE.Group();
  const b = new Builder();
  b.add(GEO.box, M.hull, { p: [0, 0.6, 0.4], s: [1.2, 1.6, 0.5] });
  b.add(GEO.cyl, M.plate, { p: [0, -0.6, 0.5], s: [0.42, 2.4, 0.42] });
  b.mirror(GEO.box, M.dark, { p: [0.35, -0.4, 0.5], s: [0.12, 2.0, 0.2] });
  b.add(GEO.cyl, M.dark, { p: [0, -1.85, 0.5], s: [0.55, 0.3, 0.55] });
  root.add(b.group());
  const coils = [];
  const coilMat = core('cyan', 2.5).clone();
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(GEO.torus, coilMat);
    c.position.set(0, -0.2 - i * 0.42, 0.5);
    c.rotation.x = HALF_PI;
    c.scale.set(0.95, 0.95, 1.5);
    root.add(c);
    coils.push(c);
  }
  return {
    root,
    anim: (pv, p, ctx) => {
      // the barrel swings toward its aim, at most 50 degrees off straight down
      const a = Math.max(-0.87, Math.min(0.87, aimOf(p, ctx) + HALF_PI));
      if (!p.dead) root.rotation.z = a;
      const k = p.tele ? p.tele.k ?? 0 : 0;
      coilMat.emissiveIntensity = 2 + k * 5 + Math.max(0, Math.sin(ctx.t * 10)) * 1.2;
      if (k > 0 && ctx.bolts) {
        const d = 2.0 * pv.holder.scale.x;
        ctx.bolts.glow(p.x + Math.sin(a) * d, p.y - Math.cos(a) * d, 0.6 + k * 1.8, 0.4 * k + 0.2, 0.8 * k + 0.2, 1.4 * k + 0.3);
      }
    },
    radius: 1.0,
  };
}

function genericPart(M, color) {
  const b = new Builder();
  b.add(slab(ngon(8, 0.7, Math.PI / 8), 0.4, 0.08), M.hull, { p: [0, 0, 0.3] });
  b.add(GEO.sphere, core(color, 3.5), { p: [0, 0, 0.55], s: [0.6, 0.6, 0.3] });
  return { root: b.group(), anim: () => {}, radius: 0.7 };
}

function makePart(type, kind, M, p) {
  const k = KIND_ALIAS[kind] || kind;
  const accent = M.accent;
  switch (k) {
    case 'turret':
      return turretPart(M, 1.5, 'yellow');
    case 'drill':
      return drillPart(M, p.x);
    case 'core':
      if (type === 'crusher') return irisPart(M);
      return type === 'dreadnought' ? corePart(M, 'red', { cage: true, shutters: 6, size: 1.2 }) : type === 'brood' ? corePart(M, 'green', { shutters: 0, arcs: true, size: 1.3, intensity: 2.4 }) : corePart(M, accent);
    case 'pylon':
      return pylonPart(M);
    case 'coil':
      return coilPart(M);
    case 'iris':
      return irisPart(M);
    case 'jaw':
      return jawPart(M);
    case 'pod':
      return podPart(M);
    case 'battery':
      return batteryPart(M);
    case 'rack':
      return rackPart(M);
    case 'cannon':
      return cannonPart(M);
    default:
      return genericPart(M, accent);
  }
}

// ------------------------------------------------------------ part view

class PartView {
  constructor(type, index, part, group) {
    this.kind = part.kind;
    this.z = PAINT[type]?.top ?? 0.45;
    this.M = bossMats(type, `p${index}`);
    const built = makePart(type, part.kind, this.M, part);
    // the holder takes the sim's position, the boss scale and the fit to
    // the part's radius; the built model animates inside it
    this.holder = new THREE.Group();
    this.holder.add(built.root);
    this.radius = built.radius || 0.8;
    this.extra = built.extra || null;
    this.anim = built.anim;
    this.truss = built.truss;
    this.fireT = -9;
    group.add(this.holder);
    if (this.extra) group.add(this.extra);
    // remember which meshes are lit (flash, char) and which glow (go dark)
    this.lit = [];
    this.glowing = [];
    const sort = (o) =>
      o.traverse((m) => {
        if (!m.isMesh) return;
        if (m.material.type === 'MeshStandardMaterial' && m.material.emissiveIntensity > 1) this.glowing.push(m);
        else this.lit.push({ mesh: m, mat: m.material });
      });
    sort(this.holder);
    if (this.extra) sort(this.extra);
    this.hp = part.hp;
    this.flashT = 9;
    this.dead = false;
    this.smokeT = 0;
    if (this.truss) {
      this.trussMesh = new THREE.Mesh(GEO.box, this.M.plate);
      this.trussRail = new THREE.Mesh(GEO.box, this.M.dark);
      group.add(this.trussMesh, this.trussRail);
      this.lit.push({ mesh: this.trussMesh, mat: this.trussMesh.material }, { mesh: this.trussRail, mat: this.trussRail.material });
    }
  }

  update(p, ctx, dying) {
    const k = ctx.scale;
    const fit = Math.max(0.75, Math.min(1.5, (p.r || this.radius * k) / k / this.radius));
    this.holder.scale.setScalar(k * fit);
    this.holder.position.set(p.x + ctx.sx, p.y + ctx.sy, this.z * k);
    // hit flash on a new hit (hitT falls, or hp drops), at most every 0.14 s
    // so steady fire flickers instead of holding the part white
    const hitNow = typeof p.hitT === 'number' ? p.hitT < (this.lastHitT ?? 9) : p.hp < this.hp;
    this.lastHitT = p.hitT;
    this.flashT += ctx.dt;
    if (hitNow && this.flashT > 0.14) this.flashT = 0;
    this.hp = p.hp;
    const dead = p.dead || dying;
    const f = this.flashT < 0.06 && !dead ? 1 - this.flashT / 0.06 : 0;
    for (const m of [this.M.hull, this.M.plate, this.M.dark]) m.emissive.setRGB(f * 0.3, f * 0.28, f * 0.26);
    if (dead !== this.dead) this.setDead(dead);
    if (this.truss) this.tether(p, ctx);
    this.anim(this, p, ctx);
    if (this.dead && !p.gone) this.burn(p, ctx);
  }

  // pylons hang off the hub on a truss; dropped far, an energy tether
  tether(p, ctx) {
    const k = ctx.scale;
    const x0 = ctx.bx;
    const y0 = ctx.by + 0.9 * k;
    const len = Math.hypot(p.x - x0, p.y - y0);
    const a = Math.atan2(p.y - y0, p.x - x0);
    const near = len < 6 * k;
    this.trussMesh.visible = this.trussRail.visible = near;
    if (near) {
      for (const [m, w, z] of [
        [this.trussMesh, 0.5, 0.2],
        [this.trussRail, 0.16, 0.32],
      ]) {
        m.position.set((x0 + p.x) / 2, (y0 + p.y) / 2, z * k);
        m.rotation.z = a;
        m.scale.set(len, w * k, 0.25 * k);
      }
    } else if (ctx.bolts && !this.dead) ctx.bolts.ray(SHAPE.LINE, x0, y0, p.x, p.y, 0.1, 0.25, 0.025, 0.3, 0.8, 1.1);
  }

  setDead(on) {
    this.dead = on;
    for (const { mesh, mat } of this.lit) mesh.material = on ? MAT.char() : mat;
    for (const m of this.glowing) m.visible = !on;
  }

  // a destroyed part keeps smoking, with flickers of fire in the wreck
  burn(p, ctx) {
    const fx = ctx.fx;
    if (!fx || ctx.dt <= 0) return;
    this.smokeT -= ctx.dt;
    if (this.smokeT > 0) return;
    this.smokeT = 0.09;
    const r = (a, b) => fx.r(a, b);
    const k = ctx.scale;
    fx.smoke.add({ x: p.x + r(-0.4, 0.4) * k, y: p.y + r(-0.3, 0.3) * k, z: 1.2, vx: r(-0.3, 0.3), vy: r(-1.8, -0.8), drag: 0.6, size: r(0.6, 1.0) * k, grow: 2.2, rot: r(0, 6), spin: r(-0.5, 0.5), life: r(1.2, 1.8), frame: SPRITE.PUFF, r: 0.09, g: 0.085, b: 0.09, a: 0.65, fadeIn: 0.15 });
    if (fx.rand() < 0.5) fx.glow.add({ x: p.x + r(-0.35, 0.35) * k, y: p.y + r(-0.3, 0.3) * k, z: 1.0, vy: r(0.2, 0.8), size: r(0.35, 0.7) * k, grow: 0.5, life: r(0.2, 0.4), frame: SPRITE.PUFF2, r: 3, g: 1.1, b: 0.25, a: 0.8 });
  }

  dispose(group) {
    group.remove(this.holder);
    if (this.extra) group.remove(this.extra);
    if (this.trussMesh) group.remove(this.trussMesh, this.trussRail);
  }
}

// ------------------------------------------------------------ boss view

const DEATH_TIME = 2.2;

export class BossView {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.type = null;
    this.ref = null; // the sim's boss object this model was built for
    this.hull = null;
    this.parts = [];
    this.hp = 0;
    this.flashT = 9;
    this.dying = 0;
    this.died = false;
    this.gone = false;
    this.B = null;
    this.ctx = { t: 0, dt: 0, bx: 0, by: 0, sx: 0, sy: 0, scale: 1, px: 0, py: -5, fx: null, bolts: null, vulnerable: (p) => this.vulnerable(p) };
  }

  vulnerable(p) {
    const B = this.B;
    return !!B && !p.dead && (p.vuln ?? (B.phase >= (B.phases || 1) - 1));
  }

  build(B) {
    this.reset();
    this.type = B.type;
    this.ref = B;
    const M = bossMats(B.type, 'body');
    this.M = M;
    const make = HULLS[B.type] || HULLS.crusher;
    const { b, glows } = make(M);
    this.hull = b.group();
    this.hullGlows = glows;
    this.hullLit = [];
    this.hull.traverse((m) => {
      if (m.isMesh && !(m.material.type === 'MeshStandardMaterial' && m.material.emissiveIntensity > 1)) this.hullLit.push({ mesh: m, mat: m.material });
    });
    this.group.add(this.hull);
  }

  reset() {
    for (const pv of this.parts) pv.dispose(this.group);
    this.parts = [];
    if (this.hull) {
      this.group.remove(this.hull);
      this.hull.traverse((m) => m.isMesh && m.geometry.dispose());
    }
    this.hull = null;
    this.type = null;
    this.ref = null;
    this.dying = 0;
    this.died = false;
    this.gone = false;
    this.group.visible = true;
  }

  // the boss blew up (bossDead): the wreck burns and shakes through the
  // chain of blasts, then vanishes in the last one
  die(time = DEATH_TIME) {
    if (!this.type || this.died) return;
    this.died = true;
    this.dying = time;
  }

  size() {
    const [w, h] = BOSS_SIZE[this.type] || [9, 5];
    const k = this.ref?.scale ?? 1;
    return [w * k, h * k];
  }

  // a part fired (pods open while they launch)
  partFired(x, y) {
    let best = null;
    let bd = 2.5;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.B?.parts?.[i];
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) {
        bd = d;
        best = this.parts[i];
      }
    }
    if (best) best.fireT = this.ctx.t;
  }

  update(S, dt, t, bolts, fx) {
    const B = S ? S.boss : null;
    this.B = B;
    if (!B) {
      if (this.type) this.reset();
      return;
    }
    if (B !== this.ref || B.type !== this.type) this.build(B);
    if (B.dying && !this.died) this.die();
    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) this.gone = true;
    }
    this.group.visible = !this.gone;
    if (this.gone) return;
    const ctx = this.ctx;
    const k = B.scale ?? 1;
    ctx.t = t;
    ctx.dt = dt;
    ctx.bx = B.x;
    ctx.by = B.y;
    ctx.scale = k;
    ctx.px = S.player ? S.player.x : 0;
    ctx.py = S.player ? S.player.y : -5;
    ctx.fx = fx;
    ctx.bolts = bolts;
    // death throes: shake, and char creeping over the hull
    const dying = this.died;
    ctx.sx = dying ? Math.sin(t * 53) * 0.12 * k : 0;
    ctx.sy = dying ? Math.cos(t * 41) * 0.1 * k : 0;
    if (dying && this.dying < 0.8) for (const { mesh } of this.hullLit) mesh.material = MAT.char();
    this.hull.position.set(B.x + ctx.sx, B.y + ctx.sy, 0);
    this.hull.scale.setScalar(k);
    // a faint hull flash when the boss's hp drops
    // (rate-limited: under steady fire hp drops every frame)
    if (B.hp < this.hp && this.flashT > 0.35) this.flashT = 0;
    this.hp = B.hp;
    this.flashT += dt;
    const f = this.flashT < 0.08 && !dying ? 1 - this.flashT / 0.08 : 0;
    for (const m of [this.M.hull, this.M.plate, this.M.dark]) m.emissive.setRGB(f * 0.06, f * 0.055, f * 0.05);
    // parts, matched by index
    const parts = B.parts || [];
    let same = this.parts.length === parts.length;
    for (let i = 0; same && i < parts.length; i++) same = this.parts[i].kind === parts[i].kind;
    if (!same) {
      for (const pv of this.parts) pv.dispose(this.group);
      this.parts = parts.map((p, i) => new PartView(this.type, i, p, this.group));
    }
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      this.parts[i].update(p, ctx, dying);
      if (p.tele && p.tele.kind !== 'beam' && bolts && !dying) bolts.ray(SHAPE.LINE, p.tele.x0, p.tele.y0, p.tele.x1, p.tele.y1, 0.16, p.tele.k ?? 0, 0.035, 1, 0.12, 0.14);
    }
    if (!bolts || dying) return;
    // engine glows
    const [ar, ag, ab] = colorOf(this.type === 'brood' ? 'magenta' : this.type === 'tempest' ? 'cyan' : 'orange');
    for (const [gx, gy, s] of this.hullGlows) bolts.glow(B.x + gx * k, B.y + gy * k, s * k * (0.9 + 0.1 * Math.sin(t * 31 + gx)), ar * 0.7, ag * 0.7, ab * 0.7);
    // the brood engine breathes faster with each phase
    if (this.type === 'brood') bolts.glow(B.x, B.y, (3.5 + Math.sin(t * (2 + (B.phase || 0) * 2)) * 0.5) * k, 0.03, 0.12, 0.04);
    // enraged: a red heat pulse through the hull and a hot under-glow
    if (B.enraged) {
      const e = 0.5 + 0.5 * Math.sin(t * 9);
      for (const m of [this.M.hull, this.M.plate, this.M.dark]) m.emissive.setRGB(Math.max(m.emissive.r, 0.03 + 0.05 * e), Math.max(m.emissive.g, 0.006), Math.max(m.emissive.b, 0.004));
      bolts.glow(B.x, B.y - 1.6 * k, (3 + e) * k, 0.05 + 0.04 * e, 0.008, 0.004);
    }
    // entering: engines burn hard while it descends
    if (B.entering) for (const [gx, gy, s] of this.hullGlows) bolts.glow(B.x + gx * k, B.y + gy * k + 0.4 * k, s * k * 1.8, ar, ag, ab);
  }

  clear() {
    this.reset();
  }
}

// Jagged lightning between two points: short beam segments, re-rolled 20
// times a second (the Tempest Array's pylon links).
export function lightning(bolts, x0, y0, x1, y1, t, seed = 0, width = 0.09) {
  let s = (Math.floor(t * 20) * 7919 + seed * 104729) % 2147483647;
  const rnd = () => {
    s = (s * 16807 + 11) % 2147483647;
    return (s % 10000) / 10000 - 0.5;
  };
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const n = Math.max(4, Math.min(16, Math.round(len / 0.7)));
  for (let pass = 0; pass < 2; pass++) {
    let px = x0;
    let py = y0;
    const amp = pass ? 0.5 : 0.9;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const j = i === n ? 0 : rnd() * amp * Math.sin(k * Math.PI);
      const qx = x0 + (x1 - x0) * k + nx * j;
      const qy = y0 + (y1 - y0) * k + ny * j;
      bolts.ray(SHAPE.BEAM, px, py, qx, qy, width * 4, pass ? width * 0.6 : width, pass ? 0.5 : 0.9, 0.5, 1.1, 1.6);
      px = qx;
      py = qy;
    }
  }
  bolts.glow(x0, y0, 1.0, 0.25, 0.7, 1.1);
  bolts.glow(x1, y1, 1.0, 0.25, 0.7, 1.1);
}
