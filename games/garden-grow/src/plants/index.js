// The plant system: plants every species in the soil, grows them, finds the
// one under a finger, lists landing spots for visitors and cuts flowers for
// the vase. Each species lives in its own module and implements the same
// small interface, so flowers (this folder) and vegetables (./veg/) mix
// freely in one bed.
//
// Species module interface (flowers here, vegetables in ./veg/index.js as
// VEG_SPECIES = { carrot: createCarrot, ... }):
//
//   export function createX({ seed, color, quality, cut }) -> {
//     object,               // Object3D, origin at the soil point, +y up (Plants positions it)
//     setGrowth(g),         // 0..1, smooth and continuous (STAGE in config.js)
//     update(dt, t, { sunDir, night, worldPos }),  // sway, wobble, glow ...
//     targets(out, plant),  // push { pos, normal, plant, kind: 'bloom'|'leaf'|'fruit', color }, WORLD space
//     hitRadius, hitHeight, // generous pick cylinder around the stem (may change with growth)
//     harvestable(),        // flowers: fully bloomed; vegetables: ripe
//     harvest(onFree),      // animate the snip / pull; call onFree(item) with the freed Object3D
//                           // placed in world space (Plants adds it to the scene if it has no parent;
//                           // item.userData.dispose() frees it; optional item.userData.core is the
//                           // part it rests on); returns { remove, regrowTo }
//     poke(),               // springy wobble
//     dispose(),
//     pending?(), flush?(), // optional: deferred rebuilds, run by Plants.update within a time budget
//   }
//   `cut: true` (flowers only) asks for a picked stem with its open bloom,
//   base at the origin, for the vase.
//
// Materials for every species come from ./materials.js (leafMaterial,
// petalMaterial, stemMaterial, plantUniforms), which Plants.update drives.
// Plants.warm() paints every species' textures in idle time ahead of use.
import * as THREE from 'three';
import { PLANTS, REDUCED_MOTION, clamp } from '../config.js';
import { plantUniforms } from './materials.js';
import { createTulip } from './tulip.js';

// Vegetables are written alongside; a broken or missing module must not take
// the flowers down with it.
const VEG = await import('./veg/index.js')
  .then((m) => m.VEG_SPECIES || {})
  .catch((err) => {
    console.warn('Garden Grow: vegetables unavailable', err);
    return {};
  });

export const SPECIES = { tulip: createTulip, ...VEG };

async function loadFlower(id, file, fn) {
  try {
    const m = await import(file);
    if (m[fn]) SPECIES[id] = m[fn];
  } catch (err) {
    console.warn(`Garden Grow: ${id} unavailable`, err);
  }
}
await Promise.all([
  loadFlower('sunflower', './sunflower.js', 'createSunflower'),
  loadFlower('rose', './rose.js', 'createRose'),
  loadFlower('daisy', './daisy.js', 'createDaisy'),
  loadFlower('lavender', './lavender.js', 'createLavender'),
  loadFlower('poppy', './poppy.js', 'createPoppy'),
  loadFlower('moonflower', './moonflower.js', 'createMoonflower'),
]);

function factory(id) {
  const f = SPECIES[id];
  if (f) return f;
  console.warn(`Garden Grow: no species "${id}" yet, planting a tulip`);
  return SPECIES.tulip;
}

class Plant {
  constructor(owner, species, pos, seed, color, impl) {
    this.owner = owner;
    this.species = species;
    this.pos = pos.clone();
    this.seed = seed;
    this.color = color;
    this.impl = impl;
    this.object = impl.object;
    this.growth = -1;
  }

  setGrowth(g) {
    g = clamp(g, 0, 1);
    if (g === this.growth) return;
    this.growth = g;
    this.impl.setGrowth(g);
  }

  poke() {
    this.impl.poke?.();
  }

  harvestable() {
    return !!this.impl.harvestable?.();
  }

  harvest(onFree) {
    if (!this.impl.harvest) return { remove: false, regrowTo: this.growth };
    const scene = this.owner.scene;
    return this.impl.harvest((item) => {
      if (item && !item.parent) scene.add(item);
      onFree?.(item);
    });
  }
}

const _ro = new THREE.Vector3();
const _rd = new THREE.Vector3();

export class Plants {
  constructor({ scene, quality }) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'plants';
    scene.add(this.group);
    this.list = [];
    this.budgetMs = quality?.tier === 'low' ? 1.5 : 2.5;
    this._targets = [];
    this._targetsFrame = -1;
    this._frame = 0;
    this._rr = 0;
  }

  add(speciesId, pos, { seed, color } = {}) {
    seed = seed ?? Math.floor(Math.random() * 1e9);
    const info = PLANTS[speciesId];
    color = color ?? (info ? info.colors[seed % info.colors.length] : '#ffffff');
    const impl = factory(speciesId)({ seed, color, quality: this.quality });
    impl.object.position.copy(pos);
    this.group.add(impl.object);
    impl.object.updateMatrixWorld(true);
    const plant = new Plant(this, speciesId, pos, seed, color, impl);
    plant.setGrowth(0);
    this.list.push(plant);
    return plant;
  }

  remove(plant) {
    const i = this.list.indexOf(plant);
    if (i < 0) return;
    this.list.splice(i, 1);
    plant.object.removeFromParent();
    plant.impl.dispose?.();
  }

  update(dt, t, { sunDir, night = 0, sunColor } = {}) {
    this._frame++;
    if (sunDir) plantUniforms.uSunDir.value.copy(sunDir).normalize();
    if (sunColor) plantUniforms.uSunColor.value.copy(sunColor);
    plantUniforms.uNight.value = night;
    plantUniforms.uSway.value = REDUCED_MOTION.matches ? 0.5 : 1;
    const args = { sunDir: plantUniforms.uSunDir.value, night, worldPos: null };
    for (const p of this.list) {
      args.worldPos = p.pos;
      p.impl.update?.(dt, t, args);
    }
    // growing plants rebuild their shape a few at a time, round robin
    const n = this.list.length;
    if (!n) return;
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      const p = this.list[(this._rr + k) % n];
      if (!p.impl.pending?.()) continue;
      p.impl.flush();
      if (performance.now() - t0 > this.budgetMs) {
        this._rr = (this._rr + k + 1) % n;
        return;
      }
    }
  }

  // Landing spots on what exists right now, in world space. Cached per frame.
  targets() {
    if (this._targetsFrame === this._frame) return this._targets;
    this._targetsFrame = this._frame;
    const out = this._targets;
    out.length = 0;
    for (const p of this.list) p.impl.targets?.(out, p);
    return out;
  }

  // The plant whose (generous) pick cylinder the ray meets first.
  pick(raycaster) {
    const o = _ro.copy(raycaster.ray.origin);
    const d = _rd.copy(raycaster.ray.direction);
    let best = null;
    let bestT = Infinity;
    for (const p of this.list) {
      const r = Math.max(0.05, p.impl.hitRadius ?? 0.08);
      const h = Math.max(0.06, p.impl.hitHeight ?? 0.1);
      const t = rayCylinder(o, d, p.pos.x, p.pos.z, p.pos.y - 0.02, p.pos.y + h, r);
      if (t < bestT) {
        bestT = t;
        best = p;
      }
    }
    return best;
  }

  // Paint each species' shared textures ahead of time, one species per idle
  // slice (0.1 to 0.35 s each on a laptop), so the first seed of a kind does
  // not stall a frame. Optional; call once after loading.
  async warm(ids = Object.keys(SPECIES)) {
    const idle = () => new Promise((r) => (globalThis.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 500 }) : setTimeout(r, 0)));
    for (const id of ids) {
      if (!SPECIES[id]) continue;
      await idle();
      try {
        SPECIES[id]({ seed: 1, color: PLANTS[id]?.colors[0] ?? '#ffffff', quality: this.quality }).dispose?.();
      } catch (err) {
        console.warn(`Garden Grow: could not warm ${id}`, err);
      }
    }
  }

  // A picked stem with its open bloom and a leaf or two, base at the origin.
  cutFlower(speciesId, color) {
    const info = PLANTS[speciesId];
    const seed = Math.floor(Math.random() * 1e9);
    const impl = factory(speciesId)({ seed, color: color ?? info?.colors[0] ?? '#ffffff', quality: this.quality, cut: true });
    impl.setGrowth(1);
    impl.flush?.();
    impl.object.userData.dispose = () => impl.dispose?.();
    return impl.object;
  }
}

// Distance along the ray to a vertical capped cylinder, or Infinity.
function rayCylinder(o, d, cx, cz, y0, y1, r) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  let tin = -Infinity;
  let tout = Infinity;
  if (a < 1e-9) {
    if (ox * ox + oz * oz > r * r) return Infinity;
  } else {
    const b = ox * d.x + oz * d.z;
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (disc < 0) return Infinity;
    const s = Math.sqrt(disc);
    tin = (-b - s) / a;
    tout = (-b + s) / a;
  }
  if (Math.abs(d.y) < 1e-9) {
    if (o.y < y0 || o.y > y1) return Infinity;
  } else {
    let ta = (y0 - o.y) / d.y;
    let tb = (y1 - o.y) / d.y;
    if (ta > tb) [ta, tb] = [tb, ta];
    tin = Math.max(tin, ta);
    tout = Math.min(tout, tb);
  }
  if (tin > tout || tout < 0) return Infinity;
  return Math.max(0, tin);
}
