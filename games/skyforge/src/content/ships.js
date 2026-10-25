// Player airships. Data only. Owner: PROGRESSION. Logic in src/sim/fleet.js.
//   cost      paid from the dock's network pool (coin from the colony)
//   capacity  goods per trip (before research bonuses)
//   speed     world tiles per game second at cruise (before bonuses and weather)
//   hp        hull; frigates and ambushes lower it, repaired slowly at a dock
//   where     'mooring' (any mooring or shipyard) or 'shipyard' (a shipyard in that network)
//   build     game seconds on the slip
//   roles     what the ship can do: trade, carry, scout, claim, escort, attack
export const SHIPS = [
  {
    id: 'skiff', name: 'Hot-air Skiff', icon: 'airship', needs: 'skiffs', where: 'mooring',
    cost: { coin: 60, planks: 20, wood: 10 }, capacity: 8, speed: 1.1, hp: 40, build: 40, crew: 2,
    roles: ['scout', 'trade', 'carry', 'claim'],
    desc: 'A patched balloon and a wicker gondola. Quick to build, quick to fly: the scout of the fleet.',
  },
  {
    id: 'cargo', name: 'Cargo Ship', icon: 'airship', needs: 'cargoholds', where: 'mooring',
    cost: { coin: 140, planks: 40, iron: 10 }, capacity: 40, speed: 0.8, hp: 80, build: 70, crew: 4,
    roles: ['trade', 'carry', 'claim', 'scout'],
    desc: 'A fat envelope over a deep wooden hold. The workhorse of every trade route.',
  },
  {
    id: 'galleon', name: 'Cloud Galleon', icon: 'airship', needs: 'galleons', where: 'shipyard',
    cost: { coin: 380, planks: 80, iron: 30, parts: 20 }, capacity: 120, speed: 0.9, hp: 220, build: 150, crew: 10,
    roles: ['trade', 'carry', 'claim', 'scout', 'escort'],
    charter: { rep: 60, coin: 900 },
    desc: 'Three envelopes, a hold like a barn and brass guns at the rails. Ports with high standing will charter you one.',
  },
  {
    id: 'militia', name: 'Militia Airship', icon: 'airship', needs: 'militia', where: 'shipyard',
    cost: { coin: 220, iron: 30, parts: 15 }, capacity: 0, speed: 1.3, hp: 160, build: 90, crew: 6, dmg: 14,
    roles: ['escort', 'attack', 'scout'],
    desc: 'An armoured skiff with a harpoon gun at the bow. Escorts expeditions, meets raiders in the open and can storm Corsair Roost.',
  },
];
