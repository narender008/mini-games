// Foreign ports (chart only, off the colony map) and the chart's fixed features.
// Data only. Owner: PROGRESSION. Logic in src/sim/trade.js and src/sim/chart.js.
// Positions are world tiles on the same plane as the islands (x east, y north);
// Hearthrock sits near the origin. A port's ships dock at (x, y), altitude z.
//   buys   resource -> price multiplier on VALUE (above 1: they want it)
//   sells  resource -> price multiplier you pay, and the stock they keep
//   wants  resources its contracts ask for, in rough order of the chapters

// Base value of one unit in coin (what a fair port pays before multipliers).
export const VALUE = {
  wood: 1, planks: 3, stone: 1.5, grain: 1.2, flour: 2.5, bread: 4,
  ore: 2.5, coal: 2, iron: 6, parts: 14, skystone: 12, aether: 36,
};

export const PORTS = [
  {
    id: 'porthalcyon', name: 'Port Halcyon', x: -40, y: 112, z: 6, icon: 'coin', color: '#d8a040',
    desc: 'A busy free city on a cluster of terraced isles. Its shipwrights pay well for iron and brass parts.',
    buys: { iron: 1.45, parts: 1.4, planks: 1.05, stone: 1.0, bread: 0.95 },
    sells: { stone: 1.2, planks: 1.25, ore: 1.3, aether: 1.7 },
    wants: ['iron', 'planks', 'parts', 'stone'],
  },
  {
    id: 'verdantdrift', name: 'Verdant Drift', x: -128, y: 8, z: 5, icon: 'grain', color: '#7ab04a',
    desc: 'Terraced farm-isles fed by mist. They sell grain and bread by the barge, and their builders are hungry for planks.',
    buys: { planks: 1.45, wood: 1.2, stone: 1.15, parts: 1.0 },
    sells: { grain: 1.0, flour: 1.1, bread: 1.1, wood: 1.2 },
    wants: ['planks', 'stone', 'parts', 'wood'],
  },
  {
    id: 'brassreach', name: 'Brass Reach', x: 44, y: -112, z: 7, icon: 'gear', color: '#c07a3a',
    desc: 'A smoky guild-city of foundries hanging under a single vast rock. It trades coal and parts for skystone and aether.',
    buys: { skystone: 1.45, aether: 1.5, iron: 1.1, bread: 1.05 },
    sells: { coal: 1.1, parts: 1.25, iron: 1.3, ore: 1.15, skystone: 1.5 },
    wants: ['bread', 'iron', 'skystone', 'aether'],
  },
];

// Fixed chart features. tempestWall: the storm barrier around Glimmerreach
// (ships cannot cross it before Storm Taming). pirateWaters: around Corsair Roost
// (ships there risk ambush unless escorted, until the Roost is taken).
export const CHART = {
  name: 'Hearthrock Expanse',
  tempestWall: { x: 44, y: 126, r: 28, island: 'glimmerreach', needs: 'stormtaming' },
  pirateWaters: { island: 'corsairroost', r: 34 },
  uncharted: [{ x: 150, y: 90 }, { x: 150, y: -20 }, { x: 120, y: -110 }],
  bounds: { x0: -150, y0: -125, x1: 160, y1: 160 },
};
