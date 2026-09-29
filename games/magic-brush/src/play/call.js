// The call: a little bell that brings everybody running. Every friend that
// walks runs to a cheerful group on the lawn in front of the camera, turns to
// face the child, and they all cheer together (with a soft chime and a shower
// of sparkles); then they wander off again. Friends that stay where they are
// (flowers, the sun, a rainbow) turn and cheer from where they stand.
import * as THREE from 'three';
import { rand, clamp } from '../config.js';
import { STAGE } from '../world/world.js';
import { SHAPE } from './bits.js';

const _v = new THREE.Vector3();
const CONFETTI = [[1.5, 0.35, 0.4], [1.6, 1.3, 0.3], [0.4, 1.0, 1.6], [0.5, 1.5, 0.6], [1.3, 0.5, 1.5]];

export class Call {
  constructor(T) {
    this.T = T;
    this.run = null; // { list: [{ e, spot, arrived }], t, phase, at }
  }

  get active() {
    return !!this.run;
  }

  start() {
    const { T } = this;
    if (this.run) return;
    // whoever is free comes (a friend in the middle of a toy drops it)
    const walkers = T.friends.walkers().filter((e) => e.home === 'ground' && !e.friend.trick);
    const others = T.friends.list.filter((e) => !e.leaving && e.home !== 'ground' && e.state !== 'journey' && !e.friend.trick);
    if (!walkers.length && !others.length) return;
    T.snd.chime('call');
    T.gcam.release();
    // in front of the camera: from the middle of the lawn towards where the child is
    const cam = T.camera.position;
    let fx = cam.x - STAGE.x;
    let fz = cam.z - STAGE.z;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    // the row runs across the view
    const rx = fz;
    const rz = -fx;
    const nav = T.friends.nav;
    let cx = STAGE.x + fx * 0.75;
    let cz = STAGE.z + fz * 0.75;
    const near = nav.nearestFree(cx, cz, 0.3);
    if (near) {
      cx = near.x;
      cz = near.z;
    }
    // left to right by where they are now, so nobody crosses over
    walkers.sort((a, b) => a.pos.x * rx + a.pos.z * rz - (b.pos.x * rx + b.pos.z * rz));
    const rowMax = 4;
    const rows = Math.ceil(walkers.length / rowMax);
    const list = [];
    for (let row = 0; row < rows; row++) {
      const chunk = walkers.slice(row * rowMax, (row + 1) * rowMax);
      const width = chunk.reduce((s, e) => s + 2 * this.rad(e) + 0.08, 0);
      let at = -width / 2;
      for (const e of chunk) {
        const w = 2 * this.rad(e) + 0.08;
        const u = at + w / 2;
        at += w;
        // a shallow arc, ends towards the camera; the second row stands behind
        const arc = 0.05 * Math.abs(u) / Math.max(0.3, width / 2);
        let x = cx + rx * u + fx * (arc - row * 0.72);
        let z = cz + rz * u + fz * (arc - row * 0.72);
        if (!nav.free(x, z, 0.12)) {
          const n = nav.nearestFree(x, z, 0.14);
          if (n) {
            x = n.x;
            z = n.z;
          }
        }
        list.push({ e, x, z, arrived: false, ok: false });
      }
    }
    const run = { list, others, t: 0, phase: 'run', at: 0, fx, fz };
    this.run = run;
    for (const c of list) {
      const e = c.e;
      const d = Math.hypot(c.x - e.pos.x, c.z - e.pos.z);
      const ok = T.go(e, 'call', { x: c.x, z: c.z }, { pace: 'run', stopR: 0.04, onArrive: () => (c.arrived = true), onCancel: () => (c.lost = true) });
      c.ok = ok;
      if (!ok || d < 0.1) c.arrived = true;
      T.friends.lookAt(e, null, 0);
    }
    for (const e of others) {
      T.friends.lookAt(e, T.camera.position, 4);
      T.later(rand(0.1, 0.5), () => !e.leaving && T.friends.emote(e, 'hop'));
    }
  }

  rad(e) {
    return clamp(e.friend.restRadius * e.scale * 0.55, 0.12, 0.45);
  }

  update(dt) {
    const run = this.run;
    if (!run) return;
    const { T } = this;
    run.t += dt;
    if (run.phase === 'run') {
      let all = true;
      for (const c of run.list) {
        if (c.lost || !T.friends.list.includes(c.e) || c.e.leaving) continue;
        if (!c.arrived) all = false;
        else {
          // arrived: turn to face the child
          c.e.busy = Math.max(c.e.busy, 0.3);
          c.e.timer = Math.max(c.e.timer, 1);
          T.face(c.e, T.camera.position.x, T.camera.position.z, dt, 5);
        }
      }
      if (all || run.t > 7) this.cheer(run);
    } else if (run.phase === 'cheer') {
      for (const c of run.list) if (T.mine(c.e, 'call') && T.friends.list.includes(c.e)) T.face(c.e, T.camera.position.x, T.camera.position.z, dt, 5);
      if (run.t > run.at + 2.6) this.disperse(run);
    }
  }

  // all together, hooray
  cheer(run) {
    const { T } = this;
    run.phase = 'cheer';
    run.at = run.t;
    T.snd.chime('cheer');
    let mx = 0;
    let mz = 0;
    let n = 0;
    for (const c of run.list) {
      const e = c.e;
      if (c.lost || e.leaving || !T.friends.list.includes(e)) continue;
      T.friends.lookAt(e, T.camera.position, 2.4);
      T.friends.emote(e, 'cheer');
      mx += e.pos.x;
      mz += e.pos.z;
      n++;
    }
    for (const e of run.others) if (!e.leaving) T.friends.emote(e, 'cheer');
    if (!n) return;
    mx /= n;
    mz /= n;
    // a shower of confetti and sparkles over the group
    const k = T.amount(24);
    for (let i = 0; i < k; i++) {
      T.bits.emit(mx + rand(-0.9, 0.9), rand(0.9, 1.4), mz + rand(-0.6, 0.6), rand(-0.1, 0.1), rand(-0.5, -0.2), rand(-0.1, 0.1), CONFETTI[(Math.random() * CONFETTI.length) | 0], rand(0.07, 0.1), rand(1.6, 2.2), Math.random() < 0.25 ? SHAPE.star : SHAPE.confetti, { gravity: -0.2, drag: 1.4, sway: 0.15 });
    }
    T.fx.sparkles.burst(_v.set(mx, 0.35, mz), T.amount(40), { colors: [[1.8, 1.4, 0.8], [1.4, 1.2, 1.9]], speed: 0.9, up: 0.7, size: 0.02, life: 1.4 });
  }

  // the party is over: everybody wanders off
  disperse(run) {
    const { T } = this;
    for (const c of run.list) {
      const e = c.e;
      if (T.mine(e, 'call')) {
        T.done(e);
        T.friends.lookAt(e, null, 0);
        T.friends.release(e);
        // and off to somewhere else on the lawn
        const s = T.friends.stageSpot(e.pos, 0.7);
        T.friends.send(e, s, { pace: 'walk' });
      }
    }
    this.run = null;
  }

  dispose() {
    this.run = null;
  }
}

