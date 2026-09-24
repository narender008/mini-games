// Tomato: flat fuzzy seeds, a hooked seedling with two narrow seed leaves,
// then a fuzzy main stem tied to a bamboo cane that climbs node by node,
// each node unfolding a compound leaf of toothed, crinkled leaflets. Trusses
// of small yellow star flowers open between the leaves, set glossy green
// fruit that swells and ripens through orange to red, the lowest truss
// first. Harvest picks the ripest truss; the plant flowers again.
import * as THREE from 'three';
import { smooth, lerp, clamp, mulberry32 } from '../../config.js';
import { SeedBed } from './soil.js';
import { TubeSet, leafGrid, mergeGeometries, setPlantAttr, makeRelative, colorize, still, withUV } from './geom.js';
import { paintLeaf, pixels, once, hex } from './tex.js';
import { normalMapFromHeight, fbm, noise2 } from '../../shared.js';
import { vegLeaf, vegStem, rigidSway } from './mats.js';
import { petalMaterial } from '../materials.js';
import { buildLeaf } from './leaf.js';
import { Wobble, hookCurve, shareGeometry, disposeShared, toWorld, grow } from './kit.js';

const STEM_UV = [0.005, 0.02, 0.07, 0.98];
const LEAF_UV = [0.09, 0, 1, 1];
const STAKE = new THREE.Vector3(0.05, 0, -0.028);
const NODES = 9;
const NODE0 = 0.07; // arc length of the first true leaf above the base
const NODE_STEP = 0.068;
const TRUSS_AT = [0.25, 0.37, 0.49];
const FRUIT_R = 0.019;
const BASE = new THREE.Vector3(0, -0.012, 0);
const TIES = [0.2, 0.4, 0.58];

// ------------------------------------------------------------ textures

function leafTextures() {
  return paintLeaf('tomato-leaf', {
    w: 256,
    h: 256,
    stemStrip: true,
    outline: (t) => {
      const body = t < 0.42 ? Math.pow(Math.sin(((t / 0.42) * Math.PI) / 2), 0.7) : Math.pow(Math.cos((((t - 0.42) / 0.58) * Math.PI) / 2), 0.8);
      // a lobe or two near the base, like real tomato leaflets
      const lobe = 0.12 * Math.max(0, Math.sin((t - 0.12) * 18)) * (t < 0.35 ? 1 : 0);
      return Math.min(1, body * 0.92 + lobe);
    },
    teeth: 8,
    toothDepth: 0.2,
    toothFrom: 0.25,
    veins: 7,
    veinAngle: 0.42,
    veinSharp: 60,
    veinTone: 0.4,
    pleat: 0.7,
    hair: 0.35,
    base: '#46782c',
    dark: '#2e561c',
    light: '#6b9b45',
    vein: '#7eab58',
    stem: '#5e8a3a',
    seed: 7,
  });
}

// Tomato skin, near white (the instance colour ripens it): faint mottling,
// paler shoulders, a tiny scar at the blossom end. v 0 = stem end.
function fruitTextures() {
  return once('tomato-fruit', () => {
    const map = pixels(
      128,
      128,
      (u, v, o) => {
        const n = fbm(u * 8, v * 6, 3);
        let k = 0.88 + 0.12 * n;
        k += Math.max(0, 0.3 - v) * 0.25; // lighter round the shoulders
        const tip = Math.max(0, (v - 0.965) / 0.035);
        const r = Math.min(1, k) * (1 - tip * 0.5);
        const gg = Math.min(1, k) * (1 - tip * 0.6);
        const b = Math.min(1, k) * (1 - tip * 0.65);
        o[0] = r * 255;
        o[1] = gg * 255;
        o[2] = b * 255;
      },
      { srgb: true },
    );
    map.wrapT = THREE.ClampToEdgeWrapping;
    const normalMap = normalMapFromHeight(128, 128, (u, v) => noise2(u * 60, v * 40) * 0.25 + fbm(u * 12, v * 9, 2) * 0.3, 1.2);
    return { map, normalMap };
  });
}

function caneTexture() {
  return once('tomato-cane', () => {
    const map = pixels(
      32,
      256,
      (u, v, o) => {
        const streak = fbm(u * 30, v * 3, 3);
        let k = 0.8 + 0.25 * streak;
        const y = v * 1.0; // metres along the 1 m cane
        const node = Math.abs(((y + 0.07) % 0.26) - 0.13);
        if (node < 0.004) k *= 0.62;
        else if (node < 0.009) k *= 1.08;
        o[0] = Math.min(255, 205 * k);
        o[1] = Math.min(255, 172 * k);
        o[2] = Math.min(255, 112 * k);
      },
      { srgb: true },
    );
    return map;
  });
}

// ------------------------------------------------------------ geometry

function leafGeometry() {
  return once('tomato-leaf-geo', () => {
    const lf = (s, side, size, extra = {}) => ({
      s,
      side,
      size,
      width: size * 0.72,
      uv: LEAF_UV,
      grid: [3, 4],
      phi: [0.15, 1.15],
      crease: [1.2, 0.3],
      droop: [-0.05, 0.22],
      cup: [0, -0.1],
      psi: [0, 0.25],
      stalk: [0.001, 0.006],
      foldScale: 0.65,
      foldWidth: 0.55,
      ...extra,
    });
    return buildLeaf({
      flexLen: 0.32,
      spine: {
        length: 0.25,
        folded: 0.55,
        seg: 12,
        arch: (s, open) => lerp(0.05 + 0.2 * s, 0.1 + 1.3 * s * s, open),
        radius: (s) => lerp(0.0019, 0.0008, s),
        uv: STEM_UV,
        thick: 0.5,
      },
      leaflets: [
        lf(1, 0, 0.075, { stalk: [0.002, 0.012], phi: [0, 0] }),
        lf(0.8, -1, 0.068),
        lf(0.82, 1, 0.068),
        lf(0.55, -1, 0.062),
        lf(0.58, 1, 0.064),
        lf(0.3, -1, 0.052),
        lf(0.33, 1, 0.05),
        // small leaflets between the big ones
        lf(0.68, -1, 0.017, { stalk: [0, 0.001], phi: [0.2, 1.3] }),
        lf(0.45, 1, 0.016, { stalk: [0, 0.001], phi: [0.2, 1.3] }),
        lf(0.17, -1, 0.02, { stalk: [0, 0.001], phi: [0.2, 1.3] }),
      ],
    });
  });
}

// Two narrow seed leaves: pressed together in the hook, then a flat V.
function cotyledonGeometry() {
  return once('tomato-coty-geo', () => {
    const L = 0.024;
    const blade = (side) => (open) => (u, v, o) => {
      const hw = 0.0031 * Math.pow(Math.sin(Math.PI * clamp(v * 0.95 + 0.05, 0, 1)), 0.7);
      const a = lerp(0.05, 1.15, open) + v * v * lerp(0.05, 0.35, open);
      const along = v * L * lerp(0.7, 1, open);
      const x = (u - 0.5) * 2 * hw;
      o.set(side * Math.sin(a) * along, Math.cos(a) * along, x + Math.abs(x) * 0.2 * side * 0);
    };
    const uv = [0.45, 0.3, 0.62, 0.7];
    const parts = [-1, 1].map((side) => leafGrid(2, 6, blade(side)(0), blade(side)(1), uv));
    for (const g of parts) setPlantAttr(g, () => [0.02, 0]);
    return makeRelative(mergeGeometries(parts));
  });
}

// A nodding yellow star: six narrow petals (closed in the bud, swept back
// when open) round a cone of anthers; vertex coloured.
function flowerGeometry() {
  return once('tomato-flower-geo', () => {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const petal = (open) => (u, v, o) => {
        const L = 0.0095;
        const hw = 0.0019 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1)), 0.8) * (1 - v * 0.35);
        const x = (u - 0.5) * 2 * hw;
        const tilt = lerp(0.12, 1.85, open) + v * lerp(0.05, 0.35, open);
        const r = 0.0018 + Math.sin(tilt) * v * L;
        const y = 0.001 + Math.cos(tilt) * v * L;
        o.set(ca * r - sa * x, y, sa * r + ca * x);
      };
      parts.push(colorize(leafGrid(2, 4, petal(0), petal(1)), () => [0.88, 0.52, 0.015]));
    }
    const cone = new THREE.ConeGeometry(0.0021, 0.0075, 8, 1, true);
    cone.translate(0, 0.0045, 0);
    parts.push(colorize(still(cone), (x, y) => (y > 0.007 ? [0.4, 0.3, 0.02] : [0.85, 0.5, 0.02])));
    for (const g of parts) setPlantAttr(g, () => [0, 0]);
    const geo = makeRelative(mergeGeometries(parts.map(withUV)));
    geo.computeBoundingSphere();
    return geo;
  });
}

// Six slim sepals: a closed bud (base), an open star (1) and the star
// curled back on the fruit (influence 1.3).
function calyxGeometry() {
  return once('tomato-calyx-geo', () => {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const L = 0.011;
      const sepal = (open) => (u, v, o) => {
        const hw = 0.0014 * Math.pow(1 - v, 0.8) * Math.min(1, v * 5 + 0.4);
        const x = (u - 0.5) * 2 * hw;
        const tilt = lerp(0.18, 1.5, open) + v * lerp(0.1, 0.5, open);
        const r = 0.0018 + Math.sin(tilt) * v * L;
        const y = -0.0008 + Math.cos(tilt) * v * L;
        o.set(ca * r - sa * x, y, sa * r + ca * x);
      };
      parts.push(leafGrid(1, 4, sepal(0), sepal(1)));
    }
    // the short green stalk stub on top of the fruit
    for (const g of parts) setPlantAttr(g, () => [0, 0.4]);
    return makeRelative(mergeGeometries(parts));
  });
}

// A round tomato, a little flattened, with soft lobes at the shoulders.
// The stem end is at the origin; the fruit hangs along +y.
function fruitGeometry() {
  return once('tomato-fruit-geo', () => {
    const g = new THREE.SphereGeometry(FRUIT_R, 22, 16);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      const a = Math.atan2(z, x);
      const top = Math.max(0, -y / FRUIT_R); // 1 at the stem end
      const lobe = 1 + 0.045 * Math.cos(a * 5) * Math.pow(top, 0.6) * (1 - top * 0.6);
      x *= lobe;
      z *= lobe;
      y *= 0.84;
      // the dimple where the stalk joins
      const r = Math.hypot(x, z) / FRUIT_R;
      if (y < 0) y += 0.0035 * Math.exp(-r * r * 9);
      p.setXYZ(i, x, y + FRUIT_R * 0.84, z);
    }
    g.computeVertexNormals();
    return g;
  });
}

function seedGeometry() {
  return once('tomato-seed', () => {
    const rnd = mulberry32(5);
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.SphereGeometry(1, 8, 5);
      g.scale(0.0018, 0.00045, 0.0015);
      g.rotateY(rnd() * 6);
      g.translate((rnd() - 0.5) * 0.009, 0.0006, (rnd() - 0.5) * 0.009);
      parts.push(g.toNonIndexed());
    }
    const geo = mergeGeometries(parts);
    geo.computeVertexNormals();
    return { geo, mat: new THREE.MeshStandardMaterial({ color: '#c7b183', roughness: 0.95 }) };
  });
}

function caneParts() {
  return once('tomato-cane-geo', () => {
    const cane = new THREE.CylinderGeometry(0.005, 0.0058, 0.84, 10, 1);
    cane.translate(0, 0.39, 0);
    const mat = new THREE.MeshStandardMaterial({ map: caneTexture(), roughness: 0.55 });
    const tie = new THREE.TorusGeometry(1, 0.08, 5, 16);
    tie.rotateX(Math.PI / 2);
    const tieMat = new THREE.MeshStandardMaterial({ color: '#a88e62', roughness: 0.95 });
    return { cane, mat, tie, tieMat };
  });
}

// ------------------------------------------------------------ materials

function materials() {
  return once('tomato-mats', () => {
    const lt = leafTextures();
    const leaf = vegLeaf('tomato', { map: lt.map, normalMap: lt.normalMap, normalScale: 1, alphaTest: 0.5, translucency: 0.5, roughness: 0.62 });
    const stem = vegStem('tomato-stem', { color: '#5f8c3c', roughness: 0.75 });
    const sepal = vegLeaf('tomato-sepal', { color: '#4f8430', translucency: 0.45, roughness: 0.6 });
    const flower = petalMaterial({ color: '#ffffff', vertexColors: true, translucency: 0.8, roughness: 0.5 });
    const prev = flower.onBeforeCompile;
    flower.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace('attribute vec2 aPlant;', 'attribute vec2 aPlant;\nattribute vec2 aVegFlex;')
        .replace('windSway(wp, aPlant.x)', 'windSway(wp, aPlant.x * (1.0 + aVegFlex.x) + aVegFlex.y)');
    };
    const fk = flower.customProgramCacheKey();
    flower.customProgramCacheKey = () => `${fk}-vegflex`;
    const ft = fruitTextures();
    const fruit = new THREE.MeshPhysicalMaterial({ map: ft.map, normalMap: ft.normalMap, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 0.8 });
    fruit.userData.kind = 'tomato';
    rigidSway(fruit);
    return { leaf, stem, sepal, flower, fruit };
  });
}

// ripening colours
const RIPE = [
  [0, '#4f8a26'],
  [0.3, '#8fb04a'],
  [0.48, '#cdb248'],
  [0.64, '#e8862c'],
  [0.82, '#e0421e'],
  [1, '#c9200f'],
].map(([k, c]) => [k, new THREE.Color(c)]);
function ripeColor(k, out) {
  for (let i = 1; i < RIPE.length; i++) {
    if (k <= RIPE[i][0]) return out.copy(RIPE[i - 1][1]).lerp(RIPE[i][1], (k - RIPE[i - 1][0]) / (RIPE[i][0] - RIPE[i - 1][0]));
  }
  return out.copy(RIPE[RIPE.length - 1][1]);
}

// ------------------------------------------------------------ the plant

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const stemFlex = (m) => 0.09 * (m / 0.4) * (m / 0.4);
const hypoLen = (g) => lerp(0.012, 0.05, smooth(0.08, 0.3, g));
const stemLen = (g) => hypoLen(g) + 0.64 * Math.pow(smooth(0.26, 0.97, g), 1.15);

export function createTomato({ seed = 1, quality } = {}) {
  const rng = mulberry32(seed);
  const shadows = quality?.shadows !== false;
  const FPT = quality?.tier === 'low' ? 4 : 5;
  const NT = TRUSS_AT.length;
  const mats = materials();

  const object = new THREE.Group();
  object.name = 'tomato';
  const bed = new SeedBed({ seed, radius: 0.028, height: 0.006, shadows });
  object.add(bed.object);
  const seeds = seedGeometry();
  const seedMesh = new THREE.Mesh(seeds.geo, seeds.mat);
  object.add(seedMesh);

  // the cane, with soft jute ties
  const cp = caneParts();
  const cane = new THREE.Mesh(cp.cane, cp.mat);
  cane.position.copy(STAKE);
  cane.rotation.set((rng() - 0.5) * 0.04, rng() * 6, (rng() - 0.5) * 0.04);
  cane.castShadow = shadows;
  cane.receiveShadow = true;
  object.add(cane);
  const ties = new THREE.InstancedMesh(cp.tie, cp.tieMat, TIES.length);
  ties.castShadow = shadows;
  object.add(ties);

  const aerial = new THREE.Group();
  object.add(aerial);

  // stems: main stem, then per truss a peduncle and its pedicels
  const defs = [{ segs: 44, radial: 7, thick: 0.7 }];
  for (let j = 0; j < NT; j++) {
    defs.push({ segs: 8, radial: 4, thick: 0.6 });
    for (let f = 0; f < FPT; f++) defs.push({ segs: 3, radial: 3, thick: 0.6 });
  }
  const stems = new TubeSet(defs);
  const stemMesh = new THREE.Mesh(stems.geometry, mats.stem);
  stemMesh.castShadow = shadows;
  stemMesh.receiveShadow = true;
  stemMesh.frustumCulled = false;
  aerial.add(stemMesh);

  const coty = new THREE.Mesh(cotyledonGeometry(), mats.leaf);
  coty.castShadow = shadows;
  coty.morphTargetInfluences = [0];
  aerial.add(coty);

  const inst = (geo, mat, count) => {
    const g2 = shareGeometry(geo);
    const fa = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    g2.setAttribute('aVegFlex', fa);
    const m = new THREE.InstancedMesh(g2, mat, count);
    m.castShadow = shadows;
    m.frustumCulled = false;
    m.userData.src = geo;
    m.userData.flex = fa;
    aerial.add(m);
    return m;
  };
  const leaf = leafGeometry();
  const leaves = inst(leaf.geo, mats.leaf, NODES);
  leaves.receiveShadow = true;
  const NF = NT * FPT;
  const flowers = inst(flowerGeometry(), mats.flower, NF);
  const calyx = inst(calyxGeometry(), mats.sepal, NF);
  const fruits = inst(fruitGeometry(), mats.fruit, NF);
  fruits.receiveShadow = true;
  for (let i = 0; i < NF; i++) fruits.setColorAt(i, _c.set(1, 1, 1));

  const yaw0 = rng() * Math.PI * 2;
  const nodes = [];
  for (let k = 0; k < NODES; k++) {
    nodes.push({
      s: NODE0 + k * NODE_STEP,
      yaw: yaw0 + k * 2.4 + (rng() - 0.5) * 0.4,
      size: lerp(0.75, 1, Math.min(1, k / 3)) * (k > 6 ? 0.9 : 1) * (0.9 + rng() * 0.18),
      tilt: 0.75 + rng() * 0.3,
      twist: (rng() - 0.5) * 0.4,
    });
  }
  const trusses = TRUSS_AT.map((s, j) => ({
    s,
    yaw: yaw0 + (j * 2.4 + 1.2) + (rng() - 0.5) * 0.3,
    bud: 0.64 + 0.06 * j,
    set: 0.8 + 0.045 * j,
    ripe0: 0.87 + 0.06 * j,
    flowers: Array.from({ length: FPT }, (_, f) => ({
      side: f % 2 ? 1 : -1,
      at: 0.4 + (0.55 * f) / Math.max(1, FPT - 1),
      size: 0.85 + rng() * 0.3,
      spin: rng() * 6,
      lag: rng() * 0.02,
      end: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      flex: 0,
      ripe: 0,
      fruit: 0,
    })),
    picked: false,
  }));
  const dummy = { morphTargetInfluences: [0] };
  const hookDir = [Math.cos(rng() * 6.28), Math.sin(rng() * 6.28)];
  const toCane = new THREE.Vector3(STAKE.x, 0, STAKE.z).normalize();
  const zig = [rng() * 6, rng() * 6];

  const wobble = new Wobble({ stiffness: 30, damping: 3, amount: 0.05 });
  let g = 0;
  let built = -1;
  let pick = null;
  const arc = new Float32Array(45);

  // point and tangent at arc length s along the main stem
  function along(s, outP, outT) {
    const pts = stems.points[0];
    const n = pts.length - 1;
    let i = 0;
    while (i < n - 1 && arc[i + 1] < s) i++;
    const k = clamp((s - arc[i]) / Math.max(1e-6, arc[i + 1] - arc[i]), 0, 1);
    outP.copy(pts[i]).lerp(pts[i + 1], k);
    if (outT) outT.subVectors(pts[i + 1], pts[i]).normalize();
    return outP;
  }

  function apply() {
    built = g;
    for (const t of trusses) if (g < 0.79) t.picked = false;
    bed.set(g);
    seedMesh.visible = g < 0.08;

    // main stem: the hook pushes up and straightens; then the stem climbs,
    // zig-zagging a little at each node and leaning in to the cane
    const L = stemLen(g);
    const hl = hypoLen(g);
    const angle = Math.PI * (1 - smooth(0.19, 0.27, g));
    const pts = hookCurve(stems.points[0], BASE, L, Math.min(L, 0.01), angle, hookDir[0], hookDir[1]);
    const n = pts.length - 1;
    arc[0] = 0;
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * L;
      const w = smooth(0.05, 0.12, s);
      const lean = Math.min(0.022, s * 0.045);
      pts[i].x += Math.sin(s * 27 + zig[0]) * 0.0022 * w + toCane.x * lean;
      pts[i].z += Math.sin(s * 23 + zig[1]) * 0.0022 * w + toCane.z * lean;
      if (i) arc[i] = arc[i - 1] + pts[i].distanceTo(pts[i - 1]);
    }
    const rBase = lerp(0.0009, 0.0062, smooth(0.25, 0.92, g));
    stems.set(0, (t) => lerp(rBase, Math.min(rBase, 0.0014), Math.pow(t, 0.8)), pts, stemFlex);
    const Lr = arc[n];

    // seed leaves at the top of the hypocotyl, withering later
    along(Math.min(hl, Lr), _v, _v2);
    coty.position.copy(_v);
    if (g < 0.27) coty.quaternion.setFromUnitVectors(Y, _v2);
    else coty.quaternion.setFromUnitVectors(Y, _v3.copy(_v2).lerp(Y, 0.5).normalize());
    const cs = lerp(0.4, 1, smooth(0.16, 0.34, g)) * (1 - smooth(0.55, 0.66, g));
    coty.scale.setScalar(Math.max(1e-4, cs));
    coty.morphTargetInfluences[0] = smooth(0.23, 0.34, g) * (1 + 0.25 * smooth(0.45, 0.6, g));
    coty.visible = g > 0.12 && cs > 0.01;

    // leaves unfold as the stem climbs past their node
    for (let k = 0; k < NODES; k++) {
      const nd = nodes[k];
      const past = Lr - nd.s;
      const grown = smooth(0, 0.16, past);
      const open = smooth(0.015, 0.13, past);
      along(Math.min(nd.s, Lr), _v, _v2);
      const size = Math.max(1e-4, grown * nd.size);
      _q.setFromUnitVectors(Y, _v2);
      _q2.setFromAxisAngle(Y, nd.yaw);
      _q.multiply(_q2);
      _q2.setFromAxisAngle(X, lerp(0.05, nd.tilt, open));
      _q.multiply(_q2);
      _q2.setFromAxisAngle(Y, nd.twist * open);
      _q.multiply(_q2);
      _s.setScalar(size);
      _m.compose(_v, _q, _s);
      leaves.setMatrixAt(k, _m);
      dummy.morphTargetInfluences[0] = open;
      leaves.setMorphAt(k, dummy);
      leaves.userData.flex.setXY(k, size * size - 1, stemFlex(nd.s));
    }
    leaves.visible = Lr > NODE0;

    // ties go on as the stem reaches them
    for (let i = 0; i < TIES.length; i++) {
      const h = TIES[i];
      const on = Lr > h + 0.04;
      along(Math.min(h, Lr), _v);
      _v2.copy(_v).add(STAKE).multiplyScalar(0.5);
      _v2.y = _v.y;
      const span = Math.hypot(_v.x - STAKE.x, _v.z - STAKE.z) * 0.5 + 0.008;
      _q.setFromAxisAngle(Y, Math.atan2(-(STAKE.z - _v.z), STAKE.x - _v.x));
      _s.set(on ? span : 1e-4, on ? 0.012 : 1e-4, on ? 0.0085 : 1e-4);
      _m.compose(_v2, _q, _s);
      ties.setMatrixAt(i, _m);
    }
    ties.instanceMatrix.needsUpdate = true;

    placeTrusses(0);
    stems.commit();
    for (const m of [leaves, flowers, calyx, fruits]) {
      m.instanceMatrix.needsUpdate = true;
      m.userData.flex.needsUpdate = true;
      if (m.morphTexture) m.morphTexture.needsUpdate = true;
    }
    fruits.instanceColor.needsUpdate = true;
  }

  // Trusses hang from the stem between the leaves: a peduncle arching out
  // and down, pedicels in a zig-zag, and on each a flower, then a fruit.
  function placeTrusses(tug) {
    const Lr = arc[stems.points[0].length - 1];
    for (let j = 0; j < NT; j++) {
      const tr = trusses[j];
      const tube = 1 + j * (FPT + 1);
      const grown = smooth(tr.s + 0.02, tr.s + 0.1, Lr) * smooth(tr.bud - 0.04, tr.bud, g);
      const heavy = tr.picked ? 0 : smooth(tr.set, tr.set + 0.12, g);
      const lift = pick && pick.truss === j ? tug : 0;
      along(Math.min(tr.s, Lr), _v, _v2);
      const node = _v3.copy(_v);
      const dir = new THREE.Vector3(Math.sin(tr.yaw), 0, Math.cos(tr.yaw));
      const pp = stems.points[tube];
      const pn = pp.length - 1;
      const reach = 0.075 * grown;
      for (let i = 0; i <= pn; i++) {
        const t = i / pn;
        const up = 0.022 * Math.sin(Math.PI * t * 0.9) - (0.012 + 0.045 * heavy - lift * 0.03) * t * t;
        pp[i].copy(node).addScaledVector(dir, reach * t).addScaledVector(Y, up * grown);
      }
      const nodeFlex = stemFlex(tr.s);
      const pedFlex = (m) => nodeFlex + 0.4 * (m / 0.4) * (m / 0.4);
      stems.set(tube, (t) => (grown > 0.01 ? lerp(0.0016, 0.001, t) : 0), pp, pedFlex);
      const side = new THREE.Vector3().crossVectors(Y, dir).normalize();
      for (let f = 0; f < FPT; f++) {
        const fl = tr.flowers[f];
        const k = Math.round(fl.at * pn * 100) / 100;
        const i0 = Math.min(pn - 1, Math.floor(k));
        const start = new THREE.Vector3().copy(pp[i0]).lerp(pp[i0 + 1], k - i0);
        const ped = stems.points[tube + 1 + f];
        const plen = 0.017 * grown;
        for (let i = 0; i <= 3; i++) {
          const t = i / 3;
          ped[i]
            .copy(start)
            .addScaledVector(side, fl.side * plen * 0.8 * t)
            .addScaledVector(dir, plen * 0.3 * t)
            .addScaledVector(Y, (0.004 * t - (0.01 + 0.008 * heavy) * t * t) * grown);
        }
        stems.set(tube + 1 + f, (t) => (grown > 0.01 ? lerp(0.0009, 0.0007, t) : 0), ped, pedFlex);
        fl.end.copy(ped[3]);
        fl.flex = pedFlex(0.1);
        // flowers nod out and down; fruit hangs
        _v.subVectors(ped[3], ped[2]).normalize();
        const hang = smooth(tr.set, tr.set + 0.05, g) * (tr.picked ? 0 : 1);
        fl.axis.copy(_v).lerp(DOWN, 0.35 + 0.55 * hang).normalize();

        const bud = smooth(tr.bud + fl.lag, tr.bud + 0.03 + fl.lag, g);
        const bloom = smooth(tr.bud + 0.04 + fl.lag, tr.bud + 0.1 + fl.lag, g);
        const fall = smooth(tr.set + fl.lag, tr.set + 0.04 + fl.lag, g);
        const idx = j * FPT + f;
        _q.setFromUnitVectors(Y, fl.axis);
        _q2.setFromAxisAngle(Y, fl.spin);
        _q.multiply(_q2);
        const fs = grown > 0.01 ? bud * (1 - fall) * fl.size : 0;
        _s.setScalar(Math.max(1e-4, fs * lerp(0.6, 1, bloom)));
        _m.compose(fl.end, _q, _s);
        flowers.setMatrixAt(idx, _m);
        dummy.morphTargetInfluences[0] = bloom;
        flowers.setMorphAt(idx, dummy);
        flowers.userData.flex.setXY(idx, -1, fl.flex);

        const csz = grown > 0.01 && !(tr.picked && hang === 0 && g >= 0.8) ? Math.max(0.3, bud) * fl.size * 0.9 : 0;
        _s.setScalar(Math.max(1e-4, csz));
        _m.compose(fl.end, _q, _s);
        calyx.setMatrixAt(idx, _m);
        dummy.morphTargetInfluences[0] = bloom + smooth(tr.set, tr.set + 0.08, g) * 0.3;
        calyx.setMorphAt(idx, dummy);
        calyx.userData.flex.setXY(idx, -1, fl.flex);

        fl.fruit = tr.picked ? 0 : smooth(tr.set + fl.lag, tr.set + 0.13 + fl.lag, g);
        fl.ripe = smooth(tr.ripe0 + fl.lag, tr.ripe0 + 0.12 + fl.lag, g);
        const fsz = fl.fruit > 0.001 ? lerp(0.12, 1, fl.fruit) * fl.size * 0.95 : 1e-4;
        _s.setScalar(fsz);
        _m.compose(fl.end, _q, _s);
        fruits.setMatrixAt(idx, _m);
        fruits.setColorAt(idx, ripeColor(fl.ripe, _c));
        fruits.userData.flex.setXY(idx, 0, fl.flex);
      }
    }
    fruits.visible = g > 0.8;
    flowers.visible = g > 0.6 && g < 0.97;
  }

  // ---------------------------------------------------------- harvest

  function ripestTruss() {
    let best = -1;
    let bestK = 0.85;
    for (let j = 0; j < NT; j++) {
      const tr = trusses[j];
      if (tr.picked) continue;
      const k = tr.flowers.reduce((a, f) => a + f.ripe * (f.fruit > 0.8 ? 1 : 0), 0) / FPT;
      if (k > bestK) {
        bestK = k;
        best = j;
      }
    }
    return best;
  }

  function buildItem(j) {
    // the truss: its stalks, fruit and calyces, in world space
    aerial.updateWorldMatrix(true, true);
    const tr = trusses[j];
    const tube = 1 + j * (FPT + 1);
    const origin = stems.points[tube][0].clone();
    const ts = new TubeSet([{ segs: 8, radial: 4 }, ...tr.flowers.map(() => ({ segs: 3, radial: 3 }))]);
    for (let i = 0; i <= FPT; i++) {
      const src = stems.points[tube + i];
      const dst = ts.points[i];
      for (let q = 0; q < dst.length; q++) dst[q].copy(src[q]).sub(origin);
      ts.set(i, i === 0 ? (t) => lerp(0.0016, 0.001, t) : (t) => lerp(0.0009, 0.0007, t), dst, () => 0);
    }
    ts.commit();
    const stalk = new THREE.Mesh(ts.geometry, mats.stem);
    const fGeo = shareGeometry(fruitGeometry());
    fGeo.setAttribute('aVegFlex', new THREE.InstancedBufferAttribute(new Float32Array(FPT * 2), 2));
    const cGeo = shareGeometry(calyxGeometry());
    const fr = new THREE.InstancedMesh(fGeo, mats.fruit, FPT);
    const cx = new THREE.InstancedMesh(cGeo, mats.sepal, FPT);
    for (let f = 0; f < FPT; f++) {
      const idx = j * FPT + f;
      fruits.getMatrixAt(idx, _m);
      _m.elements[12] -= origin.x;
      _m.elements[13] -= origin.y;
      _m.elements[14] -= origin.z;
      fr.setMatrixAt(f, _m);
      fr.setColorAt(f, ripeColor(tr.flowers[f].ripe, _c));
      calyx.getMatrixAt(idx, _m);
      _m.elements[12] -= origin.x;
      _m.elements[13] -= origin.y;
      _m.elements[14] -= origin.z;
      cx.setMatrixAt(f, _m);
      cx.setMorphAt(f, { morphTargetInfluences: [1.3] });
    }
    for (const m of [stalk, fr, cx]) {
      m.castShadow = shadows;
      m.frustumCulled = false;
    }
    const item = new THREE.Group();
    item.name = 'tomato-harvest';
    item.position.copy(origin).applyMatrix4(aerial.matrixWorld);
    item.quaternion.setFromRotationMatrix(_m.extractRotation(aerial.matrixWorld));
    item.add(stalk, fr, cx);
    item.updateMatrixWorld(true);
    item.userData = {
      kind: 'tomato',
      count: FPT,
      size: { width: 0.12, fruit: FRUIT_R * 2 },
      velocity: new THREE.Vector3(0, 0.35, 0),
      dispose: () => {
        ts.geometry.dispose();
        disposeShared(fGeo, fruitGeometry());
        disposeShared(cGeo, calyxGeometry());
        fr.dispose();
        cx.dispose();
      },
    };
    return item;
  }

  function updatePick(dt) {
    pick.t += dt;
    const t = pick.t;
    if (!pick.freed) {
      const tug = smooth(0, 0.3, t) * (1 + Math.sin(t * 34) * 0.1);
      placeTrusses(tug);
      stems.commit();
      for (const m of [flowers, calyx, fruits]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.morphTexture) m.morphTexture.needsUpdate = true;
      }
      if (t >= 0.34) {
        pick.freed = true;
        const item = buildItem(pick.truss);
        toWorld(item);
        trusses[pick.truss].picked = true;
        built = -1;
        apply();
        wobble.poke(0.9);
        pick.onFree?.(item);
      }
    } else if (t > 1.2) {
      pick = null;
    }
  }

  // ---------------------------------------------------------- targets

  const tg = Array.from({ length: 2 + NT * 2 }, () => ({ pos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), plant: null, kind: 'leaf', color: '#46782c' }));

  return {
    object,
    setGrowth(v) {
      g = v;
    },
    pending: () => built !== g,
    flush: apply,
    update(dt) {
      wobble.update(dt);
      aerial.rotation.x = wobble.x;
      aerial.rotation.z = wobble.z;
      if (pick) updatePick(dt);
    },
    targets(out, plant) {
      if (g < 0.3) return;
      aerial.updateWorldMatrix(true, false);
      let n = 0;
      for (const k of [2, 5]) {
        const nd = nodes[k];
        if (arc[44] - nd.s < 0.13) continue;
        leaves.getMatrixAt(k, _m);
        const t = tg[n++];
        t.pos.copy(leaf.tips[0]).applyMatrix4(_m).applyMatrix4(aerial.matrixWorld);
        t.plant = plant;
        out.push(t);
      }
      for (let j = 0; j < NT; j++) {
        const tr = trusses[j];
        const fl = tr.flowers[1];
        const bloom = smooth(tr.bud + 0.04, tr.bud + 0.1, g) * (1 - smooth(tr.set, tr.set + 0.04, g));
        const fruit = !tr.picked && fl.fruit > 0.7;
        if (bloom < 0.7 && !fruit) continue;
        const t = tg[2 + j];
        t.kind = fruit ? 'fruit' : 'bloom';
        t.color = fruit ? '#' + ripeColor(fl.ripe, _c).getHexString() : '#f6c90e';
        t.pos.copy(fl.axis).multiplyScalar(fruit ? FRUIT_R * 1.7 : 0.003).add(fl.end).applyMatrix4(aerial.matrixWorld);
        if (fruit) t.pos.y += FRUIT_R * 0.8;
        t.normal.set(0, 1, 0);
        t.plant = plant;
        out.push(t);
      }
    },
    get hitRadius() {
      return grow(0.06, 0.16, smooth(0.3, 0.7, g));
    },
    get hitHeight() {
      return grow(0.06, 0.7, smooth(0.25, 0.95, g));
    },
    harvestable: () => g >= 1 && !pick && ripestTruss() >= 0,
    harvest(onFree) {
      const j = g >= 1 && !pick ? ripestTruss() : -1;
      if (j < 0) return { remove: false, regrowTo: g };
      pick = { t: 0, onFree, freed: false, truss: j };
      return { remove: false, regrowTo: 0.75 };
    },
    poke() {
      wobble.poke(1);
    },
    dispose() {
      stems.geometry.dispose();
      for (const m of [leaves, flowers, calyx, fruits]) {
        disposeShared(m.geometry, m.userData.src);
        m.dispose();
      }
      ties.dispose();
      bed.dispose();
    },
  };
}

void hex;
