// Combat (THREATS): projectiles, hits, pirate damage and downing, building
// damage and hp, fire (spread, wells, bucket brigades, rain), ruins.
// Also the small shared helpers weather.js, raids.js and defence.js use.
//
// Data this module owns or writes:
//   G.shots   [{ id, kind:'harpoon'|'flak'|'militia'|'bomb'|'cannon'|'grapple'|'lash',
//               team:'colony'|'pirate', x, y, z, vx, vy, vz, tx, ty, tz (aim point),
//               t (s since fired), life (s left), dmg, from, target, splash, fuse, grav }]
//   Building  hp, maxHp (filled from CFG.threats.combat when the owner leaves them
//             unset), fire 0..1, state 'ruin' when burnt out or bombed flat (paid
//             repair is ECONOMY's islands.repair), free mending of dents when calm
//   Link      hp (links.js breaks a built link at hp 0)
//   G.threat  { report:[lines] } of the current incident when no raid is active,
//             lastReport { title, lines, at, result } after a raid or storm ends
//   G.tmp.brigades [{ b, n }] bucket brigades (render walks settlers with buckets)
// Report lines: { key, text, n, res, value, tone:'bad'|'good'|'info' }; `value`
// is the right-hand column ("-40 grain", "+25 coin", "en route").
// Deterministic: randomness only from G.rng.combat.
import { CFG } from '../config.js';
import { BUILDINGS } from '../content/buildings.js';
import { PIRATES } from '../content/pirates.js';
import { newId } from '../state.js';
import * as research from './research.js';

const C = () => CFG.threats;

// ---------- shared helpers ---------------------------------------------------------
let bmap = null;
export function bdef(type) {
  if (!bmap || bmap.size !== BUILDINGS.length) bmap = new Map(BUILDINGS.map((b) => [b.id, b]));
  return bmap.get(type) || null;
}
export const pdef = (kind) => PIRATES.find((p) => p.id === kind);
export const bname = (b) => bdef(b.type)?.name || b.type[0].toUpperCase() + b.type.slice(1);
export function bsize(b) {
  const d = bdef(b.type);
  const s = (d && (d.size || d.footprint)) || [1, 1];
  return [s[0] || 1, s[1] || s[0] || 1];
}
export const height = (type) => C().heights[type] ?? 1.2;
// Research bonus (PROGRESSION's research.bonus: 'defence', 'warning', 'raidDamage',
// 'stormDamage', 'fireSpread' fractions), 0 when absent.
export function bonus(G, key) { try { return +(research.bonus?.(G, key)) || 0; } catch (e) { return 0; } }
export const islandById = (G, id) => G.islands.find((i) => i.id === id) || null;

// World position of a building's centre (x, y) and ground altitude z; top = z + height.
export function bpos(G, b) {
  const i = islandById(G, b.island);
  const [w, d] = bsize(b);
  if (!i) return { x: b.u + w / 2, y: b.v + d / 2, z: 0, top: height(b.type) };
  return { x: i.ox + b.u + w / 2, y: i.oy + b.v + d / 2, z: i.alt, top: i.alt + height(b.type) };
}

// The world point at the middle of a link (a or b end cells when known).
export function linkPos(G, l) {
  const a = islandById(G, l.a), b = islandById(G, l.b);
  if (!a || !b) return null;
  const ax = a.ox + (l.au ?? a.w / 2) + 0.5, ay = a.oy + (l.av ?? a.h / 2) + 0.5;
  const bx = b.ox + (l.bu ?? b.w / 2) + 0.5, by = b.oy + (l.bv ?? b.h / 2) + 0.5;
  return { x: (ax + bx) / 2, y: (ay + by) / 2, z: (a.alt + b.alt) / 2 + (l.kind === 'cable' ? 1.2 : 0.2), ax, ay, bx, by };
}

export const live = (b) => b.state === 'built';
export const ownedIsland = (G, id) => { const i = islandById(G, id); return !!(i && i.owned); };
export const built = (G, type) => G.buildings.filter((b) => b.type === type && b.state === 'built' && ownedIsland(G, b.island));
export const hasTech = (G, id) => !id || G.research.done.includes(id);

export function rootOf(G, island) { return (G.tmp.netOf && G.tmp.netOf[island]) || island; }
export function poolOf(G, island) {
  const r = rootOf(G, island);
  return G.pools[r] || null;
}
export const homeId = (G) => (G.islands.find((i) => i.kind === 'home') || G.islands.find((i) => i.owned) || { id: 'hearthrock' }).id;

// Stock of a resource for an island's network (coin and insight are colony-wide).
export function stock(G, island, res) {
  if (res === 'coin' || res === 'insight') return G.colony[res] ?? G.pools.colony?.res?.[res] ?? 0;
  return poolOf(G, island)?.res?.[res] ?? 0;
}
export function take(G, island, res, n) {
  if (n <= 0) return 0;
  if (res === 'coin' || res === 'insight') {
    const have = G.colony[res] ?? 0; const k = Math.min(have, n); G.colony[res] = have - k; return k;
  }
  const p = poolOf(G, island); if (!p || !p.res) return 0;
  const have = p.res[res] || 0; const k = Math.min(have, n);
  p.res[res] = have - k; return k;
}
export function put(G, island, res, n) {
  if (n <= 0) return 0;
  if (res === 'coin' || res === 'insight') { G.colony[res] = (G.colony[res] ?? 0) + n; return n; }
  const p = poolOf(G, island); if (!p) return 0;
  p.res = p.res || {};
  const cap = p.cap?.[res];
  const room = cap != null ? Math.max(0, cap - (p.res[res] || 0)) : n;
  const k = Math.min(room, n);
  p.res[res] = (p.res[res] || 0) + k; return k;
}
export function canPay(G, island, cost) {
  for (const [r, n] of Object.entries(cost || {})) {
    if (r === 'charge') { if ((G.defend.lash.charge || 0) + 1e-9 < n) return r; continue; }
    if (stock(G, island, r) + 1e-9 < n) return r;
  }
  return null;
}
export function pay(G, island, cost) {
  for (const [r, n] of Object.entries(cost || {})) {
    if (r === 'charge') G.defend.lash.charge = Math.max(0, G.defend.lash.charge - n);
    else take(G, island, r, n);
  }
}

export function notify(G, text, kind = 'info', icon = 'skull', at = null) {
  const n = { text, kind, icon, ...(at || {}) };
  G.log = G.log || [];
  G.log.push({ t: G.t, kind, text, icon });
  if (G.log.length > 50) G.log.splice(0, G.log.length - 50);
  G.bus.emit('notify', n);
}

// ---------- incident report ------------------------------------------------------------
function reportList(G) {
  if (G.raid) return (G.raid.report = G.raid.report || []);
  G.threat = G.threat || {};
  return (G.threat.report = G.threat.report || []);
}
// Add to (or create) a report line. n accumulates (per resource in `by`); value is
// rebuilt from the totals ("-40 grain", or "-52 goods" when several kinds were lost).
export function report(G, key, text, n = 0, res = null, tone = 'bad', value = null) {
  const L = reportList(G);
  let line = L.find((l) => l.key === key);
  if (!line) { line = { key, text, n: 0, res, tone, value: '' }; L.push(line); if (L.length > 12) L.shift(); }
  line.text = text; line.tone = tone; line.n += n;
  if (res && n) { line.by = line.by || {}; line.by[res] = (line.by[res] || 0) + n; }
  if (value != null) line.value = value;
  else if (res) {
    const kinds = Object.keys(line.by || { [res]: 1 });
    line.res = kinds.length === 1 ? kinds[0] : 'goods';
    const v = Math.round(line.n);
    line.value = (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v) + ' ' + line.res;
  }
  return line;
}
export function closeReport(G, title, result) {
  const lines = G.raid ? G.raid.report : (G.threat?.report || []);
  G.threat = G.threat || {};
  G.threat.lastReport = { title, result, at: G.t, lines: (lines || []).map((l) => ({ ...l })) };
  G.threat.report = [];
}

// ---------- buildings: hp, damage, fire, ruins ------------------------------------------
export function maxHpFor(type) {
  const c = C().combat;
  const d = bdef(type);
  if (d && d.hp > 0) return d.hp;
  if (c.hpByType[type]) return c.hpByType[type]; const s = (d && d.size) || [1, 1];
  const a = Math.max(s[0] || 1, s[1] || 1);
  return c.hpBySize[Math.min(c.hpBySize.length - 1, a - 1)];
}
export function ensureHp(b) {
  if (!(b.maxHp > 0)) b.maxHp = maxHpFor(b.type);
  if (b.hp == null || Number.isNaN(b.hp)) b.hp = b.state === 'ruin' ? 0 : b.maxHp;
  if (b.fire == null) b.fire = 0;
}
const floorHp = (G, b) => (b.type === 'skyforge' || !C().difficulty[G.difficulty || 'standard']?.ruin ? 1 : 0);

export function damageBuilding(G, b, dmg, by = 'raid') {
  if (!b || b.state !== 'built' || dmg <= 0) return;
  ensureHp(b);
  const floor = floorHp(G, b);
  b.hp = Math.max(floor, b.hp - dmg);
  G.bus.emit('build:damaged', { b, by });
  if (b.hp <= 0) ruin(G, b, by);
}

export function ignite(G, b, amount = 0.2, by = 'fire') {
  if (!b || b.state !== 'built' || amount <= 0) return;
  ensureHp(b);
  if (G.defend?.shield?.on && G.defend.shield.island === b.island && by !== 'spread') return;
  const was = b.fire > 0;
  b.fire = Math.min(1, b.fire + amount);
  if (!was) {
    G.bus.emit('fire:start', { b });
    report(G, 'fire:' + b.id, bname(b) + ' on fire', 0, null, 'bad', 'burning');
    G.threat = G.threat || {};
    if (!G.threat.fireNote || G.t - G.threat.fireNote > 6) {
      G.threat.fireNote = G.t;
      const { x, y } = bpos(G, b);
      notify(G, bname(b) + ' is on fire!', 'bad', 'fire', { island: b.island, u: b.u, v: b.v, x, y });
    }
  }
}

function ruin(G, b, by) {
  b.state = 'ruin'; b.hp = 0; b.fire = 0; b.repairing = false;
  b.stall = 'damaged';
  G.bus.emit('build:ruined', { b, by });
  G.bus.emit('boom', { ...bpos(G, b), size: 1.4 });
  report(G, 'fire:' + b.id, bname(b) + ' burnt to a ruin', 0, null, 'bad', 'repair');
  notify(G, bname(b) + ' was destroyed. Repair it from the inspector.', 'bad', 'ruin', { island: b.island, u: b.u, v: b.v });
  G.tmp.netsDirty = true;
}

const STORE = new Set(['warehouse', 'townhall', 'mooring']);
const FLAMMABLE = ['grain', 'wood', 'planks', 'flour', 'bread'];

function stepFire(G, dt) {
  const c = C().combat;
  const w = G.weather || {};
  const kind = (w.kind || 'clear');
  const wind = Math.hypot(w.wind?.x || 0, w.wind?.y || 0);
  const rain = kind === 'rain' ? 0.7 * (0.5 + 0.5 * (w.power || 0.6)) : kind === 'storm' ? 0.8 + 0.2 * (w.power || 0) : kind === 'fog' ? 0.15 : 0;
  const growMul = (kind === 'breeze' ? 1.35 : kind === 'rain' ? 0.5 : 1) * (1 + 0.5 * wind);
  const burning = [];
  for (const b of G.buildings) if (b.fire > 0) burning.push(b);
  G.tmp.brigades = [];
  if (!burning.length) return;
  // settlers with buckets: idle settlers first, more where wells are
  const wells = G.buildings.filter((b) => b.type === 'well' && b.state === 'built');
  let crew = Math.max(0, Math.floor(G.colony.idle || 0)) + Math.min(4, Math.floor((G.colony.pop || 0) / 12));
  const rng = G.rng.combat;
  for (const b of burning) {
    if (b.state !== 'built') { b.fire = 0; continue; }
    ensureHp(b);
    const p = bpos(G, b);
    let nw = 0;
    for (const wl of wells) {
      if (wl.island !== b.island) continue;
      const q = bpos(G, wl); if (Math.hypot(q.x - p.x, q.y - p.y) <= c.wellR) nw++;
    }
    nw = Math.min(nw, c.wellMax);
    const want = Math.min(c.brigadeMax + nw * c.brigadePerWell, 12);
    const n = Math.min(crew, want); crew -= n;
    if (n > 0) G.tmp.brigades.push({ b: b.id, n });
    const out = c.fireOutBase + nw * c.wellOut + n * c.brigadeOut + rain * c.rainOut;
    const grow = c.fireGrow * growMul * (0.4 + b.fire);
    b.fire = Math.min(1, b.fire + (grow - out) * dt);
    // burn
    const floor = floorHp(G, b);
    b.hp = Math.max(floor, b.hp - b.fire * c.fireBurn * dt);
    if (STORE.has(b.type) && b.fire > 0.15) {
      const loss = b.fire * c.stockBurn * dt;
      for (const r of FLAMMABLE) {
        const k = take(G, b.island, r, loss * (r === 'grain' ? 1 : 0.5));
        if (k > 0) report(G, 'fire:' + b.id, bname(b) + ' on fire', -k, r);
      }
    }
    // spread to neighbours (downwind more likely)
    if (b.fire > 0.3 && rng() < b.fire * c.fireSpread * (1 - bonus(G, 'fireSpread')) * dt * (1 + wind)) {
      const cand = [];
      for (const o of G.buildings) {
        if (o === b || o.island !== b.island || o.state !== 'built' || o.fire > 0) continue;
        const q = bpos(G, o); const dx = q.x - p.x, dy = q.y - p.y; const d = Math.hypot(dx, dy);
        if (d > c.spreadR + (bsize(o)[0] - 1) * 0.5) continue;
        const down = 1 + Math.max(0, (dx * (w.wind?.x || 0) + dy * (w.wind?.y || 0)) / (d || 1));
        cand.push({ o, w: down / (0.5 + d) });
      }
      if (cand.length) ignite(G, rng.weighted(cand, (x) => x.w).o, 0.15, 'spread');
    }
    if (b.hp <= 0) { ruin(G, b, 'fire'); continue; }
    if (b.fire <= 0) {
      b.fire = 0;
      G.bus.emit('fire:out', { b });
      const line = reportList(G).find((l) => l.key === 'fire:' + b.id);
      if (line) { line.text = bname(b) + ': fire out'; line.tone = line.n < -0.5 ? 'warn' : 'good'; if (!(line.n < -0.5)) line.value = 'saved'; }
    }
  }
  const total = G.tmp.brigades.reduce((s, x) => s + x.n, 0);
  if (total > 0) report(G, 'brigade', 'Bucket brigade: ' + total + ' settlers', 0, null, 'good', 'en route');
}

// Free mending of dents once the danger has passed. Paid repairs of ruins and
// heavy damage are ECONOMY's (islands.repair: b.repairing, healed by builders).
function stepMend(G, dt) {
  const c = C().combat;
  const calm = !G.raid || G.raid.phase === 'warn';
  if (!calm) return;
  for (const b of G.buildings) {
    if (b.state !== 'built' || b.repairing || b.fire > 0 || !(b.hp < b.maxHp)) continue;
    b.hp = Math.min(b.maxHp, b.hp + c.heal * dt);
  }
}

// ---------- links and ships ---------------------------------------------------------------
export function damageLink(G, l, dmg, by = 'frigate') {
  if (!l || l.state !== 'built' || !(l.hp > 0)) return;
  l.cutReported = false;
  const ruinOk = C().difficulty[G.difficulty || 'standard']?.ruin;
  l.hp = Math.max(ruinOk ? 0 : 1, l.hp - dmg);
  G.bus.emit('link:damaged', { l, by });
  if (l.hp <= 0 && !l.cutReported) {
    // links.js turns a built link with hp 0 into 'broken' and splits the network
    l.cutReported = true;
    G.tmp.netsDirty = true;
    const a = islandById(G, l.a), b = islandById(G, l.b);
    const what = (l.kind === 'cable' ? 'Cable car ' : 'Bridge ') + (a?.name || l.a) + ' \u2013 ' + (b?.name || l.b);
    report(G, 'link:' + l.id, what + ' cut', 0, null, 'bad', 'rebuild');
    notify(G, what + ' was torn loose by pirate harpoons!', 'bad', 'link');
  }
}

// ---------- pirates: hits and downing ---------------------------------------------------------
export function hitPirate(G, p, dmg, by = 'harpoon') {
  if (!p || p.state === 'down' || p.state === 'gone' || dmg <= 0) return false;
  p.hp -= dmg;
  p.hitT = G.t;
  G.bus.emit('pirate:hit', { p, by, dmg });
  if (p.hp <= 0) { downPirate(G, p, by); return true; }
  return false;
}

export function downPirate(G, p, by) {
  p.hp = 0; p.state = 'down'; p.fall = 0; p.vz = 0;
  const d = pdef(p.kind) || {};
  const home = homeId(G);
  if (d.bounty) { put(G, home, 'coin', d.bounty); report(G, 'bounty', 'Pirates shot down', d.bounty, 'coin', 'good'); }
  let back = 0;
  for (const [r, n] of Object.entries(p.loot || {})) { back += put(G, home, r, n); }
  if (back > 0) report(G, 'recovered', 'Plunder recovered', back, 'goods', 'good');
  p.loot = {};
  G.threat = G.threat || {};
  G.threat.downed = (G.threat.downed || 0) + 1;
  if (G.raid && G.raid.ships.includes(p.id)) G.raid.downed = (G.raid.downed || 0) + 1;
  G.bus.emit('pirate:down', { p, kind: p.kind, by });
  if (p.kind === 'dreadnought') {
    G.goals.flags = G.goals.flags || {};
    G.goals.flags.dreadnoughtDown = true;
    notify(G, 'The Dreadnought is going down! The Crimson Gale is broken.', 'good', 'skull');
  }
}

// ---------- projectiles --------------------------------------------------------------------
// Ballistic or straight shot from (x,y,z) to (tx,ty,tz). Straight shots fly at
// `speed`; ballistic ones (bomb/cannon) follow gravity and arrive in dist/speed s.
export function fire(G, kind, team, from, x, y, z, tx, ty, tz, o = {}) {
  const speed = o.speed || 14;
  const dx = tx - x, dy = ty - y, dz = tz - z;
  const d = Math.hypot(dx, dy, dz) || 1;
  let vx, vy, vz, life;
  if (o.ballistic) {
    const T = Math.max(0.35, Math.hypot(dx, dy) / speed);
    vx = dx / T; vy = dy / T; vz = (dz + 0.5 * C().combat.gravity * T * T) / T; life = T + 3;
  } else {
    vx = (dx / d) * speed; vy = (dy / d) * speed; vz = (dz / d) * speed; life = o.life || d / speed + 0.6;
  }
  if (o.vx != null) { vx = o.vx; vy = o.vy; vz = o.vz; life = o.life || 6; }
  const s = { id: newId(G), kind, team, from, x, y, z, vx, vy, vz, life, t: 0, dmg: o.dmg || 10,
    target: o.target ?? null, splash: o.splash || 0, fire: o.fire || 0, fuse: o.fuse ?? null,
    grav: !!(o.ballistic || o.grav), tx, ty, tz };
  G.shots.push(s);
  G.bus.emit('shot', { kind, x, y, z, tx, ty, tz, from, id: s.id });
  return s;
}

// Lead aim: where to shoot a straight shot of speed v from (x,y,z) to meet target p.
export function lead(x, y, z, p, v) {
  const rx = p.x - x, ry = p.y - y, rz = p.z - z;
  const vx = p.vx || 0, vy = p.vy || 0;
  const a = vx * vx + vy * vy - v * v;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry + rz * rz;
  let t;
  if (Math.abs(a) < 1e-6) t = -c / (b || -1);
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) t = Math.hypot(rx, ry, rz) / v;
    else { const s = Math.sqrt(disc); const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a); t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2); }
  }
  if (!(t > 0) || t > 6) t = Math.hypot(rx, ry, rz) / v;
  return { x: p.x + vx * t, y: p.y + vy * t, z: p.z, t };
}

function islandAt(G, x, y) {
  for (const i of G.islands) if (i.owned && x >= i.ox - 0.3 && x < i.ox + i.w + 0.3 && y >= i.oy - 0.3 && y < i.oy + i.h + 0.3) return i;
  return null;
}
export function shieldCovers(G, island) {
  const s = G.defend?.shield;
  return !!(s && s.on && s.island === island);
}
function domeHit(G, x, y, z) {
  const s = G.defend?.shield; if (!s || !s.on) return null;
  const i = islandById(G, s.island); if (!i) return null;
  const m = C().defence.shieldMargin;
  const cx = i.ox + i.w / 2, cy = i.oy + i.h / 2;
  const rx = i.w / 2 + m, ry = i.h / 2 + m, rz = Math.max(i.w, i.h) * 0.45 + 1.5;
  const k = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - i.alt) / rz) ** 2;
  return k <= 1 && z >= i.alt - 0.2 ? i : null;
}

function nearestBuilding(G, island, x, y, r) {
  let best = null, bd = r;
  for (const b of G.buildings) {
    if (b.island !== island.id || b.state !== 'built') continue;
    const q = bpos(G, b); const [w, d] = bsize(b);
    const dd = Math.max(0, Math.hypot(q.x - x, q.y - y) - Math.max(w, d) * 0.35);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}

function impact(G, s, island) {
  G.bus.emit('boom', { x: s.x, y: s.y, z: s.z, size: s.kind === 'bomb' ? 1.1 : 0.7, kind: s.kind });
  if (!island) return;
  const ruinOk = C().difficulty[G.difficulty || 'standard']?.ruin;
  const r = Math.max(0.9, s.splash || 0.9);
  const hit = nearestBuilding(G, island, s.x, s.y, r);
  if (!hit) return;
  const before = hit.hp;
  damageBuilding(G, hit, s.dmg * (1 - bonus(G, 'raidDamage')), s.kind);
  if (s.fire && G.rng.combat() < s.fire * (ruinOk ? 1 : 0.6)) ignite(G, hit, 0.25 + 0.2 * G.rng.combat(), s.kind);
  report(G, 'hits', 'Buildings hit by ' + (s.kind === 'bomb' ? 'fire bombs' : 'cannon fire'), 1, null, 'bad', null).value =
    (reportList(G).find((l) => l.key === 'hits').n) + ' hits';
  if (before > 0 && hit.state === 'ruin') G.tmp.lastRuin = hit.id;
}

function stepShots(G, dt) {
  const g = C().combat.gravity;
  const shots = G.shots;
  let w = 0;
  for (let k = 0; k < shots.length; k++) {
    const s = shots[k];
    s.t += dt; s.life -= dt;
    if (s.grav) s.vz -= g * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    let dead = s.life <= 0;
    if (s.kind === 'lash') { /* cosmetic, damage already applied */ }
    else if (s.team === 'colony') {
      if (s.fuse != null && s.t >= s.fuse) {
        // flak burst
        for (const p of G.pirates) {
          if (p.state === 'down' || p.state === 'gone') continue;
          const d = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z);
          if (d <= s.splash) hitPirate(G, p, s.dmg * (1 - 0.5 * d / s.splash), 'flak');
        }
        G.bus.emit('boom', { x: s.x, y: s.y, z: s.z, size: 0.9, kind: 'flak' });
        dead = true;
      } else {
        for (const p of G.pirates) {
          if (p.state === 'down' || p.state === 'gone') continue;
          const r = (pdef(p.kind)?.size || 1);
          if (Math.abs(p.x - s.x) > r + 1 || Math.abs(p.y - s.y) > r + 1) continue;
          if (Math.hypot(p.x - s.x, p.y - s.y, (p.z - s.z) * 1.2) <= r) {
            hitPirate(G, p, s.dmg, s.kind);
            G.bus.emit('boom', { x: s.x, y: s.y, z: s.z, size: 0.4, kind: 'hit' });
            dead = true; break;
          }
        }
      }
    } else {
      // pirate fire: grapples at links, cannon/bombs at islands, militia ships, the dome
      if (s.kind === 'grapple') {
        if (Math.hypot(s.tx - s.x, s.ty - s.y, s.tz - s.z) < 0.6 || s.life <= 0.05) {
          const l = G.links.find((x) => x.id === s.target);
          if (l && Math.hypot(s.tx - s.x, s.ty - s.y) < 1) damageLink(G, l, s.dmg);
          dead = true;
        }
      } else {
        const dome = domeHit(G, s.x, s.y, s.z);
        if (dome) {
          G.bus.emit('shield:hit', { x: s.x, y: s.y, z: s.z, island: dome.id });
          G.bus.emit('boom', { x: s.x, y: s.y, z: s.z, size: 0.6, kind: 'shield' });
          report(G, 'dome', 'Storm shield turned shots aside', 1, null, 'good').value = 'blocked';
          dead = true;
        } else {
          for (const m of (G.defend.fleet || [])) {
            if (m.hp <= 0) continue;
            if (Math.hypot(m.x - s.x, m.y - s.y, m.z - s.z) < 0.8) {
              m.hp -= s.dmg; G.bus.emit('boom', { x: s.x, y: s.y, z: s.z, size: 0.5, kind: 'hit' });
              dead = true; break;
            }
          }
          if (!dead) {
            const isl = islandAt(G, s.x, s.y);
            if (isl && s.z <= isl.alt + 0.05 && s.vz < 0) { s.z = isl.alt; impact(G, s, isl); dead = true; }
            else if (!isl && s.z < -12) dead = true;
          }
        }
      }
    }
    if (!dead) shots[w++] = s;
  }
  shots.length = w;
}

// ---------- module api -------------------------------------------------------------------------
export function init(G) {
  G.shots = G.shots || [];
  G.threat = G.threat || {};
  G.threat.report = G.threat.report || [];
}
export function hydrate(G) {
  G.shots = G.shots || [];
  G.threat = G.threat || { report: [] };
  G.tmp.brigades = [];
  for (const b of G.buildings) if (b.state === 'built' || b.state === 'ruin') ensureHp(b);
}
export function step(G, dt) {
  for (const b of G.buildings) if (b.maxHp == null && b.state === 'built') ensureHp(b);
  stepShots(G, dt);
  stepFire(G, dt);
  stepMend(G, dt);
}
