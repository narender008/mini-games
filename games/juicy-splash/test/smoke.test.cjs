// Browser smoke tests: the page loads clean and offline, draws a detailed
// moving picture, real mouse drags and finger swipes and taps cut fruit,
// music starts on the first touch and the sound button mutes it, the jar
// party comes and goes, and phones and resizes work.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats, frameDiff } = require('./lib/browser.cjs');

let server, browser;
before(async () => { server = await serve(process.env.JS_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, what = 'condition') { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(50); } throw new Error(`timed out waiting for ${what}`); }

// A game in play with no automatic fruit, so a test places its own.
async function quiet(query = 'debug&play', opts) {
  const page = await open(browser, server.url, query, opts);
  const js = await hook(page);
  await js('noSpawn'); await js('clear');
  return { page, js };
}

test('page loads with no console errors, failed requests or network calls', async () => {
  const page = await open(browser, server.url);
  await sleep(2500);
  clean(page);
  await close(page);
});

test('the title is a detailed, moving picture', async () => {
  const page = await open(browser, server.url);
  await sleep(900);
  const s = await frameStats(page);
  assert.ok(s.std > 20 && s.colours > 150, `frame looks blank or flat: ${JSON.stringify(s)}`);
  const a = await page.screenshot(); await sleep(700); const b = await page.screenshot();
  assert.ok(await frameDiff(page, a, b) > 0.01, 'nothing moves on the title');
  await close(page);
});

test('a click anywhere on the title starts the game', async () => {
  const page = await open(browser, server.url, 'debug');
  const js = await hook(page);
  assert.equal((await js('state')).phase, 'title');
  await page.mouse.click(100, 650);
  await until(async () => (await js('state')).phase === 'play', 2000, 'play');
  clean(page); await close(page);
});

test('a mouse drag across fruit cuts them and juice fills the jar', async () => {
  const { page, js } = await quiet();
  await js('spawn', 'watermelon', 400, 360); await js('spawn', 'pineapple', 800, 330);
  await page.mouse.move(200, 380); await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(200 + i * 40, 380 - i * 3);
  await page.mouse.up();
  const s = await js('state');
  assert.equal(s.sliced, 2); assert.equal(s.fruits.length, 0); assert.equal(s.halves, 4);
  assert.ok(s.drops > 10, 'no juice drops');
  await until(async () => (await js('state')).stripes === 2, 3000, 'two stripes in the jar');
  clean(page); await close(page);
});

test('just moving the mouse without pressing cuts nothing', async () => {
  const { page, js } = await quiet();
  await js('spawn', 'apple', 640, 360);
  await page.mouse.move(400, 360); for (let i = 1; i <= 12; i++) await page.mouse.move(400 + i * 40, 360);
  assert.equal((await js('state')).sliced, 0);
  await close(page);
});

test('a finger tap pops a fruit, and a finger swipe cuts one (touch)', async () => {
  const { page, js } = await quiet('debug&play', { width: 1024, height: 768, touch: true });
  await js('spawn', 'strawberry', 300, 300); await js('spawn', 'kiwi', 700, 350);
  await page.touchscreen.tap(310, 290);
  assert.equal((await js('state')).sliced, 1);
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 10, radiusY: 10, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(560, 420) });
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(560 + i * 25, 420 - i * 12) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const s = await js('state');
  assert.equal(s.sliced, 2); assert.equal(s.fruits.length, 0);
  clean(page); await close(page);
});

test('two fingers at once each cut their own fruit', async () => {
  const { page, js } = await quiet('debug&play', { width: 1024, height: 768, touch: true });
  await js('spawn', 'orange', 250, 300); await js('spawn', 'lemon', 750, 300);
  const cdp = await page.context().newCDPSession(page);
  const two = (k) => [{ x: 150 + k * 20, y: 300, id: 1 }, { x: 650 + k * 20, y: 300, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: two(0) });
  for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: two(k) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await js('state')).sliced, 2);
  await close(page);
});

test('music only starts after the first touch, keeps playing, and the sound button mutes it (and remembers)', async () => {
  const page = await open(browser, server.url, 'debug');
  const js = await hook(page);
  let a = (await js('state')).audio;
  assert.equal(a.context, 'none', 'audio started before any touch');
  await page.mouse.click(640, 600);
  a = await until(async () => { const x = (await js('state')).audio; return x.context === 'running' && x.music ? x : null; }, 3000, 'running music');
  const n0 = a.notes, s0 = a.step; await sleep(2500);
  a = (await js('state')).audio;
  assert.ok(a.step > s0 + 6 && a.notes > n0 + 2, `music moved on only ${a.step - s0} beats (${a.notes - n0} tune notes) in 2.5 s`);
  await page.click('#sound');
  assert.equal((await js('state')).audio.muted, true);
  assert.equal(await page.getAttribute('#sound', 'aria-pressed'), 'false');
  await page.reload(); const js2 = await hook(page);
  assert.equal((await js2('state')).audio.muted, true);
  assert.equal(await page.getAttribute('#sound', 'aria-pressed'), 'false');
  await page.click('#sound');
  assert.equal((await js2('state')).audio.muted, false);
  clean(page); await close(page);
});

test('a full jar throws a party, is drunk up, and play goes on', async () => {
  const { page, js } = await quiet();
  await js('fill');
  await until(async () => (await js('state')).phase === 'party', 2000, 'party');
  await sleep(600);
  const s = await frameStats(page);
  assert.ok(s.colours > 200, 'party frame looks flat');
  await js('step', 9000);
  const st = await js('state');
  assert.equal(st.phase, 'play'); assert.equal(st.stripes, 0); assert.equal(st.rounds, 1);
  clean(page); await close(page);
});

test('the hint hand appears when nobody plays', async () => {
  const { page, js } = await quiet();
  await js('spawn', 'apple', 640, 300);
  await js('step', 7000);
  assert.equal((await js('state')).hint, true);
  await page.mouse.click(50, 650);
  assert.equal((await js('state')).hint, false);
  await close(page);
});

test('on a phone held upright the fruit are big and stay on screen', async () => {
  const page = await open(browser, server.url, 'debug&play&seed=4', { width: 390, height: 844, touch: true, mobile: true, scale: 3 });
  const js = await hook(page);
  let worst = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    const s = await js('state');
    for (const f of s.fruits) if (f.y < 844) { assert.ok(f.x > 0 && f.x < 390, `fruit off the side at x=${f.x}`); worst = Math.max(worst, f.r); }
  }
  assert.ok(worst >= 44, `fruit too small for little fingers: r=${worst}`);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(ov <= 0, 'page scrolls sideways');
  clean(page); await close(page);
});

test('resizing and turning the screen mid-game keeps everything working', async () => {
  const { page, js } = await quiet();
  await js('spawn', 'mango', 640, 360);
  await page.setViewportSize({ width: 600, height: 900 }); await sleep(300);
  let s = await js('state');
  assert.ok(Math.abs(s.fruits[0].x - 300) < 1 && Math.abs(s.fruits[0].y - 450) < 1, 'fruit did not move with the resize');
  await page.mouse.move(150, 450); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(150 + i * 30, 450); await page.mouse.up();
  s = await js('state');
  assert.equal(s.sliced, 1);
  const f = await frameStats(page); assert.ok(f.colours > 100);
  clean(page); await close(page);
});

test('frames keep coming smoothly during busy play', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const js = await hook(page);
  await js('fill');
  for (let i = 0; i < 4; i++) await js('spawn', 'watermelon', 200 + i * 250, 300);
  await js('swipe', 100, 320, 1200, 280);
  const iv = await page.evaluate(() => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last; const f = (t) => { out.push(t - last); last = t; if (t - t0 < 2500) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
  iv.sort((a, b) => a - b);
  const med = iv[Math.floor(iv.length / 2)];
  assert.ok(med < 50, `median frame interval ${med.toFixed(1)} ms`);
  clean(page); await close(page);
});
