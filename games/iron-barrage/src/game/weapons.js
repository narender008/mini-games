// The arsenal. Numbers: damage at the centre of the blast, crater radius and
// blast (damage) radius in metres, how much the wind moves it (windK), muzzle
// speed multiple (speedK), gravity multiple (gravK), and `ammo`: how many
// rounds one purchase buys (the shop charges `price` for that many).
//
// `kind` picks the projectile behaviour in projectiles.js. Utilities
// (`utility: true`) are used on your own tank instead of fired: they do not
// end the turn and each works once per turn (see Battle.useUtility); their
// `use(tank, battle)` returns false when it would do nothing (nothing spent).
//
// Extra fields some weapons carry:
//   bomblet / bomb  the children of cluster and airstrike (own sprite, boom, numbers)
//   pierce          share of the armour a direct hit ignores (sabot)
//   splashK         share of `damage` the blast does to tanks it did not hit directly
//   impulse         m/s of knock at the centre of the blast (tanks fly, then take the fall)
//   limit           most one tank can carry; perBattle: most it may fire in a battle
//   onBlast         called after the blast's own effects (the nuke's shock)
//   burn, homing, dig, roll  the napalm, missile, buster and roller behaviour numbers
//   ai              hints for the computer gunner (read by ai.js, ignored by the rest)
import { K } from '../fx/particles.js';
import { rand } from '../config.js';

const SHIELD_HP = 50;
const REPAIR_HP = 35;

export const WEAPONS = {
  shell: {
    name: 'HE Shell',
    short: 'HE',
    desc: 'Standard 120 mm high-explosive round. Reliable and unlimited.',
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
    ai: { aim: 'ballistic', role: 'default' },
  },
  heavy: {
    name: 'Heavy Shell',
    short: 'HVY',
    desc: 'A 155 mm round: bigger crater, more damage, and the wind pushes it much less.',
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
    ai: { aim: 'ballistic', role: 'default', windy: true },
  },
  cluster: {
    name: 'Cluster Bomb',
    short: 'CLU',
    desc: 'Bursts over the target into six bomblets. Forgiving against tanks in the open, poor against dug-in ones.',
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
    ai: { aim: 'ballistic', role: 'open', minRange: 35 },
  },
  napalm: {
    name: 'Napalm',
    short: 'NPM',
    desc: 'Bursts into burning fuel that runs downhill into pits and burns for three of your turns. Tanks in it take damage at the start of each of their turns.',
    kind: 'napalm',
    sprite: 'napalm',
    damage: 14,
    radius: 1,
    blast: 6,
    windK: 0.9,
    speedK: 0.95,
    fire: 'mortar',
    boom: 'napalm',
    power: 0.9,
    ammo: 2,
    price: 200,
    // burn: damage per turn start, rounds it burns, how far the fuel may run (m)
    burn: { dmg: 10, rounds: 3, run: 13, pierce: 0.5 },
    ai: { aim: 'ballistic', role: 'area', note: 'fire runs downhill: aim a little uphill of a tank in a hollow' },
  },
  airstrike: {
    name: 'Airstrike',
    short: 'AIR',
    desc: 'Fire a smoke marker. A jet follows about a second later and bombs a 24 m line centred on the red smoke. Reaches over hills; the wind only moves the marker.',
    kind: 'airstrike',
    sprite: 'flare',
    // the bombs (the canister itself does almost nothing)
    bomb: { kind: 'bomb', sprite: 'bomb', damage: 26, radius: 5, blast: 8.5, power: 1.1, boom: 'bomb', windK: 0 },
    count: 5,
    spacing: 6,
    damage: 26,
    radius: 5,
    blast: 8.5,
    windK: 1,
    speedK: 1,
    fire: 'flare',
    boom: 'bomb',
    power: 1.1,
    ammo: 1,
    price: 350,
    ai: { aim: 'ballistic', role: 'area', note: 'the marker lands like a shell; the strike is centred on where it lands, so aim the shell at the target tank', wait: 6 },
  },
  missile: {
    name: 'Homing Missile',
    short: 'MSL',
    desc: 'Flies ballistic for half a second, then the motor lights and it steers onto the nearest enemy tank. Fire it high and let it find the target.',
    kind: 'missile',
    sprite: 'missile',
    damage: 38,
    radius: 4,
    blast: 8,
    windK: 0.6,
    speedK: 0.9,
    fire: 'missile',
    boom: 'missile',
    power: 1,
    ammo: 2,
    price: 360,
    // coast before ignition (s), cruise speed (m/s), turn rate (rad/s), fuel (s), proximity fuze (m)
    homing: { delay: 0.5, speed: 45, turn: 1.6, fuel: 4, prox: 1.5 },
    ai: { aim: 'homing', role: 'forgiving', note: 'steers onto the nearest enemy; needs a clear arc (hills block it) and is no use closer than about 30 m' , minRange: 30 },
  },
  buster: {
    name: 'Bunker Buster',
    short: 'BST',
    desc: 'Drives up to 14 m into the ground, then goes off. Digs enemies out from under overhangs and drops them into pits.',
    kind: 'buster',
    sprite: 'buster',
    damage: 55,
    radius: 8,
    blast: 12,
    windK: 0.7,
    speedK: 0.9,
    fire: 'heavy',
    boom: 'buster',
    power: 1.5,
    ammo: 2,
    price: 260,
    // how far it digs (m), tunnel radius (m), speed (m/s), fuse once it stops (s)
    dig: { depth: 14, tunnel: 1, speed: 30, fuse: 0.3 },
    ai: { aim: 'ballistic', role: 'dug-in', note: 'explodes underground at the end of its tunnel: best when the target is under cover or on a ledge' },
  },
  roller: {
    name: 'Roller',
    short: 'RLR',
    desc: 'Lands, then rolls along the ground, downhill and round hills, and blows when it touches a tank, stops or after six seconds. Gets into hollows and trenches.',
    kind: 'roller',
    sprite: 'roller',
    damage: 40,
    radius: 5,
    blast: 9,
    windK: 0.9,
    speedK: 0.9,
    fire: 'mortar',
    boom: 'roller',
    power: 1,
    ammo: 2,
    price: 220,
    // fuse (s), rolling friction (m/s^2) and drag (1/s), how much of its landing speed it keeps
    roll: { life: 6, friction: 1.4, drag: 0.15, keep: 0.7 },
    ai: { aim: 'ballistic', role: 'hollow', note: 'land it short of the target on the target side of a hill; it rolls on with the slope' },
  },
  sabot: {
    name: 'Sabot Dart',
    short: 'SBT',
    desc: 'A fast, flat dart that the wind barely moves. A direct hit does heavy damage through armour; a miss does almost nothing.',
    kind: 'sabot',
    sprite: 'sabot',
    damage: 60,
    radius: 1.4,
    blast: 3.2,
    windK: 0.05,
    speedK: 1.6,
    gravK: 0.55,
    fire: 'sabot',
    boom: 'sabot',
    power: 0.6,
    ammo: 3,
    price: 150,
    pierce: 0.5,
    splashK: 0.25,
    ai: { aim: 'ballistic', role: 'precise', note: 'only a direct hit counts: use at lower elevations and with wind' },
  },
  nuke: {
    name: 'Sunburst',
    short: 'SUN',
    desc: 'A tactical thermobaric warhead: a huge crater, a blast that throws tanks into the air, and a fall to finish them. One per battle. Stay clear.',
    kind: 'nuke',
    sprite: 'nuke',
    damage: 110,
    radius: 20,
    blast: 34,
    windK: 0.4,
    speedK: 0.92,
    fire: 'heavy',
    boom: 'nuke',
    power: 3,
    ammo: 1,
    price: 900,
    limit: 1,
    perBattle: 1,
    impulse: 34,
    onBlast(b, x, y) {
      b.fx.shake(1);
      b.sound.shellshock(1);
      if (!b.slow) b.slow = { t: 0 };
    },
    ai: { aim: 'ballistic', role: 'finisher', note: 'never within about 40 m of itself; best when two tanks are close together or one is nearly dead' },
  },

  // ---- utilities, used on your own tank
  shield: {
    name: 'Shield',
    short: 'SHD',
    desc: 'A force screen that soaks up 50 damage (most of each hit) for two enemy rounds. Does not end your turn.',
    kind: 'util',
    utility: true,
    sprite: null,
    damage: 0,
    radius: 0,
    blast: 0,
    windK: 0,
    speedK: 0,
    fire: 'cannon',
    boom: 'small',
    power: 0,
    ammo: 1,
    price: 160,
    use(t, b) {
      if (t.shield > SHIELD_HP * 0.8) return false;
      t.shield = SHIELD_HP;
      t.shieldMax = SHIELD_HP;
      t.shieldRounds = 2;
      b.hazards.shieldPulse(t, 1);
      b.sound.hit('shield', t.x, 0.9);
      b.app.hud?.float(t.x, t.y + t.hgt + 1.5, 'SHIELD', 'info');
      return true;
    },
    ai: { use: 'self', when: 'before a turn in which it expects to be shot at, if not already shielded' },
  },
  repair: {
    name: 'Repair Kit',
    short: 'FIX',
    desc: 'The crew patch the hull: restores 35 HP. Does not end your turn.',
    kind: 'util',
    utility: true,
    sprite: null,
    damage: 0,
    radius: 0,
    blast: 0,
    windK: 0,
    speedK: 0,
    fire: 'cannon',
    boom: 'small',
    power: 0,
    ammo: 1,
    price: 140,
    use(t, b) {
      const gain = Math.min(REPAIR_HP, t.maxHp - t.hp);
      if (gain < 1) return false;
      t.hp += gain;
      t.char = Math.max(0, t.char - 0.3);
      t.hot = 0;
      const P = b.fx.p;
      // welding sparks and a puff of steam over the hull
      for (let i = 0; i < 18; i++) {
        const j = P.spawn(K.SPARK, t.x + rand(-2.5, 2.5), t.y + t.hgt * rand(0.4, 1), rand(-4, 4), rand(4, 12), rand(0.04, 0.08), rand(0.3, 0.7), 1.6, 4.6, 3.4, 1);
        if (j >= 0) {
          P.grav[j] = 0.7;
          P.drag[j] = 1;
        }
      }
      P.spawn(K.FLASH, t.x, t.y + t.hgt * 0.8, 0, 0, 3.4, 0.22, 1.2, 2.6, 2.4, 0.8);
      for (let i = 0; i < 4; i++) b.fx.smoke(t.x + rand(-2, 2), t.y + t.hgt, rand(-0.5, 0.5), rand(1, 2.5), rand(0.5, 0.9), rand(1.2, 2), 0.5, 0.35);
      b.fx.glow(t.x, t.y + t.hgt + 1, 3, 14, 0.5, 1.6, 1.3, 0.5);
      b.sound.hit('repair', t.x, 0.9);
      b.app.hud?.float(t.x, t.y + t.hgt + 1.5, `+${Math.round(gain)} HP`, 'info');
      return true;
    },
    ai: { use: 'self', when: 'hp below about 60% of the maximum' },
  },
  chute: {
    name: 'Parachute',
    short: 'CHT',
    desc: 'Opens by itself on your next long fall and takes the sting out of it. Used up when it opens. Does not end your turn.',
    kind: 'util',
    utility: true,
    sprite: null,
    damage: 0,
    radius: 0,
    blast: 0,
    windK: 0,
    speedK: 0,
    fire: 'cannon',
    boom: 'small',
    power: 0,
    ammo: 2,
    price: 70,
    spentOnOpen: true,
    use(t, b) {
      if (t.chute) return false;
      t.chute = true;
      b.sound.ui('select');
      b.app.hud?.float(t.x, t.y + t.hgt + 1.5, 'CHUTE READY', 'info');
      return true;
    },
    ai: { use: 'self', when: 'standing on a ledge or after the enemy has a nuke or buster to hand' },
  },
};

for (const [id, w] of Object.entries(WEAPONS)) w.id = id;

export const WEAPON_IDS = Object.keys(WEAPONS);
// The order of the tray and the number keys (1 is the first the tank carries).
export const ARSENAL_ORDER = ['shell', 'heavy', 'cluster', 'napalm', 'airstrike', 'missile', 'buster', 'roller', 'sabot', 'nuke', 'shield', 'repair', 'chute'];
export const UTILITY_IDS = ARSENAL_ORDER.filter((id) => WEAPONS[id].utility);

export function isUtility(id) {
  return !!(WEAPONS[id] && WEAPONS[id].utility);
}

// What a tank starts a battle with, before purchases.
export function starterKit() {
  return { shell: Infinity, heavy: 2, cluster: 1, repair: 1 };
}
