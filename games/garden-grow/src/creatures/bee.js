// Bees: a fuzzy buff-tailed bumblebee and a honeybee, at real size. They
// dart between open blooms, hover in front of each one, bumble in and crawl
// about a little on the flower, then buzz on to the next. In flight their
// wings are a faint blur; at rest they lie folded over the back.
import * as THREE from 'three';
import { clamp, damp, smooth } from '../config.js';
import { lathe, ellipsoid, tube, curve, merge, paint, mirrorX } from './geo.js';
import { furGeometry, furMaterial } from './fur.js';
import { follow, refind, chooseTarget, keepInside, clearLens, offscreenPoint, offscreen, wanderPoint, wave, basis, ease, VOLUME } from './flight.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

// Sizes in metres. `bands(a)` colours the abdomen from front (0) to tip (1).
export const BEE_KINDS = {
  bumblebee: {
    length: 0.018,
    speed: 0.75,
    hair: { head: 0.0008, thorax: 0.0013, abdomen: 0.0011 },
    shells: 11,
    head: [0.0021, 0.0023, 0.0016],
    thorax: [0.0035, 0.0033, 0.0036],
    abdomen: { r: 0.0042, len: 0.0105, ry: 0.86 },
    wing: 0.0105,
    colors: {
      head: '#15120f',
      thorax: '#17130f',
      collar: '#d9a21e',
      abdomen: (a) => (a < 0.12 ? '#17130f' : a < 0.36 ? '#dfa51d' : a < 0.64 ? '#17130f' : '#efe7d2'),
      legs: '#1a1612',
      pollen: '#f0a21a',
      eye: '#161412',
    },
    wingTint: '#8a7a68',
  },
  honeybee: {
    length: 0.013,
    speed: 0.7,
    hair: { head: 0.00045, thorax: 0.0007, abdomen: 0.00018 },
    shells: 7,
    head: [0.0018, 0.002, 0.0012],
    thorax: [0.0022, 0.0021, 0.0024],
    abdomen: { r: 0.0023, len: 0.0078, ry: 0.92 },
    wing: 0.0088,
    colors: {
      head: '#261c14',
      thorax: '#9a6c36',
      collar: '#b08448',
      // amber tergites, each edged dark brown, the tip darker
      abdomen: (a) => {
        const seg = (a * 5.2) % 1;
        if (a > 0.82) return '#3a2616';
        if (seg > 0.62) return '#3e2814';
        if (seg < 0.12) return '#d8b27a';
        return a < 0.45 ? '#c9801f' : '#a8641c';
      },
      legs: '#2a1e14',
      pollen: '#f2b82a',
      eye: '#2a2018',
    },
    wingTint: '#b0a898',
  },
};

const cache = new Map();

// ------------------------------------------------------------------ model

function bodyPieces(spec) {
  const [hx, hy, hz] = spec.head;
  const [tx, ty, tz] = spec.thorax;
  const ab = spec.abdomen;
  const c = spec.colors;
  const thZ = 0.0012;
  const headZ = thZ + tz + hz * 0.7;
  const abZ1 = thZ - tz * 0.75;
  const abZ0 = abZ1 - ab.len;
  const col = new THREE.Color();
  const bandCache = new Map();
  const bandColor = (hex) => {
    if (!bandCache.has(hex)) bandCache.set(hex, new THREE.Color(hex));
    return bandCache.get(hex);
  };
  const head = lathe({ z0: headZ - hz, z1: headZ + hz, radius: (t) => Math.sqrt(Math.max(0, Math.sin(Math.PI * t))), rx: hx, ry: hy, y: -hy * 0.15, segs: 16, rings: 10 });
  paint(head, (x, y, z, out) => out.set(c.head));
  const thorax = lathe({ z0: thZ - tz, z1: thZ + tz, radius: (t) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.55), rx: tx, ry: ty, segs: 20, rings: 14 });
  paint(thorax, (x, y, z, out) => {
    out.set(c.thorax);
    // a pale collar across the front of the thorax (and its sides)
    if (z > thZ + tz * 0.35 && y > -ty * 0.4) out.set(c.collar);
    if (y < -ty * 0.55) out.set(c.head);
    return out;
  });
  const abdomen = lathe({
    z0: abZ0,
    z1: abZ1,
    radius: (t) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04))), 0.5) * (0.75 + 0.25 * Math.sin(Math.PI * t * 0.8 + 0.3)),
    rx: ab.r,
    ry: ab.r * ab.ry,
    sag: (t) => -ab.r * 0.35 * (1 - t) * (1 - t),
    y: -ab.r * 0.1,
    segs: 20,
    rings: 18,
  });
  paint(abdomen, (x, y, z, out) => {
    const a = 1 - (z - abZ0) / (abZ1 - abZ0);
    out.copy(bandColor(c.abdomen(a)));
    if (y < -ab.r * 0.55) out.multiplyScalar(0.55);
    return out;
  });
  const h = spec.hair;
  const spacing = spec.length * 0.0046;
  return {
    pieces: [
      Object.assign(head, { hair: h.head, circ: (hx + hy) * Math.PI, len: hz * 2, droop: 0.3, spacing }),
      Object.assign(thorax, { hair: h.thorax, circ: (tx + ty) * Math.PI, len: tz * 2, droop: 0.4, spacing }),
      Object.assign(abdomen, { hair: h.abdomen, circ: ab.r * 2 * Math.PI, len: ab.len, droop: 0.7, spacing }),
    ],
    headZ,
    thZ,
    abZ0,
  };
}

// eyes, antennae, legs (with pollen loads) for a pose: 'stand' or 'fly'
function appendagePieces(spec, dims, pose) {
  const [hx, hy, hz] = spec.head;
  const [tx, ty] = spec.thorax;
  const c = spec.colors;
  const L = spec.length;
  const pieces = [];
  const colored = (piece, hex) => paint(piece, (x, y, z, out) => out.set(hex));
  const add = (piece) => pieces.push(piece, mirrorX(piece));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const hz0 = dims.headZ;
  // big dark compound eyes on the sides of the head
  add(colored(ellipsoid(hx * 0.78, 0, hz0 + hz * 0.1, hx * 0.38, hy * 0.72, hz * 0.62, 10, 8), c.eye));
  // elbowed antennae: a scape, then the whip bent forwards
  const ant = tube(curve([V(hx * 0.25, hy * 0.45, hz0 + hz * 0.8), V(hx * 0.4, hy * 1.2, hz0 + hz * 1.3), V(hx * 0.55, hy * 1.8, hz0 + hz * 1.5), V(hx * 0.8, hy * 2.0, hz0 + hz * 2.6), V(hx * 1.0, hy * 1.5, hz0 + hz * 3.6)], 10), L * 0.012, 4);
  add(colored(ant, c.head));
  // legs: three pairs from under the thorax
  const leg = (pts, r) => colored(tube(curve(pts.map((p) => V(p[0] * L, p[1] * L, p[2] * L)), 10), (t) => r * L * (1 - 0.4 * t), 4), c.legs);
  const ty0 = -ty / L;
  const zc = dims.thZ / L;
  if (pose === 'stand') {
    add(leg([[0.05, ty0 * 0.7, zc + 0.12], [0.16, ty0 * 0.9, zc + 0.2], [0.2, ty0 - 0.1, zc + 0.26], [0.22, ty0 - 0.2, zc + 0.3]], 0.018));
    add(leg([[0.06, ty0 * 0.8, zc], [0.2, ty0 * 0.9, zc + 0.02], [0.26, ty0 - 0.12, zc - 0.02], [0.28, ty0 - 0.2, zc - 0.05]], 0.02));
    add(leg([[0.06, ty0 * 0.8, zc - 0.1], [0.2, ty0 * 0.85, zc - 0.2], [0.25, ty0 - 0.12, zc - 0.34], [0.26, ty0 - 0.2, zc - 0.44]], 0.024));
  } else {
    // in flight the legs hang, the pollen-laden hind legs trailing
    add(leg([[0.05, ty0 * 0.7, zc + 0.12], [0.1, ty0 - 0.08, zc + 0.14], [0.08, ty0 - 0.18, zc + 0.1]], 0.018));
    add(leg([[0.06, ty0 * 0.8, zc], [0.12, ty0 - 0.1, zc - 0.04], [0.1, ty0 - 0.22, zc - 0.1]], 0.02));
    add(leg([[0.06, ty0 * 0.8, zc - 0.1], [0.14, ty0 - 0.1, zc - 0.22], [0.12, ty0 - 0.2, zc - 0.4]], 0.024));
  }
  // pollen loads packed on the hind legs
  const pz = pose === 'stand' ? zc - 0.3 : zc - 0.3;
  const px = pose === 'stand' ? 0.235 : 0.13;
  const py = pose === 'stand' ? ty0 - 0.08 : ty0 - 0.16;
  add(colored(ellipsoid(px * L, py * L, pz * L, 0.035 * L, 0.04 * L, 0.06 * L, 8, 6), c.pollen));
  return pieces;
}

// bee wing: a narrow veined membrane, smoky and clear
let wingTex = null;
export function wingTexture() {
  if (wingTex) return wingTex;
  const W = 256;
  const H = 96;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  // outline: base at the left, leading edge along the top
  const shape = new Path2D();
  shape.moveTo(4, 40);
  shape.bezierCurveTo(40, 14, 150, 10, 222, 26);
  shape.bezierCurveTo(250, 34, 254, 58, 236, 70);
  shape.bezierCurveTo(190, 88, 90, 84, 30, 64);
  shape.bezierCurveTo(12, 58, 2, 50, 4, 40);
  ctx.fillStyle = 'rgba(235,238,240,0.28)';
  ctx.fill(shape);
  ctx.save();
  ctx.clip(shape);
  // smoky tint towards the tip
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(120,100,80,0.0)');
  g.addColorStop(1, 'rgba(120,100,80,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // veins: costa, cells and the dark stigma
  ctx.strokeStyle = 'rgba(60,40,26,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(4, 40);
  ctx.bezierCurveTo(40, 16, 120, 14, 150, 18);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  const vein = (pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
    ctx.stroke();
  };
  vein([6, 44, 60, 40, 110, 36, 150, 30, 180, 36, 200, 50]);
  vein([10, 52, 60, 58, 100, 60, 140, 56]);
  vein([60, 40, 70, 58]);
  vein([110, 36, 118, 60, 140, 56, 150, 30]);
  vein([150, 30, 176, 24, 200, 50, 170, 62, 140, 56]);
  vein([100, 60, 110, 76]);
  ctx.fillStyle = 'rgba(70,46,30,0.95)';
  ctx.beginPath();
  ctx.ellipse(146, 20, 12, 4, -0.05, 0, TAU);
  ctx.fill();
  ctx.restore();
  wingTex = new THREE.CanvasTexture(cv);
  wingTex.colorSpace = THREE.SRGBColorSpace;
  wingTex.anisotropy = 4;
  return wingTex;
}

// the motion blur of a beating wing: a fan, densest at the stroke's ends
let blurTex = null;
export function blurTexture() {
  if (blurTex) return blurTex;
  const W = 128;
  const H = 32;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const v = y / (H - 1);
      const ends = 0.35 + 0.65 * Math.pow(Math.abs(u * 2 - 1), 4);
      const radial = smooth(0.0, 0.25, v) * (1 - smooth(0.8, 1.0, v));
      const a = ends * radial;
      const i = (y * W + x) * 4;
      img.data[i] = 225;
      img.data[i + 1] = 225;
      img.data[i + 2] = 230;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  blurTex = new THREE.CanvasTexture(cv);
  blurTex.colorSpace = THREE.SRGBColorSpace;
  return blurTex;
}

// a wing plane: base at the origin, along +x, leading edge towards +z
export function wingPlane(len) {
  const g = new THREE.PlaneGeometry(len, len * 0.375);
  g.rotateX(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  // flip v so the leading edge (the canvas top) faces forward (+z)
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - uv.getY(k));
  return g;
}

// a flat fan (sector) swept by the wing in the stroke plane
export function fanGeometry(len, a0, a1) {
  const seg = 16;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let k = 0; k <= seg; k++) {
    const a = a0 + ((a1 - a0) * k) / seg;
    pos.push(0, 0, 0, Math.cos(a) * len, 0, Math.sin(a) * len);
    uv.push(k / seg, 0, k / seg, 1);
    if (k < seg) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function beeAssets(kind, quality) {
  if (cache.has(kind)) return cache.get(kind);
  const spec = BEE_KINDS[kind];
  const tier = quality?.tier || 'high';
  const dims = bodyPieces(spec);
  const shells = tier === 'low' ? Math.ceil(spec.shells / 2) : spec.shells;
  const body = merge(furGeometry(dims.pieces, shells));
  const bodyMat = furMaterial({ roughness: 0.8, rootDark: 0.55, tipLight: kind === 'honeybee' ? 0.3 : 0.18, sheen: 0.5 });
  const appMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 });
  const wingMat = new THREE.MeshPhysicalMaterial({
    map: wingTexture(),
    color: new THREE.Color(spec.wingTint).lerp(new THREE.Color('#ffffff'), 0.55),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.25,
    metalness: 0,
    iridescence: 0.9,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [220, 480],
  });
  const blurMat = new THREE.MeshStandardMaterial({ map: blurTexture(), color: new THREE.Color(spec.wingTint).lerp(new THREE.Color('#ffffff'), 0.4), transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6 });
  const a = {
    spec,
    dims,
    body,
    bodyMat,
    appStand: merge(appendagePieces(spec, dims, 'stand')),
    appFly: merge(appendagePieces(spec, dims, 'fly')),
    appMat,
    wingFore: wingPlane(spec.wing),
    wingHind: wingPlane(spec.wing * 0.7),
    wingMat,
    fan: fanGeometry(spec.wing * 1.02, -1.05, 1.05),
    blurMat,
    stand: -spec.thorax[1] + 0.22 * spec.length, // thorax centre height over the flower when standing
  };
  cache.set(kind, a);
  return a;
}

// ------------------------------------------------------------------ bee

export class Bee {
  constructor(kind, host, { still = false } = {}) {
    this.kind = kind;
    this.group = 'bee';
    this.host = host;
    const spec = (this.spec = BEE_KINDS[kind]);
    const a = (this.a = beeAssets(kind, host?.quality));
    const o = (this.object = new THREE.Group());
    o.name = kind;
    o.userData.creature = this;
    const rig = (this.rig = new THREE.Group());
    o.add(rig);
    const body = new THREE.Mesh(a.body, a.bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.appStand = new THREE.Mesh(a.appStand, a.appMat);
    this.appFly = new THREE.Mesh(a.appFly, a.appMat);
    this.appStand.castShadow = this.appFly.castShadow = true;
    rig.add(body, this.appStand, this.appFly);
    // folded wings (at rest) and blur fans (in flight), one of each per side
    this.rest = [];
    this.fans = [];
    const [tx, ty] = spec.thorax;
    for (const side of [1, -1]) {
      // folded back over the abdomen, tips a little apart, leading edges out
      const root = new THREE.Group();
      root.position.set(side * tx * 0.3, ty * 0.8, a.dims.thZ + spec.thorax[2] * 0.2);
      root.rotation.set(0, Math.PI / 2 - side * 0.2, side * 0.06);
      const fw = new THREE.Mesh(a.wingFore, a.wingMat);
      const hw = new THREE.Mesh(a.wingHind, a.wingMat);
      if (side < 0) fw.scale.z = hw.scale.z = -1;
      hw.position.set(spec.thorax[2] * 0.3, -0.00008, -side * spec.length * 0.02);
      fw.renderOrder = hw.renderOrder = 2;
      root.add(fw, hw);
      rig.add(root);
      this.rest.push(root);
      const fan = new THREE.Mesh(a.fan, a.blurMat);
      fan.position.copy(root.position);
      fan.renderOrder = 3;
      if (side < 0) fan.scale.x = -1;
      rig.add(fan);
      this.fans.push(fan);
    }
    this.pos = o.position;
    this.vel = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.exit = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.loopFrom = new THREE.Vector3();
    this.heading = new THREE.Vector3(0, 0, 1);
    this.qWant = new THREE.Quaternion();
    this.qFrom = new THREE.Quaternion();
    this.off = new THREE.Vector2();
    this.offGoal = new THREE.Vector2();
    this.tgt = null;
    this.tgtPlant = null;
    this.tgtKind = 'bloom';
    this.tgtPos = new THREE.Vector3();
    this.tgtN = new THREE.Vector3(0, 1, 0);
    this.state = 'fly';
    this.purpose = 'enter';
    this.entering = true;
    this.timer = 0;
    this.age = 0;
    this.yaw = 0;
    this.seed = Math.random() * 100;
    this.visits = 0;
    this.maxVisits = 4 + Math.floor(Math.random() * 5);
    this.stay = 40 + Math.random() * 40;
    this.settled = false;
    this.dead = false;
    this.excite = 0;
    this.buzz = 0;
    this.radius = Math.max(0.08, spec.length * 2);
    if (still) this.pose(false);
  }

  enter(camera) {
    offscreenPoint(this.pos, camera, Math.random() < 0.5 ? -1 : 1);
    this.vel.set(-Math.sign(this.pos.x) * this.spec.speed, 0, 0);
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    this.state = 'fly';
    this.purpose = 'enter';
    this.entering = true;
  }

  leave() {
    if (this.purpose === 'leave') return;
    if (this.state !== 'fly' && this.state !== 'hover') this.takeOff();
    this.state = 'fly';
    this.purpose = 'leave';
    offscreenPoint(this.exit, this.host?.camera, this.pos.x < 0 ? -1 : 1);
  }

  poke() {
    if (this.state === 'loop' || this.purpose === 'leave') return;
    this.returnTo = this.tgtPlant && (this.state === 'crawl' || this.state === 'land' || this.state === 'hover');
    if (this.state === 'crawl' || this.state === 'land') this.takeOff();
    this.state = 'loop';
    this.timer = 0;
    this.loopDur = this.host?.reduced ? 2.4 : 1.6;
    this.loopFrom.copy(this.pos);
    this.excite = 1;
  }

  update(dt, t, world) {
    this.age += dt;
    if (this.purpose !== 'leave' && (world.night || 0) > 0.65) this.stay = Math.min(this.stay, this.age);
    switch (this.state) {
      case 'fly':
        this.fly(dt, t, world);
        break;
      case 'hover':
        this.hover(dt, t, world);
        break;
      case 'land':
        this.landing(dt, t, world);
        break;
      case 'crawl':
        this.crawl(dt, t, world);
        break;
      case 'loop':
        this.looping(dt, t, world);
        break;
    }
    this.animate(dt, t);
  }

  // the plants hand out targets a few times a second: glide between them
  track(world, dt = 0) {
    if (!this.tgtPlant) return false;
    const x = refind(world.targets, this.tgtPlant, this.tgtKind, this.tgtPos);
    if (!x) {
      this.tgt = null;
      this.tgtPlant = null;
      return false;
    }
    this.tgt = x;
    follow(this.tgtPos, this.tgtN, x.pos, x.normal || UP, dt);
    return true;
  }

  aimAt(x) {
    this.tgt = x;
    this.tgtPlant = x.plant;
    this.tgtKind = x.kind;
    this.tgtPos.copy(x.pos);
    this.tgtN.copy(x.normal || UP).normalize();
    this.purpose = 'visit';
    this.timer = 0;
  }

  next(world, avoid = null) {
    if (this.age > this.stay || this.visits >= this.maxVisits || (world.rain || 0) > 0.5) {
      this.leave();
      return;
    }
    const host = this.host;
    const x = chooseTarget(world.targets, ['bloom'], this.kind, this.pos, (q) => host.taken(q, this), avoid);
    if (x) this.aimAt(x);
    else {
      this.purpose = 'wander';
      this.timer = 2 + Math.random() * 3;
      wanderPoint(this.goal, 0.2, 0.8);
    }
  }

  // hover point: just off the flower's face
  hoverPoint(out) {
    return out.copy(this.tgtPos).addScaledVector(this.tgtN, 0.05).addScaledVector(UP, 0.012);
  }

  fly(dt, t, world) {
    const s = this.spec;
    if (this.purpose === 'enter') this.next(world);
    if (this.purpose === 'visit' && !this.track(world, dt)) this.next(world);
    if (this.purpose === 'visit') this.hoverPoint(this.goal);
    else if (this.purpose === 'wander') {
      this.timer -= dt;
      if (this.pos.distanceTo(this.goal) < 0.12) wanderPoint(this.goal, 0.2, 0.8);
      if (this.timer <= 0) {
        if (this.age > 14 && !(world.targets && world.targets.some((x) => x.kind === 'bloom'))) this.leave();
        else this.next(world);
      }
    } else if (this.purpose === 'leave') this.goal.copy(this.exit);
    const toGoal = _d.subVectors(this.goal, this.pos);
    const dist = toGoal.length();
    const calm = this.host?.reduced ? 0.65 : 1;
    const speed = s.speed * calm * (1 + this.excite * 0.3);
    const near = smooth(0, 0.3, dist);
    _w.copy(toGoal).multiplyScalar((speed * Math.max(0.15, near)) / Math.max(dist, 1e-3));
    // a bee's line is purposeful with a small weave
    const tt = t * 2.2 + this.seed;
    const er = 0.18 * speed * near * calm;
    _w.x += wave(tt, 0.1, 2.3, 4.4) * er;
    _w.y += wave(tt * 1.4, 1.2, 3.1, 0.7) * er * 0.6;
    _w.z += wave(tt * 0.8, 5.1, 0.4, 2.2) * er;
    if (this.entering) {
      const V = VOLUME;
      const p = this.pos;
      if (p.x > V.x0 && p.x < V.x1 && p.y < V.y1 && p.z > V.z0 && p.z < V.z1) this.entering = false;
    } else if (this.purpose !== 'leave') keepInside(this.pos, _w);
    const gy = (world.lawn && world.lawn(this.pos.x, this.pos.z)) ?? 0;
    if (this.pos.y < gy + 0.08) _w.y += (gy + 0.08 - this.pos.y) * 5;
    const k = 1 - Math.exp(-4.5 * dt);
    this.vel.lerp(_w, k);
    this.pos.addScaledVector(this.vel, dt);
    clearLens(this.pos, world.camera);
    this.excite = Math.max(0, this.excite - dt * 0.5);
    if (this.purpose === 'visit' && dist < 0.025) {
      this.state = 'hover';
      this.timer = (this.host?.reduced ? 1.2 : 0.6) + Math.random() * 0.9;
    } else if (this.purpose === 'leave' && (dist < 0.3 || (offscreen(this.pos, world.camera) && Math.abs(this.pos.x) > 2.1))) this.dead = true;
    this.faceTravel(dt, 0.25);
  }

  faceTravel(dt, pitchUp) {
    const v = this.vel;
    if (Math.hypot(v.x, v.z) > 0.04) {
      const want = Math.atan2(v.x, v.z);
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * (1 - Math.exp(-7 * dt));
    }
    this.orient(dt, pitchUp);
  }

  // flight attitude with a soft wobble
  orient(dt, pitchUp) {
    const t = this.age + this.seed;
    const wob = this.host?.reduced ? 0.4 : 1;
    const pitch = -pitchUp + Math.sin(t * 7.3) * 0.05 * wob;
    const roll = Math.sin(t * 5.1 + 1.3) * 0.07 * wob;
    _e.set(pitch, this.yaw + Math.sin(t * 3.7) * 0.04 * wob, roll, 'YXZ');
    this.qWant.setFromEuler(_e);
    this.object.quaternion.slerp(this.qWant, 1 - Math.exp(-10 * dt));
  }

  hover(dt, t, world) {
    if (!this.track(world, dt)) {
      this.state = 'fly';
      this.next(world);
      return;
    }
    // hang in the air in front of the flower, facing it, with a tremble
    this.hoverPoint(_p);
    const tt = this.age * 5 + this.seed;
    const j = this.host?.reduced ? 0.0015 : 0.003;
    _p.x += Math.sin(tt * 1.3) * j;
    _p.y += Math.sin(tt * 1.9 + 1) * j;
    _p.z += Math.sin(tt * 1.1 + 2) * j;
    this.vel.subVectors(_p, this.pos).multiplyScalar(6);
    this.pos.addScaledVector(this.vel, dt);
    _d.copy(this.tgtN).negate();
    const want = Math.atan2(_d.x, _d.z);
    if (Math.hypot(_d.x, _d.z) > 0.2) {
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * (1 - Math.exp(-5 * dt));
    }
    this.orient(dt, 0.35);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.state = 'land';
      this.timer = 0;
      this.landDur = this.host?.reduced ? 0.7 : 0.45;
      this.from.copy(this.pos);
      this.qFrom.copy(this.object.quaternion);
      _d.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.setHeading(_d);
      this.off.set(0, 0);
    }
  }

  setHeading(dir) {
    const n = this.tgtN;
    this.heading.copy(dir).addScaledVector(n, -dir.dot(n));
    if (this.heading.lengthSq() < 1e-6) this.heading.set(1, 0, 0).addScaledVector(n, -n.x);
    this.heading.normalize();
  }

  // position on the flower: centre + an offset in its tangent plane
  surfacePoint(out) {
    const n = this.tgtN;
    _t.copy(Math.abs(n.y) < 0.9 ? UP : _b.set(1, 0, 0)).cross(n).normalize();
    _b.crossVectors(n, _t);
    return out.copy(this.tgtPos).addScaledVector(n, this.a.stand).addScaledVector(_t, this.off.x).addScaledVector(_b, this.off.y);
  }

  landing(dt, t, world) {
    if (!this.track(world, dt)) {
      this.takeOff();
      this.next(world);
      return;
    }
    this.timer += dt;
    const k = Math.min(1, this.timer / this.landDur);
    const e = ease(k);
    this.surfacePoint(_p);
    this.pos.lerpVectors(this.from, _p, e);
    this.setHeading(this.heading);
    basis(this.heading, this.tgtN, this.qWant);
    this.object.quaternion.slerpQuaternions(this.qFrom, this.qWant, e);
    if (k >= 1) {
      this.state = 'crawl';
      this.timer = (this.host?.reduced ? 1.3 : 1) * (2.2 + Math.random() * 3);
      this.newStep();
      if (!this.settled) {
        this.settled = true;
        this.host?.settle(this);
      }
    }
  }

  newStep() {
    const r = 0.011;
    const a = Math.random() * TAU;
    this.offGoal.set(Math.cos(a) * r * Math.random(), Math.sin(a) * r * Math.random());
    this.stepT = 0.5 + Math.random() * 0.9;
  }

  crawl(dt, t, world) {
    if (!this.track(world, dt)) {
      this.takeOff();
      this.next(world);
      return;
    }
    // bumble about the flower head, turning to face where it walks
    this.stepT -= dt;
    if (this.stepT <= 0) this.newStep();
    const px = this.off.x;
    const py = this.off.y;
    const sp = (this.host?.reduced ? 0.006 : 0.011) * dt;
    const dx = this.offGoal.x - px;
    const dy = this.offGoal.y - py;
    const l = Math.hypot(dx, dy);
    if (l > 1e-4) {
      const m = Math.min(l, sp);
      this.off.x += (dx / l) * m;
      this.off.y += (dy / l) * m;
    }
    this.surfacePoint(_p);
    this.pos.copy(_p);
    if (l > 0.001) {
      // walking direction in world space
      const n = this.tgtN;
      _t.copy(Math.abs(n.y) < 0.9 ? UP : _b.set(1, 0, 0)).cross(n).normalize();
      _b.crossVectors(n, _t);
      _d.copy(_t).multiplyScalar(dx).addScaledVector(_b, dy);
      _d.lerp(this.heading, 0.85);
      this.setHeading(_d);
    }
    basis(this.heading, this.tgtN, this.qWant);
    // a soft rocking as it works the flower
    _q.setFromAxisAngle(_d.set(0, 0, 1), Math.sin(this.age * 9 + this.seed) * 0.06);
    this.qWant.multiply(_q);
    this.object.quaternion.slerp(this.qWant, 1 - Math.exp(-10 * dt));
    this.timer -= dt;
    if (this.timer <= 0 || (world.rain || 0) > 0.5) {
      this.visits++;
      const was = this.tgt;
      this.takeOff();
      this.next(world, was);
    }
  }

  takeOff() {
    this.state = 'fly';
    this.vel.copy(this.tgtN).multiplyScalar(0.25);
    this.vel.y = Math.max(this.vel.y, 0.15);
    this.entering = false;
    this.yaw = Math.atan2(this.heading.x, this.heading.z);
  }

  looping(dt, t, world) {
    // a happy buzzing circle, then back to what it was doing
    this.timer += dt;
    const k = Math.min(1, this.timer / this.loopDur);
    const a = ease(k) * TAU;
    const r = this.host?.reduced ? 0.05 : 0.075;
    _p.copy(this.loopFrom);
    _p.x += Math.sin(a) * r;
    _p.z += (1 - Math.cos(a)) * r * 0.6;
    _p.y += Math.sin(Math.PI * k) * 0.06;
    clearLens(_p, world.camera);
    this.vel.subVectors(_p, this.pos).divideScalar(Math.max(dt, 1e-3));
    this.pos.copy(_p);
    this.faceTravel(dt, 0.2);
    if (k >= 1) {
      this.state = 'fly';
      this.vel.multiplyScalar(0.2);
      if (!this.returnTo) this.next(world);
      this.returnTo = false;
    }
  }

  animate(dt) {
    const flying = this.state === 'fly' || this.state === 'hover' || this.state === 'loop' || (this.state === 'land' && this.timer < this.landDur * 0.7);
    this.buzz = damp(this.buzz, flying ? 1 : 0, 14, dt);
    const on = this.buzz > 0.5;
    for (const r of this.rest) r.visible = !on;
    // the blur flickers a little, as a real wing blur does on camera
    const flick = 0.8 + 0.2 * Math.sin(this.age * 83 + this.seed);
    for (let k = 0; k < 2; k++) {
      const f = this.fans[k];
      f.visible = on;
      f.rotation.set(0.12 + Math.sin(this.age * 61) * 0.05, 0, (k === 0 ? 1 : -1) * 0.18 * flick);
    }
    this.appStand.visible = !on;
    this.appFly.visible = on;
    // the abdomen bobs as it breathes and works
    this.rig.position.y = Math.sin(this.age * (on ? 23 : 4)) * this.spec.length * (on ? 0.006 : 0.004);
  }

  pose(flying = false) {
    for (const r of this.rest) r.visible = !flying;
    for (const f of this.fans) f.visible = flying;
    this.appStand.visible = !flying;
    this.appFly.visible = flying;
  }

  // three-quarter side view for the visitors book
  portrait() {
    this.pose(false);
    this.object.rotation.set(0.35, -1.0, 0);
    return this.object;
  }
}
