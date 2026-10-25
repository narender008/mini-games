// Run-flow tests on the real sim (headless): node --import ./games/loomwake/dev/stub-missing.mjs games/loomwake/dev/run.test.mjs
// (the stub loader only matters while sibling modules are missing).
// Checks: door checkpoints, reload determinism of doors and offers (no save-scumming),
// live snapshot with an offer on screen, mid-fight restart, death -> hub with meta kept,
// boss -> next region, Sable -> victory -> ending, three profiles, export/import through the api.
import assert from 'node:assert/strict';
import { makeSim, step } from './sim-harness.mjs';
import * as Run from '../src/sim/run.js';
import { memoryStore } from '../src/save/save.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`ok   ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n     ${e && e.stack || e}`); }
}
const doorsOf = (G) => (G.chamber.doors || []).map((d) => ({ i: d.i, reward: d.reward, x: d.x, y: d.y }));
const offerOf = (G) => (G.offer ? G.offer.map((c) => `${c.id}:${c.rarity}`) : null);
// Clear the chamber by the debug path, collect the reward pickup by walking (bot), return the offer.
const settle = (G) => { for (let k = 0; k < 20 && G.scene === 'dialogue'; k++) Run.skip(G); return G.scene; };
function clearAndReward(G) {
  Run.clear(G);
  for (let i = 0; i < 120 * 8 && G.scene === 'run' && !G.run.ch.rewardDone; i++) step(G, 1, true);
}

await test('new game -> hub -> run, door writes a checkpoint', () => {
  const store = memoryStore();
  const G = makeSim(3, store);
  Run.newGame(G, 0, { wipe: true });
  assert.equal(G.scene, 'dialogue', 'the onboarding talk opens');
  assert.equal(settle(G), 'hub');
  Run.startRun(G, { seed: 4242 });
  assert.equal(G.scene, 'run'); assert.equal(G.run.chamber, 0);
  const seq0 = G.lastSave.seq;
  clearAndReward(G);
  if (G.scene === 'boons') Run.choose(G, 0);
  assert.equal(G.scene, 'run'); assert.ok(G.run.ch.rewardDone);
  const r = Run.door(G, 0);
  assert.equal(r.ok, true, r.error); assert.equal(r.saved, true);
  assert.ok(G.lastSave.seq > seq0);
  assert.equal(G.run.chamber, 1);
  const rd = G.saves.load(0);
  assert.equal(rd.run.chamber, 1); assert.equal(rd.run.seed, 4242);
});

await test('reload of a door checkpoint shows the same doors, chamber and offer', () => {
  const store = memoryStore();
  const G = makeSim(3, store);
  Run.newGame(G, 0, { wipe: true });
  Run.startRun(G, { seed: 777 });
  for (let k = 0; k < 3; k++) { clearAndReward(G); if (G.scene === 'boons') Run.choose(G, 0); Run.door(G, 0); }
  const doors = doorsOf(G), cid = G.chamber.id, boons = JSON.stringify(G.run.boons), hp = G.hero.hp;
  clearAndReward(G);
  const offer = offerOf(G), reward = G.run.reward;
  // reload in a fresh game from the same storage
  const H = makeSim(99, store);
  Run.continueRun(H);
  assert.equal(H.scene, 'run');
  assert.equal(H.chamber.id, cid);
  assert.deepEqual(doorsOf(H), doors);
  assert.equal(JSON.stringify(H.run.boons), boons);
  assert.equal(H.hero.hp, hp);
  assert.deepEqual(H.run.reward, reward);
  clearAndReward(H);
  assert.deepEqual(offerOf(H), offer, 'same offer after reload');
});

await test('live snapshot with the offer on screen restores that offer, doors and hp', () => {
  const store = memoryStore();
  const G = makeSim(5, store);
  Run.newGame(G, 1, { wipe: true });
  Run.startRun(G, { seed: 9001 });
  clearAndReward(G);
  if (G.scene !== 'boons') { Run.door(G, 0); clearAndReward(G); }
  assert.equal(G.scene, 'boons');
  const offer = offerOf(G), doors = doorsOf(G), hp = G.hero.hp, cid = G.chamber.id;
  Run.checkpoint(G, 'pagehide');
  const H = makeSim(1, store);
  Run.selectProfile(H, 1);
  assert.equal(H.scene, 'boons'); assert.equal(H.chamber.id, cid);
  assert.deepEqual(offerOf(H), offer); assert.deepEqual(doorsOf(H), doors); assert.equal(H.hero.hp, hp);
  const pick = H.offer[1].id;
  Run.choose(H, 1);
  assert.ok(H.run.boons.some((b) => b.id === pick));
  assert.ok((H.chamber.doors || []).every((d) => d.open));
  // and the same pick in the original gives the same next chamber
  Run.choose(G, 1);
  Run.door(G, 0); Run.door(H, 0);
  assert.equal(H.chamber.id, G.chamber.id); assert.deepEqual(doorsOf(H), doorsOf(G));
});

await test('mid-fight snapshot restarts the chamber with hp = min(entry, now)', () => {
  const store = memoryStore();
  const G = makeSim(5, store);
  Run.newGame(G, 2, { wipe: true });
  Run.startRun(G, { seed: 31337 });
  step(G, 240, false);
  Run.damage(G, 25);
  const hp = G.hero.hp, cid = G.chamber.id;
  Run.checkpoint(G, 'hidden');
  const H = makeSim(1, store);
  Run.selectProfile(H, 2);
  assert.equal(H.chamber.id, cid); assert.equal(H.run.ch.cleared, false); assert.equal(H.hero.hp, hp);
});

await test('reroll after reload gives the same reroll', () => {
  const store = memoryStore();
  const G = makeSim(5, store);
  Run.newGame(G, 0, { wipe: true });
  Run.startRun(G, { seed: 555 });
  G.run.rerolls = 2;
  clearAndReward(G);
  if (G.scene !== 'boons') { Run.door(G, 0); clearAndReward(G); }
  Run.checkpoint(G, 'pagehide');
  Run.reroll(G);
  const a = offerOf(G);
  const H = makeSim(1, store);
  Run.continueRun(H);
  Run.reroll(H);
  assert.deepEqual(offerOf(H), a);
});

await test('death returns to the hub with meta kept and no checkpoint', () => {
  const G = makeSim(5);
  Run.newGame(G, 0, { wipe: true });
  Run.startRun(G, { seed: 1 });
  G.meta.currency.lumen = 77;
  Run.kill(G);
  step(G, 120 * 2, false);
  assert.equal(G.scene, 'dead');
  assert.equal(G.meta.stats.deaths, 1); assert.equal(G.meta.stats.runs, 1);
  assert.ok(G.lastRun && G.lastRun.result === 'death');
  Run.returnToHub(G);
  assert.equal(settle(G), 'hub');
  assert.ok(G.meta.currency.lumen >= 77);
  assert.equal(G.saves.load(0).run, null);
});

await test('boss defeat opens the way to the next region; Sable gives victory then ending', () => {
  const G = makeSim(5);
  Run.newGame(G, 0, { wipe: true });
  Run.boss(G, 'veyl');
  assert.equal(G.run.kind, 'boss');
  step(G, 120 * 2, false);
  for (let k = 0; k < 4 && G.boss; k++) { Run.bossKill(G); step(G, 120 * 4, false); }
  assert.equal(G.boss, null);
  assert.ok(G.meta.stats.bossWins.veyl >= 1);
  for (let i = 0; i < 120 * 6 && !G.run.ch.rewardDone; i++) step(G, 1, true);
  assert.ok(G.run.ch.rewardDone);
  const r = Run.door(G, 0);
  assert.equal(r.ok, true, r.error); assert.equal(G.run.region, 'choir'); assert.equal(G.run.chamber, 0);
  Run.boss(G, 'sable');
  step(G, 120 * 2, false);
  for (let k = 0; k < 5 && G.scene === 'run'; k++) { Run.bossKill(G); step(G, 120 * 4, false); }
  assert.equal(G.scene, 'victory');
  assert.equal(G.meta.stats.wins, 1); assert.equal(G.meta.ending, 'first');
  Run.returnToHub(G); assert.equal(G.scene, 'ending');
  Run.returnToHub(G); assert.equal(settle(G), 'hub');
});

await test('same seed and inputs give the same chamber sequence', () => {
  const seqOf = () => {
    const G = makeSim(5);
    Run.newGame(G, 0, { wipe: true });
    Run.startRun(G, { seed: 2024 });
    const ids = [];
    for (let k = 0; k < 6; k++) { clearAndReward(G); while (G.scene === 'boons') Run.choose(G, 0); ids.push(G.chamber.id + '|' + JSON.stringify(doorsOf(G).map((d) => d.reward))); Run.door(G, k % 2); }
    return ids;
  };
  assert.deepEqual(seqOf(), seqOf());
});

await test('api: profiles independent, export/import', () => {
  const store = memoryStore();
  const G = makeSim(5, store);
  const api = Run.makeApi(G);
  api.newGame(0, { wipe: true }); G.meta.currency.lumen = 10; Run.saveMeta(G);
  api.newGame(1, { wipe: true }); G.meta.currency.lumen = 20; Run.saveMeta(G);
  const rows = api.profiles();
  assert.deepEqual(rows.map((r) => r.lumen), [10, 20, 0]);
  const ex = api.exportSave();
  G.saves.wipe(1);
  Run.reloadProfile(G);
  assert.equal(G.meta.currency.lumen, 0);
  assert.equal(api.importSave(ex).ok, true);
  assert.equal(G.meta.currency.lumen, 20);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
