// The action API. The UI, input, the bot and window.__sf all call act.* so a
// click and a test take exactly the same path. Every call returns
// { ok, error?, id? }. Owners implement the functions named in the build brief.
import * as islands from './islands.js';
import * as links from './links.js';
import * as research from './research.js';
import * as fleet from './fleet.js';
import * as trade from './trade.js';
import * as chart from './chart.js';
import * as defence from './defence.js';
import * as goals from './goals.js';
import { setSpeed } from './index.js';

const wrap = (fn) => (...a) => {
  try { const r = fn(...a); return r && typeof r === 'object' && 'ok' in r ? r : { ok: !!r, ...(r && typeof r === 'object' ? r : {}) }; }
  catch (e) { console.error(e); return { ok: false, error: String(e && e.message || e) }; }
};

export function makeActions(getG) {
  const G = () => getG();
  const a = {
    canBuild: (type, island, u, v) => islands.canBuild(G(), type, island, u, v),
    spots: (type, island) => islands.spots(G(), type, island),
    build: (type, island, u, v) => islands.build(G(), type, island, u, v),
    demolish: (id) => islands.demolish(G(), id),
    upgrade: (id) => islands.upgrade(G(), id),
    repair: (id) => islands.repair(G(), id),
    toggle: (id, on) => islands.toggle(G(), id, on),
    staff: (id, n) => islands.staff(G(), id, n),
    canLink: (kind, x, y) => links.canLink(G(), kind, x, y),
    linkSpots: (kind) => links.linkSpots(G(), kind),
    link: (kind, x, y) => links.link(G(), kind, x, y),
    unlink: (id) => links.unlink(G(), id),
    research: (id) => research.startResearch(G(), id),
    cancelResearch: () => research.cancelResearch(G()),
    ship: (kind, mooringId) => fleet.buildShip(G(), kind, mooringId),
    scrapShip: (id) => fleet.scrapShip(G(), id),
    route: (o) => trade.createRoute(G(), o),
    editRoute: (id, patch) => trade.editRoute(G(), id, patch),
    deleteRoute: (id) => trade.deleteRoute(G(), id),
    contract: (id) => trade.acceptContract(G(), id),
    sell: (res, n) => trade.quickSell(G(), res, n),
    expedition: (target, kind = 'scout') => chart.expedition(G(), target, kind),
    claim: (id) => chart.claim(G(), id),
    drift: (id, dx, dy) => chart.drift(G(), id, dx, dy),
    defend: (action, target) => defence.defend(G(), action, target),
    choose: (i) => goals.choose(G(), i),
    speed: (n) => setSpeed(G(), n),
  };
  // spots/linkSpots/canBuild/canLink return data, not action results
  const raw = new Set(['spots', 'linkSpots']);
  for (const k of Object.keys(a)) if (!raw.has(k)) a[k] = wrap(a[k]);
  return a;
}
