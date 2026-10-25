// Research: four branches of five (concept 5, "Skyforge Academy").
// Data only. Owner: PROGRESSION. Logic in src/sim/research.js.
//   cost   insight plus goods (paid from the home network when a project begins)
//   time   game seconds with 2 scholars at work (more scholars: faster, see CFG.progression.research)
//   needs  research ids (cross-branch ones are drawn dashed, like the concept)
//   unlocks  building ids, 'link:cable', 'ship:<kind>', 'ability:<id>', 'feature:<id>'
//   bonus  fractions other modules read through research.bonus(G, key)
//   effects  what the detail card lists: [{ icon, text }]
export const BRANCHES = [
  { id: 'industry', name: 'Industry', icon: 'anvil', color: '#cf6f34', desc: 'Furnaces, steam and brass: more goods from every worker.' },
  { id: 'aeronautics', name: 'Aeronautics', icon: 'airship', color: '#3e74c0', desc: 'Airships, cargo and charters: the trade winds.' },
  { id: 'arcana', name: 'Skystone Arcana', icon: 'crystal', color: '#2a9eb4', desc: 'The lore of the floating stone that holds the islands up.' },
  { id: 'defence', name: 'Defence', icon: 'shield', color: '#b8423a', desc: 'Harpoons, rods and shields against the Crimson Gale and the storms.' },
];

export const RESEARCH = [
  // ---------------------------------------------------------------- Industry
  {
    id: 'bellows', branch: 'industry', tier: 1, name: 'Bellows Forge', icon: 'anvil',
    desc: 'Leather bellows push a white-hot draught through the hearth. Ore finally melts, and the smiths can hammer brass fittings.',
    cost: { insight: 40 }, time: 90, needs: [],
    unlocks: ['smelter', 'workshop'], bonus: {},
    effects: [{ icon: 'smelter', text: 'Smelter: ore and coal into iron' }, { icon: 'workshop', text: 'Workshop: iron and planks into parts' }],
  },
  {
    id: 'turbines', branch: 'industry', tier: 2, name: 'Steam Turbines', icon: 'engine',
    desc: 'Boilers spin brass turbines that haul cable cars across the widest gaps and drive every millstone and saw.',
    cost: { insight: 120, planks: 30, iron: 10 }, time: 160, needs: ['bellows'],
    unlocks: ['cablestation', 'link:cable'], bonus: { 'prod:planks': 0.15, 'prod:flour': 0.15 },
    effects: [{ icon: 'cablestation', text: 'Cable cars between far islands' }, { icon: 'sawmill', text: 'Sawmills and windmills +15%' }],
  },
  {
    id: 'assembly', branch: 'industry', tier: 3, name: 'Assembly Line', icon: 'gear',
    desc: 'Benches in a row, parts on a belt. Each workshop turns out a quarter more fittings with the same hands.',
    cost: { insight: 260, iron: 30, parts: 15 }, time: 240, needs: ['turbines'],
    unlocks: [], bonus: { 'prod:parts': 0.25, buildSpeed: 0.15 },
    effects: [{ icon: 'parts', text: 'Workshops +25% parts' }, { icon: 'hammer', text: 'Construction 15% faster' }],
  },
  {
    id: 'automatons', branch: 'industry', tier: 4, name: 'Brass Automatons', icon: 'hammer',
    desc: 'Clockwork labourers wound with a little aether take the dull shifts, so every industry needs fewer hands.',
    cost: { insight: 420, parts: 40, skystone: 15 }, time: 330, needs: ['assembly', 'crystallore'],
    unlocks: [], bonus: { staff: 0.2, production: 0.1 },
    effects: [{ icon: 'settler', text: 'Industry needs 20% fewer workers' }, { icon: 'gear', text: 'All production +10%' }],
  },
  {
    id: 'foundry', branch: 'industry', tier: 5, name: 'Sky Foundry', icon: 'furnace',
    desc: 'A foundry hot enough to pour skystone itself. Without it the great rings of the Skyforge cannot be cast.',
    cost: { insight: 650, iron: 80, parts: 50, skystone: 30 }, time: 420, needs: ['automatons', 'levitation'],
    unlocks: ['feature:forge3'], bonus: { 'prod:iron': 0.25, 'prod:skystone': 0.15 },
    effects: [{ icon: 'skyforge', text: 'Skyforge stages 3 to 5' }, { icon: 'iron', text: 'Smelters +25% iron' }],
  },
  // ---------------------------------------------------------------- Aeronautics
  {
    id: 'skiffs', branch: 'aeronautics', tier: 1, name: 'Hot-air Skiffs', icon: 'airship',
    desc: 'A patched balloon, a wicker gondola and a brave pilot: the first ships that can reach the islands beyond the bridges.',
    cost: { insight: 40, planks: 20 }, time: 90, needs: [],
    unlocks: ['ship:skiff', 'feature:expeditions'], bonus: {},
    effects: [{ icon: 'airship', text: 'Build skiffs at a mooring' }, { icon: 'compass', text: 'Scouting expeditions on the chart' }],
  },
  {
    id: 'cargoholds', branch: 'aeronautics', tier: 2, name: 'Cargo Holds', icon: 'dock',
    desc: 'Deep keels slung under fat envelopes. Cargo ships run trade routes to the foreign ports and carry goods between your far islands.',
    cost: { insight: 110, planks: 40 }, time: 150, needs: ['skiffs'],
    unlocks: ['ship:cargo', 'shipyard', 'feature:routes'], bonus: { shipCapacity: 0.1 },
    effects: [{ icon: 'airship', text: 'Cargo ships and trade routes' }, { icon: 'shipyard', text: 'Shipyard' }],
  },
  {
    id: 'propellers', branch: 'aeronautics', tier: 3, name: 'Propeller Pitch', icon: 'propeller',
    desc: 'Variable-pitch propellers bite the wind at every angle. Every airship flies a quarter faster, even into a headwind.',
    cost: { insight: 220, iron: 20, parts: 15 }, time: 210, needs: ['cargoholds'],
    unlocks: [], bonus: { shipSpeed: 0.25, stormSlow: 0.2 },
    effects: [{ icon: 'propeller', text: 'Airships fly 25% faster' }, { icon: 'storm', text: 'Storms slow ships less' }],
  },
  {
    id: 'charters', branch: 'aeronautics', tier: 4, name: 'Trade Charters', icon: 'coin',
    desc: 'Sealed charters from the port guilds: better prices, richer contracts and a standing that opens their docks to you.',
    cost: { insight: 380, parts: 30, coin: 300 }, time: 300, needs: ['propellers'],
    unlocks: ['feature:contracts2'], bonus: { tradeIncome: 0.15, contractReward: 0.25, reputation: 0.5 },
    effects: [{ icon: 'coin', text: 'Trade income +15%' }, { icon: 'scroll', text: 'Contracts pay 25% more, reputation grows faster' }],
  },
  {
    id: 'galleons', branch: 'aeronautics', tier: 5, name: 'Cloud Galleons', icon: 'airship',
    desc: 'Three envelopes, a hold like a barn and brass guns at the rails. One galleon carries what a fleet of cargo ships once did.',
    cost: { insight: 600, planks: 80, parts: 60, skystone: 20 }, time: 400, needs: ['charters', 'levitation'],
    unlocks: ['ship:galleon'], bonus: { shipCapacity: 0.15 },
    effects: [{ icon: 'airship', text: 'Galleons at the shipyard' }, { icon: 'dock', text: 'All holds +15%' }],
  },
  // ---------------------------------------------------------------- Skystone Arcana
  {
    id: 'crystallore', branch: 'arcana', tier: 1, name: 'Crystal Lore', icon: 'crystal',
    desc: 'The blue crystals that grow under the heat vents are skystone in the making. Drill them out before they float away.',
    cost: { insight: 60 }, time: 110, needs: [],
    unlocks: ['drill'], bonus: { 'prod:insight': 0.1 },
    effects: [{ icon: 'drill', text: 'Crystal drill: crystal into skystone' }, { icon: 'insight', text: 'Scholars +10% insight' }],
  },
  {
    id: 'levitation', branch: 'arcana', tier: 2, name: 'Levitation Engines', icon: 'island',
    desc: 'Bolt skystone engines to the bedrock and your islands can drift. Pull the mine island closer to the forge and every cable car runs faster.',
    cost: { insight: 300, skystone: 20, parts: 20 }, time: 240, needs: ['crystallore', 'propellers'],
    unlocks: ['refinery', 'feature:drift'], bonus: { tradeIncome: 0.15 },
    effects: [{ icon: 'island', text: 'Move your islets across the chart' }, { icon: 'refinery', text: 'Aether refinery' }, { icon: 'airship', text: 'Shorter trade routes: +15% income' }],
  },
  {
    id: 'drift', branch: 'arcana', tier: 3, name: 'Island Drift', icon: 'compass',
    desc: 'Great engines can steer a far island home. Tow a claimed island into the cluster so bridges and cable cars can reach it.',
    cost: { insight: 380, skystone: 30, aether: 5 }, time: 300, needs: ['levitation'],
    unlocks: ['feature:fardrift'], bonus: { driftSpeed: 0.5, 'prod:skystone': 0.15 },
    effects: [{ icon: 'compass', text: 'Tow far islands into the cluster' }, { icon: 'skystone', text: 'Drills +15% skystone' }],
  },
  {
    id: 'stormtaming', branch: 'arcana', tier: 4, name: 'Storm Taming', icon: 'storm',
    desc: 'Skystone vanes bend the lightning aside. Ships can pass the Tempest Wall, and storms do half the harm.',
    cost: { insight: 520, skystone: 40, aether: 15 }, time: 360, needs: ['drift', 'rods'],
    unlocks: ['skyforge', 'feature:tempest'], bonus: { stormDamage: 0.5 },
    effects: [{ icon: 'storm', text: 'Sail through the Tempest Wall to Glimmerreach' }, { icon: 'skyforge', text: 'Raise the Skyforge on its ruin' }, { icon: 'shield', text: 'Storm damage halved' }],
  },
  {
    id: 'beacon', branch: 'arcana', tier: 5, name: 'Aether Beacon', icon: 'star',
    desc: 'A lens of pure aether that gathers starlight into the forge. The last two stages of the Skyforge burn with its light.',
    cost: { insight: 750, aether: 40, parts: 40 }, time: 450, needs: ['stormtaming', 'foundry'],
    unlocks: ['feature:forge4'], bonus: { 'prod:aether': 0.25, warning: 0.5 },
    effects: [{ icon: 'skyforge', text: 'Skyforge stages 4 and 5' }, { icon: 'aether', text: 'Refineries +25% aether' }, { icon: 'observatory', text: 'Raids are seen 50% sooner' }],
  },
  // ---------------------------------------------------------------- Defence
  {
    id: 'harpoons', branch: 'defence', tier: 1, name: 'Harpoon Battery', icon: 'harpoon',
    desc: 'Spring-loaded harpoon guns on swivel mounts. Hook a raider and reel it down before it reaches the granary.',
    cost: { insight: 50, planks: 20, iron: 5 }, time: 100, needs: [],
    unlocks: ['harpoon', 'ability:volley'], bonus: {},
    effects: [{ icon: 'harpoon', text: 'Harpoon batteries' }, { icon: 'volley', text: 'Volley: every battery fires at once' }],
  },
  {
    id: 'rods', branch: 'defence', tier: 2, name: 'Lightning Rods', icon: 'rod',
    desc: 'Copper spires draw the storm\'s anger into the rock, and store a little of it for a counter-strike.',
    cost: { insight: 120, iron: 20 }, time: 150, needs: ['harpoons'],
    unlocks: ['rod', 'ability:lash'], bonus: { fireSpread: 0.25 },
    effects: [{ icon: 'rod', text: 'Lightning rods' }, { icon: 'lash', text: 'Lightning lash on raiders' }, { icon: 'fire', text: 'Fires spread 25% slower' }],
  },
  {
    id: 'shields', branch: 'defence', tier: 3, name: 'Storm Shields', icon: 'shield',
    desc: 'A dome of humming skystone light over one island at a time. Bombs and bolts alike slide off it.',
    cost: { insight: 260, iron: 30, skystone: 15 }, time: 240, needs: ['rods', 'crystallore'],
    unlocks: ['shieldgen', 'ability:shield'], bonus: { raidDamage: 0.15 },
    effects: [{ icon: 'shieldgen', text: 'Shield generator' }, { icon: 'shield', text: 'Raise a storm shield over an island' }],
  },
  {
    id: 'militia', branch: 'defence', tier: 4, name: 'Militia Airships', icon: 'cannon',
    desc: 'Volunteer crews in armoured skiffs. They meet raiders in the open sky, escort your expeditions and can storm Corsair Roost.',
    cost: { insight: 400, iron: 40, parts: 30 }, time: 300, needs: ['shields', 'cargoholds'],
    unlocks: ['ship:militia', 'ability:militia', 'feature:roost'], bonus: { defence: 0.1 },
    effects: [{ icon: 'airship', text: 'Militia airships at the shipyard' }, { icon: 'militia', text: 'Scramble the militia in a raid' }, { icon: 'skull', text: 'Attack Corsair Roost' }],
  },
  {
    id: 'bastion', branch: 'defence', tier: 5, name: 'Skyguard Bastion', icon: 'shield',
    desc: 'Heavy flak towers on stone footings, built to bring down even the Crimson Gale\'s Dreadnought.',
    cost: { insight: 600, stone: 120, iron: 60, parts: 40 }, time: 400, needs: ['militia', 'assembly'],
    unlocks: ['bastion'], bonus: { defence: 0.2, raidDamage: 0.15 },
    effects: [{ icon: 'bastion', text: 'Bastion flak towers' }, { icon: 'shield', text: 'Raid damage -15% more' }],
  },
];
