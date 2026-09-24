// One garden bird's behaviour: it flies in with bounding flight (bursts of
// quick wingbeats, then short glides), brakes and lands on a perch or the
// lawn, spends a while there (hops, pecks, quick head turns and tilts, tail
// and wing flicks, preening, fluffing, singing) and then flies off again.
// It poses its BirdRig; nothing here allocates per frame.
import * as THREE from 'three';
import { BirdRig } from './rig.js';
import { REDUCED_MOTION, clamp, lerp, smooth, damp } from '../../config.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (k) => k * k * (3 - 2 * k);

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Vector3();

// flight feel per species: wingbeat rate (Hz), burst and glide lengths (s),
// whether glides keep the wings open, cruise speed (m/s)
const FLIGHT = {
  robin: { hz: 10, flap: [0.32, 0.5], glide: [0.1, 0.18], openGlide: true, speed: 2.3, bound: 0.025 },
  'blue-tit': { hz: 12, flap: [0.2, 0.32], glide: [0.12, 0.2], openGlide: false, speed: 2.1, bound: 0.035 },
  goldfinch: { hz: 12, flap: [0.18, 0.3], glide: [0.2, 0.34], openGlide: false, speed: 2.4, bound: 0.05 },
};

const LUT = 24;

// A cubic Bezier with an arc-length table, reused for every flight.
class Path {
  constructor() {
    this.p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.len = new Float32Array(LUT + 1);
    this.total = 0;
  }

  set(a, b, c, d) {
    this.p[0].copy(a);
    this.p[1].copy(b);
    this.p[2].copy(c);
    this.p[3].copy(d);
    let acc = 0;
    this.at(0, _w);
    this.len[0] = 0;
    for (let i = 1; i <= LUT; i++) {
      this.at(i / LUT, _v);
      acc += _v.distanceTo(_w);
      this.len[i] = acc;
      _w.copy(_v);
    }
    this.total = acc;
  }

  at(u, out) {
    const [a, b, c, d] = this.p;
    const m = 1 - u;
    const k0 = m * m * m;
    const k1 = 3 * m * m * u;
    const k2 = 3 * m * u * u;
    const k3 = u * u * u;
    return out.set(a.x * k0 + b.x * k1 + c.x * k2 + d.x * k3, a.y * k0 + b.y * k1 + c.y * k2 + d.y * k3, a.z * k0 + b.z * k1 + c.z * k2 + d.z * k3);
  }

  // parameter u for an arc length s
  u(s) {
    if (s <= 0) return 0;
    if (s >= this.total) return 1;
    let i = 1;
    while (i < LUT && this.len[i] < s) i++;
    const s0 = this.len[i - 1];
    const s1 = this.len[i];
    return (i - 1 + (s - s0) / Math.max(1e-6, s1 - s0)) / LUT;
  }
}

export class Bird {
  constructor(assets, { shadows }) {
    this.assets = assets;
    this.sp = assets.sp;
    this.kind = assets.sp.id;
    this.rig = new BirdRig(assets, { shadows });
    this.object = this.rig.root;
    this.object.userData.bird = this;
    this.pose = this.rig.pose;
    this.fl = FLIGHT[this.kind];
    this.state = 'gone';
    this.pos = new THREE.Vector3(); // the feet (or, flying, the body) in world space
    this.heading = 0;
    this.path = new Path();
    this.s = 0;
    this.speed = 0;
    this.spot = { pos: new THREE.Vector3(), ground: true, perch: null };
    this.approach = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.hopFrom = new THREE.Vector3();
    this.hopTo = new THREE.Vector3();
    this.centreW = new THREE.Vector3();
    this.headW = new THREE.Vector3();
    this.flap = 0; // wingbeat phase (cycles)
    this.burst = 0; // time left in this burst or glide
    this.gliding = false;
    this.bob = 0; // bounding-flight height offset
    this.bobV = 0;
    this.arrived = false;
    this.leaving = false;
    this.stay = 0;
    this.act = null; // current perched action
    this.actT = 0;
    this.actDur = 0;
    this.act2 = 0; // spare per-action values
    this.act3 = 0;
    this.head = { yaw: 0, pitch: 0, roll: 0, speed: 26 };
    this.look = 0; // time until the next head saccade
    this.tailFlick = 0;
    this.wingFlick = 0;
    this.lift = 0;
    this.liftV = 0;
    this.time = 0;
  }

  // ---------------------------------------------------------------- flight

  // Enter from off-screen, heading for `spot` (world position, ground or perch).
  arrive(start, spot, ground, world) {
    this.state = 'fly';
    this.leaving = false;
    this.arrived = false;
    this.spot.pos.copy(spot);
    this.spot.ground = ground;
    this.pos.copy(start);
    // land facing the way it flew in, turned side-on to the camera
    this.landHeading = this.pickHeading(world, spot, Math.atan2(spot.x - start.x, spot.z - start.z));
    const back = _v.set(-Math.sin(this.landHeading), 0, -Math.cos(this.landHeading));
    this.approach.copy(spot).addScaledVector(back, 0.32).add(_w.set(0, 0.13, 0));
    const b = _c.lerpVectors(start, this.approach, 0.35);
    b.y = Math.min(1.75, Math.max(b.y, this.approach.y) + 0.2);
    const c = _w.lerpVectors(start, this.approach, 0.75);
    c.y = Math.min(1.7, this.approach.y + 0.18);
    c.addScaledVector(back, 0.25);
    this.path.set(start, b, c, this.approach);
    this.s = 0;
    this.speed = this.fl.speed;
    this.next = 'land';
    this.startBurst(false);
    this.pose.tuck = 1;
    this.pose.feetDown = 0;
    this.object.visible = true;
  }

  depart(exit) {
    this.state = 'takeoff';
    this.leaving = true;
    this.actT = 0;
    this.act = null;
    this.from.copy(this.pos);
    const up = _v.copy(this.pos);
    up.y += 0.25;
    const b = _c.lerpVectors(this.pos, exit, 0.25);
    b.y = Math.min(1.75, this.pos.y + 0.45);
    const c = _w.lerpVectors(this.pos, exit, 0.7);
    c.y = Math.min(1.75, Math.max(c.y, this.pos.y + 0.5));
    this.path.set(up, b, c, exit);
  }

  startBurst(glide) {
    this.gliding = glide;
    const r = glide ? this.fl.glide : this.fl.flap;
    this.burst = rand(r[0], r[1]);
  }

  updateFly(dt) {
    const fl = this.fl;
    const remain = this.path.total - this.s;
    const target = this.next === 'land' ? fl.speed * clamp(remain / 0.7, 0.42, 1) : Math.min(fl.speed, 0.8 + this.s * 2.2);
    this.speed = damp(this.speed, target, 4, dt);
    this.s += this.speed * dt;
    // bursts of wingbeats and short glides; the bird rises while flapping
    // and sinks on the glide (bounding flight)
    this.burst -= dt;
    if (this.burst <= 0) this.startBurst(!this.gliding);
    const nearEnd = this.next === 'land' ? smooth(0.35, 0.9, remain) : 1;
    const nearStart = this.next === 'land' ? 1 : smooth(0.05, 0.4, this.s);
    const k = nearEnd * nearStart;
    this.bobV += ((this.gliding ? -fl.bound * 9 : fl.bound * 5) * k - this.bob * 18 - this.bobV * 4) * dt;
    this.bob += this.bobV * dt;
    const u = this.path.u(this.s);
    this.path.at(u, this.pos);
    this.pos.y += this.bob;
    // heading and climb from the path tangent
    this.path.at(Math.min(1, u + 0.02), _v);
    this.path.at(Math.max(0, u - 0.02), _w);
    _v.sub(_w);
    const hd = Math.atan2(_v.x, _v.z);
    const turn = wrap(hd - this.heading);
    this.heading += turn * Math.min(1, dt * 8);
    const climb = Math.atan2(_v.y + this.bobV * 0.05, Math.hypot(_v.x, _v.z));
    const P = this.pose;
    P.pitch = damp(P.pitch, this.assets.posture - climb * 0.5 - (this.gliding ? 0 : 0.05), 10, dt);
    P.roll = damp(P.roll, clamp(-turn * 1.2, -0.5, 0.5), 6, dt);
    P.yaw = 0;
    P.lift = 0;
    P.tuck = damp(P.tuck, 1, 10, dt);
    P.feetDown = damp(P.feetDown, 0, 10, dt);
    P.tailSpread = damp(P.tailSpread, 0.15, 6, dt);
    P.tailCock = damp(P.tailCock, this.assets.tailLevel + climb * 0.3, 6, dt);
    P.fluff = damp(P.fluff, -0.3, 6, dt);
    this.aimHead(0, 0, 0, dt, 12);
    P.beak = damp(P.beak, 0, 10, dt);
    if (this.gliding) {
      const open = fl.openGlide ? 0.85 : 0;
      P.wingSpread = damp(P.wingSpread, open, 22, dt);
      P.wingElev = damp(P.wingElev, open * 0.12, 22, dt);
      P.wingSweep = damp(P.wingSweep, open * -0.1, 22, dt);
      this.flap = 0;
    } else {
      this.wingbeat(dt, fl.hz, 1);
    }
    if (u >= 1 && this.s >= this.path.total) {
      if (this.next === 'land') this.startLanding();
      else this.state = 'gone';
    }
  }

  wingbeat(dt, hz, amp, brake = 0) {
    this.flap += dt * hz;
    const ph = this.flap * TAU;
    const P = this.pose;
    // the wing sweeps down fully spread, and comes back up half-folded
    const elev = (12 + 58 * amp) * D2R * Math.cos(ph) + 8 * D2R * (1 - amp);
    P.wingElev = elev;
    P.wingSpread = clamp(0.9 + 0.1 * Math.sin(ph), 0, 1) * (0.9 + 0.1 * amp);
    P.wingSweep = 0.14 * Math.sin(ph) + brake * 0.35;
    P.wingTwist = 0.1 * Math.cos(ph + 0.6);
  }

  startLanding() {
    this.state = 'land';
    this.actT = 0;
    this.from.copy(this.pos);
  }

  updateLanding(dt) {
    const T = 0.5;
    this.actT += dt;
    const k = Math.min(1, this.actT / T);
    const e = 1 - (1 - k) * (1 - k);
    this.pos.lerpVectors(this.from, this.spot.pos, e);
    // drop in the last part, flaring up with the wings forward to brake
    this.pos.y = lerp(this.from.y, this.spot.pos.y, ease(k)) + 0.015 * Math.sin(k * Math.PI);
    this.heading += wrap(this.landHeading - this.heading) * Math.min(1, dt * 9);
    const P = this.pose;
    const flare = Math.sin(Math.min(1, k * 1.15) * Math.PI);
    P.pitch = lerp(this.assets.posture * (1 - k), 0, 0) - 0.55 * flare;
    P.roll = damp(P.roll, 0, 8, dt);
    P.tuck = damp(P.tuck, 0, 14, dt);
    P.feetDown = k < 0.85 ? damp(P.feetDown, 1, 12, dt) : damp(P.feetDown, 0, 30, dt);
    P.tailSpread = damp(P.tailSpread, 1, 10, dt);
    P.tailCock = damp(P.tailCock, -0.25, 10, dt);
    P.fluff = damp(P.fluff, 0, 6, dt);
    this.aimHead(0, 0.1, 0, dt, 14);
    this.wingbeat(dt, this.fl.hz * 1.15, 0.7, 1);
    if (k >= 1) this.touchdown();
  }

  touchdown() {
    this.state = 'perch';
    this.pos.copy(this.spot.pos);
    this.heading = this.landHeading;
    this.liftV = -0.12; // the legs take the weight
    this.settle = 0.3;
    this.stay = rand(12, 30);
    this.act = null;
    this.actT = 0;
    this.look = rand(0.2, 0.5);
    this.tailFlick = 0.25;
    if (!this.arrived) {
      this.arrived = true;
      this.justArrived = true;
    }
  }

  updateTakeoff(dt) {
    this.actT += dt;
    const P = this.pose;
    // crouch, then spring up with the first wingbeats
    const crouch = 0.12;
    if (this.actT < crouch) {
      P.lift = damp(P.lift, -0.006, 30, dt);
      P.pitch = damp(P.pitch, 0.2, 20, dt);
      P.wingSpread = damp(P.wingSpread, 0.3, 20, dt);
      P.tailCock = damp(P.tailCock, 0.2, 20, dt);
      return;
    }
    this.state = 'fly';
    this.next = 'out';
    this.s = 0;
    this.speed = 0.8;
    this.startBurst(false);
    this.gliding = false;
    this.burst = rand(0.4, 0.6);
    this.pos.copy(this.path.p[0]);
    this.path.p[0].copy(this.from);
    this.path.set(this.from, this.path.p[1], this.path.p[2], this.path.p[3]);
  }

  // ---------------------------------------------------------------- perched

  pickHeading(world, at, prefer) {
    // side-on or three-quarter to the camera, never looking into it
    const cam = world.camera ? world.camera.position : _c.set(0, 1.3, 2.8);
    const toCam = Math.atan2(cam.x - at.x, cam.z - at.z);
    let side = Math.random() < 0.5 ? 1 : -1;
    if (prefer !== undefined) side = wrap(prefer - toCam) >= 0 ? 1 : -1;
    let off = rand(70, 112) * D2R;
    if (prefer !== undefined) off = clamp(Math.abs(wrap(prefer - toCam)), 70 * D2R, 115 * D2R);
    return wrap(toCam + side * off);
  }

  // Head direction relative to the body, kept from pointing at the camera.
  aimHead(yaw, pitch, roll, dt, speed) {
    const h = this.head;
    h.yaw = yaw;
    h.pitch = pitch;
    h.roll = roll;
    const P = this.pose;
    const l = speed ?? h.speed;
    P.headYaw = damp(P.headYaw, h.yaw, l, dt);
    P.headPitch = damp(P.headPitch, h.pitch, l, dt);
    P.headRoll = damp(P.headRoll, h.roll, l, dt);
  }

  newLook(world) {
    const reduced = REDUCED_MOTION.matches;
    let yaw = rand(-75, 75) * D2R;
    const pitch = rand(-0.25, 0.3);
    const roll = Math.random() < 0.35 ? rand(-0.45, 0.45) : rand(-0.08, 0.08);
    // never stare into the camera: keep the beak at least ~40 degrees off it
    const cam = world.camera ? world.camera.position : null;
    if (cam) {
      const toCam = wrap(Math.atan2(cam.x - this.pos.x, cam.z - this.pos.z) - this.heading - this.pose.yaw);
      const d = wrap(yaw - toCam);
      if (Math.abs(d) < 0.7) yaw = toCam + Math.sign(d || 1) * 0.7;
      yaw = clamp(wrap(yaw), -1.5, 1.5);
    }
    this.head.yaw = yaw;
    this.head.pitch = pitch;
    this.head.roll = roll;
    this.look = reduced ? rand(0.9, 2.2) : rand(0.35, 1.3);
  }

  chooseAction(world) {
    const b = this.sp.behaviour;
    const ground = this.spot.ground;
    const opts = [
      ['idle', 1.2],
      ['look', 1.4],
      ['hop', ground ? 1.6 : 0],
      ['turn', ground ? 0.35 : 0.9],
      ['peck', ground ? 1.4 * b.peck : 0.08],
      ['preen', 0.45],
      ['fluff', 0.2],
      ['sing', 0.9 * b.sing],
      ['flick', 0.5 * b.tailFlick],
    ];
    let sum = 0;
    for (const o of opts) sum += o[1];
    let r = Math.random() * sum;
    let pick = 'idle';
    for (const o of opts) {
      r -= o[1];
      if (r <= 0) {
        pick = o[0];
        break;
      }
    }
    this.startAction(pick, world);
  }

  startAction(type, world) {
    this.act = type;
    this.actT = 0;
    this.act2 = 0;
    this.act3 = 0;
    const reduced = REDUCED_MOTION.matches;
    switch (type) {
      case 'idle':
        this.actDur = rand(0.5, 1.6);
        break;
      case 'look':
        this.actDur = rand(1.2, 3);
        this.look = 0;
        break;
      case 'hop': {
        // a hop or a short run of hops across the lawn
        const n = Math.random() < 0.4 ? 1 : 2 + Math.floor(Math.random() * 3);
        this.act2 = n;
        this.actDur = 0;
        if (!this.planHop(world)) this.startAction('look', world);
        return;
      }
      case 'turn':
        this.actDur = 0.2;
        this.act2 = this.heading;
        this.act3 = this.pickHeading(world, this.pos);
        this.hopFrom.copy(this.pos);
        this.hopTo.copy(this.pos);
        break;
      case 'peck':
        this.actDur = rand(1.1, 2.2);
        this.act2 = 1 + Math.floor(Math.random() * 3); // jabs
        this.act3 = Math.random() < 0.5 ? 1 : -1; // which eye looks first
        break;
      case 'preen':
        this.actDur = rand(1.2, 2.4);
        this.act3 = Math.random() < 0.5 ? 1 : -1;
        break;
      case 'fluff':
        this.actDur = 1.1;
        break;
      case 'sing':
        this.actDur = rand(1.2, 2.4);
        this.act2 = 0; // time to the next syllable
        this.sang = false;
        break;
      case 'flick':
        this.actDur = 0.5;
        this.tailFlick = 0.3;
        if (Math.random() < 0.6) this.wingFlick = 0.25;
        break;
    }
    if (reduced) this.actDur *= 1.4;
  }

  planHop(world) {
    const lawn = world.lawn;
    const bd = world.bounds;
    const cam = world.camera ? world.camera.position : _c.set(0, 1.3, 2.8);
    const toCam = Math.atan2(cam.x - this.pos.x, cam.z - this.pos.z);
    for (let tries = 0; tries < 10; tries++) {
      // mostly onwards, sometimes turning; keep side-on rather than tail-on
      // or face-on to the camera
      const turn = tries < 3 ? rand(-0.8, 0.8) : rand(-Math.PI, Math.PI);
      const dir = this.heading + turn;
      const off = Math.abs(wrap(dir - toCam));
      if (tries < 8 && (off < 50 * D2R || off > 135 * D2R)) continue;
      const dist = rand(0.035, 0.08) * (REDUCED_MOTION.matches ? 0.7 : 1);
      const x = this.pos.x + Math.sin(dir) * dist;
      const z = this.pos.z + Math.cos(dir) * dist;
      if (bd && (x < bd.x0 + 0.1 || x > bd.x1 - 0.1 || z < bd.z0 + 0.1 || z > bd.z1 - 0.1)) continue;
      const y = lawn ? lawn(x, z) : 0;
      if (y === null || y === undefined || Math.abs(y - this.pos.y) > 0.05) continue;
      if (this.crowded && this.crowded(this, x, z)) continue;
      if (this.groundOk && !this.groundOk(this, x, y, z)) continue;
      this.hopFrom.copy(this.pos);
      this.hopTo.set(x, y, z);
      this.act3 = dir;
      this.actT = 0;
      this.actDur = rand(0.13, 0.17);
      return true;
    }
    return false;
  }

  updatePerch(dt, world) {
    const P = this.pose;
    const t = this.time;
    // the landing settles: wings fold, the legs take the weight
    this.settle = Math.max(0, (this.settle ?? 0) - dt);
    this.liftV += (-this.lift * 220 - this.liftV * 22) * dt;
    this.lift += this.liftV * dt;
    // defaults the actions adjust
    let pitch = 0;
    let lift = this.lift;
    let beak = 0;
    let fluff = 0.03 + 0.015 * Math.sin(t * TAU * 1.4);
    let wingSpread = 0;
    let wingDroop = 0;
    let tailSpread = 0;
    let headYaw = this.head.yaw;
    let headPitch = this.head.pitch;
    let headRoll = this.head.roll;
    let headSpeed = 26;
    let bodyRoll = 0.02 * Math.sin(t * 0.9);
    let bodyYaw = 0;
    let feet = 0;

    if (this.state === 'perch' && !this.act && this.settle <= 0) this.chooseAction(world);
    this.actT += dt;
    const a = this.act;
    const k = this.actDur > 0 ? Math.min(1, this.actT / this.actDur) : 1;

    if (a === 'look' || a === 'idle') {
      this.look -= dt;
      if (this.look <= 0) this.newLook(world);
    } else if (a === 'hop') {
      // a two-footed hop: crouch, spring, land with a small bob
      const u = Math.min(1, this.actT / this.actDur);
      this.heading += wrap(this.act3 - this.heading) * Math.min(1, dt * 30);
      this.pos.lerpVectors(this.hopFrom, this.hopTo, ease(u));
      const h = 0.018 + 0.012 * this.hopFrom.distanceTo(this.hopTo) / 0.08;
      this.pos.y += 4 * h * u * (1 - u);
      pitch = 0.18 * Math.sin(u * Math.PI);
      feet = u > 0.05 && u < 0.95 ? 1 : 0;
      tailSpread = 0.15 * Math.sin(u * Math.PI);
      headYaw = 0;
      headPitch = 0.1;
      headRoll = 0;
      if (u >= 1) {
        this.liftV = -0.08;
        this.act2 -= 1;
        this.tailFlick = Math.max(this.tailFlick, Math.random() < 0.3 ? 0.2 : 0);
        if (this.act2 > 0 && this.planHop(world)) {
          // keep hopping after a short pause
          this.actT = -rand(0.05, 0.25);
        } else {
          this.act = null;
        }
      }
      if (this.actT < 0) {
        this.pos.copy(this.hopFrom);
        pitch = 0;
      }
    } else if (a === 'turn') {
      // a little jump that turns the bird round
      const u = k;
      this.heading = this.act2 + wrap(this.act3 - this.act2) * ease(u);
      this.pos.copy(this.hopFrom);
      this.pos.y += 0.012 * Math.sin(u * Math.PI);
      feet = u > 0.1 && u < 0.9 ? 0.6 : 0;
      headYaw = 0;
    } else if (a === 'peck') {
      // look down with one eye, then lean in and jab at the ground
      const tt = this.actT;
      if (tt < 0.45) {
        headRoll = this.act3 * 0.5;
        headPitch = 0.45;
        headYaw = this.act3 * 0.25;
        pitch = 0.15;
      } else {
        const jt = (tt - 0.45) / 0.22;
        const j = Math.floor(jt);
        const f = jt - j;
        if (j < this.act2) {
          const jab = Math.sin(Math.min(1, f * 1.3) * Math.PI);
          pitch = 0.5 + 0.25 * jab;
          headPitch = 1.0 + 0.35 * jab;
          headYaw = 0;
          headRoll = 0;
          lift = this.lift - 0.006 - 0.004 * jab;
          headSpeed = 45;
          P.headDrop = -0.006 * jab;
        } else {
          pitch = 0.05;
          headPitch = 0.1;
          P.headDrop = 0;
        }
      }
      if (k >= 1) P.headDrop = 0;
    } else if (a === 'preen') {
      // head round to the wing, nibbling
      const s = this.act3;
      const nib = Math.sin(this.actT * TAU * 5) * 0.08;
      const inn = smooth(0, 0.2, k) * (1 - smooth(0.85, 1, k));
      headYaw = s * 2.3 * inn;
      headPitch = (0.55 + nib) * inn;
      headRoll = -s * 0.5 * inn;
      headSpeed = 18;
      wingDroop = 0.05 * inn;
      fluff = 0.25 * inn;
      bodyYaw = s * 0.2 * inn;
    } else if (a === 'fluff') {
      // a rouse: fluff up, shake, settle
      const up = smooth(0, 0.25, this.actT) * (1 - smooth(0.55, 1.1, this.actT));
      fluff = 0.9 * up;
      const shake = this.actT > 0.25 && this.actT < 0.55 ? Math.sin(this.actT * TAU * 16) : 0;
      bodyRoll = 0.12 * shake;
      headRoll = 0.3 * shake;
      headYaw = 0.25 * shake;
      headSpeed = 60;
      wingSpread = 0.08 * up;
      tailSpread = 0.3 * up;
    } else if (a === 'sing') {
      // head up, beak opening in quick syllables; the song is played elsewhere
      if (!this.sang) {
        this.sang = true;
        this.onChirp?.(this);
      }
      headPitch = -0.35;
      headRoll = 0;
      headYaw = this.head.yaw * 0.4;
      this.act2 -= dt;
      if (this.act2 <= 0) this.act2 = rand(0.06, 0.16);
      beak = 0.45 + 0.55 * Math.abs(Math.sin(this.actT * TAU * 7.5)) * smooth(0, 0.1, this.actT) * (1 - smooth(0.85, 1, k));
      fluff = 0.12 + 0.06 * Math.sin(this.actT * TAU * 7.5);
    } else if (a === 'poke') {
      // tapped: a little hop in place, a tilt of the head and a chirp
      const u = Math.min(1, this.actT / 0.28);
      this.pos.copy(this.hopFrom);
      this.pos.y += 0.02 * Math.sin(u * Math.PI);
      feet = u < 1 ? 0.5 : 0;
      tailSpread = 0.4 * Math.sin(u * Math.PI);
      wingSpread = 0.12 * Math.sin(u * Math.PI);
      headRoll = this.act3 * 0.45 * smooth(0.2, 0.45, this.actT) * (1 - smooth(1.1, 1.5, this.actT));
      headPitch = 0.05;
      headYaw = this.head.yaw;
      if (this.actT > 0.35 && !this.sang) {
        this.sang = true;
        this.onChirp?.(this);
      }
      beak = this.actT > 0.35 && this.actT < 0.75 ? 0.6 * Math.abs(Math.sin((this.actT - 0.35) * TAU * 5)) : 0;
    }
    if (a && a !== 'hop' && this.actDur > 0 && this.actT >= this.actDur) {
      this.act = null;
      P.headDrop = 0;
    }

    // quick tail flicks (robins cock the tail and let it down slowly)
    this.tailFlick = Math.max(0, this.tailFlick - dt);
    const tf = this.tailFlick > 0 ? Math.sin(Math.min(1, (0.3 - this.tailFlick) / 0.3) * Math.PI) : 0;
    this.wingFlick = Math.max(0, this.wingFlick - dt);
    const wf = this.wingFlick > 0 ? Math.sin(((0.25 - this.wingFlick) / 0.25) * Math.PI) : 0;

    P.pitch = damp(P.pitch, pitch, 14, dt);
    P.roll = damp(P.roll, bodyRoll, 10, dt);
    P.yaw = damp(P.yaw, bodyYaw, 8, dt);
    P.lift = lift;
    P.fluff = damp(P.fluff, fluff, 10, dt);
    P.beak = damp(P.beak, beak, 30, dt);
    P.tuck = damp(P.tuck, 0, 16, dt);
    P.feetDown = 0;
    P.hopFeet = feet;
    // wings fold neatly after landing
    const fold = this.settle > 0 ? this.settle / 0.3 : 0;
    P.wingSpread = damp(P.wingSpread, Math.max(wingSpread + wf * 0.12, fold * 0.5), 16, dt);
    P.wingElev = damp(P.wingElev, fold * 0.2, 16, dt);
    P.wingSweep = damp(P.wingSweep, 0, 16, dt);
    P.wingTwist = damp(P.wingTwist, 0, 16, dt);
    P.wingDroop = damp(P.wingDroop, wingDroop + wf * 0.08, 20, dt);
    P.tailSpread = damp(P.tailSpread, Math.max(tailSpread, fold * 0.6), 12, dt);
    P.tailCock = damp(P.tailCock, tf * 0.55 * (this.sp.behaviour.tailFlick || 0.5), tf > 0 ? 40 : 7, dt);
    this.aimHead(headYaw, headPitch, headRoll, dt, headSpeed);
  }

  // ---------------------------------------------------------------- frame

  update(dt, world) {
    this.time += dt;
    if (this.state === 'fly') this.updateFly(dt);
    else if (this.state === 'land') this.updateLanding(dt);
    else if (this.state === 'takeoff') this.updateTakeoff(dt);
    else if (this.state === 'perch') {
      this.updatePerch(dt, world);
      this.stay -= dt;
    }
    const root = this.object;
    root.position.copy(this.pos);
    root.rotation.set(0, this.heading, 0);
    this.rig.apply();
    root.updateMatrixWorld(true);
  }

  // world position of the body centre (picking, sound)
  centre(out = this.centreW) {
    return this.rig.centre(out);
  }
}

export { Path };
