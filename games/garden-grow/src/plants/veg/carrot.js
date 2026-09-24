// Carrot: tiny ribbed seeds in the hole, a thread-thin hooked shoot with two
// grass-like seed leaves, then a rosette of feathery, finely divided fronds
// (instanced; each frond is a stalk carrying alpha-cut pinnae that unfold
// from a folded bud). Underground a tapered orange root swells until its
// green-bronze shoulder shows at the soil. Harvest is the pull: the fronds
// are gripped and tugged, the carrot wobbles, and then it pops free.
import * as THREE from 'three';
import { smooth, lerp, clamp, mulberry32, REDUCED_MOTION } from '../../config.js';
import { SeedBed } from './soil.js';
import { TubeSet, leafGrid, staticTube, mergeGeometries, setPlantAttr, makeRelative, crumbGeometry } from './geom.js';
import { carrotFrondTexture, carrotRootTextures, CARROT_STEM_UV, CARROT_PINNA_UV, soilTextures, once } from './tex.js';
import { vegLeaf, vegStem } from './mats.js';
import { Wobble, hookCurve, shareGeometry, disposeShared, toWorld, grow } from './kit.js';

const ROOT_LEN = 0.165;
const ROOT_R = 0.0135;
const FROND_LEN = 0.24;
const HYPO_BASE = new THREE.Vector3(0, -0.01, 0);

const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// ------------------------------------------------------------ shared parts

// One frond: stalk and rachis as a thin tube, pinna cards in pairs along
// the rachis. Built twice (folded bud / open) for the unfurl morph.
function frondGeometry() {
  return once('carrot-frond-geo', () => {
    const rnd = mulberry32(21);
    const SEG = 16;
    const PAIRS = 7;
    const spine = (open) => {
      const L = FROND_LEN * lerp(0.72, 1, open);
      const pts = [];
      const tan = [];
      let y = 0;
      let z = 0;
      const ds = L / SEG;
      for (let i = 0; i <= SEG; i++) {
        const s = i / SEG;
        const th = lerp(0.03 + 0.2 * s * s, 0.1 + 1.05 * Math.pow(s, 1.7), open);
        if (i > 0) {
          y += Math.cos(th) * ds;
          z += Math.sin(th) * ds;
        }
        pts.push(new THREE.Vector3(0, y, z));
        tan.push(new THREE.Vector3(0, Math.cos(th), Math.sin(th)));
      }
      return { pts, tan, L };
    };
    const sample = (sp, s) => {
      const f = s * SEG;
      const i = Math.min(SEG - 1, Math.floor(f));
      const k = f - i;
      return {
        p: sp.pts[i].clone().lerp(sp.pts[i + 1], k),
        t: sp.tan[i].clone().lerp(sp.tan[i + 1], k).normalize(),
      };
    };
    const folded = spine(0);
    const open = spine(1);
    const radius = (s) => lerp(0.0012, 0.0003, Math.pow(s, 0.7)) * (s < 0.06 ? 1 + (0.06 - s) * 14 : 1);
    const flex = (m) => Math.pow(m / 0.3, 2);
    const parts = [staticTube(folded.pts, radius, 4, CARROT_STEM_UV, open.pts, flex, 0.35)];

    // pinna cards
    const nodes = [];
    for (let k = 0; k < PAIRS; k++) {
      const s = 0.3 + (0.6 * k) / PAIRS;
      const size = 0.068 * (1 - 0.58 * (k / PAIRS)) * (0.9 + rnd() * 0.2);
      nodes.push({ s, side: -1, size, jit: rnd() });
      nodes.push({ s: s + 0.018, side: 1, size: size * (0.92 + rnd() * 0.12), jit: rnd() });
    }
    nodes.push({ s: 0.95, side: 0, size: 0.042, jit: rnd() });
    const X = new THREE.Vector3(1, 0, 0);
    const card = (node, openK, sp, out) => {
      const { p, t } = sample(sp, node.s);
      const U = new THREE.Vector3(0, t.z, -t.y); // upper (adaxial) side of the rachis
      const phi = node.side === 0 ? 0 : lerp(0.14, 0.8 + node.jit * 0.25, openK);
      const D = t.clone().multiplyScalar(Math.cos(phi)).addScaledVector(X, Math.sin(phi) * node.side).normalize();
      const W = new THREE.Vector3().crossVectors(D, U).normalize();
      const Nc = new THREE.Vector3().crossVectors(W, D).normalize();
      // tip the outer edge up a little
      const psi = (node.side || 1) * lerp(0.15, 0.3 + node.jit * 0.2, openK);
      W.applyAxisAngle(D, psi);
      Nc.applyAxisAngle(D, psi);
      const L = node.size * lerp(0.7, 1, openK);
      const Wd = L * 0.92 * lerp(0.55, 1, openK);
      const crease = lerp(1.15, 0.22, openK);
      const droop = lerp(-0.12, 0.22 + node.jit * 0.1, openK);
      return (u, v, o) => {
        const x = (u - 0.5) * Wd;
        o.copy(p)
          .addScaledVector(D, v * L)
          .addScaledVector(W, x * Math.cos(crease))
          .addScaledVector(Nc, Math.abs(x) * Math.sin(crease) - droop * L * v * v);
        void out;
      };
    };
    for (const node of nodes) {
      const g = leafGrid(2, 3, card(node, 0, folded), card(node, 1, open), CARROT_PINNA_UV);
      const base = node.s * FROND_LEN;
      setPlantAttr(g, (x, y, z, u, v) => [flex(base + ((v - CARROT_PINNA_UV[1]) / (CARROT_PINNA_UV[3] - CARROT_PINNA_UV[1])) * node.size), 0]);
      parts.push(g);
    }
    const geo = makeRelative(mergeGeometries(parts));
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 0.05;
    const tip = open.pts[SEG].clone();
    return { geo, tip };
  });
}

// The two strap-shaped seed leaves, pressed together in the hook, then
// spread into a V.
function cotyledonGeometry() {
  return once('carrot-coty-geo', () => {
    const L = 0.026;
    const blade = (side) => (openK) => (u, v, o) => {
      const a = lerp(0.04, 0.95, openK);
      const len = L * lerp(0.75, 1, openK);
      const hw = 0.0013 * Math.pow(Math.sin(Math.PI * clamp(v * 0.96 + 0.04, 0, 1)), 0.55);
      // along the blade, arching over at the tip once open
      const bend = a + v * v * lerp(0.05, 0.5, openK);
      const along = v * len;
      o.set(side * Math.sin(bend) * along, Math.cos(bend) * along * lerp(1, 0.92, openK), (u - 0.5) * 2 * hw);
    };
    const parts = [-1, 1].map((side) => leafGrid(1, 6, blade(side)(0), blade(side)(1), CARROT_STEM_UV));
    for (const g of parts) setPlantAttr(g, () => [0.02, 0]);
    const geo = makeRelative(mergeGeometries(parts));
    return geo;
  });
}

// The tapered root with a rounded shoulder, fine rootlets and clinging
// crumbs. Top of the shoulder at y = 0, tip at -ROOT_LEN.
function rootParts() {
  return once('carrot-root-geo', () => {
    const rnd = mulberry32(8);
    const SEG = 40;
    const pts = [];
    const ss = [];
    for (let i = 0; i <= SEG; i++) {
      const s = Math.pow(i / SEG, 1.3);
      ss.push(s);
      pts.push(new THREE.Vector3(0.0035 * Math.sin(Math.PI * s) + 0.0015 * Math.sin(Math.PI * 2 * s + 0.4), -s * ROOT_LEN, 0.0015 * Math.sin(Math.PI * s * 1.5)));
    }
    const radius = (k) => {
      const s = ss[Math.round(k * SEG)];
      const x = clamp(s / 0.05, 0, 1);
      const shoulder = Math.sqrt(x * (2 - x));
      const taper = Math.pow(Math.max(0, 1 - Math.pow(s, 1.55)), 0.8);
      const rings = 1 - 0.018 * Math.max(0, Math.sin(s * 190));
      return Math.max(0.0005 * (s > 0.5 ? 1 : 0), ROOT_R * shoulder * taper * rings);
    };
    const geo = staticTube(pts, radius, 14, [0, 1, 1, 0]);
    geo.deleteAttribute('aPlant');
    geo.computeBoundingSphere();

    // rootlets: fine, pale, mostly on the lower two thirds
    const hp = [];
    const hu = [];
    const hn = [];
    for (let i = 0; i < 46; i++) {
      const s = 0.14 + rnd() * 0.8;
      const k = Math.round((Math.pow(s, 1 / 1.3)) * SEG) / SEG;
      const c = pts[Math.round(k * SEG)];
      const r = radius(k) * 0.96;
      const a = rnd() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), -0.4 - rnd() * 0.8, Math.sin(a)).normalize();
      const len = 0.003 + rnd() * 0.01;
      const w = 0.00022;
      const root = new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      const tip = root.clone().addScaledVector(dir, len);
      tip.y -= len * 0.3;
      for (const side of [new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), new THREE.Vector3(0, 1, 0)]) {
        const q = [root.clone().addScaledVector(side, -w), root.clone().addScaledVector(side, w), tip];
        for (const v of q) hp.push(v.x, v.y, v.z);
        hu.push(0, 0, 1, 0, 0.5, 1);
        const n = new THREE.Vector3().crossVectors(side, dir).normalize();
        for (let j = 0; j < 3; j++) hn.push(n.x, n.y, n.z);
      }
    }
    const hairs = new THREE.BufferGeometry();
    hairs.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    hairs.setAttribute('normal', new THREE.Float32BufferAttribute(hn, 3));
    hairs.setAttribute('uv', new THREE.Float32BufferAttribute(hu, 2));

    // crumbs stuck on the root (only seen once it is pulled)
    const cl = [];
    for (let i = 0; i < 11; i++) {
      const s = 0.06 + rnd() * 0.62;
      const k = Math.round(Math.pow(s, 1 / 1.3) * SEG) / SEG;
      const c = pts[Math.round(k * SEG)];
      const r = radius(k);
      const a = rnd() * Math.PI * 2;
      const size = 0.0012 + rnd() * rnd() * 0.0028;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(c.x + Math.cos(a) * (r + size * 0.2), c.y, c.z + Math.sin(a) * (r + size * 0.2)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)),
        new THREE.Vector3(size, size, size),
      );
      cl.push(m);
    }
    const { map, normalMap } = carrotRootTextures();
    const rootMat = new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.48, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.9, 0.6, 0.35) });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#d9b98e', roughness: 0.8, side: THREE.DoubleSide });
    const soil = soilTextures();
    const crumbMat = new THREE.MeshStandardMaterial({ map: soil.map, color: '#8a6a52', roughness: 0.95, flatShading: true });
    return { geo, hairs, crumbs: cl, crumbGeo: crumbGeometry(9), rootMat, hairMat, crumbMat };
  });
}

function seedParts() {
  return once('carrot-seed', () => {
    const rnd = mulberry32(4);
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.SphereGeometry(1, 8, 5);
      g.scale(0.0015, 0.0006, 0.00085);
      g.rotateY(rnd() * 6);
      g.translate((rnd() - 0.5) * 0.008, 0.0007, (rnd() - 0.5) * 0.008);
      g.deleteAttribute('uv');
      parts.push(g);
    }
    const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#6e5436', roughness: 0.85 });
    return { geo, mat };
  });
}

// ------------------------------------------------------------ the plant

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

export function createCarrot({ seed = 1, quality } = {}) {
  const rng = mulberry32(seed);
  const shadows = quality?.shadows !== false;
  const F = quality?.tier === 'low' ? 7 : 9;
  const motion = () => (REDUCED_MOTION.matches ? 0.4 : 1);

  const object = new THREE.Group();
  object.name = 'carrot';
  const bed = new SeedBed({ seed, radius: 0.02, height: 0.0048, shadows });
  object.add(bed.object);

  const seeds = seedParts();
  const seedMesh = new THREE.Mesh(seeds.geo, seeds.mat);
  object.add(seedMesh);

  // everything above the soil sways and wobbles about the crown
  const aerial = new THREE.Group();
  object.add(aerial);

  // hypocotyl (the seedling stem) and its seed leaves
  const hypo = new TubeSet([{ segs: 14, radial: 5, thick: 0.5 }]);
  const hypoMesh = new THREE.Mesh(hypo.geometry, vegStem('carrot-hypo', { color: '#9aab6c', roughness: 0.55 }));
  hypoMesh.castShadow = shadows;
  hypoMesh.frustumCulled = false;
  aerial.add(hypoMesh);
  const frondTex = carrotFrondTexture();
  const leafMat = vegLeaf('carrot', { map: frondTex.map, alphaTest: 0.45, translucency: 0.6, roughness: 0.62, normalScale: 0.6 });
  const coty = new THREE.Mesh(cotyledonGeometry(), leafMat);
  coty.castShadow = shadows;
  coty.morphTargetInfluences = [0];
  aerial.add(coty);

  // the fronds
  const frond = frondGeometry();
  const frondGeo = shareGeometry(frond.geo);
  const flexAttr = new THREE.InstancedBufferAttribute(new Float32Array(F * 2), 2);
  frondGeo.setAttribute('aVegFlex', flexAttr);
  const fronds = new THREE.InstancedMesh(frondGeo, leafMat, F);
  fronds.castShadow = shadows;
  fronds.receiveShadow = true;
  fronds.frustumCulled = false;
  const dummy = { morphTargetInfluences: [0] };
  const fr = [];
  const yaw0 = rng() * Math.PI * 2;
  for (let i = 0; i < F; i++) {
    const k = i / (F - 1);
    fr.push({
      t0: 0.31 + 0.3 * Math.pow(k, 0.9),
      size: lerp(0.5, 1.02, Math.min(1, i / 3)) * (0.9 + rng() * 0.18),
      yaw: yaw0 + i * 2.39996 + (rng() - 0.5) * 0.4,
      tilt: lerp(0.62, 0.16, k) + (rng() - 0.5) * 0.14,
      twist: (rng() - 0.5) * 0.3,
      shake: rng() * 6,
    });
  }
  aerial.add(fronds);

  // the root, underground until harvest
  const rp = rootParts();
  const rootGroup = new THREE.Group();
  const rootMesh = new THREE.Mesh(rp.geo, rp.rootMat);
  rootMesh.receiveShadow = true;
  const hairMesh = new THREE.Mesh(rp.hairs, rp.hairMat);
  const cling = new THREE.InstancedMesh(rp.crumbGeo, rp.crumbMat, rp.crumbs.length);
  rp.crumbs.forEach((m, i) => cling.setMatrixAt(i, m));
  rootGroup.add(rootMesh, hairMesh, cling);
  rootGroup.rotation.y = rng() * Math.PI * 2;
  object.add(rootGroup);

  const wobble = new Wobble({ stiffness: 42, damping: 3.2, amount: 0.12 });
  const hookDir = [Math.cos(rng() * 6.28), Math.sin(rng() * 6.28)];
  let g = 0;
  let built = -1;
  let pull = null;
  let freed = false;
  let crownY = 0;
  let rootTopY = 0;

  function rootTop(gg) {
    return lerp(-0.003, 0.009, smooth(0.6, 1, gg));
  }

  function apply() {
    built = g;
    bed.set(g);
    seedMesh.visible = g < 0.08;
    if (freed) return;

    // hypocotyl: the hook pushes up, straightens, then contracts as the root
    // swells and draws the crown down to the soil
    const L = lerp(0.008, 0.032, smooth(0.08, 0.3, g)) - 0.028 * smooth(0.36, 0.62, g);
    const angle = Math.PI * (1 - smooth(0.19, 0.27, g));
    const pts = hookCurve(hypo.points[0], HYPO_BASE, L, Math.min(L, 0.008), angle, hookDir[0], hookDir[1]);
    const hr = lerp(0.00065, 0.0021, smooth(0.3, 0.58, g));
    hypo.set(0, (s) => hr * (1 - 0.35 * s), pts, (m) => Math.pow(m / 0.25, 2) * 0.3);
    hypo.commit();
    hypoMesh.visible = g > 0.1 && g < 0.66;
    rootTopY = rootTop(g);
    const tipY = pts[pts.length - 1].y;
    crownY = Math.max(tipY, rootTopY - 0.0015);

    // seed leaves ride on the hypocotyl tip, pointing along it
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    _v.subVectors(tip, prev).normalize();
    coty.position.copy(tip);
    coty.quaternion.setFromUnitVectors(Y, _v);
    const cs = lerp(0.35, 1, smooth(0.16, 0.34, g)) * (1 - smooth(0.52, 0.62, g));
    coty.scale.setScalar(Math.max(1e-4, cs));
    coty.morphTargetInfluences[0] = smooth(0.23, 0.34, g);
    coty.visible = g > 0.12 && cs > 0.01;

    // root
    const rs = lerp(0.12, 1, smooth(0.33, 0.97, g));
    const rl = lerp(0.15, 1, smooth(0.3, 0.9, g));
    rootGroup.visible = g > 0.3;
    rootGroup.position.y = rootTopY;
    rootGroup.scale.set(rs, rl, rs);
    placeFronds();
  }

  function placeFronds(time = 0) {
    const grip = pull ? smooth(0, 0.25, pull.t) : 0;
    const shakeAmp = pull ? pull.shake : 0;
    for (let i = 0; i < F; i++) {
      const f = fr[i];
      const grown = smooth(f.t0, f.t0 + 0.24, g);
      const open = smooth(f.t0 + 0.03, f.t0 + 0.2, g);
      const size = Math.max(1e-4, grown * f.size * lerp(0.55, 1, smooth(0.4, 0.9, g)));
      let tilt = lerp(0.02, f.tilt, open) * lerp(1, 0.35, grip);
      tilt += shakeAmp * Math.sin(time * 31 + f.shake) * 0.5;
      _q.setFromAxisAngle(Y, f.yaw + shakeAmp * Math.sin(time * 23 + f.shake) * 0.4);
      _q2.setFromAxisAngle(X, tilt);
      _q.multiply(_q2);
      _q2.setFromAxisAngle(Y, f.twist);
      _q.multiply(_q2);
      const r = 0.0022 * grown * (1 - grip * 0.6);
      _v.set(Math.sin(f.yaw) * r, crownY, Math.cos(f.yaw) * r);
      _s.setScalar(size);
      _m.compose(_v, _q, _s);
      fronds.setMatrixAt(i, _m);
      dummy.morphTargetInfluences[0] = open;
      fronds.setMorphAt(i, dummy);
      // small fronds are stiffer in metres: scale the sway with size
      flexAttr.setXY(i, size * size - 1, 0);
    }
    fronds.instanceMatrix.needsUpdate = true;
    if (fronds.morphTexture) fronds.morphTexture.needsUpdate = true;
    flexAttr.needsUpdate = true;
    fronds.visible = g > 0.3;
  }

  // ---------------------------------------------------------- harvest

  function buildItem() {
    // the whole carrot, fronds and all, in world space, origin at the crown
    const item = new THREE.Group();
    item.name = 'carrot-harvest';
    object.updateMatrixWorld(true);
    item.position.set(0, crownY, 0).applyMatrix4(aerial.matrixWorld);
    item.quaternion.setFromRotationMatrix(_m.extractRotation(aerial.matrixWorld));
    item.updateMatrixWorld(true);
    item.attach(rootGroup);
    item.attach(fronds);
    rootMesh.castShadow = shadows;
    item.userData = {
      kind: 'carrot',
      size: { length: ROOT_LEN + FROND_LEN, root: ROOT_LEN, width: ROOT_R * 2 },
      velocity: new THREE.Vector3(0, 0.55, 0),
      dispose: () => {
        disposeShared(frondGeo, frond.geo);
        fronds.dispose();
      },
    };
    return item;
  }

  function updatePull(dt) {
    const p = pull;
    p.t += dt;
    const t = p.t;
    const out = ROOT_LEN + 0.012;
    const m = motion();
    let lift;
    let shake;
    let heave;
    if (t < 0.32) {
      lift = 0.0035 * ease(t / 0.32);
      shake = 0.06;
      heave = 0.25 * ease(t / 0.32);
    } else if (t < 0.48) {
      lift = lerp(0.0035, 0.0018, ease((t - 0.32) / 0.16));
      shake = 0.025;
      heave = 0.15;
    } else if (t < 0.86) {
      const k = ease((t - 0.48) / 0.38);
      lift = lerp(0.0018, 0.014, k);
      shake = 0.08;
      heave = lerp(0.15, 0.7, k);
    } else {
      // pop: the soil lets go and the root slides out
      const k = easeOut(clamp((t - 0.86) / 0.16, 0, 1));
      lift = lerp(0.014, out, k);
      shake = 0.03 * (1 - k);
      heave = lerp(0.7, 0.3, k);
    }
    p.shake = shake * m;
    bed.lift = heave;
    bed.g = -1;
    bed.set(g);
    bed.hole.visible = t > 0.9;
    rootGroup.position.y = rootTopY + lift;
    crownY = rootTopY + lift - 0.0015;
    // the carrot rocks as it is worked loose
    const rock = p.shake * 0.8;
    aerial.rotation.x = wobble.x + Math.sin(t * 27) * rock;
    aerial.rotation.z = wobble.z + Math.sin(t * 21 + 1) * rock;
    rootGroup.rotation.x = aerial.rotation.x;
    rootGroup.rotation.z = aerial.rotation.z;
    rootGroup.position.x = -Math.sin(aerial.rotation.z) * lift;
    placeFronds(t);
    if (t >= 1.02 && !freed) {
      freed = true;
      aerial.rotation.set(0, 0, 0);
      const item = buildItem();
      hypoMesh.visible = false;
      coty.visible = false;
      toWorld(item);
      p.onFree?.(item);
    }
  }

  // ---------------------------------------------------------- targets

  const tg = [0, 1, 2].map(() => ({ pos: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), plant: null, kind: 'leaf', color: '#4f7f31' }));

  return {
    object,
    setGrowth(v) {
      g = v;
    },
    pending: () => built !== g && !freed,
    flush: apply,
    update(dt) {
      wobble.update(dt);
      if (pull && !freed) updatePull(dt);
      else if (!freed) {
        aerial.rotation.x = wobble.x;
        aerial.rotation.z = wobble.z;
      }
    },
    targets(out, plant) {
      if (freed || g < 0.2) return;
      aerial.updateWorldMatrix(true, false);
      if (g > 0.5) {
        // tips of the two biggest open fronds
        for (let j = 0; j < 2; j++) {
          const i = F - 1 - j * 2;
          const f = fr[i];
          if (smooth(f.t0 + 0.03, f.t0 + 0.2, g) < 0.7) continue;
          fronds.getMatrixAt(i, _m);
          const t = tg[j];
          t.pos.copy(frond.tip).multiplyScalar(0.8).applyMatrix4(_m).applyMatrix4(aerial.matrixWorld);
          t.plant = plant;
          out.push(t);
        }
      }
      if (g > 0.9) {
        const t = tg[2];
        t.kind = 'fruit';
        t.color = '#e8741c';
        t.pos.set(0, rootTopY + 0.002, 0.008).applyMatrix4(object.matrixWorld);
        t.plant = plant;
        out.push(t);
      }
    },
    get hitRadius() {
      return grow(0.06, 0.13, smooth(0.3, 0.7, g));
    },
    get hitHeight() {
      return grow(0.06, 0.27, smooth(0.25, 0.75, g));
    },
    harvestable: () => g >= 1 && !pull,
    harvest(onFree) {
      if (pull || g < 1) return { remove: false, regrowTo: g };
      pull = { t: 0, onFree, shake: 0 };
      return { remove: true, regrowTo: 0 };
    },
    poke() {
      wobble.poke(1);
    },
    dispose() {
      hypo.geometry.dispose();
      if (!freed) {
        disposeShared(frondGeo, frond.geo);
        fronds.dispose();
      }
      bed.dispose();
    },
  };
}
