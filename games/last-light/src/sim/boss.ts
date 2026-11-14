// The final boss, "The Choked Star": a fallen star caged in thorny roots inside a broken stone ring.
// installBoss(world) fills the world's boss hooks (updateBoss, bossDamageMul) and spawns it.
//
// Shape of the fight (all timings in sim seconds, all randomness from world.rng):
//   intro 1.6 s -> idle gap -> attack -> idle gap -> attack ... -> VENT (core exposed, x1.5 damage)
//   after every 2-3 attacks. At 50% health it locks at exactly half, is invulnerable for a 2.5 s
//   transition ('bossPhase' fx, root walls and corrupted pools erupt, both telegraphed) and enters
//   phase 2: shorter gaps, combined patterns, and summons of existing enemies (at most twice).
//   At 0 hp it plays a 2.6 s dying sequence ('bossDeath' fx, slow-mo) before the world removes it.
//
// Fairness rules: every damaging thing is a hazard or projectile that lands exactly at the end of a
// boss telegraph (tele.boss = true) created at least 0.8 s before (0.9-1.1 s for the big ones), at the
// same origin; novas leave a safe opening and can be dashed; beams are stopped by pillars; starfall
// and roots never cover the whole floor. Contact with the body never hurts (the keeper is pushed out).
import { TILE } from '../config';
import { angleDiff } from '../core/math';
import type { Enemy } from './types';
import type { World } from './world';
import { T } from './grid';
import { killEnemy } from './combat';
import { setDoorOpen } from './level/rooms';

export type BossAttack = 'orbs' | 'beam' | 'roots' | 'starfall' | 'nova' | 'charge' | 'twin' | 'bloom' | 'eclipse' | 'summon';
export type BossMode = 'intro' | 'idle' | 'attack' | 'vent' | 'transition' | 'dying';

/** Seconds of each part of the fight, exported for the view and tests. */
export const BOSS = {
  name: 'The Choked Star',
  intro: 1.6,
  transition: 2.5,
  vent: [3.0, 2.4] as const, // per phase
  gap: [[1.0, 1.4], [0.55, 0.85]] as const, // idle time between attacks, per phase
  coreLift: 34, // the core floats this far above the boss's feet
};

interface Sched { at: number; fn: () => void }

export interface BossBrain {
  phase: 1 | 2;
  mode: BossMode;
  attack: BossAttack | null;
  /** Clock time until which the current attack is still winding up (telegraph filling). */
  windupUntil: number;
  clock: number; // boss-local sim seconds
  t: number; // seconds in the current mode
  next: number; // idle seconds left before acting
  sinceVent: number; // attacks since the last vent
  ventAfter: number; // vent after this many attacks
  ventCount: number;
  summons: number;
  forceSummon: boolean;
  last: BossAttack | null;
  history: BossAttack[];
  homeX: number; homeY: number;
  ax: number; ay: number; // anchor: where the boss holds still
  events: Sched[];
  curAt: number | null;
  teles: Set<number>;
  novas: Map<number, { speed: number; r0: number; thick: number }>;
  beams: Set<number>;
  charge: { ang: number; dist: number; sx: number; sy: number; hz: number; left: number; lastX: number; lastY: number; st: number } | null;
  returning: boolean;
  walls: { tx: number; ty: number }[]; // root-wall tiles (phase 2), raised once wallsUp
  wallsUp: boolean;
  pools: { x: number; y: number; r: number }[];
  burst: boolean;
}

const brains = new WeakMap<Enemy, BossBrain>();
/** The boss's brain, for the view, the debug panel and tests. */
export const getBossBrain = (e: Enemy): BossBrain | undefined => brains.get(e);

/** Where shots, beams and novas start: the ground point under the core. */
const origin = (e: Enemy) => ({ x: e.x, y: e.y - 8 });

// ---- install -------------------------------------------------------------------------------------

/** Sets the boss hooks on the world and spawns the boss (default: centre-top of the room). */
export function installBoss(w: World, at?: { x: number; y: number }): Enemy {
  w.updateBoss = (e, dt) => updateBoss(w, e, dt);
  w.bossDamageMul = (e) => {
    const b = brains.get(e);
    if (!b) return 1;
    if (b.mode === 'transition') return 0;
    if (b.mode === 'vent') return 1.5;
    return 1;
  };
  const x = at?.x ?? (w.room.w * TILE) / 2;
  const y = at?.y ?? 9.5 * TILE;
  const e = w.spawnEnemy('boss', x, y);
  e.spawnT = 0.6;
  e.face = Math.PI / 2;
  e.aux2 = 1;
  e.state = 'intro';
  brains.set(e, {
    phase: 1, mode: 'intro', attack: null, windupUntil: 0, clock: 0, t: 0, next: 0, sinceVent: 0, ventAfter: 3, ventCount: 0,
    summons: 0, forceSummon: false, last: null, history: [], homeX: x, homeY: y, ax: x, ay: y, events: [], curAt: null,
    teles: new Set(), novas: new Map(), beams: new Set(), charge: null, returning: false, walls: [], wallsUp: false, pools: [], burst: false,
  });
  // The arena seals until the star falls.
  w.waves = [];
  w.waveIndex = 0;
  w.roomState = 'combat';
  for (const d of w.room.doors) setDoorOpen(w.room, d, false);
  w.cue(e, 'bossRoar');
  return e;
}

/** Debug and tests: start a pattern right now (ignored unless the boss is idle or attacking). */
export function forceBossAttack(w: World, e: Enemy, a: BossAttack) {
  const b = brains.get(e);
  if (!b || e.dead || b.mode === 'transition' || b.mode === 'dying') return;
  b.events = [];
  b.charge = null; b.returning = false;
  e.x = b.ax; e.y = b.ay;
  clearTeles(w, b);
  startAttack(w, e, b, a);
}

// ---- scheduling helpers --------------------------------------------------------------------------

/** Run `fn` `delay` seconds after now (or after the event that is scheduling it, for exact chains). */
function at(b: BossBrain, delay: number, fn: () => void) {
  b.events.push({ at: (b.curAt ?? b.clock) + delay, fn });
}

function runEvents(b: BossBrain) {
  for (;;) {
    let best = -1;
    for (let i = 0; i < b.events.length; i++) if (b.events[i].at <= b.clock && (best < 0 || b.events[i].at < b.events[best].at)) best = i;
    if (best < 0) break;
    const ev = b.events.splice(best, 1)[0];
    b.curAt = ev.at;
    ev.fn();
    b.curAt = null;
  }
}

type TeleArgs = { kind: 'circle' | 'ring' | 'lane' | 'cone' | 'line'; x: number; y: number; r: number; ang?: number; len?: number; dur: number; tag: string };
function tele(w: World, b: BossBrain, a: TeleArgs): number {
  const id = w.addTelegraph({ kind: a.kind, x: a.x, y: a.y, r: a.r, ang: a.ang ?? 0, len: a.len ?? 0, dur: a.dur, boss: true, tag: a.tag });
  b.teles.add(id);
  return id;
}
function untele(w: World, b: BossBrain, id: number) { w.removeTelegraph(id); b.teles.delete(id); }
function clearTeles(w: World, b: BossBrain) { for (const id of b.teles) w.removeTelegraph(id); b.teles.clear(); }

const aimAt = (w: World, x: number, y: number) => Math.atan2(w.player.y - y, w.player.x - x);
const ph = (b: BossBrain) => b.phase - 1;

// ---- the update ----------------------------------------------------------------------------------

function updateBoss(w: World, e: Enemy, dt: number) {
  const b = brains.get(e);
  if (!b) return;
  b.clock += dt;
  b.t += dt;
  e.aux2 = b.phase;
  if (e.dead) { dying(w, e, b, dt); return; }

  // Lock at half health and change phase.
  if (b.phase === 1 && b.mode !== 'transition' && e.hp <= e.maxHp * 0.5) { startTransition(w, e, b); }

  runEvents(b);
  if (e.dead) return;
  growHazards(w, b);

  // Movement: the star holds its anchor unless charging or returning home.
  if (b.charge) updateCharge(w, e, b, dt);
  else if (b.returning) {
    const dx = b.homeX - e.x, dy = b.homeY - e.y, d = Math.hypot(dx, dy);
    if (d < 2) {
      e.x = b.ax = b.homeX; e.y = b.ay = b.homeY; e.vx = e.vy = 0;
      b.returning = false;
      endAttack(w, e, b);
    } else { e.vx = (dx / d) * 110; e.vy = (dy / d) * 110; b.ax = e.x; b.ay = e.y; }
  } else {
    e.x = b.ax; e.y = b.ay; e.vx = e.vy = 0;
  }
  e.kx = e.ky = 0;
  pushPlayerOut(w, e, dt);
  if (w.player.state !== 'dead' && b.mode !== 'dying') {
    const want = aimAt(w, e.x, e.y);
    e.face += Math.max(-3 * dt, Math.min(3 * dt, angleDiff(e.face, want)));
  }

  switch (b.mode) {
    case 'intro':
      if (b.t >= BOSS.intro) toIdle(e, b, 0.4);
      break;
    case 'idle':
      if (w.player.state === 'dead') break;
      b.next -= dt;
      if (b.next <= 0) {
        if (b.sinceVent >= b.ventAfter) startVent(w, e, b);
        else startAttack(w, e, b, chooseAttack(w, e, b));
      }
      break;
    case 'vent':
      if (b.t >= BOSS.vent[ph(b)]) {
        b.sinceVent = 0;
        b.ventAfter = w.rng.int(2, 3);
        w.cue(e, 'bossVentEnd');
        toIdle(e, b, 0.5);
      }
      break;
    case 'transition':
      if (b.t >= BOSS.transition) {
        b.phase = 2;
        e.aux2 = 2;
        b.forceSummon = true;
        b.sinceVent = 0;
        b.ventAfter = 2;
        toIdle(e, b, 0.3);
      }
      break;
    default: break;
  }
}

function toIdle(e: Enemy, b: BossBrain, next: number) {
  b.mode = 'idle'; b.attack = null; b.t = 0; b.next = next;
  e.state = 'idle'; e.st = 0;
}

/** The body is solid: the keeper slides around it instead of being hurt or shoving it. */
function pushPlayerOut(w: World, e: Enemy, dt: number) {
  const p = w.player;
  if (p.state === 'dead') return;
  // Use where the body will be after this step's move, so a charge shoulders the keeper aside
  // instead of being stopped by them (the world's separation would otherwise push the boss back).
  const ex = e.x + e.vx * dt, ey = e.y + e.vy * dt;
  const dx = p.x - ex, dy = p.y - ey, d = Math.hypot(dx, dy), rr = e.r + p.r + 0.5;
  if (d >= rr) return;
  let nx = d > 1e-3 ? dx / d : 0, ny = d > 1e-3 ? dy / d : 1;
  const sp = Math.hypot(e.vx, e.vy);
  if (sp > 1) {
    // Sideways out of a charge: whichever side the keeper is already on.
    const fx = e.vx / sp, fy = e.vy / sp, side = -fy * dx + fx * dy >= 0 ? 1 : -1;
    nx = -fy * side; ny = fx * side;
    const along = dx * fx + dy * fy;
    p.x = ex + fx * along + nx * rr; p.y = ey + fy * along + ny * rr;
  } else { p.x = ex + nx * rr; p.y = ey + ny * rr; }
  w.grid.collideCircle(p, p.r);
}

/** Novas widen and beams stop at pillars and walls. */
function growHazards(w: World, b: BossBrain) {
  if (!b.novas.size && !b.beams.size) return;
  for (const h of w.hazards) {
    const n = b.novas.get(h.id);
    if (n) { h.r2 = n.r0 + n.speed * Math.max(0, h.t - h.delay); h.r = h.r2 + n.thick; }
    if (b.beams.has(h.id)) h.len = w.grid.rayLength(h.x, h.y, h.ang, 340);
  }
  for (const id of b.novas.keys()) if (!w.hazards.some((h) => h.id === id && !h.dead)) b.novas.delete(id);
  for (const id of b.beams) if (!w.hazards.some((h) => h.id === id && !h.dead)) b.beams.delete(id);
}

// ---- choosing ------------------------------------------------------------------------------------

function chooseAttack(w: World, e: Enemy, b: BossBrain): BossAttack {
  const adds = w.enemies.filter((o) => !o.dead && o.kind !== 'boss').length + w.pendingSpawns.length;
  if (b.phase === 2 && b.summons < 2 && adds === 0 && (b.forceSummon || (b.summons === 1 && e.hp < e.maxHp * 0.25))) {
    b.forceSummon = false;
    return 'summon';
  }
  const p = w.player;
  const pd = Math.hypot(p.x - e.x, p.y - e.y);
  const lane = w.grid.rayLength(e.x, e.y, aimAt(w, e.x, e.y), 300, true);
  const canCharge = pd > 70 && lane > 110;
  const pool: [BossAttack, number][] = b.phase === 1
    ? [['orbs', 1], ['beam', 1], ['roots', 1], ['starfall', 1], ['nova', 1], ['charge', canCharge ? 0.8 : 0]]
    : [['bloom', 1], ['twin', adds ? 0.5 : 1], ['starfall', 0.9], ['nova', 0.8], ['charge', canCharge && !adds ? 0.8 : 0], ['eclipse', adds ? 0.4 : 1]];
  // Never the same pattern twice in a row, and favour what has not been seen recently.
  const recent = b.history.slice(-3);
  const opts = pool.map(([a, wgt]) => [a, a === b.last ? 0 : wgt * (recent.includes(a) ? 0.5 : 1)] as [BossAttack, number]);
  if (opts.every(([, wgt]) => wgt <= 0)) return b.phase === 1 ? 'orbs' : 'bloom';
  return w.rng.weighted(opts, ([, wgt]) => wgt)[0];
}

function startAttack(w: World, e: Enemy, b: BossBrain, a: BossAttack) {
  b.mode = 'attack'; b.attack = a; b.t = 0; b.last = a;
  b.history.push(a);
  if (a !== 'summon') b.sinceVent++;
  e.state = a; e.st = 0;
  const p1 = b.phase === 1;
  let end = 0;
  switch (a) {
    case 'orbs': end = orbs(w, e, b, 0, p1 ? 2 : 3, p1 ? 10 : 12, p1 ? 88 : 104); break;
    case 'beam': end = beam(w, e, b, 0, false, p1 ? 1.0 : 1.15, p1 ? 1.5 : 1.25); break;
    case 'roots': end = roots(w, e, b, 0, p1 ? 3 : 5, p1 ? 0.38 : 0.3); break;
    case 'starfall': end = starfall(w, e, b, 0, p1 ? 6 : 9, null); break;
    case 'nova': end = nova(w, e, b, 0, p1 ? 1 : 2, p1 ? 0.45 : 0.36, p1 ? 118 : 132); break;
    case 'charge': charge(w, e, b, 0, p1 ? 1 : 2); return; // ends when it is home again
    case 'twin': end = beam(w, e, b, 0, true, 1.1, 1.5); break;
    case 'bloom': {
      const e1 = orbs(w, e, b, 0, 2, 12, 100);
      const e2 = roots(w, e, b, 0.5, 4, 0.32);
      end = Math.max(e1, e2);
      break;
    }
    case 'eclipse': {
      // A sweeping beam toward you while stars land outside its arc: step out sideways, not back.
      const S = 0.95;
      const aim = aimAt(w, origin(e).x, origin(e).y);
      const e1 = beam(w, e, b, 0, false, S, 1.3, aim);
      const e2 = starfall(w, e, b, 0.2, 5, { ang: aim, half: S + 0.2 });
      end = Math.max(e1, e2);
      break;
    }
    case 'summon': end = summon(w, e, b); break;
  }
  at(b, end + 0.35, () => endAttack(w, e, b));
}

function endAttack(w: World, e: Enemy, b: BossBrain) {
  if (b.mode !== 'attack') return;
  const g = BOSS.gap[ph(b)];
  const adds = w.enemies.some((o) => !o.dead && o.kind !== 'boss');
  toIdle(e, b, w.rng.range(g[0], g[1]) + (adds ? 0.5 : 0));
}

// ---- patterns (each returns the time its last damage lands, relative to now) ---------------------

/** Rings of orbs. Each ring shows its spokes 0.8 s before it fires; rings rotate between waves. */
function orbs(w: World, e: Enemy, b: BossBrain, start: number, waves: number, n: number, speed: number): number {
  const D = 0.8, gapT = 0.6;
  const base = w.rng.next() * Math.PI * 2;
  for (let i = 0; i < waves; i++) {
    const off = base + (i % 2) * (Math.PI / n);
    at(b, start + i * gapT, () => {
      const o = origin(e);
      if (i === 0) b.windupUntil = b.clock + D;
      const ids: number[] = [];
      for (let k = 0; k < n; k++) ids.push(tele(w, b, { kind: 'line', x: o.x, y: o.y, r: 3, ang: off + (k / n) * Math.PI * 2, len: 70, dur: D, tag: 'orb' }));
      w.cue(e, 'bossVolleyCharge');
      at(b, D, () => {
        for (const id of ids) untele(w, b, id);
        for (let k = 0; k < n; k++) {
          const a = off + (k / n) * Math.PI * 2;
          w.spawnProjectile({ x: o.x + Math.cos(a) * 22, y: o.y + Math.sin(a) * 22, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4, team: 'enemy', dmg: 1, life: 6, pierce: 0, kind: 'bossOrb', homing: 0 });
        }
        w.emit({ type: 'shot', x: o.x, y: o.y, ang: off, team: 'enemy', kind: 'bossOrb' });
        w.cue(e, 'bossVolley');
      });
    });
  }
  return start + (waves - 1) * gapT + D;
}

/** A beam that sweeps across the arc shown by its cone. Twin: a second beam on the opposite side. */
function beam(w: World, e: Enemy, b: BossBrain, start: number, twin: boolean, D: number, sweepT: number, aimFixed?: number): number {
  const S = twin ? 1.15 : 1.0;
  at(b, start, () => {
    const o = origin(e);
    const aim = aimFixed ?? aimAt(w, o.x, o.y);
    const dir = w.rng.chance(0.5) ? 1 : -1;
    b.windupUntil = b.clock + D;
    const parts = twin ? [0, Math.PI] : [0];
    const ids: number[] = [];
    for (const off of parts) {
      const a = aim + off;
      ids.push(tele(w, b, { kind: 'cone', x: o.x, y: o.y, r: 300, ang: a, len: S, dur: D, tag: 'beam' }));
      ids.push(tele(w, b, { kind: 'line', x: o.x, y: o.y, r: 5, ang: a - dir * S, len: 300, dur: D, tag: 'beam' }));
    }
    w.cue(e, 'bossBeamCharge');
    at(b, D, () => {
      for (const id of ids) untele(w, b, id);
      for (const off of parts) {
        const a0 = aim + off - dir * S;
        const id = w.addHazard({ kind: 'beam', team: 'enemy', x: o.x, y: o.y, r: 6, ang: a0, len: w.grid.rayLength(o.x, o.y, a0, 340), t: 0, dur: sweepT, delay: 0, dmg: 1, tick: 0, spin: (dir * 2 * S) / sweepT });
        b.beams.add(id);
      }
      w.cue(e, 'bossBeam');
      w.shake(1.5, sweepT);
    });
  });
  return start + D + sweepT;
}

/** Thorned roots burst up where you stand (leading you a little), one after another. */
function roots(w: World, e: Enemy, b: BossBrain, start: number, k: number, interval: number): number {
  const D = 0.9, R = 20;
  for (let i = 0; i < k; i++) {
    at(b, start + i * interval, () => {
      const p = w.player;
      let x = p.x + p.vx * 0.3, y = p.y + p.vy * 0.3;
      if (!w.isOpenSpot(x, y, 4)) { x = p.x; y = p.y; }
      if (i === 0 && start === 0) b.windupUntil = b.clock + D;
      const id = tele(w, b, { kind: 'circle', x, y, r: R, dur: D, tag: 'root' });
      w.cue(e, 'bossRootWindup');
      at(b, D, () => {
        untele(w, b, id);
        w.addHazard({ kind: 'root', team: 'enemy', x, y, r: R, t: 0, dur: 0.45, delay: 0, dmg: 1, tick: 0 });
        w.emit({ type: 'slam', x, y, r: R });
        w.shake(1.5, 0.15);
      });
    });
  }
  return start + (k - 1) * interval + D;
}

/** Stars fall on marked circles: one on you, the rest scattered around (never overlapping). */
function starfall(w: World, e: Enemy, b: BossBrain, start: number, n: number, avoid: { ang: number; half: number } | null): number {
  const D = 1.1, R = 24;
  at(b, start, () => {
    const p = w.player, o = origin(e);
    const pts: { x: number; y: number }[] = [];
    const outside = (x: number, y: number) => !avoid || Math.abs(angleDiff(avoid.ang, Math.atan2(y - o.y, x - o.x))) > avoid.half;
    if (!avoid) pts.push({ x: p.x, y: p.y });
    for (let tries = 0; tries < 400 && pts.length < n; tries++) {
      const a = w.rng.next() * Math.PI * 2, d = 40 + w.rng.next() * 220;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.8;
      if (!w.isOpenSpot(x, y, 8) || !outside(x, y)) continue;
      if (Math.hypot(x - e.x, y - e.y) < e.r + R) continue;
      if (pts.some((q) => Math.hypot(q.x - x, q.y - y) < R * 2 + 8)) continue;
      pts.push({ x, y });
    }
    if (start === 0) b.windupUntil = b.clock + D;
    w.cue(e, 'bossStarfall');
    pts.forEach((pt, i) => {
      at(b, i * 0.12, () => {
        const id = tele(w, b, { kind: 'circle', x: pt.x, y: pt.y, r: R, dur: D, tag: 'star' });
        at(b, D, () => {
          untele(w, b, id);
          w.addHazard({ kind: 'star', team: 'enemy', x: pt.x, y: pt.y, r: R, t: 0, dur: 0.15, delay: 0, dmg: 1, tick: 0 });
          w.emit({ type: 'slam', x: pt.x, y: pt.y, r: R });
          w.shake(2, 0.15);
        });
      });
    });
  });
  return start + (n - 1) * 0.12 + D;
}

/** Expanding rings of corrupted light with one safe opening each (marked by the telegraph's angle). */
function nova(w: World, e: Enemy, b: BossBrain, start: number, count: number, gapW: number, speed: number): number {
  const D = 1.0, R0 = 24, thick = 12;
  const dur = (380 - R0) / speed;
  for (let i = 0; i < count; i++) {
    at(b, start + i * 1.1, () => {
      const o = origin(e);
      const gap = w.rng.next() * Math.PI * 2;
      if (i === 0) b.windupUntil = b.clock + D;
      const id = tele(w, b, { kind: 'ring', x: o.x, y: o.y, r: 44, ang: gap, len: gapW, dur: D, tag: 'nova' });
      w.cue(e, 'bossNovaCharge');
      at(b, D, () => {
        untele(w, b, id);
        const hz = w.addHazard({ kind: 'nova', team: 'enemy', x: o.x, y: o.y, r: R0 + thick, r2: R0, t: 0, dur, delay: 0, dmg: 1, tick: 0, gap, gapW });
        b.novas.set(hz, { speed, r0: R0, thick });
        w.cue(e, 'bossNova');
        w.shake(3, 0.25);
      });
    });
  }
  return start + (count - 1) * 1.1 + D + 1.2;
}

/** Rips free of its roots and rams along the marked lane, then crawls home. */
function charge(w: World, e: Enemy, b: BossBrain, start: number, times: number) {
  const D = 1.0;
  at(b, start, () => {
    const ang = aimAt(w, e.x, e.y);
    const room = w.grid.rayLength(e.x, e.y, ang, 300, true);
    const dist = Math.max(0, Math.min(260, room - e.r - 3));
    if (dist < 50) { b.returning = true; return; }
    b.windupUntil = b.clock + D;
    const id = tele(w, b, { kind: 'lane', x: e.x, y: e.y, r: e.r * 2 + 6, ang, len: dist + e.r, dur: D, tag: 'charge' });
    w.cue(e, 'chargeWindup');
    at(b, D, () => {
      untele(w, b, id);
      const hz = w.addHazard({ kind: 'wave', team: 'enemy', x: e.x, y: e.y, r: e.r + 3, t: 0, dur: 3, delay: 0, dmg: 2, tick: 0 });
      b.charge = { ang, dist, sx: e.x, sy: e.y, hz, left: times - 1, lastX: e.x, lastY: e.y, st: 0 };
      w.cue(e, 'bossCharge');
    });
  });
}

function updateCharge(w: World, e: Enemy, b: BossBrain, dt: number) {
  const c = b.charge!;
  c.st += dt;
  const moved = Math.hypot(e.x - c.lastX, e.y - c.lastY);
  c.lastX = e.x; c.lastY = e.y;
  const travelled = Math.hypot(e.x - c.sx, e.y - c.sy);
  const h = w.hazards.find((q) => q.id === c.hz);
  if (h) { h.x = e.x; h.y = e.y; }
  const stuck = c.st > 0.12 && moved < 300 * dt * 0.3;
  if (travelled >= c.dist || stuck || c.st > 1.6) {
    e.vx = e.vy = 0;
    b.ax = e.x; b.ay = e.y;
    if (h) h.dead = true;
    w.emit({ type: 'wallBonk', x: e.x + Math.cos(c.ang) * e.r, y: e.y + Math.sin(c.ang) * e.r });
    w.emit({ type: 'slam', x: e.x, y: e.y, r: 34 });
    w.shake(4, 0.3);
    const left = c.left;
    b.charge = null;
    at(b, 0.8, () => {
      if (left > 0) charge(w, e, b, 0, left);
      else b.returning = true;
    });
    return;
  }
  e.vx = Math.cos(c.ang) * 300;
  e.vy = Math.sin(c.ang) * 300;
}

/** Phase 2 only: calls a few of the Choked Star's servants through spawn runes. */
function summon(w: World, e: Enemy, b: BossBrain): number {
  b.summons++;
  b.windupUntil = b.clock + 1.0;
  w.cue(e, 'bossRoar');
  at(b, 0.4, () => {
    w.queueSpawn('stalker');
    w.queueSpawn('stalker');
    w.queueSpawn('sentinel');
  });
  return 1.4;
}

// ---- vent, transition, death ---------------------------------------------------------------------

function startVent(w: World, e: Enemy, b: BossBrain) {
  b.mode = 'vent'; b.attack = null; b.t = 0; b.ventCount++;
  e.state = 'vent'; e.st = 0;
  w.cue(e, 'bossVent');
  w.emit({ type: 'text', x: e.x, y: e.y + 16, text: 'The core is exposed!', tone: 'good' });
}

function startTransition(w: World, e: Enemy, b: BossBrain) {
  e.hp = e.maxHp * 0.5;
  b.mode = 'transition'; b.attack = null; b.t = 0; b.charge = null; b.returning = false;
  e.state = 'transition'; e.st = 0;
  e.burn = 0;
  // Everything in flight fizzles; the star rises back to its place.
  b.events = [];
  clearTeles(w, b);
  for (const pr of w.projectiles) if (pr.team === 'enemy' && pr.kind === 'bossOrb') pr.dead = true;
  for (const h of w.hazards) if (h.team === 'enemy' && (b.novas.has(h.id) || b.beams.has(h.id) || h.kind === 'wave')) h.dead = true;
  b.novas.clear(); b.beams.clear();
  e.x = b.ax = b.homeX; e.y = b.ay = b.homeY;
  w.emit({ type: 'bossPhase', phase: 2 });
  w.cue(e, 'bossRoar');
  w.shake(5, 0.8);
  w.slowMo(0.35, 0.4);
  planArena(w, b);
}

/** Phase 2 arena: thorn walls rise between the pillars and two corrupted pools well up (both marked). */
function planArena(w: World, b: BossBrain) {
  const g = w.grid;
  const cx = Math.floor(w.room.w / 2), cy = Math.round(w.room.h * 0.47);
  const clusters = [[[-9, -1], [-8, -1]], [[7, -1], [8, -1]], [[-5, 5], [-4, 5]], [[3, 5], [4, 5]]];
  const walls: { tx: number; ty: number }[][] = [];
  for (const cl of clusters) {
    const tiles = cl.map(([dx, dy]) => ({ tx: cx + dx, ty: cy + dy }));
    if (tiles.every((t) => g.get(t.tx, t.ty) === T.FLOOR)) walls.push(tiles);
  }
  const pools = [{ x: (cx - 14 + 0.5) * TILE, y: (cy + 1 + 0.5) * TILE, r: 26 }, { x: (cx + 14 + 0.5) * TILE, y: (cy + 1 + 0.5) * TILE, r: 26 }]
    .filter((p) => g.walkableAt(p.x, p.y));
  at(b, 0.4, () => {
    const D = 1.5;
    const ids: number[] = [];
    for (const tiles of walls) {
      const x = ((tiles[0].tx + tiles[tiles.length - 1].tx + 1) / 2) * TILE, y = (tiles[0].ty + 0.5) * TILE;
      ids.push(tele(w, b, { kind: 'circle', x, y, r: 20, dur: D, tag: 'wall' }));
    }
    for (const p of pools) ids.push(tele(w, b, { kind: 'circle', x: p.x, y: p.y, r: p.r, dur: D, tag: 'pool' }));
    at(b, D, () => {
      for (const id of ids) untele(w, b, id);
      const p = w.player;
      for (const tiles of walls) {
        const x = ((tiles[0].tx + tiles[tiles.length - 1].tx + 1) / 2) * TILE, y = (tiles[0].ty + 0.5) * TILE;
        w.addHazard({ kind: 'root', team: 'enemy', x, y, r: 20, t: 0, dur: 0.4, delay: 0, dmg: 1, tick: 0 });
        w.emit({ type: 'slam', x, y, r: 20 });
        // Never seal the keeper inside a wall: a wall under them stays down.
        if (tiles.some((t) => Math.abs((t.tx + 0.5) * TILE - p.x) < TILE * 0.5 + p.r + 1 && Math.abs((t.ty + 0.5) * TILE - p.y) < TILE * 0.5 + p.r + 1)) continue;
        for (const t of tiles) { g.set(t.tx, t.ty, T.LOW); b.walls.push(t); }
      }
      g.flowTarget = -1;
      b.wallsUp = true;
      for (const pl of pools) {
        w.addHazard({ kind: 'pool', team: 'enemy', x: pl.x, y: pl.y, r: pl.r, t: 0, dur: 9999, delay: 0, dmg: 1, tick: 1.0 });
        b.pools.push(pl);
      }
      w.shake(4, 0.4);
    });
  });
}

function dying(w: World, e: Enemy, b: BossBrain, _dt: number) {
  e.vx = e.vy = 0;
  if (b.mode !== 'dying') {
    b.mode = 'dying'; b.attack = null; b.t = 0; b.charge = null; b.returning = false;
    e.state = 'dying';
    b.events = [];
    clearTeles(w, b);
    for (const t of w.telegraphs) t.dead = true;
    for (const pr of w.projectiles) if (pr.team === 'enemy') pr.dead = true;
    for (const h of w.hazards) if (h.team === 'enemy') h.dead = true;
    w.pendingSpawns.forEach((s) => w.removeTelegraph(s.tele));
    w.pendingSpawns = [];
    for (const o of w.enemies) if (o !== e && !o.dead && o.kind !== 'dummy') killEnemy(w, o);
    // The thorn walls wither with it.
    for (const t of b.walls) w.grid.set(t.tx, t.ty, T.FLOOR);
    w.grid.flowTarget = -1;
    w.emit({ type: 'bossDeath', x: e.x, y: e.y });
    w.slowMo(1.4, 0.35);
    w.shake(5, 1.2);
    return;
  }
  if (!b.burst && e.deathT >= 2.2) {
    b.burst = true;
    b.wallsUp = false;
    b.walls = [];
    w.cue(e, 'bossBurst');
    w.shake(8, 0.6);
    for (let i = 0; i < 40; i++) w.spawnMote(e.x, e.y - BOSS.coreLift, 1);
    w.spawnMote(e.x, e.y - 10, 3, 'heart');
  }
}
