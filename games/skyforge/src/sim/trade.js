// Trade (PROGRESSION): foreign ports with drifting prices, trade routes run by
// real ships, carry routes between your own unlinked networks, contracts and
// reputation, and quickSell to a courier at the town hall.
//
// PortState = { id, mult:{res: x} (what they pay, x VALUE), sell:{res: x} (what they charge),
//               trend:{res: x} (daily drift), stock:{res: n} (goods they sell), rep 0..100,
//               earned, nextContract (G.t) }
// Route = { id, name, from: islandId, dock: buildingId, to: portId|islandId, ship: shipId|null,
//           orders: [{ res, mode:'sell'|'buy'|'carry', n }], on, state, t, eta, cargo, trips, earned, last }
//   to a port: 'sell' leaves with goods and sells them, 'buy' buys on the way back.
//   to an island of yours (another network): 'carry' takes goods there, 'buy' fetches goods back.
//   states: 'loading' -> 'outbound' -> 'trading' -> 'inbound' -> 'unloading' -> 'loading' ...,
//   plus 'positioning' (ship flying to the dock), 'waiting' (nothing to load yet), 'paused', 'noship'.
// Contract = { id, port, res, n, delivered, due (day), reward:{coin, rep}, accepted, state:'offered'|'active'|'done'|'failed', expires (G.t) }
import { PORTS, VALUE } from '../content/ports.js';
import { CFG, DAY } from '../config.js';
import { clamp } from '../core/math.js';
import { bonus, isUnlocked } from './research.js';
import * as fleet from './fleet.js';
import { gain, have, room, rootOf, homeRoot, notify, islandById, bump } from './ledger.js';

const C = () => CFG.progression.trade;
const PORT = Object.fromEntries(PORTS.map((p) => [p.id, p]));
const TRADABLE = new Set(Object.keys(VALUE));

export const portState = (G, id) => G.ports.find((p) => p.id === id) || null;
export const repTier = (rep) => { const t = C().repTiers; let k = 0; for (let i = 0; i < t.length; i++) if (rep >= t[i]) k = i; return k; };
export const REP_NAMES = ['Stranger', 'Known', 'Trusted', 'Honoured'];

// Coin one unit of `res` fetches at `port` right now.
export function sellPrice(G, port, res) {
  const p = portState(G, port); if (!p || !TRADABLE.has(res)) return 0;
  const m = p.mult[res] ?? 0.75;
  return VALUE[res] * m * (1 + bonus(G, 'tradeIncome')) * (1 + repTier(p.rep) * C().repBonus);
}
// Coin one unit of `res` costs at `port` (null if they don't sell it).
export function buyPrice(G, port, res) {
  const p = portState(G, port); if (!p || p.sell[res] == null) return null;
  return VALUE[res] * p.sell[res] * C().buyMarkup * (1 - repTier(p.rep) * C().repBonus * 0.5);
}
export function bestPort(G, res) {
  let best = null, v = 0;
  for (const p of G.ports) { const x = sellPrice(G, p.id, res); if (x > v) { v = x; best = p.id; } }
  return { port: best, price: v };
}

function baseMult(port, res) { return PORT[port].buys[res] ?? 0.75; }

export function init(G) {
  G.ports = PORTS.map((p, k) => ({
    id: p.id,
    mult: Object.fromEntries(Object.keys(VALUE).map((r) => [r, baseMult(p.id, r)])),
    sell: { ...p.sells },
    trend: Object.fromEntries(Object.keys(VALUE).map((r) => [r, 1])),
    stock: Object.fromEntries(Object.keys(p.sells).map((r) => [r, C().stockMax * 0.6])),
    rep: 0, earned: 0, nextContract: 300 * (1 + k * 0.5),
  }));
  G.routes = G.routes || [];
  G.contracts = G.contracts || [];
}

export function hydrate(G) {
  for (const p of G.ports) { p.trend = p.trend || {}; p.stock = p.stock || {}; }
  G.tmp.trade = { prices: {} };
  refreshPrices(G);
}

function refreshPrices(G) {
  const out = {};
  for (const p of G.ports) {
    out[p.id] = {};
    for (const r of Object.keys(VALUE)) out[p.id][r] = { sell: sellPrice(G, p.id, r), buy: buyPrice(G, p.id, r) };
  }
  G.tmp.trade = G.tmp.trade || {};
  G.tmp.trade.prices = out;
}

// ---- selling and buying at a port ---------------------------------------------
// Sells n of res at port. Active contracts there for res are filled first.
function sellAt(G, port, res, n, via = 'route') {
  if (n <= 0) return 0;
  let left = n;
  left -= deliver(G, port, res, left);
  let coin = 0;
  if (left > 0) {
    const p = portState(G, port);
    coin = Math.round(sellPrice(G, port, res) * left);
    G.colony.coin = (G.colony.coin || 0) + coin;
    p.mult[res] = Math.max(C().floor, (p.mult[res] ?? 0.75) - C().saturation * left * (p.mult[res] ?? 0.75));
    p.earned += coin;
    addRep(G, p, coin * C().repPerSale);
    bump(G, 'tradeCoin', coin);
    G.bus.emit('trade:sale', { port, res, n: left, coin, via });
  }
  return coin;
}

function addRep(G, p, n) {
  const before = repTier(p.rep);
  p.rep = clamp(p.rep + (n > 0 ? n * (1 + bonus(G, 'reputation')) : n), 0, 100);
  const after = repTier(p.rep);
  if (after > before) notify(G, `${PORT[p.id].name} now counts you ${REP_NAMES[after]}`, 'good', 'coin');
}
export function addReputation(G, port, n) {
  if (port == null) { for (const p of G.ports) addRep(G, p, n); return; }
  const p = portState(G, port); if (p) addRep(G, p, n);
}

// ---- contracts -------------------------------------------------------------------
// Puts up to n of res toward active contracts (at `port`, or any port when null). Returns units used.
function deliver(G, port, res, n) {
  let used = 0;
  const list = G.contracts.filter((c) => c.state === 'active' && c.res === res && (port == null || c.port === port)).sort((a, b) => a.due - b.due);
  for (const c of list) {
    if (used >= n) break;
    const k = Math.min(n - used, c.n - c.delivered);
    c.delivered += k; used += k;
    if (c.delivered >= c.n) finishContract(G, c);
  }
  return used;
}

function finishContract(G, c) {
  c.state = 'done';
  G.colony.coin = (G.colony.coin || 0) + c.reward.coin;
  addReputation(G, c.port, c.reward.rep);
  bump(G, 'contracts'); bump(G, 'contracts:' + c.port);
  bump(G, 'tradeCoin', c.reward.coin);
  G.bus.emit('contract:done', { c });
  notify(G, `Contract fulfilled for ${PORT[c.port].name}: +${c.reward.coin} coin`, 'good', 'scroll');
}

export function acceptContract(G, id) {
  const c = G.contracts.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'No such contract' };
  if (c.state !== 'offered') return { ok: false, error: 'That contract is not on offer' };
  const active = G.contracts.filter((x) => x.state === 'active').length;
  if (active >= 3 + (isUnlocked(G, 'feature:contracts2') && bonus(G, 'contractReward') ? 2 : 0)) return { ok: false, error: 'Too many contracts at once' };
  c.state = 'active'; c.accepted = true; c.due = G.day + c.days;
  G.bus.emit('contract:accepted', { c });
  return { ok: true, id };
}

// Goods a port may ask for at this point of the story.
function allowedGoods(G) {
  const ch = G.goals.chapter;
  const s = new Set(['planks', 'stone', 'bread']);
  if (ch >= 3) { s.add('iron'); s.add('wood'); }
  if (ch >= 4) s.add('parts');
  if (ch >= 6) { s.add('skystone'); s.add('aether'); }
  return s;
}

export function offerContract(G, port, res = null, n = null, days = null) {
  const p = PORT[port]; if (!p) return null;
  const R = G.rng.econ;
  const ch = G.goals.chapter;
  if (!res) {
    const ok = allowedGoods(G);
    const opts = p.wants.filter((r) => ok.has(r));
    if (!opts.length) return null;
    res = R.pick(opts);
  }
  if (!n) {
    const worth = 110 * (1 + 0.6 * Math.max(0, ch - 3)) * R.range(0.8, 1.25);
    n = clamp(Math.round(worth / VALUE[res] / 5) * 5, 5, 300);
  }
  const [d0, d1] = C().contractDays;
  days = days || R.int(d0, d1);
  const coin = Math.round(n * VALUE[res] * C().contractPremium * (1 + bonus(G, 'contractReward')));
  const c = {
    id: G.nextId++, port, res, n, delivered: 0, days, due: G.day + days,
    reward: { coin, rep: C().contractRep }, accepted: false, state: 'offered', expires: G.t + 2 * DAY, at: G.t,
  };
  G.contracts.push(c);
  G.bus.emit('contract:new', { c });
  return c;
}

function stepContracts(G) {
  const c = C();
  // the story contract for chapter 3: Port Halcyon wants iron
  if (G.goals.chapter >= 3 && !G.goals.flags.firstContract) {
    G.goals.flags.firstContract = true;
    const k = offerContract(G, 'porthalcyon', 'iron', 10, 6);
    if (k) { k.expires = 1e12; notify(G, 'Port Halcyon offers a contract: 10 iron', 'info', 'scroll'); }
  }
  for (const p of G.ports) {
    if (G.goals.chapter < 3) break;
    if (G.t < p.nextContract) continue;
    p.nextContract = G.t + c.contractEvery * 300 * G.rng.econ.range(0.7, 1.3);
    const open = G.contracts.filter((k) => k.port === p.id && (k.state === 'offered' || k.state === 'active')).length;
    if (open < c.contractMax) offerContract(G, p.id);
  }
  const storyDone = (G.stats.totals?.['contracts:porthalcyon'] || 0) > 0;
  for (const k of G.contracts) {
    if (k.state === 'offered' && k.expires >= 1e12 && storyDone) k.expires = G.t + DAY;
    if (k.state === 'offered' && G.t > k.expires) k.state = 'expired';
    else if (k.state === 'active' && G.day > k.due) {
      k.state = 'failed';
      addReputation(G, k.port, c.contractFailRep);
      G.bus.emit('contract:failed', { c: k });
      notify(G, `Contract for ${PORT[k.port].name} failed`, 'bad', 'scroll');
    }
  }
  // keep the ledger short: drop old finished entries
  if (G.contracts.length > 24) G.contracts = G.contracts.filter((k, i) => k.state === 'offered' || k.state === 'active' || i >= G.contracts.length - 12);
}

// ---- quick sell --------------------------------------------------------------------
export function quickSell(G, res, n) {
  if (!G) return { ok: false, error: 'No colony' };
  if (!TRADABLE.has(res)) return { ok: false, error: `Nobody buys ${res}` };
  n = Math.floor(n);
  const root = homeRoot(G);
  const h = Math.floor(have(G, res, root));
  if (!(n > 0)) return { ok: false, error: 'Sell how many?' };
  if (h <= 0) return { ok: false, error: `No ${res} in store` };
  n = Math.min(n, h);
  gain(G, res, -n, root);
  const used = deliver(G, null, res, n);
  const left = n - used;
  let coin = 0;
  if (left > 0) {
    const { port, price } = bestPort(G, res);
    coin = Math.round(price * C().quickSell * left);
    G.colony.coin = (G.colony.coin || 0) + coin;
    const p = portState(G, port);
    if (p) p.mult[res] = Math.max(C().floor, (p.mult[res] ?? 0.75) - C().saturation * 0.5 * left * (p.mult[res] ?? 0.75));
    bump(G, 'tradeCoin', coin);
    G.bus.emit('trade:sale', { port: 'courier', res, n: left, coin, via: 'courier' });
  }
  return { ok: true, coin, delivered: used, n };
}

// ---- routes --------------------------------------------------------------------------
function findDock(G, island, prefer = null) {
  if (prefer != null) { const b = G.buildings.find((x) => x.id === prefer); if (fleet.isDock(b) && b.island === island) return b; }
  return G.buildings.find((b) => fleet.isDock(b) && b.island === island) || null;
}

function validate(G, o, routeId = null) {
  if (!isUnlocked(G, 'feature:routes')) return { ok: false, error: 'Research Cargo Holds to run trade routes' };
  const s = G.ships.find((x) => x.id === o.ship);
  if (!s) return { ok: false, error: 'Choose a ship' };
  if (s.state === 'building') return { ok: false, error: 'That ship is still on the slip' };
  if (fleet.capacityOf(G, s) <= 0) return { ok: false, error: `The ${s.name} carries no cargo` };
  if (s.task && s.task.kind === 'expedition') return { ok: false, error: `The ${s.name} is away on an expedition` };
  if (s.route != null && s.route !== routeId) return { ok: false, error: `The ${s.name} already runs a route` };
  const fromI = islandById(G, o.from);
  if (!fromI || !fromI.owned) return { ok: false, error: 'Routes start at one of your islands' };
  const dock = findDock(G, o.from, o.dock ?? s.home);
  if (!dock) return { ok: false, error: `${fromI.name} has no mooring` };
  const toPort = PORT[o.to];
  const toI = !toPort && islandById(G, o.to);
  if (!toPort && !toI) return { ok: false, error: 'Choose a port or island' };
  if (toI) {
    if (!toI.owned) return { ok: false, error: `${toI.name} is not yours` };
    if (!findDock(G, toI.id)) return { ok: false, error: `${toI.name} has no mooring` };
    if (toI.id === o.from) return { ok: false, error: 'A route needs two different places' };
  }
  const orders = (o.orders || []).map((x) => ({ res: x.res, mode: x.mode || 'sell', n: Math.max(1, Math.floor(x.n || 1)) }));
  for (const x of orders) {
    if (!TRADABLE.has(x.res)) return { ok: false, error: `Unknown goods ${x.res}` };
    if (!['sell', 'buy', 'carry'].includes(x.mode)) return { ok: false, error: `Unknown order ${x.mode}` };
    if (toPort && x.mode === 'carry') return { ok: false, error: 'Carry orders go between your own islands' };
    if (toPort && x.mode === 'buy' && PORT[o.to].sells[x.res] == null) return { ok: false, error: `${toPort.name} does not sell ${x.res}` };
    if (toI && x.mode === 'sell') x.mode = 'carry';
  }
  if (!orders.length) return { ok: false, error: 'Give the route at least one order' };
  return { ok: true, ship: s, dock, orders, toPort: !!toPort };
}

export function createRoute(G, o = {}) {
  if (!G) return { ok: false, error: 'No colony' };
  o = { ...o };
  if (o.ship == null) {
    const s = fleet.freeShips(G, 'trade').find((x) => fleet.capacityOf(G, x) > 0);
    if (s) o.ship = s.id;
  }
  const sh = G.ships.find((x) => x.id === o.ship);
  if (o.from == null && sh) o.from = fleet.homeDock(G, sh)?.island ?? sh.island;
  // `from` may be a dock building id
  if (typeof o.from === 'number') { const b = G.buildings.find((x) => x.id === o.from); if (b) { o.dock = b.id; o.from = b.island; } }
  const v = validate(G, o);
  if (!v.ok) return v;
  const id = G.nextId++;
  const dest = PORT[o.to] ? PORT[o.to].name : islandById(G, o.to).name;
  const r = {
    id, name: o.name || `${islandById(G, o.from).name} - ${dest}`, from: o.from, dock: v.dock.id, to: o.to,
    ship: v.ship.id, orders: v.orders, on: true, state: 'loading', t: 0, eta: null, cargo: v.ship.cargo, trips: 0, earned: 0, last: null,
  };
  G.routes.push(r);
  attach(G, r, v.ship);
  G.bus.emit('route:new', { r });
  return { ok: true, id };
}

function attach(G, r, s) {
  s.route = r.id; s.task = { kind: 'route', id: r.id };
  r.ship = s.id; r.cargo = s.cargo;
  r.state = s.island === islandById(G, r.from)?.id && s.home === r.dock && s.state !== 'flying' ? 'loading' : 'positioning';
  r.t = 0;
  if (r.state === 'positioning') fleet.sendTo(G, s, { kind: 'dock', id: r.dock });
}

function detach(G, r) {
  const s = G.ships.find((x) => x.id === r.ship);
  if (s) { s.route = null; s.task = null; if (s.state !== 'flying') s.state = 'arrived'; }
  r.ship = null;
}

export function editRoute(G, id, patch = {}) {
  const r = G.routes.find((x) => x.id === id);
  if (!r) return { ok: false, error: 'No such route' };
  const next = { from: r.from, dock: r.dock, to: r.to, ship: r.ship, orders: r.orders, ...patch };
  if (patch.on !== undefined && Object.keys(patch).length === 1) {
    r.on = !!patch.on; r.state = r.on ? (r.ship ? 'positioning' : 'noship') : 'paused';
    const s = G.ships.find((x) => x.id === r.ship);
    if (s) { if (r.on) { s.task = { kind: 'route', id: r.id }; r.state = 'positioning'; fleet.sendTo(G, s, { kind: 'dock', id: r.dock }); } else { s.task = null; } }
    return { ok: true, id };
  }
  const v = validate(G, next, r.id);
  if (!v.ok) return v;
  if (v.ship.id !== r.ship) { detach(G, r); }
  Object.assign(r, { from: next.from, dock: v.dock.id, to: next.to, orders: v.orders, name: patch.name || r.name });
  if (v.ship.id !== r.ship) attach(G, r, v.ship);
  return { ok: true, id };
}

export function deleteRoute(G, id) {
  const i = G.routes.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: 'No such route' };
  detach(G, G.routes[i]);
  G.routes.splice(i, 1);
  return { ok: true };
}

// Load sell/carry orders from the home pool (capacity-limited).
function load(G, r, s) {
  const root = rootOf(G, r.from);
  let free = fleet.capacityOf(G, s) - fleet.cargoCount(s);
  let n = 0;
  for (const o of r.orders) {
    if (o.mode === 'buy') continue;
    const k = Math.min(o.n - (s.cargo[o.res] || 0), Math.floor(have(G, o.res, root)), free);
    if (k <= 0) continue;
    gain(G, o.res, -k, root);
    s.cargo[o.res] = (s.cargo[o.res] || 0) + k;
    free -= k; n += k;
  }
  return n;
}

function tradeAtPort(G, r, s) {
  let coin = 0;
  for (const o of r.orders) {
    if (o.mode !== 'sell') continue;
    const q = s.cargo[o.res] || 0;
    if (q <= 0) continue;
    coin += sellAt(G, r.to, o.res, q);
    delete s.cargo[o.res];
  }
  const p = portState(G, r.to);
  let spent = 0;
  let free = fleet.capacityOf(G, s) - fleet.cargoCount(s);
  for (const o of r.orders) {
    if (o.mode !== 'buy') continue;
    const price = buyPrice(G, r.to, o.res);
    if (price == null) continue;
    const afford = Math.floor((G.colony.coin || 0) / Math.max(0.01, price));
    const k = Math.max(0, Math.min(o.n, Math.floor(p.stock[o.res] || 0), free, afford));
    if (k <= 0) continue;
    const cost = Math.round(price * k);
    G.colony.coin -= cost; spent += cost;
    p.stock[o.res] -= k;
    p.sell[o.res] = Math.min(C().ceil, p.sell[o.res] + C().saturation * k * p.sell[o.res]);
    s.cargo[o.res] = (s.cargo[o.res] || 0) + k; free -= k;
    G.bus.emit('trade:buy', { port: r.to, res: o.res, n: k, coin: cost });
  }
  r.last = { coin, spent, t: G.t };
  r.earned += coin - spent;
}

function tradeAtIsland(G, r, s) {
  const root = rootOf(G, r.to);
  for (const o of r.orders) {
    if (o.mode !== 'carry') continue;
    const q = s.cargo[o.res] || 0; if (!q) continue;
    const moved = gain(G, o.res, Math.min(q, room(G, o.res, root)), root);
    s.cargo[o.res] = q - moved; if (s.cargo[o.res] <= 0) delete s.cargo[o.res];
  }
  let free = fleet.capacityOf(G, s) - fleet.cargoCount(s);
  for (const o of r.orders) {
    if (o.mode !== 'buy') continue;
    const k = Math.min(o.n, Math.floor(have(G, o.res, root)), free);
    if (k <= 0) continue;
    gain(G, o.res, -k, root);
    s.cargo[o.res] = (s.cargo[o.res] || 0) + k; free -= k;
  }
  r.last = { coin: 0, spent: 0, t: G.t };
}

function target(G, r) { return PORT[r.to] ? { kind: 'port', id: r.to } : { kind: 'dock', id: findDock(G, r.to)?.id }; }
function destPoint(G, r) {
  if (PORT[r.to]) return fleet.portPos(r.to);
  const d = findDock(G, r.to); return d ? fleet.dockPos(G, d) : null;
}

function stepRoute(G, r, dt) {
  if (!r.on) { r.state = 'paused'; return; }
  const s = G.ships.find((x) => x.id === r.ship);
  if (!s) { r.state = 'noship'; r.eta = null; return; }
  if (s.state === 'defend' || s.state === 'building') return;
  r.cargo = s.cargo;
  const dockT = CFG.progression.fleet.dockTime;
  const home = G.buildings.find((b) => b.id === r.dock);
  if (!fleet.isDock(home)) {
    const d = findDock(G, r.from);
    if (!d) { r.state = 'nodock'; return; }
    r.dock = d.id;
  }
  switch (r.state) {
    case 'noship': case 'paused': case 'nodock':
      r.state = 'positioning'; fleet.sendTo(G, s, { kind: 'dock', id: r.dock }); break;
    case 'positioning':
      if (s.state === 'arrived' || (s.state !== 'flying' && s.home === r.dock && s.island === r.from)) { s.state = 'loading'; r.state = 'loading'; r.t = 0; }
      else if (s.state !== 'flying') fleet.sendTo(G, s, { kind: 'dock', id: r.dock });
      break;
    case 'loading':
      s.state = 'loading'; r.t += dt;
      if (r.t >= dockT) {
        load(G, r, s);
        const hasBuy = r.orders.some((o) => o.mode === 'buy');
        if (fleet.cargoCount(s) > 0 || hasBuy) {
          const t = target(G, r);
          if (t.id == null || !fleet.sendTo(G, s, t)) { r.state = 'waiting'; r.t = 0; break; }
          r.state = 'outbound'; r.t = 0;
        } else { r.state = 'waiting'; r.t = 0; }
      }
      break;
    case 'waiting':
      s.state = 'idle'; r.t += dt;
      if (r.t >= 10) { r.state = 'loading'; r.t = 0; }
      break;
    case 'outbound':
      if (s.state === 'arrived') { s.state = 'trading'; r.state = 'trading'; r.t = 0; }
      break;
    case 'trading':
      s.state = 'trading'; r.t += dt;
      if (r.t >= dockT) {
        if (PORT[r.to]) tradeAtPort(G, r, s); else tradeAtIsland(G, r, s);
        fleet.sendTo(G, s, { kind: 'dock', id: r.dock });
        r.state = 'inbound'; r.t = 0;
      }
      break;
    case 'inbound':
      if (s.state === 'arrived') { s.state = 'unloading'; r.state = 'unloading'; r.t = 0; }
      else if (s.state !== 'flying') fleet.sendTo(G, s, { kind: 'dock', id: r.dock });
      break;
    case 'unloading':
      s.state = 'unloading'; r.t += dt;
      if (r.t >= dockT) {
        fleet.unloadAll(G, s, rootOf(G, r.from));
        r.trips++; bump(G, 'trips');
        G.bus.emit('route:trip', { r });
        r.state = 'loading'; r.t = 0;
      }
      break;
    default: r.state = 'positioning';
  }
  // eta: seconds until the ship is back home
  if (s.state === 'flying' && s.dest) {
    const there = fleet.flightTime(G, s, s.dest.x, s.dest.y);
    const back = r.state === 'outbound' ? (() => { const a = destPoint(G, r), b = home ? fleet.dockPos(G, home) : a; return a && b ? fleet.flightTime(G, { ...s, x: a.x, y: a.y }, b.x, b.y) + dockT * 2 : 0; })() : dockT;
    r.eta = Math.round(there + back);
  } else r.eta = r.state === 'loading' || r.state === 'unloading' || r.state === 'trading' ? Math.round(Math.max(0, dockT - r.t)) : null;
}

export function step(G, dt) {
  const c = C();
  // prices: recover toward their (drifting) base, port stock regrows
  const k = 1 - Math.exp(-(c.recover / 60) * dt);
  for (const p of G.ports) {
    for (const r of Object.keys(p.mult)) {
      const base = baseMult(p.id, r) * (p.trend[r] || 1);
      p.mult[r] += (base - p.mult[r]) * k;
    }
    for (const r of Object.keys(p.sell)) {
      const base = PORT[p.id].sells[r] * (p.trend[r] || 1);
      p.sell[r] += (base - p.sell[r]) * k;
      p.stock[r] = Math.min(c.stockMax, (p.stock[r] || 0) + (c.stockPerMin / 60) * dt);
    }
  }
  if (G.tmp.tradeDay !== G.day) {
    // once a day, every price wanders a little (seeded)
    if (G.tmp.tradeDay != null) for (const p of G.ports) for (const r of Object.keys(p.mult)) p.trend[r] = clamp((p.trend[r] || 1) * (1 + G.rng.econ.range(-c.drift, c.drift)), 0.8, 1.25);
    G.tmp.tradeDay = G.day;
  }
  for (const r of G.routes) stepRoute(G, r, dt);
  stepContracts(G);
  G.tmp.tradeT = (G.tmp.tradeT || 0) - dt;
  if (G.tmp.tradeT <= 0) { G.tmp.tradeT = 1; refreshPrices(G); }
}

export { TRADABLE };
