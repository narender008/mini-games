// Snacks: a glowing star-berry drops out of the sky near a friend (or where
// the child taps next). The nearest friend runs over and eats it in three
// nibbles, the berry shrinking with each, with a happy chirp at the end; a
// friend that cannot eat (the car, the rocket) collects it and cheers instead.
// Now and then a second friend comes to share, and a fresh little berry pops
// out for it.
//
// The berry is a puffy extruded star with a leaf, glossy and glowing warm, that
// turns and bobs a little above the grass until it is eaten.
import * as THREE from 'three';
import { STAGE } from '../world/world.js';
import { rand, damp, REDUCED_MOTION } from '../config.js';
import { blobTexture, starShape } from './art.js';

const MAX = 3;
const NO_EAT = new Set(['car', 'rocket', 'boat']);
const CRUMBS = [[1.8, 0.7, 1.0], [1.9, 1.5, 0.7], [1.5, 1.2, 1.9]];
const BITES = [0.5, 0.9, 1.3]; // seconds into the meal
const MEAL = 1.7;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Snack {
  constructor(T) {
    this.T = T;
    // the berry: a rounded star puffed out with a bevel, a leaf, and a glow
    const geo = new THREE.ExtrudeGeometry(starShape(0.046, 0.026), { depth: 0.022, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 5, curveSegments: 8 });
    geo.center();
    this.geo = geo;
    this.mat = new THREE.MeshPhysicalMaterial({ color: 0xff4d8a, emissive: 0xff2d6f, emissiveIntensity: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    this.leafGeo = new THREE.SphereGeometry(0.014, 12, 8);
    this.leafMat = new THREE.MeshStandardMaterial({ color: 0x5cc85a, emissive: 0x2c8a2a, emissiveIntensity: 0.4, roughness: 0.5 });
    this.glowTex = blobTexture();
    this.blobTex = blobTexture();
    this.list = [];
    for (let i = 0; i < MAX; i++) this.list.push(this.makeBerry());
  }

  makeBerry() {
    const { T } = this;
    const group = new THREE.Group();
    const inner = new THREE.Group();
    const star = new THREE.Mesh(this.geo, this.mat);
    star.castShadow = true;
    const leaf = new THREE.Mesh(this.leafGeo, this.leafMat);
    leaf.scale.set(1.9, 0.4, 0.9);
    leaf.position.set(0.012, 0.05, 0.004);
    leaf.rotation.z = -0.5;
    inner.add(star, leaf);
    group.add(inner);
    group.visible = false;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.glowTex, color: new THREE.Color(2.0, 0.9, 0.9), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.renderOrder = 5;
    group.add(glow);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.blobTex, color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    blob.visible = false;
    blob.renderOrder = -1;
    T.scene.add(group, blob);
    return { group, inner, glow, blob, on: false, state: 'idle', pos: new THREE.Vector3(), vy: 0, t: 0, scale: 1, target: 1, size: 1, bites: 0, eater: null, sharer: null, age: 0, sparkT: 0, ground: 0, retry: 1 };
  }

  warm(on) {
    for (const b of this.list) {
      b.group.visible = on || b.on;
      b.blob.visible = on || b.on;
    }
  }

  // ------------------------------------------------------------ dropping

  // a berry falls onto (x, z); size 1 is a whole berry
  spawn(x, z, size = 1.45, fromY = 1.0) {
    let b = this.list.find((o) => !o.on);
    if (!b) return null;
    const { T } = this;
    b.on = true;
    b.state = 'fall';
    b.size = size;
    b.pos.set(x, T.groundAt(x, z) + fromY, z);
    b.ground = T.groundAt(x, z);
    b.vy = 0;
    b.t = 0;
    b.age = 0;
    b.scale = 0.01;
    b.target = 1;
    b.bites = 0;
    b.eater = null;
    b.sharer = null;
    b.group.visible = true;
    b.blob.visible = true;
    return b;
  }

  // a tap with the snack toy: a berry lands there (on the lawn, clear of props)
  dropAt(x, z) {
    const { T } = this;
    const nav = T.friends.nav;
    if (!nav.free(x, z, 0.06)) {
      const near = nav.nearestFree(x, z, 0.1);
      if (!near || Math.hypot(near.x - x, near.z - z) > 1.0) return false;
      x = near.x;
      z = near.z;
    }
    this.spawn(x, z);
    return true;
  }

  // the snack button: a berry drops in front of a friend
  dropNearFriend() {
    const { T } = this;
    let who = null;
    let n = 0;
    for (const e of T.friends.list) if (!e.leaving && e.home === 'ground' && e.friend.walkSpeed > 0 && e.state !== 'journey') if (Math.random() < 1 / ++n) who = e;
    if (!who) {
      this.dropAt(STAGE.x + rand(-0.4, 0.4), STAGE.z + rand(-0.3, 0.3));
      return;
    }
    const rr = who.friend.restRadius * who.scale;
    for (let i = 0; i < 12; i++) {
      const a = who.heading + rand(-0.9, 0.9);
      const d = rr * 0.9 + rand(0.4, 0.8);
      const x = who.pos.x + Math.sin(a) * d;
      const z = who.pos.z + Math.cos(a) * d;
      if (T.friends.nav.free(x, z, 0.1)) {
        this.spawn(x, z);
        return;
      }
    }
    this.dropAt(who.pos.x + 0.4, who.pos.z + 0.4);
  }

  // ------------------------------------------------------------ the eaters

  // the berry has landed: a friend runs over
  summon(b) {
    const { T } = this;
    T.snd.drop();
    T.fx.sparkles.burst(_v.copy(b.pos), T.amount(16), { colors: CRUMBS, speed: 0.5, up: 0.4, size: 0.016, life: 0.9 });
    // flowers, the sun and the rest that cannot go to it look at it
    for (const e of T.friends.list) {
      if (e.leaving || e.home === 'ground' || e.state === 'journey' || e.friend.trick) continue;
      T.friends.lookAt(e, b.pos, 2.2);
      if (Math.random() < 0.6) T.later(rand(0.2, 0.9), () => !e.leaving && !e.friend.trick && T.friends.emote(e, 'giggle'));
    }
    const eater = this.pickEater(b, null);
    if (!eater) return;
    b.eater = eater;
    this.send(b, eater, false);
    // sometimes a second friend comes to share
    if (Math.random() < 0.65) {
      const other = this.pickEater(b, eater);
      if (other) {
        b.sharer = other;
        this.send(b, other, true);
      }
    }
  }

  // the nearest free friend that walks
  pickEater(b, not) {
    const { T } = this;
    let best = null;
    let bd = 6.5;
    for (const e of T.freeWalkers()) {
      if (e === not) continue;
      const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // run to the berry (or, for a sharer, to the far side of it)
  send(b, e, share) {
    const { T } = this;
    const rr = e.friend.restRadius * e.scale;
    let to = b.pos;
    let stopR = rr * 0.5 + 0.08;
    if (share && b.eater) {
      // stand a little way off, on the side away from the first friend
      const ex = b.pos.x - b.eater.pos.x;
      const ez = b.pos.z - b.eater.pos.z;
      const l = Math.hypot(ex, ez) || 1;
      const off = rr + b.eater.friend.restRadius * b.eater.scale * 0.6 + 0.1;
      const side = Math.random() < 0.5 ? 1 : -1;
      for (const s of [side, -side]) {
        const x = b.pos.x + (-ez / l) * s * off + (ex / l) * 0.1;
        const z = b.pos.z + (ex / l) * s * off + (ez / l) * 0.1;
        if (T.friends.nav.free(x, z, 0.1)) {
          to = _w.set(x, 0, z);
          break;
        }
      }
      stopR = 0.06;
    }
    const d = Math.hypot(to.x - e.pos.x, to.z - e.pos.z);
    const dest = { x: to.x, z: to.z };
    const ok = T.go(e, 'snack', dest, {
      pace: d > 1.2 ? 'run' : 'walk',
      stopR,
      onArrive: (en) => (share ? this.shared(b, en) : this.arrive(b, en)),
      onCancel: () => {
        if (b.eater === e) b.eater = null;
        if (b.sharer === e) b.sharer = null;
      },
    });
    if (!ok) {
      if (b.eater === e) b.eater = null;
      if (b.sharer === e) b.sharer = null;
    }
  }

  // the first friend is at the berry
  arrive(b, e) {
    if (!b.on || b.state !== 'wait' || b.eater !== e) {
      this.T.done(e);
      return;
    }
    this.eat(b, e);
  }

  // a second friend is beside the first: a fresh little berry pops out for it
  shared(b, e) {
    const { T } = this;
    if (b.sharer !== e) return;
    b.sharer = null;
    const rr = e.friend.restRadius * e.scale;
    const x = e.pos.x + Math.sin(e.heading) * (rr * 0.5 + 0.08);
    const z = e.pos.z + Math.cos(e.heading) * (rr * 0.5 + 0.08);
    const nb = this.spawn(x, z, 1.15, 0.22);
    if (!nb) {
      T.done(e);
      T.friends.release(e);
      return;
    }
    nb.eater = e;
    T.snd.share();
    T.fx.sparkles.burst(_v.set(x, nb.pos.y, z), T.amount(16), { colors: CRUMBS, speed: 0.5, up: 0.4, size: 0.016, life: 0.9 });
    nb.state = 'wait';
    nb.age = 0;
    this.eat(nb, e);
  }

  eat(b, e) {
    const { T } = this;
    const id = e.friend.info.id;
    b.state = 'eat';
    b.t = 0;
    b.bites = 0;
    b.eater = e;
    if (NO_EAT.has(id)) {
      // it cannot eat: it collects the berry, a stream of sparkles flowing into it
      b.state = 'collect';
      T.friends.emote(e, 'cheer');
      T.direct(e, 'close', 3);
      return;
    }
    T.friends.emote(e, 'eat', MEAL);
    T.direct(e, 'close', 3.2);
    T.friends.lookAt(e, b.pos, 2);
  }

  finish(b) {
    const { T } = this;
    const e = b.eater;
    b.on = false;
    b.group.visible = false;
    b.blob.visible = false;
    if (e && T.mine(e, 'snack') && T.friends.list.includes(e)) {
      T.hearts(e, 2);
      T.snd.chirp();
      T.fx.sparkles.burst(T.head(e, _v, 0.3), T.amount(18), { colors: CRUMBS, speed: 0.6, up: 0.5, size: 0.017, life: 1 });
      T.friends.lookAt(e, null, 0);
      T.later(0.35, () => {
        if (T.mine(e, 'snack')) {
          T.done(e);
          T.friends.release(e);
        }
      });
    }
    b.eater = null;
  }

  // ------------------------------------------------------------ the frame

  update(dt) {
    const { T } = this;
    for (const b of this.list) {
      if (!b.on) continue;
      b.age += dt;
      b.t += dt;
      const p = b.pos;
      if (b.state === 'fall') {
        b.vy -= 7 * dt;
        p.y += b.vy * dt;
        b.scale = Math.min(1, b.scale + dt * 6);
        const rest = b.ground + 0.075;
        if (p.y <= rest) {
          p.y = rest;
          if (b.vy < -1.2) b.vy = -b.vy * 0.28;
          else {
            b.vy = 0;
            b.state = 'wait';
            b.age = 0;
            this.summon(b);
          }
        }
      } else if (b.state === 'wait') {
        p.y = b.ground + 0.075 + Math.sin(b.age * 3) * 0.012;
        b.sparkT -= dt;
        if (b.sparkT <= 0) {
          b.sparkT = rand(0.18, 0.32);
          T.fx.sparkles.emit(p.x + rand(-0.04, 0.04), p.y + rand(0, 0.06), p.z + rand(-0.04, 0.04), 0, rand(0.05, 0.12), 0, CRUMBS[(Math.random() * 3) | 0], rand(0.008, 0.016), rand(0.6, 1.0), { gravity: 0 });
        }
        // nobody came: it fades away in a twinkle
        if (b.age > 16) {
          b.state = 'fade';
          b.t = 0;
        }
        // a berry with no eater yet may find one when a friend frees up
        if (!b.eater && (b.retry -= dt) <= 0) {
          b.retry = 1;
          const eater = this.pickEater(b, null);
          if (eater) {
            b.eater = eater;
            this.send(b, eater, false);
          }
        }
      } else if (b.state === 'eat') {
        p.y = b.ground + 0.075 + 0.02 * Math.sin(b.t * 24) * (b.target < 1 ? 1 : 0);
        const next = BITES[b.bites];
        if (next !== undefined && b.t >= next) {
          b.bites++;
          b.target = 1 - b.bites / 3;
          T.snd.munch();
          T.fx.sparkles.burst(_v.set(p.x, p.y, p.z), T.amount(6), { colors: CRUMBS, speed: 0.35, up: 0.3, size: 0.011, life: 0.6 });
        }
        if (b.t >= MEAL - 0.05) this.finish(b);
      } else if (b.state === 'collect') {
        // sparkles stream into the friend; the berry shrinks into it
        const e = b.eater;
        if (e && T.friends.list.includes(e)) {
          T.head(e, _v, 0.2);
          if (Math.random() < 0.9) T.fx.sparkles.emit(p.x, p.y, p.z, rand(-0.1, 0.1), rand(0.1, 0.3), rand(-0.1, 0.1), CRUMBS[(Math.random() * 3) | 0], rand(0.012, 0.022), 0.9, { gravity: 0, target: _v, pull: 6 });
          b.target = Math.max(0, 1 - b.t / 0.8);
          p.y = damp(p.y, _v.y, 3, dt);
          p.x = damp(p.x, _v.x, 3, dt);
          p.z = damp(p.z, _v.z, 3, dt);
        } else b.target = 0;
        if (b.t >= 1.0) {
          T.snd.chime('cheer');
          this.finish(b);
        }
      } else if (b.state === 'fade') {
        b.target = Math.max(0, 1 - b.t / 0.7);
        if (b.t >= 0.7) {
          T.fx.sparkles.burst(_v.copy(p), T.amount(14), { colors: CRUMBS, speed: 0.4, up: 0.4, size: 0.014, life: 0.8 });
          b.on = false;
          b.group.visible = false;
          b.blob.visible = false;
          if (b.eater && T.mine(b.eater, 'snack')) {
            T.done(b.eater);
            T.friends.release(b.eater);
          }
          continue;
        }
      }
      // shrinks with each bite, springs back a little: a smooth chase of the target
      b.scale = damp(b.scale, b.target, 14, dt);
      const s = b.size * Math.max(0.001, b.scale);
      const bob = REDUCED_MOTION.matches ? 0 : Math.sin(b.age * 2.2) * 0.1;
      b.group.position.copy(p);
      b.group.scale.setScalar(s);
      b.inner.rotation.set(-0.3, b.age * 1.3 + bob, 0.08 * Math.sin(b.age * 2));
      const gl = 0.55 + 0.25 * Math.sin(b.age * 4);
      b.glow.material.opacity = b.state === 'fall' ? 0.25 : gl * Math.min(1, b.scale);
      b.glow.scale.setScalar(0.22);
      b.glow.quaternion.copy(T.camera.quaternion);
      const h = p.y - b.ground;
      b.blob.position.set(p.x, b.ground + 0.004, p.z);
      const bs = 0.11 * s + h * 0.05;
      b.blob.scale.set(bs, 1, bs);
      b.blob.material.opacity = 0.32 / (1 + h * 3) * Math.min(1, b.scale);
    }
  }

  dispose() {
    for (const b of this.list) {
      b.group.removeFromParent();
      b.blob.removeFromParent();
      b.glow.geometry.dispose();
      b.glow.material.dispose();
      b.blob.geometry.dispose();
      b.blob.material.dispose();
    }
    this.geo.dispose();
    this.mat.dispose();
    this.leafGeo.dispose();
    this.leafMat.dispose();
    this.glowTex.dispose();
    this.blobTex.dispose();
  }
}

