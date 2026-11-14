// Balance and progression check: the headless bot (helpers/bot.ts) plays whole runs, without god mode, on
// the real simulation and the real run plan, and must free the Choked Star within a game-time budget.
// The bot dodges with frame-perfect reactions; runs with a human-like reaction delay are played too and
// written to the report (test/out/bot-report.json) for the record, but do not gate.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { playRun, summary, type BotResult } from './helpers/bot';

const OUT = fileURLToPath(new URL('../test/out/', import.meta.url));
const BUDGET_S = 900; // 15 minutes of game time for the whole arc
const results: BotResult[] = [];

afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(OUT + 'bot-report.json', JSON.stringify(results, null, 1));
  console.log(results.map(summary).join('\n'));
});

describe('bot plays the whole arc (no god mode)', () => {
  const runs: [number, 'lantern' | 'sunlance'][] = [[1, 'lantern'], [2, 'lantern'], [3, 'lantern'], [4, 'lantern'], [5, 'sunlance'], [6, 'sunlance']];
  for (const [seed, weapon] of runs) {
    it(`seed ${seed} with the ${weapon}: reaches the boss and frees it within ${BUDGET_S} s`, () => {
      const r = playRun({ seed, weapon, maxSeconds: BUDGET_S });
      results.push(r);
      // Every node of the arc was visited in order, and the run ended in the boss room with a win.
      expect(r.nodes.map((n) => n.node)).toEqual([...Array(14).keys()]);
      expect(r.outcome, summary(r)).toBe('won');
      expect(r.nodeKind).toBe('boss');
      expect(r.bossHp).toBe(0);
      expect(r.time).toBeLessThan(BUDGET_S);
      // Progression happened: levels, upgrades and four reward rooms on the way.
      expect(r.level).toBeGreaterThanOrEqual(8);
      // Every level owed a card was taken (a level gained in the last fight may still be pending).
      expect(r.picks.length).toBeGreaterThanOrEqual(r.level - 1 - r.pendingLevels);
      expect(r.pendingLevels).toBeLessThanOrEqual(1);
      expect(r.nodes.filter((n) => n.kind === 'reward' && n.reward)).toHaveLength(4);
    }, 60000);
  }

  it('same seed, same bot: the same run', () => {
    const a = playRun({ seed: 11, maxSeconds: 200 }), b = playRun({ seed: 11, maxSeconds: 200 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 60000);

  it('(report only) more lantern seeds, frame-perfect', () => {
    for (const seed of [6, 7, 8, 9, 10]) {
      const r = playRun({ seed, maxSeconds: BUDGET_S });
      results.push(r);
      expect(['won', 'died', 'timeout']).toContain(r.outcome); // never stuck on the map
    }
  }, 120000);

  it('(report only) with a 150 ms reaction delay', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = playRun({ seed, reaction: 0.15, maxSeconds: BUDGET_S });
      results.push(r);
      expect(['won', 'died', 'timeout']).toContain(r.outcome); // never stuck on the map
    }
  }, 120000);
});
