// Headless economy check (ECONOMY). Founds a colony and plays a simple scripted
// build order through the action API only (no give, no unlock), then prints
// milestone times, stock curves, chain throughput and stalls.
//   node games/skyforge/dev/econ-check.mjs [--seed N] [--hours H] [--solo] [--quiet]
// --solo steps only clock + economy, links, islands, research (no weather or raids).
// Claims and Skyforge stages use PROGRESSION's chart/goals when they exist; while
// those are stubs the script claims and raises stages itself, paying the same costs.
import { createGame } from '../src/state.js';
import { initSim, tick, MODULES } from '../src/sim/index.js';
import { makeActions } from '../src/sim/actions.js';
import { DT, DAY } from '../src/config.js';
import { BY_ID } from '../src/content/buildings.js';
import { ISLAND_BY_ID } from '../src/content/islands.js';
import * as eco from '../src/sim/economy.js';
import * as links from '../src/sim/links.js';
import * as islandsMod from '../src/sim/islands.js';
import * as research from '../src/sim/research.js';
import * as goalsMod from '../src/sim/goals.js';
import * as goalsContent from '../src/content/goals.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SEED = +arg('seed', 7), HOURS = +arg('hours', 4.5), SOLO = process.argv.includes('--solo'), QUIET = process.argv.includes('--quiet');

const G = createGame({ seed: SEED, difficulty: 'standard' });
initSim(G);
const act = makeActions(() => G);
const log = [];
const say = (s) => { const line = `${mmss(G.t)}  ${s}`; log.push(line); if (!QUIET) console.log(line); };
const mmss = (t) => `${String(Math.floor(t / 60)).padStart(3)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

let solo = SOLO;
function step1() {
  if (!solo) {
    try { tick(G); return; } catch (e) { console.log('full tick threw (' + e.message + '); continuing with --solo'); solo = true; }
  }
  G.t += DT; G.tod += DT / DAY; if (G.tod >= 1) { G.tod -= 1; G.day++; }
  links.step(G, DT); eco.step(G, DT); islandsMod.step(G, DT); research.step?.(G, DT);
  goalsMod.step?.(G, DT);
}

// ---- helpers ----------------------------------------------------------------------
const home = () => G.pools[eco.homeRoot(G)];
const count = (t, isl) => G.buildings.filter((b) => b.type === t && (!isl || b.island === isl)).length;
const built = (t) => G.buildings.filter((b) => b.type === t && b.state === 'built').length;
const sites = () => G.buildings.filter((b) => b.state === 'site').length;
const owned = (id) => G.islands.find((i) => i.id === id)?.owned;
const linked = (a, b) => G.links.some((l) => ((l.a === a && l.b === b) || (l.a === b && l.b === a)) && l.state === 'built');
const linking = (a, b) => G.links.some((l) => ((l.a === a && l.b === b) || (l.a === b && l.b === a)));
function centre(isl) { const I = G.islands.find((i) => i.id === isl); const th = G.buildings.find((b) => b.type === 'townhall' && b.island === isl); return th ? [th.u + 1, th.v + 1] : [I.w / 2, I.h / 2]; }
let lastErr = '';
function place(type, isl = 'hearthrock', prefer = 'near', fallback = true) {
  const sp = act.spots(type, isl);
  if (!sp.length) {
    lastErr = `no spot for ${type} on ${isl}`;
    // try the other islands of the same network
    if (fallback) for (const o of WHERE) if (o !== isl && owned(o) && G.tmp.netOf[o] === G.tmp.netOf[isl] && place(type, o, prefer, false)) return true;
    return false;
  }
  const [cx, cy] = centre(isl);
  const k = (p) => Math.hypot(p[0] - cx, p[1] - cy);
  sp.sort((a, b) => (prefer === 'far' ? k(b) - k(a) : k(a) - k(b)));
  // prefer heat vents for smelters
  if (type === 'smelter') sp.sort((a, b) => ventScore(isl, b) - ventScore(isl, a));
  for (const [u, v] of sp.slice(0, 6)) {
    const r = act.build(type, isl, u, v);
    if (r.ok) { say(`build ${type} on ${isl} (${u},${v})`); return true; }
    lastErr = r.error;
    if (r.error && r.error.startsWith('Need')) return false;
  }
  return false;
}
function ventScore(isl, [u, v]) { const I = G.islands.find((i) => i.id === isl); let k = 0; for (let y = v; y < v + 2; y++) for (let x = u; x < u + 2; x++) if (I.cells[y * I.w + x] === 'h') k++; return k; }

function claim(id) {
  if (owned(id)) return true;
  const r = act.claim(id);
  if (r.ok) { say(`claim ${id} (chart)`); return true; }
  if (r.error !== 'not built yet') { lastErr = r.error; return false; }
  // stub fallback: pay the claim cost ourselves
  const cost = { ...ISLAND_BY_ID[id].claimCost }; const settlers = cost.settlers || 0; delete cost.settlers;
  if (G.colony.pop - settlers < 6) return false;
  const p = eco.payFor(G, 'hearthrock', cost);
  if (!p.ok) { lastErr = p.error; return false; }
  G.colony.pop -= settlers;
  G.islands.find((i) => i.id === id).owned = true;
  links.refresh(G);
  say(`claim ${id} (fallback; paid ${JSON.stringify(ISLAND_BY_ID[id].claimCost)})`);
  return true;
}
function bridge(a, b, kind = 'bridge') {
  if (linking(a, b)) return true;
  const r = act.link(kind, a, b);
  if (r.ok) { say(`${kind} ${a} - ${b}`); return true; }
  lastErr = r.error; return false;
}
function study(id) {
  if (G.research.done.includes(id)) return true;
  if (G.research.current === id || G.research.queue.includes(id)) return true;
  if (G.research.current) return false;
  const r = act.research(id);
  if (r.ok) { say(`research ${id}`); return true; }
  lastErr = r.error; return false;
}
const has = (id) => G.research.done.includes(id);
function ship(kind) {
  const docks = G.buildings.filter((b) => (b.type === 'mooring' || b.type === 'shipyard') && b.state === 'built');
  for (const d of docks) { const r = act.ship(kind, d.id); if (r.ok) { say(`ship ${kind} at ${d.type} ${d.id}`); return true; } lastErr = r.error; }
  if (!docks.length) lastErr = 'no mooring';
  return false;
}
function expedite(target, kind) {
  if (G.expeditions.some((e) => e.target === target && e.state !== 'done')) return true;
  const r = act.expedition(target, kind);
  if (r.ok) { say(`expedition ${kind} -> ${target}`); return true; }
  lastErr = r.error; return false;
}
const isl = (id) => G.islands.find((i) => i.id === id);

// Skyforge stages: PROGRESSION's goals.forgeUpgrade when present, else a fallback
let forge = null;
function stage() {
  const b = G.buildings.find((x) => x.type === 'skyforge');
  if (!b || b.state !== 'built') return false;
  if (b.level >= 5) return true;
  if (typeof goalsMod.forgeUpgrade === 'function') {
    if (b.forge) return false;
    const r = act.upgrade(b.id); if (r.ok) say(`skyforge stage ${b.level + 1} begins`); else lastErr = r.error;
    return false;
  }
  if (forge) return false;
  const S = goalsContent.SKYFORGE_STAGES[b.level];
  if (S.needs && !has(S.needs)) { lastErr = 'stage needs ' + S.needs; return false; }
  const p = eco.payFor(G, b.island, S.cost, { convoy: true });
  if (!p.ok) { lastErr = 'stage ' + S.n + ': ' + p.error; return false; }
  b.forge = { stage: S.n, t: 0, time: S.time };
  forge = b; say(`skyforge stage ${S.n} begins (fallback)`);
  return false;
}
function forgeStep(dt) {
  if (!forge || typeof goalsMod.forgeUpgrade === 'function') return;
  forge.forge.t += dt * Math.max(0.25, forge.eff || 0);
  if (forge.forge.t >= forge.forge.time) { forge.level++; forge.forge = null; say(`skyforge stage ${forge.level} done`); forge = null; }
}

// ---- the build order -----------------------------------------------------------------
// Each entry: [label, done(), doIt()] ; tried in order, the first unfinished one
// that cannot be done yet blocks the rest (the colony saves up), unless marked soft.
const H = 'hearthrock';
const want = (t, n, isl = H, pref) => [`${t} x${n}${isl !== H ? ' @' + isl : ''}`, () => count(t, isl === H ? null : isl) >= n, () => place(t, isl, pref)];
const PLAN = [
  want('lumber', 1), want('quarry', 1), want('cottage', 2), want('lumber', 2), want('sawmill', 1), want('farm', 1),
  want('cottage', 3), want('academy', 1),
  ['research bellows', () => has('bellows') || G.research.current === 'bellows', () => study('bellows')],
  want('well', 1), want('windmill', 1), want('bakery', 1), want('cottage', 5),
  ['claim orespur', () => owned('orespur'), () => claim('orespur')],
  ['bridge orespur', () => linking(H, 'orespur'), () => bridge(H, 'orespur')],
  want('mine', 1, 'orespur'), want('coalpit', 1, 'orespur'), want('smelter', 1),
  want('warehouse', 1), want('workshop', 1), want('cottage', 7), want('tavern', 1),
  ['claim millbrook', () => owned('millbrook'), () => claim('millbrook')],
  ['bridge millbrook', () => linking(H, 'millbrook'), () => bridge(H, 'millbrook')],
  want('farm', 2, 'millbrook'), want('market', 1), want('sawmill', 2), want('quarry', 2, 'orespur'),
  ['research skiffs', () => has('skiffs') || G.research.current === 'skiffs', () => study('skiffs')],
  want('mooring', 1, H, 'far'), want('academy', 2), want('academy', 3), want('cottage', 10), want('warehouse', 2),
  ['research turbines', () => has('turbines') || G.research.current === 'turbines', () => study('turbines')],
  ['claim kilnshelf', () => owned('kilnshelf'), () => claim('kilnshelf')],
  ['bridge kilnshelf', () => linking(H, 'kilnshelf'), () => bridge(H, 'kilnshelf')],
  want('smelter', 2, 'kilnshelf'), want('mine', 2, 'orespur'), want('farm', 3, 'millbrook'), want('bakery', 2), want('windmill', 2),
  want('lumber', 3), want('workshop', 2), want('cottage', 14), want('well', 2),
  ['research crystallore', () => has('crystallore') || G.research.current === 'crystallore', () => study('crystallore')],
  want('drill', 1, 'kilnshelf'),
  ['research harpoons', () => has('harpoons') || G.research.current === 'harpoons', () => study('harpoons')],
  ['research levitation', () => has('levitation') || G.research.current === 'levitation', () => study('levitation')],
  want('refinery', 1, 'kilnshelf'), want('tavern', 2), want('smelter', 3, 'kilnshelf'), want('mine', 3, 'orespur'), want('cottage', 18),
  ['research assembly', () => has('assembly') || G.research.current === 'assembly', () => study('assembly')],
  want('workshop', 3), want('warehouse', 3), want('academy', 4), want('academy', 5), want('sawmill', 3), want('lumber', 4),
  ['research rods', () => has('rods') || G.research.current === 'rods', () => study('rods')],
  ['research drift', () => has('drift') || G.research.current === 'drift', () => study('drift')],
  ['research stormtaming', () => has('stormtaming') || G.research.current === 'stormtaming', () => study('stormtaming')],
  want('drill', 2, 'kilnshelf'), want('cottage', 22), want('farm', 4, 'millbrook'), want('bakery', 3), want('windmill', 3),
  ['research automatons', () => has('automatons') || G.research.current === 'automatons', () => study('automatons')],
  ['research cargoholds', () => has('cargoholds') || G.research.current === 'cargoholds', () => study('cargoholds')],
  ['ship skiff', () => G.ships.some((x) => x.kind === 'skiff'), () => ship('skiff')],
  ['ship cargo', () => G.ships.some((x) => x.kind === 'cargo'), () => ship('cargo')],
  ['scout glimmerreach', () => isl('glimmerreach').scouted, () => expedite('glimmerreach', 'scout')],
  ['claim glimmerreach', () => owned('glimmerreach'), () => expedite('glimmerreach', 'claim')],
  want('skyforge', 1, 'glimmerreach'),
  ['research foundry', () => has('foundry') || G.research.current === 'foundry', () => study('foundry')],
  ['research beacon', () => has('beacon') || G.research.current === 'beacon', () => study('beacon')],
  want('refinery', 2, 'kilnshelf'), want('workshop', 4), want('smelter', 4, 'kilnshelf'), want('cottage', 26),
  ['skyforge stages', () => (G.buildings.find((b) => b.type === 'skyforge')?.level || 0) >= 5, () => stage()],
];

// what makes each good, and where to look for room
const MAKER = { wood: 'lumber', stone: 'quarry', planks: 'sawmill', iron: 'smelter', parts: 'workshop', ore: 'mine', coal: 'coalpit', grain: 'farm', flour: 'windmill', bread: 'bakery', skystone: 'drill', aether: 'refinery' };
const WHERE = ['hearthrock', 'orespur', 'millbrook', 'kilnshelf', 'pinecrest'];
function addMaker(res) {
  const t = MAKER[res]; if (!t) return false;
  if (G.buildings.some((b) => b.type === t && b.state === 'site')) return false;
  if (G.t - (addMaker[res] || -999) < 90) return false;
  for (const isl of (t === 'smelter' || t === 'drill' || t === 'refinery' ? ['kilnshelf', 'hearthrock'] : WHERE)) {
    if (!owned(isl)) continue;
    if (place(t, isl)) { addMaker[res] = G.t; return true; }
  }
  return false;
}

const CRIT = ['bellows', 'skiffs', 'crystallore', 'turbines', 'harpoons', 'cargoholds', 'propellers', 'rods', 'levitation', 'assembly', 'drift', 'stormtaming', 'automatons', 'foundry', 'beacon'];
// continuous upkeep of the colony beside the plan
function tend() {
  // a plan step waits on a good that barely trickles in: add a maker for it
  const m = /Need (\d+) more (\w+)/.exec(lastErr || '');
  if (m) {
    const res = { 'iron ore': 'ore' }[m[2]] || m[2];
    const rate = G.tmp.rates?.[eco.homeRoot(G)]?.[res] ?? 0;
    if (rate < 6) addMaker(res);
  }
  // inputs a chain is starved of
  for (const r of G.econ.short || []) if ((G.tmp.rates?.[eco.homeRoot(G)]?.[r] ?? 0) < 1) addMaker(r);
  const C = G.colony;
  // homes: keep a few beds free
  const jobs = G.tmp.jobs || { want: 0 };
  if (C.popCap - C.pop <= 1 && jobs.want > C.pop - 2 && G.buildings.filter((b) => b.type === 'cottage' && b.state === 'site').length === 0) place('cottage');
  // food: when stocks fall, plant more
  
  if (eco.foodMinutes(G) < 8 && G.buildings.filter((b) => b.type === 'farm' && b.state === 'site').length === 0) {
    place('farm', owned('millbrook') ? 'millbrook' : H) || place('farm', H);
  }
  // richer farms when food runs short
  if (eco.foodMinutes(G) < 10) {
    const f = G.buildings.find((b) => b.type === 'farm' && b.state === 'built' && b.level === 1 && !b.upgrading);
    if (f && act.upgrade(f.id).ok) say('upgrade farm');
  }
  // townhouses once parts flow
  if (built('bakery') && (home().res.parts || 0) > 30) {
    const c = G.buildings.find((b) => b.type === 'cottage' && b.state === 'built' && b.level === 1 && !b.upgrading);
    if (c && act.upgrade(c.id).ok) say('upgrade cottage to townhouse');
  }
  // storage: anything at cap -> warehouse
  const p = home();
  if (Object.entries(p.res).some(([r, n]) => n >= p.cap[r] - 1 && ['wood', 'stone', 'planks', 'iron'].includes(r)) && G.buildings.filter((b) => b.type === 'warehouse' && b.state === 'site').length === 0 && p.cap.wood < 1500 && G.t - (tend.wh || -999) > 120) {
    if (place('warehouse')) tend.wh = G.t;
  }
  // research: keep the scholars busy along the path to the Skyforge
  if (!G.research.current && G.t > 60) {
    const av = new Set(research.available(G));
    const next = CRIT.find((id) => av.has(id));
    if (next) study(next);
  }
}

// ---- run --------------------------------------------------------------------------
const milestones = {};
const mark = (k) => { if (milestones[k] == null) { milestones[k] = G.t; say(`** ${k}`); } };
const samples = [];
const stallTime = {};
const steps = Math.round(HOURS * 3600 / DT);
let blocked = '', blockedSince = 0;
for (let i = 0; i < steps; i++) {
  step1();
  forgeStep(DT);
  for (const b of G.buildings) if (b.stall && b.stall !== 'off') stallTime[b.type + ':' + b.stall] = (stallTime[b.type + ':' + b.stall] || 0) + DT;
  if (i % 150 === 0) { // every 5 s
    tend();
    for (const [label, done, doIt] of PLAN) {
      if (done()) continue;
      if (!doIt() && !done()) {
        if ((lastErr || '').startsWith('no spot')) continue; // no room anywhere: skip it
        if (blocked !== label) { blocked = label; blockedSince = G.t; }
        break;
      }
    }
    if (built('lumber') && built('quarry') && built('sawmill') && G.colony.popCap >= 8 && G.colony.pop >= 8) mark('chapter 1 (lumber, quarry, sawmill, house 8)');
    if (built('lumber') && built('quarry') && G.colony.pop >= 8) mark('lumber + quarry + 8 settlers');
    if (built('farm') && built('windmill') && built('bakery')) mark('bread chain');
    if (G.links.some((l) => l.state === 'built')) mark('first bridge');
    if (G.colony.pop >= 30) mark('30 settlers');
    if ((G.tmp.made?.[eco.homeRoot(G)]?.iron || 0) > 0.5) mark('iron flowing');
    if ((G.tmp.made?.[eco.homeRoot(G)]?.parts || 0) > 0.5) mark('parts flowing');
    if (G.colony.pop >= 80) mark('80 settlers');
    if ((G.tmp.made?.[eco.homeRoot(G)]?.skystone || 0) > 0.5) mark('skystone flowing');
    if ((G.tmp.made?.[eco.homeRoot(G)]?.aether || 0) > 0.3) mark('aether flowing');
    const sky = G.buildings.find((b) => b.type === 'skyforge');
    if (sky && sky.state === 'built') mark('skyforge foundation');
    for (let s = 1; s <= 5; s++) if (sky && sky.level >= s) mark('skyforge stage ' + s);
    if (sky && sky.level >= 5) break;
  }
  if (i % (30 * 300) === 0) {
    const p = home(), r = G.tmp.rates?.[eco.homeRoot(G)] || {};
    samples.push({ t: G.t, pop: G.colony.pop, cap: G.colony.popCap, happy: +G.colony.happiness.toFixed(2), coin: Math.round(G.colony.coin), insight: Math.round(G.colony.insight),
      res: Object.fromEntries(Object.entries(p.res).map(([k, v]) => [k, Math.round(v)])), rate: { ...r }, buildings: G.buildings.length, blocked: blocked ? `${blocked} (${lastErr})` : '' });
  }
}

console.log('\n==== milestones (game mm:ss at 1x) ====');
for (const [k, t] of Object.entries(milestones)) console.log(`${mmss(t)}  ${k}`);
console.log('\n==== research done ====\n' + G.research.done.join(', '));
console.log('\n==== samples every in-game day (5 min) ====');
for (const s of samples) {
  console.log(`${mmss(s.t)} pop ${s.pop}/${s.cap} happy ${s.happy} coin ${s.coin} ins ${s.insight} bld ${s.buildings} | ` +
    ['wood', 'planks', 'stone', 'grain', 'bread', 'ore', 'coal', 'iron', 'parts', 'skystone', 'aether'].map((k) => `${k} ${s.res[k]}${s.rate[k] ? '(' + (s.rate[k] > 0 ? '+' : '') + s.rate[k] + ')' : ''}`).join(' ') + (s.blocked ? ` | waiting: ${s.blocked}` : ''));
}
console.log('\n==== gross production / consumption per min at the end (home network) ====');
const hr = eco.homeRoot(G);
for (const r of Object.keys(G.tmp.made?.[hr] || {})) { const m = G.tmp.made[hr][r], u = G.tmp.used[hr][r]; if (m > 0.05 || u > 0.05) console.log(`  ${r.padEnd(9)} +${m.toFixed(1)} -${u.toFixed(1)}`); }
console.log('  coin/insight', JSON.stringify(G.tmp.rates.colony));
console.log('\n==== stalls (building-seconds) ====');
for (const [k, t] of Object.entries(stallTime).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${k.padEnd(28)} ${Math.round(t)}`);
console.log(`\nend ${mmss(G.t)}  pop ${G.colony.pop}/${G.colony.popCap}  happiness ${G.colony.happiness.toFixed(2)}  buildings ${G.buildings.length}  links ${G.links.length}  last wait: ${blocked} (${lastErr})`);
console.log('happiness factors', JSON.stringify(G.tmp.happy));
console.log('counts', JSON.stringify(Object.fromEntries([...new Set(G.buildings.map((b) => b.type))].map((t) => [t, count(t)]))));
