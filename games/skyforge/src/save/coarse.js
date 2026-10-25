// Coarse stepping for headless fast-forwards (offline catch-up, presets): the
// same modules in the same order as sim/index.js tick(), with a bigger dt.
// Only used while G.tmp.quiet holds back raids and storms, where nothing needs
// the fine 1/30 s step. Not deterministic against tick(); never used for play.
import { MODULES } from '../sim/index.js';
import { DAY } from '../config.js';

const ORDER = ['weather', 'links', 'economy', 'islands', 'fleet', 'trade', 'chart', 'research', 'raids', 'defence', 'combat', 'goals'];

export function coarseStep(G, dt = 0.5) {
  G.t += dt;
  G.tod += dt / DAY;
  if (G.tod >= 1) { G.tod -= 1; G.day += 1; G.bus.emit('day', { day: G.day }); }
  for (const k of ORDER) MODULES[k].step?.(G, dt);
}
