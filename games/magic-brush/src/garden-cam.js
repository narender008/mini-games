// The garden camera: a film director for the play screen. It gives the camera
// rig a shot every frame (camera.js `follow`):
//  - group: the whole lawn in front of the studio, framed so the friends on it
//    fill the screen comfortably (close for one or two, wider for many), from
//    the studio side with a slow drift so the picture is never dead still;
//  - chase: behind and beside a friend that is running to the garden, looking
//    a little ahead of it;
//  - close: near a friend that was tapped, petted or fed, looking at its face.
// frame(entry, kind, seconds) takes a friend into focus for a while and
// then returns to the group shot on its own.
// Nothing here may jump, because the rig can only smooth a jump, not hide it:
// the shot the director asks for is itself continuous. Every choice that could
// flip (which side of a friend to sit on, which way it is heading at a corner,
// which side of a prop to go round) is a smoothed angle or distance, and when
// the KIND of shot changes (group, chase, close, sky) the new shot is blended in
// from the old one by orbiting round the subject, never cut to.
import * as THREE from 'three';
import { clamp, angleDiff, REDUCED_MOTION } from './config.js';
import { smoother, smoothDamp, smoothDampAngle, smoothDampV } from './smooth.js';
import { STAGE, obstacleAt } from './world/world.js';

const _c = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _v = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// seconds a new kind of shot takes to blend in
const BLEND = 1.0;

export class GardenCam {
  constructor({ camera, friends }) {
    this.camera = camera;
    this.friends = friends;
    this.center = new THREE.Vector3(STAGE.x, 0.2, STAGE.z);
    this.vCenter = new THREE.Vector3();
    this.radius = 0.9;
    this.vRadius = { v: 0 };
    this.time = 0;
    this.focus = null; // { e, kind, until, ... its own smoothed choices }
    this.out = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
    this.mixed = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
    this.last = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 }; // what the rig was last asked for
    this.from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 }; // the shot being blended away from
    this.to = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 }; // and the one blended to
    this.prev = null; // the focus of the shot being left (null: the group shot)
    this.curFocus = null;
    this.key = ''; // which shot it is (kind and friend), so a change can be blended
    this.blendK = 1;
    this.seen = -1; // game time of the last shot asked for
    this.ids = 0;
    this.side = 1; // which side of a friend (its right, +1, or left) the chase camera sits on
    this.sideHold = 0; // seconds before the chase camera may change side again
    this.azOff = 0; // radians the group shot has gone round to clear a prop
    this.vAz = { v: 0 };
    this.azTarget = 0;
    this.clearT = 0;
    this.active = false;
    this.calm = 0; // seconds of plain group shot since the camera last went anywhere
  }

  // rig.avoid: says where the camera would be if it were kept out of any tree,
  // post or prop it is cutting a corner through (only for the garden shot, not
  // the leap shots near the easel). The rig eases into that, so the push is
  // never a step. It pushes out by exactly as much as the camera is inside the
  // margin, so it starts from nothing.
  push = (pos) => {
    if (!this.active) return;
    this.active = false;
    // (and out of the friend it is following: the camera lags its goal, so a friend
    // that turns or hops toward it would otherwise pass right by the lens)
    const fe = this.focus?.e;
    if (fe && !fe.leaving && fe.home !== 'sky') {
      fe.friend.worldCenter(_p);
      const room = clamp(fe.friend.restRadius * fe.scale * 1.5, 0.6, 1.2);
      const dx = pos.x - _p.x;
      const dz = pos.z - _p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < room) {
        const m = Math.min(0.5, room - dist);
        pos.x += dist > 1e-3 ? (dx / dist) * m : m;
        pos.z += dist > 1e-3 ? (dz / dist) * m : 0;
      }
    }
    for (let i = 0; i < 3; i++) {
      const d = obstacleAt(pos.x, pos.z);
      if (d < -0.34) return;
      const e = 0.04;
      let gx = obstacleAt(pos.x + e, pos.z) - obstacleAt(pos.x - e, pos.z);
      let gz = obstacleAt(pos.x, pos.z + e) - obstacleAt(pos.x, pos.z - e);
      const l = Math.hypot(gx, gz) || 1;
      gx /= l;
      gz /= l;
      const m = Math.min(0.3, d + 0.34);
      pos.x -= gx * m;
      pos.z -= gz * m;
    }
  };

  // put a friend in focus: 'chase' (running to the garden), 'close' (a tap or a treat).
  // seconds: how long, or 0 to hold until release()
  frame(e, kind = 'close', seconds = 2.5) {
    const until = seconds ? this.time + seconds : Infinity;
    const f = this.focus;
    // asked again for the same friend: just keep it in focus for longer
    if (f && f.e === e && f.kind === kind) f.until = Math.max(f.until, until);
    else this.focus = { e, kind, until };
  }

  release() {
    this.focus = null;
  }

  get focused() {
    return this.focus?.e ?? null;
  }

  // the shot for this frame (camera.js follow calls this). dt 0 only asks what
  // the shot would be (to glide to it).
  shot(dt) {
    const ask = dt > 0;
    // (the rig may not have asked for a while: then there is nothing to blend from)
    const fresh = ask && this.friends.time - this.seen > 0.3;
    if (ask) {
      this.time += dt;
      this.seen = this.friends.time;
    }
    this.active = true;
    const step = ask ? dt : 0;
    const tall = this.camera.aspect < 0.8;
    const fov = tall ? 56 : 42;
    const f = this.focus;
    if (f && (f.e.leaving || this.time > f.until || !this.friends.list.includes(f.e))) this.focus = null;
    if (this.focus) this.calm = 0;
    else {
      // now and then glance up at a friend in the sky, so the sun and rainbow are seen
      this.calm += step;
      if (this.calm > 12) {
        this.calm = 0;
        const up = this.friends.list.filter((e) => e.home === 'sky' && e.state === 'idle' && !e.leaving);
        if (up.length) this.frame(up[Math.floor(Math.random() * up.length)], 'close', 3.6);
      }
    }
    const focus = this.focus; // null: the whole lawn
    const key = focus ? focus.kind + ':' + (focus.e.camId ??= ++this.ids) : 'group';
    if (!ask) return this.compute(focus, fov, tall, fresh, 0);
    if (fresh || !this.key) {
      this.key = key;
      this.blendK = 1;
    } else if (key !== this.key) {
      // a different shot: blend from the one it was on (a frozen copy of it, till it can be
      // asked for again below)
      this.key = key;
      this.blendK = 0;
      this.prev = this.curFocus;
      this.from.pos.copy(this.last.pos);
      this.from.look.copy(this.last.look);
      this.from.fov = this.last.fov;
    }
    this.curFocus = focus;
    let o = this.compute(focus, fov, tall, fresh, step);
    if (this.blendK < 1) {
      this.blendK = Math.min(1, this.blendK + dt / (REDUCED_MOTION.matches ? BLEND * 0.6 : BLEND));
      o = this.mix(o, fov, tall, step);
    }
    this.last.pos.copy(o.pos);
    this.last.look.copy(o.look);
    this.last.fov = o.fov;
    return o;
  }

  // the shot of a focus (or the group shot when there is none)
  compute(focus, fov, tall, fresh, step) {
    return focus ? this.focusShot(focus, fov, tall, fresh, step) : this.groupShot(fov, tall, step);
  }

  // A different kind of shot (or friend) blends in over a second: the look point
  // slides across and the camera orbits round it (in angle, height and distance),
  // so it neither cuts nor swings through the subject. The shot being left goes on
  // (as it would have) while it fades, so the goal itself never changes speed.
  mix(cur, fov, tall, step) {
    const to = this.to;
    to.pos.copy(cur.pos);
    to.look.copy(cur.look);
    to.fov = cur.fov;
    const pf = this.prev;
    if (!pf || (!pf.e.leaving && this.friends.list.includes(pf.e))) {
      const old = this.compute(pf, fov, tall, false, step);
      this.from.pos.copy(old.pos);
      this.from.look.copy(old.look);
      this.from.fov = old.fov;
    }
    const w = smoother(this.blendK);
    const o = this.mixed;
    const A = this.from;
    o.look.lerpVectors(A.look, to.look, w);
    o.fov = A.fov + (to.fov - A.fov) * w;
    // the camera's place relative to where it looks, in angle round, height and distance
    const ra = _rel.copy(A.pos).sub(A.look);
    const rb = _v.copy(to.pos).sub(to.look);
    const azA = Math.atan2(ra.x, ra.z);
    const azB = Math.atan2(rb.x, rb.z);
    const lenA = ra.length() || 1e-3;
    const lenB = rb.length() || 1e-3;
    const elA = Math.asin(clamp(ra.y / lenA, -1, 1));
    const elB = Math.asin(clamp(rb.y / lenB, -1, 1));
    const az = azA + angleDiff(azA, azB) * w;
    const el = elA + (elB - elA) * w;
    const len = lenA + (lenB - lenA) * w;
    o.pos.set(Math.sin(az) * Math.cos(el) * len, Math.sin(el) * len, Math.cos(az) * Math.cos(el) * len).add(o.look);
    return o;
  }

  groupShot(fov, tall, dt) {
    // the friends that count: those on the lawn (not floating in the sky)
    let n = 0;
    _c.set(STAGE.x, 0.18, STAGE.z);
    let wSum = 0.3; // the stage itself pulls a little so a lone friend at the edge is not centred
    let cx = _c.x * wSum;
    let cy = _c.y * wSum;
    let cz = _c.z * wSum;
    const list = this.friends.list.filter((e) => !e.leaving && e.home !== 'sky' && e.state !== 'journey');
    // (their centres in the air too: a butterfly on the wing pulls the shot up)
    for (const e of list) {
      e.friend.worldCenter(_v);
      cx += _v.x;
      cy += Math.min(_v.y, 1.6);
      cz += _v.z;
      wSum += 1;
      n++;
    }
    _f.set(cx / wSum, Math.max(0.2, cy / wSum), cz / wSum);
    smoothDampV(this.center, _f, this.vCenter, 0.45, dt);
    let r = 0.7;
    for (const e of list) {
      e.friend.worldCenter(_v);
      r = Math.max(r, Math.hypot(_v.x - this.center.x, (_v.y - this.center.y) * 1.2, _v.z - this.center.z) + e.friend.restRadius * e.scale * 0.8);
    }
    this.radius = smoothDamp(this.radius, r, this.vRadius, 0.45, dt);
    const t = Math.tan((fov * Math.PI) / 360);
    const half = t * Math.min(this.camera.aspect, tall ? 0.75 : 1.5);
    let d = (this.radius * 1.05) / Math.max(0.2, Math.min(t, half));
    d = clamp(d, tall ? 1.8 : 1.35, 4.6);
    // from the studio side, a little to the right, above; drifting slowly. If
    // a prop (the easel, a lantern post, a trunk) would stand between the camera
    // and the friends, or the camera would sit inside one, it goes round to a
    // clearer side (and stays there, so it never flickers between two)
    const sway = REDUCED_MOTION.matches ? 0 : Math.sin(this.time * 0.11) * 0.09;
    const el = 0.3 + (tall ? 0.06 : 0) + (REDUCED_MOTION.matches ? 0 : Math.sin(this.time * 0.09 + 1) * 0.02);
    const spotAt = (az) => {
      const x = this.center.x + Math.sin(az) * Math.cos(el) * d;
      const z = this.center.z + Math.cos(az) * Math.cos(el) * d;
      if (obstacleAt(x, z) > -0.3) return false;
      for (let i = 1; i <= 6; i++) {
        const u = i * 0.13;
        if (obstacleAt(x + (this.center.x - x) * u, z + (this.center.z - z) * u) > -0.05) return false;
      }
      return true;
    };
    this.clearT -= dt;
    if (this.clearT <= 0 || !spotAt(0.78 + this.azOff + sway)) {
      this.clearT = 0.5;
      if (!spotAt(0.78 + this.azOff + sway)) {
        for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6]) {
          if (spotAt(0.78 + off)) {
            this.azTarget = off;
            break;
          }
        }
      }
    }
    this.azOff = smoothDamp(this.azOff, this.azTarget, this.vAz, 0.9, dt);
    const az = 0.78 + this.azOff + sway; // radians from +z towards +x
    const o = this.out;
    o.pos.set(this.center.x + Math.sin(az) * Math.cos(el) * d, this.center.y + Math.sin(el) * d + 0.05, this.center.z + Math.cos(az) * Math.cos(el) * d);
    // (a little below the friends, so they sit above the toy bar)
    o.look.set(this.center.x, this.center.y + 0.07 - d * t * 0.13, this.center.z);
    o.fov = fov;
    return o;
  }

  // a friend in the sky (sun, rainbow): seen from the lawn, looking up at it,
  // far enough back to have all of it (and never inside it as it grows)
  skyShot(f, rad, t, fov, tall, fresh, dt) {
    const e = f.e;
    const o = this.out;
    e.friend.worldCenter(_c);
    const d = clamp((rad * (tall ? 2.4 : 1.7)) / t, 2.2, 6);
    // from the lawn in front of it (off any trunk or post), low, looking up
    const z = Math.min(e.pos.z + d, 1.2);
    let x = e.pos.x * 0.6 + 0.3;
    for (const dx of [0, 0.9, -0.9, 1.8, -1.8]) {
      if (obstacleAt(x + dx, z) < -0.35) {
        x += dx;
        break;
      }
    }
    // (the spot it settles on may move: the camera slides there)
    if (f.skyX === undefined || fresh) {
      f.skyX = x;
      f.vSkyX = { v: 0 };
    } else f.skyX = smoothDamp(f.skyX, x, f.vSkyX, 0.7, dt);
    o.pos.set(f.skyX, Math.min(1.0, 0.45 + _c.y * 0.2), z);
    o.look.copy(_c);
    o.look.y -= rad * 0.15;
    o.fov = fov;
    return o;
  }

  focusShot(f, fov, tall, fresh, dt) {
    const e = f.e;
    const fr = e.friend;
    fr.worldCenter(_c);
    const o = this.out;
    const rad = fr.restRadius * e.scale;
    const t = Math.tan((fov * Math.PI) / 360);
    if (e.home === 'sky') return this.skyShot(f, rad, t, fov, tall, fresh, dt);
    if (f.kind === 'chase') {
      // behind and to the side of a friend on the run, looking a little ahead;
      // "ahead" is where the path goes (a friend that has just landed still
      // faces the studio while it turns to go)
      const wp = e.task?.path[e.task.i];
      if (wp && Math.hypot(wp.x - e.pos.x, wp.z - e.pos.z) > 0.05) _f.set(wp.x - e.pos.x, 0, wp.z - e.pos.z).normalize();
      else _f.set(Math.sin(e.heading), 0, Math.cos(e.heading));
      // (blend the heading in as it comes round, so the camera never swings through it)
      const hd = _r.set(Math.sin(e.heading), 0, Math.cos(e.heading));
      _f.lerp(hd, clamp(e.speed / Math.max(0.05, fr.run * e.scale * 0.6), 0, 1) * 0.5).normalize();
      // and the direction itself turns smoothly, so a corner in the path swings
      // the camera round it instead of flipping it
      const want = Math.atan2(_f.x, _f.z);
      if (f.dirA === undefined) {
        f.dirA = want;
        f.vDir = { v: 0 };
      } else f.dirA = smoothDampAngle(f.dirA, want, f.vDir, 0.4, dt);
      _f.set(Math.sin(f.dirA), 0, Math.cos(f.dirA));
      _r.crossVectors(UP, _f).normalize();
      const d0 = clamp((rad * 1.9) / t, 1.0, 1.8);
      // beside it and a touch behind: the run is seen in profile, gait and all.
      // The camera keeps to one side of the friend (so it never swings across
      // its path as the friend turns) and only changes side when a prop would
      // be in the way: clear of every prop and with nothing between it and the friend
      const spot = (sd, k, out, room) => {
        out.copy(_c).addScaledVector(_f, -d0 * k * 0.25).addScaledVector(_r, sd * d0 * k * 0.95);
        if (obstacleAt(out.x, out.z) > -room) return false;
        for (let i = 1; i <= 5; i++) {
          const u = i * 0.16;
          if (obstacleAt(out.x + (_c.x - out.x) * u, out.z + (_c.z - out.z) * u) > -0.06) return false;
        }
        return true;
      };
      let phi = 0; // the angle round the friend from straight behind (radians, + to its right)
      let kk = 0.9;
      let ok = false;
      this.sideHold -= dt;
      const order = this.sideHold > 0 ? [this.side] : [this.side, -this.side];
      // (roomy spots first, so a trunk is not filling the frame; tighter ones if need
      // be; the side it is already on always before the other one)
      for (const sd of order) {
        for (const [k, room] of [[1, 0.9], [0.8, 0.9], [1, 0.35], [0.8, 0.35], [0.62, 0.35]]) {
          if (spot(sd, k, _v, room)) {
            if (sd !== this.side) {
              this.side = sd;
              this.sideHold = 1.5;
            }
            phi = sd * Math.atan2(0.95, 0.25);
            kk = k * Math.hypot(0.95, 0.25);
            ok = true;
            break;
          }
        }
        if (ok) break;
      }
      // (boxed in: straight behind the friend, looking along its way: phi 0)
      // The spot's angle and distance are eased, so changing side sweeps the
      // camera round behind the friend rather than jumping across it
      if (f.phi === undefined || fresh) {
        f.phi = phi;
        f.kk = kk;
        f.vPhi = { v: 0 };
        f.vKk = { v: 0 };
      } else {
        f.phi = smoothDamp(f.phi, phi, f.vPhi, 0.6, dt);
        f.kk = smoothDamp(f.kk, kk, f.vKk, 0.6, dt);
      }
      o.pos.copy(_c).addScaledVector(_f, -Math.cos(f.phi) * d0 * f.kk).addScaledVector(_r, Math.sin(f.phi) * d0 * f.kk);
      o.pos.y = _c.y + d0 * 0.3;
      o.look.copy(_c).addScaledVector(_f, Math.min(0.55, 0.2 + e.speed * 0.5));
      o.look.y = _c.y - 0.02;
      o.fov = tall ? fov + 4 : fov;
      return o;
    }
    // close: in front of the friend and above, the studio side of it
    // (round to the side that has no easel, trunk or post in the way, and stays there)
    const d = clamp((rad * (tall ? 2.4 : 1.7)) / t, 0.9, 2.0);
    const cam = this.camera.position;
    const clear = (a, travel) => {
      const x = _c.x + Math.sin(a) * d * 0.8;
      const z = _c.z + Math.cos(a) * d * 0.9;
      if (obstacleAt(x, z) > -0.3) return false;
      for (let i = 1; i <= 5; i++) {
        const u = i * 0.16;
        if (obstacleAt(x + (_c.x - x) * u, z + (_c.z - z) * u) > -0.05) return false;
      }
      // (and the camera's own way there: it glides in a straight line)
      if (travel) {
        for (let i = 1; i <= 8; i++) {
          const u = i / 9;
          if (obstacleAt(cam.x + (x - cam.x) * u, cam.z + (z - cam.z) * u) > -0.12) return false;
        }
      }
      return true;
    };
    const first = f.az === undefined;
    if (first || !clear(f.az, false)) {
      // (first the side the camera is already on, so it comes in without swinging across the friend)
      const b = Math.atan2(cam.x - _c.x, cam.z - _c.z);
      const order = [b, b + 0.4, b - 0.4, b + 0.8, b - 0.8, 0.7, 1.2, 0.2, 1.7, -0.3, 2.2, -0.8, 2.8, Math.PI, -1.4];
      const pick = order.find((a) => clear(a, true)) ?? order.find((a) => clear(a, false));
      f.az = pick !== undefined ? pick : 0.7;
      if (first) {
        f.azS = f.az;
        f.vAzS = { v: 0 };
      }
    }
    // (if the spot has to change, the camera goes round the friend to it)
    f.azS = smoothDampAngle(f.azS, f.az, f.vAzS, 0.7, dt);
    o.pos.set(_c.x + Math.sin(f.azS) * d * 0.8, _c.y + d * 0.3, _c.z + Math.cos(f.azS) * d * 0.9);
    o.look.copy(_c);
    o.look.y += rad * 0.08;
    o.fov = fov - 4;
    return o;
  }
}
