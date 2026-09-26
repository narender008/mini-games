// Sunset Lake: a calm mountain lake at golden hour. Pine forest runs down to
// pebbly shores, a wooden jetty with a red boathouse and two rowing boats
// sits in the east bay, lily pads and reeds fill the quiet corners, and a
// pine island with a granite point stands in the middle. Snowy mountains
// ring the far side, lit pink by the low sun, and the water holds a long
// golden path of glitter towards the sunset.
import * as THREE from 'three';
import { rng } from '../config.js';
import { dirFrom } from '../sky.js';
import { makeNoise, islandHeight, smax, smoothstep, rockGeometry, rockMaterial, instances, canvasTexture, merge } from './common.js';
import { makePines, makeForest } from './pines.js';

const noise = makeNoise(34);
const LAKE_R = 300;

// the lake's shore distance from the middle, by direction
function shoreR(a) {
  const n = noise.fbm(Math.cos(a) * 1.5 + 4, Math.sin(a) * 1.5 - 2, 4);
  return LAKE_R * (1 + 0.16 * Math.cos(2 * (a - 0.35))) + n * 110;
}

const ISLANDS = [
  { x: -30, z: -170, r: 40, top: 3.4, p: 2.1, hill: 3.5, seed: 3.3, wobble: 0.22 }, // pine island
  { x: -150, z: 40, r: 9, top: 2.2, p: 1.4, seed: 8.1, slope: 0.25 }, // granite islet
];

// big granite boulders standing in open water
const ROCKS = [
  { x: 32, z: -118, r: 2.6 },
  { x: 40, z: -126, r: 1.6 },
  { x: -138, z: 55, r: 2.2 },
  { x: -166, z: 30, r: 1.8 },
  { x: 190, z: 130, r: 2.4 },
];

// the jetty runs out from the east shore towards the middle
const JETTY_A = 0.12; // direction from the middle to its shore end
const JETTY = (() => {
  const R = shoreR(JETTY_A);
  const ux = -Math.cos(JETTY_A);
  const uz = -Math.sin(JETTY_A);
  const len = 34;
  const x0 = Math.cos(JETTY_A) * (R + 3);
  const z0 = Math.sin(JETTY_A) * (R + 3);
  return { x0, z0, ux, uz, len, width: 2.4, head: 11, R };
})();

function inJetty(x, z, pad = 0) {
  const dx = x - JETTY.x0;
  const dz = z - JETTY.z0;
  const along = dx * JETTY.ux + dz * JETTY.uz;
  const across = dx * -JETTY.uz + dz * JETTY.ux;
  if (along < -2 || along > JETTY.len + JETTY.width * 0.5 + pad) return false;
  if (Math.abs(across) < JETTY.width * 0.5 + pad) return true;
  // the T at the end, with the two rowing boats tied alongside
  if (along > JETTY.len - 3 - pad && Math.abs(across) < JETTY.head * 0.5 + pad) return true;
  return along > JETTY.len - 8.5 - pad && Math.abs(across) < 3 + pad;
}

export function height(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const s = r - shoreR(a); // metres from the shore, + on land
  const n = noise.fbm(x * 0.012 + 3, z * 0.012, 4);
  let h = s < 0 ? Math.max(-12 + n * 2, s * 0.09) : s * 0.07;
  h += n * 0.5;
  // forested hills rising behind the shore
  const hills = 0.5 + 0.5 * noise.fbm(x * 0.0045 + 7, z * 0.0045 - 1, 4);
  h += hills * 42 * smoothstep(8, 190, s);
  for (const isl of ISLANDS) {
    if (Math.abs(x - isl.x) > 110 || Math.abs(z - isl.z) > 110) continue;
    h = smax(h, islandHeight(isl, x, z, noise), 1.5);
  }
  return h;
}

export function solid(x, z) {
  if (height(x, z) > -0.7) return true;
  for (const r of ROCKS) if (Math.hypot(x - r.x, z - r.z) < r.r * 1.05) return true;
  return inJetty(x, z, 0.8);
}

const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const PLACE = {
  id: 'lake',
  area: { minX: -440, maxX: 440, minZ: -440, maxZ: 440 },
  terrain: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
  height,
  solid,
  spawn: { x: -30, z: 120, heading: 0.15 },
  sky: {
    sunDir: dirFrom(8, 5.5),
    sunColor: C('#ffc27a', 3.4),
    zenith: C('#2d56b4', 0.78),
    horizon: C('#ffae72', 1.1),
    ground: C('#3b3040', 0.45),
    glow: C('#ff9a48', 1.25),
    gradient: 0.6,
    glowWidth: 14,
    glowStrength: 1.6,
    sunSize: 1.0,
    cloud: { cover: 0.36, soft: 0.28, bright: 1.25, scale: 1.3, lit: C('#ffd2ae'), shade: C('#9a7898') },
  },
  light: {
    sun: C('#ffbe7d'),
    sunIntensity: 2.6,
    hemiSky: C('#95a3d0'),
    hemiGround: C('#6b5444'),
    hemi: 0.42,
    env: 0.85,
  },
  exposure: 1.05,
  fog: 0.00028,
  bloom: { strength: 0.22, threshold: 1.9, radius: 0.5 },
  grade: { saturation: 1.16, contrast: 0.12, vignette: 0.2 },
  water: {
    // clear mountain water with a peaty green-brown tint in the depths
    absorb: [0.5, 0.2, 0.28],
    scatter: C('#233a2a', 0.3),
    ambient: C('#b8a8c0', 0.8),
    ripples: 0.5,
    refraction: 0.03,
    caustics: 0.7,
    roughness: 0.05,
    shoreFoam: 0.45,
    reflection: 1,
    glitter: 1.25,
    fog: 0.00028,
    wind: [0.5, 0.3],
    swell: [
      { dir: 30, length: 22, amp: 0.035 },
      { dir: 75, length: 12, amp: 0.018 },
      { dir: -20, length: 7, amp: 0.008 },
    ],
  },
  ground: {
    sand: '#b3a07e',
    wet: '#6b5d49',
    bed: '#6a6048',
    grass: '#2f3d1c',
    grass2: '#4a5626',
    rock: '#6b665f',
    coral: false,
    grassLevel: 0.9,
    rockSlope: 0.5,
    wetTop: 0.3,
  },
  animals: { dolphins: false, turtles: 0, fish: 'lake', birds: 'swallow', ducks: 4 },
  bumps: [
    { x: -60, z: 30, angle: 0.3 },
    { x: 150, z: 40, angle: 1.9 },
    { x: -100, z: -110, angle: 2.8 },
    { x: 140, z: -60, angle: 2.3 },
    { x: -220, z: -60, angle: 1.1 },
    { x: 60, z: 220, angle: 3.6 },
  ],
  // Big kid course: out past the jetty, right round the pine island and home
  course: {
    gate: { x: 0, z: 60, angle: 0, width: 14 },
    buoys: [
      [40, -40],
      [70, -150],
      [30, -250],
      [-60, -262],
      [-112, -160],
      [-70, -50],
    ],
  },
  ramps: [
    { x: -120, z: -40, angle: 0.6 },
    { x: 90, z: 120, angle: 2.8 },
    { x: -130, z: 170, angle: 0.9 },
  ],
};

// ------------------------------------------------------------ scenery

function plankTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(41);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const y = (i * h) / n;
      const l = 36 + r() * 12;
      g.fillStyle = `hsl(${28 + r() * 8}, ${28 + r() * 10}%, ${l}%)`;
      g.fillRect(0, y, w, h / n);
      // grain
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(${40 + r() * 30}, ${25 + r() * 20}, ${15 + r() * 10}, ${0.08 + r() * 0.12})`;
        g.fillRect(r() * w, y + r() * (h / n), 20 + r() * 80, 1);
      }
      g.fillStyle = 'rgba(20, 12, 6, 0.8)';
      g.fillRect(0, y, w, 2);
      // nail heads
      g.fillStyle = 'rgba(40, 40, 40, 0.8)';
      for (const x of [w * 0.1, w * 0.6]) g.fillRect(x, y + 6, 2, 2), g.fillRect(x, y + h / n - 8, 2, 2);
    }
  }, { repeat: true });
}

function boardTexture(base, trim) {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(43);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x = (i * w) / n;
      g.fillStyle = 'rgba(0, 0, 0, 0.25)';
      g.fillRect(x, 0, 2, h);
      g.fillStyle = 'rgba(255, 255, 255, 0.06)';
      g.fillRect(x + 3, 0, 3, h);
      for (let k = 0; k < 16; k++) {
        g.fillStyle = `rgba(0, 0, 0, ${0.04 + r() * 0.06})`;
        g.fillRect(x + r() * (w / n), r() * h, 1, 10 + r() * 40);
      }
    }
    if (trim) {
      g.fillStyle = trim;
      g.fillRect(0, 0, w, 6);
    }
  }, { repeat: true });
}

const wood = () => new THREE.MeshStandardMaterial({ color: 0x6a5140, roughness: 0.85 });

function jettyMesh() {
  const g = new THREE.Group();
  const deckMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.8 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4d3b2d, roughness: 0.9 });
  const Y = 0.9;
  const deck = new THREE.BoxGeometry(JETTY.len + 2, 0.18, JETTY.width);
  deck.translate((JETTY.len + 2) / 2 - 2, Y, 0);
  const uv = deck.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (JETTY.len + 2) / 3, uv.getY(i));
  const head = new THREE.BoxGeometry(JETTY.width + 0.6, 0.18, JETTY.head);
  head.translate(JETTY.len - 1, Y, 0);
  const deckMesh = new THREE.Mesh(merge([deck, head]), deckMat);
  deckMesh.castShadow = deckMesh.receiveShadow = true;
  g.add(deckMesh);
  const posts = [];
  for (let d = 0; d <= JETTY.len; d += 3.4) {
    for (const s of [-1, 1]) posts.push({ x: d, y: -1.2, z: s * (JETTY.width * 0.5 + 0.05) });
  }
  for (const s of [-1, 1]) for (const k of [0.5, 1]) posts.push({ x: JETTY.len - 1, y: -1.2, z: s * JETTY.head * 0.5 * k });
  const post = new THREE.CylinderGeometry(0.14, 0.16, 3.3, 8);
  g.add(instances(post, postMat, posts));
  // mooring bollards and a little lantern post on the end
  const bollard = new THREE.CylinderGeometry(0.12, 0.14, 0.45, 10);
  g.add(instances(bollard, postMat, [{ x: JETTY.len - 1, y: Y + 0.3, z: JETTY.head * 0.45 }, { x: JETTY.len - 1, y: Y + 0.3, z: -JETTY.head * 0.45 }]));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 }));
  pole.position.set(JETTY.len - 0.4, Y + 1.2, 0);
  g.add(pole);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffb866, emissiveIntensity: 3 }));
  lamp.position.set(JETTY.len - 0.4, Y + 2.5, 0);
  g.add(lamp);
  // a ladder down into the water
  const rail = new THREE.BoxGeometry(0.06, 1.6, 0.06);
  const rung = new THREE.BoxGeometry(0.06, 0.05, 0.5);
  const lad = [];
  for (const s of [-0.25, 0.25]) {
    const r2 = rail.clone();
    r2.translate(JETTY.len + 0.15, Y - 0.5, s);
    lad.push(r2);
  }
  for (let k = 0; k < 4; k++) {
    const r3 = rung.clone();
    r3.translate(JETTY.len + 0.15, Y - 0.1 - k * 0.35, 0);
    lad.push(r3);
  }
  g.add(new THREE.Mesh(merge(lad), new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.3, metalness: 0.9 })));
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

// a clinker-built rowing boat, painted, with a wooden interior and two thwarts
function rowingBoat(colour) {
  const g = new THREE.Group();
  const L = 3.6;
  const B = 1.3;
  const D = 0.55;
  const seg = 16;
  const ring = 9;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const zz = (t - 0.5) * L;
    const w = Math.pow(Math.sin(t * Math.PI), 0.6) * B * 0.5;
    const sheer = D + Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.18;
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI;
      pos.push(Math.cos(a) * w, -Math.sin(a) * sheer * 0.9 + sheer * 0.1, zz);
      uv.push(t * 1.5, j / ring);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j;
      const b = a + ring + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const outside = new THREE.Mesh(hull, new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.4, side: THREE.FrontSide }));
  const inside = new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ map: plankTexture(), color: 0xc9a27e, roughness: 0.8, side: THREE.BackSide }));
  g.add(outside, inside);
  const gunwale = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40), new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.6 }));
  gunwale.scale.set(B * 0.5, L * 0.5, 1);
  gunwale.rotation.x = Math.PI / 2;
  gunwale.position.y = D * 0.1 + 0.02;
  g.add(gunwale);
  for (const zz of [-0.6, 0.5]) {
    const thwart = new THREE.Mesh(new THREE.BoxGeometry(B * 0.92, 0.05, 0.28), new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.7 }));
    thwart.position.set(0, -0.1, zz);
    g.add(thwart);
  }
  // a pair of oars resting across
  const oar = new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6);
  oar.rotateZ(Math.PI / 2);
  const blade = new THREE.BoxGeometry(0.45, 0.02, 0.14);
  blade.translate(1.2, 0, 0);
  const oars = new THREE.Mesh(merge([oar, blade]), new THREE.MeshStandardMaterial({ color: 0xc8a57a, roughness: 0.6 }));
  oars.position.set(0.1, 0.02, -0.1);
  oars.rotation.y = 0.2;
  g.add(oars);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

// the falu-red boathouse at the root of the jetty, with white trim and a
// warm light inside
function boathouse() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ map: boardTexture('#8e2f22', null), roughness: 0.85 });
  const white = new THREE.MeshStandardMaterial({ color: 0xece6dc, roughness: 0.6 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x35302d, roughness: 0.75 });
  const W = 6;
  const L = 8;
  const H = 3;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), red);
  walls.position.y = H / 2;
  g.add(walls);
  // gable roof
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2 - 0.4, 0);
  shape.lineTo(0, 2.4);
  shape.lineTo(W / 2 + 0.4, 0);
  shape.lineTo(W / 2 + 0.1, 0);
  shape.lineTo(0, 2.1);
  shape.lineTo(-W / 2 - 0.1, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: L + 0.8, bevelEnabled: false }), roofMat);
  roof.position.set(0, H, -L / 2 - 0.4);
  g.add(roof);
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-W / 2, 0);
  gableShape.lineTo(0, 2.1);
  gableShape.lineTo(W / 2, 0);
  for (const s of [-1, 1]) {
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), red);
    gable.position.set(0, H, s * L / 2);
    if (s < 0) gable.rotation.y = Math.PI;
    g.add(gable);
  }
  // corner boards and the big doors facing the water (+z)
  const corner = new THREE.BoxGeometry(0.2, H, 0.2);
  const corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = corner.clone();
    c.translate(sx * W / 2, H / 2, sz * L / 2);
    corners.push(c);
  }
  g.add(new THREE.Mesh(merge(corners), white));
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a1c16, emissive: 0xffa04a, emissiveIntensity: 0.25, roughness: 0.9 }));
  door.position.set(0, 1.15, L / 2 + 0.02);
  g.add(door);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 4, 4, Math.PI), white);
  frame.scale.set(1.7, 2.3, 1);
  frame.rotation.z = 0;
  frame.position.set(0, 0.02, L / 2 + 0.05);
  g.add(frame);
  // a lit window on each side
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.8), new THREE.MeshStandardMaterial({ color: 0x331a0a, emissive: 0xffb45e, emissiveIntensity: 1.6 }));
    win.position.set(s * (W / 2 + 0.02), 1.8, 0);
    win.rotation.y = s * Math.PI / 2;
    g.add(win);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 1.2), white);
    trim.position.set(s * (W / 2 + 0.01), 1.8, 0);
    g.add(trim);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

// a little cabin up the slope with a chimney and warm windows
function cabin() {
  const g = boathouse();
  g.scale.set(1.1, 1.05, 0.9);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x6d625a, roughness: 0.9 }));
  chimney.position.set(1.2, 4.6, -1.5);
  chimney.castShadow = true;
  g.add(chimney);
  return g;
}

function lilyPadGeometry() {
  const g = new THREE.CircleGeometry(0.42, 22, 0.25, Math.PI * 2 - 0.5);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  // a gentle cup, rim just lifted
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    p.setY(i, r * r * 0.12);
  }
  g.computeVertexNormals();
  return g;
}

function lilyFlowerGeometry() {
  const parts = [];
  for (let k = 0; k < 2; k++) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const petal = new THREE.SphereGeometry(0.1, 8, 6);
      petal.scale(0.45, 0.25, 1);
      petal.translate(0, 0.02, 0.09);
      petal.rotateX(-0.35 - k * 0.45);
      petal.rotateY((i / n) * Math.PI * 2 + k * 0.4);
      parts.push(petal.toNonIndexed());
    }
  }
  const heart = new THREE.SphereGeometry(0.035, 8, 6).toNonIndexed();
  heart.translate(0, 0.05, 0);
  return { petals: merge(parts), heart };
}

function reedGeometry(seed) {
  const r = rng(seed);
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const h = 1.2 + r() * 1.1;
    const blade = new THREE.ConeGeometry(0.018, h, 4, 1, true);
    blade.translate(0, h / 2, 0);
    blade.rotateX((r() - 0.5) * 0.3);
    blade.rotateZ((r() - 0.5) * 0.3);
    blade.translate((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9);
    parts.push(blade.toNonIndexed());
    // bulrush heads on a few
    if (r() < 0.3) {
      const head = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6).toNonIndexed();
      head.translate(0, h - 0.25, 0);
      head.rotateX((r() - 0.5) * 0.3);
      parts.push(head);
    }
  }
  return merge(parts);
}

// the ring of far mountains, with snow on the tops, forest on the lower
// slopes and rock between; the haze melts them into the evening sky
function mountains() {
  const segA = 900;
  const segR = 44;
  const r0 = 1700;
  const r1 = 4400;
  const pos = [];
  const col = [];
  const idx = [];
  const n = makeNoise(77);
  const snow = new THREE.Color('#f4efe9');
  const rock = new THREE.Color('#6c655f');
  const forest = new THREE.Color('#29361f');
  const c = new THREE.Color();
  const H = (a, t) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rr = r0 + (r1 - r0) * t;
    const x = ca * rr;
    const z = sa * rr;
    // ridged noise for sharp crests and gullies, rising away from the lake
    let ridge = 0;
    let amp = 0.5;
    let f = 0.0011;
    for (let o = 0; o < 6; o++) {
      ridge += (1 - Math.abs(n.noise(x * f + o * 17, z * f - o * 9))) ** 2 * amp;
      amp *= 0.5;
      f *= 2.1;
    }
    const range = 0.55 + 0.45 * (0.5 + 0.5 * n.fbm(ca * 1.2 + 2, sa * 1.2, 3));
    const profile = smoothstep(0, 0.7, t);
    return (ridge * 820 * range + 60) * profile - 40;
  };
  for (let i = 0; i <= segA; i++) {
    const a = (i / segA) * Math.PI * 2;
    for (let j = 0; j <= segR; j++) {
      const t = j / segR;
      const rr = r0 + (r1 - r0) * t;
      const h = H(a, t);
      pos.push(Math.cos(a) * rr, h, Math.sin(a) * rr);
      const slope = Math.abs(H(a, Math.min(1, t + 0.02)) - h) / ((r1 - r0) * 0.02);
      const sn = smoothstep(430, 560, h + n.noise(a * 40, t * 9) * 80) * (1 - smoothstep(0.9, 1.4, slope) * 0.6);
      const fo = 1 - smoothstep(120, 300, h + n.noise(a * 30 + 5, t * 7) * 60);
      c.copy(rock).lerp(forest, fo).lerp(snow, sn);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segA; i++) {
    for (let j = 0; j < segR; j++) {
      const a = i * (segR + 1) + j;
      const b = a + segR + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.name = 'mountains';
  return m;
}

export async function build({ quality, textures }) {
  const group = new THREE.Group();
  group.name = 'lake';
  const r = rng(51);
  const low = quality.tier === 'low';

  // detailed pines along the shores and on the island, and a dense simple
  // forest on the hills behind them
  const spots = [];
  const far = [];
  const tier = quality.tier;
  const maxTrees = tier === 'high' ? 700 : tier === 'medium' ? 450 : 260;
  const maxFar = tier === 'high' ? 6000 : tier === 'medium' ? 4000 : 2200;
  let tries = 0;
  const glade = (x, z) => noise.fbm(x * 0.02 + 40, z * 0.02, 3) > 0.25;
  while (spots.length < maxTrees * 0.85 && tries++ < 40000) {
    const a = r() * Math.PI * 2;
    const s = 3 + Math.pow(r(), 1.3) * 60;
    const R = shoreR(a) + s;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    if (inJetty(x, z, 14) || glade(x, z)) continue;
    const h = height(x, z);
    if (h < 0.9) continue;
    spots.push({ x, y: h - 0.2, z, ry: r() * Math.PI * 2, s: 0.75 + r() * 0.5 });
  }
  tries = 0;
  while (far.length < maxFar && tries++ < 80000) {
    const a = r() * Math.PI * 2;
    const R = shoreR(a) + 40 + r() * 300;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    if (Math.abs(x) > 595 || Math.abs(z) > 595 || glade(x, z)) continue;
    const h = height(x, z);
    if (h < 2) continue;
    far.push({ x, y: h - 0.3, z, ry: r() * Math.PI * 2, s: 0.8 + r() * 0.6, sy: 0.85 + r() * 0.4 });
  }
  const isl = ISLANDS[0];
  for (let i = 0; i < 400 && spots.length < maxTrees; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * isl.r;
    const x = isl.x + Math.cos(a) * d;
    const z = isl.z + Math.sin(a) * d;
    const h = height(x, z);
    if (h < 0.8) continue;
    spots.push({ x, y: h - 0.2, z, ry: r() * Math.PI * 2, s: 0.8 + r() * 0.45 });
  }
  group.add(makeForest(far, 2));
  const pines = makePines(spots, 2);
  group.add(pines);

  // granite: boulders in the water, along the shores and on the islet
  const rockMat = rockMaterial(textures.noise, 0x77716a, { lichen: 0.8 });
  const rockGeos = [rockGeometry(5), rockGeometry(9), rockGeometry(14)];
  const rocks = [[], [], []];
  ROCKS.forEach((rk, i) => rocks[i % 3].push({ x: rk.x, y: -0.5, z: rk.z, s: rk.r, sy: 0.9 + r() * 0.4, ry: r() * 6 }));
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2;
    const R = shoreR(a) + (r() - 0.6) * 6;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    if (inJetty(x, z, 10)) continue;
    rocks[i % 3].push({ x, y: height(x, z) - 0.3, z, s: 0.5 + r() * r() * 2.2, sy: 0.7 + r() * 0.4, ry: r() * 6 });
  }
  const islet = ISLANDS[1];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = r() * islet.r * 0.8;
    const x = islet.x + Math.cos(a) * d;
    const z = islet.z + Math.sin(a) * d;
    rocks[i % 3].push({ x, y: height(x, z) - 0.8, z, s: 2 + r() * 2.5, sy: 0.6 + r() * 0.3, ry: r() * 6 });
  }
  rockGeos.forEach((geo, k) => group.add(instances(geo, rockMat, rocks[k])));

  // jetty, boathouse, rowing boats and the cabin in the east bay
  const jetty = jettyMesh();
  jetty.position.set(JETTY.x0, 0, JETTY.z0);
  jetty.rotation.y = Math.atan2(-JETTY.uz, JETTY.ux);
  group.add(jetty);
  const across = { x: -JETTY.uz, z: JETTY.ux };
  const bobbing = [];
  [[0x2f6e8e, 1], [0xe8e0d0, -1]].forEach(([colour, side], k) => {
    const b = rowingBoat(colour);
    const d = JETTY.len - 5 - k * 1.5;
    b.position.set(JETTY.x0 + JETTY.ux * d + across.x * side * 2.2, 0.08, JETTY.z0 + JETTY.uz * d + across.z * side * 2.2);
    b.rotation.y = Math.atan2(JETTY.ux, JETTY.uz) + 0.08 * side;
    b.userData.phase = k * 1.7;
    group.add(b);
    bobbing.push(b);
  });
  const house = boathouse();
  {
    const back = 7;
    const x = JETTY.x0 - JETTY.ux * back + across.x * 9;
    const z = JETTY.z0 - JETTY.uz * back + across.z * 9;
    house.position.set(x, Math.max(0.4, height(x, z)), z);
    house.rotation.y = Math.atan2(JETTY.ux, JETTY.uz);
    group.add(house);
  }
  const hut = cabin();
  {
    const back = 34;
    const x = JETTY.x0 - JETTY.ux * back - across.x * 10;
    const z = JETTY.z0 - JETTY.uz * back - across.z * 10;
    hut.position.set(x, height(x, z) - 0.2, z);
    hut.rotation.y = Math.atan2(JETTY.ux, JETTY.uz) + 0.2;
    group.add(hut);
  }

  // lily pads and flowers, and reed beds, in the shallow quiet corners
  const pads = [];
  const flowers = [];
  const reeds = [];
  tries = 0;
  while (pads.length < (low ? 500 : 1400) && tries++ < 60000) {
    const a = r() * Math.PI * 2;
    const R = shoreR(a);
    const x = Math.cos(a) * (R - 3 - r() * 22);
    const z = Math.sin(a) * (R - 3 - r() * 22);
    if (noise.fbm(x * 0.012 - 20, z * 0.012 + 5, 3) < 0.12) continue;
    const h = height(x, z);
    if (h > -0.4 || h < -1.6 || inJetty(x, z, 6)) continue;
    // a clump of pads round each seed spot
    for (let k = 0; k < 7; k++) {
      const px = x + (r() - 0.5) * 5;
      const pz = z + (r() - 0.5) * 5;
      pads.push({ x: px, y: 0.045, z: pz, ry: r() * 6.28, s: 0.7 + r() * 0.7 });
      if (r() < 0.07) flowers.push({ x: px + 0.1, y: 0.06, z: pz, ry: r() * 6, s: 0.9 + r() * 0.5 });
    }
  }
  tries = 0;
  while (reeds.length < (low ? 160 : 420) && tries++ < 40000) {
    const a = r() * Math.PI * 2;
    const R = shoreR(a);
    const x = Math.cos(a) * (R - r() * 6);
    const z = Math.sin(a) * (R - r() * 6);
    if (noise.fbm(x * 0.015 + 9, z * 0.015 - 30, 3) < 0.05) continue;
    const h = height(x, z);
    if (h > 0.3 || h < -0.7 || inJetty(x, z, 8)) continue;
    reeds.push({ x, y: Math.min(0, h) - 0.1, z, ry: r() * 6, s: 0.8 + r() * 0.6 });
  }
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3d6a2a, roughness: 0.4, side: THREE.DoubleSide });
  group.add(instances(lilyPadGeometry(), padMat, pads, { shadow: false }));
  const flower = lilyFlowerGeometry();
  group.add(instances(flower.petals, new THREE.MeshStandardMaterial({ color: 0xffe8ee, roughness: 0.5, emissive: 0x402830, emissiveIntensity: 0.2 }), flowers, { shadow: false }));
  group.add(instances(flower.heart, new THREE.MeshStandardMaterial({ color: 0xffc83a, roughness: 0.6 }), flowers, { shadow: false }));
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x6f7a3a, roughness: 0.8, side: THREE.DoubleSide });
  group.add(instances(reedGeometry(3), reedMat, reeds.filter((_, i) => i % 2 === 0)));
  group.add(instances(reedGeometry(8), reedMat, reeds.filter((_, i) => i % 2 === 1)));

  group.add(mountains());

  return {
    group,
    update(dt, t) {
      pines.userData.update(t);
      for (const b of bobbing) {
        const p = b.userData.phase;
        b.position.y = 0.08 + Math.sin(t * 1.1 + p) * 0.03;
        b.rotation.z = Math.sin(t * 0.9 + p) * 0.025;
        b.rotation.x = Math.sin(t * 0.7 + p * 2) * 0.015;
      }
    },
    islands: ISLANDS,
  };
}
