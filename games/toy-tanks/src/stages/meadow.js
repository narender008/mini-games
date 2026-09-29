// Meadow: a sunny hillside above a lake. The tanks sit on mossy knolls with
// rocks breaking through their fronts and wild flowers at their feet; behind
// the lane the lawn falls away to the water, with wooded hills on either
// side of the valley and mountains beyond.
import { fbm, rng, smoothstep } from '../config.js';

// Layouts: where the two tanks start (x), and the knolls under them
// (x, height, width); a negative height is a hollow. Several, so every game
// looks a little different.
const LAYOUTS = [
  { tanks: [-0.5, 0.5], knolls: [[-0.52, 0.16, 0.27], [0.52, 0.14, 0.28]], dip: [0, 0.05] },
  { tanks: [-0.44, 0.6], knolls: [[-0.46, 0.13, 0.25], [0.62, 0.18, 0.29], [0.08, 0.035, 0.12]], dip: [-0.18, 0.04] },
  { tanks: [-0.6, 0.42], knolls: [[-0.62, 0.19, 0.3], [0.44, 0.12, 0.25], [-0.1, -0.03, 0.16]], dip: [0.06, 0.04] },
];

const WATER_Y = -3.2;

// how wooded the ground is: forest patches up the hillsides, none by the
// water (the terrain paints it as canopy from afar; trees stand in it)
function woodsAt(x, z, y) {
  if (y < WATER_Y + 0.6) return 0;
  const up = smoothstep(WATER_Y + 1, WATER_Y + 14, y);
  return up * smoothstep(-0.2, 0.2, fbm(x * 0.011, z * 0.011, 3, 3));
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
    h -= 3.6 * smoothstep(0.8, 38, b);
    // wooded hills close in from both sides, so the lake lies in a V
    const side = 7 + b * 0.14 + 6 * fbm(z * 0.01, x * 0.01, 2, 8);
    h -= 1.6 * smoothstep(30, 50, b) * (1 - smoothstep(side * 0.5, side, ax)) * (1 - smoothstep(300, 420, b));
    h += 0.9 * fbm(x * 0.02, z * 0.02, 3, 4) * smoothstep(8, 24, b);
    h += smoothstep(side, side + 30 + b * 0.12, ax) * smoothstep(3, 28, b) * (24 + 18 * fbm(x * 0.008, z * 0.008, 3, 9));
    h += smoothstep(330, 520, b) * (40 + 30 * fbm(x * 0.004, b * 0.004, 4, 12));
    // blue mountains far beyond: ridges and peaks, hazy with distance
    const ridge = 1 - Math.abs(fbm(x * 0.0026 + 3, b * 0.0026, 4, 31));
    h += smoothstep(700, 950, b) * (25 + 85 * ridge * ridge + 18 * fbm(x * 0.01, b * 0.01, 3, 33));
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
    dugColor: 0x5b3d26,
    wetDark: 0.55,
  },
  layouts: LAYOUTS,
  heightFor,
  far: 1400,
  wide: 1400,
  cover: woodsAt,
  grass: { density: 1.5, height: [0.016, 0.05], color: [0x3d6a1c, 0x9ccb48], dry: 0xc8c46a },
  // fallback light if the sky's own sun is not loaded
  sun: { dir: [0.45, 0.62, 0.64], color: 0xfff1dc, intensity: 3.2 },
  hemi: { sky: 0xbcd7ff, ground: 0x5a6b33, intensity: 0.5 },
  exposure: 1.35,
  // blue aerial haze on the far hills
  fog: { color: 0x9fc2e6, density: 0.0006 },
  lens: { base: 22, max: 10, band: 1.2 },
  // warm sunlight, crisp and saturated like the sample picture
  grade: { white: [1.13, 1.0, 0.9], saturation: 1.2, contrast: 0.28, vignette: 0.22 },
  backdrop: { haze: 0.12, saturation: 1.2, contrast: 0.1, horizon: 0.9 },
  wind: [0.08, 0.45],
};

// The scenery around the lane.
export async function build({ app, quality, terrain, layout }) {
  const THREE = await import('three');
  const [{ Grass }, { WindFlag }, { Flowers }, rocksMod, { Trees, scatterTrees }, { Water }] = await Promise.all([
    import('../world/grass.js'),
    import('../world/flag.js'),
    import('../world/flowers.js'),
    import('../world/rocks.js'),
    import('../world/trees.js'),
    import('../world/water.js'),
  ]);
  const group = new THREE.Group();
  const H = (x, z) => terrain.baseAt(x, z);
  const [t0, t1] = layout.tanks;
  const underTank = (x, z) => (Math.abs(x - t0) < 0.13 || Math.abs(x - t1) < 0.13) && Math.abs(z) < 0.1;

  const grass = new Grass({ terrain, quality, spec: STAGE.grass });
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
  const rocks = await rocksMod.buildRocks({ rocks: rockList, look: { rock: 'rock', cap: 'moss', capAmount: 0.62, capSoft: 0.2, rockTint: 0xd8d4cc, capTint: 0xd6ffa0, rockTile: 2.2, capTile: 4 } });
  group.add(rocks.mesh);

  const flowers = new Flowers({
    terrain,
    quality,
    spec: {
      count: 1500,
      area: [-2.3, 2.3, -1.1, 1.05],
      mix: [
        { kind: 'daisy', colors: [0xffffff, 0xfff8f0], weight: 0.3, size: [0.008, 0.012], height: [0.03, 0.07] },
        { kind: 'buttercup', colors: [0xffd11a, 0xffc300], weight: 0.3, size: [0.006, 0.01], height: [0.035, 0.08] },
        { kind: 'cup', colors: [0xff6fae, 0xff9cc8, 0xff5c8a], weight: 0.22, size: [0.007, 0.011], height: [0.03, 0.07] },
        { kind: 'star', colors: [0xa77bff, 0x8b8dff, 0xc38bff], weight: 0.18, size: [0.005, 0.009], height: [0.025, 0.06] },
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
  const trees = new Trees({ list: near, look: { kind: 'round', colors: [0x4a7a24, 0x5d8f2a, 0x3d6a22, 0x76a33a, 0x6b8f2e] } });
  const farList = scatterTrees({ count: Math.round(5000 * Math.max(0.4, quality.grass)), area: [-650, 650, -800, -120], heightAt: H, seed: 13, minGap: 8, size: [10, 18], density: (x, z) => (Math.abs(x) < 120 - z * 0.9 ? woods(x, z) : 0) });
  // sink them a little: the far ground is coarser than its height function
  for (const t of farList) t.y -= 1.2;
  const farTrees = new Trees({ list: farList, look: { kind: 'round', far: true, variants: 2, seed: 9, colors: [0x40701f, 0x527f26, 0x365f1d, 0x62902e] } });
  group.add(trees.group, farTrees.group);

  const water = new Water({ y: WATER_Y, area: [-500, 500, -420, -9], color: 0x1d5a70, ripple: 0.8 });
  group.add(water.mesh);

  const fx = (t0 + t1) / 2 + 0.12;
  const flag = new WindFlag({ x: fx, z: -0.26, y: terrain.heightAt(fx, -0.26) - 0.004 });
  group.add(flag.object);
  return {
    group,
    shapes: [],
    update(dt, time, app) {
      grass.update(dt, time, app.world, app.tanks);
      flowers.update(dt, time, app.world);
      trees.update(dt, time, app.world);
      farTrees.update(dt, time, app.world);
      water.update(dt, time);
      flag.update(dt, time, app.world.wind);
    },
    shockwave(x, z, s) {
      grass.shockwave(x, z, s, app.time);
    },
    dispose() {
      grass.dispose();
      rocks.dispose();
      flowers.dispose();
      trees.dispose();
      farTrees.dispose();
      water.dispose();
    },
  };
}
