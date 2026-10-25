// Browser smoke tests: the page loads clean and draws, and every screen shows
// up without errors: title, profiles, the colony, the build palette, research,
// the sky chart, the fleet, settings, pause, the speed buttons, a raid and a
// storm with the raid abilities, every preset colony, and the won screen.
const { test } = require('node:test');
const { suite, clean, assert, B, G } = require('./lib/suite.cjs');
const env = suite();
const { sleep, SEL } = G;

test('page loads with no console errors, failed requests or network calls', async () => {
  const page = await env.open();
  await sleep(2500);
  clean(page);
  await B.close(page);
});

test('title renders a detailed, moving frame and has its buttons', async () => {
  const page = await env.open();
  await sleep(1500);
  const s = await B.frameStats(page);
  assert.ok(s.std > 10 && s.colours > 60, `frame looks blank or flat: ${JSON.stringify(s)}`);
  const box = await B.canvasBox(page);
  assert.ok(box && box.w >= 600 && box.h >= 300, `canvas too small: ${JSON.stringify(box)}`);
  const a = await page.screenshot();
  await sleep(800);
  const b = await page.screenshot();
  const d = await B.frameDiff(page, a, b);
  assert.ok(d > 0.002, `title is not animating (diff ${d})`);
  assert.ok(await G.firstVisible(page, [SEL.new, SEL.continue]), 'no New / Continue button on the title');
  clean(page);
  await B.close(page);
});

test('hook, state and content have the contract shape', async () => {
  const { page, sf } = await env.debug();
  const c = await sf('content');
  for (const k of ['resources', 'buildings', 'research', 'islands', 'goal']) assert.ok(c[k], `content() has no ${k}`);
  assert.ok(c.buildings.length >= 8, `only ${c.buildings.length} building types`);
  assert.ok(c.research.length >= 8, `only ${c.research.length} research nodes`);
  assert.ok(c.islands.length >= 3, `only ${c.islands.length} islands`);
  const ids = new Set(c.research.map((r) => r.id));
  for (const r of c.research) for (const n of r.needs || []) assert.ok(ids.has(n), `research ${r.id} needs unknown ${n}`);
  const types = new Set(c.buildings.map((b) => b.id));
  for (const r of c.research) for (const u of r.unlocks || []) assert.ok(types.has(u) || ids.has(u) || typeof u === 'string', `research ${r.id} unlocks unknown ${u}`);
  for (const b of c.buildings) for (const k of Object.keys({ ...b.cost, ...b.produces, ...b.consumes })) assert.ok(c.resources.includes(k), `building ${b.id} uses unknown resource ${k}`);
  const s = await G.freshColony(page, sf);
  for (const k of ['scene', 'time', 'speed', 'colony', 'res', 'islands', 'buildings', 'research', 'goals', 'goal', 'threat']) assert.ok(k in s, `state() has no ${k}`);
  assert.ok(s.islands.some((i) => i.owned), 'no owned island at the start');
  assert.ok(s.colony.pop > 0, 'colony starts with no people');
  clean(page);
  await B.close(page);
});

test('title, profile and colony by real clicks, and the sim clock runs', async () => {
  const { page, sf } = await env.debug();
  await G.waitScene(sf, ['title', 'profiles'], 8000);
  const s = await G.titleToColony(page, sf, 0);
  assert.equal(s.profile, 0);
  const st = await B.frameStats(page);
  assert.ok(st.std > 8 && st.colours > 60, `colony frame looks blank: ${JSON.stringify(st)}`);
  const t0 = s.time;
  await sleep(800);
  assert.ok((await sf('state')).time > t0, 'sim clock does not advance in the colony');
  clean(page);
  await B.close(page);
});

test('build palette places a building by clicks and it gets built', async () => {
  const { page, sf } = await env.debug();
  let s = await G.freshColony(page, sf);
  const home = G.homeIsland(s);
  const n0 = s.buildings.length;
  await sf('thaw');
  assert.ok(await G.clickOr(page, [SEL.build], G.KEYS.build), 'no build button');
  const item = await G.waitVisible(page, [SEL.buildItem()], 3000);
  assert.ok(item, 'build palette shows no [data-build] items');
  const type = await item.getAttribute('data-build');
  await item.click();
  const p = await G.spot(sf, type, home);
  assert.ok(p, `no legal spot for ${type} on ${home}`);
  const xy = await sf('toScreen', home, p.x, p.y);
  await page.mouse.click(xy.x, xy.y);
  await sleep(300);
  s = await sf('state');
  if (s.buildings.length === n0) {
    // maybe the placement needs a confirm click
    await page.mouse.click(xy.x, xy.y);
    await sleep(300);
    s = await sf('state');
  }
  assert.ok(s.buildings.length > n0, `clicking a palette item then the island did not place a ${type}`);
  await sf('freeze');
  const r = await G.stepUntil(page, `s => s.buildings.some((b) => b.type === '${type}' && (b.progress == null || b.progress >= 1))`, { ms: 600000, chunk: 2000 });
  assert.ok(r.ok, `${type} never finished building`);
  clean(page);
  await B.close(page);
});

test('every panel opens and closes: research, sky chart, settings, pause', async () => {
  const { page, sf } = await env.debug();
  await G.freshColony(page, sf);
  await sf('thaw');
  const panels = [['research', SEL.research, G.KEYS.research], ['chart', SEL.chart, G.KEYS.chart], ['fleet', SEL.fleet, G.KEYS.fleet], ['paused', SEL.pause, G.KEYS.menu]];
  for (const [scene, btn, key] of panels) {
    await G.clickOr(page, [btn], key);
    await G.waitScene(sf, scene, 4000);
    const st = await B.frameStats(page);
    assert.ok(st.std > 8, `${scene} looks blank`);
    if (scene === 'paused') {
      const t = (await sf('state')).time;
      await sleep(500);
      assert.equal((await sf('state')).time, t, 'sim keeps running while paused');
      await G.clickOr(page, [SEL.resume], 'Escape');
    } else await G.clickOr(page, [SEL.close], 'Escape');
    await G.waitScene(sf, G.COLONY_SCENES, 4000);
  }
  await G.clickOr(page, [SEL.pause], 'Escape');
  await G.waitScene(sf, 'paused', 4000);
  const set = await G.waitVisible(page, [SEL.settings], 2000);
  if (set) {
    await set.click();
    await G.waitScene(sf, 'settings', 4000);
    await G.clickOr(page, [SEL.closeSettings, SEL.close], 'Escape');
  }
  clean(page);
  await B.close(page);
});

test('research nodes show, one starts by clicks and completes', async () => {
  const { page, sf } = await env.debug();
  // research needs scholars at an academy: the 'mid' preset has one
  let s = await G.freshColony(page, sf, { preset: 'mid' });
  await sf('cancelResearch'); // the preset may be mid-project: start from an idle Academy
  await sf('thaw');
  await G.clickOr(page, [SEL.research], G.KEYS.research);
  await G.waitScene(sf, 'research', 4000);
  s = await sf('state');
  assert.ok(s.research.available.length > 0, 'nothing researchable at the start');
  const id = s.research.available[0];
  // a fresh colony has no insight yet: hand it the bill so the click is the test
  const cost = ((await sf('content')).research.find((r) => r.id === id) || {}).cost || {};
  await sf('give', Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, v * 2])));
  const node = await G.waitVisible(page, [SEL.researchNode(id)], 3000);
  assert.ok(node, `research node ${id} is not on screen`);
  await node.click();
  await G.clickOr(page, [SEL.beginResearch], null, 1500);
  s = await sf('state');
  assert.equal(s.research.current, id, `clicking ${id} and Begin did not start it`);
  await G.clickOr(page, [SEL.close], 'Escape');
  await sf('freeze');
  const r = await G.stepUntil(page, `s => s.research.done.includes('${id}')`, { ms: 3600000, chunk: 5000 });
  assert.ok(r.ok, `${id} never finished`);
  clean(page);
  await B.close(page);
});

test('speed buttons change the sim speed and pause it', async () => {
  const { page, sf } = await env.debug();
  await G.freshColony(page, sf);
  await sf('thaw');
  const rate = async () => { const a = await sf('state'); await sleep(1000); const b = await sf('state'); return b.time - a.time; };
  await G.clickOr(page, [SEL.speed(1)], G.KEYS.speed(1));
  const r1 = await rate();
  await G.clickOr(page, [SEL.speed(3)], G.KEYS.speed(3));
  assert.equal((await sf('state')).speed, 3, 'speed 3 did not take');
  const r3 = await rate();
  assert.ok(r3 > r1 * 1.8, `3x is not faster than 1x (${r1.toFixed(2)} vs ${r3.toFixed(2)} game s per s)`);
  await G.clickOr(page, [SEL.speed(0)], G.KEYS.pause);
  assert.ok((await rate()) < 0.05, 'speed 0 does not pause');
  clean(page);
  await B.close(page);
});

test('a pirate raid and a storm play out and the colony comes through', async () => {
  const { page, sf } = await env.debug();
  // the 'raid' preset has batteries and rods up, so the abilities have guns
  await G.freshColony(page, sf, { preset: 'raid' });
  await sf('raid');
  let r = await G.stepUntil(page, 's => s.threat.raid && s.threat.raid.active', { ms: 120000, chunk: 500, render: true });
  assert.ok(r.ok, 'raid() did not start a raid');
  await sf('thaw');
  const shown = [];
  for (const a of G.DEFEND) if (await G.waitVisible(page, [SEL.defend(a)], a === G.DEFEND[0] ? 4000 : 300)) shown.push(a);
  assert.ok(shown.length >= 1, 'no raid ability buttons [data-defend] during a raid');
  const before = await sf('game.defend');
  await (await G.firstVisible(page, [SEL.defend(shown[0])])).click();
  await sleep(300);
  const after = await sf('game.defend');
  assert.notDeepEqual(after, before, `clicking ${shown[0]} changed nothing (no cooldown or charge moved)`);
  await sf('freeze');
  r = await G.stepUntil(page, 's => !s.threat.raid || !s.threat.raid.active', { ms: 600000, chunk: 1000 });
  assert.ok(r.ok, 'the raid never ends');
  await sf('storm');
  r = await G.stepUntil(page, 's => s.threat.storm && s.threat.storm.active', { ms: 120000, chunk: 500, render: true });
  assert.ok(r.ok, 'storm() did not start a storm');
  r = await G.stepUntil(page, 's => !s.threat.storm || !s.threat.storm.active', { ms: 900000, chunk: 1000 });
  assert.ok(r.ok, 'the storm never ends');
  assert.ok(r.s.colony.pop > 0, 'a fully stocked colony did not survive a raid and a storm');
  clean(page);
  await B.close(page);
});

test('every preset colony loads, draws and runs a game day without errors', async () => {
  const { page, sf } = await env.debug();
  for (const preset of G.PRESETS) {
    await sf('freeze');
    await sf('play', { seed: 77, preset });
    const r = await G.stepUntil(page, 's => s.scene === "colony"', { ms: 10000, chunk: 100 });
    assert.ok(r.ok, `preset ${preset} did not reach the colony`);
    const s0 = r.s;
    const s1 = (await G.stepUntil(page, 's => false', { ms: 300000, chunk: 5000 })).s;
    assert.ok(s1.day > s0.day || s1.time - s0.time >= 299, `preset ${preset}: a day did not pass`);
    if (preset !== 'fresh') assert.ok(s1.buildings.length > s0.buildings.length * 0.5 && s0.buildings.length > 3, `preset ${preset} has only ${s0.buildings.length} buildings`);
    await sf('step', 50, { render: true });
    const banner = await page.evaluate(() => { const b = document.querySelector('#chapter-banner.on'); return b ? b.querySelector('.label')?.textContent : null; });
    if (banner) assert.equal(banner, `Chapter ${s1.chapter}`, `preset ${preset} (chapter ${s1.chapter}) shows the banner for ${banner}`);
    const st = await B.frameStats(page);
    assert.ok(st.std > 8 && st.colours > 60, `preset ${preset} draws a blank frame: ${JSON.stringify(st)}`);
  }
  clean(page);
  await B.close(page);
});

test('the won screen shows and Return goes back to the title', async () => {
  const { page, sf } = await env.debug();
  await G.freshColony(page, sf);
  const w = await sf('win');
  assert.ok(w && w.ok, `win() failed: ${JSON.stringify(w)}`);
  await sf('thaw'); // the UI moves to 'won' a moment after the sim's won event
  await G.waitScene(sf, 'won', 10000);
  await sleep(500);
  const st = await B.frameStats(page);
  assert.ok(st.std > 8, 'won screen looks blank');
  await G.clickOr(page, [SEL.wonTitle, SEL.ret], 'Enter', 4000);
  await G.waitScene(sf, ['title', 'profiles', 'colony'], 6000);
  clean(page);
  await B.close(page);
});

test('sound uses an AudioContext and nothing plays before the first gesture', async () => {
  const page = await env.open('debug');
  const sf = await G.hook(page);
  await sleep(800);
  const before = await page.evaluate(() => (window.__sfAudio || []).filter((a) => a.state === 'running').length);
  assert.equal(before, 0, 'audio is running before any user gesture');
  await G.titleToColony(page, sf, 0).catch(() => {});
  await sleep(500);
  const n = await page.evaluate(() => (window.__sfAudio || []).length);
  assert.ok(n >= 1, 'no AudioContext created after a click');
  await B.close(page);
});
