// Rainy garden: soft grey light, wet glossy mud with puddles that mirror the
// sky, tufts of grass and lush flowers, a wooden fence behind the lane, big
// leafy plants, a watering can beside the right tank, and the garden's trees
// and hedges melting into the rain beyond. The tanks sit on low muddy
// mounds. Rain falls in soft streaks (in front of and behind the fence) and
// rings the puddles.
import { fbm, rng, smoothstep } from '../config.js';

// Layouts: where the two tanks start (x), the knolls under them (x, height,
// width), a dip between them and the puddles' hollows (x, z, radius x, radius
// z, depth). The puddles are the hollows lower than PUDDLE.
const LAYOUTS = [
  { tanks: [-0.43, 0.43], knolls: [[-0.45, 0.085, 0.25], [0.45, 0.075, 0.25]], dip: [0.0, 0.025], basins: [[-0.03, 0.28, 0.45, 0.22, 0.036], [0.02, -0.02, 0.24, 0.12, 0.03], [-0.85, 0.55, 0.35, 0.2, 0.03], [0.9, 0.62, 0.3, 0.16, 0.028], [0.25, 1.0, 0.6, 0.22, 0.034]] },
  { tanks: [-0.4, 0.5], knolls: [[-0.42, 0.075, 0.24], [0.52, 0.09, 0.26]], dip: [-0.15, 0.02], basins: [[0.15, 0.3, 0.5, 0.24, 0.036], [-0.15, 0.0, 0.24, 0.11, 0.03], [-1.1, 0.5, 0.35, 0.2, 0.03]] },
  { tanks: [-0.5, 0.36], knolls: [[-0.52, 0.09, 0.26], [0.38, 0.07, 0.24], [-0.06, 0.03, 0.11]], dip: [0.1, 0.02], basins: [[-0.12, 0.32, 0.46, 0.2, 0.034], [0.3, 0.55, 0.4, 0.18, 0.03], [0.08, -0.02, 0.22, 0.1, 0.028]] },
];

// the water level of the puddles, m (the ground is about 0)
const PUDDLE = -0.014;
// where the fence stands (depth, m behind the lane)
const FENCE_Z = -2.3;

// a mound: a flat top for the tank, reaching out towards the camera
function knoll(x, z, kx, kh, kw) {
  const dx = (x - kx) / kw;
  const dz = (z - 0.05) / (kw * (z > 0.05 ? 1.45 : 0.95));
  if (kh < 0) return kh * Math.exp(-(dx * dx + dz * dz) * 1.4);
  const r = Math.sqrt(dx * dx + dz * dz) * (1 + 0.14 * fbm(x * 9 + kx * 3, z * 9, 2, 21));
  return kh * (1 - smoothstep(0.4, 1.2, r));
}

function heightFor(layout) {
  const { knolls, dip, basins } = layout;
  return (x, z) => {
    // wet, lumpy ground
    let h = 0.008 * fbm(x * 1.5, z * 1.5, 4, 11) + 0.004 * fbm(x * 7, z * 7, 2, 5) + 0.002 * fbm(x * 30, z * 30, 2, 9);
    for (const [kx, kh, kw] of knolls) h += knoll(x, z, kx, kh, kw);
    h -= dip[1] * Math.exp(-((x - dip[0]) * (x - dip[0])) / 0.18 - (z * z) / 0.3);
    for (const [bx, bz, rx, rz, d] of basins) {
      const u = (x - bx) / rx;
      const v = (z - bz) / rz;
      h -= d * Math.exp(-(u * u + v * v)) * (0.85 + 0.3 * fbm(x * 6, z * 6, 2, 3));
    }
    const b = -z;
    // the flower bed behind the lane is a little raised, and the fence stands on it
    h += 0.05 * smoothstep(0.25, 0.9, b) * (1 - smoothstep(2.6, 3.6, b));
    // beyond the fence a lawn, rolling gently up into the trees
    h += 0.06 * Math.min(b, 60) * smoothstep(1.5, 14, b);
    h += 0.8 * fbm(x * 0.03, z * 0.03, 3, 6) * smoothstep(8, 40, b);
    h += 7 * smoothstep(90, 260, b) * (0.6 + fbm(x * 0.006, b * 0.006, 3, 12));
    // the rim of the lawn in front
    h += 0.02 * smoothstep(0.6, 1.4, z) * (0.6 + 0.4 * fbm(x * 2, z * 2, 2, 7));
    return h;
  };
}

// how wooded the far ground is (canopy colour from afar; trees stand in it)
function woodsAt(x, z) {
  return smoothstep(8, 50, -z) * (0.75 + 0.25 * fbm(x * 0.02, z * 0.02, 2, 5));
}

export const STAGE = {
  id: 'garden',
  ground: {
    kind: 'mud',
    base: 'mud',
    dug: 'soil',
    far: 'grass-soil',
    baseTile: 0.55,
    dugTile: 0.4,
    farTile: 5,
    baseColor: 0x4a3a2a,
    dugColor: 0x4a3222,
    baseTint: 0xd9c2a4,
    dugTint: 0xb89673,
    farTint: 0x8fae62,
    coverColor: 0x2c4a1f,
    wetDark: 0.6,
    baseRough: 0.78,
    dugRough: 0.7,
    normalScale: 1.2,
  },
  layouts: LAYOUTS,
  heightFor,
  far: 700,
  wide: 700,
  cover: woodsAt,
  grass: { density: 1, height: [0.02, 0.07], color: [0x2a4c16, 0x86b23a], dry: 0x8f8a45 },
  // fallback light if the sky's own sun is not loaded
  sun: { dir: [0.2, 0.9, 0.3], color: 0xeaf0ff, intensity: 1.4 },
  hemi: { sky: 0xb8c8c0, ground: 0x4a5a34, intensity: 0.5 },
  exposure: 2.0,
  // rain haze: soft, grey-green, thickening quickly with distance
  fog: { color: 0x86a892, density: 0.05 },
  // the play area sharp; the far scenery only a touch soft (the rain haze shows the distance)
  lens: { base: 14, max: 1.5, band: 1.2 },
  // an overcast sky, but a strong soft light from above gives the wet things their highlights
  sunBoost: 1.3,
  sunTint: 0xf2f6ff,
  rim: 0.3,
  envIntensity: 1.15,
  grade: { white: [1.0, 1.0, 1.03], saturation: 1.15, contrast: 0.22, vignette: 0.25 },
  backdrop: { haze: 0.1, saturation: 1.25, contrast: 0.12, gain: 1, horizon: 0.9 },
  wind: [0.05, 0.3],
};

// The scenery around the lane.
export async function build({ app, quality, terrain, layout, softUniforms }) {
  const THREE = await import('three');
  const [{ Grass }, { WindFlag }, { Flowers }, rocksMod, { Trees, scatterTrees }, { Plants }, { Puddles }, { Rain }, { loadProp }] = await Promise.all([
    import('../world/grass.js'),
    import('../world/flag.js'),
    import('../world/flowers.js'),
    import('../world/rocks.js'),
    import('../world/trees.js'),
    import('../world/plants.js'),
    import('../world/puddles.js'),
    import('../world/rain.js'),
    import('../props.js'),
  ]);
  const group = new THREE.Group();
  const H = (x, z) => terrain.baseAt(x, z);
  const [t0, t1] = layout.tanks;
  const underTank = (x, z) => (Math.abs(x - t0) < 0.14 || Math.abs(x - t1) < 0.14) && Math.abs(z) < 0.1;
  // tall things in front of a tank hide it: keep the ground in front of the tracks clear
  const tankFront = (x, z) => (Math.abs(x - t0) < 0.19 || Math.abs(x - t1) < 0.19) && z > -0.06 && z < 0.24;
  const dry = (x, z) => H(x, z) > PUDDLE + 0.012;
  const disposers = [];
  // how near the shoulder of a mound: tufts, clover and flowers gather there
  const nearKnoll = (x, z) => {
    let k = 0;
    for (const [kx, kh, kw] of layout.knolls) {
      if (kh < 0.05) continue;
      const d = Math.hypot((x - kx) / kw, (z - 0.05) / (kw * 1.4));
      k += Math.exp(-((d - 1.05) * (d - 1.05)) / 0.18);
    }
    return k;
  };

  // tufts of grass in patches (on the mounds, round the puddles), bare mud between
  const patch = (x, z) => fbm(x * 2.3 + 3, z * 2.3, 3, 41);
  const grass = new Grass({
    terrain,
    quality,
    spec: { ...STAGE.grass, area: [-2.7, 2.7, -1.3, 1.6] },
    keepOut: (x, z) => !dry(x, z) || tankFront(x, z) || patch(x, z) + nearKnoll(x, z) * 0.6 < -0.02 + 0.1 * Math.max(0, -z - 0.3),
  });
  group.add(grass.mesh);

  // wet stones on the mounds, pebbles in the mud
  const rockList = [];
  layout.knolls.forEach(([kx, kh, kw], i) => {
    if (kh < 0.05) return;
    rockList.push(...rocksMod.knollRocks({ x: kx, top: H(kx, 0), width: kw, outward: Math.sign(kx) || 1, seed: 201 + i * 17, heightAt: H, count: 6 }));
  });
  rockList.push(...rocksMod.pebbles({ area: [-1.8, 1.8, 0.08, 1.4], count: Math.round(170 * quality.grass), seed: 8, heightAt: H, keepOut: (x, z) => underTank(x, z) || !dry(x, z) }));
  const R = rng(66);
  for (let i = 0; i < 6; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (0.9 + R() * 1.2);
    const z = -0.3 - R() * 0.7;
    const s = 0.05 + R() * 0.1;
    rockList.push({ x, y: H(x, z) + s * 0.1, z, size: [s * 1.3, s * 0.7, s], yaw: R() * 6.28, tilt: R() * 0.3, seed: 700 + i, detail: 6 });
  }
  const rocks = await rocksMod.buildRocks({ rocks: rockList, look: { rock: 'rock', cap: 'moss', capAmount: 0.3, capSoft: 0.2, rockTint: 0xa8a49a, capTint: 0xa8c880, rockTile: 2.2, capTile: 4 } });
  group.add(rocks.mesh);
  disposers.push(() => rocks.dispose());

  // ---------------------------------------------------------------- flowers
  const bloomMix = (weightScale = 1) => [
    { kind: 'zinnia', colors: [0xf25c8e, 0xff82a8, 0xf0407a, 0xff9ec0], weight: 0.3 * weightScale, size: [0.026, 0.042], height: [0.2, 0.4], tilt: 0.55 },
    { kind: 'zinnia', colors: [0xffc21a, 0xffa800, 0xffd84a], weight: 0.14 * weightScale, size: [0.024, 0.038], height: [0.16, 0.34], tilt: 0.5 },
    { kind: 'globe', colors: [0x8a4fd8, 0xa06ae8, 0x7b3fc4], weight: 0.18 * weightScale, size: [0.032, 0.05], height: [0.2, 0.38], tilt: 0.3 },
    { kind: 'lily', colors: [0xff9ec4, 0xfff0a0, 0xffc2d8], weight: 0.1 * weightScale, size: [0.024, 0.036], height: [0.18, 0.32], tilt: 0.4 },
  ];
  const bloomsL = new Flowers({ terrain, quality, seed: 31, spec: { count: 90, area: [-2.1, -0.6, -1.15, -0.34], mix: bloomMix(), near: () => 0.9, keepOut: underTank } });
  const bloomsR = new Flowers({ terrain, quality, seed: 32, spec: { count: 55, area: [0.95, 1.9, -1.15, -0.4], mix: bloomMix(0.8), near: () => 0.9, keepOut: underTank } });
  const small = new Flowers({
    terrain,
    quality,
    seed: 33,
    spec: {
      count: 420,
      area: [-2.3, 2.3, -0.9, 1.4],
      mix: [
        { kind: 'daisy', colors: [0xffffff, 0xf4f0ff], weight: 0.3, size: [0.008, 0.012], height: [0.03, 0.08] },
        { kind: 'buttercup', colors: [0xffd11a, 0xffc300], weight: 0.25, size: [0.006, 0.01], height: [0.035, 0.08] },
        { kind: 'cup', colors: [0xff6fae, 0xff9cc8], weight: 0.2, size: [0.007, 0.011], height: [0.03, 0.07] },
        { kind: 'star', colors: [0xa77bff, 0x8b8dff, 0xc38bff], weight: 0.25, size: [0.006, 0.01], height: [0.025, 0.06] },
      ],
      near: (x, z) => nearKnoll(x, z) * 0.9,
      keepOut: (x, z) => tankFront(x, z) || !dry(x, z),
    },
  });
  // a deeper bed of tall blooms along the fence
  const bloomsB = new Flowers({ terrain, quality, seed: 34, spec: { count: 150, area: [-3.4, 3.4, -2.05, -1.2], mix: bloomMix(1.1).map((m) => ({ ...m, height: [m.height[0] * 1.5, m.height[1] * 1.7], size: [m.size[0] * 1.15, m.size[1] * 1.2] })), near: () => 0.9, keepOut: underTank } });
  group.add(bloomsL.group, bloomsR.group, bloomsB.group, small.group);

  // ---------------------------------------------------------------- leaves
  const side = (x, z, k) => smoothstep(0.5, 0.5 + k, Math.abs(x)) * (z < 0.1 ? 1 : 0.3);
  const plants = new Plants({
    terrain,
    quality,
    seed: 41,
    look: { rough: 0.25, glow: 0.04, trans: 0.4 },
    groups: [
      // behind the fence: leafy shrubs, tall canna leaves and big hostas, all real detail for the eye (the rain haze softens them)
      { kind: 'shrub', count: 60, area: [-3.6, 3.6, -3.5, -2.55], size: [0.5, 0.95], colors: [0x24501e, 0x2f6226, 0x1f4a1c, 0x3a7230], scaleCount: false },
      { kind: 'canna', count: 26, area: [-3.4, 3.4, -3.4, -2.5], size: [0.7, 1.15], colors: [0x1a5623, 0x28702e, 0x2f6a2a], scaleCount: false },
      { kind: 'hosta', count: 22, area: [-3.4, 3.4, -3.2, -2.45], size: [0.34, 0.6], colors: [0x1c5a26, 0x2a7532, 0x1f612b], scaleCount: false },
      // the big leaves behind the right tank and by the fence
      { kind: 'hosta', count: 16, area: [0.7, 2.1, -1.2, -0.42], size: [0.2, 0.42], colors: [0x1c5a26, 0x2a7532, 0x3a8a36, 0x1f612b], keepOut: underTank },
      { kind: 'hosta', count: 8, area: [-2.1, -0.9, -1.2, -0.45], size: [0.16, 0.3], colors: [0x1c5a26, 0x2f7d32], keepOut: underTank },
      { kind: 'canna', count: 10, area: [0.5, 2.0, -1.2, -0.6], size: [0.28, 0.5], colors: [0x1d5c28, 0x2b7530, 0x497f26], keepOut: underTank },
      { kind: 'shrub', count: 44, area: [-3.0, 3.0, -1.35, -0.6], size: [0.2, 0.46], colors: [0x2b5a24, 0x376a2a, 0x2a5222], weight: (x) => 0.4 + 0.6 * smoothstep(0.4, 1.4, Math.abs(x)) },
      // the bed in front of the fence
      { kind: 'shrub', count: 34, area: [-3.4, 3.4, -2.2, -1.25], size: [0.22, 0.5], colors: [0x2b5a24, 0x376a2a, 0x2a5222, 0x3a7230], scaleCount: false },
      { kind: 'hosta', count: 14, area: [-3.0, 3.0, -2.15, -1.3], size: [0.26, 0.5], colors: [0x1c5a26, 0x2a7532, 0x3a8a36], scaleCount: false },
      { kind: 'canna', count: 12, area: [-3.0, 3.0, -2.15, -1.5], size: [0.4, 0.8], colors: [0x1a5623, 0x28702e, 0x497f26], scaleCount: false },
      // clover round the mounds
      { kind: 'clover', count: 320, area: [-2.2, 2.2, -0.6, 1.35], size: [0.018, 0.034], colors: [0x4a9a38, 0x3c8a30, 0x5aa840], weight: (x, z) => 0.1 + nearKnoll(x, z), keepOut: (x, z) => underTank(x, z) || !dry(x, z) },
      // ferns and low leaves round the mounds and puddles
      { kind: 'fern', count: 44, area: [-2.2, 2.2, -0.55, 1.3], size: [0.07, 0.15], colors: [0x2f6a26, 0x3f7f30, 0x4c8c34], weight: (x, z) => side(x, z, 0.4), keepOut: (x, z) => tankFront(x, z) || !dry(x, z) },
      // big soft leaves in the corners of the frame, near the camera
      { kind: 'hosta', count: 8, area: [-2.0, -0.85, 0.95, 1.45], size: [0.16, 0.3], colors: [0x2f7030, 0x3d8636], weight: () => 1, scaleCount: false },
      { kind: 'fern', count: 8, area: [0.9, 2.0, 0.95, 1.45], size: [0.14, 0.26], colors: [0x3a7a2e, 0x4c8c34], weight: () => 1, scaleCount: false },
    ],
  });
  group.add(plants.group);

  // ---------------------------------------------------------------- fence, can
  // one-metre fence tiles from the props kit, standing on the raised bed and meeting end to end
  const fenceTiles = [];
  for (let i = -4; i <= 3; i++) {
    const tile = await loadProp('fence');
    const x = i + 0.5;
    const lean = Math.sin(i * 12.9898) * 0.5;
    tile.position.set(x, H(x, FENCE_Z) - 0.01, FENCE_Z + lean * 0.03);
    tile.rotation.set(0, lean * 0.03, lean * 0.012);
    tile.scale.set(1, 0.86 + 0.1 * Math.sin(i * 4.1 + 1), 1.2);
    group.add(tile);
    fenceTiles.push(tile);
  }

  // the watering can stands just behind the lane between the tanks, near
  // enough for a burst to knock it about
  const can = await loadProp('watering-can');
  const cx = (t0 + t1) / 2 + 0.22;
  const cz = -0.34;
  can.position.set(cx, H(cx, cz) - 0.004, cz);
  can.rotation.y = 0.5;
  group.add(can);

  // ---------------------------------------------------------------- water and rain
  const puddles = new Puddles({ terrain, level: PUDDLE, area: [-2.8, 2.8, -0.9, 1.7], color: 0x6a5238, deep: 0x2a2014, rough: 0.03, ior: 1.9, tilt: 0.16 });
  group.add(puddles.mesh);
  const rain = new Rain({ quality, softUniforms, lensUniforms: app.post.lens.cocU, count: 1800, alpha: 0.7 });
  group.add(rain.mesh);

  // ---------------------------------------------------------------- trees and hedges
  const shrubs = scatterTrees({ count: 46, area: [-4.6, 4.6, -5.2, -3.0], heightAt: H, seed: 21, minGap: 0.8, size: [1.4, 2.6], density: () => 1 });
  const hedge = new Trees({ quality, list: shrubs, look: { kind: 'round', variants: 3, seed: 3, colors: [0x2b5a22, 0x356b28, 0x274f20, 0x3d7430] } });
  const gardenTrees = scatterTrees({ count: 46, area: [-30, 30, -30, -5], heightAt: H, seed: 22, minGap: 3.5, size: [5, 10], density: () => 1 });
  const trees = new Trees({ quality, list: gardenTrees, look: { kind: 'round', seed: 4, colors: [0x2f5f24, 0x3b7229, 0x2a5320, 0x487f30] } });
  const pineList = scatterTrees({ count: 26, area: [-40, 40, -45, -8], heightAt: H, seed: 23, minGap: 5, size: [9, 17], density: () => 1 });
  const pines = new Trees({ quality, list: pineList, look: { kind: 'pine', seed: 6, colors: [0x1f4a22, 0x24552a, 0x1c421f] } });
  const farList = scatterTrees({ count: Math.round(2200 * Math.max(0.4, quality.grass)), area: [-300, 300, -400, -45], heightAt: H, seed: 24, minGap: 8, size: [9, 16], density: (x, z) => 0.5 + 0.5 * woodsAt(x, z) });
  for (const t of farList) t.y -= 1;
  const farTrees = new Trees({ quality, list: farList, look: { kind: 'round', far: true, variants: 2, seed: 9, colors: [0x2b5a22, 0x356628, 0x244d1e, 0x3f7230] } });
  group.add(hedge.group, trees.group, pines.group, farTrees.group);

  const fx = (t0 + t1) / 2 + 0.12;
  const flag = new WindFlag({ x: fx, z: -0.26, y: terrain.heightAt(fx, -0.26) - 0.004 });
  group.add(flag.object);
  return {
    group,
    shapes: [],
    update(dt, time, a) {
      grass.update(dt, time, a.world, a.tanks);
      bloomsL.update(dt, time, a.world);
      bloomsR.update(dt, time, a.world);
      bloomsB.update(dt, time, a.world);
      small.update(dt, time, a.world);
      plants.update(dt, time, a.world);
      hedge.update(dt, time, a.world);
      trees.update(dt, time, a.world);
      pines.update(dt, time, a.world);
      farTrees.update(dt, time, a.world);
      puddles.update(dt, time);
      rain.update(dt, time, a);
      flag.update(dt, time, a.world.wind);
    },
    // is there puddle water here (a burst there splashes)
    waterAt: (x, z) => H(x, z) < PUDDLE - 0.001,
    shockwave(x, z, s) {
      grass.shockwave(x, z, s, app.time);
    },
    dispose() {
      grass.dispose();
      bloomsL.dispose();
      bloomsR.dispose();
      bloomsB.dispose();
      small.dispose();
      plants.dispose();
      hedge.dispose();
      trees.dispose();
      pines.dispose();
      farTrees.dispose();
      puddles.dispose();
      rain.dispose();
      for (const d of disposers) d();
    },
  };
}
