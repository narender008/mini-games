// Chapter 2, the Graveyard: a moonlit night, cold fog, mossy stones. A cobbled path runs down the middle under the gate the horde
// pours through, grave plots stand in rows toward the sides, a crypt guards each top corner. The Gilded Summoner.
import { rng, lin } from '../../config.js';

// Numbers shared with the ground shader (src/gl/ground/graveyard.js): the plots are laid out on the same grid, so the tombstones
// stand exactly on the plots the shader draws.
const PATH_HALF = 118; // half width of the path on a 720 u field; it grows with sqrt(W / 720)
const PLOT_GAP = 58; // between the path edge and the first column of plots
const PLOT = { px: 150, py: 210, w: 98, l: 150 }; // column pitch, row pitch, plot width, plot length
const GATE_Y = 100; // the fence line across the top

// The battlefield, laid out for a field W units wide. Props are atlas sprites (blender/graveyard.py); x, y is the ground point.
//   top edge: a spiked iron fence with gaps where the horde pours through, a broken gate at the centre (one per ~1100 u of field),
//             lanterns and angels beside it, a crypt in each top corner (they block); dead trees and stones behind it
//   further up (tall phones): rows of stones, trees and fences
//   plots: rows of graves on both sides of the path, a stone on most of them, candles, urns and bones here and there
//   side edges: a lantern post down each side edge, candles, urns and dead trees just beyond
//   in play: a crypt, the hearse, a pair of coffins, a tomb cluster or an angel the horde walks round (`block`)
//   beyond the edges (very wide screens only): trees, stones, fences, more crypts
function field(seed, W) {
  const r = rng(seed);
  const props = [];
  const add = (name, x, y, scale = 1, flip = 1, block = false) => props.push({ name, x, y, scale, flip, block });
  const flip = () => (r() < 0.5 ? 1 : -1);
  const stone = () => `tombstone_${Math.floor(r() * 4)}`;
  const tree = () => `dead_tree_${Math.floor(r() * 3)}`;
  const mid = W / 2;
  const half = PATH_HALF * Math.sqrt(W / 720);

  // ---- the top edge: gates, fence between them, crypts in the corners
  const nGates = Math.max(1, Math.round(W / 1100));
  const gates = [];
  for (let i = 0; i < nGates; i++) gates.push(((i + 0.5) * W) / nGates);
  for (const gx of gates) {
    add('gate_iron', gx, GATE_Y + 6, 1, 1);
    for (const s of [-1, 1]) {
      add('lantern_post', gx + s * 160, GATE_Y + 34, 1, s);
      add('angel_statue', gx + s * 330, GATE_Y + 70, 0.8, -s);
    }
  }
  for (let x = -60; x < W + 90; x += 158) {
    if (gates.some((g) => Math.abs(x - g) < 205)) continue;
    const k = r();
    if (k < 0.18) {
      // a gap the horde walks through, with a few stones and bones left in it
      add(k < 0.09 ? 'bones_0' : 'skull_pile', x, GATE_Y + 22, 0.9, flip());
      continue;
    }
    add('fence_iron', x + r() * 8, GATE_Y + r() * 8 - 4, 1, flip());
    const q = r();
    if (q < 0.14) add(stone(), x + 10, GATE_Y + 44, 0.95, flip());
    else if (q < 0.22) add('candles', x + 30, GATE_Y + 40, 0.9, flip());
    else if (q < 0.26) add('urn', x - 20, GATE_Y + 50, 0.85, flip());
  }
  // a crypt in each top corner, wide screens get more across the top
  const crypts = [70, W - 70];
  for (let x = 700; x < W - 700; x += 640 + r() * 200) if (gates.every((g) => Math.abs(x - g) > 420)) crypts.push(x);
  for (const x of crypts) add('crypt', x, 262, 0.8 + r() * 0.1, flip(), true);
  // trees and stones behind the fence
  for (let x = 120 + r() * 140; x < W - 100; x += 300 + r() * 260) {
    if (crypts.some((c) => Math.abs(x - c) < 230) || gates.some((g) => Math.abs(x - g) < 260)) continue;
    add(r() < 0.6 ? tree() : stone(), x, GATE_Y - 10 - r() * 40, 0.95 + r() * 0.15, flip());
  }
  // further up the cemetery (phones show more of it): stones, trees, fences and angels
  for (let x = 40 + r() * 100; x < W - 40; x += 150 + r() * 120) {
    if (Math.abs(x - mid) < half + 50) continue; // the path runs on up under the gate
    const k = r();
    const y = -90 - r() * 420;
    if (k < 0.34) add(stone(), x, y, 1, flip());
    else if (k < 0.52) add(tree(), x, y, 1, flip());
    else if (k < 0.72) add('fence_iron', x, y, 1, flip());
    else if (k < 0.82) add('angel_statue', x, y, 1, flip());
    else if (k < 0.92) add('crypt', x, y - 80, 0.9, flip());
    else add('candles', x, y, 1, flip());
  }

  // ---- the plots: a stone at the head of most of them (the shader draws the kerbs and mounds on the same grid)
  const plotAt = (side, c, row) => ({
    x: mid + side * (half + PLOT_GAP + PLOT.px * (c + 0.5)),
    y: (row + 0.5) * PLOT.py - (c % 2) * PLOT.py * 0.5,
  });
  for (const side of [-1, 1]) {
    for (let c = 0; ; c++) {
      const cx = plotAt(side, c, 0).x;
      if (cx < -520 || cx > W + 520) break;
      for (let row = -4; row < 8; row++) {
        const p = plotAt(side, c, row);
        const out = p.x < -40 || p.x > W + 40; // plots beyond the edges are only seen on very wide screens
        if (out && r() < 0.35) continue;
        const head = p.y - PLOT.l / 2 + 20; // the stone end of the plot is its top
        // in play the field must stay readable: a few low stones up the field, only flat things near the hero
        const inPlay = !out && head > 200 && p.y < 1300;
        if (inPlay) {
          const k = r();
          if (head < 900 && k < 0.16) add(r() < 0.5 ? 'tombstone_0' : 'tombstone_2', p.x + r() * 10 - 5, head, 0.85 + r() * 0.1, flip());
          else if (k < 0.24) add(`bones_${Math.floor(r() * 2)}`, p.x + r() * 20 - 10, p.y + 20, 1, flip());
          else if (k < 0.29) add('candles', p.x + (r() < 0.5 ? -34 : 34), p.y + 38 + r() * 20, 0.85, flip());
          continue;
        }
        const k = r();
        if (k < 0.56) add(stone(), p.x + r() * 10 - 5, head, 0.92 + r() * 0.16, flip());
        else if (k < 0.65) add('grave_open', p.x + 6, p.y + 6, 0.6, flip());
        else if (k < 0.73) add('urn', p.x, head + 4, 0.8, flip());
        else if (k < 0.8) add(`bones_${Math.floor(r() * 2)}`, p.x + r() * 20 - 10, p.y + 20, 1, flip());
        // candles on the kerb now and then
        if (r() < 0.2) add('candles', p.x + (r() < 0.5 ? -34 : 34), p.y + 38 + r() * 20, 0.85, flip());
        if (r() < 0.05) add('skull_pile', p.x + 10, p.y + 44, 0.8, flip());
      }
    }
  }

  // ---- the side edges: a lantern post every ~300 u, candles and urns between, dead trees just outside
  for (const side of [0, 1]) {
    const at = (d) => (side ? W - d : d);
    for (let y = 190 + r() * 80; y < 1000; y += 290 + r() * 70) add('lantern_post', at(30), y, 1, side ? -1 : 1);
    for (let y = 300 + r() * 120; y < 1100; y += 230 + r() * 150) {
      const k = r();
      add(k < 0.4 ? 'candles' : k < 0.6 ? 'urn' : k < 0.8 ? `bones_${Math.floor(r() * 2)}` : 'skull_pile', at(26 + r() * 20), y, 0.9, side ? -1 : 1);
    }
    for (let y = 130 + r() * 200; y < 1400; y += 320 + r() * 200) add(tree(), at(-60 - r() * 40), y, 0.95 + r() * 0.2, flip());
  }

  // ---- in play: things the horde must go round
  const n = Math.round(2 + (1.7 * W) / 720);
  const spots = [];
  let hearse = false;
  for (let tries = 0; spots.length < n && tries < 200; tries++) {
    const x = 170 + r() * (W - 340);
    const y = 390 + r() * 380;
    if (spots.some((p) => (p.x - x) ** 2 + ((p.y - y) * 1.6) ** 2 < 300 * 300)) continue;
    spots.push({ x, y });
    const k = r();
    if (k < 0.3 && !hearse) {
      hearse = true; // one wrecked hearse is a sight; three is a car park
      add('hearse', x, y + 20, 1, flip(), true);
    } else if (k < 0.6) {
      add('coffin', x - 80, y, 1, 1, true);
      add('coffin', x + 80, y + 14, 1, -1, true);
    } else if (k < 0.88) {
      add('tomb', x, y, 1, flip(), true);
      add('tombstone_0', x - 105, y + 10, 1, 1, true);
      add('tombstone_3', x + 105, y - 4, 1, -1, true);
    } else add('angel_statue', x, y + 30, 1, flip(), true);
  }

  // ---- beyond the edges, only seen on very wide screens: a wooded, crowded graveyard
  for (const side of [-1, 1]) {
    const out = (d) => (side < 0 ? -d : W + d);
    for (let y = -300 + r() * 120; y < 1500; y += 160 + r() * 90) add(r() < 0.55 ? tree() : stone(), out(190 + r() * 120), y, 0.9 + r() * 0.3, flip());
    for (let y = -200 + r() * 200; y < 1500; y += 280 + r() * 200) {
      const k = r();
      add(k < 0.3 ? 'fence_iron' : k < 0.5 ? 'angel_statue' : k < 0.7 ? 'candles' : k < 0.85 ? 'skull_pile' : 'urn', out(380 + r() * 140), y, 1, flip());
    }
    add('hearse', out(420), 700 + r() * 300, 1, side);
    for (let y = -420; y < 1600; y += 420 + r() * 120) add('crypt', out(700 + r() * 80), y, 1.05, flip());
  }
  return props;
}

// The ground for a field W wide (src/gl/ground/graveyard.js has what every number means).
export function ground(W) {
  return {
    kind: 1,
    rect: { x: -1000, y: -820, w: W + 2000, h: 2400 },
    seed: 2.3,
    field: [W, 1280],
    glow: true, // puddles shimmer and the sigil under the gate glows: the ground bakes an emissive layer
    // soil, mud / fresh earth, grass dark, grass light, cobble, kerb stone, dead leaves, cold glow
    colors: ['#2e2629', '#4e3d34', '#1b3a38', '#2f5f55', '#4f566c', '#656d84', '#7a4f2c', '#8fc4ff'].map(lin),
    params: [
      [PATH_HALF, 14, 36, PLOT_GAP], // path half width at 720 u, meander, flare at the gate, gap to the plots
      [PLOT.px, PLOT.py, PLOT.w, PLOT.l], // plot column pitch, row pitch, width, length
      [0.55, 0.8, 0.7, 7], // puddles, leaves, roots, kerb stone width
      [150, 235, 0.2, 560], // sigil centre y, sigil radius, glow strength, where the plots stop beyond the field edges
    ],
  };
}

export const scenery = (W) => field(11, W);

// A cold blue moon high to the right, deep violet shadow, a little blue fog over the far top of the field.
export const look = {
  key: [0.4, 0.52, 0.75, 0],
  keyCol: [0.5, 0.6, 0.8, 0],
  ambTop: [0.3, 0.29, 0.48, 0],
  ambBot: [0.15, 0.13, 0.26, 0],
  rim: [0.55, 0.75, 1.0, 0.6],
  fog: [0.2, 0.2, 0.42, 0.28],
  bloomThreshold: 0.9,
};

// DRAFT, for the lead to tune: a step up from chapter 1 (the chapter multiplier on health and speed comes on top). Exploders from
// wave 1 (two, at the end), then more of them; knights arrive in wave 3, imps in wave 4; wave 5 is the Gilded Summoner.
export const waves = [
  {
    name: 'Restless Dead',
    sub: 'Something is digging',
    events: [
      { t: 0.5, group: 'shambler', n: 8, pattern: 'line' },
      { t: 2, stream: 'shambler', every: [1.3, 0.65], until: 52 },
      { t: 8, stream: 'runner', every: [3.6, 2.2], until: 52 },
      { t: 14, group: 'shambler', n: 12, pattern: 'cluster' },
      { t: 18, pickup: 'heart' },
      { t: 22, group: 'spider', n: 24, pattern: 'swarm' },
      { t: 28, group: 'runner', n: 8, pattern: 'flank' },
      { t: 32, pickup: 'bomb' },
      { t: 36, group: 'exploder', n: 2, pattern: 'center' },
      { t: 42, group: 'shambler', n: 24, pattern: 'wall' },
      { t: 48, group: 'exploder', n: 2, pattern: 'flank' },
    ],
  },
  {
    name: 'Powder Keg',
    sub: 'Do not let them touch you',
    events: [
      { t: 1, stream: 'shambler', every: [0.88, 0.44], until: 56 },
      { t: 3, group: 'exploder', n: 4, pattern: 'line' },
      { t: 8, stream: 'runner', every: [2.4, 1.44], until: 56 },
      { t: 12, group: 'brute', n: 3, pattern: 'flank' },
      { t: 16, group: 'exploder', n: 5, pattern: 'cluster' },
      { t: 20, pickup: 'shield' },
      { t: 24, group: 'spitter', n: 4, pattern: 'line' },
      { t: 28, group: 'shambler', n: 38, pattern: 'wall' },
      { t: 32, group: 'exploder', n: 7, pattern: 'swarm' },
      { t: 36, pickup: 'magnet' },
      { t: 40, group: 'brute', n: 4, pattern: 'line' },
      { t: 44, group: 'spider', n: 68, pattern: 'swarm' },
      { t: 48, group: 'exploder', n: 8, pattern: 'wall' },
      { t: 52, pickup: 'heart' },
    ],
  },
  {
    name: 'Iron Wake',
    sub: 'Shields up',
    events: [
      { t: 1, stream: 'shambler', every: [0.8, 0.4], until: 58 },
      { t: 3, group: 'knight', n: 3, pattern: 'line' },
      { t: 10, stream: 'runner', every: [2.24, 1.28], until: 58 },
      { t: 14, group: 'exploder', n: 4, pattern: 'cluster' },
      { t: 18, group: 'knight', n: 4, pattern: 'flank' },
      { t: 22, pickup: 'freeze' },
      { t: 26, group: 'brute', n: 4, pattern: 'line' },
      { t: 30, group: 'spitter', n: 5, pattern: 'flank' },
      { t: 34, group: 'knight', n: 5, pattern: 'line' },
      { t: 38, pickup: 'lightning' },
      { t: 40, group: 'shambler', n: 54, pattern: 'wall' },
      { t: 44, group: 'exploder', n: 7, pattern: 'swarm' },
      { t: 48, group: 'knight', n: 7, pattern: 'wall', elite: 1 },
      { t: 54, pickup: 'heart' },
    ],
  },
  {
    name: 'Night Wings',
    sub: 'Look up',
    events: [
      { t: 1, stream: 'shambler', every: [0.72, 0.36], until: 60 },
      { t: 3, group: 'imp', n: 11, pattern: 'swarm' },
      { t: 9, stream: 'imp', every: [4.0, 2.08], until: 60, n: 3 },
      { t: 12, group: 'knight', n: 4, pattern: 'line' },
      { t: 16, pickup: 'magnet' },
      { t: 18, group: 'exploder', n: 5, pattern: 'flank' },
      { t: 22, group: 'spider', n: 81, pattern: 'swarm' },
      { t: 26, group: 'brute', n: 4, pattern: 'flank' },
      { t: 30, group: 'imp', n: 19, pattern: 'swarm' },
      { t: 34, pickup: 'shield' },
      { t: 36, group: 'knight', n: 7, pattern: 'wall' },
      { t: 40, stream: 'runner', every: [1.6, 0.88], until: 60 },
      { t: 44, group: 'spitter', n: 8, pattern: 'line' },
      { t: 48, group: 'imp', n: 24, pattern: 'swarm' },
      { t: 52, group: 'exploder', n: 8, pattern: 'swarm' },
      { t: 56, pickup: 'heart' },
    ],
  },
  {
    name: 'The Gilded Summoner',
    sub: 'Golden hands, empty pockets',
    boss: true,
    events: [
      { t: 1.5, boss: 'demon' },
      // the Summoner brings imps, exploders and knights through its portals; the dead keep shambling in
      { t: 8, stream: 'shambler', every: [1.6, 0.8], until: 999 },
      { t: 16, stream: 'runner', every: [5, 3], until: 999 },
      { t: 18, pickup: 'heart' },
      { t: 40, pickup: 'shield' },
      { t: 55, pickup: 'heart' },
      { t: 70, pickup: 'bomb' },
      { t: 85, pickup: 'lightning' },
    ],
  },
];
