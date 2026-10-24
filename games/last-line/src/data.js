// Last Line: enemies, weapons and upgrades as data. The sim (game.js) reads
// these; balance lives here and in levels.js (waves, bosses, sector
// toughness).

// r: body radius. speed: px/s. line: damage per second to the line (or a
// barricade) once they reach it. threat: how much assisted aim and the
// drones care about them. charge: how much a kill fills the orbital strike.
export const ENEMIES = {
  // rifle infantry in gas masks: most walk straight at the line, some stop
  // halfway and fire a short burst at the soldier
  grunt: { name: 'Rifleman', plural: 'Riflemen', hp: 30, r: 14, speed: 48, line: 3, threat: 1, score: 10, charge: 2.2 },
  // fast and fragile, carrying a satchel charge: blows a hole in the line
  // (or whatever they reach). Shot down, the charge goes off where they fall
  sapper: { name: 'Sapper', plural: 'Sappers', hp: 20, r: 12, speed: 100, line: 0, blast: 14, threat: 3, score: 20, charge: 3 },
  // stops in the middle distance, sets up a light mortar and shells the
  // soldier; every round is marked on the ground before it lands
  mortar: { name: 'Mortar team', plural: 'Mortar teams', hp: 60, r: 15, speed: 36, line: 3, threat: 2.2, score: 30, charge: 4.5 },
  // slow, armoured, behind a riveted shield that turns to face the soldier.
  // Head on it shrugs off most rounds: move to hit it from the side
  heavy: { name: 'Shield trooper', plural: 'Shield troopers', hp: 250, r: 21, speed: 26, line: 8, threat: 1.6, score: 60, charge: 7 },
  // a hornet drone: flies over the wire and the barricades, weaving, and
  // dives at the soldier to burst. Fragile
  flyer: { name: 'Hornet drone', plural: 'Hornet drones', hp: 16, r: 11, speed: 120, line: 0, dive: 14, threat: 2.6, score: 25, charge: 2.6 },
  // a walking furnace in plate armour: every hit is halved unless it gets
  // through armour, and it tears the line apart when it gets there
  brute: { name: 'Juggernaut', plural: 'Juggernauts', hp: 600, r: 28, speed: 21, line: 14, armour: 0.5, threat: 2.4, score: 140, charge: 12 },
};

// group times are scaled by this, to tune the pace of every wave at once
export const TEMPO = 0.75;
// and group sizes by this
export const COUNT = 0.85;

// The arsenal. One is carried into a sector; clearing sectors unlocks the
// rest (levels.js reward). heat: per shot (or per second for the beam).
export const WEAPONS = {
  rotary: {
    name: 'Rotary Cannon',
    kind: 'Spin-up machine gun',
    desc: 'Six barrels that spin up into a wall of tracer. Fire in bursts or it overheats.',
    color: '#ffb347',
    stats: { power: 2, range: 3, crowd: 2 },
  },
  tesla: {
    name: 'Tesla Arc',
    kind: 'Chain lightning',
    desc: 'Lightning that leaps from enemy to enemy, five at a time, and goes straight through shields.',
    color: '#7df9ff',
    stats: { power: 2, range: 2, crowd: 3 },
  },
  plasma: {
    name: 'Plasma Lance',
    kind: 'Continuous beam',
    desc: 'A searing beam that burns through every body in its path and gets hotter the longer you hold it on.',
    color: '#ff4fd8',
    stats: { power: 3, range: 3, crowd: 2 },
  },
  rockets: {
    name: 'Swarm Launcher',
    kind: 'Homing rockets',
    desc: 'Volleys of four homing micro-rockets that each find a target and burst in fire.',
    color: '#ffe04a',
    stats: { power: 3, range: 3, crowd: 3 },
  },
  rail: {
    name: 'Rail Cannon',
    kind: 'Charge shot',
    desc: 'Hold to charge, let go to fire a hypersonic slug through the whole field. Cuts through any armour, even a boss hull.',
    color: '#8dff6a',
    stats: { power: 3, range: 3, crowd: 2 },
  },
};
export const WEAPON_ORDER = ['rotary', 'tesla', 'plasma', 'rockets', 'rail'];

// the orbital strike: charged by kills, called with F (or its button)
export const ORBITAL = { dps: 300, boss: 140, r: 78, time: 3.4, speed: 460 };

// Seven upgrades of three ranks each. After every wave three are offered,
// with a field repair beside them: take a rank, or patch the line.
export const UPGRADES = {
  pierce: {
    name: 'Overcharge',
    kind: 'Weapon',
    ranks: ['Damage +20%. Rounds pierce one more body, arcs jump once more.', 'Damage +40%, and 40% gets through shields and armour.', 'Damage +65%, and 80% gets through shields and armour.'],
  },
  fire: {
    name: 'Incendiary',
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
    ranks: ['Your weapon heats 25% slower and spins up or charges faster.', 'Heats 42% slower, fires 10% faster.', 'Heats 55% slower, fires 20% faster.'],
  },
  ult: {
    name: 'Ion capacitor',
    kind: 'Orbital',
    ranks: ['The orbital strike charges 30% faster.', 'Charges 60% faster and burns a second longer.', 'Charges twice as fast, burns two seconds longer, wider beam.'],
  },
};
export const REPAIR = { line: 30, hp: 30 };
