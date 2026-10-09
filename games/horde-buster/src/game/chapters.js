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

// The battlefield, laid out for a field W units wide: a city boulevard
// edge to edge with sidewalks down both screen edges, a broken barricade
// across the top the horde pours through, wrecked cars and barriers in play
// that it has to go around (`block`), and the old street beyond the edges
// for very wide screens. Every prop is an atlas sprite; x, y its ground point.
function cityField(seed, W) {
  const r = rng(seed);
  const props = [];
  const add = (name, x, y, scale = 1, flip = 1, block = false) => props.push({ name, x, y, scale, flip, block });
  const flip = () => (r() < 0.5 ? 1 : -1);
  const wreck = () => ['car_0', 'car_2', 'police_car', 'car_1'][Math.floor(r() * 4)];
  // the barricade across the top, with gaps
  for (let x = 30 + r() * 60; x < W - 30; x += 110 + r() * 150) {
    const k = r();
    const y = 46 + r() * 64;
    if (k < 0.2) add('sandbags', x, y, 1, flip());
    else if (k < 0.36) add('barrier', x, y, 1, flip());
    else if (k < 0.46) add('fire_barrel', x, y);
    else if (k < 0.56) add('cone', x, y);
    else if (k < 0.66) add('sawhorse', x, y, 1, flip());
    else if (k < 0.74) add('tyre', x, y);
    else if (k < 0.82) add('crate', x, y);
    else {
      add(wreck(), x, y - 10, 0.92, flip());
      x += 90;
    }
  }
  // further up the road (phones show more of it): rubble and wrecks
  for (let x = 60 + r() * 120; x < W - 60; x += 260 + r() * 220) {
    const k = r();
    add(k < 0.4 ? wreck() : k < 0.7 ? `rubble_${Math.floor(r() * 3)}` : 'dumpster', x, -120 - r() * 360, 1, flip());
  }
  // the sidewalks down both screen edges
  for (const side of [0, 1]) {
    const at = (d) => (side ? W - d : d);
    for (let y = 170 + r() * 80; y < 900; y += 300 + r() * 80) add('lamp_post', at(36), y, 1, side ? -1 : 1);
    for (let y = 240 + r() * 120; y < 900; y += 210 + r() * 160) {
      const k = r();
      add(k < 0.3 ? 'hydrant' : k < 0.5 ? 'trash_bags' : k < 0.7 ? 'bench' : k < 0.85 ? 'tyre' : 'fire_barrel', at(30 + r() * 28), y, 1, side ? -1 : 1);
    }
    for (let y = 120 + r() * 200; y < 1300; y += 330 + r() * 220) add(`tree_${Math.floor(r() * 3)}`, at(-70 - r() * 30), y, 0.95 + r() * 0.2, flip());
  }
  // in play: wrecks and barrier runs the horde must go round
  const n = Math.round(2 + (1.7 * W) / 720);
  const spots = [];
  for (let tries = 0; spots.length < n && tries < 200; tries++) {
    const x = 170 + r() * (W - 340);
    const y = 300 + r() * 470;
    if (spots.some((p) => (p.x - x) ** 2 + ((p.y - y) * 1.6) ** 2 < 300 * 300)) continue;
    spots.push({ x, y });
    const k = r();
    if (k < 0.55) add(wreck(), x, y, 1, flip(), true);
    else if (k < 0.8) {
      add('barrier', x - 70, y, 1, 1, true);
      add('barrier', x + 70, y + 6, 1, -1, true);
    } else if (k < 0.9) add('dumpster', x, y, 1, flip(), true);
    else {
      add('sandbags', x - 60, y, 1, 1, true);
      add('sandbags', x + 60, y - 4, 1, -1, true);
    }
  }
  // beyond the edges, only seen on very wide screens: verge, plaza, buildings
  for (const side of [-1, 1]) {
    const out = (d) => (side < 0 ? -d : W + d);
    for (let y = -300 + r() * 120; y < 1500; y += 170 + r() * 90) add(r() < 0.75 ? `tree_${Math.floor(r() * 3)}` : `bush_${Math.floor(r() * 2)}`, out(190 + r() * 120), y, 0.9 + r() * 0.3, flip());
    for (let y = -200 + r() * 200; y < 1500; y += 300 + r() * 200) {
      const k = r();
      add(k < 0.3 ? 'dumpster' : k < 0.55 ? 'rubble_0' : k < 0.75 ? 'sandbags' : 'fence', out(420 + r() * 140), y, 1, flip());
    }
    add('bus', out(380), 700 + r() * 300, 1, side);
    for (let y = -420; y < 1600; y += 300 + r() * 80) add(`building_${Math.floor(r() * 4)}`, out(760 + r() * 60), y, 1, flip());
  }
  return props;
}

// The ground for a field W wide: asphalt edge to edge but for a sidewalk at each screen edge.
function cityGround(W) {
  const x0 = 96;
  const x1 = W - 96;
  return {
    kind: 0,
    rect: { x: -1000, y: -820, w: W + 2000, h: 2400 },
    road: [x0, x1, 18, 150], // road x0, x1, kerb width, sidewalk width
    verge: [220, 260, 1.7, 96], // verge width, parking-bay offset into the plaza, seed, lane dash length
    lanes: Math.max(3, Math.round((x1 - x0) / 230)),
    cross: [150, 236, 46, 1], // a zebra crossing near the top: y0, y1, stripe period, on
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
  };
}

export const CHAPTERS = [
  {
    id: 'city',
    name: 'City Road',
    ground: cityGround,
    look: {
      key: [-0.36, 0.56, 0.75, 0],
      keyCol: [1.0, 0.95, 0.86, 0],
      ambTop: [0.62, 0.68, 0.84, 0],
      ambBot: [0.34, 0.3, 0.32, 0],
      rim: [1.0, 0.86, 0.62, 0.55],
      fog: [0.32, 0.38, 0.48, 0.0],
      bloomThreshold: 1.05,
    },
    scenery: (W) => cityField(7, W),
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

// What clearing each wave gives: coins, bonus XP, and on waves 2 and 4 a
// star for the gun in hand. c is the field's creature-count scale (a wide
// field has more creatures: coins per kill keep the same pace).
export function waveReward(chapter, wave, kills, c = 1) {
  const coins = 60 + 45 * (wave + 1) + Math.floor((kills / c) * 0.6) + (chapter.waves[wave].boss ? 250 : 0);
  const xp = 40 * (wave + 1);
  const star = wave === 1 || wave === 3;
  return { coins, xp, star };
}
