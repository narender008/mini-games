// Maelis. A small state machine: move, attack (a chain of steps), dash,
// dash strike, special, cast, hurt, dead. Inputs are buffered (input.take),
// attacks snap to the aim, a dash cancels any move once its hit has landed,
// an attack during or just after a dash becomes a dash strike. All feel
// numbers are in feel.js; the weapons' moves are data (weapons/*.js).
import { clamp, angleDiff, TAU } from '../config.js';
import { FEEL } from './feel.js';
import { hitFoe, inShape, COL } from './combat.js';
import { BURST, GROUND, GLOW } from '../fx/fx.js';

const H = FEEL.hero;
const ZERO = Object.freeze({ x: 0, y: 0 });
const D = FEEL.dash;

export class Hero {
  constructor(world, weapon, mods) {
    this.world = world;
    this.weapon = weapon;
    this.mods = mods;
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.vx = 0;
    this.vy = 0;
    this.kx = 0; // knockback velocity
    this.ky = 0;
    this.r = H.radius;
    this.h = 1.8;
    this.facing = Math.PI / 2;
    this.aim = Math.PI / 2;
    this.baseMaxHp = H.hp;
    this.maxHp = H.hp;
    this.hp = H.hp;
    this.alive = true;
    this.state = 'move';
    this.t = 0;
    this.move = null;
    this.chain = 0;
    this.chainT = 0; // time left in which the next attack continues the chain
    this.hitDone = 0;
    this.hitSet = new Set();
    this.whirlHits = new Map();
    this.dashes = 1;
    this.dashRecharge = 0;
    this.dashCool = 0;
    this.dashDir = 0;
    this.dashEndT = 0; // time since the last dash ended (for dash strikes)
    this.iframes = 0;
    this.afterDashT = 0;
    this.trailT = 0;
    this.casts = FEEL.cast.charges;
    this.castRegen = 0;
    this.specialCool = 0;
    this.flash = 0;
    this.animT = 0;
    this.runPhase = 0;
    this.stepT = 0;
    this.ghosts = []; // afterimages: {x, y, angle, i, prefix, t}
    this.wardUp = false;
    this.wardT = 0;
    this.lastHurtBy = '';
    this.deathT = 0;
    this.speedNow = 0;
    this.controlLag = 0;
    this.applyMods(mods, true);
  }

  // blessings, upgrades and heartroots changed: refresh the derived numbers
  applyMods(m, fill = false) {
    this.mods = m;
    const old = this.maxHp;
    this.maxHp = Math.round(this.baseMaxHp + m.maxHp);
    if (fill) this.hp = this.maxHp;
    else if (this.maxHp > old) this.hp += this.maxHp - old;
    this.hp = Math.min(this.hp, this.maxHp);
    this.maxDashes = m.dashCharges;
    this.dashes = Math.min(this.dashes, this.maxDashes);
    if (fill) this.dashes = this.maxDashes;
    this.maxCasts = FEEL.cast.charges + m.castCharges;
    if (fill) this.casts = this.maxCasts;
    if (m.ward && !this.wardUp && this.wardT <= 0) this.wardUp = true;
  }

  place(x, y, facing = -Math.PI / 2) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.vx = this.vy = this.kx = this.ky = 0;
    this.facing = facing;
    this.state = 'move';
    this.ghosts.length = 0;
  }

  invulnerable() {
    return this.iframes > 0 || (this.state === 'dash' && this.t < D.iframes + this.mods.dashIframes) || this.state === 'dead';
  }

  knockFrom(x, y, k) {
    const dx = this.x - x;
    const dy = this.y - y;
    const l = Math.hypot(dx, dy) || 1;
    this.kx += (dx / l) * k;
    this.ky += (dy / l) * k;
  }

  flinch() {
    if (this.state === 'dead') return;
    if (this.state === 'special' && this.weapon.special.kind === 'whirl') this.world.audio.loop('whirl', 'whirl', false);
    this.state = 'hit';
    this.t = 0;
    this.move = null;
  }

  // aim for an attack: the cursor, or the stick with aim assist toward a foe in that direction
  aimAngle(input) {
    const a = input.aim;
    let ang = a.active ? a.angle : this.facing;
    if (!a.fromMouse && this.world.settings.aimAssist) {
      const A = FEEL.aimAssist;
      let best = null;
      let bestScore = 1e9;
      for (const e of this.world.enemies) {
        if (!e.alive || !e.targetable) continue;
        const dx = e.x - this.x;
        const dy = e.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > A.range) continue;
        const off = Math.abs(angleDiff(ang, Math.atan2(dy, dx)));
        if (off > A.cone && d > 2.2) continue;
        const score = off * 3 + d * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (best) {
        const target = Math.atan2(best.y - this.y, best.x - this.x);
        ang = ang + angleDiff(ang, target) * A.strength;
      }
    }
    return ang;
  }

  update(dt, input) {
    const w = this.world;
    const m = this.mods;
    this.px = this.x;
    this.py = this.y;
    this.t += dt;
    this.animT += dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    if (this.chainT > 0) this.chainT -= dt;
    if (this.dashCool > 0) this.dashCool -= dt;
    if (this.specialCool > 0) this.specialCool -= dt;
    if (this.afterDashT > 0) this.afterDashT -= dt;
    this.dashEndT += dt;
    if (this.dashes < this.maxDashes) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= D.recharge) {
        this.dashRecharge = 0;
        this.dashes++;
      }
    } else this.dashRecharge = 0;
    if (this.casts < this.maxCasts) {
      this.castRegen += dt;
      if (this.castRegen >= FEEL.cast.regen) {
        this.castRegen = 0;
        this.casts++;
        w.audio.play('ui_move', { gain: 0.4, rate: 1.6 });
      }
    } else this.castRegen = 0;
    if (!this.wardUp && m.ward) {
      this.wardT -= dt;
      if (this.wardT <= 0) this.wardUp = true;
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].t += dt;
      if (this.ghosts[i].t > 0.22) this.ghosts.splice(i, 1);
    }
    if (this.state === 'dead') {
      this.deathT += dt;
      this.vx = this.vy = 0;
      return;
    }
    const busy = w.inputBlocked();
    this.aim = input.aim.active ? input.aim.angle : this.facing;

    // ---- choose a new action (buffered presses)
    const canDash = this.dashes > 0 && this.dashCool <= 0;
    const cancellable = this.state === 'move' || ((this.state === 'attack' || this.state === 'dashstrike') && this.t >= this.move.cancel) || (this.state === 'special' && this.canEndSpecial()) || (this.state === 'cast' && this.t >= 0.28);
    if (!busy) {
      if (canDash && (cancellable || this.state === 'hit' && this.t > 0.1) && input.take('dash', FEEL.buffer)) this.startDash(input);
      else if (this.state === 'dash' && this.t > D.time * 0.45 && input.take('attack', FEEL.buffer)) this.queuedStrike = true;
      else if (this.state === 'move' || ((this.state === 'attack' || this.state === 'dashstrike') && this.t >= this.move.chainFrom)) {
        if (input.take('attack', FEEL.buffer)) {
          if (this.state === 'move' && this.dashEndT < D.strikeWindow) this.startStrike(input);
          else this.startAttack(input);
        } else if (this.specialCool <= 0 && input.take('special', FEEL.buffer)) this.startSpecial(input);
        else if (this.casts > 0 && input.take('cast', FEEL.buffer)) this.startCast(input);
      } else if (this.state === 'move' || (this.state === 'cast' && this.t >= 0.3)) {
        if (input.take('cast', FEEL.buffer) && this.casts > 0) this.startCast(input);
      }
    }

    // ---- run the current state
    let tvx = 0;
    let tvy = 0;
    const speed = H.speed * m.speed;
    const mv = busy ? ZERO : input.move;
    const ml = Math.hypot(mv.x, mv.y);
    switch (this.state) {
      case 'move': {
        if (this.controlLag > 0) this.controlLag -= dt;
        const k = this.controlLag > 0 ? 0.5 : 1;
        tvx = mv.x * speed * k;
        tvy = mv.y * speed * k;
        if (ml > 0.1) {
          const want = Math.atan2(mv.y, mv.x);
          this.facing += clamp(angleDiff(this.facing, want), -H.turn * dt, H.turn * dt);
        }
        break;
      }
      case 'attack':
      case 'dashstrike': {
        const mvDef = this.move;
        if (this.t < mvDef.lungeTime) {
          const v = mvDef.lunge / mvDef.lungeTime;
          tvx = Math.cos(this.facing) * v;
          tvy = Math.sin(this.facing) * v;
          // the stick nudges a lunge a little
          tvx += mv.x * 1.5;
          tvy += mv.y * 1.5;
        }
        if (this.hitDone === 0 && this.t >= mvDef.hit) {
          this.hitDone = 1;
          this.strike(mvDef, mvDef.damage);
        }
        if (mvDef.hit2 && this.hitDone === 1 && this.t >= mvDef.hit2) {
          this.hitDone = 2;
          this.hitSet.clear();
          this.strike(mvDef, mvDef.damage2, true);
        }
        if (this.t >= mvDef.time) {
          this.state = 'move';
          this.t = 0;
          this.chainT = 0.28;
          if (mvDef === this.weapon.chain[this.weapon.chain.length - 1]) this.chain = 0;
        }
        break;
      }
      case 'dash': {
        const v = D.distance / D.time;
        tvx = Math.cos(this.dashDir) * v;
        tvy = Math.sin(this.dashDir) * v;
        this.vx = tvx;
        this.vy = tvy;
        if ((this.trailT -= dt) <= 0) {
          this.trailT = 0.03;
          this.ghosts.push({ x: this.x, y: this.y, angle: this.facing, k: this.t / D.time, t: 0 });
          if (m.dashTrail) w.strike(m.dashTrail.kind === 'frost' ? 'frostTrail' : 'cometTrail', this.x, this.y, m.dashTrail.damage, 0, 0.9, m.dashTrail.status);
        }
        if (m.dashThrough.length) {
          for (const e of w.enemies) {
            if (!e.alive || this.hitSet.has(e)) continue;
            if (Math.hypot(e.x - this.x, e.y - this.y) < e.r + this.r + 0.3) {
              this.hitSet.add(e);
              for (const k of m.dashThrough) w.inflictOn(e, k);
            }
          }
        }
        if (this.t >= D.time) this.endDash(input);
        break;
      }
      case 'special':
        this.updateSpecial(dt, input, mv);
        if (this.state === 'special' && this.weapon.special.kind === 'whirl') {
          tvx = mv.x * this.weapon.special.moveSpeed;
          tvy = mv.y * this.weapon.special.moveSpeed;
        }
        break;
      case 'cast':
        if (!this.castDone && this.t >= 0.25) {
          this.castDone = true;
          this.placeRune();
        }
        tvx = mv.x * speed * 0.25;
        tvy = mv.y * speed * 0.25;
        if (this.t >= 0.4) {
          this.state = 'move';
          this.t = 0;
        }
        break;
      case 'hit':
        if (this.t >= H.hurtStun) {
          this.state = 'move';
          this.t = 0;
        }
        break;
    }
    // velocity
    if (this.state === 'dash') {
      // set above
    } else {
      const acc = Math.hypot(tvx, tvy) > Math.hypot(this.vx, this.vy) ? H.accel : H.decel;
      const dvx = tvx - this.vx;
      const dvy = tvy - this.vy;
      const dl = Math.hypot(dvx, dvy);
      const step = acc * dt;
      if (dl <= step) {
        this.vx = tvx;
        this.vy = tvy;
      } else {
        this.vx += (dvx / dl) * step;
        this.vy += (dvy / dl) * step;
      }
    }
    // knockback decays
    this.kx *= Math.exp(-10 * dt);
    this.ky *= Math.exp(-10 * dt);
    const nx = this.x + (this.vx + this.kx) * dt;
    const ny = this.y + (this.vy + this.ky) * dt;
    const out = w.tmp;
    w.room.resolve(nx, ny, this.r, out);
    this.x = out.x;
    this.y = out.y;
    this.speedNow = Math.hypot(this.x - this.px, this.y - this.py) / dt;
    // footsteps
    if (this.state === 'move' && this.speedNow > 2) {
      this.stepT -= dt * (this.speedNow / speed);
      if (this.stepT <= 0) {
        this.stepT = 0.28;
        w.audio.play('step', { x: this.x, y: this.y, gain: 0.35 });
      }
    }
  }

  // ---- actions
  startAttack(input) {
    const wpn = this.weapon;
    if (this.state === 'move' && this.chainT <= 0) this.chain = 0;
    const step = wpn.chain[this.chain];
    this.chain = (this.chain + 1) % wpn.chain.length;
    this.begin('attack', step, input);
  }

  startStrike(input) {
    this.begin('dashstrike', this.weapon.dashStrike, input);
    this.chain = 0;
  }

  begin(state, step, input) {
    this.state = state;
    this.t = 0;
    this.move = step;
    this.hitDone = 0;
    this.hitSet.clear();
    this.facing = this.aimAngle(input);
    this.world.audio.play(step.sfx, { x: this.x, y: this.y, rate: 0.95 + Math.random() * 0.1 });
    this.slashFx(step);
  }

  slashFx(step) {
    const w = this.world;
    const col = this.slotColour('attack');
    const a = step.arc || {};
    const delay = step.hit * 0.6;
    if (a.spin) {
      const o = w.fx.arc(this.x, this.y, 0.9, step.range * 0.78, this.facing, TAU * 1.05, 0.9, col, step.time * 0.8);
      o.t = -delay;
      w.followFx(o, this);
    } else {
      const start = this.facing + (a.from || 0);
      const o = w.fx.arc(this.x, this.y, a.thrust ? 0.95 : 1.0, step.range * (a.thrust ? 0.6 : 0.72), start - (a.sweep || 0) * 0.05, a.sweep || 0, a.thrust ? 0.55 : 0.85, col, step.time * 0.62);
      o.t = -delay;
      w.followFx(o, this);
    }
  }

  slotColour(slot) {
    const b = this.world.slotPatron?.(slot);
    if (b === 'vaela') return COL.frost;
    if (b === 'aurin') return COL.dawn;
    if (b === 'umbriel') return COL.umbra;
    if (b === 'corvane') return COL.comet;
    return COL.moon;
  }

  // apply a move's hit to every foe in its shape
  strike(mv, damage, second = false) {
    const w = this.world;
    let any = false;
    for (const e of w.enemies) {
      if (!e.alive || !e.targetable || this.hitSet.has(e)) continue;
      if (!inShape(mv, this.x, this.y, this.facing, e.x, e.y, e.r)) continue;
      this.hitSet.add(e);
      any = true;
      hitFoe(w, e, damage, { slot: 'attack', heavy: mv.heavy || second, knock: mv.knock, kx: e.x - this.x, ky: e.y - this.y, color: this.slotColour('attack') });
    }
    w.hitProps(this.x, this.y, mv, this.facing);
    if (mv.bolt) {
      const b = mv.bolt;
      w.shoot('bolt', this.x + Math.cos(this.facing) * 0.8, this.y + Math.sin(this.facing) * 0.8, this.facing, b.speed, b.damage, b.range, b.radius, 'hero');
      w.audio.play('moon_bolt', { x: this.x, y: this.y });
    }
    if (any && mv.heavy) w.fx.shake(0.1);
  }

  startDash(input) {
    const w = this.world;
    if (this.state === 'special' && this.weapon.special.kind === 'whirl') this.endSpecial();
    const mv = input.move;
    this.dashDir = Math.hypot(mv.x, mv.y) > 0.2 ? Math.atan2(mv.y, mv.x) : this.facing;
    this.facing = this.dashDir;
    this.state = 'dash';
    this.t = 0;
    this.move = null;
    this.dashes--;
    this.dashRecharge = 0;
    if (this.dashes <= 0) this.dashCool = D.cooldown;
    this.trailT = 0;
    this.queuedStrike = false;
    this.hitSet.clear();
    w.audio.play('dash', { x: this.x, y: this.y });
    w.fx.burst(BURST.dust, this.x, this.y, 0.05, [0.55, 0.6, 0.75, 0.7], 10, 0.8);
    w.fx.ground(GROUND.mark, this.x, this.y, 0.7, 0.7, [0.5, 0.75, 1, 0.5], 0.5);
  }

  endDash(input) {
    const w = this.world;
    const m = this.mods;
    this.state = 'move';
    this.t = 0;
    this.dashEndT = 0;
    this.controlLag = D.endLag;
    this.afterDashT = m.afterDash ? 1.5 : 0;
    if (m.dashFlash) {
      w.fx.glow(GLOW.star, this.x, this.y, 0.9, 1.8, COL.dawn, 0.25, { grow: 0.5 });
      w.fx.ground(GROUND.shock, this.x, this.y, 2.2, 2.2, COL.dawn, 0.35);
      w.fx.light(this.x, this.y, 1, 6, [3, 2, 0.8], 0.25);
      for (const e of w.enemies) if (e.alive && Math.hypot(e.x - this.x, e.y - this.y) < 2.2 + e.r) hitFoe(w, e, m.dashFlash, { slot: 'dash', knock: 3, kx: e.x - this.x, ky: e.y - this.y, color: COL.dawn });
    }
    if (this.queuedStrike) {
      this.queuedStrike = false;
      this.startStrike(input);
    }
  }

  startSpecial(input) {
    const sp = this.weapon.special;
    this.state = 'special';
    this.t = 0;
    this.move = sp;
    this.facing = this.aimAngle(input);
    this.released = false;
    this.whirlHits.clear();
    if (sp.kind === 'whirl') {
      this.world.audio.loop('whirl', 'whirl', true, { x: this.x, y: this.y });
      this.world.audio.play('whirl_spin', { x: this.x, y: this.y });
    } else this.world.audio.play('staff_swing', { x: this.x, y: this.y, rate: 0.8 });
    if (this.mods.starOnSpecial) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const a = this.facing + (i / n) * TAU + 0.4;
        this.world.strike('star', this.x + Math.cos(a) * 2.6, this.y + Math.sin(a) * 2.6, this.mods.starOnSpecial, 0.3 + i * 0.08, 1.2);
      }
    }
  }

  canEndSpecial() {
    const sp = this.weapon.special;
    if (sp.kind === 'whirl') return this.t >= sp.minTime * 0.5;
    return this.t >= sp.cancel;
  }

  updateSpecial(dt, input, mv) {
    const w = this.world;
    const sp = this.weapon.special;
    if (sp.kind === 'whirl') {
      // spin: hit every foe in reach every `tick` seconds
      this.facing += dt * 16;
      const col = this.slotColour('special');
      if (Math.floor((this.t - dt) / 0.12) !== Math.floor(this.t / 0.12)) {
        // the twin blades: two crescents chasing each other round her
        w.fx.arc(this.x, this.y, 0.95, sp.radius * 0.82, this.facing, TAU * 0.42, 1.0, col, 0.18, 1);
        w.fx.arc(this.x, this.y, 0.95, sp.radius * 0.82, this.facing + Math.PI, TAU * 0.42, 1.0, col, 0.18, 1);
        w.fx.ground(GROUND.shock, this.x, this.y, sp.radius * 0.9, sp.radius * 0.9, [col[0], col[1], col[2], 0.35], 0.2);
      }
      for (const e of w.enemies) {
        if (!e.alive || !e.targetable) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) > sp.radius + e.r) continue;
        const last = this.whirlHits.get(e) ?? -1;
        if (last >= 0 && this.t - last < sp.tick) continue;
        this.whirlHits.set(e, this.t);
        // the whirl's many small ticks flash softly, or every foe in reach would stay white
        hitFoe(w, e, sp.damage, { slot: 'special', knock: sp.knock, kx: e.x - this.x, ky: e.y - this.y, color: col, soft: true });
      }
      if (Math.floor((this.t - dt) / 0.16) !== Math.floor(this.t / 0.16)) w.hitProps(this.x, this.y, { shape: 'circle', range: sp.radius }, 0);
      const held = input.held('special');
      if ((this.t >= sp.minTime && !held) || this.t >= sp.maxTime) this.endSpecial();
      void mv;
    } else {
      if (!this.released && this.t >= sp.release) {
        this.released = true;
        w.shoot('wave', this.x + Math.cos(this.facing) * 0.6, this.y + Math.sin(this.facing) * 0.6, this.facing, sp.speed, sp.damage, sp.range, sp.radius, 'hero');
        w.audio.play(sp.sfx, { x: this.x, y: this.y });
        w.fx.shake(0.12);
      }
      if (this.t >= sp.time) {
        this.state = 'move';
        this.t = 0;
        this.specialCool = sp.cooldown;
      }
    }
  }

  endSpecial() {
    this.world.audio.loop('whirl', 'whirl', false);
    this.state = 'move';
    this.t = 0;
    this.specialCool = this.weapon.special.cooldown;
  }

  startCast(input) {
    this.state = 'cast';
    this.t = 0;
    this.castDone = false;
    this.casts--;
    this.facing = this.aimAngle(input);
    // the rune goes at the cursor (mouse) or a little ahead along the aim, toward a foe if one is near the line
    const w = this.world;
    const R = FEEL.cast.range;
    let tx;
    let ty;
    const a = input.aim;
    if (a.fromMouse) {
      const dx = a.x - this.x;
      const dy = a.y - this.y;
      const d = Math.hypot(dx, dy);
      const k = d > R ? R / d : 1;
      tx = this.x + dx * k;
      ty = this.y + dy * k;
    } else {
      let dist = 4.5;
      for (const e of w.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < R && Math.abs(angleDiff(this.facing, Math.atan2(e.y - this.y, e.x - this.x))) < 0.35 && d < dist + 2) dist = d;
      }
      tx = this.x + Math.cos(this.facing) * dist;
      ty = this.y + Math.sin(this.facing) * dist;
    }
    this.castAt = w.clampToFloor(tx, ty, this.x, this.y);
    w.audio.play('cast_rune', { x: this.x, y: this.y });
  }

  placeRune() {
    const m = this.mods;
    const c = this.castAt;
    this.world.strike('rune', c.x, c.y, FEEL.cast.damage, FEEL.cast.fuse, FEEL.cast.radius * m.castRadius, null);
  }

  // full animation names for the weapon in hand, built once per weapon (no strings per frame)
  names() {
    const w = this.weapon;
    if (this._namesFor !== w) {
      this._namesFor = w;
      const n = {};
      for (const a of ['idle', 'run', 'dash', 'hit', 'death', 'cast', 'special', 'attack1', 'attack2', 'attack3', 'dashstrike']) n[a] = `${w.prefix}_${a}`;
      this._names = n;
    }
    return this._names;
  }

  // ---- drawing
  draw(p, alpha) {
    const x = this.px + (this.x - this.px) * alpha;
    const y = this.py + (this.y - this.py) * alpha;
    const N = this.names();
    let anim = 'idle';
    let i = 0;
    const T = this.t;
    switch (this.state) {
      case 'move':
        if (this.speedNow > 1.2) {
          anim = 'run';
          i = p.frameAt(N.run, this.runClock || 0, true);
        } else i = p.frameAt(N.idle, this.animT, true);
        break;
      case 'attack':
      case 'dashstrike': {
        anim = this.move.anim;
        // the swing's hit frame shows the moment the blow lands
        i = p.frameKeyed(N[anim], T, this.move.hit, this.move.time);
        break;
      }
      case 'dash':
        anim = 'dash';
        i = p.frameOf(N.dash, T / D.time);
        break;
      case 'special':
        anim = 'special';
        if (this.weapon.special.kind === 'whirl') i = p.frameAt(N.special, T, true);
        else i = p.frameOf(N.special, T / this.weapon.special.time);
        break;
      case 'cast':
        anim = 'cast';
        i = p.frameOf(N.cast, T / 0.4);
        break;
      case 'hit':
        anim = 'hit';
        i = p.frameOf(N.hit, T / H.hurtStun);
        break;
      case 'dead':
        anim = 'death';
        i = p.frameAt(N.death, this.deathT, false);
        break;
    }
    const blink = this.iframes > 0 && this.state !== 'dash' && Math.floor(this.iframes * 20) % 2 === 0;
    // the whirl spins the body: its facing is the spin angle, the loop shows the turn
    const face = this.state === 'special' && this.weapon.special.kind === 'whirl' ? Math.PI / 2 : this.facing;
    const o = p.opt();
    o.flash = this.flash;
    o.alpha = blink ? 0.55 : 1;
    o.shadow = true;
    o.height = 1.9;
    o.dissolve = this.state === 'dead' ? clamp((this.deathT - 1.4) / 1.2, 0, 1) : 0;
    o.seed = 3.1;
    if (this.wardUp) {
      o.tr = 1.0;
      o.tg = 0.8;
      o.tb = 0.4;
      o.ta = 0.35;
    }
    p.actor(N[anim], face, i, x, y, 0, o);
    p.blob(x, y, 0.55, 0.55);
    // afterimages of the dash: her silhouette in moonlight
    for (const g of this.ghosts) {
      const k = 1 - g.t / 0.22;
      const pz = p.pose(N.dash, g.angle, p.frameOf(N.dash, g.k));
      if (!pz?.f) continue;
      const q = p.opt();
      q.tr = 0.45;
      q.tg = 0.75;
      q.tb = 1.3;
      q.ta = -0.55 * k;
      q.depthBias = -0.05;
      p.sprite(pz.f, pz.flip, g.x, g.y, 0, q);
    }
    // her own soft light so she never disappears into the dark
    p.light(x, y + 0.5, 1.8, 5, 0.5, 0.58, 0.78); // her own faint moonlight, so she reads on dark stone
    if (this.state === 'dash' || this.state === 'special') p.light(x, y, 1.2, 4.5, 0.4, 0.6, 0.9);
  }

  // per rendered frame: advance the run cycle in step with the ground speed (no foot sliding)
  animate(dt) {
    const speed = Math.max(this.speedNow, 0);
    // the run loop (10 frames @ 18 fps) covers about 4.2 m at full speed
    this.runClock = (this.runClock || 0) + dt * clamp(speed / (H.speed * this.mods.speed), 0.5, 1.3);
  }
}
