// fixture(v): a valid save envelope of schema version v, for tests of every
// migration step. The current version is a real colony (createGame + initSim
// + a minute and a half of sim); older versions are that colony written back
// in the old shape, so migrate(fixture(v)) must load like fixture(VERSION).
import { createGame, snapshot } from '../state.js';
import { initSim, tick } from '../sim/index.js';
import { DT } from '../config.js';
import { VERSION, checksum, migrationList } from './format.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

export function fixtureData({ seed = 20261025, name = 'Fixture Rock', seconds = 90 } = {}) {
  const G = createGame({ seed, name, difficulty: 'standard' });
  initSim(G);
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) tick(G);
  if (!Number.isFinite(G.colony.coin)) G.colony.coin = 0;
  if (!Number.isFinite(G.colony.insight)) G.colony.insight = 0;
  return snapshot(G);
}

// Write current data back in the v0 shape (inverse of MIGRATIONS[0]).
export function toV0(data) {
  const g = clone(data);
  g.treasury = { coin: g.colony.coin || 0, insight: g.colony.insight || 0 };
  delete g.colony.coin; delete g.colony.insight;
  g.clock = { t: g.t, day: g.day, tod: g.tod };
  delete g.t; delete g.day; delete g.tod;
  g.goals = { ...g.goals, ch: (g.goals.chapter | 0) - 1 };
  delete g.goals.chapter;
  delete g.difficulty;
  delete g.v;
  return g;
}

let cache = null;
export function fixture(v = VERSION, opts = {}) {
  const at = opts.at ?? Date.now();
  const seq = opts.seq ?? 1;
  const play = opts.play ?? 1234;
  if (!cache || opts.fresh) cache = fixtureData(opts);
  const data = clone(cache);
  if (v === VERSION) return { v, seq, sum: checksum(data), at, play, data };
  if (v === 0) { const game = toV0(data); return { v: 0, seq, sum: checksum(game), at, play, game }; }
  throw new Error(`no fixture for v${v} (known: ${[...migrationList, VERSION].join(', ')})`);
}
