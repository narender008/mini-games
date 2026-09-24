// One butterfly (or luna moth): its model and its life in the garden. It
// flutters in from off-screen on a bouncy, gently erratic path, visits open
// blooms, lands, sips while slowly opening and closing its wings, moves on
// to another flower and, after a while, drifts away.
import * as THREE from 'three';
import { clamp, smooth, damp } from '../config.js';
import { BUTTERFLY_KINDS, butterflyAssets } from './butterflies.js';
import { refind, chooseTarget, keepInside, clearLens, offscreenPoint, offscreen, wanderPoint, wave, basis, ease, VOLUME } from './flight.js';

const TAU = Math.PI * 2;
const CLOSED = 1.54; // wing angle (rad above flat) with the wings together
const _d = new THREE.Vector3();
const _w = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const UP = new THREE.Vector3(0, 1, 0);

export class Butterfly {
  constructor(kind, host, { still = false } = {}) {
    this.kind = kind;
    this.group = kind === 'luna-moth' ? 'night' : 'butterfly';
    this.host = host;
    const spec = (this.spec = BUTTERFLY_KINDS[kind]);
    const a = (this.a = butterflyAssets(kind, host?.quality));
    const o = (this.object = new THREE.Group());
    o.name = kind;
    o.rotation.order = 'YXZ';
    o.userData.creature = this;
    const rig = (this.rig = new THREE.Group());
    o.add(rig);
    const body = new THREE.Mesh(a.body, a.bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.appPerch = new THREE.Mesh(a.appPerch, a.appMat);
    this.appFly = new THREE.Mesh(a.appFly, a.appMat);
    this.appPerch.castShadow = this.appFly.castShadow = true;
    rig.add(body, this.appPerch, this.appFly);
    this.wings = [];
    for (const side of [1, -1]) {
      const root = new THREE.Group();
      root.position.set(side * a.hingeX, 0, 0);
      if (side < 0) root.scale.x = -1;
      const fore = new THREE.Mesh(a.fore, a.wingMat);
      const hind = new THREE.Mesh(a.hind, a.wingMat);
      fore.castShadow = hind.castShadow = true;
      root.add(hind, fore);
      rig.add(root);
      this.wings.push({ side, root, fore, hind });
    }
    this.pos = o.position;
    this.vel = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.exit = new THREE.Vector3();
    this.loopFrom = new THREE.Vector3();
    this.landFrom = new THREE.Vector3();
    this.qFrom = new THREE.Quaternion();
    this.qWant = new THREE.Quaternion();
    this.heading = new THREE.Vector3(0, 0, 1);
    this.tgt = null;
    this.tgtPlant = null;
    this.tgtKind = 'bloom';
    this.tgtPos = new THREE.Vector3();
    this.tgtN = new THREE.Vector3(0, 1, 0);
    this.state = 'fly';
    this.purpose = 'enter';
    this.entering = true;
    this.phase = Math.random() * TAU;
    this.mid = 0.5;
    this.amp = 1;
    this.sweep = 0;
    this.glide = 0;
    this.glideT = 0;
    this.open = 0;
    this.openTarget = 0;
    this.openT = 1 + Math.random() * 2;
    this.yaw = 0;
    this.yawRate = 0;
    this.seed = Math.random() * 100;
    this.age = 0;
    this.timer = 0;
    this.visits = 0;
    this.maxVisits = 2 + Math.floor(Math.random() * 4);
    this.stay = 45 + Math.random() * 50;
    this.settled = false;
    this.dead = false;
    this.excite = 0;
    this.radius = Math.max(0.08, a.radius);
    if (still) this.pose();
  }

  // ---------------------------------------------------------------- life

  // Starts off-screen at one side, heading into the garden.
  enter(camera) {
    offscreenPoint(this.pos, camera, Math.random() < 0.5 ? -1 : 1, !this.spec.moth && Math.random() < 0.2);
    this.vel.set(-Math.sign(this.pos.x) * this.spec.speed, 0, 0);
    this.yaw = Math.atan2(this.vel.x, this.vel.z);
    this.object.rotation.set(-0.4, this.yaw, 0);
    this.state = 'fly';
    this.purpose = 'enter';
    this.entering = true;
  }

  leave() {
    if (this.purpose === 'leave') return;
    if (this.state === 'perch' || this.state === 'land') this.takeOff();
    this.purpose = 'leave';
    offscreenPoint(this.exit, this.host?.camera, this.pos.x < 0 ? -1 : 1, !this.spec.moth && Math.random() < 0.3);
  }

  // Tapped: a happy little loop, then back to its flower.
  poke() {
    if (this.state === 'loop' || this.purpose === 'leave') return;
    this.returnTo = this.state === 'perch' || this.state === 'land' ? this.tgt : null;
    if (this.state === 'perch' || this.state === 'land') this.takeOff();
    this.state = 'loop';
    this.timer = 0;
    this.loopDur = this.host?.reduced ? 3.2 : 2.3;
    this.loopFrom.copy(this.pos);
    this.loopSide = Math.random() < 0.5 ? -1 : 1;
    this.excite = 1;
  }

  update(dt, t, world) {
    this.age += dt;
    const night = world.night || 0;
    // day visitors go to roost at night, the moth goes home at dawn
    if (this.purpose !== 'leave' && (this.spec.nocturnal ? night < 0.35 : night > 0.65)) this.stay = Math.min(this.stay, this.age);
    if (this.state === 'fly') this.fly(dt, t, world);
    else if (this.state === 'land') this.landing(dt, t, world);
    else if (this.state === 'perch') this.perched(dt, t, world);
    else if (this.state === 'loop') this.looping(dt, t, world);
    this.animate(dt, t);
  }

  // follow the current landing spot as its plant sways; false when gone
  track(world) {
    if (!this.tgtPlant) return false;
    const t = refind(world.targets, this.tgtPlant, this.tgtKind, this.tgtPos);
    if (!t) {
      this.tgt = null;
      this.tgtPlant = null;
      return false;
    }
    this.tgt = t;
    this.tgtPos.copy(t.pos);
    if (t.normal) this.tgtN.copy(t.normal).normalize();
    else this.tgtN.copy(UP);
    return true;
  }

  aimAt(t) {
    this.tgt = t;
    this.tgtPlant = t.plant;
    this.tgtKind = t.kind;
    this.tgtPos.copy(t.pos);
    this.tgtN.copy(t.normal || UP).normalize();
    this.purpose = 'visit';
    this.timer = 0;
  }

  // decide where to go next (after arriving, after a visit, or when lost)
  next(world, avoid = null) {
    if (this.age > this.stay || this.visits >= this.maxVisits || (world.rain || 0) > 0.5) {
      this.leave();
      return;
    }
    const host = this.host;
    const t = chooseTarget(world.targets, ['bloom'], this.kind, this.pos, (x) => host.taken(x, this), avoid, this.spec.prefer);
    if (t) this.aimAt(t);
    else {
      this.purpose = 'wander';
      this.timer = 3 + Math.random() * 5;
      wanderPoint(this.goal, 0.3, 1.0);
    }
  }

  fly(dt, t, world) {
    const s = this.spec;
    const host = this.host;
    if (this.purpose === 'enter') this.next(world);
    if (this.purpose === 'visit' && !this.track(world)) this.next(world);
    if (this.purpose === 'visit') {
      // approach from just above the flower's face
      this.goal.copy(this.tgtPos).addScaledVector(this.tgtN, 0.07).addScaledVector(UP, 0.02);
      this.timer += dt;
    } else if (this.purpose === 'wander') {
      this.timer -= dt;
      if (this.pos.distanceTo(this.goal) < 0.15) wanderPoint(this.goal, 0.3, 1.0);
      if (this.timer <= 0) {
        if (this.age > 16 && !(world.targets && world.targets.some((x) => x.kind === 'bloom'))) this.leave();
        else this.next(world);
      }
    } else if (this.purpose === 'leave') {
      this.goal.copy(this.exit);
    }
    const toGoal = _d.subVectors(this.goal, this.pos);
    const dist = toGoal.length();
    const calm = host?.reduced ? 0.7 : 1;
    const speed = s.speed * calm * (this.purpose === 'leave' ? 1.15 : 1) * (1 + this.excite * 0.3);
    const near = this.purpose === 'visit' ? Math.max(0.18, smooth(0, 0.45, dist)) : 1;
    _w.copy(toGoal).multiplyScalar((speed * near) / Math.max(dist, 1e-3));
    // the flutter: a path that wanders and bobs, calmer close to the flower
    const er = s.erratic * speed * (host?.reduced ? 0.45 : 1) * (this.purpose === 'visit' ? smooth(0.04, 0.5, dist) : 1);
    const tt = t * 1.25 + this.seed;
    _w.x += wave(tt, 0.3, 1.7, 2.9) * er;
    _w.y += wave(tt * 1.3, 4.1, 0.6, 5.3) * er * 0.8;
    _w.z += wave(tt * 0.9, 2.2, 3.9, 1.1) * er;
    if (this.entering) {
      const V = VOLUME;
      const p = this.pos;
      if (p.x > V.x0 && p.x < V.x1 && p.y < V.y1 && p.z > V.z0 && p.z < V.z1) this.entering = false;
    } else if (this.purpose !== 'leave') keepInside(this.pos, _w);
    // stay above the lawn and the plants' feet
    const gy = (world.lawn && world.lawn(this.pos.x, this.pos.z)) ?? 0;
    const floor = gy + (this.purpose === 'visit' && dist < 0.3 ? 0.02 : 0.15);
    if (this.pos.y < floor) _w.y += (floor - this.pos.y) * 5;
    // glides: wings held in a shallow V, sinking slowly
    this.glideT -= dt;
    if (this.glideT <= 0) {
      if (this.glide) {
        this.glide = 0;
        this.glideT = 0.6 + Math.random() * 1.6;
      } else if (Math.random() < s.glide && dist > 0.35) {
        this.glide = 1;
        this.glideT = 0.35 + Math.random() * 0.7 * (1 + s.glide);
      } else this.glideT = 0.4 + Math.random();
    }
    if (this.glide) _w.y -= 0.06;
    this.vel.x = damp(this.vel.x, _w.x, 3, dt);
    this.vel.y = damp(this.vel.y, _w.y, 3, dt);
    this.vel.z = damp(this.vel.z, _w.z, 3, dt);
    this.pos.addScaledVector(this.vel, dt);
    clearLens(this.pos, world.camera);
    this.excite = Math.max(0, this.excite - dt * 0.4);
    if (this.purpose === 'visit' && (dist < 0.045 || (dist < 0.12 && this.timer > 6))) this.startLanding();
    else if (this.purpose === 'leave' && (dist < 0.3 || (offscreen(this.pos, world.camera) && Math.abs(this.pos.x) > 2.1))) this.dead = true;
    this.orientFlight(dt);
  }

  orientFlight(dt) {
    const v = this.vel;
    const vh = Math.hypot(v.x, v.z);
    if (vh > 0.03) {
      const want = Math.atan2(v.x, v.z);
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const step = dy * (1 - Math.exp(-5 * dt));
      this.yaw += step;
      this.yawRate = damp(this.yawRate, step / Math.max(dt, 1e-4), 6, dt);
    }
    const climb = clamp(v.y / Math.max(0.1, vh + Math.abs(v.y)), -0.6, 0.8);
    // body tilted nose-up, rocking a little with each wing beat
    const pitch = -(0.38 + 0.14 * Math.cos(this.phase) * this.amp) * (1 - this.glide * 0.6) - climb * 0.25;
    const roll = clamp(-this.yawRate * 0.18, -0.45, 0.45);
    _e.set(pitch, this.yaw, roll, 'YXZ');
    this.qWant.setFromEuler(_e);
    this.object.quaternion.slerp(this.qWant, 1 - Math.exp(-12 * dt));
  }

  startLanding() {
    this.state = 'land';
    this.timer = 0;
    this.landDur = (this.host?.reduced ? 1.3 : 0.9) + Math.random() * 0.3;
    this.landFrom.copy(this.pos);
    this.qFrom.copy(this.object.quaternion);
    // face along the approach, on the flower's surface
    _f.copy(this.vel);
    if (_f.lengthSq() < 1e-6) _f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.setHeading(_f);
  }

  // heading in the flower's tangent plane from a direction
  setHeading(dir) {
    const n = this.tgtN;
    this.heading.copy(dir).addScaledVector(n, -dir.dot(n));
    if (this.heading.lengthSq() < 1e-6) this.heading.set(1, 0, 0).addScaledVector(n, -n.x);
    this.heading.normalize();
  }

  landing(dt, t, world) {
    if (!this.track(world)) {
      this.takeOff();
      this.next(world);
      return;
    }
    this.timer += dt;
    const k = Math.min(1, this.timer / this.landDur);
    const e = ease(k);
    _p.copy(this.tgtPos).addScaledVector(this.tgtN, this.a.stand);
    this.pos.lerpVectors(this.landFrom, _p, e).addScaledVector(this.tgtN, Math.sin(Math.PI * k) * 0.018);
    this.setHeading(this.heading);
    basis(this.heading, this.tgtN, this.qWant);
    this.object.quaternion.slerpQuaternions(this.qFrom, this.qWant, e);
    this.vel.set(0, 0, 0);
    if (k >= 1) {
      this.state = 'perch';
      this.timer = (this.host?.reduced ? 1.4 : 1) * (this.spec.moth ? 14 + Math.random() * 14 : 5 + Math.random() * 8);
      this.open = 0;
      this.openTarget = 0;
      this.openT = 0.8 + Math.random() * 1.5;
      if (!this.settled) {
        this.settled = true;
        this.host?.settle(this);
      }
    }
  }

  perched(dt, t, world) {
    if (!this.track(world)) {
      this.takeOff();
      this.next(world);
      return;
    }
    // walk round the flower head a little while sipping
    const turn = Math.sin(t * 0.27 + this.seed) * 0.12 * dt;
    this.heading.applyAxisAngle(this.tgtN, turn);
    this.setHeading(this.heading);
    this.pos.copy(this.tgtPos).addScaledVector(this.tgtN, this.a.stand);
    basis(this.heading, this.tgtN, this.qWant);
    this.object.quaternion.slerp(this.qWant, 1 - Math.exp(-6 * dt));
    // slow opening and closing of the wings
    this.openT -= dt;
    if (this.openT <= 0) {
      const s = this.spec;
      if (s.restOpen) {
        this.openTarget = this.openTarget > 0.9 ? 0.55 + Math.random() * 0.2 : 1;
        this.openT = this.openTarget > 0.9 ? 4 + Math.random() * 5 : 1.2 + Math.random();
      } else if (this.openTarget > 0.05) {
        this.openTarget = 0;
        this.openT = 1.5 + Math.random() * 3;
      } else {
        this.openTarget = s.bask * (0.75 + Math.random() * 0.25);
        this.openT = 1.8 + Math.random() * 3 * s.bask;
      }
    }
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
    this.vel.copy(this.tgtN).multiplyScalar(0.35).addScaledVector(this.heading, 0.15);
    this.vel.y = Math.max(this.vel.y, 0.2);
    this.amp = Math.max(this.amp, 0.6);
    this.glide = 0;
    this.glideT = 0.8;
    this.entering = false;
  }

  looping(dt, t, world) {
    this.timer += dt;
    const k = Math.min(1, this.timer / this.loopDur);
    const a = ease(k) * TAU;
    const r = this.host?.reduced ? 0.07 : 0.1;
    _p.copy(this.loopFrom);
    _p.y += r * (1 - Math.cos(a)) + 0.04 * Math.sin(Math.PI * k);
    _p.x += this.loopSide * r * Math.sin(a);
    _p.z += 0.03 * Math.sin(Math.PI * k);
    clearLens(_p, world.camera);
    this.vel.subVectors(_p, this.pos).divideScalar(Math.max(dt, 1e-3));
    this.pos.copy(_p);
    this.orientFlight(dt);
    if (k >= 1) {
      this.state = 'fly';
      this.vel.multiplyScalar(0.3);
      if (this.returnTo && this.tgtPlant) this.purpose = 'visit';
      else if (this.purpose === 'visit' && !this.tgtPlant) this.next(world);
      this.returnTo = null;
    }
  }

  // ---------------------------------------------------------------- wings

  animate(dt, t) {
    const s = this.spec;
    const flying = this.state === 'fly' || this.state === 'loop';
    let mid;
    let amp;
    let sweep = 0;
    if (flying) {
      mid = this.glide ? 0.2 : 0.5;
      amp = this.glide ? 0.04 : 0.95;
    } else if (this.state === 'land') {
      const k = Math.min(1, this.timer / this.landDur);
      mid = 0.5 + (CLOSED - 0.5) * ease((k - 0.4) / 0.6);
      amp = 0.9 * (1 - ease(k / 0.85));
    } else {
      this.open = damp(this.open, this.openTarget, this.host?.reduced ? 0.8 : 1.2, dt);
      mid = CLOSED + (0.1 - CLOSED) * this.open;
      amp = 0;
      // forewings drawn down into the hindwings when closed
      sweep = 0.14 * (1 - this.open);
    }
    this.mid = damp(this.mid, mid, flying ? 6 : 10, dt);
    this.amp = damp(this.amp, amp, 7, dt);
    const freq = s.flap * (1 + this.excite * 0.35) * (this.host?.reduced ? 0.85 : 1) * (this.state === 'land' ? 1.1 : 1);
    if (this.amp > 0.01) this.phase = (this.phase + TAU * freq * dt) % TAU;
    const c = Math.cos(this.phase);
    const shaped = Math.sign(c) * Math.pow(Math.abs(c), 0.75);
    const ang = this.mid + this.amp * shaped;
    this.sweep = damp(this.sweep, sweep, 5, dt);
    const flapSweep = 0.13 * Math.sin(this.phase) * this.amp;
    for (const w of this.wings) {
      w.root.rotation.z = w.side * ang;
      w.fore.rotation.y = this.sweep - flapSweep;
      w.hind.rotation.y = this.sweep * 0.2 - flapSweep * 0.5;
    }
    // each downstroke lifts the body a little
    const span = s.span;
    this.rig.position.y = -c * this.amp * span * 0.07;
    const perched = this.state === 'perch' || (this.state === 'land' && this.timer > this.landDur * 0.5);
    this.appPerch.visible = perched;
    this.appFly.visible = !perched;
  }

  // Posed and still (visitors book): wings open, standing.
  pose(open = 0.08) {
    for (const w of this.wings) {
      w.root.rotation.z = w.side * open;
      w.fore.rotation.y = -0.06;
      w.hind.rotation.y = 0;
    }
    this.appPerch.visible = true;
    this.appFly.visible = false;
  }

  // The portrait pose: upper side towards +z, head up, tipped back a little.
  portrait() {
    this.pose(0.14);
    const q = this.object.quaternion;
    q.setFromAxisAngle(_u.set(1, 0, 0), -0.5);
    q.multiply(_q.setFromAxisAngle(_u.set(0, 0, 1), Math.PI));
    q.multiply(_q.setFromAxisAngle(_u.set(1, 0, 0), Math.PI / 2));
    return this.object;
  }
}
