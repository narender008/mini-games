// The Sky Chart (PROGRESSION): discovery, scouting and claim expeditions flown by
// real ships, direct claims of nearby islands, the militia attack on Corsair Roost,
// and island drift (Levitation Engines / Island Drift).
//
// Expedition = { id, target, kind:'scout'|'claim'|'attack', ships:[ids], ship (lead ship id), escort: bool,
//                state:'out'|'onsite'|'back'|'done', t, eta (s), startedAt, result: null|{ ok, text, ... }, cost }
// island.drift = null | { x, y } target origin while it moves (ox/oy change smoothly).
// G.tmp.chart = { <islandId>: { dist, travel, danger, reachable, why, resources:[{res, n, dots}] } }
// Exports info(G, id) for the chart UI, expedition/claim/drift actions, claimAll cheat.
import { ISLANDS } from '../content/islands.js';
import { CHART } from '../content/ports.js';
import { CFG } from '../config.js';
import { has, isUnlocked, bonus } from './research.js';
import * as fleet from './fleet.js';
import * as economy from './economy.js';
import * as links from './links.js';
import { pay, missing, homeRoot, rootOf, notify, islandById, islandCentre, owned, bump, builtOf, costText } from './ledger.js';

const C = () => CFG.progression.chart;
const ISL = () => Object.fromEntries(ISLANDS.map((i) => [i.id, i]));
const HIDDEN = new Set(['mossback', 'whistlespire', 'sunkenbell']);
const SEEN = new Set(['emberrock', 'glimmerreach', 'corsairroost']);
const CELL_RES = { o: 'ore', c: 'coal', k: 'crystal', h: 'vents', f: 'fertile', t: 'forest', s: 'stone', w: 'water', x: 'ruin' };
export const RES_NAMES = { ore: 'Iron ore', coal: 'Coal seams', crystal: 'Skystone crystal', vents: 'Heat vents', fertile: 'Fertile soil', forest: 'Forest', stone: 'Stone outcrops', water: 'Fresh water', ruin: 'Ancient ruin' };

export function init(G) {
  G.expeditions = G.expeditions || [];
  for (const i of G.islands) {
    if (i.kind === 'home' || i.kind === 'islet' || i.owned) { i.discovered = true; i.scouted = true; }
    else if (HIDDEN.has(i.id)) { i.discovered = false; i.scouted = false; }
    else if (SEEN.has(i.id) || i.kind === 'roost') { i.discovered = true; i.scouted = !!i.scouted; }
    else { i.discovered = !!i.discovered; i.scouted = !!i.scouted; }
    if (i.drift === undefined) i.drift = null;
  }
}

export function hydrate(G) { G.tmp.chart = {}; G.tmp.chartT = 0; refreshInfo(G); }

// ---- geometry and dangers ------------------------------------------------------------
// Edge-to-edge gap (tiles) between two islands' rectangles.
export function gap(a, b) {
  const dx = Math.max(0, Math.max(a.ox, b.ox) - Math.min(a.ox + a.w, b.ox + b.w));
  const dy = Math.max(0, Math.max(a.oy, b.oy) - Math.min(a.oy + a.h, b.oy + b.h));
  return Math.hypot(dx, dy);
}
const nearestOwnedGap = (G, i) => Math.min(Infinity, ...owned(G).filter((o) => o !== i).map((o) => gap(o, i)));

export function inPirateWaters(G, i) {
  if (G.goals.flags.roostTaken) return false;
  const roost = islandById(G, CHART.pirateWaters.island);
  if (!roost || roost === i) return !!roost;
  const a = islandCentre(roost), b = islandCentre(i);
  return Math.hypot(a.x - b.x, a.y - b.y) <= CHART.pirateWaters.r;
}
export const behindTempest = (i) => i.id === CHART.tempestWall.island;

export function resourcesOf(i) {
  const n = {};
  for (const ch of i.cells || '') if (CELL_RES[ch]) n[CELL_RES[ch]] = (n[CELL_RES[ch]] || 0) + 1;
  const extra = ISL()[i.id]?.resources;
  const out = Object.entries(n).map(([res, k]) => ({ res, name: RES_NAMES[res], n: k, dots: k >= 14 ? 3 : k >= 6 ? 2 : 1 }));
  if (!out.length && Array.isArray(extra)) for (const r of extra) out.push({ res: r, name: RES_NAMES[r] || r, n: 0, dots: 2 });
  return out.sort((a, b) => b.n - a.n);
}

function nearestDock(G, to) {
  const docks = G.buildings.filter((b) => fleet.isDock(b) && islandById(G, b.island)?.owned);
  let best = null, d = Infinity;
  for (const b of docks) { const p = fleet.dockPos(G, b); const k = Math.hypot(p.x - to.x, p.y - to.y); if (k < d) { d = k; best = b; } }
  return best;
}

export function claimCost(G, i) {
  const c = ISL()[i.id]?.claimCost || i.claimCost || {};
  return { ...c };
}

// What the chart card shows for island `id`.
export function info(G, id) {
  const i = islandById(G, id); if (!i) return null;
  const c = islandCentre(i);
  const dock = nearestDock(G, c);
  const from = dock ? fleet.dockPos(G, dock) : islandCentre(islandById(G, 'hearthrock') || i);
  const travel = Math.round(fleet.travelTime(G, 'cargo', from, c));
  let danger = null, dangerText = null;
  if (i.id === CHART.pirateWaters.island && !G.goals.flags.roostTaken) { danger = 'roost'; dangerText = 'The Crimson Gale\'s stronghold: only militia airships can take it'; }
  else if (behindTempest(i) && !has(G, 'stormtaming')) { danger = 'storm'; dangerText = 'Behind the Tempest Wall: research Storm Taming'; }
  else if (inPirateWaters(G, i)) { danger = 'pirates'; dangerText = 'Corsair patrols nearby: send a militia escort or build a battery'; }
  const near = nearestOwnedGap(G, i);
  const direct = !i.owned && i.kind !== 'roost' && i.id !== CHART.pirateWaters.island && (i.kind === 'islet' || near <= C().directClaimRange);
  return {
    id, name: i.name, kind: i.kind, biome: i.biome, owned: !!i.owned, discovered: !!i.discovered, scouted: !!i.scouted,
    desc: ISL()[i.id]?.desc || '', resources: i.scouted ? resourcesOf(i) : [], claimCost: claimCost(G, i),
    travel, danger, dangerText, direct, gap: near === Infinity ? null : Math.round(near), drifting: !!i.drift,
    expedition: G.expeditions.find((e) => e.target === id && e.state !== 'done') || null,
    escort: fleet.freeShips(G, 'escort').some((s) => s.kind === 'militia'),
  };
}

function refreshInfo(G) {
  const out = {};
  for (const i of G.islands) if (i.discovered) out[i.id] = info(G, i.id);
  G.tmp.chart = out;
}

// ---- discovery and claiming -----------------------------------------------------------
function discover(G, i, quiet = false) {
  if (i.discovered) return false;
  i.discovered = true;
  G.bus.emit('island:discovered', { i });
  if (!quiet) notify(G, `New island sighted: ${i.name}`, 'good', 'compass');
  return true;
}

export function discoverNear(G, x, y, r) {
  let n = 0;
  for (const i of G.islands) { const c = islandCentre(i); if (!i.discovered && Math.hypot(c.x - x, c.y - y) <= r) { discover(G, i); n++; } }
  return n;
}

// Reveal the nearest hidden island (event cards).
export function discoverOne(G) {
  const home = islandCentre(islandById(G, 'hearthrock') || G.islands[0]);
  const hidden = G.islands.filter((i) => !i.discovered).sort((a, b) => Math.hypot(islandCentre(a).x - home.x, islandCentre(a).y - home.y) - Math.hypot(islandCentre(b).x - home.x, islandCentre(b).y - home.y));
  if (!hidden.length) return null;
  discover(G, hidden[0]); hidden[0].scouted = true;
  return hidden[0].id;
}

function refreshNets(G) {
  links.refresh?.(G);
  economy.refresh?.(G);
  // fallback until the network owner rebuilds: an unlinked island is its own network
  for (const i of G.islands) if (i.owned) {
    if (G.tmp.netOf && G.tmp.netOf[i.id] == null) G.tmp.netOf[i.id] = i.id;
    const root = rootOf(G, i.id);
    if (!G.pools[root]) G.pools[root] = { res: {}, cap: {} };
  }
}

export function doClaim(G, i, how = 'claim') {
  i.owned = true; i.discovered = true; i.scouted = true;
  bump(G, 'claims');
  refreshNets(G);
  G.bus.emit('island:claimed', { i });
  notify(G, `${i.name} is yours`, 'good', 'island', { island: i.id });
  if (i.id === CHART.pirateWaters.island) {
    G.goals.flags.roostTaken = true;
    if (G.raid && G.raid.phase === 'warn') G.raid.phase = 'retreat';
    notify(G, 'Corsair Roost has fallen. The Crimson Gale is broken.', 'good', 'skull');
  }
  discoverNear(G, i.ox + i.w / 2, i.oy + i.h / 2, C().scoutReveal);
  return { ok: true, id: i.id, how };
}

function claimable(G, i, viaExpedition) {
  if (!i) return { ok: false, error: 'No such island' };
  if (i.owned) return { ok: false, error: `${i.name} is already yours` };
  if (!i.discovered) return { ok: false, error: 'That island is not on the chart yet' };
  if (behindTempest(i) && !has(G, 'stormtaming')) return { ok: false, error: 'The Tempest Wall turns every ship back. Research Storm Taming.' };
  const need = ISL()[i.id]?.needs || null;
  if (need && !has(G, need) && i.id !== CHART.pirateWaters.island) return { ok: false, error: `Needs research first: ${need}` };
  if (!i.scouted && i.kind !== 'roost') return { ok: false, error: `Scout ${i.name} first` };
  return { ok: true };
}

export function claim(G, id) {
  if (!G) return { ok: false, error: 'No colony' };
  const i = islandById(G, id);
  const ok = claimable(G, i, false);
  if (!ok.ok) return ok;
  if (i.id === CHART.pirateWaters.island || i.kind === 'roost') return { ok: false, error: 'Corsair Roost must be taken by militia airships' };
  const near = nearestOwnedGap(G, i);
  if (i.kind !== 'islet' && near > C().directClaimRange) return { ok: false, error: `${i.name} is too far: send a claim expedition` };
  if (inPirateWaters(G, i) && !builtOf(G, 'harpoon').length && i.kind !== 'islet') return { ok: false, error: 'Corsairs patrol those skies: build a harpoon battery or send an escorted expedition' };
  const cost = claimCost(G, i);
  const miss = missing(G, cost, homeRoot(G));
  if (miss.length) return { ok: false, error: `Claiming ${i.name} needs ${costText(cost)}`, missing: miss };
  pay(G, cost, homeRoot(G));
  return doClaim(G, i, 'direct');
}

// ---- expeditions -----------------------------------------------------------------------
export function canExpedition(G, id, kind = 'scout') {
  const i = islandById(G, id);
  if (!i) return { ok: false, error: 'No such island' };
  if (!isUnlocked(G, 'feature:expeditions')) return { ok: false, error: 'Research Hot-air Skiffs to fly expeditions' };
  if (!i.discovered) return { ok: false, error: 'That island is not on the chart yet' };
  if (i.owned) return { ok: false, error: `${i.name} is already yours` };
  if (G.expeditions.some((e) => e.target === id && e.state === 'out')) return { ok: false, error: 'An expedition is already on its way' };
  if (behindTempest(i) && !has(G, 'stormtaming')) return { ok: false, error: 'The Tempest Wall turns every ship back. Research Storm Taming.' };
  const roost = i.id === CHART.pirateWaters.island;
  const c = islandCentre(i);
  if (kind === 'attack' || (roost && kind === 'claim')) {
    if (!has(G, 'militia')) return { ok: false, error: 'Research Militia Airships to attack Corsair Roost' };
    const mil = fleet.freeShips(G, 'attack', c).filter((s) => s.kind === 'militia');
    if (mil.length < 2) return { ok: false, error: 'Send at least two militia airships against the Roost' };
    return { ok: true, kind: 'attack', ships: mil };
  }
  if (kind === 'scout') {
    if (i.scouted) return { ok: false, error: `${i.name} is already scouted` };
    const s = fleet.freeShips(G, 'scout', c).find((x) => x.kind !== 'militia') || fleet.freeShips(G, 'scout', c)[0];
    if (!s) return { ok: false, error: 'No free ship at a mooring: build a skiff' };
    return { ok: true, kind, ships: [s] };
  }
  if (kind === 'claim') {
    const ok = claimable(G, i, true);
    if (!ok.ok) return ok;
    const s = fleet.freeShips(G, 'claim', c)[0];
    if (!s) return { ok: false, error: 'A claim needs a free airship at a mooring' };
    const cost = claimCost(G, i);
    const miss = missing(G, cost, homeRoot(G));
    if (miss.length) return { ok: false, error: `Claiming ${i.name} needs ${costText(cost)}`, missing: miss };
    return { ok: true, kind, ships: [s], cost };
  }
  return { ok: false, error: `Unknown expedition ${kind}` };
}

export function expedition(G, id, kind = 'scout') {
  if (!G) return { ok: false, error: 'No colony' };
  const chk = canExpedition(G, id, kind);
  if (!chk.ok) return chk;
  const i = islandById(G, id);
  const ships = chk.ships.slice();
  let escort = false;
  if (chk.kind !== 'attack' && inPirateWaters(G, i)) {
    const m = fleet.freeShips(G, 'escort', islandCentre(i)).find((s) => s.kind === 'militia' && !ships.includes(s));
    if (m) { ships.push(m); escort = true; }
  }
  if (chk.cost) pay(G, chk.cost, homeRoot(G));
  const e = {
    id: G.nextId++, target: id, kind: chk.kind, ships: ships.map((s) => s.id), ship: ships[0].id, escort,
    state: 'out', t: 0, eta: 0, startedAt: G.t, result: null, cost: chk.cost || {},
  };
  for (const s of ships) {
    s.task = { kind: 'expedition', id: e.id }; s.escort = escort;
    fleet.sendTo(G, s, { kind: 'island', id });
  }
  const lead = ships[0];
  e.eta = Math.round(fleet.flightTime(G, lead, lead.dest.x, lead.dest.y) * 2 + (chk.kind === 'scout' ? C().scoutTime : C().claimTime));
  G.expeditions.push(e);
  bump(G, 'expeditions');
  G.bus.emit('expedition:depart', { e });
  notify(G, `${kind === 'scout' ? 'Scouts' : chk.kind === 'attack' ? 'The militia' : 'Settlers'} set out for ${i.name}`, 'info', 'compass');
  return { ok: true, id: e.id };
}

function resolve(G, e) {
  const i = islandById(G, e.target);
  const R = G.rng.events;
  const ships = e.ships.map((id) => G.ships.find((s) => s.id === id)).filter(Boolean);
  const risky = e.kind !== 'attack' && i && inPirateWaters(G, i) && !e.escort && !builtOf(G, 'harpoon').length;
  if (e.kind === 'attack') {
    const power = ships.filter((s) => s.kind === 'militia').reduce((a, s) => a + s.hp / s.maxHp, 0) + (has(G, 'bastion') ? 1 : 0) + bonus(G, 'defence') * 2;
    if (power >= C().roostDefence) {
      for (const s of ships) s.hp = Math.max(1, s.hp - s.maxHp * R.range(0.15, 0.4));
      doClaim(G, i, 'attack');
      return { ok: true, text: `The militia stormed Corsair Roost. The Crimson Gale's banner burns.` };
    }
    for (const s of ships) s.hp = Math.max(1, s.hp - s.maxHp * R.range(0.5, 0.8));
    return { ok: false, text: `The Roost's guns drove the militia off. Send more ships (${C().roostDefence} or more).` };
  }
  if (risky && R.chance(C().escortRisk)) {
    for (const s of ships) s.hp = Math.max(1, s.hp - s.maxHp * R.range(0.3, 0.6));
    if (e.kind === 'claim') {
      // settlers come home; the goods are lost to the corsairs
      if (e.cost.settlers) G.colony.pop = (G.colony.pop || 0) + e.cost.settlers;
      return { ok: false, text: `Corsairs drove the settlers off ${i.name}. Send an escort next time.` };
    }
    return { ok: false, text: `Corsairs chased the scouts away from ${i.name}.` };
  }
  if (e.kind === 'scout') {
    i.scouted = true;
    const n = discoverNear(G, i.ox + i.w / 2, i.oy + i.h / 2, C().scoutReveal);
    G.bus.emit('island:scouted', { i });
    const res = resourcesOf(i).slice(0, 3).map((r) => r.name.toLowerCase());
    return { ok: true, text: `${i.name} scouted${res.length ? `: ${res.join(', ')}` : ''}.${n ? ` ${n} new island${n > 1 ? 's' : ''} sighted.` : ''}`, resources: resourcesOf(i) };
  }
  doClaim(G, i, 'expedition');
  return { ok: true, text: `Settlers have landed on ${i.name}.` };
}

function stepExpedition(G, e, dt) {
  const ships = e.ships.map((id) => G.ships.find((s) => s.id === id)).filter(Boolean);
  const lead = ships[0];
  if (e.state === 'out') {
    if (!lead) { finish(G, e, { ok: false, text: 'The expedition was lost.' }); e.state = 'done'; return; }
    if (lead.state === 'arrived') { e.state = 'onsite'; e.t = 0; for (const s of ships) if (s.state === 'arrived') s.state = 'onsite'; }
    e.eta = Math.round(lead.dest ? fleet.flightTime(G, lead, lead.dest.x, lead.dest.y) * 2 + siteTime(e) : 0);
  } else if (e.state === 'onsite') {
    for (const s of ships) if (s.state === 'arrived') s.state = 'onsite';
    e.t += dt;
    e.eta = Math.round(Math.max(0, siteTime(e) - e.t) + (lead ? backTime(G, lead) : 0));
    if (e.t >= siteTime(e)) {
      finish(G, e, resolve(G, e));
      for (const s of ships) { s.task = { kind: 'return', id: e.id }; fleet.goHome(G, s); }
      e.state = 'back';
    }
  } else if (e.state === 'back') {
    const away = ships.filter((s) => s.task && s.task.id === e.id);
    for (const s of away) if (s.state === 'arrived' || s.state === 'idle') { s.task = null; s.escort = false; }
    e.eta = lead && lead.dest ? Math.round(fleet.flightTime(G, lead, lead.dest.x, lead.dest.y)) : 0;
    if (!ships.some((s) => s.task && s.task.id === e.id)) { e.state = 'done'; e.eta = 0; }
  }
}

const siteTime = (e) => (e.kind === 'scout' ? C().scoutTime : C().claimTime);
function backTime(G, s) { const d = fleet.homeDock(G, s); if (!d) return 0; const p = fleet.dockPos(G, d); return fleet.flightTime(G, s, p.x, p.y); }

function finish(G, e, result) {
  e.result = result;
  G.bus.emit('expedition:result', { e });
  notify(G, result.text, result.ok ? 'good' : 'bad', 'compass', { island: e.target });
}

// ---- drift -----------------------------------------------------------------------------
export function canDrift(G, id, dx, dy) {
  const i = islandById(G, id);
  if (!i) return { ok: false, error: 'No such island' };
  if (!i.owned) return { ok: false, error: 'Only your own islands can drift' };
  if (!isUnlocked(G, 'feature:drift')) return { ok: false, error: 'Research Levitation Engines to move islands' };
  if (i.kind === 'home') return { ok: false, error: `${i.name} is the anchor of the colony` };
  if ((i.kind === 'far' || i.kind === 'roost') && !isUnlocked(G, 'feature:fardrift')) return { ok: false, error: 'Research Island Drift to tow far islands' };
  if (i.drift) return { ok: false, error: `${i.name} is already drifting` };
  dx = Math.round(dx); dy = Math.round(dy);
  const d = Math.hypot(dx, dy);
  if (!d) return { ok: false, error: 'Drift where?' };
  if (d > C().driftMax) return { ok: false, error: `At most ${C().driftMax} tiles at a time` };
  if (G.links.some((l) => (l.a === id || l.b === id) && l.state !== 'broken')) return { ok: false, error: `Take down ${i.name}'s bridges and cables first` };
  const moved = { ...i, ox: i.ox + dx, oy: i.oy + dy };
  for (const o of G.islands) if (o !== i && gap(o, moved) < C().minGap) return { ok: false, error: `Too close to ${o.name}` };
  const cost = {};
  for (const [r, n] of Object.entries(C().driftCost)) cost[r] = Math.ceil(n * d);
  const root = rootOf(G, id);
  const pool = missing(G, cost, root).length ? homeRoot(G) : root;
  const miss = missing(G, cost, pool);
  if (miss.length) return { ok: false, error: `Drifting ${Math.round(d)} tiles needs ${costText(cost)}`, missing: miss };
  return { ok: true, cost, pool, dx, dy };
}

export function drift(G, id, dx, dy) {
  if (!G) return { ok: false, error: 'No colony' };
  const chk = canDrift(G, id, dx, dy);
  if (!chk.ok) return chk;
  const i = islandById(G, id);
  pay(G, chk.cost, chk.pool);
  i.drift = { x: i.ox + chk.dx, y: i.oy + chk.dy };
  G.bus.emit('island:drift', { i });
  return { ok: true, id };
}

function stepDrift(G, i, dt) {
  const sp = C().driftSpeed * (1 + bonus(G, 'driftSpeed')) * dt;
  const dx = i.drift.x - i.ox, dy = i.drift.y - i.oy, d = Math.hypot(dx, dy);
  if (d <= sp) {
    i.ox = i.drift.x; i.oy = i.drift.y; i.drift = null;
    bump(G, 'drifted');
    refreshNets(G);
    G.bus.emit('island:drifted', { i });
    notify(G, `${i.name} has settled into its new place`, 'good', 'island', { island: i.id });
  } else { i.ox += (dx / d) * sp; i.oy += (dy / d) * sp; }
}

// ---- step and cheats --------------------------------------------------------------------
export function step(G, dt) {
  for (const e of G.expeditions) if (e.state !== 'done') stepExpedition(G, e, dt);
  if (G.expeditions.length > 12) {
    const keep = G.expeditions.filter((e) => e.state !== 'done');
    const done = G.expeditions.filter((e) => e.state === 'done').slice(-8);
    G.expeditions = [...done, ...keep];
  }
  for (const i of G.islands) if (i.drift) stepDrift(G, i, dt);
  G.tmp.chartT = (G.tmp.chartT || 0) - dt;
  if (G.tmp.chartT <= 0) {
    G.tmp.chartT = 2;
    // observatories reveal the sky around the colony
    if (builtOf(G, 'observatory').length) {
      const h = islandById(G, 'hearthrock');
      if (h) discoverNear(G, h.ox + h.w / 2, h.oy + h.h / 2, C().observatoryRange * (1 + 0.25 * (builtOf(G, 'observatory').length - 1)));
    }
    refreshInfo(G);
  }
}

// Cheat: claim every island except Corsair Roost (take that with militia).
export function claimAll(G) {
  if (!G) return { ok: false, error: 'No colony' };
  for (const i of G.islands) {
    if (i.owned || i.id === CHART.pirateWaters.island || i.kind === 'roost') { if (!i.owned) { i.discovered = true; i.scouted = true; } continue; }
    i.discovered = true; i.scouted = true; i.owned = true;
    G.bus.emit('island:claimed', { i });
  }
  refreshNets(G);
  refreshInfo(G);
  return { ok: true };
}
