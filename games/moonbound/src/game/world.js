// One room in play: the heroine, foes, their telegraphed attacks (hazards),
// projectiles, Maelis's own delayed strikes (runes, falling stars, trails),
// pickups, traps, props and interactables. Stepped at a fixed 120 Hz with a
// hit-stop; drawn with interpolation. run.js (a run through a region) and
// hollow.js (the home base) drive it.
import { clamp, rng, TAU, SIN_E } from '../config.js';
import { FEEL } from './feel.js';
import { Flow } from './flow.js';
import { makeFoe } from './enemies/index.js';
import { hitFoe, hurtHero, inflict, inShape, healHero, COL } from './combat.js';
import { BURST, GROUND, GLOW } from '../fx/fx.js';

const DANGER_FILL = [1.0, 0.62, 0.22];

// keep the entries that pass, in order, in the same array (no new array per step)
function compact(arr, keep) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[w++] = arr[i];
  arr.length = w;
}
const BOSS_FILL = [1.0, 0.42, 0.16];

export class World {
  constructor(app) {
    this.app = app;
    this.audio = app.audio;
    this.input = app.input;
    this.fx = app.fx;
    this.settings = app.save.settings;
    this.time = 0;
    this.stopT = 0;
    this.room = null;
    this.region = null;
    this.hero = null;
    this.enemies = [];
    this.hazards = [];
    this.projectiles = [];
    this.strikes = [];
    this.pickups = [];
    this.interactables = [];
    this.spikes = [];
    this.arrowTraps = [];
    this.followers = [];
    this.marks = [];
    this.flow = new Flow();
    this.tmp = { x: 0, y: 0 };
    this.tmp2 = { x: 0, y: 0 };
    this.god = false;
    this.frozen = false;
    this.run = null;
    this.scene = null; // the run or the hollow: callbacks (onFoeKilled, onHeroDied, ...)
    this.darkness = 0;
    this.darkTarget = 0;
    this.near = null; // nearest interactable
    this.boss = null;
  }

  // ---- setup
  setRoom(room, region) {
    this.room = room;
    this.region = region;
    this.enemies.length = 0;
    this.hazards.length = 0;
    this.projectiles.length = 0;
    this.strikes.length = 0;
    this.pickups.length = 0;
    this.interactables.length = 0;
    this.followers.length = 0;
    this.marks.length = 0;
    this.boss = null;
    this.darkTarget = 0;
    for (const id of ['charge', 'whirl', 'fountain', 'cauldron']) this.audio.loop(id, id, false);
    this.spikes = room.spikes.map((s) => ({ ...s, state: 0, t: 0, hit: new Set() }));
    this.arrowTraps = room.arrowTraps.map((a, i) => ({ ...a, t: -1 - i * 0.7, warn: null }));
    this.flow.setRoom(room);
    this.fx.clear();
    this.buildFar();
  }

  // far ruins drifting in the void around the room (parallax)
  buildFar() {
    this.far = [];
    const kit = this.region.kit?.far;
    if (!kit) return;
    const R = this.room;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const left = i % 3 === 0;
      const right = i % 3 === 1;
      const par = 0.25 + rng.next() * 0.45; // how much it moves with the camera (less = farther)
      const x = left ? -6 - rng.next() * 10 : right ? R.w + 6 + rng.next() * 10 : rng.next() * R.w;
      const y = (i % 3 === 2 ? R.h + 4 + rng.next() * 6 : rng.next() * R.h * 1.1 - 4) * SIN_E;
      this.far.push({ frame: kit[i % kit.length], x, y, par, haze: 0.35 + (1 - par) * 0.6, scale: 1 + (1 - par) * 0.4, flip: rng.next() < 0.5 ? -1 : 1 });
    }
  }

  inputBlocked() {
    return this.app.ui.blocking() || this.frozen;
  }

  hitstop(t) {
    this.stopT = Math.max(this.stopT, t);
  }

  assistResist() {
    const s = this.app.save;
    if (!s.assist) return 0;
    return Math.min(0.8, 0.2 + 0.02 * (s.deaths || 0));
  }

  slotPatron(slot) {
    return this.run?.slotPatron(slot) || null;
  }

  toast(title, text) {
    this.app.ui.toast(title, text);
  }

  // ---- entities
  addFoe(kind, x, y, opts) {
    const f = makeFoe(this, kind, x, y, opts);
    this.enemies.push(f);
    if (f.boss) this.boss = f;
    this.app.codexSee('foes', kind);
    return f;
  }

  onFoeKilled(e) {
    this.scene?.onFoeKilled?.(e);
  }

  heroDied() {
    const h = this.hero;
    h.state = 'dead';
    h.alive = false;
    h.deathT = 0;
    this.audio.loop('whirl', 'whirl', false);
    this.audio.play('death');
    this.fx.flashScreen([0.4, 0.05, 0.08], 0.5, 1);
    this.scene?.onHeroDied?.();
  }

  bossPhase(e, n) {
    this.audio.phase(n);
    this.audio.stinger('boss_phase');
    this.fx.flashScreen([0.6, 0.9, 1.2], 0.35, 2);
    this.fx.shake(0.5);
    this.app.ui.bossPhase(e, n);
  }

  eclipse(on) {
    this.darkTarget = on ? 0.62 : 0;
  }

  // ---- hazards: telegraphed foe attacks
  hazard(o) {
    const h = { t: 0, cancelled: false, fired: false, follow: false, half: 0, width: 0, inner: 0, knock: 5, boss: false, ...o };
    this.hazards.push(h);
    return h;
  }

  // ---- projectiles
  shoot(kind, x, y, angle, speed, damage, range, radius, team, by = '') {
    const p = {
      kind,
      x,
      y,
      px: x,
      py: y,
      z: kind === 'arrow' ? 1.2 : kind === 'orb' ? 1.0 : kind === 'crescent' ? 1.1 : kind === 'wave' ? 0.6 : 1.0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle,
      damage,
      life: range / speed,
      t: 0,
      r: radius,
      team,
      by,
      hit: new Set(),
      pierce: kind === 'wave' || kind === 'crescent',
      seed: rng.next() * 10,
    };
    this.projectiles.push(p);
    return p;
  }

  // ---- Maelis's delayed strikes: kind rune | star | frostTrail | cometTrail
  strike(kind, x, y, damage, delay, radius, status = null) {
    const m = this.hero.mods;
    const s = { kind, x, y, damage, delay, radius, status, t: 0, style: kind === 'rune' ? m.castStyle : kind, done: false, hit: new Set(), seed: rng.next() * 10 };
    if (kind === 'frostTrail' || kind === 'cometTrail') s.delay = 0;
    this.strikes.push(s);
    if (kind === 'rune') {
      this.fx.burst(BURST.motes, x, y, 0.1, this.runeColour(s.style), 14, radius * 0.4);
      this.fx.light(x, y, 0.5, radius * 2, [1, 1.6, 2], 0.3);
    }
    return s;
  }

  runeColour(style) {
    return style === 'frost' ? COL.frost : style === 'dawn' ? COL.dawn : style === 'eclipse' ? COL.umbra : style === 'meteor' ? COL.comet : COL.moon;
  }

  inflictOn(e, k) {
    inflict(this, e, k, this.hero.mods);
  }

  // things that can be broken by a blow (urns)
  hitProps(x, y, shape, angle) {
    for (const p of this.room.props) {
      if (!p.breakable || !p.alive) continue;
      if (!inShape(shape, x, y, angle, p.x, p.y, 0.35)) continue;
      this.breakProp(p);
    }
  }

  breakProp(p) {
    p.alive = false;
    p.frame = this.region.kit.urnBroken || p.frame;
    p.r = 0;
    p.kind = 'decor';
    this.fx.burst(BURST.dust, p.x, p.y, 0.4, [0.55, 0.45, 0.35, 0.9], 14, 0.9);
    this.fx.burst(BURST.sparks, p.x, p.y, 0.5, [0.9, 0.7, 0.4, 1], 8, 0.6);
    this.audio.play('urn_break', { x: p.x, y: p.y });
    if (rng.next() < 0.55) this.spawnPickup('silver', p.x, p.y, 2 + Math.floor(rng.next() * 4));
    else if (rng.next() < 0.25) this.spawnPickup('soul', p.x, p.y, 4);
  }

  // small pickups that fly to her (silver, healing souls)
  spawnPickup(kind, x, y, amount) {
    const a = rng.next() * TAU;
    this.pickups.push({ kind, x, y, z: 0.6, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, vz: 4, amount, t: 0, magnet: false, seed: rng.next() * 10 });
  }

  decal(x, y, r) {
    this.marks.push({ x, y, r, t: 0 });
  }

  followFx(o, actor) {
    this.followers.push({ o, actor, dx: o.x - actor.x, dy: o.y - actor.y });
  }

  // ---- geometry helpers
  clampToFloor(tx, ty, fx, fy) {
    const r = this.room;
    // walk back along the line from the target toward the source until on walkable floor
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      const x = tx + (fx - tx) * k;
      const y = ty + (fy - ty) * k;
      if (r.floorAt(Math.floor(x), Math.floor(y)) && r.floorAt(Math.floor(x + 0.3), Math.floor(y)) && r.floorAt(Math.floor(x - 0.3), Math.floor(y))) return { x, y };
    }
    return { x: fx, y: fy };
  }

  clearLine(x0, y0, x1, y1) {
    return this.flow.clear(x0, y0, x1, y1);
  }

  // ---- interactables: {x, y, r, label, verb, act(), ok()}
  interact(o) {
    this.interactables.push(o);
    return o;
  }

  // ---- the step
  step(dt) {
    this.darkness += (this.darkTarget - this.darkness) * Math.min(1, dt * 0.8);
    if (this.stopT > 0) {
      this.stopT -= dt;
      return;
    }
    if (this.frozen) return;
    this.time += dt;
    const h = this.hero;
    h.update(dt, this.input);
    this.flow.update(h.x, h.y);
    for (const e of this.enemies) e.update(dt);
    let w = 0;
    for (const e of this.enemies) if (!e.gone) this.enemies[w++] = e;
    this.enemies.length = w;
    this.stepHazards(dt);
    this.stepProjectiles(dt);
    this.stepStrikes(dt);
    this.stepPickups(dt);
    this.stepTraps(dt);
    for (const f of this.followers) {
      f.o.x = f.actor.x + f.dx;
      f.o.y = f.actor.y + f.dy;
    }
    compact(this.followers, (f) => f.o.t < f.o.life);
    for (const m of this.marks) m.t += dt;
    compact(this.marks, (m) => m.t < 8);
    // nearest interactable
    let best = null;
    let bd = 1e9;
    for (const o of this.interactables) {
      if (o.ok && !o.ok()) continue;
      const d = Math.hypot(o.x - h.x, o.y - h.y);
      if (d < (o.r || 1.6) && d < bd) {
        bd = d;
        best = o;
      }
    }
    this.near = h.alive ? best : null;
    if (this.near && !this.inputBlocked() && this.input.take('interact', FEEL.buffer)) this.near.act();
    this.scene?.step?.(dt);
  }

  stepHazards(dt) {
    const h = this.hero;
    for (const z of this.hazards) {
      if (z.cancelled) continue;
      if (z.owner && !z.owner.alive) {
        z.cancelled = true;
        continue;
      }
      z.t += dt;
      if (!z.fired && z.t >= z.windup) {
        z.fired = true;
        z.flashT = 0;
        if (h.alive && z.damage > 0 && inShape(z, z.x, z.y, z.angle, h.x, h.y, h.r * 0.8)) {
          hurtHero(this, z.damage, { x: z.owner ? z.owner.x : z.x, y: z.owner ? z.owner.y : z.y, knock: z.knock, by: z.by });
        }
        // traps and big slams also hurt foes caught in them
        if (z.trap) {
          for (const e of this.enemies) if (e.alive && inShape(z, z.x, z.y, z.angle, e.x, e.y, e.r)) hitFoe(this, e, z.foeDamage || 20, { slot: 'trap', knock: 4, kx: e.x - z.x, ky: e.y - z.y });
        }
      }
      if (z.fired) z.flashT += dt;
    }
    compact(this.hazards, (z) => !z.cancelled && !(z.fired && z.flashT > 0.18));
  }

  stepProjectiles(dt) {
    const h = this.hero;
    const R = this.room;
    for (const p of this.projectiles) {
      p.px = p.x;
      p.py = p.y;
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'orb') {
        // soul orbs drift a little toward her
        const a = Math.atan2(h.y - p.y, h.x - p.x);
        const sp = Math.hypot(p.vx, p.vy);
        const cur = Math.atan2(p.vy, p.vx);
        let d = a - cur;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const na = cur + clamp(d, -0.5 * dt, 0.5 * dt);
        p.vx = Math.cos(na) * sp;
        p.vy = Math.sin(na) * sp;
      }
      p.angle = Math.atan2(p.vy, p.vx);
      const cx = Math.floor(p.x);
      const cy = Math.floor(p.y);
      const cell = R.at(cx, cy);
      const outside = cx < -3 || cy < -3 || cx > R.w + 3 || cy > R.h + 3;
      if ((cell === 3 && p.kind !== 'wave' && p.kind !== 'crescent') || outside || p.t >= p.life) {
        if (!outside && p.t < p.life) this.fx.burst(BURST.sparks, p.x, p.y, p.z, p.team === 'hero' ? COL.moon : [1.1, 0.7, 0.4, 1], 8, 0.6);
        p.dead = true;
        continue;
      }
      // props (pillars, statues) stop arrows and orbs
      if (p.kind === 'arrow' || p.kind === 'orb' || p.kind === 'bolt') {
        for (const pr of R.props) {
          if (!pr.alive || !pr.r || pr.r < 0.4 || pr.kind === 'wall' || pr.kind === 'decor') continue;
          if (Math.hypot(pr.x - p.x, pr.y - p.y) < pr.r) {
            p.dead = true;
            this.fx.burst(BURST.sparks, p.x, p.y, p.z, [1, 0.8, 0.5, 1], 6, 0.5);
            break;
          }
        }
        if (p.dead) continue;
      }
      if (p.team === 'hero') {
        for (const e of this.enemies) {
          if (!e.alive || !e.targetable || p.hit.has(e)) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) > e.r + p.r) continue;
          p.hit.add(e);
          const slot = p.kind === 'wave' ? 'special' : 'attack';
          hitFoe(this, e, p.damage, { slot, knock: p.kind === 'wave' ? 6 : 3, kx: p.vx, ky: p.vy, color: COL.moon });
          if (!p.pierce) {
            p.dead = true;
            break;
          }
        }
        if (p.kind === 'wave') this.hitProps(p.x, p.y, { shape: 'circle', range: p.r }, 0);
      } else {
        if (h.alive && Math.hypot(h.x - p.x, h.y - p.y) < h.r + p.r * 0.85) {
          if (h.invulnerable()) continue;
          hurtHero(this, p.damage, { x: p.x - p.vx, y: p.y - p.vy, knock: 4, by: p.by });
          this.audio.play(p.kind === 'orb' ? 'orb_hit' : 'arrow_hit', { x: p.x, y: p.y });
          if (!p.pierce) p.dead = true;
        }
        if (p.team === 'trap') {
          for (const e of this.enemies) {
            if (!e.alive || !e.targetable || p.hit.has(e)) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) > e.r + p.r) continue;
            p.hit.add(e);
            hitFoe(this, e, 18, { slot: 'trap', knock: 3, kx: p.vx, ky: p.vy });
            p.dead = true;
            break;
          }
        }
      }
    }
    compact(this.projectiles, (p) => !p.dead);
  }

  stepStrikes(dt) {
    const m = this.hero.mods;
    for (const s of this.strikes) {
      s.t += dt;
      if (s.kind === 'frostTrail' || s.kind === 'cometTrail') {
        for (const e of this.enemies) {
          if (!e.alive || !e.targetable || s.hit.has(e)) continue;
          if (Math.hypot(e.x - s.x, e.y - s.y) < s.radius + e.r) {
            s.hit.add(e);
            hitFoe(this, e, s.damage, { slot: 'dash', noStatus: true, quiet: true, color: s.kind === 'frostTrail' ? COL.frost : COL.comet });
            if (s.status) inflict(this, e, s.status, m);
          }
        }
        if (s.t > 0.9) s.done = true;
        continue;
      }
      if (s.kind === 'rune' && s.style === 'eclipse' && s.t < s.delay) {
        // drag foes toward the rune's heart
        for (const e of this.enemies) {
          if (!e.alive || e.boss) continue;
          const dx = s.x - e.x;
          const dy = s.y - e.y;
          const d = Math.hypot(dx, dy);
          if (d < s.radius * 1.6 && d > 0.3) {
            e.vx += (dx / d) * 30 * dt;
            e.vy += (dy / d) * 30 * dt;
          }
        }
      }
      if (!s.done && s.t >= s.delay) {
        s.done = true;
        this.burstStrike(s);
      }
    }
    compact(this.strikes, (s) => !s.done || s.t < s.delay + 0.05);
  }

  burstStrike(s) {
    const m = this.hero.mods;
    const col = s.kind === 'star' ? COL.comet : this.runeColour(s.style);
    const R = s.radius;
    const slot = s.kind === 'rune' ? 'cast' : s.kind === 'star' ? 'other' : 'cast';
    const big = s.kind === 'rune';
    this.fx.burst(BURST.motes, s.x, s.y, 0.2, col, 24, R * 0.8);
    this.fx.burst(BURST.sparks, s.x, s.y, 0.3, col, big ? 20 : 10, big ? 1.4 : 0.8);
    this.fx.burst(BURST.shatter, s.x, s.y, 0.4, [1.2, 1.4, 1.6, 1], big ? 14 : 6, R * 0.5);
    this.fx.ground(GROUND.shock, s.x, s.y, R * 1.15, R * 1.15, col, 0.4);
    this.fx.glow(GLOW.star, s.x, s.y, 0.6, R * 0.8, col, 0.25, { grow: 0.5 });
    this.fx.light(s.x, s.y, 1.0, R * 2.6, [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5], 0.35);
    if (s.style === 'meteor') {
      this.fx.burst(BURST.embers, s.x, s.y, 0.2, COL.comet, 24, 2);
      this.fx.burst(BURST.dust, s.x, s.y, 0.1, [0.5, 0.45, 0.42, 0.9], 20, 2);
    }
    this.audio.play(s.kind === 'star' ? 'rune_burst' : 'rune_burst', { x: s.x, y: s.y, rate: s.kind === 'star' ? 1.4 : 1, gain: big ? 1 : 0.6 });
    this.fx.shake(big ? 0.22 : 0.08);
    for (const e of this.enemies) {
      if (!e.alive || !e.targetable) continue;
      if (Math.hypot(e.x - s.x, e.y - s.y) > R + e.r) continue;
      hitFoe(this, e, s.damage, { slot, knock: s.style === 'meteor' ? m.castKnock : 3, kx: e.x - s.x, ky: e.y - s.y, color: col, heavy: big, quiet: !big });
      if (s.kind === 'rune') {
        if (m.castFreeze && !e.boss) {
          e.status.frozen = Math.max(e.status.frozen, m.castFreeze);
          e.status.chill = 0;
        }
        for (let i = 0; i < m.castUmbra; i++) inflict(this, e, 'umbra', m);
        for (const k of m.inflict.cast) inflict(this, e, k, m);
      }
    }
    if (s.kind === 'rune') this.hitProps(s.x, s.y, { shape: 'circle', range: R }, 0);
  }

  stepPickups(dt) {
    const h = this.hero;
    const clear = this.scene?.cleared?.() ?? true;
    for (const p of this.pickups) {
      p.t += dt;
      if (p.z > 0 || p.vz > 0) {
        p.vz -= 14 * dt;
        p.z = Math.max(0, p.z + p.vz * dt);
        if (p.z === 0) p.vz = 0;
      }
      p.vx *= Math.exp(-4 * dt);
      p.vy *= Math.exp(-4 * dt);
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (p.t > 0.5 && (d < 2.4 || (clear && p.t > 1.2))) p.magnet = true;
      if (p.magnet && h.alive) {
        const sp = 9 + p.t * 4;
        p.vx = ((h.x - p.x) / (d || 1)) * sp;
        p.vy = ((h.y - p.y) / (d || 1)) * sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (d < 0.5 && p.t > 0.3 && h.alive) {
        p.dead = true;
        if (p.kind === 'silver') {
          this.scene?.gainSilver?.(p.amount);
          this.audio.play('pickup_silver', { x: p.x, y: p.y, gain: 0.6 });
        } else if (p.kind === 'soul') {
          healHero(this, p.amount);
          this.audio.play('pickup_heartroot', { x: p.x, y: p.y, gain: 0.5, rate: 1.4 });
        }
      }
    }
    compact(this.pickups, (p) => !p.dead);
  }

  stepTraps(dt) {
    const h = this.hero;
    for (const s of this.spikes) {
      s.t += dt;
      const onIt = (x, y, r) => Math.abs(x - s.x) < 0.5 + r * 0.5 && Math.abs(y - s.y) < 0.5 + r * 0.5;
      if (s.state === 0) {
        let trig = h.alive && onIt(h.x, h.y, h.r);
        if (!trig) for (const e of this.enemies) if (e.alive && e.targetable && !e.def.flying && onIt(e.x, e.y, e.r)) trig = true;
        if (trig && s.t > 0.4) {
          s.state = 1;
          s.t = 0;
          s.hit.clear();
          this.audio.play('telegraph', { x: s.x, y: s.y, gain: 0.4, rate: 1.5 });
        }
      } else if (s.state === 1) {
        if (s.t >= 0.45) {
          s.state = 2;
          s.t = 0;
          this.audio.play('spikes', { x: s.x, y: s.y });
          this.fx.burst(BURST.dust, s.x, s.y, 0.05, [0.5, 0.48, 0.45, 0.6], 6, 0.6);
        }
      } else if (s.state === 2) {
        if (h.alive && !s.hit.has(h) && onIt(h.x, h.y, h.r * 0.6)) {
          s.hit.add(h);
          hurtHero(this, 10, { x: s.x, y: s.y - 0.01, knock: 2, by: 'Spike trap' });
        }
        for (const e of this.enemies) {
          if (!e.alive || e.def.flying || s.hit.has(e) || !onIt(e.x, e.y, e.r * 0.6)) continue;
          s.hit.add(e);
          hitFoe(this, e, 25, { slot: 'trap' });
        }
        if (s.t >= 0.7) {
          s.state = 3;
          s.t = 0;
        }
      } else if (s.state === 3 && s.t >= 0.25) {
        s.state = 0;
        s.t = 0;
      }
    }
    for (const a of this.arrowTraps) {
      a.t += dt;
      if (a.t >= 2.6 && !a.warn) {
        a.warn = this.hazard({ shape: 'line', x: a.x, y: a.y, angle: a.angle, range: 14, width: 0.45, windup: 0.75, damage: 0, by: 'Arrow trap', trap: true });
      }
      if (a.t >= 3.35) {
        a.t = 0;
        a.warn = null;
        this.shoot('arrow', a.x, a.y, a.angle, 18, 9, 16, 0.3, 'trap', 'Arrow trap');
        this.audio.play('trap_arrow', { x: a.x, y: a.y });
      }
    }
  }

  // ---- drawing
  draw(p, alpha, cam) {
    const R = this.room;
    const L = p.L;
    const t = this.time;
    // far ruins
    for (const f of this.far) {
      const fr = p.atlas.frame(f.frame);
      if (!fr) continue;
      const sc = f.scale;
      const x = f.x + cam.x * (1 - f.par);
      const y = f.y + cam.y * (1 - f.par) + Math.sin(t * 0.15 + f.x) * 0.3;
      const k = L.far.alloc();
      const D = L.far.data;
      D[k] = x;
      D[k + 1] = y;
      D[k + 2] = fr.w * sc * f.flip;
      D[k + 3] = fr.h * sc;
      D[k + 4] = fr.u0;
      D[k + 5] = fr.v0;
      D[k + 6] = fr.u1;
      D[k + 7] = fr.v1;
      D[k + 8] = fr.ox * sc;
      D[k + 9] = fr.oy * sc;
      D[k + 10] = fr.layer;
      D[k + 11] = 0;
      D[k + 12] = 0;
      D[k + 13] = 0;
      D[k + 14] = 1;
      D[k + 15] = 0;
      D[k + 16] = 0;
      D[k + 17] = 0;
      D[k + 18] = 0;
      D[k + 19] = f.haze;
    }
    // cliffs
    for (const c of R.cliffs) {
      const k = L.cliffs.alloc();
      const D = L.cliffs.data;
      D[k] = c.x0;
      D[k + 1] = c.x1;
      D[k + 2] = c.y;
      D[k + 3] = c.depth;
      D[k + 4] = c.seed;
      D[k + 5] = this.region.cliffLip ?? 1;
      D[k + 6] = 0;
      D[k + 7] = 0;
    }
    // props
    const lights = this.region.lights || {};
    for (const pr of R.props) {
      let frame = pr.frame;
      if (pr.anim) {
        const a = p.atlas.anim(pr.anim);
        if (a.n) {
          if (!pr.animFrames || pr.animFrames.length !== a.n) pr.animFrames = Array.from({ length: a.n }, (_, i) => `${pr.anim}_${i}`);
          frame = pr.animFrames[Math.floor((t + pr.phase * 3) * a.fps) % a.n];
        }
      }
      const o = p.opt();
      o.depthBias = pr.depth - pr.y;
      o.shadow = pr.shadow;
      o.noPlaceholder = pr.kind === 'wall' || pr.kind === 'decor' || pr.kind === 'banner' || pr.kind === 'rubble' || pr.kind === 'stairs' || pr.kind === 'gate';
      o.flip = pr.flip;
      p.prop(frame, pr.x, pr.y, pr.z, o);
      if (pr.light && lights[pr.light]) this.propLight(p, pr, lights[pr.light], t);
    }
    // spikes
    const kit = this.region.kit;
    if (kit.spikes && !kit.spikeFrames) kit.spikeFrames = [0, 1, 2, 3].map((i) => `${kit.spikes}_${i}`);
    for (const s of this.spikes) {
      const i = s.state === 0 ? 0 : s.state === 1 ? 1 : s.state === 2 ? (s.t < 0.06 ? 3 : 2) : 1;
      const o = p.opt();
      o.depthBias = -0.49;
      o.noPlaceholder = true;
      p.prop(kit.spikeFrames[i], s.x, s.y, 0, o);
      if (s.state === 1) p.ground(GROUND.circle, s.x, s.y, 0.6, 0.6, DANGER_FILL[0], DANGER_FILL[1], DANGER_FILL[2], 0.8, s.t / 0.45);
    }
    // arrow trap heads
    for (const a of this.arrowTraps) {
      const pz = p.pose(kit.arrowTrap, a.angle, 0);
      const o = p.opt();
      o.depthBias = 0.1;
      if (pz?.f) p.sprite(pz.f, pz.flip, a.x - Math.cos(a.angle) * 0.75, a.y - Math.sin(a.angle) * 0.75, 0, o);
      if (a.warn) p.glow(GLOW.glow, a.x, a.y, 1.0, 0.35, 1.2, 0.6, 0.2, Math.min(1, (a.t - 2.6) / 0.75));
    }
    // marks (craters)
    for (const m of this.marks) p.ground(GROUND.mark, m.x, m.y, m.r, m.r, 0.0, 0.0, 0.0, 0, m.t / 8);
    // hazards (telegraphs)
    for (const z of this.hazards) {
      const k = clamp(z.t / z.windup, 0, 1);
      const col = z.boss ? BOSS_FILL : DANGER_FILL;
      const a = z.fired ? 1 - z.flashT / 0.18 : 0.75 + 0.25 * k;
      const kind = z.shape === 'circle' ? GROUND.circle : z.shape === 'arc' ? GROUND.cone : z.shape === 'line' ? GROUND.line : GROUND.ring;
      const prog = z.fired ? 1 : k;
      if (kind === GROUND.line) {
        const c = Math.cos(z.angle);
        const s = Math.sin(z.angle);
        const half = z.range / 2;
        p.ground(kind, z.x + c * half, z.y + s * half, half, z.width / 2, col[0], col[1], col[2], a, prog, z.angle);
      } else if (kind === GROUND.ring) p.ground(kind, z.x, z.y, z.range, z.range, col[0], col[1], col[2], a, prog, 0, 0, z.inner / z.range);
      else if (kind === GROUND.cone) p.ground(kind, z.x, z.y, z.range, z.range, col[0], col[1], col[2], a, prog, z.angle, 0, z.half);
      else p.ground(kind, z.x, z.y, z.range, z.range, col[0], col[1], col[2], a, prog);
      if (z.fired) p.light(z.x, z.y, 0.5, z.range * 1.5, 1.4 * a, 0.7 * a, 0.25 * a);
    }
    // the heroine's strikes
    for (const s of this.strikes) {
      const col = s.kind === 'star' ? COL.comet : this.runeColour(s.style);
      if (s.kind === 'frostTrail' || s.kind === 'cometTrail') {
        const k = s.t / 0.9;
        p.ground(GROUND.pool, s.x, s.y, s.radius, s.radius, col[0], col[1], col[2], 0.7 * (1 - k), 0);
        if (s.kind === 'cometTrail') p.glow(GLOW.flame, s.x, s.y, 0, 0.35 * (1 - k), col[0], col[1], col[2], 0.8 * (1 - k), s.seed, 0, 0, 0, true);
        continue;
      }
      if (s.done) continue;
      const k = clamp(s.t / s.delay, 0, 1);
      if (s.kind === 'rune') {
        p.ground(GROUND.rune, s.x, s.y, s.radius, s.radius, col[0], col[1], col[2], 1, k, 0, s.seed);
        p.light(s.x, s.y, 0.4, s.radius * 2.2, col[0] * k * 1.2, col[1] * k * 1.2, col[2] * k * 1.2);
        if (s.style === 'meteor') p.glow(GLOW.bolt, s.x - 3 * (1 - k), s.y, 9 * (1 - k) + 0.3, 0.8, col[0], col[1], col[2], 1, s.seed);
      } else {
        // a star falling
        p.ground(GROUND.circle, s.x, s.y, s.radius, s.radius, col[0], col[1], col[2], 0.55, k);
        p.glow(GLOW.star, s.x, s.y, 6 * (1 - k) + 0.3, 0.7, col[0], col[1], col[2], 1, s.seed);
      }
    }
    // projectiles
    for (const pj of this.projectiles) {
      const x = pj.px + (pj.x - pj.px) * alpha;
      const y = pj.py + (pj.y - pj.py) * alpha;
      const sa = Math.atan2(Math.sin(pj.angle) * SIN_E, Math.cos(pj.angle));
      if (pj.kind === 'arrow') {
        p.glow(GLOW.arrow, x, y, pj.z, 0.55, 1.2, 0.75, 0.35, 1, pj.seed, 0.6, sa);
        p.light(x, y, pj.z, 2.2, 0.6, 0.4, 0.15);
      } else if (pj.kind === 'orb') {
        p.glow(GLOW.orb, x, y, pj.z, 0.42, 0.35, 1.15, 0.95, 1, pj.seed);
        p.light(x, y, pj.z, 2.6, 0.25, 0.9, 0.75);
      } else if (pj.kind === 'bolt') {
        p.glow(GLOW.bolt, x, y, pj.z, 0.45, 0.6, 0.95, 1.4, 1, pj.seed, 0.8, sa);
        p.light(x, y, pj.z, 3.5, 0.6, 1.0, 1.5);
      } else if (pj.kind === 'wave' || pj.kind === 'crescent') {
        const hero = pj.kind === 'wave';
        const R2 = pj.r;
        const cx = x - Math.cos(pj.angle) * R2 * 0.8;
        const cy = y - Math.sin(pj.angle) * R2 * 0.8;
        const c = hero ? [0.55, 0.95, 1.4] : [0.4, 1.25, 1.15];
        const fade = Math.min(1, (pj.life - pj.t) / 0.15);
        L.arcs.push16(cx, cy, pj.z, R2 * 0.85, c[0], c[1], c[2], fade, pj.angle - 1.05, 2.1, hero ? 0.55 : 0.45, 0.6, 1, pj.seed, 0, 0);
        p.light(x, y, pj.z, 4, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
      }
    }
    // pickups
    for (const pk of this.pickups) {
      if (pk.kind === 'silver') {
        const o = p.opt();
        o.scale = 0.6;
        o.noPlaceholder = true;
        p.prop('pk_silver', pk.x, pk.y, pk.z, o);
        p.glow(GLOW.glow, pk.x, pk.y, pk.z + 0.15, 0.25, 0.9, 0.9, 1.0, 0.5);
      } else p.glow(GLOW.orb, pk.x, pk.y, pk.z + 0.4 + Math.sin(pk.t * 5) * 0.08, 0.3, 0.6, 0.45, 1.3, 1, pk.seed);
    }
    // foes and the heroine
    for (const e of this.enemies) e.draw(p, alpha);
    this.hero.draw(p, alpha);
    this.scene?.draw?.(p, alpha);
  }

  propLight(p, pr, L, t) {
    const fl = 1 - L.flicker * 0.25 + Math.sin(t * 11 + pr.phase * 20) * L.flicker * 0.12 + Math.sin(t * 23.7 + pr.phase * 7) * L.flicker * 0.08;
    if (pr.lightGen !== p.atlas.generation) {
      // where the light sits, from the sprite's anchors (cached per prop): every flame glows, but flames close
      // together (a cluster of candles) share one light, so a candle cluster lights the floor like one lamp
      const lights = p.atlas.value('lights', pr.frame);
      const anc = p.atlas.anchor('light', pr.frame);
      pr.lightPts = lights || (anc ? [anc] : [[0, 0, L.z]]);
      const cl = [];
      for (const q of pr.lightPts) {
        let c = cl.find((c) => Math.hypot(c[0] / c[3] - q[0], c[1] / c[3] - q[1]) < 1.5);
        if (!c) cl.push((c = [0, 0, 0, 0]));
        c[0] += q[0];
        c[1] += q[1];
        c[2] += q[2];
        c[3]++;
      }
      pr.lightClusters = cl.map((c) => [c[0] / c[3], c[1] / c[3], c[2] / c[3]]);
      pr.lightGen = p.atlas.generation;
    }
    const pts = pr.lightPts;
    const cls = pr.lightClusters;
    const k = 1 / Math.sqrt(cls.length);
    for (const q of cls) p.light(pr.x + q[0], pr.y + q[1], q[2] + 0.2, L.r * k, L.c[0] * fl * k, L.c[1] * fl * k, L.c[2] * fl * k);
    if (L.flame) for (const q of pts) p.glow(L.flame, pr.x + q[0], pr.y + q[1], q[2] - 0.05, L.fs, L.c[0] * 0.38, L.c[1] * 0.38, L.c[2] * 0.38, 1, pr.phase * 10 + q[0]);
    if (pr.kind === 'brazier' && rng.next() < 0.04) this.fx.burst(BURST.embers, pr.x + (pts[0]?.[0] || 0), pr.y + (pts[0]?.[1] || 0), (pts[0]?.[2] || 1.3) + 0.2, [L.c[0] * 0.6, L.c[1] * 0.6, L.c[2] * 0.6, 1], 3, 0.6);
  }
}
