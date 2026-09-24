// Pumpkin: a flat cream seed, a stout hooked shoot lifting two fleshy seed
// leaves (still wearing the seed coat, which drops off), then a hairy vine
// running over the soil. At each node a big lobed, rough leaf stands up on
// a hollow stalk, with a curly tendril beside it. Golden trumpet flowers
// open; behind the female one a little green ball swells into a ribbed
// pumpkin that turns from green to deep orange on a woody stalk. Harvest
// snaps the stalk and lifts the pumpkin free; the vine flowers again.
import * as THREE from 'three';
import { smooth, lerp, clamp, mulberry32 } from '../../config.js';
import { SeedBed } from './soil.js';
import { TubeSet, leafGrid, mergeGeometries, setPlantAttr, makeRelative, colorize, withUV } from './geom.js';
import { cutoutPixels, pixels, once } from './tex.js';
import { normalMapFromHeight, fbm, noise2 } from '../../shared.js';
import { vegLeaf, vegStem } from './mats.js';
import { petalMaterial } from '../materials.js';
import { buildLeaf } from './leaf.js';
import { Wobble, hookCurve, shareGeometry, disposeShared, toWorld, grow, readyMorphs } from './kit.js';

const STEM_UV = [0.004, 0.02, 0.05, 0.98];
const LEAF_UV = [0.07, 0, 1, 1];
const NODES = 8;
const NODE0 = 0.06;
const NODE_STEP = 0.06;
const FRUIT_NODE = 2;
const PUMPKIN_D = 0.24; // diameter when fully grown
const PUMPKIN_H = 0.17;
const BASE = new THREE.Vector3(0, -0.012, 0);

// ------------------------------------------------------------ textures

// A palmate, five-lobed pumpkin leaf with pale veins radiating from where
// the stalk joins (at v = 0.14), a toothed margin and rough, hairy skin.
// A stalk strip on the left (u < 0.06) colours the petiole.
function leafTextures() {
  return once('pumpkin-leaf', () => {
    const W = 512;
    const H = 512;
    const x0 = 0.06;
    const P = [0.5, 0.16];
    const lobes = [-2.15, -1.08, 0, 1.08, 2.15];
    const radius = (th) => {
      if (Math.abs(th) > 2.8) return 0;
      let best = 9;
      for (const c of lobes) best = Math.min(best, Math.abs(th - c));
      // broad, shallow, rounded lobes with a pointed tip each
      const lobe = Math.cos(Math.min(1, best / 0.54) * Math.PI * 0.5);
      let r = 0.4 + 0.07 * lobe + 0.025 * Math.pow(lobe, 12);
      if (Math.abs(th) < 0.75) r += 0.04 * Math.cos(th * 2);
      // the basal lobes curl round towards the sinus
      r *= Math.abs(th) > 2.35 ? 1 - ((Math.abs(th) - 2.35) / 0.45) * 0.5 : 1;
      const tooth = Math.abs((((th * 30) % 1) + 1) % 1 - 0.5) * 2;
      return r * (1 - 0.03 * tooth);
    };
    const veinD = (x, y) => {
      // distance (uv units) to the nearest of the five main veins, and to
      // the side veins that leave it at about 45 degrees towards the margin
      const dx = x - P[0];
      const dy = y - P[1];
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dx, dy);
      let best = 9;
      let c = 0;
      for (const l of lobes) {
        if (Math.abs(th - l) < best) {
          best = Math.abs(th - l);
          c = l;
        }
      }
      const da = th - c;
      const along = r * Math.cos(da);
      const off = Math.abs(r * Math.sin(da));
      let d = along > 0 ? off * (1.2 + along * 3) : r;
      const step = 0.065;
      const k = Math.round((along - off * 1.1) / step);
      let side = 1;
      if (k > 0 && k < 7 && along > 0.03) side = Math.abs(along - off * 1.1 - k * step) * 0.7 * (1 + off * 6);
      return [d, side];
    };
    const cc = new THREE.Color();
    const dark = new THREE.Color().setRGB(0.15, 0.3, 0.1);
    const mid = new THREE.Color().setRGB(0.24, 0.42, 0.15);
    const pale = new THREE.Color().setRGB(0.62, 0.72, 0.5);
    const stem = new THREE.Color().setRGB(0.42, 0.52, 0.26);
    const map = cutoutPixels(W, H, (u, v, o) => {
      if (u < x0) {
        const k = 0.85 + 0.15 * Math.sin(u * 700) + 0.08 * noise2(u * 80, v * 400);
        o[0] = stem.r * 255 * k;
        o[1] = stem.g * 255 * k;
        o[2] = stem.b * 255 * k;
        return;
      }
      const x = (u - x0) / (1 - x0);
      const dx = x - P[0];
      const dy = v - P[1];
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dx, dy);
      if (r > radius(th)) {
        o[3] = 0;
        return;
      }
      const n = fbm(x * 7, v * 7, 4);
      const [d, sd] = veinD(x, v);
      cc.copy(dark).lerp(mid, 0.35 + 0.65 * n);
      // silvery mottling along the main veins, pale veins themselves
      const mott = Math.max(0, 1 - d * 22) * (0.5 + 0.5 * noise2(x * 40, v * 40));
      cc.lerp(pale, Math.max(Math.max(0, 1 - d * 110) * 0.8, mott * 0.3, Math.max(0, 1 - sd * 160) * 0.3));
      const edge = r / radius(th);
      cc.multiplyScalar(1 - Math.max(0, edge - 0.9) * 1.2);
      const hair = noise2(x * 500, v * 500);
      if (hair > 0.84) cc.lerp(pale, 0.35);
      o[0] = cc.r * 255;
      o[1] = cc.g * 255;
      o[2] = cc.b * 255;
    });
    const normalMap = normalMapFromHeight(
      256,
      256,
      (u, v) => {
        if (u < x0) return 0.5 + 0.1 * Math.sin(u * 700);
        const x = (u - x0) / (1 - x0);
        const [d, sd] = veinD(x, v);
        // veins sink into the upper side, the blade between is puckered
        return Math.sqrt(Math.min(1, d * 12)) * 0.6 + Math.sqrt(Math.min(1, sd * 30)) * 0.12 + fbm(x * 40, v * 40, 2) * 0.12;
      },
      3,
    );
    normalMap.wrapS = normalMap.wrapT = THREE.ClampToEdgeWrapping;
    return { map, normalMap };
  });
}

// Pumpkin skin: a dark striped green (young) and a deep orange (ripe) map,
// blended in the shader; u round the fruit (12 ribs), v stem to base.
function fruitTextures() {
  return once('pumpkin-fruit', () => {
    const RIBS = 12;
    const green = pixels(
      256,
      256,
      (u, v, o) => {
        const rib = Math.abs(Math.cos(u * Math.PI * RIBS));
        const n = fbm(u * 24, v * 10, 3);
        const stripe = Math.pow(1 - rib, 3) * 0.8;
        const speck = noise2(u * 300, v * 160) > 0.8 ? 0.35 : 0;
        const k = 0.8 + 0.3 * n;
        o[0] = (36 + stripe * 90 + speck * 90) * k;
        o[1] = (70 + stripe * 110 + speck * 100) * k;
        o[2] = (30 + stripe * 60 + speck * 60) * k;
      },
      { srgb: true },
    );
    const orange = pixels(
      256,
      256,
      (u, v, o) => {
        const rib = Math.abs(Math.cos(u * Math.PI * RIBS));
        const n = fbm(u * 18 + 5, v * 12, 4);
        const groove = Math.pow(1 - rib, 4);
        let r = 222 - groove * 45 + n * 24;
        let gg = 98 - groove * 32 + n * 16;
        let b = 12 + n * 6;
        // pale scuffs and a darker, greener stem end and blossom end
        const scuff = fbm(u * 40, v * 30, 2);
        if (scuff > 0.66) {
          r += 16;
          gg += 22;
          b += 18;
        }
        const pole = Math.max(0, 1 - Math.min(v, 1 - v) / 0.1);
        r *= 1 - pole * 0.35;
        gg *= 1 - pole * 0.2;
        o[0] = Math.min(255, r);
        o[1] = Math.min(255, gg);
        o[2] = Math.min(255, b);
      },
      { srgb: true },
    );
    const normalMap = normalMapFromHeight(256, 256, (u, v) => fbm(u * 60, v * 30, 3) * 0.4 + (noise2(u * 200, v * 90) > 0.85 ? 0.2 : 0), 1.6);
    green.wrapT = orange.wrapT = THREE.ClampToEdgeWrapping;
    return { green, orange, normalMap };
  });
}

function stalkTexture() {
  return once('pumpkin-stalk', () =>
    pixels(
      64,
      128,
      (u, v, o) => {
        const ridge = Math.abs(Math.cos(u * Math.PI * 5));
        const n = fbm(u * 10, v * 30, 3);
        const cork = fbm(u * 30 + 3, v * 12, 3);
        const k = 0.75 + 0.35 * n;
        // green by the vine, corky tan towards the fruit
        const t = smooth(0.2, 0.8, 1 - v);
        const r = lerp(95, 160, t) * k - ridge * 20;
        const gg = lerp(118, 135, t) * k - ridge * 18;
        const b = lerp(55, 80, t) * k - ridge * 10 + (cork > 0.62 ? 12 : 0);
        o[0] = clamp(r, 0, 255);
        o[1] = clamp(gg, 0, 255);
        o[2] = clamp(b, 0, 255);
      },
      { srgb: true },
    ),
  );
}

// ------------------------------------------------------------ geometry

function leafGeometry() {
  return once('pumpkin-leaf-geo', () => {
    const L = 0.23;
    return buildLeaf({
      flexLen: 0.35,
      spine: {
        length: 0.2,
        folded: 0.5,
        seg: 10,
        arch: (s, open) => lerp(0.08 + 0.25 * s, 0.12 + 0.75 * s * s, open),
        radius: (s) => lerp(0.0036, 0.0024, s),
        radial: 6,
        uv: STEM_UV,
        thick: 0.7,
      },
      leaflets: [
        {
          s: 1,
          side: 0,
          size: L,
          width: L * 1.02,
          uv: LEAF_UV,
          grid: [6, 6],
          stalk: [-0.16 * L * 0.7, -0.16 * L],
          crease: [1.2, 0.08],
          droop: [-0.1, 0.12],
          cup: [0.1, 0.04],
          level: [0, 0.92],
          lift: [0, 0.18],
          foldScale: 0.55,
          foldWidth: 0.4,
          // a gently wavy blade
          shape: (u, v, k) => k * 0.003 * Math.sin(u * 9 + v * 4) * Math.sin(v * 7),
        },
      ],
    });
  });
}

function cotyledonGeometry() {
  return once('pumpkin-coty-geo', () => {
    const L = 0.036;
    const blade = (side) => (open) => (u, v, o) => {
      const hw = 0.0115 * Math.pow(Math.sin(Math.PI * clamp(v * 0.92 + 0.06, 0, 1)), 0.65);
      const a = lerp(0.04, 1.2, open) + v * lerp(0, 0.25, open);
      const along = v * L * lerp(0.7, 1, open);
      const x = (u - 0.5) * 2 * hw;
      // fleshy and slightly cupped
      o.set(side * (Math.sin(a) * along), Math.cos(a) * along + Math.abs(x) * 0.25 * open, x);
    };
    const parts = [-1, 1].map((side) => leafGrid(2, 6, blade(side)(0), blade(side)(1)));
    for (const g of parts) setPlantAttr(g, () => [0.02, 0.35]);
    return makeRelative(mergeGeometries(parts));
  });
}

// A golden trumpet flower opening into five pointed lobes (bud closed as
// the base shape); +y is the way it faces. Vertex coloured.
function flowerGeometry() {
  return once('pumpkin-flower-geo', () => {
    const NA = 50;
    const NT = 9;
    const shape = (open) => (u, v, o) => {
      const a = u * Math.PI * 2;
      const lobe = Math.pow(Math.abs(Math.cos(a * 2.5)), 5);
      const rib = Math.pow(Math.abs(Math.cos(a * 5)), 12);
      const t = v;
      const flare = lerp(0.15, 1, open);
      const len = 0.1 * lerp(0.7, 1, open) * (1 + 0.16 * lobe * Math.pow(t, 3));
      let r = 0.0045 + 0.014 * t + 0.036 * Math.pow(t, 3.2) * flare * (0.82 + 0.3 * lobe);
      r *= 1 + 0.05 * rib * t;
      // the lobe tips curl back once open
      const curl = Math.pow(Math.max(0, t - 0.75) / 0.25, 2) * 0.012 * open * (0.4 + lobe);
      o.set(Math.cos(a) * r, t * len - curl, Math.sin(a) * r);
    };
    const g = leafGrid(NA, NT, shape(0), shape(1));
    const uv = g.attributes.uv;
    const c = new Float32Array(uv.count * 3);
    for (let i = 0; i < uv.count; i++) {
      const a = uv.getX(i) * Math.PI * 2;
      const t = uv.getY(i);
      const rib = Math.pow(Math.abs(Math.cos(a * 5)), 10);
      // green calyx tube, then deep gold, a little deeper along the ribs
      const base = t < 0.18 ? 1 - t / 0.18 : 0;
      c[i * 3] = lerp(0.86 - rib * 0.12, 0.2, base);
      c[i * 3 + 1] = lerp(0.26 + t * 0.12 - rib * 0.08, 0.3, base);
      c[i * 3 + 2] = lerp(0.0, 0.03, base);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    setPlantAttr(g, () => [0, 0]);
    const geo = makeRelative(g);
    geo.computeBoundingSphere();
    return geo;
  });
}

// Ribbed, slightly flattened pumpkin with dimpled ends. Origin at the
// stem end (top), +y down into the fruit is avoided: y runs up, so the
// fruit sits on its base at y = 0 and the stalk joins at y = H.
function fruitGeometry() {
  return once('pumpkin-fruit-geo', () => {
    const g = new THREE.SphereGeometry(0.5, 48, 26);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const lat = Math.asin(clamp(y / 0.5, -1, 1)); // -pi/2..pi/2
      const rib = Math.pow(Math.abs(Math.sin(a * 6)), 0.6);
      const r = 1 - 0.07 * (1 - rib) * Math.cos(lat);
      let yy = y * (PUMPKIN_H / PUMPKIN_D);
      // dimples at both ends
      const pole = Math.pow(Math.abs(Math.sin(lat)), 6);
      yy -= Math.sign(y) * pole * 0.035 * (1 - Math.cos(lat) * 0.2);
      p.setXYZ(i, x * r, yy + (PUMPKIN_H / PUMPKIN_D) * 0.5, z * r);
      uv.setY(i, 1 - uv.getY(i));
    }
    g.scale(PUMPKIN_D, PUMPKIN_D, PUMPKIN_D);
    g.computeVertexNormals();
    return g;
  });
}

// The woody, five-sided stalk, flaring where it meets the pumpkin; base at
// the origin, running up +y.
function stalkGeometry() {
  return once('pumpkin-stalk-geo', () => {
    const g = new THREE.CylinderGeometry(0.0075, 0.0115, 0.055, 5, 8, false);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      const t = (y + 0.0275) / 0.055; // 0 base .. 1 top
      const flare = 1 + 0.9 * Math.pow(1 - t, 6);
      const tw = t * 0.9;
      const c = Math.cos(tw);
      const s = Math.sin(tw);
      [x, z] = [x * c - z * s, x * s + z * c];
      const bend = t * t * 0.012;
      p.setXYZ(i, x * flare + bend, y + 0.0275, z * flare);
    }
    g.computeVertexNormals();
    return g;
  });
}

function seedGeometry() {
  return once('pumpkin-seed', () => {
    const g = new THREE.SphereGeometry(1, 16, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      // flat oval, a touch pointed at one end, with a raised rim
      const taper = 1 - Math.max(0, x) * 0.28;
      const rim = 1 + 0.25 * Math.pow(Math.hypot(x, z), 8);
      p.setXYZ(i, x * 0.0092, y * 0.0017 * rim, z * 0.0058 * taper);
    }
    g.computeVertexNormals();
    return g;
  });
}

// ------------------------------------------------------------ materials

function materials() {
  return once('pumpkin-mats', () => {
    const lt = leafTextures();
    const leaf = vegLeaf('pumpkin', { map: lt.map, normalMap: lt.normalMap, normalScale: 0.8, alphaTest: 0.5, translucency: 0.45, roughness: 0.72 });
    const coty = vegLeaf('pumpkin-coty', { color: '#6f9f45', translucency: 0.4, roughness: 0.5 });
    const vine = vegStem('pumpkin-vine', { color: '#6d8a3e', roughness: 0.8 });
    const flower = petalMaterial({ color: '#ffffff', vertexColors: true, translucency: 0.35, roughness: 0.8 });
    const prev = flower.onBeforeCompile;
    flower.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace('attribute vec2 aPlant;', 'attribute vec2 aPlant;\nattribute vec2 aVegFlex;')
        .replace('windSway(wp, aPlant.x)', 'windSway(wp, aPlant.x * (1.0 + aVegFlex.x) + aVegFlex.y)');
    };
    const fk = flower.customProgramCacheKey();
    flower.customProgramCacheKey = () => `${fk}-vegflex`;
    const stalk = new THREE.MeshStandardMaterial({ map: stalkTexture(), roughness: 0.85 });
    const seed = new THREE.MeshStandardMaterial({ color: '#efe4c4', roughness: 0.6 });
    return { leaf, coty, vine, flower, stalk, seed };
  });
}

// One pumpkin material per plant (its own ripeness); they share a program.
function fruitMaterial() {
  const ft = fruitTextures();
  const m = new THREE.MeshPhysicalMaterial({ map: ft.green, normalMap: ft.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.35, envMapIntensity: 0.6 });
  const uRipe = { value: 0 };
  const uOrange = { value: ft.orange };
  m.userData.ripe = uRipe;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRipe = uRipe;
    shader.uniforms.uOrange = uOrange;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRipe;\nuniform sampler2D uOrange;')
      .replace(
        '#include <map_fragment>',
        `vec3 gSkin = texture2D(map, vMapUv).rgb;
  vec3 oSkin = texture2D(uOrange, vMapUv).rgb;
  // colour creeps in patches, from the sunny top down
  vec2 q = vMapUv * vec2(7.0, 4.0);
  float nz = fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453);
  vec2 f = fract(q);
  float nz2 = fract(sin(dot(floor(q) + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
  float patchy = mix(nz, nz2, smoothstep(0.0, 1.0, f.x)) * 0.35 + (vMapUv.y) * 0.3;
  float k = smoothstep(patchy - 0.2, patchy + 0.2, uRipe * 1.5 - 0.25);
  vec3 midSkin = mix(gSkin, vec3(0.62, 0.52, 0.12), 0.6);
  vec3 skin = k < 0.5 ? mix(gSkin, midSkin, k * 2.0) : mix(midSkin, oSkin, k * 2.0 - 1.0);
  diffuseColor.rgb *= skin;`,
      );
  };
  m.customProgramCacheKey = () => 'veg-pumpkin';
  return m;
}

// ------------------------------------------------------------ the plant

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _side = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const vineFlex = (m) => 0.05 * (m / 0.4) * (m / 0.4);
const vineLen = (g) => lerp(0.012, 0.05, smooth(0.08, 0.3, g)) + 0.5 * Math.pow(smooth(0.33, 0.93, g), 1.1);

export function createPumpkin({ seed = 1, quality } = {}) {
  const rng = mulberry32(seed);
  const shadows = quality?.shadows !== false;
  const mats = materials();

  const object = new THREE.Group();
  object.name = 'pumpkin';
  const bed = new SeedBed({ seed, radius: 0.034, height: 0.008, shadows });
  object.add(bed.object);

  const aerial = new THREE.Group();
  object.add(aerial);

  // the seed: in its hole, then riding up on the seed leaves, then dropped
  const seedMesh = new THREE.Mesh(seedGeometry(), mats.seed);
  seedMesh.castShadow = shadows;
  const seedRest = new THREE.Vector3(0.018 + rng() * 0.01, 0.0015, 0.012);
  object.add(seedMesh);

  // vine (tube 0) and a tendril per node
  const vineDir = rng() * Math.PI * 2;
  const bendy = (rng() - 0.5) * 1.6;
  const defs = [{ segs: 40, radial: 7, thick: 0.8 }];
  for (let k = 0; k < NODES; k++) defs.push({ segs: 18, radial: 3, thick: 0.5 });
  // flower stalks: male flowers at nodes 1 and 3, the fruit's stalk start
  defs.push({ segs: 6, radial: 4, thick: 0.6 }, { segs: 6, radial: 4, thick: 0.6 });
  const stems = new TubeSet(defs);
  const stemMesh = new THREE.Mesh(stems.geometry, mats.vine);
  stemMesh.castShadow = shadows;
  stemMesh.receiveShadow = true;
  stemMesh.frustumCulled = false;
  aerial.add(stemMesh);

  const coty = new THREE.Mesh(cotyledonGeometry(), mats.coty);
  coty.castShadow = shadows;
  coty.morphTargetInfluences = [0];
  aerial.add(coty);

  const inst = (geo, mat, count) => {
    const g2 = shareGeometry(geo);
    const fa = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    g2.setAttribute('aVegFlex', fa);
    const m = readyMorphs(new THREE.InstancedMesh(g2, mat, count));
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
  const flowers = inst(flowerGeometry(), mats.flower, 3); // 0, 1 male; 2 female

  // the pumpkin and its stalk
  const fruitMat = fruitMaterial();
  const fruit = new THREE.Mesh(fruitGeometry(), fruitMat);
  fruit.castShadow = shadows;
  fruit.receiveShadow = true;
  const stalk = new THREE.Mesh(stalkGeometry(), mats.stalk);
  stalk.castShadow = shadows;
  const fruitGroup = new THREE.Group();
  fruitGroup.add(fruit, stalk);
  object.add(fruitGroup);

  const yaw0 = rng() * Math.PI * 2;
  const nodes = [];
  for (let k = 0; k < NODES; k++) {
    nodes.push({
      s: NODE0 + k * NODE_STEP,
      side: k % 2 ? 1 : -1,
      yaw: (rng() - 0.5) * 0.8,
      size: lerp(0.55, 1.05, Math.min(1, k / 2)) * (0.85 + rng() * 0.25),
      tilt: 0.25 + rng() * 0.25,
      coil: rng() * 6,
    });
  }
  const fruitSide = nodes[FRUIT_NODE].side * -1;
  const fruitSpin = rng() * 6;
  const dummy = { morphTargetInfluences: [0] };
  const hookDir = [Math.cos(vineDir), Math.sin(vineDir)];
  void yaw0;

  const wobble = new Wobble({ stiffness: 34, damping: 3.2, amount: 0.05 });
  let g = 0;
  let built = -1;
  let lift = null; // harvest in progress
  let picked = false;
  const arc = new Float32Array(41);
  const fruitPos = new THREE.Vector3();
  const nodePos = new THREE.Vector3();

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
    if (g < 0.78) picked = false;
    bed.set(g);

    // the vine: a hook that straightens, then a runner laid over the soil
    const L = vineLen(g);
    const hl = lerp(0.012, 0.05, smooth(0.08, 0.3, g));
    const angle = Math.PI * (1 - smooth(0.19, 0.27, g));
    const pts = stems.points[0];
    const n = pts.length - 1;
    if (g < 0.3) hookCurve(pts, BASE, L, Math.min(L, 0.014), angle, hookDir[0], hookDir[1]);
    else {
      // up out of the soil, leaning over, then away along the ground in a
      // lazy curve with the growing tip lifted
      const over = smooth(0.3, 0.55, g);
      const run = Math.max(0, L - hl);
      let x = 0;
      let z = 0;
      let top = BASE.y;
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * L;
        if (s <= hl) {
          const k = s / hl;
          const d = over * 0.025 * k * k;
          x = hookDir[0] * d;
          z = hookDir[1] * d;
          top = BASE.y + s * (1 - 0.4 * over * k);
          pts[i].set(x, top, z);
        } else {
          const r = s - hl;
          const a = vineDir + bendy * (r / 0.5) * (r / 0.5);
          const step = L / n;
          x += Math.cos(a) * step;
          z += Math.sin(a) * step;
          const tipLift = Math.max(0, 1 - (run - r) / 0.06) * 0.018;
          const y = lerp(top, 0.0055, smooth(0, 0.07, r)) + tipLift + 0.0015 * Math.sin(r * 31);
          pts[i].set(x, y, z);
        }
      }
    }
    arc[0] = 0;
    for (let i = 1; i <= n; i++) arc[i] = arc[i - 1] + pts[i].distanceTo(pts[i - 1]);
    const rBase = lerp(0.0014, 0.0058, smooth(0.25, 0.8, g));
    stems.set(0, (t) => lerp(rBase, Math.min(rBase, 0.0025), Math.pow(t, 1.5)), pts, vineFlex);
    const Lr = arc[n];

    // seed leaves on the hypocotyl tip; the seed coat rides on them
    along(Math.min(hl, Lr), _v, _v2);
    coty.position.copy(_v);
    coty.quaternion.setFromUnitVectors(Y, g < 0.3 ? _v2 : _v2.lerp(Y, smooth(0.27, 0.34, g)).normalize());
    const cs = lerp(0.45, 1, smooth(0.16, 0.34, g)) * (1 - smooth(0.58, 0.68, g));
    coty.scale.setScalar(Math.max(1e-4, cs));
    coty.morphTargetInfluences[0] = smooth(0.23, 0.33, g);
    coty.visible = g > 0.12 && cs > 0.01;
    if (g < 0.08) {
      seedMesh.position.set(0, 0.0008, 0);
      seedMesh.rotation.set(0, 0.6, 0);
      seedMesh.scale.setScalar(1);
      seedMesh.visible = true;
    } else if (g < 0.275) {
      // wearing the coat: it sits over the closed seed leaves
      seedMesh.visible = g > 0.13;
      _v2.set(0, 0.03 * cs, 0).applyQuaternion(coty.quaternion).add(coty.position);
      seedMesh.position.copy(_v2);
      seedMesh.quaternion.copy(coty.quaternion);
      seedMesh.rotateZ(Math.PI / 2);
      seedMesh.scale.setScalar(1);
    } else {
      // dropped on the soil beside the stem, soon lost under the leaves
      const k = smooth(0.275, 0.3, g);
      _v2.set(0, 0.03 * cs, 0).applyQuaternion(coty.quaternion).add(coty.position);
      seedMesh.position.copy(_v2).lerp(seedRest, k);
      seedMesh.rotation.set(0, 0.9, 0);
      seedMesh.scale.setScalar(Math.max(1e-4, 1 - smooth(0.45, 0.55, g)));
      seedMesh.visible = g < 0.55;
    }

    // leaves stand up from the vine as it runs past their node
    for (let k = 0; k < NODES; k++) {
      const nd = nodes[k];
      const past = Lr - nd.s + (k === 0 ? 0.05 : 0);
      const grown = smooth(0, 0.14, past) * smooth(0.28, 0.34, g);
      const open = smooth(0.02, 0.13, past) * smooth(0.3, 0.36, g);
      along(Math.min(nd.s, Lr), _v, _v2);
      const size = Math.max(1e-4, grown * nd.size);
      // face the leaf out to its side of the vine, blade held level
      const heading = Math.atan2(_v2.x, _v2.z) + nd.side * (0.9 + nd.yaw * 0.3);
      _q.setFromAxisAngle(Y, heading);
      _q2.setFromAxisAngle(X, lerp(0.05, nd.tilt, open));
      _q.multiply(_q2);
      _s.setScalar(size);
      _m.compose(_v, _q, _s);
      leaves.setMatrixAt(k, _m);
      dummy.morphTargetInfluences[0] = open;
      leaves.setMorphAt(k, dummy);
      leaves.userData.flex.setXY(k, size * size - 1, vineFlex(nd.s));

      // tendril: out from the node, coiling
      const tp = stems.points[1 + k];
      const tl = 0.09 * smooth(0.02, 0.12, past) * smooth(0.4, 0.46, g);
      const side = _side.copy(_v2).cross(Y).normalize().multiplyScalar(-nd.side);
      for (let i = 0; i < tp.length; i++) {
        const t = i / (tp.length - 1);
        const coil = Math.max(0, t - 0.35) / 0.65;
        const ang = coil * Math.PI * 6 + nd.coil;
        const rad = 0.006 * coil;
        tp[i]
          .copy(_v)
          .addScaledVector(side, tl * t * 0.8 + Math.cos(ang) * rad)
          .addScaledVector(_v2, tl * t * 0.25)
          .addScaledVector(Y, tl * (0.4 * Math.sin(t * Math.PI * 0.8)) + Math.sin(ang) * rad + 0.004);
      }
      stems.set(1 + k, (t) => (tl > 0.002 ? 0.0008 * (1 - t * 0.5) : 0), tp, (m) => vineFlex(nd.s) + (m / 0.3) * (m / 0.3));
    }
    leaves.visible = g > 0.27;

    placeFlowersAndFruit();
    stems.commit();
    for (const m of [leaves, flowers]) {
      m.instanceMatrix.needsUpdate = true;
      m.userData.flex.needsUpdate = true;
      if (m.morphTexture) m.morphTexture.needsUpdate = true;
    }
  }

  function placeFlowersAndFruit(liftY = 0) {
    const Lr = arc[arc.length - 1];
    // male flowers stand on long stalks from nodes 1 and 3
    for (let j = 0; j < 2; j++) {
      const nd = nodes[1 + j * 2];
      const tube = 1 + NODES + j;
      const bud = smooth(0.62 + j * 0.03, 0.68 + j * 0.03, g) * (Lr > nd.s + 0.05 ? 1 : 0);
      const bloom = smooth(0.68 + j * 0.03, 0.76 + j * 0.03, g);
      const fade = smooth(0.86, 0.92, g);
      along(Math.min(nd.s, Lr), _v, _v2);
      const side = _side.copy(_v2).cross(Y).normalize().multiplyScalar(nd.side);
      const sp = stems.points[tube];
      const h = 0.15 * bud;
      for (let i = 0; i < sp.length; i++) {
        const t = i / (sp.length - 1);
        sp[i].copy(_v).addScaledVector(side, 0.03 * t * bud).addScaledVector(Y, h * t);
      }
      stems.set(tube, (t) => (bud > 0.01 ? lerp(0.0024, 0.0017, t) : 0), sp, (m) => vineFlex(nd.s) + (m / 0.4) * (m / 0.4));
      _v.copy(sp[sp.length - 1]);
      _v2.copy(side).multiplyScalar(0.5).add(Y).normalize();
      _q.setFromUnitVectors(Y, _v2);
      const fs = bud * (1 - fade);
      _s.setScalar(Math.max(1e-4, fs * lerp(0.6, 1, bloom)));
      _m.compose(_v, _q, _s);
      flowers.setMatrixAt(j, _m);
      dummy.morphTargetInfluences[0] = bloom * (1 - fade * 0.6);
      flowers.setMorphAt(j, dummy);
      flowers.userData.flex.setXY(j, -1, vineFlex(nd.s) + 0.14);
    }

    // the female flower sits on the little fruit, which swells after it fades
    const nd = nodes[FRUIT_NODE];
    along(Math.min(nd.s, Lr), nodePos, _v2);
    const side = _side.copy(_v2).cross(Y).normalize().multiplyScalar(fruitSide);
    const exists = Lr > nd.s + 0.03 && g > 0.6;
    const swell = picked ? 0 : smooth(0.8, 0.96, g);
    const size = lerp(0.14, 1, swell);
    const d = PUMPKIN_D * size;
    fruitPos.copy(nodePos).addScaledVector(side, 0.04 + d * 0.5 + 0.01);
    fruitPos.y = 0;
    fruitGroup.visible = exists && !picked;
    fruitGroup.position.copy(fruitPos);
    fruitGroup.position.y += liftY;
    fruitGroup.rotation.set(0, fruitSpin, 0);
    fruit.scale.setScalar(Math.max(1e-4, size * smooth(0.6, 0.66, g)));
    fruitMat.userData.ripe.value = smooth(0.86, 1, g);
    // the stalk runs from the vine node to the top of the fruit
    const top = _v.set(0, PUMPKIN_H * size, 0);
    stalk.position.copy(top);
    const toNode = _v2.copy(nodePos).sub(fruitPos).sub(top);
    toNode.y = Math.max(toNode.y, 0.01);
    stalk.quaternion.setFromUnitVectors(Y, _v2.copy(toNode).normalize().lerp(Y, 0.55).normalize());
    stalk.rotateY(fruitSpin);
    stalk.scale.set(lerp(0.3, 1, swell), lerp(0.4, 1, swell) * clamp(toNode.length() / 0.05, 0.6, 1.4), lerp(0.3, 1, swell));
    stalk.visible = swell > 0.02;

    const bud = smooth(0.62, 0.68, g) * (exists ? 1 : 0);
    const bloom = smooth(0.68, 0.76, g);
    const fade = smooth(0.8, 0.86, g);
    _v.set(0, PUMPKIN_H * size * 0.9, 0).applyEuler(fruitGroup.rotation).add(fruitPos);
    _v2.copy(side).multiplyScalar(0.8).add(Y).normalize();
    _q.setFromUnitVectors(Y, _v2);
    _s.setScalar(Math.max(1e-4, bud * (1 - fade) * lerp(0.6, 0.9, bloom)));
    _m.compose(_v, _q, _s);
    flowers.setMatrixAt(2, _m);
    dummy.morphTargetInfluences[0] = bloom * (1 - fade);
    flowers.setMorphAt(2, dummy);
    flowers.userData.flex.setXY(2, -1, 0);
    flowers.visible = g > 0.6 && g < 0.93;
  }

  // ---------------------------------------------------------- harvest

  function updateLift(dt) {
    lift.t += dt;
    const t = lift.t;
    if (!lift.freed) {
      // a twist and a rock as the stalk is worked, then it snaps
      const rock = Math.sin(t * 22) * 0.04 * smooth(0, 0.2, t);
      fruitGroup.rotation.set(rock, fruitSpin + smooth(0, 0.4, t) * 0.12, rock * 0.6);
      fruitGroup.position.y = smooth(0.25, 0.42, t) * 0.012;
      if (t >= 0.42) {
        lift.freed = true;
        const item = new THREE.Group();
        item.name = 'pumpkin-harvest';
        object.updateMatrixWorld(true);
        item.position.setFromMatrixPosition(fruitGroup.matrixWorld);
        item.quaternion.setFromRotationMatrix(_m.extractRotation(fruitGroup.matrixWorld));
        item.updateMatrixWorld(true);
        // a fresh pumpkin with the snapped stalk goes; the vine keeps its own
        const m = fruitMaterial();
        m.userData.ripe.value = fruitMat.userData.ripe.value;
        const f = new THREE.Mesh(fruitGeometry(), m);
        f.scale.copy(fruit.scale);
        const st = new THREE.Mesh(stalkGeometry(), mats.stalk);
        st.position.copy(stalk.position);
        st.quaternion.copy(stalk.quaternion);
        st.scale.copy(stalk.scale).multiply(_s.set(1, 0.6, 1));
        f.castShadow = st.castShadow = shadows;
        f.receiveShadow = true;
        item.add(f, st);
        item.userData = {
          kind: 'pumpkin',
          size: { width: PUMPKIN_D, height: PUMPKIN_H },
          velocity: new THREE.Vector3(0, 0.3, 0),
          dispose: () => m.dispose(),
        };
        toWorld(item);
        picked = true;
        fruitGroup.visible = false;
        wobble.poke(0.6);
        lift.onFree?.(item);
      }
    } else if (t > 1) {
      lift = null;
    }
  }

  // ---------------------------------------------------------- targets

  const tg = Array.from({ length: 6 }, () => ({ pos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), plant: null, kind: 'leaf', color: '#3d6b26' }));

  apply(); // valid from the first frame, before Plants flushes it

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
      if (lift) updateLift(dt);
    },
    targets(out, plant) {
      if (g < 0.35) return;
      aerial.updateWorldMatrix(true, false);
      let n = 0;
      for (const k of [1, 3]) {
        const nd = nodes[k];
        if (arc[40] - nd.s < 0.13) continue;
        leaves.getMatrixAt(k, _m);
        const t = tg[n++];
        t.pos.copy(leaf.tips[0]).multiplyScalar(0.7).applyMatrix4(_m).applyMatrix4(aerial.matrixWorld);
        t.plant = plant;
        out.push(t);
      }
      if (g > 0.72 && g < 0.86) {
        for (let j = 0; j < 3; j++) {
          flowers.getMatrixAt(j, _m);
          const t = tg[2 + j];
          t.kind = 'bloom';
          t.color = '#f5a300';
          t.pos.set(0, 0.07, 0).applyMatrix4(_m).applyMatrix4(aerial.matrixWorld);
          t.plant = plant;
          out.push(t);
        }
      }
      if (g > 0.9 && !picked) {
        const t = tg[5];
        t.kind = 'fruit';
        t.color = '#e0701a';
        t.pos.set(0, PUMPKIN_H * 0.95, 0).applyMatrix4(fruitGroup.matrixWorld);
        t.plant = plant;
        out.push(t);
      }
    },
    get hitRadius() {
      return grow(0.07, 0.3, smooth(0.3, 0.8, g));
    },
    get hitHeight() {
      return grow(0.06, 0.3, smooth(0.25, 0.7, g));
    },
    harvestable: () => g >= 1 && !picked && !lift,
    harvest(onFree) {
      if (g < 1 || picked || lift) return { remove: false, regrowTo: g };
      lift = { t: 0, onFree, freed: false };
      return { remove: false, regrowTo: 0.72 };
    },
    poke() {
      wobble.poke(1);
    },
    dispose() {
      stems.geometry.dispose();
      for (const m of [leaves, flowers]) {
        disposeShared(m.geometry, m.userData.src);
        m.dispose();
      }
      fruitMat.dispose();
      bed.dispose();
    },
  };
}

void withUV;
