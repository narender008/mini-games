// Headless balance check for THREATS (weather, raids, combat, defence).
//   node games/skyforge/dev/threats-check.mjs [seeds=8]
// Founds a colony (through ECONOMY's sim when it can place buildings, else a
// hand-built one with the same layout), then runs raids and storms with and
// without defences and prints a table. Deterministic per seed.
import { createGame, snapshot, restore } from '../src/state.js';
import { initSim, hydrateSim, tick, MODULES } from '../src/sim/index.js';
import { applyPreset } from '../src/presets.js';
import { makeActions } from '../src/sim/actions.js';
import { BUILDINGS } from '../src/content/buildings.js';
import { ISLANDS } from '../src/content/islands.js';
import * as raids from '../src/sim/raids.js';
import * as weather from '../src/sim/weather.js';
import * as defence from '../src/sim/defence.js';
import { DT } from '../src/config.js';

const SEEDS = +(process.argv[2] || 8);
const REAL = process.argv.includes('--real');
const RES = ['wood', 'planks', 'stone', 'grain', 'flour', 'bread', 'ore', 'coal', 'iron', 'parts', 'skystone', 'aether'];
const HOME = ['hearthrock', 'millbrook', 'pinecrest', 'orespur', 'kilnshelf'];

// ---- a colony -------------------------------------------------------------------------
const LAYOUT = [
  ['townhall', 'hearthrock', 12, 9], ['warehouse', 'hearthrock', 16, 9], ['cottage', 'hearthrock', 8, 11], ['cottage', 'hearthrock', 9, 8],
  ['cottage', 'hearthrock', 15, 13], ['cottage', 'hearthrock', 11, 13], ['cottage', 'hearthrock', 18, 12], ['cottage', 'hearthrock', 7, 9],
  ['well', 'hearthrock', 10, 11], ['tavern', 'hearthrock', 14, 6], ['sawmill', 'hearthrock', 19, 8], ['bakery', 'hearthrock', 9, 5],
  ['academy', 'hearthrock', 4, 6], ['mooring', 'hearthrock', 23, 9], ['market', 'hearthrock', 16, 4],
  ['farm', 'millbrook', 5, 4], ['windmill', 'millbrook', 10, 6], ['cottage', 'millbrook', 3, 8],
  ['lumber', 'pinecrest', 5, 5], ['observatory', 'pinecrest', 8, 3],
  ['mine', 'orespur', 6, 6], ['coalpit', 'orespur', 10, 4], ['smelter', 'kilnshelf', 6, 5], ['workshop', 'kilnshelf', 10, 6],
];
const DEFENCE = [['harpoon', 'hearthrock', 3, 4], ['harpoon', 'hearthrock', 22, 5], ['harpoon', 'hearthrock', 13, 17], ['rod', 'hearthrock', 6, 14], ['rod', 'hearthrock', 19, 15]];
const FINAL = [['skyforge', 'glimmerreach', 8, 6], ['harpoon', 'glimmerreach', 3, 3], ['harpoon', 'glimmerreach', 15, 4], ['harpoon', 'glimmerreach', 9, 12], ['bastion', 'glimmerreach', 12, 9], ['rod', 'glimmerreach', 5, 10], ['mooring', 'glimmerreach', 17, 8]];

function found(seed, { difficulty = 'standard', chapter = 5, defences = false, final = false, research = [] } = {}) {
  const G = createGame({ seed, difficulty });
  initSim(G);
  G.goals.chapter = chapter;
  G.threat.chapterSeen = chapter; G.threat.raidChapter = chapter;
  if (!G.islands.length) {
    G.islands = ISLANDS.map((d) => ({ id: d.id, name: d.name, kind: d.kind, ox: d.ox, oy: d.oy, alt: d.alt, w: d.w, h: d.h, biome: d.biome, owned: false, discovered: true, scouted: true, cells: '' }));
  }
  for (const i of G.islands) i.owned = HOME.includes(i.id) || (final && i.id === 'glimmerreach');
  G.buildings = [];
  const add = ([type, island, u, v]) => G.buildings.push({ id: G.nextId++, type, island, u, v, level: 1, state: 'built', progress: 1, fire: 0, workers: 1, want: 1, on: true, eff: 1, stall: null, buf: {} });
  LAYOUT.forEach(add);
  if (defences) DEFENCE.forEach(add);
  if (final) FINAL.forEach(add);
  G.links = [
    { id: G.nextId++, kind: 'bridge', a: 'hearthrock', b: 'millbrook', au: 1, av: 15, bu: 14, bv: 3, state: 'built', hp: 100 },
    { id: G.nextId++, kind: 'cable', a: 'hearthrock', b: 'pinecrest', au: 14, av: 20, bu: 4, bv: 1, state: 'built', hp: 100 },
    { id: G.nextId++, kind: 'bridge', a: 'hearthrock', b: 'orespur', au: 2, av: 1, bu: 12, bv: 11, state: 'built', hp: 100 },
    { id: G.nextId++, kind: 'cable', a: 'hearthrock', b: 'kilnshelf', au: 25, av: 6, bu: 1, bv: 5, state: 'built', hp: 100 },
  ];
  G.pools = { hearthrock: { res: Object.fromEntries(RES.map((r) => [r, 150])), cap: Object.fromEntries(RES.map((r) => [r, 400])) } };
  G.tmp.netOf = Object.fromEntries(G.islands.map((i) => [i.id, i.owned ? 'hearthrock' : i.id]));
  if (final) G.pools.hearthrock.res.aether = 60;
  Object.assign(G.colony, { pop: 60, popCap: 70, workers: 50, idle: 6, coin: 800, insight: 0 });
  G.research.done = [...research]; delete G.tmp.bonus;  // PROGRESSION caches research bonuses
  G.weather.kind = 'clear'; G.weather.until = G.t + 1e6; G.weather.plan = [];  // calm unless a test sets it
  return G;
}

const tot = (G) => RES.reduce((s, r) => s + (G.pools.hearthrock.res[r] || 0), 0);

function run(G, maxS, until, policy) {
  const n = Math.round(maxS / DT);
  let i = 0;
  for (; i < n; i++) {
    tick(G);
    if (policy && i % 15 === 0) policy(G);
    if (until && until(G)) break;
  }
  return i * DT;
}

const abilities = (G) => {
  if (!G.pirates.some((p) => p.state !== 'down' && p.state !== 'gone')) return;
  for (const a of ['volley', 'lash', 'shield', 'militia']) if (G.tmp.abilities?.[a]?.ready) defence.defend(G, a);
};

function raidCase(seed, o, strength, policy) {
  const G = found(seed, o);
  const before = tot(G);
  let fires = 0, links = 0; G.bus.on('fire:start', () => fires++); G.bus.on('link:broken', () => links++);
  const r = raids.startRaid(G, strength, { now: true });
  if (!r.ok) throw new Error(r.error);
  const ships = G.pirates.length;
  const t = run(G, 600, (g) => !g.raid, policy);
  // let fires burn out
  run(G, 120, (g) => !g.buildings.some((b) => b.fire > 0));
  const rep = G.threat.lastReport || {};
  return {
    ships, downed: rep.downed ?? 0, time: Math.round(t), lost: Math.round(before - tot(G)),
    ruined: G.buildings.filter((b) => b.state === 'ruin').length, damaged: G.buildings.filter((b) => b.state === 'built' && b.hp < b.maxHp).length,
    fires, links, result: rep.result, lines: rep.lines,
  };
}

function stormCase(seed, o, power, secs) {
  const G = found(seed, o);
  let strikes = 0, rods = 0, hits = 0, fires = 0;
  G.bus.on('lightning', (e) => { strikes++; if (e.rod) rods++; else if (e.target) hits++; });
  G.bus.on('fire:start', () => fires++);
  if (o.warned !== false) Object.assign(G.threat, { stormWarned: true, harmStorms: 1 });   // storm season under way
  weather.startStorm(G, power);
  G.weather.until = G.t + secs;
  run(G, secs + 90);
  return { strikes, rods, hits, fires, ruined: G.buildings.filter((b) => b.state === 'ruin').length, charge: +G.defend.lash.charge.toFixed(2) };
}

function finalCase(seed, o, policy) {
  const G = found(seed, { ...o, final: true });
  let down = false; G.bus.on('pirate:down', (e) => { if (e.kind === 'dreadnought') down = true; });
  raids.startFinal(G);
  // like PROGRESSION: if it withdrew, it comes back a day later
  let back = null, visits = 1;
  const again = (g) => { if (policy) policy(g); if (!g.raid && !down) { if (back == null) { back = g.t + 300; for (const b of g.buildings) if (b.state === 'ruin') { b.state = 'built'; b.hp = b.maxHp; } } else if (g.t >= back) { back = null; visits++; raids.startFinal(g); } } };
  const t = run(G, 2400, () => down, again);
  return { won: down, time: Math.round(t), visits, ruined: G.buildings.filter((b) => b.state === 'ruin').length, sky: G.buildings.find((b) => b.type === 'skyforge').state };
}

function schedule(seed, difficulty) {
  // chapters advance every 5 days; count storms and raids per chapter, no defences, abilities off
  const G = found(seed, { difficulty, chapter: 1, defences: true, research: ['harpoons', 'rods'] });
  G.weather.until = 0; weather.hydrate(G);
  const by = {}; const first = { storm: null, raid: null };
  G.bus.on('storm:start', () => { const c = G.goals.chapter; (by[c] = by[c] || { storms: 0, raids: 0 }).storms++; first.storm ??= c; });
  G.bus.on('raid:start', () => { const c = G.goals.chapter; (by[c] = by[c] || { storms: 0, raids: 0 }).raids++; first.raid ??= c; });
  for (let d = 0; d < 40; d++) {
    G.goals.chapter = Math.min(7, 1 + Math.floor(d / 5));
    run(G, 300);
    // keep the colony standing for the next chapter (this is a scheduling test)
    for (const b of G.buildings) { if (b.state === 'ruin') b.state = 'built'; b.hp = b.maxHp; b.fire = 0; }
    for (const l of G.links) { l.state = 'built'; l.hp = 100; }
  }
  return { by, first };
}

function det(seed) {
  const a = found(seed, { defences: true, research: ['harpoons', 'rods'] }), b = found(seed, { defences: true, research: ['harpoons', 'rods'] });
  for (const G of [a, b]) { raids.startRaid(G, 1.4, { now: true }); weather.startStorm(G, 0.8); run(G, 200, null, abilities); }
  const h = (G) => JSON.stringify(snapshot(G));
  return h(a) === h(b);
}

// Save mid-raid in a storm, restore, run both on: the threat modules alone must agree.
function saveLoad(seed) {
  const mine = [weather, raids, defence, MODULES.combat];
  const step = (G) => { G.t += DT; for (const m of mine) m.step(G, DT); };
  const A = found(seed, { defences: true, research: ['harpoons', 'rods', 'militia'] });
  raids.startRaid(A, 1.3, { now: true }); weather.startStorm(A, 0.9);
  for (let i = 0; i < 750; i++) step(A);
  const B = restore(JSON.parse(JSON.stringify(snapshot(A)))); B.tmp = { netOf: A.tmp.netOf };
  for (const m of mine) m.hydrate(B);
  for (let i = 0; i < 2700; i++) { step(A); step(B); if (i % 15 === 0 && A.defend.sumT === 0) { abilities(A); abilities(B); } }
  return JSON.stringify(snapshot(A)) === JSON.stringify(snapshot(B));
}

// ---- a colony grown by the autopilot (ECONOMY + PROGRESSION sims running) ------------------
function realBase(seed) {
  const G = createGame({ seed }); initSim(G);
  const r = applyPreset(G, 'mid', null);
  return { data: JSON.stringify(snapshot(G)), chapter: r.chapter };
}
function realColony(base, defences) {
  const G = restore(JSON.parse(base.data)); hydrateSim(G);
  G.tmp.quiet = true;
  if (defences) {
    MODULES.research.unlock?.(G, 'harpoons'); MODULES.research.unlock?.(G, 'rods');
    const act = makeActions(() => G);
    const placed = [];
    for (const type of ['harpoon', 'harpoon', 'harpoon', 'rod', 'rod']) {
      const sp = act.spots(type, 'hearthrock') || [];
      let best = null, bd = -1;
      for (const [u, v] of sp) {
        const d = Math.min(99, ...placed.filter((x) => x.type === type).map((x) => Math.hypot(x.u - u, x.v - v)));
        if (d > bd) { bd = d; best = [u, v]; }
      }
      if (!best) continue;
      for (const [r, n] of Object.entries(BUILDINGS.find((b) => b.id === type).cost)) MODULES.economy.give?.(G, r, n + 2);
      if (act.build(type, 'hearthrock', ...best).ok) placed.push({ type, u: best[0], v: best[1] });
    }
    run(G, 240);
  }
  delete G.tmp.quiet;
  G.raid = null; G.pirates = []; G.shots = [];
  G.weather.kind = 'clear'; G.weather.until = G.t + 1e6; G.weather.plan = [];
  return G;
}
const homeStock = (G) => { const r = (G.tmp.netOf && G.tmp.netOf.hearthrock) || 'hearthrock'; return RES.reduce((s, k) => s + (G.pools[r]?.res?.[k] || 0), 0); };
function realRaid(base, defences, strength, policy) {
  const G = realColony(base, defences);
  const nDef = G.buildings.filter((b) => ['harpoon', 'rod'].includes(b.type) && b.state === 'built').length;
  let fires = 0; G.bus.on('fire:start', () => fires++);
  const before = homeStock(G);
  raids.startRaid(G, strength, { now: true });
  const ships = G.pirates.length;
  const t = run(G, 600, (g) => !g.raid, policy);
  const rep = G.threat.lastReport || {};
  return { nDef, ships, downed: rep.downed ?? 0, time: Math.round(t), lost: Math.round(rep.lines?.reduce((s, l) => s + (l.n < 0 && l.res ? -l.n : 0), 0) || 0),
    ruined: G.buildings.filter((b) => b.state === 'ruin').length, damaged: G.buildings.filter((b) => b.state === 'built' && b.hp < b.maxHp).length, fires, links: G.links.filter((l) => l.state === 'broken').length,
    pop: G.colony.pop, stockDelta: Math.round(homeStock(G) - before) };
}

export { found, run, abilities };
const MAIN = import.meta.url === 'file://' + process.argv[1] || process.argv[1]?.endsWith('threats-check.mjs');
if (MAIN) await report();
async function report() {
// ---- report ------------------------------------------------------------------------------
const avg = (xs, k) => +(xs.reduce((s, x) => s + (typeof x[k] === 'boolean' ? +x[k] : x[k]), 0) / xs.length).toFixed(2);
const seeds = Array.from({ length: SEEDS }, (_, i) => 101 + i * 17);
const rows = [];
function row(name, results, keys) {
  const r = { case: name };
  for (const k of keys) r[k] = avg(results, k);
  r.worst = Math.max(...results.map((x) => x.ruined ?? 0));
  rows.push(r);
}
const RK = ['ships', 'downed', 'time', 'lost', 'ruined', 'damaged', 'fires', 'links'];
const DEF = { defences: true, research: ['harpoons', 'rods'] };
row('raid x1 unprepared', seeds.map((s) => raidCase(s, {}, 1)), RK);
row('raid x1 prepared', seeds.map((s) => raidCase(s, DEF, 1)), RK);
row('raid x1 prepared+abilities', seeds.map((s) => raidCase(s, DEF, 1, abilities)), RK);
row('raid x1.6 unprepared', seeds.map((s) => raidCase(s, {}, 1.6)), RK);
row('raid x1.6 prepared+abilities', seeds.map((s) => raidCase(s, DEF, 1.6, abilities)), RK);
row('raid x1 breezy unprepared', seeds.map((s) => raidCase(s, { difficulty: 'breezy' }, 1)), RK);
row('raid x1.4 squall prepared', seeds.map((s) => raidCase(s, { ...DEF, difficulty: 'squall' }, 1.4, abilities)), RK);
console.table(rows);

const SK = ['strikes', 'rods', 'hits', 'fires', 'ruined', 'charge'];
const srows = [];
for (const [name, o] of [['storm 0.8 before rods research', { warned: false }], ['storm 0.8 no rods', {}], ['storm 0.8 with rods', DEF], ['storm 0.8 breezy', { difficulty: 'breezy' }]]) {
  const rs = seeds.map((s) => stormCase(s, o, 0.8, 120));
  const r = { case: name }; for (const k of SK) r[k] = avg(rs, k); srows.push(r);
}
console.table(srows);

const frows = [];
for (const [name, o, p] of [['final prepared+abilities', { defences: true, research: ['harpoons', 'rods', 'shields', 'militia', 'bastion'] }, abilities], ['final batteries only', { defences: true, research: ['harpoons', 'rods'] }, null]]) {
  const rs = seeds.slice(0, 4).map((s) => finalCase(s, o, p));
  frows.push({ case: name, won: avg(rs, 'won'), visits: avg(rs, 'visits'), time: avg(rs, 'time'), ruined: avg(rs, 'ruined'), sky: rs.map((x) => x.sky).join(',') });
}
console.table(frows);

for (const d of ['breezy', 'standard', 'squall']) {
  const s = schedule(seeds[0], d);
  console.log(d, 'first storm ch', s.first.storm, 'first raid ch', s.first.raid, JSON.stringify(s.by));
}
console.log('deterministic:', det(seeds[0]), '| save/load mid-raid continues identically (threat modules):', saveLoad(seeds[0]));
if (REAL) {
  const t0 = Date.now();
  const bases = seeds.slice(0, 3).map((s) => realBase(s));
  console.log('real colonies grown by the autopilot: chapters', bases.map((b) => b.chapter).join(','), 'in', Math.round((Date.now() - t0) / 1000), 's');
  const rr = [];
  for (const [name, d, st, p] of [['real x1 unprepared', false, 1], ['real x1 prepared', true, 1], ['real x1 prepared+abilities', true, 1, abilities], ['real x1.6 unprepared', false, 1.6], ['real x1.6 prepared+abilities', true, 1.6, abilities]]) {
    const res = []; for (const b of bases) for (let k = 0; k < 2; k++) res.push(realRaid(b, d, st, p));
    const r = { case: name }; for (const k of ['nDef', 'ships', 'downed', 'time', 'lost', 'ruined', 'damaged', 'fires', 'links', 'pop']) r[k] = avg(res, k);
    r.worstRuined = Math.max(...res.map((x) => x.ruined)); rr.push(r);
  }
  console.table(rr);
}
const ex = raidCase(seeds[0], {}, 1);
console.log('sample report (unprepared):', ex.result, ex.lines.map((l) => l.text + ' ' + l.value).join(' | '));
}
