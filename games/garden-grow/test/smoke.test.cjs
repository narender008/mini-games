// Browser smoke tests: the page loads clean and offline, draws a detailed
// moving garden, real mouse clicks and finger taps plant, water and bloom,
// visitors answer taps, music starts on the first touch and the sound button
// mutes it, the party comes and goes, phones and resizes work, and frames
// keep coming.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { serve } = require('./lib/server.cjs');
const { launch, open, close, hook, frameStats, frameDiff } = require('./lib/browser.cjs');

let server, browser;
before(async () => { server = await serve(process.env.GG_ROOT); browser = await launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const clean = (page) => assert.deepEqual(page.problems, [], `page reported problems:\n${page.problems.join('\n')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, what = 'condition') { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await sleep(50); } throw new Error(`timed out waiting for ${what}`); }

// A game in play without surprise visitors, so a test controls what happens.
async function quiet(query = 'debug&play&seed=3', opts) {
  const page = await open(browser, server.url, query, opts);
  const gg = await hook(page);
  await gg('quiet');
  return { page, gg };
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
  assert.ok(s.std > 20 && s.colours > 200, `frame looks blank or flat: ${JSON.stringify(s)}`);
  const a = await page.screenshot(); await sleep(700); const b = await page.screenshot();
  assert.ok(await frameDiff(page, a, b) > 0.005, 'nothing moves on the title');
  await close(page);
});

test('a click anywhere on the title starts the game with empty soil', async () => {
  const page = await open(browser, server.url, 'debug');
  const gg = await hook(page);
  assert.equal((await gg('state')).phase, 'title');
  await page.mouse.click(300, 200);
  const s = await gg('state');
  assert.equal(s.phase, 'play');
  assert.ok(s.stages.every((x) => x === 0));
  clean(page); await close(page);
});

test('mouse: click the soil, the sprout and the bud, and a flower blooms', async () => {
  const { page, gg } = await quiet();
  let s = await gg('state');
  const p = s.patches[2];
  await page.mouse.click(p.x, p.y);
  await until(async () => (await gg('state')).stages[2] === 2, 3000, 'a sprout');
  s = await gg('state');
  await page.mouse.click(s.patches[2].head.x, s.patches[2].head.y);
  await until(async () => (await gg('state')).cans === 1, 1000, 'the watering can');
  await until(async () => (await gg('state')).stages[2] === 3, 3000, 'a bud');
  await sleep(400);
  s = await gg('state');
  await page.mouse.click(s.patches[2].head.x, s.patches[2].head.y);
  s = await gg('state');
  assert.equal(s.stages[2], 4);
  assert.ok(s.particles > 20, 'the bloom made no sparkle');
  clean(page); await close(page);
});

test('touch: a finger tap plants, and a finger tap on a visitor makes it play (tablet)', async () => {
  const { page, gg } = await quiet('debug&play&seed=3', { width: 1024, height: 768, touch: true });
  const s = await gg('state');
  await page.touchscreen.tap(s.patches[0].x, s.patches[0].y);
  assert.equal((await gg('state')).stages[0], 1);
  const frog = s.creatures.find((c) => c.kind === 'frog');
  await page.touchscreen.tap(frog.x, frog.y - 18);
  assert.equal((await gg('state')).creatures.find((c) => c.kind === 'frog').s, 'jump');
  clean(page); await close(page);
});

test('the two big buttons plant everything and water everything', async () => {
  const { page, gg } = await quiet();
  let s = await gg('state');
  await page.mouse.click(s.buttons.seed.x, s.buttons.seed.y);
  await gg('step', 1800);
  s = await gg('state');
  assert.ok(s.stages.every((x) => x === 2), `stages ${s.stages}`);
  await page.mouse.click(s.buttons.can.x, s.buttons.can.y);
  await until(async () => (await gg('state')).cans === s.stages.length, 2000, 'a watering can for every sprout');
  await gg('step', 3500);
  assert.ok((await gg('state')).stages.every((x) => x === 3));
  clean(page); await close(page);
});

test('the sun, a cloud, an apple, a mushroom and the grass all answer a tap', async () => {
  const { page, gg } = await quiet();
  const s = await gg('state');
  assert.equal(await gg('tap', s.sun.x, s.sun.y), 'sun');
  assert.equal(await gg('tap', s.clouds[0].x, s.clouds[0].y), 'cloud');
  assert.equal((await gg('state')).raining, true);
  assert.equal(await gg('tap', s.appleSpots[1].x, s.appleSpots[1].y), 'apple');
  assert.equal(await gg('tap', s.mushrooms[0].x, s.mushrooms[0].y - 15), 'mushroom');
  await page.mouse.click(s.W * 0.27, s.H * 0.62);
  assert.equal((await gg('state')).wild, 1);
  await gg('step', 4000);
  assert.equal((await gg('state')).rainbow, true);
  const f = await frameStats(page); assert.ok(f.colours > 200);
  clean(page); await close(page);
});

test('music only starts after the first touch, keeps playing, and the sound button mutes it (and remembers)', async () => {
  const page = await open(browser, server.url, 'debug');
  const gg = await hook(page);
  let a = (await gg('state')).audio;
  assert.equal(a.context, 'none', 'audio started before any touch');
  await page.mouse.click(640, 300);
  a = await until(async () => { const x = (await gg('state')).audio; return x.context === 'running' && x.music ? x : null; }, 3000, 'running music');
  const n0 = a.notes, s0 = a.step; await sleep(2500);
  a = (await gg('state')).audio;
  assert.ok(a.step > s0 + 6 && a.notes > n0 + 2, `music moved on only ${a.step - s0} steps (${a.notes - n0} notes) in 2.5 s`);
  const st = await gg('state');
  const fx0 = a.sfx;
  await page.mouse.click(st.patches[0].x, st.patches[0].y);
  await until(async () => (await gg('state')).audio.sfx > fx0, 2000, 'a planting sound');
  await page.click('#sound');
  assert.equal((await gg('state')).audio.muted, true);
  assert.equal(await page.getAttribute('#sound', 'aria-pressed'), 'false');
  await page.reload(); const gg2 = await hook(page);
  assert.equal((await gg2('state')).audio.muted, true);
  await page.click('#sound');
  assert.equal((await gg2('state')).audio.muted, false);
  clean(page); await close(page);
});

test('a full garden throws a party, then starts again', async () => {
  const { page, gg } = await quiet();
  await gg('fill');
  assert.equal((await gg('state')).phase, 'party');
  await gg('step', 2500);
  const s = await frameStats(page);
  assert.ok(s.colours > 250, 'party frame looks flat');
  await gg('step', 9000);
  const st = await gg('state');
  assert.equal(st.phase, 'play'); assert.equal(st.round, 1); assert.ok(st.stages.every((x) => x === 0));
  clean(page); await close(page);
});

test('the hint hand appears when nobody plays', async () => {
  const { page, gg } = await quiet();
  await gg('step', 6500);
  assert.ok((await gg('state')).hint);
  await page.mouse.click(640, 200);
  assert.equal((await gg('state')).hint, null);
  await close(page);
});

test('on a phone held upright everything is big, on screen and tappable', async () => {
  const page = await open(browser, server.url, 'debug&play&seed=4', { width: 390, height: 844, touch: true, mobile: true, scale: 3 });
  const gg = await hook(page);
  const s = await gg('state');
  assert.equal(s.patches.length, 4);
  for (const b of Object.values(s.buttons)) assert.ok(b.r >= 32 && b.y + b.r <= 844);
  await page.touchscreen.tap(s.patches[3].x, s.patches[3].y);
  assert.equal((await gg('state')).stages[3], 1);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(ov <= 0, 'page scrolls sideways');
  const f = await frameStats(page); assert.ok(f.colours > 150);
  clean(page); await close(page);
});

test('resizing and turning the screen mid-game keeps everything working', async () => {
  const { page, gg } = await quiet();
  await gg('button', 'seed');
  await page.setViewportSize({ width: 600, height: 900 }); await sleep(300);
  let s = await gg('state');
  assert.equal(s.portrait, true); assert.equal(s.patches.length, 4);
  await page.mouse.click(s.patches[0].head.x, s.patches[0].head.y - 10);
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(300);
  s = await gg('state');
  assert.equal(s.patches.length, 5);
  await page.mouse.click(s.patches[4].x, s.patches[4].y);
  const f = await frameStats(page); assert.ok(f.colours > 150);
  clean(page); await close(page);
});

test('frames keep coming smoothly during a busy party', async () => {
  const page = await open(browser, server.url, 'debug&play');
  const gg = await hook(page);
  await gg('rain');
  await gg('fill');
  for (let i = 0; i < 4; i++) await gg('spawn', 'butterfly');
  const iv = await page.evaluate(() => new Promise((res) => { const out = []; let last = performance.now(); const t0 = last; const f = (t) => { out.push(t - last); last = t; if (t - t0 < 2500) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
  iv.sort((a, b) => a - b);
  const med = iv[Math.floor(iv.length / 2)];
  assert.ok(med < 50, `median frame interval ${med.toFixed(1)} ms`);
  clean(page); await close(page);
});
