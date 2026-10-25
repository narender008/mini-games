// Skyforge Tycoon tuning. One section per area; each owner edits only its own
// section. Everything here is plain data so tests can read it via content().
export const VERSION = 1;          // save schema version (SAVE owns migrations)
export const DT = 1 / 30;          // fixed sim step, game seconds
export const DAY = 300;            // game seconds per in-game day
export const SPEEDS = [0, 1, 2, 3];
export const T = 48;               // px per tile at zoom 1 (see render/camera.js)

export const CFG = {
  // ECONOMY section
  // (islands, buildings, workers, production, food, happiness, population,
  //  taxes, storage, links). Building numbers live in content/buildings.js.
  //  Rates per game minute, times in game seconds.
  economy: {
    start: {
      pop: 6,                                   // founders (townhall houses 2, the start cottage 4)
      res: { wood: 60, stone: 20, planks: 10, grain: 60 },
      coin: 120, insight: 0,
    },
    allocEvery: 1,             // s between worker re-assignments
    food: { perSettler: 0.25, breadShare: 0.75, lowMinutes: 6 },  // food units/min each; eat up to this share as bread; "low" below this much stock
    // happiness 0..1: base plus factors, eased toward the target with tau seconds
    happy: {
      base: 0.5, tau: 30, min: 0.05,
      bread: 0.14, variety: 0.04, hungry: -0.45,
      tavern: 0.1, well: 0.06, market: 0.04, townhouse: 0.06,
      damaged: -0.03, damagedMax: -0.2, storm: -0.05, raid: -0.08, debt: -0.12, crowded: -0.2,
    },
    growth: {
      perMin: 1.6,             // newcomers per minute from the townhall at good happiness
      minHappy: 0.35,          // nobody comes below this
      leaveHappy: 0.22,        // settlers drift away below this (or when starving)
      leaveEvery: 40,          // s per leaver while unhappy
      minPop: 4,               // the colony is never emptied
    },
    tax: { perSettler: 0.45, happyMin: 0.4 },   // coin/min per settler x (happyMin + happiness)
    env: {
      farm:    { night: 0.5, storm: 0.6, rain: 1.1, fog: 1 },
      outdoor: { night: 0.75, storm: 0.5, rain: 0.95, fog: 0.9 },
      indoor:  { night: 0.9, storm: 0.9, rain: 1, fog: 1 },
      none:    { night: 1, storm: 1, rain: 1, fog: 1 },
      build:   { night: 0.8, storm: 0.5, rain: 0.9, fog: 0.95 },   // construction
    },
    night: [0.85, 0.2],        // tod range counted as night (wraps midnight)
    happyEff: [0.85, 1.1],     // production x this at happiness 0 .. 1
    buffer: 1.5,               // input buffer, minutes of consumption
    reserve: 0.1, reserveMax: 40,  // chains leave this share of the cap (at most reserveMax) of wood, planks, stone, iron, parts and skystone for building and research
    builderShare: 0.35,        // up to this share of settlers go to construction first
    damagedAt: 0.3,            // hp fraction below which a building stops (stall 'damaged')
    demolishRefund: 0.5,
    repair: { ruin: 0.5, damage: 0.15, heal: 9 },   // cost share of build cost; hp/s per full crew
    lumberForest: [6, 0.8, 1.25],  // forest cells for 100%, min and max multiplier
    gainEvery: 6,              // s between res:gain labels per building
    notifyEvery: 90,           // s between repeats of the same warning
    edgeOpen: 3,               // a rim cell faces open sky: no other island cell within this many tiles outward
    // research bonuses applied by economy when research.bonus() is missing (fractions)
    bonusFallback: {
      bellows: { 'prod:iron': 0.25 }, assembly: { 'prod:parts': 0.3 }, automatons: { staff: 0.25 },
      foundry: { 'prod:iron': 0.4, 'prod:parts': 0.2 }, turbines: { 'prod:planks': 0.25, 'prod:flour': 0.25 },
      drift: { 'prod:skystone': 0.3 }, beacon: { 'prod:aether': 0.3 }, charters: { growth: 0.5 },
    },
  },
  // THREATS section
  // (weather, raids, combat, defence; pirate stats are in content/pirates.js,
  //  weather kinds in content/weather.js). Units: tiles, game seconds.
  threats: {
    // per difficulty: first chapter with storms / raids, storm chance and raid
    // interval/strength multipliers; breezy never destroys buildings or links
    difficulty: {
      breezy:   { stormCh: 4, raidCh: 5, storm: 0.6, interval: 1.6, strength: 0.6, ruin: false, lightning: 0.6 },
      standard: { stormCh: 3, raidCh: 4, storm: 1, interval: 1, strength: 1, ruin: true, lightning: 1 },
      squall:   { stormCh: 2, raidCh: 3, storm: 1.5, interval: 0.7, strength: 1.35, ruin: true, lightning: 1.3 },
    },
    weather: {
      stormWeight: [0, 0, 0.5, 0.8, 1.1, 1.5, 1.7, 1.9],  // by chapter (index = chapter)
      planAhead: 900,          // schedule this far ahead (s)
      horizon: 150,            // forecast reach without an observatory (s)
      horizonPerObs: 300,      // more per observatory (max 2 count)
      galeAt: 0.5,             // storm power from which cable cars stop and ships slow
      strike: [13, 4.5],       // seconds between lightning strikes at power 0 and 1
      strikeDmg: [24, 55],     // damage at power 0..1
      strikeFire: [0.3, 0.7],  // chance a strike starts a fire
      rodRange: 4.5, rodCharge: 0.3, rodTrickle: 0.004,
      storyStorm: 300,         // a storm within this long of chapter 5 starting
    },
    raids: {
      firstAfter: [300, 480],  // first raid this long after raids become possible
      interval: [720, 1000],   // between raids at standard
      chapterFactor: 0.9,      // interval x this per chapter past 5
      storyRaid: 360,          // a raid within this long of chapter 5 starting
      warn: 40, warnPerObs: 30, warnFog: 0.6, finalWarn: 90,
      attackMax: 170,          // then everyone retreats
      finalMax: 600,           // the Dreadnought withdraws to refit after this long (comes back later)
      spawnR: 16,              // spawn this far beyond the colony's edge
      exitR: 24,
      points: [2, 3],          // budget = a + b * strength
      valueRef: 260,           // colony value at which strength x1.5
    },
    combat: {
      gravity: 9,              // tiles/s^2 for bombs and shells
      hpBySize: [140, 220, 360], // default max hp for 1x1, 2x2, 3x3+ buildings
      hpByType: { harpoon: 200, bastion: 340, rod: 120, shieldgen: 260, skyforge: 900, townhall: 400, warehouse: 240 },
      fireGrow: 0.035,         // per s at fire 1 (x wind, x weather)
      fireBurn: 4,           // hp/s at fire 1
      fireSpread: 0.05,        // chance per s at fire 1 to light a neighbour
      spreadR: 2.4,
      fireOutBase: 0.01, wellOut: 0.025, wellR: 6, wellMax: 3,
      brigadeOut: 0.0045, brigadeMax: 6, brigadePerWell: 2, rainOut: 0.04,
      stockBurn: 1.6,          // goods/s a burning storehouse loses at fire 1
      heal: 0.6,               // hp/s free mending of dents when calm (paid repair: ECONOMY)
    },
    defence: {
      // battery stats; level 2 multiplies range/dmg by lvl2 and reload by 1/lvl2
      harpoon: { range: 11, reload: 2.6, dmg: 22, speed: 20, spread: 0.06 },
      bastion: { range: 15, reload: 4.5, dmg: 34, speed: 16, splash: 2.2, flak: true, spread: 0.04 },
      lvl2: 1.25,
      research: { bastion: { range: 1.15 }, automatons: { reload: 0.85 }, foundry: { dmg: 1.15 } },
      volley: { rangeMul: 1.6, dmgMul: 1.25 },
      lash: { dmg: 130, jumps: 4, chainR: 7, falloff: 0.75 },
      militia: { hp: 140, speed: 2.8, turn: 1.8, range: 6, reload: 2.4, dmg: 16, life: 120 },
      shieldMargin: 1.5,
    },
    heights: {
      windmill: 2.6, observatory: 2.5, rod: 3.4, harpoon: 1.2, bastion: 1.6, shieldgen: 2, townhall: 2, cottage: 1.2,
      tavern: 1.4, warehouse: 1.4, smelter: 2, refinery: 2.2, drill: 2, skyforge: 3.2, academy: 1.8, mooring: 2.2,
      shipyard: 1.8, market: 1.2, well: 0.6, farm: 0.3, quarry: 0.6, mine: 1, coalpit: 0.8, sawmill: 1.4,
      workshop: 1.4, bakery: 1.3, cablestation: 1.8, lumber: 1,
    },
  },
  // PROGRESSION section (research, fleet, trade, chart, goals). Units: game seconds, tiles.
  progression: {
    research: {
      costScale: 1,          // multiplies every insight cost (tune to ECONOMY's insight rate)
      timeScale: 1,          // multiplies every research time
      refScholars: 2,        // RESEARCH[].time is quoted for this many scholars
      scholarExp: 0.75,      // speed = (scholars / ref) ^ exp; no scholars, no progress
      minSpeed: 0.35,        // floor once at least one scholar works
      queueMax: 4,
      refund: 1,             // fraction of costs returned on cancel
    },
    fleet: {
      cruise: 3.2,           // tiles above the higher end's altitude in flight
      climb: 1.4,            // tiles per second up/down
      turn: 2.2,             // rad per second
      berths: { mooring: 3, shipyard: 4 },
      dockTime: 6,           // seconds to load or unload
      repairPerMin: 12,      // hull points per minute while docked
      stormSlow: 0.5,        // speed x (1 - stormSlow * power) in a storm
      fogSlow: 0.85, rainSlow: 0.93,
      ambushPerMin: 0.06,    // chance per minute inside pirate waters without escort
      ambushDmg: [0.25, 0.5],
      ambushLoot: 0.35,
      lostCrewPop: 0,
    },
    trade: {
      quickSell: 0.6,        // fraction of the best port price at the town hall
      buyMarkup: 1.0,        // multiplier on the port's sells price when you buy
      saturation: 0.004,     // price multiplier lost per unit sold to a port
      recover: 0.12,         // fraction of the gap back to base per game minute
      drift: 0.04,           // daily random walk of each port price
      floor: 0.45, ceil: 1.9,
      stockMax: 160, stockPerMin: 4,
      repPerSale: 0.012,     // reputation per coin earned at a port
      repTiers: [0, 25, 60, 90],   // standing tiers; price bonus per tier below
      repBonus: 0.05,
      contractEvery: 1.6,    // days between contract offers per port
      contractDays: [3, 6],  // days to deliver
      contractMax: 2,        // offers + active per port
      contractRep: 12, contractFailRep: -8,
      contractPremium: 1.6,  // reward vs plain sale value
    },
    chart: {
      scoutTime: 20,         // seconds on site to scout
      claimTime: 30,         // seconds on site to land settlers
      directClaimRange: 22,  // tiles: claim() needs no expedition within this of an owned island
      driftSpeed: 0.35,      // tiles per second
      driftCost: { skystone: 2 },   // per tile moved
      driftMax: 90,          // max tiles per order
      minGap: 2,             // tiles between islands after a drift
      observatoryRange: 80,  // discovers islands within this of the colony
      scoutReveal: 45,       // scouting an island reveals its neighbours within this
      roostDefence: 3,       // militia ships needed (bastion research counts as one more)
      escortRisk: 0.45,      // chance of an expedition into pirate waters going wrong without escort
    },
    goals: {
      eventEvery: [1.4, 2.6],  // days between event cards
      eventFirstDay: 3,
      storyStorm: 1.5,       // days into chapter 5 before a story storm is called
      storyRaid: 2.0,        // days into chapter 5 before a story raid is called
      finalRetry: 1,         // days before the Dreadnought returns if it escapes
      forgeMinRate: 0.25,    // stage work rate with no staff
      hintEvery: 1,          // seconds between goal checks
    },
  },
  // SAVE section
  save: {
    autosaveMs: 30000,               // real ms between autosaves in the colony (main.js loop)
    profiles: 3,
    // offline catch-up (src/save/catchup.js): away real seconds beyond minAway,
    // capped at maxAway, run at `rate` game seconds per real second away, and
    // never more than budgetMs of real work on load. Off under ?debug unless ?away.
    catchup: { minAway: 120, maxAway: 7200, rate: 0.25, budgetMs: 1200 },
  },
  // RENDERER section
  render: {
    governorLowFps: 48, minScale: 0.65,          // frame governor (quality 'auto')
    camEase: 7, worldMargin: 8,                  // camera ease rate (1/s) and clamp margin (tiles)
    cacheBuckets: [0.5, 0.71, 1, 1.41, 2, 2.83], // island/sprite cache scales (zoom x dpr, snapped)
    walkersPerPop: 0.12, maxWalkers: 70, nightWalkers: 0.35,
    labelLife: 1.8, labelPool: 3, shakeMax: 14,
  },
  // INPUT section (src/input/): gestures, camera feel, picking
  input: {
    dragMouse: 5, dragTouch: 10,       // px before a press becomes a pan
    tapMs: 650,                        // a touch held longer is not a tap
    inertiaDecay: 4.5, inertiaMin: 20, // flick glide: 1/s decay, px/s cutoff
    keyPan: 720, keyZoom: 1.25,        // px/s for WASD / arrows, factor per + / -
    wheel: 0.0016,                     // zoom per wheel pixel (exp)
    edge: 14, edgeSpeed: 640,          // edge pan (settings.edgePan): margin px, px/s
    clampPad: 8,                       // tiles of sky allowed beyond the islands
    homeZoom: 1,                       // H glides home at this zoom
    cliffDepth: 4,                     // tiles of island underside that block picks behind it
    // stay in build mode after placing these (shift-click repeats anything)
    repeat: ['cottage', 'well', 'rod', 'farm', 'lumber', 'quarry', 'harpoon'],
    // pick box heights in tiles where content gives none
    pickHeight: { townhall: 2.6, windmill: 3.2, observatory: 2.8, rod: 3, harpoon: 1.6, bastion: 1.8, shieldgen: 2.4, smelter: 2.6, refinery: 2.4, mooring: 2.2, shipyard: 2.4, cablestation: 2.2, academy: 2.4, skyforge: 4, drill: 2.4, coalpit: 1.2, quarry: 1.2, farm: 0.5, well: 1.1 },
    // airship / pirate tap radius in tiles
    pickRadius: { default: 1.5, corsair: 1.2, raider: 1.6, frigate: 2.2, dreadnought: 4 },
  },
  // AUDIO section (src/audio/): default mix (settings override; all 0..1)
  audio: {
    defaults: { master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.7 },
  },
};
