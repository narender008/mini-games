// Snowy peaks at pink sunset: the tanks stand on snow-capped rocks in a
// powder-white field, little snowy pines around them like a model railway;
// behind the lane the slope falls away into a real-sized valley of dark
// pine forest, and ranges of snowy mountains rise beyond, pink where the
// low sun lights them and blue-lilac in their own shadow, with a light
// snowfall drifting in front.
import { fbm, rng, smoothstep } from '../config.js';

const LAYOUTS = [
  { tanks: [-0.43, 0.43], knolls: [[-0.45, 0.2, 0.29], [0.45, 0.17, 0.29]], dip: [0, 0.05] },
  { tanks: [-0.38, 0.52], knolls: [[-0.4, 0.16, 0.26], [0.54, 0.22, 0.31], [0.07, 0.04, 0.12]], dip: [-0.15, 0.04] },
  { tanks: [-0.52, 0.36], knolls: [[-0.54, 0.22, 0.31], [0.38, 0.15, 0.26], [-0.08, -0.03, 0.15]], dip: [0.05, 0.04] },
];

// distance from a knoll's middle in its own units (1 = the foot). It is a small plateau for the tank with a cliff
// in front, so the picture (which cuts just under the tank) shows a snow cap and the rock face right below it
function knollR(x, z, kx, kw) {
  const dx = (x - kx) / kw;
  const dz = (z - 0.03) / (kw * (z > 0.03 ? 0.6 : 0.85));
  return Math.sqrt(dx * dx + dz * dz) * (1 + 0.1 * fbm(x * 7 + kx * 3, z * 7, 3, 22));
}

// a plateau of snow over a rock, steep at its flanks, for the tank to stand on
function knoll(x, z, kx, kh, kw) {
  if (kh < 0) {
    const dx = (x - kx) / kw;
    const dz = (z - 0.04) / (kw * 0.95);
    return kh * Math.exp(-(dx * dx + dz * dz) * 1.4);
  }
  return kh * (1 - smoothstep(0.5, 1.0, knollR(x, z, kx, kw)));
}

// a massif: a rough pyramid of ridged rock, `radius` wide and `height` tall (metres), at (cx, cb)
function massif(x, b, cx, cb, radius, height) {
  const dx = x - cx;
  const db = b - cb;
  const d = Math.sqrt(dx * dx + db * db * 0.8) / radius;
  if (d >= 1) return 0;
  const ridge = 1 - Math.abs(fbm(x * 0.006 + cx, b * 0.006, 4, 41));
  const jag = 0.75 + 0.5 * (1 - Math.abs(fbm(x * 0.02, b * 0.02, 3, 43)));
  return height * Math.pow(1 - d, 1.35) * (0.7 + 0.6 * ridge * ridge) * jag;
}

// Valley floor and slopes behind the lane (b = metres behind it). Real scale.
// The angles are what matter: from the low camera the frame reaches about 14 degrees above
// the horizon, so a peak of 10 degrees fills most of the picture's height.
function farLand(x, b) {
  // the brow: the ground drops away right behind the lane, then eases down to the valley floor
  let h = -(9 * (1 - Math.exp(-Math.max(0, b - 0.5) / 28)) + 16 * smoothstep(60, 320, b));
  h += 0.7 * fbm(x * 0.05, b * 0.05, 3, 7) * smoothstep(5, 40, b) + 2.4 * fbm(x * 0.018, b * 0.02, 3, 17) * smoothstep(20, 90, b) * (1 - smoothstep(260, 400, b));
  // forested hills close in on both sides
  h += 26 * Math.exp(-Math.pow((x + 230) / 130, 2)) * smoothstep(50, 250, b) * (1 - smoothstep(560, 800, b)) * (0.7 + 0.5 * fbm(x * 0.01, b * 0.01, 3, 8))
    + 24 * Math.exp(-Math.pow((x - 260) / 150, 2)) * smoothstep(70, 300, b) * (1 - smoothstep(640, 900, b)) * (0.7 + 0.5 * fbm(x * 0.01 + 4, b * 0.01, 3, 9));
  // the ranges: a big peak each side, a saddle and lower ridges between
  h += massif(x, b, -470, 720, 520, 112);
  h += massif(x, b, 200, 880, 470, 132);
  h += massif(x, b, -60, 1600, 600, 70);
  h += massif(x, b, -1100, 1400, 700, 105);
  h += massif(x, b, 760, 1500, 620, 95);
  // lower ridges filling the middle distance, growing with distance
  const r = 1 - Math.abs(fbm(x * 0.0035 + 2, b * 0.0035, 4, 31));
  h += smoothstep(380, 900, b) * b * (0.008 + 0.03 * r * r) * (0.5 + 0.5 * smoothstep(0, 500, Math.abs(x)));
  return h;
}

// how wooded the ground is: the valley floor and the lower slopes (the terrain paints it as dark canopy from afar)
function woodsAt(x, z, y) {
  const b = -z;
  if (b < 20) return 0;
  const edge = smoothstep(20, 70, b);
  const band = smoothstep(-24, -12, y) * (1 - smoothstep(22, 62, y));
  return edge * band * smoothstep(-0.25, 0.2, fbm(x * 0.012, z * 0.012, 3, 3));
}

// bare rock: the flanks of each knoll under the snow cap the tank stands on
function patchFor(layout) {
  const { knolls } = layout;
  return (x, z) => {
    let m = 0;
    for (const [kx, kh, kw] of knolls) {
      if (kh < 0.06) continue;
      const r = knollR(x, z, kx, kw);
      const ring = smoothstep(0.46, 0.56, r) * (1 - smoothstep(1.02, 1.22, r));
      m = Math.max(m, ring * (0.7 + 0.45 * fbm(x * 9 + kx, z * 9, 3, 44)));
    }
    return Math.min(1, m);
  };
}

function heightFor(layout) {
  const { knolls, dip } = layout;
  return (x, z) => {
    const b = -z;
    const near = 1 - smoothstep(3, 10, b);
    let h = 0;
    if (near > 0) {
      // soft drifts, faint wind-packed ripples, a little crust; calmer along the lane
      const lane = 0.3 + 0.7 * smoothstep(0.06, 0.45, Math.abs(z - 0.03));
      const fore = 1 + 0.8 * smoothstep(0.2, 1.2, z);
      let d = 0.014 * fbm(x * 1.6, z * 1.6, 4, 21) + 0.004 * fbm(x * 8, z * 8, 2, 25);
      const drift = Math.max(0, fbm(x * 2.6 + 3, z * 2.6, 3, 5));
      d += 0.035 * drift * drift;
      d += 0.0022 * smoothstep(-0.1, 0.3, fbm(x * 1.1 + 9, z * 1.1, 2, 9)) * Math.sin((x * 0.8 + z * 0.6) * 55 + 3 * fbm(x * 1.2, z * 1.2, 2, 9));
      h += d * lane * fore * near;
      // the snow banks up in front
      h += 0.03 * smoothstep(0.3, 1.3, z) * (0.6 + 0.4 * fbm(x * 1.5, z * 1.5, 2, 5));
    }
    for (const [kx, kh, kw] of knolls) h += knoll(x, z, kx, kh, kw);
    h -= dip[1] * Math.exp(-((x - dip[0]) * (x - dip[0])) / 0.18 - (z * z) / 0.3);
    if (b > 0.5) h += farLand(x, b);
    return h;
  };
}

export const STAGE = {
  id: 'snow',
  ground: {
    kind: 'snow',
    base: 'snow',
    dug: 'snow',
    baseTile: 0.6,
    dugTile: 0.28,
    farTile: 9,
    baseColor: 0xe8eaff,
    baseTint: 0xffffff,
    farTint: 0xf4f0ff,
    dugTint: 0xc3d0f2,
    dugColor: 0xb8c4e6,
    coverColor: 0x27493c,
    farRock: 0x6f6068,
    patch: 'rock',
    patchTile: 0.3,
    patchTint: 0xf6f2f4,
    wetDark: 0.85,
    normalScale: 1.15,
  },
  layouts: LAYOUTS,
  heightFor,
  patchFor,
  far: 1600,
  wide: 1600,
  cover: woodsAt,
  grass: null,
  sun: { dir: [-0.96, 0.21, 0.18], color: 0xff9e60, intensity: 8 },
  // bright and crisp: a strong pink low sun, shadows filled with blue, hardly any haze near (the mountains carry it)
  hemi: { sky: 0xb4ccff, ground: 0xe8ecff, intensity: 6.7 },
  envIntensity: 0.65,
  exposure: 2.2,
  sunBoost: 2.44,
  rim: 0.3,
  // blue-lilac aerial haze, thin: near and mid ground stay crisp, the ranges layer up into the sky
  fog: { color: 0xc4b8f6, density: 0.0005 },
  lens: { base: 14, max: 1.5, band: 1.2 },
  grade: { white: [1.0, 1.06, 1.06], saturation: 1.3, contrast: 0.4, power: 1.35, lookSaturation: 1.45, shadowTint: [-0.015, 0, 0.04], highTint: [0.014, 0, 0], vignette: 0.2 },
  backdrop: { haze: 0.3, hazeColor: 0xf4b080, saturation: 1.3, contrast: 0.1, gain: 1.4, horizon: 0.9, horizonTop: 0.42 },
  wind: [0.05, 0.4],
};

// toy pines round the tanks: [x, z, height] relative to the layout's tank positions
function heroPines(layout) {
  const [t0, t1] = layout.tanks;
  const m = (t0 + t1) / 2;
  return [
    { x: t0 - 0.5, z: -0.3, h: 0.44 },
    { x: t0 - 0.76, z: -0.5, h: 0.32 },
    { x: m - 0.34, z: -1.0, h: 0.5 },
    { x: m + 0.4, z: -1.25, h: 0.3 },
    { x: t1 + 0.52, z: -0.34, h: 0.52 },
    { x: t1 + 0.76, z: -0.56, h: 0.34 },
    { x: t0 - 0.55, z: 0.58, h: 0.15, wide: 1.2 },
    { x: t1 + 0.6, z: 0.6, h: 0.17, wide: 1.2 },
    { x: t1 + 0.86, z: 0.35, h: 0.13, wide: 1.1 },
  ];
}

// The scenery around the lane.
export async function build({ app, quality, terrain, layout, softUniforms }) {
  const THREE = await import('three');
  const [{ WindFlag }, rocksMod, { Trees, scatterTrees }, { Snowfall }, { FarLand }, { tuneSun }] = await Promise.all([
    import('../world/flag.js'),
    import('../world/rocks.js'),
    import('../world/trees.js'),
    import('../world/snowfall.js'),
    import('../world/farland.js'),
    import('../world/light.js'),
  ]);
  // a rosier sun than the photographed one: lit snow goes pink, not peach (linear colour)
  tuneSun(app, { color: new THREE.Color().setRGB(1, 0.66, 0.62) });
  const group = new THREE.Group();
  const H = (x, z) => terrain.baseAt(x, z);
  const [t0, t1] = layout.tanks;
  const R = rng(77);

  // the far landscape: from 300 m out the terrain gives way to a finer mesh, so the ridges stay sharp
  const far = new FarLand({
    height: farLand,
    cover: (x, b, y) => woodsAt(x, -b, y),
    from: 260,
    columns: quality.tier === 'low' ? 900 : 1500,
    look: { top: 0xffdde8, rock: 0x7a6e7c, rock2: 0xa8969a, forest: 0x2a4a44, line: [0, 1, 0.26, 0.2], detail: [1, 1] },
  });
  FarLand.trimTerrain(terrain, 300);
  group.add(far.mesh);

  // snow-capped rocks under the tanks and boulders scattered on the slope
  const rockList = [];
  layout.knolls.forEach(([kx, kh, kw], i) => {
    if (kh < 0.06) return;
    const out = Math.sign(kx) || 1;
    const top = H(kx, 0);
    // (the ones that would stand in front of the tank, up at its level, are left out)
    rockList.push(...rocksMod.knollRocks({ x: kx, top, width: kw * 1.12, outward: out, seed: 201 + i * 19, heightAt: H, count: 10 })
      .filter((r) => !(r.z > 0.02 && Math.abs(r.x - kx) < 0.3 && r.y + r.size[1] * 0.5 > top - 0.075)));
    // a big boulder at the outer foot of each knoll (never in front of the tank)
    const bx = kx + out * kw * 0.8;
    const bz = 0.2 + kw * 0.2;
    rockList.push({ x: bx, y: H(bx, bz) + 0.03, z: bz, size: [kw * 0.52, kh * 0.5, kw * 0.42], yaw: R() * 6, tilt: 0.1, seed: 501 + i, detail: 9 });
  });
  for (let i = 0; i < 12; i++) {
    const x = (R() < 0.5 ? -1 : 1) * (1.4 + R() * 4);
    const z = -0.8 - R() * 6;
    const s = 0.08 + R() * 0.3;
    rockList.push({ x, y: H(x, z) + s * 0.12, z, size: [s * 1.3, s * 0.7, s], yaw: R() * 6.28, tilt: R() * 0.3, seed: 900 + i, detail: 7 });
  }
  rockList.push(...rocksMod.pebbles({ area: [-1.6, 1.6, 0.1, 0.9], count: Math.round(28 * quality.grass), seed: 8, heightAt: H, size: [0.006, 0.02], keepOut: (x, z) => (Math.abs(x - t0) < 0.14 || Math.abs(x - t1) < 0.14) && Math.abs(z) < 0.12 }));
  const rocks = await rocksMod.buildRocks({ rocks: rockList, look: { rock: 'rock', cap: 'snow', capAmount: 0.7, capSoft: 0.22, rockTint: 0xe0d6d4, capTint: 0xf6f3ff, rockTile: 2, capTile: 3 } });
  group.add(rocks.mesh);

  // toy-sized pines near the lane (they cast shadows on the snow), and a
  // straggle of small ones down the slope
  const toy = heroPines(layout).map((p) => ({ ...p, y: H(p.x, p.z) }));
  const slope = scatterTrees({
    count: Math.round(70 * Math.max(0.5, quality.grass)),
    area: [-5, 5, -8, -0.5],
    heightAt: H,
    seed: 23,
    minGap: 0.3,
    size: [0.1, 0.42],
    density: (x, z) => smoothstep(0.7, 1.6, Math.abs(x)) * smoothstep(-0.3, 0.3, fbm(x * 0.5, z * 0.5, 3, 12)) * (1 - 0.6 * smoothstep(3, 8, -z)),
  });
  const toyTrees = new Trees({ list: [...toy, ...slope], quality, look: { kind: 'pine', variants: 3, seed: 6, snow: 0.95, shadow: true, leafScale: 6, colors: [0x1a3a2e, 0x224634, 0x1a382c, 0x284c3c], trunk: 0x4a3a2c } });
  group.add(toyTrees.group);

  // real-sized forest down the valley and up the hillsides; the far trees
  // are a few pixels each, so they are simpler
  const woods = (x, z) => woodsAt(x, z, H(x, z));
  const nearList = scatterTrees({ count: 240, area: [-170, 170, -165, -24], heightAt: H, seed: 12, minGap: 5, size: [8, 16], density: woods });
  const nearTrees = new Trees({ list: nearList, quality, look: { kind: 'pine', variants: 3, seed: 8, snow: 0.6, colors: [0x152f26, 0x1d3d31, 0x142b23, 0x21443a] } });
  const farList = scatterTrees({ count: Math.round(4500 * Math.max(0.4, quality.grass)), area: [-900, 900, -1100, -165], heightAt: H, seed: 13, minGap: 9, size: [12, 22], density: woods });
  for (const t of farList) t.y -= 1;
  const farTrees = new Trees({ list: farList, quality, look: { kind: 'pine', far: true, variants: 2, seed: 9, snow: 0.5, colors: [0x1a382e, 0x234136, 0x18332a] } });
  group.add(nearTrees.group, farTrees.group);

  // the snowfall
  const snowfall = new Snowfall({ softUniforms, lens: app.post.lens.cocU, quality, count: 900 });
  group.add(snowfall.group);

  // the wind flag: a red pennant on a stick, planted in the snow by the lane
  const fx = (t0 + t1) / 2 + 0.16;
  const flag = new WindFlag({ x: fx, z: -0.28, y: terrain.heightAt(fx, -0.28) - 0.004 });
  group.add(flag.object);

  return {
    group,
    shapes: [],
    update(dt, time, app) {
      toyTrees.update(dt, time, app.world);
      nearTrees.update(dt, time, app.world);
      farTrees.update(dt, time, app.world);
      snowfall.update(dt, time, app);
      flag.update(dt, time, app.world.wind);
    },
    shockwave() {},
    dispose() {
      far.dispose();
      rocks.dispose();
      toyTrees.dispose();
      nearTrees.dispose();
      farTrees.dispose();
      snowfall.dispose();
    },
  };
}
