// The magic world: a treehouse art studio at golden hour, open on one side
// to a garden. The studio is a timber deck under a beamed roof strung with
// fairy lights and lanterns, with a worktable of paint jars and brushes in
// pots; the easel stands at its open edge. Beyond lies the garden where
// friends play: a lawn with flowers, bushes and trees, a pond fed by a
// little waterfall, lanterns on posts along a stepping-stone path, and far
// away soft hills and a fairy-tale castle melting into the haze.
//
// Layout (metres): the easel is at the origin facing +z (towards the
// studio). The studio deck spans z = -1.1..2.8; the garden lawn is beyond
// the easel, -z. Friends roam the area returned by `walkable`.
import * as THREE from 'three';
import { rng, TAU } from '../config.js';
import { woodTextures, drawSplatters, periodicNoise, SPLAT_COLORS } from './textures.js';
import { grassField, foliage, leafCardTexture, flowerBeds, cloudLight, WIND } from './foliage.js';
import { tubeGeometry } from '../creatures/parts.js';
import { SKY_GLSL } from './sky.js';
import { stringLights } from './air.js';

// Clear glass (lantern panes, brush jars): the scene shows through, with a faint
// veil of the pane's own colour and full-strength reflections of the sky.
// Made without `transmission` on purpose: three then draws the whole opaque
// scene a second time into a full-size multisampled target every frame just to
// refract it, which cost about a third of every frame in the studio and the
// garden. Blending: result = pane + scene * (1 - veil), the pane's colour and
// opacity both scaled by the veil so its reflections are not dimmed with it.
const GLASS_VEIL = 0.08;
function clearGlass(color, roughness) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness, transparent: true, opacity: GLASS_VEIL });
  m.color.multiplyScalar(GLASS_VEIL);
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  return m;
}

const DECK_Z0 = -1.1;
const DECK_Z1 = 2.8;
const DECK_X = 3.0;

export const POND = { x: -2.3, z: -4.2, r: 1.15 };
// lantern posts along the path: x, z, light
export const POSTS = [
  [0.95, -2.2, 0.35],
  [-0.9, -4.6, 0.35],
  [1.1, -6.9, 0],
];
export const TREES = [
  { x: 3.4, z: -5.2, r: 0.3 },
  { x: -4.6, z: -2.2, r: 0.2 },
  { x: 1.4, z: -8.5, r: 0.2 },
];

// Where friends may walk: inside a rounded area of lawn and deck, clear of
// the pond, tree trunks and the easel. Returns a signed distance (m): < 0
// inside, so a friend steers back in when it goes positive.
export function walkable(x, z) {
  // an ellipse over the lawn and the front of the deck...
  const ex = (x + 0.2) / 3.4;
  const ez = (z + 2.5) / 2.6;
  const lawn = (Math.hypot(ex, ez) - 1) * 2.6;
  // ...and the deck, where a friend lands and runs out from
  const deck = Math.max(Math.abs(x - 0.0) - 2.4, Math.abs(z - 0.45) - 1.25);
  return Math.max(Math.min(lawn, deck), obstacleAt(x, z));
}

// Signed distance to what stands in the way (positive inside): the pond,
// trunks, lantern posts, the easel, the worktable, the stool and plant pots.
// Cameras use it too, to keep out of the props.
export function obstacleAt(x, z) {
  const circ = (cx, cz, r) => r - Math.hypot(x - cx, z - cz);
  // boxes: blocked (positive) inside, like the circles
  const box = (cx, cz, hx, hz) => Math.min(hx - Math.abs(x - cx), hz - Math.abs(z - cz));
  let d = circ(POND.x, POND.z, POND.r + 0.25);
  for (const t of TREES) d = Math.max(d, circ(t.x, t.z, t.r + 0.2));
  for (const [px, pz] of POSTS) d = Math.max(d, circ(px, pz, 0.2));
  d = Math.max(d, box(0, -0.26, 0.4, 0.42)); // the easel
  d = Math.max(d, box(-1.05, 0.55, 0.52, 0.34)); // the worktable
  d = Math.max(d, circ(0.95, 0.35, 0.22)); // the stool
  d = Math.max(d, circ(1.25, 0.9, 0.25)); // a plant pot
  d = Math.max(d, circ(-2.2, -0.6, 0.28)); // another
  return d;
}

// Where friends spend their time once they are out to play: the lawn in
// front of the garden camera. Signed distance like walkable (< 0 inside).
export const STAGE = { x: -0.6, z: -2.0, r: 1.75 };
export function stageAt(x, z) {
  return Math.hypot((x - STAGE.x) * 0.85, z - STAGE.z) - STAGE.r;
}

export function groundAt(x, z) {
  return z > DECK_Z0 && Math.abs(x) < DECK_X && z < DECK_Z1 ? 0.045 : 0;
}

export const WATER_Y = -0.02;

// Where friends with a special home settle: flowers and trees in the
// garden beds and lawn, the sun and rainbows up over the garden, boats on
// the pond. taken: [{x, z}] already used, to keep them apart.
const HOMES = {
  garden: [[-3.1, -1.6], [-2.6, -2.5], [-0.7, -5.2], [1.0, -5.9], [2.3, -3.2], [3.1, -1.9], [1.8, -6.0], [-1.0, -3.3], [-3.6, -2.4], [0.2, -4.4], [2.9, -4.6], [-1.3, -1.8]],
  sky: [[-1.4, -4.6, 1.7], [1.2, -5.2, 1.9], [-3.0, -3.2, 1.6], [2.6, -3.6, 1.6], [0.0, -6.5, 2.1], [-2.2, -6.2, 2.0]],
  pond: [[POND.x + 0.35, POND.z + 0.2], [POND.x - 0.4, POND.z - 0.1], [POND.x + 0.05, POND.z - 0.5], [POND.x - 0.2, POND.z + 0.5]],
};

export function homeSpot(home, taken = []) {
  const list = HOMES[home] || HOMES.garden;
  let best = list[0];
  let bestD = -1;
  for (const p of list) {
    let d = Infinity;
    for (const t of taken) d = Math.min(d, Math.hypot(t.x - p[0], t.z - p[1]));
    d += Math.random() * 0.3;
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  const y = home === 'sky' ? best[2] : home === 'pond' ? WATER_Y : groundAt(best[0], best[1]);
  return { x: best[0], y, z: best[1] };
}

// inside the pond (for boats), as a signed distance like walkable
export function onPond(x, z) {
  return Math.hypot(x - POND.x, z - POND.z) - (POND.r - 0.25);
}

export class World {
  constructor({ quality, sky }) {
    this.q = quality;
    this.sky = sky;
    this.group = new THREE.Group();
    this.lights = [];
    this.animated = [];
    this.buildDeck();
    this.buildStudio();
    this.buildGarden();
    this.buildPond();
    this.buildDistance();
  }

  // ------------------------------------------------------------ studio

  buildDeck() {
    const q = this.q;
    const wood = woodTextures({ size: q.tier === 'low' ? 512 : 1024, light: 0xb98556, dark: 0x7a4c2c, seed: 21, rings: 5, knots: 3, planks: 8, splatter: 40 });
    wood.map.wrapS = wood.map.wrapT = THREE.RepeatWrapping;
    wood.map.repeat.set(2.2, 3.2);
    wood.roughMap.repeat.copy(wood.map.repeat);
    const mat = new THREE.MeshStandardMaterial({ map: wood.map, roughnessMap: wood.roughMap, roughness: 0.85 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_X * 2, 0.12, DECK_Z1 - DECK_Z0), mat);
    deck.position.set(0, 0.045 - 0.06, (DECK_Z0 + DECK_Z1) / 2);
    deck.receiveShadow = true;
    this.group.add(deck);
    // a rug under the easel, woven stripes
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    const stripes = ['#e9d7b9', '#d77c5c', '#e9d7b9', '#6aa7a0', '#e9d7b9', '#e3b04b', '#e9d7b9', '#8d6fb3'];
    stripes.forEach((s, i) => {
      g.fillStyle = s;
      g.fillRect(0, (i * 128) / stripes.length, 256, 128 / stripes.length);
    });
    const nz = periodicNoise(4);
    const img = g.getImageData(0, 0, 256, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 256; x++) {
        const k = 0.85 + 0.15 * nz(x * 4, y * 4, 256) + ((x + y) % 2) * 0.04;
        const i = (y * 256 + x) * 4;
        img.data[i] *= k;
        img.data[i + 1] *= k;
        img.data[i + 2] *= k;
      }
    g.putImageData(img, 0, 0);
    drawSplatters(g, 256, 128, 14, 9);
    const rugTex = new THREE.CanvasTexture(c);
    rugTex.colorSpace = THREE.SRGBColorSpace;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = Math.PI / 2;
    rug.position.set(0, 0.047, 0.55);
    rug.receiveShadow = true;
    this.group.add(rug);
  }

  buildStudio() {
    const q = this.q;
    const bark = woodTextures({ size: 256, light: 0x8a6444, dark: 0x4a3222, seed: 31, rings: 24, knots: 2 });
    bark.map.repeat.set(1, 3);
    const trunkMat = new THREE.MeshStandardMaterial({ map: bark.map, roughness: 0.95, color: 0xc8b8a8 });
    const beamWood = woodTextures({ size: 256, light: 0xa77a4e, dark: 0x6d4527, seed: 33, rings: 6 });
    const beamMat = new THREE.MeshStandardMaterial({ map: beamWood.map, roughness: 0.8 });
    // four tree-trunk posts
    const posts = [
      [-2.7, -0.95],
      [2.7, -0.95],
      [-2.7, 2.6],
      [2.7, 2.6],
    ];
    const H = 2.75;
    for (const [x, z] of posts) {
      const g = tubeGeometry([[x, -0.05, z], [x + 0.04, 1.2, z + 0.02], [x - 0.02, H + 0.1, z]], [0.14, 0.12, 0.11], { radial: 14, steps: 10, cap: false });
      const uv = [];
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) uv.push(Math.atan2(p.getZ(i) - z, p.getX(i) - x) / TAU + 0.5, p.getY(i) / 1.5);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const m = new THREE.Mesh(g, trunkMat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    // beams and rafters
    const beam = (a, b, w = 0.12, h = 0.16) => {
      const A = new THREE.Vector3(...a);
      const B = new THREE.Vector3(...b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, A.distanceTo(B)), beamMat);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.lookAt(B);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    };
    beam([-2.75, H, -0.95], [2.75, H, -0.95]);
    beam([-2.75, H, 2.6], [2.75, H, 2.6]);
    beam([-2.7, H + 0.05, -1.0], [-2.7, H + 0.05, 2.65]);
    beam([2.7, H + 0.05, -1.0], [2.7, H + 0.05, 2.65]);
    for (let i = 0; i < 6; i++) {
      const z = -0.95 + (i / 5) * 3.55;
      beam([-2.9, H + 0.2, z], [2.9, H + 0.2, z], 0.08, 0.1);
    }
    // fairy lights strung between the front posts
    const bulbs = [];
    const string = (a, b, sag, n) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[2] + (b[2] - a[2]) * t;
        const y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
        bulbs.push([x, y, z]);
      }
    };
    string([-2.6, H - 0.05, -0.93], [2.6, H - 0.05, -0.93], 0.45, 26);
    string([-2.65, H - 0.05, -0.9], [-2.65, H - 0.05, 2.55], 0.3, 16);
    string([2.65, H - 0.05, -0.9], [2.65, H - 0.05, 2.55], 0.3, 16);
    const bulbGeo = new THREE.SphereGeometry(0.018, 10, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 3.0, 1.4) });
    const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
    const m = new THREE.Matrix4();
    bulbs.forEach((b, i) => bulbMesh.setMatrixAt(i, m.makeTranslation(...b)));
    bulbMesh.frustumCulled = false;
    this.group.add(bulbMesh);
    this.fairy = { mesh: bulbMesh, mat: bulbMat };
    // hanging lanterns
    this.lantern([-1.6, 2.1, 0.4], true, 0.8);
    this.lantern([1.7, 2.2, 1.2], true, 0.6);
    this.worktable();
    this.plantPot(1.25, 0.9, 0.22, 0x7d4f35);
    this.plantPot(-2.2, -0.6, 0.26, 0xb86a4a);
    this.plantPot(2.3, 2.0, 0.3, 0x8a6aa0);
    this.stool(0.95, 0.35);
  }

  lantern(pos, hanging, lightIntensity) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.45, metalness: 0.8 });
    const glass = clearGlass(0xfff1dc, 0.08);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 6), metal);
    top.position.y = 0.17;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.03, 6), metal);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 6, 1, true), glass);
    cage.position.y = 0.095;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12), metal);
    ring.position.y = 0.23;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.2, 2.0) }));
    flame.scale.set(1, 1.6, 1);
    flame.position.y = 0.075;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xf4ead6, roughness: 0.6 }));
    candle.position.y = 0.04;
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.16, 0.006), metal);
      const a = (i / 6) * TAU;
      bar.position.set(Math.cos(a) * 0.076, 0.095, Math.sin(a) * 0.076);
      g.add(bar);
    }
    g.add(top, base, cage, ring, flame, candle);
    g.position.set(...pos);
    if (hanging) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 2.85 - pos[1] - 0.23, 4), metal);
      chain.position.y = 0.23 + (2.85 - pos[1] - 0.23) / 2;
      g.add(chain);
    }
    g.traverse((o) => {
      if (o.isMesh && o !== flame && o.material !== glass) o.castShadow = true;
    });
    this.group.add(g);
    if (lightIntensity) {
      const L = new THREE.PointLight(0xffb45e, lightIntensity, 4.5, 1.6);
      L.position.set(pos[0], pos[1] + 0.08, pos[2]);
      this.group.add(L);
      this.lights.push(L);
    }
    this.animated.push((t) => {
      const f = 1 + Math.sin(t * 13 + pos[0]) * 0.04 + Math.sin(t * 7.3 + pos[2]) * 0.05;
      flame.scale.set(1, 1.6 * f, 1);
      if (hanging) g.rotation.z = Math.sin(t * 0.7 + pos[0]) * 0.02;
    });
    return g;
  }

  worktable() {
    const g = new THREE.Group();
    const w = woodTextures({ size: 512, light: 0xc79866, dark: 0x8e5d36, seed: 41, rings: 8, knots: 1, planks: 3, splatter: 90 });
    const mat = new THREE.MeshStandardMaterial({ map: w.map, roughnessMap: w.roughMap, roughness: 0.8 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.6), mat);
    top.position.y = 0.72;
    g.add(top);
    for (const [x, z] of [[-0.42, -0.25], [0.42, -0.25], [-0.42, 0.25], [0.42, 0.25]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), mat);
      leg.position.set(x, 0.35, z);
      g.add(leg);
    }
    // jars of brushes, paint pots, a palette
    const R = rng(7);
    const jarMat = clearGlass(0xe8f2f0, 0.05);
    const handleMats = [0xb8442f, 0x2f6fb8, 0xe0b23c, 0x3a8a4a, 0x7a4fa8, 0x8a5a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
    const ferrule = new THREE.MeshStandardMaterial({ color: 0xc9c2b6, roughness: 0.25, metalness: 1 });
    const bristle = new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.9 });
    const jar = (x, z, n) => {
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.042, 0.13, 20, 1, true), jarMat);
      j.position.set(x, 0.74 + 0.065, z);
      g.add(j);
      for (let i = 0; i < n; i++) {
        const b = new THREE.Group();
        const len = 0.2 + R() * 0.08;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, len, 8), handleMats[Math.floor(R() * handleMats.length)]);
        h.position.y = len / 2;
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0055, 0.03, 8), ferrule);
        f.position.y = len + 0.015;
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.03, 8), bristle);
        t.position.y = len + 0.045;
        b.add(h, f, t);
        b.position.set(x + (R() - 0.5) * 0.04, 0.745, z + (R() - 0.5) * 0.04);
        b.rotation.set((R() - 0.5) * 0.35, 0, (R() - 0.5) * 0.35);
        g.add(b);
      }
    };
    jar(-0.3, -0.12, 6);
    jar(0.28, 0.12, 5);
    // paint pots with coloured lids
    SPLAT_COLORS.slice(0, 6).forEach((c, i) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 }));
      pot.position.set(-0.05 + (i % 3) * 0.075, 0.765, 0.05 + Math.floor(i / 3) * 0.075);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.012, 16), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 }));
      lid.position.y = 0.03;
      pot.add(lid);
      g.add(pot);
    });
    // a painter's palette with blobs of colour
    const pc = document.createElement('canvas');
    pc.width = pc.height = 256;
    const pg = pc.getContext('2d');
    pg.fillStyle = '#c99a62';
    pg.fillRect(0, 0, 256, 256);
    drawSplatters(pg, 256, 256, 26, 12);
    const pt = new THREE.CanvasTexture(pc);
    pt.colorSpace = THREE.SRGBColorSpace;
    const pal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 32), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.4 }));
    pal.scale.set(1.2, 1, 0.85);
    pal.position.set(0.02, 0.747, -0.13);
    pal.rotation.y = 0.3;
    g.add(pal);
    g.position.set(-1.05, 0.045, 0.55);
    g.rotation.y = 0.25;
    g.traverse((o) => {
      if (o.isMesh && o.material !== jarMat) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(g);
  }

  plantPot(x, z, s, color) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.5, s * 0.38, s * 0.8, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
    pot.position.y = s * 0.4;
    g.add(pot);
    const leaves = foliage({ blobs: [[0, s * 1.1, 0, s * 0.6, s * 0.55, s * 0.6]], count: 40, texture: this.leafTex(), seed: Math.floor(x * 100 + z), size: s * 0.7 });
    g.add(leaves);
    g.position.set(x, 0.045, z);
    pot.castShadow = true;
    pot.receiveShadow = true;
    this.group.add(g);
  }

  stool(x, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a6a44, roughness: 0.7 });
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24), mat);
    seat.position.y = 0.46;
    g.add(seat);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.46, 8), mat);
      leg.position.set(Math.cos(a) * 0.11, 0.23, Math.sin(a) * 0.11);
      leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
      g.add(leg);
    }
    // a stack of books
    const bookCols = [0x6a3e8a, 0x2f7a8a, 0xb84a3a, 0xd6a13a];
    bookCols.forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.2 - i * 0.015, 0.035, 0.15 - i * 0.01), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
      b.position.set(0, 0.495 + i * 0.036, 0);
      b.rotation.y = (i - 1.5) * 0.18;
      g.add(b);
    });
    g.position.set(x, 0.045, z);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(g);
  }

  leafTex() {
    return (this._leaf ??= leafCardTexture({ seed: 5 }));
  }

  // ------------------------------------------------------------ garden

  buildGarden() {
    const q = this.q;
    // the lawn: a big ground with mown grass colour, and blades near the play area
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const n = periodicNoise(12);
    const m2 = periodicNoise(13);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const k = n(x, y, size) * 0.5 + m2(x * 4, y * 4, size) * 0.3 + m2(x * 16, y * 16, size) * 0.2;
        const i = (y * size + x) * 4;
        img.data[i] = (0.3 + k * 0.18) * 255;
        img.data[i + 1] = (0.45 + k * 0.2) * 255;
        img.data[i + 2] = (0.16 + k * 0.08) * 255;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const lawnTex = new THREE.CanvasTexture(c);
    lawnTex.colorSpace = THREE.SRGBColorSpace;
    lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
    lawnTex.repeat.set(40, 40);
    lawnTex.anisotropy = 8;
    const lawnMat = new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 0.95 });
    lawnMat.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // big soft patches of lighter and darker lawn
        vec2 wp = vMapUv / 40.0 * 160.0;
        float big = sin(wp.x * 0.21) * sin(wp.y * 0.17) * 0.5 + 0.5;
        diffuseColor.rgb *= 0.85 + 0.25 * big;`,
      );
      cloudLight(s); // soft cloud shadows drift over the lawn
    };
    // a disc with the pond cut out (its water and bed lie below the lawn),
    // with the same uvs as a plain disc
    const lawnShape = new THREE.Shape().absarc(0, 0, 80, 0, TAU, false);
    lawnShape.holes.push(new THREE.Path().absarc(POND.x, -POND.z, POND.r + 0.02, 0, TAU, true));
    const lawnGeo = new THREE.ShapeGeometry(lawnShape, 64);
    const lp = lawnGeo.attributes.position;
    const luv = lawnGeo.attributes.uv;
    for (let i = 0; i < lp.count; i++) luv.setXY(i, lp.getX(i) / 160 + 0.5, lp.getY(i) / 160 + 0.5);
    const lawn = new THREE.Mesh(lawnGeo, lawnMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    this.group.add(lawn);
    const k = q.grass;
    const inPlay = (x, z) => {
      if (z > DECK_Z0 - 0.05 && Math.abs(x) < DECK_X + 0.05 && z < DECK_Z1 + 0.05) return 0;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.1) return 0;
      if (z < DECK_Z0 && Math.abs(x - STONES_X(z)) < 0.24 && z > -6.5) return 0.15;
      return 1;
    };
    this.group.add(grassField({ count: Math.round(60000 * k), x0: -7, x1: 7, z0: -10, z1: 3.5, density: inPlay, height: 0.075, width: 0.005, seed: 3 }));
    // flower beds round the edges of the lawn and by the pond
    const pinks = [0xf58fb5, 0xf2a3c7, 0xffffff, 0xe96b9a];
    const blues = [0x8f86e8, 0x7aa6f0, 0xb98ff0, 0xffffff];
    const warm = [0xffc93c, 0xff9a3c, 0xf36b4b, 0xfff1a8];
    // (kept as this.flowers: its userData.spots are where butterflies alight)
    this.flowers = flowerBeds({
      avoid: (x, z) => Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.1,
      beds: [
        [-3.6, -1.2, 0.9, 70, pinks],
        [-3.2, -3.1, 0.7, 50, blues],
        [-1.1, -5.6, 0.8, 60, warm],
        [0.6, -6.3, 0.9, 60, pinks],
        [2.6, -3.6, 0.8, 60, blues],
        [3.6, -1.6, 0.9, 70, warm],
        [2.2, -6.4, 0.7, 40, pinks],
        [-2.9, -5.6, 0.5, 30, warm],
        [-1.2, -3.4, 0.35, 18, blues],
        [4.8, -4.4, 1.0, 60, pinks],
        [-5.2, -4.2, 1.2, 70, warm],
      ].map((b) => [b[0], b[1], b[2], Math.round(b[3] * Math.max(0.5, k)), b[4]]),
    });
    this.group.add(this.flowers);
    // bushes and trees
    const leaf = this.leafTex();
    const leafDark = leafCardTexture({ seed: 9, hue: 0x3f6f2a, light: 0x7fae44 });
    this.bushes = []; // where small birds perch
    const bush = (x, z, r, n = 90) => (this.bushes.push({ x, z, r }), this.group.add(foliage({ blobs: [[x, r * 0.8, z, r, r * 0.8, r]], count: Math.round(n * Math.max(0.6, k)), texture: leafDark, seed: Math.floor(x * 31 + z * 7), size: 0.32 })));
    bush(-4.4, -3.4, 0.55);
    bush(4.2, -2.8, 0.5);
    bush(-1.9, -6.6, 0.6);
    bush(5.2, -6.2, 0.8, 120);
    bush(-5.5, -0.6, 0.6);
    const barkT = woodTextures({ size: 256, light: 0x7d5c40, dark: 0x3e2a1c, seed: 51, rings: 30 });
    barkT.map.repeat.set(1, 4);
    const barkMat = new THREE.MeshStandardMaterial({ map: barkT.map, roughness: 0.95 });
    const tree = (x, z, h, crown, seed) => {
      const R = rng(seed);
      const trunk = tubeGeometry([[x, 0, z], [x + 0.05, h * 0.4, z + 0.03], [x - 0.04, h * 0.75, z], [x + 0.02, h, z - 0.02]], [0.24 * (h / 4), 0.17 * (h / 4), 0.13 * (h / 4), 0.1 * (h / 4)], { radial: 12, steps: 12 });
      const uv = [];
      const p = trunk.attributes.position;
      for (let i = 0; i < p.count; i++) uv.push(Math.atan2(p.getZ(i) - z, p.getX(i) - x) / TAU + 0.5, p.getY(i) / 1.5);
      trunk.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const tm = new THREE.Mesh(trunk, barkMat);
      tm.castShadow = true;
      tm.receiveShadow = true;
      this.group.add(tm);
      const blobs = [];
      for (let i = 0; i < 5; i++) blobs.push([x + (R() - 0.5) * crown, h + (R() - 0.2) * crown * 0.5, z + (R() - 0.5) * crown, crown * (0.5 + R() * 0.3), crown * (0.4 + R() * 0.2), crown * (0.5 + R() * 0.3)]);
      this.group.add(foliage({ blobs, count: Math.round(900 * Math.max(0.5, k)), texture: R() < 0.5 ? leaf : leafDark, seed, size: 0.55, sway: 0.6 }));
    };
    tree(TREES[0].x, TREES[0].z, 4.2, 2.2, 61);
    tree(TREES[1].x, TREES[1].z, 3.2, 1.5, 62);
    tree(TREES[2].x, TREES[2].z, 3.6, 1.8, 63);
    tree(-7.5, -9, 5, 2.6, 64);
    tree(7.8, -10, 5.5, 2.8, 65);
    tree(-9.5, -3, 4.6, 2.4, 66);
    tree(9, -2, 4.2, 2.2, 67);
    // a wood round the far side of the lawn
    const W = rng(140);
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.8 + (i / 15) * Math.PI * 1.6 + (W() - 0.5) * 0.12;
      const r = 12 + W() * 5;
      const x = Math.sin(a) * r * 1.1;
      const z = -3.5 - Math.cos(a) * r;
      if (z > 0) continue;
      tree(x, z, 5 + W() * 2.5, 2.6 + W() * 1.2, 200 + i);
    }
    // stepping stones
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb9ac98, roughness: 0.9 });
    const R = rng(71);
    for (let i = 0; i < 8; i++) {
      const z = -1.4 - i * 0.62;
      const x = STONES_X(z);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.2 + R() * 0.05, 0.23, 0.04, 14), stoneMat);
      s.scale.set(1, 1, 0.75 + R() * 0.2);
      s.position.set(x, 0.01, z);
      s.rotation.y = R() * TAU;
      s.receiveShadow = true;
      this.group.add(s);
    }
    // strings of little lights from the trees to the lantern posts
    this.spans = [
      [[TREES[0].x - 0.15, 2.4, TREES[0].z + 0.1], [0.95, 1.02, -2.2]],
      [[TREES[1].x + 0.12, 2.2, TREES[1].z - 0.1], [-0.9, 1.02, -4.6]],
      [[TREES[2].x, 2.3, TREES[2].z + 0.15], [1.1, 1.02, -6.9]],
      [[TREES[0].x, 2.6, TREES[0].z - 0.1], [TREES[2].x + 0.1, 2.5, TREES[2].z]],
      [[-0.9, 1.02, -4.6], [0.95, 1.02, -2.2]],
    ];
    const lights = stringLights(this.spans, { sag: 0.5 });
    this.group.add(lights);
    this.stringMat = lights.userData.mat;
    this.stringBulbs = lights.children[0];
    // lanterns on posts along the path
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 0.6, metalness: 0.4 });
    for (const [x, z, lit] of POSTS) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.05, 8), postMat);
      post.position.set(x, 0.52, z);
      post.castShadow = true;
      this.group.add(post);
      this.lantern([x, 1.05, z], false, lit);
    }
  }

  buildPond() {
    const P = POND;
    // stones round the rim
    const R = rng(81);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa89c8a, roughness: 0.85 });
    const stone = new THREE.IcosahedronGeometry(1, 2);
    const n = 26;
    const stones = new THREE.InstancedMesh(stone, stoneMat, n + 14);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.1;
      const s = 0.13 + R() * 0.08;
      e.set(R(), R() * 6, R());
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(P.x + Math.cos(a) * (P.r + 0.05), 0.02, P.z + Math.sin(a) * (P.r + 0.05)), q, new THREE.Vector3(s * 1.3, s * 0.55, s));
      stones.setMatrixAt(i, m);
    }
    // the waterfall's rock pile behind the pond
    const W = { x: P.x - 0.55, z: P.z - 1.0 };
    for (let i = 0; i < 14; i++) {
      const s = 0.35 + R() * 0.3;
      e.set(R(), R() * 6, R());
      q.setFromEuler(e);
      const a = -1.1 + (i / 13) * 2.2;
      const layer = i % 3;
      m.compose(new THREE.Vector3(W.x + Math.sin(a) * 0.9, 0.25 + layer * 0.42, W.z - Math.cos(a) * 0.35 - layer * 0.15), q, new THREE.Vector3(s * 1.2, s * 0.8, s));
      stones.setMatrixAt(n + i, m);
    }
    stones.castShadow = true;
    stones.receiveShadow = true;
    this.group.add(stones);
    // pond bed and water
    const bed = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.1, 40), new THREE.MeshStandardMaterial({ color: 0x2c3a2a, roughness: 1 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(P.x, -0.09, P.z);
    this.group.add(bed);
    const waterU = { uTime: { value: 0 } };
    const water = new THREE.MeshPhysicalMaterial({ color: 0x1f4a48, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.88, envMapIntensity: 1.4 });
    water.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, waterU);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWp;')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 p = vWp.xz;
            float t = uTime;
            vec2 g = vec2(0.0);
            g += vec2(cos(p.x * 9.0 + t * 1.3), cos(p.y * 8.0 - t * 1.1)) * 0.03;
            g += vec2(cos(p.x * 21.0 - p.y * 6.0 + t * 2.4), cos(p.y * 19.0 + p.x * 5.0 + t * 2.1)) * 0.015;
            // rings spreading from where the waterfall lands
            vec2 wf = p - vec2(${(W.x + 0.2).toFixed(2)}, ${(W.z + 0.55).toFixed(2)});
            float rr = length(wf);
            g += normalize(wf + 1e-4) * sin(rr * 30.0 - t * 6.0) * 0.05 * exp(-rr * 2.0);
            normal = normalize((viewMatrix * vec4(normalize(vec3(-g.x, 1.0, -g.y)), 0.0)).xyz);
          }`,
        );
    };
    const surf = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.02, 48), water);
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(P.x, -0.02, P.z);
    surf.receiveShadow = true;
    this.group.add(surf);
    // (the lily pads, the frog and the fish live in life.js)
    // the falling water: a sheet of streaks tumbling off the rocks
    const fallU = { uTime: waterU.uTime };
    const fall = new THREE.ShaderMaterial({
      uniforms: fallU,
      transparent: true,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float s = n(vec2(vUv.x * 18.0, vUv.y * 3.0 + uTime * 2.2)) * 0.6 + n(vec2(vUv.x * 40.0, vUv.y * 6.0 + uTime * 3.1)) * 0.4;
          float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          float a = smoothstep(0.3, 0.8, s) * edge * (0.55 + 0.45 * (1.0 - vUv.y));
          vec3 c = mix(vec3(0.75, 0.88, 0.92), vec3(1.4, 1.35, 1.25), s);
          gl_FragColor = vec4(c, a * 0.85);
        }`,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.05, 1, 8), fall);
    sheet.position.set(W.x + 0.2, 0.5, W.z + 0.42);
    sheet.rotation.x = -0.12;
    sheet.renderOrder = 2;
    this.group.add(sheet);
    this.waterfall = new THREE.Vector3(W.x + 0.2, 0.02, W.z + 0.55);
    this.animated.push((t) => {
      waterU.uTime.value = t;
    });
  }

  // ------------------------------------------------------------ far away

  buildDistance() {
    // two rings of soft hills and a castle on the nearer ridge, hazed with the sky
    const hazeMat = (base, dist, canopy = 0) =>
      new THREE.ShaderMaterial({
        uniforms: { ...this.sky.uniforms, uBase: { value: new THREE.Color(base) }, uHaze: { value: dist }, uCanopy: { value: canopy } },
        vertexShader: 'varying vec3 vW; varying float vTop; attribute float aTop; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vTop = aTop; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `${SKY_GLSL}
          uniform vec3 uBase; uniform float uHaze; uniform float uCanopy; varying vec3 vW; varying float vTop;
          void main(){
            vec3 d = normalize(vW - cameraPosition);
            float lit = 0.75 + 0.35 * clamp(vW.y / 30.0, 0.0, 1.0);
            vec3 c = uBase * lit;
            if (uCanopy > 0.0) {
              // a forested ridge: crowns of trees, lit on the sun side, darker below
              float a = atan(vW.z, vW.x);
              vec2 p = vec2(a * 90.0 * uCanopy, vW.y * 0.9);
              float crowns = skF(p * 1.3) * 0.7 + skF(p * 4.1) * 0.3;
              vec3 toSun = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
              float side = 0.5 + 0.5 * dot(normalize(vec3(-vW.x, 0.0, -vW.z)), -toSun);
              c *= 0.55 + 0.7 * crowns;
              c *= mix(0.6, 1.25, smoothstep(0.0, 1.0, vTop));
              c += vec3(0.35, 0.22, 0.08) * side * smoothstep(0.55, 1.0, crowns) * 0.5;
            }
            gl_FragColor = vec4(mix(c, skyHaze(d), uHaze), 1.0);
          }`,
      });
    const ring = (r0, h, seed, color, haze, canopy = 0) => {
      const R = periodicNoise(seed);
      const segs = canopy ? 720 : 160;
      const pos = [];
      const top = [];
      const idx = [];
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * TAU;
        let hh = h * (0.35 + R(i * 3 * (160 / segs), 0, 480) * 0.8 + R(i * 11 * (160 / segs), 5, 1760) * 0.25);
        // tree crowns along the ridge
        if (canopy) hh += h * 0.16 * Math.pow(Math.abs(Math.sin(i * 1.7 + R(i, 9, segs) * 6)), 0.6);
        const x = Math.cos(a) * r0, z = Math.sin(a) * r0;
        pos.push(x, -2, z, x, hh, z);
        top.push(0, 1);
        if (i < segs) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, hazeMat(color, haze, canopy));
      mesh.material.side = THREE.DoubleSide;
      this.group.add(mesh);
    };
    ring(140, 30, 91, 0x5b6a86, 0.72);
    ring(85, 14, 92, 0x55733f, 0.45, 1.4);
    ring(45, 6, 93, 0x4a6b33, 0.22, 1);
    // the castle
    const castle = new THREE.Group();
    const wallC = 0xf1e2d4;
    const roofC = 0x8a6ad8;
    const cm = hazeMat(wallC, 0.5);
    const rm = hazeMat(roofC, 0.5);
    const tower = (x, z, r, h) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 12), cm);
      t.position.set(x, h / 2, z);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.3, h * 0.55, 12), rm);
      roof.position.set(x, h + h * 0.27, z);
      castle.add(t, roof);
    };
    tower(0, 0, 1.6, 12);
    tower(-4, 1, 1.1, 8.5);
    tower(4, 0.5, 1.2, 9.5);
    tower(-2, -2.5, 0.9, 10.5);
    tower(2.4, -2, 0.8, 14);
    const keep = new THREE.Mesh(new THREE.BoxGeometry(7, 5.5, 3.5), cm);
    keep.position.set(0, 2.75, 0);
    castle.add(keep);
    castle.position.set(-38, 5, -70);
    castle.rotation.y = 0.4;
    this.group.add(castle);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 12, 0, TAU, 0, Math.PI / 2), hazeMat(0x4f6e46, 0.42));
    hill.scale.set(1.3, 0.38, 1);
    hill.position.set(-38, -1, -70);
    this.group.add(hill);
  }

  update(dt, t) {
    WIND.uWindTime.value = t;
    for (const f of this.animated) f(t, dt);
    // fairy lights twinkle softly
    const k = 0.85 + Math.sin(t * 1.7) * 0.08;
    this.fairy.mat.color.setRGB(4.5 * k, 3.0 * k, 1.4 * k);
    const k2 = 0.9 + Math.sin(t * 1.3 + 1) * 0.1;
    this.stringMat?.color.setRGB(5 * k2, 3.2 * k2, 1.4 * k2);
  }
}

// the stepping-stone path wanders a little
export function STONES_X(z) {
  return 0.25 + Math.sin(z * 0.9) * 0.35;
}
