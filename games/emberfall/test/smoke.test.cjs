// Browser smoke tests: the page loads clean, draws, leaves the title, answers
// keyboard, mouse and touch, pause and the map hold the sim, death rekindles
// at the checkpoint, and a broken save does not stop the title.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, frameStats, frameDiff, canvasBox } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

let server, browser;
before(async () => { server = await serve(process.env.EB_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);
const { sleep } = G;

async function inPlay(query = 'debug', opts) {
  const page = await open(browser, server.url, query, opts);
  const eb = await G.hook(page);
  await eb('resetSave');
  await G.startFromTitle(page, eb);
  return { page, eb };
}

// Lets the live (unfrozen) game settle the player onto a floor.
async function settle(eb, ms = 3000) {
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < ms) { s = await eb('state'); if (s.player.onGround) return s; await sleep(100); }
  return s;
}

test('page loads with no console errors, failed requests or network calls', async () => {
  const page = await open(browser, server.url);
  await sleep(2000);
  clean(page);
  await close(page);
});

test('title renders a detailed, moving frame', async () => {
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

test('title to gameplay by the New game button and by Enter', async () => {
  for (const how of ['button', 'enter']) {
    const page = await open(browser, server.url, 'debug');
    const eb = await G.hook(page);
    await eb('resetSave');
    assert.equal((await eb('state')).scene, 'title');
    if (how === 'button') await page.click(G.SEL.new, { timeout: 3000 });
    else await page.keyboard.press('Enter');
    const s = await G.waitScene(eb, 'play', 5000);
    await sleep(700);
    assert.ok((await eb('state')).time > s.time, `sim clock does not advance in play (${how})`);
    clean(page);
    await close(page);
  }
});

test('keyboard runs, jumps and swings the lantern', async () => {
  const { page, eb } = await inPlay();
  await eb('god', true);
  const s0 = await settle(eb);
  assert.ok(s0.player.onGround, 'player never lands on a floor at the start');
  await page.keyboard.down(G.KEYS.right);
  await sleep(500);
  await page.keyboard.up(G.KEYS.right);
  const s1 = await eb('state');
  await page.keyboard.down(G.KEYS.left);
  await sleep(500);
  await page.keyboard.up(G.KEYS.left);
  const s1b = await eb('state');
  assert.ok(Math.abs(s1.player.x - s0.player.x) > 40 || Math.abs(s1b.player.x - s1.player.x) > 40, `A/D do not move the player (${s0.player.x} -> ${s1.player.x} -> ${s1b.player.x})`);
  const g = await settle(eb);
  await page.keyboard.down(G.KEYS.jump);
  let minY = g.player.y;
  for (let i = 0; i < 6; i++) { await sleep(60); minY = Math.min(minY, (await eb('state')).player.y); }
  await page.keyboard.up(G.KEYS.jump);
  assert.ok(g.player.y - minY > 40, `Space does not jump (rose ${g.player.y - minY} px)`);
  await settle(eb);
  const a0 = await eb('state');
  await page.keyboard.press(G.KEYS.attack);
  let swung = false;
  for (let i = 0; i < 8 && !swung; i++) { await sleep(40); const st = (await eb('state')).player.state; swung = /attack|swing/i.test(String(st)); }
  assert.ok(swung, `J did not start a lantern swing (player.state stayed '${a0.player.state}')`);
  clean(page);
  await close(page);
});

test('mouse click swings and touch controls move on a phone-sized screen', async () => {
  const { page, eb } = await inPlay();
  await settle(eb);
  await page.mouse.click(900, 360);
  let swung = false;
  for (let i = 0; i < 8 && !swung; i++) { await sleep(40); swung = /attack|swing/i.test(String((await eb('state')).player.state)); }
  assert.ok(swung, 'left click did not swing the lantern');
  clean(page);
  await close(page);

  const p2 = await open(browser, server.url, 'debug', { width: 844, height: 390, touch: true, mobile: true });
  const e2 = await G.hook(p2);
  await e2('resetSave');
  const btn = await G.firstVisible(p2, G.SEL.new);
  if (btn) await btn.tap(); else await p2.touchscreen.tap(422, 220);
  await G.waitScene(e2, 'play', 5000);
  await e2('god', true);
  const s0 = await settle(e2);
  // drag the left thumb stick to the right with a real touch
  const stick = await G.firstVisible(p2, '#t-stick');
  assert.ok(stick, 'no #t-stick touch control on a touch screen');
  const b = await stick.boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const cdp = await p2.context().newCDPSession(p2);
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: cy, id: 1 }] });
  await touch('touchStart', cx);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', cx + i * 10); await sleep(30); }
  await sleep(500);
  const s1 = await e2('state');
  await touch('touchEnd');
  assert.ok(s1.player.x - s0.player.x > 30, `thumb stick did not move the player right (${s0.player.x} -> ${s1.player.x})`);
  const jump = await G.firstVisible(p2, '#t-jump');
  assert.ok(jump, 'no #t-jump touch control');
  const st = await frameStats(p2);
  assert.ok(st.std > 10, 'phone frame looks blank');
  clean(p2);
  await close(p2);
});

test('pause and the map hold the sim, and resume', async () => {
  const { page, eb } = await inPlay();
  await page.keyboard.press(G.KEYS.pause);
  await G.waitScene(eb, 'paused', 2000);
  const t0 = (await eb('state')).time;
  await sleep(500);
  assert.equal((await eb('state')).time, t0, 'sim runs while paused');
  await page.click(G.SEL.resume, { timeout: 3000 });
  await G.waitScene(eb, 'play', 2000);
  await page.keyboard.press(G.KEYS.map);
  await G.waitScene(eb, 'map', 2000);
  const t1 = (await eb('state')).time;
  await sleep(400);
  assert.equal((await eb('state')).time, t1, 'sim runs while the map is open');
  const close_ = await G.firstVisible(page, G.SEL.closeMap);
  if (close_) await close_.click(); else await page.keyboard.press(G.KEYS.map);
  await G.waitScene(eb, 'play', 2000);
  clean(page);
  await close(page);
});

test('dying shows the death screen and rekindles at the checkpoint', async () => {
  const { page, eb } = await inPlay();
  await eb('god', false);
  const s0 = await eb('state');
  await eb('damage', s0.player.maxHp ?? s0.maxHp ?? 99);
  const d = await G.waitScene(eb, 'dead', 3000);
  assert.ok(d.deaths >= 1, 'deaths counter did not go up');
  const btn = await G.firstVisible(page, G.SEL.rekindle);
  if (btn) await btn.click(); else await page.keyboard.press('Enter');
  const s1 = await G.waitScene(eb, 'play', 4000);
  assert.ok(s1.player.hp > 0, 'rekindled with no health');
  clean(page);
  await close(page);
});

test('a corrupt save does not break the title', async () => {
  const page = await open(browser, server.url, 'debug');
  await page.evaluate((k) => localStorage.setItem(k, '{"room": 12, broken'), G.SAVE_KEY);
  await page.reload({ waitUntil: 'load' });
  const eb = await G.hook(page);
  await sleep(600);
  assert.equal((await eb('state')).scene, 'title');
  const st = await frameStats(page);
  assert.ok(st.std > 10, 'title is blank with a corrupt save');
  await page.click(G.SEL.new, { timeout: 3000 });
  await G.waitScene(eb, 'play', 4000);
  const errs = page.problems.filter((p) => p.startsWith('pageerror'));
  assert.deepEqual(errs, [], `corrupt save threw:\n${errs.join('\n')}`);
  await close(page);
});

test('sound starts through the AudioContext after a gesture (muted browser)', async () => {
  const page = await open(browser, server.url, 'debug');
  const eb = await G.hook(page);
  await page.click(G.SEL.new, { timeout: 3000 });
  await G.waitScene(eb, 'play', 4000);
  await sleep(400);
  const states = await page.evaluate(() => (window.__ebAudio || []).map((c) => c.state));
  assert.ok(states.includes('running'), `no running AudioContext after a click (contexts: ${JSON.stringify(states)})`);
  clean(page);
  await close(page);
});
