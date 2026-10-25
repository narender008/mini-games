// Thread-Knight, Glass Knight, Lantern Warden: slow, armoured, deliberate.
// They walk straight at Iri, keep their front to her, slam from range and
// sweep if she gets behind them.
import { run, goTo, heroDist, heroAng, turn, rnd, ringPoint } from './brain.js';
import { ATTACK_FNS } from './attacks.js';
import { list, pickFrom, behind, usable } from './pick.js';
import { wrapAng } from '../../core/math.js';

const M = {
  init(G, e) { e.cd = rnd(G).range(0.8, 1.6); },
  update(G, e, dt) { run(G, e, dt, M, ATTACK_FNS); },
  move(G, e, dt) {
    const d = heroDist(G, e);
    const [tx, ty] = d > 230 ? [G.hero.x, G.hero.y] : ringPoint(G, e, 170, dt, 0.2);
    goTo(G, e, tx, ty, e.speed, dt, 4);
    turn(e, heroAng(G, e), 1.8, dt); // heavy: turns slowly, so flanking it pays
  },
  choose(G, e) {
    const ids = list(e);
    if (behind(G, e)) {
      const sweep = ids.find((id) => /Sweep|Swing|Spin/.test(id) && usable(G, e, id));
      if (sweep) return sweep;
    }
    const w = {};
    for (const id of ids) w[id] = /double|shard|Spin/.test(id) ? 0.7 : 1;
    if (Math.abs(wrapAng(heroAng(G, e) - e.facing)) > 1.2 && !behind(G, e)) return null; // finish turning first
    return pickFrom(G, e, ids.filter((id) => id !== 'backSweep'), w);
  },
};
export default M;
