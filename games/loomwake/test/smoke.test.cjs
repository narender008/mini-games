// Browser smoke tests: the page loads clean and draws, and every screen of a
// run's loop shows up without errors: title, profiles, hub, a chamber, the
// boon cards, a door, pause, death back to the hub, a boss, victory and the
// ending. Also every boon and braid applied once, and every region's chambers
// load.
const { test } = require('node:test');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep } = G;

test('page loads with no console errors, failed requests or network calls', async () => {
  const page = await env.open();
  await sleep(2500);
  clean(page);
  await B.close(page);
});

test('title renders a detailed, moving frame and has its buttons', async () => {
  const page = await env.open();
  await sleep(1200);
  const s = await B.frameStats(page);
  assert.ok(s.std > 10 && s.colours > 60, `frame looks blank or flat: ${JSON.stringify(s)}`);
  const box = await B.canvasBox(page);
  assert.ok(box && box.w >= 600 && box.h >= 300, `canvas too small: ${JSON.stringify(box)}`);
  const a = await page.screenshot();
  await sleep(700);
  const b = await page.screenshot();
  const d = await B.frameDiff(page, a, b);
  assert.ok(d > 0.002, `title is not animating (diff ${d})`);
  assert.ok(await G.firstVisible(page, [G.SEL.new, G.SEL.continue]), 'no New game / Continue button on the title');
  clean(page);
  await B.close(page);
});

test('title, profile and hub by real clicks, then the Dreamdoor starts a run', async () => {
  const { page, lw } = await env.debug();
  await G.waitScene(lw, 'title', 5000);
  const hub = await G.titleToHub(page, lw, 0);
  assert.equal(hub.profile, 0);
  const st = await B.frameStats(page);
  assert.ok(st.std > 8, `hub frame looks blank: ${JSON.stringify(st)}`);
  // through the Dreamdoor: its button, else walk-in plus interact
  if (!(await G.clickOr(page, [G.SEL.dreamdoor], null))) await lw('play', {});
  const s = await G.waitScene(lw, G.RUN_SCENES, 10000);
  assert.equal(s.region, G.REGIONS[0], `first run does not start in ${G.REGIONS[0]}`);
  assert.ok(s.hero && s.hero.hp > 0 && s.hero.maxHp > 0, 'hero has no health in the first chamber');
  const t0 = s.time;
  await sleep(600);
  assert.ok((await lw('state')).time > t0, 'sim clock does not advance in a run');
  clean(page);
  await B.close(page);
});

test('a chamber clears, offers boon cards, a card is taken by a click, doors open and lead on', async () => {
  const { page, lw } = await env.debug();
  let s = await G.freshRun(page, lw, { seed: 7 });
  const c0 = s.chamber;
  assert.ok(s.enemies.length > 0 || s.chamberKind !== 'combat', 'combat chamber has no enemies');
  await lw('clear');
  let r = await G.stepUntil(page, 's => s.offer && s.offer.length || s.cleared', { ms: 8000 });
  // the reward may need picking up first: walk the hero onto it is the game's job; boons via the offer
  if (!r.s.offer) r = await G.stepUntil(page, 's => s.offer && s.offer.length', { ms: 8000 });
  assert.ok(r.s.offer && r.s.offer.length >= 2, `no boon cards after the first chamber (scene '${r.s.scene}')`);
  await lw('thaw');
  await G.waitVisible(page, [G.SEL.boon]);
  const cards = page.locator(G.SEL.boon).filter({ visible: true });
  assert.ok(await cards.count() >= 2, 'boon cards are not on screen as clickable elements');
  const id = await cards.first().getAttribute('data-boon');
  await cards.first().click();
  s = await G.waitScene(lw, G.RUN_SCENES, 5000);
  assert.ok(s.boons.some((b) => b.id === id), `clicked boon ${id} is not in the build: ${JSON.stringify(s.boons)}`);
  await lw('freeze');
  r = await G.stepUntil(page, 's => s.cleared && s.doors.some((d) => d.open)', { ms: 8000 });
  assert.ok(r.ok, 'doors do not open after the chamber is cleared');
  await lw('door', r.s.doors.findIndex((d) => d.open));
  s = (await G.stepUntil(page, `s => s.chamber !== ${c0} && s.scene === 'run'`, { ms: 8000 })).s;
  assert.notEqual(s.chamber, c0, 'going through a door does not change the chamber');
  clean(page);
  await B.close(page);
});

test('pause holds the sim and resume carries on', async () => {
  const { page, lw } = await env.debug();
  await G.freshRun(page, lw);
  await lw('god', true);
  await lw('thaw');
  await page.keyboard.press(G.KEYS.pause);
  let s = await G.waitScene(lw, 'paused', 3000);
  // runTime is the run's own clock (time is wall-ish sim time since boot)
  const t = s.runTime;
  await sleep(600);
  assert.ok(Math.abs((await lw('state')).runTime - t) < 1e-6, 'run clock runs while paused');
  assert.ok(await G.waitVisible(page, [G.SEL.resume]), 'no Resume button in the pause menu');
  await G.clickOr(page, [G.SEL.resume], G.KEYS.pause);
  s = await G.waitScene(lw, G.RUN_SCENES, 3000);
  await sleep(400);
  assert.ok((await lw('state')).runTime > t, 'run clock does not run after resume');
  clean(page);
  await B.close(page);
});

test('death shows its screen and returns to the hub with the run over', async () => {
  const { page, lw } = await env.debug();
  await G.freshRun(page, lw);
  await lw('kill');
  let s = await G.waitSceneStepped(page, lw, ['dead', 'dialogue', 'hub'], 10000);
  await lw('thaw');
  if (s.scene === 'dead') { await sleep(800); await G.clickOr(page, [G.SEL.ret], 'Enter'); }
  s = await G.waitScene(lw, ['hub', 'dialogue'], 10000);
  if (s.scene === 'dialogue') s = await G.skipDialogue(page, lw);
  s = await G.waitScene(lw, 'hub', 5000);
  assert.ok(s.story.deaths >= 1, 'death is not counted');
  assert.ok(s.region == null || s.chamberKind === 'hub', 'the run is still active after death');
  clean(page);
  await B.close(page);
});

test('each region boss fight loads, and beating Sable gives victory and the ending', async () => {
  const { page, lw } = await env.debug();
  const content = await lw('content');
  const bosses = content.bosses.map((b) => b.id || b);
  assert.equal(bosses.length, 4, `expected 4 bosses, content has ${bosses.join(', ')}`);
  for (const id of bosses) {
    await lw('freeze');
    await lw('boss', id);
    const r = await G.stepUntil(page, `s => s.boss && s.boss.id === ${JSON.stringify(id)} && s.scene === 'run'`, { ms: 10000, chunk: 100, skipDialogue: true });
    assert.ok(r.ok, `boss fight ${id} does not start (scene '${r.s.scene}', boss ${JSON.stringify(r.s.boss)})`);
    assert.ok(r.s.boss.hp > 0 && r.s.boss.maxHp > 0, `boss ${id} has no health bar`);
  }
  // the last one is Sable: finish it through the normal path. bossKill() may
  // end one phase at a time (Sable has two), and lines may play in between.
  await lw('god', true);
  const done = 's => ["victory","ending"].includes(s.scene) || s.story.wins > 0';
  let r;
  for (let k = 0; k < 4; k++) {
    const now = await lw('state');
    if (now.boss && now.scene === 'run') await lw('bossKill');
    r = await G.stepUntil(page, `s => (${done})(s) || (s.boss && s.scene === 'run')`, { ms: 30000, skipDialogue: true });
    if (!r.s.boss || r.s.scene !== 'run') break;
  }
  r = await G.stepUntil(page, done, { ms: 30000, skipDialogue: true });
  assert.ok(r.ok, `beating ${G.FINAL_BOSS} does not end the run (scene '${r.s.scene}', boss ${JSON.stringify(r.s.boss)})`);
  clean(page);
  await B.close(page);
});

test('every boon and braid can be applied and used in a fight without errors', async () => {
  const { page, lw } = await env.debug();
  const content = await lw('content');
  assert.ok(content.boons.length >= 30, `only ${content.boons.length} boons`);
  const errors = [];
  const batch = 6;
  const all = [...content.boons.map((b) => b.id), ...(content.braids || []).flatMap((b) => [...(b.needs || []), b.id])];
  for (let i = 0; i < all.length; i += batch) {
    await G.freshRun(page, lw, { seed: 100 + i });
    await lw('god', true);
    for (const id of all.slice(i, i + batch)) {
      try { await lw('give', id, 'epic'); } catch (e) { errors.push(`${id}: give threw ${e.message}`); }
    }
    // swing, special, snare, dash and call at the nearest foe for 6 seconds
    await page.evaluate(() => {
      const lw = window.__lw;
      for (let t = 0; t < 360; t++) {
        const s = lw.state(), e = s.enemies[0];
        const aim = e ? { x: e.x, y: e.y } : { x: s.hero.x + 50, y: s.hero.y };
        const m = e ? { x: Math.sign(e.x - s.hero.x) * 0.5, y: Math.sign(e.y - s.hero.y) * 0.5 } : { x: 0, y: 0 };
        lw.input({ move: m, aim, attack: t % 6 < 3, special: t % 40 === 0, snare: t % 50 === 10, dash: t % 70 === 20, call: t % 90 === 30 });
        lw.step(1000 / 60, { render: t % 30 === 0 });
      }
      lw.input(null);
    });
    const s = await lw('state');
    const given = all.slice(i, i + batch);
    const missing = given.filter((id) => !s.boons.some((b) => b.id === id) && !(s.braids || []).includes(id));
    // a slot boon can be swapped out by a later one in the same slot: only flag a batch none of which stuck
    if (missing.length === given.length) errors.push(`none of ${missing.join(', ')} is in the build after give()`);
  }
  assert.deepEqual(errors, []);
  clean(page);
  await B.close(page);
});

test('every chamber template of every region loads and draws', async () => {
  const { page, lw } = await env.debug();
  const content = await lw('content');
  for (const reg of content.regions) {
    const n = typeof reg.chambers === 'number' ? reg.chambers : (reg.chambers || []).length;
    assert.ok(n >= 6, `${reg.id} has only ${n} chambers`);
    for (let c = 0; c < n; c++) {
      await lw('freeze');
      await lw('play', { seed: 900 + c, region: reg.id, chamber: c });
      const r = await G.stepUntil(page, `s => s.scene === 'run' && s.region === ${JSON.stringify(reg.id)}`, { ms: 8000, chunk: 100, render: true, skipDialogue: true });
      assert.ok(r.ok, `${reg.id} chamber ${c} does not load (scene '${r.s.scene}')`);
    }
  }
  await lw('thaw');
  await sleep(300);
  const st = await B.frameStats(page);
  assert.ok(st.std > 8, 'last chamber drew a flat frame');
  clean(page);
  await B.close(page);
});
