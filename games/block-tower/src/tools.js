// The knock-down tools, the fun ways to bring the tower down: a finger
// flick, a striped rubber play ball that rolls in along the floor, a wooden
// wind-up car that winds, drives and bumps into the tower, and a toy
// crane's wrecking ball that swings in on its string. The props are real
// toys at real toy sizes (7 cm ball, 10.5 cm car, 5 cm wrecking ball) and
// every crash is real physics: the props are Rapier bodies, and the tower is
// woken just before they reach it.
import * as THREE from 'three';
import { REDUCED_MOTION, rand, clamp } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const G = 9.81;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

const BALL_R = 0.035; // 7 cm play ball
const WRECK_R = 0.025; // 5 cm wrecking ball
const EYE = 0.006; // screw eye above the wrecking ball
const WHEEL_R = 0.0147; // car wheel incl. rubber-band tyre
const PLAY_R = 0.82; // keep launches inside the physics' soft walls (~0.9 m)

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ------------------------------------------------------------ textures

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, { srgb = true, wrap = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function speckle(x, w, h, n, colours, size = 1) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colours[i % colours.length];
    x.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

// Faint parallel brush strokes, the way lacquer lies on a toy.
function brushStrokes(x, w, h, n, vertical = false) {
  for (let i = 0; i < n; i++) {
    const light = Math.random() < 0.5;
    x.strokeStyle = light ? `rgba(255,255,255,${rand(0.015, 0.05)})` : `rgba(0,0,0,${rand(0.015, 0.05)})`;
    x.lineWidth = rand(0.6, 2.2);
    x.beginPath();
    const a = rand(0, vertical ? w : h);
    const len = rand(0.3, 1) * (vertical ? h : w);
    const s = rand(-len * 0.3, (vertical ? h : w) - len * 0.7);
    if (vertical) {
      x.moveTo(a, s);
      x.lineTo(a + rand(-2, 2), s + len);
    } else {
      x.moveTo(s, a);
      x.lineTo(s + len, a + rand(-2, 2));
    }
    x.stroke();
  }
}

// A classic play ball: six coloured gores meeting at white pole caps, with
// a moulded seam between panels and the slight mottling of real rubber.
function ballTextures() {
  const W = 1024;
  const H = 512;
  const [c, x] = canvas(W, H);
  const cols = ['#d8322c', '#f3c12f', '#2d68c9', '#f2ede2', '#2f9a55', '#ef8a24'];
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    x.fillStyle = cols[i];
    x.fillRect((i * W) / n, 0, W / n + 1, H);
  }
  // pole caps
  const cap = H * 0.075;
  x.fillStyle = '#f4efe3';
  x.fillRect(0, 0, W, cap);
  x.fillRect(0, H - cap, W, cap);
  // seams: a thin shadowed groove with a highlight beside it
  x.lineWidth = 2.2;
  for (let i = 0; i <= n; i++) {
    const u = (i * W) / n;
    x.strokeStyle = 'rgba(40,20,10,0.35)';
    x.beginPath();
    x.moveTo(u, cap);
    x.lineTo(u, H - cap);
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.18)';
    x.beginPath();
    x.moveTo(u + 2, cap);
    x.lineTo(u + 2, H - cap);
    x.stroke();
  }
  for (const y of [cap, H - cap]) {
    x.strokeStyle = 'rgba(40,20,10,0.35)';
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(W, y);
    x.stroke();
  }
  // rubber mottling and a little floor grime
  speckle(x, W, H, 9000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.05)'], 2);
  for (let i = 0; i < 24; i++) {
    x.fillStyle = `rgba(70,55,40,${rand(0.02, 0.06)})`;
    x.beginPath();
    x.ellipse(rand(0, W), rand(H * 0.2, H * 0.8), rand(6, 26), rand(3, 10), rand(0, 3), 0, Math.PI * 2);
    x.fill();
  }
  const map = texture(c);
  // roughness: satin rubber, slightly shinier on the painted panels
  const [rc, rx] = canvas(256, 128);
  rx.fillStyle = 'rgb(0,120,0)';
  rx.fillRect(0, 0, 256, 128);
  speckle(rx, 256, 128, 5000, ['rgb(0,100,0)', 'rgb(0,145,0)'], 1);
  const roughnessMap = texture(rc, { srgb: false });
  return { map, roughnessMap };
}

// Turned wooden wheel: pale maple with fine lathe rings (the lathe UVs run
// v from the hub outwards, so rings are bands along v).
function wheelTexture() {
  const [c, x] = canvas(64, 512);
  x.fillStyle = '#d7b27a';
  x.fillRect(0, 0, 64, 512);
  for (let y = 0; y < 512; y += 1) {
    const k = Math.sin(y * 0.35) * 0.5 + Math.sin(y * 1.7 + 1) * 0.3 + (Math.random() - 0.5) * 0.6;
    x.fillStyle = k > 0 ? `rgba(255,236,200,${k * 0.1})` : `rgba(120,70,30,${-k * 0.12})`;
    x.fillRect(0, y, 64, 1);
  }
  speckle(x, 64, 512, 600, ['rgba(90,50,20,0.12)', 'rgba(255,240,210,0.1)'], 1);
  return texture(c);
}

// ------------------------------------------------------------ car geometry

// Side profile of the car (x forward, y up, metres), corners eased. The
// extrusion's bevel adds BEVEL all round, so the finished car is 10.5 cm.
const BEVEL = 0.0018;
const CAR_CORNERS = [
  [-0.0505, 0.0145, 0.003],
  [0.0505, 0.0145, 0.003],
  [0.0515, 0.029, 0.006],
  [0.029, 0.0325, 0.004],
  [0.0165, 0.0475, 0.006],
  [-0.0215, 0.0475, 0.006],
  [-0.0335, 0.0335, 0.004],
  [-0.0515, 0.0305, 0.005],
];

function roundedPolyline(corners, seg = 5) {
  const pts = [];
  const marks = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const [px, py, r] = corners[i];
    const [ax, ay] = corners[(i + n - 1) % n];
    const [bx, by] = corners[(i + 1) % n];
    const la = Math.hypot(px - ax, py - ay);
    const lb = Math.hypot(bx - px, by - py);
    const rr = Math.min(r, la * 0.45, lb * 0.45);
    const sx = px + ((ax - px) / la) * rr;
    const sy = py + ((ay - py) / la) * rr;
    const ex = px + ((bx - px) / lb) * rr;
    const ey = py + ((by - py) / lb) * rr;
    marks.push(pts.length);
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const cc = t * t;
      pts.push(new THREE.Vector2(a * sx + b * px + cc * ex, a * sy + b * py + cc * ey));
    }
  }
  return { pts, marks };
}

function carProfile() {
  const { pts, marks } = roundedPolyline(CAR_CORNERS);
  // arc length along the outline, for the roof/bonnet texture's u
  const s = [0];
  for (let i = 1; i <= pts.length; i++) s.push(s[i - 1] + pts[i % pts.length].distanceTo(pts[i - 1]));
  const total = s[pts.length];
  // the straight runs that are the windscreen (corner 3 -> 4) and the rear
  // window (corner 5 -> 6)
  const seg = 5;
  const run = (a, b) => [s[marks[a] + seg] / total, s[marks[b]] / total];
  return { pts, s, total, windscreen: run(3, 4), rearWindow: run(5, 6) };
}

function carGeometry(profile, width) {
  const shape = new THREE.Shape(profile.pts);
  const depth = width - 2 * BEVEL;
  const minX = -0.056;
  const maxX = 0.056;
  const minY = 0.01;
  const maxY = 0.052;
  const nearest = (x, y) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < profile.pts.length; i++) {
      const d = (profile.pts[i].x - x) ** 2 + (profile.pts[i].y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return profile.s[best] / profile.total;
  };
  const uv = {
    // the car's sides: map profile space onto the side texture
    generateTopUV(g, v, a, b, c) {
      return [a, b, c].map((i) => new THREE.Vector2((v[i * 3] - minX) / (maxX - minX), (v[i * 3 + 1] - minY) / (maxY - minY)));
    },
    // bonnet, windscreen, roof, boot: u runs along the outline, v across
    generateSideWallUV(g, v, a, b, c, d) {
      const out = [a, b, c, d].map((i) => new THREE.Vector2(nearest(v[i * 3], v[i * 3 + 1]), (v[i * 3 + 2] + BEVEL) / (depth + 2 * BEVEL)));
      // the outline wraps at u = 0/1; keep a quad from straddling it
      const us = out.map((p) => p.x);
      if (Math.max(...us) - Math.min(...us) > 0.5) for (const p of out) if (p.x < 0.5) p.x += 1;
      return out;
    },
  };
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 4,
    UVGenerator: uv,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return { geometry: g, box: { minX, maxX, minY, maxY } };
}

// The car's sides: glossy paint with painted windows, a roundel with a
// star, and a few tiny chips on the edges showing the wood beneath.
function carSideTexture(colour, profile, box) {
  const W = 1024;
  const H = 384;
  const [c, x] = canvas(W, H);
  const px = (X0) => ((X0 - box.minX) / (box.maxX - box.minX)) * W;
  const py = (Y0) => H - ((Y0 - box.minY) / (box.maxY - box.minY)) * H;
  x.fillStyle = colour;
  x.fillRect(0, 0, W, H);
  brushStrokes(x, W, H, 260);
  const windows = [
    [
      [0.0245, 0.0345],
      [0.0152, 0.0452],
      [-0.0005, 0.0452],
      [-0.0005, 0.0345],
    ],
    [
      [-0.0045, 0.0345],
      [-0.0045, 0.0452],
      [-0.0198, 0.0452],
      [-0.0292, 0.0345],
    ],
  ];
  for (const poly of windows) {
    x.beginPath();
    poly.forEach(([a, b], i) => (i ? x.lineTo(px(a), py(b)) : x.moveTo(px(a), py(b))));
    x.closePath();
    const g = x.createLinearGradient(0, py(0.0452), 0, py(0.0345));
    g.addColorStop(0, '#dcebf0');
    g.addColorStop(1, '#9fbcc9');
    x.fillStyle = g;
    x.fill();
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(30,30,35,0.8)';
    x.stroke();
  }
  // roundel on the door
  const rx = px(0.005);
  const ry = py(0.0225);
  const rr = ((0.0068 / (box.maxX - box.minX)) * W);
  x.fillStyle = '#f7f2e6';
  x.beginPath();
  x.arc(rx, ry, rr, 0, Math.PI * 2);
  x.fill();
  x.lineWidth = 3;
  x.strokeStyle = 'rgba(30,30,35,0.7)';
  x.stroke();
  // a star, not a number: both sides of the car share this texture, so
  // anything lettered would read mirrored on one of them
  x.fillStyle = colour;
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? rr * 0.3 : rr * 0.72;
    x.lineTo(rx + Math.cos(a) * r, ry + Math.sin(a) * r);
  }
  x.closePath();
  x.fill();
  // a thin painted pin-stripe along the body
  x.strokeStyle = 'rgba(250,245,230,0.85)';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(px(-0.049), py(0.0275));
  x.lineTo(px(-0.001), py(0.0275));
  x.moveTo(px(0.011), py(0.0275));
  x.lineTo(px(0.049), py(0.0275));
  x.stroke();
  // chips along the outline
  x.fillStyle = '#d9b884';
  for (let i = 0; i < 26; i++) {
    const p = profile.pts[Math.floor(Math.random() * profile.pts.length)];
    x.beginPath();
    x.ellipse(px(p.x) + rand(-3, 3), py(p.y) + rand(-3, 3), rand(1, 3.5), rand(1, 2.5), rand(0, 3), 0, Math.PI * 2);
    x.fill();
  }
  return texture(c);
}

// Bonnet, roof and boot: the same paint, with the windscreen and rear
// window painted across the slopes.
function carTopTexture(colour, profile) {
  const W = 1024;
  const H = 128;
  const [c, x] = canvas(W, H);
  x.fillStyle = colour;
  x.fillRect(0, 0, W, H);
  brushStrokes(x, W, H, 80, true);
  for (const [a, b] of [profile.windscreen, profile.rearWindow]) {
    const g = x.createLinearGradient(a * W, 0, b * W, 0);
    g.addColorStop(0, '#9fbcc9');
    g.addColorStop(1, '#dcebf0');
    x.fillStyle = g;
    const inset = H * 0.15;
    x.fillRect(a * W + 3, inset, (b - a) * W - 6, H - 2 * inset);
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(30,30,35,0.8)';
    x.strokeRect(a * W + 3, inset, (b - a) * W - 6, H - 2 * inset);
  }
  // wear on the edges where the sides meet the top
  x.fillStyle = '#d9b884';
  for (let i = 0; i < 30; i++) {
    const v = Math.random() < 0.5 ? rand(0, 5) : H - rand(0, 5);
    x.beginPath();
    x.ellipse(rand(0, W), v, rand(1, 4), rand(0.8, 1.8), 0, 0, Math.PI * 2);
    x.fill();
  }
  const t = texture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function lacquer(options) {
  return new THREE.MeshPhysicalMaterial({ roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.14, ...options });
}

// A turned wooden wheel with a groove for its rubber-band tyre, and a
// domed hub peg holding it on.
function wheelGeometry() {
  const r = WHEEL_R - 0.0012;
  const w = 0.008;
  const prof = [
    [0.0001, w / 2],
    [0.0035, w / 2],
    [0.0045, w / 2 + 0.0004],
    [r - 0.0022, w / 2],
    [r - 0.0006, w / 2 - 0.0006],
    [r, w / 2 - 0.0018],
    [r - 0.0008, w * 0.1],
    [r - 0.0008, -w * 0.1],
    [r, -w / 2 + 0.0018],
    [r - 0.0006, -w / 2 + 0.0006],
    [r - 0.0022, -w / 2],
    [0.0001, -w / 2],
  ]
    .reverse() // bottom to top, so the lathe's faces point outwards
    .map(([a, b]) => new THREE.Vector2(a, b));
  const g = new THREE.LatheGeometry(prof, 32);
  g.rotateX(Math.PI / 2); // axle along z
  g.computeVertexNormals();
  return g;
}

function keyShape() {
  // a butterfly key: two round wings joined by a waist, each with a hole
  const s = new THREE.Shape();
  const R = 0.0055;
  const cx = 0.0066;
  s.absarc(cx, 0, R, -Math.PI * 0.72, Math.PI * 0.72, false);
  s.absarc(-cx, 0, R, Math.PI * 0.28, Math.PI * 1.72, false);
  s.closePath();
  for (const sx of [cx, -cx]) {
    const h = new THREE.Path();
    h.absarc(sx, 0, 0.0021, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  return s;
}

// ------------------------------------------------------------ models

function shadowed(o) {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
}

// Materials are cloned per prop so one can fade out without the others.
function ownMaterials(root) {
  const mats = [];
  root.traverse((m) => {
    if (!m.isMesh) return;
    if (Array.isArray(m.material)) m.material = m.material.map((x) => x.clone());
    else m.material = m.material.clone();
    mats.push(...(Array.isArray(m.material) ? m.material : [m.material]));
  });
  return mats;
}

function setOpacity(root, mats, a) {
  for (const m of mats) {
    // opaque and transparent are different shader variants in three.js
    if (m.transparent !== a < 1) {
      m.transparent = a < 1;
      m.needsUpdate = true;
    }
    m.opacity = a;
  }
  root.traverse((m) => {
    if (m.isMesh) m.castShadow = a > 0.35;
  });
}

class Models {
  constructor(envMap) {
    this.envMap = envMap || null;
    this.cache = {};
  }

  env(m) {
    if (this.envMap) m.envMap = this.envMap;
    return m;
  }

  ball() {
    if (!this.cache.ball) {
      const { map, roughnessMap } = ballTextures();
      const mat = this.env(
        new THREE.MeshPhysicalMaterial({ map, roughnessMap, roughness: 1, clearcoat: 0.25, clearcoatRoughness: 0.3 }),
      );
      const geo = new THREE.SphereGeometry(BALL_R, 64, 40);
      this.cache.ball = { mat, geo };
    }
    const { mat, geo } = this.cache.ball;
    return shadowed(new THREE.Mesh(geo, mat));
  }

  car(colour) {
    const c = (this.cache.car ??= this.carParts());
    const paint = (c.paints[colour] ??= {
      side: this.env(lacquer({ map: carSideTexture(colour, c.profile, c.box) })),
      top: this.env(lacquer({ map: carTopTexture(colour, c.profile) })),
    });
    const root = new THREE.Group();
    const body = new THREE.Mesh(c.body, [paint.side, paint.top]);
    root.add(body);
    // underside plate in raw wood, visible when the car tips over
    const under = new THREE.Mesh(c.under, c.wood);
    under.position.y = 0.0135;
    root.add(under);
    const wheels = [];
    for (const [wx, wz] of [
      [0.031, 0.0288],
      [0.031, -0.0288],
      [-0.031, 0.0288],
      [-0.031, -0.0288],
    ]) {
      const wg = new THREE.Group();
      wg.position.set(wx, WHEEL_R, wz);
      const spin = new THREE.Group();
      spin.add(new THREE.Mesh(c.wheel, c.wood));
      const tyre = new THREE.Mesh(c.tyre, c.rubber);
      spin.add(tyre);
      const peg = new THREE.Mesh(c.peg, c.pegMat);
      peg.position.z = Math.sign(wz) * 0.004;
      peg.rotation.x = (Math.sign(wz) * Math.PI) / 2;
      spin.add(peg);
      wg.add(spin);
      root.add(wg);
      wheels.push(spin);
    }
    for (const ax of [0.031, -0.031]) {
      const axle = new THREE.Mesh(c.axle, c.steel);
      axle.position.set(ax, WHEEL_R, 0);
      axle.rotation.x = Math.PI / 2;
      root.add(axle);
    }
    // wind-up key on the back: shaft along -x, butterfly in the y-z plane
    const key = new THREE.Group();
    key.position.set(-0.0535, 0.0235, 0);
    const shaft = new THREE.Mesh(c.shaft, c.brass);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = -0.0045;
    key.add(shaft);
    const bow = new THREE.Mesh(c.bow, c.brass);
    bow.rotation.y = Math.PI / 2;
    bow.position.x = -0.0095;
    key.add(bow);
    const boss = new THREE.Mesh(c.boss, c.brass);
    boss.rotation.z = Math.PI / 2;
    boss.position.x = -0.0008;
    key.add(boss);
    root.add(key);
    return { root: shadowed(root), wheels, key };
  }

  carParts() {
    const profile = carProfile();
    const { geometry, box } = carGeometry(profile, 0.0476);
    const woodMap = wheelTexture();
    return {
      profile,
      box,
      body: geometry,
      paints: {},
      under: new THREE.BoxGeometry(0.098, 0.0015, 0.04),
      wheel: wheelGeometry(),
      tyre: new THREE.TorusGeometry(WHEEL_R - 0.0012, 0.0012, 8, 48),
      peg: new THREE.SphereGeometry(0.0034, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      axle: new THREE.CylinderGeometry(0.0016, 0.0016, 0.058, 8),
      shaft: new THREE.CylinderGeometry(0.0014, 0.0014, 0.009, 10),
      boss: new THREE.CylinderGeometry(0.003, 0.0034, 0.0016, 16),
      bow: new THREE.ExtrudeGeometry(keyShape(), { depth: 0.0011, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0003, bevelSegments: 2, curveSegments: 16 }).translate(0, 0.0015, -0.00055),
      wood: this.env(new THREE.MeshPhysicalMaterial({ map: woodMap, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 })),
      pegMat: this.env(lacquer({ color: '#f2ead8' })),
      rubber: this.env(new THREE.MeshPhysicalMaterial({ color: '#2a1d18', roughness: 0.72, sheen: 0.3, sheenRoughness: 0.8 })),
      steel: this.env(new THREE.MeshPhysicalMaterial({ color: '#b9bcc0', metalness: 1, roughness: 0.3 })),
      brass: this.env(new THREE.MeshPhysicalMaterial({ color: '#d6ad55', metalness: 1, roughness: 0.28 })),
    };
  }

  wrecker() {
    if (!this.cache.wrecker) {
      const [c, x] = canvas(512, 256);
      x.fillStyle = '#c42f2a';
      x.fillRect(0, 0, 512, 256);
      x.globalAlpha = 0.5;
      brushStrokes(x, 512, 256, 120);
      x.globalAlpha = 1;
      x.fillStyle = '#d7b27c';
      for (let i = 0; i < 10; i++) {
        x.beginPath();
        x.ellipse(rand(0, 512), rand(40, 216), rand(1, 3), rand(1, 2.2), rand(0, 3), 0, Math.PI * 2);
        x.fill();
      }
      const [tc, tx] = canvas(16, 256);
      tx.fillStyle = '#d9cbb0';
      tx.fillRect(0, 0, 16, 256);
      // twisted cotton twine: diagonal plies
      for (let y = -16; y < 256; y += 6) {
        tx.strokeStyle = 'rgba(120,95,60,0.35)';
        tx.lineWidth = 1.5;
        tx.beginPath();
        tx.moveTo(0, y);
        tx.lineTo(16, y + 8);
        tx.stroke();
      }
      const twineMap = texture(tc, { wrap: true });
      this.cache.wrecker = {
        ball: new THREE.SphereGeometry(WRECK_R, 48, 32),
        paint: this.env(lacquer({ map: texture(c), roughness: 0.3 })),
        eye: new THREE.TorusGeometry(0.0033, 0.0008, 8, 24),
        shank: new THREE.CylinderGeometry(0.0011, 0.0011, 0.004, 8),
        brass: this.env(new THREE.MeshPhysicalMaterial({ color: '#d6ad55', metalness: 1, roughness: 0.28 })),
        string: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0),
        twine: this.env(new THREE.MeshPhysicalMaterial({ map: twineMap, roughness: 0.9, sheen: 0.5, sheenRoughness: 0.7, sheenColor: new THREE.Color('#fff4de') })),
        twineMap,
      };
    }
    const w = this.cache.wrecker;
    const root = new THREE.Group();
    root.add(new THREE.Mesh(w.ball, w.paint));
    const shank = new THREE.Mesh(w.shank, w.brass);
    shank.position.y = WRECK_R + 0.0006;
    root.add(shank);
    const eye = new THREE.Mesh(w.eye, w.brass);
    eye.position.y = WRECK_R + 0.0028 + 0.0033 - 0.0008;
    root.add(eye);
    const string = new THREE.Mesh(w.string, w.twine);
    string.castShadow = true;
    string.frustumCulled = false;
    return { root: shadowed(root), string };
  }
}

// ------------------------------------------------------------ props

// A prop's life: it acts (busy), then leaves (fades or is reeled away).
class Prop {
  constructor(tools) {
    this.tools = tools;
    this.age = 0;
    this.busy = true;
    this.leaving = false;
    this.wokeAt = -1;
  }

  // Wake the frozen tower just before a prop reaches it, so the crash is
  // real physics rather than a bounce off a frozen (fixed) body.
  wakeNear(pos, radius, speed) {
    const t = this.tools;
    if (this.age - this.wokeAt < 0.3) return;
    const reach = radius + 0.075 + speed * 0.14;
    for (const h of t.physics.blocks || []) {
      if (h.state !== 'frozen' || !h.body) continue;
      const p = h.body.translation();
      if ((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2 + (p.z - pos.z) ** 2 < reach * reach) {
        t.physics.wake?.(null, { reason: 'tool', hold: 0.8 });
        this.wokeAt = this.age;
        return;
      }
    }
  }
}

class BallProp extends Prop {
  constructor(tools, { from, dir, speed, drop }) {
    super(tools);
    this.id = `ball-${++tools.serial}`;
    this.mesh = tools.models.ball();
    this.mats = ownMaterials(this.mesh);
    tools.scene.add(this.mesh);
    const p = from.clone().setY(BALL_R + (drop || 0));
    const v = dir.clone().multiplyScalar(speed);
    this.handle = tools.physics.addBody({
      colliders: [{ type: 'ball', radius: BALL_R }],
      position: p,
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))),
      type: 'dynamic',
      density: 900, // ~160 g: a thick-walled rubber play ball
      friction: 0.8,
      restitution: 0.55,
      linearDamping: 0.08,
      angularDamping: 0.35,
      ccd: true,
      material: 'rubber',
      walls: false, // it may roll on out of the play area, then fades
      userData: { tool: 'ball' },
    });
    this.handle.body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
    const w = tmpV.crossVectors(UP, v).multiplyScalar(1 / BALL_R);
    this.handle.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
    tools.physics.pose(this.handle, this.mesh.position, this.mesh.quaternion);
    this.still = 0;
    this.bounces = 0;
    this.lastVy = 0;
    this.fade = 1;
  }

  update(dt) {
    const t = this.tools;
    this.age += dt;
    if (this.handle) {
      t.physics.pose(this.handle, this.mesh.position, this.mesh.quaternion);
      const v = this.handle.body.linvel();
      const p = this.handle.body.translation();
      const speed = Math.hypot(v.x, v.y, v.z);
      this.wakeNear(p, BALL_R, speed);
      // a soft rubber bounce each time it comes down on the floor
      const onFloor = p.y < BALL_R + 0.004;
      if (this.lastVy < -0.35 && v.y > -0.05 && onFloor && this.bounces < 4) {
        this.bounces++;
        t.audio?.tool?.('ball');
      }
      this.lastVy = v.y;
      t.audio?.roll?.(this.id, onFloor ? Math.hypot(v.x, v.z) : 0, t.pan(p), t.surface);
      this.still = speed < 0.03 ? this.still + dt : 0;
      const away = Math.hypot(p.x, p.z) > 1.05 || p.y < -0.3;
      if (!this.leaving && (this.still > 0.8 || this.age > 7 || away)) this.leave();
      if (this.age > 2.5) this.busy = false;
    }
    if (this.leaving) {
      this.fade -= dt / 0.6;
      setOpacity(this.mesh, this.mats, Math.max(0, easeInOut(Math.max(0, this.fade))));
      if (this.fade <= 0) return false;
    }
    return true;
  }

  leave() {
    this.leaving = true;
    this.busy = false;
    this.tools.audio?.roll?.(this.id, 0, 0, this.tools.surface);
  }

  dispose() {
    this.tools.audio?.roll?.(this.id, 0, 0, this.tools.surface);
    if (this.handle) this.tools.physics.remove(this.handle);
    this.handle = null;
    this.tools.scene.remove(this.mesh);
    for (const m of this.mats) m.dispose();
  }
}

// The wind-up car: fades in on the floor, its key winds three half turns
// with a ratchet, then it lets go and drives, wheels turning and key
// unwinding, bumps into the tower, runs down and coasts to a stop.
const CAR_COLOURS = ['#c8322b', '#2d63b8', '#e5b31f', '#2f8f55'];
const CAR = {
  appear: 0.35,
  wind: 1.05, // three half turns
  hold: 0.18,
  run: 1.7, // spring runs down over this long (s)
  speed: 0.55, // m/s at full wind
  force: 55, // drive acceleration at a standstill (m/s^2): ~7 N, enough to shove a tower's base
  mass: 0.13,
};

class CarProp extends Prop {
  constructor(tools, { from, dir, strength }) {
    super(tools);
    this.id = `car-${++tools.serial}`;
    this.colour = CAR_COLOURS[tools.serial % CAR_COLOURS.length];
    const m = tools.models.car(this.colour);
    this.mesh = m.root;
    this.wheels = m.wheels;
    this.key = m.key;
    this.mats = ownMaterials(this.mesh);
    tools.scene.add(this.mesh);
    this.start = from.clone().setY(0);
    this.dir = dir.clone().setY(0).normalize();
    this.yaw = Math.atan2(-this.dir.z, this.dir.x);
    this.quat = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw);
    this.mesh.position.copy(this.start);
    this.mesh.quaternion.copy(this.quat);
    this.topSpeed = CAR.speed * (0.85 + 0.35 * strength);
    this.phase = 'appear';
    this.t = 0;
    this.keyAngle = 0;
    this.wheelAngle = 0;
    this.still = 0;
    this.fade = 0;
    this.whirr = false;
    setOpacity(this.mesh, this.mats, 0);
  }

  release() {
    const t = this.tools;
    // colliders in the car's frame, origin on the floor under its centre
    const colliders = [
      { type: 'cuboid', half: [0.0525, 0.0105, 0.0238], offset: [0, 0.0235, 0] },
      { type: 'cuboid', half: [0.021, 0.0075, 0.02], offset: [-0.003, 0.0415, 0] },
    ];
    for (const [wx, wz] of [
      [0.031, 0.0288],
      [0.031, -0.0288],
      [-0.031, 0.0288],
      [-0.031, -0.0288],
    ]) {
      colliders.push({ type: 'ball', radius: WHEEL_R, offset: [wx, WHEEL_R, wz] });
    }
    this.handle = t.physics.addBody({
      colliders,
      position: this.start.clone().setY(0.0005),
      quaternion: this.quat,
      type: 'dynamic',
      density: 700, // ~130 g of beech with a little clockwork inside
      friction: 0.03, // the wheels roll; the drive force below does the grip
      restitution: 0.1,
      angularDamping: 0.8,
      ccd: true,
      material: 'wood',
      userData: { tool: 'car' },
    });
    // Rapier averages friction between surfaces; take the car's own (tiny)
    // value instead so a wood floor doesn't brake wheels that should roll
    const Min = t.physics.RAPIER?.CoefficientCombineRule?.Min;
    if (Min !== undefined) for (const c of this.handle.colliders || []) c.setFrictionCombineRule(Min);
  }

  update(dt) {
    const t = this.tools;
    this.age += dt;
    this.t += dt;
    const reduced = REDUCED_MOTION.matches;
    if (this.phase === 'appear') {
      const k = clamp(this.t / CAR.appear, 0, 1);
      setOpacity(this.mesh, this.mats, easeOut(k));
      this.mesh.position.copy(this.start).setY((1 - easeOut(k)) * 0.012);
      if (k >= 1) this.next('wind');
    } else if (this.phase === 'wind') {
      if (!this.wound) {
        this.wound = true;
        t.audio?.tool?.('windup');
      }
      // three half turns, each a quick twist and a pause, as fingers would
      const turns = 3;
      const each = CAR.wind / turns;
      const i = Math.min(turns - 1, Math.floor(this.t / each));
      const k = clamp((this.t - i * each) / (each * 0.75), 0, 1);
      this.keyAngle = (i + easeInOut(k)) * Math.PI;
      // a tiny rock of the body with each twist
      const rock = reduced ? 0 : Math.sin(k * Math.PI) * 0.012;
      this.mesh.quaternion.copy(this.quat).multiply(tmpQ.setFromAxisAngle(X, rock));
      if (this.t >= CAR.wind) this.next('hold');
    } else if (this.phase === 'hold') {
      this.mesh.quaternion.copy(this.quat);
      if (this.t >= CAR.hold) {
        this.release();
        t.audio?.tool?.('car');
        this.next('run');
      }
    }
    if (this.handle) this.drive(dt);
    this.key.rotation.x = this.keyAngle;
    for (const w of this.wheels) w.rotation.z = -this.wheelAngle;
    if (this.leaving) {
      this.fade -= dt / 0.7;
      setOpacity(this.mesh, this.mats, Math.max(0, easeInOut(Math.max(0, this.fade))));
      if (this.fade <= 0) return false;
    }
    return true;
  }

  next(phase) {
    this.phase = phase;
    this.t = 0;
  }

  drive(dt) {
    const t = this.tools;
    const b = this.handle.body;
    t.physics.pose(this.handle, this.mesh.position, this.mesh.quaternion);
    const r = b.rotation();
    tmpQ.set(r.x, r.y, r.z, r.w);
    const fwd = tmpV.copy(X).applyQuaternion(tmpQ);
    const upY = tmpV2.copy(UP).applyQuaternion(tmpQ).y;
    fwd.y = 0;
    fwd.normalize();
    const v = b.linvel();
    const p = b.translation();
    const s = v.x * fwd.x + v.z * fwd.z;
    const latX = v.x - fwd.x * s;
    const latZ = v.z - fwd.z * s;
    // the spring: full power after a short take-up, running down to nothing
    const run = this.phase === 'run' ? this.t : Infinity;
    const spring = run < CAR.run ? Math.min(1, run / 0.2) * (1 - (run / CAR.run) ** 2) : 0;
    const target = this.topSpeed * spring;
    const upright = upY > 0.8;
    const grounded = upright && Math.abs(v.y) < 0.25 && p.y < 0.03;
    const m = CAR.mass;
    b.resetForces(true);
    if (grounded) {
      // drive: like a clockwork motor, full push at a standstill falling
      // to none at top speed, so it cruises gently yet shoves hard when it
      // meets the tower; the rubber tyres also stop sideways skids
      let a = spring > 0 ? CAR.force * spring * clamp(1 - s / this.topSpeed, -0.2, 1) : -s * 1.3 - Math.sign(s) * 0.1;
      if (spring <= 0 && Math.abs(s) < 0.02) a = -s * 10;
      b.addForce({ x: fwd.x * a * m - latX * 18 * m, y: 0, z: fwd.z * a * m - latZ * 18 * m }, true);
    }
    // wheels turn with the ground, or spin free in the air while it runs
    const ws = grounded ? s : target;
    this.wheelAngle += (ws / WHEEL_R) * dt;
    // the key unwinds as the spring drives the wheels
    if (spring > 0) this.keyAngle -= Math.abs(ws / WHEEL_R) * dt * 0.08 + spring * dt * 1.2;
    const speed = Math.hypot(v.x, v.y, v.z);
    this.wakeNear({ x: p.x + fwd.x * 0.04, y: 0.025, z: p.z + fwd.z * 0.04 }, 0.03, speed);
    t.audio?.roll?.(this.id, grounded ? Math.abs(s) : 0, t.pan(p), t.surface);
    if (spring <= 0) {
      this.still = speed < 0.012 ? this.still + dt : 0;
      if (!this.leaving && (this.still > 1.0 || this.t > CAR.run + 5)) this.leave();
    }
    if (this.phase === 'run' && this.t > CAR.run + 0.5) this.busy = false;
    const away = Math.hypot(p.x, p.z) > 1.3 || p.y < -0.3;
    if (away && !this.leaving) this.leave();
  }

  leave() {
    this.leaving = true;
    this.busy = false;
    this.fade = 1;
    this.tools.audio?.roll?.(this.id, 0, 0, this.tools.surface);
  }

  dispose() {
    this.tools.audio?.roll?.(this.id, 0, 0, this.tools.surface);
    if (this.handle) this.tools.physics.remove(this.handle);
    this.handle = null;
    this.tools.scene.remove(this.mesh);
    for (const m of this.mats) m.dispose();
  }
}

// The wrecking ball hangs on a cotton string from a toy crane's boom above
// the view. It starts drawn back out of sight, swings down through the
// tower as a real pendulum, swings on, and is then reeled up out of the
// picture. The ball is an ordinary dynamic body; the string is applied
// here each frame: when taut it pulls the ball toward the boom with the
// tension a string would carry and stops it stretching, when slack it does
// nothing. (A Rapier rope joint did this too, but crashed the physics
// engine now and then as blocks switched between frozen and free.)
class WreckerProp extends Prop {
  constructor(tools, { target, height, dir, strength }) {
    super(tools);
    const m = tools.models.wrecker();
    this.mesh = m.root;
    this.string = m.string;
    tools.scene.add(this.mesh, this.string);
    // hit the tower a little over half way up, where a column breaks best
    const hitY = clamp(height * 0.55, WRECK_R + 0.006, 0.45);
    this.dir = dir.clone().setY(0).normalize();
    // Draw it back far enough for a lively but gentle arrival speed. For a
    // pendulum the draw-back grows with the string's length at the same
    // speed, so pick the shortest string that hides both the boom (above
    // the view) and the drawn-back ball (off to the side).
    const speed = (REDUCED_MOTION.matches ? 1.15 : 1.35) + 0.4 * strength;
    const cam = tools.camera;
    cam?.updateMatrixWorld();
    const hidden = (p, m) => {
      if (!cam) return true;
      tmpV.copy(p).project(cam);
      return tmpV.z > 1 || Math.abs(tmpV.x) > m || Math.abs(tmpV.y) > m;
    };
    let L = 1.1;
    let start = null;
    for (let i = 0; i <= 30; i++) {
      L = 1.1 + i * 0.05; // up to 2.6 m
      const pivot = new THREE.Vector3(target.x, hitY + L, target.z);
      if (i < 30 && !hidden(pivot.clone().setY(pivot.y + 0.05), 1.1)) continue;
      let theta = Math.acos(clamp(1 - (speed * speed) / (2 * G * L), -1, 1));
      // stay inside the physics' soft walls
      theta = Math.min(theta, Math.asin(Math.min(0.99, (PLAY_R - 0.06) / L)));
      start = pivot.addScaledVector(this.dir, -Math.sin(theta) * L).addScaledVector(UP, -Math.cos(theta) * L);
      if (hidden(start, 1.12)) break;
    }
    this.L = L;
    this.pivot = new THREE.Vector3(target.x, hitY + L, target.z);
    // if even the longest string starts it in view (a very wide screen),
    // it fades in as it swings rather than hanging there from nowhere
    this.fadeIn = hidden(start, 1.12) ? 1 : 0;
    this.mats = ownMaterials(this.mesh).concat(ownMaterials(this.string));
    if (!this.fadeIn) setOpacity(this.mesh, this.mats, 0);
    this.handle = tools.physics.addBody({
      colliders: [{ type: 'ball', radius: WRECK_R }],
      position: start,
      type: 'dynamic',
      density: 3000, // ~200 g: a painted wooden ball with a lead core
      friction: 0.4,
      restitution: 0.3,
      linearDamping: 0.02,
      angularDamping: 0.6,
      ccd: true,
      material: 'paint',
      userData: { tool: 'wrecker' },
    });
    // it hangs from its eye, so it turns with the string, not by itself
    this.handle.body.lockRotations?.(true, true);
    this.pose();
    this.quarter = (Math.PI / 2) * Math.sqrt(L / G);
    this.reelAt = this.quarter + 2.4;
    this.eye = new THREE.Vector3();
    tools.audio?.tool?.('wrecker');
    this.updateString();
  }

  updateString() {
    this.eye.set(0, WRECK_R + EYE - 0.0008, 0).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
    const d = tmpV.subVectors(this.pivot, this.eye);
    const len = d.length();
    this.string.position.copy(this.eye);
    this.string.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    this.string.scale.set(0.0006, len, 0.0006);
  }

  update(dt) {
    this.age += dt;
    const t = this.tools;
    if (this.fadeIn < 1) {
      this.fadeIn = Math.min(1, this.fadeIn + dt / 0.3);
      setOpacity(this.mesh, this.mats, easeOut(this.fadeIn));
    }
    if (this.handle) {
      this.pose();
      this.pull();
      const v = this.handle.body.linvel();
      const p = this.handle.body.translation();
      this.wakeNear(p, WRECK_R, Math.hypot(v.x, v.y, v.z));
      if (this.age > this.reelAt) this.startReel(p, v);
    } else if (this.reel) {
      // reel in: the string shortens faster and faster while the leftover
      // swing dies away, until the ball is up out of the picture
      const r = this.reel;
      r.speed = Math.min(1.1, r.speed + dt * 1.2);
      r.len = Math.max(0.12, r.len - r.speed * dt);
      const k = G / r.len;
      r.u.addScaledVector(r.o, -k * dt).multiplyScalar(Math.exp(-dt * 2.5));
      r.o.addScaledVector(r.u, dt);
      if (r.o.length() > r.len * 0.9) r.o.setLength(r.len * 0.9);
      const drop = Math.sqrt(r.len * r.len - r.o.lengthSq());
      const eye = tmpV.copy(this.pivot).add(r.o).addScaledVector(UP, -drop);
      const along = tmpV2.subVectors(this.pivot, eye).normalize();
      this.mesh.quaternion.setFromUnitVectors(UP, along);
      this.mesh.position.copy(eye).addScaledVector(along, -(WRECK_R + EYE));
      if (r.len <= 0.12 || this.mesh.position.y > this.pivot.y - 0.2) return false;
    }
    this.updateString();
    return true;
  }

  // Mesh from the interpolated body position, eye turned to the boom.
  pose() {
    this.tools.physics.pose(this.handle, this.mesh.position, null);
    this.mesh.quaternion.setFromUnitVectors(UP, tmpV.subVectors(this.pivot, this.mesh.position).normalize());
  }

  // The string: inextensible when taut, no push when slack. Tension is the
  // centripetal pull plus gravity's share along the string, held as a force
  // over the next physics steps; any stretch left is trimmed off.
  pull() {
    const b = this.handle.body;
    b.resetForces(true);
    const p = b.translation();
    const pv = this.pivot;
    const rx = p.x - pv.x;
    const ry = p.y - pv.y;
    const rz = p.z - pv.z;
    const d = Math.hypot(rx, ry, rz) || 1;
    if (d < this.L - 0.001) return;
    const nx = rx / d;
    const ny = ry / d;
    const nz = rz / d;
    const v = b.linvel();
    let { x: vx, y: vy, z: vz } = v;
    const out = vx * nx + vy * ny + vz * nz;
    if (out > 0) {
      vx -= nx * out;
      vy -= ny * out;
      vz -= nz * out;
      b.setLinvel({ x: vx, y: vy, z: vz }, true);
    }
    if (d > this.L) b.setTranslation({ x: pv.x + nx * this.L, y: pv.y + ny * this.L, z: pv.z + nz * this.L }, true);
    const m = this.handle.mass || b.mass();
    const T = m * ((vx * vx + vy * vy + vz * vz) / this.L - G * ny);
    if (T > 0) b.addForce({ x: -nx * T, y: -ny * T, z: -nz * T }, true);
  }

  startReel(p, v) {
    const t = this.tools;
    const eye = this.eye;
    this.reel = {
      len: this.pivot.distanceTo(eye),
      o: new THREE.Vector3(eye.x - this.pivot.x, 0, eye.z - this.pivot.z),
      u: new THREE.Vector3(v.x, 0, v.z),
      speed: 0.1,
    };
    this.dropBody();
    this.busy = false;
    this.leaving = true;
    t.audio?.tool?.('wrecker');
  }

  dropBody() {
    if (this.handle) this.tools.physics.remove(this.handle);
    this.handle = null;
  }

  leave() {
    if (this.handle) this.startReel(this.handle.body.translation(), this.handle.body.linvel());
  }

  dispose() {
    this.dropBody();
    this.tools.scene.remove(this.mesh, this.string);
    for (const m of this.mats) m.dispose();
  }
}

// ------------------------------------------------------------ Tools

export class Tools {
  constructor({ scene, physics, audio = null, fx = null, quality = {}, envMap = null, camera = null, surface = 'wood' }) {
    this.scene = scene;
    this.physics = physics;
    this.audio = audio;
    this.fx = fx;
    this.quality = quality;
    this.camera = camera; // optional: aims launches across the view
    this.surface = surface;
    this.models = new Models(envMap);
    this.props = [];
    this.tool = 'flick';
    this.serial = 0;
    this.side = 1;
    this.flickCool = 0;
  }

  select(id) {
    this.tool = id;
  }

  setSurface(kind) {
    this.surface = kind;
  }

  get busy() {
    return this.flickCool > 0 || this.props.some((p) => p.busy);
  }

  // Build every prop once and compile its shaders against the live scene,
  // so the first knock doesn't hitch.
  prewarm(renderer, camera = this.camera) {
    const g = new THREE.Group();
    g.position.set(0, -20, 0);
    g.add(this.models.ball(), this.models.car(CAR_COLOURS[0]).root, this.models.wrecker().root);
    this.scene.add(g);
    try {
      renderer.compile(this.scene, camera);
    } finally {
      this.scene.remove(g);
    }
  }

  // Pan for sounds: from the camera's view if we have it, else world x.
  pan(p) {
    if (this.camera) {
      tmpV.set(p.x, p.y, p.z).project(this.camera);
      return clamp(tmpV.x, -1, 1);
    }
    return clamp(p.x / 0.5, -1, 1);
  }

  // Horizontal camera axes: right, and towards the viewer.
  axes() {
    const right = new THREE.Vector3(1, 0, 0);
    const toward = new THREE.Vector3(0, 0, 1);
    if (this.camera) {
      this.camera.updateMatrixWorld();
      right.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
      toward.setFromMatrixColumn(this.camera.matrixWorld, 2).setY(0).normalize();
    }
    return { right, toward };
  }

  inView(p, margin = 0.85) {
    if (!this.camera) return true;
    tmpV.copy(p).project(this.camera);
    return Math.abs(tmpV.x) < margin && Math.abs(tmpV.y) < margin && tmpV.z < 1;
  }

  // The button, the Big kid finish, or a swipe on empty floor.
  trigger({ from = null, dir = null, strength = 0.75, target = new THREE.Vector3(), height = 0.2 } = {}) {
    const s = clamp(strength, 0, 1);
    const tgt = target.clone().setY(0);
    // at most two props at a time; the oldest steps aside
    const active = this.props.filter((p) => !p.leaving);
    if (active.length >= 2) active[0].leave();
    const tool = this.tool;
    if (tool === 'flick') return this.flickTower({ from, dir, strength: s, target: tgt, height });
    if (tool === 'ball') return this.launchBall({ from, dir, strength: s, target: tgt });
    if (tool === 'car') return this.launchCar({ from, dir, strength: s, target: tgt });
    if (tool === 'wrecker') return this.launchWrecker({ dir, strength: s, target: tgt, height });
    return false;
  }

  // A swipe hit a block: flick it. Faster swipes flick harder. A block
  // pinned under others needs more speed to slide out against their
  // friction, so the kick grows with the load on it (capped so it stays a
  // joyful topple rather than a blast). With `push`, the part of the tower
  // above the finger is shoved too, so it tips over as a piece.
  flickAt(handle, point, dir, strength = 0.6, { push = false } = {}) {
    if (!handle) return false;
    const s = clamp(strength, 0, 1);
    const reduced = REDUCED_MOTION.matches;
    const d = dir.clone();
    d.y = Math.max(0, d.y) * 0.3;
    d.normalize();
    const at = new THREE.Vector3(point.x, point.y, point.z);
    const above = this.blocksAbove(handle, at);
    // speed to slide 4.5 cm out between surfaces gripping at ~0.45
    const need = Math.sqrt(0.45 * (2 * above.length + 1));
    const dv = clamp(need * (0.95 + 0.45 * s), 0.8, 3.2) * (reduced ? 0.85 : 1);
    // a flick is a kick of speed, so scale by the block's own mass
    const mass = handle.mass || handle.body?.mass?.() || 0.044;
    const imp = d.clone().multiplyScalar(mass * dv);
    imp.y += mass * 0.25 * s; // a hint of lift so it pops rather than grinds
    // physics.impulse() wakes the block and whatever rests on it
    this.physics.impulse(handle, imp, at);
    if (push && above.length) {
      // tip the part above about the finger: speed grows with height
      this.physics.wake?.(above, { reason: 'tool', hold: 0.5 });
      const w = (reduced ? 1.6 : 2) + 1.5 * s; // rad/s
      const axis = tmpV2.crossVectors(UP, d).normalize();
      for (const h of above) {
        const b = h.body;
        if (!b || h.state === 'frozen') continue;
        const p = b.translation();
        const lever = Math.max(0, p.y - at.y);
        const v = b.linvel();
        b.setLinvel({ x: v.x + d.x * w * lever, y: v.y, z: v.z + d.z * w * lever }, true);
        const av = b.angvel();
        b.setAngvel({ x: av.x + axis.x * w, y: av.y, z: av.z + axis.z * w }, true);
      }
    }
    this.audio?.tool?.('flick');
    this.fx?.swish?.(at.addScaledVector(d, -0.004), d, s);
    this.flickCool = 0.25;
    return true;
  }

  // Blocks stacked over a point: resting above it and within a block or so
  // sideways (a column, or the top of a pyramid).
  blocksAbove(handle, at) {
    const out = [];
    for (const h of this.physics.blocks || []) {
      if (h === handle || !h.body) continue;
      const p = h.body.translation();
      if (p.y > at.y + 0.01 && Math.hypot(p.x - at.x, p.z - at.z) < 0.07) out.push(h);
    }
    return out;
  }

  // The flick button: flick the upper part of the tower from the side.
  flickTower({ from, dir, strength, target, height }) {
    const { right, toward } = this.axes();
    let d = dir ? dir.clone().setY(0).normalize() : null;
    if (from && d) {
      const hit = this.physics.raycast(from, d, 0.45);
      if (hit && hit.handle && hit.handle.kind !== 'body') return this.flickAt(hit.handle, hit.point, d, strength, { push: true });
    }
    if (!d) {
      // across the view with a touch of "away from me"
      this.side = -this.side;
      d = right.clone().multiplyScalar(this.side).addScaledVector(toward, -0.35).normalize();
    }
    const top = Math.max(height, this.physics.structureHeight?.() || 0);
    const y = Math.max(0.012, Math.min(top * 0.6, top - 0.014));
    const origin = target.clone().addScaledVector(d, -0.45).setY(y);
    let hit = this.physics.raycast(origin, d, 0.9);
    if (!hit || !hit.handle || hit.handle.kind === 'body') {
      // nothing at that height: flick the top block from above-side
      const down = this.physics.raycast(tmpV.set(target.x, top + 0.3, target.z), tmpV2.set(0, -1, 0), top + 0.35);
      if (down && down.handle && down.handle.kind !== 'body') {
        const p = down.point;
        hit = { handle: down.handle, point: new THREE.Vector3(p.x, p.y - 0.012, p.z).addScaledVector(d, -0.015) };
      }
    }
    if (hit && hit.handle) return this.flickAt(hit.handle, hit.point, d, strength, { push: true });
    this.fx?.swish?.(target.clone().setY(y), d, strength);
    this.audio?.tool?.('flick');
    return false;
  }

  launchBall({ from, dir, strength, target }) {
    const { toward } = this.axes();
    let start;
    let d;
    let drop = 0;
    if (from && dir) {
      // a swipe that starts on the floor: roll it from there
      start = from.clone();
      d = dir.clone().setY(0).normalize();
    } else {
      if (dir) {
        // a swipe direction only: roll in from out of view along it
        d = dir.clone().setY(0).normalize();
      } else {
        // the button: in on a diagonal from a front corner, as if a child
        // sitting nearby had rolled it, so the tower falls across the view
        // rather than straight into the lens
        this.side = -this.side;
        d = toward.clone().applyAxisAngle(UP, rand(0.75, 1.0) * this.side).negate();
      }
      start = target.clone().addScaledVector(d, -0.7);
      drop = 0.05; // arrives with a little hop
    }
    start.setY(0);
    if (Math.hypot(start.x, start.z) > PLAY_R) start.setLength(PLAY_R);
    const speed = 2.1 + 0.5 * strength; // m/s: a good hard roll, enough to topple a tall tower
    this.props.push(new BallProp(this, { from: start, dir: d, speed, drop }));
    return true;
  }

  launchCar({ from, dir, strength, target }) {
    let start;
    let d;
    if (from && dir) {
      start = from.clone().setY(0);
      d = dir.clone().setY(0).normalize();
    } else {
      // parked in view, pointing at the tower, so you can see it wind up:
      // along the swipe, or to one side and a little in front
      const { right, toward } = this.axes();
      if (dir) d = dir.clone().setY(0).normalize();
      else {
        this.side = -this.side;
        d = right.clone().multiplyScalar(-this.side).addScaledVector(toward, -0.45).normalize();
      }
      const place = (dist) => target.clone().addScaledVector(d, -dist).setY(0);
      let dist = 0.33;
      start = place(dist);
      while (dist > 0.17 && !this.inView(tmpV2.copy(start).setY(0.03), 0.8)) {
        dist -= 0.02;
        start = place(dist);
      }
      // don't park on scattered blocks
      for (let i = 0; i < 6 && (this.physics.topAt?.(start.x, start.z, 0.03) || 0) > 0.005; i++) {
        dist += 0.04;
        start = place(dist);
      }
    }
    if (Math.hypot(start.x, start.z) > PLAY_R) start.setLength(PLAY_R).setY(0);
    this.props.push(new CarProp(this, { from: start, dir: d, strength }));
    return true;
  }

  launchWrecker({ dir, strength, target, height }) {
    let d = dir;
    if (!d) {
      const { right } = this.axes();
      this.side = -this.side;
      d = right.clone().multiplyScalar(this.side);
    }
    const top = Math.max(height, this.physics.structureHeight?.() || 0, 0.04);
    this.props.push(new WreckerProp(this, { target, height: top, dir: d, strength }));
    return true;
  }

  // Call after physics.step() so meshes follow the fresh interpolated pose.
  update(dt) {
    this.flickCool = Math.max(0, this.flickCool - dt);
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      if (p.update(dt) === false) {
        p.dispose();
        this.props.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.props) p.dispose();
    this.props.length = 0;
    this.flickCool = 0;
  }
}
