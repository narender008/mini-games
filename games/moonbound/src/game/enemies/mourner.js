// Mourner: a weeping wraith. Drifts close, rears back, then streaks straight
// through Maelis along a line; it passes through walls of the living but not
// of stone. Spectral: arrows of hers pass through it while it streaks.
import { Foe } from './base.js';
import { hurtHero } from '../combat.js';

const LUNGE = {
  anim: 'mourner_lunge',
  strikeFrame: 3,
  windup: 0.7,
  recover: 0.55,
  cooldown: 1.6,
  telegraph: { shape: 'line', range: 6.5, width: 1.1 },
  damage: 0,
  track: 0.6,
  trackRate: 3,
  armour: true,
  sfx: 'wail',
  fire(w, e, a) {
    a.hitHero = false;
    w.audio.play('dash', { x: e.x, y: e.y, rate: 0.6 });
  },
  during(w, e, a, dt) {
    if (!a.fired) return;
    const k = a.t - a.def.windup;
    if (k < 0.4) {
      const v = 6.5 / 0.4;
      const out = w.tmp;
      w.room.resolve(e.x + Math.cos(e.facing) * v * dt, e.y + Math.sin(e.facing) * v * dt, e.r, out, true);
      e.x = out.x;
      e.y = out.y;
      const h = w.hero;
      if (!a.hitHero && Math.hypot(h.x - e.x, h.y - e.y) < e.r + h.r + 0.25) {
        a.hitHero = hurtHero(w, Math.round(9 * e.dmgMul), { x: e.x, y: e.y, by: e.name }) || true;
      }
      if (Math.floor((k - dt) / 0.04) !== Math.floor(k / 0.04)) e.ghost();
    }
  },
};

export const MOURNER = {
  id: 'mourner',
  name: 'Mourner',
  blurb: 'Those who died waiting for someone to come home. They are still waiting, and they do not like to be disturbed.',
  hp: 50,
  r: 0.4,
  h: 1.8,
  hover: 0.3,
  bob: 0.08,
  mass: 0.7,
  speed: 3.8,
  flying: true,
  hitSound: 'hit_spirit',
  deathSound: 'shatter_spirit',
  anims: { idle: 'mourner_idle', move: 'mourner_drift', hit: 'mourner_hit', death: 'mourner_death' },
  deathTime: 0.66,
  silver: 2,
  threat: 1.1,
  soul: [0.6, 0.9, 1.4, 1],
};

export class Mourner extends Foe {
  constructor(...a) {
    super(...a);
    this.ghosts = [];
  }
  ghost() {
    this.ghosts.push({ x: this.x, y: this.y, t: 0, angle: this.facing });
  }
  update(dt) {
    super.update(dt);
    for (let i = this.ghosts.length - 1; i >= 0; i--) if ((this.ghosts[i].t += dt) > 0.3) this.ghosts.splice(i, 1);
  }
  think(dt, k) {
    const h = this.world.hero;
    const d = this.distHero();
    if (this.cool <= 0 && d < 5.5 && d > 1.5) return this.startAct(LUNGE);
    // circle at a hovering distance
    const a = this.angleHero() + Math.PI + this.strafe * 0.9;
    const r = 3.5;
    this.walk(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, this.speed * k, dt, false);
    this.turnTo(this.angleHero(), 5, dt);
  }
  draw(p, alpha) {
    super.draw(p, alpha);
    for (const g of this.ghosts) {
      const pz = p.pose('mourner_lunge', g.angle, 4);
      if (!pz?.f) continue;
      const o = p.opt();
      o.tr = 0.5;
      o.tg = 0.8;
      o.tb = 1.2;
      o.ta = -0.5 * (1 - g.t / 0.3);
      p.sprite(pz.f, pz.flip, g.x, g.y, this.z, o);
    }
  }
}
