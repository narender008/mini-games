// Storybook Kingdom: the room the third marble run stands in (reference
// picture 3). The run grows out of an open storybook lying on an old
// lacquered library table at dusk: the book's pages are covered in a mossy
// little landscape with fir trees, round trees, a cottage, rocks and
// flowers; around it lie parchment sketches, a brass compass, a pen and a
// pot of brushes, a stack of leather books with a glowing lantern, and the
// wooden bowl of spare marbles. Behind, bookshelves fade into warm shadow
// and a window shows a violet and gold sunset over a far-off castle.
//
// Everything is real scale in metres with the book's page at y = 0 and the
// table top a book's thickness below it. Textures are drawn once on 2D
// canvases, sized from the quality tier. A warm key light (the lamplight
// of the room) casts soft shadows over the run; a cool violet rim comes
// from the window; the lanterns glow and bloom. The finished room is
// captured into a PMREM environment so glass marbles, brass bells and the
// lacquered wood reflect it.
import * as THREE from 'three';
import { REDUCED_MOTION } from '../config.js';

// ------------------------------------------------------------ layout

const TABLE_Y = -0.034; // table top (the book's pages are at y = 0)
const BOOK = { x0: -0.64, x1: 0.6, z0: -0.3, z1: 0.3 };
const COVER = 0.004;
const BOWL = { x: -0.52, z: 0.42, inner: 0.066, rim: 0.045, floorY: TABLE_Y + 0.012 };
// the volume the run may occupy (plus margin): the key light's shadow map covers it
const CASTERS = new THREE.Box3(new THREE.Vector3(-0.66, TABLE_Y, -0.36), new THREE.Vector3(0.62, 0.62, 0.4));
const KEY_DIR = new THREE.Vector3(-0.55, 0.78, 0.42).normalize(); // towards the key light

// ------------------------------------------------------------ helpers

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const col = (hex) => new THREE.Color(hex);

function put(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  geo.applyMatrix4(m);
  return geo;
}

// Joins placed geometries (position, normal, uv) into one draw call.
function merge(list) {
  let nv = 0;
  let ni = 0;
  const parts = list.map((g) => {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const idx = g.index ? g.index.array : Uint32Array.from({ length: g.attributes.position.count }, (_, i) => i);
    nv += g.attributes.position.count;
    ni += idx.length;
    return { g, idx };
  });
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const index = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const { g, idx } of parts) {
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    uv.set(g.attributes.uv.array, ov * 2);
    for (let k = 0; k < idx.length; k++) index[oi + k] = idx[k] + ov;
    ov += g.attributes.position.count;
    oi += idx.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

// A rounded box with flat faces and quarter-round edges.
function roundedBox(w, h, d, r, seg = 2) {
  r = Math.min(r, w / 2, h / 2, d / 2) * 0.999;
  const s = seg * 2 + 1;
  const geo = new THREE.BoxGeometry(1, 1, 1, s, s, s);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const inner = [w / 2 - r, h / 2 - r, d / 2 - r];
  const lim = 0.5 / s + 1e-5;
  const v = [0, 0, 0];
  const n = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    v[0] = pos.getX(i);
    v[1] = pos.getY(i);
    v[2] = pos.getZ(i);
    for (let k = 0; k < 3; k++) n[k] = Math.abs(v[k]) < lim ? 0 : v[k];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    for (let k = 0; k < 3; k++) n[k] /= len;
    pos.setXYZ(i, Math.sign(v[0]) * inner[0] + n[0] * r, Math.sign(v[1]) * inner[1] + n[1] * r, Math.sign(v[2]) * inner[2] + n[2] * r);
    nor.setXYZ(i, n[0], n[1], n[2]);
  }
  // uv: box-projected in metres, so textures keep their scale
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ay >= ax && ay >= Math.abs(nor.getZ(i))) uv.setXY(i, x, z);
    else if (ax >= Math.abs(nor.getZ(i))) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  return geo;
}

// A 2D canvas texture drawn by fn(ctx, w, h).
function canvasTex(K, w, h, fn, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  fn(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  K.keep(t);
  return t;
}

// soft value noise on a canvas (for grain in painted textures)
function speckle(ctx, w, h, rand, n, rMin, rMax, colours, alpha = 0.3) {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.4 + 0.6 * rand());
    ctx.fillStyle = colours[Math.floor(rand() * colours.length)];
    const r = rMin + (rMax - rMin) * rand();
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

class Kit {
  constructor(renderer, quality, mats) {
    this.renderer = renderer;
    this.quality = quality;
    this.mats = mats;
    this.tier = quality.tier || 'high';
    this.tex = Math.min(2048, Math.max(512, quality.texSize || 1024));
    this.bin = [];
    this.group = new THREE.Group();
    this.group.name = 'storybook-setting';
    this.animators = [];
  }

  keep(x) {
    if (x && x.dispose) this.bin.push(x);
    return x;
  }

  mesh(geo, mat, { cast = false, receive = true, parent = this.group } = {}) {
    this.keep(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  phys(params) {
    return this.keep(new THREE.MeshPhysicalMaterial(params));
  }
}

// ------------------------------------------------------------ table

function buildTable(K) {
  // long planks of lacquered oak, each its own piece of wood
  const wood = K.mats.wood({ species: 'walnut', mapping: 'object', finish: 'oiled', grain: 'x', scale: 3 });
  const planks = 7;
  const w = 0.24;
  const z0 = -0.95;
  for (let k = 0; k < planks; k++) {
    const m = K.mesh(roundedBox(3.2, 0.04, w - 0.003, 0.004), wood, { receive: true });
    m.position.set(-0.1 + (k % 2) * 0.13, TABLE_Y - 0.02, z0 + k * w + w / 2);
  }
}

// ------------------------------------------------------------ the book

function paperEdgeTex(K) {
  return canvasTex(K, 64, 512, (ctx, w, h) => {
    ctx.fillStyle = '#efe3c6';
    ctx.fillRect(0, 0, w, h);
    const rand = rng(11);
    for (let y = 0; y < h; y += 1 + Math.floor(rand() * 2)) {
      const t = rand();
      ctx.fillStyle = t < 0.5 ? 'rgba(160,130,90,0.22)' : 'rgba(255,250,235,0.35)';
      ctx.fillRect(0, y, w, 1);
    }
  }, { repeat: true });
}

function leatherTex(K) {
  const s = Math.min(1024, K.tex);
  return canvasTex(K, s, s, (ctx, w, h) => {
    ctx.fillStyle = '#1d3566';
    ctx.fillRect(0, 0, w, h);
    const rand = rng(5);
    speckle(ctx, w, h, rand, 9000, 0.6, 2.4, ['#12244a', '#2a4a86', '#162c58'], 0.35);
    speckle(ctx, w, h, rand, 400, 4, 14, ['#10203f', '#27447c'], 0.12);
  }, { repeat: true });
}

// The mossy landscape on the pages: moss and grass in soft patches, a few
// earthy paths and little flowers, fading to the paper at the edges.
function mossTex(K) {
  const s = K.tex;
  return canvasTex(K, s, Math.round(s / 2), (ctx, w, h) => {
    ctx.fillStyle = '#4f7a2c';
    ctx.fillRect(0, 0, w, h);
    const rand = rng(21);
    speckle(ctx, w, h, rand, 1400, w * 0.004, w * 0.03, ['#3f6a22', '#679236', '#5a8a2a', '#2f5a1c', '#7aa040'], 0.25);
    // earthy patches
    speckle(ctx, w, h, rand, 60, w * 0.01, w * 0.03, ['#7a6040', '#6a5236'], 0.18);
    // fine grass blades
    for (let i = 0; i < 26000; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const l = 2 + rand() * 5;
      ctx.strokeStyle = rand() < 0.5 ? 'rgba(130,180,70,0.35)' : 'rgba(30,60,15,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 2, y - l);
      ctx.stroke();
    }
    // tiny flowers
    speckle(ctx, w, h, rand, 900, 1, 2.2, ['#ffe36a', '#ffffff', '#f59ac0', '#c49cff', '#ff8a5a'], 0.9);
  });
}

function buildBook(K) {
  const leather = K.phys({ map: leatherTex(K), roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: col('#5a78c0'), sheenRoughness: 0.6 });
  leather.map.repeat.set(3, 3);
  const edge = K.phys({ map: paperEdgeTex(K), roughness: 0.85 });
  const gold = K.mats.gold({ polish: 0.7 });
  const pageTop = K.phys({ color: col('#f1e6c9'), roughness: 0.9 });
  const moss = K.phys({ map: mossTex(K), roughness: 0.95, sheen: 0.6, sheenColor: col('#a8d070'), sheenRoughness: 0.8 });

  const T = -TABLE_Y; // book thickness
  const w = BOOK.x1 - BOOK.x0;
  const d = BOOK.z1 - BOOK.z0;
  const cx = (BOOK.x0 + BOOK.x1) / 2;
  const cz = (BOOK.z0 + BOOK.z1) / 2;
  // cover boards, a little larger than the pages
  const cover = K.mesh(roundedBox(w + 0.03, COVER, d + 0.03, 0.0018), leather, { cast: true });
  cover.position.set(cx, TABLE_Y + COVER / 2, cz);
  // gold tooled border on the board's rim
  const border = [];
  for (const [bw, bd, x, z] of [
    [w + 0.022, 0.003, cx, BOOK.z1 + 0.011],
    [w + 0.022, 0.003, cx, BOOK.z0 - 0.011],
    [0.003, d + 0.022, BOOK.x0 - 0.011, cz],
    [0.003, d + 0.022, BOOK.x1 + 0.011, cz],
  ]) {
    border.push(put(new THREE.BoxGeometry(bw, 0.0004, bd), { p: [x, TABLE_Y + COVER + 0.0002, z] }));
  }
  K.mesh(merge(border), gold);
  // the two page blocks, left and right of the gutter, bowing gently up
  // towards the gutter like a real open book
  const ph = T - COVER;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? BOOK.x0 : 0.004;
    const x1 = side < 0 ? -0.004 : BOOK.x1;
    const bw = x1 - x0;
    const geo = new THREE.BoxGeometry(bw, ph, d, 24, 1, 1);
    const p = geo.attributes.position;
    const uv = geo.attributes.uv;
    const nr = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      // pages sag a touch at the outer edge (the block is rounded there)
      const u = (x + bw / 2) / bw;
      const out = side < 0 ? 1 - u : u;
      const drop = Math.pow(out, 6) * 0.004;
      if (y > 0) p.setY(i, y - drop);
      // side faces: page-edge lines run along the length
      if (Math.abs(nr.getY(i)) < 0.5) uv.setXY(i, (Math.abs(nr.getX(i)) > 0.5 ? p.getZ(i) : x) * 3, (p.getY(i) + ph / 2) / ph);
    }
    geo.computeVertexNormals();
    const mats = [edge, edge, pageTop, edge, edge, edge];
    const m = new THREE.Mesh(geo, mats);
    m.position.set((x0 + x1) / 2, TABLE_Y + COVER + ph / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    K.keep(geo);
    K.group.add(m);
  }
  // spine: a rounded roll under the gutter showing at the front and back
  const spine = K.mesh(new THREE.CylinderGeometry(0.012, 0.012, d + 0.03, 24, 1, false, Math.PI / 2, Math.PI), leather, { cast: true });
  spine.rotation.x = Math.PI / 2;
  spine.position.set(0, TABLE_Y + 0.004, cz);
  // the moss landscape laid over the pages, inset from their edges
  const inset = 0.028;
  const mg = new THREE.PlaneGeometry(w - 2 * inset, d - 2 * inset, 1, 1);
  const mossMesh = K.mesh(mg, moss);
  mossMesh.rotation.x = -Math.PI / 2;
  mossMesh.position.set(cx, 0.0004, cz);
  // a soft torn edge: tufts round the moss's rim
  return { moss: mossMesh };
}

// ------------------------------------------------------------ scenery on the book

// Fir trees, round trees, bushes, rocks and flowers on the pages round the
// run, kept out of the build area in the middle.
function buildLandscape(K) {
  const rand = rng(33);
  const fir = K.mats.paint({ color: '#2f5e2a', wear: 0.1, gloss: 0.35 });
  const firLight = K.mats.paint({ color: '#3f7a30', wear: 0.1, gloss: 0.35 });
  const leafy = K.mats.paint({ color: '#5c9a34', wear: 0.1, gloss: 0.3 });
  const trunk = K.mats.wood({ species: 'walnut', mapping: 'object', finish: 'oiled', grain: 'y' });
  const rock = K.mats.stone({ kind: 'cobble' });
  const roofRed = K.mats.slate({ color: '#b5452f' });
  const plaster = K.mats.paint({ color: '#efe2c4', wear: 0.3, gloss: 0.2 });
  const flowerMats = ['#ffd84a', '#ffffff', '#f38bb8', '#b58cff', '#ff7a4a'].map((c) => K.mats.paint({ color: c, wear: 0, gloss: 0.5 }));

  // where things may stand: the edge strips of the pages
  const spots = [];
  const inRun = (x, z) => x > -0.49 && x < 0.44 && z > -0.2 && z < 0.22;
  const tryAdd = (x, z, r) => {
    if (inRun(x, z)) return false;
    if (x < BOOK.x0 + 0.035 + r || x > BOOK.x1 - 0.035 - r || z < BOOK.z0 + 0.035 + r || z > BOOK.z1 - 0.035 - r) return false;
    for (const s of spots) if (Math.hypot(s.x - x, s.z - z) < s.r + r) return false;
    spots.push({ x, z, r });
    return true;
  };

  // a big round tree at the front left corner, placed first
  const bigTree = { x: -0.54, z: 0.19, s: 1.7 };
  tryAdd(bigTree.x, bigTree.z, 0.04);

  // fir trees: stacked soft cones, bigger at the back
  const firParts = [];
  const firParts2 = [];
  const trunks = [];
  const firSpots = [
    [-0.6, -0.26, 1.2], [-0.53, -0.25, 1.4], [-0.56, -0.19, 1.0], [0.52, -0.25, 1.3], [0.56, -0.19, 1.0], [0.47, -0.26, 1.15],
    [-0.58, 0.05, 0.9], [-0.6, -0.1, 1.1], [0.55, 0.02, 1.0], [0.56, -0.08, 1.2], [0.2, -0.26, 0.9], [-0.15, -0.265, 0.8],
    [0.05, -0.26, 0.75], [0.35, -0.255, 1.0], [0.55, 0.2, 0.8], [-0.59, 0.22, 0.75],
  ];
  // and a scatter along the back and the sides, clear of the castle's crag
  for (let k = 0; k < 70; k++) {
    const side = rand();
    let x;
    let z;
    if (side < 0.5) {
      x = BOOK.x0 + 0.05 + rand() * (BOOK.x1 - BOOK.x0 - 0.1);
      z = BOOK.z0 + 0.04 + rand() * 0.07;
      if (x > -0.42 && x < -0.2) continue;
    } else {
      x = side < 0.75 ? BOOK.x0 + 0.04 + rand() * 0.1 : BOOK.x1 - 0.04 - rand() * 0.12;
      z = BOOK.z0 + 0.05 + rand() * (BOOK.z1 - BOOK.z0 - 0.1);
    }
    firSpots.push([x, z, 0.6 + rand() * 0.75]);
  }
  for (const [x, z, s] of firSpots) {
    if (!tryAdd(x, z, 0.022 * s)) continue;
    const hgt = 0.1 * s;
    trunks.push(put(new THREE.CylinderGeometry(0.0035 * s, 0.0045 * s, 0.025 * s, 8), { p: [x, 0.0125 * s, z] }));
    for (let k = 0; k < 4; k++) {
      const r = 0.026 * s * (1 - k * 0.2);
      const h = 0.04 * s * (1 - k * 0.1);
      const y = 0.018 * s + k * hgt * 0.2;
      const cone = new THREE.ConeGeometry(r, h, 14, 1);
      (k % 2 ? firParts2 : firParts).push(put(cone, { p: [x, y + h / 2, z], r: [0, rand() * 6, 0] }));
    }
  }
  K.mesh(merge(firParts), fir, { cast: true });
  K.mesh(merge(firParts2), firLight, { cast: true });

  // round trees and bushes: clusters of soft balls
  const crowns = [];
  const roundSpots = [[0.5, 0.13, 1.0], [-0.44, -0.24, 1.3], [0.42, -0.23, 1.0], [-0.26, 0.255, 0.55], [0.3, 0.26, 0.5], [0.0, 0.26, 0.45], [-0.05, -0.275, 0.7]];
  for (let k = 0; k < 40; k++) {
    const x = BOOK.x0 + 0.04 + rand() * (BOOK.x1 - BOOK.x0 - 0.08);
    const z = rand() < 0.5 ? 0.225 + rand() * 0.045 : BOOK.z0 + 0.04 + rand() * 0.06;
    roundSpots.push([x, z, 0.3 + rand() * 0.35]);
  }
  for (const [x, z, s] of [[bigTree.x, bigTree.z, bigTree.s, true], ...roundSpots]) {
    if (s !== bigTree.s && !tryAdd(x, z, 0.024 * s)) continue;
    const tall = s > 0.8;
    const y0 = tall ? 0.05 * s : 0.012 * s;
    if (tall) trunks.push(put(new THREE.CylinderGeometry(0.004 * s, 0.006 * s, y0 + 0.01, 8), { p: [x, (y0 + 0.01) / 2, z] }));
    for (let k = 0; k < 6; k++) {
      const r = (0.012 + rand() * 0.008) * s;
      crowns.push(put(new THREE.IcosahedronGeometry(r, 1), { p: [x + (rand() - 0.5) * 0.03 * s, y0 + rand() * 0.02 * s, z + (rand() - 0.5) * 0.03 * s] }));
    }
  }
  K.mesh(merge(crowns), leafy, { cast: true });
  K.mesh(merge(trunks), trunk, { cast: true });

  // soft mossy hillocks at the back corners and along the sides
  const hills = [];
  for (const [x, z, r, h] of [[-0.56, -0.24, 0.07, 0.03], [0.5, -0.24, 0.08, 0.035], [-0.58, 0.14, 0.05, 0.02], [0.54, 0.08, 0.06, 0.025], [0.12, -0.265, 0.06, 0.018], [-0.15, -0.27, 0.05, 0.016]]) {
    hills.push(put(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), { p: [x, 0, z], s: [r, h, r * 0.7] }));
  }
  K.mesh(merge(hills), K.mats.paint({ color: '#4f8a2a', wear: 0.05, gloss: 0.25 }), { cast: false });

  // rocks
  const rocks = [];
  for (let k = 0; k < 26; k++) {
    const x = BOOK.x0 + 0.05 + rand() * (BOOK.x1 - BOOK.x0 - 0.1);
    const z = BOOK.z0 + 0.05 + rand() * (BOOK.z1 - BOOK.z0 - 0.1);
    const r = 0.006 + rand() * 0.012;
    if (!tryAdd(x, z, r)) continue;
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + rand() * 0.3), Math.max(-r * 0.3, p.getY(i)) * 0.7, p.getZ(i) * (0.9 + rand() * 0.3));
    g.computeVertexNormals();
    rocks.push(put(g, { p: [x, r * 0.15, z], r: [0, rand() * 6, 0] }));
  }
  if (rocks.length) K.mesh(merge(rocks), rock, { cast: true });

  // a little cottage at the front left, with a red tiled roof
  const hx = -0.56;
  const hz = 0.1;
  const house = K.mesh(roundedBox(0.045, 0.035, 0.04, 0.002), plaster, { cast: true });
  house.position.set(hx, 0.0175, hz);
  const roof = new THREE.CylinderGeometry(0.0005, 0.036, 0.028, 4, 1);
  const rm = K.mesh(put(roof, { r: [0, Math.PI / 4, 0], s: [1, 1, 0.85] }), roofRed, { cast: true });
  rm.position.set(hx, 0.035 + 0.014, hz);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.5) });
  K.keep(glow);
  const win = K.mesh(new THREE.PlaneGeometry(0.009, 0.011), glow, { receive: false });
  win.position.set(hx + 0.008, 0.02, hz + 0.0202);
  const door = K.mesh(new THREE.PlaneGeometry(0.009, 0.016), K.mats.paint({ color: '#6a3a1e', wear: 0.3, gloss: 0.4 }), { receive: false });
  door.position.set(hx - 0.01, 0.008, hz + 0.0202);

  // flowers dotted along the front strip
  const flowerParts = flowerMats.map(() => []);
  for (let k = 0; k < 90; k++) {
    const x = BOOK.x0 + 0.04 + rand() * (BOOK.x1 - BOOK.x0 - 0.08);
    const z = rand() < 0.6 ? 0.23 + rand() * 0.04 : BOOK.z0 + 0.04 + rand() * 0.05;
    if (inRun(x, z)) continue;
    const i = Math.floor(rand() * flowerMats.length);
    flowerParts[i].push(put(new THREE.SphereGeometry(0.0022, 8, 6), { p: [x, 0.003, z], s: [1, 0.6, 1] }));
  }
  flowerParts.forEach((parts, i) => parts.length && K.mesh(merge(parts), flowerMats[i]));
}

// ------------------------------------------------------------ table props

function bowlGeometry() {
  const pts = [
    [0.0, 0.0], [0.04, 0.0], [0.043, 0.0015], [0.0445, 0.005], [0.05, 0.009], [0.062, 0.016], [0.0705, 0.026],
    [0.0742, 0.036], [0.0741, 0.0415], [0.0728, 0.0445], [0.0702, 0.0453], [0.0676, 0.0447], [0.0661, 0.0428],
    [0.0645, 0.037], [0.059, 0.0285], [0.049, 0.0212], [0.035, 0.0158], [0.018, 0.0128], [0.0, 0.012],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 64);
}

function sketchTex(K, seed) {
  return canvasTex(K, 512, 400, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7);
    g.addColorStop(0, '#f3e6c4');
    g.addColorStop(1, '#d9c393');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = rng(seed);
    speckle(ctx, w, h, rand, 600, 1, 6, ['#b89a64', '#e9dab4'], 0.15);
    // a pencil sketch of a castle on a hill
    ctx.strokeStyle = 'rgba(70,52,34,0.75)';
    ctx.lineWidth = 1.4;
    const bx = w * (0.35 + rand() * 0.2);
    const by = h * 0.7;
    ctx.beginPath();
    ctx.moveTo(30, by + 20);
    ctx.quadraticCurveTo(w / 2, by - 40, w - 30, by + 25);
    ctx.stroke();
    const towers = [[-70, 70, 22], [-30, 110, 26], [10, 150, 30], [55, 100, 24], [90, 60, 18]];
    for (const [dx, th, tw] of towers) {
      const x = bx + dx;
      ctx.strokeRect(x - tw / 2, by - th, tw, th - 10);
      ctx.beginPath();
      ctx.moveTo(x - tw / 2 - 4, by - th);
      ctx.lineTo(x, by - th - tw * 1.3);
      ctx.lineTo(x + tw / 2 + 4, by - th);
      ctx.stroke();
      for (let k = 0; k < 2; k++) ctx.strokeRect(x - 3, by - th + 20 + k * 30, 6, 10);
    }
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 40; k++) {
      ctx.beginPath();
      const x = 30 + rand() * (w - 60);
      const y = 30 + rand() * 60;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20 + rand() * 60, y + (rand() - 0.5) * 3);
      ctx.stroke();
    }
  });
}

function compassTex(K) {
  return canvasTex(K, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#efe2c0';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = '#3a2a1a';
    ctx.fillStyle = '#3a2a1a';
    for (let k = 0; k < 72; k++) {
      ctx.save();
      ctx.rotate((k / 72) * Math.PI * 2);
      ctx.fillRect(-1, -w * 0.46, 2, k % 9 === 0 ? 22 : 10);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.47, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.stroke();
    // a star rose
    for (let k = 0; k < 8; k++) {
      ctx.save();
      ctx.rotate((k / 8) * Math.PI * 2);
      ctx.fillStyle = k % 2 ? '#a0402a' : '#2a3a6a';
      ctx.beginPath();
      ctx.moveTo(0, -w * (k % 2 ? 0.25 : 0.36));
      ctx.lineTo(w * 0.04, 0);
      ctx.lineTo(-w * 0.04, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

function buildProps(K) {
  const brass = K.mats.brass({ polish: 0.75, age: 0.35 });
  const bowlWood = K.mats.wood({ species: 'walnut', mapping: 'object', finish: 'lacquer', grain: 'y' });
  const bowl = K.mesh(bowlGeometry(), bowlWood, { cast: true });
  bowl.position.set(BOWL.x, TABLE_Y, BOWL.z);
  bowl.rotation.y = 0.7;

  // parchment sketches, lying slightly curled on the table
  const sheets = [
    { x: -0.12, z: 0.48, a: 0.08, seed: 3 },
    { x: 0.2, z: 0.46, a: -0.14, seed: 8 },
  ];
  for (const s of sheets) {
    const geo = new THREE.PlaneGeometry(0.26, 0.2, 16, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / 0.13;
      p.setZ(i, Math.pow(Math.abs(x), 4) * 0.008);
    }
    geo.computeVertexNormals();
    const mat = K.phys({ map: sketchTex(K, s.seed), roughness: 0.85, side: THREE.DoubleSide });
    const m = K.mesh(geo, mat, { cast: true });
    m.rotation.set(-Math.PI / 2, 0, s.a);
    m.position.set(s.x, TABLE_Y + 0.0006, s.z);
  }

  // a brass compass at the front right
  const cx = 0.62;
  const cz = 0.44;
  const caseGeo = new THREE.LatheGeometry(
    [[0, 0], [0.05, 0], [0.056, 0.004], [0.057, 0.012], [0.054, 0.016], [0.05, 0.016], [0.05, 0.01], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y)),
    64,
  );
  const cm = K.mesh(caseGeo, brass, { cast: true });
  cm.position.set(cx, TABLE_Y, cz);
  const dial = K.mesh(new THREE.CircleGeometry(0.05, 64), K.phys({ map: compassTex(K), roughness: 0.6 }));
  dial.rotation.x = -Math.PI / 2;
  dial.position.set(cx, TABLE_Y + 0.0102, cz);
  const needle = K.mesh(roundedBox(0.07, 0.0015, 0.006, 0.0007), K.mats.paint({ color: '#8a2a20', wear: 0.1, gloss: 0.8 }), { cast: true });
  needle.position.set(cx, TABLE_Y + 0.012, cz);
  needle.rotation.y = 0.6;
  const glass = K.mats.acrylic({ tint: '#ffffff' });
  const gl = K.mesh(new THREE.CircleGeometry(0.05, 48), glass, { receive: false });
  gl.rotation.x = -Math.PI / 2;
  gl.position.set(cx, TABLE_Y + 0.015, cz);
  const ring = K.mesh(new THREE.TorusGeometry(0.013, 0.003, 10, 24), brass, { cast: true });
  ring.position.set(cx - 0.062, TABLE_Y + 0.008, cz + 0.02);
  ring.rotation.set(0, 0.3, 0);

  // a pen on the right
  const pen = K.mesh(new THREE.CylinderGeometry(0.0045, 0.004, 0.16, 16), K.mats.paint({ color: '#1f2a4a', wear: 0.2, gloss: 0.9 }), { cast: true });
  pen.rotation.set(Math.PI / 2, 0, 1.1);
  pen.position.set(0.5, TABLE_Y + 0.0045, 0.38);

  // a stack of old leather books at the back left, a lantern on top
  const cols = ['#5a2a1e', '#2a3a5a', '#4a3a22'];
  const paper = K.phys({ map: paperEdgeTex(K), roughness: 0.85 });
  let y = TABLE_Y;
  for (let k = 0; k < 3; k++) {
    const bw = 0.3 - k * 0.02;
    const bd = 0.22 - k * 0.015;
    const bh = 0.045 - k * 0.005;
    const coverMat = K.mats.paint({ color: cols[k], wear: 0.6, gloss: 0.35 });
    const b = K.mesh(roundedBox(bw, bh, bd, 0.004), coverMat, { cast: true });
    b.position.set(-0.86 + k * 0.01, y + bh / 2, -0.28 + k * 0.01);
    b.rotation.y = 0.12 - k * 0.06;
    const pages = K.mesh(new THREE.BoxGeometry(bw - 0.012, bh - 0.008, bd - 0.004), paper, { cast: false });
    pages.position.copy(b.position).add(new THREE.Vector3(0.006, 0, 0));
    pages.rotation.y = b.rotation.y;
    y += bh;
  }
  return { bowl, lanternBase: new THREE.Vector3(-0.85, y, -0.27) };
}

// A brass lantern with glass panes and a glowing candle.
function lantern(K, pos, scale = 1, { light = true } = {}) {
  const brass = K.mats.brass({ polish: 0.6, age: 0.45 });
  const g = new THREE.Group();
  g.position.copy(pos);
  g.scale.setScalar(scale);
  K.group.add(g);
  const frame = [];
  frame.push(put(new THREE.CylinderGeometry(0.05, 0.055, 0.012, 24), { p: [0, 0.006, 0] }));
  frame.push(put(new THREE.CylinderGeometry(0.046, 0.05, 0.01, 24), { p: [0, 0.17, 0] }));
  frame.push(put(new THREE.ConeGeometry(0.05, 0.05, 24), { p: [0, 0.2, 0] }));
  frame.push(put(new THREE.TorusGeometry(0.016, 0.003, 8, 20), { p: [0, 0.235, 0] }));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    frame.push(put(new THREE.CylinderGeometry(0.0025, 0.0025, 0.16, 6), { p: [Math.cos(a) * 0.046, 0.09, Math.sin(a) * 0.046] }));
  }
  K.mesh(merge(frame), brass, { cast: true, parent: g });
  const glass = K.mats.acrylic({ tint: '#fff3dc', frost: 0.15 });
  const pane = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.155, 6, 1, true), glass);
  pane.position.y = 0.09;
  pane.renderOrder = 2;
  K.keep(pane.geometry);
  g.add(pane);
  const wax = K.mats.paint({ color: '#f4ead2', wear: 0, gloss: 0.3 });
  K.mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 20), wax, { parent: g }).position.y = 0.042;
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5, 1.6) });
  K.keep(flameMat);
  const flame = K.mesh(new THREE.SphereGeometry(0.006, 12, 10), flameMat, { receive: false, parent: g });
  flame.scale.set(1, 2.2, 1);
  flame.position.y = 0.086;
  const halo = K.mesh(new THREE.SphereGeometry(0.02, 16, 12), K.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.45, 0.12), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })), { receive: false, parent: g });
  halo.position.y = 0.09;
  let pl = null;
  if (light) {
    pl = new THREE.PointLight(col('#ffb45a'), 0.3 * scale * scale, 2.5 * scale, 2);
    pl.position.y = 0.1;
    g.add(pl);
  }
  const seed = pos.x * 13.1;
  K.animators.push((dt, time) => {
    if (REDUCED_MOTION.matches) return;
    const f = 1 + 0.06 * Math.sin(time * 9 + seed) + 0.04 * Math.sin(time * 23 + seed * 2);
    flame.scale.set(1, 2.2 * f, 1);
    if (pl) pl.intensity = 0.3 * scale * scale * f;
  });
  return g;
}

// ------------------------------------------------------------ the room

function skyTex(K) {
  return canvasTex(K, 1024, 768, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a2a6a');
    g.addColorStop(0.35, '#6a4a9a');
    g.addColorStop(0.62, '#e0859a');
    g.addColorStop(0.78, '#ffc27a');
    g.addColorStop(1, '#ffd89a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = rng(4);
    // soft clouds
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = `rgba(255,${180 + rand() * 60},${170 + rand() * 60},${0.08 + rand() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(rand() * w, h * (0.2 + rand() * 0.4), 60 + rand() * 140, 10 + rand() * 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // stars
    for (let k = 0; k < 90; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`;
      ctx.fillRect(rand() * w, rand() * h * 0.3, 1.5, 1.5);
    }
    // far hills in violet haze, and a castle on the hill
    const hill = (y0, amp, colr, seed) => {
      const r2 = rng(seed);
      ctx.fillStyle = colr;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 - Math.sin(x * 0.006 + seed) * amp - r2() * 6);
      ctx.lineTo(w, h);
      ctx.fill();
    };
    const cx = w * 0.4;
    const cy = h * 0.8;
    ctx.fillStyle = '#5e4a88';
    for (const [dx, th, tw] of [[-50, 70, 18], [-20, 115, 20], [0, 175, 24], [24, 125, 19], [50, 80, 16], [-74, 45, 13]]) {
      ctx.fillRect(cx + dx - tw / 2, cy - th, tw, th + 70);
      ctx.beginPath();
      ctx.moveTo(cx + dx - tw / 2 - 5, cy - th);
      ctx.lineTo(cx + dx, cy - th - tw * 1.8);
      ctx.lineTo(cx + dx + tw / 2 + 5, cy - th);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd27a';
    for (let k = 0; k < 14; k++) ctx.fillRect(cx - 55 + rand() * 110, cy - 15 - rand() * 140, 3, 6);
    hill(h * 0.83, 22, '#8a64a8', 2);
    hill(h * 0.93, 14, '#4a3a66', 7);
    ctx.fillStyle = '#ffcf80';
    for (let k = 0; k < 30; k++) ctx.fillRect(rand() * w, h * (0.94 + rand() * 0.05), 3, 3);
  });
}

function spineTex(K) {
  return canvasTex(K, 512, 256, (ctx, w, h) => {
    const rand = rng(12);
    let x = 0;
    const cols = ['#5a2a1e', '#2a3a5a', '#4a3a22', '#6a4a2a', '#2e4a32', '#6a2a2a', '#3a2a4a', '#7a5a30', '#243048'];
    while (x < w) {
      const bw = 10 + rand() * 18;
      const bh = h * (0.7 + rand() * 0.3);
      ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
      ctx.fillRect(x, h - bh, bw - 1, bh);
      ctx.fillStyle = 'rgba(230,190,110,0.55)';
      ctx.fillRect(x + 2, h - bh + 12, bw - 5, 2);
      ctx.fillRect(x + 2, h - 22, bw - 5, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + bw - 3, h - bh, 2, bh);
      x += bw;
    }
  }, { repeat: true });
}

function plasterTex(K) {
  return canvasTex(K, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#5a3c26';
    ctx.fillRect(0, 0, w, h);
    const rand = rng(17);
    speckle(ctx, w, h, rand, 3000, 2, 12, ['#4a301e', '#6a4a30', '#553a24'], 0.2);
    // wide vertical boards
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = 'rgba(20,10,5,0.5)';
      ctx.fillRect(x, 0, 2, h);
    }
  }, { repeat: true });
}

function buildRoom(K) {
  const wallMat = K.phys({ map: plasterTex(K), roughness: 0.8 });
  wallMat.map.repeat.set(4, 2);
  // back wall and a side wall, well behind the table
  const back = K.mesh(new THREE.PlaneGeometry(6, 3.2), wallMat);
  back.position.set(0, 0.6, -1.9);
  const left = K.mesh(new THREE.PlaneGeometry(4, 3.2), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-2.6, 0.6, 0);
  const right = K.mesh(new THREE.PlaneGeometry(4, 3.2), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(2.6, 0.6, 0);
  const floor = K.mesh(new THREE.PlaneGeometry(6, 5), K.phys({ color: col('#2a1a10'), roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.8;

  // bookshelves along the back wall, left and centre
  const shelfWood = K.mats.wood({ species: 'walnut', mapping: 'object', finish: 'oiled', grain: 'x', scale: 3 });
  const spines = K.phys({ map: spineTex(K), roughness: 0.7 });
  const shelfParts = [];
  const bookParts = [];
  for (const [x0, x1] of [[-2.2, -0.35]]) {
    const w = x1 - x0;
    for (let k = 0; k < 6; k++) {
      const y = -0.5 + k * 0.38;
      shelfParts.push(put(new THREE.BoxGeometry(w, 0.03, 0.32), { p: [(x0 + x1) / 2, y, -1.72] }));
      if (k < 5) {
        const g = new THREE.PlaneGeometry(w - 0.04, 0.3);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * w * 1.6 + k * 0.37);
        bookParts.push(put(g, { p: [(x0 + x1) / 2, y + 0.165, -1.62] }));
      }
    }
    shelfParts.push(put(new THREE.BoxGeometry(0.04, 2.3, 0.34), { p: [x0, 0.4, -1.72] }));
    shelfParts.push(put(new THREE.BoxGeometry(0.04, 2.3, 0.34), { p: [x1, 0.4, -1.72] }));
  }
  K.mesh(merge(shelfParts), shelfWood);
  spines.map.wrapS = THREE.RepeatWrapping;
  K.mesh(merge(bookParts), spines);

  // the window at the back right with the sunset
  const sky = new THREE.MeshBasicMaterial({ map: skyTex(K), color: new THREE.Color(1.5, 1.5, 1.5) });
  K.keep(sky);
  const wx = 0.95;
  const wy = 0.62;
  const ww = 1.3;
  const wh = 1.2;
  const view = K.mesh(new THREE.PlaneGeometry(ww, wh), sky, { receive: false });
  view.position.set(wx, wy, -1.88);
  const frameMat = K.mats.wood({ species: 'walnut', mapping: 'object', finish: 'oiled', grain: 'y', scale: 2 });
  const fr = [];
  fr.push(put(new THREE.BoxGeometry(ww + 0.12, 0.08, 0.1), { p: [wx, wy + wh / 2 + 0.04, -1.84] }));
  fr.push(put(new THREE.BoxGeometry(ww + 0.2, 0.06, 0.2), { p: [wx, wy - wh / 2 - 0.03, -1.8] }));
  fr.push(put(new THREE.BoxGeometry(0.08, wh + 0.1, 0.1), { p: [wx - ww / 2 - 0.04, wy, -1.84] }));
  fr.push(put(new THREE.BoxGeometry(0.08, wh + 0.1, 0.1), { p: [wx + ww / 2 + 0.04, wy, -1.84] }));
  fr.push(put(new THREE.BoxGeometry(0.04, wh, 0.05), { p: [wx, wy, -1.85] }));
  fr.push(put(new THREE.BoxGeometry(ww, 0.04, 0.05), { p: [wx, wy + 0.2, -1.85] }));
  K.mesh(merge(fr), frameMat);
  // a curtain at the window's left, in deep red velvet
  const curtain = new THREE.PlaneGeometry(0.4, 2.0, 24, 1);
  const cp = curtain.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 40) * 0.03);
  curtain.computeVertexNormals();
  const cm = K.mesh(curtain, K.phys({ color: col('#5a1a1a'), roughness: 0.8, sheen: 1, sheenColor: col('#c05050'), sheenRoughness: 0.5, side: THREE.DoubleSide }));
  cm.position.set(wx - ww / 2 - 0.2, 0.55, -1.75);

  // lanterns: one on the book stack, one hanging high in the middle, one on a shelf
  return { view };
}

// ------------------------------------------------------------ fireflies

// Little golden sparks drifting round the top of the run like the glowing
// fairies in the story, bright enough to bloom.
function buildFireflies(K) {
  const n = { high: 28, medium: 20, low: 12 }[K.tier] || 20;
  const rand = rng(51);
  const base = [];
  for (let i = 0; i < n; i++) base.push({ x: -0.5 + rand() * 1.0, y: 0.28 + rand() * 0.3, z: -0.25 + rand() * 0.3, p: rand() * 10, s: 0.4 + rand() * 0.6 });
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: new THREE.Color(6, 4.2, 1.4), size: 2.5, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  K.keep(geo);
  K.keep(mat);
  K.group.add(pts);
  const tick = (time) => {
    for (let i = 0; i < n; i++) {
      const b = base[i];
      const t = time * 0.25 * b.s + b.p;
      pos[i * 3] = b.x + Math.sin(t) * 0.05;
      pos[i * 3 + 1] = b.y + Math.sin(t * 1.7) * 0.03;
      pos[i * 3 + 2] = b.z + Math.cos(t * 0.8) * 0.04;
    }
    geo.attributes.position.needsUpdate = true;
  };
  tick(0);
  K.animators.push((dt, time) => {
    if (!REDUCED_MOTION.matches) tick(time);
  });
}

// ------------------------------------------------------------ light

function buildLights(K) {
  // the key: warm lamplight from the front left, casting soft shadows
  const key = new THREE.DirectionalLight(col('#ffd2a0'), 3.4);
  key.name = 'sun';
  K.group.add(key, key.target);
  const q = K.quality;
  key.castShadow = !!q.shadows;
  key.shadow.mapSize.set(q.shadowSize || 2048, q.shadowSize || 2048);
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.0012;
  key.shadow.radius = 4;
  key.shadow.blurSamples = 12;
  const dist = 4;
  const center = CASTERS.getCenter(new THREE.Vector3());
  const basis = new THREE.Matrix4().lookAt(KEY_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const inv = basis.clone().invert();
  const lo = new THREE.Vector2(Infinity, Infinity);
  const hi = new THREE.Vector2(-Infinity, -Infinity);
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? CASTERS.max.x : CASTERS.min.x, i & 2 ? CASTERS.max.y : CASTERS.min.y, i & 4 ? CASTERS.max.z : CASTERS.min.z).sub(center).applyMatrix4(inv);
    lo.min(new THREE.Vector2(c.x, c.y));
    hi.max(new THREE.Vector2(c.x, c.y));
  }
  const off = new THREE.Vector3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0).applyMatrix4(basis);
  const aim = center.clone().add(off);
  key.target.position.copy(aim);
  key.position.copy(aim).addScaledVector(KEY_DIR, dist);
  const cam = key.shadow.camera;
  const hw = (hi.x - lo.x) / 2 + 0.02;
  const hh = (hi.y - lo.y) / 2 + 0.02;
  cam.left = -hw;
  cam.right = hw;
  cam.top = hh;
  cam.bottom = -hh;
  cam.near = 0.5;
  cam.far = dist + 1.5;
  cam.updateProjectionMatrix();
  key.updateMatrixWorld();
  key.target.updateMatrixWorld();

  // violet dusk from the window, from behind on the right: a rim on the run
  const rim = new THREE.DirectionalLight(col('#b9a0ff'), 0.9);
  rim.position.set(0.9, 0.9, -1.6);
  K.group.add(rim);
  // warm room fill and dark wood bounce
  const hemi = new THREE.HemisphereLight(col('#ffe2bc'), col('#5a3218'), 0.55);
  K.group.add(hemi);
  return key;
}

// ------------------------------------------------------------ environment

async function captureEnvironment(K, envIntensity) {
  const size = K.quality.envSize || 256;
  const pmrem = new THREE.PMREMGenerator(K.renderer);
  const blank = pmrem.fromScene(new THREE.Scene(), 0, 0.1, 1, { size });
  const scene = new THREE.Scene();
  scene.environment = blank.texture;
  scene.environmentIntensity = 0;
  scene.add(K.group);
  const at = new THREE.Vector3(-0.05, 0.25, 0.1);
  const cam = new THREE.PerspectiveCamera(90, 1, 0.03, 60);
  cam.position.copy(at);
  if (K.renderer.compileAsync) {
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const prev = K.renderer.getRenderTarget();
    K.renderer.setRenderTarget(target);
    const done = K.renderer.compileAsync(scene, cam);
    K.renderer.setRenderTarget(prev);
    await done;
    target.dispose();
  }
  const first = pmrem.fromScene(scene, 0.01, 0.03, 60, { size, position: at });
  scene.environment = first.texture;
  scene.environmentIntensity = envIntensity;
  const rt = pmrem.fromScene(scene, 0.01, 0.03, 60, { size, position: at });
  first.dispose();
  pmrem.dispose();
  blank.dispose();
  scene.remove(K.group);
  K.keep(rt);
  return rt;
}

// ------------------------------------------------------------ entry

export async function createStorybookSetting({ renderer, quality, mats }) {
  const K = new Kit(renderer, quality, mats);
  buildTable(K);
  buildBook(K);
  buildLandscape(K);
  const { bowl, lanternBase } = buildProps(K);
  buildRoom(K);
  lantern(K, lanternBase, 1.0);
  lantern(K, new THREE.Vector3(0.05, 0.85, -0.7), 0.9, { light: true });
  lantern(K, new THREE.Vector3(-1.4, 0.64, -1.62), 0.9, { light: false });
  lantern(K, new THREE.Vector3(-0.7, 0.26, -1.62), 0.8, { light: false });
  buildFireflies(K);
  const sun = buildLights(K);
  const environmentIntensity = 0.9;
  const env = await captureEnvironment(K, environmentIntensity);
  return {
    group: K.group,
    environment: env.texture,
    environmentIntensity,
    background: null,
    exposure: 0.95,
    bloom: { strength: 0.32, threshold: 1.6, radius: 0.6 },
    grade: {
      white: [1.03, 1.0, 0.94],
      power: 1.18,
      lookSaturation: 1.3,
      saturation: 1.04,
      contrast: 0.1,
      shadowTint: [0.004, 0.0, 0.01],
      highTint: [0.008, 0.003, -0.006],
      vignette: 0.32,
      grain: 0.02,
      fringe: 0.004,
    },
    sun,
    bowl: { position: new THREE.Vector3(BOWL.x, TABLE_Y, BOWL.z), innerRadius: BOWL.inner, rimHeight: BOWL.rim, floorY: BOWL.floorY, object: bowl },
    camera: {
      target: new THREE.Vector3(-0.02, 0.19, 0.0),
      distance: 1.25,
      azimuth: THREE.MathUtils.degToRad(-4),
      elevation: THREE.MathUtils.degToRad(19),
      fov: 34,
    },
    focus: new THREE.Vector3(-0.02, 0.18, 0.03),
    update(dt, time) {
      for (const a of K.animators) a(dt, time);
    },
    dispose() {
      K.group.removeFromParent();
      const owned = new Set(K.bin);
      K.group.traverse((o) => {
        if (o.geometry) owned.add(o.geometry);
        if (o.shadow && o.shadow.map) owned.add(o.shadow);
      });
      for (const x of owned) x.dispose?.();
      K.bin.length = 0;
    },
  };
}
