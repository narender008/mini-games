// Chapters: the ground theme, the side scenery, the light, and the waves.
//
// A wave is a script of timed events: `group` drops n creatures at once in a
// pattern, `stream` keeps spawning one type every few seconds (the interval
// can ramp from a to b), `pickup` floats a power-up down the road, `barrels`
// rolls in explosive drums, `boss` brings on the chapter boss. A wave ends
// when its script has run and the road is clear (boss waves: when the boss
// dies).
import { rng } from '../config.js';

const lin = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
};

// Side scenery: props laid out along both sides of the road, mirrored with
// variety. Every prop is a sprite name from the atlas; x, y are its ground point.
function cityScenery(seed) {
  const r = rng(seed);
  const props = [];
  const add = (name, x, y, scale = 1, flip = 1) => props.push({ name, x, y, scale, flip });
  for (const side of [-1, 1]) {
    const edge = side < 0 ? 0 : 720;
    const out = (d) => edge + side * d; // d units away from the road edge
    // jersey barriers and cones along the kerb, with gaps
    for (let y = -300; y < 1700; y += 150 + r() * 120) {
      const k = r();
      if (k < 0.35) add('barrier', out(10 + r() * 14), y, 1, side);
      else if (k < 0.55) add('cone', out(6 + r() * 20), y, 1, side);
      else if (k < 0.65) add('sawhorse', out(14), y, 1, side);
    }
    // wrecked cars half on the kerb
    for (let y = -200 + r() * 200; y < 1700; y += 420 + r() * 380) add(['car_0', 'car_1', 'car_2', 'police_car'][Math.floor(r() * 4)], out(70 + r() * 40), y, 1, r() < 0.5 ? 1 : -1);
    // the sidewalk: lamps, hydrants, benches, bins, a bus stop, fire barrels
    for (let y = -250 + r() * 100; y < 1700; y += 330 + r() * 60) add('lamp_post', out(165), y, 1, side);
    for (let y = -100 + r() * 300; y < 1700; y += 260 + r() * 260) {
      const k = r();
      add(k < 0.25 ? 'hydrant' : k < 0.45 ? 'bench' : k < 0.65 ? 'trash_bags' : k < 0.8 ? 'tyre' : k < 0.9 ? 'fire_barrel' : 'crate', out(105 + r() * 60), y, 1, side);
    }
    add('bus_stop', out(150), 380 + r() * 500, 1, side);
    // the verge: chunky trees and bushes
    for (let y = -300 + r() * 120; y < 1750; y += 170 + r() * 90) add(r() < 0.75 ? `tree_${Math.floor(r() * 3)}` : `bush_${Math.floor(r() * 2)}`, out(240 + r() * 120), y, 0.9 + r() * 0.3, r() < 0.5 ? 1 : -1);
    // the plaza: dumpsters, rubble, sandbags, a fence, parked wrecks
    for (let y = -200 + r() * 200; y < 1700; y += 300 + r() * 200) {
      const k = r();
      add(k < 0.25 ? 'dumpster' : k < 0.45 ? 'rubble_0' : k < 0.6 ? 'rubble_1' : k < 0.75 ? 'sandbags' : k < 0.88 ? 'fence' : 'rubble_2', out(470 + r() * 160), y, 1, r() < 0.5 ? 1 : -1);
    }
    for (let y = 0 + r() * 300; y < 1700; y += 520 + r() * 300) add(`car_${Math.floor(r() * 3)}`, out(560 + r() * 120), y, 1, r() < 0.5 ? 1 : -1);
    add('bus', out(430), 900 + r() * 300, 1, side);
    // buildings shoulder to shoulder on the far sides
    let y = -420;
    while (y < 1800) {
      const b = Math.floor(r() * 4);
      add(`building_${b}`, out(820 + r() * 60), y, 1, r() < 0.5 ? 1 : -1);
      y += 300 + r() * 80;
    }
  }
  return props;
}

export const CHAPTERS = [
  {
    id: 'city',
    name: 'City Road',
    ground: {
      kind: 0,
      rect: { x: -1700, y: -480, w: 4120, h: 2240 },
      road: [0, 720, 22, 160], // road x0, x1, kerb width, sidewalk width
      verge: [220, 260, 1.7, 96], // verge width, parking-bay offset into the plaza, seed, lane dash length
      colors: {
        asphalt: lin('#3c424c'),
        asphalt2: lin('#4a515b'),
        kerb: lin('#b8b3a8'),
        walk: lin('#8f8c86'),
        grass: lin('#4f9a2c'),
        dirt: lin('#6e5638'),
        plaza: lin('#77746f'),
        line: lin('#ece6d4'),
      },
    },
    look: {
      key: [-0.36, 0.56, 0.75, 0],
      keyCol: [1.0, 0.95, 0.86, 0],
      ambTop: [0.62, 0.68, 0.84, 0],
      ambBot: [0.34, 0.3, 0.32, 0],
      rim: [1.0, 0.86, 0.62, 0.55],
      fog: [0.32, 0.38, 0.48, 0.0],
      bloomThreshold: 1.05,
    },
    scenery: () => cityScenery(7),
    boss: 'ogre',
    waves: [
      {
        name: 'The Dead Walk',
        sub: 'Hold the road',
        events: [
          { t: 0.5, group: 'shambler', n: 5, pattern: 'line' },
          { t: 2, stream: 'shambler', every: [1.6, 0.8], until: 50 },
          { t: 12, group: 'shambler', n: 9, pattern: 'cluster' },
          { t: 22, stream: 'runner', every: [4, 2.6], until: 50 },
          { t: 24, pickup: 'heart' },
          { t: 26, group: 'shambler', n: 14, pattern: 'line' },
          { t: 34, pickup: 'bomb' },
          { t: 36, group: 'runner', n: 6, pattern: 'flank' },
          { t: 44, group: 'shambler', n: 22, pattern: 'wall' },
        ],
      },
      {
        name: 'Brutes',
        sub: 'Big, red and angry',
        barrels: 5,
        events: [
          { t: 1, stream: 'shambler', every: [1.2, 0.6], until: 55 },
          { t: 6, stream: 'runner', every: [3.4, 2.0], until: 55 },
          { t: 8, group: 'brute', n: 1, pattern: 'center' },
          { t: 16, group: 'shambler', n: 18, pattern: 'wall' },
          { t: 20, pickup: 'shield' },
          { t: 22, group: 'brute', n: 2, pattern: 'flank' },
          { t: 28, group: 'spitter', n: 2, pattern: 'flank' },
          { t: 30, barrels: 3 },
          { t: 34, group: 'runner', n: 10, pattern: 'flank' },
          { t: 38, pickup: 'magnet' },
          { t: 40, group: 'brute', n: 2, pattern: 'line' },
          { t: 42, pickup: 'heart' },
          { t: 48, group: 'shambler', n: 30, pattern: 'wall' },
          { t: 50, group: 'shambler', n: 10, pattern: 'cluster', elite: 1 },
        ],
      },
      {
        name: 'The Swarm',
        sub: 'Spiders. So many spiders.',
        barrels: 6,
        events: [
          { t: 1, stream: 'shambler', every: [1.1, 0.55], until: 58 },
          { t: 3, group: 'spider', n: 30, pattern: 'swarm' },
          { t: 12, group: 'spider', n: 45, pattern: 'swarm' },
          { t: 14, pickup: 'magnet' },
          { t: 18, stream: 'runner', every: [2.8, 1.6], until: 58 },
          { t: 20, group: 'spitter', n: 3, pattern: 'line' },
          { t: 22, group: 'brute', n: 2, pattern: 'flank' },
          { t: 26, group: 'spider', n: 70, pattern: 'swarm' },
          { t: 30, pickup: 'lightning' },
          { t: 34, group: 'shambler', n: 16, pattern: 'cluster', elite: 1 },
          { t: 38, group: 'spider', n: 90, pattern: 'swarm' },
          { t: 40, pickup: 'heart' },
          { t: 44, barrels: 4 },
          { t: 46, group: 'brute', n: 3, pattern: 'line' },
          { t: 50, group: 'spider', n: 120, pattern: 'swarm' },
          { t: 52, pickup: 'freeze' },
        ],
      },
      {
        name: 'Spitters',
        sub: 'Keep moving',
        barrels: 6,
        events: [
          { t: 1, stream: 'shambler', every: [0.48, 0.24], until: 60 },
          { t: 3, group: 'spitter', n: 4, pattern: 'line' },
          { t: 8, stream: 'runner', every: [1.08, 0.6], until: 60 },
          { t: 12, group: 'spider', n: 85, pattern: 'swarm' },
          { t: 16, pickup: 'freeze' },
          { t: 18, group: 'spitter', n: 7, pattern: 'flank' },
          { t: 24, group: 'brute', n: 4, pattern: 'line' },
          { t: 28, pickup: 'shield' },
          { t: 30, group: 'shambler', n: 68, pattern: 'wall' },
          { t: 34, group: 'spitter', n: 8, pattern: 'line' },
          { t: 36, pickup: 'lightning' },
          { t: 40, group: 'spider', n: 153, pattern: 'swarm' },
          { t: 44, group: 'brute', n: 3, pattern: 'flank', elite: 1 },
          { t: 46, pickup: 'heart' },
          { t: 50, group: 'spitter', n: 7, pattern: 'line' },
          { t: 52, group: 'shambler', n: 85, pattern: 'wall' },
          { t: 54, pickup: 'freeze' },
        ],
      },
      {
        name: 'Ogre Warlord',
        sub: 'The big one',
        barrels: 4,
        boss: true,
        events: [
          { t: 1.5, boss: 'ogre' },
          { t: 8, stream: 'shambler', every: [1.4, 0.6], until: 999 },
          { t: 30, stream: 'runner', every: [4, 2.2], until: 999 },
          { t: 20, stream: 'spider', every: [5, 3], until: 999, n: 12 },
          { t: 18, pickup: 'heart' },
          { t: 40, pickup: 'shield' },
          { t: 55, pickup: 'heart' },
          { t: 70, pickup: 'bomb' },
        ],
      },
    ],
  },
];

// what clearing each wave gives: coins and bonus XP, and sometimes a weapon
export function waveReward(chapter, wave, kills) {
  const coins = 60 + 45 * (wave + 1) + Math.floor(kills * 0.6) + (chapter.waves[wave].boss ? 250 : 0);
  const xp = 40 * (wave + 1);
  const weapon = wave === 1 ? 'scatter' : wave === 3 ? 'rocket' : null;
  return { coins, xp, weapon };
}
