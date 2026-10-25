// Small shared helpers for the PROGRESSION modules (research, fleet, trade,
// chart, goals): find a network's pool, check and pay costs, add goods.
// Coin and insight are colony-wide (G.colony); settlers come from G.colony.pop;
// everything else lives in the pool of an island's network (G.pools[root]).
import * as economy from './economy.js';

export const COLONY_RES = new Set(['coin', 'insight']);

export const rootOf = (G, island) => (G.tmp && G.tmp.netOf && G.tmp.netOf[island]) || island;
export const homeRoot = (G) => rootOf(G, 'hearthrock');
export const poolOf = (G, root) => G.pools[root] || null;

export function have(G, res, root = homeRoot(G)) {
  if (COLONY_RES.has(res)) return G.colony[res] || 0;
  if (res === 'settlers') return Math.floor(G.colony.pop || 0);
  const p = poolOf(G, root);
  return p ? (p.res[res] || 0) : 0;
}

export function capOf(G, res, root = homeRoot(G)) {
  if (COLONY_RES.has(res) || res === 'settlers') return Infinity;
  const p = poolOf(G, root);
  const c = p && p.cap ? p.cap[res] : undefined;
  return c == null ? Infinity : c;
}

// What is missing to pay `cost` from `root`: [] when affordable.
export function missing(G, cost, root = homeRoot(G)) {
  const out = [];
  for (const [res, n] of Object.entries(cost || {})) {
    if (!(n > 0)) continue;
    const h = have(G, res, root);
    if (h + 1e-9 < n) out.push({ res, need: n, have: h });
  }
  return out;
}

export function canPay(G, cost, root) { return missing(G, cost, root).length === 0; }

export function pay(G, cost, root = homeRoot(G)) {
  if (!canPay(G, cost, root)) return false;
  for (const [res, n] of Object.entries(cost || {})) {
    if (!(n > 0)) continue;
    if (COLONY_RES.has(res)) G.colony[res] = (G.colony[res] || 0) - n;
    else if (res === 'settlers') G.colony.pop = Math.max(0, (G.colony.pop || 0) - n);
    else { const p = poolOf(G, root); p.res[res] = Math.max(0, (p.res[res] || 0) - n); }
  }
  return true;
}

// Add n (may be negative) of res to `root`'s pool, clamped to [0, cap]. Returns the amount moved.
export function gain(G, res, n, root = homeRoot(G)) {
  if (!n) return 0;
  if (COLONY_RES.has(res)) { const before = G.colony[res] || 0; G.colony[res] = Math.max(0, before + n); return G.colony[res] - before; }
  if (res === 'settlers' || res === 'pop') { const before = G.colony.pop || 0; G.colony.pop = Math.max(0, before + n); return G.colony.pop - before; }
  let p = poolOf(G, root);
  if (!p) { if (n < 0) return 0; p = G.pools[root] = { res: {}, cap: {} }; }
  const before = p.res[res] || 0;
  const cap = p.cap && p.cap[res] != null ? p.cap[res] : Infinity;
  const after = Math.max(0, Math.min(Math.max(cap, before), before + n));
  p.res[res] = after;
  return after - before;
}

// Free room for res in a pool.
export function room(G, res, root) { return Math.max(0, capOf(G, res, root) - have(G, res, root)); }

export function costText(cost) {
  return Object.entries(cost || {}).filter(([, n]) => n > 0).map(([r, n]) => `${Math.ceil(n)} ${r}`).join(', ');
}

export function notify(G, text, kind = 'info', icon = null, extra = {}) {
  G.log.push({ t: G.t, kind, text, icon });
  if (G.log.length > 50) G.log.splice(0, G.log.length - 50);
  G.bus.emit('notify', { text, kind, icon, ...extra });
}

export const builtOf = (G, type) => G.buildings.filter((b) => b.type === type && b.state === 'built');
export const islandById = (G, id) => G.islands.find((i) => i.id === id) || null;
export const owned = (G) => G.islands.filter((i) => i.owned);

// Centre of an island in world tiles.
export function islandCentre(i) { return { x: i.ox + i.w / 2, y: i.oy + i.h / 2, z: i.alt || 0 }; }

export function bump(G, key, n = 1) {
  const t = G.stats.totals || (G.stats.totals = {});
  t[key] = (t[key] || 0) + n;
  return t[key];
}

// Pay for something on island `island`: ECONOMY's payFor when present (it may
// ship goods from the home network by airship freight), else the island's pool.
export function payOn(G, island, cost, opts = {}) {
  if (typeof economy.payFor === 'function') { const r = economy.payFor(G, island, cost, opts); return !!(r && r.ok); }
  return pay(G, cost, rootOf(G, island));
}
export function missingOn(G, island, cost, opts = {}) {
  if (typeof economy.payPlan === 'function') {
    const p = economy.payPlan(G, island, cost, opts);
    if (p.ok) return [];
    const root = rootOf(G, island);
    return p.missing.map((res) => ({ res, need: cost[res], have: have(G, res, root) }));
  }
  return missing(G, cost, rootOf(G, island));
}

// True on the step where G.t crosses a multiple of `period`. Periodic work keyed
// to G.t (which is saved) instead of a timer on G.tmp, so a reloaded colony runs
// its checks on exactly the same ticks as the original.
export function every(G, period, dt) {
  return Math.floor(G.t / period + 1e-9) !== Math.floor((G.t - dt) / period + 1e-9);
}
