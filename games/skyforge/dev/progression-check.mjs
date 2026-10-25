// Headless check of the PROGRESSION area: research, fleet, trade, chart, goals,
// events, achievements and the Skyforge, on a real colony (ECONOMY, THREATS sims)
// through the action API, plus content sanity, determinism and a save round trip.
//
//   node games/skyforge/dev/progression-check.mjs            checks only (about 10 s)
//   node games/skyforge/dev/progression-check.mjs --bot 4    also plays src/bot.js for 4 game hours
//                                                            and reports chapter times against CHAPTERS targets
// Exit code 0 when every check passes.
import { createGame, snapshot, restore } from '../src/state.js';
import { initSim, hydrateSim, tick } from '../src/sim/index.js';
import { makeActions } from '../src/sim/actions.js';
import { DT, DAY } from '../src/config.js';
import * as C from '../src/content/index.js';
import { SKYFORGE_STAGES } from '../src/content/goals.js';
import { CHART } from '../src/content/ports.js';
import * as research from '../src/sim/research.js';
import * as fleet from '../src/sim/fleet.js';
import * as trade from '../src/sim/trade.js';
import * as chart from '../src/sim/chart.js';
import * as goals from '../src/sim/goals.js';
import * as economy from '../src/sim/economy.js';

const args = process.argv.slice(2);
const botHours = args.includes('--bot') ? +(args[args.indexOf('--bot') + 1] || 4) : 0;
let pass = 0, fail = 0;
const ok = (cond, what, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL ${what}${extra ? ': ' + extra : ''}`); } };
const section = (t) => console.log(`\n# ${t}`);

function game(seed = 7) {
  const G = createGame({ seed });
  initSim(G);
  const act = makeActions(() => G);
  return { G, act };
}
const run = (G, s) => { const n = Math.round(s / DT); for (let i = 0; i < n; i++) tick(G); };
const runUntil = (G, pred, max) => { const n = Math.round(max / DT); for (let i = 0; i < n; i++) { tick(G); if (pred()) return true; } return false; };
const give = (G, obj, root) => { for (const [k, v] of Object.entries(obj)) economy.give(G, k, v, root); };
const RICH = { wood: 2000, planks: 2000, stone: 2000, iron: 2000, parts: 1000, skystone: 800, aether: 500, coal: 800, ore: 800, bread: 800, grain: 800, coin: 50000, insight: 20000 };

// Place a finished building (cheat for tests: pays through act.build, then finishes it).
function place(G, act, type, island) {
  const d = C.BUILDINGS.find((b) => b.id === type);
  if (d.needs) research.unlock(G, d.needs);
  if (d.req && !G.buildings.some((b) => b.type === d.req && b.state === 'built')) place(G, act, d.req, 'hearthrock');
  give(G, RICH, island);
  const spots = act.spots(type, island);
  if (!spots.length) return null;
  const [u, v] = spots[0];
  const r = act.build(type, island, u, v);
  if (!r.ok) return null;
  const b = G.buildings.find((x) => x.id === r.id);
  b.state = 'built'; b.progress = 1;
  G.bus.emit('build:done', { b });
  return b;
}
function hash(G) {
  const s = JSON.stringify(snapshot(G));
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

// ------------------------------------------------------------------------------------------
section('content');
{
  const R = C.RESEARCH, ids = new Set(R.map((r) => r.id));
  ok(R.length === 20, '20 research projects', R.length);
  for (const b of C.BRANCHES) {
    const lane = R.filter((r) => r.branch === b.id).sort((a, c) => a.tier - c.tier);
    ok(lane.length === 5 && lane.every((r, i) => r.tier === i + 1), `branch ${b.id} has tiers 1..5`);
  }
  const brief = ['bellows', 'turbines', 'assembly', 'automatons', 'foundry', 'skiffs', 'cargoholds', 'propellers', 'charters', 'galleons', 'crystallore', 'levitation', 'drift', 'stormtaming', 'beacon', 'harpoons', 'rods', 'shields', 'militia', 'bastion'];
  ok(brief.every((id) => ids.has(id)), 'research ids match the brief');
  for (const r of R) for (const n of r.needs) ok(ids.has(n), `${r.id} needs known ${n}`);
  const cross = R.filter((r) => r.needs.some((n) => R.find((x) => x.id === n).branch !== r.branch));
  ok(cross.length >= 4, 'cross-branch prerequisites', cross.map((r) => r.id).join(','));
  // acyclic and every tier reachable
  const depth = {};
  const d = (id, seen = new Set()) => { if (seen.has(id)) return Infinity; seen.add(id); const r = R.find((x) => x.id === id); return (depth[id] = r.needs.length ? 1 + Math.max(...r.needs.map((n) => d(n, new Set(seen)))) : 0); };
  for (const r of R) ok(Number.isFinite(d(r.id)), `${r.id} prerequisites are acyclic`);
  const B = new Set(C.BUILDINGS.map((b) => b.id)), S = new Set(C.SHIPS.map((s) => s.id)), D = new Set(C.DEFENDS.map((x) => x.id));
  for (const r of R) for (const u of r.unlocks) {
    const [k, v] = u.includes(':') ? u.split(':') : ['building', u];
    const known = k === 'building' ? B.has(v) : k === 'ship' ? S.has(v) : k === 'ability' ? D.has(v) || D.size === 0 : k === 'link' ? C.LINKS.some((l) => l.id === v) : k === 'feature';
    ok(known, `${r.id} unlocks known ${u}`);
  }
  for (const b of C.BUILDINGS) if (b.needs) ok(R.find((r) => r.id === b.needs)?.unlocks.includes(b.id), `building ${b.id} needs ${b.needs}, which unlocks it`);
  for (const l of C.LINKS) if (l.needs) ok(R.find((r) => r.id === l.needs)?.unlocks.includes('link:' + l.id), `link ${l.id} needs ${l.needs}, which unlocks it`);
  for (const s of C.SHIPS) ok(ids.has(s.needs) && R.find((r) => r.id === s.needs).unlocks.includes('ship:' + s.id), `ship ${s.id} unlocked by ${s.needs}`);
  ok(C.PORTS.length === 3 && ['porthalcyon', 'verdantdrift', 'brassreach'].every((p) => C.PORTS.some((x) => x.id === p)), 'three ports');
  ok(C.CHAPTERS.length === 7 && C.CHAPTERS.every((c, i) => c.n === i + 1 && c.steps.length >= 4 && c.target > 0), 'seven chapters with steps and targets');
  for (const c of C.CHAPTERS) for (const s of c.steps) {
    if (s.hint?.type && !['bridge', 'cable'].includes(s.hint.type)) ok(B.has(s.hint.type), `hint ${s.id} points at a building`, s.hint.type);
    if (s.hint?.island) ok(C.ISLANDS.some((i) => i.id === s.hint.island), `hint ${s.id} island exists`);
    if (s.check.built) ok(B.has(s.check.built.type), `step ${s.id} checks a building`);
    if (s.check.tech) ok(ids.has(s.check.tech), `step ${s.id} checks research`);
    if (s.check.island) ok(C.ISLANDS.some((i) => i.id === s.check.island), `step ${s.id} checks an island`);
  }
  ok(C.CHAPTERS.map((c) => c.target).every((t, i, a) => !i || t > a[i - 1]), 'chapter targets ascend');
  ok(C.EVENTS.length >= 15, '15+ events', C.EVENTS.length);
  ok(C.EVENTS.every((e) => e.options.length >= 2 && e.options.every((o) => o.label && o.effects)), 'events have 2+ options with effects');
  ok(C.ACHIEVEMENTS.length >= 20, '20+ achievements', C.ACHIEVEMENTS.length);
  ok(SKYFORGE_STAGES.length === 5, 'five Skyforge stages');
  ok(JSON.stringify(C.RESEARCH) && JSON.stringify(C.CHAPTERS) && JSON.stringify(C.EVENTS), 'content is JSON-safe');
}

// ------------------------------------------------------------------------------------------
section('research');
{
  const { G, act } = game(11);
  G.colony.insight = 0;
  let r = act.research('turbines');
  ok(!r.ok && /Bellows/.test(r.error), 'turbines refused before bellows', r.error);
  r = act.research('bellows');
  ok(!r.ok && /insight/.test(r.error), 'bellows refused without insight', r.error);
  G.colony.insight = 5000; give(G, { planks: 300, iron: 200, parts: 100 });
  r = act.research('bellows'); ok(r.ok && G.research.current === 'bellows', 'bellows begins');
  ok(G.colony.insight === 5000 - research.costOf('bellows').insight, 'insight paid on start');
  ok(act.research('turbines').ok && G.research.queue[0] === 'turbines', 'turbines queues behind bellows');
  ok(act.research('crystallore').ok, 'crystallore queues');
  ok(!act.research('assembly').ok || G.research.queue.includes('assembly'), 'assembly queue follows needs');
  ok(!research.available(G).includes('turbines') && !research.available(G).includes('bellows'), 'available() leaves out current and queued');
  // no academy yet: scholars stall the project
  run(G, 3);
  const academies = G.buildings.filter((b) => b.type === 'academy' && b.state === 'built').length;
  if (!academies) ok(G.research.stall === 'scholars' && G.research.progress === 0, 'no scholars, no progress', G.research.stall);
  const ac = place(G, act, 'academy', 'hearthrock');
  ok(!!ac, 'academy placed');
  G.colony.pop = Math.max(G.colony.pop, 40);
  run(G, 5);
  const sch = research.scholars(G);
  ok(sch > 0, 'academy has scholars', sch);
  const p0 = G.research.progress;
  run(G, 10);
  ok(G.research.progress > p0, 'progress grows with scholars', `${p0} -> ${G.research.progress}`);
  ok(Math.abs(G.tmp.researchProgress - G.research.progress) < 1e-9, 'G.tmp.researchProgress mirrors');
  ok(runUntil(G, () => G.research.done.includes('bellows'), 600), 'bellows completes');
  ok(research.has(G, 'bellows') && research.isUnlocked(G, 'smelter'), 'bellows unlocks the smelter');
  ok(runUntil(G, () => G.research.current === 'turbines', 5), 'queue moves on to turbines');
  const ins = G.colony.insight;
  ok(act.cancelResearch().ok && G.research.current !== 'turbines', 'cancel turbines');
  ok(G.colony.insight === ins + research.costOf('turbines').insight, 'cancel refunds insight');
  run(G, 2);
  ok(G.research.current === 'crystallore', 'next queued begins after cancel', G.research.current);
  research.unlock(G, 'propellers');
  ok(['skiffs', 'cargoholds', 'propellers'].every((x) => research.has(G, x)), 'unlock(id) brings prerequisites');
  ok(Math.abs(research.bonus(G, 'shipSpeed') - 0.25) < 1e-9, 'bonus(G, shipSpeed) = 0.25');
  research.unlock(G, 'all');
  ok(G.research.done.length === 20 && research.available(G).length === 0, "unlock('all')");
}

// ------------------------------------------------------------------------------------------
section('fleet and trade');
let moorId = null;
{
  const { G, act } = game(12);
  const m = place(G, act, 'mooring', 'hearthrock');
  ok(!!m, 'mooring placed');
  moorId = m && m.id;
  let r = act.ship('cargo', m.id);
  ok(!r.ok && /research/.test(r.error), 'cargo ship needs research', r.error);
  research.unlock(G, 'cargoholds');
  give(G, RICH);
  r = act.ship('cargo', m.id);
  ok(r.ok, 'cargo ship ordered', r.error);
  const s = G.ships.find((x) => x.id === r.id);
  ok(s && s.state === 'building', 'on the slip');
  ok(runUntil(G, () => s.state === 'idle', 200), 'cargo ship built');
  const dp = fleet.dockPos(G, m, 0);
  ok(Math.hypot(s.x - dp.x, s.y - dp.y) < 0.01 && Number.isFinite(s.hdg), 'docked beside the mooring');
  ok(act.ship('skiff', m.id).ok && act.ship('skiff', m.id).ok, 'two skiffs ordered');
  ok(!act.ship('skiff', m.id).ok, 'berths fill up (3 per mooring)');
  // a trade route to Port Halcyon
  r = act.route({ from: 'hearthrock', to: 'porthalcyon', ship: s.id, orders: [{ res: 'iron', mode: 'sell', n: 30 }, { res: 'stone', mode: 'buy', n: 20 }] });
  ok(r.ok, 'route created', r.error);
  const route = G.routes.find((x) => x.id === r.id);
  const coin0 = G.colony.coin, iron0 = G.pools[G.tmp.netOf.hearthrock].res.iron;
  let far = 0, zmax = 0, moved = 0, last = null;
  const port = fleet.portPos('porthalcyon');
  const done = runUntil(G, () => {
    far = Math.max(far, Math.hypot(s.x - dp.x, s.y - dp.y)); zmax = Math.max(zmax, s.z);
    if (last) moved = Math.max(moved, Math.hypot(s.x - last.x, s.y - last.y) / DT);
    last = { x: s.x, y: s.y };
    return route.trips >= 1;
  }, 900);
  ok(done, 'first trip completes inside 15 min', `${route.state} eta ${route.eta}`);
  ok(far > Math.hypot(port.x - dp.x, port.y - dp.y) - 1, 'ship really flew to the port', far.toFixed(1));
  ok(zmax > dp.z + 2, 'ship climbs to cruise altitude', zmax.toFixed(1));
  ok(moved < fleet.speedOf(G, s) * 1.05 + 0.01, 'speed within the ship\'s limit', moved.toFixed(2));
  ok(G.colony.coin > coin0 - 200 && route.earned !== 0, 'route earned coin', `${route.earned}`);
  ok(G.pools[G.tmp.netOf.hearthrock].res.iron < iron0, 'iron left the stores');
  ok(route.state === 'loading' || route.state === 'outbound' || route.state === 'waiting', 'route loops', route.state);
  // prices drift with sales
  const before = trade.sellPrice(G, 'porthalcyon', 'iron');
  for (let i = 0; i < 5; i++) act.sell('iron', 40);
  const after = trade.sellPrice(G, 'porthalcyon', 'iron');
  ok(after < before, 'selling lowers the price', `${before.toFixed(2)} -> ${after.toFixed(2)}`);
  run(G, 600);
  ok(trade.sellPrice(G, 'porthalcyon', 'iron') > after, 'price recovers with time');
  // quick sell and contracts
  G.goals.chapter = 3;
  run(G, 2);
  const c = G.contracts.find((x) => x.port === 'porthalcyon' && x.state === 'offered');
  ok(!!c, 'Port Halcyon offers a contract in chapter 3');
  ok(act.contract(c.id).ok && c.state === 'active', 'contract accepted');
  const t0 = G.stats.totals['contracts:porthalcyon'] || 0;
  r = act.sell(c.res, c.n);
  ok(r.ok && c.state === 'done', 'quickSell fills the contract', JSON.stringify(r));
  ok((G.stats.totals['contracts:porthalcyon'] || 0) === t0 + 1, 'contract counted for the chapter step');
  ok(G.ports.find((p) => p.id === 'porthalcyon').rep > 0, 'reputation grows');
  ok(!act.sell('aether', 0).ok && !act.sell('nothing', 5).ok, 'quickSell rejects nonsense');
  // carry route needs an owned island with a mooring
  r = act.route({ from: 'hearthrock', to: 'emberrock', ship: G.ships.find((x) => x.kind === 'skiff')?.id, orders: [{ res: 'wood', mode: 'carry', n: 5 }] });
  ok(!r.ok, 'carry route to an unowned island refused', r.error);
  ok(act.deleteRoute(route.id).ok && s.route == null, 'route deleted, ship freed');
  ok(runUntil(G, () => s.state === 'idle', 900), 'freed ship flies home and idles');
  ok(act.scrapShip(s.id).ok && !G.ships.includes(s), 'scrap ship');
}

// ------------------------------------------------------------------------------------------
section('chart');
{
  const { G, act } = game(13);
  const isl = (id) => G.islands.find((i) => i.id === id);
  ok(isl('millbrook').discovered && isl('millbrook').scouted && !isl('millbrook').owned, 'home islets charted at start');
  ok(isl('emberrock').discovered && !isl('emberrock').scouted, 'Emberrock seen, not scouted');
  ok(!isl('mossback').discovered, 'Mossback hidden');
  give(G, RICH);
  ok(act.claim('millbrook').ok && isl('millbrook').owned, 'claim an islet directly');
  ok(!act.claim('emberrock').ok, 'far island needs an expedition');
  let r = act.expedition('emberrock', 'scout');
  ok(!r.ok && /Skiffs/.test(r.error), 'expeditions need skiffs research', r.error);
  research.unlock(G, 'skiffs'); research.unlock(G, 'cargoholds');
  const m = place(G, act, 'mooring', 'hearthrock');
  r = act.expedition('emberrock', 'scout');
  ok(!r.ok && /skiff/.test(r.error), 'no ship, no scouts', r.error);
  act.ship('skiff', m.id); act.ship('cargo', m.id);
  run(G, 100);
  r = act.expedition('emberrock', 'scout');
  ok(r.ok, 'scouts set out', r.error);
  const e = G.expeditions.find((x) => x.id === r.id);
  ok(e.eta > 30, 'expedition eta', e.eta);
  ok(runUntil(G, () => e.result, 900), 'scouts report back', e.state);
  ok(isl('emberrock').scouted || (e.result && !e.result.ok), 'Emberrock scouted (or chased off)', e.result && e.result.text);
  if (!isl('emberrock').scouted) { isl('emberrock').scouted = true; }
  ok(chart.info(G, 'emberrock').resources.length > 0, 'chart info lists resources');
  G.colony.pop = Math.max(G.colony.pop, 40);
  ok(runUntil(G, () => G.ships.filter((s) => s.state === 'idle').length >= 2, 900), 'ships home again');
  r = act.expedition('emberrock', 'claim');
  ok(r.ok, 'claim expedition sets out', r.error);
  const e2 = G.expeditions.find((x) => x.id === r.id);
  ok(runUntil(G, () => e2.result, 1200), 'claim expedition resolves');
  ok(isl('emberrock').owned || !e2.result.ok, 'Emberrock claimed (or chased off)', e2.result && e2.result.text);
  ok(G.tmp.netOf.emberrock || !isl('emberrock').owned, 'claimed island has a network');
  r = act.expedition('glimmerreach', 'scout');
  ok(!r.ok && /Tempest/.test(r.error), 'Tempest Wall blocks Glimmerreach', r.error);
  r = act.expedition('corsairroost', 'claim');
  ok(!r.ok && /[Mm]ilitia/.test(r.error), 'Roost needs militia', r.error);
  // drift
  ok(!act.drift('pinecrest', 3, 0).ok, 'drift needs ownership or research');
  research.unlock(G, 'levitation');
  act.claim('pinecrest');
  ok(!act.drift('hearthrock', 3, 0).ok, 'Hearthrock never drifts');
  const pc = isl('pinecrest'), ox = pc.ox;
  r = act.drift('pinecrest', 4, 0);
  ok(r.ok, 'drift Pinecrest', r.error);
  ok(runUntil(G, () => !pc.drift, 120) && pc.ox === ox + 4, 'Pinecrest drifted 4 tiles', pc.ox);
  ok(!act.drift('pinecrest', -4, -20).ok, 'drift refuses overlaps');
  // the roost falls to militia
  research.unlock(G, 'militia');
  const yard = place(G, act, 'shipyard', 'hearthrock');
  give(G, RICH);
  for (let k = 0; k < 3; k++) act.ship('militia', yard.id);
  run(G, 200);
  ok(G.ships.filter((s) => s.kind === 'militia' && s.state === 'idle').length >= 3, 'three militia ships');
  research.unlock(G, 'bastion');
  if (G.raid) { G.raid = null; G.pirates.length = 0; }
  r = act.expedition('corsairroost', 'claim');
  ok(r.ok, 'militia attack the Roost', r.error);
  const e3 = G.expeditions.find((x) => x.id === r.id);
  ok(runUntil(G, () => e3.result, 1500), 'attack resolves');
  ok(G.goals.flags.roostTaken && isl('corsairroost').owned, 'Corsair Roost taken, roostTaken set', e3.result && e3.result.text);
  ok(chart.claimAll(G).ok && G.islands.filter((i) => i.id !== 'corsairroost').every((i) => i.owned), 'claimAll');
}

// ------------------------------------------------------------------------------------------
section('goals, events, achievements, the Skyforge');
{
  const { G, act } = game(14);
  run(G, 2);
  ok(G.tmp.goalSteps.length === 5 && G.tmp.goalSteps[0].id === 'c1_lumber', 'chapter 1 steps in G.tmp.goalSteps');
  const h = G.tmp.goalSteps.find((s) => s.id === 'c1_quarry')?.hint;
  ok(h && h.island === 'hearthrock' && Number.isInteger(h.u) && Number.isInteger(h.v), 'quarry hint points at a cell', JSON.stringify(h));
  if (h && h.u != null) ok(act.canBuild('quarry', 'hearthrock', h.u, h.v).ok || G.buildings.some((b) => b.type === 'quarry'), 'hinted cell is a legal quarry spot');
  // event cards
  ok(goals.showEvent(G, 'merchant').ok && G.event && G.event.options.length === 3, 'event card shows');
  G.colony.coin = 0;
  ok(!act.choose(0).ok && G.event, 'unaffordable option refused, card stays');
  G.colony.coin = 500;
  const iron0 = G.pools[G.tmp.netOf.hearthrock].res.iron || 0;
  const r = act.choose(0);
  ok(r.ok && !G.event && G.pools[G.tmp.netOf.hearthrock].res.iron >= iron0 + 40 && G.colony.coin === 340, 'choice applied (iron bought)', JSON.stringify(r));
  ok(goals.showEvent(G, 'whales').ok && act.choose(0).ok && G.colony.boosts.some((b) => b.kind === 'happiness'), 'holiday adds a happiness boost');
  // events come on their own
  const g2 = game(15).G; let seen = 0;
  g2.bus.on('event', () => { seen++; goals.choose(g2, g2.event.options.length - 1); });
  run(g2, 8 * DAY);
  ok(seen >= 2, 'event cards roll over 8 days', seen);
  ok(g2.stats.samples.length >= 38 && g2.stats.samples.at(-1).prod && g2.stats.samples.at(-1).pop > 0, 'chronicle samples every game minute', g2.stats.samples.length);
  // forge stages and the finale
  research.unlock(G, 'all'); chart.claimAll(G);
  const sf = place(G, act, 'skyforge', 'glimmerreach');
  ok(!!sf && sf.level === 0, 'Skyforge foundations on Glimmerreach');
  give(G, RICH, 'glimmerreach'); give(G, RICH);
  let up = act.upgrade(sf.id);
  ok(up.ok && sf.forge && sf.forge.stage === 1, 'stage 1 begins', up.error);
  ok(!act.upgrade(sf.id).ok, 'one stage at a time');
  ok(runUntil(G, () => sf.level === 1, 2000), 'stage 1 raised', JSON.stringify(sf.forge));
  ok(G.tmp.skyforgeProgress >= 0.2 - 1e-9, 'skyforgeProgress', G.tmp.skyforgeProgress);
  for (let k = 2; k <= 5; k++) {
    give(G, RICH, 'glimmerreach');
    up = act.upgrade(sf.id);
    ok(up.ok, `stage ${k} begins`, up.error);
    if (k === 5) ok(G.goals.flags.finalRaid && (G.raid?.final || G.threat?.finalPending), 'stage 5 calls the Dreadnought', JSON.stringify(G.raid && G.raid.phase));
    if (k === 5) { G.raid = null; G.pirates.length = 0; if (G.threat) G.threat.finalPending = false; G.goals.meta.finalAt = G.t; }
    ok(runUntil(G, () => sf.level === k, 3000), `stage ${k} raised`);
  }
  ok(!G.goals.won, 'no victory while the Dreadnought flies');
  G.goals.flags.dreadnoughtDown = true;
  for (const ch of C.CHAPTERS) for (const s of ch.steps) G.goals.steps[s.id] = true;
  let won = 0; G.bus.on('won', () => won++);
  run(G, 2);
  ok(!G.goals.won, 'chapters close one at a time, not all in one tick');
  run(G, 7 * 50);
  ok(G.goals.won && won === 1 && G.goals.wonAt != null, 'victory when the forge is lit and the Dreadnought down');
  ok(G.goals.achievements.includes('forgelit'), 'achievement on victory');
  // win() cheat from a fresh colony
  const { G: G3, act: a3 } = game(16);
  let w3 = 0; G3.bus.on('won', () => w3++);
  ok(goals.win(G3).ok && G3.goals.won && w3 === 1, 'win() takes the normal path');
  ok(G3.goals.chapter === 7 && G3.goals.done.length === 7, 'all seven chapters done', G3.goals.done.join(','));
  ok(G3.buildings.some((b) => b.type === 'skyforge' && b.level === 5), 'a five-stage Skyforge stands');
  run(G3, 5);
  ok(G3.goals.won, 'sandbox keeps running after victory');
  ok(a3.choose(0).ok === false, 'choose without a card is refused');
}

// ------------------------------------------------------------------------------------------
section('determinism and save round trip');
{
  const script = (seed) => {
    const { G, act } = game(seed);
    give(G, RICH); research.unlock(G, 'cargoholds');
    const m = place(G, act, 'mooring', 'hearthrock');
    act.ship('cargo', m.id); act.research('bellows');
    run(G, 120);
    act.route({ from: 'hearthrock', to: 'verdantdrift', ship: G.ships[0].id, orders: [{ res: 'planks', mode: 'sell', n: 20 }, { res: 'bread', mode: 'buy', n: 10 }] });
    act.claim('millbrook');
    run(G, 600);
    return G;
  };
  const a = script(21), b = script(21);
  ok(hash(a) === hash(b), 'same seed and actions, same hash');
  const data = JSON.parse(JSON.stringify(snapshot(a)));
  const c = restore(data); hydrateSim(c);
  // PROGRESSION's own state (pools and colony belong to ECONOMY, which rounds pools on hydrate)
  const mine = (G) => JSON.stringify({ r: G.research, s: G.ships, ro: G.routes, c: G.contracts, p: G.ports, e: G.expeditions, g: G.goals, ev: G.event, i: G.islands.map((i) => [i.id, i.owned, i.scouted, i.discovered, i.ox, i.oy]) });
  ok(mine(c) === mine(a), 'restore keeps progression state');
  ok(hash(c) === hash(a), 'restore gives the same whole-game hash (ECONOMY pool rounding, see notes)');
  run(a, 60); run(c, 60);
  ok(mine(c) === mine(a), 'restored colony runs on identically (progression state)');
}

// ------------------------------------------------------------------------------------------
if (botHours > 0) {
  section(`pacing: src/bot.js for ${botHours} game hours`);
  const { runBot } = await import('./bot-run.mjs');
  const r = runBot({ seed: 1, hours: botHours });
  const fmt = (t) => `${Math.floor(t / 3600)}h${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
  console.log('| chapter | target | bot |');
  console.log('|---|---|---|');
  for (const ch of C.CHAPTERS) {
    const next = ch.n < 7 ? r.marks['chapter ' + (ch.n + 1)] : r.marks.won;
    console.log(`| ${ch.n} ${ch.name} | ${ch.target} min | ${next != null ? fmt(next) : '-'} |`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
