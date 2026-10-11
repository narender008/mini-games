// What every foe shares: movement with steering and the room's flow field,
// knockback, statuses, telegraphed attacks, hit reactions, rising from a
// spawn sigil, and dying (the death animation, then the shatter into light).
//
// An attack is data: {anim, frames: n, strikeFrame, windup, recover, cooldown,
// telegraph: {shape, range, half | width | inner}, damage, knock, track, lunge,
// fire(world, foe)}. The sprite's frames before strikeFrame are stretched over
// the wind-up and the rest over the recovery, so the swing lands exactly when
// the telegraph fills.
import { clamp, angleDiff, rng } from '../../config.js';
import { makeStatus, tickStatus, slowOf, disabled, hurtHero, inShape, COL } from '../combat.js';
import { BURST, GROUND } from '../../fx/fx.js';

export const ELITES = {
  swift: { name: 'Swift', tint: [0.4, 1.1, 1.3], text: 'moves and strikes faster' },
  warded: { name: 'Warded', tint: [0.75, 0.8, 1.2], text: 'is shielded by a ward of old iron' },
  vengeful: { name: 'Vengeful', tint: [0.9, 0.45, 1.3], text: 'bursts into soul orbs when slain' },
  hulking: { name: 'Hulking', tint: [0.6, 1.2, 0.8], text: 'is bigger and much tougher' },
};

let nextId = 1;

function tintTo(o, r, g, b, a) {
  o.tr = r;
  o.tg = g;
  o.tb = b;
  o.ta = a;
}

export class Foe {
  constructor(world, def, x, y, opts = {}) {
    this.id = nextId++;
    this.world = world;
    this.def = def;
    this.kind = def.id;
    this.name = def.name;
    this.x = this.px = x;
    this.y = this.py = y;
    this.z = def.hover || 0;
    this.vx = 0;
    this.vy = 0;
    this.r = def.r;
    this.h = def.h * (def.drawScale || 1);
    this.mass = def.mass || 1;
    this.facing = opts.facing ?? Math.atan2(world.hero.y - y, world.hero.x - x);
    const depth = world.run?.depthScale ?? 1;
    this.maxHp = Math.round(def.hp * depth);
    this.maxWard = def.ward ? Math.round(def.ward * depth) : 0;
    this.speed = def.speed;
    this.dmgMul = world.run?.dmgScale ?? 1;
    this.elite = opts.elite || null;
    this.scale = def.drawScale || 1; // bosses are drawn a little larger than their models, to loom
    if (this.elite) {
      this.maxHp = Math.round(this.maxHp * 1.8);
      this.dmgMul *= 1.2;
      if (this.elite === 'swift') this.speed *= 1.35;
      if (this.elite === 'warded') this.maxWard = Math.max(this.maxWard, Math.round(this.maxHp * 0.6));
      if (this.elite === 'hulking') {
        this.maxHp = Math.round(this.maxHp * 1.4);
        this.scale = 1.18;
        this.r *= 1.15;
        this.mass *= 1.6;
      }
    }
    this.hp = this.maxHp;
    this.ward = this.maxWard;
    this.status = makeStatus();
    this.alive = true;
    this.targetable = false; // not until it has risen
    this.boss = !!def.boss;
    this.hitSound = def.hitSound || 'hit_bone';
    this.flash = 0;
    this.state = 'spawn';
    this.t = 0;
    this.animT = rng.next() * 3;
    this.act = null;
    this.cool = 0.6 + rng.next() * 0.8;
    this.dissolve = 0;
    this.gone = false;
    this.seed = rng.next() * 10;
    this.spawnTime = opts.instant ? 0 : 0.9;
    this.strafe = rng.next() < 0.5 ? 1 : -1;
    this.lastHit = -10;
    this.attackSeq = 0;
    if (opts.instant) this.rise();
  }

  get speedMul() {
    return slowOf(this) * (this.elite === 'swift' ? 1.25 : 1);
  }

  rise() {
    this.state = 'idle';
    this.t = 0;
    this.targetable = true;
    this.world.audio.play(this.def.riseSound || 'telegraph', { x: this.x, y: this.y, gain: 0.5, rate: 0.7 });
  }

  update(dt) {
    const w = this.world;
    // how fast it actually went last step (for the walk cycle's rate)
    this.curSpeed = Math.hypot(this.x - this.px, this.y - this.py) / dt;
    this.px = this.x;
    this.py = this.y;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 9);
    if (this.state === 'spawn') {
      this.t += dt;
      if (this.t >= this.spawnTime) this.rise();
      return;
    }
    if (this.state === 'dead') {
      this.t += dt;
      const d = this.def.deathTime || 0.7;
      if (this.t > d) {
        if (this.dissolve === 0) this.shatter();
        this.dissolve = clamp((this.t - d) / 0.55, 0, 1);
        if (this.dissolve >= 1) this.gone = true;
      }
      this.slide(dt);
      return;
    }
    tickStatus(w, this, dt);
    if (!this.alive) return;
    this.animT += dt * this.walkRate();
    const k = this.speedMul * (this.elite === 'swift' ? 1.2 : 1);
    if (disabled(this)) {
      // frozen or dazed: an attack in progress is lost
      if (this.act) this.cancelAct();
      this.slide(dt);
      return;
    }
    this.t += dt * k;
    if (this.cool > 0) this.cool -= dt * k;
    if (this.state === 'hit') {
      if (this.t >= (this.def.stagger || 0.22)) this.setState('idle');
    } else if (this.act) this.runAct(dt * k);
    else {
      this.moving = false;
      this.think(dt, k);
    }
    this.slide(dt);
  }

  // knockback and the walls
  slide(dt) {
    const w = this.world;
    this.vx *= Math.exp(-9 * dt);
    this.vy *= Math.exp(-9 * dt);
    if (Math.abs(this.vx) + Math.abs(this.vy) < 0.01) return;
    const out = w.tmp;
    w.room.resolve(this.x + this.vx * dt, this.y + this.vy * dt, this.r, out, this.def.flying);
    this.x = out.x;
    this.y = out.y;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  // ---- movement helpers
  distHero() {
    const h = this.world.hero;
    return Math.hypot(h.x - this.x, h.y - this.y);
  }
  angleHero() {
    const h = this.world.hero;
    return Math.atan2(h.y - this.y, h.x - this.x);
  }
  turnTo(angle, rate, dt) {
    this.facing += clamp(angleDiff(this.facing, angle), -rate * dt, rate * dt);
  }

  // walk toward (tx, ty) using the flow field when the way is not straight, keeping apart from other foes
  walk(tx, ty, speed, dt, face = true) {
    const w = this.world;
    let dx;
    let dy;
    const dir = w.flow.dir(this.x, this.y, tx, ty, w.tmp2);
    dx = dir.x;
    dy = dir.y;
    // separation
    let sx = 0;
    let sy = 0;
    for (const o of w.enemies) {
      if (o === this || !o.alive || o.state === 'spawn') continue;
      const ox = this.x - o.x;
      const oy = this.y - o.y;
      const d = Math.hypot(ox, oy);
      const min = this.r + o.r + 0.35;
      if (d < min && d > 1e-4) {
        sx += (ox / d) * (min - d) / min;
        sy += (oy / d) * (min - d) / min;
      }
    }
    dx += sx * 1.6;
    dy += sy * 1.6;
    const l = Math.hypot(dx, dy) || 1;
    const nx = this.x + (dx / l) * speed * dt;
    const ny = this.y + (dy / l) * speed * dt;
    const out = w.tmp;
    w.room.resolve(nx, ny, this.r, out, this.def.flying);
    this.x = out.x;
    this.y = out.y;
    if (face) this.turnTo(Math.atan2(dy, dx), 8, dt);
    this.moving = true;
  }

  // ---- attacks
  startAct(def, opts = {}) {
    this.act = { def, t: 0, fired: false, hazard: null, opts, seq: ++this.attackSeq, angle: this.angleHero() };
    this.facing = this.act.angle;
    this.state = 'act';
    this.t = 0;
    const tg = def.telegraph;
    if (tg) {
      const at = opts.at || { x: this.x, y: this.y };
      this.act.hazard = this.world.hazard({
        owner: this,
        seq: this.act.seq,
        shape: tg.shape,
        x: at.x,
        y: at.y,
        angle: this.facing,
        range: tg.range,
        half: tg.half,
        width: tg.width,
        inner: tg.inner,
        windup: def.windup,
        damage: Math.round((def.damage || 0) * this.dmgMul),
        knock: def.knock || 4,
        by: this.name,
        follow: tg.follow !== false && !opts.at,
        boss: this.boss,
      });
    }
    if (def.sfx) this.world.audio.play(def.sfx, { x: this.x, y: this.y, gain: 0.7 });
  }

  cancelAct() {
    if (this.act?.hazard) this.act.hazard.cancelled = true;
    this.act = null;
    this.state = 'idle';
    this.t = 0;
    this.z = this.def.hover || 0;
    this.targetable = this.alive; // an act may have lifted it out of reach
    this.cool = Math.max(this.cool, 0.6);
  }

  runAct(dt) {
    const a = this.act;
    const def = a.def;
    a.t += dt;
    // track the heroine during the early wind-up
    if (def.track && a.t < def.windup * def.track) {
      this.turnTo(this.angleHero(), def.trackRate || 3.5, dt);
      a.angle = this.facing;
      if (a.hazard && a.hazard.follow) {
        a.hazard.angle = this.facing;
        a.hazard.x = this.x;
        a.hazard.y = this.y;
      }
    }
    if (def.lunge && a.t >= def.windup && a.t < def.windup + def.lunge.time) {
      const out = this.world.tmp;
      const v = def.lunge.dist / def.lunge.time;
      this.world.room.resolve(this.x + Math.cos(this.facing) * v * dt, this.y + Math.sin(this.facing) * v * dt, this.r, out, this.def.flying);
      this.x = out.x;
      this.y = out.y;
      if (a.hazard && a.hazard.follow) {
        a.hazard.x = this.x;
        a.hazard.y = this.y;
      }
    }
    if (!a.fired && a.t >= def.windup) {
      a.fired = true;
      def.fire?.(this.world, this, a);
    }
    def.during?.(this.world, this, a, dt);
    if (a.t >= def.windup + def.recover) {
      this.act = null;
      this.state = 'idle';
      this.t = 0;
      this.cool = (def.cooldown || 1) * (0.8 + rng.next() * 0.4);
    }
  }

  // frame index for the current action's sprite
  actFrame(n) {
    const a = this.act;
    const def = a.def;
    const k = def.strikeFrame;
    if (a.t < def.windup) return Math.min(k - 1, Math.floor((a.t / def.windup) * k));
    return Math.min(n - 1, k + Math.floor(((a.t - def.windup) / def.recover) * (n - k)));
  }

  // touching the heroine (some foes hurt on contact)
  contact(damage) {
    const h = this.world.hero;
    if (Math.hypot(h.x - this.x, h.y - this.y) < this.r + h.r + 0.05) hurtHero(this.world, Math.round(damage * this.dmgMul), { x: this.x, y: this.y, by: this.name });
  }

  flinch() {
    if (this.boss || this.def.superArmour) return;
    if (this.act && this.act.def.armour) return; // committed to a heavy swing
    if (this.act) this.cancelAct();
    this.setState('hit');
  }

  die(world) {
    this.cancelAct();
    this.state = 'dead';
    this.t = 0;
    this.targetable = false;
    world.audio.play(this.def.deathSound || 'shatter_bone', { x: this.x, y: this.y });
    if (this.elite === 'vengeful') {
      for (let i = 0; i < 6; i++) world.shoot('orb', this.x, this.y, (i / 6) * Math.PI * 2, 4.5, Math.round(8 * this.dmgMul), 10, 0.35, 'enemy');
    }
  }

  shatter() {
    const c = this.def.soul || COL.soul;
    this.world.fx.shatterInto(this.x, this.y, this.h, c, (this.def.big || 1) * this.scale);
  }

  // the walk cycle plays at the speed its feet were drawn for (the atlas records it), so feet do not slide
  walkRate() {
    if (!this.moving) return this.speedMul;
    const v = this.world.painter.atlas.value('speed', this.def.anims.move);
    const authored = typeof v === 'number' ? v : v?.authored;
    if (!authored) return this.speedMul;
    return clamp(this.curSpeed / authored, 0.6, 1.8);
  }

  // ---- drawing
  // [animation name, frame index (-1: loop on the foe's own clock)] in a reused pair
  P(anim, i) {
    const r = this._pose || (this._pose = ['', 0]);
    r[0] = anim;
    r[1] = i;
    return r;
  }
  // frame i of an animation designed with `spec` frames, mapped onto however many the atlas holds
  specFrame(anim, i, spec) {
    const n = this.world.painter.atlas.anim(anim).n || spec;
    return Math.max(0, Math.min(n - 1, Math.floor(((i + 0.5) * n) / spec)));
  }
  pose() {
    // subclasses override for their own acts
    const d = this.def.anims;
    if (this.state === 'dead') return this.P(d.death, Math.floor(this.t * (this.def.deathFps || 12)));
    if (this.state === 'hit') return this.P(d.hit, Math.floor(this.t * 16));
    if (this.state === 'act' && this.act) return this.P(this.act.def.anim, this.actFrame(this.world.painter.atlas.anim(this.act.def.anim).n || 1));
    if (this.moving) return this.P(d.move, -1);
    return this.P(d.idle, -1);
  }

  draw(p, alpha) {
    const x = this.px + (this.x - this.px) * alpha;
    const y = this.py + (this.y - this.py) * alpha;
    if (this.state === 'spawn') {
      const k = this.t / this.spawnTime;
      p.ground(GROUND.spawn, x, y, 1.2 * this.scale, 1.2 * this.scale, 0.45, 1.1, 1.2, 0.9, k, 0, this.seed);
      p.light(x, y, 0.5, 3, 0.4 * k, 1.1 * k, 1.2 * k);
      return;
    }
    const pr = this.pose();
    const anim = pr[0];
    let i = pr[1];
    if (i < 0) i = p.frameAt(anim, this.animT, true);
    const a = p.atlas.anim(anim);
    if (a.n) i = Math.min(a.n - 1, i);
    const rising = this.t < 0.3 && this.state === 'idle' && this.targetable && this.risingFade !== false ? this.t / 0.3 : 1;
    const s = this.status;
    const o = p.opt();
    if (this.elite) {
      const e = ELITES[this.elite].tint;
      tintTo(o, e[0], e[1], e[2], 0.55 + 0.15 * Math.sin(this.world.time * 4 + this.seed));
    }
    if (s.frozen > 0) tintTo(o, 0.5, 0.85, 1.3, 0.9);
    else if (s.umbra > 0 && !o.ta) tintTo(o, 0.5, 0.3, 1.0, 0.25 + s.umbra * 0.06);
    else if (s.chill > 0 && !o.ta) tintTo(o, 0.45, 0.75, 1.1, 0.15 + s.chill * 0.08);
    const z = this.z + (this.def.bob ? Math.sin(this.world.time * 2.2 + this.seed) * this.def.bob : 0);
    o.flash = this.flash;
    o.dissolve = this.dissolve;
    o.alpha = rising;
    o.shadow = !this.def.noShadow;
    o.scale = this.scale;
    o.seed = this.seed;
    o.height = this.h;
    p.actor(anim, this.facing, i, x, y, z, o);
    p.blob(x, y, this.r * 1.35, this.def.hover ? 0.35 : 0.5);
    if (s.dawn > 0) p.glow(7, x, y, this.h * 0.6, 0.7, 1.4, 0.95, 0.4, 0.6 + 0.4 * Math.sin(this.world.time * 20));
    if (s.frozen > 0) p.ground(6, x, y, this.r * 2, this.r * 2, 0.4, 0.8, 1.2, 0.5);
    this.lights?.(p, x, y);
  }

  shatterColour() {
    return this.def.soul || COL.soul;
  }
}

// a spawn burst used by bosses summoning
export function summonFx(world, x, y) {
  world.fx.burst(BURST.wisps, x, y, 0.4, COL.soul, 12, 1);
  world.fx.ground(GROUND.spawn, x, y, 1.2, 1.2, COL.soul, 0.9, { p0: 0 });
}

export { inShape };
