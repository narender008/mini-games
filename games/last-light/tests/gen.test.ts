import { describe, it, expect } from 'vitest';
import { generateRoom, validate } from '../src/sim/level/gen';
import { parseRoom } from '../src/sim/level/rooms';

describe('room generator', () => {
  for (const zone of ['causeway', 'aqueduct', 'foundry'] as const) {
    it(`${zone}: 60 seeds all produce connected rooms with the requested doors`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const doors = seed % 2 ? 1 : 2;
        const def = generateRoom(seed * 1013, { zone, doors, name: 'x', id: `t${seed}` });
        expect(validate(def)).toBe(true);
        const room = parseRoom(def);
        expect(room.doors.length).toBe(doors);
        // The spawn is on open floor, inside the room.
        expect(room.grid.blocksMove(Math.floor(room.spawn.x / 16), Math.floor(room.spawn.y / 16))).toBe(false);
      }
    });
  }
  it('is deterministic for a seed', () => {
    const a = generateRoom(42, { zone: 'aqueduct', doors: 2, name: 'x', id: 'a' });
    const b = generateRoom(42, { zone: 'aqueduct', doors: 2, name: 'x', id: 'a' });
    expect(a.map).toEqual(b.map);
    const c = generateRoom(43, { zone: 'aqueduct', doors: 2, name: 'x', id: 'a' });
    expect(c.map).not.toEqual(a.map);
  });
  it('reward rooms hold their reward prop and one door', () => {
    const def = generateRoom(7, { zone: 'causeway', doors: 1, reward: 'U', name: 'x', id: 'r' });
    const room = parseRoom(def);
    expect(room.props.filter((p) => p.kind === 'U').length).toBe(1);
    expect(room.doors.length).toBe(1);
  });
});
