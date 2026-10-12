// The Hollow Seraph, the Gloamwall's lord: once the moon's own warden, now
// the Tyrant's jailer on the wall. Hovers on great tattered wings.
//   sweep  the scythe through a wide cone in front
//   throw  a crescent of soul light hurled from the blade (three in phase 2+)
//   cast   the soul lantern held high: spirals of soul orbs
//   dive   it rises out of reach, a circle marks where it will fall, it crashes down (a ring follows in phase 2+)
//   gust   a mighty wing beat that throws Maelis back
// Phase 2 (two thirds health): calls Mourners and a Lampwight, quicker.
// Phase 3 (one third): the eclipse. The light drains from the wall, Skitterskulls
// pour out of the dark, and it dives twice in a row.
import { Foe, summonFx } from '../enemies/base.js';
import { rng, TAU } from '../../config.js';
import { hurtHero } from '../combat.js';
import { BURST, GROUND, GLOW } from '../../fx/fx.js';

const SWEEP = {
  anim: 'seraph_sweep',
  strikeFrame: 7,
  windup: 0.85,
  recover: 0.6,
  cooldown: 0.9,
  telegraph: { shape: 'arc', range: 4.4, half: 1.4 },
  damage: 18,
  knock: 10,
  track: 0.55,
  trackRate: 2.6,
  armour: true,
  sfx: 'telegraph',
  fire(w, e) {
    w.audio.play('scythe', { x: e.x, y: e.y });
    w.fx.arc(e.x, e.y, 1.2, 3.8, e.facing - 1.5, 3.0, 1.2, [0.5, 1.2, 1.25, 0.9], 0.28);
  },
};

const THROW = {
  anim: 'seraph_throw',
  strikeFrame: 6,
  windup: 0.7,
  recover: 0.5,
  cooldown: 1.0,
  track: 0.85,
  trackRate: 3,
  sfx: 'telegraph',
  fire(w, e) {
    const n = e.phase >= 2 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const a = e.facing + (i - (n - 1) / 2) * 0.32;
      w.shoot('crescent', e.x + Math.cos(a) * 1.2, e.y + Math.sin(a) * 1.2, a, 9.5, Math.round(14 * e.dmgMul), 18, 0.9, 'enemy', e.name);
    }
    w.audio.play('scythe', { x: e.x, y: e.y, rate: 1.3 });
  },
};

const CAST = {
  anim: 'seraph_cast',
  strikeFrame: 5,
  windup: 0.55,
  recover: 2.1,
  cooldown: 1.2,
  armour: true,
  sfx: 'telegraph',
  fire(w, e, a) {
    a.spin = rng.next() * TAU;
    a.emitT = 0;
    w.audio.play('orb_fire', { x: e.x, y: e.y, rate: 0.7 });
  },
  during(w, e, a, dt) {
    if (!a.fired) return;
    const k = a.t - a.def.windup;
    if (k > 1.85) return;
    a.emitT -= dt;
    if (a.emitT > 0) return;
    a.emitT = e.phase >= 3 ? 0.11 : 0.14;
    const arms = e.phase >= 3 ? 3 : 2;
    a.spin += 0.32 * (e.phase >= 2 ? 1.15 : 1);
    for (let i = 0; i < arms; i++) {
      const ang = a.spin + (i / arms) * TAU;
      w.shoot('orb', e.x + Math.cos(ang) * 0.9, e.y + Math.sin(ang) * 0.9, ang, 5.2, Math.round(8 * e.dmgMul), 14, 0.36, 'enemy', e.name);
    }
    if (Math.floor(k / 0.3) !== Math.floor((k - dt) / 0.3)) w.audio.play('orb_fire', { x: e.x, y: e.y, gain: 0.4, rate: 1.2 });
  },
};

const DIVE = {
  anim: 'seraph_dive',
  strikeFrame: 5,
  windup: 1.6,
  recover: 0.8,
  cooldown: 1.0,
  armour: true,
  sfx: 'wing_beat',
  begin(w, e, a) {
    a.from = { x: e.x, y: e.y };
  },
  during(w, e, a, dt) {
    const h = w.hero;
    const W = a.def.windup;
    if (a.t < 0.5) {
      // rising out of reach
      e.z = 0.4 + (a.t / 0.5) * 7;
      e.targetable = false;
    } else if (a.t < W) {
      if (!a.mark) {
        a.mark = w.clampToFloor(h.x, h.y, h.x, h.y);
        a.hazard = w.hazard({ owner: e, seq: a.seq, shape: 'circle', x: a.mark.x, y: a.mark.y, angle: 0, range: 2.5, windup: W - 0.5, damage: Math.round(22 * e.dmgMul), knock: 12, by: e.name, boss: true, follow: false });
      }
      // drift over the mark, high up, then fall
      const k = (a.t - 0.5) / (W - 0.5);
      e.x = a.from.x + (a.mark.x - a.from.x) * Math.min(1, k * 1.6);
      e.y = a.from.y + (a.mark.y - a.from.y) * Math.min(1, k * 1.6);
      e.z = k < 0.75 ? 7.4 : 7.4 * (1 - (k - 0.75) / 0.25) + 0.4 * ((k - 0.75) / 0.25);
    } else {
      e.z = 0.4;
      e.targetable = true;
    }
    void dt;
  },
  fire(w, e, a) {
    e.z = 0.4;
    e.targetable = true;
    const at = a.mark || e;
    w.audio.play('dive_impact', { x: at.x, y: at.y });
    w.fx.shake(0.65);
    w.fx.burst(BURST.dust, at.x, at.y, 0.1, [0.5, 0.5, 0.55, 0.9], 24, 2.4);
    w.fx.burst(BURST.shatter, at.x, at.y, 0.4, [0.5, 1.2, 1.25, 1], 20, 1.5);
    w.fx.ground(GROUND.shock, at.x, at.y, 4, 4, [0.5, 1.2, 1.25, 1], 0.5);
    w.fx.light(at.x, at.y, 1, 8, [1, 2.6, 2.6], 0.4);
    w.decal(at.x, at.y, 1.8, 2);
    if (e.phase >= 2) w.hazard({ owner: e, seq: a.seq, shape: 'ring', x: at.x, y: at.y, angle: 0, range: 5.5, inner: 2.6, windup: 0.45, damage: Math.round(10 * e.dmgMul), knock: 7, by: e.name, boss: true });
  },
};

const GUST = {
  anim: 'seraph_gust',
  strikeFrame: 6,
  windup: 0.75,
  recover: 0.5,
  cooldown: 0.6,
  telegraph: { shape: 'arc', range: 7, half: 0.9 },
  damage: 6,
  knock: 16,
  track: 0.6,
  armour: true,
  sfx: 'telegraph',
  fire(w, e) {
    w.audio.play('wing_beat', { x: e.x, y: e.y, gain: 1.2 });
    for (let i = 0; i < 4; i++) w.fx.burst(BURST.dust, e.x + Math.cos(e.facing) * (1.5 + i * 1.4), e.y + Math.sin(e.facing) * (1.5 + i * 1.4), 0.2, [0.5, 0.55, 0.65, 0.6], 8, 1, [Math.cos(e.facing) * 8, Math.sin(e.facing) * 8, 0], 1);
    w.fx.shake(0.25);
  },
};

function countAlive(w) {
  let n = 0;
  for (const e of w.enemies) if (e.alive && !e.boss) n++;
  return n;
}

export const SERAPH = {
  id: 'seraph',
  name: 'The Hollow Seraph',
  title: 'Warden of the Gloamwall',
  blurb: 'Once the moon set her to guard its road. When the clock stopped she kept guarding it, for the Tyrant now, and her eyes have been empty ever since.',
  boss: true,
  hp: 2300,
  r: 1.0,
  h: 3.2,
  drawScale: 1.3,
  hover: 0.4,
  bob: 0.12,
  mass: 6,
  speed: 3.2,
  flying: true,
  big: 2.6,
  set: 'seraph',
  hitSound: 'hit_heavy',
  deathSound: 'shatter_spirit',
  anims: { idle: 'seraph_idle', move: 'seraph_glide', hit: 'seraph_hit', death: 'seraph_death' },
  deathTime: 1.6,
  deathFps: 10,
  music: 'seraph',
  marks: [66, 33], // the boss bar's phase ticks (% of health)
  phaseLines: { 3: 'calls the eclipse' }, // the banner at each phase (default: grows desperate)
  threat: 20,
  soul: [0.5, 1.2, 1.3, 1],
};

export class Seraph extends Foe {
  constructor(...a) {
    super(...a);
    this.phase = 1;
    this.spawnTime = 0;
    this.rise();
    this.cool = 1.5;
    this.last = null;
    this.summonT = 0;
    this.diveChain = 0;
  }
  get hpFrac() {
    return this.hp / this.maxHp;
  }
  startAct(def, opts) {
    super.startAct(def, opts);
    def.begin?.(this.world, this, this.act);
    this.last = def;
  }
  think(dt, k) {
    const w = this.world;
    if (this.phase === 1 && this.hpFrac <= 0.66) {
      this.phase = 2;
      w.bossPhase(this, 2);
      this.summon(['mourner', 'mourner', 'lampwight']);
      w.audio.play('wing_beat', { x: this.x, y: this.y });
      this.cool = 0.4;
    } else if (this.phase === 2 && this.hpFrac <= 0.33) {
      this.phase = 3;
      w.bossPhase(this, 3);
      w.eclipse(true);
      this.summon(['skitter', 'skitter', 'skitter', 'mourner']);
      this.cool = 0.4;
    }
    if (this.phase === 3) {
      this.summonT += dt;
      if (this.summonT > 11 && countAlive(w) < 4) {
        this.summonT = 0;
        this.summon(['skitter', 'skitter', 'skitter']);
      }
    }
    const h = w.hero;
    const d = this.distHero();
    if (this.diveChain > 0 && this.cool <= 0) {
      this.diveChain--;
      return this.startAct(DIVE);
    }
    if (this.cool <= 0) {
      const opts = [];
      if (d < 4.5) opts.push(SWEEP, SWEEP, GUST);
      if (d > 3) opts.push(THROW, THROW);
      opts.push(CAST);
      if (d > 4 || this.phase >= 2) opts.push(DIVE);
      let pick = opts[Math.floor(rng.next() * opts.length)];
      if (pick === this.last && opts.length > 1) pick = opts[(opts.indexOf(pick) + 1) % opts.length];
      if (pick === DIVE && this.phase >= 3) this.diveChain = 1;
      if (pick === GUST) this.after = THROW;
      this.cool = this.phase >= 2 ? 0.6 : 0.9;
      return this.startAct(pick);
    }
    if (this.after) {
      const a = this.after;
      this.after = null;
      return this.startAct(a);
    }
    // keep a middling distance, circling
    const want = d < 3 ? -1 : d > 6 ? 1 : 0;
    const a = this.angleHero();
    if (want) this.walk(this.x + Math.cos(a) * want * 3, this.y + Math.sin(a) * want * 3, this.speed * k, dt, false);
    else this.walk(this.x - Math.sin(a) * this.strafe * 2, this.y + Math.cos(a) * this.strafe * 2, this.speed * 0.7 * k, dt, false);
    this.turnTo(a, 3, dt);
  }
  summon(kinds) {
    const w = this.world;
    for (const k of kinds) {
      const p = w.room.randomFloor(rng, w.hero.x, w.hero.y, 4);
      summonFx(w, p.x, p.y);
      w.addFoe(k, p.x, p.y);
    }
  }
  pose() {
    if (this.state === 'act' && this.act?.def === DIVE) {
      const a = this.act;
      const W = DIVE.windup;
      const i = a.t < 0.5 ? Math.floor((a.t / 0.5) * 5) : a.t < W ? (a.t > W - 0.35 ? 5 + Math.floor(((a.t - (W - 0.35)) / 0.35) * 3) : 4) : 8 + Math.min(1, Math.floor(((a.t - W) / DIVE.recover) * 2));
      return this.P('seraph_dive', this.specFrame('seraph_dive', Math.min(9, i), 10));
    }
    return super.pose();
  }
  draw(p, alpha) {
    super.draw(p, alpha);
    // its shadow on the ground while it is high in the air
    if (this.z > 1) p.blob(this.x, this.y, 1.6 - Math.min(1, this.z / 8) * 0.6, 0.5);
  }
  lights(p, x, y) {
    const c = this.state === 'dead' ? 1 - this.dissolve : 1;
    p.light(x, y + 0.6, 2 + this.z, 7, 0.5 * c, 1.35 * c, 1.45 * c);
    if (this.state === 'act' && this.act?.def === CAST && this.act.fired) p.glow(GLOW.orb, x, y + 0.26 * this.scale, this.z + 3.45 * this.scale, 0.6, 0.5, 1.4, 1.3, 0.55, 0.5);
  }
}
