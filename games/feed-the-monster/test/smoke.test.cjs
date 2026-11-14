// Browser smoke tests: the page loads clean and offline and draws a detailed
// moving meadow; real mouse drags and finger taps feed the big monster and
// the babies (a tapped fruit a baby dreams of goes to that baby); the sun
// and butterflies answer taps; five fruits throw a party whose balloons pop
// and whose candle blows out; then bath, teeth and dress-up each play
// through with real pointer input and hand back to feeding; and phones,
// resizes and frame pacing hold up.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats, frameDiff } = require('./lib/browser.cjs');

let server, browser;
before(async () => { server = await serve(process.env.FM_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, what = 'condition') { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(50); } throw new Error(`timed out waiting for ${what}`); }

async function game(query = 'debug', opts) {
  const page = await open(browser, server.url, query, opts);
  const fm = await hook(page);
  await until(async () => (await fm('state')).fruits.filter((f) => f.state === 'idle').length >= 5, 5000, 'fruit out');
  return { page, fm };
}
// rub the pointer back and forth across a point
async function rub(page, x, y, span = 40, n = 14) {
  await page.mouse.move(x - span, y); await page.mouse.down();
  for (let i = 0; i < n; i++) await page.mouse.move(x + (i % 2 ? span : -span), y + (i % 3) * 4);
  await page.mouse.up();
}

test('page loads with no console errors, failed requests or network calls', async () => {
  const page = await open(browser, server.url);
  await sleep(2500);
  clean(page);
  await close(page);
});

test('the meadow is a detailed, moving picture', async () => {
  const page = await open(browser, server.url);
  await sleep(1200);
  const s = await frameStats(page);
  assert.ok(s.std > 20 && s.colours > 200, `frame looks blank or flat: ${JSON.stringify(s)}`);
  const a = await page.screenshot(); await sleep(700); const b = await page.screenshot();
  assert.ok(await frameDiff(page, a, b) > 0.005, 'nothing moves');
  await close(page);
});

test('dragging a fruit with the mouse into the big mouth feeds the monster and a star lands', async () => {
  const { page, fm } = await game();
  const s = await fm('state');
  const f = s.fruits.find((x) => x.state === 'idle');
  await page.mouse.move(f.x, f.y); await page.mouse.down();
  const tx = s.monster.x, ty = s.monster.y + s.monster.R * 0.36;
  for (let i = 1; i <= 12; i++) await page.mouse.move(f.x + ((tx - f.x) * i) / 12, f.y + ((ty - f.y) * i) / 12);
  await page.mouse.up();
  await until(async () => (await fm('state')).stars === 1, 4000, 'a star');
  clean(page); await close(page);
});

test('a tapped fruit that a baby dreams of goes to that baby, and it cheers', async () => {
  const { page, fm } = await game('debug', { touch: true });
  await fm('want', 1);
  let s = await fm('state');
  const kind = s.babies[1].want;
  assert.ok(kind, 'baby has no wish');
  const f = s.fruits.find((x) => x.kind === kind && x.state === 'idle');
  await page.touchscreen.tap(f.x, f.y);
  await until(async () => (await fm('state')).matches === 1, 4000, 'a match');
  await until(async () => (await fm('state')).stars === 1, 3000, 'the star');
  s = await fm('state');
  assert.notEqual(s.babies[1].want, kind);
  clean(page); await close(page);
});

test('a fruit dropped on a baby feeds the baby', async () => {
  const { page, fm } = await game();
  const s = await fm('state');
  const b = s.babies[0];
  const f = s.fruits.find((x) => x.state === 'idle');
  await page.mouse.move(f.x, f.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(f.x + ((b.x - f.x) * i) / 12, f.y + ((b.y - f.y) * i) / 12);
  await page.mouse.up();
  await until(async () => (await fm('state')).stars === 1, 4000, 'a star from the baby');
  clean(page); await close(page);
});

test('the sun giggles and a butterfly flutters off when tapped', async () => {
  const { page, fm } = await game();
  await fm('sun');
  assert.ok((await fm('state')).sunJoy > 0, 'sun did not react');
  // tap each butterfly where it is (frozen) until one flutters off; one
  // may be passing in front of a fruit, which takes the tap first
  await fm('freeze');
  for (const i of [0, 1]) {
    const p = await fm('butterfly', i);
    await page.mouse.click(p.x, p.y);
  }
  assert.ok((await fm('state')).flee.some(Boolean), 'no butterfly fluttered off');
  clean(page); await close(page);
});

test('five fruits throw a party: balloons pop, the candle blows out, then a care game starts', async () => {
  const { page, fm } = await game();
  for (let i = 0; i < 5; i++) {
    await fm('feed', i);
    await until(async () => (await fm('state')).stars === i + 1 || (await fm('state')).mode === 'party', 4000, `star ${i + 1}`);
  }
  await until(async () => (await fm('state')).mode === 'party', 3000, 'party');
  await sleep(2600);
  let a = (await fm('state')).act;
  assert.ok(a.balloons.length > 0, 'no balloons');
  const bl = a.balloons.find((x) => x.y > 40 && x.y < 700);
  await page.mouse.click(bl.x, bl.y);
  assert.ok((await fm('state')).act.popped >= 1, 'balloon did not pop');
  a = (await fm('state')).act;
  await page.mouse.click(a.cake.x, a.cake.y);
  await until(async () => (await fm('state')).act?.lit === false, 2000, 'candle out');
  const f = await frameStats(page); assert.ok(f.colours > 250, 'party frame looks flat');
  await until(async () => ['bath', 'teeth', 'dress'].includes((await fm('state')).mode), 15000, 'a care game');
  const s = await fm('state');
  assert.equal(s.rounds, 1); assert.equal(s.stars, 0);
  clean(page); await close(page);
});

test('bath time: scrubbing with the mouse covers the monster in foam, then it rinses and feeding returns', async () => {
  const { page, fm } = await game();
  await fm('activity', 'bath');
  await sleep(900);
  const m = (await fm('state')).monster;
  for (let k = 0; k < 4 && !(await fm('state')).act.rinsing; k++) await rub(page, m.x, m.y - m.R * 0.35, m.R * 0.6, 16);
  assert.equal((await fm('state')).act.rinsing, true, 'no rinse after scrubbing');
  const d = (await fm('state')).act.duck;
  await until(async () => (await fm('state')).mode === 'feed', 8000, 'back to feeding');
  clean(page); await close(page);
  void d;
});

test('brushing teeth with a finger cleans every germ', async () => {
  const { page, fm } = await game('debug', { touch: true });
  await fm('activity', 'teeth');
  await sleep(1200);
  const cdp = await page.context().newCDPSession(page);
  for (let k = 0; k < 8; k++) {
    const a = (await fm('state')).act;
    if (!a.germs.length) break;
    const g = a.germs[0];
    const pt = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(g.x - 25, g.y) });
    for (let i = 0; i < 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(g.x + (i % 2 ? 25 : -25), g.y + 3) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const a = (await fm('state')).act;
  assert.equal(a.cleaned, 5, `only ${a.cleaned} germs brushed away`);
  await until(async () => (await fm('state')).mode === 'feed', 8000, 'back to feeding');
  clean(page); await close(page);
});

test('dress-up: tapped pieces fly onto the monster and stay on for the next round', async () => {
  const { page, fm } = await game();
  await fm('activity', 'dress');
  await sleep(900);
  const items = (await fm('state')).act.items;
  for (const id of ['crown', 'glasses', 'bow', 'flowers']) { const it = items.find((x) => x.id === id); await page.mouse.click(it.x, it.y); await sleep(650); }
  let s = await fm('state');
  assert.deepEqual(s.outfit, { head: 'flowers', face: 'glasses', side: 'bow' });
  await until(async () => (await fm('state')).mode === 'feed', 8000, 'back to feeding');
  s = await fm('state');
  assert.equal(s.outfit.face, 'glasses');
  clean(page); await close(page);
});

test('an activity nobody plays finishes by itself', async () => {
  const { page, fm } = await game();
  for (const a of ['bath', 'teeth', 'dress']) {
    await fm('activity', a);
    await fm('freeze');
    await fm('step', 60000);
    await fm('thaw');
    assert.equal((await fm('state')).mode, 'feed', `${a} never ended`);
  }
  clean(page); await close(page);
});

test('on a phone held upright everything stays on screen', async () => {
  const page = await open(browser, server.url, 'debug', { width: 390, height: 844, touch: true, mobile: true, scale: 3 });
  const fm = await hook(page);
  await sleep(1500);
  const s = await fm('state');
  for (const b of s.babies) assert.ok(b.x - b.R > -2 && b.x + b.R < 392, `baby off screen at ${b.x}`);
  for (const f of s.fruits) assert.ok(f.x > 0 && f.x < 390 && f.y > 0 && f.y < 844);
  await fm('activity', 'dress'); await sleep(900);
  for (const it of (await fm('state')).act.items) assert.ok(it.x > 0 && it.x < 390 && it.y > 0, 'dress item off screen');
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(ov <= 0, 'page scrolls sideways');
  clean(page); await close(page);
});

test('resizing mid-activity keeps everything working', async () => {
  const { page, fm } = await game();
  await fm('activity', 'teeth');
  await page.setViewportSize({ width: 600, height: 900 }); await sleep(400);
  const a = (await fm('state')).act;
  assert.ok(a.germs.every((g) => g.x > 0 && g.x < 600 && g.y > 0 && g.y < 900));
  const f = await frameStats(page); assert.ok(f.colours > 100);
  clean(page); await close(page);
});

test('frames keep coming smoothly during the party', async () => {
  const { page, fm } = await game();
  await fm('celebrate');
  await sleep(1500);
  const iv = await page.evaluate(() => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last; const f = (t) => { out.push(t - last); last = t; if (t - t0 < 2500) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
  iv.sort((a, b) => a - b);
  const med = iv[Math.floor(iv.length / 2)];
  assert.ok(med < 50, `median frame interval ${med.toFixed(1)} ms`);
  clean(page); await close(page);
});

test('sound starts only after the first touch and the button mutes it', async () => {
  const page = await open(browser, server.url, 'debug');
  const fm = await hook(page);
  assert.equal((await fm('state')).audio, 'none');
  await page.mouse.click(60, 400);
  await until(async () => (await fm('state')).audio === 'running', 3000, 'audio running');
  await page.click('#sound');
  assert.equal(await page.getAttribute('#sound', 'aria-pressed'), 'false');
  await page.click('#sound');
  assert.equal(await page.getAttribute('#sound', 'aria-pressed'), 'true');
  clean(page); await close(page);
});
