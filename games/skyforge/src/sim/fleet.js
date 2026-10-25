// Player airships (PROGRESSION): building them at moorings and shipyards, and
// flying them for real across the world plane between docks, foreign ports and
// far islands. Trade (sim/trade.js) and the chart (sim/chart.js) give ships their
// jobs; this module only builds, moves, docks, repairs and loses them.
//
// Ship = { id, kind, name, home: dock building id|null, route: route id|null,
//          task: null|{ kind:'route'|'expedition'|'return', id },
//          state: 'building'|'idle'|'flying'|'loading'|'unloading'|'trading'|'onsite'|'defend',
//          x, y, z, hdg (radians, atan2 of world dy/dx: 0 = east, PI/2 = north), bank (-1..1, turning),
//          vx, vy (tiles/s), cargo:{res:n}, hp, maxHp, island: id while docked|null,
//          dest: null|{ x, y, z, kind:'dock'|'port'|'island', id }, arrived: bool, t, escort: bool }
// Renderer: draw every ship in G.ships at (x, y, z) facing hdg; state 'building'
// is a hull on the slip (progress = 1 - t / build time, s.buildT).
import { SHIPS } from '../content/ships.js';
import { PORTS, CHART } from '../content/ports.js';
import { CFG } from '../config.js';
import { clamp, wrapAng } from '../core/math.js';
import { isUnlocked, bonus } from './research.js';
import { payOn, missingOn, gain, rootOf, notify, islandById, islandCentre, bump, room } from './ledger.js';

const C = () => CFG.progression.fleet;
export const SHIP = Object.fromEntries(SHIPS.map((s) => [s.id, s]));
export const PORT = Object.fromEntries(PORTS.map((p) => [p.id, p]));
const NAMES = ['Bramble', 'Kestrel', 'Lark', 'Thistledown', 'Copper Wren', 'Amber Gull', 'Hearthwind', 'Marigold', 'Swift Tern', 'Old Bellows',
  'Puffin', 'Saffron', 'Gilded Moth', 'Cloudhopper', 'Tinker\'s Luck', 'Nimbus', 'Brass Sparrow', 'Windlass', 'Merry Kite', 'Ember Finch',
  'Dandelion', 'Lantern', 'Steadfast', 'Morning Star', 'Bluebell', 'Rook', 'Gossamer', 'Sundew', 'Iron Heron', 'Wayfarer'];
const DOCK_TYPES = new Set(['mooring', 'shipyard']);

export const capacityOf = (G, s) => Math.round((SHIP[s.kind]?.capacity || 0) * (1 + bonus(G, 'shipCapacity')));
export const cargoCount = (s) => Object.values(s.cargo || {}).reduce((a, n) => a + n, 0);
export const isDock = (b) => b && DOCK_TYPES.has(b.type) && b.state === 'built';

export function speedOf(G, s) {
  const base = (SHIP[s.kind]?.speed || 1) * (1 + bonus(G, 'shipSpeed'));
  return base * weatherFactor(G);
}

export function weatherFactor(G) {
  const w = G.weather || {}, c = C();
  if (w.kind === 'storm') return Math.max(0.3, 1 - c.stormSlow * (w.power || 0) * (1 - bonus(G, 'stormSlow')));
  if (w.kind === 'fog') return c.fogSlow;
  if (w.kind === 'rain') return c.rainSlow;
  return 1;
}

// Where ships hover when docked at building b: just off the island edge beside it.
export function dockPos(G, b, slot = 0) {
  const i = islandById(G, b.island);
  if (!i) return { x: 0, y: 0, z: 0, island: null };
  const sz = sizeOf(b);
  const bx = i.ox + b.u + sz[0] / 2, by = i.oy + b.v + sz[1] / 2;
  const cx = i.ox + i.w / 2, cy = i.oy + i.h / 2;
  let dx = bx - cx, dy = by - cy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const off = 1.4 + Math.max(sz[0], sz[1]) / 2;
  // berth slots spread along the cliff edge
  const s = slot === 0 ? 0 : (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * 1.6;
  return { x: bx + dx * off - dy * s, y: by + dy * off + dx * s, z: (i.alt || 0) + 1.2, island: i.id, hdg: Math.atan2(-dx, dy) };
}

function sizeOf(b) {
  if (Array.isArray(b.size)) return b.size;
  return b.type === 'shipyard' ? [3, 2] : b.type === 'mooring' ? [2, 2] : [1, 1];
}

export function portPos(id) { const p = PORT[id]; return p ? { x: p.x, y: p.y, z: p.z || 5 } : null; }

// Hover point just off an island (for expeditions): the edge facing `from`.
export function islandApproach(G, id, from) {
  const i = islandById(G, id); if (!i) return null;
  const c = islandCentre(i);
  let dx = (from ? from.x : 0) - c.x, dy = (from ? from.y : 0) - c.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const r = Math.max(i.w, i.h) * 0.5 + 1.5;
  return { x: c.x + dx * r, y: c.y + dy * r, z: c.z + 1.5 };
}

export const shipsAt = (G, dockId) => G.ships.filter((s) => s.home === dockId);
const slotOf = (G, s) => Math.max(0, shipsAt(G, s.home).indexOf(s));

export function homeDock(G, s) { const b = s.home != null ? G.buildings.find((x) => x.id === s.home) : null; return isDock(b) ? b : null; }

export function init(G) { G.ships = G.ships || []; }

export function hydrate(G) {
  for (const s of G.ships) { s.cargo = s.cargo || {}; if (s.bank == null) s.bank = 0; }
}

// ---- actions -----------------------------------------------------------------
export function canBuildShip(G, kind, dockId) {
  const spec = SHIP[kind];
  if (!spec) return { ok: false, error: `Unknown ship ${kind}` };
  const b = G.buildings.find((x) => x.id === dockId);
  if (!b || !DOCK_TYPES.has(b.type)) return { ok: false, error: 'Choose a mooring or shipyard' };
  if (b.state !== 'built') return { ok: false, error: 'That dock is not finished yet' };
  const i = islandById(G, b.island);
  if (!i || !i.owned) return { ok: false, error: 'That island is not yours' };
  let cost = { ...spec.cost }, charter = false;
  if (!isUnlocked(G, 'ship:' + kind)) {
    const best = Math.max(0, ...G.ports.map((p) => p.rep || 0));
    if (spec.charter && best >= spec.charter.rep) { charter = true; cost = { coin: spec.charter.coin }; }
    else return { ok: false, error: `${spec.name} needs research first` };
  }
  if (!charter && spec.where === 'shipyard') {
    const root = rootOf(G, b.island);
    const yard = G.buildings.some((x) => x.type === 'shipyard' && x.state === 'built' && rootOf(G, x.island) === root);
    if (!yard) return { ok: false, error: `${spec.name} is built at a shipyard` };
  }
  const max = C().berths[b.type] || 3;
  if (shipsAt(G, b.id).length >= max) return { ok: false, error: 'Every berth at this dock is taken' };
  const miss = missingOn(G, b.island, cost);
  if (miss.length) return { ok: false, error: `Not enough ${miss.map((m) => m.res).join(', ')}`, missing: miss };
  return { ok: true, cost, charter };
}

export function buildShip(G, kind, dockId) {
  if (!G) return { ok: false, error: 'No colony' };
  if (dockId == null) {
    // default: the first dock that can take it
    const d = G.buildings.find((b) => isDock(b) && canBuildShip(G, kind, b.id).ok);
    if (!d) return canBuildShip(G, kind, (G.buildings.find((b) => isDock(b)) || {}).id);
    dockId = d.id;
  }
  const chk = canBuildShip(G, kind, dockId);
  if (!chk.ok) return chk;
  const b = G.buildings.find((x) => x.id === dockId);
  if (!payOn(G, b.island, chk.cost)) return { ok: false, error: 'Could not pay' };
  const spec = SHIP[kind];
  const id = G.nextId++;
  const n = G.ships.length + (G.stats.totals?.ships || 0);
  const s = {
    id, kind, name: NAMES[(id * 7 + n) % NAMES.length], home: b.id, route: null, task: null, state: 'building',
    x: 0, y: 0, z: 0, hdg: 0, bank: 0, vx: 0, vy: 0, cargo: {}, hp: spec.hp, maxHp: spec.hp, island: b.island,
    dest: null, arrived: false, t: 0, buildT: spec.build * (1 - Math.min(0.5, bonus(G, 'buildSpeed'))), escort: false, charter: chk.charter,
  };
  s.t = s.buildT;
  G.ships.push(s);
  snapDock(G, s);
  G.bus.emit('ship:placed', { s });
  return { ok: true, id };
}

export function scrapShip(G, id) {
  const s = G.ships.find((x) => x.id === id);
  if (!s) return { ok: false, error: 'No such ship' };
  if (s.task && s.task.kind === 'expedition') return { ok: false, error: 'The ship is away on an expedition' };
  const spec = SHIP[s.kind];
  const dock = homeDock(G, s);
  if (dock && !s.charter) for (const [res, n] of Object.entries(spec.cost)) gain(G, res, Math.floor(n * (s.state === 'building' ? 1 : 0.5)), rootOf(G, dock.island));
  if (dock && s.state !== 'flying') for (const [res, n] of Object.entries(s.cargo)) gain(G, res, n, rootOf(G, dock.island));
  removeShip(G, s);
  G.bus.emit('ship:scrapped', { s });
  return { ok: true };
}

function removeShip(G, s) {
  const i = G.ships.indexOf(s); if (i >= 0) G.ships.splice(i, 1);
  for (const r of G.routes) if (r.ship === s.id) { r.ship = null; r.state = 'noship'; r.eta = null; }
}

// ---- movement ------------------------------------------------------------------
// Send a ship somewhere. target: { kind:'dock', id } | { kind:'port', id } | { kind:'island', id } | { x, y, z }
export function sendTo(G, s, target) {
  let p = null;
  if (target.kind === 'dock') {
    const b = G.buildings.find((x) => x.id === target.id);
    if (!isDock(b)) return false;
    if (s.home !== b.id) s.home = b.id;
    p = dockPos(G, b, slotOf(G, s));
  } else if (target.kind === 'port') p = portPos(target.id);
  else if (target.kind === 'island') p = islandApproach(G, target.id, s);
  else p = { x: target.x, y: target.y, z: target.z ?? s.z };
  if (!p) return false;
  s.dest = { x: p.x, y: p.y, z: p.z, kind: target.kind || 'point', id: target.id ?? null };
  s.arrived = false;
  s.state = 'flying';
  s.island = null;
  G.bus.emit('ship:depart', { s, where: s.dest.id });
  return true;
}

export function goHome(G, s) {
  let dock = homeDock(G, s);
  if (!dock) dock = rehome(G, s);
  if (!dock) { s.state = 'idle'; s.dest = null; return false; }
  return sendTo(G, s, { kind: 'dock', id: dock.id });
}

function rehome(G, s) {
  const max = (b) => C().berths[b.type] || 3;
  const docks = G.buildings.filter((b) => isDock(b) && islandById(G, b.island)?.owned && shipsAt(G, b.id).length < max(b));
  if (!docks.length) { s.home = null; return null; }
  docks.sort((a, b) => dist2(G, s, a) - dist2(G, s, b));
  s.home = docks[0].id;
  return docks[0];
}
function dist2(G, s, b) { const p = dockPos(G, b); return (p.x - s.x) ** 2 + (p.y - s.y) ** 2; }

// Estimated seconds of flight from the ship's position to (x, y).
export function flightTime(G, s, x, y) {
  return Math.hypot(x - s.x, y - s.y) / Math.max(0.05, speedOf(G, s)) + 2;
}
export function travelTime(G, kind, a, b) {
  const sp = (SHIP[kind]?.speed || 1) * (1 + bonus(G, 'shipSpeed'));
  return Math.hypot(b.x - a.x, b.y - a.y) / sp + 4;
}

function snapDock(G, s) {
  const b = homeDock(G, s);
  if (!b) return;
  const p = dockPos(G, b, slotOf(G, s));
  s.x = p.x; s.y = p.y; s.z = p.z; s.island = b.island;
  if (s.state === 'building' || s.state === 'idle') s.hdg = p.hdg;
}

function fly(G, s, dt) {
  const d = s.dest, c = C();
  const dx = d.x - s.x, dy = d.y - s.y, dist = Math.hypot(dx, dy);
  const sp = speedOf(G, s);
  // altitude: climb to cruise, descend on approach
  const startZ = s.cruiseFrom ?? s.z;
  const cruise = Math.max(startZ, d.z) + c.cruise;
  const descendAt = Math.max(2.5, ((cruise - d.z) / c.climb) * sp * 0.9);
  const tz = dist > descendAt ? cruise : d.z;
  s.z += clamp(tz - s.z, -c.climb * dt, c.climb * dt);
  const want = Math.atan2(dy, dx);
  const diff = wrapAng(want - s.hdg);
  const turn = clamp(diff, -c.turn * dt, c.turn * dt);
  s.hdg = wrapAng(s.hdg + (dist < 3 ? diff : turn));
  s.bank += (clamp(diff * 1.5, -1, 1) - s.bank) * Math.min(1, dt * 3);
  // slow down for tight turns and the final approach
  const k = (Math.cos(Math.min(Math.abs(diff), Math.PI / 2)) * 0.7 + 0.3) * Math.min(1, 0.35 + dist / 4);
  const v = sp * k;
  const stepLen = Math.min(dist, v * dt);
  if (dist < 3) { s.x += (dx / (dist || 1)) * stepLen; s.y += (dy / (dist || 1)) * stepLen; }
  else { s.x += Math.cos(s.hdg) * stepLen; s.y += Math.sin(s.hdg) * stepLen; }
  s.vx = dt > 0 ? Math.cos(s.hdg) * v : 0; s.vy = dt > 0 ? Math.sin(s.hdg) * v : 0;
  if (dist < 0.03 && Math.abs(s.z - d.z) < 0.05) {
    s.x = d.x; s.y = d.y; s.z = d.z; s.vx = s.vy = 0; s.bank = 0;
    s.arrived = true; s.cruiseFrom = null;
    if (d.kind === 'dock') {
      const b = G.buildings.find((x) => x.id === d.id);
      s.island = b ? b.island : null;
      if (b) s.hdg = dockPos(G, b, slotOf(G, s)).hdg;
    }
    s.state = 'arrived';
    G.bus.emit('ship:arrive', { s, where: d.id });
  }
}

// Ambush in pirate waters (until Corsair Roost is taken), unless escorted.
function ambush(G, s, dt) {
  if (G.goals.flags.roostTaken || s.kind === 'militia' || s.escort) return;
  const roost = islandById(G, CHART.pirateWaters.island);
  if (!roost) return;
  const c = islandCentre(roost);
  if (Math.hypot(s.x - c.x, s.y - c.y) > CHART.pirateWaters.r) return;
  const p = (C().ambushPerMin / 60) * dt * (1 - Math.min(0.8, bonus(G, 'defence')));
  if (!G.rng.events.chance(p)) return;
  const [a, b] = C().ambushDmg;
  s.hp -= s.maxHp * G.rng.events.range(a, b);
  let lost = 0;
  for (const r of Object.keys(s.cargo)) { const n = Math.floor(s.cargo[r] * C().ambushLoot); s.cargo[r] -= n; lost += n; }
  notify(G, `Corsairs ambushed the ${s.name}${lost ? ` and took ${lost} goods` : ''}`, 'bad', 'skull', { x: s.x, y: s.y });
  G.bus.emit('ship:ambush', { s, lost });
}

export function step(G, dt) {
  const c = C();
  for (let k = G.ships.length - 1; k >= 0; k--) {
    const s = G.ships[k];
    if (s.hp <= 0) {
      notify(G, `The ${s.name} went down`, 'bad', 'airship', { x: s.x, y: s.y });
      G.bus.emit('ship:lost', { s });
      G.bus.emit('boom', { x: s.x, y: s.y, z: s.z, size: 1 });
      bump(G, 'shipsLost');
      removeShip(G, s);
      continue;
    }
    if (s.state === 'building') {
      if (!homeDock(G, s)) { removeShip(G, s); continue; }
      snapDock(G, s);
      s.t -= dt;
      if (s.t <= 0) { s.t = 0; s.state = 'idle'; bump(G, 'ships'); G.bus.emit('ship:built', { s }); notify(G, `The ${SHIP[s.kind].name} ${s.name} is ready`, 'good', 'airship', { island: s.island }); }
      continue;
    }
    if (s.state === 'flying') {
      // held up (corsairs boarded her, see raids.js): hover in place for a while
      if (s.delay > 0) { s.delay = Math.max(0, s.delay - dt); s.vx = s.vy = 0; continue; }
      if (s.cruiseFrom == null) s.cruiseFrom = s.z;
      fly(G, s, dt);
      if (s.state === 'flying') ambush(G, s, dt);
      continue;
    }
    if (s.state === 'defend') continue;
    // docked or waiting somewhere
    const atHome = s.dest == null || (s.dest.kind === 'dock' && s.dest.id === s.home);
    if (atHome && s.island) {
      const dock = homeDock(G, s);
      if (dock && s.state !== 'arrived') snapDock(G, s);
      s.hp = Math.min(s.maxHp, s.hp + (c.repairPerMin / 60) * dt);
    }
    if (!s.task) {
      // no job: fly home, then unload whatever is aboard
      const dock = homeDock(G, s) || rehome(G, s);
      if (!dock) { s.state = 'idle'; continue; }
      if (!(s.island === dock.island && s.dest && s.dest.kind === 'dock' && s.dest.id === dock.id) && !(s.state === 'idle' && s.island === dock.island && !s.dest)) {
        if (s.state !== 'flying') sendTo(G, s, { kind: 'dock', id: dock.id });
        continue;
      }
      if (cargoCount(s)) unloadAll(G, s, rootOf(G, dock.island));
      s.state = 'idle'; s.dest = null;
    }
  }
}

// Unload a ship's cargo into a pool (as much as fits). Returns units moved.
export function unloadAll(G, s, root) {
  let n = 0;
  for (const [res, q] of Object.entries(s.cargo)) {
    const moved = gain(G, res, Math.min(q, room(G, res, root)), root);
    s.cargo[res] = q - moved; n += moved;
    if (s.cargo[res] <= 0) delete s.cargo[res];
  }
  return n;
}

// Idle ships ready for a job, optionally with a role, nearest to `near` first.
export function freeShips(G, role = null, near = null) {
  const out = G.ships.filter((s) => s.state === 'idle' && !s.task && !s.route && (!role || (SHIP[s.kind]?.roles || []).includes(role)));
  if (near) out.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  return out;
}
