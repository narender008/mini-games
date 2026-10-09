// The Ogre Warlord, chapter 1's boss. It stomps down the road, then cycles
// through three attacks, faster and angrier as it is hurt:
//   barrage - roars fans (and later rings) of red fireballs at the hero
//   charge  - marks a lane, locks on and charges down it, trampling its own horde
//   slam    - at the end of a charge it raises both fists and smashes the
//             ground: a marked circle around the impact hurts, then it walks back
// Below 60% health it speeds up; below 30% it is enraged and calls in more dead.
import { ARENA, BAND, clamp, rand, rnd, chance, TAU } from '../config.js';
import { HOT, UNDER, RING, BEAM, GLOW } from '../fx/particles.js';

const HOME_Y = 600;

export class Ogre {
  constructor(run, slot) {
    this.run = run;
    this.i = slot;
    this.state = 'enter';
    this.t = 0;
    this.anim = 0; // frame clock for the current state's animation
    this.lockX = 0;
    this.volleys = 0;
    this.summonT = 6;
    this.name = 'OGRE WARLORD';
    this.roared = false;
    this.lastAttack = '';
  }

  get phase() {
    const E = this.run.enemies;
    const f = E.hp[this.i] / E.maxHp[this.i];
    return f < 0.3 ? 3 : f < 0.6 ? 2 : 1;
  }

  // what to draw: anim prefix and frame index
  pose() {
    switch (this.state) {
      case 'charge_wind':
        return ['ogre_charge', 0];
      case 'charge':
        return ['ogre_charge', 1 + (Math.floor(this.anim * 10) % 3)];
      case 'slam_wind':
        return ['ogre_slam', this.t > 0.35 ? 0 : 1];
      case 'slam':
        return ['ogre_slam', this.t > 0.35 ? 2 : 3];
      case 'barrage':
        return ['ogre_shoot', this.t % 0.55 > 0.3 ? 1 : this.t % 0.55 > 0.15 ? 2 : 0];
      default:
        return ['ogre_walk', Math.floor(this.anim * 5)];
    }
  }

  update(dt) {
    const run = this.run;
    const E = run.enemies;
    const i = this.i;
    if (!E.alive[i]) return;
    const hero = run.hero;
    const ph = this.phase;
    const fast = ph === 1 ? 1 : ph === 2 ? 1.25 : 1.5;
    const frozen = E.frozen[i] > 0;
    const k = frozen ? 0.35 : 1;
    dt *= k;
    this.t -= dt;
    this.anim += dt;
    const x = E.x[i];
    const y = E.y[i];
    E.px[i] = x;
    E.py[i] = y;
    if (E.flash[i] > 0) E.flash[i] = Math.max(0, E.flash[i] - dt * 7);
    if (E.frozen[i] > 0) E.frozen[i] -= dt / k;
    const mouth = run.anchor('mouth', 'ogre', [0, -230]);
    switch (this.state) {
      case 'enter': {
        E.y[i] += 85 * dt;
        if (Math.floor(this.anim * 5) !== Math.floor((this.anim - dt) * 5) && Math.floor(this.anim * 5) % 2 === 0) this.stomp(0.18);
        if (E.y[i] >= HOME_Y) {
          E.y[i] = HOME_Y;
          run.sound.bossRoar();
          run.shake(0.6);
          run.events.banner?.(this.name, 'Smash it!');
          this.state = 'idle';
          this.t = 1.6;
        }
        break;
      }
      case 'idle': {
        const tx = clamp(hero.x, 180, ARENA.w - 180);
        E.x[i] += clamp(tx - x, -1, 1) * Math.min(Math.abs(tx - x), 110 * fast * dt);
        E.y[i] += clamp(HOME_Y - y, -1, 1) * Math.min(Math.abs(HOME_Y - y), 120 * dt);
        if (Math.floor(this.anim * 5) !== Math.floor((this.anim - dt) * 5) && Math.floor(this.anim * 5) % 2 === 0) this.stomp(0.08);
        if (ph === 3) {
          this.summonT -= dt;
          if (this.summonT <= 0) {
            this.summonT = 6;
            run.sound.bossRoar();
            run.spawnGroup('shambler', 8, 'wall');
            run.spawnGroup('spider', 12, 'swarm');
          }
        }
        if (this.t <= 0) this.choose();
        break;
      }
      case 'barrage': {
        if (this.t <= this.next) {
          this.next -= 0.55 / fast;
          this.volleys--;
          const mx = x + mouth[0];
          const my = y + mouth[1] * 0.55; // fireballs leave the mouth but fly at road level
          const n = ph === 1 ? 9 : ph === 2 ? 11 : 13;
          const aim = Math.atan2(hero.y - my, hero.x - mx);
          const spread = 1.15;
          const off = this.volleys % 2 ? 0.5 : 0;
          for (let s = 0; s < n; s++) {
            const a = aim + ((s + off) / (n - 1) - 0.5) * spread;
            run.shoot(mx, my, Math.cos(a) * (290 + ph * 30), Math.sin(a) * (290 + ph * 30), 1);
          }
          if (ph === 3 && this.volleys === 0) {
            // a full ring as the last volley
            for (let s = 0; s < 18; s++) {
              const a = (s / 18) * TAU + rnd() * 0.1;
              run.shoot(mx, my, Math.cos(a) * 230, Math.sin(a) * 230, 1);
            }
          }
          run.fx.flash(mx, my, 40, 70, 3, 0.6, 0.2, 0.14);
          run.fx.light(mx, my, 80, 380, 4, 0.8, 0.2, 0.25);
          run.sound.enemyShot(run.pan(mx));
          run.shake(0.12);
        }
        if (this.volleys <= 0 && this.t <= 0) this.toIdle();
        break;
      }
      case 'charge_wind': {
        // follows the hero for a moment, then locks the lane
        if (this.t > 0.35) this.lockX = clamp(hero.x, 110, ARENA.w - 110);
        E.x[i] += clamp(this.lockX - x, -1, 1) * Math.min(Math.abs(this.lockX - x), 260 * dt);
        E.x[i] += Math.sin(this.anim * 60) * 1.2;
        // the marked lane pulses red on the road
        if (Math.floor(this.anim * 12) !== Math.floor((this.anim - dt) * 12)) {
          const len = BAND.y1 + 40 - y;
          const lane = run.fx.add(BEAM, UNDER, this.lockX, y + len / 2, 0, 0, 0, 0, 0.12, 55, 55, 1.4, 0.1, 0.05, 0.55, 0, 0, len / 110 - 1);
          run.fx.rot[lane] = Math.PI / 2;
        }
        if (this.t <= 0) {
          this.state = 'charge';
          run.sound.bossCharge();
          run.shake(0.3);
        }
        break;
      }
      case 'charge': {
        const sp = 950 * fast;
        E.y[i] += sp * dt;
        E.x[i] += clamp(this.lockX - x, -1, 1) * Math.min(Math.abs(this.lockX - x), 300 * dt);
        if (Math.floor(this.anim * 8) !== Math.floor((this.anim - dt) * 8)) this.stomp(0.22);
        // tramples its own horde
        run.trample(E.x[i], E.y[i], 115);
        const dx = hero.x - E.x[i];
        const dy = hero.y - E.y[i];
        if (dx * dx + dy * dy < 125 * 125) {
          run.hitHero(26, E.x[i], E.y[i]);
          hero.vx += Math.sign(dx || 1) * 900;
        }
        if (E.y[i] >= BAND.y0 + 60) {
          E.y[i] = BAND.y0 + 60;
          this.state = 'slam_wind';
          this.t = 0.75 / Math.sqrt(fast);
          this.slamX = E.x[i];
          this.slamY = E.y[i] + 20;
          run.shake(0.5);
          run.sound.bossSlam();
        }
        break;
      }
      case 'slam_wind': {
        // the danger circle around the coming impact
        if (Math.floor(this.anim * 10) !== Math.floor((this.anim - dt) * 10)) run.fx.ring(this.slamX, this.slamY, 278, 280, 2, 0.15, 0.08, 0.11, UNDER);
        if (this.t <= 0) {
          this.state = 'slam';
          this.t = 0.75;
          this.impact();
        }
        break;
      }
      case 'slam': {
        if (this.t <= 0) {
          this.state = 'retreat';
        }
        break;
      }
      case 'retreat': {
        E.y[i] -= 240 * fast * dt;
        if (Math.floor(this.anim * 6) !== Math.floor((this.anim - dt) * 6)) this.stomp(0.08);
        if (E.y[i] <= HOME_Y) {
          E.y[i] = HOME_Y;
          this.toIdle();
        }
        break;
      }
    }
    E.x[i] = clamp(E.x[i], 150, ARENA.w - 150);
  }

  toIdle() {
    this.state = 'idle';
    this.t = rand(1.0, 1.8) / (this.phase === 1 ? 1 : this.phase === 2 ? 1.3 : 1.7);
  }

  choose() {
    const r = rnd();
    const ph = this.phase;
    let next = r < 0.5 ? 'barrage' : 'charge';
    if (next === this.lastAttack && chance(0.6)) next = next === 'barrage' ? 'charge' : 'barrage';
    this.lastAttack = next;
    if (next === 'barrage') {
      this.state = 'barrage';
      this.volleys = ph === 1 ? 3 : ph === 2 ? 4 : 5;
      this.t = this.volleys * 0.55 + 0.4;
      this.next = this.t - 0.25;
      this.run.sound.bossRoar();
    } else {
      this.state = 'charge_wind';
      this.t = 1.0;
      this.lockX = this.run.hero.x;
    }
  }

  stomp(k) {
    const run = this.run;
    const E = run.enemies;
    run.shake(k);
    run.fx.smoke(E.x[this.i] + rand(-50, 50), E.y[this.i] + 6, 4, 26, 2, 0.32);
  }

  impact() {
    const run = this.run;
    const x = this.slamX;
    const y = this.slamY;
    run.sound.bossSlam();
    run.sound.explode(run.pan(x), 0.9);
    run.shake(1);
    run.hitstop(0.07);
    run.fx.ring(x, y, 40, 300, 2.4, 1.6, 1.0, 0.45);
    run.fx.ring(x, y, 20, 200, 1.4, 0.8, 0.5, 0.35, UNDER);
    for (let k = 0; k < 14; k++) run.fx.smoke(x + rand(-160, 160), y + rand(-70, 70), 6, 50, 1, 0.34);
    run.fx.add(GLOW, HOT, x, y, 0, 0, 0, 0, 0.2, 200, 260, 2.2, 1.6, 1.0, 1);
    run.fx.splat(x, y, 150, 0.06, 0.05, 0.045, 0.6, 2);
    run.fx.light(x, y, 60, 700, 3, 2.2, 1.4, 0.4);
    // everything nearby is flung; small creatures burst
    run.blast(x, y, 280, 90, 900, 'slam');
    const h = run.hero;
    const dx = h.x - x;
    const dy = h.y - y;
    if (dx * dx + dy * dy < 280 * 280) run.hitHero(24, x, y);
  }
}
