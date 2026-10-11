// Bone Thrall: the legion's footsoldier. Shambles in, raises its falchion
// high (a long, readable wind-up) and cuts a wide cone in front of it.
import { Foe } from './base.js';

const SLASH = {
  anim: 'thrall_attack',
  strikeFrame: 5,
  windup: 0.62,
  recover: 0.42,
  cooldown: 1.3,
  telegraph: { shape: 'arc', range: 2.2, half: 0.87 },
  damage: 9,
  knock: 5,
  track: 0.55,
  lunge: { dist: 0.6, time: 0.12 },
  sfx: 'telegraph',
  fire(w, e) {
    w.audio.play('twins_swing', { x: e.x, y: e.y, rate: 0.6, gain: 0.7 });
  },
};

export const THRALL = {
  id: 'thrall',
  name: 'Bone Thrall',
  blurb: 'The legion that held the Gloamwall still holds it. They have forgotten why, but not how.',
  hp: 60,
  r: 0.4,
  h: 1.75,
  mass: 1,
  speed: 3.2,
  anims: { idle: 'thrall_idle', move: 'thrall_walk', hit: 'thrall_hit', death: 'thrall_death' },
  deathTime: 0.62,
  silver: 2,
  threat: 1,
};

export class Thrall extends Foe {
  think(dt, k) {
    const h = this.world.hero;
    const d = this.distHero();
    if (d < 2.0 && this.cool <= 0) return this.startAct(SLASH);
    if (d > 1.6) this.walk(h.x, h.y, this.speed * k, dt);
    else this.turnTo(this.angleHero(), 6, dt);
  }
}
