// ECONOMY: islands, cells, placement rules, build / demolish / upgrade /
// repair / toggle / staff, and construction over time.
//
// A building at (u, v) covers cells u..u+w-1, v..v+d-1 of its island (size
// [w, d] in content/buildings.js); (u, v) is its front-left cell. Placement:
// every footprint cell on an owned island, on land, free, and not rock (r),
// water (w) or forest (t); deposit cells (s o c k h x) only take the
// buildings that use them (smelters may also sit on heat vents). Deposit,
// `near`, `edge` and `exact` rules are in each building's `place`.
// Costs are paid up front (economy.payFor); the building appears as a site
// (state 'site', progress 0..1) that idle settlers build (b.workers are its
// builders, assigned by economy). Upgrades keep the building working while
// builders work on b.upgrading = { to, progress, time }; repairs set
// b.repairing and heal hp. The Skyforge's stages are PROGRESSION's
// (goals.forgeUpgrade); see content/buildings.js.
//
// G.tmp.occ[islandId] is an Int32Array(w*h) of building ids (0 = free).
import { CFG } from '../config.js';
import { BY_ID } from '../content/buildings.js';
import { ISLANDS, genCells, findFalls, HOME, HOME_CLUSTER } from '../content/islands.js';
import { newId } from '../state.js';
import * as eco from './economy.js';
import * as goals from './goals.js';

const E = () => CFG.economy;
const DEPOSITS = new Set(['s', 'o', 'c', 'k', 'h', 'x']);
const BLOCKED = new Set([' ', 'r', 'w', 't']);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const cellAt = (I, u, v) => (u < 0 || v < 0 || u >= I.w || v >= I.h ? ' ' : I.cells[v * I.w + u]);
export function buildingAt(G, islandId, u, v) {
  const I = eco.islandOf(G, islandId); const o = G.tmp.occ?.[islandId];
  if (!I || !o || u < 0 || v < 0 || u >= I.w || v >= I.h) return null;
  const id = o[v * I.w + u];
  return id ? G.buildings.find((b) => b.id === id) || null : null;
}
export function footprint(b) { const d = BY_ID[b.type]; return d ? d.size : [1, 1]; }

function maxHpOf(type) {
  const d = BY_ID[type]; if (!d) return 100;
  if (d.hp) return d.hp;
  const C = CFG.threats?.combat;
  if (C?.hpByType?.[type]) return C.hpByType[type];
  const area = d.size[0] * d.size[1];
  const bySize = C?.hpBySize || [140, 220, 360];
  return area <= 1 ? bySize[0] : area <= 4 ? bySize[1] : bySize[2];
}

function occMark(G, b, id) {
  const I = eco.islandOf(G, b.island); if (!I) return;
  const o = (G.tmp.occ = G.tmp.occ || {})[b.island] || (G.tmp.occ[b.island] = new Int32Array(I.w * I.h));
  const [w, d] = footprint(b);
  for (let v = b.v; v < b.v + d; v++) for (let u = b.u; u < b.u + w; u++) if (u >= 0 && v >= 0 && u < I.w && v < I.h) o[v * I.w + u] = id;
}

// A world lookup of land cells, for "faces open sky" checks across islands.
function worldLand(G, x, y, except) {
  for (const I of G.islands) {
    if (I.id === except) continue;
    const u = Math.floor(x - I.ox), v = Math.floor(y - I.oy);
    if (u >= 0 && v >= 0 && u < I.w && v < I.h && I.cells[v * I.w + u] !== ' ') return true;
  }
  return false;
}
// A rim cell faces open sky if a 4-neighbour is void and nothing else is out there for a few tiles.
function opensToSky(G, I, u, v) {
  for (const [du, dv] of N4) {
    if (cellAt(I, u + du, v + dv) !== ' ') continue;
    let clear = true;
    for (let s = 1; s <= E().edgeOpen && clear; s++) {
      if (cellAt(I, u + du * s, v + dv * s) !== ' ' && s > 1) clear = false;
      if (worldLand(G, I.ox + u + du * s + 0.5, I.oy + v + dv * s + 0.5, I.id)) clear = false;
    }
    if (clear) return true;
  }
  return false;
}

function countNear(I, u0, v0, w, d, ch, r) {
  let n = 0;
  for (let v = v0 - r; v < v0 + d + r; v++) for (let u = u0 - r; u < u0 + w + r; u++) {
    if (u >= u0 && u < u0 + w && v >= v0 && v < v0 + d) continue;
    if (cellAt(I, u, v) === ch) n++;
  }
  return n;
}

const LABEL = { s: 'a stone outcrop', o: 'an ore seam', c: 'a coal seam', k: 'crystals', h: 'a heat vent', f: 'fertile soil', x: 'the ancient ruin', t: 'forest' };

// Placement only (no cost): { ok, error }
function placeCheck(G, type, islandId, u, v) {
  const d = BY_ID[type];
  if (!d) return { ok: false, error: 'Unknown building' };
  if (d.buildable === false) return { ok: false, error: `${d.name} cannot be built` };
  const I = eco.islandOf(G, islandId);
  if (!I) return { ok: false, error: 'Unknown island' };
  if (!I.owned) return { ok: false, error: `${I.name} is not yours yet` };
  if (d.needs && !eco.has(G, d.needs)) return { ok: false, error: 'Needs research', needs: d.needs };
  if (d.req && !G.buildings.some((b) => b.type === d.req && b.state === 'built')) return { ok: false, error: `Build a ${BY_ID[d.req]?.name || d.req} first` };
  const count = G.buildings.filter((b) => b.type === type).length;
  if (d.unique && count >= 1) return { ok: false, error: `Only one ${d.name}` };
  if (d.max && count >= d.max) return { ok: false, error: `At most ${d.max} ${d.name}s` };
  u = u | 0; v = v | 0;
  const [w, dd] = d.size, P = d.place || {};
  const occ = G.tmp.occ?.[islandId];
  let onCount = 0, edge = false;
  for (let y = v; y < v + dd; y++) for (let x = u; x < u + w; x++) {
    const c = cellAt(I, x, y);
    if (c === ' ') return { ok: false, error: 'Off the island' };
    if (BLOCKED.has(c)) return { ok: false, error: c === 't' ? 'Forest is in the way' : c === 'w' ? 'Water is in the way' : 'Rocks are in the way' };
    if (occ && occ[y * I.w + x]) return { ok: false, error: 'Something is already there' };
    if (DEPOSITS.has(c) && c !== P.on && !(c === 'h' && P.vent)) return { ok: false, error: `Keep ${LABEL[c]} for the building that uses it` };
    if (P.on && c === P.on) onCount++;
    if (P.edge && !edge && opensToSky(G, I, x, y)) edge = true;
  }
  if (P.on && onCount < (P.min || 1)) return { ok: false, error: `Must sit on ${LABEL[P.on]}` };
  if (P.near && countNear(I, u, v, w, dd, P.near.cell, P.near.r) < P.near.min) return { ok: false, error: `Needs ${LABEL[P.near.cell]} nearby` };
  if (P.edge && !edge) return { ok: false, error: 'Must stand on the island rim, facing open sky' };
  return { ok: true };
}

export function canBuild(G, type, islandId, u, v) {
  const p = placeCheck(G, type, islandId, u, v);
  if (!p.ok) return { ...p, placeOk: false };
  const d = BY_ID[type];
  const plan = eco.payPlan(G, islandId, d.cost, { convoy: !!d.supply });
  if (!plan.ok) return { ok: false, placeOk: true, error: eco.missingText(G, islandId, d.cost, plan.missing) };
  return { ok: true, placeOk: true };
}

// Legal spots (placement rules only, ignoring cost) on one island, or on every
// owned island as [u, v, islandId] when islandId is omitted.
export function spots(G, type, islandId) {
  if (!G) return [];
  const list = islandId ? [eco.islandOf(G, islandId)].filter(Boolean) : G.islands.filter((i) => i.owned);
  const out = [];
  for (const I of list) {
    for (let v = 0; v < I.h; v++) for (let u = 0; u < I.w; u++) {
      if (placeCheck(G, type, I.id, u, v).ok) out.push(islandId ? [u, v] : [u, v, I.id]);
    }
  }
  return out;
}

function makeBuilding(G, type, islandId, u, v, built) {
  const d = BY_ID[type], I = eco.islandOf(G, islandId);
  const hp = maxHpOf(type);
  const b = {
    id: newId(G), type, island: islandId, u, v, level: type === 'skyforge' ? 0 : 1,
    state: built ? 'built' : 'site', progress: built ? 1 : 0, hp: built ? hp : Math.round(hp * 0.3), maxHp: hp, fire: 0,
    workers: 0, want: 0, on: true, eff: 0, stall: null, buf: {}, paid: { ...(d.cost || {}) },
  };
  b.want = eco.maxWorkers(G, b);
  const [w, dd] = d.size;
  if (d.vent) { let k = 0; for (let y = v; y < v + dd; y++) for (let x = u; x < u + w; x++) if (cellAt(I, x, y) === 'h') k++; b.vent = k > 0; }
  if (type === 'lumber') b.forest = countNear(I, u, v, w, dd, 't', d.place.near.r);
  return b;
}

export function build(G, type, islandId, u, v) {
  const c = canBuild(G, type, islandId, u, v);
  if (!c.ok) return c;
  const d = BY_ID[type];
  const paid = eco.payFor(G, islandId, d.cost, { convoy: !!d.supply });
  if (!paid.ok) return paid;
  const b = makeBuilding(G, type, islandId, u | 0, v | 0, false);
  G.buildings.push(b);
  occMark(G, b, b.id);
  eco.restaff(G); // staff the site on the next step
  G.bus.emit('build:placed', { b });
  return { ok: true, id: b.id };
}

const find = (G, id) => G.buildings.find((b) => b.id === id);

export function demolish(G, id) {
  const b = find(G, id); if (!b) return { ok: false, error: 'No such building' };
  const d = BY_ID[b.type];
  if (b.type === 'townhall' || b.type === 'skyforge') return { ok: false, error: `The ${d.name} cannot be demolished` };
  const frac = b.state === 'site' && b.progress < 0.02 ? 1 : E().demolishRefund;
  eco.refund(G, b.island, b.paid || d.cost, frac);
  occMark(G, b, 0);
  G.buildings.splice(G.buildings.indexOf(b), 1);
  eco.restaff(G);
  G.bus.emit('build:demolished', { b });
  return { ok: true, id };
}

export function upgrade(G, id) {
  const b = find(G, id); if (!b) return { ok: false, error: 'No such building' };
  const d = BY_ID[b.type];
  if (b.type === 'skyforge') {
    if (b.state !== 'built') return { ok: false, error: 'Finish the foundation first' };
    if (typeof goals.forgeUpgrade === 'function') return goals.forgeUpgrade(G, b);
    return { ok: false, error: 'The Skyforge stages are not ready' };
  }
  if (b.state !== 'built') return { ok: false, error: 'Not finished yet' };
  if (b.upgrading) return { ok: false, error: 'Already upgrading' };
  const L = (d.levels || []).find((x) => x.level === b.level + 1);
  if (!L) return { ok: false, error: 'Fully upgraded' };
  if (L.needs && !eco.has(G, L.needs)) return { ok: false, error: 'Needs research', needs: L.needs };
  if (L.req && !G.buildings.some((x) => x.type === L.req && x.state === 'built')) return { ok: false, error: `Needs a ${BY_ID[L.req]?.name || L.req}` };
  const paid = eco.payFor(G, b.island, L.cost);
  if (!paid.ok) return paid;
  for (const [r, n] of Object.entries(L.cost)) b.paid[r] = (b.paid[r] || 0) + n;
  b.upgrading = { to: L.level, progress: 0, time: L.time || 60 };
  eco.restaff(G);
  return { ok: true, id };
}

export function repairCost(G, b) {
  const d = BY_ID[b.type];
  const R = E().repair;
  const share = b.state === 'ruin' ? R.ruin : R.damage * Math.max(0.2, 1 - b.hp / b.maxHp) / 0.7;
  const out = {};
  for (const [r, n] of Object.entries(d.cost || {})) if (r !== 'coin') { const k = Math.ceil(n * share); if (k > 0) out[r] = k; }
  return out;
}

export function repair(G, id) {
  const b = find(G, id); if (!b) return { ok: false, error: 'No such building' };
  if (b.repairing) return { ok: false, error: 'Already being repaired' };
  if (b.state === 'site') return { ok: false, error: 'Still under construction' };
  if (b.state !== 'ruin' && b.hp >= b.maxHp) return { ok: false, error: 'Not damaged' };
  const cost = repairCost(G, b);
  const paid = eco.payFor(G, b.island, cost);
  if (!paid.ok) return paid;
  b.repairing = true;
  eco.restaff(G);
  return { ok: true, id };
}

export function toggle(G, id, on) {
  const b = find(G, id); if (!b) return { ok: false, error: 'No such building' };
  b.on = on == null ? !(b.on !== false) : !!on;
  eco.restaff(G);
  return { ok: true, id, on: b.on };
}

export function staff(G, id, n) {
  const b = find(G, id); if (!b) return { ok: false, error: 'No such building' };
  const mw = eco.maxWorkers(G, b);
  if (mw <= 0) return { ok: false, error: 'Needs no workers' };
  b.want = Math.max(0, Math.min(mw, Math.round(+n || 0)));
  eco.restaff(G);
  return { ok: true, id, want: b.want };
}

// ---- module API -------------------------------------------------------------------
export function init(G) {
  G.islands = ISLANDS.map((def) => {
    const cells = genCells(def);
    const home = HOME_CLUSTER.includes(def.id);
    return {
      id: def.id, name: def.name, kind: def.kind, ox: def.ox, oy: def.oy, alt: def.alt, w: def.w, h: def.h,
      cells, owned: def.id === HOME, discovered: home, scouted: home, seed: def.seed, biome: def.biome, drift: null,
      falls: findFalls(def, cells),
    };
  });
  G.buildings = [];
  G.tmp.occ = {};
  for (const def of ISLANDS) {
    const list = [];
    if (def.townhall) list.push({ type: 'townhall', u: def.townhall[0], v: def.townhall[1] });
    for (const s of def.start || []) list.push(s);
    for (const s of list) {
      const b = makeBuilding(G, s.type, def.id, s.u, s.v, true);
      G.buildings.push(b);
      occMark(G, b, b.id);
    }
  }
}

export function hydrate(G) {
  G.tmp.occ = {};
  for (const I of G.islands) G.tmp.occ[I.id] = new Int32Array(I.w * I.h);
  for (const b of G.buildings) occMark(G, b, b.id);
}

// construction, upgrades and repairs (builders were assigned by economy)
export function step(G, dt) {
  const envK = eco.envMul(G, 'build') * (1 + eco.bonus(G, 'buildSpeed'));
  for (const b of G.buildings) {
    if (!needsBuilders(b)) continue;
    const d = BY_ID[b.type]; if (!d) continue;
    const crew = Math.min(1, (b.workers || 0) / Math.max(1, d.builders || 1));
    if (b.state === 'site') {
      if (crew <= 0) continue;
      b.progress = Math.min(1, b.progress + dt / Math.max(1, d.time || 30) * crew * envK);
      b.hp = Math.max(b.hp, Math.round(b.maxHp * (0.3 + 0.7 * b.progress)));
      if (b.progress >= 1) {
        b.state = 'built'; b.progress = 1; b.hp = b.maxHp; b.workers = 0;
        b.want = eco.maxWorkers(G, b);
        eco.restaff(G);
        eco.recomputeCaps(G);
        G.bus.emit('build:done', { b });
        eco.notify(G, `${d.name} finished`, 'good', b.type, { island: b.island, u: b.u, v: b.v });
      }
    } else if (b.upgrading) {
      if (crew <= 0) continue;
      const U = b.upgrading;
      U.progress = Math.min(1, U.progress + dt / Math.max(1, U.time) * crew * envK);
      if (U.progress >= 1) {
        b.level = U.to; b.upgrading = null;
        b.want = eco.maxWorkers(G, b);
        eco.restaff(G);
        eco.recomputeCaps(G);
        G.bus.emit('build:upgraded', { b });
        const L = (d.levels || []).find((x) => x.level === b.level);
        eco.notify(G, `${L?.name || d.name} complete`, 'good', b.type, { island: b.island, u: b.u, v: b.v });
      }
    }
    if (b.repairing) {
      if (crew <= 0) continue;
      b.hp = Math.min(b.maxHp, b.hp + E().repair.heal * crew * dt);
      if (b.hp >= b.maxHp) {
        b.repairing = false;
        if (b.state === 'ruin') { b.state = 'built'; G.bus.emit('build:done', { b }); }
        b.fire = 0;
        eco.restaff(G);
      }
    }
  }
}
const needsBuilders = eco.needsBuilders;
