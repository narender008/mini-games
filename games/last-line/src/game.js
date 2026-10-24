// Last Line: the simulation. One Game holds a run: the soldier and the gun,
// the enemy, every round in the air, the line's integrity, the waves, the
// upgrades and the boss. It knows nothing about drawing: effects are left in
// plain arrays (parts, lights, casings) for render.js, and lasting marks on
// the ground go out through hooks.decal. Sound goes to the Sound object.
import { W, H, HORIZON, WIRE_Y, LINE_Y, ZONE, BARRIER_Y, clamp, lerp, rand, pick, angDiff, segCircle, dist2 } from './config.js';
import { ENEMIES, BOSS, WAVES, UPGRADES, REPAIR, TEMPO, COUNT } from './data.js';

export const LINE_MAX = 300;
const BULLET_SPEED = 1750;
const MAX_PARTS = 1500;
const LINE_SEGS = 12;

const HINTS = {
  grunt: 'Hold the left button to spin up the gun. Watch the heat.',
  sapper: 'Sappers carry charges. Drop them before they reach the wire.',
  mortar: 'Mortar teams shell your position. Keep moving off the marks.',
  heavy: 'Shield troopers turn to face you. Move and hit them from the side.',
};

export class Game {
  constructor(sound, hooks = {}) {
    this.snd = sound;
    this.hooks = hooks;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.state = 'ready'; // ready | wave | break | pick | over | won
    this.wave = -1;
    this.waveT = 0;
    this.breakT = 0;
    this.player = {
      x: W / 2, y: 1135, vx: 0, vy: 0, hp: 100, aim: -Math.PI / 2, spin: 0, heat: 0, vent: 0, sinceShot: 9,
      recoil: 0, phase: 0, acc: 0, hurt: 0, flash: 0, flashRot: 0, walk: 0, target: null,
    };
    this.line = LINE_MAX;
    this.lineSegs = new Array(LINE_SEGS).fill(0);
    this.enemies = [];
    this.pending = [];
    this.bullets = [];
    this.eshots = [];
    this.shells = [];
    this.barriers = [];
    this.strikes = [];
    this.fires = [];
    this.flares = [];
    this.flareT = 1;
    this.drones = [];
    this.parts = [];
    this.casings = [];
    this.lights = [];
    this.boss = null;
    this.up = { pierce: 0, fire: 0, drone: 0, barrier: 0, air: 0, cool: 0 };
    this.abil = { barrier: 0, barrierT: 0, air: 0 };
    this.stats = { kills: 0, shots: 0, hits: 0, score: 0, time: 0, byType: {}, lineBy: {} };
    this.shake = 0;
    this.sky = { x: W / 2, i: 0 };
    this.artT = 2;
    this.banner = null;
    this.seen = {};
    this.offer = null;
    this.idSeq = 1;
    this.lineSound = 0;
    this.intro = 0;
  }

  // ---- flow -------------------------------------------------------------

  start(wave = 0) {
    this.reset();
    this.startWave(wave);
  }

  startWave(i) {
    this.wave = i;
    this.waveT = 0;
    this.state = 'wave';
    const def = WAVES[i];
    this.pending = [];
    const mul = 1 + i * 0.06;
    for (const [t, type, n, pattern] of def.groups) {
      const xs = spawnXs(pattern, Math.max(1, Math.round(n * COUNT)));
      xs.forEach((x, k) => this.pending.push({ t: t * TEMPO + k * (pattern === 'line' ? 0.08 : 0.35) + rand(0.2), type, x, mul }));
    }
    this.pending.sort((a, b) => a.t - b.t);
    if (def.boss) this.spawnBoss();
    this.banner = { title: def.boss ? 'Final wave' : `Wave ${i + 1}`, sub: def.name, t: 3.2 };
    this.snd.siren();
    // the hook: artillery walks across the fog as they come, and the gun spins up
    this.intro = 1.6;
    for (let k = 0; k < 5; k++) this.strikes.push({ art: true, x: rand(80, W - 80), y: rand(HORIZON + 10, 330), t: -0.4 - k * 0.38 });
    this.hooks.wave?.(i);
  }

  waveCleared() {
    const last = this.wave >= WAVES.length - 1;
    this.stats.score += Math.round((this.line / LINE_MAX) * 300);
    this.snd.waveClear();
    if (last) {
      this.state = 'won';
      this.hooks.end?.(true);
      return;
    }
    this.state = 'break';
    this.breakT = 1.8;
    this.banner = { title: 'Wave cleared', sub: `Line holding at ${Math.round((this.line / LINE_MAX) * 100)}%`, t: 1.8 };
  }

  makeOffer() {
    const open = Object.keys(UPGRADES).filter((k) => this.up[k] < 3);
    const cards = [];
    // always put something new on the table early, so builds differ
    const fresh = open.filter((k) => this.up[k] === 0);
    if (fresh.length && rand() < 0.75) cards.push(pick(fresh));
    while (cards.length < 3 && cards.length < open.length) {
      const k = pick(open);
      if (!cards.includes(k)) cards.push(k);
    }
    this.offer = cards.map((k) => ({ id: k, rank: this.up[k] + 1, ...UPGRADES[k] }));
    this.state = 'pick';
    this.hooks.offer?.(this.offer);
  }

  choose(id) {
    if (this.state !== 'pick') return;
    if (id === 'repair') {
      this.line = Math.min(LINE_MAX, this.line + (REPAIR.line / 100) * LINE_MAX);
      this.player.hp = Math.min(100, this.player.hp + REPAIR.hp);
      this.lineSegs = this.lineSegs.map((d) => d * 0.4);
    } else if (this.up[id] < 3) {
      this.up[id]++;
      if (id === 'barrier') this.abil.barrier = this.barrierMax();
      if (id === 'air') this.abil.air = 0;
      this.syncDrones();
    }
    // a breather between waves: a little health back either way
    this.player.hp = Math.min(100, this.player.hp + 10);
    this.offer = null;
    this.snd.pick();
    this.startWave(this.wave + 1);
  }

  lose(reason) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.reason = reason;
    this.player.spin = 0;
    this.hooks.end?.(false, reason);
  }

  // ---- numbers from upgrades -------------------------------------------

  heatMul() {
    return [1, 0.75, 0.58, 0.45][this.up.cool];
  }
  rateMul() {
    return [1, 1, 1.1, 1.2][this.up.cool];
  }
  pen() {
    return [0, 0, 0.4, 0.8][this.up.pierce];
  }
  barrierMax() {
    return this.up.barrier;
  }
  barrierRecharge() {
    return [0, 22, 18, 14][this.up.barrier];
  }
  airCooldown() {
    return [0, 32, 26, 20][this.up.air];
  }

  syncDrones() {
    while (this.drones.length < this.up.drone) {
      const p = this.player;
      this.drones.push({ x: p.x, y: p.y - 60, cool: 0.5, aim: -Math.PI / 2, t: rand(6), flash: 0 });
    }
  }

  // ---- step ---------------------------------------------------------------

  step(dt, input) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 10);
    this.sky.i = Math.max(0, this.sky.i - dt * 3.2);
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;

    this.updateAmbient(dt);
    this.updateParts(dt);
    if (this.state === 'ready' || this.state === 'pick') return;
    if (this.state === 'over' || this.state === 'won') {
      // the world goes on behind the end screen
      this.updateEnemies(dt, true);
      this.updateShells(dt);
      return;
    }
    this.stats.time += dt;

    if (this.state === 'wave') {
      this.waveT += dt;
      while (this.pending.length && this.pending[0].t <= this.waveT) this.spawn(this.pending.shift());
    } else if (this.state === 'break') {
      this.breakT -= dt;
      if (this.breakT <= 0) this.makeOffer();
    }

    this.updatePlayer(dt, input);
    this.updateAbilities(dt, input);
    this.updateDrones(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt, false);
    this.updateBoss(dt);
    this.updateEnemyShots(dt);
    this.updateShells(dt);
    this.updateStrikes(dt);
    this.updateFires(dt);

    if (this.state === 'wave' && !this.pending.length && !this.enemies.some((e) => !e.dead) && !this.boss) this.waveCleared();
    if (this.line <= 0) this.lose('line');
    if (this.player.hp <= 0) this.lose('hp');
  }

  updateAmbient(dt) {
    // distant artillery behind the enemy lines
    this.artT -= dt;
    if (this.artT <= 0) {
      this.artT = rand(1.4, 4.5);
      const x = rand(-200, W + 200);
      const i = rand(0.35, 1);
      this.sky = { x, i: Math.max(this.sky.i, i) };
      const d = rand(0.4, 1);
      setTimeout(() => this.snd.artillery(d), 200 + d * 900);
    }
    // parachute flares over the field: light to fight by
    if (this.state === 'wave') {
      this.flareT -= dt;
      if (this.flareT <= 0) {
        this.flareT = rand(5, 8);
        this.flares.push({ x: rand(90, W - 90), y: rand(240, 520), t: 0, T: rand(8, 10), seed: rand(10) });
      }
    }
    for (const f of this.flares) {
      f.t += dt;
      f.y += 9 * dt;
      f.x += Math.sin(f.t * 0.7 + f.seed) * 6 * dt + 4 * dt;
      if (Math.random() < dt * 6) this.part('steam', f.x, f.y - 6, rand(-4, 4), rand(-8, -2), 2.5, 5);
    }
    this.flares = this.flares.filter((f) => f.t < f.T);
    for (const l of this.lights) l.life -= dt;
    this.lights = this.lights.filter((l) => l.life > 0);
  }

  // ---- the soldier and the gun -------------------------------------------

  updatePlayer(dt, input) {
    const p = this.player;
    p.hurt = Math.max(0, p.hurt - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.recoil = Math.max(0, p.recoil - dt * 9);

    // move: keys give a direction; a touch drag gives a point to go to
    let tx = 0;
    let ty = 0;
    const speed = 280;
    if (input.moveTo) {
      const dx = input.moveTo.x - p.x;
      const dy = input.moveTo.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const s = Math.min(speed, d * 8) / d;
        tx = dx * s;
        ty = dy * s;
      }
    } else if (input.move.x || input.move.y) {
      const d = Math.hypot(input.move.x, input.move.y) || 1;
      tx = (input.move.x / d) * speed;
      ty = (input.move.y / d) * speed;
    }
    const k = Math.min(1, dt * 12);
    p.vx += (tx - p.vx) * k;
    p.vy += (ty - p.vy) * k;
    p.x = clamp(p.x + p.vx * dt, ZONE.x0, ZONE.x1);
    p.y = clamp(p.y + p.vy * dt, ZONE.y0, ZONE.y1);
    p.walk += Math.hypot(p.vx, p.vy) * dt * 0.05;

    // aim: straight at the pointer, or helped onto a target
    let ax = input.aim.x;
    let ay = input.aim.y;
    p.target = null;
    if (input.assist || input.autoAim) {
      const t = input.autoAim ? this.topThreat(p.x, p.y, 1e9) : this.nearCursor(ax, ay);
      if (t) {
        p.target = t;
        const lead = Math.hypot(t.x - p.x, t.y - p.y) / BULLET_SPEED;
        ax = t.x + (t.vx || 0) * lead;
        ay = t.y + (t.vy || 0) * lead;
      }
    }
    if (ay > p.y - 30) ay = p.y - 30; // the gun covers the field, never the trench
    const want = Math.atan2(ay - p.y, ax - p.x);
    const d = angDiff(want, p.aim);
    const turn = 13 * dt;
    p.aim += clamp(d, -turn, turn);

    // the rotary gun: spin up, fire, heat, vent
    if (this.intro > 0) this.intro -= dt;
    const firing = input.fire && p.vent <= 0 && this.state === 'wave';
    const spinUp = [0.55, 0.42, 0.36, 0.3][this.up.cool];
    if (firing || (this.intro > 0 && this.intro < 1.2)) p.spin = Math.min(1, p.spin + dt / spinUp);
    else p.spin = Math.max(0, p.spin - dt / 0.9);
    p.phase += p.spin * dt * 40;
    this.snd.spin(p.spin);
    this.snd.heat(p.heat / 100);

    if (firing) {
      const rate = (3 + 15 * Math.pow(p.spin, 1.3)) * this.rateMul();
      p.acc += rate * dt;
      while (p.acc >= 1 && p.vent <= 0) {
        p.acc -= 1;
        this.fire();
      }
    } else {
      p.acc = Math.min(p.acc, 0.85);
    }
    p.sinceShot += dt;
    if (p.vent > 0) {
      p.vent -= dt;
      p.heat = Math.max(0, p.heat - 62 * dt);
      if (Math.random() < dt * 30) this.part('steam', p.x + Math.cos(p.aim) * 30, p.y + Math.sin(p.aim) * 30, rand(-30, 30), rand(-60, -20), 0.9, rand(8, 14));
    } else if (p.sinceShot > 0.2) {
      p.heat = Math.max(0, p.heat - 36 * dt);
    }
  }

  fire() {
    const p = this.player;
    const spread = 0.022 + 0.03 * p.spin;
    const a = p.aim + rand(-spread, spread);
    const mx = p.x + Math.cos(p.aim) * 50;
    const my = p.y + Math.sin(p.aim) * 50;
    this.bullets.push({ x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, dmg: 10, pierce: [0, 1, 2, 4][this.up.pierce], hit: [], kind: 'mg', life: 1 });
    p.heat += 1.6 * this.heatMul();
    p.sinceShot = 0;
    p.recoil = Math.min(1, p.recoil + 0.55);
    p.flash = 0.045;
    p.flashRot = rand(Math.PI * 2);
    this.shake = Math.min(2.2, this.shake + 0.35);
    this.stats.shots++;
    this.light(mx, my, 230, 1, [255, 190, 110], 0.06);
    // brass out of the right side of the gun
    const side = p.aim + Math.PI / 2;
    this.casings.push({ x: p.x + Math.cos(p.aim) * 14, y: p.y + Math.sin(p.aim) * 14, vx: Math.cos(side) * rand(90, 160) + rand(-20, 20), vy: Math.sin(side) * rand(90, 160) + rand(-20, 20), z: 14, vz: rand(80, 140), rot: rand(6), vr: rand(-20, 20), life: 7, rest: false });
    if (this.casings.length > 180) this.casings.shift();
    if (Math.random() < 0.35) this.snd.casing();
    this.snd.shot((p.x / W) * 2 - 1);
    if (p.heat >= 100) {
      p.heat = 100;
      p.vent = 1.7;
      this.snd.overheat();
      this.hooks.hint?.('Overheated! Fire in bursts to keep the gun cool.', 'heat');
    }
  }

  // assisted aim with a mouse: the strongest pull near the pointer
  nearCursor(x, y) {
    let best = null;
    let bestS = 0;
    for (const e of this.enemies) {
      if (e.dead || e.emerge < 0.6) continue;
      const d = Math.sqrt(dist2(x, y, e.x, e.y));
      if (d > 150) continue;
      const s = (1 - d / 150) * (0.6 + e.d.threat * 0.2);
      if (s > bestS) {
        bestS = s;
        best = e;
      }
    }
    if (this.boss && !this.boss.dead && Math.abs(x - this.boss.x) < BOSS.w / 2 && Math.abs(y - this.boss.y) < BOSS.h / 2) {
      const b = this.boss;
      if (b.vent > 0) {
        const vx = b.x + (x < b.x ? -62 : 62);
        return { x: vx, y: b.y + 72, vx: 0, vy: 0 };
      }
    }
    return best;
  }

  threat(e) {
    const close = clamp((e.y - HORIZON) / (LINE_Y - HORIZON), 0, 1);
    let s = e.d.threat * (0.4 + 1.6 * close * close);
    if (e.type === 'mortar' && e.state === 'shell') s += 1.8;
    if (e.type === 'grunt' && (e.state === 'aim' || e.state === 'burst')) s += 1.2;
    if (e.state === 'attack') s += 2;
    return s;
  }

  topThreat(x, y, range) {
    let best = null;
    let bestS = 0;
    for (const e of this.enemies) {
      if (e.dead || e.emerge < 0.7) continue;
      if (dist2(x, y, e.x, e.y) > range * range) continue;
      const s = this.threat(e);
      if (s > bestS) {
        bestS = s;
        best = e;
      }
    }
    if (!best && this.boss && !this.boss.dead && this.boss.y > 120) {
      const b = this.boss;
      return b.vent > 0 ? { x: b.x + (x < b.x ? -62 : 62), y: b.y + 72, vx: 0, vy: 0 } : b;
    }
    return best;
  }

  // ---- abilities ------------------------------------------------------------

  updateAbilities(dt, input) {
    const a = this.abil;
    if (this.up.barrier && a.barrier < this.barrierMax()) {
      a.barrierT += dt;
      if (a.barrierT >= this.barrierRecharge()) {
        a.barrierT = 0;
        a.barrier++;
      }
    }
    if (this.up.air && a.air > 0) a.air = Math.max(0, a.air - dt);
    if (input.barrier) this.useBarrier(input.barrier.x, input.barrier.y);
    if (input.air) this.useAir(input.air.x);
  }

  canBarrier() {
    return this.up.barrier > 0 && this.abil.barrier > 0 && this.state === 'wave';
  }
  canAir() {
    return this.up.air > 0 && this.abil.air <= 0 && this.state === 'wave';
  }

  useBarrier(x, y) {
    if (!this.canBarrier()) return false;
    x = clamp(x, 80, W - 80);
    y = clamp(y, BARRIER_Y[0], BARRIER_Y[1]);
    const hp = [0, 240, 360, 520][this.up.barrier];
    this.barriers.push({ x, y, w: 124, h: 26, hp, max: hp, t: 0, id: this.idSeq++ });
    while (this.barriers.length > this.up.barrier + 1) this.barriers.shift();
    this.abil.barrier--;
    this.snd.barrier();
    this.shake += 1.5;
    for (let i = 0; i < 14; i++) this.part('smoke', x + rand(-60, 60), y + rand(-8, 8), rand(-40, 40), rand(-30, 10), 1.1, rand(14, 26));
    return true;
  }

  useAir(x) {
    if (!this.canAir()) return false;
    x = clamp(x, 60, W - 60);
    this.strikes.push({ x, t: -1.5, i: 0, jet: false });
    this.abil.air = this.airCooldown();
    this.snd.airstrikeCall();
    return true;
  }

  updateStrikes(dt) {
    for (const s of this.strikes) {
      s.t += dt;
      if (s.art) {
        // the intro barrage: shells bursting in the fog, for show
        if (s.t >= 0 && !s.done) {
          s.done = true;
          this.blast(s.x, s.y, 70, 0, { big: 0.7, quiet: false });
        }
        continue;
      }
      if (!s.jet && s.t > -0.55) {
        s.jet = true;
        this.snd.jet();
      }
      // bombs walk up the lane from the wire to the fog
      while (s.t >= 0 && s.i < 13 && s.t >= s.i * 0.05) {
        const y = 880 - s.i * 62;
        const dmg = [0, 150, 210, 240][this.up.air];
        this.blast(s.x + rand(-14, 14), y, 82, dmg, { enemies: true, big: 0.8 });
        if (this.up.air >= 3) this.fires.push({ x: s.x + rand(-10, 10), y, r: 56, t: 5 });
        s.i++;
      }
    }
    this.strikes = this.strikes.filter((s) => (s.art ? !s.done : s.i < 13));
  }

  updateFires(dt) {
    for (const f of this.fires) {
      f.t -= dt;
      if (Math.random() < dt * 14) this.part('fire', f.x + rand(-f.r, f.r) * 0.7, f.y + rand(-f.r, f.r) * 0.5, rand(-10, 10), rand(-50, -20), 0.6, rand(10, 18));
      for (const e of this.enemies) if (!e.dead && dist2(e.x, e.y, f.x, f.y) < f.r * f.r) this.ignite(e, 25);
    }
    this.fires = this.fires.filter((f) => f.t > 0);
  }

  // ---- drones ---------------------------------------------------------------

  updateDrones(dt) {
    const p = this.player;
    const slots = [[-70, -60], [70, -60], [0, -105]];
    this.drones.forEach((d, i) => {
      d.t += dt;
      d.flash = Math.max(0, d.flash - dt);
      const [ox, oy] = slots[i];
      const tx = p.x + ox + Math.sin(d.t * 1.7) * 10;
      const ty = p.y + oy + Math.cos(d.t * 2.1) * 6;
      d.x += (tx - d.x) * Math.min(1, dt * 5);
      d.y += (ty - d.y) * Math.min(1, dt * 5);
      d.cool -= dt;
      const t = this.topThreat(d.x, d.y, 760);
      if (t) d.aim += clamp(angDiff(Math.atan2(t.y - d.y, t.x - d.x), d.aim), -10 * dt, 10 * dt);
      if (t && d.cool <= 0 && this.state === 'wave') {
        d.cool = this.up.drone >= 3 ? 0.2 : 0.3;
        const a = d.aim + rand(-0.03, 0.03);
        this.bullets.push({ x: d.x, y: d.y, px: d.x, py: d.y, vx: Math.cos(a) * 1500, vy: Math.sin(a) * 1500, dmg: 7, pierce: Math.min(1, this.up.pierce), hit: [], kind: 'drone', life: 1 });
        d.flash = 0.04;
        this.light(d.x, d.y, 90, 0.7, [170, 255, 190], 0.05);
        this.snd.drone((d.x / W) * 2 - 1);
      }
    });
  }

  // ---- rounds ---------------------------------------------------------------

  updateBullets(dt) {
    const pen = this.pen();
    for (const b of this.bullets) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < HORIZON - 60 || b.x < -30 || b.x > W + 30 || b.y > H) {
        b.life = 0;
        continue;
      }
      // the boss is one big box with two weak vents
      const boss = this.boss;
      if (boss && !boss.dead && boss.y > -100 && Math.abs(b.x - boss.x) < BOSS.w / 2 && Math.abs(b.y - boss.y) < BOSS.h / 2) {
        let dmg = b.dmg;
        const ventL = dist2(b.x, b.y, boss.x - 62, boss.y + 72) < 34 * 34;
        const ventR = dist2(b.x, b.y, boss.x + 62, boss.y + 72) < 34 * 34;
        if (boss.vent > 0 && (ventL || ventR)) {
          dmg *= 3;
          this.part('spark', b.x, b.y, rand(-120, 120), rand(-80, 80), 0.25, 3);
        } else {
          dmg *= 0.3 + 0.55 * pen;
          if (Math.random() < 0.3) this.part('spark', b.x, b.y, rand(-200, 200), rand(40, 200), 0.25, 2);
          if (Math.random() < 0.12) this.snd.ping((b.x / W) * 2 - 1);
        }
        boss.hp -= dmg;
        boss.flash = 0.06;
        this.stats.hits++;
        if (this.up.fire >= 2 && Math.random() < 0.08) this.part('fire', b.x, b.y, 0, -30, 0.5, 12);
        b.life = 0;
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || e.emerge < 0.35 || b.hit.includes(e.id)) continue;
        if (segCircle(b.px, b.py, b.x, b.y, e.x, e.y, e.r + 2) < 0) continue;
        b.hit.push(e.id);
        this.stats.hits++;
        let dmg = b.dmg;
        let blocked = false;
        if (e.type === 'heavy') {
          const from = Math.atan2(-b.vy, -b.vx);
          if (Math.abs(angDiff(from, e.shield)) < 0.85) {
            blocked = true;
            dmg *= 0.18 + 0.82 * pen;
          }
        }
        this.damage(e, dmg, b.vx, b.vy, blocked);
        if (b.kind === 'mg' && this.up.fire && (!blocked || this.up.fire >= 2)) this.ignite(e, [0, 7, 13, 18][this.up.fire]);
        if (blocked) {
          for (let i = 0; i < 3; i++) this.part('spark', b.x, b.y, -b.vx * 0.1 + rand(-160, 160), -b.vy * 0.1 + rand(-160, 160), 0.3, 2);
          if (Math.random() < 0.4) this.snd.ping((e.x / W) * 2 - 1);
          if (pen < 0.5) {
            b.life = 0;
            break;
          }
        }
        if (b.pierce-- <= 0) {
          b.life = 0;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  damage(e, dmg, vx = 0, vy = 0, blocked = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.06;
    if (!blocked) {
      const s = 0.04;
      e.x += vx * s * 0.004;
      e.y += vy * s * 0.004;
      if (Math.random() < 0.5) this.part('mist', e.x, e.y, vx * 0.05 + rand(-40, 40), vy * 0.05 + rand(-40, 40), 0.4, rand(5, 9));
      if (Math.random() < 0.15) this.snd.hit((e.x / W) * 2 - 1);
    }
    if (e.hp <= 0) this.kill(e, vx, vy);
  }

  ignite(e, dps) {
    if (e.dead) return;
    if (e.burn < dps) e.burn = dps;
    if (e.burnT <= 0) this.snd.burn();
    e.burnT = 3;
  }

  kill(e, vx = 0, vy = 1) {
    if (e.dead) return;
    e.dead = true;
    e.deadT = 0;
    e.fall = Math.atan2(vy, vx);
    this.stats.kills++;
    this.stats.byType[e.type] = (this.stats.byType[e.type] || 0) + 1;
    this.stats.score += Math.round(e.d.score * (1 + this.wave * 0.1));
    for (let i = 0; i < 6; i++) this.part('mist', e.x, e.y, vx * 0.06 + rand(-60, 60), vy * 0.06 + rand(-60, 60), 0.6, rand(6, 12));
    this.snd.death((e.x / W) * 2 - 1);
    if (e.type === 'sapper') this.blast(e.x, e.y, 80, 70, { enemies: true, player: true, big: 0.6 });
    if (e.burnT > 0 && this.up.fire >= 3) {
      for (const o of this.enemies) if (!o.dead && dist2(o.x, o.y, e.x, e.y) < 75 * 75) this.ignite(o, 18);
      for (let i = 0; i < 8; i++) this.part('fire', e.x + rand(-20, 20), e.y + rand(-20, 20), rand(-30, 30), rand(-80, -30), 0.7, rand(12, 20));
    }
  }

  // ---- the enemy ------------------------------------------------------------

  spawn({ type, x, mul }) {
    const d = ENEMIES[type];
    const e = {
      id: this.idSeq++, type, d, x, y: rand(30, 85), vx: 0, vy: 0, hp: d.hp * mul, max: d.hp * mul, r: d.r, t: rand(10),
      state: 'walk', st: 0, face: Math.PI / 2, shield: Math.PI / 2, burn: 0, burnT: 0, flash: 0, emerge: 0, dead: false, seed: rand(100),
      stopY: 0, shooter: false, shots: 0,
    };
    if (type === 'grunt' && this.wave >= 1 && rand() < 0.35) {
      e.shooter = true;
      e.stopY = rand(520, 790);
    }
    if (type === 'mortar') e.stopY = rand(290, 520);
    this.enemies.push(e);
    if (!this.seen[type]) {
      this.seen[type] = true;
      this.hooks.hint?.(HINTS[type], type);
    }
  }

  updateEnemies(dt, idle) {
    const p = this.player;
    for (const e of this.enemies) {
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.dead) {
        e.deadT += dt;
        continue;
      }
      e.emerge = Math.min(1, e.emerge + dt * 0.7);
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burn * dt;
        if (Math.random() < dt * 16) this.part('fire', e.x + rand(-8, 8), e.y + rand(-8, 8), rand(-10, 10), rand(-60, -30), 0.5, rand(8, 14));
        if (Math.random() < dt * 8) this.light(e.x, e.y, 70, 0.6, [255, 140, 50], 0.12);
        if (e.hp <= 0) {
          this.kill(e, 0, 1);
          continue;
        }
        if (e.burnT <= 0) e.burn = 0;
      }
      if (idle) continue;
      const d = e.d;
      let speed = d.speed;
      if (Math.abs(e.y - WIRE_Y) < 22) speed *= 0.45; // the wire slows them
      let wantX = 0;
      let wantY = speed;

      if (e.type === 'sapper') wantX = Math.sin(e.t * 3 + e.seed) * 70;
      else if (e.type === 'grunt') wantX = Math.sin(e.t * 0.6 + e.seed) * 10;

      if (e.type === 'heavy') {
        // the shield swings round to face the soldier, slowly
        const want = Math.atan2(p.y - e.y, p.x - e.x);
        e.shield += clamp(angDiff(want, e.shield), -0.75 * dt, 0.75 * dt);
      }

      // stops: riflemen fire a burst, mortar teams dig in and shell
      if (e.state === 'walk' && e.stopY && e.y >= e.stopY) {
        e.state = e.type === 'mortar' ? 'setup' : 'aim';
        e.st = e.type === 'mortar' ? 1.3 : 0.75;
        e.stopY = 0;
      }
      if (e.state === 'aim' || e.state === 'burst' || e.state === 'setup' || e.state === 'shell') {
        wantX = 0;
        wantY = 0;
        e.face = Math.atan2(p.y - e.y, p.x - e.x);
        e.st -= dt;
        if (e.state === 'aim' && e.st <= 0) {
          e.state = 'burst';
          e.st = 0;
          e.shots = 3;
        }
        if (e.state === 'burst' && e.st <= 0) {
          if (e.shots-- > 0) {
            e.st = 0.2;
            this.enemyShot(e);
          } else {
            e.state = 'walk';
          }
        }
        if (e.state === 'setup' && e.st <= 0) {
          e.state = 'shell';
          e.st = rand(0.4, 1.2);
        }
        if (e.state === 'shell' && e.st <= 0) {
          e.st = rand(3.8, 4.8);
          const tx = clamp(p.x + p.vx * 0.7 + rand(-25, 25), ZONE.x0, ZONE.x1);
          const ty = clamp(p.y + p.vy * 0.7 + rand(-20, 20), ZONE.y0 - 30, ZONE.y1);
          this.shells.push({ x0: e.x, y0: e.y, tx, ty, t: 0, T: 1.9, r: 72, dmg: 20, kind: 'mortar' });
          this.part('smoke', e.x, e.y + 10, rand(-20, 20), rand(-40, -10), 1, 14);
          this.light(e.x, e.y, 90, 0.9, [255, 200, 120], 0.08);
          setTimeout(() => this.snd.whistle(), 500);
        }
      }

      if (e.state === 'attack') {
        wantX = 0;
        wantY = 0;
        const bar = e.bar && this.barriers.includes(e.bar) ? e.bar : null;
        if (e.bar && !bar) e.state = 'walk';
        else {
          const dmg = d.line * dt;
          if (bar) {
            bar.hp -= dmg;
            bar.t = 0.1;
          } else {
            this.hitLine(e.x, dmg, e.type);
          }
          if (Math.random() < dt * 2) this.part('debris', e.x + rand(-10, 10), e.y + e.r, rand(-40, 40), rand(10, 50), 0.6, 3);
        }
      }

      if (e.state === 'walk') {
        e.vx += (wantX - e.vx) * Math.min(1, dt * 3);
        e.vy += (wantY - e.vy) * Math.min(1, dt * 3);
        if (e.type !== 'heavy' || true) e.face = Math.atan2(e.vy, e.vx);
      } else {
        e.vx *= 0.8;
        e.vy *= 0.8;
      }
      let nx = e.x + e.vx * dt;
      let ny = e.y + e.vy * dt;

      // barricades stop them; sappers blow on contact
      for (const b of this.barriers) {
        if (Math.abs(nx - b.x) < b.w / 2 + e.r * 0.6 && Math.abs(ny - b.y) < b.h / 2 + e.r) {
          if (e.type === 'sapper') {
            this.sapperBlow(e, b);
            break;
          }
          ny = Math.min(ny, b.y - b.h / 2 - e.r);
          if (e.state === 'walk') {
            e.state = 'attack';
            e.bar = b;
          }
        }
      }
      if (e.dead) continue;
      if (e.type === 'sapper' && ny >= WIRE_Y - 6) {
        this.sapperBlow(e, null);
        continue;
      }
      const stopAt = LINE_Y - 24 - e.r;
      if (ny >= stopAt) {
        ny = stopAt;
        if (e.state === 'walk') {
          e.state = 'attack';
          e.bar = null;
        }
      }
      e.x = clamp(nx, 24, W - 24);
      e.y = ny;
    }

    // keep them from standing in each other
    const live = this.enemies.filter((e) => !e.dead);
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r + 2;
        if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < rr) {
          const push = (rr - d) * 0.5;
          const ux = dx / d;
          const uy = dy / d;
          const wa = b.r / (a.r + b.r);
          a.x -= ux * push * wa * 1.6;
          b.x += ux * push * (1 - wa) * 1.6;
          a.y -= uy * push * wa * 0.5;
          b.y += uy * push * (1 - wa) * 0.5;
        }
      }
    }

    // bodies sink into the mud: hand them to the ground as decals
    for (const e of this.enemies) {
      if (e.dead && e.deadT > 0.45 && !e.baked) {
        e.baked = true;
        this.hooks.decal?.('corpse', e);
      }
    }
    this.enemies = this.enemies.filter((e) => !e.baked);
    for (const b of this.barriers) {
      b.t = Math.max(0, b.t - dt);
      if (b.hp <= 0) {
        this.blast(b.x, b.y, 40, 0, { big: 0.4 });
        for (let i = 0; i < 12; i++) this.part('debris', b.x + rand(-50, 50), b.y, rand(-120, 120), rand(-120, 40), 0.9, rand(3, 6));
      }
    }
    this.barriers = this.barriers.filter((b) => b.hp > 0);
  }

  sapperBlow(e, bar) {
    e.dead = true;
    e.deadT = 0;
    e.baked = true; // nothing left to lie in the mud
    if (bar) bar.hp -= 160;
    else this.hitLine(e.x, (e.d.blast / 100) * LINE_MAX, 'sapper');
    this.blast(e.x, e.y, 70, 0, { player: false, big: 0.8 });
    this.hooks.decal?.('scorch', { x: e.x, y: e.y, r: 50 });
  }

  hitLine(x, dmg, src) {
    this.line = Math.max(0, this.line - dmg);
    this.stats.lineBy[src] = (this.stats.lineBy[src] || 0) + dmg;
    const seg = clamp(Math.floor((x / W) * LINE_SEGS), 0, LINE_SEGS - 1);
    this.lineSegs[seg] = Math.min(1, this.lineSegs[seg] + dmg / 40);
    this.lineSound -= dmg;
    if (this.lineSound <= 0) {
      this.lineSound = 6;
      this.snd.lineHit();
      this.hooks.lineHit?.();
    }
  }

  enemyShot(e) {
    const p = this.player;
    const mx = e.x + Math.cos(e.face) * 18;
    const my = e.y + Math.sin(e.face) * 18;
    const a = Math.atan2(p.y + p.vy * 0.4 - my, p.x + p.vx * 0.4 - mx) + rand(-0.06, 0.06);
    this.eshots.push({ x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, dmg: 5, life: 2.5 });
    this.light(mx, my, 70, 0.8, [255, 210, 150], 0.05);
    this.snd.drone((e.x / W) * 2 - 1);
  }

  updateEnemyShots(dt) {
    const p = this.player;
    for (const s of this.eshots) {
      s.px = s.x;
      s.py = s.y;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      for (const b of this.barriers) {
        if (Math.abs(s.x - b.x) < b.w / 2 && Math.abs(s.y - b.y) < b.h / 2 + 4) {
          s.life = 0;
          b.hp -= s.dmg;
          this.part('spark', s.x, s.y, rand(-100, 100), rand(-100, 0), 0.25, 2);
        }
      }
      if (s.life > 0 && segCircle(s.px, s.py, s.x, s.y, p.x, p.y, 16) >= 0) {
        s.life = 0;
        this.hurt(s.dmg);
      }
      if (s.y > H + 20) s.life = 0;
    }
    this.eshots = this.eshots.filter((s) => s.life > 0);
  }

  updateShells(dt) {
    for (const s of this.shells) {
      s.t += dt;
      if (s.t >= s.T && !s.done) {
        s.done = true;
        this.blast(s.tx, s.ty, s.r, 0, { player: s.dmg, big: s.kind === 'cannon' ? 1 : 0.65 });
        this.hooks.decal?.('scorch', { x: s.tx, y: s.ty, r: s.r * 0.6 });
      }
    }
    this.shells = this.shells.filter((s) => !s.done);
  }

  hurt(d) {
    const p = this.player;
    if (this.state !== 'wave' && this.state !== 'break') return;
    p.hp = Math.max(0, p.hp - d);
    p.hurt = 0.35;
    this.shake = Math.min(4, this.shake + 1.5);
    this.snd.hurt();
    this.hooks.hurt?.(d);
  }

  // an explosion: light, smoke, debris, a scorch, and damage
  blast(x, y, r, dmg, o = {}) {
    const big = o.big ?? 0.6;
    this.light(x, y, r * 3.2, 1.4, [255, 170, 90], 0.35);
    this.shake = Math.min(5, this.shake + big * 2.4);
    this.part('flash', x, y, 0, 0, 0.18, r * 1.1);
    for (let i = 0; i < 10 * big + 4; i++) this.part('fire', x + rand(-r, r) * 0.3, y + rand(-r, r) * 0.3, rand(-90, 90), rand(-90, 60), rand(0.3, 0.6), rand(14, 26) * (0.6 + big));
    for (let i = 0; i < 9 * big + 3; i++) this.part('smoke', x + rand(-r, r) * 0.4, y + rand(-r, r) * 0.4, rand(-50, 50), rand(-60, 10), rand(1.4, 2.6), rand(20, 40) * (0.6 + big));
    for (let i = 0; i < 12 * big; i++) this.part('debris', x, y, rand(-260, 260), rand(-260, 200), rand(0.6, 1.1), rand(2, 5));
    for (let i = 0; i < 8 * big; i++) this.part('spark', x, y, rand(-380, 380), rand(-380, 380), rand(0.2, 0.5), 2);
    if (!o.quiet) this.snd.explosion(big, (x / W) * 2 - 1);
    if (y > HORIZON + 150) this.hooks.decal?.('scorch', { x, y, r: r * 0.55 });
    if (o.enemies && dmg) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d2 = dist2(x, y, e.x, e.y);
        if (d2 < (r + e.r) * (r + e.r)) this.damage(e, dmg * (1 - (0.5 * Math.sqrt(d2)) / (r + e.r)), e.x - x, e.y - y);
      }
      const b = this.boss;
      if (b && !b.dead && Math.abs(x - b.x) < BOSS.w / 2 + r && Math.abs(y - b.y) < BOSS.h / 2 + r) {
        b.hp -= dmg * 0.8;
        b.flash = 0.1;
      }
    }
    if (o.player) {
      const p = this.player;
      const d = Math.sqrt(dist2(x, y, p.x, p.y));
      const pd = typeof o.player === 'number' ? o.player : 25;
      if (d < r + 14) this.hurt(pd * (1 - (0.45 * d) / (r + 14)));
    }
    for (const b of this.barriers) if (Math.abs(x - b.x) < b.w / 2 + r * 0.5 && Math.abs(y - b.y) < r) b.hp -= dmg ? 0 : 40;
  }

  // ---- the boss -------------------------------------------------------------

  spawnBoss() {
    this.boss = {
      x: W / 2, y: -170, hp: BOSS.hp, max: BOSS.hp, state: 'enter', turret: Math.PI / 2, cannonT: 5, aimT: 0, aimX: 0, aimY: 0,
      deployT: 10, barrageT: 14, vent: 0, tread: 0, flash: 0, dead: false, deathT: 0, recoil: 0,
    };
    this.hooks.hint?.('The Iron Mammoth: its hull shrugs off rounds. After it fires, its vents open: hit them.', 'boss');
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    const p = this.player;
    b.flash = Math.max(0, b.flash - dt);
    b.recoil = Math.max(0, b.recoil - dt * 3);
    if (b.dead) {
      b.deathT += dt;
      this.snd.bossTreads(0);
      if (Math.random() < dt * 9 && b.deathT < 2.6) this.blast(b.x + rand(-90, 90), b.y + rand(-110, 110), 60, 0, { big: 0.7 });
      if (b.deathT > 2.8 && !b.gone) {
        b.gone = true;
        this.blast(b.x, b.y, 160, 400, { enemies: true, big: 1 });
        this.hooks.decal?.('wreck', { x: b.x, y: b.y });
        // the rest of them break and are cut down
        for (const e of this.enemies) if (!e.dead) this.kill(e);
        this.pending = [];
        this.boss = null;
      }
      return;
    }
    let moving = false;
    if (b.y < BOSS.stopY) {
      b.y += BOSS.speed * 1.6 * dt;
      moving = true;
    } else {
      const tx = clamp(p.x, 170, W - 170);
      if (Math.abs(tx - b.x) > 4) {
        b.x += Math.sign(tx - b.x) * 16 * dt;
        moving = true;
      }
    }
    if (moving) b.tread += dt;
    this.snd.bossTreads(moving ? 0.8 : 0.25);
    if (Math.random() < dt * 6) this.part('smoke', b.x + rand(-60, 60), b.y - BOSS.h / 2 + 10, rand(-10, 10), rand(-60, -30), 2, rand(14, 22));
    if (b.hp <= 0) {
      b.dead = true;
      b.deathT = 0;
      this.stats.score += BOSS.score;
      this.stats.kills++;
      this.banner = { title: 'Iron Mammoth destroyed', sub: 'The line holds', t: 3 };
      return;
    }
    if (b.y < 140) return;

    const rage = b.hp < b.max * 0.35;
    b.vent = Math.max(0, b.vent - dt);

    // the main gun: a long laser-marked aim, then a shell where you were
    if (b.aimT > 0) {
      b.aimT -= dt;
      if (b.aimT > 0.35) {
        b.aimX = p.x;
        b.aimY = p.y;
      }
      b.turret += clamp(angDiff(Math.atan2(b.aimY - b.y, b.aimX - b.x), b.turret), -3 * dt, 3 * dt);
      if (b.aimT <= 0) {
        const mx = b.x + Math.cos(b.turret) * 150;
        const my = b.y + Math.sin(b.turret) * 150;
        const d = Math.hypot(b.aimX - mx, b.aimY - my);
        this.shells.push({ x0: mx, y0: my, tx: b.aimX, ty: b.aimY, t: 0, T: d / 1500, r: 92, dmg: 30, kind: 'cannon' });
        this.light(mx, my, 340, 1.5, [255, 200, 120], 0.12);
        this.part('flash', mx, my, 0, 0, 0.12, 90);
        for (let i = 0; i < 10; i++) this.part('smoke', mx, my, Math.cos(b.turret) * rand(60, 200) + rand(-40, 40), Math.sin(b.turret) * rand(60, 200) + rand(-40, 40), 1.6, rand(18, 30));
        this.snd.cannon();
        this.shake += 3;
        b.recoil = 1;
        b.vent = 2.6;
        b.cannonT = rage ? 3.2 : 4.6;
      }
    } else {
      b.turret += clamp(angDiff(Math.atan2(p.y - b.y, p.x - b.x), b.turret), -1.2 * dt, 1.2 * dt);
      b.cannonT -= dt;
      if (b.cannonT <= 0) b.aimT = 1.35;
    }

    // troops out of the rear hatch
    b.deployT -= dt;
    if (b.deployT <= 0) {
      b.deployT = rage ? 9 : 13;
      for (let i = 0; i < 4; i++) this.spawn({ type: 'grunt', x: b.x + rand(-90, 90), mul: 1.4 });
      for (let i = 0; i < 2; i++) this.spawn({ type: 'sapper', x: b.x + (i ? 110 : -110), mul: 1.2 });
      for (const e of this.enemies.slice(-6)) {
        e.y = b.y - 40;
        e.x = clamp(b.x + (e.x - b.x) * 1.4, 30, W - 30);
        e.emerge = 1;
      }
    }

    // below 60%: mortar barrages round the soldier
    if (b.hp < b.max * 0.6) {
      b.barrageT -= dt;
      if (b.barrageT <= 0) {
        b.barrageT = rage ? 8 : 11;
        for (let i = 0; i < 5; i++) {
          const tx = clamp(p.x + rand(-150, 150), ZONE.x0, ZONE.x1);
          const ty = clamp(p.y + rand(-70, 70), ZONE.y0 - 30, ZONE.y1);
          this.shells.push({ x0: b.x, y0: b.y - 60, tx, ty, t: -i * 0.25, T: 1.9, r: 66, dmg: 16, kind: 'mortar' });
        }
        setTimeout(() => this.snd.whistle(), 400);
      }
    }

  }

  // ---- effects ----------------------------------------------------------

  part(k, x, y, vx, vy, life, s) {
    if (this.parts.length >= MAX_PARTS) this.parts.shift();
    this.parts.push({ k, x, y, vx, vy, life, max: life, s, rot: rand(6.28), vr: rand(-2, 2), z: k === 'debris' ? 1 : 0 });
  }

  light(x, y, r, i, c, life) {
    if (this.lights.length > 60) this.lights.shift();
    this.lights.push({ x, y, r, i, c, life, max: life });
  }

  updateParts(dt) {
    for (const q of this.parts) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vr * dt;
      if (q.k === 'smoke' || q.k === 'steam') {
        q.vx *= 1 - dt * 0.8;
        q.vy *= 1 - dt * 0.8;
        q.vx += 8 * dt; // the wind
        q.s += dt * 14;
      } else if (q.k === 'fire') {
        q.vx *= 1 - dt * 2;
        q.vy *= 1 - dt * 2;
      } else if (q.k === 'debris' || q.k === 'mist') {
        q.vx *= 1 - dt * 3;
        q.vy *= 1 - dt * 3;
      }
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const c of this.casings) {
      c.life -= dt;
      if (c.rest) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      c.vz -= 600 * dt;
      c.z += c.vz * dt;
      if (c.z <= 0) {
        c.z = 0;
        if (Math.abs(c.vz) < 60) {
          c.rest = true;
        } else {
          c.vz *= -0.35;
          c.vx *= 0.5;
          c.vy *= 0.5;
          c.vr *= 0.5;
        }
      }
    }
    this.casings = this.casings.filter((c) => c.life > 0);
  }

  summary() {
    const s = this.stats;
    return {
      wave: this.wave + 1, state: this.state, line: Math.round((this.line / LINE_MAX) * 100), hp: Math.round(this.player.hp),
      enemies: this.enemies.filter((e) => !e.dead).length, pending: this.pending.length, boss: this.boss ? Math.round(this.boss.hp) : null,
      kills: s.kills, score: s.score, time: Math.round(s.time), accuracy: s.shots ? Math.round((100 * s.hits) / s.shots) : 0, up: { ...this.up },
    };
  }
}

function spawnXs(pattern, n) {
  const xs = [];
  if (pattern === 'line') {
    for (let i = 0; i < n; i++) xs.push(lerp(70, W - 70, n === 1 ? 0.5 : i / (n - 1)) + rand(-12, 12));
  } else if (pattern === 'column') {
    const x = rand() < 0.5 ? rand(90, 220) : rand(W - 220, W - 90);
    for (let i = 0; i < n; i++) xs.push(x + rand(-40, 40));
  } else if (pattern === 'flank') {
    for (let i = 0; i < n; i++) xs.push(i % 2 ? rand(40, 150) : rand(W - 150, W - 40));
  } else if (pattern === 'pack') {
    const x = rand(160, W - 160);
    for (let i = 0; i < n; i++) xs.push(x + rand(-60, 60));
  } else {
    for (let i = 0; i < n; i++) xs.push(rand(50, W - 50));
  }
  return xs;
}
