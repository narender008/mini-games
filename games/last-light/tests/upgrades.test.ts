// Upgrades: how ranks turn into Stats (caps included), the four synergies, and the seeded card roll.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  SYNERGIES, UPGRADES, UPGRADE_BY_ID, baseStats, computeStats, rollChoices, synergyCompletedBy, xpToNext,
  type Ranks, type UpgradeId,
} from '../src/sim/upgrades';

const maxed = (except: UpgradeId[] = []): Ranks =>
  Object.fromEntries(UPGRADES.filter((u) => !except.includes(u.id)).map((u) => [u.id, u.maxRank])) as Ranks;

describe('computeStats', () => {
  it('with no upgrades is exactly the base stats and forms no synergy', () => {
    const s = computeStats({});
    const b = baseStats();
    expect({ ...s, synergies: [...s.synergies] }).toEqual({ ...b, synergies: [] });
  });

  it('stacks ranks of an upgrade and stops at its max rank', () => {
    expect(computeStats({ kindled: 1 }).dmgMul).toBeCloseTo(1.2);
    expect(computeStats({ kindled: 2 }).dmgMul).toBeCloseTo(1.4);
    expect(computeStats({ kindled: 3 }).dmgMul).toBeCloseTo(1.6);
    // A save or a bug that pushed the rank past the cap must not give more than the max rank.
    expect(computeStats({ kindled: 9 }).dmgMul).toBeCloseTo(1.6);
    expect(computeStats({ phase: 2 }).dashCharges).toBe(3);
    expect(computeStats({ phase: 7 }).dashCharges).toBe(3);
    expect(computeStats({ heartwood: 3 }).maxHpBonus).toBe(6);
    expect(computeStats({ heartwood: 4 }).maxHpBonus).toBe(6);
  });

  it('combines upgrades that touch the same stat', () => {
    const s = computeStats({ kindled: 2, glass: 1, heartwood: 1 });
    expect(s.dmgMul).toBeCloseTo(1.4 * 1.45);
    expect(s.maxHpBonus).toBe(0); // +2 heartwood, -2 glass
    const f = computeStats({ fleet: 2, quickened: 3 });
    expect(f.moveMul).toBeCloseTo(1.2);
    expect(f.dashCdMul).toBeCloseTo(0.7);
    expect(f.atkSpeed).toBeCloseTo(1.45);
  });

  it('rank 2 of a tiered upgrade replaces rank 1 rather than adding to it', () => {
    expect(computeStats({ brand: 1 }).burnFrac).toBeCloseTo(0.3);
    expect(computeStats({ brand: 2 }).burnFrac).toBeCloseTo(0.5);
    const a1 = computeStats({ arc: 1 }), a2 = computeStats({ arc: 2 });
    expect([a1.chainEvery, a1.chainTargets]).toEqual([5, 3]);
    expect([a2.chainEvery, a2.chainTargets]).toEqual([3, 4]);
    expect(a2.chainDmg).toBeGreaterThan(a1.chainDmg);
  });

  it('treats rank 0 and negative ranks as not owned', () => {
    const s = computeStats({ kindled: 0, glass: -1, brand: 0, trail: 0 });
    expect(s.dmgMul).toBe(1);
    expect(s.maxHpBonus).toBe(0);
    expect(s.synergies.size).toBe(0);
  });

  for (const syn of SYNERGIES) {
    it(`forms ${syn.name} only when both ${syn.needs[0]} and ${syn.needs[1]} are owned`, () => {
      const [a, b] = syn.needs;
      expect(computeStats({ [a]: 1 }).synergies.has(syn.id)).toBe(false);
      expect(computeStats({ [b]: 1 }).synergies.has(syn.id)).toBe(false);
      const both = computeStats({ [a]: 1, [b]: 1 });
      expect([...both.synergies]).toEqual([syn.id]);
      // Owning everything forms all four at once.
      expect(computeStats(maxed()).synergies.has(syn.id)).toBe(true);
    });
  }

  it('every synergy is made of two real, different upgrades', () => {
    for (const syn of SYNERGIES) {
      expect(UPGRADE_BY_ID[syn.needs[0]]).toBeDefined();
      expect(UPGRADE_BY_ID[syn.needs[1]]).toBeDefined();
      expect(syn.needs[0]).not.toBe(syn.needs[1]);
    }
  });
});

describe('synergyCompletedBy', () => {
  it('names the synergy an upgrade would complete, only when the partner is owned and it is not', () => {
    expect(synergyCompletedBy('trail', { brand: 1 })?.id).toBe('wildfire');
    expect(synergyCompletedBy('brand', { trail: 1 })?.id).toBe('wildfire');
    expect(synergyCompletedBy('trail', {})).toBeNull();
    expect(synergyCompletedBy('trail', { brand: 1, trail: 1 })).toBeNull(); // already formed
    expect(synergyCompletedBy('kindled', { brand: 1, trail: 1, arc: 1 })).toBeNull(); // in no synergy
  });
});

describe('rollChoices', () => {
  it('offers three distinct upgrades, each one rank above what is owned', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const ranks: Ranks = { kindled: 2, phase: 1 };
      const c = rollChoices(new Rng(seed), ranks);
      expect(c).toHaveLength(3);
      expect(new Set(c.map((x) => x.id)).size).toBe(3);
      for (const x of c) expect(x.rank).toBe((ranks[x.id] ?? 0) + 1);
    }
  });

  it('never offers an upgrade at its max rank', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = new Rng(seed);
      // A random partial build with some upgrades maxed.
      const ranks: Ranks = {};
      for (const u of UPGRADES) { const k = r.int(0, u.maxRank); if (k) ranks[u.id] = k; }
      for (const c of rollChoices(r, ranks, 3, seed % 2 === 0)) {
        expect(ranks[c.id] ?? 0, `${c.id} offered at seed ${seed}`).toBeLessThan(UPGRADE_BY_ID[c.id].maxRank);
      }
    }
  });

  it('offers only what is left when fewer than three remain, and nothing when all are maxed', () => {
    const c = rollChoices(new Rng(3), maxed(['wisp', 'hoard']));
    expect(c.map((x) => x.id).sort()).toEqual(['hoard', 'wisp']);
    expect(rollChoices(new Rng(3), maxed())).toEqual([]);
    expect(rollChoices(new Rng(3), maxed(), 3, true)).toEqual([]);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const ranks: Ranks = { brand: 1 };
    const a = rollChoices(new Rng(99), ranks, 3, true);
    const b = rollChoices(new Rng(99), ranks, 3, true);
    expect(a).toEqual(b);
    const seen = new Set<string>();
    for (let s = 1; s <= 40; s++) seen.add(rollChoices(new Rng(s), ranks).map((x) => x.id).join(','));
    expect(seen.size).toBeGreaterThan(20);
  });

  it('shrine rolls (guaranteeRare) always hold a rare or a synergy-completing card when one exists', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const c = rollChoices(new Rng(seed), {}, 3, true);
      expect(c.some((x) => UPGRADE_BY_ID[x.id].rare), `seed ${seed}`).toBe(true);
    }
    // With every rare maxed, a synergy-completing card is the special one.
    const ranks: Ranks = { glass: 1, emberheart: 1, afterglow: 1, brand: 1 };
    for (let seed = 1; seed <= 100; seed++) {
      const c = rollChoices(new Rng(seed), ranks, 3, true);
      expect(c.some((x) => x.synergy !== null), `seed ${seed}`).toBe(true);
    }
  });

  it('marks a card that would complete a synergy, and favours it', () => {
    let offered = 0, marked = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const c of rollChoices(new Rng(seed), { brand: 1 })) {
        if (c.id === 'trail') { offered++; if (c.synergy === 'wildfire') marked++; }
        else expect(c.synergy).toBeNull(); // brand's only partner is trail
      }
    }
    expect(marked).toBe(offered);
    // Weighted 2.5x: trail should show up clearly more often than an average common upgrade (3/18 per roll).
    let plain = 0;
    for (let seed = 1; seed <= 400; seed++) if (rollChoices(new Rng(seed), {}).some((c) => c.id === 'trail')) plain++;
    expect(offered).toBeGreaterThan(plain * 1.4);
  });
});

describe('xpToNext', () => {
  it('grows with level so each level costs more motes than the last', () => {
    for (let l = 0; l < 30; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    expect(xpToNext(0)).toBeGreaterThan(0);
  });
});
