// Needlecaster and Drowned Chorister: float at range, strafe, cast; a
// Needlecaster blinks away when Iri gets close (Choristers back off instead).
import { run, goTo, heroDist, heroAng, turn, rnd, inside, setState, emit, tg, clearTgs } from './brain.js';
import { ATTACK_FNS } from './attacks.js';
import { list, pickFrom } from './pick.js';

const M = {
  init(G, e) { e.cd = rnd(G).range(0.9, 2.0); e.blinkCd = 1.5; },
  update(G, e, dt) { e.blinkCd = Math.max(0, e.blinkCd - dt); run(G, e, dt, M, ATTACK_FNS); },
  move(G, e, dt) {
    const h = G.hero, d = heroDist(G, e), keep = e.def.keep || 300;
    if (e.def.blink && d < 150 && e.blinkCd <= 0) { M.startBlink(G, e); return; }
    const a = Math.atan2(e.y - h.y, e.x - h.x) + e.flank * 0.9 * dt * 1.4;
    const r = d < keep - 40 ? keep + 60 : d > keep + 80 ? keep - 20 : keep;
    let tx = h.x + Math.cos(a) * r, ty = h.y + Math.sin(a) * r;
    if (!inside(G, tx, ty, 40)) { e.flank = -e.flank; tx = (tx + h.x) / 2; ty = (ty + h.y) / 2; }
    goTo(G, e, tx, ty, e.speed, dt, 5);
    turn(e, heroAng(G, e), 5, dt);
    if (rnd(G)() < dt * 0.3) e.flank = -e.flank;
  },
  choose(G, e) {
    const ids = list(e);
    if (e.elite && rnd(G).chance(0.35)) { const t = pickFrom(G, e, ids.slice(1)); if (t) return t; }
    return pickFrom(G, e, ids.slice(0, 1));
  },
  startBlink(G, e) {
    // pick a spot 220-320 px away from the hero, inside the room
    const h = G.hero; let best = null;
    for (let i = 0; i < 8; i++) {
      const a = rnd(G).range(0, Math.PI * 2), r = rnd(G).range(240, 330);
      const x = h.x + Math.cos(a) * r, y = h.y + Math.sin(a) * r;
      if (inside(G, x, y, 40)) { best = [x, y]; break; }
    }
    if (!best) { e.blinkCd = 0.8; return; }
    e.blinkTo = best; e.blinkFrom = [e.x, e.y]; e.blinkCd = e.elite ? 2.2 : 3.2;
    setState(e, 'blink', 0.42);
    tg(G, e, { kind: 'circle', x: best[0], y: best[1], r: 34, t: 0.42, color: '#8a6cff', spawn: true });
    emit(G, 'foeBlink', { e, x: best[0], y: best[1] });
  },
  blink(G, e, dt) {
    e.vx = e.vy = 0;
    e.untargetable = e.st > 0.12 && e.st < 0.3;
    if (e.st >= 0.21 && e.blinkTo) { e.x = e.blinkTo[0]; e.y = e.blinkTo[1]; e.blinkTo = null; }
    if (e.st >= e.stDur) { e.untargetable = false; clearTgs(e); setState(e, 'move'); e.cd = Math.min(e.cd, 0.4); }
  },
};
export default M;
