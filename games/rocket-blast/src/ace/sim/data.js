// Catalogue data for Ace Pilot: sectors, enemy types, upgrades and bosses,
// with the display names the UI shows. Numbers that tune the game live here
// (hit points, score values, rates); behaviour lives in enemies.js and
// bosses.js, the wave scripts in waves.js.

// diff scales each sector: enemy hp, fire rate and bullet speed multipliers;
// boss multiplies boss hit points on top of hp.
// par is the score a strong run makes on a phone-width field; rank compares
// against it (scaled down on wide fields, where more enemies slip past and
// chains are harder to hold: see parScale in index.js).
export const SECTORS = [
  {
    id: 'belt',
    bossName: 'Quarry Hauler',
    name: 'Asteroid Belt',
    blurb: 'Learn to weave. Darts and gunships, divers late.',
    boss: 'hauler',
    diff: { hp: 1, fire: 1.45, speed: 1, boss: 1.5 },
    par: 850000,
    threats: ['dart', 'gunship', 'diver'], // enemy types this sector introduces
  },
  {
    id: 'storm',
    bossName: 'Tempest Array',
    name: 'Ion Storm',
    blurb: 'Snipers in the clouds and turret pods on the rails.',
    boss: 'tempest',
    diff: { hp: 1.12, fire: 1.08, speed: 1.05, boss: 1.4 },
    par: 700000,
    threats: ['sniper', 'turret'], // enemy types this sector introduces
  },
  {
    id: 'foundry',
    bossName: 'Foundry Crusher',
    name: 'Scrap Foundry',
    blurb: 'Shielded bulwarks and mine layers in the molten works.',
    boss: 'crusher',
    diff: { hp: 1.25, fire: 1.14, speed: 1.08, boss: 1.4 },
    par: 580000,
    threats: ['bulwark', 'minelayer'], // enemy types this sector introduces
  },
  {
    id: 'hive',
    bossName: 'Brood Engine',
    name: 'Hive Nebula',
    blurb: 'Splitters burst into shards. The hive builds machines.',
    boss: 'brood',
    diff: { hp: 1.38, fire: 1.1, speed: 1.08, boss: 1.15 },
    par: 830000,
    threats: ['splitter'], // enemy types this sector introduces
  },
  {
    id: 'dreadnought',
    bossName: 'The Dreadnought',
    name: 'The Dreadnought',
    blurb: 'Everything they have, then the mothership itself.',
    boss: 'dreadnought',
    diff: { hp: 1.5, fire: 1.14, speed: 1.1, boss: 1 },
    par: 870000,
    threats: [], // enemy types this sector introduces
  },
];

// r is the body radius in world units (hitbox for shots and contact).
// value is the score for a kill before the chain multiplier.
export const ENEMIES = {
  dart: { name: 'Dart', hp: 3, r: 0.48, value: 100 },
  gunship: { name: 'Gunship', hp: 30, r: 0.8, value: 400, big: true },
  diver: { name: 'Diver', hp: 6, r: 0.5, value: 180 },
  bulwark: { name: 'Bulwark', hp: 34, r: 0.85, value: 500, big: true, shieldHp: 26 },
  minelayer: { name: 'Mine Layer', hp: 20, r: 0.75, value: 350, big: true },
  mine: { name: 'Mine', hp: 2, r: 0.36, value: 30 },
  splitter: { name: 'Splitter', hp: 18, r: 0.8, value: 300, big: true },
  shard: { name: 'Shard', hp: 2, r: 0.34, value: 60 },
  sniper: { name: 'Sniper', hp: 11, r: 0.58, value: 320 },
  turret: { name: 'Turret Pod', hp: 22, r: 0.62, value: 350, big: true },
};

// rarity weights for offers
export const RARITY = { common: 60, rare: 30, legendary: 12 };

// max: levels (repair has none, it is used up). desc: one line per level.
export const UPGRADES = [
  { id: 'pierce', name: 'Piercing Rounds', rarity: 'rare', max: 3, desc: ['Cannon shots punch through 1 target and shields', 'Through 2 targets, +15% damage', 'Through 3 targets, +30% damage'] },
  { id: 'drones', name: 'Wing Drones', rarity: 'rare', max: 3, desc: ['Two drones fly your wings and fire', 'Drones fire faster and harder', 'Drones aim at the nearest enemy'] },
  { id: 'missiles', name: 'Homing Missiles', rarity: 'legendary', max: 3, desc: ['A homing missile every second', 'Missiles every 0.75 s', 'Two missiles at a time'] },
  { id: 'capacitor', name: 'Shield Capacitor', rarity: 'common', max: 3, desc: ['Shield recharges in 4.5 s', 'Shield recharges in 3.5 s', 'Shield holds 2 charges'] },
  { id: 'overdrive', name: 'Overdrive', rarity: 'common', max: 3, desc: ['Fire rate +20%', 'Fire rate +40%', 'Fire rate +60%'] },
  { id: 'spread', name: 'Spread Cannon', rarity: 'common', max: 3, desc: ['Two angled side guns', 'Four side guns', 'Side guns hit harder'] },
  { id: 'emp', name: 'EMP Charge', rarity: 'common', max: 3, desc: ['+1 EMP now, EMP hits harder', '+1 EMP now, EMP hits harder', '+1 EMP now, EMP hits harder'] },
  { id: 'repair', name: 'Hull Patch', rarity: 'common', max: 0, desc: ['Restore 1 hull segment'] },
  { id: 'magnet', name: 'Magnet', rarity: 'common', max: 3, desc: ['Pull pickups from 3 units', 'Pull from 5 units', 'Pull from 8 units'] },
  { id: 'afterburner', name: 'Afterburner', rarity: 'rare', max: 3, desc: ['Move 15% faster, short invulnerable dash', 'Move 30% faster, dash every 2.2 s', 'Move 45% faster, dash every 1.5 s'] },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// Display data for the bosses; the fights are in bosses.js.
export const BOSSES = {
  hauler: { id: 'hauler', name: 'Quarry Hauler', phases: 2, blurb: 'A mining barge: two sweeping drill arms, ore volleys, then the core.' },
  tempest: { id: 'tempest', name: 'Tempest Array', phases: 2, blurb: 'Three capacitor pylons arc lightning between them, then the central coil.' },
  crusher: { id: 'crusher', name: 'Foundry Crusher', phases: 3, blurb: 'Shoot off four turrets, then the iris core opens. Mind the jaws.' },
  brood: { id: 'brood', name: 'Brood Engine', phases: 3, blurb: 'Pods launch drones, spores spiral out, then it frenzies.' },
  dreadnought: { id: 'dreadnought', name: 'The Dreadnought', phases: 4, blurb: 'Broadside batteries, missile racks, the beam cannon, the core.' },
};
