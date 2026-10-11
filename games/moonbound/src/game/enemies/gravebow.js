// Gravebow: a skeletal archer. Keeps its distance, backs away when Maelis
// closes in, and looses a heavy arrow along a line shown on the ground.
import { Foe } from './base.js';
import { rng } from '../../config.js';

const SHOT = {
  anim: 'gravebow_shoot',
  strikeFrame: 6,
  windup: 0.85,
  recover: 0.45,
  cooldown: 1.9,
  telegraph: { shape: 'line', range: 14, width: 0.5, follow: true },
  damage: 0, // the arrow does the damage
  track: 0.75,
  trackRate: 2.4,
  sfx: 'bow_draw',
  noHit: true,
  fire(w, e, a) {
    w.shoot('arrow', e.x + Math.cos(e.facing) * 0.6, e.y + Math.sin(e.facing) * 0.6, e.facing, 17, Math.round(8 * e.dmgMul), 16, 0.3, 'enemy', e.name);
    w.audio.play('arrow_loose', { x: e.x, y: e.y });
    void a;
  },
};

export const GRAVEBOW = {
  id: 'gravebow',
  name: 'Gravebow',
  blurb: 'Archers of the wall, still keeping watch from the crenels. Their arrows fly true a century on.',
  hp: 42,
  r: 0.38,
  h: 1.8,
  mass: 0.9,
  speed: 3.0,
  anims: { idle: 'gravebow_idle', move: 'gravebow_walk', hit: 'gravebow_hit', death: 'gravebow_death' },
  deathTime: 0.62,
  silver: 3,
  threat: 1.2,
};

export class Gravebow extends Foe {
  think(dt, k) {
    const w = this.world;
    const h = w.hero;
    const d = this.distHero();
    if (!this.spot || (this.spotT -= dt) <= 0) {
      // a place 6-9 m from her with a clear line
      this.spotT = 2 + rng.next() * 1.5;
      const a = this.angleHero() + Math.PI + (rng.next() - 0.5) * 1.6;
      const r = 6.5 + rng.next() * 2.5;
      this.spot = w.clampToFloor(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, this.x, this.y);
    }
    if (this.cool <= 0 && d < 13 && d > 2.5 && w.clearLine(this.x, this.y, h.x, h.y)) return this.startAct(SHOT);
    if (d < 4) {
      // back away
      const a = this.angleHero() + Math.PI;
      this.walk(this.x + Math.cos(a) * 3, this.y + Math.sin(a) * 3, this.speed * 1.1 * k, dt, false);
      this.turnTo(this.angleHero(), 6, dt);
    } else if (Math.hypot(this.spot.x - this.x, this.spot.y - this.y) > 0.6) {
      this.walk(this.spot.x, this.spot.y, this.speed * k, dt);
    } else this.turnTo(this.angleHero(), 5, dt);
  }
}
