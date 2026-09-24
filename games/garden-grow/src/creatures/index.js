// The garden's visitors: butterflies, bees, a ladybird, fireflies and the
// luna moth live here; the birds live in ./birds/ and are routed through.
//
//   const creatures = new Creatures({ scene, quality });
//   await creatures.ready;              // birds module loaded
//   creatures.onArrive = (kind) => {};  // a visitor first settles
//   creatures.onChirp = (kind, pos) => {}; // a bird sings
//   creatures.spawn('monarch'); creatures.update(dt, t, world);
//
// `world` = { targets, perches, lawn(x, z) -> y | null, bounds, night, rain, camera }.
import * as THREE from 'three';
import { REDUCED_MOTION } from '../config.js';
import { Butterfly } from './butterfly.js';
import { BUTTERFLY_KINDS, prewarmButterfly } from './butterflies.js';
import { Bee, BEE_KINDS } from './bee.js';
import { Ladybird } from './ladybird.js';
import { Fireflies } from './firefly.js';

const BIRD_KINDS = ['robin', 'blue-tit', 'goldfinch'];
const INSECT_KINDS = [...Object.keys(BUTTERFLY_KINDS), ...Object.keys(BEE_KINDS), 'ladybird', 'firefly'];
const MAX_INSECTS = 28; // a safety cap on flying insects (fireflies apart)
const _c = new THREE.Vector3();

export class Creatures {
  constructor({ scene, quality } = {}) {
    this.scene = scene;
    this.quality = quality || { tier: 'high', creatures: 1, particles: 1 };
    this.group = new THREE.Group();
    this.group.name = 'creatures';
    scene.add(this.group);
    this.insects = [];
    this.counts = {};
    this.camera = null;
    this.onArrive = null;
    this.onChirp = null;
    this.fireflies = new Fireflies(this);
    this.group.add(this.fireflies.object);
    this.birds = null;
    this.birdQueue = [];
    this.kinds = [...INSECT_KINDS, ...BIRD_KINDS];
    // birds are built by another module; load it without holding the garden up
    this.ready = import('./birds/index.js')
      .then((m) => {
        const b = (this.birds = new m.Birds({ scene, quality: this.quality }));
        b.onArrive = (kind) => this.onArrive?.(kind);
        b.onChirp = (kind, pos) => this.onChirp?.(kind, pos);
        for (const k of this.birdQueue) b.spawn(k);
        this.birdQueue.length = 0;
        for (const fill of this.birdModels || []) fill();
        this.birdModels = null;
      })
      .catch((err) => console.warn('Garden birds unavailable:', err));
  }

  get reduced() {
    return REDUCED_MOTION.matches;
  }

  // A visitor arrives gently from off-screen. One call brings one visitor.
  spawn(kind) {
    if (BIRD_KINDS.includes(kind)) {
      if (this.birds) this.birds.spawn(kind);
      else this.birdQueue.push(kind);
      return null;
    }
    if (kind === 'firefly') return this.fireflies.spawn();
    if (this.insects.length >= MAX_INSECTS) return null;
    let c = null;
    if (BUTTERFLY_KINDS[kind]) c = new Butterfly(kind, this);
    else if (BEE_KINDS[kind]) c = new Bee(kind, this);
    else if (kind === 'ladybird') c = new Ladybird(this);
    if (!c) return null;
    // a touch larger than life, so small visitors still read from the
    // garden camera a couple of metres away
    c.object.scale.setScalar(kind === 'ladybird' ? 1.5 : 1.4);
    c.enter(this.camera);
    this.group.add(c.object);
    this.insects.push(c);
    this.counts[kind] = (this.counts[kind] || 0) + 1;
    return c;
  }

  count(kind) {
    if (kind === 'firefly') return this.fireflies.count;
    if (BIRD_KINDS.includes(kind)) return this.birds ? this.birds.count(kind) : this.birdQueue.filter((k) => k === kind).length;
    return this.counts[kind] || 0;
  }

  // Everyone (or the given kinds) flies away gently, e.g. for rain.
  leaveAll(kinds) {
    const want = (k) => !kinds || kinds.includes(k);
    for (const c of this.insects) if (want(c.kind)) c.leave();
    if (want('firefly')) this.fireflies.leaveAll();
    if (!kinds || kinds.some((k) => BIRD_KINDS.includes(k))) {
      this.birds?.leaveAll(kinds);
      if (this.birdQueue.length) this.birdQueue = this.birdQueue.filter((k) => !want(k));
    }
  }

  // Everyone vanishes at once (after a shader warm-up, or a new garden).
  clear() {
    for (const c of this.insects) this.group.remove(c.object);
    this.insects.length = 0;
    this.counts = {};
    this.fireflies.clear();
    this.birdQueue.length = 0;
    this.birds?.clear?.();
  }

  update(dt, t, world) {
    if (world.camera) this.camera = world.camera;
    const list = this.insects;
    for (let k = 0; k < list.length; k++) list[k].update(dt, t, world);
    for (let k = list.length - 1; k >= 0; k--) {
      const c = list[k];
      if (!c.dead) continue;
      this.group.remove(c.object);
      list.splice(k, 1);
      this.counts[c.kind]--;
    }
    this.fireflies.update(dt, t, world);
    this.birds?.update(dt, t, world);
  }

  // The visitor under a tap (generous spheres for small fingers), or null.
  pick(raycaster) {
    const ray = raycaster.ray;
    let best = null;
    let bestT = Infinity;
    for (const c of this.insects) {
      if (c.dead || c.purpose === 'leave') continue;
      const r = Math.max(0.08, c.radius || 0);
      if (ray.distanceSqToPoint(c.pos) > r * r) continue;
      const t = _c.subVectors(c.pos, ray.origin).dot(ray.direction);
      if (t > 0 && t < bestT) {
        bestT = t;
        best = c;
      }
    }
    const f = this.fireflies.pick(ray);
    if (f && f.t < bestT) {
      bestT = f.t;
      best = f.fly;
    }
    const b = this.birds?.pick(raycaster);
    if (b) {
      const p = b.pos || b.object?.position;
      const t = p ? _c.subVectors(p, ray.origin).dot(ray.direction) : 0;
      if (!best || t < bestT) best = b;
    }
    return best;
  }

  // Tapped: a happy flutter or loop, never fear.
  poke(c) {
    if (!c) return;
    if (c.host === this && c.poke) c.poke();
    else if (c.kind === 'firefly') this.fireflies.poke(c);
    else this.birds?.poke(c);
  }

  // A posed, still model for the visitors-book portrait: real size, centred
  // on the origin, best seen from +z; userData.radius is its bounding radius.
  model(kind) {
    const out = new THREE.Group();
    out.name = kind + '-portrait';
    if (BIRD_KINDS.includes(kind)) {
      const fill = () => {
        const m = this.birds?.model(kind);
        if (m) {
          out.add(m);
          out.userData.radius = m.userData?.radius ?? new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere()).radius;
        }
      };
      if (this.birds) fill();
      else (this.birdModels ||= []).push(fill);
      return out;
    }
    let inner = null;
    if (BUTTERFLY_KINDS[kind]) inner = new Butterfly(kind, { quality: this.quality }, { still: true }).portrait();
    else if (BEE_KINDS[kind]) inner = new Bee(kind, { quality: this.quality }, { still: true }).portrait();
    else if (kind === 'ladybird') inner = new Ladybird({ quality: this.quality }, { still: true }).portrait();
    else if (kind === 'firefly') inner = this.fireflies.portrait();
    if (!inner) return out;
    out.add(inner);
    out.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const centre = box.getCenter(new THREE.Vector3());
    inner.position.sub(centre);
    out.userData.radius = box.getSize(new THREE.Vector3()).length() / 2;
    return out;
  }

  // Paints wing textures ahead of time, one species per idle moment.
  prewarm(kinds = Object.keys(BUTTERFLY_KINDS)) {
    const queue = kinds.filter((k) => BUTTERFLY_KINDS[k]);
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
    const step = () => {
      const k = queue.shift();
      if (!k) return;
      prewarmButterfly(k, this.quality);
      idle(step);
    };
    idle(step);
  }

  // is this landing spot held by another visitor?
  taken(t, self) {
    for (const c of this.insects) {
      if (c === self || !c.tgtPlant || c.purpose === 'leave') continue;
      if (c.tgtPlant === t.plant && c.tgtPos.distanceToSquared(t.pos) < 0.0009) return true;
    }
    return false;
  }

  // an individual has settled for the first time
  settle(c) {
    this.onArrive?.(c.kind);
  }
}
