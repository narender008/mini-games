// Browser smoke tests: the page loads clean, draws, leaves the title, and
// answers mouse, keyboard and touch; cards can be clicked; pause holds the
// sim; and a run reaches the boss through the debug hook.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, frameStats, frameDiff, canvasBox } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

let server, browser;
before(async () => { server = await serve(process.env.TB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function inPlay(query = 'debug', opts) {
  const page = await open(browser, server.url, query, opts);
  const tb = await G.hook(page);
  await G.startFromTitle(page, tb);
  return { page, tb };
}

test('page loads with no console errors, failed requests or network calls', async () => {
  const page = await open(browser, server.url);
  await sleep(2000);
  clean(page);
  await close(page);
});

test('canvas renders a detailed, moving frame', async () => {
  const page = await open(browser, server.url);
  await sleep(800);
  const s = await frameStats(page);
  assert.ok(s.std > 10 && s.colours > 60, `frame looks blank or flat: ${JSON.stringify(s)}`);
  const box = await canvasBox(page);
  assert.ok(box.w >= 600 && box.h >= 300, `canvas too small: ${JSON.stringify(box)}`);
  const a = await page.screenshot();
  await sleep(600);
  const b = await page.screenshot();
  const d = await frameDiff(page, a, b);
  assert.ok(d > 0.002, `title screen is not animating (diff ${d})`);
  clean(page);
  await close(page);
});

test('title to gameplay transition', async () => {
  const page = await open(browser, server.url, 'debug');
  const tb = await G.hook(page);
  assert.equal((await tb('state')).scene, 'title');
  const s = await G.startFromTitle(page, tb);
  assert.ok(G.PLAY_SCENES.includes(s.scene));
  const t0 = s.time;
  await sleep(700);
  assert.ok((await tb('state')).time > t0, 'sim clock does not advance in play');
  clean(page);
  await close(page);
});

test('mouse aim and click fires', async () => {
  const { page, tb } = await inPlay();
  const before = (await tb('state')).shots;
  await page.mouse.move(980, 330);
  await page.mouse.down();
  await sleep(700);
  await page.mouse.up();
  await sleep(100);
  const s = await tb('state');
  assert.ok(s.shots > before, `mouse did not fire (shots ${before} -> ${s.shots})`);
  if (s.aim) {
    await page.mouse.move(700, 200);
    await sleep(100);
    const s2 = await tb('state');
    assert.notDeepEqual(s2.aim, s.aim, 'aim does not follow the mouse');
  }
  clean(page);
  await close(page);
});

test('keyboard moves and fires', async () => {
  const { page, tb } = await inPlay();
  await tb('god', true);
  const s0 = await tb('state');
  await page.keyboard.down('KeyD');
  await sleep(600);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('ArrowLeft');
  await sleep(150);
  await page.keyboard.up('ArrowLeft');
  const s1 = await tb('state');
  assert.notEqual(s1.player.x, s0.player.x, 'D / arrow keys do not move the ship');
  await page.keyboard.down('Space');
  await sleep(700);
  await page.keyboard.up('Space');
  await sleep(100);
  const s2 = await tb('state');
  assert.ok(s2.shots > s1.shots, `Space did not fire (shots ${s1.shots} -> ${s2.shots})`);
  clean(page);
  await close(page);
});

test('touch taps fire on a phone-sized screen', async () => {
  const page = await open(browser, server.url, 'debug', { width: 844, height: 390, touch: true, mobile: true });
  const tb = await G.hook(page);
  const btn = await G.firstVisible(page, G.START_SELECTORS);
  if (btn) await btn.tap(); else await page.touchscreen.tap(422, 220);
  await G.waitScene(page, tb, G.PLAY_SCENES, 5000);
  const before = (await tb('state')).shots;
  for (let i = 0; i < 4; i++) { await page.touchscreen.tap(640, 150 + i * 20); await sleep(250); }
  const s = await tb('state');
  assert.ok(s.shots > before, `taps did not fire (shots ${before} -> ${s.shots})`);
  const s1 = await frameStats(page);
  assert.ok(s1.std > 10, 'phone frame looks blank');
  clean(page);
  await close(page);
});

test('clicking an upgrade card takes it', async () => {
  const { page, tb } = await inPlay();
  await tb('cards');
  const s0 = await G.waitScene(page, tb, 'cards', 4000);
  assert.ok(s0.cards?.length >= 2, `card screen offers ${s0.cards?.length} cards`);
  const card = await G.firstVisible(page, G.CARD_SELECTORS);
  assert.ok(card, 'no visible upgrade card element');
  await card.click();
  const s1 = await G.waitScene(page, tb, G.PLAY_SCENES, 4000);
  assert.ok(s1.upgrades.length > s0.upgrades.length, `upgrades ${JSON.stringify(s0.upgrades)} -> ${JSON.stringify(s1.upgrades)}`);
  clean(page);
  await close(page);
});

test('pause holds the sim and resume restarts it', async () => {
  const { page, tb } = await inPlay();
  await page.keyboard.press('Escape');
  let s = await G.waitScene(page, tb, 'paused', 2000);
  const t = s.time;
  await sleep(600);
  assert.equal((await tb('state')).time, t, 'sim advanced while paused');
  await page.keyboard.press('Escape');
  s = await G.waitScene(page, tb, G.PLAY_SCENES, 2000);
  await sleep(400);
  assert.ok((await tb('state')).time > t, 'sim did not resume');
  const btn = await G.firstVisible(page, G.PAUSE_SELECTORS);
  if (btn) {
    await btn.click();
    await G.waitScene(page, tb, 'paused', 2000);
  }
  clean(page);
  await close(page);
});

test('a run reaches the boss through the debug hook', async () => {
  const { page, tb } = await inPlay();
  const r = await page.evaluate(async () => {
    const tb = window.__tb;
    tb.freeze(); tb.god(true);
    let s = tb.state();
    for (let i = 0; i < 2400 && !s.boss; i++) {
      if (s.scene === 'cards') tb.choose(0);
      tb.kill();
      tb.step(500);
      s = tb.state();
    }
    return { boss: s.boss, time: s.time, scene: s.scene, wave: s.stage ?? s.wave };
  });
  assert.ok(r.boss && r.boss.hp > 0, `no boss after ${r.time}s of sim (scene ${r.scene}, wave ${r.wave})`);
  await page.evaluate(() => window.__tb.thaw());
  await sleep(500);
  const st = await frameStats(page);
  assert.ok(st.std > 10, 'boss frame looks blank');
  clean(page);
  await close(page);
});
