// One run through a chapter: the hero, the horde, every bullet, gem, pickup,
// crate and barrel, the waves, levelling up and the rewards. Stepped at a
// fixed 60 Hz by main.js; everything lives in typed-array pools so a field of
// 1500 creatures and thousands of bullets and particles allocates nothing per
// frame. The field's width follows the screen (config.js setField): spawn
// counts, hero speed, weapon reach and drops scale with it (FIELD.s, c, r).
import { ARENA, BAND, FIELD, STEP, clamp, rnd, rand, randi, chance, TAU } from '../config.js';
import { Enemies, TYPES, T, WALK, HEADLESS, BOSS } from './enemies.js';
import { Grid } from './grid.js';
import { Bullets, Shots, Bombs, Gems, Pickups, Barrels, PICKUPS, PICKUP_COL, CRATE, SURGES, CRATE_GUNS } from './pools.js';
import { WEAPONS, STAR_DMG, STAR_RATE, STAR_SIZE, baseStats, drawCards, applyCard } from './upgrades.js';
import { CHAPTERS, waveReward } from './chapters.js';
import { Ogre } from './boss.js';
import { Particles, HOT, UNDER, BOLT, SPARK, SMOKE, FIRE, GLOW } from '../fx/particles.js';
import { Gore } from '../fx/gore.js';
import { Numbers } from '../fx/numbers.js';

// damage flags
const CRIT = 1; // may crit
const PROC = 2; // may trigger on-hit effects (explode, chain, freeze)
const BLAST = 4; // came from an explosion
const SHOCK = 8; // lightning
const ICE = 16;
const QUIET = 32; // no number, sound or big spurt (flame ticks)
const BURN = 64; // fire: the kill burns the body up

const SURGE_TIME = 8; // seconds a power surge lasts
const RAGE_COL = [2.4, 0.55, 0.2]; // rage shots burn red-orange
const CRATE_LIFE = 9; // an unwanted crate fades out at the end of this

const HERO_R = 22;
// kill streaks (counts scale with the field; tiers from 2 up drop a power-surge orb)
const STREAKS = [
  [15, 'MASSACRE!'],
  [35, 'BLOODBATH!'],
  [70, 'CARNAGE!'],
  [120, 'UNSTOPPABLE!'],
  [200, 'GODLIKE!'],
];
// the two powers, both on the mouse: left click a bomb, right click a shield
const ABILITIES = {
  bomb: { max: 3, period: 7 },
  shield: { max: 2, period: 16 },
};

export const xpNext = (level) => Math.round(40 + 26 * level + 2.5 * level * level);

export class Run {
  constructor(app) {
    this.app = app;
    this.q = app.q;
    this.sound = app.sound;
    this.atlas = app.atlas;
    this.events = app.events;
    this.enemies = new Enemies(2400);
    this.grid = new Grid(-80, -700, FIELD.max + 80, ARENA.h + 120, 48, 2400);
    this.bullets = new Bullets(6000);
    this.shots = new Shots(900);
    this.bombs = new Bombs(16);
    this.gems = new Gems(4000);
    this.pickups = new Pickups(48);
    this.barrels = new Barrels(64);
    this.obstacles = null; // wrecks in play: boxes of centre x, y, half width, half depth (main.js)
    this.arms = { blaster: 1, scatter: 0, rocket: 0, flamer: 0 };
    this.held = 'blaster';
    this.evo = {};
    this.surge = { overdrive: 0, triple: 0, rage: 0 };
    this.fx = new Particles(app.q.particles);
    this.gore = new Gore(app.q.gibs, this.fx, app.atlas);
    this.numbers = new Numbers(app.q.numbers);
    this.hero = { x: 360, y: 1120, px: 360, py: 1120, vx: 0, vy: 0, hp: 100, inv: 0, shield: 0, alive: true, anim: 0, moving: 0, throwT: 0, fireT: 0, hurtT: 0 };
    this.target = { x: 360, y: 1120 };
    this.anchors = {};
    this.time = 0;
    this.boss = null;
    this.chainMark = new Int32Array(this.enemies.cap);
    this.chainId = 0;
  }

  anchor(kind, name, fallback) {
    return this.atlas.anchor(kind, name, fallback);
  }

  pan(x) {
    return clamp((x - ARENA.w / 2) / (ARENA.w / 2), -1, 1);
  }

  setObstacles(ob) {
    this.obstacles = ob && ob.length ? ob : null;
  }

  // the gun a crate slot fires now (the Blaster may have evolved into the Railgun)
  gun(id = this.held) {
    return this.evo[id] || id;
  }

  // the HUD's weapon list: the held gun first, then the others found this run
  get weapons() {
    const out = [{ id: this.gun(), stars: this.arms[this.held] }];
    for (const id of CRATE_GUNS) if (id !== this.held && this.arms[id] > 0) out.push({ id: this.gun(id), stars: this.arms[id] });
    return out;
  }

  // ---------------------------------------------------------------- start
  start(chapter = 0, meta = {}, opts = {}) {
    this.chapter = CHAPTERS[chapter];
    this.chapterIndex = chapter;
    this.meta = meta;
    this.stats = baseStats(meta);
    this.levels = {};
    this.evolved = {};
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpNext(1);
    this.pendingLevels = 0;
    this.pendingChests = 0;
    this.kills = 0;
    this.waveKills = 0;
    this.coins = 0;
    this.time = 0;
    this.streak = 0;
    this.streakT = 0;
    this.streakTier = 0;
    this.gemChain = 0;
    this.gemChainT = 0;
    this.magnetAll = 0;
    this.timeSlow = 1;
    this.aim = -Math.PI / 2;
    this.aimDown = false;
    this.freezeAllT = 0;
    this.trauma = 0;
    this.stopT = 0;
    this.slowmo = 0;
    this.headlessCount = 0;
    this.hitsTaken = 0;
    this.god = false;
    const start = meta.startWeapon && CRATE_GUNS.includes(meta.startWeapon) ? meta.startWeapon : 'blaster';
    // one gun in hand; every gun keeps its own stars (0 = not found yet)
    this.arms = { blaster: 0, scatter: 0, rocket: 0, flamer: 0 };
    this.arms[start] = 1;
    this.held = start;
    this.evo = {};
    this.wTimer = 0.2;
    this.flameT = 0;
    this.flameLv = 0;
    this.flameTick = 0;
    this.burning = 0;
    this.burnDps = 0;
    this.surge = { overdrive: 0, triple: 0, rage: 0 };
    this.blastBudget = 0;
    this.stepN = 0;
    this.abil = {};
    for (const [k, a] of Object.entries(ABILITIES)) this.abil[k] = { charges: a.max, max: a.max, cd: 0, period: a.period, recharge: 0, active: 0 };
    if (meta.bombs) this.abil.bomb.max += meta.bombs;
    const h = this.hero;
    h.x = h.px = ARENA.w / 2;
    h.y = h.py = 1120;
    h.vx = h.vy = 0;
    h.hp = this.stats.maxHp;
    h.inv = 0;
    h.shield = 0;
    h.alive = true;
    h.throwT = 0;
    this.target.x = h.x;
    this.target.y = h.y;
    for (const p of [this.enemies, this.bullets, this.shots, this.bombs, this.gems, this.pickups, this.barrels, this.fx, this.gore, this.numbers]) p.reset();
    this.boss = null;
    this.wave = opts.wave ?? 0;
    this.phase = 'intro';
    this.phaseT = 1.6;
    this.beginWave(this.wave);
  }

  // ---------------------------------------------------------------- waves
  beginWave(w) {
    this.wave = w;
    const W = this.chapter.waves[w];
    this.script = W.events.slice().sort((a, b) => a.t - b.t);
    this.scriptI = 0;
    this.streams = [];
    this.waveT = 0;
    this.waveKills = 0;
    this.phase = 'intro';
    this.phaseT = 1.6;
    this.mopUp = false;
    // later waves are tougher and quicker
    this.hpMul = (1 + 0.4 * w + 0.2 * w * w) * (1 + 0.6 * this.chapterIndex);
    this.spdMul = 1 + 0.05 * w;
    this.events.banner?.(`WAVE ${w + 1}`, W.name);
    this.sound.waveStart(w + 1);
    this.sound.music(W.boss ? 'boss' : 'battle');
    if (W.barrels) this.placeBarrels(W.barrels, true);
  }

  scriptDone() {
    return this.scriptI >= this.script.length && this.streams.every((s) => this.waveT >= s.until);
  }

  runScript(dt) {
    this.waveT += dt;
    const t = this.waveT;
    while (this.scriptI < this.script.length && this.script[this.scriptI].t <= t) {
      const e = this.script[this.scriptI++];
      if (e.group) this.spawnGroup(e.group, e.n, e.pattern, e.elite);
      else if (e.stream) this.streams.push({ type: e.stream, from: e.t, until: e.until, every: e.every, n: e.n || 1, next: e.t });
      else if (e.pickup) this.dropPickup(e.pickup, rand(90, ARENA.w - 90), this.top() - 30);
      else if (e.barrels) this.placeBarrels(e.barrels, false);
      else if (e.boss) this.spawnBoss(e.boss);
    }
    for (const s of this.streams) {
      if (t >= s.until || t < s.next) continue;
      const span = Math.min(60, s.until - s.from);
      const k = clamp((t - s.from) / span, 0, 1);
      const every = Array.isArray(s.every) ? s.every[0] + (s.every[1] - s.every[0]) * k : s.every;
      // a wider field streams in more often
      s.next = t + (every / FIELD.c) * rand(0.7, 1.3);
      this.spawnGroup(s.type, s.n, s.n > 1 ? 'swarm' : 'random', 0, false);
    }
  }

  // the top edge of the view in world units (taller phones show more road)
  top() {
    return Math.min(0, this.app.viewTop ?? 0) - 40;
  }

  // n is for the old 720-wide road; a wider field gets proportionally more (scale = false: as given)
  spawnGroup(type, n, pattern = 'random', elite = 0, scale = true) {
    const t = typeof type === 'string' ? T[type] : type;
    const top = this.top();
    const W = ARENA.w;
    const R = FIELD.r;
    if (scale) n = Math.max(1, Math.round(n * FIELD.c));
    const cx = rand(120 * R, W - 120 * R);
    const per = Math.round(12 * FIELD.s);
    for (let k = 0; k < n; k++) {
      let x;
      let y = top - rand(0, 60);
      switch (pattern) {
        case 'line':
          x = ((k + 0.5) / n) * (W - 60) + 30 + rand(-15, 15);
          break;
        case 'wall':
          x = ((k % per) + 0.5) * (W / per) + rand(-12, 12);
          y = top - Math.floor(k / per) * 42 - rand(0, 20);
          break;
        case 'cluster':
          x = cx + (rnd() + rnd() - 1) * 90 * R;
          y = top - rand(0, 140);
          break;
        case 'flank':
          x = k % 2 ? rand(20, 150) : rand(W - 150, W - 20);
          y = top - rand(0, 160);
          break;
        case 'center':
          x = W / 2 + rand(-60, 60) * R;
          break;
        case 'swarm':
          x = cx + (rnd() - 0.5) * 420 * R;
          y = top - rand(0, 220);
          break;
        default:
          x = rand(30, W - 30);
          y = top - rand(0, 100);
      }
      this.enemies.spawn(t, clamp(x, 16, W - 16), y, this.hpMul, elite && k === 0 ? 1 : 0, this.spdMul);
    }
  }

  spawnBoss(key) {
    // a wide field makes the guns stronger but spreads their fire; the boss is one target, so it gains less
    const i = this.enemies.spawn(T[key], ARENA.w / 2, this.top() - 120, (1 + 0.6 * this.chapterIndex) * FIELD.r ** 0.75);
    if (i < 0) return;
    this.boss = new Ogre(this, i);
    this.bossChunk = 0.8; // a weapon crate each time it loses a fifth of its health
    this.sound.bossRoar();
    this.shake(0.4);
  }

  placeBarrels(n, initial) {
    const B = this.barrels;
    n = Math.round(n * FIELD.c);
    for (let k = 0; k < n; k++) {
      const i = B.take();
      if (i < 0) return;
      B.x[i] = B.px[i] = rand(60, ARENA.w - 60);
      B.ty[i] = rand(180, 780);
      B.y[i] = B.py[i] = initial ? B.ty[i] : this.top() - rand(0, 200);
      B.vy[i] = initial ? 0 : 260;
      B.hp[i] = 22;
      B.fuse[i] = 0;
      B.flash[i] = 0;
      B.rot[i] = rand(-0.2, 0.2);
    }
  }

  // ---------------------------------------------------------------- the step
  step(dt) {
    this.time += dt;
    this.stepN++;
    this.blastBudget = 14; // rage and explosive rounds: at most this many extra blasts a step
    const W = this.chapter.waves[this.wave];
    // wave flow
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'fight';
    } else if (this.phase === 'fight') {
      this.runScript(dt);
      // once the script has run, the last few stragglers rush the hero (no hunting them across a wide field)
      this.mopUp = !W.boss && this.scriptDone() && this.enemies.n <= Math.round(10 * FIELD.c);
      const bossDead = W.boss && this.boss && !this.enemies.alive[this.boss.i];
      if ((!W.boss && this.scriptDone() && this.enemies.n === 0) || bossDead) {
        this.phase = 'clear';
        this.phaseT = W.boss ? 3.2 : 1.6;
        this.magnetAll = 3;
      }
    } else if (this.phase === 'clear') {
      this.phaseT -= dt;
      if (this.phaseT <= 0 && this.gems.n === 0) {
        this.phase = 'reward';
        const rw = waveReward(this.chapter, this.wave, this.waveKills, FIELD.c);
        this.coins += rw.coins;
        let weapon = null;
        if (rw.star) {
          // a star for the gun in hand, or the best gun below three stars
          let id = this.held;
          if (this.arms[id] >= 3) id = CRATE_GUNS.filter((g) => this.arms[g] > 0 && this.arms[g] < 3).sort((a, b) => this.arms[b] - this.arms[a])[0];
          if (id) {
            this.arms[id]++;
            weapon = { id: this.gun(id), name: WEAPONS[this.gun(id)].name, stars: this.arms[id], isNew: false };
          }
        }
        this.reward = { wave: this.wave + 1, waves: this.chapter.waves.length, coins: rw.coins, xp: rw.xp, weapon, chest: false, last: this.wave === this.chapter.waves.length - 1 };
        this.events.waveComplete?.(this.reward);
      }
    }
    if (this.phase === 'dead') {
      this.phaseT -= dt;
      if (this.phaseT <= 0 && !this.deathShown) {
        this.deathShown = true;
        this.events.death?.();
      }
    }
    this.updateHero(dt);
    this.updateAbilities(dt);
    // the grid of creature feet, for hits, separation and blasts
    const E = this.enemies;
    this.grid.build(E.list, E.n, E.x, E.y);
    this.timeSlow = this.freezeAllT > 0 ? 0.5 : 1;
    E.update(dt, this);
    if (this.boss) this.boss.update(dt);
    this.updateHeadless(dt);
    this.updateBurn(dt);
    this.updateSurges(dt);
    this.flameLv = 0;
    if (this.hero.alive) this.fireWeapons(dt);
    this.updateBullets(dt);
    this.updateShots(dt);
    this.updateBombs(dt);
    this.updateBarrels(dt);
    this.updateGems(dt);
    this.updatePickups(dt);
    this.fx.update(dt);
    this.gore.update(dt);
    this.numbers.update(dt);
    // streaks
    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) {
        this.streak = 0;
        this.streakTier = 0;
      }
    }
    if (this.gemChainT > 0) this.gemChainT -= dt;
    else this.gemChain = 0;
    if (this.magnetAll > 0) this.magnetAll -= dt;
    if (this.freezeAllT > 0) this.freezeAllT -= dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    // the sound follows how full the field is
    this.sound.setIntensity(clamp(E.n / (220 * FIELD.c), 0, 1));
    if (!this.demo) this.sound.flame?.(this.flameLv);
  }

  // ---------------------------------------------------------------- hero
  updateHero(dt) {
    const h = this.hero;
    h.px = h.x;
    h.py = h.y;
    if (!h.alive) return;
    const s = this.stats;
    h.inv = Math.max(0, h.inv - dt);
    h.throwT = Math.max(0, h.throwT - dt);
    h.hurtT = Math.max(0, h.hurtT - dt);
    if (h.shield > 0) {
      h.shield -= dt;
      this.abil.shield.active = h.shield / s.shieldTime;
      if (h.shield <= 0) {
        this.abil.shield.active = 0;
        this.sound.shieldDown();
      }
    }
    if (s.regen > 0 && h.hp < s.maxHp) h.hp = Math.min(s.maxHp, h.hp + s.regen * dt);
    // glide toward the cursor: an eased pull, capped speed and acceleration, so dodging takes skill
    const tx = clamp(this.target.x, BAND.x0, BAND.x1);
    const ty = clamp(this.target.y, BAND.y0, BAND.y1);
    const dx = tx - h.x;
    const dy = ty - h.y;
    // crossing the field takes about as long on any screen
    const maxSp = 930 * s.move * FIELD.s;
    let wx = dx * 24;
    let wy = dy * 24;
    const wl = Math.hypot(wx, wy);
    if (wl > maxSp) {
      wx = (wx / wl) * maxSp;
      wy = (wy / wl) * maxSp;
    }
    const acc = 14000 * s.move * FIELD.s * dt;
    const ax = wx - h.vx;
    const ay = wy - h.vy;
    const al = Math.hypot(ax, ay);
    if (al > acc) {
      h.vx += (ax / al) * acc;
      h.vy += (ay / al) * acc;
    } else {
      h.vx = wx;
      h.vy = wy;
    }
    h.x = clamp(h.x + h.vx * dt, BAND.x0, BAND.x1);
    h.y = clamp(h.y + h.vy * dt, BAND.y0, BAND.y1);
    const sp = Math.hypot(h.vx, h.vy);
    h.moving = sp > 40 ? 1 : 0;
    h.anim += dt * (h.moving ? 10 * Math.min(1.4, sp / 380 + 0.5) : 2);
    // the shield shoves and grinds whatever touches it
    if (h.shield > 0) this.blast(h.x, h.y - 20, 70, 40 * dt * 6, 260, 'shield');
  }

  hitHero(dmg, sx, sy) {
    const h = this.hero;
    if (!h.alive || this.calm()) return;
    if (h.shield > 0) {
      this.sound.shieldHit();
      this.fx.flash(h.x, h.y - 30, 30, 60, 0.6, 1.2, 2.4, 0.1);
      return;
    }
    if (h.inv > 0 || this.god) return;
    this.hitsTaken++;
    h.hp -= dmg;
    h.inv = 0.55;
    h.hurtT = 0.3;
    this.numbers.add(h.x, h.y - 80, dmg, 2);
    const dx = h.x - sx;
    const dy = h.y - sy;
    const d = Math.hypot(dx, dy) || 1;
    this.fx.blood(h.x, h.y, 40, dx / d, dy / d, 10, 300, [0.42, 0.015, 0.02], 1);
    h.vx += (dx / d) * 380;
    h.vy += (dy / d) * 380;
    this.shake(0.35);
    this.app.hurtFlash?.();
    this.sound.hurt();
    if (h.hp <= 0) this.heroDeath(dx / d, dy / d);
  }

  heal(n) {
    const h = this.hero;
    const before = h.hp;
    h.hp = Math.min(this.stats.maxHp, h.hp + n);
    if (h.hp > before) this.numbers.add(h.x, h.y - 80, h.hp - before, 3);
  }

  heroDeath(dx, dy) {
    const h = this.hero;
    h.hp = 0;
    h.alive = false;
    h.shield = 0;
    // the hero comes apart too
    const col = [0.42, 0.015, 0.02];
    this.gore.burst(['hero_head', 'hero_arm', 'hero_arm', 'hero_leg', 'hero_leg', 'hero_torso', 'gib_meat_0', 'gib_meat_2', 'gib_bone_1'], h.x, h.y, 40, 380, col, dx, dy);
    this.fx.blood(h.x, h.y, 40, dx, dy, 60, 500, col, 3.1);
    this.fx.mist(h.x, h.y, 40, col, 40, 4);
    this.fx.splat(h.x, h.y, 50, 0.32, 0.01, 0.015, 0.95, 0);
    this.sound.death();
    this.shake(1);
    this.slowmo = 1.4;
    this.phase = 'dead';
    this.phaseT = 1.6;
    this.deathShown = false;
  }

  // ---------------------------------------------------------------- abilities
  updateAbilities(dt) {
    for (const k in this.abil) {
      const a = this.abil[k];
      if (a.charges < a.max) {
        a.cd += dt / (a.period * this.stats.cooldown);
        if (a.cd >= 1) {
          a.cd = 0;
          a.charges++;
        }
        a.recharge = a.cd;
      } else {
        a.cd = 0;
        a.recharge = 0;
      }
    }
  }

  useAbility(key, tx, ty) {
    const a = this.abil[key];
    const h = this.hero;
    if (!a || !h.alive || this.calm() || this.phase === 'dead') return false;
    if (a.charges <= 0) return false;
    if (key === 'shield' && h.shield > 0) return false;
    a.charges--;
    if (key === 'bomb') {
      const B = this.bombs;
      const i = B.take();
      if (i < 0) return false;
      const hand = this.anchor('hand', 'hero', [-14, -60]);
      B.x0[i] = h.x + hand[0];
      B.y0[i] = h.y + hand[1] * 0.4;
      B.x1[i] = clamp(tx, 20, ARENA.w - 20);
      B.y1[i] = clamp(ty, this.top() + 60, BAND.y1);
      B.t[i] = 0;
      B.dur[i] = 0.32 + Math.hypot(B.x1[i] - B.x0[i], B.y1[i] - B.y0[i]) / 2600;
      B.kind[i] = 0;
      h.throwT = 0.3;
      this.sound.bombThrow();
    } else if (key === 'shield') {
      h.shield = this.stats.shieldTime;
      a.active = 1;
      this.sound.shieldUp();
      this.blast(h.x, h.y - 20, 170, 30, 900, 'shield');
      this.fx.ring(h.x, h.y - 20, 30, 170, 0.6, 1.4, 3, 0.35);
    }
    return true;
  }

  // lightning from the sky onto the thickest part of the horde, chaining on
  lightningStrike() {
    const E = this.enemies;
    let best = -1;
    let bestN = -1;
    for (let k = 0; k < Math.min(40, E.n); k++) {
      const i = E.list[Math.floor(rnd() * E.n)];
      if (E.dying[i]) continue;
      const n = this.countNear(E.x[i], E.y[i], 120);
      if (n > bestN) {
        bestN = n;
        best = i;
      }
    }
    const x = best >= 0 ? E.x[best] : rand(100, ARENA.w - 100);
    const y = best >= 0 ? E.y[best] : rand(200, 600);
    this.fx.beam(x + rand(-40, 40), this.top() - 200, x, y - 20, 16, 1.2, 1.6, 3, 0.25, 1);
    this.fx.beam(x + rand(-80, 80), this.top() - 200, x, y - 20, 9, 1.2, 1.6, 3, 0.2, 1);
    this.fx.flash(x, y, 20, 220, 1.5, 2, 4, 0.2);
    this.fx.light(x, y, 120, 800, 3, 4, 6, 0.35);
    this.fx.ring(x, y, 20, 180, 1, 1.6, 3, 0.3);
    this.fx.splat(x, y, 90, 0.04, 0.04, 0.05, 0.55, 2);
    this.sound.lightning();
    this.app.flash?.(0.7, 0.85, 1, 0.35);
    this.shake(0.5);
    this.blast(x, y, 150 * FIELD.r, 140, 400, 'shock');
    const jumps = Math.round(10 * FIELD.c);
    if (best >= 0 && E.alive[best]) this.chain(best, jumps, 90);
    else {
      const near = this.nearest(x, y, 300 * FIELD.r, -1);
      if (near >= 0) this.chain(near, jumps, 90);
    }
  }

  countNear(x, y, r) {
    const G = this.grid;
    const E = this.enemies;
    let n = 0;
    const c0 = G.cx(x - r);
    const c1 = G.cx(x + r);
    const r0 = G.cy(y - r);
    const r1 = G.cy(y + r);
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const cc = rr * G.cols + c;
        for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
          const j = G.items[m];
          const dx = E.x[j] - x;
          const dy = E.y[j] - y;
          if (dx * dx + dy * dy < r * r) n++;
        }
      }
    return n;
  }

  nearest(x, y, r, skip) {
    const G = this.grid;
    const E = this.enemies;
    let best = -1;
    let bd = r * r;
    const c0 = G.cx(x - r);
    const c1 = G.cx(x + r);
    const r0 = G.cy(y - r);
    const r1 = G.cy(y + r);
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const cc = rr * G.cols + c;
        for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
          const j = G.items[m];
          if (j === skip || !E.alive[j] || E.dying[j] || this.chainMark[j] === this.chainId) continue;
          const dx = E.x[j] - x;
          const dy = E.y[j] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) {
            bd = d2;
            best = j;
          }
        }
      }
    return best;
  }

  // lightning jumps from creature to creature
  chain(from, jumps, dmg) {
    const E = this.enemies;
    this.chainId++;
    let i = from;
    this.chainMark[i] = this.chainId;
    let x = E.x[i];
    let y = E.y[i] - TYPES[E.type[i]].hitY;
    for (let k = 0; k < jumps; k++) {
      const j = this.nearest(x, y + TYPES[E.type[i]].hitY * 0.5, 190 * FIELD.r, i);
      if (j < 0) break;
      this.chainMark[j] = this.chainId;
      const jx = E.x[j];
      const jy = E.y[j] - TYPES[E.type[j]].hitY;
      this.fx.beam(x, y, jx, jy, 7, 1.1, 1.5, 3, 0.16, 1);
      this.fx.sparks(jx, jy + TYPES[E.type[j]].hitY, TYPES[E.type[j]].hitY, 3, 1.2, 1.6, 3, 300);
      this.hurt(j, dmg, (jx - x) * 0.01, (jy - y) * 0.01, 60, SHOCK);
      x = jx;
      y = jy;
      i = j;
    }
    this.sound.zap(this.pan(x));
    this.fx.light(x, y, 60, 260, 1.2, 1.8, 3.5, 0.15);
  }

  freezeAll(seconds) {
    const E = this.enemies;
    for (let k = 0; k < E.n; k++) {
      const i = E.list[k];
      if (E.y[i] < this.top() - 40) continue;
      E.frozen[i] = TYPES[E.type[i]].boss ? seconds * 0.4 : seconds + rnd() * 0.5;
    }
    this.freezeAllT = seconds;
    this.sound.freeze();
    this.app.flash?.(0.5, 0.8, 1.2, 0.4);
  }

  // ---------------------------------------------------------------- weapons
  fireWeapons(dt) {
    if (this.calm() || this.phase === 'dead') return;
    const h = this.hero;
    const s = this.stats;
    const muzzle = this.anchor('muzzle', 'hero', [8, -96]);
    let mx = h.x + muzzle[0];
    let my = h.y + muzzle[1];
    // creatures that slip in beside or below the hero: the gun swings down to them
    const thr = this.closeThreat(h, my);
    let want = -Math.PI / 2;
    if (thr >= 0) {
      const E = this.enemies;
      want = Math.atan2(E.y[thr] - TYPES[E.type[thr]].hitY * E.scale[thr] * 0.6 - (h.y - 50), E.x[thr] - h.x);
    }
    // ease the aim so the swing reads
    let da = want - this.aim;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    this.aim += da * Math.min(1, dt * 22);
    this.aimDown = Math.abs(this.aim + Math.PI / 2) > 0.35;
    if (this.aimDown) {
      mx = h.x + Math.cos(this.aim) * 34;
      my = h.y - 50 + Math.sin(this.aim) * 34;
    }
    const gun = this.gun();
    const def = WEAPONS[gun];
    const stars = this.arms[this.held];
    const od = this.surge.overdrive > 0 ? 2 : 1;
    if (def.range) {
      this.flame(def, stars, mx, my, dt * s.rate * STAR_RATE[stars] * od);
      return;
    }
    this.wTimer -= dt * s.rate * STAR_RATE[stars] * od;
    let guard = 0;
    while (this.wTimer <= 0 && guard++ < 4) {
      this.wTimer += def.interval;
      this.fire(gun, def, stars, mx, my);
    }
  }

  // the nearest creature within reach that is level with or below the muzzle
  closeThreat(h, my) {
    const E = this.enemies;
    const G = this.grid;
    const r = 250;
    let best = -1;
    let bd = r * r;
    const c0 = G.cx(h.x - r);
    const c1 = G.cx(h.x + r);
    const r0 = G.cy(my);
    const r1 = G.cy(h.y + 120);
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const cc = rr * G.cols + c;
        for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
          const j = G.items[m];
          if (!E.alive[j] || E.dying[j]) continue;
          const T0 = TYPES[E.type[j]];
          if (T0.boss || E.y[j] - T0.hitY * E.scale[j] < my + 10) continue;
          const dx = E.x[j] - h.x;
          const dy = E.y[j] - h.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) {
            bd = d2;
            best = j;
          }
        }
      }
    return best;
  }

  // One trigger pull. A wide field fires proportionally more bolts (FIELD.r)
  // at a little less damage each, so the gun's power grows with the horde
  // (FIELD.c); surges add a three-way spread (Triple Shot) or piercing,
  // exploding shots (Rage).
  fire(gun, def, stars, mx, my) {
    const s = this.stats;
    const h = this.hero;
    h.fireT = 0.06;
    const triple = this.surge.triple > 0;
    const rage = this.surge.rage > 0;
    const look = STAR_SIZE[stars] * (rage ? 1.25 : 1);
    const col = rage ? RAGE_COL : def.color;
    const base = def.dmg * s.dmg * STAR_DMG[stars] * (rage ? 1.2 : 1);
    if (def.beam && this.aimDown) {
      // the rail swung down: heavy piercing bolts at the close threat
      const sp = 2200;
      this.bullet(mx, my, Math.cos(this.aim) * sp, Math.sin(this.aim) * sp, base * FIELD.c, 3 + (rage ? 3 : 0), 0, def, look, col, rage);
      this.sound.shot('railgun', this.pan(mx));
      return;
    }
    if (def.beam) {
      const n0 = 1 + s.multi + (stars - 1);
      const n = Math.max(n0, Math.round(n0 * FIELD.r)) * (triple ? 3 : 1);
      const dmg = (base * FIELD.c * n0 * (triple ? 3 : 1)) / n;
      const gap = def.gap * (triple ? 2.2 : 1) * FIELD.r;
      for (let k = 0; k < n; k++) this.rail(mx + (k - (n - 1) / 2) * gap, my, dmg, def, rage, look);
      this.fx.flash(mx, my, 0, 46 * look, col[0], col[1], col[2], 0.1);
      this.fx.light(mx, my - 40, 50, 330, 0.8, 2, 3, 0.12);
      this.sound.shot('railgun', this.pan(mx));
      return;
    }
    const pierce = (gun === 'scatter' ? Math.floor(s.pierce / 2) : gun === 'rocket' ? 0 : s.pierce) + (rage && gun !== 'rocket' ? 3 : 0);
    let n0 = def.pellets;
    if (gun === 'blaster') n0 += s.multi + (stars - 1);
    else if (gun === 'scatter') n0 += 2 * s.multi + 2 * (stars - 1);
    else if (gun === 'rocket') n0 += Math.floor(s.multi / 1.5) + (stars - 1);
    const n = Math.max(n0, Math.round(n0 * FIELD.r));
    const dmg = (base * FIELD.c * n0) / n;
    const fan = triple ? 3 : 1;
    for (let f = 0; f < fan; f++) {
      const aim = this.aim + (f - (fan - 1) / 2) * 0.26 * Math.sqrt(FIELD.r);
      // lanes sit side by side across the aim
      const px = -Math.sin(aim);
      const py = Math.cos(aim);
      for (let k = 0; k < n; k++) {
        let ang;
        let ox = 0;
        const c = k - (n - 1) / 2;
        if (gun === 'scatter') ang = aim + (rnd() - 0.5) * def.spread * 2 * Math.min(1.7, FIELD.r);
        else if (gun === 'rocket') {
          ang = aim + c * def.spread * FIELD.r;
          ox = c * def.gap;
        } else {
          // blaster: parallel lanes, fanning out a little past three (wider on a wide field)
          ox = c * def.gap * look;
          ang = aim + (n > 3 ? c * 0.05 * FIELD.r : 0);
        }
        const sp = def.speed * (gun === 'scatter' ? rand(0.85, 1.15) : 1);
        this.bullet(mx + px * ox, my + py * ox, Math.cos(ang) * sp, Math.sin(ang) * sp, dmg, pierce, gun === 'blaster' ? 0 : gun === 'scatter' ? 1 : 2, def, look, col, rage);
      }
    }
    this.fx.flash(mx, my, 0, (gun === 'scatter' ? 60 : 34) * look, col[0], col[1], col[2], 0.07);
    this.fx.light(mx, my - 20, 50, gun === 'scatter' ? 300 : 220, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.08);
    if (gun === 'scatter') this.fx.smoke(mx, my, 0, 18, 1, 0.4);
    this.sound.shot(def.sound, this.pan(mx));
  }

  // The flamethrower: a short cone in front of the gun. Every tick it burns
  // whatever is inside (the boss and barrels too) and sets it alight.
  flame(def, stars, mx, my, dt) {
    const s = this.stats;
    const h = this.hero;
    h.fireT = 0.06;
    this.flameLv = 1;
    const rage = this.surge.rage > 0;
    const look = STAR_SIZE[stars];
    const range = def.range * (1 + 0.22 * (stars - 1)) * (1 + 0.08 * s.pierce);
    const cone0 = def.cone * (1 + 0.25 * (stars - 1)) + 0.05 * s.multi;
    const wide = Math.sqrt(FIELD.r);
    const cone = Math.min(1.15, cone0 * wide * (this.surge.triple > 0 ? 1.8 : 1));
    const ax = Math.cos(this.aim);
    const ay = Math.sin(this.aim);
    // the jet: hot puffs thrown along the cone, smoke off the end
    const fx = this.fx;
    for (let k = 0; k < 4; k++) {
      const a = this.aim + (rnd() - 0.5) * cone * 1.6;
      const sp = range * rand(2.4, 3.2);
      fx.add(FIRE, HOT, mx + ax * 8, my + ay * 8, 0, Math.cos(a) * sp, Math.sin(a) * sp, 0, rand(0.26, 0.36), 9 * look, rand(40, 62) * look * (0.6 + cone), 1, rage ? 0.6 : 1, rage ? 0.6 : 1, 1, 0, 2.2);
    }
    if (rnd() < 0.3) fx.smoke(mx + ax * range * 0.9, my + ay * range * 0.9, 0, 26, 1, 0.25);
    fx.light(mx + ax * range * 0.45, my + ay * range * 0.45, 40, range * 1.3, 2.2, 1.0, 0.25, 0.05);
    this.flameT -= dt;
    if (this.flameT > 0) return;
    this.flameT += def.interval;
    const tick = ++this.flameTick;
    // the flame's power grows with the field as the guns' does (FIELD.c), shared over its wider cone
    const dmg = (def.dmg * s.dmg * STAR_DMG[stars] * FIELD.c * (rage ? 1.3 : 1)) / wide;
    this.burnDps = (def.burnDps * s.dmg * STAR_DMG[stars] * FIELD.c * (rage ? 2 : 1)) / wide;
    const flags = QUIET | BURN | (tick % 4 === 0 ? PROC : 0) | (tick % 3 === 0 ? CRIT : 0);
    const E = this.enemies;
    const G = this.grid;
    const tc = Math.tan(cone);
    const c0 = G.cx(mx - range - 60);
    const c1 = G.cx(mx + range + 60);
    const r0 = G.cy(my - range - 20);
    const r1 = G.cy(my + range + 160);
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const cc = rr * G.cols + c;
        for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
          const j = G.items[m];
          if (!E.alive[j] || E.dying[j]) continue;
          const T0 = TYPES[E.type[j]];
          if (T0.boss) continue;
          const hr = T0.hr * E.scale[j];
          if (this.inCone(E.x[j] - mx, E.y[j] - T0.hitY * E.scale[j] * 0.5 - my, ax, ay, range, tc, hr)) this.scorch(j, dmg, ax, ay, def.kb, flags, def.burn);
        }
      }
    const b = this.boss && E.alive[this.boss.i] ? this.boss.i : -1;
    if (b >= 0) {
      const T0 = TYPES[E.type[b]];
      if (this.inCone(E.x[b] - mx, E.y[b] - T0.hitY * 0.5 - my, ax, ay, range, tc, T0.hr * 0.8)) this.scorch(b, dmg, ax, ay, 0, flags, def.burn * 0.5);
    }
    const R = this.barrels;
    for (let k = 0; k < R.n; k++) if (this.inCone(R.x[k] - mx, R.y[k] - 22 - my, ax, ay, range, tc, 22)) R.hp[k] -= dmg * 2;
  }

  inCone(vx, vy, ax, ay, range, tc, hr) {
    const along = vx * ax + vy * ay;
    if (along < -hr || along > range + hr) return false;
    const side = Math.abs(vx * ay - vy * ax);
    return side < Math.max(0, along) * tc + hr + 10;
  }

  scorch(j, dmg, ax, ay, kb, flags, burn) {
    const E = this.enemies;
    if (E.burn[j] <= 0) {
      E.burnT[j] = 0.25;
      this.burning++;
    }
    E.burn[j] = Math.max(E.burn[j], burn);
    this.hurt(j, dmg, ax, ay, kb, flags);
  }

  // burning creatures smoulder, drip fire and take damage until it goes out
  updateBurn(dt) {
    if (!this.burning) return;
    const E = this.enemies;
    let n = 0;
    const tick = this.burnDps * 0.25;
    for (let k = E.n - 1; k >= 0; k--) {
      if (k >= E.n) continue;
      const i = E.list[k];
      if (E.burn[i] <= 0) continue;
      E.burn[i] -= dt;
      E.burnT[i] -= dt;
      n++;
      if (rnd() < dt * 7) {
        const T0 = TYPES[E.type[i]];
        const h = T0.hitY * E.scale[i];
        this.fx.add(FIRE, HOT, E.x[i] + rand(-0.4, 0.4) * T0.hr, E.y[i] - h * rand(0.2, 1.0), 0, rand(-15, 15), -50, 0, rand(0.25, 0.42), 10, T0.hr * 0.9, 1, 1, 1, 1, 0, 0);
      }
      if (E.burnT[i] <= 0 && !E.dying[i] && E.burn[i] > 0) {
        E.burnT[i] += 0.25;
        this.hurt(i, tick, 0, 0, 0, QUIET | BURN);
      }
    }
    this.burning = n;
  }

  bullet(x, y, vx, vy, dmg, pierce, kind, def, look = 1, col = def.color, rage = false) {
    const B = this.bullets;
    const i = B.take();
    if (i < 0) return;
    B.rage[i] = rage ? 1 : 0;
    B.home[i] = 0;
    B.x[i] = B.px[i] = x;
    B.y[i] = B.py[i] = y;
    B.vx[i] = vx;
    B.vy[i] = vy;
    B.dmg[i] = dmg;
    B.life[i] = def.life;
    B.kb[i] = def.kb;
    B.size[i] = def.size * look;
    B.accel[i] = def.accel || 0;
    B.blast[i] = (def.blast || 0) * (rage ? 1.45 : 1) * (kind === 2 ? Math.sqrt(look) : 1);
    B.pierce[i] = pierce;
    B.kind[i] = kind;
    B.hitN[i] = 0;
    B.r[i] = col[0];
    B.g[i] = col[1];
    B.b[i] = col[2];
  }

  // a rail beam: everything in its lane up the road takes the hit
  rail(lx, my, dmg, def, rage = false, look = 1) {
    const E = this.enemies;
    const G = this.grid;
    const c0 = G.cx(lx - 50);
    const c1 = G.cx(lx + 50);
    const r1 = G.cy(my + 60);
    const top = this.top();
    for (let rr = 0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const cc = rr * G.cols + c;
        for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
          const j = G.items[m];
          if (!E.alive[j] || E.dying[j]) continue;
          const T0 = TYPES[E.type[j]];
          if (T0.boss) continue; // tested below with its own big circle
          const cy = E.y[j] - T0.hitY * E.scale[j];
          if (cy > my || cy < top - 40) continue;
          if (Math.abs(E.x[j] - lx) < T0.hr * E.scale[j] + 8 * look) {
            this.hurt(j, dmg, 0, -1, def.kb, CRIT | PROC);
            if (rage && this.blastBudget > 0 && rnd() < 0.35) {
              this.blastBudget--;
              this.explode(E.x[j], cy + 10, 60, dmg * 0.6, 300, 'round');
            }
          }
        }
      }
    if (this.boss && E.alive[this.boss.i]) {
      const b = this.boss.i;
      if (Math.abs(E.x[b] - lx) < TYPES[E.type[b]].hr) this.hurt(b, dmg, 0, -1, 0, CRIT | PROC);
    }
    this.hitBarrelsLine(lx, my, dmg);
    const c = rage ? RAGE_COL : def.color;
    this.fx.beam(lx, my, lx, top - 60, 10 * look, c[0], c[1], c[2], 0.14, 0);
  }

  updateBullets(dt) {
    const B = this.bullets;
    const E = this.enemies;
    const G = this.grid;
    const top = this.top() - 80;
    const boss = this.boss && E.alive[this.boss.i] ? this.boss.i : -1;
    for (let i = 0; i < B.n; i++) {
      B.px[i] = B.x[i];
      B.py[i] = B.y[i];
      if (B.kind[i] === 2) {
        // rockets home on the boss when it is near, else the nearest creature ahead (picked a few times a second)
        if ((this.stepN + i) % 5 === 0) {
          let j = -1;
          if (boss >= 0) {
            const bdx = E.x[boss] - B.x[i];
            const bdy = E.y[boss] - TYPES[E.type[boss]].hitY - B.y[i];
            if (bdx * bdx + bdy * bdy < 560 * 560 * FIELD.r) j = boss;
          }
          if (j < 0) j = this.nearest(B.x[i] + B.vx[i] * 0.15, B.y[i] + B.vy[i] * 0.15 - 60, 360 * FIELD.r, -1);
          if (j >= 0) {
            B.home[i] = 1;
            B.tx[i] = E.x[j];
            B.ty[i] = E.y[j] - TYPES[E.type[j]].hitY * E.scale[j] * 0.6;
          }
        }
        if (B.home[i]) {
          const sp = Math.hypot(B.vx[i], B.vy[i]) || 1;
          const want = Math.atan2(B.ty[i] - B.y[i], B.tx[i] - B.x[i]);
          let a = Math.atan2(B.vy[i], B.vx[i]);
          let da = want - a;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          a += clamp(da, -7 * dt, 7 * dt);
          B.vx[i] = Math.cos(a) * sp;
          B.vy[i] = Math.sin(a) * sp;
        }
      }
      if (B.accel[i]) {
        // rockets speed up as they climb and leave smoke
        const sp = Math.hypot(B.vx[i], B.vy[i]) || 1;
        B.vx[i] += (B.vx[i] / sp) * B.accel[i] * dt;
        B.vy[i] += (B.vy[i] / sp) * B.accel[i] * dt;
        if (rnd() < 0.6) this.fx.smoke(B.x[i], B.y[i] + 10, 0, 10, 1, 0.5);
      }
      const x0 = B.x[i];
      const y0 = B.y[i];
      const x1 = x0 + B.vx[i] * dt;
      const y1 = y0 + B.vy[i] * dt;
      B.x[i] = x1;
      B.y[i] = y1;
      B.life[i] -= dt;
      let dead = B.life[i] <= 0 || y1 < top || y1 > ARENA.h + 80 || x1 < -60 || x1 > ARENA.w + 60;
      if (dead && B.kind[i] === 2 && B.life[i] <= 0) this.rocketBlast(i);
      if (!dead) {
        // swept test against creature hit circles in the cells the segment crosses
        const pad = 70;
        const c0 = G.cx(Math.min(x0, x1) - pad);
        const c1 = G.cx(Math.max(x0, x1) + pad);
        const r0 = G.cy(Math.min(y0, y1) - 10);
        const r1 = G.cy(Math.max(y0, y1) + pad);
        const sx = x1 - x0;
        const sy = y1 - y0;
        const sl2 = sx * sx + sy * sy || 1;
        outer: for (let rr = r0; rr <= r1; rr++) {
          for (let c = c0; c <= c1; c++) {
            const cc = rr * G.cols + c;
            for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
              const j = G.items[m];
              if (j === boss || !E.alive[j] || E.dying[j]) continue;
              const T0 = TYPES[E.type[j]];
              const sc = E.scale[j];
              const ex = E.x[j];
              const ey = E.y[j] - T0.hitY * sc;
              const rad = T0.hr * sc + B.size[i] * 0.5;
              let t = ((ex - x0) * sx + (ey - y0) * sy) / sl2;
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              const qx = x0 + sx * t - ex;
              const qy = y0 + sy * t - ey;
              if (qx * qx + qy * qy > rad * rad) continue;
              if (this.alreadyHit(i, j)) continue;
              if (this.bulletHit(i, j)) {
                dead = true;
                break outer;
              }
            }
          }
        }
        if (!dead && boss >= 0) {
          const T0 = TYPES[E.type[boss]];
          const ex = E.x[boss];
          const ey = E.y[boss] - T0.hitY;
          const dx = x1 - ex;
          const dy = y1 - ey;
          if (dx * dx + dy * dy < T0.hr * T0.hr && !this.alreadyHit(i, boss)) {
            if (this.bulletHit(i, boss)) dead = true;
          }
        }
        if (!dead && this.barrels.n) dead = this.bulletBarrel(i);
        if (!dead && this.pickups.n) this.bulletPickup(i);
      }
      if (dead) {
        B.kill(i);
        i--;
      }
    }
  }

  alreadyHit(i, j) {
    const B = this.bullets;
    const key = j * 4096 + (this.enemies.gen[j] & 4095);
    const n = B.hitN[i];
    for (let k = 0; k < n && k < 4; k++) if (B.hits[i * 4 + k] === key) return true;
    return false;
  }

  // a bullet meets a creature; returns true when the bullet is used up
  bulletHit(i, j) {
    const B = this.bullets;
    const sp = Math.hypot(B.vx[i], B.vy[i]) || 1;
    const dx = B.vx[i] / sp;
    const dy = B.vy[i] / sp;
    if (B.kind[i] === 2) {
      this.rocketBlast(i);
      return true;
    }
    this.hurt(j, B.dmg[i], dx, dy, B.kb[i], CRIT | PROC);
    this.fx.sparks(B.x[i], B.y[i], 0, 2, B.r[i], B.g[i], B.b[i], 260, -dx, -dy, 1.6);
    if (B.rage[i] && this.blastBudget > 0) {
      // rage: every hit bursts
      this.blastBudget--;
      this.explode(B.x[i], B.y[i], 58, B.dmg[i] * 0.6, 280, 'round');
    }
    if (B.pierce[i] > 0) {
      B.pierce[i]--;
      B.hits[i * 4 + (B.hitN[i] & 3)] = j * 4096 + (this.enemies.gen[j] & 4095);
      B.hitN[i]++;
      B.dmg[i] *= 0.85;
      return false;
    }
    return true;
  }

  rocketBlast(i) {
    const B = this.bullets;
    const r = B.blast[i] * (this.stats.carpet ? 1.4 : 1) * (1 + 0.1 * this.stats.explosive);
    this.explode(B.x[i], B.y[i], r, B.dmg[i] * 0.9, 520, 'rocket');
  }

  // ---------------------------------------------------------------- damage
  hurt(j, dmg, dx, dy, kb, flags) {
    const E = this.enemies;
    if (!E.alive[j] || E.dying[j]) return;
    const T0 = TYPES[E.type[j]];
    const s = this.stats;
    let crit = false;
    if (flags & CRIT && rnd() < s.crit) {
      crit = true;
      dmg *= s.critMul;
    }
    E.hp[j] -= dmg;
    // under constant fire a full white flash would wash the boss out
    E.flash[j] = T0.boss ? Math.max(E.flash[j], crit ? 0.4 : 0.18) : T0.big ? 0.65 : 1;
    const m = T0.mass * (E.elite[j] ? 3 : 1);
    const k = (kb * s.kb) / m;
    E.kx[j] += dx * k;
    E.ky[j] += dy * k * 0.8;
    const hy = E.y[j] - T0.hitY * E.scale[j];
    if (flags & QUIET) {
      // flame ticks: an occasional sizzle of blood, crits still show
      if (crit) this.numbers.add(E.x[j], hy - T0.hr * 0.7, dmg, 1);
      if (rnd() < 0.2) this.fx.blood(E.x[j], E.y[j], T0.hitY * E.scale[j], dx || 0, dy || -1, 1, 200, T0.blood, 0.7);
    } else {
      if (dmg >= 1) this.numbers.add(E.x[j], hy - T0.hr * 0.7, dmg, crit ? 1 : 0);
      // a spurt of blood out of the back, more on a crit
      this.fx.blood(E.x[j], E.y[j], T0.hitY * E.scale[j], dx || 0, dy || -1, crit ? 6 : 2, crit ? 340 : 230, T0.blood, 0.7);
      if (crit) this.fx.mist(E.x[j], E.y[j], T0.hitY, T0.blood, 14, 1);
      this.sound.hit(this.pan(E.x[j]), crit);
    }
    // the boss sheds a weapon crate (and maybe a surge) each fifth of its health
    if (T0.boss && this.bossChunk > 0 && E.hp[j] < E.maxHp[j] * this.bossChunk) {
      this.bossChunk -= 0.2;
      this.dropCrate(E.x[j] + rand(-80, 80), E.y[j] - 60, true);
      if (rnd() < 0.5) this.dropPickup(SURGES[randi(0, 2)], E.x[j] + rand(-120, 120), E.y[j] - 40);
    }
    // on-hit effects
    if (flags & PROC) {
      if (s.freezer && rnd() < [0, 0.06, 0.1, 0.14][s.freezer] && !T0.boss) {
        E.frozen[j] = 2;
      }
      if (s.chain && (rnd() < [0, 0.1, 0.16, 0.22][s.chain] || (s.storm && crit))) this.chain(j, s.chain + 1 + (s.storm ? 3 : 0), dmg * 0.6);
      if ((s.carpet || (s.explosive && rnd() < [0, 0.12, 0.2, 0.28][s.explosive])) && this.blastBudget > 0) {
        this.blastBudget--;
        this.explode(E.x[j], hy + 10, (s.carpet ? 85 : 55) + 8 * s.explosive, dmg * 0.7, 300, 'round');
      }
    }
    if (E.hp[j] <= 0) this.kill(j, flags & BLAST ? 'blast' : E.frozen[j] > 0 ? 'ice' : flags & SHOCK ? 'shock' : flags & BURN || E.burn[j] > 0 ? 'fire' : crit ? 'crit' : 'hit', dx, dy);
  }

  kill(j, cause, dx, dy) {
    const E = this.enemies;
    const T0 = TYPES[E.type[j]];
    const x = E.x[j];
    const y = E.y[j];
    const sc = E.scale[j];
    const elite = E.elite[j];
    this.kills++;
    this.waveKills++;
    if (E.burn[j] > 0) this.burning = Math.max(0, this.burning - 1);
    E.burn[j] = 0;
    this.addStreak(x, y);
    // a wide field has more creatures, each worth a little less, so levels come at the same pace
    this.dropGems(x, y - 6, (T0.xp * (elite ? 6 : 1)) / FIELD.c, T0.boss ? 40 : elite ? 6 : T0.xp >= 10 ? 3 : 1);
    const fewer = Math.sqrt(FIELD.c);
    if (elite) {
      this.dropPickup('chest', x, y - 20);
      this.dropCrate(x + rand(-30, 30), y - 40);
      if (rnd() < 0.5) this.dropPickup(SURGES[randi(0, 2)], x + rand(-40, 40), y - 30);
    } else if (T0.key === 'brute') {
      if (rnd() < 0.3 / fewer) this.dropCrate(x, y - 40);
      else if (rnd() < 0.14 / fewer) this.dropPickup(SURGES[randi(0, 2)], x, y - 30);
    } else if (!T0.boss && rnd() < 0.006 / FIELD.c) this.dropPickup(PICKUPS[randi(0, 5)], x, y - 20);
    const pan = this.pan(x);
    if (T0.boss) {
      this.bossDeath(j);
      return;
    }
    // some bodies keep walking without their heads
    if (T0.headless && (cause === 'crit' || (cause === 'hit' && rnd() < 0.16)) && this.headlessCount < 24) {
      E.state[j] = HEADLESS;
      E.dying[j] = 1;
      E.t[j] = rand(0.55, 1.0);
      E.flash[j] = 0;
      this.headlessCount++;
      this.gore.headPop(E.type[j], x, y, sc, dx, dy);
      this.sound.headPop(pan);
      return;
    }
    if (cause === 'ice') this.sound.shatter(pan);
    else if (cause !== 'fire' || rnd() < 0.35) this.sound.kill(pan, !!T0.big || !!elite);
    this.gore.death(E.type[j], x, y, sc * (elite ? 1.3 : 1), cause, dx, dy, false);
    if (T0.big || elite) {
      this.hitstop(elite ? 0.07 : 0.04);
      this.shake(elite ? 0.5 : 0.25);
      this.app.bloomKick?.(elite ? 0.8 : 0.4);
    }
    E.remove(j);
  }

  // a headless body finally drops
  collapse(j) {
    const E = this.enemies;
    this.gore.death(E.type[j], E.x[j], E.y[j], E.scale[j], 'hit', 0, 1, true);
    this.sound.gib(this.pan(E.x[j]));
    this.headlessCount--;
    E.remove(j);
  }

  updateHeadless(dt) {
    const E = this.enemies;
    if (!this.headlessCount) return;
    for (let k = 0; k < E.n; k++) {
      const i = E.list[k];
      if (!E.dying[i]) continue;
      // the neck pumps blood upward
      if (rnd() < dt * 30) {
        const T0 = TYPES[E.type[i]];
        this.fx.blood(E.x[i], E.y[i], T0.hitY * E.scale[i] * 1.5, rand(-0.3, 0.3), -1, 1, 160, T0.blood, 0.5, 1.6);
      }
    }
  }

  addStreak(x, y) {
    this.streak++;
    this.streakT = 1.6;
    const next = STREAKS[this.streakTier];
    if (next && this.streak >= Math.round(next[0] * FIELD.c)) {
      this.streakTier++;
      this.events.streak?.(next[1], this.streakTier);
      this.sound.streak(this.streakTier);
      // a long streak earns a power surge where it peaked
      if (this.streakTier >= 2 && !this.demo) this.dropPickup(SURGES[randi(0, 2)], clamp(x, 60, ARENA.w - 60), Math.min(y - 30, BAND.y0 - 120));
    }
  }

  // a blast: hurts and flings every creature in range, lights barrels
  explode(x, y, r, dmg, kb, src) {
    this.blast(x, y, r, dmg, kb, src);
    const big = clamp(r / 120, 0.4, 1.4);
    this.fx.explosion(x, y, r, big);
    this.sound.explode(this.pan(x), clamp(r / 160, 0.3, 1));
    this.shake(clamp(r / 300, 0.1, 0.7));
    // barrels in range go off a moment later
    const B = this.barrels;
    for (let k = 0; k < B.n; k++) {
      const dx = B.x[k] - x;
      const dy = B.y[k] - y;
      if (dx * dx + dy * dy < r * r * 1.1 && B.fuse[k] <= 0 && B.hp[k] > 0) B.fuse[k] = rand(0.08, 0.18);
    }
    if (src === 'barrel' || src === 'bomb') {
      const h = this.hero;
      const dx = h.x - x;
      const dy = h.y - y;
      if (src === 'barrel' && dx * dx + dy * dy < r * r * 0.4) this.hitHero(12, x, y);
    }
  }

  blast(x, y, r, dmg, kb, src) {
    const E = this.enemies;
    const G = this.grid;
    const c0 = G.cx(x - r);
    const c1 = G.cx(x + r);
    const r0 = G.cy(y - r);
    const r1 = G.cy(y + r + 60);
    const flags = src === 'shock' ? SHOCK : BLAST;
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const cc = rr * G.cols + c;
        for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
          const j = G.items[m];
          if (!E.alive[j] || E.dying[j]) continue;
          const T0 = TYPES[E.type[j]];
          if (T0.boss && src === 'slam') continue;
          const dx = E.x[j] - x;
          const dy = E.y[j] - T0.hitY * 0.5 - y;
          const d2 = dx * dx + dy * dy;
          const rad = r + T0.hr;
          if (d2 > rad * rad) continue;
          const d = Math.sqrt(d2) || 1;
          const f = 1 - (d / rad) * 0.55;
          this.hurt(j, dmg * f, dx / d, dy / d, kb * f, flags);
        }
      }
  }

  // the charging boss runs through its own horde
  trample(x, y, r) {
    const E = this.enemies;
    const G = this.grid;
    const c0 = G.cx(x - r);
    const c1 = G.cx(x + r);
    const r0 = G.cy(y - r);
    const r1 = G.cy(y + r);
    for (let rr = r0; rr <= r1; rr++)
      for (let c = c0; c <= c1; c++) {
        const cc = rr * G.cols + c;
        for (let m = G.start[cc]; m < G.start[cc + 1]; m++) {
          const j = G.items[m];
          if (!E.alive[j] || E.dying[j] || TYPES[E.type[j]].boss) continue;
          const dx = E.x[j] - x;
          const dy = E.y[j] - y;
          if (dx * dx + dy * dy < r * r) this.hurt(j, 400, Math.sign(dx) || 1, 0.5, 600, BLAST);
        }
      }
  }

  bossDeath(j) {
    const E = this.enemies;
    const x = E.x[j];
    const y = E.y[j];
    const col = TYPES[E.type[j]].blood;
    const parts = ['ogre_head', 'ogre_arm', 'ogre_arm', 'ogre_leg', 'ogre_leg', 'ogre_torso', 'ogre_pauldron', 'ogre_pauldron', 'ogre_jaw'];
    for (let k = 0; k < 14; k++) parts.push(this.gore.chunks[k & 3]);
    for (let k = 0; k < 5; k++) parts.push(this.gore.bones[k % 3], 'gib_guts_0', 'gib_guts_1');
    this.gore.burst(parts, x, y, 140, 560, col, 0, 0.2);
    this.fx.blood(x, y, 140, 0, 1, 160, 700, col, 3.14);
    this.fx.blood(x, y, 140, 0, -1, 80, 500, col, 3.14, 1.5);
    this.fx.mist(x, y, 140, col, 90, 8);
    this.fx.splat(x, y, 190, col[0] * 0.75, col[1] * 0.75, col[2] * 0.75, 0.97, 0);
    this.fx.explosion(x, y - 60, 180, 1.4);
    this.sound.bossDeath();
    this.sound.duck(0.8, 2.5);
    this.shake(1);
    this.slowmo = 2.6;
    this.app.flash?.(1, 0.95, 0.85, 0.6);
    this.app.bloomKick?.(1.5);
    E.remove(j);
    // the rest of the horde bursts with it
    for (let k = E.n - 1; k >= 0; k--) {
      const i = E.list[k];
      if (!E.alive[i]) continue;
      if (E.dying[i]) {
        this.collapse(i);
        continue;
      }
      this.gore.death(E.type[i], E.x[i], E.y[i], E.scale[i], 'blast', E.x[i] - x, E.y[i] - y, false);
      this.dropGems(E.x[i], E.y[i], TYPES[E.type[i]].xp / FIELD.c, 1);
      E.burn[i] = 0;
      E.remove(i);
    }
    this.events.bossKilled?.();
  }

  // ---------------------------------------------------------------- enemy shots
  spit(i) {
    const E = this.enemies;
    const mouth = this.anchor('mouth', 'spitter', [0, -40]);
    const x = E.x[i] + mouth[0];
    const y = E.y[i] + mouth[1] * 0.5;
    const h = this.hero;
    // lead the hero a little
    const t = Math.hypot(h.x - x, h.y - y) / 330;
    const ax = h.x + h.vx * t * 0.5 - x;
    const ay = h.y - 20 + h.vy * t * 0.5 - y;
    const d = Math.hypot(ax, ay) || 1;
    this.shoot(x, y, (ax / d) * 330, (ay / d) * 330, 0);
    this.sound.spit(this.pan(x));
  }

  shoot(x, y, vx, vy, kind) {
    const S = this.shots;
    const i = S.take();
    if (i < 0) return;
    S.x[i] = S.px[i] = x;
    S.y[i] = S.py[i] = y;
    S.vx[i] = vx;
    S.vy[i] = vy;
    S.r[i] = kind === 1 ? 15 : 12;
    S.dmg[i] = kind === 1 ? 9 : 10;
    S.life[i] = 6;
    S.kind[i] = kind;
  }

  updateShots(dt) {
    const S = this.shots;
    const h = this.hero;
    for (let i = 0; i < S.n; i++) {
      S.px[i] = S.x[i];
      S.py[i] = S.y[i];
      S.x[i] += S.vx[i] * dt * this.timeSlow;
      S.y[i] += S.vy[i] * dt * this.timeSlow;
      S.life[i] -= dt;
      let dead = S.life[i] <= 0 || S.y[i] > ARENA.h + 80 || S.x[i] < -60 || S.x[i] > ARENA.w + 60;
      if (!dead && h.alive) {
        const dx = S.x[i] - h.x;
        const dy = S.y[i] - (h.y - 34);
        const rr = h.shield > 0 ? 78 : S.r[i] + HERO_R;
        if (dx * dx + dy * dy < rr * rr) {
          dead = true;
          if (h.shield > 0) {
            this.sound.shieldHit();
            this.fx.sparks(S.x[i], S.y[i], 0, 6, 0.6, 1.4, 3, 300, dx, dy);
          } else {
            this.hitHero(S.dmg[i], S.x[i], S.y[i]);
            if (S.kind[i] === 0) this.fx.splat(h.x, h.y, 18, 0.15, 0.6, 0.1, 0.8, 5);
          }
        }
      }
      if (dead && S.kind[i] === 0 && S.life[i] > 0) {
        // acid splashes where it lands
        this.fx.splat(S.x[i], S.y[i], 16, 0.12, 0.55, 0.06, 0.7, 5);
      }
      if (dead) {
        S.kill(i);
        i--;
      }
    }
  }

  // ---------------------------------------------------------------- bombs
  updateBombs(dt) {
    const B = this.bombs;
    for (let i = 0; i < B.n; i++) {
      B.t[i] += dt;
      if (B.t[i] >= B.dur[i]) {
        const x = B.x1[i];
        const y = B.y1[i];
        this.explode(x, y, 150 * this.stats.bombR, 170, 900, 'bomb');
        B.kill(i);
        i--;
      }
    }
  }

  // ---------------------------------------------------------------- barrels
  updateBarrels(dt) {
    const B = this.barrels;
    for (let i = 0; i < B.n; i++) {
      B.px[i] = B.x[i];
      B.py[i] = B.y[i];
      if (B.vy[i] > 0) {
        B.y[i] += B.vy[i] * dt;
        B.rot[i] += dt * 6;
        if (B.y[i] >= B.ty[i]) {
          B.y[i] = B.ty[i];
          B.vy[i] = 0;
          B.rot[i] = rand(-0.15, 0.15);
        }
      }
      if (B.flash[i] > 0) B.flash[i] -= dt * 6;
      if (B.fuse[i] > 0) {
        B.fuse[i] -= dt;
        if (B.fuse[i] <= 0) B.hp[i] = 0;
      }
      if (B.hp[i] <= 0) {
        const x = B.x[i];
        const y = B.y[i];
        B.kill(i);
        i--;
        this.explode(x, y - 10, 125, 150, 800, 'barrel');
        this.gore.burst(['barrel_lid', 'barrel_shard_0', 'barrel_shard_1', 'barrel_shard_2'], x, y, 20, 420, [0.05, 0.05, 0.05], 0, -0.3);
        for (let k = 0; k < 5; k++) this.fx.add(FIRE, HOT, x + rand(-30, 30), y + rand(-20, 20), 0, 0, 0, rand(10, 40), rand(1.2, 2.5), 22, 30, 1, 1, 1, 1, 0, 0);
      }
    }
  }

  bulletBarrel(i) {
    const B = this.bullets;
    const R = this.barrels;
    for (let k = 0; k < R.n; k++) {
      const dx = B.x[i] - R.x[k];
      const dy = B.y[i] - (R.y[k] - 22);
      if (dx * dx + dy * dy < 22 * 22) {
        R.hp[k] -= B.dmg[i];
        R.flash[k] = 1;
        this.fx.sparks(B.x[i], B.y[i], 0, 3, 3, 2, 1, 300, 0, 1);
        if (B.kind[i] === 2) this.rocketBlast(i);
        return true;
      }
    }
    return false;
  }

  hitBarrelsLine(lx, my, dmg) {
    const R = this.barrels;
    for (let k = 0; k < R.n; k++) if (Math.abs(R.x[k] - lx) < 24 && R.y[k] < my) R.hp[k] -= dmg;
  }

  // ---------------------------------------------------------------- gems
  dropGems(x, y, value, n) {
    const G = this.gems;
    const each = value / n;
    for (let k = 0; k < n; k++) {
      let i = G.take();
      if (i < 0) {
        // full: fold the value into a gem already out
        G.value[Math.floor(rnd() * G.n)] += each;
        continue;
      }
      const a = rnd() * TAU;
      const s = rand(60, 160) * (n > 1 ? 1.6 : 1);
      G.x[i] = G.px[i] = x;
      G.y[i] = G.py[i] = y;
      G.vx[i] = Math.cos(a) * s;
      G.vy[i] = Math.sin(a) * s * 0.6;
      G.value[i] = each;
      G.t[i] = 0;
      G.state[i] = 0;
      G.seed[i] = rnd();
    }
  }

  updateGems(dt) {
    const G = this.gems;
    const h = this.hero;
    const pr = 125 * this.stats.magnet * FIELD.r;
    const pr2 = pr * pr;
    const all = this.magnetAll > 0;
    for (let i = 0; i < G.n; i++) {
      G.px[i] = G.x[i];
      G.py[i] = G.y[i];
      G.t[i] += dt;
      const dx = h.x - G.x[i];
      const dy = h.y - 30 - G.y[i];
      const d2 = dx * dx + dy * dy;
      if (G.state[i] < 2 && h.alive && (d2 < pr2 || all)) G.state[i] = 2;
      if (G.state[i] === 0) {
        const k = Math.exp(-5 * dt);
        G.vx[i] *= k;
        G.vy[i] *= k;
        if (G.t[i] > 0.4) G.state[i] = 1;
      } else if (G.state[i] === 1) {
        // drift down toward the hero's end of the road
        G.vx[i] *= Math.exp(-3 * dt);
        G.vy[i] = G.y[i] < BAND.y1 - 10 ? 34 : 0;
      } else {
        const d = Math.sqrt(d2) || 1;
        const sp = Math.min(1500, 250 + G.t[i] * 900);
        G.vx[i] += ((dx / d) * sp - G.vx[i]) * Math.min(1, 9 * dt);
        G.vy[i] += ((dy / d) * sp - G.vy[i]) * Math.min(1, 9 * dt);
        if (d < 26 + sp * dt) {
          this.gainXp(G.value[i]);
          G.kill(i);
          i--;
          continue;
        }
      }
      G.x[i] += G.vx[i] * dt;
      G.y[i] += G.vy[i] * dt;
    }
  }

  gainXp(v) {
    this.xp += v;
    this.gemChain = Math.min(15, this.gemChain + 1);
    this.gemChainT = 0.6;
    this.sound.gem(this.gemChain);
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpNext(this.level);
      this.pendingLevels++;
    }
  }

  // ---------------------------------------------------------------- pickups
  // w: for a crate, the gun inside (index into CRATE_GUNS)
  dropPickup(kind, x, y, w = 0) {
    const P = this.pickups;
    const i = P.take();
    if (i < 0) return -1;
    const k = PICKUPS.indexOf(kind);
    P.x[i] = P.px[i] = clamp(x, 40, ARENA.w - 40);
    P.y[i] = P.py[i] = y;
    P.vx[i] = 0;
    P.vy[i] = kind === 'chest' ? 0 : k === CRATE ? 40 : 65;
    P.t[i] = 0;
    P.kind[i] = k;
    P.w[i] = w;
    P.seed[i] = rnd();
    this.events.dropped?.(k === CRATE ? `crate_${CRATE_GUNS[w]}` : kind);
    if (k === CRATE) this.sound.crate?.();
    return i;
  }

  // A weapon crate: what is inside leans toward a star for the gun in hand
  // until it has three, otherwise another gun (ones not found yet first).
  // (the boss's own crates hold guns that reach it: never the flamethrower)
  dropCrate(x, y, long = false) {
    const P = this.pickups;
    let crates = 0;
    for (let k = 0; k < P.n; k++) if (P.kind[k] === CRATE) crates++;
    if (crates >= 3 || this.demo) return;
    let id = this.held;
    if (this.arms[id] >= 3 || rnd() < 0.55 || (long && id === 'flamer')) {
      const others = CRATE_GUNS.filter((g) => g !== this.held && !(long && g === 'flamer'));
      const fresh = others.filter((g) => !this.arms[g]);
      id = fresh.length && rnd() < 0.6 ? fresh[randi(0, fresh.length - 1)] : others[randi(0, others.length - 1)];
    }
    this.dropPickup('crate', x, y, CRATE_GUNS.indexOf(id));
  }

  updatePickups(dt) {
    const P = this.pickups;
    const h = this.hero;
    for (let i = 0; i < P.n; i++) {
      P.px[i] = P.x[i];
      P.py[i] = P.y[i];
      P.t[i] += dt;
      const kind = P.kind[i];
      if (kind === 6) {
        // a chest: drifts down slowly, glowing
        P.y[i] += 40 * dt;
      } else if (kind === CRATE) {
        // a crate floats down to the hero and drifts gently after him, slow enough to dodge
        const ty = h.y - 30;
        P.vy[i] += (clamp((ty - P.y[i]) * 1.2, -60, 110) - P.vy[i]) * Math.min(1, 2.5 * dt);
        const dx = h.x - P.x[i];
        const want = clamp(dx * 0.7, -100 * FIELD.s, 100 * FIELD.s);
        P.vx[i] += (want - P.vx[i]) * Math.min(1, 1.5 * dt);
        P.x[i] = clamp(P.x[i] + P.vx[i] * dt, 40, ARENA.w - 40);
        P.y[i] += P.vy[i] * dt;
        if (P.t[i] > CRATE_LIFE) {
          this.fx.ring(P.x[i], P.y[i], 10, 50, 0.4, 1.2, 1.1, 0.25);
          P.kill(i);
          i--;
          continue;
        }
      } else {
        P.y[i] += P.vy[i] * dt;
        P.x[i] += Math.sin(P.t[i] * 2 + P.seed[i] * 6) * 30 * dt;
      }
      const dx = P.x[i] - h.x;
      const dy = P.y[i] - (h.y - 30);
      const rr = kind === CRATE ? 54 : 46;
      if (h.alive && !this.calm() && dx * dx + dy * dy < rr * rr) {
        this.collect(i);
        i--;
        continue;
      }
      if (P.y[i] > ARENA.h + 60) {
        P.kill(i);
        i--;
      }
    }
  }

  bulletPickup(i) {
    const B = this.bullets;
    const P = this.pickups;
    for (let k = 0; k < P.n; k++) {
      if (P.kind[k] === CRATE) continue; // crates are a choice: only touching one swaps the gun
      const dx = B.x[i] - P.x[k];
      const dy = B.y[i] - P.y[k];
      if (dx * dx + dy * dy < 30 * 30) {
        this.collect(k);
        return;
      }
    }
  }

  collect(i) {
    const P = this.pickups;
    const kind = PICKUPS[P.kind[i]];
    const x = P.x[i];
    const y = P.y[i];
    const w = P.w[i];
    P.kill(i);
    const h = this.hero;
    const c = kind === 'crate' ? WEAPONS[CRATE_GUNS[w]].color : PICKUP_COL[kind];
    this.fx.ring(x, y, 10, 70, c[0], c[1], c[2], 0.25);
    // the grab shows on the hero, in the pickup's colour
    this.fx.ring(h.x, h.y - 30, 16, 120, c[0], c[1], c[2], 0.4);
    this.fx.flash(h.x, h.y - 40, 0, 110, c[0], c[1], c[2], 0.2);
    this.fx.light(h.x, h.y - 30, 60, 300, c[0] * 1.5, c[1] * 1.5, c[2] * 1.5, 0.35);
    if (kind !== 'crate' && !SURGES.includes(kind)) this.sound.pickup(kind);
    this.events.pickup?.(kind);
    switch (kind) {
      case 'magnet':
        this.magnetAll = 2.5;
        break;
      case 'freeze':
        this.freezeAll(4.5);
        break;
      case 'lightning':
        this.lightningStrike();
        break;
      case 'shield':
        this.abil.shield.charges = Math.min(this.abil.shield.max + 1, this.abil.shield.charges + 1);
        if (h.shield <= 0) {
          h.shield = this.stats.shieldTime;
          this.sound.shieldUp();
        }
        break;
      case 'bomb':
        this.abil.bomb.charges = Math.min(this.abil.bomb.max + 2, this.abil.bomb.charges + 2);
        break;
      case 'heart':
        this.heal(35);
        break;
      case 'chest':
        this.pendingChests++;
        this.coins += 60;
        break;
      case 'crate':
        this.grabCrate(CRATE_GUNS[w]);
        break;
      case 'overdrive':
      case 'triple':
      case 'rage':
        if (this.surge[kind] <= 0) this.sound.surge?.(kind);
        else this.sound.pickup('bomb');
        this.surge[kind] = SURGE_TIME;
        this.fx.ring(h.x, h.y - 30, 30, 220, c[0], c[1], c[2], 0.5);
        this.app.bloomKick?.(0.6);
        break;
    }
  }

  // the same gun levels up (to three stars); another one swaps in on the spot, keeping its own stars
  grabCrate(id) {
    const h = this.hero;
    if (id === this.held) {
      if (this.arms[id] < 3) {
        this.arms[id]++;
        this.sound.weaponUp?.(this.arms[id]);
        this.fx.sparks(h.x, h.y - 60, 0, 24, 2.4, 1.8, 0.5, 520, 0, -1, 2.4);
      } else {
        // already maxed: a pinch of health and coins
        this.heal(12);
        this.coins += 25;
        this.sound.weaponUp?.(3);
      }
      this.events.weapon?.(id, false);
      return;
    }
    const isNew = !this.arms[id];
    // a gun found late in a run comes in one star below the one in hand, so a swap is never a big step down
    if (isNew) this.arms[id] = Math.max(1, this.arms[this.held] - 1);
    this.held = id;
    this.wTimer = 0.05;
    this.flameT = 0;
    this.sound.weaponSwap?.(this.gun(id));
    this.events.weapon?.(id, isNew);
  }

  updateSurges(dt) {
    const S = this.surge;
    for (const k of SURGES) {
      if (S[k] <= 0) continue;
      if (this.calm()) continue; // the clock stops between waves
      S[k] -= dt;
      if (S[k] <= 0) {
        S[k] = 0;
        this.sound.surgeEnd?.();
      }
    }
  }

  // ---------------------------------------------------------------- feel
  shake(k) {
    this.trauma = Math.min(1, this.trauma + k);
  }
  hitstop(s) {
    this.stopT = Math.max(this.stopT, s);
  }

  // level-up cards (the app shows them and calls pick)
  cards() {
    return drawCards(this);
  }
  pick(card) {
    const r = applyCard(this, card);
    if (card.evolution) this.sound.evolve();
    else this.sound.card();
    return r;
  }

  evolveWeapon(from, to) {
    this.evo[from] = to;
  }

  // the wave's reward is taken: its XP may bank more level-ups, picked in the break
  claimReward() {
    const rw = this.reward;
    this.reward = null;
    if (rw) this.gainXp(rw.xp);
    this.phase = 'break';
    return rw;
  }

  // after the break's card picks: on to the next wave, or the chapter is won
  nextWave() {
    if (this.wave >= this.chapter.waves.length - 1) {
      this.phase = 'victory';
      this.events.victory?.();
      return;
    }
    this.beginWave(this.wave + 1);
  }

  // between waves nothing fires and nothing hurts
  calm() {
    return this.phase === 'reward' || this.phase === 'break' || this.phase === 'victory';
  }
}

export { STEP, HOT, UNDER, BOLT, SPARK, SMOKE, GLOW, WALK, BOSS };
