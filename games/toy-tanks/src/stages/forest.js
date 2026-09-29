// Pine forest: dappled sunlight on a mossy floor. The tanks stand on moss
// mounds and rock bluffs either side of a little gorge in which a stream
// runs towards the camera; a rope bridge crosses it behind the lane. Toy-size
// pines stand about the tanks, ferns and small purple flowers at their feet,
// and real pines, tall and blurred, layer away into the haze.
import { fbm, rng, smoothstep } from '../config.js';
import { reactors } from '../world/react.js';

// Layouts: where the two tanks start (x), the knolls under them (x, height,
// width), a dip between them, and the gorge (its x at the lane, and where
// its meanders start).
const LAYOUTS = [
  { tanks: [-0.43, 0.44], knolls: [[-0.45, 0.15, 0.25], [0.47, 0.19, 0.26]], dip: [0.0, 0.03], gorge: { x: 0.02, phase: 0.8 } },
  { tanks: [-0.4, 0.52], knolls: [[-0.42, 0.13, 0.24], [0.54, 0.21, 0.27], [0.06, 0.03, 0.12]], dip: [-0.12, 0.03], gorge: { x: -0.08, phase: 2.2 } },
  { tanks: [-0.5, 0.38], knolls: [[-0.52, 0.18, 0.27], [0.4, 0.16, 0.24]], dip: [0.08, 0.03], gorge: { x: 0.1, phase: 4.1 } },
];

// where the bridge crosses the gorge (depth, m behind the lane)
const ZB = -0.62;

// the stream: its middle (x) at depth z, half width, and water height (m).
// It flows towards the camera and seeps into the moss just behind the lane.
const gorgeX = (g, z) => g.x + 0.15 * Math.sin(-z * 1.7 + g.phase) + 0.05 * Math.sin(-z * 4.3 + g.phase * 2);
const halfWidth = (g, z) => 0.12 + 0.04 * Math.min(-z, 2) + 0.015 * Math.sin(-z * 3.1 + g.phase);
const waterY = (z) => -0.055 + 0.09 * Math.min(Math.max(0, -z - 0.34), 8);

// a knoll: a flat top for the tank, reaching out towards the camera
function knoll(x, z, kx, kh, kw) {
  const dx = (x - kx) / kw;
  const dz = (z - 0.05) / (kw * (z > 0.05 ? 1.45 : 0.95));
  if (kh < 0) return kh * Math.exp(-(dx * dx + dz * dz) * 1.4);
  const r = Math.sqrt(dx * dx + dz * dz) * (1 + 0.14 * fbm(x * 9 + kx * 3, z * 9, 2, 21));
  return kh * (1 - smoothstep(0.4, 1.2, r));
}

function heightFor(layout) {
  const { knolls, dip, gorge: g } = layout;
  const bl = g.x - 0.62;
  const br = g.x + 0.6;
  const sq = (v) => v * v;
  return (x, z) => {
    const b = -z;
    let h = 0.012 * fbm(x * 1.7, z * 1.7, 4, 11) + 0.005 * fbm(x * 9, z * 9, 2, 5) + 0.002 * fbm(x * 31, z * 31, 2, 9);
    for (const [kx, kh, kw] of knolls) h += knoll(x, z, kx, kh, kw);
    h -= dip[1] * Math.exp(-((x - dip[0]) * (x - dip[0])) / 0.18 - (z * z) / 0.3);
    // rock and moss bluffs either side of the gorge, joining the tanks' mounds
    const ramp = smoothstep(0.25, 0.55, b) * (1 - smoothstep(1.5, 3.2, b));
    if (ramp > 0) h += ramp * (0.13 * Math.exp(-sq((x - bl) / 0.28)) + 0.17 * Math.exp(-sq((x - br) / 0.26))) * (0.8 + 0.4 * fbm(x * 5, z * 5, 2, 4));
    // the forest floor climbs away behind, rolling
    h += 0.06 * Math.min(b, 40) * smoothstep(0.2, 2.0, b);
    h += 2.2 * fbm(x * 0.03, z * 0.03, 3, 6) * smoothstep(4, 40, b);
    h += 14 * smoothstep(120, 320, b) * (0.6 + fbm(x * 0.005, b * 0.005, 3, 12));
    // the gorge: a bed below the water, banks climbing back to the ground
    const gg = smoothstep(0.2, 0.42, b) * (1 - smoothstep(6, 14, b));
    if (gg > 0) {
      const d = Math.abs(x - gorgeX(g, z));
      const hw = halfWidth(g, z);
      const bed = waterY(z) - 0.035 * (1 - Math.min(1, sq(d / hw)));
      const k = smoothstep(hw * 0.9, hw + 0.22 + 0.08 * fbm(x * 4, z * 4, 2, 15), d);
      const gh = bed + (h - bed) * k;
      if (gh < h) h += (gh - h) * gg;
    }
    h += 0.02 * smoothstep(0.6, 1.4, z) * (0.6 + 0.4 * fbm(x * 2, z * 2, 2, 7));
    return h;
  };
}

export const STAGE = {
  id: 'forest',
  ground: {
    kind: 'moss',
    base: 'moss',
    dug: 'soil',
    far: 'moss',
    baseTile: 0.45,
    dugTile: 0.4,
    farTile: 2.5,
    baseColor: 0x3d5a24,
    dugColor: 0x6a4a30,
    baseTint: 0xdfe8b0,
    dugTint: 0xd6b892,
    farTint: 0x44592e,
    coverColor: 0x18300f,
    wetDark: 0.6,
    baseRough: 0.9,
    dugRough: 0.9,
  },
  layouts: LAYOUTS,
  heightFor,
  far: 700,
  wide: 700,
  cover: (x, z) => smoothstep(2.5, 10, -z),
  grass: { density: 0.35, height: [0.012, 0.038], color: [0x1f4614, 0x74a832], dry: 0x8a8a3a },
  // fallback light if the sky's own sun is not loaded
  sun: { dir: [-0.69, 0.71, 0.11], color: 0xfff0d0, intensity: 3.4 },
  sunIntensity: 3.4,
  hemi: { sky: 0xc6dcb8, ground: 0x4a5a2a, intensity: 0.5 },
  exposure: 1.55,
  // warm green haze among the trees
  fog: { color: 0x78a894, density: 0.017 },
  // the play area sharp; the far forest only a touch soft (haze shows the distance)
  lens: { base: 14, max: 1.5, band: 1.2 },
  sunBoost: 1.35,
  sunTint: 0xfff0d8,
  rim: 0.3,
  grade: { white: [1.1, 1.0, 0.9], saturation: 1.18, contrast: 0.26, vignette: 0.22 },
  backdrop: { haze: 0.25, saturation: 0.5, contrast: 0.08, gain: 0.75, horizon: 0.9, horizonTop: 0.35 },
  wind: [0.05, 0.3],
};

// The scenery around the lane.
export async function build({ app, quality, terrain, layout }) {
  const THREE = await import('three');
  const [{ Grass }, { WindFlag }, { Flowers }, rocksMod, { Trees, scatterTrees }, { Plants }, { Stream }, { fitRopeBridge }, { tryProp }, { Canopy }, { Motes }, { tuneSun }] = await Promise.all([
    import('../world/grass.js'),
    import('../world/flag.js'),
    import('../world/flowers.js'),
    import('../world/rocks.js'),
    import('../world/trees.js'),
    import('../world/plants.js'),
    import('../world/stream.js'),
    import('../props.js'),
    import('../world/tryprop.js'),
    import('../world/canopy.js'),
    import('../world/motes.js'),
    import('../world/light.js'),
  ]);
  const group = new THREE.Group();
  const H = (x, z) => terrain.baseAt(x, z);
  const g = layout.gorge;
  const [t0, t1] = layout.tanks;
  const underTank = (x, z) => (Math.abs(x - t0) < 0.14 || Math.abs(x - t1) < 0.14) && Math.abs(z) < 0.1;
  // tall things in front of a tank hide it: keep the ground in front of the tracks clear
  const tankFront = (x, z) => (Math.abs(x - t0) < 0.19 || Math.abs(x - t1) < 0.19) && z > -0.06 && z < 0.24;
  // in or right beside the stream
  const inStream = (x, z, pad = 0.08) => -z > 0.28 && -z < 12 && Math.abs(x - gorgeX(g, z)) < halfWidth(g, z) + pad;
  const disposers = [];

  const grass = new Grass({ terrain, quality, spec: { ...STAGE.grass, area: [-2.7, 2.7, -1.3, 1.15] }, keepOut: (x, z) => inStream(x, z, 0.02) || tankFront(x, z) });
  group.add(grass.mesh);

  // ---------------------------------------------------------------- rocks
  const rockList = [];
  layout.knolls.forEach(([kx, kh, kw], i) => {
    if (kh < 0.06) return;
    rockList.push(...rocksMod.knollRocks({ x: kx, top: H(kx, 0), width: kw, outward: Math.sign(kx) || 1, seed: 301 + i * 17, heightAt: H, count: 9 }));
  });
  const R = rng(58);
  // along both banks of the gorge, and the boulders in the stream
  for (let i = 0; i < 30; i++) {
    const z = -0.34 - R() * 2.6;
    const side = R() < 0.5 ? -1 : 1;
    const x = gorgeX(g, z) + side * (halfWidth(g, z) + 0.02 + R() * 0.32);
    const s = 0.035 + R() * 0.11;
    rockList.push({ x, y: H(x, z) + s * 0.1, z, size: [s * 1.3, s * 0.75, s], yaw: R() * 6.28, tilt: R() * 0.4, seed: 800 + i, detail: 6 });
  }
  for (let i = 0; i < 10; i++) {
    const z = -0.4 - R() * 3.2;
    const x = gorgeX(g, z) + (R() - 0.5) * halfWidth(g, z) * 1.5;
    const s = 0.03 + R() * 0.06;
    rockList.push({ x, y: waterY(z) - 0.012, z, size: [s * 1.2, s * 0.8, s], yaw: R() * 6.28, tilt: R() * 0.3, seed: 900 + i, detail: 5 });
  }
  // a few big mossy stones in the front corners
  for (const [x, z, s] of [[-1.0, 0.62, 0.13], [-0.72, 0.85, 0.09], [1.05, 0.7, 0.1], [-1.5, 0.35, 0.14]]) {
    rockList.push({ x, y: H(x, z) + s * 0.12, z, size: [s * 1.4, s * 0.8, s], yaw: R() * 6.28, tilt: R() * 0.3, seed: 950 + Math.round(x * 10), detail: 8 });
  }
  // the far banks: layered stone ledges and fractured shards stepping up the gorge walls and standing about the forest floor behind.
  // Bare grey-brown stone with moss only on the flat tops; the farther ones melt into the haze.
  const ledgeList = [];
  const OC = rng(1234);
  for (let i = 0; i < 8; i++) {
    const z = -1.9 - Math.pow(OC(), 1.15) * 11;
    const side = i % 2 ? 1 : -1;
    const x = gorgeX(g, z) + side * (halfWidth(g, z) + 0.3 + Math.pow(OC(), 1.5) * 3.4);
    // radii (the rock's size is its half extent); wider with depth so the far ones still read
    const w = (0.12 + Math.pow(OC(), 1.9) * 0.95) * (0.8 + 0.05 * -z);
    const yaw0 = OC() * 6.28;
    let ww = w;
    let y = H(x, z) - w * 0.05;
    let ox = 0;
    let oz = 0;
    const layers = 2 + Math.floor(OC() * 3);
    for (let l = 0; l < layers; l++) {
      const th = ww * (0.2 + OC() * 0.12);
      ledgeList.push({ x: x + ox, y: y + th * 0.5, z: z + oz, size: [ww * (0.9 + OC() * 0.35), th, ww * (0.6 + OC() * 0.35)], yaw: yaw0 + (OC() - 0.5) * 0.6, tilt: (OC() - 0.5) * (l ? 0.35 : 0.14), seed: 1100 + i * 10 + l, detail: 9, cuts: 12, lumpy: 0.14, reach: 0.52, flat: 0.98, blocky: 1 });
      y += th * 0.85;
      ww *= 0.6 + OC() * 0.22;
      ox += (OC() - 0.5) * ww * 0.8;
      oz += (OC() - 0.5) * ww * 0.6;
    }
  }
  // tall broken shards, the faces of the gorge
  for (let i = 0; i < 6; i++) {
    const z = -2.4 - Math.pow(OC(), 1.1) * 9;
    const side = i % 2 ? 1 : -1;
    const x = gorgeX(g, z) + side * (halfWidth(g, z) + 0.45 + Math.pow(OC(), 1.4) * 3);
    const w = (0.09 + OC() * 0.24) * (0.8 + 0.05 * -z);
    ledgeList.push({ x, y: H(x, z) + w * 0.6, z, size: [w * 0.75, w * (1.0 + OC() * 1.0), w * 0.6], yaw: OC() * 6.28, tilt: (OC() - 0.5) * 0.3, seed: 1300 + i, detail: 9, cuts: 8, lumpy: 0.09, reach: 0.5, flat: 0.98, blocky: 1 });
  }
  rockList.push(...rocksMod.pebbles({ area: [-1.8, 1.8, -0.5, 0.95], count: Math.round(80 * quality.grass), seed: 9, heightAt: H, keepOut: (x, z) => underTank(x, z) || inStream(x, z, 0.0) }));
  const rocks = await rocksMod.buildRocks({ rocks: rockList, look: { rock: 'rock-moss', cap: 'moss', capAmount: 0.66, capSoft: 0.24, rockTint: 0xc9c8b8, capTint: 0xdcf0a0, rockTile: 2.2, capTile: 3.5 } });
  group.add(rocks.mesh);
  disposers.push(() => rocks.dispose());
  const ledges = await rocksMod.buildRocks({ rocks: ledgeList, look: { rock: 'rock', cap: 'moss', capAmount: 0.42, capSoft: 0.16, rockTint: 0xdedcd2, capTint: 0xdcf0a0, rockTile: 2.2, capTile: 3, haze: { color: 0x78a894, near: 2.5, far: 18, amount: 0.6 } } });
  group.add(ledges.mesh);
  disposers.push(() => ledges.dispose());

  // ---------------------------------------------------------------- undergrowth
  const nearKnoll = (x, z) => {
    let k = 0;
    for (const [kx, kh, kw] of layout.knolls) {
      if (kh < 0.06) continue;
      const d = Math.hypot((x - kx) / kw, (z - 0.05) / (kw * 1.4));
      k += Math.exp(-((d - 1.15) * (d - 1.15)) / 0.12) * 0.9;
    }
    return k;
  };
  const flowers = new Flowers({
    terrain,
    quality,
    seed: 51,
    spec: {
      count: 340,
      area: [-2.3, 2.3, -1.2, 1.0],
      mix: [
        { kind: 'star', colors: [0x9d5be8, 0xb47cf5, 0x8a4ddc], weight: 0.38, size: [0.008, 0.014], height: [0.05, 0.12] },
        { kind: 'cup', colors: [0x8f63e0, 0xa982f0, 0xd08cf0], weight: 0.22, size: [0.007, 0.012], height: [0.04, 0.1] },
        { kind: 'daisy', colors: [0xffffff, 0xf4f0ff], weight: 0.2, size: [0.007, 0.011], height: [0.03, 0.08] },
        { kind: 'buttercup', colors: [0xffd11a, 0xffc300], weight: 0.2, size: [0.006, 0.01], height: [0.03, 0.07] },
      ],
      near: (x, z) => nearKnoll(x, z) + (z > 0.4 ? 0.3 : 0),
      keepOut: (x, z) => tankFront(x, z) || inStream(x, z, 0.0),
    },
  });
  group.add(flowers.group);
  const plants = new Plants({
    terrain,
    quality,
    seed: 61,
    look: { rough: 0.55, glow: 0.07 },
    groups: [
      { kind: 'fern', count: 140, area: [-2.3, 2.3, -1.5, 0.8], size: [0.07, 0.16], colors: [0x3a7a2a, 0x4c8c30, 0x5a9a34, 0x2f6a26], weight: (x, z) => (z > 0.1 ? 0.25 : 0.8), keepOut: (x, z) => tankFront(x, z) || inStream(x, z, 0.06) },
      { kind: 'fern', count: 44, area: [-3, 3, -3.6, -1.4], size: [0.14, 0.3], colors: [0x3a7a2a, 0x4c8c30, 0x2f6a26], keepOut: (x, z) => inStream(x, z, 0.1) },
      { kind: 'shrub', count: 22, area: [-2.6, 2.6, -2.8, -0.5], size: [0.07, 0.16], colors: [0x3d6a24, 0x4d7a2a, 0x5b8630], keepOut: (x, z) => tankFront(x, z) || inStream(x, z, 0.1) },
      // the forest floor behind the stream: ferns and bushes growing bigger with distance, so no bare lawn shows between the tanks and the trees
      { kind: 'fern', count: 110, area: [-6, 6, -9, -3.4], size: [0.22, 0.5], colors: [0x3a7a2a, 0x4c8c30, 0x5a9a34, 0x2f6a26], keepOut: (x, z) => inStream(x, z, 0.14), scaleCount: false },
      { kind: 'fern', count: 130, area: [-13, 13, -19, -9], size: [0.45, 1.0], colors: [0x3a7a2a, 0x4c8c30, 0x2f6a26, 0x578f2c], keepOut: (x, z) => inStream(x, z, 0.3), scaleCount: false },
      { kind: 'shrub', count: 80, area: [-11, 11, -17, -3.8], size: [0.3, 0.85], colors: [0x3d6a24, 0x5b8630, 0x6f9a30, 0x2f5a20], keepOut: (x, z) => inStream(x, z, 0.25), scaleCount: false },
      // the soft blurred ferns in the front corners
      { kind: 'fern', count: 14, area: [-2.0, -0.7, 0.8, 1.4], size: [0.16, 0.3], colors: [0x4c8c30, 0x5a9a34, 0x3a7a2a], weight: () => 1, scaleCount: false },
      { kind: 'fern', count: 14, area: [0.8, 2.0, 0.8, 1.4], size: [0.16, 0.3], colors: [0x4c8c30, 0x5a9a34, 0x3a7a2a], weight: () => 1, scaleCount: false },
    ],
  });
  group.add(plants.group);

  // ---------------------------------------------------------------- the gorge: stream and bridge
  const stream = new Stream({ terrain, centre: (z) => gorgeX(g, z), half: (z) => halfWidth(g, z), level: waterY, z0: -11, z1: -0.28 });
  group.add(stream.mesh);
  const cxb = gorgeX(g, ZB);
  // the rope bridge from the props kit, its posts on the two banks
  const span = 1.04;
  const bx0 = cxb - span / 2;
  const bx1 = cxb + span / 2;
  const bridge = await tryProp('rope-bridge');
  if (bridge) {
    fitRopeBridge(bridge, span);
    bridge.position.set(cxb, Math.min(H(bx0, ZB), H(bx1, ZB)) - 0.012, ZB);
    bridge.rotation.y = 0.03 * Math.sin(g.phase);
    group.add(bridge);
    const swing = swingBridge(THREE, bridge, cxb, ZB, span);
    reactors.add(swing);
    disposers.push(() => reactors.delete(swing));
  }

  // a fallen log on the near bank and toadstools on the shoulders of the mounds
  const log = await tryProp('log');
  if (log) {
    const lx = cxb - 0.95;
    const lz = -1.15;
    log.position.set(lx, H(lx, lz) - 0.01, lz);
    log.rotation.y = 0.3;
    log.scale.setScalar(1.5);
    group.add(log);
  }
  const [tb0, tb1] = layout.tanks;
  const shrooms = [[tb0 - 0.27, 0.1, 0.4, 1.4], [tb0 - 0.31, 0.02, 2.1, 1.0], [tb1 + 0.28, 0.14, 1.0, 1.3], [cxb + 0.5, -0.36, 3.5, 1.1]];
  for (const [mx, mz, ry, k] of shrooms) {
    const m = await tryProp('mushroom');
    if (!m) break;
    m.position.set(mx, H(mx, mz) - 0.004, mz);
    m.rotation.y = ry;
    m.scale.setScalar(k);
    group.add(m);
  }

  // ---------------------------------------------------------------- trees
  // toy pines about the tanks
  const toyList = [];
  const T = rng(77);
  for (let i = 0; i < 500 && toyList.length < 20; i++) {
    const x = -2.1 + T() * 4.2;
    const z = -0.15 - Math.pow(T(), 1.5) * 2.4;
    if (Math.abs(x - gorgeX(g, z)) < halfWidth(g, z) + 0.4 && -z < 4) continue;
    if (toyList.some((t) => Math.hypot(t.x - x, t.z - z) < 0.3)) continue;
    // a few taller ones behind
    const h = (0.2 + T() * 0.22) * (1 + Math.min(1, -z * 0.4) * 0.8);
    toyList.push({ x, y: H(x, z), z, h });
  }
  const toy = new Trees({ quality, list: toyList, look: { kind: 'pine', variants: 4, seed: 5, leafScale: 3.4, shadow: true, colors: [0x2d6a2e, 0x3d7d35, 0x286028, 0x4b8a3a] } });
  // the real trees: tall pines a few metres behind and far into the haze
  const corridor = (x, z) => Math.abs(x - gorgeX(g, z)) < 1.6 && -z < 12;
  const midList = scatterTrees({ count: 120, area: [-34, 34, -46, -8], heightAt: H, seed: 71, minGap: 2.8, size: [9, 17], density: (x, z) => (corridor(x, z) ? 0 : 1) });
  // real pines are slim for their height: narrow the crowns
  const W = rng(83);
  for (const t of midList) t.wide = 0.5 + W() * 0.2;
  const mid = new Trees({ quality, list: midList, look: { kind: 'pine', variants: 3, seed: 8, colors: [0x1f4622, 0x275226, 0x1b3b1d, 0x2f5e2b] } });
  const farList = scatterTrees({ count: Math.round(2600 * Math.max(0.4, quality.grass)), area: [-320, 320, -420, -50], heightAt: H, seed: 72, minGap: 6, size: [12, 24], density: (x, z) => 0.7 + 0.3 * fbm(x * 0.01, z * 0.01, 2, 5) });
  for (const t of farList) {
    t.y -= 1;
    t.wide = 0.5 + W() * 0.2;
  }
  const far = new Trees({ quality, list: farList, look: { kind: 'pine', far: true, variants: 2, seed: 9, colors: [0x1f4622, 0x275226, 0x1b3b1d] } });
  group.add(toy.group, mid.group, far.group);

  // ---------------------------------------------------------------- sunlight through the leaves
  // the sun a little lower and more from the side than the photograph's, so shadows are long and clear
  tuneSun(app, { dir: [-0.72, 0.6, 0.22] });
  const sun = app.sunDir;
  // the dappling reaches further than the lane's own shadow box: widen it while this stage is up
  const sc = app.sun.shadow.camera;
  const keepBox = [sc.left, sc.right, sc.top, sc.bottom];
  sc.left = -5.5;
  sc.right = 5.5;
  sc.top = 3.4;
  sc.bottom = -3.4;
  sc.updateProjectionMatrix();
  disposers.push(() => {
    [sc.left, sc.right, sc.top, sc.bottom] = keepBox;
    sc.updateProjectionMatrix();
  });
  const canopy = new Canopy({
    sun,
    area: [-5, 5, -3.6, 2.4],
    // both tanks and the stretch between them stay in the sun
    clear: [{ x: t0, z: 0, r: 0.3 }, { x: t1, z: 0, r: 0.3 }, { x: (t0 + t1) / 2, z: 0, r: 0.22 }],
    amount: 0.55,
    seed: 12 + layout.tanks[0] * 10,
  });
  group.add(canopy.group);
  // pollen and seeds drifting through the light
  const motes = new Motes({ post: app.post, quality, spec: { count: 130, box: [-2.4, 2.4, 0.02, 0.85, -1.4, 0.8], size: [0.001, 0.0026], color: 0xfff0b8, fluff: 0.3, rise: [-0.005, 0.02], bob: 0.03, calm: 0.03, windScale: 0.6 } });
  group.add(motes.mesh);

  const fx = (t0 + t1) / 2 + 0.12;
  const flag = new WindFlag({ x: fx, z: -0.26, y: terrain.heightAt(fx, -0.26) - 0.004 });
  group.add(flag.object);
  return {
    group,
    shapes: [],
    update(dt, time, a) {
      grass.update(dt, time, a.world, a.tanks);
      flowers.update(dt, time, a.world);
      plants.update(dt, time, a.world);
      toy.update(dt, time, a.world);
      mid.update(dt, time, a.world);
      far.update(dt, time, a.world);
      stream.update(dt, time);
      swing.update(dt, a.world.wind ?? 0);
      canopy.update(dt, time, a.world);
      motes.update(dt, time, a.world);
      flag.update(dt, time, a.world.wind);
    },
    shockwave(x, z, s) {
      grass.shockwave(x, z, s, app.time);
    },
    dispose() {
      grass.dispose();
      flowers.dispose();
      plants.dispose();
      stream.dispose();
      toy.dispose();
      mid.dispose();
      far.dispose();
      canopy.dispose();
      motes.dispose();
      flag.dispose();
      for (const d of disposers) d();
    },
  };
}

// The planks and hand ropes hang from the post tops, so a burst close by
// sets them swinging to and fro (most in the middle, not at all at the
// posts) and they settle again; a breeze keeps them just moving. The deck is
// bent in its vertex shader so the ends stay tied to the posts.
function swingBridge(THREE, bridge, cx, cz, span) {
  bridge.updateMatrixWorld(true);
  const top = bridge.position.y + 0.22;
  const sway = { value: new THREE.Vector4(cx, span / 2, top, 0) };
  bridge.getObjectByName('deck')?.traverse((m) => {
    if (!m.isMesh) return;
    m.material = m.material.clone();
    m.material.onBeforeCompile = (shader) => {
      shader.uniforms.uSway = sway;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uSway;')
        .replace(
          '#include <project_vertex>',
          `vec4 swWp = modelMatrix * vec4(transformed, 1.0);
{
  float u = clamp((swWp.x - uSway.x) / uSway.y, -1.0, 1.0);
  float along = cos(u * 1.5708);
  float hang = clamp((uSway.z - swWp.y) / 0.2, 0.0, 1.0);
  swWp.z += uSway.w * along * hang;
  // swinging out, it rises a little like a pendulum
  swWp.y += uSway.w * uSway.w * along * hang * 3.3;
}
vec4 mvPosition = viewMatrix * swWp;
gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    m.material.customProgramCacheKey = () => 'bridge-swing';
  });
  let z = 0;
  let v = 0;
  const w = 2 * Math.PI * 1.15;
  return {
    blast(e) {
      // how near the burst is to the deck (a segment along x at depth cz)
      const dx = Math.max(0, Math.abs(e.x - cx) - span / 2);
      const d = Math.hypot(dx, e.z - cz);
      const reach = e.radius * 2.4;
      if (d >= reach) return;
      const k = 1 - d / reach;
      const mid = Math.cos(Math.min(1, Math.abs(e.x - cx) / (span / 2)) * Math.PI / 2);
      v += Math.sign(cz - e.z || -1) * k * k * (0.35 + 0.65 * mid) * (e.great ? 0.16 : 0.1) * e.scale;
    },
    update(dt, wind) {
      if (dt <= 0) return;
      const h = Math.min(dt, 1 / 30);
      // a damped pendulum, nudged by the wind
      const a = -w * w * (z - wind * 0.0015) - 2 * 0.1 * w * v;
      v += a * h;
      z += v * h;
      z = Math.max(-0.025, Math.min(0.025, z));
      sway.value.w = z;
    },
  };
}
