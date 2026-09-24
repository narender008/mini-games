// The seven-spot ladybird, 7 mm long: a glossy red dome of wing cases with
// seven black spots, a black shield with white patches behind the head. It
// crawls about on leaves, and now and then lifts its wing cases, buzzes its
// hidden wings and flies to another plant.
import * as THREE from 'three';
import { damp } from '../config.js';
import { ellipsoid, tube, curve, merge, paint, mirrorX } from './geo.js';
import { blurTexture, fanGeometry, wingTexture, wingPlane } from './bee.js';
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
const _fa = new THREE.Vector3();

function facesAway(q, cam) {
  const n = q.normal;
  if (!n) return false;
  _fa.subVectors(cam.position, q.pos).normalize();
  const d = n.x * _fa.x + n.y * _fa.y + n.z * _fa.z;
  return (n.y < 0 ? -d : d) < 0.2;
}

// the dome (metres): half-width, height, half-length, centre z
const RX = 0.00285;
const RY = 0.0027;
const RZ = 0.0034;
const ZC = -0.0009;
const STAND = 0.0011; // belly clearance over the leaf

let assets = null;

// top-down painted spots for the wing cases (u = x, v = z over the dome)
function spotTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S * 0.5, S * 0.45, S * 0.05, S * 0.5, S * 0.5, S * 0.6);
  g.addColorStop(0, '#e2231a');
  g.addColorStop(0.7, '#d01c16');
  g.addColorStop(1, '#a81410');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // x in -RX..RX -> 0..S, z in ZC+RZ (front, top of canvas) .. ZC-RZ (rear)
  const px = (x) => (x / (2 * RX) + 0.5) * S;
  const pz = (z) => (0.5 - (z - ZC) / (2 * RZ)) * S;
  const spot = (x, z, r) => {
    ctx.beginPath();
    ctx.ellipse(px(x), pz(z), (r / (2 * RX)) * S, (r / (2 * RZ)) * S * 1.05, 0, 0, TAU);
    ctx.fill();
  };
  ctx.fillStyle = '#0d0b0b';
  spot(0, ZC + RZ * 0.64, 0.00075); // the shared spot at the front of the seam
  for (const s of [1, -1]) {
    spot(s * 0.0017, ZC + RZ * 0.3, 0.00058);
    spot(s * 0.00115, ZC - RZ * 0.06, 0.00078);
    spot(s * 0.00145, ZC - RZ * 0.56, 0.00052);
  }
  // the seam between the wing cases
  ctx.strokeStyle = 'rgba(60,8,6,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(S / 2, 0);
  ctx.lineTo(S / 2, S);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// one wing case: a quarter of an ellipsoid (upper half, one side), with its
// UVs projected from above so the painted spots land where they should
function elytronGeometry(side) {
  const phi0 = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  const g = new THREE.SphereGeometry(1, 28, 14, phi0, Math.PI, 0, Math.PI / 2);
  g.scale(RX, RY, RZ);
  g.translate(0, 0, ZC);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    // a slight lip where the dome meets the leaf
    if (pos.getY(k) < RY * 0.08) pos.setY(k, pos.getY(k) - 0.00008);
    uv.setXY(k, x / (2 * RX) + 0.5, (z - ZC) / (2 * RZ) + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

function bodyGeometry() {
  const white = new THREE.Color('#f2efe6');
  const black = new THREE.Color('#0f0d0d');
  // pronotum: a black shield with white front corners
  const pro = ellipsoid(0, RY * 0.22, ZC + RZ * 0.86, 0.0022, 0.0012, 0.0011, 20, 10);
  paint(pro, (x, y, z, out) => out.copy(Math.abs(x) > 0.0011 && z > ZC + RZ * 0.8 ? white : black));
  // head with two small pale spots
  const head = ellipsoid(0, RY * 0.08, ZC + RZ * 1.12, 0.00105, 0.00068, 0.00062, 14, 8);
  paint(head, (x, y, z, out) => out.copy(Math.abs(x) > 0.00035 && Math.abs(x) < 0.0008 && y > RY * 0.1 && z > ZC + RZ * 1.16 ? white : black));
  // underside
  const belly = ellipsoid(0, 0.0002, ZC, RX * 0.92, 0.0005, RZ * 0.95, 16, 8);
  paint(belly, (x, y, z, out) => out.copy(black));
  // eyes and antennae
  const eye = ellipsoid(0.00072, RY * 0.08, ZC + RZ * 1.2, 0.0003, 0.00035, 0.0003, 8, 6);
  paint(eye, (x, y, z, out) => out.set('#1a1616'));
  const ant = tube(curve([[0.0005, RY * 0.12, ZC + RZ * 1.26], [0.0009, RY * 0.2, ZC + RZ * 1.38], [0.0012, RY * 0.18, ZC + RZ * 1.5]], 6), (t) => (t > 0.7 ? 0.00013 : 0.00007), 4);
  paint(ant, (x, y, z, out) => out.copy(black));
  return merge([pro, head, belly, eye, mirrorX(eye), ant, mirrorX(ant)]);
}

// a leg in its own pivot (for the walk): hip at the origin, pointing +x
function legGeometry(reach) {
  const L = [
    [0, 0, 0],
    [reach * 0.45, 0.0003, 0.0001],
    [reach * 0.85, -0.0006, 0.0002],
    [reach, -STAND - 0.0003, 0.0003],
  ];
  const piece = tube(curve(L, 8), (t) => 0.00013 * (1 - t * 0.4), 4);
  paint(piece, (x, y, z, out) => out.set('#141111'));
  return merge([piece]);
}

function ladybirdAssets() {
  if (assets) return assets;
  const spots = spotTexture();
  // glossy lacquer: clear coat over a slightly rough red
  const shell = new THREE.MeshPhysicalMaterial({ map: spots, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06, metalness: 0 });
  const body = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  const wingMat = new THREE.MeshPhysicalMaterial({ map: wingTexture(), color: '#d8c8b0', transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.3, iridescence: 0.7, iridescenceIOR: 1.35, iridescenceThicknessRange: [220, 460] });
  const blurMat = new THREE.MeshStandardMaterial({ map: blurTexture(), color: '#cfc4b4', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, roughness: 0.6 });
  assets = {
    shell,
    body,
    wingMat,
    blurMat,
    elytra: [elytronGeometry(1), elytronGeometry(-1)],
    bodyGeo: bodyGeometry(),
    leg: legGeometry(0.0022),
    wing: wingPlane(0.0085),
    fan: fanGeometry(0.0086, -1.1, 1.1),
  };
  return assets;
}

export class Ladybird {
  constructor(host, { still = false } = {}) {
    this.kind = 'ladybird';
    this.group = 'beetle';
    this.host = host;
    const a = (this.a = ladybirdAssets());
    const o = (this.object = new THREE.Group());
    o.name = 'ladybird';
    o.userData.creature = this;
    const rig = (this.rig = new THREE.Group());
    o.add(rig);
    const body = new THREE.Mesh(a.bodyGeo, a.body);
    body.castShadow = true;
    rig.add(body);
    // wing cases hinge at their front outer corner
    this.cases = [];
    for (const [k, side] of [
      [0, 1],
      [1, -1],
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * RX * 0.85, RY * 0.15, ZC + RZ * 0.5);
      const m = new THREE.Mesh(a.elytra[k], a.shell);
      m.position.copy(pivot.position).negate();
      m.castShadow = true;
      m.receiveShadow = true;
      pivot.add(m);
      rig.add(pivot);
      this.cases.push({ side, pivot });
    }
    // flight wings: unfolded membranes and their blur
    this.fans = [];
    for (const side of [1, -1]) {
      const fan = new THREE.Mesh(a.fan, a.blurMat);
      fan.position.set(side * RX * 0.4, RY * 0.7, ZC + RZ * 0.35);
      if (side < 0) fan.scale.x = -1;
      fan.renderOrder = 3;
      fan.visible = false;
      rig.add(fan);
      this.fans.push(fan);
    }
    // six legs, walked in a tripod gait
    this.legs = [];
    const hips = [
      [0.0007, ZC + RZ * 0.55, 0.5],
      [0.00085, ZC + RZ * 0.05, 0.0],
      [0.0008, ZC - RZ * 0.35, -0.55],
    ];
    for (const side of [1, -1]) {
      hips.forEach(([x, z, yaw], i) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * x, 0.0001, z);
        const m = new THREE.Mesh(a.leg, a.body);
        if (side < 0) m.scale.x = -1;
        pivot.add(m);
        pivot.rotation.y = side * yaw;
        rig.add(pivot);
        this.legs.push({ pivot, side, yaw: side * yaw, group: (i + (side > 0 ? 0 : 1)) % 2 });
      });
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
    this.dir = Math.random() * TAU;
    this.tgt = null;
    this.tgtPlant = null;
    this.tgtKind = 'leaf';
    this.tgtPos = new THREE.Vector3();
    this.tgtN = new THREE.Vector3(0, 1, 0);
    this.state = 'fly';
    this.purpose = 'enter';
    this.entering = true;
    this.timer = 0;
    this.age = 0;
    this.yaw = 0;
    this.seed = Math.random() * 100;
    this.open = 1;
    this.walk = 0;
    this.walkPhase = 0;
    this.pause = 0;
    this.hops = 0;
    this.maxHops = 1 + Math.floor(Math.random() * 3);
    this.stay = 60 + Math.random() * 60;
    this.settled = false;
    this.dead = false;
    this.radius = 0.08;
    if (still) this.setOpen(0, false);
  }

  enter(camera) {
    offscreenPoint(this.pos, camera, Math.random() < 0.5 ? -1 : 1);
    this.pos.y = Math.min(this.pos.y, 0.9);
    this.state = 'fly';
    this.purpose = 'enter';
    this.entering = true;
    this.open = 1;
  }

  leave() {
    if (this.purpose === 'leave') return;
    if (this.state !== 'fly') this.takeOff();
    this.purpose = 'leave';
    offscreenPoint(this.exit, this.host?.camera, this.pos.x < 0 ? -1 : 1);
  }

  poke() {
    if (this.state === 'loop' || this.purpose === 'leave') return;
    // a little hop into the air and back down onto its leaf
    this.returnTo = this.state === 'crawl' || this.state === 'land';
    if (this.state === 'crawl' || this.state === 'land') this.takeOff(true);
    this.state = 'loop';
    this.timer = 0;
    this.loopDur = this.host?.reduced ? 2.6 : 1.9;
    this.loopFrom.copy(this.pos);
  }

  update(dt, t, world) {
    this.age += dt;
    if (this.purpose !== 'leave' && (world.night || 0) > 0.65) this.stay = Math.min(this.stay, this.age);
    if (this.state === 'fly') this.fly(dt, t, world);
    else if (this.state === 'land') this.landing(dt, t, world);
    else if (this.state === 'crawl') this.crawl(dt, t, world);
    else if (this.state === 'loop') this.looping(dt, t, world);
    this.animate(dt);
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
    // leaves face every way; walk on whichever side faces up
    follow(this.tgtPos, this.tgtN, x.pos, x.normal || UP, dt, true);
    return true;
  }

  next(world, avoid = null) {
    if (this.age > this.stay || this.hops > this.maxHops || (world.rain || 0) > 0.5) {
      this.leave();
      return;
    }
    const host = this.host;
    // skip leaves whose upper side faces away from the camera, where it
    // would crawl about unseen
    const cam = host?.camera;
    const taken = (q) => host.taken(q, this) || (cam && q.kind === 'leaf' && facesAway(q, cam));
    const x = chooseTarget(world.targets, ['leaf'], this.kind, this.pos, taken, avoid) || chooseTarget(world.targets, ['bloom'], this.kind, this.pos, taken, avoid);
    if (x) {
      this.tgt = x;
      this.tgtPlant = x.plant;
      this.tgtKind = x.kind;
      this.tgtPos.copy(x.pos);
      this.tgtN.copy(x.normal || UP).normalize();
      if (this.tgtN.y < 0) this.tgtN.negate();
      this.purpose = 'visit';
      this.timer = 0;
    } else {
      this.purpose = 'wander';
      this.timer = 3 + Math.random() * 3;
      wanderPoint(this.goal, 0.2, 0.7);
    }
  }

  fly(dt, t, world) {
    if (this.purpose === 'enter') this.next(world);
    if (this.purpose === 'visit' && !this.track(world, dt)) this.next(world);
    if (this.purpose === 'visit') {
      this.goal.copy(this.tgtPos).addScaledVector(this.tgtN, 0.03);
      this.timer += dt;
    } else if (this.purpose === 'wander') {
      this.timer -= dt;
      if (this.pos.distanceTo(this.goal) < 0.1) wanderPoint(this.goal, 0.2, 0.7);
      if (this.timer <= 0) {
        if (this.age > 12 && !(world.targets && world.targets.length)) this.leave();
        else this.next(world);
      }
    } else if (this.purpose === 'leave') this.goal.copy(this.exit);
    const toGoal = _d.subVectors(this.goal, this.pos);
    const dist = toGoal.length();
    const speed = (this.host?.reduced ? 0.28 : 0.4) * (this.purpose === 'leave' ? 1.2 : 1);
    const near = Math.max(0.2, Math.min(1, dist / 0.25));
    _w.copy(toGoal).multiplyScalar((speed * near) / Math.max(dist, 1e-3));
    const tt = t * 1.6 + this.seed;
    const er = 0.25 * speed * Math.min(1, dist / 0.3);
    _w.x += wave(tt, 0.2, 1.1, 3.3) * er;
    _w.y += wave(tt * 1.3, 2.2, 0.4, 1.9) * er * 0.6;
    _w.z += wave(tt * 0.9, 1.7, 4.1, 0.3) * er;
    if (this.entering) {
      const V = VOLUME;
      const p = this.pos;
      if (p.x > V.x0 && p.x < V.x1 && p.y < V.y1 && p.z > V.z0 && p.z < V.z1) this.entering = false;
    } else if (this.purpose !== 'leave') keepInside(this.pos, _w);
    this.vel.lerp(_w, 1 - Math.exp(-3 * dt));
    this.pos.addScaledVector(this.vel, dt);
    clearLens(this.pos, world.camera);
    if (this.purpose === 'visit' && (dist < 0.012 || (dist < 0.05 && this.timer > 8))) this.startLanding();
    else if (this.purpose === 'leave' && (dist < 0.3 || (offscreen(this.pos, world.camera) && Math.abs(this.pos.x) > 2.1))) this.dead = true;
    this.faceTravel(dt);
  }

  faceTravel(dt) {
    const v = this.vel;
    if (Math.hypot(v.x, v.z) > 0.03) {
      let dy = Math.atan2(v.x, v.z) - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * (1 - Math.exp(-5 * dt));
    }
    // ladybirds fly steeply tilted, body almost upright
    const wob = Math.sin(this.age * 6.1 + this.seed) * 0.06;
    _e.set(-0.75 + wob, this.yaw, Math.sin(this.age * 4.3) * 0.08, 'YXZ');
    this.qWant.setFromEuler(_e);
    this.object.quaternion.slerp(this.qWant, 1 - Math.exp(-8 * dt));
  }

  startLanding() {
    this.state = 'land';
    this.timer = 0;
    this.landDur = this.host?.reduced ? 0.9 : 0.6;
    this.from.copy(this.pos);
    this.qFrom.copy(this.object.quaternion);
    this.off.set(0, 0);
    _d.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.setHeading(_d);
  }

  setHeading(dir) {
    const n = this.tgtN;
    this.heading.copy(dir).addScaledVector(n, -dir.dot(n));
    if (this.heading.lengthSq() < 1e-8) this.heading.set(1, 0, 0).addScaledVector(n, -n.x);
    this.heading.normalize();
  }

  // a point on the leaf: its centre plus an offset in the leaf's plane
  surfacePoint(out) {
    const n = this.tgtN;
    _t.copy(Math.abs(n.y) < 0.9 ? UP : _b.set(1, 0, 0)).cross(n).normalize();
    _b.crossVectors(n, _t);
    return out.copy(this.tgtPos).addScaledVector(n, STAND).addScaledVector(_t, this.off.x).addScaledVector(_b, this.off.y);
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
      this.timer = (this.host?.reduced ? 1.4 : 1) * (8 + Math.random() * 12);
      this.pause = 0.6;
      if (!this.settled) {
        this.settled = true;
        this.host?.settle(this);
      }
    }
  }

  crawl(dt, t, world) {
    if (!this.track(world, dt)) {
      this.takeOff();
      this.next(world);
      return;
    }
    // amble about on the leaf, turning gently, stopping now and then
    this.pause -= dt;
    let speed = 0;
    if (this.pause <= 0) {
      speed = this.host?.reduced ? 0.005 : 0.008;
      this.dir += wave(this.age * 0.9, this.seed, 1.3, 2.1) * 1.4 * dt;
      // keep near the middle of the leaf
      const r = this.off.length();
      const lim = this.tgtKind === 'leaf' ? 0.012 : 0.008;
      if (r > lim * 0.7) {
        const home = Math.atan2(-this.off.y, -this.off.x);
        let dd = home - this.dir;
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        this.dir += dd * Math.min(1, dt * 3 * (r / lim));
      }
      this.off.x += Math.cos(this.dir) * speed * dt;
      this.off.y += Math.sin(this.dir) * speed * dt;
      if (Math.random() < dt * 0.25) this.pause = 0.8 + Math.random() * 1.6;
    }
    this.walk = damp(this.walk, speed > 0 ? 1 : 0, 8, dt);
    this.walkPhase += dt * 14 * this.walk;
    this.surfacePoint(this.pos);
    const n = this.tgtN;
    _t.copy(Math.abs(n.y) < 0.9 ? UP : _b.set(1, 0, 0)).cross(n).normalize();
    _b.crossVectors(n, _t);
    _d.copy(_t).multiplyScalar(Math.cos(this.dir)).addScaledVector(_b, Math.sin(this.dir));
    this.setHeading(_d);
    basis(this.heading, n, this.qWant);
    this.object.quaternion.slerp(this.qWant, 1 - Math.exp(-8 * dt));
    this.timer -= dt;
    if (this.timer <= 0 || (world.rain || 0) > 0.5) {
      this.hops++;
      if (Math.random() < 0.55 || this.age > this.stay) {
        const was = this.tgt;
        this.takeOff();
        this.next(world, was);
      } else this.timer = 6 + Math.random() * 8;
    }
  }

  takeOff(short = false) {
    this.state = 'fly';
    this.vel.copy(this.tgtN).multiplyScalar(short ? 0.12 : 0.2);
    this.vel.y = Math.max(this.vel.y, 0.1);
    this.entering = false;
    this.yaw = Math.atan2(this.heading.x, this.heading.z);
  }

  looping(dt, t, world) {
    this.timer += dt;
    const k = Math.min(1, this.timer / this.loopDur);
    const a = ease(k) * TAU;
    _p.copy(this.loopFrom);
    _p.y += Math.sin(Math.PI * k) * 0.06;
    _p.x += Math.sin(a) * 0.035;
    _p.z += (1 - Math.cos(a)) * 0.02;
    clearLens(_p, world.camera);
    this.vel.subVectors(_p, this.pos).divideScalar(Math.max(dt, 1e-3));
    this.pos.copy(_p);
    this.faceTravel(dt);
    if (k >= 1) {
      this.state = 'fly';
      this.vel.set(0, 0, 0);
      if (this.returnTo && this.tgtPlant) {
        this.purpose = 'visit';
        this.timer = 0;
      } else if (this.purpose !== 'leave') this.next(world);
      this.returnTo = false;
    }
  }

  setOpen(v, buzzing) {
    for (const c of this.cases) {
      c.pivot.rotation.set(0.45 * v, 0, -c.side * 0.75 * v);
    }
    for (const f of this.fans) f.visible = buzzing;
  }

  animate(dt) {
    const flying = this.state === 'fly' || this.state === 'loop' || (this.state === 'land' && this.timer < this.landDur * 0.6);
    this.open = damp(this.open, flying ? 1 : 0, flying ? 12 : 6, dt);
    this.setOpen(this.open, this.open > 0.6);
    const flick = 0.85 + 0.15 * Math.sin(this.age * 91 + this.seed);
    this.fans.forEach((f, k) => f.rotation.set(0.5, 0, (k ? -1 : 1) * 0.35 * flick));
    // tripod gait: three legs swing while the other three push
    for (const l of this.legs) {
      const ph = this.walkPhase + (l.group ? Math.PI : 0);
      l.pivot.rotation.y = l.yaw + Math.sin(ph) * 0.35 * this.walk;
      l.pivot.rotation.z = -l.side * Math.max(0, Math.cos(ph)) * 0.25 * this.walk;
      l.pivot.visible = !flying || this.open < 0.9;
    }
  }

  // seen from the front-side and above, for the visitors book
  portrait() {
    this.setOpen(0, false);
    this.object.rotation.set(0.6, -0.7, 0);
    return this.object;
  }
}
