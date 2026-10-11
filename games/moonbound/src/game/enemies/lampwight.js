// Lampwight: a hooded wraith with soul lanterns. Keeps away, flings fans of
// soul orbs, and calls a pyre of soul fire under Maelis (a circle that fills).
import { Foe } from './base.js';
import { rng } from '../../config.js';
import { BURST, GROUND } from '../../fx/fx.js';

const ORBS = {
  anim: 'lampwight_cast',
  strikeFrame: 6,
  windup: 0.8,
  recover: 0.5,
  cooldown: 2.0,
  track: 0.9,
  sfx: 'telegraph',
  fire(w, e) {
    const n = e.elite ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = e.facing + (i - (n - 1) / 2) * 0.28;
      w.shoot('orb', e.x + Math.cos(a) * 0.7, e.y + Math.sin(a) * 0.7, a, 6.2, Math.round(7 * e.dmgMul), 14, 0.38, 'enemy', e.name);
    }
    w.audio.play('orb_fire', { x: e.x, y: e.y });
  },
};

const PYRE = {
  anim: 'lampwight_pyre',
  strikeFrame: 7,
  windup: 1.15,
  recover: 0.4,
  cooldown: 2.4,
  telegraph: { shape: 'circle', range: 1.9 },
  damage: 11,
  knock: 5,
  sfx: 'telegraph',
  fire(w, e, a) {
    const at = a.opts.at;
    w.fx.burst(BURST.embers, at.x, at.y, 0.1, [0.4, 1.3, 1.2, 1], 24, 2.2);
    w.fx.burst(BURST.sparks, at.x, at.y, 0.3, [0.5, 1.4, 1.3, 1], 18, 1.1);
    w.fx.glow(4, at.x, at.y, 0, 1.25, [0.25, 0.85, 0.85, 1], 0.5, { grow: 0.3 });
    w.fx.ground(GROUND.shock, at.x, at.y, 2.2, 2.2, [0.4, 1.2, 1.1, 1], 0.4);
    w.fx.light(at.x, at.y, 1, 5, [0.5, 1.6, 1.5], 0.4);
    w.audio.play('pyre_burst', { x: at.x, y: at.y });
    w.fx.shake(0.15);
  },
};

export const LAMPWIGHT = {
  id: 'lampwight',
  name: 'Lampwight',
  blurb: 'Lamplighters of the dead, carrying souls in cages of iron to light a road that no longer goes anywhere.',
  hp: 75,
  r: 0.45,
  h: 2.2,
  hover: 0.1,
  bob: 0.05,
  mass: 1.1,
  speed: 2.0,
  flying: true,
  hitSound: 'hit_spirit',
  deathSound: 'shatter_spirit',
  anims: { idle: 'lampwight_idle', move: 'lampwight_drift', hit: 'lampwight_hit', death: 'lampwight_death' },
  deathTime: 0.8,
  silver: 4,
  threat: 1.6,
  soul: [0.45, 1.3, 1.2, 1],
};

export class Lampwight extends Foe {
  think(dt, k) {
    const w = this.world;
    const h = w.hero;
    const d = this.distHero();
    if (this.cool <= 0 && d < 12) {
      if (rng.next() < 0.45 && d < 9) return this.startAct(PYRE, { at: w.clampToFloor(h.x, h.y, h.x, h.y) });
      if (w.clearLine(this.x, this.y, h.x, h.y)) return this.startAct(ORBS);
    }
    const want = d < 5 ? -1 : d > 8 ? 1 : 0;
    const a = this.angleHero();
    if (want) this.walk(this.x + Math.cos(a) * want * 3, this.y + Math.sin(a) * want * 3, this.speed * k, dt, false);
    else this.walk(this.x - Math.sin(a) * this.strafe * 2, this.y + Math.cos(a) * this.strafe * 2, this.speed * 0.6 * k, dt, false);
    this.turnTo(a, 4, dt);
  }
  lights(p, x, y) {
    // the lanterns
    const fl = 0.85 + 0.15 * Math.sin(this.world.time * 13 + this.seed);
    const c = this.state === 'dead' ? 1 - this.dissolve : 1;
    p.light(x, y + 0.2, 1.3, 4.5, 0.35 * fl * c, 1.25 * fl * c, 1.2 * fl * c);
  }
}
