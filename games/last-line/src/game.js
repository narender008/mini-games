// Last Line: the simulation. One Game holds a run through one sector: the
// soldier and the weapon, the enemy, every round in the air, the line's
// integrity, the waves, the upgrades, the orbital strike and the boss. It
// knows nothing about drawing: effects are left in plain arrays (parts,
// lights, casings, arcs, rails, rockets, beam, orb) for render.js, and lasting
// marks on the ground go out through hooks.decal. Sound goes to the Sound object.
import { W, H, HORIZON, WIRE_Y, LINE_Y, ZONE, BARRIER_Y, clamp, lerp, rand, pick, angDiff, segCircle, dist2 } from './config.js';
import { ENEMIES, UPGRADES, REPAIR, TEMPO, COUNT, ORBITAL } from './data.js';
import { LEVELS } from './levels.js';

export const LINE_MAX = 300;
const BULLET_SPEED = 1750;
const MAX_PARTS = 1500;
const LINE_SEGS = 12;

const HINTS = {
  grunt: 'Hold the left button to spin up the gun. Watch the heat.',
  sapper: 'Sappers carry charges. Drop them before they reach the wire.',
  mortar: 'Mortar teams shell your position. Keep moving off the marks.',
  heavy: 'Shield troopers turn to face you. Move and hit them from the side.',
  flyer: 'Hornet drones fly over the wire and dive at you. Shoot them down or sidestep the dive.',
  brute: 'Juggernauts shrug off half of every hit and blow up when they fall. Keep them off the line.',
};
const WEAPON_HINT = {
  rotary: 'Hold to spin up the rotary cannon. Fire in bursts to keep it cool.',
  tesla: 'The Tesla Arc jumps between enemies near where you aim, and ignores shields.',
  plasma: 'Hold the Plasma Lance on a line of enemies: it burns through all of them and grows hotter.',
  rockets: 'Each volley of rockets finds its own targets. Aim near a crowd.',
  rail: 'Hold to charge the Rail Cannon, let go to fire. A full charge goes through anything.',
};

export class Game {
  constructor(sound, hooks = {}) {
    this.snd = sound;
    this.hooks = hooks;
    this.level = 0;
    this.weapon = 'rotary';
    this.reset();
  }

  get L() {
    return LEVELS[this.level];
  }
  get waves() {
    return this.L.waves;
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
      charge: 0, fullT: 0, held: false, focus: 0, zapT: 0, volleyT: 0,
    };
    this.line = LINE_MAX;
    this.lineSegs = new Array(LINE_SEGS).fill(0);
    this.enemies = [];
    this.pending = [];
    this.bullets = [];
    this.eshots = [];
    this.shells = [];
    this.sweeps = [];
    this.barriers = [];
    this.strikes = [];
    this.fires = [];
    this.flares = [];
    this.flareT = 1;
    this.drones = [];
    this.parts = [];
    this.casings = [];
    this.lights = [];
    this.arcs = [];
    this.rails = [];
    this.rockets = [];
    this.beam = null;
    this.orb = null;
    this.ult = 0;
    this.boss = null;
    this.up = { pierce: 0, fire: 0, drone: 0, barrier: 0, air: 0, cool: 0, ult: 0 };
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

  start(level = this.level, weapon = this.weapon, wave = 0) {
    this.level = clamp(level, 0, LEVELS.length - 1);
    this.weapon = weapon;
    this.reset();
    this.startWave(wave);
    this.hooks.hint?.(WEAPON_HINT[weapon], 'w-' + weapon);
  }

  startWave(i) {
    this.wave = i;
    this.waveT = 0;
    this.state = 'wave';
    const def = this.waves[i];
    this.pending = [];
    const mul = this.L.hp * (1 + i * 0.06);
    for (const [t, type, n, pattern] of def.groups) {
      const xs = spawnXs(pattern, Math.max(1, Math.round(n * COUNT * (this.L.count ?? 1))));
      xs.forEach((x, k) => this.pending.push({ t: t * TEMPO + k * (pattern === 'line' ? 0.08 : 0.35) + rand(0.2), type, x, mul }));
    }
    this.pending.sort((a, b) => a.t - b.t);
    if (def.boss) this.spawnBoss();
    this.banner = { title: def.boss ? 'Boss wave' : `Wave ${i + 1}`, sub: def.name, t: 3.2 };
    this.snd.siren();
    // the hook: artillery walks across the fog as they come, and the gun spins up
    this.intro = 1.6;
    for (let k = 0; k < 5; k++) this.strikes.push({ art: true, x: rand(80, W - 80), y: rand(HORIZON + 10, 330), t: -0.4 - k * 0.38 });
    this.hooks.wave?.(i);
  }

  waveCleared() {
    const last = this.wave >= this.waves.length - 1;
    this.stats.score += Math.round((this.line / LINE_MAX) * 300 * (1 + this.level * 0.25));
    this.snd.waveClear();
    if (last) {
      this.state = 'won';
      this.beam = null;
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
    this.beam = null;
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
    this.player.charge = 0;
    this.beam = null;
    this.hooks.end?.(false, reason);
  }

  // ---- numbers from upgrades -------------------------------------------

  heatMul() {
    return [1, 0.75, 0.58, 0.45][this.up.cool];
  }
  rateMul() {
    return [1, 1, 1.1, 1.2][this.up.cool];
  }
  dmgMul() {
    return [1, 1.2, 1.4, 1.65][this.up.pierce];
  }
  pen() {
    return [0, 0, 0.4, 0.8][this.up.pierce];
  }
  ultMul() {
    return [1, 1.3, 1.6, 2][this.up.ult];
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
    this.updateEffects(dt);
    if (this.state === 'ready' || this.state === 'pick') return;
    if (this.state === 'over' || this.state === 'won') {
      // the world goes on behind the end screen
      this.updateEnemies(dt, true);
      this.updateShells(dt);
      this.updateBoss(dt);
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
    this.updateOrbital(dt, input);
    this.updateDrones(dt);
    this.updateBullets(dt);
    this.updateRockets(dt);
    this.updateEnemies(dt, false);
    this.updateBoss(dt);
    this.updateEnemyShots(dt);
    this.updateShells(dt);
    this.updateSweeps(dt);
    this.updateStrikes(dt);
    this.updateFires(dt);

    if (this.state === 'wave' && !this.pending.length && !this.enemies.some((e) => !e.dead) && !this.boss) this.waveCleared();
    if (this.line <= 0) this.lose('line');
    if (this.player.hp <= 0) this.lose('hp');
  }

  updateEffects(dt) {
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    for (const r of this.rails) r.life -= dt;
    this.rails = this.rails.filter((r) => r.life > 0);
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

    // the weapon: each fires its own way, all of them heat and vent
    if (this.intro > 0) this.intro -= dt;
    const live = this.state === 'wave';
    const trigger = input.fire && p.vent <= 0 && live;
    const w = this.weapon;
    if (w === 'rotary') {
      const spinUp = [0.55, 0.42, 0.36, 0.3][this.up.cool];
      if (trigger || (this.intro > 0 && this.intro < 1.2)) p.spin = Math.min(1, p.spin + dt / spinUp);
      else p.spin = Math.max(0, p.spin - dt / 0.9);
      p.phase += p.spin * dt * 40;
      this.snd.spin(p.spin);
      if (trigger) {
        const rate = (3 + 15 * Math.pow(p.spin, 1.3)) * this.rateMul();
        p.acc += rate * dt;
        while (p.acc >= 1 && p.vent <= 0) {
          p.acc -= 1;
          this.fireRotary();
        }
      } else {
        p.acc = Math.min(p.acc, 0.85);
      }
    } else if (w === 'tesla') {
      // the coil hums up while held, then arcs on a fixed beat
      p.spin = trigger ? Math.min(1, p.spin + dt / 0.2) : Math.max(0, p.spin - dt / 0.5);
      p.phase += dt * (4 + p.spin * 30);
      p.zapT -= dt;
      if (trigger && p.zapT <= 0) {
        p.zapT = 0.1 / this.rateMul();
        this.zap();
      }
    } else if (w === 'plasma') {
      p.phase += dt * 6;
      if (trigger) {
        p.focus = Math.min(1.5, p.focus + dt);
        p.spin = Math.min(1, p.spin + dt / 0.12);
        this.lance(dt);
      } else {
        p.focus = Math.max(0, p.focus - dt * 3);
        p.spin = Math.max(0, p.spin - dt / 0.15);
        this.beam = null;
      }
      this.snd.beam(this.beam ? 0.5 + 0.5 * (p.focus / 1.5) : 0);
    } else if (w === 'rockets') {
      p.phase += dt * 3;
      p.volleyT -= dt;
      if (trigger && p.volleyT <= 0) {
        p.volleyT = 0.62 / this.rateMul();
        this.volley(input);
      }
    } else if (w === 'rail') {
      // hold to charge, let go (or hold a full charge a moment) to fire
      const full = [0.8, 0.7, 0.62, 0.54][this.up.cool];
      if (trigger) {
        p.charge = Math.min(1, p.charge + dt / full);
        p.held = true;
        if (p.charge >= 1) p.fullT += dt;
        if (p.fullT > 0.35) this.fireRail();
      } else if (p.held) {
        if (p.charge >= 0.2 && live && p.vent <= 0) this.fireRail();
        else p.charge = 0;
        p.held = false;
        p.fullT = 0;
      }
      p.spin = p.charge;
      p.phase += dt * (2 + p.charge * 25);
      this.snd.spin(p.charge * 0.85);
    }
    this.snd.heat(p.heat / 100);
    p.sinceShot += dt;
    if (p.vent > 0) {
      p.vent -= dt;
      p.heat = Math.max(0, p.heat - 62 * dt);
      if (Math.random() < dt * 30) this.part('steam', p.x + Math.cos(p.aim) * 30, p.y + Math.sin(p.aim) * 30, rand(-30, 30), rand(-60, -20), 0.9, rand(8, 14));
    } else if (p.sinceShot > 0.2) {
      p.heat = Math.max(0, p.heat - 36 * dt);
    }
  }

  muzzle(d = 50) {
    const p = this.player;
    return { x: p.x + Math.cos(p.aim) * d, y: p.y + Math.sin(p.aim) * d };
  }

  addHeat(h) {
    const p = this.player;
    p.heat += h * this.heatMul();
    p.sinceShot = 0;
    if (p.heat >= 100) {
      p.heat = 100;
      p.vent = 1.7;
      p.charge = 0;
      p.held = false;
      this.beam = null;
      this.snd.overheat();
      this.hooks.hint?.('Overheated! Fire in bursts to keep the weapon cool.', 'heat');
    }
  }

  fireRotary() {
    const p = this.player;
    const spread = 0.022 + 0.03 * p.spin;
    const a = p.aim + rand(-spread, spread);
    const { x: mx, y: my } = this.muzzle();
    this.bullets.push({ x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, dmg: 12 * this.dmgMul(), pierce: [0, 1, 2, 4][this.up.pierce], hit: [], kind: 'mg', life: 1 });
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
    this.addHeat(1.6);
  }

  // Tesla: a bolt to the target nearest the line of aim, then leaping on
  zap() {
    const p = this.player;
    const { x: mx, y: my } = this.muzzle(44);
    const range = 660;
    let first = null;
    let bestS = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.emerge < 0.35) continue;
      const d = Math.sqrt(dist2(mx, my, e.x, e.y));
      if (d > range) continue;
      const da = Math.abs(angDiff(Math.atan2(e.y - my, e.x - mx), p.aim));
      if (da > 0.5) continue;
      const s = da * 420 + d * 0.5;
      if (s < bestS) {
        bestS = s;
        first = e;
      }
    }
    const pts = [[mx, my]];
    const dmg0 = 16 * this.dmgMul();
    if (first) {
      const jumps = [4, 5, 6, 7][this.up.pierce];
      const seen = new Set();
      let cur = first;
      let dmg = dmg0;
      for (let k = 0; k <= jumps && cur; k++) {
        seen.add(cur.id);
        pts.push([cur.x, cur.y]);
        this.stats.hits++;
        this.hitEnemy(cur, dmg, { kind: 'arc', ignoreShield: true, ignite: Math.random() < 0.4 });
        if (Math.random() < 0.5) this.part('spark', cur.x, cur.y, rand(-160, 160), rand(-160, 160), 0.25, 2);
        dmg *= 0.86;
        let next = null;
        let nd = 190 * 190;
        for (const o of this.enemies) {
          if (o.dead || o.emerge < 0.35 || seen.has(o.id)) continue;
          const d2 = dist2(cur.x, cur.y, o.x, o.y);
          if (d2 < nd) {
            nd = d2;
            next = o;
          }
        }
        cur = next;
      }
    } else {
      const b = this.boss;
      const tgt = b && !b.dead && b.y > 120 ? this.bossAimPoint(mx, my) : null;
      if (tgt && Math.abs(angDiff(Math.atan2(tgt.y - my, tgt.x - mx), p.aim)) < 0.45 && Math.hypot(tgt.x - mx, tgt.y - my) < range + 200) {
        pts.push([tgt.x, tgt.y]);
        this.hitBoss(tgt.x, tgt.y, dmg0 * 1.6, 0.5);
      } else {
        const d = rand(150, 260);
        pts.push([mx + Math.cos(p.aim + rand(-0.3, 0.3)) * d, my + Math.sin(p.aim + rand(-0.3, 0.3)) * d]);
      }
    }
    this.arcs.push({ pts, life: 0.11, max: 0.11, seed: rand(1000) });
    this.stats.shots++;
    p.flash = 0.05;
    p.recoil = Math.min(1, p.recoil + 0.25);
    this.shake = Math.min(1.8, this.shake + 0.25);
    this.light(mx, my, 200, 1, [120, 240, 255], 0.08);
    const last = pts[pts.length - 1];
    this.light(last[0], last[1], 140, 0.9, [140, 220, 255], 0.08);
    this.snd.zap((p.x / W) * 2 - 1, pts.length);
    this.addHeat(2.3);
  }

  // Plasma: a beam that burns every body along it, hotter the longer it holds
  lance(dt) {
    const p = this.player;
    const { x: mx, y: my } = this.muzzle(54);
    const ux = Math.cos(p.aim);
    const uy = Math.sin(p.aim);
    let len = 1300;
    // the field's far edge
    if (uy < 0) len = Math.min(len, (my - (HORIZON - 30)) / -uy);
    const b = this.boss;
    if (b && !b.dead) {
      // stop at the hull: march along the beam
      for (let d = 0; d < len; d += 8) {
        const x = mx + ux * d;
        const y = my + uy * d;
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) {
          len = d;
          const k = 0.6 + 0.6 * (p.focus / 1.5);
          this.hitBoss(x, y, 130 * k * this.dmgMul() * dt, 0.6, true);
          break;
        }
      }
    }
    const x1 = mx + ux * len;
    const y1 = my + uy * len;
    const width = [14, 18, 22, 26][this.up.pierce];
    const dps = (110 + 120 * Math.min(1, p.focus / 1.5)) * this.dmgMul();
    const from = Math.atan2(-uy, -ux);
    for (const e of this.enemies) {
      if (e.dead || e.emerge < 0.35) continue;
      if (segCircle(mx, my, x1, y1, e.x, e.y, e.r + width / 2) < 0) continue;
      this.hitEnemy(e, dps * dt, { from, shieldK: 0.45, kind: 'beam', quiet: true });
      if (Math.random() < dt * 14) this.part('spark', e.x, e.y, rand(-140, 140), rand(-140, 60), 0.3, 2);
      if (Math.random() < dt * 5) this.part('fire', e.x + rand(-6, 6), e.y + rand(-6, 6), rand(-10, 10), rand(-50, -20), 0.4, rand(8, 12));
    }
    this.beam = { x0: mx, y0: my, x1, y1, w: width, focus: p.focus / 1.5 };
    if (Math.random() < dt * 30) this.part('spark', x1, y1, rand(-200, 200), rand(-200, 100), 0.3, 2);
    if (Math.random() < dt * 10) this.hooks.decal?.('burn', { x: x1, y: y1, r: 10 });
    this.light(mx, my, 180, 0.8, [255, 90, 220], 0.05);
    this.light(x1, y1, 160, 0.9, [255, 120, 230], 0.05);
    p.recoil = 0.25 + Math.sin(this.t * 60) * 0.1;
    this.shake = Math.min(1.2, this.shake + dt * 6);
    this.stats.shots += dt * 10;
    this.stats.hits += dt * 10;
    this.addHeat(14 * dt);
  }

  // Rockets: four at a time, each given its own target
  volley(input) {
    const p = this.player;
    const { x: mx, y: my } = this.muzzle(30);
    const ax = input.autoAim ? p.x : input.aim.x;
    const ay = input.autoAim ? p.y - 400 : input.aim.y;
    // targets: threats weighted toward where you point
    const cands = this.enemies
      .filter((e) => !e.dead && e.emerge > 0.5)
      .map((e) => ({ e, s: this.threat(e) * 2 - Math.sqrt(dist2(ax, ay, e.x, e.y)) / 120 - Math.abs(angDiff(Math.atan2(e.y - my, e.x - mx), p.aim)) * 2.5 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((c) => c.e);
    for (let i = 0; i < 4; i++) {
      const a = p.aim + (i - 1.5) * 0.32 + rand(-0.05, 0.05);
      const sp = 260;
      this.rockets.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, target: cands.length ? cands[i % cands.length] : null, life: 2.6, t: 0, delay: i * 0.04 });
    }
    p.recoil = 1;
    p.flash = 0.06;
    this.shake = Math.min(3, this.shake + 1);
    this.stats.shots += 4;
    for (let i = 0; i < 6; i++) this.part('smoke', mx, my, -Math.cos(p.aim) * rand(40, 120) + rand(-30, 30), -Math.sin(p.aim) * rand(40, 120) + rand(-30, 30), 0.8, rand(10, 18));
    this.light(mx, my, 200, 1, [255, 220, 120], 0.08);
    this.snd.rocket((p.x / W) * 2 - 1);
    this.addHeat(12);
  }

  updateRockets(dt) {
    const b = this.boss;
    for (const r of this.rockets) {
      if (r.delay > 0) {
        r.delay -= dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        continue;
      }
      r.t += dt;
      r.life -= dt;
      r.sp = Math.min(980, r.sp + 1500 * dt);
      if (!r.target || r.target.dead) {
        // find something near
        let best = null;
        let bd = 420 * 420;
        for (const e of this.enemies) {
          if (e.dead || e.emerge < 0.5) continue;
          const d2 = dist2(r.x, r.y, e.x, e.y);
          if (d2 < bd && e.y < r.y + 40) {
            bd = d2;
            best = e;
          }
        }
        r.target = best;
        if (!best && b && !b.dead) r.target = { x: b.x + rand(-b.w * 0.3, b.w * 0.3), y: b.y + b.h * 0.3, boss: true };
      }
      let a = Math.atan2(r.vy, r.vx);
      if (r.target && r.t > 0.08) {
        const want = Math.atan2(r.target.y - r.y, r.target.x - r.x);
        a += clamp(angDiff(want, a), -7 * dt, 7 * dt);
      }
      r.vx = Math.cos(a) * r.sp;
      r.vy = Math.sin(a) * r.sp;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (Math.random() < dt * 40) this.part('smoke', r.x - r.vx * 0.02, r.y - r.vy * 0.02, rand(-15, 15), rand(-15, 15), 0.6, rand(5, 9));
      let boom = r.life <= 0 || r.y < HORIZON - 40 || r.x < -40 || r.x > W + 40 || r.y > H;
      if (!boom) {
        for (const e of this.enemies) {
          if (!e.dead && e.emerge > 0.35 && dist2(r.x, r.y, e.x, e.y) < (e.r + 8) * (e.r + 8)) {
            boom = true;
            break;
          }
        }
      }
      if (!boom && b && !b.dead && Math.abs(r.x - b.x) < b.w / 2 && Math.abs(r.y - b.y) < b.h / 2) boom = true;
      if (boom) {
        r.dead = true;
        if (r.y > HORIZON - 40 && r.y < H) {
          const rad = [56, 62, 68, 76][this.up.pierce];
          this.blast(r.x, r.y, rad, 24 * this.dmgMul(), { enemies: true, big: 0.32, bossK: 0.55, quiet: Math.random() < 0.5, ignite: true });
          this.stats.hits++;
        }
      }
    }
    this.rockets = this.rockets.filter((r) => !r.dead);
  }

  // Rail: one hypersonic slug through everything on the line
  fireRail() {
    const p = this.player;
    const c = Math.max(0.2, p.charge);
    const { x: mx, y: my } = this.muzzle(56);
    const ux = Math.cos(p.aim);
    const uy = Math.sin(p.aim);
    const len = 1600;
    const x1 = mx + ux * len;
    const y1 = my + uy * len;
    const dmg = (70 + 250 * c) * this.dmgMul();
    for (const e of this.enemies) {
      if (e.dead || e.emerge < 0.3) continue;
      if (segCircle(mx, my, x1, y1, e.x, e.y, e.r + 6 + c * 6) < 0) continue;
      this.stats.hits++;
      this.hitEnemy(e, dmg, { vx: ux * 1800, vy: uy * 1800, ignoreShield: true, ignoreArmour: c > 0.95, kind: 'rail' });
      if (!e.dead && !e.d.armour) {
        e.x += ux * 30 * c;
        e.y += uy * 30 * c;
      }
      for (let i = 0; i < 4; i++) this.part('spark', e.x, e.y, ux * rand(100, 400) + rand(-120, 120), uy * rand(100, 400) + rand(-120, 120), 0.35, 2);
    }
    const b = this.boss;
    if (b && !b.dead) {
      for (let d = 0; d < len; d += 10) {
        const x = mx + ux * d;
        const y = my + uy * d;
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) {
          this.hitBoss(x, y, dmg * 1.1, 1);
          break;
        }
      }
    }
    this.rails.push({ x0: mx, y0: my, x1, y1, c, life: 0.45, max: 0.45 });
    this.stats.shots++;
    p.recoil = 1;
    p.flash = 0.08;
    p.charge = 0;
    p.fullT = 0;
    p.held = false;
    this.shake = Math.min(6, this.shake + 2 + c * 2.5);
    this.part('flash', mx, my, 0, 0, 0.14, 50 + c * 40);
    this.light(mx, my, 320, 1.4, [160, 255, 120], 0.12);
    for (let i = 0; i < 8; i++) this.part('smoke', mx, my, -ux * rand(40, 160) + rand(-40, 40), -uy * rand(40, 160) + rand(-40, 40), 1, rand(10, 18));
    this.snd.rail(c);
    this.addHeat(14 + 22 * c);
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
    const b = this.boss;
    if (!best && b && !b.dead && Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2 && b.vent > 0) return this.bossAimPoint(x, y);
    return best;
  }

  threat(e) {
    const close = clamp((e.y - HORIZON) / (LINE_Y - HORIZON), 0, 1);
    let s = e.d.threat * (0.4 + 1.6 * close * close);
    if (e.type === 'mortar' && e.state === 'shell') s += 1.8;
    if (e.type === 'grunt' && (e.state === 'aim' || e.state === 'burst')) s += 1.2;
    if (e.type === 'flyer' && e.state === 'dive') s += 3;
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
    if (!best && this.boss && !this.boss.dead && this.boss.y > 120) return this.bossAimPoint(x, y);
    return best;
  }

  // ---- the boss's geometry ------------------------------------------------

  vent(b, side) {
    return { x: b.x + side * b.w * 0.295, y: b.y + b.h * 0.267 };
  }

  // where to shoot at the boss from (x, y): an open vent, or the hull
  bossAimPoint(x, y) {
    const b = this.boss;
    if (b.vent > 0) {
      const v = this.vent(b, x < b.x ? -1 : 1);
      return { x: v.x, y: v.y, vx: 0, vy: 0, r: 30 };
    }
    return { x: b.x, y: b.y + b.h * 0.2, vx: 0, vy: 0, r: 60 };
  }

  // damage to the boss at a point: open vents take triple, the hull takes
  // hull x (more with Overcharge). Returns the damage done.
  hitBoss(x, y, dmg, hull = 0.3, quiet = false) {
    const b = this.boss;
    if (!b || b.dead) return 0;
    const vl = this.vent(b, -1);
    const vr = this.vent(b, 1);
    const r2 = (b.w * 0.16) ** 2;
    if (b.vent > 0 && (dist2(x, y, vl.x, vl.y) < r2 || dist2(x, y, vr.x, vr.y) < r2)) {
      dmg *= 3;
      if (!quiet || Math.random() < 0.2) this.part('spark', x, y, rand(-120, 120), rand(-80, 80), 0.25, 3);
    } else {
      dmg *= Math.min(1, hull + 0.55 * this.pen());
      if (!quiet && Math.random() < 0.3) this.part('spark', x, y, rand(-200, 200), rand(40, 200), 0.25, 2);
      if (!quiet && Math.random() < 0.12) this.snd.ping((x / W) * 2 - 1);
    }
    b.hp -= dmg;
    b.flash = 0.06;
    this.ult = Math.min(100, this.ult + dmg * 0.004 * this.ultMul());
    return dmg;
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
    if (input.orb) this.useOrbital(input.orb.x, input.orb.y, input.orb.auto);
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

  // ---- the orbital strike ----------------------------------------------------

  canOrbital() {
    return this.ult >= 100 && !this.orb && this.state === 'wave';
  }

  // the thickest knot of enemies (or the boss), for touch play
  crowd() {
    let best = null;
    let bestN = -1;
    for (const e of this.enemies) {
      if (e.dead || e.emerge < 0.6) continue;
      let n = this.threat(e) * 0.5;
      for (const o of this.enemies) if (!o.dead && dist2(e.x, e.y, o.x, o.y) < 110 * 110) n++;
      if (n > bestN) {
        bestN = n;
        best = e;
      }
    }
    const b = this.boss;
    if (b && !b.dead && b.y > 120 && bestN < 6) return { x: b.x, y: b.y + b.h * 0.25 };
    return best ? { x: best.x, y: best.y } : { x: W / 2, y: 520 };
  }

  useOrbital(x, y, auto = false) {
    if (!this.canOrbital()) return false;
    if (auto) ({ x, y } = this.crowd());
    const T = ORBITAL.time + [0, 0, 1, 2][this.up.ult];
    this.orb = { x: clamp(x, 40, W - 40), y: clamp(y, HORIZON + 60, LINE_Y - 40), t: 0, T, r: ORBITAL.r * (this.up.ult >= 3 ? 1.3 : 1), auto, retarget: 0, scorch: 0 };
    this.ult = 0;
    this.snd.orbital();
    this.banner = { title: 'Orbital strike', sub: 'Ion cannon firing', t: 1.6 };
    return true;
  }

  updateOrbital(dt, input) {
    const o = this.orb;
    if (!o) return;
    o.t += dt;
    const warm = 0.7; // the targeting ring, before the beam comes down
    // follow the pointer, or the crowd on touch
    let tx = input.aim.x;
    let ty = input.aim.y;
    if (o.auto || input.autoAim) {
      o.retarget -= dt;
      if (o.retarget <= 0) {
        o.retarget = 0.4;
        o.goal = this.crowd();
      }
      tx = o.goal.x;
      ty = o.goal.y;
    }
    ty = clamp(ty, HORIZON + 60, LINE_Y - 40);
    const dx = tx - o.x;
    const dy = ty - o.y;
    const d = Math.hypot(dx, dy);
    const sp = ORBITAL.speed * (o.t < warm ? 1.4 : 1);
    if (d > 1) {
      const k = Math.min(1, (sp * dt) / d);
      o.x += dx * k;
      o.y += dy * k;
    }
    if (o.t < warm) return;
    const r = o.r;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (dist2(e.x, e.y, o.x, o.y) < (r + e.r) * (r + e.r)) {
        this.damage(e, ORBITAL.dps * dt, e.x - o.x, e.y - o.y);
        if (Math.random() < dt * 6) this.ignite(e, 20);
      }
    }
    const b = this.boss;
    if (b && !b.dead && Math.abs(o.x - b.x) < b.w / 2 + r && Math.abs(o.y - b.y) < b.h / 2 + r) {
      b.hp -= ORBITAL.boss * dt;
      b.flash = 0.08;
    }
    this.shake = Math.min(4, this.shake + dt * 14);
    this.sky.i = Math.max(this.sky.i, 0.4);
    for (let i = 0; i < 3; i++) {
      const a = rand(Math.PI * 2);
      this.part(Math.random() < 0.5 ? 'fire' : 'spark', o.x + Math.cos(a) * r * rand(0.3, 1), o.y + Math.sin(a) * r * 0.8 * rand(0.3, 1), Math.cos(a) * rand(80, 240), Math.sin(a) * rand(80, 240) - 60, rand(0.3, 0.6), rand(10, 22));
    }
    if (Math.random() < dt * 8) this.part('smoke', o.x + rand(-r, r), o.y + rand(-r, r) * 0.6, rand(-30, 30), rand(-90, -40), 1.6, rand(24, 40));
    this.light(o.x, o.y, r * 5, 1.2, [150, 220, 255], 0.06);
    o.scorch -= dt;
    if (o.scorch <= 0) {
      o.scorch = 0.08;
      this.hooks.decal?.('scorch', { x: o.x + rand(-10, 10), y: o.y + rand(-10, 10), r: r * 0.7 });
    }
    if (o.t >= o.T + warm) {
      this.blast(o.x, o.y, r * 1.6, 160, { enemies: true, big: 1, bossK: 0.5 });
      this.orb = null;
    }
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
      if (boss && !boss.dead && boss.y > -100 && Math.abs(b.x - boss.x) < boss.w / 2 && Math.abs(b.y - boss.y) < boss.h / 2) {
        this.hitBoss(b.x, b.y, b.dmg, 0.3);
        this.stats.hits++;
        if (this.up.fire >= 2 && Math.random() < 0.08) this.part('fire', b.x, b.y, 0, -30, 0.5, 12);
        b.life = 0;
        continue;
      }
      const from = Math.atan2(-b.vy, -b.vx);
      for (const e of this.enemies) {
        if (e.dead || e.emerge < 0.35 || b.hit.includes(e.id)) continue;
        if (segCircle(b.px, b.py, b.x, b.y, e.x, e.y, e.r + 2) < 0) continue;
        b.hit.push(e.id);
        this.stats.hits++;
        const blocked = this.hitEnemy(e, b.dmg, { vx: b.vx, vy: b.vy, from, ignite: b.kind === 'mg' });
        if (blocked) {
          for (let i = 0; i < 3; i++) this.part('spark', b.x, b.y, -b.vx * 0.1 + rand(-160, 160), -b.vy * 0.1 + rand(-160, 160), 0.3, 2);
          if (Math.random() < 0.4) this.snd.ping((e.x / W) * 2 - 1);
          if (this.pen() < 0.5) {
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

  // Every weapon hit on an enemy goes through here. o.from: the bearing the
  // hit comes from (shields block it head on); o.ignoreShield, o.ignoreArmour,
  // o.shieldK (what gets through a shield before Overcharge), o.ignite.
  // Returns true if a shield took it.
  hitEnemy(e, dmg, o = {}) {
    if (e.dead) return false;
    const pen = this.pen();
    let blocked = false;
    if (e.type === 'heavy' && o.from != null && !o.ignoreShield && Math.abs(angDiff(o.from, e.shield)) < 0.85) {
      blocked = true;
      const k = o.shieldK ?? 0.18;
      dmg *= k + (1 - k) * pen;
    }
    if (e.d.armour && !o.ignoreArmour) dmg *= e.d.armour + (1 - e.d.armour) * pen;
    this.damage(e, dmg, o.vx || 0, o.vy || 0, blocked, o.quiet);
    if (this.up.fire && o.ignite !== false && (!blocked || this.up.fire >= 2)) this.ignite(e, [0, 7, 13, 18][this.up.fire]);
    return blocked;
  }

  damage(e, dmg, vx = 0, vy = 0, blocked = false, quiet = false) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.06;
    if (!blocked && !quiet) {
      if (!e.d.armour) {
        e.x += vx * 0.00016;
        e.y += vy * 0.00016;
      }
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
    this.stats.score += Math.round(e.d.score * (1 + this.wave * 0.1) * (1 + this.level * 0.25));
    this.ult = Math.min(100, this.ult + e.d.charge * this.ultMul());
    if (e.type === 'flyer') {
      e.baked = true; // nothing left to lie on the ground
      this.blast(e.x, e.y, 34, 0, { big: 0.25, quiet: true, noScorch: true });
      for (let i = 0; i < 6; i++) this.part('debris', e.x, e.y, rand(-200, 200), rand(-200, 200), 0.7, rand(2, 4));
      this.snd.pop((e.x / W) * 2 - 1);
      return;
    }
    for (let i = 0; i < 6; i++) this.part('mist', e.x, e.y, vx * 0.06 + rand(-60, 60), vy * 0.06 + rand(-60, 60), 0.6, rand(6, 12));
    this.snd.death((e.x / W) * 2 - 1);
    if (e.type === 'sapper') this.blast(e.x, e.y, 80, 70, { enemies: true, player: true, big: 0.6 });
    if (e.type === 'brute') this.blast(e.x, e.y, 96, 90, { enemies: true, big: 0.95 });
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
      stopY: 0, shooter: false, shots: 0, spd: this.L.speed, fly: type === 'flyer',
    };
    if (type === 'grunt' && this.wave >= 1 && rand() < 0.35) {
      e.shooter = true;
      e.stopY = rand(520, 790);
    }
    if (type === 'mortar') e.stopY = rand(290, 520);
    if (type === 'flyer') e.stopY = rand(500, 720);
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
      if (e.fly) {
        this.updateFlyer(e, dt);
        continue;
      }
      const d = e.d;
      let speed = d.speed * e.spd;
      if (Math.abs(e.y - WIRE_Y) < 22) speed *= 0.45; // the wire slows them
      let wantX = 0;
      let wantY = speed;

      if (e.type === 'sapper') wantX = Math.sin(e.t * 3 + e.seed) * 70;
      else if (e.type === 'grunt') wantX = Math.sin(e.t * 0.6 + e.seed) * 10;

      if (e.type === 'heavy') {
        // the shield swings round to face the soldier, slowly
        const want = Math.atan2(p.y - e.y, p.x - e.x);
        e.shield += clamp(angDiff(want, e.shield), -0.55 * dt, 0.55 * dt);
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
    const live = this.enemies.filter((e) => !e.dead && !e.fly);
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

  // hornet drones: weave down the field, stop and lock on, then dive in a
  // straight line at where the soldier is heading. Sidestep and it misses.
  updateFlyer(e, dt) {
    const p = this.player;
    if (e.state === 'walk') {
      const wx = Math.sin(e.t * 2.2 + e.seed) * 110;
      e.vx += (wx - e.vx) * Math.min(1, dt * 2.5);
      e.vy += (e.d.speed * e.spd - e.vy) * Math.min(1, dt * 2.5);
      e.face = Math.atan2(e.vy, e.vx);
      if (e.y > e.stopY) {
        e.state = 'lock';
        e.st = 0.55;
        this.snd.lock((e.x / W) * 2 - 1);
      }
    } else if (e.state === 'lock') {
      e.vx *= 1 - Math.min(1, dt * 6);
      e.vy *= 1 - Math.min(1, dt * 6);
      e.face = Math.atan2(p.y - e.y, p.x - e.x);
      e.st -= dt;
      if (e.st <= 0) {
        e.state = 'dive';
        const tx = p.x + p.vx * 0.35;
        const ty = p.y + p.vy * 0.35;
        const a = Math.atan2(ty - e.y, tx - e.x);
        const sp = 380 * e.spd;
        e.vx = Math.cos(a) * sp;
        e.vy = Math.sin(a) * sp;
        e.face = a;
        e.left = Math.hypot(tx - e.x, ty - e.y) + 40;
      }
    } else if (e.state === 'dive') {
      e.left -= Math.hypot(e.vx, e.vy) * dt;
      if (Math.random() < dt * 30) this.part('steam', e.x, e.y, rand(-10, 10), rand(-10, 10), 0.4, 5);
      if (dist2(e.x, e.y, p.x, p.y) < (e.r + 18) * (e.r + 18) || e.left <= 0) {
        e.dead = true;
        e.deadT = 0;
        e.baked = true;
        this.blast(e.x, e.y, 34, 0, { player: e.d.dive, big: 0.45 });
        return;
      }
    }
    e.x = clamp(e.x + e.vx * dt, 20, W - 20);
    e.y += e.vy * dt;
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
    if (y > HORIZON + 150 && !o.noScorch) this.hooks.decal?.('scorch', { x, y, r: r * 0.55 });
    if (o.enemies && dmg) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d2 = dist2(x, y, e.x, e.y);
        if (d2 < (r + e.r) * (r + e.r)) this.hitEnemy(e, dmg * (1 - (0.5 * Math.sqrt(d2)) / (r + e.r)), { vx: e.x - x, vy: e.y - y, ignite: !!o.ignite, quiet: true });
      }
      const b = this.boss;
      if (b && !b.dead && Math.abs(x - b.x) < b.w / 2 + r && Math.abs(y - b.y) < b.h / 2 + r) this.hitBoss(x, y, dmg, o.bossK ?? 0.8, true);
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
    const d = this.L.boss;
    this.boss = {
      def: d, w: d.w, h: d.h, x: W / 2, y: -d.h * 0.65, hp: d.hp, max: d.hp, state: 'enter', turret: Math.PI / 2, cannonT: 5, aimT: 0, aimX: 0, aimY: 0,
      deployT: 10, barrageT: 14, sweepT: 12, vent: 0, tread: 0, flash: 0, dead: false, deathT: 0, recoil: 0,
    };
    this.hooks.hint?.(`The ${d.name}: its hull shrugs off most fire. After its cannon fires, its vents glow open: hit them.`, 'boss');
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    const d = b.def;
    const p = this.player;
    b.flash = Math.max(0, b.flash - dt);
    b.recoil = Math.max(0, b.recoil - dt * 3);
    if (b.dead) {
      b.deathT += dt;
      this.snd.bossTreads(0);
      if (Math.random() < dt * 9 && b.deathT < 2.6) this.blast(b.x + rand(-b.w * 0.43, b.w * 0.43), b.y + rand(-b.h * 0.4, b.h * 0.4), 60, 0, { big: 0.7 });
      if (b.deathT > 2.8 && !b.gone) {
        b.gone = true;
        this.blast(b.x, b.y, 160, 400, { enemies: true, big: 1 });
        this.hooks.decal?.('wreck', { x: b.x, y: b.y, w: b.w, h: b.h });
        // the rest of them break and are cut down
        for (const e of this.enemies) if (!e.dead) this.kill(e);
        this.pending = [];
        this.boss = null;
      }
      return;
    }
    if (this.state !== 'wave' && this.state !== 'break') return;
    let moving = false;
    if (b.y < d.stopY) {
      b.y += d.speed * 1.6 * dt;
      moving = true;
    } else {
      const tx = clamp(p.x, b.w * 0.8, W - b.w * 0.8);
      if (Math.abs(tx - b.x) > 4) {
        b.x += Math.sign(tx - b.x) * 16 * dt;
        moving = true;
      }
    }
    if (moving) b.tread += dt;
    this.snd.bossTreads(moving ? 0.8 : 0.25);
    if (Math.random() < dt * 6) this.part('smoke', b.x + rand(-b.w * 0.3, b.w * 0.3), b.y - b.h / 2 + 10, rand(-10, 10), rand(-60, -30), 2, rand(14, 22));
    if (b.hp <= 0) {
      b.dead = true;
      b.deathT = 0;
      b.aimT = 0;
      this.sweeps = [];
      this.stats.score += d.score;
      this.stats.kills++;
      this.banner = { title: `${d.name} destroyed`, sub: 'The line holds', t: 3 };
      return;
    }
    if (b.y < 140) return;

    const rage = b.hp < b.max * 0.35;
    const has = (k) => d.attacks.includes(k);
    b.vent = Math.max(0, b.vent - dt);

    // the main gun: a long laser-marked aim, then a shell where you were
    const gun = b.h * 0.55;
    if (b.aimT > 0) {
      b.aimT -= dt;
      if (b.aimT > 0.35) {
        b.aimX = p.x;
        b.aimY = p.y;
      }
      b.turret += clamp(angDiff(Math.atan2(b.aimY - b.y, b.aimX - b.x), b.turret), -3 * dt, 3 * dt);
      if (b.aimT <= 0) {
        const mx = b.x + Math.cos(b.turret) * gun;
        const my = b.y + Math.sin(b.turret) * gun;
        const dd = Math.hypot(b.aimX - mx, b.aimY - my);
        this.shells.push({ x0: mx, y0: my, tx: b.aimX, ty: b.aimY, t: 0, T: dd / 1500, r: 92, dmg: 30, kind: 'cannon' });
        this.light(mx, my, 340, 1.5, [255, 200, 120], 0.12);
        this.part('flash', mx, my, 0, 0, 0.12, 90);
        for (let i = 0; i < 10; i++) this.part('smoke', mx, my, Math.cos(b.turret) * rand(60, 200) + rand(-40, 40), Math.sin(b.turret) * rand(60, 200) + rand(-40, 40), 1.6, rand(18, 30));
        this.snd.cannon();
        this.shake += 3;
        b.recoil = 1;
        b.vent = 2.6;
        b.cannonT = rage ? d.cannon * 0.7 : d.cannon;
      }
    } else {
      b.turret += clamp(angDiff(Math.atan2(p.y - b.y, p.x - b.x), b.turret), -1.2 * dt, 1.2 * dt);
      b.cannonT -= dt;
      if (b.cannonT <= 0) b.aimT = 1.35;
    }

    // troops out of the rear hatch
    if (has('troops')) {
      b.deployT -= dt;
      if (b.deployT <= 0) {
        b.deployT = rage ? d.troops * 0.7 : d.troops;
        const n0 = this.enemies.length;
        const mul = this.L.hp * 1.4;
        for (let i = 0; i < 4; i++) this.spawn({ type: 'grunt', x: b.x + rand(-90, 90), mul });
        const side = this.level >= 1 && rand() < 0.5 ? 'flyer' : 'sapper';
        for (let i = 0; i < 2; i++) this.spawn({ type: side, x: b.x + (i ? 110 : -110), mul });
        for (const e of this.enemies.slice(n0)) {
          e.y = b.y - 40;
          e.x = clamp(b.x + (e.x - b.x) * 1.4, 30, W - 30);
          e.emerge = 1;
        }
      }
    }

    // below 60%: mortar barrages round the soldier
    if (has('barrage') && b.hp < b.max * 0.6) {
      b.barrageT -= dt;
      if (b.barrageT <= 0) {
        b.barrageT = rage ? 8 : 11;
        for (let i = 0; i < 5; i++) {
          const tx = clamp(p.x + rand(-150, 150), ZONE.x0, ZONE.x1);
          const ty = clamp(p.y + rand(-70, 70), ZONE.y0 - 30, ZONE.y1);
          this.shells.push({ x0: b.x, y0: b.y - 60, tx, ty, t: -i * 0.25, T: 1.9, r: 66, dmg: 14, kind: 'mortar' });
        }
        setTimeout(() => this.snd.whistle(), 400);
      }
    }

    // below 80%: a laser sweeps across the trench at the soldier's depth.
    // Step up or back out of the marked band
    if (has('sweep') && b.hp < b.max * 0.8) {
      b.sweepT -= dt;
      if (b.sweepT <= 0) {
        b.sweepT = rage ? 7 : 10;
        this.sweeps.push({ y: clamp(p.y, ZONE.y0 + 20, ZONE.y1 - 20), h: 58, t: 0, warn: 1.3, fire: 0.5, dir: rand() < 0.5 ? 1 : -1, hit: false });
        if (rage) this.sweeps.push({ y: clamp(p.y + rand(-30, 30), ZONE.y0 + 20, ZONE.y1 - 20), h: 58, t: -1.1, warn: 1.3, fire: 0.5, dir: rand() < 0.5 ? 1 : -1, hit: false });
        this.snd.charge();
      }
    }
  }

  updateSweeps(dt) {
    const p = this.player;
    for (const s of this.sweeps) {
      s.t += dt;
      if (s.t < s.warn) continue;
      if (!s.fired) {
        s.fired = true;
        this.snd.laser();
        this.shake += 2;
      }
      const u = (s.t - s.warn) / s.fire; // the beam crosses the field
      const x = s.dir > 0 ? lerp(-40, W + 40, u) : lerp(W + 40, -40, u);
      if (Math.random() < 0.8) this.part('spark', x, s.y, rand(-200, 200), rand(-150, 50), 0.4, 2);
      if (Math.random() < 0.4) this.part('fire', x, s.y, rand(-30, 30), rand(-60, -20), 0.5, rand(10, 16));
      this.light(x, s.y, 220, 1.2, [255, 60, 80], 0.05);
      if (!s.hit && Math.abs(x - p.x) < 30 && Math.abs(p.y - s.y) < s.h / 2 + 10) {
        s.hit = true;
        this.hurt(22);
      }
      if (Math.random() < 0.5) this.hooks.decal?.('burn', { x, y: s.y + rand(-6, 6), r: 8 });
    }
    this.sweeps = this.sweeps.filter((s) => s.t < s.warn + s.fire);
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
      kills: s.kills, score: s.score, time: Math.round(s.time), accuracy: s.shots ? Math.min(100, Math.round((100 * s.hits) / s.shots)) : 0, up: { ...this.up },
      level: this.level + 1, weapon: this.weapon, waves: this.waves.length, ult: Math.round(this.ult),
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
