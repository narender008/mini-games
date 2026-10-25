// Research (PROGRESSION). One project at a time plus a queue. Costs (insight from
// the colony, goods from the home network) are paid when a project begins; the
// time it takes shrinks with the scholars working at academies.
//   G.research = { current, progress 0..1, done:[ids], queue:[ids], stall: null|'scholars'|'cost' }
//   G.tmp.researchProgress 0..1, G.tmp.research = { scholars, speed, eta, stall, missing }
//   G.tmp.bonus = { key: fraction } summed over finished research (read via bonus())
// Exports for other modules: bonus(G, key), has(G, id), isUnlocked(G, thing),
// costOf(id), timeOf(id), eta(G, id), plus the action API and the unlock cheat.
import { RESEARCH } from '../content/research.js';
import { CFG } from '../config.js';
import { every, pay, gain, missing, homeRoot, notify, builtOf, bump } from './ledger.js';

const C = () => CFG.progression.research;
export const BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));
// thing -> [research ids that unlock it]
const UNLOCKERS = {};
for (const r of RESEARCH) for (const u of r.unlocks) (UNLOCKERS[u] = UNLOCKERS[u] || []).push(r.id);

export function costOf(id) {
  const r = BY_ID[id]; if (!r) return {};
  const out = {};
  for (const [k, v] of Object.entries(r.cost)) out[k] = k === 'insight' ? Math.round(v * C().costScale) : v;
  return out;
}
export const timeOf = (id) => (BY_ID[id] ? BY_ID[id].time * C().timeScale : 0);

export function scholars(G) {
  let n = 0;
  for (const b of builtOf(G, 'academy')) if (b.on !== false) n += b.workers || 0;
  return n;
}

export function speedFor(G, n = scholars(G)) {
  if (n <= 0) return 0;
  const c = C();
  return Math.max(c.minSpeed, Math.pow(n / c.refScholars, c.scholarExp)) * (1 + bonus(G, 'researchSpeed'));
}

// Game seconds left on `id` (the current project, or a fresh one) at today's speed.
export function eta(G, id = G.research.current) {
  if (!id) return 0;
  const sp = speedFor(G);
  const left = (id === G.research.current ? 1 - G.research.progress : 1) * timeOf(id);
  return sp > 0 ? left / sp : Infinity;
}

export const has = (G, id) => G.research.done.includes(id);

// A building id, 'link:cable', 'ship:<kind>', 'ability:<id>' or 'feature:<id>'.
export function isUnlocked(G, thing) {
  const by = UNLOCKERS[thing];
  if (!by) return true;
  return by.some((id) => G.research.done.includes(id));
}

export function bonus(G, key) {
  if (!G.tmp.bonus) recompute(G);
  return G.tmp.bonus[key] || 0;
}

function recompute(G) {
  const b = {};
  for (const id of G.research.done) {
    const r = BY_ID[id]; if (!r) continue;
    for (const [k, v] of Object.entries(r.bonus || {})) b[k] = (b[k] || 0) + v;
  }
  G.tmp.bonus = b;
}

export function available(G) {
  const R = G.research;
  return RESEARCH.filter((r) => !R.done.includes(r.id) && R.current !== r.id && !R.queue.includes(r.id) && r.needs.every((n) => R.done.includes(n))).map((r) => r.id);
}

// Would its needs be met once the current project and the queue finish?
function needsPlanned(G, r) {
  const R = G.research;
  return r.needs.every((n) => R.done.includes(n) || R.current === n || R.queue.includes(n));
}

export function init(G) {
  G.research = { current: null, progress: 0, done: [], queue: [], stall: null };
}

export function hydrate(G) {
  const R = G.research;
  R.done = R.done || []; R.queue = R.queue || []; R.progress = R.progress || 0;
  if (R.stall === undefined) R.stall = null;
  recompute(G);
  G.tmp.researchProgress = R.current ? R.progress : 0;
  G.tmp.research = { scholars: scholars(G), speed: speedFor(G), eta: eta(G), stall: R.stall, missing: [] };
}

function begin(G, id) {
  const cost = costOf(id);
  if (!pay(G, cost, homeRoot(G))) return false;
  G.research.current = id;
  G.research.progress = 0;
  G.research.stall = null;
  G.bus.emit('research:start', { id });
  return true;
}

export function startResearch(G, id) {
  if (!G) return { ok: false, error: 'No colony' };
  const r = BY_ID[id];
  if (!r) return { ok: false, error: `Unknown research ${id}` };
  const R = G.research;
  if (R.done.includes(id)) return { ok: false, error: `${r.name} is already known` };
  if (R.current === id) return { ok: false, error: `Already studying ${r.name}` };
  if (R.queue.includes(id)) {
    // pressing Begin on a queued project moves it to the front of the queue
    R.queue.splice(R.queue.indexOf(id), 1); R.queue.unshift(id);
    return { ok: true, queued: true, id };
  }
  const ready = r.needs.every((n) => R.done.includes(n));
  if (!R.current) {
    if (!ready) return { ok: false, error: `${r.name} needs ${r.needs.filter((n) => !R.done.includes(n)).map((n) => BY_ID[n].name).join(' and ')} first` };
    const miss = missing(G, costOf(id), homeRoot(G));
    if (miss.length) return { ok: false, error: `Not enough ${miss.map((m) => m.res).join(', ')}`, missing: miss };
    begin(G, id);
    G.tmp.researchProgress = 0;
    return { ok: true, id };
  }
  if (!needsPlanned(G, r)) return { ok: false, error: `${r.name} needs ${r.needs.filter((n) => !R.done.includes(n)).map((n) => BY_ID[n].name).join(' and ')} first` };
  if (R.queue.length >= C().queueMax) return { ok: false, error: 'The research queue is full' };
  R.queue.push(id);
  return { ok: true, queued: true, id };
}

// Cancel the current project (costs refunded) or, with an id, take it off the queue.
export function cancelResearch(G, id = null) {
  const R = G.research;
  if (id && R.queue.includes(id)) {
    R.queue.splice(R.queue.indexOf(id), 1);
    dropOrphans(G);
    return { ok: true };
  }
  if (!R.current) {
    if (R.queue.length) { R.queue = []; return { ok: true }; }
    return { ok: false, error: 'Nothing is being studied' };
  }
  const was = R.current;
  const k = C().refund;
  for (const [res, n] of Object.entries(costOf(was))) gain(G, res, Math.floor(n * k), homeRoot(G));
  R.current = null; R.progress = 0; R.stall = null;
  dropOrphans(G);
  G.tmp.researchProgress = 0;
  G.bus.emit('research:cancel', { id: was });
  return { ok: true, id: was };
}

// Remove queued projects whose needs can no longer be met.
function dropOrphans(G) {
  const R = G.research;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < R.queue.length; i++) {
      const r = BY_ID[R.queue[i]];
      const ok = r.needs.every((n) => R.done.includes(n) || R.current === n || R.queue.slice(0, i).includes(n));
      if (!ok) { R.queue.splice(i, 1); changed = true; break; }
    }
  }
}

function complete(G, id, quiet = false) {
  const R = G.research;
  if (!R.done.includes(id)) R.done.push(id);
  if (R.current === id) { R.current = null; R.progress = 0; }
  const qi = R.queue.indexOf(id); if (qi >= 0) R.queue.splice(qi, 1);
  recompute(G);
  bump(G, 'research');
  G.bus.emit('research:done', { id });
  if (!quiet) notify(G, `Research complete: ${BY_ID[id].name}`, 'good', BY_ID[id].icon);
}

// Work happens once a game second (keyed to G.t, which is saved, so a reloaded
// colony advances on the same ticks); the bar in G.tmp.researchProgress is smooth.
export function step(G, dt) {
  const R = G.research;
  const T = G.tmp;
  const tr = T.research || (T.research = { scholars: 0, speed: 0, eta: 0, stall: null, missing: [] });
  if (every(G, 1, dt)) {
    const sch = scholars(G);
    const sp = speedFor(G, sch);
    if (!R.current && R.queue.length) {
      // begin the next queued project when it can be paid
      const next = R.queue[0];
      const r = BY_ID[next];
      if (!r || R.done.includes(next)) R.queue.shift();
      else if (r.needs.every((n) => R.done.includes(n))) {
        if (begin(G, next)) R.queue.shift();
        else R.stall = 'cost';
      }
    }
    if (R.current) {
      if (sp <= 0) R.stall = 'scholars';
      else {
        if (R.stall) R.stall = null;
        R.progress += sp / Math.max(1, timeOf(R.current));
        if (R.progress >= 1) complete(G, R.current);
      }
    }
    tr.scholars = sch; tr.speed = sp; tr.eta = eta(G); tr.stall = R.stall;
    tr.missing = R.stall === 'cost' && R.queue[0] ? missing(G, costOf(R.queue[0]), homeRoot(G)) : [];
  }
  const frac = G.t - Math.floor(G.t + 1e-9);
  T.researchProgress = R.current ? Math.min(1, R.progress + (tr.speed || 0) * frac / Math.max(1, timeOf(R.current))) : 0;
}

// Cheat/test hook: unlock one project (with its prerequisites) or 'all'.
export function unlock(G, id = 'all') {
  if (!G) return { ok: false, error: 'No colony' };
  if (id === 'all') {
    for (const r of RESEARCH) if (!G.research.done.includes(r.id)) complete(G, r.id, true);
    G.research.current = null; G.research.progress = 0; G.research.queue = [];
    G.tmp.researchProgress = 0;
    return { ok: true };
  }
  const r = BY_ID[id];
  if (!r) return { ok: false, error: `Unknown research ${id}` };
  for (const n of r.needs) unlock(G, n);
  if (!G.research.done.includes(id)) complete(G, id, true);
  return { ok: true };
}
