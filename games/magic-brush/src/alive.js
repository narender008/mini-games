// The magic moment: a painting comes alive.
//
// 1. Glow (0.7 s): the finished painting shimmers. The friend is swapped in
//    for the painting, pressed flat onto the canvas so it looks exactly like
//    the paint, and the paint on the canvas underneath lifts away with it.
// 2. Emerge (1.8 s): starting at its head, the friend turns from paint into
//    fur, scales or feathers along a glowing, sparkling seam that sweeps to
//    its tail, while the living part pushes out of the canvas. Vertices part
//    way along the seam are stretched between the canvas and the body, so
//    the paint visibly pulls off the canvas in streaks. Wet droplets of the
//    child's colours fly off the seam and splat on the floor.
// 3. Leap: fully alive, it springs off the canvas in an arc, reaching
//    forward, and lands in front of the easel with a squash and a bounce,
//    then says hello.
import * as THREE from 'three';
import { clamp, smoothstep, easeInOut, rand, REDUCED_MOTION } from './config.js';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();

export class ComeAlive {
  constructor({ easel, fx, audio, groundAt }) {
    this.easel = easel;
    this.fx = fx;
    this.audio = audio;
    this.groundAt = groundAt;
    this.active = null;
  }

  // friend: built, skinned and projected; land: {x, z, yaw} where it lands
  start(friend, land, colors, onDone) {
    const reduced = REDUCED_MOTION.matches;
    const plane = this.easel.plane.clone();
    const startM = plane.clone().multiply(friend.canvasPose());
    startM.decompose(_p, _q, _s);
    const from = { pos: _p.clone(), quat: _q.clone(), scale: _s.x };
    const to = {
      pos: new THREE.Vector3(land.x, this.groundAt(land.x, land.z), land.z),
      quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), land.yaw),
      scale: land.scale ?? 1,
    };
    const u = friend.shared;
    u.uAliveOn.value = 1;
    u.uFront.value = 1.2;
    u.uFrontW.value = 0.09;
    friend.object.position.copy(from.pos);
    friend.object.quaternion.copy(from.quat);
    friend.object.scale.setScalar(from.scale);
    friend.motion.air = 0;
    this.active = {
      friend,
      from,
      to,
      t: 0,
      colors: colors.length ? colors : [new THREE.Color(1, 0.8, 0.5)],
      onDone,
      glow: reduced ? 0.3 : 0.7,
      emerge: reduced ? 1.0 : 1.8,
      leap: reduced ? 0.7 : 1.05,
      settle: 0.9,
      landed: false,
      dropAcc: 0,
      reduced,
    };
    this.easel.uniforms.uLift.value = 0;
    this.audio.magic?.('shimmer');
  }

  get busy() {
    return !!this.active;
  }

  // the moment's progress 0..1 (for the camera)
  get progress() {
    const a = this.active;
    if (!a) return 1;
    return clamp(a.t / (a.glow + a.emerge + a.leap + a.settle), 0, 1);
  }

  update(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    const f = a.friend;
    const u = f.shared;
    const t = a.t;
    const tE = t - a.glow; // emerging time
    const tL = tE - a.emerge + 0.35; // the leap overlaps the end of the emergence
    const easelU = this.easel.uniforms;
    // the paint under the friend lifts away as soon as it takes over
    easelU.uLift.value = smoothstep(0.0, 0.15, t);
    easelU.uGlow.value = Math.max(0, 1 - t / a.glow) * 0.8;

    // the seam sweeps from head to tail
    const e = clamp(tE / a.emerge, 0, 1);
    u.uFront.value = 1.2 - easeInOut(e) * 1.45;
    if (tE > 0 && !a.whoosh) {
      a.whoosh = true;
      this.audio.magic?.('whoosh');
    }

    // where the friend is: pushed out from the canvas while it emerges, then leaping
    const push = smoothstep(0, 1, e) * 0.18;
    const k = clamp(tL / a.leap, 0, 1);
    const kk = easeInOut(k);
    const plane = this.easel.plane;
    const n = _v.set(plane.elements[8], plane.elements[9], plane.elements[10]).normalize();
    _p.copy(a.from.pos).addScaledVector(n, push);
    if (tL > 0) {
      _p.lerp(a.to.pos, kk);
      _p.y += Math.sin(k * Math.PI) * 0.28 * (1 - k * 0.3);
    }
    f.object.position.copy(_p);
    // it turns from lying on the canvas to standing upright, facing us
    const turn = smoothstep(0.15, 1, e) * 0.35 + (tL > 0 ? kk * 0.65 : 0);
    _q.copy(a.from.quat).slerp(a.to.quat, turn);
    f.object.quaternion.copy(_q);
    f.object.scale.setScalar(a.from.scale + (a.to.scale - a.from.scale) * smoothstep(0.2, 1, e * 0.5 + kk * 0.5));
    // the flat, not-yet-alive part stays exactly on the canvas
    f.object.updateMatrixWorld(true);
    _m.copy(f.object.matrixWorld).invert();
    u.uCanvasLocal.value.copy(_m).multiply(plane).multiply(f.restToPlane);
    u.uCanvasN.value.copy(n).transformDirection(_m);
    // pose: reaching out of the canvas, then tucked for the landing
    f.motion.air = tL > 0 ? (k < 1 ? 1 - smoothstep(0.75, 1, k) : 0) : smoothstep(0.2, 0.8, e);
    f.motion.speed = 0;

    // wet droplets and sparkles fly off the seam
    if (e > 0 && e < 1) {
      a.dropAcc += dt * (a.reduced ? 10 : 34);
      while (a.dropAcc > 1) {
        a.dropAcc -= 1;
        this.seamParticle(a);
      }
    }
    if (tL >= a.leap && !a.landed) {
      a.landed = true;
      f.object.position.copy(a.to.pos);
      u.uAliveOn.value = 0;
      f.happy.kick(4);
      this.fx.sparkles.burst(_p.copy(a.to.pos).setY(a.to.pos.y + 0.05), a.reduced ? 12 : 40, { colors: [[1.8, 1.4, 0.7], [1.2, 1.2, 1.8]], speed: 1.2, size: 0.02, up: 0.8 });
      this.audio.land?.();
      this.onLand?.(f);
    }
    if (a.landed) {
      // a landing squash that springs back
      const ls = t - (a.glow + a.emerge - 0.35 + a.leap);
      const sq = Math.sin(Math.min(1, ls / 0.45) * Math.PI) * Math.exp(-ls * 3) * 0.12;
      f.object.scale.set(a.to.scale * (1 + sq * 0.6), a.to.scale * (1 - sq), a.to.scale * (1 + sq * 0.6));
      if (ls > a.settle) {
        f.object.scale.setScalar(a.to.scale);
        const done = a.onDone;
        this.active = null;
        easelU.uLift.value = 0;
        easelU.uGlow.value = 0;
        done?.(f);
      }
    }
  }

  // a droplet or sparkle from somewhere along the seam
  seamParticle(a) {
    const f = a.friend;
    const g = f.body.geometry;
    const pos = g.attributes.position;
    // find a vertex near the seam
    const front = f.shared.uFront.value;
    let tries = 0;
    let idx = -1;
    while (tries++ < 24) {
      const i = Math.floor(Math.random() * pos.count);
      _v.fromBufferAttribute(pos, i);
      const uv = f.paintUv(_v);
      if (Math.abs(uv[0] - front) < 0.06) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    // its place in the world (skinned)
    f.body.getVertexPosition(idx, _v);
    _v.applyMatrix4(f.body.matrixWorld);
    const c = a.colors[Math.floor(Math.random() * a.colors.length)];
    const n = this.easel.plane.elements;
    const out = new THREE.Vector3(n[8], n[9], n[10]).normalize();
    if (Math.random() < 0.55) {
      const vel = out.clone().multiplyScalar(rand(0.4, 1.3)).add(new THREE.Vector3(rand(-0.6, 0.6), rand(0.2, 1.4), rand(-0.3, 0.3)));
      this.fx.droplets.throw(_v, vel, c, rand(0.004, 0.011));
    }
    const sc = [c.r * 2 + 0.4, c.g * 2 + 0.4, c.b * 2 + 0.4];
    this.fx.sparkles.emit(_v.x, _v.y, _v.z, rand(-0.3, 0.3) + out.x * 0.3, rand(0, 0.5), rand(-0.3, 0.3) + out.z * 0.3, Math.random() < 0.5 ? sc : [2, 1.7, 1], rand(0.012, 0.03), rand(0.6, 1.4));
  }
}
