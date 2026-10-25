// Hand-written wave scripts for the five sectors (8 waves each) and the
// director that plays them. A wave is a timeline of groups:
//
//   [t, type, form, n, x, opts]
//     t     seconds after the wave starts
//     type  enemy id (data.js ENEMIES)
//     form  'v' (V formation), 'col' (one after another on a path), 'line'
//           (spread across the field), 'pair' (mirrored at +-x), 'single',
//           'edges' (turret pods on both side rails, n per side)
//     n     count on a laptop-wide field; scaled down on narrow fields
//           (except pair, single and edges)
//     x     centre (v, col, single) or half-span (line, pair) as a fraction
//           of the usable half-width, -1..1
//     opts  path ('weave' | 'swoopL' | 'swoopR' | 'dipL' | 'dipR' | 'hover' |
//           'drop'), hy (hover height 0..1 from the player zone up), dir
//           (minelayer side), stay, amp, gap, vy
//
// Each sector introduces one new threat at a time (waves 2 and 4 usually)
// and escalates in density; later sectors also scale hp, fire rate and
// bullet speed (data.js SECTORS diff). When the field empties before the
// next group is due, the clock jumps ahead so waves never idle.
import { clamp } from './rng.js';
import { spawnEnemy } from './enemies.js';
import { ZONE_TOP } from './player.js';

const L = { path: 'swoopL' };
const R = { path: 'swoopR' };

export const WAVES = {
  // 1 Asteroid Belt: darts, gunships, divers late
  belt: [
    [[0, 'dart', 'v', 5, -0.4], [3.5, 'dart', 'v', 5, 0.4], [7, 'dart', 'col', 6, 0, L], [11, 'dart', 'col', 6, 0, R], [15, 'dart', 'v', 7, 0], [19, 'dart', 'line', 6, 0.8, { amp: 0.8 }], [23, 'dart', 'v', 5, -0.5], [23, 'dart', 'v', 5, 0.5]],
    [[0, 'dart', 'v', 5, 0], [3, 'gunship', 'single', 1, 0, { hy: 0.6 }], [9, 'dart', 'col', 6, 0, L], [10, 'dart', 'col', 6, 0, R], [15, 'gunship', 'pair', 2, 0.5], [19, 'dart', 'v', 7, 0], [24, 'dart', 'line', 7, 0.85]],
    [[0, 'dart', 'col', 8, 0, L], [2, 'dart', 'col', 8, 0, R], [6, 'gunship', 'pair', 2, 0.6], [10, 'dart', 'v', 7, -0.3], [13, 'dart', 'v', 7, 0.3], [17, 'gunship', 'single', 1, 0], [20, 'dart', 'line', 8, 0.85], [24, 'dart', 'col', 8, -0.5, { path: 'dipL' }]],
    [[0, 'gunship', 'line', 3, 0.6, { hy: 0.6 }], [4, 'dart', 'col', 6, 0, L], [8, 'dart', 'col', 6, 0, R], [13, 'dart', 'v', 9, 0], [17, 'gunship', 'pair', 2, 0.75, { hy: 0.45 }], [21, 'dart', 'v', 5, -0.6], [21, 'dart', 'v', 5, 0.6], [26, 'dart', 'line', 8, 0.85]],
    [[0, 'dart', 'col', 10, 0, L], [0, 'dart', 'col', 10, 0, R], [6, 'gunship', 'line', 3, 0.7], [11, 'dart', 'v', 9, -0.4], [13, 'dart', 'v', 9, 0.4], [18, 'dart', 'col', 10, 0.5, { path: 'dipR' }], [20, 'gunship', 'single', 1, 0, { hy: 0.4 }], [25, 'dart', 'line', 10, 0.9]],
    [[0, 'dart', 'v', 7, 0], [3, 'diver', 'single', 1, 0], [7, 'diver', 'pair', 2, 0.5], [10, 'dart', 'col', 8, 0, L], [13, 'gunship', 'pair', 2, 0.6], [17, 'diver', 'line', 3, 0.6], [21, 'dart', 'v', 9, 0], [25, 'diver', 'pair', 2, 0.3]],
    [[0, 'gunship', 'line', 3, 0.65], [3, 'diver', 'pair', 2, 0.7], [7, 'dart', 'col', 10, 0, R], [9, 'diver', 'single', 1, 0], [12, 'dart', 'v', 9, 0], [15, 'gunship', 'pair', 2, 0.4, { hy: 0.4 }], [19, 'diver', 'line', 4, 0.7], [23, 'dart', 'col', 10, 0, L], [23, 'dart', 'col', 10, 0, R]],
    [[0, 'dart', 'v', 9, -0.4], [0, 'dart', 'v', 9, 0.4], [4, 'gunship', 'line', 4, 0.75], [8, 'diver', 'line', 3, 0.6], [12, 'dart', 'col', 12, 0, L], [14, 'dart', 'col', 12, 0, R], [18, 'gunship', 'pair', 2, 0.35, { hy: 0.35 }], [20, 'diver', 'line', 4, 0.8], [25, 'dart', 'line', 10, 0.9], [27, 'gunship', 'single', 1, 0]],
  ],
  // 2 Ion Storm: + snipers (wave 2), turret pods (wave 4)
  storm: [
    [[0, 'dart', 'v', 7, 0], [3, 'gunship', 'pair', 2, 0.6], [7, 'dart', 'col', 8, 0, L], [9, 'dart', 'col', 8, 0, R], [13, 'diver', 'pair', 2, 0.6], [17, 'dart', 'v', 9, 0], [20, 'gunship', 'single', 1, 0], [24, 'dart', 'line', 8, 0.85]],
    [[0, 'dart', 'v', 7, 0], [3, 'sniper', 'single', 1, 0], [9, 'dart', 'col', 8, 0, L], [12, 'sniper', 'pair', 2, 0.6], [17, 'dart', 'v', 7, -0.4], [19, 'dart', 'v', 7, 0.4], [22, 'gunship', 'single', 1, 0]],
    [[0, 'sniper', 'pair', 2, 0.7], [2, 'dart', 'col', 8, 0, R], [6, 'gunship', 'pair', 2, 0.4], [11, 'dart', 'v', 9, 0], [14, 'sniper', 'line', 3, 0.6], [18, 'diver', 'pair', 2, 0.5], [22, 'dart', 'col', 10, 0, L]],
    [[0, 'turret', 'edges', 1, 0], [2, 'dart', 'v', 7, 0], [7, 'dart', 'col', 8, 0, L], [11, 'turret', 'edges', 2, 0], [14, 'gunship', 'single', 1, 0], [18, 'dart', 'v', 9, 0], [22, 'sniper', 'single', 1, 0], [25, 'dart', 'col', 8, 0, R]],
    [[0, 'turret', 'edges', 2, 0], [2, 'gunship', 'line', 3, 0.6], [8, 'dart', 'col', 10, 0, R], [11, 'sniper', 'pair', 2, 0.5], [15, 'dart', 'v', 9, 0], [19, 'turret', 'edges', 2, 0], [21, 'gunship', 'pair', 2, 0.7], [25, 'dart', 'line', 8, 0.85]],
    [[0, 'diver', 'line', 3, 0.6], [3, 'sniper', 'pair', 2, 0.75], [7, 'dart', 'col', 10, 0, L], [8, 'dart', 'col', 10, 0, R], [13, 'turret', 'edges', 2, 0], [15, 'diver', 'line', 4, 0.7], [20, 'gunship', 'line', 3, 0.6], [25, 'dart', 'v', 9, 0]],
    [[0, 'gunship', 'line', 3, 0.65], [2, 'turret', 'edges', 2, 0], [6, 'sniper', 'line', 3, 0.7], [10, 'diver', 'pair', 2, 0.5], [13, 'dart', 'col', 10, 0, L], [16, 'dart', 'v', 9, 0], [19, 'turret', 'edges', 2, 0], [21, 'diver', 'line', 3, 0.6], [25, 'gunship', 'pair', 2, 0.4]],
    [[0, 'turret', 'edges', 3, 0], [1, 'dart', 'v', 9, -0.4], [1, 'dart', 'v', 9, 0.4], [6, 'sniper', 'line', 3, 0.7], [9, 'gunship', 'line', 3, 0.6], [14, 'diver', 'line', 4, 0.7], [18, 'dart', 'col', 12, 0, L], [18, 'dart', 'col', 12, 0, R], [22, 'sniper', 'pair', 2, 0.4], [24, 'gunship', 'pair', 2, 0.75], [27, 'turret', 'edges', 2, 0]],
  ],
  // 3 Scrap Foundry: + bulwarks (wave 2), mine layers (wave 4)
  foundry: [
    [[0, 'dart', 'v', 9, 0], [2, 'turret', 'edges', 2, 0], [5, 'gunship', 'pair', 2, 0.6], [9, 'sniper', 'single', 1, 0], [12, 'dart', 'col', 10, 0, L], [15, 'diver', 'pair', 2, 0.6], [19, 'dart', 'v', 9, 0], [22, 'gunship', 'single', 1, 0]],
    [[0, 'dart', 'v', 7, 0], [3, 'bulwark', 'single', 1, 0], [9, 'dart', 'col', 8, 0, L], [11, 'dart', 'col', 8, 0, R], [15, 'bulwark', 'pair', 2, 0.55], [21, 'dart', 'v', 9, 0], [24, 'gunship', 'single', 1, 0]],
    [[0, 'bulwark', 'pair', 2, 0.6], [3, 'dart', 'col', 10, 0, R], [7, 'gunship', 'single', 1, 0], [10, 'turret', 'edges', 2, 0], [13, 'diver', 'pair', 2, 0.5], [16, 'bulwark', 'single', 1, 0, { hy: 0.45 }], [20, 'dart', 'v', 9, 0], [23, 'sniper', 'pair', 2, 0.7]],
    [[0, 'minelayer', 'single', 1, 0, { dir: 1 }], [4, 'dart', 'v', 7, 0], [8, 'minelayer', 'single', 1, 0, { dir: -1, hy: 0.45 }], [12, 'dart', 'col', 10, 0, L], [15, 'gunship', 'pair', 2, 0.6], [19, 'minelayer', 'pair', 2, 0], [24, 'dart', 'v', 9, 0]],
    [[0, 'minelayer', 'single', 1, 0, { dir: -1 }], [2, 'turret', 'edges', 2, 0], [5, 'bulwark', 'single', 1, 0], [9, 'dart', 'col', 10, 0, L], [13, 'minelayer', 'pair', 2, 0], [16, 'sniper', 'pair', 2, 0.7], [20, 'dart', 'v', 9, 0], [23, 'gunship', 'pair', 2, 0.5]],
    [[0, 'bulwark', 'line', 3, 0.65], [3, 'sniper', 'single', 1, 0], [7, 'diver', 'line', 3, 0.6], [11, 'dart', 'col', 10, 0, R], [14, 'minelayer', 'single', 1, 0, { dir: 1 }], [17, 'turret', 'edges', 2, 0], [20, 'bulwark', 'pair', 2, 0.4, { hy: 0.45 }], [24, 'dart', 'v', 9, 0]],
    [[0, 'minelayer', 'pair', 2, 0], [2, 'gunship', 'line', 3, 0.65], [6, 'turret', 'edges', 2, 0], [9, 'diver', 'line', 4, 0.7], [13, 'bulwark', 'pair', 2, 0.6], [16, 'dart', 'col', 12, 0, L], [19, 'sniper', 'line', 3, 0.7], [23, 'minelayer', 'single', 1, 0, { dir: -1 }], [25, 'dart', 'v', 9, 0]],
    [[0, 'turret', 'edges', 3, 0], [1, 'bulwark', 'line', 3, 0.6], [5, 'minelayer', 'pair', 2, 0], [9, 'dart', 'col', 12, 0, L], [9, 'dart', 'col', 12, 0, R], [13, 'gunship', 'line', 3, 0.7], [17, 'diver', 'line', 4, 0.75], [20, 'sniper', 'pair', 2, 0.5], [23, 'bulwark', 'pair', 2, 0.35, { hy: 0.45 }], [27, 'minelayer', 'single', 1, 0, { dir: 1 }]],
  ],
  // 4 Hive Nebula: + splitters (wave 2)
  hive: [
    [[0, 'dart', 'v', 9, 0], [2, 'bulwark', 'single', 1, 0], [5, 'turret', 'edges', 2, 0], [8, 'minelayer', 'single', 1, 0, { dir: 1 }], [11, 'dart', 'col', 10, 0, R], [14, 'gunship', 'pair', 2, 0.6], [18, 'sniper', 'single', 1, 0], [21, 'diver', 'line', 3, 0.6]],
    [[0, 'dart', 'v', 7, 0], [3, 'splitter', 'single', 1, 0], [8, 'dart', 'col', 10, 0, L], [11, 'splitter', 'pair', 2, 0.55], [16, 'gunship', 'single', 1, 0], [19, 'splitter', 'line', 3, 0.6], [24, 'dart', 'v', 9, 0]],
    [[0, 'splitter', 'pair', 2, 0.6], [3, 'turret', 'edges', 2, 0], [6, 'dart', 'col', 10, 0, R], [9, 'bulwark', 'single', 1, 0], [13, 'splitter', 'line', 3, 0.7], [17, 'diver', 'pair', 2, 0.5], [20, 'sniper', 'pair', 2, 0.7], [24, 'dart', 'v', 9, 0]],
    [[0, 'minelayer', 'pair', 2, 0], [3, 'splitter', 'single', 1, 0, { hy: 0.45 }], [6, 'dart', 'v', 9, 0], [10, 'gunship', 'line', 3, 0.6], [14, 'splitter', 'pair', 2, 0.7], [17, 'turret', 'edges', 2, 0], [20, 'diver', 'line', 4, 0.7], [24, 'dart', 'col', 12, 0, L]],
    [[0, 'splitter', 'line', 3, 0.6], [2, 'sniper', 'pair', 2, 0.75], [6, 'dart', 'col', 12, 0, R], [9, 'bulwark', 'pair', 2, 0.5], [13, 'minelayer', 'single', 1, 0, { dir: 1 }], [15, 'splitter', 'pair', 2, 0.3, { hy: 0.45 }], [19, 'turret', 'edges', 2, 0], [22, 'gunship', 'pair', 2, 0.7], [25, 'dart', 'v', 9, 0]],
    [[0, 'diver', 'line', 4, 0.7], [3, 'splitter', 'line', 4, 0.7], [8, 'turret', 'edges', 2, 0], [10, 'sniper', 'line', 3, 0.7], [14, 'dart', 'col', 12, 0, L], [14, 'dart', 'col', 12, 0, R], [18, 'bulwark', 'line', 3, 0.6], [22, 'diver', 'line', 4, 0.6], [25, 'splitter', 'pair', 2, 0.5]],
    [[0, 'gunship', 'line', 3, 0.65], [2, 'minelayer', 'pair', 2, 0], [6, 'splitter', 'line', 3, 0.6], [9, 'turret', 'edges', 3, 0], [12, 'diver', 'line', 4, 0.7], [16, 'sniper', 'pair', 2, 0.6], [18, 'dart', 'v', 11, 0], [22, 'bulwark', 'pair', 2, 0.6], [25, 'splitter', 'line', 3, 0.5]],
    [[0, 'turret', 'edges', 3, 0], [1, 'splitter', 'line', 4, 0.7], [5, 'bulwark', 'pair', 2, 0.4], [8, 'dart', 'col', 12, 0, L], [8, 'dart', 'col', 12, 0, R], [12, 'minelayer', 'pair', 2, 0], [15, 'sniper', 'line', 3, 0.7], [18, 'diver', 'line', 4, 0.75], [21, 'gunship', 'line', 3, 0.6], [25, 'splitter', 'line', 4, 0.6], [28, 'diver', 'pair', 2, 0.4]],
  ],
  // 5 The Dreadnought: everything
  dreadnought: [
    [[0, 'dart', 'v', 9, 0], [3, 'gunship', 'pair', 2, 0.6], [7, 'turret', 'edges', 1, 0], [10, 'sniper', 'single', 1, 0], [13, 'diver', 'pair', 2, 0.5], [17, 'dart', 'col', 10, 0, L], [20, 'bulwark', 'single', 1, 0], [24, 'splitter', 'pair', 2, 0.6]],
    [[0, 'bulwark', 'pair', 2, 0.6], [2, 'minelayer', 'single', 1, 0, { dir: 1 }], [5, 'dart', 'col', 12, 0, R], [8, 'splitter', 'line', 3, 0.6], [12, 'sniper', 'line', 3, 0.7], [16, 'diver', 'line', 4, 0.7], [19, 'turret', 'edges', 2, 0], [22, 'gunship', 'pair', 2, 0.5], [25, 'dart', 'v', 11, 0]],
    [[0, 'turret', 'edges', 3, 0], [1, 'gunship', 'line', 4, 0.75], [6, 'diver', 'line', 4, 0.7], [9, 'splitter', 'pair', 2, 0.4], [12, 'minelayer', 'pair', 2, 0], [16, 'dart', 'col', 12, 0, L], [16, 'dart', 'col', 12, 0, R], [20, 'sniper', 'pair', 2, 0.7], [23, 'bulwark', 'line', 3, 0.6]],
    [[0, 'splitter', 'line', 4, 0.7], [3, 'sniper', 'line', 3, 0.7], [6, 'bulwark', 'pair', 2, 0.4], [9, 'dart', 'v', 11, 0], [12, 'turret', 'edges', 2, 0], [14, 'diver', 'line', 4, 0.6], [18, 'minelayer', 'pair', 2, 0], [21, 'gunship', 'line', 3, 0.65], [25, 'splitter', 'pair', 2, 0.6]],
    [[0, 'gunship', 'line', 4, 0.75], [2, 'turret', 'edges', 3, 0], [5, 'diver', 'line', 5, 0.8], [9, 'dart', 'col', 14, 0, L], [11, 'dart', 'col', 14, 0, R], [13, 'bulwark', 'pair', 2, 0.6], [17, 'sniper', 'line', 3, 0.7], [20, 'splitter', 'line', 3, 0.5], [24, 'minelayer', 'single', 1, 0, { dir: -1 }], [26, 'diver', 'line', 4, 0.7]],
    [[0, 'minelayer', 'pair', 2, 0], [2, 'splitter', 'line', 4, 0.7], [6, 'sniper', 'pair', 2, 0.8], [8, 'gunship', 'pair', 2, 0.4], [11, 'turret', 'edges', 3, 0], [14, 'dart', 'v', 11, -0.4], [14, 'dart', 'v', 11, 0.4], [18, 'bulwark', 'line', 3, 0.6], [22, 'diver', 'line', 5, 0.8], [25, 'splitter', 'pair', 2, 0.6]],
    [[0, 'turret', 'edges', 3, 0], [1, 'bulwark', 'line', 3, 0.65], [4, 'sniper', 'line', 3, 0.75], [8, 'diver', 'line', 5, 0.8], [11, 'splitter', 'line', 4, 0.7], [14, 'minelayer', 'pair', 2, 0], [17, 'gunship', 'line', 4, 0.7], [21, 'dart', 'col', 14, 0, L], [21, 'dart', 'col', 14, 0, R], [25, 'diver', 'line', 4, 0.6]],
    [[0, 'turret', 'edges', 3, 0], [0, 'gunship', 'line', 4, 0.75], [4, 'splitter', 'line', 4, 0.7], [7, 'sniper', 'line', 3, 0.75], [10, 'bulwark', 'pair', 2, 0.5], [12, 'minelayer', 'pair', 2, 0], [15, 'diver', 'line', 5, 0.8], [18, 'dart', 'col', 14, 0, L], [18, 'dart', 'col', 14, 0, R], [22, 'turret', 'edges', 2, 0], [24, 'gunship', 'pair', 2, 0.4], [27, 'splitter', 'line', 4, 0.6], [29, 'diver', 'line', 4, 0.7]],
  ],
};

// how many of a formation fit: fewer on narrow (phone portrait) fields
export function countScale(field) {
  return clamp(field.halfW / 18, 0.85, 1);
}

// the height enemies hover at for hy 0..1: measured up from the top of the
// player's zone, capped so tall phone fields don't push them out of reach
export function hoverY(field, hy) {
  const top = -field.halfH + field.halfH * 2 * ZONE_TOP;
  return top + 1.5 + hy * Math.min(field.halfH - top - 2.3, 11.5);
}

const DEFAULT_PATH = { dart: 'weave', gunship: 'hover', diver: 'hover', bulwark: 'hover', minelayer: 'cross', splitter: 'hover', sniper: 'hover', turret: 'edge', shard: 'drop', mine: 'drop' };
const DEFAULT_HY = { gunship: 0.6, diver: 0.75, bulwark: 0.55, splitter: 0.55, sniper: 0.9, minelayer: 0.62 };

// expand a wave script into timed single spawns
export function buildWave(S, n) {
  const f = S.field;
  const script = WAVES[S.def.id][n - 1] || [];
  const k = countScale(f);
  const W = f.halfW - 1.2;
  const top = f.halfH + 1;
  const out = [];
  let gi = 0;
  for (const g of script) {
    const [t0, type, form, n0, x, o = {}] = g;
    gi++;
    const fixed = form === 'pair' || form === 'single' || form === 'edges';
    const n1 = fixed ? n0 : Math.max(1, Math.round(n0 * k));
    const path = o.path || DEFAULT_PATH[type];
    const hy = o.hy ?? DEFAULT_HY[type] ?? 0.6;
    const add = (t, ex, ey, p) => out.push({ t, type, x: ex, y: ey, path: p, g: gi });
    if (form === 'edges') {
      for (let i = 0; i < n0; i++) for (const side of [-1, 1]) add(t0 + i * 2.6, side * (f.halfW - 0.75), top + 0.5, { kind: 'edge', side, scroll: 1.35 });
      continue;
    }
    if (form === 'col') {
      const gap = o.gap || 0.42;
      for (let i = 0; i < n1; i++) add(t0 + i * gap, x * W, top, makePath(S, path, x * W, top, hy, o, 0, i));
      continue;
    }
    const pts = [];
    if (form === 'v') {
      const sx = 1.25 * Math.max(0.75, k);
      for (let i = 0; i < n1; i++) {
        const rank = Math.ceil(i / 2);
        const side = i === 0 ? 0 : i % 2 ? -1 : 1;
        pts.push([x * W + side * rank * sx, top + rank * 0.85]);
      }
    } else if (form === 'line') {
      const span = x * W;
      for (let i = 0; i < n1; i++) pts.push([n1 > 1 ? -span + (2 * span * i) / (n1 - 1) : 0, top + (i % 2) * 0.4]);
    } else if (form === 'pair') {
      pts.push([-x * W, top], [x * W, top]);
    } else pts.push([x * W, top]);
    pts.forEach(([px, py], i) => {
      const p = makePath(S, path, px, py, hy + (form === 'line' && i % 2 ? -0.08 : 0), o, i, i, form === 'pair' ? (i ? 1 : -1) : 0);
      add(t0, px, py, p);
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function makePath(S, kind, x, y, hy, o, idx, order, side = 0) {
  const f = S.field;
  const W = f.halfW - 1.2;
  const H = f.halfH;
  switch (kind) {
    case 'weave':
      return { kind: 'weave', vy: o.vy || -3.1, amp: o.amp ?? 1.4, freq: 1.25, phase: 0 };
    case 'swoopL':
    case 'swoopR': {
      const s = kind === 'swoopL' ? 1 : -1;
      return { kind: 'swoop', sx: -s * W * 0.8, sy: y, cx: -s * W * 0.35, cy: -H * 0.55, ex: s * (f.halfW + 2.5), ey: H * 0.35, dur: o.dur || 5.2 };
    }
    case 'dipL':
    case 'dipR': {
      const s = kind === 'dipL' ? 1 : -1;
      return { kind: 'swoop', sx: x, sy: y, cx: x, cy: -H * 1.05, ex: x + s * W * 0.7, ey: H + 2, dur: o.dur || 5 };
    }
    case 'drop':
      return { kind: 'drop', vy: o.vy || -2.6 };
    case 'cross': {
      const dir = o.dir || (idx % 2 ? -1 : 1);
      return { kind: 'cross', vx: dir * 3.1, y: hoverY(f, idx % 2 ? hy - 0.25 : hy), sx: -dir * (f.halfW + 1.2) };
    }
    case 'hover':
    default:
      return {
        kind: 'hover',
        hx: x,
        hy: hoverY(f, hy),
        stay: o.stay || 10 + order * 0.4,
        strafe: o.strafe ?? Math.min(1.6, f.halfW * 0.1),
        sfreq: 0.5 + (order % 3) * 0.12,
        sphase: order * 1.7 + side,
        lockAt: 1.6 + order * 0.45,
      };
  }
}

// ------------------------------------------------------------ director

export function startWave(S, n) {
  S.wave = n;
  S.waveT = 0;
  S.queue = buildWave(S, n);
  S.qi = 0;
  S.waveHit = false;
  S.events.push({ type: 'waveStart', wave: n, x: 0, y: 0 });
}

// returns true when the wave is cleared
export function stepWave(S, dt) {
  S.waveT += dt;
  const q = S.queue;
  // nothing alive and the next group a while off: bring it forward
  if (S.qi < q.length && S.enemies.length === 0 && q[S.qi].t > S.waveT + 1) S.waveT = q[S.qi].t - 1;
  while (S.qi < q.length && q[S.qi].t <= S.waveT) {
    const s = q[S.qi++];
    const p = s.path;
    let x = s.x;
    let y = s.y;
    if (p.kind === 'swoop') {
      x = p.sx;
      y = p.sy;
    } else if (p.kind === 'cross') {
      x = p.sx;
      y = p.y;
    }
    const e = spawnEnemy(S, s.type, x, y, p);
    e.x0 = x;
    e.y0 = y;
  }
  return S.qi >= q.length && S.enemies.length === 0;
}
