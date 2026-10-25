// Snarl: a wolf of knotted thread. Circles fast at range, leaps in, bites
// when close, then lopes back out.
import { run, goTo, heroDist, heroAng, turn, rnd, ringPoint } from './brain.js';
import { ATTACK_FNS } from './attacks.js';
import { list, pickFrom } from './pick.js';

const M = {
  init(G, e) { e.cd = rnd(G).range(0.8, 1.8); e.ring = rnd(G).range(240, 300); },
  update(G, e, dt) { run(G, e, dt, M, ATTACK_FNS); },
  move(G, e, dt) {
    const d = heroDist(G, e);
    const rp = ringPoint(G, e, e.ring, dt, 1.1), tx = rp[0], ty = rp[1];
    goTo(G, e, tx, ty, e.speed * (d < 160 ? 1.1 : 0.9), dt, 5);
    // face the way it runs, glancing at Iri
    const sp = Math.hypot(e.vx, e.vy);
    turn(e, sp > 60 ? Math.atan2(e.vy, e.vx) : heroAng(G, e), 7, dt);
    if (rnd(G)() < dt * 0.2) e.flank = -e.flank;
  },
  choose(G, e) {
    const ids = list(e);
    if (heroDist(G, e) < 110) return pickFrom(G, e, ['bite']);
    if (e.elite && rnd(G).chance(0.45)) { const t = pickFrom(G, e, ['doubleLeap']); if (t) return t; }
    return pickFrom(G, e, ids.filter((i) => i !== 'doubleLeap' && i !== 'bite'));
  },
};
export default M;
