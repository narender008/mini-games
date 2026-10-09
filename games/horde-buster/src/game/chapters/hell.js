// Chapter 3, the Hellscape: black basalt and obsidian under a red haze, lava rivers across the top and down both screen edges, a spiked
// gate the horde pours through, idols and braziers, bone piles and cages. The Abomination.
import { rng, lin } from '../../config.js';

// The battlefield, laid out for a field W units wide. Props are atlas sprites (blender/hell.py); x, y is the ground point.
//   top edge: spiked gates (600 u wide, one per ~950 u of field) with walls between them, idols and braziers beside them; the horde
//             spawns behind it (y < 0) and walks out through the portals and round the wall ends
//   further up (tall phones): spikes and rocks on the far bank of the top lava river
//   side edges: a column of totems, cages, rocks, spikes, posts and braziers on the bank beside each side river (x ~ 100..150)
//   in play: lava rocks, a ribcage, an idol or a cage that the horde walks round (`block`)
//   beyond the edges (very wide screens only): more of the same, past the rivers
function field(seed, W) {
  const r = rng(seed);
  const props = [];
  const add = (name, x, y, scale = 1, flip = 1, block = false) => props.push({ name, x, y, scale, flip, block });
  const flip = () => (r() < 0.5 ? 1 : -1);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const rock = () => `lava_rock_${Math.floor(r() * 3)}`;
  const spike = () => `obsidian_spike_${Math.floor(r() * 2)}`;
  const GATE_Y = 196; // the wall line; the top lava river lies behind it (y < ~120)

  // ---- the top edge: gates, walls between them, idols and braziers beside them
  const nGates = Math.max(1, Math.round(W / 950));
  const gates = [];
  for (let i = 0; i < nGates; i++) gates.push(((i + 0.5) * W) / nGates);
  for (const gx of gates) {
    add('hell_gate', gx, GATE_Y, 1, 1);
    for (const s of [-1, 1]) {
      add('brazier', gx + s * 172, GATE_Y + 74, 1, s);
      add('demon_statue', gx + s * 392, GATE_Y + 44, 0.82, -s);
    }
  }
  for (let x = -40; x < W + 60; x += 196 + r() * 12) {
    if (gates.some((gx) => Math.abs(x - gx) < 380)) continue;
    add('hell_wall', x, GATE_Y + r() * 12 - 4, 0.95 + r() * 0.13, flip());
    // now and then something stands in front of the wall
    const k = r();
    if (k < 0.18) add(spike(), x + 20, GATE_Y + 52, 0.7, flip());
    else if (k < 0.3) add('brazier', x, GATE_Y + 60, 0.9);
    else if (k < 0.38) add('skull_totem', x - 20, GATE_Y + 70, 0.8);
  }

  // ---- further up, on the far bank of the top river: only tall phones see it
  for (let x = 90 + r() * 120; x < W - 60; x += 240 + r() * 200) {
    const k = r();
    const y = -230 - r() * 190;
    if (k < 0.34) add(rock(), x, y, 1, flip());
    else if (k < 0.62) add(spike(), x, y, 1.05, flip());
    else if (k < 0.8) add(`pillar_broken_${Math.floor(r() * 2)}`, x, y, 1, flip());
    else add('ribcage', x, y, 1, flip());
  }

  // ---- the banks beside the side rivers
  for (const side of [0, 1]) {
    const at = (d) => (side ? W - d : d);
    const f = side ? -1 : 1; // what faces outward: the broken pillars' fallen drums lie toward the edge
    for (let y = 290 + r() * 70; y < 1010; y += 185 + r() * 80) {
      const k = r();
      const x = at(112 + r() * 40);
      if (k < 0.2) add('skull_totem', x, y, 1, flip());
      else if (k < 0.34) add('cage', x, y, 1, flip());
      else if (k < 0.5) add(rock(), x, y, 0.9, flip());
      else if (k < 0.64) add(spike(), x, y, 0.95, flip());
      else if (k < 0.74) add('chain_post', x, y, 1, f);
      else if (k < 0.84) add('brazier', x, y, 1, flip());
      else if (k < 0.92) add(`pillar_broken_${Math.floor(r() * 2)}`, x, y, 1, f);
      else add(`bone_pile_${Math.floor(r() * 2)}`, x, y, 1, flip());
    }
    // a meat rack and some bones, further in, where the lava has retreated
    add('meat_hook_rack', at(150 + r() * 30), 540 + r() * 160, 0.9, flip());
    add(`bone_pile_${Math.floor(r() * 2)}`, at(70 + r() * 30), 880 + r() * 60, 1, flip());
  }

  // ---- in play: obstacles the horde walks round
  const n = Math.round(2 + (1.7 * W) / 720);
  const spots = [];
  let ribs = 0;
  for (let tries = 0; spots.length < n && tries < 200; tries++) {
    const x = 170 + r() * (W - 340);
    const y = 300 + r() * 470;
    if (spots.some((p) => (p.x - x) ** 2 + ((p.y - y) * 1.6) ** 2 < 300 * 300)) continue;
    spots.push({ x, y });
    const k = r();
    if (k < 0.55) add(rock(), x, y, 1, flip(), true);
    else if (k < 0.7 && ribs < 1 + Math.floor(W / 1200)) {
      ribs++;
      add('ribcage', x, y, 0.9, flip(), true);
    } else if (k < 0.85) add('demon_statue', x, y, 0.85, flip(), true);
    else add('cage', x, y, 1, flip(), true);
  }

  // ---- beyond the edges, only seen on very wide screens: past the rivers
  for (const side of [-1, 1]) {
    const out = (d) => (side < 0 ? -d : W + d);
    for (let y = -300 + r() * 120; y < 1500; y += 170 + r() * 90) {
      const k = r();
      const x = out(290 + r() * 110);
      if (k < 0.3) add(rock(), x, y, 0.95 + r() * 0.2, flip());
      else if (k < 0.58) add(spike(), x, y, 0.95 + r() * 0.3, flip());
      else if (k < 0.72) add('skull_totem', x, y, 1, flip());
      else if (k < 0.86) add(`pillar_broken_${Math.floor(r() * 2)}`, x, y, 1, -side);
      else add('brazier', x, y, 1, flip());
    }
    for (let y = -200 + r() * 200; y < 1500; y += 300 + r() * 200) {
      add(pick(['ribcage', 'demon_statue', 'cage', 'meat_hook_rack', 'bone_pile_1']), out(560 + r() * 160), y, 1, flip());
    }
    for (let y = -400 + r() * 100; y < 1600; y += 260 + r() * 100) add(spike(), out(860 + r() * 120), y, 1.15, flip());
  }
  return props;
}

// The ground for a field W wide (src/gl/ground/hell.js has what every number means).
export function ground(W) {
  return {
    kind: 2,
    rect: { x: -1000, y: -820, w: W + 2000, h: 2400 },
    seed: 3.7,
    field: [W, 1280],
    glow: true, // lava glows: the ground bakes an emissive layer
    // basalt dark, basalt light, ash, bone, crust / obsidian, lava, lava hot, scorch
    colors: ['#2c2832', '#443d4d', '#403b43', '#cdbf9c', '#1b1120', '#ff5a10', '#ffc548', '#7c2e16'].map(lin),
    params: [
      [10, 105, 120, 62], // top river: centre y, half width, southernmost bank y; side rivers bulge inward by up to this many u
      [150, 200, 6, 1.0], // plate size, side river width, side river's inner edge at rest (from the field edge), crack glow gain
      [0.34, 0.8, 130, 1.0], // bone rate, ash amount, heat reach, lava glow gain
      [200, 520, 0.8, 1.4], // calm zone: distance from the side edges, top y; plate brightness gain; ember specks gain
    ],
  };
}

export const scenery = (W) => field(13, W);

// Deep red-orange light coming up from the lava, a dim warm key, a red haze over the far top of the field.
export const look = {
  key: [-0.3, 0.5, 0.81, 0],
  keyCol: [0.66, 0.38, 0.26, 0],
  ambTop: [0.42, 0.28, 0.34, 0],
  ambBot: [0.78, 0.3, 0.15, 0],
  rim: [1.0, 0.42, 0.14, 0.7],
  fog: [0.3, 0.06, 0.03, 0.3],
  bloomThreshold: 1.1,
};

// DRAFT, for the lead to tune: clearly harder than chapters 1 and 2 (the chapter multiplier on health and speed comes on top).
// Hounds from wave 1, imps from wave 2, exploders, knights and every earlier creature mixed in; wave 5 is the Abomination.
export const waves = [
  {
    name: 'The Gates of Hell',
    sub: 'They are fast here',
    barrels: 4,
    events: [
      // the first hounds come a few at a time, so their pounce can be learnt
      { t: 0.5, group: 'shambler', n: 10, pattern: 'line' },
      { t: 1.5, stream: 'shambler', every: [1.1, 0.55], until: 55 },
      { t: 5, group: 'hound', n: 2, pattern: 'flank' },
      { t: 8, stream: 'runner', every: [3.2, 2.0], until: 55 },
      { t: 15, group: 'hound', n: 3, pattern: 'line' },
      { t: 16, pickup: 'heart' },
      { t: 20, group: 'exploder', n: 3, pattern: 'cluster' },
      { t: 24, group: 'brute', n: 2, pattern: 'flank' },
      { t: 32, stream: 'hound', every: [11, 7], until: 55 },
      { t: 30, group: 'shambler', n: 32, pattern: 'wall' },
      { t: 34, pickup: 'shield' },
      { t: 38, group: 'runner', n: 8, pattern: 'flank' },
      { t: 42, group: 'hound', n: 4, pattern: 'swarm' },
      { t: 48, group: 'brute', n: 2, pattern: 'line', elite: 1 },
    ],
  },
  {
    name: 'Imps',
    sub: 'Look up',
    barrels: 4,
    events: [
      { t: 1, stream: 'shambler', every: [0.9, 0.45], until: 58 },
      { t: 3, group: 'imp', n: 10, pattern: 'swarm' },
      { t: 8, stream: 'imp', every: [4.5, 2.4], until: 58, n: 3 },
      { t: 10, group: 'hound', n: 6, pattern: 'flank' },
      { t: 14, pickup: 'magnet' },
      { t: 16, group: 'knight', n: 2, pattern: 'line' },
      { t: 20, group: 'exploder', n: 4, pattern: 'swarm' },
      { t: 24, stream: 'runner', every: [2.4, 1.3], until: 58 },
      { t: 28, group: 'imp', n: 16, pattern: 'swarm' },
      { t: 32, group: 'spitter', n: 4, pattern: 'flank' },
      { t: 34, pickup: 'lightning' },
      { t: 38, group: 'brute', n: 3, pattern: 'line' },
      { t: 42, group: 'hound', n: 12, pattern: 'wall' },
      { t: 46, group: 'knight', n: 3, pattern: 'flank' },
      { t: 50, group: 'imp', n: 20, pattern: 'swarm' },
      { t: 54, pickup: 'heart' },
    ],
  },
  {
    name: 'The Iron Legion',
    sub: 'Shields up',
    barrels: 5,
    events: [
      { t: 1, stream: 'shambler', every: [0.7, 0.35], until: 60 },
      { t: 3, group: 'knight', n: 4, pattern: 'line' },
      { t: 9, group: 'exploder', n: 5, pattern: 'cluster' },
      { t: 12, stream: 'hound', every: [5, 2.8], until: 60 },
      { t: 15, pickup: 'shield' },
      { t: 18, group: 'knight', n: 5, pattern: 'flank' },
      { t: 22, stream: 'imp', every: [4, 2.2], until: 60, n: 3 },
      { t: 26, group: 'brute', n: 3, pattern: 'line' },
      { t: 30, group: 'spitter', n: 6, pattern: 'line' },
      { t: 33, pickup: 'freeze' },
      { t: 36, group: 'knight', n: 7, pattern: 'wall' },
      { t: 40, group: 'exploder', n: 8, pattern: 'swarm' },
      { t: 44, group: 'brute', n: 3, pattern: 'flank', elite: 1 },
      { t: 48, group: 'hound', n: 14, pattern: 'swarm' },
      { t: 52, group: 'knight', n: 6, pattern: 'cluster', elite: 1 },
      { t: 56, pickup: 'heart' },
    ],
  },
  {
    name: 'The Pit',
    sub: 'Everything at once',
    barrels: 6,
    events: [
      { t: 1, stream: 'shambler', every: [0.5, 0.25], until: 62 },
      { t: 2, group: 'spider', n: 60, pattern: 'swarm' },
      { t: 6, stream: 'hound', every: [3.6, 1.8], until: 62 },
      { t: 10, group: 'imp', n: 18, pattern: 'swarm' },
      { t: 14, pickup: 'magnet' },
      { t: 16, group: 'knight', n: 6, pattern: 'line' },
      { t: 20, group: 'exploder', n: 8, pattern: 'wall' },
      { t: 24, group: 'brute', n: 4, pattern: 'flank' },
      { t: 28, pickup: 'lightning' },
      { t: 30, group: 'spider', n: 100, pattern: 'swarm' },
      { t: 34, group: 'spitter', n: 8, pattern: 'line' },
      { t: 37, stream: 'runner', every: [1.4, 0.7], until: 62 },
      { t: 40, group: 'hound', n: 16, pattern: 'swarm' },
      { t: 44, group: 'knight', n: 8, pattern: 'flank', elite: 1 },
      { t: 48, pickup: 'freeze' },
      { t: 50, group: 'imp', n: 24, pattern: 'swarm' },
      { t: 54, group: 'brute', n: 5, pattern: 'line', elite: 1 },
      { t: 58, pickup: 'heart' },
    ],
  },
  {
    name: 'The Abomination',
    sub: 'Made of everyone',
    barrels: 4,
    boss: true,
    events: [
      { t: 1.5, boss: 'abom' },
      // its gut spills spiders and exploders; hounds and imps keep coming through the gate
      { t: 8, stream: 'shambler', every: [1.5, 0.75], until: 999 },
      { t: 16, stream: 'hound', every: [8, 5], until: 999 },
      { t: 24, stream: 'imp', every: [8, 5], until: 999, n: 2 },
      { t: 44, stream: 'runner', every: [5, 3], until: 999 },
      { t: 18, pickup: 'heart' },
      { t: 40, pickup: 'shield' },
      { t: 55, pickup: 'heart' },
      { t: 70, pickup: 'bomb' },
      { t: 85, pickup: 'lightning' },
    ],
  },
];
