// The simulation of one run: the current room, the keeper, enemies, projectiles, pickups, hazards and
// telegraphs, stepped at a fixed rate by tick(). Pure TypeScript with no Phaser or DOM, so it runs in Node
// for tests and bots. Everything the view or audio needs to react to is pushed onto `fx` as events.
import { PLAYER, TILE } from '../config';
import { Rng } from '../core/rng';
import { angleDiff } from '../core/math';
import type { Enemy, EnemyKind, Fx, Hazard, InputFrame, Pickup, Projectile, Prop, Telegraph, WeaponId } from './types';
import { makePlayer, updatePlayer } from './player';
import { ENEMY_DEFS, updateEnemy } from './enemies';
import { XP_BY_KIND, damageEnemy, damagePlayer, healPlayer, chainLightning } from './combat';
import { computeStats, rollChoices, xpToNext, type Choice, type Ranks, type Stats, type UpgradeId } from './upgrades';
import { parseRoom, setDoorOpen, type RoomData, type RoomDef, type WaveDef } from './level/rooms';

export interface RunState {
  seed: number;
  weapon: WeaponId;
  level: number;
  xp: number;
  motes: number;
  ranks: Ranks;
  stats: Stats;
  picks: UpgradeId[]; // in the order taken
  pendingLevels: number;
  choice: Choice[] | null; // an open upgrade choice
  choiceSource: 'level' | 'shrine' | null;
  kills: number;
  damageTaken: number;
  damageDealt: number;
  time: number;
  roomsCleared: number;
  hitCounter: number;
  ward: number; // Radiant Aegis ward seconds left
  mendCount: number;
}

/** Seconds a defeated boss lingers (dying sequence) before it is removed. */
export const BOSS_DEATH_T = 2.6;

export type RoomState = 'intro' | 'combat' | 'clear' | 'transition' | 'peaceful';

type NewProjectile = Omit<Projectile, 'id' | 'px' | 'py' | 'hit' | 't' | 'dead'> & { skip?: number };
type NewHazard = Omit<Hazard, 'id' | 'hitT' | 'dead' | 'ang' | 'len' | 'r2' | 'spin'> & Partial<Pick<Hazard, 'ang' | 'len' | 'r2' | 'spin'>>;
type NewTele = Omit<Telegraph, 'id' | 't' | 'dead'>;

export class World {
  rng: Rng;
  room!: RoomData;
  player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  telegraphs: Telegraph[] = [];
  hazards: Hazard[] = [];
  fx: Fx[] = [];
  run: RunState;
  time = 0;
  hitstop = 0;
  timeScale = 1;
  slowT = 0;
  shakeAmt = 0;
  shakeT = 0;
  god = false;
  roomState: RoomState = 'intro';
  waveIndex = 0;
  waveTimer = 0;
  waves: WaveDef[] = [];
  pendingSpawns: { x: number; y: number; kind: EnemyKind; t: number; elite: boolean; tele: number }[] = [];
  interactTarget: Prop | null = null;
  exitRequest: { door: number } | null = null;
  private nextId = 1;
  private flowT = 0;
  private wispAngle = 0;
  private stormT = 0;

  constructor(seed: number, weapon: WeaponId = 'lantern') {
    this.rng = new Rng(seed);
    this.run = {
      seed, weapon, level: 0, xp: 0, motes: 0, ranks: {}, stats: computeStats({}), picks: [], pendingLevels: 0,
      choice: null, choiceSource: null, kills: 0, damageTaken: 0, damageDealt: 0, time: 0, roomsCleared: 0,
      hitCounter: 0, ward: 0, mendCount: 0,
    };
    this.player = makePlayer(0, 0, weapon);
  }

  get id() { return this.nextId++; }
  get grid() { return this.room.grid; }

  emit(f: Fx) { if (this.fx.length < 600) this.fx.push(f); }
  shake(amt: number, dur: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amt);
    this.shakeT = Math.max(this.shakeT, dur);
    this.emit({ type: 'shake', amt, dur });
  }
  slowMo(dur: number, scale: number) { this.slowT = Math.max(this.slowT, dur); this.timeScale = Math.min(this.timeScale, scale); }
  cue(e: Enemy, cue: string) { this.emit({ type: 'enemyCue', id: e.id, cue, x: e.x, y: e.y }); }

  // ---- rooms -------------------------------------------------------------------------------------
  loadRoom(def: RoomDef, opts: { combat: boolean } = { combat: true }) {
    this.room = parseRoom(def);
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.telegraphs = [];
    this.hazards = [];
    this.pendingSpawns = [];
    const p = this.player;
    p.x = p.px = this.room.spawn.x;
    p.y = p.py = this.room.spawn.y;
    p.vx = p.vy = p.kx = p.ky = 0;
    if (p.state !== 'dead') { p.state = 'normal'; p.st = 0; }
    this.waves = opts.combat ? def.waves : [];
    this.waveIndex = 0;
    this.waveTimer = 1.2; // a breath before the first wave
    this.roomState = this.waves.length ? 'intro' : 'peaceful';
    for (const d of this.room.doors) setDoorOpen(this.room, d, !this.waves.length);
    this.room.grid.flowTarget = -1;
    this.exitRequest = null;
  }

  // ---- spawning ----------------------------------------------------------------------------------
  spawnEnemy(kind: EnemyKind, x: number, y: number, elite = false): Enemy {
    const d = ENEMY_DEFS[kind];
    const hp = Math.round(d.hp * (elite ? 1.7 : 1) * this.hpScale());
    const e: Enemy = {
      id: this.id, kind, x, y, px: x, py: y, vx: 0, vy: 0, r: d.r, hp, maxHp: hp, state: 'idle', st: 0,
      face: Math.atan2(this.player.y - y, this.player.x - x), cd: 0.8 + this.rng.next() * 0.8, flash: 0, stun: 0,
      kx: 0, ky: 0, mass: d.mass, superArmor: d.superArmor, spawnT: kind === 'dummy' ? 0 : 0.5, shield: null,
      burn: 0, burnDps: 0, burnTick: 0, elite, dead: false, deathT: 0, hitCount: 0, tx: 0, ty: 0, aux: 0, aux2: 0,
      tele: 0, xp: XP_BY_KIND[kind], touchDmg: 0, vulnerable: 1,
    };
    this.enemies.push(e);
    this.emit({ type: 'spawn', x, y, kind });
    return e;
  }

  /** Enemy health grows gently with each room cleared. */
  hpScale() { return 1 + this.run.roomsCleared * 0.06; }

  isOpenSpot(x: number, y: number, r: number): boolean {
    const g = this.room.grid;
    for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (!g.walkableAt(x + dx, y + dy)) return false;
    return x > TILE * 1.5 && y > TILE * 1.5 && x < (this.room.w - 1.5) * TILE && y < (this.room.h - 1.5) * TILE;
  }

  /** A fair spawn point: walkable, reachable, away from the player and other spawns. */
  findSpawnPoint(minDist = 120, maxDist = 300): { x: number; y: number } | null {
    const p = this.player, g = this.room.grid;
    g.computeFlow(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    for (let tries = 0; tries < 80; tries++) {
      const tx = this.rng.int(2, this.room.w - 3), ty = this.rng.int(2, this.room.h - 3);
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (!this.isOpenSpot(x, y, 7)) continue;
      if (g.flow[ty * g.w + tx] === 0xffff) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      const relax = tries > 50 ? 0.6 : 1;
      if (d < minDist * relax || d > maxDist) continue;
      if (this.pendingSpawns.some((s) => Math.hypot(s.x - x, s.y - y) < 28)) continue;
      if (this.enemies.some((e) => !e.dead && Math.hypot(e.x - x, e.y - y) < 20)) continue;
      return { x, y };
    }
    return null;
  }

  queueSpawn(kind: EnemyKind, elite = false, at?: { x: number; y: number }) {
    const pt = at ?? this.findSpawnPoint();
    if (!pt) return;
    const tele = this.addTelegraph({ kind: 'spawn', x: pt.x, y: pt.y, r: kind === 'colossus' ? 18 : 12, ang: 0, len: 0, dur: 0.95, boss: false });
    this.pendingSpawns.push({ x: pt.x, y: pt.y, kind, t: 0.95, elite, tele });
  }

  spawnProjectile(o: NewProjectile) {
    if (this.projectiles.length > 400) return;
    const pr: Projectile = { ...o, id: this.id, px: o.x, py: o.y, hit: o.skip !== undefined && o.skip >= 0 ? [o.skip] : [], t: 0, dead: false };
    delete (pr as Partial<NewProjectile>).skip;
    this.projectiles.push(pr);
  }

  spawnMote(x: number, y: number, value: number, kind: Pickup['kind'] = 'mote') {
    if (this.pickups.length > 260) { this.gainMotes(value); return; }
    const a = this.rng.next() * Math.PI * 2, s = 30 + this.rng.next() * 60;
    this.pickups.push({ id: this.id, kind, x, y, px: x, py: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, value, t: 0, magnet: false, dead: false });
  }

  addHazard(h: NewHazard): number {
    const hz: Hazard = { ang: 0, len: 0, r2: 0, spin: 0, ...h, id: this.id, hitT: new Map(), dead: false };
    if (this.hazards.length < 300) this.hazards.push(hz);
    return hz.id;
  }

  addTelegraph(t: NewTele): number {
    const tg: Telegraph = { ...t, id: this.id, t: 0, dead: false };
    this.telegraphs.push(tg);
    return tg.id;
  }
  moveTelegraph(id: number, x: number, y: number, ang?: number, len?: number) {
    const t = this.telegraphs.find((t) => t.id === id);
    if (!t) return;
    t.x = x; t.y = y;
    if (ang !== undefined) t.ang = ang;
    if (len !== undefined) t.len = len;
  }
  removeTelegraph(id: number) { for (const t of this.telegraphs) if (t.id === id) t.dead = true; }
  removeTelegraphsOf(e: Enemy) { if (e.tele) this.removeTelegraph(e.tele); e.tele = 0; }

  /** At most a few enemies may start an attack at the same time, so fights stay readable. */
  attackSlot(e: Enemy): boolean {
    let busy = 0;
    for (const o of this.enemies) {
      if (o === e || o.dead) continue;
      if (o.tele || o.state === 'lunge' || o.state === 'charge' || o.state === 'fire') busy++;
    }
    return busy < (this.waveIndex >= 2 ? 3 : 2);
  }

  // ---- progression -------------------------------------------------------------------------------
  gainMotes(n: number) {
    const r = this.run;
    r.motes += n;
    r.xp += n;
    this.player.radiance = Math.min(PLAYER.radianceMax, this.player.radiance + 2.2 * n * r.stats.radianceMul);
    if (r.stats.mendEvery > 0) {
      r.mendCount += n;
      while (r.mendCount >= r.stats.mendEvery) { r.mendCount -= r.stats.mendEvery; healPlayer(this, 1); }
    }
    while (r.xp >= xpToNext(r.level)) {
      r.xp -= xpToNext(r.level);
      r.level++;
      r.pendingLevels++;
      this.emit({ type: 'levelUp' });
    }
  }

  /** Opens the next upgrade choice if one is owed and none is showing. Returns true if a choice is open. */
  offerChoice(source: 'level' | 'shrine' = 'level'): boolean {
    const r = this.run;
    if (r.choice) return true;
    if (source === 'level' && r.pendingLevels <= 0) return false;
    const c = rollChoices(this.rng, r.ranks, 3, source === 'shrine');
    if (!c.length) { if (source === 'level') r.pendingLevels = 0; return false; }
    r.choice = c;
    r.choiceSource = source;
    return true;
  }

  choose(i: number) {
    const r = this.run;
    if (!r.choice) return;
    const c = r.choice[Math.max(0, Math.min(r.choice.length - 1, i))];
    this.applyUpgrade(c.id);
    if (r.choiceSource === 'level') r.pendingLevels = Math.max(0, r.pendingLevels - 1);
    r.choice = null;
    r.choiceSource = null;
  }

  applyUpgrade(id: UpgradeId) {
    const r = this.run;
    const before = r.stats.synergies;
    r.ranks[id] = (r.ranks[id] ?? 0) + 1;
    r.picks.push(id);
    r.stats = computeStats(r.ranks);
    const p = this.player;
    const oldMax = p.maxHp;
    p.maxHp = Math.max(2, PLAYER.baseHp + r.stats.maxHpBonus);
    if (p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.hp, p.maxHp);
    if (p.dashCharges < r.stats.dashCharges && p.dashRecharge <= 0) p.dashRecharge = 0.01;
    for (const s of r.stats.synergies) if (!before.has(s)) this.emit({ type: 'text', x: p.x, y: p.y - 34, text: 'Synergy!', tone: 'good' });
  }

  // ---- interaction -------------------------------------------------------------------------------
  interact() {
    const t = this.interactTarget;
    if (!t) return;
    this.onInteract?.(t);
  }
  onInteract: ((p: Prop) => void) | null = null;

  private findInteract() {
    const p = this.player;
    let best: Prop | null = null, bd = 26;
    for (const pr of this.room.props) {
      if (!pr.interact) continue;
      const cx = (pr.tx + pr.tw / 2) * TILE, cy = (pr.ty + pr.th) * TILE;
      const d = Math.hypot(cx - p.x, cy - p.y) - Math.max(pr.tw, pr.th) * 5;
      if (d < bd) { bd = d; best = pr; }
    }
    this.interactTarget = best;
  }

  // ---- boss hooks (filled by the boss module) -----------------------------------------------------
  updateBoss: (e: Enemy, dt: number) => void = () => {};
  bossDamageMul: (e: Enemy) => number = () => 1;

  // ---- the step ----------------------------------------------------------------------------------
  /** One fixed simulation step of `dt` seconds of real time. */
  tick(inp: InputFrame, dt: number) {
    const p = this.player;
    // Interpolation anchors.
    p.px = p.x; p.py = p.y;
    for (const e of this.enemies) { e.px = e.x; e.py = e.y; }
    for (const pr of this.projectiles) { pr.px = pr.x; pr.py = pr.y; }
    for (const pk of this.pickups) { pk.px = pk.x; pk.py = pk.y; }

    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeAmt = 0; }
    if (this.run.choice) return; // the world waits while an upgrade is being chosen
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.timeScale = 1;
    }
    const sdt = dt * this.timeScale;
    this.time += sdt;
    if (p.state !== 'dead' && this.roomState !== 'transition') this.run.time += dt;
    this.run.ward = Math.max(0, this.run.ward - sdt);

    updatePlayer(this, inp, sdt);
    this.findInteract();

    // Flow field toward the player, refreshed a few times a second.
    this.flowT -= sdt;
    if (this.flowT <= 0) {
      this.flowT = 0.15;
      this.room.grid.computeFlow(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    }

    this.updateSpawns(sdt);
    for (const e of this.enemies) {
      if (e.dead) {
        e.deathT += sdt;
        if (e.kind === 'boss') this.updateBoss(e, sdt); // boss: drives its dying sequence
        continue;
      }
      e.st += sdt;
      e.flash = Math.max(0, e.flash - sdt);
      if (e.spawnT > 0) { e.spawnT -= sdt; continue; }
      if (e.shield) { e.shield.t -= sdt; if (e.shield.t <= 0) e.shield = null; }
      if (e.burn > 0) {
        e.burn -= sdt;
        e.burnTick -= sdt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.5;
          damageEnemy(this, e, e.burnDps * 0.5, { src: 'burn', x: e.x, y: e.y, knock: 0, heavy: false, proc: false });
        }
        if (e.burn <= 0) e.burnDps = 0;
      }
      if (e.dead) continue;
      updateEnemy(this, e, sdt);
      const kd = Math.exp(-9 * sdt);
      e.kx *= kd; e.ky *= kd;
      e.x += (e.vx + e.kx) * sdt;
      e.y += (e.vy + e.ky) * sdt;
      this.room.grid.collideCircle(e, e.r);
    }
    this.separate();
    this.updateWisps(sdt);
    this.updateProjectiles(sdt);
    this.updateHazards(sdt);
    this.updatePickups(sdt);
    for (const t of this.telegraphs) t.t += sdt;
    // Drop dead things (enemies linger briefly for their death animation, which the view owns).
    if (this.telegraphs.some((t) => t.dead)) this.telegraphs = this.telegraphs.filter((t) => !t.dead);
    if (this.projectiles.some((t) => t.dead)) this.projectiles = this.projectiles.filter((t) => !t.dead);
    if (this.hazards.some((t) => t.dead)) this.hazards = this.hazards.filter((t) => !t.dead);
    if (this.pickups.some((t) => t.dead)) this.pickups = this.pickups.filter((t) => !t.dead);
    // (The boss lingers longer: its dying sequence runs BOSS_DEATH_T seconds before it is removed.)
    const gone = (e: Enemy) => e.dead && e.deathT > (e.kind === 'boss' ? BOSS_DEATH_T : 1.2);
    if (this.enemies.some(gone)) this.enemies = this.enemies.filter((e) => !gone(e));
    this.updateEncounter(sdt);
    this.checkExit();
  }

  private separate() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.spawnT > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (rr - d) / 2;
        const wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
        a.x -= (dx / d) * push * 2 * wa; a.y -= (dy / d) * push * 2 * wa;
        b.x += (dx / d) * push * 2 * wb; b.y += (dy / d) * push * 2 * wb;
      }
      // Enemies never stand inside the player either (soft push, player is not moved).
      const p = this.player;
      const dx = a.x - p.x, dy = a.y - p.y, rr = a.r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        a.x += (dx / d) * (rr - d);
        a.y += (dy / d) * (rr - d);
      }
      this.room.grid.collideCircle(a, a.r);
    }
  }

  private updateSpawns(dt: number) {
    for (const s of this.pendingSpawns) {
      s.t -= dt;
      if (s.t <= 0) {
        this.removeTelegraph(s.tele);
        this.spawnEnemy(s.kind, s.x, s.y, s.elite);
      }
    }
    this.pendingSpawns = this.pendingSpawns.filter((s) => s.t > 0);
  }

  private updateEncounter(dt: number) {
    if (this.roomState === 'intro' || this.roomState === 'combat') {
      // A dying boss still holds the room until its death sequence ends.
      const alive = this.enemies.filter((e) => (!e.dead || e.kind === 'boss') && e.kind !== 'dummy').length + this.pendingSpawns.length;
      if (this.roomState === 'intro') {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) { this.roomState = 'combat'; this.startWave(); }
        return;
      }
      const wave = this.waves[this.waveIndex - 1];
      const threshold = wave ? Math.floor(wave.kinds.length * 0.25) : 0;
      this.waveTimer += dt;
      if (this.waveIndex < this.waves.length && (alive <= threshold || this.waveTimer > 22)) this.startWave();
      else if (this.waveIndex >= this.waves.length && alive === 0) this.clearRoom();
    }
  }

  private startWave() {
    const w = this.waves[this.waveIndex++];
    this.waveTimer = 0;
    if (!w) return;
    w.kinds.forEach((k, i) => this.queueSpawn(k, i < (w.elite ?? 0)));
  }

  clearRoom() {
    this.roomState = 'clear';
    this.run.roomsCleared++;
    // The light returns: a clear room mends one flame.
    if (this.player.state !== 'dead' && this.player.hp < this.player.maxHp) { this.player.hp++; this.emit({ type: 'heal', x: this.player.x, y: this.player.y, amt: 1 }); }
    for (const pr of this.projectiles) if (pr.team === 'enemy') pr.dead = true;
    for (const h of this.hazards) if (h.team === 'enemy') h.dead = true;
    for (const t of this.telegraphs) t.dead = true;
    // Gather every loose mote.
    for (const pk of this.pickups) pk.magnet = true;
    for (const d of this.room.doors) setDoorOpen(this.room, d, true);
    this.emit({ type: 'roomClear' });
    this.emit({ type: 'doorOpen' });
  }

  private checkExit() {
    if (this.exitRequest || this.roomState === 'transition') return;
    const p = this.player;
    this.room.doors.forEach((d, i) => {
      if (!d.open) return;
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      const edge = d.side === 'n' ? ty <= 0 : d.side === 's' ? ty >= this.room.h - 1 : d.side === 'w' ? tx <= 0 : tx >= this.room.w - 1;
      if (edge && d.cells.some((c) => Math.abs(c.tx - tx) <= 1 && Math.abs(c.ty - ty) <= 1)) this.exitRequest = { door: i };
    });
  }

  private updateWisps(dt: number) {
    const s = this.run.stats;
    if (!s.wisps) return;
    this.wispAngle += dt * 3.2;
    const p = this.player;
    for (let i = 0; i < s.wisps; i++) {
      const a = this.wispAngle + (i * Math.PI * 2) / s.wisps;
      const wx = p.x + Math.cos(a) * 20, wy = p.y - 8 + Math.sin(a) * 14;
      for (const pr of this.projectiles) {
        if (pr.team === 'enemy' && !pr.dead && pr.kind !== 'bossSeed' && Math.hypot(pr.x - wx, pr.y - wy) < pr.r + 5) {
          pr.dead = true;
          this.emit({ type: 'impact', x: pr.x, y: pr.y, kind: pr.kind, team: 'enemy' });
        }
      }
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (Math.hypot(e.x - wx, e.y - e.r - wy) < e.r + 5) {
          const last = (e as Enemy & { wispT?: number }).wispT ?? -9;
          if (this.time - last > 0.5) {
            (e as Enemy & { wispT?: number }).wispT = this.time;
            damageEnemy(this, e, 7 * s.dmgMul, { src: 'wisp', x: wx, y: wy, knock: 50, heavy: false, proc: false });
          }
        }
      }
    }
    if (s.synergies.has('storm')) {
      this.stormT -= dt;
      if (this.stormT <= 0) {
        this.stormT = 2;
        const a = this.wispAngle;
        const near = this.enemies.some((e) => !e.dead && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 120);
        if (near) chainLightning(this, p.x + Math.cos(a) * 20, p.y - 8 + Math.sin(a) * 14, 3, 10 * s.dmgMul);
      }
    }
  }

  /** Wisp positions for the view (same formula as the simulation). */
  wispPositions(): { x: number; y: number }[] {
    const n = this.run.stats.wisps, p = this.player, out = [];
    for (let i = 0; i < n; i++) {
      const a = this.wispAngle + (i * Math.PI * 2) / n;
      out.push({ x: p.x + Math.cos(a) * 20, y: p.y - 8 + Math.sin(a) * 14 });
    }
    return out;
  }

  private updateProjectiles(dt: number) {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.t += dt;
      pr.life -= dt;
      if (pr.life <= 0) { pr.dead = true; if (pr.kind === 'lance' || pr.kind === 'bolt') this.emit({ type: 'impact', x: pr.x, y: pr.y, kind: pr.kind, team: pr.team }); continue; }
      if (pr.homing > 0) {
        let tx = 0, ty = 0, best = 140;
        if (pr.team === 'player') {
          for (const e of this.enemies) {
            if (e.dead || e.spawnT > 0 || pr.hit.includes(e.id)) continue;
            const d = Math.hypot(e.x - pr.x, e.y - e.r - pr.y);
            if (d < best) { best = d; tx = e.x; ty = e.y - e.r; }
          }
        } else { tx = p.x; ty = p.y - 6; best = 0; }
        if (best < 140) {
          const cur = Math.atan2(pr.vy, pr.vx), sp = Math.hypot(pr.vx, pr.vy);
          const want = Math.atan2(ty - pr.y, tx - pr.x);
          const na = cur + Math.max(-pr.homing * dt, Math.min(pr.homing * dt, angleDiff(cur, want)));
          pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      // Shots fly over pools and low rims; walls and props stop them. The y-offset accounts for flight height.
      if (this.room.grid.shotBlockedAt(pr.x, pr.y + 6)) {
        pr.dead = true;
        this.emit({ type: 'impact', x: pr.x, y: pr.y, kind: pr.kind, team: pr.team });
        continue;
      }
      if (pr.team === 'player') {
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || pr.hit.includes(e.id)) continue;
          if (Math.hypot(e.x - pr.x, e.y - e.r * 0.8 - pr.y) > e.r + pr.r + 2) continue;
          pr.hit.push(e.id);
          damageEnemy(this, e, pr.dmg, {
            src: pr.kind === 'shard' ? 'shard' : pr.kind === 'lance' && this.run.weapon === 'lantern' ? 'crescent' : 'bolt',
            x: pr.x - pr.vx * 0.05, y: pr.y - pr.vy * 0.05, knock: pr.kind === 'lance' ? 120 : 45, heavy: pr.kind === 'lance', proc: pr.kind !== 'shard',
          });
          if (pr.pierce-- <= 0) { pr.dead = true; this.emit({ type: 'impact', x: pr.x, y: pr.y, kind: pr.kind, team: 'player' }); break; }
        }
      } else if (p.state !== 'dead') {
        if (Math.hypot(p.x - pr.x, p.y - 7 - pr.y) < pr.r + PLAYER.hurtRadius) {
          if (damagePlayer(this, pr.dmg, pr.x - pr.vx, pr.y - pr.vy, 70) || p.dashIframes <= 0) {
            pr.dead = true;
            this.emit({ type: 'impact', x: pr.x, y: pr.y, kind: pr.kind, team: 'enemy' });
          }
        }
      }
    }
  }

  private updateHazards(dt: number) {
    const p = this.player;
    for (const h of this.hazards) {
      if (h.dead) continue;
      h.t += dt;
      if (h.spin) h.ang += h.spin * dt;
      if (h.t < h.delay) continue;
      if (h.t >= h.delay + h.dur) { h.dead = true; continue; }
      if (h.team === 'enemy') {
        if (p.state === 'dead') continue;
        if (this.hazardTouches(h, p.x, p.y, PLAYER.hurtRadius - 1)) {
          const last = h.hitT.get(0);
          if (last === undefined || (h.tick > 0 && h.t - last >= h.tick)) {
            if (damagePlayer(this, h.dmg, h.x, h.y, h.kind === 'slam' ? 160 : 80)) h.hitT.set(0, h.t);
            else if (h.tick === 0) h.hitT.set(0, h.t); // a dodged one-shot hazard is spent for the player
          }
        }
      } else {
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0) continue;
          if (!this.hazardTouches(h, e.x, e.y, e.r)) continue;
          const last = h.hitT.get(e.id);
          if (last === undefined || (h.tick > 0 && h.t - last >= h.tick)) {
            h.hitT.set(e.id, h.t);
            damageEnemy(this, e, h.dmg * this.run.stats.dmgMul, { src: 'fire', x: h.x, y: h.y, knock: 0, heavy: false, proc: false });
            if (h.kind === 'fire') { e.burn = Math.max(e.burn, 1.5); e.burnDps = Math.max(e.burnDps, 4); }
          }
        }
      }
    }
  }

  hazardTouches(h: Hazard, x: number, y: number, r: number): boolean {
    if (h.kind === 'beam') {
      // A line from (x,y) at angle `ang`, length `len`, half-width `r`.
      const c = Math.cos(h.ang), s = Math.sin(h.ang);
      const dx = x - h.x, dy = y - h.y;
      const along = dx * c + dy * s;
      if (along < 0 || along > h.len) return false;
      return Math.abs(-dx * s + dy * c) < h.r + r;
    }
    const d = Math.hypot(x - h.x, y - h.y);
    if (h.kind === 'nova') {
      if (!(d < h.r + r && d > h.r2 - r)) return false;
      // Boss novas may leave a safe opening in the ring.
      return !(h.gapW && Math.abs(angleDiff(h.gap ?? 0, Math.atan2(y - h.y, x - h.x))) < h.gapW);
    }
    return d < h.r + r;
  }

  private updatePickups(dt: number) {
    const p = this.player;
    const magnetR = PLAYER.pickupRadius * this.run.stats.magnetMul;
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.t += dt;
      const dx = p.x - pk.x, dy = p.y - 6 - pk.y, d = Math.hypot(dx, dy);
      if (pk.t > 0.35 && (d < magnetR || pk.magnet) && p.state !== 'dead') pk.magnet = true;
      if (pk.magnet) {
        const sp = 140 + pk.t * 120;
        pk.vx += ((dx / (d || 1)) * sp - pk.vx) * Math.min(1, dt * 10);
        pk.vy += ((dy / (d || 1)) * sp - pk.vy) * Math.min(1, dt * 10);
      } else {
        const f = Math.exp(-4 * dt);
        pk.vx *= f; pk.vy *= f;
      }
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      if (!pk.magnet) this.room.grid.collideCircle(pk, 2);
      if (d < 8 && p.state !== 'dead') {
        pk.dead = true;
        if (pk.kind === 'heart') healPlayer(this, pk.value);
        else { this.gainMotes(pk.value); this.emit({ type: 'mote', x: pk.x, y: pk.y }); }
      }
    }
  }

  /** Total of every live enemy's health (for tests and the debug panel). */
  enemyHp() { return this.enemies.reduce((a, e) => a + (e.dead ? 0 : e.hp), 0); }
}

export { damagePlayer };
