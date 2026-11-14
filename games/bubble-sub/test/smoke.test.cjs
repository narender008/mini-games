// Browser smoke tests: the page loads clean and offline, draws a detailed
// moving picture, a real mouse and a real finger steer the sub and tickle
// friends, the music and engine start on the first touch and the sound button
// mutes them, the Glow Cave gets dark with the headlight on, the party comes
// and goes, and phones, resizes and busy frames all work.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats, frameDiff } = require('./lib/browser.cjs');

let server, browser;
before(async () => { server = await serve(process.env.BS_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, what = 'condition') { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(50); } throw new Error(`timed out waiting for ${what}`); }
// A screen point over open water (no friend, fish or sub), for steering taps.
const openWater = (page, x, y) => page.evaluate(([x, y]) => {
  const s = __bs.sim, S = __bs.S, U = __bs.state().layout.U;
  for (let r = 0; r < 500; r += 15) for (let a = 0; a < 6.28; a += 0.4) {
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.6, w = S.toWorld(s, px / U, py / U);
    if (w.y < S.SURFACE + 150 || w.y > S.floorY(s.VH, w.x) - 120) continue;
    if (S.hitCreature(s, w.x, w.y) || S.hitSub(s, w.x, w.y)) continue;
    if (s.schools.some(f => f.fish.some(fi => Math.hypot(w.x - (f.x + fi.ox + fi.sx), w.y - (f.y + fi.oy + fi.sy)) < 70))) continue;
    return { x: px, y: py };
  }
  return null;
}, [x, y]);

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
  assert.ok(s.std > 20 && s.colours > 200, `frame looks blank or flat: ${JSON.stringify(s)}`);
  const a = await page.screenshot(); await sleep(700); const b = await page.screenshot();
  assert.ok(await frameDiff(page, a, b) > 0.01, 'nothing moves on the title');
  await close(page);
});

test('a click anywhere on the title starts the game and shows the friend shelf', async () => {
  const page = await open(browser, server.url, 'debug');
  const js = await hook(page);
  assert.equal((await js('state')).phase, 'title');
  await page.mouse.click(200, 600);
  await until(async () => (await js('state')).phase === 'play', 2000, 'play');
  clean(page); await close(page);
});

test('a mouse click on open water sends the sub there; holding and dragging steers it', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const js = await hook(page);
  const sub0 = await js('subScreen');
  const p = await openWater(page, sub0.x + 450, 250);
  assert.ok(p, 'no open water found');
  const st0 = await js('state'), wx = p.x / st0.layout.U + st0.cam, wy = p.y / st0.layout.U;
  await page.mouse.click(p.x, p.y);
  await until(async () => { const s = (await js('state')).sub; return Math.hypot(s.x - wx, s.y - wy) < 50; }, 5000, 'the sub to arrive');
  // hold and drag down-left: the sub turns and follows the finger
  const q = await openWater(page, 300, 450);
  await page.mouse.move(q.x, q.y); await page.mouse.down();
  for (let i = 0; i < 25; i++) { await page.mouse.move(q.x - i * 4, q.y + i * 2); await sleep(40); }
  await sleep(1500);
  const st = await js('state'); await page.mouse.up();
  assert.equal(st.sub.face, -1, 'sub did not turn round');
  clean(page); await close(page);
});

test('a finger tap on a friend makes it giggle and puts it on the shelf (touch)', async () => {
  const page = await open(browser, server.url, 'debug&play', { width: 1024, height: 768, touch: true });
  const js = await hook(page);
  await js('goto', 400, 0.3); await js('step', 200); await js('freeze');
  const o = await js('screenOf', 'octopus');
  assert.ok(o && o.x > 0 && o.x < 1024, `octopus not on screen: ${JSON.stringify(o)}`);
  await page.touchscreen.tap(o.x, o.y);
  await js('thaw');
  const st = await js('state');
  assert.deepEqual(st.found, ['octopus']);
  assert.ok(st.fx > 5, 'no bubbles or hearts');
  clean(page); await close(page);
});

test('a finger drag steers the sub (touch)', async () => {
  const page = await open(browser, server.url, 'debug&play', { width: 1024, height: 768, touch: true });
  const js = await hook(page);
  const x0 = (await js('state')).sub.x;
  const p = await openWater(page, 800, 300);
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 10, radiusY: 10, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(p.x, p.y) });
  // keep the finger down and wiggling until the sub has come over (slow CI
  // machines step the game more slowly than the wall clock)
  let st, i = 0; const t0 = Date.now();
  do { i++; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p.x + Math.min(i, 30), p.y) }); await sleep(50); st = await js('state'); }
  while (st.sub.x <= x0 + 120 && Date.now() - t0 < 8000);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(st.sub.x > x0 + 120, `sub only moved from ${x0} to ${st.sub.x}`);
  assert.equal(st.sub.face, 1, 'sub did not face the finger');
  clean(page); await close(page);
});

test('tapping the sub honks its horn', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const js = await hook(page);
  await js('freeze');
  const s = await js('subScreen');
  await page.mouse.click(s.x, s.y);
  await js('thaw');
  const st = await page.evaluate(() => __bs.sim.sub.honkT);
  assert.ok(st > 0.5, 'no honk');
  clean(page); await close(page);
});

test('sound only starts after the first touch, the music and engine run, and the sound button mutes (and remembers)', async () => {
  const page = await open(browser, server.url, 'debug');
  const js = await hook(page);
  let a = (await js('state')).audio;
  assert.equal(a.context, 'none', 'audio started before any touch');
  await page.mouse.click(640, 600);
  a = await until(async () => { const x = (await js('state')).audio; return x.context === 'running' && x.music ? x : null; }, 3000, 'running music');
  const n0 = a.notes, s0 = a.step; await sleep(2500);
  a = (await js('state')).audio;
  assert.ok(a.step > s0 + 6 && a.notes > n0 + 2, `music moved on only ${a.step - s0} beats (${a.notes - n0} notes) in 2.5 s`);
  await page.click('#sound');
  assert.equal((await js('state')).audio.muted, true);
  assert.equal(await page.getAttribute('#sound', 'aria-pressed'), 'false');
  await page.reload(); const js2 = await hook(page);
  assert.equal((await js2('state')).audio.muted, true);
  await page.click('#sound');
  assert.equal((await js2('state')).audio.muted, false);
  clean(page); await close(page);
});

test('the Glow Cave is dark with the headlight on, and the music turns dreamy', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const js = await hook(page);
  await page.mouse.click(5, 700);  // unlock audio
  const bright = await frameStats(page);
  await js('goto', 5300, 0.5); await js('step', 1500);
  const st = await js('state');
  assert.equal(st.zone, 'cave'); assert.ok(st.dark > 0.95);
  await until(async () => (await js('state')).audio.depth > 0.9, 2000, 'cave music');
  const dark = await frameStats(page);
  assert.ok(dark.mean < bright.mean - 25, `cave not darker: ${dark.mean} vs ${bright.mean}`);
  assert.ok(dark.colours > 150, 'cave frame looks flat');
  // the treasure chest opens when the sub drives to it
  await page.evaluate(() => { const c = __bs.sim.chest; __bs.goto(c.x - 60, (c.y - 120) / __bs.sim.VH); });
  await js('step', 300);
  assert.equal((await js('state')).chest, true);
  clean(page); await close(page);
});

test('finding all ten friends throws a party, then a new round starts', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const js = await hook(page);
  await js('findAll');
  await js('step', 1500);
  let st = await js('state');
  assert.equal(st.phase, 'party');
  const f = await frameStats(page);
  assert.ok(f.colours > 250, 'party frame looks flat');
  await js('step', 9000);
  st = await js('state');
  assert.equal(st.phase, 'play'); assert.equal(st.found.length, 0); assert.equal(st.rounds, 1);
  clean(page); await close(page);
});

test('the hint appears when nobody plays and goes away on a touch', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const js = await hook(page);
  await js('step', 7000);
  assert.equal((await js('state')).hint, true);
  await page.mouse.click(5, 700);
  assert.equal((await js('state')).hint, false);
  await close(page);
});

test('on a phone held upright everything fits and the sub is big', async () => {
  const page = await open(browser, server.url, 'debug&play', { width: 390, height: 844, touch: true, mobile: true, scale: 3 });
  const js = await hook(page);
  await sleep(500);
  const s = await js('subScreen'), st = await js('state');
  assert.ok(s.x > 0 && s.x < 390 && s.y > 0 && s.y < 844, 'sub off screen');
  assert.ok(st.layout.U * 92 >= 50, `sub too small: ${st.layout.U * 92}px`);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(ov <= 0, 'page scrolls sideways');
  const f = await frameStats(page); assert.ok(f.colours > 150);
  clean(page); await close(page);
});

test('resizing and turning the screen mid-game keeps everything working', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const js = await hook(page);
  await js('goto', 2500, 0.4);
  await page.setViewportSize({ width: 600, height: 900 }); await sleep(400);
  let s = await js('subScreen');
  assert.ok(s.x > 0 && s.x < 600 && s.y > 0 && s.y < 900, `sub off screen after resize: ${JSON.stringify(s)}`);
  await page.setViewportSize({ width: 1280, height: 600 }); await sleep(400);
  s = await js('subScreen');
  assert.ok(s.x > 0 && s.x < 1280 && s.y > 0 && s.y < 600, 'sub off screen after second resize');
  const f = await frameStats(page); assert.ok(f.colours > 150);
  clean(page); await close(page);
});

test('frames keep coming smoothly during busy play', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const js = await hook(page);
  await js('bakeAll'); await js('findAll'); await js('step', 500);
  const iv = await page.evaluate(() => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last; const f = (t) => { out.push(t - last); last = t; if (t - t0 < 2500) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
  iv.sort((a, b) => a - b);
  const med = iv[Math.floor(iv.length / 2)];
  assert.ok(med < 50, `median frame interval ${med.toFixed(1)} ms`);
  clean(page); await close(page);
});
