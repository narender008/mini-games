// The garden's rules: where a seed may go, how water and sunshine make it
// grow in each mode, and the moments along the way (the soil cracking, the
// first leaves, the bud, the bloom) that the rest of the game celebrates.
// Nothing ever wilts or dies: a dry plant simply waits for water.
import * as THREE from 'three';
import { PLANTS, STAGE, FLOWERS, clamp, pick } from './config.js';
import { inZone } from './layout.js';

// Seconds from a watered seed to full bloom, by mode. Big kid plants also
// need topping up with water on the way, and sunshine speeds them up.
const GROW_TIME = { little: 7, bedtime: 11, big: 75 };
// In Big kid, one full watering carries a plant this far along.
const WATER_REACH = 0.4;
const MOMENTS = ['crack', 'sprout', 'leaves', 'bud', 'open', 'bloom'];

export class Garden {
  constructor({ plants, env, onMoment }) {
    this.plantSys = plants;
    this.env = env;
    this.onMoment = onMoment; // (moment, entry) => {}
    this.entries = [];
    this.mode = 'little';
    this.bag = [];
    this.seq = 1;
  }

  setMode(mode) {
    this.mode = mode;
  }

  // Which zone (if any) can take a new plant of this species at (x, z)?
  // Returns { zone, x, z } with the spot nudged inside the zone, or null.
  spotFor(species, x, z) {
    const zones = this.env.layout.zones;
    const spacing = PLANTS[species].spacing;
    for (const zone of zones) {
      const pad = Math.min(0.05, zone.r ? zone.r * 0.35 : 0.05);
      if (!inZone(zone, x, z, 0)) continue;
      let px = x;
      let pz = z;
      if (zone.shape === 'circle' && (zone.max ?? 99) === 1) {
        px = zone.cx;
        pz = zone.cz;
      } else if (!inZone(zone, x, z, pad)) {
        // nudge a tap on the very edge back inside
        const k = 0.8;
        px = zone.cx + (x - zone.cx) * k;
        pz = zone.cz + (z - zone.cz) * k;
      }
      const here = this.entries.filter((e) => e.zone === zone);
      if (zone.max && here.length >= zone.max) return null;
      for (const e of this.entries) {
        const min = Math.max(spacing, PLANTS[e.species].spacing) * 0.85;
        if (Math.hypot(e.x - px, e.z - pz) < min) return null;
      }
      return { zone, x: px, z: pz };
    }
    return null;
  }

  // The next species for Little ones and Bedtime: a shuffled bag, so every
  // few taps brings something different.
  nextSpecies(night) {
    if (!this.bag.length) {
      const list = [...FLOWERS.filter((f) => f !== 'moonflower'), 'strawberry'];
      if (night || this.mode === 'bedtime') list.push('moonflower', 'moonflower');
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      this.bag = list;
    }
    return this.bag.pop();
  }

  plant(species, x, z, { growth = 0, water = 0, color, seed } = {}) {
    const spot = this.spotFor(species, x, z);
    if (!spot) return null;
    return this.add(species, spot.x, spot.z, spot.zone, { growth, water, color, seed });
  }

  add(species, x, z, zone, { growth = 0, water = 0, color, seed } = {}) {
    // a new seed goes into a freshly dug hole, and sits at its bottom
    if (growth === 0) this.env.dig(x, z);
    const y = this.env.heightAt(x, z);
    const info = PLANTS[species];
    const entry = {
      id: this.seq++,
      species,
      x,
      z,
      y,
      zone,
      color: color ?? pick(info.colors),
      seed: seed ?? Math.floor(Math.random() * 1e9),
      growth,
      water,
      sun: 0,
      started: water > 0 || growth > 0,
      reached: MOMENTS.filter((m) => growth >= STAGE[m]),
    };
    entry.plant = this.plantSys.add(species, new THREE.Vector3(x, y, z), { seed: entry.seed, color: entry.color });
    entry.plant.setGrowth(growth);
    this.entries.push(entry);
    return entry;
  }

  remove(entry) {
    this.plantSys.remove(entry.plant);
    this.entries = this.entries.filter((e) => e !== entry);
  }

  clear() {
    for (const e of this.entries) this.plantSys.remove(e.plant);
    this.entries = [];
  }

  nearest(x, z, radius) {
    let best = null;
    let bd = radius;
    for (const e of this.entries) {
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  byPlant(plant) {
    return this.entries.find((e) => e.plant === plant) || null;
  }

  // Water landing at (x, z): every plant whose roots are near drinks.
  water(x, z, amount, radius = 0.12) {
    for (const e of this.entries) {
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > radius + 0.06) continue;
      const k = 1 - clamp((d - radius * 0.4) / (radius + 0.06), 0, 1);
      e.water = Math.min(1, e.water + amount * k);
      if (e.water > 0.04) e.started = true;
    }
  }

  waterAll(amount) {
    for (const e of this.entries) {
      e.water = Math.min(1, e.water + amount);
      if (e.water > 0.04) e.started = true;
    }
  }

  sunAt(x, z, amount, radius = 0.2) {
    for (const e of this.entries) {
      if (Math.hypot(e.x - x, e.z - z) < radius) e.sun = Math.min(1, e.sun + amount);
    }
  }

  // Is this plant waiting for water? (Big kid shows a little droplet.)
  thirsty(e) {
    return this.mode === 'big' && e.growth < 1 && e.water <= 0.001;
  }

  update(dt) {
    const time = GROW_TIME[this.mode] ?? 7;
    for (const e of this.entries) {
      e.sun = Math.max(0, e.sun - dt * 0.12);
      if (!e.started || e.growth >= 1) continue;
      let rate = 1 / time;
      if (this.mode === 'big') {
        if (e.water <= 0) continue;
        rate *= 1 + e.sun * 2;
        const step = Math.min(rate * dt, 1 - e.growth);
        e.water = Math.max(0, e.water - (step / WATER_REACH));
        e.growth += step;
      } else {
        // a gentle ease at the very start so the seed has a moment to settle
        e.growth = Math.min(1, e.growth + rate * dt * (e.growth < 0.02 ? 0.6 : 1));
      }
      e.plant.setGrowth(e.growth);
      for (const m of MOMENTS) {
        if (e.growth >= STAGE[m] && !e.reached.includes(m)) {
          e.reached.push(m);
          this.onMoment(m, e);
        }
      }
    }
  }

  // Set a plant's growth directly (a picked flower regrowing its bud).
  regrow(e, g) {
    e.growth = g;
    e.reached = MOMENTS.filter((m) => g >= STAGE[m]);
    e.started = true;
    if (this.mode === 'big') e.water = Math.max(e.water, 0.5);
    e.plant.setGrowth(g);
  }

  counts() {
    let blooms = 0;
    let ripe = 0;
    let night = 0;
    for (const e of this.entries) {
      if (e.growth < 0.97) continue;
      if (PLANTS[e.species].kind === 'flower') blooms++;
      else ripe++;
      if (PLANTS[e.species].night) night++;
    }
    return { blooms, ripe, night, total: this.entries.length };
  }

  // For saving a Big kid garden on this device.
  serialize() {
    return this.entries.map((e) => ({ s: e.species, x: +e.x.toFixed(3), z: +e.z.toFixed(3), g: +e.growth.toFixed(3), w: +e.water.toFixed(2), c: e.color, seed: e.seed }));
  }

  restore(list) {
    for (const p of list || []) {
      if (!PLANTS[p.s]) continue;
      const zone = this.env.layout.zones.find((z) => inZone(z, p.x, p.z, 0));
      if (!zone) continue;
      this.add(p.s, p.x, p.z, zone, { growth: clamp(p.g, 0, 1), water: p.w || 0, color: p.c, seed: p.seed });
    }
  }
}

export { MOMENTS };
