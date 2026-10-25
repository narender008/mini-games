// Raids (THREATS): the Crimson Gale. Raid scheduling, warning, pirate ship
// flight and AI (corsair / raider / frigate / dreadnought), retreat with loot,
// the final Dreadnought raid, and the end of raids once Corsair Roost is taken.
//
// G.raid = null | { id, name, strength, phase:'warn'|'attack'|'retreat', eta (s to
//   the attack while warning), t (s in phase), ships:[pirate ids], counts {kind:n},
//   loot {res:n} (carried off so far), report:[lines] (see combat.js), final (bool) }
// G.pirates = [{ id, kind, x, y, z (world tiles), vx, vy, vz, hdg (rad, 0 = east),
//   hp, maxHp, state:'approach'|'attack'|'board'|'egress'|'retreat'|'down',
//   target {t:'b'|'link'|'ship'|'isle', id}, ammo, cd, cd2, loot {}, t, isle }]
//   `state` 'down' = falling in flames (removed after ~2.5 s).
// G.threat = { nextRaidAt (G.t of the next scheduled raid, null until raids can come),
//   raids (count), finalPending, finalDone, lastReport {...} } (shared with combat/weather)
// Exports: startRaid(G, strength, {now}), startFinal(G), raidEta(G).
// Bus: raid:warn / raid:start / raid:end {raid}, pirate:spawn {p}, pirate:down (combat.js).
// Randomness: G.rng.events (scheduling, composition), G.rng.combat (AI and aim).
import { CFG } from '../config.js';
import { PIRATES } from '../content/pirates.js';
import { newId } from '../state.js';
import { clamp, angDiff } from '../core/math.js';
import {
  bonus, pdef, bpos, bname, built, linkPos, islandById, homeId, poolOf, take, report, closeReport, notify, fire, lead,
  shieldCovers, height,
} from './combat.js';

const C = () => CFG.threats;
const R = () => CFG.threats.raids;
const diff = (G) => C().difficulty[G.difficulty] || C().difficulty.standard;
const alive = (p) => p.state !== 'down' && p.state !== 'gone';

// ---------- colony geometry -----------------------------------------------------------
function colonyGeo(G) {
  const own = G.islands.filter((i) => i.owned);
  const list = own.length ? own : G.islands.slice(0, 1);
  if (!list.length) return { cx: 0, cy: 0, r: 10, alt: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, alt = 0;
  for (const i of list) { x0 = Math.min(x0, i.ox); y0 = Math.min(y0, i.oy); x1 = Math.max(x1, i.ox + i.w); y1 = Math.max(y1, i.oy + i.h); alt += i.alt || 0; }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.hypot(x1 - x0, y1 - y0) / 2, alt: alt / list.length };
}

// The part of the colony a raid falls on: a cluster of owned islands within 45
// tiles of a chosen island (the home cluster, Emberrock, Glimmerreach...).
function clusterGeo(G, anchor) {
  const own = G.islands.filter((i) => i.owned);
  const ac = { x: anchor.ox + anchor.w / 2, y: anchor.oy + anchor.h / 2 };
  const list = own.filter((i) => Math.hypot(i.ox + i.w / 2 - ac.x, i.oy + i.h / 2 - ac.y) < 45);
  if (!list.includes(anchor)) list.push(anchor);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, alt = 0;
  for (const i of list) { x0 = Math.min(x0, i.ox); y0 = Math.min(y0, i.oy); x1 = Math.max(x1, i.ox + i.w); y1 = Math.max(y1, i.oy + i.h); alt += i.alt || 0; }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.hypot(x1 - x0, y1 - y0) / 2, alt: alt / list.length, island: anchor.id };
}
function raidGeo(G) { return (G.raid && G.raid.geo) || colonyGeo(G); }

export function colonyValue(G) {
  let n = 0;
  for (const b of G.buildings) if (b.state === 'built') n++;
  return (G.colony.pop || 0) + 3 * n + (G.colony.coin || 0) / 100;
}

// ---------- scheduling ----------------------------------------------------------------
// No more scheduled raids once Corsair Roost is taken, the Dreadnought has
// fallen or the Skyforge is lit ("The islands are safe"). Debug raids still work.
function raidsOver(G) { const f = G.goals?.flags || {}; return !!(f.roostTaken || f.dreadnoughtDown || G.goals?.won || G.threat?.finalDone); }

function schedule(G, first = false) {
  const r = G.rng.events;
  const ch = G.goals?.chapter || 1;
  let iv;
  if (first) iv = r.range(...R().firstAfter);
  else iv = r.range(...R().interval) * Math.pow(R().chapterFactor, Math.max(0, ch - 5));
  G.threat.nextRaidAt = Math.round(G.t + iv * diff(G).interval);
}

function autoStrength(G) {
  const ch = G.goals?.chapter || 1;
  const v = colonyValue(G);
  const n = G.threat.raids || 0;
  const base = 0.55 + 0.18 * Math.max(0, ch - 4) + Math.min(0.4, 0.06 * n);
  const val = clamp(0.7 + 0.5 * v / R().valueRef, 0.7, 1.6);
  return +(base * val * diff(G).strength).toFixed(2);
}

export function raidEta(G) {
  if (G.raid) return G.raid.phase === 'warn' ? G.raid.eta : 0;
  return G.threat?.nextRaidAt != null ? Math.max(0, G.threat.nextRaidAt - G.t) : null;
}

// Pick a fleet for a budget of points (corsair 1, raider 2, frigate 3.5).
function compose(G, strength, forced) {
  const r = G.rng.events;
  const ch = G.goals?.chapter || 1;
  let pts = R().points[0] + R().points[1] * strength;
  const hasLinks = G.links.some((l) => l.state === 'built');
  const kinds = PIRATES.filter((p) => !p.boss && (forced || ch >= p.minChapter || (p.id !== 'frigate')))
    .filter((p) => p.id !== 'frigate' || hasLinks || ch >= 5 || forced && strength >= 1.5);
  const fleet = [];
  // the first ever raid is corsairs only: a warning shot
  const gentle = !forced && (G.threat.raids || 0) === 0;
  let guard = 0;
  while (pts >= 1 && guard++ < 30 && fleet.length < 9) {
    const opts = kinds.filter((k) => k.points <= pts + 0.01 && (!gentle || k.id === 'corsair'));
    if (!opts.length) break;
    const k = r.weighted(opts, (x) => (x.id === 'raider' ? 3 : x.id === 'corsair' ? 2 : 1.4));
    fleet.push(k.id); pts -= k.points;
  }
  if (!fleet.length) fleet.push('corsair');
  return fleet;
}

// Start a raid now (debug, presets, scheduler). now: skip the warning.
export function startRaid(G, strength = 1, { now = false, final = false, fleet = null } = {}) {
  if (!G) return { ok: false, error: 'no game' };
  if (G.raid) return { ok: false, error: 'a raid is already under way' };
  if (!G.islands.some((i) => i.owned) && !G.islands.length) return { ok: false, error: 'no colony' };
  strength = Math.max(0.2, +strength || 1);
  const kinds = fleet || (final ? finalFleet(G) : compose(G, strength, true));
  const obs = Math.min(2, built(G, 'observatory').length);
  let warn = (final ? R().finalWarn : R().warn + R().warnPerObs * obs) * (1 + bonus(G, 'warning'));
  if (G.weather?.kind === 'fog') warn *= R().warnFog;
  const counts = {};
  for (const k of kinds) counts[k] = (counts[k] || 0) + 1;
  G.raid = {
    id: newId(G), name: 'The Crimson Gale', strength, phase: 'warn', eta: Math.round(warn), t: 0,
    ships: [], fleet: kinds, counts, loot: {}, report: [], final: !!final, downed: 0, escaped: 0,
  };
  G.threat.raids = (G.threat.raids || 0) + 1;
  G.raid.forced = !fleet && !final;   // debug / preset raids are never called off
  if (!final) schedule(G);
  G.bus.emit('raid:warn', { raid: G.raid });
  const what = Object.entries(counts).map(([k, n]) => n + ' ' + (pdef(k)?.name || k).toLowerCase() + (n > 1 ? 's' : '')).join(', ');
  notify(G, final ? 'The Dreadnought approaches the Skyforge!' : 'Sky pirates sighted: ' + what + '. They strike in ' + Math.round(warn) + ' s.', 'bad', 'skull');
  if (now) beginAttack(G);
  return { ok: true, id: G.raid.id };
}

function finalFleet(G) {
  const k = ['dreadnought', 'raider', 'raider', 'corsair'];
  if (G.difficulty === 'squall') k.push('frigate', 'raider');
  if (G.difficulty === 'breezy') k.splice(2, 1);
  return k;
}

// The last raid: called when the Skyforge's fifth stage begins.
export function startFinal(G) {
  if (!G) return { ok: false, error: 'no game' };
  G.threat = G.threat || {};
  if (G.threat.finalDone || G.goals?.flags?.dreadnoughtDown) return { ok: false, error: 'the Dreadnought is already beaten' };
  if (G.raid?.final) return { ok: false, error: 'the Dreadnought is already here' };
  if (G.raid) { G.threat.finalPending = true; return { ok: true, pending: true }; }
  G.threat.finalPending = false;
  return startRaid(G, 3, { final: true });
}

function beginAttack(G) {
  const raid = G.raid;
  raid.phase = 'attack'; raid.t = 0; raid.eta = 0;
  const r = G.rng.events;
  // where the blow falls: weighted by what stands there (the Skyforge's island for the final raid)
  const own = G.islands.filter((i) => i.owned);
  let anchor = raid.final ? (skyforgeIsland(G)?.owned ? skyforgeIsland(G) : null) : null;
  if (!anchor && own.length) {
    const w = (i) => 1 + G.buildings.filter((b) => b.island === i.id && b.state === 'built').length * (i.kind === 'home' ? 1.5 : 1);
    anchor = r.weighted(own, w);
  }
  const geo = anchor ? clusterGeo(G, anchor) : colonyGeo(G);
  raid.geo = geo;
  const roost = islandById(G, 'corsairroost');
  let ang = roost ? Math.atan2(roost.oy + roost.h / 2 - geo.cy, roost.ox + roost.w / 2 - geo.cx) : r.range(-Math.PI, Math.PI);
  if (raid.final || G.goals?.flags?.roostTaken) ang = r.range(-Math.PI, Math.PI);
  raid.fleet.forEach((k, n) => {
    const a = ang + r.range(-0.55, 0.55);
    const d = geo.r + R().spawnR + n * 1.6 + r.range(0, 3);
    spawn(G, k, geo.cx + Math.cos(a) * d, geo.cy + Math.sin(a) * d, geo.alt + 6 + r.range(0, 2));
  });
  G.bus.emit('raid:start', { raid });
  notify(G, raid.final ? 'The Dreadnought opens fire!' : 'The Crimson Gale attacks!', 'bad', 'skull');
}

function spawn(G, kind, x, y, z) {
  const d = pdef(kind);
  const geo = raidGeo(G);
  const hpMul = kind === 'dreadnought' ? (G.difficulty === 'breezy' ? 0.6 : G.difficulty === 'squall' ? 1.25 : 1) : 1;
  let hp = Math.round(d.hp * hpMul);
  if (kind === 'dreadnought' && G.threat.dreadHp > 0) hp = Math.min(hp, Math.round(G.threat.dreadHp + 0.25 * hp));
  const p = {
    id: newId(G), kind, x, y, z, vx: 0, vy: 0, vz: 0,
    hdg: Math.atan2(geo.cy - y, geo.cx - x), hp, maxHp: Math.round(d.hp * hpMul),
    state: 'approach', target: null, ammo: d.weapon.ammo ?? 99, cd: 1 + G.rng.combat() * 2, cd2: 2, loot: {}, t: 0, isle: null, orbit: G.rng.combat() * 6.28,
  };
  G.pirates.push(p);
  G.raid?.ships.push(p.id);
  G.bus.emit('pirate:spawn', { p });
  return p;
}

// ---------- targets -----------------------------------------------------------------------
const VALUE = { warehouse: 3, townhall: 2.5, bakery: 2.2, windmill: 2, smelter: 2, workshop: 2, refinery: 2.2, sawmill: 1.8, farm: 1.2, market: 2, tavern: 1.6, academy: 1.6, cottage: 1, mooring: 1.5, shipyard: 1.5, harpoon: 0.6, bastion: 0.5, rod: 0.3, well: 0.3, skyforge: 2.5 };
const LOOT = ['iron', 'parts', 'aether', 'skystone', 'bread', 'planks', 'grain', 'flour', 'wood', 'coal', 'stone', 'ore'];

function pickBuilding(G, p, filter, weightFn) {
  const rng = G.rng.combat;
  const cand = [];
  for (const b of G.buildings) {
    if (b.state !== 'built' || b.type === 'skyforge' && p.kind !== 'dreadnought') continue;
    const i = islandById(G, b.island); if (!i || !i.owned) continue;
    if (filter && !filter(b)) continue;
    const q = bpos(G, b);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    let w = (weightFn ? weightFn(b) : (VALUE[b.type] ?? 1)) / (4 + d * 0.3);
    if (shieldCovers(G, b.island)) w *= 0.15;
    // spread out: avoid what another raider already goes for
    if (G.pirates.some((o) => o !== p && alive(o) && o.target && o.target.t === 'b' && o.target.id === b.id)) w *= 0.3;
    if (w > 0) cand.push({ b, w });
  }
  return cand.length ? rng.weighted(cand, (x) => x.w).b : null;
}

function pickTarget(G, p) {
  const rng = G.rng.combat;
  if (p.kind === 'corsair') {
    const opts = [];
    for (const b of G.buildings) {
      if (b.state !== 'built' || !['mooring', 'warehouse', 'townhall'].includes(b.type)) continue;
      const i = islandById(G, b.island); if (!i || !i.owned || shieldCovers(G, b.island)) continue;
      opts.push({ t: 'b', id: b.id, w: b.type === 'mooring' ? 3 : b.type === 'warehouse' ? 2 : 1 });
    }
    const geo = raidGeo(G);
    for (const s of G.ships) {
      if (s.x == null || s.hp <= 0 || !s.cargo || !Object.values(s.cargo).some((n) => n > 0)) continue;
      if (Math.hypot(s.x - geo.cx, s.y - geo.cy) > geo.r + 14) continue;
      opts.push({ t: 'ship', id: s.id, w: 2 });
    }
    if (!opts.length) return null;
    const o = rng.weighted(opts, (x) => x.w); return { t: o.t, id: o.id };
  }
  if (p.kind === 'frigate') {
    const links = G.links.filter((l) => l.state === 'built' && islandById(G, l.a)?.owned);
    if (links.length && p.ammo > 0) {
      const l = rng.weighted(links, (x) => (x.kind === 'cable' ? 2 : 1) * (G.pirates.some((o) => o !== p && o.target?.id === x.id) ? 0.3 : 1));
      return { t: 'link', id: l.id };
    }
    const b = pickBuilding(G, p, null, (x) => (['harpoon', 'bastion', 'rod', 'shieldgen'].includes(x.type) ? 3 : VALUE[x.type] ?? 1));
    return b ? { t: 'b', id: b.id } : null;
  }
  if (p.kind === 'dreadnought') {
    const isl = dreadIsland(G, p);
    return isl ? { t: 'isle', id: isl.id } : null;
  }
  const b = pickBuilding(G, p);
  return b ? { t: 'b', id: b.id } : null;
}

function skyforgeIsland(G) {
  const sf = G.buildings.find((b) => b.type === 'skyforge');
  return sf ? islandById(G, sf.island) : islandById(G, 'glimmerreach');
}
// The Dreadnought cycles over the Skyforge's island and any gun-armed island
// near it; if nothing nearby can shoot back it also sweeps over the home island.
function dreadIsland(G, p) {
  const list = [];
  const sk = skyforgeIsland(G);
  const anchor = sk && sk.owned ? sk : islandById(G, homeId(G));
  if (anchor) list.push(anchor);
  const ac = anchor ? { x: anchor.ox + anchor.w / 2, y: anchor.oy + anchor.h / 2 } : { x: 0, y: 0 };
  for (const b of G.buildings) {
    if (!['harpoon', 'bastion'].includes(b.type) || b.state !== 'built') continue;
    const i = islandById(G, b.island);
    if (!i || !i.owned || list.includes(i)) continue;
    if (Math.hypot(i.ox + i.w / 2 - ac.x, i.oy + i.h / 2 - ac.y) < 45) list.push(i);
  }
  const guns = G.buildings.some((b) => ['harpoon', 'bastion'].includes(b.type) && b.state === 'built' && list.some((i) => i.id === b.island));
  if (!guns) { const home = islandById(G, homeId(G)); if (home && !list.includes(home)) list.push(home); }
  if (!list.length) return G.islands.find((i) => i.owned) || null;
  p.leg = (p.leg ?? -1) + 1;
  return list[p.leg % list.length];
}

function targetPos(G, t) {
  if (!t) return null;
  if (t.t === 'b') { const b = G.buildings.find((x) => x.id === t.id); return b && b.state === 'built' ? { ...bpos(G, b), b } : null; }
  if (t.t === 'link') { const l = G.links.find((x) => x.id === t.id); return l && l.state === 'built' ? { ...linkPos(G, l), l } : null; }
  if (t.t === 'ship') { const s = G.ships.find((x) => x.id === t.id); return s && s.x != null && s.hp > 0 ? { x: s.x, y: s.y, z: s.z ?? 0, s } : null; }
  if (t.t === 'isle') { const i = islandById(G, t.id); return i ? { x: i.ox + i.w / 2, y: i.oy + i.h / 2, z: i.alt, i } : null; }
  return null;
}

// ---------- flight ----------------------------------------------------------------------------
function fly(G, p, tx, ty, tz, dt, speedMul = 1) {
  const d = pdef(p.kind);
  const w = G.weather || {};
  const gale = w.gale ? 0.8 : 1;
  const want = Math.atan2(ty - p.y, tx - p.x);
  const turn = d.turn * dt;
  p.hdg += clamp(angDiff(p.hdg, want), -turn, turn);
  if (p.hdg > Math.PI) p.hdg -= Math.PI * 2; else if (p.hdg < -Math.PI) p.hdg += Math.PI * 2;
  const sp = d.speed * speedMul * gale;
  p.vx = Math.cos(p.hdg) * sp + (w.wind?.x || 0) * 0.25;
  p.vy = Math.sin(p.hdg) * sp + (w.wind?.y || 0) * 0.25;
  p.x += p.vx * dt; p.y += p.vy * dt;
  const dz = tz - p.z;
  p.vz = clamp(dz * 1.5, -d.climb, d.climb);
  p.z += p.vz * dt;
}

// ---------- behaviours -----------------------------------------------------------------------
function retreat(G, p, why) {
  if (p.state === 'retreat' || !alive(p)) return;
  p.state = 'retreat'; p.target = null; p.t = 0;
  G.bus.emit('pirate:retreat', { p, why });
}

function steal(G, p, island, from) {
  const d = pdef(p.kind);
  let room = d.loot - Object.values(p.loot).reduce((s, n) => s + n, 0);
  if (room <= 0) return 0;
  let got = 0;
  for (const r of LOOT) {
    if (room <= 0) break;
    let k;
    if (from) { const have = from[r] || 0; k = Math.min(have, room, Math.ceil(d.loot * 0.6)); from[r] = have - k; }
    else k = take(G, island, r, Math.min(room, Math.ceil(d.loot * 0.6)));
    k = Math.floor(k);
    if (k > 0) {
      p.loot[r] = (p.loot[r] || 0) + k; room -= k; got += k;
      G.raid.loot[r] = (G.raid.loot[r] || 0) + k;
      report(G, 'loot', 'Plundered by corsairs', -k, r);
    }
  }
  return got;
}

function stepCorsair(G, p, dt, tp) {
  const d = pdef(p.kind);
  if (p.state === 'board') {
    p.vx = p.vy = 0;
    p.t += dt;
    if (p.t >= d.weapon.board) {
      let got = 0;
      if (tp.s) got = steal(G, p, null, tp.s.cargo);
      else if (tp.b) got = steal(G, p, tp.b.island, null);
      if (tp.s) { tp.s.delay = (tp.s.delay || 0) + 60; tp.s.hp = Math.max(1, (tp.s.hp || 1) - 15); report(G, 'shiphit', 'Trade ship boarded and delayed', 0, null, 'bad', '+1 min'); }
      G.bus.emit('pirate:steal', { p, n: got });
      retreat(G, p, got ? 'loot' : 'empty');
    }
    return;
  }
  const tz = tp.z + 1.4;
  const dist = Math.hypot(tp.x - p.x, tp.y - p.y);
  fly(G, p, tp.x, tp.y, dist < 6 ? tz : tz + 2, dt, dist < 3 ? 0.6 : 1);
  if (tp.s) { p.x += (tp.s.vx || 0) * dt; p.y += (tp.s.vy || 0) * dt; }
  if (dist < 0.7 && Math.abs(p.z - tz) < 0.8) { p.state = 'board'; p.t = 0; }
}

function stepRaider(G, p, dt, tp) {
  const d = pdef(p.kind); const wpn = d.weapon;
  const cruise = tp.z + d.alt;
  p.cd -= dt;
  if (p.state === 'egress') {
    p.t += dt;
    fly(G, p, p.x + Math.cos(p.hdg) * 5, p.y + Math.sin(p.hdg) * 5, cruise, dt);
    if (p.t > 2.6) { p.state = 'attack'; p.t = 0; if (G.rng.combat() < 0.35) p.target = pickTarget(G, p); }
    return;
  }
  fly(G, p, tp.x, tp.y, cruise, dt);
  // release when the bomb's landing point (with our velocity) lies on the target
  const fallH = Math.max(0.5, p.z - tp.z);
  const tf = Math.sqrt((2 * fallH) / C().combat.gravity);
  const lx = p.x + p.vx * tf, ly = p.y + p.vy * tf;
  if (p.cd <= 0 && p.ammo > 0 && Math.hypot(lx - tp.x, ly - tp.y) < 0.9) {
    fire(G, 'bomb', 'pirate', p.id, p.x, p.y, p.z - 0.4, lx, ly, tp.z, { vx: p.vx, vy: p.vy, vz: 0, life: tf + 2, grav: true, dmg: wpn.dmg, splash: wpn.splash, fire: wpn.fire });
    p.ammo--; p.cd = wpn.reload; p.state = 'egress'; p.t = 0;
    return;
  }
  // overshot or coming in at an angle: fly on and line up a fresh, straight run
  const dist = Math.hypot(tp.x - p.x, tp.y - p.y);
  const off = Math.abs(angDiff(p.hdg, Math.atan2(tp.y - p.y, tp.x - p.x)));
  if (dist < Math.hypot(p.vx, p.vy) * tf + 2.5 && off > 0.5) { p.state = 'egress'; p.t = 0.6; }
}

function stepFrigate(G, p, dt, tp) {
  const d = pdef(p.kind); const wpn = d.weapon;
  p.cd -= dt; p.cd2 -= dt;
  // circle the target at stand-off range
  p.orbit += dt * 0.35;
  const rr = tp.l ? 4 : 5;
  const ox = tp.x + Math.cos(p.orbit) * rr, oy = tp.y + Math.sin(p.orbit) * rr;
  fly(G, p, ox, oy, tp.z + d.alt, dt, 0.9);
  const dist = Math.hypot(tp.x - p.x, tp.y - p.y);
  if (tp.l && p.cd <= 0 && p.ammo > 0 && dist <= wpn.range) {
    fire(G, 'grapple', 'pirate', p.id, p.x, p.y, p.z - 0.3, tp.x, tp.y, tp.z, { speed: 12, dmg: wpn.dmg, target: tp.l.id });
    p.ammo--; p.cd = wpn.reload;
    if (p.ammo <= 0) p.target = pickTarget(G, p);
  }
  // cannon at defences in reach (or the target building)
  const cn = wpn.cannon;
  if (p.cd2 <= 0) {
    const t = gunTarget(G, p, cn.range, tp.b);
    if (t) {
      fire(G, 'cannon', 'pirate', p.id, p.x, p.y, p.z - 0.3, t.x + G.rng.combat.range(-0.4, 0.4), t.y + G.rng.combat.range(-0.4, 0.4), t.z,
        { ballistic: true, speed: cn.speed, dmg: cn.dmg, splash: 1 });
      p.cd2 = cn.reload;
    } else p.cd2 = 0.5;
  }
  p.siege = tp.l ? 0 : (p.siege || 0) + dt;
  if (p.siege > 45) retreat(G, p, 'done');
}

// The nearest defence (battery, rod, shield) or militia ship within range, else `fallback`.
function gunTarget(G, p, range, fallback) {
  let best = null, bd = range;
  for (const b of G.buildings) {
    if (b.state !== 'built' || !['harpoon', 'bastion', 'rod', 'shieldgen'].includes(b.type)) continue;
    const q = bpos(G, b); const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = { x: q.x, y: q.y, z: q.z + 0.3 }; }
  }
  for (const m of G.defend.fleet || []) {
    if (m.hp <= 0) continue;
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < bd * 0.9) { bd = d; best = { x: m.x + (m.vx || 0) * 0.6, y: m.y + (m.vy || 0) * 0.6, z: m.z }; }
  }
  if (best) return best;
  if (fallback) { const q = bpos(G, fallback); if (Math.hypot(q.x - p.x, q.y - p.y) <= range) return { x: q.x, y: q.y, z: q.z }; }
  return null;
}

function stepDreadnought(G, p, dt, tp) {
  const d = pdef(p.kind); const wpn = d.weapon;
  p.cd -= dt; p.cd2 -= dt;
  const isl = tp.i;
  const rr = Math.max(isl.w, isl.h) * 0.35 + 1;
  p.orbit += dt * 0.1;
  fly(G, p, tp.x + Math.cos(p.orbit) * rr, tp.y + Math.sin(p.orbit) * rr, isl.alt + d.alt, dt);
  // linger over each island a while (the clock runs only once it has arrived)
  if (Math.hypot(tp.x - p.x, tp.y - p.y) < rr + 5) p.lt = (p.lt || 0) + dt;
  if (p.lt > 80) { p.lt = 0; p.target = pickTarget(G, p); }
  if (p.cd <= 0) {
    p.cd = wpn.reload;
    for (let g = 0; g < wpn.guns; g++) {
      const t = g === 0 ? gunTarget(G, p, wpn.range, null) : null;
      const b = t ? null : pickBuilding(G, p, (x) => { const q = bpos(G, x); return Math.hypot(q.x - p.x, q.y - p.y) <= wpn.range; });
      const q = t || (b && bpos(G, b));
      if (!q) continue;
      fire(G, 'cannon', 'pirate', p.id, p.x + G.rng.combat.range(-1, 1), p.y, p.z - 0.6,
        q.x + G.rng.combat.range(-0.6, 0.6), q.y + G.rng.combat.range(-0.6, 0.6), q.z, { ballistic: true, speed: wpn.speed, dmg: wpn.dmg, splash: 1.1, fire: 0.12 });
    }
  }
  if (p.cd2 <= 0) {
    p.cd2 = wpn.bomb.reload;
    fire(G, 'bomb', 'pirate', p.id, p.x, p.y, p.z - 1, p.x, p.y, isl.alt, { vx: p.vx, vy: p.vy, vz: 0, life: 4, grav: true, dmg: wpn.bomb.dmg, splash: wpn.bomb.splash, fire: wpn.bomb.fire });
  }
  // escorts join the fight
  G.raid.escortT = (G.raid.escortT || 0) + dt;
  if (G.raid.escortT >= wpn.escorts) {
    G.raid.escortT = 0;
    if (G.pirates.filter(alive).length < (G.difficulty === 'squall' ? 7 : 5)) {
      const k = G.rng.events() < 0.6 ? 'raider' : 'corsair';
      const geo = raidGeo(G); const a = G.rng.events.range(-Math.PI, Math.PI);
      spawn(G, k, geo.cx + Math.cos(a) * (geo.r + R().spawnR), geo.cy + Math.sin(a) * (geo.r + R().spawnR), geo.alt + 6);
    }
  }
}

function stepPirate(G, p, dt) {
  const d = pdef(p.kind);
  if (p.state === 'down') {
    p.fall += dt; p.vz -= 6 * dt; p.z += p.vz * dt; p.x += p.vx * 0.5 * dt; p.y += p.vy * 0.5 * dt;
    p.hdg += dt * 0.4;
    if (p.fall > 2.6) { p.state = 'gone'; G.bus.emit('boom', { x: p.x, y: p.y, z: p.z, size: p.kind === 'dreadnought' ? 4 : 1.6, kind: 'wreck' }); }
    return;
  }
  const geo = raidGeo(G);
  if (p.state === 'retreat') {
    const a = Math.atan2(p.y - geo.cy, p.x - geo.cx);
    fly(G, p, p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10, geo.alt + 8, dt, 1.1);
    if (Math.hypot(p.x - geo.cx, p.y - geo.cy) > geo.r + R().exitR) {
      p.state = 'gone';
      const n = Object.values(p.loot).reduce((s, k) => s + k, 0);
      if (G.raid) G.raid.escaped++;
      G.bus.emit('pirate:escape', { p, loot: p.loot });
      if (p.kind === 'dreadnought') G.threat.dreadHp = p.hp;
      if (n > 0) report(G, 'escaped', 'Pirates escaped with plunder', 0, null, 'bad', n + ' goods');
    }
    return;
  }
  p.t += dt;
  if (d.retreatAt && p.hp < p.maxHp * d.retreatAt) { retreat(G, p, 'hurt'); return; }
  if (G.raid && G.raid.phase === 'retreat' && p.kind !== 'dreadnought') { retreat(G, p, 'recalled'); return; }
  if (p.kind === 'raider' && p.ammo <= 0 && p.state !== 'egress') { retreat(G, p, 'spent'); return; }
  let tp = targetPos(G, p.target);
  if (!tp) {
    if (p.state !== 'board') { p.target = pickTarget(G, p); tp = targetPos(G, p.target); }
    if (!tp) {
      if (p.kind === 'dreadnought') { p.target = { t: 'isle', id: homeId(G) }; tp = targetPos(G, p.target); }
      if (!tp) { retreat(G, p, 'nothing'); return; }
    }
    if (p.state === 'board') p.state = 'attack';
  }
  if (p.state === 'approach') {
    if (Math.hypot(tp.x - p.x, tp.y - p.y) < 12) p.state = 'attack';
  }
  if (p.kind === 'corsair') stepCorsair(G, p, dt, tp);
  else if (p.kind === 'raider') stepRaider(G, p, dt, tp);
  else if (p.kind === 'frigate') stepFrigate(G, p, dt, tp);
  else stepDreadnought(G, p, dt, tp);
}

// ---------- raid life cycle -------------------------------------------------------------------------
function endRaid(G) {
  const raid = G.raid;
  const total = raid.ships.length;
  const result = raid.downed >= total ? 'repelled' : raid.downed > 0 ? 'driven off' : 'plundered';
  if (raid.final && G.goals?.flags?.dreadnoughtDown) G.threat.finalDone = true;
  const title = raid.final ? (G.threat.finalDone ? 'The Dreadnought falls' : 'The Dreadnought withdrew') : result === 'repelled' ? 'Raid repelled' : result === 'driven off' ? 'Raiders driven off' : 'The raiders got away';
  closeReport(G, title, result);
  G.threat.lastReport.downed = raid.downed; G.threat.lastReport.ships = total; G.threat.lastReport.loot = { ...raid.loot };
  G.goals.flags = G.goals.flags || {};
  G.goals.flags.raidsSurvived = (G.goals.flags.raidsSurvived || 0) + 1;
  G.raid = null;
  G.bus.emit('raid:end', { raid: { ...raid, phase: 'over', result, report: G.threat.lastReport.lines } });
  notify(G, title + (raid.downed ? ': ' + raid.downed + ' of ' + total + ' ships shot down.' : '.'), result === 'plundered' ? 'warn' : 'good', raid.final ? 'star' : 'shield');
  if (G.threat.finalPending) startFinal(G);
}

function eligible(G) {
  if (raidsOver(G)) return false;
  return (G.goals?.chapter || 1) >= diff(G).raidCh;
}

export function init(G) {
  G.pirates = G.pirates || [];
  G.raid = G.raid || null;
  G.threat = G.threat || {};
  Object.assign(G.threat, { nextRaidAt: null, raids: 0, finalPending: false, finalDone: false, raidChapter: G.goals?.chapter || 1 });
}
export function hydrate(G) {
  G.pirates = G.pirates || [];
  G.threat = G.threat || {};
  if (G.threat.raids == null) G.threat.raids = 0;
}

export function step(G, dt) {
  const T = G.threat;
  // scheduling
  const ch = G.goals?.chapter || 1;
  if (G.tmp.quiet && T.nextRaidAt != null && !G.raid) T.nextRaidAt += dt;
  if (!G.raid && !G.tmp.quiet) {
    if (eligible(G)) {
      if (T.nextRaidAt == null) schedule(G, true);
      if (ch !== T.raidChapter && ch === 5) {
        // Storm Season: make sure a raid comes soon
        const soon = Math.round(G.t + R().storyRaid * G.rng.events.range(0.7, 1));
        if (T.nextRaidAt > soon) T.nextRaidAt = soon;
      }
      if (G.t >= T.nextRaidAt) startRaid(G, autoStrength(G), { fleet: compose(G, autoStrength(G), false) });
    } else if (raidsOver(G)) T.nextRaidAt = null;
  } else if (raidsOver(G) && !G.raid.final && G.raid.phase === 'warn' && !G.raid.forced) {
    G.raid = null;
    notify(G, 'The pirate sails turn away: the Crimson Gale is broken.', 'good', 'skull');
  }
  T.raidChapter = ch;
  G.tmp.raidEta = raidEta(G);
  const raid = G.raid;
  if (raid) {
    raid.t += dt;
    if (raid.phase === 'warn') {
      raid.eta = Math.max(0, raid.eta - dt);
      if (raid.eta <= 0) beginAttack(G);
    } else if (raid.phase === 'attack' && raid.t >= (raid.final ? R().finalMax : R().attackMax)) {
      raid.phase = 'retreat'; raid.t = 0;
      if (raid.final) {
        for (const p of G.pirates) retreat(G, p, 'refit');
        notify(G, 'The Dreadnought withdraws to refit. It will be back.', 'warn', 'skull');
      }
      G.bus.emit('raid:retreat', { raid });
    }
  }
  // fly
  for (const p of G.pirates) stepPirate(G, p, dt);
  if (G.raid?.final && G.goals?.flags?.dreadnoughtDown && G.raid.phase === 'attack') {
    G.raid.phase = 'retreat'; G.raid.t = 0;
    for (const p of G.pirates) retreat(G, p, 'flagship');
  }
  // tidy
  if (G.pirates.some((p) => p.state === 'gone')) {
    G.pirates = G.pirates.filter((p) => p.state !== 'gone');
  }
  if (raid && raid.phase !== 'warn' && !G.pirates.length) endRaid(G);
}
