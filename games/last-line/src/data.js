// Last Line: enemies, waves and upgrades as data. The sim (game.js) reads
// these; balance lives here.

// r: body radius. speed: px/s. line: damage per second to the line (or a
// barricade) once they reach it. threat: how much assisted aim and the
// drones care about them.
export const ENEMIES = {
  // rifle infantry in gas masks: most walk straight at the line, some stop
  // halfway and fire a short burst at the soldier
  grunt: { name: 'Rifleman', plural: 'Riflemen', hp: 30, r: 14, speed: 48, line: 3, threat: 1, score: 10 },
  // fast and fragile, carrying a satchel charge: blows a hole in the line
  // (or whatever they reach). Shot down, the charge goes off where they fall
  sapper: { name: 'Sapper', plural: 'Sappers', hp: 20, r: 12, speed: 100, line: 0, blast: 14, threat: 3, score: 20 },
  // stops in the middle distance, sets up a light mortar and shells the
  // soldier; every round is marked on the ground before it lands
  mortar: { name: 'Mortar team', plural: 'Mortar teams', hp: 60, r: 15, speed: 36, line: 3, threat: 2.2, score: 30 },
  // slow, armoured, behind a riveted shield that turns to face the soldier.
  // Head on it shrugs off most rounds: move to hit it from the side
  heavy: { name: 'Shield trooper', plural: 'Shield troopers', hp: 250, r: 21, speed: 26, line: 8, threat: 1.6, score: 60 },
};

// group times are scaled by this, to tune the pace of every wave at once
export const TEMPO = 0.75;
// and group sizes by this
export const COUNT = 0.85;

// the boss of wave ten
export const BOSS = { name: 'Iron Mammoth', hp: 6500, w: 210, h: 270, stopY: 330, speed: 18, score: 2000 };

// Each wave is a list of groups: [time s, type, count, pattern]. Patterns:
// line (a rank across the field), spread (scattered), column (a file down
// one side), flank (both edges), pack (a tight knot).
export const WAVES = [
  { name: 'First contact', groups: [[0, 'grunt', 5, 'line'], [6, 'grunt', 6, 'spread'], [13, 'grunt', 7, 'line']] },
  { name: 'Sappers', groups: [[0, 'grunt', 8, 'line'], [5, 'sapper', 3, 'spread'], [11, 'grunt', 8, 'spread'], [16, 'sapper', 4, 'flank']] },
  { name: 'Shellfire', groups: [[0, 'grunt', 9, 'line'], [3, 'mortar', 2, 'spread'], [10, 'grunt', 8, 'spread'], [14, 'sapper', 4, 'pack'], [20, 'grunt', 9, 'line']] },
  { name: 'Iron wall', groups: [[0, 'grunt', 10, 'spread'], [2, 'heavy', 1, 'pack'], [10, 'sapper', 5, 'flank'], [14, 'mortar', 2, 'spread'], [20, 'grunt', 10, 'line']] },
  { name: 'The push', groups: [[0, 'grunt', 14, 'line'], [5, 'heavy', 2, 'spread'], [11, 'sapper', 6, 'pack'], [15, 'mortar', 3, 'spread'], [22, 'grunt', 14, 'spread']] },
  { name: 'Flankers', groups: [[0, 'sapper', 8, 'flank'], [3, 'grunt', 12, 'column'], [8, 'mortar', 3, 'spread'], [13, 'heavy', 2, 'flank'], [19, 'sapper', 8, 'flank'], [23, 'grunt', 12, 'line']] },
  { name: 'Shield wall', groups: [[0, 'heavy', 3, 'line'], [3, 'grunt', 14, 'spread'], [9, 'mortar', 4, 'spread'], [15, 'sapper', 9, 'pack'], [21, 'grunt', 14, 'line'], [24, 'heavy', 1, 'pack']] },
  { name: 'Night assault', groups: [[0, 'grunt', 18, 'line'], [5, 'sapper', 9, 'spread'], [9, 'mortar', 4, 'spread'], [13, 'heavy', 3, 'spread'], [19, 'grunt', 16, 'spread'], [25, 'sapper', 10, 'flank']] },
  { name: 'Everything they have', groups: [[0, 'grunt', 18, 'line'], [2, 'heavy', 3, 'line'], [7, 'mortar', 5, 'spread'], [11, 'sapper', 12, 'flank'], [16, 'grunt', 20, 'spread'], [21, 'heavy', 2, 'flank'], [26, 'sapper', 12, 'pack']] },
  { name: 'Iron Mammoth', boss: true, groups: [[0, 'grunt', 8, 'line'], [9, 'sapper', 5, 'flank'], [18, 'grunt', 10, 'spread'], [30, 'mortar', 2, 'spread']] },
];

// Six upgrades of three ranks each. After every wave three are offered, with
// a field repair beside them: take a rank, or patch the line.
export const UPGRADES = {
  pierce: {
    name: 'Piercing rounds',
    kind: 'Ammunition',
    ranks: ['Rounds go through one more body.', 'Through two, and cut 40% into shields and armour.', 'Through four, and 80% into shields and armour.'],
  },
  fire: {
    name: 'Incendiary rounds',
    kind: 'Ammunition',
    ranks: ['Hits set targets burning.', 'Hotter fire, and it catches on shields.', 'Burning bodies spread the fire to those around them.'],
  },
  drone: {
    name: 'Gun drone',
    kind: 'Support',
    ranks: ['A drone hovers over you and shoots the worst threat in sight.', 'A second drone.', 'A third drone, and all of them fire faster.'],
  },
  barrier: {
    name: 'Steel barricade',
    kind: 'Deployable',
    ranks: ['Drop a barricade in the field (E or right-click). The enemy must break it to pass.', 'Two charges, and tougher plate.', 'Three charges, heavy plate, faster resupply.'],
  },
  air: {
    name: 'Airstrike',
    kind: 'Call-in',
    ranks: ['Call a bombing run down one lane (Q or Space).', 'Heavier bombs, sooner resupply.', 'Incendiary bombs that leave the lane on fire.'],
  },
  cool: {
    name: 'Coolant feed',
    kind: 'Weapon',
    ranks: ['The gun heats 25% slower and spins up faster.', 'Heats 42% slower, fires 10% faster.', 'Heats 55% slower, fires 20% faster.'],
  },
};
export const REPAIR = { line: 30, hp: 30 };
