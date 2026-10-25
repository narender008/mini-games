// ECONOMY: storage pools per island network, workers, production chains, food,
// housing, happiness, immigration, taxes and upkeep. Deterministic and
// headless (no DOM, Date or Math.random); node can import it.
//
// Pools. Owned islands joined by built links form a network that shares one
// pool G.pools[root] = { res: {id: n}, cap: {id: n} }. root is 'hearthrock'
// for the home network, else the first island of the network in G.islands
// order. Coin and insight are colony-wide on G.colony.coin / G.colony.insight.
// refresh(G) rebuilds networks (merging pools when links join them and
// splitting them by storage share when links break); step() calls it by
// itself whenever owned islands or built links change.
//
// Derived (G.tmp, rebuilt by hydrate):
//   netOf {islandId: root}            for owned islands
//   rates {root: {res: net per min}}  smoothed; coin/insight also on the home root and on rates.colony
//   made / used {root: {res: per min}} gross production / consumption (chain panels)
//   occ {islandId: Int32Array(w*h)}    building id per cell, 0 = free (sim/islands.js keeps it)
//   happy [{ id, label, v }]           happiness factors for the UI; food = G.econ.food { need, fed, bread, grain }
//   stats                               colony totals (cap, wells, taverns, upkeep, immigration...)
// Saved sim state of this module lives on G.econ (see freshEcon).
//   jobs { want, builders }            demand totals
// Workers: every settler works; jobs are filled each second by priority
// (food first when stocks are low, then construction up to a share of the
// colony, then suppliers of whatever a building is stalled on, then the rest,
// oldest first). Builders are idle settlers sent to sites, upgrades and repairs.
import { CFG } from '../config.js';
import { BY_ID } from '../content/buildings.js';
import { LINK_BY_ID } from '../content/buildings.js';
import { POOLED, RESOURCES } from '../content/resources.js';
import { HOME } from '../content/islands.js';
import * as research from './research.js';

const E = () => CFG.economy;
const FOOD = Object.fromEntries(RESOURCES.filter((r) => r.food).map((r) => [r.id, r.food]));
const COLONY_RES = new Set(['coin', 'insight']);
const FOOD_TYPES = new Set(['farm', 'windmill', 'bakery']);
const DEFENCE_TYPES = new Set(['harpoon', 'bastion', 'shieldgen', 'rod']);
const RESERVE = new Set(['wood', 'planks', 'stone', 'iron', 'parts', 'skystone']);
const NAMES = Object.fromEntries(RESOURCES.map((r) => [r.id, r.name.toLowerCase()]));

// ---- research hooks (PROGRESSION's module, with fallbacks) ---------------------
export function has(G, id) {
  if (!id) return true;
  if (typeof research.has === 'function') { try { return !!research.has(G, id); } catch (e) { /* fall through */ } }
  return G.research.done.includes(id);
}
export function bonus(G, key) {
  if (typeof research.bonus === 'function') { try { const v = research.bonus(G, key); if (typeof v === 'number') return v; } catch (e) { /* fall through */ } }
  let s = 0;
  for (const id of G.research.done) { const b = E().bonusFallback[id]; if (b && b[key]) s += b[key]; }
  return s;
}
function boost(G, kind) {
  const list = G.colony.boosts; if (!list || !list.length) return 0;
  let s = 0; for (const b of list) if (b.kind === kind && (b.until == null || b.until > G.t)) s += b.v || 0;
  return s;
}

// ---- small helpers -------------------------------------------------------------
export const def = (type) => BY_ID[type];
export const islandOf = (G, id) => G.islands.find((i) => i.id === id);
export function rootOf(G, islandId) {
  if (!G.tmp.netOf) refresh(G);
  return G.tmp.netOf[islandId] || null;
}
export function poolOf(G, islandId) { const r = rootOf(G, islandId); return r ? G.pools[r] : null; }
export function homeRoot(G) { return (G.tmp.netOf && G.tmp.netOf[HOME]) || HOME; }
export function isNight(G) { const [a, b] = E().night; return G.tod >= a || G.tod < b; }
// smooth 0..1 night amount (for rates; avoids a hard step at dusk)
export function nightAmt(G) {
  const [a, b] = E().night, t = G.tod, ramp = 0.03;
  if (t >= a + ramp || t < b - ramp) return 1;
  if (t >= a) return (t - a) / ramp;
  if (t < b) return (b - t) / ramp;
  return 0;
}
export function envMul(G, env) {
  const m = E().env[env || 'none'] || E().env.none;
  let k = 1 - (1 - m.night) * nightAmt(G);
  const w = G.weather || {};
  if (w.kind === 'storm') k *= 1 - (1 - m.storm) * Math.min(1, Math.max(0.3, w.power || 0.7));
  else if (w.kind === 'rain') k *= m.rain;
  else if (w.kind === 'fog') k *= m.fog;
  return k;
}
export function maxWorkers(G, b) {
  const d = def(b.type); if (!d) return 0;
  let n = d.workers || 0;
  for (const L of d.levels || []) if (L.level <= b.level && L.workers) n += L.workers;
  if (n > 0 && d.tab === 'industry') n = Math.max(1, Math.ceil(n * (1 - Math.min(0.5, bonus(G, 'staff')))));
  return n;
}
function levelVal(d, b, key, base) {
  let v = base;
  for (const L of d.levels || []) if (L.level <= b.level && L[key] != null) v = key === 'mul' ? v * L[key] : v + L[key];
  return v;
}
export const housingOf = (b) => { const d = def(b.type); return d ? levelVal(d, b, 'housing', d.housing || 0) : 0; };
export const storageOf = (b) => { const d = def(b.type); return d ? levelVal(d, b, 'storage', d.storage || 0) : 0; };
export const levelMul = (b) => { const d = def(b.type); return d ? levelVal(d, b, 'mul', 1) : 1; };
export const servesOf = (b) => { const d = def(b.type); return d ? levelVal(d, b, 'serves', d.serves || 0) : 0; };
export const isBurning = (b) => (b.fire || 0) > 0.02;
export const isDamaged = (b) => b.state === 'ruin' || isBurning(b) || (b.maxHp > 0 && b.hp / b.maxHp < E().damagedAt);
export const needsBuilders = (b) => b.state === 'site' || !!b.upgrading || !!b.repairing;
const working = (b) => b.state === 'built' && b.on !== false && !b.stall;

export function notify(G, text, kind = 'info', icon = null, at = null) {
  const n = { text, kind, icon, island: at?.island ?? null, u: at?.u ?? null, v: at?.v ?? null };
  G.log.push({ t: G.t, kind, text, icon });
  if (G.log.length > 50) G.log.splice(0, G.log.length - 50);
  G.bus.emit('notify', n);
}
// warn at most once per CFG.economy.notifyEvery for the same key
export function warnOnce(G, key, text, kind = 'warn', icon = null, at = null) {
  const T = (G.tmp.warned = G.tmp.warned || {});
  if (T[key] != null && G.t - T[key] < E().notifyEvery) return;
  T[key] = G.t;
  notify(G, text, kind, icon, at);
}

// ---- costs -------------------------------------------------------------------
// Payment for something on island `islandId`: from its network pool; an island
// outside the home network may be supplied from the home pool by airship freight
// when the home network has a built mooring (or always, with `convoy`).
export function payPlan(G, islandId, cost, { convoy = false } = {}) {
  const root = rootOf(G, islandId);
  const home = homeRoot(G);
  const local = root ? G.pools[root] : null;
  const missing = [];
  for (const [r, n] of Object.entries(cost || {})) {
    if (!n) continue;
    if (COLONY_RES.has(r)) { if ((G.colony[r] || 0) < n - 1e-9) missing.push(r); }
  }
  const goods = Object.entries(cost || {}).filter(([r, n]) => n && !COLONY_RES.has(r));
  const enough = (p) => p && goods.every(([r, n]) => (p.res[r] || 0) >= n - 1e-9);
  let from = null;
  if (enough(local)) from = root;
  else if (root !== home && G.pools[home] && (convoy || hasMooring(G, home)) && enough(G.pools[home])) from = home;
  if (!from) {
    const p = local || G.pools[home];
    for (const [r, n] of goods) if (!p || (p.res[r] || 0) < n - 1e-9) missing.push(r);
  }
  return { ok: missing.length === 0, from, missing };
}
export function hasMooring(G, root) {
  return G.buildings.some((b) => b.type === 'mooring' && b.state === 'built' && G.tmp.netOf?.[b.island] === root);
}
export function canPayFor(G, islandId, cost, opts) { return payPlan(G, islandId, cost, opts).ok; }
export function payFor(G, islandId, cost, opts) {
  const plan = payPlan(G, islandId, cost, opts);
  if (!plan.ok) return { ok: false, error: missingText(G, islandId, cost, plan.missing) };
  for (const [r, n] of Object.entries(cost || {})) {
    if (!n) continue;
    if (COLONY_RES.has(r)) G.colony[r] -= n;
    else { G.pools[plan.from].res[r] -= n; ledger(G, plan.from, r, -n, false); }
  }
  return { ok: true, from: plan.from };
}
export function missingText(G, islandId, cost, missing) {
  const p = poolOf(G, islandId) || G.pools[homeRoot(G)];
  const parts = missing.map((r) => {
    const have = COLONY_RES.has(r) ? (G.colony[r] || 0) : (p ? p.res[r] || 0 : 0);
    return `${Math.ceil(cost[r] - have)} more ${NAMES[r] || r}`;
  });
  return 'Need ' + parts.join(', ');
}
// add goods to a pool (clamped to cap unless `over`), returns what went in
export function addTo(G, root, r, n, over = false) {
  if (COLONY_RES.has(r)) { G.colony[r] = (G.colony[r] || 0) + n; ledger(G, homeRoot(G), r, n, true); return n; }
  const p = G.pools[root]; if (!p) return 0;
  const room = over ? Infinity : Math.max(0, (p.cap[r] ?? Infinity) - (p.res[r] || 0));
  const k = Math.min(n, room);
  p.res[r] = (p.res[r] || 0) + k;
  ledger(G, root, r, k, true);
  return k;
}
export function refund(G, islandId, cost, frac) {
  const root = rootOf(G, islandId) || homeRoot(G);
  for (const [r, n] of Object.entries(cost || {})) if (n) addTo(G, root, r, Math.floor(n * frac), true);
}

// Cheat / test hook and PROGRESSION's way to add goods. Goods go to `root` (a
// pool root or any island id; default the home network), ignoring the cap.
export function give(G, res, n, root) {
  if (!G || !res) return { ok: false };
  if (typeof res === 'object') { for (const [k, v] of Object.entries(res)) give(G, k, v, root); return { ok: true }; }
  n = +n || 0;
  if (COLONY_RES.has(res)) { G.colony[res] = Math.max(0, (G.colony[res] || 0) + n); return { ok: true }; }
  if (!POOLED.includes(res)) return { ok: false, error: 'unknown resource ' + res };
  let r = root ? (G.pools[root] ? root : rootOf(G, root)) : homeRoot(G);
  if (!r || !G.pools[r]) r = homeRoot(G);
  const p = G.pools[r]; if (!p) return { ok: false };
  p.res[res] = Math.max(0, (p.res[res] || 0) + n);
  return { ok: true };
}

// ---- networks and pools -------------------------------------------------------
function topoKey(G) {
  let k = '';
  for (const i of G.islands) if (i.owned) k += i.id + ',';
  k += '|';
  for (const l of G.links) if (l.state === 'built') k += l.a + '-' + l.b + ',';
  return k;
}
function emptyRes() { return Object.fromEntries(POOLED.map((r) => [r, 0])); }

export function computeNets(G) {
  const owned = G.islands.filter((i) => i.owned).map((i) => i.id);
  const parent = Object.fromEntries(owned.map((id) => [id, id]));
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const l of G.links) if (l.state === 'built' && parent[l.a] && parent[l.b]) parent[find(l.a)] = find(l.b);
  const comps = {};
  for (const id of owned) (comps[find(id)] = comps[find(id)] || []).push(id);
  const netOf = {};
  for (const members of Object.values(comps)) {
    const root = members.includes(HOME) ? HOME : members[0];
    for (const m of members) netOf[m] = root;
  }
  return netOf;
}

function islandStorage(G, islandId) {
  let s = 0;
  for (const b of G.buildings) if (b.island === islandId && b.state === 'built') s += storageOf(b);
  return s;
}

// Rebuild networks; merge or split pools to match. Safe to call any time.
export function refresh(G) {
  const old = G.tmp.netOf || null;
  const netOf = computeNets(G);
  const roots = [...new Set(Object.values(netOf))];
  const same = old
    ? Object.keys(old).length === Object.keys(netOf).length && Object.keys(netOf).every((k) => old[k] === netOf[k])
    : Object.keys(G.pools).length === roots.length && roots.every((r) => G.pools[r]); // loaded game: pools already match
  if (!same) {
    // which islands fed each existing pool
    const members = {};
    for (const key of Object.keys(G.pools)) members[key] = [];
    if (old) { for (const [i, r] of Object.entries(old)) if (members[r]) members[r].push(i); }
    else for (const [i, r] of Object.entries(netOf)) if (members[r]) members[r].push(i);
    for (const key of Object.keys(members)) if (!members[key].length && netOf[key]) members[key].push(key);
    const fresh = Object.fromEntries(roots.map((r) => [r, { res: emptyRes(), cap: {} }]));
    for (const [key, isl] of Object.entries(members)) {
      const pool = G.pools[key]; if (!pool) continue;
      // share this pool between the new networks its islands now belong to, by storage
      // (a pool whose islands all stay together moves over whole)
      const shares = {};
      for (const i of isl) { const nr = netOf[i]; if (!nr) continue; shares[nr] = (shares[nr] || 0) + islandStorage(G, i) + 1; }
      const tot = Object.values(shares).reduce((a, b) => a + b, 0);
      if (!tot) { // its islands were all lost: goods go home
        const h = netOf[HOME] || roots[0]; if (h) for (const r of POOLED) fresh[h].res[r] += pool.res[r] || 0;
        continue;
      }
      const keys = Object.keys(shares);
      if (keys.length === 1) { for (const r of POOLED) fresh[keys[0]].res[r] += pool.res[r] || 0; continue; }
      for (const [nr, w] of Object.entries(shares)) for (const r of POOLED) fresh[nr].res[r] += (pool.res[r] || 0) * w / tot;
    }
    G.pools = fresh;
  }
  G.tmp.netOf = netOf;
  G.tmp.topo = topoKey(G);
  recomputeCaps(G);
  return { ok: true };
}

export function recomputeCaps(G) {
  const netOf = G.tmp.netOf || {};
  const extra = 1 + bonus(G, 'storage');
  const base = {};
  for (const r of Object.keys(G.pools)) base[r] = 50;
  for (const b of G.buildings) {
    if (b.state !== 'built') continue;
    const root = netOf[b.island]; if (!root || base[root] == null) continue;
    base[root] += storageOf(b);
  }
  for (const [root, p] of Object.entries(G.pools)) {
    const c = Math.round(base[root] * extra);
    for (const r of POOLED) p.cap[r] = c;
  }
}

// ---- ledger and rates -------------------------------------------------------------
function ledger(G, root, r, n, isMade) {
  const L = (G.tmp.ledger = G.tmp.ledger || { made: {}, used: {}, t: 0 });
  const side = isMade ? L.made : L.used;
  const m = (side[root] = side[root] || {});
  m[r] = (m[r] || 0) + Math.abs(n);
}
function flushRates(G, dt) {
  const L = G.tmp.ledger; if (!L) return;
  L.t += dt;
  if (L.t < 2) return;
  const k = 60 / L.t, a = 0.35;
  const rates = (G.tmp.rates = G.tmp.rates || {}), made = (G.tmp.made = G.tmp.made || {}), used = (G.tmp.used = G.tmp.used || {});
  const home = homeRoot(G);
  const roots = new Set([...Object.keys(G.pools), 'colony']);
  for (const root of roots) {
    const mk = (made[root] = made[root] || {}), us = (used[root] = used[root] || {}), rt = (rates[root] = rates[root] || {});
    const ids = root === 'colony' ? ['coin', 'insight'] : POOLED;
    for (const r of ids) {
      const src = root === 'colony' ? home : root;
      const pm = (L.made[src]?.[r] || 0) * k, pu = (L.used[src]?.[r] || 0) * k;
      mk[r] = (mk[r] ?? pm) + (pm - (mk[r] ?? pm)) * a;
      us[r] = (us[r] ?? pu) + (pu - (us[r] ?? pu)) * a;
      rt[r] = Math.round((mk[r] - us[r]) * 10) / 10;
    }
  }
  for (const r of ['coin', 'insight']) { rates[home] = rates[home] || {}; rates[home][r] = rates.colony[r]; }
  for (const root of Object.keys(rates)) if (root !== 'colony' && !G.pools[root]) { delete rates[root]; delete made[root]; delete used[root]; }
  G.tmp.ledger = { made: {}, used: {}, t: 0 };
}

// ---- workers ---------------------------------------------------------------------
function allocate(G) {
  const pop = G.colony.pop | 0;
  const netOf = G.tmp.netOf || {};
  const foodLow = foodMinutes(G) < E().food.lowMinutes;
  const short = new Set(G.econ.short || []);
  const raid = G.raid && G.raid.phase !== 'warn';
  const jobs = [];
  for (const b of G.buildings) {
    b.workers = 0;
    if (!netOf[b.island]) continue; // not owned any more
    const d = def(b.type); if (!d) continue;
    if (needsBuilders(b)) {
      if (b.state === 'ruin' && !b.repairing) continue;
      jobs.push({ o: b, want: b.repairing ? Math.max(1, d.builders || 1) : (d.builders || 1), prio: 0, build: true, id: b.id });
      continue;
    }
    if (b.state !== 'built' || b.on === false || isDamaged(b)) continue;
    const mw = maxWorkers(G, b);
    if (b.type === 'skyforge' && !b.forge) continue;
    if (mw <= 0) continue;
    const want = Math.min(mw, b.want ?? mw);
    if (want <= 0) continue;
    let prio = 50;
    if (FOOD_TYPES.has(b.type)) prio = foodLow ? 95 : 56;
    else if (DEFENCE_TYPES.has(b.type)) prio = raid ? 90 : 30;
    else if (b.type === 'academy' || b.type === 'observatory') prio = 48;
    else if (b.type === 'tavern' || b.type === 'market') prio = 46;
    else if (b.type === 'skyforge') prio = 60;
    if (b.type !== 'skyforge' && d.produces && Object.keys(d.produces).some((r) => short.has(r))) prio = Math.max(prio, 65);
    if (b.stall && b.stall.startsWith('input:')) prio -= 8; // starved: less urgent than its suppliers
    if (b.stall === 'storage') prio = 5;                      // stores full: hands are better used elsewhere
    jobs.push({ o: b, want, prio, id: b.id });
  }
  for (const l of G.links) {
    if (l.state !== 'site' || !netOf[l.a]) continue;
    l.workers = 0;
    jobs.push({ o: l, want: LINK_BY_ID[l.kind]?.builders || 2, prio: 0, build: true, id: l.id });
  }
  // construction: the oldest sites first, up to a share of the colony
  const cap = Math.max(2, Math.ceil(pop * E().builderShare));
  let budget = cap;
  for (const j of jobs.filter((x) => x.build).sort((a, b) => a.id - b.id)) {
    j.prio = budget > 0 ? 70 : 12;
    budget -= j.want;
  }
  jobs.sort((a, b) => b.prio - a.prio || a.id - b.id);
  let left = pop, builders = 0, want = 0;
  for (const j of jobs) {
    want += j.want;
    const n = Math.min(j.want, left);
    j.o.workers = n; left -= n;
    if (j.build) builders += n;
  }
  G.colony.workers = pop - left;
  G.colony.idle = left;
  G.tmp.jobs = { want, builders, open: Math.max(0, want - pop) };
}

// ---- food ----------------------------------------------------------------------
function foodStock(G) {
  let s = 0;
  for (const p of Object.values(G.pools)) for (const [r, f] of Object.entries(FOOD)) s += (p.res[r] || 0) * f;
  return s;
}
export function foodMinutes(G) {
  const need = (G.colony.pop || 0) * E().food.perSettler;
  return need > 0 ? foodStock(G) / need : Infinity;
}
function eat(G, dt) {
  const pop = G.colony.pop || 0;
  const units = pop * E().food.perSettler / 60 * dt;
  const home = homeRoot(G);
  const order = [home, ...Object.keys(G.pools).filter((r) => r !== home)];
  let breadUnits = units * E().food.breadShare, got = 0, gotBread = 0, gotGrain = 0;
  const take = (r, u) => {
    let left = u;
    for (const root of order) {
      if (left <= 1e-12) break;
      const p = G.pools[root], have = (p.res[r] || 0) * FOOD[r];
      const k = Math.min(have, left);
      if (k > 0) { p.res[r] -= k / FOOD[r]; ledger(G, root, r, -k / FOOD[r], false); left -= k; }
    }
    return u - left;
  };
  gotBread = take('bread', breadUnits);
  gotGrain = take('grain', units - gotBread);
  if (gotBread + gotGrain < units) gotBread += take('bread', units - gotBread - gotGrain);
  got = gotBread + gotGrain;
  const F = (G.econ.food = G.econ.food || { fed: 1, bread: 0, grain: 1 });
  const a = 1 - Math.exp(-dt / 20);
  const fed = units > 0 ? got / units : 1;
  F.fed += (fed - F.fed) * a;
  F.bread += ((units > 0 ? gotBread / units : 0) - F.bread) * a;
  F.grain += ((units > 0 ? gotGrain / units : 0) - F.grain) * a;
  F.need = pop * E().food.perSettler;
}

// ---- production -------------------------------------------------------------------
function produce(G, dt) {
  const netOf = G.tmp.netOf;
  const H = E();
  const happyK = H.happyEff[0] + (H.happyEff[1] - H.happyEff[0]) * (G.colony.happiness ?? 0.5);
  const prodAll = 1 + bonus(G, 'production') + boost(G, 'production');
  const short = new Set();
  const gains = (G.tmp.gain = G.tmp.gain || {});
  for (const b of G.buildings) {
    const d = def(b.type);
    const root = netOf[b.island];
    if (!d || !root || b.state !== 'built') { if (b.state !== 'built') { b.eff = 0; } continue; }
    const prodKeys = Object.keys(d.produces || {});
    const isProducer = prodKeys.length > 0 || Object.keys(d.consumes || {}).length > 0;
    let stall = null;
    const mw = maxWorkers(G, b);
    if (b.on === false) stall = 'off';
    else if (isDamaged(b)) stall = 'damaged';
    else if (mw > 0 && b.type !== 'skyforge' && (b.workers || 0) <= 0) stall = 'workers';
    if (b.type === 'skyforge') { b.eff = b.forge ? Math.max(0.25, (b.workers || 0) / Math.max(1, mw)) : 0; setStall(G, b, b.forge && !b.workers ? 'workers' : null); continue; }
    if (!isProducer || stall) {
      b.eff = stall ? 0 : (mw > 0 ? (b.workers || 0) / mw : 1);
      setStall(G, b, stall);
      continue;
    }
    const pool = G.pools[root];
    const staff = mw > 0 ? (b.workers || 0) / mw : 1;
    let mul = levelMul(b) * envMul(G, d.env) * happyK * Math.max(0.6, b.maxHp ? 0.6 + 0.4 * b.hp / b.maxHp : 1);
    if (b.type === 'lumber') { const [full, lo, hi] = H.lumberForest; mul *= Math.min(hi, Math.max(lo, (b.forest || 0) / full)); }
    if (d.wind && G.weather && (G.weather.kind === 'breeze' || G.weather.kind === 'storm')) mul *= 1.15;
    const vent = b.vent && d.vent;
    if (vent) mul *= d.vent.mul;
    const k = staff * mul * dt / 60;
    // inputs: refill buffers from the pool, then see how much we can run
    let ratio = 1, lacking = null;
    const buf = (b.buf = b.buf || {});
    for (const [r, rate] of Object.entries(d.consumes || {})) {
      if (vent && d.vent.noCoal && r === 'coal') continue;
      const target = rate * levelMul(b) * H.buffer;
      const have = buf[r] || 0;
      if (have < target) {
        // chains leave a reserve of building materials for construction
        const keep = RESERVE.has(r) ? Math.min(H.reserveMax, (pool.cap[r] || 0) * H.reserve) : 0;
        const take = Math.min(target - have, Math.max(0, (pool.res[r] || 0) - keep));
        if (take > 0) { pool.res[r] -= take; buf[r] = have + take; ledger(G, root, r, -take, false); }
      }
      const need = rate * k;
      if (need > 0) { const q = (buf[r] || 0) / need; if (q < ratio) { ratio = q; lacking = r; } }
    }
    ratio = Math.max(0, Math.min(1, ratio));
    // outputs: room in storage
    let room = 1, anyPooled = false;
    for (const r of prodKeys) {
      if (COLONY_RES.has(r)) { room = 1; anyPooled = false; break; }
      anyPooled = true;
      const out = d.produces[r] * k * (1 + bonus(G, 'prod:' + r)) * prodAll;
      const space = (pool.cap[r] ?? Infinity) - (pool.res[r] || 0);
      room = Math.min(room, out > 0 ? Math.max(0, space / out) : 1);
    }
    if (anyPooled && room <= 0.001) { b.eff = 0; setStall(G, b, 'storage'); continue; }
    const run = Math.min(ratio, anyPooled ? Math.min(1, room) : 1);
    if (run < 0.5 && lacking) { stall = 'input:' + lacking; short.add(lacking); }
    if (run > 0) {
      for (const [r, rate] of Object.entries(d.consumes || {})) {
        if (vent && d.vent.noCoal && r === 'coal') continue;
        buf[r] = Math.max(0, (buf[r] || 0) - rate * k * run);
      }
      for (const r of prodKeys) {
        let out = d.produces[r] * k * run * (1 + bonus(G, 'prod:' + r)) * prodAll;
        if (r === 'coin' && d.coinPerSettler) out += d.coinPerSettler * (G.colony.pop || 0) * (G.colony.happiness ?? 0.5) * staff * dt / 60;
        const got = addTo(G, root, r, out);
        const g = (gains[b.id] = gains[b.id] || { n: 0, t: G.t, res: r });
        g.n += got; g.res = r;
        if (G.t - g.t >= H.gainEvery && g.n >= 1) {
          G.bus.emit('res:gain', { res: r, n: Math.floor(g.n), island: b.island, u: b.u + (d.size[0] - 1) / 2, v: b.v + (d.size[1] - 1) / 2 });
          g.n -= Math.floor(g.n); g.t = G.t;
        }
      }
    }
    b.eff = Math.max(0, Math.min(1, staff * run * Math.min(1, mul)));
    setStall(G, b, stall);
  }
  G.econ.short = [...short];
}

const STALL_TEXT = {
  workers: (d) => `${d.name} has no workers: house more settlers`,
  storage: (d) => `${d.name} stopped: storage is full (build a warehouse)`,
};
function setStall(G, b, why) {
  if (b.stall === why) return;
  b.stall = why;
  if (!why || why === 'off') return;
  G.bus.emit('stall', { b, why });
  const d = def(b.type);
  const at = { island: b.island, u: b.u, v: b.v };
  if (why.startsWith('input:')) {
    const r = why.slice(6);
    warnOnce(G, 'stall:' + b.type + ':' + r, `${d.name} needs ${NAMES[r] || r}`, 'warn', r, at);
  } else if (STALL_TEXT[why] && G.t > 20) {
    warnOnce(G, 'stall:' + why + ':' + (why === 'storage' ? '' : b.type), STALL_TEXT[why](d), 'warn', b.type, at);
  }
}

// ---- happiness, population, taxes -----------------------------------------------
function colonyStats(G) {
  const netOf = G.tmp.netOf;
  let cap = 0, cottages = 0, townhouses = 0, thHousing = 0, wells = 0, taverns = 0, markets = 0, damaged = 0, upkeep = 0, immig = 0, moorings = 0;
  for (const b of G.buildings) {
    if (!netOf[b.island]) continue;
    const d = def(b.type); if (!d) continue;
    if (b.state === 'built' || (b.state === 'ruin' && false)) {
      const hs = housingOf(b);
      if (!isBurning(b) && b.state === 'built') cap += hs;
      if (b.type === 'cottage') { if (b.level >= 2) { townhouses++; thHousing += hs; } else cottages++; }
      if (b.on !== false) upkeep += d.upkeep || 0;
      if (b.type === 'well' && !isDamaged(b)) wells += servesOf(b);
      if (b.type === 'tavern' && working(b)) taverns += servesOf(b);
      if (b.type === 'market' && working(b)) markets += servesOf(b);
      if (b.type === 'townhall') immig += levelVal(d, b, 'immigration', d.immigration || 0);
      if (b.type === 'mooring' && !isDamaged(b)) { immig += d.immigration || 0; moorings++; }
    }
    if (b.state === 'ruin' || isBurning(b) || (b.maxHp && b.hp < b.maxHp * 0.7)) damaged++;
  }
  return { cap, cottages, townhouses, thHousing, wells, taverns, markets, damaged, upkeep, immig, moorings };
}

function people(G, dt, S) {
  const H = E().happy, C = G.colony, pop = C.pop || 0;
  C.popCap = S.cap;
  C.housing = { cottage: S.cottages, townhouse: S.townhouses, townhall: 1 };
  const F = G.econ.food || { fed: 1, bread: 0, grain: 1 };
  const per = Math.max(1, pop);
  const f = [];
  const add = (id, label, v) => { if (Math.abs(v) > 0.0005) f.push({ id, label, v: Math.round(v * 1000) / 1000 }); };
  add('base', 'Life in the sky', H.base);
  add('bread', 'Fresh bread', H.bread * Math.min(1, F.bread / E().food.breadShare));
  if (F.bread > 0.05 && F.grain > 0.05) add('variety', 'Varied meals', H.variety);
  if (F.fed < 0.98) add('hungry', 'Hunger', H.hungry * (1 - F.fed) * 2);
  add('tavern', 'Taverns', H.tavern * Math.min(1, S.taverns / per));
  add('well', 'Wells', H.well * Math.min(1, S.wells / per));
  add('market', 'Market', H.market * Math.min(1, S.markets / per));
  if (S.cap > 0) add('townhouse', 'Townhouses', H.townhouse * Math.min(1, S.thHousing / S.cap * 2));
  add('damaged', 'Damaged buildings', Math.max(H.damagedMax, H.damaged * S.damaged));
  if (G.weather?.kind === 'storm') add('storm', 'Storm', H.storm * Math.max(0.5, G.weather.power || 1));
  if (G.raid && G.raid.phase && G.raid.phase !== 'warn') add('raid', 'Pirate raid', H.raid);
  if (G.econ.debt) add('debt', 'Unpaid upkeep', H.debt);
  if (pop > S.cap) add('crowded', 'Overcrowding', H.crowded);
  const res = bonus(G, 'happiness') + boost(G, 'happiness');
  if (res) add('bonus', 'Blessings', res);
  let target = f.reduce((s, x) => s + x.v, 0);
  target = Math.max(H.min, Math.min(1, target));
  C.happiness = (C.happiness ?? 0.6) + (target - (C.happiness ?? 0.6)) * (1 - Math.exp(-dt / H.tau));
  G.tmp.happy = f; G.tmp.happyTarget = target;

  // arrivals and departures
  const Gr = E().growth;
  const h = C.happiness;
  const starving = F.fed < 0.5;
  if (pop < S.cap && h >= Gr.minHappy && !starving) {
    const k = Math.min(1.5, Math.max(0.25, (h - 0.3) / 0.4));
    const rate = Gr.perMin * Math.max(0.5, S.immig) * k * (1 + bonus(G, 'growth') + boost(G, 'growth'));
    C.growth = (C.growth || 0) + rate / 60 * dt;
    if (C.growth >= 1) {
      const n = Math.min(Math.floor(C.growth), S.cap - pop);
      C.growth -= n; C.pop += n;
      if (n > 0) {
        G.bus.emit('pop:arrive', { n });
        const before = Math.floor((C.pop - n) / 25), after = Math.floor(C.pop / 25);
        if (after > before) notify(G, `${C.pop} settlers now call ${C.name || 'the colony'} home`, 'good', 'settler');
      }
    }
  } else if (pop >= S.cap) C.growth = Math.min(C.growth || 0, 0.99);
  const leaving = pop > S.cap ? 1 / 4 : (h < Gr.leaveHappy || starving) ? 1 / Gr.leaveEvery : 0;
  if (leaving && pop > Gr.minPop) {
    G.econ.leave = (G.econ.leave || 0) + leaving * dt;
    if (G.econ.leave >= 1) {
      G.econ.leave -= 1; C.pop -= 1;
      G.bus.emit('pop:leave', { n: 1 });
      warnOnce(G, 'leave', starving ? 'Settlers are leaving: they are hungry' : pop > S.cap ? 'Settlers are leaving: not enough homes' : 'Settlers are leaving: they are unhappy', 'bad', 'settler');
    }
  } else G.econ.leave = 0;
  if (starving && pop > 0) warnOnce(G, 'hunger', 'Food has run out: build farms, a windmill and a bakery', 'bad', 'bread');
  else if (foodMinutes(G) < 3 && pop > 0 && G.t > 30) warnOnce(G, 'foodlow', 'Food is running low', 'warn', 'grain');

  // taxes and upkeep (coin)
  const T = E().tax;
  const tax = (C.pop || 0) * T.perSettler * (T.happyMin + h) / 60 * dt;
  C.coin = (C.coin || 0) + tax;
  ledger(G, homeRoot(G), 'coin', tax, true);
  const up = S.upkeep / 60 * dt;
  if (C.coin >= up) { C.coin -= up; ledger(G, homeRoot(G), 'coin', -up, false); G.econ.debt = false; }
  else { ledger(G, homeRoot(G), 'coin', -C.coin, false); C.coin = 0; if (S.upkeep > 0) { G.econ.debt = true; warnOnce(G, 'debt', 'The treasury is empty: upkeep goes unpaid', 'bad', 'coin'); } }
}

// ---- module API ------------------------------------------------------------------
export function init(G) {
  const S = E().start;
  G.colony.pop = S.pop;
  G.colony.coin = S.coin;
  G.colony.insight = S.insight;
  G.colony.happiness = 0.6;
  G.colony.growth = 0;
  G.colony.boosts = G.colony.boosts || [];
  G.pools = {};
  G.econ = freshEcon();
  G.tmp.netOf = null;
  refresh(G);
  const home = G.pools[HOME];
  if (home) for (const [r, n] of Object.entries(S.res)) home.res[r] = n;
  G.colony.popCap = colonyStats(G).cap;
}

export function hydrate(G) {
  G.tmp.netOf = null;
  refresh(G);
  G.econ = { ...freshEcon(), ...(G.econ || {}) };
  G.tmp.ledger = { made: {}, used: {}, t: 0 };
  G.tmp.rates = G.tmp.rates || {};
  G.tmp.stats = colonyStats(G);
  G.colony.popCap = G.tmp.stats.cap;
  if (G.econ.allocT <= 0) allocate(G);
}
// Sim state of this module that must survive a save (so a loaded game runs on
// exactly like one that never stopped): next staffing tick, food eaten lately,
// goods in short supply, leaver countdown, unpaid upkeep.
function freshEcon() { return { allocT: 0, short: [], food: { fed: 1, bread: 0, grain: 1, need: 0 }, leave: 0, debt: false }; }
// re-staff on the next step (after building, demolishing, toggling...)
export function restaff(G) { if (G.econ) G.econ.allocT = 0; }

export function step(G, dt) {
  if (G.tmp.topo !== topoKey(G)) refresh(G);
  // drop expired boosts
  if (G.colony.boosts && G.colony.boosts.length) G.colony.boosts = G.colony.boosts.filter((b) => b.until == null || b.until > G.t);
  if (!G.econ) G.econ = freshEcon();
  G.econ.allocT -= dt;
  if (G.econ.allocT <= 0) {
    G.econ.allocT = Math.max(0, G.econ.allocT) + E().allocEvery;
    recomputeCaps(G);
    allocate(G);
  }
  produce(G, dt);
  eat(G, dt);
  const S = colonyStats(G);
  G.tmp.stats = S; G.tmp.food = G.econ.food;
  people(G, dt, S);
  flushRates(G, dt);
}
