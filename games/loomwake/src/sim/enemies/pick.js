// Choosing an attack: the first usable one in priority order, or a weighted
// pick among usable ones. Usable = hero within [min, range] (and an optional
// extra test).
import { ATTACKS } from '../../content/enemies.js';
import { heroDist, heroAng, rnd } from './brain.js';
import { wrapAng } from '../../core/math.js';

export function usable(G, e, id) {
  const A = ATTACKS[id]; if (!A) return false;
  const d = heroDist(G, e);
  return d <= A.range && d >= (A.min || 0);
}
export function behind(G, e) { return Math.abs(wrapAng(heroAng(G, e) - e.facing)) > 1.7; }
export function pickFrom(G, e, ids, weights) {
  const ok = ids.filter((id) => usable(G, e, id));
  if (!ok.length) return null;
  if (!weights) return ok[0];
  return rnd(G).weighted(ok, (id) => weights[id] ?? 1);
}
// elites use their extended list; the trick is picked now and then
export const list = (e) => (e.elite && e.def.eliteAttacks) || e.def.attacks;
