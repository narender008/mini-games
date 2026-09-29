// Beach: bright midday on a golden sandy shore. The tanks sit on crumbly
// sand mounds with shells, pebbles and sea glass round their feet, facing
// each other across rippled sand with a dug-out crater between them; behind
// the lane a sandcastle with a red flag, a blue bucket and a red spade stand
// in the sand, and the shore slopes down to a turquoise sea with lines of
// surf that reaches the horizon, with a green headland far off to one side.
import { fbm, rng, smoothstep } from '../config.js';
import { shoreZ } from '../world/sea.js';

const WATER_Y = -0.32;
// mean distance behind the lane where the waterline lies
const SHORE_B = 9.5;
const SLOPE = 0.0337; // rise of the beach per metre back from the waterline (0 at the lane)

// Layouts: where the two tanks start (x), the mounds under them (x, height,
// width; negative is a hollow), the dip in the lane, the pits dug behind it
// (x, z, radius, depth), the dune the castle stands on (x, z, radius, height)
// and where the toys stand (castle: x, z, yaw, size;
// bucket: x, z, yaw, lean; spades: x, z, yaw, lean, size; heaps: x, z, radius;
// flag: where the wind flag stands, x, z).
const LAYOUTS = [
  {
    tanks: [-0.43, 0.43],
    knolls: [[-0.45, 0.15, 0.27], [0.45, 0.13, 0.27]],
    dip: [0, 0.04],
    pits: [[0.02, -0.17, 0.15, 0.05], [0.62, -0.6, 0.07, 0.02]],
    dune: [-0.68, -0.9, 0.6, 0.22],
    castle: [-0.68, -0.9, 0.1, 0.95],
    bucket: [-0.08, -0.66, 0.4, 0.12],
    spades: [[0.04, -0.58, 0.5, 0.42, 1.0], [0.44, -0.85, -0.5, 0.22, 1.1]],
    heaps: [[0.72, -0.5, 0.05], [0.9, -0.45, 0.04]],
    flag: [0.17, -0.3],
  },
  {
    tanks: [-0.38, 0.52],
    knolls: [[-0.4, 0.12, 0.25], [0.54, 0.17, 0.29], [0.08, 0.035, 0.12]],
    dip: [-0.15, 0.035],
    pits: [[-0.03, -0.2, 0.14, 0.045], [0.9, -0.55, 0.08, 0.02]],
    dune: [-0.64, -0.9, 0.6, 0.22],
    castle: [-0.64, -0.9, -0.1, 0.95],
    bucket: [0.2, -0.7, -0.3, 0.1],
    spades: [[0.3, -0.55, -0.4, 0.5, 1.0], [0.6, -0.95, 0.3, 0.2, 1.3]],
    heaps: [[0.15, -0.6, 0.05], [0.9, -0.4, 0.05]],
    flag: [-0.1, -0.3],
  },
  {
    tanks: [-0.52, 0.36],
    knolls: [[-0.54, 0.18, 0.29], [0.38, 0.11, 0.24], [-0.08, -0.03, 0.15]],
    dip: [0.05, 0.035],
    pits: [[0.04, -0.2, 0.15, 0.045], [0.75, -0.75, 0.09, 0.02]],
    dune: [-0.76, -0.9, 0.6, 0.22],
    castle: [-0.76, -0.9, 0.05, 0.95],
    bucket: [0.1, -0.7, 0.6, 0.14],
    spades: [[0.36, -0.6, 0.2, 0.4, 1.0], [-0.2, -0.8, 0.6, 0.25, 1.3]],
    heaps: [[-0.4, -0.55, 0.05], [0.25, -0.5, 0.04]],
    flag: [-0.32, -0.3],
  },
];

// a mound of sand: a flat-ish top for the tank with crumbly, gullied flanks
function mound(x, z, kx, kh, kw) {
  const dx = (x - kx) / kw;
  const dz = (z - 0.05) / (kw * (z > 0.05 ? 1.5 : 1.0));
  if (kh < 0) return kh * Math.exp(-(dx * dx + dz * dz) * 1.4);
  const r0 = Math.sqrt(dx * dx + dz * dz);
  const r = r0 * (1 + 0.16 * fbm(x * 8 + kx * 3, z * 8, 3, 21));
  const flank = smoothstep(0.35, 0.6, r0) * (1 - smoothstep(1.0, 1.35, r0));
  // gullies run down the flanks (ridged noise stretched along the slope)
  const gully = 1 - Math.abs(fbm(x * 16 + kx * 5, z * 6, 3, 27));
  return kh * (1 - smoothstep(0.38, 1.25, r)) + kh * (0.16 * fbm(x * 11 + kx, z * 11, 3, 23) + 0.1 * gully * gully - 0.06) * flank;
}

// a hole dug in the sand with a raised rim
function pit(x, z, cx, cz, r, d) {
  const dx = x - cx;
  const dz = (z - cz) * 1.15;
  const u = Math.sqrt(dx * dx + dz * dz) / r;
  if (u > 2.4) return 0;
  const bowl = u < 1 ? -(1 - u * u) * (1 - u * u) : 0;
  return d * (bowl + 0.34 * Math.exp(-((u - 1.02) * (u - 1.02)) / 0.1));
}

// a headland far off along the coast: a green-topped lump of land, a few hundred metres long
function cape(x, b, cx, cb, wx, wb, top) {
  const u = (x - cx) / wx;
  const v = (b - cb) / wb;
  const d = Math.sqrt(u * u + v * v) * (1 + 0.28 * fbm(x * 0.012 + cx, b * 0.012, 3, 4));
  return top * (1 - smoothstep(0.35, 1.0, d)) * (0.8 + 0.4 * fbm(x * 0.03, b * 0.03, 3, 6));
}

// how covered with scrub the far land is (the terrain paints it green from afar)
function scrubAt(x, z, y) {
  if (-z < 60) return 0;
  return smoothstep(WATER_Y + 3, WATER_Y + 9, y) * smoothstep(-0.25, 0.25, fbm(x * 0.02, z * 0.02, 3, 3));
}

// the beach's general shape, and the far coast: b metres behind the lane
function coast(x, b) {
  // the beach: a gentle slope down to the waterline, then the sea floor
  const out = shoreZ(x, -SHORE_B) + b; // metres out to sea from the waterline
  let h;
  if (out < 0) h = WATER_Y - out * SLOPE;
  else h = WATER_Y - 6 * (1 - Math.exp(-out / 40)) - 6 * (1 - Math.exp(-out / 400));
  // the far coast: a headland on the right, a lower one on the left, blue lumps beyond
  if (b > 120) {
    const land = cape(x, b, 300, 520, 200, 170, 24) + cape(x, b, -360, 640, 160, 130, 16) + cape(x, b, 800, 1150, 380, 240, 44);
    if (land > 0.5) h = Math.max(h, WATER_Y - 6 + land * 1.05 + 4 * smoothstep(3, 12, land) * fbm(x * 0.05, b * 0.05, 3, 15));
  }
  return h;
}

// damp, darker sand: round the pits, in the dip between the mounds, and in patches on the flat
function patchFor(layout) {
  const { pits, dip } = layout;
  return (x, z) => {
    let m = 0;
    for (const [cx, cz, r] of pits) {
      const u = Math.hypot(x - cx, (z - cz) * 1.15) / r;
      m = Math.max(m, 1 - smoothstep(0.85, 1.7 + 0.5 * fbm(x * 12, z * 12, 2, 3), u));
    }
    m = Math.max(m, 0.7 * Math.exp(-((x - dip[0]) * (x - dip[0])) / 0.1 - (z * z) / 0.08) * smoothstep(-0.1, 0.25, fbm(x * 5, z * 5, 2, 8)));
    return m;
  };
}

function heightFor(layout) {
  const { knolls, dip, pits, dune } = layout;
  return (x, z) => {
    const b = -z;
    let h = coast(x, b);
    const near = 1 - smoothstep(3.5, 7.5, b);
    if (near > 0) {
      // detail: crumbly lumps, piles, ripples from the wind, and the grain of the sand.
      // Calmer along the lane itself, where the tanks drive, and rougher in the foreground.
      const lane = 0.3 + 0.7 * smoothstep(0.06, 0.45, Math.abs(z - 0.03));
      const fore = 1 + 0.9 * smoothstep(0.2, 1.2, z);
      let d = 0.016 * fbm(x * 2.2, z * 2.2, 4, 11);
      const pile = Math.max(0, fbm(x * 3.4 + 5, z * 3.4, 3, 17));
      d += 0.045 * pile * pile;
      const mask = smoothstep(-0.15, 0.3, fbm(x * 1.1 + 9, z * 1.1, 2, 9));
      d += 0.0035 * mask * Math.sin((x * 0.94 + z * 0.34) * 82 + 4 * fbm(x * 1.3, z * 1.3, 2, 8));
      d += 0.0014 * fbm(x * 30, z * 30, 2, 3);
      h += d * lane * fore * near;
      // a lip of sand rising in front, and dunes at the sides
      h += 0.028 * smoothstep(0.3, 1.3, z) * (0.6 + 0.4 * fbm(x * 1.5, z * 1.5, 2, 5));
      const ax = Math.abs(x);
      h += (0.1 + 0.28 * (0.5 + 0.5 * fbm(x * 0.7, z * 0.7, 3, 14))) * smoothstep(1.3, 2.7, ax) * smoothstep(0.1, 1.2, b) * (1 - smoothstep(3, 9, b)) * near;
    }
    for (const [kx, kh, kw] of knolls) h += mound(x, z, kx, kh, kw);
    h -= dip[1] * Math.exp(-((x - dip[0]) * (x - dip[0])) / 0.18 - (z * z) / 0.3);
    for (const [cx, cz, r, d] of pits) h += pit(x, z, cx, cz, r, d);
    // the castle's bank: a broad low dune behind the left tank, so the castle stands clear above the mound in front of it
    if (dune) {
      const [dx0, dz0, dr, dh] = dune;
      const u = Math.hypot((x - dx0) / dr, (z - dz0) / (dr * 0.8)) * (1 + 0.14 * fbm(x * 5 + 3, z * 5, 3, 33));
      h += dh * (1 - smoothstep(0.3, 1.0, u)) * (0.92 + 0.16 * fbm(x * 14, z * 14, 2, 35));
    }
    return h;
  };
}

export const STAGE = {
  id: 'beach',
  ground: {
    kind: 'sand',
    base: 'sand',
    dug: 'sand-wet',
    baseTile: 0.5,
    dugTile: 0.32,
    farTile: 3.5,
    baseColor: 0xdba15c,
    baseTint: 0xfae6d2,
    farTint: 0xf6e0c0,
    coverColor: 0x557a30,
    // wet sand where the water reaches
    shore: { y: WATER_Y, width: 0.16, color: 0x6e5334 },
    dugColor: 0x9a7444,
    dugTint: 0xffe6c4,
    patch: 'sand-wet',
    patchTile: 0.4,
    patchTint: 0xffe2b4,
    wetDark: 0.62,
    normalScale: 1.3,
  },
  layouts: LAYOUTS,
  heightFor,
  patchFor,
  far: 1400,
  wide: 1400,
  cover: scrubAt,
  grass: null,
  // a strong warm sun from the upper left front (build turns the photographed sun to this direction)
  sun: { dir: [-0.6, 0.6, 0.52], color: 0xffeacc, intensity: 7 },
  sunBoost: 1.4,
  sunTint: 0xfff6ea,
  rim: 0.3,
  envIntensity: 0.85,
  hemi: { sky: 0xbfdcff, ground: 0xd9b078, intensity: 0.5 },
  exposure: 1.22,
  // blue aerial haze: the far sea and headlands go blue, not milky
  fog: { color: 0x6fa8de, density: 0.0007 },
  lens: { base: 14, max: 1.5, band: 1.2 },
  grade: { white: [1.04, 1.0, 0.96], saturation: 1.12, contrast: 0.34, vignette: 0.2 },
  backdrop: { haze: 0.12, hazeColor: 0xfff0d0, saturation: 1.3, contrast: 0.1, gain: 1.45, horizon: 0.6, horizonTop: 0.06 },
  wind: [0.08, 0.5],
};

// The scenery around the lane.
export async function build({ app, quality, terrain, layout }) {
  const THREE = await import('three');
  const [{ Grass }, { WindFlag }, { Flowers }, rocksMod, { Sea }, shellsMod, { tryProp }, { Motes }, { tuneSun }, { FarLand }] = await Promise.all([
    import('../world/grass.js'),
    import('../world/flag.js'),
    import('../world/flowers.js'),
    import('../world/rocks.js'),
    import('../world/sea.js'),
    import('../world/shells.js'),
    import('../world/tryprop.js'),
    import('../world/motes.js'),
    import('../world/light.js'),
    import('../world/farland.js'),
  ]);
  // the sun: warm, from the upper left in front, so shadows fall clearly to the right and back
  tuneSun(app, { dir: STAGE.sun.dir, color: STAGE.sun.color });
  const group = new THREE.Group();
  const H = (x, z) => terrain.baseAt(x, z);
  const [t0, t1] = layout.tanks;
  const tx = (t0 + t1) / 2;
  const underTank = (x, z) => (Math.abs(x - t0) < 0.14 || Math.abs(x - t1) < 0.14) && Math.abs(z) < 0.12;
  const disposers = [];

  // the sea, out to the horizon
  const sea = new Sea({ y: WATER_Y, shoreBase: -SHORE_B, reach: 2600, wetSand: 0x715636 });
  group.add(sea.mesh);

  // the far coast (sandstone headlands with scrub on top) on a finer mesh, so its cliffs stay sharp
  const far = new FarLand({
    height: coast,
    cover: (x, b, y) => scrubAt(x, -b, y),
    from: 260,
    to: 2500,
    columns: quality.tier === 'low' ? 700 : 1100,
    look: { top: 0xe6c690, rock: 0x9a7048, rock2: 0xc49a66, forest: 0x4b6d2c, line: [0, 1, 0.3, 0.2], detail: [1, 1] },
  });
  FarLand.trimTerrain(terrain, 300);
  group.add(far.mesh);

  // tufts of beach grass on the dunes at either side
  const grass = new Grass({
    terrain,
    quality,
    seed: 19,
    spec: { density: 0.16, height: [0.05, 0.15], color: [0x6b7a2a, 0xd0d770], dry: 0xe8dc9a, area: [-3.0, 3.0, -1.4, 0.3] },
    keepOut: (x, z) => Math.abs(x) < 1.1 + 0.5 * Math.max(0, z + 0.4),
  });
  group.add(grass.mesh);

  // pebbles and little clods of sand on the ground, and a few pale stones; a
  // ring of stones round each tank's mound
  const R = rng(61);
  const rockList = [];
  rockList.push(...rocksMod.pebbles({ area: [-1.3, 1.3, -0.6, 0.95], count: Math.round(70 * quality.grass), seed: 9, heightAt: H, size: [0.006, 0.02], keepOut: underTank }));
  const decor = []; // shells and sea glass round the mounds
  layout.knolls.forEach(([kx, kh, kw], i) => {
    if (kh < 0.06) return;
    const K = rng(400 + i * 11);
    const out = Math.sign(kx) || 1;
    for (let k = 0; k < 9; k++) {
      // in a ring on the flank and at the foot, mostly on the camera's side
      const a = (K() * 2 - 1) * Math.PI * 0.8;
      const rr = kw * (0.55 + K() * 0.75);
      const x = kx + Math.sin(a) * rr + out * 0.02;
      const z = 0.05 + Math.cos(a) * rr * 1.25;
      if (Math.abs(z) < 0.11 && Math.abs(x - kx) < 0.14) continue;
      const s = 0.006 + Math.pow(K(), 2) * 0.016;
      rockList.push({ x, y: H(x, z) + s * 0.1, z, size: [s * 1.2, s * 0.65, s], yaw: K() * 6.28, tilt: (K() - 0.5) * 0.3, seed: 700 + i * 20 + k, detail: 3, cuts: 3 });
    }
    for (let k = 0; k < 7; k++) {
      const a = (K() * 2 - 1) * Math.PI * 0.75;
      const rr = kw * (0.6 + K() * 0.8);
      const x = kx + Math.sin(a) * rr;
      const z = 0.05 + Math.cos(a) * rr * 1.25;
      if (Math.abs(z) < 0.11 && Math.abs(x - kx) < 0.14) continue;
      const roll = K();
      decor.push(roll < 0.4
        ? { kind: 'scallop', x, z, size: 0.016 + K() * 0.014, yaw: K() * 6.28, tilt: 0.1 + K() * 0.5, sink: 0.15 + K() * 0.3, color: [0xfff1e2, 0xf6c7bd, 0xffc79a, 0xd6a4d0][Math.floor(K() * 4)] }
        : roll < 0.6
          ? { kind: 'spiral', x, z, size: 0.018 + K() * 0.014, yaw: K() * 6.28, tilt: 0.3, sink: 0.25, color: [0xf3e2cc, 0x8fd6d0, 0xe8b790][Math.floor(K() * 3)] }
          : { kind: 'glass', x, z, size: 0.005 + K() * 0.005, yaw: K() * 6.28, tilt: 0.3, sink: 0.2, color: shellsMod.GLASS_COLORS[Math.floor(K() * 5)] });
    }
  });
  const stones = await rocksMod.buildRocks({ rocks: rockList, look: { rock: 'rock', cap: 'sand', capAmount: 0.55, capSoft: 0.25, rockTint: 0xf0e4d0, capTint: 0xffe0aa, rockTile: 2.2, capTile: 2 } });
  group.add(stones.mesh);
  disposers.push(() => stones.dispose());
  const clodList = [];
  const nClods = Math.round(260 * Math.max(0.5, quality.grass));
  for (let i = 0; i < nClods; i++) {
    const x = tx - 1.2 + R() * 2.4;
    const z = -0.7 + R() * 1.6;
    if (underTank(x, z)) continue;
    const s = 0.004 + Math.pow(R(), 2.4) * 0.014;
    clodList.push({ x, y: H(x, z) + s * 0.1, z, size: [s * 1.3, s * 0.7, s], yaw: R() * 6.28, tilt: (R() - 0.5) * 0.3, seed: 300 + i, detail: 3, cuts: 4, lumpy: 0.5 });
  }
  const clods = await rocksMod.buildRocks({ rocks: clodList, look: { rock: 'sand', cap: null, rockTint: 0xffdca4, rockTile: 2, capAmount: 0 } });
  group.add(clods.mesh);
  disposers.push(() => clods.dispose());

  // sea shells: big modelled ones in front of the camera (built here if the models are missing),
  // small ones scattered about. The camera looks a little from the right, so the view at z = 0.6
  // runs from about tx - 0.44 to tx + 0.8.
  const place = (obj, x, z, yaw, scale = 1, sink = 0.004) => {
    obj.position.set(x, H(x, z) - sink * scale, z);
    obj.rotation.y = yaw;
    obj.scale.setScalar(scale);
    group.add(obj);
    return obj;
  };
  const heroDefs = [
    { id: 'shell-scallop', x: tx - 0.3, z: 0.64, yaw: 0.6, s: 1.7, sink: 0.004 },
    { id: 'shell-scallop', x: tx + 0.16, z: 0.5, yaw: 3.7, s: 1.5, sink: 0.004 },
    { id: 'shell-cockle', x: tx + 0.66, z: 0.6, yaw: 2.1, s: 1.7, sink: 0.002 },
    { id: 'starfish', x: t1 + 0.12, z: 0.36, yaw: 0.4, s: 1.4, sink: 0.002 },
    { id: 'shell-spiral', x: t0 - 0.22, z: 0.34, yaw: 2.6, s: 1.5, sink: 0.002 },
    { id: 'shell-scallop', x: t0 - 0.08, z: -0.3, yaw: 1.2, s: 1.0, sink: 0.006 },
  ];
  for (const d of heroDefs) {
    const obj = await tryProp(d.id);
    if (obj) place(obj, d.x, d.z, d.yaw, d.s, d.sink);
  }
  const shells = shellsMod.buildShells({
    items: [...shellsMod.scatterShells({ area: [tx - 1.2, tx + 1.2, -0.55, 0.95], count: 22, seed: 5, heightAt: H, keepOut: underTank }), ...decor],
    heightAt: H,
  });
  group.add(shells.group);
  disposers.push(() => shells.dispose());

  // a few small flowers among the dune grass
  const flowers = new Flowers({
    terrain,
    quality,
    spec: {
      count: 220,
      area: [-2.9, 2.9, -1.3, 0.2],
      mix: [
        { kind: 'star', colors: [0xff7fb5, 0xff9fca, 0xd77bff], weight: 0.5, size: [0.006, 0.01], height: [0.03, 0.08] },
        { kind: 'daisy', colors: [0xffffff, 0xfff5e8], weight: 0.3, size: [0.006, 0.01], height: [0.03, 0.07] },
        { kind: 'buttercup', colors: [0xffd11a], weight: 0.2, size: [0.005, 0.009], height: [0.03, 0.06] },
      ],
      near: (x) => smoothstep(1.1, 2.0, Math.abs(x)),
      keepOut: (x, z) => Math.abs(x) < 1.0 + 0.5 * Math.max(0, z + 0.4),
    },
  });
  group.add(flowers.group);

  // grains of sand blowing along the ground on the wind
  const motes = new Motes({
    post: app.post,
    quality,
    spec: { count: 200, box: [tx - 1.6, tx + 1.6, 0.01, 0.34, -0.9, 0.7], size: [0.0008, 0.0022], color: 0xfff0cf, fluff: 0, rise: [-0.03, 0.02], bob: 0.015, calm: 0.03, windScale: 1.4 },
  });
  group.add(motes.mesh);

  // the toys (modelled, src/props.js)
  {
    const [cx, cz, cy, cs] = layout.castle;
    const castle = await tryProp('sandcastle');
    if (castle) place(castle, cx, cz, cy, cs * 1.3);
  }
  {
    const [bx, bz, by, lean] = layout.bucket;
    const bucket = await tryProp('bucket');
    if (bucket) {
      place(bucket, bx, bz, by, 1, 0.012);
      bucket.rotation.order = 'YXZ';
      bucket.rotation.z = lean;
      bucket.rotation.x = -lean * 0.4;
    }
  }
  for (const [sx, sz, sy, lean, ss] of layout.spades) {
    const spade = await tryProp('spade');
    if (!spade) continue;
    place(spade, sx, sz, sy, ss, 0.045);
    spade.rotation.order = 'YXZ';
    spade.rotation.x = -lean;
    spade.rotation.z = lean * 0.35;
  }

  // the wind flag, planted in the sand by the lane (the castle has its own little pennant)
  const fx = layout.flag[0];
  const flag = new WindFlag({ x: fx, z: layout.flag[1], y: terrain.heightAt(fx, layout.flag[1]) - 0.004 });
  group.add(flag.object);

  return {
    group,
    shapes: [],
    update(dt, time, app) {
      sea.update(dt, time);
      grass.update(dt, time, app.world, app.tanks);
      flowers.update(dt, time, app.world);
      motes.update(dt, time, app.world);
      flag.update(dt, time, app.world.wind);
    },
    shockwave() {},
    dispose() {
      far.dispose();
      sea.dispose();
      grass.dispose();
      flowers.dispose();
      motes.dispose();
      for (const d of disposers) d();
    },
  };
}
