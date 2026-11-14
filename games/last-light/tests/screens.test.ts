import { describe, expect, it } from 'vitest';
import { activeSynergies, buildUpgradeCard, buildUpgradeCards, summarizePicks, synergyHint } from '../src/ui/upgradeCards';
import { UPGRADES, UPGRADE_BY_ID, type UpgradeId } from '../src/sim/upgrades';

describe('upgrade card view-models', () => {
  it('says which synergy a card completes when its partner is owned', () => {
    const h = synergyHint('trail', { brand: 1 });
    expect(h).toMatchObject({ kind: 'completes', id: 'wildfire', name: 'Wildfire' });
  });

  it('names the missing partner when neither half is owned', () => {
    const h = synergyHint('trail', {});
    expect(h).toMatchObject({ kind: 'needs', id: 'wildfire', partner: 'brand', partnerName: UPGRADE_BY_ID.brand.name });
  });

  it('marks a synergy as active when deepening an upgrade whose synergy is already formed', () => {
    expect(synergyHint('arc', { arc: 1, wisp: 1 })).toMatchObject({ kind: 'active', id: 'storm' });
  });

  it('has no synergy line for upgrades outside every synergy', () => {
    expect(synergyHint('kindled', {})).toBeNull();
  });

  it('shows rank progress for a deeper pick and "New" for a first one', () => {
    expect(buildUpgradeCard({ id: 'kindled', rank: 2 }, { kindled: 1 }, 'lantern').rankLabel).toBe('Rank 1 → 2');
    expect(buildUpgradeCard({ id: 'glass', rank: 1 }, {}, 'lantern').rankLabel).toBe('New');
    expect(buildUpgradeCard({ id: 'arc', rank: 1 }, {}, 'lantern').rankLabel).toBe('New · max 2');
  });

  it('splits a downside out of the description into its own trade-off line', () => {
    const c = buildUpgradeCard({ id: 'glass', rank: 1 }, {}, 'lantern');
    expect(c.tradeoff).toBe('2 less maximum health');
    expect(c.desc).not.toMatch(/less maximum health/);
    expect(c.desc).toMatch(/45%/);
    expect(c.rarity).toBe('rare');
  });

  it('describes the rank being taken, for the current weapon', () => {
    const lance = buildUpgradeCard({ id: 'piercing', rank: 2 }, { piercing: 1 }, 'sunlance');
    const lantern = buildUpgradeCard({ id: 'piercing', rank: 1 }, {}, 'lantern');
    expect(lance.desc).toMatch(/two more/);
    expect(lantern.desc).toMatch(/crescent/);
  });

  it('keeps numbers attached to the next word so lines never break between them', () => {
    const c = buildUpgradeCard({ id: 'brand', rank: 1 }, {}, 'lantern');
    expect(c.desc).toContain('3 s');
    expect(c.desc).not.toMatch(/\d /);
  });

  it('builds a card for every upgrade at every rank without throwing, each labelled with its category', () => {
    for (const u of UPGRADES) for (let r = 1; r <= u.maxRank; r++) {
      const [c] = buildUpgradeCards([{ id: u.id, rank: r }], {}, 'lantern');
      expect(c.catLabel.toLowerCase()).toBe(u.cat);
      expect(c.desc.length).toBeGreaterThan(5);
    }
  });
});

describe('taken upgrades summary', () => {
  it('folds repeated picks into one entry with its rank, in first-taken order, capped at max rank', () => {
    const picks: UpgradeId[] = ['kindled', 'brand', 'kindled', 'kindled', 'kindled'];
    const s = summarizePicks(picks);
    expect(s.map((t) => t.id)).toEqual(['kindled', 'brand']);
    expect(s[0].rank).toBe(3);
    expect(s[1].rank).toBe(1);
  });

  it('lists synergies formed by the picks', () => {
    expect(activeSynergies(['brand', 'kindled', 'trail', 'arc']).map((s) => s.id)).toEqual(['wildfire']);
  });
});
