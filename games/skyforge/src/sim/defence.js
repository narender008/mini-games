// Defence (THREATS): harpoon batteries and bastions (auto-aim with lead, range,
// reload, research upgrades), lightning rods (charge, see weather.js), the storm
// shield dome, militia airships, and the player's raid abilities.
//
// G.defend = {
//   volley { cd }, lash { charge 0..1, cd }, shield { on, t (s left), island, cd, gen (building id) },
//   militia { cd },
//   guns { <buildingId>: { cd (s to reload), aim (rad, where the barrel points), fired (G.t) } },
//   fleet [{ id, kind:'militia', ship (G.ships id or null), x, y, z, vx, vy, vz, hdg, hp, maxHp,
//            state:'launch'|'hunt'|'return'|'down', home (mooring id), hx, hy, hz (where it returns),
//            target (pirate id), cd, t }]
//     A sortie with `ship` moves that G.ships militia airship itself (ship.state 'defend'),
//     so render draws the ship and skips the fleet entry; `ship: null` sorties are hired
//     for the raid and drawn from this list.
// }
// G.tmp.defences  [{ id, type, name, island, status, frac, tone }] for the HUD's Defences card
// G.tmp.abilities { <id>: { ready, locked, why, cd, cdMax, key, name } }
// defend(G, action, target) -> { ok, error? } with action volley|lash|shield|militia;
// `target` is a pirate id (volley, lash) or an island id (shield).
// Bus: defend {action, ...}, shot (combat.fire), shield:up / shield:down {island}, militia:launch {m}.
import { CFG } from '../config.js';
import { DEFENDS } from '../content/pirates.js';
import { newId } from '../state.js';
import { clamp, angDiff } from '../core/math.js';
import {
  bonus, built, bpos, bname, hasTech, islandById, canPay, pay, fire, lead, hitPirate, pdef, report, notify, homeId, take, stock,
} from './combat.js';

const C = () => CFG.threats.defence;
const alive = (p) => p.state !== 'down' && p.state !== 'gone';
const DEF = (id) => DEFENDS.find((d) => d.id === id);
const GUNS = ['harpoon', 'bastion'];

// ---------- battery stats --------------------------------------------------------------
export function gunStats(G, b) {
  const base = C()[b.type];
  if (!base) return null;
  const s = { ...base };
  if ((b.level || 1) > 1) { s.range *= C().lvl2; s.dmg *= C().lvl2; s.reload /= C().lvl2; }
  for (const [tech, m] of Object.entries(C().research)) {
    if (!hasTech(G, tech)) continue;
    if (m.range) s.range *= m.range; if (m.reload) s.reload *= m.reload; if (m.dmg) s.dmg *= m.dmg;
  }
  s.dmg *= 1 + bonus(G, 'defence');
  s.range *= (G.weather?.sight ?? 1);
  return s;
}

function staffing(b) {
  if (!(b.want > 0)) return 1;
  return clamp((b.workers || 0) / b.want, 0, 1);
}

function gunReady(b) {
  return b.state === 'built' && b.on !== false && !(b.fire > 0.6);
}

function muzzle(G, b) { const q = bpos(G, b); return { x: q.x, y: q.y, z: q.z + (b.type === 'bastion' ? 1.2 : 0.9) }; }

function nearestPirate(G, x, y, z, range, prefer = null) {
  let best = null, bd = range;
  for (const p of G.pirates) {
    if (!alive(p)) continue;
    const d = Math.hypot(p.x - x, p.y - y, (p.z - z) * 0.7);
    // retreating ships are lower priority, attackers of this island higher
    const k = d * (p.state === 'retreat' ? 1.4 : 1) * (prefer && p.target && p.target.id === prefer ? 0.8 : 1);
    if (k < bd) { bd = k; best = p; }
  }
  return best;
}

function shoot(G, b, s, p, mul = 1) {
  const m = muzzle(G, b);
  const aim = lead(m.x, m.y, m.z, p, s.speed);
  const rng = G.rng.combat;
  const spread = s.spread * (G.weather?.kind === 'fog' ? 2 : 1) * Math.hypot(aim.x - m.x, aim.y - m.y);
  const tx = aim.x + rng.range(-spread, spread), ty = aim.y + rng.range(-spread, spread), tz = aim.z + rng.range(-spread, spread) * 0.5;
  const g = G.defend.guns[b.id] || (G.defend.guns[b.id] = { cd: 0, aim: 0, fired: -99 });
  g.aim = Math.atan2(ty - m.y, tx - m.x); g.fired = G.t; g.target = p.id;
  if (s.flak) {
    fire(G, 'flak', 'colony', b.id, m.x, m.y, m.z, tx, ty, tz, { speed: s.speed, dmg: s.dmg * mul, splash: s.splash, fuse: Math.max(0.15, aim.t) });
  } else {
    fire(G, 'harpoon', 'colony', b.id, m.x, m.y, m.z, tx, ty, tz, { speed: s.speed, dmg: s.dmg * mul, target: p.id, life: aim.t + 0.5 });
  }
}

function stepGuns(G, dt) {
  const guns = G.defend.guns;
  const any = G.pirates.some(alive);
  for (const b of G.buildings) {
    if (!GUNS.includes(b.type)) continue;
    const g = guns[b.id] || (guns[b.id] = { cd: 0, aim: -Math.PI / 2, fired: -99 });
    if (!gunReady(b)) continue;
    const s = gunStats(G, b);
    g.cd = Math.max(0, g.cd - dt * Math.max(0.35, staffing(b)));
    if (!any || g.cd > 0) continue;
    const m = muzzle(G, b);
    const p = nearestPirate(G, m.x, m.y, m.z, s.range);
    if (!p) continue;
    shoot(G, b, s, p);
    g.cd = s.reload;
  }
}

// ---------- shield -------------------------------------------------------------------
function stepShield(G, dt) {
  const sh = G.defend.shield;
  sh.cd = Math.max(0, sh.cd - dt);
  if (!sh.on) return;
  const gen = G.buildings.find((b) => b.id === sh.gen);
  const d = DEF('shield');
  sh.t -= dt;
  let fed = true;
  if (gen && gen.state === 'built') {
    const need = d.upkeep.aether * dt;
    if (stock(G, gen.island, 'aether') >= need) take(G, gen.island, 'aether', need);
    else if ((G.colony.coin || 0) >= d.upkeepCoin * dt) G.colony.coin -= d.upkeepCoin * dt;
    else fed = false;
  }
  if (sh.t <= 0 || !gen || gen.state !== 'built' || !fed) {
    sh.on = false; sh.t = 0;
    G.bus.emit('shield:down', { island: sh.island, why: !fed ? 'fuel' : 'time' });
    if (!fed) notify(G, 'The storm shield ran out of aether.', 'warn', 'shield');
  }
}

// ---------- militia -------------------------------------------------------------------
function stepMilitia(G, dt) {
  const M = C().militia;
  const fleet = G.defend.fleet;
  for (const m of fleet) {
    m.t += dt; m.cd -= dt;
    let tx, ty, tz;
    const ship = m.ship != null ? G.ships.find((x) => x.id === m.ship) : null;
    if (m.ship != null && !ship) { m.state = 'gone'; continue; }
    const hp = { x: m.hx, y: m.hy, z: m.hz - 1.2 };
    if (m.hp <= 0) {
      m.state = 'down'; m.vz = (m.vz || 0) - 6 * dt; m.z += m.vz * dt; m.fall = (m.fall || 0) + dt;
      continue;
    }
    if (m.state !== 'return' && (m.t > M.life || !G.pirates.some(alive))) m.state = 'return';
    if (m.state === 'return') {
      tx = hp.x; ty = hp.y; tz = hp.z + 1.2;
      if (Math.hypot(tx - m.x, ty - m.y) < 0.6) {
        m.state = 'gone';
        if (ship) Object.assign(ship, { x: m.hx, y: m.hy, z: m.hz, state: 'idle' });
        G.bus.emit('militia:dock', { m });
        continue;
      }
    } else {
      let p = G.pirates.find((x) => x.id === m.target && alive(x));
      if (!p) { p = nearestPirate(G, m.x, m.y, m.z, 60); m.target = p ? p.id : null; }
      if (!p) { m.state = 'return'; continue; }
      m.state = 'hunt';
      // hold off at gun range, slightly above
      const a = Math.atan2(m.y - p.y, m.x - p.x) + 0.6;
      tx = p.x + Math.cos(a) * M.range * 0.6; ty = p.y + Math.sin(a) * M.range * 0.6; tz = p.z + 0.6;
      if (m.cd <= 0 && Math.hypot(p.x - m.x, p.y - m.y, p.z - m.z) <= M.range) {
        const aim = lead(m.x, m.y, m.z, p, 16);
        const sp = 0.05 * Math.hypot(aim.x - m.x, aim.y - m.y);
        fire(G, 'militia', 'colony', m.id, m.x, m.y, m.z - 0.2, aim.x + G.rng.combat.range(-sp, sp), aim.y + G.rng.combat.range(-sp, sp), aim.z, { speed: 16, dmg: m.dmg || M.dmg, life: aim.t + 0.4 });
        m.cd = M.reload;
      }
    }
    const want = Math.atan2(ty - m.y, tx - m.x);
    m.hdg += clamp(angDiff(m.hdg, want), -M.turn * dt, M.turn * dt);
    const dist = Math.hypot(tx - m.x, ty - m.y);
    const sp = M.speed * (G.weather?.gale ? 0.8 : 1) * clamp(dist / 2, 0.25, 1);
    m.vx = Math.cos(m.hdg) * sp; m.vy = Math.sin(m.hdg) * sp;
    m.x += m.vx * dt; m.y += m.vy * dt;
    m.z += clamp((tz - m.z) * 1.5, -1.2, 1.2) * dt;
    if (ship) Object.assign(ship, { x: m.x, y: m.y, z: m.z, hdg: m.hdg, vx: m.vx, vy: m.vy, hp: m.hp, state: 'defend' });
  }
  for (const m of fleet) if (m.state === 'down' && m.fall > 2.4) {
    m.state = 'gone';
    const ship = m.ship != null ? G.ships.find((x) => x.id === m.ship) : null;
    if (ship) Object.assign(ship, { hp: 0, state: 'idle' });
    G.bus.emit('boom', { x: m.x, y: m.y, z: m.z, size: 1.2, kind: 'wreck' });
    report(G, 'militia-lost', 'Militia ship lost', 1, null, 'bad', 'lost');
  }
  if (fleet.some((m) => m.state === 'gone')) G.defend.fleet = fleet.filter((m) => m.state !== 'gone');
}

// ---------- abilities -----------------------------------------------------------------------
function lockReason(G, id) {
  const d = DEF(id);
  if (!hasTech(G, d.needs)) return 'research ' + d.needs;
  if (id === 'militia' && idleMilitia(G)) return null;
  if (!built(G, d.requires).length) return 'build a ' + d.requires;
  return null;
}

// A militia airship of PROGRESSION's fleet waiting at its mooring (free to send).
function idleMilitia(G) { return G.ships.find((s) => s.kind === 'militia' && s.state === 'idle' && s.hp > 0 && s.x != null) || null; }

function threatenedIsland(G, gens) {
  // the shield-generator island with the most raiders (or storm) bearing down on it
  let best = null, bs = -1;
  for (const g of gens) {
    const i = islandById(G, g.island); if (!i) continue;
    const cx = i.ox + i.w / 2, cy = i.oy + i.h / 2;
    let s = 0;
    for (const p of G.pirates) if (alive(p)) s += 1 / (1 + Math.hypot(p.x - cx, p.y - cy) / 6);
    if (G.weather?.kind === 'storm') s += 0.2;
    if (s > bs) { bs = s; best = g; }
  }
  return best;
}

function fireVolley(G, target) {
  const pirates = G.pirates.filter(alive);
  const marked = pirates.find((p) => p.id === target);
  let fired = 0;
  for (const b of G.buildings) {
    if (!GUNS.includes(b.type) || !gunReady(b)) continue;
    const s = gunStats(G, b); s.range *= C().volley.rangeMul;
    const m = muzzle(G, b);
    const p = marked && Math.hypot(marked.x - m.x, marked.y - m.y) <= s.range ? marked : nearestPirate(G, m.x, m.y, m.z, s.range);
    if (!p) continue;
    shoot(G, b, s, p, C().volley.dmgMul);
    G.defend.guns[b.id].cd = gunStats(G, b).reload;
    fired++;
  }
  if (fired) G.bus.emit('defend', { action: 'volley', n: fired });
  return fired;
}

export function defend(G, action, target) {
  if (!G) return { ok: false, error: 'no game' };
  const d = DEF(action);
  if (!d) return { ok: false, error: 'unknown action ' + action };
  const lock = lockReason(G, action);
  if (lock) return { ok: false, error: lock };
  const st = G.defend[action];
  if (st.cd > 0) return { ok: false, error: 'recharging (' + Math.ceil(st.cd) + ' s)' };
  const home = homeId(G);
  const pirates = G.pirates.filter(alive);

  if (action === 'volley') {
    if (!pirates.length) return { ok: false, error: 'no raiders in the sky' };
    const short = canPay(G, home, d.cost); if (short) return { ok: false, error: 'not enough ' + short };
    let fired = 0;
    const marked = pirates.find((p) => p.id === target);
    for (const b of G.buildings) {
      if (!GUNS.includes(b.type) || !gunReady(b)) continue;
      const s = gunStats(G, b); s.range *= C().volley.rangeMul;
      const m = muzzle(G, b);
      const p = marked && Math.hypot(marked.x - m.x, marked.y - m.y) <= s.range ? marked : nearestPirate(G, m.x, m.y, m.z, s.range);
      if (!p) continue;
      shoot(G, b, s, p, C().volley.dmgMul);
      G.defend.guns[b.id].cd = gunStats(G, b).reload;
      fired++;
    }
    if (!fired) {
      // nothing in range yet: the batteries hold their fire and loose the
      // volley together the moment a raider comes in range (for 30 s)
      if (st.primed > 0) return { ok: false, error: 'volley already primed' };
      pay(G, home, d.cost);
      st.primed = 30; st.target = marked ? marked.id : null;
      G.bus.emit('defend', { action, primed: true });
      return { ok: true, primed: true };
    }
    pay(G, home, d.cost);
    st.cd = d.cd;
    G.bus.emit('defend', { action, n: fired });
    return { ok: true, n: fired };
  }

  if (action === 'lash') {
    if (!pirates.length) return { ok: false, error: 'no raiders in the sky' };
    if (G.defend.lash.charge + 1e-9 < d.cost.charge) return { ok: false, error: 'the rods need more charge' };
    const L = C().lash;
    // the bolt leaves the rod nearest the first target
    let first = pirates.find((p) => p.id === target);
    const rods = built(G, 'rod');
    if (!first) {
      let bd = Infinity;
      for (const p of pirates) for (const r of rods) {
        const q = bpos(G, r); const dd = Math.hypot(p.x - q.x, p.y - q.y) * (p.state === 'retreat' ? 1.5 : 1);
        if (dd < bd) { bd = dd; first = p; }
      }
    }
    let src = null, sd = Infinity;
    for (const r of rods) { const q = bpos(G, r); const dd = Math.hypot(first.x - q.x, first.y - q.y); if (dd < sd) { sd = dd; src = { x: q.x, y: q.y, z: q.top }; } }
    pay(G, home, d.cost);
    st.cd = d.cd;
    const chain = [src];
    const hit = new Set();
    let cur = first, dmg = L.dmg;
    for (let j = 0; j < L.jumps && cur; j++) {
      hit.add(cur.id);
      chain.push({ x: cur.x, y: cur.y, z: cur.z, id: cur.id });
      const from = chain[chain.length - 2];
      fire(G, 'lash', 'colony', 'lash', from.x, from.y, from.z, cur.x, cur.y, cur.z, { vx: 0, vy: 0, vz: 0, life: 0.45, dmg: 0 });
      hitPirate(G, cur, dmg, 'lash');
      dmg *= L.falloff;
      let next = null, nd = L.chainR;
      for (const p of G.pirates) {
        if (!alive(p) || hit.has(p.id)) continue;
        const dd = Math.hypot(p.x - cur.x, p.y - cur.y, p.z - cur.z);
        if (dd < nd) { nd = dd; next = p; }
      }
      cur = next;
    }
    G.bus.emit('lightning', { x: chain[1].x, y: chain[1].y, z: chain[1].z, x0: src.x, y0: src.y, z0: src.z, target: 'pirate', lash: true, chain, rod: null, shield: false, dmg: L.dmg });
    G.bus.emit('defend', { action, chain });
    report(G, 'lash', 'Lightning lash', chain.length - 1, null, 'good').value = (chain.length - 1) + ' struck';
    return { ok: true, n: chain.length - 1 };
  }

  if (action === 'shield') {
    if (G.defend.shield.on) return { ok: false, error: 'the shield is already up' };
    const gens = built(G, 'shieldgen');
    let gen = target ? gens.find((g) => g.island === target) : threatenedIsland(G, gens);
    if (!gen) return { ok: false, error: 'no storm shield generator on that island' };
    const cost = { ...d.cost };
    if (stock(G, gen.island, 'aether') < cost.aether) { cost.coin = cost.aether * 12; delete cost.aether; }
    const short = canPay(G, gen.island, cost); if (short) return { ok: false, error: 'not enough ' + short };
    pay(G, gen.island, cost);
    Object.assign(G.defend.shield, { on: true, t: d.duration * ((gen.level || 1) > 1 ? 1.3 : 1), island: gen.island, gen: gen.id, cd: d.cd });
    G.bus.emit('shield:up', { island: gen.island });
    G.bus.emit('defend', { action, island: gen.island });
    report(G, 'shield', 'Storm shield raised: ' + (islandById(G, gen.island)?.name || gen.island), 0, null, 'good', 'up');
    return { ok: true, island: gen.island };
  }

  if (action === 'militia') {
    if (!pirates.length) return { ok: false, error: 'no raiders in the sky' };
    const M = C().militia;
    const ship = idleMilitia(G);
    let m;
    if (ship) {
      // send a standing militia airship: free, it flies as itself
      m = { id: newId(G), kind: 'militia', ship: ship.id, x: ship.x, y: ship.y, z: ship.z ?? 0, hp: ship.hp, maxHp: ship.maxHp || ship.hp, dmg: ship.dmg || M.dmg };
      ship.state = 'defend';
    } else {
      const short = canPay(G, home, d.cost); if (short) return { ok: false, error: 'not enough ' + short };
      // a hired militia sortie from the mooring nearest the action
      const moors = built(G, 'mooring');
      let mo = moors[0], md = Infinity;
      for (const b of moors) {
        const q = bpos(G, b);
        for (const p of pirates) { const dd = Math.hypot(p.x - q.x, p.y - q.y); if (dd < md) { md = dd; mo = b; } }
      }
      pay(G, home, d.cost);
      const q = bpos(G, mo);
      const hpMul = hasTech(G, 'bastion') ? 1.25 : 1;
      m = { id: newId(G), kind: 'militia', ship: null, home: mo.id, x: q.x, y: q.y, z: q.z + 1.2, hp: M.hp * hpMul, maxHp: M.hp * hpMul, dmg: M.dmg };
    }
    Object.assign(m, { vx: 0, vy: 0, vz: 0, hdg: -Math.PI / 2, state: 'launch', target: typeof target === 'number' ? target : null, cd: 1, t: 0, hx: m.x, hy: m.y, hz: m.z });
    st.cd = d.cd;
    G.defend.fleet.push(m);
    G.bus.emit('militia:launch', { m });
    G.bus.emit('defend', { action, id: m.id });
    report(G, 'militia', 'Militia ship launched', 1, null, 'good').value = 'aloft';
    return { ok: true, id: m.id };
  }
  return { ok: false, error: 'unknown action' };
}

// "Harpoon battery", "East battery", "Pinecrest battery", "Pinecrest north bastion"...
const DIRS = ['East', 'North-east', 'North', 'North-west', 'West', 'South-west', 'South', 'South-east'];
function gunName(G, b) {
  const all = G.buildings.filter((x) => GUNS.includes(x.type) && (x.state === 'built' || x.state === 'ruin'));
  const noun = b.type === 'bastion' ? 'bastion' : 'battery';
  if (all.length === 1) return b.type === 'bastion' ? 'Flak bastion' : 'Harpoon battery';
  const i = islandById(G, b.island);
  const here = all.filter((x) => x.island === b.island);
  let dir = '';
  if (i && here.length > 1) {
    const a = Math.atan2(b.v + 0.5 - i.h / 2, b.u + 0.5 - i.w / 2);
    dir = DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  }
  if (!i || i.kind === 'home') return (dir || 'Home') + ' ' + noun;
  return i.name + (dir ? ' ' + dir.toLowerCase() : '') + ' ' + noun;
}

// ---------- HUD summaries ------------------------------------------------------------------------
function summarize(G) {
  const out = [];
  const ids = new Set(G.buildings.map((b) => String(b.id)));
  for (const id of Object.keys(G.defend.guns)) if (!ids.has(id)) delete G.defend.guns[id];
  const isl = (id) => islandById(G, id)?.name || id;
  const named = {};
  for (const b of G.buildings) {
    if (!GUNS.includes(b.type) || !(b.state === 'built' || b.state === 'ruin')) continue;
    const g = G.defend.guns[b.id];
    const s = gunStats(G, b);
    named[b.island] = (named[b.island] || 0) + 1;
    let status, frac, tone;
    if (b.state === 'ruin') { status = 'Destroyed'; frac = 0; tone = 'bad'; }
    else if (b.fire > 0.6) { status = 'Burning'; frac = 0; tone = 'bad'; }
    else if (b.on === false) { status = 'Off'; frac = 0; tone = 'info'; }
    else if (g && G.t - g.fired < 0.8) { status = 'Firing'; frac = 1; tone = 'good'; }
    else if (g && g.cd > 0.05) { status = 'Reload ' + Math.ceil(g.cd) + 's'; frac = 1 - g.cd / s.reload; tone = 'warn'; }
    else { status = 'Ready'; frac = 1; tone = 'good'; }
    out.push({ id: b.id, type: b.type, name: gunName(G, b), island: b.island, status, frac, tone });
  }
  // the Defences card has room for about five rows: the busiest guns (or the
  // ones nearest a raider) first, at most three, then rods, shield and militia
  if (out.length > 3) {
    const sky = G.pirates.filter(alive);
    const busy = (r) => (r.status === 'Firing' ? 0 : r.status.startsWith('Reload') ? 1 : r.tone === 'bad' ? 2 : 3);
    const near = (r) => {
      const b = G.buildings.find((x) => x.id === r.id); if (!b || !sky.length) return 0;
      const q = bpos(G, b); return Math.min(...sky.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
    };
    for (const r of out) { r._k = busy(r) * 1000 + near(r); }
    out.sort((a, b) => a._k - b._k || a.id - b.id);
    out.length = 3;
    for (const r of out) delete r._k;
  }
  if (built(G, 'rod').length) {
    const c = G.defend.lash.charge;
    out.push({ id: 'rods', type: 'rod', name: 'Lightning rods', status: 'Charged ' + Math.round(c * 100) + '%', frac: c, tone: c >= 0.5 ? 'good' : 'info' });
  }
  if (built(G, 'shieldgen').length) {
    const sh = G.defend.shield;
    const d = DEF('shield');
    out.push({ id: 'shield', type: 'shieldgen', name: 'Storm shield', status: sh.on ? isl(sh.island) : sh.cd > 0 ? 'Recharge ' + Math.ceil(sh.cd) + 's' : 'Ready',
      frac: sh.on ? sh.t / d.duration : 1 - sh.cd / d.cd, tone: sh.on ? 'good' : 'info' });
  }
  for (const m of G.defend.fleet) out.push({ id: m.id, type: 'militia', name: 'Militia ship', status: m.state === 'return' ? 'Returning' : 'Hunting', frac: m.hp / m.maxHp, tone: 'good' });
  G.tmp.defences = out;
  const ab = {};
  for (const d of DEFENDS) {
    const st = G.defend[d.id];
    const why = lockReason(G, d.id);
    let ready = !why && st.cd <= 0;
    let need = null;
    if (ready && d.id === 'volley' && G.defend.volley.primed > 0) { ready = false; need = 'primed'; }
    if (ready && d.id === 'lash' && G.defend.lash.charge < d.cost.charge) { ready = false; need = 'charge'; }
    if (ready && d.id !== 'shield' && !G.pirates.some(alive)) { ready = false; need = 'no raiders'; }
    if (d.id === 'shield' && G.defend.shield.on) { ready = false; need = 'raised'; }
    ab[d.id] = { id: d.id, key: d.key, name: d.name, ready, locked: !!why, why: why || need, cd: st.cd, cdMax: d.cd, charge: d.id === 'lash' ? G.defend.lash.charge : undefined };
  }
  G.tmp.abilities = ab;
}

// ---------- module api ------------------------------------------------------------------------------
export function init(G) {
  const d = G.defend = G.defend || {};
  d.volley = d.volley || { cd: 0 };
  d.lash = d.lash || { charge: 0, cd: 0 };
  d.shield = d.shield || { on: false, t: 0, island: null, cd: 0 };
  d.militia = d.militia || { cd: 0 };
  d.guns = d.guns || {};
  d.fleet = d.fleet || [];
}
export function hydrate(G) { init(G); const k = G.defend.guns; summarize(G); G.defend.guns = k; }

export function step(G, dt) {
  const d = G.defend;
  for (const k of ['volley', 'lash', 'militia']) d[k].cd = Math.max(0, d[k].cd - dt);
  if (d.volley.primed > 0) {
    d.volley.primed = Math.max(0, d.volley.primed - dt);
    if (!G.pirates.some(alive)) d.volley.primed = 0;
    else if (fireVolley(G, d.volley.target)) { d.volley.primed = 0; d.volley.cd = DEF('volley').cd; }
  }
  stepGuns(G, dt);
  stepShield(G, dt);
  stepMilitia(G, dt);
  // (the timer lives on G.defend so a loaded game summarizes on the same ticks)
  if ((d.sumT = (d.sumT || 0) + dt) >= 0.2) { d.sumT = 0; summarize(G); }
}
