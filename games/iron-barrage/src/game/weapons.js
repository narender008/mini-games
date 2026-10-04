// The arsenal. Numbers: damage at the centre of the blast, crater radius and
// blast radius in metres, how much the wind moves it (windK), muzzle speed
// multiple (speedK), and ammunition per battle before buying more.
//
// `kind` picks the projectile behaviour in projectiles.js; utilities are
// used on your own tank instead of fired.

export const WEAPONS = {
  shell: {
    name: 'HE Shell',
    short: 'HE',
    desc: 'Standard 120 mm high-explosive round. Unlimited.',
    kind: 'shell',
    sprite: 'shell',
    damage: 30,
    radius: 4.2,
    blast: 7.5,
    windK: 1,
    speedK: 1,
    fire: 'cannon',
    boom: 'he',
    power: 1,
    ammo: Infinity,
    price: 0,
  },
  heavy: {
    name: 'Heavy Shell',
    short: 'HVY',
    desc: 'A 155 mm round: bigger crater, more damage, and the wind pushes it less.',
    kind: 'shell',
    sprite: 'shell_heavy',
    damage: 48,
    radius: 6.4,
    blast: 10.5,
    windK: 0.6,
    speedK: 0.95,
    fire: 'heavy',
    boom: 'heavy',
    power: 1.7,
    ammo: 3,
    price: 120,
  },
  cluster: {
    name: 'Cluster Bomb',
    short: 'CLU',
    desc: 'Bursts over the target into six bomblets. Great against tanks in the open.',
    kind: 'cluster',
    sprite: 'cluster',
    bomblet: { sprite: 'bomblet', damage: 15, radius: 2.4, blast: 5, power: 0.55, boom: 'cluster' },
    count: 6,
    damage: 12,
    radius: 2.5,
    blast: 5,
    windK: 0.9,
    speedK: 1,
    fire: 'mortar',
    boom: 'cluster',
    power: 0.7,
    ammo: 2,
    price: 180,
  },
};

for (const [id, w] of Object.entries(WEAPONS)) w.id = id;

export const WEAPON_IDS = Object.keys(WEAPONS);

// What a tank starts a battle with, before purchases.
export function starterKit() {
  return { shell: Infinity, heavy: 2, cluster: 1 };
}
