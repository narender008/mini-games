// Regions of the Reverie: names, palettes, rhythm and hand-authored chamber templates.
//
// Data only (sim/chamber.js turns a template into a chamber, render/env/* paints it).
//
// Template geometry is a tiny constructive language, evaluated as signed distance
// fields and traced into one walkable outline polygon by sim/chamber.js:
//   add: shapes united (smoothly, radius `blend`)      sub: shapes carved away
//   ['e', cx, cy, rx, ry]          ellipse
//   ['c', cx, cy, r]               circle
//   ['r', x0, y0, x1, y1, round]   (rounded) rectangle
//   ['l', x0, y0, x1, y1, width]   capsule: bridges, catwalks, thread-bridges
//   ['n', cx, cy, R, sides, rotDeg] regular polygon (octagon platforms, chapter houses)
//   ['p', [[x, y], ...]]           any simple polygon
// `noise` wobbles organic edges (world units), `noiseScale` its feature size.
// Doors are authored as angles in degrees from the centre (0 = right, -90 = back/up,
// 180 = left; screen y grows down); a ray cast finds the edge. Doors live on the back
// and the sides so their arches never hide the fight. `entry` is the angle the hero
// arrives from (default 90 = the front edge).
// obstacles: [type, x, y, r]  round colliders that matter in combat (hide behind them).
// hazards:   [type, x, y, r]  thorns | pit | molten | void (circles).
// channels:  [type, width, [[x, y], ...]]  a hazard line, split into circles by chamber.js
//            and painted as one continuous trench (molten channels, thorn hedges, void rifts).
// features:  [type, x, y, r]  set pieces painters draw and sims use (fountain, shop, throne,
//            memory loom, altar, crucible ...). Features with r > 0 also collide.
// kinds: which chamber kinds may use the template.

export const REGION_ORDER = ['glasswood', 'choir', 'forge', 'unwoven'];

// Region rhythm (for run.js / chamberPlan): ~12 chambers, the miniboss around 6,
// a shop, a quiet fountain, sometimes a memory chamber, then the boss.
export const RHYTHM = {
  length: 12,              // chambers per region including the boss (index 0..11)
  entry: 0,                // index 0 is the gentle 'entry' chamber
  miniboss: [5, 6],        // one miniboss somewhere in this range
  shop: [3, 9],            // a shop door is offered once in each half
  fountain: [8, 10],       // one fountain before the boss
  memoryChance: 0.35,      // a fountain may be replaced by a memory chamber (one per region at most)
  elite: { from: 2, chance: 0.22 },
  boss: 11,
  waves: { entry: 1, combat: [2, 3], elite: [2, 3], miniboss: 1 },
};

export const PATRON_COLORS = {
  solenne: '#ffc35a', maru: '#5ec8ff', veyra: '#a6f6ff', ossian: '#d9a86a', ilu: '#a98bff', kestrel: '#8ff5b0',
};

export const REGIONS = {
  glasswood: {
    id: 'glasswood', index: 0, name: 'Glasswood Shallows', sub: 'a crystal forest under glowing rain',
    boss: 'veyl', music: 'glasswood', edge: 'void',
    palette: {
      sky: ['#04061a', '#0f1240', '#1d1046'], nebula: ['#3a2a8a', '#1a4a7a', '#5a2a6a', '#174a5a'],
      aurora: ['#3fe0c5', '#8a6cff', '#3fb0ff'],
      floor: ['#3b4688', '#34407e', '#2e3872', '#414c92', '#384284', '#2b3468'], floorBase: ['#34407c', '#232a5a'],
      cliff: ['#120f2c', '#2b2860'], vein: ['#5ff0dc', '#b69bff'], crystal: [['#5ff0dc', '#b69bff'], ['#b69bff', '#ff9fe0'], ['#6ad8ff', '#5ff0dc']],
      light: ['#7ff3ff', '#c9a6ff', '#ff9fe0'], rim: '#a0beff', danger: '#ff4f86', hero: '#ffc073',
      dark: { color: '#04051a', a: 0.8 },
    },
    rain: true, storm: true,
  },
  choir: {
    id: 'choir', index: 1, name: 'The Drowned Choir', sub: 'a cathedral sunk in a sea of stars',
    boss: 'morrow', music: 'choir', edge: 'void',
    palette: {
      sky: ['#010414', '#061a3c', '#0b2a56'], nebula: ['#123a7a', '#0c4a6a', '#2a2a6a', '#3a3a1a'],
      aurora: ['#4fa8ff', '#f2c46b', '#3fd0e0'],
      floor: ['#1c2c58', '#22335f', '#18264c', '#263a6a'], floorBase: ['#22335f', '#101a38'],
      marbleA: '#26386a', marbleB: '#14203f', inlay: '#e2b85a',
      cliff: ['#08122a', '#1c2c58'], vein: ['#7fd0ff', '#f2c46b'],
      light: ['#ffd27a', '#7fd0ff', '#b8e8ff'], rim: '#9fd0ff', danger: '#ff5a7a', hero: '#ffc073',
      dark: { color: '#03102a', a: 0.74 },
    },
  },
  forge: {
    id: 'forge', index: 2, name: 'The Sunken Forge', sub: 'a foundry of melted suns',
    boss: 'aurum', music: 'forge', edge: 'void',
    palette: {
      sky: ['#14040e', '#3a0a26', '#6a1a1a'], nebula: ['#8a1a3a', '#a03a10', '#5a0a4a', '#7a2a0a'],
      aurora: ['#ff7a2a', '#ff3a8a', '#ffc040'],
      floor: ['#2a2430', '#302836', '#252030', '#36303c'], floorBase: ['#2e2834', '#18121c'],
      cliff: ['#120a12', '#2a1a22'], vein: ['#ff8a2a', '#ff4a9a'], molten: ['#fff2a0', '#ffb030', '#ff5a10', '#a01a10'],
      light: ['#ff9a3a', '#ff5a8a', '#ffd070'], rim: '#ffb070', danger: '#ff3a5a', hero: '#ffc073',
      dark: { color: '#24060e', a: 0.64 },
    },
  },
  unwoven: {
    id: 'unwoven', index: 3, name: 'The Unwoven', sub: 'a void of loose threads where colour bleeds away',
    boss: 'sable', music: 'unwoven', edge: 'void',
    palette: {
      sky: ['#020205', '#0a0a14', '#14101e'], nebula: ['#2a2a3a', '#3a1a3a', '#1a2a3a', '#2a2a2a'],
      aurora: ['#ff4a8a', '#4affc8', '#a07aff', '#ffd25a'],
      floor: ['#3a3440', '#443c48', '#302a36', '#4a4250'], floorBase: ['#3a3442', '#1a1620'],
      cliff: ['#08070c', '#1c1822'], vein: ['#e8e0ff', '#ff6aa8'],
      thread: ['#c23a5a', '#3a7ac2', '#d2a03a', '#3ac29a', '#8a5ac2', '#e8e0d0'],
      light: ['#e8e0ff', '#ff6aa8', '#7affd8'], rim: '#d8d0ff', danger: '#ff3a6a', hero: '#ffc073',
      dark: { color: '#030308', a: 0.84 },
    },
  },
  hub: {
    id: 'hub', index: -1, name: 'The Loomhall', sub: 'at the edge of waking', music: 'hub', edge: 'void',
    palette: {
      sky: ['#1a0e2a', '#4a2a4a', '#c87a5a'], nebula: ['#6a3a5a', '#8a5a3a', '#3a2a5a', '#a06a4a'],
      aurora: ['#ffd27a', '#ff9a8a', '#c9a6ff'],
      floor: ['#6a4028', '#5a3420', '#74482c', '#4e2c1a'], floorBase: ['#5a3622', '#2a160c'],
      cliff: ['#1a0e10', '#3a2018'], vein: ['#ffd27a', '#ffb060'],
      light: ['#ffcf7a', '#ffb060', '#fff0c0'], rim: '#ffd8a0', danger: '#ff5a5a', hero: '#ffc073',
      dark: { color: '#120810', a: 0.55 },
    },
  },
};

const COMBAT = ['entry', 'combat', 'elite'];
const BIG = ['entry', 'combat', 'elite', 'miniboss'];

// ------------------------------------------------------------------------------------------
// Glasswood Shallows: floating crystal islands, glass thorns, void gaps.
// ------------------------------------------------------------------------------------------
const glasswood = [
  { id: 'gw_glade', name: 'Rainlit Glade', kinds: BIG, blend: 80, noise: 34, noiseScale: 260,
    add: [['e', 0, 0, 1020, 640]],
    obstacles: [['crystal', -520, -170, 42], ['crystal', 560, 210, 38], ['crystal', -260, 330, 30], ['crystal', 380, -300, 34]],
    hazards: [['thorns', 120, -40, 70], ['thorns', -700, 140, 64]],
    features: [['sigil', 0, 40, 0]],
    doors: [-90, -140, -40, 180, 0] },
  { id: 'gw_twin', name: 'Twin Isles', kinds: BIG, blend: 120, noise: 30, noiseScale: 220,
    add: [['e', -560, 20, 520, 460], ['e', 600, -20, 500, 430], ['l', -200, 0, 200, 0, 300]],
    obstacles: [['crystal', -640, -120, 40], ['crystal', -420, 200, 32], ['tree', 700, 120, 34], ['crystal', 520, -220, 36]],
    hazards: [['thorns', -60, -150, 60], ['thorns', 60, 170, 60]],
    doors: [-90, -60, -120, 0, 180] },
  { id: 'gw_crescent', name: 'Crescent Shelf', kinds: COMBAT, blend: 90, noise: 30, noiseScale: 240,
    add: [['e', 0, 40, 980, 600]], sub: [['e', 0, -340, 520, 330]],
    obstacles: [['crystal', -560, 40, 40], ['crystal', 560, 60, 40], ['crystal', 0, 330, 34]],
    hazards: [['thorns', -320, 360, 58], ['thorns', 330, 340, 58]],
    doors: [-160, -20, 180, 0, -120], entry: 90 },
  { id: 'gw_grove', name: 'Glass Grove', kinds: BIG, blend: 70, noise: 40, noiseScale: 300,
    add: [['e', 0, 0, 920, 640]],
    obstacles: [['tree', -480, -220, 34], ['tree', 40, -330, 34], ['tree', 500, -160, 34], ['tree', -300, 160, 34], ['tree', 300, 230, 34], ['tree', -640, 330, 30], ['tree', 680, 300, 30]],
    hazards: [['thorns', 0, 0, 56]],
    doors: [-90, -150, -30, 180] },
  { id: 'gw_terraces', name: 'Stepped Shallows', kinds: COMBAT, blend: 60, noise: 26, noiseScale: 200,
    add: [['e', -560, 220, 540, 360], ['e', 0, 0, 520, 380], ['e', 560, -220, 540, 360]],
    obstacles: [['crystal', -420, 120, 36], ['crystal', 420, -100, 36], ['crystal', 60, 220, 30]],
    channels: [['thorns', 56, [[-300, -220], [-140, -120]]], ['thorns', 56, [[160, 160], [320, 260]]]],
    doors: [-60, -110, 0, 180, -150], entry: 120 },
  { id: 'gw_ring', name: 'The Drowned Eye', kinds: BIG, blend: 80, noise: 30, noiseScale: 250,
    add: [['e', 0, 0, 1000, 640]],
    hazards: [['pit', 0, -10, 230]],
    obstacles: [['crystal', -620, -60, 38], ['crystal', 620, 40, 38], ['crystal', -220, 400, 30], ['crystal', 240, -420, 30]],
    doors: [-90, -145, -35, 180, 0] },
  { id: 'gw_clover', name: 'Three-Leaf Isle', kinds: COMBAT, blend: 140, noise: 30, noiseScale: 220,
    add: [['e', -480, 170, 470, 380], ['e', 480, 170, 470, 380], ['e', 0, -300, 520, 360]],
    obstacles: [['crystal', 0, 40, 46], ['crystal', -620, 260, 30], ['crystal', 620, 250, 30]],
    hazards: [['thorns', -260, -60, 54], ['thorns', 260, -60, 54]],
    doors: [-90, -150, -30, 180, 0] },
  { id: 'gw_shallows', name: 'Mirror Shallows', kinds: BIG, blend: 90, noise: 34, noiseScale: 280,
    add: [['e', 0, 0, 1080, 600]],
    hazards: [['pit', -460, -120, 120], ['pit', 420, 160, 130], ['thorns', 0, -260, 60], ['thorns', -120, 300, 54]],
    obstacles: [['crystal', -140, 40, 34], ['crystal', 200, -170, 36], ['tree', 760, -260, 32], ['tree', -780, 250, 32]],
    doors: [-90, -140, -40, 180, 0] },
  // set pieces
  { id: 'gw_boss', name: 'The Thorn Throne', kinds: ['boss'], blend: 80, noise: 24, noiseScale: 300,
    add: [['e', 0, 30, 1060, 680]],
    features: [['throne', 0, -560, 0]],
    obstacles: [['crystal', -640, -260, 40], ['crystal', 640, -260, 40], ['crystal', -700, 300, 34], ['crystal', 700, 300, 34]],
    doors: [-90], entry: 90, bossAt: [0, -260] },
  { id: 'gw_shop', name: "Pell's Lantern Stop", kinds: ['shop'], blend: 70, noise: 26, noiseScale: 220,
    add: [['e', 0, 0, 760, 480]],
    features: [['shop', 0, -170, 70]], shopSlots: [[-260, 30], [0, 70], [260, 30]],
    obstacles: [['crystal', -560, -100, 32], ['crystal', 560, -60, 32]],
    doors: [-120, -60, 180, 0] },
  { id: 'gw_fountain', name: 'Rainwell', kinds: ['fountain'], blend: 70, noise: 26, noiseScale: 220,
    add: [['e', 0, 0, 760, 500]],
    features: [['fountain', 0, -60, 90]],
    obstacles: [['tree', -520, -140, 32], ['tree', 520, -120, 32]],
    doors: [-120, -60, 180, 0] },
  { id: 'gw_memory', name: 'A Thread Remembered', kinds: ['memory'], blend: 70, noise: 26, noiseScale: 220,
    add: [['e', 0, 0, 720, 480]],
    features: [['memory', 0, -120, 60]],
    obstacles: [['crystal', -480, 80, 30], ['crystal', 480, 80, 30]],
    doors: [-120, -60, 180, 0] },
];

// ------------------------------------------------------------------------------------------
// The Drowned Choir: cathedral naves, transepts, cloisters; flooded pits; columns.
// ------------------------------------------------------------------------------------------
const choir = [
  { id: 'ch_nave', name: 'The Long Nave', kinds: BIG, blend: 0, noise: 0,
    add: [['r', -1100, -460, 1100, 460, 30]],
    obstacles: [['column', -720, -220, 40], ['column', -240, -220, 40], ['column', 240, -220, 40], ['column', 720, -220, 40],
      ['column', -720, 220, 40], ['column', -240, 220, 40], ['column', 240, 220, 40], ['column', 720, 220, 40],
      ['pew', -480, -340, 54], ['pew', 480, -340, 54], ['pew', -480, 330, 54], ['pew', 480, 330, 54]],
    hazards: [['pit', 0, 0, 90]],
    doors: [-90, -60, -120, 180, 0] },
  { id: 'ch_cross', name: 'The Crossing', kinds: BIG, blend: 0, noise: 0,
    add: [['r', -1050, -300, 1050, 300, 20], ['r', -340, -680, 340, 620, 20]],
    obstacles: [['column', -200, -170, 42], ['column', 200, -170, 42], ['column', -200, 170, 42], ['column', 200, 170, 42],
      ['pew', -480, -190, 54], ['pew', 480, -190, 54], ['pew', -480, 200, 54], ['pew', 480, 200, 54], ['chorister', -270, -400, 36], ['chorister', 270, -400, 36]],
    hazards: [['pit', -720, 0, 110], ['pit', 720, 0, 110]],
    features: [['rose', 0, 0, 0]],
    doors: [-90, 180, 0, -60, -120] },
  { id: 'ch_apse', name: 'Apse of Echoes', kinds: COMBAT, blend: 0, noise: 0,
    add: [['r', -880, -200, 880, 560, 24], ['e', 0, -200, 880, 480]],
    features: [['altar', 0, -420, 70]],
    obstacles: [['column', -520, -300, 38], ['column', 520, -300, 38], ['column', -560, 260, 38], ['column', 560, 260, 38],
      ['chorister', -260, -460, 36], ['chorister', 260, -460, 36], ['pew', -330, 340, 54], ['pew', 330, 340, 54]],
    hazards: [['pit', 0, 200, 100]],
    doors: [-125, -55, 180, 0], entry: 90 },
  { id: 'ch_cloister', name: 'Flooded Cloister', kinds: BIG, blend: 0, noise: 0,
    add: [['r', -900, -620, 900, 620, 40]],
    hazards: [['pit', 0, 0, 250]],
    obstacles: [['column', -420, -400, 36], ['column', 0, -440, 36], ['column', 420, -400, 36], ['column', -500, 0, 36], ['column', 500, 0, 36],
      ['column', -420, 400, 36], ['column', 420, 400, 36], ['chorister', -720, -460, 36], ['chorister', 720, -460, 36]],
    doors: [-90, -135, -45, 180, 0] },
  { id: 'ch_flooded', name: 'Sunken Aisles', kinds: COMBAT, blend: 0, noise: 0,
    add: [['r', -1080, -480, 1080, 480, 30]],
    hazards: [['pit', -600, -300, 130], ['pit', 100, -320, 120], ['pit', -200, 320, 120], ['pit', 640, 300, 130]],
    obstacles: [['column', -340, -60, 40], ['column', 360, 40, 40], ['chorister', -820, 120, 38], ['statue', 860, -120, 38], ['pew', -560, 40, 54], ['pew', 620, -20, 54]],
    doors: [-90, -45, -135, 180, 0] },
  { id: 'ch_octagon', name: 'Chapter House', kinds: BIG, blend: 0, noise: 0,
    add: [['n', 0, 0, 760, 8, 22.5]],
    obstacles: [['column', 0, 0, 70], ['column', -380, -220, 34], ['column', 380, -220, 34], ['column', -380, 220, 34], ['column', 380, 220, 34], ['chorister', -330, -520, 34], ['chorister', 330, -520, 34]],
    hazards: [['pit', -560, 0, 80], ['pit', 560, 0, 80]],
    doors: [-90, -135, -45, 180, 0] },
  { id: 'ch_broken', name: 'The Broken Floor', kinds: COMBAT, blend: 30, noise: 10, noiseScale: 140,
    add: [['r', -1000, -560, 1000, 560, 30]], sub: [['c', -1000, -560, 320], ['c', 1000, 560, 300], ['c', 1040, -200, 200], ['c', -400, 600, 180]],
    hazards: [['pit', -200, -120, 120], ['pit', 300, 160, 100]],
    obstacles: [['column', -560, 120, 40], ['column', 540, -260, 40], ['statue', 80, -360, 36]],
    doors: [-90, -50, 180, 0], entry: 100 },
  { id: 'ch_organ', name: 'The Drowned Organ', kinds: BIG, blend: 0, noise: 0,
    add: [['r', -1100, -520, 1100, 520, 30]],
    features: [['organ', 0, -560, 0]],
    obstacles: [['chorister', -560, -180, 36], ['chorister', 560, -180, 36], ['pew', -560, 300, 54], ['pew', 560, 300, 54], ['column', -840, 200, 38], ['column', 840, 200, 38], ['column', -260, 220, 34], ['column', 260, 220, 34]],
    hazards: [['pit', 0, 30, 110]],
    doors: [-140, -40, 180, 0] },
  { id: 'ch_boss', name: 'The Choir Loft', kinds: ['boss'], blend: 0, noise: 0,
    add: [['r', -1000, -400, 1000, 620, 40], ['e', 0, -400, 1000, 380]],
    features: [['organ', 0, -760, 0]],
    obstacles: [['column', -760, -220, 40], ['column', 760, -220, 40], ['column', -760, 380, 40], ['column', 760, 380, 40]],
    doors: [-90], bossAt: [0, -300] },
  { id: 'ch_shop', name: 'The Reliquary', kinds: ['shop'], blend: 0, noise: 0,
    add: [['r', -720, -440, 720, 440, 30]],
    features: [['shop', 0, -200, 70]], shopSlots: [[-260, 40], [0, 80], [260, 40]],
    obstacles: [['column', -520, -260, 34], ['column', 520, -260, 34]],
    doors: [-140, -40, 180, 0] },
  { id: 'ch_fountain', name: 'The Baptistery', kinds: ['fountain'], blend: 0, noise: 0,
    add: [['n', 0, 0, 640, 8, 22.5]],
    features: [['fountain', 0, -40, 96]],
    doors: [-135, -45, 180, 0] },
  { id: 'ch_memory', name: 'Chapel of Names', kinds: ['memory'], blend: 0, noise: 0,
    add: [['r', -680, -420, 680, 440, 30]],
    features: [['memory', 0, -160, 60]],
    obstacles: [['column', -460, -220, 32], ['column', 460, -220, 32]],
    doors: [-140, -40, 180, 0] },
];

// ------------------------------------------------------------------------------------------
// The Sunken Forge: iron platforms over a sea of melted suns; molten channels; anvils.
// ------------------------------------------------------------------------------------------
const forge = [
  { id: 'fg_crucible', name: 'The Great Crucible', kinds: BIG, blend: 0, noise: 0,
    add: [['n', 0, 0, 900, 8, 22.5]],
    features: [['crucible', 0, 0, 110]],
    channels: [['molten', 50, [[150, 0], [700, 0]]], ['molten', 50, [[-150, 0], [-700, 0]]]],
    obstacles: [['anvil', -380, -360, 40], ['anvil', 380, 360, 40], ['chimney', 420, -380, 46], ['chimney', -420, 380, 46]],
    doors: [-90, -135, -45, 180, 0] },
  { id: 'fg_rails', name: 'Pour Lines', kinds: BIG, blend: 0, noise: 0,
    add: [['r', -1080, -560, 1080, 560, 20]],
    channels: [['molten', 56, [[-1040, -190], [-260, -190]]], ['molten', 56, [[-60, -190], [1040, -190]]],
      ['molten', 56, [[-1040, 190], [80, 190]]], ['molten', 56, [[280, 190], [1040, 190]]]],
    obstacles: [['anvil', -560, 0, 40], ['anvil', 560, 0, 40], ['chimney', -300, -380, 46], ['chimney', 300, 380, 40]],
    doors: [-90, -45, -135, 180, 0] },
  { id: 'fg_anvils', name: 'Hall of Anvils', kinds: BIG, blend: 0, noise: 0,
    add: [['r', -900, -600, 900, 600, 30]],
    obstacles: [['anvil', -450, -300, 42], ['anvil', 0, -300, 42], ['anvil', 450, -300, 42], ['anvil', -450, 300, 42], ['anvil', 0, 300, 42], ['anvil', 450, 300, 42]],
    hazards: [['molten', -700, 0, 80], ['molten', 700, 0, 80]],
    channels: [['molten', 40, [[-760, -480], [-560, -480]]], ['molten', 40, [[560, 480], [760, 480]]]],
    doors: [-90, -135, -45, 180, 0] },
  { id: 'fg_bellows', name: 'The Bellows Bend', kinds: COMBAT, blend: 0, noise: 0,
    add: [['r', -1000, -600, 200, 600, 20], ['r', -1000, 100, 1000, 600, 20]],
    obstacles: [['chimney', -600, -300, 50], ['anvil', -300, 300, 40], ['anvil', 500, 380, 40]],
    channels: [['molten', 50, [[-400, -560], [-400, -100]]]],
    hazards: [['molten', 120, 260, 70]],
    doors: [-90, -60, 180, 0], entry: 60 },
  { id: 'fg_spill', name: 'The Spill', kinds: COMBAT, blend: 40, noise: 14, noiseScale: 160,
    add: [['n', 0, 0, 920, 6, 0], ['r', -960, -360, 960, 360, 10]],
    hazards: [['molten', -380, -160, 110], ['molten', 300, 200, 120], ['molten', 560, -260, 70], ['molten', -560, 300, 70]],
    obstacles: [['anvil', 0, -60, 42], ['chimney', -760, 0, 44]],
    doors: [-90, -135, -45, 0, 180] },
  { id: 'fg_gears', name: 'The Turning Floor', kinds: BIG, blend: 0, noise: 0,
    add: [['c', 0, 0, 760], ['r', -1000, -220, 1000, 220, 20]],
    channels: [['molten', 44, [[380, 0], [269, -269], [0, -380], [-269, -269], [-380, 0], [-269, 269], [0, 380], [180, 335]]]],
    features: [['gear', 0, 0, 120]],
    obstacles: [['anvil', -600, -300, 38], ['anvil', 600, 300, 38]],
    doors: [-90, -45, -135, 180, 0] },
  { id: 'fg_chimneys', name: 'Chimney Stacks', kinds: COMBAT, blend: 0, noise: 0,
    add: [['n', 0, 0, 860, 6, 30]],
    obstacles: [['chimney', -380, -240, 52], ['chimney', 380, -240, 52], ['chimney', 0, 300, 52], ['chimney', -560, 220, 40], ['chimney', 560, 220, 40]],
    hazards: [['molten', 0, -100, 80], ['molten', -620, -60, 56], ['molten', 620, -60, 56]],
    doors: [-90, -150, -30] },
  { id: 'fg_catwalk', name: 'The Catwalks', kinds: COMBAT, blend: 20, noise: 0,
    add: [['r', -1060, -460, -300, 460, 20], ['r', 300, -460, 1060, 460, 20], ['l', -340, -220, 340, -220, 170], ['l', -340, 260, 340, 260, 170]],
    obstacles: [['anvil', -680, 0, 40], ['anvil', 680, 0, 40], ['chimney', -500, -300, 40], ['chimney', 500, 300, 40]],
    hazards: [['molten', -760, 300, 60], ['molten', 760, -300, 60]],
    doors: [-90, -60, -120, 180, 0], entry: 100 },
  { id: 'fg_boss', name: "Aurum's Anvil", kinds: ['boss'], blend: 0, noise: 0,
    add: [['n', 0, 0, 1000, 8, 22.5]],
    features: [['furnace', 0, -820, 0]],
    channels: [['molten', 40, [[-980, 420], [-600, 760]]], ['molten', 40, [[980, 420], [600, 760]]]],
    obstacles: [['chimney', -620, -360, 46], ['chimney', 620, -360, 46]],
    doors: [-90], bossAt: [0, -300] },
  { id: 'fg_shop', name: 'The Slag Market', kinds: ['shop'], blend: 0, noise: 0,
    add: [['n', 0, 0, 720, 8, 22.5]],
    features: [['shop', 0, -220, 70]], shopSlots: [[-260, 20], [0, 70], [260, 20]],
    obstacles: [['chimney', -480, -300, 36], ['chimney', 480, -300, 36]],
    hazards: [['molten', -500, 260, 50], ['molten', 500, 260, 50]],
    doors: [-135, -45, 180, 0] },
  { id: 'fg_fountain', name: 'The Quench', kinds: ['fountain'], blend: 0, noise: 0,
    add: [['n', 0, 0, 660, 6, 0]],
    features: [['fountain', 0, -40, 96]],
    doors: [-120, -60, 180, 0] },
  { id: 'fg_memory', name: 'The Shear Mould', kinds: ['memory'], blend: 0, noise: 0,
    add: [['r', -700, -420, 700, 420, 20]],
    features: [['memory', 0, -150, 60]],
    obstacles: [['anvil', -460, 100, 36], ['anvil', 460, 100, 36]],
    channels: [['molten', 36, [[-560, -300], [-300, -300]]], ['molten', 36, [[300, -300], [560, -300]]]],
    doors: [-140, -40, 180, 0] },
];

// ------------------------------------------------------------------------------------------
// The Unwoven: fragments of tapestry over the void, thread-bridges, void rifts.
// ------------------------------------------------------------------------------------------
const unwoven = [
  { id: 'uw_fragment', name: 'Torn Fragment', kinds: BIG, blend: 60, noise: 60, noiseScale: 180,
    add: [['e', 0, 0, 980, 620]],
    hazards: [['void', -380, -160, 100], ['void', 420, 180, 110]],
    obstacles: [['spindle', -560, 260, 36], ['spindle', 560, -260, 36], ['spindle', 60, 30, 40]],
    doors: [-90, -140, -40, 180, 0] },
  { id: 'uw_bridges', name: 'The Three Knots', kinds: COMBAT, blend: 50, noise: 30, noiseScale: 150,
    add: [['c', 0, -360, 360], ['c', -620, 260, 340], ['c', 620, 260, 340], ['l', 0, -360, -620, 260, 160], ['l', 0, -360, 620, 260, 160], ['l', -620, 260, 620, 260, 150]],
    obstacles: [['spindle', 0, -380, 40], ['spindle', -640, 280, 34], ['spindle', 640, 280, 34]],
    hazards: [['void', 0, 30, 120]],
    doors: [-90, -60, -120, 180, 0], entry: 90 },
  { id: 'uw_spiral', name: 'The Unspooling', kinds: BIG, blend: 60, noise: 36, noiseScale: 170,
    add: [['e', 0, 0, 980, 640]], sub: [['l', -980, 120, -120, 120, 120], ['l', 120, -160, 980, -160, 120]],
    obstacles: [['spindle', -440, -220, 38], ['spindle', 460, 220, 38]],
    hazards: [['void', 0, 0, 80]],
    doors: [-90, -140, -40, 180, 0] },
  { id: 'uw_loom', name: 'The Broken Loom', kinds: BIG, blend: 10, noise: 20, noiseScale: 140,
    add: [['r', -1040, -560, 1040, 560, 30]],
    channels: [['void', 60, [[-700, -260], [-700, 240]]], ['void', 60, [[0, -320], [0, -60]]], ['void', 60, [[0, 120], [0, 340]]], ['void', 60, [[700, -240], [700, 260]]]],
    features: [['loomframe', 0, -600, 0]],
    obstacles: [['spindle', -360, 0, 36], ['spindle', 360, 0, 36]],
    doors: [-90, -45, -135, 180, 0] },
  { id: 'uw_shatter', name: 'Shatterweft', kinds: COMBAT, blend: 30, noise: 70, noiseScale: 130,
    add: [['e', 0, 0, 1000, 640]], sub: [['c', -760, -420, 260], ['c', 820, 380, 260], ['c', 900, -420, 200], ['c', -860, 480, 220], ['c', 0, 700, 220]],
    hazards: [['void', -200, 160, 90], ['void', 300, -160, 90]],
    obstacles: [['spindle', -500, 0, 36], ['spindle', 520, 80, 36]],
    doors: [-90, -130, 180, 0] },
  { id: 'uw_hourglass', name: 'The Waist', kinds: COMBAT, blend: 90, noise: 34, noiseScale: 160,
    add: [['e', -600, 0, 480, 560], ['e', 600, 0, 480, 560], ['l', -200, 0, 200, 0, 260]],
    obstacles: [['spindle', -640, -200, 36], ['spindle', 640, 200, 36], ['spindle', -560, 260, 30], ['spindle', 560, -260, 30]],
    doors: [-90, -60, -120, 180, 0] },
  { id: 'uw_drift', name: 'Driftweave', kinds: BIG, blend: 70, noise: 50, noiseScale: 200,
    add: [['e', 0, 0, 1080, 560]],
    hazards: [['void', -600, 120, 110], ['void', 0, -180, 120], ['void', 560, 160, 100]],
    obstacles: [['spindle', -300, -200, 36], ['spindle', 320, 300, 36], ['spindle', 840, -160, 32]],
    doors: [-90, -140, -40, 180, 0] },
  { id: 'uw_eye', name: 'The Unmade Eye', kinds: BIG, blend: 60, noise: 40, noiseScale: 180,
    add: [['e', 0, 0, 1000, 660]],
    hazards: [['void', 0, 0, 260]],
    obstacles: [['spindle', -640, -200, 38], ['spindle', 640, 200, 38], ['spindle', -560, 360, 32], ['spindle', 600, -380, 32]],
    doors: [-90, -145, -35, 180, 0] },
  { id: 'uw_boss', name: 'The Unmade Throne', kinds: ['boss'], blend: 60, noise: 40, noiseScale: 200,
    add: [['e', 0, 40, 1080, 700]],
    features: [['scissors', 0, -620, 0]],
    obstacles: [['spindle', -700, -260, 40], ['spindle', 700, -260, 40]],
    doors: [-90], bossAt: [0, -280] },
  { id: 'uw_shop', name: 'Lost and Found', kinds: ['shop'], blend: 60, noise: 36, noiseScale: 160,
    add: [['e', 0, 0, 740, 480]],
    features: [['shop', 0, -170, 70]], shopSlots: [[-260, 30], [0, 70], [260, 30]],
    obstacles: [['spindle', -540, -80, 30], ['spindle', 540, -80, 30]],
    doors: [-120, -60, 180, 0] },
  { id: 'uw_fountain', name: 'The Last Colour', kinds: ['fountain'], blend: 60, noise: 36, noiseScale: 160,
    add: [['e', 0, 0, 760, 500]],
    features: [['fountain', 0, -50, 96]],
    doors: [-120, -60, 180, 0] },
  { id: 'uw_memory', name: 'Where It Was Cut', kinds: ['memory'], blend: 60, noise: 36, noiseScale: 160,
    add: [['e', 0, 0, 720, 480]],
    features: [['memory', 0, -130, 60]],
    doors: [-120, -60, 180, 0] },
];

export const TEMPLATES = {};
for (const [region, list] of [['glasswood', glasswood], ['choir', choir], ['forge', forge], ['unwoven', unwoven]]) {
  REGIONS[region].templates = list.map((t) => t.id);
  for (const t of list) TEMPLATES[t.id] = { region, ...t };
}

// Templates of a region that may host a chamber kind.
export function templatesFor(regionId, kind) {
  const k = kind === 'hub' ? 'combat' : kind;
  return REGIONS[regionId].templates.filter((id) => TEMPLATES[id].kinds.includes(k));
}
