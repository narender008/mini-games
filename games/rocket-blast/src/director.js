// Game rules for each mode: where and how fast the toy formations come,
// what a hit is worth, MEGA POWER!, and in Big Kid mode the waves, the
// combo streaks, power-ups and the friendly block boss. Nothing here can be
// lost: toys that reach the bottom just boop away.
//
//   little  Little Pilot: slow Tetris formations, a star per hit, endless.
//   big     Big Kid: faster formations that break apart, combos and
//           multipliers, power-ups, waves and a boss every third wave.
//   free    Free Blast: the sky is always full; any tap or drag blasts.
//   menu    the attract loop behind the start screen.
import { CELL, rand, pick, clamp } from './config.js';
import { Combo } from './combo.js';
import { POWERS } from './powerups.js';

const SHAPES = {
  O: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  L: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
  ],
  J: [
    [1, 0],
    [1, 1],
    [1, 2],
    [0, 0],
  ],
  T: [
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 0],
  ],
  S: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  Z: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
};
const LITTLE_SHAPES = ['O', 'I', 'L', 'T', 'J', 'O', 'T'];
const ALL_SHAPES = Object.keys(SHAPES);

function shapeCells(name, turns) {
  let cells = SHAPES[name].map(([x, y]) => [x, y]);
  for (let k = 0; k < turns; k++) cells = cells.map(([x, y]) => [y, -x]);
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

export const MEGA_EVERY = { little: 10, free: 10, big: 25, menu: Infinity };
const MEGA_TIME = 7;

export class Director {
  constructor(app) {
    this.app = app;
    this.combo = new Combo();
    this.reset('menu');
  }

  reset(mode) {
    this.mode = mode;
    this.formations = [];
    this.spawnTimer = 0.3;
    this.lastColor = -1;
    this.hits = 0;
    this.score = 0;
    this.wave = 1;
    this.waveSpawned = 0;
    this.waveTotal = this.formationsFor(1);
    this.waveBreak = 0;
    this.boss = null;
    this.bosses = 0;
    this.powerTimer = rand(9, 14);
    this.powers = { rapid: 0, triple: 0, double: 0 };
    this.combo.reset();
    this.shotSeq = 0;
  }

  formationsFor(wave) {
    return Math.round(5 + wave * 1.5);
  }

  get field() {
    return this.app.field;
  }

  cols() {
    return Math.max(4, Math.floor(this.field.halfW * 2 - 0.8));
  }

  colX(c) {
    return (c - (this.cols() - 1) / 2) * CELL;
  }

  pickColor() {
    let c;
    do c = Math.floor(Math.random() * 8);
    while (c === this.lastColor);
    this.lastColor = c;
    return c;
  }

  // ------------------------------------------------------------ spawning

  spawnFormation({ shapes = LITTLE_SHAPES, speed = 0.55, breakAt = null, shift = 0, z = 0 } = {}) {
    const f = this.field;
    const n = this.cols();
    const cells = shapeCells(pick(shapes), Math.floor(Math.random() * 4));
    const w = Math.max(...cells.map((c) => c[0])) + 1;
    const top = f.halfH + 0.9;
    // columns still busy near the top edge
    const busy = new Set();
    for (const e of this.app.enemies) {
      if (!e.alive || e.boss || e.y < f.halfH - 0.6) continue;
      busy.add(Math.round(e.x / CELL + (n - 1) / 2));
    }
    const options = [];
    for (let c = 0; c <= n - w; c++) {
      let ok = true;
      for (let k = c; k < c + w; k++) if (busy.has(k)) ok = false;
      if (ok) options.push(c);
    }
    if (!options.length) return null;
    const c0 = pick(options);
    const colorIndex = this.pickColor();
    const form = { enemies: [], vy: -speed, breakAt, broken: false, shift, shiftT: rand(0.8, 1.6), dir: Math.random() < 0.5 ? -1 : 1 };
    // now and then one toy in a formation is a rare golden one
    const golden = this.mode !== 'menu' && Math.random() < 0.12 ? Math.floor(Math.random() * cells.length) : -1;
    cells.forEach(([dx, dy], i) => {
      const e = this.app.spawnEnemy({ x: this.colX(c0 + dx), y: top + dy * CELL, colorIndex });
      e.z = z;
      e.formation = form;
      e.gx = e.x;
      if (i === golden) e.makeGolden();
      form.enemies.push(e);
    });
    this.formations.push(form);
    return form;
  }

  // Free Blast: drop a small shape into a free patch of the grid.
  spawnFreeShape() {
    const f = this.field;
    const n = this.cols();
    const minY = -f.halfH + 3.2;
    const maxY = f.halfH - 1;
    const rows = Math.max(3, Math.floor(maxY - minY));
    const taken = new Set(this.app.enemies.filter((e) => e.alive).map((e) => `${Math.round(e.gx / CELL + (n - 1) / 2)},${Math.round(e.gy - minY)}`));
    for (let tries = 0; tries < 12; tries++) {
      const cells = shapeCells(pick(ALL_SHAPES), Math.floor(Math.random() * 4));
      const w = Math.max(...cells.map((c) => c[0])) + 1;
      const h = Math.max(...cells.map((c) => c[1])) + 1;
      const c0 = Math.floor(Math.random() * (n - w + 1));
      const r0 = Math.floor(Math.random() * (rows - h + 1));
      if (cells.some(([dx, dy]) => taken.has(`${c0 + dx},${r0 + dy}`))) continue;
      const colorIndex = this.pickColor();
      for (const [dx, dy] of cells) {
        const e = this.app.spawnEnemy({ x: this.colX(c0 + dx), y: minY + r0 + dy, colorIndex });
        e.gx = e.x;
        e.gy = e.y;
      }
      return true;
    }
    return false;
  }

  aliveCount() {
    let n = 0;
    for (const e of this.app.enemies) if (e.alive && !e.boss) n++;
    return n;
  }

  // ------------------------------------------------------------ frame

  update(dt, t, now) {
    const mode = this.mode;
    const f = this.field;
    if (mode === 'free') this.updateFree(dt, t);
    else if (mode === 'big') this.updateBig(dt, t, now);
    else this.updateLittle(dt);

    // move formations
    for (const form of this.formations) {
      if (!form.broken && form.breakAt !== null && form.enemies.some((e) => e.alive && e.y < form.breakAt)) this.breakApart(form);
      if (!form.broken && form.shift) {
        form.shiftT -= dt;
        if (form.shiftT <= 0) {
          form.shiftT = rand(1, 1.8);
          const n = this.cols();
          const xs = form.enemies.filter((e) => e.alive).map((e) => e.gx);
          if (xs.length) {
            const lo = Math.min(...xs) + form.dir * CELL;
            const hi = Math.max(...xs) + form.dir * CELL;
            if (lo < this.colX(0) - 0.01 || hi > this.colX(n - 1) + 0.01) form.dir *= -1;
            // never step sideways into another toy; turn round instead
            if (this.shiftBlocked(form, form.dir * CELL)) form.dir *= -1;
            else for (const e of form.enemies) e.gx += form.dir * CELL;
          }
        }
      }
      for (const e of form.enemies) {
        if (!e.alive) continue;
        e.y += (e.vyOwn ?? form.vy) * dt;
        // glide to the grid column (sideways steps and break-apart hops)
        const dx = e.gx - e.x;
        e.vx = dx * 6;
        e.x += e.vx * dt;
      }
    }
    this.formations = this.formations.filter((form) => form.enemies.some((e) => !e.gone));
    if (mode !== 'free') this.separate(dt);

    // anything reaching the bottom just boops away
    const bottom = -f.halfH + 0.75;
    for (const e of this.app.enemies) {
      if (e.alive && !e.boss && e.y < bottom) this.app.bottomPop(e);
    }
  }

  // Would stepping this formation sideways by dx land a toy on another one?
  shiftBlocked(form, dx) {
    return this.app.enemies.some(
      (o) => o.alive && !o.boss && o.formation !== form &&
        form.enemies.some((e) => e.alive && Math.abs((o.gx ?? o.x) - (e.gx + dx)) < 0.9 && Math.abs(o.y - e.y) < 1.2),
    );
  }

  // Toys are solid: a faster toy settles on top of a slower one instead of
  // sliding through it, eased so nothing jumps.
  separate(dt) {
    const list = this.app.enemies.filter((e) => e.alive && !e.boss).sort((a, b) => a.y - b.y);
    const step = dt * 5;
    for (let i = 0; i < list.length; i++) {
      const lo = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const up = list[j];
        const gap = 0.98 - (up.y - lo.y);
        if (gap <= 0) break;
        if (Math.abs(up.x - lo.x) >= 0.95) continue;
        const same = up.formation && up.formation === lo.formation;
        if (same && !up.formation.broken) continue;
        // keep whole formations in shape: move the loose toy, not the formation one
        const upHeld = up.formation && !up.formation.broken;
        const loHeld = lo.formation && !lo.formation.broken;
        if (upHeld && !loHeld) lo.y -= Math.min(gap, step);
        else up.y += Math.min(gap, step);
      }
    }
  }

  breakApart(form) {
    form.broken = true;
    const n = this.cols();
    const all = this.app.enemies.filter((o) => o.alive && !o.boss);
    const clear = (e, gx) => all.every((o) => o === e || Math.abs((o.gx ?? o.x) - gx) > 0.9 || Math.abs(o.y - e.y) > 1.4);
    const inside = (gx) => gx >= this.colX(0) - 0.01 && gx <= this.colX(n - 1) + 0.01;
    for (const e of form.enemies) {
      if (!e.alive) continue;
      // hop to a free column nearby (or stay put if every one is taken)
      const hops = [-2, -1, 1, 2].sort(() => Math.random() - 0.5);
      const hop = hops.find((h) => inside(e.gx + h * CELL) && clear(e, e.gx + h * CELL));
      if (hop !== undefined) e.gx += hop * CELL;
      e.vyOwn = form.vy * rand(0.85, 1.35);
      e.jiggle(0.6);
    }
    this.app.audio.bloop();
  }

  updateLittle(dt) {
    const n = this.cols();
    // MEGA clears toys fast, so keep the sky topped up while it lasts
    const mega = this.app.megaT > 0;
    const target = clamp(Math.round(n * (mega ? 1.6 : 1.2)), 10, 32);
    this.spawnTimer -= dt;
    const alive = this.aliveCount();
    if (this.spawnTimer <= 0 && alive < target) {
      const speed = this.field.halfH > 6.5 ? 0.7 : 0.55;
      if (this.spawnFormation({ speed })) this.spawnTimer = mega ? 0.3 : alive < 5 ? 0.7 : 1.9;
      else this.spawnTimer = 0.4;
    }
  }

  updateFree(dt) {
    const f = this.field;
    const n = this.cols();
    const rows = Math.max(3, Math.floor(f.halfH * 2 - 4.2));
    const target = Math.floor(n * rows * 0.5);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.aliveCount() < target) {
      this.spawnFreeShape();
      this.spawnTimer = 0.18;
    }
    // gentle floating in place
    for (const e of this.app.enemies) {
      if (!e.alive || e.gy === undefined) continue;
      e.y = e.gy + Math.sin(this.app.time * 1.3 + e.phase) * 0.08;
    }
  }

  updateBig(dt, t, now) {
    const f = this.field;
    const w = this.wave;
    // combo lapses
    const ended = this.combo.lapse(now);
    if (ended >= 8) this.app.ui.callout(`${ended} combo!`, 'small');
    for (const k of Object.keys(this.powers)) this.powers[k] = Math.max(0, this.powers[k] - dt);

    if (this.waveBreak > 0) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) this.startWave();
      return;
    }
    const bossWave = w % 3 === 0;
    if (bossWave) {
      if (!this.boss && this.waveSpawned === 0) this.spawnBoss();
      if (this.boss) this.updateBoss(dt, t);
      // a few escorts keep the combo going
      this.spawnTimer -= dt;
      if (this.boss && this.spawnTimer <= 0 && this.aliveCount() < 8) {
        this.spawnFormation({ shapes: ALL_SHAPES, speed: 0.9 + w * 0.05, breakAt: rand(-0.3, 0.3) * f.halfH });
        this.spawnTimer = 2.6;
      }
      if (!this.boss && this.waveSpawned > 0 && this.aliveCount() === 0) this.waveDone();
    } else {
      this.spawnTimer -= dt;
      if (this.waveSpawned < this.waveTotal && this.spawnTimer <= 0) {
        const speed = Math.min(2.3, 0.95 + w * 0.12) * (f.halfH > 6.5 ? 1.15 : 1);
        const breaks = Math.random() < Math.min(0.85, 0.3 + w * 0.1);
        const form = this.spawnFormation({
          shapes: ALL_SHAPES,
          speed,
          breakAt: breaks ? rand(-0.15, 0.55) * f.halfH : null,
          shift: !breaks && Math.random() < 0.5 ? 1 : 0,
          z: rand(-0.25, 0.25),
        });
        if (form) {
          this.waveSpawned++;
          this.spawnTimer = Math.max(0.55, 1.5 - w * 0.08);
        } else this.spawnTimer = 0.3;
      }
      if (this.waveSpawned >= this.waveTotal && this.aliveCount() === 0) this.waveDone();
    }
    // power-ups now and then
    this.powerTimer -= dt;
    if (this.powerTimer <= 0) {
      this.powerTimer = rand(12, 18);
      this.app.powerups.spawn(rand(-f.halfW + 1.5, f.halfW - 1.5), f.halfH + 1);
    }
  }

  startWave() {
    this.wave++;
    this.waveSpawned = 0;
    this.waveTotal = this.formationsFor(this.wave);
    this.spawnTimer = 0.6;
    this.app.ui.wave(this.wave);
    const boss = this.wave % 3 === 0;
    this.app.ui.callout(boss ? 'Big Block!' : `Wave ${this.wave}`, boss ? '' : 'small', boss ? `Wave ${this.wave}` : '');
    this.app.audio.milestone(1);
  }

  waveDone() {
    if (this.waveBreak > 0) return;
    const bonus = 50 * this.wave;
    this.addScore(bonus);
    this.app.ui.callout('Wave clear!', 'small', `+${bonus}`);
    this.app.audio.powerup();
    this.waveBreak = 1.8;
    this.waveSpawned = 1; // keep the boss wave from re-spawning its boss
  }

  // ------------------------------------------------------------ boss

  spawnBoss() {
    const f = this.field;
    const size = clamp(f.halfW * 0.55, 2.6, 3.6);
    const hp = 50 + this.bosses * 20;
    const e = this.app.spawnEnemy({ x: 0, y: f.halfH + size, colorIndex: this.pickColor(), size, hp, boss: true });
    e.z = -0.6;
    this.boss = e;
    this.bossT = 0;
    this.waveSpawned = 1;
    this.spawnTimer = 2;
    this.app.ui.boss(1);
    this.app.audio.fanfare(0.6);
  }

  updateBoss(dt, t) {
    const e = this.boss;
    const f = this.field;
    this.bossT += dt;
    const home = f.halfH - e.size * 0.5 - 1.6;
    const span = Math.max(0, f.halfW - e.size * 0.6 - 0.3);
    const tx = Math.sin(this.bossT * 0.55) * span;
    const ty = home + Math.sin(this.bossT * 1.4) * 0.3;
    e.vx = (tx - e.x) * 2;
    e.x += e.vx * dt;
    e.y += (ty - e.y) * Math.min(1, dt * 1.5);
  }

  bossHit(e, x, y, info) {
    const app = this.app;
    // the boss soaks up at most ~12 hits a second, so a fight lasts a while
    // even with every power-up running; extra shots just sparkle
    if (app.realTime - (e.lastHit ?? -1) < 0.08) {
      app.glow.add({ x, y, z: 1, size: 0.6, life: 0.2, frame: 2, rot: Math.random() * 6, r: 2.4, g: 2, b: 1.2 });
      return;
    }
    e.lastHit = app.realTime;
    e.hp--;
    e.jiggle(0.5);
    app.fx.burst(x, y, e.color, 0.55);
    app.audio.bossHit(app.panFor(x));
    this.scoreHit(x, y, info, 2);
    app.ui.boss(e.hp / e.maxHp);
    if (e.hp <= 0) {
      e.kill();
      this.boss = null;
      this.bosses++;
      app.fx.burst(e.x, e.y, e.color, 3);
      app.fx.shower(e.x, e.y + 1, e.size * 1.2, 110);
      for (let i = 0; i < 5; i++) setTimeout(() => app.fx.firework(rand(-this.field.halfW + 2, this.field.halfW - 2), rand(0, this.field.halfH - 1)), i * 220);
      app.audio.bossPop();
      app.shake(1);
      const bonus = 500 + 250 * (this.bosses - 1);
      this.addScore(bonus);
      app.ui.callout('BOSS POP!', 'mega', `+${bonus}`);
      app.ui.boss(null);
    }
  }

  // ------------------------------------------------------------ scoring

  addScore(n) {
    if (this.mode === 'free' || this.mode === 'menu') return;
    this.score += n;
    this.app.ui.score(this.score);
    this.app.saveBest(this.mode, this.score);
  }

  // an enemy was blasted by the player; returns the streak for the chime
  onKill(e, info = {}) {
    const app = this.app;
    if (this.mode === 'menu') return 1;
    this.hits++;
    let streak = (this.hits % 10) + 1;
    if (this.mode === 'little') {
      const stars = e.golden ? 5 : 1;
      this.addScore(stars);
      const p = app.screenPos(e.x, e.y);
      for (let i = 0; i < stars; i++) setTimeout(() => app.ui.flyStar(p.x, p.y), i * 90);
    } else if (this.mode === 'big') {
      streak = this.scoreHit(e.x, e.y, info, e.golden ? 100 : 10);
      if (Math.random() < 0.03 || e.golden) app.powerups.spawn(e.x, e.y);
    }
    if (this.hits % MEGA_EVERY[this.mode] === 0) app.megaStart();
    return streak;
  }

  // Big Kid points with the combo multiplier; returns the streak length.
  scoreHit(x, y, info, base) {
    if (this.mode !== 'big') return 1;
    const app = this.app;
    const r = this.combo.hit(app.realTime, info.shot || 0);
    const dbl = this.powers.double > 0 ? 2 : 1;
    const pts = (base * r.mult + r.bonus) * dbl;
    this.addScore(pts);
    const p = app.screenPos(x, y);
    app.ui.points(p.x, p.y, `+${pts}`, r.mult >= 3 ? 'gold' : '');
    if (r.tag) app.ui.points(p.x, p.y + 40, r.tag, 'pink');
    if (r.milestone) {
      app.ui.callout(r.milestone, '', `${r.count} in a row!`);
      app.audio.milestone(r.level);
      for (let i = 0; i < Math.min(4, r.level + 1); i++) setTimeout(() => app.fx.firework(rand(-this.field.halfW + 1.5, this.field.halfW - 1.5), rand(0, this.field.halfH - 1)), i * 180);
      app.post.bloomBoost = 0.4;
    } else if (r.multUp) {
      app.ui.callout(`×${r.mult}`, 'small', 'combo');
      app.audio.milestone(Math.max(1, r.mult - 2));
    }
    return r.count;
  }

  collectPower(kind, x, y) {
    const app = this.app;
    const pw = POWERS[kind];
    app.audio.powerup();
    app.fx.burst(x, y, pw.color, 0.9);
    const p = app.screenPos(x, y);
    app.ui.points(p.x, p.y, pw.name, 'gold');
    if (kind === 'bomb') {
      let k = 0;
      for (const e of app.enemies) {
        if (!e.alive) continue;
        const delay = 60 * k++;
        setTimeout(() => app.hit(e, e.x, e.y, { weapon: 'bomb', shot: 'bomb' }), delay);
      }
      app.shake(0.8);
    } else this.powers[kind] = pw.time;
  }

  // weapon upgrades from MEGA or power-ups
  weaponState() {
    return { mega: this.app.megaT > 0 || this.powers.triple > 0, rapid: this.powers.rapid > 0 };
  }
}
