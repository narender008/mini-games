// Run-flow tests on the real sim (headless): node --import ./games/loomwake/dev/stub-missing.mjs games/loomwake/dev/run.test.mjs
// (the stub loader only matters while sibling modules are missing).
// Checks: door checkpoints, reload determinism of doors and offers (no save-scumming),
// live snapshot with an offer on screen, mid-fight restart, death -> hub with meta kept,
// boss -> next region, Sable -> victory -> ending, three profiles, export/import through the api.
import assert from 'node:assert/strict';
import { makeSim, step as rawStep } from './sim-harness.mjs';
import * as Run from '../src/sim/run.js';
import { memoryStore } from '../src/save/save.js';
import * as Combat from '../src/sim/combat.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`ok   ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n     ${e && e.stack || e}`); }
}
const doorsOf = (G) => (G.chamber.doors || []).map((d) => ({ i: d.i, reward: d.reward, x: d.x, y: d.y }));
const offerOf = (G) => (G.offer ? G.offer.map((c) => `${c.id}:${c.rarity}`) : null);
// Clear the chamber by the debug path, collect the reward pickup by walking (bot), return the offer.
const settle = (G) => { for (let k = 0; k < 20 && G.scene === 'dialogue'; k++) Run.skip(G); return G.scene; };
// story conversations (region cards, boss intros) open as dialogue: these tests skip them as a player would
const step = (G, n = 1, bot = true) => { for (let i = 0; i < n; i++) { settle(G); rawStep(G, 1, bot); } settle(G); };
function clearAndReward(G) {
  settle(G);
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
  Run.boss(G, 'veyl'); settle(G);
  assert.equal(G.run.kind, 'boss');
  step(G, 120 * 2, false);
  for (let k = 0; k < 4 && G.boss; k++) { Run.bossKill(G); step(G, 120 * 4, false); }
  assert.equal(G.boss, null);
  assert.ok(G.meta.stats.bossWins.veyl >= 1);
  for (let i = 0; i < 120 * 6 && !G.run.ch.rewardDone; i++) step(G, 1, true);
  assert.ok(G.run.ch.rewardDone);
  const r = Run.door(G, 0);
  assert.equal(r.ok, true, r.error); assert.equal(G.run.region, 'choir'); assert.equal(G.run.chamber, 0);
  Run.boss(G, 'sable'); settle(G);
  const lines = []; G.bus.on('line', (p) => lines.push(p.lineId));
  step(G, 120 * 2, false);
  for (let k = 0; k < 5 && G.scene === 'run'; k++) { Run.bossKill(G); step(G, 120 * 4, false); }
  assert.equal(G.scene, 'victory');
  assert.ok(lines.some((id) => /^sableboss_defeat/.test(id)), `Sable's defeat lines were told before victory (${lines.join(', ')})`);
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

await test('fountain chamber: the region wanderer stands by it and can be talked to; hub NPCs are not carried into runs', () => {
  const G = makeSim(5);
  Run.newGame(G, 0, { wipe: true }); settle(G);
  assert.ok((G.npcs || []).length > 0, 'hub has NPCs');
  Run.startRun(G, { seed: 77 }); settle(G);
  assert.equal(G.npcs.length, 0);
  G.run.plan[G.run.region][G.run.chamber] = 'fountain';
  Run.enterChamber(G); settle(G);
  assert.equal(G.run.kind, 'fountain');
  const w = G.npcs.find((n) => n.id === 'hob');
  assert.ok(w, 'Hob waits by the glasswood fountain');
  const r = Run.talk(G, 'hob');
  assert.equal(r.ok, true); assert.equal(G.scene, 'dialogue');
  assert.ok(G.meta.affinity.hob >= 1);
  settle(G); assert.equal(G.scene, 'run');
});

await test('gift: story counts it once', () => {
  const G = makeSim(5);
  Run.newGame(G, 0, { wipe: true }); settle(G);
  G.meta.currency.shards = 2;
  Run.gift(G, 'orrin'); settle(G);
  assert.equal(G.meta.gifts.orrin, 1);
  assert.equal(G.meta.currency.shards, 1);
});

await test('Sable true-ending choice opens as a dialogue and the braid answer sets the true ending', () => {
  const G = makeSim(5);
  Run.newGame(G, 0, { wipe: true }); settle(G);
  Run.boss(G, 'sable'); settle(G);
  G.bus.emit('bossChoice', { id: 'sable', options: ['braid', 'cut'] });
  assert.equal(G.scene, 'dialogue');
  for (let k = 0; k < 12 && G.dialogue && G.dialogue.queue.length; k++) Run.advance(G);
  const i = G.dialogue.choices.findIndex((c) => (c.choice || c.id) === 'braid');
  assert.ok(i >= 0, 'braid is offered');
  Run.answer(G, i);
  assert.equal(G.meta.ending, 'true');
  assert.equal(G.meta.flags.endingChoice, 'braid');
  assert.notEqual(G.scene, 'dialogue');
});

await test('hub talk never shows a bare "..."; the fountain panel names its wanderer; the first wave waits for the region card', () => {
  const G = makeSim(5);
  Run.newGame(G, 0, { wipe: true }); settle(G);
  for (const npc of ['orrin', 'thimbleby', 'pell', 'weaver', 'orrin', 'thimbleby']) {
    Run.talk(G, npc);
    const texts = [G.dialogue && G.dialogue.text, ...((G.dialogue && G.dialogue.queue) || []).map((l) => l.text)];
    assert.ok(texts.every((t) => t && t.replace(/[.\s…]/g, '')), `${npc} said ${JSON.stringify(texts)}`);
    settle(G);
  }
  const flushes = []; G.bus.on('flushBarks', (p) => flushes.push(p.why));
  Run.startRun(G, { seed: 77 }); settle(G);
  assert.ok(flushes.includes('region') && flushes.includes('chamber'));
  assert.ok(G.run.ch.waveT >= 2.5, 'the first wave of a region is held for the title card');
  G.run.plan[G.run.region][G.run.chamber] = 'fountain';
  Run.enterChamber(G); settle(G);
  Run.useFountain(G);
  assert.equal(G.run.ch.fountain.npc, 'hob');
});

await test('a Memory Thread plays every line of every panel, each with its speaker', async () => {
  const { MEMORIES } = await import('../src/content/memories.js');
  const G = makeSim(5);
  Run.newGame(G, 0, { wipe: true }); settle(G);
  const m = MEMORIES.find((x) => x.panels.some((p) => p.lines.length > 1));
  G.meta.memories.push(m.id);
  Run.playMemory(G, m.id);
  const want = m.panels.flatMap((p) => p.lines.map((l) => l.text));
  const got = [G.dialogue.text];
  for (let k = 0; k < 80 && G.dialogue && G.dialogue.queue.length; k++) { Run.advance(G); got.push(G.dialogue.text); }
  assert.deepEqual(got, want);
  assert.equal(G.dialogue.panel, m.panels.length - 1);
});

await test('true ending: Sable kneels to the choice, braid is answered, his lines come before victory', () => {
  const G = makeSim(5);
  Run.newGame(G, 0, { wipe: true }); settle(G);
  Run.boss(G, 'sable'); settle(G);
  G.run.trueEnding = true;
  const lines = []; G.bus.on('line', (p) => lines.push(p.lineId));
  const live = (n) => { for (let i = 0; i < n && G.scene === 'run'; i++) { G.hero.hp = G.hero.maxHp; rawStep(G, 1, false); } };
  live(240);
  for (let k = 0; k < 60 && G.scene !== 'victory'; k++) {
    if (G.scene === 'dialogue') {
      const d = G.dialogue;
      if (d.choices && !d.queue.length) Run.answer(G, d.choices.findIndex((c) => (c.choice || c.id) === 'braid'));
      else Run.advance(G);
      continue;
    }
    const b = G.boss;
    if (b && b.state !== 'defeated' && !b.dying && b.state !== 'choice' && b.state !== 'braided') {
      if (b.phase < b.phases) Run.bossKill(G);
      else { b.armor = 0; b.hp = Math.max(30, b.maxHp * 0.06); Combat.damageFoe(G, b, 20, { kind: 'debug', pierce: true }); }
    }
    live(480);
  }
  assert.equal(G.scene, 'victory');
  assert.equal(G.meta.ending, 'true'); assert.equal(G.meta.flags.endingChoice, 'braid');
  assert.ok(lines.includes('sableboss_defeat_true'), 'the choice conversation was told');
  assert.ok(!lines.some((id) => /^sableboss_defeat_(first|again)/.test(id)), 'no second defeat speech after the braid');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
