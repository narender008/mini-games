// Ready-made colonies for screenshots, perf runs and quick looks
// (?preset=early|mid|late|storm|raid, __sf.play({ preset }), __sf.stress(opts)).
//
// A preset is PLAYED, not painted: the autopilot (src/bot.js) runs the fresh
// colony forward through act.* exactly like a player, with economy.give()
// topping up whatever an action costs (cheat mode) so hours of play take a
// couple of seconds. Every building therefore sits on a legal, sensible spot
// and the colony looks lived in, like concepts 3 and 4.
//
//   early  chapter 2: Hearthrock settled, Millbrook bridged, bread on the way
//   mid    chapter 4: the five-island home cluster, iron and brass, moorings
//   late   chapter 7: skystone and aether, defences, the Skyforge rising
//   storm  mid colony at dusk in a full storm
//   raid   mid colony with batteries under a Crimson Gale raid
//   stress late colony plus extra buildings, ships, pirates (opts)
// applyPreset(G, name, app, opts) -> { ok, error?, chapter, seconds, ms }
import { tick, MODULES } from './sim/index.js';
import { DAY } from './config.js';
import { makeActions } from './sim/actions.js';
import * as C from './content/index.js';
import { createBus } from './core/events.js';
import { createBrain } from './bot.js';

const PLAN = {
  early: { chapter: 2, pop: 22, maxT: 2400, settle: 90 },
  mid: { chapter: 4, pop: 70, maxT: 6000, settle: 180 },
  late: { chapter: 7, pop: 150, maxT: 12000, settle: 180, stage: 2 },
  storm: { chapter: 4, pop: 70, maxT: 6000, settle: 180 },
  raid: { chapter: 5, pop: 80, maxT: 7000, settle: 120 },
  stress: { chapter: 7, pop: 150, maxT: 12000, settle: 120, stage: 2 },
};

// Coarse steps for growing a preset quickly: the same modules in the same
// order as sim/index.js tick(), with a bigger dt (raids and storms are off).
const ORDER = ['weather', 'links', 'economy', 'islands', 'fleet', 'trade', 'chart', 'research', 'raids', 'defence', 'combat', 'goals'];
function coarse(G, dt) {
  G.t += dt;
  G.tod += dt / DAY;
  if (G.tod >= 1) { G.tod -= 1; G.day += 1; G.bus.emit('day', { day: G.day }); }
  for (const k of ORDER) MODULES[k].step?.(G, dt);
}

const clock = () => (globalThis.performance?.now ? performance.now() : Date.now());

export function applyPreset(G, name, app, opts = {}) {
  const plan = PLAN[name];
  if (!G) return { ok: false, error: 'no game' };
  if (!plan) return { ok: false, error: `unknown preset ${name}` };
  const t0 = clock();
  const act = makeActions(() => G);
  const give = (k, n) => MODULES.economy.give?.(G, k, n);
  const brain = createBrain({ getG: () => G, act, C, cheat: true, give });
  // grow it on a private bus: render, audio and UI hear none of the hundreds of events
  const bus = G.bus;
  G.bus = createBus();
  const quiet = G.tmp.quiet;
  G.tmp.quiet = true;                       // no raids or storms while it grows
  const tod = G.tod;
  const reached = () => G.goals.chapter >= plan.chapter && (G.colony.pop || 0) >= (plan.pop || 0) && (!plan.stage || (G.buildings.find((b) => b.type === 'skyforge')?.level || 0) >= plan.stage);
  let settleUntil = null;
  const startT = G.t;
  while (G.t - startT < plan.maxT) {
    if (opts.fine) { for (let i = 0; i < 30; i++) tick(G); } else { coarse(G, 0.5); coarse(G, 0.5); }
    if (G.event) brain.onEvent();
    // research is the slow part: pay its insight up front so it never waits
    if (!G.research.current) give('insight', 200);
    brain.think();
    if (settleUntil == null && reached()) settleUntil = G.t + plan.settle;
    if (settleUntil != null && G.t >= settleUntil) break;
  }
  G.tmp.quiet = quiet;
  if (!quiet) delete G.tmp.quiet;
  // presets start in daylight unless they say otherwise; storm at dusk
  G.tod = name === 'storm' ? 0.72 : (tod ?? 0.42);
  G.raid = null; G.pirates = []; G.shots = [];
  G.bus = bus;
  G.log = (G.log || []).slice(-6);
  if (name === 'storm') MODULES.weather.startStorm?.(G, 0.85);
  if (name === 'raid') MODULES.raids.startRaid?.(G, 1.2, { now: true });
  if (name === 'stress') stress(G, act, give, opts);
  return { ok: reached(), chapter: G.goals.chapter, seconds: Math.round(G.t - startT), ms: Math.round(clock() - t0) };
}

// Pile extra load on a colony for performance runs.
function stress(G, act, give, { buildings = 80, ships = 12, pirates = 10 } = {}) {
  const types = C.BUILDINGS.filter((b) => !b.unique && b.buildable !== false && b.tab !== 'wonder').map((b) => b.id);
  let placed = 0;
  for (let k = 0; k < buildings * 4 && placed < buildings; k++) {
    const type = types[k % types.length];
    const isl = G.islands.filter((i) => i.owned)[k % Math.max(1, G.islands.filter((i) => i.owned).length)];
    if (!isl) break;
    const spots = act.spots(type, isl.id) || [];
    if (!spots.length) continue;
    const def = C.BUILDINGS.find((b) => b.id === type);
    for (const [r, n] of Object.entries(def.cost || {})) give(r, n + 1);
    const [u, v] = spots[(k * 7) % spots.length];
    if (act.build(type, isl.id, u, v).ok) placed++;
  }
  const dock = G.buildings.find((b) => b.type === 'mooring' || b.type === 'shipyard');
  for (let i = 0; i < ships && dock; i++) {
    const kind = i % 3 === 0 ? 'skiff' : 'cargo';
    const def = C.SHIPS.find((s) => s.id === kind);
    for (const [r, n] of Object.entries(def.cost || {})) give(r, n + 1);
    act.ship(kind, dock.id);
  }
  for (let i = 0; i < 600; i++) tick(G);
  if (pirates) MODULES.raids.startRaid?.(G, Math.max(1, pirates / 4), { now: true });
}
