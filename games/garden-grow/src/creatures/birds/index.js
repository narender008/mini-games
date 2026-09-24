// Garden birds: robin, blue tit and goldfinch. They fly in from off-screen,
// land on a fence post, planter rim or the lawn (robins like the freshly dug
// soil of the bed), potter about for a while and fly off again. Never at
// night, and they leave when it rains. At most three at a time.
//
// Built per species on first use (shape, textures, materials) and shared by
// every bird of that kind; each bird is a light joint rig (rig.js) driven by
// its behaviour (brain.js).
import * as THREE from 'three';
import { LAYOUTS, inZone } from '../../layout.js';
import { SPECIES, KINDS } from './species.js';
import { SpeciesAssets } from './rig.js';
import { Bird } from './brain.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ndc = new THREE.Vector3();
const _q = new THREE.Vector3();

export class Birds {
  constructor({ scene, quality } = {}) {
    this.scene = scene;
    this.quality = quality || {};
    this.kinds = KINDS.slice();
    this.assets = {};
    this.birds = [];
    this.pool = [];
    this.onArrive = null;
    this.onChirp = null;
    this.world = null; // the last world passed to update
    this.layout = null; // the garden style in use, recognised from the ground
    this.max = (this.quality.creatures ?? 1) < 0.7 ? 2 : 3;
    this.ready = Promise.resolve();
  }

  asset(kind) {
    if (!this.assets[kind]) {
      const tier = this.quality.tier;
      this.assets[kind] = new SpeciesAssets(SPECIES[kind], { detail: tier === 'low' ? 0.6 : tier === 'medium' ? 0.8 : 1 });
    }
    return this.assets[kind];
  }

  // ---------------------------------------------------------------- visitors

  spawn(kind) {
    if (!SPECIES[kind]) return null;
    const w = this.world;
    if (w && (w.night > 0.5 || w.rain > 0.3)) return null;
    if (this.birds.filter((b) => !b.leaving).length >= this.max) return null;
    this.layout = this.findLayout(w?.lawn);
    const bird = this.take(kind);
    const spot = this.pickSpot(bird);
    const start = this.entry(spot.pos);
    bird.arrive(start, spot.pos, spot.ground, w || {});
    bird.update(0, w || {});
    this.birds.push(bird);
    return bird;
  }

  take(kind) {
    const i = this.pool.findIndex((b) => b.kind === kind);
    let bird;
    if (i >= 0) bird = this.pool.splice(i, 1)[0];
    else {
      bird = new Bird(this.asset(kind), { shadows: this.quality.shadows !== false });
      bird.onChirp = (b) => {
        if (this.onChirp) this.onChirp(b.kind, b.rig.head.getWorldPosition(b.headW));
      };
      bird.crowded = (b, x, z) => this.crowded(b, x, z);
      // hop only over open ground the camera can see (not into the grass)
      bird.groundOk = (b, x, y, z) => this.openGround(x, y, z) && !this.nearPlant(this.world?.targets || [], x, z) && this.inView(_p.set(x, y, z), b);
    }
    this.scene.add(bird.object);
    return bird;
  }

  count(kind) {
    let n = 0;
    for (const b of this.birds) if (b.kind === kind && !b.leaving) n++;
    return n;
  }

  leaveAll(kinds) {
    for (const b of this.birds) if (!kinds || kinds.includes(b.kind)) this.leave(b);
  }

  leave(b) {
    if (b.leaving) return;
    if (b.state === 'perch') b.depart(this.exit(b.pos));
    else {
      // still arriving: turn away and leave by the nearest side
      b.leaving = true;
      b.next = 'out';
      _v.copy(b.pos);
      const e = this.exit(b.pos);
      _w.lerpVectors(_v, e, 0.3);
      _w.y = Math.min(1.75, _w.y + 0.3);
      _p.lerpVectors(_v, e, 0.7);
      b.path.set(_v, _w, _p, e);
      b.s = 0;
      b.state = 'fly';
    }
  }

  clear() {
    for (const b of this.birds) this.release(b);
    this.birds.length = 0;
  }

  release(b) {
    b.state = 'gone';
    this.scene.remove(b.object);
    this.pool.push(b);
  }

  // ---------------------------------------------------------------- places

  // Where a new bird will land: a perch, or the lawn (robins near the bed).
  pickSpot(bird) {
    const w = this.world || {};
    const bh = bird.sp.behaviour;
    const perches = (w.perches || []).filter((p) => this.perchOk(p));
    const wantGround = !perches.length || Math.random() < bh.ground;
    if (wantGround) {
      const g = this.groundSpot(bird, w);
      if (g) return { pos: g, ground: true };
    }
    if (perches.length) {
      const p = perches[Math.floor(Math.random() * perches.length)];
      return { pos: p.pos.clone(), ground: false };
    }
    const g = this.groundSpot(bird, w);
    return { pos: g || new THREE.Vector3(0.6, 0, 0.5), ground: true };
  }

  perchOk(p) {
    if (!p || !p.pos) return false;
    if (p.normal && p.normal.y < 0.7) return false;
    if (!this.inBounds(p.pos.x, p.pos.z, -0.1) || p.pos.y > 1.6) return false;
    if (this.crowded(null, p.pos.x, p.pos.z, 0.14)) return false;
    return this.inView(p.pos, null);
  }

  groundSpot(bird, w) {
    const lawn = w.lawn;
    if (!lawn) return null;
    const soil = bird.sp.behaviour.soil;
    const targets = w.targets || [];
    const zones = this.layout ? this.layout.zones : [];
    for (let tries = 0; tries < 32; tries++) {
      let x;
      let z;
      const r = Math.random();
      if (targets.length && r < soil * 0.6) {
        // near a plant: the dug and watered soil round it
        const t = targets[Math.floor(Math.random() * targets.length)];
        const a = Math.random() * Math.PI * 2;
        const d = 0.1 + Math.random() * 0.14;
        x = t.pos.x + Math.cos(a) * d;
        z = t.pos.z + Math.sin(a) * d;
      } else if (zones.length && r < 0.85) {
        // anywhere in a bed, planter or pot
        const zn = zones[Math.floor(Math.random() * zones.length)];
        if (zn.shape === 'circle') {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * zn.r * 0.7;
          x = zn.cx + Math.cos(a) * d;
          z = zn.cz + Math.sin(a) * d;
        } else if (zn.shape === 'rect') {
          x = zn.cx + (Math.random() - 0.5) * (zn.w - 0.08);
          z = zn.cz + (Math.random() - 0.5) * (zn.d - 0.08);
        } else {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * 0.85;
          x = zn.cx + Math.cos(a) * d * zn.rx;
          z = zn.cz + Math.sin(a) * d * zn.rz;
        }
      } else {
        const b = w.bounds || { x0: -2, x1: 2, z0: -1.8, z1: 1 };
        x = b.x0 + 0.3 + Math.random() * (b.x1 - b.x0 - 0.6);
        z = b.z0 + 0.3 + Math.random() * (b.z1 - b.z0 - 0.6);
      }
      if (!this.inBounds(x, z, 0.15)) continue;
      const y = lawn(x, z);
      if (y === null || y === undefined || !Number.isFinite(y)) continue;
      if (!this.openGround(x, y, z)) continue;
      if (this.crowded(bird, x, z, 0.14)) continue;
      if (this.nearPlant(targets, x, z)) continue;
      _v.set(x, y, z);
      if (!this.inView(_v, bird)) continue;
      return _v.clone();
    }
    return null;
  }

  // Which garden style is laid out: the one whose beds and pots all have
  // soil where the ground says they do.
  findLayout(lawn) {
    if (!lawn) return null;
    let best = null;
    let bestK = 0.5;
    for (const L of Object.values(LAYOUTS)) {
      let ok = 0;
      for (const zn of L.zones) {
        const y = lawn(zn.cx, zn.cz);
        if (y !== null && y !== undefined && y > 0.005 && Math.abs(y - zn.y) < 0.1) ok++;
      }
      const k = ok / L.zones.length;
      if (k > bestK) {
        bestK = k;
        best = L;
      }
    }
    return best;
  }

  // Bare ground a small bird is not lost in: soil, gravel or decking (the
  // lawn's grass would hide it).
  openGround(x, y, z) {
    if (y > 0.005) return true;
    const L = this.layout;
    if (!L) return false;
    if (L.ground === 'deck') return true;
    const g = L.gravel;
    return !!g && x > g.x0 + 0.05 && x < g.x1 - 0.05 && z > g.z0 + 0.05 && z < g.z1 - 0.05;
  }

  nearPlant(targets, x, z) {
    for (const t of targets) {
      const dx = t.pos.x - x;
      const dz = t.pos.z - z;
      if (dx * dx + dz * dz < 0.09 * 0.09) return true;
    }
    return false;
  }

  // Far enough from the lens, well inside the picture and not hidden behind
  // a plant, a pot or a planter.
  inView(p, self) {
    if (!this.farFromCamera(p)) return false;
    const cam = this.world?.camera;
    if (!cam) return true;
    // leaves and flowers nearer the camera and over the bird on screen
    _ndc.copy(p).project(cam);
    const sx = _ndc.x;
    const sy = _ndc.y;
    const dist = cam.position.distanceTo(p);
    for (const t of this.world.targets || []) {
      if (t.pos.y < p.y + 0.02) continue;
      if (cam.position.distanceTo(t.pos) > dist - 0.03) continue;
      _w.copy(t.pos).project(cam);
      if (Math.abs(_w.x - sx) < 0.07 && _w.y > sy - 0.03) return false;
    }
    // pots and planters between the camera and the bird
    const L = this.layout;
    if (L) {
      _w.set(p.x, p.y + 0.04, p.z);
      for (let i = 1; i <= 24; i++) {
        _q.lerpVectors(_w, cam.position, (i / 24) * Math.min(1, 1.6 / dist));
        for (const zn of L.zones) {
          if (zn.container === 'border') continue;
          if (_q.y < zn.y + 0.03 && inZone(zn, _q.x, _q.z, -0.035) && !inZone(zn, p.x, p.z, -0.035)) return false;
        }
      }
    }
    return true;
  }

  inBounds(x, z, pad) {
    const b = this.world?.bounds;
    const x0 = Math.max(-2, b ? b.x0 : -2);
    const x1 = Math.min(2, b ? b.x1 : 2);
    const z0 = Math.max(-1.8, b ? b.z0 : -1.8);
    const z1 = Math.min(1, b ? b.z1 : 1);
    return x > x0 + pad && x < x1 - pad && z > z0 + pad && z < z1 - pad;
  }

  // at least ~0.9 m from the lens, and well inside the picture
  farFromCamera(p) {
    const cam = this.world?.camera;
    if (!cam) return true;
    if (cam.position.distanceTo(p) < 0.9) return false;
    cam.updateMatrixWorld();
    _ndc.copy(p).project(cam);
    return Math.abs(_ndc.x) < 0.86 && _ndc.y > -0.86 && _ndc.y < 0.93 && _ndc.z < 1;
  }

  crowded(self, x, z, r = 0.1) {
    for (const b of this.birds) {
      if (b === self || b.leaving) continue;
      const q = b.state === 'perch' ? b.pos : b.spot.pos;
      const dx = q.x - x;
      const dz = q.z - z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // An off-screen point to fly in from (or out to), on the side nearest `p`,
  // above the garden and behind the plants, never towards the camera.
  entry(p, out = new THREE.Vector3()) {
    const side = p.x === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.75 ? Math.sign(p.x) : -Math.sign(p.x);
    out.set(side * 3.2, 1.25 + Math.random() * 0.4, Math.max(-1.8, Math.min(-0.3, p.z - 0.4 - Math.random() * 0.8)));
    this.offscreen(out, side);
    return out;
  }

  exit(p) {
    const side = Math.abs(p.x) < 0.2 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(p.x);
    const e = new THREE.Vector3(side * 3.4, 1.45 + Math.random() * 0.3, Math.max(-1.8, Math.min(-0.5, p.z - 0.8)));
    this.offscreen(e, side);
    return e;
  }

  offscreen(v, side) {
    const cam = this.world?.camera;
    if (!cam) return v;
    cam.updateMatrixWorld();
    for (let i = 0; i < 8; i++) {
      _ndc.copy(v).project(cam);
      if (Math.abs(_ndc.x) > 1.15 || Math.abs(_ndc.y) > 1.15 || _ndc.z > 1) break;
      v.x += side * 0.8;
    }
    return v;
  }

  // ---------------------------------------------------------------- frame

  update(dt, t, world) {
    this.world = world;
    const leave = world.night > 0.5 || world.rain > 0.3;
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      if (leave && !b.leaving) this.leave(b);
      if (!b.leaving && b.state === 'perch' && b.stay <= 0 && !b.act) this.leave(b);
      b.update(dt, world);
      if (b.justArrived) {
        b.justArrived = false;
        this.onArrive?.(b.kind);
      }
      if (b.state === 'gone') {
        this.birds.splice(i, 1);
        this.release(b);
      }
    }
  }

  // ---------------------------------------------------------------- touch

  pick(raycaster) {
    let best = null;
    let bestD = Infinity;
    const ray = raycaster.ray;
    for (const b of this.birds) {
      if (b.state === 'gone') continue;
      b.centre(_v);
      // a generous 12 cm sphere so small fingers find the bird
      if (ray.distanceSqToPoint(_v) > 0.12 * 0.12) continue;
      const d = _v.distanceTo(ray.origin);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  poke(bird) {
    if (!bird || bird.leaving) return;
    if (bird.state !== 'perch') {
      this.onChirp?.(bird.kind, bird.centre(_v));
      return;
    }
    // a little hop, a tilt of the head towards us and a chirp; it stays
    bird.act = 'poke';
    bird.actT = 0;
    bird.actDur = 1.6;
    bird.sang = false;
    bird.hopFrom.copy(bird.pos);
    bird.act3 = Math.random() < 0.5 ? 1 : -1;
    bird.stay = Math.max(bird.stay, 6);
  }

  // ---------------------------------------------------------------- portrait

  // A posed, static bird for the visitors book, centred on the origin,
  // facing +x and turned a little towards +z (best seen from +z).
  // userData.radius is its bounding radius.
  model(kind) {
    if (!SPECIES[kind]) return null;
    const b = new Bird(this.asset(kind), { shadows: false });
    const P = b.pose;
    P.headYaw = 0.35;
    P.headRoll = 0.12;
    P.headPitch = -0.05;
    P.tailCock = 0.05;
    b.pos.set(0, 0, 0);
    b.heading = Math.PI / 2 - 0.45;
    b.object.position.set(0, 0, 0);
    b.object.rotation.set(0, b.heading, 0);
    b.rig.apply();
    b.object.updateMatrixWorld(true);
    // precise: from the folded wings' own vertices, not the spread-wing morph
    const box = new THREE.Box3().setFromObject(b.object, true);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const holder = new THREE.Group();
    holder.name = `${kind}-model`;
    b.object.position.sub(sphere.center);
    holder.add(b.object);
    holder.userData.radius = sphere.radius;
    return holder;
  }
}
