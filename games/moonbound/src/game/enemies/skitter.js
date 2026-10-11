// Skitterskull: a skull-faced spider. Comes in swarms, scuttles fast in a
// weaving line, then crouches and leaps at Maelis, landing in a small circle.
import { Foe } from './base.js';
import { rng } from '../../config.js';

const LEAP = {
  anim: 'skitter_leap',
  strikeFrame: 5,
  windup: 0.62, // crouch then flight: the circle fills as it flies
  recover: 0.3,
  cooldown: 1.6,
  telegraph: { shape: 'circle', range: 1.15 },
  damage: 6,
  knock: 4,
  sfx: 'leap',
  during(w, e, a, dt) {
    // fly from the start point to the circle during the wind-up's second half
    const k = (a.t - a.def.windup * 0.35) / (a.def.windup * 0.65);
    if (k > 0 && k <= 1) {
      e.x = a.from.x + (a.opts.at.x - a.from.x) * k;
      e.y = a.from.y + (a.opts.at.y - a.from.y) * k;
      e.z = Math.sin(k * Math.PI) * 1.4;
    } else e.z = 0;
    void dt;
  },
  fire(w, e) {
    e.z = 0;
    w.audio.play('skitter', { x: e.x, y: e.y });
    w.fx.burst(2, e.x, e.y, 0.05, [0.5, 0.48, 0.45, 0.8], 10, 0.7);
  },
};

export const SKITTER = {
  id: 'skitter',
  name: 'Skitterskull',
  blurb: 'Something in the ossuaries learned to walk on the bones of its betters. It hunts in swarms.',
  hp: 20,
  r: 0.32,
  h: 0.6,
  mass: 0.6,
  speed: 5.5,
  anims: { idle: 'skitter_idle', move: 'skitter_scuttle', hit: 'skitter_hit', death: 'skitter_death' },
  deathTime: 0.36,
  deathFps: 14,
  stagger: 0.16,
  silver: 1,
  threat: 0.5,
  big: 0.6,
};

export class Skitter extends Foe {
  think(dt, k) {
    const w = this.world;
    const h = w.hero;
    const d = this.distHero();
    if (this.cool <= 0 && d < 5 && d > 1.2) {
      const at = w.clampToFloor(h.x + h.vx * 0.25, h.y + h.vy * 0.25, this.x, this.y);
      this.startAct(LEAP, { at });
      this.act.from = { x: this.x, y: this.y };
      return;
    }
    // weave in
    const a = this.angleHero() + Math.sin(w.time * 3 + this.seed) * 0.7 * this.strafe;
    this.walk(this.x + Math.cos(a) * 2, this.y + Math.sin(a) * 2, this.speed * k, dt);
    if (d < 0.9) this.contact(3);
    void rng;
  }
  pose() {
    if (this.state === 'act' && this.act) {
      const a = this.act;
      const k = a.t / a.def.windup;
      const i = a.t < a.def.windup ? (k < 0.35 ? Math.floor((k / 0.35) * 2) : 2 + Math.floor(((k - 0.35) / 0.65) * 3)) : 5;
      return this.P('skitter_leap', this.specFrame('skitter_leap', Math.min(5, i), 6));
    }
    return super.pose();
  }
}
