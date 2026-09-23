// Decorations for the top of the cake: fruit, chocolate, macarons, piped
// rosettes, sprinkles and sugar pearls, all modelled in code. Each one sits on
// the cake as an ordinary object, or for the tiny ones as a batch, and
// travels with whichever piece it ends up on when the cake is cut.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

// ------------------------------------------------------------ helpers

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Merge geometries (each with position, normal and uv) into one.
export function merge(parts) {
  let verts = 0;
  let idx = 0;
  const list = parts.map((g) => {
    const n = g.attributes.position.count;
    const index = g.index ? Array.from(g.index.array) : Array.from({ length: n }, (_, i) => i);
    verts += n;
    idx += index.length;
    return { g, n, index };
  });
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const index = new Uint32Array(idx);
  let vo = 0;
  let io = 0;
  for (const { g, n, index: ix } of list) {
    pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
    for (let i = 0; i < ix.length; i++) index[io + i] = ix[i] + vo;
    vo += n;
    io += ix.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

const place = (g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) =>
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...p),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
      new THREE.Vector3(...s),
    ),
  );

// Sweep a 2D cross-section along a path. `section(t)` returns the outline
// points [x, y] at fraction t of the path; every call must return the same
// number of points.
export function sweep(path, section, { closed = false, capStart = true, capEnd = true } = {}) {
  const n = path.length;
  const tangents = path.map((p, i) => {
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  // parallel-transported frames
  const normals = [];
  let nrm = new THREE.Vector3(0, 1, 0);
  if (Math.abs(nrm.dot(tangents[0])) > 0.9) nrm.set(1, 0, 0);
  nrm.sub(tangents[0].clone().multiplyScalar(nrm.dot(tangents[0]))).normalize();
  normals.push(nrm.clone());
  for (let i = 1; i < n; i++) {
    const q = new THREE.Quaternion().setFromUnitVectors(tangents[i - 1], tangents[i]);
    nrm = nrm.clone().applyQuaternion(q).normalize();
    normals.push(nrm);
  }
  const pos = [];
  const uv = [];
  const index = [];
  let ring = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const sec = section(t);
    ring = sec.length;
    const T = tangents[i];
    const N = normals[i];
    const B = T.clone().cross(N);
    for (let j = 0; j < sec.length; j++) {
      const [x, y] = sec[j];
      const v = path[i].clone().addScaledVector(N, x).addScaledVector(B, y);
      pos.push(v.x, v.y, v.z);
      uv.push(t, j / sec.length);
    }
  }
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) {
    const a0 = i * ring;
    const b0 = ((i + 1) % n) * ring;
    for (let j = 0; j < ring; j++) {
      const j1 = (j + 1) % ring;
      index.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const cap = (row, flip, at) => {
    const c = pos.length / 3;
    pos.push(at.x, at.y, at.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < ring; j++) {
      const j1 = (j + 1) % ring;
      if (flip) index.push(c, row * ring + j1, row * ring + j);
      else index.push(c, row * ring + j, row * ring + j1);
    }
  };
  if (!closed && capStart) cap(0, true, path[0].clone().addScaledVector(tangents[0], -0.0004));
  if (!closed && capEnd) cap(n - 1, false, path[n - 1].clone().addScaledVector(tangents[n - 1], 0.0004));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export const circle = (r, k = 12) => Array.from({ length: k }, (_, i) => [Math.cos((i / k) * Math.PI * 2) * r, Math.sin((i / k) * Math.PI * 2) * r]);

// ------------------------------------------------------------ materials

// A soft, fleshy fruit: a little sheen of its own colour at grazing angles
// stands in for light scattering under the skin.
function fruit(colour, { sheen, roughness = 0.42, clearcoat = 0.4, seeds = false } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colour),
    roughness,
    clearcoat,
    clearcoatRoughness: 0.35,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(sheen || colour),
  });
  if (seeds) {
    // strawberry seeds sitting in little dimples
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFruit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFruit = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vFruit;\n${NOISE}\nfloat fSeed;`)
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
#include <map_fragment>
vec3 fw = worley(vFruit * 520.0);
fSeed = smoothstep(0.24, 0.12, fw.x);
float dimple = smoothstep(0.42, 0.18, fw.x);
diffuseColor.rgb *= 1.0 - dimple * 0.35;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.72, 0.3), fSeed);
// paler towards the shoulders
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.25, 1.1), smoothstep(0.018, 0.028, vFruit.y) * 0.5);`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, fSeed);');
    };
    m.customProgramCacheKey = () => 'fruit-seeds';
  }
  return m;
}

function chocolate(colour, roughness = 0.3, twoSided = false) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colour), roughness, clearcoat: 0.25, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: new THREE.Color(colour).multiplyScalar(2), side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    strawberry: fruit('#b90d24', { sheen: '#ff4a4a', seeds: true }),
    leaf: new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#3d6e25'), roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color('#7fb04a'), side: THREE.DoubleSide }),
    blueberry: fruit('#26305c', { sheen: '#9aa9d8', roughness: 0.6, clearcoat: 0 }),
    blueCrown: new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1d33'), roughness: 0.8 }),
    raspberry: fruit('#a8123a', { sheen: '#ff6d8e', roughness: 0.45, clearcoat: 0.25 }),
    cherry: new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#5a0312'), roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.6, sheenColor: new THREE.Color('#c0102a') }),
    stem: new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b6a2c'), roughness: 0.6 }),
    dark: chocolate('#261208', 0.26),
    milk: chocolate('#5b3119', 0.32),
    white: chocolate('#eee1ca', 0.34),
    // curls are open strips, seen from both sides
    curlDark: chocolate('#261208', 0.26, true),
    curlMilk: chocolate('#5b3119', 0.32, true),
    curlWhite: chocolate('#eee1ca', 0.34, true),
    pearl: new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f4efe7'), roughness: 0.2, metalness: 0.1, iridescence: 0.7, iridescenceIOR: 1.35, sheen: 0.4, sheenColor: new THREE.Color('#fff4ea') }),
    gold: new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e3b964'), metalness: 1, roughness: 0.22 }),
    sprinkle: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  };
  return MATS;
}

const creamCache = new Map();
function cream(colour) {
  if (!creamCache.has(colour)) {
    creamCache.set(
      colour,
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colour), roughness: 0.5, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(colour) }),
    );
  }
  return creamCache.get(colour);
}

const shellCache = new Map();
function shell(colour) {
  if (!shellCache.has(colour)) {
    const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colour), roughness: 0.62, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(colour) });
    shellCache.set(colour, m);
  }
  return shellCache.get(colour);
}

// ------------------------------------------------------------ geometry

let GEO = null;
function geos() {
  if (GEO) return GEO;
  GEO = {};
  // strawberry: a rounded cone, widest near the shoulders
  const prof = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = t * 0.03;
    const r = 0.0128 * Math.pow(Math.sin(Math.min(1, t * 1.08) * Math.PI * 0.62), 0.9) * (1 - Math.pow(t, 6) * 0.9);
    prof.push(new THREE.Vector2(Math.max(0.0002, r), y));
  }
  prof.push(new THREE.Vector2(0.0001, 0.03));
  GEO.strawberry = new THREE.LatheGeometry(prof, 28);
  // its calyx: a star of leaves and a stub of stem
  const leaf = new THREE.Shape();
  leaf.moveTo(0, -0.0016);
  leaf.quadraticCurveTo(0.006, -0.0022, 0.0105, 0);
  leaf.quadraticCurveTo(0.006, 0.0022, 0, 0.0016);
  leaf.lineTo(0, -0.0016);
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.ShapeGeometry(leaf, 6);
    place(g, { r: [-Math.PI / 2, 0, 0] });
    // droop the tips
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) - Math.pow(p.getX(k) / 0.0105, 2) * 0.004);
    place(g, { p: [0, 0.0295, 0], r: [0, (i / 7) * Math.PI * 2, 0] });
    g.computeVertexNormals();
    leaves.push(g);
  }
  const stub = new THREE.CylinderGeometry(0.0008, 0.001, 0.005, 6);
  place(stub, { p: [0, 0.032, 0] });
  leaves.push(stub);
  GEO.calyx = merge(leaves);

  GEO.blueberry = new THREE.SphereGeometry(0.0055, 20, 14);
  place(GEO.blueberry, { s: [1, 0.86, 1] });
  GEO.crown = new THREE.TorusGeometry(0.0014, 0.0006, 5, 10);
  place(GEO.crown, { p: [0, 0.0047, 0], r: [Math.PI / 2, 0, 0] });

  // raspberry: a cone of little drupelets round a hollow core
  const rng = seeded(7);
  const drupes = [];
  for (let ring = 0; ring < 7; ring++) {
    const y = 0.002 + ring * 0.0026;
    const rr = 0.0088 * Math.sin((0.25 + (ring / 6) * 0.75) * Math.PI * 0.95);
    const k = Math.max(4, Math.round((2 * Math.PI * rr) / 0.0045));
    for (let j = 0; j < k; j++) {
      const a = ((j + (ring % 2) * 0.5) / k) * Math.PI * 2;
      const s = new THREE.SphereGeometry(0.0026 * (0.9 + rng() * 0.2), 7, 5);
      place(s, { p: [Math.cos(a) * rr, y, Math.sin(a) * rr] });
      drupes.push(s);
    }
  }
  GEO.raspberry = merge(drupes);

  GEO.cherry = new THREE.SphereGeometry(0.0105, 24, 18);
  {
    const p = GEO.cherry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const r = Math.hypot(p.getX(i), p.getZ(i));
      // a dimple where the stem goes in
      const dent = Math.exp(-Math.pow(r / 0.004, 2)) * (y > 0 ? 0.0028 : 0.001);
      p.setY(i, y * 0.92 - Math.sign(y) * dent);
    }
    GEO.cherry.computeVertexNormals();
  }
  const stemCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.0065, 0), new THREE.Vector3(0.002, 0.022, 0), new THREE.Vector3(0.009, 0.034, 0));
  GEO.stem = new THREE.TubeGeometry(stemCurve, 12, 0.0007, 5, false);

  // macaron: two domed shells with ruffled feet and a filling
  // the profile runs from the middle of the flat underside out to the rim,
  // then over the dome to the top
  const shellProf = [new THREE.Vector2(0.0001, 0.0015), new THREE.Vector2(0.0172, 0.0015)];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = t * Math.PI * 0.5;
    shellProf.push(new THREE.Vector2(0.0001 + 0.0188 * Math.cos(a), 0.0015 + 0.0055 * Math.pow(Math.sin(a), 0.8)));
  }
  const shellG = new THREE.LatheGeometry(shellProf, 40);
  const foot = new THREE.TorusGeometry(0.0184, 0.0017, 6, 60);
  {
    const p = foot.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getY(i), p.getX(i));
      const k = 1 + 0.12 * Math.sin(a * 37) * Math.sin(a * 13 + 1);
      p.setZ(i, p.getZ(i) * k);
    }
    foot.computeVertexNormals();
  }
  place(foot, { p: [0, 0.0012, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.9] });
  GEO.macShell = merge([shellG, foot]);
  GEO.macFill = new THREE.CylinderGeometry(0.0172, 0.0172, 0.0052, 36, 1);

  // chocolate curl: a strip rolled into a loose tube
  const curl = [];
  const W = 0.028;
  const turns = 2.2;
  const segs = 70;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    const r = 0.0048 - t * 0.0022;
    for (let j = 0; j <= 1; j++) {
      pos.push((j - 0.5) * W, Math.sin(a) * r, Math.cos(a) * r);
      uv.push(t, j);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  cg.setIndex(idx);
  cg.computeVertexNormals();
  curl.push(cg);
  GEO.curl = cg;

  GEO.pearl = new THREE.SphereGeometry(1, 14, 10);
  GEO.sprinkle = new THREE.CapsuleGeometry(0.0007, 0.0042, 3, 6);
  place(GEO.sprinkle, { r: [0, 0, Math.PI / 2] });
  GEO.dragee = new THREE.SphereGeometry(1, 12, 8);
  return GEO;
}

// A chocolate shard: an irregular flat shard, a little thicker at the base.
function shardGeometry(rng) {
  const s = new THREE.Shape();
  const h = 0.03 + rng() * 0.022;
  const w = 0.018 + rng() * 0.014;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2 - rng() * 0.006, h * (0.45 + rng() * 0.2));
  s.lineTo(w * (rng() - 0.5) * 0.6, h);
  s.lineTo(-w / 2 + rng() * 0.004, h * (0.5 + rng() * 0.25));
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0018, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -0.0009);
  return g;
}

// A piped buttercream rosette: a star nozzle's ridged rope spiralling in
// and up to a soft peak.
let ROSETTE = null;
function rosetteGeometry() {
  if (ROSETTE) return ROSETTE;
  const path = [];
  // a star-nozzle swirl: two turns winding up and in to a soft peak
  const n = 140;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * Math.PI * 2 * 2.1;
    const r = 0.0072 * Math.pow(1 - t, 0.85) + 0.0003;
    const y = 0.0032 + t * 0.0098;
    path.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const star = (t) => {
    const k = 16;
    const taper = t < 0.8 ? 1 - t * 0.35 : (1 - 0.8 * 0.35) * Math.max(0.03, 1 - (t - 0.8) / 0.2);
    return Array.from({ length: k }, (_, i) => {
      const a = (i / k) * Math.PI * 2;
      const r = (0.0036 + (i % 2 ? -0.0011 : 0.0002)) * taper;
      return [Math.cos(a) * r, Math.sin(a) * r * 0.9];
    });
  };
  ROSETTE = sweep(path, star);
  return ROSETTE;
}

// ------------------------------------------------------------ layout

// Circles already taken on the top of the cake.
export class Placer {
  constructor() {
    this.taken = [];
  }
  free(x, z, r) {
    return this.taken.every((c) => Math.hypot(c.x - x, c.z - z) >= c.r + r);
  }
  take(x, z, r) {
    this.taken.push({ x, z, r });
  }
  tryTake(x, z, r) {
    if (!this.free(x, z, r)) return false;
    this.take(x, z, r);
    return true;
  }
}

const SPRINKLE_COLOURS = ['#e8445a', '#f6c445', '#5cc3e8', '#8fd46a', '#f08fc0', '#ffffff', '#b58be8', '#ff9a4a'];
const MACARON_COLOURS = ['#f5b8c8', '#c9e6c4', '#f7dc9c', '#c8c0ec', '#b9dcf0', '#f6c7a6'];

// Put the chosen toppings on the cake. `reserved` lists circles already
// used (by the candles or the message) that big pieces should avoid.
export function decorate(cake, { toppings = [], frosting = '#fbf6ee', seed = 1, reserved = [] } = {}) {
  const M = mats();
  const G = geos();
  const rng = seeded(seed);
  const tiers = cake.tiers;
  const topTier = tiers[tiers.length - 1];
  const R = topTier.r;
  const topY = (x, z) => cake.topAt(x, z);
  const placer = new Placer();
  for (const c of reserved) placer.take(c.x, c.z, c.r);
  const has = (id) => toppings.includes(id);
  const add = (obj, x, z, r) => {
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.decoration = true;
      }
    });
    obj.userData.decoration = true;
    cake.addDecoration(obj, x, z, r);
  };
  const mesh = (g, m) => new THREE.Mesh(g, m);
  // the side of the cake the camera sees least: pile the showy things there
  const back = -Math.PI / 2 + (rng() - 0.5) * 0.5;

  // --- sugar pearls round the top edge of every tier
  if (has('pearls')) {
    const items = [];
    for (const t of tiers) {
      const rr = t.r - 0.0042;
      const k = Math.floor((2 * Math.PI * rr) / 0.0062);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        const s = 0.0024 + rng() * 0.0006;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        items.push({ x, z, y: t.base + t.h + s * 0.8, s: [s, s, s], q: new THREE.Quaternion(), c: null });
      }
    }
    cake.addBatch({ geometry: G.pearl, material: M.pearl, items });
  }

  // --- piped rosettes in a ring near the edge
  const rosetteSpots = [];
  if (has('rosettes')) {
    const rr = R - (has('pearls') ? 0.019 : 0.015);
    const k = Math.max(6, Math.round((2 * Math.PI * rr) / 0.027));
    const mat = cream(frosting);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      if (!placer.free(x, z, 0.011)) continue;
      placer.take(x, z, 0.011);
      const m = mesh(rosetteGeometry(), mat);
      m.position.set(x, topY(x, z) - 0.002, z);
      m.rotation.y = rng() * Math.PI * 2;
      m.scale.setScalar(0.95 + rng() * 0.12);
      add(m, x, z, 0.011);
      rosetteSpots.push({ x, z, y: m.position.y + 0.012 * m.scale.y });
    }
  }

  // --- macarons leaning in the crescent
  if (has('macarons')) {
    const k = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < k; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const a = back + (i - (k - 1) / 2) * 0.55 + (rng() - 0.5) * 0.2;
        const rr = R - 0.03 - rng() * 0.01;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        if (!placer.free(x, z, 0.012)) continue;
        placer.take(x, z, 0.012);
        const col = MACARON_COLOURS[Math.floor(rng() * MACARON_COLOURS.length)];
        const g = new THREE.Group();
        const lower = mesh(G.macShell, shell(col));
        lower.rotation.x = Math.PI;
        lower.position.y = -0.0026;
        const upper = mesh(G.macShell, shell(col));
        upper.position.y = 0.0026;
        const fill = mesh(G.macFill, cream(i % 2 ? '#fbf1e2' : '#5a2d17'));
        g.add(lower, upper, fill);
        // stand it on edge, facing the middle and leaning back
        const inner = new THREE.Group();
        inner.add(g);
        g.rotation.x = Math.PI / 2 - 0.45 - rng() * 0.25;
        g.position.y = 0.0185;
        inner.position.set(x, topY(x, z), z);
        inner.rotation.y = -Math.PI / 2 - a;
        add(inner, x, z, 0.012);
        break;
      }
    }
  }

  // --- chocolate shards standing up
  if (has('shards')) {
    const k = 5 + Math.floor(rng() * 3);
    const choc = [M.dark, M.milk, M.dark, M.white];
    for (let i = 0; i < k; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const a = back + (i - (k - 1) / 2) * 0.36 + (rng() - 0.5) * 0.15;
        const rr = R - 0.022 - rng() * 0.02;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        if (!placer.free(x, z, 0.006)) continue;
        placer.take(x, z, 0.006);
        const m = mesh(shardGeometry(rng), choc[Math.floor(rng() * choc.length)]);
        m.userData.ownGeometry = true;
        m.position.set(x, topY(x, z) - 0.004, z);
        m.rotation.set((rng() - 0.5) * 0.35, -a + Math.PI / 2 + (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.3);
        add(m, x, z, 0.008);
        break;
      }
    }
  }

  // --- fruit
  const fruits = ['strawberries', 'raspberries', 'blueberries', 'cherries'].filter(has);
  const makeFruit = (kind) => {
    const g = new THREE.Group();
    if (kind === 'strawberries') {
      g.add(mesh(G.strawberry, M.strawberry), mesh(G.calyx, M.leaf));
      g.userData.r = 0.013;
      g.userData.lie = true;
    } else if (kind === 'blueberries') {
      g.add(mesh(G.blueberry, M.blueberry), mesh(G.crown, M.blueCrown));
      g.userData.r = 0.0058;
    } else if (kind === 'raspberries') {
      g.add(mesh(G.raspberry, M.raspberry));
      g.userData.r = 0.009;
    } else {
      g.add(mesh(G.cherry, M.cherry), mesh(G.stem, M.stem));
      g.userData.r = 0.0105;
    }
    return g;
  };
  const poseFruit = (g, x, z, y, kind) => {
    g.position.set(x, y, z);
    if (kind === 'strawberries') {
      // lying on its side, tip out
      g.rotation.set(0, rng() * Math.PI * 2, 0);
      g.rotateZ(-Math.PI / 2 + 0.35 + rng() * 0.3);
      g.position.y += 0.0105;
    } else if (kind === 'raspberries') {
      g.rotation.set(Math.PI + (rng() - 0.5) * 0.5, rng() * 6.28, 0);
      g.position.y += 0.018;
    } else if (kind === 'cherries') {
      g.rotation.set((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3);
      g.position.y += 0.0092;
    } else {
      g.rotation.set((rng() - 0.5) * 0.8, rng() * 6.28, (rng() - 0.5) * 0.8);
      g.position.y += 0.0046;
    }
  };
  if (fruits.length) {
    if (rosetteSpots.length) {
      // a berry on every other rosette
      rosetteSpots.forEach((s, i) => {
        if (i % 2 && rosetteSpots.length > 8) return;
        const kind = fruits[i % fruits.length] === 'strawberries' && fruits.length > 1 ? fruits[(i + 1) % fruits.length] : fruits[i % fruits.length];
        const g = makeFruit(kind);
        if (kind === 'strawberries') {
          // stand up on the rosette, leaves down
          g.position.set(s.x, s.y + 0.001, s.z);
          g.rotation.set(Math.PI + 0.25, rng() * 6.28, 0);
          g.position.y += 0.03;
          g.scale.setScalar(0.72);
        } else {
          poseFruit(g, s.x, s.z, s.y - 0.002, kind);
          g.position.y -= kind === 'raspberries' ? 0.004 : 0.002;
        }
        add(g, s.x, s.z, 0.011);
      });
    }
    // a crescent of fruit at the back
    const want = (rosetteSpots.length ? 7 : 16) - (has('macarons') ? 4 : 0) - (has('shards') ? 3 : 0);
    let placed = 0;
    for (let tries = 0; tries < want * 30 && placed < want; tries++) {
      const kind = fruits[Math.floor(rng() * fruits.length)];
      const g = makeFruit(kind);
      const r0 = g.userData.r;
      const a = back + (rng() - 0.5) * 2.4;
      const rr = (rosetteSpots.length ? R - 0.04 : R - 0.024) - rng() * 0.025;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      if (!placer.free(x, z, r0 * 0.9)) continue;
      placer.take(x, z, r0 * 0.9);
      poseFruit(g, x, z, topY(x, z), kind);
      add(g, x, z, r0);
      placed++;
    }
  }

  // --- chocolate curls piled up
  if (has('curls')) {
    const k = 9 + Math.floor(rng() * 5);
    const choc = [M.curlDark, M.curlMilk, M.curlWhite, M.curlMilk];
    let placed = 0;
    for (let tries = 0; tries < 300 && placed < k; tries++) {
      const a = back + (rng() - 0.5) * 2.2;
      const rr = R * (0.35 + rng() * 0.45);
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      if (!placer.free(x, z, 0.007)) continue;
      placer.take(x, z, 0.0065);
      const m = mesh(G.curl, choc[Math.floor(rng() * choc.length)]);
      m.position.set(x, topY(x, z) + 0.004, z);
      m.rotation.set(0, rng() * 6.28, (rng() - 0.5) * 0.3);
      m.scale.setScalar(0.8 + rng() * 0.4);
      add(m, x, z, 0.012);
      placed++;
    }
  }

  // --- sprinkles and dragées strewn over the top
  const strew = (count, make) => {
    const items = [];
    for (let i = 0; i < count; i++) {
      const rr = Math.sqrt(rng()) * (R - 0.004);
      const a = rng() * Math.PI * 2;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      const blocked = placer.taken.some((c) => Math.hypot(c.x - x, c.z - z) < c.r * (c.hard ? 1 : 0.8));
      if (blocked) continue;
      items.push(make(x, z, topY(x, z)));
    }
    return items;
  };
  if (has('sprinkles')) {
    const items = strew(Math.round(34000 * R * R), (x, z, y) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3));
      return { x, z, y: y + 0.0006, s: [1, 1, 1], q, c: new THREE.Color(SPRINKLE_COLOURS[Math.floor(rng() * SPRINKLE_COLOURS.length)]) };
    });
    cake.addBatch({ geometry: G.sprinkle, material: M.sprinkle, items });
  }
  if (has('goldsprinkles')) {
    const items = strew(Math.round(9000 * R * R), (x, z, y) => {
      const s = rng() < 0.25 ? 0.0022 : 0.0011;
      return { x, z, y: y + s * 0.8, s: [s, s, s], q: new THREE.Quaternion(), c: null };
    });
    cake.addBatch({ geometry: G.dragee, material: M.gold, items });
  }
}

// ------------------------------------------------------------ message

// The piped message is drawn into a canvas once and read by the top-of-cake
// shader: red channel for the icing itself, green for its rounded height.
// The text only ever lives in this canvas; it is not stored or sent.
export function messageTexture(text) {
  const W = 1024;
  const H = 320;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#000';
  cx.fillRect(0, 0, W, H);
  let size = 190;
  const font = (s) => `italic 500 ${s}px "Snell Roundhand", "Apple Chancery", "Segoe Script", "Brush Script MT", "URW Chancery L", cursive`;
  cx.font = font(size);
  while (cx.measureText(text).width > W * 0.9 && size > 40) {
    size -= 6;
    cx.font = font(size);
  }
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.lineJoin = 'round';
  cx.lineCap = 'round';
  // the letters are seen at a low angle, so draw them a little taller
  cx.translate(W / 2, H / 2);
  cx.scale(1, 1.25);
  // height: stacked strokes, thickest and faintest first, make a dome
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1);
    cx.strokeStyle = 'rgba(0, 255, 0, 0.26)';
    cx.lineWidth = size * (0.1 - k * 0.08);
    cx.strokeText(text, 0, 0);
  }
  // the icing line: a crisp stroke in red, added on top
  cx.globalCompositeOperation = 'lighter';
  cx.strokeStyle = 'rgb(255, 0, 0)';
  cx.lineWidth = Math.max(3, size * 0.068);
  cx.strokeText(text, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.userData.aspect = W / H;
  return tex;
}
