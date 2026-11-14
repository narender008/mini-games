// The run plan (arc of rooms, waves, door offers) and the world step are deterministic for a seed; every
// room the arc can produce is valid; waves grow with depth; and the last choice before the boss is fair.
import { describe, expect, it } from 'vitest';
import { RunPlan, REWARD_INFO, type Reward } from '../src/sim/run';
import { validate } from '../src/sim/level/gen';
import { parseRoom } from '../src/sim/level/rooms';
import { ENEMY_DEFS } from '../src/sim/enemies';
import { World } from '../src/sim/world';
import { SIM_DT, TILE } from '../src/config';
import { emptyInput, type InputFrame } from '../src/sim/types';
import { enterNode, stateHash } from './helpers/harness';

const REWARDS: Reward[] = ['shrine', 'heal', 'cache', 'trial'];

/** Everything a plan produces, as plain data. */
function snapshot(seed: number) {
  const p = new RunPlan(seed);
  const out: unknown[] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind === 'reward') for (const r of REWARDS) { const d = p.room(i, r); out.push([i, r, d.map, d.waves]); }
    else { const d = p.room(i); out.push([i, n.kind, n.name, d.map, d.waves, n.choice ? p.rollOffers(i) : null]); }
  });
  return out;
}

describe('RunPlan', () => {
  it('follows the arc: sanctum, 8 combat rooms over three areas, 4 reward rooms after choice rooms, the boss', () => {
    const p = new RunPlan(5);
    expect(p.length).toBe(14);
    expect(p.nodes.map((n) => n.kind[0]).join('')).toBe('sccrccrccrccrb');
    expect(p.nodes.filter((n) => n.kind === 'combat').map((n) => n.zone)).toEqual(['causeway', 'causeway', 'causeway', 'aqueduct', 'aqueduct', 'aqueduct', 'foundry', 'foundry']);
    // Every reward room follows a choice room and vice versa.
    p.nodes.forEach((n, i) => expect(n.kind === 'reward').toBe(i > 0 && p.nodes[i - 1].choice));
  });

  it('is deterministic: the same seed gives the same names, rooms, waves and offers', () => {
    for (const seed of [1, 77, 123456]) expect(snapshot(seed)).toEqual(snapshot(seed));
  });

  it('differs between seeds', () => {
    const a = snapshot(1), b = snapshot(2);
    expect(a).not.toEqual(b);
    // Generated combat rooms (all but the hand-made first) differ in layout.
    const pa = new RunPlan(1), pb = new RunPlan(2);
    let differ = 0;
    for (let i = 2; i < 13; i++) if (pa.nodes[i].kind === 'combat' && pa.room(i).map.join('') !== pb.room(i).map.join('')) differ++;
    expect(differ).toBeGreaterThanOrEqual(6);
  });

  it('every node of 40 seeds builds a room that parses and validates, with the doors it needs', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = new RunPlan(seed * 7919);
      p.nodes.forEach((n, i) => {
        for (const r of n.kind === 'reward' ? REWARDS : [undefined]) {
          const def = p.room(i, r);
          const room = parseRoom(def);
          const where = `seed ${seed} node ${i} ${r ?? n.kind}`;
          // validate() is the generator's check (north gate doors); the boss arena's door is in the south.
          if (n.kind !== 'boss') expect(validate(def), where).toBe(true);
          // Every door can be walked up to from the spawn (the door cells open to floor once cleared).
          const reach = room.grid.reachable(Math.floor(room.spawn.x / TILE), Math.floor(room.spawn.y / TILE));
          for (const d of room.doors) {
            const near = d.cells.flatMap((c) => [[c.tx + 1, c.ty], [c.tx - 1, c.ty], [c.tx, c.ty + 1], [c.tx, c.ty - 1]])
              .filter(([x, y]) => x >= 0 && y >= 0 && x < room.w && y < room.h && room.ch(x, y) !== 'D');
            expect(near.some(([x, y]) => reach[y * room.w + x]), `${where} door ${d.side}`).toBe(true);
          }
          expect(room.grid.blocksMove(Math.floor(room.spawn.x / TILE), Math.floor(room.spawn.y / TILE)), where).toBe(false);
          if (n.kind === 'combat') {
            expect(room.doors.length, where).toBe(n.choice ? 2 : 1);
            expect(def.waves.length, where).toBeGreaterThanOrEqual(2);
            for (const wv of def.waves) expect(wv.kinds.length, where).toBeGreaterThan(0);
          }
          if (n.kind === 'reward') {
            expect(room.doors.length, where).toBe(1);
            expect(room.props.filter((pr) => pr.kind === REWARD_INFO[r!].prop), where).toHaveLength(1);
            expect(def.waves.length > 0, where).toBe(r === 'trial');
          }
        }
      });
    }
  });

  it('wave strength grows with depth', () => {
    const hp = (seed: number) => {
      const p = new RunPlan(seed);
      return p.nodes.flatMap((n, i) => (n.kind === 'combat' ? [p.room(i).waves.reduce((a, w) => a + w.kinds.reduce((b, k) => b + ENEMY_DEFS[k].hp, 0), 0)] : []));
    };
    const runs = Array.from({ length: 40 }, (_, s) => hp(s + 1));
    const mean = runs[0].map((_, j) => runs.reduce((a, r) => a + r[j], 0) / runs.length);
    for (let j = 1; j < mean.length; j++) expect(mean[j], `combat room ${j}`).toBeGreaterThan(mean[j - 1]);
    // In every single run the last room is far tougher than the first, and each area tougher than the last.
    for (const r of runs) {
      expect(r[7]).toBeGreaterThan(r[0] * 3);
      const area = [r.slice(0, 3), r.slice(3, 6), r.slice(6)].map((a) => a.reduce((x, y) => x + y, 0) / a.length);
      expect(area[1]).toBeGreaterThan(area[0]);
      expect(area[2]).toBeGreaterThan(area[1]);
    }
    // Elites appear only deeper in.
    const p = new RunPlan(3);
    const elites = p.nodes.flatMap((n, i) => (n.kind === 'combat' ? [p.room(i).waves.reduce((a, w) => a + (w.elite ?? 0), 0)] : []));
    expect(elites[0]).toBe(0);
    expect(elites[7]).toBeGreaterThan(0);
  });

  it('offers two different rewards on choice doors, and heal + upgrade right before the boss', () => {
    const seen = new Set<Reward>();
    for (let seed = 1; seed <= 100; seed++) {
      const p = new RunPlan(seed);
      p.nodes.forEach((n, i) => {
        if (!n.choice) return;
        const o = p.rollOffers(i);
        expect(o).toHaveLength(2);
        expect(o[0]).not.toBe(o[1]);
        o.forEach((r) => seen.add(r));
        if (p.nodes[i + 2]?.kind === 'boss') expect(o.sort()).toEqual(['heal', 'shrine']);
      });
      expect(p.nodes[p.length - 3].choice).toBe(true);
    }
    expect([...seen].sort()).toEqual([...REWARDS].sort());
  });
});

describe('World determinism', () => {
  /** Scripted input: walk in a slow figure of eight, attack every 0.4 s, dash every 1.3 s. */
  const script = (k: number, w: World): InputFrame => {
    const t = k * SIM_DT;
    return {
      ...emptyInput(),
      moveX: Math.sin(t * 1.3), moveY: Math.sin(t * 2.6) * 0.7,
      aimX: w.player.x + Math.cos(t) * 50, aimY: w.player.y + Math.sin(t) * 50,
      attack: Math.floor(t / 0.4) % 2 === 0, attackPressed: k % 48 === 0, dashPressed: k % 156 === 0,
    };
  };
  const play = (seed: number, node: number, seconds: number) => {
    const plan = new RunPlan(seed);
    const w = new World(seed);
    enterNode(w, plan, node);
    const hashes: string[] = [];
    for (let k = 0; k < seconds / SIM_DT; k++) {
      w.tick(script(k, w), SIM_DT);
      w.fx.length = 0;
      if (w.run.choice) w.choose(0);
      if (k % 240 === 0) hashes.push(stateHash(w));
    }
    return { w, hashes, final: stateHash(w) };
  };

  it('the same seed and the same inputs give the same state, step for step', () => {
    const a = play(4242, 4, 30), b = play(4242, 4, 30);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.final).toBe(b.final);
    // Something really happened: foes spawned, fought and were hit.
    expect(a.w.run.damageDealt).toBeGreaterThan(0);
    expect(a.w.waveIndex).toBeGreaterThan(0);
  });

  it('a different seed diverges', () => {
    expect(play(4242, 4, 10).final).not.toBe(play(4243, 4, 10).final);
  });

  it('the boss fight is deterministic too', () => {
    expect(play(9, 13, 20).hashes).toEqual(play(9, 13, 20).hashes);
  });
});
