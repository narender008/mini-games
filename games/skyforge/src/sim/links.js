// ECONOMY: bridges and cable cars between owned islands, and island networks.
//
// Link = { id, kind:'bridge'|'cable', a, b, au, av, bu, bv (anchor cells on each
//   island), gap (tiles of open sky between the anchors), hp, maxHp,
//   state:'site'|'built'|'broken', progress 0..1, workers (builders), paid,
//   stations:[idA, idB] for cable cars }
// Bridges span rim gaps up to LINKS.bridge.maxGap tiles; cable cars span up
// to LINKS.cable.maxGap between two built Cable Stations (and need research).
// A built link joins both islands' networks (one shared pool, see economy.js);
// a broken one (hp 0, e.g. a frigate's harpoon) splits them again until it is
// rebuilt with link() on the same pair (half price). Sites are built by idle
// settlers like buildings.
import { LINK_BY_ID, LINKS } from '../content/buildings.js';
import { newId } from '../state.js';
import * as eco from './economy.js';
import * as islandsMod from './islands.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cellAt = (I, u, v) => (u < 0 || v < 0 || u >= I.w || v >= I.h ? ' ' : I.cells[v * I.w + u]);

function rimCells(G, I) {
  const C = (G.tmp.rims = G.tmp.rims || {});
  const key = I.id + ':' + I.ox + ',' + I.oy;
  if (C[key]) return C[key];
  const out = [];
  for (let v = 0; v < I.h; v++) for (let u = 0; u < I.w; u++) {
    if (cellAt(I, u, v) === ' ') continue;
    if (N4.some(([du, dv]) => cellAt(I, u + du, v + dv) === ' ')) out.push([u, v]);
  }
  for (const k of Object.keys(C)) if (k.startsWith(I.id + ':')) delete C[k];
  return (C[key] = out);
}

// nearest rim cells of two islands: { gap, au, av, bu, bv }
export function nearest(G, A, B) {
  let best = null;
  const ra = rimCells(G, A), rb = rimCells(G, B);
  for (const [au, av] of ra) {
    const ax = A.ox + au + 0.5, ay = A.oy + av + 0.5;
    for (const [bu, bv] of rb) {
      const d = Math.hypot(B.ox + bu + 0.5 - ax, B.oy + bv + 0.5 - ay);
      if (!best || d < best.d) best = { d, au, av, bu, bv };
    }
  }
  if (!best) return null;
  return { gap: Math.max(0, best.d - 1), au: best.au, av: best.av, bu: best.bu, bv: best.bv };
}

function stations(G, islandId) {
  return G.buildings.filter((b) => b.type === 'cablestation' && b.island === islandId && b.state === 'built');
}
function stationPair(G, A, B) {
  let best = null;
  for (const s of stations(G, A.id)) for (const t of stations(G, B.id)) {
    const d = Math.hypot(B.ox + t.u + 1 - (A.ox + s.u + 1), B.oy + t.v + 1 - (A.oy + s.v + 1));
    if (!best || d < best.d) best = { d, s, t };
  }
  return best;
}

export function costOf(kind, gap) {
  const L = LINK_BY_ID[kind]; if (!L) return {};
  const out = { ...L.cost };
  for (const [r, n] of Object.entries(L.perTile || {})) out[r] = (out[r] || 0) + Math.ceil(n * gap);
  return out;
}
export function timeOf(kind, gap) { const L = LINK_BY_ID[kind]; return L ? L.time + (L.perTileTime || 0) * gap : 60; }

const pairOf = (G, a, b) => G.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));

// Geometry and rules (no cost): { ok, error, gap, anchors, broken }
function check(G, kind, a, b) {
  const L = LINK_BY_ID[kind];
  if (!L) return { ok: false, error: 'Unknown link' };
  if (a === b) return { ok: false, error: 'Pick two different islands' };
  const A = eco.islandOf(G, a), B = eco.islandOf(G, b);
  if (!A || !B) return { ok: false, error: 'Unknown island' };
  if (!A.owned || !B.owned) return { ok: false, error: `Claim ${!A.owned ? A.name : B.name} first` };
  if (L.needs && !eco.has(G, L.needs)) return { ok: false, error: 'Needs research', needs: L.needs };
  const ex = pairOf(G, a, b);
  if (ex && ex.state !== 'broken') return { ok: false, error: ex.state === 'site' ? 'A link is already being built there' : `${A.name} and ${B.name} are already linked` };
  if (Math.abs(A.alt - B.alt) > L.maxAlt) return { ok: false, error: 'Too much height between the islands' };
  const n = nearest(G, A, B);
  if (!n) return { ok: false, error: 'No rim to anchor on' };
  if (n.gap > L.maxGap) return { ok: false, error: kind === 'bridge' ? `Too far for a bridge (${Math.round(n.gap)} tiles; up to ${L.maxGap | 0}). Try a cable car` : `Too far for a cable car (${Math.round(n.gap)} tiles)` };
  let anchors = { au: n.au, av: n.av, bu: n.bu, bv: n.bv }, st = null, gap = n.gap;
  if (L.needStation) {
    const p = stationPair(G, A, B);
    if (!p) {
      const lack = [A, B].filter((I) => !stations(G, I.id).length);
      const roomless = lack.filter((I) => !islandsMod.spots(G, 'cablestation', I.id).length && !G.buildings.some((x) => x.type === 'cablestation' && x.island === I.id));
      if (roomless.length) {
        const I = roomless[0], other = I === A ? B : A;
        return { ok: false, error: `No room for a Cable Station on ${I.name}'s rim facing ${other.name}: demolish a building there to make space` };
      }
      return { ok: false, error: `Needs a built Cable Station on ${lack.map((I) => I.name).join(' and ') || 'both islands'} (on the rim facing the other island)` };
    }
    anchors = { au: p.s.u, av: p.s.v, bu: p.t.u, bv: p.t.v };
    st = [p.s.id, p.t.id];
    gap = Math.max(n.gap, p.d - 2);
  }
  return { ok: true, gap, anchors, stations: st, broken: ex && ex.state === 'broken' ? ex : null };
}

export function canLink(G, kind, a, b) {
  if (!G) return { ok: false, error: 'No game' };
  const c = check(G, kind, a, b);
  if (!c.ok) return { ...c, placeOk: false };
  const cost = c.broken ? halve(costOf(kind, c.gap)) : costOf(kind, c.gap);
  const plan = eco.payPlan(G, a, cost);
  const plan2 = plan.ok ? plan : eco.payPlan(G, b, cost);
  if (!plan2.ok) return { ok: false, placeOk: true, gap: c.gap, cost, error: eco.missingText(G, a, cost, plan.missing) };
  return { ok: true, placeOk: true, gap: Math.round(c.gap * 10) / 10, cost };
}
const halve = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.ceil(v / 2)]));

// Every legal pair [a, b] for this kind (rules only, ignoring cost).
export function linkSpots(G, kind) {
  if (!G) return [];
  const own = G.islands.filter((i) => i.owned);
  const out = [];
  for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) {
    if (check(G, kind, own[i].id, own[j].id).ok) out.push([own[i].id, own[j].id]);
  }
  return out;
}

export function link(G, kind, a, b) {
  const c = canLink(G, kind, a, b);
  if (!c.ok) return c;
  const geo = check(G, kind, a, b);
  const cost = c.cost;
  let paid = eco.payFor(G, a, cost);
  if (!paid.ok) paid = eco.payFor(G, b, cost);
  if (!paid.ok) return paid;
  const L = LINK_BY_ID[kind];
  if (geo.broken) {
    const l = geo.broken;
    Object.assign(l, { kind, state: 'site', progress: 0.5, hp: Math.round(l.maxHp * 0.5), ...geo.anchors, stations: geo.stations });
    eco.restaff(G);
    G.bus.emit('link:placed', { l });
    return { ok: true, id: l.id };
  }
  const l = {
    id: newId(G), kind, a, b, ...geo.anchors, gap: Math.round(geo.gap * 10) / 10,
    hp: Math.round(L.hp * 0.3), maxHp: L.hp, state: 'site', progress: 0, workers: 0, paid: cost, stations: geo.stations,
    time: Math.round(timeOf(kind, geo.gap)),
  };
  G.links.push(l);
  eco.restaff(G);
  G.bus.emit('link:placed', { l });
  return { ok: true, id: l.id };
}

export function unlink(G, id) {
  const l = G.links.find((x) => x.id === id);
  if (!l) return { ok: false, error: 'No such link' };
  eco.refund(G, l.a, l.paid || {}, l.state === 'site' && l.progress < 0.02 ? 1 : 0.5);
  G.links.splice(G.links.indexOf(l), 1);
  eco.refresh(G);
  G.bus.emit('link:broken', { l, removed: true });
  return { ok: true, id };
}

// PROGRESSION calls this after claims and drift; economy rebuilds pools.
export function refresh(G) { G.tmp.rims = {}; return eco.refresh(G); }

export function init(G) { G.links = G.links || []; }
export function hydrate(G) { G.tmp.rims = {}; }

export function step(G, dt) {
  let changed = false;
  const envK = eco.envMul(G, 'build') * (1 + eco.bonus(G, 'buildSpeed'));
  for (const l of G.links) {
    if (l.state === 'site') {
      const L = LINK_BY_ID[l.kind];
      const crew = Math.min(1, (l.workers || 0) / Math.max(1, L?.builders || 2));
      if (crew <= 0) continue;
      l.progress = Math.min(1, l.progress + dt / Math.max(1, l.time || timeOf(l.kind, l.gap || 3)) * crew * envK);
      l.hp = Math.max(l.hp, Math.round(l.maxHp * (0.3 + 0.7 * l.progress)));
      if (l.progress >= 1) {
        l.state = 'built'; l.hp = l.maxHp; l.workers = 0; changed = true;
        G.bus.emit('link:built', { l });
        const A = eco.islandOf(G, l.a), B = eco.islandOf(G, l.b);
        eco.notify(G, `${L.name} to ${B?.name} complete: ${A?.name} and ${B?.name} now share their stores`, 'good', l.kind);
      }
    } else if (l.state === 'built' && l.hp <= 0) {
      l.state = 'broken'; l.progress = 0; changed = true;
      G.bus.emit('link:broken', { l });
      const A = eco.islandOf(G, l.a), B = eco.islandOf(G, l.b);
      eco.notify(G, `The ${LINK_BY_ID[l.kind]?.name.toLowerCase() || 'link'} between ${A?.name} and ${B?.name} was cut!`, 'bad', l.kind);
    }
  }
  if (changed) eco.refresh(G);
}

export { LINKS };
