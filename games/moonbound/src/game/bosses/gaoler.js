// The Bone Gaoler, the Gloamwall's mini-boss: a hulking jailer of fused bone
// with souls caged in its ribs. Slams both fists (a circle in front of it;
// in its second phase a shockwave ring follows), sweeps its chain around
// itself (a 300-degree arc), and charges headlong (a long line); a charge
// that ends in a wall leaves it stunned and open. At half health it roars,
// freeing the caged souls as Thralls and Skitterskulls.
import { Foe, summonFx } from '../enemies/base.js';
import { rng } from '../../config.js';
import { hurtHero } from '../combat.js';
import { BURST, GROUND } from '../../fx/fx.js';

const SLAM = {
  anim: 'gaoler_slam',
  strikeFrame: 7,
  windup: 1.0,
  recover: 0.7,
  cooldown: 1.0,
  damage: 18,
  knock: 9,
  track: 0.5,
  trackRate: 2,
  armour: true,
  sfx: 'telegraph',
  fire(w, e, a) {
    const at = a.hazard;
    w.fx.burst(BURST.dust, at.x, at.y, 0.1, [0.55, 0.5, 0.48, 0.9], 24, 2.2);
    w.fx.burst(BURST.sparks, at.x, at.y, 0.2, [1.2, 0.9, 0.6, 1], 16, 1.3);
    w.fx.ground(GROUND.shock, at.x, at.y, 3.2, 3.2, [0.9, 0.8, 0.7, 1], 0.45);
    w.audio.play('slam', { x: at.x, y: at.y });
    w.fx.shake(0.5);
    w.decal(at.x, at.y, 1.6, 2);
    if (e.phase >= 2) {
      w.hazard({ owner: e, seq: a.seq, shape: 'ring', x: at.x, y: at.y, angle: 0, range: 5, inner: 2.4, windup: 0.4, damage: Math.round(10 * e.dmgMul), knock: 6, by: e.name, boss: true });
    }
  },
};

const SWEEP = {
  anim: 'gaoler_sweep',
  strikeFrame: 6,
  windup: 0.8,
  recover: 0.6,
  cooldown: 1.1,
  telegraph: { shape: 'arc', range: 3.8, half: 2.62 },
  damage: 14,
  knock: 10,
  track: 0.4,
  armour: true,
  sfx: 'telegraph',
  fire(w, e) {
    w.audio.play('chain_sweep', { x: e.x, y: e.y });
    w.fx.arc(e.x, e.y, 1.0, 3.2, e.facing + 2.6, -5.2, 1.1, [0.7, 0.65, 0.6, 0.8], 0.3);
  },
};

const CHARGE = {
  anim: 'gaoler_charge',
  strikeFrame: 1,
  windup: 0.95,
  recover: 1.0,
  cooldown: 1.2,
  telegraph: { shape: 'line', range: 11, width: 2.2 },
  damage: 0,
  track: 0.75,
  trackRate: 2,
  armour: true,
  sfx: 'boss_charge',
  fire(w, e, a) {
    a.hitHero = false;
    w.audio.loop('charge', 'charge', true, { x: e.x, y: e.y });
  },
  during(w, e, a, dt) {
    if (!a.fired) return;
    const k = a.t - a.def.windup;
    if (k < 0.85) {
      const v = 11 / 0.85;
      const out = w.tmp;
      const blocked = w.room.resolve(e.x + Math.cos(e.facing) * v * dt, e.y + Math.sin(e.facing) * v * dt, e.r, out);
      e.x = out.x;
      e.y = out.y;
      const h = w.hero;
      if (!a.hitHero && Math.hypot(h.x - e.x, h.y - e.y) < e.r + h.r + 0.2) a.hitHero = hurtHero(w, Math.round(20 * e.dmgMul), { x: e.x, y: e.y, knock: 12, by: e.name }) || true;
      if (Math.floor((k - dt) / 0.06) !== Math.floor(k / 0.06)) {
        w.fx.burst(BURST.dust, e.x, e.y, 0.05, [0.5, 0.48, 0.45, 0.8], 8, 1.2);
        w.fx.shake(0.06);
      }
      if (blocked && k > 0.1) {
        a.t = a.def.windup + 0.9;
        e.stun = 1.6;
        w.audio.loop('charge', 'charge', false);
        w.audio.play('slam', { x: e.x, y: e.y, rate: 0.8 });
        w.fx.shake(0.6);
        w.fx.burst(BURST.dust, e.x, e.y, 1, [0.55, 0.5, 0.48, 0.9], 24, 2);
        w.fx.number(e.x, e.y, e.h + 0.5, '!', [1.5, 1.1, 0.35], 1);
      }
    } else w.audio.loop('charge', 'charge', false);
  },
};

const ROAR = {
  anim: 'gaoler_roar',
  strikeFrame: 4,
  windup: 0.45,
  recover: 0.9,
  cooldown: 0.8,
  armour: true,
  fire(w, e) {
    w.audio.play('roar', { x: e.x, y: e.y });
    w.audio.phase(2);
    w.fx.shake(0.7);
    w.fx.ground(GROUND.shock, e.x, e.y, 6, 6, [0.5, 1.3, 1.2, 1], 0.6);
    w.fx.burst(BURST.wisps, e.x, e.y, 1.6, [0.45, 1.3, 1.2, 1], 24, 2);
    const h = w.hero;
    if (Math.hypot(h.x - e.x, h.y - e.y) < 4.5) h.knockFrom(e.x, e.y, 12);
    // the caged souls break free
    const kinds = ['thrall', 'thrall', 'skitter', 'skitter', 'skitter'];
    for (let i = 0; i < kinds.length; i++) {
      const p = w.room.randomFloor(rng, e.x, e.y, 3.5);
      summonFx(w, p.x, p.y);
      w.addFoe(kinds[i], p.x, p.y);
    }
  },
};

export const GAOLER = {
  id: 'gaoler',
  name: 'The Bone Gaoler',
  title: 'Jailer of the Wall',
  blurb: 'It was built, not born: the legion fused the bones of deserters into a warden for the rest. It keeps the souls it catches in its ribs.',
  boss: true,
  hp: 950,
  r: 1.1,
  h: 3.0,
  drawScale: 1.15,
  mass: 6,
  speed: 2.6,
  big: 2.2,
  set: 'gaoler',
  anims: { idle: 'gaoler_idle', move: 'gaoler_walk', hit: 'gaoler_hit', death: 'gaoler_death' },
  deathTime: 1.4,
  deathFps: 10,
  music: 'gaoler',
  threat: 10,
};

export class Gaoler extends Foe {
  constructor(...a) {
    super(...a);
    this.phase = 1;
    this.stun = 0;
    this.spawnTime = 0;
    this.rise();
    this.cool = 1.2;
  }
  get hpFrac() {
    return this.hp / this.maxHp;
  }
  think(dt, k) {
    const w = this.world;
    if (this.stun > 0) {
      this.stun -= dt;
      this.dmgTaken = 1.3;
      return;
    }
    this.dmgTaken = 1;
    if (this.phase === 1 && this.hpFrac <= 0.5) {
      this.phase = 2;
      w.bossPhase(this, 2);
      return this.startAct(ROAR);
    }
    const h = w.hero;
    const d = this.distHero();
    if (this.cool <= 0) {
      if (d < 3.6) return this.startAct(rng.next() < 0.55 ? this.slam() : SWEEP);
      if (d > 5 && rng.next() < (this.phase === 2 ? 0.7 : 0.5)) return this.startAct(CHARGE);
      if (d < 5.5) return this.startAct(this.slam());
    }
    if (d > 2.8) this.walk(h.x, h.y, this.speed * (this.phase === 2 ? 1.2 : 1) * k, dt);
    else this.turnTo(this.angleHero(), 2.5, dt);
  }
  slam() {
    return SLAM;
  }
  startAct(def, opts) {
    super.startAct(def, opts);
    if (def.anim === 'gaoler_slam') {
      const a = this.act;
      const fx = this.x + Math.cos(this.facing) * 2;
      const fy = this.y + Math.sin(this.facing) * 2;
      a.hazard = this.world.hazard({ owner: this, seq: a.seq, shape: 'circle', x: fx, y: fy, angle: this.facing, range: 2.4, windup: def.windup, damage: Math.round(18 * this.dmgMul), knock: 9, by: this.name, boss: true, follow: false });
    }
  }
  runAct(dt) {
    const a = this.act;
    if (a && a.def.anim === 'gaoler_slam' && a.t < a.def.windup * 0.5) {
      // the fists follow her during the early wind-up
      this.turnTo(this.angleHero(), 2, dt);
      a.hazard.x = this.x + Math.cos(this.facing) * 2;
      a.hazard.y = this.y + Math.sin(this.facing) * 2;
    }
    super.runAct(dt);
  }
  cancelAct() {
    this.world.audio.loop('charge', 'charge', false);
    super.cancelAct();
  }
  pose() {
    if (this.stun > 0) return this.P('gaoler_hit', this.specFrame('gaoler_hit', Math.floor(this.stun * 4) % 3, 3));
    if (this.state === 'act' && this.act?.def === CHARGE && this.act.fired) return this.P('gaoler_charge', -1);
    return super.pose();
  }
  lights(p, x, y) {
    const c = this.state === 'dead' ? 1 - this.dissolve : 1;
    const pulse = 0.8 + 0.2 * Math.sin(this.world.time * 3);
    p.light(x, y + 0.3, 1.8, 5, 0.3 * c * pulse, 1.2 * c * pulse, 1.1 * c * pulse);
  }
}
