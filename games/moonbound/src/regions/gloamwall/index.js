// Region 1, the Gloamwall: the citadel's outer ramparts under a cold moon.
// A region module names its sprite sets, its wall kit, its look and floor
// shader, its layouts, its chamber plan, its encounter tables, its bosses and
// the words of its banners, cards and codex pages; the run and the room
// builder read nothing else (DESIGN.md "A region"). It is registered by one
// line in regions/index.js.
import { LOOK, FLOOR } from './look.js';
import { LAYOUTS } from './layouts.js';
import { ENCOUNTERS } from './encounters.js';

export const GLOAMWALL = {
  id: 'gloamwall',
  name: 'The Gloamwall',
  subtitle: 'The outer ramparts of Nocthelm',
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
  // the climb through the region, one chamber kind per step
  plan: ['start', 'combat', 'combat', 'combat', 'combat', 'miniboss', 'shop', 'combat', 'combat', 'combat', 'fountain', 'boss'],
  shopOffers: [3, 8], // steps whose doors may offer the Pedlar instead of a reward
  encounters: ENCOUNTERS,
  miniboss: 'gaoler',
  boss: 'seraph',
  // the codex lists these under the region, in this order
  foes: ['thrall', 'gravebow', 'skitter', 'mourner', 'lampwight', 'warden', 'gaoler', 'seraph'],
  // banners of the chambers that are not the start or a boss's (theirs come from the region and the boss)
  rooms: {
    shop: { title: 'The Pale Pedlar' },
    fountain: { title: 'The Moonwell' },
    boss: { door: 'The Wall’s Lord' },
  },
  // loading cards: art/<art>.webp and a line (the region's joins the shuffle)
  cards: {
    region: { art: 'ramparts', text: 'The Gloamwall: the bone legion still walks the walls it died defending.' },
    miniboss: { art: 'bestiary', text: 'Warm light on the ground means danger: step out before it fills.' },
    boss: { art: 'summit', text: 'At the summit the Midnight Clock waits, stopped at the last stroke.' },
  },
  // the line on the passage card as Maelis climbs on past the boss
  passage: 'Past the Seraph’s empty perch the stair winds up out of the wind, into the dark above the wall.',
  // the ending card while this is the top of the climb (and the path deeper is sealed)
  ending: {
    art: 'summit',
    title: 'The Gloamwall is breached',
    text: [
      'The Hollow Seraph folds her broken wings and is still. For a moment the moon shows through the endless midnight.',
      'Beyond her, the stair to the Vigil Vaults climbs into the dark, and stops at a door the stopped hour holds shut.',
    ],
    note: 'Your progress is saved. The wall waits to be climbed again, and the moon remembers you.',
  },
  // Maelis's journal: before the region is first cleared, and after (while nothing above is open)
  journal: {
    ahead: 'The Gloamwall first. Then whatever waits behind its warden.',
    behind: 'The wall is behind me. The stair beyond the Seraph is sealed by the stopped hour, for now.',
  },
  // the codex's world pages for the region; `unlock` is a foe id that must have been beaten
  lore: [
    {
      id: 'seraph',
      name: 'Beyond the Wall',
      art: 'rune',
      unlock: 'seraph',
      text: [
        'With the Hollow Seraph fallen the way up lies open as far as the Vigil Vaults, where the dead keep an endless vigil among candles and reliquaries.',
        'The door at the top of the stair is held shut by the stopped hour itself. Something will have to give.',
      ],
    },
  ],
};

export default GLOAMWALL;
