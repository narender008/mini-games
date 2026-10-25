// Hollow and Thornling: shambling pack hunters. They take a slot on a ring
// around Iri, drift sideways to flank, then step in and lunge.
import { run, ringPoint, goTo, heroDist, heroAng, turn, tg, hurt, rnd, emit, heroInCircle } from './brain.js';
import { ATTACK_FNS } from './attacks.js';
import { list, pickFrom } from './pick.js';
import * as C from '../combat.js';

const M = {
  init(G, e) { e.cd = rnd(G).range(0.6, 1.8); e.ring = rnd(G).range(120, 160); },
  update(G, e, dt) { run(G, e, dt, M, ATTACK_FNS); },
  move(G, e, dt) {
    const d = heroDist(G, e);
    // when our attack is ready, close in; otherwise hold the ring and flank
    const want = e.cd <= 0.3 ? 110 : e.ring;
    const [tx, ty] = ringPoint(G, e, want, dt, d < 260 ? 0.6 : 0.15);
    goTo(G, e, tx, ty, e.speed * (d > 400 ? 1.1 : 0.85), dt, 6);
    turn(e, heroAng(G, e), 6, dt);
    if (rnd(G)() < dt * 0.25) e.flank = -e.flank;
  },
  choose(G, e) {
    const ids = list(e);
    if (e.elite && ids.includes('twinRake') && rnd(G).chance(0.4)) return pickFrom(G, e, ['twinRake', 'clawLunge']);
    return pickFrom(G, e, ['clawLunge']);
  },
  die(G, e) {
    if (e.def.deathBurst === 'thorns') {
      e.mem = { burst: 0 };
      e.mem.t = tg(G, e, { kind: 'circle', x: e.x, y: e.y, r: 105, t: 0.5, color: '#ff4f9a' });
    }
  },
  dying(G, e, dt) {
    if (e.def.deathBurst !== 'thorns' || !e.mem) return;
    const rings = e.elite ? 2 : 1;
    if (e.mem.burst < rings && e.st >= 0.5 + e.mem.burst * 0.35) {
      const k = e.mem.burst++;
      if (k === 0 && heroInCircle(G, e.x, e.y, 105)) hurt(G, e, 1, { kb: 380, kind: 'thorns' });
      const n = 8, a0 = k * 0.39;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2, s = 380;
        const p = { team: 'foe', kind: 'thorn', x: e.x, y: e.y, z: 18, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 8, dmg: Math.round(e.dmg * 0.6), life: 0.75, owner: e.id, color: '#ff8ad0', angle: a };
        if (C.shoot) C.shoot(G, p); else G.projectiles.push(p);
      }
      emit(G, 'foeImpact', { e, x: e.x, y: e.y, r: 105, power: 0.7, kind: 'thorns', color: '#ff8ad0' });
    }
  },
};
export default M;
