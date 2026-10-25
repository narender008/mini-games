// PANELS dev harness: a mock app + G shaped per the build brief, so the
// research, chart, fleet and stats panels can be built and screenshotted
// before (or without) the real sims. Open dev/panels.html?panel=research|chart|fleet|stats|icons.
import { createBus } from '../src/core/events.js';
import { MOCK } from '../src/ui/panelkit.js';
import * as C from '../src/content/index.js';

const pick = (a, b) => (a && a.length ? a : b);
export function mockApp() {
  const content = {
    ...C,
    RESOURCES: pick(C.RESOURCES, MOCK.RESOURCES), RESEARCH: pick(C.RESEARCH, MOCK.RESEARCH), BRANCHES: pick(C.BRANCHES, MOCK.BRANCHES),
    ISLANDS: pick(C.ISLANDS, MOCK.ISLANDS), PORTS: pick(C.PORTS, MOCK.PORTS), SHIPS: pick(C.SHIPS, MOCK.SHIPS), ACHIEVEMENTS: pick(C.ACHIEVEMENTS, MOCK.ACHIEVEMENTS),
  };
  const bus = createBus();
  const owned = new Set(['hearthrock', 'millbrook', 'pinecrest', 'orespur', 'kilnshelf']);
  const scouted = new Set([...owned, 'emberrock', 'glimmerreach', 'corsairroost']);
  const G = {
    t: 14 * 300 + 120, day: 15, tod: 0.62, speed: 1, scene: 'research',
    colony: { name: 'Hearthrock', pop: 214, popCap: 240, workers: 180, idle: 12, happiness: 0.78, coin: 18420, insight: 1240 },
    islands: content.ISLANDS.map((i) => ({ ...i, owned: owned.has(i.id), discovered: scouted.has(i.id) || i.id === 'mossback', scouted: scouted.has(i.id), drift: null })),
    buildings: [
      { id: 1, type: 'townhall', island: 'hearthrock', u: 10, v: 8, level: 1, state: 'built', workers: 2 },
      { id: 2, type: 'academy', island: 'hearthrock', u: 4, v: 4, level: 1, state: 'built', workers: 3 },
      { id: 3, type: 'mooring', island: 'hearthrock', u: 22, v: 6, level: 1, state: 'built', workers: 2 },
      { id: 4, type: 'mooring', island: 'kilnshelf', u: 1, v: 3, level: 1, state: 'built', workers: 2 },
      { id: 5, type: 'shipyard', island: 'hearthrock', u: 18, v: 2, level: 1, state: 'built', workers: 4 },
    ],
    links: [{ id: 30, kind: 'bridge', a: 'hearthrock', b: 'orespur', state: 'built' }, { id: 31, kind: 'cable', a: 'hearthrock', b: 'kilnshelf', state: 'built' }, { id: 32, kind: 'bridge', a: 'hearthrock', b: 'millbrook', state: 'built' }, { id: 33, kind: 'cable', a: 'hearthrock', b: 'pinecrest', state: 'built' }],
    pools: { hearthrock: { res: { wood: 1240, planks: 312, stone: 860, grain: 980, flour: 140, bread: 220, ore: 412, coal: 260, iron: 96, parts: 44, skystone: 44, aether: 6 }, cap: { wood: 2000, planks: 1000, stone: 2000, grain: 2000, flour: 500, bread: 800, ore: 1000, coal: 800, iron: 500, parts: 300, skystone: 200, aether: 60 } } },
    ships: [
      { id: 40, kind: 'freighter', name: 'Wren', home: 3, route: 50, state: 'flying', x: -60, y: 50, cargo: { iron: 40 }, hp: 90, maxHp: 100 },
      { id: 41, kind: 'skiff', name: 'Puffin', home: 3, route: null, state: 'docked', cargo: {}, hp: 60, maxHp: 60 },
      { id: 42, kind: 'freighter', name: 'Kestrel', home: 4, route: 51, state: 'flying', x: 2, y: -90, cargo: { skystone: 20 }, hp: 70, maxHp: 100 },
      { id: 43, kind: 'militia', name: 'Valiant', home: 3, route: null, state: 'escort', cargo: {}, hp: 120, maxHp: 120 },
    ],
    routes: [
      { id: 50, from: 3, to: 'porthalcyon', ship: 40, orders: [{ res: 'iron', mode: 'sell', n: 40 }, { res: 'planks', mode: 'buy', n: 30 }], trips: 6, profit: 1840, eta: 82, phase: 0.35 },
      { id: 51, from: 4, to: 'brassreach', ship: 42, orders: [{ res: 'skystone', mode: 'sell', n: 20 }, { res: 'coal', mode: 'buy', n: 40 }], trips: 3, profit: 920, eta: 140, phase: 0.7 },
      { id: 52, from: 3, to: 'verdantdrift', ship: null, orders: [{ res: 'planks', mode: 'sell', n: 30 }, { res: 'grain', mode: 'buy', n: 60 }], trips: 11, profit: 640, eta: null, phase: 0 },
    ],
    ports: [
      { id: 'porthalcyon', rep: 64, prices: { iron: { buy: 30, sell: 24, trend: 1 }, parts: { buy: 60, sell: 48, trend: 0 }, planks: { buy: 9, sell: 6, trend: -1 }, stone: { buy: 5, sell: 3, trend: 0 }, bread: { buy: 6, sell: 4, trend: 1 } } },
      { id: 'verdantdrift', rep: 38, prices: { grain: { buy: 3, sell: 2, trend: -1 }, bread: { buy: 5, sell: 3, trend: 0 }, planks: { buy: 11, sell: 9, trend: 1 }, wood: { buy: 4, sell: 3, trend: 0 } } },
      { id: 'brassreach', rep: 22, prices: { skystone: { buy: 70, sell: 55, trend: 1 }, aether: { buy: 260, sell: 210, trend: 1 }, coal: { buy: 6, sell: 4, trend: -1 }, parts: { buy: 52, sell: 40, trend: -1 }, iron: { buy: 26, sell: 20, trend: 0 } } },
    ],
    contracts: [
      { id: 60, port: 'porthalcyon', res: 'iron', n: 200, delivered: 128, due: 17 * 300, reward: { coin: 2400 }, rep: 10, accepted: true },
      { id: 61, port: 'brassreach', res: 'skystone', n: 60, delivered: 0, due: 20 * 300, reward: { coin: 3600, parts: 20 }, rep: 12, accepted: false },
      { id: 62, port: 'verdantdrift', res: 'planks', n: 150, delivered: 0, due: 18 * 300, reward: { coin: 900, bread: 120 }, rep: 8, accepted: false },
    ],
    expeditions: [{ id: 70, target: 'emberrock', kind: 'scout', eta: 64, total: 180 }],
    research: { current: 'turbines', progress: 0.68, done: ['bellows', 'skiffs', 'cargoholds', 'propellers', 'crystallore', 'harpoons', 'rods'], queue: ['assembly'] },
    weather: { kind: 'clear', power: 0 }, raid: null, pirates: [],
    goals: { chapter: 4, achievements: ['firstlanding', 'breadwinner', 'ironwill', 'bridgebuilder', 'scholar'], done: [] },
    stats: { samples: [], totals: { builtTotal: 146, ironSmelted: 2310, breadBaked: 4120, raidsRepelled: 3, piratesDowned: 11, stormsWeathered: 4, tradeIncome: 12400, contractsDone: 5, researchDone: 7, islandsClaimed: 5, peakPop: 214 } },
    log: [], event: null, tmp: { netOf: { hearthrock: 'hearthrock', millbrook: 'hearthrock', orespur: 'hearthrock', kilnshelf: 'hearthrock', pinecrest: 'hearthrock' }, researchProgress: 0.68 },
    bus,
  };
  // fourteen days of samples
  let pop = 8, coin = 120;
  for (let t = 0; t <= G.t; t += 60) {
    const d = t / 300; pop = Math.min(214, 8 + d * 15 + Math.sin(d * 2) * 3); coin = 120 + Math.pow(d, 2.1) * 75 + Math.sin(d * 3) * 300;
    G.stats.samples.push({ t, pop: Math.round(pop), coin: Math.max(0, Math.round(coin)), wood: 20 + d * 4, stone: 10 + d * 3, grain: 18 + d * 5, iron: Math.max(0, (d - 4) * 2.4), parts: Math.max(0, (d - 7) * 0.9), skystone: Math.max(0, (d - 10) * 0.6), happiness: 0.6 + 0.15 * Math.sin(d) });
  }
  const app = {
    G, scene: G.scene, content, bus, ev: createBus(), flags: {}, settings: {}, profile: 0, mode: { build: null, select: null, link: null },
    cam: { x: 0, y: 0, z: 0, zoom: 1, tx: null, ty: null, tzoom: null },
    setScene(s) { app.scene = s; G.scene = s; app.ev.emit('scene', { scene: s }); },
  };
  const ok = (x = {}) => ({ ok: true, ...x });
  app.act = {
    research(id) { if (G.research.done.includes(id)) return { ok: false, error: 'Already researched' }; if (G.research.current) { if (!G.research.queue.includes(id)) G.research.queue.push(id); return ok(); } G.research.current = id; G.research.progress = 0; G.tmp.researchProgress = 0; return ok(); },
    cancelResearch() { G.research.current = G.research.queue.shift() || null; G.tmp.researchProgress = 0; return ok(); },
    expedition(target, kind) { G.expeditions.push({ id: 90 + G.expeditions.length, target, kind, eta: 150, total: 150 }); return ok(); },
    claim(id) { const i = G.islands.find((x) => x.id === id); if (!i?.scouted) return { ok: false, error: 'Scout it first' }; i.owned = true; return ok(); },
    drift(id, dx, dy) { const i = G.islands.find((x) => x.id === id); i.ox += dx; i.oy += dy; return ok(); },
    ship(kind, m) { G.ships.push({ id: 100 + G.ships.length, kind, home: m, state: 'docked', cargo: {}, hp: 60, maxHp: 60 }); return ok(); },
    route(o) { const id = 200 + G.routes.length; G.routes.push({ id, ...o, trips: 0, profit: 0 }); return ok({ id }); },
    editRoute(id, p) { Object.assign(G.routes.find((r) => r.id === id), p); return ok(); },
    deleteRoute(id) { G.routes = G.routes.filter((r) => r.id !== id); return ok(); },
    contract(id) { const c = G.contracts.find((x) => x.id === id); c.accepted = true; return ok(); },
    sell() { return ok(); }, speed(n) { G.speed = n; return ok(); },
  };
  return app;
}

// A real game: createGame + initSim + a preset played by the bot, with the real action API.
export async function realApp(preset = 'mid', seed = 3) {
  const [{ createGame }, sim, { makeActions }, { applyPreset }] = await Promise.all([
    import('../src/state.js'), import('../src/sim/index.js'), import('../src/sim/actions.js'), import('../src/presets.js'),
  ]);
  const bus = createBus();
  const app = { G: null, scene: 'colony', content: C, bus, ev: createBus(), flags: {}, settings: {}, profile: 0, mode: { build: null, select: null, link: null }, cam: { x: 0, y: 0, z: 0, zoom: 1 } };
  app.setScene = (s) => { app.scene = s; if (app.G) app.G.scene = s; app.ev.emit('scene', { scene: s }); };
  app.act = makeActions(() => app.G);
  const G = createGame({ seed, bus });
  app.G = G; sim.initSim(G);
  if (preset && preset !== 'fresh') { const r = applyPreset(G, preset, app); console.log('preset', JSON.stringify(r)); }
  app.tick = (sec) => sim.advance(G, sec);
  return app;
}
