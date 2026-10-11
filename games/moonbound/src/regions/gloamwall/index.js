// Region 1, the Gloamwall: the citadel's outer ramparts under a cold moon.
// A region module names its sprite sets, its wall kit, its look and floor
// shader, its layouts, its encounter tables and its bosses; the run and the
// room builder read nothing else (DESIGN.md "Extending the game").
import { LOOK, FLOOR } from './look.js';
import { LAYOUTS } from './layouts.js';
import { ENCOUNTERS } from './encounters.js';

export const GLOAMWALL = {
  id: 'gloamwall',
  name: 'The Gloamwall',
  subtitle: 'The outer ramparts of Nocthelm',
  card: 'art/ramparts.webp',
  music: 'gloamwall',
  sets: ['gloamwall'],
  look: LOOK,
  floor: { floorSrc: FLOOR.src, floorFn: FLOOR.fn, colors: FLOOR.colors, params: new Float32Array(FLOOR.params.flat()) },
  kit: {
    wallN: ['gw_wall_n_2a', 'gw_wall_n_2b', 'gw_wall_n_2c'],
    wallN1: ['gw_wall_n_1'],
    wallS: ['gw_wall_s_2a', 'gw_wall_s_2b'],
    wallS1: ['gw_wall_s_1'],
    wallSGap: ['gw_wall_s_gap'],
    side1: ['gw_wall_side_1'],
    corner: ['gw_corner'],
    gateClosed: 'gw_gate_closed',
    gateOpen: 'gw_gate_open',
    stairs: 'gw_stairs_s',
    pillar: ['gw_pillar', 'gw_pillar', 'gw_pillar_broken'],
    statueA: 'gw_statue_a',
    statueB: 'gw_statue_b',
    brazier: 'gw_brazier',
    lantern: 'gw_lantern_post',
    obelisk: 'gw_obelisk',
    rubble: ['gw_rubble_a', 'gw_rubble_b', 'gw_rubble_c', 'gw_rubble_d'],
    bones: ['gw_bones_a', 'gw_bones_b', 'gw_bones_c', 'gw_bones_d'],
    urn: ['gw_urn_a', 'gw_urn_b'],
    urnBroken: 'gw_urn_broken',
    banner: 'gw_banner',
    fountain: 'gw_fountain',
    shopTable: 'gw_shop_table',
    pedlar: 'gw_pedlar',
    pedestal: 'gw_pedestal',
    spikes: 'gw_spikes',
    arrowTrap: 'gw_arrow_trap',
    far: ['far_tower_a', 'far_tower_b', 'far_spire', 'far_arch', 'far_bridge', 'far_island_a', 'far_island_b'],
  },
  // light each kind of prop gives off: colour (linear, can exceed 1), radius (m), height (m), flicker 0..1
  lights: {
    brazier: { c: [0.9, 1.45, 2.2], r: 7.5, z: 1.6, flicker: 0.6, flame: 4, fz: 1.35, fs: 0.32 },
    lantern: { c: [0.85, 1.25, 1.8], r: 6, z: 2.0, flicker: 0.3 },
    obelisk: { c: [0.6, 1.0, 1.6], r: 5, z: 1.4, flicker: 0.15 },
    fountain: { c: [0.75, 1.15, 1.7], r: 7, z: 1.2, flicker: 0.1 },
    candles: { c: [2.0, 1.1, 0.45], r: 5, z: 1.1, flicker: 0.8, flame: 3, fz: 1.0, fs: 0.08 },
    pedlar: { c: [0.6, 1.3, 1.6], r: 5, z: 1.6, flicker: 0.4 },
  },
  layouts: LAYOUTS,
  encounters: ENCOUNTERS,
  miniboss: 'gaoler',
  boss: 'seraph',
};
