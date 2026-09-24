// Strawberry: a bare-root crown set in the hole, then a rosette of hairy
// trifoliate leaves with toothed, deeply veined leaflets unfolding one by
// one. Arching stalks carry white five-petalled flowers; the petals fall and
// each flower's heart swells into a berry (seeds dimpled into its glossy
// skin, a green calyx star on top) that ripens green, white, pink, red and
// sinks towards the soil with its weight. Harvest picks the ripe berries.
import * as THREE from 'three';
import { smooth, lerp, clamp, mulberry32 } from '../../config.js';
import { SeedBed } from './soil.js';
import { TubeSet, leafGrid, mergeGeometries, setPlantAttr, makeRelative, colorize, still, withUV } from './geom.js';
import { paintLeaf, pixels, once, hex } from './tex.js';
import { normalMapFromHeight } from '../../shared.js';
import { vegLeaf, vegStem, rigidSway } from './mats.js';
import { petalMaterial, leafMaterial } from '../materials.js';
import { buildLeaf } from './leaf.js';
import { Wobble, shareGeometry, disposeShared, toWorld, grow } from './kit.js';

const STEM_UV = [0.005, 0.02, 0.07, 0.98];
const LEAF_UV = [0.09, 0, 1, 1];
const BERRY_L = 0.032;
const BERRY_R = 0.0135;

// ------------------------------------------------------------ textures

function leafTextures() {
  return paintLeaf('strawberry-leaf', {
    w: 256,
    h: 256,
    stemStrip: true,
    outline: (t) => (t < 0.58 ? Math.pow(Math.sin(((t / 0.58) * Math.PI) / 2), 0.85) : Math.pow(Math.cos((((t - 0.58) / 0.42) * Math.PI) / 2), 0.5)) * 0.96,
    teeth: 12,
    toothDepth: 0.16,
    toothFrom: 0.22,
    veins: 9,
    veinAngle: 0.3,
    veinSharp: 70,
    veinTone: 0.45,
    pleat: 0.55,
    hair: 0.25,
    base: '#3b7026',
    dark: '#27511a',
    light: '#5c9340',
    vein: '#4f8434',
    stem: '#7b8744',
    seed: 3,
  });
}

// Berry skin: R = flesh shading, G = seed (achene) mask; u round, v tip
// (0) to shoulder (1). Seeds sit in little pits spaced evenly over the skin.
function berryTextures() {
  return once('strawberry-berry', () => {
    const W = 256;
    const H = 256;
    const prof = (v) => berryRadius(v) / BERRY_R;
    const spacing = 0.0033; // metres between seeds
    const rows = [];
    const rnd = mulberry32(31);
    for (let v = 0.035; v < 0.93; v += spacing / BERRY_L) {
      const circ = Math.max(0.2, prof(v)) * BERRY_R * Math.PI * 2;
      const n = Math.max(3, Math.round(circ / spacing));
      const jit = Array.from({ length: n }, () => [(rnd() - 0.5) * 0.35, (rnd() - 0.5) * 0.3]);
      rows.push({ v, n, off: rows.length % 2 ? 0.5 : 0, jit });
    }
    // distance (metres) to the nearest seed, and its row
    const near = (u, v) => {
      let best = 1;
      for (const r of rows) {
        const dvm = (v - r.v) * BERRY_L;
        if (Math.abs(dvm) > spacing) continue;
        const circ = Math.max(0.2, prof(r.v)) * BERRY_R * Math.PI * 2;
        const idx = Math.round(u * r.n - r.off);
        const j = r.jit[((idx % r.n) + r.n) % r.n];
        const cu = (idx + r.off + j[0]) / r.n;
        const dum = ((((u - cu) % 1) + 1.5) % 1 - 0.5) * circ;
        best = Math.min(best, Math.hypot(dum, dvm * 1.25 - j[1] * spacing));
      }
      return best;
    };
    const field = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) field[y * W + x] = near(x / W, 1 - y / H);
    const at = (u, v) => field[Math.min(H - 1, Math.floor((1 - v) * H)) * W + Math.min(W - 1, Math.floor(u * W))];
    const map = pixels(
      W,
      H,
      (u, v, o) => {
        const d = at(u, v);
        const seed = d < 0.0004 ? 1 : d < 0.00052 ? (0.00052 - d) / 0.00012 : 0;
        const pit = d < 0.001 ? 1 - d / 0.001 : 0;
        // lighter just round each pit, a touch paler towards the shoulder
        const shade = 0.93 - pit * 0.22 + (1 - pit) * 0.04 + v * 0.05;
        o[0] = clamp(shade, 0, 1) * 255;
        o[1] = seed * 255;
        o[2] = 0;
      },
      { srgb: false },
    );
    map.wrapT = THREE.ClampToEdgeWrapping;
    const normalMap = normalMapFromHeight(
      W,
      H,
      (u, v) => {
        const d = at(u, v);
        const seed = d < 0.0006 ? 0.35 * (1 - d / 0.0006) : 0;
        return -Math.max(0, 1 - d / 0.0013) * 0.7 + seed;
      },
      5,
    );
    normalMap.wrapT = THREE.ClampToEdgeWrapping;
    return { map, normalMap };
  });
}

// ------------------------------------------------------------ geometry

// Berry radius along its length, v 0 (tip) .. 1 (shoulder): a rounded cone.
function berryRadius(v) {
  const body = Math.pow(Math.sin((Math.PI / 2) * Math.pow(clamp(v / 0.8, 0, 1), 0.8)), 0.9);
  const shoulder = v > 0.8 ? Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.8) / 0.2, 2))) : 1;
  return BERRY_R * body * (0.25 + 0.75 * shoulder) * (v > 0.995 ? 0.3 : 1);
}

function berryGeometry() {
  return once('strawberry-berry-geo', () => {
    const pts = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const v = i / N;
      pts.push(new THREE.Vector2(Math.max(0.0001, berryRadius(v)), (1 - v) * BERRY_L));
    }
    // LatheGeometry: y is along the berry (0 at the calyx, L at the tip)
    const g = new THREE.LatheGeometry(pts, 18);
    // lathe v runs from the first point (tip); flip so v = 0 at the tip
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i));
    // a slightly lumpy, not quite round berry
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.05 * Math.sin(a * 3 + y * 90) + 0.03 * Math.sin(a * 5 - y * 140);
      p.setXYZ(i, x * k, y, z * k * 0.94);
    }
    g.computeVertexNormals();
    return g;
  });
}

// Five round white petals round a yellow heart (petals closed in the bud
// as the base shape, open as the morph).
function flowerGeometry() {
  return once('strawberry-flower-geo', () => {
    const parts = [];
    const white = [0.97, 0.97, 0.95];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const petal = (open) => (u, v, o) => {
        const L = 0.0115;
        const hw = 0.0062 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.82 + 0.1)), 0.6);
        const x = (u - 0.5) * 2 * hw;
        const tilt = lerp(0.25, 1.38, open) - v * lerp(0.1, 0.12, open);
        const r = 0.0028 + Math.sin(tilt) * v * L;
        const y = 0.0012 + Math.cos(tilt) * v * L + Math.abs(x) * lerp(0.4, 0.25, open) * 0.4;
        o.set(ca * r - sa * x, y, sa * r + ca * x);
      };
      parts.push(colorize(leafGrid(3, 4, petal(0), petal(1)), (x, y, z) => {
        const r = Math.hypot(x, z);
        return r < 0.004 ? [0.9, 0.93, 0.78] : white;
      }));
    }
    // heart: a green-gold dome ringed with yellow stamens
    const dome = new THREE.SphereGeometry(0.0033, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.75, 1);
    dome.translate(0, 0.0008, 0);
    parts.push(colorize(still(dome), () => [0.72, 0.78, 0.25]));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const s = new THREE.SphereGeometry(0.00062, 5, 4);
      s.translate(Math.cos(a) * 0.0041, 0.0019, Math.sin(a) * 0.0041);
      parts.push(colorize(still(s), () => [1.0, 0.78, 0.12]));
    }
    for (const g of parts) setPlantAttr(g, () => [0, 0]);
    const geo = makeRelative(mergeGeometries(parts.map(withUV)));
    geo.computeBoundingSphere();
    return geo;
  });
}

// Ten pointed green sepals: a closed bud, an open star (1), reflexed back on
// a ripe berry (influence 1.4).
function calyxGeometry() {
  return once('strawberry-calyx-geo', () => {
    const parts = [];
    for (let i = 0; i < 10; i++) {
      const big = i % 2 === 0;
      const a = (i / 10) * Math.PI * 2 + (big ? 0 : 0.15);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const L = big ? 0.0085 : 0.006;
      const sepal = (open) => (u, v, o) => {
        const hw = (big ? 0.0022 : 0.0014) * Math.pow(1 - v, 0.9) * Math.min(1, v * 6 + 0.35);
        const x = (u - 0.5) * 2 * hw;
        const tilt = lerp(0.12, 1.45, open) + v * lerp(0.05, 0.3, open);
        const r = 0.0022 + Math.sin(tilt) * v * L;
        const y = -0.0005 + Math.cos(tilt) * v * L;
        o.set(ca * r - sa * x, y, sa * r + ca * x);
      };
      parts.push(leafGrid(1, 3, sepal(0), sepal(1)));
    }
    for (const g of parts) setPlantAttr(g, () => [0, 0.3]);
    const geo = makeRelative(mergeGeometries(parts));
    geo.computeBoundingSphere();
    return geo;
  });
}

// The bare-root crown: a brown knob with old leaf bases and wiry roots.
function crownParts() {
  return once('strawberry-crown', () => {
    const rnd = mulberry32(17);
    const parts = [];
    const knob = new THREE.SphereGeometry(0.0075, 10, 8);
    knob.scale(1, 1.25, 1);
    parts.push(colorize(knob.toNonIndexed(), () => [0.1, 0.06, 0.035]));
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const c = new THREE.ConeGeometry(0.0022, 0.009, 5);
      c.rotateZ(-0.5 - rnd() * 0.4);
      c.translate(0.004, 0.006, 0);
      c.rotateY(a);
      parts.push(colorize(c.toNonIndexed(), () => [0.17, 0.1, 0.05]));
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const len = 0.02 + rnd() * 0.03;
      const pts = [];
      for (let k = 0; k <= 5; k++) {
        const s = k / 5;
        pts.push(new THREE.Vector3(Math.cos(a) * (0.005 + s * len * 0.8), -0.004 - s * len * 0.35 + Math.sin(s * 6 + i) * 0.001, Math.sin(a) * (0.005 + s * len * 0.8)));
      }
      const t = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.0006 * (1 - 0.3 * rnd()), 3, false);
      parts.push(colorize(t.toNonIndexed(), () => [0.06, 0.035, 0.02]));
    }
    const geo = mergeGeometries(parts.map((g) => {
      g.deleteAttribute('uv');
      return g;
    }));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    return { geo, mat };
  });
}

function leafGeometry() {
  return once('strawberry-leaf-geo', () => {
    const size = 0.05;
    const common = { size, width: size * 0.78, uv: LEAF_UV, grid: [4, 5], crease: [1.3, 0.22], droop: [-0.05, 0.1], cup: [0, 0.06], psi: [0, 0.12], level: [0, 0.82], lift: [0, 0.2], foldScale: 0.7, foldWidth: 0.55 };
    return buildLeaf({
      flexLen: 0.3,
      spine: {
        length: 0.1,
        folded: 0.65,
        seg: 10,
        arch: (s, open) => lerp(0.04, 0.12 + 0.55 * s * s, open),
        radius: (s) => lerp(0.0016, 0.001, s),
        uv: STEM_UV,
        thick: 0.5,
      },
      leaflets: [
        { ...common, s: 1, side: 0, stalk: [0.001, 0.004] },
        { ...common, s: 0.985, side: -1, phi: [0.12, 1.05], stalk: [0, 0.0015], size: size * 0.95 },
        { ...common, s: 0.985, side: 1, phi: [0.12, 1.05], stalk: [0, 0.0015], size: size * 0.95 },
      ],
    });
  });
}

// ------------------------------------------------------------ materials

function materials() {
  return once('strawberry-mats', () => {
    const lt = leafTextures();
    const leaf = vegLeaf('strawberry', { map: lt.map, normalMap: lt.normalMap, normalScale: 1.1, alphaTest: 0.5, translucency: 0.42, roughness: 0.55 });
    const stalk = vegStem('strawberry-stalk', { color: '#7f9148', roughness: 0.6 });
    const sepal = vegLeaf('strawberry-sepal', { color: '#4c7e2e', translucency: 0.45, roughness: 0.5 });
    const petal = petalMaterial({ color: '#ffffff', vertexColors: true, translucency: 0.85, roughness: 0.45 });
    // flower heart and petals sway with their stalk: see vegLeaf
    const flower = addFlex(petal);
    const bt = berryTextures();
    const berry = new THREE.MeshPhysicalMaterial({ map: bt.map, normalMap: bt.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.7 });
    berry.userData.kind = 'strawberry';
    rigidSway(berry, (shader) => {
      // flesh colour from the instance colour, seeds from the mask: green
      // on unripe berries, golden on red ones
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `vec4 bTex = texture2D(map, vMapUv);
  #ifdef USE_COLOR
    vec3 flesh = vColor.rgb;
  #else
    vec3 flesh = vec3(1.0);
  #endif
  float ripe = clamp((flesh.r - flesh.g) * 1.6, 0.0, 1.0);
  vec3 seedCol = mix(vec3(0.36, 0.5, 0.14), vec3(0.62, 0.42, 0.1), ripe);
  diffuseColor.rgb = mix(flesh * bTex.r, seedCol, bTex.g);`,
        )
        .replace('#include <color_fragment>', '');
    });
    return { leaf, stalk, sepal, flower, berry };
  });
}

function addFlex(m) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('attribute vec2 aPlant;', 'attribute vec2 aPlant;\nattribute vec2 aVegFlex;')
      .replace('windSway(wp, aPlant.x)', 'windSway(wp, aPlant.x * (1.0 + aVegFlex.x) + aVegFlex.y)');
  };
  const key = m.customProgramCacheKey?.() ?? '';
  m.customProgramCacheKey = () => `${key}-vegflex`;
  return m;
}

// ripening colours of the flesh
const RIPE = [
  [0, hex('#9dbd5c')],
  [0.3, hex('#dfe6bb')],
  [0.55, hex('#f3d8c0')],
  [0.72, hex('#ee7a68')],
  [0.87, hex('#d3141f')],
  [1, hex('#a90a16')],
].map(([k, c]) => [k, new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace)]);
function ripeColor(k, out) {
  for (let i = 1; i < RIPE.length; i++) {
    if (k <= RIPE[i][0]) {
      const a = RIPE[i - 1];
      const b = RIPE[i];
      return out.copy(a[1]).lerp(b[1], (k - a[0]) / (b[0] - a[0]));
    }
  }
  return out.copy(RIPE[RIPE.length - 1][1]);
}

// ------------------------------------------------------------ the plant

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const flexAt = (m) => (m / 0.4) * (m / 0.4);

export function createStrawberry({ seed = 1, quality } = {}) {
  const rng = mulberry32(seed);
  const shadows = quality?.shadows !== false;
  const NL = quality?.tier === 'low' ? 9 : 12;
  const NB = quality?.tier === 'low' ? 4 : 5;
  const mats = materials();

  const object = new THREE.Group();
  object.name = 'strawberry';
  const bed = new SeedBed({ seed, radius: 0.03, height: 0.0065, shadows });
  object.add(bed.object);

  const crown = crownParts();
  const crownMesh = new THREE.Mesh(crown.geo, crown.mat);
  crownMesh.position.y = -0.004;
  crownMesh.rotation.y = rng() * 6;
  crownMesh.castShadow = shadows;
  object.add(crownMesh);

  const aerial = new THREE.Group();
  object.add(aerial);

  // leaves
  const leaf = leafGeometry();
  const leafGeo = shareGeometry(leaf.geo);
  const leafFlex = new THREE.InstancedBufferAttribute(new Float32Array(NL * 2), 2);
  leafGeo.setAttribute('aVegFlex', leafFlex);
  const leaves = new THREE.InstancedMesh(leafGeo, mats.leaf, NL);
  leaves.castShadow = shadows;
  leaves.receiveShadow = true;
  leaves.frustumCulled = false;
  aerial.add(leaves);
  const lf = [];
  const yaw0 = rng() * Math.PI * 2;
  for (let i = 0; i < NL; i++) {
    const k = i / (NL - 1);
    lf.push({
      t0: 0.15 + 0.42 * Math.pow(k, 0.9),
      size: lerp(0.62, 1.0, Math.min(1, i / 3)) * (0.8 + rng() * 0.3),
      yaw: yaw0 + i * 2.39996 + (rng() - 0.5) * 0.35,
      tilt: lerp(1.1, 0.35, k) + (rng() - 0.5) * 0.2,
      twist: (rng() - 0.5) * 0.5,
    });
  }

  // flower stalks, flowers, calyces and berries, one slot per blossom
  const stalks = new TubeSet(Array.from({ length: NB }, () => ({ segs: 10, radial: 4, thick: 0.5 })));
  const stalkMesh = new THREE.Mesh(stalks.geometry, mats.stalk);
  stalkMesh.castShadow = shadows;
  stalkMesh.frustumCulled = false;
  aerial.add(stalkMesh);
  const slotMesh = (geo, mat) => {
    const g2 = shareGeometry(geo);
    const fa = new THREE.InstancedBufferAttribute(new Float32Array(NB * 2), 2);
    g2.setAttribute('aVegFlex', fa);
    const m = new THREE.InstancedMesh(g2, mat, NB);
    m.castShadow = shadows;
    m.frustumCulled = false;
    m.userData.src = geo;
    m.userData.flex = fa;
    aerial.add(m);
    return m;
  };
  const flowers = slotMesh(flowerGeometry(), mats.flower);
  const calyx = slotMesh(calyxGeometry(), mats.sepal);
  const berries = slotMesh(berryGeometry(), mats.berry);
  berries.receiveShadow = true;
  for (let i = 0; i < NB; i++) berries.setColorAt(i, _c.set(1, 1, 1));
  const sl = [];
  const byaw = rng() * Math.PI * 2;
  for (let k = 0; k < NB; k++) {
    sl.push({
      t0: 0.6 + 0.022 * k,
      yaw: byaw + (k / NB) * Math.PI * 2 * 0.8 + (rng() - 0.5) * 0.5,
      reach: 0.06 + rng() * 0.035,
      height: 0.075 + rng() * 0.03,
      size: 0.85 + rng() * 0.25,
      spin: rng() * 6,
      ripeAt: 0.95 + rng() * 0.04,
      end: new THREE.Vector3(),
      axis: new THREE.Vector3(0, 1, 0),
      flex: 0,
      berry: 0,
      ripe: 0,
    });
  }
  const dummy = { morphTargetInfluences: [0] };

  const wobble = new Wobble({ stiffness: 40, damping: 3.4, amount: 0.1 });
  let g = 0;
  let built = -1;
  let pick = null; // harvest in progress
  let picked = false; // berries taken: none until the plant regrows past them

  function apply() {
    built = g;
    if (g < 0.78) picked = false;
    bed.set(g);
    crownMesh.visible = g < 0.5;

    for (let i = 0; i < NL; i++) {
      const f = lf[i];
      const grown = smooth(f.t0, f.t0 + 0.22, g);
      const open = smooth(f.t0 + 0.04, f.t0 + 0.2, g);
      const size = Math.max(1e-4, grown * f.size * lerp(0.6, 1, smooth(0.35, 0.8, g)));
      _q.setFromAxisAngle(Y, f.yaw);
      _q2.setFromAxisAngle(X, lerp(0.05, f.tilt, open));
      _q.multiply(_q2);
      _q2.setFromAxisAngle(Y, f.twist * open);
      _q.multiply(_q2);
      _v.set(0, lerp(-0.012, 0.001, smooth(f.t0, f.t0 + 0.08, g)), 0);
      _s.setScalar(size);
      _m.compose(_v, _q, _s);
      leaves.setMatrixAt(i, _m);
      dummy.morphTargetInfluences[0] = open;
      leaves.setMorphAt(i, dummy);
      leafFlex.setXY(i, size * size - 1, 0);
    }
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.morphTexture) leaves.morphTexture.needsUpdate = true;
    leafFlex.needsUpdate = true;
    leaves.visible = g > 0.12;
    placeBlossoms(0);
  }

  // stalk shape for one blossom: rises, arches out, sinks under a berry
  function placeBlossoms(tug) {
    for (let k = 0; k < NB; k++) {
      const s = sl[k];
      const grow1 = smooth(s.t0, s.t0 + 0.08, g);
      const heavy = picked ? 0 : smooth(0.82, 0.96, g);
      const lift = pick ? tug * 0.012 : 0;
      const reach = s.reach * lerp(0.75, 1.15, heavy);
      const top = lerp(s.height, 0.045, heavy);
      const endY = lerp(s.height * 0.95, 0.036, heavy) + lift;
      const cy = Math.cos(s.yaw);
      const sy = Math.sin(s.yaw);
      const pts = stalks.points[k];
      const n = pts.length - 1;
      let len = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        // quadratic curve: crown -> high control point -> end
        const a = (1 - t) * (1 - t);
        const b = 2 * t * (1 - t);
        const c = t * t;
        const r = (b * reach * 0.3 + c * reach) * grow1;
        const y = (b * top * 1.25 + c * endY) * grow1 - 0.004 * (1 - t);
        pts[i].set(sy * r, y, cy * r);
        if (i) len += pts[i].distanceTo(pts[i - 1]);
      }
      stalks.set(k, (t) => lerp(0.0012, 0.0008, t) * (grow1 > 0 ? 1 : 0), pts, flexAt);
      s.end.copy(pts[n]);
      s.flex = flexAt(len);
      _v.subVectors(pts[n], pts[n - 1]).normalize();
      // flowers face out and up; berries hang
      _v2.copy(_v).addScaledVector(Y, 0.5).normalize();
      const hang = smooth(0.8, 0.9, g) * (picked ? 0 : 1);
      s.axis.copy(_v2).lerp(_v.clone().lerp(DOWN, 0.75), hang).normalize();

      const bud = smooth(s.t0 + 0.02, s.t0 + 0.07, g);
      const bloom = smooth(s.t0 + 0.07, s.t0 + 0.15, g);
      const fall = smooth(0.8 + 0.008 * k, 0.85 + 0.008 * k, g);
      const fsize = grow1 > 0.01 ? bud * (1 - fall) * s.size : 0;
      _q.setFromUnitVectors(Y, s.axis);
      _q2.setFromAxisAngle(Y, s.spin);
      _q.multiply(_q2);
      _s.setScalar(Math.max(1e-4, fsize * lerp(0.55, 1, bloom)));
      _m.compose(s.end, _q, _s);
      flowers.setMatrixAt(k, _m);
      dummy.morphTargetInfluences[0] = bloom;
      flowers.setMorphAt(k, dummy);
      flowers.userData.flex.setXY(k, -1, s.flex);

      const csize = grow1 > 0.01 ? Math.max(bud, 0.4) * s.size : 0;
      _s.setScalar(Math.max(1e-4, csize));
      _m.compose(s.end, _q, _s);
      calyx.setMatrixAt(k, _m);
      dummy.morphTargetInfluences[0] = bloom + smooth(0.82, 0.95, g) * 0.35;
      calyx.setMorphAt(k, dummy);
      calyx.userData.flex.setXY(k, -1, s.flex);

      s.berry = picked ? 0 : smooth(0.8, 0.95, g);
      s.ripe = smooth(0.84, s.ripeAt, g);
      const bs = s.berry > 0.001 ? lerp(0.22, 1, s.berry) * s.size : 1e-4;
      _s.set(bs * lerp(1, 0.94, s.berry), bs * lerp(0.8, 1, s.berry), bs);
      _m.compose(s.end, _q, _s);
      berries.setMatrixAt(k, _m);
      berries.setColorAt(k, ripeColor(s.ripe, _c));
      berries.userData.flex.setXY(k, 0, s.flex);
    }
    stalks.commit();
    for (const m of [flowers, calyx, berries]) {
      m.instanceMatrix.needsUpdate = true;
      m.userData.flex.needsUpdate = true;
      if (m.morphTexture) m.morphTexture.needsUpdate = true;
    }
    berries.instanceColor.needsUpdate = true;
    stalkMesh.visible = g > 0.6;
    berries.visible = g > 0.8 && !picked;
  }

  // ---------------------------------------------------------- harvest

  function buildItem() {
    // the ripe berries with their calyces, as a little cluster in world space
    aerial.updateWorldMatrix(true, true);
    const ripe = sl.filter((s) => s.berry > 0.5);
    const n = Math.max(1, ripe.length);
    const bGeo = shareGeometry(berryGeometry());
    const bFlex = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    bGeo.setAttribute('aVegFlex', bFlex);
    const cGeo = shareGeometry(calyxGeometry());
    const b = new THREE.InstancedMesh(bGeo, mats.berry, n);
    const c = new THREE.InstancedMesh(cGeo, mats.sepal, n);
    b.castShadow = c.castShadow = shadows;
    const centre = new THREE.Vector3();
    for (const s of ripe) centre.add(s.end);
    centre.multiplyScalar(1 / n);
    const item = new THREE.Group();
    item.name = 'strawberry-harvest';
    item.position.copy(centre).applyMatrix4(aerial.matrixWorld);
    item.quaternion.setFromRotationMatrix(_m.extractRotation(aerial.matrixWorld));
    ripe.forEach((s, i) => {
      const k = sl.indexOf(s);
      berries.getMatrixAt(k, _m);
      _m.elements[12] -= centre.x;
      _m.elements[13] -= centre.y;
      _m.elements[14] -= centre.z;
      b.setMatrixAt(i, _m);
      b.setColorAt(i, ripeColor(s.ripe, _c));
      calyx.getMatrixAt(k, _m);
      _m.elements[12] -= centre.x;
      _m.elements[13] -= centre.y;
      _m.elements[14] -= centre.z;
      c.setMatrixAt(i, _m);
      c.setMorphAt(i, { morphTargetInfluences: [1.35] });
    });
    c.frustumCulled = b.frustumCulled = false;
    item.add(b, c);
    item.updateMatrixWorld(true);
    item.userData = {
      kind: 'strawberry',
      count: ripe.length,
      size: { length: BERRY_L, width: BERRY_R * 2 },
      velocity: new THREE.Vector3(0, 0.35, 0),
      dispose: () => {
        disposeShared(bGeo, berryGeometry());
        disposeShared(cGeo, calyxGeometry());
        b.dispose();
        c.dispose();
      },
    };
    return item;
  }

  function updatePick(dt) {
    pick.t += dt;
    const t = pick.t;
    if (!pick.freed) {
      // the berries are drawn gently up and out, then snap free
      const tug = smooth(0, 0.28, t) * (1 + Math.sin(t * 40) * 0.08);
      placeBlossoms(tug);
      if (t >= 0.32) {
        pick.freed = true;
        const item = buildItem();
        toWorld(item);
        picked = true;
        placeBlossoms(0);
        wobble.poke(0.8);
        pick.onFree?.(item);
      }
    } else if (t > 1.5) {
      pick = null;
    }
  }

  // ---------------------------------------------------------- targets

  const tg = Array.from({ length: 2 + NB }, () => ({ pos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), plant: null, kind: 'leaf', color: '#3b7026' }));

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
      let j = 0;
      for (const i of [NL - 1, NL - 3]) {
        const f = lf[i];
        if (smooth(f.t0 + 0.04, f.t0 + 0.2, g) < 0.8) continue;
        leaves.getMatrixAt(i, _m);
        const t = tg[j++];
        t.pos.copy(leaf.tips[0]).applyMatrix4(_m).applyMatrix4(aerial.matrixWorld);
        t.plant = plant;
        out.push(t);
      }
      for (let k = 0; k < NB; k++) {
        const s = sl[k];
        const bloom = smooth(s.t0 + 0.07, s.t0 + 0.15, g) * (1 - smooth(0.8, 0.84, g));
        const fruit = !picked && s.berry > 0.6;
        if (bloom < 0.7 && !fruit) continue;
        const t = tg[2 + k];
        t.kind = fruit ? 'fruit' : 'bloom';
        t.color = fruit ? '#d8262c' : '#ffffff';
        t.pos.copy(s.axis).multiplyScalar(fruit ? 0.012 : 0.002).add(s.end).applyMatrix4(aerial.matrixWorld);
        t.normal.copy(fruit ? Y : s.axis);
        t.plant = plant;
        out.push(t);
      }
    },
    get hitRadius() {
      return grow(0.06, 0.15, smooth(0.2, 0.7, g));
    },
    get hitHeight() {
      return grow(0.05, 0.18, smooth(0.2, 0.7, g));
    },
    harvestable: () => g >= 1 && !picked && !pick,
    harvest(onFree) {
      if (g < 1 || picked || pick) return { remove: false, regrowTo: g };
      pick = { t: 0, onFree, freed: false };
      return { remove: false, regrowTo: 0.72 };
    },
    poke() {
      wobble.poke(1);
    },
    dispose() {
      stalks.geometry.dispose();
      disposeShared(leafGeo, leaf.geo);
      leaves.dispose();
      for (const m of [flowers, calyx, berries]) {
        disposeShared(m.geometry, m.userData.src);
        m.dispose();
      }
      bed.dispose();
    },
  };
}

void leafMaterial;
