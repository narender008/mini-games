// The autopilot. Plays a colony only through act.* (the same path as a click:
// costs paid, rules enforced; no give, no unlock) and plans from content data,
// so it follows whatever balance ECONOMY and PROGRESSION settle on.
//
// createBrain({ getG, act, C, log, cheat }) -> { think(), onEvent(), waits(), counts(), plan }
//   think() looks at the colony and takes at most a few actions; call it about
//   once per game second. With cheat: true (presets only) it first tops up the
//   stores with economy.give for whatever an action costs.
// createBot(app) -> { on, update(realDt), brain } wraps it for the game
// (`__sf.auto(true)`): it thinks once per game second while the sim runs.
//
// Strategy, in priority order each think():
//   events (choice cards), raid defence, food and housing first, the current
//   chapter's goal steps (G.tmp.goalSteps hints name the building, island, tech
//   or chart target), a baseline economy sized to the population, research in
//   a fixed order that follows the chapters, claims and links, moorings, ships
//   and trade, defences before raids, expeditions, the Skyforge stages.
// A want that cannot be paid yet reserves the goods it lacks so cheaper wants
// lower down do not eat them; waits() reports how long each want was blocked.

const RESEARCH_ORDER = ['bellows', 'skiffs', 'harpoons', 'cargoholds', 'turbines', 'rods', 'crystallore', 'propellers',
  'levitation', 'assembly', 'drift', 'stormtaming', 'automatons', 'foundry', 'beacon', 'shields', 'militia', 'charters', 'bastion', 'galleons'];
const CLAIM_ORDER = ['millbrook', 'orespur', 'kilnshelf', 'pinecrest'];
const VALUABLE = new Set(['f', 's', 'o', 'c', 'k', 'h', 'x', 't']);

export function createBrain({ getG, act, C, log = null, cheat = false, give = null } = {}) {
  const B = Object.fromEntries(C.BUILDINGS.map((b) => [b.id, b]));
  const R = Object.fromEntries(C.RESEARCH.map((r) => [r.id, r]));
  const I = Object.fromEntries(C.ISLANDS.map((i) => [i.id, i]));
  const SHIP = Object.fromEntries((C.SHIPS || []).map((s) => [s.id, s]));
  const waitT = {}, count = {};
  let G = null, reserved = {}, budget = 0, lastT = 0, dt = 1, shortOf = [];
  const noSpot = new Map(), spotCache = new Map();
  let aimAt = null, lastNoSpot = -1e9, lastSell = -1e9;
  const needCap = {};

  const say = (t) => log && log(t);
  const tally = (k) => { count[k] = (count[k] || 0) + 1; };

  // ---------- reading the colony ----------
  const netOf = (id) => G.tmp.netOf?.[id] ?? id;
  const poolOf = (id) => G.pools[netOf(id)] || { res: {}, cap: {} };
  const colonyRes = (k) => (k === 'coin' || k === 'insight' ? (G.colony[k] ?? G.pools.colony?.res?.[k] ?? 0) : null);
  const stock = (k, island = 'hearthrock') => colonyRes(k) ?? (poolOf(island).res[k] || 0);
  const cap = (k, island = 'hearthrock') => poolOf(island).cap?.[k] ?? Infinity;
  const rate = (k, island = 'hearthrock') => G.tmp.rates?.[netOf(island)]?.[k] ?? 0;
  const owned = () => G.islands.filter((i) => i.owned);
  const isOwned = (id) => !!G.islands.find((i) => i.id === id && i.owned);
  const island = (id) => G.islands.find((i) => i.id === id);
  const all = (type) => G.buildings.filter((b) => b.type === type && b.state !== 'ruin');
  const n = (type) => all(type).length;
  const built = (type) => G.buildings.filter((b) => b.type === type && b.state === 'built').length;
  const sites = () => G.buildings.filter((b) => b.state === 'site').length;
  const done = (id) => G.research.done.includes(id);
  const missing = (cost = {}, isl = 'hearthrock') => {
    const out = {};
    for (const [k, v] of Object.entries(cost)) { if (k === 'settlers') continue; const d = v - stock(k, isl); if (d > 0) out[k] = d; }
    return out;
  };
  const free = (cost = {}, isl) => Object.keys(cost).every((k) => k === 'settlers' || !reserved[k] || stock(k, isl) - cost[k] >= reserved[k]);

  // Spend gate: affordable and not eating goods reserved by a blocked higher want.
  function canPay(key, cost, isl = 'hearthrock') {
    const m = missing(cost, isl);
    if (cheat && give && Object.keys(m).length) { for (const [k, v] of Object.entries(m)) give(k, Math.ceil(v) + 1); return true; }
    if (Object.keys(m).length) {
      for (const [k, v] of Object.entries(m)) { reserved[k] = Math.max(reserved[k] || 0, (cost[k] || 0)); if (cost[k] > cap(k, isl) * 0.98) needCap[k] = G.t; }
      waitT[key] = (waitT[key] || 0) + dt;
      return false;
    }
    if (!free(cost, isl)) { waitT[key + ' (reserved)'] = (waitT[key + ' (reserved)'] || 0) + dt; return false; }
    return true;
  }

  // ---------- placing ----------
  function cellAt(isl, u, v) { return (u < 0 || v < 0 || u >= isl.w || v >= isl.h) ? ' ' : isl.cells[v * isl.w + u]; }
  function centreOf(isl) {
    const th = G.buildings.find((b) => b.type === 'townhall' && b.island === isl.id);
    return th ? [th.u + 1.5, th.v + 1.5] : [isl.w / 2, isl.h / 2];
  }
  function score(type, isl, u, v) {
    const def = B[type], [w, d] = def.size || [1, 1], pl = def.place || {};
    const [cx, cy] = centreOf(isl);
    let s = -Math.hypot(u + w / 2 - cx, v + d / 2 - cy) * 0.35;
    for (let y = v; y < v + d; y++) for (let x = u; x < u + w; x++) {
      const c = cellAt(isl, x, y);
      if (pl.on && c === pl.on) s += 6;
      else if (type === 'smelter' && c === 'h') s += 12;
      else if (VALUABLE.has(c)) s -= c === 't' ? 2 : 5;
    }
    if (pl.near) {
      const r = pl.near.r ?? 2;
      for (let y = v - r; y < v + d + r; y++) for (let x = u - r; x < u + w + r; x++) if (cellAt(isl, x, y) === pl.near.cell) s += 1.2;
    }
    if (type === 'harpoon' || type === 'bastion') {
      const moor = G.buildings.filter((b) => b.island === isl.id && (b.type === 'mooring' || b.type === 'shipyard'));
      for (const b of moor) s -= Math.hypot(b.u - u, b.v - v) * 0.4;
      for (const b of G.buildings.filter((b) => b.island === isl.id && b.type === type)) s += Math.min(8, Math.hypot(b.u - u, b.v - v)) * 0.8;
    }
    if (type === 'cablestation' && aimAt) s -= Math.hypot(isl.ox + u - aimAt[0], isl.oy + v - aimAt[1]) * 3;
    if (type === 'rod') for (const b of G.buildings.filter((b) => b.island === isl.id && b.type === 'rod')) s += Math.min(10, Math.hypot(b.u - u, b.v - v));
    return s;
  }
  function bestSpot(type, islId) {
    const isl = island(islId);
    if (!isl || !isl.owned) return null;
    const ck = type + '@' + islId;
    let spots = spotCache.get(ck);
    if (!spots) { try { spots = act.spots(type, islId) || []; } catch { spots = []; } spotCache.set(ck, spots); }
    let best = null, bs = -Infinity;
    for (const [u, v] of spots) { const s = score(type, isl, u, v); if (s > bs) { bs = s; best = [u, v]; } }
    return best;
  }
  // Islands to try for a building, best first.
  function islandsFor(type, prefer) {
    const def = B[type];
    // the home network, plus the preferred island (a far island only when asked for by name)
    const list = owned().filter((i) => netOf(i.id) === netOf('hearthrock') || i.id === prefer).map((i) => i.id);
    const order = [];
    if (prefer && list.includes(prefer)) order.push(prefer);
    const on = def.place?.on;
    const wantCell = on || def.place?.near?.cell || (type === 'smelter' ? 'h' : null);
    const scoreIsl = (id) => { const i = island(id); if (!wantCell) return id === 'hearthrock' ? 1 : 0; let c = 0; for (const ch of i.cells) if (ch === wantCell) c++; return c; };
    for (const id of list.sort((a, b) => scoreIsl(b) - scoreIsl(a))) if (!order.includes(id)) order.push(id);
    return order;
  }

  function build(type, prefer, why = type, strict = false) {
    const def = B[type];
    if (!def) return false;
    if (def.needs && !done(def.needs)) return false;
    if (def.req && !built(def.req)) return false;
    const key = `build ${type}`;
    if (sites() >= 2 + Math.floor(pop() / 12) && !why.startsWith('goal')) { waitT['builders busy'] = (waitT['builders busy'] || 0) + dt; return false; }
    if ((noSpot.get(type + '@' + (strict ? prefer : '*')) || 0) > G.t) { lastNoSpot = G.t; waitT[`${key}: no spot`] = (waitT[`${key}: no spot`] || 0) + dt; return false; }
    let firstSpot = null, lastErr = null;
    for (const islId of strict ? [prefer] : islandsFor(type, prefer)) {
      const spot = bestSpot(type, islId);
      if (!spot) continue;
      if (!firstSpot) firstSpot = islId;
      const c = act.canBuild(type, islId, spot[0], spot[1]);
      if (!c.ok && !cheat) { lastErr = c.error; continue; }
      if (!canPay(key, cheat ? def.cost : {}, islId)) return false;
      if (!free(def.cost)) { waitT[key + ' (reserved)'] = (waitT[key + ' (reserved)'] || 0) + dt; return false; }
      const r = act.build(type, islId, spot[0], spot[1]);
      if (r.ok) { tally(key); say(`build ${type} on ${islId} (${spot}) for ${why}`); budget--; return true; }
      waitT[`${key}: ${r.error}`] = (waitT[`${key}: ${r.error}`] || 0) + dt;
    }
    if (firstSpot) canPay(key, def.cost, 'hearthrock');     // record the wait and reserve the goods
    else if (IMPORTANT.has(type) && !strict && makeRoom(type)) { /* retried next think */ }
    else { lastNoSpot = G.t; noSpot.set(type + '@' + (strict ? prefer : '*'), G.t + 45); waitT[`${key}: no spot`] = (waitT[`${key}: no spot`] || 0) + dt; }
    return false;
  }
  const ensure = (type, k, prefer, why, strict = false) => (n(type) < k ? build(type, prefer, why, strict) : false);

  function upgradeOne(type, why = type) {
    const def = B[type];
    const lv = def?.levels?.[0];
    if (!lv) return false;
    if (lv.needs && !done(lv.needs)) return false;
    if (lv.req && !built(lv.req)) return false;
    const b = G.buildings.find((x) => x.type === type && x.state === 'built' && !x.upgrading && (x.level || 1) < 2);
    if (!b) return false;
    if (!canPay(`upgrade ${type}`, lv.cost, b.island)) return false;
    const r = act.upgrade(b.id);
    if (r.ok) { tally(`upgrade ${type}`); say(`upgrade ${type} #${b.id} for ${why}`); budget--; return true; }
    return false;
  }

  // ---------- research ----------
  function research() {
    if (G.research.current) return false;
    let avail = [];
    try { avail = G.tmp.researchAvailable || null; } catch { avail = null; }
    for (const id of RESEARCH_ORDER) {
      if (done(id)) continue;
      const r = R[id];
      if (!r || !r.needs.every(done)) continue;
      if (avail && !avail.includes(id)) continue;
      const m = missing(r.cost);
      // goods we cannot make yet: try the next project instead of stalling the academy
      if (Object.keys(m).some((k) => k !== 'insight' && k !== 'coin' && rate(k) <= 0)) { waitT[`research ${id}: no ${Object.keys(m).join('+')}`] = (waitT[`research ${id}: no ${Object.keys(m).join('+')}`] || 0) + dt; continue; }
      if (!canPay(`research ${id}`, r.cost)) return false;
      const res = act.research(id);
      if (res.ok) { tally('research'); say(`research ${id}`); return true; }
      waitT[`research ${id}: ${res.error}`] = (waitT[`research ${id}: ${res.error}`] || 0) + dt;
      return false;
    }
    return false;
  }

  // ---------- islands: claim, link, expeditions ----------
  function claim(id) {
    if (isOwned(id)) return false;
    const def = I[id];
    if (def.needs && !done(def.needs)) return false;
    const cost = def.claimCost || {};
    if (cost.settlers && (G.colony.pop || 0) < cost.settlers + 6) { waitT[`claim ${id}: settlers`] = (waitT[`claim ${id}: settlers`] || 0) + dt; return false; }
    if (!canPay(`claim ${id}`, cost)) return false;
    const isl = island(id);
    if (!isl?.discovered) return false;
    if (G.expeditions.some((e) => e.target === id && e.state !== 'done')) return false;
    let r = act.claim(id);
    if (!r.ok && def.kind !== 'islet') {
      if (!isl.scouted) {
        if (!G.ships.some((s) => s.kind === 'skiff' && !s.task) && !G.ships.some((s) => s.state === 'building') && ship('skiff')) return true;
        r = act.expedition(id, 'scout');
      } else {
        if (!G.ships.some((s) => (s.kind === 'cargo' || s.kind === 'galleon') && !s.route && !s.task) && !G.ships.some((s) => s.state === 'building') && ship('cargo')) return true;
        r = act.expedition(id, 'claim');
      }
    }
    if (r.ok) { tally(`claim ${id}`); say(`claim ${id}`); return true; }
    waitT[`claim ${id}: ${r.error}`] = (waitT[`claim ${id}: ${r.error}`] || 0) + dt;
    return false;
  }
  function linkUp() {
    // join every owned island to the home network
    for (const kind of ['bridge', 'cable']) {
      let pairs = [];
      try { pairs = act.linkSpots(kind) || []; } catch { pairs = []; }
      for (const [a, b] of pairs) {
        if (!isOwned(a) || !isOwned(b) || netOf(a) === netOf(b)) continue;
        if (G.links.some((l) => ((l.a === a && l.b === b) || (l.a === b && l.b === a)) && l.state !== 'broken')) continue;
        const r = act.link(kind, a, b);
        if (r.ok) { tally(`link ${kind}`); say(`link ${kind} ${a}-${b}`); return true; }
        waitT[`link ${kind} ${a}-${b}: ${r.error}`] = (waitT[`link ${kind} ${a}-${b}: ${r.error}`] || 0) + dt;
      }
    }
    return false;
  }
  function needsCable(id) {
    // an owned island not in the home network and with no bridge spot: put stations on both ends
    if (!done('turbines') || netOf(id) === netOf('hearthrock')) return false;
    let pairs = [];
    try { pairs = act.linkSpots('bridge') || []; } catch { pairs = []; }
    if (pairs.some(([a, b]) => (a === id || b === id))) return false;
    const st = (isl) => G.buildings.some((b) => b.type === 'cablestation' && b.island === isl);
    // the home-side end goes on the home-network island nearest the target
    const T = island(id);
    const rectGap = (a, b) => Math.hypot(Math.max(0, Math.max(a.ox, b.ox) - Math.min(a.ox + a.w, b.ox + b.w)), Math.max(0, Math.max(a.oy, b.oy) - Math.min(a.oy + a.h, b.oy + b.h)));
    const maxGap = (C.LINKS.find((l) => l.id === 'cable')?.maxGap || 20) - 2;
    const homeSide = owned().filter((i) => netOf(i.id) === netOf('hearthrock') && rectGap(i, T) <= maxGap && Math.abs(i.alt - T.alt) <= 8)
      .sort((a, b) => Math.hypot(a.ox + a.w / 2 - T.ox - T.w / 2, a.oy + a.h / 2 - T.oy - T.h / 2) - Math.hypot(b.ox + b.w / 2 - T.ox - T.w / 2, b.oy + b.h / 2 - T.oy - T.h / 2));
    if (!homeSide.length) return false;
    try {
      if (!homeSide.some((i) => st(i.id))) {
        aimAt = [T.ox + T.w / 2, T.oy + T.h / 2];
        for (const i of homeSide) if (build('cablestation', i.id, `cable to ${id}`, true)) return true;
        if (!homeSide.some((i) => bestSpot('cablestation', i.id))) return clearFor(homeSide[0].id);
        return false;
      }
      const near = homeSide.find((i) => st(i.id));
      aimAt = [near.ox + near.w / 2, near.oy + near.h / 2];
      if (!st(id)) return build('cablestation', id, `cable to ${id}`, true) || (!bestSpot('cablestation', id) && clearFor(id));
    } finally { aimAt = null; }
    return false;
  }

  // The home network is full: knock down the most redundant building so an important one fits.
  const IMPORTANT = new Set(['refinery', 'academy', 'workshop', 'mooring', 'bastion', 'shipyard', 'smelter', 'observatory', 'shieldgen', 'bakery', 'sawmill']);
  function makeRoom(type) {
    const [w, d] = B[type].size;
    const homeNet = (b) => netOf(b.island) === netOf('hearthrock') && b.state === 'built' && !b.upgrading;
    const cnt = (t) => G.buildings.filter((b) => b.type === t && homeNet(b)).length;
    const p = pop();
    const surplus = [
      ['lumber', stock('wood') > 150 && cnt('lumber') > 3],
      ['sawmill', stock('planks') > 150 && cnt('sawmill') > 2],
      ['quarry', stock('stone') > 150 && cnt('quarry') > 2],
      ['windmill', stock('flour') > 100 && cnt('windmill') > 1],
      ['well', cnt('well') > Math.ceil(p / 30) + 1],
      ['tavern', cnt('tavern') > Math.ceil(p / 40) + 1],
      ['warehouse', type !== 'warehouse' && cnt('warehouse') > 6],
      ['cottage', idle() > 8],
      ['smelter', stock('iron') > 300 && cnt('smelter') > 2],
      ['farm', foodRate() > p * 0.3 && stock('grain') > 400 && cnt('farm') > 3],
    ];
    for (const [t, ok] of surplus) {
      if (!ok) continue;
      // prefer one whose footprint is at least as big as what we need
      const list = G.buildings.filter((b) => b.type === t && homeNet(b));
      const fit = list.filter((b) => { const [bw, bd] = B[t].size; return bw * bd >= w * d; });
      const b = (fit.length ? fit : list)[0];
      if (!b) continue;
      const r = act.demolish(b.id);
      if (r.ok) { tally(`demolish for ${type}`); say(`demolish ${t} #${b.id} to make room for a ${type}`); spotCache.clear(); noSpot.clear(); return true; }
    }
    return false;
  }

  // No room for a cable station: knock down the cheapest building nearest the far end.
  const CHEAP = new Set(['cottage', 'lumber', 'quarry', 'sawmill', 'well', 'warehouse', 'tavern', 'windmill', 'farm']);
  function clearFor(islId) {
    const I = island(islId);
    const list = G.buildings.filter((b) => b.island === islId && CHEAP.has(b.type) && b.state === 'built')
      .sort((a, b) => Math.hypot(I.ox + a.u - aimAt[0], I.oy + a.v - aimAt[1]) - Math.hypot(I.ox + b.u - aimAt[0], I.oy + b.v - aimAt[1]));
    const b = list[0];
    if (!b) return false;
    const r = act.demolish(b.id);
    if (r.ok) { tally('demolish for cable'); say(`demolish ${b.type} #${b.id} on ${islId} to make room for a cable station`); spotCache.clear(); noSpot.clear(); }
    return r.ok;
  }

  // ---------- trade ----------
  function trade() {
    // trade routes: sell what piles up, buy what the island chains cannot make fast enough
    const moor = G.buildings.find((b) => b.type === 'mooring' && b.state === 'built' && netOf(b.island) === netOf('hearthrock'));
    if (moor && done('cargoholds')) {
      const ch = G.goals.chapter;
      const plan = [
        { to: 'brassreach', orders: [{ res: 'bread', mode: 'sell', n: 20 }, { res: 'parts', mode: 'buy', n: 20 }, { res: 'iron', mode: 'buy', n: 10 }, { res: 'coal', mode: 'buy', n: 10 }] },
        { to: 'porthalcyon', orders: [{ res: 'planks', mode: 'sell', n: 30 }, { res: 'ore', mode: 'buy', n: 40 }] },
      ];
      if (foodRate() < (G.colony.pop || 0) * 0.3 * 0.2) plan.splice(1, 0, { to: 'verdantdrift', orders: [{ res: 'planks', mode: 'sell', n: 20 }, { res: 'bread', mode: 'buy', n: 40 }] });
      if (ch >= 5 || G.colony.coin > 3000) plan.push({ to: 'brassreach', orders: [{ res: 'bread', mode: 'sell', n: 20 }, { res: 'parts', mode: 'buy', n: 40 }] });
      if (ch >= 6 || G.colony.coin > 8000) plan.push({ to: 'brassreach', orders: [{ res: 'iron', mode: 'buy', n: 40 }] });
      const keyOf = (to, orders) => to + ':' + orders.map((o) => o.mode + o.res).join(',');
      const have = {};
      for (const r of G.routes) { const k = keyOf(r.to, r.orders); have[k] = (have[k] || 0) + 1; }
      for (let i = 0; i < plan.length; i++) {
        const k = keyOf(plan[i].to, plan[i].orders);
        if (have[k]) { have[k]--; continue; }
        const freeShip = G.ships.find((s) => (s.kind === 'cargo' || s.kind === 'galleon') && !s.route && !s.task && s.state !== 'building');
        if (!freeShip) { if (G.ships.filter((s) => s.kind === 'cargo').length <= G.routes.length && ship('cargo')) return true; return false; }
        const r = act.route({ from: moor.id, to: plan[i].to, ship: freeShip.id, orders: plan[i].orders });
        if (r.ok) { tally('route'); say(`route ship ${freeShip.id} -> ${plan[i].to}`); return true; }
        waitT[`route ${plan[i].to}: ${r.error}`] = (waitT[`route ${plan[i].to}: ${r.error}`] || 0) + dt;
        return false;
      }
    }
    // contracts: accept anything we can likely deliver
    for (const c of G.contracts || []) {
      if (c.accepted || c.state === 'done' || c.state === 'failed') continue;
      const need = c.n - (c.delivered || 0);
      const plenty = ['iron', 'parts', 'skystone', 'aether'].includes(c.res) ? stock(c.res) >= need + 80 : stock(c.res) >= need + 30;
      if (plenty) {
        const r = act.contract(c.id);
        if (r.ok) { tally('contract'); say(`accept contract ${c.id} ${c.n} ${c.res} for ${c.port}`); return true; }
      }
    }
    // deliver accepted contracts by quick sale when the goods are in the stores
    for (const c of G.contracts || []) {
      if (!c.accepted || c.state !== 'active') continue;
      const left = c.n - (c.delivered || 0);
      const have = Math.floor(stock(c.res));
      if (left > 0 && have > 0) {
        const r = act.sell(c.res, Math.min(left, have));
        if (r.ok) { tally('deliver'); return true; }
      }
    }
    return false;
  }
  // Sell what is piling up against the cap for coin.
  function sellSurplus() {
    if (G.t - lastSell < 10) return false;
    const keep = { wood: 300, stone: 350, planks: 350, grain: 400, flour: 300, bread: 500, iron: 400, parts: 400, coal: 300, ore: 300 };
    for (const [k, v] of Object.entries(keep)) {
      const c = cap(k), s = stock(k);
      const top = Math.min(v * 1.5, Number.isFinite(c) ? c * 0.9 : Infinity);
      if (s > top && s > 80) {
        const q = Math.floor(s - Math.min(v, top * 0.7));
        const r = act.sell(k, q);
        if (r.ok) { lastSell = G.t; tally('sell'); say(`sell ${q} ${k}`); return true; }
      }
    }
    return false;
  }

  // ---------- raids ----------
  function defend() {
    if (!G.raid || G.raid.phase === 'warn') return false;
    const ab = G.tmp.abilities || {};
    for (const a of ['volley', 'lash', 'militia', 'shield']) {
      const st = ab[a];
      if (st ? !st.ready : (G.defend?.[a]?.cd > 0)) continue;
      let target;
      if (a === 'shield') {
        const hit = G.pirates.map((p) => p.isle).find(Boolean) || 'hearthrock';
        if (!G.buildings.some((b) => b.type === 'shieldgen' && b.state === 'built' && b.island === hit)) continue;
        target = hit;
      }
      const r = act.defend(a, target);
      if (r.ok) { tally(`defend ${a}`); say(`defend ${a}`); }
    }
    return false;
  }
  function repairs() {
    if (G.raid && G.raid.phase !== 'retreat') return false;
    for (const b of G.buildings) {
      if (b.state === 'ruin' || (b.state === 'built' && b.hp < b.maxHp * 0.5 && !b.fire)) {
        const r = act.repair(b.id);
        if (r.ok) { tally('repair'); say(`repair ${b.type} #${b.id}`); return true; }
      }
    }
    return false;
  }

  // ---------- the plan ----------
  const pop = () => G.colony.pop || 0;
  const popCap = () => G.colony.popCap || 0;
  const idle = () => G.colony.idle || 0;
  const foodRate = () => (rate('grain') + rate('bread') * 1.6);

  function goalSteps() {
    for (const s of G.tmp.goalSteps || []) {
      if (s.done) continue;
      const h = s.hint || {};
      if (h.tech && !done(h.tech) && !G.research.current) {
        const r = R[h.tech];
        if (r && r.needs.every(done) && canPay(`research ${h.tech}`, r.cost)) { const x = act.research(h.tech); if (x.ok) { tally('research'); say(`research ${h.tech} (goal)`); return true; } }
      }
      if (h.type && B[h.type] && !n(h.type)) { if (build(h.type, h.island, `goal ${s.id}`)) return true; }
      if (h.type === 'bridge' && linkUp()) return true;
      if (h.target && !isOwned(h.target) && claim(h.target)) return true;
      const cc = s.check?.contracts || (C.CHAPTERS.flatMap((c) => c.steps).find((x) => x.id === s.id)?.check?.contracts);
      if (cc && !G.contracts.some((c) => c.port === cc.port && c.accepted && c.state !== 'failed' && c.state !== 'done')) {
        const offers = G.contracts.filter((c) => c.port === cc.port && !c.accepted && c.state !== 'failed' && c.state !== 'done')
          .sort((a, b) => (a.n - stock(a.res)) - (b.n - stock(b.res)));
        if (offers[0]) { const r = act.contract(offers[0].id); if (r.ok) { tally('contract'); say(`accept contract ${offers[0].id} for goal`); return true; } }
      }
    }
    return false;
  }

  // The producer of each good, from content (resources[].from).
  const FROM = Object.fromEntries(C.RESOURCES.filter((r) => r.from && B[r.from]).map((r) => [r.id, r.from]));
  const siteOf = (type) => G.buildings.some((b) => b.type === type && b.state === 'site');
  const CAP = { lumber: 6, sawmill: 6, quarry: 5, windmill: 3, bakery: 4, smelter: 5, workshop: 5, farm: 8, coalpit: 3, mine: 4, academy: 6, drill: 4, refinery: 3, market: 2 };
  const PREFER = { farm: 'millbrook', mine: 'orespur', coalpit: 'orespur', smelter: 'kilnshelf', drill: 'kilnshelf', refinery: 'kilnshelf' };
  // Build one more producer of `res` if hands are free and its inputs flow.
  function more(res, why) {
    const type = FROM[res];
    if (!type || siteOf(type)) return false;
    const def = B[type];
    if (def.needs && !done(def.needs)) return false;
    if (stock(res) >= 120 && rate(res) > 0) return false;
    if (n(type) >= (CAP[type] ?? 99)) return false;
    if (G.buildings.some((b) => b.type === type && b.state === 'built' && b.stall && b.stall !== 'workers')) return false;
    if (labourShort() || (idle() < Math.max(1, (def.workers || 0) - 1) && popCap() - pop() < 2)) return false;
    for (const k of Object.keys(def.consumes || {})) if (rate(k) < (def.consumes[k] || 0) * 0.5 && stock(k) < 30 && k !== 'coal') return more(k, `${why} <- ${res}`);
    return build(type, PREFER[type] || null, why);
  }
  const labourShort = () => G.buildings.some((b) => b.state === 'built' && b.stall === 'workers' && b.on !== false);
  // Free hands and ground: knock down one producer of a raw good that sits at its cap.
  function trimSurplus() {
    const pairs = [['wood', 'lumber'], ['stone', 'quarry'], ['planks', 'sawmill'], ['ore', 'mine'], ['coal', 'coalpit'], ['iron', 'smelter'], ['flour', 'windmill']];
    for (const [res, type] of pairs) {
      const c = cap(res);
      if (!Number.isFinite(c) || stock(res) < c * 0.95) continue;
      const list = G.buildings.filter((b) => b.type === type && b.state === 'built' && !b.upgrading);
      if (list.length <= 2) continue;
      const b = list[list.length - 1];
      const r = act.demolish(b.id);
      if (r.ok) { tally(`demolish ${type}`); say(`demolish surplus ${type} #${b.id} (${res} at cap)`); return true; }
    }
    // more homes than work and the ground is wanted: let one cottage go
    const blocked = lastNoSpot > G.t - 30;
    if (idle() > 25 && blocked) {
      const list = G.buildings.filter((b) => b.type === 'cottage' && b.state === 'built' && netOf(b.island) === netOf('hearthrock'));
      const b = list[list.length - 1];
      if (b && act.demolish(b.id).ok) { tally('demolish cottage'); say(`demolish cottage #${b.id} (idle ${idle()})`); return true; }
    }
    return false;
  }
  // Converters pause when their output piles up, so their inputs go where they are short.
  const THROTTLE = [['workshop', 'parts', 320, 160], ['sawmill', 'planks', 450, 200], ['windmill', 'flour', 400, 150], ['bakery', 'bread', 800, 300], ['smelter', 'iron', 600, 300]];
  function throttle() {
    for (const [type, out, hi, lo] of THROTTLE) {
      const s = stock(out);
      const want = s > hi ? false : s < lo ? true : null;
      if (want === null) continue;
      const b = G.buildings.find((x) => x.type === type && x.state === 'built' && (x.on !== false) !== want);
      if (b) { const r = act.toggle(b.id, want); if (r.ok) { tally(`toggle ${type}`); say(`${want ? 'resume' : 'pause'} ${type} #${b.id} (${out} ${Math.round(s)})`); return true; } }
    }
    return false;
  }
  function economy() {
    const p = pop();
    throttle();
    if (G.t % 20 < dt + 0.01 && trimSurplus()) return true;
    const eat = p * 0.3;
    if (!siteOf('cottage') && labourShort() && idle() < 3 && popCap() - p < 4 && foodRate() > eat * 0.1 && build('cottage', 'hearthrock', 'workers wanted')) return true;
    // food first: settlers eat perSettler units a minute
    if (foodRate() < eat * 0.15 + 1 && !siteOf('farm') && build('farm', 'millbrook', 'food')) return true;
    // the basics
    if (ensure('lumber', 1, 'hearthrock', 'wood')) return true;
    if (ensure('quarry', 1, 'hearthrock', 'stone')) return true;
    if (ensure('sawmill', 1, 'hearthrock', 'planks')) return true;
    // whatever the colony was short of last think: one more producer
    for (const k of shortOf) if (more(k, `short of ${k}`)) return true;
    // steady targets sized to the population
    const want = { wood: 6 + p * 0.12, stone: 3 + p * 0.06, planks: 2 + p * 0.05 };
    for (const [k, v] of Object.entries(want)) if (rate(k) < v && more(k, `${k} rate ${rate(k).toFixed(1)} < ${v.toFixed(1)}`)) return true;
    // housing: keep a few beds free while there is work
    const jobs = (G.tmp.jobs?.want || 0) + (G.tmp.jobs?.builders || 0);
    if (!siteOf('cottage') && popCap() - p < 3 && jobs >= p - 3 && idle() < 4 && foodRate() > eat * 0.1 && build('cottage', 'hearthrock', 'housing')) return true;
    if (p >= 8 && ensure('well', Math.ceil(p / 30), 'hearthrock', 'water')) return true;
    if (p >= 10 && ensure('windmill', 1, 'hearthrock', 'flour')) return true;
    if (p >= 10 && ensure('bakery', 1, 'hearthrock', 'bread')) return true;
    if (p >= 12 && ensure('academy', 1, 'hearthrock', 'insight')) return true;
    if (p >= 18 && ensure('tavern', Math.ceil(p / 40), 'hearthrock', 'happiness')) return true;
    if (p >= 20 && ensure('market', 1, 'hearthrock', 'coin')) return true;
    // flour/bread chain sized to grain
    if (rate('grain') > 12 && rate('flour') < 4 && more('flour', 'grain surplus')) return true;
    if (rate('flour') > 6 && more('bread', 'flour surplus')) return true;
    // iron chain
    if (done('bellows')) {
      if (ensure('mine', 1, 'orespur', 'ore')) return true;
      const ventSmelter = G.buildings.some((b) => b.type === 'smelter' && b.vent);
      if (!ventSmelter && ensure('coalpit', 1, 'orespur', 'coal')) return true;
      if (ensure('smelter', 1, isOwned('kilnshelf') ? 'kilnshelf' : null, 'iron')) return true;
      if (ensure('workshop', 1, 'hearthrock', 'parts')) return true;
      const ch = G.goals.chapter;
      const iron = 2 + ch * 1.2, parts = ch * 0.8;
      if (stock('parts') < 40 + G.goals.chapter * 10 && stock('iron') > 40 && rate('parts') < parts + 2 && !siteOf('workshop')
        && !G.buildings.some((b) => b.type === 'workshop' && b.state === 'built' && b.stall && b.stall !== 'workers') && !labourShort()
        && build('workshop', isOwned('kilnshelf') ? 'kilnshelf' : null, 'parts are short')) return true;
      if (rate('iron') < iron && more('iron', `iron rate ${rate('iron').toFixed(1)}`)) return true;
      if (rate('parts') < parts && rate('iron') > 3 && more('parts', `parts rate ${rate('parts').toFixed(1)}`)) return true;
    }
    if (idle() >= 8 && n('academy') < 6 && !siteOf('academy') && build('academy', 'hearthrock', 'idle hands to scholars')) return true;
    if (p >= 30 && rate('insight') < 6 + G.goals.chapter * 2 && n('academy') < 3 && !siteOf('academy') && build('academy', 'hearthrock', 'research')) return true;
    // storage only when something we want costs more than the cap, or a precious good is capped
    const tight = Object.keys(needCap).some((k) => needCap[k] > G.t - 60)
      || (n('warehouse') < 5 && ['iron', 'parts', 'skystone', 'aether'].some((k) => Number.isFinite(cap(k)) && stock(k) > cap(k) * 0.9));
    if (tight && !siteOf('warehouse') && build('warehouse', 'hearthrock', 'storage')) return true;
    if (built('bakery') && stock('parts') > 60 && jobs >= p - 3 && idle() < 4 && upgradeOne('cottage', 'townhouse')) return true;
    return false;
  }

  function expansion() {
    for (const id of CLAIM_ORDER) {
      if (isOwned(id)) continue;
      if (id === 'orespur' && !(done('bellows') || G.research.current === 'bellows' || pop() > 30)) continue;
      if (id === 'kilnshelf' && !(n('mine') && pop() > 40)) continue;
      if (id === 'pinecrest' && !done('turbines')) continue;
      if (claim(id)) return true;
      break;
    }
    if (linkUp()) return true;
    for (const i of owned()) if (needsCable(i.id)) return true;
    if ((G.goals.chapter >= 3 || done('skiffs')) && ensure('mooring', 1, 'hearthrock', 'trade')) return true;
    if (done('skiffs') && built('mooring') && !G.ships.some((s) => s.kind === 'skiff') && ship('skiff')) return true;
    if (done('cargoholds') && built('mooring') && G.ships.filter((s) => s.kind === 'cargo').length < 1 + (G.goals.chapter >= 6 ? 1 : 0) && ship('cargo')) return true;
    if (G.goals.chapter >= 5 || (done('cargoholds') && done('harpoons') && pop() > 70)) {
      if (!isOwned('emberrock') && claim('emberrock')) return true;
    }
    if (done('stormtaming') && !isOwned('glimmerreach') && claim('glimmerreach')) return true;
    return false;
  }
  function ship(kind) {
    const def = SHIP[kind];
    if (!def || (def.needs && !done(def.needs))) return false;
    const docks = G.buildings.filter((b) => b.state === 'built' && (def.where === 'shipyard' ? b.type === 'shipyard' : (b.type === 'mooring' || b.type === 'shipyard')));
    if (!docks.length) return false;
    if (!canPay(`ship ${kind}`, def.cost, docks[0].island)) return false;
    let r = { ok: false, error: 'no dock' };
    for (const d of docks) { r = act.ship(kind, d.id); if (r.ok || !/berth/i.test(r.error || '')) break; }
    if (!r.ok && /berth/i.test(r.error || '') && def.where !== 'shipyard' && !siteOf('mooring')) return build('mooring', 'hearthrock', 'more berths');
    if (r.ok) { tally(`ship ${kind}`); say(`ship ${kind}`); return true; }
    waitT[`ship ${kind}: ${r.error}`] = (waitT[`ship ${kind}: ${r.error}`] || 0) + dt;
    return false;
  }

  function defences() {
    const ch = G.goals.chapter;
    if (ch < 4) return false;
    if (done('harpoons') && n('harpoon') < Math.min(6, 2 + Math.floor(pop() / 50)) && build('harpoon', 'hearthrock', 'defence')) return true;
    if (done('rods')) {
      if (G.buildings.filter((b) => b.type === 'rod' && b.island === 'hearthrock').length < 2 && build('rod', 'hearthrock', 'storms', true)) return true;
      for (const i of owned()) if (!G.buildings.some((b) => b.type === 'rod' && b.island === i.id) && build('rod', i.id, 'storms', true)) return true;
    }
    // the Dreadnought comes for the forge: guns on Glimmerreach before stage 5
    if (isOwned('glimmerreach') && n('skyforge')) {
      const here = (t) => G.buildings.filter((b) => b.type === t && b.island === 'glimmerreach').length;
      if (done('harpoons') && here('harpoon') < 3 && build('harpoon', 'glimmerreach', 'guard the forge', true)) return true;
      if (done('bastion') && here('bastion') < 1 && build('bastion', 'glimmerreach', 'dreadnought', true)) return true;
      if (done('shields') && stock('aether') > 40 && here('shieldgen') < 1 && build('shieldgen', 'glimmerreach', 'shield the forge', true)) return true;
    }
    return false;
  }

  function skystone() {
    if (!done('crystallore')) return false;
    if (ensure('drill', 1, 'kilnshelf', 'skystone')) return true;
    if (done('levitation') && ensure('refinery', 1, 'kilnshelf', 'aether')) return true;
    if (G.goals.chapter >= 6 && n('drill') < 3 && built('drill') && build('drill', null, 'more skystone')) return true;
    if (G.goals.chapter >= 6 && n('refinery') < 2 && built('refinery') && stock('skystone') > 20 && build('refinery', null, 'more aether')) return true;
    return false;
  }

  function skyforge() {
    if (!isOwned('glimmerreach')) return false;
    if (ensure('skyforge', 1, 'glimmerreach', 'victory', true)) return true;
    const sf = G.buildings.find((b) => b.type === 'skyforge' && b.state === 'built');
    if (!sf || sf.forge) return false;
    // before lighting it (stage 5 calls the Dreadnought) wait for the guns on Glimmerreach
    if ((sf.level || 0) === 4 && done('harpoons') && G.buildings.filter((b) => b.type === 'harpoon' && b.island === 'glimmerreach' && b.state === 'built').length < 2) { waitT['skyforge: guns first'] = (waitT['skyforge: guns first'] || 0) + dt; return false; }
    const r = act.upgrade(sf.id);
    if (r.ok) { tally('skyforge stage'); say(`skyforge stage ${(sf.level || 0) + 1}`); return true; }
    waitT[`skyforge: ${r.error}`] = (waitT[`skyforge: ${r.error}`] || 0) + dt;
    return false;
  }

  function think() {
    G = getG();
    if (!G || G.goals?.won) return;
    dt = Math.max(0, G.t - lastT) || 1; lastT = G.t;
    shortOf = Object.keys(reserved).filter((k) => k !== 'coin' && k !== 'insight');
    reserved = {};
    spotCache.clear();
    budget = 3;
    defend();
    if (G.event) { onEvent(); return; }
    const phases = [repairs, goalSteps, economy, research, expansion, skystone, defences, skyforge, trade, sellSurplus];
    for (const f of phases) {
      if (budget <= 0) break;
      try { f(); } catch (e) { waitT[`error ${f.name}: ${e.message}`] = (waitT[`error ${f.name}: ${e.message}`] || 0) + dt; }
    }
  }

  function onEvent() {
    G = getG();
    if (!G?.event) return;
    // prefer an option that does not cost anything we lack; else the first
    const opts = G.event.options || [];
    let pick = 0;
    for (let i = 0; i < opts.length; i++) {
      const c = opts[i].cost;
      if (!c || !Object.keys(missing(c)).length) { pick = i; break; }
    }
    const r = act.choose(pick);
    tally('choose');
    say(`event ${G.event?.id || ''} -> ${pick} ${r.ok ? '' : r.error}`);
  }

  return { think, onEvent, waits: () => ({ ...waitT }), counts: () => ({ ...count }), build, claim, research, linkUp };
}

// The in-game autopilot (__sf.auto(true)).
export function createBot(app) {
  let brain = null, lastG = null, lastT = -1;
  const bot = {
    on: true,
    get brain() { return brain; },
    update() {
      const G = app.G;
      if (!bot.on || !G || G.goals?.won) return;
      if (G !== lastG) { lastG = G; brain = createBrain({ getG: () => app.G, act: app.act, C: app.content }); lastT = -1; }
      if (G.event) { brain.onEvent(); return; }
      if (G.t - lastT >= 1) { lastT = G.t; brain.think(); }
    },
  };
  return bot;
}
