// The Choked Star, run headless: real simulated fights with a scripted keeper, checking the rules the
// fight promises (phase lock at half health, invulnerable transition, telegraphs before every hit,
// vent windows, safe gaps, the dying sequence) rather than any tuning constant.
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { ROOMS } from '../src/sim/level/rooms';
import { BOSS, forceBossAttack, getBossBrain, installBoss } from '../src/sim/boss';
import { damageEnemy } from '../src/sim/combat';
import { T } from '../src/sim/grid';
import { SIM_DT, TILE } from '../src/config';
import { emptyInput, type Enemy, type Fx, type Hazard, type InputFrame, type Telegraph } from '../src/sim/types';
import { angleDiff } from '../src/core/math';

function setup(seed = 7) {
  const w = new World(seed);
  w.loadRoom(ROOMS.heart, { combat: false });
  const boss = installBoss(w);
  return { w, boss };
}

interface Rec {
  teles: Map<number, { tg: Telegraph; born: number }>;
  acts: { h: Hazard; t: number }[];
  orbs: { x: number; y: number; ang: number; t: number }[];
  fx: { f: Fx; t: number }[];
  modes: { mode: string; attack: string | null; t: number }[];
}

/** Steps the world, recording when telegraphs appear, when hazards first become active and every fx. */
function recorder(w: World): Rec & { step: (inp: InputFrame) => void } {
  const rec: Rec = { teles: new Map(), acts: [], orbs: [], fx: [], modes: [] };
  const seenH = new Set<number>(), seenP = new Set<number>();
  let lastMode = '';
  const step = (inp: InputFrame) => {
    w.tick(inp, SIM_DT);
    for (const tg of w.telegraphs) if (!rec.teles.has(tg.id)) rec.teles.set(tg.id, { tg: { ...tg }, born: w.time });
    for (const h of w.hazards) {
      if (h.team !== 'enemy' || seenH.has(h.id) || h.t < h.delay) continue;
      seenH.add(h.id);
      rec.acts.push({ h: { ...h }, t: w.time });
    }
    for (const pr of w.projectiles) {
      if (pr.kind !== 'bossOrb' || seenP.has(pr.id)) continue;
      seenP.add(pr.id);
      rec.orbs.push({ x: pr.x - pr.vx * SIM_DT, y: pr.y - pr.vy * SIM_DT, ang: Math.atan2(pr.vy, pr.vx), t: w.time });
    }
    for (const f of w.fx) rec.fx.push({ f, t: w.time });
    w.fx.length = 0;
    const b = w.enemies.find((e) => e.kind === 'boss');
    const brain = b && getBossBrain(b);
    if (brain) {
      const key = `${brain.mode}:${brain.attack}`;
      if (key !== lastMode) { lastMode = key; rec.modes.push({ mode: brain.mode, attack: brain.attack, t: w.time }); }
    }
  };
  return Object.assign(rec, { step });
}

/** A keeper who circles the arena at a fixed radius, never attacking. */
function circler(w: World, boss: Enemy) {
  const cx = boss.x, cy = boss.y + 120;
  return (): InputFrame => {
    const p = w.player, inp = emptyInput();
    const a = Math.atan2(p.y - cy, p.x - cx), d = Math.hypot(p.x - cx, p.y - cy);
    const radial = (d - 110) / 40;
    inp.moveX = -Math.sin(a) - Math.cos(a) * radial;
    inp.moveY = Math.cos(a) - Math.sin(a) * radial;
    const m = Math.hypot(inp.moveX, inp.moveY) || 1;
    inp.moveX /= m; inp.moveY /= m;
    inp.aimX = boss.x; inp.aimY = boss.y;
    return inp;
  };
}

const hit = (w: World, e: Enemy, n: number) => damageEnemy(w, e, n, { src: 'bolt', x: e.x, y: e.y + 30, knock: 0, heavy: false, proc: false });

/** Is the damage source at (x, y) [moving at angle `ang` for orbs] announced by this telegraph? */
function announces(tg: Telegraph, x: number, y: number, ang?: number): boolean {
  if (!tg.boss) return false;
  if (ang !== undefined) {
    return tg.kind === 'line' && Math.abs(angleDiff(tg.ang, ang)) < 0.01 && Math.hypot(tg.x + Math.cos(ang) * 22 - x, tg.y + Math.sin(ang) * 22 - y) < 3;
  }
  return Math.hypot(tg.x - x, tg.y - y) < 3;
}

describe('The Choked Star', () => {
  it('runs a whole fight: every hit is telegraphed >= 0.6 s ahead, vents recur, phase 2 summons, and it dies with a sequence', () => {
    const { w, boss } = setup(11);
    w.god = true; // the keeper survives; hazards still land and are recorded
    const rec = recorder(w);
    const move = circler(w, boss);
    let deathAt = -1, removedAt = -1;
    for (let i = 0; i < 240 / SIM_DT; i++) {
      rec.step(move());
      // Steady pressure: 25 damage a second (more during vents through the multiplier).
      if (i % 120 === 0 && !boss.dead) hit(w, boss, 25);
      if (deathAt < 0 && rec.fx.some((r) => r.f.type === 'bossDeath')) deathAt = w.time;
      if (deathAt >= 0 && !w.enemies.includes(boss)) { removedAt = w.time; break; }
    }
    const brain = getBossBrain(boss)!;

    // It died, after exactly one phase change, and lingered for its death sequence before removal.
    expect(rec.fx.filter((r) => r.f.type === 'bossPhase')).toHaveLength(1);
    expect(rec.fx.filter((r) => r.f.type === 'bossDeath')).toHaveLength(1);
    expect(deathAt).toBeGreaterThan(0);
    expect(removedAt - deathAt).toBeGreaterThanOrEqual(2.3);
    expect(removedAt - deathAt).toBeLessThan(3.0);
    // The room only clears (doors open) once the dying sequence is over.
    const clear = rec.fx.find((r) => r.f.type === 'roomClear');
    expect(clear).toBeDefined();
    expect(clear!.t).toBeGreaterThanOrEqual(removedAt - 1e-9);
    expect(w.room.doors.every((d) => d.open)).toBe(true);

    // Variety: at least six different patterns over the fight, both phases.
    const attacks = new Set(brain.history);
    expect(attacks.size).toBeGreaterThanOrEqual(6);
    expect(brain.history.some((a) => ['bloom', 'twin', 'eclipse'].includes(a))).toBe(true);

    // Every hazard that hurts is announced by a boss telegraph at the same place >= 0.6 s before.
    expect(rec.acts.length).toBeGreaterThan(25);
    const tels = [...rec.teles.values()];
    for (const { h, t } of rec.acts) {
      const ok = tels.some(({ tg, born }) => announces(tg, h.x, h.y) && t - born >= 0.6 - 1e-6 && t - born < 4);
      if (!ok) throw new Error(`unannounced ${h.kind} at ${h.x.toFixed(0)},${h.y.toFixed(0)} t=${t.toFixed(2)}`);
    }
    // ...and every orb fires along a spoke shown >= 0.6 s before.
    expect(rec.orbs.length).toBeGreaterThan(20);
    for (const o of rec.orbs) {
      const ok = tels.some(({ tg, born }) => announces(tg, o.x, o.y, o.ang) && o.t - born >= 0.6 - 1e-6 && o.t - born < 2);
      if (!ok) throw new Error(`unannounced orb at t=${o.t.toFixed(2)}`);
    }

    // Vent windows recur, never more than three attacks apart.
    const vents = rec.modes.filter((m) => m.mode === 'vent');
    expect(vents.length).toBeGreaterThanOrEqual(3);
    let since = 0;
    for (const m of rec.modes) {
      if (m.mode === 'attack' && m.attack !== 'summon') since++;
      if (m.mode === 'vent') { expect(since).toBeLessThanOrEqual(3); expect(since).toBeGreaterThanOrEqual(2); since = 0; }
      if (m.mode === 'transition') since = 0;
    }

    // Phase 2 summoned servants, at most twice, and only after the transition.
    const transAt = rec.modes.find((m) => m.mode === 'transition')!.t;
    const summons = rec.modes.filter((m) => m.attack === 'summon');
    expect(summons.length).toBeGreaterThanOrEqual(1);
    expect(summons.length).toBeLessThanOrEqual(2);
    expect(summons.every((s) => s.t > transAt)).toBe(true);
    const spawned = rec.fx.filter((r) => r.f.type === 'spawn' && r.f.kind !== 'boss');
    expect(spawned.length).toBeLessThanOrEqual(6);
    // Its servants fall with it.
    expect(w.enemies.filter((e) => !e.dead)).toHaveLength(0);
  });

  it('locks at half health, ignores damage through a 2.5 s transition, then raises the phase-2 arena', () => {
    const { w, boss } = setup(3);
    const rec = recorder(w);
    w.god = true;
    for (let i = 0; i < 3 / SIM_DT; i++) rec.step(emptyInput());
    // Bring it to just above half, then one more hit that would take it well below.
    while (boss.hp > boss.maxHp * 0.5 + 30) hit(w, boss, 30);
    hit(w, boss, 200);
    rec.step(emptyInput());
    const brain = getBossBrain(boss)!;
    expect(brain.mode).toBe('transition');
    expect(boss.hp).toBe(boss.maxHp * 0.5);
    expect(rec.fx.some((r) => r.f.type === 'bossPhase' && r.f.phase === 2)).toBe(true);
    const start = w.time;
    let dealt = 0;
    while (brain.mode === 'transition') {
      rec.step(emptyInput());
      if (brain.mode === 'transition') dealt += hit(w, boss, 40);
      if (w.time - start > 5) break;
    }
    expect(dealt).toBe(0);
    expect(boss.hp).toBe(boss.maxHp * 0.5);
    expect(w.time - start).toBeGreaterThan(BOSS.transition * 0.9);
    expect(w.time - start).toBeLessThan(BOSS.transition * 1.4);
    expect(brain.phase).toBe(2);
    // Arena change: thorn walls block movement now, pools linger, both were telegraphed.
    expect(brain.walls.length).toBeGreaterThan(0);
    for (const t of brain.walls) expect(w.grid.get(t.tx, t.ty)).toBe(T.LOW);
    expect(w.hazards.filter((h) => h.kind === 'pool').length).toBe(2);
    const tags = [...rec.teles.values()].map((r) => r.tg.tag);
    expect(tags).toContain('wall');
    expect(tags).toContain('pool');
    // And damage works again.
    expect(hit(w, boss, 10)).toBeGreaterThan(0);
  });

  it('takes 1.5x damage only while venting', () => {
    const { w, boss } = setup(5);
    w.god = true;
    const rec = recorder(w);
    let normal = 0, vent = 0;
    for (let i = 0; i < 90 / SIM_DT && !vent; i++) {
      rec.step(emptyInput());
      const brain = getBossBrain(boss)!;
      if (!normal && brain.mode === 'idle') normal = hit(w, boss, 10);
      if (brain.mode === 'vent' && brain.t > 0.2) vent = hit(w, boss, 10);
    }
    expect(normal).toBeCloseTo(10, 5);
    expect(vent).toBeCloseTo(15, 5);
    expect(rec.fx.some((r) => r.f.type === 'enemyCue' && r.f.cue === 'bossVent')).toBe(true);
  });

  it('leaves a real safe opening in every nova ring', () => {
    const run = (side: 'gap' | 'opposite') => {
      const { w, boss } = setup(21);
      const rec = recorder(w);
      for (let i = 0; i < 2.5 / SIM_DT; i++) rec.step(emptyInput());
      forceBossAttack(w, boss, 'nova');
      rec.step(emptyInput());
      const tg = w.telegraphs.find((t) => t.tag === 'nova')!;
      expect(tg).toBeDefined();
      const ang = side === 'gap' ? tg.ang : tg.ang + Math.PI;
      // Stand still on open floor somewhere along that direction.
      let placed = false;
      for (let d = 80; d < 220 && !placed; d += 6) {
        const x = tg.x + Math.cos(ang) * d, y = tg.y + Math.sin(ang) * d;
        if (w.isOpenSpot(x, y, 8)) { w.player.x = w.player.px = x; w.player.y = w.player.py = y; placed = true; }
      }
      expect(placed).toBe(true);
      for (let i = 0; i < 4 / SIM_DT; i++) rec.step(emptyInput());
      return rec.fx.filter((r) => r.f.type === 'hurt').length;
    };
    expect(run('gap')).toBe(0);
    expect(run('opposite')).toBe(1);
  });

  it('is deterministic for a seed', () => {
    const play = (seed: number) => {
      const { w, boss } = setup(seed);
      w.god = true;
      const rec = recorder(w);
      const move = circler(w, boss);
      for (let i = 0; i < 40 / SIM_DT; i++) { rec.step(move()); if (i % 90 === 0) hit(w, boss, 20); }
      return { hist: getBossBrain(boss)!.history.join(','), hp: boss.hp, acts: rec.acts.map((a) => `${a.h.kind}@${a.h.x.toFixed(2)},${a.h.y.toFixed(2)}`).join(';') };
    };
    const a = play(99), b = play(99), c = play(100);
    expect(a).toEqual(b);
    expect(a.hist.split(',').length).toBeGreaterThan(5);
    expect(c.acts).not.toEqual(a.acts);
  });

  it('charges along its lane and never pins the keeper inside its body', () => {
    const { w, boss } = setup(8);
    const rec = recorder(w);
    w.god = true;
    for (let i = 0; i < 2.5 / SIM_DT; i++) rec.step(emptyInput());
    const home = { x: boss.x, y: boss.y };
    // Keeper straight below, far enough for a charge.
    w.player.x = w.player.px = home.x; w.player.y = w.player.py = home.y + 12 * TILE;
    forceBossAttack(w, boss, 'charge');
    let maxDist = 0, minGap = Infinity;
    for (let i = 0; i < 8 / SIM_DT; i++) {
      // Walk into the boss the whole time.
      const inp = emptyInput();
      const dx = boss.x - w.player.x, dy = boss.y - w.player.y, d = Math.hypot(dx, dy) || 1;
      inp.moveX = dx / d; inp.moveY = dy / d;
      rec.step(inp);
      maxDist = Math.max(maxDist, Math.hypot(boss.x - home.x, boss.y - home.y));
      if (getBossBrain(boss)!.mode !== 'attack') { minGap = Math.min(minGap, Math.hypot(boss.x - w.player.x, boss.y - w.player.y)); }
    }
    expect(rec.teles.size).toBeGreaterThan(0);
    expect([...rec.teles.values()].some((r) => r.tg.kind === 'lane' && r.tg.tag === 'charge')).toBe(true);
    expect(maxDist).toBeGreaterThan(60); // it really moved
    expect(Math.hypot(boss.x - home.x, boss.y - home.y)).toBeLessThan(3); // and crawled home
    expect(minGap).toBeGreaterThanOrEqual(boss.r + w.player.r - 0.5);
    // The charge's hit lands only after its lane was shown.
    const tels = [...rec.teles.values()];
    for (const { h, t } of rec.acts) expect(tels.some(({ tg, born }) => announces(tg, h.x, h.y) && t - born >= 0.6)).toBe(true);
  });
});

