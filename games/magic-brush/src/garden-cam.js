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
import * as THREE from 'three';
import { clamp, REDUCED_MOTION } from './config.js';
import { STAGE, obstacleAt } from './world/world.js';

const _c = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class GardenCam {
  constructor({ camera, friends }) {
    this.camera = camera;
    this.friends = friends;
    this.center = new THREE.Vector3(STAGE.x, 0.2, STAGE.z);
    this.radius = 0.9;
    this.time = 0;
    this.focus = null; // { e, kind, until }
    this.out = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 42 };
    this.side = 1; // which side of a friend (its right, +1, or left) the chase camera sits on
    this.sideHold = 0; // seconds before the chase camera may change side again
    this.lastDt = 0;
    this.azOff = 0; // radians the group shot has gone round to clear a prop
    this.azTarget = 0;
    this.clearT = 0;
    this.active = false;
    this.calm = 0; // seconds of plain group shot since the camera last went anywhere
  }

  // rig.avoid: after the camera has glided to where it wants to be, push it out of
  // any tree, post or prop it is cutting a corner through (only for the garden
  // shot, not the leap shots near the easel)
  push = (pos) => {
    if (!this.active) return;
    this.active = false;
    for (let i = 0; i < 3; i++) {
      const d = obstacleAt(pos.x, pos.z);
      if (d < -0.32) return;
      const e = 0.04;
      let gx = obstacleAt(pos.x + e, pos.z) - obstacleAt(pos.x - e, pos.z);
      let gz = obstacleAt(pos.x, pos.z + e) - obstacleAt(pos.x, pos.z - e);
      const l = Math.hypot(gx, gz) || 1;
      gx /= l;
      gz /= l;
      const m = Math.min(0.25, d + 0.36);
      pos.x -= gx * m;
      pos.z -= gz * m;
    }
  };

  // put a friend in focus: 'chase' (running to the garden), 'close' (a tap or a treat).
  // seconds: how long, or 0 to hold until release()
  frame(e, kind = 'close', seconds = 2.5) {
    this.focus = { e, kind, until: seconds ? this.time + seconds : Infinity };
  }

  release() {
    this.focus = null;
  }

  get focused() {
    return this.focus?.e ?? null;
  }

  // the shot for this frame (camera.js follow calls this)
  shot(dt) {
    this.time += dt;
    this.lastDt = dt;
    this.active = true;
    const tall = this.camera.aspect < 0.8;
    const fov = tall ? 56 : 42;
    const f = this.focus;
    if (f && (f.e.leaving || this.time > f.until || !this.friends.list.includes(f.e))) this.focus = null;
    if (this.focus) {
      this.calm = 0;
      return this.focusShot(this.focus, fov, tall);
    }
    // now and then glance up at a friend in the sky, so the sun and rainbow are seen
    this.calm += dt;
    if (this.calm > 12) {
      this.calm = 0;
      const up = this.friends.list.filter((e) => e.home === 'sky' && e.state === 'idle' && !e.leaving);
      if (up.length) {
        this.frame(up[Math.floor(Math.random() * up.length)], 'close', 3.6);
        return this.focusShot(this.focus, fov, tall);
      }
    }
    return this.groupShot(fov, tall, dt);
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
    const tx = cx / wSum;
    const ty = cy / wSum;
    const tz = cz / wSum;
    const k = 1 - Math.exp(-dt * 2.6);
    this.center.x += (tx - this.center.x) * k;
    this.center.y += (Math.max(0.2, ty) - this.center.y) * k;
    this.center.z += (tz - this.center.z) * k;
    let r = 0.7;
    for (const e of list) {
      e.friend.worldCenter(_v);
      r = Math.max(r, Math.hypot(_v.x - this.center.x, (_v.y - this.center.y) * 1.2, _v.z - this.center.z) + e.friend.restRadius * e.scale * 0.8);
    }
    this.radius += (r - this.radius) * k;
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
    this.azOff += (this.azTarget - this.azOff) * (1 - Math.exp(-dt * 1.2));
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
  skyShot(f, rad, t, fov, tall) {
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
    o.pos.set(x, Math.min(1.0, 0.45 + _c.y * 0.2), z);
    o.look.copy(_c);
    o.look.y -= rad * 0.15;
    o.fov = fov;
    return o;
  }

  focusShot(f, fov, tall) {
    const e = f.e;
    const fr = e.friend;
    fr.worldCenter(_c);
    const o = this.out;
    const rad = fr.restRadius * e.scale;
    const t = Math.tan((fov * Math.PI) / 360);
    if (e.home === 'sky') return this.skyShot(f, rad, t, fov, tall);
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
      let ok = false;
      this.sideHold -= this.lastDt;
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
            o.pos.copy(_v);
            ok = true;
            break;
          }
        }
        if (ok) break;
      }
      // (boxed in: straight behind the friend, looking along its way)
      if (!ok) o.pos.copy(_c).addScaledVector(_f, -d0 * 0.9);
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
    if (f.az === undefined) {
      f.az = 0.7;
      // (first the side the camera is already on, so it comes in without swinging across the friend)
      const b = Math.atan2(cam.x - _c.x, cam.z - _c.z);
      const order = [b, b + 0.4, b - 0.4, b + 0.8, b - 0.8, 0.7, 1.2, 0.2, 1.7, -0.3, 2.2, -0.8, 2.8, Math.PI, -1.4];
      const pick = order.find((a) => clear(a, true)) ?? order.find((a) => clear(a, false));
      if (pick !== undefined) f.az = pick;
    } else if (!clear(f.az, false)) f.az = undefined;
    const az = f.az ?? 0.7;
    o.pos.set(_c.x + Math.sin(az) * d * 0.8, _c.y + d * 0.3, _c.z + Math.cos(az) * d * 0.9);
    o.look.copy(_c);
    o.look.y += rad * 0.08;
    o.fov = fov - 4;
    return o;
  }
}
