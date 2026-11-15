// Run flow against the built game: an upgrade after levelling (picked with key 1), death -> defeat screen
// -> restart without a reload, victory through the isolated debug path (?debug&boss), plus the combat and
// boss screenshots.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, open, close, hook, until, player, shot, playing } = require('./lib/browser.cjs');

let env;
test.before(async () => { env = await setup(); });
test.after(async () => { await env.done(); });

test('levelling opens the upgrade choice; key 1 takes the first card and it applies', async () => {
  const page = await open(env.browser, env.base, 'debug&play&seed=3');
  const lt = await hook(page);
  await until(async () => playing(await lt('state')), 60000);
  await lt('freeze');
  // One level's worth of light (16 motes), gathered the way pickups give it.
  await page.evaluate(() => window.__lt.world().gainMotes(16));
  await until(async () => (await lt('state')).screen === 'upgrade', 5000, 100, 'upgrade screen');
  assert.equal((await lt('state')).phase, 'choice');
  const offered = await page.evaluate(() => window.__lt.world().run.choice.map((c) => c.id));
  assert.equal(offered.length, 3);
  assert.equal(await page.locator('.scr-upgrade .card').count(), 3);
  await page.waitForTimeout(500); // the card screen ignores keys for a moment after opening
  await shot(page, 'upgrade');
  await page.keyboard.press('Digit1');
  await until(async () => playing(await lt('state')), 60000, 100, 'back to play');
  const run = await page.evaluate(() => { const r = window.__lt.world().run; return { picks: r.picks, ranks: r.ranks, pending: r.pendingLevels, choice: r.choice }; });
  assert.deepEqual(run.picks, [offered[0]]);
  assert.equal(run.ranks[offered[0]], 1);
  assert.equal(run.pending, 0);
  assert.equal(run.choice, null);
  // The key that picked the card did not also act in the game, and the world runs again.
  const t0 = (await player(page)).time;
  await lt('step', 200);
  assert.ok((await player(page)).time > t0);
  assert.deepEqual(page.problems, []);
  await close(page);
});

test('death shows the defeat screen; Try Again starts a fresh run without reloading', async () => {
  const page = await open(env.browser, env.base, 'debug&play&seed=3&room=2');
  const lt = await hook(page);
  await until(async () => (await lt('state')).roomState === 'combat', 60000, 200, 'combat');
  await page.evaluate(() => { window.__sameDocument = true; });
  // Mid-fight picture: let the first wave arrive and close in (the keeper is spared meanwhile).
  await lt('god');
  await lt('freeze');
  await lt('step', 3000);
  await page.waitForTimeout(700);
  assert.ok((await lt('state')).enemies > 0, 'no foes for the combat picture');
  await shot(page, 'combat');
  await lt('god', false);
  await lt('thaw');
  // A slam landing on the keeper with more damage than health left: the real damage path.
  await page.evaluate(() => {
    const w = window.__lt.world(), p = w.player;
    p.iframes = 0; p.dashIframes = 0; w.run.ward = 0;
    w.addHazard({ kind: 'slam', team: 'enemy', x: p.x, y: p.y, r: 30, t: 0, dur: 0.3, delay: 0, dmg: 99, tick: 0 });
  });
  await until(async () => (await player(page)).state === 'dead', 5000, 100, 'death');
  await until(async () => (await lt('state')).screen === 'result', 30000, 100, 'result screen');
  assert.equal(await page.locator('.scr-result.defeat').count(), 1);
  assert.match(await page.locator('.scr-result .res-title').innerText(), /The Light Fades/i);
  await page.waitForTimeout(1200); // the result screen ignores input for 0.7 s
  await shot(page, 'defeat');
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('emberfall-last-light.records.v1')));
  assert.equal(records.runs, 1);
  assert.equal(records.wins, 0);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.id), 'restart');
  await page.keyboard.press('Enter');
  const s = await until(async () => { const s = await lt('state'); return playing(s) && s; }, 60000, 100, 'fresh run');
  assert.equal(s.node, 0);
  assert.equal(s.kind, 'sanctum');
  assert.equal(s.screen, null);
  const p = await page.evaluate(() => { const w = window.__lt.world(); return { hp: w.player.hp, max: w.player.maxHp, state: w.player.state, kills: w.run.kills, time: w.run.time, level: w.run.level }; });
  assert.equal(p.state, 'normal');
  assert.equal(p.hp, p.max);
  assert.equal(p.kills, 0);
  assert.equal(p.level, 0);
  assert.ok(p.time < 3);
  assert.equal(await page.evaluate(() => window.__sameDocument), true, 'the page reloaded');
  // The new run plays: the keeper moves.
  const a = await player(page);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(600); await page.keyboard.up('KeyD');
  assert.ok((await player(page)).x > a.x + 10);
  assert.deepEqual(page.problems, []);
  await close(page);
});

test('victory via the debug path (?debug&boss, killAll): the boss dies and the victory screen shows', async () => {
  const page = await open(env.browser, env.base, 'debug&boss&seed=4');
  const lt = await hook(page);
  const s = await until(async () => { const s = await lt('state'); return playing(s) && s; }, 60000);
  assert.equal(s.kind, 'boss');
  assert.equal(s.node, 13);
  await lt('god');
  // Let the fight run, and land a few real hits with the mouse to see the boss react.
  await page.waitForTimeout(2500);
  const boss0 = await page.evaluate(() => { const b = window.__lt.world().enemies.find((e) => e.kind === 'boss'); return b && { hp: b.hp, max: b.maxHp }; });
  assert.ok(boss0 && boss0.hp > 0, 'no boss');
  assert.equal(await page.locator('.bossbar:not(.hidden)').count(), 1, 'boss bar hidden');
  await shot(page, 'boss');
  await lt('killAll');
  const dead = await page.evaluate(() => window.__lt.world().enemies.find((e) => e.kind === 'boss')?.dead ?? 'gone');
  assert.ok(dead === true || dead === 'gone', 'killAll did not kill the boss');
  // The dying sequence (stepped, so slow software rendering does not matter), the room clears, then the
  // App's 3.2 s victory beat, which runs on rendered frames.
  await lt('freeze');
  await lt('step', 3500);
  assert.equal((await lt('state')).roomState, 'clear');
  await lt('thaw');
  await until(async () => (await lt('state')).screen === 'result', 60000, 200, 'victory screen');
  assert.equal(await page.locator('.scr-result.victory').count(), 1);
  assert.match(await page.locator('.scr-result .res-title').innerText(), /Light Restored/i);
  await page.waitForTimeout(1000);
  await shot(page, 'victory');
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('emberfall-last-light.records.v1')));
  assert.equal(records.wins, 1);
  assert.ok(records.bestTime > 0);
  assert.deepEqual(page.problems, []);
  await close(page);
});
