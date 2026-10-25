// Offline catch-up: when a colony loads after time away, run the sim forward
// headlessly so the settlers kept working while the player was gone.
//
// Rules (CFG.save.catchup):
//   - only when away longer than minAway real seconds; at most maxAway counts
//   - game time simulated = counted away time x rate (a reduced rate)
//   - G.tmp.quiet = true for the whole run: THREATS schedules no raids and no
//     storms while it is set. If one starts anyway, catch-up stops right there
//     so the player meets it with the game open.
//   - a choice card (G.event) also stops it, so the player makes the choice
//   - the work is capped by budgetMs of real time so loading stays snappy
// The run uses its own private bus, so render, audio and UI hear nothing.
import { restore, snapshot } from '../state.js';
import { hydrateSim, tick } from '../sim/index.js';
import { CFG, DT } from '../config.js';

const clock = () => (globalThis.performance?.now ? performance.now() : Date.now());

function totals(G) {
  const res = {};
  for (const p of Object.values(G.pools || {})) {
    for (const [r, n] of Object.entries(p?.res || {})) if (Number.isFinite(n)) res[r] = (res[r] || 0) + n;
  }
  res.coin = (G.colony.coin ?? res.coin ?? 0);
  res.insight = (G.colony.insight ?? res.insight ?? 0);
  return res;
}

// How much game time a given real absence is worth.
export function catchupSeconds(away, cfg = CFG.save.catchup) {
  if (!(away > cfg.minAway)) return 0;
  return Math.min(away, cfg.maxAway) * cfg.rate;
}

// data: a migrated snapshot. Returns { data, summary } (data unchanged and
// summary null when there is nothing to do).
export function catchUp(data, away, { cfg = CFG.save.catchup, budgetMs = cfg.budgetMs } = {}) {
  const want = catchupSeconds(away, cfg);
  if (want <= 0) return { data, summary: null };
  const G = restore(data);
  hydrateSim(G);
  G.tmp.quiet = true; G.tmp.catchup = true;
  const before = { res: totals(G), pop: G.colony.pop || 0, day: G.day, research: new Set(G.research.done), built: G.buildings.filter((b) => b.state === 'built').length, chapter: G.goals.chapter };
  const raid0 = !!G.raid, storm0 = G.weather?.kind === 'storm';
  const steps = Math.round(want / DT);
  const t0 = clock();
  let i = 0, stop = null;
  for (; i < steps; i++) {
    if ((i & 255) === 0 && clock() - t0 > budgetMs) { stop = 'time'; break; }
    if (G.event) { stop = 'event'; break; }
    tick(G);
    if (!raid0 && G.raid) { stop = 'raid'; break; }
    if (!storm0 && G.weather?.kind === 'storm') { stop = 'storm'; break; }
  }
  delete G.tmp.quiet; delete G.tmp.catchup;
  const after = totals(G);
  const res = {};
  for (const k of new Set([...Object.keys(before.res), ...Object.keys(after)])) {
    const d = Math.round((after[k] || 0) - (before.res[k] || 0));
    if (d) res[k] = d;
  }
  const summary = {
    away: Math.round(away), counted: Math.min(away, cfg.maxAway), simulated: Math.round(i * DT), wanted: Math.round(want),
    complete: i >= steps, stoppedBy: stop, ms: Math.round(clock() - t0),
    days: G.day - before.day, pop: Math.round((G.colony.pop || 0) - before.pop), res,
    built: G.buildings.filter((b) => b.state === 'built').length - before.built,
    research: G.research.done.filter((id) => !before.research.has(id)),
    chapter: G.goals.chapter !== before.chapter ? G.goals.chapter : null,
  };
  return { data: i > 0 ? snapshot(G) : data, summary };
}
