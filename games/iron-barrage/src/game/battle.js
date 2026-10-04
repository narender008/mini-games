// One battle: the ground, the tanks, the turns, the wind, every shot and
// what it does. Turn order is the player first, then each computer tank.
// A turn: drive (fuel permitting), aim, pick a weapon, fire; then the shot
// flies, the ground and the tanks settle, the dead burn, and the next tank
// goes. Last side with a tank standing wins.
import { WORLD, clamp, rand, gauss, DEG, damp } from '../config.js';
import { Terrain } from '../world/terrain.js';
import { flatten } from '../world/battlefields.js';
import { Tank } from './tank.js';
import { WEAPONS } from './weapons.js';
import { Projectiles } from './projectiles.js';
import { Hazards } from './hazards.js';
import { Commander } from './ai.js';

export const SKINS = {
  player: { tint: [0.115, 0.13, 0.05] },
  sand: { tint: [0.2, 0.155, 0.085] },
  grey: { tint: [0.085, 0.09, 0.09] },
  winter: { tint: [0.5, 0.52, 0.52] },
  rust: { tint: [0.26, 0.12, 0.06] },
};

const FALL_SAFE = 9;

export class Battle {
  constructor(app, setup) {
    this.app = app;
    this.setup = setup;
    this.fx = app.fx;
    this.sound = app.sound;
    this.bf = setup.battlefield;
    this.terrain = new Terrain();
    this.projectiles = new Projectiles(this);
    this.hazards = new Hazards(this); // napalm fires, airstrikes, shield domes (hazards.js)
    this.tanks = [];
    this.turn = -1;
    this.phase = 'intro';
    this.phaseT = 0;
    this.time = 0;
    this.timeScale = 1;
    this.slow = null;
    this.wind = 0;
    this.windShown = 0;
    this.result = null;
    this.events = [];
    this.round = 1;
    this.lastShot = null;
    this.focus = null;
    this.pendingDeaths = [];
    this.settleT = 0;
    this.fired = false;
    this.build();
  }

  // ---- set-up
  build() {
    const s = this.setup;
    const bf = this.bf;
    const seed = s.seed ?? bf.seed;
    let h = bf.profile(seed);
    // where the tanks start: the player on the left, the enemy spread on the right
    const W = WORLD.width;
    const n = s.enemies.length;
    const px = clamp(36 + rand(-6, 10), 24, 60);
    const spots = [px];
    for (let i = 0; i < n; i++) {
      const lo = W * 0.56 + ((W * 0.36) / n) * i;
      spots.push(clamp(lo + rand(4, (W * 0.36) / n - 8), W * 0.5, W - 22));
    }
    for (const x of spots) h = flatten(h, x, 7);
    this.spawns = spots;
    this.seed = seed;
    this.terrain.fromHeights(h);
    if (bf.sculpt) bf.sculpt(this.terrain, seed);
    this.terrain.commit();
    const atlas = this.app.atlas;
    const mk = (o) => {
      const t = new Tank(o);
      t.setMounts(atlas);
      t.y = this.terrain.top(t.x);
      t.pose();
      return t;
    };
    this.player = mk({
      id: 0,
      name: s.player.name || 'You',
      type: s.player.type,
      team: 0,
      skin: SKINS.player,
      x: spots[0],
      facing: 1,
      upgrades: s.player.upgrades,
      inventory: { ...s.player.inventory },
    });
    this.tanks.push(this.player);
    s.enemies.forEach((e, i) => {
      const t = mk({
        id: i + 1,
        name: e.name,
        type: e.type,
        team: 1,
        skin: SKINS[e.skin || bf.enemySkin || 'grey'],
        x: spots[i + 1],
        facing: -1,
        upgrades: e.upgrades,
        inventory: { ...e.inventory },
      });
      t.ai = new Commander(this, t, e.level);
      this.tanks.push(t);
    });
    this.wind = clamp(gauss() * 0.35, -0.8, 0.8);
  }

  windAcc() {
    return this.wind * WORLD.maxWind;
  }

  current() {
    return this.tanks[this.turn] || null;
  }

  isPlayerTurn() {
    return this.phase === 'aim' && this.current() === this.player;
  }

  enemies(t) {
    return this.tanks.filter((o) => o.alive && o.team !== t.team);
  }

  // ---- the turn cycle
  nextTurn() {
    const n = this.tanks.length;
    let i = this.turn;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (i === 0 && this.turn >= 0) this.round++;
      if (this.tanks[i].alive) break;
    }
    this.turn = i;
    const t = this.current();
    t.fuel = t.maxFuel;
    t.driving = 0;
    t.utilUsed = {}; // each utility works once per turn
    this.hazards.turnStart(t); // burning ground hurts, a shield may run out
    // the wind shifts between turns, now and then sharply
    const gust = Math.random() < 0.15 ? 0.6 : 0.25;
    this.wind = clamp(this.wind * 0.75 + gauss() * gust, -1, 1);
    if (Math.abs(this.wind) < 0.04) this.wind = 0;
    if (!t.inventory[t.weapon]) t.weapon = 'shell';
    this.setPhase('aim');
    this.fired = false;
    this.app.onTurn?.(t);
    if (t.ai) t.ai.begin();
    else this.sound.ui('turn');
  }

  setPhase(p) {
    this.phase = p;
    this.phaseT = 0;
  }

  // ---- actions
  fire(t) {
    if (this.phase !== 'aim' || this.current() !== t || this.fired) return false;
    if (!t.alive || t.hp <= 0) return false; // burnt out at the start of its turn
    const id = t.weapon;
    const w = WEAPONS[id];
    if (!w || !(t.inventory[id] > 0)) return false;
    if (w.utility) return this.useUtility(t, id);
    // some weapons are limited per battle (the Sunburst: one)
    if (w.perBattle && (t.used?.[id] || 0) >= w.perBattle) return false;
    (t.used ||= {})[id] = (t.used[id] || 0) + 1;
    if (t.inventory[id] !== Infinity) t.inventory[id]--;
    if (!(t.inventory[t.weapon] > 0)) t.weapon = 'shell';
    this.fired = true;
    t.driving = 0;
    t.pose();
    const sp = WORLD.maxSpeed * (0.12 + 0.88 * t.power) * (w.speedK ?? 1) * t.gunBonus;
    const vx = Math.cos(t.aim) * sp;
    const vy = Math.sin(t.aim) * sp;
    const p = this.projectiles.launch(t, id, t.muzzleX, t.muzzleY, vx, vy);
    this.lastShot = p;
    t.stats.shots++;
    this.shotNo = (this.shotNo || 0) + 1;
    this.fx.muzzle(t.muzzleX, t.muzzleY, t.aim, w.power > 1.2 ? 1.3 : 1);
    // recoil rocks the tank back on its suspension
    t.vx -= Math.cos(t.aim) * 0.9 * clamp(w.power, 0.6, 1.8);
    this.sound.fire(w.fire, t.muzzleX);
    this.setPhase('flight');
    return true;
  }

  // Utilities work on your own tank, do not end the turn and work once per
  // turn each (t.utilUsed is reset in nextTurn). Only on the tank's own turn,
  // while aiming and before it has fired. Returns true if it was used, false
  // (nothing spent) if it could not be: no stock, used already this turn, or
  // it would do nothing (a repair kit at full health, a shield already up).
  // The tank's selected weapon is left alone unless it was the utility itself.
  useUtility(t, id) {
    const w = WEAPONS[id];
    if (!w || !w.utility || this.phase !== 'aim' || this.current() !== t || this.fired || !t.alive || t.hp <= 0) return false;
    if (!(t.inventory[id] > 0)) return false;
    if ((t.utilUsed && t.utilUsed[id]) || (w.use && w.use(t, this) === false)) {
      if (!t.ai) this.sound.ui('deny');
      return false;
    }
    (t.utilUsed ||= {})[id] = true;
    if (t.inventory[id] !== Infinity) t.inventory[id]--;
    if (t.weapon === id) t.weapon = 'shell';
    return true;
  }

  // ---- what a blast does
  detonate(p, x, y, hitTank, opts = {}) {
    const w = p.w;
    if (p.owner && !p.sub) p.owner.lastImpact = { x, y };
    this.blast(x, y, w, p.owner, hitTank, opts);
  }

  blast(x, y, w, owner, hitTank = null, opts = {}) {
    const T = this.terrain;
    const n = T.normal(x, y, { x: 0, y: 1 });
    const inGround = !hitTank && opts.air !== true;
    const r = w.radius;
    T.carve(x, y, r);
    if (opts.fx !== false) {
      this.fx.blast(w.boom, x, y, { r, power: w.power, nx: n.x, ny: n.y, inGround, weapon: w, hitTank });
      this.sound.boom(w.boom, x, w.power);
      if (hitTank) this.sound.hit('metal', x, w.power);
    }
    this.damageArea(x, y, w, owner, hitTank);
    if (w.onBlast) w.onBlast(this, x, y, owner); // the Sunburst's shock
    this.app.props?.blast(x, y, r, w.power, this.fx);
    this.events.push({ type: 'blast', x, y, r, power: w.power });
    this.lastBlast = { x, y, t: this.time, power: w.power };
  }

  damageArea(x, y, w, owner, direct) {
    for (const t of this.tanks) {
      const d = t === direct ? 0 : t.distance(x, y);
      if (d > w.blast) continue;
      const f = 1 - d / w.blast;
      // knock the tank about, even a wreck
      const dir = Math.sign(t.x - x) || 1;
      const kick = w.power * f * (t.alive ? 3.2 : 2);
      t.vx += dir * kick;
      if (w.power > 1.5 && f > 0.4) t.vy += kick * 0.6;
      // a thermobaric blast throws tanks (and wrecks) into the air: they come down hard
      if (w.impulse) {
        t.vx += dir * w.impulse * f * 0.6;
        t.vy += w.impulse * f * 0.75;
      }
      if (!t.alive) {
        t.blood *= 0.6;
        continue;
      }
      let dmg = w.damage * Math.pow(f, 1.4);
      if (t !== direct && w.splashK !== undefined) dmg *= w.splashK; // a near miss with a dart does little
      if (t === owner) dmg *= 0.6;
      this.harm(t, dmg, owner, dir, t === direct ? w.pierce || 0 : 0);
    }
  }

  // Damage to a living tank after its armour (a share `pierce` of it ignored)
  // and its shield, which soaks up most of each hit until it is used up.
  harm(t, dmg, owner, dir = 1, pierce = 0) {
    dmg *= 1 - t.armour * (1 - pierce);
    if (t.shield > 0) {
      const absorbed = Math.min(t.shield, dmg * 0.75);
      t.shield -= absorbed;
      dmg -= absorbed;
      this.sound.hit('shield', t.x, 1);
      this.hazards.shieldPulse(t, t.shield > 0 ? 0.7 : 1);
    }
    this.hurt(t, dmg, owner, dir);
  }

  hurt(t, dmg, by, dir = 1) {
    dmg = Math.round(dmg);
    if (dmg <= 0 || !t.alive) return;
    const took = Math.min(dmg, t.hp);
    t.hp = Math.max(0, t.hp - dmg);
    t.hurt = 1;
    t.char = Math.min(0.75, t.char + dmg / t.maxHp * 0.5);
    // credit only the health actually taken, and a shot hits once however
    // many bomblets or bombs land
    if (by && by !== t && by.team !== t.team) {
      by.stats.damage += took;
      if (by.hitShot !== this.shotNo) {
        by.hitShot = this.shotNo;
        by.stats.hits++;
      }
    }
    this.app.hud?.float(t.x, t.y + t.hgt + 1.5, `-${dmg}`, t.team === 0 ? 'bad' : 'good');
    if (t.hp <= 0) this.pendingDeaths.push({ t, by, dir });
  }

  onLand(t, speed, chute) {
    if (speed > 4) this.sound.hit('thud', t.x, Math.min(1.5, speed / 12));
    if (speed > 6) {
      for (let i = 0; i < 10; i++) this.fx.smoke(t.x + rand(-4, 4), t.y + 0.3, rand(-6, 6), rand(0.5, 2), rand(0.8, 1.6), rand(1.5, 3), 0.18, 0.5);
      this.fx.shake(Math.min(0.4, speed * 0.02));
    }
    if (chute) t.chute = false; // the parachute opened and is used up
    if (!chute && speed > FALL_SAFE && t.alive) {
      const dmg = (speed - FALL_SAFE) * 2.6;
      this.hurt(t, dmg, null, 1);
    }
  }

  kill(t, by, dir) {
    if (!t.alive) return;
    t.alive = false;
    t.hp = 0;
    t.crew = false;
    t.blood = 0.85;
    t.hot = 1;
    t.char = 1;
    t.wreckX = t.x;
    t.driving = 0;
    if (by && by !== t) by.stats.kills++;
    this.fx.tankKill(t, dir);
    this.events.push({ type: 'kill', t, by });
    // hit-stop, then slow motion on the kill
    this.slow = { t: 0 };
    this.focus = { x: t.x, y: t.y + 3, t: 0 };
    this.app.hud?.killFeed(t, by);
  }

  // ---- per frame (real seconds)
  update(realDt) {
    // the slow-motion beat on a kill
    if (this.slow) {
      const s = this.slow;
      s.t += realDt;
      if (s.t < 0.11) this.timeScale = 0.03;
      else if (s.t < 1.5) this.timeScale = 0.22 + ((s.t - 0.11) / 1.39) ** 2 * 0.78;
      else {
        this.timeScale = 1;
        this.slow = null;
      }
      this.sound.setTimeScale(this.timeScale);
    }
    const dt = realDt * this.timeScale;
    this.time += dt;
    this.phaseT += dt;
    const g = WORLD.gravity;
    this.windShown = damp(this.windShown, this.wind, 3, realDt);

    // the computer's turn
    const cur = this.current();
    if (this.phase === 'aim' && cur && cur.ai) cur.ai.update(dt);

    for (const t of this.tanks) {
      t.update(dt, this.terrain, this.tanks, g, (tk, sp, ch) => this.onLand(tk, sp, ch));
      if (!t.alive) t.hot = Math.max(0, t.hot - dt * 0.05);
      // a badly damaged tank smokes
      if (t.alive && t.hp < t.maxHp * 0.45) {
        t.smokeT -= dt;
        if (t.smokeT <= 0) {
          t.smokeT = t.hp < t.maxHp * 0.2 ? 0.08 : 0.2;
          const back = t.x - t.facing * t.len * 0.3;
          this.fx.smoke(back, t.y + t.hgt * 0.6, rand(-0.4, 0.4), rand(1.5, 3), rand(0.4, 0.8), rand(2, 4), 0.05, 0.7);
          if (t.hp < t.maxHp * 0.2 && Math.random() < 0.4) this.fx.fire(back, t.y + t.hgt * 0.62, 0, 1.5, 0.4, 0.3, 0.8);
        }
      }
    }
    this.projectiles.update(dt);
    this.hazards.update(dt);
    this.engines(dt);

    // deaths wait for the blast that caused them to show first
    if (this.pendingDeaths.length) {
      this.deathT = (this.deathT || 0) + dt;
      if (this.deathT > 0.12) {
        const d = this.pendingDeaths.shift();
        this.kill(d.t, d.by, d.dir);
        this.deathT = 0;
      }
    }

    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 2.4) this.nextTurn();
        break;
      case 'aim':
        if (cur && !cur.alive) this.endTurn();
        break;
      case 'flight':
        if (!this.projectiles.active && !this.busy()) this.setPhase('settle');
        break;
      case 'settle':
        if (this.projectiles.active) this.setPhase('flight');
        else if (this.phaseT > 1.1 && !this.busy() && !this.slow && !this.pendingDeaths.length) this.endTurn();
        break;
      case 'over':
        break;
    }
    this.events.length = 0;
  }

  // The tank whose turn it is idles its engine; driving revs it and kicks
  // up dust from the tracks.
  engines(dt) {
    const cur = this.phase === 'aim' ? this.current() : null;
    for (const t of this.tanks) {
      const on = t === cur && t.alive;
      if (on && !t.engineV) t.engineV = this.sound.engine();
      if (!on && t.engineV) {
        t.engineV.stop();
        t.engineV = null;
      }
      if (!t.engineV) continue;
      const moving = t.driving && t.grounded && t.fuel > 0;
      t.engineV.update(t.x, moving ? 1 : 0.12);
      if (moving) {
        t.dustT = (t.dustT || 0) - dt;
        if (t.dustT <= 0) {
          t.dustT = 0.06;
          const back = t.x - t.driving * t.len * 0.45;
          const soil = this.fx.soil;
          const i = this.fx.smoke(back, t.y + 0.3, -t.driving * rand(1, 3), rand(0.3, 1.2), rand(0.4, 0.8), rand(1, 2), 0, 0.45);
          if (i >= 0) {
            const P = this.fx.p;
            P.r[i] = soil[0] * 1.6 + 0.05;
            P.g[i] = soil[1] * 1.6 + 0.045;
            P.b[i] = soil[2] * 1.6 + 0.04;
            P.drag[i] = 2;
          }
        }
      }
    }
  }

  // Anything still moving that the next turn should wait for?
  busy() {
    if (this.hazards.busy()) return true; // an airstrike on its way
    if (this.app.waitHooks?.some((f) => f())) return true;
    for (const t of this.tanks) if (!t.grounded || Math.abs(t.vx) > 0.4) return true;
    return false;
  }

  endTurn() {
    const players = this.player.alive;
    const foes = this.tanks.some((t) => t.team !== 0 && t.alive);
    if (!players || !foes) {
      this.phase = 'over';
      this.phaseT = 0;
      this.result = players ? 'win' : 'lose';
      this.app.onBattleOver?.(this.result);
      return;
    }
    this.nextTurn();
  }
}

export { DEG };
