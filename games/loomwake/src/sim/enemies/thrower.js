// Forge Thrall: keeps its distance and lobs molten hammers that leave hot
// floor; swings the hammer if Iri closes in.
import { run, goTo, heroDist, heroAng, turn, rnd, inside } from './brain.js';
import { ATTACK_FNS } from './attacks.js';
import { list, pickFrom } from './pick.js';

const M = {
  init(G, e) { e.cd = rnd(G).range(0.8, 1.8); },
  update(G, e, dt) { run(G, e, dt, M, ATTACK_FNS); },
  move(G, e, dt) {
    const h = G.hero, d = heroDist(G, e), keep = e.def.keep || 260;
    const a = Math.atan2(e.y - h.y, e.x - h.x) + e.flank * dt * 0.8;
    const r = d < keep - 60 ? keep + 40 : keep;
    let tx = h.x + Math.cos(a) * r, ty = h.y + Math.sin(a) * r;
    if (!inside(G, tx, ty, 40)) { e.flank = -e.flank; tx = (tx + e.x) / 2; ty = (ty + e.y) / 2; }
    goTo(G, e, tx, ty, e.speed, dt, 5);
    turn(e, heroAng(G, e), 4, dt);
  },
  choose(G, e) {
    const ids = list(e);
    if (heroDist(G, e) < 120) return pickFrom(G, e, ['hammerSwing']);
    if (e.elite && rnd(G).chance(0.4)) { const t = pickFrom(G, e, ['tripleLob']); if (t) return t; }
    return pickFrom(G, e, ['hammerLob']);
  },
};
export default M;
