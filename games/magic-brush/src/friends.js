// Friends at play in the world. Each friend wanders the garden and the
// front of the studio on its own: it picks a spot, turns towards it (slowing
// to turn, like an animal does), trots there, and stops to look around, at
// you or at another friend. Friends keep a polite distance from each other
// and stay out of the pond, the trees and the easel. A tap on a friend makes
// it stop, turn to you and do one of its tricks. Only so many friends play
// at once (by device); when one more arrives, the friend who has played
// longest waves goodbye in a puff of sparkles and goes back to the shelf.
import * as THREE from 'three';
import { clamp, rand, angleDiff, damp, pick } from './config.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Friends {
  constructor({ scene, fx, audio, quality, walkable, groundAt }) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.q = quality;
    this.walkable = walkable;
    this.groundAt = groundAt;
    this.list = [];
    this.onLeave = null;
  }

  get cap() {
    return this.q.active;
  }

  // a friend that has just come alive (or come back from the shelf)
  add(friend, record, { x, z, heading = 0, fresh = true } = {}) {
    const e = {
      friend,
      record,
      pos: new THREE.Vector3(x, this.groundAt(x, z), z),
      heading,
      speed: 0,
      state: 'idle',
      timer: fresh ? 1.4 : rand(0.5, 2),
      target: new THREE.Vector3(),
      trickIndex: 0,
      born: performance.now(),
      lookTimer: 0,
      leaving: 0,
    };
    friend.object.position.copy(e.pos);
    friend.object.rotation.set(0, heading, 0);
    if (!friend.object.parent) this.scene.add(friend.object);
    this.list.push(e);
    // over the limit: the friend who has played longest goes to the shelf
    const playing = this.list.filter((x) => !x.leaving);
    if (playing.length > this.cap) {
      const oldest = playing.filter((x) => x !== e).sort((a, b) => a.born - b.born)[0];
      if (oldest) this.leave(oldest);
    }
    return e;
  }

  leave(e) {
    e.leaving = 0.001;
    e.state = 'leaving';
    e.friend.startTrick('bye', 1.2);
  }

  has(record) {
    return this.list.some((e) => e.record === record || (e.record && record && e.record.id === record.id));
  }

  clear() {
    for (const e of this.list) {
      this.scene.remove(e.friend.object);
      e.friend.dispose();
    }
    this.list = [];
  }

  // screen-space tap: the friend under (x, y) px, if any
  pick(x, y, camera, view) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.list) {
      if (e.leaving) continue;
      const f = e.friend;
      const c = f.bounds.getCenter(_v);
      f.object.localToWorld(c);
      _w.copy(c).project(camera);
      if (_w.z > 1) continue;
      const sx = (_w.x * 0.5 + 0.5) * view.w;
      const sy = (-_w.y * 0.5 + 0.5) * view.h;
      const dist = camera.position.distanceTo(c);
      const rpx = ((f.restRadius * f.object.scale.x) / (dist * Math.tan((camera.fov * Math.PI) / 360))) * (view.h / 2);
      const d = Math.hypot(x - sx, y - sy);
      if (d < rpx * 1.05 + 24 && d / rpx < bestD) {
        bestD = d / rpx;
        best = e;
      }
    }
    return best;
  }

  // a tap: stop, turn to face the camera, do the next trick
  play(e, camera) {
    const f = e.friend;
    if (f.trick) return;
    const tricks = f.tricks;
    const name = tricks[e.trickIndex % tricks.length];
    e.trickIndex++;
    e.state = 'trick';
    e.speed = 0;
    e.faceCamera = true;
    f.startTrick(name, f.trickLength(name));
    this.audio.tap?.();
  }

  update(dt, t, camera) {
    const n = this.list.length;
    for (let i = n - 1; i >= 0; i--) {
      const e = this.list[i];
      const f = e.friend;
      if (e.leaving) {
        e.leaving += dt;
        const k = clamp((e.leaving - 0.8) / 0.6, 0, 1);
        f.object.scale.setScalar(Math.max(0.001, 1 - k));
        if (k > 0 && !e.poofed) {
          e.poofed = true;
          this.fx.sparkles.burst(_v.copy(e.pos).setY(e.pos.y + 0.15), 50, { colors: [[1.8, 1.4, 0.8], [1.4, 1.2, 1.9]], speed: 0.9, up: 0.5 });
          this.audio.poof?.();
        }
        if (k >= 1) {
          this.scene.remove(f.object);
          f.dispose();
          this.list.splice(i, 1);
          this.onLeave?.(e);
          continue;
        }
      } else this.think(e, dt, t, camera);
      // move
      const fwdX = Math.sin(e.heading);
      const fwdZ = Math.cos(e.heading);
      e.pos.x += fwdX * e.speed * dt;
      e.pos.z += fwdZ * e.speed * dt;
      // stay apart from other friends
      for (const o of this.list) {
        if (o === e) continue;
        const dx = e.pos.x - o.pos.x;
        const dz = e.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        const want = (f.restRadius + o.friend.restRadius) * 0.8;
        if (d < want && d > 1e-4) {
          const push = (want - d) * 2.5 * dt;
          e.pos.x += (dx / d) * push;
          e.pos.z += (dz / d) * push;
        }
      }
      e.pos.y = damp(e.pos.y, this.groundAt(e.pos.x, e.pos.z), 12, dt);
      f.object.position.copy(e.pos);
      f.object.rotation.set(0, e.heading, 0);
      f.motion.speed = e.speed;
      f.update(dt, camera);
      for (const ev of f.events) this.onEvent(e, ev);
      f.events.length = 0;
    }
  }

  think(e, dt, t, camera) {
    const f = e.friend;
    const maxSpeed = f.walkSpeed ?? 0.28;
    let want = 0;
    let desired = e.heading;
    if (e.state === 'trick') {
      if (e.faceCamera) desired = Math.atan2(camera.position.x - e.pos.x, camera.position.z - e.pos.z);
      f.look = camera.position;
      if (!f.trick) {
        e.state = 'idle';
        e.timer = rand(1.5, 3);
        e.faceCamera = false;
      }
    } else if (e.state === 'idle') {
      e.timer -= dt;
      e.lookTimer -= dt;
      if (e.lookTimer <= 0) {
        e.lookTimer = rand(1.5, 4);
        const r = Math.random();
        if (r < 0.45) f.look = camera.position;
        else if (r < 0.75 && this.list.length > 1) {
          const other = pick(this.list.filter((x) => x !== e));
          f.look = other.friend.object.position;
        } else f.look = null;
      }
      if (e.timer <= 0) this.wander(e);
    } else if (e.state === 'walk') {
      const dx = e.target.x - e.pos.x;
      const dz = e.target.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      desired = Math.atan2(dx, dz);
      f.look = null;
      want = maxSpeed * clamp(d / 0.4, 0.3, 1);
      if (d < 0.12) {
        e.state = 'idle';
        e.timer = rand(2, 6);
      }
      e.timer -= dt;
      if (e.timer <= -12) {
        e.state = 'idle';
        e.timer = rand(1, 2);
      }
    }
    // outside the play area: head back in
    if (this.walkable(e.pos.x, e.pos.z) > -0.05 && e.state === 'walk') {
      desired = Math.atan2(-0.3 - e.pos.x, -2.5 - e.pos.z);
    }
    const diff = angleDiff(e.heading, desired);
    const turnRate = 2.4;
    e.heading += clamp(diff, -turnRate * dt, turnRate * dt);
    // slow down while turning hard
    const align = clamp(1 - Math.abs(diff) / 1.2, 0.15, 1);
    e.speed = damp(e.speed, want * align, 4, dt);
  }

  wander(e) {
    for (let tries = 0; tries < 20; tries++) {
      const x = e.pos.x + rand(-2, 2);
      const z = e.pos.z + rand(-2, 2);
      if (this.walkable(x, z) < -0.25) {
        e.target.set(x, 0, z);
        e.state = 'walk';
        e.timer = 0;
        return;
      }
    }
    e.target.set(-0.3 + rand(-1, 1), 0, -2.5 + rand(-1, 1));
    e.state = 'walk';
  }

  onEvent(e, ev) {
    const f = e.friend;
    if (ev.type === 'sound') this.audio.creature?.(f.info.id, ev.name);
    else if (ev.type === 'puff') {
      const dir = _w.copy(ev.dir).sub(ev.at).normalize();
      const colors = f.sparkleColors || [[1.8, 1.5, 0.8], [0.9, 1.4, 2.0], [1.6, 0.9, 1.9]];
      this.fx.sparkles.burst(ev.at, 90, { colors, speed: 1.6, size: 0.022, dir: dir.multiplyScalar(1.4), spread: 0.6, up: 0.1, life: 1.6, gravity: -0.1 });
    } else if (ev.type === 'land') {
      this.fx.sparkles.burst(ev.at.setY(this.groundAt(ev.at.x, ev.at.z) + 0.02), 18, { colors: [[1.6, 1.4, 1]], speed: 0.6, up: 0.4, size: 0.015 });
    }
  }
}
