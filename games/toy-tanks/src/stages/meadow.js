// Meadow: a sunny hillside above a lake. The tanks sit on mossy knolls with
// rocks breaking through their fronts and wild flowers at their feet; behind
// the lane the lawn falls away to the water, with wooded hills on either
// side of the valley and mountains beyond.
import { fbm, rng, smoothstep } from '../config.js';

// Layouts: where the two tanks start (x), and the knolls under them
// (x, height, width); a negative height is a hollow. Several, so every game
// looks a little different.
const LAYOUTS = [
  { tanks: [-0.43, 0.43], knolls: [[-0.45, 0.16, 0.25], [0.45, 0.14, 0.26]], dip: [0, 0.05] },
  { tanks: [-0.38, 0.5], knolls: [[-0.4, 0.13, 0.24], [0.52, 0.18, 0.27], [0.06, 0.035, 0.1]], dip: [-0.14, 0.04] },
  { tanks: [-0.5, 0.36], knolls: [[-0.52, 0.19, 0.28], [0.38, 0.12, 0.24], [-0.08, -0.03, 0.14]], dip: [0.05, 0.04] },
];

const WATER_Y = -20;

// how wooded the ground is: forest patches up the hillsides, none by the
// water (the terrain paints it as canopy from afar; trees stand in it)
function woodsAt(x, z, y) {
  if (y < WATER_Y + 0.6) return 0;
  const up = smoothstep(WATER_Y + 1, WATER_Y + 14, y);
  return up * smoothstep(-0.2, 0.2, fbm(x * 0.011, z * 0.011, 3, 3));
}

// moss over the knolls' tops and shoulders, ragged at the edge
function patchFor(layout) {
  return (x, z) => {
    let m = 0;
    for (const [kx, kh, kw] of layout.knolls) {
      if (kh < 0.06) continue;
      const dx = (x - kx) / kw;
      const dz = (z - 0.05) / (kw * (z > 0.05 ? 1.45 : 0.95));
      const r = Math.sqrt(dx * dx + dz * dz) + 0.25 * fbm(x * 14, z * 14, 2, 41);
      m = Math.max(m, 1 - smoothstep(0.55, 1.05, r));
    }
    return m;
  };
}

// a knoll: a flat top for the tank, reaching out towards the camera
function knoll(x, z, kx, kh, kw) {
  const dx = (x - kx) / kw;
  const dz = (z - 0.05) / (kw * (z > 0.05 ? 1.45 : 0.95));
  if (kh < 0) return kh * Math.exp(-(dx * dx + dz * dz) * 1.4);
  const r = Math.sqrt(dx * dx + dz * dz) * (1 + 0.12 * fbm(x * 9 + kx * 3, z * 9, 2, 21));
  return kh * (1 - smoothstep(0.4, 1.2, r));
}

function heightFor(layout) {
  const { knolls, dip } = layout;
  return (x, z) => {
    let h = 0.01 * fbm(x * 1.7, z * 1.7, 4, 11) + 0.004 * fbm(x * 9, z * 9, 2, 5);
    for (const [kx, kh, kw] of knolls) h += knoll(x, z, kx, kh, kw);
    h -= dip[1] * Math.exp(-((x - dip[0]) * (x - dip[0])) / 0.18 - (z * z) / 0.3);
    // behind the lane the lawn rolls over a brow and down the hillside to
    // the lake, a long valley with wooded hills either side, closing in to
    // hills on the far shore (real size: the lake is a few hundred metres long)
    const b = -z;
    const ax = Math.abs(x);
    // just behind the tanks the lawn rolls over a brow and the hillside falls
    // away, steep at first, to the lake far below: the tanks stand up
    // against the valley, as on a hilltop
    h -= 0.3 * smoothstep(0.3, 3, b) + 24 * (1 - Math.exp(-Math.max(0, b - 1) / 60));
    // wooded hills close in from both sides, so the lake lies in a V
    const side = 7 + b * 0.14 + 6 * fbm(z * 0.01, x * 0.01, 2, 8);
    h -= 1.6 * smoothstep(30, 50, b) * (1 - smoothstep(side * 0.5, side, ax)) * (1 - smoothstep(300, 420, b));
    h += 0.9 * fbm(x * 0.02, z * 0.02, 3, 4) * smoothstep(8, 24, b);
    h += smoothstep(side, side + 30 + b * 0.12, ax) * smoothstep(3, 28, b) * (24 + 18 * fbm(x * 0.008, z * 0.008, 3, 9));
    // low rolling hills beyond the far shore, below the eye (the tanks are on a hilltop)
    h += smoothstep(330, 520, b) * (14 + 16 * fbm(x * 0.004, b * 0.004, 4, 12));
    // blue mountains far beyond: ridges and peaks, hazy with distance
    const ridge = 1 - Math.abs(fbm(x * 0.0026 + 3, b * 0.0026, 4, 31));
    h += smoothstep(800, 1100, b) * (30 + 120 * ridge * ridge + 20 * fbm(x * 0.01, b * 0.01, 3, 33));
    // a soft rise of grass in front, like the edge of a lawn
    h += 0.02 * smoothstep(0.5, 1.4, z) * (0.6 + 0.4 * fbm(x * 2, z * 2, 2, 7));
    return h;
  };
}

export const STAGE = {
  id: 'meadow',
  ground: {
    kind: 'grass',
    base: 'grass-soil',
    dug: 'soil',
    baseTile: 0.55,
    dugTile: 0.32,
    farTile: 5,
    baseColor: 0x5f7f2c,
    baseTint: 0xe4f5c0,
    farTint: 0xbfe08a,
    coverColor: 0x2c5a1a,
    shore: { y: WATER_Y, width: 0.7, color: 0x9d9276 },
    patch: 'moss',
    patchTile: 0.45,
    patchTint: 0xd8ecb0,
    dugColor: 0x5b3d26,
    wetDark: 0.55,
  },
  layouts: LAYOUTS,
  heightFor,
  patchFor,
  far: 1400,
  wide: 1400,
  cover: woodsAt,
  grass: { density: 1.5, height: [0.016, 0.05], color: [0x3d6a1c, 0x9ccb48], dry: 0xc8c46a },
  // fallback light if the sky's own sun is not loaded
  sun: { dir: [0.45, 0.62, 0.64], color: 0xfff1dc, intensity: 3.2 },
  // the photographed sun, a little warmer and stronger, for crisp shadows
  sunBoost: 1.4,
  sunTint: 0xfff0dc,
  rim: 0.3,
  hemi: { sky: 0xbcd7ff, ground: 0x5a6b33, intensity: 0.5 },
  exposure: 1.35,
  // blue aerial haze on the far hills
  fog: { color: 0x6f9ad0, density: 0.0011 },
  // the play area sharp; the far scenery only a touch soft (haze shows the distance)
  lens: { base: 14, max: 1.5, band: 1.2 },
  // warm sunlight, crisp and saturated like the sample picture
  grade: { white: [1.2, 1.0, 0.86], saturation: 1.2, contrast: 0.4, vignette: 0.22 },
  // (the photo's own far hills sit higher than the 3D mountains: fade them out)
  backdrop: { haze: 0, saturation: 0.85, contrast: 0.05, gain: 1.8, horizon: 0.9, horizonTop: 0.2 },
  wind: [0.08, 0.45],
};

// The scenery around the lane.
export async function build({ app, quality, terrain, layout }) {
  const THREE = await import('three');
  const [{ Grass }, { WindFlag }, { Flowers }, rocksMod, { Trees, scatterTrees }, { Water }, { Motes }] = await Promise.all([
    import('../world/grass.js'),
    import('../world/flag.js'),
    import('../world/flowers.js'),
    import('../world/rocks.js'),
    import('../world/trees.js'),
    import('../world/water.js'),
    import('../world/motes.js'),
  ]);
  const group = new THREE.Group();
  const H = (x, z) => terrain.baseAt(x, z);
  const [t0, t1] = layout.tanks;
  const underTank = (x, z) => (Math.abs(x - t0) < 0.13 || Math.abs(x - t1) < 0.13) && Math.abs(z) < 0.1;

  // the lawn thins out over the moss on the knolls
  const moss = patchFor(layout);
  // (none at all on the knolls' moss, so the tanks stand up clear of it)
  const bare = (x, z) => {
    const m = moss(x, z);
    return m > 0.3 || Math.random() < m * 3;
  };
  const grass = new Grass({ terrain, quality, spec: STAGE.grass, keepOut: bare });
  group.add(grass.mesh);

  // mossy rocks breaking through the knolls, pebbles in the grass, a few
  // boulders down the hillside
  const rockList = [];
  layout.knolls.forEach(([kx, kh, kw], i) => {
    if (kh < 0.06) return;
    rockList.push(...rocksMod.knollRocks({ x: kx, top: H(kx, 0), width: kw, outward: Math.sign(kx) || 1, seed: 101 + i * 17, heightAt: H, count: 8 }));
  });
  rockList.push(...rocksMod.pebbles({ area: [-1.5, 1.5, 0.12, 0.95], count: Math.round(70 * quality.grass), seed: 7, heightAt: H, keepOut: underTank }));
  const R = rng(55);
  for (let i = 0; i < 8; i++) {
    // off to the sides, so the view down to the lake stays open
    const x = (R() < 0.5 ? -1 : 1) * (1.6 + R() * 3);
    const z = -1.2 - R() * 4;
    const s = 0.1 + R() * 0.22;
    rockList.push({ x, y: H(x, z) + s * 0.1, z, size: [s * 1.3, s * 0.7, s], yaw: R() * 6.28, tilt: R() * 0.3, seed: 900 + i, detail: 6 });
  }
  const rocks = await rocksMod.buildRocks({ rocks: rockList, look: { rock: 'rock', cap: 'moss', capAmount: 0.42, capSoft: 0.2, rockTint: 0xd8d4cc, capTint: 0xd6ffa0, rockTile: 2.2, capTile: 4 } });
  group.add(rocks.mesh);

  // taller tufts of grass round the foot of every rock
  const bigRocks = rockList.filter((r) => r.size[0] > 0.04);
  const nearRock = (x, z) => {
    for (const r of bigRocks) {
      const d = Math.hypot(x - r.x, z - r.z) / r.size[0];
      if (d > 0.7 && d < 1.5) return true;
    }
    return false;
  };
  const tufts = new Grass({ terrain, quality, seed: 19, spec: { ...STAGE.grass, density: 0.35, height: [0.045, 0.1], area: [-1.4, 1.4, -0.6, 0.9] }, keepOut: (x, z) => !nearRock(x, z) || underTank(x, z) || bare(x, z) });
  group.add(tufts.mesh);

  // clover round the knolls' feet, with a few white and pink clover heads
  const ring = (x, z) => {
    let k = 0;
    for (const [kx, kh, kw] of layout.knolls) {
      if (kh < 0.06) continue;
      const d = Math.hypot((x - kx) / kw, (z - 0.05) / (kw * 1.4));
      k += Math.exp(-((d - 1.05) * (d - 1.05)) / 0.08);
    }
    return k;
  };
  const clover = new Flowers({
    terrain,
    quality,
    seed: 23,
    spec: {
      count: 1300,
      area: [-1.3, 1.3, -0.4, 0.9],
      mix: [
        { kind: 'clover', colors: [0x4f8f2f, 0x5c9c35, 0x46852a], weight: 0.85, size: [0.006, 0.011], height: [0.008, 0.03] },
        { kind: 'cup', colors: [0xffffff, 0xffd6ea, 0xff9cc8], weight: 0.15, size: [0.006, 0.009], height: [0.03, 0.06] },
      ],
      density: (x, z) => Math.min(1, ring(x, z) * 1.2),
      keepOut: underTank,
    },
  });
  group.add(clover.group);

  const flowers = new Flowers({
    terrain,
    quality,
    spec: {
      count: 2400,
      area: [-2.3, 2.3, -1.1, 1.05],
      mix: [
        { kind: 'daisy', colors: [0xffffff, 0xfff8f0], weight: 0.3, size: [0.01, 0.016], height: [0.035, 0.09] },
        { kind: 'buttercup', colors: [0xffd11a, 0xffc300], weight: 0.3, size: [0.009, 0.014], height: [0.04, 0.1] },
        { kind: 'cup', colors: [0xff6fae, 0xff9cc8, 0xff5c8a], weight: 0.22, size: [0.01, 0.015], height: [0.035, 0.09] },
        { kind: 'star', colors: [0xa77bff, 0x8b8dff, 0xc38bff], weight: 0.18, size: [0.008, 0.012], height: [0.03, 0.08] },
      ],
      near: (x, z) => {
        let k = 0;
        for (const [kx, kh, kw] of layout.knolls) {
          if (kh < 0.06) continue;
          const d = Math.hypot((x - kx) / kw, (z - 0.05) / (kw * 1.4));
          k += Math.exp(-((d - 1.15) * (d - 1.15)) / 0.12) * 0.9;
        }
        return k;
      },
      keepOut: underTank,
    },
  });
  group.add(flowers.group);

  // trees: a couple near on the left, woods down the valley sides, forest
  // over the far hills (the far ones are simpler: they are only a few pixels)
  const woods = (x, z) => woodsAt(x, z, H(x, z));
  const near = scatterTrees({ count: 260, area: [-170, 170, -150, -40], heightAt: H, seed: 12, minGap: 4, size: [7, 13], density: woods });
  const trees = new Trees({ list: near, look: { kind: 'round', colors: [0x3f6a1e, 0x4f7a24, 0x345c1c, 0x648c30, 0x5b7a27] } });
  const farList = scatterTrees({ count: Math.round(5000 * Math.max(0.4, quality.grass)), area: [-650, 650, -800, -120], heightAt: H, seed: 13, minGap: 8, size: [10, 18], density: (x, z) => (Math.abs(x) < 120 - z * 0.9 ? woods(x, z) : 0) });
  // sink them a little: the far ground is coarser than its height function
  for (const t of farList) t.y -= 1.2;
  const farTrees = new Trees({ list: farList, look: { kind: 'round', far: true, variants: 2, seed: 9, colors: [0x365f1a, 0x466d20, 0x2e5118, 0x537a27] } });
  group.add(trees.group, farTrees.group);

  // the lake mirrors the far scenery: the hills, the woods and the sky
  const water = new Water({ y: WATER_Y, area: [-500, 500, -420, -9], color: 0x1d5a70, ripple: 0.8, reflect: quality.tier === 'low' ? null : { scale: quality.tier === 'high' ? 0.5 : 0.33, strength: 1 } });
  const { LAYER_REFLECT } = await import('../world/water.js');
  terrain.mesh.layers.enable(LAYER_REFLECT);
  for (const m of [...trees.meshes, ...farTrees.meshes]) m.layers.enable(LAYER_REFLECT);
  app.env?.backdrop?.layers.enable(LAYER_REFLECT);
  group.add(water.mesh);

  // dandelion fluff and pollen drifting on the wind, lit by the sun
  const motes = new Motes({ post: app.post, quality, spec: { count: 90, size: [0.002, 0.0045], color: 0xfff6e0, fluff: 1, calm: 0.03, windScale: 0.55 } });
  group.add(motes.mesh);

  const fx = (t0 + t1) / 2 + 0.12;
  const flag = new WindFlag({ x: fx, z: -0.26, y: terrain.heightAt(fx, -0.26) - 0.004 });
  group.add(flag.object);
  return {
    group,
    shapes: [],
    update(dt, time, app) {
      grass.update(dt, time, app.world, app.tanks);
      tufts.update(dt, time, app.world, app.tanks);
      clover.update(dt, time, app.world);
      flowers.update(dt, time, app.world);
      trees.update(dt, time, app.world);
      farTrees.update(dt, time, app.world);
      water.update(dt, time);
      motes.update(dt, time, app.world);
      flag.update(dt, time, app.world.wind);
    },
    shockwave(x, z, s) {
      grass.shockwave(x, z, s, app.time);
      tufts.shockwave(x, z, s, app.time);
    },
    dispose() {
      grass.dispose();
      tufts.dispose();
      clover.dispose();
      rocks.dispose();
      flowers.dispose();
      trees.dispose();
      farTrees.dispose();
      water.dispose();
      motes.dispose();
    },
  };
}
