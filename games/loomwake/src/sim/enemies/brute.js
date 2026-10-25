// Loomhulk and Bellows Brute: mini-boss brutes. Lumber in; slam when close,
// charge (Loomhulk) or breathe fire (Bellows) from range; enrage at half HP.
import { run, goTo, heroDist, heroAng, turn, rnd } from './brain.js';
import { ATTACK_FNS } from './attacks.js';
import { list, pickFrom } from './pick.js';

const M = {
  init(G, e) { e.cd = rnd(G).range(1.0, 1.8); },
  update(G, e, dt) { run(G, e, dt, M, ATTACK_FNS); },
  move(G, e, dt) {
    const h = G.hero;
    goTo(G, e, h.x, h.y, e.speed * (heroDist(G, e) < 200 ? 0.6 : 1), dt, 3);
    turn(e, heroAng(G, e), 1.6, dt);
  },
  choose(G, e) {
    const ids = list(e), d = heroDist(G, e);
    const w = { groundSlam: d < 200 ? 3 : 0.4, quake: 0.8, charge: d > 300 ? 2 : 0.3, fireBreath: 2, fireSweep: 1 };
    return pickFrom(G, e, ids, w);
  },
};
export default M;
