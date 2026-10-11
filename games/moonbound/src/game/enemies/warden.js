// Rampart Warden: an armoured spear knight. Its ward (armour) must be broken
// before its body can be hurt; while warded it does not flinch. Thrusts its
// spear along a long line, or lowers its shield and charges.
import { Foe } from './base.js';
import { rng } from '../../config.js';
import { hurtHero } from '../combat.js';

const THRUST = {
  anim: 'warden_thrust',
  strikeFrame: 6,
  windup: 0.75,
  recover: 0.45,
  cooldown: 1.5,
  telegraph: { shape: 'line', range: 3.4, width: 0.9 },
  damage: 13,
  knock: 7,
  track: 0.6,
  lunge: { dist: 0.8, time: 0.1 },
  armour: true,
  sfx: 'telegraph',
  fire(w, e) {
    w.audio.play('spear_thrust', { x: e.x, y: e.y });
  },
};

const CHARGE = {
  anim: 'warden_charge',
  strikeFrame: 1,
  windup: 0.85,
  recover: 0.9,
  cooldown: 2.6,
  telegraph: { shape: 'line', range: 8, width: 1.3 },
  damage: 0,
  track: 0.7,
  trackRate: 2.5,
  armour: true,
  sfx: 'boss_charge',
  fire(w, e, a) {
    a.hitHero = false;
    w.audio.play('shield_bash', { x: e.x, y: e.y, rate: 0.8 });
  },
  during(w, e, a, dt) {
    if (!a.fired) return;
    const k = a.t - a.def.windup;
    if (k < 0.55) {
      const v = 8 / 0.55;
      const out = w.tmp;
      const nx = e.x + Math.cos(e.facing) * v * dt;
      const ny = e.y + Math.sin(e.facing) * v * dt;
      const blocked = w.room.resolve(nx, ny, e.r, out);
      e.x = out.x;
      e.y = out.y;
      const h = w.hero;
      if (!a.hitHero && Math.hypot(h.x - e.x, h.y - e.y) < e.r + h.r + 0.2) a.hitHero = hurtHero(w, Math.round(14 * e.dmgMul), { x: e.x, y: e.y, knock: 9, by: e.name }) || true;
      if (blocked && k > 0.08) {
        // slammed into a wall: stunned for a moment
        a.t = a.def.windup + 0.56;
        e.status.daze = 0.9;
        w.fx.shake(0.2);
        w.audio.play('hit_armor', { x: e.x, y: e.y, rate: 0.6 });
      }
      if (Math.floor((k - dt) / 0.05) !== Math.floor(k / 0.05)) w.fx.burst(2, e.x, e.y, 0.05, [0.5, 0.5, 0.55, 0.7], 6, 0.7);
    }
  },
};

export const WARDEN = {
  id: 'warden',
  name: 'Rampart Warden',
  blurb: 'Knights of the wall in plate gone black with age. Break the ward of their iron before you look for flesh; there is none.',
  hp: 120,
  ward: 90,
  r: 0.5,
  h: 2.0,
  mass: 2,
  speed: 2.3,
  hitSound: 'hit_armor',
  anims: { idle: 'warden_idle', move: 'warden_walk', hit: 'warden_hit', death: 'warden_death' },
  deathTime: 0.85,
  silver: 6,
  threat: 2.2,
};

export class Warden extends Foe {
  think(dt, k) {
    const h = this.world.hero;
    const d = this.distHero();
    if (this.cool <= 0) {
      if (d < 3.0) return this.startAct(THRUST);
      if (d < 9 && d > 4 && rng.next() < 0.5 && this.world.clearLine(this.x, this.y, h.x, h.y)) return this.startAct(CHARGE);
    }
    if (d > 2.4) this.walk(h.x, h.y, this.speed * k, dt);
    else this.turnTo(this.angleHero(), 4, dt);
  }
  pose() {
    if (this.state === 'act' && this.act?.def === CHARGE && this.act.fired) return this.P('warden_charge', -1);
    return super.pose();
  }
  flinch() {
    if (this.ward > 0) return;
    super.flinch();
  }
}
