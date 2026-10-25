// Resources (ECONOMY). Data only. Ids are binding (see the build brief).
// { id, name, short, color (HUD tint), tier (1 raw, 2 refined, 3 advanced),
//   pooled (lives in a network pool; coin and insight are colony-wide on
//   G.colony), food (food units one item feeds; settlers eat
//   CFG.economy.food.perSettler units a minute), price (rough base value in
//   coin, a guide for ports and contracts), from (building that makes it), desc }
export const RESOURCES = [
  { id: 'wood', name: 'Wood', short: 'Wood', color: '#b9814a', tier: 1, pooled: true, price: 2, from: 'lumber',
    desc: 'Logs from the lumber camps. Builds the first homes and feeds the sawmill.' },
  { id: 'planks', name: 'Planks', short: 'Planks', color: '#e0b070', tier: 2, pooled: true, price: 5, from: 'sawmill',
    desc: 'Sawn boards. Every proper building, bridge deck and airship hull needs them.' },
  { id: 'stone', name: 'Stone', short: 'Stone', color: '#a9aab8', tier: 1, pooled: true, price: 2, from: 'quarry',
    desc: 'Cut from outcrops. Foundations, smelters, bridges and the Skyforge itself.' },
  { id: 'grain', name: 'Grain', short: 'Grain', color: '#e8c35a', tier: 1, pooled: true, food: 1, price: 2, from: 'farm',
    desc: 'Golden wheat. Settlers eat it plain when there is no bread; the windmill grinds it to flour.' },
  { id: 'flour', name: 'Flour', short: 'Flour', color: '#f3ead2', tier: 2, pooled: true, price: 4, from: 'windmill',
    desc: 'Milled grain, waiting for the bakery ovens.' },
  { id: 'bread', name: 'Bread', short: 'Bread', color: '#d58a3c', tier: 2, pooled: true, food: 1.6, price: 7, from: 'bakery',
    desc: 'Warm loaves. Feeds more than grain and makes settlers happier.' },
  { id: 'ore', name: 'Iron ore', short: 'Ore', color: '#b2683e', tier: 1, pooled: true, price: 3, from: 'mine',
    desc: 'Rust-red ore from the mine shafts. Smelt it with coal, or over a heat vent.' },
  { id: 'coal', name: 'Coal', short: 'Coal', color: '#4a4652', tier: 1, pooled: true, price: 3, from: 'coalpit',
    desc: 'Black coal from the seams. Fuels the smelters (not needed on a heat vent).' },
  { id: 'iron', name: 'Iron', short: 'Iron', color: '#c9d2dc', tier: 2, pooled: true, price: 12, from: 'smelter',
    desc: 'Iron ingots. Parts, batteries, cable cars and the Skyforge frame.' },
  { id: 'parts', name: 'Brass parts', short: 'Parts', color: '#e2b23c', tier: 3, pooled: true, price: 30, from: 'workshop',
    desc: 'Gears, valves and fittings from the workshop. Machines, townhouses and airships.' },
  { id: 'skystone', name: 'Skystone', short: 'Skystone', color: '#5fd3e8', tier: 2, pooled: true, price: 25, from: 'drill',
    desc: 'The glowing crystal that keeps the islands aloft, drilled from crystal seams.' },
  { id: 'aether', name: 'Aether', short: 'Aether', color: '#b78cff', tier: 3, pooled: true, price: 70, from: 'refinery',
    desc: 'Refined skystone essence. Powers storm shields and the heart of the Skyforge.' },
  { id: 'coin', name: 'Coin', short: 'Coin', color: '#f2c94c', tier: 1, pooled: false, price: 1, from: 'townhall',
    desc: 'Colony treasury: taxes, markets and trade. Pays upkeep and claims.' },
  { id: 'insight', name: 'Insight', short: 'Insight', color: '#9be3ff', tier: 2, pooled: false, price: 0, from: 'academy',
    desc: 'Knowledge from the academy scholars. Spent on research.' },
];

export const POOLED = RESOURCES.filter((r) => r.pooled).map((r) => r.id);
export const FOODS = RESOURCES.filter((r) => r.food).map((r) => r.id);
