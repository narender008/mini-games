// Buildings and links (ECONOMY). Data only: the sim reads these numbers, the
// bot plans from them through __sf.content(), the UI shows them.
//
// BUILDINGS entry:
//   id, name, tab ('homes'|'industry'|'farming'|'airships'|'civic'|'defence'|'wonder'), desc
//   size [w, d]     footprint in cells; a building at (u, v) covers u..u+w-1, v..v+d-1
//                   ((u, v) is its front-left cell, v = 0 is the island's front row)
//   cost {res: n}   paid up front from the island's network pool (coin from G.colony)
//   time            construction seconds with a full crew of `builders` idle settlers
//   builders        settlers that build it (fewer builders = slower, none = stopped)
//   needs           research id that unlocks it (null = open from the start)
//   req             a building type that must already stand (built) somewhere in the colony
//   workers         settlers it employs at level 1 (staff(id, n) lowers it)
//   produces {res: perMin}, consumes {res: perMin}   at full staff and efficiency, level 1
//   env             'farm' | 'outdoor' | 'indoor' | 'none': how night and weather slow it
//                   (CFG.economy.env)
//   place           placement rule:
//                     on: cell char that must make up at least `min` footprint cells
//                         (deposits: s stone, o ore, c coal, k crystal, h vent, f fertile, x ruin)
//                     near: { cell, r, min } at least `min` such cells within `r` of the footprint
//                     edge: true  a footprint cell touches open sky (island rim)
//                     vent: 'bonus' may sit on heat vents (h); on one it needs no coal
//                     exact: true  footprint must match the ruin exactly (skyforge)
//   housing         settlers housed; storage: amount added to every pooled resource's cap
//   upkeep          coin per minute while built (and switched on)
//   unique          only one in the colony; max: at most this many
//   levels          upgrades: [{ level, name, cost, time, needs, req, mul (output and
//                   input x), workers (+), housing, storage, desc }]
//   hp              max hp (else THREATS' CFG.threats.combat hpBySize/hpByType)
//
// Rates are per game minute (1 day = 5 min). Night: farms x0.5, outdoor work
// x0.75, indoor x0.9; storms slow outdoor work by up to half (CFG.economy.env).
export const BUILDINGS = [
  // ---- Homes ----------------------------------------------------------------
  { id: 'townhall', name: 'Town Hall', tab: 'homes', size: [3, 3], cost: {}, time: 0, builders: 0, needs: null, req: null,
    workers: 0, produces: {}, consumes: {}, env: 'none', place: {}, unique: true, buildable: false,
    housing: 2, storage: 200, upkeep: 0, immigration: 1,
    levels: [
      { level: 2, name: 'Guild Hall', cost: { planks: 60, stone: 80, coin: 150 }, time: 120, housing: 4, storage: 150, immigration: 0.5,
        desc: 'More storage, rooms for four more settlers and a busier landing.' },
      { level: 3, name: 'Grand Hall', cost: { planks: 120, stone: 160, iron: 40, parts: 10, coin: 400 }, time: 200, housing: 6, storage: 250, immigration: 0.5, req: 'bakery',
        desc: 'The pride of the colony. Lots of storage and a steady stream of newcomers.' },
    ],
    desc: 'Heart of the colony: stores goods, houses the founders, collects taxes and welcomes newcomers.' },
  { id: 'cottage', name: 'Cottage', tab: 'homes', size: [2, 2], cost: { wood: 20, stone: 8 }, time: 28, builders: 2, needs: null, req: null,
    workers: 0, produces: {}, consumes: {}, env: 'none', place: {}, housing: 4, upkeep: 0,
    levels: [
      { level: 2, name: 'Townhouse', cost: { planks: 20, stone: 20, parts: 4 }, time: 45, housing: 4, req: 'bakery', happy: 1,
        desc: 'Two storeys and a slate roof: eight settlers, and townhouses make the colony happier.' },
    ],
    desc: 'A snug home for four settlers. Upgrades to a townhouse once bread and parts flow.' },
  { id: 'well', name: 'Well', tab: 'homes', size: [1, 1], cost: { stone: 15, wood: 5 }, time: 15, builders: 1, needs: null, req: null,
    workers: 0, produces: {}, consumes: {}, env: 'none', place: {}, upkeep: 0, serves: 30,
    desc: 'Fresh water. Each well keeps 30 settlers content and fills the bucket brigades when fire breaks out.' },
  { id: 'tavern', name: 'Tavern', tab: 'homes', size: [2, 2], cost: { wood: 40, stone: 30, planks: 10 }, time: 55, builders: 2, needs: null, req: null,
    workers: 2, produces: {}, consumes: { grain: 1 }, env: 'indoor', place: {}, upkeep: 0.5, serves: 40,
    levels: [{ level: 2, name: 'Alehouse', cost: { planks: 30, stone: 30, coin: 80 }, time: 60, serves: 40, desc: 'Serves forty more settlers.' }],
    desc: 'Songs, cider and gossip. Cheers up to 40 settlers; brews a little grain.' },
  { id: 'warehouse', name: 'Warehouse', tab: 'homes', size: [2, 2], cost: { wood: 40, stone: 20 }, time: 45, builders: 2, needs: null, req: null,
    workers: 0, produces: {}, consumes: {}, env: 'none', place: {}, storage: 200, upkeep: 0.3,
    levels: [{ level: 2, name: 'Great Warehouse', cost: { planks: 40, stone: 30, iron: 10 }, time: 60, storage: 300, desc: 'Iron-braced racks: 300 more of everything.' }],
    desc: 'Raises the storage cap of its island network by 200 for every good.' },

  // ---- Industry --------------------------------------------------------------
  { id: 'lumber', name: 'Lumber Camp', tab: 'industry', size: [2, 2], cost: { wood: 15 }, time: 30, builders: 2, needs: null, req: null,
    workers: 2, produces: { wood: 15 }, consumes: {}, env: 'outdoor', place: { near: { cell: 't', r: 2, min: 3 } }, upkeep: 0,
    levels: [{ level: 2, name: 'Sawpit Camp', cost: { planks: 20, iron: 5 }, time: 40, mul: 1.5, workers: 1, desc: '+50% wood with a third woodcutter.' }],
    desc: 'Woodcutters fell the nearby forest. Needs at least 3 forest cells within 2 tiles; full output with 6 or more.' },
  { id: 'quarry', name: 'Quarry', tab: 'industry', size: [2, 2], cost: { wood: 20, stone: 5 }, time: 35, builders: 2, needs: null, req: null,
    workers: 2, produces: { stone: 10 }, consumes: {}, env: 'outdoor', place: { on: 's', min: 2 }, upkeep: 0,
    levels: [{ level: 2, name: 'Deep Quarry', cost: { planks: 20, iron: 10 }, time: 45, mul: 1.5, workers: 1, desc: '+50% stone with a third cutter.' }],
    desc: 'Cuts blocks from a stone outcrop. Must sit on at least 2 outcrop cells.' },
  { id: 'sawmill', name: 'Sawmill', tab: 'industry', size: [2, 2], cost: { wood: 40, stone: 20 }, time: 50, builders: 2, needs: null, req: null,
    workers: 2, produces: { planks: 6 }, consumes: { wood: 10 }, env: 'indoor', place: {}, upkeep: 0.3,
    levels: [{ level: 2, name: 'Steam Sawmill', cost: { planks: 30, iron: 15, parts: 4 }, time: 60, mul: 1.6, workers: 1, desc: '+60% planks.' }],
    desc: 'Saws logs into planks: 10 wood into 6 planks a minute.' },
  { id: 'mine', name: 'Mine', tab: 'industry', size: [2, 2], cost: { wood: 40, planks: 20, stone: 20 }, time: 70, builders: 2, needs: null, req: null,
    workers: 3, produces: { ore: 12 }, consumes: {}, env: 'outdoor', place: { on: 'o', min: 2 }, upkeep: 0.5,
    levels: [{ level: 2, name: 'Deep Shaft', cost: { planks: 30, iron: 20, parts: 4 }, time: 70, mul: 1.5, workers: 1, desc: '+50% ore.' }],
    desc: 'Digs iron ore from a seam. Must sit on at least 2 ore cells.' },
  { id: 'coalpit', name: 'Coal Pit', tab: 'industry', size: [2, 2], cost: { wood: 30, planks: 10 }, time: 50, builders: 2, needs: null, req: null,
    workers: 2, produces: { coal: 7 }, consumes: {}, env: 'outdoor', place: { on: 'c', min: 2 }, upkeep: 0.3,
    levels: [{ level: 2, name: 'Coal Shaft', cost: { planks: 25, iron: 15 }, time: 60, mul: 1.5, workers: 1, desc: '+50% coal.' }],
    desc: 'Digs coal from a black seam. Must sit on at least 2 coal cells.' },
  { id: 'smelter', name: 'Smelter', tab: 'industry', size: [2, 2], cost: { stone: 60, planks: 20 }, time: 80, builders: 2, needs: 'bellows', req: 'quarry',
    workers: 2, produces: { iron: 5 }, consumes: { ore: 6, coal: 3 }, env: 'indoor', place: { vent: 'bonus' }, upkeep: 0.5,
    vent: { mul: 1.25, noCoal: true },
    levels: [{ level: 2, name: 'Blast Furnace', cost: { stone: 60, iron: 30, parts: 8 }, time: 90, mul: 1.6, workers: 1, desc: '+60% iron.' }],
    desc: 'Smelts 6 ore and 3 coal into 5 iron a minute. Built over a heat vent it needs no coal and runs 25% faster.' },
  { id: 'workshop', name: 'Workshop', tab: 'industry', size: [3, 2], cost: { planks: 40, stone: 40, iron: 10 }, time: 90, builders: 2, needs: 'bellows', req: 'smelter',
    workers: 3, produces: { parts: 2 }, consumes: { iron: 3, planks: 3 }, env: 'indoor', place: {}, upkeep: 0.6,
    levels: [{ level: 2, name: 'Brass Works', cost: { planks: 40, iron: 40, parts: 10 }, time: 100, mul: 1.6, workers: 1, desc: '+60% parts.' }],
    desc: 'Turns 3 iron and 3 planks into 2 brass parts a minute.' },
  { id: 'drill', name: 'Crystal Drill', tab: 'industry', size: [2, 2], cost: { planks: 40, iron: 40, parts: 10 }, time: 110, builders: 3, needs: 'crystallore', req: null,
    workers: 3, produces: { skystone: 3 }, consumes: {}, env: 'outdoor', place: { on: 'k', min: 2 }, upkeep: 0.8,
    levels: [{ level: 2, name: 'Resonance Drill', cost: { iron: 40, parts: 15, aether: 5 }, time: 120, mul: 1.5, workers: 1, desc: '+50% skystone.' }],
    desc: 'Drills skystone from a crystal seam. Must sit on at least 2 crystal cells.' },
  { id: 'refinery', name: 'Aether Refinery', tab: 'industry', size: [2, 2], cost: { stone: 60, iron: 60, parts: 20 }, time: 130, builders: 3, needs: 'levitation', req: 'drill',
    workers: 3, produces: { aether: 1.5 }, consumes: { skystone: 3, iron: 1 }, env: 'indoor', place: {}, upkeep: 1,
    levels: [{ level: 2, name: 'Aether Still', cost: { iron: 60, parts: 20, aether: 10 }, time: 140, mul: 1.5, workers: 1, desc: '+50% aether.' }],
    desc: 'Distils 3 skystone and 1 iron into 1.5 aether a minute.' },

  // ---- Farming ---------------------------------------------------------------
  { id: 'farm', name: 'Farm', tab: 'farming', size: [3, 3], cost: { wood: 25 }, time: 35, builders: 2, needs: null, req: null,
    workers: 2, produces: { grain: 12 }, consumes: {}, env: 'farm', place: { on: 'f', min: 5 }, upkeep: 0,
    levels: [{ level: 2, name: 'Orchard Farm', cost: { planks: 20, stone: 10 }, time: 40, mul: 1.5, workers: 1, desc: '+50% grain.' }],
    desc: 'Wheat fields on fertile soil (at least 5 of its 9 cells). Grows half as fast at night, a little faster in rain.' },
  { id: 'windmill', name: 'Windmill', tab: 'farming', size: [2, 2], cost: { wood: 40, stone: 20 }, time: 50, builders: 2, needs: null, req: null,
    workers: 1, produces: { flour: 8 }, consumes: { grain: 10 }, env: 'outdoor', place: {}, upkeep: 0.2, wind: true,
    levels: [{ level: 2, name: 'Tower Mill', cost: { planks: 25, stone: 20, parts: 2 }, time: 50, mul: 1.6, desc: '+60% flour.' }],
    desc: 'Grinds 10 grain into 8 flour a minute. Turns faster in a breeze.' },
  { id: 'bakery', name: 'Bakery', tab: 'farming', size: [2, 2], cost: { wood: 20, stone: 30, planks: 10 }, time: 50, builders: 2, needs: null, req: null,
    workers: 2, produces: { bread: 10 }, consumes: { flour: 8 }, env: 'indoor', place: {}, upkeep: 0.3,
    levels: [{ level: 2, name: 'Brick Ovens', cost: { planks: 20, stone: 30, iron: 10 }, time: 50, mul: 1.5, workers: 1, desc: '+50% bread.' }],
    desc: 'Bakes 8 flour into 10 bread a minute. Bread feeds more than grain and makes settlers happier.' },

  // ---- Airships ----------------------------------------------------------------
  { id: 'mooring', name: 'Mooring Mast', tab: 'airships', size: [2, 2], cost: { planks: 50, stone: 30, coin: 60 }, time: 75, builders: 2, needs: null, req: 'sawmill',
    workers: 1, produces: {}, consumes: {}, env: 'none', place: { edge: true }, upkeep: 0.5, immigration: 1.5, berths: 2,
    desc: 'Docks airships for trade and expeditions on the island rim, and brings newcomers faster.' },
  { id: 'cablestation', name: 'Cable Station', tab: 'airships', size: [2, 2], cost: { planks: 30, stone: 20, iron: 10, parts: 5 }, time: 80, builders: 2, needs: 'turbines', req: null,
    workers: 1, produces: {}, consumes: {}, env: 'none', place: { edge: true }, upkeep: 0.4,
    desc: 'Cable car terminal on the island rim. Two stations let a cable car span a wide gap (up to 20 tiles).' },
  { id: 'shipyard', name: 'Shipyard', tab: 'airships', size: [3, 3], cost: { planks: 80, iron: 40, parts: 10, coin: 120 }, time: 140, builders: 3, needs: 'cargoholds', req: 'mooring',
    workers: 3, produces: {}, consumes: {}, env: 'indoor', place: { edge: true }, upkeep: 1,
    desc: 'Builds and repairs airships: freighters, scouts and militia gunships.' },

  // ---- Civic -------------------------------------------------------------------
  { id: 'academy', name: 'Academy', tab: 'civic', size: [3, 2], cost: { wood: 40, stone: 40, planks: 20, coin: 40 }, time: 80, builders: 2, needs: null, req: 'sawmill',
    workers: 4, produces: { insight: 10 }, consumes: {}, env: 'none', place: {}, upkeep: 1,
    levels: [{ level: 2, name: 'Grand Academy', cost: { planks: 60, stone: 60, parts: 6, coin: 150 }, time: 100, mul: 1.5, workers: 2, desc: '+50% insight with six scholars.' }],
    desc: 'Four scholars make about 10 insight a minute for research.' },
  { id: 'observatory', name: 'Observatory', tab: 'civic', size: [2, 2], cost: { stone: 60, planks: 30, iron: 20, coin: 60 }, time: 100, builders: 2, needs: null, req: 'academy',
    workers: 1, produces: { insight: 2 }, consumes: {}, env: 'none', place: {}, upkeep: 0.6, max: 2,
    desc: 'Watches the sky: earlier storm and raid warnings, wider scouting range, a little insight.' },
  { id: 'market', name: 'Market', tab: 'civic', size: [2, 2], cost: { wood: 40, planks: 30, stone: 20, coin: 30 }, time: 70, builders: 2, needs: null, req: 'sawmill',
    workers: 2, produces: { coin: 6 }, consumes: {}, env: 'outdoor', place: {}, upkeep: 0, serves: 60, coinPerSettler: 0.05,
    desc: 'Stalls and haggling: coin from trade (6 a minute plus a little per happy settler) and a cheerier colony.' },

  // ---- Defence ---------------------------------------------------------------
  { id: 'harpoon', name: 'Harpoon Battery', tab: 'defence', size: [1, 1], cost: { planks: 30, iron: 12, parts: 4 }, time: 50, builders: 2, needs: 'harpoons', req: null,
    workers: 1, produces: {}, consumes: {}, env: 'none', place: {}, upkeep: 1,
    levels: [{ level: 2, name: 'Twin Harpoons', cost: { iron: 30, parts: 10 }, time: 60, desc: 'Longer reach, harder hits, faster reload.' }],
    desc: 'Fires barbed harpoons at pirate ships in range.' },
  { id: 'rod', name: 'Lightning Rod', tab: 'defence', size: [1, 1], cost: { iron: 6, stone: 20 }, time: 25, builders: 1, needs: 'rods', req: null,
    workers: 0, produces: {}, consumes: {}, env: 'none', place: {}, upkeep: 0.2,
    desc: 'Draws lightning away from nearby buildings and charges the lash.' },
  { id: 'shieldgen', name: 'Storm Shield', tab: 'defence', size: [2, 2], cost: { iron: 60, parts: 30, aether: 10 }, time: 140, builders: 3, needs: 'shields', req: null,
    workers: 2, produces: {}, consumes: {}, env: 'none', place: {}, upkeep: 2,
    desc: 'Raises an aether dome over its island against lightning and bombs.' },
  { id: 'bastion', name: 'Flak Bastion', tab: 'defence', size: [2, 2], cost: { stone: 80, iron: 80, parts: 40, coin: 100 }, time: 170, builders: 3, needs: 'bastion', req: null,
    workers: 2, produces: {}, consumes: {}, env: 'none', place: {}, upkeep: 2,
    desc: 'Heavy flak guns with long range and splash damage.' },

  // ---- Wonder ------------------------------------------------------------------
  // The foundation is built normally; then five stages (b.level 0..5) are
  // started with upgrade(id) and run by PROGRESSION (goals.forgeUpgrade,
  // SKYFORGE_STAGES in content/goals.js). `workers` here are forgewrights who
  // speed the stages (b.eff = workers / want while a stage runs).
  { id: 'skyforge', name: 'The Skyforge', tab: 'wonder', size: [3, 3], cost: { stone: 200, planks: 150, iron: 80 }, time: 240, builders: 6, needs: 'stormtaming', req: null,
    workers: 8, produces: {}, consumes: {}, env: 'none', place: { on: 'x', min: 9, exact: true }, upkeep: 0, unique: true, hp: 2000,
    supply: true,
    desc: 'The ancient forge on the Glimmerreach ruin. Build its foundation, then raise it through five great stages to light it again. Supply convoys bring its materials from your home islands.' },
];

// Links between islands. Cost per link = base + perTile x gap (gap in tiles
// between the nearest rim cells of the two islands), paid from the network of
// the first island (or the second if the first cannot pay).
export const LINKS = [
  { id: 'bridge', name: 'Rope Bridge', maxGap: 6.5, maxAlt: 3, needs: null, needStation: false,
    cost: { wood: 20, stone: 10 }, perTile: { wood: 6, stone: 4 }, time: 40, perTileTime: 8, builders: 2, hp: 100,
    desc: 'Plank-and-rope bridge across a short gap (up to 6 tiles). Joins the two islands into one network with shared storage.' },
  { id: 'cable', name: 'Cable Car', maxGap: 20, maxAlt: 8, needs: 'turbines', needStation: true,
    cost: { planks: 40, iron: 15, parts: 8 }, perTile: { iron: 0.5, planks: 1 }, time: 100, perTileTime: 2, builders: 2, hp: 100,
    desc: 'Steam-hauled gondolas across a wide gap (up to 20 tiles). Needs a Cable Station on both islands and Steam Turbines.' },
];

export const BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
export const LINK_BY_ID = Object.fromEntries(LINKS.map((l) => [l.id, l]));
