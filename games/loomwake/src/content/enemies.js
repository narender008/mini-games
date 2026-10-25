// The Unravelled: every foe that is not a boss. Data only.
//
// KINDS[id] = { name, ai, art, r, hp, armor, speed, mass, dmg, regions, tier,
//   points (wave budget cost), height (px, feet to crown, for bars and hit
//   numbers), lore (codex line), elite: { hp, armor, dmg, trick } }.
// `ai` picks src/sim/enemies/<ai>.js, `art` picks src/render/actors/enemies/<art>.js.
// Stats are the Glasswood baseline; REGION_SCALE grows them deeper in the dream.
// Telegraph and timing numbers live with each attack in ATTACKS so balance is
// all in this one file.

export const REGIONS = ['glasswood', 'choir', 'forge', 'unwoven'];

// hp, dmg multipliers per region (applied by spawn unless opts.scale is given)
export const REGION_SCALE = {
  glasswood: { hp: 1, dmg: 1, speed: 1 },
  choir: { hp: 1.3, dmg: 1.15, speed: 1.04 },
  forge: { hp: 1.65, dmg: 1.3, speed: 1.08 },
  unwoven: { hp: 2.0, dmg: 1.45, speed: 1.12 },
};

// Elite rules shared by every kind (a kind may override in its own `elite`)
export const ELITE = { hp: 1.8, armorAdd: 40, armorMul: 1.5, dmg: 1.25, speed: 1.08, points: 2.6, eye: '#ff2d6a' };

export const KINDS = {
  hollow: {
    name: 'Hollow', ai: 'stalker', art: 'hollow', tier: 'fodder',
    minDepth: 0, weight: 3,
    r: 18, hp: 45, armor: 0, speed: 150, mass: 1, dmg: 10, height: 70, points: 1,
    regions: ['glasswood', 'choir', 'forge', 'unwoven'],
    attacks: ['clawLunge'], eliteAttacks: ['clawLunge', 'twinRake'],
    elite: { trick: 'Rakes twice: a second lunge follows the first.' },
    lore: 'Whoever this was, they are only a shape now: a shroud, a slit of cold light, and the hunger of a thread that was cut too short.',
  },
  thornling: {
    name: 'Thornling', ai: 'stalker', art: 'thornling', tier: 'fodder',
    minDepth: 1, weight: 2,
    r: 18, hp: 40, armor: 0, speed: 165, mass: 0.9, dmg: 9, height: 66, points: 1.3,
    regions: ['glasswood'],
    attacks: ['clawLunge'], eliteAttacks: ['clawLunge', 'twinRake'], deathBurst: 'thorns',
    elite: { trick: 'Its death-burst throws a second ring of thorns.' },
    lore: 'Veyl\'s gardeners, grown over with glass briars. They burst when cut, and the briars keep growing a moment longer.',
  },
  threadKnight: {
    name: 'Thread-Knight', ai: 'knight', art: 'knight', tier: 'mid',
    minDepth: 2, weight: 1.2,
    r: 26, hp: 140, armor: 60, speed: 90, mass: 3, dmg: 20, height: 112, points: 3.5,
    regions: ['glasswood', 'choir', 'forge', 'unwoven'],
    attacks: ['overheadSlam', 'backSweep'], eliteAttacks: ['overheadSlam', 'backSweep', 'doubleSlam'],
    elite: { trick: 'Follows its slam with a second, turning slam.' },
    lore: 'Oathsworn once, to a Weaver who no longer answers. The armour kept its vow after the knight inside was unpicked.',
  },
  glassKnight: {
    name: 'Glass Knight', ai: 'knight', art: 'glassKnight', tier: 'mid',
    minDepth: 3, weight: 1,
    r: 26, hp: 120, armor: 80, speed: 95, mass: 3, dmg: 20, height: 114, points: 4,
    regions: ['glasswood'], shatter: true,
    attacks: ['overheadSlam', 'backSweep'], eliteAttacks: ['overheadSlam', 'backSweep', 'shardSlam'],
    elite: { trick: 'Its slam throws a fan of glass shards.' },
    lore: 'The Thorn Regent\'s honour guard. Their plate is grown, not forged, and it shatters like a held breath when it breaks.',
  },
  needlecaster: {
    name: 'Needlecaster', ai: 'caster', art: 'needlecaster', tier: 'mid',
    minDepth: 1, weight: 1.4,
    r: 18, hp: 45, armor: 0, speed: 110, mass: 0.8, dmg: 8, height: 96, points: 2, float: 26,
    regions: ['glasswood', 'choir', 'forge', 'unwoven'],
    attacks: ['needleFan'], eliteAttacks: ['needleFan', 'needleStorm'], keep: 300, blink: true,
    elite: { trick: 'Casts a second, staggered fan and blinks more often.' },
    lore: 'They sewed the dreamers\' eyes shut, once, so they would sleep. Now they sew the air with black needles.',
  },
  chorister: {
    name: 'Drowned Chorister', ai: 'caster', art: 'chorister', tier: 'mid',
    minDepth: 0, weight: 1.4,
    r: 18, hp: 55, armor: 0, speed: 95, mass: 0.9, dmg: 11, height: 92, points: 2.6, float: 14,
    regions: ['choir'],
    attacks: ['songRing'], eliteAttacks: ['songRing', 'canon'], keep: 340, blink: false,
    elite: { trick: 'Sings in canon: two rings, one after the other.' },
    lore: 'Morrow\'s choir still sings. Their mouths are full of the sea, so the song comes out as rings of drowning water.',
  },
  snarl: {
    name: 'Snarl', ai: 'beast', art: 'snarl', tier: 'mid',
    minDepth: 0, weight: 1.3,
    r: 20, hp: 60, armor: 0, speed: 230, mass: 1.2, dmg: 12, height: 58, points: 2.2, eye: '#ff3b2e', stride: 0.035,
    regions: ['choir', 'forge', 'unwoven'],
    attacks: ['leap', 'bite'], eliteAttacks: ['leap', 'bite', 'doubleLeap'],
    elite: { trick: 'Lands and leaps again at once.' },
    lore: 'A knot pulled tight enough becomes a mouth. A mouth pulled tight enough becomes a wolf.',
  },
  lanternWarden: {
    name: 'Lantern Warden', ai: 'knight', art: 'lanternWarden', tier: 'mid',
    minDepth: 2, weight: 1,
    r: 28, hp: 170, armor: 70, speed: 80, mass: 3.4, dmg: 18, height: 116, points: 4.4,
    regions: ['choir'],
    attacks: ['censerSwing', 'censerSlam'], eliteAttacks: ['censerSwing', 'censerSlam', 'censerSpin'],
    elite: { trick: 'Whirls the censer in a full circle of burning water.' },
    lore: 'The sexton of the drowned cathedral. Its censer burns with water that remembers being fire.',
  },
  forgeThrall: {
    name: 'Forge Thrall', ai: 'thrower', art: 'forgeThrall', tier: 'mid',
    minDepth: 0, weight: 1.5,
    r: 20, hp: 70, armor: 0, speed: 120, mass: 1.4, dmg: 12, height: 84, points: 2.6,
    regions: ['forge'],
    attacks: ['hammerLob', 'hammerSwing'], eliteAttacks: ['hammerLob', 'hammerSwing', 'tripleLob'], keep: 260,
    elite: { trick: 'Lobs three hammers at once.' },
    lore: 'Chained to the bellows by a thread of molten gold. Aurum unchains one every night. By morning, they have chained themselves again.',
  },
  bellowsBrute: {
    name: 'Bellows Brute', ai: 'brute', art: 'bellowsBrute', tier: 'elite',
    minDepth: 4, weight: 0.5,
    r: 36, hp: 300, armor: 110, speed: 78, mass: 6, dmg: 22, height: 150, points: 8,
    regions: ['forge'], enrage: true,
    attacks: ['fireBreath', 'groundSlam'], eliteAttacks: ['fireBreath', 'groundSlam', 'fireSweep'],
    elite: { trick: 'Sweeps its fire breath across the room.' },
    lore: 'A Loomhulk stitched around a forge bellows. Every breath it takes, it gives back as fire.',
  },
  loomhulk: {
    name: 'Loomhulk', ai: 'brute', art: 'loomhulk', tier: 'elite',
    minDepth: 4, weight: 0.5,
    r: 38, hp: 320, armor: 120, speed: 80, mass: 7, dmg: 25, height: 160, points: 8.5,
    regions: ['glasswood', 'choir', 'forge', 'unwoven'], enrage: true,
    attacks: ['groundSlam', 'charge'], eliteAttacks: ['groundSlam', 'charge', 'quake'],
    elite: { trick: 'Its slam sends out a second shockwave ring.' },
    lore: 'Sewn together from the leftovers of a dozen Unravelled and a broken loom. It does not know which of them it is.',
  },
  echo: {
    name: 'Echo of Iri', ai: 'echo', art: 'echo', tier: 'mid',
    minDepth: 0, weight: 1.4,
    r: 18, hp: 75, armor: 0, speed: 300, mass: 1, dmg: 11, height: 80, points: 3.2,
    regions: ['unwoven'],
    attacks: ['echoDash', 'echoCombo'], eliteAttacks: ['echoDash', 'echoCombo', 'echoChain'],
    elite: { trick: 'Chains three dashes, like you do.' },
    lore: 'Sable kept every step you ever took in the dream. These are the ones he liked best.',
  },
  unspooler: {
    name: 'Unspooler', ai: 'unspooler', art: 'unspooler', tier: 'mid',
    minDepth: 1, weight: 1.1,
    r: 22, hp: 85, armor: 0, speed: 100, mass: 1.6, dmg: 12, height: 100, points: 3.2, float: 18,
    regions: ['unwoven'],
    attacks: ['snareThread', 'spoolSlash'], eliteAttacks: ['snareThread', 'spoolSlash', 'twinThread'], keep: 280,
    elite: { trick: 'Casts two threads at once.' },
    lore: 'A spindle wearing a person. It winds whatever it catches onto itself, and it has caught a great deal.',
  },
};

// Attack timings (seconds) and shapes (px). wind >= 0.35 always (cfg.minTelegraph).
// range: the AI starts the attack when the hero is within it. cd: cooldown after.
export const ATTACKS = {
  clawLunge: { wind: 0.45, act: 0.22, rec: 0.55, range: 175, cd: [0.6, 1.6], reach: 150, w: 54, speed: 760 },
  twinRake: { wind: 0.4, act: 0.2, rec: 0.6, range: 175, cd: [0.8, 1.8], reach: 150, w: 54, speed: 760, chain: 2 },
  overheadSlam: { wind: 0.7, act: 0.16, rec: 0.75, range: 200, cd: [1.0, 2.0], reach: 210, w: 76, wave: 260 },
  doubleSlam: { wind: 0.6, act: 0.16, rec: 0.8, range: 210, cd: [1.4, 2.4], reach: 210, w: 76, wave: 260, chain: 2 },
  shardSlam: { wind: 0.7, act: 0.16, rec: 0.75, range: 220, cd: [1.4, 2.4], reach: 210, w: 76, shards: 7 },
  backSweep: { wind: 0.5, act: 0.18, rec: 0.6, range: 150, cd: [1.0, 1.8], r: 150, arc: 2.6 },
  needleFan: { wind: 0.55, act: 0.12, rec: 0.5, range: 640, cd: [1.6, 2.6], n: 5, spread: 0.6, speed: 520 },
  needleStorm: { wind: 0.6, act: 0.4, rec: 0.6, range: 640, cd: [2.4, 3.4], n: 5, spread: 0.7, speed: 500, volleys: 2 },
  songRing: { wind: 0.65, act: 1.4, rec: 0.6, range: 520, cd: [2.2, 3.2], r: 420, w: 26, speed: 300 },
  canon: { wind: 0.65, act: 2.0, rec: 0.7, range: 520, cd: [3.0, 4.0], r: 420, w: 26, speed: 300, rings: 2 },
  leap: { wind: 0.42, act: 0.42, rec: 0.6, range: 420, min: 150, cd: [1.4, 2.4], r: 64 },
  doubleLeap: { wind: 0.4, act: 0.42, rec: 0.7, range: 420, min: 120, cd: [2.0, 3.0], r: 64, chain: 2 },
  bite: { wind: 0.36, act: 0.16, rec: 0.45, range: 95, cd: [0.6, 1.2], reach: 100, arc: 1.4 },
  censerSwing: { wind: 0.6, act: 0.22, rec: 0.7, range: 190, cd: [1.2, 2.0], r: 175, arc: 2.2, burn: 4 },
  censerSlam: { wind: 0.65, act: 0.16, rec: 0.8, range: 260, cd: [1.6, 2.6], reach: 230, r: 86, burn: 5 },
  censerSpin: { wind: 0.7, act: 0.9, rec: 0.9, range: 200, cd: [3, 4], r: 170, burn: 3 },
  hammerLob: { wind: 0.55, act: 0.75, rec: 0.55, range: 560, min: 120, cd: [1.6, 2.6], r: 70, hot: 3.5 },
  tripleLob: { wind: 0.6, act: 0.75, rec: 0.6, range: 560, min: 120, cd: [2.6, 3.6], r: 62, hot: 3, n: 3 },
  hammerSwing: { wind: 0.45, act: 0.18, rec: 0.55, range: 110, cd: [1, 1.6], reach: 120, arc: 1.8 },
  groundSlam: { wind: 0.9, act: 0.2, rec: 0.9, range: 230, cd: [1.6, 2.6], r: 150, wave: 330 },
  quake: { wind: 0.9, act: 0.6, rec: 1.0, range: 260, cd: [3, 4], r: 150, wave: 420, rings: 2 },
  charge: { wind: 0.75, act: 0.9, rec: 1.0, range: 900, min: 260, cd: [2.4, 3.4], w: 90, speed: 900, len: 760 },
  fireBreath: { wind: 0.7, act: 0.9, rec: 0.8, range: 330, cd: [2, 3], r: 320, arc: 0.8, tick: 0.15 },
  fireSweep: { wind: 0.8, act: 1.3, rec: 0.9, range: 330, cd: [3, 4], r: 300, arc: 0.6, tick: 0.15, sweep: 1.8 },
  echoDash: { wind: 0.4, act: 0.18, rec: 0.45, range: 360, min: 90, cd: [0.9, 1.6], w: 46, speed: 1300 },
  echoChain: { wind: 0.4, act: 0.18, rec: 0.6, range: 360, min: 60, cd: [2, 3], w: 46, speed: 1300, chain: 3 },
  echoCombo: { wind: 0.36, act: 0.6, rec: 0.55, range: 120, cd: [0.8, 1.4], reach: 110, arc: 1.3, hits: 3 },
  snareThread: { wind: 0.55, act: 1.6, rec: 0.6, range: 520, min: 140, cd: [2.6, 3.6], speed: 900, pull: 460 },
  twinThread: { wind: 0.6, act: 1.6, rec: 0.7, range: 520, min: 140, cd: [3, 4], speed: 900, pull: 460, n: 2 },
  spoolSlash: { wind: 0.45, act: 0.2, rec: 0.5, range: 130, cd: [1, 1.6], r: 130 },
};

// Codex/region helpers
export const kindsIn = (region) => Object.keys(KINDS).filter((k) => KINDS[k].regions.includes(region));
export const ENEMY_IDS = Object.keys(KINDS);
