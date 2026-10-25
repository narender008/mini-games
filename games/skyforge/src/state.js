// createGame(opts) -> G, the whole game state. Everything on G is JSON-safe
// except G.bus, the rng functions (their .state is saved) and G.tmp (derived,
// rebuilt by each module's hydrate()). See /mnt/project-files/skyforge/build-brief.md.
import { createBus } from './core/events.js';
import { rng, hashSeed } from './core/rng.js';
import { VERSION, CFG } from './config.js';

export function makeRng(seed) {
  return {
    world: rng(hashSeed(seed, 'world')),
    econ: rng(hashSeed(seed, 'econ')),
    events: rng(hashSeed(seed, 'events')),
    combat: rng(hashSeed(seed, 'combat')),
  };
}

export function createGame({ seed = 1, difficulty = 'standard', name = 'Hearthrock', bus = null } = {}) {
  return {
    v: VERSION, seed, t: 0, day: 1, tod: 0.3, speed: 1, scene: 'colony',
    difficulty,
    colony: { name, founded: 0, pop: 0, popCap: 0, workers: 0, idle: 0, happiness: 0.6, housing: {}, growth: 0 },
    islands: [], buildings: [], links: [],
    pools: {},
    ships: [], routes: [], ports: [], contracts: [], expeditions: [],
    research: { current: null, progress: 0, done: [], queue: [] },
    weather: { kind: 'clear', power: 0, t: 0, until: 0, wind: { x: 1, y: 0 }, forecast: [] },
    raid: null, pirates: [], shots: [],
    defend: { volley: { cd: 0 }, lash: { charge: 0, cd: 0 }, shield: { on: false, t: 0, island: null, cd: 0 }, militia: { cd: 0 } },
    goals: { chapter: 1, steps: {}, done: [], flags: {}, won: false, wonAt: null, achievements: [] },
    event: null,
    stats: { samples: [], totals: {} },
    log: [],
    nextId: 1,
    cfg: CFG,
    bus: bus || createBus(),
    rng: makeRng(seed),
    tmp: {},
  };
}

export const newId = (G) => G.nextId++;

// Strip a G down to its saveable data (SAVE uses this; rng saved as states).
export function snapshot(G) {
  const { bus, rng: r, tmp, cfg, ...rest } = G;
  const out = JSON.parse(JSON.stringify(rest));
  out.rngState = Object.fromEntries(Object.entries(r).map(([k, f]) => [k, f.state]));
  return out;
}

// Rebuild a live G from snapshot data (modules' hydrate() is called by sim/index.js).
export function restore(data, bus = null) {
  const G = createGame({ seed: data.seed, difficulty: data.difficulty, bus });
  const { rngState, ...rest } = data;
  Object.assign(G, rest);
  if (rngState) for (const k of Object.keys(G.rng)) if (rngState[k] != null) G.rng[k].state = rngState[k] >>> 0;
  G.tmp = {};
  return G;
}
