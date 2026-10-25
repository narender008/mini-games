// Chapters of goals, the Skyforge stages. Data only. Owner: PROGRESSION.
// Logic in src/sim/goals.js. Each step has a `check` the sim tests and a `hint`
// the tutorial shows: hint.type = a building to place (the UI points at the first
// legal spot on hint.island, resolved at runtime into G.tmp.goalSteps[].hint.u/v),
// hint.open = a screen to open, hint.tech = a research id, hint.target = a chart island.
// target = minutes of game time (1x) by which an attentive player finishes the chapter.
// check kinds: built {type, n}, pop n, popCap n, owned n, island id, link {kind, n},
// researched n, tech id, contracts {port, n}, ships {kind, n}, trips n, flag id,
// stage n, stock {res: n} (any network), routes n.
export const CHAPTERS = [
  {
    id: 'ch1', n: 1, name: 'First Landing', target: 15, icon: 'cottage',
    desc: 'The settlers step off the last skiff onto Hearthrock. Timber, stone and roofs before the first night.',
    steps: [
      { id: 'c1_lumber', text: 'Build a Lumber Camp by the forest', check: { built: { type: 'lumber', n: 1 } }, hint: { text: 'Lumber camps fell the trees around them. Place one on the forest edge.', type: 'lumber', island: 'hearthrock' } },
      { id: 'c1_quarry', text: 'Build a Quarry on the stone outcrop', check: { built: { type: 'quarry', n: 1 } }, hint: { text: 'Rich stone outcrop: a quarry here gives the stone every later building needs.', type: 'quarry', island: 'hearthrock' } },
      { id: 'c1_sawmill', text: 'Build a Sawmill to cut planks', check: { built: { type: 'sawmill', n: 1 } }, hint: { text: 'Logs into planks. Put the sawmill near the lumber camp to keep the carts short.', type: 'sawmill', island: 'hearthrock' } },
      { id: 'c1_house', text: 'Build cottages for 8 settlers', check: { popCap: 8 }, hint: { text: 'Every cottage houses a family. Homes near the town hall fill first.', type: 'cottage', island: 'hearthrock' } },
      { id: 'c1_pop', text: 'Welcome 8 settlers', check: { pop: 8 }, hint: { text: 'Settlers arrive when there are free beds and food in the stores.' } },
    ],
    reward: { coin: 120, planks: 20, stone: 20 },
  },
  {
    id: 'ch2', n: 2, name: 'Bread and Bridges', target: 35, icon: 'bakery',
    desc: 'Grain, flour and bread to feed a town, and a bridge to the fertile islet next door.',
    steps: [
      { id: 'c2_farm', text: 'Plant a Farm on fertile soil', check: { built: { type: 'farm', n: 1 } }, hint: { text: 'Farms need dark fertile soil. Millbrook has the best fields.', type: 'farm', island: 'hearthrock' } },
      { id: 'c2_windmill', text: 'Build a Windmill', check: { built: { type: 'windmill', n: 1 } }, hint: { text: 'The windmill grinds grain into flour.', type: 'windmill', island: 'hearthrock' } },
      { id: 'c2_bakery', text: 'Build a Bakery', check: { built: { type: 'bakery', n: 1 } }, hint: { text: 'Bread keeps settlers happy and lets cottages grow into townhouses.', type: 'bakery', island: 'hearthrock' } },
      { id: 'c2_claim', text: 'Claim a neighbouring islet', check: { owned: 2 }, hint: { text: 'Open the Sky Chart and claim Millbrook or Orespur.', open: 'chart', target: 'millbrook' } },
      { id: 'c2_bridge', text: 'Bridge it to Hearthrock', check: { link: { kind: 'bridge', n: 1 } }, hint: { text: 'Bridges join islands into one network that shares its stores.', type: 'bridge', island: 'hearthrock' } },
      { id: 'c2_pop', text: 'Grow to 30 settlers', check: { pop: 30 }, hint: { text: 'More cottages, more bread. A tavern helps them stay.' } },
    ],
    reward: { coin: 200, planks: 30, bread: 20 },
  },
  {
    id: 'ch3', n: 3, name: 'Iron and Brass', target: 65, icon: 'smelter',
    desc: 'Ore from Orespur, coal from the pits and the first fires of industry. The scholars open the Academy.',
    steps: [
      { id: 'c3_academy', text: 'Open an Academy', check: { built: { type: 'academy', n: 1 } }, hint: { text: 'Scholars at the academy turn curiosity into insight for research.', type: 'academy', island: 'hearthrock' } },
      { id: 'c3_research', text: 'Research the Bellows Forge', check: { tech: 'bellows' }, hint: { text: 'Open Research and begin the Bellows Forge.', open: 'research', tech: 'bellows' } },
      { id: 'c3_mine', text: 'Sink a Mine into iron ore', check: { built: { type: 'mine', n: 1 } }, hint: { text: 'Orespur is seamed with ore: sink a mine on the dark seams.', unowned: 'Orespur is seamed with ore. Claim it from the Sky Chart and bridge it to Hearthrock, then sink a mine.', type: 'mine', island: 'orespur' } },
      { id: 'c3_coal', text: 'Dig a Coal Pit', check: { built: { type: 'coalpit', n: 1 } }, hint: { text: 'Coal seams show black in the rock.', type: 'coalpit', island: 'orespur' } },
      { id: 'c3_smelter', text: 'Fire up a Smelter', check: { built: { type: 'smelter', n: 1 } }, hint: { text: 'Ore and coal into iron. On a heat vent it needs no coal at all.', type: 'smelter', island: 'hearthrock' } },
      { id: 'c3_workshop', text: 'Open a Workshop', check: { built: { type: 'workshop', n: 1 } }, hint: { text: 'Iron and planks into brass parts, the backbone of everything airborne.', type: 'workshop', island: 'hearthrock' } },
      { id: 'c3_contract', text: 'Fulfil a contract for Port Halcyon', check: { contracts: { port: 'porthalcyon', n: 1 } }, hint: { text: 'Open the Fleet ledger and accept Port Halcyon\'s contract, then press Quick Sell: a courier carries the goods. (Trade routes need Cargo Holds research.)', open: 'fleet' } },
    ],
    reward: { coin: 300, iron: 15, insight: 40 },
  },
  {
    id: 'ch4', n: 4, name: 'Trade Winds', target: 95, icon: 'mooring',
    desc: 'Moorings on the cliff edge, cargo ships on the wind and cable cars humming across the gaps.',
    steps: [
      { id: 'c4_mooring', text: 'Build a Mooring on an island edge', check: { built: { type: 'mooring', n: 1 } }, hint: { text: 'Moorings sit on the cliff edge. Airships dock, trade and carry settlers here.', type: 'mooring', island: 'hearthrock' } },
      { id: 'c4_ship', text: 'Build a cargo ship', check: { ships: { kind: 'cargo', n: 1 } }, hint: { text: 'Research Cargo Holds, then build a cargo ship at the mooring.', open: 'research', tech: 'cargoholds' } },
      { id: 'c4_route', text: 'Run a trade route to a foreign port', check: { trips: 1 }, hint: { text: 'In the Fleet ledger (routes need Cargo Holds), give your cargo ship a route: load at home, sell at a port, buy on the way back.', open: 'fleet' } },
      { id: 'c4_cable', text: 'String a cable car to a far islet', check: { link: { kind: 'cable', n: 1 } }, hint: { text: 'Steam Turbines power cable stations. Put one on each island\'s edge, then link them.', tech: 'turbines', type: 'cablestation', island: 'hearthrock' } },
      { id: 'c4_pop', text: 'Grow to 80 settlers', check: { pop: 80 }, hint: { text: 'Townhouses hold more families: keep bread and parts flowing.' } },
    ],
    reward: { coin: 500, parts: 20, insight: 80 },
  },
  {
    id: 'ch5', n: 5, name: 'Storm Season', target: 130, icon: 'storm',
    desc: 'The sky turns. Lightning walks the islands and the Crimson Gale comes looking for plunder.',
    steps: [
      { id: 'c5_obs', text: 'Build an Observatory to watch the weather', check: { built: { type: 'observatory', n: 1 } }, hint: { text: 'Astronomers see storms and red sails coming from far off. Pinecrest\'s peak is perfect.', type: 'observatory', island: 'pinecrest' } },
      { id: 'c5_harpoon', text: 'Mount 2 Harpoon Batteries', check: { built: { type: 'harpoon', n: 2 } }, hint: { text: 'Batteries guard everything in their ring. Cover the moorings and the granaries first.', type: 'harpoon', island: 'hearthrock', tech: 'harpoons' } },
      { id: 'c5_rod', text: 'Raise 2 Lightning Rods', check: { built: { type: 'rod', n: 2 } }, hint: { text: 'Rods draw lightning away from roofs and store a charge for the lash.', type: 'rod', island: 'hearthrock', tech: 'rods' } },
      { id: 'c5_storm', text: 'Weather a storm', check: { flag: 'stormSurvived' }, hint: { text: 'Keep wells close to wooden buildings and rods on every island.' } },
      { id: 'c5_raid', text: 'Drive off a pirate raid', check: { flag: 'raidSurvived' }, hint: { text: 'When the warning sounds use Volley (Q) and Lash (W) on the raiders.' } },
      { id: 'c5_ember', text: 'Claim Emberrock', check: { island: 'emberrock' }, hint: { text: 'Scout Emberrock from the Sky Chart, then send a claim expedition with settlers.', open: 'chart', target: 'emberrock' } },
    ],
    reward: { coin: 700, iron: 40, skystone: 10 },
  },
  {
    id: 'ch6', n: 6, name: 'Skystone', target: 160, icon: 'drill',
    desc: 'Crystal into skystone, skystone into aether. Then through the Tempest Wall to the ruin on Glimmerreach.',
    steps: [
      { id: 'c6_drill', text: 'Drill crystal into skystone', check: { built: { type: 'drill', n: 1 } }, hint: { text: 'Crystal Lore teaches the drill. Kilnshelf glitters with crystal.', type: 'drill', island: 'kilnshelf', tech: 'crystallore' } },
      { id: 'c6_refinery', text: 'Build an Aether Refinery', check: { built: { type: 'refinery', n: 1 } }, hint: { text: 'Skystone and iron distil into aether.', type: 'refinery', island: 'kilnshelf', tech: 'levitation' } },
      { id: 'c6_aether', text: 'Store 20 aether', check: { stock: { aether: 20 } }, hint: { text: 'Keep the refinery fed with skystone and iron.' } },
      { id: 'c6_taming', text: 'Research Storm Taming', check: { tech: 'stormtaming' }, hint: { text: 'Storm Taming opens the Tempest Wall.', open: 'research', tech: 'stormtaming' } },
      { id: 'c6_glimmer', text: 'Claim Glimmerreach', check: { island: 'glimmerreach' }, hint: { text: 'The Skyforge ruin waits beyond the storm. Send a claim expedition.', open: 'chart', target: 'glimmerreach' } },
    ],
    reward: { coin: 900, aether: 10, parts: 30 },
  },
  {
    id: 'ch7', n: 7, name: 'The Skyforge', target: 185, icon: 'skyforge',
    desc: 'Raise the Skyforge on its ancient ruin, stage by stage, and hold it against the Crimson Gale\'s Dreadnought.',
    steps: [
      { id: 'c7_found', text: 'Lay the Skyforge foundations', check: { built: { type: 'skyforge', n: 1 } }, hint: { text: 'Build the Skyforge on the ruin at Glimmerreach.', type: 'skyforge', island: 'glimmerreach' } },
      { id: 'c7_s1', text: 'Stage 1: the Foundation Ring', check: { stage: 1 }, hint: { text: 'Select the Skyforge and press Upgrade to raise each stage.', type: 'skyforge', island: 'glimmerreach' } },
      { id: 'c7_s2', text: 'Stage 2: the Bellows Hall', check: { stage: 2 }, hint: { text: 'Each stage needs its goods in Glimmerreach\'s stores: link it or carry them by ship.' } },
      { id: 'c7_s3', text: 'Stage 3: the Skystone Crucible', check: { stage: 3 }, hint: { text: 'The Sky Foundry is needed to cast the crucible.', tech: 'foundry' } },
      { id: 'c7_s4', text: 'Stage 4: the Aether Lens', check: { stage: 4 }, hint: { text: 'The Aether Beacon focuses the lens.', tech: 'beacon' } },
      { id: 'c7_s5', text: 'Stage 5: light the Skyforge', check: { stage: 5 }, hint: { text: 'Lighting the forge will draw the Crimson Gale\'s Dreadnought. Ready every battery.' } },
      { id: 'c7_dread', text: 'Bring down the Dreadnought', check: { flag: 'dreadnoughtDown' }, hint: { text: 'Bastions, harpoons, lash and militia: everything you have.' } },
    ],
    reward: { coin: 2000 },
  },
];

// The Skyforge's five stages (the building itself is ECONOMY's; stage 0 = built).
// Paid from the Skyforge island's pool; time in game seconds at full staff.
export const SKYFORGE_STAGES = [
  { n: 1, name: 'Foundation Ring', cost: { stone: 300, planks: 180, iron: 90, coin: 600 }, time: 270, needs: null, desc: 'A ring of dressed stone and iron bands around the ancient hearth.' },
  { n: 2, name: 'Bellows Hall', cost: { iron: 180, parts: 90, coal: 120, coin: 1200 }, time: 330, needs: null, desc: 'Great bellows of oiled hide that breathe for the whole forge.' },
  { n: 3, name: 'Skystone Crucible', cost: { skystone: 120, iron: 150, parts: 90, coin: 1800 }, time: 390, needs: 'foundry', desc: 'A crucible cast from skystone, the only vessel that can hold aether fire.' },
  { n: 4, name: 'Aether Lens', cost: { aether: 75, skystone: 90, parts: 120, coin: 2400 }, time: 450, needs: 'beacon', desc: 'A lens of pure aether that gathers starlight into the crucible.' },
  { n: 5, name: 'Skyforge Alight', cost: { aether: 110, parts: 150, iron: 150, coin: 3000 }, time: 510, needs: 'beacon', desc: 'The forge breathes, the lens turns and the islands rise. The Crimson Gale will see it from the edge of the sky.' },
];
