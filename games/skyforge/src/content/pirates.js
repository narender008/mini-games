// The Crimson Gale (THREATS). Pirate ship kinds and the player's raid abilities.
// Data only; the AI lives in src/sim/raids.js, the guns in src/sim/defence.js.
//
// PIRATES: { id, name, desc, hp, speed (tiles/s), turn (rad/s), climb (tiles/s),
//   alt (cruise height above the target island, tiles), size (hit radius, tiles),
//   points (raid budget cost), minChapter (earliest chapter in scheduled raids),
//   bounty (coin when shot down), loot (cargo it can carry off),
//   weapon: { kind, dmg, reload, range, ammo, ... }, role (what it goes after),
//   retreatAt (hp fraction at which it runs home) }
// Units: world tiles and game seconds (see the build brief).

export const CREW = { id: 'crimsongale', name: 'The Crimson Gale', flag: 'skull' };

export const PIRATES = [
  {
    id: 'corsair', name: 'Corsair skiff', role: 'plunder',
    desc: 'A fast skiff with a grapnel crew. Lands on moorings and storehouses and makes off with cargo.',
    hp: 60, speed: 3.3, turn: 2.4, climb: 1.6, alt: 2.4, size: 0.9,
    points: 1, minChapter: 4, bounty: 25, loot: 30, retreatAt: 0.3,
    weapon: { kind: 'board', board: 7 },
  },
  {
    id: 'raider', name: 'Raider', role: 'bomb',
    desc: 'Gunboat with a belly full of fire bombs. Makes bomb runs on buildings and sets them alight.',
    hp: 110, speed: 2.3, turn: 1.6, climb: 1.2, alt: 3.2, size: 1.1,
    points: 2, minChapter: 4, bounty: 40, loot: 0, retreatAt: 0.2,
    weapon: { kind: 'bomb', dmg: 45, splash: 1.3, fire: 0.6, ammo: 4, reload: 1.2 },
  },
  {
    id: 'frigate', name: 'Frigate', role: 'harpoon',
    desc: 'An armoured frigate. Harpoons bridges, cable cars and ships to tear them loose, and shells batteries.',
    hp: 230, speed: 1.6, turn: 1.0, climb: 0.9, alt: 3.6, size: 1.5,
    points: 3.5, minChapter: 5, bounty: 80, loot: 20, retreatAt: 0.22,
    weapon: { kind: 'grapple', dmg: 34, reload: 3.6, range: 6.5, ammo: 5,
      cannon: { dmg: 16, reload: 4.5, range: 7.5, speed: 11 } },
  },
  {
    id: 'dreadnought', name: 'The Dreadnought', role: 'siege', boss: true,
    desc: 'Flagship of the Crimson Gale. A flying fortress that comes for the Skyforge itself. It does not run: shoot it down, or it withdraws only to come back.',
    hp: 2000, speed: 1.05, turn: 0.55, climb: 0.6, alt: 3.6, size: 2.8,
    points: 0, minChapter: 7, bounty: 800, loot: 0, retreatAt: 0,
    weapon: { kind: 'broadside', dmg: 16, reload: 3.6, range: 9, guns: 2, speed: 10,
      bomb: { dmg: 45, splash: 1.6, fire: 0.6, reload: 7 }, escorts: 45 },
  },
];

// Raid abilities on the HUD (keys Q W E T; R is research). `needs` is a research
// id, `requires` a built building type. `cost` is paid up front (charge is the
// lightning-rod charge 0..1), `upkeep` per game second while active.
export const DEFENDS = [
  {
    id: 'volley', key: 'Q', name: 'Volley', icon: 'harpoon', needs: 'harpoons', requires: 'harpoon',
    cost: { iron: 4 }, cd: 40,
    desc: 'Every harpoon battery and bastion fires at once, at long range, on the marked raider (or the nearest).',
  },
  {
    id: 'lash', key: 'W', name: 'Lightning lash', icon: 'bolt', needs: 'rods', requires: 'rod',
    cost: { charge: 0.5 }, cd: 18,
    desc: 'Spend lightning stored in your rods: a bolt leaps from raider to raider.',
  },
  {
    id: 'shield', key: 'E', name: 'Raise shield', icon: 'shield', needs: 'shields', requires: 'shieldgen',
    cost: { aether: 4 }, upkeep: { aether: 0.12 }, upkeepCoin: 1.5, cd: 50, duration: 45,
    desc: 'A glass dome over the threatened island blocks bombs, shells and lightning. Burns aether (or coin) while raised.',
  },
  {
    id: 'militia', key: 'T', name: 'Militia ship', icon: 'airship', needs: 'militia', requires: 'mooring',
    cost: { coin: 80, iron: 8 }, cd: 75,
    desc: 'Launch an armed militia airship from a mooring to hunt the raiders down. It returns home after the raid.',
  },
];
