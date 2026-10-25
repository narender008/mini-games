// Echo of Iri: a dark copy that fights like Iri. Strafes at mid range,
// dashes through her, and closes for the three-hit combo.
import { run, goTo, heroDist, heroAng, turn, rnd, ringPoint } from './brain.js';
import { ATTACK_FNS } from './attacks.js';
import { list, pickFrom } from './pick.js';

const M = {
  init(G, e) { e.cd = rnd(G).range(0.7, 1.4); e.ring = rnd(G).range(190, 240); },
  update(G, e, dt) { run(G, e, dt, M, ATTACK_FNS); },
  move(G, e, dt) {
    const [tx, ty] = ringPoint(G, e, e.cd < 0.3 ? 110 : e.ring, dt, 1.0);
    goTo(G, e, tx, ty, e.speed * 0.8, dt, 9);
    turn(e, heroAng(G, e), 10, dt);
    if (rnd(G)() < dt * 0.6) e.flank = -e.flank;
  },
  choose(G, e) {
    const d = heroDist(G, e);
    if (d < 120) return pickFrom(G, e, ['echoCombo']);
    if (e.elite && rnd(G).chance(0.45)) { const t = pickFrom(G, e, ['echoChain']); if (t) return t; }
    return pickFrom(G, e, ['echoDash']);
  },
};
export default M;
