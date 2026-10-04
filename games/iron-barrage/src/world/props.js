// Battlefield clutter standing on the ground: sandbags, drums, wire, dead
// trees, wrecked trucks and each battlefield's own (hay bales, pines,
// broken walls...). Blasts fling the small things and knock the big ones
// over, scorched; anything whose ground is blown away drops with it.
import { WORLD, rng, clamp } from '../config.js';

const COMMON = [
  ['prop_sandbags', 3],
  ['prop_drums', 2],
  ['prop_crates', 2],
  ['prop_hedgehog', 2],
  ['prop_wire', 2],
  ['prop_deadtree', 2],
  ['prop_stump', 1],
  ['prop_truck_wreck', 1],
];

export const PROP_SETS = {
  ashfield: [...COMMON, ['prop_haybale', 3], ['prop_fence', 3], ['prop_cart', 1]],
  dunes: [...COMMON.filter(([n]) => n !== 'prop_deadtree' && n !== 'prop_stump'), ['prop_rocks_desert', 4], ['prop_jeep_wreck', 1]],
  frostline: [...COMMON.filter(([n]) => n !== 'prop_deadtree'), ['prop_pine', 6], ['prop_pine_broken', 2], ['prop_logs', 2]],
  ruins: [...COMMON.filter(([n]) => n !== 'prop_deadtree' && n !== 'prop_stump'), ['prop_wall_ruin', 3], ['prop_lamp', 2], ['prop_car_wreck', 2], ['prop_rubble', 3]],
  nightfall: [...COMMON, ['prop_rock_spire', 3], ['prop_mast', 1]],
};

export class Props {
  constructor() {
    this.list = [];
  }

  // Scatters props along the battlefield, clear of where the tanks start.
  place(bf, terrain, atlas, spawns, seed) {
    this.list.length = 0;
    const set = (PROP_SETS[bf.id] || COMMON).filter(([n]) => atlas.has(n));
    if (!set.length) return;
    const total = set.reduce((s, [, w]) => s + w, 0);
    const r = rng(seed * 7919 + 13);
    let x = 4 + r() * 8;
    while (x < WORLD.width - 4) {
      let near = false;
      for (const s of spawns) if (Math.abs(s - x) < 10) near = true;
      if (!near) {
        let k = r() * total;
        let name = set[0][0];
        for (const [n, w] of set) {
          k -= w;
          if (k <= 0) {
            name = n;
            break;
          }
        }
        const f = atlas.frames[name];
        const big = f.h > 3.5;
        const y = terrain.top(x);
        const slope = Math.atan2(terrain.top(x + 1.5) - terrain.top(x - 1.5), 3);
        if (Math.abs(slope) < 0.6) {
          this.list.push({
            name,
            x,
            y: y - 0.12,
            rot: big ? slope * 0.15 : slope * 0.8,
            flip: r() < 0.5 ? -1 : 1,
            scale: 0.85 + r() * 0.3,
            big,
            hp: big ? 2 : 1,
            char: 0,
            fall: 0,
            fallDir: 0,
            vy: 0,
            gone: false,
          });
        }
        x += (big ? 14 : 8) + r() * (big ? 26 : 22);
      } else x += 6;
    }
  }

  // A blast: fling the small things nearby, knock the big ones over.
  blast(x, y, radius, power, fx) {
    const reach = radius * 1.7 + 3;
    for (const p of this.list) {
      if (p.gone) continue;
      const d = Math.hypot(p.x - x, p.y + 0.5 - y);
      if (d > reach) continue;
      const k = 1 - d / reach;
      p.char = Math.min(1, p.char + k * 1.2);
      p.hp -= k * power * 2.2;
      if (p.hp > 0) continue;
      const dir = Math.sign(p.x - x) || 1;
      if (p.big) {
        if (!p.fallDir) p.fallDir = dir;
      } else {
        p.gone = true;
        fx.addDebris(p.name, p.x, p.y + 0.5, dir * (4 + k * 14), 6 + k * 14, (Math.random() - 0.5) * 10, { char: p.char, life: 40, size: p.scale });
      }
    }
  }

  update(dt, terrain, g) {
    for (const p of this.list) {
      if (p.gone) continue;
      // big things topple about their base
      if (p.fallDir && p.fall < 1) {
        p.fall = Math.min(1, p.fall + dt * (0.6 + p.fall * 2.5));
      }
      // the ground went: drop with it
      const ground = terrain.groundBelow(p.x, p.y + 1.5) - 0.12;
      if (ground < p.y - 0.05) {
        p.vy -= g * dt;
        p.y = Math.max(ground, p.y + p.vy * dt);
        if (p.y <= ground) p.vy = 0;
      }
      if (p.y < 1) p.gone = true;
    }
  }

  draw(atlas, list) {
    for (const p of this.list) {
      if (p.gone) continue;
      const rot = p.rot - p.fallDir * p.fall * p.fall * 1.45;
      atlas.put(list, p.name, p.x, p.y, rot, p.flip, p.scale, 1, 1, 1, 0, 1, clamp(p.char, 0, 1) * 0.85, 0, 0);
    }
  }
}
